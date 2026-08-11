import type {
  ArithOp,
  ArrayExpr,
  ArrayExprV3,
  CompareOp,
  PredicateNode,
  PredicateNodeV3,
  RuleAst,
  ScalarExpr,
  ScalarExprV3,
} from "@tyche/rule-schema";

// Total AST -> English renderer.
//
// The frozen AST is what pays the prize; the player only ever reads prose. As
// long as that prose is written by a model ABOUT THE TEXT, the two can disagree
// without anything noticing — turn 55 shipped a card promising "your six numbers
// are exactly {1,2,3,4,5,6}" over an artifact that paid "all six of your numbers
// appear in the draw".
//
// This renderer removes the possibility rather than checking for it: the
// description is a pure function of the frozen AST, so it cannot describe a rule
// the runtime will not execute. It is TOTAL — every node kind in the closed
// grammar renders, and the exhaustiveness checks make an unrendered future node
// a compile error, never a silent `null`.

const COMPARE_PHRASE: Record<CompareOp, string> = {
  eq: "is equal to",
  neq: "is different from",
  lt: "is less than",
  lte: "is at most",
  gt: "is greater than",
  gte: "is at least",
};

const ARITH_PHRASE: Record<ArithOp, string> = {
  add: "plus",
  sub: "minus",
  mul: "times",
  div: "divided by",
  mod: "modulo",
};

const ORDINALS = [
  "1st",
  "2nd",
  "3rd",
  "4th",
  "5th",
  "6th",
  "7th",
  "8th",
  "9th",
  "10th",
] as const;

function ordinal(position: number) {
  return ORDINALS[position - 1] ?? `${position}th`;
}

function joinList(parts: readonly string[], conjunction: "and" | "or") {
  if (parts.length <= 1) {
    return parts[0] ?? "";
  }
  if (parts.length === 2) {
    return `${parts[0]} ${conjunction} ${parts[1]}`;
  }
  return `${parts.slice(0, -1).join(", ")} ${conjunction} ${parts.at(-1)}`;
}

function sentence(value: string) {
  const trimmed = value.trim().replace(/\.+$/u, "");
  if (!trimmed) {
    return "";
  }
  return `${trimmed.charAt(0).toUpperCase()}${trimmed.slice(1)}.`;
}

// ---------------------------------------------------------------------------
// schemaVersion 2 grammar
// ---------------------------------------------------------------------------

function describeArray(node: ArrayExpr): string {
  switch (node.kind) {
    case "source":
      return node.source === "guess" ? "your numbers" : "the drawn numbers";
    case "digits":
      return `the ${node.place} digits of ${describeArray(node.of)}`;
    case "filter_compare":
      return `the values of ${describeArray(node.of)} that ${
        COMPARE_PHRASE[node.op]
      } ${node.value}`;
    case "filter_mod": {
      if (node.modulus === 2) {
        return `the ${node.equals === 0 ? "even" : "odd"} values of ${describeArray(node.of)}`;
      }
      return `the values of ${describeArray(node.of)} that leave remainder ${
        node.equals
      } when divided by ${node.modulus}`;
    }
    case "map_arithmetic":
      return `each value of ${describeArray(node.of)} ${ARITH_PHRASE[node.op]} ${node.operand}`;
    case "map_with_guard":
      return `each value of ${describeArray(node.of)} ${ARITH_PHRASE[node.op]} ${
        node.operand
      } (${
        node.onGuardFail === "keep_original"
          ? "keeping the original value"
          : "dropping the value"
      } when the result falls outside ${node.guard.min}-${node.guard.max})`;
    case "intersection":
      return `the values present in both ${describeArray(node.left)} and ${describeArray(node.right)}`;
    case "difference":
      return `the values of ${describeArray(node.left)} that are absent from ${describeArray(node.right)}`;
    case "sort":
      return `${describeArray(node.of)} sorted from ${
        node.order === "asc" ? "lowest to highest" : "highest to lowest"
      }`;
    case "remove_up_to_n":
      return `${describeArray(node.of)} after removing up to ${node.n} of its ${
        node.strategy === "first" ? "first" : node.strategy
      } values`;
    case "slice":
      return node.end === undefined
        ? `${describeArray(node.of)} from position ${node.start + 1} onward`
        : `positions ${node.start + 1} to ${node.end} of ${describeArray(node.of)}`;
    default: {
      const exhaustive: never = node;
      throw new Error(`unrendered array node ${JSON.stringify(exhaustive)}`);
    }
  }
}

