import assert from "node:assert/strict";
import { test } from "node:test";

import {
  createSseParser,
  readSseStream,
  SseStreamDisconnectedError,
  SseStreamExpiredError,
  type SseFrame,
} from "./sseStream.js";

function streamResponse(chunks: string[], init: ResponseInit = {}) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        chunks.forEach((chunk) => controller.enqueue(encoder.encode(chunk)));
        controller.close();
      },
    }),
    {
      headers: { "content-type": "text/event-stream" },
      status: 200,
      ...init,
    },
  );
}

test("the parser reads a complete frame", () => {
  const parser = createSseParser();
  const frames = parser.push("id: 4\nevent: progress\ndata: {\"a\":1}\n\n");

  assert.deepEqual(frames, [
    { data: '{"a":1}', event: "progress", id: "4" },
  ]);
});

test("the parser joins multi-line data and skips heartbeat comments", () => {
  const parser = createSseParser();
  const frames = parser.push(": ping\n\nevent: note\ndata: first\ndata: second\n\n");

  assert.equal(frames.length, 1);
  assert.equal(frames[0]?.data, "first\nsecond");
  assert.equal(frames[0]?.event, "note");
});

test("the parser normalises CRLF line endings", () => {
  const parser = createSseParser();
  const frames = parser.push("id: 2\r\nevent: progress\r\ndata: x\r\n\r\n");

  assert.deepEqual(frames, [{ data: "x", event: "progress", id: "2" }]);
});

test("the parser reassembles a frame split across chunks", () => {
  const parser = createSseParser();

  assert.deepEqual(parser.push("id: 7\nevent: pro"), []);
  assert.deepEqual(parser.push("gress\ndata: hal"), []);
  const frames = parser.push("f\n\n");

  assert.deepEqual(frames, [{ data: "half", event: "progress", id: "7" }]);
});

test("the parser keeps the last id sticky across frames", () => {
  const parser = createSseParser();
  const frames = [
    ...parser.push("id: 9\ndata: one\n\n"),
    ...parser.push("data: two\n\n"),
  ];

  assert.equal(frames[0]?.id, "9");
  // Per the SSE spec the id persists until the server sends a new one.
  assert.equal(frames[1]?.id, "9");
  assert.equal(frames[1]?.event, "message");
});

test("the parser flushes a frame the stream ended without a blank line", () => {
  const parser = createSseParser();
  parser.push("id: 3\ndata: tail");

  assert.deepEqual(parser.end(), [{ data: "tail", event: "message", id: "3" }]);
});

test("the reader stops on the frame the caller asks it to stop on", async () => {
  const seen: SseFrame[] = [];
  const fetchImpl = (async () =>
    streamResponse([
      "id: 1\nevent: progress\ndata: a\n\n",
      "id: 2\nevent: result\ndata: b\n\n",
      "id: 3\nevent: progress\ndata: c\n\n",
    ])) as unknown as typeof fetch;

  await readSseStream({
    fetchImpl,
    onFrame: (frame) => {
      seen.push(frame);
      return frame.event === "result" ? "stop" : "continue";
    },
    url: "/events",
  });

  assert.deepEqual(seen.map((frame) => frame.id), ["1", "2"]);
});

test("the reader reconnects with the cursor after a body ends without a result", async () => {
  const urls: string[] = [];
  const lastEventIds: (null | string)[] = [];
  const backoffs: number[] = [];
  let attempt = 0;

  const fetchImpl = (async (input: string, init?: RequestInit) => {
    urls.push(input);
    lastEventIds.push(new Headers(init?.headers).get("last-event-id"));
    attempt += 1;
    if (attempt < 3) {
      return streamResponse([`id: ${attempt}\nevent: progress\ndata: a\n\n`]);
    }
    return streamResponse(["id: 3\nevent: result\ndata: done\n\n"]);
  }) as unknown as typeof fetch;

  await readSseStream({
    fetchImpl,
    onFrame: (frame) => (frame.event === "result" ? "stop" : "continue"),
    sleep: async (ms) => {
      backoffs.push(ms);
    },
    url: "/events",
  });

  assert.deepEqual(urls, ["/events", "/events?cursor=1", "/events?cursor=2"]);
  assert.deepEqual(lastEventIds, [null, "1", "2"]);
  // Each attempt delivered a new event, so the backoff never escalates: the run
  // is clearly alive and only the socket is flaky.
  assert.deepEqual(backoffs, [500, 500]);
});

test("the backoff escalates when reconnecting makes no progress", async () => {
  const backoffs: number[] = [];
  const fetchImpl = (async () =>
    // Always replays the same event id: the connection opens but the run is not
    // moving, so this must not refund the retry budget.
    streamResponse(["id: 1\nevent: progress\ndata: a\n\n"])) as unknown as typeof fetch;

  await assert.rejects(
    readSseStream({
      fetchImpl,
      maxAttempts: 4,
      onFrame: () => "continue",
      sleep: async (ms) => {
        backoffs.push(ms);
      },
      url: "/events",
    }),
    (error: unknown) => error instanceof SseStreamDisconnectedError,
  );

  assert.deepEqual(backoffs, [500, 1_000, 2_000]);
});

