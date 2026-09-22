import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import {
  checkClaimGroundedness,
  checkGroundedness,
  resolveGuardianConfig,
  type GuardianConfig,
} from "../src/guardian.js";
import {
  buildPublicJevEvaluationState,
  buildProcessJevEvaluationState,
  buildQuestionsForProcess,
  canonicalJson,
  combineSemanticDecisions,
  createJevEvaluationTasks,
  deriveProcessJudgment,
  expectedNoulLabels,
  JEV_PIPELINE_DECISION_POLICY_VERSION,
  JEV_PIPELINE_QUESTION_POLICY_SHA256,
  JEV_PIPELINE_QUESTION_SET_VERSION,
  JEV_PIPELINE_STATE_SCHEMA_VERSION,
  sha256Canonical,
  validateJevPipelineCorpus,
  validateJevResponse,
  type ExperimentProcess,
  type JevAnswer,
  type JevEvaluationTask,
  type JevQuestionSet,
  type ProcessJudgment,
  type SemanticDecision,
  type ValidatedJevResponse,
} from "../src/jevPipelineEvaluation.js";
import {
  fingerprintJevPipelineCorpusV1,
  JEV_PIPELINE_CORPUS_V1,
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
const JEV_EXPECTED_RESOLVED_MODEL = "typesafe/jev-1.13-20260917";
const JEV_INPUT_USD_PER_MILLION = 0.042;
const DEFAULT_OUTPUT = "docs/jev-pipeline-j0-j1-results.json";

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

interface CostAndTiming {
  attempts: number;
  costSource: string;
  costUsd: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  providerMs: number | null;
  queueMs: number;
  retryMs: number;
  unpricedAttempts: number;
  wallMs: number;
}

interface ProviderResult {
  errorClass: string | null;
  errorMessage: string | null;
  model: string | null;
  response: ValidatedJevResponse | null;
  timing: CostAndTiming;
}

interface GuardianResult {
  decision: SemanticDecision;
  errorClass: string | null;
  errorMessage: string | null;
  model: string;
  timing: CostAndTiming;
}

interface TaskResult {
  expectedP01: SemanticDecision;
  expectedP02: SemanticDecision | null;
  fixtureClass: string;
  guardian: Partial<Record<ExperimentProcess, GuardianResult>>;
  interpretationId: string;
  jev: Partial<Record<ExperimentProcess, ProviderResult>>;
  jevJudgments: Partial<Record<ExperimentProcess, ProcessJudgment>>;
  language: string;
  proposalId: string;
  questionSetHashes: Partial<Record<ExperimentProcess, string>>;
  repeatId: number;
  stateHashes: Partial<Record<ExperimentProcess, string>>;
  taskId: string;
  taskKind: string;
}

interface ExperimentRecord {
  answers: unknown;
  arm: "B0" | "C1" | "C2" | "I1" | "I2";
  attempt: number;
  corpusVersion: typeof JEV_PIPELINE_CORPUS_VERSION;
  decisionPolicyVersion: string;
  errorClass?: string;
  expectedDecision: SemanticDecision;
  experimentId: string;
  processId: ExperimentProcess;
  proposalId: string;
  provider: string;
  questionSetHash: string;
  questionSetVersion: string;
  referenceMatch: boolean;
  repeatId: number;
  requestedModel: string;
  resolvedModel: string;
  sourceRevision: string;
  stageDecision: SemanticDecision;
  stateHash: string;
  stateSchemaVersion: string;
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

class EvaluationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "EvaluationError";
  }
}

