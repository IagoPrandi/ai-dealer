import { AsyncLocalStorage } from "node:async_hooks";
import { createHash, randomUUID } from "node:crypto";
import { cpus, freemem, loadavg, platform, totalmem } from "node:os";

// Measured AI resource accounting for the rule pipeline (tokens, cost, CPU, RAM).
//
// Why this exists: the operator console reported `rule_proposal_token_projection`,
// which sums `countRuleTokens(sanitizedText)` — the player's ~80-token rule
// sentence. That number has nothing to do with inference spend. One preflight
// sends the ~13k-token compiler skill prompt plus a ~2k-token JSON Schema on
// every compile and review call, and repeats the whole pass on escalation, so
// the projection under-reported real usage by roughly three orders of magnitude.
// That projection is kept (it is what the existing audit rows can support) and
// this module adds the measured account beside it.
//
// Why AsyncLocalStorage rather than threading a parameter: the compile/review
// calls are reached through `RuleAstProvider` callbacks that @tyche/rule-compiler
// invokes from inside its own provider/consensus/repair loops. Passing an
// accumulator down would change that package's public API for an observability
// concern. An ambient async scope collects every call in the run — including the
// ones the compiler retries on its own — without any of those signatures moving.

/**
 * The pipeline step that issued the call. Deliberately transport-level: these
 * are the requests a provider actually bills, not the audit-log roles in
 * `AiOperationRole`, which are projections over validation records.
 */
export type AiUsageStep =
  | "chat"
  | "compile"
  | "guardian_groundedness"
  | "guardian_jailbreak"
  | "interpret"
  | "jev_interpretation_advisory"
  | "jev_semantic_review"
  | "review"
  | "translate";

/**
 * `truncated` is the `finish_reason: "length"` case: the provider billed the
 * whole output budget and the answer is unusable. It is the most expensive
 * outcome per useful result in this pipeline, so it must never be folded into
 * `error`.
 */
export type AiUsageOutcome = "error" | "ok" | "truncated";

export type AiUsageCostSource =
  | "configured_flat_rate"
  | "configured_model_rate"
  | "provider_reported"
  | "unavailable";

export type AiUsageTokenSource = "not_reported" | "provider_reported";

export interface AiCallUsageRecord {
  cachedPromptTokens: number | null;
  completionTokens: number | null;
  costSource: AiUsageCostSource;
  costUsd: number | null;
  durationMs: number;
  /**
   * Fingerprint of the exact model input this call sent (system prompt plus
   * user content), or null when the call site supplied none.
   *
   * This is what turns "that call looked redundant" into a measurement. Two
   * calls sharing a step, a model and this digest were handed byte-identical
   * input, and every rule step decodes greedily (temperature 0, top_p 1, fixed
   * seed), so the second one cannot return anything the first did not already
   * produce. `summarizeAiRedundancy` reads only this.
   */
  inputDigest: string | null;
  model: string;
  outcome: AiUsageOutcome;
  promptTokens: number | null;
  provider: string;
  reasoningTokens: number | null;
  startedAt: string;
  step: AiUsageStep;
  tokenSource: AiUsageTokenSource;
  totalTokens: number | null;
}

export interface AiRunResourceUsage {
  /**
   * Highest number of capture scopes open at the same time while this run was
   * open. Above 1 the CPU and RSS figures below are shared across those runs —
   * `process.cpuUsage()` is process-wide and cannot be attributed per scope.
   * Reported rather than hidden, so a concurrent sample is never read as a
   * single-run measurement.
   */
  concurrentRunsPeak: number;
  cpuCores: number;
  /** Process CPU time over wall clock, as a share of ALL host cores. */
  cpuPercentOfHost: number;
  /**
   * Process CPU time over wall clock, as a share of ONE core. Above 100 means
   * the process used more than a core's worth of parallel work.
   */
  cpuPercentOfOneCore: number;
  cpuSystemMs: number;
  cpuTotalMs: number;
  cpuUserMs: number;
  heapUsedPeakBytes: number;
  hostFreeMemoryMinBytes: number;
  /**
   * `null` on Windows, where `os.loadavg()` is documented to always return
   * zeros. A hard zero would read as an idle host.
   */
  hostLoadAverage1m: number | null;
  hostTotalMemoryBytes: number;
  rssDeltaBytes: number;
  rssPeakBytes: number;
  rssStartBytes: number;
  /**
   * How many times the sampler observed this run. 0 means the run finished
   * inside one sampling interval, so the peaks are the start/end readings only.
   */
  samples: number;
  wallClockMs: number;
}

