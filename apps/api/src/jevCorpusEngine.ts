import { createHash } from "node:crypto";
import {
  evaluatePredicate,
  evaluateRankingEntry,
  ruleAstSchema,
  type RuleAst,
} from "@tyche/rule-compiler";

/**
 * Offline benchmark machinery for the Jev rollout (docs/jev-guarded-rollout.md).
 *
 * It builds the blind corpus the offline phase needs: deterministic scenarios,
 * a behavioral signature per AST, generic semantic mutations, and behaviorally
 * equivalent alternatives. Nothing here can authorize, freeze, or settle a rule
 * — it only produces candidates for a reviewer to judge and the oracle used to
 * score that judgment afterwards.
 *
 * Every mutation is verified to actually change behavior, and every "equivalent"
 * alternative is verified to change none, both against the same 204 scenarios.
 * A corpus that cannot prove this about one of its own candidates rejects that
 * candidate rather than shipping an unlabeled one.
 */

/** Four curated scenarios plus 200 deterministic ones, per PRD §7.3.2 rollout. */
export const CURATED_SCENARIOS = 4;
export const DETERMINISTIC_SCENARIOS = 200;
export const TOTAL_SCENARIOS = CURATED_SCENARIOS + DETERMINISTIC_SCENARIOS;

/** Competing tickets a ranking rule needs before "wins" means anything. */
const RANKING_OPPONENTS = 3;
const TICKET_SIZE = 6;
const MAX_NUMBER = 100;

export interface BenchmarkScenario {
  draw: number[];
  /** Target ticket first; ranking rules also score the opponents. */
  entries: Record<string, number[]>;
  id: string;
  targetPlayer: string;
}

export type MutationOperator =
  | "arith_operator"
  | "boolean_composition"
  | "clause_omission"
  | "comparator_strictness"
  | "multiple_defects"
  | "order"
  | "ranking_direction"
  | "ranking_eligibility"
  | "reduce_operator"
  | "set_operator"
  | "source_swap"
  | "threshold";

export interface CorpusCandidate {
  ast: RuleAst;
  candidateId: string;
  /** True only for the reference AST and verified equivalent alternatives. */
  correct: boolean;
  /** Set when the description shown to a reviewer is deliberately stale. */
  describeFromAst?: RuleAst;
  label: "correct" | "equivalent" | "serializer_divergence" | MutationOperator;
  mutationNote: string | null;
}

// ---------------------------------------------------------------------------
// Deterministic scenarios
// ---------------------------------------------------------------------------

/** Small, explicit PRNG so a corpus rebuilt on any machine is byte-identical. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let drafted = Math.imul(state ^ (state >>> 15), 1 | state);
    drafted =
      (drafted + Math.imul(drafted ^ (drafted >>> 7), 61 | drafted)) ^ drafted;
    return ((drafted ^ (drafted >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFromId(id: string): number {
  return createHash("sha256").update(id).digest().readUInt32BE(0);
}

function drawTicket(random: () => number): number[] {
  const picked = new Set<number>();
  while (picked.size < TICKET_SIZE) {
    picked.add(1 + Math.floor(random() * MAX_NUMBER));
  }
  return [...picked];
}

/**
 * Scenarios are generated per proposal, not per candidate, so the reference AST
 * and every mutant are judged on exactly the same inputs. Half the scenarios
 * force overlap between guess and draw; uniform random tickets almost never
 * share a number, and a corpus of near-certain losses cannot separate a correct
 * AST from a mutated one.
 */
export function buildScenarios(
  proposalId: string,
  curated: readonly BenchmarkScenario[] = [],
): BenchmarkScenario[] {
  const random = mulberry32(seedFromId(proposalId));
  const scenarios: BenchmarkScenario[] = curated
    .slice(0, CURATED_SCENARIOS)
    .map((scenario, index) => ({ ...scenario, id: `curated-${index + 1}` }));
  for (let index = scenarios.length; index < CURATED_SCENARIOS; index += 1) {
    const draw = drawTicket(random);
    scenarios.push({
      draw,
      entries: { "player-A": drawTicket(random) },
      id: `curated-${index + 1}`,
      targetPlayer: "player-A",
    });
  }
  for (let index = 0; index < DETERMINISTIC_SCENARIOS; index += 1) {
    const draw = drawTicket(random);
    const forcedOverlap = index % 2 === 0;
    const guess = forcedOverlap
      ? [...draw.slice(0, 1 + Math.floor(random() * 5)), ...drawTicket(random)]
          .filter((value, position, all) => all.indexOf(value) === position)
          .slice(0, TICKET_SIZE)
      : drawTicket(random);
    const entries: Record<string, number[]> = { "player-A": guess };
    for (let opponent = 0; opponent < RANKING_OPPONENTS; opponent += 1) {
      // Opponents overlap the draw too. Ranking rules with an eligibility gate
      // are meaningless when only the target ticket can ever qualify: the
      // comparison that the rule is about would never actually happen.
      const rival =
        random() < 0.5
          ? [
              ...draw.slice(0, 1 + Math.floor(random() * 5)),
              ...drawTicket(random),
            ]
              .filter((value, position, all) => all.indexOf(value) === position)
              .slice(0, TICKET_SIZE)
          : drawTicket(random);
      entries[`player-${String.fromCodePoint(66 + opponent)}`] = rival;
    }
    scenarios.push({
      draw,
      entries,
      id: `scenario-${index + 1}`,
      targetPlayer: "player-A",
    });
  }
  return scenarios;
}