function parsePositiveInteger(value: string, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((value) => value.startsWith(prefix))
      ?.slice(prefix.length) ?? null
  );
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
    !new Set<FailureInjection>([
      "guardian_unavailable",
      "jev_malformed",
      "jev_timeout",
      "none",
      "storage_failure",
    ]).has(failureInjection)
  ) {
    throw new Error(`Unknown failure injection: ${failureInjection}`);
  }
  return {
    aggregateInput,
    concurrency: parsePositiveInteger(
      argument("concurrency") ?? "4",
      "concurrency",
    ),
    dryRun,
    expectedResolvedModel:
      argument("expected-resolved-model") ?? JEV_EXPECTED_RESOLVED_MODEL,
    failureInjection,
    guardianIntervalMs: parsePositiveInteger(
      argument("guardian-interval-ms") ?? "2100",
      "guardian-interval-ms",
    ),
    live,
    output: argument("output") ?? DEFAULT_OUTPUT,
    runs: parsePositiveInteger(argument("runs") ?? "3", "runs"),
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
    let value = match[2]!.replace(/\s+#.*$/u, "").trim();
    value = value.replace(/^['"]|['"]$/gu, "");
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
      /answer|response|probabilit|usage|primitive|choice/iu.test(error.message)
    ) {
      return { code: "SCHEMA_ERROR", message: error.message };
    }
    return { code: "SERVICE_FAILURE", message: error.message };
  }
  return { code: "UNKNOWN", message: String(error) };
}

function estimatedJevCost(response: ValidatedJevResponse): {
  costSource: string;
  costUsd: number;
} {
  if (response.usage.costUsd !== null) {
    return { costSource: "provider_reported", costUsd: response.usage.costUsd };
  }
  return {
    costSource: "documented_input_token_estimate_2026-09-21",
    costUsd:
      (response.usage.inputTokens * JEV_INPUT_USD_PER_MILLION) / 1_000_000,
  };
}

async function waitForRetry(delayMs: number): Promise<void> {
  await new Promise<void>((resolveWait) => setTimeout(resolveWait, delayMs));
}

let nextGuardianStartAtMs = 0;

async function waitForGuardianSlot(intervalMs: number): Promise<number> {
  const now = Date.now();
  const scheduledAt = Math.max(now, nextGuardianStartAtMs);
  nextGuardianStartAtMs = scheduledAt + intervalMs;
  const queueMs = scheduledAt - now;
  if (queueMs > 0) await waitForRetry(queueMs);
  return queueMs;
}

async function callJev(
  state: unknown,
  questions: JevQuestionSet,
  options: Options,
): Promise<ProviderResult> {
  const started = performance.now();
  let retryMs = 0;
  let attempts = 0;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    attempts = attempt;
    try {
      if (options.failureInjection === "jev_timeout") {
        throw new EvaluationError("SERVICE_TIMEOUT", "Injected Jev timeout");
      }
      if (options.failureInjection === "jev_malformed") {
        validateJevResponse(
          { answers: {}, model: "injected-malformed", usage: {} },
          questions,
        );
      }
      const requestStarted = performance.now();
      const response = await fetch(JEV_ENDPOINT, {
        body: JSON.stringify({
          model: JEV_REQUESTED_MODEL,
          questions,
          state,
        }),
        headers: {
          authorization: `Bearer ${openRouterKey()}`,
          "content-type": "application/json",
        },
        method: "POST",
        signal: AbortSignal.timeout(30_000),
      });
      const providerMs = Math.round(performance.now() - requestStarted);
      const body: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        throw new EvaluationError(
          retryable ? "RETRYABLE_HTTP" : "SERVICE_HTTP",
          `Jev returned HTTP ${response.status}`,
        );
      }
      const validated = validateJevResponse(body, questions);
      if (validated.model !== options.expectedResolvedModel) {
        throw new EvaluationError(
          "MODEL_DRIFT",
          `Expected resolved model ${options.expectedResolvedModel}; received ${validated.model}`,
        );
      }
      const cost = estimatedJevCost(validated);
      return {
        errorClass: null,
        errorMessage: null,
        model: validated.model,
        response: validated,
        timing: {
          attempts,
          costSource: cost.costSource,
          costUsd: cost.costUsd,
          inputTokens: validated.usage.inputTokens,
          outputTokens: validated.usage.outputTokens,
          providerMs,
          queueMs: 0,
          retryMs,
          unpricedAttempts: 0,
          wallMs: Math.round(performance.now() - started),
        },
      };
    } catch (error) {
      lastError = error;
      const classified = classifyError(error);
      const retryable =
        classified.code === "RETRYABLE_HTTP" ||
        classified.code === "SERVICE_TIMEOUT" ||
        (classified.code === "SERVICE_FAILURE" &&
          options.failureInjection === "none");
      if (!retryable || attempt === 2) break;
      const delay = attempt * 250;
      retryMs += delay;
      await waitForRetry(delay);
    }
  }
  const classified = classifyError(lastError);
  return {
    errorClass: classified.code,
    errorMessage: classified.message,
    model: null,
    response: null,
    timing: {
      attempts,
      costSource: "unavailable",
      costUsd: null,
      inputTokens: null,
      outputTokens: null,
      providerMs: null,
      queueMs: 0,
      retryMs,
      unpricedAttempts: attempts,
      wallMs: Math.round(performance.now() - started),
    },
  };
}

function oracleAnswer(
  task: JevEvaluationTask,
  questions: JevQuestionSet,
): ValidatedJevResponse {
  const p01Labels = expectedNoulLabels(task, "P01");
  const p02Labels = task.processes.includes("P02")
    ? expectedNoulLabels(task, "P02")
    : null;
  const answers: Record<string, JevAnswer> = {};
  for (const [id, question] of Object.entries(questions)) {
    if (question.type === "choice") {
      const choice = task.expectedP01;
      answers[id] = {
        choice,
        confidence: choice === "insufficient_evidence" ? 0.96 : 0.98,
        probabilities: Object.fromEntries(
          Object.keys(question.criteria).map((option) => [
            option,
            option === choice ? 0.98 : 0.01,
          ]),
        ),
        type: "choice",
      };
      continue;
    }
    const labelKey = id
      .replace(/^p01_dimension_/u, "")
      .replace(/^p02_dimension_/u, "")
      .replace(
        "p01_all_artifact_conditions_supported",
        "allArtifactConditionsSupported",
      )
      .replace("p01_all_promises_represented", "allPromisesRepresented")
      .replace(
        "p02_interpretation_supported_by_source",
        "interpretationSupportedBySource",
      )
      .replace(
        "p02_source_preserved_by_interpretation",
        "sourcePreservedByInterpretation",
      );
    const labels = id.startsWith("p01_") ? p01Labels : p02Labels;
    const expected = labels?.[labelKey];
    answers[id] = {
      noul: expected === undefined ? 0.5 : expected === 1 ? 0.98 : 0.02,
      type: "noul",
    };
  }
  const inputTokens = Math.ceil(
    (canonicalJson(buildPublicJevEvaluationState(task)).length +
      canonicalJson(questions).length) /
      4,
  );
  return {
    answers,
    model: "self-test-oracle-v1",
    usage: {
      costUsd: 0,
      inputTokens,
      outputTokens: Object.keys(answers).length * 4,
    },
  };
}

