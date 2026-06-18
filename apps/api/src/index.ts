import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  CLAIM_WINDOW_DAYS,
  CLAIM_WINDOW_TURNS,
  CREATOR_REWARD_CAP_SOL,
  CREATOR_REWARD_RATE_BPS,
  CREATOR_REWARD_RESERVE_SHARE_BPS,
  LAMPORTS_PER_SOL,
  MINIMUM_CLAIM_THRESHOLD_SOL,
  MVP_FEES_SOL,
  RULE_MAX_TOKENS,
  TREASURY_FEE_BPS,
  TURN_DURATION_CYCLE_HOURS,
  VOTER_REWARD_CONFIG,
  VOTER_REWARD_RATE_BPS,
  VOTE_FEE_START_TURN,
} from "@idealer/constants";
import {
  compileRuleArtifact,
  resolveRankingWinners,
  validateAndPrecompileRule,
  type AgentModelIdentity,
  type AgentProviderAttemptLog,
  type CompilerConfidenceBreakdown,
  type RuleAst,
  type RuleAstProvider,
  type RuleCompiledArtifact,
  type RuleConfidenceAction,
  type RuleValidationDecision,
  type RuleValidationReasonCode,
  type RuleValidationTestResult,
} from "@idealer/rule-compiler";
import pg from "pg";
import { createClient } from "redis";
import {
  compileRuleToAst,
  ensureModelLoaded,
  interpretRuleWithAgent,
  resolveEscalationModel,
  resolveRuleAgentConfig,
  resolveTranslateToEnglish,
  RuleAgentError,
  translateRuleToEnglish,
} from "./llm.js";
import {
  checkGroundedness,
  detectJailbreak,
  resolveGuardianConfig,
} from "./guardian.js";

const { Pool } = pg;
const MAX_RULE_TEXT_BYTES = 6000;
const RULE_PREVENTED_PATTERNS = [
  /\bignore\b.{0,40}\b(instructions?|rules?|prompt)\b/i,
  /\b(system|developer)\s+(prompt|message|instruction)\b/i,
  /\bjailbreak\b/i,
  /\bprompt\s*injection\b/i,
  /\breveal\b.{0,40}\b(prompt|secret|private key|seed phrase)\b/i,
] as const;

export interface ServiceHealth {
  service: string;
  status: "ok" | "error";
  turnDurationCycleHours: readonly number[];
  postgres: "ok" | "error";
  redis: "ok" | "error";
}

export interface GuessReceiptRecord {
  gameToken: string;
  numbers: readonly number[];
  player: string;
  playerGuess: string;
  programId: string;
  signature: string;
  submittedAt: string;
  turnId: number;
}

export interface RulePreflightResult {
  addedOperationalClauses: string[];
  clarityNote: string;
  // Compile gate (PRD §7.5): the rule is only payable/proposable when the dealer
  // can compile it into a verifiable AST. These fields carry that verdict so the
  // frontend can gate submission on `decision === "VALID"`.
  compiledArtifactHash?: string | null;
  decision?: RuleValidationDecision;
  dealerMessage: string;
  difficultyClass?: string;
  englishText?: string;
  escalated?: boolean;
  finalConfidence?: number;
  guardianChecked?: boolean;
  guardianGrounded?: boolean | undefined;
  guardianNote?: string | undefined;
  maxTokens: number;
  modelUsed?: string;
  needsClarification: boolean;
  normalizedText: string;
  normalizedTextHash: readonly number[];
  officialInterpretation: string;
  officialInterpretationHash: readonly number[];
  preflightResultHash: readonly number[];
  reasonSummary?: string;
  reproposalBlocked?: boolean;
  ruleId: number;
  ruleMode?: "predicate" | "ranking" | undefined;
  sanitizedText: string;
  sanitizedTextHash: readonly number[];
  tokenCount: number;
}

export interface RuleProposalRecord extends RulePreflightResult {
  compiledArtifactHash?: string | null;
  proposer: string;
  precompilationStatus?: "failed" | "passed" | "pending";
  validation?: RuleValidationSummary | null;
  ruleProposal: string;
  signature: string;
  state?: "eligible" | "invalidated" | "proposed";
  submittedAt: string;
  title: string;
  turnId: number;
}

export interface RuleVoteRecord {
  ruleId: number;
  ruleProposal: string;
  ruleVote: string;
  signature: string;
  submittedAt: string;
  turnId: number;
  voter: string;
}

export interface PaidRuleRemovalRecord {
  removalKind: "creator_self" | "third_party";
  remover: string;
  removedAt: string;
  ruleId: number;
  ruleProposal: string;
  ruleRemoval: string;
  signature: string;
  turnId: number;
}

export interface TurnRolloverRecord {
  alternativeRolloverLamports: number;
  originalRolloverLamports: number;
  recordedAt: string;
  sourceTurnId: number | null;
  turnId: number;
}

export interface PrizePoolAccountingConfig {
  guessSubmissionFeeLamports: number;
  paidRuleRemovalFeeLamports: number;
  ruleProposalFeeLamports: number;
  treasuryFeeBps: number;
  voteFeeLamports: number;
  voteFeeStartTurn: number;
}

export interface PrizePoolFeeSourceAccounting {
  count: number;
  feeLamports: number;
  grossLamports: number;
  prizeLamports: number;
  treasuryLamports: number;
}

export interface PrizePoolAccounting {
  buckets: {
    alternative: {
      currentTurnLamports: number;
      rolloverLamports: number;
      totalLamports: number;
    };
    original: {
      currentTurnLamports: number;
      rolloverLamports: number;
      totalLamports: number;
    };
  };
  config: PrizePoolAccountingConfig;
  currentTurnPoolLamports: number;
  grossFeesLamports: number;
  nextRolloverIfNoWinnersLamports: {
    alternative: number;
    original: number;
  };
  platformMonetizationLamports: number;
  sources: {
    guessSubmissions: PrizePoolFeeSourceAccounting;
    paidRuleRemovals: PrizePoolFeeSourceAccounting;
    ruleProposals: PrizePoolFeeSourceAccounting;
    votes: PrizePoolFeeSourceAccounting & { feeActive: boolean };
  };
  totalVisiblePrizePoolLamports: number;
  treasuryLamports: number;
  turnId: number;
}

export type DrawStatus = "failed" | "fulfilled" | "requested";

export interface DrawRecord {
  drawResult: number[] | null;
  drawnAt: string | null;
  failureCode: number | null;
  randomnessAccount: string;
  randomnessSource: string | null;
  randomnessValue: string | null;
  requestedAt: string;
  settleSignature: string | null;
  status: DrawStatus;
  turnId: number;
}

export interface RulePrecompilationRecord {
  compiledArtifactHash: string | null;
  ruleId: number;
  status: "failed" | "passed";
  turnId: number;
  updatedAt: string;
}

export interface RuleValidationSummary {
  auditLogHash?: string | null;
  confidenceAction: RuleConfidenceAction;
  decision: RuleValidationDecision;
  fallbackTriggered: boolean;
  finalConfidence: number;
  model: string;
  provider: string;
  providerDisagreementRateSample: number;
  reasonCodes: RuleValidationReasonCode[];
  reasonSummary: string;
  validatedAt: string;
  validationLogId: string;
}

export interface RuleValidationRecord extends RuleValidationSummary {
  auditLogHash?: string;
  compiledArtifactHash: string | null;
  compiledArtifact: RuleCompiledArtifact | null;
  confidence: CompilerConfidenceBreakdown;
  evaluatedTestCases: RuleValidationTestResult[];
  fallbackRateSample: number;
  fallbackTriggered: boolean;
  modelIdentity: AgentModelIdentity;
  normalizedText: string;
  provider: string;
  providerDisagreementRateSample: number;
  providerPath: AgentProviderAttemptLog[];
  ruleId: number;
  turnId: number;
}

export type GuessVerificationJobStatus =
  | "completed"
  | "dead_letter"
  | "pending"
  | "processing"
  | "retry_scheduled";
export type VerificationOutcome = "LOSE" | "WIN";

export interface GuessVerificationJobPayload {
  active_rule_id?: string;
  compiled_artifact_hash?: string;
  draw_hash: string;
  guess_hash: string;
  turn_id: string;
  wallet: string;
}

export interface GuessVerificationJobRecord {
  activeRuleArtifact: RuleCompiledArtifact | null;
  activeRuleId: number | null;
  attempts: number;
  completedAt: string | null;
  createdAt: string;
  deadLetteredAt: string | null;
  draw: readonly number[];
  error: string | null;
  id: string;
  idempotencyKey: string;
  maxAttempts: number;
  payload: GuessVerificationJobPayload;
  playerGuess: readonly number[];
  resultId: string | null;
  runAfter: string;
  status: GuessVerificationJobStatus;
  turnId: number;
  updatedAt: string;
}

export interface RuleVerificationResultRecord {
  inputHash: string;
  matchedRuleBranch: string;
  outputHash: string;
  result: VerificationOutcome;
  runtimeMs: number;
  runtimeSteps: number;
  // For ranking rules the per-guess outcome is provisional (LOSE) until the
  // turn-level argmax; `score` carries the comparable value used by that argmax.
  score?: number;
}

export interface GuessVerificationResultRecord {
  activeRuleId: number | null;
  alternative: RuleVerificationResultRecord | null;
  // Ranking rules ("whoever matches the most ...") decide winners by comparing
  // scores across all guesses. The worker records the rule mode + direction so
  // winner calculation can run the argmax. Absent/`predicate` keeps the existing
  // per-guess WIN/LOSE behaviour.
  alternativeDirection?: "max" | "min";
  alternativeMode?: "predicate" | "ranking";
  auditLogHash?: string;
  completedAt: string;
  jobId: string;
  original: RuleVerificationResultRecord;
  player: string;
  resultId: string;
  status: "completed";
  turnId: number;
}

export type WinnerCategory = "alternative" | "original";

export interface WinnerRecord {
  activeRuleId: number | null;
  bucketLamports: number;
  calculatedAt: string;
  category: WinnerCategory;
  payoutLamports: number;
  player: string;
  resultId: string;
  status: "calculated";
  turnId: number;
  winnerCount: number;
}

export interface WinnerCategorySummary {
  bucketLamports: number;
  individualPayoutLamports: number;
  remainderLamports: number;
  winnerCount: number;
}

export interface WinnerCalculationSummary {
  alternative: WinnerCategorySummary;
  original: WinnerCategorySummary;
  records: WinnerRecord[];
  turnId: number;
}

export interface CreatorRewardRecord {
  activeRuleId: number;
  availableReserveLamports: number;
  calculatedAt: string;
  calculatedRewardLamports: number;
  capPerTurnLamports: number;
  creatorWallet: string;
  finalRewardLamports: number;
  individualAltPayoutLamports: number;
  rewardRateBps: number;
  status: "calculated" | "not_available";
  turnId: number;
  wasCapped: boolean;
  winnerCount: number;
}

export interface VoterRewardRecord {
  activeRuleId: number;
  calculatedAt: string;
  finalRewardLamports: number;
  individualAltPayoutLamports: number;
  rewardPoolLamports: number;
  rewardRateBps: number;
  status: "calculated" | "not_available";
  turnId: number;
  voter: string;
  voterCount: number;
}

export interface RewardCalculationSummary {
  activeRuleId: number | null;
  creator: CreatorRewardRecord | null;
  creatorRewardReserveLamports: number;
  remainingReserveLamports: number;
  turnId: number;
  voterRewardPool: {
    capPerTurnLamports: number;
    calculatedPoolLamports: number;
    finalPoolLamports: number;
    individualRewardLamports: number;
    remainderLamports: number;
    rewardRateBps: number;
    voterCount: number;
    wasCapped: boolean;
  };
  voters: VoterRewardRecord[];
}

export type ClaimKind = "creator_reward" | "voter_reward" | "winner_payout";
export type ClaimRecordStatus =
  | "available"
  | "claimed"
  | "failed"
  | "pending_wallet_approval"
  | "unavailable";
export type ClaimWalletApprovalState =
  | "approved"
  | "failed"
  | "not_requested"
  | "pending";

export interface ClaimWalletApproval {
  approvalStartedAt: string | null;
  completedAt: string | null;
  failureReason: string | null;
  required: true;
  signature: string | null;
  state: ClaimWalletApprovalState;
  transactionLabel: string;
}

export interface ClaimRecord {
  activeRuleId: number | null;
  amountLamports: number;
  availableAt: string;
  category: WinnerCategory | null;
  claimId: string;
  claimWindowExpiresAt: string;
  claimWindowTurns: number;
  claimedAt: string | null;
  createdAt: string;
  failedAt: string | null;
  kind: ClaimKind;
  sourceRecordKey: string;
  status: ClaimRecordStatus;
  statusReason: string;
  turnId: number;
  updatedAt: string;
  wallet: string;
  walletApproval: ClaimWalletApproval;
}

export interface ClaimSummary {
  availableLamports: number;
  claimedLamports: number;
  failedLamports: number;
  pendingLamports: number;
  records: ClaimRecord[];
  turnId: number;
  wallet: string | null;
}

export type AuditLogKind = "compiler.validation" | "guess.verification";
export type AuditPublicStateType = "guess_verification_result" | "rule_validation";

export interface AuditPublicStateRef {
  key: string;
  type: AuditPublicStateType;
}

export interface AuditLogRecord {
  commitmentHash: string;
  commitmentMechanism: "postgres_hash_chain_v1";
  createdAt: string;
  input: unknown;
  inputHash: string;
  jobId: string | null;
  kind: AuditLogKind;
  logHash: string;
  output: unknown;
  outputHash: string;
  player: string | null;
  postgresTable: "audit_logs";
  previousLogHash: string | null;
  publicStateRef: AuditPublicStateRef;
  reason: string;
  result: string;
  resultId: string | null;
  ruleId: number | null;
  schemaVersion: 1;
  turnId: number;
  validationLogId: string | null;
}

export interface PostgresAuditLogRow {
  commitment_hash: string;
  commitment_mechanism: AuditLogRecord["commitmentMechanism"];
  created_at: string;
  input_hash: string;
  input_json: unknown;
  job_id: string | null;
  log_hash: string;
  log_id: string;
  log_kind: AuditLogKind;
  output_hash: string;
  output_json: unknown;
  player_wallet: string | null;
  previous_log_hash: string | null;
  public_state_key: string;
  public_state_type: AuditPublicStateType;
  reason: string;
  result: string;
  result_id: string | null;
  rule_id: string | null;
  turn_id: string;
  validation_log_id: string | null;
}

export interface PostgresAuditClient {
  query: (text: string, values: unknown[]) => Promise<unknown>;
}

export const M3_7_POSTGRES_AUDIT_SCHEMA = `
CREATE TABLE IF NOT EXISTS audit_logs (
  log_id text PRIMARY KEY,
  log_kind text NOT NULL,
  turn_id text NOT NULL,
  rule_id text,
  player_wallet text,
  job_id text,
  validation_log_id text,
  result_id text,
  public_state_type text NOT NULL,
  public_state_key text NOT NULL,
  input_hash text NOT NULL,
  output_hash text NOT NULL,
  log_hash text NOT NULL UNIQUE,
  previous_log_hash text,
  commitment_hash text NOT NULL UNIQUE,
  commitment_mechanism text NOT NULL,
  reason text NOT NULL,
  result text NOT NULL,
  input_json jsonb NOT NULL,
  output_json jsonb NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS audit_logs_turn_kind_idx
  ON audit_logs (turn_id, log_kind, created_at);

CREATE INDEX IF NOT EXISTS audit_logs_public_state_idx
  ON audit_logs (public_state_type, public_state_key);
`;

