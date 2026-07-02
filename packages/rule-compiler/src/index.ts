import { createHash } from "node:crypto";
import {
  createDefaultProviderRoutingPolicy,
  calculateCompilerConfidence,
  COMPILER_CONFIDENCE_THRESHOLDS,
  COMPILER_CONFIDENCE_WEIGHTS,
  selectCompilerConfidenceAction,
  type AgentModelIdentity,
  type AgentProviderAttemptLog,
  type AgentProviderAttemptStatus,
  type AgentProviderConfig,
  type AgentProviderPriority,
  type AgentProviderRoutingPolicy,
  type CompilerConfidenceAction,
  type CompilerConfidenceBreakdown,
  type CompilerConfidenceThresholds,
  type CompilerConfidenceWeights,
} from "@idealer/agent-core";
import {
  MAX_AST_DEPTH,
  ruleAstSchema,
  type ArrayExpr,
  type CompareOp,
  type PredicateNode,
  type RuleAst,
  type ScalarExpr,
} from "@idealer/rule-schema";
import {
  generateAndRunTests,
  RULE_TEST_HARNESS_VERSION,
  type RuleDifficultyClass,
  type RuleTestCaseResult,
} from "@idealer/rule-test-harness";
import { RULE_COMPILER_SKILL_VERSION } from "./skill.js";

export type {
  AgentModelIdentity,
  AgentProviderAttemptLog,
  AgentProviderRoutingPolicy,
  CompilerConfidenceBreakdown,
  CompilerConfidenceThresholds,
  CompilerConfidenceWeights,
} from "@idealer/agent-core";

export {
  createDefaultProviderRoutingPolicy,
  createLocalOnlyProviderRoutingPolicy,
} from "@idealer/agent-core";

export {
  getRuleAstJsonSchema,
  isRankingRule,
  ruleAstSchema,
  type RuleAst,
} from "@idealer/rule-schema";
export {
  evaluatePredicate,
  resolveRankingWinners,
  scoreGuess,
  type RankingEntry,
} from "@idealer/rule-runtime";
export { type RuleDifficultyClass } from "@idealer/rule-test-harness";
export {
  buildRuleCompilerSkillPrompt,
  RULE_COMPILER_SKILL,
  RULE_COMPILER_SKILL_VERSION,
} from "./skill.js";

export type RuleConfidenceAction = CompilerConfidenceAction;
export type RuleValidationDecision = "INVALID" | "VALID";
export type RuleValidationReasonCode =
  | "AMBIGUOUS_RULE"
  | "COMPLEXITY_EXCEEDED"
  | "EXTERNAL_DEPENDENCY"
  | "PROVIDER_DISAGREEMENT"
  | "PROVIDER_MALFORMED_RESPONSE"
  | "PROVIDER_SCHEMA_UNCONSTRAINED"
  | "REVIEWER_MISMATCH"
  | "PROVIDER_TIMEOUT"
  | "RUNTIME_TEST_FAILED"
  | "SCHEMA_INVALID"
  | "SUPPORTED_RULE"
  | "UNSUPPORTED_RULE"
  | "UNSAFE_RUNTIME_BOUNDS";

// Async hook that asks an LLM provider to emit a rule AST (raw JSON) for the
// given normalized text. Injected by the API (apps/api/src/llm.ts). When absent,
// the compiler falls back to the deterministic offline pattern compiler.
export type RuleAstProvider = (params: {
  normalizedText: string;
  prompt: string;
  providerConfig: AgentProviderConfig;
}) => Promise<unknown>;

export interface RuleCompileArtifactOptions {
  astProvider: RuleAstProvider;
  preferDeterministic?: boolean;
}

export interface RuleCompilationRequest {
  model?: string;
  officialInterpretation?: string;
  originalText?: string;
  prompt: string;
  providerConfidenceActionByPriority?: Partial<
    Record<AgentProviderPriority, RuleConfidenceAction>
  >;
  provider?: string;
  providerFailureModeByPriority?: Partial<
    Record<AgentProviderPriority, ProviderFailureMode>
  >;
  providerRouting?: AgentProviderRoutingPolicy;
  ruleId?: number;
  timestamp?: string;
  tokenCount: number;
}

export interface RuleCompilationResult {
  ast: RuleAst;
  normalizedText: string;
}

export interface RuleValidationTestCase {
  draw: number[];
  expected: boolean;
  guess: number[];
  name: string;
}

export interface RuleValidationTestResult extends RuleValidationTestCase {
  actual: boolean;
  passed: boolean;
}

export interface RuleValidationLog {
  compiledArtifactHash: string | null;
  confidence: CompilerConfidenceBreakdown;
  confidenceAction: RuleConfidenceAction;
  confidenceThresholds: CompilerConfidenceThresholds;
  confidenceWeights: CompilerConfidenceWeights;
  decision: RuleValidationDecision;
  difficultyClass: RuleDifficultyClass;
  estimatedWinRate: number;
  evaluatedTestCases: RuleValidationTestResult[];
  fallbackRateSample: number;
  fallbackTriggered: boolean;
  generatedTestCases: RuleValidationTestCase[];
  model: string;
  modelIdentity: AgentModelIdentity;
  normalizedText: string;
  promptContract: RuleValidationPromptContract;
  provider: string;
  providerDisagreementRateSample: number;
  providerPath: AgentProviderAttemptLog[];
  reasonCodes: RuleValidationReasonCode[];
  reasonSummary: string;
  ruleId: number | null;
  timestamp: string;
  validationLogId: string;
}

export interface RuleValidationResult {
  artifact: RuleCompiledArtifact | null;
  artifactHash: string | null;
  decision: RuleValidationDecision;
  log: RuleValidationLog;
}

export interface RuleCompiledArtifact {
  ast: RuleAst;
  complexityScore: number;
  constrainedDecodingUsed: boolean;
  createdAt: string;
  difficultyClass: RuleDifficultyClass;
  evaluatedTestCases: RuleValidationTestResult[];
  generatedTestCases: RuleValidationTestCase[];
  harnessCases: RuleTestCaseResult[];
  modelIdentity: AgentModelIdentity;
  normalizedText: string;
  officialInterpretation: string;
  originalText: string;
  promptContractVersion: string;
  providerPath: AgentProviderAttemptLog[];
  ruleMode: "predicate" | "ranking";
  schemaVersion: 1 | 2;
  skillVersion: string;
  testCoverageScore: number;
  testHarnessVersion: string;
}

export type ProviderFailureMode =
  | "malformed_response"
  | "schema_validation_failure"
  | "timeout";

export interface RuleValidationPromptContract {
  allowedInputs: readonly ["guess", "draw"];
  output: "RuleAst | INVALID";
  prohibitedReferences: readonly string[];
  requiredChecks: readonly string[];
  version: "idealer_rule_validation_prompt_v1";
}

const NUMBER_WORDS = new Map<string, number>([
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
]);

const AMBIGUOUS_PATTERNS = [
  /\b(close|closest|near|nearest|almost)\b/i,
  /\b(lucky|unlucky|interesting|creative|best|worst|fair|randomly)\b/i,
  /\b(about|around|roughly|approximately|similar)\b/i,
  /\b(feels?|vibe|balanced|nice|pattern|mirror-like|stronger)\b/i,
  /\b(many|several|spread out|well spread|organized|cleaner)\b/i,
  /\b(anything|something|whatever)\b/i,
] as const;