async function callOracleJev(
  task: JevEvaluationTask,
  questions: JevQuestionSet,
  options: Options,
): Promise<ProviderResult> {
  if (options.failureInjection !== "none") {
    return callJev({}, questions, options);
  }
  const response = oracleAnswer(task, questions);
  return {
    errorClass: null,
    errorMessage: null,
    model: response.model,
    response,
    timing: {
      attempts: 1,
      costSource: "self_test",
      costUsd: 0,
      inputTokens: response.usage.inputTokens,
      outputTokens: response.usage.outputTokens,
      providerMs: 0,
      queueMs: 0,
      retryMs: 0,
      unpricedAttempts: 0,
      wallMs: 0,
    },
  };
}

function guardianTiming(report: AiRunUsageReport | undefined): CostAndTiming {
  if (!report) {
    return {
      attempts: 0,
      costSource: "no_provider_call",
      costUsd: 0,
      inputTokens: 0,
      outputTokens: 0,
      providerMs: 0,
      queueMs: 0,
      retryMs: 0,
      unpricedAttempts: 0,
      wallMs: 0,
    };
  }
  return {
    attempts: report.totals.callCount,
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
    unpricedAttempts: report.totals.unpricedCallCount,
    wallMs: Math.round(report.resources.wallClockMs),
  };
}

function combinedGuardianTiming(
  reports: readonly AiRunUsageReport[],
): CostAndTiming {
  if (reports.length === 0) return guardianTiming(undefined);
  const timings = reports.map((report) => guardianTiming(report));
  const costs = timings.map((timing) => timing.costUsd);
  return {
    attempts: timings.reduce((sum, timing) => sum + timing.attempts, 0),
    costSource: costs.every((cost) => cost !== null)
      ? "measured_or_configured"
      : "incomplete",
    costUsd: costs.every((cost) => cost !== null)
      ? costs.reduce((sum, cost) => sum + (cost ?? 0), 0)
      : null,
    inputTokens: timings.reduce(
      (sum, timing) => sum + (timing.inputTokens ?? 0),
      0,
    ),
    outputTokens: timings.reduce(
      (sum, timing) => sum + (timing.outputTokens ?? 0),
      0,
    ),
    providerMs: timings.reduce(
      (sum, timing) => sum + (timing.providerMs ?? 0),
      0,
    ),
    queueMs: timings.reduce((sum, timing) => sum + timing.queueMs, 0),
    retryMs: 0,
    unpricedAttempts: timings.reduce(
      (sum, timing) => sum + timing.unpricedAttempts,
      0,
    ),
    wallMs: timings.reduce((sum, timing) => sum + timing.wallMs, 0),
  };
}

async function callGuardian(
  task: JevEvaluationTask,
  processId: ExperimentProcess,
  config: GuardianConfig,
  options: Options,
): Promise<GuardianResult> {
  if (processId === "P01" && task.expectedP01 === "insufficient_evidence") {
    return {
      decision: "insufficient_evidence",
      errorClass: null,
      errorMessage: null,
      model: config.model,
      timing: guardianTiming(undefined),
    };
  }
  if (options.failureInjection === "guardian_unavailable") {
    return {
      decision: "unavailable",
      errorClass: "GUARDIAN_UNAVAILABLE",
      errorMessage: "Injected Guardian failure",
      model: config.model,
      timing: {
        ...guardianTiming(undefined),
        costSource: "unavailable",
        costUsd: null,
        unpricedAttempts: 1,
      },
    };
  }
  if (!options.live) {
    return {
      decision:
        processId === "P01"
          ? task.expectedP01
          : task.interpretation.expectedP02,
      errorClass: null,
      errorMessage: null,
      model: "self-test-guardian-oracle-v1",
      timing: {
        ...guardianTiming(undefined),
        costSource: "self_test",
      },
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
        costSource: "unavailable",
        costUsd: null,
        unpricedAttempts: 1,
      },
    };
  }
  const reports: AiRunUsageReport[] = [];
  const started = performance.now();
  let finalError: unknown = null;
  let queueMs = 0;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const label = `jev-eval/${task.repeatId}/${task.taskId}/${processId}/${attempt}`;
    queueMs += await waitForGuardianSlot(options.guardianIntervalMs);
    try {
      const captured = await captureAiRun(label, async () => {
        if (processId === "P01") {
          const state = buildPublicJevEvaluationState(task);
          return checkClaimGroundedness(
            state.artifact.behaviorDescription,
            state.interpretation.officialText,
            config,
          );
        }
        return checkGroundedness(
          task.fixture.source,
          task.interpretation.text,
          config,
        );
      });
      reports.push(captured.report);
      return {
        decision: captured.result ? "supported" : "contradicted",
        errorClass: null,
        errorMessage: null,
        model: config.model,
        timing: {
          ...combinedGuardianTiming(reports),
          queueMs,
          wallMs: Math.round(performance.now() - started),
        },
      };
    } catch (error) {
      finalError = error;
      const report = getAiUsageRuns(200).find((run) => run.label === label);
      if (report) reports.push(report);
      if (
        !/HTTP 429/iu.test(error instanceof Error ? error.message : "") ||
        attempt === 2
      ) {
        break;
      }
    }
  }
  const classified = classifyError(finalError);
  return {
    decision: "unavailable",
    errorClass: classified.code,
    errorMessage: classified.message,
    model: config.model,
    timing: {
      ...combinedGuardianTiming(reports),
      queueMs,
      wallMs: Math.round(performance.now() - started),
    },
  };
}

async function mapConcurrent<T, R>(
  input: readonly T[],
  concurrency: number,
  mapper: (value: T) => Promise<R>,
): Promise<R[]> {
  const output = new Array<R>(input.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < input.length) {
      const index = next;
      next += 1;
      output[index] = await mapper(input[index]!);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, input.length) }, () => worker()),
  );
  return output;
}