export interface AiRunUsageTotals {
  callCount: number;
  completionTokens: number;
  costUsd: number | null;
  /** Call rows dropped past `MAX_CALLS_PER_RUN`. The totals still count them. */
  droppedCallRows: number;
  errorCallCount: number;
  promptTokens: number;
  reasoningTokens: number;
  totalTokens: number;
  truncatedCallCount: number;
  /**
   * Calls whose cost could not be established. A run with any of these has an
   * INCOMPLETE `costUsd`, which is why the count sits next to it.
   */
  unpricedCallCount: number;
  /** Calls whose provider reported no token counts. Same contract for tokens. */
  untokenizedCallCount: number;
}

export interface AiRunUsageReport {
  calls: AiCallUsageRecord[];
  completedAt: string;
  label: string;
  resources: AiRunResourceUsage;
  runId: string;
  startedAt: string;
  /** What the run was about (e.g. the rule id), when the caller knows it. */
  subject: string | null;
  totals: AiRunUsageTotals;
}

/**
 * The persisted shape: totals and resources without the per-call rows. The
 * detail is worth an in-memory ring buffer, not a megabyte in every state
 * snapshot write.
 */
export interface AiRunUsageSummary {
  completedAt: string;
  label: string;
  resources: AiRunResourceUsage;
  runId: string;
  startedAt: string;
  subject: string | null;
  totals: AiRunUsageTotals;
}

export interface AiModelPrice {
  inputPerMillionUsd: number;
  outputPerMillionUsd: number;
}

export interface AiUsagePricingStatus {
  /**
   * Set when LLM_PRICE_TABLE_JSON is present but unusable. Surfaced instead of
   * being swallowed, so a typo in the table shows up as a named fault rather
   * than as every call quietly becoming unpriced.
   */
  configurationError: string | null;
  flatRatePerThousandTokensUsd: number;
  pricedModels: string[];
  /**
   * Calls recorded with no capture scope open. Not an error on its own — an
   * operator probe or a test can call the transport directly — but a value that
   * keeps growing means a pipeline entry point was never wrapped.
   */
  unscopedCallCount: number;
}

const DEFAULT_SAMPLE_INTERVAL_MS = 250;
const MIN_SAMPLE_INTERVAL_MS = 50;
// Ring-buffer bounds. The detail buffer is what an operator drills into; the
// summary buffer is what survives a restart through the API state snapshot.
const MAX_DETAILED_RUNS = 200;
const MAX_SUMMARY_RUNS = 500;
// Per run, so a pathological escalation storm cannot grow one report without
// bound. The totals stay exact: they are accumulated as calls arrive, never by
// re-reducing this array.
const MAX_CALLS_PER_RUN = 256;

interface ActiveRun {
  calls: AiCallUsageRecord[];
  concurrentRunsPeak: number;
  cpuStart: NodeJS.CpuUsage;
  heapUsedPeakBytes: number;
  hostFreeMemoryMinBytes: number;
  label: string;
  rssPeakBytes: number;
  rssStartBytes: number;
  runId: string;
  samples: number;
  startedAt: string;
  startedAtMs: number;
  subject: string | null;
  totals: AiRunUsageTotals;
}

const runStorage = new AsyncLocalStorage<ActiveRun>();
const activeRuns = new Set<ActiveRun>();
const detailedRuns: AiRunUsageReport[] = [];
const runSummaries: AiRunUsageSummary[] = [];

