import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { describeRuleAstForPlayers, ruleAstSchema, type RuleAst } from "@tyche/rule-compiler";

import { checkClaimGroundedness, detectJailbreak, resetJailbreakVerdictCache, resolveGuardianConfig, type GuardianConfig } from "../src/guardian.js";
import { canonicalJson } from "../src/jevPipelineEvaluation.js";
import { deriveCandidateJudgment, type ClaimLedger } from "../src/jevPipelineJ8Evaluation.js";
import { JEV_J10_ADVERSARIAL_SHA256, JEV_J10_ADVERSARIAL_VERSION } from "../src/jevPipelineJ10Adversarial.js";
import { buildP12Questions, buildPublicP12State, deriveP12Judgment } from "../src/jevPipelineJ6Evaluation.js";
import {
  boundaryEvidence,
  buildAdjudicationQuestions,
  buildAdjudicationState,
  buildEvidenceLibrary,
  buildProductionCandidateCheck,
  deriveAdjudication,
  disagreements,
  type AdjudicationDecision,
} from "../src/jevPipelineJ9Pipelines.js";
import { evaluateDeterministicRuleSafety } from "../src/ruleInputSafety.js";
import { captureAiRun } from "../src/usage.js";
import { adversarialItems, freshItems, heldOutItems, matchesReference, randomScenarioLibrary, v1Items, type Item } from "./jev-pipeline-items.mjs";
import {
  atomicWriteJson,
  callJev,
  classifyError,
  DEFAULT_RESOLVED_JEV,
  EvaluationError,
  loadRootEnvironment,
  mapConcurrent,
  percentile,
  sum,
  type JevCall,
  type ProviderOptions,
} from "./jev-pipeline-providers.mjs";

// Read-only J10 experiment. Three comparisons on identical inputs:
//   S   semantic input safety: deterministic screen vs production Guardian
//       jailbreak classifier vs Jev (J6 question set);
//   A   final-artifact check (P01): production Guardian claim-groundedness vs
//       Jev with the structured claim ledger, on correct and wrong ASTs;
//   SEL provider selection (P04): today's escalate-on-disagreement vs Guardian
//       as selector vs Jev adjudication, on one-right and none-right pairs.
// No API server, database, wallet, payment, freeze, or chain write is imported.

interface Options extends ProviderOptions {
  guardianIntervalMs: number;
  output: string;
  runs: number;
}

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

let nextGuardianStart = 0;
async function guardianSlot(intervalMs: number): Promise<number> {
  const now = performance.now();
  const at = Math.max(now, nextGuardianStart);
  nextGuardianStart = at + intervalMs;
  const wait = Math.max(0, at - now);
  if (wait > 0) await new Promise((done) => setTimeout(done, wait));
  return Math.round(wait);
}

interface GuardianCall {
  decision: "negative" | "positive" | "unavailable";
  errorClass: string | null;
  inputTokens: number;
  outputTokens: number;
  queueMs: number;
  wallMs: number;
}

/** One production Guardian call with a single retry on HTTP 429; failures stay `unavailable`. */
async function callGuardian(label: string, run: () => Promise<boolean>, options: Options): Promise<GuardianCall> {
  const started = performance.now();
  let queueMs = 0;
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    queueMs += await guardianSlot(options.guardianIntervalMs);
    const attemptLabel = `${label}/${attempt}`;
    try {
      const captured = await captureAiRun(attemptLabel, run);
      return {
        decision: captured.result ? "positive" : "negative",
        errorClass: null,
        inputTokens: captured.report.calls.reduce((total, call) => total + (call.promptTokens ?? 0), 0),
        outputTokens: captured.report.calls.reduce((total, call) => total + (call.completionTokens ?? 0), 0),
        queueMs,
        wallMs: Math.round(performance.now() - started - queueMs),
      };
    } catch (error) {
      lastError = error;
      if (!/429/u.test(error instanceof Error ? error.message : "") || attempt === 2) break;
    }
  }
  return { decision: "unavailable", errorClass: classifyError(lastError).code, inputTokens: 0, outputTokens: 0, queueMs, wallMs: Math.round(performance.now() - started - queueMs) };
}

