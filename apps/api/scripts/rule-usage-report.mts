// Measures what one rule really costs to compile: tokens, USD, CPU and RAM.
//
// Runs the REAL preflight pipeline in-process, so it needs no HTTP server, no
// database and no operator wallet — unlike /operator/ai-operations, which is
// gated behind a signed wallet challenge. Importing apps/api/src/index.ts also
// loads the root .env, so the run uses the same provider configuration the API
// would.
//
//   pnpm --filter @tyche/api usage:report
//   pnpm --filter @tyche/api usage:report -- --json
//   pnpm --filter @tyche/api usage:report -- "ganho se 3 dos meus numeros sairem"
//
// With no rule arguments it runs the small default corpus below. Each rule is a
// separate measurement scope, so per-run figures stay attributable; runs are
// sequential because `process.cpuUsage()` is process-wide and overlapping runs
// would share one CPU counter.

import { createRulePreflight } from "../src/index.js";
import {
  getAiUsagePricingStatus,
  getAiUsageRuns,
  type AiRunUsageReport,
} from "../src/usage.js";

// Three shapes with different costs: one the deterministic compiler knows, one
// novel composition that buys the independent reviewer, and one with negation
// and a connector, which routes straight to the escalation model.
const DEFAULT_RULES = [
  "A guess wins if at least 3 of its numbers appear in the official draw.",
  "A guess wins if the sum of its three smallest numbers is greater than the sum of the three smallest drawn numbers.",
  "A guess wins if none of its even numbers appear in the draw and the first drawn number is odd.",
];

const argv = process.argv.slice(2);
const asJson = argv.includes("--json");
const rules = argv.filter((value) => !value.startsWith("--"));
const corpus = rules.length > 0 ? rules : DEFAULT_RULES;

function padLeft(value: string | number, width: number) {
  return String(value).padStart(width);
}

function usd(value: number | null) {
  return value === null ? "n/a" : `$${value.toFixed(6)}`;
}

function megabytes(value: number) {
  return `${Math.round(value / 1_048_576)} MB`;
}

interface Outcome {
  decision: string;
  error: string | null;
  report: AiRunUsageReport | undefined;
  rule: string;
}

const outcomes: Outcome[] = [];

for (const [index, rule] of corpus.entries()) {
  if (!asJson) {
    console.log(`\n[${index + 1}/${corpus.length}] ${rule}`);
  }
  let decision = "THREW";
  let error: string | null = null;
  try {
    const preflight = await createRulePreflight(rule);
    decision = preflight.decision ?? "UNKNOWN";
  } catch (caught) {
    // A rule that fails still spent its calls, and those are the expensive ones.
    // The report is published either way, so the failure is measured, not lost.
    error = caught instanceof Error ? caught.message : String(caught);
  }
  const report = getAiUsageRuns(1)[0];
  outcomes.push({ decision, error, report, rule });

  if (asJson || !report) {
    continue;
  }
  console.log(`  decision: ${decision}${error ? ` (${error})` : ""}`);
  for (const call of report.calls) {
    console.log(
      [
        "   ",
        call.step.padEnd(22),
        call.outcome.padEnd(10),
        `${padLeft(call.promptTokens ?? "-", 7)} in`,
        `${padLeft(call.completionTokens ?? "-", 6)} out`,
        `${padLeft(call.reasoningTokens ?? "-", 6)} reason`,
        padLeft(usd(call.costUsd), 12),
        padLeft(`${Math.round(call.durationMs)}ms`, 8),
        call.provider,
        call.model,
      ].join(" "),
    );
  }
  console.log(
    `  run: ${report.totals.callCount} calls / ` +
      `${report.totals.promptTokens} in / ${report.totals.completionTokens} out / ` +
      `${usd(report.totals.costUsd)} / ` +
      `${Math.round(report.resources.wallClockMs)}ms wall / ` +
      `${Math.round(report.resources.cpuTotalMs)}ms CPU / ` +
      `${megabytes(report.resources.rssPeakBytes)} peak RSS`,
  );
}

const reports = outcomes
  .map((outcome) => outcome.report)
  .filter((report): report is AiRunUsageReport => report !== undefined);

