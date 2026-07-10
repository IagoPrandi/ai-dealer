import { createHash } from "node:crypto";
import { deriveDrawNumbers, type PublishedDraw } from "./draw.js";
import {
  type ElectionCandidate,
  type PublishedRuleElection,
  type RuleElectionConfig,
  runRuleElection,
} from "./election.js";
import type { ApiBridge, PublishedRuleElimination } from "./api-bridge.js";
import type {
  SettleVrfResult,
  SettlementSenders,
  SettlementTurnState,
} from "./settlement.js";

/**
 * M5.3 settlement scheduler — drives the turn's phase-2 pipeline (finalist
 * shortlist → elimination window → active rule → draw) as an idempotent,
 * state-machine-ordered loop (PRD §5.4/§5.5) and projects results to the API
 * so the read side populates.
 *
 * On-chain is the source of truth: the election pipeline (lock → finalist VRF →
 * elimination window → close → active VRF → freeze) requires the turn to stay
 * `Open` (`validate_live_turn`), so it runs during phase 2 — after the
 * rule-election cutoff (the phase-1 → phase-2 boundary) but before
 * `close_turn`; the draw runs once the turn ends; `close_turn` is issued
 * only after settlement so the pipeline is never wedged (the M5.2 follow-up).
 * The off-chain projection steps (verification → winners/rewards → claims →
 * closed) are sequenced by the set of §5.5 transitions already recorded in the
 * M3.7 hash-chained audit log, so a retried cycle never double-projects or
 * double-pays (PRD §10.13).
 */

const ZERO_HASH_HEX = "00".repeat(32);

/** PRD §5.5 milestone labels persisted as settlement-transition `toState`s. */
export const SETTLEMENT_STATES = {
  ACTIVE_ELECTION_VRF_REQUESTED: "ACTIVE_ELECTION_VRF_REQUESTED",
  CLAIMABLE: "CLAIMABLE",
  CLOSED: "CLOSED",
  DRAW_PENDING: "DRAW_PENDING",
  DRAWN: "DRAWN",
  ELECTION_VRF_REQUESTED: "ELECTION_VRF_REQUESTED",
  ELIGIBLE_RULE_POOL_LOCKED: "ELIGIBLE_RULE_POOL_LOCKED",
  ELIMINATION_WINDOW_CLOSED: "ELIMINATION_WINDOW_CLOSED",
  FINALIZED: "FINALIZED",
  RULE_ELECTED: "RULE_ELECTED",
  RULE_FINALISTS_SELECTED: "RULE_FINALISTS_SELECTED",
  RULE_FROZEN: "RULE_FROZEN",
  TURN_CLOSED: "TURN_CLOSED",
  VERIFYING: "VERIFYING",
} as const;

export type SettlementActionKind =
  | "close_elimination_window"
  | "close_turn"
  | "done"
  | "lock_pool"
  | "project_original_only_election"
  | "project_verification"
  | "project_winners_rewards"
  | "record_claims"
  | "request_active_vrf"
  | "request_draw"
  | "request_finalist_vrf"
  | "settle_active_vrf"
  | "settle_draw"
  | "settle_finalist_vrf"
  | "wait";

export interface SettlementPlan {
  fromState: string;
  kind: SettlementActionKind;
  reason: string;
  toState: string | null;
}

export interface SettlementSnapshot {
  eligibleCandidateCount: number;
  nowSeconds: number;
  onChain: SettlementTurnState;
  recordedStates: ReadonlySet<string>;
}

function isSetPubkey(value: { toBase58(): string }) {
  return value.toBase58() !== "11111111111111111111111111111111";
}

export function isEligibleSettlementCandidate(candidate: ElectionCandidate) {
  return (
    candidate.isEligibleState &&
    candidate.isPrecompiledValid &&
    candidate.compiledArtifactHash.toLowerCase() !== ZERO_HASH_HEX &&
    candidate.reportCount === 0
  );
}

/**
 * Pure decision function: given the on-chain settlement state, the eligible
 * candidate count, the recorded §5.5 transitions, and the current time, decide
 * the single next pipeline action. Returns `wait` when nothing is actionable
 * yet (before cutoff, mid VRF reveal latency, open elimination window, before
 * the play window ends) and `done` once the turn is fully CLOSED.
 */
