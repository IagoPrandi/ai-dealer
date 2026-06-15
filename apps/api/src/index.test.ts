import assert from "node:assert/strict";
import { test } from "node:test";
import {
  M3_7_POSTGRES_AUDIT_SCHEMA,
  calculateAndStoreRewardRecords,
  calculateAndStoreWinnerRecords,
  calculatePrizePoolAccounting,
  calculateRewardDistribution,
  completeClaimApproval,
  createClaimRecordsForTurn,
  createGuessVerificationJobsForTurn,
  getAuditLog,
  getClaimSummary,
  getMandatedRuleSignatures,
  getPrizePoolAccounting,
  getRewardSummary,
  getRoundSummary,
  getRuleValidation,
  ruleSignature,
  listClaimRecords,
  listCreatorRewardRecords,
  listVoterRewardRecords,
  listWinnerRecords,
  listAuditLogs,
  resetApiStateForTests,
  runRuleValidationForProposal,
  saveDraw,
  saveGuessReceipt,
  saveGuessVerificationResult,
  savePaidRuleRemoval,
  saveRuleElection,
  saveRuleProposal,
  saveRuleVote,
  saveTurnRollover,
  requestClaimApproval,
  storeAuditLogInPostgres,
  toPostgresAuditLogRow,
  verifyAuditLogIntegrity,
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
    activeRuleArtifactHash: null,
    activeRuleHash: "1".repeat(64),
    activeRuleId,
    electedFinalistIndex: 0,
    eligibleRuleIds: [activeRuleId],
    eligibleRulePoolHash: "2".repeat(64),
    finalistRuleIds: [activeRuleId],
    finalistSetHash: "3".repeat(64),
    randomFinalistHash: "4".repeat(64),
    randomRuleIds: [],
    randomnessAccount: null,
    randomnessSource: null,
    randomnessValue: null,
    requestedAt: "2026-06-12T12:10:00.000Z",
    settledAt: "2026-06-12T12:16:00.000Z",
    status: "settled" as const,
    topVotedFinalistHash: "5".repeat(64),
    topVotedRuleIds: [activeRuleId],
    turnId,
  };
}

function saveReceiptForWallet(turnId: number, player: string, numbers: number[]) {
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

  assert.equal(accounting.sources.guessSubmissions.grossLamports, 20_000_000);
  assert.equal(accounting.sources.ruleProposals.grossLamports, 40_000_000);
  assert.equal(accounting.sources.paidRuleRemovals.grossLamports, 50_000_000);
  assert.equal(accounting.sources.votes.grossLamports, 6_000_000);
  assert.equal(accounting.sources.votes.feeActive, true);
  assert.equal(accounting.grossFeesLamports, 116_000_000);
  assert.equal(accounting.treasuryLamports, 5_800_000);
  assert.equal(accounting.platformMonetizationLamports, 5_800_000);
  assert.equal(accounting.currentTurnPoolLamports, 110_200_000);
  assert.equal(accounting.buckets.original.currentTurnLamports, 55_100_000);
  assert.equal(accounting.buckets.alternative.currentTurnLamports, 55_100_000);
  assert.equal(accounting.buckets.original.totalLamports, 55_100_007);
  assert.equal(accounting.buckets.alternative.totalLamports, 55_100_009);
  assert.equal(accounting.totalVisiblePrizePoolLamports, 110_200_016);
  assert.deepEqual(accounting.nextRolloverIfNoWinnersLamports, {
    alternative: 55_100_009,
    original: 55_100_007,
  });
});

