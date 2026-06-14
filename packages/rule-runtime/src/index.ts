import type {
  ArrayExpr,
  ArithOp,
  PredicateNode,
  RuleAst,
  ScalarExpr,
} from "@idealer/rule-schema";

// Deterministic, sandboxed interpreter for the frozen rule DSL/AST (PRD §7.7).
// The same (guess, draw, frozen artifact) always produces the same result.
// There is no clock, RNG, IO, or unbounded loop reachable from the AST.

export interface RuleRuntimeInput {
  guess: readonly number[];
  draw: readonly number[];
}

export const RULE_RUNTIME_LIMITS = {
  timeoutMs: 25,
  maxOperations: 10_000,
  maxAstDepth: 16,
  maxIntermediateArraySize: 100,
  memoryMb: 32,
  allowNetwork: false,
  allowFilesystem: false,
  allowImports: false,
  allowRandomness: false,
  allowClock: false,
} as const;

export type RuleRuntimeErrorCode =
  | "MAX_OPERATIONS"
  | "MAX_DEPTH"
  | "MAX_ARRAY_SIZE"
  | "INVALID_NODE"
  | "NOT_A_RANKING_RULE";

export class RuleRuntimeError extends Error {
  readonly code: RuleRuntimeErrorCode;
  constructor(code: RuleRuntimeErrorCode, message: string) {
    super(message);
    this.name = "RuleRuntimeError";
    this.code = code;
  }
}

export interface PredicateEvaluation {
  result: "WIN" | "LOSE";
  runtimeSteps: number;
  matchedRuleBranch: string;
}

interface Budget {
  ops: number;
  depth: number;
}

function tick(budget: Budget) {
  budget.ops += 1;
  if (budget.ops > RULE_RUNTIME_LIMITS.maxOperations) {
    throw new RuleRuntimeError(
      "MAX_OPERATIONS",
      `operation budget exceeded (${RULE_RUNTIME_LIMITS.maxOperations})`,
    );
  }
}

function enter(budget: Budget) {
  budget.depth += 1;
  if (budget.depth > RULE_RUNTIME_LIMITS.maxAstDepth) {
    throw new RuleRuntimeError(
      "MAX_DEPTH",
      `AST depth budget exceeded (${RULE_RUNTIME_LIMITS.maxAstDepth})`,
    );
  }
}

function leave(budget: Budget) {
  budget.depth -= 1;
}

function guardArray(values: number[]): number[] {
  if (values.length > RULE_RUNTIME_LIMITS.maxIntermediateArraySize) {
    throw new RuleRuntimeError(
      "MAX_ARRAY_SIZE",
      `intermediate array exceeded ${RULE_RUNTIME_LIMITS.maxIntermediateArraySize}`,
    );
  }
  return values;
}

// Deterministic, defined arithmetic. Division is integer (truncated); division
// or modulo by zero returns a defined 0 (never NaN/Infinity) per the runtime
// safety contract (PRD §6.7 no-op fallback for invalid values).
function applyArith(op: ArithOp, a: number, b: number): number {
  switch (op) {
    case "add":
      return a + b;
    case "sub":
      return a - b;
    case "mul":
      return a * b;
    case "div":
      return b === 0 ? 0 : Math.trunc(a / b);
    case "mod":
      return b <= 0 ? 0 : ((a % b) + b) % b;
    default:
      throw new RuleRuntimeError("INVALID_NODE", `unknown arith op`);
  }
}

function digit(n: number, place: "units" | "tens"): number {
  const abs = Math.abs(Math.trunc(n));
  return place === "units" ? abs % 10 : Math.floor(abs / 10) % 10;
}