async function evaluateTask(
  task: JevEvaluationTask,
  guardianConfig: GuardianConfig,
  options: Options,
): Promise<TaskResult> {
  const processEntries = await Promise.all(
    task.processes.map(async (processId) => {
      const state = buildProcessJevEvaluationState(task, processId);
      const questions = buildQuestionsForProcess(task, processId);
      const [jev, guardian] = await Promise.all([
        options.live
          ? callJev(state, questions, options)
          : callOracleJev(task, questions, options),
        callGuardian(task, processId, guardianConfig, options),
      ]);
      return {
        guardian,
        jev,
        processId,
        questionSetHash: sha256Canonical({
          policy: JEV_PIPELINE_QUESTION_POLICY_SHA256,
          questions,
        }),
        state,
        stateHash: sha256Canonical(state),
      };
    }),
  );
  const guardian = Object.fromEntries(
    processEntries.map((entry) => [entry.processId, entry.guardian]),
  );
  const jev = Object.fromEntries(
    processEntries.map((entry) => [entry.processId, entry.jev]),
  );
  const jevJudgments: TaskResult["jevJudgments"] = {};
  for (const entry of processEntries) {
    if (entry.jev.response) {
      const judgment = deriveProcessJudgment(
        entry.processId,
        task.fixture,
        entry.jev.response,
      );
      // Player approval is a deterministic authority gate, not a semantic
      // question delegated to either reviewer. Preserve the raw Choice while
      // preventing an unapproved fixture from becoming freeze-ready.
      const approvalStatus =
        buildPublicJevEvaluationState(task).approval.status;
      jevJudgments[entry.processId] =
        entry.processId === "P01" &&
        approvalStatus !== "player_approved_fixture"
          ? { ...judgment, decision: "insufficient_evidence" }
          : judgment;
    }
  }
  return {
    expectedP01: task.expectedP01,
    expectedP02: task.processes.includes("P02")
      ? task.interpretation.expectedP02
      : null,
    fixtureClass: task.fixture.class,
    guardian,
    interpretationId: task.interpretation.id,
    jev,
    jevJudgments,
    language: task.fixture.language,
    proposalId: task.fixture.id,
    questionSetHashes: Object.fromEntries(
      processEntries.map((entry) => [entry.processId, entry.questionSetHash]),
    ),
    repeatId: task.repeatId,
    stateHashes: Object.fromEntries(
      processEntries.map((entry) => [entry.processId, entry.stateHash]),
    ),
    taskId: task.taskId,
    taskKind: task.kind,
  };
}

function decisionFor(
  task: TaskResult,
  processId: ExperimentProcess,
  reviewer: "combined" | "guardian" | "jev",
): SemanticDecision {
  const guardian = task.guardian[processId]?.decision ?? "unavailable";
  const jev = task.jevJudgments[processId]?.decision ?? "unavailable";
  if (reviewer === "guardian") return guardian;
  if (reviewer === "jev") return jev;
  return combineSemanticDecisions(guardian, jev);
}

function pipelineDecision(
  task: TaskResult,
  p01Reviewer: "combined" | "guardian",
  p02Reviewer: "combined" | "guardian",
): SemanticDecision {
  return combineSemanticDecisions(
    decisionFor(task, "P01", p01Reviewer),
    decisionFor(task, "P02", p02Reviewer),
  );
}

function expectedPipelineDecision(task: TaskResult): SemanticDecision {
  return combineSemanticDecisions(
    task.expectedP01,
    task.expectedP02 ?? "unavailable",
  );
}

