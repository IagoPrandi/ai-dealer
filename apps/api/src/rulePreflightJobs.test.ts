import assert from "node:assert/strict";
import { test } from "node:test";
import { countRuleTokens } from "@tyche/constants";
import {
  appendRulePreflightJobEvent,
  countRulePreflightJobListeners,
  createRulePreflightJob,
  exportApiStateSnapshot,
  findRunningRulePreflightJobByFingerprint,
  formatRulePreflightSseFrame,
  getRulePreflightJob,
  getRulePreflightJobFingerprint,
  getRulePreflightJobStats,
  isRulePreflightJobId,
  isValidConversationDraft,
  listConversationDrafts,
  matchRulePreflightJobEventsPath,
  matchRulePreflightJobPath,
  parseRulePreflightCursor,
  readRulePreflightJobEventsAfter,
  reserveRulePreflightJobSlot,
  resetApiStateForTests,
  restoreApiStateSnapshot,
  saveConversationDraft,
  subscribeToRulePreflightJob,
  sweepRulePreflightJobs,
  unsubscribeFromRulePreflightJob,
  type RuleInterpretationResult,
  type RulePreflightJobEventEnvelope,
  type RulePreflightPhase,
} from "./index.js";

const BASE_TIME = "2026-01-01T00:00:00.000Z";

function at(offsetMs: number) {
  return new Date(Date.parse(BASE_TIME) + offsetMs).toISOString();
}

function startJob(
  phase: RulePreflightPhase = "compile",
  text = "Win if at least four of your numbers appear in the draw.",
) {
  return createRulePreflightJob({
    createdAt: BASE_TIME,
    fingerprint: getRulePreflightJobFingerprint(phase, text),
    phase,
  });
}

function progressEvent(message: string) {
  return {
    progress: { message, stage: "interpreting" as const },
    type: "progress" as const,
  };
}

function interpretation(): RuleInterpretationResult {
  return {
    addedOperationalClauses: [],
    clarityNote: "",
    dealerMessage: "I read this as an at-least-four match.",
    englishText: "Win if at least four of your numbers appear in the draw.",
    guardianChecked: true,
    needsClarification: false,
    normalizedText: "Win if at least four numbers match the draw.",
    officialInterpretation: "At least four of the six guessed numbers match.",
    sanitizedText: "Win if at least four of your numbers appear in the draw.",
    suggestedRewrites: [],
    title: "At Least Four Match",
    tokenCount: 12,
  };
}

test("a rule preflight job assigns monotonic event ids and one terminal state", () => {
  resetApiStateForTests();
  const job = startJob();

  assert.equal(appendRulePreflightJobEvent(job.id, progressEvent("a"))?.seq, 1);
  assert.equal(appendRulePreflightJobEvent(job.id, progressEvent("b"))?.seq, 2);
  assert.equal(job.status, "running");

  const terminal = appendRulePreflightJobEvent(job.id, {
    interpretation: interpretation(),
    type: "interpretation",
  });
  assert.equal(terminal?.seq, 3);

  const stored = getRulePreflightJob(job.id);
  assert.equal(stored?.status, "completed");
  assert.equal(stored?.terminalEvent?.type, "interpretation");
  assert.notEqual(stored?.completedAt, null);
});

test("a second terminal rule preflight event is a no-op", () => {
  resetApiStateForTests();
  const job = startJob();
  appendRulePreflightJobEvent(job.id, {
    error: "RULE_AGENT_TIMEOUT",
    message: "The dealer timed out.",
    status: 502,
    type: "error",
  });

  const second = appendRulePreflightJobEvent(job.id, {
    interpretation: interpretation(),
    type: "interpretation",
  });

  assert.equal(second, null);
  const stored = getRulePreflightJob(job.id);
  assert.equal(stored?.status, "failed");
  assert.equal(stored?.lastSeq, 1);
});

test("appending to an unknown rule preflight job is a no-op", () => {
  resetApiStateForTests();
  assert.equal(appendRulePreflightJobEvent("missing", progressEvent("a")), null);
});

