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
//   pnpm --filter @tyche/api usage:report -- --single-phase
//
// With no rule arguments it runs the small default corpus below. Each rule is a
// separate measurement scope, so per-run figures stay attributable; runs are
// sequential because `process.cpuUsage()` is process-wide and overlapping runs
// would share one CPU counter.
//
// By default each rule is measured through the TWO-PHASE flow `Create.tsx`
// performs — interpret, approve, compile — because that is the flow a player
// pays for and the one whose repeated calls are worth counting. `--single-phase`
// runs compile alone, which is the older behaviour and a different (cheaper,
// unrepresentative) shape: it skips approval, so the compile scope reinterprets
// the text itself.
//
// The redundancy section is a measurement, not an estimate: a call is counted
// as redundant only when another call in the same rule's scopes used the same
// step, the same model and a byte-identical input digest. Every rule step
// decodes greedily with a fixed seed, so such a call cannot return anything the
// first one did not.

import {
  createRuleInterpretation,
  createRulePreflight,
  readApprovedRuleInterpretation,
} from "../src/index.js";
import {
  getAiUsagePricingStatus,
  getAiUsageRuns,
  summarizeAiRedundancy,
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
const singlePhase = argv.includes("--single-phase");
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
  /** One scope per phase, in order. Empty only when the very first call threw. */
  reports: AiRunUsageReport[];
  rule: string;
}

const outcomes: Outcome[] = [];

/**
 * Runs one rule the way a player does and returns every measurement scope it
 * opened. Interpret and compile are separate `captureAiRun` scopes, so both are
 * collected: the redundancy analysis needs the pair to see a call repeated
 * across the phase boundary.
 *
 * An approval that fails validation is NOT worked around. `Create.tsx` cannot
 * send one either, so falling back to an unapproved compile would measure a
 * flow no player can reach.
 */
async function measureRule(rule: string): Promise<Outcome> {
  const reports: AiRunUsageReport[] = [];
  const collect = () => {
    const report = getAiUsageRuns(1)[0];
    if (report) {
      reports.push(report);
    }
  };
  try {
    if (singlePhase) {
      const preflight = await createRulePreflight(rule);
      collect();
      return {
        decision: preflight.decision ?? "UNKNOWN",
        error: null,
        reports,
        rule,
      };
    }
    const interpretation = await createRuleInterpretation(rule);
    collect();
    if (interpretation.needsClarification) {
      // A clarification is a real product outcome, not a failed run: the calls
      // it spent are measured like any other.
      return { decision: "CLARIFY", error: null, reports, rule };
    }
    const approved = readApprovedRuleInterpretation(interpretation, rule);
    if (!approved) {
      return {
        decision: "UNAPPROVABLE",
        error: "the interpretation failed readApprovedRuleInterpretation",
        reports,
        rule,
      };
    }
    const preflight = await createRulePreflight(
      rule,
      () => undefined,
      undefined,
      approved,
    );
    collect();
    return {
      decision: preflight.decision ?? "UNKNOWN",
      error: null,
      reports,
      rule,
    };
  } catch (caught) {
    // A rule that fails still spent its calls, and those are the expensive ones.
    // The report is published either way, so the failure is measured, not lost.
    collect();
    return {
      decision: "THREW",
      error: caught instanceof Error ? caught.message : String(caught),
      reports,
      rule,
    };
  }
}

function sumWallClockMs(reports: readonly AiRunUsageReport[]) {
  return reports.reduce(
    (total, report) => total + report.resources.wallClockMs,
    0,
  );
}

function sumCallCount(reports: readonly AiRunUsageReport[]) {
  return reports.reduce((total, report) => total + report.totals.callCount, 0);
}

