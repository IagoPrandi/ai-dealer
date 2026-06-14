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
].join("\n");

export function resolveRuleAgentConfig(
  env: NodeJS.ProcessEnv = process.env,
): RuleAgentConfig {
  const baseUrl = (
    env.LLM_BASE_URL ??
    env.LLM_PRIMARY_BASE_URL ??
    ""
  ).trim();
  const model = (
    env.LLM_MODEL_INTERPRET ??
    env.LLM_MODEL ??
    env.LLM_PRIMARY_MODEL ??
    ""
  ).trim();

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

  return {
    apiKey: (env.LLM_API_KEY ?? "").trim(),
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
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

export async function interpretRuleWithAgent(
  sanitizedText: string,
  config: RuleAgentConfig = resolveRuleAgentConfig(),
): Promise<RuleAgentInterpretation> {
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
          { content: SYSTEM_PROMPT, role: "system" },
          { content: sanitizedText, role: "user" },
        ],
        model: config.model,
        response_format: { type: "json_object" },
        stream: false,
        temperature: 0.2,
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

  const content = (
    payload as { choices?: Array<{ message?: { content?: unknown } }> }
  )?.choices?.[0]?.message?.content;

  if (typeof content !== "string" || content.trim().length === 0) {
    throw new RuleAgentError(
      "RULE_AGENT_BAD_RESPONSE",
      "The rule agent response did not contain any content.",
    );
  }

  return coerceInterpretation(extractJsonObject(content));
}
