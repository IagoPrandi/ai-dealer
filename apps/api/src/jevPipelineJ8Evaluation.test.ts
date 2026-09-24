import assert from "node:assert/strict";
import { test } from "node:test";

import { canonicalJson, validateJevResponse, type JevQuestionSet } from "./jevPipelineEvaluation.js";
import { JEV_PIPELINE_CORPUS_V1 } from "./jevPipelineCorpusV1.js";
import {
  astOutcome,
  astSemanticUnits,
  astTrace,
  buildCandidateQuestions,
  buildLedgerQuestions,
  buildPublicCandidateState,
  buildPublicLedgerState,
  checkClaimLedger,
  deriveCandidateJudgment,
  deriveLedgerJudgment,
  findMaterialTerms,
  j8TerminalRoute,
  parseClaimLedger,
  type ClaimLedger,
} from "./jevPipelineJ8Evaluation.js";
import { J8_HELDOUT_ITEMS } from "./jevPipelineJ8HeldOut.js";

const fixture = (id: string) => {
  const found = JEV_PIPELINE_CORPUS_V1.find((entry) => entry.id === id);
  assert.ok(found, `missing fixture ${id}`);
  return found;
};

const singleClaim = (sourceSpan: string, meaning: string): ClaimLedger => ({
  claims: [{ dimension: "win_condition", id: "c1", meaning, sourceSpan }],
  openChoices: [],
});

function answers(questions: JevQuestionSet, value: (id: string) => number): unknown {
  return {
    answers: Object.fromEntries(Object.keys(questions).map((id) => [id, { noul: value(id), type: "noul" }])),
    model: "test-jev-j8",
    usage: { input_tokens: 10, output_tokens: 2 },
  };
}

test("deterministic preservation catches the J5 P09 universal-quantifier false support", () => {
  const clr05 = fixture("CLR-05");
  const byId = Object.fromEntries(clr05.interpretationVariants.map((variant) => [variant.id, variant.text]));
  assert.deepEqual(checkClaimLedger(clr05.source, singleClaim(clr05.source, byId.reference!)).defects, []);
  const omitted = checkClaimLedger(clr05.source, singleClaim(clr05.source, byId["omit-universal"]!));
  assert.deepEqual(omitted.defects.map((defect) => defect.code), ["LEDGER_MEANING_DROPS_TERM"]);
  assert.match(omitted.defects[0]!.detail, /universal "cada"/u);
  const anyPosition = checkClaimLedger(clr05.source, singleClaim(clr05.source, byId["assume-any-position"]!));
  assert.match(anyPosition.defects[0]!.detail, /same_position/u);
});

test("material terms need a covering claim span, and spans must be copied from the source", () => {
  const source = fixture("CLR-01").source;
  const partial = checkClaimLedger(source, singleClaim("Você vence se", "You win if."));
  assert.ok(partial.defects.some((defect) => defect.code === "LEDGER_MATERIAL_TERM_UNCOVERED"));
  const invented = checkClaimLedger(source, singleClaim("at least three", "at least three"));
  assert.ok(invented.defects.some((defect) => defect.code === "LEDGER_SPAN_NOT_IN_SOURCE"));
  // Accents and case are normalized, so a faithful span copied without them still matches.
  const clean = checkClaimLedger(source, singleClaim("PELO MENOS TRES dos seus seis numeros", "at least three of your six numbers"));
  assert.ok(!clean.defects.some((defect) => defect.code === "LEDGER_SPAN_NOT_IN_SOURCE"));
});

test("nested terms count once: 'menos' inside 'pelo menos' is not a separate comparison", () => {
  const terms = findMaterialTerms("Você vence se pelo menos três números forem sorteados.");
  assert.deepEqual(
    terms.map((term) => `${term.cls}:${term.term}`).sort(),
    ["at_least:pelo menos", "number:tres"],
  );
});

