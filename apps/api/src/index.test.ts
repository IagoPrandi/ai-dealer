import assert from "node:assert/strict";
import { test } from "node:test";
import {
  M3_7_POSTGRES_AUDIT_SCHEMA,
  authorizeOperatorAiRequest,
  calculateAndStoreRewardRecords,
  calculateAndStoreWinnerRecords,
  calculatePrizePoolAccounting,
  calculateRepeatedActionFeeLamports,
  calculateRewardDistribution,
  completeClaimApproval,
  createClaimRecordsForTurn,
  createGuessVerificationJobsForTurn,
  getAuditLog,
  getClaimSummary,
  getAllowedMethodsForPath,
  getConsoleReadOnlyMethodRejection,
  getPlayerClaimsSummary,
  listConversationDrafts,
  listPlayerHistory,
  getMandatedRuleSignatures,
  getPrizePoolAccounting,
  getRepeatedVoteFeeReconciliation,
  getRewardSummary,
  getActivityEvents,
  getRolloverActivityEvents,
  getRoundSummary,
  getRuleRemovalActivityEvents,
  getRuleValidation,
  getTurnRolloverSettlement,
  getTransparencySnapshot,
  getConsoleSafetyBoundary,
  isRuleRemoved,
  ruleSignature,
  getRuleElimination,
  listClaimRecords,
  listCreatorRewardRecords,
  listPaidRuleRemovals,
  listRuleVotes,
  listRuleEliminationVotes,
  listVoterRewardRecords,
  listWinnerRecords,
  listAuditLogs,
  recordSettlementTransition,
  listSettlementTransitions,
  removeRule,
  RuleRemovalRejectedError,
  resetApiStateForTests,
  runRuleValidationForProposal,
  saveDraw,
  saveGuessReceipt,
  saveGuessVerificationResult,
  savePaidRuleRemoval,
  saveRuleElection,
  saveRuleElimination,
  saveRuleEliminationVote,
  saveRuleProposal,
  saveRuleVote,
  saveConversationDraft,
  saveTurnRollover,
  settleExpiredUnclaimedClaims,
  settleTurnRollover,
  requestClaimApproval,
  storeAuditLogInPostgres,
  toPostgresAuditLogRow,
  verifyAuditLogIntegrity,
  exportOperatorAiOperationsCsv,
  exportTransparencySnapshotCsv,
  getOperatorAiOperationsSnapshot,
  type AuditLogRecord,
  type GuessVerificationResultRecord,
  type RuleProposalRecord,
} from "./index.js";

const wallet = "4bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTH";
const walletTwo = "5bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTJ";
const walletThree = "6bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTK";
const base58 = "6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4";

function hashArray(byte: number) {
  return Array.from({ length: 32 }, () => byte);
}

function proposal(turnId: number, ruleId: number): RuleProposalRecord {
  return {
    addedOperationalClauses: [],
    clarityNote: "",
    dealerMessage: "Win if at least four of your numbers are drawn.",
    maxTokens: 1000,
    needsClarification: false,
    normalizedText:
      "Win if at least 4 of your guessed numbers appear in the draw.",
    normalizedTextHash: hashArray(1),
    officialInterpretation:
      "Compare every eligible guess by counting how many of its numbers appear in the draw; a guess wins when at least four match.",
    officialInterpretationHash: hashArray(2),
    preflightResultHash: hashArray(3),
    proposer: wallet,
    ruleId,
    ruleProposal: base58,
    sanitizedText: "Win if at least 4 of your numbers appear in the draw.",
    sanitizedTextHash: hashArray(4),
    signature: base58,
    submittedAt: "2026-06-12T12:00:00.000Z",
    title: "Win if at least 4 of your numbers appear in",
    tokenCount: 12,
    turnId,
  };
}

function settledElection(turnId: number, activeRuleId: number) {
  return {
    activeElectionRandomnessAccount: base58,
    activeElectionRandomnessSource: base58,
    activeElectionRandomnessValue: "7".repeat(64),
    activeRuleArtifactHash: null,
    activeRuleHash: "1".repeat(64),
    activeRuleId,
    eligibleCandidateCommitments: [
      {
        compiledArtifactHash: "6".repeat(64),
        createdAtSeconds: 1_800_000_000,
        isEligibleState: true,
        isPrecompiledValid: true,
        reportCount: 0,
        ruleId: activeRuleId,
        sanitizedTextHash: "1".repeat(64),
        voteCount: 1,
      },
    ],
    electedFinalistIndex: 0,
    electedSurvivorIndex: 0,
    eligibleRuleIds: [activeRuleId],
    eliminatedFinalistHash: "8".repeat(64),
    eliminatedRuleIds: [],
    eligibleRulePoolHash: "2".repeat(64),
    finalistRuleIds: [activeRuleId],
    finalistSetHash: "3".repeat(64),
    randomFinalistHash: "4".repeat(64),
    randomRuleIds: [],
    randomnessAccount: base58,
    randomnessSource: base58,
    randomnessValue: "9".repeat(64),
    requestedAt: "2026-06-12T12:10:00.000Z",
    settledAt: "2026-06-12T12:16:00.000Z",
    status: "settled" as const,
    survivorFinalistHash: "a".repeat(64),
    survivorRuleIds: [activeRuleId],
    topVotedFinalistHash: "5".repeat(64),
    topVotedRuleIds: [activeRuleId],
    turnId,
  };
}

function saveReceiptForWallet(
  turnId: number,
  player: string,
  numbers: number[],
) {
  return saveGuessReceipt({
    gameToken: base58,
    numbers,
    player,
    playerGuess: base58,
    programId: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:00:00.000Z",
    turnId,
  });
}

function saveFulfilledDraw(turnId: number) {
  return saveDraw({
    drawResult: [1, 2, 3, 4, 5, 6],
    drawnAt: "2026-06-12T12:15:00.000Z",
    failureCode: null,
    randomnessAccount: base58,
    randomnessSource: base58,
    randomnessValue: "1".repeat(64),
    requestedAt: "2026-06-12T12:10:00.000Z",
    settleSignature: base58,
    status: "fulfilled",
    turnId,
  });
}

function savePaidRemovals(turnId: number, count: number) {
  for (let index = 0; index < count; index += 1) {
    const suffix = index.toString(36).padStart(4, "a");
    savePaidRuleRemoval({
      removalKind: "third_party",
      remover: `7bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbM${suffix}`,
      removedAt: "2026-06-12T12:05:00.000Z",
      ruleId: 10_000 + index,
      ruleProposal: base58,
      ruleRemoval: base58,
      signature: base58,
      turnId,
    });
  }
}

function resultForJob(args: {
  alternative: "LOSE" | "NONE" | "WIN";
  jobId: string;
  original: "LOSE" | "WIN";
  player: string;
  resultByte: string;
  sequence?: number;
  turnId: number;
}): GuessVerificationResultRecord {
  return {
    activeRuleId: args.alternative === "NONE" ? null : 7,
    alternative:
      args.alternative === "NONE"
        ? null
        : {
            inputHash: "5".repeat(64),
            matchedRuleBranch: "alternative",
            outputHash: "6".repeat(64),
            result: args.alternative,
            runtimeMs: 0,
            runtimeSteps: 1,
          },
    completedAt: "2026-06-12T12:17:00.000Z",
    jobId: args.jobId,
    original: {
      inputHash: "2".repeat(64),
      matchedRuleBranch: "original",
      outputHash: "3".repeat(64),
      result: args.original,
      runtimeMs: 0,
      runtimeSteps: 1,
    },
    player: args.player,
    resultId: args.resultByte.repeat(64),
    ...(args.sequence ? { sequence: args.sequence } : {}),
    status: "completed",
    turnId: args.turnId,
  };
}

test("prize pool accounting tracks every source and bucket deterministically", () => {
  const accounting = calculatePrizePoolAccounting({
    alternativeRolloverLamports: 9,
    config: {
      voteFeeLamports: 2_000_000,
    },
    guessCount: 2,
    originalRolloverLamports: 7,
    paidRuleRemovalCount: 1,
    ruleProposalCount: 2,
    turnId: 150,
    voteCount: 3,
  });

  assert.equal(accounting.sources.guessSubmissions.grossLamports, 30_000_000);
  assert.equal(accounting.sources.ruleProposals.grossLamports, 60_000_000);
  assert.equal(accounting.sources.paidRuleRemovals.grossLamports, 50_000_000);
  assert.equal(accounting.sources.votes.grossLamports, 14_000_000);
  assert.equal(accounting.sources.votes.feeActive, true);
  assert.equal(accounting.grossFeesLamports, 154_000_000);
  assert.equal(accounting.treasuryLamports, 7_700_000);
  assert.equal(accounting.platformMonetizationLamports, 7_700_000);
  assert.equal(accounting.currentTurnPoolLamports, 146_300_000);
  assert.equal(accounting.buckets.original.currentTurnLamports, 73_150_000);
  assert.equal(accounting.buckets.alternative.currentTurnLamports, 73_150_000);
  assert.equal(accounting.buckets.original.totalLamports, 73_150_007);
  assert.equal(accounting.buckets.alternative.totalLamports, 73_150_009);
  assert.equal(accounting.totalVisiblePrizePoolLamports, 146_300_016);
  assert.deepEqual(accounting.nextRolloverIfNoWinnersLamports, {
    alternative: 73_150_009,
    original: 73_150_007,
  });
});

test("M9.3 backend accounting matches the contract domain vector", () => {
  const accounting = calculatePrizePoolAccounting({
    alternativeRolloverLamports: 9,
    config: {
      voteFeeLamports: 2_000_000,
    },
    guessCount: 2,
    originalRolloverLamports: 7,
    paidRuleRemovalCount: 1,
    ruleProposalCount: 2,
    turnId: 150,
    voteCount: 3,
  });

  // Mirrors `prize_pool_accounting_tracks_sources_buckets_and_rollover` in
  // `contracts/solana/programs/idealer/tests/core.rs`.
  assert.deepEqual(
    {
      alternativeBucketCurrent: accounting.buckets.alternative.currentTurnLamports,
      alternativeBucketTotal: accounting.buckets.alternative.totalLamports,
      currentTurnPool: accounting.currentTurnPoolLamports,
      grossFees: accounting.grossFeesLamports,
      originalBucketCurrent: accounting.buckets.original.currentTurnLamports,
      originalBucketTotal: accounting.buckets.original.totalLamports,
      paidRuleRemovalGross: accounting.sources.paidRuleRemovals.grossLamports,
      ruleProposalGross: accounting.sources.ruleProposals.grossLamports,
      totalVisiblePrizePool: accounting.totalVisiblePrizePoolLamports,
      treasury: accounting.treasuryLamports,
      voteFeeActive: accounting.sources.votes.feeActive,
      voteGross: accounting.sources.votes.grossLamports,
    },
    {
      alternativeBucketCurrent: 73_150_000,
      alternativeBucketTotal: 73_150_009,
      currentTurnPool: 146_300_000,
      grossFees: 154_000_000,
      originalBucketCurrent: 73_150_000,
      originalBucketTotal: 73_150_007,
      paidRuleRemovalGross: 50_000_000,
      ruleProposalGross: 60_000_000,
      totalVisiblePrizePool: 146_300_016,
      treasury: 7_700_000,
      voteFeeActive: true,
      voteGross: 14_000_000,
    },
  );
});

