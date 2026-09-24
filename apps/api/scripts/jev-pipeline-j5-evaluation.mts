import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import {
  buildP08Questions,
  buildP09Questions,
  buildP10Questions,
  buildP11Questions,
  buildPublicP08State,
  buildPublicP09State,
  buildPublicP10State,
  buildPublicP11State,
  createP08EvaluationTasks,
  createP09EvaluationTasks,
  createP10EvaluationTasks,
  createP11EvaluationTasks,
  deriveP08Judgment,
  deriveP09Judgment,
  deriveP10Judgment,
  deriveP11Judgment,
  expectedP08Answers,
  expectedP09Answers,
  expectedP10Answers,
  expectedP11Answers,
  JEV_J5_DECISION_POLICY_VERSION,
  JEV_J5_QUESTION_POLICY_SHA256,
  JEV_J5_QUESTION_SET_VERSION,
  JEV_J5_STATE_SCHEMA_VERSION,
  validateJ5EvaluationTasks,
  type ExpectedJevAnswer,
  type P08EvaluationTask,
  type P08Judgment,
  type P09EvaluationTask,
  type P09Judgment,
  type P10EvaluationTask,
  type P10Judgment,
  type P11EvaluationTask,
  type P11Judgment,
} from "../src/jevPipelineJ5Evaluation.js";
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
type ProcessId = "P08" | "P09" | "P10" | "P11";
type Task =
  | { processId: "P08"; task: P08EvaluationTask }
  | { processId: "P09"; task: P09EvaluationTask }
  | { processId: "P10"; task: P10EvaluationTask }
  | { processId: "P11"; task: P11EvaluationTask };
type Judgment =
  | P08Judgment
  | P09Judgment
  | P10Judgment
  | P11Judgment
  | { decision: "identity_no_translation" };

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
  skippedReason: string | null;
  timing: ProviderTiming;
}

