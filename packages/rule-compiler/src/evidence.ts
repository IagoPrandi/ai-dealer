import {
  ruleAstSchema,
  type RuleAst,
} from "@tyche/rule-schema";
import {
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
} from "@tyche/rule-runtime";

import { canonicalJson } from "./canonicalJson.js";
import { describeRuleAstPaths } from "./describeAst.js";

// Code-computed behavioral evidence about a rule AST: scenario families derived
// from the numbers a source states, boundary pairs where a verdict flips,
// behavioral equivalence between two ASTs, and exact facts about a ticket. The
// rule pipeline uses it to compare independent compilers, to reject vacuous
// artifacts, to give semantic checks closed questions, and to show the player
// concrete examples before signing. Nothing here calls a model.

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ---------------------------------------------------------------------------
// Numbers stated by a source.

/** NFD, no diacritics, lower case, single spaces: the matching view of a text. */
export function normalizeForMatch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/\s+/gu, " ")
    .trim();
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6,
  sete: 7, oito: 8, nove: 9, dez: 10, onze: 11, doze: 12, vinte: 20, trinta: 30,
  cinquenta: 50, cem: 100,
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, twenty: 20, thirty: 30, fifty: 50,
  hundred: 100,
};

// Articles that double as the number one are not material in these rules.
const AMBIGUOUS_NUMBER_WORDS = new Set(["um", "uma", "one"]);

export interface NumberTerm {
  end: number;
  start: number;
  term: string;
  value: number;
}

function wholeWord(term: string): RegExp {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, "gu");
}

/**
 * Digits and number words in an already-normalized text, with their offsets.
 * The single source for "which numbers does the player state", shared by the
 * evidence library and the claim-ledger material-term check.
 */
export function findNumberTerms(normalizedText: string): NumberTerm[] {
  const found: NumberTerm[] = [];
  for (const match of normalizedText.matchAll(/(?<![\p{L}\p{N}])\d+(?![\p{L}\p{N}])/gu)) {
    found.push({ end: match.index + match[0].length, start: match.index, term: match[0], value: Number(match[0]) });
  }
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (AMBIGUOUS_NUMBER_WORDS.has(word)) continue;
    for (const match of normalizedText.matchAll(wholeWord(word))) {
      found.push({ end: match.index + word.length, start: match.index, term: word, value });
    }
  }
  return found;
}

/** Numbers the source states, plus the counts a six-number ticket can produce. */
export function sourceNumbers(source: string): number[] {
  const stated = findNumberTerms(normalizeForMatch(source)).map((term) => term.value);
  return [...new Set([0, 1, 2, 3, 4, 5, 6, ...stated])].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Scenarios and outcomes.

export interface ScenarioInput {
  draw: number[];
  entries?: Record<string, number[]>;
  guess?: number[];
  id: string;
  targetPlayer?: string;
}

export interface EvidenceScenario extends ScenarioInput {
  family: string;
  guess: number[];
  step: number;
}

export type RuleOutcome = string[] | "LOSE" | "WIN";

export function isRankingAst(ast: RuleAst): boolean {
  return "result" in ast && ast.result.type === "ranking";
}

export function astOutcome(ast: RuleAst, scenario: ScenarioInput): RuleOutcome {
  // Legacy schemaVersion 1 rules are predicates only; the runtime evaluates them directly.
  if (!("result" in ast)) {
    if (!scenario.guess) throw new Error(`Scenario ${scenario.id} needs a guess for a predicate rule`);
    return evaluatePredicate(ast, { draw: scenario.draw, guess: scenario.guess }).result;
  }
  if (ast.result.type === "predicate") {
    if (!scenario.guess) throw new Error(`Scenario ${scenario.id} needs a guess for a predicate rule`);
    return evaluatePredicate(ast, { draw: scenario.draw, guess: scenario.guess }).result;
  }
  if (!scenario.entries) throw new Error(`Scenario ${scenario.id} needs entries for a ranking rule`);
  const scored = Object.entries(scenario.entries).map(([player, guess]) => ({
    player,
    ...evaluateRankingEntry(ast, { draw: scenario.draw, guess }),
  }));
  return [...resolveRankingWinners(scored, ast.result.direction)].sort();
}

const BASE_DRAW = [10, 20, 30, 40, 50, 60] as const;
// Numbers outside the base draw, used to pad tickets without adding matches.
const FILLERS = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21, 23, 25, 27, 29, 31] as const;