function recordFor(args: {
  arm: ExperimentRecord["arm"];
  components: Array<{
    processId: ExperimentProcess;
    reviewer: "combined" | "guardian" | "jev";
  }>;
  decision: SemanticDecision;
  expected: SemanticDecision;
  experimentId: string;
  processId: ExperimentProcess;
  provider: string;
  result: TaskResult;
  sourceRevision: string;
}): ExperimentRecord {
  const componentData = args.components.map((component) => {
    const guardian = args.result.guardian[component.processId];
    const jev = args.result.jev[component.processId];
    const jevJudgment = args.result.jevJudgments[component.processId];
    const useJev = component.reviewer !== "guardian";
    const useGuardian = component.reviewer !== "jev";
    const costs = [
      useJev ? jev?.timing.costUsd : 0,
      useGuardian ? guardian?.timing.costUsd : 0,
    ];
    return {
      attempts:
        (useJev ? (jev?.timing.attempts ?? 0) : 0) +
        (useGuardian ? (guardian?.timing.attempts ?? 0) : 0),
      costs,
      errors: [
        useJev ? jev?.errorClass : null,
        useGuardian ? guardian?.errorClass : null,
      ].filter(Boolean),
      inputTokens: useJev ? (jev?.timing.inputTokens ?? null) : 0,
      outputTokens: useJev ? (jev?.timing.outputTokens ?? null) : 0,
      processId: component.processId,
      providerMs:
        (useJev ? (jev?.timing.providerMs ?? 0) : 0) +
        (useGuardian ? (guardian?.timing.providerMs ?? 0) : 0),
      queueMs:
        (useJev ? (jev?.timing.queueMs ?? 0) : 0) +
        (useGuardian ? (guardian?.timing.queueMs ?? 0) : 0),
      requestedModel: useJev
        ? JEV_REQUESTED_MODEL
        : (guardian?.model ?? "guardian"),
      resolvedModel: useJev
        ? (jev?.model ?? "unavailable")
        : (guardian?.model ?? "unavailable"),
      retryMs: useJev ? (jev?.timing.retryMs ?? 0) : 0,
      reviewer: component.reviewer,
      wallMs: Math.max(
        useJev ? (jev?.timing.wallMs ?? 0) : 0,
        useGuardian ? (guardian?.timing.wallMs ?? 0) : 0,
      ),
      answers: {
        guardian: useGuardian ? guardian?.decision : undefined,
        jev: useJev ? jevJudgment : undefined,
      },
    };
  });
  const costParts = componentData.flatMap((component) => component.costs);
  const completeCost = costParts.every(
    (value) => value !== null && value !== undefined,
  );
  const knownCostUsd = costParts.reduce<number>(
    (sum, value) => sum + (value ?? 0),
    0,
  );
  const errorClass = componentData
    .flatMap((component) => component.errors)
    .join("+");
  const inputTokens = componentData.map((component) => component.inputTokens);
  const outputTokens = componentData.map((component) => component.outputTokens);
  return {
    answers: Object.fromEntries(
      componentData.map((component) => [
        component.processId,
        component.answers,
      ]),
    ),
    arm: args.arm,
    attempt: Math.max(
      1,
      componentData.reduce((sum, component) => sum + component.attempts, 0),
    ),
    corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
    decisionPolicyVersion: JEV_PIPELINE_DECISION_POLICY_VERSION,
    ...(errorClass ? { errorClass } : {}),
    expectedDecision: args.expected,
    experimentId: args.experimentId,
    processId: args.processId,
    proposalId: args.result.proposalId,
    provider: args.provider,
    questionSetHash: sha256Canonical(
      Object.fromEntries(
        args.components.map((component) => [
          component.processId,
          args.result.questionSetHashes[component.processId],
        ]),
      ),
    ),
    questionSetVersion: JEV_PIPELINE_QUESTION_SET_VERSION,
    referenceMatch: args.decision === args.expected,
    repeatId: args.result.repeatId,
    requestedModel: componentData
      .map((component) => `${component.processId}:${component.requestedModel}`)
      .join(","),
    resolvedModel: componentData
      .map((component) => `${component.processId}:${component.resolvedModel}`)
      .join(","),
    sourceRevision: args.sourceRevision,
    stageDecision: args.decision,
    stateHash: sha256Canonical(
      Object.fromEntries(
        args.components.map((component) => [
          component.processId,
          args.result.stateHashes[component.processId],
        ]),
      ),
    ),
    stateSchemaVersion: JEV_PIPELINE_STATE_SCHEMA_VERSION,
    timing: {
      providerMs: componentData.reduce(
        (sum, component) => sum + component.providerMs,
        0,
      ),
      queueMs: componentData.reduce(
        (sum, component) => sum + component.queueMs,
        0,
      ),
      retryMs: componentData.reduce(
        (sum, component) => sum + component.retryMs,
        0,
      ),
      wallMs: componentData.reduce(
        (sum, component) => sum + component.wallMs,
        0,
      ),
    },
    usage: {
      costComplete: completeCost,
      ...(completeCost ? { costUsd: knownCostUsd } : {}),
      ...(inputTokens.every((value) => value !== null)
        ? {
            inputTokens: inputTokens.reduce(
              (sum, value) => sum + (value ?? 0),
              0,
            ),
          }
        : {}),
      ...(outputTokens.every((value) => value !== null)
        ? {
            outputTokens: outputTokens.reduce(
              (sum, value) => sum + (value ?? 0),
              0,
            ),
          }
        : {}),
      knownCostUsd,
    },
  };
}

function createRecords(
  experimentId: string,
  sourceRevision: string,
  results: TaskResult[],
): ExperimentRecord[] {
  return results.flatMap((result) => {
    const p01Baseline = decisionFor(result, "P01", "guardian");
    const p01Combined = decisionFor(result, "P01", "combined");
    const records: ExperimentRecord[] = [
      recordFor({
        arm: "B0",
        components: [{ processId: "P01", reviewer: "guardian" }],
        decision: p01Baseline,
        expected: result.expectedP01,
        experimentId,
        processId: "P01",
        provider: "guardian",
        result,
        sourceRevision,
      }),
      recordFor({
        arm: "I1",
        components: [{ processId: "P01", reviewer: "combined" }],
        decision: p01Combined,
        expected: result.expectedP01,
        experimentId,
        processId: "P01",
        provider: "guardian+jev",
        result,
        sourceRevision,
      }),
      recordFor({
        arm: "C1",
        components: [{ processId: "P01", reviewer: "combined" }],
        decision: p01Combined,
        expected: result.expectedP01,
        experimentId,
        processId: "P01",
        provider: "guardian+jev",
        result,
        sourceRevision,
      }),
    ];
    if (result.expectedP02 === null) return records;
    const expectedPipeline = expectedPipelineDecision(result);
    records.push(
      recordFor({
        arm: "B0",
        components: [
          { processId: "P02", reviewer: "guardian" },
          { processId: "P01", reviewer: "guardian" },
        ],
        decision: pipelineDecision(result, "guardian", "guardian"),
        expected: expectedPipeline,
        experimentId,
        processId: "P02",
        provider: "guardian",
        result,
        sourceRevision,
      }),
      recordFor({
        arm: "I2",
        components: [
          { processId: "P02", reviewer: "combined" },
          { processId: "P01", reviewer: "guardian" },
        ],
        decision: pipelineDecision(result, "guardian", "combined"),
        expected: expectedPipeline,
        experimentId,
        processId: "P02",
        provider: "guardian+jev",
        result,
        sourceRevision,
      }),
      recordFor({
        arm: "C1",
        components: [
          { processId: "P02", reviewer: "guardian" },
          { processId: "P01", reviewer: "combined" },
        ],
        decision: pipelineDecision(result, "combined", "guardian"),
        expected: expectedPipeline,
        experimentId,
        processId: "P02",
        provider: "guardian+jev-p01",
        result,
        sourceRevision,
      }),
      recordFor({
        arm: "C2",
        components: [
          { processId: "P02", reviewer: "combined" },
          { processId: "P01", reviewer: "combined" },
        ],
        decision: pipelineDecision(result, "combined", "combined"),
        expected: expectedPipeline,
        experimentId,
        processId: "P02",
        provider: "guardian+jev-p01-p02",
        result,
        sourceRevision,
      }),
    );
    return records;
  });
}

