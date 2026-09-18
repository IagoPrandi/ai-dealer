import {
  buildRuleCompilerSkillPrompt,
  getDeterministicRuleCompilerPlan,
  getRuleCompilationCandidateJsonSchema,
  providerCompilationHasSchemaValidAst,
} from "@tyche/rule-compiler";
import {
  buildDealerChatPrompt,
  buildDealerInterpretPrompt,
} from "./promptSkills.js";
import {
  digestAiCallInput,
  readProviderUsage,
  recordAiCall,
  type AiUsageOutcome,
  type AiUsageStep,
} from "./usage.js";

// Real AI Rule Compiler bridge. Talks to an OpenAI-compatible chat-completions
// endpoint (local Ollama / vLLM / llama.cpp, or a cloud provider) so the dealer
// actually interprets and normalizes a proposed rule before it is submitted
// on-chain. There is intentionally NO silent template fallback: if the model is
// unreachable or returns an unusable response, this throws a typed error so the
// caller can surface it to the user instead of hiding the failure.

export interface RuleAgentInterpretation {
  addedOperationalClauses: string[];
  clarificationQuestions: string[];
  clarityNote: string;
  dealerMessage: string;
  needsClarification: boolean;
  normalizedText: string;
  officialInterpretation: string;
  suggestedRewrites: string[];
  title: string;
}

export interface RuleAgentConfig {
  apiKey: string;
  baseUrl: string;
  maxOutputTokens: number;
  model: string;
  seed: number;
  timeoutMs: number;
}

export type RuleAgentErrorCode =
  | "RULE_AGENT_BAD_RESPONSE"
  | "RULE_AGENT_NOT_CONFIGURED"
  | "RULE_AGENT_SCHEMA_UNSUPPORTED"
  | "RULE_AGENT_TIMEOUT"
  | "RULE_AGENT_UNAVAILABLE";

export class RuleAgentError extends Error {
  readonly code: RuleAgentErrorCode;

  /**
   * Operator-only context (e.g. the excerpt of a response that would not parse).
   * Never part of `message`, which reaches the player: a bad response is not the
   * player's fault and raw model output is not an explanation they can act on.
   */
  readonly detail: string | undefined;

  /**
   * The HTTP status that produced this error, when one did. `undefined` for a
   * timeout, an unreachable endpoint or an unusable body.
   *
   * `RULE_AGENT_UNAVAILABLE` covers both a transient outage and an endpoint that
   * refused the request on its tier, and only the status separates them: a 429
   * reaching here has already exhausted `RATE_LIMIT_MAX_ATTEMPTS`, so asking the
   * same endpoint again in the same run cannot succeed.
   */
  readonly status: number | undefined;

