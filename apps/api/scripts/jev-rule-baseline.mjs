import { performance } from "node:perf_hooks";
import { cases } from "./jev-rule-probe.mjs";
import {
  createRuleInterpretation,
  createRulePreflight,
  readApprovedRuleInterpretation,
} from "../src/index.ts";
import { getAiUsageRuns } from "../src/usage.ts";

// Measure the actual two-phase player flow for the same texts as the Jev probe.
// This script does not submit or persist any official proposal.
const selected = cases.filter((item) =>
  process.argv.slice(2).includes(item.id),
);
if (selected.length === 0) throw new Error("Pass one or more probe case IDs");

for (const item of selected) {
  const started = performance.now();
  const phases = [];
  let outcome = null;
  let error = null;
  try {
    const interpretation = await createRuleInterpretation(item.text);
    phases.push({ phase: "interpret", report: getAiUsageRuns(1)[0] ?? null });
    if (interpretation.needsClarification) {
      outcome = {
        decision: "CLARIFY",
        questions: interpretation.clarificationQuestions,
      };
    } else {
      const approved = readApprovedRuleInterpretation(
        interpretation,
        item.text,
      );
      if (!approved) throw new Error("Interpretation could not be approved");
      const preflight = await createRulePreflight(
        item.text,
        () => undefined,
        undefined,
        approved,
      );
      phases.push({ phase: "compile", report: getAiUsageRuns(1)[0] ?? null });
      outcome = {
        decision: preflight.decision,
        needsClarification: preflight.needsClarification,
        reasonCodes: preflight.reasonCodes,
        ast: preflight.ast ?? null,
        rejectedCandidates: (preflight.rejectedCompilerAttempts ?? [])
          .filter((attempt) => attempt.candidate?.ast)
          .map((attempt) => ({
            ast: attempt.candidate.ast,
            reasonCodes: attempt.reasonCodes,
          })),
      };
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    phases.push({ phase: "failed", report: getAiUsageRuns(1)[0] ?? null });
  }
  const reports = phases.map((item) => item.report).filter(Boolean);
  console.log(
    JSON.stringify({
      id: item.id,
      text: item.text,
      elapsedMs: Math.round(performance.now() - started),
      outcome,
      error,
      calls: reports.reduce((sum, report) => sum + report.totals.callCount, 0),
      providerCostUsd: reports.reduce(
        (sum, report) => sum + (report.totals.costUsd ?? 0),
        0,
      ),
      unpricedCalls: reports.reduce(
        (sum, report) =>
          sum + report.calls.filter((call) => call.costUsd === null).length,
        0,
      ),
      phases: phases.map(({ phase, report }) => ({
        phase,
        wallClockMs: report?.resources.wallClockMs ?? null,
        calls: report?.totals.callCount ?? null,
        costUsd: report?.totals.costUsd ?? null,
        models:
          report?.calls.map(
            ({ model, provider, step, outcome, durationMs, costUsd }) => ({
              model,
              provider,
              step,
              outcome,
              durationMs,
              costUsd,
            }),
          ) ?? [],
      })),
    }),
  );
}