test("vote fees are free before turn 100 and counted from turn 100 onward", () => {
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

  assert.equal(beforeGate.sources.votes.count, 0);
  assert.equal(beforeGate.sources.votes.grossLamports, 0);
  assert.equal(beforeGate.sources.votes.feeActive, false);
  assert.equal(afterGate.sources.votes.count, 10);
  assert.equal(afterGate.sources.votes.grossLamports, 20_000_000);
  assert.equal(afterGate.sources.votes.feeActive, true);
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
  assert.equal(summary.pool.accounting.totalVisiblePrizePoolLamports, 83_000_000);
  assert.equal(summary.pool.guesses, 1);
  assert.equal(summary.pool.proposals, 1);
  assert.equal(summary.pool.paidRemovals, 1);
  assert.equal(summary.pool.indicativeSol, 0.083);
  assert.equal(summary.pool.treasurySol, 0.004);
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

  const winners = calculateAndStoreWinnerRecords(240, "2026-06-12T12:18:00.000Z");
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
  assert.equal(winners.alternative.individualPayoutLamports, 9_500_000);
  assert.equal(rewards.creatorRewardReserveLamports, 400_000);
  assert.equal(rewards.creator?.creatorWallet, wallet);
  assert.equal(rewards.creator?.calculatedRewardLamports, 2_850_000);
  assert.equal(rewards.creator?.finalRewardLamports, 400_000);
  assert.equal(rewards.voterRewardPool.calculatedPoolLamports, 1_425_000);
  assert.equal(rewards.voterRewardPool.finalPoolLamports, 0);
  assert.equal(voterRecords.length, 2);
  assert.equal(voterRecords[0]?.finalRewardLamports, 0);
  assert.equal(creatorRecords.length, 1);
  assert.equal(summary.winners.alternative.individualPayoutLamports, 9_500_000);
  assert.equal(summary.rewards.creator?.finalRewardLamports, 400_000);
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

  const { claims } = createClaimRecordsForTurn(
    240,
    "2026-06-12T12:20:00.000Z",
  );
  const winnerClaim = claims.find(
    (claim) => claim.kind === "winner_payout" && claim.wallet === wallet,
  );
  const creatorClaim = claims.find((claim) => claim.kind === "creator_reward");
  assert.ok(winnerClaim);
  assert.ok(creatorClaim);
  assert.equal(winnerClaim.status, "available");
  assert.equal(creatorClaim.status, "available");
  assert.equal(winnerClaim.walletApproval.state, "not_requested");
  assert.equal(getClaimSummary({ turnId: 240, wallet }).availableLamports > 0, true);

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

  const { claims } = createClaimRecordsForTurn(
    241,
    "2026-06-12T12:20:00.000Z",
  );
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

  const { claims } = createClaimRecordsForTurn(
    242,
    "2026-06-12T12:20:00.000Z",
  );
  const voterClaims = claims.filter((claim) => claim.kind === "voter_reward");
  assert.equal(voterClaims.length, 2);
  assert.equal(voterClaims.every((claim) => claim.status === "available"), true);
  assert.equal(voterClaims[0]?.amountLamports, 25_150_000);
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
  const log = validation.auditLogHash ? getAuditLog(validation.auditLogHash) : null;

  assert.equal(validation.decision, "VALID");
  assert.match(validation.auditLogHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(logs.length, 1);
  assert.equal(log?.validationLogId, validation.validationLogId);
  assert.equal(log?.publicStateRef.type, "rule_validation");
  assert.equal(log?.result, "VALID");
  assert.equal(verifyAuditLogIntegrity(log as AuditLogRecord), true);
  assert.match(log?.inputHash ?? "", /^[0-9a-f]{64}$/);
  assert.match(log?.outputHash ?? "", /^[0-9a-f]{64}$/);
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
  assert.equal(ruleSignature(base({ kind: "and", clauses: [X] })), ruleSignature(base(X)));
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
  assert.equal(log?.publicStateRef.key, `3608:${wallet}`);
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
  assert.match(M3_7_POSTGRES_AUDIT_SCHEMA, /CREATE TABLE IF NOT EXISTS audit_logs/);
  assert.equal(queries.length, 1);
  assert.match(queries[0]?.text ?? "", /INSERT INTO audit_logs/);
});
