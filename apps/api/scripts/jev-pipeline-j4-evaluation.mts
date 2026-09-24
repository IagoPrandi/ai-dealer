import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import {
  buildP06Questions,
  buildP07Questions,
  buildPublicP06State,
  buildPublicP07State,
  createP06EvaluationTasks,
  createP07EvaluationTasks,
  deriveP06Judgment,
  deriveP07Judgment,
  expectedP06NoulLabels,
  expectedP07NoulLabels,
  JEV_J4_DECISION_POLICY_VERSION,
  JEV_J4_QUESTION_POLICY_SHA256,
  JEV_J4_QUESTION_SET_VERSION,
  JEV_J4_STATE_SCHEMA_VERSION,
  validateJ4EvaluationTasks,
  type P06Decision,
  type P06EvaluationTask,
  type P06Judgment,
  type P07Decision,
  type P07EvaluationTask,
  type P07Judgment,
} from "../src/jevPipelineJ4Evaluation.js";
import {
  canonicalJson,
  sha256Canonical,
  validateJevPipelineCorpus,
  validateJevResponse,
  type JevQuestionSet,
  type ValidatedJevResponse,
} from "../src/jevPipelineEvaluation.js";
import {
  fingerprintJevPipelineCorpusV1,
  JEV_PIPELINE_CORPUS_V1_SHA256,
  JEV_PIPELINE_CORPUS_VERSION,
} from "../src/jevPipelineCorpusV1.js";

const JEV_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const JEV_REQUESTED_MODEL = "~typesafe/jev-latest";
const JEV_INPUT_USD_PER_MILLION = 0.042;

type FailureInjection =
  | "jev_malformed"
  | "jev_timeout"
  | "none"
  | "storage_failure";
type ProcessId = "P06" | "P07";
type Task =
  | { processId: "P06"; task: P06EvaluationTask }
  | { processId: "P07"; task: P07EvaluationTask };

interface Options {
  aggregateInput: string | null;
  concurrency: number;
  dryRun: boolean;
  expectedResolvedModel: string;
  failureInjection: FailureInjection;
  live: boolean;
  output: string;
  runs: number;
  selfTest: boolean;
  verifyFailures: boolean;
}

interface ProviderTiming {
  attempt: number;
  costSource: string;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  providerMs: number | null;
  retryMs: number;
  wallMs: number;
}

interface ProviderResult {
  errorClass: string | null;
  errorMessage: string | null;
  requestedModel: string;
  resolvedModel: string | null;
  response: ValidatedJevResponse | null;
  timing: ProviderTiming;
}

interface P06TaskResult {
  attemptIndex: 1 | 2;
  corpusClass: P06EvaluationTask["corpusClass"];
  expectedDecision: P06Decision;
  fixtureId: string;
  jev: ProviderResult;
  judgment: P06Judgment | null;
  language: P06EvaluationTask["language"];
  processId: "P06";
  questionSetHash: string;
  repeatId: number;
  stateHash: string;
  taskId: string;
  variant: P06EvaluationTask["variant"];
}

interface P07TaskResult {
  corpusClass: P07EvaluationTask["corpusClass"];
  expectedDecision: P07Decision;
  fixtureId: string;
  jev: ProviderResult;
  judgment: P07Judgment | null;
  language: P07EvaluationTask["language"];
  processId: "P07";
  questionSetHash: string;
  repeatId: number;
  stateHash: string;
  taskId: string;
}

type TaskResult = P06TaskResult | P07TaskResult;

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
    !["jev_malformed", "jev_timeout", "none", "storage_failure"].includes(
      failureInjection,
    )
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
    live,
    output: argument("output") ?? "../../docs/jev-pipeline-j4-results.json",
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
      /answer|response|probabilit|usage|primitive|noul/iu.test(error.message)
    ) {
      return { code: "SCHEMA_ERROR", message: error.message };
    }
    return { code: "SERVICE_FAILURE", message: error.message };
  }
  return { code: "UNKNOWN", message: String(error) };
}

function waitForRetry(delayMs: number): Promise<void> {
  return new Promise((resolveWait) => setTimeout(resolveWait, delayMs));
}

function estimatedCost(response: ValidatedJevResponse): {
  source: string;
  usd: number;
} {
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
): Promise<ProviderResult> {
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
      const cost = estimatedCost(response);
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
      await waitForRetry(delayMs);
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
      retryMs,
      wallMs: Math.round(performance.now() - started),
    },
  };
}

