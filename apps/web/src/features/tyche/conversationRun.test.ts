import assert from "node:assert/strict";
import { test } from "node:test";

import { getConversationRun, getLatestConversationRun } from "./conversationRunStore.js";
import {
  isConversationDraftSaveError,
  isConversationRunActive,
  startConversationRun,
  type ConversationRunDeps,
} from "./conversationRun.js";

test("conversation run continues while no screen is subscribed", async () => {
  const draftId = "client:87:background-run";
  let resolvePreflight!: () => void;
  const preflightStarted = new Promise<void>((resolve) => {
    resolvePreflight = resolve;
  });
  const deps: ConversationRunDeps = {
    describeError: (cause) => cause instanceof Error ? cause.message : String(cause),
    postDraft: async (_wallet, body) => ({ draft: { draftId: body.draftId ?? draftId } }),
    postPreflight: async (_text, onProgress) => {
      onProgress?.({
        message: "Interpreting your winning condition...",
        stage: "interpreting",
      });
      await preflightStarted;
      return {
        preflight: {
          dealerMessage: "Done! I compiled your rule.",
          decision: "VALID",
          needsClarification: false,
          normalizedText: "Win if exactly 2 numbers match.",
          officialInterpretation: "The player wins when exactly two guessed numbers appear in the draw.",
          ruleId: 8701,
          sanitizedText: "Win if exactly 2 numbers match.",
          tokenCount: 7,
        },
      };
    },
    postInterpretation: async () => ({
      interpretation: {
        addedOperationalClauses: [],
        clarityNote: "",
        dealerMessage: "I understand the rule.",
        englishText: "Win if exactly 2 numbers match.",
        guardianChecked: false,
        needsClarification: false,
        normalizedText: "Win if exactly 2 numbers match.",
        officialInterpretation: "The player wins when exactly two guessed numbers appear in the draw.",
        sanitizedText: "Win if exactly 2 numbers match.",
        suggestedRewrites: [],
        title: "Two Matches",
        tokenCount: 7,
      },
    }),
  };

  const task = startConversationRun({
    draftId,
    initialMessages: [{ text: "Win if exactly 2 numbers match.", who: "user" }],
    lastUserMessage: "Win if exactly 2 numbers match.",
    localDealerReply: null,
    phase: "compile",
    refinedDraft: null,
    ruleText: "Win if exactly 2 numbers match.",
    turnId: 87,
    wallet: null,
  }, deps);

  assert.equal(isConversationRunActive(draftId), true);
  assert.equal(getLatestConversationRun(null, 87)?.status, "pending");

  await Promise.resolve();
  assert.equal(getConversationRun(draftId)?.progress?.stage, "interpreting");

  resolvePreflight();
  await task;

  const run = getConversationRun(draftId);
  assert.equal(isConversationRunActive(draftId), false);
  assert.equal(run?.status, "done");
  assert.equal(run?.progress, null);
  assert.equal(run?.messages.at(-1)?.text, "Done! I compiled your rule.");
  assert.equal(run?.rule?.ruleId, 8701);
});

test("interpretation is shown before compilation and keeps clarification detection", async () => {
  const draftId = "client:88:interpret-first";
  let compiled = false;
  const deps: ConversationRunDeps = {
    describeError: (cause) => cause instanceof Error ? cause.message : String(cause),
    postDraft: async (_wallet, body) => ({ draft: { draftId: body.draftId ?? draftId } }),
    postInterpretation: async () => ({
      interpretation: {
        addedOperationalClauses: [],
        clarityNote: "The digit place is not specified.",
        dealerMessage: "Do you mean tens digits or units digits?",
        englishText: "Win by matching a digit.",
        guardianChecked: false,
        needsClarification: true,
        normalizedText: "Win by matching a digit.",
        officialInterpretation: "The requested digit comparison is ambiguous.",
        sanitizedText: "Win by matching a digit.",
        suggestedRewrites: ["Win if a guessed tens digit matches a drawn tens digit."],
        title: "Digit Match",
        tokenCount: 6,
      },
    }),
    postPreflight: async () => {
      compiled = true;
      throw new Error("Compilation should wait for confirmation.");
    },
  };

  await startConversationRun({
    draftId,
    initialMessages: [{ text: "Win by matching a digit.", who: "user" }],
    lastUserMessage: "Win by matching a digit.",
    localDealerReply: null,
    phase: "interpret",
    refinedDraft: null,
    ruleText: "Win by matching a digit.",
    turnId: 88,
    wallet: null,
  }, deps);

  const run = getConversationRun(draftId);
  assert.equal(compiled, false);
  assert.equal(run?.rule, null);
  assert.equal(run?.interpretation?.needsClarification, true);
  assert.match(run?.messages.at(-1)?.text ?? "", /tens digits or units digits/i);
});

test("draft-save failures are eligible for an explicit retry", () => {
  assert.equal(isConversationDraftSaveError("Dealer replied, but the draft could not be saved. POST returned HTTP 502."), true);
  assert.equal(isConversationDraftSaveError("Draft still could not be saved. POST returned HTTP 502."), true);
  assert.equal(isConversationDraftSaveError("Dealer engine unavailable."), false);
  assert.equal(isConversationDraftSaveError(null), false);
});
