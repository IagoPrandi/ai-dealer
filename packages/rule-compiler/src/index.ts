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
} from "@tyche/agent-core";
import {
  getRuleAstJsonSchema,
  isRankingRule,
  MAX_AST_DEPTH,
  ruleAstSchema,
  type ArrayExpr,
  type ArrayExprV3,
  type CompareOp,
  type PredicateNode,
  type PredicateNodeV3,
  type RuleAst,
  type ScalarExpr,
  type ScalarExprV3,
} from "@tyche/rule-schema";
import {
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
  scoreGuess,
} from "@tyche/rule-runtime";
import {
  collectWorkedExamples,
  generateAndRunTests,
  RULE_TEST_HARNESS_VERSION,
  structuredInputPairs,
  type RuleDifficultyClass,
  type RuleTestCaseResult,
  type RuleWorkedExample,
} from "@tyche/rule-test-harness";
import { describeRuleAstTotal } from "./describeAst.js";
import {
  analyzeInterpretationCoverage,
  collectAstOperations,
  collectAstValues,
  collectRequiredOperations,
  collectRequiredValues,
  stripVacuousRanges,
  type RuleOperation,
} from "./interpretationCoverage.js";
import { RULE_COMPILER_SKILL_VERSION } from "./skill.js";

export type {
  AgentModelIdentity,
  AgentProviderAttemptLog,
  AgentProviderRoutingPolicy,
  CompilerConfidenceBreakdown,
  CompilerConfidenceThresholds,
  CompilerConfidenceWeights,
} from "@tyche/agent-core";

export {
  createDefaultProviderRoutingPolicy,
  createLocalOnlyProviderRoutingPolicy,
} from "@tyche/agent-core";

export {
  getRuleAstJsonSchema,
  isRankingRule,
  ruleAstSchema,
  type RuleAst,
} from "@tyche/rule-schema";
export {
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
  scoreGuess,
  type RankingEntry,
} from "@tyche/rule-runtime";
export {
  collectWorkedExamples,
  type RuleDifficultyClass,
  type RuleWorkedExample,
} from "@tyche/rule-test-harness";
export { describeRuleAstTotal } from "./describeAst.js";
export {
  analyzeInterpretationCoverage,
  analyzeStatementFidelity,
  type InterpretationCoverage,
  type RuleOperation,
  type RuleStatementClaim,
  type StatementFidelity,
} from "./interpretationCoverage.js";
export {
  buildRuleCompilerSkillPrompt,
  RULE_COMPILER_SKILL,
  RULE_COMPILER_SKILL_VERSION,
} from "./skill.js";

export type RuleConfidenceAction = CompilerConfidenceAction;
export type RuleValidationDecision = "INVALID" | "VALID";
export type RuleValidationReasonCode =
  | "AGENT_STATEMENT_MISMATCH"
  | "AMBIGUOUS_RULE"
  | "COMPLEXITY_EXCEEDED"
  | "DIFFICULTY_ALWAYS_TRUE"
  | "DIFFICULTY_IMPOSSIBLE"
  | "EXTERNAL_DEPENDENCY"
  | "INTERPRETATION_MISMATCH"
  | "PROVIDER_DISAGREEMENT"
  | "PROVIDER_EVIDENCE_UNVERIFIED"
  | "PROVIDER_MALFORMED_RESPONSE"
  | "PROVIDER_SCHEMA_UNCONSTRAINED"
  | "PROVIDER_SPAN_COVERAGE_INCOMPLETE"
  | "REVIEWER_MISMATCH"
  | "PROVIDER_TIMEOUT"
  | "RUNTIME_TEST_FAILED"
  | "SCHEMA_INVALID"
  | "SECOND_OPINION_UNAVAILABLE"
  | "SUPPORTED_RULE"
  | "UNSUPPORTED_RULE"
  | "UNSAFE_RUNTIME_BOUNDS"
  | "VACUOUS_CONDITION";

// Async hook that asks an LLM provider to emit a rule AST (raw JSON) for the
// given normalized text. Injected by the API (apps/api/src/llm.ts). When absent,
// the compiler falls back to the deterministic offline pattern compiler.
export type RuleAstProvider = (params: {
  normalizedText: string;
  prompt: string;
  providerConfig: AgentProviderConfig;
}) => Promise<unknown>;

/**
 * A second, independent LLM reading of the rule. The reviewer receives the
 * source text but never the draft candidate, which avoids anchoring it to the
 * generator's AST. Its result is used only for behavioral agreement and is
 * never frozen directly into an artifact.
 */
export type RuleAstReviewer = RuleAstProvider;

export interface RuleSourceSpan {
  /** Exact substring of the normalized rule that produced an AST condition. */
  text: string;
}

export interface RuleProviderWorkedExample {
  draw: number[];
  guess: number[];
  /** Predicate examples use outcome; ranking examples use score. */
  outcome?: "WIN" | "LOSE";
  score?: number;
}

/**
 * Auditable provider response. The AST alone cannot prove that every source
 * clause was consumed, and examples generated from that AST only prove that the
 * runtime agrees with itself. Production preflight therefore asks the provider
 * for source spans plus examples derived from the player's text before the AST
 * can be accepted.
 */
export interface RuleCompilationCandidate {
  ast: unknown;
  consumedSpans: RuleSourceSpan[];
  workedExamples: RuleProviderWorkedExample[];
}

/**
 * Transport schema for the whole LLM compilation envelope.  The AST schema on
 * its own cannot constrain the provider's evidence arrays, which is how a
 * syntactically valid response used to carry impossible ticket examples.
 *
 * This schema is intentionally separate from the runtime Zod checks: a
 * constrained decoder prevents invalid tokens from being emitted when the
 * provider supports it, while the runtime checks remain the non-bypassable
 * enforcement boundary.
 */
export interface RuleCompilationSchemaOptions {
  /**
   * Remove binder-scoped scalar references (`elem` and `pair`) from this
   * decoder request. Use only when the source names direct scalar positions and
   * contains no quantified collection. This prevents a small model from
   * emitting references that are invalid outside map/filter/pairs binders.
   */
  forbidBinderScopedScalars?: boolean;
}

export function getRuleCompilationCandidateJsonSchema(
  options: RuleCompilationSchemaOptions = {},
): unknown {
  const astSchema = getRuleAstJsonSchema();
  const astRecord =
    astSchema && typeof astSchema === "object"
      ? structuredClone(astSchema as Record<string, unknown>)
      : {};
  // `$schema` is a document-level declaration. The AST is nested inside this
  // envelope, so retain its definitions but omit that nested declaration.
  const nestedAstSchema = { ...astRecord };
  delete nestedAstSchema.$schema;
  // Zod's draft-7 conversion makes recursive AST nodes refer to
  // `#/definitions/...`. Those references are absolute to the response-schema
  // document, so definitions must live at this envelope's root rather than
  // inside its `ast` property.
  const definitions = nestedAstSchema.definitions as
    | Record<string, Record<string, unknown>>
    | undefined;
  delete nestedAstSchema.definitions;
  if (options.forbidBinderScopedScalars && definitions) {
    for (const definition of Object.values(definitions)) {
      if (!Array.isArray(definition.anyOf)) {
        continue;
      }
      definition.anyOf = definition.anyOf.filter((variant) => {
        if (!variant || typeof variant !== "object") {
          return true;
        }
        const properties = (variant as Record<string, unknown>).properties;
        if (!properties || typeof properties !== "object") {
          return true;
        }
        const kind = (properties as Record<string, unknown>).kind;
        const value =
          kind && typeof kind === "object"
            ? (kind as Record<string, unknown>).const
            : null;
        return value !== "elem" && value !== "pair";
      });
    }
  }
  const ticketSchema = {
    type: "array",
    minItems: 6,
    maxItems: 6,
    // Some OpenAI-compatible constrained decoders reject `uniqueItems` on
    // arrays even though they accept the rest of this schema. Uniqueness is
    // still enforced after decoding by `isSixUniqueDomainNumbers`, so omitting
    // this transport-only keyword broadens provider compatibility without
    // weakening accepted evidence.
    items: { type: "integer", minimum: 1, maximum: 100 },
  };
  const predicateExample = {
    type: "object",
    additionalProperties: false,
    properties: {
      draw: ticketSchema,
      guess: ticketSchema,
      outcome: { enum: ["WIN", "LOSE"] },
    },
    required: ["draw", "guess", "outcome"],
  };
  const rankingExample = {
    type: "object",
    additionalProperties: false,
    properties: {
      draw: ticketSchema,
      guess: ticketSchema,
      score: { type: "number" },
    },
    required: ["draw", "guess", "score"],
  };

  return {
    $schema: "http://json-schema.org/draft-07/schema#",
    ...(definitions ? { definitions } : {}),
    type: "object",
    additionalProperties: false,
    properties: {
      ast: nestedAstSchema,
      consumedSpans: {
        type: "array",
        minItems: 1,
        maxItems: 12,
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            text: { type: "string", minLength: 1, maxLength: 6000 },
          },
          required: ["text"],
        },
      },
      workedExamples: {
        type: "array",
        minItems: 2,
        maxItems: 8,
        items: { anyOf: [predicateExample, rankingExample] },
      },
    },
    required: ["ast", "consumedSpans", "workedExamples"],
  };
}

export interface RuleCompileArtifactOptions {
  astProvider: RuleAstProvider;
  /** Independent source-to-AST pass used when no deterministic reading exists. */
  astReviewer?: RuleAstReviewer;
  preferDeterministic?: boolean;
  /** Fail closed unless an LLM response includes verified source evidence. */
  requireProviderEvidence?: boolean;
  /**
   * Diagnostic escape hatch: stop buying a mandatory second opinion and stop
   * rejecting on PROVIDER_DISAGREEMENT. The disagreement is still measured and
   * still recorded in the audit log — only the rejection is lifted, so a
   * divergence never becomes invisible. Defaults OFF; the API gates it behind
   * TYCHE_RULE_COMPILER_CONSENSUS_DISABLED and it must stay off in production,
   * where one unchecked reading decides who gets paid.
   */
  disableConsensus?: boolean;
}

export interface RuleCompilationRequest {
  /**
   * The interpret agent's own sentence about the rule — what the player read in
   * chat and approved. Distinct from `officialInterpretation`, which the
   * deterministic path overwrites with the AST-derived description: keeping the
   * agent's reading separate is what lets the compiler notice the two diverging
   * instead of silently shipping the second one.
   */
  agentInterpretation?: string;
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

export type RuleCompilerStageName =
  | "schema_validation"
  | "independent_review"
  | "provider_evidence"
  | "runtime_bounds"
  | "interpretation_coverage"
  | "agent_statement_coverage"
  | "runtime_harness"
  | "decision";

export interface RuleCompilerStageResult {
  detail: string;
  reasonCodes: RuleValidationReasonCode[];
  stage: RuleCompilerStageName;
  status: "passed" | "failed" | "skipped";
}

export interface RuleProviderWorkedExampleDiagnostic {
  actualOutcome?: "WIN" | "LOSE";
  actualScore?: number;
  declaredOutcome?: "WIN" | "LOSE";
  declaredScore?: number;
  detail: string;
  index: number;
  status: "passed" | "failed";
}

export interface RuleProviderEvidenceStageDiagnostic {
  exampleResults: RuleProviderWorkedExampleDiagnostic[];
  sourceSpanDetail: string;
  sourceSpanStatus: "passed" | "failed";
}

/**
 * The provider candidate retained after a failed preflight. It deliberately
 * contains only the structured compiler envelope, never the provider prompt,
 * transport response, or model reasoning trace.
 */
export interface RuleRejectedCompilationCandidate {
  ast: unknown;
  consumedSpans: unknown;
  workedExamples: unknown;
}

export interface RuleCompilationAttemptDiagnostic {
  candidate: RuleRejectedCompilationCandidate | null;
  decision: RuleValidationDecision;
  providerEvidence: RuleProviderEvidenceStageDiagnostic | null;
  reasonCodes: RuleValidationReasonCode[];
  schemaError: string | null;
  /** Concrete input on which an independent reviewer and draft disagree. */
  semanticDisagreementWitness?: RuleSemanticDisagreementWitness | null;
  stages: RuleCompilerStageResult[];
  status: AgentProviderAttemptStatus;
}

export interface RuleSemanticDisagreementWitness {
  draftResult: string;
  draw: number[];
  guess: number[];
  reviewerResult: string;
}

export interface RuleValidationLog {
  /** Detailed, structured trace for every compiler attempt. */
  attemptDiagnostics: RuleCompilationAttemptDiagnostic[];
  compiledArtifactHash: string | null;
  confidence: CompilerConfidenceBreakdown;
  confidenceAction: RuleConfidenceAction;
  confidenceThresholds: CompilerConfidenceThresholds;
  confidenceWeights: CompilerConfidenceWeights;
  decision: RuleValidationDecision;
  difficultyClass: RuleDifficultyClass;
  /** False when no harness ran, so `difficultyClass` is the unmeasured default.
   *  Consumers that show or explain difficulty must check this first: an
   *  unsupported rule reports IMPOSSIBLE without a single sampled guess. */
  difficultyMeasured: boolean;
  estimatedWinRate: number;
  /**
   * True when `estimatedWinRate` is 0 only because the bounded sample could not
   * resolve a rate this small, while a directed search proved the rule winnable.
   * Anything that shows a win rate to a player must read `estimatedWinRateUpperBound`
   * instead of quoting the 0: the rule was accepted as winnable in the same run,
   * so "your win rate is 0" would contradict its own verdict.
   */
  estimatedWinRateBelowSampleResolution: boolean;
  /**
   * Highest win rate consistent with the sample (~95% confidence), set only when
   * no win was observed. Null whenever `estimatedWinRate` is a real point
   * estimate. This is the `confidence_interval` PRD 6.8 requires be recorded.
   */
  estimatedWinRateUpperBound: number | null;
  evaluatedTestCases: RuleValidationTestResult[];
  fallbackRateSample: number;
  fallbackTriggered: boolean;
  generatedTestCases: RuleValidationTestCase[];
  model: string;
  modelIdentity: AgentModelIdentity;
  normalizedText: string;
  promptContract: RuleValidationPromptContract;
  provider: string;
  /**
   * True only when a measured disagreement actually decided the outcome. It is
   * false when consensus is disabled, so a consumer must not read
   * `providerDisagreementRateSample` alone as "the disagreement is why this rule
   * was blocked" — the sample records that it happened, this records that it
   * mattered.
   */
  providerDisagreementBlocked: boolean;
  providerDisagreementRateSample: number;
  /**
   * The DISTINCT executable readings the providers produced for this one text,
   * each rendered as the player-facing sentence its AST implements, in the order
   * the providers were asked.
   *
   * Fewer than two entries means there was no genuine multi-reading divergence
   * (one provider answered, or the ones that did produced no AST to compare).
   * Two or more is the machine-checked evidence that the text — not the
   * compiler — has more than one meaning, which is what a consumer needs in
   * order to ask the player WHICH reading they meant instead of asserting that
   * nothing is missing from their wording.
   */
  providerDisagreementReadings: readonly string[];
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
  schemaVersion: 1 | 2 | 3;
  skillVersion: string;
  /** Exact normalized-rule spans the compiler consumed into the AST. */
  sourceSpans: readonly RuleSourceSpan[];
  testCoverageScore: number;
  testHarnessVersion: string;
  /** Concrete inputs showing the frozen rule winning and losing (PRD §6.5). */
  workedExamples: readonly RuleWorkedExample[];
}

export type ProviderFailureMode =
  | "malformed_response"
  | "schema_validation_failure"
  | "timeout";

export interface RuleValidationPromptContract {
  allowedInputs: readonly ["guess", "draw"];
  output: "RuleCompilationCandidate | INVALID";
  prohibitedReferences: readonly string[];
  requiredChecks: readonly string[];
  version: "tyche_rule_validation_prompt_v2";
}

const NUMBER_WORDS = new Map<string, number>([
  ["zero", 0],
  ["one", 1],
  ["two", 2],
  ["three", 3],
  ["four", 4],
  ["five", 5],
  ["six", 6],
  ["seven", 7],
  ["eight", 8],
  ["nine", 9],
  ["ten", 10],
  ["um", 1],
  ["uma", 1],
  ["hum", 1],
  ["dois", 2],
  ["duas", 2],
  ["tres", 3],
  ["quatro", 4],
  ["cinco", 5],
  ["seis", 6],
]);

const MATCH_COUNT_NUMBER_1_TO_6 =
  "(?:[1-6]|one|two|three|four|five|six|um|uma|hum|dois|duas|tres|quatro|cinco|seis)";
const MATCH_COUNT_NUMBER_0_TO_6 =
  "(?:[0-6]|zero|one|two|three|four|five|six|um|uma|hum|dois|duas|tres|quatro|cinco|seis)";
const MATCH_COUNT_NOUN =
  "(?:numbers?|matches|hits|overlaps?|acertos?|numeros?|dezenas?)";
const MATCH_COUNT_ACTION =
  "(?:match(?:es|ed|ing)?|hits?|appear(?:s|ed|ing)?|in the draw|acert\\w*|aparec\\w*|sortead\\w*|coincid\\w*|bat\\w*)";
const EXACT_COUNT_CUE = "(?:exactly|only|exatamente|apenas|somente|so)";
const THRESHOLD_COUNT_CUE =
  "(?:at least|no fewer than|pelo menos|ao menos|no minimo|minimo de|>=)";

const AMBIGUOUS_PATTERNS = [
  // `close`/`near` need a numeric distance. Their superlative forms do not:
  // "the closest/nearest score" is an objective ranking (argmin), just as
  // "the highest score" is an objective ranking (argmax).
  /\b(close|near|almost)\b/i,
  /\b(lucky|unlucky|interesting|creative|best|better|worst|fair|randomly)\b/i,
  /\b(about|around|roughly|approximately|similar)\b/i,
  /\b(feels?|vibe|balanced|nice|nicely|pattern|mirror-like|stronger)\b/i,
  /(?<!\bas\s)\bmany\b|\b(several|spread out|well spread|organized|cleaner)\b/i,
  /\b(anything|something|whatever)\b/i,
  // `some` is ambiguous only when it supplies an unspecified CARDINALITY
  // ("some positions", "some of my numbers"). Before a singular noun it is the
  // ordinary existential quantifier: "exactly one less than some drawn number"
  // means there exists a drawn number and leaves no quantity unstated.
  /\bsome\s+(?:of\s+(?:the|my|your|its)\s+)?(?:numbers|values|positions|places|slots|picks|matches|hits)\b/i,
  /\b(harmonious|near-perfect)\b/i,
  // Vague vocabulary from prompt-set-2: similes, hedges, and aesthetic words
  // that have no measurable threshold until the player defines one. A word here
  // sends the rule to the CLARIFY flow, never to a silent interpretation.
  /\b(kind\s+of|sort\s+of|basically|somehow|enough)\b/i,
  /\b(looks?|feels?|feeling)\s+like\b/i,
  /\b\w+-(looking|style|heavy)\b/i,
  /\b(satisfying|rhythm|symmetrical|clustered|forgiving|safer|strange|soft|mirrors?)\b/i,
  /\bnot\s+too\b|\btoo\s+(many|much|high|low|predictable|boring)\b/i,
  /\b(a\s+few\s+places|second\s+chance|strong\s+beginning|good\s+way|in\s+a\s+good\s+way)\b/i,
  // A two-digit pick cannot match the one-digit values contained in it. When a
  // player uses that as an example, they may mean tens digits, units digits, or
  // either digit. Those are materially different rules, so require an explicit
  // digit property instead of silently compiling a whole-number match.
  /\b(?:play|played|playing|pick|picked|guess|guessed|jogar|joguei|jogando|apostar|aposto)\s+([1-9])\d\b[\s\S]{0,160}\b(?:number|numbers|numero|numeros)\s+\1\b/i,
  /\b(?:play|played|playing|pick|picked|guess|guessed|jogar|joguei|jogando|apostar|aposto)\s+\d([0-9])\b[\s\S]{0,160}\b(?:number|numbers|numero|numeros)\s+\1\b/i,
] as const;

// A ranking tie is settled by the protocol (`tieBreak: "share_pool"). A
// complete clause that merely states that mandated behavior is neither an
// external prize dependency nor an undefined quantity. Other prize/pool text
// remains visible to the normal external-dependency block.
const PROTOCOL_TIE_BREAK_CLAUSE_PATTERN =
  /(?:^|[.;]\s*|\s*(?:,|;|\band\b)\s*)(?:if\s+)?(?:(?:several|some|multiple|two\s+or\s+more)\s+)?(?:tickets?|guesses?|players?)\b(?=[^.;]{0,180}\b(?:share|sharing|split|splitting)\b[^.;]{0,60}\b(?:prize|pool|it|equally)\b)(?=[^.;]{0,180}\b(?:tie|tied|level|equal(?:ly)?(?:\s+(?:close|near))?|same\s+(?!(?:wallet|address|creator|voter|profile|admin|time|block|transaction|signature|balance|prize|pool|payout|fee|weather|price|oracle|history|turn|round)\b)[^.;,]{1,60}?(?=,|\s+(?:share|sharing|split|splitting)\b))\b)[^.;]*(?:[.;]|$)/giu;

// A protocol tie statement cannot carry an additional condition. Keeping such
// a sentence visible is what lets the normal dependency gate reject constructs
// such as "equal scores share the prize only when it rains" instead of erasing
// the external condition together with the harmless settlement wording.
const NON_PROTOCOL_TIE_CONTEXT_PATTERN =
  /\b(?:wallet|address|creator|voter|votes?|leaderboard|profile|admin|time|timestamp|block|transaction|signature|balance|fees?|weather|rain|price|oracle|twitter|discord|website|api|previous|next|future|history|turn|round|only\s+if|unless|provided\s+that)\b/iu;

function stripProtocolTieBreakClauses(text: string) {
  return text
    .replace(PROTOCOL_TIE_BREAK_CLAUSE_PATTERN, (clause) =>
      NON_PROTOCOL_TIE_CONTEXT_PATTERN.test(clause) ? clause : " ",
    )
    // The interpreter is allowed to add the protocol's deterministic tie
    // handling, and commonly phrases it without repeating a subject noun:
    // "with ties splitting the prize equally". Strip only that exact
    // settlement statement; any following condition remains visible to the
    // external-dependency gate.
    .replace(
      /\b(?:with\s+)?ties?\s+(?:on\s+the\s+(?:same|highest|lowest)\s+(?:score|count|total|value)\s+)?(?:result(?:ing)?\s+in\s+)?(?:an?\s+)?(?:equal(?:ly)?\s+)?(?:share|sharing|split(?:ting)?)\s+(?:of\s+)?(?:the\s+)?(?:prize|pool|it)(?:\s+equally)?\b/giu,
      " ",
    )
    .replace(
      /\b(?:tickets?|guesses?|players?)\s+(?:that\s+are\s+)?equally\s+(?:close|near)\s+(?:share|split)\s+(?:the\s+)?(?:prize|pool|it)(?:\s+equally)?\b/giu,
      " ",
    );
}

const EXTERNAL_DEPENDENCY_PATTERNS = [
  /\b(wallet|address|creator|voter|votes?|leaderboard|profile|admin)\b/i,
  /\b(time|timestamp|block|transaction|signature|balance|prize|pool|payout|fees?)\b/i,
  /\b(solana\s+slot|block\s+slot|slot\s+hash|slot\s+height)\b/i,
  /\b(previous|next|future|history|streak|yesterday|today|tomorrow|last\s+turn|last\s+round|this\s+week)\b/i,
  /\bpast\s+(?:turns?|rounds?|draws?|results?|winners?|guesses?|tickets?|events?|weeks?|days?|hours?)\b/i,
  /\bsame\s+rule\b.{0,60}\bdifferent\s+wording\b/i,
  /\b(other players?|all players?|no other player|among all players|everyone\s+else)\b/i,
  // Weather is external only as an actual condition ("weather", "raining"). A
  // weather WORD the player redefines numerically ("define sunny as at least
  // four drawn numbers above 50") is not a dependency — see prompt-set-2 #155.
  /\b(weather|rain|rains|raining|price|oracle|twitter|x\/twitter|discord|website|api|external)\b/i,
  /\bsunny\b.{0,30}\b(during|weather|outside|forecast)\b|\b(weather|forecast)\b.{0,30}\bsunny\b|\bif\s+it\s+is\s+sunny\b/i,
  // Provider / model identity: a rule must never depend on which AI/provider
  // compiled it (that is off-chain, non-deterministic infrastructure state).
  /\b(openai|anthropic|gpt-?\d|claude|gemini|ollama|vllm|compiler\s+provider|model\s+provider|provider\s+is)\b/i,
  // AI subjectivity / non-determinism: the AI must convert intent, never decide
  // the outcome. "the AI thinks/decides/chooses/knows", "let the AI ...".
  /\b(a\.?i\.?|artificial\s+intelligence|llm)\b[^.]{0,25}\b(think|thinks|thought|decide|decides|deciding|choose|chooses|choosing|judge|judges|feel|feels|knows?|privately|interpret|reinterpret)\b/i,
  /\blet\s+the\s+(ai|model|runtime|dealer)\b/i,
  /\bask\s+the\s+runtime\b/i,
  // Meta / game-state: outcomes tied to the rule's own election/standing.
  /\brule\s+of\s+the\s+hour\b/i,
  /\b(early\s+supporters?|before\s+everyone|first\s+to\s+(propose|vote|support|back))\b/i,
] as const;

const PROMPT_CONTRACT: RuleValidationPromptContract = {
  allowedInputs: ["guess", "draw"],
  output: "RuleCompilationCandidate | INVALID",
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
    "verify every intent-bearing source span was consumed",
    "execute source-derived worked examples against the compiled AST",
    "generate deterministic standard and adversarial test cases",
    "execute tests through the deterministic runtime",
    "compute confidence breakdown",
  ],
  version: "tyche_rule_validation_prompt_v2",
};

export function getRuleValidationPromptContract(): RuleValidationPromptContract {
  return PROMPT_CONTRACT;
}

// A dismissal clause explicitly REMOVES a dependency ("no weather;", "forget
// shares,", "ignore wallet history and", "without comparing other players,").
// The banned noun inside such a clause is the thing being taken OUT of the rule,
// so it must not trigger the external-dependency block (prompt-set-2 sequences
// 3/5/6/12/18/20 refinements). Safety valve: a clause that still talks about
// winning/eligibility/payment ("no wallet outside the allowlist can win") is
// NOT a dismissal and is kept for matching.
const DISMISSAL_CLAUSE_PATTERN =
  /\b(?:no|without|forget(?:\s+about)?|ignore|ignoring|not\s+using|stop\s+using|instead\s+of)\b[^.;:,]*?(?=[.;:,]|\band\b|\bmake\b|\bjust\b|\bthen\b|$)/gi;

// A simile ("make it look like a return streak") describes a numeric pattern by
// analogy — the noun inside it is not a data dependency. The simile itself is
// vague, so it still routes to CLARIFY via AMBIGUOUS_PATTERNS.
const SIMILE_CLAUSE_PATTERN =
  /\b(?:look|looks|looking|feel|feels|feeling|seem|seems)\s+like\b[^.;:,]*/gi;
const DISMISSAL_KEEP_PATTERN =
  /\b(win|wins|winners?|eligible|eligibility|qualif\w+|pay|paid|pays|payout)\b/i;

// "Let the AI pick the most reasonable objective version ..." asks for the
// clarification flow itself, not for the model to decide winners — route it to
// CLARIFY instead of BLOCK.
const OBJECTIVE_CLARIFICATION_PATTERN =
  /\b(?:let\s+the\s+(?:ai|model)|ai|model)\b[^.;:]{0,40}\b(?:pick|choose|select|suggest)s?\b[^.;:]{0,40}\b(?:reasonable|objective|measurable)\b[^.;:]{0,40}\b(?:version|interpretation|reading)\b[^.;:]*/gi;

/**
 * Text used for external-dependency matching: the normalized rule with
 * dismissal clauses and objective-clarification requests removed. Exposed so
 * the API preflight applies its own block patterns to the exact same view of
 * the text as the compiler gate (no gate disagreement).
 */
export function externalDependencyGateText(text: string): string {
  return stripProtocolTieBreakClauses(normalizeRuleText(text))
    .replace(OBJECTIVE_CLARIFICATION_PATTERN, " ")
    .replace(SIMILE_CLAUSE_PATTERN, (clause) =>
      DISMISSAL_KEEP_PATTERN.test(clause) ? clause : " ",
    )
    .replace(DISMISSAL_CLAUSE_PATTERN, (clause) =>
      DISMISSAL_KEEP_PATTERN.test(clause) ? clause : " ",
    );
}

/**
 * Fast, deterministic check for whether a rule references off-chain / external /
 * non-deterministic state (wallets, votes, prizes, time, other players, AI
 * subjectivity, provider identity, the rule's own election, ...). Exposed so the
 * API preflight can reject these BEFORE spending an LLM interpret call — the same
 * patterns the validator uses, so the pre-LLM gate and the validator agree. This
 * is intentionally the single source of truth for "external dependency".
 */
export function hasExternalDependency(text: string): boolean {
  return hasPattern(
    externalDependencyGateText(text),
    EXTERNAL_DEPENDENCY_PATTERNS,
  );
}

/**
 * Fast, deterministic check for subjective / vague wording that cannot be turned
 * into an objective predicate without clarification (close, lucky, balanced,
 * vibe, ...). Exposed for the same reason as hasExternalDependency.
 */
