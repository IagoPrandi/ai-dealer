import type { RuleAst } from "@tyche/rule-schema";
import { isRankingRule, rankingDirection, ruleAstSchema } from "@tyche/rule-schema";
import {
  evaluatePredicate,
  resolveRankingWinners,
  RuleRuntimeError,
  scoreGuess,
} from "@tyche/rule-runtime";

// Validates a compiled rule (PRD §7.8) before it can be accepted: it runs the
// rule in the deterministic runtime over generated + Monte-Carlo inputs, derives
// a difficulty class (PRD §6.8), and yields a test_coverage_score for the
// composite confidence calculation. The harness lives OUTSIDE the runtime
// sandbox, so it may use a deterministic PRNG; the runtime itself never sees one.

// 2.1.0 — IMPOSSIBLE now requires a failed directed witness search, so a
// legitimately rare rule is classified EXTREME instead (PRD §6.8).
export const RULE_TEST_HARNESS_VERSION = "2.2.0";

export type RuleDifficultyClass =
  | "IMPOSSIBLE"
  | "ALWAYS_TRUE"
  | "TOO_EASY"
  | "BALANCED"
  | "HARD"
  | "EXTREME";

export interface RuleDifficultyResult {
  difficultyClass: RuleDifficultyClass;
  estimatedWinRate: number;
  samplesRun: number;
}

export interface RuleTestCaseResult {
  name: string;
  passed: boolean;
  detail: string;
  // Informational cases (e.g. observing a win for a legitimately rare rule) do
  // not count toward coverage, so a hard-but-valid rule is not penalized.
  counted: boolean;
}

export interface RuleTestSummary {
  harnessVersion: string;
  passed: number;
  total: number;
  coverageScore: number;
  difficulty: RuleDifficultyResult;
  cases: RuleTestCaseResult[];
}

const MONTE_CARLO = {
  predicateSamples: 2_000,
  rankingDraws: 200,
  rankingFieldSize: 16,
  tooEasyThreshold: 0.5,
  balancedThreshold: 0.05,
  hardThreshold: 0.005,
} as const;

// Deterministic PRNG (mulberry32). Seeded so the harness verdict is reproducible
// for the same AST (the difficulty/coverage scores feed an auditable artifact).
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sixUnique(rng: () => number): number[] {
  const pool = new Set<number>();
  while (pool.size < 6) {
    pool.add(1 + Math.floor(rng() * 100));
  }
  return [...pool];
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(
            (value as Record<string, unknown>)[key],
          )}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

// Structured inputs that hit the winning shape of the rule families the DSL can
// express: exact/partial overlap with the draw, order-sensitive arrangements,
// and the extremes of the number domain. Uniform sampling alone cannot separate
// "unwinnable" from "rarer than 1 in `predicateSamples`" — a jackpot rule like
// "at least 4 of 6 from 100" (~1.4e-5) shows zero wins in every feasible uniform
// sample, and rejecting it would be wrong (PRD §6.8 rejects IMPOSSIBLE rules).
const WITNESS_SETS: readonly (readonly number[])[] = [
  [1, 2, 3, 4, 5, 6],
  [95, 96, 97, 98, 99, 100],
  [2, 4, 6, 8, 10, 12],
  [1, 3, 5, 7, 9, 11],
  [1, 20, 40, 60, 80, 100],
  [10, 20, 30, 40, 50, 60],
  [1, 2, 3, 98, 99, 100],
  [45, 46, 47, 54, 55, 56],
  [7, 14, 21, 28, 35, 42],
  [11, 22, 33, 44, 55, 66],
];

// A guess sharing exactly `overlap` values with `draw`; the rest are filled from
// the domain in ascending order, skipping anything already used.
function guessWithOverlap(draw: readonly number[], overlap: number): number[] {
  const guess = draw.slice(0, overlap);
  const used = new Set(draw);
  for (let value = 1; guess.length < draw.length && value <= 100; value += 1) {
    if (!used.has(value)) {
      guess.push(value);
      used.add(value);
    }
  }
  return guess;
}

