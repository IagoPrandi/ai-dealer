import { createHash } from "node:crypto";
import {
  calculateCompilerConfidence,
  COMPILER_CONFIDENCE_THRESHOLDS,
  COMPILER_CONFIDENCE_WEIGHTS,
  selectCompilerConfidenceAction,
  type CompilerConfidenceAction,
  type CompilerConfidenceBreakdown,
  type CompilerConfidenceThresholds,
  type CompilerConfidenceWeights,
} from "@idealer/agent-core";
import { ruleAstSchema, type RuleAst } from "@idealer/rule-schema";
import { evaluateRule } from "@idealer/rule-runtime";

export type {
  CompilerConfidenceBreakdown,
  CompilerConfidenceThresholds,
  CompilerConfidenceWeights,
} from "@idealer/agent-core";

export type RuleConfidenceAction = CompilerConfidenceAction;
export type RuleValidationDecision = "INVALID" | "VALID";
export type RuleValidationReasonCode =
  | "AMBIGUOUS_RULE"
  | "EXTERNAL_DEPENDENCY"
  | "RUNTIME_TEST_FAILED"
  | "SCHEMA_INVALID"
  | "SUPPORTED_RULE"
  | "UNSUPPORTED_RULE"
  | "UNSAFE_RUNTIME_BOUNDS";

export interface RuleCompilationRequest {
  model?: string;
  prompt: string;
  provider?: string;
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
  evaluatedTestCases: RuleValidationTestResult[];
  generatedTestCases: RuleValidationTestCase[];
  model: string;
  normalizedText: string;
  promptContract: RuleValidationPromptContract;
  provider: string;
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
  normalizedText: string;
  promptContractVersion: string;
  schemaVersion: 1;
}

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
  /\b(close|closest|near|nearest)\b/i,
  /\b(lucky|unlucky|interesting|creative|best|worst|fair|randomly)\b/i,
  /\b(about|around|roughly|approximately|similar)\b/i,
  /\b(anything|something|whatever)\b/i,
] as const;

