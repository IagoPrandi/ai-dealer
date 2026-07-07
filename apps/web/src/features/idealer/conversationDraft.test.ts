import assert from "node:assert/strict";
import { test } from "node:test";

import { buildConversationDraftBody } from "./conversationDraft.js";

const wallet = "GZRY3NG9xUxkzF9Z9z4N5Q7A9k7X8vB2c5E9F3Q7tHe";

test("builds a valid pending conversation draft before the dealer replies", () => {
  const body = buildConversationDraftBody({
    lastMessage: "Win if exactly 2 guessed numbers match\nin the same position.",
    messages: [
      {
        text: "Win if exactly 2 guessed numbers match\nin the same position.",
        who: "user",
      },
    ],
    prompt: "Win if exactly 2 guessed numbers match\nin the same position.",
    turnId: 85,
    wallet,
  });

  assert.ok(body);
  assert.equal(
    body.prompt,
    "Win if exactly 2 guessed numbers match in the same position.",
  );
  assert.equal(body.lastMessage.includes("\n"), true);
  assert.equal(body.messages?.length, 1);
  assert.equal(body.ruleId, null);
  assert.equal(body.status, "draft");
  assert.equal(body.tokenCount, 12);
});

test("returns null for an empty pending draft prompt", () => {
  assert.equal(
    buildConversationDraftBody({
      lastMessage: "",
      messages: [],
      prompt: " \n\t ",
      turnId: 85,
      wallet,
    }),
    null,
  );
});
