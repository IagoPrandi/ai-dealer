import assert from "node:assert/strict";
import { test } from "node:test";

import { desugarToV3, ruleAstSchema } from "@idealer/rule-schema";
import type { RuleAst, RuleAstV3 } from "@idealer/rule-schema";

import { evaluatePredicate, evaluateRule, scoreGuess } from "./index.js";

const guess = { kind: "source", source: "guess" } as const;
const draw = { kind: "source", source: "draw" } as const;

function v3(predicate: unknown): RuleAstV3 {
  return {
    schemaVersion: 3,
    result: { type: "predicate", predicate },
  } as RuleAstV3;
}

// Deterministic PRNG (mulberry32) — same generator family as the test harness,
// so equivalence is checked over the space the harness itself samples.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function sixUnique(rng: () => number): number[] {
  const pool = new Set<number>();
  while (pool.size < 6) {
    pool.add(1 + Math.floor(rng() * 100));
  }
  return [...pool];
}

test("v3 evaluates counted same-slot near matches", () => {
  const rule = v3({
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
  });

  assert.equal(
    evaluateRule(rule, {
      guess: [10, 20, 30, 40, 50, 60],
      draw: [12, 18, 33, 41, 90, 95],
    }),
    true,
  );
  assert.equal(
    evaluateRule(rule, {
      guess: [10, 20, 30, 40, 50, 60],
      draw: [90, 91, 92, 93, 94, 95],
    }),
    false,
  );
});

test("v3 evaluates the shifted-zip consecutive idiom", () => {
  const sortedAsc = { kind: "sort", order: "asc", of: guess } as const;
  const rule = v3({
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
  });

  assert.equal(
    evaluateRule(rule, {
      guess: [7, 3, 22, 8, 90, 41],
      draw: [1, 2, 3, 4, 5, 6],
    }),
    true,
  );
  assert.equal(
    evaluateRule(rule, {
      guess: [7, 3, 22, 9, 90, 41],
      draw: [1, 2, 3, 4, 5, 6],
    }),
    false,
  );
});

test("v3 cross-array quantification resolves outer binders", () => {
  const rule = v3({
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
        right: { kind: "lit", value: 5 },
      },
    },
  });

  assert.equal(
    evaluateRule(rule, {
      guess: [10, 20, 30, 40, 50, 60],
      draw: [12, 22, 33, 44, 55, 61],
    }),
    true,
  );
  assert.equal(
    evaluateRule(rule, {
      guess: [10, 20, 30, 40, 50, 99],
      draw: [12, 22, 33, 44, 55, 61],
    }),
    false,
  );
});

test("v3 empty-array reduce identities are total", () => {
  // min/max/range_span of an impossible filter = 0; product of [] = 1.
  const emptyFilter = {
    kind: "filter",
    of: guess,
    where: {
      kind: "compare",
      op: "gt",
      left: { kind: "elem" },
      right: { kind: "lit", value: 1000 },
    },
  } as const;
  const rule = v3({
    kind: "and",
    clauses: [
      {
        kind: "compare",
        op: "eq",
        left: { kind: "reduce", op: "min", of: emptyFilter },
        right: { kind: "lit", value: 0 },
      },
      {
        kind: "compare",
        op: "eq",
        left: { kind: "reduce", op: "product", of: emptyFilter },
        right: { kind: "lit", value: 1 },
      },
      {
        kind: "compare",
        op: "eq",
        left: { kind: "reduce", op: "range_span", of: emptyFilter },
        right: { kind: "lit", value: 0 },
      },
    ],
  });
  assert.equal(
    evaluateRule(rule, {
      guess: [1, 2, 3, 4, 5, 6],
      draw: [7, 8, 9, 10, 11, 12],
    }),
    true,
  );
});