for (const [index, rule] of corpus.entries()) {
  if (!asJson) {
    console.log(`\n[${index + 1}/${corpus.length}] ${rule}`);
  }
  const outcome = await measureRule(rule);
  outcomes.push(outcome);

  if (asJson || outcome.reports.length === 0) {
    continue;
  }
  console.log(
    `  decision: ${outcome.decision}${outcome.error ? ` (${outcome.error})` : ""}`,
  );
  for (const report of outcome.reports) {
    for (const call of report.calls) {
      console.log(
        [
          "   ",
          call.step.padEnd(22),
          call.outcome.padEnd(10),
          `${padLeft(call.promptTokens ?? "-", 7)} in`,
          // The compiler skill prompt plus the candidate JSON Schema is ~16k
          // tokens and is re-sent on every compile and review call, so this
          // column is where a prompt-cache configuration proves itself.
          `${padLeft(call.cachedPromptTokens ?? "-", 7)} cached`,
          `${padLeft(call.completionTokens ?? "-", 6)} out`,
          `${padLeft(call.reasoningTokens ?? "-", 6)} reason`,
          padLeft(usd(call.costUsd), 12),
          padLeft(`${Math.round(call.durationMs)}ms`, 8),
          // The digest is what makes a repeat visible in this listing: two rows
          // sharing a step and this value are the same request, sent twice.
          (call.inputDigest ?? "-").padEnd(16),
          call.provider,
          call.model,
        ].join(" "),
      );
    }
  }
  const ruleRedundancy = summarizeAiRedundancy(outcome.reports);
  console.log(
    `  rule: ${sumCallCount(outcome.reports)} calls / ` +
      `${Math.round(sumWallClockMs(outcome.reports))}ms wall / ` +
      `${megabytes(
        Math.max(
          ...outcome.reports.map((report) => report.resources.rssPeakBytes),
        ),
      )} peak RSS / ` +
      `${ruleRedundancy.redundantCallCount} redundant calls ` +
      `(${Math.round(ruleRedundancy.redundantDurationMs)}ms, ` +
      `${usd(ruleRedundancy.redundantCostUsd)})`,
  );
}

// Redundancy is aggregated PER RULE and then summed. Pooling every run into one
// analysis would group two different rules that happen to share a prompt — the
// identical compiler skill preamble, say — and report an unrelated player's call
// as a duplicate of this one.
const redundancy = outcomes.map((outcome) =>
  summarizeAiRedundancy(outcome.reports),
);
const redundancyTotals = redundancy.reduce(
  (accumulator, entry) => ({
    calls: accumulator.calls + entry.redundantCallCount,
    costUsd:
      entry.redundantCostUsd === null || accumulator.costUsd === null
        ? null
        : accumulator.costUsd + entry.redundantCostUsd,
    droppedCallRows: accumulator.droppedCallRows + entry.droppedCallRows,
    durationMs: accumulator.durationMs + entry.redundantDurationMs,
    errorCalls: accumulator.errorCalls + entry.redundantErrorCallCount,
    errorDurationMs:
      accumulator.errorDurationMs + entry.redundantErrorDurationMs,
    totalTokens: accumulator.totalTokens + entry.redundantTotalTokens,
    undigested: accumulator.undigested + entry.undigestedCallCount,
  }),
  {
    calls: 0,
    costUsd: 0 as number | null,
    droppedCallRows: 0,
    durationMs: 0,
    errorCalls: 0,
    errorDurationMs: 0,
    totalTokens: 0,
    undigested: 0,
  },
);
const duplicateStepRows = new Map<
  string,
  {
    calls: number;
    costUsd: number | null;
    durationMs: number;
    errorCalls: number;
    label: string;
  }
>();
for (const entry of redundancy) {
  for (const group of entry.duplicateGroups) {
    const label = `${group.step} / ${group.model}`;
    const row = duplicateStepRows.get(label) ?? {
      calls: 0,
      costUsd: 0 as number | null,
      durationMs: 0,
      errorCalls: 0,
      label,
    };
    row.calls += group.redundantCallCount;
    row.durationMs += group.redundantDurationMs;
    row.errorCalls += group.redundantErrorCallCount;
    row.costUsd =
      group.redundantCostUsd === null || row.costUsd === null
        ? null
        : row.costUsd + group.redundantCostUsd;
    duplicateStepRows.set(label, row);
  }
}

const reports = outcomes.flatMap((outcome) => outcome.reports);

// Not on `AiRunUsageTotals`: the run totals deliberately carry only what the
// persisted summary carries, and cached prompt tokens live on the per-call rows.
const cachedPromptTokens = reports.reduce(
  (total, report) =>
    total +
    report.calls.reduce(
      (callTotal, call) => callTotal + (call.cachedPromptTokens ?? 0),
      0,
    ),
  0,
);

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
// Per RULE, not per scope. The two-phase flow opens two scopes for one rule, so
// dividing by `reports.length` would halve every average and report a cost no
// player ever pays.
const runCount =
  outcomes.filter((outcome) => outcome.reports.length > 0).length || 1;

