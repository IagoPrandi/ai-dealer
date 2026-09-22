import { describeRuleAstPaths, describeRuleAstTotal, type RuleAst } from "@tyche/rule-compiler";

import { canonicalJson, sha256Canonical, type JevQuestionSet, type ValidatedJevResponse } from "./jevPipelineEvaluation.js";
import {
  astOutcome,
  buildCandidateQuestions,
  buildPublicCandidateState,
  buildPublicScenario,
  findMaterialTerms,
  J8_GAME_DOMAIN,
  J8_NOUL_REJECT,
  J8_NOUL_SUPPORT,
  J8_PRODUCT_DEFAULTS,
  type CandidateJudgment,
  type ClaimLedger,
  type LedgerJudgment,
  type PublicScenario,
  type ScenarioInput,
} from "./jevPipelineJ8Evaluation.js";

// J9: end-to-end pipeline proposals built from the J0-J8 findings. Production
// never has a reference AST, so every gate here uses only what production can
// compute: the source, the verified claim ledger, generated ASTs, and scenarios
// derived deterministically from the source. References are used by the runner
// for scoring only.

export const JEV_J9_POLICY_VERSION = "jev-j9-pipelines-v2" as const;

const BASE_DRAW = [10, 20, 30, 40, 50, 60] as const;
// Numbers outside the base draw, used to pad tickets without adding matches.
const FILLERS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31] as const;

export interface EvidenceScenario extends ScenarioInput {
  family: string;
  guess: number[];
  step: number;
}

function distinctTicket(values: readonly number[]): number[] | null {
  if (values.length !== 6 || new Set(values).size !== 6) return null;
  return values.every((value) => Number.isInteger(value) && value >= 1 && value <= 100) ? [...values] : null;
}

/** Numbers the source states, plus the counts a six-number ticket can produce. */
export function sourceNumbers(source: string): number[] {
  const stated = findMaterialTerms(source).flatMap((term) => (term.cls === "number" && term.value !== undefined ? [term.value] : []));
  return [...new Set([0, 1, 2, 3, 4, 5, 6, ...stated])].sort((a, b) => a - b);
}

/**
 * Ordered families of tickets against one fixed draw. Adjacent members differ
 * in one measurable property, so a verdict flip between neighbors marks a
 * decision boundary. The families depend only on the source's numbers.
 */
export function buildEvidenceLibrary(source: string): EvidenceScenario[] {
  const draw = [...BASE_DRAW];
  const numbers = sourceNumbers(source);
  const scenarios: EvidenceScenario[] = [];
  const push = (family: string, step: number, ticket: number[] | null) => {
    if (ticket) scenarios.push({ draw, family, guess: ticket, id: `${family}:${step}`, step });
  };
  // Each family is pushed contiguously and in step order; adjacency is what
  // boundaryEvidence reads.
  for (let k = 0; k <= 6; k += 1) push("matches_anywhere", k, distinctTicket([...draw.slice(0, k).reverse(), ...FILLERS.slice(0, 6 - k)]));
  for (let k = 0; k <= 6; k += 1) push("matches_same_position", k, distinctTicket(draw.map((value, index) => (index < k ? value : value + 1))));
  const distances = [...new Set(numbers.flatMap((n) => [n - 1, n, n + 1]).filter((d) => d >= 0 && d <= 9))].sort((a, b) => a - b);
  for (const d of distances) push("same_position_distance_all", d, distinctTicket(draw.map((value) => value + d)));
  for (const d of distances) push("same_position_distance_one", d, distinctTicket(draw.map((value, index) => (index === 5 ? value + d : value + (d > 0 ? 1 : 0)))));
  const drawSum = draw.reduce((total, value) => total + value, 0);
  for (const delta of [-2, -1, 0, 1, 2]) {
    const base = [11, 21, 31, 41, 51, 61];
    const shift = drawSum + delta - base.reduce((total, value) => total + value, 0);
    push("sum_minus_draw_sum", delta, distinctTicket([...base.slice(0, 5), base[5]! + shift]));
  }
  const evens = [2, 4, 6, 8, 12, 14];
  for (let k = 0; k <= 6; k += 1) push("odd_count", k, distinctTicket(evens.map((value, index) => (index < k ? value + 1 : value))));
  for (const span of numbers.filter((n) => n >= 5 && n <= 90)) {
    for (const s of [span - 1, span, span + 1]) push("range_span", s, distinctTicket([70, 70 + s, 71, 72, 73, 74].sort((a, b) => a - b)));
  }
  return scenarios;
}

