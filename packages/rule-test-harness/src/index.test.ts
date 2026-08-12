import assert from "node:assert/strict";
import { test } from "node:test";

import type { RuleAst } from "@tyche/rule-schema";

import {
  classifyDifficulty,
  collectWorkedExamples,
  generateAndRunTests,
  hasWinningWitness,
} from "./index.js";

const matchAtLeast = (value: number): RuleAst => ({
  schemaVersion: 2,
  result: {
    type: "predicate",
    predicate: {
      kind: "count_at_least",
      value,
      of: {
        kind: "intersection",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
      },
    },
  },
});

const unitsRanking: RuleAst = {
  schemaVersion: 2,
  result: {
    type: "ranking",
    direction: "max",
    tieBreak: "share_pool",
    score: {
      kind: "reduce",
      op: "count",
      of: {
        kind: "intersection",
        left: { kind: "digits", place: "units", of: { kind: "source", source: "guess" } },
        right: { kind: "digits", place: "units", of: { kind: "source", source: "draw" } },
      },
    },
  },
};

test("a balanced predicate passes the harness with full coverage", () => {
  // "match at least 1 of 6" ~ 0.31 win rate -> BALANCED.
  const summary = generateAndRunTests(matchAtLeast(1));
  assert.equal(summary.passed, summary.total);
  assert.equal(summary.coverageScore, 1);
  assert.equal(summary.difficulty.difficultyClass, "BALANCED");
});

test("a jackpot-rare predicate is allowed (not auto-rejected)", () => {
  // "match at least 4 of 6 from 100" is a valid but extremely rare rule. It must
  // still pass coverage (only ALWAYS_TRUE is degenerate).
  const summary = generateAndRunTests(matchAtLeast(4));
  assert.equal(summary.coverageScore, 1);
});

test("an ALWAYS_TRUE rule is labelled but still allowed (full coverage)", () => {
  // count_at_least 0 over guess is always true. Allowed per policy; difficulty is
  // only a label, not a gate.
  const alwaysTrue: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "count_at_least",
        value: 0,
        of: { kind: "source", source: "guess" },
      },
    },
  };
  const summary = generateAndRunTests(alwaysTrue);
  assert.equal(summary.difficulty.difficultyClass, "ALWAYS_TRUE");
  assert.equal(summary.coverageScore, 1);
});

test("an IMPOSSIBLE rule is detected", () => {
  // require 6 matches AND exactly 5 matches -> impossible.
  const impossible: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "and",
        clauses: [
          {
            kind: "count_at_least",
            value: 6,
            of: {
              kind: "intersection",
              left: { kind: "source", source: "guess" },
              right: { kind: "source", source: "draw" },
            },
          },
          {
            kind: "compare",
            op: "eq",
            left: { kind: "lit", value: 1 },
            right: { kind: "lit", value: 2 },
          },
        ],
      },
    },
  };
  assert.equal(classifyDifficulty(impossible).difficultyClass, "IMPOSSIBLE");
});

test("a ranking rule is never IMPOSSIBLE and surfaces non-winners", () => {
  const summary = generateAndRunTests(unitsRanking);
  assert.notEqual(summary.difficulty.difficultyClass, "IMPOSSIBLE");
  assert.equal(summary.cases.find((c) => c.name === "has_winning_case")?.passed, true);
  assert.equal(summary.cases.find((c) => c.name === "has_losing_case")?.passed, true);
  assert.equal(summary.cases.find((c) => c.name === "deterministic")?.passed, true);
});

test("an AST-pinned exact guess set is rare but constructibly winnable", () => {
  const values = [8, 16, 24, 32, 40, 48];
  const ast: RuleAst = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "and",
        clauses: values.map((value) => ({
          kind: "contains" as const,
          array: { kind: "source" as const, source: "guess" as const },
          value: { kind: "lit" as const, value },
        })),
      },
    },
  };

  assert.equal(hasWinningWitness(ast), true);
  assert.equal(classifyDifficulty(ast).difficultyClass, "EXTREME");
  assert.ok(collectWorkedExamples(ast).some((example) => example.outcome === "WIN"));
});

test("difficulty estimate is reproducible for the same AST", () => {
  assert.deepEqual(classifyDifficulty(matchAtLeast(4)), classifyDifficulty(matchAtLeast(4)));
});