test("uncovered text with content words is surfaced for a residual Jev check", () => {
  const source = fixture("CLR-03").source;
  const check = checkClaimLedger(source, singleClaim("pelo menos dois números sorteados", "at least two drawn numbers"));
  assert.ok(check.uncoveredSegments.length > 0);
  assert.ok(check.uncoveredSegments.some((segment) => segment.includes("empates")));
});

test("ledger parsing is strict and never defaults a field", () => {
  const ok = parseClaimLedger({ claims: [{ dimension: "win_condition", meaning: "at least three", sourceSpan: "pelo menos três" }], openChoices: [] });
  assert.ok("ledger" in ok);
  const cases: unknown[] = [
    null,
    { claims: [], openChoices: [] },
    { claims: [{ dimension: "invented", meaning: "m", sourceSpan: "s" }], openChoices: [] },
    { claims: [{ dimension: "win_condition", meaning: "m​", sourceSpan: "s" }], openChoices: [] },
    { claims: [{ dimension: "win_condition", meaning: "m", sourceSpan: "s" }], extra: true, openChoices: [] },
    { claims: [{ dimension: "win_condition", meaning: "m", sourceSpan: "s" }] },
  ];
  for (const value of cases) {
    const parsed = parseClaimLedger(value);
    assert.ok("defect" in parsed, `accepted ${JSON.stringify(value)}`);
    assert.equal(parsed.defect.code, "LEDGER_MALFORMED");
  }
});

test("AST units flatten conjunctions and expose ranking direction and ties", () => {
  const ranking = astSemanticUnits(fixture("CLR-03").astCandidates[0]!.ast);
  assert.deepEqual(ranking.map((unit) => unit.astPath), ["result.eligibleWhen", "result.direction", "result.tieBreak"]);
  assert.match(ranking[1]!.description, /smallest/u);
  const mutated = astSemanticUnits(fixture("CLR-03").astCandidates[1]!.ast);
  assert.match(mutated[1]!.description, /largest/u);
});

test("the trace carries computed counts, so Jev never has to count", () => {
  const ast = fixture("CLR-01").astCandidates[0]!.ast;
  const trace = astTrace(ast, [10, 20, 1, 2, 3, 4], [10, 20, 30, 40, 50, 60]);
  assert.ok(trace.some((entry) => entry.value === 2 && /how many/u.test(entry.description)));
  assert.ok(trace.some((entry) => entry.value === false));
  // Binder-scoped nodes cannot be evaluated alone and are left out, not
  // guessed; the quantifier instead reports how many positions satisfy it.
  const forall = astTrace(fixture("CLR-05").astCandidates[0]!.ast, [10, 20, 30, 40, 50, 66], [10, 20, 30, 40, 50, 60]);
  assert.equal(forall.length, 2);
  assert.equal(forall[0]!.value, false);
  assert.match(forall[1]!.description, /^how many of the 6 positions satisfy: .*at most 5$/u);
  assert.equal(forall[1]!.value, 5);
});

test("public states carry no hidden labels", () => {
  const clr01 = fixture("CLR-01");
  const ledger = singleClaim(clr01.source, clr01.referenceInterpretation);
  const ledgerState = buildPublicLedgerState(clr01.source, "pt", ledger, []);
  const candidateState = buildPublicCandidateState(ledger, clr01.astCandidates[1]!.ast, clr01.behaviorFixtures);
  const serialized = canonicalJson({ candidateState, ledgerState });
  for (const hidden of ["expectedWin", "expectedP01", "mutationNote", "threshold-two", "semantic_mutation", "exact-threshold"]) {
    assert.ok(!serialized.includes(hidden), `leaked ${hidden}`);
  }
});

