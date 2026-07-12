"use client";

import type { RulePreflightResult } from "../../solana/idealerProgram";
import { buildConversationDraftBody, type ConversationDraftBody } from "./conversationDraft";
import { ApiRequestError, postConversationDraft, postRulePreflight } from "./data/apiClient";
import type { ConversationMessage } from "./data/types";
import { describeTxError } from "./data/tx";
import {
  patchConversationRun,
  rememberLatestConversationRun,
  upsertConversationRun,
} from "./conversationRunStore";

type DraftResponse = {
  draft: {
    draftId: string;
  };
};

type PreflightResponse = {
  preflight: unknown;
};

export interface ConversationRunDeps {
  describeError: (cause: unknown) => string;
  postDraft: (wallet: string, body: ConversationDraftBody) => Promise<DraftResponse>;
  postPreflight: (text: string) => Promise<PreflightResponse>;
}

export interface StartConversationRunArgs {
  draftId: string;
  initialMessages: ConversationMessage[];
  lastUserMessage: string;
  localDealerReply: null | string;
  refinedDraft: null | string;
  ruleText: string;
  turnId: number;
  wallet: null | string | undefined;
}

const defaultDeps: ConversationRunDeps = {
  describeError: describeTxError,
  postDraft: postConversationDraft,
  postPreflight: postRulePreflight,
};

const activeRuns = new Map<string, Promise<void>>();

export function isConversationDraftSaveError(error: null | string) {
  return error?.toLowerCase().includes("could not be saved") ?? false;
}

export async function saveConversationDraftSnapshot({
  deps = defaultDeps,
  draftId,
  lastMessage,
  messages,
  normalizedText,
  officialInterpretation,
  prompt,
  ruleId,
  status,
  turnId,
  wallet,
}: {
  deps?: ConversationRunDeps;
  draftId: null | string;
  lastMessage: string;
  messages: ConversationMessage[];
  normalizedText?: null | string;
  officialInterpretation?: null | string;
  prompt: string;
  ruleId?: null | number;
  status?: "draft" | "submitted";
  turnId: number;
  wallet: null | string | undefined;
}) {
  if (!wallet) {
    return draftId;
  }

  const body = buildConversationDraftBody({
    draftId,
    lastMessage,
    messages,
    prompt,
    turnId,
    wallet,
    ...(normalizedText !== undefined ? { normalizedText } : {}),
    ...(officialInterpretation !== undefined ? { officialInterpretation } : {}),
    ...(ruleId !== undefined ? { ruleId } : {}),
    ...(status !== undefined ? { status } : {}),
  });
  if (!body) {
    return draftId;
  }

  const saved = await deps.postDraft(wallet, body);
  rememberLatestConversationRun({
    draftId: saved.draft.draftId,
    turnId,
    wallet,
  });
  return saved.draft.draftId;
}

export function isConversationRunActive(draftId: string) {
  return activeRuns.has(draftId);
}

export function startConversationRun(
  args: StartConversationRunArgs,
  deps: ConversationRunDeps = defaultDeps,
) {
  const existing = activeRuns.get(args.draftId);
  if (existing) {
    return existing;
  }

  rememberLatestConversationRun({
    draftId: args.draftId,
    turnId: args.turnId,
    wallet: args.wallet,
  });
  upsertConversationRun({
    draftId: args.draftId,
    error: null,
    guidanceContext: null,
    messages: args.initialMessages,
    rule: null,
    status: "pending",
  });

  const task = runConversation(args, deps).finally(() => {
    activeRuns.delete(args.draftId);
  });
  activeRuns.set(args.draftId, task);
  return task;
}