function describeScalar(node: ScalarExpr): string {
  switch (node.kind) {
    case "lit":
      return String(node.value);
    case "reduce":
      return describeReduce(node.op, describeArray(node.of));
    case "at":
      return `the ${ordinal(node.index + 1)} value of ${describeArray(node.of)}`;
    case "arith":
      return `(${describeScalar(node.left)} ${ARITH_PHRASE[node.op]} ${describeScalar(node.right)})`;
    default: {
      const exhaustive: never = node;
      throw new Error(`unrendered scalar node ${JSON.stringify(exhaustive)}`);
    }
  }
}

function describeReduce(
  op: "sum" | "product" | "count" | "min" | "max" | "range_span",
  target: string,
) {
  switch (op) {
    case "sum":
      return `the sum of ${target}`;
    case "product":
      return `the product of ${target}`;
    case "count":
      return `how many values are in ${target}`;
    case "min":
      return `the smallest of ${target}`;
    case "max":
      return `the largest of ${target}`;
    case "range_span":
      return `the gap between the largest and smallest of ${target}`;
    default: {
      const exhaustive: never = op;
      throw new Error(`unrendered reduce op ${String(exhaustive)}`);
    }
  }
}

function describePredicate(node: PredicateNode): string {
  switch (node.kind) {
    case "compare":
      return `${describeScalar(node.left)} ${COMPARE_PHRASE[node.op]} ${describeScalar(node.right)}`;
    case "count_at_least":
      return `at least ${node.value} values are present in ${describeArray(node.of)}`;
    case "all_equal_ordered":
      return `${describeArray(node.left)} and ${describeArray(node.right)} are identical position by position`;
    case "all_ordered_compare":
      return `every value of ${describeArray(node.left)} ${
        COMPARE_PHRASE[node.op]
      } the value of ${describeArray(node.right)} in the same position`;
    case "all_ordered_abs_diff_lte":
      return `every value of ${describeArray(node.left)} is within ${
        node.value
      } of the value of ${describeArray(node.right)} in the same position`;
    case "total_ordered_abs_diff_lte":
      return `the total position-by-position distance between ${describeArray(
        node.left,
      )} and ${describeArray(node.right)} is at most ${node.value}`;
    case "ordered_position_match_count_eq":
      return `exactly ${node.value} positions hold the same value in ${describeArray(
        node.left,
      )} and ${describeArray(node.right)}`;
    case "ordered_position_compare_count_eq":
      return `in exactly ${node.value} positions, the value of ${describeArray(
        node.left,
      )} ${COMPARE_PHRASE[node.op]} the value of ${describeArray(node.right)}`;
    case "value_within_any_count_at_least":
      return `at least ${node.value} values of ${describeArray(node.left)} are within ${
        node.distance
      } of some value of ${describeArray(node.right)}`;
    case "digit_match_count_at_least":
      return `at least ${node.value} values of ${describeArray(node.left)} share their ${
        node.place
      } digit with some value of ${describeArray(node.right)}`;
    case "all_values_between_min_max":
      return `every value of ${describeArray(node.of)} lies between the smallest and largest of ${describeArray(
        node.range,
      )}`;
    case "reversed_position_match_count_at_least":
      return `at least ${node.value} values of ${describeArray(node.left)} match ${describeArray(
        node.right,
      )} when the positions are reversed`;
    case "and":
      return joinList(node.clauses.map(describePredicate), "and");
    case "or":
      return joinList(node.clauses.map(describePredicate), "or");
    case "not":
      return `it is not the case that ${describePredicate(node.clause)}`;
    default: {
      const exhaustive: never = node;
      throw new Error(`unrendered predicate node ${JSON.stringify(exhaustive)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// schemaVersion 3 grammar (implicit binders)
// ---------------------------------------------------------------------------

// `elem` refers to the value bound by the nearest enclosing map/filter/quantifier;
// `up` walks outward through nested binders.
function describeElem(up: number) {
  return up === 0 ? "the value" : `the value ${up} level(s) further out`;
}

function describeArrayV3(node: ArrayExprV3): string {
  switch (node.kind) {
    case "source":
      return node.source === "guess" ? "your numbers" : "the drawn numbers";
    case "sort":
      return `${describeArrayV3(node.of)} sorted from ${
        node.order === "asc" ? "lowest to highest" : "highest to lowest"
      }`;
    case "reverse":
      return `${describeArrayV3(node.of)} in reverse order`;
    case "slice":
      return node.end === undefined
        ? `${describeArrayV3(node.of)} from position ${node.start + 1} onward`
        : `positions ${node.start + 1} to ${node.end} of ${describeArrayV3(node.of)}`;
    case "distinct":
      return `the distinct values of ${describeArrayV3(node.of)}`;
    case "intersection":
      return `the values present in both ${describeArrayV3(node.left)} and ${describeArrayV3(node.right)}`;
    case "difference":
      return `the values of ${describeArrayV3(node.left)} that are absent from ${describeArrayV3(node.right)}`;
    case "digits":
      return `the ${node.place} digits of ${describeArrayV3(node.of)}`;
    case "map":
      return `${describeArrayV3(node.of)}, each replaced by ${describeScalarV3(node.expr)}`;
    case "filter":
      return `the values of ${describeArrayV3(node.of)} where ${describePredicateV3(node.where)}`;
    case "pairs_map":
      return `each position of ${describeArrayV3(node.left)} and ${describeArrayV3(
        node.right,
      )} combined into ${describeScalarV3(node.expr)}`;
    default: {
      const exhaustive: never = node;
      throw new Error(`unrendered v3 array node ${JSON.stringify(exhaustive)}`);
    }
  }
}

function describeScalarV3(node: ScalarExprV3): string {
  switch (node.kind) {
    case "lit":
      return String(node.value);
    case "reduce":
      return describeReduce(node.op, describeArrayV3(node.of));
    case "at":
      return `the ${ordinal(node.index + 1)} value of ${describeArrayV3(node.of)}`;
    case "arith":
      return `(${describeScalarV3(node.left)} ${ARITH_PHRASE[node.op]} ${describeScalarV3(node.right)})`;
    case "abs":
      return `the distance from zero of ${describeScalarV3(node.of)}`;
    case "ite":
      return `${describeScalarV3(node.then)} when ${describePredicateV3(node.if)}, otherwise ${describeScalarV3(node.else)}`;
    case "elem":
      return describeElem(node.up ?? 0);
    case "pair":
      return node.side === "left"
        ? "the value from the first list"
        : "the value from the second list";
    default: {
      const exhaustive: never = node;
      throw new Error(`unrendered v3 scalar node ${JSON.stringify(exhaustive)}`);
    }
  }
}

function describePredicateV3(node: PredicateNodeV3): string {
  switch (node.kind) {
    case "compare":
      return `${describeScalarV3(node.left)} ${COMPARE_PHRASE[node.op]} ${describeScalarV3(node.right)}`;
    case "contains":
      return `${describeArrayV3(node.array)} include ${describeScalarV3(node.value)}`;
    case "forall":
      return `every value of ${describeArrayV3(node.of)} satisfies that ${describePredicateV3(node.where)}`;
    case "exists":
      return `at least one value of ${describeArrayV3(node.of)} satisfies that ${describePredicateV3(node.where)}`;
    case "pairs_forall":
      return `in every position of ${describeArrayV3(node.left)} and ${describeArrayV3(
        node.right,
      )}, ${describePredicateV3(node.where)}`;
    case "pairs_exists":
      return `in at least one position of ${describeArrayV3(node.left)} and ${describeArrayV3(
        node.right,
      )}, ${describePredicateV3(node.where)}`;
    case "and":
      return joinList(node.clauses.map(describePredicateV3), "and");
    case "or":
      return joinList(node.clauses.map(describePredicateV3), "or");
    case "not":
      return `it is not the case that ${describePredicateV3(node.clause)}`;
    default: {
      const exhaustive: never = node;
      throw new Error(
        `unrendered v3 predicate node ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Readability shortcuts
// ---------------------------------------------------------------------------

// `contains(guess, lit v)` — the only way to pin a specific value without an
// array-literal node in the grammar.
function containsLiteralOnGuess(node: PredicateNodeV3): number | null {
  if (
    node.kind !== "contains" ||
    node.array.kind !== "source" ||
    node.array.source !== "guess" ||
    node.value.kind !== "lit"
  ) {
    return null;
  }
  return node.value.value;
}

// `exists(source, and(elem >= lo, elem <= hi))` reads far better as a range.
function describeExistsInRange(node: PredicateNodeV3): string | null {
  if (node.kind !== "exists" || node.of.kind !== "source") {
    return null;
  }
  const where = node.where;
  if (where.kind !== "and" || where.clauses.length !== 2) {
    return null;
  }
  const bounds = new Map<string, number>();
  for (const clause of where.clauses) {
    if (
      clause.kind !== "compare" ||
      clause.left.kind !== "elem" ||
      (clause.left.up ?? 0) !== 0 ||
      clause.right.kind !== "lit" ||
      (clause.op !== "gte" && clause.op !== "lte")
    ) {
      return null;
    }
    bounds.set(clause.op, clause.right.value);
  }
  const low = bounds.get("gte");
  const high = bounds.get("lte");
  if (low === undefined || high === undefined || low > high) {
    return null;
  }
  const subject =
    node.of.source === "guess" ? "your numbers" : "the drawn numbers";
  return `at least one of ${subject} is between ${low} and ${high} (both included)`;
}

// A guess holds six DISTINCT numbers, so "the guess includes each of these six
// values" is the same statement as "the guess is exactly this set". Rendering
// the conjunction literally ("your numbers include 1, and your numbers include
// 2, ...") is truthful but unreadable, and this is the shape a faithful compile
// of an explicit-set rule takes.
function describeConjunctionV3(node: PredicateNodeV3): string {
  const shortcut = (clause: PredicateNodeV3) =>
    describeExistsInRange(clause) ?? describePredicateV3(clause);

  if (node.kind !== "and") {
    return shortcut(node);
  }

  // Group the pinned values wherever they sit among the conjuncts.
  const pinnedValues: number[] = [];
  const otherClauses: PredicateNodeV3[] = [];
  for (const clause of node.clauses) {
    const value = containsLiteralOnGuess(clause);
    if (value === null) {
      otherClauses.push(clause);
    } else {
      pinnedValues.push(value);
    }
  }

  const parts: string[] = [];
  if (pinnedValues.length > 0) {
    const sorted = [...new Set(pinnedValues)].sort((a, b) => a - b);
    parts.push(
      sorted.length === 6
        ? `your six numbers are exactly ${joinList(sorted.map(String), "and")}, in any order`
        : `your numbers include ${joinList(sorted.map(String), "and")}`,
    );
  }
  parts.push(...otherClauses.map(shortcut));
  return joinList(parts, "and");
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render any frozen rule AST as a single English sentence. Total: every node in
 * the closed grammar has a rendering, so this never returns null and never
 * silently omits part of the rule.
 */
export function describeRuleAstTotal(ast: RuleAst): string {
  if (ast.schemaVersion === 1) {
    switch (ast.node.kind) {
      case "match_count_at_least":
        return sentence(
          `A guess wins if at least ${ast.node.value ?? 0} of its numbers appear in the official draw, regardless of order`,
        );
      case "sum_equals":
        return sentence(
          "A guess wins if the sum of its six numbers equals the sum of the six drawn numbers",
        );
      case "ordered_exact":
        return sentence(
          "A guess wins if all six of its numbers match the official draw in the same positions",
        );
      default: {
        // v1 is one object with a union `kind`, so narrow on the tag itself.
        const exhaustive: never = ast.node.kind;
        throw new Error(`unrendered v1 node ${String(exhaustive)}`);
      }
    }
  }

  if (ast.result.type === "ranking") {
    const score =
      ast.schemaVersion === 3
        ? describeScalarV3(ast.result.score)
        : describeScalar(ast.result.score);
    const direction = ast.result.direction === "max" ? "highest" : "lowest";
    return sentence(
      `The guess with the ${direction} value of ${score} wins; tied guesses share the prize`,
    );
  }

  const clause =
    ast.schemaVersion === 3
      ? describeConjunctionV3(ast.result.predicate)
      : describePredicate(ast.result.predicate);
  return sentence(`A guess wins if ${clause}`);
}