function uniqueIntersection(left: number[], right: number[]): number[] {
  const rightSet = new Set(right);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of left) {
    if (rightSet.has(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function uniqueDifference(left: number[], right: number[]): number[] {
  const rightSet = new Set(right);
  const seen = new Set<number>();
  const out: number[] = [];
  for (const value of left) {
    if (!rightSet.has(value) && !seen.has(value)) {
      seen.add(value);
      out.push(value);
    }
  }
  return out;
}

function evalArray(
  node: ArrayExpr,
  input: RuleRuntimeInput,
  budget: Budget,
): number[] {
  tick(budget);
  enter(budget);
  try {
    switch (node.kind) {
      case "source":
        return guardArray([
          ...(node.source === "guess" ? input.guess : input.draw),
        ]);
      case "digits":
        return guardArray(
          evalArray(node.of, input, budget).map((value) =>
            digit(value, node.place),
          ),
        );
      case "map_arithmetic":
        return guardArray(
          evalArray(node.of, input, budget).map((value) =>
            applyArith(node.op, value, node.operand),
          ),
        );
      case "map_with_guard": {
        const out: number[] = [];
        for (const value of evalArray(node.of, input, budget)) {
          const next = applyArith(node.op, value, node.operand);
          const inRange = next >= node.guard.min && next <= node.guard.max;
          if (inRange) {
            out.push(next);
          } else if (node.onGuardFail === "keep_original") {
            out.push(value);
          }
          // "drop" => skip
        }
        return guardArray(out);
      }
      case "intersection":
        return guardArray(
          uniqueIntersection(
            evalArray(node.left, input, budget),
            evalArray(node.right, input, budget),
          ),
        );
      case "difference":
        return guardArray(
          uniqueDifference(
            evalArray(node.left, input, budget),
            evalArray(node.right, input, budget),
          ),
        );
      case "sort": {
        const sorted = [...evalArray(node.of, input, budget)].sort((a, b) =>
          node.order === "asc" ? a - b : b - a,
        );
        return guardArray(sorted);
      }
      case "remove_up_to_n": {
        const source = [...evalArray(node.of, input, budget)];
        const n = Math.min(node.n, source.length);
        if (node.strategy === "first") {
          return guardArray(source.slice(n));
        }
        const ordered = [...source].sort((a, b) =>
          node.strategy === "highest" ? b - a : a - b,
        );
        const toRemove = ordered.slice(0, n);
        // Remove the first occurrence of each targeted value, preserving order.
        const removal = [...toRemove];
        const out: number[] = [];
        for (const value of source) {
          const idx = removal.indexOf(value);
          if (idx >= 0) {
            removal.splice(idx, 1);
          } else {
            out.push(value);
          }
        }
        return guardArray(out);
      }
      case "slice": {
        const source = evalArray(node.of, input, budget);
        return guardArray(source.slice(node.start, node.end));
      }
      default: {
        const _exhaustive: never = node;
        throw new RuleRuntimeError(
          "INVALID_NODE",
          `unknown array node ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  } finally {
    leave(budget);
  }
}

function evalScalar(
  node: ScalarExpr,
  input: RuleRuntimeInput,
  budget: Budget,
): number {
  tick(budget);
  enter(budget);
  try {
    switch (node.kind) {
      case "lit":
        return node.value;
      case "reduce": {
        const values = evalArray(node.of, input, budget);
        switch (node.op) {
          case "sum":
            return values.reduce((total, value) => total + value, 0);
          case "product":
            return values.reduce((total, value) => total * value, 1);
          case "count":
            return values.length;
          case "min":
            return values.length === 0 ? 0 : Math.min(...values);
          case "max":
            return values.length === 0 ? 0 : Math.max(...values);
          case "range_span":
            return values.length === 0
              ? 0
              : Math.max(...values) - Math.min(...values);
          default:
            throw new RuleRuntimeError("INVALID_NODE", "unknown reduce op");
        }
      }
      case "at": {
        const values = evalArray(node.of, input, budget);
        return node.index >= 0 && node.index < values.length
          ? values[node.index]!
          : 0;
      }
      case "arith":
        return applyArith(
          node.op,
          evalScalar(node.left, input, budget),
          evalScalar(node.right, input, budget),
        );
      default: {
        const _exhaustive: never = node;
        throw new RuleRuntimeError(
          "INVALID_NODE",
          `unknown scalar node ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  } finally {
    leave(budget);
  }
}

function evalPredicate(
  node: PredicateNode,
  input: RuleRuntimeInput,
  budget: Budget,
): boolean {
  tick(budget);
  enter(budget);
  try {
    switch (node.kind) {
      case "compare": {
        const left = evalScalar(node.left, input, budget);
        const right = evalScalar(node.right, input, budget);
        switch (node.op) {
          case "eq":
            return left === right;
          case "neq":
            return left !== right;
          case "lt":
            return left < right;
          case "lte":
            return left <= right;
          case "gt":
            return left > right;
          case "gte":
            return left >= right;
          default:
            throw new RuleRuntimeError("INVALID_NODE", "unknown compare op");
        }
      }
      case "count_at_least":
        return evalArray(node.of, input, budget).length >= node.value;
      case "all_equal_ordered": {
        const left = evalArray(node.left, input, budget);
        const right = evalArray(node.right, input, budget);
        return (
          left.length === right.length &&
          left.every((value, index) => value === right[index])
        );
      }
      case "and":
        return node.clauses.every((clause) =>
          evalPredicate(clause, input, budget),
        );
      case "or":
        return node.clauses.some((clause) =>
          evalPredicate(clause, input, budget),
        );
      case "not":
        return !evalPredicate(node.clause, input, budget);
      default: {
        const _exhaustive: never = node;
        throw new RuleRuntimeError(
          "INVALID_NODE",
          `unknown predicate node ${JSON.stringify(_exhaustive)}`,
        );
      }
    }
  } finally {
    leave(budget);
  }
}

// Legacy v1 grammar (the original 3 kinds). Kept so frozen v1 artifacts execute
// unchanged.
function evaluateLegacy(
  ast: Extract<RuleAst, { schemaVersion: 1 }>,
  input: RuleRuntimeInput,
): boolean {
  if (ast.node.kind === "ordered_exact") {
    return (
      input.guess.length === input.draw.length &&
      input.guess.every((value, index) => value === input.draw[index])
    );
  }
  if (ast.node.kind === "match_count_at_least") {
    const drawSet = new Set(input.draw);
    const matches = input.guess.filter((value) => drawSet.has(value)).length;
    return matches >= (ast.node.value ?? 0);
  }
  if (ast.node.kind === "sum_equals") {
    const sum = (values: readonly number[]) =>
      values.reduce((total, value) => total + value, 0);
    return sum(input.guess) === sum(input.draw);
  }
  return false;
}

/**
 * Evaluate a PREDICATE rule (or any legacy v1 rule) for a single guess.
 * Ranking rules have no per-guess boolean until the turn-level argmax, so this
 * throws for ranking rules — call {@link scoreGuess} + {@link resolveRankingWinners}.
 */
export function evaluatePredicate(
  ast: RuleAst,
  input: RuleRuntimeInput,
): PredicateEvaluation {
  const budget: Budget = { ops: 0, depth: 0 };
  if (ast.schemaVersion === 1) {
    const win = evaluateLegacy(ast, input);
    return {
      result: win ? "WIN" : "LOSE",
      runtimeSteps: budget.ops,
      matchedRuleBranch: `legacy:${ast.node.kind}`,
    };
  }
  if (ast.result.type !== "predicate") {
    throw new RuleRuntimeError(
      "NOT_A_RANKING_RULE",
      "evaluatePredicate called on a ranking rule",
    );
  }
  const win = evalPredicate(ast.result.predicate, input, budget);
  return {
    result: win ? "WIN" : "LOSE",
    runtimeSteps: budget.ops,
    matchedRuleBranch: `predicate:${ast.result.predicate.kind}`,
  };
}

/**
 * Compute the per-guess numeric score for a RANKING rule. Deterministic and
 * independent of other players; the comparative step is {@link resolveRankingWinners}.
 */
export function scoreGuess(ast: RuleAst, input: RuleRuntimeInput): number {
  if (ast.schemaVersion !== 2 || ast.result.type !== "ranking") {
    throw new RuleRuntimeError(
      "NOT_A_RANKING_RULE",
      "scoreGuess requires a v2 ranking rule",
    );
  }
  const budget: Budget = { ops: 0, depth: 0 };
  return evalScalar(ast.result.score, input, budget);
}

export interface RankingEntry<T = string> {
  player: T;
  score: number;
}

/**
 * Pure argmax (or argmin) over the frozen set of scored guesses. Returns every
 * player tied at the winning score (ties share the pool).
 */
export function resolveRankingWinners<T>(
  scores: readonly RankingEntry<T>[],
  direction: "max" | "min",
): Set<T> {
  const finite = scores.filter((entry) => Number.isFinite(entry.score));
  if (finite.length === 0) return new Set<T>();
  const best = finite.reduce(
    (acc, entry) =>
      direction === "max"
        ? Math.max(acc, entry.score)
        : Math.min(acc, entry.score),
    direction === "max" ? -Infinity : Infinity,
  );
  return new Set(
    finite.filter((entry) => entry.score === best).map((entry) => entry.player),
  );
}

/**
 * Back-compat boolean entry point used by existing callers and the legacy 3-kind
 * grammar. For ranking rules it throws (no per-guess boolean exists).
 */
export function evaluateRule(ast: RuleAst, input: RuleRuntimeInput): boolean {
  return evaluatePredicate(ast, input).result === "WIN";
}