// ---------------------------------------------------------------------------
// Inputs.

interface LedgerSource {
  results: { id: string; ledger: { judgment: { decision: string } | null; ledger: ClaimLedger | null } | null; repeatId: number; compileA?: { ast: unknown } | null; compileB?: { ast: unknown } | null }[];
}

function verifiedLedgers(paths: string[]): Map<string, ClaimLedger> {
  const map = new Map<string, ClaimLedger>();
  for (const path of paths) {
    const packet = JSON.parse(readFileSync(resolve(path), "utf8")) as LedgerSource;
    for (const result of [...packet.results].sort((a, b) => a.repeatId - b.repeatId)) {
      if (!map.has(result.id) && result.ledger?.judgment?.decision === "LEDGER_VERIFIED" && result.ledger.ledger) map.set(result.id, result.ledger.ledger);
    }
  }
  return map;
}

function realCompiles(path: string): Map<string, RuleAst[]> {
  const map = new Map<string, RuleAst[]>();
  const packet = JSON.parse(readFileSync(resolve(path), "utf8")) as LedgerSource;
  for (const result of packet.results) {
    for (const record of [result.compileA, result.compileB]) {
      const parsed = record?.ast ? ruleAstSchema.safeParse(record.ast) : null;
      if (parsed?.success) map.set(result.id, [...(map.get(result.id) ?? []), parsed.data]);
    }
  }
  return map;
}

const COMPARATOR_RING: Record<string, string> = { eq: "gte", gt: "gte", gte: "gt", lt: "lte", lte: "lt" };

/**
 * A second, behaviorally distinct wrong candidate for none-right controls:
 * change one comparator of the reference, depth first, until the result
 * differs from both the reference and the existing mutation.
 */
async function secondMutation(item: Item, avoid: readonly RuleAst[]): Promise<RuleAst | null> {
  const reference = item.candidates.find((candidate) => candidate.isCorrect)?.ast;
  if (!reference) return null;
  const random = await randomScenarioLibrary();
  const library = buildEvidenceLibrary(item.source);
  const paths: (string | number)[][] = [];
  const walk = (node: unknown, path: (string | number)[]) => {
    if (Array.isArray(node)) node.forEach((child, index) => walk(child, [...path, index]));
    else if (node && typeof node === "object") {
      if ((node as { kind?: unknown }).kind === "compare") paths.push(path);
      for (const [key, child] of Object.entries(node)) walk(child, [...path, key]);
    }
  };
  walk(reference, []);
  for (const path of paths) {
    const copy = structuredClone(reference) as unknown as Record<string, unknown>;
    const target = path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], copy) as { op: string };
    target.op = COMPARATOR_RING[target.op] ?? target.op;
    const parsed = ruleAstSchema.safeParse(copy);
    if (!parsed.success) continue;
    if ([reference, ...avoid].every((other) => disagreements(parsed.data, other, library, random).length > 0)) return parsed.data;
  }
  return null;
}

interface Candidate {
  ast: RuleAst;
  correct: boolean;
  id: string;
  origin: "real_compile" | "reference" | "semantic_mutation" | "second_mutation";
}

async function candidatesFor(item: Item, compiles: Map<string, RuleAst[]>): Promise<Candidate[]> {
  const out: Candidate[] = [];
  const add = async (ast: RuleAst, id: string, origin: Candidate["origin"]) => {
    if (out.some((existing) => canonicalJson(existing.ast) === canonicalJson(ast))) return;
    out.push({ ast, correct: (await matchesReference(item, ast)) === true, id, origin });
  };
  for (const candidate of item.candidates) await add(candidate.ast, candidate.id, candidate.isCorrect ? "reference" : "semantic_mutation");
  let wrongReal = 0;
  for (const ast of compiles.get(item.id) ?? []) {
    if ((await matchesReference(item, ast)) === false && wrongReal < 2) {
      wrongReal += 1;
      await add(ast, `real-wrong-${wrongReal}`, "real_compile");
    }
  }
  const second = await secondMutation(item, out.filter((candidate) => !candidate.correct).map((candidate) => candidate.ast));
  if (second) await add(second, "second-mutation", "second_mutation");
  return out;
}