export function planSettlementAction(
  snapshot: SettlementSnapshot,
): SettlementPlan {
  const s = snapshot.onChain;
  const now = snapshot.nowSeconds;
  const recorded = snapshot.recordedStates;
  const hasEligible = snapshot.eligibleCandidateCount > 0;

  if (recorded.has(SETTLEMENT_STATES.CLOSED)) {
    return { fromState: "CLOSED", kind: "done", reason: "already_closed", toState: null };
  }

  // ---- Post-close off-chain projection sequence -------------------------
  if (s.status === "closed") {
    if (s.drawStatus !== "fulfilled") {
      return {
        fromState: "TURN_CLOSED",
        kind: "wait",
        reason: "closed_without_fulfilled_draw",
        toState: null,
      };
    }
    if (!recorded.has(SETTLEMENT_STATES.VERIFYING)) {
      return plan("TURN_CLOSED", "project_verification", SETTLEMENT_STATES.VERIFYING);
    }
    if (!recorded.has(SETTLEMENT_STATES.FINALIZED)) {
      return plan("VERIFYING", "project_winners_rewards", SETTLEMENT_STATES.FINALIZED);
    }
    if (!recorded.has(SETTLEMENT_STATES.CLAIMABLE)) {
      return plan("FINALIZED", "record_claims", SETTLEMENT_STATES.CLAIMABLE);
    }
    return plan("CLAIMABLE", "done", SETTLEMENT_STATES.CLOSED);
  }

  // ---- On-chain pipeline (turn still Open) ------------------------------
  // Election pipeline. It runs while no active rule is elected AND the active
  // election has not yet been settled, AND either the pool is already locked
  // (election in progress) or eligible rules exist (PRD §6.12: zero eligible
  // rules at the start skips the decision/election branch entirely). Keying the
  // "in progress" case on `eligibleRulePoolHash` rather than a live eligibility
  // recount is essential: `close_elimination_window` flips the survivor's rule
  // state from `Eligible` to `SurvivedElimination`, so a recount would wrongly
  // drop to zero eligible and skip the active election.
  const electionInProgress = s.eligibleRulePoolHash !== null;
  const activeElectionSettled = isSetPubkey(s.activeElectionVrfFulfillment);
  if (
    s.activeRuleId === null &&
    !activeElectionSettled &&
    (electionInProgress || hasEligible)
  ) {
    if (!s.eligibleRulePoolHash) {
      if (now < s.electionCutoffTimestampSeconds) {
        return waitPlan("OPEN", "before_election_cutoff");
      }
      return plan("VOTING_CLOSED", "lock_pool", SETTLEMENT_STATES.ELIGIBLE_RULE_POOL_LOCKED);
    }
    if (!s.finalistSetHash) {
      return isSetPubkey(s.electionVrfRequest)
        ? plan(
            "ELECTION_VRF_REQUESTED",
            "settle_finalist_vrf",
            SETTLEMENT_STATES.RULE_FINALISTS_SELECTED,
          )
        : plan(
            "ELIGIBLE_RULE_POOL_LOCKED",
            "request_finalist_vrf",
            SETTLEMENT_STATES.ELECTION_VRF_REQUESTED,
          );
    }
    if (!s.survivorFinalistHash) {
      return now >= s.eliminationWindowEndSeconds
        ? plan(
            "ELIMINATION_WINDOW_OPEN",
            "close_elimination_window",
            SETTLEMENT_STATES.ELIMINATION_WINDOW_CLOSED,
          )
        : waitPlan("ELIMINATION_WINDOW_OPEN", "elimination_window_open");
    }
    return isSetPubkey(s.activeElectionVrfRequest)
      ? plan("ACTIVE_ELECTION_VRF_REQUESTED", "settle_active_vrf", SETTLEMENT_STATES.RULE_FROZEN)
      : plan(
          "ELIMINATION_WINDOW_CLOSED",
          "request_active_vrf",
          SETTLEMENT_STATES.ACTIVE_ELECTION_VRF_REQUESTED,
        );
  }

  // ---- Draw (after the play window ends; active rule frozen or no rules) -
  if (now < s.endTimestampSeconds) {
    return waitPlan("RULE_FROZEN", "before_play_window_end");
  }
  if (s.drawStatus === "not_requested" || s.drawStatus === "failed") {
    // No alternative rule was elected (none eligible, or the active election
    // produced no valid rule): project the original-rule-only election once,
    // then draw. When an alternative IS frozen, the settled-election projection
    // was already published by the active-election step, so go straight to draw.
    if (s.activeRuleId === null && !recorded.has(SETTLEMENT_STATES.RULE_ELECTED)) {
      return plan(
        "RULE_ELECTED",
        "project_original_only_election",
        SETTLEMENT_STATES.RULE_ELECTED,
      );
    }
    return plan("RULE_FROZEN", "request_draw", SETTLEMENT_STATES.DRAW_PENDING);
  }
  if (s.drawStatus === "requested") {
    return plan("DRAW_PENDING", "settle_draw", SETTLEMENT_STATES.DRAWN);
  }
  // drawStatus === "fulfilled" and turn still Open → close it.
  return plan("DRAWN", "close_turn", SETTLEMENT_STATES.TURN_CLOSED);
}

