import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import type { PredicateNode, RuleAst } from "@tyche/rule-schema";

import {
  evaluatePredicate,
  evaluateRankingEntry,
  evaluateRule,
  resolveRankingWinners,
  RULE_RUNTIME_LIMITS,
  RuleRuntimeError,
  scoreGuess,
} from "./index.js";

const unitsDigitRanking: RuleAst = {
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

test("ranking: scores units-digit matches and picks the max with ties sharing", () => {
  const draw = [12, 23, 34, 45, 56, 67]; // units digits {2,3,4,5,6,7}
  // a: units {1,2,3,4,5,6} -> shares 2,3,4,5,6 -> 5
  const a = scoreGuess(unitsDigitRanking, { guess: [1, 2, 3, 4, 5, 6], draw });
  // b: units {2,3,4,5,6,7} -> shares all 6
  const b = scoreGuess(unitsDigitRanking, {
    guess: [2, 13, 24, 35, 46, 57],
    draw,
  });
  // c: units {0,1,8,9,0,1} distinct {0,1,8,9} -> shares none
  const c = scoreGuess(unitsDigitRanking, {
    guess: [10, 11, 18, 19, 20, 21],
    draw,
  });
  assert.equal(a, 5);
  assert.equal(b, 6);
  assert.equal(c, 0);

  const winners = resolveRankingWinners(
    [
      { player: "a", score: a },
      { player: "b", score: b },
      { player: "c", score: c },
      { player: "d", score: b }, // tie with b
    ],
    "max",
  );
  assert.deepEqual([...winners].sort(), ["b", "d"]);
});

test("ranking eligibility excludes over-limit guesses and permits no winner", () => {
  const rule: RuleAst = {
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      eligibleWhen: {
        kind: "compare",
        op: "lte",
        left: { kind: "reduce", op: "sum", of: { kind: "source", source: "guess" } },
        right: { kind: "reduce", op: "sum", of: { kind: "source", source: "draw" } },
      },
      score: { kind: "reduce", op: "sum", of: { kind: "source", source: "guess" } },
    },
  };
  const draw = [10, 11, 12, 13, 14, 15]; // 75
  const exact = evaluateRankingEntry(rule, { draw, guess: [1, 2, 3, 4, 28, 37] });
  const over = evaluateRankingEntry(rule, { draw, guess: [1, 2, 3, 4, 30, 36] });
  assert.equal(exact.score, 75);
  assert.equal(exact.eligible, true);
  assert.equal(over.score, 76);
  assert.equal(over.eligible, false);
  assert.deepEqual(
    [...resolveRankingWinners([
      { player: "exact", ...exact },
      { player: "over", ...over },
    ], "max")],
    ["exact"],
  );
  assert.equal(
    resolveRankingWinners([{ player: "over", ...over }], "max").size,
    0,
  );
});

test("predicate: count_at_least over intersection", () => {
  const ast: RuleAst = {
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
  const draw = [5, 12, 23, 44, 67, 89];
  assert.equal(
    evaluatePredicate(ast, { guess: [5, 12, 23, 44, 1, 2], draw }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(ast, { guess: [5, 12, 99, 98, 1, 2], draw }).result,
    "LOSE",
  );
});

test("predicate: ordered comparisons and numeric filters", () => {
  const orderedLower: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "all_ordered_compare",
        left: { kind: "source", source: "guess" },
        op: "lt",
        right: { kind: "source", source: "draw" },
      },
    },
  };
  const evenCountEquals: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
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
            kind: "filter_mod",
            modulus: 2,
            equals: 0,
            of: { kind: "source", source: "draw" },
          },
        },
      },
    },
  };

  assert.equal(
    evaluatePredicate(orderedLower, {
      guess: [1, 2, 3, 4, 5, 6],
      draw: [2, 3, 4, 5, 6, 7],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(orderedLower, {
      guess: [1, 2, 8, 4, 5, 6],
      draw: [2, 3, 4, 5, 6, 7],
    }).result,
    "LOSE",
  );
  assert.equal(
    evaluatePredicate(evenCountEquals, {
      guess: [1, 2, 3, 4, 5, 6],
      draw: [10, 12, 14, 15, 17, 19],
    }).result,
    "WIN",
  );
});