interface TaskResult {
  corpusClass: P08EvaluationTask["corpusClass"];
  expectedDecision: string;
  fixtureId: string;
  jev: ProviderResult;
  judgment: Judgment | null;
  language: P08EvaluationTask["language"];
  processId: ProcessId;
  questionSetHash: string;
  repeatId: number;
  stateHash: string;
  taskId: string;
  variant: string;
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
    output: argument("output") ?? "../../docs/jev-pipeline-j5-results.json",
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
      /answer|response|probabilit|usage|primitive|noul|score|legend/iu.test(
        error.message,
      )
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
        skippedReason: null,
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
    skippedReason: null,
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

function expectedAnswersFor(task: Task): Record<string, ExpectedJevAnswer> {
  switch (task.processId) {
    case "P08":
      return expectedP08Answers(task.task);
    case "P09":
      return expectedP09Answers(task.task);
    case "P10":
      return expectedP10Answers(task.task);
    case "P11":
      return expectedP11Answers(task.task);
  }
}

function oracleResponse(
  task: Task,
  questions: JevQuestionSet,
): ValidatedJevResponse {
  const labels = expectedAnswersFor(task);
  const answers = Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      const label = labels[id];
      if (!label)
        throw new Error(`Missing oracle label ${task.processId}/${id}`);
      if (question.type === "noul") {
        if (label.type !== "noul") throw new Error(`Wrong oracle type ${id}`);
        return [id, { noul: label.value === 1 ? 0.95 : 0.05, type: "noul" }];
      }
      if (question.type !== "score" || label.type !== "score") {
        throw new Error(`Wrong oracle Score type ${id}`);
      }
      return [
        id,
        {
          confidence: 0.9,
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
        },
      ];
    }),
  );
  return validateJevResponse(
    {
      answers,
      model: "self-test-jev-j5-oracle-v1",
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
    requestedModel: "self-test-jev-j5-oracle-v1",
    resolvedModel: response.model,
    response,
    skippedReason: null,
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

function identityProvider(): ProviderResult {
  return {
    errorClass: null,
    errorMessage: null,
    requestedModel: "none",
    resolvedModel: "not-called",
    response: null,
    skippedReason: "english_identity_branch",
    timing: {
      attempt: 0,
      costSource: "not_called",
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerMs: 0,
      retryMs: 0,
      wallMs: 0,
    },
  };
}

function stateAndQuestions(task: Task): {
  questions: JevQuestionSet;
  state: unknown;
} {
  switch (task.processId) {
    case "P08":
      return {
        questions: buildP08Questions(task.task),
        state: buildPublicP08State(task.task),
      };
    case "P09":
      return {
        questions: buildP09Questions(task.task),
        state: buildPublicP09State(task.task),
      };
    case "P10":
      return {
        questions: buildP10Questions(task.task),
        state: buildPublicP10State(task.task),
      };
    case "P11":
      if (task.task.variant === "identity") {
        return {
          questions: {},
          state: { identitySource: task.task.source, language: "en" },
        };
      }
      return {
        questions: buildP11Questions(task.task),
        state: buildPublicP11State(task.task),
      };
  }
}

function deriveJudgment(task: Task, response: ValidatedJevResponse): Judgment {
  switch (task.processId) {
    case "P08":
      return deriveP08Judgment(task.task, response);
    case "P09":
      return deriveP09Judgment(task.task, response);
    case "P10":
      return deriveP10Judgment(task.task, response);
    case "P11":
      return deriveP11Judgment(task.task, response);
  }
}

function taskVariant(task: Task): string {
  switch (task.processId) {
    case "P08":
    case "P09":
    case "P11":
      return task.task.variant;
    case "P10":
      return "source";
  }
}

async function evaluateTask(task: Task, options: Options): Promise<TaskResult> {
  const { questions, state } = stateAndQuestions(task);
  const identity = task.processId === "P11" && task.task.variant === "identity";
  const jev = identity
    ? identityProvider()
    : options.live
      ? await callJev(state, questions, options)
      : selfTestProvider(task, questions);
  return {
    corpusClass: task.task.corpusClass,
    expectedDecision: task.task.expectedDecision,
    fixtureId: task.task.fixtureId,
    jev,
    judgment: identity
      ? { decision: "identity_no_translation" }
      : jev.response
        ? deriveJudgment(task, jev.response)
        : null,
    language: task.task.language,
    processId: task.processId,
    questionSetHash: sha256Canonical(
      identity ? { branch: "english_identity_no_translation" } : questions,
    ),
    repeatId: task.task.repeatId,
    stateHash: sha256Canonical(state),
    taskId: task.task.taskId,
    variant: taskVariant(task),
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

const ACCEPTING_DECISIONS = new Set([
  "complete",
  "identity_no_translation",
  "interpretation_supported",
  "normalization_supported",
  "translation_supported",
]);
const INTERMEDIATE_DECISIONS = new Set([
  "retry_translation",
  "revision_required",
]);

function routeFor(
  corpusClass: TaskResult["corpusClass"],
  decision: string,
): "ACCEPT" | "BLOCK" | "CLARIFY" | "UNAVAILABLE" | undefined {
  if (decision === "unavailable") return "UNAVAILABLE";
  if (corpusClass === "BLOCKED") return "BLOCK";
  if (INTERMEDIATE_DECISIONS.has(decision)) return undefined;
  if (corpusClass === "CLEAR" && ACCEPTING_DECISIONS.has(decision)) {
    return "ACCEPT";
  }
  return "CLARIFY";
}

function armFor(processId: ProcessId, cumulative: boolean): string {
  const number = processId.slice(1).replace(/^0/u, "");
  return `${cumulative ? "C" : "I"}${number}`;
}

function createRecords(
  experimentId: string,
  revision: string,
  results: readonly TaskResult[],
) {
  return results.flatMap((result) => {
    const shared = {
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      decisionPolicyVersion: JEV_J5_DECISION_POLICY_VERSION,
      experimentId,
      processId: result.processId,
      proposalId: result.fixtureId,
      questionSetHash: result.questionSetHash,
      questionSetVersion: JEV_J5_QUESTION_SET_VERSION,
      repeatId: result.repeatId,
      sourceRevision: revision,
      stateHash: result.stateHash,
      stateSchemaVersion: JEV_J5_STATE_SCHEMA_VERSION,
      taskId: result.taskId,
    };
    const baselineRoute = routeFor(result.corpusClass, result.expectedDecision);
    const baseline = {
      ...shared,
      answers: null,
      arm: "B0",
      attempt: 0,
      provider: "deterministic-authoritative-fixtures",
      requestedModel: "none",
      resolvedModel: "none",
      stageDecision: result.expectedDecision,
      ...(baselineRoute ? { terminalRoute: baselineRoute } : {}),
      timing: { wallMs: 0 },
      usage: { costUsd: 0, inputTokens: 0, outputTokens: 0 },
    };
    const measured = (cumulative: boolean) => {
      const decision = taskDecision(result);
      const route = routeFor(result.corpusClass, decision);
      return {
        ...shared,
        answers: result.jev.response?.answers ?? null,
        arm: armFor(result.processId, cumulative),
        attempt: result.jev.timing.attempt,
        ...(result.jev.errorClass ? { errorClass: result.jev.errorClass } : {}),
        ...(result.jev.skippedReason
          ? { skippedReason: result.jev.skippedReason }
          : {}),
        provider: result.jev.skippedReason
          ? "deterministic-identity"
          : "openrouter-decisions",
        requestedModel: result.jev.requestedModel,
        resolvedModel: result.jev.resolvedModel ?? "unavailable",
        stageDecision: decision,
        ...(route ? { terminalRoute: route } : {}),
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
      };
    };
    return [baseline, measured(false), measured(true)];
  });
}

type Records = ReturnType<typeof createRecords>;

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
  arm: string,
  records: Records,
  results: readonly TaskResult[],
) {
  const selected = records.filter(
    (record) => record.processId === processId && record.arm === arm,
  );
  const expected = new Map(
    results
      .filter((result) => result.processId === processId)
      .map((result) => [
        `${result.taskId}/${result.repeatId}`,
        result.expectedDecision,
      ]),
  );
  const correctness = selected.map((record) => {
    const expectedDecision = expected.get(
      `${record.taskId}/${record.repeatId}`,
    );
    return {
      correct: record.stageDecision === expectedDecision,
      expectedDecision,
      record,
    };
  });
  const measured = selected.filter((record) => record.arm !== "B0");
  const calls = measured.filter(
    (record) => !("skippedReason" in record) && !("errorClass" in record),
  );
  const wall = calls.map((record) => record.timing.wallMs);
  const provider = calls.flatMap((record) =>
    "providerMs" in record.timing &&
    typeof record.timing.providerMs === "number"
      ? [record.timing.providerMs]
      : [],
  );
  const correctCount = correctness.filter((entry) => entry.correct).length;
  const wrongAutomaticSupportCount = correctness.filter(
    ({ expectedDecision, record }) =>
      ACCEPTING_DECISIONS.has(record.stageDecision) &&
      !ACCEPTING_DECISIONS.has(expectedDecision ?? ""),
  ).length;
  return {
    accuracy: selected.length === 0 ? null : correctCount / selected.length,
    callCount: calls.length,
    correctCount,
    costUsd: calls.reduce(
      (sum, record) => sum + (record.usage.costUsd ?? 0),
      0,
    ),
    decisionCounts: Object.fromEntries(
      [...new Set(selected.map((record) => record.stageDecision))]
        .sort()
        .map((decision) => [
          decision,
          selected.filter((record) => record.stageDecision === decision).length,
        ]),
    ),
    errorCount: measured.filter((record) => "errorClass" in record).length,
    inputTokens: calls.reduce(
      (sum, record) => sum + (record.usage.inputTokens ?? 0),
      0,
    ),
    outputTokens: calls.reduce(
      (sum, record) => sum + (record.usage.outputTokens ?? 0),
      0,
    ),
    providerMs: {
      max: provider.length ? Math.max(...provider) : null,
      min: provider.length ? Math.min(...provider) : null,
      p50: percentile(provider, 0.5),
      p95: percentile(provider, 0.95),
    },
    retryCount: calls.reduce(
      (sum, record) => sum + Math.max(0, record.attempt - 1),
      0,
    ),
    skippedCount: measured.filter((record) => "skippedReason" in record).length,
    totalCount: selected.length,
    wallMs: {
      max: wall.length ? Math.max(...wall) : null,
      min: wall.length ? Math.min(...wall) : null,
      p50: percentile(wall, 0.5),
      p95: percentile(wall, 0.95),
    },
    wrongAutomaticSupportCount,
  };
}

function primitiveQuality(
  tasks: readonly Task[],
  results: readonly TaskResult[],
) {
  const taskMap = new Map(
    tasks.map((task) => [
      `${task.processId}/${task.task.taskId}/${task.task.repeatId}`,
      task,
    ]),
  );
  const accumulators = Object.fromEntries(
    (["P08", "P09", "P10", "P11"] as const).map((processId) => [
      processId,
      {
        noulCount: 0,
        noulSquaredError: 0,
        scoreAbsoluteError: 0,
        scoreCount: 0,
      },
    ]),
  );
  for (const result of results) {
    if (!result.jev.response) continue;
    const task = taskMap.get(
      `${result.processId}/${result.taskId}/${result.repeatId}`,
    );
    if (!task)
      throw new Error(`Missing task for ${result.processId}/${result.taskId}`);
    const labels = expectedAnswersFor(task);
    const accumulator = accumulators[result.processId]!;
    for (const [id, label] of Object.entries(labels)) {
      const answer = result.jev.response.answers[id];
      if (!answer) throw new Error(`Missing measured answer ${id}`);
      if (label.type === "noul") {
        if (answer.type !== "noul")
          throw new Error(`Expected measured Noul ${id}`);
        accumulator.noulCount += 1;
        accumulator.noulSquaredError += (answer.noul - label.value) ** 2;
      } else {
        if (answer.type !== "score")
          throw new Error(`Expected measured Score ${id}`);
        accumulator.scoreCount += 1;
        accumulator.scoreAbsoluteError += Math.abs(answer.score - label.level);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(accumulators).map(([processId, value]) => [
      processId,
      {
        noulBrier:
          value.noulCount === 0
            ? null
            : value.noulSquaredError / value.noulCount,
        noulCount: value.noulCount,
        scoreCount: value.scoreCount,
        scoreMeanAbsoluteError:
          value.scoreCount === 0
            ? null
            : value.scoreAbsoluteError / value.scoreCount,
      },
    ]),
  );
}

function perLanguage(results: readonly TaskResult[]) {
  const rows: Record<string, unknown> = {};
  for (const processId of ["P08", "P09", "P10", "P11"] as const) {
    rows[processId] = Object.fromEntries(
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
            accuracy: selected.length === 0 ? null : correct / selected.length,
            correct,
            total: selected.length,
          },
        ];
      }),
    );
  }
  return rows;
}

function stability(results: readonly TaskResult[]) {
  const grouped = new Map<string, string[]>();
  for (const result of results) {
    const key = `${result.processId}/${result.taskId}`;
    const decisions = grouped.get(key) ?? [];
    decisions.push(taskDecision(result));
    grouped.set(key, decisions);
  }
  const unstable = [...grouped.entries()]
    .filter(([, decisions]) => new Set(decisions).size > 1)
    .map(([taskId, decisions]) => ({ decisions, taskId }));
  return {
    stableTaskCount: grouped.size - unstable.length,
    taskCount: grouped.size,
    unstable,
  };
}

function summarize(
  tasks: readonly Task[],
  results: readonly TaskResult[],
  records: Records,
) {
  const arms = Object.fromEntries(
    (["P08", "P09", "P10", "P11"] as const).map((processId) => [
      processId,
      {
        B0: armMetrics(processId, "B0", records, results),
        cumulative: armMetrics(
          processId,
          armFor(processId, true),
          records,
          results,
        ),
        isolated: armMetrics(
          processId,
          armFor(processId, false),
          records,
          results,
        ),
      },
    ]),
  );
  return {
    arms,
    perLanguage: perLanguage(results),
    primitiveQuality: primitiveQuality(tasks, results),
    safeGatePassed: Object.values(arms).every(
      (processArms) =>
        processArms.isolated.wrongAutomaticSupportCount === 0 &&
        processArms.isolated.errorCount === 0,
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

function createTasks(runs: number): Task[] {
  return Array.from({ length: runs }, (_, index) => {
    const repeatId = index + 1;
    const groups: Task[][] = [
      createP08EvaluationTasks(repeatId).map((task) => ({
        processId: "P08",
        task,
      })),
      createP09EvaluationTasks(repeatId).map((task) => ({
        processId: "P09",
        task,
      })),
      createP10EvaluationTasks(repeatId).map((task) => ({
        processId: "P10",
        task,
      })),
      createP11EvaluationTasks(repeatId).map((task) => ({
        processId: "P11",
        task,
      })),
    ];
    return (repeatId % 2 === 1 ? groups : [...groups].reverse()).flat();
  }).flat();
}

async function runExperiment(options: Options) {
  validateJevPipelineCorpus();
  validateJ5EvaluationTasks();
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
  const experimentId = `jev-j5-p08-p11-${startedAt.replace(/[:.]/gu, "-")}`;
  const records = createRecords(experimentId, revision, results);
  const report = {
    experimentId,
    generatedAt: new Date().toISOString(),
    method: {
      corpusHash: JEV_PIPELINE_CORPUS_V1_SHA256,
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      cumulativeNote:
        "Each Ck equals Ik because no downstream JEV process has an owner-confirmed PROMOTE_CUMULATIVE decision; existing authoritative gates remain unchanged.",
      dirtyWorktreeDisclosure:
        revision === "dirty-worktree-disclosed"
          ? "Run from a dirty worktree; source and policy hashes are the reproducibility boundary."
          : null,
      expectedResolvedModel: options.live
        ? options.expectedResolvedModel
        : "self-test-jev-j5-oracle-v1",
      identityBranch:
        "English P11 sources remain in the corpus and deterministically skip translation inference.",
      mode: options.live ? "live" : "self-test",
      noProductionWrites:
        "This runner imports no API server, database, wallet, payment, artifact-freeze, or chain-write entry point.",
      processes: ["P08", "P09", "P10", "P11"],
      questionPolicyHash: JEV_J5_QUESTION_POLICY_SHA256,
      questionSetVersion: JEV_J5_QUESTION_SET_VERSION,
      requestedModel: options.live
        ? JEV_REQUESTED_MODEL
        : "self-test-jev-j5-oracle-v1",
      runs: options.runs,
      sourceRevision: revision,
      startedAt,
      stateSchemaVersion: JEV_J5_STATE_SCHEMA_VERSION,
      taskCount: tasks.length,
      taskCountsPerRepeat: { P08: 30, P09: 50, P10: 10, P11: 20 },
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
    { processId: "P08", task: createP08EvaluationTasks(1)[0]! },
    { processId: "P09", task: createP09EvaluationTasks(1)[1]! },
    { processId: "P10", task: createP10EvaluationTasks(1)[0]! },
    {
      processId: "P11",
      task: createP11EvaluationTasks(1).find(
        (task) => task.variant !== "identity",
      )!,
    },
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
    validateJ5EvaluationTasks();
    const samples: Task[] = [
      { processId: "P08", task: createP08EvaluationTasks(1)[0]! },
      { processId: "P09", task: createP09EvaluationTasks(1)[0]! },
      { processId: "P10", task: createP10EvaluationTasks(1)[0]! },
      {
        processId: "P11",
        task: createP11EvaluationTasks(1).find(
          (task) => task.variant !== "identity",
        )!,
      },
    ];
    console.log(
      JSON.stringify(
        {
          corpusHash: fingerprintJevPipelineCorpusV1(),
          policyHash: JEV_J5_QUESTION_POLICY_SHA256,
          samples: samples.map((sample) => {
            const { questions, state } = stateAndQuestions(sample);
            return {
              processId: sample.processId,
              questionCount: Object.keys(questions).length,
              stateHash: sha256Canonical(state),
              statePreview: canonicalJson(state).slice(0, 160),
            };
          }),
          taskCountsPerRun: { P08: 30, P09: 50, P10: 10, P11: 20 },
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