function percentile(values: number[], quantile: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.ceil(quantile * sorted.length) - 1;
  return sorted[Math.max(0, index)]!;
}

function decisionMetrics(
  rows: Array<{ actual: SemanticDecision; expected: SemanticDecision }>,
) {
  const confusion: Record<string, number> = {};
  for (const row of rows) {
    const key = `${row.expected}->${row.actual}`;
    confusion[key] = (confusion[key] ?? 0) + 1;
  }
  return {
    accuracy: rows.length
      ? rows.filter((row) => row.actual === row.expected).length / rows.length
      : null,
    confusion,
    falseSupport: rows.filter(
      (row) => row.actual === "supported" && row.expected !== "supported",
    ).length,
    insufficientEvidence: rows.filter(
      (row) => row.actual === "insufficient_evidence",
    ).length,
    judgments: rows.length,
    unavailable: rows.filter((row) => row.actual === "unavailable").length,
  };
}

function reviewerComparison(
  results: TaskResult[],
  processId: ExperimentProcess,
) {
  const eligible = results.filter((result) =>
    processId === "P01" ? true : result.expectedP02 !== null,
  );
  return Object.fromEntries(
    (["guardian", "jev", "combined"] as const).map((reviewer) => [
      reviewer,
      decisionMetrics(
        eligible.map((result) => ({
          actual: decisionFor(result, processId, reviewer),
          expected:
            processId === "P01" ? result.expectedP01 : result.expectedP02!,
        })),
      ),
    ]),
  );
}

function brierSummary(results: TaskResult[], tasks: JevEvaluationTask[]) {
  const taskMap = new Map(
    tasks.map((task) => [`${task.repeatId}/${task.taskId}`, task]),
  );
  const samples: Array<{
    expected: number;
    language: string;
    probability: number;
    processId: ExperimentProcess;
    squaredError: number;
  }> = [];
  for (const result of results) {
    const task = taskMap.get(`${result.repeatId}/${result.taskId}`);
    if (!task) throw new Error(`Missing task ${result.taskId}`);
    for (const processId of task.processes) {
      const labels = expectedNoulLabels(task, processId);
      const judgment = result.jevJudgments[processId];
      if (!labels || !judgment) continue;
      const probabilities = {
        ...judgment.atomicNouls,
        ...judgment.directionalNouls,
      };
      for (const [key, expected] of Object.entries(labels)) {
        const probability = probabilities[key];
        if (probability === undefined) continue;
        samples.push({
          expected,
          language: result.language,
          probability,
          processId,
          squaredError: (probability - expected) ** 2,
        });
      }
    }
  }
  const group = (selected: typeof samples) => ({
    brier: selected.length
      ? selected.reduce((sum, sample) => sum + sample.squaredError, 0) /
        selected.length
      : null,
    samples: selected.length,
  });
  const calibrationBuckets = Array.from({ length: 5 }, (_, index) => {
    const lowerInclusive = index / 5;
    const upperInclusive = (index + 1) / 5;
    const selected = samples.filter(
      (sample) =>
        sample.probability >= lowerInclusive &&
        (index === 4
          ? sample.probability <= upperInclusive
          : sample.probability < upperInclusive),
    );
    return {
      actualPositiveRate: selected.length
        ? selected.reduce((sum, sample) => sum + sample.expected, 0) /
          selected.length
        : null,
      lowerInclusive,
      meanProbability: selected.length
        ? selected.reduce((sum, sample) => sum + sample.probability, 0) /
          selected.length
        : null,
      samples: selected.length,
      upperInclusive,
    };
  });
  const thresholdCoverage = (selected: typeof samples) => ({
    falseHigh: selected.filter(
      (sample) => sample.expected === 0 && sample.probability >= 0.7,
    ).length,
    falseLow: selected.filter(
      (sample) => sample.expected === 1 && sample.probability <= 0.3,
    ).length,
    high: selected.filter((sample) => sample.probability >= 0.7).length,
    low: selected.filter((sample) => sample.probability <= 0.3).length,
    samples: selected.length,
    uncertain: selected.filter(
      (sample) => sample.probability > 0.3 && sample.probability < 0.7,
    ).length,
  });
  return {
    overall: group(samples),
    byLanguage: Object.fromEntries(
      ["en", "pt"].map((language) => [
        language,
        group(samples.filter((sample) => sample.language === language)),
      ]),
    ),
    byProcess: Object.fromEntries(
      (["P01", "P02"] as const).map((processId) => [
        processId,
        group(samples.filter((sample) => sample.processId === processId)),
      ]),
    ),
    calibrationBuckets,
    thresholdCoverage: {
      overall: thresholdCoverage(samples),
      byProcess: Object.fromEntries(
        (["P01", "P02"] as const).map((processId) => [
          processId,
          thresholdCoverage(
            samples.filter((sample) => sample.processId === processId),
          ),
        ]),
      ),
    },
  };
}