const COMPETITORS: Record<string, number[]> = {
  "ticket B": [10, 20, 30, 1, 3, 5],
  "ticket C": [10, 11, 12, 13, 14, 15],
};

/** For ranking rules the family ticket competes against two fixed tickets. */
export function asRankingScenario(scenario: EvidenceScenario): ScenarioInput {
  // `guess` is kept so a predicate AST can be evaluated on the same input.
  return { draw: scenario.draw, entries: { "your ticket": scenario.guess, ...COMPETITORS }, guess: scenario.guess, id: scenario.id, targetPlayer: "your ticket" };
}

function isRanking(ast: RuleAst): boolean {
  return "result" in ast && ast.result.type === "ranking";
}

/** WIN/LOSE of the family ticket, so predicate and ranking rules share one signal. */
export function targetVerdict(ast: RuleAst, scenario: EvidenceScenario): "ERROR" | "LOSE" | "WIN" {
  try {
    if (!isRanking(ast)) return astOutcome(ast, scenario) as "LOSE" | "WIN";
    const winners = astOutcome(ast, asRankingScenario(scenario)) as string[];
    return winners.includes("your ticket") ? "WIN" : "LOSE";
  } catch {
    return "ERROR";
  }
}

function inputFor(ast: RuleAst, scenario: EvidenceScenario): ScenarioInput {
  return isRanking(ast) ? asRankingScenario(scenario) : scenario;
}

export interface BoundaryEvidence {
  degenerate: "always_loses" | "always_wins" | "runtime_error" | null;
  /** Ready-to-evaluate inputs for this AST's result type. */
  scenarios: ScenarioInput[];
  source: "boundary_pairs" | "library_or_random_win_and_loss" | "none";
}

/**
 * Deterministic vacuity check plus up to `maxPairs` boundary pairs: adjacent
 * family members with opposite verdicts. These are the scenarios whose verdict
 * a claim must explain, and the ones a player would be shown to confirm.
 */
export function boundaryEvidence(ast: RuleAst, library: readonly EvidenceScenario[], random: readonly ScenarioInput[], maxPairs = 2): BoundaryEvidence {
  const verdicts = library.map((scenario) => targetVerdict(ast, scenario));
  if (verdicts.includes("ERROR")) return { degenerate: "runtime_error", scenarios: [], source: "none" };
  const randomVerdicts = random.map((scenario) => {
    try {
      const outcome = astOutcome(ast, scenario);
      return Array.isArray(outcome) ? (outcome.length > 0 ? "WIN" : "LOSE") : outcome;
    } catch {
      return "ERROR";
    }
  });
  if (randomVerdicts.includes("ERROR")) return { degenerate: "runtime_error", scenarios: [], source: "none" };
  const all = [...verdicts, ...randomVerdicts];
  if (all.every((verdict) => verdict === "WIN")) return { degenerate: "always_wins", scenarios: [], source: "none" };
  if (all.every((verdict) => verdict === "LOSE")) return { degenerate: "always_loses", scenarios: [], source: "none" };
  const pairs: [EvidenceScenario, EvidenceScenario][] = [];
  const seenFamilies = new Set<string>();
  for (let index = 1; index < library.length && pairs.length < maxPairs; index += 1) {
    const previous = library[index - 1]!;
    const current = library[index]!;
    if (previous.family !== current.family || seenFamilies.has(current.family)) continue;
    if (verdicts[index - 1] !== verdicts[index]) {
      pairs.push([previous, current]);
      seenFamilies.add(current.family);
    }
  }
  if (pairs.length > 0) return { degenerate: null, scenarios: pairs.flat().map((scenario) => inputFor(ast, scenario)), source: "boundary_pairs" };
  // No family crosses this rule's boundary: show one random win and one
  // random loss instead, so the claims still have to explain both verdicts.
  const pool = [...library.map((scenario) => inputFor(ast, scenario)), ...random];
  const win = pool[all.indexOf("WIN")]!;
  const loss = pool[all.indexOf("LOSE")]!;
  return { degenerate: null, scenarios: [win, loss], source: "library_or_random_win_and_loss" };
}