test("repeated approval vote fee sequence matches PRD before and after turn 100", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((sequence) =>
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: 2_000_000,
        sequence,
        turnId: 99,
      }),
    ),
    [0, 4_000_000, 8_000_000, 16_000_000],
  );
  assert.deepEqual(
    [1, 2, 3, 4].map((sequence) =>
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: 2_000_000,
        sequence,
        turnId: 100,
      }),
    ),
    [2_000_000, 4_000_000, 8_000_000, 16_000_000],
  );
});

test("vote fee accounting sums repeated approval vote fee sequences", () => {
  const beforeGate = calculatePrizePoolAccounting({
    config: {
      voteFeeLamports: 2_000_000,
    },
    guessCount: 0,
    paidRuleRemovalCount: 0,
    ruleProposalCount: 0,
    turnId: 99,
    voteCount: 10,
  });
  const afterGate = calculatePrizePoolAccounting({
    config: {
      voteFeeLamports: 2_000_000,
    },
    guessCount: 0,
    paidRuleRemovalCount: 0,
    ruleProposalCount: 0,
    turnId: 100,
    voteCount: 10,
  });

  assert.equal(beforeGate.sources.votes.count, 10);
  assert.equal(beforeGate.sources.votes.grossLamports, 2_044_000_000);
  assert.equal(beforeGate.sources.votes.feeActive, true);
  assert.equal(afterGate.sources.votes.count, 10);
  assert.equal(afterGate.sources.votes.grossLamports, 2_046_000_000);
  assert.equal(afterGate.sources.votes.feeActive, true);
});

test("play and rule proposal fees use repeated action fee sequences", () => {
  const beforeGate = calculatePrizePoolAccounting({
    config: {
      guessSubmissionFeeLamports: 10_000_000,
      ruleProposalFeeLamports: 20_000_000,
    },
    guessCount: 3,
    paidRuleRemovalCount: 0,
    ruleProposalCount: 2,
    turnId: 99,
    voteCount: 0,
  });
  const afterGate = calculatePrizePoolAccounting({
    config: {
      guessSubmissionFeeLamports: 10_000_000,
      ruleProposalFeeLamports: 20_000_000,
    },
    guessCount: 3,
    paidRuleRemovalCount: 0,
    ruleProposalCount: 2,
    turnId: 100,
    voteCount: 0,
  });

  assert.equal(beforeGate.sources.guessSubmissions.grossLamports, 60_000_000);
  assert.equal(beforeGate.sources.ruleProposals.grossLamports, 40_000_000);
  assert.equal(afterGate.sources.guessSubmissions.grossLamports, 70_000_000);
  assert.equal(afterGate.sources.ruleProposals.grossLamports, 60_000_000);
});

test("elimination vote fees use same-side repeat escalation", () => {
  const beforeGate = calculatePrizePoolAccounting({
    config: {
      voteFeeLamports: 5_000_000,
    },
    eliminationVoteCount: 3,
    guessCount: 0,
    paidRuleRemovalCount: 0,
    ruleProposalCount: 0,
    turnId: 99,
    voteCount: 0,
  });
  const afterGate = calculatePrizePoolAccounting({
    config: {
      voteFeeLamports: 5_000_000,
    },
    eliminationVoteCount: 3,
    guessCount: 0,
    paidRuleRemovalCount: 0,
    ruleProposalCount: 0,
    turnId: 100,
    voteCount: 0,
  });

  assert.equal(beforeGate.sources.eliminationVotes.count, 3);
  assert.equal(beforeGate.sources.eliminationVotes.grossLamports, 30_000_000);
  assert.equal(afterGate.sources.eliminationVotes.count, 3);
  assert.equal(afterGate.sources.eliminationVotes.feeLamports, 5_000_000);
  assert.equal(afterGate.sources.eliminationVotes.grossLamports, 35_000_000);
});

test("repeated vote reconciliation matches prize pool accounting", () => {
  resetApiStateForTests();
  const turnId = 99;

  saveRuleVote({
    ruleId: 1,
    ruleProposal: base58,
    ruleVote: base58,
    sequence: 1,
    signature: base58,
    submittedAt: "2026-06-12T12:06:00.000Z",
    turnId,
    voter: wallet,
  });
  saveRuleVote({
    ruleId: 1,
    ruleProposal: base58,
    ruleVote: base58,
    sequence: 2,
    signature: walletTwo,
    submittedAt: "2026-06-12T12:06:30.000Z",
    turnId,
    voter: wallet,
  });
  saveRuleVote({
    ruleId: 1,
    ruleProposal: base58,
    ruleVote: base58,
    sequence: 3,
    signature: walletThree,
    submittedAt: "2026-06-12T12:07:00.000Z",
    turnId,
    voter: wallet,
  });
  saveRuleEliminationVote({
    eliminationVote: base58,
    ruleId: 2,
    ruleProposal: base58,
    sequence: 1,
    signature: base58,
    submittedAt: "2026-06-12T12:08:00.000Z",
    turnId,
    voter: walletTwo,
  });
  saveRuleEliminationVote({
    eliminationVote: base58,
    ruleId: 2,
    ruleProposal: base58,
    sequence: 2,
    signature: wallet,
    submittedAt: "2026-06-12T12:08:30.000Z",
    turnId,
    voter: walletTwo,
  });

  const accounting = getPrizePoolAccounting(turnId);
  const reconciliation = getRepeatedVoteFeeReconciliation(turnId);

  assert.equal(reconciliation.matches, true);
  assert.deepEqual(
    reconciliation.approval.records.map((record) => record.expectedFeeLamports),
    [0, 10_000_000, 20_000_000],
  );
  assert.deepEqual(
    reconciliation.elimination.records.map(
      (record) => record.expectedFeeLamports,
    ),
    [0, 10_000_000],
  );
  assert.equal(reconciliation.approval.grossLamports, 30_000_000);
  assert.equal(reconciliation.elimination.grossLamports, 10_000_000);
  assert.equal(
    reconciliation.approval.prizePoolGrossLamports,
    accounting.sources.votes.grossLamports,
  );
  assert.equal(
    reconciliation.elimination.prizePoolGrossLamports,
    accounting.sources.eliminationVotes.grossLamports,
  );
});

test("repeated vote retries are idempotent and conflicting retries are rejected", () => {
  resetApiStateForTests();
  const turnId = 100;
  const firstApproval = saveRuleVote({
    ruleId: 1,
    ruleProposal: base58,
    ruleVote: base58,
    sequence: 2,
    signature: base58,
    submittedAt: "2026-06-12T12:06:00.000Z",
    turnId,
    voter: wallet,
  });
  const approvalRetry = saveRuleVote({
    ruleId: 1,
    ruleProposal: base58,
    ruleVote: base58,
    feeLamports: 999_999_999,
    sequence: 2,
    signature: base58,
    submittedAt: "2026-06-12T12:09:00.000Z",
    turnId,
    voter: wallet,
  });
  const firstElimination = saveRuleEliminationVote({
    eliminationVote: base58,
    ruleId: 2,
    ruleProposal: base58,
    sequence: 2,
    signature: walletTwo,
    submittedAt: "2026-06-12T12:07:00.000Z",
    turnId,
    voter: walletTwo,
  });
  const eliminationRetry = saveRuleEliminationVote({
    eliminationVote: base58,
    feeLamports: 999_999_999,
    ruleId: 2,
    ruleProposal: base58,
    sequence: 2,
    signature: walletTwo,
    submittedAt: "2026-06-12T12:10:00.000Z",
    turnId,
    voter: walletTwo,
  });

  assert.deepEqual(approvalRetry, firstApproval);
  assert.deepEqual(eliminationRetry, firstElimination);
  assert.equal(listRuleVotes(turnId).votes.length, 1);
  assert.equal(listRuleEliminationVotes(turnId).votes.length, 1);
  assert.equal(getPrizePoolAccounting(turnId).sources.votes.grossLamports, 10_000_000);
  assert.equal(
    getPrizePoolAccounting(turnId).sources.eliminationVotes.grossLamports,
    10_000_000,
  );
  assert.throws(
    () =>
      saveRuleVote({
        ruleId: 1,
        ruleProposal: base58,
        ruleVote: base58,
        sequence: 2,
        signature: walletThree,
        submittedAt: "2026-06-12T12:11:00.000Z",
        turnId,
        voter: wallet,
      }),
    /DUPLICATE_RULE_VOTE/,
  );
  assert.throws(
    () =>
      saveRuleEliminationVote({
        eliminationVote: base58,
        ruleId: 2,
        ruleProposal: base58,
        sequence: 2,
        signature: walletThree,
        submittedAt: "2026-06-12T12:12:00.000Z",
        turnId,
        voter: walletTwo,
      }),
    /DUPLICATE_RULE_ELIMINATION_VOTE/,
  );
  assert.equal(listRuleVotes(turnId).votes.length, 1);
  assert.equal(listRuleEliminationVotes(turnId).votes.length, 1);
});

test("repeated vote retries without an explicit sequence reuse the original record", () => {
  resetApiStateForTests();
  const turnId = 101;
  const firstApproval = saveRuleVote({
    ruleId: 1,
    ruleProposal: base58,
    ruleVote: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:06:00.000Z",
    turnId,
    voter: wallet,
  });
  const approvalRetry = saveRuleVote({
    ruleId: 1,
    ruleProposal: base58,
    ruleVote: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:09:00.000Z",
    turnId,
    voter: wallet,
  });
  const firstElimination = saveRuleEliminationVote({
    eliminationVote: base58,
    ruleId: 2,
    ruleProposal: base58,
    signature: walletTwo,
    submittedAt: "2026-06-12T12:07:00.000Z",
    turnId,
    voter: walletTwo,
  });
  const eliminationRetry = saveRuleEliminationVote({
    eliminationVote: base58,
    ruleId: 2,
    ruleProposal: base58,
    signature: walletTwo,
    submittedAt: "2026-06-12T12:10:00.000Z",
    turnId,
    voter: walletTwo,
  });

  assert.deepEqual(approvalRetry, firstApproval);
  assert.deepEqual(eliminationRetry, firstElimination);
  assert.equal(firstApproval.sequence, 1);
  assert.equal(firstElimination.sequence, 1);
  assert.equal(listRuleVotes(turnId).votes.length, 1);
  assert.equal(listRuleEliminationVotes(turnId).votes.length, 1);
});