test("ledger routing is fail-closed and code-owned defects route first", () => {
  const clr01 = fixture("CLR-01");
  const ledger = { ...singleClaim(clr01.source, clr01.referenceInterpretation), openChoices: [{ id: "q1", question: "Ties?", sourceSpan: null }] };
  const state = buildPublicLedgerState(clr01.source, "pt", ledger, ["x"]);
  const questions = buildLedgerQuestions(state);
  const respond = (value: (id: string) => number) => validateJevResponse(answers(questions, value), questions);
  // Clean answers: supported, not vague, choice decided, segment immaterial.
  const clean = (id: string) => (id.endsWith("_vague") || id.endsWith("_material") ? 0.05 : 0.95);
  const decide = (override: Record<string, number>) =>
    deriveLedgerJudgment(state, respond((id) => override[id] ?? clean(id)), []).decision;
  assert.equal(deriveLedgerJudgment(state, null, [{ code: "LEDGER_SPAN_NOT_IN_SOURCE", detail: "c1" }]).decision, "REVIEW_LEDGER_INCOMPLETE");
  assert.equal(decide({}), "LEDGER_VERIFIED");
  assert.equal(decide({ claim_0_supported: 0.6 }), "REVIEW_INTERPRETATION_DEFECT");
  assert.equal(decide({ segment_0_material: 0.5 }), "REVIEW_LEDGER_INCOMPLETE");
  assert.equal(decide({ open_0_decided: 0.7 }), "CLARIFY");
  assert.equal(decide({ claim_0_vague: 0.5 }), "CLARIFY");
  // A confidently vague claim goes to the player even when its translation is also doubted.
  assert.equal(decide({ claim_0_supported: 0.3, claim_0_vague: 0.9 }), "CLARIFY");
  assert.equal(decide({ claim_0_supported: 0.3, open_0_decided: 0.1 }), "CLARIFY");
});

test("a Jev-supported candidate still fails when a behavior fixture fails", () => {
  const clr01 = fixture("CLR-01");
  const ledger = singleClaim(clr01.source, clr01.referenceInterpretation);
  const state = buildPublicCandidateState(ledger, clr01.astCandidates[1]!.ast, clr01.behaviorFixtures);
  const questions = buildCandidateQuestions(state);
  const allYes = deriveCandidateJudgment(questions, validateJevResponse(answers(questions, () => 0.95), questions));
  assert.equal(allYes.decision, "candidate_supported");
  const verified = { decision: "LEDGER_VERIFIED" as const, reasons: [] };
  assert.equal(j8TerminalRoute({ blocked: false, candidate: allYes, fixturesPass: false, ledger: verified, unavailable: false }), "REJECT_CANDIDATE");
  assert.equal(j8TerminalRoute({ blocked: false, candidate: allYes, fixturesPass: true, ledger: verified, unavailable: false }), "ACCEPT");
  const oneUncertain = deriveCandidateJudgment(questions, validateJevResponse(answers(questions, (id) => (id === "scenario_1" ? 0.5 : 0.95)), questions));
  assert.equal(oneUncertain.decision, "insufficient_evidence");
  const oneNo = deriveCandidateJudgment(questions, validateJevResponse(answers(questions, (id) => (id === "forward_0" ? 0.1 : 0.5)), questions));
  assert.equal(oneNo.decision, "candidate_defect");
  assert.equal(j8TerminalRoute({ blocked: true, candidate: allYes, fixturesPass: true, ledger: verified, unavailable: false }), "BLOCK");
  assert.equal(j8TerminalRoute({ blocked: false, candidate: null, fixturesPass: true, ledger: null, unavailable: true }), "UNAVAILABLE");
});

test("held-out references pass their scenarios and every mutation is behaviorally different", () => {
  for (const item of J8_HELDOUT_ITEMS) {
    const reference = item.candidates.find((candidate) => candidate.kind === "reference");
    if (!reference) continue;
    const expected = item.scenarios.map((scenario) => canonicalJson(astOutcome(reference.ast, scenario)));
    for (const mutation of item.candidates.filter((candidate) => candidate.kind === "semantic_mutation")) {
      const observed = item.scenarios.map((scenario) => canonicalJson(astOutcome(mutation.ast, scenario)));
      assert.notDeepEqual(observed, expected, `${item.id}/${mutation.id} is not distinguishable`);
    }
  }
});
