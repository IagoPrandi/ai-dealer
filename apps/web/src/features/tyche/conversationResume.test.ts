import assert from "node:assert/strict";
import { test } from "node:test";

import { resolveCreateIntent } from "./context.js";
import {
  buildResumeTranscript,
  resolveReattachableJob,
} from "./conversationResume.js";
import type { ConversationDraftApi } from "./data/types.js";
import type { PersistedPreflightJob } from "./preflightJobStore.js";

const JOB_ID = "job-running";
const OTHER_JOB_ID = "job-from-an-earlier-run";

function draft(
  overrides: Partial<ConversationDraftApi> = {},
): ConversationDraftApi {
  return {
    createdAt: "2026-08-07T23:30:00.000Z",
    draftId: "client:42:reopened",
    lastMessage: "Win if at least 4 of your numbers appear in the draw.",
    messages: [
      { text: "how to play?", who: "user" },
      { text: "A valid rule can only use the guess and the draw.", who: "ai" },
      { text: "Win if at least 4 of your numbers appear in the draw.", who: "user" },
    ],
    normalizedText: null,
    officialInterpretation: null,
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    ruleId: null,
    status: "draft",
    tokenCount: 13,
    turnId: 42,
    updatedAt: "2026-08-07T23:36:44.000Z",
    wallet: "7E3DMct5umGMA4mSeAr1UcJUFSd5kd444rK39G8GTC9p",
    ...overrides,
  };
}

function pointer(
  overrides: Partial<PersistedPreflightJob> = {},
): PersistedPreflightJob {
  return {
    cursor: "4",
    draftId: "client:42:reopened",
    jobId: JOB_ID,
    phase: "compile",
    ruleText: "Win if at least 4 of your numbers appear in the draw.",
    startedAt: 1_000,
    turnId: 42,
    wallet: "7E3DMct5umGMA4mSeAr1UcJUFSd5kd444rK39G8GTC9p",
    ...overrides,
  };
}

test("a navigation's intent never inherits an earlier one", () => {
  // The regression this replaces: `newConversationKey` only counted up, so once
  // a page session had opened one blank chat, every later "reopen this
  // conversation" was treated as new and the reattach was skipped for good.
  assert.equal(resolveCreateIntent({ newConversation: true }), "new");
  assert.equal(
    resolveCreateIntent({ chatId: "client:42:reopened", seed: "Win if..." }),
    "resume",
  );
  assert.equal(resolveCreateIntent({ seed: "Win if..." }), "seed");
  // A direct load of /play/propose goes through no navigation at all, and must
  // stay eligible to reattach.
  assert.equal(resolveCreateIntent(), null);
  assert.equal(resolveCreateIntent({}), null);
});

test("the draft's pointer wins, because it survives a reload in another browser", () => {
  const job = resolveReattachableJob(draft({ preflightJobId: JOB_ID }), null);

  assert.equal(job?.jobId, JOB_ID);
  assert.equal(job?.ruleText, draft().prompt);
  assert.equal(job?.stampedAt, Date.parse(draft().updatedAt));
  // No local pointer means no replay position: a full replay is always safe,
  // an invented cursor is not.
  assert.equal(job?.cursor, null);
});

test("a cursor is never carried across to a different job id", () => {
  // Cursors are per-job sequence numbers. Reusing a stale one against the job
  // the draft names would make the reader skip that job's first events - and
  // its result is exactly what a reopened conversation came back for.
  const job = resolveReattachableJob(
    draft({ preflightJobId: JOB_ID }),
    pointer({ cursor: "9", jobId: OTHER_JOB_ID }),
  );

  assert.equal(job?.jobId, JOB_ID);
  assert.equal(job?.cursor, null);

  const matched = resolveReattachableJob(
    draft({ preflightJobId: JOB_ID }),
    pointer({ cursor: "9", jobId: JOB_ID }),
  );
  assert.equal(matched?.cursor, "9");
  assert.equal(matched?.phase, "compile");
});

test("an anonymous run still reattaches from the local pointer alone", () => {
  const job = resolveReattachableJob(undefined, pointer());

  assert.equal(job?.jobId, JOB_ID);
  assert.equal(job?.cursor, "4");
  assert.equal(job?.phase, "compile");
  assert.equal(job?.stampedAt, 1_000);
});

test("a draft with nothing in flight is not something to reattach to", () => {
  assert.equal(resolveReattachableJob(draft(), null), null);
  assert.equal(resolveReattachableJob(undefined, null), null);
  assert.equal(resolveReattachableJob(draft({ preflightJobId: null }), null), null);
});

test("a resumed conversation opens with the whole saved transcript", () => {
  // Resuming used to replay only the rule text, so every run that outlived its
  // page came back as a one-bubble chat.
  assert.deepEqual(buildResumeTranscript(draft(), pointer()), draft().messages);
});

test("a draft older than transcript persistence still reads as a conversation", () => {
  const legacy = draft({ lastMessage: "Here is how I read it." });
  delete legacy.messages;

  assert.deepEqual(buildResumeTranscript(legacy, null), [
    { text: draft().prompt, who: "user" },
    { text: "Here is how I read it.", who: "ai" },
  ]);
});

test("with no draft to read, the pointer's single message is the transcript", () => {
  assert.deepEqual(buildResumeTranscript(undefined, pointer()), [
    { text: pointer().ruleText, who: "user" },
  ]);
  assert.deepEqual(buildResumeTranscript(undefined, null), []);
});
