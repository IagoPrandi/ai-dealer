import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, test } from "node:test";
import { handleApiRequest, resetApiStateForTests } from "./index.js";
import { resetDealerRuntimeForTests } from "./lifespan.js";

// HTTP-level tests of the rule preflight job transport and of the two-phase
// pipeline behind it. Every provider is stubbed at `fetch`: the interpreter,
// the claim-ledger LLM, both compilers, and the Jev semantic checker.

const RULE_TEXT = "Win if the sum of your numbers is greater than 150.";
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };
const LLM_ORIGIN = "http://127.0.0.1:11434";
const JEV_URL = "http://127.0.0.1:11434/jev/decisions";

let server: Server;
let baseUrl: string;

/** Resolved by the test to let the stubbed dealer finish. */
let releaseAgent: () => void = () => undefined;
let agentGate: Promise<void>;
/** How the stubbed Jev answers: normally, as a confident unsafe verdict, or not at all. */
let jevMode: "down" | "ok" | "unsafe" = "ok";
// Compiler B answers off-grammar this many times before it compiles.
let compilerBOffGrammar = 0;
let compilerBCalls = 0;
// Jev requests that carried ledger questions (claim_*), counted per test.
let ledgerJevCalls = 0;

function armAgentGate() {
  agentGate = new Promise<void>((resolve) => {
    releaseAgent = resolve;
  });
}

function chatResponse(content: unknown) {
  return new Response(
    JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }),
    { headers: { "content-type": "application/json" }, status: 200 },
  );
}

function agentResponse() {
  return chatResponse({
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
  });
}

/** A literal one-claim ledger of whatever proposal the pipeline sent. */
function ledgerResponse(userText: string) {
  const proposal = (JSON.parse(userText) as { proposal: string }).proposal;
  const span = proposal.replace(/\.$/u, "");
  return chatResponse({
    claims: [{ dimension: "win_condition", meaning: `${span}.`, sourceSpan: span }],
    openChoices: [],
  });
}

const SUM_ABOVE_150 = {
  result: {
    predicate: {
      kind: "compare",
      left: { kind: "reduce", of: { kind: "source", source: "guess" }, op: "sum" },
      op: "gt",
      right: { kind: "lit", value: 150 },
    },
    type: "predicate",
  },
  schemaVersion: 3,
};

function jevResponse(questions: Record<string, { criteria: unknown; type: string }>) {
  const answers = Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      if (question.type === "choice") {
        const options = Object.keys(question.criteria as Record<string, string>);
        const choice = jevMode === "unsafe" ? "unsafe" : "safe";
        return [
          id,
          {
            choice,
            confidence: 0.95,
            probabilities: Object.fromEntries(options.map((option) => [option, option === choice ? 0.96 : 0.02])),
            type: "choice",
          },
        ];
      }
      if (question.type === "score") {
        const levels = question.criteria as string[];
        const top = jevMode === "unsafe" ? levels.length - 1 : 0;
        return [
          id,
          {
            confidence: 0.9,
            legend: Object.fromEntries(levels.map((level, index) => [String(index), level])),
            probabilities: Object.fromEntries(levels.map((_, index) => [String(index), index === top ? 0.97 : 0.01])),
            score: top,
            type: "score",
          },
        ];
      }
      // Yes to support/decided/implements questions; no to vague/material.
      const yes = !/_vague$|_material$/u.test(id);
      return [id, { noul: yes ? 0.96 : 0.03, type: "noul" }];
    }),
  );
  return new Response(
    JSON.stringify({ answers, model: "typesafe/jev-1.13-20260917", usage: { cost: 0.00009, input_tokens: 900, output_tokens: 20 } }),
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
  process.env.LLM_BASE_URL = `${LLM_ORIGIN}/v1`;
  process.env.LLM_API_KEY = "ollama";
  process.env.LLM_MODEL = "test-dealer";
  process.env.LLM_MODEL_COMPILE = "test-compiler-a";
  process.env.LLM_MODEL_COMPILE_B = "test-compiler-b";
  process.env.LLM_TRANSLATE_TO_ENGLISH = "false";
  process.env.JEV_ENDPOINT = JEV_URL;
  delete process.env.JEV_EXPECTED_MODEL;
  delete process.env.TYCHE_RULE_ARTIFACT_VETO;
  resetDealerRuntimeForTests();

  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = String(input);
    if (!url.startsWith(LLM_ORIGIN)) {
      return originalFetch(input, init);
    }
    if (url.endsWith("/api/ps")) {
      // Model loading is skipped outright.
      return new Response("not found", { status: 404 });
    }
    const body = JSON.parse(String(init?.body)) as {
      messages?: { content: string }[];
      model?: string;
      questions?: Record<string, { criteria: unknown; type: string }>;
      response_format?: { json_schema?: { name?: string } };
    };
    if (url === JEV_URL) {
      if (jevMode === "down") {
        return new Response("upstream unavailable", { status: 503 });
      }
      if (Object.keys(body.questions ?? {}).some((id) => id.startsWith("claim_"))) ledgerJevCalls += 1;
      return jevResponse(body.questions ?? {});
    }
    const schemaName = body.response_format?.json_schema?.name;
    if (schemaName === "tyche_claim_ledger") {
      return ledgerResponse(body.messages?.[1]?.content ?? "{}");
    }
    if (schemaName === "tyche_rule_ast") {
      if (body.model === "test-compiler-b") {
        compilerBCalls += 1;
        if (compilerBOffGrammar > 0) {
          compilerBOffGrammar -= 1;
          return chatResponse({ ast: { kind: "not_a_rule" } });
        }
      }
      return chatResponse({ ast: SUM_ABOVE_150 });
    }
    await waitForAgent(init?.signal ?? undefined);
    return agentResponse();
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
  resetDealerRuntimeForTests();
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
});