export function hasAmbiguousWording(text: string): boolean {
  return hasPattern(
    stripProtocolTieBreakClauses(normalizeRuleText(text)),
    AMBIGUOUS_PATTERNS,
  );
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

function shouldContinueAfterAttempt(
  attempts: ProviderEvaluation[],
  requireSecondOpinion = false,
): boolean {
  if (hasUnresolvedReviewerMismatch(attempts) && attempts.length < 3) {
    return true;
  }
  if (resolveReviewerDisagreement(attempts)) {
    return false;
  }
  if (
    attempts.some((attempt) =>
      attempt.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"),
    ) &&
    countCompletedOpinions(attempts) < 2 &&
    attempts.length < 3
  ) {
    return true;
  }
  // With no deterministic reference reading, a single provider's AST is the only
  // account of what the rule means and nothing can contradict it. Buy a second
  // opinion in exactly that case — when the reviewer HAS a reference it already
  // serves as the independent check, so the extra call is not spent.
  if (attempts.length === 1 && requireSecondOpinion) {
    return true;
  }
  // Re-ask another provider when the current one disagrees with the first
  // completed opinion (PRD §7.4 escalation), up to the tertiary tiebreaker.
  return (
    attempts.length >= 2 &&
    hasProviderDisagreement(attempts) &&
    attempts.length < 3
  );
}

/**
 * True when no deterministic reading of this text exists, so the provider's
 * answer would otherwise go unchecked. Measured over the project's own prompt
 * test sets, this is roughly one rule in five.
 */
function lacksDeterministicReference(request: RuleCompilationRequest): boolean {
  return compileSupportedRule(normalizeRuleText(request.prompt)) === null;
}

// Turns the collected per-provider attempts into the final validation result
// (selection, disagreement resolution, artifact, audit log). Shared by the
// offline and LLM orchestrators.
function finalizeValidation(
  request: RuleCompilationRequest,
  timestamp: string,
  attempts: ProviderEvaluation[],
  fallbackAttempt: ProviderEvaluation,
  options: { disableConsensus?: boolean; requireSecondOpinion?: boolean } = {},
): RuleValidationResult {
  let finalEvaluation: ProviderEvaluation | null = null;
  // Only attempts that actually produced an opinion may decide the outcome. A
  // provider that timed out or returned garbage scores as low-confidence and
  // would otherwise override an accepted answer purely by failing.
  for (const evaluation of attempts.filter(isCompletedProviderOpinion)) {
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
      ? (resolveReviewerDisagreement(attempts) ??
        resolveProviderDisagreement(attempts))
      : null;
  // The disagreement is measured either way; this flag only decides whether it
  // blocks. With consensus disabled the sample and the reason code still reach
  // the audit log below, so a divergence stays visible instead of vanishing.
  const disagreementBlocks =
    providerDisagreementRateSample === 1 && !options.disableConsensus;
  const selectedAttempt = disagreementBlocks
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
  // Two independent readings of the SAME text that execute differently are
  // evidence about the text, not about the compilers. Reporting only
  // PROVIDER_DISAGREEMENT put that evidence on the wrong side of the boundary:
  // the player was told "your wording is clear" and "no missing rule detail was
  // identified", and the clarification questions were deleted — so the one
  // person who could resolve the divergence was told there was nothing to
  // resolve, and the rule could never be frozen however often it was retried.
  //
  // `AMBIGUOUS_RULE` is the code PRD §6.6 already defines for a rule that must
  // not be accepted silently and has to be clarified first. Reaching it through
  // the keyword gate alone (`close`, `lucky`, `balanced`, ...) can only ever
  // catch ambiguous VOCABULARY; a divergence between compiled ASTs is how
  // ambiguous STRUCTURE announces itself, and it is measured on every rule
  // rather than enumerated in a word list.
  //
  // Only genuine multi-reading divergence qualifies. A non-answer (timeout,
  // malformed, schema-invalid) is already excluded from the comparison, and an
  // attempt that produced no AST contributes no reading — so a rule the
  // compilers simply could not compile keeps reporting exactly why.
  const disagreementReadings = collectDivergentProviderReadings(
    attempts,
    request.originalText?.trim() || request.prompt,
  );
  if (
    disagreementBlocks &&
    disagreementResolution === null &&
    disagreementReadings.length >= 2
  ) {
    reasonCodes.add("AMBIGUOUS_RULE");
  }
  // A second opinion was required and could not be obtained (no second provider
  // reachable, or every extra attempt failed). The rule still stands on one
  // unchecked reading — record that in the audit log instead of letting it pass
  // silently as if it had been corroborated.
  if (
    countCompletedOpinions(attempts) < 2 &&
    (options.requireSecondOpinion ||
      attempts.some((attempt) =>
        attempt.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"),
      ))
  ) {
    reasonCodes.add("SECOND_OPINION_UNAVAILABLE");
  }

  const reasonSummary = summarizeReasons(
    selectedAttempt.confidenceAction,
    selectedAttempt.decision,
    [...reasonCodes].filter((reason) => reason !== "SUPPORTED_RULE"),
    selectedAttempt.confidence.final_confidence,
    fallbackTriggered,
    disagreementBlocks && disagreementResolution === null,
    disagreementReadings.length,
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
      attemptDiagnostics: attempts.map((attempt) => attempt.diagnostics),
      compiledArtifactHash: artifactHash,
      confidence: selectedAttempt.confidence,
      confidenceAction: selectedAttempt.confidenceAction,
      confidenceThresholds: COMPILER_CONFIDENCE_THRESHOLDS,
      confidenceWeights: COMPILER_CONFIDENCE_WEIGHTS,
      decision: selectedAttempt.decision,
      difficultyClass: selectedAttempt.difficultyClass,
      difficultyMeasured: selectedAttempt.difficultyMeasured,
      estimatedWinRate: selectedAttempt.estimatedWinRate,
      estimatedWinRateBelowSampleResolution:
        selectedAttempt.estimatedWinRateBelowSampleResolution,
      estimatedWinRateUpperBound: selectedAttempt.estimatedWinRateUpperBound,
      evaluatedTestCases: selectedAttempt.evaluatedTestCases,
      fallbackRateSample: fallbackTriggered ? 1 : 0,
      fallbackTriggered,
      generatedTestCases: selectedAttempt.generatedTestCases,
      model: selectedAttempt.modelIdentity.model,
      modelIdentity: selectedAttempt.modelIdentity,
      normalizedText: selectedAttempt.normalizedText,
      promptContract: PROMPT_CONTRACT,
      provider: selectedAttempt.modelIdentity.provider,
      providerDisagreementBlocked: disagreementBlocks,
      providerDisagreementRateSample,
      providerDisagreementReadings: disagreementReadings,
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

  const consensusDisabled = options.disableConsensus === true;
  const requireSecondOpinion =
    !consensusDisabled &&
    lacksDeterministicReference(request) &&
    options.astReviewer === undefined;
  const arbitrationOptions: RuleCompileArtifactOptions = { ...options };
  delete arbitrationOptions.astReviewer;

  for (const providerConfig of providerRouting.providers) {
    const evaluation = await evaluateProviderAttemptAsync(
      request,
      timestamp,
      providerConfig,
      // The dedicated reviewer already supplied the second reading. Later
      // provider slots are arbiters; asking the same reviewer again would
      // duplicate one side of the disagreement instead of breaking it.
      attempts.length === 0 ? options : arbitrationOptions,
      attempts
        .filter(
          (attempt) =>
            attempt.astSource === "provider" &&
            attempt.ast !== null &&
            isCompletedProviderOpinion(attempt),
        )
        .map((attempt) => attempt.ast as RuleAst),
      options.astReviewer !== undefined,
    );
    attempts.push(evaluation);
    if (
      evaluation.status === "accepted" &&
      !shouldContinueAfterAttempt(attempts, requireSecondOpinion)
    ) {
      break;
    }
    if (
      evaluation.status === "rejected" &&
      evaluation.confidenceAction === "REJECT" &&
      !evaluation.reasonCodes.includes("REVIEWER_MISMATCH") &&
      !evaluation.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE") &&
      !shouldContinueAfterAttempt(attempts, requireSecondOpinion)
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
  return finalizeValidation(request, timestamp, attempts, fallback, {
    disableConsensus: consensusDisabled,
    requireSecondOpinion,
  });
}

interface ProviderEvaluation {
  artifact: RuleCompiledArtifact | null;
  artifactHash: string | null;
  ast: RuleAst | null;
  astSource: "deterministic" | "provider";
  capabilityFlags: AgentProviderConfig["capabilities"];
  confidence: CompilerConfidenceBreakdown;
  confidenceAction: RuleConfidenceAction;
  decision: RuleValidationDecision;
  difficultyClass: RuleDifficultyClass;
  /** False when no harness ran, so `difficultyClass` is the unmeasured default. */
  difficultyMeasured: boolean;
  diagnostics: RuleCompilationAttemptDiagnostic;
  estimatedWinRate: number;
  estimatedWinRateBelowSampleResolution: boolean;
  estimatedWinRateUpperBound: number | null;
  evaluatedTestCases: RuleValidationTestResult[];
  generatedTestCases: RuleValidationTestCase[];
  modelIdentity: AgentModelIdentity;
  normalizedText: string;
  priority: AgentProviderPriority;
  reasonCodes: RuleValidationReasonCode[];
  /** Source-only reviewer reading used to arbitrate a novel candidate. */
  reviewerAst: RuleAst | null;
  reviewerAstSource: "deterministic" | "provider" | null;
  requestShape: AgentProviderConfig["request_shape"];
  /** Why the emitted AST failed `ruleAstSchema`, or null when it did not. */
  schemaError: string | null;
  status: AgentProviderAttemptStatus;
}

interface AttemptContext {
  forcedFailure: ProviderFailureMode | undefined;
  modelIdentity: AgentModelIdentity;
  normalizedText: string;
  reasonCodes: Set<RuleValidationReasonCode>;
}

interface ProviderCompilationEvidence {
  consumedSpans: unknown;
  workedExamples: unknown;
}

interface VerifiedProviderEvidence {
  sourceSpans: readonly RuleSourceSpan[];
  workedExamples: readonly RuleWorkedExample[];
}

function unwrapProviderCompilation(value: unknown): {
  evidence: ProviderCompilationEvidence | null;
  rawAst: unknown;
} {
  if (!value || typeof value !== "object" || !("ast" in value)) {
    return { evidence: null, rawAst: value };
  }
  const candidate = value as Record<string, unknown>;
  return {
    evidence: {
      consumedSpans: candidate.consumedSpans,
      workedExamples: candidate.workedExamples,
    },
    rawAst: candidate.ast,
  };
}

/**
 * Whether a provider compile envelope carries an AST the runtime grammar
 * accepts.
 *
 * This exists for the transport's re-ask decision, not to judge the rule: the
 * transport asks "is this response worth keeping, or should I spend a retry?"
 * Every validity gate still runs downstream on whatever the last attempt
 * returned, so a response this rejects is reported exactly as before once the
 * retries are used up. It lives here because the grammar lives here — a copy of
 * the unwrap-and-parse logic in the transport would drift from the schema it is
 * supposed to be checking against.
 */
export function providerCompilationHasSchemaValidAst(value: unknown): boolean {
  const { rawAst } = unwrapProviderCompilation(value);
  return rawAst != null && ruleAstSchema.safeParse(rawAst).success;
}

function isSixUniqueDomainNumbers(value: unknown): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === 6 &&
    value.every(
      (number) =>
        Number.isInteger(number) &&
        typeof number === "number" &&
        number >= 1 &&
        number <= 100,
    ) &&
    new Set(value).size === 6
  );
}

// Which leftover source text actually blocks a compile.
//
// The rule used to be: strip a short list of articles and connectives, then
// demand the residue be EMPTY. That rejected faithful compiles over ordinary
// framing words — "a guess wins ONLY if ...", "the PLAYER wins when ..." — and
// the player had no way to rewrite around an invisible stopword list, because
// the advice they were shown ("restate every load-bearing number") does not
// touch the word that blocked them.
//
// Test positively instead: unconsumed text blocks the compile when it still
// carries something that can change who wins — a number, a comparator, a
// quantifier, a negation, an operation, or an ordering/position word. Bare
// source nouns (guess, draw, ticket) are deliberately NOT in the list: alone
// they state no condition, and a genuinely dropped clause always brings one of
// the categories below with it ("and the drawn sum is even" carries both `sum`
// and `even`).
const INTENT_BEARING_RESIDUE = new RegExp(
  [
    "\\d",
    // comparators, thresholds, distances
    "\\b(?:greater|higher|above|over|more|most|larger|bigger|less|lower|below|under|fewer|least|smaller|equals?|identical|same|different|differs?|differ|exact|exactly|precisely|between|within|than|close|closer|closest|near|nearest|apart)\\b",
    // Quantifiers and negation. Bare "no" is deliberately absent: it is a
    // Portuguese preposition ("no sorteio"), and the English determiner never
    // travels alone — "no guessed number APPEARS in the draw" is caught by the
    // matching verb below.
    "\\b(?:all|every|each|both|any|none|neither|nor|not|never)\\b",
    // aggregation and arithmetic
    "\\b(?:sum|sums|summed|total|totals|count|counts|average|product|plus|minus|times|divided|double|doubled|triple|half|modulo|mod|remainder|multiple|multiples)\\b",
    // number properties
    "\\b(?:even|odd|parity|digits?|units?|tens|dezenas?)\\b",
    // ordering and positions
    "\\b(?:order|ordered|sequence|positions?|index|reverse|reversed|sorted|sort|first|second|third|fourth|fifth|sixth|last|highest|lowest|smallest|largest|minimum|maximum)\\b",
    // matching and membership
    "\\b(?:match|matches|matching|appears?|appearing|contains?|includes?|hits?|miss|misses|missing|wrong|shares?|overlaps?|repeats?)\\b",
    // Portuguese equivalents (text is diacritic-stripped and lowercased)
    "\\b(?:maior(?:es)?|menor(?:es)?|igua(?:l|is)|diferentes?|exat[oa]|exatamente|entre|acima|abaixo|somas?|somam|totais?|media|quantidade|resto|multiplos?|dobro|metade|pares?|impares?|ordem|posicoes?|primeiro|ultimo|invertid[oa]|inversa|acerta(?:r|m)?|acertos?|errar|erros?|aparece(?:m)?|contem|tod[oa]s?|cada|nenhum[ao]?|nao|sem|mais|menos|pelo|maximo|minimo)\\b",
  ].join("|"),
  "u",
);

// What the residue test must NOT count as a dropped clause.
//
// The gate asks "is there leftover text that could change who wins?". Two kinds
// of leftover provably cannot, and counting them rejected correct compiles:
//
//   - A range spanning the whole number domain. A guess is always six numbers
//     from 1 to 100, so "from 1 to 100" restates the ticket rather than
//     constraining it — the same reasoning `stripVacuousRanges` already applies
//     on the coverage side.
//   - A value the frozen artifact already implements. The residue exists to
//     surface assertions the AST does NOT carry; a literal it does carry is
//     evidence of nothing. This is the exact dual of the coverage gate.
//
// Turn 57 was blocked by precisely this: after the player confirmed that the two
// remaining numbers are unrestricted, the interpret agent (correctly, per its
// own contract) preserved that remainder in the wording — "the remaining two
// numbers are distinct and from 1 to 100 excluding 1, 2, 3, and 4" — which is
// vacuously true of every valid ticket that already contains 1, 2, 3 and 4. The
// compiler rightly refused to compile a no-op, then the gate read the unconsumed
// no-op as a missing condition. The two contracts contradicted each other and
// the player had no wording that could satisfy both.
//
// Word-level cues are untouched: a genuinely dropped clause always brings a
// comparator, quantifier, operation or matching verb with it ("and at least two
// guessed numbers appear in the official draw" still blocks on `least`/`appear`,
// whatever its digits).
function stripNonConstrainingResidue(
  residue: string,
  astValues: ReadonlySet<number>,
) {
  return stripVacuousRanges(residue).replace(/\d{1,3}/gu, (digits) =>
    astValues.has(Number(digits)) ? " " : digits,
  );
}

function verifySourceSpanCoverage(
  text: string,
  value: unknown,
  astValues: ReadonlySet<number>,
): readonly RuleSourceSpan[] | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const covered = Array.from({ length: text.length }, () => false);
  const sourceSpans: RuleSourceSpan[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const rawSpan = (item as Record<string, unknown>).text;
    if (typeof rawSpan !== "string") {
      return null;
    }
    const span = normalizeRuleText(rawSpan);
    if (!span) {
      return null;
    }
    const start = text.indexOf(span);
    if (start < 0) {
      return null;
    }
    sourceSpans.push({ text: span });
    for (let index = start; index < start + span.length; index += 1) {
      covered[index] = true;
    }
  }

  // Spans cover semantic source text, not UI scaffolding. This is intentionally
  // not a "text contains AND -> AST contains and" heuristic: one span may cover
  // a whole range expression that a single quantified node consumes. Whatever
  // shape the AST takes, no intent-bearing comparison/threshold text may remain.
  const uncovered = [...text]
    .map((character, index) => (covered[index] ? " " : character))
    .join("");
  return INTENT_BEARING_RESIDUE.test(
    stripNonConstrainingResidue(uncovered, astValues),
  )
    ? null
    : sourceSpans;
}

// Why the outcome is a discriminated failure rather than `null`.
//
// Provider evidence can fail for reasons that share nothing but their timing:
// the model left an intent-bearing clause unconsumed (a possible DROPPED
// constraint), its worked examples disagree with an otherwise unreviewed AST,
// or it returned examples that are not even well-formed. When an independent
// source-only reviewer produced the same behavior, the server corrects only the
// declared result by executing the AST; malformed inputs and unreviewed
// contradictions still fail closed. Collapsing every remaining failure into one
// reason code made the pipeline
// tell every blocked player the same thing — "restate every load-bearing number
// and operation" — which is only true for the first case. A player whose model
// simply mis-numbered a worked example was sent rewriting numbers that were
// never dropped, and the only escape was to reword until the model got lucky.
type ProviderEvidenceFailure =
  | "examples_disagree"
  | "examples_malformed"
  | "span_coverage_incomplete";

type ProviderEvidenceVerification =
  | {
      diagnostic: RuleProviderEvidenceStageDiagnostic;
      evidence: VerifiedProviderEvidence;
      ok: true;
    }
  | {
      diagnostic: RuleProviderEvidenceStageDiagnostic;
      failure: ProviderEvidenceFailure;
      ok: false;
    };

function verifyProviderEvidence(
  ast: RuleAst,
  normalizedText: string,
  evidence: ProviderCompilationEvidence,
  sourceCertifiedByIndependentReviewer = false,
): ProviderEvidenceVerification {
  const providerSourceSpans = verifySourceSpanCoverage(
    normalizedText,
    evidence.consumedSpans,
    collectAstValues(ast),
  );
  // For a novel rule, two independently prompted LLM passes agreeing by
  // behavior is stronger source-fidelity evidence than the generator quoting
  // its own spans. Bind the whole approved normalized source on the server when
  // that independent review succeeded. This is not a silent fallback: the
  // diagnostic records that server binding replaced incomplete provider spans.
  const sourceSpans =
    providerSourceSpans ??
    (sourceCertifiedByIndependentReviewer ? [{ text: normalizedText }] : null);
  const diagnostic: RuleProviderEvidenceStageDiagnostic = {
    exampleResults: [],
    sourceSpanDetail: providerSourceSpans
      ? "All intent-bearing source clauses were covered by consumed spans."
      : sourceCertifiedByIndependentReviewer
        ? "The server bound the complete approved source after an independent reviewer certified the draft behavior."
        : "At least one intent-bearing source clause was not covered by the provider's consumed spans.",
    sourceSpanStatus: sourceSpans ? "passed" : "failed",
  };
  let firstExampleFailure: ProviderEvidenceFailure | null = null;
  if (
    !Array.isArray(evidence.workedExamples) ||
    evidence.workedExamples.length < 2
  ) {
    diagnostic.exampleResults.push({
      detail: "At least two worked examples are required.",
      index: 0,
      status: "failed",
    });
    firstExampleFailure = "examples_malformed";
  }

  const predicateExamples: RuleWorkedExample[] = [];
  if (Array.isArray(evidence.workedExamples)) {
    for (const [index, rawExample] of evidence.workedExamples.entries()) {
      if (!rawExample || typeof rawExample !== "object") {
        diagnostic.exampleResults.push({
          detail: "Example must be an object with draw and guess arrays.",
          index,
          status: "failed",
        });
        firstExampleFailure ??= "examples_malformed";
        continue;
      }
      const example = rawExample as Record<string, unknown>;
      if (
        !isSixUniqueDomainNumbers(example.guess) ||
        !isSixUniqueDomainNumbers(example.draw)
      ) {
        diagnostic.exampleResults.push({
          detail:
            "Draw and guess must each contain six unique integers from 1 through 100.",
          index,
          status: "failed",
        });
        firstExampleFailure ??= "examples_malformed";
        continue;
      }
      try {
        if (isRankingRule(ast)) {
          if (
            typeof example.score !== "number" ||
            !Number.isFinite(example.score)
          ) {
            if (sourceCertifiedByIndependentReviewer) {
              const actualScore = scoreGuess(ast, {
                draw: example.draw,
                guess: example.guess,
              });
              diagnostic.exampleResults.push({
                actualScore,
                detail:
                  "The missing or non-finite declared score was replaced with the deterministic runtime score after an independent reviewer confirmed the candidate behavior.",
                index,
                status: "passed",
              });
              continue;
            }
            diagnostic.exampleResults.push({
              detail: "Ranking examples must declare a finite numeric score.",
              index,
              status: "failed",
            });
            firstExampleFailure ??= "examples_malformed";
            continue;
          }
          const actualScore = scoreGuess(ast, {
            draw: example.draw,
            guess: example.guess,
          });
          const passed = actualScore === example.score;
          const independentlyCorrected =
            !passed && sourceCertifiedByIndependentReviewer;
          diagnostic.exampleResults.push({
            actualScore,
            declaredScore: example.score,
            detail: passed
              ? "Declared score matches the candidate AST."
              : independentlyCorrected
                ? "The declared score was corrected to the deterministic runtime score after an independent reviewer confirmed the candidate behavior."
                : "Declared score does not match the candidate AST.",
            index,
            status: passed || independentlyCorrected ? "passed" : "failed",
          });
          if (!passed && !independentlyCorrected) {
            firstExampleFailure ??= "examples_disagree";
          }
        } else {
          if (example.outcome !== "WIN" && example.outcome !== "LOSE") {
            if (sourceCertifiedByIndependentReviewer) {
              const actualOutcome = evaluatePredicate(ast, {
                draw: example.draw,
                guess: example.guess,
              }).result;
              diagnostic.exampleResults.push({
                actualOutcome,
                detail:
                  "The missing declared outcome was replaced with the deterministic runtime outcome after an independent reviewer confirmed the candidate behavior.",
                index,
                status: "passed",
              });
              predicateExamples.push({
                draw: example.draw,
                guess: example.guess,
                outcome: actualOutcome,
              });
              continue;
            }
            diagnostic.exampleResults.push({
              detail: "Predicate examples must declare outcome WIN or LOSE.",
              index,
              status: "failed",
            });
            firstExampleFailure ??= "examples_malformed";
            continue;
          }
          const actualOutcome = evaluatePredicate(ast, {
            draw: example.draw,
            guess: example.guess,
          }).result;
          const passed = actualOutcome === example.outcome;
          const independentlyCorrected =
            !passed && sourceCertifiedByIndependentReviewer;
          diagnostic.exampleResults.push({
            actualOutcome,
            declaredOutcome: example.outcome,
            detail: passed
              ? "Declared outcome matches the candidate AST."
              : independentlyCorrected
                ? "The declared outcome was corrected to the deterministic runtime outcome after an independent reviewer confirmed the candidate behavior."
                : "Declared outcome does not match the candidate AST.",
            index,
            status: passed || independentlyCorrected ? "passed" : "failed",
          });
          if (!passed && !independentlyCorrected) {
            firstExampleFailure ??= "examples_disagree";
          }
          if (passed || independentlyCorrected) {
            predicateExamples.push({
              draw: example.draw,
              guess: example.guess,
              outcome: actualOutcome,
            });
          }
        }
      } catch {
        diagnostic.exampleResults.push({
          detail: "The candidate AST could not evaluate this example.",
          index,
          status: "failed",
        });
        firstExampleFailure ??= "examples_malformed";
      }
    }
  }
  // Deliberately NOT "the provider must supply one WIN and one LOSE example".
  //
  // That requirement measured the model's luck, not the rule's fidelity, and it
  // was biased against exactly the rules it should protect: the rarer the win
  // condition, the harder it is for a model to construct a valid winning ticket
  // by hand, so a correct EXTREME compile was rejected while a trivial one
  // sailed through. Whether the compiled rule can actually separate winners from
  // losers is established downstream, deterministically and over many samples,
  // by the difficulty harness — DIFFICULTY_IMPOSSIBLE and DIFFICULTY_ALWAYS_TRUE
  // already block both degenerate cases. What provider evidence uniquely proves
  // is that the model did not contradict its own artifact, and every example
  // above had to agree with the AST for us to get here.
  if (!isRankingRule(ast) && predicateExamples.length < 2) {
    firstExampleFailure ??= "examples_malformed";
  }
  if (!sourceSpans) {
    return { diagnostic, failure: "span_coverage_incomplete", ok: false };
  }
  if (firstExampleFailure) {
    return { diagnostic, failure: firstExampleFailure, ok: false };
  }
  return {
    diagnostic,
    evidence: { sourceSpans, workedExamples: predicateExamples },
    ok: true,
  };
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

  if (hasAmbiguousWording(normalizedText)) {
    reasonCodes.add("AMBIGUOUS_RULE");
  }
  if (looksLikeObjectiveStartComparison(normalizedText)) {
    reasonCodes.delete("AMBIGUOUS_RULE");
  }
  if (looksLikeObjectiveEvenCountComparison(normalizedText)) {
    reasonCodes.delete("AMBIGUOUS_RULE");
  }
  if (parseWithinAnyDistanceCountRule(normalizedText)) {
    reasonCodes.delete("AMBIGUOUS_RULE");
  }
  if (parseClosestSumRankingRule(normalizedText)) {
    reasonCodes.delete("AMBIGUOUS_RULE");
  }
  // "all six reversed positions should match" carries an incidental vague word
  // ("around" in "flip the draw around") but is a fully explicit reverse rule.
  if (parseReversePositionMatchRule(normalizedText)) {
    reasonCodes.delete("AMBIGUOUS_RULE");
  }
  // A vague word (close, balanced, ...) is a false positive when the player is
  // explicitly DEFINING it with objective criteria that the deterministic
  // compiler can turn into a concrete predicate — e.g. "By close, I mean each
  // guessed number is within 5 ..." or "Balanced means exactly 3 odd and 3 even"
  // (prompt-set sequences 1 & 2, turns 72 and 75). Only clear the flag when both
  // hold, so a merely-vague rule (no definition, no compile) still asks to refine.
  if (looksLikeDefinedObjectiveRule(normalizedText)) {
    reasonCodes.delete("AMBIGUOUS_RULE");
  }
  if (looksLikeAmbiguousReverseRule(normalizedText)) {
    reasonCodes.add("AMBIGUOUS_RULE");
  }
  // Attribute policy violations only to text the player supplied. The compile
  // prompt may be an interpreter-authored paraphrase; treating a word added by
  // that paraphrase as player intent produced false EXTERNAL_DEPENDENCY blocks
  // that no player edit could prevent. A non-protocol external condition added
  // only by the interpreter still fails closed, but under the compiler-fidelity
  // code rather than falsely blaming the submitted rule.
  const sourceText = normalizeRuleText(
    request.originalText?.trim() || request.prompt,
  );
  const sourceHasExternalDependency = hasPattern(
    externalDependencyGateText(sourceText),
    EXTERNAL_DEPENDENCY_PATTERNS,
  );
  const compileTextHasExternalDependency = hasPattern(
    externalDependencyGateText(normalizedText),
    EXTERNAL_DEPENDENCY_PATTERNS,
  );
  if (sourceHasExternalDependency) {
    reasonCodes.add("EXTERNAL_DEPENDENCY");
  } else if (compileTextHasExternalDependency) {
    reasonCodes.add("AGENT_STATEMENT_MISMATCH");
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
  // Where `rawAst` came from. A reviewer must be an INDEPENDENT reading of the
  // same text, so each path draws it from the other side: a provider AST is
  // reviewed by `compileSupportedRule`, and a deterministic AST is reviewed by
  // the provider (passed in as `reviewerAst`). Deriving the reviewer here for
  // both paths made the deterministic path review itself — it always agreed,
  // which silently disabled REVIEWER_MISMATCH.
  astSource: "deterministic" | "provider",
  providerEvidence: ProviderCompilationEvidence | null = null,
  requireProviderEvidence = false,
  // The independent reading, when the caller already has one. Only the
  // deterministic path supplies it; the provider path derives its own below.
  suppliedReviewerAst: RuleAst | null = null,
): ProviderEvaluation {
  const { forcedFailure, modelIdentity, normalizedText } = ctx;
  const reasonCodes = ctx.reasonCodes;
  const stages: RuleCompilerStageResult[] = [];
  const candidate =
    rawAst !== null || providerEvidence !== null
      ? {
          ast: rawAst,
          consumedSpans: providerEvidence?.consumedSpans ?? null,
          workedExamples: providerEvidence?.workedExamples ?? null,
        }
      : null;

  const parsed =
    rawAst != null && !forcedFailure ? ruleAstSchema.safeParse(rawAst) : null;
  const ast: RuleAst | null = parsed?.success ? parsed.data : null;

  if (!ast || forcedFailure) {
    reasonCodes.add("UNSUPPORTED_RULE");
  } else {
    reasonCodes.add("SUPPORTED_RULE");
  }
  let schemaError: string | null = null;
  if (rawAst != null && !forcedFailure && !parsed?.success) {
    reasonCodes.add("SCHEMA_INVALID");
    schemaError = summarizeSchemaError(parsed);
  }
  stages.push({
    detail: ast
      ? "Candidate AST matches the supported rule schema."
      : (schemaError ?? "No usable candidate AST was returned."),
    reasonCodes: ast
      ? []
      : [...reasonCodes].filter(
          (code) => code === "SCHEMA_INVALID" || code === "UNSUPPORTED_RULE",
        ),
    stage: "schema_validation",
    status: ast ? "passed" : "failed",
  });
  // An independent reading of the same text. When it exists it is the strongest
  // available check: the two ASTs are compared by BEHAVIOR over the structured
  // battery, so an equivalent-but-differently-shaped compile passes and a rule
  // that merely looks similar does not.
  const reviewerAst =
    ast && !forcedFailure
      ? astSource === "provider"
        ? (suppliedReviewerAst ?? compileSupportedRule(normalizedText))
        : suppliedReviewerAst
      : null;
  const reviewerCoverage = reviewerAst
    ? analyzeInterpretationCoverage({
        ast: reviewerAst,
        officialInterpretation: describeRuleAstForPlayers(reviewerAst),
        text: request.originalText?.trim() || normalizedText,
      })
    : null;
  const reviewerPreservesSource = reviewerCoverage?.covered === true;
  const reviewerAstSource = reviewerAst
    ? astSource === "deterministic" || suppliedReviewerAst !== null
      ? "provider"
      : "deterministic"
    : null;
  // A reviewer program that already dropped a source value or operation is not
  // an independent reading of the rule and has no authority to veto a complete
  // candidate. Treat it as an unavailable opinion and continue to another
  // provider. This remains fail-closed until a usable second reading arrives.
  if (reviewerAst && !reviewerPreservesSource) {
    reasonCodes.add("SECOND_OPINION_UNAVAILABLE");
  }
  const reviewerMismatch =
    ast &&
    reviewerAst &&
    reviewerPreservesSource &&
    !knownAstSemanticsMatch(reviewerAst, ast);
  const semanticDisagreementWitness =
    reviewerMismatch && ast && reviewerAst
      ? findSemanticDisagreementWitness(reviewerAst, ast)
      : null;
  if (reviewerMismatch) {
    reasonCodes.add("REVIEWER_MISMATCH");
  }
  const reviewerStage: RuleCompilerStageResult = {
    detail: !ast
      ? "Skipped because no schema-valid AST was available."
      : !reviewerAst
        ? "No independent reviewer AST was available."
        : !reviewerPreservesSource
          ? `The reviewer AST was discarded because it did not preserve the complete source${
              reviewerCoverage?.missingOperations.length
                ? ` (missing operations: ${reviewerCoverage.missingOperations.join(", ")})`
                : reviewerCoverage?.missingFromAst.length
                  ? ` (missing values: ${reviewerCoverage.missingFromAst.join(", ")})`
                  : ""
            }.`
        : reviewerMismatch
          ? describeSemanticDisagreement(
              reviewerAst,
              ast,
              semanticDisagreementWitness,
            )
          : "The independent reviewer AST agrees with the candidate.",
    reasonCodes: reasonCodes.has("REVIEWER_MISMATCH")
      ? ["REVIEWER_MISMATCH"]
      : [],
    stage: "independent_review",
    status:
      !ast || !reviewerAst || !reviewerPreservesSource
        ? "skipped"
        : reasonCodes.has("REVIEWER_MISMATCH")
          ? "failed"
          : "passed",
  };
  stages.push(reviewerStage);

  const evidenceVerification =
    ast && astSource === "provider" && providerEvidence
      ? verifyProviderEvidence(
          ast,
          normalizedText,
          providerEvidence,
          suppliedReviewerAst !== null &&
            reviewerPreservesSource &&
            !reviewerMismatch,
        )
      : null;
  const verifiedProviderEvidence = evidenceVerification?.ok
    ? evidenceVerification.evidence
    : null;
  // A reviewer program with a condition proven true for every value in its
  // finite binder domain erased that condition; it is not an equal reading of
  // the source. Verified source spans and executed examples on the draft carry
  // more evidence, so the malformed review cannot veto that draft or be offered
  // to the player as an alternative interpretation.
  if (
    reviewerMismatch &&
    reviewerAst &&
    astSource === "provider" &&
    verifiedProviderEvidence &&
    hasProvablyVacuousCondition(reviewerAst)
  ) {
    reasonCodes.delete("REVIEWER_MISMATCH");
    reviewerStage.detail =
      "The reviewer reading contained a provably vacuous condition and was discarded; verified provider evidence remains authoritative.";
    reviewerStage.reasonCodes = [];
    reviewerStage.status = "passed";
  }
  // Only a compiled artifact can mis-state the rule. With no AST there is
  // nothing to compare the wording against, and the real cause is already
  // recorded (PROVIDER_MALFORMED_RESPONSE / SCHEMA_INVALID / UNSUPPORTED_RULE) —
  // adding a fidelity code here told the player their numbers were dropped from
  // an artifact that was never built, and sent them rewriting a rule that was
  // never the problem.
  //
  // Each evidence failure gets the code that names it. INTERPRETATION_MISMATCH
  // is reserved for the one cause its player-facing advice actually describes: a
  // value or operation the player wrote that did not survive into the AST (the
  // coverage gate below). An unconsumed source span and a self-contradictory
  // worked example are different faults with different remedies, and telling
  // either one "restate every load-bearing number" is advice the player cannot
  // act on.
  if (ast && astSource === "provider") {
    if (evidenceVerification && !evidenceVerification.ok) {
      reasonCodes.add(
        evidenceVerification.failure === "span_coverage_incomplete"
          ? "PROVIDER_SPAN_COVERAGE_INCOMPLETE"
          : "PROVIDER_EVIDENCE_UNVERIFIED",
      );
    } else if (requireProviderEvidence && verifiedProviderEvidence === null) {
      // Evidence was mandatory and the provider returned none at all.
      reasonCodes.add("PROVIDER_EVIDENCE_UNVERIFIED");
    }
  }
  stages.push({
    detail:
      astSource === "deterministic"
        ? "Skipped for the deterministic compiler path."
        : !ast
          ? "Skipped because no schema-valid provider AST was available."
          : evidenceVerification?.ok
            ? `${evidenceVerification.diagnostic.sourceSpanDetail} Worked-example inputs were checked against the candidate AST.`
            : evidenceVerification
              ? evidenceVerification.failure === "span_coverage_incomplete"
                ? evidenceVerification.diagnostic.sourceSpanDetail
                : evidenceVerification.diagnostic.exampleResults
                    .filter((example) => example.status === "failed")
                    .map(
                      (example) =>
                        `Example ${example.index}: ${example.detail}`,
                    )
                    .join(" ") || "Provider evidence is malformed."
              : requireProviderEvidence
                ? "Provider evidence was required but not returned."
                : "Provider evidence was not requested.",
    reasonCodes: [...reasonCodes].filter(
      (code) =>
        code === "PROVIDER_EVIDENCE_UNVERIFIED" ||
        code === "PROVIDER_SPAN_COVERAGE_INCOMPLETE",
    ),
    stage: "provider_evidence",
    status:
      astSource === "deterministic" ||
      !ast ||
      (!evidenceVerification && !requireProviderEvidence)
        ? "skipped"
        : evidenceVerification?.ok
          ? "passed"
          : "failed",
  });

  const bounds = ast && !forcedFailure ? validateRuntimeBounds(ast) : null;
  const hasSafeRuntimeBounds = bounds?.safe === true;
  if (!hasSafeRuntimeBounds) {
    reasonCodes.add("UNSAFE_RUNTIME_BOUNDS");
  }
  if (bounds && !bounds.withinComplexity) {
    reasonCodes.add("COMPLEXITY_EXCEEDED");
  }
  stages.push({
    detail: !ast
      ? "Skipped because no schema-valid AST was available."
      : hasSafeRuntimeBounds
        ? "Candidate AST stays within runtime safety and complexity bounds."
        : "Candidate AST exceeds runtime safety or complexity bounds.",
    reasonCodes: [...reasonCodes].filter(
      (code) =>
        code === "UNSAFE_RUNTIME_BOUNDS" || code === "COMPLEXITY_EXCEEDED",
    ),
    stage: "runtime_bounds",
    status: !ast ? "skipped" : hasSafeRuntimeBounds ? "passed" : "failed",
  });

  // The frozen AST is what pays the prize; the player only reads prose. Reject
  // when a numeric constraint or a load-bearing operation the player wrote did
  // not survive compilation, so a rule can never be elected under a promise its
  // artifact does not keep.
  //
  // Independent agreement cannot certify either half of coverage. Two models
  // can omit the same literal or the same operation and therefore agree on a
  // different rule. That happened when both readings kept a range comparison
  // but dropped two independent thresholds around 50. Agreement is useful only
  // after each reading has independently preserved the source requirements.
  //
  // The asymmetry is exactly the one `RuleOperation` was defined around: its
  // members are a closed set chosen because none of them can be legitimately
  // simplified away, so an operation the player named that appears in NO
  // candidate AST is always a real drop and never a terse encoding. The sibling
  // agent-statement gate below already blocks on `missingOperations` with no
  // bypass at all; this makes the two gates agree instead of contradicting.
  //
  // NEVER skipped for a deterministic artifact, whatever reviews it. That AST
  // comes from a regex pattern rather than from reading the sentence, so "the
  // pattern matched" is not evidence that the pattern implements the whole
  // sentence — precisely the failure that dropped a rule's second criterion
  // while the pattern reported success. Its reviewer is an additional net, not a
  // replacement for this one.
  const certifiedByIndependentReading =
    astSource === "provider" &&
    reviewerAst !== null &&
    reviewerPreservesSource &&
    !reviewerMismatch;
  let interpretationCoverageFailed = false;
  let interpretationCoverageChecked = false;
  let coverageMissingOperations: readonly RuleOperation[] = [];
  const hasVacuousCondition = ast ? hasProvablyVacuousCondition(ast) : false;
  if (ast && !forcedFailure) {
    const coverage = analyzeInterpretationCoverage({
      ast,
      officialInterpretation: describeRuleAstForPlayers(ast),
      text: request.originalText?.trim() || normalizedText,
    });
    interpretationCoverageChecked =
      coverage.requiredOperations.length > 0 ||
      coverage.requiredValues.length > 0;
    coverageMissingOperations = coverage.missingOperations;
    // A source-complete independent reading may certify an equivalent terse
    // encoding whose AST omits literals implied by the bounded ticket domain.
    // It can never certify its own omission: the reviewer must itself cover the
    // source, agree by behavior, and operations remain unconditional.
    const reviewerCertifiesValues =
      reviewerAst !== null && reviewerPreservesSource && !reviewerMismatch;
    const blocked =
      coverage.missingOperations.length > 0 ||
      ((coverage.missingFromAst.length > 0 ||
        coverage.missingFromInterpretation.length > 0) &&
        !reviewerCertifiesValues);
    if (blocked) {
      reasonCodes.add("INTERPRETATION_MISMATCH");
      interpretationCoverageFailed = true;
    }
    if (hasVacuousCondition) {
      reasonCodes.add("VACUOUS_CONDITION");
      interpretationCoverageFailed = true;
    }
  }
  stages.push({
    detail: !ast
      ? "Skipped because no schema-valid AST was available."
      : interpretationCoverageFailed
        ? hasVacuousCondition
          ? "The candidate AST contains a condition that is provably true for every value in its finite domain, so it cannot enforce that part of the player's wording."
          : `The candidate AST does not cover every intent-bearing part of the rule text${
              coverageMissingOperations.length > 0
                ? ` (missing operations: ${coverageMissingOperations.join(", ")})`
                : ""
            }.`
        : !interpretationCoverageChecked
          ? "Skipped because the rule text exposed no deterministically checkable value or operation cue."
          : certifiedByIndependentReading
            ? "The candidate AST preserves every required operation; any terse value encoding was certified by a source-complete independent reading."
            : "The candidate AST covers the intent-bearing parts of the rule text.",
    reasonCodes: interpretationCoverageFailed
      ? hasVacuousCondition
        ? ["VACUOUS_CONDITION"]
        : ["INTERPRETATION_MISMATCH"]
      : [],
    stage: "interpretation_coverage",
    status: !ast || !interpretationCoverageChecked
      ? "skipped"
      : interpretationCoverageFailed
        ? "failed"
        : "passed",
  });

  // Gap 1: the dealer's own reading is a promise to the player.
  //
  // On the deterministic path the compiler REPLACES the interpret agent's
  // sentence with the AST-derived description, so the chat can say one thing and
  // the frozen card another with nothing comparing them. The player answered
  // "yes, generate this rule" to the chat sentence, so anything load-bearing in
  // it must survive into the artifact too — not just what the player typed.
  //
  // Deliberately the same one-directional check as above: the artifact may carry
  // more than the sentence spells out, never less.
  const agentStatement = request.agentInterpretation?.trim();
  let agentStatementCoverageFailed = false;
  let agentStatementCoverageChecked = false;
  let agentStatementMissingOperations: readonly RuleOperation[] = [];
  let agentStatementMissingValues: readonly number[] = [];
  if (ast && !forcedFailure && agentStatement) {
    const agentCoverage = analyzeInterpretationCoverage({
      ast,
      officialInterpretation: describeRuleAstForPlayers(ast),
      text: agentStatement,
    });
    agentStatementCoverageChecked =
      agentCoverage.requiredOperations.length > 0 ||
      agentCoverage.requiredValues.length > 0;
    agentStatementMissingOperations = agentCoverage.missingOperations;
    agentStatementMissingValues = agentCoverage.missingFromAst;
    if (
      agentCoverage.missingFromAst.length > 0 ||
      agentCoverage.missingOperations.length > 0
    ) {
      reasonCodes.add("AGENT_STATEMENT_MISMATCH");
      agentStatementCoverageFailed = true;
    }
  }
  stages.push({
    detail: !ast
      ? "Skipped because no schema-valid AST was available."
      : !agentStatement
        ? "Skipped because no agent interpretation was supplied."
        : !agentStatementCoverageChecked
          ? "Skipped because the agent statement exposed no deterministically checkable value or operation cue."
          : agentStatementCoverageFailed
          ? `The candidate AST does not keep every load-bearing claim in the agent interpretation${
              agentStatementMissingOperations.length > 0
                ? ` (missing operations: ${agentStatementMissingOperations.join(", ")})`
                : agentStatementMissingValues.length > 0
                  ? ` (missing values: ${agentStatementMissingValues.join(", ")})`
                  : ""
            }.`
          : "The candidate AST keeps the load-bearing claims in the agent interpretation.",
    reasonCodes: agentStatementCoverageFailed
      ? ["AGENT_STATEMENT_MISMATCH"]
      : [],
    stage: "agent_statement_coverage",
    status:
      !ast || !agentStatement || !agentStatementCoverageChecked
        ? "skipped"
        : agentStatementCoverageFailed
          ? "failed"
          : "passed",
  });

  // Deterministic test harness + bounded Monte-Carlo difficulty (PRD §6.8, §7.8).
  const harness = ast && hasSafeRuntimeBounds ? generateAndRunTests(ast) : null;
  const difficultyClass: RuleDifficultyClass =
    harness?.difficulty.difficultyClass ?? "IMPOSSIBLE";
  const estimatedWinRate = harness?.difficulty.estimatedWinRate ?? 0;
  // Carried beside the rate rather than folded into it: a rate of 0 that the
  // sample could not resolve is not the same fact as a measured 0, and every
  // consumer that shows a win rate to a player has to be able to tell them
  // apart. Defaults describe the no-harness case, where nothing was measured at
  // all and `difficultyMeasured` is already false.
  const estimatedWinRateBelowSampleResolution =
    harness?.difficulty.winRateBelowSampleResolution ?? false;
  const estimatedWinRateUpperBound =
    harness?.difficulty.winRateUpperBound ?? null;

  // Policy: any verifiable rule is allowed, EXCEPT the two classes PRD §6.8
  // rejects outright — a rule that no input can win and a rule every input wins
  // both fail to distinguish winners from losers, so electing one only burns a
  // turn. TOO_EASY stays a label (PRD §6.8 leaves it to game configuration).
  // Only gate on a real measurement: with no harness the rule is already
  // blocked by UNSUPPORTED_RULE / UNSAFE_RUNTIME_BOUNDS.
  if (harness && difficultyClass === "IMPOSSIBLE") {
    reasonCodes.add("DIFFICULTY_IMPOSSIBLE");
  }
  if (harness && difficultyClass === "ALWAYS_TRUE") {
    reasonCodes.add("DIFFICULTY_ALWAYS_TRUE");
  }
  // The harness only blocks otherwise when a runtime safety/determinism/
  // serialization check actually fails.
  if (harness && harness.coverageScore < 1) {
    reasonCodes.add("RUNTIME_TEST_FAILED");
  }
  stages.push({
    detail: !harness
      ? "Skipped because the candidate did not pass schema and runtime-bound checks."
      : `Harness coverage ${harness.coverageScore}; difficulty ${difficultyClass}; estimated win rate ${
          estimatedWinRateBelowSampleResolution
            ? `below ${estimatedWinRateUpperBound} (winnable, but no winner in ${harness.difficulty.samplesRun} samples)`
            : estimatedWinRate
        }.`,
    reasonCodes: [...reasonCodes].filter(
      (code) =>
        code === "DIFFICULTY_IMPOSSIBLE" ||
        code === "DIFFICULTY_ALWAYS_TRUE" ||
        code === "RUNTIME_TEST_FAILED",
    ),
    stage: "runtime_harness",
    status: !harness
      ? "skipped"
      : reasonCodes.has("DIFFICULTY_IMPOSSIBLE") ||
          reasonCodes.has("DIFFICULTY_ALWAYS_TRUE") ||
          reasonCodes.has("RUNTIME_TEST_FAILED")
        ? "failed"
        : "passed",
  });

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
    // Both codes mean the same thing to the score: an independent reading of the
    // rule disagrees with the AST the provider emitted.
    hasReviewerMismatch:
      reasonCodes.has("REVIEWER_MISMATCH") ||
      reasonCodes.has("INTERPRETATION_MISMATCH") ||
      reasonCodes.has("AGENT_STATEMENT_MISMATCH") ||
      reasonCodes.has("PROVIDER_EVIDENCE_UNVERIFIED") ||
      reasonCodes.has("PROVIDER_SPAN_COVERAGE_INCOMPLETE"),
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
  const status = determineAttemptStatus(
    forcedFailure,
    confidenceAction,
    decision,
  );
  stages.push({
    detail:
      decision === "VALID"
        ? "Candidate passed all required validation gates."
        : `Candidate rejected: ${
            [...reasonCodes]
              .filter((code) => code !== "SUPPORTED_RULE")
              .join(", ") || "confidence threshold not met"
          }.`,
    reasonCodes: [...reasonCodes].filter((code) => code !== "SUPPORTED_RULE"),
    stage: "decision",
    status: decision === "VALID" ? "passed" : "failed",
  });

  const constrainedDecodingUsed =
    providerConfig.capabilities.grammar_constrained_decoding === true &&
    providerConfig.capabilities.json_schema_response === true;
  const ruleMode: "predicate" | "ranking" =
    ast && isRankingRule(ast) ? "ranking" : "predicate";

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
          // Derived from the frozen AST, never from model prose about the
          // player's text. Those are two independent readings that can (and did,
          // turn 55) disagree with nobody noticing.
          officialInterpretation: describeRuleAstForPlayers(ast),
          originalText: request.originalText?.trim() || request.prompt,
          promptContractVersion: PROMPT_CONTRACT.version,
          providerPath: [],
          ruleMode,
          schemaVersion: ast.schemaVersion,
          skillVersion: RULE_COMPILER_SKILL_VERSION,
          sourceSpans: verifiedProviderEvidence?.sourceSpans ?? [
            { text: normalizedText },
          ],
          testCoverageScore: harness?.coverageScore ?? 0,
          testHarnessVersion: RULE_TEST_HARNESS_VERSION,
          workedExamples:
            verifiedProviderEvidence?.workedExamples ??
            collectWorkedExamples(ast),
        }
      : null;
  const artifactHash = artifact ? hashJson(artifact) : null;

  return {
    artifact,
    artifactHash,
    ast: forcedFailure ? null : ast,
    astSource,
    capabilityFlags: providerConfig.capabilities,
    confidence,
    confidenceAction,
    decision,
    difficultyClass,
    difficultyMeasured: harness !== null,
    diagnostics: {
      // A valid candidate is frozen in the artifact; retain raw provider output
      // only for rejected attempts, where it is needed to explain the block.
      candidate: decision === "INVALID" ? candidate : null,
      decision,
      providerEvidence: evidenceVerification?.diagnostic ?? null,
      reasonCodes: [...reasonCodes],
      schemaError,
      semanticDisagreementWitness,
      stages,
      status,
    },
    estimatedWinRate,
    estimatedWinRateBelowSampleResolution,
    estimatedWinRateUpperBound,
    evaluatedTestCases,
    generatedTestCases,
    modelIdentity,
    normalizedText,
    priority: providerConfig.priority,
    reasonCodes: [...reasonCodes],
    reviewerAst,
    reviewerAstSource,
    requestShape: providerConfig.request_shape,
    schemaError,
    status,
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
  return validateResolvedAst(
    request,
    timestamp,
    providerConfig,
    ctx,
    rawAst,
    "deterministic",
  );
}

// LLM attempt: AST is emitted by the injected provider (constrained decoding).
async function evaluateProviderAttemptAsync(
  request: RuleCompilationRequest,
  timestamp: string,
  providerConfig: AgentProviderConfig,
  options: RuleCompileArtifactOptions,
  corroboratingProviderAsts: readonly RuleAst[] = [],
  allowProviderCorroboration = false,
): Promise<ProviderEvaluation> {
  const ctx = buildAttemptContext(request, providerConfig);
  let rawAst: unknown = null;
  let providerEvidence: ProviderCompilationEvidence | null = null;
  let reviewerAst: RuleAst | null = null;
  if (!ctx.forcedFailure) {
    if (options.preferDeterministic) {
      const deterministicAst = compileSupportedRule(ctx.normalizedText);
      if (deterministicAst) {
        // The deterministic AST is the one that gets frozen — it is hand-audited
        // and its shape is stable across runs. But "audited pattern" is not the
        // same as "audited READING of this text": a pattern claims a sentence it
        // only partly implements without noticing, which is how a rule's second
        // criterion was dropped in silence. So buy the independent reading here
        // too, exactly as the provider path buys the deterministic one, and fail
        // closed when the two disagree.
        //
        // This is what `preferDeterministic` now means: prefer the deterministic
        // AST as the ARTIFACT, not skip the review. `disableConsensus` is the
        // documented escape hatch that stops buying second opinions, so it turns
        // this off too.
        const reviewerAst = options.disableConsensus
          ? null
          : await requestReviewerAst(request, ctx, providerConfig, options);
        if (!options.disableConsensus && reviewerAst === null) {
          ctx.reasonCodes.add("SECOND_OPINION_UNAVAILABLE");
        }
        const deterministicInterpretation = describeRuleAst(deterministicAst);
        return validateResolvedAst(
          deterministicInterpretation
            ? {
                ...request,
                officialInterpretation: deterministicInterpretation,
              }
            : request,
          timestamp,
          providerConfig,
          ctx,
          deterministicAst,
          "deterministic",
          null,
          false,
          reviewerAst,
        );
      }
    }

    try {
      const providerValue = await options.astProvider({
        normalizedText: ctx.normalizedText,
        prompt: request.prompt,
        providerConfig,
      });
      const unwrapped = unwrapProviderCompilation(providerValue);
      rawAst = unwrapped.rawAst;
      providerEvidence = unwrapped.evidence;

      // Novel rules have no deterministic reference implementation. Ask a
      // separately prompted LLM pass to compile the source from scratch, then
      // compare both programs by behavior. The reviewer never sees the draft,
      // so agreement is evidence about the source meaning rather than prompt
      // anchoring. A missing review fails closed instead of silently accepting
      // one unchecked generation.
      if (
        options.astReviewer &&
        !options.disableConsensus &&
        providerCompilationHasSchemaValidAst(providerValue) &&
        compileSupportedRule(ctx.normalizedText) === null
      ) {
        reviewerAst = await requestProviderReviewerAst(
          request,
          ctx,
          providerConfig,
          options.astReviewer,
        );
        if (reviewerAst === null) {
          ctx.reasonCodes.add("SECOND_OPINION_UNAVAILABLE");
        }
      }

      // Later provider slots are independent source-to-AST passes. When one of
      // them agrees behaviorally with an earlier provider candidate, that prior
      // program is a valid second reading for evidence verification. This lets
      // the server correct unreliable hand-written example arithmetic without
      // weakening consensus or requiring the dedicated reviewer to run again.
      if (
        reviewerAst === null &&
        rawAst !== null &&
        allowProviderCorroboration &&
        // A known deterministic reference remains authoritative. Provider
        // corroboration is only the replacement for a missing reviewer on a
        // genuinely novel composition, never a way to outvote audited logic.
        compileSupportedRule(ctx.normalizedText) === null
      ) {
        const parsedCandidate = ruleAstSchema.safeParse(rawAst);
        const spansAreComplete =
          parsedCandidate.success &&
          providerEvidence !== null &&
          verifySourceSpanCoverage(
            ctx.normalizedText,
            providerEvidence.consumedSpans,
            collectAstValues(parsedCandidate.data),
          ) !== null;
        if (parsedCandidate.success && spansAreComplete) {
          reviewerAst =
            corroboratingProviderAsts.find((candidate) =>
              knownAstSemanticsMatch(candidate, parsedCandidate.data),
            ) ?? null;
        }
      }
    } catch {
      ctx.reasonCodes.add("PROVIDER_MALFORMED_RESPONSE");
      rawAst = null;
    }
  }
  return validateResolvedAst(
    request,
    timestamp,
    providerConfig,
    ctx,
    rawAst,
    "provider",
    providerEvidence,
    options.requireProviderEvidence === true,
    reviewerAst,
  );
}

async function requestProviderReviewerAst(
  request: RuleCompilationRequest,
  ctx: AttemptContext,
  providerConfig: AgentProviderConfig,
  reviewer: RuleAstReviewer,
): Promise<RuleAst | null> {
  try {
    const providerValue = await reviewer({
      normalizedText: ctx.normalizedText,
      prompt: request.prompt,
      providerConfig,
    });
    const { rawAst } = unwrapProviderCompilation(providerValue);
    const parsed = rawAst == null ? null : ruleAstSchema.safeParse(rawAst);
    return parsed?.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/**
 * Asks the provider for its own reading of the text, to review a deterministic
 * compile. Returns null when no usable reading came back.
 *
 * Deliberately quiet about HOW it failed: this AST is never frozen, so a timeout
 * or a malformed response is not a fault of the rule — it only means no second
 * opinion is available, which the caller reports as SECOND_OPINION_UNAVAILABLE.
 * Adding PROVIDER_MALFORMED_RESPONSE here would blame the player's rule for the
 * reviewer's outage.
 */
async function requestReviewerAst(
  request: RuleCompilationRequest,
  ctx: AttemptContext,
  providerConfig: AgentProviderConfig,
  options: RuleCompileArtifactOptions,
): Promise<RuleAst | null> {
  try {
    // When a dedicated source-only reviewer exists, use it to corroborate the
    // deterministic artifact. Asking the generator here needlessly routes a
    // rule that is already compiled back through the provider that may just
    // have failed artifact emission, while leaving the actual reviewer idle.
    const reviewer = options.astReviewer ?? options.astProvider;
    const providerValue = await reviewer({
      normalizedText: ctx.normalizedText,
      prompt: request.prompt,
      providerConfig,
    });
    const { rawAst } = unwrapProviderCompilation(providerValue);
    const parsed = rawAst == null ? null : ruleAstSchema.safeParse(rawAst);
    return parsed?.success ? parsed.data : null;
  } catch {
    return null;
  }
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
    schema_error: attempt.schemaError,
    status: attempt.status,
  }));
}

// The first few Zod issues as `path: message`. Bounded on purpose: a rejected
// AST can produce dozens of union-branch issues, and the audit log is not the
// place to replay all of them — the leading paths are what identify the node the
// model could not express.
const SCHEMA_ERROR_ISSUE_LIMIT = 5;

function summarizeSchemaError(
  parsed: ReturnType<typeof ruleAstSchema.safeParse> | null,
): string | null {
  if (!parsed || parsed.success) {
    return null;
  }
  const issues = parsed.error.issues;
  const shown = issues
    .slice(0, SCHEMA_ERROR_ISSUE_LIMIT)
    .map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
  return issues.length > SCHEMA_ERROR_ISSUE_LIMIT
    ? `${shown}; +${issues.length - SCHEMA_ERROR_ISSUE_LIMIT} more`
    : shown;
}

// Two providers agree when they reach the same verdict AND their ASTs behave
// identically. Comparing serialized ASTs instead (the previous rule) called every
// equivalent-but-differently-shaped compile a disagreement, and — worse — said
// nothing about behaviour, which is the only thing that decides who gets paid.
// Agreement is about the READING, not about how sure each provider was. Also
// comparing `decision`/`confidenceAction` conflated the two: three providers
// compiled "guess contains 1,2,3,4 and the draw contains none of them" to ASTs
// that were behaviourally identical (two of them byte-identical), and the rule
// was still blocked as PROVIDER_DISAGREEMENT purely because one landed on
// ACCEPT and another on ESCALATE. Confidence is already enforced on its own, by
// the thresholds and the escalation ladder; counting it a second time as dissent
// only rejected rules everyone had read the same way. When two ASTs behave
// identically there is nothing to disagree about — the frozen artifact is the
// same rule either way.
function providerOpinionsAgree(
  left: ProviderEvaluation,
  right: ProviderEvaluation,
) {
  if (left.normalizedText !== right.normalizedText) {
    return false;
  }
  if (left.ast === null || right.ast === null) {
    return left.ast === right.ast;
  }
  return astOpinionsAgree(left.ast, right.ast);
}

function astOpinionsAgree(left: RuleAst, right: RuleAst) {
  return knownAstSemanticsMatch(left, right);
}

function hasProviderDisagreement(attempts: ProviderEvaluation[]) {
  // A source-only reviewer is a separate validation role, not a provider
  // attempt. Its veto is recorded as REVIEWER_MISMATCH and arbitrated by later
  // provider candidates. Counting the same event again as
  // PROVIDER_DISAGREEMENT produced that diagnosis even when every actual
  // provider candidate was behaviorally identical (and no provider witness
  // existed).
  const completedAttempts = attempts.filter(isCompletedProviderOpinion);
  if (completedAttempts.length < 2) {
    return false;
  }

  const first = completedAttempts[0];
  if (!first) {
    return false;
  }
  return completedAttempts
    .slice(1)
    .some((attempt) => !providerOpinionsAgree(first, attempt));
}

function hasUnresolvedReviewerMismatch(attempts: ProviderEvaluation[]) {
  for (const [index, attempt] of attempts.entries()) {
    if (
      attempt.ast === null ||
      attempt.reviewerAst === null ||
      !attempt.reasonCodes.includes("REVIEWER_MISMATCH")
    ) {
      continue;
    }
    const generatedAst = attempt.ast;
    const reviewerAst = attempt.reviewerAst;
    const arbiter = attempts
      .slice(index + 1)
      .find(
        (candidate) =>
          candidate.ast !== null &&
          isCompletedProviderOpinion(candidate) &&
          (astOpinionsAgree(candidate.ast, generatedAst) ||
            astOpinionsAgree(candidate.ast, reviewerAst)),
      );
    if (!arbiter) {
      return true;
    }
  }
  return false;
}

function countCompletedOpinions(attempts: ProviderEvaluation[]) {
  return attempts.filter(isCompletedProviderOpinion).length;
}

/**
 * The distinct executable readings behind a disagreement, as player prose.
 *
 * Deduplicated by the SAME behavioural comparison that detected the
 * disagreement, so the list can never contradict it: two attempts that
 * `providerOpinionsAgree` considers one reading collapse to one entry, and the
 * list reaches two entries exactly when the divergence is real. Comparing
 * rendered sentences instead would split one reading into two whenever the
 * describer worded the same AST differently.
 */
function collectDivergentProviderReadings(
  attempts: ProviderEvaluation[],
  sourceText: string,
): string[] {
  const distinct: RuleAst[] = [];
  for (const attempt of attempts.filter(isCompletedProviderOpinion)) {
    // A source-only reviewer has no consumed spans or worked examples. It is a
    // useful veto signal, but one uncorroborated reviewer program is not evidence
    // that the PLAYER'S sentence has a second meaning. Only independently
    // generated compile candidates may become choices shown to the player; a
    // later candidate that agrees with the reviewer can still add that reading.
    const providerReadings =
      attempt.astSource === "provider" ? [attempt.ast] : [];
    for (const ast of providerReadings) {
      if (
        ast !== null &&
        !hasProvablyVacuousCondition(ast) &&
        // A program that omitted a source operation is a compiler defect, not
        // an alternative meaning the player can select. Requiring each choice
        // to cover the source also removes strict-prefix "readings" that only
        // exist because one compiler dropped a compound clause.
        analyzeInterpretationCoverage({
          ast,
          officialInterpretation: describeRuleAstForPlayers(ast),
          text: sourceText,
        }).covered &&
        !distinct.some((existing) => astOpinionsAgree(existing, ast))
      ) {
        distinct.push(ast);
      }
    }
  }
  return distinct.map(describeRuleAstForPlayers);
}

function resolveReviewerDisagreement(attempts: ProviderEvaluation[]) {
  for (const [index, attempt] of attempts.entries()) {
    if (
      attempt.ast === null ||
      attempt.reviewerAst === null ||
      !attempt.reasonCodes.includes("REVIEWER_MISMATCH") ||
      astOpinionsAgree(attempt.ast, attempt.reviewerAst)
    ) {
      continue;
    }
    const generatedAst = attempt.ast;
    const reviewerAst = attempt.reviewerAst;
    const arbiter = attempts
      .slice(index + 1)
      .find(
        (candidate) =>
          candidate.ast !== null &&
          candidate.decision === "VALID" &&
          (astOpinionsAgree(candidate.ast, generatedAst) ||
            astOpinionsAgree(candidate.ast, reviewerAst)),
      );
    if (arbiter) {
      return arbiter;
    }
  }
  return null;
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

  // Corroboration is behavioural, matching how the disagreement was detected.
  // Requiring byte-identical serialized ASTs made the tiebreaker unreachable for
  // any non-trivial rule — two models practically never emit the same JSON shape
  // — so every genuine divergence was a permanent dead end with a message that
  // told the player there was nothing to fix.
  if (
    !providerOpinionsAgree(secondary, tertiary) ||
    tertiary.decision !== "VALID"
  ) {
    return null;
  }

  return tertiary;
}

// A provider that never answered holds no opinion, so it can neither corroborate
// nor contradict. Counting a transport failure as dissent would let an
// unreachable secondary provider reject every rule that needs a second opinion.
//
// A response that failed `ruleAstSchema` is the same kind of non-answer: it
// carries no executable reading. Counting it as dissent compared a null AST
// against a real one in `providerOpinionsAgree`, which can never match — so one
// model failing to emit valid JSON was reported to the player as
// PROVIDER_DISAGREEMENT ("the compilers disagree") instead of the truth ("one
// compiler produced nothing"). The real failure is still recorded via
// SCHEMA_INVALID and the attempt's `schema_error`.
function isCompletedProviderOpinion(attempt: ProviderEvaluation) {
  return (
    attempt.status !== "timeout" &&
    attempt.status !== "malformed_response" &&
    attempt.status !== "schema_validation_failed" &&
    !attempt.reasonCodes.includes("PROVIDER_TIMEOUT") &&
    !attempt.reasonCodes.includes("PROVIDER_MALFORMED_RESPONSE") &&
    !attempt.reasonCodes.includes("SCHEMA_INVALID")
  );
}

function normalizeRuleText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function extractNumberRuns(value: string): number[][] {
  return [
    ...value.matchAll(
      /\b(?:100|[1-9]?\d)(?:[\s,;/|-]+(?:100|[1-9]?\d)){1,5}\b/g,
    ),
  ]
    .map((match) => (match[0].match(/\b(?:100|[1-9]?\d)\b/g) ?? []).map(Number))
    .filter(
      (run) =>
        run.length >= 2 &&
        run.length <= 6 &&
        run.every((number) => number >= 1 && number <= 100),
    );
}

function hasTensProjectionExample(value: string): boolean {
  const runs = extractNumberRuns(value);
  return runs.some((left, leftIndex) =>
    runs
      .slice(leftIndex + 1)
      .some(
        (right) =>
          left.length === right.length &&
          left.some((number, index) => number !== right[index]) &&
          left.every(
            (number, index) =>
              Math.floor(number / 10) === Math.floor((right[index] ?? -1) / 10),
          ),
      ),
  );
}

/**
 * Detects an ordered tens-range rule without confusing Brazilian lottery
 * "dezena" (normally a whole drawn number) with a numeric range. The ambiguous
 * Portuguese term is accepted only when the player's example proves the
 * projection, such as 12/11, 31/30, 24/29 -> 10,30,20.
 */
export function looksLikeOrderedTensRangeRule(value: string): boolean {
  const text = normalizeRuleText(value);
  const hasAllPositions =
    /\b(all(?: six)?|every|each|todas?|todos?|seis)\b/.test(text);
  const hasPositionRelation =
    /\b(same|matching|corresponding)\s+(order|position|positions|slot|slots)\b/.test(
      text,
    ) ||
    /\b(mesma\s+ordem|na\s+mesma\s+ordem|posicoes?\s+correspondentes?)\b/.test(
      text,
    );
  const hasExplicitRange =
    /\b(tens|ten-number|decade)\s+(range|ranges|group|groups|bucket|buckets)\b/.test(
      text,
    ) || /\b(faixas?|grupos?)\s+(?:de|das?)\s+dezenas?\b/.test(text);
  const hasPortugueseExample =
    /\bdezenas?\b/.test(text) && hasTensProjectionExample(text);
  return (
    hasAllPositions &&
    hasPositionRelation &&
    (hasExplicitRange || hasPortugueseExample)
  );
}

function parseOrderedTensRangeRule(text: string): RuleAst | null {
  if (!looksLikeOrderedTensRangeRule(text)) {
    return null;
  }
  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "pairs_forall",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
        where: {
          kind: "compare",
          op: "eq",
          left: {
            kind: "arith",
            op: "div",
            left: { kind: "pair", side: "left" },
            right: { kind: "lit", value: 10 },
          },
          right: {
            kind: "arith",
            op: "div",
            left: { kind: "pair", side: "right" },
            right: { kind: "lit", value: 10 },
          },
        },
      },
    },
  };
}