function distinctTicket(values: readonly number[]): number[] | null {
  if (values.length !== 6 || new Set(values).size !== 6) return null;
  return values.every((value) => Number.isInteger(value) && value >= 1 && value <= 100) ? [...values] : null;
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

function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const RANDOM_SCENARIO_SEED = 0x5eed1234;
export const RANDOM_SCENARIO_COUNT = 200;

/**
 * Seeded random scenarios, each with three competing tickets. Identical to the
 * J3-J10 evaluation library, so production equivalence reproduces those runs.
 * The first ticket (`player-A`) doubles as the predicate `guess`.
 */
export function seededRandomScenarios(count = RANDOM_SCENARIO_COUNT): ScenarioInput[] {
  const rng = mulberry32(RANDOM_SCENARIO_SEED);
  const shuffle = (values: readonly number[]) => {
    const copy = [...values];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j]!, copy[i]!];
    }
    return copy;
  };
  const distinct = (size: number, exclude = new Set<number>()) => {
    const chosen = new Set<number>();
    while (chosen.size < size) {
      const value = 1 + Math.floor(rng() * 100);
      if (!exclude.has(value)) chosen.add(value);
    }
    return [...chosen];
  };
  const scenarios: ScenarioInput[] = [];
  for (let index = 0; index < count; index += 1) {
    const draw = distinct(6);
    const drawSet = new Set(draw);
    const ticket = () => {
      const overlap = Math.floor(rng() * 7);
      const kept = shuffle(draw).slice(0, overlap);
      return shuffle([...kept, ...distinct(6 - overlap, drawSet)]);
    };
    const entries = { "player-A": ticket(), B: ticket(), C: ticket() };
    scenarios.push({
      draw: shuffle(draw),
      entries,
      guess: entries["player-A"],
      id: `random-${index + 1}`,
    });
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

/** WIN/LOSE of the family ticket, so predicate and ranking rules share one signal. */
export function targetVerdict(ast: RuleAst, scenario: EvidenceScenario): "ERROR" | "LOSE" | "WIN" {
  try {
    if (!isRankingAst(ast)) return astOutcome(ast, scenario) as "LOSE" | "WIN";
    const winners = astOutcome(ast, asRankingScenario(scenario)) as string[];
    return winners.includes("your ticket") ? "WIN" : "LOSE";
  } catch {
    return "ERROR";
  }
}

function inputFor(ast: RuleAst, scenario: EvidenceScenario): ScenarioInput {
  return isRankingAst(ast) ? asRankingScenario(scenario) : scenario;
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
 * a claim must explain, and the ones a player is shown to confirm.
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
  // Families share members (six same-position matches is also six matches
  // anywhere); a pair repeating a chosen ticket adds no evidence.
  const seenTickets = new Set<string>();
  const ticketKey = (scenario: EvidenceScenario) => scenario.guess.join(",");
  for (let index = 1; index < library.length && pairs.length < maxPairs; index += 1) {
    const previous = library[index - 1]!;
    const current = library[index]!;
    if (previous.family !== current.family || seenFamilies.has(current.family)) continue;
    if (seenTickets.has(ticketKey(previous)) || seenTickets.has(ticketKey(current))) continue;
    if (verdicts[index - 1] !== verdicts[index]) {
      pairs.push([previous, current]);
      seenFamilies.add(current.family);
      seenTickets.add(ticketKey(previous)).add(ticketKey(current));
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
  if (isRankingAst(first) !== isRankingAst(second)) {
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
// Exact ticket facts and closed sub-expression values.

export interface TicketFacts {
  drawnNumbersAlsoInTicket: number[];
  howManyTicketNumbersWereDrawn: number;
  positionsWhereTicketEqualsDraw: number[];
  samePositionDistance: number[];
  samePositionDistanceLargest: number;
  ticket: number[];
  ticketHighest: number;
  ticketLowest: number;
  ticketSum: number;
}

export function ticketFacts(ticket: readonly number[], draw: readonly number[]): TicketFacts {
  const drawn = new Set(draw);
  const inBoth = ticket.filter((value) => drawn.has(value));
  return {
    drawnNumbersAlsoInTicket: inBoth,
    howManyTicketNumbersWereDrawn: inBoth.length,
    positionsWhereTicketEqualsDraw: ticket.flatMap((value, index) => (draw[index] === value ? [index + 1] : [])),
    samePositionDistance: ticket.map((value, index) => Math.abs(value - draw[index]!)),
    samePositionDistanceLargest: Math.max(...ticket.map((value, index) => Math.abs(value - draw[index]!))),
    ticket: [...ticket],
    ticketHighest: Math.max(...ticket),
    ticketLowest: Math.min(...ticket),
    ticketSum: ticket.reduce((total, value) => total + value, 0),
  };
}

export interface TraceEntry {
  description: string;
  value: boolean | number;
}

export const MAX_TRACE_ENTRIES = 40;

type AstNode = Record<string, unknown>;

/** The node at a deterministic description path such as `result.predicate.clauses[0]`. */
export function astNodeAt(ast: RuleAst, astPath: string): unknown {
  let current: unknown = ast;
  for (const part of astPath.match(/[^.[\]]+/gu) ?? []) {
    if (Array.isArray(current)) current = current[Number(part)];
    else if (isRecord(current)) current = current[part];
    else return undefined;
  }
  return current;
}

const SKIPPED_TRACE_KINDS = new Set(["source", "lit", "pair", "elem"]);

const lit = (value: number) => ({ kind: "lit", value });

function scalarValue(ast: RuleAst, scalar: unknown, input: { draw: readonly number[]; guess: readonly number[] }): number | null {
  const parsed = ruleAstSchema.safeParse({
    result: { direction: "max", score: scalar, tieBreak: "share_pool", type: "ranking" },
    schemaVersion: ast.schemaVersion,
  });
  return parsed.success ? evaluateRankingEntry(parsed.data, input).score : null;
}

/**
 * A quantified condition hides its per-element results inside a binder, and a
 * reader cannot recover them (a J8 probe missed "less than 5" at a distance of
 * exactly 5). Counting how many elements satisfy the body keeps the boundary
 * visible without asking anyone to evaluate anything.
 */
function quantifierCounts(
  ast: RuleAst,
  astPath: string,
  node: AstNode,
  input: { draw: readonly number[]; guess: readonly number[] },
): TraceEntry[] {
  const pairwise = node.kind === "pairs_forall" || node.kind === "pairs_exists";
  if (!pairwise && node.kind !== "forall" && node.kind !== "exists") return [];
  const whereDescription = describeRuleAstPaths(ast).find((entry) => entry.astPath === `${astPath}.where`)?.behaviorDescription;
  if (!whereDescription) return [];
  const indicator = { else: lit(0), if: node.where, kind: "ite", then: lit(1) };
  const mapped = pairwise
    ? { expr: indicator, kind: "pairs_map", left: node.left, right: node.right }
    : { expr: indicator, kind: "map", of: node.of };
  const satisfied = scalarValue(ast, { kind: "reduce", of: mapped, op: "sum" }, input);
  const total = scalarValue(ast, { kind: "reduce", of: pairwise ? node.left : node.of, op: "count" }, input);
  if (satisfied === null || total === null) return [];
  return [{ description: `how many of the ${total} ${pairwise ? "positions" : "values"} satisfy: ${whereDescription}`, value: satisfied }];
}

/**
 * Values of every closed sub-expression of the AST for one ticket.
 * Sub-expressions that read a binder variable cannot be evaluated alone and
 * are left out; the schema rejects them, which is the signal used here.
 */
export function astTrace(ast: RuleAst, guess: readonly number[], draw: readonly number[]): TraceEntry[] {
  const trace: TraceEntry[] = [];
  const input = { draw, guess };
  for (const { astPath, behaviorDescription } of describeRuleAstPaths(ast)) {
    if (trace.length >= MAX_TRACE_ENTRIES) break;
    if (astPath === "result") continue;
    const node = astNodeAt(ast, astPath);
    if (!isRecord(node) || typeof node.kind !== "string" || SKIPPED_TRACE_KINDS.has(node.kind)) continue;
    const asPredicate = ruleAstSchema.safeParse({
      result: { predicate: node, type: "predicate" },
      schemaVersion: ast.schemaVersion,
    });
    if (asPredicate.success) {
      trace.push({ description: behaviorDescription, value: evaluatePredicate(asPredicate.data, input).result === "WIN" });
      trace.push(...quantifierCounts(ast, astPath, node, input));
      continue;
    }
    const asScore = ruleAstSchema.safeParse({
      result: { direction: "max", score: node, tieBreak: "share_pool", type: "ranking" },
      schemaVersion: ast.schemaVersion,
    });
    if (asScore.success) {
      if (trace.some((entry) => entry.description === behaviorDescription)) continue;
      trace.push({ description: behaviorDescription, value: evaluateRankingEntry(asScore.data, input).score });
      continue;
    }
    const asCount = ruleAstSchema.safeParse({
      result: { direction: "max", score: { kind: "reduce", of: node, op: "count" }, tieBreak: "share_pool", type: "ranking" },
      schemaVersion: ast.schemaVersion,
    });
    if (asCount.success && !trace.some((entry) => entry.description === `how many values are in ${behaviorDescription}`)) {
      trace.push({
        description: `how many values are in ${behaviorDescription}`,
        value: evaluateRankingEntry(asCount.data, input).score,
      });
    }
  }
  return trace;
}

// ---------------------------------------------------------------------------
// Semantic units: top-level conjuncts, score, direction and tie behavior.

export interface AstUnit {
  astPath: string;
  description: string;
  id: string;
}

function andClausePaths(node: unknown, path: string): string[] {
  if (isRecord(node) && node.kind === "and" && Array.isArray(node.clauses)) {
    return node.clauses.flatMap((clause, index) => andClausePaths(clause, `${path}.clauses[${index}]`));
  }
  return [path];
}

/** Top-level conjuncts, score, direction and tie behavior, each described by code. */
export function astSemanticUnits(ast: RuleAst): AstUnit[] {
  const descriptions = new Map(describeRuleAstPaths(ast).map((entry) => [entry.astPath, entry.behaviorDescription]));
  const describe = (astPath: string): string => {
    const text = descriptions.get(astPath);
    if (!text) throw new Error(`No deterministic description for ${astPath}`);
    return text;
  };
  const result = (ast as unknown as { result: AstNode }).result;
  const units: Omit<AstUnit, "id">[] = [];
  if (result.type === "predicate") {
    for (const astPath of andClausePaths(result.predicate, "result.predicate")) {
      units.push({ astPath, description: describe(astPath) });
    }
  } else {
    if (result.eligibleWhen !== undefined) {
      for (const astPath of andClausePaths(result.eligibleWhen, "result.eligibleWhen")) {
        units.push({ astPath, description: `A ticket is eligible only if ${describe(astPath)}.` });
      }
    }
    const score = describe("result.score");
    units.push({
      astPath: "result.direction",
      description: `Among eligible tickets, the ticket with the ${result.direction === "min" ? "smallest" : "largest"} value of "${score}" wins.`,
    });
    units.push({
      astPath: "result.tieBreak",
      description: "Tickets tied for the winning value share the prize.",
    });
  }
  return units.map((unit, index) => ({ ...unit, id: `u${index + 1}` }));
}