  constructor(
    code: RuleAgentErrorCode,
    message: string,
    detail?: string,
    status?: number,
  ) {
    super(message);
    this.name = "RuleAgentError";
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

// Local rule/guardian chains can take several minutes for a single proposal.
// Never let a stale environment value reduce the user-visible response window.
const MIN_TIMEOUT_MS = 300_000;
const DEFAULT_TIMEOUT_MS = MIN_TIMEOUT_MS;
// Reasoning models (minimax-m3, qwen3-thinking, ...) emit a hidden trace before
// the JSON answer and spend the output budget on it — and Ollama's cloud models
// ignore `reasoning_effort: "none"`, so the trace cannot be turned off. A long or
// ambiguous rule can reason for thousands of tokens, so a small ceiling cuts the
// response off before the JSON even starts. The budget must comfortably cover the
// trace plus the answer; it is an upper bound, so a non-reasoning model that stops
// at the closing brace never pays for it.
// The floor is low because a hosted provider can cap the budget from its side.
// Groq's on-demand tier enforces an output-tokens-per-minute limit and rejects a
// request UP FRONT when `max_tokens` implies more than the cap — measured on
// `qwen/qwen3.8-27b`, anything at or above 4096 is refused with HTTP 429 before
// the model runs, while 2048 answers in ~0.6 s. A floor above that would make
// the provider unusable, so the operator is allowed to configure the budget
// their tier actually permits. Too small a value is not hidden: the response is
// cut off and reported as the budget error it is.
const MIN_MAX_OUTPUT_TOKENS = 1_024;
const DEFAULT_MAX_OUTPUT_TOKENS = 16_384;
// Fixed seed + temperature 0 make the dealer deterministic: the same rule text
// always compiles to the same normalized rule, which the on-chain hashes depend
// on. Override with LLM_SEED only if you intentionally want a different anchor.
const DEFAULT_SEED = 7;

// Returns the first env var that is set AND non-blank. We deliberately do NOT
// use `??` here: optional overrides like LLM_MODEL_INTERPRET are commonly
// present but empty (`LLM_MODEL_INTERPRET=`), and `??` only falls through on
// null/undefined, so an empty override would shadow the real LLM_MODEL value.
function cleanEnvValue(value: string | undefined): string {
  return (value ?? "").replace(/\s+#.*$/u, "").trim();
}

function firstConfigured(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = cleanEnvValue(value);
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
}

/**
 * How much hidden reasoning a step asks for.
 *
 * - `suppressed` - every rule step. On models that honour it the trace is off.
 * - `low` - the conversational chat step. `gpt-oss` IGNORES `"none"` (Ollama
 *   documents that it accepts only `low`/`medium`/`high`), so `"none"` there
 *   buys nothing while `"low"` collapses the trace: measured 26 characters at
 *   `low` against 155 unset, which is the difference between a ~0.4 s and a
 *   multi-second answer.
 * - `full` - the compile re-ask, which needs the trace to get its JSON right.
 */
type ReasoningTrace = "full" | "low" | "suppressed";

interface AgentJsonSchemaConstraint {
  name: string;
  schema: unknown;
}

/**
 * Which vendor dialect an endpoint speaks on top of `/v1/chat/completions`.
 *
 * "OpenAI-compatible" only ever covered the happy path. The three dialects here
 * disagree on things that make a request fail outright rather than degrade:
 * Ollama accepts a non-standard `keep_alive` that Groq rejects with HTTP 400
 * (`property 'keep_alive' is unsupported`), and the hidden reasoning trace is
 * controlled by a different parameter on each.
 */
export type ProviderDialect =
  | "groq"
  | "ollama"
  | "openai-compatible"
  | "openrouter";

const GROQ_HOSTNAME = "api.groq.com";
const OPENROUTER_HOSTNAME = "openrouter.ai";

/**
 * Hosted endpoints whose credential is configured under its own name rather than
 * `LLM_API_KEY`. Each provider's secret then has exactly one home, which matters
 * once roles are split across endpoints: the key has to follow the endpoint, and
 * a second copy in `LLM_API_KEY` is a copy that can drift.
 */
const HOSTED_API_KEY_ENV: ReadonlyArray<{ envVar: string; hostname: string }> = [
  { envVar: "API_KEY_GROQ", hostname: GROQ_HOSTNAME },
  { envVar: "API_KEY_OPENROUTER", hostname: OPENROUTER_HOSTNAME },
];

function endpointHostname(baseUrl: string): null | string {
  try {
    return new URL(baseUrl).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function endpointPort(baseUrl: string): null | string {
  try {
    return new URL(baseUrl).port;
  } catch {
    return null;
  }
}

export function resolveProviderDialect(
  config: Pick<RuleAgentConfig, "apiKey" | "baseUrl">,
): ProviderDialect {
  const hostname = endpointHostname(config.baseUrl);
  if (hostname === GROQ_HOSTNAME) {
    return "groq";
  }
  if (hostname === OPENROUTER_HOSTNAME) {
    return "openrouter";
  }
  if (
    config.apiKey.toLowerCase() === "ollama" ||
    endpointPort(config.baseUrl) === "11434"
  ) {
    return "ollama";
  }
  return "openai-compatible";
}

/**
 * Groq model families differ in what `reasoning_effort` they accept: the Qwen
 * models take `none`, the gpt-oss family documents only `low`/`medium`/`high`
 * and errors on anything else. Sending an unsupported value is a hard 400, so
 * the floor is raised per family instead of hoping the server is lenient.
 */
function isGptOssFamily(model: string): boolean {
  return /gpt-oss/iu.test(model);
}

/**
 * True for OpenRouter's own router slugs (`openrouter/free`, `openrouter/auto`)
 * rather than a named model.
 *
 * A router picks the backend per request, so nothing about the backend can be
 * asserted from the slug: consecutive calls with the identical body were served
 * by `z-ai/glm-5.2:free`, `nex-agi/nex-n2.5-pro:free` and
 * `dots-studio/dots-3-note-preview:free`. Any request parameter that only some
 * backends accept therefore fails intermittently instead of never, which is the
 * harder failure to read in production.
 */
function isOpenRouterRouterSlug(model: string): boolean {
  return /^openrouter\//iu.test(model.trim());
}

/**
 * Compiler evidence must use decoder-enforced schemas. Ollama cloud models do
 * not implement structured outputs; unknown OpenAI-compatible endpoints are
 * also treated as unsupported until their capability is made explicit.
 */
export function supportsRuleCompilationSchema(
  config: RuleAgentConfig,
): boolean {
  const model = config.model.trim();
  if (/:cloud$/iu.test(model)) {
    return false;
  }
  // A router slug names no backend, so it can attest to no decoder. Measured on
  // `openrouter/free` against the real candidate schema (8274 bytes): 3 of 4
  // calls returned unparseable JSON (one of them 70905 characters long) and the
  // fourth was HTTP 404 "No endpoints found that can handle the requested
  // parameters" — `require_parameters` had filtered the free pool down to
  // nothing. The compile role must fail closed here rather than record a
  // schema-enforced artifact that no decoder enforced.
  if (isOpenRouterRouterSlug(model)) {
    return false;
  }
  const hostname = endpointHostname(config.baseUrl);
  if (hostname === null) {
    return false;
  }
  if (hostname === OPENROUTER_HOSTNAME) {
    // OpenRouter routes to whichever backend can honour the request, and
    // `transportControls` pins that with `require_parameters`, so the schema is
    // enforced by a backend that actually implements it. Verified against the
    // real candidate schema: `openai/gpt-oss-120b` and
    // `mistralai/mistral-small-24b-instruct-2501` both returned a schema-valid
    // AST. Backends still fail individually — `nvidia/nemotron-3-super-120b`
    // answers 502 every time — but that surfaces as a provider error the
    // compiler can retry or escalate, not as a silently unconstrained decode.
    return true;
  }
  if (hostname === GROQ_HOSTNAME) {
    // Groq documents strict constrained decoding, and it works on small
    // schemas — but NOT on the one this compiler actually emits. Measured
    // against the live API with `getRuleCompilationCandidateJsonSchema()`
    // (8288 bytes, 3 `definitions`): every call hangs ~33 s and dies with
    // "upstream connect error ... connection termination", 6/6 across
    // `qwen/qwen3.8-27b` and `openai/gpt-oss-120b`, while a flat schema on the
    // same models answers in ~0.6 s. Groq evidently cannot build the decoder
    // grammar for it. Removing `$schema` and dropping to `strict: false` change
    // nothing. Advertising the capability here would let the compile role pick
    // a provider that cannot emit the artifact, so the compile step fails
    // closed instead (RULE_AGENT_SCHEMA_UNSUPPORTED) and the operator points
    // `LLM_COMPILE_BASE_URL` at an endpoint that can — Ollama or OpenRouter.
    return false;
  }
  return endpointPort(config.baseUrl) === "11434" || hostname === "api.openai.com";
}

function openRouterUsageAccounting(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return cleanEnvValue(env.LLM_USAGE_ACCOUNTING).toLowerCase() !== "off";
}

/**
 * Records one transport call against the ambient measurement scope (./usage.ts).
 *
 * Every rule-pipeline request funnels through here, so the token, cost and
 * outcome accounting cannot drift from what was actually sent. Outside a
 * `captureAiRun` scope this is a counted no-op — see `unscopedCallCount`.
 *
 * `payload` is the parsed response body when there is one. A call that never got
 * a body (timeout, unreachable endpoint, HTTP error) is still recorded, with
 * `outcome: "error"` and null token counts: a failed call has a latency and a
 * cost of its own, and dropping it would make the failure look free.
 */
function recordTransportCall(args: {
  config: RuleAgentConfig;
  /**
   * The exact messages this request carried, in order, so a repeated call is
   * provable rather than inferred from its step name. Required: every call site
   * here builds the messages array itself, and an optional field would let the
   * next one silently opt out of the redundancy accounting.
   */
  inputParts: readonly string[];
  outcome: AiUsageOutcome;
  payload: unknown;
  /** When the interval being recorded began — the call, or one retried attempt. */
  startedAt: string;
  startedAtMs: number;
  step: AiUsageStep;
}): void {
  const usage = readProviderUsage(args.payload);
  recordAiCall({
    cachedPromptTokens: usage?.cachedPromptTokens ?? null,
    completionTokens: usage?.completionTokens ?? null,
    durationMs: performance.now() - args.startedAtMs,
    inputDigest: digestAiCallInput(args.inputParts),
    model: args.config.model,
    outcome: args.outcome,
    promptTokens: usage?.promptTokens ?? null,
    provider: resolveProviderDialect(args.config),
    providerCostUsd: usage?.costUsd ?? null,
    reasoningTokens: usage?.reasoningTokens ?? null,
    startedAt: args.startedAt,
    step: args.step,
    totalTokens: usage?.totalTokens ?? null,
  });
}

/**
 * The provider-specific request fragment: how the model is kept warm, and how
 * much hidden reasoning it may spend before answering.
 *
 * Rule steps suppress the trace, and only a compile RE-ASK restores it. The
 * compile step is the one that has to emit a large, exactly-nested JSON
 * structure, and on `nemotron-3-super:cloud` suppressing the trace measurably
 * breaks that structure: the same compile prompt returned a complete envelope
 * minus its final closing brace in 3 of 6 calls with the flag (~700 completion
 * tokens, `finish_reason: "stop"`, nowhere near the budget) and parsed 5 of 5
 * times without it (~2700 tokens). Since only structurally large rules hit that
 * wall, the first compile call keeps the saving and the retry buys the trace.
 */
function transportControls(
  config: RuleAgentConfig,
  trace: ReasoningTrace = "suppressed",
  // True when the request carries a JSON Schema the decoder must enforce. On a
  // router this changes what the request may ask for at all — see below.
  schemaConstrained = false,
): Record<string, unknown> {
  const dialect = resolveProviderDialect(config);

  if (dialect === "groq") {
    // `parsed` splits the trace into `message.reasoning` / `delta.reasoning`
    // instead of burying it in `<think>` tags inside the answer, which is what
    // lets the dealer chat show the reasoning as its own block.
    const controls: Record<string, unknown> = { reasoning_format: "parsed" };
    if (trace === "full") {
      return controls;
    }
    if (trace === "low") {
      controls.reasoning_effort = "low";
      return controls;
    }
    // gpt-oss rejects "none"; "low" is the least it will do.
    controls.reasoning_effort = isGptOssFamily(config.model) ? "low" : "none";
    return controls;
  }

  if (dialect === "openrouter") {
    // Ask the router to return what the call actually cost. `prompt_tokens` /
    // `completion_tokens` come back either way; this flag adds `usage.cost` in
    // USD for the backend that was really routed to, which is strictly better
    // than multiplying our own token counts by a price table that does not know
    // which backend served the request.
    //
    // It is NOT a model parameter, so `require_parameters` below does not filter
    // on it. LLM_USAGE_ACCOUNTING=off drops it if a router change ever makes it
    // interact with routing; token accounting keeps working without it, only the
    // provider-reported cost is lost.
    const accounting: Record<string, unknown> = openRouterUsageAccounting()
      ? { usage: { include: true } }
      : {};
    // OpenRouter is a router, and `require_parameters` filters the backends to
    // those honouring EVERY parameter in the request — it cannot be scoped to
    // one of them. So the two concerns are kept in separate requests:
    //
    //   schema-constrained (compile/review): require the backend to implement
    //   the schema, and send no reasoning parameter. Asking for both filters
    //   out every endpoint for a model that has no reasoning support at all —
    //   `mistralai/mistral-small-24b` returned HTTP 404 "No endpoints found
    //   that can handle the requested parameters" — and the schema is the part
    //   the artifact depends on. These steps are allowed to think.
    //
    //   unconstrained (interpret/chat): no routing filter, but do control the
    //   trace, because that is where its cost shows up.
    if (schemaConstrained) {
      return { ...accounting, provider: { require_parameters: true } };
    }
    const controls: Record<string, unknown> = { ...accounting };
    if (trace === "full") {
      return controls;
    }
    // The trace is ON by default here, and on a reasoning model that is the
    // whole latency story: the interpret step on `qwen/qwen3.8-27b` took 50-107 s
    // while it deliberated, against ~3-8 s once the trace is turned off.
    // `enabled: false` is OpenRouter's own switch — but the gpt-oss family
    // refuses it ("Reasoning is mandatory for this endpoint and cannot be
    // disabled", HTTP 400), exactly as it refuses `reasoning_effort: "none"` on
    // Groq, so its floor is the shortest trace it will accept.
    //
    // `enabled: false` is also unavailable behind a router slug, for the same
    // reason it is unavailable on gpt-oss: the free router routes to
    // reasoning-mandatory backends often enough to matter. Measured on
    // `openrouter/free`, 2 of 5 identical interpret calls returned HTTP 400
    // "Reasoning is mandatory for this endpoint and cannot be disabled" while
    // the other 3 answered normally. The shortest accepted trace is the floor
    // the whole free pool shares.
    controls.reasoning =
      trace === "low" ||
      isGptOssFamily(config.model) ||
      isOpenRouterRouterSlug(config.model)
        ? { effort: "low" }
        : { enabled: false };
    return controls;
  }

  if (dialect !== "ollama") {
    // An unknown OpenAI-compatible endpoint gets the plain OpenAI request. A
    // vendor extension it does not implement is a 400, not a no-op.
    return {};
  }

  // Keep the model resident between the sequential preflight calls so we don't
  // pay a cold reload on each step (Ollama honors keep_alive; Groq 400s on it).
  const controls: Record<string, unknown> = { keep_alive: "10m" };
  if (trace === "full") {
    return controls;
  }
  controls.reasoning_effort = trace === "low" ? "low" : "none";
  return controls;
}

// The stronger model used to re-try a rule when the fast primary model produces
// an invalid/drifted result (escalation). Empty disables escalation.
export function resolveEscalationModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return firstConfigured(env.LLM_ESCALATION_MODEL);
}

// Whether to translate the rule to English EAGERLY, before interpret/compile.
// ON by default (it removes cross-language ambiguity for small models).
//
// Read the note in `runRulePreflightPipeline` before trusting `false` to skip
// the call: it only does so when the guardian is DISABLED. With the guardian on,
// the jailbreak screen buys its own English reading of a non-English rule and
// that reading becomes the compiled text, so the call happens and the
// translation compiles either way. This is deliberate — the guard misreads the
// player's own language — and the flag then only chooses when it happens.
export function resolveTranslateToEnglish(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    cleanEnvValue(env.LLM_TRANSLATE_TO_ENGLISH ?? "true").toLowerCase() !==
    "false"
  );
}

/**
 * The credential for an endpoint, from the one place that endpoint's secret is
 * configured.
 *
 * Groq's key lives under `API_KEY_GROQ` because that is where the operator sets
 * it for every Groq-backed role at once (rule agent, chat, guardian). Copying it
 * into `LLM_API_KEY` as well would create a second source of truth that can
 * drift. A Groq endpoint configured without that key is a hard configuration
 * error, not something to attempt unauthenticated.
 */
export function resolveApiKeyForEndpoint(
  baseUrl: string,
  env: NodeJS.ProcessEnv = process.env,
): string {
  const hostname = endpointHostname(baseUrl);
  const hosted = HOSTED_API_KEY_ENV.find(
    (candidate) => candidate.hostname === hostname,
  );
  if (!hosted) {
    return cleanEnvValue(env.LLM_API_KEY);
  }
  const key = cleanEnvValue(env[hosted.envVar]);
  if (!key) {
    throw new RuleAgentError(
      "RULE_AGENT_NOT_CONFIGURED",
      `A ${hosted.hostname} endpoint is configured but ${hosted.envVar} is not set.`,
    );
  }
  return key;
}

export function resolveRuleAgentConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuleAgentConfig {
  const baseUrl = firstConfigured(env.LLM_BASE_URL, env.LLM_PRIMARY_BASE_URL);
  const model = firstConfigured(
    env.LLM_MODEL_INTERPRET,
    env.LLM_MODEL,
    env.LLM_PRIMARY_MODEL,
  );

  if (!baseUrl || !model) {
    throw new RuleAgentError(
      "RULE_AGENT_NOT_CONFIGURED",
      "The rule agent LLM endpoint or model is not configured. Set LLM_BASE_URL and LLM_MODEL.",
    );
  }

  const timeoutRaw = Number(
    cleanEnvValue(env.LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  );
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= MIN_TIMEOUT_MS
      ? timeoutRaw
      : MIN_TIMEOUT_MS;

  const seedRaw = Number(cleanEnvValue(env.LLM_SEED) || DEFAULT_SEED);
  const seed = Number.isInteger(seedRaw) ? seedRaw : DEFAULT_SEED;

  const maxOutputTokensRaw = Number(
    cleanEnvValue(env.LLM_MAX_OUTPUT_TOKENS) || DEFAULT_MAX_OUTPUT_TOKENS,
  );
  const maxOutputTokens =
    Number.isInteger(maxOutputTokensRaw) &&
    maxOutputTokensRaw >= MIN_MAX_OUTPUT_TOKENS
      ? maxOutputTokensRaw
      : MIN_MAX_OUTPUT_TOKENS;

  return {
    apiKey: resolveApiKeyForEndpoint(baseUrl, env),
    baseUrl: baseUrl.replace(/\/+$/, ""),
    maxOutputTokens,
    model,
    seed,
    timeoutMs,
  };
}

/**
 * The compile role has a stricter capability contract than interpretation or
 * chat: its provider must enforce the complete candidate JSON Schema while it
 * decodes. Keep its model routing explicit so a fast conversational cloud model
 * cannot silently become the artifact emitter merely because `LLM_MODEL` names
 * it. An empty override deliberately falls back to the rule-agent model and is
 * then rejected by `compileRuleToAst` if that model lacks the capability.
 */
export function resolveRuleCompilerConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuleAgentConfig {
  const base = resolveRuleAgentConfig(env);
  const model = firstConfigured(env.LLM_MODEL_COMPILE, base.model);
  const config = model === base.model ? { ...base } : { ...base, model };
  // `LLM_COMPILE_BASE_URL` moves the artifact-emitting steps to their own
  // endpoint. Constrained decoding on THIS schema is a much narrower capability
  // than "supports structured outputs" — hosted providers that decode a flat
  // schema in under a second cannot build a grammar for the candidate schema at
  // all — so the compile role frequently belongs somewhere other than the
  // provider serving interpretation and chat.
  applyRoleEndpoint(config, env.LLM_COMPILE_BASE_URL, env.LLM_COMPILE_MAX_OUTPUT_TOKENS, env);
  return config;
}

/**
 * Points one role at its own endpoint and output budget. The credential follows
 * the endpoint — a Groq key sent to a local server, or an "ollama" dummy sent to
 * Groq, is a 401 either way — and the budget follows it too, because a hosted
 * tier caps it from above while a local thinking model needs room for its trace.
 */
function applyRoleEndpoint(
  config: RuleAgentConfig,
  baseUrlValue: string | undefined,
  budgetValue: string | undefined,
  env: NodeJS.ProcessEnv,
): void {
  const budget = Number(cleanEnvValue(budgetValue));
  if (Number.isInteger(budget) && budget >= MIN_MAX_OUTPUT_TOKENS) {
    config.maxOutputTokens = budget;
  }
  const baseUrl = firstConfigured(baseUrlValue);
  if (baseUrl) {
    config.baseUrl = baseUrl.replace(/\/+$/, "");
    config.apiKey = resolveApiKeyForEndpoint(config.baseUrl, env);
  }
}

/**
 * Independent source-to-AST review role. It may use a different model from the
 * draft generator; when no override is configured it still runs as a separate,
 * differently prompted reasoning pass on the schema-capable compile model.
 */
export function resolveRuleReviewerConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuleAgentConfig {
  const compiler = resolveRuleCompilerConfig(env);
  const model = firstConfigured(env.LLM_MODEL_REVIEW, compiler.model);
  // The reviewer reads the same schema the compiler emits, so it inherits the
  // compile endpoint and budget by default; only the model normally differs.
  const config = model === compiler.model ? { ...compiler } : { ...compiler, model };
  // ...but its budget is worth setting apart, because the reviewer is the step
  // where an over-large budget costs the most. It emits one AST candidate and
  // nothing else: measured on `mistralai/mistral-small-24b-instruct-2501`, a
  // successful review is ~450 output tokens. When that model instead loops, it
  // runs to the full 16384-token ceiling and returns nothing usable — measured
  // at 12927 output tokens and ~240 s per call, three times in one rule, which
  // was 38% of that rule's total spend bought for no result. The review is also
  // the one step whose failure is not fatal (a missing second opinion is
  // reported as SECOND_OPINION_UNAVAILABLE), so capping it trades nothing.
  //
  // Left inheriting the compile budget by default: a reasoning reviewer needs
  // headroom for its hidden trace, and a floor chosen here would truncate it.
  applyRoleEndpoint(
    config,
    env.LLM_REVIEW_BASE_URL,
    env.LLM_REVIEW_MAX_OUTPUT_TOKENS,
    env,
  );
  return config;
}

/**
 * Config for the conversational chat step, which `LLM_MODEL_CHAT` can point at a
 * different model from the rule pipeline.
 *
 * The two jobs have opposite priorities. Compile and interpret produce the
 * artifact the on-chain hashes are taken over, so they want the strongest model
 * available and can afford to think. A chat answer is read once by one player
 * and must feel instant, so it wants the fastest model that still honours the
 * JSON and language contracts.
 *
 * `LLM_MODEL_INTERPRET` deliberately does not apply here — it names the interpret
 * step — so chat falls back to `LLM_MODEL` when no chat override is set.
 *
 * `LLM_CHAT_BASE_URL` can also move the step to a different ENDPOINT, not just a
 * different model. The chat prompt is by far the largest in the system (it
 * carries the whole product context), so it is the first thing a hosted tier's
 * per-minute input allowance refuses while the much smaller rule and guardrail
 * prompts still fit. Pointing chat at a local endpoint keeps the dealer talking
 * without moving the artifact-emitting steps off the schema-capable provider.
 */
export function resolveDealerChatConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuleAgentConfig {
  const base = resolveRuleAgentConfig(env);
  const model = firstConfigured(
    env.LLM_MODEL_CHAT,
    env.LLM_MODEL,
    env.LLM_PRIMARY_MODEL,
  );
  const config = model ? { ...base, model } : { ...base };
  applyRoleEndpoint(config, env.LLM_CHAT_BASE_URL, env.LLM_CHAT_MAX_OUTPUT_TOKENS, env);
  return config;
}

export interface ModelWarmupResult {
  loaded: boolean;
  model: string;
  // True when the endpoint is not an Ollama-native server we can pre-load
  // through (vLLM/llama.cpp/cloud) — there is nothing to "run" in that case.
  skipped: boolean;
  note?: string;
}

// ".../v1" -> ".../" host root, where Ollama's native /api/* lives.
function deriveOllamaNativeBase(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "");
}

async function listLoadedOllamaModels(
  nativeBase: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<string[] | null> {
  try {
    const response = await fetch(`${nativeBase}/api/ps`, {
      method: "GET",
      signal: combineAbortSignals(timeoutMs, signal),
    });
    if (!response.ok) {
      return null;
    }
    const payload = (await response.json()) as {
      models?: Array<{ model?: string; name?: string }>;
    };
    return (payload.models ?? [])
      .map((entry) => entry.model ?? entry.name ?? "")
      .filter((name) => name.length > 0);
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
    return null;
  }
}

function combineAbortSignals(timeoutMs: number, signal?: AbortSignal) {
  return signal
    ? AbortSignal.any([AbortSignal.timeout(timeoutMs), signal])
    : AbortSignal.timeout(timeoutMs);
}

const RATE_LIMIT_MAX_ATTEMPTS = 4;
const RATE_LIMIT_BASE_DELAY_MS = 1_000;
const RATE_LIMIT_MAX_DELAY_MS = 30_000;

function parseRetryAfterMs(value: string | null, nowMs = Date.now()): number {
  if (!value) {
    return 0;
  }
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1_000;
  }
  const retryAt = Date.parse(value);
  return Number.isFinite(retryAt) ? Math.max(0, retryAt - nowMs) : 0;
}

export function calculateRateLimitBackoffMs(
  retryNumber: number,
  retryAfterHeader: string | null,
  random = Math.random,
): number {
  const exponent = Math.max(0, Math.trunc(retryNumber) - 1);
  const exponential = Math.min(
    RATE_LIMIT_MAX_DELAY_MS,
    RATE_LIMIT_BASE_DELAY_MS * 2 ** exponent,
  );
  // Jitter stays inside this retry's exponential band. Consecutive bands do not
  // overlap, so delays still grow while concurrent clients stop retrying in lockstep.
  const jittered = exponential + Math.floor(random() * exponential);
  return Math.min(
    RATE_LIMIT_MAX_DELAY_MS,
    Math.max(jittered, parseRetryAfterMs(retryAfterHeader)),
  );
}

function rateLimitIsTransient(detail: string): boolean {
  return !/output tokens per minute|OTPM|max_tokens|insufficient (?:credits|quota)|billing/iu.test(
    detail,
  );
}

async function waitForRateLimitRetry(ms: number, signal?: AbortSignal) {
  await new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason ?? new Error("Rate-limit retry aborted."));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason ?? new Error("Rate-limit retry aborted."));
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function fetchChatCompletionWithRetry(
  url: string,
  init: Omit<RequestInit, "signal">,
  config: RuleAgentConfig,
  role: string,
  signal?: AbortSignal,
  /**
   * Called once per rate-limited attempt, with THAT attempt's own start. The
   * caller records one usage row per attempt, and without this it measured every
   * row from the first attempt's start: the rows of a four-attempt 429 storm
   * then carried cumulative durations (4 s, 13 s, 18 s, 23 s) that sum to far
   * more wall clock than the call actually spent.
   */
  onRateLimited?: (attempt: {
    startedAt: string;
    startedAtMs: number;
  }) => void,
): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    const attemptStartedAt = new Date().toISOString();
    const attemptStartedAtMs = performance.now();
    const response = await fetch(url, {
      ...init,
      signal: combineAbortSignals(config.timeoutMs, signal),
    });
    if (response.status !== 429) {
      return response;
    }
    const detail = (await response.clone().text().catch(() => "")).slice(0, 400);
    if (
      attempt >= RATE_LIMIT_MAX_ATTEMPTS ||
      !rateLimitIsTransient(detail) ||
      signal?.aborted
    ) {
      return response;
    }
    onRateLimited?.({
      startedAt: attemptStartedAt,
      startedAtMs: attemptStartedAtMs,
    });
    const delayMs = calculateRateLimitBackoffMs(
      attempt,
      response.headers.get("retry-after"),
    );
    console.warn(
      `The provider rate-limited ${role} on ${config.model}; retrying attempt ${attempt + 1}/${RATE_LIMIT_MAX_ATTEMPTS} in ${delayMs} ms.`,
    );
    await waitForRateLimitRetry(delayMs, signal);
  }
}

