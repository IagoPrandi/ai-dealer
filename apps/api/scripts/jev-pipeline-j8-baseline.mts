import { performance } from "node:perf_hooks";

import { ruleAstSchema, type RuleAst } from "@tyche/rule-compiler";

import { adversarialItems, freshItems, heldOutItems, matchesReference, v1Items, type Item } from "./jev-pipeline-items.mjs";
import { atomicWriteJson, percentile, sum } from "./jev-pipeline-providers.mjs";
import {
  createRuleInterpretation,
  createRulePreflight,
  readApprovedRuleInterpretation,
} from "../src/index.js";
import { getDealerRuntime } from "../src/lifespan.js";
import { RuleAgentError } from "../src/llm.js";
import { getAiUsageRuns, type AiRunUsageReport } from "../src/usage.js";

// Production measurement harness for the rule pipeline (P6): the real
// two-phase player flow — interpret, approve, compile — over the frozen JEV
// corpora. It never submits, persists, pays for, or freezes a proposal. Hidden
// reference ASTs score an accepted artifact after the fact; no stage sees them.
// Runs are sequential: usage scopes do not nest, so overlapping runs could not
// be attributed, and overlap would inflate the latency being measured.
//
//   node --import tsx scripts/jev-pipeline-j8-baseline.mts --suite=all --runs=1 --output=../../docs/<file>.json
//   options: --suite=v1|heldout|fresh|adversarial|all  --runs=N  --ids=A,B

type Route = "ACCEPT" | "BLOCK" | "CLARIFY" | "FALSE_ACCEPT" | "REVIEW" | "UNAVAILABLE";

interface Row {
  artifactCheck: string | null;
  calls: number;
  /** Questions the player would be asked at interpret time. */
  clarificationQuestions: string[];
  class: Item["class"];
  costUsd: number;
  error: string | null;
  /**
   * The hidden reference never reads the draw. The interpreter must then ask
   * the player to confirm that the draw is ignored (PRD semantic-impact gate),
   * so CLARIFY is the product's intended first route, not a lost rule.
   */
  guessOnly: boolean;
  id: string;
  interpretMs: number;
  /** Which interpret-phase signal asked: the interpreter, the ledger, or both. */
  interpretClarifier: "both" | "interpreter" | "ledger" | null;
  ledger: string | null;
  /** How the compile phase confirmed the ledger: the attestation or Jev again. */
  ledgerVerifiedBy: string | null;
  reasonCodes: string[];
  repeatId: number;
  route: Route;
  suite: Item["suite"];
  unpricedCalls: number;
  wallMs: number;
}

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

const BLOCK_CODES = new Set(["RULE_EXTERNAL_DEPENDENCY", "RULE_INVALID_CONSTRAINT", "RULE_PROMPT_INJECTION", "RULE_SEMANTIC_UNSAFE"]);
const UNAVAILABLE_CODES = new Set(["RULE_SAFETY_UNAVAILABLE", "RULE_SEMANTIC_CHECK_UNAVAILABLE"]);

function routeForError(error: unknown): Route {
  if (error instanceof RuleAgentError) return "UNAVAILABLE";
  const code = error instanceof Error ? error.message : String(error);
  if (BLOCK_CODES.has(code)) return "BLOCK";
  if (UNAVAILABLE_CODES.has(code)) return "UNAVAILABLE";
  if (code === "RULE_SAFETY_UNRESOLVED") return "REVIEW";
  return "UNAVAILABLE";
}

async function runOne(item: Item, repeatId: number): Promise<Row> {
  const started = performance.now();
  const reports: AiRunUsageReport[] = [];
  const collect = () => {
    const report = getAiUsageRuns(1)[0];
    if (report && !reports.includes(report)) reports.push(report);
  };
  let route: Route;
  let error: string | null = null;
  let reasonCodes: string[] = [];
  let interpretMs = 0;
  let ledger: string | null = null;
  let interpretClarifier: Row["interpretClarifier"] = null;
  let artifactCheck: string | null = null;
  let clarificationQuestions: string[] = [];
  let ledgerVerifiedBy: string | null = null;
  try {
    const interpretation = await createRuleInterpretation(item.source);
    collect();
    interpretMs = Math.round(performance.now() - started);
    ledger = interpretation.semanticChecks.ledger;
    if (interpretation.needsClarification) {
      const byLedger = ledger !== "LEDGER_VERIFIED";
      interpretClarifier = interpretation.interpreterNeedsClarification ? (byLedger ? "both" : "interpreter") : "ledger";
      clarificationQuestions = [...interpretation.clarificationQuestions];
      route = interpretation.clarificationQuestions.length > 0 ? "CLARIFY" : "REVIEW";
    } else {
      const approved = readApprovedRuleInterpretation(interpretation, item.source);
      if (!approved) throw new Error("INTERPRETATION_NOT_APPROVABLE");
      const preflight = await createRulePreflight(item.source, () => undefined, undefined, approved);
      collect();
      reasonCodes = [...preflight.reasonCodes];
      ledger = preflight.semanticChecks?.ledger ?? null;
      artifactCheck = preflight.semanticChecks?.artifact ?? null;
      ledgerVerifiedBy = preflight.ledgerVerifiedBy ?? null;
      if (preflight.decision === "VALID" && preflight.ast) {
        const ast: RuleAst = ruleAstSchema.parse(preflight.ast);
        const correct = item.class === "CLEAR" && (await matchesReference(item, ast)) === true;
        route = correct ? "ACCEPT" : "FALSE_ACCEPT";
      } else if (reasonCodes.includes("AMBIGUOUS_RULE")) {
        route = "CLARIFY";
      } else if (reasonCodes.some((code) => code === "COMPILER_UNAVAILABLE" || code === "SEMANTIC_CHECK_UNAVAILABLE")) {
        route = "UNAVAILABLE";
      } else {
        route = "REVIEW";
      }
    }
  } catch (caught) {
    collect();
    error = caught instanceof Error ? caught.message : String(caught);
    route = routeForError(caught);
  }
  return {
    artifactCheck,
    calls: sum(reports.map((report) => report.totals.callCount)),
    clarificationQuestions,
    class: item.class,
    costUsd: sum(reports.map((report) => report.totals.costUsd)),
    error,
    guessOnly: item.class === "CLEAR" && item.candidates.some((candidate) => candidate.isCorrect && !JSON.stringify(candidate.ast).includes('"draw"')),
    id: item.id,
    interpretClarifier,
    interpretMs,
    ledger,
    ledgerVerifiedBy,
    reasonCodes,
    repeatId,
    route,
    suite: item.suite,
    unpricedCalls: sum(reports.map((report) => report.calls.filter((call) => call.costUsd === null).length)),
    wallMs: Math.round(performance.now() - started),
  };
}