function plan(
  fromState: string,
  kind: SettlementActionKind,
  toState: string,
): SettlementPlan {
  return { fromState, kind, reason: kind, toState };
}

function waitPlan(fromState: string, reason: string): SettlementPlan {
  return { fromState, kind: "wait", reason, toState: null };
}

export interface SettlementCycleDeps {
  bridge: ApiBridge;
  electionConfig: RuleElectionConfig;
  fetchCandidates: (turnId: number) => Promise<ElectionCandidate[]>;
  nowIso: () => string;
  nowSeconds: () => number;
  // Records the turn's claims on-chain (`record_claim`) after the API computes
  // them — the CLAIMABLE step (PRD §5.5). Returns the number of claims recorded.
  recordClaims: (turnId: number) => Promise<number>;
  senders: SettlementSenders;
}

export interface SettlementCycleResult {
  action: SettlementActionKind | "none";
  reason?: string;
  signature?: string;
  toState?: string;
  turnId: number;
}

/**
 * Run exactly one settlement transition for a turn: read on-chain + recorded
 * state, plan the next action, execute it, project to the API, and record the
 * transition into the hash-chained audit log. Designed to be called repeatedly
 * by the scheduler loop until it returns `done`.
 */
export async function runSettlementCycle(
  turnId: number,
  deps: SettlementCycleDeps,
): Promise<SettlementCycleResult> {
  const onChain = await deps.senders.fetchState(turnId);
  if (!onChain) {
    return { action: "none", turnId };
  }

  const candidates = await deps.fetchCandidates(turnId);
  const eligible = candidates.filter(isEligibleSettlementCandidate);
  const recordedStates = await deps.bridge.fetchRecordedStates(turnId);
  const plan = planSettlementAction({
    eligibleCandidateCount: eligible.length,
    nowSeconds: deps.nowSeconds(),
    onChain,
    recordedStates,
  });

  if (plan.kind !== "done") {
    await syncClosedTurnReadSide({
      deps,
      eligible,
      onChain,
      turnId,
    });
  }

  if (plan.kind === "wait" || plan.kind === "done") {
    if (plan.kind === "wait") {
      await syncVisibleWaitState({
        deps,
        eligible,
        onChain,
        plan,
        turnId,
      });
    }
    if (plan.kind === "done" && plan.toState === SETTLEMENT_STATES.CLOSED) {
      await recordTransition(deps, turnId, plan, onChain, null);
      return { action: "done", reason: plan.reason, toState: plan.toState, turnId };
    }
    return { action: plan.kind, reason: plan.reason, turnId };
  }

  const signature = await executeAction({
    candidates,
    deps,
    eligible,
    onChain,
    plan,
    turnId,
  });

  // settle_* actions return null when randomness is not yet revealable; that is
  // a wait, not a transition.
  if (signature === null) {
    return { action: "wait", reason: "vrf_reveal_pending", turnId };
  }

  await recordTransition(deps, turnId, plan, onChain, signature);
  return {
    action: plan.kind,
    ...(signature ? { signature } : {}),
    ...(plan.toState ? { toState: plan.toState } : {}),
    turnId,
  };
}

