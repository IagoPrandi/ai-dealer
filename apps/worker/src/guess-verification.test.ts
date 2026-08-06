import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runGuessVerificationCycle,
  verifyGuessJob,
  type FrozenRuleArtifact,
  type GuessVerificationJob,
  type GuessVerificationResult,
} from "./guess-verification.js";

const artifactHash = "1".repeat(64);
const activeArtifact: FrozenRuleArtifact = {
  ast: { node: { kind: "match_count_at_least", value: 4 }, schemaVersion: 1 },
  compiledArtifactHash: artifactHash,
  normalizedText: "at least four matches",
  promptContractVersion: "tyche_rule_validation_prompt_v1",
  ruleId: 7,
  schemaVersion: 1,
};

function job(overrides: Partial<GuessVerificationJob> = {}): GuessVerificationJob {
  return {
    activeRuleArtifact: activeArtifact,
    attempts: 0,
    draw: [1, 2, 3, 4, 5, 6],
    id: "job-1",
    maxAttempts: 3,
    payload: {
      active_rule_id: "7",
      compiled_artifact_hash: artifactHash,
      draw_hash: "2".repeat(64),
      guess_hash: "3".repeat(64),
      guess_sequence: "1",
      turn_id: "42",
      wallet: "4bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTH",
    },
    playerGuess: [1, 2, 3, 4, 90, 91],
    runAfter: "2026-06-11T00:00:00.000Z",
    status: "pending",
    ...overrides,
  };
}

test("verifyGuessJob evaluates original and active alternative rule deterministically", () => {
  const result = verifyGuessJob(job(), "2026-06-11T00:00:01.000Z");

  assert.equal(result.original.result, "LOSE");
  assert.equal(result.alternative?.result, "WIN");
  assert.equal(result.alternative?.matchedRuleBranch, "alternative:7");
  assert.match(result.original.inputHash, /^[0-9a-f]{64}$/);
  assert.match(result.alternative?.outputHash ?? "", /^[0-9a-f]{64}$/);
});

test("verifyGuessJob supports original-only turns without an active artifact", () => {
  const result = verifyGuessJob(
    job({
      activeRuleArtifact: null,
      payload: {
        draw_hash: "2".repeat(64),
        guess_hash: "3".repeat(64),
        guess_sequence: "1",
        turn_id: "42",
        wallet: "4bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTH",
      },
    }),
    "2026-06-11T00:00:01.000Z",
  );

  assert.equal(result.original.result, "LOSE");
  assert.equal(result.alternative, null);
});

test("runGuessVerificationCycle completes jobs and respects maxJobsPerCycle", async () => {
  const completed: GuessVerificationResult[] = [];
  const result = await runGuessVerificationCycle(
    {
      completeJob: async (_job, verification) => {
        completed.push(verification);
      },
      deadLetterJob: async () => undefined,
      fetchPendingJobs: async () => [job({ id: "job-1" }), job({ id: "job-2" })],
      nowIso: () => "2026-06-11T00:00:01.000Z",
      retryJob: async () => undefined,
    },
    { maxJobsPerCycle: 1 },
  );

  assert.deepEqual(result, {
    completed: 1,
    deadLettered: 0,
    processed: 1,
    retried: 0,
  });
  assert.equal(completed.length, 1);
});

test("runGuessVerificationCycle retries then dead-letters failed jobs", async () => {
  const retried: string[] = [];
  const deadLettered: string[] = [];
  const badJob = job({
    activeRuleArtifact: {
      ...activeArtifact,
      compiledArtifactHash: "4".repeat(64),
    },
  });

  const retryResult = await runGuessVerificationCycle({
    completeJob: async () => undefined,
    deadLetterJob: async (failedJob) => {
      deadLettered.push(failedJob.id);
    },
    fetchPendingJobs: async () => [badJob],
    nowIso: () => "2026-06-11T00:00:01.000Z",
    retryJob: async (failedJob) => {
      retried.push(failedJob.id);
    },
  });

  const deadLetterResult = await runGuessVerificationCycle({
    completeJob: async () => undefined,
    deadLetterJob: async (failedJob) => {
      deadLettered.push(failedJob.id);
    },
    fetchPendingJobs: async () => [job({ ...badJob, attempts: 2 })],
    nowIso: () => "2026-06-11T00:00:01.000Z",
    retryJob: async (failedJob) => {
      retried.push(failedJob.id);
    },
  });

  assert.deepEqual(retryResult, {
    completed: 0,
    deadLettered: 0,
    processed: 1,
    retried: 1,
  });
  assert.deepEqual(deadLetterResult, {
    completed: 0,
    deadLettered: 1,
    processed: 1,
    retried: 0,
  });
  assert.deepEqual(retried, ["job-1"]);
  assert.deepEqual(deadLettered, ["job-1"]);
});