const EXTERNAL_DEPENDENCY_PATTERNS = [
  /\b(wallet|address|creator|voter|votes?|leaderboard|profile|admin)\b/i,
  /\b(time|timestamp|block|slot|transaction|signature|balance|prize|pool|payout)\b/i,
  /\b(previous|next|future|past|history|streak|yesterday|today|tomorrow)\b/i,
  /\b(other players?|all players?|no other player|among all players)\b/i,
  /\b(weather|rain|rains|sunny|price|oracle|twitter|x\/twitter|discord|website|api|external)\b/i,
] as const;

const PROMPT_CONTRACT: RuleValidationPromptContract = {
  allowedInputs: ["guess", "draw"],
  output: "RuleAst | INVALID",
  prohibitedReferences: [
    "wallet metadata",
    "vote counts",
    "time or block data",
    "external APIs",
    "previous or future turns",
    "prize pool or balances",
  ],
  requiredChecks: [
    "sanitize and normalize rule text",
    "reject ambiguity",
    "reject dependencies outside guess and draw",
    "compile only supported bounded AST nodes",
    "generate deterministic standard and adversarial test cases",
    "execute tests through the deterministic runtime",
    "compute confidence breakdown",
  ],
  version: "idealer_rule_validation_prompt_v1",
};

export function getRuleValidationPromptContract(): RuleValidationPromptContract {
  return PROMPT_CONTRACT;
}

export function createCompilerPlaceholder(
  request: RuleCompilationRequest,
): RuleCompilationResult {
  const result = validateAndPrecompileRule(request);
  if (!result.artifact) {
    throw new Error(result.log.reasonSummary);
  }
  return {
    ast: result.artifact.ast,
    normalizedText: result.artifact.normalizedText,
  };
}

function shouldContinueAfterAttempt(attempts: ProviderEvaluation[]): boolean {
  // Re-ask another provider when the current one disagrees with the first
  // completed opinion (PRD §7.4 escalation), up to the tertiary tiebreaker.
  return (
    attempts.length >= 2 &&
    hasProviderDisagreement(attempts) &&
    attempts.length < 3
  );
}

// Turns the collected per-provider attempts into the final validation result
// (selection, disagreement resolution, artifact, audit log). Shared by the
// offline and LLM orchestrators.
function finalizeValidation(
  request: RuleCompilationRequest,
  timestamp: string,
  attempts: ProviderEvaluation[],
  fallbackAttempt: ProviderEvaluation,
): RuleValidationResult {
  let finalEvaluation: ProviderEvaluation | null = null;
  for (const evaluation of attempts) {
    if (evaluation.status === "accepted") {
      finalEvaluation = evaluation;
    }
    if (
      evaluation.status === "rejected" &&
      evaluation.confidenceAction === "REJECT"
    ) {
      finalEvaluation = evaluation;
      break;
    }
  }
  finalEvaluation ??= attempts.at(-1) ?? fallbackAttempt;

  const providerPath = resolveProviderPath(attempts);
  const fallbackTriggered = providerPath.length > 1;
  const providerDisagreementRateSample = hasProviderDisagreement(attempts)
    ? 1
    : 0;
  const disagreementResolution =
    providerDisagreementRateSample === 1
      ? resolveProviderDisagreement(attempts)
      : null;
  const selectedAttempt =
    providerDisagreementRateSample === 1
      ? (disagreementResolution ?? {
          ...finalEvaluation,
          artifact: null,
          artifactHash: null,
          decision: "INVALID" as const,
          status: "provider_disagreement" as const,
        })
      : finalEvaluation;

  const reasonCodes = new Set(selectedAttempt.reasonCodes);
  if (providerDisagreementRateSample === 1) {
    reasonCodes.add("PROVIDER_DISAGREEMENT");
  }

  const reasonSummary = summarizeReasons(
    selectedAttempt.confidenceAction,
    selectedAttempt.decision,
    [...reasonCodes].filter((reason) => reason !== "SUPPORTED_RULE"),
    selectedAttempt.confidence.final_confidence,
    fallbackTriggered,
    providerDisagreementRateSample === 1 && disagreementResolution === null,
  );

  const artifact: RuleCompiledArtifact | null =
    selectedAttempt.decision === "VALID" && selectedAttempt.artifact
      ? { ...selectedAttempt.artifact, providerPath }
      : null;
  const artifactHash = artifact ? hashJson(artifact) : null;
  const validationLogId = hashJson({
    decision: selectedAttempt.decision,
    normalizedText: selectedAttempt.normalizedText,
    providerPath,
    reasonCodes: [...reasonCodes].sort(),
    ruleId: request.ruleId ?? null,
    timestamp,
  });

  return {
    artifact,
    artifactHash,
    decision: selectedAttempt.decision,
    log: {
      compiledArtifactHash: artifactHash,
      confidence: selectedAttempt.confidence,
      confidenceAction: selectedAttempt.confidenceAction,
      confidenceThresholds: COMPILER_CONFIDENCE_THRESHOLDS,
      confidenceWeights: COMPILER_CONFIDENCE_WEIGHTS,
      decision: selectedAttempt.decision,
      difficultyClass: selectedAttempt.difficultyClass,
      estimatedWinRate: selectedAttempt.estimatedWinRate,
      evaluatedTestCases: selectedAttempt.evaluatedTestCases,
      fallbackRateSample: fallbackTriggered ? 1 : 0,
      fallbackTriggered,
      generatedTestCases: selectedAttempt.generatedTestCases,
      model: selectedAttempt.modelIdentity.model,
      modelIdentity: selectedAttempt.modelIdentity,
      normalizedText: selectedAttempt.normalizedText,
      promptContract: PROMPT_CONTRACT,
      provider: selectedAttempt.modelIdentity.provider,
      providerDisagreementRateSample,
      providerPath,
      reasonCodes: [...reasonCodes],
      reasonSummary,
      ruleId: request.ruleId ?? null,
      timestamp,
      validationLogId,
    },
  };
}

/**
 * Deterministic, offline compilation: the AST comes from the pattern compiler.
 * Used as the fallback when no LLM provider is configured and by tests.
 */
export function validateAndPrecompileRule(
  request: RuleCompilationRequest,
): RuleValidationResult {
  const timestamp = request.timestamp ?? new Date().toISOString();
  const providerRouting = normalizeProviderRouting(request);
  const attempts: ProviderEvaluation[] = [];

  for (const providerConfig of providerRouting.providers) {
    const evaluation = evaluateProviderAttempt(
      request,
      timestamp,
      providerConfig,
    );
    attempts.push(evaluation);
    if (
      evaluation.status === "accepted" &&
      !shouldContinueAfterAttempt(attempts)
    ) {
      break;
    }
    if (
      evaluation.status === "rejected" &&
      evaluation.confidenceAction === "REJECT"
    ) {
      break;
    }
  }

  const fallback =
    attempts[0] ??
    evaluateProviderAttempt(
      request,
      timestamp,
      createDefaultProviderRoutingPolicy().providers[0] as AgentProviderConfig,
    );
  return finalizeValidation(request, timestamp, attempts, fallback);
}

