export type CompilerConfidenceAction = "ACCEPT" | "ESCALATE" | "REJECT";
export type AgentProviderPriority = "primary" | "secondary" | "tertiary";
export type AgentProviderRequestShape =
  | "deterministic_json_schema"
  | "ollama_format"
  | "openai_response_format";
export type AgentProviderRole =
  | "compile"
  | "explain"
  | "interpret"
  | "normalize"
  | "review";
export type AgentProviderAttemptStatus =
  | "accepted"
  | "escalated"
  | "malformed_response"
  | "provider_disagreement"
  | "rejected"
  | "schema_validation_failed"
  | "timeout";

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

export interface AgentProviderCapabilityFlags {
  grammar_constrained_decoding: boolean;
  json_schema_response: boolean;
  local: boolean;
  openai_compatible: boolean;
  supports_ollama_format: boolean;
}

export interface AgentModelIdentity {
  digest: string | null;
  model: string;
  provider: string;
  quantization: string | null;
  serving_engine: string;
}

export interface AgentProviderConfig {
  base_url: string | null;
  capabilities: AgentProviderCapabilityFlags;
  identity: AgentModelIdentity;
  model_by_role: Partial<Record<AgentProviderRole, string>>;
  priority: AgentProviderPriority;
  request_shape: AgentProviderRequestShape;
  timeout_ms: number;
}

export interface AgentProviderAttemptLog {
  capability_flags: AgentProviderCapabilityFlags;
  confidence_action: CompilerConfidenceAction;
  decision: "INVALID" | "VALID";
  final_confidence: number;
  model_identity: AgentModelIdentity;
  priority: AgentProviderPriority;
  provider: string;
  request_shape: AgentProviderRequestShape;
  /**
   * Why the emitted AST failed schema validation (first issues, as
   * `path: message`), or null when the schema was not the problem. Without this
   * SCHEMA_INVALID is a dead end for an operator: the rule is blocked and the
   * response that caused it is discarded.
   */
  schema_error?: string | null;
  status: AgentProviderAttemptStatus;
}

export interface AgentProviderRoutingPolicy {
  providers: readonly AgentProviderConfig[];
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

const DEFAULT_LOCAL_BASE_URL = "http://localhost:11434/v1";
const DEFAULT_TIMEOUT_MS = 12_000;

function firstNonBlank(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim())?.trim() ?? "";
}

export function createDefaultProviderRoutingPolicy(
  env: Record<string, string | undefined> = process.env,
): AgentProviderRoutingPolicy {
  const primaryProvider =
    env.LLM_PRIMARY_PROVIDER ??
    (env.LLM_MODE === "cloud" ? "openai" : "local-openai-compatible");
  // The primary slot describes the ARTIFACT EMITTER — its model already prefers
  // LLM_MODEL_COMPILE — so its endpoint must be the compile endpoint too.
  // Otherwise the capability flags recorded in the artifact describe a provider
  // that never ran the compile call, and the compiler gates on those flags.
  const primaryBaseUrl = firstNonBlank(
    env.LLM_COMPILE_BASE_URL,
    env.LLM_PRIMARY_BASE_URL,
    env.LLM_BASE_URL,
    DEFAULT_LOCAL_BASE_URL,
  );
  const primaryModel = firstNonBlank(
    env.LLM_MODEL_COMPILE,
    env.LLM_PRIMARY_MODEL,
    env.LLM_MODEL,
    "qwen2.5:14b-instruct-q4_K_M",
  );

  return {
    providers: [
      createProviderConfig({
        base_url: primaryBaseUrl,
        digest: env.LLM_PRIMARY_MODEL_DIGEST ?? null,
        local: env.LLM_MODE !== "cloud",
        model: primaryModel,
        priority: "primary",
        provider: primaryProvider,
        quantization:
          env.LLM_PRIMARY_MODEL_QUANTIZATION ?? inferQuantization(primaryModel),
        // Inferred from the endpoint actually used, so an explicit
        // LLM_PRIMARY_SERVING_ENGINE cannot mislabel a redirected compile role.
        serving_engine: inferServingEngine(primaryBaseUrl),
      }),
      createProviderConfig({
        base_url: env.LLM_SECONDARY_BASE_URL ?? null,
        digest: env.LLM_SECONDARY_MODEL_DIGEST ?? null,
        local: env.LLM_SECONDARY_LOCAL === "true",
        model: env.LLM_SECONDARY_MODEL ?? "gpt-4.1-mini",
        priority: "secondary",
        provider: env.LLM_SECONDARY_PROVIDER ?? "openai",
        quantization: env.LLM_SECONDARY_MODEL_QUANTIZATION ?? null,
        serving_engine: env.LLM_SECONDARY_SERVING_ENGINE ?? "openai",
      }),
      createProviderConfig({
        base_url: env.LLM_TERTIARY_BASE_URL ?? null,
        digest: env.LLM_TERTIARY_MODEL_DIGEST ?? null,
        local: env.LLM_TERTIARY_LOCAL === "true",
        model: env.LLM_TERTIARY_MODEL ?? "claude-3-5-sonnet",
        priority: "tertiary",
        provider: env.LLM_TERTIARY_PROVIDER ?? "anthropic",
        quantization: env.LLM_TERTIARY_MODEL_QUANTIZATION ?? null,
        serving_engine: env.LLM_TERTIARY_SERVING_ENGINE ?? "anthropic",
      }),
    ],
  };
}