// ---------------------------------------------------------------------------
// Behavioral signature — the oracle
// ---------------------------------------------------------------------------

export function evaluateScenario(
  ast: RuleAst,
  scenario: BenchmarkScenario,
): boolean {
  const guess = scenario.entries[scenario.targetPlayer];
  if (!guess) throw new Error(`Scenario ${scenario.id} has no target ticket`);
  if (ast.schemaVersion === 1 || ast.result.type === "predicate") {
    return (
      evaluatePredicate(ast, { draw: scenario.draw, guess }).result === "WIN"
    );
  }
  const scored = Object.entries(scenario.entries).map(([player, ticket]) => ({
    player,
    ...evaluateRankingEntry(ast, { draw: scenario.draw, guess: ticket }),
  }));
  const eligible = scored.filter((entry) => entry.eligible);
  if (eligible.length === 0) return false;
  const scores = eligible.map((entry) => entry.score);
  const best =
    ast.result.direction === "min" ? Math.min(...scores) : Math.max(...scores);
  return eligible.some(
    (entry) => entry.player === scenario.targetPlayer && entry.score === best,
  );
}

export interface BehaviorSignature {
  /** Stable hash of the outcome vector, for cheap equality. */
  digest: string;
  outcomes: boolean[];
  wins: number;
}

/**
 * A runtime error is not a signature. Swallowing it would let a mutant that
 * crashes masquerade as behaviorally different from the reference.
 */
export function behaviorSignature(
  ast: RuleAst,
  scenarios: readonly BenchmarkScenario[],
): BehaviorSignature | null {
  const outcomes: boolean[] = [];
  for (const scenario of scenarios) {
    try {
      outcomes.push(evaluateScenario(ast, scenario));
    } catch {
      return null;
    }
  }
  return {
    digest: createHash("sha256")
      .update(outcomes.map((outcome) => (outcome ? "1" : "0")).join(""))
      .digest("hex"),
    outcomes,
    wins: outcomes.filter(Boolean).length,
  };
}

// ---------------------------------------------------------------------------
// Generic AST mutation
// ---------------------------------------------------------------------------

type MutableNode = Record<string, unknown>;

/** Every object node in the AST, with the parent slot needed to replace it. */
function collectNodes(
  root: unknown,
): { node: MutableNode; path: string; replace: (value: unknown) => void }[] {
  const found: {
    node: MutableNode;
    path: string;
    replace: (value: unknown) => void;
  }[] = [];
  const visit = (
    value: unknown,
    path: string,
    replace: (next: unknown) => void,
  ) => {
    if (!value || typeof value !== "object") return;
    if (Array.isArray(value)) {
      value.forEach((child, index) =>
        visit(child, `${path}[${index}]`, (next) => {
          value[index] = next;
        }),
      );
      return;
    }
    const node = value as MutableNode;
    if (typeof node.kind === "string") found.push({ node, path, replace });
    for (const key of Object.keys(node)) {
      visit(node[key], `${path}.${key}`, (next) => {
        node[key] = next;
      });
    }
  };
  visit(root, "ast", () => {
    throw new Error("The AST root cannot be replaced");
  });
  return found;
}

const COMPARE_OPS = ["eq", "gt", "gte", "lt", "lte", "neq"] as const;
const REDUCE_OPS = [
  "count",
  "max",
  "min",
  "product",
  "range_span",
  "sum",
] as const;
/** Both take two arrays and return one, so either can stand where the other does. */
const SET_OPS = ["difference", "intersection"] as const;
const ARITH_OPS = ["add", "div", "mod", "mul", "sub"] as const;

