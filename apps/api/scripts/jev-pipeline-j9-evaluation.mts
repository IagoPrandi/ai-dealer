import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { resolve } from "node:path";

import { ruleAstSchema, type RuleAst } from "@tyche/rule-compiler";

import { sha256Canonical, type JevQuestionSet } from "../src/jevPipelineEvaluation.js";
import { astSemanticUnits, deriveCandidateJudgment, type CandidateJudgment, type ClaimLedger, type ScenarioInput } from "../src/jevPipelineJ8Evaluation.js";
import {
  boundaryEvidence,
  buildAdjudicationQuestions,
  buildAdjudicationState,
  buildEvidenceLibrary,
  buildProductionCandidateCheck,
  deriveAdjudication,
  disagreements,
  JEV_J9_POLICY_SHA256,
  JEV_J9_POLICY_VERSION,
  routeA0,
  routeNOnly,
  routeP1,
  routeP2,
  routeP3,
  routeP5,
  type AdjudicationDecision,
  type BoundaryEvidence,
  type CompileOutcome,
  type J9Route,
  type J9StageResults,
} from "../src/jevPipelineJ9Pipelines.js";
import { JEV_J9_FRESH_SHA256, JEV_J9_FRESH_VERSION } from "../src/jevPipelineJ9Fresh.js";
import { evaluateDeterministicRuleSafety } from "../src/ruleInputSafety.js";
import { adversarialItems, freshItems, heldOutItems, matchesReference, randomScenarioLibrary, v1Items, type Item } from "./jev-pipeline-items.mjs";
import {
  atomicWriteJson,
  buildVerifiedLedger,
  callJev,
  classifyError,
  DEFAULT_RESOLVED_JEV,
  EvaluationError,
  JEV_REQUESTED_MODEL,
  loadRootEnvironment,
  mapConcurrent,
  openRouterKey,
  percentile,
  sum,
  type FailureInjection,
  type JevCall,
  type LedgerRun,
  type ProviderOptions,
} from "./jev-pipeline-providers.mjs";

// Read-only J9 experiment: complete pipeline proposals with real AST
// generation. The hidden reference AST scores the outcome only; no stage sees
// it. Imports no API server, database, wallet, payment, or chain-write path.

const LLM_ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

interface Options extends ProviderOptions {
  aggregateInput: string | null;
  concurrency: number;
  compilerA: string;
  compilerB: string;
  output: string;
  runs: number;
  selfTest: boolean;
  suite: "adversarial" | "all" | "fresh" | "heldout" | "v1";
}

interface CompileAttempt {
  costUsd: number | null;
  errorClass: string | null;
  finishReason: string | null;
  inputTokens: number | null;
  issues: string | null;
  outputTokens: number | null;
  providerMs: number;
  resolvedModel: string | null;
}

interface CompileRecord extends CompileOutcome {
  attempts: CompileAttempt[];
  model: string;
  wallMs: number;
}

interface CheckRecord {
  evidence: Omit<BoundaryEvidence, "scenarios"> & { scenarioIds: string[] };
  jev: JevCall | null;
  judgment: CandidateJudgment | null;
  wallMs: number;
}

interface ArmOutcome {
  acceptedCorrect: boolean | null;
  costUsd: number;
  criticalPathMs: number;
  expected: "ACCEPT" | "BLOCK" | "CLARIFY";
  falseAccept: boolean;
  route: J9Route;
}

type ArmName = "A0" | "N_ONLY" | "P1" | "P1_PARALLEL" | "P2" | "P2_PARALLEL" | "P3" | "P3_PARALLEL" | "P5";

interface ItemResult {
  adjudication: { decision: AdjudicationDecision | null; jev: JevCall | null; scenarioIds: string[]; swapped: boolean; wallMs: number } | null;
  arms: Record<ArmName, ArmOutcome>;
  blocked: boolean;
  checkA: CheckRecord | null;
  checkB: CheckRecord | null;
  checkRegenerated: CheckRecord | null;
  class: Item["class"];
  compileA: CompileRecord | null;
  compileB: CompileRecord | null;
  compileRegenerated: CompileRecord | null;
  disagreementCount: number | null;
  error?: string;
  id: string;
  language: "en" | "pt";
  ledger: LedgerRun | null;
  ledgerWallMs: number;
  repeatId: number;
  suite: Item["suite"];
}

