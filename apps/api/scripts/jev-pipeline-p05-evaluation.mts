import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import {
  buildP05Questions,
  buildPublicP05State,
  createP05EvaluationTasks,
  deriveP05Judgment,
  expectedP05NoulLabels,
  JEV_P05_DECISION_POLICY_VERSION,
  JEV_P05_QUESTION_POLICY_SHA256,
  JEV_P05_QUESTION_SET_VERSION,
  JEV_P05_STATE_SCHEMA_VERSION,
  type P05Choice,
  type P05EvaluationTask,
  type P05Judgment,
} from "../src/jevPipelineP05Evaluation.js";
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

interface Timing {
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
  timing: Timing;
}

interface TaskResult {
  candidateId: string;
  corpusClass: P05EvaluationTask["corpusClass"];
  expectedChoice: P05Choice;
  fixtureId: string;
  jev: ProviderResult;
  judgment: P05Judgment | null;
  language: P05EvaluationTask["language"];
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

function parsePositiveInteger(name: string, fallback: number): number {
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
    concurrency: parsePositiveInteger("concurrency", 4),
    dryRun,
    expectedResolvedModel:
      argument("expected-resolved-model") ?? "typesafe/jev-1.13-20260917",
    failureInjection,
    live,
    output: argument("output") ?? "../../docs/jev-pipeline-j3-results.json",
    runs: parsePositiveInteger("runs", 3),
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
  if (!key)
    throw new EvaluationError(
      "CONFIGURATION_ERROR",
      "API_KEY_OPENROUTER is not configured",
    );
  return key;
}

function classifyError(error: unknown): { code: string; message: string } {
  if (error instanceof EvaluationError)
    return { code: error.code, message: error.message };
  if (error instanceof Error) {
    if (
      error.name === "TimeoutError" ||
      /timeout|timed out/iu.test(error.message)
    ) {
      return { code: "SERVICE_TIMEOUT", message: error.message };
    }
    if (
      /answer|response|probabilit|usage|primitive|choice/iu.test(error.message)
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
  task: P05EvaluationTask,
  questions: JevQuestionSet,
): ValidatedJevResponse {
  const labels = expectedP05NoulLabels(task);
  const body = {
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        if (question.type === "noul") {
          return [id, { noul: labels[id] === 1 ? 0.95 : 0.05, type: "noul" }];
        }
        const options = Object.keys(question.criteria);
        return [
          id,
          {
            choice: task.expectedChoice,
            confidence: 0.9,
            probabilities: Object.fromEntries(
              options.map((option) => [
                option,
                option === task.expectedChoice
                  ? 0.92
                  : 0.08 / (options.length - 1),
              ]),
            ),
            type: "choice",
          },
        ];
      }),
    ),
    model: "self-test-p05-oracle-v1",
    usage: { input_tokens: 0, output_tokens: 0 },
  };
  return validateJevResponse(body, questions);
}