async function syncClosedTurnReadSide(args: {
  deps: SettlementCycleDeps;
  eligible: ElectionCandidate[];
  onChain: SettlementTurnState;
  turnId: number;
}) {
  const { deps, eligible, onChain, turnId } = args;
  if (onChain.status !== "closed" || onChain.drawStatus !== "fulfilled") {
    return;
  }

  if (onChain.activeRuleId === null) {
    await deps.bridge.publishElection(
      buildOriginalOnlyElection(turnId, deps.electionConfig),
    );
  } else {
    const finalistRandomness = await readRevealedRandomness(
      deps.senders,
      onChain.electionVrfFulfillment,
    );
    const activeRandomness = await readRevealedRandomness(
      deps.senders,
      onChain.activeElectionVrfFulfillment,
    );
    await deps.bridge.publishElection(
      buildElectionProjection({
        ...(activeRandomness ? { activeRandomness } : {}),
        config: deps.electionConfig,
        eligible,
        ...(finalistRandomness ? { finalistRandomness } : {}),
        nowIso: deps.nowIso(),
        state: onChain,
        status: "settled",
      }),
    );
  }

  await deps.bridge.publishDraw(
    await buildFulfilledDrawFromState(onChain, deps, turnId),
  );
}

interface ExecuteArgs {
  candidates: ElectionCandidate[];
  deps: SettlementCycleDeps;
  eligible: ElectionCandidate[];
  onChain: SettlementTurnState;
  plan: SettlementPlan;
  turnId: number;
}

/**
 * Execute the planned on-chain/projection action. Returns the transaction
 * signature (or an empty string for projection-only steps), or `null` when a
 * `settle_*` step must wait for the VRF reveal slot.
 */
async function executeAction(args: ExecuteArgs): Promise<string | null> {
  const { candidates, deps, eligible, onChain, plan, turnId } = args;
  const { senders } = deps;

  switch (plan.kind) {
    case "lock_pool": {
      const signature = await senders.lockEligiblePool(turnId, candidates);
      await deps.bridge.publishElection(
        buildElectionProjection({
          config: deps.electionConfig,
          eligible,
          nowIso: deps.nowIso(),
          state: onChain,
          status: "locked",
        }),
      );
      return signature;
    }
    case "request_finalist_vrf": {
      const { randomnessAccount } = await senders.createCommittedRandomness();
      return senders.requestElectionVrf(turnId, randomnessAccount);
    }
    case "settle_finalist_vrf": {
      const ready = await isRevealable(senders, onChain.electionVrfRequest);
      if (!ready) {
        return null;
      }
      const result = await senders.settleElection(
        turnId,
        onChain.electionVrfRequest.toBase58(),
        candidates,
      );
      const next = await senders.fetchState(turnId);
      await deps.bridge.publishElection(
        buildElectionProjection({
          config: deps.electionConfig,
          eligible,
          finalistRandomness: result.randomness,
          nowIso: deps.nowIso(),
          state: next ?? onChain,
          status: "requested",
        }),
      );
      // Settling the finalist VRF opens the on-chain elimination window;
      // project it so the read side can surface the decision phase with its
      // real start/end timestamps.
      const opened = buildEliminationProjection(next ?? onChain, null);
      if (opened) {
        await deps.bridge.publishRuleElimination(opened);
      }
      return result.signature;
    }
    case "close_elimination_window": {
      const finalists = candidates.filter((candidate) =>
        onChain.finalistRuleIds.includes(candidate.ruleId),
      );
      const signature = await senders.closeEliminationWindow(turnId, finalists);
      const next = await senders.fetchState(turnId);
      const closed = buildEliminationProjection(next ?? onChain, deps.nowIso());
      if (closed) {
        await deps.bridge.publishRuleElimination(closed);
      }
      return signature;
    }
    case "request_active_vrf": {
      const { randomnessAccount } = await senders.createCommittedRandomness();
      return senders.requestActiveElectionVrf(turnId, randomnessAccount);
    }
    case "settle_active_vrf": {
      const ready = await isRevealable(senders, onChain.activeElectionVrfRequest);
      if (!ready) {
        return null;
      }
      const finalistRandomness = await readRevealedRandomness(
        senders,
        onChain.electionVrfFulfillment,
      );
      const finalists = candidates.filter((candidate) =>
        onChain.finalistRuleIds.includes(candidate.ruleId),
      );
      const result = await senders.settleActiveElection(
        turnId,
        onChain.activeElectionVrfRequest.toBase58(),
        finalists,
      );
      const next = await senders.fetchState(turnId);
      await deps.bridge.publishElection(
        buildElectionProjection({
          activeRandomness: result.randomness,
          config: deps.electionConfig,
          eligible,
          ...(finalistRandomness ? { finalistRandomness } : {}),
          nowIso: deps.nowIso(),
          state: next ?? onChain,
          status: "settled",
        }),
      );
      return result.signature;
    }
    case "project_original_only_election": {
      await deps.bridge.publishElection(
        buildOriginalOnlyElection(turnId, deps.electionConfig),
      );
      return projectionSignature();
    }
    case "request_draw": {
      const { randomnessAccount } = await senders.createCommittedRandomness();
      const signature = await senders.requestDraw(turnId, randomnessAccount);
      await deps.bridge.publishDraw(
        buildRequestedDraw(turnId, randomnessAccount, deps.nowIso()),
      );
      return signature;
    }
    case "settle_draw": {
      const ready = await isRevealable(senders, onChain.drawVrfRequest);
      if (!ready) {
        return null;
      }
      const result = await senders.settleDraw(
        turnId,
        onChain.drawVrfRequest.toBase58(),
      );
      await deps.bridge.publishDraw(
        buildFulfilledDraw(turnId, onChain.drawVrfRequest.toBase58(), result, deps.nowIso()),
      );
      return result.signature;
    }
    case "close_turn":
      return senders.closeTurn(turnId);
    case "project_verification": {
      await deps.bridge.createVerificationJobs(turnId);
      const verification = await deps.bridge.projectVerificationResults(
        turnId,
        deps.nowIso,
      );
      if (verification.failed.length > 0) {
        throw new Error(
          `verification projection failed for ${verification.failed.length} guess(es): ${JSON.stringify(
            verification.failed,
          )}`,
        );
      }
      return projectionSignature();
    }
    case "project_winners_rewards": {
      await deps.bridge.calculateWinners(turnId);
      await deps.bridge.calculateRewards(turnId);
      return projectionSignature();
    }
    case "record_claims": {
      // Records the turn's available claims on-chain via `record_claim` (the
      // call also ensures the API has computed them first). Already-recorded
      // claims are treated as success, so this is idempotent across retries.
      await deps.recordClaims(turnId);
      return projectionSignature();
    }
    default:
      return projectionSignature();
  }
}

