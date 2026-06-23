import assert from "node:assert/strict";
import { test } from "node:test";
import {
  applyRuleEliminations,
  buildFinalistSnapshots,
  planRuleElectionAction,
  runRuleElection,
  runRuleElectionCycle,
  selectActiveRuleFromSurvivors,
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

test("applyRuleEliminations enforces threshold, cap, survivor floor, and tie-breaks", () => {
  const finalists = [
    { approvalVoteCount: 5, compiledArtifactHash: hex(11), ruleId: 1, sanitizedTextHash: hex(1) },
    { approvalVoteCount: 3, compiledArtifactHash: hex(12), ruleId: 2, sanitizedTextHash: hex(2) },
    { approvalVoteCount: 3, compiledArtifactHash: hex(13), ruleId: 3, sanitizedTextHash: hex(3) },
    { approvalVoteCount: 2, compiledArtifactHash: hex(14), ruleId: 4, sanitizedTextHash: hex(4) },
    { approvalVoteCount: 2, compiledArtifactHash: hex(15), ruleId: 5, sanitizedTextHash: hex(5) },
    { approvalVoteCount: 2, compiledArtifactHash: hex(16), ruleId: 6, sanitizedTextHash: hex(6) },
    { approvalVoteCount: 1, compiledArtifactHash: hex(17), ruleId: 7, sanitizedTextHash: hex(7) },
  ];

  const decision = applyRuleEliminations(finalists, [
    { eliminationVoteCount: 6, ruleId: 1 },
    { eliminationVoteCount: 8, ruleId: 2 },
    { eliminationVoteCount: 8, ruleId: 3 },
    { eliminationVoteCount: 4, ruleId: 4 },
    { eliminationVoteCount: 4, ruleId: 5 },
    { eliminationVoteCount: 4, ruleId: 6 },
    { eliminationVoteCount: 1, ruleId: 7 },
  ]);

  assert.deepEqual(decision.eliminatedRuleIds, [1, 2, 3, 4, 5]);
  assert.deepEqual(decision.survivorRuleIds, [6, 7]);
  assert.equal(decision.finalists.find((finalist) => finalist.ruleId === 7)?.threshold, 2);
  assert.match(decision.eliminatedFinalistHash, /^[0-9a-f]{64}$/);
  assert.match(decision.survivorFinalistHash, /^[0-9a-f]{64}$/);
});

test("selectActiveRuleFromSurvivors only selects non-eliminated finalists", () => {
  const candidates = [candidate(1, 10, 1), candidate(2, 9, 2), candidate(3, 8, 3)];
  const finalistRuleIds = [1, 2, 3];
  const finalists = buildFinalistSnapshots(candidates, finalistRuleIds);
  const decision = applyRuleEliminations(finalists, [
    { eliminationVoteCount: 11, ruleId: 1 },
    { eliminationVoteCount: 0, ruleId: 2 },
    { eliminationVoteCount: 0, ruleId: 3 },
  ]);
  const active = selectActiveRuleFromSurvivors(
    finalists,
    decision.survivorRuleIds,
    new Uint8Array(32).fill(12),
    44,
  );

  assert.notEqual(active.activeRuleId, 1);
  assert.ok(decision.survivorRuleIds.includes(active.activeRuleId ?? 0));
  assert.ok(active.electedSurvivorIndex < decision.survivorRuleIds.length);
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
    settleElection: async (_turnId, _source, randomness) =>
      randomness ? { randomness } : undefined,
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

test("runRuleElectionCycle accepts randomness returned by trustless settle", async () => {
  const settledRandomness = new Uint8Array(32).fill(10);
  const { deps, published } = baseDeps({
    fetchRandomness: async () => ({
      randomness: null,
      source: "Rand1111111111111111111111111111111111111",
      status: "ready",
    }),
    fetchTurn: async () => ({
      ...BASE_TURN,
      electionVrfRequest: "Rand1111111111111111111111111111111111111",
      eligibleRulePoolHash: hex(1),
    }),
    settleElection: async () => ({ randomness: settledRandomness }),
  });

  const result = await runRuleElectionCycle(
    3,
    { randomFinalistCount: 7, topVotedFinalistCount: 3 },
    deps,
  );

  assert.equal(result.action, "settle");
  assert.equal(published[0]?.randomnessValue, hex(10));
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
