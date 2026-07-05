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
//
// schemaVersion 3 is the orthogonal compositional core (docs/
// rule-algebra-core-design.md): a small closed node set (map/filter/quantifiers
// with implicit element binders + pairwise zips) in which every v2 specialized
// predicate kind is a macro (see desugar.ts). Novel rules become expressible by
// COMPOSING core nodes instead of adding new node kinds.

export const CURRENT_SCHEMA_VERSION = 3 as const;

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
      kind: "value_within_any_count_at_least";
      left: ArrayExpr;
      right: ArrayExpr;
      distance: number;
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

// ---------------------------------------------------------------------------
// schemaVersion 3 — the orthogonal compositional core.
//
// Element scopes: `map`/`filter`/`forall`/`exists` bind one implicit element
// (referenced by {"kind":"elem"}), `pairs_map`/`pairs_forall`/`pairs_exists`
// bind an implicit (left,right) pair (referenced by {"kind":"pair"}). One level
// of outer reference is allowed via {"kind":"elem","up":1}. Binder nesting is
// capped at 2, so worst-case evaluation is <= 6x6 element visits per quantifier
// pair — strictly bounded. Scope validity is enforced statically (see
// validateV3StaticIssues), never patched at runtime.
// ---------------------------------------------------------------------------

export const MAX_V3_BINDER_DEPTH = 2;

export type ReduceOp = "sum" | "product" | "count" | "min" | "max" | "range_span";

export type ArrayExprV3 =
  | { kind: "source"; source: "guess" | "draw" }
  | { kind: "sort"; order: "asc" | "desc"; of: ArrayExprV3 }
  | { kind: "reverse"; of: ArrayExprV3 }
  | { kind: "slice"; of: ArrayExprV3; start: number; end?: number | undefined }
  | { kind: "distinct"; of: ArrayExprV3 }
  | { kind: "intersection"; left: ArrayExprV3; right: ArrayExprV3 }
  | { kind: "difference"; left: ArrayExprV3; right: ArrayExprV3 }
  | { kind: "digits"; place: "units" | "tens"; of: ArrayExprV3 }
  | { kind: "map"; of: ArrayExprV3; expr: ScalarExprV3 }
  | { kind: "filter"; of: ArrayExprV3; where: PredicateNodeV3 }
  | { kind: "pairs_map"; left: ArrayExprV3; right: ArrayExprV3; expr: ScalarExprV3 };

export type ScalarExprV3 =
  | { kind: "lit"; value: number }
  | { kind: "reduce"; op: ReduceOp; of: ArrayExprV3 }
  | { kind: "at"; index: number; of: ArrayExprV3 }
  | { kind: "arith"; op: ArithOp; left: ScalarExprV3; right: ScalarExprV3 }
  | { kind: "abs"; of: ScalarExprV3 }
  | { kind: "ite"; if: PredicateNodeV3; then: ScalarExprV3; else: ScalarExprV3 }
  | { kind: "elem"; up?: 0 | 1 | undefined }
  | { kind: "pair"; side: "left" | "right" };

export type PredicateNodeV3 =
  | { kind: "compare"; op: CompareOp; left: ScalarExprV3; right: ScalarExprV3 }
  | { kind: "contains"; array: ArrayExprV3; value: ScalarExprV3 }
  | { kind: "forall"; of: ArrayExprV3; where: PredicateNodeV3 }
  | { kind: "exists"; of: ArrayExprV3; where: PredicateNodeV3 }
  | { kind: "pairs_forall"; left: ArrayExprV3; right: ArrayExprV3; where: PredicateNodeV3 }
  | { kind: "pairs_exists"; left: ArrayExprV3; right: ArrayExprV3; where: PredicateNodeV3 }
  | { kind: "and"; clauses: PredicateNodeV3[] }
  | { kind: "or"; clauses: PredicateNodeV3[] }
  | { kind: "not"; clause: PredicateNodeV3 };

export type RuleResultV3 =
  | { type: "predicate"; predicate: PredicateNodeV3 }
  | {
      type: "ranking";
      score: ScalarExprV3;
      direction: "max" | "min";
      tieBreak: "share_pool";
    };

export type RuleAstV3 = {
  schemaVersion: 3;
  result: RuleResultV3;
};

