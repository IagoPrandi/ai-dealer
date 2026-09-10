import {
  type AgentModelIdentity,
  type AgentProviderAttemptLog,
  type RuleCompiledArtifact,
  type RuleValidationResult,
} from "@tyche/rule-compiler";

export interface PendingRuleValidation {
  ruleId: number;
  sanitizedText: string;
  tokenCount: number;
  turnId: number;
}

export interface PublishedRuleValidation {
  compiledArtifact: RuleCompiledArtifact | null;
  compiledArtifactHash: string | null;
  confidence: RuleValidationResult["log"]["confidence"];
  confidenceAction: RuleValidationResult["log"]["confidenceAction"];
  decision: RuleValidationResult["decision"];
  evaluatedTestCases: RuleValidationResult["log"]["evaluatedTestCases"];
  fallbackRateSample: number;
  fallbackTriggered: boolean;
  finalConfidence: number;
  model: string;
  modelIdentity: AgentModelIdentity;
  normalizedText: string;
  provider: string;
  providerDisagreementRateSample: number;
  providerPath: AgentProviderAttemptLog[];
  reasonCodes: RuleValidationResult["log"]["reasonCodes"];
  reasonSummary: string;
  ruleId: number;
  turnId: number;
  validatedAt: string;
  validationLogId: string;
}

export interface RuleValidationCycleDeps {
  fetchPendingRules: () => Promise<PendingRuleValidation[]>;
  nowIso: () => string;
  publishValidation: (validation: PublishedRuleValidation) => Promise<void>;
  /**
   * Must invoke the complete compiler pipeline. The worker verifies the
   * resulting audit stages before publishing: independent review is mandatory,
   * and a provider-authored artifact must also carry executed provider evidence.
   * The worker deliberately has no deterministic fallback because a regex-only
   * artifact is not authoritative settlement input.
   */
  validateRule: (
    rule: PendingRuleValidation,
    timestamp: string,
  ) => Promise<RuleValidationResult>;
}

export interface RuleValidationCycleResult {
  invalid: number;
  processed: number;
  valid: number;
}

function hasAuthoritativeValidationAudit(result: RuleValidationResult) {
  if (result.decision !== "VALID") {
    return true;
  }
  const acceptedAttempt = result.log.attemptDiagnostics.find(
    (attempt) => attempt.status === "accepted",
  );
  const independentReview = acceptedAttempt?.stages.find(
    (stage) => stage.stage === "independent_review",
  );
  const providerEvidence = acceptedAttempt?.stages.find(
    (stage) => stage.stage === "provider_evidence",
  );
  const deterministicArtifact = result.log.reasonCodes.includes("SUPPORTED_RULE");
  return (
    result.artifact !== null &&
    result.artifactHash !== null &&
    independentReview?.status === "passed" &&
    (providerEvidence?.status === "passed" ||
      (deterministicArtifact && providerEvidence?.status === "skipped"))
  );
}

export async function runRuleValidationCycle(
  deps: RuleValidationCycleDeps,
): Promise<RuleValidationCycleResult> {
  const pendingRules = await deps.fetchPendingRules();
  let valid = 0;
  let invalid = 0;

  for (const rule of pendingRules) {
    const result = await deps.validateRule(rule, deps.nowIso());
    if (!hasAuthoritativeValidationAudit(result)) {
      throw new Error(
        `Rule ${rule.ruleId} returned VALID without the required independent review and provider-evidence audit.`,
      );
    }

    if (result.decision === "VALID") {
      valid += 1;
    } else {
      invalid += 1;
    }

    await deps.publishValidation({
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
      ruleId: rule.ruleId,
      turnId: rule.turnId,
      validatedAt: result.log.timestamp,
      validationLogId: result.log.validationLogId,
    });
  }

  return { invalid, processed: pendingRules.length, valid };
}