function modelMatches(loaded: string, wanted: string): boolean {
  if (loaded === wanted) {
    return true;
  }
  // Ollama normalizes an untagged name such as "gemma4" to
  // "gemma4:latest". Explicit tags are different models and must never match:
  // treating gemma4:e2b as gemma4:latest skips the required primary warmup.
  return !wanted.includes(":") && loaded === `${wanted}:latest`;
}

// Make sure `model` is resident in Ollama before a time-boxed chat call hits it.
// A cold model load can take far longer than the per-request LLM_TIMEOUT_MS, so
// the first preflight after boot otherwise times out and looks like a failure.
// This pre-loads the model via Ollama's native /api/generate (no prompt = load
// only) with a generous timeout — effectively running the model on demand, like
// `ollama run`, when it is not already loaded.
//
// Best-effort and Ollama-specific: a non-Ollama endpoint returns null from
// /api/ps and we skip (those keep models resident or have no such concept). The
// function never throws — if a load genuinely fails, the real call that follows
// surfaces the typed error honestly instead of this hiding it.
export async function ensureModelLoaded(
  model: string,
  config: RuleAgentConfig = resolveRuleAgentConfig(),
  loadTimeoutMs = 180_000,
  signal?: AbortSignal,
): Promise<ModelWarmupResult> {
  if (!model) {
    return { loaded: false, model, note: "no model", skipped: true };
  }

  // /api/ps and /api/generate are Ollama-native. A hosted provider has no model
  // to pre-load, so probing it just spends a round trip per player question
  // before the answer can even start.
  const dialect = resolveProviderDialect(config);
  if (dialect !== "ollama") {
    return { loaded: false, model, note: `${dialect} endpoint`, skipped: true };
  }

  const nativeBase = deriveOllamaNativeBase(config.baseUrl);
  const loaded = await listLoadedOllamaModels(nativeBase, 5_000, signal);
  if (loaded === null) {
    return { loaded: false, model, note: "ps unavailable", skipped: true };
  }

  if (loaded.some((name) => modelMatches(name, model))) {
    return { loaded: true, model, skipped: false };
  }

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }

  try {
    const response = await fetch(`${nativeBase}/api/generate`, {
      // No `prompt`: Ollama loads the model into memory and returns. keep_alive
      // matches the chat calls so the warmed model stays resident between steps.
      body: JSON.stringify({ keep_alive: "10m", model }),
      headers,
      method: "POST",
      signal: combineAbortSignals(loadTimeoutMs, signal),
    });
    if (!response.ok) {
      return {
        loaded: false,
        model,
        note: `load HTTP ${response.status}`,
        skipped: false,
      };
    }
    await response.json().catch(() => undefined);
    return { loaded: true, model, skipped: false };
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
    return {
      loaded: false,
      model,
      note: error instanceof Error ? error.message : String(error),
      skipped: false,
    };
  }
}