/** Scenarios on which two ASTs disagree, library first (boundaries), then random. */
export function disagreements(first: RuleAst, second: RuleAst, library: readonly EvidenceScenario[], random: readonly ScenarioInput[]): ScenarioInput[] {
  const found: ScenarioInput[] = [];
  const typeOf = (ast: RuleAst) => (isRanking(ast) ? "ranking" : "predicate");
  if (typeOf(first) !== typeOf(second)) {
    // Different result types cannot be compared scenario by scenario on the
    // same input; compare the family ticket's verdict instead.
    for (const scenario of library) if (targetVerdict(first, scenario) !== targetVerdict(second, scenario)) found.push(asRankingScenario(scenario));
    return found;
  }
  const outcome = (ast: RuleAst, scenario: ScenarioInput) => {
    try {
      return canonicalJson(astOutcome(ast, scenario));
    } catch (error) {
      return `ERROR:${String(error)}`;
    }
  };
  for (const scenario of library) {
    const input = inputFor(first, scenario);
    if (outcome(first, input) !== outcome(second, input)) found.push(input);
  }
  for (const scenario of random) if (outcome(first, scenario) !== outcome(second, scenario)) found.push(scenario);
  return found;
}

// ---------------------------------------------------------------------------
// Structure notes. J8/J9 probes showed Jev rejecting correct "exactly one of"
// ASTs because the renderer spells out the expanded Boolean form. Code
// recognizes the exactly-one shapes and states the structure plainly.

type Node = Record<string, unknown>;

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const same = (left: unknown, right: unknown) => canonicalJson(left) === canonicalJson(right);
const negated = (value: unknown): unknown => (isNode(value) && value.kind === "not" ? value.clause : undefined);
const clausesOf = (value: unknown, kind: "and" | "or"): unknown[] | null =>
  isNode(value) && value.kind === kind && Array.isArray(value.clauses) ? value.clauses : null;

function pairListed(pairs: readonly (unknown[] | null)[], left: unknown, right: unknown): boolean {
  return pairs.some((pair) => pair !== null && pair.length === 2 && ((same(pair[0], left) && same(pair[1], right)) || (same(pair[0], right) && same(pair[1], left))));
}

/** Relative clause paths of an exactly-one-of structure rooted at `node`, or null. */
export function exactlyOnePaths(node: unknown): string[] | null {
  // and(or(C1..Cn), not(and(Ci,Cj)) for every pair i<j)
  const conj = clausesOf(node, "and");
  const options = conj ? clausesOf(conj[0], "or") : null;
  if (conj && options && options.length >= 2) {
    const pairs = conj.slice(1).map((clause) => clausesOf(negated(clause), "and"));
    const expected = (options.length * (options.length - 1)) / 2;
    let complete = pairs.length === expected;
    for (let i = 0; complete && i < options.length; i += 1) {
      for (let j = i + 1; complete && j < options.length; j += 1) complete = pairListed(pairs, options[i], options[j]);
    }
    if (complete) return options.map((_, index) => `.clauses[0].clauses[${index}]`);
  }
  // or(and(C1, not C2, ...), and(not C1, C2, ...), ...): each branch has one
  // positive clause and negates every other branch's positive clause.
  const branches = clausesOf(node, "or");
  if (branches && branches.length >= 2) {
    const parts = branches.map((branch) => clausesOf(branch, "and"));
    if (!parts.every((part) => part !== null && part.length === branches.length)) return null;
    const positiveIndex = parts.map((part) => part!.findIndex((clause) => !(isNode(clause) && clause.kind === "not")));
    if (positiveIndex.some((index) => index < 0)) return null;
    const conditions = parts.map((part, branch) => part![positiveIndex[branch]!]);
    const valid = parts.every((part, branch) => {
      const negatedConditions = part!.filter((_, index) => index !== positiveIndex[branch]).map(negated);
      const others = conditions.filter((_, other) => other !== branch);
      return negatedConditions.every((value) => value !== undefined) && others.every((condition) => negatedConditions.some((value) => same(value, condition)));
    });
    if (valid) return parts.map((_, branch) => `.clauses[${branch}].clauses[${positiveIndex[branch]}]`);
  }
  return null;
}

