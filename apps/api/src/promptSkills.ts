import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "prompts");

export const DEALER_INTERPRET_PROMPT_VERSION = "tyche_rule_interpret_prompt_v1";
export const DEALER_CHAT_PROMPT_VERSION = "tyche_rule_dealer_chat_prompt_v2";

function readPromptFile(relativePath: string): string {
  // Prompt assets are runtime code. A missing file must stop the request rather
  // than quietly reverting to stale or incomplete instructions.
  return readFileSync(resolve(PROMPTS_DIR, relativePath), "utf8");
}

function stripFrontmatter(markdown: string): string {
  return markdown.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/u, "").trim();
}

function buildPrompt(skillPath: string, references: readonly string[]) {
  return [
    stripFrontmatter(readPromptFile(skillPath)),
    ...references.map((reference) => readPromptFile(reference).trim()),
  ].join("\n\n");
}

let dealerInterpretPrompt: string | null = null;
let dealerChatPrompt: string | null = null;

export function buildDealerInterpretPrompt(): string {
  dealerInterpretPrompt ??= buildPrompt("dealer-interpret/SKILL.md", [
    "dealer-interpret/references/semantics.md",
    "dealer-interpret/references/examples.md",
  ]);
  return dealerInterpretPrompt;
}

export function buildDealerChatPrompt(): string {
  dealerChatPrompt ??= buildPrompt("dealer-chat/SKILL.md", []);
  return dealerChatPrompt;
}
