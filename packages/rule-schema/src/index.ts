import { z } from "zod";

// Idealer rule DSL/AST.
//
// A compiled rule is a small, recursive, auditable expression tree over exactly
// two inputs: the player's `guess` (6 numbers, 1-100) and the official `draw`
// (6 numbers, 1-100). The LLM compiles natural-language intent INTO this tree;
// the deterministic runtime (packages/rule-runtime) EXECUTES the frozen tree.
// The LLM never decides winners (PRD §7.1).
//
// Two top-level rule shapes:
//   - predicate: an absolute win/lose condition evaluated per guess.
//   - ranking:   a per-guess numeric score; the best score(s) win (comparative,
//                e.g. "whoever matches the most units digits"). Ties share the
//                pool. The argmax across guesses lives in the runtime, so each
//                guess's score stays independently reproducible and hashable.
//
// schemaVersion 1 is the legacy 3-kind grammar; it is kept so already-frozen
// artifacts still validate and execute unchanged (no silent re-hash).

export const CURRENT_SCHEMA_VERSION = 2 as const;

// Runtime/compile bounds (mirrors @idealer/constants.MAX_REMOVABLE_NUMBERS = 4;
// kept local so rule-schema stays dependency-free besides zod). The compiler
// asserts these stay in sync with the canonical constants.
export const MAX_AST_DEPTH = 16;
export const MAX_REMOVABLE_NUMBERS = 4;
export const MAX_COUNT_VALUE = 12;

// ---------------------------------------------------------------------------
// TypeScript shapes (used to type the recursive zod schemas precisely).
// ---------------------------------------------------------------------------

export type ArithOp = "add" | "sub" | "mul" | "div" | "mod";
export type CompareOp = "eq" | "neq" | "lt" | "lte" | "gt" | "gte";

export type RangeGuard = { kind: "range_inclusive"; min: number; max: number };

export type ArrayExpr =
  | { kind: "source"; source: "guess" | "draw" }
  | { kind: "digits"; of: ArrayExpr; place: "units" | "tens" }
  | { kind: "filter_compare"; of: ArrayExpr; op: CompareOp; value: number }
  | { kind: "filter_mod"; of: ArrayExpr; modulus: number; equals: number }
  | { kind: "map_arithmetic"; of: ArrayExpr; op: ArithOp; operand: number }
  | {
      kind: "map_with_guard";
      of: ArrayExpr;
      op: ArithOp;
      operand: number;
      guard: RangeGuard;
      onGuardFail: "keep_original" | "drop";
    }
  | { kind: "intersection"; left: ArrayExpr; right: ArrayExpr }
  | { kind: "difference"; left: ArrayExpr; right: ArrayExpr }
  | { kind: "sort"; of: ArrayExpr; order: "asc" | "desc" }
  | {
      kind: "remove_up_to_n";
      of: ArrayExpr;
      n: number;
      strategy: "highest" | "lowest" | "first";
    }
  | { kind: "slice"; of: ArrayExpr; start: number; end?: number | undefined };

export type ScalarExpr =
  | { kind: "lit"; value: number }
  | {
      kind: "reduce";
      of: ArrayExpr;
      op: "sum" | "product" | "count" | "min" | "max" | "range_span";
    }
  | { kind: "at"; of: ArrayExpr; index: number }
  | { kind: "arith"; op: ArithOp; left: ScalarExpr; right: ScalarExpr };

export type PredicateNode =
  | { kind: "compare"; left: ScalarExpr; op: CompareOp; right: ScalarExpr }
  | { kind: "count_at_least"; of: ArrayExpr; value: number }
  | { kind: "all_equal_ordered"; left: ArrayExpr; right: ArrayExpr }
  | {
      kind: "all_ordered_compare";
      left: ArrayExpr;
      op: CompareOp;
      right: ArrayExpr;
    }
  | {
      kind: "all_ordered_abs_diff_lte";
      left: ArrayExpr;
      right: ArrayExpr;
      value: number;
    }
  | {
      kind: "total_ordered_abs_diff_lte";
      left: ArrayExpr;
      right: ArrayExpr;
      value: number;
    }
  | {
      kind: "ordered_position_match_count_eq";
      left: ArrayExpr;
      right: ArrayExpr;
      value: number;
    }
  | {
      kind: "ordered_position_compare_count_eq";
      left: ArrayExpr;
      op: CompareOp;
      right: ArrayExpr;
      value: number;
    }
  | {
      kind: "digit_match_count_at_least";
      left: ArrayExpr;
      right: ArrayExpr;
      place: "units" | "tens";
      value: number;
    }
  | {
      kind: "all_values_between_min_max";
      of: ArrayExpr;
      range: ArrayExpr;
    }
  | {
      kind: "reversed_position_match_count_at_least";
      left: ArrayExpr;
      right: ArrayExpr;
      value: number;
    }
  | { kind: "and"; clauses: PredicateNode[] }
  | { kind: "or"; clauses: PredicateNode[] }
  | { kind: "not"; clause: PredicateNode };

