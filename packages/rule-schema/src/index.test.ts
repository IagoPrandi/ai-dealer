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
            kind: "all_ordered_abs_diff_lte",
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
            value: 5,
          },
          {
            kind: "total_ordered_abs_diff_lte",
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
            value: 30,
          },
          {
            kind: "ordered_position_match_count_eq",
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
            value: 2,
          },
          {
            kind: "ordered_position_compare_count_eq",
            left: { kind: "source", source: "guess" },
            op: "gt",
            right: { kind: "source", source: "draw" },
            value: 2,
          },
          {
            kind: "value_within_any_count_at_least",
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
            distance: 10,
            value: 4,
          },
          {
            kind: "digit_match_count_at_least",
            left: { kind: "source", source: "guess" },
            place: "units",
            right: { kind: "source", source: "draw" },
            value: 3,
          },
          {
            kind: "all_values_between_min_max",
            of: { kind: "source", source: "guess" },
            range: { kind: "source", source: "draw" },
          },
        ],
      },
    },
  };

  const secondRule: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "and",
        clauses: [
          {
            kind: "reversed_position_match_count_at_least",
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
            value: 4,
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
  assert.equal(ruleAstSchema.safeParse(secondRule).success, true);
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
  assert.equal(CURRENT_SCHEMA_VERSION, 3);
  const js = getRuleAstJsonSchema() as Record<string, unknown>;
  assert.ok(js && typeof js === "object");
});

// ---------------------------------------------------------------------------
// schemaVersion 3 — compositional core.
// ---------------------------------------------------------------------------

const guess = { kind: "source", source: "guess" } as const;
const draw = { kind: "source", source: "draw" } as const;

test("v3 accepts novel compositions without dedicated node kinds", () => {
  // "At least four picks within 3 of the same-slot drawn number."
  const countedNearSlots = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op: "gte",
        left: {
          kind: "reduce",
          op: "sum",
          of: {
            kind: "pairs_map",
            left: guess,
            right: draw,
            expr: {
              kind: "ite",
              if: {
                kind: "compare",
                op: "lte",
                left: {
                  kind: "abs",
                  of: {
                    kind: "arith",
                    op: "sub",
                    left: { kind: "pair", side: "left" },
                    right: { kind: "pair", side: "right" },
                  },
                },
                right: { kind: "lit", value: 3 },
              },
              then: { kind: "lit", value: 1 },
              else: { kind: "lit", value: 0 },
            },
          },
        },
        right: { kind: "lit", value: 4 },
      },
    },
  };
  assert.equal(ruleAstSchema.safeParse(countedNearSlots).success, true);

  // "My picks include two consecutive numbers" — the shifted-zip idiom.
  const sortedAsc = { kind: "sort", order: "asc", of: guess } as const;
  const consecutive = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "pairs_exists",
        left: { kind: "slice", of: sortedAsc, start: 0, end: -1 },
        right: { kind: "slice", of: sortedAsc, start: 1 },
        where: {
          kind: "compare",
          op: "eq",
          left: {
            kind: "arith",
            op: "sub",
            left: { kind: "pair", side: "right" },
            right: { kind: "pair", side: "left" },
          },
          right: { kind: "lit", value: 1 },
        },
      },
    },
  };
  assert.equal(ruleAstSchema.safeParse(consecutive).success, true);

  // Cross-array quantification with one outer reference (up:1).
  const everyPickNearSomeDraw = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "forall",
        of: guess,
        where: {
          kind: "exists",
          of: draw,
          where: {
            kind: "compare",
            op: "lte",
            left: {
              kind: "abs",
              of: {
                kind: "arith",
                op: "sub",
                left: { kind: "elem", up: 1 },
                right: { kind: "elem", up: 0 },
              },
            },
            right: { kind: "lit", value: 10 },
          },
        },
      },
    },
  };
  assert.equal(ruleAstSchema.safeParse(everyPickNearSomeDraw).success, true);

  // Ranking over a composed score: sum of units digits.
  const unitsDigitSumRanking = {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      score: {
        kind: "reduce",
        op: "sum",
        of: { kind: "digits", place: "units", of: guess },
      },
    },
  };
  assert.equal(ruleAstSchema.safeParse(unitsDigitSumRanking).success, true);
});

test("v3 rejects unresolved binder references", () => {
  // elem with no binder in scope.
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 3,
      result: {
        type: "predicate",
        predicate: {
          kind: "compare",
          op: "eq",
          left: { kind: "elem" },
          right: { kind: "lit", value: 1 },
        },
      },
    }).success,
    false,
  );
  // pair inside an element binder scope.
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 3,
      result: {
        type: "predicate",
        predicate: {
          kind: "exists",
          of: guess,
          where: {
            kind: "compare",
            op: "eq",
            left: { kind: "pair", side: "left" },
            right: { kind: "lit", value: 1 },
          },
        },
      },
    }).success,
    false,
  );
  // elem up:1 with only one binder frame.
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 3,
      result: {
        type: "predicate",
        predicate: {
          kind: "exists",
          of: guess,
          where: {
            kind: "compare",
            op: "eq",
            left: { kind: "elem", up: 1 },
            right: { kind: "lit", value: 1 },
          },
        },
      },
    }).success,
    false,
  );
});

test("v3 rejects binder nesting beyond depth 2", () => {
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 3,
      result: {
        type: "predicate",
        predicate: {
          kind: "exists",
          of: guess,
          where: {
            kind: "exists",
            of: draw,
            where: {
              kind: "exists",
              of: draw,
              where: {
                kind: "compare",
                op: "eq",
                left: { kind: "elem" },
                right: { kind: "lit", value: 1 },
              },
            },
          },
        },
      },
    }).success,
    false,
  );
});

test("v3 rejects statically unsafe `at` and literal-zero divisors", () => {
  // at on a filtered array (unknown runtime length).
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 3,
      result: {
        type: "predicate",
        predicate: {
          kind: "compare",
          op: "eq",
          left: {
            kind: "at",
            index: 0,
            of: {
              kind: "filter",
              of: guess,
              where: {
                kind: "compare",
                op: "gt",
                left: { kind: "elem" },
                right: { kind: "lit", value: 50 },
              },
            },
          },
          right: { kind: "lit", value: 1 },
        },
      },
    }).success,
    false,
  );
  // at beyond the statically known length.
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 3,
      result: {
        type: "predicate",
        predicate: {
          kind: "compare",
          op: "eq",
          left: { kind: "at", index: 6, of: guess },
          right: { kind: "lit", value: 1 },
        },
      },
    }).success,
    false,
  );
  // division by literal zero.
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 3,
      result: {
        type: "ranking",
        direction: "max",
        tieBreak: "share_pool",
        score: {
          kind: "arith",
          op: "div",
          left: { kind: "reduce", op: "sum", of: guess },
          right: { kind: "lit", value: 0 },
        },
      },
    }).success,
    false,
  );
});

test("v3 `at` stays legal on length-preserving pipelines", () => {
  assert.equal(
    ruleAstSchema.safeParse({
      schemaVersion: 3,
      result: {
        type: "predicate",
        predicate: {
          kind: "compare",
          op: "gt",
          left: {
            kind: "at",
            index: 1,
            of: { kind: "sort", order: "desc", of: guess },
          },
          right: {
            kind: "at",
            index: 0,
            of: { kind: "slice", of: draw, start: 4 },
          },
        },
      },
    }).success,
    true,
  );
});