test("rule preflight replay returns only events after the requested cursor", () => {
  resetApiStateForTests();
  const job = startJob();
  for (const message of ["a", "b", "c", "d"]) {
    appendRulePreflightJobEvent(job.id, progressEvent(message));
  }

  const replay = readRulePreflightJobEventsAfter(job.id, 2);
  assert.equal(replay?.reset, false);
  assert.equal(replay?.lastSeq, 4);
  assert.equal(replay?.status, "running");
  assert.deepEqual(
    replay?.events.map((envelope) => envelope.seq),
    [3, 4],
  );
});

test("rule preflight replay of an unknown job is null", () => {
  resetApiStateForTests();
  assert.equal(readRulePreflightJobEventsAfter("missing", 0), null);
});

test("rule preflight replay signals reset when the cursor fell out of the buffer", () => {
  resetApiStateForTests();
  const job = startJob();
  for (let index = 0; index < 70; index += 1) {
    appendRulePreflightJobEvent(job.id, progressEvent(`event ${index}`));
  }

  const replay = readRulePreflightJobEventsAfter(job.id, 2);
  assert.equal(replay?.reset, true);
  // Reset replays the whole retained buffer rather than showing a silent gap.
  assert.equal(replay?.events.length, 64);
  assert.equal(replay?.events[0]?.seq, 7);
});

test("rule preflight replay signals reset for a cursor beyond the last event id", () => {
  resetApiStateForTests();
  const job = startJob();
  appendRulePreflightJobEvent(job.id, progressEvent("a"));

  const replay = readRulePreflightJobEventsAfter(job.id, 9);
  assert.equal(replay?.reset, true);
  assert.deepEqual(
    replay?.events.map((envelope) => envelope.seq),
    [1],
  );
});

test("the rule preflight event buffer is bounded and counts what it dropped", () => {
  resetApiStateForTests();
  const job = startJob();
  for (let index = 0; index < 70; index += 1) {
    appendRulePreflightJobEvent(job.id, progressEvent(`event ${index}`));
  }

  const stored = getRulePreflightJob(job.id);
  assert.equal(stored?.events.length, 64);
  assert.equal(stored?.droppedEvents, 6);
  assert.equal(stored?.lastSeq, 70);
});

test("a rule preflight event above the payload cap becomes a truncation error", () => {
  resetApiStateForTests();
  const job = startJob();

  const envelope = appendRulePreflightJobEvent(
    job.id,
    progressEvent("x".repeat(300_000)),
  );

  assert.equal(envelope?.event.type, "error");
  assert.equal(
    envelope?.event.type === "error" ? envelope.event.error : null,
    "RULE_PREFLIGHT_PAYLOAD_TOO_LARGE",
  );
  assert.equal(getRulePreflightJob(job.id)?.status, "failed");
});

test("rule preflight events fan out to every subscriber", () => {
  resetApiStateForTests();
  const job = startJob();
  const first: number[] = [];
  const second: number[] = [];
  subscribeToRulePreflightJob(job.id, (envelope) => first.push(envelope.seq));
  subscribeToRulePreflightJob(job.id, (envelope) => second.push(envelope.seq));

  appendRulePreflightJobEvent(job.id, progressEvent("a"));
  appendRulePreflightJobEvent(job.id, progressEvent("b"));

  assert.deepEqual(first, [1, 2]);
  assert.deepEqual(second, [1, 2]);
  assert.equal(countRulePreflightJobListeners(job.id), 2);
});

test("a throwing rule preflight subscriber cannot break the pipeline", () => {
  resetApiStateForTests();
  const job = startJob();
  const delivered: number[] = [];
  subscribeToRulePreflightJob(job.id, () => {
    throw new Error("listener exploded");
  });
  subscribeToRulePreflightJob(job.id, (envelope) =>
    delivered.push(envelope.seq),
  );

  assert.equal(appendRulePreflightJobEvent(job.id, progressEvent("a"))?.seq, 1);
  assert.deepEqual(delivered, [1]);
});

test("a rule preflight subscriber that detaches mid-delivery still gets its event", () => {
  resetApiStateForTests();
  const job = startJob();
  const delivered: number[] = [];
  const listener = (envelope: RulePreflightJobEventEnvelope) => {
    delivered.push(envelope.seq);
    unsubscribeFromRulePreflightJob(job.id, listener);
  };
  subscribeToRulePreflightJob(job.id, listener);

  appendRulePreflightJobEvent(job.id, progressEvent("a"));
  appendRulePreflightJobEvent(job.id, progressEvent("b"));

  assert.deepEqual(delivered, [1]);
  assert.equal(countRulePreflightJobListeners(job.id), 0);
});

