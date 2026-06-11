import {
  validateAndPrecompileRule,
  type RuleValidationResult,
} from "@idealer/rule-compiler";

export interface PendingRuleValidation {
  ruleId: number;
  sanitizedText: string;
  tokenCount: number;
  turnId: number;
}

export interface PublishedRuleValidation {
  compiledArtifactHash: string | null;
  confidence: RuleValidationResult["log"]["confidence"];
  confidenceAction: RuleValidationResult["log"]["confidenceAction"];
  decision: RuleValidationResult["decision"];
  evaluatedTestCases: RuleValidationResult["log"]["evaluatedTestCases"];
  finalConfidence: number;
  model: string;
  normalizedText: string;
  provider: string;
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
}

export interface RuleValidationCycleResult {
  invalid: number;
  processed: number;
  valid: number;
}

export async function runRuleValidationCycle(
  deps: RuleValidationCycleDeps,
): Promise<RuleValidationCycleResult> {
  const pendingRules = await deps.fetchPendingRules();
  let valid = 0;
  let invalid = 0;

  for (const rule of pendingRules) {
    const result = validateAndPrecompileRule({
      prompt: rule.sanitizedText,
      ruleId: rule.ruleId,
      timestamp: deps.nowIso(),
      tokenCount: rule.tokenCount,
    });

    if (result.decision === "VALID") {
      valid += 1;
    } else {
      invalid += 1;
    }

    await deps.publishValidation({
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
      ruleId: rule.ruleId,
      turnId: rule.turnId,
      validatedAt: result.log.timestamp,
      validationLogId: result.log.validationLogId,
    });
  }

  return { invalid, processed: pendingRules.length, valid };
}
