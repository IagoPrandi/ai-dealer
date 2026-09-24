import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { validateJevPipelineCorpus } from "../src/jevPipelineEvaluation.js";
import {
  fingerprintJevPipelineCorpusV1,
  JEV_PIPELINE_CORPUS_V1_SHA256,
  JEV_PIPELINE_CORPUS_VERSION,
} from "../src/jevPipelineCorpusV1.js";
import {
  astOutcome,
  buildCandidateQuestions,
  buildLedgerQuestions,
  buildPublicCandidateState,
  buildPublicLedgerState,
  checkClaimLedger,
  deriveCandidateJudgment,
  J8_NOUL_REJECT,
  J8_NOUL_SUPPORT,
  j8TerminalRoute,
  JEV_J8_DECISION_POLICY_VERSION,
  JEV_J8_LEDGER_PROMPT_VERSION,
  JEV_J8_QUESTION_POLICY_SHA256,
  JEV_J8_QUESTION_SET_VERSION,
  JEV_J8_STATE_SCHEMA_VERSION,
  type CandidateJudgment,
  type ClaimLedger,
  type J8TerminalRoute,
  type LedgerDefect,
  type LedgerJudgment,
} from "../src/jevPipelineJ8Evaluation.js";
import {
  JEV_J8_HELDOUT_SHA256,
  JEV_J8_HELDOUT_VERSION,
} from "../src/jevPipelineJ8HeldOut.js";
import { evaluateDeterministicRuleSafety } from "../src/ruleInputSafety.js";
import {
  atomicWriteJson,
  buildVerifiedLedger,
  callJev,
  classifyError,
  DEFAULT_RESOLVED_JEV,
  EvaluationError,
  JEV_REQUESTED_MODEL,
  ledgerModel,
  loadRootEnvironment,
  mapConcurrent,
  oracleJev,
  percentile,
  sum,
  type FailureInjection,
  type JevCall,
  type LlmAttempt,
} from "./jev-pipeline-providers.mjs";
import { heldOutItems, sameOutcome, v1Items, type Candidate, type InterpretationControl, type Item, type ItemClass } from "./jev-pipeline-items.mjs";

// Read-only J8 experiment. It imports no API server, database, wallet,
// payment, proposal, artifact-freeze, or chain-write entry point.

type Suite = "all" | "heldout" | "v1";

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
  suite: Suite;
  verifyFailures: boolean;
}

interface CandidateResult {
  candidateId: string;
  expectedRoute: J8TerminalRoute;
  fixturesPass: boolean;
  isCorrect: boolean;
  jev: JevCall | null;
  judgment: CandidateJudgment | null;
  route: J8TerminalRoute;
  scenarioBrier: { label: boolean; noul: number }[];
}

interface ControlResult {
  deterministicDefects: LedgerDefect[];
  expectedSupported: boolean;
  id: string;
  jev: JevCall | null;
  observedSupported: boolean | null;
  supportedNoul: number | null;
}

interface ItemResult {
  blocked: boolean;
  candidates: CandidateResult[];
  class: ItemClass;
  controls: ControlResult[];
  expectedItemRoute: J8TerminalRoute;
  id: string;
  itemRoute: J8TerminalRoute;
  language: "en" | "pt";
  ledger: ClaimLedger | null;
  ledgerCheck: ReturnType<typeof checkClaimLedger> | null;
  ledgerJevCalls: JevCall[];
  ledgerJudgment: LedgerJudgment | null;
  llmAttempts: LlmAttempt[];
  repeatId: number;
  suite: Item["suite"];
  wallMs: number;
}

// ---------------------------------------------------------------------------
// Options and environment.

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function positiveInteger(name: string, fallback: number): number {
  const raw = argument(name);
  if (raw === null) return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) throw new EvaluationError("CONFIGURATION_ERROR", `--${name} must be a positive integer`);
  return value;
}