test("public transparency snapshot aggregates M5 turn, economy, rule, proof, trend, and export data", () => {
  resetApiStateForTests();
  const turnId = 150;
  saveRuleProposal({
    ...proposal(turnId, 7),
    feeLamports: 20_000_000,
    precompilationStatus: "passed",
    state: "eligible",
  });
  const validation = runRuleValidationForProposal({ ruleId: 7, turnId });
  saveRuleVote({
    feeLamports: 5_000_000,
    ruleId: 7,
    ruleProposal: base58,
    ruleVote: base58,
    sequence: 1,
    signature: base58,
    submittedAt: "2026-06-12T12:06:00.000Z",
    turnId,
    voter: walletTwo,
  });
  saveRuleVote({
    feeLamports: 10_000_000,
    ruleId: 7,
    ruleProposal: base58,
    ruleVote: base58,
    sequence: 2,
    signature: walletThree,
    submittedAt: "2026-06-12T12:07:00.000Z",
    turnId,
    voter: walletTwo,
  });
  saveRuleEliminationVote({
    eliminationVote: base58,
    feeLamports: 10_000_000,
    ruleId: 7,
    ruleProposal: base58,
    sequence: 2,
    signature: wallet,
    submittedAt: "2026-06-12T12:08:00.000Z",
    turnId,
    voter: walletThree,
  });
  saveReceiptForWallet(turnId, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(turnId);
  saveRuleElection({
    ...settledElection(turnId, 7),
    activeRuleArtifactHash: validation.compiledArtifactHash,
  });
  const { jobs } = createGuessVerificationJobsForTurn(turnId);
  const job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: job.id,
      original: "WIN",
      player: wallet,
      resultByte: "9",
      turnId,
    }),
  );
  calculateAndStoreWinnerRecords(turnId);
  calculateAndStoreRewardRecords(turnId);
  createClaimRecordsForTurn(turnId, "2026-06-12T12:20:00.000Z");
  recordSettlementTransition({
    fromState: "VERIFYING",
    idempotencyKey: `${turnId}:CLOSED`,
    inputHash: "1".repeat(64),
    outputHash: "2".repeat(64),
    recordedAt: "2026-06-12T12:30:00.000Z",
    signature: base58,
    toState: "CLOSED",
    transitionReason: "test_close",
    turnId,
  });

  const snapshot = getTransparencySnapshot({ fromTurnId: turnId, toTurnId: turnId });
  const csv = exportTransparencySnapshotCsv(snapshot);
  const serialized = JSON.stringify(snapshot).toLowerCase();

  assert.equal(snapshot.turns.length, 1);
  assert.equal(snapshot.totals.guesses, 1);
  assert.equal(snapshot.totals.proposals, 1);
  assert.equal(snapshot.totals.approvalVotes, 2);
  assert.equal(snapshot.totals.eliminationVotes, 1);
  assert.equal(snapshot.turns[0]?.rules.activeRuleId, 7);
  assert.equal(snapshot.turns[0]?.rules.finalistRuleIds.includes(7), true);
  assert.match(snapshot.turns[0]?.proofs.drawResultHash ?? "", /^[0-9a-f]{64}$/);
  assert.match(
    snapshot.turns[0]?.proofs.winnerCalculationHash ?? "",
    /^[0-9a-f]{64}$/,
  );
  assert.equal(snapshot.trends.repeatedPaidActions.length, 5);
  assert.equal(
    snapshot.trends.repeatedPaidActions.find(
      (record) => record.scope === "approval_vote",
    )?.count,
    1,
  );
  assert.equal(snapshot.sourceReferences.length >= 3, true);
  assert.equal(snapshot.dataBoundary.publicMetricsOnly, true);
  assert.equal(
    snapshot.dataBoundary.restrictedAiOperations.status,
    "access_controlled",
  );
  assert.equal(
    snapshot.dataBoundary.restrictedAiOperations.endpoint,
    "/operator/ai-operations",
  );
  assert.match(csv, /derivation_note/);
  assert.match(csv, /private retention, funnel, device, session/);
  assert.doesNotMatch(serialized, /ip_address_value|raw_completion_value/);
});

test("console safety boundary keeps transparency and operator dashboards read-only", () => {
  resetApiStateForTests();
  const snapshot = getTransparencySnapshot();
  const operatorSnapshot = getOperatorAiOperationsSnapshot();
  const boundary = getConsoleSafetyBoundary();
  const publicCsv = exportTransparencySnapshotCsv(snapshot).toLowerCase();
  const operatorCsv = exportOperatorAiOperationsCsv(operatorSnapshot).toLowerCase();
  const serialized = `${JSON.stringify(snapshot)}\n${JSON.stringify(
    operatorSnapshot,
  )}\n${publicCsv}\n${operatorCsv}`.toLowerCase();

  assert.deepEqual(boundary.allowedHttpMethods, ["GET", "OPTIONS"]);
  assert.equal(getAllowedMethodsForPath("/transparency"), "GET,OPTIONS");
  assert.equal(getAllowedMethodsForPath("/transparency/export"), "GET,OPTIONS");
  assert.equal(getAllowedMethodsForPath("/operator/ai-operations"), "GET,OPTIONS");
  assert.equal(
    getAllowedMethodsForPath("/operator/ai-operations/export"),
    "GET,OPTIONS",
  );
  assert.equal(getAllowedMethodsForPath("/guess-receipts"), "GET,POST,OPTIONS");
  assert.equal(
    getConsoleReadOnlyMethodRejection("/transparency", "GET"),
    null,
  );
  assert.equal(
    getConsoleReadOnlyMethodRejection("/operator/ai-operations", "OPTIONS"),
    null,
  );
  for (const path of [
    "/transparency",
    "/transparency/export",
    "/operator/ai-operations",
    "/operator/ai-operations/export",
  ] as const) {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"] as const) {
      assert.deepEqual(getConsoleReadOnlyMethodRejection(path, method), {
        allowedMethods: "GET,OPTIONS",
        error: "console_route_read_only",
        message:
          "Transparency and restricted AI operations console routes are read-only.",
        statusCode: 405,
      });
    }
  }
  assert.equal(
    getConsoleReadOnlyMethodRejection("/guess-receipts", "POST"),
    null,
  );
  assert.equal(boundary.readOnly, true);
  assert.equal(boundary.mutationEndpointsAvailable, false);
  assert.equal(boundary.outcomeControlUnavailable, true);
  assert.equal(boundary.noPrivateAnalyticsRequired, true);
  assert.equal(boundary.logsExcludePrivateUserAnalytics, true);
  assert.equal(boundary.restrictedAiCanBeDisabledWithoutPublicImpact, true);
  assert.equal(boundary.publicExportsContainOnlyPublicDerivableFields, true);
  assert.equal(
    boundary.restrictedAiExportsContainOnlyRedactedOperationalFields,
    true,
  );
  assert.deepEqual(snapshot.dataBoundary.consoleSafetyBoundary, boundary);
  assert.deepEqual(operatorSnapshot.consoleSafetyBoundary, boundary);

  for (const field of [
    "submitted_guesses",
    "draw_results",
    "finalized_winners",
    "active_rules",
    "prize_accounting",
    "creator_reward_records",
  ] as const) {
    assert.equal(boundary.protectedGameStateMutationDenylist.includes(field), true);
  }
  for (const field of [
    "ip_address",
    "device_fingerprint",
    "session_id",
    "private_user_agent_record",
    "wallet_connect_attempt",
    "wallet_failure",
    "private_funnel_step",
    "raw_prompt",
    "raw_completion",
    "provider_api_key",
    "secret_value",
    "unrestricted_compiler_reasoning_trace",
    "private_provider_request_body",
    "private_provider_response_body",
    "private_provider_request_response_body",
    "unredacted_stack_trace",
  ] as const) {
    assert.equal(boundary.privateTelemetryDenylist.includes(field), true);
  }
  assert.equal(boundary.dashboardFieldReviewChecklist.length >= 6, true);
  assert.match(publicCsv, /derivation_note/);
  assert.match(operatorCsv, /redacted aggregates only/);
  assert.doesNotMatch(
    serialized,
    /ip_address_leak|device_fingerprint_leak|session_id_leak|raw_prompt_leak|raw_completion_leak|provider_api_key_leak|secret_leak|unredacted_stack_trace_leak/,
  );
});

