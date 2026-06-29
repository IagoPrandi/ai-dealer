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
  REPEATED_ACTION_FEE_MULTIPLIER,
  RULE_MAX_TOKENS,
  RULE_REMOVAL_CONFIG,
  TREASURY_FEE_BPS,
  TURN_DURATION_CYCLE_HOURS,
  TURN_DURATION_CYCLE_SECONDS,
  VOTER_REWARD_CONFIG,
  VOTER_REWARD_RATE_BPS,
  VOTE_FEE_START_TURN,
} from "@idealer/constants";
import {
  compileRuleArtifact,
  ruleAstSchema,
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
  turnDurationCycleSeconds: readonly number[];
  turnDurationScaleBps: number | null;
  postgres: "ok" | "error";
  redis: "ok" | "error";
}

export interface GuessReceiptRecord {
  feeLamports?: number;
  gameToken: string;
  numbers: readonly number[];
  player: string;
  playerGuess: string;
  programId: string;
  sequence?: number;
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
  feeLamports?: number;
  proposer: string;
  precompilationStatus?: "failed" | "passed" | "pending";
  validation?: RuleValidationSummary | null;
  ruleProposal: string;
  sequence?: number;
  signature: string;
  state?: "eligible" | "invalidated" | "proposed" | "removed_paid";
  submittedAt: string;
  title: string;
  turnId: number;
}

export interface RuleVoteRecord {
  feeLamports?: number;
  ruleId: number;
  ruleProposal: string;
  ruleVote: string;
  sequence?: number;
  signature: string;
  submittedAt: string;
  turnId: number;
  voter: string;
}

export interface RuleEliminationVoteRecord {
  eliminationVote: string;
  feeLamports?: number;
  ruleId: number;
  ruleProposal: string;
  sequence?: number;
  signature: string;
  submittedAt: string;
  turnId: number;
  voter: string;
}

export interface RuleEliminationFinalistState {
  approvalVotes: number;
  eliminated: boolean;
  eliminationVotes: number;
  ruleId: number;
  status: "eliminated" | "survived";
  threshold: number;
}

export interface RuleEliminationRecord {
  closedAt: string | null;
  decisionWindowClosesAt: string | null;
  decisionWindowOpenedAt: string | null;
  eliminatedFinalistHash: string;
  eliminatedRuleIds: number[];
  finalists: RuleEliminationFinalistState[];
  status: "closed" | "not_started" | "open";
  survivorFinalistHash: string;
  survivorRuleIds: number[];
  turnId: number;
}

export interface PaidRuleRemovalRecord {
  feeLamports?: number;
  removalKind: "creator_self" | "third_party";
  remover: string;
  removedAt: string;
  ruleId: number;
  ruleProposal: string;
  ruleRemoval: string;
  signature: string;
  turnId: number;
  voteCountAtRemoval?: number;
}

export type RuleRemovalRejectionCode =
  | "RULE_NOT_FOUND"
  | "RULE_NOT_REMOVABLE"
  | "RULE_REMOVAL_WINDOW_CLOSED"
  | "RULE_REMOVAL_PROTECTED"
  | "RULE_ALREADY_REMOVED";

export class RuleRemovalRejectedError extends Error {
  code: RuleRemovalRejectionCode;
  threshold: number | undefined;
  voteCount: number | undefined;

  constructor(
    code: RuleRemovalRejectionCode,
    message: string,
    details?: { threshold?: number; voteCount?: number },
  ) {
    super(message);
    this.name = "RuleRemovalRejectedError";
    this.code = code;
    this.threshold = details?.threshold;
    this.voteCount = details?.voteCount;
  }
}

export interface TurnRolloverRecord {
  alternativeRolloverLamports: number;
  originalRolloverLamports: number;
  recordedAt: string;
  sourceTurnId: number | null;
  turnId: number;
}

export type RolloverReason = "none" | "no_winner" | "dust_remainder";

export interface RolloverBucketSettlement {
  reason: RolloverReason;
  rolloverLamports: number;
  winnerCount: number;
}

export interface TurnRolloverSettlement {
  alternative: RolloverBucketSettlement;
  nextTurnId: number;
  original: RolloverBucketSettlement;
  settledAt: string;
  totalRolloverLamports: number;
  turnId: number;
}

export interface RolloverActivityEvent {
  bucket: "alternative" | "original";
  fromTurnId: number;
  rolloverLamports: number;
  toTurnId: number;
  type: "pool_rollover";
}

export interface RuleRemovalActivityEvent {
  removalKind: "creator_self" | "third_party";
  ruleId: number;
  ruleTitle: string | null;
  turnId: number;
  type: "rule_removed";
}

export type ActivityEvent = RolloverActivityEvent | RuleRemovalActivityEvent;

export interface PrizePoolAccountingConfig {
  guessSubmissionFeeLamports: number;
  paidRuleRemovalFeeLamports: number;
  ruleProposalFeeLamports: number;
  treasuryFeeBps: number;
  voteFeeLamports: number;
  voteFeeStartTurn: number;
  repeatedActionFeeMultiplier: number;
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
    eliminationVotes: PrizePoolFeeSourceAccounting & { feeActive: boolean };
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
  guess_sequence: string;
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
  sequence?: number;
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

export interface ExpiredUnclaimedClaimRollover {
  amountLamports: number;
  category: WinnerCategory;
  claimId: string;
  wallet: string;
}

export interface ExpiredUnclaimedClaimSettlement {
  alternativeRolloverLamports: number;
  currentTurnId: number;
  expiredClaims: ExpiredUnclaimedClaimRollover[];
  originalRolloverLamports: number;
  settledAt: string;
  sourceTurnId: number;
  totalRolloverLamports: number;
}

export type PlayerHistoryEventType =
  | "claim"
  | "elimination_vote"
  | "guess"
  | "rule_proposal"
  | "vote";

export interface PlayerHistoryEvent {
  amountLamports?: number;
  createdAt: string;
  id: string;
  ruleId?: number;
  status: string;
  summary: string;
  title: string;
  turnId: number;
  type: PlayerHistoryEventType;
}

export interface PlayerHistoryPage {
  cursor: string | null;
  events: PlayerHistoryEvent[];
  limit: number;
  nextCursor: string | null;
  wallet: string;
}

export type ConversationDraftStatus = "draft" | "submitted";

export interface ConversationDraftRecord {
  createdAt: string;
  draftId: string;
  lastMessage: string;
  normalizedText: string | null;
  officialInterpretation: string | null;
  prompt: string;
  ruleId: number | null;
  status: ConversationDraftStatus;
  tokenCount: number;
  turnId: number;
  updatedAt: string;
  wallet: string;
}

export type AuditLogKind =
  | "compiler.validation"
  | "guess.verification"
  | "rule.election.proof"
  | "rule.removal"
  | "settlement.transition";
export type AuditPublicStateType =
  | "guess_verification_result"
  | "rule_election"
  | "rule_removal"
  | "rule_validation"
  | "settlement_transition";

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
  activeElectionRandomnessAccount?: string | null;
  activeElectionRandomnessSource?: string | null;
  activeElectionRandomnessValue?: string | null;
  activeRuleArtifactHash: string | null;
  activeRuleHash: string | null;
  activeRuleId: number | null;
  eligibleCandidateCommitments?: RuleElectionCandidateCommitment[];
  electedFinalistIndex: number;
  electedSurvivorIndex?: number | null;
  eligibleRuleIds: number[];
  eligibleRulePoolHash: string;
  eliminatedFinalistHash?: string | null;
  eliminatedRuleIds?: number[];
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
  survivorFinalistHash?: string | null;
  survivorRuleIds?: number[];
  topVotedFinalistHash: string;
  topVotedRuleIds: number[];
  turnId: number;
}

export interface RuleElectionCandidateCommitment {
  compiledArtifactHash: string;
  createdAtSeconds: number;
  isEligibleState: boolean;
  isPrecompiledValid: boolean;
  reportCount: number;
  ruleId: number;
  sanitizedTextHash: string;
  voteCount: number;
}

/**
 * A single PRD §5.5 settlement state-machine transition projected by the worker.
 * Persisting `inputHash`/`outputHash`/`transitionReason` and chaining each
 * transition into the M3.7 hash-chained audit log makes the settlement pipeline
 * auditable (PRD §5.5, §10.13). `idempotencyKey` guarantees a replayed worker
 * step does not append a duplicate transition.
 */
export interface SettlementTransitionRecord {
  auditLogHash: string;
  fromState: string;
  idempotencyKey: string;
  inputHash: string;
  outputHash: string;
  recordedAt: string;
  signature: string | null;
  toState: string;
  transitionReason: string;
  turnId: number;
}

const IDEALER_ACTIVE_TURN_ID = Number(
  process.env.IDEALER_ACTIVE_TURN_ID ?? "1",
);
const guessReceipts = new Map<string, GuessReceiptRecord>();
const ruleProposals = new Map<string, RuleProposalRecord>();
const ruleVotes = new Map<string, RuleVoteRecord>();
const ruleEliminationVotes = new Map<string, RuleEliminationVoteRecord>();
const ruleEliminations = new Map<number, RuleEliminationRecord>();
const paidRuleRemovals = new Map<string, PaidRuleRemovalRecord>();
const turnRollovers = new Map<number, TurnRolloverRecord>();
const turnRolloverSettlements = new Map<number, TurnRolloverSettlement>();
const draws = new Map<number, DrawRecord>();
const elections = new Map<number, RuleElectionRecord>();
const ruleElectionProofAuditLogs = new Map<number, string>();
const settlementTransitions = new Map<string, SettlementTransitionRecord>();
const settlementTransitionOrder: string[] = [];
const ruleValidations = new Map<string, RuleValidationRecord>();
const verificationJobs = new Map<string, GuessVerificationJobRecord>();
const verificationResults = new Map<string, GuessVerificationResultRecord>();
const winnerRecords = new Map<string, WinnerRecord>();
const creatorRewardRecords = new Map<string, CreatorRewardRecord>();
const voterRewardRecords = new Map<string, VoterRewardRecord>();
const claimRecords = new Map<string, ClaimRecord>();
const conversationDrafts = new Map<string, ConversationDraftRecord>();
const auditLogs = new Map<string, AuditLogRecord>();
const auditLogOrder: string[] = [];
let lastAuditLogHash: string | null = null;
const AUDIT_LOG_KINDS = new Set<AuditLogKind>([
  "compiler.validation",
  "guess.verification",
  "rule.election.proof",
  "rule.removal",
  "settlement.transition",
]);
const LOCAL_WEB_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\]|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;
const CORS_PATHS = new Set([
  "/draws",
  "/elections",
  "/guess-receipts",
  "/prize-pool-accounting",
  "/prize-pool-rollovers",
  "/turn-rollovers/settle",
  "/turn-rollovers/settlement",
  "/rule-precompilations",
  "/rule-preflight",
  "/rule-removals",
  "/rule-proposals",
  "/rule-validations",
  "/rule-validations/run",
  "/rule-votes",
  "/rule-elimination-votes",
  "/api/v1/turns",
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
  "/claim-records/expire-unclaimed",
  "/claim-records/request",
  "/settlement-transitions",
]);

