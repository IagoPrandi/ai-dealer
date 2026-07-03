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
  version: "idealer_rule_compiler_skill_v5",
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