/**
 * A threshold defect is off by an amount proportional to the threshold. On a
 * match count, ±1 is the whole defect; on a sum near 300 it changes no outcome
 * at all, so a fixed ±1 would silently yield zero usable mutations for every
 * rule that compares sums.
 */
function thresholdDeltas(value: number): number[] {
  const magnitude = Math.abs(value);
  const scaled =
    magnitude >= 20
      ? [
          Math.round(magnitude * 0.1),
          Math.round(magnitude * 0.25),
          Math.round(magnitude * 0.5),
        ]
      : [];
  return [...new Set([1, 2, ...scaled])].flatMap((step) => [-step, step]);
}

interface MutationDraft {
  ast: RuleAst;
  note: string;
  operator: MutationOperator;
}

/**
 * Enumerates every defect this AST shape can express, one dimension at a time.
 *
 * A simple rule such as "at least three matches" has only four mutable sites, so
 * a thin operator set cannot produce six distinct defects for it. The operators
 * below therefore include the substitutions that a real compiler defect actually
 * looks like — a swapped reducer, a set operation inverted, a threshold off by
 * more than one — and not only the structural edits. The caller still filters
 * every draft by behavior, so an operator that is a no-op on this shape is
 * discarded rather than counted.
 */
function enumerateSingleMutations(reference: RuleAst): MutationDraft[] {
  const drafts: MutationDraft[] = [];
  const attempt = (
    operator: MutationOperator,
    note: string,
    mutate: (sites: ReturnType<typeof collectNodes>) => boolean,
  ) => {
    const copy = structuredClone(reference) as unknown as MutableNode;
    if (!mutate(collectNodes(copy))) return;
    const parsed = ruleAstSchema.safeParse(copy);
    if (parsed.success) drafts.push({ ast: parsed.data, note, operator });
  };

  const sites = collectNodes(structuredClone(reference)).length;
  for (let index = 0; index < sites; index += 1) {
    const literalValue = collectNodes(structuredClone(reference))[index]?.node;
    const deltas =
      literalValue?.kind === "lit" && typeof literalValue.value === "number"
        ? thresholdDeltas(literalValue.value)
        : [];
    for (const delta of deltas) {
      attempt(
        "threshold",
        `literal #${index + 1} shifted by ${delta > 0 ? `+${delta}` : delta}`,
        (nodes) => {
          const site = nodes[index];
          if (!site || site.node.kind !== "lit") return false;
          const current = site.node.value;
          if (typeof current !== "number") return false;
          site.node.value = current + delta;
          return true;
        },
      );
    }
    for (const op of COMPARE_OPS) {
      attempt(
        "comparator_strictness",
        `comparator #${index + 1} changed to ${op}`,
        (nodes) => {
          const site = nodes[index];
          if (!site || site.node.kind !== "compare" || site.node.op === op)
            return false;
          site.node.op = op;
          return true;
        },
      );
    }
    for (const op of ARITH_OPS) {
      attempt(
        "arith_operator",
        `arithmetic #${index + 1} changed to ${op}`,
        (nodes) => {
          const site = nodes[index];
          if (!site || site.node.kind !== "arith" || site.node.op === op)
            return false;
          site.node.op = op;
          return true;
        },
      );
    }
    for (const op of REDUCE_OPS) {
      attempt(
        "reduce_operator",
        `reduction #${index + 1} changed to ${op}`,
        (nodes) => {
          const site = nodes[index];
          if (!site || site.node.kind !== "reduce" || site.node.op === op)
            return false;
          site.node.op = op;
          return true;
        },
      );
    }
    for (const kind of SET_OPS) {
      attempt(
        "set_operator",
        `set operation #${index + 1} changed to ${kind}`,
        (nodes) => {
          const site = nodes[index];
          if (
            !site ||
            typeof site.node.kind !== "string" ||
            !SET_OPS.includes(site.node.kind as (typeof SET_OPS)[number]) ||
            site.node.kind === kind
          )
            return false;
          site.node.kind = kind;
          return true;
        },
      );
    }
    attempt("source_swap", `source #${index + 1} swapped`, (nodes) => {
      const site = nodes[index];
      if (!site || site.node.kind !== "source") return false;
      site.node.source = site.node.source === "guess" ? "draw" : "guess";
      return true;
    });
    attempt(
      "boolean_composition",
      `connective #${index + 1} swapped`,
      (nodes) => {
        const site = nodes[index];
        if (!site) return false;
        if (site.node.kind === "and") site.node.kind = "or";
        else if (site.node.kind === "or") site.node.kind = "and";
        else if (site.node.kind === "not") {
          site.replace(site.node.clause);
          return true;
        } else return false;
        return true;
      },
    );
    attempt("clause_omission", `clause dropped at #${index + 1}`, (nodes) => {
      const site = nodes[index];
      if (!site) return false;
      const clauses = site.node.clauses;
      if (!Array.isArray(clauses) || clauses.length < 2) return false;
      site.replace(
        clauses.length === 2
          ? clauses[0]
          : { ...site.node, clauses: clauses.slice(0, -1) },
      );
      return true;
    });
    attempt("order", `array #${index + 1} order reversed`, (nodes) => {
      const site = nodes[index];
      if (!site) return false;
      if (site.node.kind === "at") {
        const current = site.node.index;
        if (typeof current !== "number") return false;
        site.node.index = current === 0 ? 1 : 0;
        return true;
      }
      if (site.node.kind !== "source") return false;
      site.replace({ kind: "reverse", of: structuredClone(site.node) });
      return true;
    });
  }

  const ranking = structuredClone(reference) as unknown as MutableNode;
  const result = ranking.result as MutableNode | undefined;
  if (result?.type === "ranking") {
    const flipped = structuredClone(ranking);
    const flippedResult = flipped.result as MutableNode;
    flippedResult.direction = flippedResult.direction === "min" ? "max" : "min";
    const parsedFlip = ruleAstSchema.safeParse(flipped);
    if (parsedFlip.success) {
      drafts.push({
        ast: parsedFlip.data,
        note: "ranking direction inverted",
        operator: "ranking_direction",
      });
    }
    if (result.eligibleWhen !== undefined) {
      const dropped = structuredClone(ranking);
      delete (dropped.result as MutableNode).eligibleWhen;
      const parsedDrop = ruleAstSchema.safeParse(dropped);
      if (parsedDrop.success) {
        drafts.push({
          ast: parsedDrop.data,
          note: "eligibility gate removed",
          operator: "ranking_eligibility",
        });
      }
    }
  }
  return drafts;
}