function getGuessReceiptKey(turnId: number, player: string, sequence: number) {
  return `${turnId}:${player}:${sequence}`;
}

function getRuleProposalKey(turnId: number, ruleId: number) {
  return `${turnId}:${ruleId}`;
}

function getRuleVoteKey(
  turnId: number,
  ruleId: number,
  voter: string,
  sequence: number,
) {
  return `${turnId}:${ruleId}:${voter}:${sequence}`;
}

function getRuleEliminationVoteKey(
  turnId: number,
  ruleId: number,
  voter: string,
  sequence: number,
) {
  return `${turnId}:${ruleId}:${voter}:${sequence}`;
}

function getPaidRuleRemovalKey(
  turnId: number,
  ruleId: number,
  remover: string,
) {
  return `${turnId}:${ruleId}:${remover}`;
}

function getConversationDraftKey(
  wallet: string,
  turnId: number,
  prompt: string,
) {
  return hashJson({
    prompt: sanitizeRuleText(prompt).toLowerCase(),
    turnId,
    wallet,
  });
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
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
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

export function toPostgresAuditLogRow(
  record: AuditLogRecord,
): PostgresAuditLogRow {
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

export function listAuditLogs(
  args: {
    kind?: AuditLogKind;
    turnId?: number;
  } = {},
) {
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
  ruleEliminationVotes.clear();
  ruleEliminations.clear();
  paidRuleRemovals.clear();
  turnRollovers.clear();
  turnRolloverSettlements.clear();
  draws.clear();
  elections.clear();
  ruleElectionProofAuditLogs.clear();
  settlementTransitions.clear();
  settlementTransitionOrder.length = 0;
  ruleValidations.clear();
  verificationJobs.clear();
  verificationResults.clear();
  winnerRecords.clear();
  creatorRewardRecords.clear();
  voterRewardRecords.clear();
  claimRecords.clear();
  conversationDrafts.clear();
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
    const interpretation = await interpretRuleWithAgent(
      compileText,
      passConfig,
    );
    const astProvider: RuleAstProvider = async ({ prompt }) =>
      compileRuleToAst(prompt, passConfig);
    const validation = await compileRuleArtifact(
      {
        model,
        officialInterpretation: interpretation.officialInterpretation,
        originalText: sanitizedText,
        prompt: compileText,
        ruleId,
        tokenCount,
      },
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
  if (needsEscalation && escalationModel && pass.model !== escalationModel) {
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
    (receipt.sequence === undefined ||
      (Number.isInteger(receipt.sequence) && Number(receipt.sequence) > 0)) &&
    (receipt.feeLamports === undefined ||
      (Number.isInteger(receipt.feeLamports) && Number(receipt.feeLamports) >= 0)) &&
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

function isValidRuleElectionCandidateCommitment(
  value: unknown,
): value is RuleElectionCandidateCommitment {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Partial<RuleElectionCandidateCommitment>;
  return (
    Number.isInteger(candidate.ruleId) &&
    Number(candidate.ruleId) > 0 &&
    Number.isInteger(candidate.voteCount) &&
    Number(candidate.voteCount) >= 0 &&
    Number.isInteger(candidate.reportCount) &&
    Number(candidate.reportCount) >= 0 &&
    Number.isInteger(candidate.createdAtSeconds) &&
    isHexHash(candidate.sanitizedTextHash) &&
    isHexHash(candidate.compiledArtifactHash) &&
    typeof candidate.isEligibleState === "boolean" &&
    typeof candidate.isPrecompiledValid === "boolean"
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
    (proposal.sequence === undefined ||
      (Number.isInteger(proposal.sequence) && Number(proposal.sequence) > 0)) &&
    (proposal.feeLamports === undefined ||
      (Number.isInteger(proposal.feeLamports) && Number(proposal.feeLamports) >= 0)) &&
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
    Number.isInteger(vote.sequence) &&
    Number(vote.sequence) > 0 &&
    (vote.feeLamports === undefined ||
      (Number.isInteger(vote.feeLamports) && Number(vote.feeLamports) >= 0)) &&
    isBase58Like(vote.voter) &&
    isBase58Like(vote.ruleProposal) &&
    isBase58Like(vote.ruleVote) &&
    isBase58Like(vote.signature) &&
    typeof vote.submittedAt === "string" &&
    !Number.isNaN(Date.parse(vote.submittedAt))
  );
}

function isValidRuleEliminationVote(
  value: unknown,
): value is RuleEliminationVoteRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const vote = value as Partial<RuleEliminationVoteRecord>;
  return (
    Number.isInteger(vote.turnId) &&
    Number(vote.turnId) > 0 &&
    Number.isInteger(vote.ruleId) &&
    Number(vote.ruleId) > 0 &&
    Number.isInteger(vote.sequence) &&
    Number(vote.sequence) > 0 &&
    (vote.feeLamports === undefined ||
      (Number.isInteger(vote.feeLamports) && Number(vote.feeLamports) >= 0)) &&
    isBase58Like(vote.voter) &&
    isBase58Like(vote.ruleProposal) &&
    isBase58Like(vote.eliminationVote) &&
    isBase58Like(vote.signature) &&
    typeof vote.submittedAt === "string" &&
    !Number.isNaN(Date.parse(vote.submittedAt))
  );
}

function isValidPaidRuleRemoval(
  value: unknown,
): value is PaidRuleRemovalRecord {
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

function isValidConfidenceBreakdown(
  value: unknown,
): value is CompilerConfidenceBreakdown {
  if (!value || typeof value !== "object") {
    return false;
  }

  const confidence = value as Partial<
    Record<keyof CompilerConfidenceBreakdown, unknown>
  >;
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

function isValidConfidenceAction(
  value: unknown,
): value is RuleConfidenceAction {
  return value === "ACCEPT" || value === "ESCALATE" || value === "REJECT";
}

function isValidRuleAst(value: unknown) {
  return ruleAstSchema.safeParse(value).success;
}

function isValidCompiledArtifact(
  value: unknown,
): value is RuleCompiledArtifact {
  if (!value || typeof value !== "object") {
    return false;
  }

  const artifact = value as Partial<RuleCompiledArtifact>;

  return (
    (artifact.schemaVersion === 1 || artifact.schemaVersion === 2) &&
    isValidRuleAst(artifact.ast) &&
    typeof artifact.originalText === "string" &&
    artifact.originalText.length > 0 &&
    typeof artifact.normalizedText === "string" &&
    artifact.normalizedText.length > 0 &&
    typeof artifact.officialInterpretation === "string" &&
    artifact.officialInterpretation.length > 0 &&
    typeof artifact.createdAt === "string" &&
    !Number.isNaN(Date.parse(artifact.createdAt)) &&
    typeof artifact.promptContractVersion === "string" &&
    artifact.promptContractVersion.length > 0 &&
    typeof artifact.skillVersion === "string" &&
    artifact.skillVersion.length > 0 &&
    typeof artifact.testHarnessVersion === "string" &&
    artifact.testHarnessVersion.length > 0 &&
    Array.isArray(artifact.generatedTestCases) &&
    Array.isArray(artifact.evaluatedTestCases) &&
    Array.isArray(artifact.harnessCases) &&
    typeof artifact.testCoverageScore === "number" &&
    artifact.testCoverageScore >= 0 &&
    artifact.testCoverageScore <= 1
  );
}

function isValidRuleValidation(value: unknown): value is RuleValidationRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Partial<RuleValidationRecord>;
  const validDecision =
    record.decision === "VALID" || record.decision === "INVALID";

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
    (record.compiledArtifactHash === null ||
      isHexHash(record.compiledArtifactHash)) &&
    (record.compiledArtifact == null ||
      isValidCompiledArtifact(record.compiledArtifact)) &&
    (record.compiledArtifact && record.compiledArtifactHash
      ? hashJson(record.compiledArtifact) === record.compiledArtifactHash
      : true) &&
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
    (identity.quantization === null ||
      typeof identity.quantization === "string") &&
    typeof identity.serving_engine === "string" &&
    identity.serving_engine.length > 0
  );
}

function isValidProviderAttemptLog(
  value: unknown,
): value is AgentProviderAttemptLog {
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

function isValidExpiredUnclaimedClaimRequest(value: unknown): value is {
  currentTurnId: number;
  settledAt?: string;
  sourceTurnId: number;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as {
    currentTurnId?: unknown;
    settledAt?: unknown;
    sourceTurnId?: unknown;
  };
  return (
    Number.isInteger(request.sourceTurnId) &&
    Number(request.sourceTurnId) > 0 &&
    Number.isInteger(request.currentTurnId) &&
    Number(request.currentTurnId) > Number(request.sourceTurnId) &&
    (request.settledAt === undefined ||
      (typeof request.settledAt === "string" &&
        !Number.isNaN(Date.parse(request.settledAt))))
  );
}

export interface SettlementTransitionRequest {
  fromState: string;
  idempotencyKey: string;
  inputHash: string;
  outputHash: string;
  recordedAt?: string;
  signature?: string | null;
  toState: string;
  transitionReason: string;
  turnId: number;
}

function isValidSettlementTransitionRequest(
  value: unknown,
): value is SettlementTransitionRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as Partial<SettlementTransitionRequest>;
  return (
    Number.isInteger(request.turnId) &&
    Number(request.turnId) > 0 &&
    typeof request.fromState === "string" &&
    request.fromState.length > 0 &&
    request.fromState.length <= 64 &&
    typeof request.toState === "string" &&
    request.toState.length > 0 &&
    request.toState.length <= 64 &&
    typeof request.idempotencyKey === "string" &&
    request.idempotencyKey.length > 0 &&
    request.idempotencyKey.length <= 256 &&
    isHexHash(request.inputHash) &&
    isHexHash(request.outputHash) &&
    typeof request.transitionReason === "string" &&
    request.transitionReason.length > 0 &&
    request.transitionReason.length <= 256 &&
    (request.signature === undefined ||
      request.signature === null ||
      (typeof request.signature === "string" &&
        request.signature.length <= 128)) &&
    (request.recordedAt === undefined ||
      (typeof request.recordedAt === "string" &&
        !Number.isNaN(Date.parse(request.recordedAt))))
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

function isValidClaimCompleteRequest(value: unknown): value is {
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

function isValidConversationDraft(value: unknown): value is Omit<
  ConversationDraftRecord,
  "createdAt" | "draftId" | "updatedAt"
> & {
  createdAt?: string;
  draftId?: string;
  updatedAt?: string;
} {
  if (!value || typeof value !== "object") {
    return false;
  }

  const draft = value as Partial<ConversationDraftRecord>;
  const sanitizedPrompt =
    typeof draft.prompt === "string" ? sanitizeRuleText(draft.prompt) : "";
  const tokenCount = countRuleTokens(sanitizedPrompt);

  return (
    isBase58Like(draft.wallet) &&
    Number.isInteger(draft.turnId) &&
    Number(draft.turnId) > 0 &&
    typeof draft.prompt === "string" &&
    sanitizedPrompt === draft.prompt &&
    sanitizedPrompt.length > 0 &&
    Buffer.byteLength(sanitizedPrompt, "utf8") <= MAX_RULE_TEXT_BYTES &&
    Number.isInteger(draft.tokenCount) &&
    Number(draft.tokenCount) === tokenCount &&
    tokenCount > 0 &&
    tokenCount <= RULE_MAX_TOKENS &&
    (draft.status === "draft" || draft.status === "submitted") &&
    (draft.ruleId === null ||
      (Number.isInteger(draft.ruleId) && Number(draft.ruleId) > 0)) &&
    (draft.normalizedText === null ||
      typeof draft.normalizedText === "string") &&
    (draft.officialInterpretation === null ||
      typeof draft.officialInterpretation === "string") &&
    typeof draft.lastMessage === "string" &&
    Buffer.byteLength(draft.lastMessage, "utf8") <= MAX_RULE_TEXT_BYTES &&
    (draft.createdAt === undefined ||
      (typeof draft.createdAt === "string" &&
        !Number.isNaN(Date.parse(draft.createdAt)))) &&
    (draft.updatedAt === undefined ||
      (typeof draft.updatedAt === "string" &&
        !Number.isNaN(Date.parse(draft.updatedAt))))
  );
}

function isValidVerificationOutcome(
  value: unknown,
): value is VerificationOutcome {
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
    (result.sequence === undefined ||
      (Number.isInteger(result.sequence) && Number(result.sequence) > 0)) &&
    (result.activeRuleId === null ||
      (Number.isInteger(result.activeRuleId) &&
        Number(result.activeRuleId) > 0)) &&
    isValidRuleVerificationResult(result.original) &&
    (result.alternative === null ||
      isValidRuleVerificationResult(result.alternative)) &&
    typeof result.completedAt === "string" &&
    !Number.isNaN(Date.parse(result.completedAt))
  );
}

function isValidRuleValidationRunRequest(
  value: unknown,
): value is {
  model?: string;
  provider?: string;
  ruleId: number;
  turnId: number;
} {
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
      (Number.isInteger(record.activeRuleId) &&
        Number(record.activeRuleId) > 0)) &&
    (record.eligibleCandidateCommitments === undefined ||
      (Array.isArray(record.eligibleCandidateCommitments) &&
        record.eligibleCandidateCommitments.every(
          isValidRuleElectionCandidateCommitment,
        ))) &&
    Number.isInteger(record.electedFinalistIndex) &&
    Number(record.electedFinalistIndex) >= 0 &&
    (record.electedSurvivorIndex === undefined ||
      record.electedSurvivorIndex === null ||
      (Number.isInteger(record.electedSurvivorIndex) &&
        Number(record.electedSurvivorIndex) >= 0)) &&
    isPositiveIntegerArray(record.eligibleRuleIds) &&
    isPositiveIntegerArray(record.topVotedRuleIds) &&
    isPositiveIntegerArray(record.randomRuleIds) &&
    isPositiveIntegerArray(record.finalistRuleIds) &&
    (record.eliminatedRuleIds === undefined ||
      isPositiveIntegerArray(record.eliminatedRuleIds)) &&
    (record.survivorRuleIds === undefined ||
      isPositiveIntegerArray(record.survivorRuleIds)) &&
    isHexHash(record.eligibleRulePoolHash) &&
    isHexHash(record.topVotedFinalistHash) &&
    isHexHash(record.randomFinalistHash) &&
    isHexHash(record.finalistSetHash) &&
    (record.eliminatedFinalistHash === undefined ||
      record.eliminatedFinalistHash === null ||
      isHexHash(record.eliminatedFinalistHash)) &&
    (record.survivorFinalistHash === undefined ||
      record.survivorFinalistHash === null ||
      isHexHash(record.survivorFinalistHash)) &&
    (record.activeRuleHash === null || isHexHash(record.activeRuleHash)) &&
    (record.activeRuleArtifactHash === null ||
      isHexHash(record.activeRuleArtifactHash)) &&
    (record.randomnessAccount === null ||
      isBase58Like(record.randomnessAccount)) &&
    (record.randomnessSource === null ||
      isBase58Like(record.randomnessSource)) &&
    (record.randomnessValue === null || isHexHash(record.randomnessValue)) &&
    (record.activeElectionRandomnessAccount === undefined ||
      record.activeElectionRandomnessAccount === null ||
      isBase58Like(record.activeElectionRandomnessAccount)) &&
    (record.activeElectionRandomnessSource === undefined ||
      record.activeElectionRandomnessSource === null ||
      isBase58Like(record.activeElectionRandomnessSource)) &&
    (record.activeElectionRandomnessValue === undefined ||
      record.activeElectionRandomnessValue === null ||
      isHexHash(record.activeElectionRandomnessValue)) &&
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
  const sequence =
    receipt.sequence ??
    [...guessReceipts.values()].filter(
      (candidate) =>
        candidate.turnId === receipt.turnId && candidate.player === receipt.player,
    ).length + 1;
  const saved = {
    ...receipt,
    sequence,
    feeLamports:
      receipt.feeLamports ??
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: solToLamports(MVP_FEES_SOL.guessSubmission),
        sequence,
        turnId: receipt.turnId,
      }),
  };
  guessReceipts.set(
    getGuessReceiptKey(saved.turnId, saved.player, saved.sequence),
    saved,
  );
  return saved;
}

export function getGuessReceipt(turnId: number, player: string) {
  return (
    [...guessReceipts.values()]
      .filter((receipt) => receipt.turnId === turnId && receipt.player === player)
      .sort((left, right) => (right.sequence ?? 0) - (left.sequence ?? 0))[0] ??
    null
  );
}

function getGuessReceiptBySequence(
  turnId: number,
  player: string,
  sequence: number,
) {
  return guessReceipts.get(getGuessReceiptKey(turnId, player, sequence)) ?? null;
}

export function saveRuleProposal(proposal: RuleProposalRecord) {
  const sequence =
    proposal.sequence ??
    [...ruleProposals.values()].filter(
      (candidate) =>
        candidate.turnId === proposal.turnId &&
        candidate.proposer === proposal.proposer,
    ).length + 1;
  const normalizedProposal = {
    ...proposal,
    compiledArtifactHash: proposal.compiledArtifactHash ?? null,
    feeLamports:
      proposal.feeLamports ??
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: solToLamports(MVP_FEES_SOL.ruleProposal),
        sequence,
        turnId: proposal.turnId,
      }),
    precompilationStatus: proposal.precompilationStatus ?? "pending",
    sequence,
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
  const sequence =
    vote.sequence ??
    [...ruleVotes.values()].filter(
      (candidate) =>
        candidate.turnId === vote.turnId &&
        candidate.ruleId === vote.ruleId &&
        candidate.voter === vote.voter,
    ).length + 1;
  const saved = {
    ...vote,
    sequence,
    feeLamports:
      vote.feeLamports ??
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: solToLamports(MVP_FEES_SOL.vote),
        sequence,
        turnId: vote.turnId,
      }),
  };
  ruleVotes.set(
    getRuleVoteKey(saved.turnId, saved.ruleId, saved.voter, saved.sequence),
    saved,
  );
  return saved;
}