// "the guess is exactly the set {a, b, c, d, e, f}" — optionally conjoined with
// "at least one drawn number is between X and Y".
//
// A guess always holds six DISTINCT numbers, so requiring it to contain each of
// six distinct values is exactly "the guess is that set, in any order" — no
// array-literal node is needed. Compiling this family deterministically matters
// for two reasons: the family is now electable with a correct artifact, and the
// reviewer gains a reference AST it can hold an LLM answer against (turn 55's
// artifact fails that comparison on the very first structured probe).
const EXACT_SET_CUE =
  /\b(?:are exactly|is exactly|exactly the set|exatamente (?:o conjunto|os numeros)|sao exatamente)\b/u;
const ORDER_IGNORED_CUE =
  /\b(?:ignoring order|order ignored|in any order|regardless of order|any order|ignorando a ordem|em qualquer ordem|qualquer ordem)\b/u;
const ANY_DRAWN_IN_RANGE =
  /\bat least one\b[^.]{0,60}\bdrawn\b[^.]{0,40}\b(?:between|entre)\s+(\d{1,3})\s+(?:and|e)\s+(\d{1,3})\b|\bpelo menos um\b[^.]{0,60}\bsortead\w*\b[^.]{0,40}\b(?:entre)\s+(\d{1,3})\s+e\s+(\d{1,3})\b/u;

