import assert from "node:assert/strict";
import { test } from "node:test";
import {
  M3_7_POSTGRES_AUDIT_SCHEMA,
  calculateAndStoreWinnerRecords,
  calculatePrizePoolAccounting,
  createGuessVerificationJobsForTurn,
  getAuditLog,
  getPrizePoolAccounting,
  getRoundSummary,
  listWinnerRecords,
  listAuditLogs,
  resetApiStateForTests,
  runRuleValidationForProposal,
  saveDraw,
  saveGuessReceipt,
  saveGuessVerificationResult,
  savePaidRuleRemoval,
  saveRuleProposal,
  saveRuleVote,
  saveTurnRollover,
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
    maxTokens: 80,
    normalizedTextHash: hashArray(1),
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