function selfTestProvider(
  task: P05EvaluationTask,
  questions: JevQuestionSet,
): ProviderResult {
  const response = oracleResponse(task, questions);
  return {
    errorClass: null,
    errorMessage: null,
    requestedModel: "self-test-p05-oracle-v1",
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

async function evaluateTask(
  task: P05EvaluationTask,
  options: Options,
): Promise<TaskResult> {
  const state = buildPublicP05State(task);
  const questions = buildP05Questions(task);
  const jev = options.live
    ? await callJev(state, questions, options)
    : selfTestProvider(task, questions);
  return {
    candidateId: task.candidate.id,
    corpusClass: task.corpusClass,
    expectedChoice: task.expectedChoice,
    fixtureId: task.fixtureId,
    jev,
    judgment: jev.response ? deriveP05Judgment(task, jev.response) : null,
    language: task.language,
    questionSetHash: sha256Canonical(questions),
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

function terminalRoute(
  choice: P05Choice,
): "ACCEPT" | "BLOCK" | "CLARIFY" | "UNAVAILABLE" {
  if (choice === "candidate_supported") return "ACCEPT";
  if (choice === "source_ambiguous") return "CLARIFY";
  if (choice === "insufficient_evidence") return "UNAVAILABLE";
  return "BLOCK";
}

function createRecords(
  experimentId: string,
  revision: string,
  results: readonly TaskResult[],
) {
  return results.flatMap((result) => {
    const shared = {
      candidateId: result.candidateId,
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      decisionPolicyVersion: JEV_P05_DECISION_POLICY_VERSION,
      experimentId,
      processId: "P05" as const,
      proposalId: result.fixtureId,
      questionSetHash: result.questionSetHash,
      questionSetVersion: JEV_P05_QUESTION_SET_VERSION,
      repeatId: result.repeatId,
      sourceRevision: revision,
      stateHash: result.stateHash,
      stateSchemaVersion: JEV_P05_STATE_SCHEMA_VERSION,
    };
    const baseline = {
      ...shared,
      answers: null,
      arm: "B0" as const,
      attempt: 0,
      provider: "deterministic-authoritative-fixtures",
      requestedModel: "none",
      resolvedModel: "none",
      stageDecision: result.expectedChoice,
      terminalRoute: terminalRoute(result.expectedChoice),
      timing: { wallMs: 0 },
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
    };
    const measured = (arm: "C5" | "I5") => ({
      ...shared,
      answers: result.jev.response?.answers ?? null,
      arm,
      attempt: result.jev.timing.attempt,
      ...(result.jev.errorClass ? { errorClass: result.jev.errorClass } : {}),
      provider: "openrouter-decisions",
      requestedModel: result.jev.requestedModel,
      resolvedModel: result.jev.resolvedModel ?? "unavailable",
      stageDecision: result.judgment?.decision ?? "unavailable",
      terminalRoute: result.judgment
        ? terminalRoute(result.judgment.decision)
        : ("UNAVAILABLE" as const),
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
    return [baseline, measured("I5"), measured("C5")];
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
  arm: "B0" | "C5" | "I5",
  records: ReturnType<typeof createRecords>,
  results: readonly TaskResult[],
) {
  const selected = records.filter((record) => record.arm === arm);
  const expected = new Map(
    results.map((result) => [
      `${result.repeatId}/${result.fixtureId}/${result.candidateId}`,
      result.expectedChoice,
    ]),
  );
  const decisions = selected.map((record) => ({
    actual: record.stageDecision,
    expected: expected.get(
      `${record.repeatId}/${record.proposalId}/${record.candidateId}`,
    )!,
  }));
  const latencies = selected.map((record) => record.timing.wallMs);
  const providerLatencies = selected
    .map((record) =>
      "providerMs" in record.timing ? record.timing.providerMs : undefined,
    )
    .filter((value): value is number => typeof value === "number");
  const priced = selected
    .map((record) => record.usage.costUsd)
    .filter((value): value is number => typeof value === "number");
  const correctCount = decisions.filter(
    (item) => item.actual === item.expected,
  ).length;
  const decisionCounts: Record<string, number> = {};
  const confusionMatrix: Record<string, Record<string, number>> = {};
  for (const item of decisions) {
    decisionCounts[item.actual] = (decisionCounts[item.actual] ?? 0) + 1;
    const row = (confusionMatrix[item.expected] ??= {});
    row[item.actual] = (row[item.actual] ?? 0) + 1;
  }
  const sumUsage = (field: "inputTokens" | "outputTokens") => {
    const values = selected.map((record) => record.usage[field]);
    return values.every((value): value is number => typeof value === "number")
      ? values.reduce((sum, value) => sum + value, 0)
      : null;
  };
  const measuredResults = results.filter((result) => result.judgment !== null);
  const selectedChoiceCorrectCount =
    arm === "B0"
      ? selected.length
      : measuredResults.filter(
          (result) =>
            result.judgment?.overallChoice.choice === result.expectedChoice,
        ).length;
  const totalCostUsd =
    priced.length === selected.length
      ? priced.reduce((sum, value) => sum + value, 0)
      : null;
  return {
    accuracy: correctCount / Math.max(decisions.length, 1),
    automationCoverage:
      decisions.filter(
        (item) =>
          item.actual !== "insufficient_evidence" &&
          item.actual !== "unavailable",
      ).length / Math.max(decisions.length, 1),
    automaticWrongAcceptanceCount: decisions.filter(
      (item) =>
        item.actual === "candidate_supported" &&
        item.expected !== "candidate_supported",
    ).length,
    choiceSelectedAccuracy:
      selectedChoiceCorrectCount / Math.max(selected.length, 1),
    confusionMatrix,
    correctCount,
    costPerCorrectUsd:
      totalCostUsd === null || correctCount === 0
        ? null
        : totalCostUsd / correctCount,
    costSourceCounts: Object.fromEntries(
      Object.entries(
        selected.reduce<Record<string, number>>((counts, record) => {
          const source =
            "costSource" in record.usage
              ? (record.usage.costSource ?? "unavailable")
              : "baseline";
          counts[source] = (counts[source] ?? 0) + 1;
          return counts;
        }, {}),
      ).sort(([left], [right]) => left.localeCompare(right)),
    ),
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
    unresolvedOrReviewCount: decisions.filter(
      (item) =>
        item.actual === "insufficient_evidence" ||
        item.actual === "unavailable",
    ).length,
    usage: {
      inputTokens: sumUsage("inputTokens"),
      outputTokens: sumUsage("outputTokens"),
    },
  };
}

function brierMetrics(
  tasks: readonly P05EvaluationTask[],
  results: readonly TaskResult[],
) {
  const taskMap = new Map(
    tasks.map((task) => [`${task.repeatId}/${task.taskId}`, task]),
  );
  const squaredErrors: number[] = [];
  for (const result of results) {
    const task = taskMap.get(`${result.repeatId}/${result.taskId}`)!;
    const labels = expectedP05NoulLabels(task);
    for (const [id, label] of Object.entries(labels)) {
      const answer = result.jev.response?.answers[id];
      if (answer?.type === "noul")
        squaredErrors.push((answer.noul - label) ** 2);
    }
  }
  return {
    answerCount: squaredErrors.length,
    brierScore: squaredErrors.length
      ? squaredErrors.reduce((sum, value) => sum + value, 0) /
        squaredErrors.length
      : null,
  };
}

function stability(results: readonly TaskResult[]) {
  const groups = new Map<string, string[]>();
  for (const result of results) {
    const decisions = groups.get(result.taskId) ?? [];
    decisions.push(result.judgment?.decision ?? "unavailable");
    groups.set(result.taskId, decisions);
  }
  return Object.fromEntries(
    [...groups].map(([taskId, decisions]) => [
      taskId,
      { agreed: new Set(decisions).size === 1, decisions },
    ]),
  );
}

function summarize(
  tasks: readonly P05EvaluationTask[],
  results: readonly TaskResult[],
  records: ReturnType<typeof createRecords>,
) {
  return {
    arms: Object.fromEntries(
      (["B0", "I5", "C5"] as const).map((arm) => [
        arm,
        armMetrics(arm, records, results),
      ]),
    ),
    noulCalibration: brierMetrics(tasks, results),
    safeGatePassed: (["I5", "C5"] as const).every(
      (arm) =>
        armMetrics(arm, records, results).automaticWrongAcceptanceCount === 0,
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

async function runExperiment(options: Options) {
  validateJevPipelineCorpus();
  if (fingerprintJevPipelineCorpusV1() !== JEV_PIPELINE_CORPUS_V1_SHA256) {
    throw new EvaluationError(
      "CORPUS_DRIFT",
      "The pinned JEV corpus fingerprint changed",
    );
  }
  if (options.live) loadRootEnvironment();
  const tasks = Array.from({ length: options.runs }, (_, index) =>
    createP05EvaluationTasks(index + 1),
  ).flat();
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const results = await mapConcurrent(tasks, options.concurrency, (task) =>
    evaluateTask(task, options),
  );
  const revision = sourceRevision();
  const experimentId = `jev-j3-p05-${startedAt.replace(/[:.]/gu, "-")}`;
  const records = createRecords(experimentId, revision, results);
  const report = {
    experimentId,
    generatedAt: new Date().toISOString(),
    method: {
      corpusHash: JEV_PIPELINE_CORPUS_V1_SHA256,
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      cumulativeNote:
        "C5 equals I5 because no downstream JEV process has owner-confirmed promotion; existing authoritative validators remain unchanged.",
      dirtyWorktreeDisclosure:
        revision === "dirty-worktree-disclosed"
          ? "Run from a dirty worktree; source and policy hashes are the reproducibility boundary."
          : null,
      expectedResolvedModel: options.live
        ? options.expectedResolvedModel
        : "self-test-p05-oracle-v1",
      mode: options.live ? "live" : "self-test",
      noProductionWrites:
        "This runner imports no API server, database, wallet, payment, artifact-freeze, or chain-write entry point.",
      process: "P05",
      questionPolicyHash: JEV_P05_QUESTION_POLICY_SHA256,
      questionSetVersion: JEV_P05_QUESTION_SET_VERSION,
      requestedModel: options.live
        ? JEV_REQUESTED_MODEL
        : "self-test-p05-oracle-v1",
      runs: options.runs,
      sourceRevision: revision,
      startedAt,
      stateSchemaVersion: JEV_P05_STATE_SCHEMA_VERSION,
      taskCount: tasks.length,
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
  const task = createP05EvaluationTasks(1)[0]!;
  const observed: Record<string, string> = {};
  for (const failure of ["jev_timeout", "jev_malformed"] as const) {
    const result = await evaluateTask(task, {
      ...options,
      failureInjection: failure,
      live: true,
      selfTest: false,
      verifyFailures: false,
    });
    if (!result.jev.errorClass || result.judgment !== null) {
      throw new Error(`${failure} did not fail closed`);
    }
    observed[failure] = result.jev.errorClass;
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
  const tasks = Array.from({ length: existing.method.runs }, (_, index) =>
    createP05EvaluationTasks(index + 1),
  ).flat();
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
    const tasks = createP05EvaluationTasks(1);
    console.log(
      JSON.stringify(
        {
          corpusHash: fingerprintJevPipelineCorpusV1(),
          policyHash: JEV_P05_QUESTION_POLICY_SHA256,
          sampleStateHash: sha256Canonical(buildPublicP05State(tasks[0]!)),
          sampleStatePreview: canonicalJson(
            buildPublicP05State(tasks[0]!),
          ).slice(0, 200),
          taskCountPerRun: tasks.length,
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
