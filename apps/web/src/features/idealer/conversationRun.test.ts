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
    postPreflight: async () => {
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
  };

  const task = startConversationRun({
    draftId,
    initialMessages: [{ text: "Win if exactly 2 numbers match.", who: "user" }],
    lastUserMessage: "Win if exactly 2 numbers match.",
    localDealerReply: null,
    refinedDraft: null,
    ruleText: "Win if exactly 2 numbers match.",
    turnId: 87,
    wallet: null,
  }, deps);

  assert.equal(isConversationRunActive(draftId), true);
  assert.equal(getLatestConversationRun(null, 87)?.status, "pending");

  resolvePreflight();
  await task;

  const run = getConversationRun(draftId);
  assert.equal(isConversationRunActive(draftId), false);
  assert.equal(run?.status, "done");
  assert.equal(run?.messages.at(-1)?.text, "Done! I compiled your rule.");
  assert.equal(run?.rule?.ruleId, 8701);
});

test("draft-save failures are eligible for an explicit retry", () => {
  assert.equal(isConversationDraftSaveError("Dealer replied, but the draft could not be saved. POST returned HTTP 502."), true);
  assert.equal(isConversationDraftSaveError("Draft still could not be saved. POST returned HTTP 502."), true);
  assert.equal(isConversationDraftSaveError("Dealer engine unavailable."), false);
  assert.equal(isConversationDraftSaveError(null), false);
});