async function syncVisibleWaitState(args: {
  deps: SettlementCycleDeps;
  eligible: ElectionCandidate[];
  onChain: SettlementTurnState;
  plan: SettlementPlan;
  turnId: number;
}) {
  const { deps, eligible, onChain, plan } = args;
  if (plan.reason !== "elimination_window_open") {
    return;
  }

  const opened = buildEliminationProjection(onChain, null);
  if (!opened || opened.status !== "open") {
    return;
  }

  const finalistRandomness = await readRevealedRandomness(
    deps.senders,
    onChain.electionVrfFulfillment,
  );
  await deps.bridge.publishElection(
    buildElectionProjection({
      config: deps.electionConfig,
      eligible,
      ...(finalistRandomness ? { finalistRandomness } : {}),
      nowIso: deps.nowIso(),
      state: onChain,
      status: "requested",
    }),
  );
  await deps.bridge.publishRuleElimination(opened);
}

async function isRevealable(
  senders: SettlementSenders,
  account: { toBase58(): string },
): Promise<boolean> {
  if (account.toBase58() === "11111111111111111111111111111111") {
    return false;
  }
  const state = await senders.fetchRandomnessFor(
    account as Parameters<SettlementSenders["fetchRandomnessFor"]>[0],
    "failed",
  );
  if (!state) {
    return false;
  }
  if (state.status === "pending") {
    return false;
  }
  if (state.status === "failed") {
    throw new Error(
      `randomness ${account.toBase58()} was revealed outside the settle slot; re-request required`,
    );
  }
  return true;
}

async function readRevealedRandomness(
  senders: SettlementSenders,
  account: { toBase58(): string },
) {
  if (account.toBase58() === "11111111111111111111111111111111") {
    return undefined;
  }
  const state = await senders.fetchRandomnessFor(
    account as Parameters<SettlementSenders["fetchRandomnessFor"]>[0],
    "ready",
  );
  return state?.status === "ready" && state.randomness
    ? state.randomness
    : undefined;
}

// Projection-only steps and the atomic reveal+settle (whose signature is the
// callback tx) record a transition without a distinct broadcast signature.
function projectionSignature() {
  return "";
}

