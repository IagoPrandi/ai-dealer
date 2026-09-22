import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import {
  detectJailbreak,
  resetJailbreakVerdictCache,
  resolveGuardianConfig,
  type GuardianConfig,
} from "../src/guardian.js";
import {
  applyDeterministicP12Gate,
  buildP12Questions,
  buildPublicP12State,
  combineP12Decisions,
  createP12EvaluationTasks,
  deriveP12Judgment,
  expectedP12Answers,
  JEV_J6_DECISION_POLICY_VERSION,
  JEV_J6_QUESTION_POLICY_SHA256,
  JEV_J6_QUESTION_SET_VERSION,
  JEV_J6_STATE_SCHEMA_VERSION,
  P12_REASON_IDS,
  validateJ6EvaluationTasks,
  type ExpectedP12Answer,
  type P12Decision,
  type P12EvaluationTask,
  type P12Judgment,
} from "../src/jevPipelineJ6Evaluation.js";
import {
  canonicalJson,
  sha256Canonical,
  validateJevPipelineCorpus,
  validateJevResponse,
  type JevAnswer,
  type JevQuestionSet,
  type ValidatedJevResponse,
} from "../src/jevPipelineEvaluation.js";
import {
  fingerprintJevPipelineCorpusV1,
  JEV_PIPELINE_CORPUS_V1_SHA256,
  JEV_PIPELINE_CORPUS_VERSION,
} from "../src/jevPipelineCorpusV1.js";
import {
  captureAiRun,
  getAiUsageRuns,
  type AiRunUsageReport,
} from "../src/usage.js";

const JEV_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const JEV_REQUESTED_MODEL = "~typesafe/jev-latest";
const JEV_INPUT_USD_PER_MILLION = 0.042;

type FailureInjection =
  | "guardian_unavailable"
  | "jev_malformed"
  | "jev_timeout"
  | "none"
  | "storage_failure";

interface Options {
  aggregateInput: string | null;
  concurrency: number;
  dryRun: boolean;
  expectedResolvedModel: string;
  failureInjection: FailureInjection;
  guardianIntervalMs: number;
  live: boolean;
  output: string;
  runs: number;
  selfTest: boolean;
  verifyFailures: boolean;
}

interface Timing {
  attempt: number;
  costSource: string;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  providerMs: number | null;
  queueMs: number;
  retryMs: number;
  wallMs: number;
}

interface JevResult {
  errorClass: string | null;
  errorMessage: string | null;
  requestedModel: string;
  resolvedModel: string | null;
  response: ValidatedJevResponse | null;
  timing: Timing;
}

interface GuardianResult {
  decision: P12Decision;
  errorClass: string | null;
  errorMessage: string | null;
  model: string;
  timing: Timing;
}

interface TaskResult {
  corpusClass: P12EvaluationTask["corpusClass"];
  deterministic: P12EvaluationTask["deterministic"];
  expectedDecision: P12EvaluationTask["expectedDecision"];
  fixtureId: string;
  guardian: GuardianResult;
  jev: JevResult;
  judgment: P12Judgment | null;
  language: P12EvaluationTask["language"];
  questionSetHash: string;
  repeatId: number;
  stateHash: string;
  taskId: string;
}

class EvaluationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EvaluationError";
  }
}

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
}

function positiveInteger(name: string, fallback: number): number {
  const raw = argument(name);
  const value = raw === null ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`--${name} must be a positive integer`);
  }
  return value;
}

function parseOptions(): Options {
  const live = process.argv.includes("--live");
  const selfTest = process.argv.includes("--self-test");
  const dryRun = process.argv.includes("--dry-run");
  const verifyFailures = process.argv.includes("--verify-failures");
  const aggregateInput = argument("aggregate");
  if (
    [live, selfTest, dryRun, verifyFailures, aggregateInput !== null].filter(
      Boolean,
    ).length !== 1
  ) {
    throw new Error(
      "Choose exactly one mode: --live, --self-test, --dry-run, --verify-failures, or --aggregate=<report>",
    );
  }
  const failureInjection = (argument("inject-failure") ??
    "none") as FailureInjection;
  if (
    ![
      "guardian_unavailable",
      "jev_malformed",
      "jev_timeout",
      "none",
      "storage_failure",
    ].includes(failureInjection)
  ) {
    throw new Error(`Unknown failure injection: ${failureInjection}`);
  }
  return {
    aggregateInput,
    concurrency: positiveInteger("concurrency", 4),
    dryRun,
    expectedResolvedModel:
      argument("expected-resolved-model") ?? "typesafe/jev-1.13-20260917",
    failureInjection,
    guardianIntervalMs: positiveInteger("guardian-interval-ms", 2100),
    live,
    output: argument("output") ?? "../../docs/jev-pipeline-j6-results.json",
    runs: positiveInteger("runs", 3),
    selfTest,
    verifyFailures,
  };
}