function parseExactGuessSetRule(text: string): RuleAst | null {
  if (!EXACT_SET_CUE.test(text) || !ORDER_IGNORED_CUE.test(text)) {
    return null;
  }
  // Read the enumeration between "exactly" and "in any order". Natural lists
  // commonly end with "and 6", which is not a punctuation-separated number run
  // and used to make an otherwise explicit set fall through to the generic
  // match-count parser.
  const setClause = text.match(
    /\b(?:are exactly|is exactly|exactly the set)\b([^.]{0,100}?)\b(?:in any order|regardless of order|ignoring order|order ignored|any order)\b/i,
  )?.[1];
  const values = (setClause?.match(/\b(?:100|[1-9]?\d)\b/g) ?? []).map(Number);
  if (!values || new Set(values).size !== 6) {
    return null;
  }
  if (!values.every((value) => value >= 1 && value <= 100)) {
    return null;
  }

  const clauses: PredicateNodeV3[] = [...values]
    .sort((a, b) => a - b)
    .map((value) => ({
      kind: "contains",
      array: { kind: "source", source: "guess" },
      value: { kind: "lit", value },
    }));

  const range = ANY_DRAWN_IN_RANGE.exec(text);
  if (range) {
    const low = Number(range[1] ?? range[3]);
    const high = Number(range[2] ?? range[4]);
    if (
      Number.isInteger(low) &&
      Number.isInteger(high) &&
      low >= 1 &&
      high <= 100 &&
      low < high
    ) {
      clauses.push({
        kind: "exists",
        of: { kind: "source", source: "draw" },
        where: {
          kind: "and",
          clauses: [
            {
              kind: "compare",
              left: { kind: "elem" },
              op: "gte",
              right: { kind: "lit", value: low },
            },
            {
              kind: "compare",
              left: { kind: "elem" },
              op: "lte",
              right: { kind: "lit", value: high },
            },
          ],
        },
      });
    }
  }

  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: { kind: "and", clauses },
    },
  };
}

function hasPattern(value: string, patterns: readonly RegExp[]) {
  return patterns.some((pattern) => pattern.test(value));
}

// Every value and load-bearing operation the text states explicitly must survive
// into the AST the pattern compiler produced from that same text. The pattern
// compiler is an ordered list of regexes ending in deliberately broad
// fallbacks ("exactly ... order ... match" -> the v1 `ordered_exact` macro), and
// a broad fallback that fires on a rule it does not actually implement produces
// an artifact for a DIFFERENT rule — "a guess wins only if it equals 1 2 3 4 5 6
// in that order and the draw does not" compiled to plain `guess == draw`.
//
// Downstream that mis-compile had two costs, not one: as the primary AST it was
// blocked by the coverage gate (INTERPRETATION_MISMATCH) with no wording the
// player could write to escape it, and as the independent reviewer AST it
// rejected a CORRECT provider compile of the same text (REVIEWER_MISMATCH). A
// pattern match that drops what the player wrote is not a weaker reading of the
// rule, it is a different rule — so treat it as no match at all and let the
// provider path compile the text instead.
function deterministicPatternPreservesText(ast: RuleAst, text: string) {
  const astValues = collectAstValues(ast);
  if (collectRequiredValues(text).some((value) => !astValues.has(value))) {
    return false;
  }
  const astOperations = collectAstOperations(ast);
  if (
    !collectRequiredOperations(text).every((operation) =>
      astOperations.has(operation),
    )
  ) {
    return false;
  }

  // Reuse the final semantic-coverage audit here so every deterministic shortcut
  // is held to the same value/operation contract as a provider result before it
  // can become the preferred artifact. Parsers for compositional families (for
  // example positional comparisons) separately collect every clause instead of
  // allowing a single regex match to stand in for a whole compound sentence.
  const coverage = analyzeInterpretationCoverage({
    ast,
    officialInterpretation: describeRuleAstForPlayers(ast),
    text,
  });
  return (
    coverage.covered &&
    coverage.missingFromAst.length === 0 &&
    coverage.missingOperations.length === 0
  );
}

function compileSupportedRule(text: string): RuleAst | null {
  // Tie settlement is protocol metadata, never the winning expression. Remove
  // it before dispatch so words such as "same total" cannot select the legacy
  // sum-equality parser and become the whole rule. The same stripped source is
  // used by coverage because the AST correctly has no payout node.
  const semanticText = stripProtocolTieBreakClauses(text);
  const ast = compileSupportedRulePattern(semanticText);
  return ast && deterministicPatternPreservesText(ast, semanticText)
    ? ast
    : null;
}

export interface DeterministicRuleCompilerPlan {
  ast: RuleAst;
  interpretation: string;
}

export type DeterministicRuleSemanticComparison =
  | "different"
  | "equivalent"
  | "unknown";

/**
 * Exposes a semantic plan only after the deterministic parser has proved that
 * it preserves every value and operation in the source. The LLM may use this
 * plan to avoid losing structure while it still owns the auditable envelope
 * (source spans and independently-derived examples). Unsupported/new shapes
 * return null and continue through the ordinary LLM + independent-review path.
 */
export function getDeterministicRuleCompilerPlan(
  text: string,
): DeterministicRuleCompilerPlan | null {
  const ast = compileSupportedRule(normalizeRuleText(text));
  if (!ast) {
    return null;
  }
  return {
    ast,
    interpretation: describeRuleAstForPlayers(ast),
  };
}

/**
 * Compares two rule texts only when the bounded deterministic compiler can read
 * both without dropping a stated value or operation.
 *
 * Exact canonical signatures are proof of equivalence. A concrete runtime
 * counterexample is proof of difference. Merely failing to find a counterexample
 * is not proof, so structurally different programs return `unknown` and remain
 * subject to the independent model check.
 */
export function compareDeterministicRuleSemantics(
  leftText: string,
  rightText: string,
): DeterministicRuleSemanticComparison {
  const leftMatch = extractMatchCountSemanticFingerprint(
    normalizeRuleText(leftText),
  );
  const rightMatch = extractMatchCountSemanticFingerprint(
    normalizeRuleText(rightText),
  );
  if (
    leftMatch &&
    rightMatch &&
    matchCountFingerprintsDiffer(leftMatch, rightMatch)
  ) {
    return "different";
  }
  const left = compileSupportedRule(normalizeRuleText(leftText));
  const right = compileSupportedRule(normalizeRuleText(rightText));
  if (!left || !right) {
    return "unknown";
  }

  if (deterministicAstSignature(left) === deterministicAstSignature(right)) {
    return "equivalent";
  }

  return sampledSemanticsMatch(left, right) ? "unknown" : "different";
}

function compileSupportedRulePattern(text: string): RuleAst | null {
  // Direct scalar positions must run before broad ranking/count patterns. A
  // conversational subject such as Portuguese "ganha o jogador que o primeiro
  // numero..." carries comparative words (maior/menor) that broad patterns can
  // claim before this parser sees both positional clauses. Returning that
  // partial reading and rejecting it later prevents the dispatcher from trying
  // the correct parser. This family is syntax-general: any of the six guess
  // positions can compare against any draw position with eq/gt/lt.
  const directPositionComparison = parsePositionComparisonRule(text);
  if (directPositionComparison) {
    return predicateRule(directPositionComparison);
  }

  // Before the single-criterion ranking: "most matches, then closest by
  // position" carries the same primary wording, and the generic ranking would
  // read only that half.
  const matchesThenDistanceRanking =
    parseMatchCountThenPositionDistanceRankingRule(text);
  if (matchesThenDistanceRanking) {
    return matchesThenDistanceRanking;
  }

  const eligibleMatchesThenSumRanking =
    parseEligibleMatchesThenSumRankingRule(text);
  if (eligibleMatchesThenSumRanking) {
    return eligibleMatchesThenSumRanking;
  }

  // "closest total" is objective when both totals are named. A one-sided
  // qualifier changes it from minimum distance to maximum eligible total.
  const closestSumRanking = parseClosestSumRankingRule(text);
  if (closestSumRanking) {
    return closestSumRanking;
  }

  // Comparative "most/fewest matching numbers wins" ranking. Guarded to fire only
  // on genuine ranking intent, so it never steals absolute-threshold or
  // guess-vs-draw predicates handled below.
  const mostMatchesRanking = parseMostMatchesRankingRule(text);
  if (mostMatchesRanking) {
    return mostMatchesRanking;
  }

  const orderedTensRange = parseOrderedTensRangeRule(text);
  if (orderedTensRange) {
    return orderedTensRange;
  }

  const extremeCountMargin = parseExtremeCountMarginRule(text);
  if (extremeCountMargin) {
    return extremeCountMargin;
  }

  const orderedGuessPrefix = parseOrderedGuessPrefixRule(text);
  if (orderedGuessPrefix) {
    return orderedGuessPrefix;
  }

  // Before the generic match-count fallbacks: an enumerated exact set must never
  // be mistaken for "match N of the draw" (the turn-55 failure).
  const exactGuessSet = parseExactGuessSetRule(text);
  if (exactGuessSet) {
    return exactGuessSet;
  }

  const noEvenGuessOverlap = parseNoEvenGuessOverlapRule(text);
  if (noEvenGuessOverlap) {
    return predicateRule(noEvenGuessOverlap);
  }

  const containsAndDrawSum = parseContainsAndDrawSumRule(text);
  if (containsAndDrawSum) {
    return containsAndDrawSum;
  }

  const strictGuessRange = parseStrictGuessRangeRule(text);
  if (strictGuessRange) {
    return strictGuessRange;
  }

  const positionRanges = parsePositionSpecificRangeRule(text);
  if (positionRanges) {
    return positionRanges;
  }

  const drawThreshold = parseDrawAllThresholdRule(text);
  if (drawThreshold) {
    return drawThreshold;
  }

  const guessContainsSet = parseGuessContainsLiteralSetRule(text);
  if (guessContainsSet) {
    return guessContainsSet;
  }

  const guessContains = parseGuessContainsLiteralRule(text);
  if (guessContains) {
    return guessContains;
  }

  // Newly-supported deterministic shapes (prompt-set 24/25/26/27/82/84). Placed
  // first so their specific wording wins over the broader generic fallbacks.
  const removedHighestSum = parseRemovedHighestSumComparisonRule(text);
  if (removedHighestSum) {
    return predicateRule(removedHighestSum);
  }

  const removedLowestMatch = parseRemovedLowestMatchRule(text);
  if (removedLowestMatch) {
    return predicateRule(removedLowestMatch);
  }

  const guardedMappedMatch = parseGuardedMappedMatchRule(text);
  if (guardedMappedMatch) {
    return predicateRule(guardedMappedMatch);
  }

  const withinAnyDistance = parseWithinAnyDistanceCountRule(text);
  if (withinAnyDistance) {
    return predicateRule(withinAnyDistance);
  }

  const sumModuloEquality = parseSumModuloEqualityRule(text);
  if (sumModuloEquality) {
    return predicateRule(sumModuloEquality);
  }

  const orderedParityMatch = parseOrderedParityMatchRule(text);
  if (orderedParityMatch) {
    return predicateRule(orderedParityMatch);
  }

  const slicedSumComparison = parseSlicedSumComparisonRule(text);
  if (slicedSumComparison) {
    return predicateRule(slicedSumComparison);
  }

  const filteredCountComparison = parseFilteredCountComparisonRule(text);
  if (filteredCountComparison) {
    return predicateRule(filteredCountComparison);
  }

  const sumDifferenceThreshold = parseSumDifferenceThresholdRule(text);
  if (sumDifferenceThreshold) {
    return predicateRule(sumDifferenceThreshold);
  }

  const boundedRemovalMatch = parseBoundedRemovalMatchRule(text);
  if (boundedRemovalMatch) {
    return predicateRule(boundedRemovalMatch);
  }

  const exactParityCount = parseExactParityCountRule(text);
  if (exactParityCount) {
    return predicateRule(exactParityCount);
  }

  const reversePositionMatch = parseReversePositionMatchRule(text);
  if (reversePositionMatch) {
    return predicateRule(reversePositionMatch);
  }

  const compoundWithinAndExactPosition =
    parseCompoundWithinAndExactPositionRule(text);
  if (compoundWithinAndExactPosition) {
    return compoundWithinAndExactPosition;
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

  const digitMatchRule = parseDigitMatchCountRule(text);
  if (digitMatchRule) {
    return predicateRule(digitMatchRule);
  }

  const oddSumRule = parseOddSumEqualsRule(text);
  if (oddSumRule) {
    return predicateRule(oddSumRule);
  }

  const orderedPositionCompareCount =
    parseOrderedPositionCompareCountRule(text);
  if (orderedPositionCompareCount) {
    return predicateRule(orderedPositionCompareCount);
  }

  const betweenMinMaxRule = parseAllValuesBetweenMinMaxRule(text);
  if (betweenMinMaxRule) {
    return predicateRule(betweenMinMaxRule);
  }

  const moduloCountComparison = parseModuloCountComparisonRule(text);
  if (moduloCountComparison) {
    return predicateRule(moduloCountComparison);
  }

  const sortedPairSumComparison = parseSortedPairSumComparisonRule(text);
  if (sortedPairSumComparison) {
    return predicateRule(sortedPairSumComparison);
  }

  const casualSortedPairSumComparison =
    parseCasualSortedPairSumComparisonRule(text);
  if (casualSortedPairSumComparison) {
    return predicateRule(casualSortedPairSumComparison);
  }

  const definedDivision = parseDefinedDivisionRule(text);
  if (definedDivision) {
    return predicateRule(definedDivision);
  }

  const evenCountEquality = parseEvenCountEqualityRule(text);
  if (evenCountEquality) {
    return predicateRule(evenCountEquality);
  }

  const compoundMatchAndSumComparison =
    parseCompoundMatchAndSumComparisonRule(text);
  if (compoundMatchAndSumComparison) {
    return predicateRule(compoundMatchAndSumComparison);
  }

  const directSumComparison = parseDirectSumComparisonRule(text);
  if (directSumComparison) {
    return predicateRule(directSumComparison);
  }

  if (
    /\b(guessed?|picked|ticket|your)(?:\s+sum|\s+total)?\b.{0,30}\b(greater|higher|above|more|bigger|larger)\b.{0,60}\b(draw|drawn)(?:\s+sum|\s+total)?\b/i.test(
      text,
    ) &&
    /\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,80}\b(numbers?\s+)?(match|matches|appear|appears|hits?)\b/i.test(
      text,
    )
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

  const exactMatchCount = parseExactMatchCountRule(text);
  if (exactMatchCount !== null) {
    return predicateRule(
      compare(
        count(intersection(source("guess"), source("draw"))),
        "eq",
        lit(exactMatchCount),
      ),
    );
  }

  const matchCount = parseMatchCountRule(text);
  if (matchCount) {
    return {
      schemaVersion: 1,
      node: { kind: "match_count_at_least", value: matchCount },
    };
  }

  if (
    /\bno\b.{0,40}\b(guessed?|picked|ticket|your)\s+numbers?\b.{0,60}\b(appear|appears|match|matches|drawn|in the draw)\b/i.test(
      text,
    ) ||
    // "none of its six numbers appear in the draw". The determiner and the
    // cardinality phrase are both optional: "its"/"their" were missing from the
    // original alternation, and an intervening "six" pushed the sentence into
    // the match-count parser instead. A qualifier between the determiner and
    // "numbers" (e.g. "none of its EVEN numbers") is deliberately not accepted —
    // that is a different rule about a subset, not zero overlap.
    /\b(?:none\s+of|not\s+one\s+of)\s+(?:my|your|the|its|their)?\s*(?:six\s+|6\s+)?(?:guessed?|picked|chosen|ticket)?\s*numbers?\b.{0,60}\b(appear|appears|match|matches|drawn|in the draw)\b/i.test(
      text,
    ) ||
    /\b(ticket|picks?|numbers?)\b.{0,40}\bdodges?\s+the\s+draw\b/i.test(text)
  ) {
    return predicateRule(
      compare(
        count(intersection(source("guess"), source("draw"))),
        "eq",
        lit(0),
      ),
    );
  }

  if (
    /\bevery\b.{0,40}\b(guessed?|picked|ticket|your)\s+numbers?\b.{0,30}\b(lower|less|below|greater|higher|above|sit below|sits below)\b.{0,60}\b(draw|drawn)\b/i.test(
      text,
    ) &&
    /\b(same position|corresponding position|same index|matching position|same slot)\b/i.test(
      text,
    )
  ) {
    const op = /\b(lower|less|below|sit below|sits below)\b/i.test(text)
      ? "lt"
      : "gt";
    return predicateRule({
      kind: "all_ordered_compare",
      left: source("guess"),
      op,
      right: source("draw"),
    });
  }

  if (
    /\b(same set|same numbers?|same six numbers?|contain the same set)\b/i.test(
      text,
    ) &&
    /\b(regardless of order|any order|unordered|order does not matter|different order)\b/i.test(
      text,
    )
  ) {
    return predicateRule(
      compare(
        count(intersection(source("guess"), source("draw"))),
        "eq",
        lit(6),
      ),
    );
  }

  if (
    /\b(number|count|amount)\b.{0,40}\beven\b.{0,80}\b(equal|equals|same|match|matches|amount)\b.{0,80}\beven\b/i.test(
      text,
    ) ||
    /\bsame\s+amount\s+of\s+even\s+numbers?\b/i.test(text)
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
    /\b(guess|guessed|submitted|your numbers|your|my six numbers|ticket|picks?)\b/.test(
      text,
    )
  ) {
    // "less than or equal" contains the word "equal" but is a boundary, not
    // equality. Never erase that condition into the legacy sum-equals macro.
    if (
      /\b(?:less|greater)\s+than\s+or\s+equal|\bat\s+(?:most|least)\b|\bwithout\s+exceeding\b|\bsem\s+ultrapassar\b|\bmenor\s+ou\s+igual\b/i.test(
        text,
      )
    ) {
      return null;
    }
    return { schemaVersion: 1, node: { kind: "sum_equals" } };
  }

  if (
    /\b(same-total|same total)\b/i.test(text) &&
    /\b(draw|drawn)\b/i.test(text) &&
    /\b(my|your|ticket|numbers?|picks?)\b/i.test(text)
  ) {
    return { schemaVersion: 1, node: { kind: "sum_equals" } };
  }

  // `ordered_exact` is "the guess equals the DRAW, position by position". Both
  // sides have to be named: without the draw requirement this fallback also
  // swallowed rules that compare the guess against numbers the player listed
  // ("exactly 1 2 3 4 5 6 in that order"), freezing an unrelated condition.
  if (
    /\b(exact|exactly)\b/.test(text) &&
    /\b(order|ordered|sequence|position|same positions?)\b/.test(text) &&
    /\b(match|matches|same)\b/.test(text) &&
    /\b(draw|drawn)\b/.test(text) &&
    /\b(guess|guessed|picked|picks?|ticket|your|my)\b/.test(text)
  ) {
    return { schemaVersion: 1, node: { kind: "ordered_exact" } };
  }

  return null;
}

const SMALL_COUNT_VALUE = new Map<string, number>([
  ["one", 1],
  ["um", 1],
  ["uma", 1],
  ["two", 2],
  ["dois", 2],
  ["duas", 2],
  ["three", 3],
  ["tres", 3],
  ["four", 4],
  ["quatro", 4],
  ["five", 5],
  ["cinco", 5],
]);

function readSmallCount(value: string | undefined) {
  if (!value) {
    return null;
  }
  const numeric = Number(value);
  return Number.isInteger(numeric)
    ? numeric
    : (SMALL_COUNT_VALUE.get(value) ?? null);
}

/**
 * Compile a literal ordered prefix while leaving the other ticket positions
 * unconstrained. The distinction matters: `[1,2,3,4,90,91]` wins, while a
 * full six-number literal sequence and an unordered literal set are different
 * rules. Both the prefix and the explicitly free remainder must be present so
 * an incomplete ticket is never silently accepted.
 */
function parseOrderedGuessPrefixRule(text: string): RuleAst | null {
  const remainder =
    text.match(
      /\b(?:the\s+)?(?:remaining|final|last|other)\s+(one|two|three|four|five|[1-5])\b[^.]{0,90}\b(?:ignored|unconstrained|irrelevant|may be any|can be any|do not matter|does not matter)\b/i,
    ) ??
    text.match(
      /\b(?:os\s+|as\s+)?(?:demais|restantes|ultimos?)\s+(um|uma|dois|duas|tres|quatro|cinco|[1-5])\b[^.]{0,90}\b(?:ignorad[oa]s?|livres?|qualquer(?:es)?|nao importam?)\b/i,
    ) ??
    text.match(
      /\b(?:ignoring|ignore|ignorando|ignorar)\s+(?:the\s+|os\s+|as\s+)?(?:remaining|final|last|other|demais|restantes|ultimos?)\s+(one|two|three|four|five|um|uma|dois|duas|tres|quatro|cinco|[1-5])\b/i,
    );
  const remainingCount = readSmallCount(remainder?.[1]);
  if (!remainder || !remainingCount || remainder.index === undefined) {
    return null;
  }

  const prefix = text.match(
    /\b(?:the\s+)?(?:first|primeir[oa]s?)\s+(one|two|three|four|five|um|uma|dois|duas|tres|quatro|cinco|[1-5])\s+(?:(?:guessed?|played|picked|ticket|palpite|jogad[oa]s?)\s+)?(?:numbers?|numeros?)\b/i,
  );
  const sequence = text.match(
    /\b(?:(?:played|guessed|picked)\s+sequence|sequence\s+(?:played|guessed|picked)|sequencia\s+jogada)\b/i,
  );
  const cue = prefix ?? sequence;
  if (!cue || cue.index === undefined || cue.index >= remainder.index) {
    return null;
  }

  const literalSpan = text.slice(cue.index + cue[0].length, remainder.index);
  const values = (literalSpan.match(/\b(?:100|[1-9]?\d)\b/g) ?? []).map(Number);
  const statedPrefixCount = prefix ? readSmallCount(prefix[1]) : values.length;
  if (
    !statedPrefixCount ||
    statedPrefixCount < 1 ||
    statedPrefixCount > 5 ||
    statedPrefixCount + remainingCount !== 6 ||
    values.length !== statedPrefixCount ||
    new Set(values).size !== values.length ||
    values.some((value) => value < 1 || value > 100)
  ) {
    return null;
  }

  const orderIsExplicit =
    Boolean(sequence) ||
    /\b(?:in\s+(?:(?:that|this|the|same)\s+)?order|ordered|nessa ordem|na ordem|em ordem)\b/i.test(
      literalSpan,
    );
  if (!orderIsExplicit) {
    return null;
  }

  const clauses: PredicateNodeV3[] = values.map((value, index) => ({
    kind: "compare",
    left: { kind: "at", index, of: { kind: "source", source: "guess" } },
    op: "eq",
    right: { kind: "lit", value },
  }));

  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: clauses.length === 1 ? clauses[0]! : { kind: "and", clauses },
    },
  };
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