async function recordTransition(
  deps: SettlementCycleDeps,
  turnId: number,
  plan: SettlementPlan,
  inputState: SettlementTurnState,
  signature: string | null,
) {
  if (!plan.toState) {
    return;
  }
  const inputHash = hashJson({
    activeRuleId: inputState.activeRuleId,
    drawStatus: inputState.drawStatus,
    eligibleRulePoolHash: inputState.eligibleRulePoolHash,
    finalistSetHash: inputState.finalistSetHash,
    fromState: plan.fromState,
    status: inputState.status,
    survivorFinalistHash: inputState.survivorFinalistHash,
    turnId,
  });
  const outputHash = hashJson({
    signature: signature ?? null,
    toState: plan.toState,
    turnId,
  });
  await deps.bridge.recordSettlementTransition({
    fromState: plan.fromState,
    idempotencyKey: `${turnId}:${plan.toState}`,
    inputHash,
    outputHash,
    recordedAt: deps.nowIso(),
    signature: signature ? signature : null,
    toState: plan.toState,
    transitionReason: plan.reason,
    turnId,
  });
}

function buildElectionProjection(args: {
  activeRandomness?: Uint8Array;
  config: RuleElectionConfig;
  eligible: ElectionCandidate[];
  finalistRandomness?: Uint8Array;
  nowIso: string;
  state: SettlementTurnState;
  status: PublishedRuleElection["status"];
}): PublishedRuleElection {
  const { activeRandomness, config, eligible, finalistRandomness, nowIso, state, status } = args;
  const finalistRuleIds = state.finalistRuleIds;
  const topCount = Math.min(config.topVotedFinalistCount, finalistRuleIds.length);
  const topVotedRuleIds = finalistRuleIds.slice(0, topCount);
  const randomRuleIds = finalistRuleIds.slice(topCount);
  const eliminatedRuleIds = finalistRuleIds.filter(
    (_, index) => state.finalistEliminated[index],
  );
  const survivorRuleIds = finalistRuleIds.filter(
    (_, index) => !state.finalistEliminated[index],
  );
  const electedFinalistIndex =
    state.activeRuleId !== null
      ? Math.max(0, finalistRuleIds.indexOf(state.activeRuleId))
      : 0;

  const election: PublishedRuleElection = {
    activeElectionRandomnessAccount: isSetPubkey(state.activeElectionVrfRequest)
      ? state.activeElectionVrfRequest.toBase58()
      : null,
    activeElectionRandomnessSource: isSetPubkey(state.activeElectionVrfFulfillment)
      ? state.activeElectionVrfFulfillment.toBase58()
      : null,
    activeElectionRandomnessValue: null,
    eligibleCandidateCommitments: eligible
      .map((candidate) => ({ ...candidate }))
      .sort((left, right) => left.ruleId - right.ruleId),
    activeRuleArtifactHash: state.activeRuleArtifactHash,
    activeRuleHash: state.activeRuleHash,
    activeRuleId: state.activeRuleId,
    electedFinalistIndex,
    electedSurvivorIndex: null,
    eligibleRuleIds: eligible.map((candidate) => candidate.ruleId).sort((a, b) => a - b),
    eligibleRulePoolHash: state.eligibleRulePoolHash ?? ZERO_HASH_HEX,
    eliminatedFinalistHash: state.eliminatedFinalistHash,
    eliminatedRuleIds,
    finalistRuleIds,
    finalistSetHash: state.finalistSetHash ?? ZERO_HASH_HEX,
    randomFinalistHash: state.randomFinalistHash ?? ZERO_HASH_HEX,
    randomRuleIds,
    randomnessAccount: isSetPubkey(state.electionVrfRequest)
      ? state.electionVrfRequest.toBase58()
      : null,
    randomnessSource: isSetPubkey(state.electionVrfFulfillment)
      ? state.electionVrfFulfillment.toBase58()
      : null,
    randomnessValue: finalistRandomness
      ? Buffer.from(finalistRandomness).toString("hex")
      : null,
    requestedAt: null,
    settledAt: status === "settled" ? nowIso : null,
    status,
    survivorFinalistHash: state.survivorFinalistHash,
    survivorRuleIds,
    topVotedFinalistHash: state.topVotedFinalistHash ?? ZERO_HASH_HEX,
    topVotedRuleIds,
    turnId: state.turnId,
  };

  if (activeRandomness) {
    election.activeElectionRandomnessValue =
      Buffer.from(activeRandomness).toString("hex");
  }

  return election;
}

/**
 * Elimination decision-window projection from the on-chain turn state. Returns
 * `null` before the window exists (finalist VRF not settled yet). `closedAtIso`
 * marks the close projection; the open projection passes `null`.
 */