export type RuleAst = RuleAstV1 | RuleAstV2 | RuleAstV3;

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
      kind: z.literal("value_within_any_count_at_least"),
      left: arrayExprSchema,
      right: arrayExprSchema,
      distance: intSchema.min(0).max(100),
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

// ---------------------------------------------------------------------------
// v3 zod schemas (structural) + static totality/scope validation.
// ---------------------------------------------------------------------------

// Comparison thresholds never legitimately exceed the sum/product ranges the
// game can produce; bounding literals keeps constrained decoding tight.
const v3LitValue = intSchema.min(-1_000_000).max(1_000_000);

const arrayExprV3Schema: z.ZodType<ArrayExprV3> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("source"), source: z.enum(["guess", "draw"]) }),
    z.object({
      kind: z.literal("sort"),
      order: z.enum(["asc", "desc"]),
      of: arrayExprV3Schema,
    }),
    z.object({ kind: z.literal("reverse"), of: arrayExprV3Schema }),
    z.object({
      kind: z.literal("slice"),
      of: arrayExprV3Schema,
      start: intSchema.min(0).max(12),
      // Negative end means "from the end" (JS slice semantics).
      end: intSchema.min(-12).max(12).optional(),
    }),
    z.object({ kind: z.literal("distinct"), of: arrayExprV3Schema }),
    z.object({
      kind: z.literal("intersection"),
      left: arrayExprV3Schema,
      right: arrayExprV3Schema,
    }),
    z.object({
      kind: z.literal("difference"),
      left: arrayExprV3Schema,
      right: arrayExprV3Schema,
    }),
    z.object({
      kind: z.literal("digits"),
      place: z.enum(["units", "tens"]),
      of: arrayExprV3Schema,
    }),
    z.object({
      kind: z.literal("map"),
      of: arrayExprV3Schema,
      expr: scalarExprV3Schema,
    }),
    z.object({
      kind: z.literal("filter"),
      of: arrayExprV3Schema,
      where: predicateNodeV3Schema,
    }),
    z.object({
      kind: z.literal("pairs_map"),
      left: arrayExprV3Schema,
      right: arrayExprV3Schema,
      expr: scalarExprV3Schema,
    }),
  ]),
);

const scalarExprV3Schema: z.ZodType<ScalarExprV3> = z.lazy(() =>
  z.union([
    z.object({ kind: z.literal("lit"), value: v3LitValue }),
    z.object({
      kind: z.literal("reduce"),
      op: z.enum(["sum", "product", "count", "min", "max", "range_span"]),
      of: arrayExprV3Schema,
    }),
    z.object({
      kind: z.literal("at"),
      index: intSchema.min(0).max(11),
      of: arrayExprV3Schema,
    }),
    z.object({
      kind: z.literal("arith"),
      op: arithOpSchema,
      left: scalarExprV3Schema,
      right: scalarExprV3Schema,
    }),
    z.object({ kind: z.literal("abs"), of: scalarExprV3Schema }),
    z.object({
      kind: z.literal("ite"),
      if: predicateNodeV3Schema,
      then: scalarExprV3Schema,
      else: scalarExprV3Schema,
    }),
    z.object({
      kind: z.literal("elem"),
      up: z.union([z.literal(0), z.literal(1)]).optional(),
    }),
    z.object({ kind: z.literal("pair"), side: z.enum(["left", "right"]) }),
  ]),
);

const predicateNodeV3Schema: z.ZodType<PredicateNodeV3> = z.lazy(() =>
  z.union([
    z.object({
      kind: z.literal("compare"),
      op: compareOpSchema,
      left: scalarExprV3Schema,
      right: scalarExprV3Schema,
    }),
    z.object({
      kind: z.literal("contains"),
      array: arrayExprV3Schema,
      value: scalarExprV3Schema,
    }),
    z.object({
      kind: z.literal("forall"),
      of: arrayExprV3Schema,
      where: predicateNodeV3Schema,
    }),
    z.object({
      kind: z.literal("exists"),
      of: arrayExprV3Schema,
      where: predicateNodeV3Schema,
    }),
    z.object({
      kind: z.literal("pairs_forall"),
      left: arrayExprV3Schema,
      right: arrayExprV3Schema,
      where: predicateNodeV3Schema,
    }),
    z.object({
      kind: z.literal("pairs_exists"),
      left: arrayExprV3Schema,
      right: arrayExprV3Schema,
      where: predicateNodeV3Schema,
    }),
    z.object({
      kind: z.literal("and"),
      clauses: z.array(predicateNodeV3Schema).min(1).max(8),
    }),
    z.object({
      kind: z.literal("or"),
      clauses: z.array(predicateNodeV3Schema).min(1).max(8),
    }),
    z.object({ kind: z.literal("not"), clause: predicateNodeV3Schema }),
  ]),
);