function nodeAtPath(ast: RuleAst, astPath: string): unknown {
  let current: unknown = ast;
  for (const key of astPath.match(/[^.[\]]+/gu) ?? []) {
    current = Array.isArray(current) ? current[Number(key)] : isNode(current) ? current[key] : undefined;
  }
  return current;
}

/** The deterministic total description plus a code-computed structure note when one applies. */
export function describeWithStructure(ast: RuleAst): string {
  const total = describeRuleAstTotal(ast);
  if (!("result" in ast) || ast.result.type !== "predicate") return total;
  const descriptions = new Map(describeRuleAstPaths(ast).map((entry) => [entry.astPath, entry.behaviorDescription]));
  const roots = ["result.predicate", ...(clausesOf(ast.result.predicate, "and") ?? []).map((_, index) => `result.predicate.clauses[${index}]`)];
  for (const root of roots) {
    const relative = exactlyOnePaths(nodeAtPath(ast, root));
    if (!relative) continue;
    const listed = relative.map((path, index) => `(${index + 1}) ${descriptions.get(root + path) ?? "?"}`);
    return `${total} Structure computed by code: exactly one of these conditions must hold, never two or more: ${listed.join("; ")}.`;
  }
  return total;
}

// ---------------------------------------------------------------------------
// Adjudication: when two compilers disagree, Jev judges only the concrete
// scenarios where they differ, with every value precomputed by code.

export interface PublicAdjudicationState {
  candidates: { behaviorDescription: string; label: string }[];
  claims: { dimension: string; meaning: string }[];
  gameDomain: typeof J8_GAME_DOMAIN;
  productDefaults: readonly string[];
  scenarioNote: string;
  scenarios: { draw: number[]; id: string; tickets: PublicScenario["tickets"]; verdictIfCandidate1: string; verdictIfCandidate2: string }[];
}

export function buildAdjudicationState(ledger: ClaimLedger, first: RuleAst, second: RuleAst, scenarios: readonly ScenarioInput[], swap: boolean): PublicAdjudicationState {
  const [a, b] = swap ? [second, first] : [first, second];
  return {
    candidates: [
      { behaviorDescription: describeWithStructure(a), label: "candidate 1" },
      { behaviorDescription: describeWithStructure(b), label: "candidate 2" },
    ],
    claims: ledger.claims.map(({ dimension, meaning }) => ({ dimension, meaning })),
    gameDomain: J8_GAME_DOMAIN,
    productDefaults: J8_PRODUCT_DEFAULTS,
    scenarioNote: "Every value in `scenarios[*].tickets[*].facts` was computed exactly by code. Do not recount; use the given numbers.",
    scenarios: scenarios.map((scenario, index) => {
      const publicA = buildPublicScenario(a, scenario, `d${index + 1}`);
      const publicB = buildPublicScenario(b, scenario, `d${index + 1}`);
      return {
        draw: publicA.draw,
        id: publicA.id,
        // Facts are rule-independent; per-candidate sub-expression values are
        // withheld so neither candidate's own reasoning is shown as evidence.
        tickets: publicA.tickets.map((ticket) => ({ ...ticket, astComputedValues: [] })),
        verdictIfCandidate1: publicA.astVerdict,
        verdictIfCandidate2: publicB.astVerdict,
      };
    }),
  };
}

function noul(instructions: string) {
  return {
    criteria: { false: "No. The supplied evidence does not establish this.", true: "Yes. The supplied evidence establishes this." },
    instructions,
    type: "noul" as const,
  };
}

export function buildAdjudicationQuestions(state: PublicAdjudicationState): JevQuestionSet {
  const questions: JevQuestionSet = {};
  state.scenarios.forEach((_, index) => {
    for (const side of [1, 2] as const) {
      questions[`scenario_${index}_candidate_${side}`] = noul(
        `Apply \`claims\` to the tickets in \`scenarios[${index}]\` using the computed \`facts\`. Is \`scenarios[${index}].verdictIfCandidate${side}\` exactly the result that \`claims\` require?`,
      );
    }
  });
  questions.best_candidate = {
    criteria: {
      candidate_1: "`candidates[0].behaviorDescription` implements `claims` exactly and `candidates[1]` does not.",
      candidate_2: "`candidates[1].behaviorDescription` implements `claims` exactly and `candidates[0]` does not.",
      neither: "Neither candidate implements `claims` exactly, or both differ from `claims` in some way.",
    },
    instructions: "Which candidate implements `claims` exactly, judging by `candidates[*].behaviorDescription` and the verdicts in `scenarios`?",
    type: "choice",
  };
  return questions;
}

