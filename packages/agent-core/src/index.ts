export interface AgentConfidenceScore {
  modelConfidence: number;
  validationConfidence: number;
  finalConfidence: number;
}

export function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}
