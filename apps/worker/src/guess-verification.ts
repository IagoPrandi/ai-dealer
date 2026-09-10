import { createHash } from "node:crypto";
import { evaluatePredicate, evaluateRankingEntry } from "@tyche/rule-runtime";
import { isRankingRule, rankingDirection, type RuleAst } from "@tyche/rule-schema";

export type GuessVerificationJobStatus =
  | "completed"
  | "dead_letter"
  | "pending"
  | "processing"
  | "retry_scheduled";
export type VerificationOutcome = "LOSE" | "WIN";

export interface FrozenRuleArtifact {
  ast: RuleAst;
  compiledArtifactHash: string;
  normalizedText: string;
  promptContractVersion: string;
  ruleId: number;
  schemaVersion: 1 | 2 | 3;
}

export interface GuessVerificationJobPayload {
  active_rule_id?: string;
  compiled_artifact_hash?: string;
  draw_hash: string;
  guess_hash: string;
  guess_sequence: string;
  turn_id: string;
  wallet: string;
}

export interface GuessVerificationJob {
  activeRuleArtifact?: FrozenRuleArtifact | null;
  attempts: number;
  draw: readonly number[];
  id: string;
  maxAttempts: number;
  payload: GuessVerificationJobPayload;
  playerGuess: readonly number[];
  runAfter: string;
  status: GuessVerificationJobStatus;
}

export interface RuleVerificationResult {
  inputHash: string;
  matchedRuleBranch: string;
  outputHash: string;
  result: VerificationOutcome;
  runtimeMs: number;
  runtimeSteps: number;
  // Present for ranking rules: the per-guess score used by the turn-level argmax.
  eligible?: boolean;
  score?: number;
}

export interface GuessVerificationResult {
  activeRuleId: number | null;
  alternative: RuleVerificationResult | null;
  alternativeDirection?: "max" | "min";
  alternativeMode?: "predicate" | "ranking";
  completedAt: string;
  jobId: string;
  original: RuleVerificationResult;
  player: string;
  sequence: number;
  status: "completed";
  turnId: number;
}

export interface GuessVerificationCycleDeps {
  completeJob: (job: GuessVerificationJob, result: GuessVerificationResult) => Promise<void>;
  deadLetterJob: (job: GuessVerificationJob, error: string) => Promise<void>;
  fetchPendingJobs: (limit: number, nowIso: string) => Promise<GuessVerificationJob[]>;
  nowIso: () => string;
  retryJob: (job: GuessVerificationJob, error: string, runAfter: string) => Promise<void>;
}

export interface GuessVerificationCycleConfig {
  maxJobsPerCycle: number;
  retryBackoffBaseMs: number;
}

export interface GuessVerificationCycleResult {
  completed: number;
  deadLettered: number;
  processed: number;
  retried: number;
}

const DEFAULT_CONFIG: GuessVerificationCycleConfig = {
  maxJobsPerCycle: 25,
  retryBackoffBaseMs: 5_000,
};

export const ORIGINAL_RULE_AST: RuleAst = {
  node: { kind: "match_count_at_least", value: 6 },
  schemaVersion: 1,
};

export function verifyGuessJob(
  job: GuessVerificationJob,
  completedAt: string,
): GuessVerificationResult {
  assertVerificationPayload(job.payload);
  assertSixNumbers(job.playerGuess, "playerGuess");
  assertSixNumbers(job.draw, "draw");

  const original = evaluateRuntimeRule({
    ast: ORIGINAL_RULE_AST,
    branch: "original",
    draw: job.draw,
    guess: job.playerGuess,
    ruleArtifactHash: "original_rule_v1",
  });

  const alternative = job.activeRuleArtifact
    ? evaluateAlternativeRule(job, job.activeRuleArtifact)
    : null;
  const alternativeAst = job.activeRuleArtifact?.ast;
  const ranking = alternativeAst ? isRankingRule(alternativeAst) : false;
  const direction = ranking && alternativeAst ? rankingDirection(alternativeAst) : null;

  return {
    activeRuleId: job.activeRuleArtifact?.ruleId ?? null,
    alternative,
    ...(job.activeRuleArtifact
      ? { alternativeMode: ranking ? "ranking" : "predicate" }
      : {}),
    ...(direction ? { alternativeDirection: direction } : {}),
    completedAt,
    jobId: job.id,
    original,
    player: job.payload.wallet,
    sequence: Number(job.payload.guess_sequence),
    status: "completed",
    turnId: Number(job.payload.turn_id),
  };
}

