import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import {
  buildP03Questions,
  buildP04Questions,
  buildPublicP03State,
  buildPublicP04State,
  createP03EvaluationTasks,
  createP04EvaluationTasks,
  deriveP03Judgment,
  deriveP04Judgment,
  expectedP03Labels,
  expectedP04NoulLabels,
  JEV_J2_DECISION_POLICY_VERSION,
  JEV_J2_QUESTION_POLICY_SHA256,
  JEV_J2_QUESTION_SET_VERSION,
  JEV_J2_STATE_SCHEMA_VERSION,
  validateJ2EvaluationTasks,
  type P03Decision,
  type P03EvaluationTask,
  type P03Judgment,
  type P04Decision,
  type P04EvaluationTask,
  type P04Judgment,
} from "../src/jevPipelineJ2Evaluation.js";
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
const DEFAULT_OUTPUT = "../../docs/jev-pipeline-j2-results.json";

type FailureInjection =
  | "jev_malformed"
  | "jev_timeout"
  | "none"
  | "storage_failure";
type ProcessId = "P03" | "P04";
type Arm = "B0" | "C3" | "C4" | "I3" | "I4";

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

interface P03TaskResult {
  controlKind: P03EvaluationTask["controlKind"];
  corpusClass: P03EvaluationTask["corpusClass"];
  expectedDecision: P03EvaluationTask["expectedCollectiveChoice"];
  fixtureId: string;
  jev: ProviderResult;
  judgment: P03Judgment | null;
  processId: "P03";
  questionSetHash: string;
  repeatId: number;
  stateHash: string;
  taskId: string;
}

interface P04TaskResult {
  candidateMap: Record<string, string>;
  candidateIds: string[];
  controlKind: P04EvaluationTask["controlKind"];
  corpusClass: P04EvaluationTask["corpusClass"];
  expectedDecision: P04EvaluationTask["expectedChoice"];
  fixtureId: string;
  jev: ProviderResult;
  judgment: P04Judgment | null;
  processId: "P04";
  questionSetHash: string;
  repeatId: number;
  stateHash: string;
  taskId: string;
}

type TaskResult = P03TaskResult | P04TaskResult;
type EvaluationTask =
  | { processId: "P03"; task: P03EvaluationTask }
  | { processId: "P04"; task: P04EvaluationTask };

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
    output: argument("output") ?? DEFAULT_OUTPUT,
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
      /answer|response|probabilit|usage|primitive|choice|score|legend/iu.test(
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
      if (!retryable || attempt === 2 || options.failureInjection !== "none") {
        break;
      }
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

function peakedChoice(options: string[], selected: string) {
  return {
    choice: selected,
    confidence: 0.9,
    probabilities: Object.fromEntries(
      options.map((option) => [
        option,
        option === selected ? 0.94 : 0.06 / (options.length - 1),
      ]),
    ),
    type: "choice",
  };
}

function p03OracleResponse(
  task: P03EvaluationTask,
  questions: JevQuestionSet,
): ValidatedJevResponse {
  const labels = expectedP03Labels(task);
  const answers = Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      if (id === "p03_collective" && question.type === "choice") {
        return [
          id,
          peakedChoice(
            Object.keys(question.criteria),
            task.expectedCollectiveChoice,
          ),
        ];
      }
      const match = id.match(
        /^p03_finding_(\d+)_(usefulness|source_supported|addresses_failure|material)$/u,
      );
      if (!match) throw new Error(`Unknown oracle question ${id}`);
      const label = labels[`finding_${Number(match[1]) + 1}`]!;
      if (question.type === "score") {
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
                index === label.usefulnessLevel
                  ? 0.94
                  : 0.06 / (question.criteria.length - 1),
              ]),
            ),
            score: label.usefulnessLevel,
            type: "score",
          },
        ];
      }
      const binary =
        match[2] === "source_supported"
          ? label.sourceSupported
          : match[2] === "addresses_failure"
            ? label.addressesObservedFailure
            : label.materiallyChangesOutcome;
      return [id, { noul: binary === 1 ? 0.95 : 0.05, type: "noul" }];
    }),
  );
  return validateJevResponse(
    {
      answers,
      model: "self-test-jev-j2-oracle-v1",
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    questions,
  );
}