export interface RuleElectionRecord {
  activeRuleArtifactHash: string | null;
  activeRuleHash: string | null;
  activeRuleId: number | null;
  electedFinalistIndex: number;
  eligibleRuleIds: number[];
  eligibleRulePoolHash: string;
  finalistRuleIds: number[];
  finalistSetHash: string;
  randomFinalistHash: string;
  randomRuleIds: number[];
  randomnessAccount: string | null;
  randomnessSource: string | null;
  randomnessValue: string | null;
  requestedAt: string | null;
  settledAt: string | null;
  status: "locked" | "original_only" | "requested" | "settled";
  topVotedFinalistHash: string;
  topVotedRuleIds: number[];
  turnId: number;
}

const IDEALER_ACTIVE_TURN_ID = Number(
  process.env.IDEALER_ACTIVE_TURN_ID ?? "1",
);
const guessReceipts = new Map<string, GuessReceiptRecord>();
const ruleProposals = new Map<string, RuleProposalRecord>();
const ruleVotes = new Map<string, RuleVoteRecord>();
const paidRuleRemovals = new Map<string, PaidRuleRemovalRecord>();
const turnRollovers = new Map<number, TurnRolloverRecord>();
const draws = new Map<number, DrawRecord>();
const elections = new Map<number, RuleElectionRecord>();
const ruleValidations = new Map<string, RuleValidationRecord>();
const verificationJobs = new Map<string, GuessVerificationJobRecord>();
const verificationResults = new Map<string, GuessVerificationResultRecord>();
const winnerRecords = new Map<string, WinnerRecord>();
const creatorRewardRecords = new Map<string, CreatorRewardRecord>();
const voterRewardRecords = new Map<string, VoterRewardRecord>();
const claimRecords = new Map<string, ClaimRecord>();
const auditLogs = new Map<string, AuditLogRecord>();
const auditLogOrder: string[] = [];
let lastAuditLogHash: string | null = null;
const LOCAL_WEB_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const CORS_PATHS = new Set([
  "/draws",
  "/elections",
  "/guess-receipts",
  "/prize-pool-accounting",
  "/prize-pool-rollovers",
  "/rule-precompilations",
  "/rule-preflight",
  "/rule-removals",
  "/rule-proposals",
  "/rule-validations",
  "/rule-validations/run",
  "/rule-votes",
  "/reward-records",
  "/reward-records/calculate-turn",
  "/verification-jobs",
  "/verification-jobs/create-turn",
  "/verification-results",
  "/winner-records",
  "/winner-records/calculate-turn",
  "/audit",
  "/claim-records",
  "/claim-records/complete",
  "/claim-records/create-turn",
  "/claim-records/request",
]);

function getGuessReceiptKey(turnId: number, player: string) {
  return `${turnId}:${player}`;
}

function getRuleProposalKey(turnId: number, ruleId: number) {
  return `${turnId}:${ruleId}`;
}

function getRuleVoteKey(turnId: number, ruleId: number, voter: string) {
  return `${turnId}:${ruleId}:${voter}`;
}

function getPaidRuleRemovalKey(turnId: number, ruleId: number, remover: string) {
  return `${turnId}:${ruleId}:${remover}`;
}

function isBase58Like(value: unknown) {
  return (
    typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(value)
  );
}

function countRuleTokens(value: string) {
  return value.match(/\p{L}+|\p{N}+|[^\s\p{L}\p{N}]/gu)?.length ?? 0;
}

function removeControlCharacters(value: string) {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);

      return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
        ? " "
        : character;
    })
    .join("");
}

function sanitizeRuleText(value: string) {
  return removeControlCharacters(value).replace(/\s+/g, " ").trim();
}