function parseOptions(): Options {
  const suite = (argument("suite") ?? "all") as Suite;
  if (!["all", "heldout", "v1"].includes(suite)) throw new EvaluationError("CONFIGURATION_ERROR", "--suite must be all, heldout, or v1");
  const failureInjection = (argument("inject") ?? "none") as FailureInjection;
  return {
    aggregateInput: argument("aggregate"),
    concurrency: positiveInteger("concurrency", 4),
    dryRun: process.argv.includes("--dry-run"),
    expectedResolvedModel: argument("expected-model") ?? DEFAULT_RESOLVED_JEV,
    failureInjection,
    live: process.argv.includes("--live"),
    output: argument("output") ?? "../../docs/jev-pipeline-j8-results.json",
    runs: positiveInteger("runs", 3),
    selfTest: process.argv.includes("--self-test"),
    suite,
    verifyFailures: process.argv.includes("--verify-failures"),
  };
}

// ---------------------------------------------------------------------------
// Items.

// ---------------------------------------------------------------------------
// Providers.

// ---------------------------------------------------------------------------
// Evaluation.

function expectedItemRoute(item: Item): J8TerminalRoute {
  return item.class === "BLOCKED" ? "BLOCK" : item.class === "AMBIGUOUS" ? "CLARIFY" : "ACCEPT";
}

function expectedCandidateRoute(item: Item, candidate: Candidate): J8TerminalRoute {
  if (item.class !== "CLEAR") return expectedItemRoute(item);
  return candidate.isCorrect ? "ACCEPT" : "REJECT_CANDIDATE";
}

async function evaluateItem(item: Item, repeatId: number, options: Options): Promise<ItemResult> {
  const started = performance.now();
  const base = { class: item.class, expectedItemRoute: expectedItemRoute(item), id: item.id, language: item.language, repeatId, suite: item.suite };
  const safety = evaluateDeterministicRuleSafety(item.source);
  if (safety.decision === "unsafe") {
    return {
      ...base,
      blocked: true,
      candidates: item.candidates.map((candidate) => ({ candidateId: candidate.id, expectedRoute: expectedCandidateRoute(item, candidate), fixturesPass: false, isCorrect: candidate.isCorrect, jev: null, judgment: null, route: "BLOCK", scenarioBrier: [] })),
      controls: [],
      itemRoute: "BLOCK",
      ledger: null,
      ledgerCheck: null,
      ledgerJevCalls: [],
      ledgerJudgment: null,
      llmAttempts: [],
      wallMs: Math.round(performance.now() - started),
    };
  }
  const controls = await Promise.all(item.interpretationControls.map((control) => evaluateControl(item, control, options)));
  const generated = await buildVerifiedLedger(item, options);
  const ledgerJudgment = generated.judgment;
  const unavailable = !generated.ledger || ledgerJudgment === null;
  const candidates: CandidateResult[] = [];
  for (const candidate of item.candidates) {
    const outcomes = item.scenarios.map((scenario) => astOutcome(candidate.ast, scenario));
    // Only a clear item has a behavior oracle; without one nothing can pass.
    const fixturesPass = item.class === "CLEAR" && outcomes.every((outcome, index) => sameOutcome(outcome, item.expectedOutcomes[index]!));
    let jev: JevCall | null = null;
    let judgment: CandidateJudgment | null = null;
    const scenarioBrier: { label: boolean; noul: number }[] = [];
    // Shadow: the candidate stage runs for every parsed ledger so Jev-only
    // false supports stay measurable even when an earlier gate already stops.
    if (generated.ledger) {
      const state = buildPublicCandidateState(generated.ledger, candidate.ast, item.scenarios);
      const questions = buildCandidateQuestions(state);
      jev = await callJev(state, questions, options, options.live ? null : oracleJev(questions, (id) => {
        if (id.startsWith("scenario_")) return sameOutcome(outcomes[Number(id.slice(9))]!, item.expectedOutcomes[Number(id.slice(9))]!);
        return candidate.isCorrect;
      }));
      if (jev.response) {
        judgment = deriveCandidateJudgment(questions, jev.response);
        outcomes.forEach((outcome, index) => {
          const answer = jev!.response!.answers[`scenario_${index}`];
          if (answer?.type === "noul") scenarioBrier.push({ label: sameOutcome(outcome, item.expectedOutcomes[index]!), noul: answer.noul });
        });
      }
    }
    candidates.push({
      candidateId: candidate.id,
      expectedRoute: expectedCandidateRoute(item, candidate),
      fixturesPass,
      isCorrect: candidate.isCorrect,
      jev,
      judgment,
      route: j8TerminalRoute({ blocked: false, candidate: judgment, fixturesPass, ledger: ledgerJudgment, unavailable: unavailable || (jev !== null && !jev.response) }),
      scenarioBrier,
    });
  }
  const itemRoute: J8TerminalRoute = unavailable
    ? "UNAVAILABLE"
    : ledgerJudgment!.decision === "CLARIFY"
      ? "CLARIFY"
      : ledgerJudgment!.decision === "LEDGER_VERIFIED"
        ? candidates.some((candidate) => candidate.route === "ACCEPT")
          ? "ACCEPT"
          : item.candidates.length === 0
            ? "REVIEW"
            : "REJECT_CANDIDATE"
        : "REVIEW";
  return {
    ...base,
    blocked: false,
    candidates,
    controls,
    itemRoute,
    ledger: generated.ledger,
    ledgerCheck: generated.check,
    ledgerJevCalls: generated.jevCalls,
    ledgerJudgment,
    llmAttempts: generated.attempts,
    wallMs: Math.round(performance.now() - started),
  };
}