export function saveRuleEliminationVote(vote: RuleEliminationVoteRecord) {
  const sequence =
    vote.sequence ??
    [...ruleEliminationVotes.values()].filter(
      (candidate) =>
        candidate.turnId === vote.turnId &&
        candidate.ruleId === vote.ruleId &&
        candidate.voter === vote.voter,
    ).length + 1;
  const saved = {
    ...vote,
    sequence,
    feeLamports:
      vote.feeLamports ??
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: solToLamports(MVP_FEES_SOL.vote),
        sequence,
        turnId: vote.turnId,
      }),
  };
  ruleEliminationVotes.set(
    getRuleEliminationVoteKey(
      saved.turnId,
      saved.ruleId,
      saved.voter,
      saved.sequence,
    ),
    saved,
  );
  return saved;
}

export function saveRuleElimination(record: RuleEliminationRecord) {
  ruleEliminations.set(record.turnId, record);
  return record;
}

export function savePaidRuleRemoval(removal: PaidRuleRemovalRecord) {
  paidRuleRemovals.set(
    getPaidRuleRemovalKey(removal.turnId, removal.ruleId, removal.remover),
    removal,
  );
  return removal;
}

// A rule is considered removed (and excluded from election) once any paid
// removal record exists for it, regardless of who removed it.
export function isRuleRemoved(turnId: number, ruleId: number): boolean {
  for (const removal of paidRuleRemovals.values()) {
    if (removal.turnId === turnId && removal.ruleId === ruleId) {
      return true;
    }
  }
  return false;
}

