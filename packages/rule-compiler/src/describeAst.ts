import type {
  ArithOp,
  ArrayExpr,
  ArrayExprV3,
  CompareOp,
  PredicateNode,
  PredicateNodeV3,
  RuleAst,
  RuleResult,
  RuleResultV3,
  ScalarExpr,
  ScalarExprV3,
} from "@tyche/rule-schema";

export interface AstPathDescription {
  astPath: string;
  behaviorDescription: string;
}

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
      throw new Error(
        `unrendered predicate node ${JSON.stringify(exhaustive)}`,
      );
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
      if (node.end === undefined) {
        return `${describeArrayV3(node.of)} from position ${node.start + 1} onward`;
      }
      if (node.end < 0) {
        const excluded = Math.abs(node.end);
        return `${describeArrayV3(node.of)} from position ${node.start + 1}, excluding ${
          excluded === 1 ? "its final value" : `its final ${excluded} values`
        }`;
      }
      return `positions ${node.start + 1} to ${node.end} of ${describeArrayV3(node.of)}`;
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
      {
        const gaps = describeAdjacentGaps(node.of);
        if (gaps) {
          if (node.op === "max") return `the largest ${gaps}`;
          if (node.op === "min") return `the smallest ${gaps}`;
          if (node.op === "sum") return `the sum of the ${gaps}`;
          if (node.op === "count") return `the number of ${gaps}`;
          if (node.op === "range_span") {
            return `the difference between the largest and smallest ${gaps}`;
          }
        }
      }
      if (
        node.op === "count" &&
        node.of.kind === "distinct" &&
        node.of.of.kind === "digits"
      ) {
        return `the number of different ${node.of.of.place} digits in ${describeArrayV3(
          node.of.of.of,
        )}`;
      }
      if (node.op === "count" && node.of.kind === "distinct") {
        const gaps = describeAdjacentGaps(node.of.of);
        if (gaps) return `the number of distinct ${gaps}`;
      }
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
      throw new Error(
        `unrendered v3 scalar node ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

/** The canonical shifted-zip idiom for consecutive gaps in a sorted source. */
function describeAdjacentGaps(node: ArrayExprV3): string | null {
  if (node.kind !== "pairs_map") {
    return null;
  }
  const { left, right, expr } = node;
  if (
    left.kind !== "slice" ||
    right.kind !== "slice" ||
    JSON.stringify(left.of) !== JSON.stringify(right.of) ||
    left.of.kind !== "sort" ||
    left.of.order !== "asc" ||
    expr.kind !== "arith" ||
    expr.op !== "sub" ||
    expr.left.kind !== "pair" ||
    expr.right.kind !== "pair"
  ) {
    return null;
  }
  const leftIsPrefix = left.start === 0 && left.end === -1;
  const leftIsSuffix = left.start === 1 && left.end === undefined;
  const rightIsPrefix = right.start === 0 && right.end === -1;
  const rightIsSuffix = right.start === 1 && right.end === undefined;
  const forwardGap =
    leftIsPrefix &&
    rightIsSuffix &&
    expr.left.side === "right" &&
    expr.right.side === "left";
  const reverseZipSameGap =
    leftIsSuffix &&
    rightIsPrefix &&
    expr.left.side === "left" &&
    expr.right.side === "right";
  if (!forwardGap && !reverseZipSameGap) {
    return null;
  }
  const source = describeArrayV3(left.of.of);
  return `adjacent gaps between consecutive values of ${source} sorted from lowest to highest`;
}

/**
 * Reads nested forall/exists distance constraints in the player's direction.
 * Binder direction is load-bearing: "every draw has a nearby guess" is not
 * "every guess has a nearby draw", even though both contain the same words.
 */
function describeCrossSourceDistance(node: PredicateNodeV3): string | null {
  if (
    (node.kind !== "forall" && node.kind !== "exists") ||
    node.of.kind !== "source" ||
    (node.where.kind !== "forall" && node.where.kind !== "exists") ||
    node.where.of.kind !== "source" ||
    node.where.of.source === node.of.source ||
    node.where.where.kind !== "compare"
  ) {
    return null;
  }
  const comparison = node.where.where;
  if (
    (comparison.op !== "lte" && comparison.op !== "gte") ||
    comparison.left.kind !== "abs" ||
    comparison.left.of.kind !== "arith" ||
    comparison.left.of.op !== "sub" ||
    comparison.right.kind !== "lit"
  ) {
    return null;
  }
  const operands = [comparison.left.of.left, comparison.left.of.right];
  if (
    !operands.every((operand) => operand.kind === "elem") ||
    new Set(
      operands.map((operand) =>
        operand.kind === "elem" ? (operand.up ?? 0) : -1,
      ),
    ).size !== 2
  ) {
    return null;
  }
  const sourceName = (source: "draw" | "guess") =>
    source === "draw" ? "drawn number" : "guessed number";
  const outerQuantity = node.kind === "forall" ? "every" : "at least one";
  const innerQuantity = node.where.kind === "forall" ? "every" : "at least one";
  const relation =
    comparison.op === "lte"
      ? `within ${comparison.right.value} of`
      : `at least ${comparison.right.value} away from`;
  return `${outerQuantity} ${sourceName(node.of.source)} is ${relation} ${innerQuantity} ${sourceName(node.where.of.source)}`;
}

/**
 * `exists(difference(guess, draw), exists(intersection(guess, draw),
 * mod(outer, 10) == mod(inner, 10)))` is the canonical "a miss shares its last
 * digit with a hit" rule. Rendering binder depth as "one level further out"
 * exposes an implementation detail and makes an exact artifact look different
 * from the approved rule to both players and the fidelity guardian.
 */
function describeMissHitSameLastDigit(node: PredicateNodeV3): string | null {
  if (
    node.kind !== "exists" ||
    node.of.kind !== "difference" ||
    !isSource(node.of.left, "guess") ||
    !isSource(node.of.right, "draw") ||
    node.where.kind !== "exists" ||
    node.where.of.kind !== "intersection" ||
    !isSource(node.where.of.left, "guess") ||
    !isSource(node.where.of.right, "draw") ||
    node.where.where.kind !== "compare" ||
    node.where.where.op !== "eq"
  ) {
    return null;
  }
  const binderLevelOfUnitsDigit = (value: ScalarExprV3): number | null => {
    if (
      value.kind !== "arith" ||
      value.op !== "mod" ||
      value.left.kind !== "elem" ||
      value.right.kind !== "lit" ||
      value.right.value !== 10
    ) {
      return null;
    }
    return value.left.up ?? 0;
  };
  const levels = [
    binderLevelOfUnitsDigit(node.where.where.left),
    binderLevelOfUnitsDigit(node.where.where.right),
  ];
  if (!levels.includes(0) || !levels.includes(1)) {
    return null;
  }
  return "at least one guessed number absent from the draw has the same last digit as at least one guessed number present in the draw";
}

function describeSamePositionPredicate(node: PredicateNodeV3): string | null {
  if (
    (node.kind !== "pairs_forall" && node.kind !== "pairs_exists") ||
    node.left.kind !== "source" ||
    node.left.source !== "guess" ||
    node.right.kind !== "source" ||
    node.right.source !== "draw" ||
    node.where.kind !== "compare"
  ) {
    return null;
  }
  const condition = node.where;
  if (
    condition.op === "eq" &&
    condition.left.kind === "pair" &&
    condition.left.side === "left" &&
    condition.right.kind === "pair" &&
    condition.right.side === "right"
  ) {
    return node.kind === "pairs_forall"
      ? "every guessed number equals the drawn number in the same position"
      : "at least one guessed number equals the drawn number in the same position";
  }
  if (
    node.kind === "pairs_forall" &&
    condition.op === "lte" &&
    condition.left.kind === "abs" &&
    condition.left.of.kind === "arith" &&
    condition.left.of.op === "sub" &&
    condition.left.of.left.kind === "pair" &&
    condition.left.of.left.side === "left" &&
    condition.left.of.right.kind === "pair" &&
    condition.left.of.right.side === "right" &&
    condition.right.kind === "lit"
  ) {
    return `every guessed number is within ${condition.right.value} of the drawn number in the same position`;
  }
  return null;
}

function describePairComparisonCountPredicate(
  node: PredicateNodeV3,
): string | null {
  if (
    node.kind !== "compare" ||
    (node.op !== "gte" && node.op !== "eq" && node.op !== "lte") ||
    node.right.kind !== "lit" ||
    node.left.kind !== "reduce" ||
    node.left.op !== "sum" ||
    node.left.of.kind !== "pairs_map" ||
    node.left.of.expr.kind !== "ite" ||
    node.left.of.expr.then.kind !== "lit" ||
    node.left.of.expr.then.value !== 1 ||
    node.left.of.expr.else.kind !== "lit" ||
    node.left.of.expr.else.value !== 0 ||
    node.left.of.expr.if.kind !== "compare" ||
    node.left.of.expr.if.left.kind !== "pair" ||
    node.left.of.expr.if.left.side !== "left" ||
    node.left.of.expr.if.right.kind !== "pair" ||
    node.left.of.expr.if.right.side !== "right"
  ) {
    return null;
  }
  const quantity =
    node.op === "gte" ? "at least" : node.op === "lte" ? "at most" : "exactly";
  const condition = node.left.of.expr.if;
  const comparison = COMPARE_PHRASE[condition.op];
  const left = describeArrayV3(node.left.of.left);
  const right = describeArrayV3(node.left.of.right);
  if (
    condition.op === "eq" &&
    isSource(node.left.of.left, "guess") &&
    isSource(node.left.of.right, "draw")
  ) {
    const plural = node.right.value === 1 ? "position" : "positions";
    return `${quantity} ${node.right.value} guessed ${plural} exactly match the draw`;
  }
  return `${quantity} ${node.right.value} of the paired comparisons hold: each value of ${left} ${comparison} the corresponding value of ${right}`;
}

function describePredicateV3(node: PredicateNodeV3): string {
  const missHitSameLastDigit = describeMissHitSameLastDigit(node);
  if (missHitSameLastDigit) {
    return missHitSameLastDigit;
  }
  const crossSourceDistance = describeCrossSourceDistance(node);
  if (crossSourceDistance) {
    return crossSourceDistance;
  }
  switch (node.kind) {
    case "compare":
      return (
        describePairComparisonCountPredicate(node) ??
        `${describeScalarV3(node.left)} ${COMPARE_PHRASE[node.op]} ${describeScalarV3(node.right)}`
      );
    case "contains":
      return `${describeArrayV3(node.array)} include ${describeScalarV3(node.value)}`;
    case "forall":
      return `every value of ${describeArrayV3(node.of)} satisfies that ${describePredicateV3(node.where)}`;
    case "exists":
      return `at least one value of ${describeArrayV3(node.of)} satisfies that ${describePredicateV3(node.where)}`;
    case "pairs_forall":
      return (
        describeSamePositionPredicate(node) ??
        `in every position of ${describeArrayV3(node.left)} and ${describeArrayV3(
          node.right,
        )}, ${describePredicateV3(node.where)}`
      );
    case "pairs_exists":
      return (
        describeSamePositionPredicate(node) ??
        `in at least one position of ${describeArrayV3(node.left)} and ${describeArrayV3(
          node.right,
        )}, ${describePredicateV3(node.where)}`
      );
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

function readSubsetRelation(
  node: PredicateNodeV3,
): readonly [ArrayExprV3, ArrayExprV3] | null {
  if (
    node.kind !== "forall" ||
    node.where.kind !== "exists" ||
    node.where.where.kind !== "compare" ||
    node.where.where.op !== "eq" ||
    node.where.where.left.kind !== "elem" ||
    node.where.where.right.kind !== "elem"
  ) {
    return null;
  }
  const levels = [
    node.where.where.left.up ?? 0,
    node.where.where.right.up ?? 0,
  ];
  return new Set(levels).size === 2 &&
    levels.every((level) => level === 0 || level === 1)
    ? [node.of, node.where.of]
    : null;
}

function describeMutualSetEquality(node: PredicateNodeV3): string | null {
  if (node.kind !== "and") {
    return null;
  }
  const relations = node.clauses
    .map(readSubsetRelation)
    .filter(
      (relation): relation is readonly [ArrayExprV3, ArrayExprV3] =>
        relation !== null,
    );
  if (relations.length !== node.clauses.length) {
    return null;
  }
  const relation = relations.find(([left, right]) =>
    relations.some(
      ([reverseLeft, reverseRight]) =>
        JSON.stringify(left) === JSON.stringify(reverseRight) &&
        JSON.stringify(right) === JSON.stringify(reverseLeft),
    ),
  );
  return relation
    ? `the set of ${describeArrayV3(relation[0])} is identical to the set of ${describeArrayV3(relation[1])}`
    : null;
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

  const setEquality = describeMutualSetEquality(node);
  if (setEquality) {
    return setEquality;
  }
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

function appendPath(
  target: AstPathDescription[],
  astPath: string,
  behaviorDescription: string,
) {
  target.push({ astPath, behaviorDescription });
}

function walkArrayV2(
  node: ArrayExpr,
  astPath: string,
  target: AstPathDescription[],
) {
  appendPath(target, astPath, describeArray(node));
  switch (node.kind) {
    case "source":
      return;
    case "digits":
    case "filter_compare":
    case "filter_mod":
    case "map_arithmetic":
    case "map_with_guard":
    case "sort":
    case "remove_up_to_n":
    case "slice":
      walkArrayV2(node.of, `${astPath}.of`, target);
      return;
    case "intersection":
    case "difference":
      walkArrayV2(node.left, `${astPath}.left`, target);
      walkArrayV2(node.right, `${astPath}.right`, target);
      return;
    default: {
      const exhaustive: never = node;
      throw new Error(`unrendered v2 array path ${JSON.stringify(exhaustive)}`);
    }
  }
}

function walkScalarV2(
  node: ScalarExpr,
  astPath: string,
  target: AstPathDescription[],
) {
  appendPath(target, astPath, describeScalar(node));
  switch (node.kind) {
    case "lit":
      return;
    case "reduce":
    case "at":
      walkArrayV2(node.of, `${astPath}.of`, target);
      return;
    case "arith":
      walkScalarV2(node.left, `${astPath}.left`, target);
      walkScalarV2(node.right, `${astPath}.right`, target);
      return;
    default: {
      const exhaustive: never = node;
      throw new Error(
        `unrendered v2 scalar path ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

function walkPredicateV2(
  node: PredicateNode,
  astPath: string,
  target: AstPathDescription[],
) {
  appendPath(target, astPath, describePredicate(node));
  switch (node.kind) {
    case "compare":
      walkScalarV2(node.left, `${astPath}.left`, target);
      walkScalarV2(node.right, `${astPath}.right`, target);
      return;
    case "count_at_least":
      walkArrayV2(node.of, `${astPath}.of`, target);
      return;
    case "all_equal_ordered":
    case "all_ordered_compare":
    case "all_ordered_abs_diff_lte":
    case "total_ordered_abs_diff_lte":
    case "ordered_position_match_count_eq":
    case "ordered_position_compare_count_eq":
    case "value_within_any_count_at_least":
    case "digit_match_count_at_least":
    case "reversed_position_match_count_at_least":
      walkArrayV2(node.left, `${astPath}.left`, target);
      walkArrayV2(node.right, `${astPath}.right`, target);
      return;
    case "all_values_between_min_max":
      walkArrayV2(node.of, `${astPath}.of`, target);
      walkArrayV2(node.range, `${astPath}.range`, target);
      return;
    case "and":
    case "or":
      node.clauses.forEach((clause, index) =>
        walkPredicateV2(clause, `${astPath}.clauses[${index}]`, target),
      );
      return;
    case "not":
      walkPredicateV2(node.clause, `${astPath}.clause`, target);
      return;
    default: {
      const exhaustive: never = node;
      throw new Error(
        `unrendered v2 predicate path ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

function walkResultV2(result: RuleResult, target: AstPathDescription[]) {
  if (result.type === "predicate") {
    walkPredicateV2(result.predicate, "result.predicate", target);
    return;
  }
  walkScalarV2(result.score, "result.score", target);
}

function walkArrayV3(
  node: ArrayExprV3,
  astPath: string,
  target: AstPathDescription[],
) {
  appendPath(target, astPath, describeArrayV3(node));
  switch (node.kind) {
    case "source":
      return;
    case "sort":
    case "reverse":
    case "slice":
    case "distinct":
    case "digits":
      walkArrayV3(node.of, `${astPath}.of`, target);
      return;
    case "intersection":
    case "difference":
      walkArrayV3(node.left, `${astPath}.left`, target);
      walkArrayV3(node.right, `${astPath}.right`, target);
      return;
    case "map":
      walkArrayV3(node.of, `${astPath}.of`, target);
      walkScalarV3(node.expr, `${astPath}.expr`, target);
      return;
    case "filter":
      walkArrayV3(node.of, `${astPath}.of`, target);
      walkPredicateV3(node.where, `${astPath}.where`, target);
      return;
    case "pairs_map":
      walkArrayV3(node.left, `${astPath}.left`, target);
      walkArrayV3(node.right, `${astPath}.right`, target);
      walkScalarV3(node.expr, `${astPath}.expr`, target);
      return;
    default: {
      const exhaustive: never = node;
      throw new Error(`unrendered v3 array path ${JSON.stringify(exhaustive)}`);
    }
  }
}

function walkScalarV3(
  node: ScalarExprV3,
  astPath: string,
  target: AstPathDescription[],
) {
  appendPath(target, astPath, describeScalarV3(node));
  switch (node.kind) {
    case "lit":
    case "elem":
    case "pair":
      return;
    case "reduce":
    case "at":
      walkArrayV3(node.of, `${astPath}.of`, target);
      return;
    case "arith":
      walkScalarV3(node.left, `${astPath}.left`, target);
      walkScalarV3(node.right, `${astPath}.right`, target);
      return;
    case "abs":
      walkScalarV3(node.of, `${astPath}.of`, target);
      return;
    case "ite":
      walkPredicateV3(node.if, `${astPath}.if`, target);
      walkScalarV3(node.then, `${astPath}.then`, target);
      walkScalarV3(node.else, `${astPath}.else`, target);
      return;
    default: {
      const exhaustive: never = node;
      throw new Error(
        `unrendered v3 scalar path ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

function walkPredicateV3(
  node: PredicateNodeV3,
  astPath: string,
  target: AstPathDescription[],
) {
  appendPath(target, astPath, describePredicateV3(node));
  switch (node.kind) {
    case "compare":
      walkScalarV3(node.left, `${astPath}.left`, target);
      walkScalarV3(node.right, `${astPath}.right`, target);
      return;
    case "contains":
      walkArrayV3(node.array, `${astPath}.array`, target);
      walkScalarV3(node.value, `${astPath}.value`, target);
      return;
    case "forall":
    case "exists":
      walkArrayV3(node.of, `${astPath}.of`, target);
      walkPredicateV3(node.where, `${astPath}.where`, target);
      return;
    case "pairs_forall":
    case "pairs_exists":
      walkArrayV3(node.left, `${astPath}.left`, target);
      walkArrayV3(node.right, `${astPath}.right`, target);
      walkPredicateV3(node.where, `${astPath}.where`, target);
      return;
    case "and":
    case "or":
      node.clauses.forEach((clause, index) =>
        walkPredicateV3(clause, `${astPath}.clauses[${index}]`, target),
      );
      return;
    case "not":
      walkPredicateV3(node.clause, `${astPath}.clause`, target);
      return;
    default: {
      const exhaustive: never = node;
      throw new Error(
        `unrendered v3 predicate path ${JSON.stringify(exhaustive)}`,
      );
    }
  }
}

function walkResultV3(result: RuleResultV3, target: AstPathDescription[]) {
  if (result.type === "predicate") {
    walkPredicateV3(result.predicate, "result.predicate", target);
    return;
  }
  if (result.eligibleWhen) {
    walkPredicateV3(result.eligibleWhen, "result.eligibleWhen", target);
  }
  walkScalarV3(result.score, "result.score", target);
}

function describePositionRangeConjunction(node: PredicateNode): string | null {
  if (node.kind !== "and") {
    return null;
  }

  const ranges = new Map<
    string,
    { high?: number; index: number; low?: number; source: "draw" | "guess" }
  >();
  for (const clause of node.clauses) {
    if (
      clause.kind !== "compare" ||
      (clause.op !== "gte" && clause.op !== "lte") ||
      clause.left.kind !== "at" ||
      clause.left.of.kind !== "source" ||
      clause.right.kind !== "lit"
    ) {
      return null;
    }
    const key = `${clause.left.of.source}:${clause.left.index}`;
    const range = ranges.get(key) ?? {
      index: clause.left.index,
      source: clause.left.of.source,
    };
    if (clause.op === "gte") {
      if (range.low !== undefined) return null;
      range.low = clause.right.value;
    } else {
      if (range.high !== undefined) return null;
      range.high = clause.right.value;
    }
    ranges.set(key, range);
  }

  const complete = [...ranges.values()]
    .filter(
      (
        range,
      ): range is {
        high: number;
        index: number;
        low: number;
        source: "draw" | "guess";
      } => range.low !== undefined && range.high !== undefined,
    )
    .sort((left, right) => left.index - right.index);
  if (complete.length * 2 !== node.clauses.length) {
    return null;
  }

  return joinList(
    complete.map((range) => {
      const subject =
        range.source === "guess"
          ? `its ${ordinal(range.index + 1)} number`
          : `the official draw's ${ordinal(range.index + 1)} number`;
      return `${subject} is between ${range.low} and ${range.high} (both included)`;
    }),
    "and",
  );
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

/**
 * Render any frozen rule AST as a single English sentence. Total: every node in
 * the closed grammar has a rendering, so this never returns null and never
 * silently omits part of the rule.
 */
/** Six positions x the widest distance between two numbers in 1..100. */
const MAX_TOTAL_POSITION_DISTANCE = 6 * 99;

function isSource(node: ArrayExprV3, source: "draw" | "guess") {
  return node.kind === "source" && node.source === source;
}

/** `abs(pair.left - pair.right)` — the same-position distance of one pair. */
function isPairDistance(node: ScalarExprV3) {
  return (
    node.kind === "abs" &&
    node.of.kind === "arith" &&
    node.of.op === "sub" &&
    node.of.left.kind === "pair" &&
    node.of.left.side === "left" &&
    node.of.right.kind === "pair" &&
    node.of.right.side === "right"
  );
}

/** `count(intersection(guess, draw))` — how many guessed numbers were drawn. */
function isMatchCount(node: ScalarExprV3) {
  return (
    node.kind === "reduce" &&
    node.op === "count" &&
    node.of.kind === "intersection" &&
    isSource(node.of.left, "guess") &&
    isSource(node.of.right, "draw")
  );
}

function isSumOfSource(node: ScalarExprV3, source: "draw" | "guess") {
  return (
    node.kind === "reduce" && node.op === "sum" && isSource(node.of, source)
  );
}

function isRangeSpanOfSource(node: ScalarExprV3, sourceName: "draw" | "guess") {
  return (
    node.kind === "reduce" &&
    node.op === "range_span" &&
    isSource(node.of, sourceName)
  );
}

function isAllSourceAboveDrawMinimum(node: PredicateNodeV3 | undefined) {
  return (
    node?.kind === "forall" &&
    isSource(node.of, "guess") &&
    node.where.kind === "compare" &&
    node.where.op === "gt" &&
    node.where.left.kind === "elem" &&
    (node.where.left.up ?? 0) === 0 &&
    node.where.right.kind === "reduce" &&
    node.where.right.op === "min" &&
    isSource(node.where.right.of, "draw")
  );
}

/**
 * `scale * range_span(guess) + sum(guess)`, minimized. When the scale is above
 * the largest possible sum difference, span is the primary criterion and sum
 * is only a tiebreak. The eligibility predicate is rendered separately so no
 * draw-relative condition disappears from the player-facing sentence.
 */
function describeMinimumSpanThenSumRanking(
  result: Extract<RuleResultV3, { type: "ranking" }>,
): string | null {
  if (
    result.direction !== "min" ||
    result.score.kind !== "arith" ||
    result.score.op !== "add" ||
    result.score.left.kind !== "arith" ||
    result.score.left.op !== "mul" ||
    result.score.left.left.kind !== "lit" ||
    result.score.left.left.value <= 600 ||
    !isRangeSpanOfSource(result.score.left.right, "guess") ||
    !isSumOfSource(result.score.right, "guess") ||
    !isAllSourceAboveDrawMinimum(result.eligibleWhen)
  ) {
    return null;
  }
  return sentence(
    "Only guesses whose six numbers are all greater than the smallest drawn number are eligible. Among them, the guess with the smallest gap between its highest and lowest number wins; a smaller sum breaks a tie. Guesses still tied after both criteria share the prize. If no guess is eligible, there is no winner",
  );
}

function describeEligibleSumRanking(
  result: Extract<RuleResultV3, { type: "ranking" }>,
): string | null {
  if (
    result.direction !== "max" ||
    !isSumOfSource(result.score, "guess") ||
    result.eligibleWhen?.kind !== "compare" ||
    result.eligibleWhen.op !== "lte" ||
    !isSumOfSource(result.eligibleWhen.left, "guess") ||
    !isSumOfSource(result.eligibleWhen.right, "draw")
  ) {
    return null;
  }
  return sentence(
    "The winning guess is the eligible guess with the highest sum: a guess is eligible only when the sum of its six numbers is at most the sum of the official draw's six numbers. Tied eligible guesses share the prize. If no guess is eligible, there is no winner",
  );
}

function describeEligibleMinimumSpanRanking(
  result: Extract<RuleResultV3, { type: "ranking" }>,
): string | null {
  if (
    result.direction !== "min" ||
    !isRangeSpanOfSource(result.score, "guess") ||
    result.eligibleWhen?.kind !== "compare" ||
    result.eligibleWhen.op !== "gte" ||
    !isMatchCount(result.eligibleWhen.left) ||
    result.eligibleWhen.right.kind !== "lit"
  ) {
    return null;
  }
  return sentence(
    `Only guesses with at least ${result.eligibleWhen.right.value} of their six numbers present in the official draw are eligible. Among eligible guesses, the guess with the smallest difference between its highest and lowest number wins. Tied eligible guesses share the prize. If no guess is eligible, there is no winner`,
  );
}

/**
 * `scale * matchCount` where the scale provably outruns the distance term, so
 * the subtraction below really is a tiebreak and not a blended score. Returns
 * null for any smaller scale: the wording this produces would be a lie about an
 * artifact where a big enough distance CAN overturn a match, and such a rule
 * must fall through to the literal formula instead.
 */
function isScaledMatchCount(node: ScalarExprV3) {
  return (
    node.kind === "arith" &&
    node.op === "mul" &&
    node.left.kind === "lit" &&
    node.left.value > MAX_TOTAL_POSITION_DISTANCE &&
    isMatchCount(node.right)
  );
}

/** `sum(pairs_map(guess, draw, |left - right|))` — total position distance. */
function isTotalPositionDistance(node: ScalarExprV3) {
  return (
    node.kind === "reduce" &&
    node.op === "sum" &&
    node.of.kind === "pairs_map" &&
    isSource(node.of.left, "guess") &&
    isSource(node.of.right, "draw") &&
    isPairDistance(node.of.expr)
  );
}

/**
 * The lexicographic fold, read back as the two ordered criteria it encodes.
 *
 * Without this the player's card shows the arithmetic verbatim ("1000 times how
 * many values are in ... minus the sum of ..."), which is accurate and unusable:
 * nobody can tell from it that the second term only matters when the first ties.
 * Recognizing the shape is what lets the prose stay a pure function of the AST —
 * the property this whole renderer exists to guarantee — while still reading like
 * the sentence the player wrote.
 */
function describeLexicographicRanking(
  result: Extract<RuleResultV3, { type: "ranking" }>,
): string | null {
  const { direction, score } = result;
  if (
    result.eligibleWhen !== undefined ||
    direction !== "max" ||
    score.kind !== "arith" ||
    score.op !== "sub" ||
    !isScaledMatchCount(score.left) ||
    !isTotalPositionDistance(score.right)
  ) {
    return null;
  }
  return sentence(
    "The winning guess is the one whose numbers include the MOST of the official draw's numbers. When that cannot separate the guesses, the tie is broken in favour of the guess that is closest to the draw position by position — the smallest total distance between each guessed number and the drawn number in the same position. Guesses still tied after both criteria share the pool",
  );
}

/**
 * `max(map(guess, min(map(draw, abs(outerElem - elem)))))`, minimized.
 * This is the order-independent nearest-neighbour minimax score. Recognizing
 * the binder structure keeps the public explanation from degrading into
 * implementation language such as "the value one level further out".
 */
function describeNearestNeighbourMinimaxRanking(
  result: Extract<RuleResultV3, { type: "ranking" }>,
): string | null {
  if (
    result.eligibleWhen !== undefined ||
    result.direction !== "min" ||
    result.score.kind !== "reduce" ||
    result.score.op !== "max" ||
    result.score.of.kind !== "map" ||
    !isSource(result.score.of.of, "guess") ||
    result.score.of.expr.kind !== "reduce" ||
    result.score.of.expr.op !== "min" ||
    result.score.of.expr.of.kind !== "map" ||
    !isSource(result.score.of.expr.of.of, "draw")
  ) {
    return null;
  }
  const distance = result.score.of.expr.of.expr;
  if (
    distance.kind !== "abs" ||
    distance.of.kind !== "arith" ||
    distance.of.op !== "sub" ||
    distance.of.left.kind !== "elem" ||
    distance.of.right.kind !== "elem" ||
    new Set([distance.of.left.up ?? 0, distance.of.right.up ?? 0]).size !== 2 ||
    ![distance.of.left.up ?? 0, distance.of.right.up ?? 0].every(
      (level) => level === 0 || level === 1,
    )
  ) {
    return null;
  }
  return sentence(
    "For each guessed number, measure its distance to the nearest drawn number. The guess whose largest such distance is smallest wins; tied guesses share the prize",
  );
}

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
    if (ast.schemaVersion === 3) {
      const nearestNeighbourMinimax = describeNearestNeighbourMinimaxRanking(
        ast.result,
      );
      if (nearestNeighbourMinimax) {
        return nearestNeighbourMinimax;
      }
      const eligibleSumRanking = describeEligibleSumRanking(ast.result);
      if (eligibleSumRanking) {
        return eligibleSumRanking;
      }
      const eligibleMinimumSpanRanking = describeEligibleMinimumSpanRanking(
        ast.result,
      );
      if (eligibleMinimumSpanRanking) {
        return eligibleMinimumSpanRanking;
      }
      const lexicographic = describeLexicographicRanking(ast.result);
      if (lexicographic) {
        return lexicographic;
      }
      const minimumSpanThenSum = describeMinimumSpanThenSumRanking(ast.result);
      if (minimumSpanThenSum) {
        return minimumSpanThenSum;
      }
    }
    const score =
      ast.schemaVersion === 3
        ? describeScalarV3(ast.result.score)
        : describeScalar(ast.result.score);
    const direction = ast.result.direction === "max" ? "highest" : "lowest";
    const winningCriterion = `the guess with the ${direction} value of ${score} wins`;
    if (ast.schemaVersion === 3 && ast.result.eligibleWhen) {
      const eligibility = ast.result.eligibleWhen;
      const eligibilityDescription =
        eligibility.kind === "compare" &&
        eligibility.op === "gte" &&
        isMatchCount(eligibility.left) &&
        eligibility.right.kind === "lit"
          ? `Only guesses containing at least ${eligibility.right.value} drawn numbers are eligible`
          : `Only guesses satisfying this condition are eligible: ${describePredicateV3(eligibility)}`;
      return sentence(
        `${eligibilityDescription}. Among eligible guesses, ${winningCriterion}; tied eligible guesses share the prize. If no guess is eligible, there is no winner`,
      );
    }
    return sentence(
      `The guess with the ${direction} value of ${score} wins; tied guesses share the prize`,
    );
  }

  const clause =
    ast.schemaVersion === 3
      ? describeConjunctionV3(ast.result.predicate)
      : (describePositionRangeConjunction(ast.result.predicate) ??
        describePredicate(ast.result.predicate));
  return sentence(`A guess wins if ${clause}`);
}

/**
 * Returns one deterministic description for every semantic unit in an AST.
 * Paths are stable, root-relative property paths suitable for audit records;
 * array positions use bracket notation (for example
 * `result.predicate.clauses[0]`). The first entry always describes the complete
 * result, so ranking direction, eligibility, and tie handling cannot disappear
 * merely because they are properties rather than child nodes.
 */
export function describeRuleAstPaths(
  ast: RuleAst,
): readonly AstPathDescription[] {
  if (ast.schemaVersion === 1) {
    return [
      {
        astPath: "node",
        behaviorDescription: describeRuleAstTotal(ast),
      },
    ];
  }

  const descriptions: AstPathDescription[] = [
    {
      astPath: "result",
      behaviorDescription: describeRuleAstTotal(ast),
    },
  ];
  if (ast.schemaVersion === 3) {
    walkResultV3(ast.result, descriptions);
  } else {
    walkResultV2(ast.result, descriptions);
  }
  return descriptions;
}

/** Resolves only paths emitted by `describeRuleAstPaths`; unknown paths fail. */
export function describeRuleAstPath(
  ast: RuleAst,
  astPath: string,
): string | null {
  return (
    describeRuleAstPaths(ast).find((entry) => entry.astPath === astPath)
      ?.behaviorDescription ?? null
  );
}