const ruleResultV3Schema: z.ZodType<RuleResultV3> = z.union([
  z.object({ type: z.literal("predicate"), predicate: predicateNodeV3Schema }),
  z.object({
    type: z.literal("ranking"),
    score: scalarExprV3Schema,
    direction: z.enum(["max", "min"]),
    tieBreak: z.literal("share_pool"),
  }),
]);

const ruleAstV3StructuralSchema: z.ZodType<RuleAstV3> = z.object({
  schemaVersion: z.literal(3),
  result: ruleResultV3Schema,
});

type BinderFrame = "elem" | "pair";

// Static totality + scope checks the recursive zod grammar cannot express.
// Every violation is a SCHEMA REJECTION — never a silent runtime fallback:
// - elem/pair references must resolve to a binder frame of the right kind;
// - binder nesting depth is capped at MAX_V3_BINDER_DEPTH;
// - `at` requires a statically known array length that covers the index
//   (post-filter/intersection lengths are unknown -> use sort+slice+reduce).
// Division/modulo keep the v1/v2 documented algebraic identities (x div 0 = 0,
// x mod m = 0 for m <= 0, min/max/span of [] = 0, product of [] = 1, sum/count
// of [] = 0) so v2 artifacts desugar to semantically identical v3 trees;
// literal zero divisors are still rejected here as author mistakes.
export function validateV3StaticIssues(ast: RuleAstV3): string[] {
  const issues: string[] = [];

  const staticLength = (node: ArrayExprV3): number | null => {
    switch (node.kind) {
      case "source":
        return 6;
      case "sort":
      case "reverse":
      case "digits":
        return staticLength(node.of);
      case "map":
        return staticLength(node.of);
      case "slice": {
        const len = staticLength(node.of);
        if (len === null) return null;
        const end =
          node.end === undefined
            ? len
            : node.end < 0
              ? Math.max(0, len + node.end)
              : Math.min(node.end, len);
        return Math.max(0, end - Math.min(node.start, len));
      }
      case "pairs_map": {
        const left = staticLength(node.left);
        const right = staticLength(node.right);
        return left === null || right === null ? null : Math.min(left, right);
      }
      case "distinct":
      case "intersection":
      case "difference":
      case "filter":
        return null;
    }
  };

  const visitScalar = (node: ScalarExprV3, stack: BinderFrame[]): void => {
    switch (node.kind) {
      case "lit":
        return;
      case "reduce":
        visitArray(node.of, stack);
        return;
      case "at": {
        visitArray(node.of, stack);
        const len = staticLength(node.of);
        if (len === null) {
          issues.push(
            "`at` on an array without statically known length (filter/intersection/difference/distinct shrink); use sort+slice+reduce instead",
          );
        } else if (node.index >= len) {
          issues.push(
            `\`at\` index ${node.index} is out of bounds for a length-${len} array`,
          );
        }
        return;
      }
      case "arith": {
        visitScalar(node.left, stack);
        visitScalar(node.right, stack);
        if (node.op === "div" && node.right.kind === "lit" && node.right.value === 0) {
          issues.push("division by literal zero");
        }
        if (node.op === "mod" && node.right.kind === "lit" && node.right.value <= 0) {
          issues.push("modulo by non-positive literal");
        }
        return;
      }
      case "abs":
        visitScalar(node.of, stack);
        return;
      case "ite":
        visitPredicate(node.if, stack);
        visitScalar(node.then, stack);
        visitScalar(node.else, stack);
        return;
      case "elem": {
        const up = node.up ?? 0;
        const frame = stack[stack.length - 1 - up];
        if (frame !== "elem") {
          issues.push(
            `\`elem\` (up:${up}) does not resolve to an element binder scope`,
          );
        }
        return;
      }
      case "pair": {
        if (stack[stack.length - 1] !== "pair") {
          issues.push("`pair` used outside a pairs_* binder scope");
        }
        return;
      }
    }
  };

  const enterBinder = (stack: BinderFrame[], frame: BinderFrame): BinderFrame[] | null => {
    if (stack.length >= MAX_V3_BINDER_DEPTH) {
      issues.push(
        `binder nesting exceeds the maximum depth of ${MAX_V3_BINDER_DEPTH}`,
      );
      return null;
    }
    return [...stack, frame];
  };

  const visitArray = (node: ArrayExprV3, stack: BinderFrame[]): void => {
    switch (node.kind) {
      case "source":
        return;
      case "sort":
      case "reverse":
      case "distinct":
      case "digits":
        visitArray(node.of, stack);
        return;
      case "slice":
        visitArray(node.of, stack);
        return;
      case "intersection":
      case "difference":
        visitArray(node.left, stack);
        visitArray(node.right, stack);
        return;
      case "map": {
        visitArray(node.of, stack);
        const inner = enterBinder(stack, "elem");
        if (inner) visitScalar(node.expr, inner);
        return;
      }
      case "filter": {
        visitArray(node.of, stack);
        const inner = enterBinder(stack, "elem");
        if (inner) visitPredicate(node.where, inner);
        return;
      }
      case "pairs_map": {
        visitArray(node.left, stack);
        visitArray(node.right, stack);
        const inner = enterBinder(stack, "pair");
        if (inner) visitScalar(node.expr, inner);
        return;
      }
    }
  };

  const visitPredicate = (node: PredicateNodeV3, stack: BinderFrame[]): void => {
    switch (node.kind) {
      case "compare":
        visitScalar(node.left, stack);
        visitScalar(node.right, stack);
        return;
      case "contains":
        visitArray(node.array, stack);
        visitScalar(node.value, stack);
        return;
      case "forall":
      case "exists": {
        visitArray(node.of, stack);
        const inner = enterBinder(stack, "elem");
        if (inner) visitPredicate(node.where, inner);
        return;
      }
      case "pairs_forall":
      case "pairs_exists": {
        visitArray(node.left, stack);
        visitArray(node.right, stack);
        const inner = enterBinder(stack, "pair");
        if (inner) visitPredicate(node.where, inner);
        return;
      }
      case "and":
      case "or":
        for (const clause of node.clauses) visitPredicate(clause, stack);
        return;
      case "not":
        visitPredicate(node.clause, stack);
        return;
    }
  };

  if (ast.result.type === "predicate") {
    visitPredicate(ast.result.predicate, []);
  } else {
    visitScalar(ast.result.score, []);
  }
  return issues;
}