// Enforces the PRD §6.11 paid-removal protections, then records the removal and
// appends a hash-chained audit log. Throws RuleRemovalRejectedError when a
// protection blocks the removal so the API responds with a typed error instead
// of silently storing an invalid removal.
export function removeRule(input: PaidRuleRemovalRecord): {
  auditLog: AuditLogRecord;
  removal: PaidRuleRemovalRecord;
} {
  const proposal = ruleProposals.get(
    getRuleProposalKey(input.turnId, input.ruleId),
  );
  if (!proposal) {
    throw new RuleRemovalRejectedError(
      "RULE_NOT_FOUND",
      "No proposed rule matches this turn and rule id.",
    );
  }

  // Removal is closed once the eligible rule pool is locked (election started),
  // because the rule may already be a finalist (PRD §6.11).
  if (getRuleElection(input.turnId)) {
    throw new RuleRemovalRejectedError(
      "RULE_REMOVAL_WINDOW_CLOSED",
      "Paid rule removal is closed once the eligible rule pool is locked.",
    );
  }

  // Already removed — idempotent block (covers duplicate + already-removed).
  if (isRuleRemoved(input.turnId, input.ruleId)) {
    throw new RuleRemovalRejectedError(
      "RULE_ALREADY_REMOVED",
      "This rule has already been removed.",
    );
  }

  // Only still-live proposals (proposed/eligible) can be removed by paid action.
  const state = proposal.state ?? "proposed";
  if (state === "invalidated") {
    throw new RuleRemovalRejectedError(
      "RULE_NOT_REMOVABLE",
      "An invalidated rule cannot be removed by paid action.",
    );
  }

  // Differentiated vote-threshold protection.
  const voteCount =
    listRuleVotes(input.turnId).counts[String(input.ruleId)] ?? 0;
  const isCreator = proposal.proposer === input.remover;
  const removalKind: PaidRuleRemovalRecord["removalKind"] = isCreator
    ? "creator_self"
    : "third_party";
  const threshold = isCreator
    ? RULE_REMOVAL_CONFIG.minVotesCreatorSelfRemove
    : RULE_REMOVAL_CONFIG.minVotesThirdPartyRemove;
  if (voteCount >= threshold) {
    throw new RuleRemovalRejectedError(
      "RULE_REMOVAL_PROTECTED",
      isCreator
        ? "The creator cannot remove a rule that already has community support."
        : "This rule has too much community support to be removed by a third party.",
      { threshold, voteCount },
    );
  }

  const feeLamports = solToLamports(MVP_FEES_SOL.paidRuleRemoval);
  const removal: PaidRuleRemovalRecord = {
    ...input,
    feeLamports,
    removalKind,
    voteCountAtRemoval: voteCount,
  };
  savePaidRuleRemoval(removal);

  const auditLog = appendAuditLog({
    createdAt: input.removedAt,
    input: {
      remover: input.remover,
      ruleId: input.ruleId,
      threshold,
      turnId: input.turnId,
      voteCount,
    },
    kind: "rule.removal",
    output: {
      feeDestination: RULE_REMOVAL_CONFIG.removalFeeDestination,
      feeLamports,
      removalKind,
      ruleRemoval: input.ruleRemoval,
    },
    player: input.remover,
    publicStateRef: {
      key: getPaidRuleRemovalKey(input.turnId, input.ruleId, input.remover),
      type: "rule_removal",
    },
    reason: "Paid rule removal recorded after protection checks.",
    result: "removed_paid",
    ruleId: input.ruleId,
    turnId: input.turnId,
  });

  return { auditLog, removal };
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

export function listRuleEliminationVotes(turnId: number) {
  const votes = [...ruleEliminationVotes.values()].filter(
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
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify((value as AstRecord)[key])}`,
      )
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
    const flattened = raw.map(canonicalizeNode).flatMap((clause) => {
      const c = clause as AstRecord;
      return c && c.kind === kind && Array.isArray(c.clauses)
        ? c.clauses
        : [clause];
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
    const operands = [
      canonicalizeNode(node.left),
      canonicalizeNode(node.right),
    ].sort((a, b) => stableStringify(a).localeCompare(stableStringify(b)));
    return { ...node, left: operands[0], right: operands[1] };
  }

  const out: AstRecord = { ...node };
  for (const field of [
    "of",
    "left",
    "right",
    "clause",
    "predicate",
    "score",
    "guard",
  ]) {
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
  return createHash("sha256")
    .update(stableStringify(canonical), "utf8")
    .digest("hex");
}

// Signatures of every rule that has held a mandate (was the elected active rule
// in a settled election). Computed from stored elections + their compiled ASTs.
export function getMandatedRuleSignatures(): Set<string> {
  const signatures = new Set<string>();
  for (const election of elections.values()) {
    if (election.status !== "settled" || election.activeRuleId === null) {
      continue;
    }
    const validation = getRuleValidation(
      election.turnId,
      election.activeRuleId,
    );
    const ast = validation?.compiledArtifact?.ast;
    if (ast) {
      signatures.add(ruleSignature(ast));
    }
  }
  return signatures;
}

function getVerificationResultKey(turnId: number, player: string, sequence = 1) {
  return `${turnId}:${player}:${sequence}`;
}

function listGuessReceipts(turnId: number) {
  return [...guessReceipts.values()].filter(
    (receipt) => receipt.turnId === turnId,
  );
}

function listVerificationJobs(turnId: number) {
  return [...verificationJobs.values()].filter((job) => job.turnId === turnId);
}

function listVerificationResults(turnId: number) {
  return [...verificationResults.values()].filter(
    (result) => result.turnId === turnId,
  );
}

function getWinnerRecordKey(
  turnId: number,
  category: WinnerCategory,
  resultId: string,
) {
  return `${turnId}:${category}:${resultId}`;
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
      activeRuleId:
        args.category === "alternative" ? result.activeRuleId : null,
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
      getWinnerRecordKey(record.turnId, record.category, record.resultId),
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
    voters.length === 0
      ? 0
      : Math.floor(finalVoterPoolLamports / voters.length);
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
      status:
        individualVoterRewardLamports > 0 ? "calculated" : "not_available",
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
    const activeRuleId =
      creator?.activeRuleId ?? voters[0]?.activeRuleId ?? null;
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
  const statusReason = isClaimable ? "CLAIM_AVAILABLE" : "PAYOUT_BELOW_MINIMUM";

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
  const winnerClaimsByWallet = new Map<
    string,
    {
      activeRuleId: number | null;
      amountLamports: number;
      category: WinnerCategory | null;
      wallet: string;
    }
  >();
  for (const winner of winners.records) {
    const current = winnerClaimsByWallet.get(winner.player);
    if (!current) {
      winnerClaimsByWallet.set(winner.player, {
        activeRuleId: winner.activeRuleId,
        amountLamports: winner.payoutLamports,
        category: winner.category,
        wallet: winner.player,
      });
      continue;
    }
    current.amountLamports += winner.payoutLamports;
    current.category =
      current.category === winner.category ? current.category : null;
    current.activeRuleId =
      current.activeRuleId === winner.activeRuleId ? current.activeRuleId : null;
  }
  const claimableRecords = [
    ...[...winnerClaimsByWallet.values()].map((winner) =>
      createClaimRecord({
        activeRuleId: winner.activeRuleId,
        amountLamports: winner.amountLamports,
        availableAt,
        category: winner.category,
        kind: "winner_payout" as const,
        turnId,
        wallet: winner.wallet,
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

export function listClaimRecords(
  args: {
    turnId?: number;
    wallet?: string;
  } = {},
) {
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

export interface PlayerClaimsSummary {
  availableLamports: number;
  claimedLamports: number;
  failedLamports: number;
  pendingLamports: number;
  records: ClaimRecord[];
  totalLamports: number;
  unavailableLamports: number;
  wallet: string;
}

/// Aggregate every claim record for a wallet across all turns, for the player
/// rewards-history surface. Ordered by turn then claim id (see listClaimRecords).
export function getPlayerClaimsSummary(wallet: string): PlayerClaimsSummary {
  const records = listClaimRecords({ wallet });
  const sumByStatus = (status: ClaimRecordStatus) =>
    records
      .filter((record) => record.status === status)
      .reduce((total, record) => total + record.amountLamports, 0);

  return {
    availableLamports: sumByStatus("available"),
    claimedLamports: sumByStatus("claimed"),
    failedLamports: sumByStatus("failed"),
    pendingLamports: sumByStatus("pending_wallet_approval"),
    records,
    totalLamports: records.reduce(
      (total, record) => total + record.amountLamports,
      0,
    ),
    unavailableLamports: sumByStatus("unavailable"),
    wallet,
  };
}

function isClaimWindowExpired(
  record: ClaimRecord,
  args: { currentTurnId: number; settledAt: string },
) {
  return (
    args.currentTurnId >= record.turnId + record.claimWindowTurns ||
    Date.parse(args.settledAt) >= Date.parse(record.claimWindowExpiresAt)
  );
}

export function settleExpiredUnclaimedClaims(args: {
  currentTurnId: number;
  settledAt?: string;
  sourceTurnId: number;
}): ExpiredUnclaimedClaimSettlement {
  assertNonNegativeSafeInteger(args.sourceTurnId, "source_turn_id");
  assertNonNegativeSafeInteger(args.currentTurnId, "current_turn_id");
  if (args.sourceTurnId <= 0 || args.currentTurnId <= args.sourceTurnId) {
    throw new Error("INVALID_CLAIM_EXPIRY_TURN");
  }

  const settledAt = args.settledAt ?? new Date().toISOString();
  const expirableStatuses = new Set<ClaimRecordStatus>([
    "available",
    "failed",
    "pending_wallet_approval",
  ]);
  const expiredClaims = listClaimRecords({ turnId: args.sourceTurnId })
    .filter(
      (record) =>
        record.kind === "winner_payout" &&
        record.category !== null &&
        expirableStatuses.has(record.status) &&
        isClaimWindowExpired(record, {
          currentTurnId: args.currentTurnId,
          settledAt,
        }),
    )
    .map((record): ExpiredUnclaimedClaimRollover => {
      const walletApprovalPending = record.walletApproval.state === "pending";
      const updated: ClaimRecord = {
        ...record,
        status: "unavailable",
        statusReason: "CLAIM_WINDOW_EXPIRED",
        updatedAt: settledAt,
        walletApproval: {
          ...record.walletApproval,
          completedAt: walletApprovalPending
            ? settledAt
            : record.walletApproval.completedAt,
          failureReason: walletApprovalPending
            ? "CLAIM_WINDOW_EXPIRED"
            : record.walletApproval.failureReason,
          state: walletApprovalPending ? "failed" : record.walletApproval.state,
        },
      };
      saveClaimRecord(updated);
      return {
        amountLamports: record.amountLamports,
        category: record.category as WinnerCategory,
        claimId: record.claimId,
        wallet: record.wallet,
      };
    });

  const originalRolloverLamports = expiredClaims
    .filter((claim) => claim.category === "original")
    .reduce((total, claim) => total + claim.amountLamports, 0);
  const alternativeRolloverLamports = expiredClaims
    .filter((claim) => claim.category === "alternative")
    .reduce((total, claim) => total + claim.amountLamports, 0);
  const existingRollover = getTurnRollover(args.currentTurnId);

  if (originalRolloverLamports > 0 || alternativeRolloverLamports > 0) {
    saveTurnRollover({
      alternativeRolloverLamports:
        (existingRollover?.alternativeRolloverLamports ?? 0) +
        alternativeRolloverLamports,
      originalRolloverLamports:
        (existingRollover?.originalRolloverLamports ?? 0) +
        originalRolloverLamports,
      recordedAt: settledAt,
      sourceTurnId: args.sourceTurnId,
      turnId: args.currentTurnId,
    });
  }

  return {
    alternativeRolloverLamports,
    currentTurnId: args.currentTurnId,
    expiredClaims,
    originalRolloverLamports,
    settledAt,
    sourceTurnId: args.sourceTurnId,
    totalRolloverLamports:
      originalRolloverLamports + alternativeRolloverLamports,
  };
}

function getClaimTitle(kind: ClaimKind) {
  if (kind === "winner_payout") {
    return "Prize claim";
  }
  if (kind === "creator_reward") {
    return "Creator reward";
  }
  return "Voter reward";
}

function compareHistoryEvents(
  left: PlayerHistoryEvent,
  right: PlayerHistoryEvent,
) {
  const timeDelta = Date.parse(right.createdAt) - Date.parse(left.createdAt);
  return timeDelta !== 0 ? timeDelta : right.id.localeCompare(left.id);
}

export function listPlayerHistory(args: {
  cursor?: string | null;
  limit?: number;
  wallet: string;
}): PlayerHistoryPage {
  const safeLimit = Math.min(Math.max(args.limit ?? 25, 1), 100);
  const offset = args.cursor ? Number(args.cursor) : 0;
  const start = Number.isInteger(offset) && offset > 0 ? offset : 0;
  const events: PlayerHistoryEvent[] = [
    ...[...guessReceipts.values()]
      .filter((receipt) => receipt.player === args.wallet)
      .map(
        (receipt): PlayerHistoryEvent => ({
          createdAt: receipt.submittedAt,
          id: `guess:${receipt.turnId}:${receipt.player}`,
          status: "submitted",
          summary: `Numbers ${receipt.numbers.join(", ")}`,
          title: "Guess submitted",
          turnId: receipt.turnId,
          type: "guess",
        }),
      ),
    ...[...ruleProposals.values()]
      .filter((proposal) => proposal.proposer === args.wallet)
      .map(
        (proposal): PlayerHistoryEvent => ({
          createdAt: proposal.submittedAt,
          id: `rule:${proposal.turnId}:${proposal.ruleId}`,
          ruleId: proposal.ruleId,
          status: proposal.state ?? "proposed",
          summary: proposal.sanitizedText,
          title: proposal.title,
          turnId: proposal.turnId,
          type: "rule_proposal",
        }),
      ),
    ...[...ruleVotes.values()]
      .filter((vote) => vote.voter === args.wallet)
      .map(
        (vote): PlayerHistoryEvent => ({
          createdAt: vote.submittedAt,
          id: `vote:${vote.turnId}:${vote.ruleId}:${vote.voter}`,
          ruleId: vote.ruleId,
          status: "cast",
          summary: `Voted for rule #${vote.ruleId}.`,
          title: "Rule vote",
          turnId: vote.turnId,
          type: "vote",
        }),
      ),
    ...[...ruleEliminationVotes.values()]
      .filter((vote) => vote.voter === args.wallet)
      .map(
        (vote): PlayerHistoryEvent => ({
          createdAt: vote.submittedAt,
          id: `elimination:${vote.turnId}:${vote.ruleId}:${vote.voter}`,
          ruleId: vote.ruleId,
          status: "cast",
          summary: `Voted to eliminate rule #${vote.ruleId}.`,
          title: "Elimination vote",
          turnId: vote.turnId,
          type: "elimination_vote",
        }),
      ),
    ...listClaimRecords({ wallet: args.wallet }).map(
      (claim): PlayerHistoryEvent => ({
        amountLamports: claim.amountLamports,
        createdAt: claim.claimedAt ?? claim.updatedAt,
        id: `claim:${claim.claimId}`,
        ...(claim.activeRuleId === null ? {} : { ruleId: claim.activeRuleId }),
        status: claim.status,
        summary: claim.statusReason,
        title: getClaimTitle(claim.kind),
        turnId: claim.turnId,
        type: "claim",
      }),
    ),
  ].sort(compareHistoryEvents);

  const page = events.slice(start, start + safeLimit);
  const nextOffset = start + page.length;

  return {
    cursor: args.cursor ?? null,
    events: page,
    limit: safeLimit,
    nextCursor: nextOffset < events.length ? String(nextOffset) : null,
    wallet: args.wallet,
  };
}