export type RuleResult =
  | { type: "predicate"; predicate: PredicateNode }
  | {
      type: "ranking";
      score: ScalarExpr;
      direction: "max" | "min";
      tieBreak: "share_pool";
    };

export type RuleAstV2 = {
  schemaVersion: 2;
  metadata?: { maxRemovableNumbers?: number | undefined } | undefined;
  result: RuleResult;
};

export type RuleAstV1 = {
  schemaVersion: 1;
  node: {
    kind: "match_count_at_least" | "sum_equals" | "ordered_exact";
    value?: number | undefined;
  };
};

export type RuleAst = RuleAstV1 | RuleAstV2;

// ---------------------------------------------------------------------------
// Zod schemas.
// ---------------------------------------------------------------------------

const intSchema = z.number().int();
const arithOpSchema = z.enum(["add", "sub", "mul", "div", "mod"]);
const compareOpSchema = z.enum(["eq", "neq", "lt", "lte", "gt", "gte"]);

// div/mod operands must be safe even before the runtime guard runs.
const safeOperand = (op: ArithOp, operand: number) => {
  if (op === "div") return operand !== 0;
  if (op === "mod") return operand > 0;
  return true;
};

const arrayExprSchema: z.ZodType<ArrayExpr> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("source"), source: z.enum(["guess", "draw"]) }),
    z.object({
      kind: z.literal("digits"),
      of: arrayExprSchema,
      place: z.enum(["units", "tens"]),
    }),
    z.object({
      kind: z.literal("filter_compare"),
      of: arrayExprSchema,
      op: compareOpSchema,
      value: intSchema,
    }),
    z
      .object({
        kind: z.literal("filter_mod"),
        of: arrayExprSchema,
        modulus: intSchema.min(1).max(100),
        equals: intSchema.min(0).max(99),
      })
      .refine((node) => node.equals < node.modulus, {
        message: "filter_mod equals must be lower than modulus",
      }),
    z
      .object({
        kind: z.literal("map_arithmetic"),
        of: arrayExprSchema,
        op: arithOpSchema,
        operand: intSchema,
      })
      .refine((node) => safeOperand(node.op, node.operand), {
        message: "div operand must be non-zero; mod operand must be positive",
      }),
    z
      .object({
        kind: z.literal("map_with_guard"),
        of: arrayExprSchema,
        op: arithOpSchema,
        operand: intSchema,
        guard: z.object({
          kind: z.literal("range_inclusive"),
          min: intSchema,
          max: intSchema,
        }),
        onGuardFail: z.enum(["keep_original", "drop"]),
      })
      .refine((node) => safeOperand(node.op, node.operand), {
        message: "div operand must be non-zero; mod operand must be positive",
      }),
    z.object({
      kind: z.literal("intersection"),
      left: arrayExprSchema,
      right: arrayExprSchema,
    }),
    z.object({
      kind: z.literal("difference"),
      left: arrayExprSchema,
      right: arrayExprSchema,
    }),
    z.object({
      kind: z.literal("sort"),
      of: arrayExprSchema,
      order: z.enum(["asc", "desc"]),
    }),
    z.object({
      kind: z.literal("remove_up_to_n"),
      of: arrayExprSchema,
      n: intSchema.min(1).max(MAX_REMOVABLE_NUMBERS),
      strategy: z.enum(["highest", "lowest", "first"]),
    }),
    z.object({
      kind: z.literal("slice"),
      of: arrayExprSchema,
      start: intSchema.min(0),
      end: intSchema.min(0).optional(),
    }),
  ]),
);

const scalarExprSchema: z.ZodType<ScalarExpr> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("lit"), value: intSchema }),
    z.object({
      kind: z.literal("reduce"),
      of: arrayExprSchema,
      op: z.enum(["sum", "product", "count", "min", "max", "range_span"]),
    }),
    z.object({
      kind: z.literal("at"),
      of: arrayExprSchema,
      index: intSchema.min(0),
    }),
    z.object({
      kind: z.literal("arith"),
      op: arithOpSchema,
      left: scalarExprSchema,
      right: scalarExprSchema,
    }),
  ]),
);