let sampler: NodeJS.Timeout | null = null;
let unscopedCallCount = 0;

function sampleIntervalMs(): number {
  const raw = Number((process.env.AI_USAGE_SAMPLE_INTERVAL_MS ?? "").trim());
  return Number.isFinite(raw) && raw >= MIN_SAMPLE_INTERVAL_MS
    ? raw
    : DEFAULT_SAMPLE_INTERVAL_MS;
}

function observeResources(): void {
  if (activeRuns.size === 0) {
    return;
  }
  const memory = process.memoryUsage();
  const hostFree = freemem();
  const concurrent = activeRuns.size;
  for (const run of activeRuns) {
    run.samples += 1;
    run.rssPeakBytes = Math.max(run.rssPeakBytes, memory.rss);
    run.heapUsedPeakBytes = Math.max(run.heapUsedPeakBytes, memory.heapUsed);
    run.hostFreeMemoryMinBytes = Math.min(run.hostFreeMemoryMinBytes, hostFree);
    run.concurrentRunsPeak = Math.max(run.concurrentRunsPeak, concurrent);
  }
}

function startSampler(): void {
  if (sampler !== null) {
    return;
  }
  sampler = setInterval(observeResources, sampleIntervalMs());
  // Observability must never hold the process open.
  sampler.unref();
}

function stopSamplerIfIdle(): void {
  if (sampler !== null && activeRuns.size === 0) {
    clearInterval(sampler);
    sampler = null;
  }
}

function emptyTotals(): AiRunUsageTotals {
  return {
    callCount: 0,
    completionTokens: 0,
    costUsd: null,
    droppedCallRows: 0,
    errorCallCount: 0,
    promptTokens: 0,
    reasoningTokens: 0,
    totalTokens: 0,
    truncatedCallCount: 0,
    unpricedCallCount: 0,
    untokenizedCallCount: 0,
  };
}

/**
 * Opens a measurement scope. Every `recordAiCall` reached from `fn` — including
 * from callbacks @tyche/rule-compiler invokes — lands in this run's report.
 *
 * The report is returned alongside the result and also pushed to the operator
 * registry, so a caller that only wants the side effect can ignore it. `fn`
 * throwing still publishes the report: a run that failed after twelve calls is
 * exactly the run whose cost an operator needs to see.
 */
export async function captureAiRun<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<{ report: AiRunUsageReport; result: T }> {
  const startMemory = process.memoryUsage();
  const run: ActiveRun = {
    calls: [],
    concurrentRunsPeak: activeRuns.size + 1,
    cpuStart: process.cpuUsage(),
    heapUsedPeakBytes: startMemory.heapUsed,
    hostFreeMemoryMinBytes: freemem(),
    label,
    rssPeakBytes: startMemory.rss,
    rssStartBytes: startMemory.rss,
    runId: randomUUID(),
    samples: 0,
    startedAt: new Date().toISOString(),
    startedAtMs: performance.now(),
    subject: null,
    totals: emptyTotals(),
  };
  activeRuns.add(run);
  // Overlap is observed when a scope OPENS, not only when the sampler ticks: two
  // runs that overlap for less than one sampling interval still share the same
  // process-wide CPU counter, and the report must say so.
  for (const open of activeRuns) {
    open.concurrentRunsPeak = Math.max(
      open.concurrentRunsPeak,
      activeRuns.size,
    );
  }
  startSampler();
  try {
    const result = await runStorage.run(run, fn);
    return { report: finishRun(run), result };
  } catch (error) {
    finishRun(run);
    throw error;
  }
}