export function saveConversationDraft(
  draft: Omit<
    ConversationDraftRecord,
    "createdAt" | "draftId" | "updatedAt"
  > & {
    createdAt?: string;
    draftId?: string;
    updatedAt?: string;
  },
) {
  const draftId =
    draft.draftId ??
    getConversationDraftKey(draft.wallet, draft.turnId, draft.prompt);
  const existing = conversationDrafts.get(draftId);
  const updatedAt = draft.updatedAt ?? new Date().toISOString();
  const record: ConversationDraftRecord = {
    ...draft,
    createdAt: existing?.createdAt ?? draft.createdAt ?? updatedAt,
    draftId,
    updatedAt,
  };
  conversationDrafts.set(draftId, record);
  return record;
}

export function listConversationDrafts(wallet: string) {
  return [...conversationDrafts.values()]
    .filter((draft) => draft.wallet === wallet)
    .sort(
      (left, right) =>
        Date.parse(right.updatedAt) - Date.parse(left.updatedAt) ||
        right.draftId.localeCompare(left.draftId),
    );
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
      signature: failed ? null : (args.signature ?? null),
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
  if (!election.activeRuleArtifactHash) {
    throw new Error("ACTIVE_RULE_ARTIFACT_NOT_FROZEN");
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
    sequence: args.receipt.sequence ?? 1,
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
    args.receipt.sequence ?? 1,
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
    guess_sequence: String(args.receipt.sequence ?? 1),
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

export function saveGuessVerificationResult(
  result: GuessVerificationResultRecord,
) {
  const job = [...verificationJobs.values()].find(
    (candidate) => candidate.id === result.jobId,
  );
  if (!job) {
    throw new Error("VERIFICATION_JOB_NOT_FOUND");
  }

  if (job.turnId !== result.turnId || job.payload.wallet !== result.player) {
    throw new Error("VERIFICATION_RESULT_JOB_MISMATCH");
  }
  const sequence = result.sequence ?? Number(job.payload.guess_sequence);

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
    sequence,
    auditLogHash: auditLog.logHash,
  };

  verificationJobs.set(job.idempotencyKey, updatedJob);
  verificationResults.set(
    getVerificationResultKey(result.turnId, result.player, sequence),
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
      guessSequence: Number(job.payload.guess_sequence),
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
      key: getVerificationResultKey(
        result.turnId,
        result.player,
        result.sequence ?? Number(job.payload.guess_sequence),
      ),
      type: "guess_verification_result",
    },
    reason: [
      `original:${result.original.result}`,
      `alternative:${result.alternative?.result ?? "NONE"}`,
    ].join(";"),
    result:
      result.alternative?.result === "WIN" || result.original.result === "WIN"
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
  const proposal = ruleProposals.get(
    getRuleProposalKey(args.turnId, args.ruleId),
  );
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
    officialInterpretation: proposal.officialInterpretation,
    originalText: proposal.sanitizedText,
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
  const existing = elections.get(election.turnId);
  const normalized: RuleElectionRecord = {
    ...election,
    activeElectionRandomnessAccount:
      election.activeElectionRandomnessAccount ??
      existing?.activeElectionRandomnessAccount ??
      null,
    activeElectionRandomnessSource:
      election.activeElectionRandomnessSource ??
      existing?.activeElectionRandomnessSource ??
      null,
    activeElectionRandomnessValue:
      election.activeElectionRandomnessValue ??
      existing?.activeElectionRandomnessValue ??
      null,
    eligibleCandidateCommitments:
      election.eligibleCandidateCommitments ??
      existing?.eligibleCandidateCommitments ??
      [],
    randomnessAccount:
      election.randomnessAccount ?? existing?.randomnessAccount ?? null,
    randomnessSource:
      election.randomnessSource ?? existing?.randomnessSource ?? null,
    randomnessValue:
      election.randomnessValue ?? existing?.randomnessValue ?? null,
  };
  elections.set(normalized.turnId, normalized);
  appendRuleElectionProofAuditLog(normalized);
  return normalized;
}

export function getRuleElection(turnId: number) {
  return elections.get(turnId) ?? null;
}

function appendRuleElectionProofAuditLog(
  election: RuleElectionRecord,
): AuditLogRecord | null {
  if (election.status !== "settled" && election.status !== "original_only") {
    return null;
  }

  const proof = buildRuleElectionProof(election);
  const inputHash = hashJson(proof.input);
  const outputHash = hashJson(proof.output);
  const existingLogHash = ruleElectionProofAuditLogs.get(election.turnId);
  if (existingLogHash) {
    const existing = getAuditLog(existingLogHash);
    if (
      existing?.inputHash === inputHash &&
      existing.outputHash === outputHash
    ) {
      return existing;
    }
    throw new Error("RULE_ELECTION_PROOF_ALREADY_RECORDED");
  }

  const auditLog = appendAuditLog({
    createdAt: election.settledAt ?? new Date().toISOString(),
    input: proof.input,
    kind: "rule.election.proof",
    output: proof.output,
    publicStateRef: {
      key: String(election.turnId),
      type: "rule_election",
    },
    reason:
      election.status === "original_only"
        ? "No eligible alternative rule existed for this turn."
        : "Finalist and active-rule election proof is publicly recomputable from commitments and Switchboard VRF fulfillment.",
    result: election.status,
    ruleId: election.activeRuleId,
    turnId: election.turnId,
  });
  ruleElectionProofAuditLogs.set(election.turnId, auditLog.logHash);
  return auditLog;
}

function buildRuleElectionProof(election: RuleElectionRecord) {
  if (election.status === "settled" && election.activeRuleId !== null) {
    const missing = [
      ["randomnessAccount", election.randomnessAccount],
      ["randomnessSource", election.randomnessSource],
      ["randomnessValue", election.randomnessValue],
      [
        "activeElectionRandomnessAccount",
        election.activeElectionRandomnessAccount,
      ],
      [
        "activeElectionRandomnessSource",
        election.activeElectionRandomnessSource,
      ],
      ["activeElectionRandomnessValue", election.activeElectionRandomnessValue],
    ]
      .filter(([, value]) => !value)
      .map(([field]) => field);

    if (missing.length > 0) {
      throw new Error(`RULE_ELECTION_PROOF_INCOMPLETE:${missing.join(",")}`);
    }
  }

  return {
    input: {
      algorithms: {
        activeSurvivorSelection:
          "sha256(randomness || turn_id_le_u64 || counter_le_u64 || 'active_survivor_v1'), read u64 chunks little-endian, reject values outside the largest unbiased u64 range, choose value % survivor_count",
        eligiblePoolHash:
          "sha256('eligible_pool_v1' || len_le_u64 || repeated(rule_id_le_u64, vote_count_le_u32, created_at_le_i64, sanitized_text_hash_32, compiled_artifact_hash_32))",
        finalistSetHash:
          "sha256('<domain>' || len_le_u64 || repeated(rule_id_le_u64)) for top_finalists_v1, random_finalists_v1, finalist_set_v1, survivor_finalists_v1",
        randomFinalistSelection:
          "sha256(randomness || turn_id_le_u64 || counter_le_u64 || 'random_finalists_v1'), read u64 chunks little-endian, reject values outside the largest unbiased u64 range, skip top-voted indices and already selected indices",
      },
      commitments: {
        eligibleRulePoolHash: election.eligibleRulePoolHash,
        eliminatedFinalistHash: election.eliminatedFinalistHash ?? null,
        finalistSetHash: election.finalistSetHash,
        randomFinalistHash: election.randomFinalistHash,
        survivorFinalistHash: election.survivorFinalistHash ?? null,
        topVotedFinalistHash: election.topVotedFinalistHash,
      },
      finalistElection: {
        randomnessAccount: election.randomnessAccount,
        randomnessSource: election.randomnessSource,
        randomnessValue: election.randomnessValue,
      },
      activeElection: {
        randomnessAccount: election.activeElectionRandomnessAccount ?? null,
        randomnessSource: election.activeElectionRandomnessSource ?? null,
        randomnessValue: election.activeElectionRandomnessValue ?? null,
      },
      noDeterministicFallback: true,
      candidateCommitments: election.eligibleCandidateCommitments ?? [],
      ruleSets: {
        eligibleRuleIds: election.eligibleRuleIds,
        eliminatedRuleIds: election.eliminatedRuleIds ?? [],
        finalistRuleIds: election.finalistRuleIds,
        randomRuleIds: election.randomRuleIds,
        survivorRuleIds: election.survivorRuleIds ?? [],
        topVotedRuleIds: election.topVotedRuleIds,
      },
      schema: "m9_0_rule_election_proof_v1",
      status: election.status,
      turnId: election.turnId,
    },
    output: {
      activeRuleArtifactHash: election.activeRuleArtifactHash,
      activeRuleHash: election.activeRuleHash,
      activeRuleId: election.activeRuleId,
      electedFinalistIndex: election.electedFinalistIndex,
      electedSurvivorIndex: election.electedSurvivorIndex ?? null,
      recomputableFromPublicProof: true,
    },
  };
}

/**
 * Idempotently record a settlement state-machine transition (PRD §5.5). A
 * repeated `idempotencyKey` is a no-op that returns the original record, so a
 * worker retry never appends a duplicate audit-chain entry. The first time a
 * key is seen the transition is chained into the M3.7 hash-chained audit log
 * with its `inputHash`/`outputHash`/`transitionReason` preserved.
 */
export function recordSettlementTransition(
  request: SettlementTransitionRequest,
): SettlementTransitionRecord {
  const existing = settlementTransitions.get(request.idempotencyKey);
  if (existing) {
    return existing;
  }

  const recordedAt = request.recordedAt ?? new Date().toISOString();
  const signature = request.signature ?? null;
  const auditLog = appendAuditLog({
    createdAt: recordedAt,
    input: {
      fromState: request.fromState,
      idempotencyKey: request.idempotencyKey,
      inputHash: request.inputHash,
      turnId: request.turnId,
    },
    jobId: null,
    kind: "settlement.transition",
    output: {
      outputHash: request.outputHash,
      signature,
      toState: request.toState,
      transitionReason: request.transitionReason,
    },
    publicStateRef: {
      key: request.idempotencyKey,
      type: "settlement_transition",
    },
    reason: request.transitionReason,
    result: request.toState,
    turnId: request.turnId,
  });

  const record: SettlementTransitionRecord = {
    auditLogHash: auditLog.logHash,
    fromState: request.fromState,
    idempotencyKey: request.idempotencyKey,
    inputHash: request.inputHash,
    outputHash: request.outputHash,
    recordedAt,
    signature,
    toState: request.toState,
    transitionReason: request.transitionReason,
    turnId: request.turnId,
  };
  settlementTransitions.set(record.idempotencyKey, record);
  settlementTransitionOrder.push(record.idempotencyKey);
  return record;
}

export function listSettlementTransitions(
  turnId: number,
): SettlementTransitionRecord[] {
  return settlementTransitionOrder
    .map((key) => settlementTransitions.get(key))
    .filter(
      (record): record is SettlementTransitionRecord =>
        record !== undefined && record.turnId === turnId,
    );
}

function hashRuleIdsForAudit(domain: string, ruleIds: number[]) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        domain,
        ruleIds,
      }),
      "utf8",
    )
    .digest("hex");
}

