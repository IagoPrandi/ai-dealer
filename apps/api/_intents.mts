import {
  compileRuleArtifact,
  evaluatePredicate,
  isRankingRule,
  resolveRankingWinners,
  scoreGuess,
  type RuleAstProvider,
} from "@idealer/rule-compiler";
import { compileRuleToAst, interpretRuleWithAgent, resolveRuleAgentConfig } from "./src/llm.js";

const config = resolveRuleAgentConfig();
const astProvider: RuleAstProvider = async ({ normalizedText }) =>
  compileRuleToAst(normalizedText, config);

// A small field of guesses + a fixed draw to demonstrate the rule's behaviour.
const draw = [3, 12, 27, 40, 58, 60]; // tens digits {0,1,2,4,5,6}, units {3,2,7,0,8,0}
const field = [
  { player: "P1_5hits", guess: [3, 12, 27, 40, 58, 99] }, // 5 exact matches
  { player: "P2_2hits", guess: [3, 12, 7, 8, 9, 11] }, // 2 exact matches
  { player: "P3_0hits", guess: [1, 2, 4, 5, 6, 7] }, // 0 exact matches
];

const intents = (process.argv[2] ?? "").split("|").filter(Boolean);

for (const text of intents) {
  console.log("\n##################################################");
  console.log("INTENT:", text);
  try {
    const interp = await interpretRuleWithAgent(text);
    console.log("normalized:", interp.normalizedText);
    if (interp.needsClarification) {
      console.log("=> NEEDS CLARIFICATION:", interp.clarityNote);
      continue;
    }
    const r = await compileRuleArtifact(
      { model: config.model, prompt: interp.normalizedText, tokenCount: 40 },
      { astProvider },
    );
    console.log("decision:", r.decision, "| mode:", r.artifact?.ruleMode ?? "-", "| diff:", r.log.difficultyClass);
    if (!r.artifact) {
      console.log("reasons:", r.log.reasonCodes.join(", "));
      continue;
    }
    const ast = r.artifact.ast;
    console.log("AST:", JSON.stringify(ast));
    if (isRankingRule(ast)) {
      const scores = field.map((f) => ({ player: f.player, score: scoreGuess(ast, { guess: f.guess, draw }) }));
      const winners = resolveRankingWinners(scores, ast.schemaVersion === 2 && ast.result.type === "ranking" ? ast.result.direction : "max");
      console.log("scores:", scores.map((s) => `${s.player}=${s.score}`).join(" "));
      console.log("WINNERS:", [...winners].join(", "));
    } else {
      const outcomes = field.map((f) => `${f.player}=${evaluatePredicate(ast, { guess: f.guess, draw }).result}`);
      console.log("outcomes:", outcomes.join(" "));
    }
  } catch (e) {
    console.log("ERROR:", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
  }
}