test("restricted AI operations snapshot is role-gated and redacted", () => {
  resetApiStateForTests();
  const turnId = 151;
  saveRuleProposal({
    ...proposal(turnId, 1),
    feeLamports: 20_000_000,
    precompilationStatus: "passed",
    state: "eligible",
  });
  runRuleValidationForProposal({ ruleId: 1, turnId });
  saveReceiptForWallet(turnId, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(turnId);
  createGuessVerificationJobsForTurn(turnId);

  const disabled = authorizeOperatorAiRequest("Bearer token", {});
  const missing = authorizeOperatorAiRequest(undefined, {
    OPERATOR_AI_CONSOLE_TOKEN: "token",
  });
  const denied = authorizeOperatorAiRequest("Bearer wrong", {
    OPERATOR_AI_CONSOLE_TOKEN: "token",
  });
  const allowed = authorizeOperatorAiRequest("Bearer token", {
    OPERATOR_AI_CONSOLE_TOKEN: "token",
  });
  const snapshot = getOperatorAiOperationsSnapshot();
  const csv = exportOperatorAiOperationsCsv(snapshot);
  const serialized = `${JSON.stringify(snapshot)}\n${csv}`.toLowerCase();

  assert.equal(disabled.ok, false);
  assert.equal(disabled.statusCode, 503);
  assert.equal(missing.ok, false);
  assert.equal(missing.statusCode, 401);
  assert.equal(denied.ok, false);
  assert.equal(denied.statusCode, 403);
  assert.equal(allowed.ok, true);
  assert.equal(snapshot.access.role, "ai_operator");
  assert.equal(snapshot.access.readOnly, true);
  assert.equal(snapshot.operationCounts.validationCalls, 1);
  assert.equal(snapshot.operationCounts.verificationJobs, 1);
  assert.equal(snapshot.modelRouting.length > 0, true);
  assert.equal(
    snapshot.agentCallVolumeByRole.some(
      (record) => record.role === "adversarial_testing" && record.calls > 0,
    ),
    true,
  );
  assert.equal(snapshot.latencyPercentiles.length > 0, true);
  assert.equal(snapshot.estimatedCost.totalTokens > 0, true);
  assert.equal(snapshot.tokenUsageByProviderModelRole.length > 0, true);
  assert.equal(
    snapshot.tokenUsageByProviderModelRole.some(
      (record) =>
        record.role === "compilation" &&
        record.provider !== "not_recorded" &&
        record.model !== "not_recorded" &&
        record.totalTokens > 0,
    ),
    true,
  );
  assert.equal(snapshot.confidenceDistributions.finalConfidenceBuckets["90_100"], 1);
  assert.equal(snapshot.localModelHealth.length > 0, true);
  assert.equal(snapshot.auditLinks.length, 1);
  assert.equal(snapshot.queue.backlogJobs, 1);
  assert.match(csv, /redaction_note/);
  assert.match(csv, /p95_latency_ms/);
  assert.match(csv, /estimated_cost_usd/);
  assert.doesNotMatch(
    serialized,
    /"compiledartifact"|"normalizedtext"|"providerpath"|"providerapikey"|win if at least 4/,
  );
});

test("rule elimination votes and closed decision state are projected for audit", () => {
  resetApiStateForTests();
  saveRuleElection({
    ...settledElection(260, 2),
    activeRuleArtifactHash: null,
    activeRuleHash: null,
    activeRuleId: null,
    eliminatedFinalistHash: "6".repeat(64),
    eliminatedRuleIds: [1],
    finalistRuleIds: [1, 2],
    status: "locked",
    survivorFinalistHash: "7".repeat(64),
    survivorRuleIds: [2],
  });
  saveRuleEliminationVote({
    eliminationVote: base58,
    ruleId: 1,
    ruleProposal: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:30:00.000Z",
    turnId: 260,
    voter: wallet,
  });
  saveRuleElimination({
    closedAt: "2026-06-12T13:00:00.000Z",
    decisionWindowClosesAt: "2026-06-12T13:00:00.000Z",
    decisionWindowOpenedAt: "2026-06-12T12:00:00.000Z",
    eliminatedFinalistHash: "6".repeat(64),
    eliminatedRuleIds: [1],
    finalists: [
      {
        approvalVotes: 0,
        eliminated: true,
        eliminationVotes: 1,
        ruleId: 1,
        status: "eliminated",
        threshold: 1,
      },
      {
        approvalVotes: 2,
        eliminated: false,
        eliminationVotes: 0,
        ruleId: 2,
        status: "survived",
        threshold: 3,
      },
    ],
    status: "closed",
    survivorFinalistHash: "7".repeat(64),
    survivorRuleIds: [2],
    turnId: 260,
  });

  const votes = listRuleEliminationVotes(260);
  const elimination = getRuleElimination(260);
  const summary = getRoundSummary(260, 260);

  assert.equal(votes.counts["1"], 1);
  assert.equal(elimination.status, "closed");
  assert.deepEqual(elimination.eliminatedRuleIds, [1]);
  assert.deepEqual(elimination.survivorRuleIds, [2]);
  assert.equal(summary.elimination.finalists[0]?.status, "eliminated");
  assert.equal(summary.pool.eliminationVoteFees, 1);
});

test("round summary exposes tracked accounting sources and visible pool", () => {
  resetApiStateForTests();
  saveGuessReceipt({
    gameToken: base58,
    numbers: [1, 2, 3, 4, 5, 6],
    player: wallet,
    playerGuess: base58,
    programId: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:00:00.000Z",
    turnId: 151,
  });
  saveRuleProposal(proposal(151, 1));
  savePaidRuleRemoval({
    removalKind: "third_party",
    remover: "7bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTR",
    removedAt: "2026-06-12T12:05:00.000Z",
    ruleId: 1,
    ruleProposal: base58,
    ruleRemoval: base58,
    signature: base58,
    turnId: 151,
  });
  saveRuleVote({
    ruleId: 1,
    ruleProposal: base58,
    ruleVote: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:06:00.000Z",
    turnId: 151,
    voter: wallet,
  });
  saveTurnRollover({
    alternativeRolloverLamports: 4_000_000,
    originalRolloverLamports: 3_000_000,
    recordedAt: "2026-06-12T12:07:00.000Z",
    sourceTurnId: 150,
    turnId: 151,
  });

  const accounting = getPrizePoolAccounting(151);
  const summary = getRoundSummary(151, 151);

  assert.equal(accounting.sources.guessSubmissions.count, 1);
  assert.equal(accounting.sources.ruleProposals.count, 1);
  assert.equal(accounting.sources.paidRuleRemovals.count, 1);
  assert.equal(accounting.buckets.original.rolloverLamports, 3_000_000);
  assert.equal(accounting.buckets.alternative.rolloverLamports, 4_000_000);
  assert.equal(
    summary.pool.accounting.totalVisiblePrizePoolLamports,
    87_750_000,
  );
  assert.equal(summary.pool.guesses, 1);
  assert.equal(summary.pool.proposals, 1);
  assert.equal(summary.pool.paidRemovals, 1);
  assert.equal(summary.pool.indicativeSol, 0.0877);
  assert.equal(summary.pool.treasurySol, 0.0043);
});

test("round summary marks fulfilled settlement turns as completed", () => {
  resetApiStateForTests();
  saveFulfilledDraw(152);

  const summary = getRoundSummary(152, 1);

  assert.equal(summary.status, "completed");
  assert.equal(summary.draw?.status, "fulfilled");
});

test("winner calculation handles zero winners with full bucket rollover remainder", () => {
  resetApiStateForTests();
  saveReceiptForWallet(220, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(220);
  const { jobs } = createGuessVerificationJobsForTurn(220);
  const job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "NONE",
      jobId: job.id,
      original: "LOSE",
      player: wallet,
      resultByte: "a",
      turnId: 220,
    }),
  );

  const winners = calculateAndStoreWinnerRecords(
    220,
    "2026-06-12T12:18:00.000Z",
  );

  assert.equal(winners.original.winnerCount, 0);
  assert.equal(winners.alternative.winnerCount, 0);
  assert.equal(winners.original.individualPayoutLamports, 0);
  assert.equal(winners.alternative.individualPayoutLamports, 0);
  assert.equal(winners.original.remainderLamports, 4_750_000);
  assert.equal(winners.alternative.remainderLamports, 4_750_000);
  assert.equal(winners.records.length, 0);
});

test("multiple guesses from the same wallet are projected as separate verification jobs", () => {
  resetApiStateForTests();
  saveReceiptForWallet(221, wallet, [1, 2, 3, 4, 5, 6]);
  saveGuessReceipt({
    gameToken: base58,
    numbers: [7, 8, 9, 10, 11, 12],
    player: wallet,
    playerGuess: base58,
    programId: base58,
    sequence: 2,
    signature: base58,
    submittedAt: "2026-06-12T12:01:00.000Z",
    turnId: 221,
  });
  saveFulfilledDraw(221);

  const { jobs } = createGuessVerificationJobsForTurn(221);

  assert.equal(jobs.length, 2);
  assert.deepEqual(
    jobs.map((job) => job.payload.guess_sequence).sort(),
    ["1", "2"],
  );
  assert.notEqual(jobs[0]?.id, jobs[1]?.id);
});

test("M9.3 no alternative rule pays only original winners and creates no rewards", () => {
  resetApiStateForTests();
  saveRuleElection({
    ...settledElection(222, 7),
    activeRuleArtifactHash: null,
    activeRuleHash: null,
    activeRuleId: null,
    survivorRuleIds: [],
  });
  saveReceiptForWallet(222, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(222);

  const { jobs } = createGuessVerificationJobsForTurn(222);
  const job = jobs[0];
  assert.ok(job);
  assert.equal(job.activeRuleId, null);
  assert.equal(job.activeRuleArtifact, null);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "NONE",
      jobId: job.id,
      original: "WIN",
      player: wallet,
      resultByte: "1",
      turnId: 222,
    }),
  );

  const winners = calculateAndStoreWinnerRecords(
    222,
    "2026-06-12T12:18:00.000Z",
  );
  const rewards = calculateAndStoreRewardRecords(
    222,
    "2026-06-12T12:18:00.000Z",
  );

  assert.equal(winners.original.winnerCount, 1);
  assert.equal(winners.alternative.winnerCount, 0);
  assert.equal(winners.records.length, 1);
  assert.equal(winners.records[0]?.category, "original");
  assert.equal(rewards.activeRuleId, null);
  assert.equal(rewards.creator, null);
  assert.equal(rewards.voters.length, 0);
});

test("M9.3 invalidated alternative rule behaves as no active alternative", () => {
  resetApiStateForTests();
  saveRuleProposal({
    ...proposal(223, 7),
    precompilationStatus: "failed",
    state: "invalidated",
  });
  saveRuleVote({
    ruleId: 7,
    ruleProposal: base58,
    ruleVote: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:06:00.000Z",
    turnId: 223,
    voter: walletTwo,
  });
  saveReceiptForWallet(223, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(223);

  const { jobs } = createGuessVerificationJobsForTurn(223);
  const job = jobs[0];
  assert.ok(job);
  assert.equal(job.activeRuleId, null);
  assert.equal(job.payload.compiled_artifact_hash, undefined);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "NONE",
      jobId: job.id,
      original: "LOSE",
      player: wallet,
      resultByte: "2",
      turnId: 223,
    }),
  );

  const winners = calculateAndStoreWinnerRecords(
    223,
    "2026-06-12T12:18:00.000Z",
  );
  const settlement = settleTurnRollover(223, "2026-06-12T12:19:00.000Z");

  assert.equal(winners.alternative.winnerCount, 0);
  assert.equal(settlement.alternative.reason, "no_winner");
  assert.equal(
    settlement.alternative.rolloverLamports,
    getPrizePoolAccounting(223).buckets.alternative.totalLamports,
  );
  assert.equal(getRewardSummary(223).creator, null);
});

test("winner calculation stores original and alternative winners with per-bucket payouts", () => {
  resetApiStateForTests();
  saveReceiptForWallet(221, wallet, [1, 2, 3, 4, 5, 6]);
  saveReceiptForWallet(221, walletTwo, [1, 2, 3, 4, 5, 7]);
  saveReceiptForWallet(221, walletThree, [90, 91, 92, 93, 94, 95]);
  saveFulfilledDraw(221);

  const { jobs } = createGuessVerificationJobsForTurn(221);
  const byPlayer = new Map(jobs.map((job) => [job.payload.wallet, job]));
  const jobOne = byPlayer.get(wallet);
  const jobTwo = byPlayer.get(walletTwo);
  const jobThree = byPlayer.get(walletThree);
  assert.ok(jobOne);
  assert.ok(jobTwo);
  assert.ok(jobThree);

  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: jobOne.id,
      original: "WIN",
      player: wallet,
      resultByte: "b",
      turnId: 221,
    }),
  );
  saveGuessVerificationResult(
    resultForJob({
      alternative: "LOSE",
      jobId: jobTwo.id,
      original: "WIN",
      player: walletTwo,
      resultByte: "c",
      turnId: 221,
    }),
  );
  saveGuessVerificationResult(
    resultForJob({
      alternative: "LOSE",
      jobId: jobThree.id,
      original: "LOSE",
      player: walletThree,
      resultByte: "d",
      turnId: 221,
    }),
  );

  const winners = calculateAndStoreWinnerRecords(
    221,
    "2026-06-12T12:18:00.000Z",
  );
  const records = listWinnerRecords(221);
  const summary = getRoundSummary(221, 221);

  assert.equal(winners.original.winnerCount, 2);
  assert.equal(winners.alternative.winnerCount, 1);
  assert.equal(winners.original.individualPayoutLamports, 7_125_000);
  assert.equal(winners.alternative.individualPayoutLamports, 14_250_000);
  assert.equal(winners.original.remainderLamports, 0);
  assert.equal(winners.alternative.remainderLamports, 0);
  assert.equal(records.length, 3);
  assert.deepEqual(
    records.map((record) => `${record.category}:${record.player}`),
    [`alternative:${wallet}`, `original:${wallet}`, `original:${walletTwo}`],
  );
  assert.equal(summary.winners.records.length, 3);
  assert.equal(summary.winners.original.winnerCount, 2);
  assert.equal(summary.winners.alternative.winnerCount, 1);
});

function recordNoWinnerTurn(turnId: number, player: string) {
  saveReceiptForWallet(turnId, player, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(turnId);
  const { jobs } = createGuessVerificationJobsForTurn(turnId);
  const job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "NONE",
      jobId: job.id,
      original: "LOSE",
      player,
      resultByte: "a",
      turnId,
    }),
  );
}

