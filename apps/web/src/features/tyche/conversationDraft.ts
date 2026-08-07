"use client";

import { countRuleTokens, sanitizeRuleText } from "@tyche/constants";

import type { ConversationDraftApi, ConversationDraftStatus, ConversationMessage } from "./data/types";

export type ConversationDraftBody = Omit<ConversationDraftApi, "createdAt" | "draftId" | "updatedAt"> & {
  createdAt?: string;
  draftId?: string;
  updatedAt?: string;
};

export function buildConversationDraftBody({
  draftId,
  lastMessage,
  messages,
  normalizedText = null,
  officialInterpretation = null,
  preflightJobId,
  prompt,
  ruleId = null,
  status = "draft",
  turnId,
  wallet,
}: {
  draftId?: null | string;
  lastMessage: string;
  messages: ConversationMessage[];
  normalizedText?: null | string;
  officialInterpretation?: null | string;
  preflightJobId?: null | string;
  prompt: string;
  ruleId?: null | number;
  status?: ConversationDraftStatus;
  turnId: number;
  wallet: string;
}): ConversationDraftBody | null {
  const sanitizedPrompt = sanitizeRuleText(prompt);
  const tokenCount = countRuleTokens(sanitizedPrompt);

  if (!sanitizedPrompt || tokenCount <= 0) {
    return null;
  }

  return {
    ...(draftId ? { draftId } : {}),
    lastMessage,
    messages,
    normalizedText,
    officialInterpretation,
    // Omitted entirely when not supplied, so an existing draft keeps whatever
    // job pointer the server already holds.
    ...(preflightJobId !== undefined ? { preflightJobId } : {}),
    prompt: sanitizedPrompt,
    ruleId,
    status,
    tokenCount,
    turnId,
    wallet,
  };
}