function buildEliminationProjection(
  state: SettlementTurnState,
  closedAtIso: string | null,
): PublishedRuleElimination | null {
  if (
    state.finalistRuleIds.length === 0 ||
    state.eliminationWindowEndSeconds <= 0
  ) {
    return null;
  }
  const eliminatedRuleIds = state.finalistRuleIds.filter(
    (_, index) => state.finalistEliminated[index],
  );
  const survivorRuleIds = state.finalistRuleIds.filter(
    (_, index) => !state.finalistEliminated[index],
  );
  const closed = closedAtIso !== null || state.survivorFinalistHash !== null;
  return {
    closedAt: closed ? closedAtIso : null,
    // The window spans the whole of phase 2: it opens at the phase-1 -> phase-2
    // boundary (the rule-election cutoff, when the finalist set is locked) and
    // closes at the turn end.
    decisionWindowClosesAt: new Date(
      state.eliminationWindowEndSeconds * 1_000,
    ).toISOString(),
    decisionWindowOpenedAt: new Date(
      state.electionCutoffTimestampSeconds * 1_000,
    ).toISOString(),
    eliminatedFinalistHash: state.eliminatedFinalistHash,
    eliminatedRuleIds,
    finalistRuleIds: state.finalistRuleIds,
    status: closed ? "closed" : "open",
    survivorFinalistHash: state.survivorFinalistHash,
    survivorRuleIds,
    turnId: state.turnId,
  };
}

function buildOriginalOnlyElection(
  turnId: number,
  config: RuleElectionConfig,
): PublishedRuleElection {
  // No eligible rules: reuse the deterministic election logic over an empty
  // pool to produce the canonical empty-pool hashes (PRD §6.12).
  const result = runRuleElection([], new Uint8Array(32).fill(1), turnId, config);
  return {
    ...result,
    randomnessAccount: null,
    randomnessSource: null,
    randomnessValue: null,
    requestedAt: null,
    settledAt: null,
    status: "original_only",
    turnId,
  };
}

function buildRequestedDraw(
  turnId: number,
  randomnessAccount: string,
  requestedAt: string,
): PublishedDraw {
  return {
    drawResult: null,
    drawnAt: null,
    failureCode: null,
    randomnessAccount,
    randomnessSource: null,
    randomnessValue: null,
    requestedAt,
    settleSignature: null,
    status: "requested",
    turnId,
  };
}

function buildFulfilledDraw(
  turnId: number,
  randomnessAccount: string,
  result: SettleVrfResult,
  nowIso: string,
): PublishedDraw {
  return {
    drawResult: deriveDrawNumbers(result.randomness, turnId),
    drawnAt: nowIso,
    failureCode: null,
    randomnessAccount,
    randomnessSource: randomnessAccount,
    randomnessValue: Buffer.from(result.randomness).toString("hex"),
    requestedAt: nowIso,
    settleSignature: result.signature,
    status: "fulfilled",
    turnId,
  };
}

async function buildFulfilledDrawFromState(
  state: SettlementTurnState,
  deps: SettlementCycleDeps,
  turnId: number,
): Promise<PublishedDraw> {
  if (!state.drawResult) {
    throw new Error("Cannot rehydrate fulfilled draw without on-chain draw result.");
  }
  const randomness = await readRevealedRandomness(deps.senders, state.drawVrfRequest);
  if (!randomness) {
    throw new Error(
      `Cannot rehydrate fulfilled draw because randomness ${state.drawVrfRequest.toBase58()} is not readable.`,
    );
  }
  const derivedDraw = deriveDrawNumbers(randomness, turnId);
  if (derivedDraw.some((number, index) => number !== state.drawResult?.[index])) {
    throw new Error("On-chain draw result does not match revealed randomness.");
  }
  const drawnAt =
    state.drawnAtSeconds > 0
      ? new Date(state.drawnAtSeconds * 1_000).toISOString()
      : deps.nowIso();
  const randomnessAccount = state.drawVrfRequest.toBase58();
  return {
    drawResult: derivedDraw,
    drawnAt,
    failureCode: null,
    randomnessAccount,
    randomnessSource: randomnessAccount,
    randomnessValue: Buffer.from(randomness).toString("hex"),
    requestedAt: drawnAt,
    settleSignature: null,
    status: "fulfilled",
    turnId,
  };
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}
