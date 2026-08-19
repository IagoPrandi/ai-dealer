import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ApiRequestError,
  askDealer,
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

test("aborting a preflight stream cancels its active reader", async () => {
  const controller = new AbortController();
  let readerCancelled = false;
  let rejectRead: (reason?: unknown) => void = () => undefined;
  const reader = {
    cancel: async () => {
      readerCancelled = true;
    },
    read: () =>
      new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => {
        rejectRead = reject;
      }),
  };
  const fetchImpl = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    init?.signal?.addEventListener(
      "abort",
      () => rejectRead(init.signal?.reason),
      { once: true },
    );
    return {
      body: { getReader: () => reader },
      ok: true,
      status: 200,
    } as Response;
  }) as typeof fetch;

  const task = consumeRulePreflightJob({
    fetchImpl,
    jobId: "job-abort",
    signal: controller.signal,
  });
  await Promise.resolve();
  controller.abort(new DOMException("cancelled", "AbortError"));

  await assert.rejects(
    task,
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
  assert.equal(readerCancelled, true);
});

test("a dealer question reports answer text as it streams, then the final object", async () => {
  const deltas: string[] = [];
  let sentHeaders: HeadersInit | undefined;
  const fetchImpl = (async (_input: string, init?: RequestInit) => {
    sentHeaders = init?.headers;
    return sseResponse([
      "event: delta\ndata: {\"text\":\"Ties split \"}\n\n",
      // One frame split across two network chunks: the parser must not emit it
      // twice or drop the tail.
      "event: delta\ndata: {\"text\":\"the pool",
      " equally.\"}\n\nevent: answer\ndata: {\"answer\":\"Ties split the pool equally.\",\"proposedRuleText\":null}\n\n",
    ]);
  }) as unknown as typeof fetch;

  const answer = await askDealer({
    draftId: "client:7:abc",
    fetchImpl,
    message: "what happens on a tie?",
    onDelta: (chunk) => deltas.push(chunk),
  });

  assert.deepEqual(deltas, ["Ties split ", "the pool equally."]);
  assert.equal(answer.answer, "Ties split the pool equally.");
  assert.equal(
    (sentHeaders as Record<string, string>).accept,
    "text/event-stream",
  );
});

test("a dealer answer that fails mid-stream keeps the status the JSON transport would use", async () => {
  const fetchImpl = (async () =>
    sseResponse([
      "event: delta\ndata: {\"text\":\"Half an ans\"}\n\n",
      "event: error\ndata: {\"error\":\"rule_agent_unavailable\",\"message\":\"The dealer engine is offline.\",\"status\":503}\n\n",
    ])) as unknown as typeof fetch;

  const failure = await assert.rejects(
    askDealer({
      draftId: "client:7:abc",
      fetchImpl,
      message: "explain the draw",
    }),
    ApiRequestError,
  );
  void failure;
});

test("a dealer answer stream that ends without a terminal frame is an error", async () => {
  // Silence here would look like an empty answer from the dealer.
  const fetchImpl = (async () =>
    sseResponse(["event: delta\ndata: {\"text\":\"Half an ans\"}\n\n"])) as unknown as typeof fetch;

  await assert.rejects(
    askDealer({ draftId: "client:7:abc", fetchImpl, message: "hi" }),
    /ended before the dealer answer was complete/,
  );
});