test("unsubscribing the last rule preflight listener drops the empty set", () => {
  resetApiStateForTests();
  const job = startJob();
  const listener = () => undefined;
  subscribeToRulePreflightJob(job.id, listener);
  assert.equal(countRulePreflightJobListeners(job.id), 1);

  unsubscribeFromRulePreflightJob(job.id, listener);
  assert.equal(countRulePreflightJobListeners(job.id), 0);
  // Unsubscribing twice, or from an unknown job, must not throw.
  unsubscribeFromRulePreflightJob(job.id, listener);
  unsubscribeFromRulePreflightJob("missing", listener);
});

test("rule preflight fingerprints ignore surrounding whitespace but not phase", () => {
  const padded = getRulePreflightJobFingerprint("compile", "  Win on a match. ");
  const trimmed = getRulePreflightJobFingerprint("compile", "Win on a match.");
  const interpretPhase = getRulePreflightJobFingerprint(
    "interpret",
    "Win on a match.",
  );

  assert.equal(padded, trimmed);
  assert.notEqual(trimmed, interpretPhase);
});

test("only a running rule preflight job is reused for an identical request", () => {
  resetApiStateForTests();
  const text = "Win if every number is even.";
  const fingerprint = getRulePreflightJobFingerprint("compile", text);
  const job = createRulePreflightJob({ fingerprint, phase: "compile" });

  assert.equal(findRunningRulePreflightJobByFingerprint(fingerprint)?.id, job.id);

  appendRulePreflightJobEvent(job.id, {
    interpretation: interpretation(),
    type: "interpretation",
  });

  // A finished job is a short-lived cache of a nondeterministic computation:
  // the player must be able to run the same text again.
  assert.equal(findRunningRulePreflightJobByFingerprint(fingerprint), null);
});

test("rule preflight job ids are unguessable and unique", () => {
  resetApiStateForTests();
  const ids = new Set<string>();
  for (let index = 0; index < 500; index += 1) {
    const job = createRulePreflightJob({
      fingerprint: `fingerprint-${index}`,
      phase: "compile",
    });
    assert.equal(isRulePreflightJobId(job.id), true, job.id);
    ids.add(job.id);
  }
  assert.equal(ids.size, 500);
  assert.equal(isRulePreflightJobId("short"), false);
  assert.equal(isRulePreflightJobId(`${"a".repeat(31)}/`), false);
});

test("sweeping evicts terminal rule preflight jobs past their TTL", () => {
  resetApiStateForTests();
  const job = startJob();
  appendRulePreflightJobEvent(job.id, {
    interpretation: interpretation(),
    type: "interpretation",
  }, BASE_TIME);

  assert.equal(sweepRulePreflightJobs(at(9 * 60 * 1000)), 0);
  assert.notEqual(getRulePreflightJob(job.id), null);

  assert.equal(sweepRulePreflightJobs(at(11 * 60 * 1000)), 1);
  assert.equal(getRulePreflightJob(job.id), null);
});

test("sweeping fails a rule preflight job stuck running past its fuse", () => {
  resetApiStateForTests();
  const job = startJob();
  appendRulePreflightJobEvent(job.id, progressEvent("a"), BASE_TIME);

  sweepRulePreflightJobs(at(16 * 60 * 1000));

  const stored = getRulePreflightJob(job.id);
  assert.equal(stored?.status, "failed");
  assert.equal(
    stored?.terminalEvent?.type === "error"
      ? stored.terminalEvent.error
      : null,
    "RULE_PREFLIGHT_JOB_ABANDONED",
  );
});

test("rule preflight capacity evicts terminal jobs before refusing new work", () => {
  resetApiStateForTests();
  for (let index = 0; index < 256; index += 1) {
    const job = createRulePreflightJob({
      createdAt: at(index),
      fingerprint: `fingerprint-${index}`,
      phase: "compile",
    });
    appendRulePreflightJobEvent(
      job.id,
      { interpretation: interpretation(), type: "interpretation" },
      at(index),
    );
  }
  assert.equal(getRulePreflightJobStats().total, 256);

  const slot = reserveRulePreflightJobSlot();

  assert.equal(slot.error, null);
  assert.equal(getRulePreflightJobStats().total, 255);
});