function arith(
  op: "add" | "sub" | "mul" | "div" | "mod",
  left: ScalarExpr,
  right: ScalarExpr,
): ScalarExpr {
  return { kind: "arith", left, op, right };
}

function intersection(left: ArrayExpr, right: ArrayExpr): ArrayExpr {
  return { kind: "intersection", left, right };
}

function difference(left: ArrayExpr, right: ArrayExpr): ArrayExpr {
  return { kind: "difference", left, right };
}

function sortArray(of: ArrayExpr, order: "asc" | "desc"): ArrayExpr {
  return { kind: "sort", of, order };
}

function sliceArray(of: ArrayExpr, start: number, end?: number): ArrayExpr {
  return { kind: "slice", of, start, ...(end === undefined ? {} : { end }) };
}

function filterMod(of: ArrayExpr, modulus: number, equals: number): ArrayExpr {
  return { kind: "filter_mod", equals, modulus, of };
}

function filterCompare(of: ArrayExpr, op: CompareOp, value: number): ArrayExpr {
  return { kind: "filter_compare", of, op, value };
}

function mapArith(
  of: ArrayExpr,
  op: "add" | "sub" | "mul" | "div" | "mod",
  operand: number,
): ArrayExpr {
  return { kind: "map_arithmetic", of, op, operand };
}

function mapWithGuard(
  of: ArrayExpr,
  op: "add" | "sub" | "mul" | "div" | "mod",
  operand: number,
  min: number,
  max: number,
  onGuardFail: "drop" | "keep_original",
): ArrayExpr {
  return {
    kind: "map_with_guard",
    guard: { kind: "range_inclusive", min, max },
    of,
    onGuardFail,
    op,
    operand,
  };
}

function removeUpToN(
  of: ArrayExpr,
  n: number,
  strategy: "first" | "highest" | "lowest",
): ArrayExpr {
  return { kind: "remove_up_to_n", n, of, strategy };
}

function allEqualOrdered(left: ArrayExpr, right: ArrayExpr): PredicateNode {
  return { kind: "all_equal_ordered", left, right };
}

function countAtLeast(of: ArrayExpr, value: number): PredicateNode {
  return { kind: "count_at_least", of, value };
}

function parseWordOrDigit(value: string): number | null {
  const word = value.toLowerCase();
  if (NUMBER_WORDS.has(word)) {
    return NUMBER_WORDS.get(word) ?? null;
  }
  const parsed = Number(word);
  return Number.isInteger(parsed) ? parsed : null;
}

function parseRemovedHighestSumComparisonRule(
  text: string,
): PredicateNode | null {
  if (
    !/\b(ignore|drop|remove)\b[^.]{0,35}\b(highest|largest|biggest)\b[^.]{0,35}\b(picked|pick|guess|guessed|ticket|my)\b/i.test(
      text,
    ) ||
    !/\b(rest|remaining|after that)\b[^.]{0,80}\b(total|sum|add up)\b[^.]{0,80}\b(same|equal|equals|match|matches)\b[^.]{0,80}\b(full\s+)?draw\b/i.test(
      text,
    )
  ) {
    return null;
  }
  return compare(
    sum(removeUpToN(source("guess"), 1, "highest")),
    "eq",
    sum(source("draw")),
  );
}

function parseRemovedLowestMatchRule(text: string): PredicateNode | null {
  const match = text.match(
    /\b(drop|remove)\b\s+up\s+to\s+(one|two|three|four|\d+)\b[^.]{0,45}\b(lowest|smallest)\b[^.]{0,40}\b(picks?|guesses|numbers?)\b[^.]{0,90}\b(still\s+)?(?:have|has)\s+(one|two|three|four|five|six|\d+)\s+(?:numbers?\s+)?(?:in|inside|appear(?:ing)?\s+in)\s+the\s+draw\b/i,
  );
  if (!match) {
    return null;
  }
  const removeCount = parseWordOrDigit(match[2] ?? "");
  const threshold = parseWordOrDigit(match[6] ?? "");
  if (
    removeCount === null ||
    threshold === null ||
    removeCount < 1 ||
    removeCount > 4 ||
    threshold < 1 ||
    threshold > 6
  ) {
    return null;
  }
  return countAtLeast(
    intersection(
      removeUpToN(source("guess"), removeCount, "lowest"),
      source("draw"),
    ),
    threshold,
  );
}

function parseGuardedMappedMatchRule(text: string): PredicateNode | null {
  const match = text.match(
    /\b(doubling|double)\b[^.]{0,35}\b(each|every)\b[^.]{0,25}\b(pick|picked|guess|guessed|ticket)\b[^.]{0,60}\b(within|between|stays within)\b[^.]{0,20}\b(1)\s+(?:to|and|-)\s+(100)\b[^.]{0,100}\bat least\s+(one|two|three|four|five|six|\d+)\b[^.]{0,45}\b(doubled|double)\b[^.]{0,35}\b(values?|numbers?)\b[^.]{0,35}\b(draw|drawn)\b/i,
  );
  if (!match) {
    return null;
  }
  const threshold = parseWordOrDigit(match[7] ?? "");
  if (threshold === null || threshold < 1 || threshold > 6) {
    return null;
  }
  return countAtLeast(
    intersection(
      mapWithGuard(source("guess"), "mul", 2, 1, 100, "drop"),
      source("draw"),
    ),
    threshold,
  );
}

function parseWithinAnyDistanceCountRule(text: string): PredicateNode | null {
  const match = text.match(
    /\b(?:near-hit\s+rule|near\s+hit\s+rule|win)\b[^.]{0,80}\b(one|two|three|four|five|six|\d+)\s+(?:picks?|guessed?\s+numbers?|ticket\s+numbers?)\b[^.]{0,50}\b(within|off by)\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b[^.]{0,50}\b(at least\s+one|any|one)\s+(drawn?|draw)\s+number\b/i,
  );
  if (!match) {
    return null;
  }
  const threshold = parseWordOrDigit(match[1] ?? "");
  const distance = parseWordOrDigit(match[3] ?? "");
  if (
    threshold === null ||
    distance === null ||
    threshold < 1 ||
    threshold > 6 ||
    distance < 0 ||
    distance > 100
  ) {
    return null;
  }
  return {
    kind: "value_within_any_count_at_least",
    distance,
    left: source("guess"),
    right: source("draw"),
    value: threshold,
  };
}

function parseSumModuloEqualityRule(text: string): PredicateNode | null {
  const directMatch = text.match(
    /\b(?:its|the\s+(?:guess|ticket)|your)\s+(?:number\s+)?(?:sum|total)\s+(?:modulo|mod)\s+(\d+)\b[^.]{0,35}\b(?:equal|equals|matches)\b[^.]{0,35}\b(?:the\s+)?(?:official\s+draw'?s|draw'?s|drawn?)\s+(?:number\s+)?(?:sum|total)\s+(?:modulo|mod)\s+(\d+)\b/i,
  );
  if (directMatch?.[1] && directMatch[2]) {
    const leftMod = Number(directMatch[1]);
    const rightMod = Number(directMatch[2]);
    if (
      Number.isInteger(leftMod) &&
      leftMod === rightMod &&
      leftMod >= 1 &&
      leftMod <= 100
    ) {
      return compare(
        arith("mod", sum(source("guess")), lit(leftMod)),
        "eq",
        arith("mod", sum(source("draw")), lit(rightMod)),
      );
    }
  }
  const match = text.match(
    /\b(?:last\s+digit\s+of\s+the\s+totals?|sum\s+modulo)\b[^.]{0,120}\b(ticket|guess|guessed|picked|my)\b[^.]{0,35}\b(sum|total)\b[^.]{0,20}\b(?:modulo|mod)\s+(\d+)\b[^.]{0,35}\b(equal|equals|same|matches?)\b[^.]{0,60}\b(draw|drawn)\b[^.]{0,35}\b(sum|total)\b[^.]{0,20}\b(?:modulo|mod)\s+(\d+)\b/i,
  );
  if (!match) {
    return null;
  }
  const leftMod = Number(match[3]);
  const rightMod = Number(match[7]);
  if (
    !Number.isInteger(leftMod) ||
    !Number.isInteger(rightMod) ||
    leftMod !== rightMod ||
    leftMod < 1 ||
    leftMod > 100
  ) {
    return null;
  }
  return compare(
    arith("mod", sum(source("guess")), lit(leftMod)),
    "eq",
    arith("mod", sum(source("draw")), lit(rightMod)),
  );
}

/**
 * Compile comparisons between two dynamically-filtered guess counts, where the
 * thresholds are the draw's extrema. This needs v3 element binders; v2's
 * filter_compare can only compare against a literal.
 */
function parseExtremeCountMarginRule(text: string): RuleAst | null {
  const relation = text.match(
    /\bcount\b[^.;]{0,40}\b(?:its|the guess(?:'s)?|guessed|ticket(?:'s)?)\b[^.;]{0,40}\bnumbers?\b[^.;]{0,20}\babove\b[^.;]{0,25}\bhighest\b[^.;]{0,20}\b(?:drawn?|draw)\b[^.;]{0,80}\b(?:exceeds?|is (?:greater|higher) than)\b[^.;]{0,60}\bcount\b[^.;]{0,40}\b(?:its|the guess(?:'s)?|guessed|ticket(?:'s)?)\b[^.;]{0,40}\bnumbers?\b[^.;]{0,20}\bbelow\b[^.;]{0,25}\blowest\b[^.;]{0,20}\b(?:drawn?|draw)\b[^.;]{0,45}\bby at least\s+(\d+|one|two|three|four|five|six)\b/i,
  );
  if (!relation?.[1]) {
    return null;
  }
  const margin =
    NUMBER_WORDS.get(relation[1].toLowerCase()) ?? Number(relation[1]);
  if (!Number.isInteger(margin) || margin < 0 || margin > 6) {
    return null;
  }

  const guess: ArrayExprV3 = { kind: "source", source: "guess" };
  const draw: ArrayExprV3 = { kind: "source", source: "draw" };
  const filteredCount = (
    op: "gt" | "lt",
    threshold: ScalarExprV3,
  ): ScalarExprV3 => ({
    kind: "reduce",
    op: "count",
    of: {
      kind: "filter",
      of: guess,
      where: {
        kind: "compare",
        left: { kind: "elem" },
        op,
        right: threshold,
      },
    },
  });
  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        left: {
          kind: "arith",
          left: filteredCount("gt", { kind: "reduce", op: "max", of: draw }),
          op: "sub",
          right: filteredCount("lt", { kind: "reduce", op: "min", of: draw }),
        },
        op: "gte",
        right: { kind: "lit", value: margin },
      },
    },
  };
}

// #24: "count of guessed numbers below 50 equals the count of drawn numbers
// below 50" -> compare the two filtered counts. Supports below/under (lt) and
// above/over (gt); thresholds must be a valid 1..100 number value.
function parseFilteredCountComparisonRule(text: string): PredicateNode | null {
  const splitMatch = text.match(
    /\b(?:below|under|less than|above|over|greater than)[-\s]+(\d+)\s+split\b[^.]{0,80}\b(ticket|guess|picks?|picked)\b[^.]{0,80}\b(draw|drawn)\b[^.]{0,80}\b(same|equal|equals|matching?)\s+count\b[^.]{0,40}\b(?:below|under|less than|above|over|greater than)[-\s]+\1\b/i,
  );
  const match =
    splitMatch ??
    text.match(
      /\bcount\b[^.]{0,30}\b(guessed?|picked|ticket|your)\b[^.]{0,25}\b(below|under|less than|fewer than|above|over|greater than|more than)\s+(\d+)\b[^.]{0,50}\b(equal|equals|same|matches?|is)\b[^.]{0,50}\b(drawn?|draw)\b[^.]{0,25}\b(below|under|less than|fewer than|above|over|greater than|more than)\s+(\d+)\b/i,
    );
  if (!match) {
    return null;
  }
  const opFor = (word: string): CompareOp =>
    /below|under|less|fewer/i.test(word) ? "lt" : "gt";
  const splitOpWord =
    splitMatch?.[0]?.match(
      /\b(below|under|less than|above|over|greater than)\b/i,
    )?.[1] ?? "";
  const guessValue = splitMatch ? Number(match[1]) : Number(match[3]);
  const drawValue = splitMatch ? Number(match[1]) : Number(match[7]);
  const guessOpWord = splitMatch ? splitOpWord : (match[2] ?? "");
  const drawOpWord = splitMatch ? splitOpWord : (match[6] ?? "");
  if (
    !Number.isInteger(guessValue) ||
    !Number.isInteger(drawValue) ||
    guessValue < 1 ||
    guessValue > 100 ||
    drawValue < 1 ||
    drawValue > 100
  ) {
    return null;
  }
  return compare(
    count(filterCompare(source("guess"), opFor(guessOpWord), guessValue)),
    "eq",
    count(filterCompare(source("draw"), opFor(drawOpWord), drawValue)),
  );
}

// #25/#26: "the first/last three guessed numbers sum to the first/last three
// drawn numbers" -> compare the sums of the sliced sub-arrays (fixed size 6).
function parseSlicedSumComparisonRule(text: string): PredicateNode | null {
  const explicitMatch = text.match(
    /\b(first|last)\s+(one|two|three|four|five|six|\d+)\b[^.]{0,25}\b(guessed?|picked|ticket|your)\b[^.]{0,40}\b(sum|add up|total)\b[^.]{0,40}\b(first|last)\s+(one|two|three|four|five|six|\d+)\b[^.]{0,25}\b(drawn?|draw)\b/i,
  );
  const casualMatch =
    explicitMatch ??
    text.match(
      /\b(first|last)\s+(one|two|three|four|five|six|\d+)\s+(?:picks?|guesses|ticket\s+numbers?)\b[^.]{0,45}\b(add up|sum|total)\b[^.]{0,60}\b(first|last)\s+(one|two|three|four|five|six|\d+)\s+(?:drawn?|draw)\s+numbers?\b/i,
    );
  if (!casualMatch) {
    return null;
  }
  const side = (casualMatch[1] ?? "").toLowerCase();
  const otherSide = (
    explicitMatch ? (casualMatch[5] ?? "") : (casualMatch[4] ?? "")
  ).toLowerCase();
  const n = parseWordOrDigit(casualMatch[2] ?? "");
  const otherN = parseWordOrDigit(
    explicitMatch ? (casualMatch[6] ?? "") : (casualMatch[5] ?? ""),
  );
  if (
    n === null ||
    otherN === null ||
    n !== otherN ||
    n < 1 ||
    n > 6 ||
    side !== otherSide
  ) {
    return null;
  }
  const sliceFor = (name: "draw" | "guess"): ArrayExpr =>
    side === "first"
      ? sliceArray(source(name), 0, n)
      : sliceArray(source(name), 6 - n);
  return compare(sum(sliceFor("guess")), "eq", sum(sliceFor("draw")));
}

// Difference between totals. Both surface orders are supported:
// - "guessed sum is greater than the drawn sum by at least 20"
// - "guessed sum is at least 10 lower than the drawn sum"
//
// The second form is where sign inversions are especially easy to miss. Keep a
// single canonical orientation (`guessSum - drawSum`) and negate the threshold
// for "lower": at least 10 lower is <= -10, never <= +10.
function parseSumDifferenceThresholdRule(text: string): PredicateNode | null {
  const differenceAfterComparison = text.match(
    /\b(guessed?|picked|ticket|your)\s+sum\b[^.]{0,30}\b(greater|higher|above|more|exceeds?|larger|bigger)\b[^.]{0,30}\b(drawn?|draw)\s+sum\b[^.]{0,20}\bby\s+(at least|more than|over|exactly)\s+(\d+)\b/i,
  );
  if (differenceAfterComparison) {
    const value = Number(differenceAfterComparison[5]);
    if (!Number.isInteger(value) || value < 0 || value > 600) {
      return null;
    }
    const kind = (differenceAfterComparison[4] ?? "").toLowerCase();
    const op: CompareOp =
      kind === "exactly" ? "eq" : kind === "at least" ? "gte" : "gt";
    return compare(
      arith("sub", sum(source("guess")), sum(source("draw"))),
      op,
      lit(value),
    );
  }

  const relativeDifference = text.match(
    /\b(?:the\s+)?(?:(?:sum|total)\s+of\s+(?:(?:the\s+)?(?:guessed?|picked|ticket|your)|its)\s+numbers?|(?:guessed?|picked|ticket|your|its)\s+(?:sum|total))\b[^.]{0,30}\b(?:is\s+)?(at least|more than|over|exactly)\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\s+(lower|less|below|higher|greater|above|more)\s+than\b[^.]{0,35}\b(?:the\s+)?(?:(?:sum|total)\s+of\s+(?:the\s+)?(?:drawn?|draw)\s+numbers?|(?:official\s+)?(?:drawn?|draw)\s+(?:sum|total))\b/i,
  );
  if (!relativeDifference) {
    return null;
  }
  const value = parseWordOrDigit(relativeDifference[2] ?? "");
  if (value === null || value < 0 || value > 600) {
    return null;
  }
  const kind = (relativeDifference[1] ?? "").toLowerCase();
  const direction = (relativeDifference[3] ?? "").toLowerCase();
  const lower = /lower|less|below/i.test(direction);
  const op: CompareOp =
    kind === "exactly"
      ? "eq"
      : kind === "at least"
        ? lower
          ? "lte"
          : "gte"
        : lower
          ? "lt"
          : "gt";
  return compare(
    arith("sub", sum(source("guess")), sum(source("draw"))),
    op,
    lit(lower ? -value : value),
  );
}

// #27: "every guessed number has the same parity as the drawn number in the same
// position" -> compare the position-wise parity arrays (value mod 2) for exact
// ordered equality.
function parseOrderedParityMatchRule(text: string): PredicateNode | null {
  if (
    !(
      /\bevery\s+(guessed?|picked)\s+number\b[^.]{0,40}\bsame\s+parity\b[^.]{0,60}\b(drawn?|draw)\b[^.]{0,40}\b(same position|corresponding position|same index)\b/i.test(
        text,
      ) ||
      /\bposition\s+by\s+position\b[^.]{0,80}\beach\s+(pick|picked|guess|guessed)\b[^.]{0,60}\bsame\s+(odd-or-even|odd\s+or\s+even|parity)\s+type\b[^.]{0,60}\b(drawn?|draw)\s+number\b/i.test(
        text,
      )
    )
  ) {
    return null;
  }
  return allEqualOrdered(
    mapArith(source("guess"), "mod", 2),
    mapArith(source("draw"), "mod", 2),
  );
}

// #84: "remove up to 2 guessed numbers with the largest absolute difference from
// any drawn number, then win if 3 remaining guessed numbers appear in the draw".
// The removed numbers are the ones FARTHEST from the draw (distance > 0), which
// are by definition not in the draw, so removal never changes how many guessed
// numbers appear in the draw -> this is exactly "at least M appear in the draw".
function parseBoundedRemovalMatchRule(text: string): PredicateNode | null {
  const match = text.match(
    /\bremove\s+up\s+to\s+\d+\b[^.]{0,60}\blargest\s+absolute\s+difference\b[^.]{0,50}\b(drawn?|draw)\b[^.]{0,70}\b(one|two|three|four|five|six|\d+)\s+remaining\b[^.]{0,45}\b(appear|appears|in the draw|in the drawn)\b/i,
  );
  if (!match) {
    return null;
  }
  const value = parseWordOrDigit(match[2] ?? "");
  if (value === null || value < 1 || value > 6) {
    return null;
  }
  return countAtLeast(intersection(source("guess"), source("draw")), value);
}

// Impossible-by-construction rules (prompt-set 64/65). A guessed/drawn NUMBER
// value can only be 1..100, and no integer is both even and odd. These can never
// hold, so they are rejected before payment rather than compiled into a rule
// that always loses. Exported so the API preflight blocks them before the LLM.
const INVALID_CONSTRAINT_PATTERNS = [
  /\b(both\s+even\s+and\s+odd|even\s+and\s+odd\s+at\s+the\s+same\s+time|odd\s+and\s+even\s+at\s+the\s+same\s+time)\b/i,
] as const;

