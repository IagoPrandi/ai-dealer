import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PROMPTS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "prompts");

// Bumped when the prompt body changes. The `tyche_` prefix is the internal
// codename and stays; the persona the player sees is the commercial name.
export const DEALER_INTERPRET_PROMPT_VERSION = "tyche_rule_interpret_prompt_v5";
// v10: a social turn ("tudo bem?", "obrigado") is answered as one, and
// `proposedRuleText` stays null until the player has actually expressed a
// winning condition. Measured before the change: a bare greeting produced an
// invented rule and its submit panel in 3 of 16 runs, and the answer skipped the
// greeting entirely.
// v11: a win rate of 0 that the bounded sample could not resolve is reported as
// "rarer than the check can measure", with the upper bound, instead of as a
// measured zero. Quoting the 0 told a player their accepted rule could never be
// won, contradicting the verdict shown beside it.
export const DEALER_CHAT_PROMPT_VERSION = "tyche_rule_dealer_chat_prompt_v11";

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
