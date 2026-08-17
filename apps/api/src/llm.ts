import { buildRuleCompilerSkillPrompt } from "@tyche/rule-compiler";
import {
  buildDealerChatPrompt,
  buildDealerInterpretPrompt,
} from "./promptSkills.js";

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

  constructor(code: RuleAgentErrorCode, message: string, detail?: string) {
    super(message);
    this.name = "RuleAgentError";
    this.code = code;
    this.detail = detail;
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
const MIN_MAX_OUTPUT_TOKENS = 4_096;
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

// Suppresses the hidden reasoning trace on Ollama-served models.
//
// Applied to every step, and dropped only on a compile RE-ASK. The compile step
// is the one that has to emit a large, exactly-nested JSON structure, and on the
// configured model (`nemotron-3-super:cloud`) suppressing the trace measurably
// breaks that structure: the same compile prompt returned a complete envelope
// minus its final closing brace in 3 of 6 calls with the flag (~700 completion
// tokens, `finish_reason: "stop"`, nowhere near the budget) and parsed 5 of 5
// times without it (~2700 tokens). Since only structurally large rules hit that
// wall, the first compile call keeps the saving and the retry buys the trace.
function ollamaThinkingControl(config: RuleAgentConfig) {
  const usesOllama =
    config.apiKey.toLowerCase() === "ollama" ||
    (() => {
      try {
        return new URL(config.baseUrl).port === "11434";
      } catch {
        return false;
      }
    })();
  return usesOllama ? { reasoning_effort: "none" as const } : {};
}

// The stronger model used to re-try a rule when the fast primary model produces
// an invalid/drifted result (escalation). Empty disables escalation.
export function resolveEscalationModel(
  env: NodeJS.ProcessEnv = process.env,
): string {
  return firstConfigured(env.LLM_ESCALATION_MODEL);
}

// Whether to translate the rule to English before interpret/compile. ON by
// default (it removes cross-language ambiguity for small models). A capable
// multilingual model (gemma4:latest and stronger) reads Portuguese directly and
// the rule-authoring skill already carries a Portuguese trigger glossary, so it
// can be turned OFF to save one LLM call without losing consistency.
export function resolveTranslateToEnglish(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return (
    cleanEnvValue(env.LLM_TRANSLATE_TO_ENGLISH ?? "true").toLowerCase() !==
    "false"
  );
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
    apiKey: cleanEnvValue(env.LLM_API_KEY),
    baseUrl: baseUrl.replace(/\/+$/, ""),
    maxOutputTokens,
    model,
    seed,
    timeoutMs,
  };
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
async function requestAgentJson(
  systemPrompt: string,
  userText: string,
  config: RuleAgentConfig,
  signal?: AbortSignal,
  // Let the model think before answering. Off everywhere except the compile
  // step — see the note on `ollamaThinkingControl`.
  allowReasoning = false,
): Promise<string> {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (config.apiKey) {
    headers.authorization = `Bearer ${config.apiKey}`;
  }

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      body: JSON.stringify({
        // Keep the model resident between the sequential preflight calls so we
        // don't pay a cold reload on each step (Ollama honors keep_alive).
        keep_alive: "10m",
        messages: [
          { content: systemPrompt, role: "system" },
          { content: userText, role: "user" },
        ],
        model: config.model,
        max_tokens: config.maxOutputTokens,
        // Rule preflight needs the constrained JSON result, not a hidden
        // reasoning trace. Ollama otherwise enables thinking by default for
        // thinking-capable models.
        ...(allowReasoning ? {} : ollamaThinkingControl(config)),
        response_format: { type: "json_object" },
        seed: config.seed,
        stream: false,
        // Greedy decoding (temperature 0, top_p 1) so the same rule text always
        // compiles to the same on-chain hashes. No nucleus/temperature jitter.
        temperature: 0,
        top_p: 1,
      }),
      headers,
      method: "POST",
      signal: combineAbortSignals(config.timeoutMs, signal),
    });
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
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
    const detail = await response.text().catch(() => "");
    throw new RuleAgentError(
      "RULE_AGENT_UNAVAILABLE",
      `The rule agent returned HTTP ${response.status}. ${detail}`.trim(),
    );
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
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
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent response did not contain any content.",
    );
  }

  return candidate;
}