test("rule preflight refuses new work once the active fuse is full", () => {
  resetApiStateForTests();
  for (let index = 0; index < 32; index += 1) {
    createRulePreflightJob({
      fingerprint: `fingerprint-${index}`,
      phase: "compile",
    });
  }

  const slot = reserveRulePreflightJobSlot();

  assert.equal(slot.error, "rule_preflight_busy");
  assert.equal(slot.status, 429);
  assert.equal(getRulePreflightJobStats().active, 32);
});

test("SSE frames carry the sequence id, the event name and single-line data", () => {
  const frame = formatRulePreflightSseFrame({
    emittedAt: BASE_TIME,
    event: progressEvent("Interpreting your rule..."),
    seq: 7,
  });

  assert.equal(
    frame,
    'id: 7\nevent: progress\ndata: {"progress":{"message":"Interpreting your rule...","stage":"interpreting"},"type":"progress"}\n\n',
  );
});

test("a failed job is framed as `failed` so it cannot look like a dropped socket", () => {
  const frame = formatRulePreflightSseFrame({
    emittedAt: BASE_TIME,
    event: {
      error: "RULE_AGENT_TIMEOUT",
      message: "Line one\nline two",
      status: 502,
      type: "error",
    },
    seq: 3,
  });

  assert.match(frame, /^id: 3\nevent: failed\ndata: /u);
  // The payload keeps its NDJSON shape, and a newline inside a message must not
  // break the single `data:` line.
  const dataLine = frame.split("\n")[2] ?? "";
  assert.match(dataLine, /"type":"error"/u);
  assert.match(dataLine, /Line one\\nline two/u);
  assert.equal(frame.split("\n").length, 5);
});

test("the Last-Event-ID header wins over the cursor query fallback", () => {
  assert.equal(parseRulePreflightCursor("4", "9"), 4);
  assert.equal(parseRulePreflightCursor(["6", "7"], "9"), 6);
  assert.equal(parseRulePreflightCursor(undefined, "9"), 9);
});

test("a malformed rule preflight cursor degrades to a full replay", () => {
  assert.equal(parseRulePreflightCursor(undefined, null), 0);
  assert.equal(parseRulePreflightCursor(undefined, ""), 0);
  assert.equal(parseRulePreflightCursor(undefined, "-3"), 0);
  assert.equal(parseRulePreflightCursor(undefined, "not-a-number"), 0);
  assert.equal(parseRulePreflightCursor(undefined, "1234567890"), 0);
  assert.equal(parseRulePreflightCursor(" 12 ", null), 12);
});

test("the events path matches only a valid job id on the events subpath", () => {
  const jobId = "a".repeat(32);

  assert.equal(
    matchRulePreflightJobEventsPath(`/rule-preflight/jobs/${jobId}/events`),
    jobId,
  );
  assert.equal(
    matchRulePreflightJobEventsPath(`/rule-preflight/jobs/${jobId}`),
    null,
  );
  assert.equal(
    matchRulePreflightJobEventsPath(`/rule-preflight/jobs/${jobId}/events/more`),
    null,
  );
  assert.equal(matchRulePreflightJobEventsPath("/rule-preflight/jobs//events"), null);
  assert.equal(matchRulePreflightJobEventsPath("/rule-preflight"), null);
  assert.equal(
    matchRulePreflightJobEventsPath("/rule-preflight/jobs/..%2F..%2Fetc/events"),
    null,
  );
});

test("the cancellable job path matches only the exact opaque job id", () => {
  const jobId = "a".repeat(32);

  assert.equal(
    matchRulePreflightJobPath(`/rule-preflight/jobs/${jobId}`),
    jobId,
  );
  assert.equal(
    matchRulePreflightJobPath(`/rule-preflight/jobs/${jobId}/events`),
    null,
  );
  assert.equal(matchRulePreflightJobPath("/rule-preflight/jobs/short"), null);
});