export interface StructuredInputPair {
  draw: readonly number[];
  guess: readonly number[];
}

let structuredPairsCache: readonly StructuredInputPair[] | null = null;

/**
 * The deterministic structured battery, as (guess, draw) pairs.
 *
 * Uniform random sampling is BLIND to rules that essentially never win: two
 * different jackpot rules both lose on every uniform sample, so a sampled
 * equivalence check calls them identical. Turn 55's mis-compiled artifact and a
 * faithful compile of the same text disagree on zero of 240 uniform samples and
 * on the very first structured pair. Any equivalence or witness check must run
 * this battery to have discriminating power where it matters.
 */
export function structuredInputPairs(): readonly StructuredInputPair[] {
  if (structuredPairsCache) {
    return structuredPairsCache;
  }
  const pairs: StructuredInputPair[] = [];
  for (const draw of WITNESS_SETS) {
    const guesses: number[][] = [
      [...draw],
      [...draw].reverse(),
      [...draw].sort((a, b) => a - b),
      [...draw].sort((a, b) => b - a),
      ...Array.from({ length: draw.length + 1 }, (_value, overlap) =>
        guessWithOverlap(draw, overlap),
      ),
      ...WITNESS_SETS.map((set) => [...set]),
    ];
    for (const guess of guesses) {
      pairs.push({ draw, guess });
    }
  }
  structuredPairsCache = pairs;
  return pairs;
}

function pinnedGuessValues(ast: RuleAst): number[] {
  const values = new Set<number>();
  const visit = (node: unknown) => {
    if (!node || typeof node !== "object") {
      return;
    }
    const record = node as Record<string, unknown>;
    if (
      record.kind === "contains" &&
      record.array &&
      typeof record.array === "object" &&
      (record.array as Record<string, unknown>).kind === "source" &&
      (record.array as Record<string, unknown>).source === "guess" &&
      record.value &&
      typeof record.value === "object" &&
      (record.value as Record<string, unknown>).kind === "lit"
    ) {
      const value = (record.value as Record<string, unknown>).value;
      if (
        typeof value === "number" &&
        Number.isInteger(value) &&
        value >= 1 &&
        value <= 100
      ) {
        values.add(value);
      }
    }
    for (const child of Object.values(record)) {
      if (Array.isArray(child)) {
        child.forEach(visit);
      } else if (child && typeof child === "object") {
        visit(child);
      }
    }
  };
  visit(ast);
  return [...values].sort((a, b) => a - b);
}

function directedInputPairs(ast: RuleAst): readonly StructuredInputPair[] {
  const pinned = pinnedGuessValues(ast);
  if (pinned.length === 0 || pinned.length > 6) {
    return structuredInputPairs();
  }
  const guess = [...pinned];
  for (let value = 1; guess.length < 6 && value <= 100; value += 1) {
    if (!guess.includes(value)) {
      guess.push(value);
    }
  }
  return [
    ...WITNESS_SETS.map((draw) => ({ draw, guess: [...guess] })),
    ...structuredInputPairs(),
  ];
}

export interface RuleWorkedExample {
  draw: readonly number[];
  guess: readonly number[];
  outcome: "WIN" | "LOSE";
}

/**
 * Concrete (guess, draw) pairs showing the rule winning and losing, taken from
 * the structured battery. Prose can be misread; a worked example cannot — and
 * because both come from the frozen AST, neither can promise what the runtime
 * will not do. Ranking rules have no per-guess boolean, so they yield none.
 */
export function collectWorkedExamples(
  ast: RuleAst,
  perOutcome = 2,
): readonly RuleWorkedExample[] {
  if (isRankingRule(ast)) {
    return [];
  }
  const wins: RuleWorkedExample[] = [];
  const losses: RuleWorkedExample[] = [];
  for (const { draw, guess } of directedInputPairs(ast)) {
    if (wins.length >= perOutcome && losses.length >= perOutcome) {
      break;
    }
    let outcome: "WIN" | "LOSE";
    try {
      outcome = evaluatePredicate(ast, { guess: [...guess], draw: [...draw] })
        .result;
    } catch {
      continue;
    }
    const bucket = outcome === "WIN" ? wins : losses;
    if (bucket.length >= perOutcome) {
      continue;
    }
    // Distinct shapes read better than near-duplicates of the same pair.
    const duplicate = bucket.some(
      (example) =>
        example.guess.join() === guess.join() &&
        example.draw.join() === draw.join(),
    );
    if (!duplicate) {
      bucket.push({ draw: [...draw], guess: [...guess], outcome });
    }
  }
  return [...wins, ...losses];
}