test("v3 ranking score composes through the core", () => {
  const rule: RuleAst = {
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
  assert.equal(
    scoreGuess(rule, { guess: [11, 22, 33, 44, 55, 66], draw: [1, 2, 3, 4, 5, 6] }),
    1 + 2 + 3 + 4 + 5 + 6,
  );
});

// ---------------------------------------------------------------------------
// Property tests: every v2 kind desugars to a v3 tree with IDENTICAL behavior
// over the Monte-Carlo sample space (docs/rule-algebra-core-design.md).
// ---------------------------------------------------------------------------

const filteredGuess = {
  kind: "filter_compare",
  of: guess,
  op: "gt",
  value: 50,
} as const;
const filteredDraw = {
  kind: "filter_compare",
  of: draw,
  op: "gt",
  value: 50,
} as const;

const V2_CATALOG: Array<{ name: string; ast: RuleAst }> = [
  { name: "v1 match_count_at_least", ast: { schemaVersion: 1, node: { kind: "match_count_at_least", value: 2 } } },
  { name: "v1 sum_equals", ast: { schemaVersion: 1, node: { kind: "sum_equals" } } },
  { name: "v1 ordered_exact", ast: { schemaVersion: 1, node: { kind: "ordered_exact" } } },
  ...(
    [
      { name: "count_at_least intersection", predicate: { kind: "count_at_least", value: 2, of: { kind: "intersection", left: guess, right: draw } } },
      { name: "compare sums", predicate: { kind: "compare", op: "gt", left: { kind: "reduce", op: "sum", of: guess }, right: { kind: "reduce", op: "sum", of: draw } } },
      { name: "compare with div/mod arith", predicate: { kind: "compare", op: "eq", left: { kind: "arith", op: "mod", left: { kind: "reduce", op: "sum", of: guess }, right: { kind: "lit", value: 7 } }, right: { kind: "arith", op: "mod", left: { kind: "reduce", op: "sum", of: draw }, right: { kind: "lit", value: 7 } } } },
      { name: "compare div by computed count (documented div0 identity)", predicate: { kind: "compare", op: "gte", left: { kind: "arith", op: "div", left: { kind: "reduce", op: "sum", of: guess }, right: { kind: "reduce", op: "count", of: { kind: "filter_mod", of: draw, modulus: 2, equals: 0 } } }, right: { kind: "lit", value: 40 } } },
      { name: "at out-of-bounds fallback", predicate: { kind: "compare", op: "eq", left: { kind: "at", index: 2, of: filteredGuess }, right: { kind: "at", index: 2, of: filteredDraw } } },
      { name: "reduce min/max/product/span over filtered arrays", predicate: { kind: "compare", op: "lte", left: { kind: "arith", op: "add", left: { kind: "reduce", op: "min", of: filteredGuess }, right: { kind: "reduce", op: "range_span", of: filteredGuess } }, right: { kind: "arith", op: "add", left: { kind: "reduce", op: "max", of: filteredDraw }, right: { kind: "reduce", op: "product", of: { kind: "slice", of: { kind: "sort", of: filteredDraw, order: "asc" }, start: 0, end: 2 } } } } },
      { name: "all_equal_ordered parity arrays", predicate: { kind: "all_equal_ordered", left: { kind: "map_arithmetic", of: guess, op: "mod", operand: 2 }, right: { kind: "map_arithmetic", of: draw, op: "mod", operand: 2 } } },
      { name: "all_equal_ordered length mismatch", predicate: { kind: "all_equal_ordered", left: filteredGuess, right: draw } },
      { name: "all_ordered_compare", predicate: { kind: "all_ordered_compare", left: guess, op: "lt", right: draw } },
      { name: "all_ordered_compare length mismatch", predicate: { kind: "all_ordered_compare", left: filteredGuess, op: "lt", right: filteredDraw } },
      { name: "all_ordered_abs_diff_lte", predicate: { kind: "all_ordered_abs_diff_lte", left: guess, right: draw, value: 25 } },
      { name: "total_ordered_abs_diff_lte", predicate: { kind: "total_ordered_abs_diff_lte", left: guess, right: draw, value: 150 } },
      { name: "ordered_position_match_count_eq", predicate: { kind: "ordered_position_match_count_eq", left: { kind: "digits", place: "units", of: guess }, right: { kind: "digits", place: "units", of: draw }, value: 1 } },
      { name: "ordered_position_compare_count_eq", predicate: { kind: "ordered_position_compare_count_eq", left: guess, op: "gt", right: draw, value: 3 } },
      { name: "value_within_any_count_at_least", predicate: { kind: "value_within_any_count_at_least", left: guess, right: draw, distance: 10, value: 3 } },
      { name: "digit_match_count_at_least units", predicate: { kind: "digit_match_count_at_least", left: guess, right: draw, place: "units", value: 3 } },
      { name: "digit_match_count_at_least tens", predicate: { kind: "digit_match_count_at_least", left: guess, right: draw, place: "tens", value: 4 } },
      { name: "all_values_between_min_max", predicate: { kind: "all_values_between_min_max", of: guess, range: draw } },
      { name: "all_values_between_min_max empty range", predicate: { kind: "all_values_between_min_max", of: guess, range: { kind: "filter_compare", of: draw, op: "gt", value: 95 } } },
      { name: "reversed_position_match_count_at_least", predicate: { kind: "reversed_position_match_count_at_least", left: { kind: "map_arithmetic", of: guess, op: "mod", operand: 5 }, right: { kind: "map_arithmetic", of: draw, op: "mod", operand: 5 }, value: 2 } },
      { name: "map_with_guard drop", predicate: { kind: "count_at_least", value: 1, of: { kind: "intersection", left: { kind: "map_with_guard", of: guess, op: "mul", operand: 2, guard: { kind: "range_inclusive", min: 1, max: 100 }, onGuardFail: "drop" }, right: draw } } },
      { name: "map_with_guard keep_original", predicate: { kind: "count_at_least", value: 1, of: { kind: "intersection", left: { kind: "map_with_guard", of: guess, op: "add", operand: 30, guard: { kind: "range_inclusive", min: 1, max: 100 }, onGuardFail: "keep_original" }, right: draw } } },
      { name: "remove_up_to_n lowest then sum", predicate: { kind: "compare", op: "gte", left: { kind: "reduce", op: "sum", of: { kind: "remove_up_to_n", of: guess, n: 2, strategy: "lowest" } }, right: { kind: "reduce", op: "sum", of: { kind: "remove_up_to_n", of: draw, n: 2, strategy: "highest" } } } },
      { name: "remove_up_to_n first then count", predicate: { kind: "count_at_least", value: 2, of: { kind: "intersection", left: { kind: "remove_up_to_n", of: guess, n: 1, strategy: "first" }, right: draw } } },
      { name: "difference and slice", predicate: { kind: "compare", op: "eq", left: { kind: "reduce", op: "count", of: { kind: "difference", left: guess, right: draw } }, right: { kind: "reduce", op: "count", of: { kind: "slice", of: guess, start: 0, end: 6 } } } },
      { name: "boolean composition", predicate: { kind: "or", clauses: [{ kind: "not", clause: { kind: "count_at_least", value: 1, of: { kind: "intersection", left: guess, right: draw } } }, { kind: "and", clauses: [{ kind: "compare", op: "lte", left: { kind: "reduce", op: "sum", of: guess }, right: { kind: "reduce", op: "sum", of: draw } }, { kind: "count_at_least", value: 1, of: filteredGuess }] }] } },
    ] as const
  ).map(({ name, predicate }) => ({
    name,
    ast: {
      schemaVersion: 2,
      result: { type: "predicate", predicate },
    } as RuleAst,
  })),
];

test("desugared v2 predicates agree with the v2 evaluator over Monte-Carlo samples", () => {
  for (const { name, ast } of V2_CATALOG) {
    const core = desugarToV3(ast);
    const parsed = ruleAstSchema.safeParse(core);
    assert.equal(parsed.success, true, `${name}: desugared AST must validate`);
    const rng = mulberry32(0xa15eb0a7);
    for (let i = 0; i < 300; i += 1) {
      const input = { guess: sixUnique(rng), draw: sixUnique(rng) };
      assert.equal(
        evaluatePredicate(core, input).result,
        evaluatePredicate(ast, input).result,
        `${name}: divergence on guess=[${input.guess}] draw=[${input.draw}]`,
      );
    }
  }
});

test("desugared v2 ranking scores agree with the v2 evaluator", () => {
  const rankings: Array<{ name: string; ast: RuleAst }> = [
    {
      name: "closest sum",
      ast: {
        schemaVersion: 2,
        result: {
          type: "ranking",
          direction: "min",
          tieBreak: "share_pool",
          score: {
            kind: "arith",
            op: "sub",
            left: { kind: "reduce", op: "sum", of: guess },
            right: { kind: "reduce", op: "sum", of: draw },
          },
        },
      },
    },
    {
      name: "units digit matches",
      ast: {
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
              left: { kind: "digits", place: "units", of: guess },
              right: { kind: "digits", place: "units", of: draw },
            },
          },
        },
      },
    },
  ];

  for (const { name, ast } of rankings) {
    const core = desugarToV3(ast);
    assert.equal(
      ruleAstSchema.safeParse(core).success,
      true,
      `${name}: desugared AST must validate`,
    );
    const rng = mulberry32(0x5c07e5);
    for (let i = 0; i < 300; i += 1) {
      const input = { guess: sixUnique(rng), draw: sixUnique(rng) };
      assert.equal(
        scoreGuess(core, input),
        scoreGuess(ast, input),
        `${name}: score divergence on guess=[${input.guess}] draw=[${input.draw}]`,
      );
    }
  }
});