/** P09 analogue: a frozen single-claim interpretation, deterministic check first. */
async function evaluateControl(item: Item, control: InterpretationControl, options: Options): Promise<ControlResult> {
  const ledger: ClaimLedger = { claims: [{ dimension: "win_condition", id: "c1", meaning: control.text, sourceSpan: item.source }], openChoices: [] };
  const check = checkClaimLedger(item.source, ledger);
  if (check.defects.length > 0) {
    return { deterministicDefects: check.defects, expectedSupported: control.expectedSupported, id: control.id, jev: null, observedSupported: false, supportedNoul: null };
  }
  const state = buildPublicLedgerState(item.source, item.language, ledger, check.uncoveredSegments);
  const questions = buildLedgerQuestions(state);
  const jev = await callJev(state, questions, options, options.live ? null : oracleJev(questions, (id) => (id.endsWith("_supported") ? control.expectedSupported : id.endsWith("_vague") ? item.class !== "CLEAR" : false)));
  const answer = jev.response?.answers.claim_0_supported;
  const supportedNoul = answer?.type === "noul" ? answer.noul : null;
  return {
    deterministicDefects: [],
    expectedSupported: control.expectedSupported,
    id: control.id,
    jev,
    observedSupported: supportedNoul === null ? null : supportedNoul >= J8_NOUL_SUPPORT,
    supportedNoul,
  };
}

// ---------------------------------------------------------------------------
// Aggregation.

function jevCalls(result: ItemResult): JevCall[] {
  return [
    ...result.ledgerJevCalls,
    ...result.candidates.flatMap((candidate) => (candidate.jev ? [candidate.jev] : [])),
    ...result.controls.flatMap((control) => (control.jev ? [control.jev] : [])),
  ];
}

