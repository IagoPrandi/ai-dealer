import { canonicalJson } from "@tyche/rule-compiler";

import { resolveApiKeyForEndpoint } from "./llm.js";
import {
  digestAiCallInput,
  recordAiCall,
  type AiUsageOutcome,
  type AiUsageStep,
} from "./usage.js";

// Production client for TypeSafe Jev (System One): typed semantic judgments over
// one state and a closed set of questions. Jev never approves a rule on its own;
// the rule pipeline uses it only to block or to route to clarification/review.
// Every failure here is typed and fails closed — a transport error, a malformed
// answer or an unexpected resolved model is never turned into a judgment.

// ---------------------------------------------------------------------------
// Question and answer shapes.

export interface NoulQuestion {
  criteria: { false: string; true: string };
  instructions: string;
  type: "noul";
}

export interface ChoiceQuestion {
  criteria: Record<string, string>;
  instructions: string;
  type: "choice";
}

export interface ScoreQuestion {
  criteria: string[];
  instructions: string;
  type: "score";
}

export type JevQuestion = ChoiceQuestion | NoulQuestion | ScoreQuestion;
export type JevQuestionSet = Record<string, JevQuestion>;

export interface JevChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  type: "choice";
}

export interface JevNoulAnswer {
  noul: number;
  type: "noul";
}

export interface JevScoreAnswer {
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  score: number;
  type: "score";
}

export type JevAnswer = JevChoiceAnswer | JevNoulAnswer | JevScoreAnswer;

export interface ValidatedJevResponse {
  answers: Record<string, JevAnswer>;
  model: string;
  usage: {
    costUsd: number | null;
    inputTokens: number;
    outputTokens: number;
  };
}

function finiteProbability(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${label} must be a finite probability in [0, 1]`);
  }
  return value;
}

function numericUsage(
  usage: Record<string, unknown>,
  snake: string,
  camel: string,
): number {
  const value = usage[snake] ?? usage[camel];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Jev usage.${snake} must be a non-negative number`);
  }
  return value;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function sameKeys(actual: readonly string[], expected: readonly string[]) {
  return (
    JSON.stringify([...actual].sort()) === JSON.stringify([...expected].sort())
  );
}

/**
 * Strict structural validation of a Jev response against the questions asked.
 * Missing, extra, mistyped, non-finite or out-of-range values are rejected;
 * nothing is defaulted.
 */