function loadRootEnvironment(): void {
  const content = readFileSync(
    new URL("../../../.env", import.meta.url),
    "utf8",
  );
  for (const line of content.split(/\r?\n/u)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/u);
    if (!match || process.env[match[1]!]) continue;
    const value = match[2]!
      .replace(/\s+#.*$/u, "")
      .trim()
      .replace(/^['"]|['"]$/gu, "");
    if (value) process.env[match[1]!] = value;
  }
}

function openRouterKey(): string {
  const key = process.env.API_KEY_OPENROUTER?.trim();
  if (!key) {
    throw new EvaluationError(
      "CONFIGURATION_ERROR",
      "API_KEY_OPENROUTER is not configured",
    );
  }
  return key;
}

function classifyError(error: unknown): { code: string; message: string } {
  if (error instanceof EvaluationError) {
    return { code: error.code, message: error.message };
  }
  if (error instanceof Error) {
    if (
      error.name === "TimeoutError" ||
      /timeout|timed out/iu.test(error.message)
    ) {
      return { code: "SERVICE_TIMEOUT", message: error.message };
    }
    if (
      /answer|response|probabilit|usage|primitive|score|choice/iu.test(
        error.message,
      )
    ) {
      return { code: "SCHEMA_ERROR", message: error.message };
    }
    if (/guardian/iu.test(error.message)) {
      return { code: "GUARDIAN_UNAVAILABLE", message: error.message };
    }
    return { code: "SERVICE_FAILURE", message: error.message };
  }
  return { code: "UNKNOWN", message: String(error) };
}

function wait(delayMs: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, delayMs));
}

function estimatedJevCost(response: ValidatedJevResponse) {
  return response.usage.costUsd !== null
    ? { source: "provider_reported", usd: response.usage.costUsd }
    : {
        source: "documented_input_token_estimate_2026-09-22",
        usd:
          (response.usage.inputTokens * JEV_INPUT_USD_PER_MILLION) / 1_000_000,
      };
}

