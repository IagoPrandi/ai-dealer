import { buildRuleCompilerSkillPrompt } from "@tyche/rule-compiler";

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

  constructor(code: RuleAgentErrorCode, message: string) {
    super(message);
    this.name = "RuleAgentError";
    this.code = code;
  }
}

// Local rule/guardian chains can take several minutes for a single proposal.
// Never let a stale environment value reduce the user-visible response window.
const MIN_TIMEOUT_MS = 300_000;
const DEFAULT_TIMEOUT_MS = MIN_TIMEOUT_MS;
// Fixed seed + temperature 0 make the dealer deterministic: the same rule text
// always compiles to the same normalized rule, which the on-chain hashes depend
// on. Override with LLM_SEED only if you intentionally want a different anchor.
const DEFAULT_SEED = 7;

const SYSTEM_PROMPT = [
  "You are the Tyche Dealer, the AI Rule Compiler for an on-chain lottery game.",
  "A player proposes an alternative winning rule in natural language. You convert",
  "their intent into a single, objective, measurable winning condition.",
  "",
  "Hard constraints:",
  "- A rule may only reference the player's `guess` (6 numbers, 1-100) and the",
  "  official `draw` (6 numbers, 1-100), and comparisons between them.",
  "- A rule must NOT depend on wallets, votes, prize pool, time, history, other",
  "  players, randomness, external data, or any identity.",
  "- Preserve the player's core intent. You may add objective operational guard",
  "  clauses (range guards, defined division, bounded removal, tie handling) only",
  "  when needed to make the rule safe and executable. Never invent a different",
  "  objective and never make a vague rule objective without flagging it.",
  "- Rewrite first-person wording such as 'I win' as a universal condition:",
  "  'A guess wins if ...'. A proposed rule applies to every eligible guess,",
  "  never only to its creator.",
  "- State whether the executable condition uses the guess, the draw, or both.",
  "  If it ignores the guess, explicitly say every eligible guess receives the",
  "  same result. If it ignores the draw, explicitly say the result is fixed",
  "  before the draw. Treat either consequence as requiring confirmation unless",
  "  the player explicitly requested it.",
  "- Never silently choose inclusive or exclusive numeric range endpoints. If",
  "  the player did not explicitly define the boundary behavior, set",
  "  needsClarification to true and ask whether both endpoints are included.",
  "- If the rule is too vague to interpret objectively, set needsClarification to",
  "  true and explain what is missing in clarityNote.",
  "- Treat the player's explicit semantics as invariants along four dimensions:",
  "  quantity/comparator, property being compared, positional/order relation,",
  "  and polarity/direction. A clarification may vary only a dimension that is",
  "  genuinely missing or ambiguous. Never drop, weaken, or invent one.",
  "- When clarification is needed, return 1-3 short clarificationQuestions that",
  "  name the missing dimensions and 0-3 suggestedRewrites. Every suggestion must",
  "  be a complete executable rule derived from this player's rule, preserve every",
  "  explicit invariant, and differ only on an ambiguity named by a question.",
  "  Never offer stock examples, generic match-count rules, arbitrary thresholds,",
  "  or unrelated replacement rules. If no faithful complete rewrite can be",
  "  inferred, return an empty suggestedRewrites array.",
  "- Preserve polarity and direction EXACTLY. 'more/most' = maximize; 'fewer/",
  "  least' = minimize. 'miss/wrong/errar' means numbers in the guess that do NOT",
  "  appear in the draw — count those; never silently flip it to 'correct'.",
  "- 'at least N' / 'N or more' / 'N or more numbers' is an ABSOLUTE threshold (a",
  "  fixed count for each guess), NOT a comparison between players. Keep it as a",
  "  threshold even when the phrasing also says 'or more'.",
  "- 'win if' means an absolute predicate for each guess unless the player clearly",
  "  asks for a comparative ranking such as 'the most', 'the fewest', or",
  "  'closest among all guesses'. Do not rewrite 'win if the smallest guessed",
  "  number equals the smallest drawn number' as a lowest-number competition.",
  "- A comparative match-count ranking is valid even when the wording is terse or",
  "  ungrammatical. 'whoever guesses more numbers wins', 'win who guess more",
  "  number', 'most matches wins', and 'matches more numbers than anyone else' all",
  "  mean the same thing: rank each guess by how many of its numbers appear in the",
  "  official draw; the highest count wins ('fewest/least' = lowest count wins).",
  "  Treat these as valid rankings. Do NOT set needsClarification just because the",
  "  phrasing is short or informal.",
  "- Min/max comparisons are direct comparisons between the guess and draw.",
  "  'smallest guessed number equals the smallest drawn number' means",
  "  min(guess) == min(draw). 'largest guessed number is greater than the",
  "  largest drawn number' means max(guess) > max(draw).",
  "- Casual objective wording is valid when it contains a measurable threshold:",
  "  'four or more picked numbers show up in the result' means at least 4 guessed",
  "  numbers appear in the draw, regardless of order.",
  "- Position-specific wording is objective: 'second guessed number equals the",
  "  second drawn number' means guess[2] == draw[2] using 1-based user positions;",
  "  'first pick is higher than the first drawn number' means guess[1] > draw[1].",
  "- Absolute position-by-position distance is objective: 'absolute difference",
  "  between each guessed number and drawn number in the same position is at most",
  "  5' means every same-position pair has absolute difference <= 5.",
  "- Exact same-position match counts are objective: 'exactly 2 guessed numbers",
  "  match in the same position' means count positions where guess[i] == draw[i]",
  "  and require that count to equal 2.",
  "- Exact same-position comparison counts are objective: 'exactly 2 guessed",
  "  numbers are greater than the drawn number in the same position' means count",
  "  positions where guess[i] > draw[i] and require that count to equal 2.",
  "- Total position-by-position distance is objective: 'total absolute",
  "  position-by-position difference between guess and draw is 30 or less' means",
  "  sum abs(guess[i] - draw[i]) over all positions and require the sum <= 30.",
  "- Digit and filtered-count wording is objective when it names the property:",
  "  same last digit as any drawn number, odd-number sums, multiples of 5 counts,",
  "  and same number of evens are all direct guess-vs-draw predicates.",
  "- Low/high pair sums and inclusive ranges are objective: compare sums of the",
  "  two smallest/largest values after sorting, or require every guessed number",
  "  to be between min(draw) and max(draw), inclusive.",
  "- Bounded removal is objective when the removal strategy and count are named:",
  "  'ignore my highest picked number, then the rest total the full draw' means",
  "  remove_up_to_n(guess, 1, highest), sum the remaining guess numbers, and",
  "  compare that sum to sum(draw). 'drop up to two lowest picks, then still",
  "  have three numbers in the draw' means remove_up_to_n(guess, 2, lowest),",
  "  intersect with draw, and require count >= 3.",
  "- Guarded mapped values are objective: 'doubling each pick stays within 1 to",
  "  100, at least three doubled values are in the draw' means map_with_guard",
  "  guess * 2 with inclusive range 1-100 and drop mapped values outside that",
  "  range before intersecting with draw.",
  "- Split-count and slice wording is objective: 'below-50 split' compares the",
  "  count of guess values < 50 to the count of draw values < 50; 'first three",
  "  picks add up to first three drawn numbers' sums slice(guess,0,3) and",
  "  slice(draw,0,3); 'last three' sums slice(guess,3) and slice(draw,3).",
  "- Position-by-position odd/even wording is objective: compare guess[i] mod 2",
  "  to draw[i] mod 2 for every position. Do not compile it as numeric",
  "  closeness.",
  "- 'within N of at least one drawn number' is NOT same-position closeness.",
  "  Compile it as value_within_any_count_at_least: count guess values whose",
  "  absolute distance to ANY draw value is <= N, and require the named count.",
  "- Sum modulo wording is objective: 'last digit of the totals matters' or",
  "  'sum modulo 10 equals draw sum modulo 10' means (sum(guess) mod 10) =",
  "  (sum(draw) mod 10).",
  "- Reverse-order wording needs precision. If the player only says 'match the",
  "  draw in reverse', ask for clarification. If they define positions 1->6,",
  "  2->5, etc., treat it as all 6 reversed positions matching. If they say at",
  "  least N reversed positions must match, use that N as a predicate threshold.",
  "- Keep compound rules compound: 'A and B' must stay a conjunction of both",
  "  conditions; 'A or B' a disjunction. Do not drop a clause.",
  "- 'same set of numbers, regardless of order' means all 6 guessed numbers",
  "  appear in the draw with order ignored. Compile it as count(intersection",
  "  (guess, draw)) == 6, not as ordered equality or a highest-count ranking.",
  "- 'dezena' is ambiguous: it can mean a drawn number (Brazilian lottery sense)",
  "  or the tens digit of a number. If the player's intent is unclear, set",
  "  needsClarification and ask which meaning they want.",
  "- A same-order example such as draw 12 31 24 versus guess 11 30 29, explained",
  "  as matching 10 30 20, is NOT full-number equality and is not unordered digit",
  "  matching. It explicitly means that every corresponding pair belongs to the",
  "  same tens range after integer division by 10. Preserve 'all' and the",
  "  position-by-position order in both the normalized rule and its AST.",
  "- An example where a pick such as 12 is said to win after 10 and 20 are",
  "  drawn because of 'number 1' or 'number 2' is ambiguous. Ask whether the",
  "  player means the tens digit, units digit, or either digit; never infer it.",
  "",
  "Respond with a single JSON object and nothing else, using exactly these keys:",
  '{"title": string, "normalizedText": string, "officialInterpretation": string,',
  ' "addedOperationalClauses": string[], "needsClarification": boolean,',
  ' "clarityNote": string, "clarificationQuestions": string[],',
  ' "suggestedRewrites": string[], "dealerMessage": string}',
  "- title: a concise 2-6 word English UI title that summarizes the executable",
  "  condition. It must describe the normalized rule, never copy the player's",
  "  prompt verbatim, and must not promise a winner when clarification is needed.",
  "- normalizedText: the rule rewritten in clear English as one measurable sentence.",
  "- officialInterpretation: clear English explaining how the engine evaluates",
  "  every eligible guess, including any shared-outcome or draw-independent consequence.",
  "- addedOperationalClauses: each guard clause you added (empty array if none).",
  "- dealerMessage: a short, friendly note in English to the player about what",
  "  you understood (1-2 sentences). It must name every material consequence",
  "  that requires confirmation.",
  "",
  "Do not think out loud or add any text before or after the JSON. Output the",
  "JSON object only. Be deterministic: identical input must produce identical",
  "output.",
  "",
  "Example input: the guess with the most drawn numbers wins",
  'Example output: {"title":"Most Numbers Match","normalizedText":"The winning guess is the one whose six',
  ' numbers include the most numbers that also appear in the official draw.",',
  ' "officialInterpretation":"For each guess, count how many of its six numbers',
  ' appear in the six-number official draw; the highest count wins.",',
  ' "addedOperationalClauses":["If two or more guesses tie on the count, the',
  ' earliest valid submission wins."],"needsClarification":false,',
  ' "clarityNote":"","clarificationQuestions":[],"suggestedRewrites":[],',
  ' "dealerMessage":"Got it - the guess matching the most',
  ' drawn numbers takes the round."}',
].join("\n");

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
  return cleanEnvValue(env.LLM_TRANSLATE_TO_ENGLISH ?? "true").toLowerCase() !== "false";
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

  const timeoutRaw = Number(cleanEnvValue(env.LLM_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw >= MIN_TIMEOUT_MS
      ? timeoutRaw
      : MIN_TIMEOUT_MS;

  const seedRaw = Number(cleanEnvValue(env.LLM_SEED) || DEFAULT_SEED);
  const seed = Number.isInteger(seedRaw) ? seedRaw : DEFAULT_SEED;

  return {
    apiKey: cleanEnvValue(env.LLM_API_KEY),
    baseUrl: baseUrl.replace(/\/+$/, ""),
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

  try {
    return JSON.parse(withoutFences.slice(start, end + 1));
  } catch {
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent returned malformed JSON.",
    );
  }
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
        max_tokens: 2_048,
        // Rule preflight needs the constrained JSON result, not a hidden
        // reasoning trace. Ollama otherwise enables thinking by default for
        // thinking-capable models.
        ...ollamaThinkingControl(config),
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

  const message = (
    payload as {
      choices?: Array<{
        message?: { content?: unknown; reasoning?: unknown };
      }>;
    }
  )?.choices?.[0]?.message;

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
    SYSTEM_PROMPT,
    sanitizedText,
    config,
    signal,
  );
  return coerceInterpretation(extractJsonObject(candidate));
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
  const headers: Record<string, string> = { "content-type": "application/json" };
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
        max_tokens: 256,
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
      throw new RuleAgentError("RULE_AGENT_TIMEOUT", "The translator did not respond in time.");
    }
    throw new RuleAgentError(
      "RULE_AGENT_UNAVAILABLE",
      `The translator endpoint is unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    throw new RuleAgentError("RULE_AGENT_UNAVAILABLE", `The translator returned HTTP ${response.status}.`);
  }
  const payload = (await response.json().catch(() => null)) as {
    choices?: Array<{ message?: { content?: unknown; reasoning?: unknown } }>;
  } | null;
  const message = payload?.choices?.[0]?.message;
  const raw = typeof message?.content === "string" ? message.content : "";
  const reasoning = typeof message?.reasoning === "string" ? message.reasoning : "";
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim() || reasoning.trim();
  // Strip wrapping quotes the model sometimes adds.
  const englishText = cleaned.replace(/^["'`]+|["'`]+$/g, "").trim();
  if (!englishText) {
    throw new RuleAgentError("RULE_AGENT_BAD_RESPONSE", "The translator returned no text.");
  }
  return englishText;
}

// Compile step (PRD §7.3.1): ask the model to EMIT a rule AST conforming to the
// DSL JSON schema. The JSON schema is embedded in the prompt and json_object
// response mode is requested (Ollama-compatible). The returned object is raw and
// is schema-validated by @tyche/rule-compiler — this function never decides
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
  const candidate = await requestAgentJson(
    buildRuleCompilerSkillPrompt(),
    normalizedText,
    config,
    signal,
  );
  return extractJsonObject(candidate);
}