export function validateJevResponse(
  body: unknown,
  questions: JevQuestionSet,
): ValidatedJevResponse {
  if (!isPlainRecord(body)) {
    throw new Error("Jev response must be an object");
  }
  if (typeof body.model !== "string" || body.model.trim().length === 0) {
    throw new Error("Jev response.model must be a non-empty string");
  }
  if (!isPlainRecord(body.answers)) {
    throw new Error("Jev response.answers must be an object");
  }
  const answers = body.answers;
  const expectedIds = Object.keys(questions).sort();
  const actualIds = Object.keys(answers).sort();
  if (!sameKeys(actualIds, expectedIds)) {
    throw new Error(
      `Jev answer IDs differ: expected ${expectedIds.join(",")}; received ${actualIds.join(",")}`,
    );
  }

  const validated: Record<string, JevAnswer> = {};
  for (const id of expectedIds) {
    const question = questions[id]!;
    const answer = answers[id];
    if (!isPlainRecord(answer)) {
      throw new Error(`Jev answer ${id} must be an object`);
    }
    if (answer.type !== question.type) {
      throw new Error(`Jev answer ${id} has the wrong primitive type`);
    }
    if (question.type === "noul") {
      validated[id] = {
        noul: finiteProbability(answer.noul, `${id}.noul`),
        type: "noul",
      };
      continue;
    }
    if (question.type === "score") {
      if (question.criteria.length < 2 || question.criteria.length > 10) {
        throw new Error(`Jev Score question ${id} must have 2 to 10 levels`);
      }
      const expectedLevels = question.criteria.map((_, index) => String(index));
      if (!isPlainRecord(answer.legend)) {
        throw new Error(`Jev answer ${id}.legend must be an object`);
      }
      const legend = answer.legend;
      if (
        !sameKeys(Object.keys(legend), expectedLevels) ||
        expectedLevels.some(
          (level, index) => legend[level] !== question.criteria[index],
        )
      ) {
        throw new Error(`Jev answer ${id}.legend differs from Score levels`);
      }
      if (!isPlainRecord(answer.probabilities)) {
        throw new Error(`Jev answer ${id}.probabilities must be an object`);
      }
      const probabilityRecord = answer.probabilities;
      if (!sameKeys(Object.keys(probabilityRecord), expectedLevels)) {
        throw new Error(`Jev answer ${id} probabilities differ from Score levels`);
      }
      const probabilities = Object.fromEntries(
        expectedLevels.map((level) => [
          level,
          finiteProbability(probabilityRecord[level], `${id}.${level}`),
        ]),
      );
      const total = Object.values(probabilities).reduce(
        (sum, probability) => sum + probability,
        0,
      );
      if (Math.abs(total - 1) > 0.011) {
        throw new Error(`Jev answer ${id} probabilities must sum to 1`);
      }
      if (
        typeof answer.score !== "number" ||
        !Number.isFinite(answer.score) ||
        answer.score < 0 ||
        answer.score > question.criteria.length - 1
      ) {
        throw new Error(
          `Jev answer ${id}.score must be within the declared level range`,
        );
      }
      validated[id] = {
        confidence: finiteProbability(answer.confidence, `${id}.confidence`),
        legend: Object.fromEntries(
          expectedLevels.map((level, index) => [level, question.criteria[index]!]),
        ),
        probabilities,
        score: answer.score,
        type: "score",
      };
      continue;
    }
    if (typeof answer.choice !== "string" || !(answer.choice in question.criteria)) {
      throw new Error(`Jev answer ${id} selected an undeclared Choice option`);
    }
    if (!isPlainRecord(answer.probabilities)) {
      throw new Error(`Jev answer ${id}.probabilities must be an object`);
    }
    const probabilityRecord = answer.probabilities;
    const expectedOptions = Object.keys(question.criteria).sort();
    if (!sameKeys(Object.keys(probabilityRecord), expectedOptions)) {
      throw new Error(`Jev answer ${id} probabilities differ from Choice options`);
    }
    const probabilities = Object.fromEntries(
      expectedOptions.map((option) => [
        option,
        finiteProbability(probabilityRecord[option], `${id}.${option}`),
      ]),
    );
    const total = Object.values(probabilities).reduce(
      (sum, probability) => sum + probability,
      0,
    );
    // Providers commonly round each displayed probability to two decimals.
    // Accept the resulting 0.99/1.01 totals, but reject wider malformed shapes.
    if (Math.abs(total - 1) > 0.011) {
      throw new Error(`Jev answer ${id} probabilities must sum to 1`);
    }
    validated[id] = {
      choice: answer.choice,
      confidence: finiteProbability(answer.confidence, `${id}.confidence`),
      probabilities,
      type: "choice",
    };
  }

  if (!isPlainRecord(body.usage)) {
    throw new Error("Jev response.usage must be an object");
  }
  const usage = body.usage;
  const rawCost = usage.cost ?? usage.cost_usd;
  if (
    rawCost !== undefined &&
    (typeof rawCost !== "number" || !Number.isFinite(rawCost) || rawCost < 0)
  ) {
    throw new Error("Jev usage cost must be a non-negative number");
  }
  return {
    answers: validated,
    model: body.model,
    usage: {
      costUsd: rawCost === undefined ? null : rawCost,
      inputTokens: numericUsage(usage, "input_tokens", "prompt_tokens"),
      outputTokens: numericUsage(usage, "output_tokens", "completion_tokens"),
    },
  };
}

/** P(yes) of one Noul answer. Throws when the answer is missing or not a Noul. */
export function noulAnswer(response: ValidatedJevResponse, id: string): number {
  const answer = response.answers[id];
  if (!answer || answer.type !== "noul") {
    throw new Error(`Missing Noul answer ${id}`);
  }
  return answer.noul;
}

export function choiceAnswer(
  response: ValidatedJevResponse,
  id: string,
): JevChoiceAnswer {
  const answer = response.answers[id];
  if (!answer || answer.type !== "choice") {
    throw new Error(`Missing Choice answer ${id}`);
  }
  return answer;
}

export function scoreAnswer(
  response: ValidatedJevResponse,
  id: string,
): JevScoreAnswer {
  const answer = response.answers[id];
  if (!answer || answer.type !== "score") {
    throw new Error(`Missing Score answer ${id}`);
  }
  return answer;
}

