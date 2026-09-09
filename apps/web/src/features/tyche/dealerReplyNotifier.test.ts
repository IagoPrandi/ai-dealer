import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deleteConversationRun,
  patchConversationRun,
  upsertConversationRun,
  type ConversationRunSnapshot,
} from "./conversationRunStore.js";
import { DEALER_NOTIFY_STORAGE_KEY } from "./dealerNotify.js";
import type { DealerNotifyDeps } from "./dealerNotify.js";
import { startDealerReplyNotifier } from "./dealerReplyNotifier.js";

function notifyHarness() {
  const shown: { body: string; title: string }[] = [];
  const deps: DealerNotifyDeps = {
    isHidden: () => true,
    permission: () => "granted",
    readStorage: () =>
      ({
        getItem: (key: string) =>
          key === DEALER_NOTIFY_STORAGE_KEY ? "on" : null,
        setItem: () => undefined,
      }) as unknown as Storage,
    requestPermission: async () => "granted",
    showNotification: async (title, options) => {
      shown.push({ body: options.body, title });
    },
    supported: () => true,
  };
  return { deps, shown };
}

function pending(draftId: string): ConversationRunSnapshot {
  return {
    connection: "live",
    draftId,
    error: null,
    interpretation: null,
    job: null,
    messages: [{ text: "Win if exactly 2 numbers match.", who: "user" }],
    progress: null,
    rule: null,
    status: "pending",
  };
}

test("a finished run notifies once with the dealer's last message", async () => {
  const draftId = "client:91:notify-done";
  const { deps, shown } = notifyHarness();
  const stop = startDealerReplyNotifier(deps);

  upsertConversationRun(pending(draftId));
  patchConversationRun(draftId, {
    messages: [
      { text: "Win if exactly 2 numbers match.", who: "user" },
      { text: "Compiled. Your rule pays on exactly 2 hits.", who: "ai" },
    ],
    status: "done",
  });
  // The draft save patches the same terminal snapshot again.
  patchConversationRun(draftId, { error: null });
  await Promise.resolve();

  assert.deepEqual(shown, [
    {
      body: "Compiled. Your rule pays on exactly 2 hits.",
      title: "The dealer replied",
    },
  ]);

  stop();
  deleteConversationRun(draftId);
});

test("a failed run is announced with its error", async () => {
  const draftId = "client:91:notify-error";
  const { deps, shown } = notifyHarness();
  const stop = startDealerReplyNotifier(deps);

  upsertConversationRun(pending(draftId));
  patchConversationRun(draftId, {
    error: "The dealer is unavailable right now.",
    status: "error",
  });
  await Promise.resolve();

  assert.deepEqual(shown, [
    {
      body: "The dealer is unavailable right now.",
      title: "The dealer could not finish",
    },
  ]);

  stop();
  deleteConversationRun(draftId);
});

test("a lost connection or an expired run is not announced as a reply", async () => {
  const draftId = "client:91:notify-dropped";
  const { deps, shown } = notifyHarness();
  const stop = startDealerReplyNotifier(deps);

  upsertConversationRun(pending(draftId));
  patchConversationRun(draftId, { status: "disconnected" });
  patchConversationRun(draftId, { status: "pending" });
  patchConversationRun(draftId, { status: "expired" });
  await Promise.resolve();

  assert.deepEqual(shown, []);

  stop();
  deleteConversationRun(draftId);
});

test("streaming deltas do not fire a banner before the answer lands", async () => {
  const draftId = "client:91:notify-stream";
  const { deps, shown } = notifyHarness();
  const stop = startDealerReplyNotifier(deps);

  upsertConversationRun(pending(draftId));
  patchConversationRun(draftId, {
    messages: [
      { text: "Win if exactly 2 numbers match.", who: "user" },
      { text: "Compi", who: "ai" },
    ],
    status: "pending",
    streaming: true,
  });
  await Promise.resolve();
  assert.deepEqual(shown, []);

  patchConversationRun(draftId, {
    messages: [
      { text: "Win if exactly 2 numbers match.", who: "user" },
      { text: "Compiled.", who: "ai" },
    ],
    status: "done",
    streaming: false,
  });
  await Promise.resolve();
  assert.equal(shown.length, 1);

  stop();
  deleteConversationRun(draftId);
});

test("stopping the notifier detaches it from the store", async () => {
  const draftId = "client:91:notify-stopped";
  const { deps, shown } = notifyHarness();
  const stop = startDealerReplyNotifier(deps);

  upsertConversationRun(pending(draftId));
  stop();
  patchConversationRun(draftId, {
    messages: [{ text: "Compiled.", who: "ai" }],
    status: "done",
  });
  await Promise.resolve();

  assert.deepEqual(shown, []);
  deleteConversationRun(draftId);
});