function finishRun(run: ActiveRun): AiRunUsageReport {
  activeRuns.delete(run);
  stopSamplerIfIdle();
  // One last reading, so a run shorter than the sampling interval still reports
  // real numbers instead of only its start values.
  const memory = process.memoryUsage();
  const cpu = process.cpuUsage(run.cpuStart);
  const wallClockMs = performance.now() - run.startedAtMs;
  const cpuUserMs = cpu.user / 1_000;
  const cpuSystemMs = cpu.system / 1_000;
  const cpuTotalMs = cpuUserMs + cpuSystemMs;
  const cpuCores = cpus().length;
  const report: AiRunUsageReport = {
    calls: run.calls,
    completedAt: new Date().toISOString(),
    label: run.label,
    resources: {
      concurrentRunsPeak: run.concurrentRunsPeak,
      cpuCores,
      cpuPercentOfHost:
        wallClockMs > 0 && cpuCores > 0
          ? (cpuTotalMs / (wallClockMs * cpuCores)) * 100
          : 0,
      cpuPercentOfOneCore:
        wallClockMs > 0 ? (cpuTotalMs / wallClockMs) * 100 : 0,
      cpuSystemMs,
      cpuTotalMs,
      cpuUserMs,
      heapUsedPeakBytes: Math.max(run.heapUsedPeakBytes, memory.heapUsed),
      hostFreeMemoryMinBytes: Math.min(run.hostFreeMemoryMinBytes, freemem()),
      hostLoadAverage1m: platform() === "win32" ? null : (loadavg()[0] ?? null),
      hostTotalMemoryBytes: totalmem(),
      rssDeltaBytes: memory.rss - run.rssStartBytes,
      rssPeakBytes: Math.max(run.rssPeakBytes, memory.rss),
      rssStartBytes: run.rssStartBytes,
      samples: run.samples,
      wallClockMs,
    },
    runId: run.runId,
    startedAt: run.startedAt,
    subject: run.subject,
    totals: run.totals,
  };
  detailedRuns.push(report);
  while (detailedRuns.length > MAX_DETAILED_RUNS) {
    detailedRuns.shift();
  }
  runSummaries.push({
    completedAt: report.completedAt,
    label: report.label,
    resources: report.resources,
    runId: report.runId,
    startedAt: report.startedAt,
    subject: report.subject,
    totals: report.totals,
  });
  while (runSummaries.length > MAX_SUMMARY_RUNS) {
    runSummaries.shift();
  }
  return report;
}

/**
 * Names what the open run is about (the rule id) once the caller knows it.
 * No-op outside a scope.
 */
export function setAiRunSubject(subject: string): void {
  const run = runStorage.getStore();
  if (run) {
    run.subject = subject;
  }
}

export interface RecordAiCallInput {
  providerCostOnly?: boolean;
  cachedPromptTokens?: number | null;
  completionTokens?: number | null;
  durationMs: number;
  /** See `AiCallUsageRecord.inputDigest`. Built with `digestAiCallInput`. */
  inputDigest?: string | null;
  model: string;
  outcome: AiUsageOutcome;
  promptTokens?: number | null;
  provider: string;
  /**
   * Cost the provider itself charged for this call, when it reports one
   * (OpenRouter returns `usage.cost` in USD). Always preferred over a local
   * price table: it already accounts for the backend actually routed to, cache
   * discounts, and reasoning surcharges.
   */
  providerCostUsd?: number | null;
  reasoningTokens?: number | null;
  startedAt: string;
  step: AiUsageStep;
  totalTokens?: number | null;
}

/**
 * Fingerprints the model input of one call.
 *
 * Length-prefixed rather than concatenated, so ["ab", "c"] and ["a", "bc"]
 * cannot collide into one digest and report two genuinely different prompts as
 * a duplicate. Truncated to 16 hex characters: this identifies calls inside one
 * process, it authenticates nothing.
 */
export function digestAiCallInput(parts: readonly string[]): string {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(`${part.length} `);
    hash.update(part);
  }
  return hash.digest("hex").slice(0, 16);
}

