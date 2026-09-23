import { type BoundaryEvidence, type RuleAst, type ScenarioInput } from "@tyche/rule-compiler";

import { sha256Canonical, type JevQuestionSet, type ValidatedJevResponse } from "./jevPipelineEvaluation.js";
import {
  buildPublicScenario,
  J8_GAME_DOMAIN,
  J8_NOUL_REJECT,
  J8_NOUL_SUPPORT,
  J8_PRODUCT_DEFAULTS,
  type CandidateJudgment,
  type ClaimLedger,
  type LedgerJudgment,
  type PublicScenario,
} from "./jevPipelineJ8Evaluation.js";
import { buildArtifactCheck, describeWithStructure } from "./ruleSemanticChecks.js";

// J9: end-to-end pipeline proposals built from the J0-J8 findings. Production
// never has a reference AST, so every gate here uses only what production can
// compute: the source, the verified claim ledger, generated ASTs, and scenarios
// derived deterministically from the source. References are used by the runner
// for scoring only.
//
// The evidence library, boundary pairs, equivalence search, exactly-one
// detection and the structure-noted candidate check are production code now
// (@tyche/rule-compiler, ./ruleSemanticChecks.ts); J9 keeps its names.

export const JEV_J9_POLICY_VERSION = "jev-j9-pipelines-v2" as const;

export {
  asRankingScenario,
  boundaryEvidence,
  buildEvidenceLibrary,
  disagreements,
  exactlyOnePaths,
  sourceNumbers,
  targetVerdict,
  type BoundaryEvidence,
  type EvidenceScenario,
} from "@tyche/rule-compiler";
export { describeWithStructure } from "./ruleSemanticChecks.js";

// ---------------------------------------------------------------------------
// Adjudication: when two compilers disagree, Jev judges only the concrete
// scenarios where they differ, with every value precomputed by code.

export interface PublicAdjudicationState {
  candidates: { behaviorDescription: string; label: string }[];
  claims: { dimension: string; meaning: string }[];
  gameDomain: typeof J8_GAME_DOMAIN;
  productDefaults: readonly string[];
  scenarioNote: string;
  scenarios: { draw: number[]; id: string; tickets: PublicScenario["tickets"]; verdictIfCandidate1: string; verdictIfCandidate2: string }[];
}

export function buildAdjudicationState(ledger: ClaimLedger, first: RuleAst, second: RuleAst, scenarios: readonly ScenarioInput[], swap: boolean): PublicAdjudicationState {
  const [a, b] = swap ? [second, first] : [first, second];
  return {
    candidates: [
      { behaviorDescription: describeWithStructure(a), label: "candidate 1" },
      { behaviorDescription: describeWithStructure(b), label: "candidate 2" },
    ],
    claims: ledger.claims.map(({ dimension, meaning }) => ({ dimension, meaning })),
    gameDomain: J8_GAME_DOMAIN,
    productDefaults: J8_PRODUCT_DEFAULTS,
    scenarioNote: "Every value in `scenarios[*].tickets[*].facts` was computed exactly by code. Do not recount; use the given numbers.",
    scenarios: scenarios.map((scenario, index) => {
      const publicA = buildPublicScenario(a, scenario, `d${index + 1}`);
      const publicB = buildPublicScenario(b, scenario, `d${index + 1}`);
      return {
        draw: publicA.draw,
        id: publicA.id,
        // Facts are rule-independent; per-candidate sub-expression values are
        // withheld so neither candidate's own reasoning is shown as evidence.
        tickets: publicA.tickets.map((ticket) => ({ ...ticket, astComputedValues: [] })),
        verdictIfCandidate1: publicA.astVerdict,
        verdictIfCandidate2: publicB.astVerdict,
      };
    }),
  };
}

function noul(instructions: string) {
  return {
    criteria: { false: "No. The supplied evidence does not establish this.", true: "Yes. The supplied evidence establishes this." },
    instructions,
    type: "noul" as const,
  };
}