/**
 * LLM-backed compilation: the AST is emitted by the injected provider via
 * constrained decoding (PRD §7.3.1). Preserves the provider fallback / escalation
 * / disagreement machinery; the LLM call happens inside the provider loop.
 */
export async function compileRuleArtifact(
  request: RuleCompilationRequest,
  options: RuleCompileArtifactOptions,
): Promise<RuleValidationResult> {
  const timestamp = request.timestamp ?? new Date().toISOString();
  const providerRouting = normalizeProviderRouting(request);
  const attempts: ProviderEvaluation[] = [];

  for (const providerConfig of providerRouting.providers) {
    const evaluation = await evaluateProviderAttemptAsync(
      request,
      timestamp,
      providerConfig,
      options,
    );
    attempts.push(evaluation);
    if (
      evaluation.status === "accepted" &&
      !shouldContinueAfterAttempt(attempts)
    ) {
      break;
    }
    if (
      evaluation.status === "rejected" &&
      evaluation.confidenceAction === "REJECT"
    ) {
      break;
    }
  }

  const fallback =
    attempts[0] ??
    evaluateProviderAttempt(
      request,
      timestamp,
      createDefaultProviderRoutingPolicy().providers[0] as AgentProviderConfig,
    );
  return finalizeValidation(request, timestamp, attempts, fallback);
}

interface ProviderEvaluation {
  artifact: RuleCompiledArtifact | null;
  artifactHash: string | null;
  ast: RuleAst | null;
  capabilityFlags: AgentProviderConfig["capabilities"];
  confidence: CompilerConfidenceBreakdown;
  confidenceAction: RuleConfidenceAction;
  decision: RuleValidationDecision;
  difficultyClass: RuleDifficultyClass;
  estimatedWinRate: number;
  evaluatedTestCases: RuleValidationTestResult[];
  generatedTestCases: RuleValidationTestCase[];
  modelIdentity: AgentModelIdentity;
  normalizedText: string;
  priority: AgentProviderPriority;
  reasonCodes: RuleValidationReasonCode[];
  requestShape: AgentProviderConfig["request_shape"];
  status: AgentProviderAttemptStatus;
}

interface AttemptContext {
  forcedFailure: ProviderFailureMode | undefined;
  modelIdentity: AgentModelIdentity;
  normalizedText: string;
  reasonCodes: Set<RuleValidationReasonCode>;
}

function buildAttemptContext(
  request: RuleCompilationRequest,
  providerConfig: AgentProviderConfig,
): AttemptContext {
  const forcedFailure =
    request.providerFailureModeByPriority?.[providerConfig.priority];
  const modelIdentity = {
    ...providerConfig.identity,
    model:
      request.model ??
      providerConfig.model_by_role.compile ??
      providerConfig.identity.model,
    provider: request.provider ?? providerConfig.identity.provider,
  };
  const normalizedText = normalizeRuleText(request.prompt);
  const reasonCodes = new Set<RuleValidationReasonCode>();

  if (forcedFailure === "timeout") {
    reasonCodes.add("PROVIDER_TIMEOUT");
  }
  if (forcedFailure === "malformed_response") {
    reasonCodes.add("PROVIDER_MALFORMED_RESPONSE");
  }
  // Schema-constrained decoding is mandatory for AST emission (PRD §7.3.1). A
  // provider without it cannot reliably emit a schema-valid AST.
  if (
    forcedFailure === "schema_validation_failure" ||
    !providerConfig.capabilities.grammar_constrained_decoding ||
    !providerConfig.capabilities.json_schema_response
  ) {
    reasonCodes.add("PROVIDER_SCHEMA_UNCONSTRAINED");
    reasonCodes.add("SCHEMA_INVALID");
  }

  if (hasPattern(normalizedText, AMBIGUOUS_PATTERNS)) {
    reasonCodes.add("AMBIGUOUS_RULE");
  }
  if (looksLikeObjectiveStartComparison(normalizedText)) {
    reasonCodes.delete("AMBIGUOUS_RULE");
  }
  if (looksLikeAmbiguousReverseRule(normalizedText)) {
    reasonCodes.add("AMBIGUOUS_RULE");
  }
  if (hasPattern(normalizedText, EXTERNAL_DEPENDENCY_PATTERNS)) {
    reasonCodes.add("EXTERNAL_DEPENDENCY");
  }

  return { forcedFailure, modelIdentity, normalizedText, reasonCodes };
}

