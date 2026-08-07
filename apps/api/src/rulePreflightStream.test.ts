import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { handleApiRequest, resetApiStateForTests } from "./index.js";

// The first HTTP-level test in this package. It exists because the guarantee
// this endpoint now makes — the rule pipeline outlives the socket that started
// it — cannot be observed from the pure registry functions.

const RULE_TEXT = "Win if the sum of your numbers is greater than 150.";
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

let server: Server;
let baseUrl: string;

/** Resolved by the test to let the stubbed dealer finish. */
let releaseAgent: () => void = () => undefined;
let agentGate: Promise<void>;

function armAgentGate() {
  agentGate = new Promise<void>((resolve) => {
    releaseAgent = resolve;
  });
}

function agentResponse() {
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: {
            content: JSON.stringify({
              addedOperationalClauses: [],
              clarificationQuestions: [],
              clarityNote: "",
              dealerMessage: "I read this as a sum above 150.",
              needsClarification: false,
              normalizedText: "Win if the guessed numbers sum above 150.",
              officialInterpretation:
                "The six guessed numbers must add up to more than 150.",
              suggestedRewrites: [],
              title: "Sum Above 150",
            }),
          },
        },
      ],
    }),
    { headers: { "content-type": "application/json" }, status: 200 },
  );
}

function waitForAgent(signal?: AbortSignal) {
  if (!signal) {
    return agentGate;
  }
  return new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(signal.reason);
      return;
    }
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    void agentGate.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

before(async () => {
  process.env.LLM_BASE_URL = "http://127.0.0.1:9/v1";
  process.env.LLM_MODEL = "test-dealer";
  process.env.LLM_TRANSLATE_TO_ENGLISH = "false";
  // No LLM_GUARDIAN_MODEL: the guardian is a feature flag and stays off here.
  delete process.env.LLM_GUARDIAN_MODEL;

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = String(input);
    if (url.startsWith("http://127.0.0.1:9/")) {
      if (url.endsWith("/api/ps")) {
        // Not an Ollama-native endpoint, so model loading is skipped outright.
        return new Response("not found", { status: 404 });
      }
      await waitForAgent(init?.signal ?? undefined);
      return agentResponse();
    }
    return originalFetch(input, init);
  }) as typeof fetch;

  server = createServer(handleApiRequest);
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  globalThis.fetch = originalFetch;
  process.env = originalEnv;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetApiStateForTests();
  armAgentGate();
});

async function startJob(text = RULE_TEXT) {
  const response = await fetch(`${baseUrl}/rule-preflight`, {
    body: JSON.stringify({ phase: "interpret", text }),
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
    },
    method: "POST",
  });
  const body = (await response.json()) as {
    idempotent: boolean;
    jobId: string;
    phase: string;
    status: string;
  };
  return { body, response };
}

interface SseFrame {
  data: string;
  event: string;
  id: null | string;
}

/**
 * Reads SSE frames until `stopWhen` returns true or the body ends, then aborts.
 * Returns everything it saw, so a test can assert on ordering and ids.
 */
async function readFrames(
  url: string,
  options: {
    headers?: Record<string, string>;
    signal?: AbortSignal;
    stopWhen: (frame: SseFrame, all: SseFrame[]) => boolean;
  },
) {
  const controller = new AbortController();
  const signal = options.signal ?? controller.signal;
  const response = await fetch(url, {
    headers: { accept: "text/event-stream", ...options.headers },
    signal,
  });
  const frames: SseFrame[] = [];
  if (response.status !== 200 || !response.body) {
    return { frames, response };
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";
      for (const block of blocks) {
        if (!block.trim() || block.startsWith(":")) {
          continue;
        }
        const frame: SseFrame = { data: "", event: "message", id: null };
        for (const line of block.split("\n")) {
          if (line.startsWith("id: ")) frame.id = line.slice(4);
          else if (line.startsWith("event: ")) frame.event = line.slice(7);
          else if (line.startsWith("data: ")) frame.data = line.slice(6);
          else if (line.startsWith("retry: ")) continue;
        }
        if (!frame.data) {
          continue;
        }
        frames.push(frame);
        if (options.stopWhen(frame, frames)) {
          controller.abort();
          return { frames, response };
        }
      }
      if (done) {
        break;
      }
    }
  } catch (error) {
    if ((error as Error).name !== "AbortError") {
      throw error;
    }
  }
  return { frames, response };
}

test("accepting a rule preflight job returns 202 with the events location", async () => {
  const { body, response } = await startJob();

  assert.equal(response.status, 202);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.equal(body.status, "running");
  assert.equal(body.phase, "interpret");
  assert.equal(body.idempotent, false);
  assert.equal(
    response.headers.get("location"),
    `/rule-preflight/jobs/${body.jobId}/events`,
  );

  releaseAgent();
});

test("an identical in-flight rule preflight request joins the running job", async () => {
  const first = await startJob();
  const second = await startJob();

  assert.equal(second.body.jobId, first.body.jobId);
  assert.equal(second.body.idempotent, true);

  releaseAgent();
});

