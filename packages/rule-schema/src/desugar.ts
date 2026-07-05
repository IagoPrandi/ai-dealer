import type {
  ArrayExpr,
  ArrayExprV3,
  CompareOp,
  PredicateNode,
  PredicateNodeV3,
  RuleAst,
  RuleAstV3,
  ScalarExpr,
  ScalarExprV3,
} from "./index.js";

// Executable desugaring of the v1/v2 grammars into the v3 compositional core
// (docs/rule-algebra-core-design.md, "Every v2 kind is a macro"). The mapping is
// SEMANTICS-PRESERVING against the v2 runtime, including its documented edge
// identities:
// - ordered predicates require equal lengths (encoded as an explicit
//   count-equality conjunct);
// - `at` out of bounds yields 0 (encoded as `sum(slice(of, i, i+1))`, which is
//   0 on an empty slice — no `at` node, so unknown-length arrays stay legal);
// - `all_values_between_min_max` is false on an empty range (encoded as a
//   count >= 1 conjunct);
// - `remove_up_to_n` is desugared through sort+slice: multiset-equivalent, with
//   element order normalized (every v2 consumer of removal — sum/count/
//   intersection — is order-insensitive).
// Property tests in desugar.test.ts assert v2-vs-desugared agreement over the
// Monte-Carlo sample space.

const lit = (value: number): ScalarExprV3 => ({ kind: "lit", value });
const elem = (up?: 0 | 1): ScalarExprV3 =>
  up === undefined ? { kind: "elem" } : { kind: "elem", up };
const pairSide = (side: "left" | "right"): ScalarExprV3 => ({
  kind: "pair",
  side,
});
const compare = (
  left: ScalarExprV3,
  op: CompareOp,
  right: ScalarExprV3,
): PredicateNodeV3 => ({ kind: "compare", op, left, right });
const count = (of: ArrayExprV3): ScalarExprV3 => ({
  kind: "reduce",
  op: "count",
  of,
});
const sum = (of: ArrayExprV3): ScalarExprV3 => ({
  kind: "reduce",
  op: "sum",
  of,
});
const absSub = (left: ScalarExprV3, right: ScalarExprV3): ScalarExprV3 => ({
  kind: "abs",
  of: { kind: "arith", op: "sub", left, right },
});
const oneIf = (predicate: PredicateNodeV3): ScalarExprV3 => ({
  kind: "ite",
  if: predicate,
  then: lit(1),
  else: lit(0),
});
const sameLength = (
  left: ArrayExprV3,
  right: ArrayExprV3,
): PredicateNodeV3 => compare(count(left), "eq", count(right));
const andAll = (clauses: PredicateNodeV3[]): PredicateNodeV3 =>
  clauses.length === 1 ? clauses[0]! : { kind: "and", clauses };

function desugarArray(node: ArrayExpr): ArrayExprV3 {
  switch (node.kind) {
    case "source":
      return { kind: "source", source: node.source };
    case "digits":
      return { kind: "digits", place: node.place, of: desugarArray(node.of) };
    case "filter_compare":
      return {
        kind: "filter",
        of: desugarArray(node.of),
        where: compare(elem(), node.op, lit(node.value)),
      };
    case "filter_mod":
      return {
        kind: "filter",
        of: desugarArray(node.of),
        where: compare(
          { kind: "arith", op: "mod", left: elem(), right: lit(node.modulus) },
          "eq",
          lit(node.equals),
        ),
      };
    case "map_arithmetic":
      return {
        kind: "map",
        of: desugarArray(node.of),
        expr: { kind: "arith", op: node.op, left: elem(), right: lit(node.operand) },
      };
    case "map_with_guard": {
      const mapped: ScalarExprV3 = {
        kind: "arith",
        op: node.op,
        left: elem(),
        right: lit(node.operand),
      };
      if (node.onGuardFail === "drop") {
        // Map first, then keep mapped values inside the guard range.
        return {
          kind: "filter",
          of: { kind: "map", of: desugarArray(node.of), expr: mapped },
          where: andAll([
            compare(elem(), "gte", lit(node.guard.min)),
            compare(elem(), "lte", lit(node.guard.max)),
          ]),
        };
      }
      return {
        kind: "map",
        of: desugarArray(node.of),
        expr: {
          kind: "ite",
          if: andAll([
            compare(mapped, "gte", lit(node.guard.min)),
            compare(mapped, "lte", lit(node.guard.max)),
          ]),
          then: mapped,
          else: elem(),
        },
      };
    }
    case "intersection":
      return {
        kind: "intersection",
        left: desugarArray(node.left),
        right: desugarArray(node.right),
      };
    case "difference":
      return {
        kind: "difference",
        left: desugarArray(node.left),
        right: desugarArray(node.right),
      };
    case "sort":
      return { kind: "sort", order: node.order, of: desugarArray(node.of) };
    case "remove_up_to_n": {
      const sorted: ArrayExprV3 = {
        kind: "sort",
        order: "asc",
        of: desugarArray(node.of),
      };
      if (node.strategy === "first") {
        return { kind: "slice", of: desugarArray(node.of), start: node.n };
      }
      return node.strategy === "lowest"
        ? { kind: "slice", of: sorted, start: node.n }
        : { kind: "slice", of: sorted, start: 0, end: -node.n };
    }
    case "slice":
      return {
        kind: "slice",
        of: desugarArray(node.of),
        start: node.start,
        ...(node.end === undefined ? {} : { end: node.end }),
      };
  }
}