test("terminal rule preflight jobs survive a snapshot round trip without their progress", () => {
  resetApiStateForTests();
  const job = startJob();
  appendRulePreflightJobEvent(job.id, progressEvent("a"));
  appendRulePreflightJobEvent(job.id, progressEvent("b"));
  appendRulePreflightJobEvent(job.id, {
    interpretation: interpretation(),
    type: "interpretation",
  });

  const snapshot = exportApiStateSnapshot();
  resetApiStateForTests();
  assert.equal(getRulePreflightJob(job.id), null);

  restoreApiStateSnapshot(snapshot);
  const restored = getRulePreflightJob(job.id);
  assert.equal(restored?.status, "completed");
  assert.equal(restored?.events.length, 1);
  assert.equal(restored?.events[0]?.seq, 3);
  assert.equal(restored?.droppedEvents, 2);

  // A client reattaching with no cursor gets the reset path plus the answer.
  const replay = readRulePreflightJobEventsAfter(job.id, 1);
  assert.equal(replay?.reset, true);
  assert.equal(replay?.events[0]?.event.type, "interpretation");
});

test("running rule preflight jobs are excluded from the state snapshot", () => {
  resetApiStateForTests();
  const job = startJob();
  appendRulePreflightJobEvent(job.id, progressEvent("a"));

  const snapshot = exportApiStateSnapshot();

  assert.deepEqual(snapshot.rulePreflightJobs, []);
});

test("restoring a snapshot without rule preflight jobs leaves the registry empty", () => {
  resetApiStateForTests();
  const snapshot = exportApiStateSnapshot();
  const legacy = { ...snapshot };
  delete (legacy as Partial<typeof snapshot>).rulePreflightJobs;

  restoreApiStateSnapshot(legacy as typeof snapshot);

  assert.equal(getRulePreflightJobStats().total, 0);
});

const DRAFT_WALLET = "4bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTH";
const DRAFT_PROMPT = "Win if all six numbers are even.";

function draftBody(preflightJobId?: null | string) {
  return {
    lastMessage: DRAFT_PROMPT,
    normalizedText: null,
    officialInterpretation: null,
    ...(preflightJobId === undefined ? {} : { preflightJobId }),
    prompt: DRAFT_PROMPT,
    ruleId: null,
    status: "draft" as const,
    tokenCount: countRuleTokens(DRAFT_PROMPT),
    turnId: 7,
    wallet: DRAFT_WALLET,
  };
}

test("a conversation draft carries the preflight job it is waiting on", () => {
  resetApiStateForTests();
  const jobId = "b".repeat(32);

  assert.equal(isValidConversationDraft(draftBody(jobId)), true);
  assert.equal(isValidConversationDraft(draftBody(null)), true);
  assert.equal(isValidConversationDraft(draftBody()), true);

  const saved = saveConversationDraft(draftBody(jobId));
  assert.equal(saved.preflightJobId, jobId);
  assert.equal(
    listConversationDrafts(DRAFT_WALLET)[0]?.preflightJobId,
    jobId,
  );
});

test("a draft save that says nothing about the job keeps the pointer it was given", () => {
  resetApiStateForTests();
  const jobId = "c".repeat(32);
  const { draftId } = saveConversationDraft(draftBody(jobId));

  // The run writes the pointer once, and every unrelated save that follows -
  // a retried transcript write, a rule id landing - omits the field. Letting
  // those blank it would leave the conversation list unable to say a run is
  // still compiling, which is exactly how a finished preflight went unclaimed.
  const untouched = saveConversationDraft({ ...draftBody(), draftId });
  assert.equal(untouched.preflightJobId, jobId);
  assert.equal(listConversationDrafts(DRAFT_WALLET)[0]?.preflightJobId, jobId);

  // An explicit null is still how a finished run clears it.
  const cleared = saveConversationDraft({ ...draftBody(null), draftId });
  assert.equal(cleared.preflightJobId, null);

  // And once cleared, omitting the field must not resurrect the old pointer.
  assert.equal(
    saveConversationDraft({ ...draftBody(), draftId }).preflightJobId,
    null,
  );
});

test("a conversation draft rejects a preflight job id it could never have issued", () => {
  assert.equal(isValidConversationDraft(draftBody("not-a-job-id")), false);
  assert.equal(
    isValidConversationDraft({ ...draftBody(), preflightJobId: 7 }),
    false,
  );
});
