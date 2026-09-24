import { renameSync, readFileSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { canonicalJson, sha256Canonical, validateJevResponse, type JevQuestionSet, type ValidatedJevResponse } from "../src/jevPipelineEvaluation.js";
import {
  buildLedgerQuestions,
  buildPublicLedgerState,
  checkClaimLedger,
  deriveLedgerJudgment,
  J8_LEDGER_SYSTEM_PROMPT,
  parseClaimLedger,
  type ClaimLedger,
  type LedgerDefect,
  type LedgerJudgment,
} from "../src/jevPipelineJ8Evaluation.js";
import type { Item } from "./jev-pipeline-items.mjs";

// Provider plumbing shared by the J8/J9 runners: Jev and OpenRouter chat calls
// with bounded transport retry, explicit error classes, and the J8 claim-ledger
// stage. Nothing here maps a failure to a permissive result.

export interface ProviderOptions {
  expectedResolvedModel: string;
  failureInjection: FailureInjection;
  live: boolean;
}

export const JEV_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
export const LLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";
export const JEV_REQUESTED_MODEL = "~typesafe/jev-latest";
export const DEFAULT_RESOLVED_JEV = "typesafe/jev-1.13-20260917";


export type FailureInjection = "jev_malformed" | "jev_timeout" | "llm_malformed" | "none" | "storage_failure";


export interface CallTiming {
  attempts: number;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  providerMs: number | null;
  wallMs: number;
}

export interface JevCall {
  errorClass: string | null;
  errorMessage: string | null;
  questionSetHash: string;
  resolvedModel: string | null;
  response: ValidatedJevResponse | null;
  stateHash: string;
  timing: CallTiming;
}

export interface LlmAttempt {
  costUsd: number | null;
  defects: LedgerDefect[];
  errorClass: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  outputTokens: number | null;
  providerMs: number;
  raw: string | null;
  resolvedModel: string | null;
}


export class EvaluationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EvaluationError";
  }
}


export function loadRootEnvironment(): void {
  const content = readFileSync(new URL("../../../.env", import.meta.url), "utf8");
  for (const line of content.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match || process.env[match[1]!]) continue;
    const value = match[2]!.replace(/\s+#.*$/u, "").trim().replace(/^['"]|['"]$/gu, "");
    if (value) process.env[match[1]!] = value;
  }
}

export function openRouterKey(): string {
  const key = process.env.API_KEY_OPENROUTER?.trim();
  if (!key) throw new EvaluationError("CONFIGURATION_ERROR", "API_KEY_OPENROUTER is not configured");
  return key;
}

export function ledgerModel(): string {
  const model = process.env.LLM_MODEL_COMPILE?.trim();
  if (!model) throw new EvaluationError("CONFIGURATION_ERROR", "LLM_MODEL_COMPILE is not configured");
  return model;
}

export function classifyError(error: unknown): { code: string; message: string } {
  if (error instanceof EvaluationError) return { code: error.code, message: error.message };
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || /timeout|timed out/iu.test(error.message)) return { code: "SERVICE_TIMEOUT", message: error.message };
    if (/answer|response|probabilit|usage|primitive|noul|score|legend/iu.test(error.message)) return { code: "SCHEMA_ERROR", message: error.message };
    return { code: "SERVICE_FAILURE", message: error.message };
  }
  return { code: "UNKNOWN", message: String(error) };
}

export const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));


export async function callJev(state: unknown, questions: JevQuestionSet, options: ProviderOptions, oracle: (() => unknown) | null): Promise<JevCall> {
  const started = performance.now();
  const stateHash = sha256Canonical(state);
  const questionSetHash = sha256Canonical(questions);
  let lastError: unknown = null;
  let attempt = 1;
  for (; attempt <= 2; attempt += 1) {
    try {
      if (options.failureInjection === "jev_timeout") throw new EvaluationError("SERVICE_TIMEOUT", "Injected Jev timeout");
      if (options.failureInjection === "jev_malformed") validateJevResponse({ answers: {}, model: "injected", usage: {} }, questions);
      const providerStarted = performance.now();
      let body: unknown;
      if (oracle) {
        body = oracle();
      } else {
        const response = await fetch(JEV_ENDPOINT, {
          body: JSON.stringify({ model: JEV_REQUESTED_MODEL, questions, state }),
          headers: { authorization: `Bearer ${openRouterKey()}`, "content-type": "application/json" },
          method: "POST",
          signal: AbortSignal.timeout(30_000),
        });
        body = await response.json().catch(() => null);
        if (!response.ok) {
          throw new EvaluationError(response.status === 429 || response.status >= 500 ? "RETRYABLE_HTTP" : "SERVICE_HTTP", `Jev returned HTTP ${response.status}`);
        }
      }
      const providerMs = Math.round(performance.now() - providerStarted);
      const validated = validateJevResponse(body, questions);
      if (!oracle && validated.model !== options.expectedResolvedModel) {
        throw new EvaluationError("MODEL_DRIFT", `Expected ${options.expectedResolvedModel}; received ${validated.model}`);
      }
      return {
        errorClass: null,
        errorMessage: null,
        questionSetHash,
        resolvedModel: validated.model,
        response: validated,
        stateHash,
        timing: {
          attempts: attempt,
          costUsd: validated.usage.costUsd,
          inputTokens: validated.usage.inputTokens,
          outputTokens: validated.usage.outputTokens,
          providerMs,
          wallMs: Math.round(performance.now() - started),
        },
      };
    } catch (error) {
      lastError = error;
      const { code } = classifyError(error);
      if (!(code === "RETRYABLE_HTTP" || code === "SERVICE_TIMEOUT") || attempt === 2 || options.failureInjection !== "none") break;
      await wait(attempt * 250);
    }
  }
  const failure = classifyError(lastError);
  return {
    errorClass: failure.code,
    errorMessage: failure.message,
    questionSetHash,
    resolvedModel: null,
    response: null,
    stateHash,
    timing: { attempts: Math.min(attempt, 2), costUsd: null, inputTokens: null, outputTokens: null, providerMs: null, wallMs: Math.round(performance.now() - started) },
  };
}