const totals = reports.reduce(
  (accumulator, report) => ({
    calls: accumulator.calls + report.totals.callCount,
    completionTokens:
      accumulator.completionTokens + report.totals.completionTokens,
    costUsd:
      report.totals.costUsd === null
        ? accumulator.costUsd
        : (accumulator.costUsd ?? 0) + report.totals.costUsd,
    cpuMs: accumulator.cpuMs + report.resources.cpuTotalMs,
    promptTokens: accumulator.promptTokens + report.totals.promptTokens,
    totalTokens: accumulator.totalTokens + report.totals.totalTokens,
    truncated: accumulator.truncated + report.totals.truncatedCallCount,
    unpriced: accumulator.unpriced + report.totals.unpricedCallCount,
    wallClockMs: accumulator.wallClockMs + report.resources.wallClockMs,
  }),
  {
    calls: 0,
    completionTokens: 0,
    costUsd: null as number | null,
    cpuMs: 0,
    promptTokens: 0,
    totalTokens: 0,
    truncated: 0,
    unpriced: 0,
    wallClockMs: 0,
  },
);

// Which endpoint the tokens went to. Every OpenAI-compatible provider reports
// its counts, so these are complete even where the cost is not.
const byProvider = new Map<
  string,
  {
    calls: number;
    completionTokens: number;
    costUsd: number | null;
    model: string;
    promptTokens: number;
    provider: string;
    unpricedCalls: number;
  }
>();
for (const report of reports) {
  for (const call of report.calls) {
    const key = `${call.provider}:${call.model}`;
    const row = byProvider.get(key) ?? {
      calls: 0,
      completionTokens: 0,
      costUsd: null,
      model: call.model,
      promptTokens: 0,
      provider: call.provider,
      unpricedCalls: 0,
    };
    row.calls += 1;
    row.completionTokens += call.completionTokens ?? 0;
    row.promptTokens += call.promptTokens ?? 0;
    if (call.costUsd === null) {
      row.unpricedCalls += 1;
    } else {
      row.costUsd = (row.costUsd ?? 0) + call.costUsd;
    }
    byProvider.set(key, row);
  }
}

const pricing = getAiUsagePricingStatus();
const runCount = reports.length || 1;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        byProvider: [...byProvider.values()],
        pricing,
        runs: outcomes.map((outcome) => ({
          decision: outcome.decision,
          error: outcome.error,
          resources: outcome.report?.resources ?? null,
          rule: outcome.rule,
          totals: outcome.report?.totals ?? null,
        })),
        totals,
      },
      null,
      2,
    ),
  );
} else {
  console.log("\n=== tokens by provider ===");
  for (const row of [...byProvider.values()].sort(
    (left, right) => right.promptTokens - left.promptTokens,
  )) {
    console.log(
      [
        "   ",
        row.provider.padEnd(12),
        row.model.padEnd(32),
        `${padLeft(row.calls, 3)} calls`,
        `${padLeft(row.promptTokens, 7)} in`,
        `${padLeft(row.completionTokens, 6)} out`,
        padLeft(usd(row.costUsd), 12),
        row.unpricedCalls > 0 ? `${row.unpricedCalls} unpriced` : "",
      ].join(" "),
    );
  }

  console.log("\n=== average per rule ===");
  console.log(`    LLM calls        ${(totals.calls / runCount).toFixed(1)}`);
  console.log(
    `    Input tokens     ${Math.round(totals.promptTokens / runCount)}`,
  );
  console.log(
    `    Output tokens    ${Math.round(totals.completionTokens / runCount)}`,
  );
  console.log(
    `    Cost             ${
      totals.costUsd === null ? "n/a" : usd(totals.costUsd / runCount)
    }${totals.unpriced > 0 ? `  (floor: ${totals.unpriced} unpriced calls)` : ""}`,
  );
  console.log(
    `    Wall clock       ${Math.round(totals.wallClockMs / runCount)}ms`,
  );
  console.log(
    `    API CPU time     ${Math.round(totals.cpuMs / runCount)}ms` +
      `  (${((totals.cpuMs / totals.wallClockMs) * 100).toFixed(2)}% of one core)`,
  );
  if (totals.truncated > 0) {
    // Output-budget exhaustion: billed in full, produced nothing usable.
    console.log(`    Truncated calls  ${totals.truncated}`);
  }
  if (pricing.configurationError) {
    console.log(`\n    ${pricing.configurationError}`);
  }
}

// A rule that never compiled is a failed measurement run, not a failed script:
// the numbers above are still valid. Only a run that produced no report at all
// means the measurement itself did not happen.
process.exitCode = reports.length === corpus.length ? 0 : 1;