/**
 * Directed search for a single winning input. Bounded and deterministic: no RNG,
 * a fixed battery, and it stops at the first witness.
 */
export function hasWinningWitness(ast: RuleAst): boolean {
  if (isRankingRule(ast)) {
    // A ranking rule always has a winner (the argmax over the field).
    return true;
  }
  for (const { draw, guess } of directedInputPairs(ast)) {
    try {
      if (
        evaluatePredicate(ast, { guess: [...guess], draw: [...draw] }).result ===
        "WIN"
      ) {
        return true;
      }
    } catch {
      // An input this AST cannot evaluate is not a witness; keep searching.
    }
  }
  return false;
}

function classify(
  winRate: number,
  ranking: boolean,
  winnable: boolean,
): RuleDifficultyClass {
  // IMPOSSIBLE means no input can win, not "too rare for this sample size".
  // A rule with zero observed wins but a constructible winner is EXTREME.
  if (!ranking && winRate <= 0 && !winnable) return "IMPOSSIBLE";
  if (winRate >= 0.999) return "ALWAYS_TRUE";
  if (winRate >= MONTE_CARLO.tooEasyThreshold) return "TOO_EASY";
  if (winRate >= MONTE_CARLO.balancedThreshold) return "BALANCED";
  if (winRate >= MONTE_CARLO.hardThreshold) return "HARD";
  return "EXTREME";
}

export function classifyDifficulty(ast: RuleAst): RuleDifficultyResult {
  const rng = mulberry32(0x1dea1e7);
  if (isRankingRule(ast)) {
    let fractionSum = 0;
    for (let i = 0; i < MONTE_CARLO.rankingDraws; i += 1) {
      const draw = sixUnique(rng);
      const scores = Array.from(
        { length: MONTE_CARLO.rankingFieldSize },
        (_value, index) => ({
          player: index,
          score: scoreGuess(ast, { guess: sixUnique(rng), draw }),
        }),
      );
      const winners = resolveRankingWinners(scores, rankingDirection(ast));
      fractionSum += winners.size / MONTE_CARLO.rankingFieldSize;
    }
    const estimatedWinRate = fractionSum / MONTE_CARLO.rankingDraws;
    return {
      difficultyClass: classify(estimatedWinRate, true, true),
      estimatedWinRate,
      samplesRun: MONTE_CARLO.rankingDraws * MONTE_CARLO.rankingFieldSize,
    };
  }

  let wins = 0;
  for (let i = 0; i < MONTE_CARLO.predicateSamples; i += 1) {
    const result = evaluatePredicate(ast, {
      guess: sixUnique(rng),
      draw: sixUnique(rng),
    });
    if (result.result === "WIN") wins += 1;
  }
  const estimatedWinRate = wins / MONTE_CARLO.predicateSamples;
  return {
    // Only pay for the directed search when uniform sampling found nothing.
    difficultyClass: classify(
      estimatedWinRate,
      false,
      wins > 0 || hasWinningWitness(ast),
    ),
    estimatedWinRate,
    samplesRun: MONTE_CARLO.predicateSamples,
  };
}