export type AdjudicationDecision = "candidate_1" | "candidate_2" | "unresolved";

/** A winner needs every scenario on its side, every opposite verdict rejected, and the Choice to agree. */
export function deriveAdjudication(state: PublicAdjudicationState, response: ValidatedJevResponse): AdjudicationDecision {
  const value = (id: string) => {
    const answer = response.answers[id];
    if (!answer || answer.type !== "noul") throw new Error(`Missing Noul answer ${id}`);
    return answer.noul;
  };
  const choice = response.answers.best_candidate;
  if (!choice || choice.type !== "choice") throw new Error("Missing Choice answer best_candidate");
  for (const side of [1, 2] as const) {
    const other = side === 1 ? 2 : 1;
    const wins = state.scenarios.every((_, index) => value(`scenario_${index}_candidate_${side}`) >= J8_NOUL_SUPPORT && value(`scenario_${index}_candidate_${other}`) <= J8_NOUL_REJECT);
    const choiceAgrees = choice.choice === `candidate_${side}` && (choice.probabilities[`candidate_${side}`] ?? 0) >= 0.7 && choice.confidence >= 0.7;
    if (wins && choiceAgrees) return `candidate_${side}`;
  }
  return "unresolved";
}

// ---------------------------------------------------------------------------
// Candidate check on generated evidence (J8 questions, production scenarios).

export function buildProductionCandidateCheck(ledger: ClaimLedger, ast: RuleAst, evidence: readonly ScenarioInput[]) {
  const base = buildPublicCandidateState(ledger, ast, evidence);
  const state = { ...base, candidate: { ...base.candidate, behaviorDescription: describeWithStructure(ast) } };
  return { questions: buildCandidateQuestions(state), state };
}

// ---------------------------------------------------------------------------
// Routes. Each pipeline is a pure function of the stage results so the
// ablations reuse exactly the same provider calls.

export type J9Route = "ACCEPT" | "BLOCK" | "CLARIFY" | "REVIEW" | "UNAVAILABLE";

export interface CompileOutcome {
  ast: RuleAst | null;
  error: string | null;
}

export interface J9StageResults {
  adjudication: AdjudicationDecision | null;
  blocked: boolean;
  checkFirst: CandidateJudgment | null;
  checkRegenerated: CandidateJudgment | null;
  checkWinner: CandidateJudgment | null;
  compileFirst: CompileOutcome | null;
  compileRegenerated: CompileOutcome | null;
  compileSecond: CompileOutcome | null;
  degenerateFirst: BoundaryEvidence["degenerate"];
  equivalent: boolean | null;
  ledger: LedgerJudgment | null;
  /** Ledger facts that need no model: code defects and the LLM's own open-choice count. */
  ledgerSignals: { codeDefects: number; openChoices: number } | null;
}

function ledgerRoute(stages: J9StageResults): J9Route | null {
  if (stages.blocked) return "BLOCK";
  if (!stages.ledger) return "UNAVAILABLE";
  if (stages.ledger.decision === "CLARIFY") return "CLARIFY";
  if (stages.ledger.decision !== "LEDGER_VERIFIED") return "REVIEW";
  return null;
}