export function buildAdjudicationQuestions(state: PublicAdjudicationState): JevQuestionSet {
  const questions: JevQuestionSet = {};
  state.scenarios.forEach((_, index) => {
    for (const side of [1, 2] as const) {
      questions[`scenario_${index}_candidate_${side}`] = noul(
        `Apply \`claims\` to the tickets in \`scenarios[${index}]\` using the computed \`facts\`. Is \`scenarios[${index}].verdictIfCandidate${side}\` exactly the result that \`claims\` require?`,
      );
    }
  });
  questions.best_candidate = {
    criteria: {
      candidate_1: "`candidates[0].behaviorDescription` implements `claims` exactly and `candidates[1]` does not.",
      candidate_2: "`candidates[1].behaviorDescription` implements `claims` exactly and `candidates[0]` does not.",
      neither: "Neither candidate implements `claims` exactly, or both differ from `claims` in some way.",
    },
    instructions: "Which candidate implements `claims` exactly, judging by `candidates[*].behaviorDescription` and the verdicts in `scenarios`?",
    type: "choice",
  };
  return questions;
}

export type AdjudicationDecision = "candidate_1" | "candidate_2" | "unresolved";

/** A winner needs every scenario on its side, every opposite verdict rejected, and the Choice to agree. */
export function deriveAdjudication(state: PublicAdjudicationState, response: ValidatedJevResponse): AdjudicationDecision {
  const value = (id: string) => {
    const answer = response.answers[id];
    if (!answer || answer.type !== "noul") throw new Error(`Missing Noul answer ${id}`);
    return answer.noul;
  };
  const choice = response.answers.best_candidate;
  if (!choice || choice.type !== "choice") throw new Error("Missing Choice answer best_candidate");
  for (const side of [1, 2] as const) {
    const other = side === 1 ? 2 : 1;
    const wins = state.scenarios.every((_, index) => value(`scenario_${index}_candidate_${side}`) >= J8_NOUL_SUPPORT && value(`scenario_${index}_candidate_${other}`) <= J8_NOUL_REJECT);
    const choiceAgrees = choice.choice === `candidate_${side}` && (choice.probabilities[`candidate_${side}`] ?? 0) >= 0.7 && choice.confidence >= 0.7;
    if (wins && choiceAgrees) return `candidate_${side}`;
  }
  return "unresolved";
}

// ---------------------------------------------------------------------------
// Candidate check on generated evidence (J8 questions, production scenarios).

export function buildProductionCandidateCheck(ledger: ClaimLedger, ast: RuleAst, evidence: readonly ScenarioInput[]) {
  return buildArtifactCheck(ledger, ast, evidence);
}

// ---------------------------------------------------------------------------
// Routes. Each pipeline is a pure function of the stage results so the
// ablations reuse exactly the same provider calls.

export type J9Route = "ACCEPT" | "BLOCK" | "CLARIFY" | "REVIEW" | "UNAVAILABLE";

export interface CompileOutcome {
  ast: RuleAst | null;
  error: string | null;
}

export interface J9StageResults {
  adjudication: AdjudicationDecision | null;
  blocked: boolean;
  checkFirst: CandidateJudgment | null;
  checkRegenerated: CandidateJudgment | null;
  checkWinner: CandidateJudgment | null;
  compileFirst: CompileOutcome | null;
  compileRegenerated: CompileOutcome | null;
  compileSecond: CompileOutcome | null;
  degenerateFirst: BoundaryEvidence["degenerate"];
  equivalent: boolean | null;
  ledger: LedgerJudgment | null;
  /** Ledger facts that need no model: code defects and the LLM's own open-choice count. */
  ledgerSignals: { codeDefects: number; openChoices: number } | null;
}

function ledgerRoute(stages: J9StageResults): J9Route | null {
  if (stages.blocked) return "BLOCK";
  if (!stages.ledger) return "UNAVAILABLE";
  if (stages.ledger.decision === "CLARIFY") return "CLARIFY";
  if (stages.ledger.decision !== "LEDGER_VERIFIED") return "REVIEW";
  return null;
}