export function getRuleElimination(turnId: number): RuleEliminationRecord {
  const explicit = ruleEliminations.get(turnId);
  if (explicit) {
    return explicit;
  }

  const election = getRuleElection(turnId);
  const { counts: approvalCounts } = listRuleVotes(turnId);
  const { counts: eliminationCounts } = listRuleEliminationVotes(turnId);
  const finalistRuleIds = election?.finalistRuleIds ?? [];
  const finalists = finalistRuleIds.map((ruleId) => {
    const approvalVotes =
      approvalCounts[String(ruleId)] ??
      (election?.topVotedRuleIds.includes(ruleId) ? 1 : 0);
    const eliminationVotes = eliminationCounts[String(ruleId)] ?? 0;
    const eliminated = false;
    return {
      approvalVotes,
      eliminated,
      eliminationVotes,
      ruleId,
      status: "survived" as const,
      threshold: approvalVotes + 1,
    };
  });

  return {
    closedAt: null,
    decisionWindowClosesAt: null,
    decisionWindowOpenedAt: null,
    eliminatedFinalistHash: hashRuleIdsForAudit("eliminated_finalists_v1", []),
    eliminatedRuleIds: [],
    finalists,
    status:
      finalistRuleIds.length > 0 && !election?.activeRuleId
        ? "open"
        : "not_started",
    survivorFinalistHash: hashRuleIdsForAudit(
      "survivor_finalists_v1",
      finalistRuleIds,
    ),
    survivorRuleIds: finalistRuleIds,
    turnId,
  };
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
  state: "eligible" | "invalidated" | "proposed" | "removed_paid";
  title: string;
  tokenCount: number;
  validation: RuleValidationSummary | null;
  votes: number;
}

export interface RoundSummary {
  activity: ActivityEvent[];
  cycle: {
    durationHours: number;
    nextDurationHours: number;
    pattern: readonly number[];
    stepIndex: number;
  };
  claims: ClaimSummary;
  draw: DrawRecord | null;
  election: RuleElectionRecord | null;
  elimination: RuleEliminationRecord;
  pool: {
    accounting: PrizePoolAccounting;
    guessSol: number;
    guesses: number;
    indicativeSol: number;
    paidRemovalSol: number;
    paidRemovals: number;
    proposalSol: number;
    proposals: number;
    eliminationVoteFeeSol: number;
    eliminationVoteFees: number;
    totalVisiblePrizePoolSol: number;
    treasurySol: number;
    voteFeeSol: number;
    voteFees: number;
  };
  rolloverSettlement: TurnRolloverSettlement | null;
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

export function calculateRepeatedActionFeeLamports(args: {
  baseFeeLamports: number;
  sequence: number;
  turnId: number;
}) {
  assertNonNegativeSafeInteger(args.baseFeeLamports, "base_fee_lamports");
  assertNonNegativeSafeInteger(args.sequence, "sequence");
  assertNonNegativeSafeInteger(args.turnId, "turn_id");
  if (args.sequence <= 0 || args.turnId <= 0) {
    throw new Error("INVALID_REPEATED_VOTE_FEE_INPUT");
  }

  if (args.turnId < VOTE_FEE_START_TURN && args.sequence === 1) {
    return 0;
  }

  const paidIndex = args.sequence - 1;
  let feeLamports = args.baseFeeLamports;
  for (let index = 0; index < paidIndex; index += 1) {
    feeLamports *= REPEATED_ACTION_FEE_MULTIPLIER;
    assertNonNegativeSafeInteger(feeLamports, "fee_lamports");
  }
  return feeLamports;
}

function splitFeeLamports(amountLamports: number, treasuryFeeBps: number) {
  assertNonNegativeSafeInteger(amountLamports, "fee_lamports");
  assertNonNegativeSafeInteger(treasuryFeeBps, "treasury_fee_bps");
  if (treasuryFeeBps > 10_000) {
    throw new Error("INVALID_TREASURY_FEE_BPS");
  }

  const treasuryLamports = Math.floor(
    (amountLamports * treasuryFeeBps) / 10_000,
  );
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

function accountVariableFeeSource(
  feeAmountsLamports: number[],
  baseFeeLamports: number,
  treasuryFeeBps: number,
): PrizePoolFeeSourceAccounting {
  for (const feeLamports of feeAmountsLamports) {
    assertNonNegativeSafeInteger(feeLamports, "fee_lamports");
  }
  const grossLamports = feeAmountsLamports.reduce(
    (total, feeLamports) => total + feeLamports,
    0,
  );
  assertNonNegativeSafeInteger(grossLamports, "gross_lamports");
  const { prizeLamports, treasuryLamports } = splitFeeLamports(
    grossLamports,
    treasuryFeeBps,
  );

  return {
    count: feeAmountsLamports.length,
    feeLamports: baseFeeLamports,
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
    repeatedActionFeeMultiplier: REPEATED_ACTION_FEE_MULTIPLIER,
  };
}

export function calculatePrizePoolAccounting(args: {
  alternativeRolloverLamports?: number;
  config?: Partial<PrizePoolAccountingConfig>;
  eliminationVoteCount?: number;
  eliminationVoteFeeLamports?: number[];
  guessCount: number;
  guessFeeLamports?: number[];
  originalRolloverLamports?: number;
  paidRuleRemovalCount: number;
  ruleProposalCount: number;
  ruleProposalFeeLamports?: number[];
  turnId: number;
  voteCount: number;
  voteFeeLamports?: number[];
}): PrizePoolAccounting {
  assertNonNegativeSafeInteger(args.turnId, "turn_id");
  if (args.turnId <= 0) {
    throw new Error("INVALID_TURN_ID");
  }

  const config = {
    ...defaultAccountingConfig(),
    ...args.config,
  };
  const guessFees =
    args.guessFeeLamports ??
    Array.from({ length: args.guessCount }, (_, index) =>
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: config.guessSubmissionFeeLamports,
        sequence: index + 1,
        turnId: args.turnId,
      }),
    );
  const proposalFees =
    args.ruleProposalFeeLamports ??
    Array.from({ length: args.ruleProposalCount }, (_, index) =>
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: config.ruleProposalFeeLamports,
        sequence: index + 1,
        turnId: args.turnId,
      }),
    );
  const guessSubmissions = accountVariableFeeSource(
    guessFees,
    config.guessSubmissionFeeLamports,
    config.treasuryFeeBps,
  );
  const ruleProposals = accountVariableFeeSource(
    proposalFees,
    config.ruleProposalFeeLamports,
    config.treasuryFeeBps,
  );
  const paidRuleRemovals = accountFeeSource(
    args.paidRuleRemovalCount,
    config.paidRuleRemovalFeeLamports,
    config.treasuryFeeBps,
  );
  const eliminationVoteFees =
    args.eliminationVoteFeeLamports ??
    Array.from({ length: args.eliminationVoteCount ?? 0 }, (_, index) =>
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: config.voteFeeLamports,
        sequence: index + 1,
        turnId: args.turnId,
      }),
    );
  const approvalVoteFees =
    args.voteFeeLamports ??
    Array.from({ length: args.voteCount }, (_, index) =>
      calculateRepeatedActionFeeLamports({
        baseFeeLamports: config.voteFeeLamports,
        sequence: index + 1,
        turnId: args.turnId,
      }),
    );
  const eliminationVotes = {
    ...accountVariableFeeSource(
      eliminationVoteFees,
      config.voteFeeLamports,
      config.treasuryFeeBps,
    ),
    feeActive: eliminationVoteFees.some((feeLamports) => feeLamports > 0),
  };
  const votes = {
    ...accountVariableFeeSource(
      approvalVoteFees,
      config.voteFeeLamports,
      config.treasuryFeeBps,
    ),
    feeActive: approvalVoteFees.some((feeLamports) => feeLamports > 0),
  };

  const grossFeesLamports =
    guessSubmissions.grossLamports +
    ruleProposals.grossLamports +
    paidRuleRemovals.grossLamports +
    eliminationVotes.grossLamports +
    votes.grossLamports;
  const treasuryLamports =
    guessSubmissions.treasuryLamports +
    ruleProposals.treasuryLamports +
    paidRuleRemovals.treasuryLamports +
    eliminationVotes.treasuryLamports +
    votes.treasuryLamports;
  const currentTurnPoolLamports =
    guessSubmissions.prizeLamports +
    ruleProposals.prizeLamports +
    paidRuleRemovals.prizeLamports +
    eliminationVotes.prizeLamports +
    votes.prizeLamports;

  const originalCurrentTurnLamports = Math.floor(currentTurnPoolLamports / 2);
  const alternativeCurrentTurnLamports =
    currentTurnPoolLamports - originalCurrentTurnLamports;
  const originalRolloverLamports = args.originalRolloverLamports ?? 0;
  const alternativeRolloverLamports = args.alternativeRolloverLamports ?? 0;
  assertNonNegativeSafeInteger(
    originalRolloverLamports,
    "original_rollover_lamports",
  );
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
      eliminationVotes,
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