function isSameAst(left: RuleAst, right: RuleAst): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

export interface MutationSelection {
  mutations: { ast: RuleAst; note: string; operator: MutationOperator }[];
  /** Operators this AST shape simply cannot express. Reported, never hidden. */
  unavailableOperators: MutationOperator[];
}

/**
 * Picks `count` behaviorally distinct mutants, preferring operator diversity so
 * a rule is not represented by six variations of the same defect. The last slot
 * is reserved for a multi-defect mutant when two single mutations can be
 * combined, because a reviewer that catches one defect per AST is not yet shown
 * to catch two.
 */
export function selectMutations(
  reference: RuleAst,
  scenarios: readonly BenchmarkScenario[],
  count: number,
): MutationSelection {
  const referenceSignature = behaviorSignature(reference, scenarios);
  if (!referenceSignature) {
    throw new Error("The reference AST does not evaluate on its own scenarios");
  }
  const viable = enumerateSingleMutations(reference).filter((draft) => {
    if (isSameAst(draft.ast, reference)) return false;
    const signature = behaviorSignature(draft.ast, scenarios);
    return signature !== null && signature.digest !== referenceSignature.digest;
  });

  const byOperator = new Map<MutationOperator, MutationDraft[]>();
  for (const draft of viable) {
    byOperator.set(draft.operator, [
      ...(byOperator.get(draft.operator) ?? []),
      draft,
    ]);
  }
  const selected: MutationDraft[] = [];
  const seenDigests = new Set<string>();
  // Round-robin across operators: take one of each before taking a second.
  for (let round = 0; selected.length < count && round < 40; round += 1) {
    let progressed = false;
    for (const operator of [...byOperator.keys()].sort()) {
      if (selected.length >= count) break;
      const draft = (byOperator.get(operator) ?? [])[round];
      if (!draft) continue;
      const digest = behaviorSignature(draft.ast, scenarios)?.digest;
      if (!digest || seenDigests.has(digest)) continue;
      seenDigests.add(digest);
      selected.push(draft);
      progressed = true;
    }
    if (!progressed) break;
  }

  if (selected.length >= 2 && selected.length < count) {
    const [first, second] = selected;
    if (first && second) {
      const combined = enumerateSingleMutations(first.ast).find((draft) => {
        if (draft.operator === first.operator) return false;
        const signature = behaviorSignature(draft.ast, scenarios);
        return (
          signature !== null &&
          signature.digest !== referenceSignature.digest &&
          !seenDigests.has(signature.digest)
        );
      });
      if (combined) {
        selected.push({
          ast: combined.ast,
          note: `${first.note}; then ${combined.note}`,
          operator: "multiple_defects",
        });
      }
    }
  }

  const available = new Set(viable.map((draft) => draft.operator));
  const everyOperator: MutationOperator[] = [
    "arith_operator",
    "boolean_composition",
    "clause_omission",
    "comparator_strictness",
    "order",
    "ranking_direction",
    "ranking_eligibility",
    "reduce_operator",
    "set_operator",
    "source_swap",
    "threshold",
  ];
  return {
    mutations: selected.slice(0, count),
    unavailableOperators: everyOperator.filter(
      (operator) => !available.has(operator),
    ),
  };
}