export function generateAndRunTests(ast: RuleAst): RuleTestSummary {
  const cases: RuleTestCaseResult[] = [];
  const rng = mulberry32(0xc0ffee);
  const ranking = isRankingRule(ast);

  // 1. Runtime safety: never throws on valid inputs across a sample.
  let safe = true;
  let safeDetail = "no runtime errors over sample inputs";
  let foundWin = false;
  let foundLose = false;
  try {
    for (let i = 0; i < 200; i += 1) {
      const draw = sixUnique(rng);
      if (ranking) {
        const scores = Array.from({ length: 8 }, (_v, index) => ({
          player: index,
          score: scoreGuess(ast, { guess: sixUnique(rng), draw }),
        }));
        const winners = resolveRankingWinners(scores, rankingDirection(ast));
        if (winners.size > 0) foundWin = true;
        if (winners.size < scores.length) foundLose = true;
      } else {
        const outcome = evaluatePredicate(ast, { guess: sixUnique(rng), draw });
        if (outcome.result === "WIN") foundWin = true;
        else foundLose = true;
      }
    }
  } catch (error) {
    safe = false;
    safeDetail =
      error instanceof RuleRuntimeError
        ? `${error.code}: ${error.message}`
        : String(error);
  }
  cases.push({ name: "runtime_safe", passed: safe, detail: safeDetail, counted: true });

  // 2. Determinism: same input yields the same result twice.
  const probeDraw = sixUnique(rng);
  const probeGuess = sixUnique(rng);
  let deterministic: boolean;
  try {
    if (ranking) {
      deterministic =
        scoreGuess(ast, { guess: probeGuess, draw: probeDraw }) ===
        scoreGuess(ast, { guess: probeGuess, draw: probeDraw });
    } else {
      deterministic =
        evaluatePredicate(ast, { guess: probeGuess, draw: probeDraw }).result ===
        evaluatePredicate(ast, { guess: probeGuess, draw: probeDraw }).result;
    }
  } catch {
    deterministic = false;
  }
  cases.push({
    name: "deterministic",
    passed: deterministic,
    detail: "identical inputs produce identical output",
    counted: true,
  });

  // 3. Serialization stability: AST survives a JSON round-trip and re-validates.
  const round = JSON.parse(JSON.stringify(ast)) as unknown;
  const serializationStable =
    ruleAstSchema.safeParse(round).success &&
    stableStringify(round) === stableStringify(ast);
  cases.push({
    name: "serialization_stable",
    passed: serializationStable,
    detail: "AST is stable under JSON round-trip",
    counted: true,
  });

  // 4/5. Both outcomes observed. Informational only: a legitimately rare rule
  // (e.g. "match 4+ of 6 from 100", a jackpot) may show no observed win in any
  // feasible sample, and we must not reject such a valid rule. We surface it as
  // a difficulty signal instead of failing coverage.
  const winnable = foundWin || hasWinningWitness(ast);
  cases.push({
    name: "has_winning_case",
    passed: winnable,
    detail: foundWin
      ? "found at least one winning input"
      : winnable
        ? "no win in the uniform sample; a constructed input wins (extremely rare rule)"
        : "no winning input found by sampling or by directed search",
    counted: false,
  });
  cases.push({
    name: "has_losing_case",
    passed: foundLose,
    detail: ranking
      ? "found at least one non-winning guess"
      : "found at least one losing input",
    counted: false,
  });

  // 6. Difficulty is a label here; the compiler decides what blocks. Per PRD
  // §6.8 it rejects IMPOSSIBLE and ALWAYS_TRUE (neither can distinguish winners
  // from losers) and leaves TOO_EASY to game configuration.
  const difficulty = classifyDifficulty(ast);
  cases.push({
    name: "difficulty",
    passed: true,
    detail: `difficulty=${difficulty.difficultyClass} winRate=${difficulty.estimatedWinRate.toFixed(
      4,
    )}`,
    counted: false,
  });

  const counted = cases.filter((testCase) => testCase.counted);
  const passed = counted.filter((testCase) => testCase.passed).length;
  return {
    harnessVersion: RULE_TEST_HARNESS_VERSION,
    passed,
    total: counted.length,
    coverageScore: counted.length === 0 ? 0 : passed / counted.length,
    difficulty,
    cases,
  };
}

// Back-compat smoke helper (kept for any external caller).
export function runSmokeRuleTest(ast: RuleAst): boolean {
  return generateAndRunTests(ast).coverageScore > 0;
}
