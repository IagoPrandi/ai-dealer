"use client";

/**
 * Bridges conversation runs to the opt-in reply notification.
 *
 * It listens on the store rather than inside the chat screen on purpose: the
 * player who most needs telling is the one who navigated away — or closed the
 * tab's view of it — while the dealer was still writing, and `CreateScreen`
 * is unmounted by then. The store outlives every screen, so this is the only
 * layer that sees the run finish in that case.
 */

import type { ConversationRunSnapshot } from "./conversationRunStore";
import { subscribeConversationRuns } from "./conversationRunStore";
import {
  browserDealerNotifyDeps,
  notifyDealerReply,
  type DealerNotifyDeps,
} from "./dealerNotify";

/** Mirrors the store's own cap so the status map cannot outgrow it. */
const MAX_TRACKED_RUNS = 20;

function lastDealerMessage(snapshot: ConversationRunSnapshot) {
  for (let index = snapshot.messages.length - 1; index >= 0; index -= 1) {
    const message = snapshot.messages[index];
    if (message?.who === "ai") {
      return message.text;
    }
  }
  return "";
}

/**
 * `disconnected` and `expired` are deliberately not notified: the run is not
 * over, it is waiting for the player to reconnect or rerun it, and a banner
 * announcing a reply that does not exist would be a lie.
 */
function notificationFor(snapshot: ConversationRunSnapshot) {
  if (snapshot.status === "done") {
    return { body: lastDealerMessage(snapshot), failed: false };
  }
  if (snapshot.status === "error") {
    return { body: snapshot.error ?? "", failed: true };
  }
  return null;
}

export function startDealerReplyNotifier(
  deps: DealerNotifyDeps = browserDealerNotifyDeps,
  onError: (cause: unknown) => void = (cause) => {
    console.error("[dealer-notify] Could not raise the reply banner.", cause);
  },
) {
  const lastStatus = new Map<string, ConversationRunSnapshot["status"]>();

  return subscribeConversationRuns((snapshot) => {
    const previous = lastStatus.get(snapshot.draftId);
    // Refresh insertion order so the cap drops the least recently updated run.
    lastStatus.delete(snapshot.draftId);
    lastStatus.set(snapshot.draftId, snapshot.status);
    while (lastStatus.size > MAX_TRACKED_RUNS) {
      lastStatus.delete(lastStatus.keys().next().value as string);
    }

    // Only the pending → terminal edge is a reply. Terminal snapshots are
    // patched again while the draft is saved, and re-notifying on those would
    // fire the banner twice for one answer.
    if (previous !== "pending") {
      return;
    }
    const notification = notificationFor(snapshot);
    if (!notification) {
      return;
    }
    void notifyDealerReply(deps, {
      body: notification.body,
      draftId: snapshot.draftId,
      failed: notification.failed,
    }).catch(onError);
  });
}