// ---------------------------------------------------------------------------
// Behaviorally equivalent alternatives
// ---------------------------------------------------------------------------

/**
 * A reviewer must accept a correct rule written a different way, so at least a
 * third of the corpus carries one. Equivalence is proven on the scenarios, not
 * asserted from the rewrite rule that produced it.
 */
export function buildEquivalentAlternative(
  reference: RuleAst,
  scenarios: readonly BenchmarkScenario[],
): { ast: RuleAst; note: string } | null {
  const referenceSignature = behaviorSignature(reference, scenarios);
  if (!referenceSignature) return null;
  const drafts: { ast: unknown; note: string }[] = [];

  // `>= k` is `> k - 1` over integers, and vice versa.
  const relaxed = structuredClone(reference) as unknown as MutableNode;
  const relaxedSites = collectNodes(relaxed);
  for (const site of relaxedSites) {
    if (site.node.kind !== "compare") continue;
    const right = site.node.right as MutableNode | undefined;
    if (!right || right.kind !== "lit" || typeof right.value !== "number")
      continue;
    if (site.node.op === "gte") {
      site.node.op = "gt";
      right.value -= 1;
      drafts.push({
        ast: relaxed,
        note: "at least k written as more than k-1",
      });
      break;
    }
    if (site.node.op === "lte") {
      site.node.op = "lt";
      right.value += 1;
      drafts.push({
        ast: relaxed,
        note: "at most k written as fewer than k+1",
      });
      break;
    }
  }

  // `a > b` is `b < a`. This is the rewrite a player is most likely to produce
  // by describing the same comparison from the other side.
  const MIRRORED: Record<string, string> = {
    eq: "eq",
    gt: "lt",
    gte: "lte",
    lt: "gt",
    lte: "gte",
    neq: "neq",
  };
  const mirrored = structuredClone(reference) as unknown as MutableNode;
  for (const site of collectNodes(mirrored)) {
    if (site.node.kind !== "compare") continue;
    const op = MIRRORED[String(site.node.op)];
    if (!op) continue;
    const { left, right } = site.node;
    site.node.left = right;
    site.node.right = left;
    site.node.op = op;
    drafts.push({
      ast: mirrored,
      note: "comparison stated from the other side",
    });
    break;
  }

  // Commuted Boolean clause order.
  const commuted = structuredClone(reference) as unknown as MutableNode;
  for (const site of collectNodes(commuted)) {
    if (site.node.kind !== "and" && site.node.kind !== "or") continue;
    const clauses = site.node.clauses;
    if (!Array.isArray(clauses) || clauses.length < 2) continue;
    site.node.clauses = [...clauses].reverse();
    drafts.push({
      ast: commuted,
      note: "Boolean clauses stated in reverse order",
    });
    break;
  }

  // De Morgan: a AND b is NOT (NOT a OR NOT b).
  const deMorgan = structuredClone(reference) as unknown as MutableNode;
  for (const site of collectNodes(deMorgan)) {
    if (site.node.kind !== "and") continue;
    const clauses = site.node.clauses;
    if (!Array.isArray(clauses) || clauses.length < 2) continue;
    site.replace({
      kind: "not",
      clause: {
        kind: "or",
        clauses: clauses.map((clause) => ({ kind: "not", clause })),
      },
    });
    drafts.push({ ast: deMorgan, note: "conjunction written with De Morgan" });
    break;
  }

  for (const draft of drafts) {
    const parsed = ruleAstSchema.safeParse(draft.ast);
    if (!parsed.success) continue;
    if (isSameAst(parsed.data, reference)) continue;
    const signature = behaviorSignature(parsed.data, scenarios);
    if (signature && signature.digest === referenceSignature.digest) {
      return { ast: parsed.data, note: draft.note };
    }
  }
  return null;
}