const predicateNodeSchema: z.ZodType<PredicateNode> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("compare"),
      left: scalarExprSchema,
      op: compareOpSchema,
      right: scalarExprSchema,
    }),
    z.object({
      kind: z.literal("count_at_least"),
      of: arrayExprSchema,
      value: intSchema.min(0).max(MAX_COUNT_VALUE),
    }),
    z.object({
      kind: z.literal("all_equal_ordered"),
      left: arrayExprSchema,
      right: arrayExprSchema,
    }),
    z.object({
      kind: z.literal("all_ordered_compare"),
      left: arrayExprSchema,
      op: compareOpSchema,
      right: arrayExprSchema,
    }),
    z.object({
      kind: z.literal("all_ordered_abs_diff_lte"),
      left: arrayExprSchema,
      right: arrayExprSchema,
      value: intSchema.min(0).max(100),
    }),
    z.object({
      kind: z.literal("total_ordered_abs_diff_lte"),
      left: arrayExprSchema,
      right: arrayExprSchema,
      value: intSchema.min(0).max(600),
    }),
    z.object({
      kind: z.literal("ordered_position_match_count_eq"),
      left: arrayExprSchema,
      right: arrayExprSchema,
      value: intSchema.min(0).max(6),
    }),
    z.object({
      kind: z.literal("ordered_position_compare_count_eq"),
      left: arrayExprSchema,
      op: compareOpSchema,
      right: arrayExprSchema,
      value: intSchema.min(0).max(6),
    }),
    z.object({
      kind: z.literal("digit_match_count_at_least"),
      left: arrayExprSchema,
      right: arrayExprSchema,
      place: z.enum(["units", "tens"]),
      value: intSchema.min(0).max(6),
    }),
    z.object({
      kind: z.literal("all_values_between_min_max"),
      of: arrayExprSchema,
      range: arrayExprSchema,
    }),
    z.object({
      kind: z.literal("reversed_position_match_count_at_least"),
      left: arrayExprSchema,
      right: arrayExprSchema,
      value: intSchema.min(0).max(6),
    }),
    z.object({
      kind: z.literal("and"),
      clauses: z.array(predicateNodeSchema).min(1).max(8),
    }),
    z.object({
      kind: z.literal("or"),
      clauses: z.array(predicateNodeSchema).min(1).max(8),
    }),
    z.object({ kind: z.literal("not"), clause: predicateNodeSchema }),
  ]),
);

const ruleResultSchema: z.ZodType<RuleResult> = z.union([
  z.object({ type: z.literal("predicate"), predicate: predicateNodeSchema }),
  z.object({
    type: z.literal("ranking"),
    score: scalarExprSchema,
    direction: z.enum(["max", "min"]),
    tieBreak: z.literal("share_pool"),
  }),
]);

const ruleAstV2Schema: z.ZodType<RuleAstV2> = z.object({
  schemaVersion: z.literal(2),
  metadata: z
    .object({ maxRemovableNumbers: intSchema.min(0).optional() })
    .optional(),
  result: ruleResultSchema,
});

const ruleAstV1Schema: z.ZodType<RuleAstV1> = z.object({
  schemaVersion: z.literal(1),
  node: z.object({
    kind: z.enum(["match_count_at_least", "sum_equals", "ordered_exact"]),
    value: intSchema.optional(),
  }),
});

export const ruleAstSchema: z.ZodType<RuleAst> = z.union([
  ruleAstV1Schema,
  ruleAstV2Schema,
]);

// JSON Schema used for constrained decoding (Ollama `format`, vLLM guided_json,
// OpenAI response_format json_schema). Computed lazily + memoized so a zod
// conversion edge case can never break module import. Only v2 is emitted by the
// LLM, so we expose the v2 schema for the compile step.
let cachedJsonSchema: unknown;
export function getRuleAstJsonSchema(): unknown {
  cachedJsonSchema ??= z.toJSONSchema(ruleAstV2Schema, { target: "draft-7" });
  return cachedJsonSchema;
}

export function isRankingRule(ast: RuleAst): boolean {
  return ast.schemaVersion === 2 && ast.result.type === "ranking";
}

export function parseRuleAst(value: unknown): RuleAst {
  return ruleAstSchema.parse(value);
}