async function runConversation(
  args: StartConversationRunArgs,
  deps: ConversationRunDeps,
) {
  let draftId = args.draftId;
  let transcript = args.initialMessages;

  try {
    try {
      draftId = await saveConversationDraftSnapshot({
        deps,
        draftId,
        lastMessage: args.lastUserMessage,
        messages: transcript,
        prompt: args.ruleText,
        turnId: args.turnId,
        wallet: args.wallet,
      }) ?? draftId;
      patchConversationRun(args.draftId, {
        error: null,
        guidanceContext: null,
        messages: transcript,
        rule: null,
        status: "pending",
      });
    } catch (draftError) {
      patchConversationRun(args.draftId, {
        error: `Your message was sent, but the draft could not be saved. ${deps.describeError(draftError)}`,
        status: "pending",
      });
    }

    if (args.localDealerReply) {
      transcript = [...transcript, { text: args.localDealerReply, who: "ai" }];
      patchConversationRun(args.draftId, {
        error: null,
        guidanceContext: null,
        messages: transcript,
        rule: null,
        status: "done",
      });
      try {
        await saveConversationDraftSnapshot({
          deps,
          draftId,
          lastMessage: args.localDealerReply,
          messages: transcript,
          prompt: args.ruleText,
          turnId: args.turnId,
          wallet: args.wallet,
        });
      } catch (draftError) {
        patchConversationRun(args.draftId, {
          error: `Dealer replied, but the draft could not be saved. ${deps.describeError(draftError)}`,
          status: "error",
        });
      }
      return;
    }

    if (args.refinedDraft) {
      transcript = [
        ...transcript,
        { text: `I applied that to your previous draft: ${args.refinedDraft}`, who: "ai" },
      ];
      patchConversationRun(args.draftId, {
        guidanceContext: null,
        messages: transcript,
        status: "pending",
      });
    }

    const body = await deps.postPreflight(args.ruleText);
    const preflight = body.preflight as RulePreflightResult;
    const valid = preflight.decision === "VALID" && !preflight.needsClarification;
    const dealerMessage =
      preflight.dealerMessage ||
      (valid
        ? "Done! I compiled your rule. Review it - if you like it, submit it to the round."
        : "Almost there! Try describing the win condition in a few clear words.");
    transcript = [...transcript, { text: dealerMessage, who: "ai" }];
    patchConversationRun(args.draftId, {
      error: null,
      guidanceContext: null,
      messages: transcript,
      rule: preflight,
      status: "done",
    });

    try {
      await saveConversationDraftSnapshot({
        deps,
        draftId,
        lastMessage: dealerMessage,
        messages: transcript,
        normalizedText: preflight.normalizedText || null,
        officialInterpretation: preflight.officialInterpretation || null,
        prompt: preflight.sanitizedText,
        ruleId: preflight.ruleId,
        status: "draft",
        turnId: args.turnId,
        wallet: args.wallet,
      });
    } catch (draftError) {
      patchConversationRun(args.draftId, {
        error: `Rule compiled, but the draft could not be saved. ${deps.describeError(draftError)}`,
        status: "error",
      });
    }
  } catch (cause) {
    if (
      cause instanceof ApiRequestError &&
      cause.status < 500 &&
      cause.code !== "invalid_json" &&
      cause.code !== "invalid_rule_text"
    ) {
      const blockedMessage =
        cause.code === "RULE_PROMPT_INJECTION"
          ? "That is blocked because it asks the compiler to ignore or hide the app rules. Choose a clean measurable rule instead."
          : cause.code === "RULE_EXTERNAL_DEPENDENCY"
            ? "That is blocked because it depends on information outside this guess and draw. Choose a rewrite that only compares your guess with the official draw."
            : cause.message;
      patchConversationRun(args.draftId, {
        error: null,
        guidanceContext: {
          apiCode: cause.code,
          reasonSummary: cause.message,
          sanitizedText: args.ruleText,
        },
        messages: [...transcript, { text: blockedMessage, who: "ai" }],
        rule: null,
        status: "done",
      });
      return;
    }

    const message = deps.describeError(cause);
    patchConversationRun(args.draftId, {
      error: message,
      guidanceContext: null,
      messages: [
        ...transcript,
        { text: "Dealer engine unavailable. The compiler must be online before I can lock a rule.", who: "ai" },
      ],
      rule: null,
      status: "error",
    });
  }
}