export function createLocalOnlyProviderRoutingPolicy(
  base_url = DEFAULT_LOCAL_BASE_URL,
  models: Partial<Record<AgentProviderPriority, string>> = {},
): AgentProviderRoutingPolicy {
  return {
    providers: [
      createProviderConfig({
        base_url,
        digest: null,
        local: true,
        model: models.primary ?? "qwen2.5:14b-instruct-q4_K_M",
        priority: "primary",
        provider: "local-primary",
        quantization: inferQuantization(
          models.primary ?? "qwen2.5:14b-instruct-q4_K_M",
        ),
        serving_engine: inferServingEngine(base_url),
      }),
      createProviderConfig({
        base_url,
        digest: null,
        local: true,
        model: models.secondary ?? "llama3.2:latest",
        priority: "secondary",
        provider: "local-secondary",
        quantization: inferQuantization(models.secondary ?? "llama3.2:latest"),
        serving_engine: inferServingEngine(base_url),
      }),
      createProviderConfig({
        base_url,
        digest: null,
        local: true,
        model: models.tertiary ?? "gemma2:9b",
        priority: "tertiary",
        provider: "local-tertiary",
        quantization: inferQuantization(models.tertiary ?? "gemma2:9b"),
        serving_engine: inferServingEngine(base_url),
      }),
    ],
  };
}

