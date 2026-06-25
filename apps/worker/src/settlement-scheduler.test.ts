import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import type { ApiBridge } from "./api-bridge.js";
import type { ElectionCandidate, RuleElectionConfig } from "./election.js";
import type { SettlementSenders, SettlementTurnState } from "./settlement.js";
import {
  planSettlementAction,
  runSettlementCycle,
  type SettlementCycleDeps,
  type SettlementSnapshot,
} from "./settlement-scheduler.js";

const ZERO = new PublicKey("11111111111111111111111111111111");
const SET = new PublicKey("FWBa3Ubjyv7niKs3cxQkccmBvym3yoH9bYCXmUB5W1oq");
const HASH = "ab".repeat(32);

function makeState(
  overrides: Partial<SettlementTurnState> = {},
): SettlementTurnState {
  return {
    activeElectionVrfFulfillment: ZERO,
    activeElectionVrfRequest: ZERO,
    activeRuleArtifactHash: null,
    activeRuleHash: null,
    activeRuleId: null,
    drawResult: null,
    drawStatus: "not_requested",
    drawVrfRequest: ZERO,
    drawnAtSeconds: 0,
    electionCutoffTimestampSeconds: 1_000,
    electionVrfFulfillment: ZERO,
    electionVrfRequest: ZERO,
    eligibleRulePoolHash: null,
    eliminatedFinalistHash: null,
    eliminationWindowEndSeconds: 0,
    eliminationWindowStartSeconds: 0,
    endTimestampSeconds: 1_000,
    finalistCount: 0,
    finalistEliminated: [],
    finalistRuleIds: [],
    finalistSetHash: null,
    randomFinalistHash: null,
    status: "open",
    survivorFinalistHash: null,
    topVotedFinalistHash: null,
    turnId: 1,
    ...overrides,
  };
}

function snapshot(
  onChain: SettlementTurnState,
  options: {
    eligibleCandidateCount?: number;
    nowSeconds?: number;
    recordedStates?: string[];
  } = {},
): SettlementSnapshot {
  return {
    eligibleCandidateCount: options.eligibleCandidateCount ?? 0,
    nowSeconds: options.nowSeconds ?? 2_000,
    onChain,
    recordedStates: new Set(options.recordedStates ?? []),
  };
}

test("planner waits before the election cutoff and locks the pool after it", () => {
  const eligible = { eligibleCandidateCount: 2 };
  assert.equal(
    planSettlementAction(
      snapshot(makeState(), { ...eligible, nowSeconds: 500 }),
    ).kind,
    "wait",
  );
  assert.equal(
    planSettlementAction(
      snapshot(makeState(), { ...eligible, nowSeconds: 1_500 }),
    ).kind,
    "lock_pool",
  );
});

test("planner walks the two-step election pipeline in order", () => {
  const eligible = { eligibleCandidateCount: 2, nowSeconds: 2_000 };
  assert.equal(
    planSettlementAction(
      snapshot(makeState({ eligibleRulePoolHash: HASH }), eligible),
    ).kind,
    "request_finalist_vrf",
  );
  assert.equal(
    planSettlementAction(
      snapshot(
        makeState({ eligibleRulePoolHash: HASH, electionVrfRequest: SET }),
        eligible,
      ),
    ).kind,
    "settle_finalist_vrf",
  );
  assert.equal(
    planSettlementAction(
      snapshot(
        makeState({
          eligibleRulePoolHash: HASH,
          eliminationWindowEndSeconds: 5_000,
          finalistSetHash: HASH,
        }),
        eligible,
      ),
    ).kind,
    "wait",
  );
  assert.equal(
    planSettlementAction(
      snapshot(
        makeState({
          eligibleRulePoolHash: HASH,
          eliminationWindowEndSeconds: 1_500,
          finalistSetHash: HASH,
        }),
        eligible,
      ),
    ).kind,
    "close_elimination_window",
  );
  assert.equal(
    planSettlementAction(
      snapshot(
        makeState({
          eligibleRulePoolHash: HASH,
          finalistSetHash: HASH,
          survivorFinalistHash: HASH,
        }),
        eligible,
      ),
    ).kind,
    "request_active_vrf",
  );
  assert.equal(
    planSettlementAction(
      snapshot(
        makeState({
          activeElectionVrfRequest: SET,
          eligibleRulePoolHash: HASH,
          finalistSetHash: HASH,
          survivorFinalistHash: HASH,
        }),
        eligible,
      ),
    ).kind,
    "settle_active_vrf",
  );
});

test("planner still runs the active election after elimination drops the live eligible recount to 0", () => {
  // `close_elimination_window` flips the survivor's rule state Eligible ->
  // SurvivedElimination, so a live eligibility recount returns 0. The pipeline
  // must keep going (pool is locked) and not fall back to original-only.
  const plan = planSettlementAction(
    snapshot(
      makeState({
        eligibleRulePoolHash: HASH,
        finalistSetHash: HASH,
        survivorFinalistHash: HASH,
      }),
      { eligibleCandidateCount: 0, nowSeconds: 2_000 },
    ),
  );
  assert.equal(plan.kind, "request_active_vrf");
});

