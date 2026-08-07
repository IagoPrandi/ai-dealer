import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ApiRequestError,
  consumeRulePreflightJob,
  rulePreflightJobEventsPath,
  SseStreamExpiredError,
  type RulePreflightProgress,
} from "./apiClient.js";

function sseResponse(chunks: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    {
      headers: { "content-type": "text/event-stream; charset=utf-8" },
      status: 200,
      ...init,
    },
  );
}

function frame(id: number, event: string, data: unknown) {
  return `id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

test("a preflight job stream reports real stages before returning the result", async () => {
  const progress: RulePreflightProgress[] = [];
  const fetchImpl = (async () =>
    sseResponse([
      ": ping\n\n",
      frame(1, "progress", {
        progress: { message: "Checking safety...", stage: "checking_safety" },
        type: "progress",
      }),
      frame(2, "progress", {
        progress: { message: "Interpreting your rule...", stage: "interpreting" },
        type: "progress",
      }),
      frame(3, "result", {
        preflight: {
          dealerMessage: "Done",
          decision: "VALID",
          needsClarification: false,
          normalizedText: "A guess wins.",
          ruleId: 91,
          tokenCount: 4,
        },
        type: "result",
      }),
      `event: done\ndata: {"type":"done"}\n\n`,
    ])) as unknown as typeof fetch;

  const outcome = await consumeRulePreflightJob({
    fetchImpl,
    jobId: "job-1",
    onProgress: (event) => progress.push(event),
  });

  assert.deepEqual(
    progress.map((event) => event.stage),
    ["checking_safety", "interpreting"],
  );
  assert.ok("preflight" in outcome);
  assert.equal(outcome.preflight.ruleId, 91);
});

test("a preflight job stream preserves typed backend errors", async () => {
  const fetchImpl = (async () =>
    sseResponse([
      frame(1, "failed", {
        error: "RULE_AGENT_TIMEOUT",
        message: "The dealer timed out.",
        status: 502,
        type: "error",
      }),
    ])) as unknown as typeof fetch;

  await assert.rejects(
    consumeRulePreflightJob({ fetchImpl, jobId: "job-2" }),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "RULE_AGENT_TIMEOUT" &&
      error.status === 502,
  );
});

test("an expired preflight job is not an ApiRequestError", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response(JSON.stringify({ error: "rule_preflight_job_not_found" }), {
      status: 404,
    });
  }) as unknown as typeof fetch;

  await assert.rejects(
    consumeRulePreflightJob({ fetchImpl, jobId: "job-3" }),
    (error: unknown) => {
      // Sharing the ApiRequestError type would make the caller classify an
      // expired run as a rule the compiler refused.
      assert.equal(error instanceof ApiRequestError, false);
      assert.equal(error instanceof SseStreamExpiredError, true);
      assert.equal((error as SseStreamExpiredError).status, 404);
      return true;
    },
  );
  assert.equal(calls, 1, "an expired job must not be retried");
});

test("a dropped preflight stream resumes from the last event id", async () => {
  const requests: { cursor: null | string; lastEventId: null | string }[] = [];
  const fetchImpl = (async (input: string, init?: RequestInit) => {
    const url = new URL(input, "http://localhost");
    const headers = new Headers(init?.headers);
    requests.push({
      cursor: url.searchParams.get("cursor"),
      lastEventId: headers.get("last-event-id"),
    });

    if (requests.length === 1) {
      // Body ends without a terminal frame: the mid-run drop.
      return sseResponse([
        frame(1, "progress", {
          progress: { message: "Interpreting...", stage: "interpreting" },
          type: "progress",
        }),
      ]);
    }
    return sseResponse([
      frame(2, "interpretation", {
        interpretation: { title: "Two Matches" },
        type: "interpretation",
      }),
    ]);
  }) as unknown as typeof fetch;

  const outcome = await consumeRulePreflightJob({
    fetchImpl,
    jobId: "job-4",
    sleep: async () => undefined,
  });

  assert.equal(requests.length, 2);
  assert.equal(requests[0]?.cursor, null);
  assert.equal(requests[1]?.cursor, "1");
  assert.equal(requests[1]?.lastEventId, "1");
  assert.ok("interpretation" in outcome);
});

test("the preflight job events path escapes the job id", () => {
  assert.equal(
    rulePreflightJobEventsPath("abc/../def"),
    "/rule-preflight/jobs/abc%2F..%2Fdef/events",
  );
});
