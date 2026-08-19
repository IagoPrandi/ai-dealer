import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "prompts");

// Bumped when the prompt body changes. The `tyche_` prefix is the internal
// codename and stays; the persona the player sees is the commercial name.
export const DEALER_INTERPRET_PROMPT_VERSION = "tyche_rule_interpret_prompt_v4";
export const DEALER_CHAT_PROMPT_VERSION = "tyche_rule_dealer_chat_prompt_v8";

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
  // `output-contract.md` is deliberately LAST, after the reference sections.
  // The references are bulky prose; with reasoning disabled (the Ollama
  // `reasoning_effort: "none"` path) a JSON contract buried above them stops
  // being honoured and the model answers in plain prose, which fails
  // `coerceDealerQuestionAnswer` as RULE_AGENT_BAD_RESPONSE. Same positional
  // lesson as the player question in `buildDealerQuestionContext`: whatever
  // must win has to be read last.
  dealerChatPrompt ??= buildPrompt("dealer-chat/SKILL.md", [
    "dealer-chat/references/game-mechanics.md",
    "dealer-chat/references/rules-and-limits.md",
    "dealer-chat/references/economy.md",
    "dealer-chat/output-contract.md",
  ]);
  return dealerChatPrompt;
}