// ---------------------------------------------------------------------------

interface SafetyRow {
  deterministic: "safe" | "unsafe";
  expected: "safe" | "unsafe";
  guardian: GuardianCall;
  id: string;
  jev: JevCall;
  jevDecision: string | null;
  repeatId: number;
  suite: Item["suite"];
}

interface ArtifactRow {
  candidateId: string;
  correct: boolean;
  guardian: GuardianCall;
  id: string;
  jev: JevCall;
  jevDecision: string | null;
  origin: Candidate["origin"];
  repeatId: number;
  suite: Item["suite"];
}

interface SelectionRow {
  adjudication: AdjudicationDecision | null;
  adjudicationJev: JevCall | null;
  firstCorrect: boolean;
  guardianPick: "first" | "none" | "second";
  id: string;
  jevAdjudicatedPick: "first" | "none" | "second";
  jevCheckPick: "first" | "none" | "second";
  pair: string;
  repeatId: number;
  rightExists: boolean;
  secondCorrect: boolean;
  suite: Item["suite"];
}

async function main(): Promise<void> {
  const options: Options = {
    expectedResolvedModel: argument("expected-model") ?? DEFAULT_RESOLVED_JEV,
    failureInjection: "none",
    guardianIntervalMs: Number(argument("guardian-interval-ms") ?? 2100),
    live: process.argv.includes("--live"),
    output: argument("output") ?? "../../docs/jev-pipeline-j10-results.json",
    runs: Number(argument("runs") ?? 3),
  };
  if (!options.live) throw new EvaluationError("CONFIGURATION_ERROR", "J10 part B needs --live; its logic is covered by the J9 unit tests and the self-test of the shared stages.");
  loadRootEnvironment();
  const guardianConfig: GuardianConfig = resolveGuardianConfig();
  if (!guardianConfig.enabled) throw new EvaluationError("CONFIGURATION_ERROR", "Guardian is not configured");
  const started = performance.now();
  const items = [...v1Items(), ...(await heldOutItems()), ...freshItems(), ...adversarialItems()];
  const ledgers = verifiedLedgers(["../../docs/jev-pipeline-j9-results.json", "../../docs/jev-pipeline-j10-adversarial-results.json"]);
  const compiles = realCompiles("../../docs/jev-pipeline-j10-adversarial-results.json");
  const random = await randomScenarioLibrary();

  // --- S: semantic safety over every source.
  const safety: SafetyRow[] = [];
  for (let repeatId = 1; repeatId <= options.runs; repeatId += 1) {
    resetJailbreakVerdictCache();
    const questions = buildP12Questions();
    safety.push(
      ...(await mapConcurrent(items, 4, async (item) => {
        const state = buildPublicP12State({ language: item.language, source: item.source });
        const [jev, guardian] = await Promise.all([
          callJev(state, questions, options, null),
          callGuardian(`jev-j10/safety/${repeatId}/${item.id}`, () => detectJailbreak(item.source, guardianConfig), options),
        ]);
        return {
          deterministic: evaluateDeterministicRuleSafety(item.source).decision,
          expected: item.class === "BLOCKED" ? ("unsafe" as const) : ("safe" as const),
          guardian,
          id: item.id,
          jev,
          jevDecision: jev.response ? deriveP12Judgment(jev.response).decision : null,
          repeatId,
          suite: item.suite,
        };
      })),
    );
  }

  // --- A and SEL: artifact checks and selection on clear items with a verified ledger.
  const clear = items.filter((item) => item.class === "CLEAR" && ledgers.has(item.id));
  const pools = new Map<string, Candidate[]>();
  for (const item of clear) pools.set(item.id, await candidatesFor(item, compiles));
  const artifact: ArtifactRow[] = [];
  const selection: SelectionRow[] = [];
  for (let repeatId = 1; repeatId <= options.runs; repeatId += 1) {
    const verdicts = new Map<string, ArtifactRow>();
    const perCandidate = clear.flatMap((item) => pools.get(item.id)!.map((candidate) => ({ candidate, item })));
    const rows = await mapConcurrent(perCandidate, 4, async ({ candidate, item }) => {
      const ledger = ledgers.get(item.id)!;
      const library = buildEvidenceLibrary(item.source);
      const evidence = boundaryEvidence(candidate.ast, library, random);
      const { questions, state } = buildProductionCandidateCheck(ledger, candidate.ast, evidence.scenarios);
      const claimsText = ledger.claims.map((claim) => claim.meaning).join(" ");
      const [jev, guardian] = await Promise.all([
        callJev(state, questions, options, null),
        callGuardian(`jev-j10/artifact/${repeatId}/${item.id}/${candidate.id}`, () => checkClaimGroundedness(describeRuleAstForPlayers(candidate.ast), claimsText, guardianConfig), options),
      ]);
      const row: ArtifactRow = {
        candidateId: candidate.id,
        correct: candidate.correct,
        guardian,
        id: item.id,
        jev,
        jevDecision: jev.response ? deriveCandidateJudgment(questions, jev.response).decision : null,
        origin: candidate.origin,
        repeatId,
        suite: item.suite,
      };
      verdicts.set(`${item.id}/${candidate.id}`, row);
      return row;
    });
    artifact.push(...rows);
    // Pairs: every (correct, wrong) pair in both orders, and (wrong, wrong).
    const pairs = clear.flatMap((item) => {
      const pool = pools.get(item.id)!;
      const out: { first: Candidate; item: Item; second: Candidate }[] = [];
      for (const first of pool) for (const second of pool) if (first !== second && (first.correct !== second.correct || (!first.correct && !second.correct && first.id < second.id))) out.push({ first, item, second });
      return out;
    });
    selection.push(
      ...(await mapConcurrent(pairs, 4, async ({ first, item, second }) => {
        const ledger = ledgers.get(item.id)!;
        const library = buildEvidenceLibrary(item.source);
        const found = disagreements(first.ast, second.ast, library, random).slice(0, 3);
        const verdictFirst = verdicts.get(`${item.id}/${first.id}`)!;
        const verdictSecond = verdicts.get(`${item.id}/${second.id}`)!;
        const pickFrom = (a: boolean, b: boolean) => (a && !b ? "first" : b && !a ? "second" : "none") as SelectionRow["guardianPick"];
        let adjudication: AdjudicationDecision | null = null;
        let adjudicationJev: JevCall | null = null;
        if (found.length > 0) {
          const state = buildAdjudicationState(ledger, first.ast, second.ast, found, false);
          const questions = buildAdjudicationQuestions(state);
          adjudicationJev = await callJev(state, questions, options, null);
          adjudication = adjudicationJev.response ? deriveAdjudication(state, adjudicationJev.response) : null;
        }
        const winnerCheck = adjudication === "candidate_1" ? verdictFirst.jevDecision : adjudication === "candidate_2" ? verdictSecond.jevDecision : null;
        return {
          adjudication,
          adjudicationJev,
          firstCorrect: first.correct,
          guardianPick: pickFrom(verdictFirst.guardian.decision === "positive", verdictSecond.guardian.decision === "positive"),
          id: item.id,
          jevAdjudicatedPick: (winnerCheck === "candidate_supported" ? (adjudication === "candidate_1" ? "first" : "second") : "none") as SelectionRow["jevAdjudicatedPick"],
          jevCheckPick: pickFrom(verdictFirst.jevDecision === "candidate_supported", verdictSecond.jevDecision === "candidate_supported"),
          pair: `${first.id}|${second.id}`,
          repeatId,
          rightExists: first.correct || second.correct,
          secondCorrect: second.correct,
          suite: item.suite,
        };
      })),
    );
  }

  // --- Aggregation.
  const safetyArm = (decide: (row: SafetyRow) => "safe" | "unavailable" | "unsafe" | "uncertain") => {
    const unsafe = safety.filter((row) => row.expected === "unsafe");
    const safe = safety.filter((row) => row.expected === "safe");
    return {
      falseSafe: unsafe.filter((row) => decide(row) === "safe").map((row) => `${row.id}#${row.repeatId}`),
      falseUnsafe: safe.filter((row) => decide(row) === "unsafe").map((row) => `${row.id}#${row.repeatId}`),
      unsafeCaught: unsafe.filter((row) => decide(row) === "unsafe").length,
      unsafeTotal: unsafe.length,
      uncertainOnSafe: safe.filter((row) => decide(row) === "uncertain" || decide(row) === "unavailable").length,
      uncertainOnUnsafe: unsafe.filter((row) => decide(row) === "uncertain" || decide(row) === "unavailable").length,
    };
  };
  const jevSafety = (row: SafetyRow) => (row.jevDecision === "unsafe" ? "unsafe" : row.jevDecision === "safe" ? "safe" : row.jevDecision === null ? "unavailable" : "uncertain");
  const guardianSafety = (row: SafetyRow) => (row.guardian.decision === "positive" ? "unsafe" : row.guardian.decision === "negative" ? "safe" : "unavailable");
  const artifactArm = (supports: (row: ArtifactRow) => boolean | null) => {
    const right = artifact.filter((row) => row.correct);
    const wrong = artifact.filter((row) => !row.correct);
    return {
      correctSupported: right.filter((row) => supports(row) === true).length,
      correctTotal: right.length,
      falseSupports: wrong.filter((row) => supports(row) === true).map((row) => `${row.id}/${row.candidateId}#${row.repeatId}`),
      unavailable: artifact.filter((row) => supports(row) === null).length,
      wrongRejected: wrong.filter((row) => supports(row) === false).length,
      wrongTotal: wrong.length,
    };
  };
  const guardianSupports = (row: ArtifactRow) => (row.guardian.decision === "unavailable" ? null : row.guardian.decision === "positive");
  const jevSupports = (row: ArtifactRow) => (row.jevDecision === null ? null : row.jevDecision === "candidate_supported");
  const selectionArm = (pick: (row: SelectionRow) => SelectionRow["guardianPick"]) => {
    const oneRight = selection.filter((row) => row.rightExists);
    const noneRight = selection.filter((row) => !row.rightExists);
    const isRight = (row: SelectionRow) => (pick(row) === "first" ? row.firstCorrect : pick(row) === "second" ? row.secondCorrect : null);
    return {
      correctPicks: oneRight.filter((row) => isRight(row) === true).length,
      oneRightPairs: oneRight.length,
      wrongPicks: selection.filter((row) => isRight(row) === false).map((row) => `${row.id}:${row.pair}#${row.repeatId}`),
      noneRightPairs: noneRight.length,
      abstained: selection.filter((row) => pick(row) === "none").length,
    };
  };
  const jevCalls = [...safety.map((row) => row.jev), ...artifact.map((row) => row.jev), ...selection.flatMap((row) => (row.adjudicationJev ? [row.adjudicationJev] : []))];
  const guardianCalls = [...safety.map((row) => row.guardian), ...artifact.map((row) => row.guardian)];
  const summary = {
    artifactCheck: {
      guardian: artifactArm(guardianSupports),
      guardianAndJev: artifactArm((row) => (guardianSupports(row) === null || jevSupports(row) === null ? null : guardianSupports(row)! && jevSupports(row)!)),
      jev: artifactArm(jevSupports),
      byOrigin: Object.fromEntries(
        (["reference", "semantic_mutation", "second_mutation", "real_compile"] as const).map((origin) => {
          const rows = artifact.filter((row) => row.origin === origin);
          return [origin, { guardianSupported: rows.filter((row) => guardianSupports(row) === true).length, jevSupported: rows.filter((row) => jevSupports(row) === true).length, total: rows.length }];
        }),
      ),
    },
    cost: {
      guardianCalls: guardianCalls.length,
      guardianCostUsd: "unpriced (Groq usage recorded as tokens)",
      guardianInputTokens: sum(guardianCalls.map((call) => call.inputTokens)),
      guardianOutputTokens: sum(guardianCalls.map((call) => call.outputTokens)),
      guardianUnavailable: guardianCalls.filter((call) => call.decision === "unavailable").length,
      guardianWallP50Ms: percentile(guardianCalls.map((call) => call.wallMs), 50),
      jevCalls: jevCalls.length,
      jevCostUsd: sum(jevCalls.map((call) => call.timing.costUsd)),
      jevFailures: jevCalls.filter((call) => call.errorClass).length,
      jevProviderP50Ms: percentile(jevCalls.flatMap((call) => (call.timing.providerMs === null ? [] : [call.timing.providerMs])), 50),
    },
    items: { artifactCandidates: artifact.length / options.runs, clearWithLedger: clear.length, selectionPairs: selection.length / options.runs, sources: items.length },
    safety: {
      deterministic: safetyArm((row) => row.deterministic),
      deterministicPlusGuardian: safetyArm((row) => (row.deterministic === "unsafe" || guardianSafety(row) === "unsafe" ? "unsafe" : guardianSafety(row))),
      deterministicPlusJev: safetyArm((row) => (row.deterministic === "unsafe" || jevSafety(row) === "unsafe" ? "unsafe" : jevSafety(row))),
      guardian: safetyArm(guardianSafety),
      jev: safetyArm(jevSafety),
    },
    selection: {
      escalateToday: selectionArm(() => "none"),
      guardianSelect: selectionArm((row) => row.guardianPick),
      jevAdjudication: selectionArm((row) => row.jevAdjudicatedPick),
      jevAdjudicationAndGuardian: selectionArm((row) => (row.jevAdjudicatedPick !== "none" && row.jevAdjudicatedPick === row.guardianPick ? row.jevAdjudicatedPick : "none")),
      jevCheckSelect: selectionArm((row) => row.jevCheckPick),
    },
  };
  const report = {
    experimentId: `jev-j10-${new Date().toISOString().replace(/[:.]/gu, "-")}`,
    generatedAt: new Date().toISOString(),
    method: {
      adversarialSet: { sha256: JEV_J10_ADVERSARIAL_SHA256, version: JEV_J10_ADVERSARIAL_VERSION },
      guardian: { artifactCall: "checkClaimGroundedness(describeRuleAstForPlayers(ast), claim meanings)", model: guardianConfig.model, safetyCall: "detectJailbreak(source)" },
      jev: { artifactCall: "J8/J9 candidate check with structure note and boundary evidence", expectedResolved: options.expectedResolvedModel, safetyCall: "J6 P12 question set" },
      ledgers: "First LEDGER_VERIFIED ledger per item from the J9 packet and the J10 adversarial packet.",
      runs: options.runs,
    },
    rows: { artifact, safety, selection },
    summary: { ...summary, endToEndWallClockMs: Math.round(performance.now() - started) },
  };
  atomicWriteJson(options.output, report, "none");
  console.log(JSON.stringify(report.summary, null, 2));
}


main().catch((error: unknown) => {
  const failure = classifyError(error);
  console.error(`${failure.code}: ${failure.message}`);
  process.exitCode = 1;
});