export function listPaidRuleRemovals(turnId: number) {
  return [...paidRuleRemovals.values()].filter(
    (removal) => removal.turnId === turnId,
  );
}

function getTurnRollover(turnId: number) {
  return turnRollovers.get(turnId) ?? null;
}

function buildRolloverBucketSettlement(bucket: {
  remainderLamports: number;
  winnerCount: number;
}): RolloverBucketSettlement {
  const rolloverLamports = bucket.remainderLamports;
  const reason: RolloverReason =
    rolloverLamports === 0
      ? "none"
      : bucket.winnerCount === 0
        ? "no_winner"
        : "dust_remainder";
  return { reason, rolloverLamports, winnerCount: bucket.winnerCount };
}

// Settles a finished turn's prize buckets into the next turn. Each bucket's
// unallocated remainder rolls forward: the FULL bucket when it had no winner
// (so a no-winner bucket — including any inbound rollover — accumulates across
// repeated no-winner turns), or the integer-division dust when it had winners
// (so no lamport is ever lost). Creator/voter rewards are funded from a
// separate reserve and are unaffected by this settlement.
export function settleTurnRollover(
  turnId: number,
  settledAt: string = new Date().toISOString(),
): TurnRolloverSettlement {
  assertNonNegativeSafeInteger(turnId, "turn_id");
  if (turnId <= 0) {
    throw new Error("INVALID_TURN_ID");
  }

  const winners = getWinnerSummary(turnId);
  const original = buildRolloverBucketSettlement(winners.original);
  const alternative = buildRolloverBucketSettlement(winners.alternative);
  const nextTurnId = turnId + 1;

  saveTurnRollover({
    alternativeRolloverLamports: alternative.rolloverLamports,
    originalRolloverLamports: original.rolloverLamports,
    recordedAt: settledAt,
    sourceTurnId: turnId,
    turnId: nextTurnId,
  });

  const settlement: TurnRolloverSettlement = {
    alternative,
    nextTurnId,
    original,
    settledAt,
    totalRolloverLamports:
      original.rolloverLamports + alternative.rolloverLamports,
    turnId,
  };
  turnRolloverSettlements.set(turnId, settlement);
  return settlement;
}

export function getTurnRolloverSettlement(turnId: number) {
  return turnRolloverSettlements.get(turnId) ?? null;
}

// Activity-feed events for the public spectator feed (PRD §4.7 Loop 5). Only a
// genuine no-winner bucket surfaces a "pool rolls over" event; silent
// dust-remainder accounting is not narrated.
export function getRolloverActivityEvents(
  turnId: number,
): RolloverActivityEvent[] {
  const settlement = getTurnRolloverSettlement(turnId);
  if (!settlement) {
    return [];
  }

  const events: RolloverActivityEvent[] = [];
  for (const bucket of ["original", "alternative"] as const) {
    const detail = settlement[bucket];
    if (detail.reason === "no_winner") {
      events.push({
        bucket,
        fromTurnId: settlement.turnId,
        rolloverLamports: detail.rolloverLamports,
        toTurnId: settlement.nextTurnId,
        type: "pool_rollover",
      });
    }
  }
  return events;
}

// Spectator-feed events for paid rule removals (PRD §4.7 Loop 5), ordered by
// removal time so the activity feed reads chronologically.
export function getRuleRemovalActivityEvents(
  turnId: number,
): RuleRemovalActivityEvent[] {
  const proposalsById = new Map(
    listRuleProposals(turnId).map((proposal) => [proposal.ruleId, proposal]),
  );
  return listPaidRuleRemovals(turnId)
    .slice()
    .sort(
      (left, right) => Date.parse(left.removedAt) - Date.parse(right.removedAt),
    )
    .map((removal) => ({
      removalKind: removal.removalKind,
      ruleId: removal.ruleId,
      ruleTitle: proposalsById.get(removal.ruleId)?.title ?? null,
      turnId,
      type: "rule_removed" as const,
    }));
}

// Combined public activity feed for the round (rollovers + paid removals).
export function getActivityEvents(turnId: number): ActivityEvent[] {
  return [
    ...getRolloverActivityEvents(turnId),
    ...getRuleRemovalActivityEvents(turnId),
  ];
}