test("rollover settlement carries no-winner buckets forward and accumulates across repeated no-winner turns", () => {
  resetApiStateForTests();

  // Turn 300: a single guess, no winner in either bucket.
  recordNoWinnerTurn(300, wallet);

  const settlement300 = settleTurnRollover(300, "2026-06-12T12:18:00.000Z");

  assert.equal(settlement300.turnId, 300);
  assert.equal(settlement300.nextTurnId, 301);
  assert.equal(settlement300.original.reason, "no_winner");
  assert.equal(settlement300.alternative.reason, "no_winner");
  assert.equal(settlement300.original.rolloverLamports, 4_750_000);
  assert.equal(settlement300.alternative.rolloverLamports, 4_750_000);
  assert.equal(settlement300.totalRolloverLamports, 9_500_000);

  // The next turn now starts with the rolled-over buckets as inbound rollover.
  const accounting301 = getPrizePoolAccounting(301);
  assert.equal(accounting301.buckets.original.rolloverLamports, 4_750_000);
  assert.equal(accounting301.buckets.alternative.rolloverLamports, 4_750_000);

  // The spectator-feed event narrates the no-winner rollover.
  const events300 = getRolloverActivityEvents(300);
  assert.equal(events300.length, 2);
  assert.deepEqual(
    events300.map((event) => `${event.bucket}:${event.rolloverLamports}`),
    ["original:4750000", "alternative:4750000"],
  );
  assert.ok(events300.every((event) => event.toTurnId === 301));

  // Turn 301: another single guess, again no winner — the pool accumulates.
  recordNoWinnerTurn(301, wallet);

  const settlement301 = settleTurnRollover(301, "2026-06-12T14:18:00.000Z");

  // 4,750,000 carried in + 4,750,000 from this turn = 9,500,000 per bucket.
  assert.equal(settlement301.original.rolloverLamports, 9_500_000);
  assert.equal(settlement301.alternative.rolloverLamports, 9_500_000);
  assert.equal(settlement301.totalRolloverLamports, 19_000_000);
  assert.equal(
    getPrizePoolAccounting(302).buckets.original.rolloverLamports,
    9_500_000,
  );
});

test("rollover settlement pays accumulated pool to a winner after rollover without rolling that bucket again", () => {
  resetApiStateForTests();

  // Turn 310: no winner, rolls 4,750,000 per bucket into turn 311.
  recordNoWinnerTurn(310, wallet);
  settleTurnRollover(310, "2026-06-12T12:18:00.000Z");

  // Turn 311: two guesses, one wins both the original and alternative buckets.
  saveReceiptForWallet(311, wallet, [1, 2, 3, 4, 5, 6]);
  saveReceiptForWallet(311, walletTwo, [90, 91, 92, 93, 94, 95]);
  saveFulfilledDraw(311);
  const { jobs } = createGuessVerificationJobsForTurn(311);
  const byPlayer = new Map(jobs.map((job) => [job.payload.wallet, job]));
  const jobOne = byPlayer.get(wallet);
  const jobTwo = byPlayer.get(walletTwo);
  assert.ok(jobOne);
  assert.ok(jobTwo);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: jobOne.id,
      original: "WIN",
      player: wallet,
      resultByte: "b",
      turnId: 311,
    }),
  );
  saveGuessVerificationResult(
    resultForJob({
      alternative: "LOSE",
      jobId: jobTwo.id,
      original: "LOSE",
      player: walletTwo,
      resultByte: "c",
      turnId: 311,
    }),
  );

  const winners = calculateAndStoreWinnerRecords(
    311,
    "2026-06-12T14:18:00.000Z",
  );

  // Current pool for 2 guesses is 9,500,000 per bucket; the 4,750,000 inbound
  // rollover lifts each bucket total — and the single winner's payout — to
  // 14,250,000.
  assert.equal(winners.original.bucketLamports, 14_250_000);
  assert.equal(winners.alternative.bucketLamports, 14_250_000);
  assert.equal(winners.original.individualPayoutLamports, 14_250_000);
  assert.equal(winners.alternative.individualPayoutLamports, 14_250_000);

  const settlement311 = settleTurnRollover(311, "2026-06-12T14:20:00.000Z");

  // Both buckets had a winner and divided evenly: nothing rolls over, and no
  // "pool rolls over" event is surfaced.
  assert.equal(settlement311.original.reason, "none");
  assert.equal(settlement311.alternative.reason, "none");
  assert.equal(settlement311.totalRolloverLamports, 0);
  assert.equal(getRolloverActivityEvents(311).length, 0);

  // Settlement is a pure read of winner state — it neither mutates winner
  // payouts nor disturbs reward accounting (rewards are funded from a separate
  // platform-monetization reserve).
  const rewardsBefore = getRewardSummary(311);
  settleTurnRollover(311, "2026-06-12T14:21:00.000Z");
  const rewardsAfter = getRewardSummary(311);
  assert.deepEqual(rewardsAfter, rewardsBefore);
  assert.equal(getTurnRolloverSettlement(311)?.totalRolloverLamports, 0);
});

test("M9.3 rounding dust rolls over partially while no-winner bucket rolls over totally", () => {
  resetApiStateForTests();
  saveTurnRollover({
    alternativeRolloverLamports: 0,
    originalRolloverLamports: 1,
    recordedAt: "2026-06-12T10:00:00.000Z",
    sourceTurnId: 319,
    turnId: 320,
  });
  saveReceiptForWallet(320, wallet, [1, 2, 3, 4, 5, 6]);
  saveReceiptForWallet(320, walletTwo, [1, 2, 3, 4, 5, 7]);
  saveFulfilledDraw(320);

  const { jobs } = createGuessVerificationJobsForTurn(320);
  const byPlayer = new Map(jobs.map((job) => [job.payload.wallet, job]));
  saveGuessVerificationResult(
    resultForJob({
      alternative: "NONE",
      jobId: byPlayer.get(wallet)!.id,
      original: "WIN",
      player: wallet,
      resultByte: "3",
      turnId: 320,
    }),
  );
  saveGuessVerificationResult(
    resultForJob({
      alternative: "NONE",
      jobId: byPlayer.get(walletTwo)!.id,
      original: "WIN",
      player: walletTwo,
      resultByte: "4",
      turnId: 320,
    }),
  );

  const winners = calculateAndStoreWinnerRecords(
    320,
    "2026-06-12T12:18:00.000Z",
  );
  const settlement = settleTurnRollover(320, "2026-06-12T12:19:00.000Z");
  const nextAccounting = getPrizePoolAccounting(321);

  assert.equal(winners.original.bucketLamports, 9_500_001);
  assert.equal(winners.original.individualPayoutLamports, 4_750_000);
  assert.equal(winners.original.remainderLamports, 1);
  assert.equal(settlement.original.reason, "dust_remainder");
  assert.equal(settlement.original.rolloverLamports, 1);
  assert.equal(settlement.alternative.reason, "no_winner");
  assert.equal(settlement.alternative.rolloverLamports, 9_500_000);
  assert.equal(nextAccounting.buckets.original.rolloverLamports, 1);
  assert.equal(nextAccounting.buckets.alternative.rolloverLamports, 9_500_000);
});

test("ranking alternative rule picks the best-score guesses as winners (ties share)", () => {
  resetApiStateForTests();
  saveReceiptForWallet(240, wallet, [1, 2, 3, 4, 5, 6]);
  saveReceiptForWallet(240, walletTwo, [1, 2, 3, 4, 5, 7]);
  saveReceiptForWallet(240, walletThree, [90, 91, 92, 93, 94, 95]);
  saveFulfilledDraw(240);

  const { jobs } = createGuessVerificationJobsForTurn(240);
  const byPlayer = new Map(jobs.map((job) => [job.payload.wallet, job]));
  const saveRanking = (
    player: string,
    jobId: string,
    resultByte: string,
    score: number,
  ) => {
    const base = resultForJob({
      alternative: "LOSE",
      jobId,
      original: "LOSE",
      player,
      resultByte,
      turnId: 240,
    });
    saveGuessVerificationResult({
      ...base,
      alternativeDirection: "max",
      alternativeMode: "ranking",
      alternative: { ...base.alternative!, score },
    });
  };

  // wallet and walletTwo tie for the top score; walletThree is lower.
  saveRanking(wallet, byPlayer.get(wallet)!.id, "b", 5);
  saveRanking(walletTwo, byPlayer.get(walletTwo)!.id, "c", 5);
  saveRanking(walletThree, byPlayer.get(walletThree)!.id, "d", 2);

  const winners = calculateAndStoreWinnerRecords(
    240,
    "2026-06-12T12:18:00.000Z",
  );
  const altPlayers = listWinnerRecords(240)
    .filter((record) => record.category === "alternative")
    .map((record) => record.player)
    .sort();

  assert.equal(winners.alternative.winnerCount, 2);
  assert.deepEqual(altPlayers, [wallet, walletTwo].sort());
  // The single highest scorer alone would not tie; the lower scorer never wins.
  assert.ok(!altPlayers.includes(walletThree));
});

test("reward distribution uses individual alternative payout basis and splits elected-rule voters", () => {
  const rewards = calculateRewardDistribution({
    activeRuleId: 7,
    calculatedAt: "2026-06-12T12:18:00.000Z",
    creatorRewardReserveLamports: 30,
    creatorWallet: wallet,
    individualAltPayoutLamports: 10,
    turnId: 230,
    voters: [wallet, walletTwo, walletThree],
    winnerCount: 10,
  });

  assert.equal(rewards.creator?.calculatedRewardLamports, 10);
  assert.equal(rewards.creator?.finalRewardLamports, 10);
  assert.equal(rewards.voterRewardPool.calculatedPoolLamports, 1);
  assert.equal(rewards.voterRewardPool.finalPoolLamports, 1);
  assert.equal(rewards.voterRewardPool.individualRewardLamports, 0);
  assert.equal(rewards.voterRewardPool.remainderLamports, 1);
  assert.equal(rewards.voters.length, 3);
  assert.equal(rewards.remainingReserveLamports, 19);
});

