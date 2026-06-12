import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import {
  MVP_FEES_SOL,
  RULE_MAX_TOKENS,
  TURN_DURATION_CYCLE_HOURS,
} from "@idealer/constants";
import {
  validateAndPrecompileRule,
  type CompilerConfidenceBreakdown,
  type RuleCompiledArtifact,
  type RuleConfidenceAction,
  type RuleValidationDecision,
  type RuleValidationReasonCode,
  type RuleValidationTestResult,
} from "@idealer/rule-compiler";
import pg from "pg";
import { createClient } from "redis";

const { Pool } = pg;
const MAX_RULE_TEXT_BYTES = 320;
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
  maxTokens: number;
  normalizedTextHash: readonly number[];
  officialInterpretationHash: readonly number[];
  preflightResultHash: readonly number[];
  ruleId: number;
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
  confidenceAction: RuleConfidenceAction;
  decision: RuleValidationDecision;
  finalConfidence: number;
  model: string;
  reasonCodes: RuleValidationReasonCode[];
  reasonSummary: string;
  validatedAt: string;
  validationLogId: string;
}

export interface RuleValidationRecord extends RuleValidationSummary {
  compiledArtifactHash: string | null;
  compiledArtifact: RuleCompiledArtifact | null;
  confidence: CompilerConfidenceBreakdown;
  evaluatedTestCases: RuleValidationTestResult[];
  normalizedText: string;
  provider: string;
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
}

export interface GuessVerificationResultRecord {
  activeRuleId: number | null;
  alternative: RuleVerificationResultRecord | null;
  completedAt: string;
  jobId: string;
  original: RuleVerificationResultRecord;
  player: string;
  resultId: string;
  status: "completed";
  turnId: number;
}

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
const draws = new Map<number, DrawRecord>();
const elections = new Map<number, RuleElectionRecord>();
const ruleValidations = new Map<string, RuleValidationRecord>();
const verificationJobs = new Map<string, GuessVerificationJobRecord>();
const verificationResults = new Map<string, GuessVerificationResultRecord>();
const LOCAL_WEB_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const CORS_PATHS = new Set([
  "/draws",
  "/elections",
  "/guess-receipts",
  "/rule-precompilations",
  "/rule-preflight",
  "/rule-proposals",
  "/rule-validations",
  "/rule-validations/run",
  "/rule-votes",
  "/verification-jobs",
  "/verification-jobs/create-turn",
  "/verification-results",
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

function createRuleId() {
  return Date.now() * 1_000 + randomInt(0, 1_000);
}

function createRulePreflight(text: string): RulePreflightResult {
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

  const normalizedText = sanitizedText.toLowerCase();
  const officialInterpretation = `Compare every eligible guess using this measurable rule: ${sanitizedText}`;
  const ruleId = createRuleId();
  const preflightResult = JSON.stringify({
    maxTokens: RULE_MAX_TOKENS,
    ruleId,
    sanitizedText,
    tokenCount,
    version: 1,
  });

  return {
    maxTokens: RULE_MAX_TOKENS,
    normalizedTextHash: hashBytes(normalizedText),
    officialInterpretationHash: hashBytes(officialInterpretation),
    preflightResultHash: hashBytes(preflightResult),
    ruleId,
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

function isValidGuessVerificationCreateRequest(
  value: unknown,
): value is { turnId: number } {
  if (!value || typeof value !== "object") {
    return false;
  }

  const request = value as { turnId?: unknown };
  return Number.isInteger(request.turnId) && Number(request.turnId) > 0;
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

  const validationSummary: RuleValidationSummary = {
    confidenceAction: record.confidenceAction,
    decision: record.decision,
    finalConfidence: record.finalConfidence,
    model: record.model,
    reasonCodes: record.reasonCodes,
    reasonSummary: record.reasonSummary,
    validatedAt: record.validatedAt,
    validationLogId: record.validationLogId,
  };
  const normalizedRecord: RuleValidationRecord = {
    ...record,
    compiledArtifact: record.compiledArtifact ?? null,
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

export function getRuleValidation(turnId: number, ruleId: number) {
  return ruleValidations.get(getRuleValidationKey(turnId, ruleId)) ?? null;
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

  verificationJobs.set(job.idempotencyKey, updatedJob);
  verificationResults.set(getVerificationResultKey(result.turnId, result.player), result);
  return result;
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
    finalConfidence: result.log.confidence.final_confidence,
    model: result.log.model,
    normalizedText: result.log.normalizedText,
    provider: result.log.provider,
    reasonCodes: result.log.reasonCodes,
    reasonSummary: result.log.reasonSummary,
    ruleId: proposal.ruleId,
    turnId: proposal.turnId,
    validatedAt: result.log.timestamp,
    validationLogId: result.log.validationLogId,
  };

  saveRuleValidation(record);
  return record;
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
  draw: DrawRecord | null;
  election: RuleElectionRecord | null;
  pool: {
    guessSol: number;
    guesses: number;
    indicativeSol: number;
    proposalSol: number;
    proposals: number;
  };
  rules: RoundRuleSummary[];
  status: "completed" | "current" | "upcoming";
  totalVotes: number;
  turnId: number;
  verification: ReturnType<typeof getVerificationSummary>;
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

export function getRoundSummary(
  turnId: number,
  activeTurnId: number = IDEALER_ACTIVE_TURN_ID,
): RoundSummary {
  const proposals = listRuleProposals(turnId);
  const { counts, votes } = listRuleVotes(turnId);
  const guesses = [...guessReceipts.values()].filter(
    (receipt) => receipt.turnId === turnId,
  ).length;

  const cycleLength = TURN_DURATION_CYCLE_HOURS.length;
  const stepIndex = (turnId - 1) % cycleLength;
  const nextStepIndex = turnId % cycleLength;
  const guessSol = guesses * MVP_FEES_SOL.guessSubmission;
  const proposalSol = proposals.length * MVP_FEES_SOL.ruleProposal;

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
    draw: getDraw(turnId),
    election: getRuleElection(turnId),
    pool: {
      guessSol: roundSol(guessSol),
      guesses,
      indicativeSol: roundSol(guessSol + proposalSol),
      proposalSol: roundSol(proposalSol),
      proposals: proposals.length,
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

    if (request.method === "OPTIONS" && CORS_PATHS.has(url.pathname)) {
      sendNoContent(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-preflight") {
      void readJsonBody(request)
        .then((body) => {
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
              preflight: createRulePreflight(text),
            });
          } catch (error) {
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
  });
}