function summarizeSlice(results: readonly ItemResult[]) {
  const candidates = results.flatMap((result) => result.candidates.map((candidate) => ({ ...candidate, class: result.class, language: result.language })));
  const wrong = candidates.filter((candidate) => !candidate.isCorrect);
  const clearReferences = candidates.filter((candidate) => candidate.class === "CLEAR" && candidate.isCorrect);
  const clearMutations = candidates.filter((candidate) => candidate.class === "CLEAR" && !candidate.isCorrect);
  const byClass = (cls: ItemClass) => results.filter((result) => result.class === cls);
  const routeCounts = (values: readonly { route?: string; itemRoute?: string }[], key: "itemRoute" | "route") =>
    values.reduce<Record<string, number>>((counts, value) => {
      const route = (value as Record<string, string>)[key]!;
      counts[route] = (counts[route] ?? 0) + 1;
      return counts;
    }, {});
  const brier = candidates.flatMap((candidate) => candidate.scenarioBrier);
  const controls = results.flatMap((result) => result.controls);
  const calls = results.flatMap(jevCalls);
  const llm = results.flatMap((result) => result.llmAttempts);
  return {
    items: results.length,
    itemRouteExact: results.filter((result) => result.itemRoute === result.expectedItemRoute).length,
    itemRoutes: {
      AMBIGUOUS: routeCounts(byClass("AMBIGUOUS"), "itemRoute"),
      BLOCKED: routeCounts(byClass("BLOCKED"), "itemRoute"),
      CLEAR: routeCounts(byClass("CLEAR"), "itemRoute"),
    },
    ledgerDecisions: results.reduce<Record<string, Record<string, number>>>((counts, result) => {
      const key = result.blocked ? "BLOCKED_DETERMINISTIC" : (result.ledgerJudgment?.decision ?? "UNAVAILABLE");
      counts[result.class] ??= {};
      counts[result.class]![key] = (counts[result.class]![key] ?? 0) + 1;
      return counts;
    }, {}),
    safety: {
      terminalFalseAccepts: candidates.filter((candidate) => candidate.route === "ACCEPT" && candidate.expectedRoute !== "ACCEPT").length,
      jevOnlyFalseSupports: wrong.filter((candidate) => candidate.judgment?.decision === "candidate_supported").length,
      jevOnlyFalseSupportIds: results.flatMap((result) => result.candidates.filter((candidate) => !candidate.isCorrect && candidate.judgment?.decision === "candidate_supported").map((candidate) => `${result.id}/${candidate.candidateId}#${result.repeatId}`)),
      ambiguousAutoAccepted: byClass("AMBIGUOUS").filter((result) => result.itemRoute === "ACCEPT").length,
      blockedNotBlocked: byClass("BLOCKED").filter((result) => result.itemRoute !== "BLOCK").length,
      wrongCandidatesEvaluated: wrong.filter((candidate) => candidate.judgment !== null).length,
    },
    clearReference: {
      accepted: clearReferences.filter((candidate) => candidate.route === "ACCEPT").length,
      jevSupported: clearReferences.filter((candidate) => candidate.judgment?.decision === "candidate_supported").length,
      routes: routeCounts(clearReferences, "route"),
      total: clearReferences.length,
    },
    clearMutation: {
      jevDefect: clearMutations.filter((candidate) => candidate.judgment?.decision === "candidate_defect").length,
      routes: routeCounts(clearMutations, "route"),
      total: clearMutations.length,
    },
    interpretationControls: {
      deterministicCatches: controls.filter((control) => !control.expectedSupported && control.deterministicDefects.length > 0).length,
      falseSupports: controls.filter((control) => !control.expectedSupported && control.observedSupported === true).map((control) => control.id),
      faithfulSupported: controls.filter((control) => control.expectedSupported && control.observedSupported === true).length,
      faithfulTotal: controls.filter((control) => control.expectedSupported).length,
      faithfulDeterministicRejects: controls.filter((control) => control.expectedSupported && control.deterministicDefects.length > 0).length,
      unfaithfulTotal: controls.filter((control) => !control.expectedSupported).length,
    },
    scenarioNoul: {
      brier: brier.length ? brier.reduce((total, sample) => total + (sample.noul - (sample.label ? 1 : 0)) ** 2, 0) / brier.length : null,
      samples: brier.length,
      thresholdErrors: brier.filter((sample) => (sample.label ? sample.noul <= J8_NOUL_REJECT : sample.noul >= J8_NOUL_SUPPORT)).length,
    },
    cost: {
      jevCalls: calls.length,
      jevCostUsd: sum(calls.map((call) => call.timing.costUsd)),
      jevFailures: calls.filter((call) => call.errorClass).length,
      llmCalls: llm.length,
      llmCostUsd: sum(llm.map((attempt) => attempt.costUsd)),
      llmUnpricedCalls: llm.filter((attempt) => attempt.costUsd === null && attempt.errorClass === null).length,
      ledgerRevisions: results.filter((result) => result.llmAttempts.length > 1).length,
      ledgerRevisionsByJev: results.filter((result) => result.ledgerJevCalls.length > 1).length,
    },
    speed: {
      itemWallP50Ms: percentile(results.filter((result) => !result.blocked).map((result) => result.wallMs), 50),
      itemWallP95Ms: percentile(results.filter((result) => !result.blocked).map((result) => result.wallMs), 95),
      jevProviderP50Ms: percentile(calls.flatMap((call) => (call.timing.providerMs === null ? [] : [call.timing.providerMs])), 50),
      jevProviderP95Ms: percentile(calls.flatMap((call) => (call.timing.providerMs === null ? [] : [call.timing.providerMs])), 95),
      llmProviderP50Ms: percentile(llm.map((attempt) => attempt.providerMs), 50),
      llmProviderP95Ms: percentile(llm.map((attempt) => attempt.providerMs), 95),
    },
  };
}