export function getPrizePoolAccounting(turnId: number) {
  const proposals = listRuleProposals(turnId);
  const guesses = listGuessReceipts(turnId);
  const { votes } = listRuleVotes(turnId);
  const { votes: eliminationVotes } = listRuleEliminationVotes(turnId);
  const rollover = getTurnRollover(turnId);

  return calculatePrizePoolAccounting({
    alternativeRolloverLamports: rollover?.alternativeRolloverLamports ?? 0,
    eliminationVoteCount: eliminationVotes.length,
    eliminationVoteFeeLamports: eliminationVotes.map(
      (vote) => vote.feeLamports ?? 0,
    ),
    guessCount: guesses.length,
    guessFeeLamports: guesses.map((receipt) => receipt.feeLamports ?? 0),
    originalRolloverLamports: rollover?.originalRolloverLamports ?? 0,
    paidRuleRemovalCount: listPaidRuleRemovals(turnId).length,
    ruleProposalCount: proposals.length,
    ruleProposalFeeLamports: proposals.map(
      (proposal) => proposal.feeLamports ?? 0,
    ),
    turnId,
    voteCount: votes.length,
    voteFeeLamports: votes.map((vote) => vote.feeLamports ?? 0),
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
  const draw = getDraw(turnId);
  const hasClosedSettlement = listSettlementTransitions(turnId).some(
    (transition) => transition.toState === "CLOSED",
  );

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
  const eliminationVoteFeeSol = lamportsToSol(
    accounting.sources.eliminationVotes.grossLamports,
  );
  const totalVisiblePrizePoolSol = lamportsToSol(
    accounting.totalVisiblePrizePoolLamports,
  );
  const treasurySol = lamportsToSol(accounting.treasuryLamports);

  const status =
    hasClosedSettlement || draw?.status === "fulfilled" || turnId < activeTurnId
      ? "completed"
      : turnId > activeTurnId
        ? "upcoming"
        : "current";

  return {
    activity: getActivityEvents(turnId),
    cycle: {
      durationHours: cycleDurationHours(stepIndex),
      nextDurationHours: cycleDurationHours(nextStepIndex),
      pattern: TURN_DURATION_CYCLE_HOURS,
      stepIndex,
    },
    claims: getClaimSummary({ turnId }),
    draw,
    election: getRuleElection(turnId),
    elimination: getRuleElimination(turnId),
    pool: {
      accounting,
      guessSol: roundSol(guessSol),
      guesses,
      indicativeSol: roundSol(totalVisiblePrizePoolSol),
      paidRemovalSol: roundSol(paidRemovalSol),
      paidRemovals: removals,
      proposalSol: roundSol(proposalSol),
      proposals: proposals.length,
      eliminationVoteFeeSol: roundSol(eliminationVoteFeeSol),
      eliminationVoteFees: accounting.sources.eliminationVotes.count,
      totalVisiblePrizePoolSol: roundSol(totalVisiblePrizePoolSol),
      treasurySol: roundSol(treasurySol),
      voteFeeSol: roundSol(voteFeeSol),
      voteFees: accounting.sources.votes.count,
    },
    rolloverSettlement: getTurnRolloverSettlement(turnId),
    rules: proposals.map((proposal) => ({
      compiledArtifactHash: proposal.compiledArtifactHash ?? null,
      precompilationStatus: proposal.precompilationStatus ?? "pending",
      proposer: proposal.proposer,
      ruleId: proposal.ruleId,
      ruleProposal: proposal.ruleProposal,
      sanitizedText: proposal.sanitizedText,
      // A removed rule is shown as removed (and excluded from election) but
      // remains visible in history (PRD §6.11).
      state: isRuleRemoved(turnId, proposal.ruleId)
        ? ("removed_paid" as const)
        : (proposal.state ?? "proposed"),
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

function getEffectiveTurnDurationHealth() {
  const rawScale = process.env.IDEALER_DEVNET_TURN_DURATION_SCALE_BPS;
  if (!rawScale) {
    return {
      turnDurationCycleHours: TURN_DURATION_CYCLE_HOURS,
      turnDurationCycleSeconds: TURN_DURATION_CYCLE_SECONDS,
      turnDurationScaleBps: null,
    };
  }

  const scaleBps = Number(rawScale);
  if (!Number.isInteger(scaleBps) || scaleBps <= 0 || scaleBps > 10_000) {
    throw new Error(
      "IDEALER_DEVNET_TURN_DURATION_SCALE_BPS must be an integer between 1 and 10000.",
    );
  }

  const turnDurationCycleSeconds = TURN_DURATION_CYCLE_SECONDS.map((duration) =>
    Math.max(1, Math.floor((duration * scaleBps) / 10_000)),
  );

  return {
    turnDurationCycleHours: turnDurationCycleSeconds.map(
      (duration) => duration / 3_600,
    ),
    turnDurationCycleSeconds,
    turnDurationScaleBps: scaleBps,
  };
}

export async function getHealth(): Promise<ServiceHealth> {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  const turnDurations = getEffectiveTurnDurationHealth();

  if (!databaseUrl || !redisUrl) {
    return {
      service: "api",
      status: "error",
      ...turnDurations,
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
    ...turnDurations,
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
        url.pathname.startsWith("/api/v1/turns/") ||
        url.pathname.startsWith("/players/") ||
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

          const existing =
            body.sequence === undefined
              ? null
              : getGuessReceiptBySequence(body.turnId, body.player, body.sequence);
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

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/rule-validations/")
    ) {
      const parts = url.pathname.slice("/rule-validations/".length).split("/");
      const turnId = Number(parts[0]);
      const ruleId = Number(parts[1]);

      if (
        !Number.isInteger(turnId) ||
        turnId <= 0 ||
        !Number.isInteger(ruleId) ||
        ruleId <= 0
      ) {
        sendJson(request, response, 400, {
          error: "invalid_rule_validation_id",
        });
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
            getRuleVoteKey(
              body.turnId,
              body.ruleId,
              body.voter,
              body.sequence ?? 0,
            ),
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

    if (
      request.method === "POST" &&
      url.pathname === "/rule-elimination-votes"
    ) {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidRuleEliminationVote(body)) {
            sendJson(request, response, 400, {
              error: "invalid_rule_elimination_vote",
            });
            return;
          }

          const existing = ruleEliminationVotes.get(
            getRuleEliminationVoteKey(
              body.turnId,
              body.ruleId,
              body.voter,
              body.sequence ?? 0,
            ),
          );
          if (existing && existing.signature !== body.signature) {
            sendJson(request, response, 409, {
              error: "duplicate_rule_elimination_vote",
              vote: existing,
            });
            return;
          }

          sendJson(request, response, 201, {
            vote: saveRuleEliminationVote(body),
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

    if (
      request.method === "GET" &&
      url.pathname === "/rule-elimination-votes"
    ) {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, listRuleEliminationVotes(turnId));
      return;
    }

    if (
      request.method === "GET" &&
      /^\/api\/v1\/turns\/\d+\/elimination$/.test(url.pathname)
    ) {
      const parts = url.pathname.split("/");
      const turnId = Number(parts[4]);

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_turn_id" });
        return;
      }

      sendJson(request, response, 200, {
        elimination: getRuleElimination(turnId),
      });
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

          // Idempotent replay: re-posting the identical removal returns the
          // stored record; a conflicting signature for the same key is 409.
          const existing = paidRuleRemovals.get(
            getPaidRuleRemovalKey(body.turnId, body.ruleId, body.remover),
          );
          if (existing) {
            if (existing.signature === body.signature) {
              sendJson(request, response, 200, { removal: existing });
            } else {
              sendJson(request, response, 409, {
                error: "duplicate_rule_removal",
                removal: existing,
              });
            }
            return;
          }

          try {
            const { auditLog, removal } = removeRule(body);
            sendJson(request, response, 201, { auditLog, removal });
          } catch (error: unknown) {
            if (error instanceof RuleRemovalRejectedError) {
              sendJson(request, response, 409, {
                code: error.code,
                error: "rule_removal_rejected",
                message: error.message,
                threshold: error.threshold,
                voteCount: error.voteCount,
              });
              return;
            }
            throw error;
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

    if (
      request.method === "POST" &&
      url.pathname === "/turn-rollovers/settle"
    ) {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidGuessVerificationCreateRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_rollover_settle_request",
            });
            return;
          }

          sendJson(request, response, 201, {
            settlement: settleTurnRollover(body.turnId),
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

    if (
      request.method === "GET" &&
      url.pathname === "/turn-rollovers/settlement"
    ) {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        activity: getRolloverActivityEvents(turnId),
        settlement: getTurnRolloverSettlement(turnId),
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/prize-pool-accounting/")
    ) {
      const turnId = Number(
        url.pathname.slice("/prize-pool-accounting/".length),
      );

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

    if (
      request.method === "POST" &&
      url.pathname === "/verification-jobs/create-turn"
    ) {
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
              error instanceof Error
                ? error.message
                : "VERIFICATION_JOB_FAILED";
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
              error instanceof Error
                ? error.message
                : "VERIFICATION_RESULT_FAILED";
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

    if (
      request.method === "POST" &&
      url.pathname === "/winner-records/calculate-turn"
    ) {
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

    if (
      request.method === "POST" &&
      url.pathname === "/reward-records/calculate-turn"
    ) {
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
              error instanceof Error
                ? error.message
                : "REWARD_CALCULATION_FAILED";
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

    if (
      request.method === "POST" &&
      url.pathname === "/claim-records/create-turn"
    ) {
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

    if (
      request.method === "POST" &&
      url.pathname === "/claim-records/expire-unclaimed"
    ) {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidExpiredUnclaimedClaimRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_claim_expiry_request",
            });
            return;
          }

          sendJson(request, response, 201, {
            settlement: settleExpiredUnclaimedClaims(body),
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

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/players/") &&
      url.pathname.endsWith("/claims")
    ) {
      const wallet = url.pathname.slice(
        "/players/".length,
        url.pathname.length - "/claims".length,
      );

      if (!isBase58Like(wallet)) {
        sendJson(request, response, 400, { error: "invalid_wallet" });
        return;
      }

      sendJson(request, response, 200, {
        claims: getPlayerClaimsSummary(wallet),
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/players/") &&
      url.pathname.endsWith("/history")
    ) {
      const wallet = url.pathname.slice(
        "/players/".length,
        url.pathname.length - "/history".length,
      );
      const cursor = url.searchParams.get("cursor");
      const rawLimit = url.searchParams.get("limit");
      const limit = rawLimit === null ? undefined : Number(rawLimit);

      if (
        !isBase58Like(wallet) ||
        (cursor !== null && !/^\d+$/.test(cursor)) ||
        (limit !== undefined && (!Number.isInteger(limit) || limit <= 0))
      ) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        history: listPlayerHistory({
          ...(cursor === null ? {} : { cursor }),
          ...(limit === undefined ? {} : { limit }),
          wallet,
        }),
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname.startsWith("/players/") &&
      url.pathname.endsWith("/conversation-drafts")
    ) {
      const wallet = url.pathname.slice(
        "/players/".length,
        url.pathname.length - "/conversation-drafts".length,
      );

      if (!isBase58Like(wallet)) {
        sendJson(request, response, 400, { error: "invalid_wallet" });
        return;
      }

      sendJson(request, response, 200, {
        drafts: listConversationDrafts(wallet),
      });
      return;
    }

    if (
      request.method === "POST" &&
      url.pathname.startsWith("/players/") &&
      url.pathname.endsWith("/conversation-drafts")
    ) {
      const wallet = url.pathname.slice(
        "/players/".length,
        url.pathname.length - "/conversation-drafts".length,
      );

      if (!isBase58Like(wallet)) {
        sendJson(request, response, 400, { error: "invalid_wallet" });
        return;
      }

      void readJsonBody(request)
        .then((body) => {
          if (!isValidConversationDraft(body)) {
            sendJson(request, response, 400, {
              error: "invalid_conversation_draft",
            });
            return;
          }

          if (body.wallet !== wallet) {
            sendJson(request, response, 409, {
              error: "wallet_mismatch",
              message: "Draft wallet must match the URL wallet.",
            });
            return;
          }

          sendJson(request, response, 201, {
            draft: saveConversationDraft(body),
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

    if (
      request.method === "POST" &&
      url.pathname === "/claim-records/request"
    ) {
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
            const code =
              error instanceof Error ? error.message : "CLAIM_FAILED";
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

    if (
      request.method === "POST" &&
      url.pathname === "/claim-records/complete"
    ) {
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
            const code =
              error instanceof Error ? error.message : "CLAIM_FAILED";
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

    if (
      request.method === "POST" &&
      url.pathname === "/settlement-transitions"
    ) {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidSettlementTransitionRequest(body)) {
            sendJson(request, response, 400, {
              error: "invalid_settlement_transition",
            });
            return;
          }

          sendJson(request, response, 201, {
            transition: recordSettlementTransition(body),
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

    if (
      request.method === "GET" &&
      url.pathname === "/settlement-transitions"
    ) {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        transitions: listSettlementTransitions(turnId),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/audit") {
      const rawTurnId = url.searchParams.get("turnId");
      const rawKind = url.searchParams.get("kind");
      const turnId = rawTurnId === null ? undefined : Number(rawTurnId);
      const kind =
        rawKind !== null && AUDIT_LOG_KINDS.has(rawKind as AuditLogKind)
          ? (rawKind as AuditLogKind)
          : undefined;

      if (
        rawTurnId !== null &&
        (!Number.isInteger(turnId) || Number(turnId) <= 0)
      ) {
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
      console.log(
        `[warmup] ${model}: could not load (${result.note ?? "unknown"})`,
      );
    }
  }
}