test("creator and voter reward records are stored without reducing winner payouts", () => {
  resetApiStateForTests();
  saveRuleProposal(proposal(231, 7));
  saveRuleVote({
    ruleId: 7,
    ruleProposal: base58,
    ruleVote: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:06:00.000Z",
    turnId: 231,
    voter: wallet,
  });
  saveRuleVote({
    ruleId: 7,
    ruleProposal: base58,
    ruleVote: walletTwo,
    sequence: 2,
    signature: walletTwo,
    submittedAt: "2026-06-12T12:06:30.000Z",
    turnId: 231,
    voter: wallet,
  });
  saveRuleVote({
    ruleId: 7,
    ruleProposal: base58,
    ruleVote: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:07:00.000Z",
    turnId: 231,
    voter: walletTwo,
  });
  saveReceiptForWallet(231, wallet, [1, 2, 3, 4, 5, 6]);
  saveReceiptForWallet(231, walletTwo, [1, 2, 3, 4, 5, 7]);
  saveFulfilledDraw(231);

  const { jobs } = createGuessVerificationJobsForTurn(231);
  saveRuleElection(settledElection(231, 7));
  const byPlayer = new Map(jobs.map((job) => [job.payload.wallet, job]));
  const jobOne = byPlayer.get(wallet);
  const jobTwo = byPlayer.get(walletTwo);
  assert.ok(jobOne);
  assert.ok(jobTwo);

  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: jobOne.id,
      original: "LOSE",
      player: wallet,
      resultByte: "7",
      turnId: 231,
    }),
  );
  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: jobTwo.id,
      original: "LOSE",
      player: walletTwo,
      resultByte: "8",
      turnId: 231,
    }),
  );

  const winners = calculateAndStoreWinnerRecords(
    231,
    "2026-06-12T12:18:00.000Z",
  );
  const rewards = calculateAndStoreRewardRecords(
    231,
    "2026-06-12T12:18:00.000Z",
  );
  const creatorRecords = listCreatorRewardRecords(231);
  const voterRecords = listVoterRewardRecords(231);
  const summary = getRoundSummary(231, 231);

  assert.equal(winners.alternative.winnerCount, 2);
  assert.equal(winners.alternative.individualPayoutLamports, 14_250_000);
  assert.equal(rewards.creatorRewardReserveLamports, 600_000);
  assert.equal(rewards.creator?.creatorWallet, wallet);
  assert.equal(rewards.creator?.calculatedRewardLamports, 4_275_000);
  assert.equal(rewards.creator?.finalRewardLamports, 600_000);
  assert.equal(rewards.voterRewardPool.calculatedPoolLamports, 2_137_500);
  assert.equal(rewards.voterRewardPool.finalPoolLamports, 0);
  assert.equal(rewards.voters.length, 2);
  assert.equal(voterRecords.length, 2);
  assert.equal(voterRecords[0]?.finalRewardLamports, 0);
  assert.equal(creatorRecords.length, 1);
  assert.equal(
    summary.winners.alternative.individualPayoutLamports,
    14_250_000,
  );
  assert.equal(summary.rewards.creator?.finalRewardLamports, 600_000);
});

test("reward calculation handles no alternative winners and zero elected-rule voters", () => {
  resetApiStateForTests();
  saveRuleProposal(proposal(232, 7));
  saveReceiptForWallet(232, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(232);
  const { jobs } = createGuessVerificationJobsForTurn(232);
  saveRuleElection(settledElection(232, 7));
  const job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "LOSE",
      jobId: job.id,
      original: "LOSE",
      player: wallet,
      resultByte: "9",
      turnId: 232,
    }),
  );

  const noWinnerRewards = getRewardSummary(232);
  assert.equal(noWinnerRewards.creator, null);
  assert.equal(noWinnerRewards.voters.length, 0);
  assert.equal(noWinnerRewards.voterRewardPool.finalPoolLamports, 0);

  resetApiStateForTests();
  saveRuleProposal(proposal(233, 7));
  saveReceiptForWallet(233, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(233);
  const { jobs: zeroVoterJobs } = createGuessVerificationJobsForTurn(233);
  saveRuleElection(settledElection(233, 7));
  const zeroVoterJob = zeroVoterJobs[0];
  assert.ok(zeroVoterJob);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: zeroVoterJob.id,
      original: "LOSE",
      player: wallet,
      resultByte: "e",
      turnId: 233,
    }),
  );

  const zeroVoterRewards = calculateAndStoreRewardRecords(
    233,
    "2026-06-12T12:18:00.000Z",
  );
  assert.equal(zeroVoterRewards.creator?.finalRewardLamports, 300_000);
  assert.equal(zeroVoterRewards.voterRewardPool.voterCount, 0);
  assert.equal(zeroVoterRewards.voterRewardPool.finalPoolLamports, 0);
  assert.equal(zeroVoterRewards.voters.length, 0);
});

test("claim flow creates winner and creator claims and blocks double claim", () => {
  resetApiStateForTests();
  saveRuleProposal(proposal(240, 7));
  savePaidRemovals(240, 30);
  saveReceiptForWallet(240, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(240);
  const { jobs } = createGuessVerificationJobsForTurn(240);
  saveRuleElection(settledElection(240, 7));
  const job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: job.id,
      original: "WIN",
      player: wallet,
      resultByte: "f",
      turnId: 240,
    }),
  );

  const { claims } = createClaimRecordsForTurn(240, "2026-06-12T12:20:00.000Z");
  const winnerClaim = claims.find(
    (claim) => claim.kind === "winner_payout" && claim.wallet === wallet,
  );
  const creatorClaim = claims.find((claim) => claim.kind === "creator_reward");
  assert.ok(winnerClaim);
  assert.ok(creatorClaim);
  assert.equal(winnerClaim.status, "available");
  assert.equal(creatorClaim.status, "available");
  assert.equal(winnerClaim.walletApproval.state, "not_requested");
  assert.equal(
    getClaimSummary({ turnId: 240, wallet }).availableLamports > 0,
    true,
  );

  const pending = requestClaimApproval({
    claimId: winnerClaim.claimId,
    requestedAt: "2026-06-12T12:21:00.000Z",
    wallet,
  });
  assert.equal(pending.status, "pending_wallet_approval");
  assert.equal(pending.walletApproval.state, "pending");

  const claimed = completeClaimApproval({
    claimId: winnerClaim.claimId,
    completedAt: "2026-06-12T12:22:00.000Z",
    signature: base58,
    status: "claimed",
    wallet,
  });
  assert.equal(claimed.status, "claimed");
  assert.equal(claimed.walletApproval.state, "approved");
  assert.equal(claimed.walletApproval.signature, base58);
  assert.throws(
    () =>
      requestClaimApproval({
        claimId: winnerClaim.claimId,
        wallet,
      }),
    /PAYOUT_ALREADY_CLAIMED/,
  );
});

test("M9.3 minimum payout and expired unclaimed winner claims roll over safely", () => {
  resetApiStateForTests();
  saveReceiptForWallet(620, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(620);
  let jobs = createGuessVerificationJobsForTurn(620).jobs;
  let job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "NONE",
      jobId: job.id,
      original: "WIN",
      player: wallet,
      resultByte: "5",
      turnId: 620,
    }),
  );

  let created = createClaimRecordsForTurn(
    620,
    "2026-06-12T12:20:00.000Z",
  );
  const belowMinimumWinner = created.claims.find(
    (claim) => claim.kind === "winner_payout" && claim.wallet === wallet,
  );
  assert.ok(belowMinimumWinner);
  assert.equal(belowMinimumWinner.amountLamports, 4_750_000);
  assert.equal(belowMinimumWinner.status, "unavailable");
  assert.equal(belowMinimumWinner.statusReason, "PAYOUT_BELOW_MINIMUM");

  resetApiStateForTests();
  savePaidRemovals(621, 2);
  saveReceiptForWallet(621, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(621);
  jobs = createGuessVerificationJobsForTurn(621).jobs;
  job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "NONE",
      jobId: job.id,
      original: "WIN",
      player: wallet,
      resultByte: "6",
      turnId: 621,
    }),
  );
  created = createClaimRecordsForTurn(621, "2026-06-12T12:20:00.000Z");
  const unclaimedWinner = created.claims.find(
    (claim) => claim.kind === "winner_payout" && claim.wallet === wallet,
  );
  assert.ok(unclaimedWinner);
  assert.equal(unclaimedWinner.status, "available");

  const expired = settleExpiredUnclaimedClaims({
    currentTurnId: 633,
    settledAt: "2026-06-13T12:20:00.000Z",
    sourceTurnId: 621,
  });
  const retry = settleExpiredUnclaimedClaims({
    currentTurnId: 633,
    settledAt: "2026-06-13T12:21:00.000Z",
    sourceTurnId: 621,
  });
  const expiredClaim = listClaimRecords({ turnId: 621 }).find(
    (claim) => claim.claimId === unclaimedWinner.claimId,
  );

  assert.equal(expired.expiredClaims.length, 1);
  assert.equal(expired.originalRolloverLamports, unclaimedWinner.amountLamports);
  assert.equal(expired.alternativeRolloverLamports, 0);
  assert.equal(retry.totalRolloverLamports, 0);
  assert.equal(expiredClaim?.status, "unavailable");
  assert.equal(expiredClaim?.statusReason, "CLAIM_WINDOW_EXPIRED");
  assert.equal(
    getPrizePoolAccounting(633).buckets.original.rolloverLamports,
    unclaimedWinner.amountLamports,
  );
  assert.throws(
    () =>
      requestClaimApproval({
        claimId: unclaimedWinner.claimId,
        wallet,
      }),
    /CLAIM_WINDOW_EXPIRED/,
  );
});

test("player claims summary aggregates a wallet's claims across turns", () => {
  resetApiStateForTests();
  saveRuleProposal(proposal(243, 7));
  savePaidRemovals(243, 30);
  saveReceiptForWallet(243, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(243);
  const { jobs } = createGuessVerificationJobsForTurn(243);
  saveRuleElection(settledElection(243, 7));
  const job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: job.id,
      original: "WIN",
      player: wallet,
      resultByte: "f",
      turnId: 243,
    }),
  );

  const { claims } = createClaimRecordsForTurn(243, "2026-06-12T12:20:00.000Z");
  const winnerClaim = claims.find(
    (claim) => claim.kind === "winner_payout" && claim.wallet === wallet,
  );
  assert.ok(winnerClaim);

  const before = getPlayerClaimsSummary(wallet);
  assert.equal(before.wallet, wallet);
  assert.equal(before.records.length > 0, true);
  assert.equal(before.availableLamports > 0, true);
  assert.equal(before.claimedLamports, 0);

  requestClaimApproval({
    claimId: winnerClaim.claimId,
    requestedAt: "2026-06-12T12:21:00.000Z",
    wallet,
  });
  completeClaimApproval({
    claimId: winnerClaim.claimId,
    completedAt: "2026-06-12T12:22:00.000Z",
    signature: base58,
    status: "claimed",
    wallet,
  });

  const after = getPlayerClaimsSummary(wallet);
  assert.equal(after.claimedLamports, winnerClaim.amountLamports);
  assert.equal(
    after.records.some(
      (claim) =>
        claim.claimId === winnerClaim.claimId && claim.status === "claimed",
    ),
    true,
  );
});

test("player history aggregates guesses, proposals, votes, and claims", () => {
  resetApiStateForTests();
  saveReceiptForWallet(244, wallet, [1, 2, 3, 4, 5, 6]);
  saveRuleProposal({
    ...proposal(244, 7),
    submittedAt: "2026-06-12T12:01:00.000Z",
  });
  saveRuleVote({
    ruleId: 7,
    ruleProposal: base58,
    ruleVote: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:02:00.000Z",
    turnId: 244,
    voter: wallet,
  });
  savePaidRemovals(244, 30);
  saveFulfilledDraw(244);
  const { jobs } = createGuessVerificationJobsForTurn(244);
  saveRuleElection(settledElection(244, 7));
  const job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: job.id,
      original: "LOSE",
      player: wallet,
      resultByte: "8",
      turnId: 244,
    }),
  );
  createClaimRecordsForTurn(244, "2026-06-12T12:20:00.000Z");

  const page = listPlayerHistory({ limit: 3, wallet });

  assert.equal(page.events.length, 3);
  assert.equal(page.nextCursor, "3");
  assert.equal(page.events[0]?.type, "claim");
  assert.equal(
    listPlayerHistory({
      cursor: page.nextCursor,
      limit: 10,
      wallet,
    }).events.some((event) => event.type === "guess"),
    true,
  );
});