function summarize(results: readonly ItemResult[]) {
  const slices: Record<string, ItemResult[]> = {
    all: [...results],
    heldout: results.filter((result) => result.suite === "heldout"),
    heldoutEn: results.filter((result) => result.suite === "heldout" && result.language === "en"),
    heldoutPt: results.filter((result) => result.suite === "heldout" && result.language === "pt"),
    v1: results.filter((result) => result.suite === "v1"),
    v1En: results.filter((result) => result.suite === "v1" && result.language === "en"),
    v1Pt: results.filter((result) => result.suite === "v1" && result.language === "pt"),
  };
  const stable = new Map<string, Set<string>>();
  for (const result of results) {
    const key = `${result.suite}/${result.id}`;
    if (!stable.has(key)) stable.set(key, new Set());
    stable.get(key)!.add(`${result.itemRoute}|${result.candidates.map((candidate) => candidate.route).join(",")}`);
  }
  return {
    slices: Object.fromEntries(Object.entries(slices).filter(([, value]) => value.length > 0).map(([key, value]) => [key, summarizeSlice(value)])),
    unstableItems: [...stable.entries()].filter(([, routes]) => routes.size > 1).map(([key]) => key),
  };
}

// ---------------------------------------------------------------------------
// Entry points.

async function loadItems(suite: Suite): Promise<Item[]> {
  validateJevPipelineCorpus();
  if (fingerprintJevPipelineCorpusV1() !== JEV_PIPELINE_CORPUS_V1_SHA256) throw new EvaluationError("CORPUS_DRIFT", "The pinned corpus fingerprint changed");
  const items = [...(suite === "heldout" ? [] : v1Items()), ...(suite === "v1" ? [] : await heldOutItems())];
  for (const item of items) {
    for (const candidate of item.candidates) {
      if (item.class === "CLEAR" && item.scenarios.length === 0) throw new EvaluationError("FIXTURE_ERROR", `${item.id} has a clear candidate but no behavior fixtures`);
      const passes = item.scenarios.every((scenario, index) => sameOutcome(astOutcome(candidate.ast, scenario), item.expectedOutcomes[index]!));
      if (item.class === "CLEAR" && candidate.isCorrect && !passes) throw new EvaluationError("FIXTURE_ERROR", `${item.id}/${candidate.id} fails its own reference fixtures`);
    }
  }
  return items;
}

function method(options: Options, items: readonly Item[], startedAt: string) {
  return {
    corpus: { heldoutHash: JEV_J8_HELDOUT_SHA256, heldoutVersion: JEV_J8_HELDOUT_VERSION, v1Hash: JEV_PIPELINE_CORPUS_V1_SHA256, v1Version: JEV_PIPELINE_CORPUS_VERSION },
    decisionPolicyVersion: JEV_J8_DECISION_POLICY_VERSION,
    expectedResolvedJevModel: options.live ? options.expectedResolvedModel : "self-test-jev-j8-oracle-v1",
    ledgerModel: options.live ? ledgerModel() : "self-test-ledger-oracle-v1",
    ledgerPromptVersion: JEV_J8_LEDGER_PROMPT_VERSION,
    mode: options.live ? "live" : "self-test",
    noProductionWrites: "No API server, database, wallet, payment, proposal, artifact-freeze, or chain-write entry point is imported.",
    questionPolicyHash: JEV_J8_QUESTION_POLICY_SHA256,
    questionSetVersion: JEV_J8_QUESTION_SET_VERSION,
    requestedJevModel: JEV_REQUESTED_MODEL,
    runs: options.runs,
    sourceRevision: process.env.GITHUB_SHA?.trim() || "dirty-worktree-disclosed",
    startedAt,
    stateSchemaVersion: JEV_J8_STATE_SCHEMA_VERSION,
    suite: options.suite,
    thresholds: { reject: J8_NOUL_REJECT, support: J8_NOUL_SUPPORT },
    itemCount: items.length,
    v1Disclosure: "Corpus v1 was used while designing J8, so its rows are regression evidence only; held-out rows were frozen before the first J8 live call.",
  };
}