const ruleAstV3Schema: z.ZodType<RuleAstV3> = ruleAstV3StructuralSchema.superRefine(
  (ast, ctx) => {
    for (const issue of validateV3StaticIssues(ast)) {
      ctx.addIssue({ code: "custom", message: issue });
    }
  },
);

export const ruleAstSchema: z.ZodType<RuleAst> = z.union([
  ruleAstV1Schema,
  ruleAstV2Schema,
  ruleAstV3Schema,
]);

// JSON Schema used for constrained decoding (Ollama `format`, vLLM guided_json,
// OpenAI response_format json_schema). Computed lazily + memoized so a zod
// conversion edge case can never break module import. New rules are emitted by
// the LLM in the v3 compositional core, so we expose the v3 structural schema
// for the compile step (scope/totality checks run in zod after decoding).
let cachedJsonSchema: unknown;
export function getRuleAstJsonSchema(): unknown {
  cachedJsonSchema ??= z.toJSONSchema(ruleAstV3StructuralSchema, {
    target: "draft-7",
  });
  return cachedJsonSchema;
}

export function isRankingRule(ast: RuleAst): boolean {
  return ast.schemaVersion !== 1 && ast.result.type === "ranking";
}

// Direction of a ranking rule (max wins by default for non-ranking callers that
// only need a defined value, e.g. the test harness).
export function rankingDirection(ast: RuleAst): "max" | "min" {
  return ast.schemaVersion !== 1 && ast.result.type === "ranking"
    ? ast.result.direction
    : "max";
}

export function parseRuleAst(value: unknown): RuleAst {
  return ruleAstSchema.parse(value);
}

// Executable v1/v2 -> v3 macro expansion (type-only import above, so this
// re-export cannot create a runtime cycle).
export { desugarToV3 } from "./desugar.js";