export function recordAiCall(input: RecordAiCallInput): void {
  const promptTokens = finiteOrNull(input.promptTokens);
  const completionTokens = finiteOrNull(input.completionTokens);
  const reasoningTokens = finiteOrNull(input.reasoningTokens);
  const totalTokens =
    finiteOrNull(input.totalTokens) ??
    (promptTokens === null && completionTokens === null
      ? null
      : (promptTokens ?? 0) + (completionTokens ?? 0));
  const tokenSource: AiUsageTokenSource =
    totalTokens === null ? "not_reported" : "provider_reported";
  const { costSource, costUsd } = input.providerCostOnly
    ? {
        costSource:
          finiteOrNull(input.providerCostUsd) === null
            ? ("unavailable" as const)
            : ("provider_reported" as const),
        costUsd: finiteOrNull(input.providerCostUsd),
      }
    : priceCall({
        completionTokens,
        model: input.model,
        promptTokens,
        providerCostUsd: finiteOrNull(input.providerCostUsd),
        totalTokens,
      });

  const record: AiCallUsageRecord = {
    cachedPromptTokens: finiteOrNull(input.cachedPromptTokens),
    completionTokens,
    costSource,
    costUsd,
    durationMs: input.durationMs,
    inputDigest: input.inputDigest ?? null,
    model: input.model,
    outcome: input.outcome,
    promptTokens,
    provider: input.provider,
    reasoningTokens,
    startedAt: input.startedAt,
    step: input.step,
    tokenSource,
    totalTokens,
  };

  const run = runStorage.getStore();
  if (!run) {
    unscopedCallCount += 1;
    return;
  }
  if (run.calls.length < MAX_CALLS_PER_RUN) {
    run.calls.push(record);
  } else {
    run.totals.droppedCallRows += 1;
  }
  accumulate(run.totals, record);
}

function accumulate(totals: AiRunUsageTotals, record: AiCallUsageRecord): void {
  totals.callCount += 1;
  totals.promptTokens += record.promptTokens ?? 0;
  totals.completionTokens += record.completionTokens ?? 0;
  totals.reasoningTokens += record.reasoningTokens ?? 0;
  totals.totalTokens += record.totalTokens ?? 0;
  if (record.tokenSource === "not_reported") {
    totals.untokenizedCallCount += 1;
  }
  if (record.costUsd === null) {
    totals.unpricedCallCount += 1;
  } else {
    totals.costUsd = (totals.costUsd ?? 0) + record.costUsd;
  }
  if (record.outcome === "error") {
    totals.errorCallCount += 1;
  }
  if (record.outcome === "truncated") {
    totals.truncatedCallCount += 1;
  }
}

function finiteOrNull(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// --- Pricing --------------------------------------------------------------

let priceTableCache: {
  error: string | null;
  raw: string;
  table: Map<string, AiModelPrice>;
} | null = null;

/**
 * Per-model prices, as USD per million tokens:
 *
 *   LLM_PRICE_TABLE_JSON={"openai/gpt-oss-120b":{"inputPerMillionUsd":0.05,"outputPerMillionUsd":0.25}}
 *
 * Only consulted when the provider does not report its own cost. A malformed
 * table is NOT treated as an empty one: the parse error is kept and surfaced by
 * `getAiUsagePricingStatus`, because "every call is unpriced" and "the operator
 * mistyped one brace" must not look the same on the console.
 */
function getPriceTable(): {
  error: string | null;
  table: Map<string, AiModelPrice>;
} {
  const raw = (process.env.LLM_PRICE_TABLE_JSON ?? "").trim();
  if (priceTableCache && priceTableCache.raw === raw) {
    return { error: priceTableCache.error, table: priceTableCache.table };
  }
  const table = new Map<string, AiModelPrice>();
  let error: string | null = null;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (
        parsed === null ||
        typeof parsed !== "object" ||
        Array.isArray(parsed)
      ) {
        throw new Error("expected a JSON object keyed by model id");
      }
      for (const [model, value] of Object.entries(
        parsed as Record<string, unknown>,
      )) {
        const entry = value as Record<string, unknown> | null;
        const input = Number(entry?.inputPerMillionUsd);
        const output = Number(entry?.outputPerMillionUsd);
        if (
          !Number.isFinite(input) ||
          !Number.isFinite(output) ||
          input < 0 ||
          output < 0
        ) {
          throw new Error(
            `model "${model}" needs non-negative numeric inputPerMillionUsd and outputPerMillionUsd`,
          );
        }
        table.set(model, {
          inputPerMillionUsd: input,
          outputPerMillionUsd: output,
        });
      }
    } catch (parseError) {
      table.clear();
      error = `LLM_PRICE_TABLE_JSON is unusable: ${
        parseError instanceof Error ? parseError.message : String(parseError)
      }`;
    }
  }
  priceTableCache = { error, raw, table };
  return { error, table };
}