export async function runGuessVerificationCycle(
  deps: GuessVerificationCycleDeps,
  config: Partial<GuessVerificationCycleConfig> = {},
): Promise<GuessVerificationCycleResult> {
  const resolvedConfig = { ...DEFAULT_CONFIG, ...config };
  const nowIso = deps.nowIso();
  const jobs = await deps.fetchPendingJobs(resolvedConfig.maxJobsPerCycle, nowIso);
  let completed = 0;
  let retried = 0;
  let deadLettered = 0;

  for (const job of jobs.slice(0, resolvedConfig.maxJobsPerCycle)) {
    try {
      const result = verifyGuessJob(job, deps.nowIso());
      await deps.completeJob(job, result);
      completed += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const nextAttempts = job.attempts + 1;
      if (nextAttempts >= job.maxAttempts) {
        await deps.deadLetterJob({ ...job, attempts: nextAttempts }, message);
        deadLettered += 1;
      } else {
        const runAfter = new Date(
          Date.parse(nowIso) +
            resolvedConfig.retryBackoffBaseMs * 2 ** Math.max(0, nextAttempts - 1),
        ).toISOString();
        await deps.retryJob({ ...job, attempts: nextAttempts }, message, runAfter);
        retried += 1;
      }
    }
  }

  return {
    completed,
    deadLettered,
    processed: completed + retried + deadLettered,
    retried,
  };
}

function evaluateAlternativeRule(
  job: GuessVerificationJob,
  artifact: FrozenRuleArtifact,
): RuleVerificationResult {
  if (job.payload.compiled_artifact_hash !== artifact.compiledArtifactHash) {
    throw new Error("COMPILED_ARTIFACT_HASH_MISMATCH");
  }

  return evaluateRuntimeRule({
    ast: artifact.ast,
    branch: `alternative:${artifact.ruleId}`,
    draw: job.draw,
    guess: job.playerGuess,
    ruleArtifactHash: artifact.compiledArtifactHash,
  });
}

function evaluateRuntimeRule(args: {
  ast: RuleAst;
  branch: string;
  draw: readonly number[];
  guess: readonly number[];
  ruleArtifactHash: string;
}): RuleVerificationResult {
  const inputHash = hashJson({
    branch: args.branch,
    draw: args.draw,
    guess: args.guess,
    ruleArtifactHash: args.ruleArtifactHash,
  });

  // Ranking rules have no absolute per-guess winner: compute a comparable score
  // and leave `result` provisional (LOSE) until the turn-level argmax decides
  // winners. Predicate rules resolve WIN/LOSE here.
  if (isRankingRule(args.ast)) {
    const evaluation = evaluateRankingEntry(args.ast, {
      draw: args.draw,
      guess: args.guess,
    });
    const outputHash = hashJson({
      branch: args.branch,
      eligible: evaluation.eligible,
      inputHash,
      score: evaluation.score,
    });
    return {
      inputHash,
      matchedRuleBranch: args.branch,
      outputHash,
      result: "LOSE",
      runtimeMs: 0,
      runtimeSteps: evaluation.runtimeSteps,
      eligible: evaluation.eligible,
      score: evaluation.score,
    };
  }

  const evaluation = evaluatePredicate(args.ast, {
    draw: args.draw,
    guess: args.guess,
  });
  const result: VerificationOutcome = evaluation.result;
  const outputHash = hashJson({
    branch: args.branch,
    inputHash,
    result,
  });

  return {
    inputHash,
    matchedRuleBranch: args.branch,
    outputHash,
    result,
    runtimeMs: 0,
    runtimeSteps: evaluation.runtimeSteps,
  };
}

function assertVerificationPayload(payload: GuessVerificationJobPayload) {
  if (
    !/^\d+$/.test(payload.turn_id) ||
    !/^\d+$/.test(payload.guess_sequence) ||
    !payload.wallet ||
    !isHexHash(payload.guess_hash) ||
    !isHexHash(payload.draw_hash) ||
    (payload.compiled_artifact_hash !== undefined &&
      !isHexHash(payload.compiled_artifact_hash)) ||
    (payload.active_rule_id !== undefined && !/^\d+$/.test(payload.active_rule_id))
  ) {
    throw new Error("INVALID_GUESS_VERIFICATION_PAYLOAD");
  }
}

function assertSixNumbers(values: readonly number[], field: string) {
  if (
    !Array.isArray(values) ||
    values.length !== 6 ||
    new Set(values).size !== 6 ||
    !values.every((value) => Number.isInteger(value) && value >= 1 && value <= 100)
  ) {
    throw new Error(`INVALID_${field.toUpperCase()}`);
  }
}

function isHexHash(value: string) {
  return /^[0-9a-f]{64}$/i.test(value);
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