/**
 * Index of the `}` that closes the object opened at `start`, or -1 when the
 * object never closes. String contents are skipped so a brace inside a quoted
 * value does not shift the depth.
 */
function findObjectEnd(value: string, start: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = start; index < value.length; index += 1) {
    const character = value[index];
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  return -1;
}

function extractJsonObject(content: string): unknown {
  const trimmed = content.trim();
  const withoutFences = trimmed
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  const start = withoutFences.indexOf("{");
  const end = withoutFences.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent did not return a JSON object.",
    );
  }

  // Read to the brace that actually CLOSES the first object, then fall back to
  // the last brace in the response. Slicing straight to the last brace threw
  // away an otherwise perfect compilation whenever the model appended one stray
  // character after it — a trailing `}`, a second object, a closing remark —
  // and the player saw the rule fail for a reason no rewording could fix.
  const balancedEnd = findObjectEnd(withoutFences, start);
  const candidates = [
    ...(balancedEnd === -1
      ? []
      : [withoutFences.slice(start, balancedEnd + 1)]),
    withoutFences.slice(start, end + 1),
  ];
  let lastFailure: unknown = null;
  let lastCandidate = "";
  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate);
    } catch (error) {
      // Try the next reading; a genuinely malformed response fails below.
      lastFailure = error;
      lastCandidate = candidate;
    }
  }
  throw new RuleAgentError(
    "RULE_AGENT_BAD_RESPONSE",
    "The rule agent returned malformed JSON.",
    // Head and tail alone are useless when the break is in the middle, which is
    // the common case for a long AST: both ends look perfect and the operator
    // has nowhere to go. The parser already knows the offset — quote it.
    `${withoutFences.length} chars, ${describeJsonParseFailure(
      lastFailure,
      lastCandidate,
    )}, head=${JSON.stringify(
      withoutFences.slice(0, 240),
    )}, tail=${JSON.stringify(withoutFences.slice(-240))}`,
  );
}

// Number of characters to quote on each side of the reported parse offset.
const JSON_FAILURE_CONTEXT_CHARS = 120;

function describeJsonParseFailure(error: unknown, candidate: string): string {
  const message = error instanceof Error ? error.message : String(error);
  // V8 reports "... at position N (line L column C)"; older forms omit it.
  const offset = Number(/at position (\d+)/u.exec(message)?.[1] ?? Number.NaN);
  if (!Number.isFinite(offset)) {
    return `parseError=${JSON.stringify(message)}`;
  }
  const from = Math.max(0, offset - JSON_FAILURE_CONTEXT_CHARS);
  const to = Math.min(candidate.length, offset + JSON_FAILURE_CONTEXT_CHARS);
  return `parseError=${JSON.stringify(message)}, around=${JSON.stringify(
    candidate.slice(from, to),
  )}`;
}

function coerceInterpretation(value: unknown): RuleAgentInterpretation {
  if (!value || typeof value !== "object") {
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent response was not an object.",
    );
  }

  const record = value as Record<string, unknown>;
  const normalizedText =
    typeof record.normalizedText === "string"
      ? record.normalizedText.trim()
      : "";
  const officialInterpretation =
    typeof record.officialInterpretation === "string"
      ? record.officialInterpretation.trim()
      : "";

  const title = typeof record.title === "string" ? record.title.trim() : "";

  if (!title || !normalizedText || !officialInterpretation) {
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent omitted the title, normalized rule, or official interpretation.",
    );
  }
  if (Buffer.byteLength(title, "utf8") > 80) {
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent returned a title longer than 80 UTF-8 bytes.",
    );
  }

  const addedOperationalClauses = Array.isArray(record.addedOperationalClauses)
    ? record.addedOperationalClauses
        .filter((clause): clause is string => typeof clause === "string")
        .map((clause) => clause.trim())
        .filter((clause) => clause.length > 0)
    : [];

  const readRequiredStringArray = (
    key: "clarificationQuestions" | "suggestedRewrites",
    maxItemBytes: number,
  ) => {
    const candidate = record[key];
    if (!Array.isArray(candidate) || candidate.length > 3) {
      throw new RuleAgentError(
        "RULE_AGENT_BAD_RESPONSE",
        `The rule agent must return ${key} as an array with at most 3 items.`,
      );
    }
    if (
      candidate.some(
        (item) =>
          typeof item !== "string" ||
          !item.trim() ||
          Buffer.byteLength(item.trim(), "utf8") > maxItemBytes,
      )
    ) {
      throw new RuleAgentError(
        "RULE_AGENT_BAD_RESPONSE",
        `The rule agent returned an invalid ${key} item.`,
      );
    }
    return candidate.map((item) => (item as string).trim());
  };

  const clarificationQuestions = readRequiredStringArray(
    "clarificationQuestions",
    300,
  );
  const suggestedRewrites = readRequiredStringArray("suggestedRewrites", 800);

  return {
    addedOperationalClauses,
    clarificationQuestions,
    clarityNote:
      typeof record.clarityNote === "string" ? record.clarityNote.trim() : "",
    dealerMessage:
      typeof record.dealerMessage === "string"
        ? record.dealerMessage.trim()
        : "",
    needsClarification: record.needsClarification === true,
    normalizedText,
    officialInterpretation,
    suggestedRewrites,
    title,
  };
}

