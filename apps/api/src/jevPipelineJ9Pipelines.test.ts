import assert from "node:assert/strict";
import { test } from "node:test";

import { ruleAstSchema, type RuleAst } from "@tyche/rule-compiler";

import { validateJevResponse } from "./jevPipelineEvaluation.js";
import { JEV_PIPELINE_CORPUS_V1 } from "./jevPipelineCorpusV1.js";
import { J9_FRESH_ITEMS } from "./jevPipelineJ9Fresh.js";
import {
  boundaryEvidence,
  buildAdjudicationQuestions,
  buildAdjudicationState,
  buildEvidenceLibrary,
  deriveAdjudication,
  describeWithStructure,
  disagreements,
  exactlyOnePaths,
  routeA0,
  routeNOnly,
  routeP1,
  routeP2,
  routeP3,
  routeP5,
  type J9StageResults,
} from "./jevPipelineJ9Pipelines.js";

const fixture = (id: string) => {
  const found = JEV_PIPELINE_CORPUS_V1.find((entry) => entry.id === id);
  assert.ok(found);
  return found;
};
const fresh = (id: string) => {
  const found = J9_FRESH_ITEMS.find((entry) => entry.id === id);
  assert.ok(found);
  return found;
};
const constant = (value: boolean): RuleAst =>
  ruleAstSchema.parse({ result: { predicate: { kind: "compare", left: { kind: "lit", value: 1 }, op: value ? "eq" : "gt", right: { kind: "lit", value: 1 } }, type: "predicate" }, schemaVersion: 3 });

test("evidence families are contiguous and ordered, so adjacent members are real boundaries", () => {
  const library = buildEvidenceLibrary(fixture("CLR-05").source);
  const families = library.map((scenario) => scenario.family);
  for (const family of new Set(families)) {
    const first = families.indexOf(family);
    const last = families.lastIndexOf(family);
    assert.ok(families.slice(first, last + 1).every((name) => name === family), `${family} is interleaved`);
  }
  const evidence = boundaryEvidence(fixture("CLR-05").astCandidates[0]!.ast, library, []);
  assert.equal(evidence.source, "boundary_pairs");
  assert.deepEqual(evidence.scenarios.slice(0, 2).map((scenario) => scenario.id), ["same_position_distance_all:5", "same_position_distance_all:6"]);
});

test("vacuous ASTs are caught by code before any model call", () => {
  const library = buildEvidenceLibrary("You win.");
  assert.equal(boundaryEvidence(constant(true), library, []).degenerate, "always_wins");
  assert.equal(boundaryEvidence(constant(false), library, []).degenerate, "always_loses");
});

test("disagreement search finds the inclusive-boundary mutation", () => {
  const clr05 = fixture("CLR-05");
  const found = disagreements(clr05.astCandidates[0]!.ast, clr05.astCandidates[1]!.ast, buildEvidenceLibrary(clr05.source), []);
  assert.ok(found.some((scenario) => scenario.id === "same_position_distance_all:5"));
  assert.equal(disagreements(clr05.astCandidates[0]!.ast, clr05.astCandidates[0]!.ast, buildEvidenceLibrary(clr05.source), []).length, 0);
});

test("the exactly-one structure is recognized in every compiled shape and never in plain or", () => {
  const xor = fresh("FR-C7");
  const reference = xor.candidates.find((candidate) => candidate.kind === "reference")!.ast;
  const either = xor.candidates.find((candidate) => candidate.kind === "semantic_mutation")!.ast;
  assert.match(describeWithStructure(reference), /exactly one of these conditions must hold/u);
  assert.doesNotMatch(describeWithStructure(either), /exactly one/u);
  const a = { kind: "compare", left: { kind: "lit", value: 1 }, op: "eq", right: { kind: "lit", value: 1 } };
  const b = { kind: "compare", left: { kind: "lit", value: 2 }, op: "eq", right: { kind: "lit", value: 2 } };
  const c = { kind: "compare", left: { kind: "lit", value: 3 }, op: "eq", right: { kind: "lit", value: 3 } };
  const not = (clause: unknown) => ({ clause, kind: "not" });
  const and = (...clauses: unknown[]) => ({ clauses, kind: "and" });
  const or = (...clauses: unknown[]) => ({ clauses, kind: "or" });
  assert.equal(exactlyOnePaths(and(or(a, b, c), not(and(a, b)), not(and(a, c)), not(and(b, c))))?.length, 3);
  assert.equal(exactlyOnePaths(or(and(a, not(b), not(c)), and(not(a), b, not(c)), and(not(a), not(b), c)))?.length, 3);
  // Missing one pairwise exclusion is "at least one, not all pairs", not exactly one.
  assert.equal(exactlyOnePaths(and(or(a, b, c), not(and(a, b)), not(and(a, c)))), null);
  assert.equal(exactlyOnePaths(or(a, b)), null);
});

