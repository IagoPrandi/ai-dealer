import type { RuleAst } from "@idealer/rule-schema";

export interface RuleCompilationRequest {
  prompt: string;
  tokenCount: number;
}

export interface RuleCompilationResult {
  ast: RuleAst;
  normalizedText: string;
}

export function createCompilerPlaceholder(request: RuleCompilationRequest): RuleCompilationResult {
  return {
    ast: {
      schemaVersion: 1,
      node: { kind: "match_count_at_least", value: 4 }
    },
    normalizedText: request.prompt.trim()
  };
}