test("the rule preflight event stream is served with streaming headers", async () => {
  const { body } = await startJob();

  const { response, frames } = await readFrames(
    `${baseUrl}/rule-preflight/jobs/${body.jobId}/events`,
    { stopWhen: (frame) => frame.event === "progress" },
  );

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "text/event-stream; charset=utf-8",
  );
  assert.equal(
    response.headers.get("cache-control"),
    "no-cache, no-store, no-transform",
  );
  assert.equal(response.headers.get("x-accel-buffering"), "no");
  assert.ok(frames.length > 0);
  assert.equal(frames[0]?.id, "1");

  releaseAgent();
});

test("dropping the stream mid-run keeps the pipeline alive and the cursor resumes it", async () => {
  const { body } = await startJob();
  const jobId = body.jobId;

  // Attach, take whatever progress has been buffered, then hang up hard while
  // the dealer is still blocked on the gate.
  const first = await readFrames(
    `${baseUrl}/rule-preflight/jobs/${jobId}/events`,
    { stopWhen: (frame) => frame.event === "progress" },
  );
  const cursor = first.frames[first.frames.length - 1]?.id;
  assert.ok(cursor, "expected at least one identified progress frame");
  assert.equal(
    first.frames.some((frame) => frame.event === "interpretation"),
    false,
  );

  // Nothing is listening now. The job must finish anyway.
  releaseAgent();

  const resumed = await readFrames(
    `${baseUrl}/rule-preflight/jobs/${jobId}/events?cursor=${cursor}`,
    {
      headers: { "last-event-id": cursor },
      stopWhen: (frame) => frame.event === "interpretation",
    },
  );

  const terminal = resumed.frames.find(
    (frame) => frame.event === "interpretation",
  );
  assert.ok(terminal, "the resumed stream must deliver the result");
  const payload = JSON.parse(terminal.data) as {
    interpretation: { officialInterpretation: string; title: string };
    type: string;
  };
  assert.equal(payload.type, "interpretation");
  assert.equal(payload.interpretation.title, "Sum Above 150");

  // No replayed frame may repeat a sequence the first connection already saw.
  const resumedIds = resumed.frames
    .map((frame) => Number(frame.id))
    .filter((id) => Number.isFinite(id));
  assert.equal(
    resumedIds.every((id) => id > Number(cursor)),
    true,
    `resumed ids ${resumedIds.join(",")} must all exceed ${cursor}`,
  );
  assert.equal(
    resumed.frames.some((frame) => frame.event === "reset"),
    false,
  );
});

test("explicitly discarding a run cancels its server-owned job", async () => {
  const { body } = await startJob("Win if the guessed sum is above 151.");
  const cancellation = await fetch(
    `${baseUrl}/rule-preflight/jobs/${body.jobId}`,
    { method: "DELETE" },
  );

  assert.equal(cancellation.status, 202);
  assert.deepEqual(await cancellation.json(), {
    cancelled: true,
    jobId: body.jobId,
  });

  const terminal = await readFrames(
    `${baseUrl}/rule-preflight/jobs/${body.jobId}/events`,
    { stopWhen: (frame) => frame.event === "failed" },
  );
  const failed = terminal.frames.find((frame) => frame.event === "failed");
  assert.ok(failed);
  assert.deepEqual(JSON.parse(failed.data), {
    error: "rule_preflight_cancelled",
    message: "The rule preflight run was cancelled.",
    status: 499,
    type: "error",
  });
});

test("attaching to a finished rule preflight job replays the result and closes", async () => {
  const { body } = await startJob("Win if all six numbers are even.");
  releaseAgent();

  const first = await readFrames(
    `${baseUrl}/rule-preflight/jobs/${body.jobId}/events`,
    { stopWhen: (frame) => frame.event === "done" },
  );
  assert.equal(
    first.frames.some((frame) => frame.event === "interpretation"),
    true,
  );

  // Reconnecting once already current has nothing left to send, and 204 is what
  // tells a client to stop reattaching.
  const lastId = first.frames
    .filter((frame) => frame.id !== null)
    .map((frame) => frame.id)
    .pop();
  const current = await fetch(
    `${baseUrl}/rule-preflight/jobs/${body.jobId}/events?cursor=${lastId}`,
    { headers: { accept: "text/event-stream" } },
  );
  assert.equal(current.status, 204);
  await current.body?.cancel();
});

test("an unknown rule preflight job id is a 404 so clients stop reconnecting", async () => {
  const response = await fetch(
    `${baseUrl}/rule-preflight/jobs/${"a".repeat(32)}/events`,
    { headers: { accept: "text/event-stream" } },
  );

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), {
    error: "rule_preflight_job_not_found",
  });
});

test("a malformed rule preflight job path is not routed to the stream", async () => {
  const response = await fetch(`${baseUrl}/rule-preflight/jobs/short/events`, {
    headers: { accept: "text/event-stream" },
  });

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});

test("the legacy NDJSON transport still streams the same envelopes", async () => {
  releaseAgent();
  const response = await fetch(`${baseUrl}/rule-preflight`, {
    body: JSON.stringify({ phase: "interpret", text: "Win if all six numbers are odd." }),
    headers: {
      accept: "application/x-ndjson",
      "content-type": "application/json",
    },
    method: "POST",
  });

  assert.equal(response.status, 200);
  assert.equal(
    response.headers.get("content-type"),
    "application/x-ndjson; charset=utf-8",
  );
  const events = (await response.text())
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as { type: string });

  assert.equal(events[0]?.type, "progress");
  assert.equal(events[events.length - 1]?.type, "interpretation");
});