export function hasInvalidConstraint(text: string): boolean {
  const normalized = normalizeRuleText(text);
  if (hasPattern(normalized, INVALID_CONSTRAINT_PATTERNS)) {
    return true;
  }
  // A single guessed/drawn number compared/equated to a value outside 1..100.
  const outOfRange = normalized.matchAll(
    /\b(?:any|a|each|every|some|the)?\s*(?:guessed?|picked|drawn?|draw|ticket)?\s*number\b[^.]{0,20}\b(?:is|are|be|equals?|equal to|=|hits?|reaches?)\s+(\d{1,4})\b/gi,
  );
  for (const m of outOfRange) {
    const value = Number(m[1]);
    if (Number.isInteger(value) && (value < 1 || value > 100)) {
      return true;
    }
  }
  return false;
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

function rankingRule(direction: "max" | "min", score: ScalarExpr): RuleAst {
  return {
    schemaVersion: 2,
    result: { direction, score, tieBreak: "share_pool", type: "ranking" },
  };
}

// A fallback / tiebreak marker: the wording that introduces a SECOND criterion,
// applied only when the first one does not settle the round. Recognized in both
// languages the compiler accepts — a marker missed in one language is a clause
// dropped out of a frozen rule.
const SECONDARY_CRITERION_MARKER =
  /\b(?:otherwise|tie[\s-]?break(?:er|ers)?|in case of a tie|failing that|if (?:nobody|no ?one|none|neither|there is no|there's no|no guess|no player)|when (?:nobody|no ?one)|senao|se nao houver|se nao tiver|caso nao haja|caso ninguem|se ninguem|quando ninguem|em caso de empate|no caso de empate|havendo empate|empatar|empate|desempate|desempatar)\b/i;

/**
 * Compile the complete two-level ranking used by test-set 5 N3. Multiplying the
 * primary match count by 586 makes the score lexicographic: a valid six-number
 * ticket can sum to at most 585, so one additional match always outranks every
 * possible sum advantage. Eligibility stays separate so an all-ineligible pool
 * correctly produces no winner.
 */
function parseEligibleMatchesThenSumRankingRule(text: string): RuleAst | null {
  const namesEligibility =
    /\b(?:tickets?|guesses?|picks?)\b[^.;]{0,80}\b(?:add up|sum|total)\b[^.;]{0,50}\b(?:no more than|not more than|at most|does(?:n'?t| not) exceed)\b[^.;]{0,40}\b(?:drawn?|draw)\b[^.;]{0,20}\b(?:sum|total)\b/i.test(
      text,
    );
  const namesPrimary =
    /\bmost\b[^.;]{0,50}\b(?:numbers?|matches?|hits?)\b[^.;]{0,40}\b(?:match(?:ing|es|ed)?|appear(?:ing|s|ed)?)\b[^.;]{0,30}\b(?:drawn?|draw)\b/i.test(
      text,
    ) || /\bmost\b[^.;]{0,40}\b(?:match(?:es|ing)?|hits?)\b/i.test(text);
  const namesSumTieBreak =
    /\b(?:if|when)\b[^.;]{0,60}\b(?:tie|same (?:amount|number|count))\b[^.;]{0,80}\b(?:larger|higher|greater)\b[^.;]{0,20}\b(?:sum|total)\b[^.;]{0,20}\b(?:wins?|winner)\b/i.test(
      text,
    );
  if (!namesEligibility || !namesPrimary || !namesSumTieBreak) {
    return null;
  }

  const guess = { kind: "source", source: "guess" } as const;
  const draw = { kind: "source", source: "draw" } as const;
  const guessSum: ScalarExprV3 = { kind: "reduce", op: "sum", of: guess };
  const drawSum: ScalarExprV3 = { kind: "reduce", op: "sum", of: draw };
  const matchCount: ScalarExprV3 = {
    kind: "reduce",
    op: "count",
    of: { kind: "intersection", left: guess, right: draw },
  };
  return {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      eligibleWhen: {
        kind: "compare",
        left: guessSum,
        op: "lte",
        right: drawSum,
      },
      score: {
        kind: "arith",
        left: {
          kind: "arith",
          left: { kind: "lit", value: 586 },
          op: "mul",
          right: matchCount,
        },
        op: "add",
        right: guessSum,
      },
    },
  };
}

// The single most common ranking a player asks for: "whoever matches the most
// (or fewest) drawn numbers wins". The deterministic predicate compiler has no
// ranking branch, so every phrasing of it — including the app's own suggested
// example and telegraphic inputs like "win who guess more number" — used to fall
// through to the LLM and, with a small local model, dead-end as UNSUPPORTED /
// needs-clarification. This compiles the canonical match-count ranking
// deterministically and tolerantly, scoring each guess by how many of its numbers
// appear in the official draw (the same guess-vs-draw sandbox as every rule); the
// runtime then ranks those independent scores. Fires ONLY for comparative intent,
// never for absolute thresholds or guess-vs-draw comparisons (those are
// predicates, handled elsewhere).
function parseMostMatchesRankingRule(text: string): RuleAst | null {
  // Absolute thresholds ("at least 4", "four or more", "exactly 3") are per-guess
  // predicates, not a comparison between players — keep them out of ranking.
  if (
    new RegExp(
      `\\b(?:at least|at most|no more than|no fewer than|exactly|only|pelo menos|ao menos|no minimo|minimo de|exatamente|apenas|somente)\\b|\\bso\\s+${MATCH_COUNT_NUMBER_1_TO_6}\\b`,
      "i",
    ).test(text) ||
    new RegExp(
      `\\b(?:\\d+|one|two|three|four|five|six|seven|eight|nine|ten|um|uma|hum|dois|duas|tres|quatro|cinco|seis)\\s+(?:or more|ou mais)\\b`,
      "i",
    ).test(text)
  ) {
    return null;
  }

  // "more ... than the draw" is a guess-vs-draw predicate (e.g. "more multiples
  // of 5 than the drawn numbers"), never a ranking among players. Reject any
  // comparative whose reference point is the draw itself.
  if (/\bthan\b[^.]{0,40}\b(draw|drawn)\b/i.test(text)) {
    return null;
  }

  // A score qualified by a more specific quantity (digits, sums, parity,
  // positions, multiples, ...) is NOT plain whole-number match counting — the
  // generic count ranking would misread it. Leave those to the full compiler /
  // LLM path so they compile to their real score (e.g. a units-digit ranking).
  //
  // The Portuguese forms are NOT decoration. Every trigger below accepts PT
  // ("mais", "acertar", "ganha", "vence"), so an English-only guard made this
  // pattern strictly more permissive in Portuguese than in English: it claimed
  // "vence o palpite que mais acertar numeros, ... menor diferenca ... nas
  // posicoes correspondentes" and froze the bare match count, dropping the
  // position criterion the player wrote. Guard vocabulary must cover exactly the
  // languages the trigger vocabulary covers.
  if (
    /\b(digits?|units?|tens?|sums?|totals?|even|odd|parity|multiples?|positions?|reversed?|slots?|places?|differences?)\b/i.test(
      text,
    ) ||
    /\b(digitos?|dezenas?|unidades?|somas?|soma|somam|totais?|total|pares?|impares?|paridade|multiplos?|posicoes?|posicao|invertid[oa]s?|inversa|casas?|lugares?|diferencas?|diferenca)\b/i.test(
      text,
    )
  ) {
    return null;
  }

  // A rule with a SECOND, ordered criterion ("... and if that cannot decide it,
  // ...") is not this single-criterion ranking. The specialized composite
  // patterns run earlier in the dispatch, so anything still carrying a fallback
  // marker here is a shape no deterministic pattern implements: refuse it and
  // let the LLM path read the whole sentence, rather than freezing the primary
  // criterion alone and discarding the rest of what the player asked for.
  //
  // "... and if they tie, they split the pool" is NOT such a clause: it restates
  // `tieBreak: "share_pool"`, which this ranking already does. Strip those
  // restatements first, so spelling out the default does not push a plain rule
  // off the deterministic path. A real second criterion never carries a
  // share/split verb, so only restatements are removed.
  const fallbackProbe = text.replace(
    /\b(?:in case of a tie|if (?:there is|there's) a tie|if (?:they )?tie|tie[\s-]?break(?:er)?|em caso de empate|no caso de empate|havendo empate|em empate|se empatar)\b[^.;]{0,60}\b(?:share|shares|shared|sharing|split|splits|divide|divides|divided|dividem|divide[mo]?|dividid[ao]|compartilham|rateio)\b/gi,
    " ",
  );
  if (SECONDARY_CRITERION_MARKER.test(fallbackProbe)) {
    return null;
  }

  // Direction: "fewest / least / menos" minimize; "most / more / mais" maximize.
  const minimize = /\b(fewest|least|smallest\s+number\s+of|menos)\b/i.test(
    text,
  );
  const maximize =
    /\b(most|more|mais|greatest\s+number\s+of|largest\s+number\s+of)\b/i.test(
      text,
    );
  if (!minimize && !maximize) {
    return null;
  }

  // The score must be about MATCHING drawn numbers (count of the guess's numbers
  // that appear in the draw), expressed as a comparative over "numbers/matches/
  // hits/acertos". Guessing a number IS matching a drawn number in this game, so
  // "guess more numbers" counts too. "picks" is intentionally excluded so vague
  // rules like "the most interesting mix of high and low picks" do not qualify.
  const comparative = "(?:most|more|fewest|least|mais|menos)";
  const scoreNoun =
    "(?:matching\\s+)?(?:numbers?|matches|hits|misses|wrong|acertos?|erros?|numeros?)";
  const matchVerb =
    "(?:match(?:es|ed|ing)?|hits?|guess(?:es|ed)?|acert\\w*|correct)";
  const missVerb =
    "(?:miss(?:es|ed|ing)?|wrong|errar|erra|errou|errad\\w*|fora)";
  const hasMissIntent = new RegExp(`\\b${missVerb}\\b`, "i").test(text);
  const scoreConcept =
    new RegExp(`\\b${comparative}\\b[^.]{0,30}\\b${scoreNoun}\\b`, "i").test(
      text,
    ) ||
    new RegExp(
      `\\b(?:${matchVerb}|${missVerb})\\b[^.]{0,20}\\b${comparative}\\b`,
      "i",
    ).test(text) ||
    new RegExp(
      `\\b${comparative}\\b[^.]{0,20}\\b(?:${matchVerb}|${missVerb})\\b`,
      "i",
    ).test(text);
  if (!scoreConcept) {
    return null;
  }

  // Competition context: an explicit win/winner cue, a superlative ("the most/
  // the fewest"), or a comparison against the other players ("than anyone",
  // "than everybody else"). Without one of these the comparative is not a
  // winner-selecting ranking (e.g. "low numbers should matter more than high
  // numbers, somehow" stays ambiguous).
  const competition =
    /\b(win|wins|winner|winning|takes the round|ganha|ganhar|vence|vencer|vencedor)\b/i.test(
      text,
    ) ||
    /\bthe\s+(most|fewest|least)\b/i.test(text) ||
    /\bquem\b[^.]{0,40}\b(?:mais|menos|maior|menor)\b/i.test(text) ||
    /\bthan\b[^.]{0,20}\b(any\s?one|any\s?body|every\s?one|every\s?body)\b/i.test(
      text,
    );
  if (!competition) {
    return null;
  }

  return rankingRule(
    minimize ? "min" : "max",
    count(
      hasMissIntent
        ? difference(source("guess"), source("draw"))
        : intersection(source("guess"), source("draw")),
    ),
  );
}

/** Six positions x the widest distance between two numbers in 1..100. */
const MAX_TOTAL_POSITION_DISTANCE = 6 * 99;

/**
 * Scale that folds a secondary criterion under a primary one without ever
 * letting the secondary overturn the primary.
 *
 * The runtime ranks ONE number per guess (`resolveRankingWinners` takes the
 * argmax of a single score), so an ordered pair of criteria has to become a
 * single score. It folds EXACTLY, not approximately: the secondary term below is
 * bounded by MAX_TOTAL_POSITION_DISTANCE, and scaling the primary term past that
 * bound makes one extra match worth more than every distance advantage that can
 * exist. The secondary term therefore only ever separates guesses whose primary
 * terms are equal — precisely "primary, then tiebreak".
 *
 * Derived from the bound rather than written as a round literal on purpose: the
 * exactness of the fold IS `scale > bound`, so the two cannot drift apart.
 */
const LEXICOGRAPHIC_PRIMARY_SCALE = MAX_TOTAL_POSITION_DISTANCE + 1;

/**
 * "The guess matching the most drawn numbers wins; if that cannot decide it, the
 * guess closest to the draw position by position wins."
 *
 * Two ordered criteria, one score (see LEXICOGRAPHIC_PRIMARY_SCALE). Compiled
 * deterministically because the generic match-count ranking above cannot express
 * the second criterion at all, and a pattern that recognizes only the first half
 * of this sentence freezes a rule the player did not write.
 *
 * The primary term counts guessed numbers present in the draw (order-free); the
 * secondary term sums |guess[i] - draw[i]| across the six positions, so a lower
 * total wins — hence subtraction, with the whole score maximized.
 */
function parseMatchCountThenPositionDistanceRankingRule(
  text: string,
): RuleAst | null {
  // Both criteria must be present, in order, joined by a fallback marker. Absent
  // the marker this is a single-criterion rule (handled above); absent either
  // criterion it is not this shape at all.
  if (!SECONDARY_CRITERION_MARKER.test(text)) {
    return null;
  }

  // Primary: a comparative over MOST matching numbers. Deliberately narrower
  // than the generic ranking's trigger set — "fewest" as the primary criterion
  // with a distance tiebreak is not a shape any player has asked for, and
  // guessing at it would freeze an inverted rule.
  const primaryMostMatches =
    /\b(?:most|more|mais)\b[^.]{0,30}\b(?:matching\s+)?(?:numbers?|matches|hits|acertos?|numeros?)\b/i.test(
      text,
    ) ||
    /\b(?:match(?:es|ed|ing)?|hits?|guess(?:es|ed)?|acert\w*)\b[^.]{0,20}\b(?:most|more|mais)\b/i.test(
      text,
    ) ||
    /\b(?:most|more|mais)\b[^.]{0,20}\b(?:match(?:es|ed|ing)?|hits?|guess(?:es|ed)?|acert\w*)\b/i.test(
      text,
    );
  if (!primaryMostMatches) {
    return null;
  }

  // Secondary: the SMALLEST difference/distance, measured position by position.
  // Both halves are required. "smallest difference" alone is ambiguous (between
  // what and what?), and "same positions" alone is not a distance.
  const smallestDifference =
    /\b(?:smallest|least|lowest|closest|nearest|minimum|min)\b[^.]{0,40}\b(?:difference|differences|distance|distances|gap|gaps)\b/i.test(
      text,
    ) ||
    /\b(?:menor(?:es)?|minima?|mais\s+proxim[oa]s?)\b[^.]{0,40}\b(?:diferenca|diferencas|distancia|distancias)\b/i.test(
      text,
    ) ||
    /\b(?:diferenca|diferencas|distancia|distancias)\b[^.]{0,40}\b(?:menor(?:es)?|minima?)\b/i.test(
      text,
    );
  const positionWise =
    /\b(?:same|corresponding|matching|equivalent|respective)\s+(?:positions?|slots?|places?|indexes|indices)\b/i.test(
      text,
    ) ||
    /\b(?:position\s+by\s+position|positionally)\b/i.test(text) ||
    /\b(?:posicoes|posicao)\s+(?:correspondentes?|corresponde|iguais|equivalentes?|respectivas?)\b/i.test(
      text,
    ) ||
    /\b(?:nas\s+mesmas\s+posicoes|na\s+mesma\s+posicao|posicao\s+por\s+posicao)\b/i.test(
      text,
    );
  if (!smallestDifference || !positionWise) {
    return null;
  }

  // A distance between SUMS, DIGITS or counts is a different score wearing the
  // same wording ("the smallest difference between the sums"). This pattern only
  // implements the value-by-value distance, so anything naming another quantity
  // belongs to the LLM path rather than to a near-enough deterministic reading.
  //
  // "total" is checked on a probe with its benign collocations removed first.
  // "the smallest TOTAL difference ... in the same positions" is this very rule
  // — the word is an adjective on the summed distance, not a second quantity to
  // difference — whereas "the difference between the TOTALS" is the score this
  // guard exists to refuse. Testing the raw text conflated the two and rejected
  // the most natural English phrasing of the shape.
  const quantityProbe = text
    .replace(
      /\b(?:total|totals|totais)\s+(?:difference|differences|distance|distances)\b/gi,
      " ",
    )
    .replace(
      /\b(?:diferenca|diferencas|distancia|distancias)\s+total(?:is|ais)?\b/gi,
      " ",
    )
    .replace(/\b(?:in|no|em)\s+total\b/gi, " ");
  if (
    /\b(?:sums?|totals?|digits?|units?|tens?|parity|multiples?|somas?|soma|totais?|digitos?|dezenas?|unidades?|paridade|multiplos?)\b/i.test(
      quantityProbe,
    )
  ) {
    return null;
  }

  const competition =
    /\b(?:win|wins|winner|winning|ganha|ganhar|vence|vencer|vencedor)\b/i.test(
      text,
    ) || /\bthe\s+(?:most|fewest|least)\b/i.test(text);
  if (!competition) {
    return null;
  }

  const guess = { kind: "source", source: "guess" } as const;
  const draw = { kind: "source", source: "draw" } as const;
  return {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      score: {
        kind: "arith",
        op: "sub",
        left: {
          kind: "arith",
          op: "mul",
          left: { kind: "lit", value: LEXICOGRAPHIC_PRIMARY_SCALE },
          right: {
            kind: "reduce",
            op: "count",
            of: { kind: "intersection", left: guess, right: draw },
          },
        },
        right: {
          kind: "reduce",
          op: "sum",
          of: {
            kind: "pairs_map",
            left: guess,
            right: draw,
            expr: {
              kind: "abs",
              of: {
                kind: "arith",
                op: "sub",
                left: { kind: "pair", side: "left" },
                right: { kind: "pair", side: "right" },
              },
            },
          },
        },
      },
    },
  };
}

function looksLikeAmbiguousReverseRule(text: string) {
  return (
    /\bmatch(?:es)?\b.{0,40}\b(draw|drawn)\b.{0,40}\breverse\b/i.test(text) &&
    !/\bposition\s*1\b.{0,80}\bposition\s*6\b/i.test(text) &&
    !/\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,80}\breversed?\s+positions?\b/i.test(
      text,
    ) &&
    // "all six reversed positions should match" is fully explicit, not vague.
    !/\ball\s+(six|6)\b.{0,40}\breversed?\s+(positions?|slots?)\b/i.test(text)
  );
}

function looksLikeObjectiveStartComparison(text: string) {
  return (
    /\bstart\s+stronger\b/i.test(text) &&
    /\bfirst\s+pick\b.{0,80}\b(higher|greater|above|more)\b.{0,80}\bfirst\s+drawn\s+number\b/i.test(
      text,
    )
  );
}

// The player is DEFINING a vague term with objective criteria. When the
// definition marker is present AND the wording either compiles deterministically
// or carries concrete numeric/positional criteria (a number plus a measurable
// operation), the vague trigger word is a false positive for ambiguity — the
// definition itself is the objectivity, even when only the LLM path can compile
// it ("By close, mean every pick is within 6 of the drawn number in the same
// position", "Define sunny as at least four drawn numbers above 50").
function looksLikeDefinedObjectiveRule(text: string): boolean {
  const definesTerm =
    /\b(means|i mean|defined as|defining|refers to)\b/i.test(text) ||
    /\bby\s+[\w-]+,?\s+(i\s+)?mean\b/i.test(text) ||
    /\bdefine[sd]?\s+[\w-]+\s+as\b/i.test(text) ||
    // Colon-definition: "more forgiving: at least four ...", "No admin step:
    // at least five picks ...".
    /:\s*(at\s+least|exactly|all|every|each|my|the|use)\b/i.test(text);
  if (!definesTerm) {
    return false;
  }
  if (compileSupportedRule(text) !== null) {
    return true;
  }
  const hasConcreteCriteria =
    /\b(one|two|three|four|five|six|\d+)\b/i.test(text) &&
    /\b(within|position|positions|sum|total|digit|digits|odd|even|match|matches|appear|appears|smallest|largest|greater|higher|lower|above|below|count|between|equal|equals)\b/i.test(
      text,
    );
  return hasConcreteCriteria;
}

function looksLikeObjectiveEvenCountComparison(text: string) {
  return (
    /\b(same\s+number\s+of\s+evens|number\s+of\s+even\b.{0,80}\b(equal|equals|same|match|matches))\b/i.test(
      text,
    ) &&
    /\b(guess|guessed|picked|ticket|picks?)\b/i.test(text) &&
    /\b(draw|drawn)\b/i.test(text)
  );
}

/**
 * The authoritative, player-facing statement of what a frozen artifact does.
 * Pure function of the AST, and TOTAL: the hand-tuned phrasings below win when
 * they match (they read better for the common shapes), and everything else
 * falls through to the total renderer. It never returns null, so no rule can
 * ever be shown to a player as anything but what the runtime will execute.
 */
export function describeRuleAstForPlayers(ast: RuleAst): string {
  return describeRuleAst(ast) ?? describeRuleAstTotal(ast);
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

  if (ast.schemaVersion !== 2) {
    return null;
  }

  if (ast.result.type === "ranking") {
    const { direction, score } = ast.result;
    if (
      score.kind === "reduce" &&
      score.op === "count" &&
      isIntersectionOfSources(score.of, "guess", "draw")
    ) {
      return direction === "min"
        ? "The winning guess is the one whose numbers include the FEWEST of the official draw's numbers; the lowest match count wins (ties share the pool)."
        : "The winning guess is the one whose numbers include the MOST of the official draw's numbers; the highest match count wins (ties share the pool).";
    }
    return null;
  }

  if (ast.result.type !== "predicate") {
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
    if (
      predicate.of.kind === "intersection" &&
      predicate.of.left.kind === "remove_up_to_n" &&
      predicate.of.left.of.kind === "source" &&
      predicate.of.left.of.source === "guess" &&
      predicate.of.right.kind === "source" &&
      predicate.of.right.source === "draw"
    ) {
      return `after removing up to ${predicate.of.left.n} ${predicate.of.left.strategy} guessed numbers, at least ${predicate.value} remaining guessed numbers appear in the official draw`;
    }
    if (
      predicate.of.kind === "intersection" &&
      predicate.of.left.kind === "map_with_guard" &&
      predicate.of.left.of.kind === "source" &&
      predicate.of.left.of.source === "guess" &&
      predicate.of.left.op === "mul" &&
      predicate.of.right.kind === "source" &&
      predicate.of.right.source === "draw"
    ) {
      return `at least ${predicate.value} guessed numbers, after multiplying each by ${predicate.of.left.operand} and dropping mapped values outside ${predicate.of.left.guard.min}-${predicate.of.left.guard.max}, appear in the official draw`;
    }
    return null;
  }

  if (predicate.kind === "all_equal_ordered") {
    if (
      predicate.left.kind === "map_arithmetic" &&
      predicate.left.op === "mod" &&
      predicate.left.operand === 2 &&
      predicate.left.of.kind === "source" &&
      predicate.left.of.source === "guess" &&
      predicate.right.kind === "map_arithmetic" &&
      predicate.right.op === "mod" &&
      predicate.right.operand === 2 &&
      predicate.right.of.kind === "source" &&
      predicate.right.of.source === "draw"
    ) {
      return "each guessed number has the same odd-or-even parity as the drawn number in the same position";
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

  if (predicate.kind === "ordered_position_compare_count_eq") {
    if (
      predicate.left.kind === "source" &&
      predicate.left.source === "guess" &&
      predicate.right.kind === "source" &&
      predicate.right.source === "draw"
    ) {
      return `exactly ${predicate.value} guessed numbers are ${describeCompareOp(predicate.op)} the drawn number in the same position`;
    }
    return null;
  }

  if (predicate.kind === "value_within_any_count_at_least") {
    if (
      predicate.left.kind === "source" &&
      predicate.left.source === "guess" &&
      predicate.right.kind === "source" &&
      predicate.right.source === "draw"
    ) {
      return `at least ${predicate.value} guessed numbers are within ${predicate.distance} of at least one drawn number`;
    }
    return null;
  }

  if (predicate.kind === "digit_match_count_at_least") {
    if (
      predicate.left.kind === "source" &&
      predicate.left.source === "guess" &&
      predicate.right.kind === "source" &&
      predicate.right.source === "draw"
    ) {
      const digitName =
        predicate.place === "units" ? "last digit" : "tens digit";
      return `at least ${predicate.value} guessed numbers have the same ${digitName} as any drawn number`;
    }
    return null;
  }

  if (predicate.kind === "all_values_between_min_max") {
    if (
      predicate.of.kind === "source" &&
      predicate.of.source === "guess" &&
      predicate.range.kind === "source" &&
      predicate.range.source === "draw"
    ) {
      return "all guessed numbers are between the smallest and largest drawn number, inclusive";
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

  // Provider ASTs commonly spell the legacy match-count macro as the equivalent
  // generic comparison `count(intersection(guess, draw)) >= N`. Render that
  // semantic shape with the same canonical, parser-readable sentence as the
  // macro. The previous generic renderer produced "how many values are in the
  // values present in both...", which forced the Guardian to learn one generated
  // phrase instead of comparing the rule programs themselves.
  if (
    predicate.left.kind === "reduce" &&
    predicate.left.op === "count" &&
    isIntersectionOfSources(predicate.left.of, "guess", "draw") &&
    predicate.right.kind === "lit"
  ) {
    if (predicate.op === "gte") {
      return `at least ${predicate.right.value} of its numbers appear in the official draw, regardless of order`;
    }
    if (predicate.op === "eq") {
      return `exactly ${predicate.right.value} of its numbers appear in the official draw, regardless of order`;
    }
  }

  if (
    predicate.left.kind === "arith" &&
    predicate.left.op === "sub" &&
    predicate.left.left.kind === "reduce" &&
    predicate.left.left.op === "sum" &&
    predicate.left.left.of.kind === "source" &&
    predicate.left.left.of.source === "guess" &&
    predicate.left.right.kind === "reduce" &&
    predicate.left.right.op === "sum" &&
    predicate.left.right.of.kind === "source" &&
    predicate.left.right.of.source === "draw" &&
    predicate.right.kind === "lit"
  ) {
    const difference = predicate.right.value;
    if (difference < 0 && (predicate.op === "lte" || predicate.op === "lt")) {
      return `the sum of the guessed numbers is ${
        predicate.op === "lte" ? "at least" : "more than"
      } ${Math.abs(difference)} lower than the sum of the drawn numbers`;
    }
    if (difference > 0 && (predicate.op === "gte" || predicate.op === "gt")) {
      return `the sum of the guessed numbers is ${
        predicate.op === "gte" ? "at least" : "more than"
      } ${difference} higher than the sum of the drawn numbers`;
    }
    if (predicate.op === "eq" && difference !== 0) {
      return `the sum of the guessed numbers is exactly ${Math.abs(
        difference,
      )} ${difference < 0 ? "lower" : "higher"} than the sum of the drawn numbers`;
    }
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
    if (
      scalar.op === "count" &&
      isIntersectionOfSources(scalar.of, "guess", "draw")
    ) {
      return "the count of guessed numbers that appear in the official draw";
    }
    if (scalar.of.kind === "source") {
      const sourceName =
        scalar.of.source === "guess" ? "the guess" : "the official draw";
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
    const arrayName = describeArray(scalar.of);
    if (!arrayName) {
      return null;
    }
    if (scalar.op === "sum") {
      return `the sum of ${arrayName}`;
    }
    if (scalar.op === "min") {
      return `the smallest number in ${arrayName}`;
    }
    if (scalar.op === "max") {
      return `the largest number in ${arrayName}`;
    }
    if (scalar.op === "count") {
      return `the count of ${arrayName}`;
    }
  }
  if (scalar.kind === "arith" && scalar.op === "mod") {
    const left = describeScalar(scalar.left);
    const right = describeScalar(scalar.right);
    return left && right ? `${left} modulo ${right}` : null;
  }
  return null;
}

function describeArray(array: ArrayExpr): string | null {
  if (array.kind === "source") {
    return array.source === "guess"
      ? "the guess's six numbers"
      : "the official draw's six numbers";
  }
  if (array.kind === "filter_compare") {
    const sourceName = describeArray(array.of);
    if (!sourceName) {
      return null;
    }
    return `numbers in ${sourceName} that are ${describeCompareOp(array.op)} ${array.value}`;
  }
  if (array.kind === "filter_mod") {
    const sourceName = describeArray(array.of);
    if (!sourceName) {
      return null;
    }
    if (array.modulus === 2) {
      return `${array.equals === 0 ? "even" : "odd"} numbers in ${sourceName}`;
    }
    return `numbers in ${sourceName} with modulo ${array.modulus} equal to ${array.equals}`;
  }
  if (array.kind === "remove_up_to_n") {
    const sourceName = describeArray(array.of);
    return sourceName
      ? `${sourceName} after removing up to ${array.n} ${array.strategy} values`
      : null;
  }
  if (array.kind === "slice") {
    const sourceName = describeArray(array.of);
    if (!sourceName) {
      return null;
    }
    if (array.start === 0 && array.end !== undefined) {
      return `the first ${array.end} values of ${sourceName}`;
    }
    if (array.end === undefined) {
      return `the last ${6 - array.start} values of ${sourceName}`;
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
  if (hasNegatedMatchRelation(text)) {
    return null;
  }
  return parseExactMatchCountThreshold(text);
}

/**
 * Compile complete "closest sum" rankings.  In the unqualified form, closest
 * means minimum absolute distance.  With "without exceeding" (or equivalent),
 * it means the greatest guess sum that is at most the draw sum; a v3
 * eligibility gate is essential because a score alone cannot represent the
 * no-eligible-guess case.
 */
function parseClosestSumRankingRule(text: string): RuleAst | null {
  const namesGuess =
    /\b(?:guess|guessed|ticket|pick|palpite|aposta)\w*\b/i.test(text);
  const namesDraw = /\b(?:draw|drawn|sorteio|sortead)\w*\b/i.test(text);
  const namesSum = /\b(?:sum|total|soma)\w*\b/i.test(text);
  if (!namesGuess || !namesDraw || !namesSum) return null;

  const oneSided =
    /\b(?:without\s+exceeding|does(?:n'?t| not)\s+go\s+over|does(?:n'?t| not)\s+exceed|not\s+over|at\s+most|less\s+than\s+or\s+equal(?:\s+to)?)\b|\b(?:sem\s+ultrapassar|nao\s+ultrapassar|menor\s+ou\s+igual(?:\s+(?:a|ao))?)\b/i.test(
      text,
    );
  const close = /\b(?:closest|nearest|close)\b|\bmais\s+proxim[oa]\b/i.test(
    text,
  );
  const greatest = /\b(?:highest|largest|greatest|maximum)\b|\bmaior\b/i.test(
    text,
  );
  if (!(close || (oneSided && greatest))) return null;

  const guessSum = {
    kind: "reduce",
    op: "sum",
    of: { kind: "source", source: "guess" },
  } as const;
  const drawSum = {
    kind: "reduce",
    op: "sum",
    of: { kind: "source", source: "draw" },
  } as const;
  if (oneSided) {
    return {
      schemaVersion: 3,
      result: {
        type: "ranking",
        direction: "max",
        tieBreak: "share_pool",
        eligibleWhen: {
          kind: "compare",
          op: "lte",
          left: guessSum,
          right: drawSum,
        },
        score: guessSum,
      },
    };
  }
  if (!close) return null;
  return {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "min",
      tieBreak: "share_pool",
      score: {
        kind: "abs",
        of: { kind: "arith", op: "sub", left: guessSum, right: drawSum },
      },
    },
  };
}

function parseExactMatchCountThreshold(text: string): number | null {
  const match =
    text.match(
      new RegExp(
        `\\b${EXACT_COUNT_CUE}\\s+(${MATCH_COUNT_NUMBER_0_TO_6})\\b.{0,80}\\b${MATCH_COUNT_NOUN}\\b.{0,80}\\b(?:${MATCH_COUNT_ACTION}|certos?|corretos?|acertados?)\\b`,
        "i",
      ),
    ) ??
    text.match(
      new RegExp(
        `\\b(${MATCH_COUNT_NUMBER_0_TO_6})\\b(?:[^.;:]{0,30}\\b(?:matches|hits|overlaps?|acertos?)\\b[^.;:]{0,30}\\b(?:${EXACT_COUNT_CUE}|exatos?)\\b|[^.;:]{0,30}\\b(?:numbers?|numeros?|dezenas?)\\b[^.;:]{0,20}\\b(?:${MATCH_COUNT_ACTION}|certos?|corretos?|acertados?)\\b[^.;:]{0,20}\\b(?:${EXACT_COUNT_CUE}|exatos?)\\b)`,
        "i",
      ),
    ) ??
    text.match(
      new RegExp(
        `\\b${EXACT_COUNT_CUE}\\s+(${MATCH_COUNT_NUMBER_0_TO_6})\\b.{0,40}\\b(?:matches|hits|overlaps?|acertos?)\\b`,
        "i",
      ),
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
  const normalized = value
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
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
    ["last", 5],
    ["primeiro", 0],
    ["primeira", 0],
    ["segundo", 1],
    ["segunda", 1],
    ["terceiro", 2],
    ["terceira", 2],
    ["quarto", 3],
    ["quarta", 3],
    ["quinto", 4],
    ["quinta", 4],
    ["sexto", 5],
    ["sexta", 5],
    ["ultimo", 5],
    ["ultima", 5],
  ]);
  return ordinals.get(normalized) ?? null;
}

function parsePositionSpecificRangeRule(text: string): RuleAst | null {
  const ordinal =
    "first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]";
  const sourceCue = "guessed?|picked|ticket|guess|drawn?|draw";
  const clausePattern = new RegExp(
    `\\b(?:the|o|a)?\\s*(${ordinal})(?:\\s+(${sourceCue})?\\s*(?:number|pick|numero))?(?:\\s+(?:is|be|are|must\\s+be|falls?|lies?|sits?|estiver|esta|deve\\s+estar))?\\s+(?:between|entre)\\s+(\\d{1,3})\\s+(?:and|e)\\s+(\\d{1,3})(?:\\s+(?:inclusive|inclusiv[oa]s?))?`,
    "gi",
  );
  const matches = [...text.matchAll(clausePattern)];
  if (matches.length === 0) {
    return null;
  }

  const clauses: PredicateNode[] = [];
  const seenPositions = new Set<string>();
  for (const match of matches) {
    const index = match[1] ? parseOrdinal(match[1]) : null;
    const sourceName: "draw" | "guess" = /draw/i.test(match[2] ?? "")
      ? "draw"
      : "guess";
    const low = Number(match[3]);
    const high = Number(match[4]);
    const positionKey = `${sourceName}:${index}`;
    if (
      index === null ||
      !Number.isInteger(low) ||
      !Number.isInteger(high) ||
      low < 1 ||
      high > 100 ||
      low > high ||
      seenPositions.has(positionKey)
    ) {
      return null;
    }
    seenPositions.add(positionKey);
    const value = at(source(sourceName), index);
    clauses.push(
      compare(value, "gte", lit(low)),
      compare(value, "lte", lit(high)),
    );
  }

  return predicateRule({ kind: "and", clauses });
}

function parseComparisonWord(value: string): CompareOp | null {
  if (/^(equal|equals|same|match|matches|is|igual)$/i.test(value)) {
    return "eq";
  }
  if (
    /^(greater|higher|above|more|bigger|larger|beats?|exceeds?|maior|superior|excede)$/i.test(
      value,
    )
  ) {
    return "gt";
  }
  if (/^(lower|less|below|smaller|menor|inferior)$/i.test(value)) {
    return "lt";
  }
  return null;
}

function parsePositionComparisonRule(text: string): PredicateNode | null {
  // This parser emits a conjunction of clauses it can see. It must not claim a
  // sentence that explicitly counts how many comparisons hold, or one that
  // abbreviates further clauses with an ellipsis: both require a complete
  // collection/aggregation that this parser does not implement.
  if (
    /\b(?:at\s+least|at\s+most|exactly|no\s+fewer\s+than|no\s+more\s+than|pelo\s+menos|no\s+minimo|no\s+maximo|exatamente)\s+(?:[0-6]|zero|one|two|three|four|five|six|um|uma|dois|duas|tres|quatro|cinco|seis)\b[^.;:]{0,80}\bcompar(?:ison|isons|acao|acoes)\b/iu.test(
      text,
    ) ||
    /\b(?:and\s+so\s+on|and\s+the\s+pattern\s+continues|etc(?:etera)?|e\s+assim\s+por\s+diante)\b/iu.test(
      text,
    )
  ) {
    return null;
  }
  const ordinal =
    "first|1st|second|2nd|third|3rd|fourth|4th|fifth|5th|sixth|6th|last|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|[uú]ltim[oa]";
  const comparison =
    "equal|equals|same|matches?|match|greater|higher|above|more|bigger|larger|beats?|exceeds?|lower|less|below|smaller|igual|maior|superior|excede|menor|inferior";
  const clausePattern = new RegExp(
    `\\b(${ordinal})\\s+(?:(?:guessed?|picked|ticket|guess)\\s+)?(?:number|pick|n[uú]mero)\\b.{0,40}?\\b(${comparison})\\b.{0,55}?\\b(${ordinal})\\s+(?:(?:(?:drawn?|draw)\\s+(?:number|pick))|(?:number\\s+that\\s+gets\\s+drawn)|(?:n[uú]mero\\s+(?:do|de)\\s+sorteio))\\b`,
    "giu",
  );

  const clauses: PredicateNode[] = [];
  const signatures = new Set<string>();
  for (const match of text.matchAll(clausePattern)) {
    const leftIndex = match[1] ? parseOrdinal(match[1]) : null;
    const op = match[2] ? parseComparisonWord(match[2]) : null;
    const rightIndex = match[3] ? parseOrdinal(match[3]) : null;
    if (leftIndex === null || rightIndex === null || op === null) {
      continue;
    }
    const signature = `${leftIndex}:${op}:${rightIndex}`;
    if (signatures.has(signature)) {
      continue;
    }
    signatures.add(signature);
    clauses.push(
      compare(
        at(source("guess"), leftIndex),
        op,
        at(source("draw"), rightIndex),
      ),
    );
  }

  if (clauses.length === 0) {
    return null;
  }
  return clauses.length === 1 ? clauses[0]! : { kind: "and", clauses };
}

function parseOrderedAbsoluteDifferenceRule(
  text: string,
): PredicateNode | null {
  const match = text.match(
    /\babsolute\s+difference\b.{0,80}\beach\s+(?:guessed?|picked|ticket|your)\s+number\b.{0,80}\b(draw|drawn)\s+number\b.{0,80}\b(same position|corresponding position|same index|same slot)\b.{0,80}\b(at most|no more than|less than or equal to|<=)\s+([0-9]+)\b/i,
  );
  // Alternative wording (prompt-set 72): "each guessed number is within 5 of the
  // drawn number in the same position" — same predicate, no "absolute difference"
  // phrase. "within N" of the same-position value means |guess[i]-draw[i]| <= N.
  const withinMatch =
    match ??
    text.match(
      /\b(?:each|every)\s+(?:(?:guessed?|picked|ticket|your)\s+)?(?:number|pick)\b.{0,60}\b(within|off by)\s+([0-9]+|one|two|three|four|five|six)\b.{0,50}\b(at most|no more than)?\b.{0,40}\b(draw|drawn)\s+number\b.{0,50}\b(same position|corresponding position|same index|same slot)\b/i,
    );
  const value = match?.[4]
    ? Number(match[4])
    : withinMatch?.[2]
      ? (parseWordOrDigit(withinMatch[2]) ?? NaN)
      : NaN;
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

function parseNoEvenGuessOverlapRule(text: string): PredicateNode | null {
  if (
    !/\b(?:none\s+of|no)\b[^.]{0,50}\beven\b[^.]{0,35}\b(?:guessed?|picked|ticket)?\s*numbers?\b[^.]{0,70}\b(?:appear|appears|match|matches)\b[^.]{0,35}\b(?:draw|drawn)\b/i.test(
      text,
    )
  ) {
    return null;
  }
  return compare(
    count(intersection(filterMod(source("guess"), 2, 0), source("draw"))),
    "eq",
    lit(0),
  );
}

function parseContainsAndDrawSumRule(text: string): RuleAst | null {
  const containsMatch = text.match(
    /\bcontains?\s+(?:the\s+number\s+)?(\d{1,3})\b/i,
  );
  const drawSumMatch = text.match(
    /\b(?:sum|total)\s+of\s+(?:the\s+)?(?:six\s+|6\s+)?(?:official\s+)?drawn?\s+numbers?\b[^.]{0,20}\b(?:is\s+)?(below|less than|under|above|greater than|over)\s+(\d{1,3})\b/i,
  );
  if (!containsMatch?.[1] || !drawSumMatch?.[1] || !drawSumMatch[2]) {
    return null;
  }
  const contained = Number(containsMatch[1]);
  const threshold = Number(drawSumMatch[2]);
  if (
    !Number.isInteger(contained) ||
    contained < 1 ||
    contained > 100 ||
    !Number.isInteger(threshold) ||
    threshold < 0 ||
    threshold > 600
  ) {
    return null;
  }
  const op: CompareOp = /below|less|under/i.test(drawSumMatch[1]) ? "lt" : "gt";
  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "and",
        clauses: [
          {
            kind: "contains",
            array: { kind: "source", source: "guess" },
            value: { kind: "lit", value: contained },
          },
          {
            kind: "compare",
            left: {
              kind: "reduce",
              op: "sum",
              of: { kind: "source", source: "draw" },
            },
            op,
            right: { kind: "lit", value: threshold },
          },
        ],
      },
    },
  };
}

function parseStrictGuessRangeRule(text: string): RuleAst | null {
  const match = text.match(
    /\b(?:all\s+(?:six|6)|every)\s+(?:of\s+the\s+)?(?:guessed?|picked|ticket|your)\s+numbers?\b[^.]{0,40}\bstrictly\s+greater\s+than\s+(\d{1,3})\b[^.]{0,40}\band\s+strictly\s+less\s+than\s+(\d{1,3})\b/i,
  );
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const low = Number(match[1]);
  const high = Number(match[2]);
  if (
    !Number.isInteger(low) ||
    !Number.isInteger(high) ||
    low < 0 ||
    high > 101 ||
    low >= high
  ) {
    return null;
  }
  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "forall",
        of: { kind: "source", source: "guess" },
        where: {
          kind: "and",
          clauses: [
            {
              kind: "compare",
              left: { kind: "elem" },
              op: "gt",
              right: { kind: "lit", value: low },
            },
            {
              kind: "compare",
              left: { kind: "elem" },
              op: "lt",
              right: { kind: "lit", value: high },
            },
          ],
        },
      },
    },
  };
}

function parseDrawAllThresholdRule(text: string): RuleAst | null {
  const match = text.match(
    /\b(?:all\s+(?:six|6)|every)\s+(?:official\s+)?drawn?\s+numbers?\b[^.]{0,25}\b(?:are\s+)?(below|less than|under|above|greater than|over)\s+(\d{1,3})\b/i,
  );
  if (!match?.[1] || !match[2]) {
    return null;
  }
  const value = Number(match[2]);
  if (!Number.isInteger(value) || value < 0 || value > 101) {
    return null;
  }
  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "forall",
        of: { kind: "source", source: "draw" },
        where: {
          kind: "compare",
          left: { kind: "elem" },
          op: /below|less|under/i.test(match[1]) ? "lt" : "gt",
          right: { kind: "lit", value },
        },
      },
    },
  };
}