/** A0: no semantic gate at all — the first schema-valid compile is accepted. */
export function routeA0(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  if (stages.blocked) return { ast: null, route: "BLOCK" };
  return stages.compileFirst?.ast ? { ast: stages.compileFirst.ast, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

/** P1: ledger gate, one compile, vacuity check, Jev check; one regeneration on a Jev defect. */
export function routeP1(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  const early = ledgerRoute(stages);
  if (early) return { ast: null, route: early };
  const first = stages.compileFirst?.ast ?? null;
  if (!first || stages.degenerateFirst) return { ast: null, route: "REVIEW" };
  if (stages.checkFirst?.decision === "candidate_supported") return { ast: first, route: "ACCEPT" };
  if (stages.checkFirst?.decision === "candidate_defect" && stages.compileRegenerated?.ast && stages.checkRegenerated?.decision === "candidate_supported") {
    return { ast: stages.compileRegenerated.ast, route: "ACCEPT" };
  }
  return { ast: null, route: stages.checkFirst ? "REVIEW" : "UNAVAILABLE" };
}

/** N-only: ledger gate plus two compilers that must behave identically; no Jev on the AST. */
export function routeNOnly(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  const early = ledgerRoute(stages);
  if (early) return { ast: null, route: early };
  const first = stages.compileFirst?.ast ?? null;
  if (!first || stages.degenerateFirst || !stages.compileSecond?.ast) return { ast: null, route: "REVIEW" };
  return stages.equivalent ? { ast: first, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

/**
 * P2: two independent compilers. Agreement plus a supported Jev check accepts.
 * Disagreement is adjudicated by Jev on the disagreeing scenarios; the winner
 * must then also pass the full Jev check. Everything else goes to review.
 */
export function routeP2(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  const early = ledgerRoute(stages);
  if (early) return { ast: null, route: early };
  const first = stages.compileFirst?.ast ?? null;
  const second = stages.compileSecond?.ast ?? null;
  if (!first || stages.degenerateFirst) return { ast: null, route: "REVIEW" };
  if (second && stages.equivalent) {
    return stages.checkFirst?.decision === "candidate_supported" ? { ast: first, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
  }
  if (!second || !stages.adjudication || stages.adjudication === "unresolved") return { ast: null, route: "REVIEW" };
  const winner = stages.adjudication === "candidate_1" ? first : second;
  return stages.checkWinner?.decision === "candidate_supported" ? { ast: winner, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

/**
 * P3: two independent compilers; agreement accepts without a Jev AST check.
 * Jev is used where J8 showed it is needed: the ledger ambiguity gate, and
 * adjudication plus a full check when the compilers disagree.
 */
export function routeP3(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  const early = ledgerRoute(stages);
  if (early) return { ast: null, route: early };
  const first = stages.compileFirst?.ast ?? null;
  const second = stages.compileSecond?.ast ?? null;
  if (!first || stages.degenerateFirst) return { ast: null, route: "REVIEW" };
  if (second && stages.equivalent) return { ast: first, route: "ACCEPT" };
  if (!second || !stages.adjudication || stages.adjudication === "unresolved") return { ast: null, route: "REVIEW" };
  const winner = stages.adjudication === "candidate_1" ? first : second;
  return stages.checkWinner?.decision === "candidate_supported" ? { ast: winner, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

/**
 * P5: P3 with no Jev anywhere. Ambiguity rests on the ledger LLM listing an
 * open choice; code defects go to review; agreement of the compilers accepts.
 */
export function routeP5(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  if (stages.blocked) return { ast: null, route: "BLOCK" };
  if (!stages.ledgerSignals) return { ast: null, route: "UNAVAILABLE" };
  if (stages.ledgerSignals.codeDefects > 0) return { ast: null, route: "REVIEW" };
  if (stages.ledgerSignals.openChoices > 0) return { ast: null, route: "CLARIFY" };
  const first = stages.compileFirst?.ast ?? null;
  if (!first || stages.degenerateFirst || !stages.compileSecond?.ast) return { ast: null, route: "REVIEW" };
  return stages.equivalent ? { ast: first, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

export const JEV_J9_POLICY_SHA256 = sha256Canonical({
  adjudicationQuestions: buildAdjudicationQuestions({
    candidates: [
      { behaviorDescription: "", label: "candidate 1" },
      { behaviorDescription: "", label: "candidate 2" },
    ],
    claims: [],
    gameDomain: J8_GAME_DOMAIN,
    productDefaults: J8_PRODUCT_DEFAULTS,
    scenarioNote: "",
    scenarios: [{ draw: [], id: "d1", tickets: [], verdictIfCandidate1: "", verdictIfCandidate2: "" }],
  }),
  bands: { reject: J8_NOUL_REJECT, support: J8_NOUL_SUPPORT },
  choicePolicy: "selected >= 0.7 and confidence >= 0.7",
  policy: JEV_J9_POLICY_VERSION,
  routes: [routeA0, routeP1, routeNOnly, routeP2, routeP3, routeP5, describeWithStructure, exactlyOnePaths].map((route) => route.toString()),
});