// Shared validation core: given a candidate AST (from the offline pattern
// compiler OR an LLM provider), run schema validation, runtime-bound checks, the
// deterministic test harness, difficulty classification, and the composite
// confidence score, and produce a decision + artifact. Pure and synchronous.
function validateResolvedAst(
  request: RuleCompilationRequest,
  timestamp: string,
  providerConfig: AgentProviderConfig,
  ctx: AttemptContext,
  rawAst: unknown,
): ProviderEvaluation {
  const { forcedFailure, modelIdentity, normalizedText } = ctx;
  const reasonCodes = ctx.reasonCodes;

  const parsed =
    rawAst != null && !forcedFailure ? ruleAstSchema.safeParse(rawAst) : null;
  const ast: RuleAst | null = parsed?.success ? parsed.data : null;

  if (!ast || forcedFailure) {
    reasonCodes.add("UNSUPPORTED_RULE");
  } else {
    reasonCodes.add("SUPPORTED_RULE");
  }
  if (rawAst != null && !forcedFailure && !parsed?.success) {
    reasonCodes.add("SCHEMA_INVALID");
  }
  if (ast && !forcedFailure) {
    const reviewerAst = compileSupportedRule(normalizedText);
    if (reviewerAst && !knownAstSemanticsMatch(reviewerAst, ast)) {
      reasonCodes.add("REVIEWER_MISMATCH");
    }
  }

  const bounds = ast && !forcedFailure ? validateRuntimeBounds(ast) : null;
  const hasSafeRuntimeBounds = bounds?.safe === true;
  if (!hasSafeRuntimeBounds) {
    reasonCodes.add("UNSAFE_RUNTIME_BOUNDS");
  }
  if (bounds && !bounds.withinComplexity) {
    reasonCodes.add("COMPLEXITY_EXCEEDED");
  }

  // Deterministic test harness + bounded Monte-Carlo difficulty (PRD §6.8, §7.8).
  const harness = ast && hasSafeRuntimeBounds ? generateAndRunTests(ast) : null;
  const difficultyClass: RuleDifficultyClass =
    harness?.difficulty.difficultyClass ?? "IMPOSSIBLE";
  const estimatedWinRate = harness?.difficulty.estimatedWinRate ?? 0;

  // Policy: ANY verifiable rule is allowed; the only hard limits are external
  // dependencies and unverifiability. Difficulty (ALWAYS_TRUE / IMPOSSIBLE /
  // TOO_EASY) is a label, never a gate. The harness only blocks when a runtime
  // safety/determinism/serialization check actually fails.
  if (harness && harness.coverageScore < 1) {
    reasonCodes.add("RUNTIME_TEST_FAILED");
  }

  // Represent harness checks in the existing test-case log shape (draw/guess are
  // exercised internally by the harness over many Monte-Carlo samples).
  const countedCases = (harness?.cases ?? []).filter((c) => c.counted);
  const evaluatedTestCases: RuleValidationTestResult[] = countedCases.map(
    (c) => ({
      draw: [],
      expected: true,
      guess: [],
      name: c.name,
      actual: c.passed,
      passed: c.passed,
    }),
  );
  const generatedTestCases: RuleValidationTestCase[] = evaluatedTestCases.map(
    ({ draw, expected, guess, name }) => ({ draw, expected, guess, name }),
  );

  const confidence = computeConfidenceBreakdown({
    evaluatedTestCases,
    hasAmbiguity: reasonCodes.has("AMBIGUOUS_RULE"),
    hasExternalDependency: reasonCodes.has("EXTERNAL_DEPENDENCY"),
    hasReviewerMismatch: reasonCodes.has("REVIEWER_MISMATCH"),
    hasSafeRuntimeBounds,
    hasSupportedRule: ast !== null,
    schemaValid: parsed?.success === true,
    tokenCount: request.tokenCount,
  });

  const blockingReasons = [...reasonCodes].filter(
    (reason) => reason !== "SUPPORTED_RULE",
  );
  const confidenceAction =
    request.providerConfidenceActionByPriority?.[providerConfig.priority] ??
    selectCompilerConfidenceAction(confidence.final_confidence);
  const decision: RuleValidationDecision =
    blockingReasons.length === 0 && confidenceAction === "ACCEPT"
      ? "VALID"
      : "INVALID";

  const constrainedDecodingUsed =
    providerConfig.capabilities.grammar_constrained_decoding === true &&
    providerConfig.capabilities.json_schema_response === true;
  const ruleMode: "predicate" | "ranking" =
    ast?.schemaVersion === 2 && ast.result.type === "ranking"
      ? "ranking"
      : "predicate";

  const artifact: RuleCompiledArtifact | null =
    decision === "VALID" && ast
      ? {
          ast,
          complexityScore: bounds?.complexity ?? 0,
          constrainedDecodingUsed,
          createdAt: timestamp,
          difficultyClass,
          evaluatedTestCases,
          generatedTestCases,
          harnessCases: harness?.cases ?? [],
          modelIdentity,
          normalizedText,
          officialInterpretation:
            request.officialInterpretation?.trim() || normalizedText,
          originalText: request.originalText?.trim() || request.prompt,
          promptContractVersion: PROMPT_CONTRACT.version,
          providerPath: [],
          ruleMode,
          schemaVersion: ast.schemaVersion,
          skillVersion: RULE_COMPILER_SKILL_VERSION,
          testCoverageScore: harness?.coverageScore ?? 0,
          testHarnessVersion: RULE_TEST_HARNESS_VERSION,
        }
      : null;
  const artifactHash = artifact ? hashJson(artifact) : null;

  return {
    artifact,
    artifactHash,
    ast: forcedFailure ? null : ast,
    capabilityFlags: providerConfig.capabilities,
    confidence,
    confidenceAction,
    decision,
    difficultyClass,
    estimatedWinRate,
    evaluatedTestCases,
    generatedTestCases,
    modelIdentity,
    normalizedText,
    priority: providerConfig.priority,
    reasonCodes: [...reasonCodes],
    requestShape: providerConfig.request_shape,
    status: determineAttemptStatus(forcedFailure, confidenceAction, decision),
  };
}

// Offline (deterministic) attempt: AST comes from the pattern compiler. Used as
// the fallback when no LLM provider is injected and by the deterministic tests.
function evaluateProviderAttempt(
  request: RuleCompilationRequest,
  timestamp: string,
  providerConfig: AgentProviderConfig,
): ProviderEvaluation {
  const ctx = buildAttemptContext(request, providerConfig);
  const rawAst = ctx.forcedFailure
    ? null
    : compileSupportedRule(ctx.normalizedText);
  return validateResolvedAst(request, timestamp, providerConfig, ctx, rawAst);
}

// LLM attempt: AST is emitted by the injected provider (constrained decoding).
async function evaluateProviderAttemptAsync(
  request: RuleCompilationRequest,
  timestamp: string,
  providerConfig: AgentProviderConfig,
  options: RuleCompileArtifactOptions,
): Promise<ProviderEvaluation> {
  const ctx = buildAttemptContext(request, providerConfig);
  let rawAst: unknown = null;
  if (!ctx.forcedFailure) {
    if (options.preferDeterministic) {
      const deterministicAst = compileSupportedRule(ctx.normalizedText);
      if (deterministicAst) {
        const deterministicInterpretation = describeRuleAst(deterministicAst);
        return validateResolvedAst(
          deterministicInterpretation
            ? { ...request, officialInterpretation: deterministicInterpretation }
            : request,
          timestamp,
          providerConfig,
          ctx,
          deterministicAst,
        );
      }
    }

    try {
      rawAst = await options.astProvider({
        normalizedText: ctx.normalizedText,
        prompt: request.prompt,
        providerConfig,
      });
    } catch {
      ctx.reasonCodes.add("PROVIDER_MALFORMED_RESPONSE");
      rawAst = null;
    }
  }
  return validateResolvedAst(request, timestamp, providerConfig, ctx, rawAst);
}

function normalizeProviderRouting(
  request: RuleCompilationRequest,
): AgentProviderRoutingPolicy {
  if (request.providerRouting) {
    return request.providerRouting;
  }

  if (request.provider || request.model) {
    const [primary, secondary, tertiary] =
      createDefaultProviderRoutingPolicy().providers;
    if (!primary || !secondary || !tertiary) {
      return createDefaultProviderRoutingPolicy();
    }
    return {
      providers: [
        {
          ...primary,
          identity: {
            ...primary.identity,
            model: request.model ?? primary.identity.model,
            provider: request.provider ?? primary.identity.provider,
          },
          model_by_role: {
            ...primary.model_by_role,
            compile:
              request.model ??
              primary.model_by_role.compile ??
              primary.identity.model,
          },
        },
        secondary,
        tertiary,
      ],
    };
  }

  return createDefaultProviderRoutingPolicy();
}

function determineAttemptStatus(
  forcedFailure: ProviderFailureMode | undefined,
  confidenceAction: RuleConfidenceAction,
  decision: RuleValidationDecision,
): AgentProviderAttemptStatus {
  if (forcedFailure === "timeout") {
    return "timeout";
  }
  if (forcedFailure === "malformed_response") {
    return "malformed_response";
  }
  if (forcedFailure === "schema_validation_failure") {
    return "schema_validation_failed";
  }
  if (decision === "VALID") {
    return "accepted";
  }
  if (confidenceAction === "ESCALATE") {
    return "escalated";
  }
  return "rejected";
}

function resolveProviderPath(
  attempts: ProviderEvaluation[],
): AgentProviderAttemptLog[] {
  return attempts.map((attempt) => ({
    capability_flags: attempt.capabilityFlags,
    confidence_action: attempt.confidenceAction,
    decision: attempt.decision,
    final_confidence: attempt.confidence.final_confidence,
    model_identity: attempt.modelIdentity,
    priority: attempt.priority,
    provider: attempt.modelIdentity.provider,
    request_shape: attempt.requestShape,
    status: attempt.status,
  }));
}