// Shared transport: POST an OpenAI-compatible chat completion and recover the
// JSON text from the response (stripping <think> blocks / falling back to the
// `reasoning` field for local thinking models). Returns the raw text candidate;
// callers extract/validate the JSON object themselves.
/**
 * Turns a non-200 from the chat endpoint into an error an operator can act on.
 *
 * A hosted provider's quota rejection is not "the endpoint is unreachable" — the
 * endpoint answered, and it named the fix. Groq in particular refuses a request
 * whose `max_tokens` exceeds the tier's output-tokens-per-minute cap BEFORE
 * running the model, so the message has to point at the budget rather than at
 * the network.
 */
/**
 * True when a 400 body blames the JSON Schema itself rather than the request.
 *
 * Deliberately narrow: it must name the schema/response-format surface, so an
 * ordinary bad-parameter 400 keeps being reported as the transport failure it
 * is. A guard that guessed here would relabel real outages as configuration.
 */
export function isSchemaRejection(detail: string): boolean {
  return (
    /response_format|json_schema|structured output/iu.test(detail) &&
    /schema|uniqueItems|minContains|maxContains|not supported|unsupported|format error/iu.test(
      detail,
    )
  );
}

/**
 * True when asking this endpoint again, inside the same rule run, cannot change
 * the answer.
 *
 * The provider loop walks every routing slot once per candidate and the repair
 * loop walks it again per repair, so a permanently unusable slot is paid for
 * repeatedly. Measured on the three-rule corpus: the tertiary slot spent 45.9 s
 * across eight 429s and returned zero tokens.
 *
 * Only failures that are a property of the ENDPOINT qualify:
 *   - a 429 reaching the caller has already used every attempt in
 *     `fetchChatCompletionWithRetry`, or was classified non-transient there;
 *   - a 413 is the tier refusing this prompt size, which the next candidate will
 *     not shrink;
 *   - a schema rejection is a property of the backend, not of the rule.
 *
 * A timeout, a 5xx and an unusable body are deliberately excluded: those can
 * differ on the next call, and treating one of them as permanent would turn a
 * single bad response into a silently skipped provider.
 */
export function isExhaustedProviderError(
  error: unknown,
): error is RuleAgentError {
  if (!(error instanceof RuleAgentError)) {
    return false;
  }
  if (error.code === "RULE_AGENT_SCHEMA_UNSUPPORTED") {
    return true;
  }
  return (
    error.code === "RULE_AGENT_UNAVAILABLE" &&
    (error.status === 429 || error.status === 413)
  );
}

async function describeChatHttpFailure(
  response: Response,
  config: RuleAgentConfig,
  role: string,
): Promise<RuleAgentError> {
  const detail = (await response.text().catch(() => "")).slice(0, 400);
  // Groq reports the input cap as 413 and the output cap as 429; both are the
  // same class of problem — the tier, not the request, is what is wrong.
  if (response.status === 413) {
    return new RuleAgentError(
      "RULE_AGENT_UNAVAILABLE",
      /input tokens per minute|ITPM/iu.test(detail)
        ? `The provider refused the request: this prompt is larger than the tier's per-minute input-token allowance for ${config.model}. Raise the provider tier or route this step to another provider.`
        : `The provider rejected the request as too large for ${config.model}.`,
      detail,
      response.status,
    );
  }
  if (response.status === 429) {
    const capped = /output tokens per minute|OTPM/iu.test(detail);
    return new RuleAgentError(
      "RULE_AGENT_UNAVAILABLE",
      capped
        ? `The provider refused the request: its per-minute output-token limit is below the configured ${config.maxOutputTokens}-token budget for ${config.model}. Lower LLM_MAX_OUTPUT_TOKENS or raise the provider tier.`
        : `The provider rate-limited ${role} on ${config.model}.`,
      detail,
      response.status,
    );
  }
  if (response.status === 401 || response.status === 403) {
    return new RuleAgentError(
      "RULE_AGENT_NOT_CONFIGURED",
      `The provider rejected the credentials or blocked ${config.model} (HTTP ${response.status}).`,
      detail,
      response.status,
    );
  }
  // A backend that refuses the compile SCHEMA rather than the request. This is a
  // permanent property of that endpoint, not an outage: measured on
  // `qwen/qwen3.8-flash` via OpenRouter, which answers
  // "When the schema contains the fields uniqueItems, contains, minContains, or
  // maxContains, the type should not be array" — and the candidate schema
  // constrains worked-example tickets to six DISTINCT numbers, so `uniqueItems`
  // on an array is not something the request can give up.
  //
  // `supportsRuleCompilationSchema` cannot catch this in advance, because on a
  // router the capability belongs to whichever backend serves the call, not to
  // the model id. Reporting it as UNAVAILABLE hid a dead configuration behind
  // what looked like a transient provider error, and every complex rule paid a
  // full round-trip to rediscover it.
  if (response.status === 400 && isSchemaRejection(detail)) {
    return new RuleAgentError(
      "RULE_AGENT_SCHEMA_UNSUPPORTED",
      `The provider serving ${config.model} cannot decode the rule compilation schema. Point this role at an endpoint that can, or remove the model from the routing tier.`,
      detail,
      response.status,
    );
  }
  return new RuleAgentError(
    "RULE_AGENT_UNAVAILABLE",
    `The rule agent returned HTTP ${response.status}. ${detail}`.trim(),
    detail,
    response.status,
  );
}

