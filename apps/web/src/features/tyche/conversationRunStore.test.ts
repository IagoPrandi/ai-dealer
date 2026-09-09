import assert from "node:assert/strict";
import { test } from "node:test";

import {
  deleteConversationRun,
  forgetLatestConversationRun,
  getConversationRun,
  getLatestConversationRun,
  patchConversationRun,
  patchConversationRunJob,
  rememberLatestConversationRun,
  subscribeConversationRun,
  subscribeConversationRuns,
  upsertConversationRun,
} from "./conversationRunStore.js";

function snapshot(
  draftId: string,
  status: "done" | "pending" = "done",
) {
  return {
    connection: "closed" as const,
    draftId,
    error: null,
    interpretation: null,
    job: null,
    messages: [],
    progress: null,
    rule: null,
    status,
  };
}

test("conversation run subscribers reattach to pending progress and completion", () => {
  const draftId = "client:85:test-run";
  upsertConversationRun({
    connection: "closed",
    draftId,
    error: null,
    interpretation: null,
    job: null,
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
    connection: "closed",
    draftId,
    error: null,
    interpretation: null,
    job: null,
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

test("the job cursor is merged into the snapshot without losing the job", () => {
  const draftId = "client:97:cursor";
  upsertConversationRun({
    connection: "live",
    draftId,
    error: null,
    interpretation: null,
    job: {
      cursor: null,
      jobId: "job-97",
      phase: "interpret",
      ruleText: "Win if exactly 2 numbers match.",
      startedAt: 1,
      turnId: 97,
    },
    messages: [],
    progress: null,
    rule: null,
    status: "pending",
  });

  patchConversationRunJob(draftId, { cursor: "5" });

  const run = getConversationRun(draftId);
  assert.equal(run?.job?.cursor, "5");
  assert.equal(run?.job?.jobId, "job-97");
  assert.equal(run?.connection, "live");
});

test("patching a job is a no-op when there is no run or no job", () => {
  const draftId = "client:98:no-job";
  upsertConversationRun({
    connection: "closed",
    draftId,
    error: null,
    interpretation: null,
    job: null,
    messages: [],
    progress: null,
    rule: null,
    status: "done",
  });

  patchConversationRunJob(draftId, { cursor: "5" });
  patchConversationRunJob("client:98:unknown", { cursor: "5" });
  patchConversationRunJob(null, { cursor: "5" });

  assert.equal(getConversationRun(draftId)?.job, null);
});

test("deleting a run clears only pointers that still reference it", () => {
  const deletedDraftId = "client:99:delete";
  const pendingDraftId = "client:100:still-pending";
  upsertConversationRun(snapshot(deletedDraftId, "pending"));
  upsertConversationRun(snapshot(pendingDraftId, "pending"));
  rememberLatestConversationRun({
    draftId: deletedDraftId,
    turnId: 99,
    wallet: null,
  });
  rememberLatestConversationRun({
    draftId: pendingDraftId,
    turnId: 100,
    wallet: null,
  });

  deleteConversationRun(deletedDraftId);

  assert.equal(getConversationRun(deletedDraftId), null);
  assert.equal(getLatestConversationRun(null, 99), null);
  assert.equal(getLatestConversationRun(null, 100)?.draftId, pendingDraftId);
  assert.equal(getConversationRun(pendingDraftId)?.status, "pending");
});

test("the run store cap removes the oldest non-pending snapshot", () => {
  for (let index = 0; index < 21; index += 1) {
    upsertConversationRun(snapshot(`client:101:cap-${index}`));
  }

  assert.equal(getConversationRun("client:101:cap-0"), null);
  assert.equal(getConversationRun("client:101:cap-20")?.status, "done");
});

test("global subscribers see every run, whichever draft it belongs to", () => {
  const seen: string[] = [];
  const unsubscribe = subscribeConversationRuns((run) => {
    seen.push(`${run.draftId}:${run.status}`);
  });

  upsertConversationRun(snapshot("client:90:global-a", "pending"));
  upsertConversationRun(snapshot("client:90:global-b", "pending"));
  patchConversationRun("client:90:global-a", { status: "done" });
  unsubscribe();
  patchConversationRun("client:90:global-b", { status: "done" });

  assert.deepEqual(seen, [
    "client:90:global-a:pending",
    "client:90:global-b:pending",
    "client:90:global-a:done",
  ]);

  deleteConversationRun("client:90:global-a");
  deleteConversationRun("client:90:global-b");
});