function hasProviderDisagreement(attempts: ProviderEvaluation[]) {
  const completedAttempts = attempts.filter(isCompletedProviderOpinion);
  if (completedAttempts.length < 2) {
    return false;
  }

  const first = completedAttempts[0];
  if (!first) {
    return false;
  }
  const rest = completedAttempts.slice(1);
  const firstSignature = providerDecisionSignature(first);
  return rest.some(
    (attempt) => providerDecisionSignature(attempt) !== firstSignature,
  );
}

function resolveProviderDisagreement(attempts: ProviderEvaluation[]) {
  if (attempts.length < 3) {
    return null;
  }

  const secondary = attempts.find(
    (attempt) => attempt.priority === "secondary",
  );
  const tertiary = attempts.find((attempt) => attempt.priority === "tertiary");
  if (!secondary || !tertiary) {
    return null;
  }

  const secondarySignature = providerDecisionSignature(secondary);
  const tertiarySignature = providerDecisionSignature(tertiary);
  if (
    secondarySignature !== tertiarySignature ||
    tertiary.decision !== "VALID"
  ) {
    return null;
  }

  return tertiary;
}

function isCompletedProviderOpinion(attempt: ProviderEvaluation) {
  return (
    attempt.status !== "timeout" &&
    attempt.status !== "malformed_response" &&
    attempt.status !== "schema_validation_failed"
  );
}

function providerDecisionSignature(attempt: ProviderEvaluation) {
  return JSON.stringify({
    ast: attempt.ast,
    confidenceAction: attempt.confidenceAction,
    decision: attempt.decision,
    normalizedText: attempt.normalizedText,
  });
}

function normalizeRuleText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasPattern(value: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function compileSupportedRule(text: string): RuleAst | null {
  const reversePositionMatch = parseReversePositionMatchRule(text);
  if (reversePositionMatch) {
    return predicateRule(reversePositionMatch);
  }

  const absDiffRule = parseOrderedAbsoluteDifferenceRule(text);
  if (absDiffRule) {
    return predicateRule(absDiffRule);
  }

  const totalAbsDiffRule = parseTotalOrderedAbsoluteDifferenceRule(text);
  if (totalAbsDiffRule) {
    return predicateRule(totalAbsDiffRule);
  }

  const orderedPositionMatchCount = parseOrderedPositionMatchCountRule(text);
  if (orderedPositionMatchCount) {
    return predicateRule(orderedPositionMatchCount);
  }

  if (
    /\b(guessed?|picked|ticket|your)\s+sum\b.{0,30}\b(greater|higher|above|more)\b.{0,60}\b(draw|drawn)\s+sum\b/i.test(text) &&
    /\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,80}\b(numbers?\s+)?(match|matches|appear|appears)\b/i.test(text)
  ) {
    const threshold = parseMatchCountRule(text) ?? 1;
    return predicateRule({
      kind: "and",
      clauses: [
        compare(sum(source("guess")), "gt", sum(source("draw"))),
        {
          kind: "count_at_least",
          value: threshold,
          of: intersection(source("guess"), source("draw")),
        },
      ],
    });
  }

  const matchCount = parseMatchCountRule(text);
  if (matchCount) {
    return {
      schemaVersion: 1,
      node: { kind: "match_count_at_least", value: matchCount },
    };
  }

  const exactMatchCount = parseExactMatchCountRule(text);
  if (exactMatchCount !== null) {
    return predicateRule(
      compare(count(intersection(source("guess"), source("draw"))), "eq", lit(exactMatchCount)),
    );
  }

  if (/\bno\b.{0,40}\b(guessed?|picked|ticket|your)\s+numbers?\b.{0,60}\b(appear|appears|match|matches|drawn|in the draw)\b/i.test(text)) {
    return predicateRule(
      compare(count(intersection(source("guess"), source("draw"))), "eq", lit(0)),
    );
  }

  const positionComparison = parsePositionComparisonRule(text);
  if (positionComparison) {
    return predicateRule(positionComparison);
  }

  if (
    /\bevery\b.{0,40}\b(guessed?|picked|ticket|your)\s+numbers?\b.{0,30}\b(lower|less|below|greater|higher|above)\b.{0,60}\b(draw|drawn)\b/i.test(text) &&
    /\b(same position|corresponding position|same index)\b/i.test(text)
  ) {
    const op = /\b(lower|less|below)\b/i.test(text) ? "lt" : "gt";
    return predicateRule({
      kind: "all_ordered_compare",
      left: source("guess"),
      op,
      right: source("draw"),
    });
  }

  if (
    /\b(same set|same numbers?|contain the same set)\b/i.test(text) &&
    /\b(regardless of order|any order|unordered|order does not matter)\b/i.test(text)
  ) {
    return predicateRule(
      compare(count(intersection(source("guess"), source("draw"))), "eq", lit(6)),
    );
  }

  if (
    /\b(number|count)\b.{0,40}\beven\b.{0,80}\b(equal|equals|same|match|matches)\b.{0,80}\beven\b/i.test(text)
  ) {
    return predicateRule(
      compare(
        count(filterMod(source("guess"), 2, 0)),
        "eq",
        count(filterMod(source("draw"), 2, 0)),
      ),
    );
  }

  const minMaxComparison = parseMinMaxComparisonRule(text);
  if (minMaxComparison) {
    return predicateRule(minMaxComparison);
  }

  if (
    /\bsum\b/.test(text) &&
    /\b(equal|equals|same|match|matches)\b/.test(text) &&
    /\b(draw|drawn)\b/.test(text) &&
    /\b(guess|guessed|submitted|your numbers|your)\b/.test(text)
  ) {
    return { schemaVersion: 1, node: { kind: "sum_equals" } };
  }

  if (
    /\b(exact|exactly)\b/.test(text) &&
    /\b(order|ordered|sequence|position|same positions?)\b/.test(text) &&
    /\b(match|matches|same)\b/.test(text)
  ) {
    return { schemaVersion: 1, node: { kind: "ordered_exact" } };
  }

  return null;
}

function source(sourceName: "draw" | "guess"): ArrayExpr {
  return { kind: "source", source: sourceName };
}

function lit(value: number): ScalarExpr {
  return { kind: "lit", value };
}

function count(of: ArrayExpr): ScalarExpr {
  return { kind: "reduce", op: "count", of };
}

function sum(of: ArrayExpr): ScalarExpr {
  return { kind: "reduce", op: "sum", of };
}

function min(of: ArrayExpr): ScalarExpr {
  return { kind: "reduce", op: "min", of };
}

function max(of: ArrayExpr): ScalarExpr {
  return { kind: "reduce", op: "max", of };
}

function at(of: ArrayExpr, index: number): ScalarExpr {
  return { kind: "at", index, of };
}

function intersection(left: ArrayExpr, right: ArrayExpr): ArrayExpr {
  return { kind: "intersection", left, right };
}

function filterMod(
  of: ArrayExpr,
  modulus: number,
  equals: number,
): ArrayExpr {
  return { kind: "filter_mod", equals, modulus, of };
}

function compare(
  left: ScalarExpr,
  op: CompareOp,
  right: ScalarExpr,
): PredicateNode {
  return { kind: "compare", left, op, right };
}

function predicateRule(predicate: PredicateNode): RuleAst {
  return { schemaVersion: 2, result: { type: "predicate", predicate } };
}

