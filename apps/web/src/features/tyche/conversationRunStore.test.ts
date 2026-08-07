import assert from "node:assert/strict";
import { test } from "node:test";

import {
  forgetLatestConversationRun,
  getConversationRun,
  getLatestConversationRun,
  patchConversationRun,
  rememberLatestConversationRun,
  subscribeConversationRun,
  upsertConversationRun,
} from "./conversationRunStore.js";

test("conversation run subscribers reattach to pending progress and completion", () => {
  const draftId = "client:85:test-run";
  upsertConversationRun({
    draftId,
    error: null,
    interpretation: null,
    messages: [{ text: "Win if exactly 2 numbers match.", who: "user" }],
    progress: null,
    rule: null,
    status: "pending",
  });

  const snapshots: string[] = [];
  const unsubscribe = subscribeConversationRun(draftId, (snapshot) => {
    snapshots.push(`${snapshot.status}:${snapshot.messages.length}`);
  });

  patchConversationRun(draftId, {
    messages: [
      { text: "Win if exactly 2 numbers match.", who: "user" },
      { text: "Done! I compiled your rule.", who: "ai" },
    ],
    status: "done",
  });
  unsubscribe();

  assert.deepEqual(snapshots, ["pending:1", "done:2"]);
  assert.equal(getConversationRun(draftId)?.status, "done");
});

test("conversation run can be reattached by wallet and turn", () => {
  const draftId = "client:86:reattach-run";
  const wallet = "EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW";
  upsertConversationRun({
    draftId,
    error: null,
    interpretation: null,
    messages: [{ text: "Win if the first number matches.", who: "user" }],
    progress: null,
    rule: null,
    status: "pending",
  });
  rememberLatestConversationRun({
    draftId,
    turnId: 86,
    wallet,
  });

  const latest = getLatestConversationRun(wallet.toLowerCase(), 86);

  assert.equal(latest?.draftId, draftId);
  assert.equal(latest?.status, "pending");

  forgetLatestConversationRun({
    draftId,
    turnId: 86,
    wallet,
  });
  assert.equal(getLatestConversationRun(wallet, 86), null);
});