export function oracleJev(questions: JevQuestionSet, label: (id: string) => boolean): () => unknown {
  return () => ({
    answers: Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: label(id) ? 0.95 : 0.05, type: "noul" }])),
    model: "self-test-jev-j8-oracle-v1",
    usage: { cost: 0, input_tokens: 100, output_tokens: 10 },
  });
}

export async function llmLedgerAttempt(item: Item, messages: { content: string; role: string }[], options: ProviderOptions): Promise<{ attempt: LlmAttempt; parsed: unknown }> {
  const started = performance.now();
  if (options.failureInjection === "llm_malformed") {
    return {
      attempt: { costUsd: null, defects: [{ code: "LEDGER_MALFORMED", detail: "Injected malformed ledger output" }], errorClass: "SCHEMA_ERROR", finishReason: null, inputTokens: null, outputTokens: null, providerMs: 0, raw: "{", resolvedModel: null },
      parsed: null,
    };
  }
  if (!options.live) {
    return {
      attempt: { costUsd: 0, defects: [], errorClass: null, finishReason: "stop", inputTokens: 0, outputTokens: 0, providerMs: 0, raw: canonicalJson(item.selfTestLedger), resolvedModel: "self-test-ledger-oracle-v1" },
      parsed: { claims: item.selfTestLedger.claims.map(({ dimension, meaning, sourceSpan }) => ({ dimension, meaning, sourceSpan })), openChoices: item.selfTestLedger.openChoices.map(({ question, sourceSpan }) => ({ question, sourceSpan })) },
    };
  }
  let lastError: unknown = null;
  for (let transport = 1; transport <= 2; transport += 1) {
    try {
      const response = await fetch(LLM_ENDPOINT, {
        body: JSON.stringify({ max_tokens: 4000, messages, model: ledgerModel(), response_format: { type: "json_object" }, usage: { include: true } }),
        headers: { authorization: `Bearer ${openRouterKey()}`, "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(180_000),
      });
      const body = (await response.json().catch(() => null)) as {
        choices?: { finish_reason?: string; message?: { content?: string } }[];
        model?: string;
        usage?: { completion_tokens?: number; cost?: number; prompt_tokens?: number };
      } | null;
      if (!response.ok || !body) {
        throw new EvaluationError(response.status === 429 || response.status >= 500 ? "RETRYABLE_HTTP" : "SERVICE_HTTP", `Ledger LLM returned HTTP ${response.status}`);
      }
      const raw = body.choices?.[0]?.message?.content ?? null;
      let parsed: unknown = null;
      let errorClass: string | null = null;
      try {
        parsed = raw === null ? null : JSON.parse(raw);
      } catch {
        errorClass = "SCHEMA_ERROR";
      }
      return {
        attempt: {
          costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : null,
          defects: [],
          errorClass: raw === null ? "SCHEMA_ERROR" : errorClass,
          finishReason: body.choices?.[0]?.finish_reason ?? null,
          inputTokens: body.usage?.prompt_tokens ?? null,
          outputTokens: body.usage?.completion_tokens ?? null,
          providerMs: Math.round(performance.now() - started),
          raw,
          resolvedModel: body.model ?? null,
        },
        parsed,
      };
    } catch (error) {
      lastError = error;
      const { code } = classifyError(error);
      if (!(code === "RETRYABLE_HTTP" || code === "SERVICE_TIMEOUT") || transport === 2) break;
      await wait(1_000);
    }
  }
  const failure = classifyError(lastError);
  return {
    attempt: { costUsd: null, defects: [], errorClass: failure.code, finishReason: null, inputTokens: null, outputTokens: null, providerMs: Math.round(performance.now() - started), raw: null, resolvedModel: null },
    parsed: null,
  };
}

export interface LedgerRun {
  attempts: LlmAttempt[];
  check: ReturnType<typeof checkClaimLedger> | null;
  jevCalls: JevCall[];
  judgment: LedgerJudgment | null;
  ledger: ClaimLedger | null;
}

export function jevLedgerFeedback(ledger: ClaimLedger, uncovered: readonly string[], judgment: LedgerJudgment): string {
  const lines = judgment.reasons.map((reason) => {
    const claim = /^claim_(\d+)_supported$/u.exec(reason);
    if (claim) {
      const entry = ledger.claims[Number(claim[1])]!;
      return `The meaning "${entry.meaning}" was judged not to say the same thing as its span "${entry.sourceSpan}". Translate that span literally.`;
    }
    const segment = /^segment_(\d+)_material$/u.exec(reason);
    if (segment) return `The text "${uncovered[Number(segment[1])]!}" is inside no claim but may change who wins. Include it in a claim.`;
    return reason;
  });
  return `A reviewer found problems with that ledger: ${lines.join(" ")} Return the corrected JSON object only.`;
}

/**
 * One generation plus at most one revision (PRD §10 interpretation cap). The
 * revision is driven either by the deterministic checker or by Jev's
 * interpretation-defect verdict, never both, so the loop cannot run on.
 */
export async function buildVerifiedLedger(item: Item, options: ProviderOptions): Promise<LedgerRun> {
  const messages = [
    { content: J8_LEDGER_SYSTEM_PROMPT, role: "system" },
    { content: JSON.stringify({ proposal: item.source }), role: "user" },
  ];
  const run: LedgerRun = { attempts: [], check: null, jevCalls: [], judgment: null, ledger: null };
  const clear = item.class === "CLEAR";
  for (let round = 1; round <= 2; round += 1) {
    const { attempt, parsed } = await llmLedgerAttempt(item, messages, options);
    run.attempts.push(attempt);
    run.ledger = null;
    run.check = null;
    run.judgment = null;
    if (attempt.errorClass && attempt.errorClass !== "SCHEMA_ERROR") return run;
    const outcome = parseClaimLedger(parsed);
    let feedback: string | null = null;
    if ("defect" in outcome) {
      attempt.defects = [outcome.defect];
      feedback = `That ledger was rejected by the deterministic checker: ${outcome.defect.code} (${outcome.defect.detail}). Return the corrected JSON object only.`;
    } else {
      run.ledger = outcome.ledger;
      run.check = checkClaimLedger(item.source, outcome.ledger);
      attempt.defects = run.check.defects;
      const state = buildPublicLedgerState(item.source, item.language, outcome.ledger, run.check.uncoveredSegments);
      if (run.check.defects.length > 0) {
        run.judgment = deriveLedgerJudgment(state, null, run.check.defects);
        feedback = `That ledger was rejected by the deterministic checker: ${run.check.defects.map((defect) => `${defect.code} (${defect.detail})`).join("; ")}. Every sourceSpan must be copied character for character from this exact proposal text, without changing any word form: ${JSON.stringify(item.source)}. Return the corrected JSON object only.`;
      } else {
        const questions = buildLedgerQuestions(state);
        const call = await callJev(state, questions, options, options.live ? null : oracleJev(questions, (id) => (id.endsWith("_vague") ? !clear : id.endsWith("_decided") ? clear : !id.endsWith("_material"))));
        run.jevCalls.push(call);
        if (!call.response) return run;
        run.judgment = deriveLedgerJudgment(state, call.response, []);
        if (run.judgment.decision === "REVIEW_INTERPRETATION_DEFECT" || run.judgment.decision === "REVIEW_LEDGER_INCOMPLETE") {
          feedback = jevLedgerFeedback(outcome.ledger, run.check.uncoveredSegments, run.judgment);
        }
      }
    }
    if (!feedback || round === 2) break;
    messages.push({ content: attempt.raw ?? "", role: "assistant" }, { content: feedback, role: "user" });
  }
  return run;
}


export async function mapConcurrent<T, R>(values: readonly T[], concurrency: number, run: (value: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(values.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      for (;;) {
        const index = next++;
        if (index >= values.length) return;
        results[index] = await run(values[index]!);
      }
    }),
  );
  return results;
}


export function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1)]!;
}

export function sum(values: (number | null)[]): number {
  return values.reduce<number>((total, value) => total + (value ?? 0), 0);
}


export function atomicWriteJson(path: string, value: unknown, injection: FailureInjection): void {
  if (injection === "storage_failure") throw new EvaluationError("STORAGE_FAILURE", "Injected result-storage failure");
  const resolved = resolve(path);
  const temporary = `${resolved}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, resolved);
}