function looksLikeAmbiguousReverseRule(text: string) {
  return (
    /\bmatch(?:es)?\b.{0,40}\b(draw|drawn)\b.{0,40}\breverse\b/i.test(text) &&
    !/\bposition\s*1\b.{0,80}\bposition\s*6\b/i.test(text) &&
    !/\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,80}\breversed?\s+positions?\b/i.test(text)
  );
}

function looksLikeObjectiveStartComparison(text: string) {
  return (
    /\bstart\s+stronger\b/i.test(text) &&
    /\bfirst\s+pick\b.{0,80}\b(higher|greater|above|more)\b.{0,80}\bfirst\s+drawn\s+number\b/i.test(text)
  );
}

function describeRuleAst(ast: RuleAst): string | null {
  if (ast.schemaVersion === 1) {
    if (ast.node.kind === "match_count_at_least") {
      return `A guess wins if at least ${ast.node.value} of its numbers appear in the official draw, regardless of order.`;
    }
    if (ast.node.kind === "sum_equals") {
      return "A guess wins if the sum of its six numbers equals the sum of the six official draw numbers.";
    }
    if (ast.node.kind === "ordered_exact") {
      return "A guess wins if all six guessed numbers match the official draw in the same positions.";
    }
  }

  if (ast.schemaVersion !== 2 || ast.result.type !== "predicate") {
    return null;
  }

  const predicate = ast.result.predicate;
  if (predicate.kind === "and") {
    const clauses = predicate.clauses.map(describePredicate).filter(Boolean);
    return clauses.length === predicate.clauses.length
      ? `A guess wins if ${clauses.join(" and ")}.`
      : null;
  }

  const description = describePredicate(predicate);
  return description ? `A guess wins if ${description}.` : null;
}

function describePredicate(predicate: PredicateNode): string | null {
  if (predicate.kind === "count_at_least") {
    if (isIntersectionOfSources(predicate.of, "guess", "draw")) {
      return `at least ${predicate.value} of its numbers appear in the official draw, regardless of order`;
    }
    return null;
  }

  if (predicate.kind === "all_ordered_abs_diff_lte") {
    if (
      predicate.left.kind === "source" &&
      predicate.left.source === "guess" &&
      predicate.right.kind === "source" &&
      predicate.right.source === "draw"
    ) {
      return `the absolute difference between each guessed number and the drawn number in the same position is at most ${predicate.value}`;
    }
    return null;
  }

  if (predicate.kind === "total_ordered_abs_diff_lte") {
    if (
      predicate.left.kind === "source" &&
      predicate.left.source === "guess" &&
      predicate.right.kind === "source" &&
      predicate.right.source === "draw"
    ) {
      return `the total absolute position-by-position difference between the guess and draw is at most ${predicate.value}`;
    }
    return null;
  }

  if (predicate.kind === "ordered_position_match_count_eq") {
    if (
      predicate.left.kind === "source" &&
      predicate.left.source === "guess" &&
      predicate.right.kind === "source" &&
      predicate.right.source === "draw"
    ) {
      return `exactly ${predicate.value} guessed numbers match the official draw in the same positions`;
    }
    return null;
  }

  if (predicate.kind === "reversed_position_match_count_at_least") {
    if (
      predicate.left.kind === "source" &&
      predicate.left.source === "guess" &&
      predicate.right.kind === "source" &&
      predicate.right.source === "draw"
    ) {
      return predicate.value === 6
        ? "all six guessed numbers match the official draw in reverse position order"
        : `at least ${predicate.value} guessed numbers match the official draw in reverse position order`;
    }
    return null;
  }

  if (predicate.kind !== "compare") {
    return null;
  }

  const left = describeScalar(predicate.left);
  const right = describeScalar(predicate.right);
  const op = describeCompareOp(predicate.op);
  if (!left || !right || !op) {
    return null;
  }

  return `${left} is ${op} ${right}`;
}

function describeScalar(scalar: ScalarExpr): string | null {
  if (scalar.kind === "lit") {
    return String(scalar.value);
  }
  if (scalar.kind === "reduce") {
    const sourceName =
      scalar.of.kind === "source"
        ? scalar.of.source === "guess"
          ? "the guess"
          : "the official draw"
        : null;
    if (!sourceName) {
      if (
        scalar.op === "count" &&
        isIntersectionOfSources(scalar.of, "guess", "draw")
      ) {
        return "the count of guessed numbers that appear in the official draw";
      }
      return null;
    }
    if (scalar.op === "sum") {
      return `the sum of ${sourceName}'s six numbers`;
    }
    if (scalar.op === "min") {
      return `the smallest number in ${sourceName}`;
    }
    if (scalar.op === "max") {
      return `the largest number in ${sourceName}`;
    }
  }
  return null;
}

function describeCompareOp(op: CompareOp): string | null {
  switch (op) {
    case "eq":
      return "equal to";
    case "gt":
      return "greater than";
    case "gte":
      return "greater than or equal to";
    case "lt":
      return "less than";
    case "lte":
      return "less than or equal to";
    case "neq":
      return "not equal to";
  }
}

function isIntersectionOfSources(
  array: ArrayExpr,
  first: "draw" | "guess",
  second: "draw" | "guess",
) {
  if (array.kind !== "intersection") {
    return false;
  }
  const sides = [array.left, array.right];
  return (
    sides.some((side) => side.kind === "source" && side.source === first) &&
    sides.some((side) => side.kind === "source" && side.source === second)
  );
}

function parseExactMatchCountRule(text: string): number | null {
  const match = text.match(
    /\bexactly\s+([0-6]|zero|one|two|three|four|five|six)\b.{0,80}\b(match|matches|appear|appears|drawn|in the draw)\b/i,
  );
  const rawValue = match?.[1] ?? null;
  if (!rawValue) {
    return null;
  }
  const value =
    rawValue.toLowerCase() === "zero"
      ? 0
      : (NUMBER_WORDS.get(rawValue.toLowerCase()) ?? Number(rawValue));
  return Number.isInteger(value) && value >= 0 && value <= 6 ? value : null;
}

function parseOrdinal(value: string): number | null {
  const normalized = value.toLowerCase();
  const ordinals = new Map<string, number>([
    ["first", 0],
    ["1st", 0],
    ["second", 1],
    ["2nd", 1],
    ["third", 2],
    ["3rd", 2],
    ["fourth", 3],
    ["4th", 3],
    ["fifth", 4],
    ["5th", 4],
    ["sixth", 5],
    ["6th", 5],
  ]);
  return ordinals.get(normalized) ?? null;
}

function parseComparisonWord(value: string): CompareOp | null {
  if (/^(equal|equals|same|matches?|is)$/i.test(value)) {
    return "eq";
  }
  if (/^(greater|higher|above|more)$/i.test(value)) {
    return "gt";
  }
  if (/^(lower|less|below|smaller)$/i.test(value)) {
    return "lt";
  }
  return null;
}

function parsePositionComparisonRule(text: string): PredicateNode | null {
  const match = text.match(
    /\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th)\s+(?:(?:guessed?|picked|drawn?|draw)\s+)?(?:number|pick)\b.{0,40}(?:\b(?:is|be|are)\b\s+)?\b(equal|equals|same|matches?|greater|higher|above|more|lower|less|below|smaller)\b.{0,50}\b(first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th)\s+(?:drawn?|draw)\s+number\b/i,
  );
  const leftIndex = match?.[1] ? parseOrdinal(match[1]) : null;
  const op = match?.[2] ? parseComparisonWord(match[2]) : null;
  const rightIndex = match?.[3] ? parseOrdinal(match[3]) : null;
  if (leftIndex === null || rightIndex === null || op === null) {
    return null;
  }
  return compare(at(source("guess"), leftIndex), op, at(source("draw"), rightIndex));
}