const EXTERNAL_DEPENDENCY_PATTERNS = [
  /\b(wallet|address|creator|voter|votes?|leaderboard|profile)\b/i,
  /\b(time|timestamp|block|slot|transaction|signature|balance|prize|pool)\b/i,
  /\b(previous|next|future|past|history|streak)\b/i,
  /\b(weather|price|oracle|twitter|discord|website|api|external)\b/i,
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

export function createCompilerPlaceholder(request: RuleCompilationRequest): RuleCompilationResult {
  const result = validateAndPrecompileRule(request);
  if (!result.artifact) {
    throw new Error(result.log.reasonSummary);
  }
  return {
    ast: result.artifact.ast,
    normalizedText: result.artifact.normalizedText,
  };
}

export function validateAndPrecompileRule(
  request: RuleCompilationRequest,
): RuleValidationResult {
  const timestamp = request.timestamp ?? new Date().toISOString();
  const provider = request.provider ?? "idealer-deterministic-agent";
  const model = request.model ?? "idealer-rule-validator-v1";
  const normalizedText = normalizeRuleText(request.prompt);
  const reasonCodes = new Set<RuleValidationReasonCode>();

  if (hasPattern(normalizedText, AMBIGUOUS_PATTERNS)) {
    reasonCodes.add("AMBIGUOUS_RULE");
  }
  if (hasPattern(normalizedText, EXTERNAL_DEPENDENCY_PATTERNS)) {
    reasonCodes.add("EXTERNAL_DEPENDENCY");
  }

  const ast = compileSupportedRule(normalizedText);
  if (!ast) {
    reasonCodes.add("UNSUPPORTED_RULE");
  } else {
    reasonCodes.add("SUPPORTED_RULE");
  }

  const schemaResult = ast ? ruleAstSchema.safeParse(ast) : null;
  if (!schemaResult?.success) {
    reasonCodes.add("SCHEMA_INVALID");
  }

  const hasSafeRuntimeBounds = ast ? validateRuntimeBounds(ast) : false;
  if (!hasSafeRuntimeBounds) {
    reasonCodes.add("UNSAFE_RUNTIME_BOUNDS");
  }

  const generatedTestCases = ast ? generateRuleTestCases(ast) : [];
  const evaluatedTestCases = ast
    ? generatedTestCases.map((testCase) => {
        const actual = evaluateRule(ast, testCase);
        return { ...testCase, actual, passed: actual === testCase.expected };
      })
    : [];

  if (evaluatedTestCases.some((testCase) => !testCase.passed)) {
    reasonCodes.add("RUNTIME_TEST_FAILED");
  }

  const confidence = computeConfidenceBreakdown({
    evaluatedTestCases,
    hasAmbiguity: reasonCodes.has("AMBIGUOUS_RULE"),
    hasExternalDependency: reasonCodes.has("EXTERNAL_DEPENDENCY"),
    hasSafeRuntimeBounds,
    hasSupportedRule: ast !== null,
    schemaValid: schemaResult?.success === true,
    tokenCount: request.tokenCount,
  });

  const blockingReasons = [...reasonCodes].filter(
    (reason) => reason !== "SUPPORTED_RULE",
  );
  const confidenceAction = selectCompilerConfidenceAction(confidence.final_confidence);
  const decision: RuleValidationDecision =
    blockingReasons.length === 0 && confidenceAction === "ACCEPT" ? "VALID" : "INVALID";

  const artifact: RuleCompiledArtifact | null =
    decision === "VALID" && ast
      ? {
          ast,
          normalizedText,
          promptContractVersion: PROMPT_CONTRACT.version,
          schemaVersion: 1,
        }
      : null;
  const artifactHash = artifact ? hashJson(artifact) : null;
  const reasonSummary = summarizeReasons(
    confidenceAction,
    decision,
    blockingReasons,
    confidence.final_confidence,
  );
  const validationLogId = hashJson({
    decision,
    normalizedText,
    reasonCodes: [...reasonCodes].sort(),
    ruleId: request.ruleId ?? null,
    timestamp,
  });

  return {
    artifact,
    artifactHash,
    decision,
    log: {
      compiledArtifactHash: artifactHash,
      confidence,
      confidenceAction,
      confidenceThresholds: COMPILER_CONFIDENCE_THRESHOLDS,
      confidenceWeights: COMPILER_CONFIDENCE_WEIGHTS,
      decision,
      evaluatedTestCases,
      generatedTestCases,
      model,
      normalizedText,
      promptContract: PROMPT_CONTRACT,
      provider,
      reasonCodes: [...reasonCodes],
      reasonSummary,
      ruleId: request.ruleId ?? null,
      timestamp,
      validationLogId,
    },
  };
}

function normalizeRuleText(value: string) {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function hasPattern(value: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

function compileSupportedRule(text: string): RuleAst | null {
  const matchCount = parseMatchCountRule(text);
  if (matchCount) {
    return {
      schemaVersion: 1,
      node: { kind: "match_count_at_least", value: matchCount },
    };
  }

  if (
    /\bsum\b/.test(text) &&
    /\b(equal|equals|same|match|matches)\b/.test(text) &&
    /\b(draw|drawn)\b/.test(text) &&
    /\b(guess|submitted|your numbers|your)\b/.test(text)
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

function parseMatchCountRule(text: string) {
  const numericMatch = text.match(
    /\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,80}\b(match|matches|appear|appears|in the draw|drawn)\b/i,
  );
  const compactMatch = text.match(/\b([1-6])\s+numbers?\s+(match|appear)\b/i);
  const rawValue = numericMatch?.[1] ?? compactMatch?.[1] ?? null;
  if (!rawValue) {
    return null;
  }

  const value = NUMBER_WORDS.get(rawValue.toLowerCase()) ?? Number(rawValue);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : null;
}

function validateRuntimeBounds(ast: RuleAst) {
  if (ast.node.kind === "match_count_at_least") {
    return Number.isInteger(ast.node.value) && (ast.node.value ?? 0) >= 1 && (ast.node.value ?? 0) <= 6;
  }
  return ast.node.kind === "ordered_exact" || ast.node.kind === "sum_equals";
}

function generateRuleTestCases(ast: RuleAst): RuleValidationTestCase[] {
  if (ast.node.kind === "match_count_at_least") {
    const threshold = ast.node.value ?? 4;
    const draw = [1, 2, 3, 4, 5, 6];
    const passingGuess = [
      ...draw.slice(0, threshold),
      ...[90, 91, 92, 93, 94, 95].slice(0, 6 - threshold),
    ];
    const failingMatchCount = Math.max(0, threshold - 1);
    const failingGuess = [
      ...draw.slice(0, failingMatchCount),
      ...[90, 91, 92, 93, 94, 95].slice(0, 6 - failingMatchCount),
    ];
    return [
      {
        draw,
        expected: true,
        guess: passingGuess,
        name: "threshold-or-better matches",
      },
      {
        draw,
        expected: false,
        guess: failingGuess,
        name: "below-threshold matches",
      },
      {
        draw: [10, 20, 30, 40, 50, 60],
        expected: false,
        guess: [1, 2, 3, 4, 5, 6],
        name: "zero matches",
      },
    ];
  }

  if (ast.node.kind === "sum_equals") {
    return [
      {
        draw: [1, 2, 3, 4, 5, 6],
        expected: true,
        guess: [6, 5, 4, 3, 2, 1],
        name: "same sum different order",
      },
      {
        draw: [1, 2, 3, 4, 5, 6],
        expected: false,
        guess: [1, 2, 3, 4, 5, 7],
        name: "different sum",
      },
    ];
  }

  return [
    {
      draw: [1, 2, 3, 4, 5, 6],
      expected: true,
      guess: [1, 2, 3, 4, 5, 6],
      name: "exact ordered match",
    },
    {
      draw: [1, 2, 3, 4, 5, 6],
      expected: false,
      guess: [6, 5, 4, 3, 2, 1],
      name: "same numbers wrong order",
    },
  ];
}

function computeConfidenceBreakdown(input: {
  evaluatedTestCases: RuleValidationTestResult[];
  hasAmbiguity: boolean;
  hasExternalDependency: boolean;
  hasSafeRuntimeBounds: boolean;
  hasSupportedRule: boolean;
  schemaValid: boolean;
  tokenCount: number;
}): CompilerConfidenceBreakdown {
  const passedTests = input.evaluatedTestCases.filter((testCase) => testCase.passed).length;
  const testCoverageScore =
    input.evaluatedTestCases.length === 0
      ? 0
      : roundScore(passedTests / input.evaluatedTestCases.length);
  const rule_clarity_score = roundScore(
    input.hasAmbiguity ? 0.25 : input.tokenCount > 70 ? 0.72 : 0.92,
  );
  const compiler_confidence = roundScore(input.hasSupportedRule ? 0.9 : 0.2);
  const model_confidence = roundScore(
    input.hasSupportedRule && !input.hasAmbiguity && !input.hasExternalDependency ? 0.86 : 0.35,
  );
  const runtime_safety_score = input.hasSafeRuntimeBounds ? 1 : 0;
  const schema_score = input.schemaValid ? 1 : 0;
  const reviewer_agreement_score =
    input.hasSupportedRule && !input.hasAmbiguity && !input.hasExternalDependency ? 1 : 0.55;

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
  return createHash("sha256").update(JSON.stringify(value), "utf8").digest("hex");
}

function summarizeReasons(
  confidenceAction: RuleConfidenceAction,
  decision: RuleValidationDecision,
  blockingReasons: RuleValidationReasonCode[],
  finalConfidence: number,
) {
  if (decision === "VALID") {
    return `Rule accepted with final confidence ${finalConfidence.toFixed(4)}.`;
  }
  if (confidenceAction === "ESCALATE") {
    return `Rule requires escalation because final confidence ${finalConfidence.toFixed(4)} is below accept threshold ${COMPILER_CONFIDENCE_THRESHOLDS.accept_min}.`;
  }
  if (blockingReasons.length === 0) {
    return `Rule rejected because final confidence ${finalConfidence.toFixed(4)} is below escalation threshold ${COMPILER_CONFIDENCE_THRESHOLDS.escalate_min}.`;
  }
  return `Rule rejected: ${blockingReasons.join(", ")}.`;
}