/** A0: no semantic gate at all — the first schema-valid compile is accepted. */
export function routeA0(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  if (stages.blocked) return { ast: null, route: "BLOCK" };
  return stages.compileFirst?.ast ? { ast: stages.compileFirst.ast, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

/** P1: ledger gate, one compile, vacuity check, Jev check; one regeneration on a Jev defect. */
export function routeP1(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  const early = ledgerRoute(stages);
  if (early) return { ast: null, route: early };
  const first = stages.compileFirst?.ast ?? null;
  if (!first || stages.degenerateFirst) return { ast: null, route: "REVIEW" };
  if (stages.checkFirst?.decision === "candidate_supported") return { ast: first, route: "ACCEPT" };
  if (stages.checkFirst?.decision === "candidate_defect" && stages.compileRegenerated?.ast && stages.checkRegenerated?.decision === "candidate_supported") {
    return { ast: stages.compileRegenerated.ast, route: "ACCEPT" };
  }
  return { ast: null, route: stages.checkFirst ? "REVIEW" : "UNAVAILABLE" };
}

/** N-only: ledger gate plus two compilers that must behave identically; no Jev on the AST. */
export function routeNOnly(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  const early = ledgerRoute(stages);
  if (early) return { ast: null, route: early };
  const first = stages.compileFirst?.ast ?? null;
  if (!first || stages.degenerateFirst || !stages.compileSecond?.ast) return { ast: null, route: "REVIEW" };
  return stages.equivalent ? { ast: first, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

/**
 * P2: two independent compilers. Agreement plus a supported Jev check accepts.
 * Disagreement is adjudicated by Jev on the disagreeing scenarios; the winner
 * must then also pass the full Jev check. Everything else goes to review.
 */
export function routeP2(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  const early = ledgerRoute(stages);
  if (early) return { ast: null, route: early };
  const first = stages.compileFirst?.ast ?? null;
  const second = stages.compileSecond?.ast ?? null;
  if (!first || stages.degenerateFirst) return { ast: null, route: "REVIEW" };
  if (second && stages.equivalent) {
    return stages.checkFirst?.decision === "candidate_supported" ? { ast: first, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
  }
  if (!second || !stages.adjudication || stages.adjudication === "unresolved") return { ast: null, route: "REVIEW" };
  const winner = stages.adjudication === "candidate_1" ? first : second;
  return stages.checkWinner?.decision === "candidate_supported" ? { ast: winner, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

/**
 * P3: two independent compilers; agreement accepts without a Jev AST check.
 * Jev is used where J8 showed it is needed: the ledger ambiguity gate, and
 * adjudication plus a full check when the compilers disagree.
 */
export function routeP3(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  const early = ledgerRoute(stages);
  if (early) return { ast: null, route: early };
  const first = stages.compileFirst?.ast ?? null;
  const second = stages.compileSecond?.ast ?? null;
  if (!first || stages.degenerateFirst) return { ast: null, route: "REVIEW" };
  if (second && stages.equivalent) return { ast: first, route: "ACCEPT" };
  if (!second || !stages.adjudication || stages.adjudication === "unresolved") return { ast: null, route: "REVIEW" };
  const winner = stages.adjudication === "candidate_1" ? first : second;
  return stages.checkWinner?.decision === "candidate_supported" ? { ast: winner, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

/**
 * P5: P3 with no Jev anywhere. Ambiguity rests on the ledger LLM listing an
 * open choice; code defects go to review; agreement of the compilers accepts.
 */
export function routeP5(stages: J9StageResults): { ast: RuleAst | null; route: J9Route } {
  if (stages.blocked) return { ast: null, route: "BLOCK" };
  if (!stages.ledgerSignals) return { ast: null, route: "UNAVAILABLE" };
  if (stages.ledgerSignals.codeDefects > 0) return { ast: null, route: "REVIEW" };
  if (stages.ledgerSignals.openChoices > 0) return { ast: null, route: "CLARIFY" };
  const first = stages.compileFirst?.ast ?? null;
  if (!first || stages.degenerateFirst || !stages.compileSecond?.ast) return { ast: null, route: "REVIEW" };
  return stages.equivalent ? { ast: first, route: "ACCEPT" } : { ast: null, route: "REVIEW" };
}

export const JEV_J9_POLICY_SHA256 = sha256Canonical({
  adjudicationQuestions: buildAdjudicationQuestions({
    candidates: [
      { behaviorDescription: "", label: "candidate 1" },
      { behaviorDescription: "", label: "candidate 2" },
    ],
    claims: [],
    gameDomain: J8_GAME_DOMAIN,
    productDefaults: J8_PRODUCT_DEFAULTS,
    scenarioNote: "",
    scenarios: [{ draw: [], id: "d1", tickets: [], verdictIfCandidate1: "", verdictIfCandidate2: "" }],
  }),
  bands: { reject: J8_NOUL_REJECT, support: J8_NOUL_SUPPORT },
  choicePolicy: "selected >= 0.7 and confidence >= 0.7",
  policy: JEV_J9_POLICY_VERSION,
  routes: [routeA0, routeP1, routeNOnly, routeP2, routeP3, routeP5, describeWithStructure].map((route) => route.toString()),
});