test("the reader appends its cursor to a url that already has a query", async () => {
  const urls: string[] = [];
  let attempt = 0;
  const fetchImpl = (async (input: string) => {
    urls.push(input);
    attempt += 1;
    return attempt === 1
      ? streamResponse(["id: 5\nevent: progress\ndata: a\n\n"])
      : streamResponse(["id: 6\nevent: result\ndata: b\n\n"]);
  }) as unknown as typeof fetch;

  await readSseStream({
    cursor: null,
    fetchImpl,
    onFrame: (frame) => (frame.event === "result" ? "stop" : "continue"),
    sleep: async () => undefined,
    url: "/events?debug=1",
  });

  assert.equal(urls[1], "/events?debug=1&cursor=5");
});

test("the reader starts from a supplied cursor", async () => {
  const urls: string[] = [];
  const fetchImpl = (async (input: string) => {
    urls.push(input);
    return streamResponse(["id: 8\nevent: result\ndata: b\n\n"]);
  }) as unknown as typeof fetch;

  await readSseStream({
    cursor: "7",
    fetchImpl,
    onFrame: () => "stop",
    url: "/events",
  });

  assert.deepEqual(urls, ["/events?cursor=7"]);
});

test("the reader gives up after the reconnect budget and reports the attempts", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return streamResponse(["id: 1\nevent: progress\ndata: a\n\n"]);
  }) as unknown as typeof fetch;

  await assert.rejects(
    readSseStream({
      fetchImpl,
      maxAttempts: 4,
      onFrame: () => "continue",
      sleep: async () => undefined,
      url: "/events",
    }),
    (error: unknown) =>
      error instanceof SseStreamDisconnectedError && error.attempts === 4,
  );
  assert.equal(calls, 4);
});

test("the reader treats a 404 as terminal and does not retry", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;

  await assert.rejects(
    readSseStream({
      fetchImpl,
      onFrame: () => "continue",
      sleep: async () => undefined,
      url: "/events",
    }),
    (error: unknown) =>
      error instanceof SseStreamExpiredError && error.status === 404,
  );
  assert.equal(calls, 1);
});

test("the reader retries a 5xx", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return calls < 3
      ? new Response("{}", { status: 503 })
      : streamResponse(["id: 1\nevent: result\ndata: b\n\n"]);
  }) as unknown as typeof fetch;

  await readSseStream({
    fetchImpl,
    onFrame: () => "stop",
    sleep: async () => undefined,
    url: "/events",
  });

  assert.equal(calls, 3);
});

test("the reader retries a network failure", async () => {
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    if (calls === 1) {
      throw new TypeError("fetch failed");
    }
    return streamResponse(["id: 1\nevent: result\ndata: b\n\n"]);
  }) as unknown as typeof fetch;

  await readSseStream({
    fetchImpl,
    onFrame: () => "stop",
    sleep: async () => undefined,
    url: "/events",
  });

  assert.equal(calls, 2);
});

test("the reader stops quietly when the server says there is nothing left", async () => {
  const fetchImpl = (async () =>
    new Response(null, { status: 204 })) as unknown as typeof fetch;

  await readSseStream({
    fetchImpl,
    onFrame: () => {
      throw new Error("no frame should be delivered");
    },
    url: "/events",
  });
});

test("an aborted reader rejects without retrying", async () => {
  let calls = 0;
  const controller = new AbortController();
  const fetchImpl = (async () => {
    calls += 1;
    controller.abort();
    throw new DOMException("aborted", "AbortError");
  }) as unknown as typeof fetch;

  await assert.rejects(
    readSseStream({
      fetchImpl,
      onFrame: () => "continue",
      signal: controller.signal,
      sleep: async () => undefined,
      url: "/events",
    }),
    (error: unknown) => (error as Error).name === "AbortError",
  );
  assert.equal(calls, 1);
});

test("reconnect state is reported before each retry", async () => {
  const attempts: number[] = [];
  let opened = 0;
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    return calls === 1
      ? streamResponse(["id: 1\nevent: progress\ndata: a\n\n"])
      : streamResponse(["id: 2\nevent: result\ndata: b\n\n"]);
  }) as unknown as typeof fetch;

  await readSseStream({
    fetchImpl,
    onFrame: (frame) => (frame.event === "result" ? "stop" : "continue"),
    onOpen: () => {
      opened += 1;
    },
    onReconnecting: (attempt) => attempts.push(attempt),
    sleep: async () => undefined,
    url: "/events",
  });

  assert.deepEqual(attempts, [1]);
  assert.equal(opened, 2);
});
