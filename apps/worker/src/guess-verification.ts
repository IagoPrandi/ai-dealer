import { createHash } from "node:crypto";
import { evaluateRule } from "@idealer/rule-runtime";
import type { RuleAst } from "@idealer/rule-schema";

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
  schemaVersion: 1;
}

export interface GuessVerificationJobPayload {
  active_rule_id?: string;
  compiled_artifact_hash?: string;
  draw_hash: string;
  guess_hash: string;
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
}

export interface GuessVerificationResult {
  activeRuleId: number | null;
  alternative: RuleVerificationResult | null;
  completedAt: string;
  jobId: string;
  original: RuleVerificationResult;
  player: string;
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

  return {
    activeRuleId: job.activeRuleArtifact?.ruleId ?? null,
    alternative,
    completedAt,
    jobId: job.id,
    original,
    player: job.payload.wallet,
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
  const won = evaluateRule(args.ast, { draw: args.draw, guess: args.guess });
  const result: VerificationOutcome = won ? "WIN" : "LOSE";
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
    runtimeSteps: 1,
  };
}

function assertVerificationPayload(payload: GuessVerificationJobPayload) {
  if (
    !/^\d+$/.test(payload.turn_id) ||
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