function desugarScalar(node: ScalarExpr): ScalarExprV3 {
  switch (node.kind) {
    case "lit":
      return lit(node.value);
    case "reduce":
      return { kind: "reduce", op: node.op, of: desugarArray(node.of) };
    case "at":
      // v2 `at` yields 0 when the index is out of bounds; the sum of a
      // one-element slice reproduces that exactly and needs no static length.
      return sum({
        kind: "slice",
        of: desugarArray(node.of),
        start: node.index,
        end: node.index + 1,
      });
    case "arith":
      return {
        kind: "arith",
        op: node.op,
        left: desugarScalar(node.left),
        right: desugarScalar(node.right),
      };
  }
}

function pairwiseCountedMatches(
  left: ArrayExprV3,
  right: ArrayExprV3,
  where: PredicateNodeV3,
): ScalarExprV3 {
  return sum({ kind: "pairs_map", left, right, expr: oneIf(where) });
}

function desugarPredicate(node: PredicateNode): PredicateNodeV3 {
  switch (node.kind) {
    case "compare":
      return compare(desugarScalar(node.left), node.op, desugarScalar(node.right));
    case "count_at_least":
      return compare(count(desugarArray(node.of)), "gte", lit(node.value));
    case "all_equal_ordered": {
      const left = desugarArray(node.left);
      const right = desugarArray(node.right);
      return andAll([
        sameLength(left, right),
        {
          kind: "pairs_forall",
          left,
          right,
          where: compare(pairSide("left"), "eq", pairSide("right")),
        },
      ]);
    }
    case "all_ordered_compare": {
      const left = desugarArray(node.left);
      const right = desugarArray(node.right);
      return andAll([
        sameLength(left, right),
        {
          kind: "pairs_forall",
          left,
          right,
          where: compare(pairSide("left"), node.op, pairSide("right")),
        },
      ]);
    }
    case "all_ordered_abs_diff_lte": {
      const left = desugarArray(node.left);
      const right = desugarArray(node.right);
      return andAll([
        sameLength(left, right),
        {
          kind: "pairs_forall",
          left,
          right,
          where: compare(
            absSub(pairSide("left"), pairSide("right")),
            "lte",
            lit(node.value),
          ),
        },
      ]);
    }
    case "total_ordered_abs_diff_lte": {
      const left = desugarArray(node.left);
      const right = desugarArray(node.right);
      return andAll([
        sameLength(left, right),
        compare(
          sum({
            kind: "pairs_map",
            left,
            right,
            expr: absSub(pairSide("left"), pairSide("right")),
          }),
          "lte",
          lit(node.value),
        ),
      ]);
    }
    case "ordered_position_match_count_eq": {
      const left = desugarArray(node.left);
      const right = desugarArray(node.right);
      return andAll([
        sameLength(left, right),
        compare(
          pairwiseCountedMatches(
            left,
            right,
            compare(pairSide("left"), "eq", pairSide("right")),
          ),
          "eq",
          lit(node.value),
        ),
      ]);
    }
    case "ordered_position_compare_count_eq": {
      const left = desugarArray(node.left);
      const right = desugarArray(node.right);
      return andAll([
        sameLength(left, right),
        compare(
          pairwiseCountedMatches(
            left,
            right,
            compare(pairSide("left"), node.op, pairSide("right")),
          ),
          "eq",
          lit(node.value),
        ),
      ]);
    }
    case "value_within_any_count_at_least": {
      const left = desugarArray(node.left);
      const right = desugarArray(node.right);
      return compare(
        count({
          kind: "filter",
          of: left,
          where: {
            kind: "exists",
            of: right,
            where: compare(
              absSub(elem(1), elem(0)),
              "lte",
              lit(node.distance),
            ),
          },
        }),
        "gte",
        lit(node.value),
      );
    }
    case "digit_match_count_at_least": {
      const leftDigits: ArrayExprV3 = {
        kind: "digits",
        place: node.place,
        of: desugarArray(node.left),
      };
      const rightDigits: ArrayExprV3 = {
        kind: "digits",
        place: node.place,
        of: desugarArray(node.right),
      };
      return compare(
        count({
          kind: "filter",
          of: leftDigits,
          where: { kind: "contains", array: rightDigits, value: elem() },
        }),
        "gte",
        lit(node.value),
      );
    }
    case "all_values_between_min_max": {
      const of = desugarArray(node.of);
      const range = desugarArray(node.range);
      return andAll([
        compare(count(range), "gte", lit(1)),
        {
          kind: "forall",
          of,
          where: andAll([
            compare(elem(), "gte", { kind: "reduce", op: "min", of: range }),
            compare(elem(), "lte", { kind: "reduce", op: "max", of: range }),
          ]),
        },
      ]);
    }
    case "reversed_position_match_count_at_least": {
      const left = desugarArray(node.left);
      const right = desugarArray(node.right);
      return andAll([
        sameLength(left, right),
        compare(
          pairwiseCountedMatches(
            left,
            { kind: "reverse", of: right },
            compare(pairSide("left"), "eq", pairSide("right")),
          ),
          "gte",
          lit(node.value),
        ),
      ]);
    }
    case "and":
      return { kind: "and", clauses: node.clauses.map(desugarPredicate) };
    case "or":
      return { kind: "or", clauses: node.clauses.map(desugarPredicate) };
    case "not":
      return { kind: "not", clause: desugarPredicate(node.clause) };
  }
}