async function requestAgentJson(
  // Which pipeline step this request belongs to, for resource accounting. First
  // so the optional trailing parameters keep their positions.
  step: AiUsageStep,
  systemPrompt: string,
  userText: string,
  config: RuleAgentConfig,
  signal?: AbortSignal,
  // How much the model may think before answering — see `transportControls`.
  trace: ReasoningTrace = "suppressed",
  schemaConstraint?: AgentJsonSchemaConstraint,
): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();
  // `attempt` is supplied only by the rate-limit callback, which records one row
  // per retried attempt; everything else measures the whole call.
  const record = (
    outcome: AiUsageOutcome,
    payload: unknown,
    attempt?: { startedAt: string; startedAtMs: number },
  ) =>
    recordTransportCall({
      config,
      inputParts: [systemPrompt, userText],
      outcome,
      payload,
      startedAt: attempt?.startedAt ?? startedAt,
      startedAtMs: attempt?.startedAtMs ?? startedAtMs,
      step,
    });

  let response: Response;
  try {
    response = await fetchChatCompletionWithRetry(
      `${config.baseUrl}/chat/completions`,
      {
      body: JSON.stringify({
        messages: [
          { content: systemPrompt, role: "system" },
          { content: userText, role: "user" },
        ],
        model: config.model,
        max_tokens: config.maxOutputTokens,
        // Rule preflight needs the constrained JSON result, not a hidden
        // reasoning trace. Ollama otherwise enables thinking by default for
        // thinking-capable models. Also carries the provider's keep-warm flag.
        ...transportControls(config, trace, schemaConstraint !== undefined),
        response_format: schemaConstraint
          ? {
              type: "json_schema",
              json_schema: {
                name: schemaConstraint.name,
                schema: schemaConstraint.schema,
                strict: true,
              },
            }
          : { type: "json_object" },
        seed: config.seed,
        stream: false,
        // Greedy decoding (temperature 0, top_p 1) so the same rule text always
        // compiles to the same on-chain hashes. No nucleus/temperature jitter.
        temperature: 0,
        top_p: 1,
      }),
      headers,
      method: "POST",
      },
      config,
      "the rule agent",
      signal,
      (attempt) => record("error", null, attempt),
    );
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
    record("error", null);
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new RuleAgentError(
        "RULE_AGENT_TIMEOUT",
        "The rule agent did not respond in time.",
      );
    }
    throw new RuleAgentError(
      "RULE_AGENT_UNAVAILABLE",
      `The rule agent endpoint is unreachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    record("error", null);
    throw await describeChatHttpFailure(response, config, "the rule agent");
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    record("error", null);
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent response was not valid JSON.",
    );
  }

  const choice = (
    payload as {
      choices?: Array<{
        finish_reason?: unknown;
        message?: { content?: unknown; reasoning?: unknown };
      }>;
    }
  )?.choices?.[0];
  const message = choice?.message;

  // A cut-off response can never be trusted as the full answer: either the JSON
  // ends mid-object, or — for a reasoning model — it never started because the
  // hidden trace consumed the whole budget and `content` came back empty. Report
  // it as the budget failure it is instead of parsing a fragment, and never let
  // the `reasoning` fallback below hand a truncated trace to the JSON extractor.
  if (choice?.finish_reason === "length") {
    // Recorded BEFORE the throw: the provider billed the whole output budget for
    // this one, so it is the most expensive call in the pipeline and the one an
    // operator most needs to see. `truncated` keeps it out of the error bucket.
    record("truncated", payload);
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      `The rule agent response was cut off at the ${config.maxOutputTokens}-token output limit. Raise LLM_MAX_OUTPUT_TOKENS or use a model that does not spend the budget on a hidden reasoning trace.`,
    );
  }

  const rawContent =
    typeof message?.content === "string" ? message.content : "";
  const reasoning =
    typeof message?.reasoning === "string" ? message.reasoning : "";
  const strippedContent = rawContent
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const candidate = strippedContent || rawContent.trim() || reasoning.trim();

  if (candidate.length === 0) {
    record("error", payload);
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent response did not contain any content.",
    );
  }

  record("ok", payload);
  return candidate;
}

export async function interpretRuleWithAgent(
  sanitizedText: string,
  config: RuleAgentConfig = resolveRuleAgentConfig(),
  signal?: AbortSignal,
): Promise<RuleAgentInterpretation> {
  const candidate = await requestAgentJson(
    "interpret",
    buildDealerInterpretPrompt(),
    sanitizedText,
    config,
    signal,
  );
  return coerceInterpretation(extractJsonObject(candidate));
}

export interface DealerQuestionAnswer {
  answer: string;
  proposedRuleText: string | null;
  /**
   * The model's hidden reasoning trace for this answer, when the provider
   * returns it as a separate field (Groq `reasoning_format: "parsed"`). It is
   * shown to the player as a subordinate block, never mixed into the answer.
   */
  reasoning?: string;
}

function coerceDealerQuestionAnswer(value: unknown): DealerQuestionAnswer {
  if (!value || typeof value !== "object") {
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The dealer chat response was not an object.",
    );
  }
  const record = value as Record<string, unknown>;
  // `answerLanguage` is a steering field, not a payload: the contract asks the
  // model to name the player's language before writing, which is what stops it
  // from inheriting the language of the rule text and transcript instead. It
  // has no consumer, so a model that skips it must not fail the whole answer.
  const answer = typeof record.answer === "string" ? record.answer.trim() : "";
  const proposedRuleText =
    record.proposedRuleText === null
      ? null
      : typeof record.proposedRuleText === "string"
        ? record.proposedRuleText.trim()
        : undefined;

  if (
    !answer ||
    Buffer.byteLength(answer, "utf8") > 8_000 ||
    proposedRuleText === undefined ||
    (proposedRuleText !== null &&
      (!proposedRuleText ||
        Buffer.byteLength(proposedRuleText, "utf8") > 6_000))
  ) {
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The dealer chat response omitted or exceeded its required fields.",
    );
  }

  return { answer, proposedRuleText };
}

/**
 * Incrementally decodes one top-level JSON string field out of a response that
 * is still being written. Feed it the raw completion as it arrives; it returns
 * only the newly decoded characters of that field's value.
 *
 * This is what lets the dealer's chat answer reach the player token by token
 * even though the model replies with a JSON object: the reader waits for the
 * `"answer": "` opening, then emits decoded text until the closing quote. Any
 * reasoning preamble or `<think>` block before the field is skipped by
 * construction, so it can never leak into the streamed answer.
 */
export function createJsonStringFieldReader(field: string) {
  // The exact key token, so "answerLanguage" can never be mistaken for
  // "answer": the closing quote is part of the pattern.
  const opening = new RegExp(`"${field}"\\s*:\\s*"`, "u");
  const ESCAPES: Record<string, string> = {
    '"': '"',
    "/": "/",
    "\\": "\\",
    b: "\b",
    f: "\f",
    n: "\n",
    r: "\r",
    t: "\t",
  };

  let raw = "";
  /** Next index in `raw` to decode; -1 until the field's value starts. */
  let cursor = -1;
  let closed = false;

  return {
    get closed() {
      return closed;
    },
    push(chunk: string): string {
      if (closed) {
        return "";
      }
      raw += chunk;
      if (cursor < 0) {
        const match = opening.exec(raw);
        if (!match) {
          return "";
        }
        cursor = match.index + match[0].length;
      }

      let decoded = "";
      while (cursor < raw.length) {
        const char = raw[cursor] as string;
        if (char === '"') {
          closed = true;
          cursor += 1;
          break;
        }
        if (char !== "\\") {
          decoded += char;
          cursor += 1;
          continue;
        }
        // An escape needs its payload before it can be decoded. Leave the
        // backslash in place and resume when the rest of it arrives.
        const next = raw[cursor + 1];
        if (next === undefined) {
          break;
        }
        if (next === "u") {
          if (raw.length < cursor + 6) {
            break;
          }
          const hex = raw.slice(cursor + 2, cursor + 6);
          if (!/^[0-9a-fA-F]{4}$/u.test(hex)) {
            throw new RuleAgentError(
              "RULE_AGENT_BAD_RESPONSE",
              `The streamed ${field} field contained an invalid unicode escape.`,
            );
          }
          decoded += String.fromCharCode(Number.parseInt(hex, 16));
          cursor += 6;
          continue;
        }
        const mapped = ESCAPES[next];
        if (mapped === undefined) {
          throw new RuleAgentError(
            "RULE_AGENT_BAD_RESPONSE",
            `The streamed ${field} field contained an invalid escape.`,
          );
        }
        decoded += mapped;
        cursor += 2;
      }
      return decoded;
    },
  };
}

/**
 * Same transport as `requestAgentJson`, but reads the completion as it is
 * produced and reports each content delta. Returns the same full text candidate,
 * so the caller still validates the complete JSON object exactly as the
 * non-streaming path does — a partial answer is never accepted as final.
 */
async function requestAgentJsonStream(
  systemPrompt: string,
  userText: string,
  config: RuleAgentConfig,
  onContentDelta: (chunk: string) => void,
  signal?: AbortSignal,
  trace: ReasoningTrace = "suppressed",
  // Reports the hidden reasoning trace as it arrives, for providers that return
  // it as its own field. Never merged into the answer: the trace is the model
  // thinking aloud, not the reply, and the JSON contract covers only the reply.
  onReasoningDelta?: (chunk: string) => void,
): Promise<string> {
  const headers: Record<string, string> = {
    accept: "text/event-stream",
    "content-type": "application/json",
  };
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();
  // A stream reports its token counts in a trailing chunk, not in the response
  // body, so the accounting has to be picked up while the SSE is consumed.
  let streamUsagePayload: unknown = null;
  const record = (
    outcome: AiUsageOutcome,
    attempt?: { startedAt: string; startedAtMs: number },
  ) =>
    recordTransportCall({
      config,
      inputParts: [systemPrompt, userText],
      outcome,
      payload: streamUsagePayload,
      startedAt: attempt?.startedAt ?? startedAt,
      startedAtMs: attempt?.startedAtMs ?? startedAtMs,
      step: "chat",
    });

  let response: Response;
  try {
    response = await fetchChatCompletionWithRetry(
      `${config.baseUrl}/chat/completions`,
      {
      body: JSON.stringify({
        messages: [
          { content: systemPrompt, role: "system" },
          { content: userText, role: "user" },
        ],
        model: config.model,
        max_tokens: config.maxOutputTokens,
        ...transportControls(config, trace),
        response_format: { type: "json_object" },
        seed: config.seed,
        stream: true,
        // Without this an OpenAI-compatible stream never reports token counts at
        // all, and the streamed dealer answers would be the one step missing from
        // the resource account. Providers that do not implement it simply never
        // send the trailing usage chunk, which is recorded as `not_reported`.
        stream_options: { include_usage: true },
        temperature: 0,
        top_p: 1,
      }),
      headers,
      method: "POST",
      },
      config,
      "the dealer chat",
      signal,
      (attempt) => record("error", attempt),
    );
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
    record("error");
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new RuleAgentError(
        "RULE_AGENT_TIMEOUT",
        "The rule agent did not respond in time.",
      );
    }
    throw new RuleAgentError(
      "RULE_AGENT_UNAVAILABLE",
      `The rule agent endpoint is unreachable: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }

  if (!response.ok) {
    record("error");
    throw await describeChatHttpFailure(response, config, "the dealer chat");
  }
  if (!response.body) {
    record("error");
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent stream carried no body.",
    );
  }

  let content = "";
  let reasoning = "";
  let truncated = false;
  let buffer = "";

  const consumeLine = (line: string) => {
    if (!line.startsWith("data:")) {
      return;
    }
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") {
      return;
    }
    let event: unknown;
    try {
      event = JSON.parse(data);
    } catch {
      throw new RuleAgentError(
        "RULE_AGENT_BAD_RESPONSE",
        "The rule agent stream sent a chunk that was not valid JSON.",
      );
    }
    // The trailing chunk carries `usage` and an empty `choices` array. Kept as
    // the whole event so `readProviderUsage` sees the same shape it reads from a
    // non-streamed body.
    if ((event as { usage?: unknown })?.usage) {
      streamUsagePayload = event;
    }
    const choice = (
      event as {
        choices?: Array<{
          delta?: { content?: unknown; reasoning?: unknown };
          finish_reason?: unknown;
        }>;
      }
    )?.choices?.[0];
    if (choice?.finish_reason === "length") {
      truncated = true;
    }
    if (typeof choice?.delta?.reasoning === "string" && choice.delta.reasoning) {
      reasoning += choice.delta.reasoning;
      onReasoningDelta?.(choice.delta.reasoning);
    }
    if (typeof choice?.delta?.content === "string" && choice.delta.content) {
      content += choice.delta.content;
      onContentDelta(choice.delta.content);
    }
  };

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split(/\r\n|\r|\n/u);
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        consumeLine(line);
      }
      if (done) {
        if (buffer) {
          consumeLine(buffer);
        }
        break;
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
    record("error");
    if (error instanceof RuleAgentError) {
      throw error;
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new RuleAgentError(
        "RULE_AGENT_TIMEOUT",
        "The rule agent stopped sending the answer in time.",
      );
    }
    throw new RuleAgentError(
      "RULE_AGENT_UNAVAILABLE",
      `The rule agent stream failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  // Same budget rule as the non-streaming path: a cut-off object is never a
  // usable answer, even though some of it already reached the player.
  if (truncated) {
    record("truncated");
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      `The rule agent response was cut off at the ${config.maxOutputTokens}-token output limit. Raise LLM_MAX_OUTPUT_TOKENS or use a model that does not spend the budget on a hidden reasoning trace.`,
    );
  }

  const strippedContent = content
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .trim();
  const candidate = strippedContent || content.trim() || reasoning.trim();
  if (candidate.length === 0) {
    record("error");
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent response did not contain any content.",
    );
  }
  record("ok");
  return candidate;
}

