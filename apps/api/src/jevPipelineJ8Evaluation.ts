import { sha256Canonical } from "./jevPipelineEvaluation.js";
import { JEV_NOUL_NO, JEV_NOUL_YES } from "./jev.js";
import {
  buildLedgerQuestions,
  CLAIM_LEDGER_SYSTEM_PROMPT,
  INSTRUCTION_BOUNDARY,
  RULE_GAME_DOMAIN,
  RULE_PRODUCT_DEFAULTS,
  type LedgerJudgment,
} from "./ruleClaimLedger.js";
import {
  buildCandidateQuestions,
  type CandidateJudgment,
} from "./ruleSemanticChecks.js";

// J8 replaces the J1-J5 open-world questions ("does the text state EVERY
// material X?") with closed, aligned pairs. Code enumerates and computes; an
// LLM decomposes the source into a claim ledger; Jev only compares one short
// piece of evidence with one short claim. Nothing here authorizes a rule.
//
// The ledger, its checks and questions, the candidate check and the evidence
// helpers are now production code (./ruleClaimLedger.ts,
// ./ruleSemanticChecks.ts, @tyche/rule-compiler). This module keeps the J8
// names for its runners and tests.

export const JEV_J8_STATE_SCHEMA_VERSION = "jev-j8-claim-ledger-state-v2" as const;
export const JEV_J8_QUESTION_SET_VERSION =
  "jev-j8-claim-ledger-questions-v2" as const;
export const JEV_J8_DECISION_POLICY_VERSION =
  "jev-j8-fail-closed-0.20-0.80-v2" as const;
export const JEV_J8_LEDGER_PROMPT_VERSION = "jev-j8-ledger-prompt-v2" as const;

/** Experimental bands. A Noul at or above SUPPORT counts as yes, at or below REJECT as no. */
export const J8_NOUL_SUPPORT = JEV_NOUL_YES;
export const J8_NOUL_REJECT = JEV_NOUL_NO;
export const J8_GAME_DOMAIN = RULE_GAME_DOMAIN;
export const J8_PRODUCT_DEFAULTS = RULE_PRODUCT_DEFAULTS;
export const J8_LEDGER_SYSTEM_PROMPT = CLAIM_LEDGER_SYSTEM_PROMPT;
export {
  CLAIM_LEDGER_MAX_CLAIMS as J8_MAX_CLAIMS,
  CLAIM_LEDGER_MAX_OPEN_CHOICES as J8_MAX_OPEN_CHOICES,
} from "./ruleClaimLedger.js";
export { MAX_TRACE_ENTRIES as J8_MAX_TRACE_ENTRIES } from "@tyche/rule-compiler";

export {
  buildLedgerQuestions,
  buildPublicLedgerState,
  checkClaimLedger,
  CLAIM_DIMENSIONS,
  deriveLedgerJudgment,
  findMaterialTerms,
  normalizeLedgerText as normalizeForMatch,
  parseClaimLedger,
  type ClaimDimension,
  type ClaimLedger,
  type LedgerCheck,
  type LedgerClaim,
  type LedgerDecision,
  type LedgerDefect,
  type LedgerDefectCode,
  type LedgerJudgment,
  type LedgerOpenChoice,
  type MaterialClass,
  type MaterialTerm,
  type PublicLedgerState,
} from "./ruleClaimLedger.js";
export {
  buildCandidateQuestions,
  buildPublicCandidateState,
  buildPublicScenario,
  deriveCandidateJudgment,
  type CandidateDecision,
  type CandidateJudgment,
  type PublicCandidateState,
  type PublicScenario,
} from "./ruleSemanticChecks.js";
export {
  astOutcome,
  astSemanticUnits,
  astTrace,
  type AstUnit,
  type ScenarioInput,
  type TicketFacts,
  type TraceEntry,
} from "@tyche/rule-compiler";

// ---------------------------------------------------------------------------
// Fail-closed decisions.

export type J8TerminalRoute = "ACCEPT" | "BLOCK" | "CLARIFY" | "REJECT_CANDIDATE" | "REVIEW" | "UNAVAILABLE";

/**
 * Terminal route for one candidate. Deterministic behavior fixtures stay
 * authoritative: a Jev-supported candidate that fails any fixture is rejected.
 */
export function j8TerminalRoute(params: {
  blocked: boolean;
  candidate: CandidateJudgment | null;
  fixturesPass: boolean | null;
  ledger: LedgerJudgment | null;
  unavailable: boolean;
}): J8TerminalRoute {
  if (params.blocked) return "BLOCK";
  if (params.unavailable || !params.ledger) return "UNAVAILABLE";
  if (params.ledger.decision === "CLARIFY") return "CLARIFY";
  if (params.ledger.decision !== "LEDGER_VERIFIED") return "REVIEW";
  if (!params.candidate) return "UNAVAILABLE";
  if (params.candidate.decision === "candidate_defect") return "REJECT_CANDIDATE";
  if (params.candidate.decision === "insufficient_evidence") return "REVIEW";
  return params.fixturesPass === true ? "ACCEPT" : "REJECT_CANDIDATE";
}

export const JEV_J8_QUESTION_POLICY_SHA256 = sha256Canonical({
  bands: { reject: J8_NOUL_REJECT, support: J8_NOUL_SUPPORT },
  candidateQuestions: buildCandidateQuestions({
    candidate: { behaviorDescription: "", units: [{ description: "" }] },
    claims: [{ dimension: "win_condition", meaning: "" }],
    gameDomain: J8_GAME_DOMAIN,
    productDefaults: J8_PRODUCT_DEFAULTS,
    scenarioNote: "",
    scenarios: [{ astVerdict: "", draw: [], id: "s1", tickets: [] }],
  }),
  decisionPolicy: JEV_J8_DECISION_POLICY_VERSION,
  ledgerPrompt: J8_LEDGER_SYSTEM_PROMPT,
  ledgerQuestions: buildLedgerQuestions({
    claims: [{ dimension: "win_condition", meaning: "", sourceSpan: "" }],
    gameDomain: J8_GAME_DOMAIN,
    instructionBoundary: INSTRUCTION_BOUNDARY,
    openChoices: [{ question: "", sourceSpan: null }],
    productDefaults: J8_PRODUCT_DEFAULTS,
    source: { language: "en", text: "" },
    uncoveredSegments: [""],
  }),
  questionSet: JEV_J8_QUESTION_SET_VERSION,
  stateSchema: JEV_J8_STATE_SCHEMA_VERSION,
});