function flatRatePerThousandTokensUsd(): number {
  const value = Number(process.env.LLM_ESTIMATED_COST_PER_1K_TOKENS_USD ?? "0");
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function priceCall(args: {
  completionTokens: number | null;
  model: string;
  promptTokens: number | null;
  providerCostUsd: number | null;
  totalTokens: number | null;
}): { costSource: AiUsageCostSource; costUsd: number | null } {
  if (args.providerCostUsd !== null && args.providerCostUsd >= 0) {
    return { costSource: "provider_reported", costUsd: args.providerCostUsd };
  }
  const { table } = getPriceTable();
  const price = table.get(args.model);
  if (price && (args.promptTokens !== null || args.completionTokens !== null)) {
    return {
      costSource: "configured_model_rate",
      costUsd:
        ((args.promptTokens ?? 0) / 1_000_000) * price.inputPerMillionUsd +
        ((args.completionTokens ?? 0) / 1_000_000) * price.outputPerMillionUsd,
    };
  }
  const flat = flatRatePerThousandTokensUsd();
  if (flat > 0 && args.totalTokens !== null) {
    return {
      costSource: "configured_flat_rate",
      costUsd: (args.totalTokens / 1_000) * flat,
    };
  }
  // No price and no token counts: reported as unknown, never as zero. A zero
  // here would read as "this run was free".
  return { costSource: "unavailable", costUsd: null };
}

export function getAiUsagePricingStatus(): AiUsagePricingStatus {
  const { error, table } = getPriceTable();
  return {
    configurationError: error,
    flatRatePerThousandTokensUsd: flatRatePerThousandTokensUsd(),
    pricedModels: [...table.keys()].sort(),
    unscopedCallCount,
  };
}

// --- Provider payload normalisation ---------------------------------------

export interface ProviderReportedUsage {
  cachedPromptTokens: number | null;
  completionTokens: number | null;
  costUsd: number | null;
  promptTokens: number | null;
  reasoningTokens: number | null;
  totalTokens: number | null;
}

/**
 * Reads the token counters out of a chat-completions payload.
 *
 * Two shapes are accepted because the pipeline talks to two surfaces: the
 * OpenAI-compatible `usage` object (OpenRouter, Groq, vLLM, and Ollama's `/v1`),
 * and Ollama's NATIVE `/api/chat`, which the Granite guardian uses and which
 * reports `prompt_eval_count` / `eval_count` instead. Returns null when neither
 * is present, so the call is recorded as `not_reported` rather than as zero
 * tokens.
 */
export function readProviderUsage(
  payload: unknown,
): ProviderReportedUsage | null {
  if (payload === null || typeof payload !== "object") {
    return null;
  }
  const record = payload as Record<string, unknown>;
  const usage = record.usage as Record<string, unknown> | undefined;
  if (usage && typeof usage === "object") {
    const promptDetails = usage.prompt_tokens_details as
      | Record<string, unknown>
      | undefined;
    const completionDetails = usage.completion_tokens_details as
      | Record<string, unknown>
      | undefined;
    const promptTokens =
      numberOrNull(usage.prompt_tokens) ?? numberOrNull(usage.input_tokens);
    const completionTokens =
      numberOrNull(usage.completion_tokens) ??
      numberOrNull(usage.output_tokens);
    const totalTokens = numberOrNull(usage.total_tokens);
    if (
      promptTokens !== null ||
      completionTokens !== null ||
      totalTokens !== null ||
      numberOrNull(usage.cost) !== null
    ) {
      return {
        cachedPromptTokens: numberOrNull(promptDetails?.cached_tokens),
        completionTokens,
        costUsd: numberOrNull(usage.cost),
        promptTokens,
        reasoningTokens: numberOrNull(completionDetails?.reasoning_tokens),
        totalTokens,
      };
    }
  }
  // Ollama native /api/chat.
  const promptEval = numberOrNull(record.prompt_eval_count);
  const evalCount = numberOrNull(record.eval_count);
  if (promptEval !== null || evalCount !== null) {
    return {
      cachedPromptTokens: null,
      completionTokens: evalCount,
      costUsd: null,
      promptTokens: promptEval,
      reasoningTokens: null,
      totalTokens: (promptEval ?? 0) + (evalCount ?? 0),
    };
  }
  return null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// --- Redundancy ------------------------------------------------------------

export interface AiDuplicateCallGroup {
  /** How many calls in the run shared this step, model and input. */
  callCount: number;
  inputDigest: string;
  model: string;
  /** Every call in the group after the first. */
  redundantCallCount: number;
  /** null when any redundant call in the group is unpriced. */
  redundantCostUsd: number | null;
  redundantDurationMs: number;
  /**
   * The subset of the repeats that returned nothing — a transport retry against
   * a failing or rate-limited provider.
   *
   * Kept apart from the rest because the two have different fixes and must not
   * be added up into one headline: a repeat that SUCCEEDED twice is a pipeline
   * step issued twice and is removed by not issuing it, while a failed attempt
   * is a provider that cannot serve the request at all.
   */
  redundantErrorCallCount: number;
  redundantErrorDurationMs: number;
  redundantTotalTokens: number;
  step: AiUsageStep;
}

export interface AiRedundancyReport {
  /**
   * Rows the runs dropped past `MAX_CALLS_PER_RUN`. Non-zero means the figures
   * below are a LOWER BOUND: a dropped duplicate cannot be counted.
   */
  droppedCallRows: number;
  duplicateGroups: AiDuplicateCallGroup[];
  redundantCallCount: number;
  /** null when any redundant call is unpriced; the other figures stay exact. */
  redundantCostUsd: number | null;
  redundantDurationMs: number;
  /** See `AiDuplicateCallGroup.redundantErrorCallCount`. */
  redundantErrorCallCount: number;
  redundantErrorDurationMs: number;
  redundantTotalTokens: number;
  /** Wall clock of the analysed runs, so the saving can be read as a share. */
  totalWallClockMs: number;
  /**
   * Calls that carried no digest. They can be neither confirmed nor ruled out
   * as duplicates, so a non-zero value is the second reason this is a lower
   * bound.
   */
  undigestedCallCount: number;
}

/**
 * Finds the calls a run issued more than once with byte-identical input.
 *
 * Takes a LIST of reports because the player-facing flow is two scopes, not
 * one: `phase: "interpret"` and `phase: "compile"` each open their own
 * `captureAiRun`, and the duplicate this pipeline actually pays for — the
 * jailbreak classification of the player's own sanitized text — falls across
 * that boundary. Pass the scopes belonging to ONE rule; grouping unrelated
 * players' runs would count two people writing the same sentence as waste.
 *
 * The first call of each group is never counted: it is the one that produced
 * the answer. Only the repeats are.
 *
 * Wall-clock saving equals `redundantDurationMs` only for calls issued
 * sequentially. Every step of this pipeline awaits the previous one — the
 * provider loop, the repair loop and the two groundedness questions included —
 * so that holds here, and `totalWallClockMs` sits beside it to be checked
 * rather than assumed.
 */
export function summarizeAiRedundancy(
  reports: readonly AiRunUsageReport[],
): AiRedundancyReport {
  const groups = new Map<string, AiDuplicateCallGroup>();
  let droppedCallRows = 0;
  let totalWallClockMs = 0;
  let undigestedCallCount = 0;

  for (const report of reports) {
    droppedCallRows += report.totals.droppedCallRows;
    totalWallClockMs += report.resources.wallClockMs;
    for (const call of report.calls) {
      if (call.inputDigest === null) {
        undigestedCallCount += 1;
        continue;
      }
      const key = `${call.step} ${call.model} ${call.inputDigest}`;
      const group = groups.get(key);
      if (!group) {
        groups.set(key, {
          callCount: 1,
          inputDigest: call.inputDigest,
          model: call.model,
          redundantCallCount: 0,
          redundantCostUsd: 0,
          redundantDurationMs: 0,
          redundantErrorCallCount: 0,
          redundantErrorDurationMs: 0,
          redundantTotalTokens: 0,
          step: call.step,
        });
        continue;
      }
      group.callCount += 1;
      group.redundantCallCount += 1;
      group.redundantDurationMs += call.durationMs;
      group.redundantTotalTokens += call.totalTokens ?? 0;
      if (call.outcome === "error") {
        group.redundantErrorCallCount += 1;
        group.redundantErrorDurationMs += call.durationMs;
      }
      // An unpriced repeat makes the group's cost unknown, not zero: reporting
      // zero would say the duplicate was free, which is the one thing it is not.
      group.redundantCostUsd =
        call.costUsd === null || group.redundantCostUsd === null
          ? null
          : group.redundantCostUsd + call.costUsd;
    }
  }

  const duplicateGroups = [...groups.values()]
    .filter((group) => group.redundantCallCount > 0)
    .sort(
      (left, right) => right.redundantDurationMs - left.redundantDurationMs,
    );

  let redundantCallCount = 0;
  let redundantCostUsd: number | null = 0;
  let redundantDurationMs = 0;
  let redundantErrorCallCount = 0;
  let redundantErrorDurationMs = 0;
  let redundantTotalTokens = 0;
  for (const group of duplicateGroups) {
    redundantCallCount += group.redundantCallCount;
    redundantDurationMs += group.redundantDurationMs;
    redundantErrorCallCount += group.redundantErrorCallCount;
    redundantErrorDurationMs += group.redundantErrorDurationMs;
    redundantTotalTokens += group.redundantTotalTokens;
    redundantCostUsd =
      group.redundantCostUsd === null || redundantCostUsd === null
        ? null
        : redundantCostUsd + group.redundantCostUsd;
  }

  return {
    droppedCallRows,
    duplicateGroups,
    redundantCallCount,
    redundantCostUsd,
    redundantDurationMs,
    redundantErrorCallCount,
    redundantErrorDurationMs,
    redundantTotalTokens,
    totalWallClockMs,
    undigestedCallCount,
  };
}

// --- Registry access ------------------------------------------------------

/** Newest first. */
export function getAiUsageRuns(limit = MAX_DETAILED_RUNS): AiRunUsageReport[] {
  return detailedRuns.slice(-limit).reverse();
}

/** Newest first. Survives a restart through the API state snapshot. */
export function getAiUsageRunSummaries(
  limit = MAX_SUMMARY_RUNS,
): AiRunUsageSummary[] {
  return runSummaries.slice(-limit).reverse();
}

export function exportAiUsageRunSummaries(): AiRunUsageSummary[] {
  return [...runSummaries];
}

export function importAiUsageRunSummaries(
  summaries: readonly AiRunUsageSummary[],
): void {
  runSummaries.length = 0;
  runSummaries.push(...summaries.slice(-MAX_SUMMARY_RUNS));
}

export function resetAiUsageRegistry(): void {
  detailedRuns.length = 0;
  runSummaries.length = 0;
  unscopedCallCount = 0;
  priceTableCache = null;
}
