import assert from "node:assert/strict";
import { test } from "node:test";

import {
  boundaryEvidence,
  buildCompiledArtifact,
  buildEvidenceLibrary,
  describeRuleAstTotal,
  disagreements,
  exactlyOnePaths,
  gateCompilerCandidate,
  getRuleCompilationCandidateJsonSchema,
  hasExternalDependency,
  ruleAstSchema,
  seededRandomScenarios,
  sourceNumbers,
  validateAndPrecompileRule,
  type RuleAst,
} from "./index.js";

const source = (side: "draw" | "guess") => ({ kind: "source", source: side });
const lit = (value: number) => ({ kind: "lit", value });
const hits = {
  kind: "reduce",
  of: { kind: "intersection", left: source("guess"), right: source("draw") },
  op: "count",
};
const guessSum = { kind: "reduce", of: source("guess"), op: "sum" };
const cmp = (op: string, left: unknown, right: unknown) => ({ kind: "compare", left, op, right });
const not = (clause: unknown) => ({ clause, kind: "not" });
const and = (...clauses: unknown[]) => ({ clauses, kind: "and" });
const or = (...clauses: unknown[]) => ({ clauses, kind: "or" });
const predicate = (node: unknown): RuleAst =>
  ruleAstSchema.parse({ result: { predicate: node, type: "predicate" }, schemaVersion: 3 });

const A = cmp("gte", hits, lit(3));
const B = cmp("gt", guessSum, lit(300));

// ---------------------------------------------------------------------------
// Protocol tie statements (BENCH-M04 / BENCH-C01 false blocks).

test("ranking rules whose tie clause names the tied entries are not external dependencies", () => {
  for (const text of [
    // BENCH-M04, BENCH-C01: the exact regressions.
    "Among all submitted tickets, the ticket matching the greatest number of drawn numbers wins. Tied tickets all win and share the prize.",
    "Only tickets matching at least two drawn numbers are eligible. Among eligible tickets, the ticket with the smallest difference between its highest and lowest number wins; all ties win and share the prize.",
    // Paraphrases of the same settlement statement.
    "The ticket with the most matches wins. Tied tickets share the prize.",
    "The highest sum wins; tied guesses split the prize equally.",
    "The lowest total wins, and ties win and share the pool.",
  ]) {
    assert.equal(hasExternalDependency(text), false, text);
  }
});

test("a tie statement still cannot carry an external condition or use the prize as an input", () => {
  for (const text of [
    "Tied tickets share the prize only if it rains.",
    "Tied tickets all win and share the prize pool of the previous round.",
    "Among all submitted tickets, the ticket with the largest prize wins.",
    "A ticket wins only when the current prize pool is above 10 SOL.",
  ]) {
    assert.equal(hasExternalDependency(text), true, text);
  }
});

// ---------------------------------------------------------------------------
// Deterministic description of Boolean structure.

test("nested and/or operands are grouped so the description has one reading", () => {
  const C = cmp("lt", guessSum, lit(100));
  const text = describeRuleAstTotal(predicate(or(and(A, B), C)));
  assert.match(text, /\(.+ and .+\) or /u);
  const negatedConjunction = describeRuleAstTotal(predicate(and(not(and(A, B)), C)));
  assert.match(negatedConjunction, /it is not the case that \(.+ and .+\)/u);
  // A top-level conjunction goes through its own renderer; it must group too.
  const disjunctionInConjunction = describeRuleAstTotal(predicate(and(or(A, B), C)));
  assert.match(disjunctionInConjunction, /^A guess wins if \(.+ or .+\) and /u);
});

test("a flat conjunction is rendered without added grouping", () => {
  const text = describeRuleAstTotal(predicate(and(A, B)));
  assert.doesNotMatch(text, /\(\d\)|\(.+ and .+\)/u);
});

test("both exactly-one-of encodings render as an enumerated exclusive choice", () => {
  const expanded = or(and(A, not(B)), and(not(A), B));
  const pairwise = and(or(A, B), not(and(A, B)));
  for (const node of [expanded, pairwise]) {
    assert.ok(exactlyOnePaths(node), JSON.stringify(node));
    const text = describeRuleAstTotal(predicate(node));
    assert.match(text, /exactly one of these holds: \(1\) .+; \(2\) .+/u, text);
  }
  // One-dimension mutation: inclusive or is not exactly-one.
  assert.equal(exactlyOnePaths(or(and(A, not(B)), and(A, B))), null);
  assert.equal(exactlyOnePaths(or(A, B)), null);
});

// ---------------------------------------------------------------------------
// Deterministic gates on an AST-only compiler candidate.

test("gateCompilerCandidate passes a sound rule and names each deterministic failure", () => {
  assert.deepEqual(gateCompilerCandidate(predicate(A)).reasonCodes, []);
  assert.deepEqual(gateCompilerCandidate({ result: { type: "predicate" }, schemaVersion: 3 }).reasonCodes, ["SCHEMA_INVALID"]);
  assert.deepEqual(gateCompilerCandidate(null).reasonCodes, ["SCHEMA_INVALID"]);
  const vacuous = and(A, { kind: "forall", of: source("guess"), where: cmp("gte", { kind: "elem" }, lit(1)) });
  assert.ok(gateCompilerCandidate(predicate(vacuous)).reasonCodes.includes("VACUOUS_CONDITION"));
  assert.ok(gateCompilerCandidate(predicate(cmp("gte", hits, lit(0)))).reasonCodes.includes("DIFFICULTY_ALWAYS_TRUE"));
  assert.ok(gateCompilerCandidate(predicate(cmp("gt", hits, lit(6)))).reasonCodes.includes("DIFFICULTY_IMPOSSIBLE"));
});