function oracleResponse(
  task: Task,
  questions: JevQuestionSet,
): ValidatedJevResponse {
  const labels =
    task.processId === "P06"
      ? expectedP06NoulLabels(task.task)
      : expectedP07NoulLabels(task.task);
  return validateJevResponse(
    {
      answers: Object.fromEntries(
        Object.keys(questions).map((id) => [
          id,
          { noul: labels[id] === 1 ? 0.95 : 0.05, type: "noul" },
        ]),
      ),
      model: "self-test-jev-j4-oracle-v1",
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    questions,
  );
}

function selfTestProvider(
  task: Task,
  questions: JevQuestionSet,
): ProviderResult {
  const response = oracleResponse(task, questions);
  return {
    errorClass: null,
    errorMessage: null,
    requestedModel: "self-test-jev-j4-oracle-v1",
    resolvedModel: response.model,
    response,
    timing: {
      attempt: 1,
      costSource: "self_test",
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerMs: 0,
      retryMs: 0,
      wallMs: 0,
    },
  };
}

async function evaluateTask(task: Task, options: Options): Promise<TaskResult> {
  const state =
    task.processId === "P06"
      ? buildPublicP06State(task.task)
      : buildPublicP07State(task.task);
  const questions =
    task.processId === "P06"
      ? buildP06Questions()
      : buildP07Questions(task.task);
  const jev = options.live
    ? await callJev(state, questions, options)
    : selfTestProvider(task, questions);
  const shared = {
    corpusClass: task.task.corpusClass,
    fixtureId: task.task.fixtureId,
    jev,
    language: task.task.language,
    questionSetHash: sha256Canonical(questions),
    repeatId: task.task.repeatId,
    stateHash: sha256Canonical(state),
    taskId: task.task.taskId,
  };
  if (task.processId === "P06") {
    return {
      ...shared,
      attemptIndex: task.task.attempt,
      expectedDecision: task.task.expectedDecision,
      judgment: jev.response
        ? deriveP06Judgment(task.task, jev.response)
        : null,
      processId: "P06",
      variant: task.task.variant,
    };
  }
  return {
    ...shared,
    expectedDecision: task.task.expectedDecision,
    judgment: jev.response ? deriveP07Judgment(task.task, jev.response) : null,
    processId: "P07",
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

function taskDecision(result: TaskResult): string {
  return result.judgment?.decision ?? "unavailable";
}

function terminalRoute(
  result: TaskResult,
): "ACCEPT" | "BLOCK" | "CLARIFY" | "UNAVAILABLE" | undefined {
  if (!result.judgment) return "UNAVAILABLE";
  if (result.corpusClass === "BLOCKED") return "BLOCK";
  if (result.processId === "P06") {
    if (result.judgment.decision === "rewrite_supported") {
      return result.corpusClass === "CLEAR" ? "ACCEPT" : "CLARIFY";
    }
    return result.judgment.decision === "clarify_or_review"
      ? "CLARIFY"
      : undefined;
  }
  if (result.judgment.decision === "blocked_dependency") return "BLOCK";
  return result.judgment.decision === "complete" ? "ACCEPT" : "CLARIFY";
}

function expectedTerminalRoute(result: TaskResult) {
  if (result.corpusClass === "BLOCKED") return "BLOCK" as const;
  if (result.processId === "P06") {
    if (result.expectedDecision === "revision_required") return undefined;
    if (result.expectedDecision === "clarify_or_review")
      return "CLARIFY" as const;
    return result.corpusClass === "CLEAR"
      ? ("ACCEPT" as const)
      : ("CLARIFY" as const);
  }
  if (result.expectedDecision === "blocked_dependency") return "BLOCK" as const;
  return result.expectedDecision === "complete"
    ? ("ACCEPT" as const)
    : ("CLARIFY" as const);
}

function createRecords(
  experimentId: string,
  revision: string,
  results: readonly TaskResult[],
) {
  return results.flatMap((result) => {
    const shared = {
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      decisionPolicyVersion: JEV_J4_DECISION_POLICY_VERSION,
      experimentId,
      processId: result.processId,
      proposalId: result.fixtureId,
      questionSetHash: result.questionSetHash,
      questionSetVersion: JEV_J4_QUESTION_SET_VERSION,
      repeatId: result.repeatId,
      sourceRevision: revision,
      stateHash: result.stateHash,
      stateSchemaVersion: JEV_J4_STATE_SCHEMA_VERSION,
      taskId: result.taskId,
    };
    const baseline = {
      ...shared,
      answers: null,
      arm: "B0" as const,
      attempt: 0,
      provider: "deterministic-authoritative-fixtures",
      requestedModel: "none",
      resolvedModel: "none",
      stageDecision: result.expectedDecision,
      ...(expectedTerminalRoute(result)
        ? { terminalRoute: expectedTerminalRoute(result) }
        : {}),
      timing: { wallMs: 0 },
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
    };
    const measured = (arm: "C6" | "C7" | "I6" | "I7") => ({
      ...shared,
      answers: result.jev.response?.answers ?? null,
      arm,
      attempt: result.jev.timing.attempt,
      ...(result.jev.errorClass ? { errorClass: result.jev.errorClass } : {}),
      provider: "openrouter-decisions",
      requestedModel: result.jev.requestedModel,
      resolvedModel: result.jev.resolvedModel ?? "unavailable",
      stageDecision: taskDecision(result),
      ...(terminalRoute(result)
        ? { terminalRoute: terminalRoute(result) }
        : {}),
      timing: {
        providerMs: result.jev.timing.providerMs ?? undefined,
        retryMs: result.jev.timing.retryMs,
        wallMs: result.jev.timing.wallMs,
      },
      usage: {
        costSource: result.jev.timing.costSource,
        costUsd: result.jev.timing.costUsd ?? undefined,
        inputTokens: result.jev.timing.inputTokens ?? undefined,
        outputTokens: result.jev.timing.outputTokens ?? undefined,
      },
    });
    return result.processId === "P06"
      ? [baseline, measured("I6"), measured("C6")]
      : [baseline, measured("I7"), measured("C7")];
  });
}

function percentile(
  values: readonly number[],
  fraction: number,
): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.ceil(fraction * sorted.length) - 1] ?? sorted.at(-1)!;
}

function armMetrics(
  processId: ProcessId,
  arm: "B0" | "C6" | "C7" | "I6" | "I7",
  records: ReturnType<typeof createRecords>,
  results: readonly TaskResult[],
) {
  const selected = records.filter(
    (record) => record.processId === processId && record.arm === arm,
  );
  const expected = new Map(
    results
      .filter((result) => result.processId === processId)
      .map((result) => [
        `${result.repeatId}/${result.taskId}`,
        result.expectedDecision,
      ]),
  );
  const decisions = selected.map((record) => ({
    actual: record.stageDecision,
    expected: expected.get(`${record.repeatId}/${record.taskId}`)!,
  }));
  const latencies = selected.map((record) => record.timing.wallMs);
  const providerLatencies = selected
    .map((record) =>
      "providerMs" in record.timing ? record.timing.providerMs : undefined,
    )
    .filter((value): value is number => typeof value === "number");
  const costs = selected
    .map((record) => record.usage.costUsd)
    .filter((value): value is number => typeof value === "number");
  const correctCount = decisions.filter(
    (decision) => decision.actual === decision.expected,
  ).length;
  const decisionCounts: Record<string, number> = {};
  const confusionMatrix: Record<string, Record<string, number>> = {};
  for (const decision of decisions) {
    decisionCounts[decision.actual] =
      (decisionCounts[decision.actual] ?? 0) + 1;
    const row = (confusionMatrix[decision.expected] ??= {});
    row[decision.actual] = (row[decision.actual] ?? 0) + 1;
  }
  const wrongAutomaticSupportCount = decisions.filter((decision) =>
    processId === "P06"
      ? decision.actual === "rewrite_supported" &&
        decision.expected !== "rewrite_supported"
      : decision.actual === "complete" && decision.expected !== "complete",
  ).length;
  const totalCostUsd =
    costs.length === selected.length
      ? costs.reduce((sum, value) => sum + value, 0)
      : null;
  const sumUsage = (field: "inputTokens" | "outputTokens") => {
    const values = selected.map((record) => record.usage[field]);
    return values.every((value): value is number => typeof value === "number")
      ? values.reduce((sum, value) => sum + value, 0)
      : null;
  };
  return {
    accuracy: correctCount / Math.max(decisions.length, 1),
    confusionMatrix,
    correctCount,
    costPerCorrectUsd:
      totalCostUsd === null || correctCount === 0
        ? null
        : totalCostUsd / correctCount,
    costUsd: totalCostUsd,
    decisionCounts,
    errorCount: selected.filter((record) => "errorClass" in record).length,
    latencyMs: {
      max: latencies.length ? Math.max(...latencies) : null,
      min: latencies.length ? Math.min(...latencies) : null,
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
    },
    providerLatencyMs: {
      max: providerLatencies.length ? Math.max(...providerLatencies) : null,
      min: providerLatencies.length ? Math.min(...providerLatencies) : null,
      p50: percentile(providerLatencies, 0.5),
      p95: percentile(providerLatencies, 0.95),
    },
    retryCount: selected.filter((record) => record.attempt > 1).length,
    sampleCount: selected.length,
    usage: {
      inputTokens: sumUsage("inputTokens"),
      outputTokens: sumUsage("outputTokens"),
    },
    wrongAutomaticSupportCount,
  };
}

function brierMetrics(tasks: readonly Task[], results: readonly TaskResult[]) {
  const taskMap = new Map(
    tasks.map((entry) => [
      `${entry.processId}/${entry.task.repeatId}/${entry.task.taskId}`,
      entry,
    ]),
  );
  const errors: Record<ProcessId, number[]> = { P06: [], P07: [] };
  for (const result of results) {
    const entry = taskMap.get(
      `${result.processId}/${result.repeatId}/${result.taskId}`,
    )!;
    const labels =
      entry.processId === "P06"
        ? expectedP06NoulLabels(entry.task)
        : expectedP07NoulLabels(entry.task);
    const ids =
      entry.processId === "P06"
        ? entry.task.applicableDimensions.map((id) => `p06_${id}`)
        : entry.task.applicableCriteria.map((id) => `p07_${id}`);
    for (const id of ids) {
      const answer = result.jev.response?.answers[id];
      if (answer?.type === "noul") {
        errors[result.processId].push((answer.noul - labels[id]!) ** 2);
      }
    }
  }
  return Object.fromEntries(
    (Object.entries(errors) as [ProcessId, number[]][]).map(
      ([processId, values]) => [
        processId,
        {
          answerCount: values.length,
          brierScore: values.length
            ? values.reduce((sum, value) => sum + value, 0) / values.length
            : null,
        },
      ],
    ),
  );
}

function stability(results: readonly TaskResult[]) {
  const groups = new Map<string, string[]>();
  for (const result of results) {
    const key = `${result.processId}/${result.taskId}`;
    const decisions = groups.get(key) ?? [];
    decisions.push(taskDecision(result));
    groups.set(key, decisions);
  }
  return Object.fromEntries(
    [...groups].map(([taskId, decisions]) => [
      taskId,
      { agreed: new Set(decisions).size === 1, decisions },
    ]),
  );
}

function perLanguage(results: readonly TaskResult[]) {
  return Object.fromEntries(
    (["P06", "P07"] as const).map((processId) => [
      processId,
      Object.fromEntries(
        (["en", "pt"] as const).map((language) => {
          const selected = results.filter(
            (result) =>
              result.processId === processId && result.language === language,
          );
          const correct = selected.filter(
            (result) => taskDecision(result) === result.expectedDecision,
          ).length;
          return [
            language,
            {
              accuracy: correct / Math.max(selected.length, 1),
              correctCount: correct,
              sampleCount: selected.length,
            },
          ];
        }),
      ),
    ]),
  );
}

function summarize(
  tasks: readonly Task[],
  results: readonly TaskResult[],
  records: ReturnType<typeof createRecords>,
) {
  const p06B0 = armMetrics("P06", "B0", records, results);
  const p06I6 = armMetrics("P06", "I6", records, results);
  const p06C6 = armMetrics("P06", "C6", records, results);
  const p07B0 = armMetrics("P07", "B0", records, results);
  const p07I7 = armMetrics("P07", "I7", records, results);
  const p07C7 = armMetrics("P07", "C7", records, results);
  return {
    arms: {
      P06: { B0: p06B0, C6: p06C6, I6: p06I6 },
      P07: { B0: p07B0, C7: p07C7, I7: p07I7 },
    },
    noulCalibration: brierMetrics(tasks, results),
    perLanguage: perLanguage(results),
    safeGatePassed:
      p06I6.wrongAutomaticSupportCount === 0 &&
      p07I7.wrongAutomaticSupportCount === 0,
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

function createTasks(runs: number): Task[] {
  return Array.from({ length: runs }, (_, index) => {
    const repeatId = index + 1;
    const p06 = createP06EvaluationTasks(repeatId).map((task) => ({
      processId: "P06" as const,
      task,
    }));
    const p07 = createP07EvaluationTasks(repeatId).map((task) => ({
      processId: "P07" as const,
      task,
    }));
    return repeatId % 2 === 1 ? [...p06, ...p07] : [...p07, ...p06];
  }).flat();
}

async function runExperiment(options: Options) {
  validateJevPipelineCorpus();
  validateJ4EvaluationTasks();
  if (fingerprintJevPipelineCorpusV1() !== JEV_PIPELINE_CORPUS_V1_SHA256) {
    throw new EvaluationError(
      "CORPUS_DRIFT",
      "The pinned JEV corpus fingerprint changed",
    );
  }
  if (options.live) loadRootEnvironment();
  const tasks = createTasks(options.runs);
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const results = await mapConcurrent(tasks, options.concurrency, (task) =>
    evaluateTask(task, options),
  );
  const revision = sourceRevision();
  const experimentId = `jev-j4-p06-p07-${startedAt.replace(/[:.]/gu, "-")}`;
  const records = createRecords(experimentId, revision, results);
  const report = {
    experimentId,
    generatedAt: new Date().toISOString(),
    method: {
      corpusHash: JEV_PIPELINE_CORPUS_V1_SHA256,
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      cumulativeNote:
        "C6 equals I6 and C7 equals I7 because no downstream JEV process has an owner-confirmed production promotion; existing authoritative gates remain unchanged.",
      dirtyWorktreeDisclosure:
        revision === "dirty-worktree-disclosed"
          ? "Run from a dirty worktree; source and policy hashes are the reproducibility boundary."
          : null,
      expectedResolvedModel: options.live
        ? options.expectedResolvedModel
        : "self-test-jev-j4-oracle-v1",
      mode: options.live ? "live" : "self-test",
      noProductionWrites:
        "This runner imports no API server, database, wallet, payment, artifact-freeze, or chain-write entry point.",
      processes: ["P06", "P07"],
      questionPolicyHash: JEV_J4_QUESTION_POLICY_SHA256,
      questionSetVersion: JEV_J4_QUESTION_SET_VERSION,
      requestedModel: options.live
        ? JEV_REQUESTED_MODEL
        : "self-test-jev-j4-oracle-v1",
      runs: options.runs,
      sourceRevision: revision,
      startedAt,
      stateSchemaVersion: JEV_J4_STATE_SCHEMA_VERSION,
      taskCount: tasks.length,
      taskCountsPerRepeat: { P06: 30, P07: 10 },
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
  const samples: Task[] = [
    { processId: "P06", task: createP06EvaluationTasks(1)[0]! },
    { processId: "P07", task: createP07EvaluationTasks(1)[0]! },
  ];
  const observed: Record<string, string> = {};
  for (const failure of ["jev_timeout", "jev_malformed"] as const) {
    for (const sample of samples) {
      const result = await evaluateTask(sample, {
        ...options,
        failureInjection: failure,
        live: true,
        selfTest: false,
        verifyFailures: false,
      });
      if (!result.jev.errorClass || result.judgment !== null) {
        throw new Error(`${sample.processId}/${failure} did not fail closed`);
      }
      observed[`${sample.processId}/${failure}`] = result.jev.errorClass;
    }
  }
  let storageFailureCode: string | null = null;
  try {
    atomicWriteJson(options.output, {}, "storage_failure");
  } catch (error) {
    storageFailureCode = classifyError(error).code;
  }
  if (storageFailureCode !== "STORAGE_FAILURE") {
    throw new Error("storage_failure did not fail closed");
  }
  observed.storage_failure = storageFailureCode;
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
    validateJ4EvaluationTasks();
    const p06 = createP06EvaluationTasks(1)[0]!;
    const p07 = createP07EvaluationTasks(1)[0]!;
    console.log(
      JSON.stringify(
        {
          corpusHash: fingerprintJevPipelineCorpusV1(),
          p06QuestionCount: Object.keys(buildP06Questions()).length,
          p07CriterionCount: 20,
          policyHash: JEV_J4_QUESTION_POLICY_SHA256,
          sampleP06StateHash: sha256Canonical(buildPublicP06State(p06)),
          sampleP07StateHash: sha256Canonical(buildPublicP07State(p07)),
          sampleStatePreview: canonicalJson(buildPublicP07State(p07)).slice(
            0,
            200,
          ),
          taskCountsPerRun: { P06: 30, P07: 10 },
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
