// Real AI Rule Compiler bridge. Talks to an OpenAI-compatible chat-completions
// endpoint (local Ollama / vLLM / llama.cpp, or a cloud provider) so the dealer
// actually interprets and normalizes a proposed rule before it is submitted
// on-chain. There is intentionally NO silent template fallback: if the model is
// unreachable or returns an unusable response, this throws a typed error so the
// caller can surface it to the user instead of hiding the failure.

export interface RuleAgentInterpretation {
  addedOperationalClauses: string[];
  clarityNote: string;
  dealerMessage: string;
  needsClarification: boolean;
  normalizedText: string;
  officialInterpretation: string;
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

const DEFAULT_TIMEOUT_MS = 30_000;
// Fixed seed + temperature 0 make the dealer deterministic: the same rule text
// always compiles to the same normalized rule, which the on-chain hashes depend
// on. Override with LLM_SEED only if you intentionally want a different anchor.
const DEFAULT_SEED = 7;

const SYSTEM_PROMPT = [
  "You are the Idealer Dealer, the AI Rule Compiler for an on-chain lottery game.",
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
  "- If the rule is too vague to interpret objectively, set needsClarification to",
  "  true and explain what is missing in clarityNote.",
  "",
  "Respond with a single JSON object and nothing else, using exactly these keys:",
  '{"normalizedText": string, "officialInterpretation": string,',
  ' "addedOperationalClauses": string[], "needsClarification": boolean,',
  ' "clarityNote": string, "dealerMessage": string}',
  "- normalizedText: the rule rewritten as one clear, measurable sentence.",
  "- officialInterpretation: how the engine will compare every eligible guess.",
  "- addedOperationalClauses: each guard clause you added (empty array if none).",
  "- dealerMessage: a short, friendly note in English to the player about what",
  "  you understood (1-2 sentences).",
  "",
  "Do not think out loud or add any text before or after the JSON. Output the",
  "JSON object only. Be deterministic: identical input must produce identical",
  "output.",
  "",
  "Example input: the guess with the most drawn numbers wins",
  'Example output: {"normalizedText":"The winning guess is the one whose six',
  ' numbers include the most numbers that also appear in the official draw.",',
  ' "officialInterpretation":"For each guess, count how many of its six numbers',
  ' appear in the six-number official draw; the highest count wins.",',
  ' "addedOperationalClauses":["If two or more guesses tie on the count, the',
  ' earliest valid submission wins."],"needsClarification":false,',
  ' "clarityNote":"","dealerMessage":"Got it - the guess matching the most',
  ' drawn numbers takes the round."}',
].join("\n");

// Returns the first env var that is set AND non-blank. We deliberately do NOT
// use `??` here: optional overrides like LLM_MODEL_INTERPRET are commonly
// present but empty (`LLM_MODEL_INTERPRET=`), and `??` only falls through on
// null/undefined, so an empty override would shadow the real LLM_MODEL value.
function firstConfigured(...values: Array<string | undefined>): string {
  for (const value of values) {
    const trimmed = value?.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return "";
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

  const timeoutRaw = Number(env.LLM_TIMEOUT_MS ?? DEFAULT_TIMEOUT_MS);
  const timeoutMs =
    Number.isFinite(timeoutRaw) && timeoutRaw > 0
      ? timeoutRaw
      : DEFAULT_TIMEOUT_MS;

  const seedRaw = Number(env.LLM_SEED ?? DEFAULT_SEED);
  const seed = Number.isInteger(seedRaw) ? seedRaw : DEFAULT_SEED;

  return {
    apiKey: (env.LLM_API_KEY ?? "").trim(),
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
    seed,
    timeoutMs,
  };
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

  if (!normalizedText || !officialInterpretation) {
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent omitted the normalized rule or official interpretation.",
    );
  }

  const addedOperationalClauses = Array.isArray(record.addedOperationalClauses)
    ? record.addedOperationalClauses
        .filter((clause): clause is string => typeof clause === "string")
        .map((clause) => clause.trim())
        .filter((clause) => clause.length > 0)
    : [];

  return {
    addedOperationalClauses,
    clarityNote:
      typeof record.clarityNote === "string" ? record.clarityNote.trim() : "",
    dealerMessage:
      typeof record.dealerMessage === "string"
        ? record.dealerMessage.trim()
        : "",
    needsClarification: record.needsClarification === true,
    normalizedText,
    officialInterpretation,
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
        messages: [
          { content: systemPrompt, role: "system" },
          { content: userText, role: "user" },
        ],
        model: config.model,
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
      signal: AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
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
): Promise<RuleAgentInterpretation> {
  const candidate = await requestAgentJson(SYSTEM_PROMPT, sanitizedText, config);
  return coerceInterpretation(extractJsonObject(candidate));
}

// Compile step (PRD §7.3.1): ask the model to EMIT a rule AST conforming to the
// DSL JSON schema. The JSON schema is embedded in the prompt and json_object
// response mode is requested (Ollama-compatible). The returned object is raw and
// is schema-validated by @idealer/rule-compiler — this function never decides
// validity. Throws a typed RuleAgentError so the caller can escalate.
export async function compileRuleToAst(
  normalizedText: string,
  config: RuleAgentConfig = resolveRuleAgentConfig(),
): Promise<unknown> {
  // The grammar is conveyed compactly (node list + two worked examples) rather
  // than by embedding the full JSON schema, which bloats the prompt and stalls
  // small local models. Zod re-validates the output against the real schema, so
  // syntactic guidance here is enough.
  const systemPrompt = [
    "You are the Idealer Rule Compiler. Convert the player's winning rule into a",
    "single JSON object (a rule AST). Output the JSON object only — no prose, no",
    "markdown, no comments.",
    "",
    "The AST may only read `guess` (the player's 6 numbers) and `draw` (the 6",
    "official numbers). Top-level shape: {\"schemaVersion\":2,\"result\":<result>}.",
    "<result> is either:",
    '  {"type":"predicate","predicate":<pred>}  — absolute win/lose per guess, or',
    '  {"type":"ranking","direction":"max"|"min","tieBreak":"share_pool",',
    '   "score":<scalar>}  — best score wins (use for "whoever matches the most ...").',
    "",
    "Array nodes: {\"kind\":\"source\",\"source\":\"guess\"|\"draw\"};",
    '  {"kind":"digits","place":"units"|"tens","of":<array>};',
    '  {"kind":"intersection"|"difference","left":<array>,"right":<array>};',
    '  {"kind":"map_arithmetic","op":"add"|"sub"|"mul"|"div"|"mod","operand":<int>,"of":<array>}.',
    "Scalar nodes: {\"kind\":\"lit\",\"value\":<int>};",
    '  {"kind":"reduce","op":"sum"|"product"|"count"|"min"|"max"|"range_span","of":<array>};',
    '  {"kind":"arith","op":...,"left":<scalar>,"right":<scalar>};{"kind":"at","index":<int>,"of":<array>}.',
    "Predicate nodes: {\"kind\":\"compare\",\"op\":\"eq\"|\"neq\"|\"lt\"|\"lte\"|\"gt\"|\"gte\",\"left\":<scalar>,\"right\":<scalar>};",
    '  {"kind":"count_at_least","value":<int>,"of":<array>};{"kind":"and"|"or","clauses":[<pred>...]};{"kind":"not","clause":<pred>}.',
    "",
    'Example "whoever matches the most units digits": {"schemaVersion":2,"result":',
    '{"type":"ranking","direction":"max","tieBreak":"share_pool","score":{"kind":',
    '"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"digits",',
    '"place":"units","of":{"kind":"source","source":"guess"}},"right":{"kind":',
    '"digits","place":"units","of":{"kind":"source","source":"draw"}}}}}}',
    "",
    'Example "win if at least 4 of your numbers are drawn": {"schemaVersion":2,',
    '"result":{"type":"predicate","predicate":{"kind":"count_at_least","value":4,',
    '"of":{"kind":"intersection","left":{"kind":"source","source":"guess"},',
    '"right":{"kind":"source","source":"draw"}}}}}',
  ].join("\n");

  const candidate = await requestAgentJson(systemPrompt, normalizedText, config);
  return extractJsonObject(candidate);
}