test("adjudication needs both sides of every scenario and an agreeing confident Choice", () => {
  const clr01 = fixture("CLR-01");
  const ledger = { claims: [{ dimension: "win_condition" as const, id: "c1", meaning: "at least three of your six numbers are present in the draw", sourceSpan: clr01.source }], openChoices: [] };
  const [right, wrong] = [clr01.astCandidates[0]!.ast, clr01.astCandidates[1]!.ast];
  const shown = disagreements(right, wrong, buildEvidenceLibrary(clr01.source), []).slice(0, 2);
  const state = buildAdjudicationState(ledger, right, wrong, shown, false);
  const questions = buildAdjudicationQuestions(state);
  const respond = (noul: (id: string) => number, choice: string, confidence: number) =>
    validateJevResponse(
      {
        answers: Object.fromEntries(
          Object.entries(questions).map(([id, question]) =>
            question.type === "choice"
              ? [id, { choice, confidence, probabilities: Object.fromEntries(Object.keys(question.criteria).map((key) => [key, key === choice ? 0.9 : 0.05])), type: "choice" }]
              : [id, { noul: noul(id), type: "noul" }],
          ),
        ),
        model: "test",
        usage: { input_tokens: 1, output_tokens: 1 },
      },
      questions,
    );
  const clean = (id: string) => (id.endsWith("_1") ? 0.95 : 0.05);
  assert.equal(deriveAdjudication(state, respond(clean, "candidate_1", 0.9)), "candidate_1");
  assert.equal(deriveAdjudication(state, respond(clean, "candidate_2", 0.9)), "unresolved");
  assert.equal(deriveAdjudication(state, respond(clean, "candidate_1", 0.5)), "unresolved");
  assert.equal(deriveAdjudication(state, respond((id) => (id === "scenario_1_candidate_2" ? 0.4 : clean(id)), "candidate_1", 0.9)), "unresolved");
  // Candidate verdicts are shown, but neither candidate's own sub-expression trace is.
  assert.ok(state.scenarios.every((scenario) => scenario.tickets.every((ticket) => ticket.astComputedValues.length === 0)));
});

test("routes: ambiguity and review always precede acceptance, and A0 has no semantic gate", () => {
  const ast = fixture("CLR-01").astCandidates[0]!.ast;
  const supported = { decision: "candidate_supported" as const, negative: [], uncertain: [] };
  const base: J9StageResults = {
    adjudication: null,
    blocked: false,
    checkFirst: supported,
    checkRegenerated: null,
    checkWinner: supported,
    compileFirst: { ast, error: null },
    compileRegenerated: null,
    compileSecond: { ast, error: null },
    degenerateFirst: null,
    equivalent: true,
    ledger: { decision: "LEDGER_VERIFIED", reasons: [] },
    ledgerSignals: { codeDefects: 0, openChoices: 0 },
  };
  for (const route of [routeP1, routeP2, routeP3, routeNOnly]) assert.equal(route(base).route, "ACCEPT");
  const clarify = { ...base, ledger: { decision: "CLARIFY" as const, reasons: [] } };
  for (const route of [routeP1, routeP2, routeP3, routeNOnly]) assert.equal(route(clarify).route, "CLARIFY");
  assert.equal(routeA0(clarify).route, "ACCEPT");
  const uncertain = { ...base, checkFirst: { decision: "insufficient_evidence" as const, negative: [], uncertain: ["forward_0"] } };
  assert.equal(routeP1(uncertain).route, "REVIEW");
  assert.equal(routeP2(uncertain).route, "REVIEW");
  assert.equal(routeP3(uncertain).route, "ACCEPT");
  const split = { ...base, adjudication: "unresolved" as const, equivalent: false };
  for (const route of [routeP2, routeP3, routeNOnly]) assert.equal(route(split).route, "REVIEW");
  const adjudicated = { ...base, adjudication: "candidate_2" as const, equivalent: false };
  assert.equal(routeP3(adjudicated).route, "ACCEPT");
  assert.equal(routeP3({ ...adjudicated, checkWinner: uncertain.checkFirst }).route, "REVIEW");
  assert.equal(routeP1({ ...base, degenerateFirst: "always_wins" }).route, "REVIEW");
  assert.equal(routeP3({ ...base, blocked: true }).route, "BLOCK");
  // P5 has no Jev: it clarifies only when the ledger LLM itself lists an open
  // choice, so a Jev-only vagueness verdict does not stop it.
  assert.equal(routeP5(clarify).route, "ACCEPT");
  assert.equal(routeP5({ ...base, ledgerSignals: { codeDefects: 0, openChoices: 1 } }).route, "CLARIFY");
  assert.equal(routeP5({ ...base, ledgerSignals: { codeDefects: 2, openChoices: 0 } }).route, "REVIEW");
});

test("a predicate and a ranking candidate can still be adjudicated on shared scenarios", () => {
  const sum = { kind: "reduce", of: { kind: "source", source: "guess" }, op: "sum" };
  const ranking = ruleAstSchema.parse({ result: { direction: "max", score: sum, tieBreak: "share_pool", type: "ranking" }, schemaVersion: 3 });
  const predicate = ruleAstSchema.parse({ result: { predicate: { kind: "compare", left: sum, op: "gt", right: { kind: "lit", value: 200 } }, type: "predicate" }, schemaVersion: 3 });
  const found = disagreements(predicate, ranking, buildEvidenceLibrary("Vence o jogo com a maior soma."), []);
  assert.ok(found.length > 0);
  const state = buildAdjudicationState({ claims: [], openChoices: [] }, predicate, ranking, found.slice(0, 2), false);
  assert.ok(state.scenarios.every((scenario) => /loses|wins/u.test(scenario.verdictIfCandidate1) && /Winning tickets|No ticket/u.test(scenario.verdictIfCandidate2)));
});
