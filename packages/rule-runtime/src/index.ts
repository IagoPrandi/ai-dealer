import type { RuleAst } from "@idealer/rule-schema";

export interface RuleRuntimeInput {
  guess: readonly number[];
  draw: readonly number[];
}

export function evaluateRule(ast: RuleAst, input: RuleRuntimeInput): boolean {
  if (ast.node.kind === "ordered_exact") {
    return input.guess.every((value, index) => value === input.draw[index]);
  }

  if (ast.node.kind === "match_count_at_least") {
    const drawSet = new Set(input.draw);
    const matches = input.guess.filter((value) => drawSet.has(value)).length;
    return matches >= (ast.node.value ?? 0);
  }

  if (ast.node.kind === "sum_equals") {
    const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0);
    return sum(input.guess) === sum(input.draw);
  }

  return false;
}