function p04OracleResponse(
  task: P04EvaluationTask,
  questions: JevQuestionSet,
): ValidatedJevResponse {
  const labels = expectedP04NoulLabels(task);
  const answers = Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      if (id === "p04_selection" && question.type === "choice") {
        return [
          id,
          peakedChoice(Object.keys(question.criteria), task.expectedChoice),
        ];
      }
      if (question.type !== "noul") {
        throw new Error(`Unexpected P04 oracle question ${id}`);
      }
      return [id, { noul: labels[id] === 1 ? 0.95 : 0.05, type: "noul" }];
    }),
  );
  return validateJevResponse(
    {
      answers,
      model: "self-test-jev-j2-oracle-v1",
      usage: { input_tokens: 0, output_tokens: 0 },
    },
    questions,
  );
}

function selfTestProvider(response: ValidatedJevResponse): ProviderResult {
  return {
    errorClass: null,
    errorMessage: null,
    requestedModel: "self-test-jev-j2-oracle-v1",
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

async function evaluateP03(
  task: P03EvaluationTask,
  options: Options,
): Promise<P03TaskResult> {
  const state = buildPublicP03State(task);
  const questions = buildP03Questions(task);
  const jev = options.live
    ? await callJev(state, questions, options)
    : selfTestProvider(p03OracleResponse(task, questions));
  return {
    controlKind: task.controlKind,
    corpusClass: task.corpusClass,
    expectedDecision: task.expectedCollectiveChoice,
    fixtureId: task.fixture.id,
    jev,
    judgment: jev.response ? deriveP03Judgment(task, jev.response) : null,
    processId: "P03",
    questionSetHash: sha256Canonical(questions),
    repeatId: task.repeatId,
    stateHash: sha256Canonical(state),
    taskId: task.taskId,
  };
}

async function evaluateP04(
  task: P04EvaluationTask,
  options: Options,
): Promise<P04TaskResult> {
  const state = buildPublicP04State(task);
  const questions = buildP04Questions(task);
  const jev = options.live
    ? await callJev(state, questions, options)
    : selfTestProvider(p04OracleResponse(task, questions));
  return {
    candidateMap: Object.fromEntries(
      task.candidateEntries.map((entry) => [
        entry.publicId,
        entry.candidate.id,
      ]),
    ),
    candidateIds: task.candidateEntries.map((entry) => entry.publicId),
    controlKind: task.controlKind,
    corpusClass: task.corpusClass,
    expectedDecision: task.expectedChoice,
    fixtureId: task.fixture.id,
    jev,
    judgment: jev.response ? deriveP04Judgment(task, jev.response) : null,
    processId: "P04",
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

function sourceRevision(): string {
  return process.env.GITHUB_SHA?.trim() || "dirty-worktree-disclosed";
}

function armsFor(processId: ProcessId): readonly [Arm, Arm] {
  return processId === "P03" ? ["I3", "C3"] : ["I4", "C4"];
}

function resultDecision(result: TaskResult): P03Decision | P04Decision {
  return result.judgment?.decision ?? "unavailable";
}

function createRecords(
  experimentId: string,
  revision: string,
  results: readonly TaskResult[],
) {
  return results.flatMap((result) => {
    const shared = {
      controlKind: result.controlKind,
      corpusClass: result.corpusClass,
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      decisionPolicyVersion: JEV_J2_DECISION_POLICY_VERSION,
      experimentId,
      processId: result.processId,
      proposalId: result.fixtureId,
      questionSetHash: result.questionSetHash,
      questionSetVersion: JEV_J2_QUESTION_SET_VERSION,
      repeatId: result.repeatId,
      sourceRevision: revision,
      stateHash: result.stateHash,
      stateSchemaVersion: JEV_J2_STATE_SCHEMA_VERSION,
      taskId: result.taskId,
    };
    const baseline = {
      ...shared,
      answers: null,
      arm: "B0" as const,
      attempt: 0,
      provider: "frozen-authoritative-fixture-oracle",
      requestedModel: "none",
      resolvedModel: "none",
      stageDecision: result.expectedDecision,
      timing: { wallMs: 0 },
      usage: {
        costSource: "baseline",
        costUsd: 0,
        inputTokens: 0,
        outputTokens: 0,
      },
    };
    const measured = (arm: Arm) => ({
      ...shared,
      answers: result.jev.response?.answers ?? null,
      arm,
      attempt: result.jev.timing.attempt,
      ...(result.jev.errorClass ? { errorClass: result.jev.errorClass } : {}),
      provider: "openrouter-decisions",
      requestedModel: result.jev.requestedModel,
      resolvedModel: result.jev.resolvedModel ?? "unavailable",
      stageDecision: resultDecision(result),
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
    const [isolated, cumulative] = armsFor(result.processId);
    return [baseline, measured(isolated), measured(cumulative)];
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
  arm: Arm,
  records: ReturnType<typeof createRecords>,
  results: readonly TaskResult[],
) {
  const selected = records.filter(
    (record) => record.processId === processId && record.arm === arm,
  );
  const processResults = results.filter(
    (result) => result.processId === processId,
  );
  const expected = new Map(
    processResults.map((result) => [
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
  const confusionMatrix: Record<string, Record<string, number>> = {};
  for (const decision of decisions) {
    const row = (confusionMatrix[decision.expected] ??= {});
    row[decision.actual] = (row[decision.actual] ?? 0) + 1;
  }
  const totalCostUsd =
    costs.length === selected.length
      ? costs.reduce((sum, cost) => sum + cost, 0)
      : null;
  const measured = arm !== "B0";
  const wrongAutomaticActionCount = measured
    ? processResults.filter((result) => {
        if (!result.judgment?.actionable) return false;
        if (result.processId === "P03") {
          return (
            result.judgment.eligibleFindingIds.length > 0 &&
            result.expectedDecision !== "sufficient_set"
          );
        }
        return (
          result.judgment.decision !== "none_adequate" &&
          result.judgment.decision !== "unavailable" &&
          result.judgment.decision !== result.expectedDecision
        );
      }).length
    : 0;
  const rawChoiceCorrectCount = measured
    ? processResults.filter(
        (result) =>
          result.judgment?.overallChoice.choice === result.expectedDecision,
      ).length
    : selected.length;
  const controlMetrics =
    processId === "P04"
      ? {
          candidateOmitted: controlAccuracy(
            processResults,
            "candidate_omitted",
            measured,
          ),
          candidateOmittedSafety: controlSafety(
            processResults,
            "candidate_omitted",
            measured,
          ),
          providerDisagreement: controlAccuracy(
            processResults,
            "provider_disagreement",
            measured,
          ),
          providerDisagreementSafety: controlSafety(
            processResults,
            "provider_disagreement",
            measured,
          ),
        }
      : null;
  return {
    accuracy: correctCount / Math.max(selected.length, 1),
    automationCoverage:
      decisions.filter((decision) => decision.actual !== "unavailable").length /
      Math.max(selected.length, 1),
    controlMetrics,
    confusionMatrix,
    correctCount,
    costPerCorrectUsd:
      totalCostUsd === null || correctCount === 0
        ? null
        : totalCostUsd / correctCount,
    costUsd: totalCostUsd,
    errorCount: selected.filter((record) => "errorClass" in record).length,
    latencyMs: distribution(latencies),
    providerLatencyMs: distribution(providerLatencies),
    rawChoiceAccuracy:
      rawChoiceCorrectCount / Math.max(processResults.length, 1),
    retryCount: selected.filter((record) => record.attempt > 1).length,
    sampleCount: selected.length,
    unresolvedCount: decisions.filter(
      (decision) => decision.actual === "unavailable",
    ).length,
    usage: {
      inputTokens: sumUsage(selected, "inputTokens"),
      outputTokens: sumUsage(selected, "outputTokens"),
    },
    wrongAutomaticActionCount,
  };
}

function controlAccuracy(
  results: readonly TaskResult[],
  controlKind: string,
  measured: boolean,
) {
  const selected = results.filter(
    (result) => result.controlKind === controlKind,
  );
  const correct = selected.filter(
    (result) =>
      (measured ? resultDecision(result) : result.expectedDecision) ===
      result.expectedDecision,
  ).length;
  return {
    accuracy: correct / Math.max(selected.length, 1),
    correct,
    sampleCount: selected.length,
  };
}

function controlSafety(
  results: readonly TaskResult[],
  controlKind: string,
  measured: boolean,
) {
  const selected = results.filter(
    (result) => result.controlKind === controlKind,
  );
  const safe = selected.filter((result) => {
    if (!measured) return true;
    const decision = resultDecision(result);
    return decision === result.expectedDecision || decision === "unavailable";
  }).length;
  return {
    safe,
    safeRate: safe / Math.max(selected.length, 1),
    sampleCount: selected.length,
  };
}

function distribution(values: readonly number[]) {
  return {
    max: values.length ? Math.max(...values) : null,
    min: values.length ? Math.min(...values) : null,
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
  };
}

function sumUsage(
  records: ReturnType<typeof createRecords>,
  field: "inputTokens" | "outputTokens",
): number | null {
  const values = records.map((record) => record.usage[field]);
  return values.every((value): value is number => typeof value === "number")
    ? values.reduce((sum, value) => sum + value, 0)
    : null;
}

function p03PrimitiveMetrics(
  tasks: readonly P03EvaluationTask[],
  results: readonly P03TaskResult[],
) {
  const taskMap = new Map(
    tasks.map((task) => [`${task.repeatId}/${task.taskId}`, task]),
  );
  const noulErrors: number[] = [];
  let exactScoreLevelCount = 0;
  let scoreCount = 0;
  for (const result of results) {
    const task = taskMap.get(`${result.repeatId}/${result.taskId}`)!;
    const labels = expectedP03Labels(task);
    for (const [index, label] of Object.values(labels).entries()) {
      const prefix = `p03_finding_${index}`;
      const response = result.jev.response;
      if (!response) continue;
      const score = response.answers[`${prefix}_usefulness`];
      if (score?.type === "score") {
        scoreCount += 1;
        if (Math.round(score.score) === label.usefulnessLevel) {
          exactScoreLevelCount += 1;
        }
      }
      for (const [suffix, expected] of [
        ["source_supported", label.sourceSupported],
        ["addresses_failure", label.addressesObservedFailure],
        ["material", label.materiallyChangesOutcome],
      ] as const) {
        const answer = response.answers[`${prefix}_${suffix}`];
        if (answer?.type === "noul") {
          noulErrors.push((answer.noul - expected) ** 2);
        }
      }
    }
  }
  return {
    noulAnswerCount: noulErrors.length,
    noulBrierScore: noulErrors.length
      ? noulErrors.reduce((sum, value) => sum + value, 0) / noulErrors.length
      : null,
    scoreExactRoundedLevelAccuracy:
      exactScoreLevelCount / Math.max(scoreCount, 1),
    scoreCount,
  };
}

function p04NoulMetrics(
  tasks: readonly P04EvaluationTask[],
  results: readonly P04TaskResult[],
) {
  const taskMap = new Map(
    tasks.map((task) => [`${task.repeatId}/${task.taskId}`, task]),
  );
  const errors: number[] = [];
  for (const result of results) {
    const task = taskMap.get(`${result.repeatId}/${result.taskId}`)!;
    const labels = expectedP04NoulLabels(task);
    for (const [id, expected] of Object.entries(labels)) {
      const answer = result.jev.response?.answers[id];
      if (answer?.type === "noul") errors.push((answer.noul - expected) ** 2);
    }
  }
  return {
    answerCount: errors.length,
    brierScore: errors.length
      ? errors.reduce((sum, value) => sum + value, 0) / errors.length
      : null,
  };
}

function comparison(
  baseline: ReturnType<typeof armMetrics>,
  measured: ReturnType<typeof armMetrics>,
) {
  const delta = (left: number | null, right: number | null) =>
    left === null || right === null ? null : left - right;
  return {
    accuracyDelta: measured.accuracy - baseline.accuracy,
    costDeltaUsd: delta(measured.costUsd, baseline.costUsd),
    costPercentageDelta:
      baseline.costUsd && measured.costUsd !== null
        ? ((measured.costUsd - baseline.costUsd) / baseline.costUsd) * 100
        : null,
    p50LatencyDeltaMs: delta(measured.latencyMs.p50, baseline.latencyMs.p50),
    rawChoiceAccuracyDelta:
      measured.rawChoiceAccuracy - baseline.rawChoiceAccuracy,
    wrongAutomaticActionDelta:
      measured.wrongAutomaticActionCount - baseline.wrongAutomaticActionCount,
  };
}

function stability(results: readonly TaskResult[]) {
  const groups = new Map<string, string[]>();
  for (const result of results) {
    const values = groups.get(result.taskId) ?? [];
    const decision = resultDecision(result);
    values.push(
      result.processId === "P04" && decision.startsWith("candidate_")
        ? `selected:${result.candidateMap[decision] ?? "unknown"}`
        : decision,
    );
    groups.set(result.taskId, values);
  }
  return Object.fromEntries(
    [...groups].map(([taskId, decisions]) => [
      taskId,
      { agreed: new Set(decisions).size === 1, decisions },
    ]),
  );
}

function summarize(
  p03Tasks: readonly P03EvaluationTask[],
  p04Tasks: readonly P04EvaluationTask[],
  results: readonly TaskResult[],
  records: ReturnType<typeof createRecords>,
) {
  const p03Results = results.filter(
    (result): result is P03TaskResult => result.processId === "P03",
  );
  const p04Results = results.filter(
    (result): result is P04TaskResult => result.processId === "P04",
  );
  const p03B0 = armMetrics("P03", "B0", records, results);
  const p03I = armMetrics("P03", "I3", records, results);
  const p03C = armMetrics("P03", "C3", records, results);
  const p04B0 = armMetrics("P04", "B0", records, results);
  const p04I = armMetrics("P04", "I4", records, results);
  const p04C = armMetrics("P04", "C4", records, results);
  return {
    P03: {
      arms: { B0: p03B0, C3: p03C, I3: p03I },
      comparisons: {
        incrementalCumulative: comparison(p03B0, p03C),
        isolated: comparison(p03B0, p03I),
        totalCumulative: comparison(p03B0, p03C),
      },
      primitiveMetrics: p03PrimitiveMetrics(p03Tasks, p03Results),
      safeGatePassed:
        p03I.wrongAutomaticActionCount === 0 &&
        p03C.wrongAutomaticActionCount === 0,
      stability: stability(p03Results),
    },
    P04: {
      arms: { B0: p04B0, C4: p04C, I4: p04I },
      comparisons: {
        incrementalCumulative: comparison(p04B0, p04C),
        isolated: comparison(p04B0, p04I),
        totalCumulative: comparison(p04B0, p04C),
      },
      primitiveMetrics: p04NoulMetrics(p04Tasks, p04Results),
      safeGatePassed:
        p04I.wrongAutomaticActionCount === 0 &&
        p04C.wrongAutomaticActionCount === 0 &&
        p04I.controlMetrics?.candidateOmittedSafety.safe ===
          p04I.controlMetrics?.candidateOmittedSafety.sampleCount &&
        p04C.controlMetrics?.candidateOmittedSafety.safe ===
          p04C.controlMetrics?.candidateOmittedSafety.sampleCount &&
        p04I.controlMetrics?.providerDisagreementSafety.safe ===
          p04I.controlMetrics?.providerDisagreementSafety.sampleCount &&
        p04C.controlMetrics?.providerDisagreementSafety.safe ===
          p04C.controlMetrics?.providerDisagreementSafety.sampleCount,
      stability: stability(p04Results),
    },
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

async function runExperiment(options: Options) {
  validateJevPipelineCorpus();
  validateJ2EvaluationTasks();
  if (fingerprintJevPipelineCorpusV1() !== JEV_PIPELINE_CORPUS_V1_SHA256) {
    throw new EvaluationError(
      "CORPUS_DRIFT",
      "The pinned JEV corpus fingerprint changed",
    );
  }
  if (options.live) loadRootEnvironment();
  const p03Tasks = Array.from({ length: options.runs }, (_, index) =>
    createP03EvaluationTasks(index + 1),
  ).flat();
  const p04Tasks = Array.from({ length: options.runs }, (_, index) =>
    createP04EvaluationTasks(index + 1),
  ).flat();
  const orderedTasks: EvaluationTask[] = Array.from(
    { length: options.runs },
    (_, index) => {
      const repeatId = index + 1;
      const p03 = p03Tasks.filter((task) => task.repeatId === repeatId);
      const p04 = p04Tasks.filter((task) => task.repeatId === repeatId);
      return repeatId % 2 === 1
        ? [
            ...p03.map((task) => ({ processId: "P03" as const, task })),
            ...p04.map((task) => ({ processId: "P04" as const, task })),
          ]
        : [
            ...p04.map((task) => ({ processId: "P04" as const, task })),
            ...p03.map((task) => ({ processId: "P03" as const, task })),
          ];
    },
  ).flat();
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const results = await mapConcurrent<EvaluationTask, TaskResult>(
    orderedTasks,
    options.concurrency,
    async (entry) =>
      entry.processId === "P03"
        ? await evaluateP03(entry.task, options)
        : await evaluateP04(entry.task, options),
  );
  const revision = sourceRevision();
  const experimentId = `jev-j2-${startedAt.replace(/[:.]/gu, "-")}`;
  const records = createRecords(experimentId, revision, results);
  const report = {
    experimentId,
    generatedAt: new Date().toISOString(),
    method: {
      baselineBoundary:
        "B0 is the frozen authoritative fixture decision at the same P03/P04 stage. It is a correctness oracle with zero simulated provider cost, not a measurement of the full current compiler pipeline.",
      corpusHash: JEV_PIPELINE_CORPUS_V1_SHA256,
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      cumulativeNote:
        "C3 equals I3 and C4 equals I4 because no downstream JEV process has owner-confirmed promotion. No JEV result changes production routing.",
      dirtyWorktreeDisclosure:
        revision === "dirty-worktree-disclosed"
          ? "Run from a dirty worktree; source, corpus, state, question, and policy hashes are the reproducibility boundary."
          : null,
      expectedResolvedModel: options.live
        ? options.expectedResolvedModel
        : "self-test-jev-j2-oracle-v1",
      generativeCostBoundary:
        "Repair findings and provider candidates are frozen fixtures. This stage experiment measures JEV only and does not claim savings for generative calls that were not run.",
      mode: options.live ? "live" : "self-test",
      noProductionWrites:
        "This runner imports no API server, database, wallet, payment, proposal, artifact-freeze, or chain-write entry point.",
      processes: ["P03", "P04"],
      questionPolicyHash: JEV_J2_QUESTION_POLICY_SHA256,
      questionSetVersion: JEV_J2_QUESTION_SET_VERSION,
      requestedModel: options.live
        ? JEV_REQUESTED_MODEL
        : "self-test-jev-j2-oracle-v1",
      runs: options.runs,
      sourceRevision: revision,
      startedAt,
      stateSchemaVersion: JEV_J2_STATE_SCHEMA_VERSION,
      taskCounts: { P03: p03Tasks.length, P04: p04Tasks.length },
    },
    records,
    results,
    summary: {
      ...summarize(p03Tasks, p04Tasks, results, records),
      endToEndWallClockMs: Math.round(performance.now() - wallStarted),
    },
  };
  atomicWriteJson(options.output, report, options.failureInjection);
  return report;
}

async function verifyFailures(options: Options): Promise<void> {
  const task = createP03EvaluationTasks(1)[0]!;
  const observed: Record<string, string> = {};
  for (const failure of ["jev_timeout", "jev_malformed"] as const) {
    const result = await evaluateP03(task, {
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
  const p03Tasks = Array.from({ length: existing.method.runs }, (_, index) =>
    createP03EvaluationTasks(index + 1),
  ).flat();
  const p04Tasks = Array.from({ length: existing.method.runs }, (_, index) =>
    createP04EvaluationTasks(index + 1),
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
      ...summarize(p03Tasks, p04Tasks, existing.results, records),
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
    validateJ2EvaluationTasks();
    const p03 = createP03EvaluationTasks(1);
    const p04 = createP04EvaluationTasks(1);
    console.log(
      JSON.stringify(
        {
          corpusHash: fingerprintJevPipelineCorpusV1(),
          p03TaskCountPerRun: p03.length,
          p04TaskCountPerRun: p04.length,
          policyHash: JEV_J2_QUESTION_POLICY_SHA256,
          sampleP03StateHash: sha256Canonical(buildPublicP03State(p03[0]!)),
          sampleP04StateHash: sha256Canonical(buildPublicP04State(p04[0]!)),
          sampleStatePreview: canonicalJson(buildPublicP04State(p04[0]!)).slice(
            0,
            200,
          ),
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