beforeEach(() => {
  resetApiStateForTests();
  armAgentGate();
  jevMode = "ok";
  compilerBOffGrammar = 0;
  compilerBCalls = 0;
  ledgerJevCalls = 0;
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

test("compile phase fails closed before starting a job without an approved interpretation", async () => {
  for (const body of [
    { phase: "compile", text: RULE_TEXT },
    { text: RULE_TEXT },
  ]) {
    const response = await fetch(`${baseUrl}/rule-preflight`, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "POST",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(await response.json(), {
      error: "missing_approved_interpretation",
    });
  }
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

async function runToTerminal(body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/rule-preflight`, {
    body: JSON.stringify(body),
    headers: { accept: "text/event-stream", "content-type": "application/json" },
    method: "POST",
  });
  const job = (await response.json()) as { jobId: string };
  const { frames } = await readFrames(`${baseUrl}/rule-preflight/jobs/${job.jobId}/events`, {
    stopWhen: (frame) => frame.event === "done",
  });
  const terminal = frames.find((frame) => ["failed", "interpretation", "result"].includes(frame.event));
  assert.ok(terminal, "the job must reach a terminal event");
  return { frames, payload: JSON.parse(terminal.data) as Record<string, unknown>, terminal };
}

test("the two-phase flow compiles an approved rule with two agreeing compilers and shows boundary examples", async () => {
  releaseAgent();
  const interpreted = await runToTerminal({ phase: "interpret", text: RULE_TEXT });
  assert.equal(interpreted.terminal.event, "interpretation");
  const interpretation = interpreted.payload.interpretation as {
    claimLedger: { claims: unknown[] } | null;
    needsClarification: boolean;
  };
  assert.equal(interpretation.needsClarification, false);
  assert.equal(interpretation.claimLedger?.claims.length, 1);
  const stages = interpreted.frames
    .filter((frame) => frame.event === "progress")
    .map((frame) => (JSON.parse(frame.data) as { progress: { stage: string } }).progress.stage);
  assert.ok(stages.includes("checking_safety"));
  assert.ok(stages.includes("verifying_reading"));

  assert.equal(ledgerJevCalls, 1);
  const compiled = await runToTerminal({ approvedInterpretation: interpretation, phase: "compile", text: RULE_TEXT });
  assert.equal(compiled.terminal.event, "result");
  // The server's own attestation stands in for the repeated Jev ledger call.
  assert.equal(ledgerJevCalls, 1);
  assert.equal((compiled.payload.preflight as { ledgerVerifiedBy: string }).ledgerVerifiedBy, "attestation");
  const preflight = compiled.payload.preflight as {
    boundaryExamples: { draw: number[]; outcome: string; ticket: number[] }[];
    compiledArtifactHash: string | null;
    decision: string;
    generationRetryable: boolean;
    reasonCodes: string[];
    semanticChecks: { artifact: string | null; ledger: string | null; safety: string | null };
  };
  assert.equal(preflight.decision, "VALID");
  assert.ok(preflight.compiledArtifactHash);
  assert.deepEqual(preflight.reasonCodes, ["SUPPORTED_RULE"]);
  assert.deepEqual(preflight.semanticChecks, { artifact: "candidate_supported", ledger: "LEDGER_VERIFIED", safety: "safe" });
  assert.ok(preflight.boundaryExamples.length >= 2);
  for (const example of preflight.boundaryExamples) {
    const sum = example.ticket.reduce((total, value) => total + value, 0);
    assert.equal(example.outcome, sum > 150 ? "WIN" : "LOSE", `ticket ${example.ticket.join(",")}`);
  }
  assert.ok(preflight.boundaryExamples.some((example) => example.outcome === "WIN"));
  assert.ok(preflight.boundaryExamples.some((example) => example.outcome === "LOSE"));
});

test("a confident Jev unsafe verdict blocks the rule before any approval", async () => {
  releaseAgent();
  jevMode = "unsafe";
  const { payload, terminal } = await runToTerminal({ phase: "interpret", text: RULE_TEXT });
  assert.equal(terminal.event, "failed");
  assert.equal(payload.error, "RULE_SEMANTIC_UNSAFE");
  assert.equal(payload.status, 400);
});

test("a Jev outage fails the rule closed as a retryable unavailability, never as safe", async () => {
  releaseAgent();
  jevMode = "down";
  const { payload, terminal } = await runToTerminal({ phase: "interpret", text: RULE_TEXT });
  assert.equal(terminal.event, "failed");
  assert.equal(payload.error, "RULE_SAFETY_UNAVAILABLE");
  assert.equal(payload.status, 503);
});

test("a tampered approval ledger is re-verified server side and never compiled", async () => {
  releaseAgent();
  const interpreted = await runToTerminal({ phase: "interpret", text: RULE_TEXT });
  const interpretation = interpreted.payload.interpretation as Record<string, unknown>;
  // The client swaps the claim for one that is not in the source text.
  const tampered = {
    ...interpretation,
    claimLedger: {
      claims: [{ dimension: "win_condition", meaning: "Everyone wins.", sourceSpan: "Everyone wins" }],
      openChoices: [],
    },
  };
  const compiled = await runToTerminal({ approvedInterpretation: tampered, phase: "compile", text: RULE_TEXT });
  const preflight = compiled.payload.preflight as { decision: string; generationRetryable: boolean; ledgerVerifiedBy: string; reasonCodes: string[] };
  assert.equal(preflight.decision, "INVALID");
  // The original attestation does not cover the swapped ledger.
  assert.equal(preflight.ledgerVerifiedBy, "jev");
  assert.ok(preflight.reasonCodes.includes("SEMANTIC_CHECK_UNCONFIRMED"));
  // Nothing was compiled, so no compiler schema failure may be reported.
  assert.ok(!preflight.reasonCodes.includes("SCHEMA_INVALID"), preflight.reasonCodes.join(","));
  assert.equal(preflight.generationRetryable, false);
});

test("a compile request that never ran interpret still meets the safety gate", async () => {
  releaseAgent();
  const interpreted = await runToTerminal({ phase: "interpret", text: RULE_TEXT });
  const approval = interpreted.payload.interpretation as Record<string, unknown>;
  // Same text, a well-formed approval, but the checker now judges it unsafe:
  // compile must block rather than trust that interpret already cleared it.
  jevMode = "unsafe";
  const { payload, terminal } = await runToTerminal({ approvedInterpretation: approval, phase: "compile", text: RULE_TEXT });
  assert.equal(terminal.event, "failed");
  assert.equal(payload.error, "RULE_SEMANTIC_UNSAFE");
});

test("a compiler that gives no usable AST is asked once more while the other agrees", async () => {
  releaseAgent();
  const interpreted = await runToTerminal({ phase: "interpret", text: RULE_TEXT });
  const approval = interpreted.payload.interpretation as Record<string, unknown>;
  // Compiler B exhausts its three in-call attempts off-grammar, then the
  // pipeline's single fresh attempt compiles the same rule as A.
  compilerBOffGrammar = 3;
  const compiled = await runToTerminal({ approvedInterpretation: approval, phase: "compile", text: RULE_TEXT });
  const preflight = compiled.payload.preflight as { decision: string; reasonCodes: string[] };
  assert.equal(preflight.decision, "VALID");
  assert.equal(compilerBCalls, 4);
});

test("a compiler that stays off-grammar after its fresh attempt is a retryable disagreement", async () => {
  releaseAgent();
  const interpreted = await runToTerminal({ phase: "interpret", text: RULE_TEXT });
  const approval = interpreted.payload.interpretation as Record<string, unknown>;
  compilerBOffGrammar = 6;
  const compiled = await runToTerminal({ approvedInterpretation: approval, phase: "compile", text: RULE_TEXT });
  const preflight = compiled.payload.preflight as { decision: string; generationRetryable: boolean; reasonCodes: string[] };
  assert.equal(preflight.decision, "INVALID");
  assert.ok(preflight.reasonCodes.includes("PROVIDER_DISAGREEMENT"));
  assert.equal(preflight.generationRetryable, true);
  assert.equal(compilerBCalls, 6);
});

test("an approval without an attestation is re-verified by Jev and still compiles", async () => {
  releaseAgent();
  const interpreted = await runToTerminal({ phase: "interpret", text: RULE_TEXT });
  const approval = { ...(interpreted.payload.interpretation as Record<string, unknown>), claimLedgerAttestation: null };
  ledgerJevCalls = 0;
  const compiled = await runToTerminal({ approvedInterpretation: approval, phase: "compile", text: RULE_TEXT });
  const preflight = compiled.payload.preflight as { claimLedgerAttestation: string | null; decision: string; ledgerVerifiedBy: string };
  assert.equal(preflight.decision, "VALID");
  assert.equal(preflight.ledgerVerifiedBy, "jev");
  assert.equal(ledgerJevCalls, 1);
  // The confirmed ledger comes back attested, so a retry skips the Jev call.
  assert.match(preflight.claimLedgerAttestation ?? "", /^v1\./u);
});