function parseOrderedAbsoluteDifferenceRule(text: string): PredicateNode | null {
  const match = text.match(
    /\babsolute\s+difference\b.{0,80}\beach\s+(?:guessed?|picked|ticket|your)\s+number\b.{0,80}\b(draw|drawn)\s+number\b.{0,80}\b(same position|corresponding position|same index)\b.{0,80}\b(at most|no more than|less than or equal to|<=)\s+([0-9]+)\b/i,
  );
  const value = match?.[4] ? Number(match[4]) : NaN;
  if (!Number.isInteger(value) || value < 0 || value > 100) {
    return null;
  }
  return {
    kind: "all_ordered_abs_diff_lte",
    left: source("guess"),
    right: source("draw"),
    value,
  };
}

function parseTotalOrderedAbsoluteDifferenceRule(text: string): PredicateNode | null {
  const match = text.match(
    /\btotal\s+absolute\b.{0,80}\b(position-by-position|same-position|same position|corresponding position|corresponding-position)\s+difference\b.{0,80}\b(guess|guessed|ticket|your)\b.{0,80}\b(draw|drawn)\b.{0,80}(?:(?:\b(is\s+)?(at most|no more than|less than or equal to|<=)\s+([0-9]+)\b)|(?:\b(is\s+)?([0-9]+)\s+or\s+less\b))/i,
  );
  const value = match?.[6] ? Number(match[6]) : match?.[8] ? Number(match[8]) : NaN;
  if (!Number.isInteger(value) || value < 0 || value > 600) {
    return null;
  }
  return {
    kind: "total_ordered_abs_diff_lte",
    left: source("guess"),
    right: source("draw"),
    value,
  };
}

function parseOrderedPositionMatchCountRule(text: string): PredicateNode | null {
  const match = text.match(
    /\b(exactly|at least|at most)\s+([0-6]|one|two|three|four|five|six)\b.{0,80}\b(guessed?|picked|ticket|your)?\s*numbers?\b.{0,80}\b(match|matches|equal|equals)\b.{0,80}\b(same position|same positions|corresponding position|corresponding positions|same index|same indexes)\b/i,
  );
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const comparator = match[1].toLowerCase();
  const rawValue = match[2].toLowerCase();
  const value = NUMBER_WORDS.get(rawValue) ?? Number(rawValue);
  if (!Number.isInteger(value) || value < 0 || value > 6) {
    return null;
  }
  if (comparator !== "exactly") {
    return null;
  }
  return {
    kind: "ordered_position_match_count_eq",
    left: source("guess"),
    right: source("draw"),
    value,
  };
}

function parseReversePositionMatchRule(text: string): PredicateNode | null {
  const thresholdMatch = text.match(
    /\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,40}\b(?:of\s+the\s+)?6\b.{0,60}\breversed?\s+positions?\b.{0,30}\b(match|matches)\b/i,
  );
  if (thresholdMatch?.[1]) {
    const rawValue = thresholdMatch[1].toLowerCase();
    const value = NUMBER_WORDS.get(rawValue) ?? Number(rawValue);
    if (Number.isInteger(value) && value >= 1 && value <= 6) {
      return {
        kind: "reversed_position_match_count_at_least",
        left: source("guess"),
        right: source("draw"),
        value,
      };
    }
  }

  if (
    /\bguessed?\s+position\s*1\b.{0,80}\bdrawn?\s+position\s*6\b/i.test(text) &&
    /\bposition\s*2\b.{0,80}\bposition\s*5\b/i.test(text) &&
    /\b(and so on|reverse|reversed)\b/i.test(text)
  ) {
    return {
      kind: "reversed_position_match_count_at_least",
      left: source("guess"),
      right: source("draw"),
      value: 6,
    };
  }

  return null;
}

function parseMinMaxComparisonRule(text: string): PredicateNode | null {
  const match = text.match(
    /\b(smallest|lowest|largest|highest)\s+(?:guessed?|picked|ticket|your)\s+number\b.{0,30}\b(equal|equals|same|matches?|greater|higher|above|more|lower|less|below|smaller)\b.{0,40}\b(smallest|lowest|largest|highest)\s+(?:drawn?|draw)\s+number\b/i,
  );
  const leftKind = match?.[1]?.toLowerCase();
  const op = match?.[2] ? parseComparisonWord(match[2]) : null;
  const rightKind = match?.[3]?.toLowerCase();
  if (!leftKind || !rightKind || !op) {
    return null;
  }
  const left =
    leftKind === "smallest" || leftKind === "lowest"
      ? min(source("guess"))
      : max(source("guess"));
  const right =
    rightKind === "smallest" || rightKind === "lowest"
      ? min(source("draw"))
      : max(source("draw"));
  return compare(left, op, right);
}

function parseMatchCountRule(text: string) {
  const numericMatch = text.match(
    /\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,80}\b(match|matches|appear|appears|in the draw|drawn)\b/i,
  );
  const orMoreMatch = text.match(
    /\b([1-6]|one|two|three|four|five|six)\s+or\s+more\b.{0,80}\b(guessed?|picked|ticket|my|your)?\s*numbers?\b.{0,100}\b(show up|appear|appears|match|matches|somewhere in the draw|in the draw|drawn)\b/i,
  );
  const compactMatch = text.match(/\b([1-6])\s+numbers?\s+(match|appear)\b/i);
  const rawValue = numericMatch?.[1] ?? orMoreMatch?.[1] ?? compactMatch?.[1] ?? null;
  if (!rawValue) {
    return null;
  }

  const value = NUMBER_WORDS.get(rawValue.toLowerCase()) ?? Number(rawValue);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : null;
}

const MAX_COMPLEXITY = 64;

interface RuntimeBounds {
  safe: boolean;
  withinComplexity: boolean;
  complexity: number;
}

// Measures AST depth + node count and confirms the rule is within the runtime
// sandbox limits (PRD §7.7). Zod already guarantees only known node kinds, so
// this layer enforces depth/complexity bounds. Handles both legacy v1 and v2.
function validateRuntimeBounds(ast: RuleAst): RuntimeBounds {
  if (ast.schemaVersion === 1) {
    const value = ast.node.value;
    const valid =
      ast.node.kind === "ordered_exact" ||
      ast.node.kind === "sum_equals" ||
      (ast.node.kind === "match_count_at_least" &&
        Number.isInteger(value) &&
        (value ?? 0) >= 1 &&
        (value ?? 0) <= 6);
    return { safe: valid, withinComplexity: true, complexity: 1 };
  }

  let complexity = 0;
  const measure = (node: unknown, depth: number): number => {
    complexity += 1;
    if (depth > MAX_AST_DEPTH) {
      return depth;
    }
    if (!node || typeof node !== "object") {
      return depth;
    }
    let maxChild = depth;
    for (const value of Object.values(node as Record<string, unknown>)) {
      if (value && typeof value === "object") {
        maxChild = Math.max(maxChild, measure(value, depth + 1));
      }
    }
    return maxChild;
  };

  const maxDepth = measure(ast.result, 1);
  const withinComplexity = complexity <= MAX_COMPLEXITY;
  return {
    safe: maxDepth <= MAX_AST_DEPTH && withinComplexity,
    withinComplexity,
    complexity,
  };
}