test("predicate: absolute same-position distance and reversed-position matches", () => {
  const closeByPosition: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "all_ordered_abs_diff_lte",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
        value: 5,
      },
    },
  };
  const totalCloseByPosition: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "total_ordered_abs_diff_lte",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
        value: 30,
      },
    },
  };
  const exactlyTwoSamePositions: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "ordered_position_match_count_eq",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
        value: 2,
      },
    },
  };
  const exactlyTwoGreaterByPosition: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "ordered_position_compare_count_eq",
        left: { kind: "source", source: "guess" },
        op: "gt",
        right: { kind: "source", source: "draw" },
        value: 2,
      },
    },
  };
  const fourWithinTenOfAnyDraw: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "value_within_any_count_at_least",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
        distance: 10,
        value: 4,
      },
    },
  };
  const threeSameLastDigits: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "digit_match_count_at_least",
        left: { kind: "source", source: "guess" },
        place: "units",
        right: { kind: "source", source: "draw" },
        value: 3,
      },
    },
  };
  const betweenDrawRange: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "all_values_between_min_max",
        of: { kind: "source", source: "guess" },
        range: { kind: "source", source: "draw" },
      },
    },
  };
  const reversedAtLeastFour: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "reversed_position_match_count_at_least",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
        value: 4,
      },
    },
  };

  assert.equal(
    evaluatePredicate(closeByPosition, {
      guess: [10, 20, 30, 40, 50, 60],
      draw: [15, 16, 35, 39, 45, 65],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(closeByPosition, {
      guess: [10, 20, 30, 40, 50, 60],
      draw: [16, 20, 30, 40, 50, 60],
    }).result,
    "LOSE",
  );
  assert.equal(
    evaluatePredicate(totalCloseByPosition, {
      guess: [10, 20, 30, 40, 50, 60],
      draw: [15, 15, 35, 35, 55, 55],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(totalCloseByPosition, {
      guess: [10, 20, 30, 40, 50, 60],
      draw: [20, 30, 40, 50, 60, 70],
    }).result,
    "LOSE",
  );
  assert.equal(
    evaluatePredicate(exactlyTwoSamePositions, {
      guess: [1, 2, 30, 40, 50, 60],
      draw: [1, 2, 3, 4, 5, 6],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(exactlyTwoSamePositions, {
      guess: [1, 2, 3, 40, 50, 60],
      draw: [1, 2, 3, 4, 5, 6],
    }).result,
    "LOSE",
  );
  assert.equal(
    evaluatePredicate(exactlyTwoGreaterByPosition, {
      guess: [2, 3, 3, 4, 5, 6],
      draw: [1, 2, 3, 4, 5, 6],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(exactlyTwoGreaterByPosition, {
      guess: [2, 3, 4, 4, 5, 6],
      draw: [1, 2, 3, 4, 5, 6],
    }).result,
    "LOSE",
  );
  assert.equal(
    evaluatePredicate(fourWithinTenOfAnyDraw, {
      guess: [8, 29, 41, 62, 90, 100],
      draw: [10, 20, 50, 70, 1, 2],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(fourWithinTenOfAnyDraw, {
      guess: [8, 29, 41, 90, 95, 100],
      draw: [10, 20, 70, 1, 2, 3],
    }).result,
    "LOSE",
  );
  assert.equal(
    evaluatePredicate(threeSameLastDigits, {
      guess: [11, 21, 31, 42, 53, 64],
      draw: [1, 2, 3, 4, 5, 6],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(threeSameLastDigits, {
      guess: [11, 22, 33, 44, 55, 66],
      draw: [7, 8, 9, 10, 20, 30],
    }).result,
    "LOSE",
  );
  assert.equal(
    evaluatePredicate(betweenDrawRange, {
      guess: [11, 20, 30, 40, 50, 59],
      draw: [10, 25, 35, 45, 55, 60],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(betweenDrawRange, {
      guess: [9, 20, 30, 40, 50, 59],
      draw: [10, 25, 35, 45, 55, 60],
    }).result,
    "LOSE",
  );
  assert.equal(
    evaluatePredicate(reversedAtLeastFour, {
      guess: [6, 5, 4, 3, 99, 98],
      draw: [1, 2, 3, 4, 5, 6],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(reversedAtLeastFour, {
      guess: [6, 5, 99, 98, 97, 96],
      draw: [1, 2, 3, 4, 5, 6],
    }).result,
    "LOSE",
  );
});

test("legacy v1 rules still evaluate", () => {
  const draw = [1, 2, 3, 4, 5, 6];
  assert.equal(
    evaluateRule(
      { schemaVersion: 1, node: { kind: "sum_equals" } },
      { guess: [6, 5, 4, 3, 2, 1], draw },
    ),
    true,
  );
  assert.equal(
    evaluateRule(
      { schemaVersion: 1, node: { kind: "ordered_exact" } },
      { guess: [1, 2, 3, 4, 5, 6], draw },
    ),
    true,
  );
  assert.equal(
    evaluateRule(
      { schemaVersion: 1, node: { kind: "match_count_at_least", value: 6 } },
      { guess: [1, 2, 3, 4, 5, 6], draw },
    ),
    true,
  );
});

test("scalar div by zero is a defined 0 (no NaN/Infinity)", () => {
  const ast: RuleAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op: "eq",
        // (sum guess) / (count of empty difference of draw with itself) -> div by 0 -> 0
        left: {
          kind: "arith",
          op: "div",
          left: { kind: "reduce", op: "sum", of: { kind: "source", source: "guess" } },
          right: {
            kind: "reduce",
            op: "count",
            of: {
              kind: "difference",
              left: { kind: "source", source: "draw" },
              right: { kind: "source", source: "draw" },
            },
          },
        },
        right: { kind: "lit", value: 0 },
      },
    },
  };
  assert.equal(
    evaluatePredicate(ast, { guess: [1, 2, 3, 4, 5, 6], draw: [9, 9, 9, 9, 9, 9] })
      .result,
    "WIN",
  );
});

test("sandbox: AST depth budget throws", () => {
  let predicate: PredicateNode = {
    kind: "compare",
    op: "eq",
    left: { kind: "lit", value: 1 },
    right: { kind: "lit", value: 1 },
  };
  for (let i = 0; i < 30; i += 1) {
    predicate = { kind: "not", clause: predicate };
  }
  const ast: RuleAst = {
    schemaVersion: 2,
    result: { type: "predicate", predicate },
  };
  assert.throws(
    () => evaluatePredicate(ast, { guess: [1, 2, 3, 4, 5, 6], draw: [1, 2, 3, 4, 5, 6] }),
    (err: unknown) => err instanceof RuleRuntimeError && err.code === "MAX_DEPTH",
  );
});

test("scoreGuess rejects non-ranking rules", () => {
  assert.throws(
    () =>
      scoreGuess(
        { schemaVersion: 1, node: { kind: "sum_equals" } },
        { guess: [1], draw: [1] },
      ),
    (err: unknown) =>
      err instanceof RuleRuntimeError && err.code === "NOT_A_RANKING_RULE",
  );
});

test("security gate exposes fail-closed sandbox policy limits", () => {
  assert.equal(RULE_RUNTIME_LIMITS.timeoutMs > 0, true);
  assert.equal(RULE_RUNTIME_LIMITS.maxOperations > 0, true);
  assert.equal(RULE_RUNTIME_LIMITS.maxInputArraySize > 0, true);
  assert.equal(RULE_RUNTIME_LIMITS.maxIntermediateArraySize > 0, true);
  assert.equal(RULE_RUNTIME_LIMITS.memoryMb > 0, true);
  assert.equal(RULE_RUNTIME_LIMITS.allowNetwork, false);
  assert.equal(RULE_RUNTIME_LIMITS.allowFilesystem, false);
  assert.equal(RULE_RUNTIME_LIMITS.allowImports, false);
  assert.equal(RULE_RUNTIME_LIMITS.allowRandomness, false);
  assert.equal(RULE_RUNTIME_LIMITS.allowClock, false);
});

test("sandbox source has no network, filesystem, dynamic import, RNG, or clock sinks", () => {
  const source = readFileSync(new URL("./index.ts", import.meta.url), "utf8");
  const forbidden: Array<[string, RegExp]> = [
    ["network fetch", /\bfetch\s*\(/],
    ["network module", /from\s+["'](?:node:)?(?:http|https|net|tls|dgram)["']/],
    ["filesystem module", /from\s+["'](?:node:)?fs(?:\/promises)?["']/],
    ["child process module", /from\s+["'](?:node:)?child_process["']/],
    ["dynamic import", /\bimport\s*\(/],
    ["CommonJS require", /\brequire\s*\(/],
    ["eval", /\beval\s*\(/],
    ["Function constructor", /\bFunction\s*\(/],
    ["randomness", /\bMath\.random\s*\(/],
    ["clock", /\b(?:Date|performance)\s*\./],
  ];

  for (const [label, pattern] of forbidden) {
    assert.equal(pattern.test(source), false, `${label} sink is forbidden`);
  }
});

test("sandbox rejects malicious DSL fixtures safely", () => {
  const input = {
    guess: [1, 2, 3, 4, 5, 6],
    draw: [1, 2, 3, 4, 5, 6],
  };

  assert.throws(
    () =>
      evaluatePredicate(
        {
          schemaVersion: 2,
          result: {
            type: "predicate",
            predicate: { kind: "fetch", url: "https://example.invalid" },
          },
        } as unknown as RuleAst,
        input,
      ),
    (err: unknown) => err instanceof RuleRuntimeError && err.code === "INVALID_NODE",
  );

  assert.throws(
    () =>
      evaluatePredicate(
        { schemaVersion: 1, node: { kind: "sum_equals" } },
        { guess: Array.from({ length: 101 }, (_, index) => index), draw: [] },
      ),
    (err: unknown) => err instanceof RuleRuntimeError && err.code === "MAX_ARRAY_SIZE",
  );

  assert.throws(
    () =>
      scoreGuess(
        {
          schemaVersion: 2,
          result: {
            type: "ranking",
            direction: "max",
            tieBreak: "share_pool",
            score: {
              kind: "arith",
              op: "mul",
              left: { kind: "lit", value: Number.MAX_SAFE_INTEGER },
              right: { kind: "lit", value: 2 },
            },
          },
        },
        input,
      ),
    (err: unknown) =>
      err instanceof RuleRuntimeError && err.code === "MAX_SCALAR_ABS",
  );
});

test("sandbox operation budget rejects expansive ASTs", () => {
  const leaf: PredicateNode = {
    kind: "compare",
    op: "eq",
    left: { kind: "lit", value: 1 },
    right: { kind: "lit", value: 1 },
  };
  const expand = (depth: number): PredicateNode =>
    depth === 0
      ? leaf
      : {
          kind: "and",
          clauses: Array.from({ length: 8 }, () => expand(depth - 1)),
        };
  const ast: RuleAst = {
    schemaVersion: 2,
    result: { type: "predicate", predicate: expand(4) },
  };

  assert.throws(
    () =>
      evaluatePredicate(ast, {
        guess: [1, 2, 3, 4, 5, 6],
        draw: [1, 2, 3, 4, 5, 6],
      }),
    (err: unknown) =>
      err instanceof RuleRuntimeError && err.code === "MAX_OPERATIONS",
  );
});

test("runtime fuzz: generated ASTs fail safely and deterministic rules repeat", () => {
  let seed = 0x5eed;
  const next = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed;
  };
  const int = (max: number) => next() % max;
  const draw = [5, 12, 23, 34, 45, 56];

  for (let i = 0; i < 80; i += 1) {
    const guess = Array.from({ length: 6 }, () => int(100) + 1);
    const place = int(2) === 0 ? "units" : "tens";
    const threshold = int(7);
    const ast: RuleAst = {
      schemaVersion: 2,
      result: {
        type: "predicate",
        predicate: {
          kind: "count_at_least",
          value: threshold,
          of: {
            kind: "intersection",
            left: {
              kind: "digits",
              place,
              of: { kind: "source", source: "guess" },
            },
            right: {
              kind: "digits",
              place,
              of: { kind: "source", source: "draw" },
            },
          },
        },
      },
    };

    const first = evaluatePredicate(ast, { guess, draw });
    const second = evaluatePredicate(ast, { guess, draw });
    assert.deepEqual(second, first);
    assert.ok(first.runtimeSteps <= RULE_RUNTIME_LIMITS.maxOperations);
  }
});