/**
 * Streaming twin of `answerDealerQuestion`: reports the answer text as the model
 * writes it, then returns the same validated object. Used for the conversational
 * side of the dealer, which carries no AST and no on-chain hash — the compile
 * path stays on the single-shot request so its decoding stays reproducible.
 */
export async function streamDealerQuestionAnswer(
  context: string,
  onAnswerDelta: (chunk: string) => void,
  config: RuleAgentConfig = resolveDealerChatConfig(),
  signal?: AbortSignal,
  // Optional: the model's own reasoning, streamed as it is produced. Providers
  // that do not separate the trace simply never call this.
  onReasoningDelta?: (chunk: string) => void,
): Promise<DealerQuestionAnswer> {
  const reader = createJsonStringFieldReader("answer");
  let reasoning = "";
  const candidate = await requestAgentJsonStream(
    buildDealerChatPrompt(),
    context,
    config,
    (chunk) => {
      const text = reader.push(chunk);
      if (text) {
        onAnswerDelta(text);
      }
    },
    signal,
    resolveDealerChatTrace(),
    (chunk) => {
      reasoning += chunk;
      onReasoningDelta?.(chunk);
    },
  );
  const answer = coerceDealerQuestionAnswer(extractJsonObject(candidate));
  // The trace rides on the answer so a non-streaming consumer, a reconnecting
  // client, and the saved transcript all see the same thing the stream showed.
  return reasoning.trim() ? { ...answer, reasoning: reasoning.trim() } : answer;
}

/**
 * The trace budget for a chat answer, and why it is `low` rather than off.
 *
 * `"none"` is not an option here. On `nemotron-3-super:cloud` it made the model
 * stop honouring `response_format: json_object` once the chat prompt carried its
 * product-knowledge references, replying with bare prose that fails
 * `coerceDealerQuestionAnswer` — measured 0/4 valid JSON with it against 4/4
 * without. On `gpt-oss` it is simply ignored (Ollama documents that gpt-oss
 * accepts only `low`/`medium`/`high`).
 *
 * `"low"` is what both models honour, and it is the whole latency story for the
 * chat step: the hidden trace, not the prompt, is what the player waits for.
 * Unlike interpret and compile, a chat answer feeds no AST and no on-chain hash,
 * so it needs no reproducible decoding.
 */
const DEALER_CHAT_TRACE: ReasoningTrace = "low";

/**
 * How much the chat step is allowed to think. `LLM_CHAT_REASONING` names it:
 *
 * - `low` (default) — the balance described above: a trace short enough to keep
 *   the answer fast, long enough to be worth showing the player.
 * - `full` — the provider's own default depth. Slower, but the trace the player
 *   reads is the model's unabridged one.
 * - `off` — suppress the trace where the provider honours it. The reasoning
 *   block then has nothing to show and does not render.
 *
 * An unrecognised value is a configuration error and is rejected rather than
 * silently treated as the default: a typo here would quietly change what the
 * player is shown.
 */
export function resolveDealerChatTrace(
  env: NodeJS.ProcessEnv = process.env,
): ReasoningTrace {
  const configured = cleanEnvValue(env.LLM_CHAT_REASONING).toLowerCase();
  if (!configured) {
    return DEALER_CHAT_TRACE;
  }
  if (configured === "low") {
    return "low";
  }
  if (configured === "full") {
    return "full";
  }
  if (configured === "off") {
    return "suppressed";
  }
  throw new RuleAgentError(
    "RULE_AGENT_NOT_CONFIGURED",
    "LLM_CHAT_REASONING must be one of: low, full, off.",
  );
}

export async function answerDealerQuestion(
  context: string,
  config: RuleAgentConfig = resolveDealerChatConfig(),
  signal?: AbortSignal,
): Promise<DealerQuestionAnswer> {
  const candidate = await requestAgentJson(
    "chat",
    buildDealerChatPrompt(),
    context,
    config,
    signal,
    resolveDealerChatTrace(),
  );
  return coerceDealerQuestionAnswer(extractJsonObject(candidate));
}

const TRANSLATE_SYSTEM_PROMPT = [
  "You are a faithful translator for a lottery game. Translate the player's",
  "winning-rule text to English. Preserve the EXACT meaning — especially:",
  "- polarity and comparison: 'mais/more/most', 'menos/fewer/least', keep the",
  "  direction; never flip it.",
  "- 'errar/errou' = to miss (a number NOT drawn); 'acertar' = to match a drawn",
  "  number. Keep miss vs match intact.",
  "- logical connectors: 'e'=and, 'ou'=or — keep every clause.",
  "- thresholds: 'pelo menos N', 'N ou mais' stay as written.",
  "- numeric examples and order/position words must remain intact. If 'dezena'",
  "  is demonstrated by 12/11 -> 10, translate it as a tens range, not as an",
  "  exact drawn number or an unordered digit match.",
  "Do not interpret, normalize, or add anything. If the text is already English,",
  "return it unchanged. Output ONLY the translated rule sentence, no quotes, no",
  "labels, no extra text.",
].join("\n");

