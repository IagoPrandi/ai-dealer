import { createHash, randomInt, timingSafeEqual } from "node:crypto";
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

export interface RepeatedVoteFeeReconciliationRecord {
  actualFeeLamports: number;
  expectedFeeLamports: number;
  matchesExpectedFee: boolean;
  ruleId: number;
  sequence: number;
  turnId: number;
  voter: string;
  voteType: "approval" | "elimination";
}

export interface RepeatedVoteFeeReconciliationSide {
  count: number;
  expectedGrossLamports: number;
  grossLamports: number;
  matchesExpectedGross: boolean;
  matchesPrizePoolSource: boolean;
  prizePoolGrossLamports: number;
  records: RepeatedVoteFeeReconciliationRecord[];
}

export interface RepeatedVoteFeeReconciliation {
  approval: RepeatedVoteFeeReconciliationSide;
  config: Pick<
    PrizePoolAccountingConfig,
    "repeatedActionFeeMultiplier" | "voteFeeLamports" | "voteFeeStartTurn"
  >;
  elimination: RepeatedVoteFeeReconciliationSide;
  matches: boolean;
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
  "/admin/repeated-vote-fee-reconciliation",
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
  "/transparency",
  "/transparency/export",
  "/operator/ai-operations",
  "/operator/ai-operations/export",
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
    "access-control-allow-headers": "authorization, content-type",
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

function sendCsv(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: string,
  filename = "idealer-transparency.csv",
) {
  response.writeHead(statusCode, {
    "content-disposition": `attachment; filename="${filename}"`,
    "content-type": "text/csv; charset=utf-8",
    ...getCorsHeaders(request),
  });
  response.end(body);
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
  if (vote.sequence === undefined) {
    const retry = [...ruleVotes.values()].find(
      (candidate) =>
        candidate.turnId === vote.turnId &&
        candidate.ruleId === vote.ruleId &&
        candidate.voter === vote.voter &&
        candidate.signature === vote.signature,
    );
    if (retry) {
      return retry;
    }
  }
  const sequence =
    vote.sequence ??
    [...ruleVotes.values()].filter(
      (candidate) =>
        candidate.turnId === vote.turnId &&
        candidate.ruleId === vote.ruleId &&
        candidate.voter === vote.voter,
    ).length + 1;
  const key = getRuleVoteKey(vote.turnId, vote.ruleId, vote.voter, sequence);
  const existing = ruleVotes.get(key);
  if (existing) {
    if (existing.signature !== vote.signature) {
      throw new Error("DUPLICATE_RULE_VOTE");
    }
    return existing;
  }
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
  ruleVotes.set(key, saved);
  return saved;
}

export function saveRuleEliminationVote(vote: RuleEliminationVoteRecord) {
  if (vote.sequence === undefined) {
    const retry = [...ruleEliminationVotes.values()].find(
      (candidate) =>
        candidate.turnId === vote.turnId &&
        candidate.ruleId === vote.ruleId &&
        candidate.voter === vote.voter &&
        candidate.signature === vote.signature,
    );
    if (retry) {
      return retry;
    }
  }
  const sequence =
    vote.sequence ??
    [...ruleEliminationVotes.values()].filter(
      (candidate) =>
        candidate.turnId === vote.turnId &&
        candidate.ruleId === vote.ruleId &&
        candidate.voter === vote.voter,
    ).length + 1;
  const key = getRuleEliminationVoteKey(
    vote.turnId,
    vote.ruleId,
    vote.voter,
    sequence,
  );
  const existing = ruleEliminationVotes.get(key);
  if (existing) {
    if (existing.signature !== vote.signature) {
      throw new Error("DUPLICATE_RULE_ELIMINATION_VOTE");
    }
    return existing;
  }
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
  ruleEliminationVotes.set(key, saved);
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

export interface TransparencyFilters {
  fromDate?: string;
  fromTurnId?: number;
  toDate?: string;
  toTurnId?: number;
}

export interface TransparencySourceReference {
  derivation: string;
  endpoint: string;
  label: string;
  source: "audit_log" | "on_chain_account" | "public_api_projection";
}

export interface TransparencyTurnSummary {
  activity: {
    claims: number;
    eliminationVotes: number;
    guesses: number;
    paidRemovals: number;
    proposals: number;
    settlementTransitions: number;
    totalVotes: number;
  };
  claims: {
    availableLamports: number;
    belowThresholdLamports: number;
    claimedLamports: number;
    expiredLamports: number;
    pendingLamports: number;
    rolledOverLamports: number;
    statusCounts: Record<ClaimRecordStatus, number>;
  };
  durationHours: number;
  economy: {
    alternativeBucketLamports: number;
    expiredUnclaimedLamports: number;
    grossFeesLamports: number;
    originalBucketLamports: number;
    payoutDustLamports: number;
    pendingClaimableLamports: number;
    platformTreasuryLamports: number;
    prizePoolLamports: number;
    rolloverInLamports: number;
    rolloverOutLamports: number;
    sources: PrizePoolAccounting["sources"];
  };
  proofs: {
    activeRuleId: number | null;
    auditChainHead: string | null;
    drawRandomnessAccount: string | null;
    drawRandomnessSource: string | null;
    drawResultHash: string | null;
    eligiblePoolHash: string | null;
    finalistSetHash: string | null;
    ruleElectionRandomnessAccount: string | null;
    ruleElectionRandomnessSource: string | null;
    settlementAuditEndpoint: string;
    winnerCalculationHash: string | null;
  };
  rewards: {
    creatorRewardLamports: number;
    creatorRewardReserveLamports: number;
    remainingReserveLamports: number;
    voterRewardLamports: number;
    voterRewardRecipients: number;
  };
  rules: {
    activeRuleId: number | null;
    clarityLabelCount: number;
    difficultyLabelCount: number;
    eliminated: number;
    finalistRuleIds: number[];
    invalidated: number;
    precompiled: number;
    proposed: number;
    randomFinalistRuleIds: number[];
    removed: number;
    ruleTokenCountAverage: number;
    survived: number;
    topRules: Array<{
      creator: string;
      ruleId: number;
      title: string;
      totalVotes: number;
      uniqueApprovalVoters: number;
    }>;
    topVotedFinalistRuleIds: number[];
  };
  status: RoundSummary["status"];
  turnId: number;
  voting: {
    approvalFeeLamports: number;
    repeatedApprovalVotes: number;
    repeatedEliminationVotes: number;
    totalApprovalVotes: number;
    totalEliminationVotes: number;
    uniqueApprovalVoters: number;
    uniqueEliminationVoters: number;
    eliminationFeeLamports: number;
  };
}

export interface TransparencySnapshot {
  activeTurnId: number;
  dataBoundary: {
    deniedPrivateFields: string[];
    publicExportFieldsOnly: boolean;
    publicMetricsOnly: boolean;
    restrictedAiOperations: {
      endpoint: "/operator/ai-operations";
      exportEndpoint: "/operator/ai-operations/export";
      role: "ai_operator";
      status: "access_controlled";
    };
  };
  exports: {
    csvPath: string;
    excludedPrivateAnalytics: string[];
    jsonPath: string;
  };
  filters: Required<Pick<TransparencyFilters, "fromTurnId" | "toTurnId">> &
    Pick<TransparencyFilters, "fromDate" | "toDate">;
  generatedAt: string;
  sourceReferences: TransparencySourceReference[];
  totals: {
    alternativePrizeLamports: number;
    approvalVotes: number;
    claims: number;
    creatorRewardLamports: number;
    creatorRewardReserveLamports: number;
    drawProofs: number;
    eliminationVotes: number;
    grossFeesLamports: number;
    guesses: number;
    paidRemovals: number;
    platformTreasuryLamports: number;
    proposals: number;
    rewardReserveRemainingLamports: number;
    rolloverInLamports: number;
    rolloverOutLamports: number;
    settlementTransitions: number;
    voterRewardLamports: number;
    winnerPayoutLamports: number;
  };
  trends: {
    byTurnDuration: Array<{
      approvalVotes: number;
      creatorRewardLamports: number;
      durationHours: number;
      eliminationVotes: number;
      grossFeesLamports: number;
      guesses: number;
      prizePoolLamports: number;
      proposals: number;
      rolloverLamports: number;
      turns: number;
      voterRewardLamports: number;
    }>;
    repeatedPaidActions: Array<{
      count: number;
      feeLamports: number;
      scope:
        | "approval_vote"
        | "elimination_vote"
        | "guess"
        | "paid_rule_removal"
        | "rule_proposal";
    }>;
    ruleLifecycle: {
      active: number;
      eliminated: number;
      finalist: number;
      invalidated: number;
      proposed: number;
      removed: number;
      survived: number;
    };
    topCreators: Array<{
      creator: string;
      electedRules: number;
      proposedRules: number;
      rewardLamports: number;
      votesReceived: number;
      winnerProducingRules: number;
    }>;
  };
  turns: TransparencyTurnSummary[];
}

export interface OperatorAiOperationsSnapshot {
  access: {
    permissions: readonly ["ai_ops:read", "ai_ops:export"];
    readOnly: true;
    role: "ai_operator";
  };
  agentCallVolumeByRole: Array<{
    calls: number;
    role: AiOperationRole;
    source: string;
  }>;
  auditLinks: Array<{
    artifactHash: string | null;
    auditEndpoint: string;
    auditLogHash: string | null;
    role: AiOperationRole;
    ruleId: number;
    turnId: number;
    validationLogId: string;
  }>;
  confidenceDistributions: {
    compilerConfidenceBuckets: ConfidenceBucketCounts;
    finalConfidenceBuckets: ConfidenceBucketCounts;
    modelConfidenceBuckets: ConfidenceBucketCounts;
  };
  estimatedCost: {
    costPerThousandTokensUsd: number;
    estimatedUsd: number;
    source: "configured_rate" | "not_configured";
    totalTokens: number;
  };
  failureCounts: Array<{
    count: number;
    model: string;
    provider: string;
    role: AiOperationRole;
    status:
      | "guardrail_rejection"
      | "malformed_response"
      | "provider_error"
      | "schema_validation_failed"
      | "timeout";
  }>;
  generatedAt: string;
  latencyPercentiles: Array<{
    count: number;
    model: string;
    p50Ms: number;
    p95Ms: number;
    provider: string;
    role: AiOperationRole;
    source: "end_to_end_rule_validation_projection" | "guess_verification_queue_projection";
  }>;
  localModelHealth: Array<{
    configuredModel: string;
    digest: string | null;
    lastHealthCheckResult: "available_from_validation" | "not_recorded";
    provider: string;
    quantization: string | null;
    servingEngine: string;
  }>;
  modelRouting: Array<{
    escalationCount: number;
    fallbackTriggered: number;
    local: boolean;
    model: string;
    provider: string;
    role: AiOperationRole;
    statuses: Record<string, number>;
    validationCalls: number;
  }>;
  operationCounts: {
    auditCompilerValidationLogs: number;
    auditGuessVerificationLogs: number;
    validationCalls: number;
    verificationJobs: number;
  };
  queue: {
    backlogJobs: number;
    deadLetterJobs: number;
    statusCounts: Record<GuessVerificationJobStatus, number>;
  };
  redactionPolicy: {
    exportedFieldsOnly: string[];
    excludedFields: string[];
  };
  redactedIncidents: Array<{
    artifactHash: string | null;
    auditEndpoint: string | null;
    auditLogHash: string | null;
    model: string;
    provider: string;
    reasonCodes: string[];
    role: AiOperationRole;
    ruleId: number | null;
    status: string;
    turnId: number | null;
  }>;
  ruleCompiler: {
    confidenceActionCounts: Record<string, number>;
    decisionCounts: Record<string, number>;
    fallbackRate: number;
    providerDisagreementAverage: number;
    reasonCodeCounts: Record<string, number>;
  };
  sourceReferences: Array<{
    endpoint: string;
    label: string;
    source: "audit_log" | "internal_projection" | "operator_config" | "queue_projection";
    status: "available" | "not_recorded";
  }>;
}

type AiOperationRole =
  | "adversarial_testing"
  | "compilation"
  | "final_validation"
  | "interpretation"
  | "normalization"
  | "review";

type ConfidenceBucket = "0_50" | "50_70" | "70_90" | "90_100";
type ConfidenceBucketCounts = Record<ConfidenceBucket, number>;

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

function buildRepeatedVoteFeeReconciliationSide(args: {
  prizePoolGrossLamports: number;
  turnId: number;
  votes: Array<RuleVoteRecord | RuleEliminationVoteRecord>;
  voteType: "approval" | "elimination";
}): RepeatedVoteFeeReconciliationSide {
  const baseFeeLamports = solToLamports(MVP_FEES_SOL.vote);
  const records = args.votes
    .map((vote) => {
      const sequence = vote.sequence ?? 0;
      const expectedFeeLamports =
        sequence > 0
          ? calculateRepeatedActionFeeLamports({
              baseFeeLamports,
              sequence,
              turnId: vote.turnId,
            })
          : 0;
      const actualFeeLamports = vote.feeLamports ?? 0;

      return {
        actualFeeLamports,
        expectedFeeLamports,
        matchesExpectedFee: actualFeeLamports === expectedFeeLamports,
        ruleId: vote.ruleId,
        sequence,
        turnId: vote.turnId,
        voter: vote.voter,
        voteType: args.voteType,
      };
    })
    .sort(
      (left, right) =>
        left.ruleId - right.ruleId ||
        left.voter.localeCompare(right.voter) ||
        left.sequence - right.sequence,
    );
  const grossLamports = records.reduce(
    (total, record) => total + record.actualFeeLamports,
    0,
  );
  const expectedGrossLamports = records.reduce(
    (total, record) => total + record.expectedFeeLamports,
    0,
  );

  return {
    count: records.length,
    expectedGrossLamports,
    grossLamports,
    matchesExpectedGross: grossLamports === expectedGrossLamports,
    matchesPrizePoolSource: grossLamports === args.prizePoolGrossLamports,
    prizePoolGrossLamports: args.prizePoolGrossLamports,
    records,
  };
}

export function getRepeatedVoteFeeReconciliation(
  turnId: number,
): RepeatedVoteFeeReconciliation {
  assertNonNegativeSafeInteger(turnId, "turn_id");
  if (turnId <= 0) {
    throw new Error("INVALID_TURN_ID");
  }

  const accounting = getPrizePoolAccounting(turnId);
  const approval = buildRepeatedVoteFeeReconciliationSide({
    prizePoolGrossLamports: accounting.sources.votes.grossLamports,
    turnId,
    votes: listRuleVotes(turnId).votes,
    voteType: "approval",
  });
  const elimination = buildRepeatedVoteFeeReconciliationSide({
    prizePoolGrossLamports: accounting.sources.eliminationVotes.grossLamports,
    turnId,
    votes: listRuleEliminationVotes(turnId).votes,
    voteType: "elimination",
  });

  return {
    approval,
    config: {
      repeatedActionFeeMultiplier: REPEATED_ACTION_FEE_MULTIPLIER,
      voteFeeLamports: solToLamports(MVP_FEES_SOL.vote),
      voteFeeStartTurn: VOTE_FEE_START_TURN,
    },
    elimination,
    matches:
      approval.matchesExpectedGross &&
      approval.matchesPrizePoolSource &&
      approval.records.every((record) => record.matchesExpectedFee) &&
      elimination.matchesExpectedGross &&
      elimination.matchesPrizePoolSource &&
      elimination.records.every((record) => record.matchesExpectedFee),
    turnId,
  };
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

function getPublicTurnIds() {
  const turnIds = new Set<number>([IDEALER_ACTIVE_TURN_ID]);

  for (const receipt of guessReceipts.values()) {
    turnIds.add(receipt.turnId);
  }
  for (const proposal of ruleProposals.values()) {
    turnIds.add(proposal.turnId);
  }
  for (const vote of ruleVotes.values()) {
    turnIds.add(vote.turnId);
  }
  for (const vote of ruleEliminationVotes.values()) {
    turnIds.add(vote.turnId);
  }
  for (const record of paidRuleRemovals.values()) {
    turnIds.add(record.turnId);
  }
  for (const turnId of turnRollovers.keys()) {
    turnIds.add(turnId);
  }
  for (const turnId of turnRolloverSettlements.keys()) {
    turnIds.add(turnId);
  }
  for (const turnId of draws.keys()) {
    turnIds.add(turnId);
  }
  for (const turnId of elections.keys()) {
    turnIds.add(turnId);
  }
  for (const turnId of ruleEliminations.keys()) {
    turnIds.add(turnId);
  }
  for (const transition of settlementTransitions.values()) {
    turnIds.add(transition.turnId);
  }
  for (const validation of ruleValidations.values()) {
    turnIds.add(validation.turnId);
  }
  for (const job of verificationJobs.values()) {
    turnIds.add(job.turnId);
  }
  for (const result of verificationResults.values()) {
    turnIds.add(result.turnId);
  }
  for (const winner of winnerRecords.values()) {
    turnIds.add(winner.turnId);
  }
  for (const reward of creatorRewardRecords.values()) {
    turnIds.add(reward.turnId);
  }
  for (const reward of voterRewardRecords.values()) {
    turnIds.add(reward.turnId);
  }
  for (const claim of claimRecords.values()) {
    turnIds.add(claim.turnId);
  }
  for (const log of auditLogs.values()) {
    turnIds.add(log.turnId);
  }

  return [...turnIds].sort((left, right) => left - right);
}

function addNumber(total: number, value: number | undefined) {
  return total + (Number.isSafeInteger(value) ? Number(value) : 0);
}

function hashJsonForTransparency(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function getTurnPublicTimestamps(turnId: number) {
  return [
    ...[...guessReceipts.values()]
      .filter((record) => record.turnId === turnId)
      .map((record) => record.submittedAt),
    ...listRuleProposals(turnId).map((record) => record.submittedAt),
    ...listRuleVotes(turnId).votes.map((record) => record.submittedAt),
    ...listRuleEliminationVotes(turnId).votes.map(
      (record) => record.submittedAt,
    ),
    ...listPaidRuleRemovals(turnId).map((record) => record.removedAt),
    ...listSettlementTransitions(turnId).map((record) => record.recordedAt),
    ...listAuditLogs({ turnId }).map((record) => record.createdAt),
    ...listClaimRecords({ turnId }).map((record) => record.createdAt),
  ].filter((value) => !Number.isNaN(Date.parse(value)));
}

function turnMatchesDateFilter(
  turnId: number,
  filters: Pick<TransparencyFilters, "fromDate" | "toDate">,
) {
  if (!filters.fromDate && !filters.toDate) {
    return true;
  }

  const fromTime = filters.fromDate ? Date.parse(filters.fromDate) : null;
  const toTime = filters.toDate ? Date.parse(filters.toDate) : null;
  if (
    (fromTime !== null && Number.isNaN(fromTime)) ||
    (toTime !== null && Number.isNaN(toTime))
  ) {
    return false;
  }

  return getTurnPublicTimestamps(turnId).some((timestamp) => {
    const time = Date.parse(timestamp);
    return (
      (fromTime === null || time >= fromTime) &&
      (toTime === null || time <= toTime)
    );
  });
}

function countClaimsByStatus(records: ClaimRecord[]) {
  const counts: Record<ClaimRecordStatus, number> = {
    available: 0,
    claimed: 0,
    failed: 0,
    pending_wallet_approval: 0,
    unavailable: 0,
  };
  for (const record of records) {
    counts[record.status] += 1;
  }
  return counts;
}

function getRuleVoteFeeTotal(votes: RuleVoteRecord[]) {
  return votes.reduce(
    (total, vote) =>
      addNumber(
        total,
        vote.feeLamports ??
          calculateRepeatedActionFeeLamports({
            baseFeeLamports: solToLamports(MVP_FEES_SOL.vote),
            sequence: vote.sequence ?? 1,
            turnId: vote.turnId,
          }),
      ),
    0,
  );
}

function getEliminationVoteFeeTotal(votes: RuleEliminationVoteRecord[]) {
  return votes.reduce(
    (total, vote) =>
      addNumber(
        total,
        vote.feeLamports ??
          calculateRepeatedActionFeeLamports({
            baseFeeLamports: solToLamports(MVP_FEES_SOL.vote),
            sequence: vote.sequence ?? 1,
            turnId: vote.turnId,
          }),
      ),
    0,
  );
}

function getTransparencyTurnSummary(turnId: number): TransparencyTurnSummary {
  const round = getRoundSummary(turnId);
  const accounting = round.pool.accounting;
  const approvalVotes = listRuleVotes(turnId).votes;
  const eliminationVotes = listRuleEliminationVotes(turnId).votes;
  const claimRecordsForTurn = listClaimRecords({ turnId });
  const winnerPayoutDustLamports =
    round.winners.original.remainderLamports +
    round.winners.alternative.remainderLamports;
  const expiredUnclaimedLamports = claimRecordsForTurn
    .filter((claim) => claim.status === "unavailable")
    .filter((claim) => claim.statusReason === "CLAIM_WINDOW_EXPIRED")
    .reduce((total, claim) => total + claim.amountLamports, 0);
  const belowThresholdLamports = claimRecordsForTurn
    .filter((claim) => claim.statusReason === "PAYOUT_BELOW_MINIMUM")
    .reduce((total, claim) => total + claim.amountLamports, 0);
  const ruleElimination = round.elimination;
  const ruleStatusCounts = round.rules.reduce(
    (counts, rule) => {
      counts[rule.state] += 1;
      return counts;
    },
    { eligible: 0, invalidated: 0, proposed: 0, removed_paid: 0 },
  );
  const tokenTotal = round.rules.reduce(
    (total, rule) => total + rule.tokenCount,
    0,
  );
  const topRules = [...round.rules]
    .sort((left, right) => right.votes - left.votes || left.ruleId - right.ruleId)
    .slice(0, 5)
    .map((rule) => ({
      creator: rule.proposer,
      ruleId: rule.ruleId,
      title: rule.title,
      totalVotes: rule.votes,
      uniqueApprovalVoters: new Set(
        approvalVotes
          .filter((vote) => vote.ruleId === rule.ruleId)
          .map((vote) => vote.voter),
      ).size,
    }));
  const claimCounts = countClaimsByStatus(claimRecordsForTurn);
  const drawResultHash = round.draw?.drawResult
    ? hashJsonForTransparency(round.draw.drawResult)
    : null;
  const winnerCalculationHash =
    round.winners.records.length > 0
      ? hashJsonForTransparency(round.winners.records)
      : null;

  return {
    activity: {
      claims: claimRecordsForTurn.length,
      eliminationVotes: eliminationVotes.length,
      guesses: round.pool.guesses,
      paidRemovals: round.pool.paidRemovals,
      proposals: round.pool.proposals,
      settlementTransitions: listSettlementTransitions(turnId).length,
      totalVotes: approvalVotes.length + eliminationVotes.length,
    },
    claims: {
      availableLamports: round.claims.availableLamports,
      belowThresholdLamports,
      claimedLamports: round.claims.claimedLamports,
      expiredLamports: expiredUnclaimedLamports,
      pendingLamports: round.claims.pendingLamports,
      rolledOverLamports:
        getTurnRolloverSettlement(turnId)?.totalRolloverLamports ?? 0,
      statusCounts: claimCounts,
    },
    durationHours: round.cycle.durationHours,
    economy: {
      alternativeBucketLamports: accounting.buckets.alternative.totalLamports,
      expiredUnclaimedLamports,
      grossFeesLamports: accounting.grossFeesLamports,
      originalBucketLamports: accounting.buckets.original.totalLamports,
      payoutDustLamports: winnerPayoutDustLamports,
      pendingClaimableLamports: round.claims.availableLamports,
      platformTreasuryLamports: accounting.treasuryLamports,
      prizePoolLamports: accounting.totalVisiblePrizePoolLamports,
      rolloverInLamports:
        accounting.buckets.original.rolloverLamports +
        accounting.buckets.alternative.rolloverLamports,
      rolloverOutLamports:
        getTurnRolloverSettlement(turnId)?.totalRolloverLamports ?? 0,
      sources: accounting.sources,
    },
    proofs: {
      activeRuleId: round.election?.activeRuleId ?? null,
      auditChainHead:
        listAuditLogs({ turnId }).at(-1)?.logHash ??
        listSettlementTransitions(turnId).at(-1)?.auditLogHash ??
        null,
      drawRandomnessAccount: round.draw?.randomnessAccount ?? null,
      drawRandomnessSource: round.draw?.randomnessSource ?? null,
      drawResultHash,
      eligiblePoolHash: round.election?.eligibleRulePoolHash ?? null,
      finalistSetHash: round.election?.finalistSetHash ?? null,
      ruleElectionRandomnessAccount: round.election?.randomnessAccount ?? null,
      ruleElectionRandomnessSource: round.election?.randomnessSource ?? null,
      settlementAuditEndpoint: `/audit?turnId=${turnId}`,
      winnerCalculationHash,
    },
    rewards: {
      creatorRewardLamports: round.rewards.creator?.finalRewardLamports ?? 0,
      creatorRewardReserveLamports: round.rewards.creatorRewardReserveLamports,
      remainingReserveLamports: round.rewards.remainingReserveLamports,
      voterRewardLamports: round.rewards.voterRewardPool.finalPoolLamports,
      voterRewardRecipients: round.rewards.voterRewardPool.voterCount,
    },
    rules: {
      activeRuleId: round.election?.activeRuleId ?? null,
      clarityLabelCount: round.rules.filter((rule) => rule.validation !== null)
        .length,
      difficultyLabelCount: round.rules.filter((rule) => rule.validation !== null)
        .length,
      eliminated: ruleElimination.eliminatedRuleIds.length,
      finalistRuleIds: round.election?.finalistRuleIds ?? [],
      invalidated: ruleStatusCounts.invalidated,
      precompiled: round.rules.filter(
        (rule) => rule.precompilationStatus === "passed",
      ).length,
      proposed: round.rules.length,
      randomFinalistRuleIds: round.election?.randomRuleIds ?? [],
      removed: ruleStatusCounts.removed_paid,
      ruleTokenCountAverage:
        round.rules.length === 0 ? 0 : Math.round(tokenTotal / round.rules.length),
      survived: ruleElimination.survivorRuleIds.length,
      topRules,
      topVotedFinalistRuleIds: round.election?.topVotedRuleIds ?? [],
    },
    status: round.status,
    turnId,
    voting: {
      approvalFeeLamports: getRuleVoteFeeTotal(approvalVotes),
      repeatedApprovalVotes: approvalVotes.filter(
        (vote) => (vote.sequence ?? 1) > 1,
      ).length,
      repeatedEliminationVotes: eliminationVotes.filter(
        (vote) => (vote.sequence ?? 1) > 1,
      ).length,
      totalApprovalVotes: approvalVotes.length,
      totalEliminationVotes: eliminationVotes.length,
      uniqueApprovalVoters: new Set(approvalVotes.map((vote) => vote.voter)).size,
      uniqueEliminationVoters: new Set(
        eliminationVotes.map((vote) => vote.voter),
      ).size,
      eliminationFeeLamports: getEliminationVoteFeeTotal(eliminationVotes),
    },
  };
}

function getTransparencySourceReferences(): TransparencySourceReference[] {
  return [
    {
      derivation:
        "Turn status, duration, public action counts, fee buckets, rewards, winners, claims, and rollover totals are read from the public round projection.",
      endpoint: "/rounds/{turnId}",
      label: "Round projection",
      source: "public_api_projection",
    },
    {
      derivation:
        "Rule lifecycle, finalist composition, active election, draw proof fields, and public hashes are derived from indexed public program state and public audit records.",
      endpoint: "/audit?turnId={turnId}",
      label: "Audit chain",
      source: "audit_log",
    },
    {
      derivation:
        "Repeated approval and elimination vote fee totals are reconciled against PRD fee sequencing and prize-pool accounting.",
      endpoint: "/admin/repeated-vote-fee-reconciliation/{turnId}",
      label: "Repeated vote fee reconciliation",
      source: "public_api_projection",
    },
    {
      derivation:
        "Prize pool and proof references can be checked against program accounts and devnet transactions exposed by public round pages.",
      endpoint: "/round/{turnId}",
      label: "On-chain references",
      source: "on_chain_account",
    },
  ];
}

function getTopCreators(turns: TransparencyTurnSummary[]) {
  const creators = new Map<
    string,
    {
      creator: string;
      electedRules: Set<string>;
      proposedRules: number;
      rewardLamports: number;
      votesReceived: number;
      winnerProducingRules: Set<string>;
    }
  >();

  for (const turn of turns) {
    for (const proposal of listRuleProposals(turn.turnId)) {
      const record =
        creators.get(proposal.proposer) ??
        {
          creator: proposal.proposer,
          electedRules: new Set<string>(),
          proposedRules: 0,
          rewardLamports: 0,
          votesReceived: 0,
          winnerProducingRules: new Set<string>(),
        };
      record.proposedRules += 1;
      record.votesReceived += listRuleVotes(turn.turnId).votes.filter(
        (vote) => vote.ruleId === proposal.ruleId,
      ).length;
      if (turn.rules.activeRuleId === proposal.ruleId) {
        record.electedRules.add(`${turn.turnId}:${proposal.ruleId}`);
      }
      if (
        turn.rules.activeRuleId === proposal.ruleId &&
        getWinnerSummary(turn.turnId).alternative.winnerCount > 0
      ) {
        record.winnerProducingRules.add(`${turn.turnId}:${proposal.ruleId}`);
      }
      creators.set(proposal.proposer, record);
    }
  }

  for (const reward of creatorRewardRecords.values()) {
    const record =
      creators.get(reward.creatorWallet) ??
      {
        creator: reward.creatorWallet,
        electedRules: new Set<string>(),
        proposedRules: 0,
        rewardLamports: 0,
        votesReceived: 0,
        winnerProducingRules: new Set<string>(),
      };
    record.rewardLamports += reward.finalRewardLamports;
    creators.set(reward.creatorWallet, record);
  }

  return [...creators.values()]
    .map((creator) => ({
      creator: creator.creator,
      electedRules: creator.electedRules.size,
      proposedRules: creator.proposedRules,
      rewardLamports: creator.rewardLamports,
      votesReceived: creator.votesReceived,
      winnerProducingRules: creator.winnerProducingRules.size,
    }))
    .sort(
      (left, right) =>
        right.electedRules - left.electedRules ||
        right.votesReceived - left.votesReceived ||
        right.proposedRules - left.proposedRules,
    )
    .slice(0, 10);
}

function getRepeatedPaidActionTrends(turnIds: number[]) {
  const turnIdSet = new Set(turnIds);
  const guessRecords = [...guessReceipts.values()].filter((record) =>
    turnIdSet.has(record.turnId),
  );
  const proposalRecords = [...ruleProposals.values()].filter((record) =>
    turnIdSet.has(record.turnId),
  );
  const approvalVoteRecords = [...ruleVotes.values()].filter((record) =>
    turnIdSet.has(record.turnId),
  );
  const eliminationVoteRecords = [...ruleEliminationVotes.values()].filter(
    (record) => turnIdSet.has(record.turnId),
  );
  const removalRecords = [...paidRuleRemovals.values()].filter((record) =>
    turnIdSet.has(record.turnId),
  );

  return [
    {
      count: guessRecords.filter((record) => (record.sequence ?? 1) > 1).length,
      feeLamports: guessRecords.reduce(
        (total, record) => addNumber(total, record.feeLamports),
        0,
      ),
      scope: "guess" as const,
    },
    {
      count: proposalRecords.filter((record) => (record.sequence ?? 1) > 1)
        .length,
      feeLamports: proposalRecords.reduce(
        (total, record) => addNumber(total, record.feeLamports),
        0,
      ),
      scope: "rule_proposal" as const,
    },
    {
      count: approvalVoteRecords.filter((record) => (record.sequence ?? 1) > 1)
        .length,
      feeLamports: getRuleVoteFeeTotal(approvalVoteRecords),
      scope: "approval_vote" as const,
    },
    {
      count: eliminationVoteRecords.filter(
        (record) => (record.sequence ?? 1) > 1,
      ).length,
      feeLamports: getEliminationVoteFeeTotal(eliminationVoteRecords),
      scope: "elimination_vote" as const,
    },
    {
      count: removalRecords.length,
      feeLamports: removalRecords.reduce(
        (total, record) => addNumber(total, record.feeLamports),
        0,
      ),
      scope: "paid_rule_removal" as const,
    },
  ];
}

function incrementCount<T extends string>(
  counts: Record<T, number>,
  key: T,
  amount = 1,
) {
  counts[key] = (counts[key] ?? 0) + amount;
}

function getConfidenceBucket(
  confidence: number,
): ConfidenceBucket {
  if (confidence < 0.5) {
    return "0_50";
  }
  if (confidence < 0.7) {
    return "50_70";
  }
  if (confidence < 0.9) {
    return "70_90";
  }
  return "90_100";
}

function emptyConfidenceBuckets(): ConfidenceBucketCounts {
  return {
    "0_50": 0,
    "50_70": 0,
    "70_90": 0,
    "90_100": 0,
  };
}

function percentile(values: number[], percentileValue: number) {
  if (values.length === 0) {
    return 0;
  }
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil((percentileValue / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))] ?? 0;
}

function parseOptionalTimestamp(value: string | null | undefined) {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function getValidationLatencyMs(validation: RuleValidationRecord) {
  const proposal = ruleProposals.get(
    getRuleProposalKey(validation.turnId, validation.ruleId),
  );
  const startedAt = parseOptionalTimestamp(proposal?.submittedAt);
  const finishedAt = parseOptionalTimestamp(validation.validatedAt);
  if (startedAt === null || finishedAt === null || finishedAt < startedAt) {
    return null;
  }
  return finishedAt - startedAt;
}

function getJobLatencyMs(job: GuessVerificationJobRecord) {
  const startedAt = parseOptionalTimestamp(job.createdAt);
  const finishedAt = parseOptionalTimestamp(job.completedAt ?? job.updatedAt);
  if (startedAt === null || finishedAt === null || finishedAt < startedAt) {
    return null;
  }
  return finishedAt - startedAt;
}

function isGuardrailReason(reason: string) {
  return [
    "AMBIGUOUS_RULE",
    "COMPLEXITY_EXCEEDED",
    "EXTERNAL_DEPENDENCY",
    "REVIEWER_MISMATCH",
    "RUNTIME_TEST_FAILED",
    "SCHEMA_INVALID",
    "UNSAFE_RUNTIME_BOUNDS",
    "UNSUPPORTED_RULE",
  ].includes(reason);
}

function getConfiguredCostPerThousandTokensUsd() {
  const value = Number(process.env.LLM_ESTIMATED_COST_PER_1K_TOKENS_USD ?? "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function getModelName(identity: AgentModelIdentity) {
  return identity.model || "not_recorded";
}

function getProviderName(identity: AgentModelIdentity, provider: string) {
  return provider || identity.provider || "not_recorded";
}

export function getOperatorAiOperationsSnapshot(): OperatorAiOperationsSnapshot {
  const validations = [...ruleValidations.values()];
  const proposals = [...ruleProposals.values()];
  const jobs = [...verificationJobs.values()];
  const validationLogs = [...auditLogs.values()].filter(
    (log) => log.kind === "compiler.validation",
  );
  const guessVerificationLogs = [...auditLogs.values()].filter(
    (log) => log.kind === "guess.verification",
  );
  const modelRoutingMap = new Map<
    string,
    OperatorAiOperationsSnapshot["modelRouting"][number]
  >();
  const latencyMap = new Map<
    string,
    {
      model: string;
      provider: string;
      role: AiOperationRole;
      source: OperatorAiOperationsSnapshot["latencyPercentiles"][number]["source"];
      values: number[];
    }
  >();
  const failureMap = new Map<string, OperatorAiOperationsSnapshot["failureCounts"][number]>();
  const localModelMap = new Map<string, OperatorAiOperationsSnapshot["localModelHealth"][number]>();
  const queueStatusCounts: Record<GuessVerificationJobStatus, number> = {
    completed: 0,
    dead_letter: 0,
    pending: 0,
    processing: 0,
    retry_scheduled: 0,
  };
  const confidenceActionCounts: Record<string, number> = {};
  const decisionCounts: Record<string, number> = {};
  const reasonCodeCounts: Record<string, number> = {};
  const compilerConfidenceBuckets = emptyConfidenceBuckets();
  const finalConfidenceBuckets = emptyConfidenceBuckets();
  const modelConfidenceBuckets = emptyConfidenceBuckets();
  const redactedIncidents: OperatorAiOperationsSnapshot["redactedIncidents"] = [];

  function addLatency(args: {
    model: string;
    provider: string;
    role: AiOperationRole;
    source: OperatorAiOperationsSnapshot["latencyPercentiles"][number]["source"];
    valueMs: number | null;
  }) {
    if (args.valueMs === null) {
      return;
    }
    const key = `${args.source}:${args.role}:${args.provider}:${args.model}`;
    const row =
      latencyMap.get(key) ??
      {
        model: args.model,
        provider: args.provider,
        role: args.role,
        source: args.source,
        values: [],
      };
    row.values.push(args.valueMs);
    latencyMap.set(key, row);
  }

  function addFailure(args: {
    model: string;
    provider: string;
    role: AiOperationRole;
    status: OperatorAiOperationsSnapshot["failureCounts"][number]["status"];
  }) {
    const key = `${args.role}:${args.provider}:${args.model}:${args.status}`;
    const row =
      failureMap.get(key) ??
      {
        count: 0,
        model: args.model,
        provider: args.provider,
        role: args.role,
        status: args.status,
      };
    row.count += 1;
    failureMap.set(key, row);
  }

  for (const validation of validations) {
    const latencyMs = getValidationLatencyMs(validation);
    const auditEndpoint = validation.auditLogHash
      ? `/audit/${validation.auditLogHash}`
      : null;

    for (const role of ["compilation", "review", "final_validation"] as const) {
      addLatency({
        model: validation.model,
        provider: validation.provider,
        role,
        source: "end_to_end_rule_validation_projection",
        valueMs: latencyMs,
      });
    }

    for (const attempt of validation.providerPath) {
      const model = getModelName(attempt.model_identity);
      const provider = getProviderName(attempt.model_identity, attempt.provider);
      const role: AiOperationRole = "compilation";
      const routingKey = `${role}:${provider}:${model}`;
      const routing =
        modelRoutingMap.get(routingKey) ??
        {
          escalationCount: 0,
          fallbackTriggered: 0,
          local: attempt.capability_flags.local,
          model,
          provider,
          role,
          statuses: {},
          validationCalls: 0,
        };
      routing.validationCalls += 1;
      routing.fallbackTriggered += validation.providerPath.length > 1 ? 1 : 0;
      routing.escalationCount += attempt.status === "escalated" ? 1 : 0;
      incrementCount(routing.statuses, attempt.status);
      modelRoutingMap.set(routingKey, routing);

      if (attempt.capability_flags.local) {
        localModelMap.set(`${provider}:${model}`, {
          configuredModel: model,
          digest: attempt.model_identity.digest,
          lastHealthCheckResult: "available_from_validation",
          provider,
          quantization: attempt.model_identity.quantization,
          servingEngine: attempt.model_identity.serving_engine,
        });
      }

      if (attempt.status === "timeout") {
        addFailure({ model, provider, role, status: "timeout" });
      } else if (attempt.status === "malformed_response") {
        addFailure({ model, provider, role, status: "malformed_response" });
      } else if (attempt.status === "schema_validation_failed") {
        addFailure({ model, provider, role, status: "schema_validation_failed" });
      } else if (attempt.status === "provider_disagreement") {
        addFailure({ model, provider, role, status: "provider_error" });
      }

      if (
        attempt.status === "timeout" ||
        attempt.status === "malformed_response" ||
        attempt.status === "schema_validation_failed" ||
        attempt.status === "provider_disagreement"
      ) {
        redactedIncidents.push({
          artifactHash: validation.compiledArtifactHash,
          auditEndpoint,
          auditLogHash: validation.auditLogHash ?? null,
          model,
          provider,
          reasonCodes: validation.reasonCodes,
          role,
          ruleId: validation.ruleId,
          status: attempt.status,
          turnId: validation.turnId,
        });
      }
    }

    incrementCount(confidenceActionCounts, validation.confidenceAction);
    incrementCount(decisionCounts, validation.decision);
    incrementCount(
      compilerConfidenceBuckets,
      getConfidenceBucket(validation.confidence.compiler_confidence),
    );
    incrementCount(finalConfidenceBuckets, getConfidenceBucket(validation.finalConfidence));
    incrementCount(
      modelConfidenceBuckets,
      getConfidenceBucket(validation.confidence.model_confidence),
    );
    for (const code of validation.reasonCodes) {
      incrementCount(reasonCodeCounts, code);
      if (isGuardrailReason(code)) {
        addFailure({
          model: validation.model,
          provider: validation.provider,
          role: "review",
          status: "guardrail_rejection",
        });
      }
    }
  }

  for (const job of jobs) {
    incrementCount(queueStatusCounts, job.status);
    addLatency({
      model: job.activeRuleArtifact ? "rule-runtime" : "original-rule-runtime",
      provider: "idealer-worker",
      role: "final_validation",
      source: "guess_verification_queue_projection",
      valueMs: getJobLatencyMs(job),
    });
  }

  const fallbackCount = validations.filter(
    (validation) => validation.fallbackTriggered,
  ).length;
  const disagreementTotal = validations.reduce(
    (total, validation) => total + validation.providerDisagreementRateSample,
    0,
  );
  const totalTokens = proposals.reduce(
    (total, proposal) => total + proposal.tokenCount,
    0,
  );
  const costPerThousandTokensUsd = getConfiguredCostPerThousandTokensUsd();

  return {
    access: {
      permissions: ["ai_ops:read", "ai_ops:export"],
      readOnly: true,
      role: "ai_operator",
    },
    agentCallVolumeByRole: [
      {
        calls: proposals.length,
        role: "interpretation",
        source: "rule proposal preflight projection",
      },
      {
        calls: proposals.length,
        role: "normalization",
        source: "rule proposal preflight projection",
      },
      {
        calls: validations.length,
        role: "compilation",
        source: "compiler validation audit logs",
      },
      {
        calls: validations.length,
        role: "review",
        source: "compiler confidence and reason-code review",
      },
      {
        calls: validations.reduce(
          (total, validation) => total + validation.evaluatedTestCases.length,
          0,
        ),
        role: "adversarial_testing",
        source: "compiler evaluated test cases",
      },
      {
        calls: validations.length + jobs.length,
        role: "final_validation",
        source: "compiler decisions plus verification queue",
      },
    ],
    auditLinks: validations.slice(0, 20).map((validation) => ({
      artifactHash: validation.compiledArtifactHash,
      auditEndpoint: validation.auditLogHash
        ? `/audit/${validation.auditLogHash}`
        : "/audit",
      auditLogHash: validation.auditLogHash ?? null,
      role: "compilation",
      ruleId: validation.ruleId,
      turnId: validation.turnId,
      validationLogId: validation.validationLogId,
    })),
    confidenceDistributions: {
      compilerConfidenceBuckets,
      finalConfidenceBuckets,
      modelConfidenceBuckets,
    },
    estimatedCost: {
      costPerThousandTokensUsd,
      estimatedUsd: (totalTokens / 1_000) * costPerThousandTokensUsd,
      source: costPerThousandTokensUsd > 0 ? "configured_rate" : "not_configured",
      totalTokens,
    },
    failureCounts: [...failureMap.values()].sort(
      (left, right) => right.count - left.count,
    ),
    generatedAt: new Date().toISOString(),
    latencyPercentiles: [...latencyMap.values()]
      .map((row) => ({
        count: row.values.length,
        model: row.model,
        p50Ms: percentile(row.values, 50),
        p95Ms: percentile(row.values, 95),
        provider: row.provider,
        role: row.role,
        source: row.source,
      }))
      .sort(
        (left, right) =>
          left.role.localeCompare(right.role) ||
          left.provider.localeCompare(right.provider),
      ),
    localModelHealth:
      localModelMap.size === 0
        ? [
            {
              configuredModel: "not_recorded",
              digest: null,
              lastHealthCheckResult: "not_recorded",
              provider: "not_recorded",
              quantization: null,
              servingEngine: "not_recorded",
            },
          ]
        : [...localModelMap.values()],
    modelRouting: [...modelRoutingMap.values()].sort(
      (left, right) =>
        left.role.localeCompare(right.role) ||
        right.validationCalls - left.validationCalls ||
        left.provider.localeCompare(right.provider),
    ),
    operationCounts: {
      auditCompilerValidationLogs: validationLogs.length,
      auditGuessVerificationLogs: guessVerificationLogs.length,
      validationCalls: validations.length,
      verificationJobs: jobs.length,
    },
    queue: {
      backlogJobs:
        queueStatusCounts.pending +
        queueStatusCounts.processing +
        queueStatusCounts.retry_scheduled,
      deadLetterJobs: queueStatusCounts.dead_letter,
      statusCounts: queueStatusCounts,
    },
    redactionPolicy: {
      exportedFieldsOnly: [
        "provider",
        "model",
        "role",
        "validation_counts",
        "fallback_counts",
        "escalation_counts",
        "confidence_buckets",
        "reason_code_counts",
        "queue_status_counts",
        "audit_log_counts",
        "latency_percentiles",
        "token_counts",
        "estimated_cost",
        "local_model_identity",
        "redacted_incident_status",
      ],
      excludedFields: [
        "raw_prompt",
        "raw_completion",
        "normalized_text",
        "compiled_artifact",
        "provider_request_body",
        "provider_response_body",
        "provider_api_key",
        "secret_value",
        "private_user_analytics",
        "ip_address",
        "device_fingerprint",
        "session_id",
        "unredacted_stack_trace",
      ],
    },
    redactedIncidents: redactedIncidents.slice(0, 20),
    ruleCompiler: {
      confidenceActionCounts,
      decisionCounts,
      fallbackRate: validations.length === 0 ? 0 : fallbackCount / validations.length,
      providerDisagreementAverage:
        validations.length === 0 ? 0 : disagreementTotal / validations.length,
      reasonCodeCounts,
    },
    sourceReferences: [
      {
        endpoint: "/audit?kind=compiler.validation",
        label: "Compiler validation audit logs",
        source: "audit_log",
        status: "available",
      },
      {
        endpoint: "/verification-jobs",
        label: "Guess verification queue projection",
        source: "queue_projection",
        status: "available",
      },
      {
        endpoint: "/operator/ai-operations",
        label: "Restricted redacted AI operations aggregate",
        source: "internal_projection",
        status: "available",
      },
      {
        endpoint: "OPERATOR_AI_CONSOLE_TOKEN",
        label: "Operator bearer token gate",
        source: "operator_config",
        status: "available",
      },
      {
        endpoint: "rule_proposals.submittedAt -> rule_validations.validatedAt",
        label: "Provider latency percentiles",
        source: "internal_projection",
        status: "available",
      },
      {
        endpoint: "LLM_ESTIMATED_COST_PER_1K_TOKENS_USD",
        label: "Token usage and estimated LLM cost",
        source: "internal_projection",
        status: costPerThousandTokensUsd > 0 ? "available" : "not_recorded",
      },
    ],
  };
}

export function exportOperatorAiOperationsCsv(
  snapshot: OperatorAiOperationsSnapshot,
) {
  const columns = [
    "role",
    "provider",
    "model",
    "validation_calls",
    "fallback_triggered",
    "escalation_count",
    "fallback_rate",
    "provider_disagreement_average",
    "p50_latency_ms",
    "p95_latency_ms",
    "total_tokens",
    "estimated_cost_usd",
    "verification_jobs",
    "backlog_jobs",
    "dead_letter_jobs",
    "redaction_note",
  ];
  const redactionNote =
    "Restricted operator export includes redacted aggregates only; raw prompts, completions, compiled artifacts, provider payloads, secrets, private analytics, and unredacted stack traces are excluded.";
  const rows =
    snapshot.modelRouting.length === 0
      ? [
          [
            "",
            "",
            "",
            0,
            0,
            0,
            snapshot.ruleCompiler.fallbackRate,
            snapshot.ruleCompiler.providerDisagreementAverage,
            0,
            0,
            snapshot.estimatedCost.totalTokens,
            snapshot.estimatedCost.estimatedUsd,
            snapshot.operationCounts.verificationJobs,
            snapshot.queue.backlogJobs,
            snapshot.queue.deadLetterJobs,
            redactionNote,
          ],
        ]
      : snapshot.modelRouting.map((routing) => [
          routing.role,
          routing.provider,
          routing.model,
          routing.validationCalls,
          routing.fallbackTriggered,
          routing.escalationCount,
          snapshot.ruleCompiler.fallbackRate,
          snapshot.ruleCompiler.providerDisagreementAverage,
          snapshot.latencyPercentiles.find(
            (latency) =>
              latency.role === routing.role &&
              latency.provider === routing.provider &&
              latency.model === routing.model,
          )?.p50Ms ?? 0,
          snapshot.latencyPercentiles.find(
            (latency) =>
              latency.role === routing.role &&
              latency.provider === routing.provider &&
              latency.model === routing.model,
          )?.p95Ms ?? 0,
          snapshot.estimatedCost.totalTokens,
          snapshot.estimatedCost.estimatedUsd,
          snapshot.operationCounts.verificationJobs,
          snapshot.queue.backlogJobs,
          snapshot.queue.deadLetterJobs,
          redactionNote,
        ]);

  return [
    columns.map(csvCell).join(","),
    ...rows.map((row) => row.map(csvCell).join(",")),
  ].join("\n");
}

export function authorizeOperatorAiRequest(
  authorizationHeader: string | undefined,
  env: Partial<Pick<NodeJS.ProcessEnv, "OPERATOR_AI_CONSOLE_TOKEN">> = process.env,
) {
  const configuredToken = env.OPERATOR_AI_CONSOLE_TOKEN?.trim();
  if (!configuredToken) {
    return {
      error: "operator_ai_operations_disabled",
      ok: false as const,
      statusCode: 503,
    };
  }

  const prefix = "Bearer ";
  if (!authorizationHeader?.startsWith(prefix)) {
    return {
      error: "operator_authorization_required",
      ok: false as const,
      statusCode: 401,
    };
  }

  const providedToken = authorizationHeader.slice(prefix.length).trim();
  const configuredHash = createHash("sha256").update(configuredToken).digest();
  const providedHash = createHash("sha256").update(providedToken).digest();
  if (!timingSafeEqual(configuredHash, providedHash)) {
    return {
      error: "operator_authorization_denied",
      ok: false as const,
      statusCode: 403,
    };
  }

  return {
    ok: true as const,
    permissions: ["ai_ops:read", "ai_ops:export"] as const,
    role: "ai_operator" as const,
  };
}

export function getTransparencySnapshot(
  filters: TransparencyFilters = {},
): TransparencySnapshot {
  const allTurnIds = getPublicTurnIds();
  const minTurnId = allTurnIds[0] ?? IDEALER_ACTIVE_TURN_ID;
  const maxTurnId = allTurnIds.at(-1) ?? IDEALER_ACTIVE_TURN_ID;
  const fromTurnId = filters.fromTurnId ?? minTurnId;
  const toTurnId = filters.toTurnId ?? maxTurnId;
  const turnIds = allTurnIds.filter(
    (turnId) =>
      turnId >= fromTurnId &&
      turnId <= toTurnId &&
      turnMatchesDateFilter(turnId, filters),
  );
  const turns = turnIds.map((turnId) => getTransparencyTurnSummary(turnId));
  const totals = turns.reduce(
    (summary, turn) => ({
      alternativePrizeLamports:
        summary.alternativePrizeLamports + turn.economy.alternativeBucketLamports,
      approvalVotes: summary.approvalVotes + turn.voting.totalApprovalVotes,
      claims: summary.claims + turn.activity.claims,
      creatorRewardLamports:
        summary.creatorRewardLamports + turn.rewards.creatorRewardLamports,
      creatorRewardReserveLamports:
        summary.creatorRewardReserveLamports +
        turn.rewards.creatorRewardReserveLamports,
      drawProofs:
        summary.drawProofs + (turn.proofs.drawRandomnessAccount ? 1 : 0),
      eliminationVotes:
        summary.eliminationVotes + turn.voting.totalEliminationVotes,
      grossFeesLamports: summary.grossFeesLamports + turn.economy.grossFeesLamports,
      guesses: summary.guesses + turn.activity.guesses,
      paidRemovals: summary.paidRemovals + turn.activity.paidRemovals,
      platformTreasuryLamports:
        summary.platformTreasuryLamports + turn.economy.platformTreasuryLamports,
      proposals: summary.proposals + turn.activity.proposals,
      rewardReserveRemainingLamports:
        summary.rewardReserveRemainingLamports +
        turn.rewards.remainingReserveLamports,
      rolloverInLamports:
        summary.rolloverInLamports + turn.economy.rolloverInLamports,
      rolloverOutLamports:
        summary.rolloverOutLamports + turn.economy.rolloverOutLamports,
      settlementTransitions:
        summary.settlementTransitions + turn.activity.settlementTransitions,
      voterRewardLamports:
        summary.voterRewardLamports + turn.rewards.voterRewardLamports,
      winnerPayoutLamports:
        summary.winnerPayoutLamports +
        getWinnerSummary(turn.turnId).records.reduce(
          (total, winner) => total + winner.payoutLamports,
          0,
        ),
    }),
    {
      alternativePrizeLamports: 0,
      approvalVotes: 0,
      claims: 0,
      creatorRewardLamports: 0,
      creatorRewardReserveLamports: 0,
      drawProofs: 0,
      eliminationVotes: 0,
      grossFeesLamports: 0,
      guesses: 0,
      paidRemovals: 0,
      platformTreasuryLamports: 0,
      proposals: 0,
      rewardReserveRemainingLamports: 0,
      rolloverInLamports: 0,
      rolloverOutLamports: 0,
      settlementTransitions: 0,
      voterRewardLamports: 0,
      winnerPayoutLamports: 0,
    },
  );
  const durationMap = new Map<
    number,
    TransparencySnapshot["trends"]["byTurnDuration"][number]
  >();
  for (const turn of turns) {
    const current =
      durationMap.get(turn.durationHours) ??
      {
        approvalVotes: 0,
        creatorRewardLamports: 0,
        durationHours: turn.durationHours,
        eliminationVotes: 0,
        grossFeesLamports: 0,
        guesses: 0,
        prizePoolLamports: 0,
        proposals: 0,
        rolloverLamports: 0,
        turns: 0,
        voterRewardLamports: 0,
      };
    current.approvalVotes += turn.voting.totalApprovalVotes;
    current.creatorRewardLamports += turn.rewards.creatorRewardLamports;
    current.eliminationVotes += turn.voting.totalEliminationVotes;
    current.grossFeesLamports += turn.economy.grossFeesLamports;
    current.guesses += turn.activity.guesses;
    current.prizePoolLamports += turn.economy.prizePoolLamports;
    current.proposals += turn.activity.proposals;
    current.rolloverLamports += turn.economy.rolloverOutLamports;
    current.turns += 1;
    current.voterRewardLamports += turn.rewards.voterRewardLamports;
    durationMap.set(turn.durationHours, current);
  }

  return {
    activeTurnId: IDEALER_ACTIVE_TURN_ID,
    dataBoundary: {
      deniedPrivateFields: [
        "ip_address",
        "device_fingerprint",
        "session_id",
        "private_user_agent_record",
        "wallet_connect_attempt",
        "wallet_failure",
        "private_funnel_step",
        "retention_cohort",
        "raw_prompt",
        "raw_completion",
        "provider_api_key",
        "secret_value",
        "unrestricted_compiler_reasoning_trace",
        "private_provider_request_response_body",
        "unredacted_stack_trace",
      ],
      publicExportFieldsOnly: true,
      publicMetricsOnly: true,
      restrictedAiOperations: {
        endpoint: "/operator/ai-operations",
        exportEndpoint: "/operator/ai-operations/export",
        role: "ai_operator",
        status: "access_controlled",
      },
    },
    exports: {
      csvPath: "/transparency/export?format=csv",
      excludedPrivateAnalytics: [
        "retention",
        "funnel",
        "device",
        "session",
        "share_acquisition",
      ],
      jsonPath: "/transparency/export?format=json",
    },
    filters: {
      fromTurnId,
      toTurnId,
      ...(filters.fromDate ? { fromDate: filters.fromDate } : {}),
      ...(filters.toDate ? { toDate: filters.toDate } : {}),
    },
    generatedAt: new Date().toISOString(),
    sourceReferences: getTransparencySourceReferences(),
    totals,
    trends: {
      byTurnDuration: [...durationMap.values()].sort(
        (left, right) => left.durationHours - right.durationHours,
      ),
      repeatedPaidActions: getRepeatedPaidActionTrends(turnIds),
      ruleLifecycle: {
        active: turns.filter((turn) => turn.rules.activeRuleId !== null).length,
        eliminated: turns.reduce((total, turn) => total + turn.rules.eliminated, 0),
        finalist: turns.reduce(
          (total, turn) => total + turn.rules.finalistRuleIds.length,
          0,
        ),
        invalidated: turns.reduce(
          (total, turn) => total + turn.rules.invalidated,
          0,
        ),
        proposed: turns.reduce((total, turn) => total + turn.rules.proposed, 0),
        removed: turns.reduce((total, turn) => total + turn.rules.removed, 0),
        survived: turns.reduce((total, turn) => total + turn.rules.survived, 0),
      },
      topCreators: getTopCreators(turns),
    },
    turns,
  };
}

function csvCell(value: string | number | null) {
  const text = value === null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export function exportTransparencySnapshotCsv(snapshot: TransparencySnapshot) {
  const columns = [
    "turn_id",
    "status",
    "duration_hours",
    "guesses",
    "proposals",
    "approval_votes",
    "elimination_votes",
    "paid_removals",
    "gross_fees_lamports",
    "treasury_lamports",
    "prize_pool_lamports",
    "original_bucket_lamports",
    "alternative_bucket_lamports",
    "rollover_in_lamports",
    "rollover_out_lamports",
    "winner_payout_hash",
    "draw_result_hash",
    "eligible_pool_hash",
    "finalist_set_hash",
    "creator_reward_lamports",
    "voter_reward_lamports",
    "audit_endpoint",
    "derivation_note",
  ];
  const derivationNote =
    "All fields are public/on-chain, public API projections, or public audit-log derivations; private retention, funnel, device, session, raw prompt, and raw completion fields are excluded.";
  const rows = snapshot.turns.map((turn) =>
    [
      turn.turnId,
      turn.status,
      turn.durationHours,
      turn.activity.guesses,
      turn.activity.proposals,
      turn.voting.totalApprovalVotes,
      turn.voting.totalEliminationVotes,
      turn.activity.paidRemovals,
      turn.economy.grossFeesLamports,
      turn.economy.platformTreasuryLamports,
      turn.economy.prizePoolLamports,
      turn.economy.originalBucketLamports,
      turn.economy.alternativeBucketLamports,
      turn.economy.rolloverInLamports,
      turn.economy.rolloverOutLamports,
      turn.proofs.winnerCalculationHash,
      turn.proofs.drawResultHash,
      turn.proofs.eligiblePoolHash,
      turn.proofs.finalistSetHash,
      turn.rewards.creatorRewardLamports,
      turn.rewards.voterRewardLamports,
      turn.proofs.settlementAuditEndpoint,
      derivationNote,
    ]
      .map(csvCell)
      .join(","),
  );
  return [columns.join(","), ...rows].join("\n");
}

function parseTransparencyFilters(
  url: URL,
): { filters: TransparencyFilters } | { error: string } {
  const rawFromTurnId = url.searchParams.get("fromTurnId");
  const rawToTurnId = url.searchParams.get("toTurnId");
  const fromDate = url.searchParams.get("fromDate") ?? undefined;
  const toDate = url.searchParams.get("toDate") ?? undefined;
  const fromTurnId =
    rawFromTurnId === null ? undefined : Number(rawFromTurnId);
  const toTurnId = rawToTurnId === null ? undefined : Number(rawToTurnId);

  if (
    (fromTurnId !== undefined &&
      (!Number.isInteger(fromTurnId) || fromTurnId <= 0)) ||
    (toTurnId !== undefined && (!Number.isInteger(toTurnId) || toTurnId <= 0))
  ) {
    return { error: "invalid_turn_filter" };
  }

  if (
    fromTurnId !== undefined &&
    toTurnId !== undefined &&
    fromTurnId > toTurnId
  ) {
    return { error: "invalid_turn_range" };
  }

  if (
    (fromDate !== undefined && Number.isNaN(Date.parse(fromDate))) ||
    (toDate !== undefined && Number.isNaN(Date.parse(toDate)))
  ) {
    return { error: "invalid_date_filter" };
  }

  return {
    filters: {
      ...(fromDate ? { fromDate } : {}),
      ...(fromTurnId ? { fromTurnId } : {}),
      ...(toDate ? { toDate } : {}),
      ...(toTurnId ? { toTurnId } : {}),
    },
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
        url.pathname.startsWith("/admin/repeated-vote-fee-reconciliation/") ||
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
      url.pathname.startsWith("/admin/repeated-vote-fee-reconciliation/")
    ) {
      const turnId = Number(
        url.pathname.slice("/admin/repeated-vote-fee-reconciliation/".length),
      );

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_turn_id" });
        return;
      }

      sendJson(request, response, 200, {
        reconciliation: getRepeatedVoteFeeReconciliation(turnId),
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

    if (request.method === "GET" && url.pathname === "/transparency") {
      const parsed = parseTransparencyFilters(url);
      if ("error" in parsed) {
        sendJson(request, response, 400, { error: parsed.error });
        return;
      }

      sendJson(request, response, 200, {
        snapshot: getTransparencySnapshot(parsed.filters),
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/transparency/export"
    ) {
      const parsed = parseTransparencyFilters(url);
      if ("error" in parsed) {
        sendJson(request, response, 400, { error: parsed.error });
        return;
      }

      const format = url.searchParams.get("format") ?? "json";
      if (format !== "json" && format !== "csv") {
        sendJson(request, response, 400, { error: "invalid_export_format" });
        return;
      }

      const snapshot = getTransparencySnapshot(parsed.filters);
      if (format === "csv") {
        sendCsv(request, response, 200, exportTransparencySnapshotCsv(snapshot));
        return;
      }

      sendJson(request, response, 200, {
        snapshot,
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/operator/ai-operations") {
      const auth = authorizeOperatorAiRequest(request.headers.authorization);
      if (!auth.ok) {
        sendJson(request, response, auth.statusCode, { error: auth.error });
        return;
      }

      sendJson(request, response, 200, {
        snapshot: getOperatorAiOperationsSnapshot(),
      });
      return;
    }

    if (
      request.method === "GET" &&
      url.pathname === "/operator/ai-operations/export"
    ) {
      const auth = authorizeOperatorAiRequest(request.headers.authorization);
      if (!auth.ok) {
        sendJson(request, response, auth.statusCode, { error: auth.error });
        return;
      }

      const format = url.searchParams.get("format") ?? "json";
      if (format !== "json" && format !== "csv") {
        sendJson(request, response, 400, { error: "invalid_export_format" });
        return;
      }

      const snapshot = getOperatorAiOperationsSnapshot();
      if (format === "csv") {
        sendCsv(
          request,
          response,
          200,
          exportOperatorAiOperationsCsv(snapshot),
          "idealer-operator-ai-operations.csv",
        );
        return;
      }

      sendJson(request, response, 200, {
        snapshot,
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