/**
 * Noul bands used by every rule-pipeline gate (J8-J10 experiment policy, not
 * calibrated release thresholds): at or above YES is a confident yes, at or
 * below NO a confident no, anything between is uncertain.
 */
export const JEV_NOUL_YES = 0.8;
export const JEV_NOUL_NO = 0.2;

export type NoulBand = "no" | "uncertain" | "yes";

export function noulBand(value: number): NoulBand {
  if (value >= JEV_NOUL_YES) return "yes";
  if (value <= JEV_NOUL_NO) return "no";
  return "uncertain";
}

/** Question helper for the closed yes/no judgments the rule pipeline asks. */
export function yesNoQuestion(instructions: string): NoulQuestion {
  return {
    criteria: {
      false: "No. The supplied evidence does not establish this.",
      true: "Yes. The supplied evidence establishes this.",
    },
    instructions,
    type: "noul",
  };
}

// ---------------------------------------------------------------------------
// Configuration.

/**
 * OpenRouter's Decisions endpoint serves Jev. The tilde alias is the one that
 * endpoint resolves; `typesafe/jev-latest` without it does not.
 */
export const JEV_DEFAULT_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
export const JEV_DEFAULT_MODEL = "~typesafe/jev-latest";
/** The model the J6-J10 evaluations measured. A different resolution is drift. */
export const JEV_DEFAULT_EXPECTED_MODEL = "typesafe/jev-1.13-20260917";
const JEV_DEFAULT_TIMEOUT_MS = 30_000;
const JEV_TRANSPORT_ATTEMPTS = 2;

export interface JevConfig {
  apiKey: string;
  endpoint: string;
  /** The resolved model every response must report. */
  expectedModel: string;
  /** The model alias sent with each request. */
  model: string;
  timeoutMs: number;
}

export type JevErrorCode =
  | "JEV_BAD_RESPONSE"
  | "JEV_MODEL_DRIFT"
  | "JEV_NOT_CONFIGURED"
  | "JEV_TIMEOUT"
  | "JEV_UNAVAILABLE";

export class JevError extends Error {
  readonly code: JevErrorCode;
  /** HTTP status of the failing response, when there was one. */
  readonly status: number | undefined;

  constructor(code: JevErrorCode, message: string, status?: number) {
    super(message);
    this.name = "JevError";
    this.code = code;
    this.status = status;
  }
}

function cleanEnvValue(value: string | undefined): string {
  return (value ?? "").replace(/\s+#.*$/u, "").trim();
}

export function resolveJevConfig(
  env: NodeJS.ProcessEnv = process.env,
): JevConfig {
  const endpoint = cleanEnvValue(env.JEV_ENDPOINT) || JEV_DEFAULT_ENDPOINT;
  const timeoutValue = cleanEnvValue(env.JEV_TIMEOUT_MS);
  const timeoutMs = timeoutValue ? Number(timeoutValue) : JEV_DEFAULT_TIMEOUT_MS;
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1_000) {
    throw new JevError(
      "JEV_NOT_CONFIGURED",
      "JEV_TIMEOUT_MS must be an integer of at least 1000 milliseconds.",
    );
  }
  let apiKey: string;
  try {
    apiKey = resolveApiKeyForEndpoint(endpoint, env);
  } catch (error) {
    throw new JevError(
      "JEV_NOT_CONFIGURED",
      error instanceof Error ? error.message : String(error),
    );
  }
  if (!apiKey) {
    throw new JevError(
      "JEV_NOT_CONFIGURED",
      `No API key is configured for the Jev endpoint ${endpoint}.`,
    );
  }
  return {
    apiKey,
    endpoint,
    expectedModel:
      cleanEnvValue(env.JEV_EXPECTED_MODEL) || JEV_DEFAULT_EXPECTED_MODEL,
    model: cleanEnvValue(env.JEV_MODEL) || JEV_DEFAULT_MODEL,
    timeoutMs,
  };
}

// ---------------------------------------------------------------------------
// Transport.

function providerLabel(endpoint: string): string {
  try {
    return new URL(endpoint).hostname === "openrouter.ai" ? "openrouter" : "typesafe";
  } catch {
    return "typesafe";
  }
}

function isRetryable(error: unknown): boolean {
  return (
    error instanceof JevError &&
    (error.code === "JEV_TIMEOUT" ||
      (error.code === "JEV_UNAVAILABLE" &&
        (error.status === undefined || error.status === 429 || error.status >= 500)))
  );
}