function hashBytes(value: string) {
  return Array.from(createHash("sha256").update(value, "utf8").digest());
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function appendAuditLog(args: {
  createdAt: string;
  input: unknown;
  jobId?: string | null;
  kind: AuditLogKind;
  output: unknown;
  player?: string | null;
  publicStateRef: AuditPublicStateRef;
  reason: string;
  result: string;
  resultId?: string | null;
  ruleId?: number | null;
  turnId: number;
  validationLogId?: string | null;
}): AuditLogRecord {
  const inputHash = hashJson(args.input);
  const outputHash = hashJson(args.output);
  const logHash = hashJson({
    inputHash,
    jobId: args.jobId ?? null,
    kind: args.kind,
    outputHash,
    player: args.player ?? null,
    previousLogHash: lastAuditLogHash,
    publicStateRef: args.publicStateRef,
    result: args.result,
    resultId: args.resultId ?? null,
    ruleId: args.ruleId ?? null,
    schemaVersion: 1,
    turnId: args.turnId,
    validationLogId: args.validationLogId ?? null,
  });
  const commitmentHash = hashJson({
    commitmentMechanism: "postgres_hash_chain_v1",
    logHash,
    postgresTable: "audit_logs",
    previousLogHash: lastAuditLogHash,
  });
  const record: AuditLogRecord = {
    commitmentHash,
    commitmentMechanism: "postgres_hash_chain_v1",
    createdAt: args.createdAt,
    input: args.input,
    inputHash,
    jobId: args.jobId ?? null,
    kind: args.kind,
    logHash,
    output: args.output,
    outputHash,
    player: args.player ?? null,
    postgresTable: "audit_logs",
    previousLogHash: lastAuditLogHash,
    publicStateRef: args.publicStateRef,
    reason: args.reason,
    result: args.result,
    resultId: args.resultId ?? null,
    ruleId: args.ruleId ?? null,
    schemaVersion: 1,
    turnId: args.turnId,
    validationLogId: args.validationLogId ?? null,
  };

  auditLogs.set(logHash, record);
  auditLogOrder.push(logHash);
  lastAuditLogHash = logHash;
  return record;
}

export function verifyAuditLogIntegrity(record: AuditLogRecord) {
  const inputHash = hashJson(record.input);
  const outputHash = hashJson(record.output);
  const logHash = hashJson({
    inputHash,
    jobId: record.jobId,
    kind: record.kind,
    outputHash,
    player: record.player,
    previousLogHash: record.previousLogHash,
    publicStateRef: record.publicStateRef,
    result: record.result,
    resultId: record.resultId,
    ruleId: record.ruleId,
    schemaVersion: record.schemaVersion,
    turnId: record.turnId,
    validationLogId: record.validationLogId,
  });
  const commitmentHash = hashJson({
    commitmentMechanism: record.commitmentMechanism,
    logHash,
    postgresTable: record.postgresTable,
    previousLogHash: record.previousLogHash,
  });

  return (
    record.inputHash === inputHash &&
    record.outputHash === outputHash &&
    record.logHash === logHash &&
    record.commitmentHash === commitmentHash
  );
}

export function toPostgresAuditLogRow(record: AuditLogRecord): PostgresAuditLogRow {
  return {
    commitment_hash: record.commitmentHash,
    commitment_mechanism: record.commitmentMechanism,
    created_at: record.createdAt,
    input_hash: record.inputHash,
    input_json: record.input,
    job_id: record.jobId,
    log_hash: record.logHash,
    log_id: record.logHash,
    log_kind: record.kind,
    output_hash: record.outputHash,
    output_json: record.output,
    player_wallet: record.player,
    previous_log_hash: record.previousLogHash,
    public_state_key: record.publicStateRef.key,
    public_state_type: record.publicStateRef.type,
    reason: record.reason,
    result: record.result,
    result_id: record.resultId,
    rule_id: record.ruleId === null ? null : String(record.ruleId),
    turn_id: String(record.turnId),
    validation_log_id: record.validationLogId,
  };
}

export async function storeAuditLogInPostgres(
  client: PostgresAuditClient,
  record: AuditLogRecord,
) {
  const row = toPostgresAuditLogRow(record);
  await client.query(
    `
    INSERT INTO audit_logs (
      log_id, log_kind, turn_id, rule_id, player_wallet, job_id,
      validation_log_id, result_id, public_state_type, public_state_key,
      input_hash, output_hash, log_hash, previous_log_hash,
      commitment_hash, commitment_mechanism, reason, result,
      input_json, output_json, created_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6,
      $7, $8, $9, $10,
      $11, $12, $13, $14,
      $15, $16, $17, $18,
      $19::jsonb, $20::jsonb, $21
    )
    ON CONFLICT (log_id) DO NOTHING
    `,
    [
      row.log_id,
      row.log_kind,
      row.turn_id,
      row.rule_id,
      row.player_wallet,
      row.job_id,
      row.validation_log_id,
      row.result_id,
      row.public_state_type,
      row.public_state_key,
      row.input_hash,
      row.output_hash,
      row.log_hash,
      row.previous_log_hash,
      row.commitment_hash,
      row.commitment_mechanism,
      row.reason,
      row.result,
      JSON.stringify(row.input_json),
      JSON.stringify(row.output_json),
      row.created_at,
    ],
  );
}

export function listAuditLogs(args: {
  kind?: AuditLogKind;
  turnId?: number;
} = {}) {
  return auditLogOrder
    .map((logHash) => auditLogs.get(logHash))
    .filter((record): record is AuditLogRecord => {
      if (!record) {
        return false;
      }
      if (args.turnId !== undefined && record.turnId !== args.turnId) {
        return false;
      }
      return args.kind === undefined || record.kind === args.kind;
    });
}

export function getAuditLog(logHash: string) {
  return auditLogs.get(logHash) ?? null;
}

export function resetApiStateForTests() {
  guessReceipts.clear();
  ruleProposals.clear();
  ruleVotes.clear();
  paidRuleRemovals.clear();
  turnRollovers.clear();
  draws.clear();
  elections.clear();
  ruleValidations.clear();
  verificationJobs.clear();
  verificationResults.clear();
  winnerRecords.clear();
  creatorRewardRecords.clear();
  voterRewardRecords.clear();
  claimRecords.clear();
  auditLogs.clear();
  auditLogOrder.length = 0;
  lastAuditLogHash = null;
}

function getRuleTitle(sanitizedText: string) {
  const firstSentence =
    sanitizedText.split(/[.!?]/)[0]?.trim() || sanitizedText;
  return firstSentence.length <= 48
    ? firstSentence
    : `${firstSentence.slice(0, 45).trim()}...`;
}

function hasPreventedRulePattern(value: string) {
  return RULE_PREVENTED_PATTERNS.some((pattern) => pattern.test(value));
}

// High-signal markers (on the English text) for rule shapes the small primary
// model compiles unreliably: negation/inverse and compound conditions. These are
// routed straight to the stronger escalation model.
const COMPLEX_RULE_PATTERNS = [
  /\b(and|or|both|either|neither)\b/i,
  /\b(not|without|except|non)\b/i,
  // Inverse / minimisation. Note "least" is excluded here because "at least N"
  // is a simple threshold, not an inverse — only the superlative "the least" is.
  /\b(miss|misses|missed|missing|fewer|fewest|lowest|smallest|wrong|incorrect)\b/i,
  /\bthe least\b/i,
] as const;

function isComplexRule(englishText: string) {
  return COMPLEX_RULE_PATTERNS.some((pattern) => pattern.test(englishText));
}

function createRuleId() {
  return Date.now() * 1_000 + randomInt(0, 1_000);
}

async function createRulePreflight(text: string): Promise<RulePreflightResult> {
  const sanitizedText = sanitizeRuleText(text);
  const tokenCount = countRuleTokens(sanitizedText);
  const textByteLength = Buffer.byteLength(sanitizedText, "utf8");

  if (!sanitizedText) {
    throw new Error("RULE_EMPTY");
  }

  if (hasPreventedRulePattern(sanitizedText)) {
    throw new Error("RULE_PROMPT_INJECTION");
  }

  if (tokenCount > RULE_MAX_TOKENS) {
    throw new Error("RULE_TOKEN_LIMIT_EXCEEDED");
  }

  if (textByteLength > MAX_RULE_TEXT_BYTES) {
    throw new Error("RULE_TEXT_TOO_LONG");
  }

  const agentConfig = resolveRuleAgentConfig();
  const guardianConfig = resolveGuardianConfig();
  let guardianNote = "";

  // 0. Make sure the models are actually loaded before any time-boxed call. A
  // cold Ollama load otherwise blows past LLM_TIMEOUT_MS on the first request
  // after boot and surfaces as a failure even though the rule is fine. This is
  // a best-effort no-op for non-Ollama endpoints.
  if (guardianConfig.enabled) {
    await ensureModelLoaded(guardianConfig.model, agentConfig);
  }
  await ensureModelLoaded(agentConfig.model, agentConfig);

  // 1. Guardian input gate (Granite Guardian) — an ML jailbreak classifier in
  // addition to the regex guard. If the guardian is down we keep the regex guard
  // and surface the outage rather than silently dropping the check.
  if (guardianConfig.enabled) {
    try {
      if (await detectJailbreak(sanitizedText, guardianConfig)) {
        throw new Error("RULE_PROMPT_INJECTION");
      }
    } catch (error) {
      if (error instanceof Error && error.message === "RULE_PROMPT_INJECTION") {
        throw error;
      }
      guardianNote = `Guardian jailbreak check unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  // 2. Optionally translate to English so the dealer + compiler reason in one
  // language (removes cross-language ambiguity for small models). A capable
  // multilingual model reads the original directly — and the rule-authoring skill
  // carries a Portuguese trigger glossary — so this step can be turned off
  // (LLM_TRANSLATE_TO_ENGLISH=false) to save a call without losing consistency.
  const compileText = resolveTranslateToEnglish()
    ? await translateRuleToEnglish(sanitizedText, agentConfig)
    : sanitizedText;
  const ruleId = createRuleId();

  // A full dealer pass for a given model: interpret (human message), compile the
  // AST from the rule text (skill-guided), and check groundedness.
  const dealerPass = async (model: string) => {
    const passConfig = { ...agentConfig, model };
    const interpretation = await interpretRuleWithAgent(compileText, passConfig);
    const astProvider: RuleAstProvider = async ({ prompt }) =>
      compileRuleToAst(prompt, passConfig);
    const validation = await compileRuleArtifact(
      { model, prompt: compileText, ruleId, tokenCount },
      { astProvider },
    );
    let grounded: boolean | undefined;
    if (guardianConfig.enabled && validation.decision === "VALID") {
      try {
        grounded = await checkGroundedness(
          compileText,
          interpretation.officialInterpretation,
          guardianConfig,
        );
      } catch (error) {
        guardianNote = `Guardian groundedness check unavailable: ${
          error instanceof Error ? error.message : String(error)
        }`;
      }
    }
    return { grounded, interpretation, model, validation };
  };

  // 3-5. Fast pass on the primary model. Escalate to the stronger model only when
  // the fast model produced an invalid AST or the guardian flagged a drifted
  // interpretation — then re-try before blocking the player (PRD §7.3/§7.4).
  // Proactive routing: rules with negation/inverse ("miss/fewer/least") or
  // compound connectors ("and/or") are exactly where the small model produces a
  // wrong-but-plausible AST the guardian can miss. Route those straight to the
  // stronger model instead of relying on a reactive catch.
  const escalationModel = resolveEscalationModel();
  const firstModel =
    escalationModel && isComplexRule(compileText)
      ? escalationModel
      : agentConfig.model;

  if (firstModel !== agentConfig.model) {
    await ensureModelLoaded(firstModel, agentConfig);
  }
  let pass = await dealerPass(firstModel);
  let escalated = firstModel !== agentConfig.model;
  const needsEscalation =
    pass.validation.decision !== "VALID" || pass.grounded === false;
  if (
    needsEscalation &&
    escalationModel &&
    pass.model !== escalationModel
  ) {
    // The escalation attempt must never break the preflight: if the stronger
    // model is unavailable/slow, keep the primary result and surface the note.
    try {
      await ensureModelLoaded(escalationModel, agentConfig);
      const strong = await dealerPass(escalationModel);
      if (strong.validation.decision === "VALID" && strong.grounded !== false) {
        pass = strong;
        escalated = true;
      }
    } catch (error) {
      guardianNote = `Escalation to ${escalationModel} unavailable: ${
        error instanceof Error ? error.message : String(error)
      }`;
    }
  }

  const { interpretation, validation } = pass;
  const normalizedText = interpretation.normalizedText;
  const officialInterpretation = interpretation.officialInterpretation;
  const guardianGrounded = pass.grounded;
  const guardianBlocked = guardianGrounded === false;

  // Re-proposal gate: block a rule whose canonical meaning already held a mandate
  // (was elected active in a past turn). It may only return with an added,
  // differentiating condition (which changes the canonical signature).
  const ruleAst = validation.artifact?.ast ?? null;
  const reproposalBlocked =
    validation.decision === "VALID" &&
    ruleAst !== null &&
    getMandatedRuleSignatures().has(ruleSignature(ruleAst));

  const needsClarification =
    interpretation.needsClarification ||
    validation.decision !== "VALID" ||
    guardianBlocked ||
    reproposalBlocked;
  const reasonSummary = reproposalBlocked
    ? "This rule was already the Rule of the Hour in a previous turn. To reuse it, add a condition that differentiates it (e.g. combine it with another criterion over the numbers)."
    : guardianBlocked
      ? "The dealer's interpretation may not match your rule. Please rephrase it."
      : validation.log.reasonSummary;

  const preflightResult = JSON.stringify({
    compiledArtifactHash: validation.artifactHash,
    decision: validation.decision,
    guardianGrounded: guardianGrounded ?? null,
    maxTokens: RULE_MAX_TOKENS,
    modelUsed: pass.model,
    reproposalBlocked,
    ruleId,
    sanitizedText,
    tokenCount,
    version: 5,
  });

  return {
    addedOperationalClauses: interpretation.addedOperationalClauses,
    clarityNote:
      needsClarification && !interpretation.clarityNote
        ? reasonSummary
        : interpretation.clarityNote,
    compiledArtifactHash: validation.artifactHash,
    decision: validation.decision,
    dealerMessage: interpretation.dealerMessage,
    difficultyClass: validation.log.difficultyClass,
    englishText: compileText,
    escalated,
    finalConfidence: validation.log.confidence.final_confidence,
    guardianChecked: guardianConfig.enabled,
    guardianGrounded,
    guardianNote: guardianNote || undefined,
    maxTokens: RULE_MAX_TOKENS,
    modelUsed: pass.model,
    needsClarification,
    normalizedText,
    normalizedTextHash: hashBytes(normalizedText),
    officialInterpretation,
    officialInterpretationHash: hashBytes(officialInterpretation),
    preflightResultHash: hashBytes(preflightResult),
    reasonSummary,
    reproposalBlocked,
    ruleId,
    ruleMode: validation.artifact?.ruleMode,
    sanitizedText,
    sanitizedTextHash: hashBytes(sanitizedText),
    tokenCount,
  };
}

function isValidGuessReceipt(value: unknown): value is GuessReceiptRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const receipt = value as Partial<GuessReceiptRecord>;
  const numbers = receipt.numbers;

  return (
    Number.isInteger(receipt.turnId) &&
    Number(receipt.turnId) > 0 &&
    Array.isArray(numbers) &&
    numbers.length === 6 &&
    new Set(numbers).size === 6 &&
    numbers.every(
      (number) => Number.isInteger(number) && number >= 1 && number <= 100,
    ) &&
    isBase58Like(receipt.player) &&
    isBase58Like(receipt.playerGuess) &&
    isBase58Like(receipt.gameToken) &&
    isBase58Like(receipt.programId) &&
    isBase58Like(receipt.signature) &&
    typeof receipt.submittedAt === "string" &&
    !Number.isNaN(Date.parse(receipt.submittedAt))
  );
}

function isHashArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length === 32 &&
    value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  );
}

function isHexHash(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{64}$/i.test(value);
}

function isPositiveIntegerArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.every((item) => Number.isInteger(item) && Number(item) > 0)
  );
}

function isValidRuleProposal(value: unknown): value is RuleProposalRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const proposal = value as Partial<RuleProposalRecord>;

  return (
    Number.isInteger(proposal.turnId) &&
    Number(proposal.turnId) > 0 &&
    Number.isInteger(proposal.ruleId) &&
    Number(proposal.ruleId) > 0 &&
    typeof proposal.sanitizedText === "string" &&
    sanitizeRuleText(proposal.sanitizedText) === proposal.sanitizedText &&
    Number.isInteger(proposal.tokenCount) &&
    Number(proposal.tokenCount) > 0 &&
    Number(proposal.tokenCount) <= RULE_MAX_TOKENS &&
    countRuleTokens(proposal.sanitizedText) === proposal.tokenCount &&
    isHashArray(proposal.sanitizedTextHash) &&
    isHashArray(proposal.normalizedTextHash) &&
    isHashArray(proposal.officialInterpretationHash) &&
    isHashArray(proposal.preflightResultHash) &&
    isBase58Like(proposal.proposer) &&
    isBase58Like(proposal.ruleProposal) &&
    isBase58Like(proposal.signature) &&
    typeof proposal.submittedAt === "string" &&
    !Number.isNaN(Date.parse(proposal.submittedAt))
  );
}

function isValidRuleVote(value: unknown): value is RuleVoteRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const vote = value as Partial<RuleVoteRecord>;

  return (
    Number.isInteger(vote.turnId) &&
    Number(vote.turnId) > 0 &&
    Number.isInteger(vote.ruleId) &&
    Number(vote.ruleId) > 0 &&
    isBase58Like(vote.voter) &&
    isBase58Like(vote.ruleProposal) &&
    isBase58Like(vote.ruleVote) &&
    isBase58Like(vote.signature) &&
    typeof vote.submittedAt === "string" &&
    !Number.isNaN(Date.parse(vote.submittedAt))
  );
}

function isValidPaidRuleRemoval(value: unknown): value is PaidRuleRemovalRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const removal = value as Partial<PaidRuleRemovalRecord>;

  return (
    Number.isInteger(removal.turnId) &&
    Number(removal.turnId) > 0 &&
    Number.isInteger(removal.ruleId) &&
    Number(removal.ruleId) > 0 &&
    (removal.removalKind === "creator_self" ||
      removal.removalKind === "third_party") &&
    isBase58Like(removal.remover) &&
    isBase58Like(removal.ruleProposal) &&
    isBase58Like(removal.ruleRemoval) &&
    isBase58Like(removal.signature) &&
    typeof removal.removedAt === "string" &&
    !Number.isNaN(Date.parse(removal.removedAt))
  );
}

function isValidTurnRollover(value: unknown): value is TurnRolloverRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const rollover = value as Partial<TurnRolloverRecord>;

  return (
    Number.isInteger(rollover.turnId) &&
    Number(rollover.turnId) > 0 &&
    Number.isSafeInteger(rollover.originalRolloverLamports) &&
    Number(rollover.originalRolloverLamports) >= 0 &&
    Number.isSafeInteger(rollover.alternativeRolloverLamports) &&
    Number(rollover.alternativeRolloverLamports) >= 0 &&
    (rollover.sourceTurnId === null ||
      (Number.isInteger(rollover.sourceTurnId) &&
        Number(rollover.sourceTurnId) > 0)) &&
    typeof rollover.recordedAt === "string" &&
    !Number.isNaN(Date.parse(rollover.recordedAt))
  );
}

function isValidRulePrecompilation(
  value: unknown,
): value is RulePrecompilationRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<RulePrecompilationRecord>;

  return (
    Number.isInteger(record.turnId) &&
    Number(record.turnId) > 0 &&
    Number.isInteger(record.ruleId) &&
    Number(record.ruleId) > 0 &&
    (record.status === "passed" || record.status === "failed") &&
    (record.status === "passed"
      ? isHexHash(record.compiledArtifactHash)
      : record.compiledArtifactHash == null) &&
    typeof record.updatedAt === "string" &&
    !Number.isNaN(Date.parse(record.updatedAt))
  );
}

function isValidConfidenceBreakdown(value: unknown): value is CompilerConfidenceBreakdown {
  if (!value || typeof value !== "object") {
    return false;
  }

  const confidence = value as Partial<Record<keyof CompilerConfidenceBreakdown, unknown>>;
  return [
    confidence.compiler_confidence,
    confidence.final_confidence,
    confidence.model_confidence,
    confidence.reviewer_agreement_score,
    confidence.rule_clarity_score,
    confidence.runtime_safety_score,
    confidence.schema_score,
    confidence.test_coverage_score,
  ].every((score) => typeof score === "number" && score >= 0 && score <= 1);
}

function isValidConfidenceAction(value: unknown): value is RuleConfidenceAction {
  return value === "ACCEPT" || value === "ESCALATE" || value === "REJECT";
}

function isValidRuleAst(value: unknown) {
  if (!value || typeof value !== "object") {
    return false;
  }

  const ast = value as {
    node?: { kind?: unknown; value?: unknown };
    schemaVersion?: unknown;
  };

  return (
    ast.schemaVersion === 1 &&
    ast.node !== undefined &&
    (ast.node.kind === "ordered_exact" ||
      ast.node.kind === "sum_equals" ||
      (ast.node.kind === "match_count_at_least" &&
        Number.isInteger(ast.node.value) &&
        Number(ast.node.value) >= 1 &&
        Number(ast.node.value) <= 6))
  );
}

function isValidCompiledArtifact(value: unknown): value is RuleCompiledArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const artifact = value as Partial<RuleCompiledArtifact>;

  return (
    artifact.schemaVersion === 1 &&
    isValidRuleAst(artifact.ast) &&
    typeof artifact.normalizedText === "string" &&
    artifact.normalizedText.length > 0 &&
    typeof artifact.promptContractVersion === "string" &&
    artifact.promptContractVersion.length > 0
  );
}

function isValidRuleValidation(value: unknown): value is RuleValidationRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<RuleValidationRecord>;
  const validDecision = record.decision === "VALID" || record.decision === "INVALID";

  return (
    Number.isInteger(record.turnId) &&
    Number(record.turnId) > 0 &&
    Number.isInteger(record.ruleId) &&
    Number(record.ruleId) > 0 &&
    validDecision &&
    isValidConfidenceAction(record.confidenceAction) &&
    typeof record.validationLogId === "string" &&
    isHexHash(record.validationLogId) &&
    typeof record.normalizedText === "string" &&
    typeof record.reasonSummary === "string" &&
    Array.isArray(record.reasonCodes) &&
    record.reasonCodes.every((reason) => typeof reason === "string") &&
    typeof record.provider === "string" &&
    typeof record.model === "string" &&
    typeof record.fallbackTriggered === "boolean" &&
    typeof record.fallbackRateSample === "number" &&
    record.fallbackRateSample >= 0 &&
    record.fallbackRateSample <= 1 &&
    typeof record.providerDisagreementRateSample === "number" &&
    record.providerDisagreementRateSample >= 0 &&
    record.providerDisagreementRateSample <= 1 &&
    isValidModelIdentity(record.modelIdentity) &&
    Array.isArray(record.providerPath) &&
    record.providerPath.every(isValidProviderAttemptLog) &&
    typeof record.validatedAt === "string" &&
    !Number.isNaN(Date.parse(record.validatedAt)) &&
    typeof record.finalConfidence === "number" &&
    record.finalConfidence >= 0 &&
    record.finalConfidence <= 1 &&
    isValidConfidenceBreakdown(record.confidence) &&
    (record.compiledArtifactHash === null || isHexHash(record.compiledArtifactHash)) &&
    (record.compiledArtifact == null || isValidCompiledArtifact(record.compiledArtifact)) &&
    (record.decision === "VALID" ? record.compiledArtifact != null : true) &&
    Array.isArray(record.evaluatedTestCases)
  );
}

function isValidModelIdentity(value: unknown): value is AgentModelIdentity {
  if (!value || typeof value !== "object") {
    return false;
  }

  const identity = value as Partial<AgentModelIdentity>;
  return (
    typeof identity.provider === "string" &&
    identity.provider.length > 0 &&
    typeof identity.model === "string" &&
    identity.model.length > 0 &&
    (identity.digest === null || typeof identity.digest === "string") &&
    (identity.quantization === null || typeof identity.quantization === "string") &&
    typeof identity.serving_engine === "string" &&
    identity.serving_engine.length > 0
  );
}

function isValidProviderAttemptLog(value: unknown): value is AgentProviderAttemptLog {
  if (!value || typeof value !== "object") {
    return false;
  }

  const attempt = value as Partial<AgentProviderAttemptLog>;
  return (
    typeof attempt.provider === "string" &&
    isValidModelIdentity(attempt.model_identity) &&
    typeof attempt.final_confidence === "number" &&
    attempt.final_confidence >= 0 &&
    attempt.final_confidence <= 1 &&
    isValidConfidenceAction(attempt.confidence_action) &&
    (attempt.decision === "VALID" || attempt.decision === "INVALID") &&
    typeof attempt.request_shape === "string" &&
    typeof attempt.status === "string" &&
    typeof attempt.priority === "string" &&
    !!attempt.capability_flags &&
    typeof attempt.capability_flags === "object"
  );
}

function isValidGuessVerificationCreateRequest(
  value: unknown,
): value is { turnId: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as { turnId?: unknown };
  return Number.isInteger(request.turnId) && Number(request.turnId) > 0;
}

function isValidClaimCreateRequest(
  value: unknown,
): value is { availableAt?: string; turnId: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as { availableAt?: unknown; turnId?: unknown };
  return (
    Number.isInteger(request.turnId) &&
    Number(request.turnId) > 0 &&
    (request.availableAt === undefined ||
      (typeof request.availableAt === "string" &&
        !Number.isNaN(Date.parse(request.availableAt))))
  );
}

function isValidClaimRequest(
  value: unknown,
): value is { claimId: string; requestedAt?: string; wallet: string } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as {
    claimId?: unknown;
    requestedAt?: unknown;
    wallet?: unknown;
  };
  return (
    isHexHash(request.claimId) &&
    isBase58Like(request.wallet) &&
    (request.requestedAt === undefined ||
      (typeof request.requestedAt === "string" &&
        !Number.isNaN(Date.parse(request.requestedAt))))
  );
}

function isValidClaimCompleteRequest(
  value: unknown,
): value is {
  claimId: string;
  completedAt?: string;
  failureReason?: string;
  signature?: string;
  status: "claimed" | "failed";
  wallet: string;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as {
    claimId?: unknown;
    completedAt?: unknown;
    failureReason?: unknown;
    signature?: unknown;
    status?: unknown;
    wallet?: unknown;
  };
  return (
    isHexHash(request.claimId) &&
    isBase58Like(request.wallet) &&
    (request.status === "claimed" || request.status === "failed") &&
    (request.signature === undefined || isBase58Like(request.signature)) &&
    (request.failureReason === undefined ||
      typeof request.failureReason === "string") &&
    (request.completedAt === undefined ||
      (typeof request.completedAt === "string" &&
        !Number.isNaN(Date.parse(request.completedAt))))
  );
}

function isValidVerificationOutcome(value: unknown): value is VerificationOutcome {
  return value === "LOSE" || value === "WIN";
}

function isValidRuleVerificationResult(
  value: unknown,
): value is RuleVerificationResultRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as Partial<RuleVerificationResultRecord>;
  return (
    typeof result.inputHash === "string" &&
    isHexHash(result.inputHash) &&
    typeof result.outputHash === "string" &&
    isHexHash(result.outputHash) &&
    typeof result.matchedRuleBranch === "string" &&
    result.matchedRuleBranch.length > 0 &&
    isValidVerificationOutcome(result.result) &&
    Number.isInteger(result.runtimeSteps) &&
    Number(result.runtimeSteps) >= 0 &&
    typeof result.runtimeMs === "number" &&
    result.runtimeMs >= 0
  );
}

function isValidGuessVerificationResult(
  value: unknown,
): value is GuessVerificationResultRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const result = value as Partial<GuessVerificationResultRecord>;
  return (
    result.status === "completed" &&
    Number.isInteger(result.turnId) &&
    Number(result.turnId) > 0 &&
    isBase58Like(result.player) &&
    typeof result.jobId === "string" &&
    result.jobId.length > 0 &&
    typeof result.resultId === "string" &&
    isHexHash(result.resultId) &&
    (result.activeRuleId === null ||
      (Number.isInteger(result.activeRuleId) && Number(result.activeRuleId) > 0)) &&
    isValidRuleVerificationResult(result.original) &&
    (result.alternative === null || isValidRuleVerificationResult(result.alternative)) &&
    typeof result.completedAt === "string" &&
    !Number.isNaN(Date.parse(result.completedAt))
  );
}

function isValidRuleValidationRunRequest(
  value: unknown,
): value is { model?: string; provider?: string; ruleId: number; turnId: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as {
    model?: unknown;
    provider?: unknown;
    ruleId?: unknown;
    turnId?: unknown;
  };

  return (
    Number.isInteger(request.turnId) &&
    Number(request.turnId) > 0 &&
    Number.isInteger(request.ruleId) &&
    Number(request.ruleId) > 0 &&
    (request.provider === undefined || typeof request.provider === "string") &&
    (request.model === undefined || typeof request.model === "string")
  );
}

function isValidRuleElection(value: unknown): value is RuleElectionRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<RuleElectionRecord>;
  const statusIsValid =
    record.status === "locked" ||
    record.status === "original_only" ||
    record.status === "requested" ||
    record.status === "settled";

  return (
    Number.isInteger(record.turnId) &&
    Number(record.turnId) > 0 &&
    statusIsValid &&
    (record.activeRuleId === null ||
      (Number.isInteger(record.activeRuleId) && Number(record.activeRuleId) > 0)) &&
    Number.isInteger(record.electedFinalistIndex) &&
    Number(record.electedFinalistIndex) >= 0 &&
    isPositiveIntegerArray(record.eligibleRuleIds) &&
    isPositiveIntegerArray(record.topVotedRuleIds) &&
    isPositiveIntegerArray(record.randomRuleIds) &&
    isPositiveIntegerArray(record.finalistRuleIds) &&
    isHexHash(record.eligibleRulePoolHash) &&
    isHexHash(record.topVotedFinalistHash) &&
    isHexHash(record.randomFinalistHash) &&
    isHexHash(record.finalistSetHash) &&
    (record.activeRuleHash === null || isHexHash(record.activeRuleHash)) &&
    (record.activeRuleArtifactHash === null ||
      isHexHash(record.activeRuleArtifactHash)) &&
    (record.randomnessAccount === null || isBase58Like(record.randomnessAccount)) &&
    (record.randomnessSource === null || isBase58Like(record.randomnessSource)) &&
    (record.randomnessValue === null || isHexHash(record.randomnessValue)) &&
    (record.requestedAt === null ||
      (typeof record.requestedAt === "string" &&
        !Number.isNaN(Date.parse(record.requestedAt)))) &&
    (record.settledAt === null ||
      (typeof record.settledAt === "string" &&
        !Number.isNaN(Date.parse(record.settledAt))))
  );
}

async function readJsonBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function getAllowedCorsOrigin(origin: string | undefined) {
  if (!origin) {
    return null;
  }

  const configuredOrigins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((configuredOrigin) => configuredOrigin.trim())
    .filter(Boolean);

  if (
    configuredOrigins.includes(origin) ||
    LOCAL_WEB_ORIGIN_PATTERN.test(origin)
  ) {
    return origin;
  }

  return null;
}

function getCorsHeaders(request: import("node:http").IncomingMessage) {
  const allowedOrigin = getAllowedCorsOrigin(request.headers.origin);
  if (!allowedOrigin) {
    return {};
  }

  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": allowedOrigin,
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function sendJson(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    ...getCorsHeaders(request),
  });
  response.end(JSON.stringify(body));
}

function sendNoContent(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
) {
  response.writeHead(204, getCorsHeaders(request));
  response.end();
}

export function saveGuessReceipt(receipt: GuessReceiptRecord) {
  const key = getGuessReceiptKey(receipt.turnId, receipt.player);
  guessReceipts.set(key, receipt);
  return receipt;
}

export function getGuessReceipt(turnId: number, player: string) {
  return guessReceipts.get(getGuessReceiptKey(turnId, player)) ?? null;
}

export function saveRuleProposal(proposal: RuleProposalRecord) {
  const normalizedProposal = {
    ...proposal,
    compiledArtifactHash: proposal.compiledArtifactHash ?? null,
    precompilationStatus: proposal.precompilationStatus ?? "pending",
    state: proposal.state ?? "proposed",
    title: getRuleTitle(proposal.sanitizedText),
  };
  ruleProposals.set(
    getRuleProposalKey(proposal.turnId, proposal.ruleId),
    normalizedProposal,
  );
  return normalizedProposal;
}

export function listRuleProposals(turnId: number) {
  return [...ruleProposals.values()]
    .filter((proposal) => proposal.turnId === turnId)
    .sort((left, right) => right.ruleId - left.ruleId);
}

export function saveRuleVote(vote: RuleVoteRecord) {
  ruleVotes.set(getRuleVoteKey(vote.turnId, vote.ruleId, vote.voter), vote);
  return vote;
}

export function savePaidRuleRemoval(removal: PaidRuleRemovalRecord) {
  paidRuleRemovals.set(
    getPaidRuleRemovalKey(removal.turnId, removal.ruleId, removal.remover),
    removal,
  );
  return removal;
}

export function saveTurnRollover(record: TurnRolloverRecord) {
  turnRollovers.set(record.turnId, record);
  return record;
}

export function listRuleVotes(turnId: number) {
  const votes = [...ruleVotes.values()].filter(
    (vote) => vote.turnId === turnId,
  );
  const counts = votes.reduce<Record<string, number>>((current, vote) => {
    current[String(vote.ruleId)] = (current[String(vote.ruleId)] ?? 0) + 1;
    return current;
  }, {});

  return { counts, votes };
}

export function saveRulePrecompilation(record: RulePrecompilationRecord) {
  const proposal = ruleProposals.get(
    getRuleProposalKey(record.turnId, record.ruleId),
  );
  if (!proposal) {
    throw new Error("RULE_PROPOSAL_NOT_FOUND");
  }

  const updated: RuleProposalRecord = {
    ...proposal,
    compiledArtifactHash: record.compiledArtifactHash,
    precompilationStatus: record.status,
    state: record.status === "passed" ? "eligible" : "invalidated",
  };
  ruleProposals.set(getRuleProposalKey(record.turnId, record.ruleId), updated);
  return updated;
}

function getRuleValidationKey(turnId: number, ruleId: number) {
  return `${turnId}:${ruleId}`;
}

export function saveRuleValidation(record: RuleValidationRecord) {
  const proposal = ruleProposals.get(
    getRuleProposalKey(record.turnId, record.ruleId),
  );
  if (!proposal) {
    throw new Error("RULE_PROPOSAL_NOT_FOUND");
  }

  const normalizedRecord: RuleValidationRecord = {
    ...record,
    compiledArtifact: record.compiledArtifact ?? null,
  };
  const auditLog = appendCompilerValidationAuditLog(proposal, normalizedRecord);
  normalizedRecord.auditLogHash = auditLog.logHash;
  const validationSummary: RuleValidationSummary = {
    auditLogHash: normalizedRecord.auditLogHash,
    confidenceAction: record.confidenceAction,
    decision: record.decision,
    fallbackTriggered: record.fallbackTriggered,
    finalConfidence: record.finalConfidence,
    model: record.model,
    provider: record.provider,
    providerDisagreementRateSample: record.providerDisagreementRateSample,
    reasonCodes: record.reasonCodes,
    reasonSummary: record.reasonSummary,
    validatedAt: record.validatedAt,
    validationLogId: record.validationLogId,
  };
  const updated: RuleProposalRecord = {
    ...proposal,
    compiledArtifactHash: record.compiledArtifactHash,
    precompilationStatus: record.decision === "VALID" ? "passed" : "failed",
    state: record.decision === "VALID" ? "eligible" : "invalidated",
    validation: validationSummary,
  };

  ruleValidations.set(
    getRuleValidationKey(record.turnId, record.ruleId),
    normalizedRecord,
  );
  ruleProposals.set(getRuleProposalKey(record.turnId, record.ruleId), updated);
  return normalizedRecord;
}

function appendCompilerValidationAuditLog(
  proposal: RuleProposalRecord,
  record: RuleValidationRecord,
) {
  return appendAuditLog({
    createdAt: record.validatedAt,
    input: {
      maxTokens: RULE_MAX_TOKENS,
      ruleId: record.ruleId,
      ruleText: proposal.sanitizedText,
      tokenCount: proposal.tokenCount,
      turnId: record.turnId,
    },
    kind: "compiler.validation",
    output: {
      compiledArtifactHash: record.compiledArtifactHash,
      confidenceBreakdown: record.confidence,
      confidenceAction: record.confidenceAction,
      finalConfidence: record.finalConfidence,
      model: record.model,
      modelConfidence: record.confidence.model_confidence,
      modelIdentity: record.modelIdentity,
      provider: record.provider,
      providerPath: record.providerPath,
      reasonCodes: record.reasonCodes,
      result: record.decision,
      validationLogId: record.validationLogId,
    },
    publicStateRef: {
      key: getRuleValidationKey(record.turnId, record.ruleId),
      type: "rule_validation",
    },
    reason: record.reasonSummary,
    result: record.decision,
    ruleId: record.ruleId,
    turnId: record.turnId,
    validationLogId: record.validationLogId,
  });
}

export function getRuleValidation(turnId: number, ruleId: number) {
  return ruleValidations.get(getRuleValidationKey(turnId, ruleId)) ?? null;
}

// --- Re-proposal gate: a rule that already held a mandate (was elected as the
// active Rule of the Hour) cannot be proposed again verbatim. It may only return
// if the new proposal adds a differentiating condition. Identity is the rule's
// MEANING, so we compare a CANONICAL signature of the compiled AST: trivial
// wrappers (and[X] == X, double negation) and reordered commutative operands
// (and/or clauses, intersection, add/mul) collapse to the same signature, so the
// gate cannot be bypassed cosmetically — only a substantive added clause changes it.

type AstRecord = Record<string, unknown>;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value as AstRecord)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as AstRecord)[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function canonicalizeNode(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return value;
  }
  const node = value as AstRecord;
  const kind = node.kind;

  if (kind === "and" || kind === "or") {
    const raw = Array.isArray(node.clauses) ? node.clauses : [];
    const flattened = raw
      .map(canonicalizeNode)
      .flatMap((clause) => {
        const c = clause as AstRecord;
        return c && c.kind === kind && Array.isArray(c.clauses) ? c.clauses : [clause];
      });
    const seen = new Set<string>();
    const unique: unknown[] = [];
    for (const clause of flattened) {
      const sig = stableStringify(clause);
      if (!seen.has(sig)) {
        seen.add(sig);
        unique.push(clause);
      }
    }
    unique.sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    return unique.length === 1 ? unique[0] : { kind, clauses: unique };
  }

  if (kind === "not") {
    const inner = canonicalizeNode(node.clause) as AstRecord;
    if (inner && inner.kind === "not") {
      return inner.clause; // collapse double negation
    }
    return { kind, clause: inner };
  }

  // Commutative binary operands: order them deterministically.
  if (
    kind === "intersection" ||
    (kind === "arith" && (node.op === "add" || node.op === "mul"))
  ) {
    const operands = [canonicalizeNode(node.left), canonicalizeNode(node.right)].sort(
      (a, b) => stableStringify(a).localeCompare(stableStringify(b)),
    );
    return { ...node, left: operands[0], right: operands[1] };
  }

  const out: AstRecord = { ...node };
  for (const field of ["of", "left", "right", "clause", "predicate", "score", "guard"]) {
    if (out[field] !== undefined) {
      out[field] = canonicalizeNode(out[field]);
    }
  }
  if (Array.isArray(out.clauses)) {
    out.clauses = out.clauses.map(canonicalizeNode);
  }
  return out;
}

export function ruleSignature(ast: RuleAst): string {
  const canonical =
    ast.schemaVersion === 2
      ? { result: canonicalizeNode(ast.result), v: 2 }
      : { node: ast.node, v: 1 };
  return createHash("sha256").update(stableStringify(canonical), "utf8").digest("hex");
}

// Signatures of every rule that has held a mandate (was the elected active rule
// in a settled election). Computed from stored elections + their compiled ASTs.
export function getMandatedRuleSignatures(): Set<string> {
  const signatures = new Set<string>();
  for (const election of elections.values()) {
    if (election.status !== "settled" || election.activeRuleId === null) {
      continue;
    }
    const validation = getRuleValidation(election.turnId, election.activeRuleId);
    const ast = validation?.compiledArtifact?.ast;
    if (ast) {
      signatures.add(ruleSignature(ast));
    }
  }
  return signatures;
}

function getVerificationResultKey(turnId: number, player: string) {
  return `${turnId}:${player}`;
}

function listGuessReceipts(turnId: number) {
  return [...guessReceipts.values()].filter((receipt) => receipt.turnId === turnId);
}

function listVerificationJobs(turnId: number) {
  return [...verificationJobs.values()].filter((job) => job.turnId === turnId);
}

function listVerificationResults(turnId: number) {
  return [...verificationResults.values()].filter((result) => result.turnId === turnId);
}

function getWinnerRecordKey(
  turnId: number,
  category: WinnerCategory,
  player: string,
) {
  return `${turnId}:${category}:${player}`;
}

function isWinnerForCategory(
  result: GuessVerificationResultRecord,
  category: WinnerCategory,
) {
  return category === "original"
    ? result.original.result === "WIN"
    : result.alternative?.result === "WIN";
}

// Comparative ("ranking") alternative rules pick winners by best score across
// all guesses (ties share the pool), instead of an absolute per-guess WIN/LOSE.
function selectRankingWinners(
  results: GuessVerificationResultRecord[],
): GuessVerificationResultRecord[] | null {
  const ranking = results.filter(
    (result) =>
      result.alternativeMode === "ranking" &&
      typeof result.alternative?.score === "number",
  );
  if (ranking.length === 0) {
    return null;
  }
  const direction = ranking[0]?.alternativeDirection === "min" ? "min" : "max";
  const winners = resolveRankingWinners(
    ranking.map((result) => ({
      player: result.resultId,
      score: result.alternative?.score ?? 0,
    })),
    direction,
  );
  return ranking.filter((result) => winners.has(result.resultId));
}

function calculateCategoryWinnerRecords(args: {
  bucketLamports: number;
  calculatedAt: string;
  category: WinnerCategory;
  results: GuessVerificationResultRecord[];
  turnId: number;
}) {
  // Ranking rules only apply to the alternative (community) category; the
  // original rule is always an absolute predicate.
  const rankingWinners =
    args.category === "alternative" ? selectRankingWinners(args.results) : null;
  const winningResults = (
    rankingWinners ??
    args.results.filter((result) => isWinnerForCategory(result, args.category))
  )
    .slice()
    .sort((left, right) => left.player.localeCompare(right.player));
  const winnerCount = winningResults.length;
  const payoutLamports =
    winnerCount === 0 ? 0 : Math.floor(args.bucketLamports / winnerCount);
  const records = winningResults.map(
    (result): WinnerRecord => ({
      activeRuleId: args.category === "alternative" ? result.activeRuleId : null,
      bucketLamports: args.bucketLamports,
      calculatedAt: args.calculatedAt,
      category: args.category,
      payoutLamports,
      player: result.player,
      resultId: result.resultId,
      status: "calculated",
      turnId: args.turnId,
      winnerCount,
    }),
  );

  return {
    individualPayoutLamports: payoutLamports,
    records,
    remainderLamports:
      args.bucketLamports - payoutLamports * Math.max(winnerCount, 0),
    winnerCount,
  };
}

export function calculateAndStoreWinnerRecords(
  turnId: number,
  calculatedAt: string = new Date().toISOString(),
): WinnerCalculationSummary {
  const accounting = getPrizePoolAccounting(turnId);
  const results = listVerificationResults(turnId).filter(
    (result) => result.status === "completed",
  );
  const original = calculateCategoryWinnerRecords({
    bucketLamports: accounting.buckets.original.totalLamports,
    calculatedAt,
    category: "original",
    results,
    turnId,
  });
  const alternative = calculateCategoryWinnerRecords({
    bucketLamports: accounting.buckets.alternative.totalLamports,
    calculatedAt,
    category: "alternative",
    results,
    turnId,
  });

  for (const key of [...winnerRecords.keys()]) {
    if (key.startsWith(`${turnId}:`)) {
      winnerRecords.delete(key);
    }
  }

  const records = [...original.records, ...alternative.records];
  for (const record of records) {
    winnerRecords.set(
      getWinnerRecordKey(record.turnId, record.category, record.player),
      record,
    );
  }

  return {
    alternative: {
      bucketLamports: accounting.buckets.alternative.totalLamports,
      individualPayoutLamports: alternative.individualPayoutLamports,
      remainderLamports: alternative.remainderLamports,
      winnerCount: alternative.winnerCount,
    },
    original: {
      bucketLamports: accounting.buckets.original.totalLamports,
      individualPayoutLamports: original.individualPayoutLamports,
      remainderLamports: original.remainderLamports,
      winnerCount: original.winnerCount,
    },
    records,
    turnId,
  };
}

export function listWinnerRecords(turnId: number) {
  return [...winnerRecords.values()]
    .filter((record) => record.turnId === turnId)
    .sort((left, right) =>
      left.category === right.category
        ? left.player.localeCompare(right.player)
        : left.category.localeCompare(right.category),
    );
}

export function getWinnerSummary(turnId: number): WinnerCalculationSummary {
  const records = listWinnerRecords(turnId);
  if (records.length > 0) {
    const accounting = getPrizePoolAccounting(turnId);
    const originalRecords = records.filter(
      (record) => record.category === "original",
    );
    const alternativeRecords = records.filter(
      (record) => record.category === "alternative",
    );
    const originalPayout = originalRecords[0]?.payoutLamports ?? 0;
    const alternativePayout = alternativeRecords[0]?.payoutLamports ?? 0;

    return {
      alternative: {
        bucketLamports: accounting.buckets.alternative.totalLamports,
        individualPayoutLamports: alternativePayout,
        remainderLamports:
          accounting.buckets.alternative.totalLamports -
          alternativePayout * alternativeRecords.length,
        winnerCount: alternativeRecords.length,
      },
      original: {
        bucketLamports: accounting.buckets.original.totalLamports,
        individualPayoutLamports: originalPayout,
        remainderLamports:
          accounting.buckets.original.totalLamports -
          originalPayout * originalRecords.length,
        winnerCount: originalRecords.length,
      },
      records,
      turnId,
    };
  }

  return calculateAndStoreWinnerRecords(turnId);
}

function getCreatorRewardRecordKey(turnId: number, activeRuleId: number) {
  return `${turnId}:${activeRuleId}`;
}

function getVoterRewardRecordKey(
  turnId: number,
  activeRuleId: number,
  voter: string,
) {
  return `${turnId}:${activeRuleId}:${voter}`;
}

function getRewardReserveLamports(turnId: number) {
  const accounting = getPrizePoolAccounting(turnId);
  return Math.floor(
    (accounting.platformMonetizationLamports *
      CREATOR_REWARD_RESERVE_SHARE_BPS) /
      10_000,
  );
}

function listElectedRuleVoters(turnId: number, activeRuleId: number) {
  const voters = [...ruleVotes.values()]
    .filter((vote) => vote.turnId === turnId && vote.ruleId === activeRuleId)
    .map((vote) => vote.voter);

  return [...new Set(voters)].sort((left, right) => left.localeCompare(right));
}

function clearRewardRecordsForTurn(turnId: number) {
  for (const key of [...creatorRewardRecords.keys()]) {
    if (key.startsWith(`${turnId}:`)) {
      creatorRewardRecords.delete(key);
    }
  }
  for (const key of [...voterRewardRecords.keys()]) {
    if (key.startsWith(`${turnId}:`)) {
      voterRewardRecords.delete(key);
    }
  }
}

export function calculateRewardDistribution(args: {
  activeRuleId: number;
  calculatedAt: string;
  creatorRewardReserveLamports: number;
  creatorWallet: string;
  individualAltPayoutLamports: number;
  turnId: number;
  voters: string[];
  winnerCount: number;
}): RewardCalculationSummary {
  assertNonNegativeSafeInteger(
    args.creatorRewardReserveLamports,
    "creator_reward_reserve_lamports",
  );
  assertNonNegativeSafeInteger(
    args.individualAltPayoutLamports,
    "individual_alt_payout_lamports",
  );
  assertNonNegativeSafeInteger(args.winnerCount, "winner_count");

  const voters = [...new Set(args.voters)].sort((left, right) =>
    left.localeCompare(right),
  );
  const creatorRewardCapLamports = solToLamports(CREATOR_REWARD_CAP_SOL);
  const perWinnerCreatorRewardLamports = Math.floor(
    (args.individualAltPayoutLamports * CREATOR_REWARD_RATE_BPS) / 10_000,
  );
  const calculatedCreatorRewardLamports =
    perWinnerCreatorRewardLamports * args.winnerCount;
  const creatorRewardBeforeReserve = Math.min(
    calculatedCreatorRewardLamports,
    creatorRewardCapLamports,
  );
  const finalCreatorRewardLamports = Math.min(
    creatorRewardBeforeReserve,
    args.creatorRewardReserveLamports,
  );
  const remainingAfterCreatorLamports =
    args.creatorRewardReserveLamports - finalCreatorRewardLamports;
  const calculatedVoterPoolLamports = Math.floor(
    (args.individualAltPayoutLamports * VOTER_REWARD_RATE_BPS) / 10_000,
  );
  const cappedVoterPoolLamports = Math.min(
    calculatedVoterPoolLamports,
    VOTER_REWARD_CONFIG.capPerTurnLamports,
  );
  const finalVoterPoolLamports =
    voters.length === 0
      ? 0
      : Math.min(cappedVoterPoolLamports, remainingAfterCreatorLamports);
  const individualVoterRewardLamports =
    voters.length === 0 ? 0 : Math.floor(finalVoterPoolLamports / voters.length);
  const voterRemainderLamports =
    finalVoterPoolLamports - individualVoterRewardLamports * voters.length;
  const creatorRecord: CreatorRewardRecord = {
    activeRuleId: args.activeRuleId,
    availableReserveLamports: args.creatorRewardReserveLamports,
    calculatedAt: args.calculatedAt,
    calculatedRewardLamports: calculatedCreatorRewardLamports,
    capPerTurnLamports: creatorRewardCapLamports,
    creatorWallet: args.creatorWallet,
    finalRewardLamports: finalCreatorRewardLamports,
    individualAltPayoutLamports: args.individualAltPayoutLamports,
    rewardRateBps: CREATOR_REWARD_RATE_BPS,
    status: "calculated",
    turnId: args.turnId,
    wasCapped:
      finalCreatorRewardLamports < calculatedCreatorRewardLamports ||
      calculatedCreatorRewardLamports > creatorRewardCapLamports,
    winnerCount: args.winnerCount,
  };
  const voterRecords = voters.map(
    (voter): VoterRewardRecord => ({
      activeRuleId: args.activeRuleId,
      calculatedAt: args.calculatedAt,
      finalRewardLamports: individualVoterRewardLamports,
      individualAltPayoutLamports: args.individualAltPayoutLamports,
      rewardPoolLamports: finalVoterPoolLamports,
      rewardRateBps: VOTER_REWARD_RATE_BPS,
      status: individualVoterRewardLamports > 0 ? "calculated" : "not_available",
      turnId: args.turnId,
      voter,
      voterCount: voters.length,
    }),
  );

  return {
    activeRuleId: args.activeRuleId,
    creator: creatorRecord,
    creatorRewardReserveLamports: args.creatorRewardReserveLamports,
    remainingReserveLamports:
      remainingAfterCreatorLamports - finalVoterPoolLamports,
    turnId: args.turnId,
    voterRewardPool: {
      capPerTurnLamports: VOTER_REWARD_CONFIG.capPerTurnLamports,
      calculatedPoolLamports: calculatedVoterPoolLamports,
      finalPoolLamports: finalVoterPoolLamports,
      individualRewardLamports: individualVoterRewardLamports,
      remainderLamports: voterRemainderLamports,
      rewardRateBps: VOTER_REWARD_RATE_BPS,
      voterCount: voters.length,
      wasCapped: finalVoterPoolLamports < calculatedVoterPoolLamports,
    },
    voters: voterRecords,
  };
}

export function calculateAndStoreRewardRecords(
  turnId: number,
  calculatedAt: string = new Date().toISOString(),
): RewardCalculationSummary {
  const election = getRuleElection(turnId);
  const activeRuleId = election?.activeRuleId ?? null;
  const reserveLamports = getRewardReserveLamports(turnId);
  const emptyVoterRewardPool = {
    capPerTurnLamports: VOTER_REWARD_CONFIG.capPerTurnLamports,
    calculatedPoolLamports: 0,
    finalPoolLamports: 0,
    individualRewardLamports: 0,
    remainderLamports: 0,
    rewardRateBps: VOTER_REWARD_RATE_BPS,
    voterCount: 0,
    wasCapped: false,
  };

  clearRewardRecordsForTurn(turnId);

  if (activeRuleId === null) {
    return {
      activeRuleId,
      creator: null,
      creatorRewardReserveLamports: reserveLamports,
      remainingReserveLamports: reserveLamports,
      turnId,
      voterRewardPool: emptyVoterRewardPool,
      voters: [],
    };
  }

  const proposal = ruleProposals.get(getRuleProposalKey(turnId, activeRuleId));
  if (!proposal) {
    throw new Error("ACTIVE_RULE_PROPOSAL_NOT_FOUND");
  }

  const winners = getWinnerSummary(turnId);
  const winnerCount = winners.alternative.winnerCount;
  const individualAltPayoutLamports =
    winners.alternative.individualPayoutLamports;

  if (winnerCount === 0 || individualAltPayoutLamports === 0) {
    return {
      activeRuleId,
      creator: null,
      creatorRewardReserveLamports: reserveLamports,
      remainingReserveLamports: reserveLamports,
      turnId,
      voterRewardPool: emptyVoterRewardPool,
      voters: [],
    };
  }

  const distribution = calculateRewardDistribution({
    activeRuleId,
    calculatedAt,
    creatorRewardReserveLamports: reserveLamports,
    creatorWallet: proposal.proposer,
    individualAltPayoutLamports,
    turnId,
    voters: listElectedRuleVoters(turnId, activeRuleId),
    winnerCount,
  });

  creatorRewardRecords.set(
    getCreatorRewardRecordKey(turnId, activeRuleId),
    distribution.creator as CreatorRewardRecord,
  );

  for (const record of distribution.voters) {
    voterRewardRecords.set(
      getVoterRewardRecordKey(record.turnId, record.activeRuleId, record.voter),
      record,
    );
  }

  return distribution;
}

export function listCreatorRewardRecords(turnId: number) {
  return [...creatorRewardRecords.values()]
    .filter((record) => record.turnId === turnId)
    .sort((left, right) => left.activeRuleId - right.activeRuleId);
}

export function listVoterRewardRecords(turnId: number) {
  return [...voterRewardRecords.values()]
    .filter((record) => record.turnId === turnId)
    .sort((left, right) => left.voter.localeCompare(right.voter));
}

export function getRewardSummary(turnId: number): RewardCalculationSummary {
  const creator = listCreatorRewardRecords(turnId)[0] ?? null;
  const voters = listVoterRewardRecords(turnId);
  if (creator || voters.length > 0) {
    const activeRuleId = creator?.activeRuleId ?? voters[0]?.activeRuleId ?? null;
    const reserveLamports = getRewardReserveLamports(turnId);
    const finalVoterPoolLamports = voters[0]?.rewardPoolLamports ?? 0;
    const calculatedVoterPoolLamports =
      voters[0] === undefined
        ? 0
        : Math.floor(
            (voters[0].individualAltPayoutLamports * VOTER_REWARD_RATE_BPS) /
              10_000,
          );

    return {
      activeRuleId,
      creator,
      creatorRewardReserveLamports: reserveLamports,
      remainingReserveLamports:
        reserveLamports -
        (creator?.finalRewardLamports ?? 0) -
        finalVoterPoolLamports,
      turnId,
      voterRewardPool: {
        capPerTurnLamports: VOTER_REWARD_CONFIG.capPerTurnLamports,
        calculatedPoolLamports: calculatedVoterPoolLamports,
        finalPoolLamports: finalVoterPoolLamports,
        individualRewardLamports: voters[0]?.finalRewardLamports ?? 0,
        remainderLamports:
          finalVoterPoolLamports -
          (voters[0]?.finalRewardLamports ?? 0) * voters.length,
        rewardRateBps: VOTER_REWARD_RATE_BPS,
        voterCount: voters.length,
        wasCapped: finalVoterPoolLamports < calculatedVoterPoolLamports,
      },
      voters,
    };
  }

  return calculateAndStoreRewardRecords(turnId);
}

function getMinimumClaimThresholdLamports() {
  return solToLamports(MINIMUM_CLAIM_THRESHOLD_SOL);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(isoDate);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString();
}

function getClaimSourceKey(args: {
  activeRuleId: number | null;
  category: WinnerCategory | null;
  kind: ClaimKind;
  turnId: number;
  wallet: string;
}) {
  return [
    args.turnId,
    args.kind,
    args.category ?? "none",
    args.activeRuleId ?? "none",
    args.wallet,
  ].join(":");
}

function getClaimId(args: {
  activeRuleId: number | null;
  category: WinnerCategory | null;
  kind: ClaimKind;
  turnId: number;
  wallet: string;
}) {
  return hashJson({
    activeRuleId: args.activeRuleId,
    category: args.category,
    kind: args.kind,
    turnId: args.turnId,
    wallet: args.wallet,
  });
}

function getClaimTransactionLabel(kind: ClaimKind) {
  if (kind === "winner_payout") {
    return "Claim winner payout";
  }
  if (kind === "creator_reward") {
    return "Claim creator reward";
  }
  return "Claim voter reward";
}

function createClaimRecord(args: {
  activeRuleId: number | null;
  amountLamports: number;
  availableAt: string;
  category: WinnerCategory | null;
  kind: ClaimKind;
  turnId: number;
  wallet: string;
}): ClaimRecord {
  assertNonNegativeSafeInteger(args.amountLamports, "claim_amount_lamports");
  const sourceRecordKey = getClaimSourceKey(args);
  const claimId = getClaimId(args);
  const existing = claimRecords.get(claimId);
  if (existing) {
    return existing;
  }

  const minimumClaimThresholdLamports = getMinimumClaimThresholdLamports();
  const isClaimable = args.amountLamports >= minimumClaimThresholdLamports;
  const status: ClaimRecordStatus = isClaimable ? "available" : "unavailable";
  const statusReason = isClaimable
    ? "CLAIM_AVAILABLE"
    : "PAYOUT_BELOW_MINIMUM";

  return {
    activeRuleId: args.activeRuleId,
    amountLamports: args.amountLamports,
    availableAt: args.availableAt,
    category: args.category,
    claimId,
    claimWindowExpiresAt: addDays(args.availableAt, CLAIM_WINDOW_DAYS),
    claimWindowTurns: CLAIM_WINDOW_TURNS,
    claimedAt: null,
    createdAt: args.availableAt,
    failedAt: null,
    kind: args.kind,
    sourceRecordKey,
    status,
    statusReason,
    turnId: args.turnId,
    updatedAt: args.availableAt,
    wallet: args.wallet,
    walletApproval: {
      approvalStartedAt: null,
      completedAt: null,
      failureReason: null,
      required: true,
      signature: null,
      state: "not_requested",
      transactionLabel: getClaimTransactionLabel(args.kind),
    },
  };
}

function saveClaimRecord(record: ClaimRecord) {
  claimRecords.set(record.claimId, record);
  return record;
}

export function createClaimRecordsForTurn(
  turnId: number,
  availableAt: string = new Date().toISOString(),
) {
  const winners = getWinnerSummary(turnId);
  const rewards = getRewardSummary(turnId);
  const claimableRecords = [
    ...winners.records.map((winner) =>
      createClaimRecord({
        activeRuleId: winner.activeRuleId,
        amountLamports: winner.payoutLamports,
        availableAt,
        category: winner.category,
        kind: "winner_payout" as const,
        turnId,
        wallet: winner.player,
      }),
    ),
    ...(rewards.creator && rewards.creator.finalRewardLamports > 0
      ? [
          createClaimRecord({
            activeRuleId: rewards.creator.activeRuleId,
            amountLamports: rewards.creator.finalRewardLamports,
            availableAt,
            category: null,
            kind: "creator_reward",
            turnId,
            wallet: rewards.creator.creatorWallet,
          }),
        ]
      : []),
    ...rewards.voters
      .filter((voter) => voter.finalRewardLamports > 0)
      .map((voter) =>
        createClaimRecord({
          activeRuleId: voter.activeRuleId,
          amountLamports: voter.finalRewardLamports,
          availableAt,
          category: null,
          kind: "voter_reward" as const,
          turnId,
          wallet: voter.voter,
        }),
      ),
  ];

  for (const record of claimableRecords) {
    saveClaimRecord(record);
  }

  return {
    claims: listClaimRecords({ turnId }),
    summary: getClaimSummary({ turnId }),
  };
}

export function listClaimRecords(args: {
  turnId?: number;
  wallet?: string;
} = {}) {
  return [...claimRecords.values()]
    .filter((record) => {
      if (args.turnId !== undefined && record.turnId !== args.turnId) {
        return false;
      }
      return args.wallet === undefined || record.wallet === args.wallet;
    })
    .sort((left, right) =>
      left.turnId === right.turnId
        ? left.claimId.localeCompare(right.claimId)
        : left.turnId - right.turnId,
    );
}

export function getClaimSummary(args: {
  turnId: number;
  wallet?: string;
}): ClaimSummary {
  const records = listClaimRecords(args);
  return {
    availableLamports: records
      .filter((record) => record.status === "available")
      .reduce((total, record) => total + record.amountLamports, 0),
    claimedLamports: records
      .filter((record) => record.status === "claimed")
      .reduce((total, record) => total + record.amountLamports, 0),
    failedLamports: records
      .filter((record) => record.status === "failed")
      .reduce((total, record) => total + record.amountLamports, 0),
    pendingLamports: records
      .filter((record) => record.status === "pending_wallet_approval")
      .reduce((total, record) => total + record.amountLamports, 0),
    records,
    turnId: args.turnId,
    wallet: args.wallet ?? null,
  };
}

export function requestClaimApproval(args: {
  claimId: string;
  requestedAt?: string;
  wallet: string;
}) {
  const record = claimRecords.get(args.claimId);
  if (!record || record.wallet !== args.wallet) {
    throw new Error("PAYOUT_NOT_AVAILABLE");
  }
  if (record.status === "claimed") {
    throw new Error("PAYOUT_ALREADY_CLAIMED");
  }
  if (record.status === "pending_wallet_approval") {
    return record;
  }
  if (record.status !== "available" && record.status !== "failed") {
    throw new Error(record.statusReason);
  }

  const requestedAt = args.requestedAt ?? new Date().toISOString();
  const updated: ClaimRecord = {
    ...record,
    status: "pending_wallet_approval",
    statusReason: "WALLET_APPROVAL_PENDING",
    updatedAt: requestedAt,
    walletApproval: {
      ...record.walletApproval,
      approvalStartedAt: requestedAt,
      state: "pending",
    },
  };
  return saveClaimRecord(updated);
}

export function completeClaimApproval(args: {
  claimId: string;
  completedAt?: string;
  failureReason?: string;
  signature?: string;
  status: "claimed" | "failed";
  wallet: string;
}) {
  const record = claimRecords.get(args.claimId);
  if (!record || record.wallet !== args.wallet) {
    throw new Error("PAYOUT_NOT_AVAILABLE");
  }
  if (record.status === "claimed") {
    throw new Error("PAYOUT_ALREADY_CLAIMED");
  }
  if (record.status !== "pending_wallet_approval") {
    throw new Error("PAYOUT_NOT_PENDING");
  }
  if (args.status === "claimed" && !isBase58Like(args.signature)) {
    throw new Error("INVALID_CLAIM_SIGNATURE");
  }

  const completedAt = args.completedAt ?? new Date().toISOString();
  const failed = args.status === "failed";
  const updated: ClaimRecord = {
    ...record,
    claimedAt: failed ? null : completedAt,
    failedAt: failed ? completedAt : null,
    status: args.status,
    statusReason: failed ? (args.failureReason ?? "CLAIM_FAILED") : "CLAIMED",
    updatedAt: completedAt,
    walletApproval: {
      ...record.walletApproval,
      completedAt,
      failureReason: failed ? (args.failureReason ?? "CLAIM_FAILED") : null,
      signature: failed ? null : args.signature ?? null,
      state: failed ? "failed" : "approved",
    },
  };
  return saveClaimRecord(updated);
}

function getActiveRuleArtifact(turnId: number): {
  activeRuleArtifact: RuleCompiledArtifact;
  activeRuleId: number;
  compiledArtifactHash: string;
} | null {
  const election = elections.get(turnId);

  if (!election || election.activeRuleId === null) {
    return null;
  }

  const validation = getRuleValidation(turnId, election.activeRuleId);
  if (
    !validation ||
    validation.decision !== "VALID" ||
    !validation.compiledArtifact ||
    !validation.compiledArtifactHash
  ) {
    throw new Error("ACTIVE_RULE_ARTIFACT_NOT_FOUND");
  }

  const calculatedHash = hashJson(validation.compiledArtifact);
  if (
    calculatedHash !== validation.compiledArtifactHash ||
    (election.activeRuleArtifactHash !== null &&
      election.activeRuleArtifactHash !== validation.compiledArtifactHash)
  ) {
    throw new Error("ACTIVE_RULE_ARTIFACT_HASH_MISMATCH");
  }

  return {
    activeRuleArtifact: validation.compiledArtifact,
    activeRuleId: election.activeRuleId,
    compiledArtifactHash: validation.compiledArtifactHash,
  };
}

function createVerificationJobForReceipt(args: {
  activeRule: ReturnType<typeof getActiveRuleArtifact>;
  draw: DrawRecord;
  nowIso: string;
  receipt: GuessReceiptRecord;
}): GuessVerificationJobRecord {
  if (args.draw.status !== "fulfilled" || !args.draw.drawResult) {
    throw new Error("DRAW_NOT_FULFILLED");
  }

  const guessHash = hashJson({
    numbers: args.receipt.numbers,
    player: args.receipt.player,
    turnId: args.receipt.turnId,
  });
  const drawHash = hashJson({
    drawResult: args.draw.drawResult,
    turnId: args.draw.turnId,
  });
  const idempotencyKey = [
    "guess.verification",
    args.receipt.turnId,
    args.receipt.player,
    drawHash,
    args.activeRule?.compiledArtifactHash ?? "original",
  ].join(":");
  const existing = verificationJobs.get(idempotencyKey);

  if (existing) {
    return existing;
  }

  const payload: GuessVerificationJobPayload = {
    ...(args.activeRule
      ? {
          active_rule_id: String(args.activeRule.activeRuleId),
          compiled_artifact_hash: args.activeRule.compiledArtifactHash,
        }
      : {}),
    draw_hash: drawHash,
    guess_hash: guessHash,
    turn_id: String(args.receipt.turnId),
    wallet: args.receipt.player,
  };
  const job: GuessVerificationJobRecord = {
    activeRuleArtifact: args.activeRule?.activeRuleArtifact ?? null,
    activeRuleId: args.activeRule?.activeRuleId ?? null,
    attempts: 0,
    completedAt: null,
    createdAt: args.nowIso,
    deadLetteredAt: null,
    draw: args.draw.drawResult,
    error: null,
    id: hashJson({ idempotencyKey }),
    idempotencyKey,
    maxAttempts: 5,
    payload,
    playerGuess: args.receipt.numbers,
    resultId: null,
    runAfter: args.nowIso,
    status: "pending",
    turnId: args.receipt.turnId,
    updatedAt: args.nowIso,
  };

  verificationJobs.set(idempotencyKey, job);
  return job;
}

export function createGuessVerificationJobsForTurn(
  turnId: number,
  nowIso: string = new Date().toISOString(),
) {
  const draw = getDraw(turnId);
  if (!draw || draw.status !== "fulfilled" || !draw.drawResult) {
    throw new Error("DRAW_NOT_FULFILLED");
  }

  const activeRule = getActiveRuleArtifact(turnId);
  const receipts = listGuessReceipts(turnId);
  const jobs = receipts.map((receipt) =>
    createVerificationJobForReceipt({ activeRule, draw, nowIso, receipt }),
  );

  return {
    jobs,
    summary: getVerificationSummary(turnId),
  };
}

export function saveGuessVerificationResult(result: GuessVerificationResultRecord) {
  const job = [...verificationJobs.values()].find((candidate) => candidate.id === result.jobId);
  if (!job) {
    throw new Error("VERIFICATION_JOB_NOT_FOUND");
  }

  if (job.turnId !== result.turnId || job.payload.wallet !== result.player) {
    throw new Error("VERIFICATION_RESULT_JOB_MISMATCH");
  }

  const updatedJob: GuessVerificationJobRecord = {
    ...job,
    attempts: job.attempts + 1,
    completedAt: result.completedAt,
    error: null,
    resultId: result.resultId,
    status: "completed",
    updatedAt: result.completedAt,
  };
  const auditLog = appendGuessVerificationAuditLog(job, result);
  const normalizedResult: GuessVerificationResultRecord = {
    ...result,
    auditLogHash: auditLog.logHash,
  };

  verificationJobs.set(job.idempotencyKey, updatedJob);
  verificationResults.set(
    getVerificationResultKey(result.turnId, result.player),
    normalizedResult,
  );
  calculateAndStoreWinnerRecords(result.turnId, result.completedAt);
  calculateAndStoreRewardRecords(result.turnId, result.completedAt);
  return normalizedResult;
}

function appendGuessVerificationAuditLog(
  job: GuessVerificationJobRecord,
  result: GuessVerificationResultRecord,
) {
  return appendAuditLog({
    createdAt: result.completedAt,
    input: {
      activeRuleId: result.activeRuleId,
      compiledArtifactHash: job.payload.compiled_artifact_hash ?? null,
      draw: job.draw,
      drawHash: job.payload.draw_hash,
      guess: job.playerGuess,
      guessHash: job.payload.guess_hash,
      jobId: job.id,
      player: result.player,
      turnId: result.turnId,
    },
    jobId: job.id,
    kind: "guess.verification",
    output: {
      alternative: result.alternative,
      original: result.original,
      resultId: result.resultId,
      status: result.status,
    },
    player: result.player,
    publicStateRef: {
      key: getVerificationResultKey(result.turnId, result.player),
      type: "guess_verification_result",
    },
    reason: [
      `original:${result.original.result}`,
      `alternative:${result.alternative?.result ?? "NONE"}`,
    ].join(";"),
    result: result.alternative?.result === "WIN" || result.original.result === "WIN"
      ? "WIN"
      : "LOSE",
    resultId: result.resultId,
    ruleId: result.activeRuleId,
    turnId: result.turnId,
  });
}

export function getVerificationSummary(turnId: number) {
  const jobs = listVerificationJobs(turnId);
  const byStatus = jobs.reduce<Record<GuessVerificationJobStatus, number>>(
    (counts, job) => {
      counts[job.status] += 1;
      return counts;
    },
    {
      completed: 0,
      dead_letter: 0,
      pending: 0,
      processing: 0,
      retry_scheduled: 0,
    },
  );

  return {
    completed: byStatus.completed,
    deadLettered: byStatus.dead_letter,
    jobs: jobs.length,
    pending: byStatus.pending,
    processing: byStatus.processing,
    results: listVerificationResults(turnId).length,
    retryScheduled: byStatus.retry_scheduled,
  };
}

export function runRuleValidationForProposal(args: {
  model?: string;
  provider?: string;
  ruleId: number;
  turnId: number;
}) {
  const proposal = ruleProposals.get(getRuleProposalKey(args.turnId, args.ruleId));
  if (!proposal) {
    throw new Error("RULE_PROPOSAL_NOT_FOUND");
  }

  const request = {
    prompt: proposal.sanitizedText,
    ruleId: proposal.ruleId,
    tokenCount: proposal.tokenCount,
  };
  const result = validateAndPrecompileRule({
    ...request,
    ...(args.model ? { model: args.model } : {}),
    ...(args.provider ? { provider: args.provider } : {}),
  });
  const record: RuleValidationRecord = {
    compiledArtifact: result.artifact,
    compiledArtifactHash: result.artifactHash,
    confidence: result.log.confidence,
    confidenceAction: result.log.confidenceAction,
    decision: result.decision,
    evaluatedTestCases: result.log.evaluatedTestCases,
    fallbackRateSample: result.log.fallbackRateSample,
    fallbackTriggered: result.log.fallbackTriggered,
    finalConfidence: result.log.confidence.final_confidence,
    model: result.log.model,
    modelIdentity: result.log.modelIdentity,
    normalizedText: result.log.normalizedText,
    provider: result.log.provider,
    providerDisagreementRateSample: result.log.providerDisagreementRateSample,
    providerPath: result.log.providerPath,
    reasonCodes: result.log.reasonCodes,
    reasonSummary: result.log.reasonSummary,
    ruleId: proposal.ruleId,
    turnId: proposal.turnId,
    validatedAt: result.log.timestamp,
    validationLogId: result.log.validationLogId,
  };

  return saveRuleValidation(record);
}

export function saveRuleElection(election: RuleElectionRecord) {
  elections.set(election.turnId, election);
  return election;
}

export function getRuleElection(turnId: number) {
  return elections.get(turnId) ?? null;
}

function isUniqueDrawResult(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    new Set(value).size === 6 &&
    value.every(
      (number) => Number.isInteger(number) && number >= 1 && number <= 100,
    )
  );
}

function isValidDrawRecord(value: unknown): value is DrawRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const draw = value as Partial<DrawRecord>;

  if (
    !Number.isInteger(draw.turnId) ||
    Number(draw.turnId) <= 0 ||
    !isBase58Like(draw.randomnessAccount) ||
    typeof draw.requestedAt !== "string" ||
    Number.isNaN(Date.parse(draw.requestedAt))
  ) {
    return false;
  }

  if (draw.status === "requested") {
    return (
      draw.drawResult == null &&
      draw.randomnessSource == null &&
      draw.randomnessValue == null
    );
  }

  if (draw.status === "failed") {
    return Number.isInteger(draw.failureCode) && Number(draw.failureCode) > 0;
  }

  if (draw.status === "fulfilled") {
    return (
      isUniqueDrawResult(draw.drawResult) &&
      isBase58Like(draw.randomnessSource) &&
      typeof draw.randomnessValue === "string" &&
      /^[0-9a-f]{64}$/i.test(draw.randomnessValue) &&
      typeof draw.drawnAt === "string" &&
      !Number.isNaN(Date.parse(draw.drawnAt)) &&
      (draw.settleSignature == null || isBase58Like(draw.settleSignature))
    );
  }

  return false;
}

export function saveDraw(draw: DrawRecord) {
  const normalized: DrawRecord = {
    drawResult: draw.drawResult ?? null,
    drawnAt: draw.drawnAt ?? null,
    failureCode: draw.failureCode ?? null,
    randomnessAccount: draw.randomnessAccount,
    randomnessSource: draw.randomnessSource ?? null,
    randomnessValue: draw.randomnessValue ?? null,
    requestedAt: draw.requestedAt,
    settleSignature: draw.settleSignature ?? null,
    status: draw.status,
    turnId: draw.turnId,
  };
  draws.set(draw.turnId, normalized);
  return normalized;
}

export function getDraw(turnId: number) {
  return draws.get(turnId) ?? null;
}

export interface RoundRuleSummary {
  compiledArtifactHash: string | null;
  precompilationStatus: "failed" | "passed" | "pending";
  proposer: string;
  ruleId: number;
  ruleProposal: string;
  sanitizedText: string;
  state: "eligible" | "invalidated" | "proposed";
  title: string;
  tokenCount: number;
  validation: RuleValidationSummary | null;
  votes: number;
}

export interface RoundSummary {
  cycle: {
    durationHours: number;
    nextDurationHours: number;
    pattern: readonly number[];
    stepIndex: number;
  };
  claims: ClaimSummary;
  draw: DrawRecord | null;
  election: RuleElectionRecord | null;
  pool: {
    accounting: PrizePoolAccounting;
    guessSol: number;
    guesses: number;
    indicativeSol: number;
    paidRemovalSol: number;
    paidRemovals: number;
    proposalSol: number;
    proposals: number;
    totalVisiblePrizePoolSol: number;
    treasurySol: number;
    voteFeeSol: number;
    voteFees: number;
  };
  rules: RoundRuleSummary[];
  status: "completed" | "current" | "upcoming";
  totalVotes: number;
  turnId: number;
  verification: ReturnType<typeof getVerificationSummary>;
  rewards: RewardCalculationSummary;
  winners: WinnerCalculationSummary;
}

function cycleDurationHours(stepIndex: number): number {
  const value = TURN_DURATION_CYCLE_HOURS[stepIndex];
  if (value === undefined) {
    throw new Error(`Invalid turn-cycle step index ${stepIndex}.`);
  }
  return value;
}

function roundSol(value: number) {
  return Number(value.toFixed(4));
}

function solToLamports(value: number) {
  return Math.round(value * LAMPORTS_PER_SOL);
}

function assertNonNegativeSafeInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`INVALID_${label.toUpperCase()}`);
  }
}

function splitFeeLamports(amountLamports: number, treasuryFeeBps: number) {
  assertNonNegativeSafeInteger(amountLamports, "fee_lamports");
  assertNonNegativeSafeInteger(treasuryFeeBps, "treasury_fee_bps");
  if (treasuryFeeBps > 10_000) {
    throw new Error("INVALID_TREASURY_FEE_BPS");
  }

  const treasuryLamports = Math.floor((amountLamports * treasuryFeeBps) / 10_000);
  const prizeLamports = amountLamports - treasuryLamports;
  return { prizeLamports, treasuryLamports };
}

function accountFeeSource(
  count: number,
  feeLamports: number,
  treasuryFeeBps: number,
): PrizePoolFeeSourceAccounting {
  assertNonNegativeSafeInteger(count, "fee_count");
  assertNonNegativeSafeInteger(feeLamports, "fee_lamports");

  const grossLamports = count * feeLamports;
  assertNonNegativeSafeInteger(grossLamports, "gross_lamports");
  const { prizeLamports, treasuryLamports } = splitFeeLamports(
    grossLamports,
    treasuryFeeBps,
  );

  return {
    count,
    feeLamports,
    grossLamports,
    prizeLamports,
    treasuryLamports,
  };
}

function defaultAccountingConfig(): PrizePoolAccountingConfig {
  return {
    guessSubmissionFeeLamports: solToLamports(MVP_FEES_SOL.guessSubmission),
    paidRuleRemovalFeeLamports: solToLamports(MVP_FEES_SOL.paidRuleRemoval),
    ruleProposalFeeLamports: solToLamports(MVP_FEES_SOL.ruleProposal),
    treasuryFeeBps: TREASURY_FEE_BPS,
    voteFeeLamports: solToLamports(MVP_FEES_SOL.vote),
    voteFeeStartTurn: VOTE_FEE_START_TURN,
  };
}

export function calculatePrizePoolAccounting(args: {
  alternativeRolloverLamports?: number;
  config?: Partial<PrizePoolAccountingConfig>;
  guessCount: number;
  originalRolloverLamports?: number;
  paidRuleRemovalCount: number;
  ruleProposalCount: number;
  turnId: number;
  voteCount: number;
}): PrizePoolAccounting {
  assertNonNegativeSafeInteger(args.turnId, "turn_id");
  if (args.turnId <= 0) {
    throw new Error("INVALID_TURN_ID");
  }

  const config = {
    ...defaultAccountingConfig(),
    ...args.config,
  };
  const voteFeeActive = args.turnId >= config.voteFeeStartTurn;
  const guessSubmissions = accountFeeSource(
    args.guessCount,
    config.guessSubmissionFeeLamports,
    config.treasuryFeeBps,
  );
  const ruleProposals = accountFeeSource(
    args.ruleProposalCount,
    config.ruleProposalFeeLamports,
    config.treasuryFeeBps,
  );
  const paidRuleRemovals = accountFeeSource(
    args.paidRuleRemovalCount,
    config.paidRuleRemovalFeeLamports,
    config.treasuryFeeBps,
  );
  const votes = {
    ...accountFeeSource(
      voteFeeActive ? args.voteCount : 0,
      config.voteFeeLamports,
      config.treasuryFeeBps,
    ),
    feeActive: voteFeeActive,
  };

  const grossFeesLamports =
    guessSubmissions.grossLamports +
    ruleProposals.grossLamports +
    paidRuleRemovals.grossLamports +
    votes.grossLamports;
  const treasuryLamports =
    guessSubmissions.treasuryLamports +
    ruleProposals.treasuryLamports +
    paidRuleRemovals.treasuryLamports +
    votes.treasuryLamports;
  const currentTurnPoolLamports =
    guessSubmissions.prizeLamports +
    ruleProposals.prizeLamports +
    paidRuleRemovals.prizeLamports +
    votes.prizeLamports;

  const originalCurrentTurnLamports = Math.floor(currentTurnPoolLamports / 2);
  const alternativeCurrentTurnLamports =
    currentTurnPoolLamports - originalCurrentTurnLamports;
  const originalRolloverLamports = args.originalRolloverLamports ?? 0;
  const alternativeRolloverLamports = args.alternativeRolloverLamports ?? 0;
  assertNonNegativeSafeInteger(originalRolloverLamports, "original_rollover_lamports");
  assertNonNegativeSafeInteger(
    alternativeRolloverLamports,
    "alternative_rollover_lamports",
  );

  const originalTotalLamports =
    originalCurrentTurnLamports + originalRolloverLamports;
  const alternativeTotalLamports =
    alternativeCurrentTurnLamports + alternativeRolloverLamports;
  const totalVisiblePrizePoolLamports =
    originalTotalLamports + alternativeTotalLamports;

  return {
    buckets: {
      alternative: {
        currentTurnLamports: alternativeCurrentTurnLamports,
        rolloverLamports: alternativeRolloverLamports,
        totalLamports: alternativeTotalLamports,
      },
      original: {
        currentTurnLamports: originalCurrentTurnLamports,
        rolloverLamports: originalRolloverLamports,
        totalLamports: originalTotalLamports,
      },
    },
    config,
    currentTurnPoolLamports,
    grossFeesLamports,
    nextRolloverIfNoWinnersLamports: {
      alternative: alternativeTotalLamports,
      original: originalTotalLamports,
    },
    platformMonetizationLamports: treasuryLamports,
    sources: {
      guessSubmissions,
      paidRuleRemovals,
      ruleProposals,
      votes,
    },
    totalVisiblePrizePoolLamports,
    treasuryLamports,
    turnId: args.turnId,
  };
}

function lamportsToSol(lamports: number) {
  return lamports / LAMPORTS_PER_SOL;
}

function listPaidRuleRemovals(turnId: number) {
  return [...paidRuleRemovals.values()].filter(
    (removal) => removal.turnId === turnId,
  );
}

function getTurnRollover(turnId: number) {
  return turnRollovers.get(turnId) ?? null;
}

export function getPrizePoolAccounting(turnId: number) {
  const proposals = listRuleProposals(turnId);
  const { votes } = listRuleVotes(turnId);
  const rollover = getTurnRollover(turnId);

  return calculatePrizePoolAccounting({
    alternativeRolloverLamports: rollover?.alternativeRolloverLamports ?? 0,
    guessCount: listGuessReceipts(turnId).length,
    originalRolloverLamports: rollover?.originalRolloverLamports ?? 0,
    paidRuleRemovalCount: listPaidRuleRemovals(turnId).length,
    ruleProposalCount: proposals.length,
    turnId,
    voteCount: votes.length,
  });
}

export function getRoundSummary(
  turnId: number,
  activeTurnId: number = IDEALER_ACTIVE_TURN_ID,
): RoundSummary {
  const proposals = listRuleProposals(turnId);
  const { counts, votes } = listRuleVotes(turnId);
  const guesses = [...guessReceipts.values()].filter(
    (receipt) => receipt.turnId === turnId,
  ).length;
  const removals = listPaidRuleRemovals(turnId).length;
  const accounting = getPrizePoolAccounting(turnId);

  const cycleLength = TURN_DURATION_CYCLE_HOURS.length;
  const stepIndex = (turnId - 1) % cycleLength;
  const nextStepIndex = turnId % cycleLength;
  const guessSol = lamportsToSol(
    accounting.sources.guessSubmissions.grossLamports,
  );
  const proposalSol = lamportsToSol(
    accounting.sources.ruleProposals.grossLamports,
  );
  const paidRemovalSol = lamportsToSol(
    accounting.sources.paidRuleRemovals.grossLamports,
  );
  const voteFeeSol = lamportsToSol(accounting.sources.votes.grossLamports);
  const totalVisiblePrizePoolSol = lamportsToSol(
    accounting.totalVisiblePrizePoolLamports,
  );
  const treasurySol = lamportsToSol(accounting.treasuryLamports);

  const status =
    turnId < activeTurnId
      ? "completed"
      : turnId > activeTurnId
        ? "upcoming"
        : "current";

  return {
    cycle: {
      durationHours: cycleDurationHours(stepIndex),
      nextDurationHours: cycleDurationHours(nextStepIndex),
      pattern: TURN_DURATION_CYCLE_HOURS,
      stepIndex,
    },
    claims: getClaimSummary({ turnId }),
    draw: getDraw(turnId),
    election: getRuleElection(turnId),
    pool: {
      accounting,
      guessSol: roundSol(guessSol),
      guesses,
      indicativeSol: roundSol(totalVisiblePrizePoolSol),
      paidRemovalSol: roundSol(paidRemovalSol),
      paidRemovals: removals,
      proposalSol: roundSol(proposalSol),
      proposals: proposals.length,
      totalVisiblePrizePoolSol: roundSol(totalVisiblePrizePoolSol),
      treasurySol: roundSol(treasurySol),
      voteFeeSol: roundSol(voteFeeSol),
      voteFees: accounting.sources.votes.count,
    },
    rules: proposals.map((proposal) => ({
      compiledArtifactHash: proposal.compiledArtifactHash ?? null,
      precompilationStatus: proposal.precompilationStatus ?? "pending",
      proposer: proposal.proposer,
      ruleId: proposal.ruleId,
      ruleProposal: proposal.ruleProposal,
      sanitizedText: proposal.sanitizedText,
      state: proposal.state ?? "proposed",
      title: proposal.title,
      tokenCount: proposal.tokenCount,
      validation: proposal.validation ?? null,
      votes: counts[String(proposal.ruleId)] ?? 0,
    })),
    status,
    totalVotes: votes.length,
    turnId,
    verification: getVerificationSummary(turnId),
    rewards: getRewardSummary(turnId),
    winners: getWinnerSummary(turnId),
  };
}

async function checkPostgres(databaseUrl: string): Promise<"ok" | "error"> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("select 1");
    return "ok";
  } catch {
    return "error";
  } finally {
    await pool.end();
  }
}

async function checkRedis(redisUrl: string): Promise<"ok" | "error"> {
  const client = createClient({ url: redisUrl });
  try {
    await client.connect();
    await client.ping();
    return "ok";
  } catch {
    return "error";
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

export async function getHealth(): Promise<ServiceHealth> {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;

  if (!databaseUrl || !redisUrl) {
    return {
      service: "api",
      status: "error",
      turnDurationCycleHours: TURN_DURATION_CYCLE_HOURS,
      postgres: databaseUrl ? "ok" : "error",
      redis: redisUrl ? "ok" : "error",
    };
  }

  const [postgres, redis] = await Promise.all([
    checkPostgres(databaseUrl),
    checkRedis(redisUrl),
  ]);

  return {
    service: "api",
    status: postgres === "ok" && redis === "ok" ? "ok" : "error",
    turnDurationCycleHours: TURN_DURATION_CYCLE_HOURS,
    postgres,
    redis,
  };
}

function isMainModule() {
  const entrypoint = process.argv[1];
  return (
    typeof entrypoint === "string" &&
    fileURLToPath(import.meta.url) === resolve(entrypoint)
  );
}

if (isMainModule()) {
  const port = Number(process.env.PORT ?? 3002);
  const host = process.env.HOST ?? "0.0.0.0";

  const server = createServer((request, response) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? host}`,
    );

    if (request.method === "GET" && url.pathname === "/health") {
      void getHealth().then((health) => {
        sendJson(request, response, health.status === "ok" ? 200 : 503, health);
      });
      return;
    }

    if (
      request.method === "OPTIONS" &&
      (CORS_PATHS.has(url.pathname) ||
        url.pathname.startsWith("/audit/") ||
        url.pathname.startsWith("/prize-pool-accounting/"))
    ) {
      sendNoContent(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-preflight") {
      void readJsonBody(request)
        .then(async (body) => {
          const text =
            body && typeof body === "object" && "text" in body
              ? (body as { text?: unknown }).text
              : null;

          if (typeof text !== "string") {
            sendJson(request, response, 400, { error: "invalid_rule_text" });
            return;
          }

          try {
            sendJson(request, response, 200, {
              preflight: await createRulePreflight(text),
            });
          } catch (error) {
            if (error instanceof RuleAgentError) {
              sendJson(request, response, 502, {
                error: error.code,
                message:
                  error.code === "RULE_AGENT_NOT_CONFIGURED"
                    ? "The rule agent is not configured. Set LLM_BASE_URL and LLM_MODEL."
                    : error.code === "RULE_AGENT_TIMEOUT"
                      ? "The dealer agent took too long to respond. Try again."
                      : error.code === "RULE_AGENT_BAD_RESPONSE"
                        ? "The dealer agent returned an unusable response. Try rephrasing the rule."
                        : "The dealer agent is unavailable. Make sure the model is running and try again.",
              });
              return;
            }

            const code =
              error instanceof Error ? error.message : "RULE_REJECTED";
            sendJson(request, response, 400, {
              error: code,
              message:
                code === "RULE_PROMPT_INJECTION"
                  ? "Rule text contains prompt-injection language. Rewrite it as a measurable game condition."
                  : code === "RULE_TOKEN_LIMIT_EXCEEDED"
                    ? `Rule text exceeds the ${RULE_MAX_TOKENS}-token limit.`
                    : code === "RULE_TEXT_TOO_LONG"
                      ? `Rule text exceeds the ${MAX_RULE_TEXT_BYTES}-byte on-chain limit.`
                      : "Rule text is invalid.",
            });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "POST" && url.pathname === "/guess-receipts") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidGuessReceipt(body)) {
            sendJson(request, response, 400, {
              error: "invalid_guess_receipt",
            });
            return;
          }

          const existing = getGuessReceipt(body.turnId, body.player);
          if (existing && existing.signature !== body.signature) {
            sendJson(request, response, 409, {
              error: "duplicate_guess_receipt",
              receipt: existing,
            });
            return;
          }

          sendJson(request, response, 201, { receipt: saveGuessReceipt(body) });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-proposals") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidRuleProposal(body)) {
            sendJson(request, response, 400, {
              error: "invalid_rule_proposal",
            });
            return;
          }

          const existing = ruleProposals.get(
            getRuleProposalKey(body.turnId, body.ruleId),
          );
          if (existing && existing.signature !== body.signature) {
            sendJson(request, response, 409, {
              error: "duplicate_rule_proposal",
              proposal: existing,
            });
            return;
          }

          sendJson(request, response, 201, {
            proposal: saveRuleProposal(body),
          });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/rule-proposals") {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        proposals: listRuleProposals(turnId),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-precompilations") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidRulePrecompilation(body)) {
            sendJson(request, response, 400, {
              error: "invalid_rule_precompilation",
            });
            return;
          }

          try {
            sendJson(request, response, 201, {
              proposal: saveRulePrecompilation(body),
            });
          } catch (error) {
            const code =
              error instanceof Error ? error.message : "PRECOMPILATION_FAILED";
            sendJson(request, response, 404, {
              error: code,
              message: "Rule proposal not found for precompilation update.",
            });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-validations/run") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidRuleValidationRunRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_rule_validation_request",
            });
            return;
          }

          try {
            const validation = runRuleValidationForProposal(body);
            sendJson(request, response, 201, { validation });
          } catch (error) {
            const code =
              error instanceof Error ? error.message : "RULE_VALIDATION_FAILED";
            sendJson(request, response, 404, {
              error: code,
              message: "Rule proposal not found for validation.",
            });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-validations") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidRuleValidation(body)) {
            sendJson(request, response, 400, {
              error: "invalid_rule_validation",
            });
            return;
          }

          try {
            sendJson(request, response, 201, {
              validation: saveRuleValidation(body),
            });
          } catch (error) {
            const code =
              error instanceof Error ? error.message : "RULE_VALIDATION_FAILED";
            sendJson(request, response, 404, {
              error: code,
              message: "Rule proposal not found for validation.",
            });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/rule-validations/")) {
      const parts = url.pathname.slice("/rule-validations/".length).split("/");
      const turnId = Number(parts[0]);
      const ruleId = Number(parts[1]);

      if (!Number.isInteger(turnId) || turnId <= 0 || !Number.isInteger(ruleId) || ruleId <= 0) {
        sendJson(request, response, 400, { error: "invalid_rule_validation_id" });
        return;
      }

      const validation = getRuleValidation(turnId, ruleId);
      sendJson(
        request,
        response,
        validation ? 200 : 404,
        validation ? { validation } : { error: "not_found" },
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-votes") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidRuleVote(body)) {
            sendJson(request, response, 400, { error: "invalid_rule_vote" });
            return;
          }

          const existing = ruleVotes.get(
            getRuleVoteKey(body.turnId, body.ruleId, body.voter),
          );
          if (existing && existing.signature !== body.signature) {
            sendJson(request, response, 409, {
              error: "duplicate_rule_vote",
              vote: existing,
            });
            return;
          }

          sendJson(request, response, 201, { vote: saveRuleVote(body) });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/rule-votes") {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, listRuleVotes(turnId));
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-removals") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidPaidRuleRemoval(body)) {
            sendJson(request, response, 400, {
              error: "invalid_rule_removal",
            });
            return;
          }

          const existing = paidRuleRemovals.get(
            getPaidRuleRemovalKey(body.turnId, body.ruleId, body.remover),
          );
          if (existing && existing.signature !== body.signature) {
            sendJson(request, response, 409, {
              error: "duplicate_rule_removal",
              removal: existing,
            });
            return;
          }

          sendJson(request, response, 201, {
            removal: savePaidRuleRemoval(body),
          });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/rule-removals") {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        removals: listPaidRuleRemovals(turnId),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/prize-pool-rollovers") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidTurnRollover(body)) {
            sendJson(request, response, 400, {
              error: "invalid_prize_pool_rollover",
            });
            return;
          }

          sendJson(request, response, 201, {
            rollover: saveTurnRollover(body),
          });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/prize-pool-rollovers") {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        rollover: getTurnRollover(turnId),
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/prize-pool-accounting/")) {
      const turnId = Number(url.pathname.slice("/prize-pool-accounting/".length));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_turn_id" });
        return;
      }

      sendJson(request, response, 200, {
        accounting: getPrizePoolAccounting(turnId),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/draws") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidDrawRecord(body)) {
            sendJson(request, response, 400, { error: "invalid_draw_record" });
            return;
          }

          sendJson(request, response, 201, { draw: saveDraw(body) });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/draws/")) {
      const turnId = Number(url.pathname.slice("/draws/".length));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_turn_id" });
        return;
      }

      const draw = getDraw(turnId);
      sendJson(
        request,
        response,
        draw ? 200 : 404,
        draw ? { draw } : { error: "not_found" },
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/elections") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidRuleElection(body)) {
            sendJson(request, response, 400, {
              error: "invalid_rule_election",
            });
            return;
          }

          sendJson(request, response, 201, {
            election: saveRuleElection(body),
          });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/elections/")) {
      const turnId = Number(url.pathname.slice("/elections/".length));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_turn_id" });
        return;
      }

      const election = getRuleElection(turnId);
      sendJson(
        request,
        response,
        election ? 200 : 404,
        election ? { election } : { error: "not_found" },
      );
      return;
    }

    if (request.method === "POST" && url.pathname === "/verification-jobs/create-turn") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidGuessVerificationCreateRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_verification_job_request",
            });
            return;
          }

          try {
            const result = createGuessVerificationJobsForTurn(body.turnId);
            sendJson(request, response, 201, result);
          } catch (error) {
            const code =
              error instanceof Error ? error.message : "VERIFICATION_JOB_FAILED";
            sendJson(request, response, 409, {
              error: code,
              message: "Verification jobs could not be created for this turn.",
            });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/verification-jobs") {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        jobs: listVerificationJobs(turnId),
        summary: getVerificationSummary(turnId),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/verification-results") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidGuessVerificationResult(body)) {
            sendJson(request, response, 400, {
              error: "invalid_verification_result",
            });
            return;
          }

          try {
            sendJson(request, response, 201, {
              result: saveGuessVerificationResult(body),
              summary: getVerificationSummary(body.turnId),
            });
          } catch (error) {
            const code =
              error instanceof Error ? error.message : "VERIFICATION_RESULT_FAILED";
            sendJson(request, response, 404, {
              error: code,
              message: "Verification job not found for result update.",
            });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/verification-results") {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        results: listVerificationResults(turnId),
        summary: getVerificationSummary(turnId),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/winner-records/calculate-turn") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidGuessVerificationCreateRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_winner_calculation_request",
            });
            return;
          }

          sendJson(request, response, 201, {
            winners: calculateAndStoreWinnerRecords(body.turnId),
          });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/winner-records") {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        winners: getWinnerSummary(turnId),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/reward-records/calculate-turn") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidGuessVerificationCreateRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_reward_calculation_request",
            });
            return;
          }

          try {
            sendJson(request, response, 201, {
              rewards: calculateAndStoreRewardRecords(body.turnId),
            });
          } catch (error) {
            const code =
              error instanceof Error ? error.message : "REWARD_CALCULATION_FAILED";
            sendJson(request, response, 404, {
              error: code,
            });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/reward-records") {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        rewards: getRewardSummary(turnId),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/claim-records/create-turn") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidClaimCreateRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_claim_create_request",
            });
            return;
          }

          sendJson(request, response, 201, {
            claims: createClaimRecordsForTurn(body.turnId, body.availableAt),
          });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/claim-records") {
      const turnId = Number(url.searchParams.get("turnId"));
      const wallet = url.searchParams.get("wallet") ?? undefined;

      if (
        !Number.isInteger(turnId) ||
        turnId <= 0 ||
        (wallet !== undefined && !isBase58Like(wallet))
      ) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        claims: getClaimSummary({ turnId, ...(wallet ? { wallet } : {}) }),
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/claim-records/request") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidClaimRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_claim_request",
            });
            return;
          }

          try {
            sendJson(request, response, 200, {
              claim: requestClaimApproval(body),
            });
          } catch (error) {
            const code = error instanceof Error ? error.message : "CLAIM_FAILED";
            sendJson(request, response, 409, { error: code });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "POST" && url.pathname === "/claim-records/complete") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidClaimCompleteRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_claim_completion_request",
            });
            return;
          }

          try {
            sendJson(request, response, 200, {
              claim: completeClaimApproval(body),
            });
          } catch (error) {
            const code = error instanceof Error ? error.message : "CLAIM_FAILED";
            sendJson(request, response, 409, { error: code });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/audit") {
      const rawTurnId = url.searchParams.get("turnId");
      const rawKind = url.searchParams.get("kind");
      const turnId = rawTurnId === null ? undefined : Number(rawTurnId);
      const kind =
        rawKind === "compiler.validation" || rawKind === "guess.verification"
          ? rawKind
          : undefined;

      if (rawTurnId !== null && (!Number.isInteger(turnId) || Number(turnId) <= 0)) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }
      if (rawKind !== null && kind === undefined) {
        sendJson(request, response, 400, { error: "invalid_audit_kind" });
        return;
      }

      const filters: { kind?: AuditLogKind; turnId?: number } = {};
      if (kind !== undefined) {
        filters.kind = kind;
      }
      if (turnId !== undefined) {
        filters.turnId = turnId;
      }

      sendJson(request, response, 200, {
        logs: listAuditLogs(filters),
      });
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/audit/")) {
      const logHash = url.pathname.slice("/audit/".length);
      if (!isHexHash(logHash)) {
        sendJson(request, response, 400, { error: "invalid_audit_log_hash" });
        return;
      }

      const log = getAuditLog(logHash);
      sendJson(
        request,
        response,
        log ? 200 : 404,
        log
          ? { integrity: verifyAuditLogIntegrity(log), log }
          : { error: "not_found" },
      );
      return;
    }

    if (request.method === "GET" && url.pathname.startsWith("/rounds/")) {
      const turnId = Number(url.pathname.slice("/rounds/".length));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_turn_id" });
        return;
      }

      sendJson(request, response, 200, { round: getRoundSummary(turnId) });
      return;
    }

    if (request.method === "GET" && url.pathname === "/rounds") {
      sendJson(request, response, 200, {
        activeTurnId: IDEALER_ACTIVE_TURN_ID,
        round: getRoundSummary(IDEALER_ACTIVE_TURN_ID),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/guess-receipts") {
      const player = url.searchParams.get("player");
      const turnId = Number(url.searchParams.get("turnId"));

      if (!player || !Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      const receipt = getGuessReceipt(turnId, player);
      sendJson(
        request,
        response,
        receipt ? 200 : 404,
        receipt ? { receipt } : { error: "not_found" },
      );
      return;
    }

    sendJson(request, response, 404, { error: "not_found" });
  });

  server.listen(port, host, () => {
    console.log(`@idealer/api listening on ${host}:${port}`);
    void warmDealerModels();
  });
}

// On boot, load the dealer (and guardian) models into Ollama so the first
// player request doesn't pay the cold-load latency. Best-effort: logs what it
// did and never blocks or crashes startup if the LLM isn't configured/running.
async function warmDealerModels() {
  let agentConfig;
  try {
    agentConfig = resolveRuleAgentConfig();
  } catch {
    console.log("[warmup] dealer LLM not configured; skipping model warm-up");
    return;
  }

  const guardianConfig = resolveGuardianConfig();
  const escalationModel = resolveEscalationModel();
  const targets = [
    agentConfig.model,
    escalationModel,
    guardianConfig.enabled ? guardianConfig.model : "",
  ].filter((model, index, all) => model && all.indexOf(model) === index);

  for (const model of targets) {
    const result = await ensureModelLoaded(model, agentConfig);
    if (result.skipped) {
      console.log(`[warmup] ${model}: endpoint is not Ollama-native; skipped`);
    } else if (result.loaded) {
      console.log(`[warmup] ${model}: loaded and ready`);
    } else {
      console.log(`[warmup] ${model}: could not load (${result.note ?? "unknown"})`);
    }
  }
}
