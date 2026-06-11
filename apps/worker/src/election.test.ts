import assert from "node:assert/strict";
import { test } from "node:test";
import {
  planRuleElectionAction,
  runRuleElection,
  runRuleElectionCycle,
  type ElectionCandidate,
  type ElectionTurn,
  type PublishedRuleElection,
  type RuleElectionCycleDeps,
} from "./election.js";

const BASE_TURN: ElectionTurn = {
  activeRuleId: null,
  electionCutoffTimestampSeconds: 1_000,
  electionVrfRequest: null,
  eligibleRulePoolHash: null,
  turnId: 3,
};

function hex(byte: number) {
  return byte.toString(16).padStart(2, "0").repeat(32);
}

function candidate(
  ruleId: number,
  voteCount: number,
  createdAtSeconds: number,
): ElectionCandidate {
  return {
    compiledArtifactHash: hex(200 - ruleId),
    createdAtSeconds,
    isEligibleState: true,
    isPrecompiledValid: true,
    reportCount: 0,
    ruleId,
    sanitizedTextHash: hex(ruleId),
    voteCount,
  };
}

test("planRuleElectionAction follows cutoff, lock, request, wait, and settle states", () => {
  assert.equal(planRuleElectionAction(BASE_TURN, 999, null), "none");
  assert.equal(planRuleElectionAction(BASE_TURN, 1_000, null), "lock");
  assert.equal(
    planRuleElectionAction(
      { ...BASE_TURN, eligibleRulePoolHash: hex(1) },
      1_000,
      null,
    ),
    "request",
  );
  assert.equal(
    planRuleElectionAction(
      {
        ...BASE_TURN,
        electionVrfRequest: "Rand1111111111111111111111111111111111111",
        eligibleRulePoolHash: hex(1),
      },
      1_000,
      { status: "pending" },
    ),
    "wait",
  );
  assert.equal(
    planRuleElectionAction(
      {
        ...BASE_TURN,
        electionVrfRequest: "Rand1111111111111111111111111111111111111",
        eligibleRulePoolHash: hex(1),
      },
      1_000,
      { randomness: new Uint8Array(32).fill(7), source: "Rand", status: "ready" },
    ),
    "settle",
  );
});

test("runRuleElection selects top voted, random finalists, and active finalist", () => {
  const candidates = [
    candidate(1, 20, 30),
    candidate(2, 21, 10),
    candidate(3, 21, 9),
    candidate(4, 12, 4),
    candidate(5, 11, 5),
    candidate(6, 10, 6),
    candidate(7, 9, 7),
    candidate(8, 8, 8),
    candidate(9, 7, 9),
    candidate(10, 6, 10),
    candidate(11, 5, 11),
    candidate(12, 4, 12),
  ];

  const result = runRuleElection(candidates, new Uint8Array(32).fill(9), 1, {
    randomFinalistCount: 7,
    topVotedFinalistCount: 3,
  });

  assert.deepEqual(result.topVotedRuleIds, [3, 2, 1]);
  assert.equal(result.finalistRuleIds.length, 10);
  assert.equal(result.randomRuleIds.length, 7);
  assert.ok(result.randomRuleIds.every((ruleId) => ![1, 2, 3].includes(ruleId)));
  assert.ok(result.activeRuleId);
  assert.ok(result.electedFinalistIndex < result.finalistRuleIds.length);
  assert.notEqual(result.eligibleRulePoolHash, hex(0));
});

test("runRuleElection filters invalid candidates and rejects duplicates", () => {
  const result = runRuleElection(
    [
      candidate(1, 1, 1),
      { ...candidate(2, 99, 2), reportCount: 1 },
      { ...candidate(3, 98, 3), isPrecompiledValid: false },
    ],
    new Uint8Array(32).fill(4),
    2,
    { randomFinalistCount: 7, topVotedFinalistCount: 3 },
  );

  assert.deepEqual(result.eligibleRuleIds, [1]);
  assert.equal(result.activeRuleId, 1);
  assert.throws(() =>
    runRuleElection(
      [candidate(1, 1, 1), candidate(1, 2, 2)],
      new Uint8Array(32).fill(4),
      2,
      { randomFinalistCount: 7, topVotedFinalistCount: 3 },
    ),
  );
});

function baseDeps(
  overrides: Partial<RuleElectionCycleDeps> = {},
): { deps: RuleElectionCycleDeps; published: PublishedRuleElection[] } {
  const published: PublishedRuleElection[] = [];
  const deps: RuleElectionCycleDeps = {
    fetchCandidates: async () => [candidate(1, 1, 1)],
    fetchRandomness: async () => null,
    fetchTurn: async () => BASE_TURN,
    lockEligiblePool: async () => undefined,
    nowIso: () => "2026-06-11T00:00:00.000Z",
    nowSeconds: () => 1_000,
    publishElection: async (election) => {
      published.push(election);
    },
    randomnessAccountFor: async () =>
      "Rand1111111111111111111111111111111111111",
    requestElectionVrf: async () => undefined,
    settleElection: async () => undefined,
    ...overrides,
  };
  return { deps, published };
}

test("runRuleElectionCycle locks and publishes the eligible pool", async () => {
  const { deps, published } = baseDeps();
  const result = await runRuleElectionCycle(
    3,
    { randomFinalistCount: 7, topVotedFinalistCount: 3 },
    deps,
  );

  assert.equal(result.action, "lock");
  assert.equal(published[0]?.status, "locked");
  assert.deepEqual(published[0]?.eligibleRuleIds, [1]);
});

test("runRuleElectionCycle settles and publishes the elected active rule", async () => {
  const { deps, published } = baseDeps({
    fetchRandomness: async () => ({
      randomness: new Uint8Array(32).fill(8),
      source: "Rand1111111111111111111111111111111111111",
      status: "ready",
    }),
    fetchTurn: async () => ({
      ...BASE_TURN,
      electionVrfRequest: "Rand1111111111111111111111111111111111111",
      eligibleRulePoolHash: hex(1),
    }),
  });

  const result = await runRuleElectionCycle(
    3,
    { randomFinalistCount: 7, topVotedFinalistCount: 3 },
    deps,
  );

  assert.equal(result.action, "settle");
  assert.equal(result.activeRuleId, 1);
  assert.equal(published[0]?.status, "settled");
  assert.equal(published[0]?.activeRuleId, 1);
  assert.equal(published[0]?.randomnessValue, hex(8));
});
