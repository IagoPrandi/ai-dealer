import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  DEALER_MODEL_READY_TTL_MS,
  ensureDealerModelReady,
  getDealerRuntime,
  resetDealerRuntimeForTests,
  resetLifespanForTests,
  runShutdown,
  trackRequest,
} from "./lifespan.js";

const originalEnv = { ...process.env };
const originalFetch = globalThis.fetch;

function configureDealer(model = "dealer:first") {
  process.env.LLM_BASE_URL = "http://localhost:11434/v1";
  process.env.LLM_MODEL = model;
  process.env.LLM_TRANSLATE_TO_ENGLISH = "false";
  delete process.env.LLM_GUARDIAN_MODEL;
}

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  await resetLifespanForTests();
});

test("dealer runtime configuration is resolved once per process", () => {
  configureDealer("dealer:first");
  process.env.LLM_MODEL_COMPILE = "compiler:first";
  process.env.LLM_MODEL_REVIEW = "reviewer:first";

  const first = getDealerRuntime();
  process.env.LLM_MODEL = "dealer:changed";
  process.env.LLM_MODEL_COMPILE = "compiler:changed";
  process.env.LLM_MODEL_REVIEW = "reviewer:changed";
  const second = getDealerRuntime();

  assert.equal(first, second);
  assert.equal(second.agent.model, "dealer:first");
  assert.equal(second.compiler.model, "compiler:first");
  assert.equal(second.reviewer.model, "reviewer:first");
  assert.equal(second.translateToEnglish, false);
});

test("dealer runtime memoizes configuration errors without failing module startup", () => {
  delete process.env.LLM_BASE_URL;
  delete process.env.LLM_PRIMARY_BASE_URL;
  delete process.env.LLM_MODEL;
  resetDealerRuntimeForTests();

  let firstError: unknown;
  assert.throws(
    () => getDealerRuntime(),
    (error: unknown) => {
      firstError = error;
      return (
        error instanceof Error &&
        "code" in error &&
        error.code === "RULE_AGENT_NOT_CONFIGURED"
      );
    },
  );

  configureDealer();
  assert.throws(
    () => getDealerRuntime(),
    (error: unknown) => error === firstError,
  );
});

test("model readiness skips probes inside the TTL and probes again after it", async () => {
  configureDealer();
  const calls: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    calls.push(String(input));
    return new Response(
      JSON.stringify({ models: [{ name: "dealer:first" }] }),
      { status: 200 },
    );
  }) as typeof fetch;

  await ensureDealerModelReady("dealer:first", undefined, 1_000);
  await ensureDealerModelReady(
    "dealer:first",
    undefined,
    1_000 + DEALER_MODEL_READY_TTL_MS - 1,
  );
  await ensureDealerModelReady(
    "dealer:first",
    undefined,
    1_000 + DEALER_MODEL_READY_TTL_MS,
  );

  assert.deepEqual(calls, [
    "http://localhost:11434/api/ps",
    "http://localhost:11434/api/ps",
  ]);
});

test("shutdown aborts every tracked request controller", async () => {
  const first = new AbortController();
  const second = new AbortController();
  trackRequest(first);
  trackRequest(second);

  assert.equal(first.signal.aborted, false);
  assert.equal(second.signal.aborted, false);

  await runShutdown();

  assert.equal(first.signal.aborted, true);
  assert.equal(second.signal.aborted, true);
});
