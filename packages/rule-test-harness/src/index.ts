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

export const RULE_TEST_HARNESS_VERSION = "2.0.0";

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

function classify(winRate: number, ranking: boolean): RuleDifficultyClass {
  if (!ranking && winRate <= 0) return "IMPOSSIBLE";
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
      difficultyClass: classify(estimatedWinRate, true),
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
    difficultyClass: classify(estimatedWinRate, false),
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
  cases.push({
    name: "has_winning_case",
    passed: foundWin,
    detail: foundWin
      ? "found at least one winning input"
      : "no win observed in sample (rule may be extremely rare)",
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

  // 6. Difficulty is informational only. Per product policy, ANY verifiable rule
  // is allowed (the only hard limits are external dependencies and
  // unverifiability); difficulty — including ALWAYS_TRUE / IMPOSSIBLE / TOO_EASY
  // — never blocks, it is surfaced as a label for the UX.
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