export async function interpretRuleWithAgent(
  sanitizedText: string,
  config: RuleAgentConfig = resolveRuleAgentConfig(),
  signal?: AbortSignal,
): Promise<RuleAgentInterpretation> {
  const candidate = await requestAgentJson(
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

export async function answerDealerQuestion(
  context: string,
  config: RuleAgentConfig = resolveRuleAgentConfig(),
  signal?: AbortSignal,
): Promise<DealerQuestionAnswer> {
  const candidate = await requestAgentJson(
    buildDealerChatPrompt(),
    context,
    config,
    signal,
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
  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      body: JSON.stringify({
        keep_alive: "10m",
        messages: [
          { content: TRANSLATE_SYSTEM_PROMPT, role: "system" },
          { content: text, role: "user" },
        ],
        model: config.model,
        // The translated sentence is short, but a reasoning model's hidden trace
        // is not: a tight ceiling here truncated the response before the sentence
        // was emitted and surfaced as "the translator returned no text".
        max_tokens: config.maxOutputTokens,
        ...ollamaThinkingControl(config),
        seed: config.seed,
        stream: false,
        temperature: 0,
        top_p: 1,
      }),
      headers,
      method: "POST",
      signal: combineAbortSignals(config.timeoutMs, signal),
    });
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
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
    throw new RuleAgentError(
      "RULE_AGENT_UNAVAILABLE",
      `The translator returned HTTP ${response.status}.`,
    );
  }
  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{
      finish_reason?: unknown;
      message?: { content?: unknown; reasoning?: unknown };
    }>;
  } | null;
  const choice = payload?.choices?.[0];
  if (choice?.finish_reason === "length") {
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
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The translator returned no text.",
    );
  }
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
// json_object response mode is requested (Ollama-compatible). The returned
// object is raw; @tyche/rule-compiler schema-validates the AST, verifies span
// coverage, and executes the examples. This transport function never decides
// validity. Throws a typed RuleAgentError so the caller can escalate.
export async function compileRuleToAst(
  normalizedText: string,
  config: RuleAgentConfig = resolveRuleAgentConfig(),
  signal?: AbortSignal,
): Promise<unknown> {
  // The compile-step guidance lives in the versioned `compile_rule_to_ast` agent
  // skill (PRD §7.10/§7.12), co-located with the DSL schema in @tyche/rule-compiler.
  // The full JSON schema is intentionally NOT embedded (it bloats the prompt and
  // stalls small local models); the skill conveys the grammar compactly and Zod
  // re-validates the output against the real schema.
  const prompt = buildRuleCompilerSkillPrompt();
  for (let attempt = 1; ; attempt += 1) {
    // First ask in the fast, no-trace mode every other step uses. A rule whose
    // AST is small comes back correct and the player pays no extra latency; the
    // shapes that break it are the large nested ones, and those get the thinking
    // re-ask below rather than making every rule wait for a reasoning trace.
    const candidate = await requestAgentJson(
      prompt,
      normalizedText,
      config,
      signal,
      attempt > 1,
    );
    try {
      return extractJsonObject(candidate);
    } catch (error) {
      const retryable =
        error instanceof RuleAgentError &&
        error.code === "RULE_AGENT_BAD_RESPONSE" &&
        attempt < COMPILE_BAD_RESPONSE_ATTEMPTS &&
        !signal?.aborted;
      if (!retryable) {
        throw error;
      }
      console.error(
        `Rule compile attempt ${attempt} returned no usable JSON; retrying.`,
        error instanceof RuleAgentError ? error.detail : "",
      );
    }
  }
}