/**
 * Compile a ticket that must contain every value in an explicit literal list.
 * The whole suffix is validated so a later condition can never be swallowed as
 * another list item. Ticket uniqueness makes a six-value membership list an
 * exact unordered set; shorter lists deliberately leave the other slots free.
 * A player may spell those free slots out as the complementary tail of the
 * number domain (1..N plus the remaining values from N+1..100); that redundant
 * constraint is retained in the AST so every stated bound stays auditable.
 */
function parseGuessContainsLiteralSetRule(text: string): RuleAst | null {
  const subject = text.match(
    /\b(?:guess|ticket|palpite|bilhete|numeros?\s+do\s+jogador|numero\s+do\s+jogador)\b[^.;]{0,35}?\b(?:contains?|includes?|include|has|have|tiver|tenha|contem|inclui)\b/i,
  );
  if (!subject || subject.index === undefined) {
    return null;
  }

  const prefix = text.slice(0, subject.index);
  if (
    INTENT_BEARING_RESIDUE.test(prefix) ||
    /\b(?:and|or|e|ou)\b|[.;]/i.test(prefix)
  ) {
    return null;
  }

  const suffix = text.slice(subject.index + subject[0].length).trim();
  const list = suffix.match(
    /^(?:(?:the|os|as)\s+)?(?:numbers?|numeros?|dezenas?)?\s*((?:100|[1-9]?\d)(?:(?:\s*[,;]\s*(?:(?:and|e)\s+)?|\s+(?:and|e)\s+|\s+)(?:100|[1-9]?\d)){1,5})\b/i,
  );
  if (!list?.[1]) {
    return null;
  }

  const values = (list[1].match(/\b(?:100|[1-9]?\d)\b/g) ?? []).map(Number);
  if (
    values.length < 2 ||
    values.length > 6 ||
    new Set(values).size !== values.length ||
    values.some((value) => value < 1 || value > 100)
  ) {
    return null;
  }

  const remainder = stripConfirmedDrawIndependence(
    suffix.slice(list[0].length).trim(),
  );
  const harmlessRemainder = new RegExp(
    [
      "^(?:[,;.]\\s*)?",
      "(?:\\(\\s*)?",
      "(?:(?:in|regardless\\s+of)\\s+(?:any\\s+)?order|em\\s+qualquer\\s+ordem|qualquer\\s+ordem)?",
      "(?:\\s*\\))?",
      "(?:\\s+or\\s+the\\s+other\\s+(?:one|two|three|four|five|[1-5])\\s+numbers?)?",
      "(?:\\s*[,;.]\\s*)?",
      "(?:(?:then\\s+)?(?:the\\s+player|they|it|ele|ela)\\s+(?:wins?|ganha|vence))?",
      "[.!?]*$",
    ].join(""),
    "i",
  );
  const clauses: PredicateNodeV3[] = values.map((value) => ({
    kind: "contains",
    array: { kind: "source", source: "guess" },
    value: { kind: "lit", value },
  }));
  if (!harmlessRemainder.test(remainder)) {
    const explicitRemainder = parseExplicitLiteralSetRemainder(
      remainder,
      values,
    );
    if (!explicitRemainder) {
      return null;
    }
    clauses.push(explicitRemainder);
  }
  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: { kind: "and", clauses },
    },
  };
}

function stripConfirmedDrawIndependence(value: string) {
  const scope = value.match(
    /(?:[.;]\s*)?(?:(?:the\s+)?(?:official\s+)?draw\s+(?:does\s+not\s+(?:affect|matter|change|influence)|is\s+(?:irrelevant|not\s+used))\s+(?:the\s+)?(?:result|outcome|rule)|(?:o\s+)?sorteio(?:\s+oficial)?\s+nao\s+(?:afeta|muda|influencia)\s+(?:o\s+)?(?:resultado|regra))[.!?]*$/i,
  );
  return scope && scope.index !== undefined
    ? value.slice(0, scope.index).trim()
    : value;
}

function parseExplicitLiteralSetRemainder(
  remainder: string,
  values: readonly number[],
): PredicateNodeV3 | null {
  const match = remainder.match(
    /^(?:[,;.]?\s*)?(?:(?:\(\s*)?(?:(?:in|regardless\s+of)\s+(?:any\s+)?order|em\s+qualquer\s+ordem|qualquer\s+ordem)(?:\s*\))?\s*)?(?:[,;]?\s*)?(?:and|plus|e|mais)\s+(?:any\s+|quaisquer?\s+)?(two|three|four|five|dois|duas|tres|quatro|cinco|[2-5])\s+(?:other|additional|remaining|outros?|adicionais?|restantes?)\s+(?:(?:distinct|unique|distintos?|diferentes?|unicos?)\s+)?(?:numbers?|values?|numeros?|valores?)\s+(?:each\s+)?(?:from|de)\s+(\d{1,3})\s+(?:to|through|a|ate)\s+(\d{1,3})(?:\s*,?\s*(?:with\s+)?(?:no\s+(?:repeats?|duplicates?)|all\s+six\s+(?:values?\s+)?(?:being\s+)?unique|sem\s+(?:repeticoes?|duplicatas?)))?(?:\s*;\s*if\s+satisfied,?\s*the\s+guess\s+wins)?[.!?]*$/i,
  );
  if (!match?.[1] || !match[2] || !match[3]) {
    return null;
  }

  const remainingCount = 6 - values.length;
  const statedCount = readSmallCount(match[1]);
  const low = Number(match[2]);
  const high = Number(match[3]);
  const sortedValues = [...values].sort((left, right) => left - right);
  const isContiguousPrefix = sortedValues.every(
    (value, index) => value === index + 1,
  );
  const statesUniqueness =
    /\b(?:distinct|unique|distintos?|diferentes?|unicos?|no\s+(?:repeats?|duplicates?)|sem\s+(?:repeticoes?|duplicatas?))\b/i.test(
      match[0],
    );
  if (
    remainingCount < 1 ||
    statedCount !== remainingCount ||
    !isContiguousPrefix ||
    low !== values.length + 1 ||
    high !== 100 ||
    !statesUniqueness
  ) {
    return null;
  }

  return {
    kind: "compare",
    left: {
      kind: "reduce",
      op: "count",
      of: {
        kind: "filter",
        of: { kind: "source", source: "guess" },
        where: {
          kind: "and",
          clauses: [
            {
              kind: "compare",
              left: { kind: "elem" },
              op: "gte",
              right: { kind: "lit", value: low },
            },
            {
              kind: "compare",
              left: { kind: "elem" },
              op: "lte",
              right: { kind: "lit", value: high },
            },
          ],
        },
      },
    },
    op: "eq",
    right: { kind: "lit", value: remainingCount },
  };
}

function parseGuessContainsLiteralRule(text: string): RuleAst | null {
  const match = text.match(
    /\b(?:a\s+guess\s+wins\s+if\s+it|the\s+guess|your\s+(?:guess|ticket))\s+contains?\s+(?:the\s+number\s+)?(\d{1,3})\b/i,
  );
  if (!match?.[1]) {
    return null;
  }
  const value = Number(match[1]);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    return null;
  }
  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "contains",
        array: { kind: "source", source: "guess" },
        value: { kind: "lit", value },
      },
    },
  };
}

// H03: two independently load-bearing same-position conditions. This is kept as
// a compositional v3 predicate so "within 6" and "at least one exact match" are
// separately executable clauses. A single all-within node is not a valid
// simplification: it accepts guesses with no exact position match.
function parseCompoundWithinAndExactPositionRule(text: string): RuleAst | null {
  const within = parseOrderedAbsoluteDifferenceRule(text);
  if (!within || within.kind !== "all_ordered_abs_diff_lte") {
    return null;
  }
  const exactMatch = text.match(
    /\b(?:and|e)\s+at\s+least\s+(one|two|three|four|five|six|[1-6])\b[^.]{0,60}\b(?:guessed?|picked|ticket|your)?\s*numbers?\b[^.]{0,60}\b(?:exactly\s+)?(?:equals?|matches?)\b[^.]{0,60}\b(?:their\s+)?(?:drawn?|draw)(?:\s+numbers?)?\b[^.]{0,60}\b(?:same|corresponding|that|those)\s+positions?\b/i,
  );
  const minimumExact = exactMatch?.[1] ? parseWordOrDigit(exactMatch[1]) : null;
  if (minimumExact === null || minimumExact < 1 || minimumExact > 6) {
    return null;
  }

  const guess = { kind: "source", source: "guess" } as const;
  const draw = { kind: "source", source: "draw" } as const;
  return {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "and",
        clauses: [
          {
            kind: "pairs_forall",
            left: guess,
            right: draw,
            where: {
              kind: "compare",
              op: "lte",
              left: {
                kind: "abs",
                of: {
                  kind: "arith",
                  op: "sub",
                  left: { kind: "pair", side: "left" },
                  right: { kind: "pair", side: "right" },
                },
              },
              right: { kind: "lit", value: within.value },
            },
          },
          minimumExact === 1
            ? {
                kind: "pairs_exists",
                left: guess,
                right: draw,
                where: {
                  kind: "compare",
                  op: "eq",
                  left: { kind: "pair", side: "left" },
                  right: { kind: "pair", side: "right" },
                },
              }
            : {
                kind: "compare",
                op: "gte",
                left: {
                  kind: "reduce",
                  op: "sum",
                  of: {
                    kind: "pairs_map",
                    left: guess,
                    right: draw,
                    expr: {
                      kind: "ite",
                      if: {
                        kind: "compare",
                        op: "eq",
                        left: { kind: "pair", side: "left" },
                        right: { kind: "pair", side: "right" },
                      },
                      then: { kind: "lit", value: 1 },
                      else: { kind: "lit", value: 0 },
                    },
                  },
                },
                right: { kind: "lit", value: minimumExact },
              },
        ],
      },
    },
  };
}

// #75/#76: "exactly 3 guessed numbers are odd and exactly 3 are even" (or the
// same for the draw). Compiles to a conjunction of two filtered-count equalities
// over one source (guess unless only the draw is named).
function parseExactParityCountRule(text: string): PredicateNode | null {
  const match = text.match(
    /\bexactly\s+(one|two|three|four|five|six|\d+)\b[^.]{0,35}\b(odd|even)\b[^.]{0,25}\band\b[^.]{0,25}(?:exactly\s+)?(one|two|three|four|five|six|\d+)\b[^.]{0,25}\b(odd|even)\b/i,
  );
  if (!match) {
    return null;
  }
  const firstCount = parseWordOrDigit(match[1] ?? "");
  const secondCount = parseWordOrDigit(match[3] ?? "");
  const firstParity = (match[2] ?? "").toLowerCase();
  const secondParity = (match[4] ?? "").toLowerCase();
  if (
    firstCount === null ||
    secondCount === null ||
    firstCount < 0 ||
    firstCount > 6 ||
    secondCount < 0 ||
    secondCount > 6 ||
    firstParity === secondParity
  ) {
    return null;
  }
  const drawOnly =
    /\b(drawn?|draw)\b/i.test(text) &&
    !/\b(guess|guessed|picked|ticket)\b/i.test(text);
  const src = source(drawOnly ? "draw" : "guess");
  const clauseFor = (parity: string, value: number): PredicateNode =>
    compare(
      count(filterMod(src, 2, parity === "odd" ? 1 : 0)),
      "eq",
      lit(value),
    );
  return {
    kind: "and",
    clauses: [
      clauseFor(firstParity, firstCount),
      clauseFor(secondParity, secondCount),
    ],
  };
}

