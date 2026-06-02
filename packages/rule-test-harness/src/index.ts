import type { RuleAst } from "@idealer/rule-schema";
import { evaluateRule } from "@idealer/rule-runtime";

export function runSmokeRuleTest(ast: RuleAst): boolean {
  return evaluateRule(ast, {
    guess: [1, 2, 3, 4, 5, 6],
    draw: [1, 2, 3, 4, 7, 8]
  });
}