function computeConfidenceBreakdown(input: {
  evaluatedTestCases: RuleValidationTestResult[];
  hasAmbiguity: boolean;
  hasExternalDependency: boolean;
  hasReviewerMismatch: boolean;
  hasSafeRuntimeBounds: boolean;
  hasSupportedRule: boolean;
  schemaValid: boolean;
  tokenCount: number;
}): CompilerConfidenceBreakdown {
  const passedTests = input.evaluatedTestCases.filter(
    (testCase) => testCase.passed,
  ).length;
  const testCoverageScore =
    input.evaluatedTestCases.length === 0
      ? 0
      : roundScore(passedTests / input.evaluatedTestCases.length);
  const rule_clarity_score = roundScore(
    input.hasAmbiguity ? 0.25 : input.tokenCount > 70 ? 0.72 : 0.92,
  );
  const compiler_confidence = roundScore(input.hasSupportedRule ? 0.9 : 0.2);
  const model_confidence = roundScore(
    input.hasSupportedRule &&
      !input.hasAmbiguity &&
      !input.hasExternalDependency
      ? 0.86
      : 0.35,
  );
  const runtime_safety_score = input.hasSafeRuntimeBounds ? 1 : 0;
  const schema_score = input.schemaValid ? 1 : 0;
  const reviewer_agreement_score =
    input.hasSupportedRule &&
    !input.hasAmbiguity &&
    !input.hasExternalDependency &&
    !input.hasReviewerMismatch
      ? 1
      : 0.55;

  return calculateCompilerConfidence({
    compiler_confidence,
    model_confidence,
    reviewer_agreement_score,
    rule_clarity_score,
    runtime_safety_score,
    schema_score,
    test_coverage_score: testCoverageScore,
  });
}

function roundScore(value: number) {
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

function hashJson(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(value), "utf8")
    .digest("hex");
}

function knownAstSemanticsMatch(expected: RuleAst, actual: RuleAst) {
  return knownAstSignature(expected) === knownAstSignature(actual);
}

function knownAstSignature(ast: RuleAst): string {
  if (ast.schemaVersion === 1) {
    if (ast.node.kind === "match_count_at_least") {
      return `predicate:count_at_least:${ast.node.value}:intersection(source:draw,source:guess)`;
    }
    if (ast.node.kind === "sum_equals") {
      return "predicate:compare:eq:reduce:sum:source:draw:reduce:sum:source:guess";
    }
    if (ast.node.kind === "ordered_exact") {
      return "predicate:all_equal_ordered:source:guess:source:draw";
    }
    return `legacy:${ast.node.kind}`;
  }

  return ast.result.type === "predicate"
    ? `predicate:${predicateSignature(ast.result.predicate)}`
    : `ranking:${ast.result.direction}:${scalarSignature(ast.result.score)}`;
}

function arraySignature(node: ArrayExpr): string {
  switch (node.kind) {
    case "source":
      return `source:${node.source}`;
    case "digits":
      return `digits:${node.place}:${arraySignature(node.of)}`;
    case "filter_compare":
      return `filter_compare:${node.op}:${node.value}:${arraySignature(node.of)}`;
    case "filter_mod":
      return `filter_mod:${node.modulus}:${node.equals}:${arraySignature(node.of)}`;
    case "map_arithmetic":
      return `map_arithmetic:${node.op}:${node.operand}:${arraySignature(node.of)}`;
    case "map_with_guard":
      return [
        "map_with_guard",
        node.op,
        node.operand,
        node.guard.min,
        node.guard.max,
        node.onGuardFail,
        arraySignature(node.of),
      ].join(":");
    case "intersection": {
      const sides = [arraySignature(node.left), arraySignature(node.right)].sort();
      return `intersection(${sides.join(",")})`;
    }
    case "difference":
      return `difference:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "sort":
      return `sort:${node.order}:${arraySignature(node.of)}`;
    case "remove_up_to_n":
      return `remove_up_to_n:${node.n}:${node.strategy}:${arraySignature(node.of)}`;
    case "slice":
      return `slice:${node.start}:${node.end ?? ""}:${arraySignature(node.of)}`;
  }
}

function scalarSignature(node: ScalarExpr): string {
  switch (node.kind) {
    case "lit":
      return `lit:${node.value}`;
    case "reduce":
      return `reduce:${node.op}:${arraySignature(node.of)}`;
    case "at":
      return `at:${node.index}:${arraySignature(node.of)}`;
    case "arith":
      return `arith:${node.op}:${scalarSignature(node.left)}:${scalarSignature(node.right)}`;
  }
}

function predicateSignature(node: PredicateNode): string {
  switch (node.kind) {
    case "compare": {
      const sides = [scalarSignature(node.left), scalarSignature(node.right)];
      const ordered =
        node.op === "eq" || node.op === "neq" ? sides.sort() : sides;
      return `compare:${node.op}:${ordered.join(":")}`;
    }
    case "count_at_least":
      return `count_at_least:${node.value}:${arraySignature(node.of)}`;
    case "all_equal_ordered":
      return `all_equal_ordered:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "all_ordered_compare":
      return `all_ordered_compare:${node.op}:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "all_ordered_abs_diff_lte":
      return `all_ordered_abs_diff_lte:${node.value}:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "total_ordered_abs_diff_lte":
      return `total_ordered_abs_diff_lte:${node.value}:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "ordered_position_match_count_eq":
      return `ordered_position_match_count_eq:${node.value}:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "reversed_position_match_count_at_least":
      return `reversed_position_match_count_at_least:${node.value}:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "and":
    case "or":
      return `${node.kind}:${node.clauses.map(predicateSignature).sort().join("|")}`;
    case "not":
      return `not:${predicateSignature(node.clause)}`;
  }
}

function summarizeReasons(
  confidenceAction: RuleConfidenceAction,
  decision: RuleValidationDecision,
  blockingReasons: RuleValidationReasonCode[],
  finalConfidence: number,
  fallbackTriggered: boolean,
  providerDisagreement: boolean,
) {
  if (providerDisagreement) {
    return "Rule rejected because provider attempts disagreed; tertiary tiebreaker path was logged for audit.";
  }
  if (decision === "VALID") {
    return fallbackTriggered
      ? `Rule accepted after fallback with final confidence ${finalConfidence.toFixed(4)}.`
      : `Rule accepted with final confidence ${finalConfidence.toFixed(4)}.`;
  }
  if (confidenceAction === "ESCALATE") {
    return `Rule requires escalation because final confidence ${finalConfidence.toFixed(4)} is below accept threshold ${COMPILER_CONFIDENCE_THRESHOLDS.accept_min}.`;
  }
  if (blockingReasons.length === 0) {
    return `Rule rejected because final confidence ${finalConfidence.toFixed(4)} is below escalation threshold ${COMPILER_CONFIDENCE_THRESHOLDS.escalate_min}.`;
  }
  return `Rule rejected: ${blockingReasons.join(", ")}.`;
}