// Faithful PT/any -> English translation so the downstream English prompts (and
// the guardian) operate without cross-language ambiguity. This intentionally does
// NOT editorialize (that is the interpret step's job); a pure translation is far
// less likely to flip polarity than a "rewrite as a measurable sentence" step.
export async function translateRuleToEnglish(
  text: string,
  config: RuleAgentConfig = resolveRuleAgentConfig(),
  signal?: AbortSignal,
): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }
  const startedAt = new Date().toISOString();
  const startedAtMs = performance.now();
  const record = (
    outcome: AiUsageOutcome,
    payload: unknown,
    attempt?: { startedAt: string; startedAtMs: number },
  ) =>
    recordTransportCall({
      config,
      inputParts: [TRANSLATE_SYSTEM_PROMPT, text],
      outcome,
      payload,
      startedAt: attempt?.startedAt ?? startedAt,
      startedAtMs: attempt?.startedAtMs ?? startedAtMs,
      step: "translate",
    });
  let response: Response;
  try {
    response = await fetchChatCompletionWithRetry(
      `${config.baseUrl}/chat/completions`,
      {
      body: JSON.stringify({
        messages: [
          { content: TRANSLATE_SYSTEM_PROMPT, role: "system" },
          { content: text, role: "user" },
        ],
        model: config.model,
        // The translated sentence is short, but a reasoning model's hidden trace
        // is not: a tight ceiling here truncated the response before the sentence
        // was emitted and surfaced as "the translator returned no text".
        max_tokens: config.maxOutputTokens,
        ...transportControls(config),
        seed: config.seed,
        stream: false,
        temperature: 0,
        top_p: 1,
      }),
      headers,
      method: "POST",
      },
      config,
      "the translator",
      signal,
      (attempt) => record("error", null, attempt),
    );
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
    record("error", null);
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new RuleAgentError(
        "RULE_AGENT_TIMEOUT",
        "The translator did not respond in time.",
      );
    }
    throw new RuleAgentError(
      "RULE_AGENT_UNAVAILABLE",
      `The translator endpoint is unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    record("error", null);
    throw await describeChatHttpFailure(response, config, "the translator");
  }
  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{
      finish_reason?: unknown;
      message?: { content?: unknown; reasoning?: unknown };
    }>;
  } | null;
  const choice = payload?.choices?.[0];
  if (choice?.finish_reason === "length") {
    record("truncated", payload);
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      `The translator response was cut off at the ${config.maxOutputTokens}-token output limit. Raise LLM_MAX_OUTPUT_TOKENS.`,
    );
  }
  const message = choice?.message;
  const raw = typeof message?.content === "string" ? message.content : "";
  const reasoning =
    typeof message?.reasoning === "string" ? message.reasoning : "";
  const cleaned =
    raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || reasoning.trim();
  // Strip wrapping quotes the model sometimes adds.
  const englishText = cleaned.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!englishText) {
    record("error", payload);
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The translator returned no text.",
    );
  }
  record("ok", payload);
  return englishText;
}

// Retries for a response that is not JSON at all, and for nothing else.
//
// Measured on the configured compile model (nemotron-3-super:cloud) with
// `reasoning_effort: "none"`: 3 of 6 identical calls returned a complete
// envelope MINUS its final closing brace, with `finish_reason: "stop"` and no
// output-budget pressure (~700 completion tokens against a 16k ceiling). The
// same prompt without that flag returned parseable JSON 5 of 5 times, at roughly
// 4x the completion tokens. So it is a decoding defect of the model in that mode,
// not a property of the rule — the player blocked by it had nothing to rewrite.
//
// The truncated text is NEVER repaired: appending the missing delimiters would
// happily complete an `and` whose later clauses were cut off, and that weaker
// rule can still pass schema validation. A re-ask is the only safe recovery.
//
// Every other failure (timeout, endpoint down, output-budget exhaustion) is
// reported on the first attempt: retrying those hides a real condition behind a
// longer wait. Whatever does come back is still fully validated downstream by
// the schema, span, worked-example, and coverage gates.
const COMPILE_BAD_RESPONSE_ATTEMPTS = 3;

// Compile step (PRD §7.3.1): ask the model to emit an auditable compilation
// candidate (AST + consumed source spans + source-derived worked examples).
// The full candidate schema is passed to the decoder: JSON-object mode alone
// cannot prohibit repeated, out-of-domain, or wrong-length tickets. The
// compiler still revalidates every result as the non-bypassable boundary.
export async function compileRuleToAst(
  normalizedText: string,
  config: RuleAgentConfig = resolveRuleCompilerConfig(),
  signal?: AbortSignal,
  validationFeedback?: string,
  role: "generate" | "review" = "generate",
): Promise<unknown> {
  if (!supportsRuleCompilationSchema(config)) {
    throw new RuleAgentError(
      "RULE_AGENT_SCHEMA_UNSUPPORTED",
      "The configured rule compiler does not support required schema-constrained decoding.",
    );
  }

  const normalizedConstraintText = normalizedText
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();
  const namesDirectPosition =
    /\b(?:first|second|third|fourth|fifth|sixth|last|1st|2nd|3rd|4th|5th|6th|primeir[oa]|segund[oa]|terceir[oa]|quart[oa]|quint[oa]|sext[oa]|ultim[oa])\s+(?:guessed?\s+|picked\s+|drawn?\s+)?(?:number|pick|numero)\b/u.test(
      normalizedConstraintText,
    ) || /\b(?:guess|draw)\s*\[\s*[0-5]\s*\]/u.test(normalizedConstraintText);
  // Quantifiers include the NEGATIVE ones. "none of its even numbers appear in
  // the draw" quantifies over the whole guess exactly as "every ... number"
  // does, and it needs the same binder. Missing them made a compound rule
  // ("none of its even numbers appear in the draw AND the first drawn number is
  // odd") look purely positional, so the decoder below was told to forbid the
  // one node that half of the rule requires — an unsatisfiable grammar. Measured
  // on that rule: with the restriction both `mistral-small-24b` and
  // `gpt-oss-20b` run to the full output ceiling and return no AST; without it
  // both answer in under a second with a valid one.
  //
  // An adjective may sit between the quantifier and the noun ("its EVEN
  // numbers"), so the optional middle group allows one.
  const namesQuantifiedCollection =
    /\b(?:all|every|each|any|none|no|neither|for each|todos?|todas?|cada|qualquer|nenhum[oa]?|nem)\s+(?:of\s+)?(?:the\s+|its\s+|his\s+|her\s+|their\s+|my\s+)?(?:(?:guessed?|picked?|drawn?|sorteados?|seus?|suas?)\s+)?(?:\w+\s+)?(?:numbers?|picks?|values?|items?|pairs?|numeros?|valores?|elementos?|pares?)\b/u.test(
      normalizedConstraintText,
    );
  const positionalOnly =
    namesDirectPosition &&
    !namesQuantifiedCollection &&
    /\b(?:draw|drawn|sorteio)\b/u.test(normalizedConstraintText);
  // Not const: an unsatisfiable grammar is recovered from below by dropping the
  // restriction and re-asking. The whitelist above will keep missing phrasings —
  // this is what stops the next miss from costing a full output budget.
  let constrainDirectPositions = positionalOnly;

  // The compile-step guidance lives in the versioned `compile_rule_to_ast` agent
  // skill (PRD §7.10/§7.12), co-located with the DSL schema in @tyche/rule-compiler.
  // The executable schema is sent to the decoder instead of copied into the
  // prompt, so the transport and server validation share one source of truth.
  const roleGuidance =
    role === "review"
      ? "\n\n## Independent semantic review\nCompile the exact player rule from scratch as an independent auditor. You have not seen the draft candidate. Re-derive every condition, comparator, source, position, threshold, conjunction, and negation before emitting the candidate. Do not copy a familiar example unless it expresses the complete rule."
      : "";
  const deterministicPlan =
    role === "generate"
      ? getDeterministicRuleCompilerPlan(normalizedText)
      : null;
  const semanticPlanGuidance = deterministicPlan
    ? `\n\n## Server-verified semantic plan\nAn independent source parser proved that the following plan preserves every load-bearing value and operation in this rule. Encode this exact semantic structure; do not simplify, swap sources, change indices, or drop clauses. You still must derive consumedSpans from the source and calculate workedExamples independently.\nInterpretation: ${deterministicPlan.interpretation}\nAST plan: ${JSON.stringify(deterministicPlan.ast)}`
    : "";
  // Rebuilt when the positional restriction is dropped below: the guidance
  // paragraph and the schema both encode it and must never disagree.
  const buildRequest = () => {
    const decoderGuidance = constrainDirectPositions
      ? "\n\n## Direct-position decoder constraint\nThis rule names individual positions and does not quantify over a collection. Represent every named position with `at(index, source)`, converting the player's 1-based ordinal to a 0-based index. Binder-only `elem` and `pair` nodes are unavailable for this request because no binder would define them. Preserve every positional clause and connector."
      : "";
    const basePrompt = `${buildRuleCompilerSkillPrompt()}${roleGuidance}${decoderGuidance}${semanticPlanGuidance}`;
    return {
      prompt: validationFeedback?.trim()
        ? `${basePrompt}\n\n## Validation-guided re-ask\nThe previous candidate was rejected by deterministic validation. Produce a completely fresh candidate from the exact player rule. Do not weaken, omit, or reinterpret any condition merely to pass validation. Correct all of these server-authored findings:\n${validationFeedback.trim().slice(0, 2_000)}`
        : basePrompt,
      schemaConstraint: {
        name: "tyche_rule_compilation_candidate",
        schema: getRuleCompilationCandidateJsonSchema({
          forbidBinderScopedScalars: constrainDirectPositions,
        }),
      } satisfies AgentJsonSchemaConstraint,
    };
  };
  let { prompt, schemaConstraint } = buildRequest();
  // The positional restriction gets exactly one chance to be wrong per call.
  let mayRelaxPositions = constrainDirectPositions;
  // Set only by the two paths the trace actually recovers: an unparseable
  // envelope and an off-grammar AST. Relaxing the positional restriction is a
  // different fault with a different fix, and it must not silently buy a
  // reasoning trace that can cost more than the call it is retrying.
  let useFullTrace = false;
  for (let attempt = 1; ; attempt += 1) {
    // First ask in the fast, no-trace mode every other step uses. A rule whose
    // AST is small comes back correct and the player pays no extra latency; the
    // shapes that break it are the large nested ones, and those get the thinking
    // re-ask below rather than making every rule wait for a reasoning trace.
    let candidate: string;
    try {
      candidate = await requestAgentJson(
        // Generation and independent review are separately billed steps against
        // the same ~15k-token prompt, so they are never merged in the accounting.
        role === "review" ? "review" : "compile",
        prompt,
        normalizedText,
        config,
        signal,
      // The reviewer is independent because it has a different source-only
      // prompt, not because it must spend an unbounded hidden trace. On local
      // 9B models that trace can exceed the entire five-minute request window.
      // As with generation, only an unusable structured response earns the
      // slower full-reasoning retry.
        useFullTrace ? "full" : "suppressed",
        schemaConstraint,
      );
    } catch (error) {
      // An output budget spent in full under the positional restriction is the
      // signature of an UNSATISFIABLE grammar, not of a hard rule: the decoder
      // was forbidden the `elem`/`pair` nodes and the rule needs one, so no
      // token sequence can close the JSON and the model generates to the
      // ceiling. Measured on "none of its even numbers appear in the draw and
      // the first drawn number is odd": restricted, `mistral-small-24b` and
      // `gpt-oss-20b` both run out with no AST; unrestricted, both answer in
      // under a second. `namesQuantifiedCollection` is a whitelist and will miss
      // other phrasings, so the recovery is here rather than only in the regex.
      const exhaustedBudget =
        error instanceof RuleAgentError &&
        error.code === "RULE_AGENT_BAD_RESPONSE" &&
        error.message.includes("cut off");
      if (!mayRelaxPositions || !exhaustedBudget || signal?.aborted) {
        throw error;
      }
      mayRelaxPositions = false;
      constrainDirectPositions = false;
      ({ prompt, schemaConstraint } = buildRequest());
      console.error(
        `Rule compile attempt ${attempt} exhausted the output budget under the direct-position decoder constraint; re-asking without it.`,
      );
      continue;
    }
    let parsed: unknown;
    try {
      parsed = extractJsonObject(candidate);
    } catch (error) {
      const retryable =
        error instanceof RuleAgentError &&
        error.code === "RULE_AGENT_BAD_RESPONSE" &&
        attempt < COMPILE_BAD_RESPONSE_ATTEMPTS &&
        !signal?.aborted;
      if (!retryable) {
        throw error;
      }
      useFullTrace = true;
      console.error(
        `Rule compile attempt ${attempt} returned no usable JSON; retrying.`,
        error instanceof RuleAgentError ? error.detail : "",
      );
      continue;
    }

    // The trace-suppressed mode degrades this model's nested output in two ways,
    // not one. A truncated envelope fails to parse and is caught above; a
    // complete envelope whose AST is simply the wrong shape parses fine and used
    // to be returned as-is, so it reached the player as SCHEMA_INVALID with the
    // advice to rewrite a rule that had nothing wrong with it — while the re-ask
    // built to recover exactly this never ran. Both are the same defect and both
    // buy the thinking retry.
    if (
      providerCompilationHasSchemaValidAst(parsed) ||
      attempt >= COMPILE_BAD_RESPONSE_ATTEMPTS ||
      signal?.aborted
    ) {
      // The last attempt is returned even when its AST is off-grammar: this
      // transport never decides validity, so the downstream schema, span,
      // worked-example and coverage gates still produce the real verdict.
      return parsed;
    }
    useFullTrace = true;
    console.error(
      `Rule compile attempt ${attempt} returned an AST outside the rule grammar; retrying with the reasoning trace.`,
    );
  }
}

export function reviewRuleToAst(
  normalizedText: string,
  config: RuleAgentConfig = resolveRuleReviewerConfig(),
  signal?: AbortSignal,
): Promise<unknown> {
  return compileRuleToAst(normalizedText, config, signal, undefined, "review");
}