function summarize(rows: readonly Row[]) {
  const byClass = (cls: Item["class"]) => rows.filter((row) => row.class === cls);
  const routes = (values: readonly Row[]) =>
    values.reduce<Record<string, number>>((counts, row) => {
      counts[row.route] = (counts[row.route] ?? 0) + 1;
      return counts;
    }, {});
  const clear = byClass("CLEAR");
  const drawDependent = clear.filter((row) => !row.guessOnly);
  const guessOnly = clear.filter((row) => row.guessOnly);
  const priced = (values: readonly Row[]) => (values.length ? sum(values.map((row) => row.costUsd)) / values.length : null);
  return {
    ambiguousRoutes: routes(byClass("AMBIGUOUS")),
    blockedRoutes: routes(byClass("BLOCKED")),
    clearCorrectAccepts: clear.filter((row) => row.route === "ACCEPT").length,
    clearRoutes: routes(clear),
    clearTotal: clear.length,
    // Clear rules that read the draw: the recall the pipeline alone decides.
    clearDrawDependentAccepts: drawDependent.filter((row) => row.route === "ACCEPT").length,
    clearDrawDependentTotal: drawDependent.length,
    // Guess-only clear rules: CLARIFY (scope confirmation) or ACCEPT are both correct routes.
    clearGuessOnlyRoutes: routes(guessOnly),
    costUsdMeanClear: priced(clear),
    costUsdMeanAll: priced(rows),
    costUsdTotal: sum(rows.map((row) => row.costUsd)),
    falseAccepts: rows.filter((row) => row.route === "FALSE_ACCEPT").map((row) => `${row.id}#${row.repeatId}`),
    items: rows.length,
    unpricedCalls: sum(rows.map((row) => row.unpricedCalls)),
    wallP50MsAmbiguous: percentile(byClass("AMBIGUOUS").map((row) => row.wallMs), 50),
    wallP50MsClear: percentile(clear.map((row) => row.wallMs), 50),
    wallP95MsClear: percentile(clear.map((row) => row.wallMs), 95),
    wallMaxMsClear: clear.length ? Math.max(...clear.map((row) => row.wallMs)) : null,
  };
}

const runs = Number(argument("runs") ?? 1);
const onlyIds = argument("ids")?.split(",") ?? null;
const suite = argument("suite") ?? "v1";
const wanted = (name: string) => suite === "all" || suite === name;
const items = [
  ...(wanted("v1") ? v1Items() : []),
  ...(wanted("heldout") ? await heldOutItems() : []),
  ...(wanted("fresh") ? freshItems() : []),
  ...(wanted("adversarial") ? adversarialItems() : []),
].filter((item) => !onlyIds || onlyIds.includes(item.id));
const output = argument("output") ?? "../../output/rule-pipeline-measurement.json";
const runtime = getDealerRuntime();
const startedAt = new Date().toISOString();
const wallStarted = performance.now();
const rows: Row[] = [];
for (let repeatId = 1; repeatId <= runs; repeatId += 1) {
  for (const item of repeatId % 2 === 1 ? items : [...items].reverse()) {
    const row = await runOne(item, repeatId);
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
const suites = [...new Set(rows.map((row) => row.suite))];
const report = {
  generatedAt: new Date().toISOString(),
  method: {
    artifactVeto: runtime.artifactVeto,
    compilers: { A: runtime.compiler.model, B: runtime.compilerSecondary.model },
    flow: "createRuleInterpretation -> readApprovedRuleInterpretation -> createRulePreflight (production pipeline); read-only.",
    interpreter: runtime.agent.model,
    jev: { expected: runtime.jev.expectedModel, requested: runtime.jev.model },
    runs,
    scoring: "An accepted AST is correct only if it matches the hidden reference on the curated scenarios and all 200 seeded random scenarios. Any accept of a non-CLEAR item is a false accept.",
    sourceRevision: process.env.GITHUB_SHA?.trim() || "dirty-worktree-disclosed",
    startedAt,
    suite,
  },
  rows,
  summary: {
    all: summarize(rows),
    bySuite: Object.fromEntries(suites.map((name) => [name, summarize(rows.filter((row) => row.suite === name))])),
    endToEndWallClockMs: Math.round(performance.now() - wallStarted),
  },
};
atomicWriteJson(output, report, "none");
console.log(JSON.stringify(report.summary, null, 2));