export function calculateCompilerConfidence(
  input: CompilerConfidenceInputs,
  weights: CompilerConfidenceWeights = COMPILER_CONFIDENCE_WEIGHTS,
): CompilerConfidenceBreakdown {
  const compiler_confidence = clampConfidence(input.compiler_confidence);
  const model_confidence = clampConfidence(input.model_confidence);
  const reviewer_agreement_score = clampConfidence(
    input.reviewer_agreement_score,
  );
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

function createProviderConfig(input: {
  base_url: string | null;
  digest: string | null;
  local: boolean;
  model: string;
  priority: AgentProviderPriority;
  provider: string;
  quantization: string | null;
  serving_engine: string;
}): AgentProviderConfig {
  const request_shape = selectRequestShape(input);
  // Never advertise a capability the transport cannot actually enforce:
  // artifact audit metadata must describe the decoder used, not the desired
  // decoder. The compiler permits only local Ollama and OpenAI's known API
  // endpoint until another compatible endpoint has an explicit capability.
  const supportsSchemaConstrainedDecoding = supportsJsonSchemaDecoding(
    input,
    request_shape,
  );
  return {
    base_url: input.base_url,
    capabilities: {
      grammar_constrained_decoding: supportsSchemaConstrainedDecoding,
      json_schema_response: supportsSchemaConstrainedDecoding,
      local: input.local,
      openai_compatible: input.base_url !== null || input.provider === "openai",
      supports_ollama_format: request_shape === "ollama_format",
    },
    identity: {
      digest: input.digest,
      model: input.model,
      provider: input.provider,
      quantization: input.quantization,
      serving_engine: input.serving_engine,
    },
    model_by_role: {
      compile: input.model,
      explain: input.model,
      interpret: input.model,
      normalize: input.model,
      review: input.model,
    },
    priority: input.priority,
    request_shape,
    timeout_ms: DEFAULT_TIMEOUT_MS,
  };
}

const GROQ_HOSTNAME = "api.groq.com";
const OPENROUTER_HOSTNAME = "openrouter.ai";

function supportsJsonSchemaDecoding(
  input: {
    base_url: string | null;
    model: string;
  },
  requestShape: AgentProviderRequestShape,
): boolean {
  const model = input.model.trim();
  if (/:cloud$/iu.test(model)) {
    return false;
  }
  // OpenRouter's router slugs (`openrouter/free`, `openrouter/auto`) select a
  // different backend per request, so the slug attests to no decoder at all.
  // `openrouter/free` produced 0 of 4 parseable candidates against the real
  // schema, one of those a hard 404 from `require_parameters`.
  if (/^openrouter\//iu.test(model)) {
    return false;
  }
  // This shape is the compiler's in-process deterministic provider. It emits
  // only schema-valid values and does not represent an unverified network
  // endpoint, so it remains a valid capability in offline evaluation/tests.
  if (requestShape === "deterministic_json_schema") {
    return true;
  }
  if (input.base_url === null) {
    return false;
  }
  try {
    const endpoint = new URL(input.base_url);
    const hostname = endpoint.hostname.toLowerCase();
    if (hostname === OPENROUTER_HOSTNAME) {
      // Requests carry `provider: { require_parameters: true }`, so OpenRouter
      // routes only to backends that honour the requested structured output.
      // Verified emitting a schema-valid AST for the real candidate schema.
      return true;
    }
    if (hostname === GROQ_HOSTNAME) {
      // Groq's strict mode does not survive this compiler's schema: the real
      // candidate schema (8288 bytes, 3 `definitions`) makes every Groq model
      // hang ~33 s and drop the connection, while a flat schema answers in
      // ~0.6 s. The artifact records the decoder that was actually used, so
      // this stays false rather than claiming a guarantee the provider cannot
      // deliver for the schema in question.
      return false;
    }
    return endpoint.port === "11434" || hostname === "api.openai.com";
  } catch {
    return false;
  }
}

function selectRequestShape(input: {
  base_url: string | null;
  local: boolean;
  provider: string;
  serving_engine: string;
}): AgentProviderRequestShape {
  const marker =
    `${input.base_url ?? ""} ${input.provider} ${input.serving_engine}`.toLowerCase();
  if (marker.includes("ollama") || marker.includes("11434")) {
    return "ollama_format";
  }
  if (input.local || input.base_url) {
    return "openai_response_format";
  }
  return "deterministic_json_schema";
}

function inferServingEngine(baseUrl: string | null) {
  if (baseUrl?.includes("11434")) {
    return "ollama";
  }
  // The artifact records which engine produced it, so a hosted provider is named
  // rather than filed under the generic compatible-endpoint label.
  if (baseUrl?.includes(GROQ_HOSTNAME)) {
    return "groq";
  }
  return baseUrl?.includes(OPENROUTER_HOSTNAME)
    ? "openrouter"
    : "openai-compatible";
}

function inferQuantization(model: string) {
  const quantization = model.match(/\bq[0-9]_[A-Za-z0-9_]+\b/i)?.[0] ?? null;
  return quantization;
}

function roundConfidence(value: number): number {
  return Number(value.toFixed(4));
}