async function callJev(
  state: unknown,
  questions: JevQuestionSet,
  options: Options,
): Promise<JevResult> {
  const started = performance.now();
  let retryMs = 0;
  let lastError: unknown = null;
  let attempt = 1;
  for (; attempt <= 2; attempt += 1) {
    try {
      if (options.failureInjection === "jev_timeout") {
        throw new EvaluationError("SERVICE_TIMEOUT", "Injected Jev timeout");
      }
      if (options.failureInjection === "jev_malformed") {
        validateJevResponse(
          { answers: {}, model: "injected", usage: {} },
          questions,
        );
      }
      const providerStarted = performance.now();
      const httpResponse = await fetch(JEV_ENDPOINT, {
        body: JSON.stringify({ model: JEV_REQUESTED_MODEL, questions, state }),
        headers: {
          authorization: `Bearer ${openRouterKey()}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      });
      const providerMs = Math.round(performance.now() - providerStarted);
      const body: unknown = await httpResponse.json().catch(() => null);
      if (!httpResponse.ok) {
        throw new EvaluationError(
          httpResponse.status === 429 || httpResponse.status >= 500
            ? "RETRYABLE_HTTP"
            : "SERVICE_HTTP",
          `Jev returned HTTP ${httpResponse.status}`,
        );
      }
      const response = validateJevResponse(body, questions);
      if (response.model !== options.expectedResolvedModel) {
        throw new EvaluationError(
          "MODEL_DRIFT",
          `Expected ${options.expectedResolvedModel}; received ${response.model}`,
        );
      }
      const cost = estimatedJevCost(response);
      return {
        errorClass: null,
        errorMessage: null,
        requestedModel: JEV_REQUESTED_MODEL,
        resolvedModel: response.model,
        response,
        timing: {
          attempt,
          costSource: cost.source,
          costUsd: cost.usd,
          inputTokens: response.usage.inputTokens,
          outputTokens: response.usage.outputTokens,
          providerMs,
          queueMs: 0,
          retryMs,
          wallMs: Math.round(performance.now() - started),
        },
      };
    } catch (error) {
      lastError = error;
      const code = classifyError(error).code;
      const retryable = code === "RETRYABLE_HTTP" || code === "SERVICE_TIMEOUT";
      if (!retryable || attempt === 2 || options.failureInjection !== "none")
        break;
      const delayMs = attempt * 250;
      retryMs += delayMs;
      await wait(delayMs);
    }
  }
  const failure = classifyError(lastError);
  return {
    errorClass: failure.code,
    errorMessage: failure.message,
    requestedModel: JEV_REQUESTED_MODEL,
    resolvedModel: null,
    response: null,
    timing: {
      attempt: Math.min(attempt, 2),
      costSource: "unavailable",
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      providerMs: null,
      queueMs: 0,
      retryMs,
      wallMs: Math.round(performance.now() - started),
    },
  };
}

function oracleResponse(
  task: P12EvaluationTask,
  questions: JevQuestionSet,
): ValidatedJevResponse {
  const labels = expectedP12Answers(task);
  const answers: Record<string, JevAnswer> = {};
  for (const [id, question] of Object.entries(questions)) {
    const label: ExpectedP12Answer | undefined = labels[id];
    if (!label) throw new Error(`Missing P12 oracle label ${id}`);
    if (question.type === "choice") {
      if (label.type !== "choice") throw new Error(`Wrong Choice label ${id}`);
      answers[id] = {
        choice: label.choice,
        confidence: 0.95,
        probabilities: Object.fromEntries(
          Object.keys(question.criteria).map((option) => [
            option,
            option === label.choice ? 0.9 : 0.05,
          ]),
        ),
        type: "choice",
      };
    } else {
      if (question.type !== "score" || label.type !== "score") {
        throw new Error(`Wrong Score label ${id}`);
      }
      answers[id] = {
        confidence: 0.94,
        legend: Object.fromEntries(
          question.criteria.map((level, index) => [String(index), level]),
        ),
        probabilities: Object.fromEntries(
          question.criteria.map((_level, index) => [
            String(index),
            index === label.level ? 0.94 : 0.02,
          ]),
        ),
        score: label.level,
        type: "score",
      };
    }
  }
  return validateJevResponse(
    {
      answers,
      model: "self-test-jev-j6-oracle-v1",
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    questions,
  );
}

function oracleJev(
  task: P12EvaluationTask,
  questions: JevQuestionSet,
): JevResult {
  const response = oracleResponse(task, questions);
  return {
    errorClass: null,
    errorMessage: null,
    requestedModel: response.model,
    resolvedModel: response.model,
    response,
    timing: {
      attempt: 1,
      costSource: "self_test",
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerMs: 0,
      queueMs: 0,
      retryMs: 0,
      wallMs: 0,
    },
  };
}

let nextGuardianStartAtMs = 0;

async function waitForGuardianSlot(intervalMs: number): Promise<number> {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextGuardianStartAtMs);
  nextGuardianStartAtMs = scheduledAt + intervalMs;
  const queueMs = scheduledAt - now;
  if (queueMs > 0) await wait(queueMs);
  return queueMs;
}

function guardianTiming(report: AiRunUsageReport | undefined): Timing {
  if (!report) {
    return {
      attempt: 0,
      costSource: "no_provider_call",
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerMs: 0,
      queueMs: 0,
      retryMs: 0,
      wallMs: 0,
    };
  }
  return {
    attempt: report.totals.callCount,
    costSource:
      report.totals.unpricedCallCount === 0
        ? "measured_or_configured"
        : "incomplete",
    costUsd: report.totals.costUsd,
    inputTokens: report.totals.promptTokens,
    outputTokens: report.totals.completionTokens,
    providerMs: Math.round(
      report.calls.reduce((sum, call) => sum + call.durationMs, 0),
    ),
    queueMs: 0,
    retryMs: 0,
    wallMs: Math.round(report.resources.wallClockMs),
  };
}

async function callGuardian(
  task: P12EvaluationTask,
  config: GuardianConfig,
  options: Options,
): Promise<GuardianResult> {
  if (options.failureInjection === "guardian_unavailable") {
    return {
      decision: "unavailable",
      errorClass: "GUARDIAN_UNAVAILABLE",
      errorMessage: "Injected Guardian failure",
      model: config.model,
      timing: {
        ...guardianTiming(undefined),
        attempt: 1,
        costSource: "unavailable",
        costUsd: null,
      },
    };
  }
  if (!options.live) {
    return {
      decision: task.expectedDecision,
      errorClass: null,
      errorMessage: null,
      model: "self-test-guardian-oracle-v1",
      timing: guardianTiming(undefined),
    };
  }
  if (!config.enabled) {
    return {
      decision: "unavailable",
      errorClass: "GUARDIAN_UNAVAILABLE",
      errorMessage: "Guardian is not configured",
      model: config.model,
      timing: {
        ...guardianTiming(undefined),
        attempt: 1,
        costSource: "unavailable",
        costUsd: null,
      },
    };
  }
  const started = performance.now();
  const queueMs = await waitForGuardianSlot(options.guardianIntervalMs);
  const label = `jev-j6/${task.repeatId}/${task.taskId}/guardian`;
  try {
    const captured = await captureAiRun(label, () =>
      detectJailbreak(task.source, config),
    );
    return {
      decision: captured.result ? "unsafe" : "safe",
      errorClass: null,
      errorMessage: null,
      model: config.model,
      timing: {
        ...guardianTiming(captured.report),
        queueMs,
        wallMs: Math.round(performance.now() - started),
      },
    };
  } catch (error) {
    const failure = classifyError(error);
    const report = getAiUsageRuns(200).find((run) => run.label === label);
    return {
      decision: "unavailable",
      errorClass: failure.code,
      errorMessage: failure.message,
      model: config.model,
      timing: {
        ...guardianTiming(report),
        queueMs,
        wallMs: Math.round(performance.now() - started),
      },
    };
  }
}

async function evaluateTask(
  task: P12EvaluationTask,
  guardianConfig: GuardianConfig,
  options: Options,
): Promise<TaskResult> {
  const questions = buildP12Questions();
  const state = buildPublicP12State(task);
  const [jev, guardian] = await Promise.all([
    options.live
      ? callJev(state, questions, options)
      : oracleJev(task, questions),
    callGuardian(task, guardianConfig, options),
  ]);
  return {
    corpusClass: task.corpusClass,
    deterministic: task.deterministic,
    expectedDecision: task.expectedDecision,
    fixtureId: task.fixtureId,
    guardian,
    jev,
    judgment: jev.response ? deriveP12Judgment(jev.response) : null,
    language: task.language,
    questionSetHash: sha256Canonical({
      policy: JEV_J6_QUESTION_POLICY_SHA256,
      questions,
    }),
    repeatId: task.repeatId,
    stateHash: sha256Canonical(state),
    taskId: task.taskId,
  };
}

async function mapConcurrent<T, R>(
  values: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= values.length) return;
        results[index] = await mapper(values[index]!);
      }
    }),
  );
  return results;
}

function jevDecision(result: TaskResult): P12Decision {
  return result.judgment?.decision ?? "unavailable";
}

function semanticDecision(
  result: TaskResult,
  reviewer: "combined" | "guardian" | "jev",
): P12Decision {
  if (reviewer === "guardian") return result.guardian.decision;
  if (reviewer === "jev") return jevDecision(result);
  return combineP12Decisions(result.guardian.decision, jevDecision(result));
}

function pipelineDecision(
  result: TaskResult,
  reviewer: "combined" | "guardian",
): P12Decision {
  return applyDeterministicP12Gate(
    result.deterministic,
    semanticDecision(result, reviewer),
  );
}

interface ExperimentRecord {
  answers: unknown;
  arm: "B0" | "C12" | "I12";
  attempt: number;
  corpusVersion: typeof JEV_PIPELINE_CORPUS_VERSION;
  decisionPolicyVersion: string;
  errorClass?: string;
  expectedDecision: P12Decision;
  experimentId: string;
  processId: "P12";
  proposalId: string;
  provider: string;
  questionSetHash: string;
  questionSetVersion: string;
  referenceMatch: boolean;
  repeatId: number;
  requestedModel: string;
  resolvedModel: string;
  sourceRevision: string;
  stageDecision: P12Decision;
  stateHash: string;
  stateSchemaVersion: string;
  terminalRoute?: "BLOCK" | "UNAVAILABLE";
  timing: {
    providerMs?: number;
    queueMs?: number;
    retryMs?: number;
    wallMs: number;
  };
  usage: {
    costComplete: boolean;
    costUsd?: number;
    inputTokens?: number;
    knownCostUsd: number;
    outputTokens?: number;
  };
}

function createRecord(
  arm: ExperimentRecord["arm"],
  result: TaskResult,
  experimentId: string,
  sourceRevision: string,
): ExperimentRecord {
  const useJev = arm !== "B0";
  const decision = pipelineDecision(result, useJev ? "combined" : "guardian");
  const timings = [
    result.guardian.timing,
    ...(useJev ? [result.jev.timing] : []),
  ];
  const costs = timings.map((timing) => timing.costUsd);
  const completeCost = costs.every((cost) => cost !== null);
  const errors = [
    result.guardian.errorClass,
    ...(useJev ? [result.jev.errorClass] : []),
  ].filter((error): error is string => Boolean(error));
  return {
    answers: {
      deterministic: result.deterministic,
      guardian: result.guardian.decision,
      ...(useJev
        ? {
            jev: result.judgment,
            rawJevAnswers: result.jev.response?.answers ?? null,
          }
        : {}),
    },
    arm,
    attempt: timings.reduce((sum, timing) => sum + timing.attempt, 0),
    corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
    decisionPolicyVersion: JEV_J6_DECISION_POLICY_VERSION,
    ...(errors.length ? { errorClass: errors.join("+") } : {}),
    expectedDecision: result.expectedDecision,
    experimentId,
    processId: "P12",
    proposalId: result.fixtureId,
    provider: useJev ? "deterministic+guardian+jev" : "deterministic+guardian",
    questionSetHash: result.questionSetHash,
    questionSetVersion: JEV_J6_QUESTION_SET_VERSION,
    referenceMatch: decision === result.expectedDecision,
    repeatId: result.repeatId,
    requestedModel: useJev
      ? `guardian:${result.guardian.model},jev:${result.jev.requestedModel}`
      : `guardian:${result.guardian.model}`,
    resolvedModel: useJev
      ? `guardian:${result.guardian.model},jev:${result.jev.resolvedModel ?? "unavailable"}`
      : `guardian:${result.guardian.model}`,
    sourceRevision,
    stageDecision: decision,
    stateHash: result.stateHash,
    stateSchemaVersion: JEV_J6_STATE_SCHEMA_VERSION,
    ...(decision === "unsafe"
      ? { terminalRoute: "BLOCK" as const }
      : decision === "unavailable"
        ? { terminalRoute: "UNAVAILABLE" as const }
        : {}),
    timing: {
      providerMs: timings.reduce(
        (sum, timing) => sum + (timing.providerMs ?? 0),
        0,
      ),
      queueMs: timings.reduce((sum, timing) => sum + timing.queueMs, 0),
      retryMs: timings.reduce((sum, timing) => sum + timing.retryMs, 0),
      wallMs: Math.max(...timings.map((timing) => timing.wallMs)),
    },
    usage: {
      costComplete: completeCost,
      ...(completeCost
        ? { costUsd: costs.reduce((sum, cost) => sum + (cost ?? 0), 0) }
        : {}),
      ...(timings.every((timing) => timing.inputTokens !== null)
        ? {
            inputTokens: timings.reduce(
              (sum, timing) => sum + (timing.inputTokens ?? 0),
              0,
            ),
          }
        : {}),
      knownCostUsd: costs.reduce<number>((sum, cost) => sum + (cost ?? 0), 0),
      ...(timings.every((timing) => timing.outputTokens !== null)
        ? {
            outputTokens: timings.reduce(
              (sum, timing) => sum + (timing.outputTokens ?? 0),
              0,
            ),
          }
        : {}),
    },
  };
}

function createRecords(
  experimentId: string,
  sourceRevision: string,
  results: readonly TaskResult[],
): ExperimentRecord[] {
  return results.flatMap((result) => [
    createRecord("B0", result, experimentId, sourceRevision),
    createRecord("I12", result, experimentId, sourceRevision),
    createRecord("C12", result, experimentId, sourceRevision),
  ]);
}

function percentile(
  values: readonly number[],
  fraction: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.max(0, Math.ceil(fraction * sorted.length) - 1)]!;
}

function decisionMetrics(
  rows: readonly { actual: P12Decision; expected: P12Decision }[],
) {
  const confusion: Record<string, number> = {};
  for (const row of rows) {
    const key = `${row.expected}->${row.actual}`;
    confusion[key] = (confusion[key] ?? 0) + 1;
  }
  return {
    accuracy:
      rows.length === 0
        ? null
        : rows.filter((row) => row.actual === row.expected).length /
          rows.length,
    confusion,
    correctCount: rows.filter((row) => row.actual === row.expected).length,
    falseSafe: rows.filter(
      (row) => row.actual === "safe" && row.expected === "unsafe",
    ).length,
    falseUnsafe: rows.filter(
      (row) => row.actual === "unsafe" && row.expected === "safe",
    ).length,
    insufficientEvidence: rows.filter(
      (row) => row.actual === "insufficient_evidence",
    ).length,
    totalCount: rows.length,
    unavailable: rows.filter((row) => row.actual === "unavailable").length,
  };
}

function armMetrics(
  arm: ExperimentRecord["arm"],
  records: readonly ExperimentRecord[],
) {
  const selected = records.filter((record) => record.arm === arm);
  const wall = selected.map((record) => record.timing.wallMs);
  const provider = selected.flatMap((record) =>
    typeof record.timing.providerMs === "number"
      ? [record.timing.providerMs]
      : [],
  );
  return {
    ...decisionMetrics(
      selected.map((record) => ({
        actual: record.stageDecision,
        expected: record.expectedDecision,
      })),
    ),
    completeCost: selected.every((record) => record.usage.costComplete),
    costUsd: selected.reduce(
      (sum, record) => sum + record.usage.knownCostUsd,
      0,
    ),
    errorCount: selected.filter((record) => record.errorClass).length,
    inputTokens: selected.reduce(
      (sum, record) => sum + (record.usage.inputTokens ?? 0),
      0,
    ),
    outputTokens: selected.reduce(
      (sum, record) => sum + (record.usage.outputTokens ?? 0),
      0,
    ),
    providerMs: {
      max: provider.length ? Math.max(...provider) : null,
      min: provider.length ? Math.min(...provider) : null,
      p50: percentile(provider, 0.5),
      p95: percentile(provider, 0.95),
    },
    retryCount: selected.reduce(
      (sum, record) =>
        sum + Math.max(0, record.attempt - (arm === "B0" ? 1 : 2)),
      0,
    ),
    wallMs: {
      max: wall.length ? Math.max(...wall) : null,
      min: wall.length ? Math.min(...wall) : null,
      p50: percentile(wall, 0.5),
      p95: percentile(wall, 0.95),
    },
  };
}

function primitiveQuality(
  tasks: readonly P12EvaluationTask[],
  results: readonly TaskResult[],
) {
  const taskMap = new Map(
    tasks.map((task) => [`${task.repeatId}/${task.taskId}`, task]),
  );
  let choiceCorrect = 0;
  let choiceCount = 0;
  let scoreAbsoluteError = 0;
  let scoreCount = 0;
  const highTailCounts = Object.fromEntries(
    P12_REASON_IDS.map((reason) => [reason, 0]),
  );
  for (const result of results) {
    if (!result.judgment) continue;
    const task = taskMap.get(`${result.repeatId}/${result.taskId}`);
    if (!task) throw new Error(`Missing task ${result.taskId}`);
    choiceCount += 1;
    if (result.judgment.overall.choice === task.expectedDecision)
      choiceCorrect += 1;
    for (const reason of P12_REASON_IDS) {
      const answer = result.judgment.reasonScores[reason];
      scoreCount += 1;
      scoreAbsoluteError += Math.abs(
        answer.score - task.expectedReasonLevels[reason],
      );
      if (
        (answer.probabilities["2"] ?? 0) + (answer.probabilities["3"] ?? 0) >=
        0.5
      ) {
        highTailCounts[reason] = (highTailCounts[reason] ?? 0) + 1;
      }
    }
  }
  return {
    choiceAccuracy: choiceCount === 0 ? null : choiceCorrect / choiceCount,
    choiceCorrect,
    choiceCount,
    highEvidenceTailCounts: highTailCounts,
    scoreCount,
    scoreMeanAbsoluteError:
      scoreCount === 0 ? null : scoreAbsoluteError / scoreCount,
  };
}

function stability(results: readonly TaskResult[]) {
  const grouped = new Map<string, P12Decision[]>();
  for (const result of results) {
    const values = grouped.get(result.taskId) ?? [];
    values.push(jevDecision(result));
    grouped.set(result.taskId, values);
  }
  const unstable = [...grouped.entries()]
    .filter(([, values]) => new Set(values).size > 1)
    .map(([taskId, decisions]) => ({ decisions, taskId }));
  return {
    stableTaskCount: grouped.size - unstable.length,
    taskCount: grouped.size,
    unstable,
  };
}

function summarize(
  tasks: readonly P12EvaluationTask[],
  results: readonly TaskResult[],
  records: readonly ExperimentRecord[],
) {
  const reviewerComparison = Object.fromEntries(
    (["guardian", "jev", "combined"] as const).map((reviewer) => [
      reviewer,
      decisionMetrics(
        results.map((result) => ({
          actual: semanticDecision(result, reviewer),
          expected: result.expectedDecision,
        })),
      ),
    ]),
  );
  const arms = {
    B0: armMetrics("B0", records),
    C12: armMetrics("C12", records),
    I12: armMetrics("I12", records),
  };
  return {
    arms,
    deterministic: decisionMetrics(
      results.map((result) => ({
        actual: result.deterministic.decision,
        expected: result.expectedDecision,
      })),
    ),
    disagreements: results
      .filter(
        (result) =>
          result.guardian.decision !== jevDecision(result) ||
          jevDecision(result) !== result.expectedDecision,
      )
      .map((result) => ({
        expected: result.expectedDecision,
        guardian: result.guardian.decision,
        jev: jevDecision(result),
        proposalId: result.fixtureId,
        repeatId: result.repeatId,
      })),
    perLanguage: Object.fromEntries(
      (["en", "pt"] as const).map((language) => {
        const selected = results.filter(
          (result) => result.language === language,
        );
        return [
          language,
          decisionMetrics(
            selected.map((result) => ({
              actual: jevDecision(result),
              expected: result.expectedDecision,
            })),
          ),
        ];
      }),
    ),
    primitiveQuality: primitiveQuality(tasks, results),
    reviewerComparison,
    safeGatePassed:
      arms.I12.falseSafe === 0 &&
      arms.I12.errorCount === 0 &&
      results.every(
        (result) =>
          result.deterministic.decision !== "unsafe" ||
          pipelineDecision(result, "combined") === "unsafe",
      ),
    stability: stability(results),
  };
}

function atomicWriteJson(
  path: string,
  value: unknown,
  injection: FailureInjection,
): void {
  if (injection === "storage_failure") {
    throw new EvaluationError(
      "STORAGE_FAILURE",
      "Injected result-storage failure",
    );
  }
  const resolved = resolve(path);
  const temporary = `${resolved}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, resolved);
}

function sourceRevision(): string {
  return process.env.GITHUB_SHA?.trim() || "dirty-worktree-disclosed";
}

function createTasks(runs: number): P12EvaluationTask[] {
  return Array.from({ length: runs }, (_, index) => {
    const tasks = createP12EvaluationTasks(index + 1);
    return index % 2 === 0 ? tasks : [...tasks].reverse();
  }).flat();
}

async function evaluateAll(
  runs: number,
  guardianConfig: GuardianConfig,
  options: Options,
): Promise<TaskResult[]> {
  const all: TaskResult[] = [];
  for (let repeatId = 1; repeatId <= runs; repeatId += 1) {
    // The production cache remains enabled, but each declared repeat begins
    // independently so stability is measured rather than copied from cache.
    resetJailbreakVerdictCache();
    const tasks = createP12EvaluationTasks(repeatId);
    const ordered = repeatId % 2 === 1 ? tasks : [...tasks].reverse();
    all.push(
      ...(await mapConcurrent(ordered, options.concurrency, (task) =>
        evaluateTask(task, guardianConfig, options),
      )),
    );
  }
  return all;
}

async function runExperiment(options: Options) {
  validateJevPipelineCorpus();
  validateJ6EvaluationTasks();
  if (fingerprintJevPipelineCorpusV1() !== JEV_PIPELINE_CORPUS_V1_SHA256) {
    throw new EvaluationError("CORPUS_DRIFT", "The pinned JEV corpus changed");
  }
  if (options.live) loadRootEnvironment();
  const guardianConfig = resolveGuardianConfig();
  const tasks = createTasks(options.runs);
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const results = await evaluateAll(options.runs, guardianConfig, options);
  const revision = sourceRevision();
  const experimentId = `jev-j6-p12-${startedAt.replace(/[:.]/gu, "-")}`;
  const records = createRecords(experimentId, revision, results);
  const report = {
    experimentId,
    generatedAt: new Date().toISOString(),
    method: {
      corpusHash: JEV_PIPELINE_CORPUS_V1_SHA256,
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      cumulativeNote:
        "C12 equals I12 because no downstream JEV process has an owner-confirmed PROMOTE_CUMULATIVE decision; deterministic security remains authoritative.",
      dirtyWorktreeDisclosure:
        revision === "dirty-worktree-disclosed"
          ? "Run from a dirty worktree; source and policy hashes are the reproducibility boundary."
          : null,
      expectedResolvedModel: options.live
        ? options.expectedResolvedModel
        : "self-test-jev-j6-oracle-v1",
      guardianModel: guardianConfig.model || "not-configured",
      guardianStartIntervalMs: options.live ? options.guardianIntervalMs : 0,
      mode: options.live ? "live" : "self-test",
      noProductionWrites:
        "This runner imports no API server, database, wallet, payment, artifact-freeze, or chain-write entry point.",
      process: "P12",
      questionPolicyHash: JEV_J6_QUESTION_POLICY_SHA256,
      questionSetVersion: JEV_J6_QUESTION_SET_VERSION,
      requestedModel: options.live
        ? JEV_REQUESTED_MODEL
        : "self-test-jev-j6-oracle-v1",
      runs: options.runs,
      sourceRevision: revision,
      startedAt,
      stateSchemaVersion: JEV_J6_STATE_SCHEMA_VERSION,
      taskCount: tasks.length,
      taskCountPerRepeat: 10,
    },
    records,
    results,
    summary: {
      ...summarize(tasks, results, records),
      endToEndWallClockMs: Math.round(performance.now() - wallStarted),
    },
  };
  atomicWriteJson(options.output, report, options.failureInjection);
  return report;
}

async function verifyFailures(options: Options): Promise<void> {
  loadRootEnvironment();
  const guardianConfig = resolveGuardianConfig();
  const task = createP12EvaluationTasks(1)[0]!;
  const observed: Record<string, string> = {};
  for (const failure of [
    "jev_timeout",
    "jev_malformed",
    "guardian_unavailable",
  ] as const) {
    resetJailbreakVerdictCache();
    const result = await evaluateTask(task, guardianConfig, {
      ...options,
      failureInjection: failure,
      live: true,
      verifyFailures: false,
    });
    if (failure === "guardian_unavailable") {
      if (
        !result.guardian.errorClass ||
        result.guardian.decision !== "unavailable"
      ) {
        throw new Error("Guardian failure did not remain unavailable");
      }
      observed[failure] = result.guardian.errorClass;
    } else {
      if (!result.jev.errorClass || result.judgment !== null) {
        throw new Error(`${failure} did not fail closed`);
      }
      observed[failure] = result.jev.errorClass;
    }
  }
  let storageFailure: string | null = null;
  try {
    atomicWriteJson(options.output, {}, "storage_failure");
  } catch (error) {
    storageFailure = classifyError(error).code;
  }
  if (storageFailure !== "STORAGE_FAILURE") {
    throw new Error("storage_failure did not fail closed");
  }
  observed.storage_failure = storageFailure;
  console.log(
    JSON.stringify({ failureInjection: observed, passed: true }, null, 2),
  );
}

function reaggregate(options: Options): void {
  if (!options.aggregateInput) throw new Error("Missing --aggregate input");
  const existing = JSON.parse(
    readFileSync(resolve(options.aggregateInput), "utf8"),
  ) as {
    experimentId: string;
    method: { runs: number; sourceRevision: string };
    results: TaskResult[];
    summary?: { endToEndWallClockMs?: number };
    [key: string]: unknown;
  };
  const tasks = createTasks(existing.method.runs);
  const records = createRecords(
    existing.experimentId,
    existing.method.sourceRevision,
    existing.results,
  );
  const report = {
    ...existing,
    aggregatedAt: new Date().toISOString(),
    records,
    summary: {
      ...summarize(tasks, existing.results, records),
      ...(typeof existing.summary?.endToEndWallClockMs === "number"
        ? { endToEndWallClockMs: existing.summary.endToEndWallClockMs }
        : {}),
    },
  };
  atomicWriteJson(options.output, report, options.failureInjection);
  console.log(
    JSON.stringify(
      { output: options.output, summary: report.summary },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const options = parseOptions();
  if (options.dryRun) {
    validateJevPipelineCorpus();
    validateJ6EvaluationTasks();
    const task = createP12EvaluationTasks(1)[0]!;
    const questions = buildP12Questions();
    const state = buildPublicP12State(task);
    console.log(
      JSON.stringify(
        {
          corpusHash: fingerprintJevPipelineCorpusV1(),
          policyHash: JEV_J6_QUESTION_POLICY_SHA256,
          questionCount: Object.keys(questions).length,
          stateHash: sha256Canonical(state),
          statePreview: canonicalJson(state).slice(0, 180),
          taskCountPerRun: 10,
          valid: true,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (options.verifyFailures) return verifyFailures(options);
  if (options.aggregateInput) return reaggregate(options);
  const report = await runExperiment(options);
  console.log(
    JSON.stringify(
      {
        experimentId: report.experimentId,
        output: options.output,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
}

await main();