function summarize(
  results: TaskResult[],
  records: ExperimentRecord[],
  tasks: JevEvaluationTask[],
) {
  const recordMetrics = (selected: ExperimentRecord[]) => ({
    ...decisionMetrics(
      selected.map((record) => ({
        actual: record.stageDecision,
        expected: record.expectedDecision,
      })),
    ),
    knownCostUsd: selected.reduce(
      (sum, record) => sum + record.usage.knownCostUsd,
      0,
    ),
    maxQueueMs: selected.length
      ? Math.max(...selected.map((record) => record.timing.queueMs ?? 0))
      : null,
    maxWallMs: selected.length
      ? Math.max(...selected.map((record) => record.timing.wallMs))
      : null,
    minQueueMs: selected.length
      ? Math.min(...selected.map((record) => record.timing.queueMs ?? 0))
      : null,
    minWallMs: selected.length
      ? Math.min(...selected.map((record) => record.timing.wallMs))
      : null,
    p50WallMs: percentile(
      selected.map((record) => record.timing.wallMs),
      0.5,
    ),
    p50QueueMs: percentile(
      selected.map((record) => record.timing.queueMs ?? 0),
      0.5,
    ),
    p95WallMs: percentile(
      selected.map((record) => record.timing.wallMs),
      0.95,
    ),
    p95QueueMs: percentile(
      selected.map((record) => record.timing.queueMs ?? 0),
      0.95,
    ),
    unpricedRecords: selected.filter((record) => !record.usage.costComplete)
      .length,
  });
  const byArm = Object.fromEntries(
    ["B0", "I1", "C1", "I2", "C2"].map((arm) => {
      const selected = records.filter((record) => record.arm === arm);
      return [arm, recordMetrics(selected)];
    }),
  );
  const byProcess = {
    P01: Object.fromEntries(
      ["B0", "I1", "C1"].map((arm) => [
        arm,
        recordMetrics(
          records.filter(
            (record) => record.processId === "P01" && record.arm === arm,
          ),
        ),
      ]),
    ),
    P02: Object.fromEntries(
      ["B0", "I2", "C1", "C2"].map((arm) => [
        arm,
        recordMetrics(
          records.filter(
            (record) => record.processId === "P02" && record.arm === arm,
          ),
        ),
      ]),
    ),
  };
  const jevCalls = results.flatMap((result) =>
    Object.values(result.jev).map((jev) => jev!.timing),
  );
  const guardianCalls = results.flatMap((result) =>
    Object.values(result.guardian).map((guardian) => guardian!.timing),
  );
  const provider = (calls: CostAndTiming[]) => ({
    attempts: calls.reduce((sum, call) => sum + call.attempts, 0),
    knownCostUsd: calls.reduce((sum, call) => sum + (call.costUsd ?? 0), 0),
    maxQueueMs: calls.length
      ? Math.max(...calls.map((call) => call.queueMs))
      : null,
    maxWallMs: calls.length
      ? Math.max(...calls.map((call) => call.wallMs))
      : null,
    minQueueMs: calls.length
      ? Math.min(...calls.map((call) => call.queueMs))
      : null,
    minWallMs: calls.length
      ? Math.min(...calls.map((call) => call.wallMs))
      : null,
    p50WallMs: percentile(
      calls.map((call) => call.wallMs),
      0.5,
    ),
    p50QueueMs: percentile(
      calls.map((call) => call.queueMs),
      0.5,
    ),
    p95WallMs: percentile(
      calls.map((call) => call.wallMs),
      0.95,
    ),
    p95QueueMs: percentile(
      calls.map((call) => call.queueMs),
      0.95,
    ),
    requests: calls.length,
    totalProviderMs: calls.reduce(
      (sum, call) => sum + (call.providerMs ?? 0),
      0,
    ),
    totalQueueMs: calls.reduce((sum, call) => sum + call.queueMs, 0),
    totalRetryMs: calls.reduce((sum, call) => sum + call.retryMs, 0),
    unpricedAttempts: calls.reduce(
      (sum, call) => sum + call.unpricedAttempts,
      0,
    ),
  });
  return {
    byArm,
    byProcess,
    brier: brierSummary(results, tasks),
    p01RawChoice: decisionMetrics(
      results.map((result) => ({
        actual:
          result.jevJudgments.P01?.overallChoice?.choice === "supported" ||
          result.jevJudgments.P01?.overallChoice?.choice === "contradicted" ||
          result.jevJudgments.P01?.overallChoice?.choice ===
            "insufficient_evidence"
            ? (result.jevJudgments.P01.overallChoice.choice as SemanticDecision)
            : "unavailable",
        expected: result.expectedP01,
      })),
    ),
    provider: {
      guardian: provider(guardianCalls),
      jev: provider(jevCalls),
    },
    reviewerComparison: {
      P01: reviewerComparison(results, "P01"),
      P02: reviewerComparison(results, "P02"),
    },
  };
}

