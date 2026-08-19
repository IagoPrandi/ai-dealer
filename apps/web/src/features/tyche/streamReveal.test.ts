import assert from "node:assert/strict";
import { test } from "node:test";

import {
  advanceStreamCursor,
  buildStreamPlan,
  charsBufferedInBlock,
  STREAM_CATCH_UP_FACTOR,
  STREAM_CATCH_UP_THRESHOLD,
  STREAM_CHARS_PER_SECOND,
  streamDrainRate,
} from "./streamReveal";

test("drain advances inside a segment and reports the block unfinished", () => {
  const block = { key: "b", segments: ["abcdef"] };
  const next = advanceStreamCursor(block, { chars: 2, segment: 0 }, 3);

  assert.deepEqual(next, { blockDone: false, chars: 5, segment: 0 });
});

test("drain rolls across segment boundaries and skips empty segments", () => {
  const block = { key: "b", segments: ["ab", "", "cd"] };
  const next = advanceStreamCursor(block, { chars: 0, segment: 0 }, 3);

  assert.deepEqual(next, { blockDone: false, chars: 1, segment: 2 });
});

test("drain lands exactly on the block end and reports it done", () => {
  const block = { key: "b", segments: ["ab", "cd"] };
  const next = advanceStreamCursor(block, { chars: 1, segment: 0 }, 3);

  assert.deepEqual(next, { blockDone: true, chars: 2, segment: 1 });
});

test("a live block is never done: more text may still arrive", () => {
  const block = { key: "b", live: true, segments: ["ab"] };
  const next = advanceStreamCursor(block, { chars: 0, segment: 0 }, 5);

  assert.deepEqual(next, { blockDone: false, chars: 2, segment: 0 });
});

test("a block with no segments is done immediately", () => {
  const block = { key: "b", segments: [] };
  const next = advanceStreamCursor(block, { chars: 0, segment: 0 }, 5);

  assert.equal(next.blockDone, true);
});

test("buffered chars count everything not yet revealed in the block", () => {
  const block = { key: "b", segments: ["abcd", "ef", "ghi"] };

  assert.equal(charsBufferedInBlock(block, { chars: 1, segment: 0 }), 8);
  assert.equal(charsBufferedInBlock(block, { chars: 3, segment: 2 }), 0);
});

test("a live stream drains at 55 chars/s until its buffer runs far ahead", () => {
  assert.equal(
    streamDrainRate(STREAM_CATCH_UP_THRESHOLD, true),
    STREAM_CHARS_PER_SECOND,
  );
  assert.equal(
    streamDrainRate(STREAM_CATCH_UP_THRESHOLD + 1, true),
    STREAM_CHARS_PER_SECOND * STREAM_CATCH_UP_FACTOR,
  );
});

test("an already-complete block never catches up, however long it is", () => {
  // Its whole text is buffered by construction, so applying the catch-up rule
  // would make every long message fly past at 165 chars/s.
  assert.equal(
    streamDrainRate(STREAM_CATCH_UP_THRESHOLD * 10, false),
    STREAM_CHARS_PER_SECOND,
  );
  assert.equal(streamDrainRate(4_000), STREAM_CHARS_PER_SECOND);
});

/** Defaults for the fields a given test does not care about. */
function planArgs(overrides: Partial<Parameters<typeof buildStreamPlan>[0]>) {
  return {
    baselineMessageCount: 0,
    guidanceQuestions: null,
    interpretation: null,
    interpretationIsNew: false,
    messages: [],
    planId: "draft:1",
    rule: null,
    ruleIsNew: false,
    streaming: false,
    ...overrides,
  } satisfies Parameters<typeof buildStreamPlan>[0];
}

test("plan streams only the dealer messages appended by this run", () => {
  const plan = buildStreamPlan(
    planArgs({
      baselineMessageCount: 2,
      messages: [
        { text: "old dealer message", who: "ai" },
        { text: "player rule", who: "user" },
        { text: "fresh dealer reply", who: "ai" },
      ],
    }),
  );

  assert.deepEqual(plan, {
    blocks: [{ key: "msg:2", segments: ["fresh dealer reply"] }],
    id: "draft:1",
  });
});

test("a streaming run marks only the newest message live", () => {
  const plan = buildStreamPlan(
    planArgs({
      messages: [
        { text: "first line of the answer", who: "ai" },
        { text: "still arriving", who: "ai" },
      ],
      streaming: true,
    }),
  );

  assert.deepEqual(plan?.blocks, [
    { key: "msg:0", segments: ["first line of the answer"] },
    { key: "msg:1", live: true, segments: ["still arriving"] },
  ]);
});

test("the plan id is stable across the streaming to done transition", () => {
  const messages = [{ text: "the whole answer", who: "ai" as const }];
  const live = buildStreamPlan(planArgs({ messages, streaming: true }));
  const settled = buildStreamPlan(planArgs({ messages, streaming: false }));

  // Same id keeps the reveal cursor, so the answer is not retyped from scratch
  // the moment the stream closes.
  assert.equal(live?.id, settled?.id);
  assert.equal(live?.blocks[0]?.live, true);
  assert.equal(settled?.blocks[0]?.live, undefined);
});

test("plan includes the rule card only when the run produced a new rule", () => {
  const messages = [{ text: "done", who: "ai" as const }];
  const rule = {
    normalizedText: "WIN if sum(guess) == 100.",
    officialInterpretation: "",
  };

  const kept = buildStreamPlan(
    planArgs({ baselineMessageCount: 1, messages, rule, ruleIsNew: true }),
  );
  assert.deepEqual(kept?.blocks, [
    // Empty prose fields are dropped so render and plan segment indices match.
    { key: "rule", segments: ["WIN if sum(guess) == 100."] },
  ]);

  const skipped = buildStreamPlan(
    planArgs({ baselineMessageCount: 1, messages, rule, ruleIsNew: false }),
  );
  assert.equal(skipped, null);
});

test("plan skips the interpretation card when it still needs clarification", () => {
  const plan = buildStreamPlan(
    planArgs({
      guidanceQuestions: ["Does the sum use all six numbers?"],
      interpretation: {
        needsClarification: true,
        normalizedText: "sum rule",
        officialInterpretation: "closest sum wins",
      },
      interpretationIsNew: true,
      messages: [{ text: "which sum?", who: "ai" }],
    }),
  );

  assert.deepEqual(plan?.blocks, [
    { key: "msg:0", segments: ["which sum?"] },
    { key: "guidance", segments: ["Does the sum use all six numbers?"] },
  ]);
});

test("a question-less clarification card still enters the block sequence", () => {
  const plan = buildStreamPlan(
    planArgs({
      guidanceQuestions: [],
      messages: [{ text: "pick a rewrite", who: "ai" }],
    }),
  );

  assert.deepEqual(plan?.blocks, [
    { key: "msg:0", segments: ["pick a rewrite"] },
    { key: "guidance", segments: [] },
  ]);
});

test("plan is null when the snapshot brought nothing new to animate", () => {
  const plan = buildStreamPlan(
    planArgs({
      baselineMessageCount: 1,
      messages: [{ text: "old", who: "ai" }],
    }),
  );

  assert.equal(plan, null);
});