test("buildCompiledArtifact reproduces the deterministic compiler's artifact and hash", () => {
  const prompt = "A guess wins if at least 3 of its numbers match the draw.";
  const timestamp = "2026-09-22T00:00:00.000Z";
  const deterministic = validateAndPrecompileRule({ prompt, ruleId: 7, timestamp, tokenCount: 14 });
  assert.equal(deterministic.decision, "VALID");
  const artifact = deterministic.artifact!;
  const gate = gateCompilerCandidate(artifact.ast);
  assert.deepEqual(gate.reasonCodes, []);
  const rebuilt = buildCompiledArtifact({
    ast: gate.ast!,
    bounds: gate.bounds!,
    constrainedDecodingUsed: artifact.constrainedDecodingUsed,
    harness: gate.harness,
    modelIdentity: artifact.modelIdentity,
    normalizedText: artifact.normalizedText,
    provenanceRecords: artifact.provenanceRecords ?? [],
    providerPath: artifact.providerPath,
    request: { prompt },
    sourceSpans: artifact.sourceSpans,
    timestamp,
    workedExamples: artifact.workedExamples,
  });
  assert.deepEqual(rebuilt.artifact, artifact);
  assert.equal(rebuilt.artifactHash, deterministic.artifactHash);
});

// ---------------------------------------------------------------------------
// Behavioral evidence.

test("the seeded random library is reproducible and inside the ticket domain", () => {
  const first = seededRandomScenarios();
  assert.deepEqual(seededRandomScenarios(), first);
  assert.equal(first.length, 200);
  for (const scenario of first) {
    for (const ticket of [scenario.draw, ...Object.values(scenario.entries ?? {})]) {
      assert.equal(new Set(ticket).size, 6);
      assert.ok(ticket.every((value) => Number.isInteger(value) && value >= 1 && value <= 100));
    }
    assert.deepEqual(scenario.guess, scenario.entries?.["player-A"]);
  }
});

test("sourceNumbers reads digits and number words in both languages", () => {
  assert.ok(sourceNumbers("pelo menos três números").includes(3));
  assert.ok(sourceNumbers("at least five matches").includes(5));
  assert.ok(sourceNumbers("sum above 250").includes(250));
});

test("boundary evidence finds the verdict flip and flags a vacuous rule", () => {
  const library = buildEvidenceLibrary("at least 3 matches");
  const random = seededRandomScenarios();
  const evidence = boundaryEvidence(predicate(A), library, random);
  assert.equal(evidence.degenerate, null);
  assert.equal(evidence.source, "boundary_pairs");
  assert.deepEqual(evidence.scenarios.slice(0, 2).map((scenario) => scenario.id), ["matches_anywhere:2", "matches_anywhere:3"]);
  assert.equal(boundaryEvidence(predicate(cmp("gte", hits, lit(0))), library, random).degenerate, "always_wins");
});

test("boundary pairs never repeat a ticket another chosen pair already shows", () => {
  // Distance 0 in both same-position distance families is the draw itself;
  // "sum above the draw's sum" flips at distance 0 -> 1 in both (J11 BENCH-S02).
  const drawSum = { kind: "reduce", of: source("draw"), op: "sum" };
  const evidence = boundaryEvidence(predicate(cmp("gt", guessSum, drawSum)), buildEvidenceLibrary("greater than the sum of the six drawn numbers"), seededRandomScenarios());
  const tickets = evidence.scenarios.map((scenario) => scenario.guess!.join(","));
  assert.equal(new Set(tickets).size, tickets.length, tickets.join(" | "));
  assert.equal(evidence.scenarios.length, 4);
});

test("equivalence is behavioral: different shapes agree, a threshold change does not", () => {
  const library = buildEvidenceLibrary("at least 3 matches");
  const random = seededRandomScenarios();
  assert.deepEqual(disagreements(predicate(A), predicate(not(cmp("lt", hits, lit(3)))), library, random), []);
  assert.ok(disagreements(predicate(A), predicate(cmp("gte", hits, lit(4))), library, random).length > 0);
});

test("the AST-only candidate schema asks for the AST and nothing else", () => {
  const schema = getRuleCompilationCandidateJsonSchema({ astOnly: true }) as {
    additionalProperties: boolean;
    definitions?: Record<string, unknown>;
    properties: Record<string, unknown>;
    required: string[];
  };
  assert.deepEqual(Object.keys(schema.properties), ["ast"]);
  assert.deepEqual(schema.required, ["ast"]);
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.definitions && Object.keys(schema.definitions).length > 0);
  const full = getRuleCompilationCandidateJsonSchema() as { properties: Record<string, unknown> };
  assert.ok("workedExamples" in full.properties);
});