async function sendOnce(
  config: JevConfig,
  body: string,
  signal: AbortSignal | undefined,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(config.endpoint, {
      body,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(config.timeoutMs), signal])
        : AbortSignal.timeout(config.timeoutMs),
    });
  } catch (error) {
    if (signal?.aborted) {
      throw signal.reason ?? error;
    }
    if (error instanceof Error && error.name === "TimeoutError") {
      throw new JevError("JEV_TIMEOUT", "The semantic checker did not respond in time.");
    }
    throw new JevError(
      "JEV_UNAVAILABLE",
      `The semantic checker is unreachable: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 300);
    throw new JevError(
      response.status === 401 || response.status === 403
        ? "JEV_NOT_CONFIGURED"
        : "JEV_UNAVAILABLE",
      `The semantic checker returned HTTP ${response.status}. ${detail}`.trim(),
      response.status,
    );
  }
  try {
    return await response.json();
  } catch {
    throw new JevError("JEV_BAD_RESPONSE", "The semantic checker response was not JSON.");
  }
}

/**
 * One Jev judgment: POST `{model, questions, state}`, validate strictly, and
 * require the pinned resolved model. One retry on a timeout, an unreachable
 * endpoint, HTTP 429 or a 5xx; everything else fails on the first attempt.
 * Every attempt is recorded against the ambient usage scope.
 */
export async function requestJevJudgment(args: {
  config: JevConfig;
  questions: JevQuestionSet;
  signal?: AbortSignal | undefined;
  state: unknown;
  step: AiUsageStep;
}): Promise<ValidatedJevResponse> {
  const { config, questions, signal, state, step } = args;
  const body = JSON.stringify({ model: config.model, questions, state });
  const inputDigest = digestAiCallInput([canonicalJson(questions), canonicalJson(state)]);
  for (let attempt = 1; ; attempt += 1) {
    const startedAt = new Date().toISOString();
    const startedAtMs = performance.now();
    const record = (outcome: AiUsageOutcome, response: ValidatedJevResponse | null) =>
      recordAiCall({
        completionTokens: response?.usage.outputTokens ?? null,
        durationMs: performance.now() - startedAtMs,
        inputDigest,
        model: config.model,
        outcome,
        promptTokens: response?.usage.inputTokens ?? null,
        provider: providerLabel(config.endpoint),
        providerCostUsd: response?.usage.costUsd ?? null,
        startedAt,
        step,
      });
    try {
      const raw = await sendOnce(config, body, signal);
      let validated: ValidatedJevResponse;
      try {
        validated = validateJevResponse(raw, questions);
      } catch (error) {
        throw new JevError(
          "JEV_BAD_RESPONSE",
          `The semantic checker returned a malformed judgment: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
      if (validated.model !== config.expectedModel) {
        record("error", validated);
        throw new JevError(
          "JEV_MODEL_DRIFT",
          `The semantic checker resolved to ${validated.model}; ${config.expectedModel} is required.`,
        );
      }
      record("ok", validated);
      return validated;
    } catch (error) {
      if (signal?.aborted) {
        throw signal.reason ?? error;
      }
      if (!(error instanceof JevError && error.code === "JEV_MODEL_DRIFT")) {
        record("error", null);
      }
      if (attempt >= JEV_TRANSPORT_ATTEMPTS || !isRetryable(error)) {
        throw error;
      }
      await new Promise((done) => setTimeout(done, 250 * attempt));
    }
  }
}

const ALIAS_CHECK_QUESTIONS: JevQuestionSet = {
  alias_check: {
    criteria: {
      false: "No. `text` is empty.",
      true: "Yes. `text` contains a word.",
    },
    instructions: "Does `text` contain a word?",
    type: "noul",
  },
};

/**
 * Proves at startup that the configured alias resolves to the pinned model, so
 * a silent upgrade surfaces in the boot log before a player's rule meets it.
 * The per-call drift check stays authoritative either way.
 */
export async function verifyJevModelAlias(
  config: JevConfig,
  signal?: AbortSignal,
): Promise<string> {
  const response = await requestJevJudgment({
    config,
    questions: ALIAS_CHECK_QUESTIONS,
    signal,
    state: { text: "ping" },
    step: "semantic_check",
  });
  return response.model;
}
