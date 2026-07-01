import assert from "node:assert/strict";
import { test } from "node:test";

import {
  CURRENT_SCHEMA_VERSION,
  getRuleAstJsonSchema,
  isRankingRule,
  ruleAstSchema,
  type RuleAst,
} from "./index.js";

const predicateRule: RuleAst = {
  schemaVersion: 2,
  result: {
    type: "predicate",
    predicate: {
      kind: "count_at_least",
      value: 4,
      of: {
        kind: "intersection",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
      },
    },
  },
};

const rankingDigitRule: RuleAst = {
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
        left: {
          kind: "digits",
          place: "units",
          of: { kind: "source", source: "guess" },
        },
        right: {
          kind: "digits",
          place: "units",
          of: { kind: "source", source: "draw" },
        },
      },
    },
  },
};

test("accepts valid v2 predicate and ranking rules", () => {
  assert.equal(ruleAstSchema.safeParse(predicateRule).success, true);
  assert.equal(ruleAstSchema.safeParse(rankingDigitRule).success, true);
  assert.equal(isRankingRule(rankingDigitRule), true);
  assert.equal(isRankingRule(predicateRule), false);
});

test("accepts objective filter and ordered-comparison nodes", () => {
  const rule: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "and",
        clauses: [
          {
            kind: "all_ordered_compare",
            left: { kind: "source", source: "guess" },
            op: "lt",
            right: { kind: "source", source: "draw" },
          },
          {
            kind: "compare",
            left: {
              kind: "reduce",
              op: "count",
              of: {
                kind: "filter_mod",
                modulus: 2,
                equals: 0,
                of: { kind: "source", source: "guess" },
              },
            },
            op: "eq",
            right: {
              kind: "reduce",
              op: "count",
              of: {
                kind: "filter_compare",
                op: "gt",
                value: 50,
                of: { kind: "source", source: "draw" },
              },
            },
          },
        ],
      },
    },
  };

  assert.equal(ruleAstSchema.safeParse(rule).success, true);
});

test("accepts legacy v1 rules", () => {
  assert.equal(
    ruleAstSchema.safeParse({ schemaVersion: 1, node: { kind: "sum_equals" } })
      .success,
    true,
  );
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 1,
      node: { kind: "match_count_at_least", value: 4 },
    }).success,
    true,
  );
});

test("rejects unknown nodes and unsafe operands", () => {
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 2,
      result: { type: "predicate", predicate: { kind: "totally_made_up" } },
    }).success,
    false,
  );
  // div by zero operand is rejected at the schema level.
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 2,
      result: {
        type: "ranking",
        direction: "max",
        tieBreak: "share_pool",
        score: {
          kind: "reduce",
          op: "sum",
          of: {
            kind: "map_arithmetic",
            op: "div",
            operand: 0,
            of: { kind: "source", source: "guess" },
          },
        },
      },
    }).success,
    false,
  );
});

test("rejects remove_up_to_n above the cap", () => {
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 2,
      result: {
        type: "predicate",
        predicate: {
          kind: "count_at_least",
          value: 1,
          of: {
            kind: "remove_up_to_n",
            n: 99,
            strategy: "highest",
            of: { kind: "source", source: "guess" },
          },
        },
      },
    }).success,
    false,
  );
});

test("serialization round-trips through JSON", () => {
  const round = JSON.parse(JSON.stringify(rankingDigitRule));
  assert.equal(ruleAstSchema.safeParse(round).success, true);
});

test("exposes a JSON schema and the current version", () => {
  assert.equal(CURRENT_SCHEMA_VERSION, 2);
  const js = getRuleAstJsonSchema() as Record<string, unknown>;
  assert.ok(js && typeof js === "object");
});
