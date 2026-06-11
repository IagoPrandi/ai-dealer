export type CompilerConfidenceAction = "ACCEPT" | "ESCALATE" | "REJECT";

export interface CompilerConfidenceBreakdown {
  compiler_confidence: number;
  final_confidence: number;
  model_confidence: number;
  reviewer_agreement_score: number;
  rule_clarity_score: number;
  runtime_safety_score: number;
  schema_score: number;
  test_coverage_score: number;
}

export interface CompilerConfidenceInputs {
  compiler_confidence: number;
  model_confidence: number;
  reviewer_agreement_score: number;
  rule_clarity_score: number;
  runtime_safety_score: number;
  schema_score: number;
  test_coverage_score: number;
}

export interface CompilerConfidenceThresholds {
  accept_min: number;
  escalate_min: number;
}

export interface CompilerConfidenceWeights {
  compiler_confidence: number;
  model_confidence: number;
  reviewer_agreement_score: number;
  rule_clarity_score: number;
  runtime_safety_score: number;
  schema_score: number;
  test_coverage_score: number;
}

export const COMPILER_CONFIDENCE_THRESHOLDS: CompilerConfidenceThresholds = {
  accept_min: 0.85,
  escalate_min: 0.7,
};

export const COMPILER_CONFIDENCE_WEIGHTS: CompilerConfidenceWeights = {
  compiler_confidence: 0.2,
  model_confidence: 0.2,
  reviewer_agreement_score: 0.15,
  rule_clarity_score: 0.2,
  runtime_safety_score: 0.05,
  schema_score: 0.05,
  test_coverage_score: 0.15,
};

export function calculateCompilerConfidence(
  input: CompilerConfidenceInputs,
  weights: CompilerConfidenceWeights = COMPILER_CONFIDENCE_WEIGHTS,
): CompilerConfidenceBreakdown {
  const compiler_confidence = clampConfidence(input.compiler_confidence);
  const model_confidence = clampConfidence(input.model_confidence);
  const reviewer_agreement_score = clampConfidence(input.reviewer_agreement_score);
  const rule_clarity_score = clampConfidence(input.rule_clarity_score);
  const runtime_safety_score = clampConfidence(input.runtime_safety_score);
  const schema_score = clampConfidence(input.schema_score);
  const test_coverage_score = clampConfidence(input.test_coverage_score);
  const final_confidence = roundConfidence(
    model_confidence * weights.model_confidence +
      rule_clarity_score * weights.rule_clarity_score +
      compiler_confidence * weights.compiler_confidence +
      reviewer_agreement_score * weights.reviewer_agreement_score +
      test_coverage_score * weights.test_coverage_score +
      runtime_safety_score * weights.runtime_safety_score +
      schema_score * weights.schema_score,
  );

  return {
    compiler_confidence,
    final_confidence,
    model_confidence,
    reviewer_agreement_score,
    rule_clarity_score,
    runtime_safety_score,
    schema_score,
    test_coverage_score,
  };
}

export function selectCompilerConfidenceAction(
  finalConfidence: number,
  thresholds: CompilerConfidenceThresholds = COMPILER_CONFIDENCE_THRESHOLDS,
): CompilerConfidenceAction {
  if (finalConfidence >= thresholds.accept_min) {
    return "ACCEPT";
  }
  if (finalConfidence >= thresholds.escalate_min) {
    return "ESCALATE";
  }
  return "REJECT";
}

export function clampConfidence(value: number): number {
  return roundConfidence(Math.max(0, Math.min(1, value)));
}

function roundConfidence(value: number): number {
  return Number(value.toFixed(4));
}