test("conversation drafts are saved per wallet and newest draft is listed first", () => {
  resetApiStateForTests();
  const first = saveConversationDraft({
    lastMessage: "I can compile this rule.",
    normalizedText: "Win if at least four numbers match.",
    officialInterpretation: "Count matching numbers between guess and draw.",
    prompt: "Win if at least 4 numbers match",
    ruleId: 101,
    status: "draft",
    tokenCount: 7,
    turnId: 245,
    updatedAt: "2026-06-12T12:00:00.000Z",
    wallet,
  });
  const second = saveConversationDraft({
    ...first,
    lastMessage: "Rule submitted.",
    status: "submitted",
    updatedAt: "2026-06-12T12:05:00.000Z",
  });
  saveConversationDraft({
    lastMessage: "Different wallet.",
    normalizedText: null,
    officialInterpretation: null,
    prompt: "Win with the lowest number",
    ruleId: null,
    status: "draft",
    tokenCount: 5,
    turnId: 245,
    wallet: walletTwo,
  });

  const drafts = listConversationDrafts(wallet);

  assert.equal(first.draftId, second.draftId);
  assert.equal(drafts.length, 1);
  assert.equal(drafts[0]?.status, "submitted");
  assert.equal(drafts[0]?.createdAt, first.createdAt);
});

test("claim flow exposes failed wallet approval and below-threshold unavailable claims", () => {
  resetApiStateForTests();
  saveRuleProposal(proposal(241, 7));
  saveReceiptForWallet(241, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(241);
  const { jobs } = createGuessVerificationJobsForTurn(241);
  saveRuleElection(settledElection(241, 7));
  const job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: job.id,
      original: "LOSE",
      player: wallet,
      resultByte: "1",
      turnId: 241,
    }),
  );

  const { claims } = createClaimRecordsForTurn(241, "2026-06-12T12:20:00.000Z");
  const creatorClaim = claims.find((claim) => claim.kind === "creator_reward");
  const winnerClaim = claims.find((claim) => claim.kind === "winner_payout");
  assert.ok(creatorClaim);
  assert.ok(winnerClaim);
  assert.equal(creatorClaim.status, "unavailable");
  assert.equal(creatorClaim.statusReason, "PAYOUT_BELOW_MINIMUM");

  requestClaimApproval({
    claimId: winnerClaim.claimId,
    requestedAt: "2026-06-12T12:21:00.000Z",
    wallet,
  });
  const failed = completeClaimApproval({
    claimId: winnerClaim.claimId,
    completedAt: "2026-06-12T12:22:00.000Z",
    failureReason: "WALLET_REJECTED",
    status: "failed",
    wallet,
  });
  assert.equal(failed.status, "failed");
  assert.equal(failed.walletApproval.state, "failed");
  assert.equal(failed.walletApproval.failureReason, "WALLET_REJECTED");
  const retried = requestClaimApproval({
    claimId: winnerClaim.claimId,
    requestedAt: "2026-06-12T12:23:00.000Z",
    wallet,
  });
  assert.equal(retried.status, "pending_wallet_approval");
  assert.equal(retried.walletApproval.state, "pending");
});

