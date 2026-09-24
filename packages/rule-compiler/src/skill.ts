import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// The `compile_rule_to_ast` agent skill (PRD §7.10, §7.12).
//
// This is a RUNTIME asset of the LLM rule-compilation harness — not a developer
// tool. The authoritative content lives in the sibling `rule-authoring/` skill
// folder (authored with the skill-creator format: SKILL.md + references), so the
// grammar knowledge and the DSL schema evolve together and the exact guidance
// used to compile a rule can be frozen into the artifact (PRD §6.10 / §7.13).
// The transport layer (apps/api/src/llm.ts) sends the assembled prompt to the LLM.

export const RULE_COMPILER_SKILL = {
  name: "compile_rule_to_ast",
  // v19: every semantic AST path carries source-cited provider provenance;
  // deterministic path descriptions remain server-authored audit evidence.
  // v18: eligibility-gated range rankings are an explicit pattern. The match
  // threshold stays in `eligibleWhen`, while `range_span(guess)` is the score;
  // neither may be flattened into a predicate or an inclusive interval count.
  // v17: nearest-neighbour minimax, mutual equality of duplicate-bearing
  // derived sets, and both orientations of the adjacent-gap shifted zip are
  // explicit patterns. Positional zip and intersection cardinality are called
  // out as invalid substitutes for those semantics.
  // v16: bounded procedural removal thresholds are explicitly compiled as
  // predicates over the corresponding order statistic, never as rankings.
  // v15: eligible two-criterion rankings retain `eligibleWhen`, calculate an
  // exact dominance scale, and execute worked examples against the folded score.
  // v14: the full compilation envelope is now schema-constrained at decoding
  // time, including each worked-example ticket's exact domain/length/uniqueness.
  // v13: worked examples are constrained to the real no-replacement game domain
  // (exactly six distinct integers 1..100). Predicate evidence may be all LOSE
  // when no valid winning input exists; the model must not fabricate an
  // out-of-domain WIN just to satisfy a one-WIN/one-LOSE prompt requirement.
  // v12: the ordered-criteria fold (patterns.md 2c) — "A decides it, otherwise
  // B" is ONE ranking whose primary term is scaled above the secondary's
  // maximum, so a fallback clause is compiled rather than silently dropped.
  // v11: the negated-unordered-set idiom (`not(or(contains ...))`) and the
  // explicit clause budget, so a rule naming a set on BOTH sides groups each
  // side instead of flattening every value into the top-level `and`.
  // v10: ordered literal prefixes with an explicitly unconstrained remainder,
  // on top of v9's full literal sequences, sets, and their negation.
  version: "tyche_rule_compiler_skill_v19",
  allowedInputs: ["guess", "draw"] as const,
} as const;

export const RULE_COMPILER_SKILL_VERSION = RULE_COMPILER_SKILL.version;

// Resolves to packages/rule-compiler/rule-authoring from both the TypeScript
// source (src/skill.ts) and the compiled output (dist/skill.js) — both sit one
// level under the package root.
const SKILL_DIR = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../rule-authoring",
);

function readSkillFile(relativePath: string): string {
  // No silent fallback: if the skill content is missing, fail loudly so the
  // deployment is fixed rather than compiling rules with degraded guidance.
  return readFileSync(resolve(SKILL_DIR, relativePath), "utf8");
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
}

let cachedPrompt: string | null = null;

// Assembles the full compile system prompt from the skill folder. The runtime
// LLM gets a single one-shot prompt, so SKILL.md + its references are
// concatenated (progressive disclosure is for human maintainability and for
// agents that navigate files; the inference call needs the content inline).
export function buildRuleCompilerSkillPrompt(): string {
  if (cachedPrompt !== null) {
    return cachedPrompt;
  }
  const skill = stripFrontmatter(readSkillFile("SKILL.md"));
  const patterns = readSkillFile("references/patterns.md");
  const examples = readSkillFile("references/examples.md");
  cachedPrompt = [skill, patterns, examples].join("\n\n");
  return cachedPrompt;
}
