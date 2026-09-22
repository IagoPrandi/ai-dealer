import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { ruleAstSchema, type RuleAst } from "@tyche/rule-compiler";

import { freshItems, heldOutItems, matchesReference, v1Items, type Item } from "./jev-pipeline-items.mjs";
import {
  createRuleInterpretation,
  createRulePreflight,
  readApprovedRuleInterpretation,
} from "../src/index.js";
import { getAiUsageRuns } from "../src/usage.js";

// Contemporaneous B0: the current two-phase player flow (interpret, then
// preflight on the approved interpretation) over corpus v1 and/or the held-out set.
// It never submits, persists, pays for, or freezes a proposal. The frozen
// behavior fixtures score the returned AST; they are not shown to any model.

interface BaselineRow {
  ast: unknown;
  calls: number;
  class: string;
  error: string | null;
  fixturesPass: boolean | null;
  id: string;
  providerCostUsd: number;
  reasonCodes: string[];
  repeatId: number;
  route: "ACCEPT" | "BLOCK" | "CLARIFY" | "INVALID" | "REJECT_WRONG_AST" | "UNAVAILABLE";
  unpricedCalls: number;
  wallMs: number;
}

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function usageTotals(reports: ReturnType<typeof getAiUsageRuns>) {
  return {
    calls: reports.reduce((total, report) => total + report.totals.callCount, 0),
    providerCostUsd: reports.reduce((total, report) => total + (report.totals.costUsd ?? 0), 0),
    unpricedCalls: reports.reduce((total, report) => total + report.calls.filter((call) => call.costUsd === null).length, 0),
  };
}

async function runOne(item: Item, repeatId: number): Promise<BaselineRow> {
  const started = performance.now();
  const reports: ReturnType<typeof getAiUsageRuns> = [];
  let route: BaselineRow["route"] = "UNAVAILABLE";
  let fixturesPass: boolean | null = null;
  let error: string | null = null;
  let reasonCodes: string[] = [];
  let returnedAst: unknown = null;
  try {
    const interpretation = await createRuleInterpretation(item.source);
    reports.push(...getAiUsageRuns(1));
    if (interpretation.needsClarification) {
      route = "CLARIFY";
    } else {
      const approved = readApprovedRuleInterpretation(interpretation, item.source);
      if (!approved) throw new Error("Interpretation could not be approved");
      const preflight = await createRulePreflight(item.source, () => undefined, undefined, approved);
      reports.push(...getAiUsageRuns(1));
      reasonCodes = [...(preflight.reasonCodes ?? [])];
      if (preflight.needsClarification) route = "CLARIFY";
      else if (preflight.decision !== "VALID" || !preflight.ast) route = reasonCodes.some((code) => /BLOCK|PROHIBITED|EXTERNAL|INJECTION|PREVENTED/u.test(code)) ? "BLOCK" : "INVALID";
      else {
        returnedAst = preflight.ast;
        const ast: RuleAst = ruleAstSchema.parse(preflight.ast);
        fixturesPass = item.class === "CLEAR" ? (await matchesReference(item, ast)) === true : false;
        route = fixturesPass ? "ACCEPT" : "REJECT_WRONG_AST";
      }
    }
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
    if (/block|prohibit|external|inject|prevent/iu.test(error)) route = "BLOCK";
  }
  return { ...usageTotals(reports), ast: returnedAst, class: item.class, error, fixturesPass, id: item.id, reasonCodes, repeatId, route, wallMs: Math.round(performance.now() - started) };
}

const runs = Number(argument("runs") ?? 1);
const onlyIds = argument("ids")?.split(",") ?? null;
const suite = argument("suite") ?? "v1";
const wanted = (name: string) => suite === "all" || suite === name;
const items = [...(wanted("v1") ? v1Items() : []), ...(wanted("heldout") ? await heldOutItems() : []), ...(wanted("fresh") ? freshItems() : [])];
const output = resolve(argument("output") ?? "../../docs/jev-pipeline-j8-baseline-results.json");
const rows: BaselineRow[] = [];
const wallStarted = performance.now();
for (let repeatId = 1; repeatId <= runs; repeatId += 1) {
  for (const item of items.filter((entry) => !onlyIds || onlyIds.includes(entry.id))) {
    const row = await runOne(item, repeatId);
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
writeFileSync(
  output,
  `${JSON.stringify({ generatedAt: new Date().toISOString(), suite, method: "Current two-phase pipeline (createRuleInterpretation -> createRulePreflight) over the selected suite; read-only.", rows, runs, wallMs: Math.round(performance.now() - wallStarted) }, null, 2)}\n`,
  "utf8",
);