test("claim flow supports elected-rule voter reward claims", () => {
  resetApiStateForTests();
  saveRuleProposal(proposal(242, 7));
  savePaidRemovals(242, 600);
  saveRuleVote({
    ruleId: 7,
    ruleProposal: base58,
    ruleVote: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:06:00.000Z",
    turnId: 242,
    voter: walletTwo,
  });
  saveRuleVote({
    ruleId: 7,
    ruleProposal: base58,
    ruleVote: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:07:00.000Z",
    turnId: 242,
    voter: walletThree,
  });
  saveReceiptForWallet(242, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(242);
  const { jobs } = createGuessVerificationJobsForTurn(242);
  saveRuleElection(settledElection(242, 7));
  const job = jobs[0];
  assert.ok(job);
  saveGuessVerificationResult(
    resultForJob({
      alternative: "WIN",
      jobId: job.id,
      original: "LOSE",
      player: wallet,
      resultByte: "2",
      turnId: 242,
    }),
  );

  const { claims } = createClaimRecordsForTurn(242, "2026-06-12T12:20:00.000Z");
  const voterClaims = claims.filter((claim) => claim.kind === "voter_reward");
  assert.equal(voterClaims.length, 2);
  assert.equal(
    voterClaims.every((claim) => claim.status === "available"),
    true,
  );
  assert.equal(voterClaims[0]?.amountLamports, 25_200_000);
  assert.equal(
    listClaimRecords({ turnId: 242, wallet: walletTwo })[0]?.kind,
    "voter_reward",
  );
});

test("rule validation creates a traceable compiler audit log", () => {
  resetApiStateForTests();
  saveRuleProposal(proposal(3607, 11));

  const validation = runRuleValidationForProposal({ ruleId: 11, turnId: 3607 });
  const logs = listAuditLogs({ kind: "compiler.validation", turnId: 3607 });
  const log = validation.auditLogHash
    ? getAuditLog(validation.auditLogHash)
    : null;

  assert.equal(validation.decision, "VALID");
  assert.match(validation.auditLogHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(logs.length, 1);
  assert.equal(log?.validationLogId, validation.validationLogId);
  assert.equal(log?.publicStateRef.type, "rule_validation");
  assert.equal(log?.result, "VALID");
  assert.equal(verifyAuditLogIntegrity(log as AuditLogRecord), true);
  assert.match(log?.inputHash ?? "", /^[0-9a-f]{64}$/);
  assert.match(log?.outputHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(
    validation.compiledArtifact?.originalText,
    proposal(3607, 11).sanitizedText,
  );
  assert.equal(
    validation.compiledArtifact?.officialInterpretation,
    proposal(3607, 11).officialInterpretation,
  );
  assert.equal(validation.compiledArtifact?.createdAt, validation.validatedAt);
  assert.ok((validation.compiledArtifact?.evaluatedTestCases.length ?? 0) > 0);
});

test("active alternative verification requires a frozen compiled artifact hash", () => {
  resetApiStateForTests();
  const turnId = 3610;
  saveRuleProposal(proposal(turnId, 7));
  const validation = runRuleValidationForProposal({ ruleId: 7, turnId });
  assert.ok(validation.compiledArtifactHash);
  saveRuleElection({
    ...settledElection(turnId, 7),
    activeRuleArtifactHash: validation.compiledArtifactHash,
  });
  saveReceiptForWallet(turnId, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(turnId);

  const { jobs } = createGuessVerificationJobsForTurn(turnId);
  const job = jobs[0];

  assert.ok(job?.activeRuleArtifact);
  assert.equal(
    job?.payload.compiled_artifact_hash,
    validation.compiledArtifactHash,
  );
  assert.equal(job?.activeRuleArtifact?.createdAt, validation.validatedAt);
});

test("active alternative verification rejects missing or mismatched frozen artifact hashes", () => {
  resetApiStateForTests();
  const missingTurnId = 3611;
  saveRuleProposal(proposal(missingTurnId, 7));
  runRuleValidationForProposal({ ruleId: 7, turnId: missingTurnId });
  saveRuleElection(settledElection(missingTurnId, 7));
  saveReceiptForWallet(missingTurnId, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(missingTurnId);

  assert.throws(
    () => createGuessVerificationJobsForTurn(missingTurnId),
    /ACTIVE_RULE_ARTIFACT_NOT_FROZEN/,
  );

  resetApiStateForTests();
  const mismatchTurnId = 3612;
  saveRuleProposal(proposal(mismatchTurnId, 7));
  runRuleValidationForProposal({ ruleId: 7, turnId: mismatchTurnId });
  saveRuleElection({
    ...settledElection(mismatchTurnId, 7),
    activeRuleArtifactHash: "f".repeat(64),
  });
  saveReceiptForWallet(mismatchTurnId, wallet, [1, 2, 3, 4, 5, 6]);
  saveFulfilledDraw(mismatchTurnId);

  assert.throws(
    () => createGuessVerificationJobsForTurn(mismatchTurnId),
    /ACTIVE_RULE_ARTIFACT_HASH_MISMATCH/,
  );
});

test("ruleSignature canonicalizes trivial wrappers and commutative operands", () => {
  type Ast = Parameters<typeof ruleSignature>[0];
  const intGD = {
    kind: "intersection",
    left: { kind: "source", source: "guess" },
    right: { kind: "source", source: "draw" },
  };
  const intDG = {
    kind: "intersection",
    left: { kind: "source", source: "draw" },
    right: { kind: "source", source: "guess" },
  };
  const base = (predicate: unknown) =>
    ({ schemaVersion: 2, result: { type: "predicate", predicate } }) as Ast;
  const X = { kind: "count_at_least", value: 4, of: intGD };
  const Y = { kind: "count_at_least", value: 1, of: intGD };

  // and[X] === X (single-clause wrapper dropped)
  assert.equal(
    ruleSignature(base({ kind: "and", clauses: [X] })),
    ruleSignature(base(X)),
  );
  // not[not[X]] === X (double negation)
  assert.equal(
    ruleSignature(base({ kind: "not", clause: { kind: "not", clause: X } })),
    ruleSignature(base(X)),
  );
  // intersection is commutative
  assert.equal(
    ruleSignature(base({ kind: "count_at_least", value: 4, of: intGD })),
    ruleSignature(base({ kind: "count_at_least", value: 4, of: intDG })),
  );
  // reordered and-clauses are equal
  assert.equal(
    ruleSignature(base({ kind: "and", clauses: [X, Y] })),
    ruleSignature(base({ kind: "and", clauses: [Y, X] })),
  );
  // adding a real differentiating clause DOES change the signature
  assert.notEqual(
    ruleSignature(base(X)),
    ruleSignature(base({ kind: "and", clauses: [X, Y] })),
  );
});

test("a rule that held a mandate is collected as a mandated signature", () => {
  resetApiStateForTests();
  saveRuleProposal(proposal(300, 50));
  const validation = runRuleValidationForProposal({ ruleId: 50, turnId: 300 });
  assert.equal(validation.decision, "VALID");
  saveRuleElection(settledElection(300, 50));

  const ast = getRuleValidation(300, 50)?.compiledArtifact?.ast;
  assert.ok(ast);
  const signatures = getMandatedRuleSignatures();
  assert.equal(signatures.size, 1);
  assert.ok(signatures.has(ruleSignature(ast)));
});

test("guess verification result creates an audit log matched to public result state", () => {
  resetApiStateForTests();
  saveGuessReceipt({
    gameToken: base58,
    numbers: [1, 2, 3, 4, 90, 91],
    player: wallet,
    playerGuess: base58,
    programId: base58,
    signature: base58,
    submittedAt: "2026-06-12T12:00:00.000Z",
    turnId: 3608,
  });
  saveDraw({
    drawResult: [1, 2, 3, 4, 5, 6],
    drawnAt: "2026-06-12T12:15:00.000Z",
    failureCode: null,
    randomnessAccount: base58,
    randomnessSource: base58,
    randomnessValue: "1".repeat(64),
    requestedAt: "2026-06-12T12:10:00.000Z",
    settleSignature: base58,
    status: "fulfilled",
    turnId: 3608,
  });

  const { jobs } = createGuessVerificationJobsForTurn(
    3608,
    "2026-06-12T12:16:00.000Z",
  );
  const job = jobs[0];
  assert.ok(job);

  const result: GuessVerificationResultRecord = {
    activeRuleId: null,
    alternative: null,
    completedAt: "2026-06-12T12:17:00.000Z",
    jobId: job.id,
    original: {
      inputHash: "2".repeat(64),
      matchedRuleBranch: "original",
      outputHash: "3".repeat(64),
      result: "LOSE",
      runtimeMs: 0,
      runtimeSteps: 1,
    },
    player: wallet,
    resultId: "4".repeat(64),
    status: "completed",
    turnId: 3608,
  };

  const saved = saveGuessVerificationResult(result);
  const log = saved.auditLogHash ? getAuditLog(saved.auditLogHash) : null;

  assert.match(saved.auditLogHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(log?.kind, "guess.verification");
  assert.equal(log?.publicStateRef.type, "guess_verification_result");
  assert.equal(log?.publicStateRef.key, `3608:${wallet}:1`);
  assert.equal(log?.resultId, result.resultId);
  assert.equal(verifyAuditLogIntegrity(log as AuditLogRecord), true);
});

test("audit hashes detect tampering and map to PostgreSQL rows", async () => {
  resetApiStateForTests();
  saveRuleProposal(proposal(3609, 12));
  const validation = runRuleValidationForProposal({ ruleId: 12, turnId: 3609 });
  const log = getAuditLog(validation.auditLogHash ?? "");
  assert.ok(log);

  const tampered: AuditLogRecord = {
    ...log,
    output: { result: "MUTATED" },
  };
  const row = toPostgresAuditLogRow(log);
  const queries: Array<{ text: string; values: unknown[] }> = [];

  await storeAuditLogInPostgres(
    {
      query: async (text: string, values: unknown[]) => {
        queries.push({ text, values });
        return { rowCount: 1 };
      },
    },
    log,
  );

  assert.equal(verifyAuditLogIntegrity(tampered), false);
  assert.equal(row.log_id, log.logHash);
  assert.equal(row.commitment_hash, log.commitmentHash);
  assert.match(
    M3_7_POSTGRES_AUDIT_SCHEMA,
    /CREATE TABLE IF NOT EXISTS audit_logs/,
  );
  assert.equal(queries.length, 1);
  assert.match(queries[0]?.text ?? "", /INSERT INTO audit_logs/);
});

function removalInput(
  turnId: number,
  ruleId: number,
  remover: string,
  removalKind: "creator_self" | "third_party",
) {
  return {
    removalKind,
    remover,
    removedAt: "2026-06-12T12:30:00.000Z",
    ruleId,
    ruleProposal: base58,
    ruleRemoval: base58,
    signature: base58,
    turnId,
  };
}

function addVotes(turnId: number, ruleId: number, count: number) {
  for (let index = 0; index < count; index += 1) {
    saveRuleVote({
      ruleId,
      ruleProposal: base58,
      ruleVote: base58,
      signature: base58,
      submittedAt: "2026-06-12T12:05:00.000Z",
      turnId,
      voter: `voter-${turnId}-${ruleId}-${index}`,
    });
  }
}

test("paid removal by a third party routes fee to the prize pool and records an audit log", () => {
  resetApiStateForTests();
  const turnId = 400;
  saveRuleProposal({ ...proposal(turnId, 1), proposer: wallet });

  const { auditLog, removal } = removeRule(
    removalInput(turnId, 1, walletTwo, "third_party"),
  );

  assert.equal(removal.removalKind, "third_party");
  assert.equal(removal.feeLamports, 50_000_000);
  assert.equal(removal.voteCountAtRemoval, 0);
  assert.equal(isRuleRemoved(turnId, 1), true);
  assert.equal(auditLog.kind, "rule.removal");
  assert.equal(auditLog.result, "removed_paid");
  assert.equal(verifyAuditLogIntegrity(auditLog), true);
  assert.equal(listPaidRuleRemovals(turnId).length, 1);

  const summary = getRoundSummary(turnId, turnId);
  const rule = summary.rules.find((entry) => entry.ruleId === 1);
  assert.equal(rule?.state, "removed_paid");
  const removalEvent = summary.activity.find(
    (event) => event.type === "rule_removed",
  );
  assert.equal(removalEvent?.type, "rule_removed");
  // The removal fee follows normal treasury/prize accounting (PRD §2.5/§6.11):
  // 0.05 SOL with the 5% treasury fee leaves the prize-pool share intact.
  assert.equal(summary.pool.accounting.sources.paidRuleRemovals.count, 1);
  assert.ok(summary.pool.accounting.sources.paidRuleRemovals.prizeLamports > 0);
});

test("creator self-removal is allowed below the threshold and blocked once supported", () => {
  resetApiStateForTests();
  const turnId = 401;
  saveRuleProposal({ ...proposal(turnId, 1), proposer: wallet });

  // 4 votes: below the creator self-remove threshold of 5.
  addVotes(turnId, 1, 4);
  const { removal } = removeRule(
    removalInput(turnId, 1, wallet, "creator_self"),
  );
  assert.equal(removal.removalKind, "creator_self");
  assert.equal(removal.voteCountAtRemoval, 4);

  // A second supported rule reaches the threshold and is protected.
  resetApiStateForTests();
  saveRuleProposal({ ...proposal(turnId, 2), proposer: wallet });
  addVotes(turnId, 2, 5);
  assert.throws(
    () => removeRule(removalInput(turnId, 2, wallet, "creator_self")),
    (error: unknown) =>
      error instanceof RuleRemovalRejectedError &&
      error.code === "RULE_REMOVAL_PROTECTED" &&
      error.threshold === 5 &&
      error.voteCount === 5,
  );
});

test("third-party removal is protected at the higher vote threshold", () => {
  resetApiStateForTests();
  const turnId = 402;
  saveRuleProposal({ ...proposal(turnId, 1), proposer: wallet });

  // 14 votes: a third party may still remove (below 15).
  addVotes(turnId, 1, 14);
  const allowed = removeRule(removalInput(turnId, 1, walletTwo, "third_party"));
  assert.equal(allowed.removal.voteCountAtRemoval, 14);

  // A different rule at 15 votes is protected from third-party removal.
  resetApiStateForTests();
  saveRuleProposal({ ...proposal(turnId, 2), proposer: wallet });
  addVotes(turnId, 2, 15);
  assert.throws(
    () => removeRule(removalInput(turnId, 2, walletTwo, "third_party")),
    (error: unknown) =>
      error instanceof RuleRemovalRejectedError &&
      error.code === "RULE_REMOVAL_PROTECTED" &&
      error.threshold === 15,
  );
});

test("a rule cannot be removed twice and removal closes after the eligible pool locks", () => {
  resetApiStateForTests();
  const turnId = 403;
  saveRuleProposal({ ...proposal(turnId, 1), proposer: wallet });
  removeRule(removalInput(turnId, 1, walletTwo, "third_party"));

  // Duplicate removal (any remover) is rejected because the rule is gone.
  assert.throws(
    () => removeRule(removalInput(turnId, 1, walletThree, "third_party")),
    (error: unknown) =>
      error instanceof RuleRemovalRejectedError &&
      error.code === "RULE_ALREADY_REMOVED",
  );

  // Post-lock removal is rejected once an election (eligible pool lock) exists.
  resetApiStateForTests();
  saveRuleProposal({ ...proposal(turnId, 2), proposer: wallet });
  saveRuleElection(settledElection(turnId, 2));
  assert.throws(
    () => removeRule(removalInput(turnId, 2, walletTwo, "third_party")),
    (error: unknown) =>
      error instanceof RuleRemovalRejectedError &&
      error.code === "RULE_REMOVAL_WINDOW_CLOSED",
  );
});

test("removing an unknown rule is rejected and combined activity feed includes removals", () => {
  resetApiStateForTests();
  const turnId = 404;
  assert.throws(
    () => removeRule(removalInput(turnId, 99, walletTwo, "third_party")),
    (error: unknown) =>
      error instanceof RuleRemovalRejectedError &&
      error.code === "RULE_NOT_FOUND",
  );

  saveRuleProposal({ ...proposal(turnId, 1), proposer: wallet });
  removeRule(removalInput(turnId, 1, walletTwo, "third_party"));
  const events = getRuleRemovalActivityEvents(turnId);
  assert.equal(events.length, 1);
  assert.equal(events[0]?.ruleId, 1);
  assert.equal(getActivityEvents(turnId).length, 1);
});

test("settlement transitions are idempotent and chained into the audit log", () => {
  resetApiStateForTests();
  const turnId = 5301;
  const input = {
    fromState: "DRAWN",
    idempotencyKey: `${turnId}:TURN_CLOSED`,
    inputHash: "11".repeat(32),
    outputHash: "22".repeat(32),
    recordedAt: "2026-06-23T00:00:00.000Z",
    signature: "sig-1",
    toState: "TURN_CLOSED",
    transitionReason: "close_turn",
    turnId,
  };

  const first = recordSettlementTransition(input);
  // A replayed worker step (same idempotencyKey) returns the original record
  // and must NOT append a second audit-log entry or change the signature.
  const replay = recordSettlementTransition({ ...input, signature: "sig-2" });

  assert.equal(first.auditLogHash, replay.auditLogHash);
  assert.equal(replay.signature, "sig-1");
  assert.equal(listSettlementTransitions(turnId).length, 1);

  const log = getAuditLog(first.auditLogHash);
  assert.ok(log);
  assert.equal(log?.kind, "settlement.transition");
  assert.equal(verifyAuditLogIntegrity(log as AuditLogRecord), true);

  // A distinct transition appends a new chained entry.
  recordSettlementTransition({
    ...input,
    fromState: "TURN_CLOSED",
    idempotencyKey: `${turnId}:VERIFYING`,
    toState: "VERIFYING",
    transitionReason: "project_verification",
  });
  assert.equal(listSettlementTransitions(turnId).length, 2);
});

test("settled rule election creates a public M9.0 proof audit log", () => {
  resetApiStateForTests();
  const turnId = 5302;

  const election = saveRuleElection(settledElection(turnId, 7));
  const logs = listAuditLogs({ kind: "rule.election.proof", turnId });

  assert.equal(logs.length, 1);
  const log = logs[0] as AuditLogRecord;
  assert.equal(log.publicStateRef.type, "rule_election");
  assert.equal(log.publicStateRef.key, String(turnId));
  assert.equal(log.result, "settled");
  assert.equal(verifyAuditLogIntegrity(log), true);

  const input = log.input as {
    activeElection: { randomnessValue: string | null };
    candidateCommitments: Array<{ ruleId: number }>;
    finalistElection: { randomnessValue: string | null };
    noDeterministicFallback: boolean;
  };
  const output = log.output as { activeRuleId: number | null };
  assert.equal(
    input.finalistElection.randomnessValue,
    election.randomnessValue,
  );
  assert.equal(
    input.activeElection.randomnessValue,
    election.activeElectionRandomnessValue,
  );
  assert.deepEqual(
    input.candidateCommitments.map((candidate) => candidate.ruleId),
    [7],
  );
  assert.equal(input.noDeterministicFallback, true);
  assert.equal(output.activeRuleId, 7);

  saveRuleElection(settledElection(turnId, 7));
  assert.equal(
    listAuditLogs({ kind: "rule.election.proof", turnId }).length,
    1,
  );
});
