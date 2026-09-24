import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import {
  JEV_DEFAULT_EXPECTED_MODEL,
  JevError,
  noulBand,
  requestJevJudgment,
  resolveJevConfig,
  type JevConfig,
  type JevQuestionSet,
} from "./jev.js";
import { captureAiRun } from "./usage.js";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

const CONFIG: JevConfig = {
  apiKey: "test-key",
  endpoint: "http://jev.test/decisions",
  expectedModel: JEV_DEFAULT_EXPECTED_MODEL,
  model: "~typesafe/jev-latest",
  timeoutMs: 5_000,
};

const QUESTIONS: JevQuestionSet = {
  q: { criteria: { false: "No.", true: "Yes." }, instructions: "Is `text` a word?", type: "noul" },
};

function answer(model = JEV_DEFAULT_EXPECTED_MODEL, noul: unknown = 0.9) {
  return new Response(
    JSON.stringify({ answers: { q: { noul, type: "noul" } }, model, usage: { cost: 0.0001, input_tokens: 50, output_tokens: 2 } }),
    { status: 200 },
  );
}

function stub(responses: Array<(() => Response) | Error>) {
  let calls = 0;
  globalThis.fetch = (async () => {
    const next = responses[Math.min(calls, responses.length - 1)]!;
    calls += 1;
    if (next instanceof Error) throw next;
    return next();
  }) as typeof fetch;
  return () => calls;
}

const ask = () => requestJevJudgment({ config: CONFIG, questions: QUESTIONS, state: { text: "ping" }, step: "semantic_check" });

test("a valid judgment on the pinned model is returned and its usage recorded", async () => {
  stub([() => answer()]);
  const { report, result } = await captureAiRun("rule_preflight", ask);
  assert.equal(result.answers.q?.type, "noul");
  assert.equal(report.totals.callCount, 1);
  assert.equal(report.calls[0]?.step, "semantic_check");
  assert.equal(report.calls[0]?.costUsd, 0.0001);
});

test("a different resolved model is drift, never a judgment", async () => {
  const calls = stub([() => answer("typesafe/jev-2.0")]);
  await assert.rejects(ask(), (error: unknown) => error instanceof JevError && error.code === "JEV_MODEL_DRIFT");
  assert.equal(calls(), 1);
});

test("a malformed answer fails closed and is not retried", async () => {
  const calls = stub([() => answer(JEV_DEFAULT_EXPECTED_MODEL, 1.5)]);
  await assert.rejects(ask(), (error: unknown) => error instanceof JevError && error.code === "JEV_BAD_RESPONSE");
  assert.equal(calls(), 1);
});

test("one transport retry on 429, 5xx or an unreachable endpoint; none on other HTTP errors", async () => {
  for (const first of [() => new Response("slow down", { status: 429 }), () => new Response("oops", { status: 502 }), new Error("socket hang up")]) {
    const calls = stub([first, () => answer()]);
    const result = await ask();
    assert.equal(result.model, JEV_DEFAULT_EXPECTED_MODEL);
    assert.equal(calls(), 2);
  }
  const persistent = stub([() => new Response("oops", { status: 503 })]);
  await assert.rejects(ask(), (error: unknown) => error instanceof JevError && error.code === "JEV_UNAVAILABLE" && error.status === 503);
  assert.equal(persistent(), 2);
  const badRequest = stub([() => new Response("bad model", { status: 400 })]);
  await assert.rejects(ask(), (error: unknown) => error instanceof JevError && error.status === 400);
  assert.equal(badRequest(), 1);
  const forbidden = stub([() => new Response("no", { status: 401 })]);
  await assert.rejects(ask(), (error: unknown) => error instanceof JevError && error.code === "JEV_NOT_CONFIGURED");
  assert.equal(forbidden(), 1);
});

test("configuration fails closed without a key or with an unusable timeout", () => {
  assert.throws(() => resolveJevConfig({} as NodeJS.ProcessEnv), (error: unknown) => error instanceof JevError && error.code === "JEV_NOT_CONFIGURED");
  const config = resolveJevConfig({ API_KEY_OPENROUTER: "sk-or" } as NodeJS.ProcessEnv);
  assert.equal(config.endpoint, "https://openrouter.ai/api/alpha/decisions");
  assert.equal(config.apiKey, "sk-or");
  assert.equal(config.model, "~typesafe/jev-latest");
  assert.throws(() => resolveJevConfig({ API_KEY_OPENROUTER: "sk-or", JEV_TIMEOUT_MS: "fast" } as NodeJS.ProcessEnv), /JEV_TIMEOUT_MS/u);
});

test("Noul bands: confident yes, confident no, and an explicit uncertain middle", () => {
  assert.equal(noulBand(0.8), "yes");
  assert.equal(noulBand(0.79), "uncertain");
  assert.equal(noulBand(0.5), "uncertain");
  assert.equal(noulBand(0.21), "uncertain");
  assert.equal(noulBand(0.2), "no");
});