const GUESS: ArrayExprV3 = { kind: "source", source: "guess" };
const DRAW: ArrayExprV3 = { kind: "source", source: "draw" };

/**
 * Convert any v1/v2 rule AST into the v3 compositional core. v3 input is
 * returned unchanged. The result validates against the v3 schema and evaluates
 * identically to the source AST on every (guess, draw) input (see the
 * Monte-Carlo property tests).
 */
export function desugarToV3(ast: RuleAst): RuleAstV3 {
  if (ast.schemaVersion === 3) {
    return ast;
  }
  if (ast.schemaVersion === 1) {
    if (ast.node.kind === "sum_equals") {
      return v3Predicate(compare(sum(GUESS), "eq", sum(DRAW)));
    }
    if (ast.node.kind === "ordered_exact") {
      return v3Predicate(
        andAll([
          sameLength(GUESS, DRAW),
          {
            kind: "pairs_forall",
            left: GUESS,
            right: DRAW,
            where: compare(pairSide("left"), "eq", pairSide("right")),
          },
        ]),
      );
    }
    return v3Predicate(
      compare(
        count({ kind: "intersection", left: GUESS, right: DRAW }),
        "gte",
        lit(ast.node.value ?? 0),
      ),
    );
  }
  if (ast.result.type === "ranking") {
    return {
      schemaVersion: 3,
      result: {
        type: "ranking",
        score: desugarScalar(ast.result.score),
        direction: ast.result.direction,
        tieBreak: "share_pool",
      },
    };
  }
  return v3Predicate(desugarPredicate(ast.result.predicate));
}

function v3Predicate(predicate: PredicateNodeV3): RuleAstV3 {
  return { schemaVersion: 3, result: { type: "predicate", predicate } };
}
