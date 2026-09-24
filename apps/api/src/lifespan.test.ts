import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  DEALER_MODEL_READY_TTL_MS,
  ensureDealerModelReady,
  ensureJevAliasVerified,
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
  process.env.LLM_MODEL_COMPILE_B = "compiler-b:first";
  process.env.LLM_TRANSLATE_TO_ENGLISH = "false";
  process.env.LLM_API_KEY = "test-key";
  process.env.JEV_ENDPOINT = "http://localhost:9/decisions";
  delete process.env.JEV_EXPECTED_MODEL;
  delete process.env.TYCHE_RULE_ARTIFACT_VETO;
}

function jevAnswer(model: string) {
  return new Response(
    JSON.stringify({
      answers: { alias_check: { noul: 0.99, type: "noul" } },
      model,
      usage: { cost: 0.00001, input_tokens: 10, output_tokens: 1 },
    }),
    { status: 200 },
  );
}

afterEach(async () => {
  globalThis.fetch = originalFetch;
  process.env = { ...originalEnv };
  await resetLifespanForTests();
});

test("dealer runtime configuration is resolved once per process", () => {
  configureDealer("dealer:first");
  process.env.LLM_MODEL_COMPILE = "compiler:first";

  const first = getDealerRuntime();
  process.env.LLM_MODEL = "dealer:changed";
  process.env.LLM_MODEL_COMPILE = "compiler:changed";
  process.env.LLM_MODEL_COMPILE_B = "compiler-b:changed";
  const second = getDealerRuntime();

  assert.equal(first, second);
  assert.equal(second.agent.model, "dealer:first");
  assert.equal(second.compiler.model, "compiler:first");
  assert.equal(second.compilerSecondary.model, "compiler-b:first");
  assert.equal(second.artifactVeto, "strict");
  assert.equal(second.jev.model, "~typesafe/jev-latest");
  assert.equal(second.translateToEnglish, false);
});

test("the pipeline refuses to run without two different compilers or a valid veto mode", () => {
  for (const [key, value, pattern] of [
    ["LLM_MODEL_COMPILE_B", "", /LLM_MODEL_COMPILE_B/u],
    ["LLM_MODEL_COMPILE_B", "dealer:first", /different model/u],
    ["TYCHE_RULE_ARTIFACT_VETO", "lenient", /strict or confident_negative/u],
  ] as const) {
    configureDealer();
    process.env[key] = value;
    resetDealerRuntimeForTests();
    assert.throws(() => getDealerRuntime(), pattern, `${key}=${value}`);
  }
  configureDealer();
  process.env.TYCHE_RULE_ARTIFACT_VETO = "confident_negative";
  resetDealerRuntimeForTests();
  assert.equal(getDealerRuntime().artifactVeto, "confident_negative");
});

test("the Jev alias check caches a verified model and never caches a failure", async () => {
  configureDealer();
  const models = ["typesafe/jev-9.99", "typesafe/jev-1.13-20260917"];
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return jevAnswer(models.shift() ?? "typesafe/jev-1.13-20260917");
  }) as typeof fetch;

  await assert.rejects(ensureJevAliasVerified(undefined, 1_000), /JEV_MODEL_DRIFT|resolved to typesafe\/jev-9\.99/u);
  assert.equal(await ensureJevAliasVerified(undefined, 2_000), "typesafe/jev-1.13-20260917");
  await ensureJevAliasVerified(undefined, 2_000 + DEALER_MODEL_READY_TTL_MS - 1);
  assert.equal(calls, 2);
  await ensureJevAliasVerified(undefined, 2_000 + DEALER_MODEL_READY_TTL_MS);
  assert.equal(calls, 3);
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