if (asJson) {
  console.log(
    JSON.stringify(
      {
        byProvider: [...byProvider.values()],
        pricing,
        cachedPromptTokens,
        redundancy: {
          byStep: [...duplicateStepRows.values()],
          totals: redundancyTotals,
        },
        runs: outcomes.map((outcome, index) => ({
          decision: outcome.decision,
          error: outcome.error,
          redundancy: redundancy[index] ?? null,
          resources: outcome.reports.map((report) => report.resources),
          rule: outcome.rule,
          totals: outcome.reports.map((report) => report.totals),
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
    `    Cached input     ${Math.round(cachedPromptTokens / runCount)}` +
      `  (${((cachedPromptTokens / (totals.promptTokens || 1)) * 100).toFixed(1)}% of input reused)`,
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
  console.log("\n=== redundant calls (same step, model and input) ===");
  if (redundancyTotals.calls === 0) {
    console.log("    none measured");
  } else {
    for (const row of [...duplicateStepRows.values()].sort(
      (left, right) => right.durationMs - left.durationMs,
    )) {
      console.log(
        [
          "   ",
          row.label.padEnd(46),
          `${padLeft(row.calls, 3)} calls`,
          padLeft(`${Math.round(row.durationMs)}ms`, 9),
          padLeft(usd(row.costUsd), 12),
          row.errorCalls > 0
            ? `${row.errorCalls} of them failed provider attempts`
            : "",
        ].join(" "),
      );
    }
    console.log(
      `    total            ${redundancyTotals.calls} calls / ` +
        `${Math.round(redundancyTotals.durationMs)}ms / ` +
        `${redundancyTotals.totalTokens} tokens / ` +
        `${usd(redundancyTotals.costUsd)}`,
    );
    console.log(
      `    share of wall    ${(
        (redundancyTotals.durationMs / totals.wallClockMs) *
        100
      ).toFixed(1)}% of ${Math.round(totals.wallClockMs)}ms measured`,
    );
    console.log(
      `    per rule         ${(redundancyTotals.calls / corpus.length).toFixed(1)} calls / ` +
        `${Math.round(redundancyTotals.durationMs / corpus.length)}ms`,
    );
    // The two categories have different fixes, so the headline is split rather
    // than pooled: a repeat that answered twice is a step issued twice, and a
    // repeat that returned nothing is a provider that cannot serve the request.
    const answeredCalls = redundancyTotals.calls - redundancyTotals.errorCalls;
    const answeredDurationMs =
      redundancyTotals.durationMs - redundancyTotals.errorDurationMs;
    console.log(
      `      repeats that answered      ${answeredCalls} calls / ` +
        `${Math.round(answeredDurationMs)}ms / ` +
        `${Math.round(answeredDurationMs / corpus.length)}ms per rule`,
    );
    console.log(
      `      failed provider attempts   ${redundancyTotals.errorCalls} calls / ` +
        `${Math.round(redundancyTotals.errorDurationMs)}ms / ` +
        `${Math.round(redundancyTotals.errorDurationMs / corpus.length)}ms per rule`,
    );
  }
  // Both are reasons the figures above are a LOWER bound, so they are printed
  // whenever they are non-zero rather than being folded into the totals.
  if (redundancyTotals.undigested > 0) {
    console.log(
      `    ${redundancyTotals.undigested} calls carried no input digest and could not be checked`,
    );
  }
  if (redundancyTotals.droppedCallRows > 0) {
    console.log(
      `    ${redundancyTotals.droppedCallRows} call rows were dropped past the per-run cap and could not be checked`,
    );
  }

  if (totals.truncated > 0) {
    // Output-budget exhaustion: billed in full, produced nothing usable.
    console.log(`    Truncated calls  ${totals.truncated}`);
  }
  if (pricing.configurationError) {
    console.log(`\n    ${pricing.configurationError}`);
  }
}

// A rule that never compiled is a failed measurement run, not a failed script:
// the numbers above are still valid. Only a rule that produced no scope at all
// means the measurement itself did not happen for it.
process.exitCode = outcomes.every((outcome) => outcome.reports.length > 0)
  ? 0
  : 1;