function argument(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

function parseOptions(): Options {
  const suite = (argument("suite") ?? "all") as Options["suite"];
  return {
    aggregateInput: argument("aggregate"),
    compilerA: argument("compiler-a") ?? process.env.LLM_MODEL_COMPILE?.trim() ?? "openai/gpt-oss-120b",
    compilerB: argument("compiler-b") ?? "deepseek/deepseek-v4-flash",
    concurrency: Number(argument("concurrency") ?? 4),
    expectedResolvedModel: argument("expected-model") ?? DEFAULT_RESOLVED_JEV,
    failureInjection: (argument("inject") ?? "none") as FailureInjection,
    live: process.argv.includes("--live"),
    output: argument("output") ?? "../../docs/jev-pipeline-j9-results.json",
    runs: Number(argument("runs") ?? 3),
    selfTest: process.argv.includes("--self-test"),
    suite,
  };
}

// ---------------------------------------------------------------------------
// AST generation: the J3 "llm-free" writer (full grammar, JSON mode, one
// schema repair). It sees the source only; claims stay with the Jev checks.

let signatures: unknown = null;
let integerMenu: ((proposal: string) => number[]) | null = null;

async function compilerContext(): Promise<{ integerMenu: (proposal: string) => number[]; signatures: unknown }> {
  if (!signatures || !integerMenu) {
    const assemblyPath = "./jev-ast-assembly.mjs";
    const assembly = (await import(assemblyPath)) as { constructSignatures: () => unknown; integerMenu: (proposal: string) => number[] };
    signatures = assembly.constructSignatures();
    integerMenu = assembly.integerMenu;
  }
  return { integerMenu, signatures };
}

const BUILD_INSTRUCTION = `You compile a player's natural-language winning rule into a Tyche schemaVersion 3 rule AST.

The rule is evaluated over exactly two arrays: \`guess\` (the player's six numbers) and \`draw\` (the six drawn numbers). Both always hold six distinct integers from 1 to 100.

Return ONLY a JSON object of this exact shape and nothing else:
{"schemaVersion": 3, "result": <result>}

<result> is either
  {"type": "predicate", "predicate": <predicate>}
when each ticket wins or loses on its own, or
  {"type": "ranking", "eligibleWhen": <predicate>, "score": <scalar>, "direction": "max"|"min", "tieBreak": "share_pool"}
when tickets are scored and compared against each other. \`eligibleWhen\` is optional and only for a stated condition that excludes a ticket from the comparison.

Build <predicate>, <scalar> and <array> only from the constructs listed in allowedConstructs.

Scope rules: \`map\`, \`filter\`, \`forall\` and \`exists\` bind one element, referenced by {"kind":"elem"}; \`pairs_map\`, \`pairs_forall\` and \`pairs_exists\` bind one position pair, referenced by {"kind":"pair","side":"left"|"right"}. These binders may not nest more than two deep. \`at\` and \`slice\` need an array of statically known length, so they cannot read the output of \`filter\`, \`distinct\`, \`intersection\` or \`difference\`.

Express exactly what the proposal states. Do not add a condition the proposal does not state, and do not drop one it does. If the proposal is vague, still return your best AST; another stage decides whether it may be used.`;

function selfTestAst(item: Item, which: "A" | "B" | "R"): RuleAst {
  const reference = item.candidates.find((candidate) => candidate.isCorrect)?.ast;
  const wrong = item.candidates.find((candidate) => !candidate.isCorrect)?.ast;
  if (which === "B" && wrong && item.id.endsWith("2")) return wrong;
  return reference ?? wrong ?? ruleAstSchema.parse({ result: { predicate: { kind: "compare", left: { kind: "reduce", of: { kind: "intersection", left: { kind: "source", source: "guess" }, right: { kind: "source", source: "draw" } }, op: "count" }, op: "gte", right: { kind: "lit", value: 3 } }, type: "predicate" }, schemaVersion: 3 });
}

interface CompletionBody {
  choices?: { finish_reason?: string; message?: { content?: string } }[];
  model?: string;
  usage?: { completion_tokens?: number; cost?: number; prompt_tokens?: number };
}

/** One chat completion with a single bounded transport retry; failures stay typed. */
async function fetchCompletion(model: string, messages: readonly { content: string; role: string }[]): Promise<{ body: CompletionBody | null; errorClass: string | null }> {
  let errorClass: string | null = null;
  for (let transport = 1; transport <= 2; transport += 1) {
    try {
      const response = await fetch(LLM_ENDPOINT, {
        body: JSON.stringify({ max_tokens: 6000, messages, model, response_format: { type: "json_object" }, usage: { include: true } }),
        headers: { authorization: `Bearer ${openRouterKey()}`, "content-type": "application/json" },
        method: "POST",
        signal: AbortSignal.timeout(180_000),
      });
      const body = (await response.json().catch(() => null)) as CompletionBody | null;
      if (!response.ok || !body) throw new EvaluationError(response.status === 429 || response.status >= 500 ? "RETRYABLE_HTTP" : "SERVICE_HTTP", `Compiler ${model} returned HTTP ${response.status}`);
      return { body, errorClass: null };
    } catch (error) {
      errorClass = classifyError(error).code;
      if (!(errorClass === "RETRYABLE_HTTP" || errorClass === "SERVICE_TIMEOUT") || transport === 2) break;
      await new Promise((done) => setTimeout(done, 1_000));
    }
  }
  return { body: null, errorClass };
}

async function compileAst(item: Item, model: string, options: Options, which: "A" | "B" | "R", feedback: { previous: unknown; message: string } | null): Promise<CompileRecord> {
  const started = performance.now();
  if (!options.live) {
    return { ast: selfTestAst(item, which), attempts: [], error: null, model: `self-test-${which}`, wallMs: 0 };
  }
  const context = await compilerContext();
  const messages: { content: string; role: string }[] = [
    { content: BUILD_INSTRUCTION, role: "system" },
    {
      content: JSON.stringify({ allowedConstructs: context.signatures, numbersMentionedByTheProposal: context.integerMenu(item.source), ruleProposal: item.source }),
      role: "user",
    },
  ];
  if (feedback) messages.push({ content: JSON.stringify(feedback.previous), role: "assistant" }, { content: feedback.message, role: "user" });
  const attempts: CompileAttempt[] = [];
  for (let round = 1; round <= 2; round += 1) {
    const attemptStarted = performance.now();
    const { body, errorClass } = await fetchCompletion(model, messages);
    const raw = body?.choices?.[0]?.message?.content ?? null;
    let issues: string | null = null;
    let ast: RuleAst | null = null;
    if (!errorClass) {
      try {
        const parsedJson: unknown = raw === null ? null : JSON.parse(raw);
        const candidate = parsedJson && typeof parsedJson === "object" && "ast" in parsedJson && !("result" in parsedJson) ? (parsedJson as { ast: unknown }).ast : parsedJson;
        const parsed = ruleAstSchema.safeParse(candidate);
        if (parsed.success) ast = parsed.data;
        else issues = parsed.error.issues.map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`).slice(0, 8).join("; ");
      } catch {
        issues = `malformed JSON (finish reason: ${body?.choices?.[0]?.finish_reason ?? "unknown"})`;
      }
    }
    attempts.push({
      costUsd: typeof body?.usage?.cost === "number" ? body.usage.cost : null,
      errorClass: errorClass ?? (ast ? null : "SCHEMA_ERROR"),
      finishReason: body?.choices?.[0]?.finish_reason ?? null,
      inputTokens: body?.usage?.prompt_tokens ?? null,
      issues,
      outputTokens: body?.usage?.completion_tokens ?? null,
      providerMs: Math.round(performance.now() - attemptStarted),
      resolvedModel: body?.model ?? null,
    });
    if (ast) return { ast, attempts, error: null, model, wallMs: Math.round(performance.now() - started) };
    if (errorClass || round === 2) break;
    messages.push({ content: String(raw).slice(0, 6000), role: "assistant" }, { content: `That output was rejected by the schema validator: ${issues}. Return the corrected JSON object only.`, role: "user" });
  }
  const last = attempts[attempts.length - 1];
  return { ast: null, attempts, error: last?.errorClass ?? "UNKNOWN", model, wallMs: Math.round(performance.now() - started) };
}

// ---------------------------------------------------------------------------
// Jev checks on generated evidence.

async function candidateCheck(item: Item, ledger: ClaimLedger, ast: RuleAst, options: Options, library: ReturnType<typeof buildEvidenceLibrary>, random: readonly ScenarioInput[]): Promise<CheckRecord> {
  const started = performance.now();
  const evidence = boundaryEvidence(ast, library, random);
  const summary = { degenerate: evidence.degenerate, scenarioIds: evidence.scenarios.map((scenario) => scenario.id), source: evidence.source };
  if (evidence.degenerate) return { evidence: summary, jev: null, judgment: null, wallMs: Math.round(performance.now() - started) };
  const { questions } = buildProductionCandidateCheck(ledger, ast, evidence.scenarios);
  const correct = options.live ? null : await matchesReference(item, ast);
  const jev = await callJev(buildProductionCandidateCheck(ledger, ast, evidence.scenarios).state, questions, options, options.live ? null : oracleNoul(questions, () => correct === true));
  return { evidence: summary, jev, judgment: jev.response ? deriveCandidateJudgment(questions, jev.response) : null, wallMs: Math.round(performance.now() - started) };
}

function oracleNoul(questions: JevQuestionSet, label: (id: string) => boolean): () => unknown {
  // Self-test only: the Choice follows the Noul labels so adjudication paths
  // are exercised with a consistent oracle.
  const pick = label("scenario_0_candidate_1") ? "candidate_1" : label("scenario_0_candidate_2") ? "candidate_2" : "neither";
  return () => ({
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) =>
        question.type === "choice"
          ? [id, { choice: pick, confidence: 0.9, probabilities: Object.fromEntries(Object.keys(question.criteria).map((key) => [key, key === pick ? 0.9 : 0.05])), type: "choice" }]
          : [id, { noul: label(id) ? 0.95 : 0.05, type: "noul" }],
      ),
    ),
    model: "self-test-jev-j9-oracle-v1",
    usage: { cost: 0, input_tokens: 100, output_tokens: 10 },
  });
}

function regenerationFeedback(ledger: ClaimLedger, check: CheckRecord, ast: RuleAst): string {
  const units = astSemanticUnits(ast);
  const lines = (check.judgment?.negative ?? []).map((id) => {
    const forward = /^forward_(\d+)$/u.exec(id);
    if (forward) return `Your AST does not implement this condition exactly: "${ledger.claims[Number(forward[1])]!.meaning}".`;
    const reverse = /^reverse_(\d+)$/u.exec(id);
    if (reverse) return `Your AST contains a condition the rule does not state: "${units[Number(reverse[1])]?.description ?? id}".`;
    const scenario = /^scenario_(\d+)$/u.exec(id);
    if (scenario) return `On test scenario ${check.evidence.scenarioIds[Number(scenario[1])]} your AST gives a verdict the rule does not require.`;
    return id;
  });
  return `A reviewer compared your AST with the rule and found: ${lines.join(" ")} Return a corrected JSON object only.`;
}

// ---------------------------------------------------------------------------

function expectedRoute(item: Item): ArmOutcome["expected"] {
  return item.class === "BLOCKED" ? "BLOCK" : item.class === "AMBIGUOUS" ? "CLARIFY" : "ACCEPT";
}

function llmCost(record: CompileRecord | null): number {
  return sum(record?.attempts.map((attempt) => attempt.costUsd) ?? []);
}

function jevCost(call: JevCall | null | undefined): number {
  return call?.timing.costUsd ?? 0;
}

function ledgerCost(ledger: LedgerRun | null): number {
  return ledger ? sum(ledger.attempts.map((attempt) => attempt.costUsd)) + sum(ledger.jevCalls.map((call) => call.timing.costUsd)) : 0;
}

async function evaluateItem(item: Item, repeatId: number, options: Options): Promise<ItemResult> {
  const random = await randomScenarioLibrary();
  const library = buildEvidenceLibrary(item.source);
  const base = { class: item.class, id: item.id, language: item.language, repeatId, suite: item.suite };
  const expected = expectedRoute(item);
  if (evaluateDeterministicRuleSafety(item.source).decision === "unsafe") {
    const blocked: ArmOutcome = { acceptedCorrect: null, costUsd: 0, criticalPathMs: 0, expected, falseAccept: false, route: "BLOCK" };
    return {
      ...base,
      adjudication: null,
      arms: { A0: blocked, N_ONLY: blocked, P1: blocked, P1_PARALLEL: blocked, P2: blocked, P2_PARALLEL: blocked, P3: blocked, P3_PARALLEL: blocked, P5: blocked },
      blocked: true,
      checkA: null,
      checkB: null,
      checkRegenerated: null,
      compileA: null,
      compileB: null,
      compileRegenerated: null,
      disagreementCount: null,
      ledger: null,
      ledgerWallMs: 0,
    };
  }
  // Ledger and both compiles are independent; they run concurrently here and
  // the arm accounting below charges each arm only the stages it would run.
  const ledgerStarted = performance.now();
  const [ledger, compileA, compileB] = await Promise.all([
    buildVerifiedLedger(item, options).then((run) => ({ run, wallMs: Math.round(performance.now() - ledgerStarted) })),
    compileAst(item, options.compilerA, options, "A", null),
    compileAst(item, options.compilerB, options, "B", null),
  ]);
  const verified = ledger.run.judgment?.decision === "LEDGER_VERIFIED";
  const claims = ledger.run.ledger;
  let checkA: CheckRecord | null = null;
  let checkB: CheckRecord | null = null;
  let checkRegenerated: CheckRecord | null = null;
  let compileRegenerated: CompileRecord | null = null;
  let adjudication: ItemResult["adjudication"] = null;
  let disagreementCount: number | null = null;
  let equivalent: boolean | null = null;
  const degenerateA = compileA.ast ? boundaryEvidence(compileA.ast, library, random).degenerate : null;
  if (claims && compileA.ast) {
    checkA = await candidateCheck(item, claims, compileA.ast, options, library, random);
    if (verified && checkA.judgment?.decision === "candidate_defect") {
      compileRegenerated = await compileAst(item, options.compilerA, options, "R", { message: regenerationFeedback(claims, checkA, compileA.ast), previous: compileA.ast });
      if (compileRegenerated.ast) checkRegenerated = await candidateCheck(item, claims, compileRegenerated.ast, options, library, random);
    }
  }
  if (compileA.ast && compileB.ast) {
    const found = disagreements(compileA.ast, compileB.ast, library, random);
    disagreementCount = found.length;
    equivalent = found.length === 0;
    if (!equivalent && claims) {
      const started = performance.now();
      const swapped = repeatId % 2 === 0;
      const shown = found.slice(0, 3);
      const state = buildAdjudicationState(claims, compileA.ast, compileB.ast, shown, swapped);
      const questions = buildAdjudicationQuestions(state);
      const correctA = options.live ? null : await matchesReference(item, compileA.ast);
      const correctB = options.live ? null : await matchesReference(item, compileB.ast);
      const firstShownIsA = !swapped;
      const jev = await callJev(state, questions, options, options.live ? null : oracleNoul(questions, (id) => {
        const side = id.endsWith("_1") ? (firstShownIsA ? correctA : correctB) : firstShownIsA ? correctB : correctA;
        return side === true;
      }));
      const raw = jev.response ? deriveAdjudication(state, jev.response) : null;
      // Map the shown order back to A/B.
      const decision: AdjudicationDecision | null = raw === null || raw === "unresolved" ? raw : (raw === "candidate_1") === firstShownIsA ? "candidate_1" : "candidate_2";
      adjudication = { decision, jev, scenarioIds: shown.map((scenario) => scenario.id), swapped, wallMs: Math.round(performance.now() - started) };
      if (decision === "candidate_2" && claims) checkB = await candidateCheck(item, claims, compileB.ast, options, library, random);
    }
  }
  const stages: J9StageResults = {
    adjudication: adjudication?.decision ?? null,
    blocked: false,
    checkFirst: checkA?.judgment ?? null,
    checkRegenerated: checkRegenerated?.judgment ?? null,
    checkWinner: adjudication?.decision === "candidate_2" ? (checkB?.judgment ?? null) : (checkA?.judgment ?? null),
    compileFirst: compileA,
    compileRegenerated,
    compileSecond: compileB,
    degenerateFirst: degenerateA,
    equivalent,
    ledger: ledger.run.judgment,
    ledgerSignals: ledger.run.ledger ? { codeDefects: ledger.run.check?.defects.length ?? 0, openChoices: ledger.run.ledger.openChoices.length } : null,
  };
  const score = async (outcome: { ast: RuleAst | null; route: J9Route }, costUsd: number, criticalPathMs: number): Promise<ArmOutcome> => {
    const acceptedCorrect = outcome.route === "ACCEPT" && outcome.ast ? (item.class === "CLEAR" ? await matchesReference(item, outcome.ast) : false) : null;
    return { acceptedCorrect, costUsd, criticalPathMs, expected, falseAccept: outcome.route === "ACCEPT" && acceptedCorrect !== true, route: outcome.route };
  };
  // Stage costs and wall times, charged per arm.
  const lCost = ledgerCost(ledger.run);
  const lMs = ledger.wallMs;
  const aCost = llmCost(compileA);
  const bCost = llmCost(compileB);
  const checkACost = jevCost(checkA?.jev);
  const regenCost = llmCost(compileRegenerated) + jevCost(checkRegenerated?.jev);
  const regenMs = (compileRegenerated?.wallMs ?? 0) + (checkRegenerated?.wallMs ?? 0);
  const adjCost = jevCost(adjudication?.jev) + jevCost(checkB?.jev);
  const adjMs = (adjudication?.wallMs ?? 0) + (checkB?.wallMs ?? 0);
  const p1 = routeP1(stages);
  const p2 = routeP2(stages);
  const p3 = routeP3(stages);
  const p5 = routeP5(stages);
  // P5 pays for the ledger LLM only (no Jev) and for compiles only when the
  // ledger did not already stop the proposal.
  const ledgerLlmCost = sum(ledger.run.attempts.map((attempt) => attempt.costUsd));
  const ledgerLlmMs = ledger.run.attempts.reduce((total, attempt) => total + attempt.providerMs, 0);
  const p5StoppedAtLedger = stages.ledgerSignals === null || stages.ledgerSignals.codeDefects > 0 || stages.ledgerSignals.openChoices > 0;
  const nOnly = routeNOnly(stages);
  const usedRegen = verified && checkA?.judgment?.decision === "candidate_defect";
  const p2Tail = equivalent ? checkACost : adjCost;
  const p2TailMs = equivalent ? (checkA?.wallMs ?? 0) : adjMs;
  const arms: ItemResult["arms"] = {
    A0: await score(routeA0(stages), aCost, compileA.wallMs),
    N_ONLY: await score(nOnly, lCost + (verified ? aCost + bCost : 0), lMs + (verified ? Math.max(compileA.wallMs, compileB.wallMs) : 0)),
    P1: await score(p1, lCost + (verified ? aCost + checkACost + (usedRegen ? regenCost : 0) : 0), lMs + (verified ? compileA.wallMs + (checkA?.wallMs ?? 0) + (usedRegen ? regenMs : 0) : 0)),
    P1_PARALLEL: await score(p1, lCost + aCost + (verified ? checkACost + (usedRegen ? regenCost : 0) : 0), Math.max(lMs, compileA.wallMs) + (verified ? (checkA?.wallMs ?? 0) + (usedRegen ? regenMs : 0) : 0)),
    P2: await score(p2, lCost + (verified ? aCost + bCost + p2Tail : 0), lMs + (verified ? Math.max(compileA.wallMs, compileB.wallMs) + p2TailMs : 0)),
    P2_PARALLEL: await score(p2, lCost + aCost + bCost + (verified ? p2Tail : 0), Math.max(lMs, compileA.wallMs, compileB.wallMs) + (verified ? p2TailMs : 0)),
    P3: await score(p3, lCost + (verified ? aCost + bCost + (equivalent ? 0 : adjCost) : 0), lMs + (verified ? Math.max(compileA.wallMs, compileB.wallMs) + (equivalent ? 0 : adjMs) : 0)),
    P5: await score(p5, ledgerLlmCost + (p5StoppedAtLedger ? 0 : aCost + bCost), ledgerLlmMs + (p5StoppedAtLedger ? 0 : Math.max(compileA.wallMs, compileB.wallMs))),
    P3_PARALLEL: await score(p3, lCost + aCost + bCost + (verified && !equivalent ? adjCost : 0), Math.max(lMs, compileA.wallMs, compileB.wallMs) + (verified && !equivalent ? adjMs : 0)),
  };
  return {
    ...base,
    adjudication,
    arms,
    blocked: false,
    checkA,
    checkB,
    checkRegenerated,
    compileA,
    compileB,
    compileRegenerated,
    disagreementCount,
    ledger: ledger.run,
    ledgerWallMs: lMs,
  };
}

/**
 * An unexpected exception in one item is recorded as that item's explicit
 * UNAVAILABLE outcome with its error class; it never becomes a pass and never
 * discards the other items' results.
 */
async function evaluateItemIsolated(item: Item, repeatId: number, options: Options): Promise<ItemResult> {
  try {
    return await evaluateItem(item, repeatId, options);
  } catch (error) {
    const failure = classifyError(error);
    const unavailable: ArmOutcome = { acceptedCorrect: null, costUsd: 0, criticalPathMs: 0, expected: expectedRoute(item), falseAccept: false, route: "UNAVAILABLE" };
    return {
      adjudication: null,
      arms: { A0: unavailable, N_ONLY: unavailable, P1: unavailable, P1_PARALLEL: unavailable, P2: unavailable, P2_PARALLEL: unavailable, P3: unavailable, P3_PARALLEL: unavailable, P5: unavailable },
      blocked: false,
      checkA: null,
      checkB: null,
      checkRegenerated: null,
      class: item.class,
      compileA: null,
      compileB: null,
      compileRegenerated: null,
      disagreementCount: null,
      error: `${failure.code}: ${failure.message}`,
      id: item.id,
      language: item.language,
      ledger: null,
      ledgerWallMs: 0,
      repeatId,
      suite: item.suite,
    };
  }
}

// ---------------------------------------------------------------------------
// Aggregation.

function armSummary(results: readonly ItemResult[], arm: keyof ItemResult["arms"]) {
  const rows = results.map((result) => ({ ...result.arms[arm], class: result.class }));
  const byClass = (cls: Item["class"]) => rows.filter((row) => row.class === cls);
  const accepted = rows.filter((row) => row.route === "ACCEPT");
  const nonBlocked = rows.filter((row) => row.route !== "BLOCK");
  const count = (values: readonly { route: J9Route }[]) =>
    values.reduce<Record<string, number>>((counts, value) => {
      counts[value.route] = (counts[value.route] ?? 0) + 1;
      return counts;
    }, {});
  return {
    acceptPrecision: accepted.length ? accepted.filter((row) => row.acceptedCorrect === true).length / accepted.length : null,
    ambiguousRoutes: count(byClass("AMBIGUOUS")),
    blockedRoutes: count(byClass("BLOCKED")),
    clearCorrectAccepts: byClass("CLEAR").filter((row) => row.acceptedCorrect === true).length,
    clearRoutes: count(byClass("CLEAR")),
    clearTotal: byClass("CLEAR").length,
    costUsdMean: nonBlocked.length ? sum(nonBlocked.map((row) => row.costUsd)) / nonBlocked.length : 0,
    costUsdMeanClear: byClass("CLEAR").length ? sum(byClass("CLEAR").map((row) => row.costUsd)) / byClass("CLEAR").length : 0,
    costUsdTotal: sum(rows.map((row) => row.costUsd)),
    criticalPathP50Ms: percentile(nonBlocked.map((row) => row.criticalPathMs), 50),
    criticalPathP95Ms: percentile(nonBlocked.map((row) => row.criticalPathMs), 95),
    exact: rows.filter((row) => (row.expected === "ACCEPT" ? row.acceptedCorrect === true : row.route === row.expected)).length,
    falseAccepts: rows.filter((row) => row.falseAccept).length,
    falseAcceptsByClass: {
      AMBIGUOUS: byClass("AMBIGUOUS").filter((row) => row.falseAccept).length,
      CLEAR_WRONG_AST: byClass("CLEAR").filter((row) => row.falseAccept).length,
    },
    items: rows.length,
  };
}

function summarize(results: readonly ItemResult[]) {
  const arms = ["A0", "N_ONLY", "P1", "P1_PARALLEL", "P2", "P2_PARALLEL", "P3", "P3_PARALLEL", "P5"] as const;
  // Packets written before an arm existed (J9 predates P5) keep their arms.
  const present = arms.filter((arm) => results.every((result) => arm in result.arms));
  const slice = (values: readonly ItemResult[]) => Object.fromEntries(present.map((arm) => [arm, armSummary(values, arm)]));
  const compiles = results.flatMap((result) => [result.compileA, result.compileB].filter((record): record is CompileRecord => record !== null));
  const byModel = (model: string) => compiles.filter((record) => record.model === model);
  const models = [...new Set(compiles.map((record) => record.model))];
  const clearWithBoth = results.filter((result) => result.class === "CLEAR" && result.compileA && result.compileB);
  const jevCalls = results.flatMap((result) => [result.checkA?.jev, result.checkB?.jev, result.checkRegenerated?.jev, result.adjudication?.jev, ...(result.ledger?.jevCalls ?? [])].filter((call): call is JevCall => Boolean(call)));
  return {
    itemErrors: results.filter((result) => result.error).map((result) => `${result.id}#${result.repeatId}: ${result.error}`),
    compilers: Object.fromEntries(
      models.map((model) => [
        model,
        {
          calls: byModel(model).reduce((total, record) => total + record.attempts.length, 0),
          costUsd: sum(byModel(model).flatMap((record) => record.attempts.map((attempt) => attempt.costUsd))),
          failed: byModel(model).filter((record) => !record.ast).length,
          wallP50Ms: percentile(byModel(model).map((record) => record.wallMs), 50),
        },
      ]),
    ),
    compilerAgreementOnClear: {
      bothCorrectEquivalent: clearWithBoth.filter((result) => result.disagreementCount === 0).length,
      disagreed: clearWithBoth.filter((result) => (result.disagreementCount ?? 0) > 0).length,
      total: clearWithBoth.length,
    },
    jev: { calls: jevCalls.length, costUsd: sum(jevCalls.map((call) => call.timing.costUsd)), failures: jevCalls.filter((call) => call.errorClass).length, providerP50Ms: percentile(jevCalls.flatMap((call) => (call.timing.providerMs === null ? [] : [call.timing.providerMs])), 50) },
    jevOnlyOnWrongCompiles: {
      // Jev supported compile A although it is wrong (clear) or the source is
      // ambiguous. Counted before any other gate, to isolate Jev's own error.
      checks: results.filter((result) => result.checkA?.judgment).length,
      falseSupports: results.filter((result) => result.class !== "BLOCKED" && result.checkA?.judgment?.decision === "candidate_supported" && result.arms.A0.acceptedCorrect !== true).map((result) => `${result.id}#${result.repeatId}`),
    },
    slices: {
      all: slice(results),
      adversarial: slice(results.filter((result) => result.suite === "adversarial")),
      fresh: slice(results.filter((result) => result.suite === "fresh")),
      freshEn: slice(results.filter((result) => result.suite === "fresh" && result.language === "en")),
      freshPt: slice(results.filter((result) => result.suite === "fresh" && result.language === "pt")),
      heldout: slice(results.filter((result) => result.suite === "heldout")),
      heldoutPt: slice(results.filter((result) => result.suite === "heldout" && result.language === "pt")),
      heldoutEn: slice(results.filter((result) => result.suite === "heldout" && result.language === "en")),
      v1: slice(results.filter((result) => result.suite === "v1")),
    },
  };
}

// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const options = parseOptions();
  if (options.aggregateInput) {
    const input = JSON.parse(readFileSync(resolve(options.aggregateInput), "utf8")) as { results: ItemResult[]; summary: { endToEndWallClockMs: number } };
    const report = { ...input, summary: { ...summarize(input.results), endToEndWallClockMs: input.summary.endToEndWallClockMs } };
    atomicWriteJson(options.output, report, "none");
    console.log(JSON.stringify(report.summary, null, 2));
    return;
  }
  if (!options.live && !options.selfTest) throw new EvaluationError("CONFIGURATION_ERROR", "Choose --self-test, --aggregate=<file>, or --live");
  if (options.live) loadRootEnvironment();
  const wanted = (suite: Item["suite"]) => options.suite === "all" || options.suite === suite;
  const items = [...(wanted("v1") ? v1Items() : []), ...(wanted("heldout") ? await heldOutItems() : []), ...(wanted("fresh") ? freshItems() : []), ...(options.suite === "adversarial" ? adversarialItems() : [])].filter((item) => {
    const ids = argument("ids")?.split(",");
    return !ids || ids.includes(item.id);
  });
  const startedAt = new Date().toISOString();
  const wallStarted = performance.now();
  const tasks = Array.from({ length: options.runs }, (_, index) => (index % 2 === 0 ? items : [...items].reverse()).map((item) => ({ item, repeatId: index + 1 }))).flat();
  const results = await mapConcurrent(tasks, options.concurrency, ({ item, repeatId }) => evaluateItemIsolated(item, repeatId, options));
  const report = {
    experimentId: `jev-j9-${startedAt.replace(/[:.]/gu, "-")}`,
    generatedAt: new Date().toISOString(),
    method: {
      compilers: { A: options.live ? options.compilerA : "self-test", B: options.live ? options.compilerB : "self-test" },
      jevModel: { requested: JEV_REQUESTED_MODEL, expectedResolved: options.expectedResolvedModel },
      mode: options.live ? "live" : "self-test",
      noProductionWrites: "No API server, database, wallet, payment, proposal, artifact-freeze, or chain-write entry point is imported.",
      policyHash: JEV_J9_POLICY_SHA256,
      policyVersion: JEV_J9_POLICY_VERSION,
      referenceUse: "Hidden reference ASTs score accepted ASTs after the fact; no stage sees them.",
      runs: options.runs,
      scoring: "An accepted AST is correct only if it matches the hidden reference on the curated scenarios and all 200 seeded random scenarios.",
      sourceRevision: process.env.GITHUB_SHA?.trim() || "dirty-worktree-disclosed",
      startedAt,
      suite: options.suite,
      itemIds: items.map((item) => item.id),
      stateHash: sha256Canonical(items.map((item) => item.source)),
      freshSetHash: JEV_J9_FRESH_SHA256,
      freshSetVersion: JEV_J9_FRESH_VERSION,
    },
    results,
    summary: { ...summarize(results), endToEndWallClockMs: Math.round(performance.now() - wallStarted) },
  };
  atomicWriteJson(options.output, report, options.failureInjection);
  console.log(JSON.stringify(report.summary, null, 2));
}


main().catch((error: unknown) => {
  const failure = classifyError(error);
  console.error(`${failure.code}: ${failure.message}`);
  process.exitCode = 1;
});