function parseTotalOrderedAbsoluteDifferenceRule(
  text: string,
): PredicateNode | null {
  const match = text.match(
    /\btotal\s+absolute\b.{0,80}\b(position-by-position|same-position|same position|corresponding position|corresponding-position)\s+difference\b.{0,80}\b(guess|guessed|ticket|your)\b.{0,80}\b(draw|drawn)\b.{0,80}(?:(?:\b(is\s+)?(at most|no more than|less than or equal to|<=)\s+([0-9]+)\b)|(?:\b(is\s+)?([0-9]+)\s+or\s+less\b))/i,
  );
  const value = match?.[6]
    ? Number(match[6])
    : match?.[8]
      ? Number(match[8])
      : NaN;
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

function parseOrderedPositionMatchCountRule(
  text: string,
): PredicateNode | null {
  const match =
    text.match(
      /\b(exactly|at least|at most)\s+([0-6]|one|two|three|four|five|six)\b.{0,80}\b(guessed?|picked|ticket|your)?\s*numbers?\b.{0,80}\b(match|matches|equal|equals)\b.{0,80}\b(same position|same positions|corresponding position|corresponding positions|same index|same indexes)\b/i,
    ) ??
    text.match(
      /\b(exactly|at least|at most)\s+([0-6]|one|two|three|four|five|six)\s+positions?\b.{0,80}\b(exact\s+match|match|matches)\b/i,
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

function parseDigitMatchCountRule(text: string): PredicateNode | null {
  const match = text.match(
    /\bat least\s+([1-6]|one|two|three|four|five|six)\b.{0,80}\b(?:(?:guessed?|picked|ticket|your)\s+numbers?|picks?)\b.{0,80}\b(?:same\s+)?(?:last|units?)\s+digit\b.{0,80}\b(?:any\s+)?drawn?\s+number\b/i,
  );
  const rawValue = match?.[1]?.toLowerCase();
  const value = rawValue
    ? (NUMBER_WORDS.get(rawValue) ?? Number(rawValue))
    : NaN;
  if (!Number.isInteger(value) || value < 1 || value > 6) {
    return null;
  }
  return {
    kind: "digit_match_count_at_least",
    left: source("guess"),
    place: "units",
    right: source("draw"),
    value,
  };
}

function parseOddSumEqualsRule(text: string): PredicateNode | null {
  if (
    !(
      /\bsum\b.{0,40}\bodd\s+(guessed?|picked|ticket|your)\s+numbers?\b/i.test(
        text,
      ) ||
      /\bodd\s+(picks?|guessed?|picked|ticket|your)\b.{0,40}\b(add up|sum|total)\b/i.test(
        text,
      )
    ) ||
    !(
      /\b(equal|equals|same|match|matches)\b.{0,40}\bsum\b.{0,40}\bodd\s+(drawn?|draw)\s+numbers?\b/i.test(
        text,
      ) || /\bsame\s+odd-number\s+total\s+in\s+the\s+draw\b/i.test(text)
    )
  ) {
    return null;
  }
  return compare(
    sum(filterMod(source("guess"), 2, 1)),
    "eq",
    sum(filterMod(source("draw"), 2, 1)),
  );
}

// Both phrasings put the count, the compared sides and the positional scope in
// the sentence; they differ only in WHERE the positional cue sits. Value is
// group 1 and the comparator group 2 in both.
const ORDERED_POSITION_COMPARE_COUNT_PATTERNS = [
  // Trailing scope: "exactly two guessed numbers are higher than the drawn
  // number in the same position".
  /\bexactly\s+([0-6]|one|two|three|four|five|six)\b.{0,80}\b(?:guessed?|picked|ticket|your|my)\s+numbers?\b.{0,80}\b(greater|higher|above|more|lower|less|below|smaller)\b.{0,80}\b(?:drawn?|draw)\s+number\b.{0,80}\b(?:same position|same positions|corresponding position|corresponding positions|same index|same indexes)\b/i,
  // Leading scope: "exactly two POSITIONS should have my picked number higher
  // than the drawn number there". Same rule, and without this branch it fell
  // through to `count(intersection(guess,draw)) == 2` — a plain unordered match
  // count, which ignores position and is a different rule entirely. The
  // `position` coverage operation is what surfaced it.
  /\bexactly\s+([0-6]|one|two|three|four|five|six)\s+positions?\b.{0,80}\b(?:guessed?|picked|ticket|your|my)\s+numbers?\b.{0,80}\b(greater|higher|above|more|lower|less|below|smaller)\b.{0,80}\b(?:drawn?|draw)\s+number\b/i,
] as const;

function parseOrderedPositionCompareCountRule(
  text: string,
): PredicateNode | null {
  const match =
    ORDERED_POSITION_COMPARE_COUNT_PATTERNS.reduce<RegExpMatchArray | null>(
      (found, pattern) => found ?? text.match(pattern),
      null,
    );
  const rawValue = match?.[1]?.toLowerCase();
  const value = rawValue
    ? (NUMBER_WORDS.get(rawValue) ?? Number(rawValue))
    : NaN;
  const op = match?.[2] ? parseComparisonWord(match[2]) : null;
  if (!Number.isInteger(value) || value < 0 || value > 6 || !op) {
    return null;
  }
  return {
    kind: "ordered_position_compare_count_eq",
    left: source("guess"),
    op,
    right: source("draw"),
    value,
  };
}

function parseAllValuesBetweenMinMaxRule(text: string): PredicateNode | null {
  if (
    !/\b(all\s+)?(guessed?|picked|ticket|my|your)\s+(numbers?|picks?)\b/i.test(
      text,
    ) ||
    !(
      /\bbetween\b.{0,80}\bsmallest\b.{0,40}\blargest\b.{0,40}\bdrawn?\s+number\b/i.test(
        text,
      ) ||
      /\binside\b.{0,80}\bdraw'?s\s+lowest-to-highest\s+range\b/i.test(text) ||
      /\binside\b.{0,80}\bdraw'?s\s+lowest\s+to\s+highest\s+range\b/i.test(text)
    )
  ) {
    return null;
  }
  return {
    kind: "all_values_between_min_max",
    of: source("guess"),
    range: source("draw"),
  };
}

function parseModuloCountComparisonRule(text: string): PredicateNode | null {
  const multipleMatch = text.match(
    /\b(guessed?|picked|ticket|your|my)\b(?:\s+numbers?)?\b.{0,80}\b(contain|have|has|should\s+have)\b.{0,40}\b(more|greater|higher|fewer|less|lower)\b.{0,80}\bmultiples?\s+of\s+([0-9]+)\b.{0,80}\b(draw|drawn)\b/i,
  );
  if (!multipleMatch?.[3] || !multipleMatch[4]) {
    return null;
  }
  const modulus = Number(multipleMatch[4]);
  const op = parseComparisonWord(multipleMatch[3]);
  if (!Number.isInteger(modulus) || modulus <= 0 || modulus > 100 || !op) {
    return null;
  }
  return compare(
    count(filterMod(source("guess"), modulus, 0)),
    op,
    count(filterMod(source("draw"), modulus, 0)),
  );
}

function parseSortedPairSumComparisonRule(text: string): PredicateNode | null {
  const match = text.match(
    /\bsum\s+of\s+(?:(?:its|the|the\s+(?:guessed?|picked|ticket)|your)\s+)?(one|two|three|four|five|six|[1-6])\s+(smallest|lowest|largest|highest|biggest)\s+(?:guessed?\s+|picked\s+|ticket\s+)?numbers?\b.{0,80}\b(equal|equals|same|match|matches|greater|higher|above|more|bigger|larger|lower|less|below|smaller)\b.{0,80}\bsum\s+of\s+(?:the\s+)?(one|two|three|four|five|six|[1-6])\s+(smallest|lowest|largest|highest|biggest)\s+(?:drawn?|draw)\s+numbers?\b/i,
  );
  if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5]) {
    return null;
  }
  const count = parseWordOrDigit(match[1]);
  const drawCount = parseWordOrDigit(match[4]);
  const leftOrder = /smallest|lowest/i.test(match[2]) ? "asc" : "desc";
  const rightOrder = /smallest|lowest/i.test(match[5]) ? "asc" : "desc";
  const op = parseComparisonWord(match[3]);
  if (!op || count === null || drawCount !== count || count < 1 || count > 6) {
    return null;
  }
  return compare(
    sum(sliceArray(sortArray(source("guess"), leftOrder), 0, count)),
    op,
    sum(sliceArray(sortArray(source("draw"), rightOrder), 0, count)),
  );
}

function parseCasualSortedPairSumComparisonRule(
  text: string,
): PredicateNode | null {
  const sideMatch = text.match(
    /\btwo\s+(smallest|lowest|biggest|largest|highest)\s+numbers?\b/i,
  );
  const compareMatch = text.match(
    /\b(pair|sums?)\b.{0,80}\b(equal|equals|same|match|matches|greater|higher|above|more|bigger|larger|lower|less|below|smaller)\b/i,
  );
  if (!sideMatch?.[1] || !compareMatch?.[2]) {
    return null;
  }
  if (
    !/\b(each side|ticket'?s pair|my ticket|my picks?|draw'?s pair|drawn?)\b/i.test(
      text,
    )
  ) {
    return null;
  }
  const order = /smallest|lowest/i.test(sideMatch[1]) ? "asc" : "desc";
  const op = parseComparisonWord(compareMatch[2]);
  if (!op) {
    return null;
  }
  return compare(
    sum(sliceArray(sortArray(source("guess"), order), 0, 2)),
    op,
    sum(sliceArray(sortArray(source("draw"), order), 0, 2)),
  );
}

function parseEvenCountEqualityRule(text: string): PredicateNode | null {
  if (
    !/\b(same\s+(number|amount)\s+of\s+evens?|number\s+of\s+even\b.{0,80}\b(equal|equals|same|match|matches))\b/i.test(
      text,
    ) &&
    !/\bnumber\b.{0,40}\beven\b.{0,80}\b(equal|equals|same|match|matches)\b.{0,80}\beven\b/i.test(
      text,
    )
  ) {
    return null;
  }
  if (
    !/\b(guess|guessed|picked|ticket|picks?)\b/i.test(text) ||
    !/\b(draw|drawn)\b/i.test(text)
  ) {
    return null;
  }
  return compare(
    count(filterMod(source("guess"), 2, 0)),
    "eq",
    count(filterMod(source("draw"), 2, 0)),
  );
}

function parseCompoundMatchAndSumComparisonRule(
  text: string,
): PredicateNode | null {
  const matchThreshold = parseMatchCountRule(text);
  if (!matchThreshold) {
    return null;
  }
  const sumComparison = text.match(
    /\b(guessed?|picked|ticket|your)\s+sum\b.{0,80}\b(greater|higher|above|more|lower|less|below|smaller)\b.{0,80}\b(draw|drawn)\s+sum\b/i,
  );
  const op = sumComparison?.[2] ? parseComparisonWord(sumComparison[2]) : null;
  if (!op) {
    return null;
  }
  return {
    kind: "and",
    clauses: [
      compare(sum(source("guess")), op, sum(source("draw"))),
      {
        kind: "count_at_least",
        of: intersection(source("guess"), source("draw")),
        value: matchThreshold,
      },
    ],
  };
}

// A direct comparison between the complete ticket sum and the complete draw
// sum is one of the smallest rules the DSL can express. Keep the grammar tight:
// the comparison must connect the two complete sources directly, and a separate
// AND/OR clause is left to a compound parser or to the provider. That prevents a
// clear first clause from silently swallowing an unsupported second condition.
function parseDirectSumComparisonRule(text: string): PredicateNode | null {
  if (/\b(?:and|or|e|ou)\b/iu.test(text)) {
    return null;
  }

  const english = text.match(
    /\b(?:(?:sum|total(?:\s+sum)?)\s+of\s+(?:(?:the\s+)?(?:guess|ticket)(?:'s)?|(?:the\s+)?(?:guessed|picked)|your|my|its)(?:\s+(?:six|6))?\s+numbers?|(?:(?:your|my)\s+)?(?:guess|ticket|guessed|picked)(?:'s)?\s+(?:total\s+sum|sum|total)|its\s+(?:total\s+sum|sum|total))\s+(?:is|be|are)\s+(?:strictly\s+)?(greater|higher|above|more|bigger|larger|lower|less|below|smaller)(?:\s+than)?\s+(?:(?:the\s+)?(?:sum|total(?:\s+sum)?)\s+of\s+(?:the\s+)?(?:official\s+)?(?:draw|drawn)(?:'s)?(?:\s+(?:six|6))?\s+numbers?|(?:the\s+)?(?:official\s+)?(?:draw|drawn)(?:'s)?\s+(?:total\s+sum|sum|total))\b/iu,
  );
  const portuguese = text.match(
    /\b(?:a\s+)?soma(?:\s+total)?\s+d(?:os|as)\s+(?:seus?|suas?|meus?|minhas?)\s+(?:(?:seis|6)\s+)?numeros?\s+(?:e|for|seja)\s+(?:estritamente\s+)?(maior|superior|menor|inferior)(?:\s+(?:que|do\s+que))?\s+(?:a\s+)?soma(?:\s+total)?\s+d(?:os|as)\s+(?:(?:seis|6)\s+)?numeros?\s+d(?:o|a)\s+sorteio(?:\s+oficial)?\b/iu,
  );
  const comparison = english?.[1] ?? portuguese?.[1];
  const op = comparison ? parseComparisonWord(comparison) : null;
  return op ? compare(sum(source("guess")), op, sum(source("draw"))) : null;
}

function parseDefinedDivisionRule(text: string): PredicateNode | null {
  const match = text.match(
    /\bguessed?\s+sum\b.{0,40}\bdivided\s+by\b.{0,80}\b(?:the\s+)?number\s+of\s+even\s+drawn\s+numbers?\b.{0,80}\b(equal|equals|=)\s+([0-9]+)\b/i,
  );
  const value = match?.[2] ? Number(match[2]) : NaN;
  if (!Number.isInteger(value)) {
    return null;
  }
  const evenDrawCount = count(filterMod(source("draw"), 2, 0));
  return {
    kind: "and",
    clauses: [
      compare(evenDrawCount, "gt", lit(0)),
      compare(
        arith("div", sum(source("guess")), evenDrawCount),
        "eq",
        lit(value),
      ),
    ],
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
    /\b(guessed?|picked)\s+position\s*1\b.{0,80}\bdrawn?\s+position\s*6\b/i.test(
      text,
    ) &&
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

  // "Flip the draw around ...; all six reversed positions should match."
  if (
    /\ball\s+(six|6)\b.{0,40}\breversed?\s+(positions?|slots?)\b.{0,40}\b(match|matches|line up)\b/i.test(
      text,
    )
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
    /\b(smallest|lowest|largest|highest)\s+(?:guessed?|picked|ticket|your)?\s*(?:number|pick)\b.{0,30}\b(equal|equals|same|matches?|greater|higher|above|more|bigger|larger|beats?|exceeds?|lower|less|below|smaller)\b.{0,40}\b(smallest|lowest|largest|highest)\s+(?:drawn?|draw)\s+number\b/i,
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

// Qualifiers this parser does not model. "At least four numbers are within 3 of
// the drawn number in the same position" is NOT "at least four numbers appear in
// the draw" — dropping the qualifier silently produces a reference AST that says
// something the player did not, which then either mis-compiles the rule or (as
// the reviewer) rejects a correct one. Returning null is the honest answer: no
// deterministic reading exists for this shape.
const UNMODELLED_MATCH_QUALIFIERS = [
  /\b(?:within|no maximo a|a ate)\s+\d+\b/iu,
  /\b(?:same|matching)\s+(?:position|slot|place)\b/iu,
  /\bmesma\s+posicao\b/iu,
  /\bposition\s+by\s+position\b/iu,
  // "at least one drawn number IS ABOVE 50" counts numbers passing a threshold;
  // it is not an overlap between guess and draw. Without this the threshold cue
  // plus the bare word "drawn" was enough to compile "contains 13 and at least
  // one drawn number is above 50" down to `match_count_at_least 1`, dropping
  // both stated conditions.
  //
  // The gap before the comparison verb is deliberate: the dealer's normalized
  // wording moves the source into a prepositional phrase ("at least one number
  // IN THE OFFICIAL DRAW is greater than 50"). It cannot cross a clause
  // boundary, so it never reaches the comparison of a following clause.
  new RegExp(
    `\\b(?:at least|at most|no more than|no fewer than|exactly|pelo menos|ao menos|no minimo|exatamente)\\s+${MATCH_COUNT_NUMBER_0_TO_6}\\s+(?:of\\s+(?:the|its|my|your)\\s+)?(?:drawn|guessed?|picked|ticket)?\\s*(?:numbers?|numeros?)\\b[^.,;:]{0,32}?\\b(?:is|are|be|sao|e)\\s+(?:above|below|over|under|greater|higher|lower|less|smaller|bigger|acima|abaixo|maior|menor)\\b`,
    "iu",
  ),
];

// A positive overlap threshold and a threshold over misses are logical
// opposites. Broad count patterns used to notice only the number and the word
// "appear/match", so "at least three do NOT appear" was frozen as "at least
// three appear". Decline every negative/absence form here and let the
// schema-constrained provider path compile its full meaning; no deterministic
// artifact is safer than one with inverted polarity.
const NEGATED_MATCH_RELATION_PATTERNS = [
  new RegExp(
    `\\b(?:(?:do|does|did|is|are|was|were|must|should|would|can|could)\\s+)?not\\b[^.;:]{0,32}\\b(?:${MATCH_COUNT_ACTION})\\b`,
    "iu",
  ),
  new RegExp(`\\bnao\\b[^.;:]{0,32}\\b(?:${MATCH_COUNT_ACTION})\\b`, "iu"),
  /\b(?:fail(?:s|ed)?\s+to\s+(?:match|appear)|unmatched|non[ -]?matching|miss(?:es|ed|ing)?|missing|absent|outside|wrong|incorrect|errad\w*|erros?|ausent\w*|fora)\b/iu,
];

function hasNegatedMatchRelation(text: string): boolean {
  return hasPattern(text, NEGATED_MATCH_RELATION_PATTERNS);
}

function parseMatchCountRule(text: string) {
  if (
    hasPattern(text, UNMODELLED_MATCH_QUALIFIERS) ||
    hasNegatedMatchRelation(text)
  ) {
    return null;
  }
  return parseMatchCountThreshold(text);
}

function parseMatchCountThreshold(text: string) {
  // In "at least three times X", the number is a multiplier, not a count of
  // matching ticket values. The old look-ahead wandered up to 80 characters
  // until it found an unrelated "number" and silently changed multiplication
  // into `match_count_at_least`. Bind threshold parsing away from multiplicative
  // units; a genuine match count is handled by the remaining noun/action forms.
  if (
    new RegExp(
      `\\b${THRESHOLD_COUNT_CUE}\\s+${MATCH_COUNT_NUMBER_1_TO_6}\\s+(?:times?|vezes?)\\b`,
      "i",
    ).test(text)
  ) {
    return null;
  }
  // A threshold plus a generic source noun is not a match count. "At least one
  // drawn number" can introduce any predicate over the draw (even, above 50,
  // divisible by a pick, ...). Require either a semantic result noun (matches,
  // hits, overlaps, acertos) or an explicit relation after a generic number noun.
  // This keeps the parser phrase-scoped instead of letting it claim a fragment
  // from an unrelated compound/ranking rule.
  const semanticMatchCountNoun = "(?:matches|hits|overlaps?|acertos?)";
  const genericNumberNoun = "(?:numbers?|numeros?|dezenas?)";
  const matchAbsenceAction =
    "(?:absent|missing|unmatched|miss(?:es|ed|ing)?|do\\s+not\\s+(?:appear|match)|nao\\s+(?:aparec\\w*|coincid\\w*|acert\\w*))";
  const numericMatch = text.match(
    new RegExp(
      `\\b${THRESHOLD_COUNT_CUE}\\s+(${MATCH_COUNT_NUMBER_1_TO_6})\\b(?:[^.;:]{0,40}\\b${semanticMatchCountNoun}\\b|[^.;:]{0,40}\\b${genericNumberNoun}\\b[^.;:]{0,32}\\b(?:${MATCH_COUNT_ACTION}|${matchAbsenceAction})\\b|[^.;:]{0,40}\\b${MATCH_COUNT_ACTION}\\b)`,
      "i",
    ),
  );
  const verbThresholdMatch = text.match(
    new RegExp(
      `\\b${MATCH_COUNT_ACTION}\\b.{0,40}\\b${THRESHOLD_COUNT_CUE}\\s+(${MATCH_COUNT_NUMBER_1_TO_6})\\b.{0,40}\\b${MATCH_COUNT_NOUN}\\b`,
      "i",
    ),
  );
  const orMoreMatch = text.match(
    new RegExp(
      `\\b(${MATCH_COUNT_NUMBER_1_TO_6})\\s+(?:or more|ou mais)\\b.{0,80}\\b(?:${MATCH_COUNT_NOUN}|${MATCH_COUNT_ACTION})\\b`,
      "i",
    ),
  );
  const verbOrMoreMatch = text.match(
    new RegExp(
      `\\b${MATCH_COUNT_ACTION}\\b.{0,40}\\b(${MATCH_COUNT_NUMBER_1_TO_6})\\s+(?:or more|ou mais)\\b.{0,40}\\b${MATCH_COUNT_NOUN}\\b`,
      "i",
    ),
  );
  const verbCountMatch = text.match(
    new RegExp(
      `\\b${MATCH_COUNT_ACTION}\\b.{0,40}\\b(${MATCH_COUNT_NUMBER_1_TO_6})\\b.{0,35}\\b${MATCH_COUNT_NOUN}\\b`,
      "i",
    ),
  );
  const haveCountMatch = text.match(
    new RegExp(
      `\\b(?:with|has|have|having|contains?|contain|com|ter|tiver|tenha|precisa(?:r)?\\s+de|vale\\s+com)\\b.{0,20}\\b(${MATCH_COUNT_NUMBER_1_TO_6})\\b.{0,35}\\b${MATCH_COUNT_NOUN}\\b`,
      "i",
    ),
  );
  // "seis numeros certos", "four numbers correct" — a count qualified by an
  // explicit correctness adjective.
  //
  // This must NOT accept a generic match action. Every guess and every draw has
  // exactly six numbers, so the cardinality phrase "its six numbers" appears in
  // rules that are not about match counts at all; with a generic action in the
  // third group, "none of its six numbers appear in the draw" and "the sum of
  // its six numbers equals the sum of the six drawn numbers" both matched here
  // and compiled to `match_count_at_least 6` — the first one being the exact
  // logical inverse of what the player wrote. Generic phrasings are already
  // covered by numericMatch / verbThresholdMatch / verbCountMatch /
  // directMatch / compactMatch, each of which binds the number to the matching
  // verb far more tightly than this pattern can.
  const adjectiveCountMatch = text.match(
    new RegExp(
      `\\b(${MATCH_COUNT_NUMBER_1_TO_6})\\b.{0,25}\\b(?:${MATCH_COUNT_NOUN}|bilhete|palpite)\\b.{0,35}\\b(?:certos?|corretos?|acertados?|correct|right)\\b`,
      "i",
    ),
  );
  const nounOnlyCountMatch = text.match(
    new RegExp(`\\b(${MATCH_COUNT_NUMBER_1_TO_6})\\b\\s+acertos?\\b`, "i"),
  );
  const directMatch = text.match(
    /\b([1-6]|one|two|three|four|five|six)\b.{0,30}\b(picks?|guessed?|ticket|my|your)\b.{0,60}\b(show up|appear|appears|match|matches|hits?)\b/i,
  );
  const compactMatch = text.match(/\b([1-6])\s+numbers?\s+(match|appear)\b/i);
  const rawValue =
    numericMatch?.[1] ??
    verbThresholdMatch?.[1] ??
    orMoreMatch?.[1] ??
    verbOrMoreMatch?.[1] ??
    verbCountMatch?.[1] ??
    haveCountMatch?.[1] ??
    adjectiveCountMatch?.[1] ??
    nounOnlyCountMatch?.[1] ??
    directMatch?.[1] ??
    compactMatch?.[1] ??
    null;
  if (!rawValue) {
    return null;
  }

  const value = NUMBER_WORDS.get(rawValue.toLowerCase()) ?? Number(rawValue);
  return Number.isInteger(value) && value >= 1 && value <= 6 ? value : null;
}

interface MatchCountSemanticFingerprint {
  comparison: "at_least" | "exact";
  negated: boolean;
  threshold: number;
}

const MATCH_COUNT_DOMAIN_SIZE = 6;

function matchCountFingerprintResult(
  fingerprint: MatchCountSemanticFingerprint,
  overlapCount: number,
): boolean {
  const counted = fingerprint.negated
    ? MATCH_COUNT_DOMAIN_SIZE - overlapCount
    : overlapCount;
  return fingerprint.comparison === "exact"
    ? counted === fingerprint.threshold
    : counted >= fingerprint.threshold;
}

function matchCountFingerprintsDiffer(
  left: MatchCountSemanticFingerprint,
  right: MatchCountSemanticFingerprint,
): boolean {
  for (let overlap = 0; overlap <= MATCH_COUNT_DOMAIN_SIZE; overlap += 1) {
    if (
      matchCountFingerprintResult(left, overlap) !==
      matchCountFingerprintResult(right, overlap)
    ) {
      return true;
    }
  }
  return false;
}

// This fingerprint is never sufficient to prove equivalence; its job is only
// to prove a material contradiction before a probabilistic reviewer is asked.
// The complete canonical AST remains the sole deterministic proof of equality.
function extractMatchCountSemanticFingerprint(
  text: string,
): MatchCountSemanticFingerprint | null {
  if (hasPattern(text, UNMODELLED_MATCH_QUALIFIERS)) {
    return null;
  }
  const exact = parseExactMatchCountThreshold(text);
  if (exact !== null) {
    return {
      comparison: "exact",
      negated: hasNegatedMatchRelation(text),
      threshold: exact,
    };
  }
  const threshold = parseMatchCountThreshold(text);
  return threshold === null
    ? null
    : {
        comparison: "at_least",
        negated: hasNegatedMatchRelation(text),
        threshold,
      };
}

// Total node count budget for a compiled rule. Raised from 64 to 100 because a
// rule naming a four-number set on both sides expands to ~8 `contains` subtrees
// (the DSL has no set literal, so each value is its own node) and measured 65-80
// nodes — rejected as COMPLEXITY_EXCEEDED while being an ordinary rule. Depth
// (MAX_AST_DEPTH) and binder nesting (MAX_V3_BINDER_DEPTH) are what bound
// worst-case evaluation; node count is linear, so this stays within the sandbox.
const MAX_COMPLEXITY = 100;

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

// Reviewer agreement (PRD §7.4): the deterministic reviewer AST and the
// provider AST match when they are structurally equivalent (fast path, v1/v2
// signatures) OR sampled-semantically equivalent. The semantic check makes
// novel v3 compositions reviewable: a v2 reviewer macro and its v3 desugaring
// have different shapes but identical behavior, so structural signatures alone
// would flag every legitimate composition as a mismatch.
function usesOnlyCurrentElementAndLiterals(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every(usesOnlyCurrentElementAndLiterals);
  }
  if (!value || typeof value !== "object") {
    return true;
  }
  const node = value as Record<string, unknown>;
  if (node.kind === "elem") {
    return node.up === undefined || node.up === 0;
  }
  if (
    node.kind === "source" ||
    node.kind === "pair" ||
    node.kind === "forall" ||
    node.kind === "exists" ||
    node.kind === "pairs_forall" ||
    node.kind === "pairs_exists" ||
    node.kind === "contains" ||
    node.kind === "reduce" ||
    node.kind === "at"
  ) {
    return false;
  }
  return Object.values(node).every(usesOnlyCurrentElementAndLiterals);
}

function directForallIsProvablyTrue(clause: PredicateNodeV3): boolean {
  if (clause.kind !== "forall" || clause.of.kind !== "source") {
    return false;
  }
  if (!usesOnlyCurrentElementAndLiterals(clause.where)) {
    return false;
  }
  const standalone = ruleAstSchema.safeParse({
    schemaVersion: 3,
    result: { predicate: clause, type: "predicate" },
  });
  if (!standalone.success) {
    return false;
  }
  const domainTickets: number[][] = [];
  for (let first = 1; first <= 100; first += 6) {
    const ticket: number[] = [];
    for (let offset = 0; ticket.length < 6; offset += 1) {
      const value = ((first + offset - 1) % 100) + 1;
      if (!ticket.includes(value)) {
        ticket.push(value);
      }
    }
    domainTickets.push(ticket);
  }
  return domainTickets.every(
    (ticket) =>
      evaluatePredicate(standalone.data, { draw: ticket, guess: ticket })
        .result === "WIN",
  );
}

/**
 * Proves a narrow but important no-op: a top-level conjunct that universally
 * quantifies a source while its body is true for every integer in [1, 100].
 * The proof is exhaustive over the finite element domain and deliberately does
 * not generalize from random samples.
 */
export function hasProvablyVacuousCondition(ast: RuleAst): boolean {
  if (
    ast.schemaVersion !== 3 ||
    ast.result.type !== "predicate" ||
    ast.result.predicate.kind !== "and" ||
    ast.result.predicate.clauses.length < 2
  ) {
    return false;
  }
  return ast.result.predicate.clauses.some(directForallIsProvablyTrue);
}

function knownAstSemanticsMatch(expected: RuleAst, actual: RuleAst) {
  if (
    expected.schemaVersion !== 3 &&
    actual.schemaVersion !== 3 &&
    knownAstSignature(expected) === knownAstSignature(actual)
  ) {
    return true;
  }
  return sampledSemanticsMatch(expected, actual);
}

// Deterministic Monte-Carlo semantic equivalence: both ASTs must agree on every
// sampled (guess, draw) pair. Seeded PRNG (mulberry32, same family as the test
// harness) so the reviewer verdict is reproducible and auditable.
const SEMANTIC_MATCH_SAMPLES = 240;

/** The optimisation direction of a ranking rule, or null for a predicate. */
function rankingDirection(ast: RuleAst): "max" | "min" | null {
  return ast.schemaVersion !== 1 && ast.result.type === "ranking"
    ? ast.result.direction
    : null;
}

function semanticSampleInputs() {
  let seed = 0x1dea1e7 >>> 0;
  const rng = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let value = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
  const sixUnique = () => {
    const pool = new Set<number>();
    while (pool.size < 6) {
      pool.add(1 + Math.floor(rng() * 100));
    }
    return [...pool];
  };
  return [
    ...structuredInputPairs().map((pair) => ({
      draw: [...pair.draw],
      guess: [...pair.guess],
    })),
    ...Array.from({ length: SEMANTIC_MATCH_SAMPLES }, () => ({
      draw: sixUnique(),
      guess: sixUnique(),
    })),
  ];
}

function sameWinnerSet(left: ReadonlySet<number>, right: ReadonlySet<number>) {
  return (
    left.size === right.size && [...left].every((winner) => right.has(winner))
  );
}

function evaluateRankingCohort(
  ast: RuleAst,
  draw: readonly number[],
  guesses: readonly (readonly number[])[],
) {
  const evaluations = guesses.map((guess) =>
    evaluateRankingEntry(ast, { draw: [...draw], guess: [...guess] }),
  );
  const direction = rankingDirection(ast);
  if (!direction) {
    throw new Error("NOT_A_RANKING_RULE");
  }
  const winners = resolveRankingWinners(
    evaluations.map((evaluation, player) => ({
      eligible: evaluation.eligible,
      player,
      score: evaluation.score,
    })),
    direction,
  );
  return { evaluations, winners };
}

function rankingSemanticCohorts(
  inputs: ReturnType<typeof semanticSampleInputs>,
) {
  // A ranking has no per-ticket WIN/LOSE meaning. Compare several tickets under
  // one draw, because only the induced winner set is observable. Rotations keep
  // order-sensitive rules exercised, while held-out guesses cover score ties
  // and non-linear transformations without relying on one reported fixture.
  return inputs.slice(0, 64).map((input, index) => ({
    draw: input.draw,
    guesses: [
      input.guess,
      input.draw,
      [...input.draw.slice(1), input.draw[0]!],
      [...input.draw].reverse(),
      inputs[(index + 17) % inputs.length]!.guess,
      inputs[(index + 41) % inputs.length]!.guess,
    ],
  }));
}

function sampledSemanticsMatch(expected: RuleAst, actual: RuleAst): boolean {
  const expectedRanking = isRankingRule(expected);
  if (expectedRanking !== isRankingRule(actual)) {
    return false;
  }
  // Uniform samples alone cannot separate two jackpot rules: both lose on every
  // sample, so the check certifies them equal. Turn 55's mis-compiled artifact
  // and a faithful compile of the same text disagree on ZERO of 240 uniform
  // samples and on the very first structured pair, so the structured battery is
  // what gives this check its discriminating power.
  const inputs = semanticSampleInputs();
  try {
    if (expectedRanking) {
      for (const cohort of rankingSemanticCohorts(inputs)) {
        const expectedCohort = evaluateRankingCohort(
          expected,
          cohort.draw,
          cohort.guesses,
        );
        const actualCohort = evaluateRankingCohort(
          actual,
          cohort.draw,
          cohort.guesses,
        );
        if (
          expectedCohort.evaluations.some(
            (evaluation, index) =>
              evaluation.eligible !==
              actualCohort.evaluations[index]?.eligible,
          ) ||
          !sameWinnerSet(expectedCohort.winners, actualCohort.winners)
        ) {
          return false;
        }
      }
    } else {
      for (const input of inputs) {
        if (
        evaluatePredicate(expected, input).result !==
        evaluatePredicate(actual, input).result
        ) {
          return false;
        }
      }
    }
    return true;
  } catch {
    // A runtime error on either side means they cannot be certified equal.
    return false;
  }
}

function findSemanticDisagreementWitness(
  expected: RuleAst,
  actual: RuleAst,
): RuleSemanticDisagreementWitness | null {
  const expectedRanking = isRankingRule(expected);
  if (expectedRanking !== isRankingRule(actual)) {
    return null;
  }
  const inputs = semanticSampleInputs();

  try {
    if (expectedRanking) {
      for (const cohort of rankingSemanticCohorts(inputs)) {
        const reviewer = evaluateRankingCohort(
          expected,
          cohort.draw,
          cohort.guesses,
        );
        const draft = evaluateRankingCohort(
          actual,
          cohort.draw,
          cohort.guesses,
        );
        const differingIndex = cohort.guesses.findIndex(
          (_guess, index) =>
            reviewer.evaluations[index]?.eligible !==
              draft.evaluations[index]?.eligible ||
            reviewer.winners.has(index) !== draft.winners.has(index),
        );
        if (differingIndex >= 0) {
          const format = (
            result: (typeof reviewer.evaluations)[number],
            winner: boolean,
          ) =>
            JSON.stringify({
              eligible: result.eligible,
              score: result.score,
              winner,
            });
          return {
            draftResult: format(
              draft.evaluations[differingIndex]!,
              draft.winners.has(differingIndex),
            ),
            draw: cohort.draw,
            guess: [...cohort.guesses[differingIndex]!],
            reviewerResult: format(
              reviewer.evaluations[differingIndex]!,
              reviewer.winners.has(differingIndex),
            ),
          };
        }
      }
    } else {
      for (const input of inputs) {
        const reviewerResult = evaluatePredicate(expected, input).result;
        const draftResult = evaluatePredicate(actual, input).result;
        if (reviewerResult !== draftResult) {
          return {
            draftResult,
            draw: input.draw,
            guess: input.guess,
            reviewerResult,
          };
        }
      }
    }
  } catch {
    return null;
  }
  return null;
}

function describeSemanticDisagreement(
  expected: RuleAst,
  actual: RuleAst,
  witness = findSemanticDisagreementWitness(expected, actual),
) {
  const expectedRanking = isRankingRule(expected);
  if (expectedRanking !== isRankingRule(actual)) {
    return `The independent reviewer compiled a ${expectedRanking ? "ranking" : "predicate"}, while the draft compiled a ${isRankingRule(actual) ? "ranking" : "predicate"}.`;
  }
  if (
    expectedRanking &&
    rankingDirection(expected) !== rankingDirection(actual)
  ) {
    return `The independent reviewer selected ranking direction ${rankingDirection(expected)}, while the draft selected ${rankingDirection(actual)}.`;
  }
  if (witness) {
    return `The independent reviewer and draft disagree for guess ${JSON.stringify(witness.guess)} and draw ${JSON.stringify(witness.draw)}: reviewer=${witness.reviewerResult}, draft=${witness.draftResult}.`;
  }
  return "The independent reviewer AST and draft could not be compared safely at runtime.";
}

function knownAstSignature(
  ast: Exclude<RuleAst, { schemaVersion: 3 }>,
): string {
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

function deterministicAstSignature(ast: RuleAst): string {
  // v1/v2 have a semantic signature that canonicalizes commutative operations
  // and legacy macros. v3 exact structural identity is still safe evidence of
  // equivalence; algebraically different v3 trees deliberately remain unknown.
  return ast.schemaVersion === 3
    ? `v3:${JSON.stringify(ast)}`
    : knownAstSignature(ast);
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
      const sides = [
        arraySignature(node.left),
        arraySignature(node.right),
      ].sort();
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
    case "ordered_position_compare_count_eq":
      return `ordered_position_compare_count_eq:${node.value}:${node.op}:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "value_within_any_count_at_least":
      return `value_within_any_count_at_least:${node.value}:${node.distance}:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "digit_match_count_at_least":
      return `digit_match_count_at_least:${node.value}:${node.place}:${arraySignature(node.left)}:${arraySignature(node.right)}`;
    case "all_values_between_min_max":
      return `all_values_between_min_max:${arraySignature(node.of)}:${arraySignature(node.range)}`;
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
  divergentReadingCount: number,
) {
  // Which of the two the divergence actually is decides who can fix it, so the
  // summary must not merge them. Several distinct readings of one sentence is a
  // question for the player; anything else (one provider answered, or the ones
  // that did produced nothing comparable) is a compiler-side fault they cannot
  // act on, and telling them to reword it would be a dead end.
  if (providerDisagreement && divergentReadingCount >= 2) {
    return `Rule rejected: this wording has ${divergentReadingCount} different executable readings, so which guesses win is not yet decided. Pick the reading you meant, or restate the condition so only one reading is possible.`;
  }
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
  // These carry a concrete, player-actionable cause, so state it instead of
  // printing the raw code. Each cause gets its own sentence: "restate the
  // condition" is the remedy for a dropped literal and for nothing else.
  if (blockingReasons.includes("INTERPRETATION_MISMATCH")) {
    return "Rule rejected: the compiled rule dropped a numeric condition from the wording, so it would not pay what the rule promises. Restate the condition explicitly.";
  }
  if (blockingReasons.includes("PROVIDER_SPAN_COVERAGE_INCOMPLETE")) {
    return "Rule rejected: part of the wording was never accounted for by the compiler, so a condition may be missing from the executable rule. Split the rule into separate explicit clauses.";
  }
  if (blockingReasons.includes("PROVIDER_EVIDENCE_UNVERIFIED")) {
    return "Rule rejected: the compiler could not prove its own reading — its worked examples disagreed with the rule it produced. Nothing is wrong with the numbers you wrote; retry, or state the winning condition as one sentence.";
  }
  if (blockingReasons.includes("DIFFICULTY_IMPOSSIBLE")) {
    return "Rule rejected: no guess can win under this rule, so it cannot distinguish winners from losers.";
  }
  if (blockingReasons.includes("DIFFICULTY_ALWAYS_TRUE")) {
    return "Rule rejected: every guess wins under this rule, so it cannot distinguish winners from losers.";
  }
  if (blockingReasons.includes("VACUOUS_CONDITION")) {
    return "Rule rejected: the compiler emitted a condition that is true for every value in its finite domain, so it does not enforce that part of the player's rule. Retry the same rule; the wording is not the cause.";
  }
  return "Rule rejected because validation found a blocking safety, fidelity, or runtime issue. Review the structured reason explanations before revising the rule.";
}