test("planner treats a settled active election with no elected rule as no-alternative", () => {
  const plan = planSettlementAction(
    snapshot(
      makeState({
        activeElectionVrfFulfillment: SET,
        activeElectionVrfRequest: SET,
        eligibleRulePoolHash: HASH,
        finalistSetHash: HASH,
        survivorFinalistHash: HASH,
      }),
      { eligibleCandidateCount: 0, nowSeconds: 2_000 },
    ),
  );
  // Active election settled but activeRuleId still null -> fall through to draw.
  assert.equal(plan.kind, "project_original_only_election");
});

test("planner skips the election branch when no rules are eligible", () => {
  const plan = planSettlementAction(
    snapshot(makeState(), { eligibleCandidateCount: 0, nowSeconds: 2_000 }),
  );
  assert.equal(plan.kind, "project_original_only_election");

  const afterProjection = planSettlementAction(
    snapshot(makeState(), {
      eligibleCandidateCount: 0,
      nowSeconds: 2_000,
      recordedStates: ["RULE_ELECTED"],
    }),
  );
  assert.equal(afterProjection.kind, "request_draw");
});

test("planner drives the draw then closes the turn", () => {
  assert.equal(
    planSettlementAction(
      snapshot(makeState({ activeRuleId: 7 }), {
        eligibleCandidateCount: 2,
        nowSeconds: 2_000,
      }),
    ).kind,
    "request_draw",
  );
  assert.equal(
    planSettlementAction(
      snapshot(makeState({ activeRuleId: 7, drawStatus: "requested" }), {
        eligibleCandidateCount: 2,
        nowSeconds: 2_000,
      }),
    ).kind,
    "settle_draw",
  );
  assert.equal(
    planSettlementAction(
      snapshot(makeState({ activeRuleId: 7, drawStatus: "fulfilled" }), {
        eligibleCandidateCount: 2,
        nowSeconds: 2_000,
      }),
    ).kind,
    "close_turn",
  );
});

test("planner runs the post-close projection sequence then stops", () => {
  const closed = makeState({ drawStatus: "fulfilled", status: "closed" });
  assert.equal(
    planSettlementAction(snapshot(closed)).kind,
    "project_verification",
  );
  assert.equal(
    planSettlementAction(snapshot(closed, { recordedStates: ["VERIFYING"] })).kind,
    "project_winners_rewards",
  );
  assert.equal(
    planSettlementAction(
      snapshot(closed, { recordedStates: ["VERIFYING", "FINALIZED"] }),
    ).kind,
    "record_claims",
  );
  const claimable = planSettlementAction(
    snapshot(closed, {
      recordedStates: ["VERIFYING", "FINALIZED", "CLAIMABLE"],
    }),
  );
  assert.equal(claimable.kind, "done");
  assert.equal(claimable.toState, "CLOSED");
  assert.equal(
    planSettlementAction(snapshot(closed, { recordedStates: ["CLOSED"] })).kind,
    "done",
  );
});

const electionConfig: RuleElectionConfig = {
  randomFinalistCount: 7,
  topVotedFinalistCount: 3,
};

function fakeBridge() {
  const recorded = new Set<string>();
  const calls: string[] = [];
  const bridge = {
    async calculateRewards() {
      calls.push("calculateRewards");
    },
    async calculateWinners() {
      calls.push("calculateWinners");
    },
    async createClaims() {
      calls.push("createClaims");
    },
    async createVerificationJobs() {
      calls.push("createVerificationJobs");
    },
    async fetchRecordedStates() {
      return new Set(recorded);
    },
    async projectVerificationResults() {
      calls.push("projectVerificationResults");
      return { failed: [], posted: 0, turnId: 1 };
    },
    async publishDraw() {
      calls.push("publishDraw");
    },
    async publishElection() {
      calls.push("publishElection");
    },
    async recordSettlementTransition(input: { idempotencyKey: string; toState: string }) {
      calls.push(`record:${input.toState}`);
      recorded.add(input.toState);
    },
  };
  return { bridge: bridge as unknown as ApiBridge, calls, recorded };
}

test("orchestrator drives a closed no-rule turn through CLOSED idempotently", async () => {
  const { bridge, calls, recorded } = fakeBridge();
  const state = makeState({
    drawStatus: "fulfilled",
    drawResult: [1, 2, 3, 4, 5, 6],
    status: "closed",
  });
  const senders = {
    async fetchState() {
      return state;
    },
  } as unknown as SettlementSenders;
  let recordedClaims = 0;
  const deps: SettlementCycleDeps = {
    bridge,
    electionConfig,
    fetchCandidates: async () => [] as ElectionCandidate[],
    nowIso: () => "2026-06-23T00:00:00.000Z",
    nowSeconds: () => 2_000,
    recordClaims: async () => {
      recordedClaims += 1;
      return 0;
    },
    senders,
  };

  const actions: string[] = [];
  for (let i = 0; i < 5; i += 1) {
    actions.push((await runSettlementCycle(1, deps)).action);
  }

  assert.deepEqual(actions, [
    "project_verification",
    "project_winners_rewards",
    "record_claims",
    "done",
    "done",
  ]);
  assert.deepEqual(
    [...recorded].sort(),
    ["CLAIMABLE", "CLOSED", "FINALIZED", "VERIFYING"],
  );
  // CLOSED transition recorded exactly once (idempotent terminal).
  assert.equal(calls.filter((call) => call === "record:CLOSED").length, 1);
  assert.equal(recordedClaims, 1);
  assert.ok(calls.includes("calculateWinners"));
});