async function runExperiment(options: Options) {
  if (options.live) loadRootEnvironment();
  const items = await loadItems(options.suite);
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const tasks = Array.from({ length: options.runs }, (_, index) => {
    const ordered = index % 2 === 0 ? items : [...items].reverse();
    return ordered.map((item) => ({ item, repeatId: index + 1 }));
  }).flat();
  const results = await mapConcurrent(tasks, options.concurrency, ({ item, repeatId }) => evaluateItem(item, repeatId, options));
  const report = {
    experimentId: `jev-j8-${startedAt.replace(/[:.]/gu, "-")}`,
    generatedAt: new Date().toISOString(),
    method: method(options, items, startedAt),
    results,
    summary: { ...summarize(results), endToEndWallClockMs: Math.round(performance.now() - wallStarted) },
  };
  atomicWriteJson(options.output, report, options.failureInjection);
  return report;
}

async function verifyFailures(options: Options): Promise<void> {
  const items = await loadItems("v1");
  const sample = items.find((item) => item.id === "CLR-01")!;
  const cases: FailureInjection[] = ["jev_timeout", "jev_malformed", "llm_malformed"];
  const observed: Record<string, unknown> = {};
  for (const failureInjection of cases) {
    const result = await evaluateItem(sample, 1, { ...options, failureInjection, live: false });
    const calls = jevCalls(result);
    observed[failureInjection] = { itemRoute: result.itemRoute, jevErrors: calls.map((call) => call.errorClass), ledgerDefects: result.llmAttempts.map((attempt) => attempt.defects.map((defect) => defect.code)) };
    if (result.itemRoute === "ACCEPT" || result.candidates.some((candidate) => candidate.route === "ACCEPT")) {
      throw new EvaluationError("FAILURE_NOT_CONTAINED", `${failureInjection} produced an ACCEPT route`);
    }
  }
  if (!(observed.jev_timeout as { jevErrors: string[] }).jevErrors.every((code) => code === "SERVICE_TIMEOUT")) throw new EvaluationError("FAILURE_NOT_CONTAINED", "timeout was not classified as SERVICE_TIMEOUT");
  if (!(observed.jev_malformed as { jevErrors: string[] }).jevErrors.every((code) => code === "SCHEMA_ERROR")) throw new EvaluationError("FAILURE_NOT_CONTAINED", "malformed response was not classified as SCHEMA_ERROR");
  try {
    atomicWriteJson(options.output, {}, "storage_failure");
    throw new EvaluationError("FAILURE_NOT_CONTAINED", "storage failure was not raised");
  } catch (error) {
    if (!(error instanceof EvaluationError) || error.code !== "STORAGE_FAILURE") throw error;
    observed.storage_failure = "STORAGE_FAILURE";
  }
  console.log(JSON.stringify({ failureVerification: observed, passed: true }, null, 2));
}

function reaggregate(options: Options): void {
  const input = JSON.parse(readFileSync(resolve(options.aggregateInput!), "utf8")) as { results: ItemResult[]; summary: { endToEndWallClockMs: number } };
  const report = { ...input, summary: { ...summarize(input.results), endToEndWallClockMs: input.summary.endToEndWallClockMs } };
  atomicWriteJson(options.output, report, "none");
  console.log(JSON.stringify(report.summary, null, 2));
}

async function main(): Promise<void> {
  const options = parseOptions();
  if (options.dryRun) {
    const items = await loadItems(options.suite);
    console.log(JSON.stringify({ items: items.map((item) => ({ candidates: item.candidates.length, class: item.class, controls: item.interpretationControls.length, id: item.id, scenarios: item.scenarios.length, suite: item.suite })), method: method({ ...options, live: false }, items, new Date().toISOString()) }, null, 2));
    return;
  }
  if (options.verifyFailures) return verifyFailures(options);
  if (options.aggregateInput) return reaggregate(options);
  if (!options.live && !options.selfTest) throw new EvaluationError("CONFIGURATION_ERROR", "Choose --dry-run, --self-test, --verify-failures, --aggregate=<file>, or --live");
  if (options.selfTest && options.suite === "all") options.suite = "v1";
  const report = await runExperiment(options);
  console.log(JSON.stringify(report.summary, null, 2));
}

main().catch((error: unknown) => {
  const failure = classifyError(error);
  console.error(`${failure.code}: ${failure.message}`);
  process.exitCode = 1;
});