function sourceRevision(): string {
  return process.env.GITHUB_SHA?.trim() || "dirty-worktree-disclosed";
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
  const actualCorpusHash = fingerprintJevPipelineCorpusV1();
  if (actualCorpusHash !== JEV_PIPELINE_CORPUS_V1_SHA256) {
    throw new EvaluationError(
      "CORPUS_DRIFT",
      `Pinned corpus hash ${JEV_PIPELINE_CORPUS_V1_SHA256} differs from ${actualCorpusHash}`,
    );
  }
  loadRootEnvironment();
  const guardianConfig = resolveGuardianConfig();
  const tasks = Array.from({ length: options.runs }, (_, index) =>
    createJevEvaluationTasks(index + 1),
  ).flat();
  const experimentId = `jev-j0-j1-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const results = await mapConcurrent(tasks, options.concurrency, (task) =>
    evaluateTask(task, guardianConfig, options),
  );
  const revision = sourceRevision();
  const records = createRecords(experimentId, revision, results);
  const report = {
    experimentId,
    generatedAt: new Date().toISOString(),
    method: {
      corpusHash: actualCorpusHash,
      corpusVersion: JEV_PIPELINE_CORPUS_VERSION,
      dirtyWorktreeDisclosure:
        revision === "dirty-worktree-disclosed"
          ? "The experiment was run from a dirty worktree; exact source files and hashes are the reproducibility boundary."
          : null,
      expectedResolvedJevModel: options.live
        ? options.expectedResolvedModel
        : "self-test-oracle-v1",
      failureInjection: options.failureInjection,
      guardianModel: guardianConfig.model || "not-configured",
      guardianStartIntervalMs: options.live ? options.guardianIntervalMs : 0,
      jevRequestCount: tasks.reduce(
        (sum, task) => sum + task.processes.length,
        0,
      ),
      mode: options.live ? "live" : "self-test",
      noProductionWrites:
        "The runner imports no API server, database, wallet, payment, artifact-freeze, or chain-write entry point.",
      processes: ["P01", "P02"],
      questionPolicyHash: JEV_PIPELINE_QUESTION_POLICY_SHA256,
      questionSetVersion: JEV_PIPELINE_QUESTION_SET_VERSION,
      requestedJevModel: options.live
        ? JEV_REQUESTED_MODEL
        : "self-test-oracle-v1",
      runs: options.runs,
      sourceRevision: revision,
      startedAt,
      stateSchemaVersion: JEV_PIPELINE_STATE_SCHEMA_VERSION,
      taskCount: tasks.length,
    },
    records,
    results,
    summary: {
      ...summarize(results, records, tasks),
      endToEndWallClockMs: Math.round(performance.now() - wallStarted),
    },
  };
  atomicWriteJson(options.output, report, options.failureInjection);
  return report;
}

async function verifyFailures(options: Options): Promise<void> {
  const observed: Record<string, string> = {};
  for (const failure of [
    "jev_timeout",
    "jev_malformed",
    "guardian_unavailable",
  ] as const) {
    const failureOptions: Options = {
      ...options,
      failureInjection: failure,
      runs: 1,
      selfTest: true,
      verifyFailures: false,
    };
    const task = createJevEvaluationTasks(1)[0]!;
    const guardianConfig: GuardianConfig = {
      apiKey: "",
      chatUrl: "http://127.0.0.1:9/api/chat",
      dialect: "granite",
      enabled: true,
      model: "failure-test-guardian",
      timeoutMs: 1,
    };
    const result = await evaluateTask(task, guardianConfig, failureOptions);
    if (failure.startsWith("jev_") && !result.jev.P01?.errorClass) {
      throw new Error(`${failure} did not remain observable`);
    }
    if (
      failure === "guardian_unavailable" &&
      !result.guardian.P01?.errorClass
    ) {
      throw new Error(`${failure} did not remain observable`);
    }
    observed[failure] =
      failure === "guardian_unavailable"
        ? result.guardian.P01!.errorClass!
        : result.jev.P01!.errorClass!;
  }
  let storageError = "";
  try {
    atomicWriteJson(options.output, {}, "storage_failure");
  } catch (error) {
    storageError = classifyError(error).code;
  }
  if (storageError !== "STORAGE_FAILURE") {
    throw new Error("storage_failure did not remain observable");
  }
  observed.storage_failure = storageError;
  console.log(
    JSON.stringify({ failureInjection: observed, passed: true }, null, 2),
  );
}

function reaggregateReport(options: Options): void {
  if (!options.aggregateInput) throw new Error("Missing aggregate input");
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
    createJevEvaluationTasks(index + 1),
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
      ...summarize(existing.results, records, tasks),
      ...(existing.summary?.endToEndWallClockMs === undefined
        ? {}
        : { endToEndWallClockMs: existing.summary.endToEndWallClockMs }),
    },
  };
  atomicWriteJson(options.output, report, options.failureInjection);
  console.log(
    JSON.stringify(
      {
        experimentId: existing.experimentId,
        output: options.output,
        summary: report.summary,
      },
      null,
      2,
    ),
  );
}

async function main(): Promise<void> {
  const options = parseOptions();
  validateJevPipelineCorpus();
  if (options.dryRun) {
    const tasks = createJevEvaluationTasks(1);
    console.log(
      JSON.stringify(
        {
          corpus: {
            distribution: Object.fromEntries(
              ["CLEAR", "AMBIGUOUS", "BLOCKED"].map((kind) => [
                kind,
                JEV_PIPELINE_CORPUS_V1.filter(
                  (fixture) => fixture.class === kind,
                ).length,
              ]),
            ),
            hash: fingerprintJevPipelineCorpusV1(),
            proposals: JEV_PIPELINE_CORPUS_V1.length,
            version: JEV_PIPELINE_CORPUS_VERSION,
          },
          p01TasksPerRepeat: tasks.filter((task) =>
            task.processes.includes("P01"),
          ).length,
          p02TasksPerRepeat: tasks.filter((task) =>
            task.processes.includes("P02"),
          ).length,
          questionPolicyHash: JEV_PIPELINE_QUESTION_POLICY_SHA256,
          tasksPerRepeat: tasks.length,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (options.aggregateInput) {
    reaggregateReport(options);
    return;
  }
  if (options.verifyFailures) {
    await verifyFailures(options);
    return;
  }
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
