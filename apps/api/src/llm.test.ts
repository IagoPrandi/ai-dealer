import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { ensureModelLoaded, type RuleAgentConfig } from "./llm.js";

const CONFIG: RuleAgentConfig = {
  apiKey: "",
  baseUrl: "http://localhost:11434/v1",
  model: "gemma4:latest",
  seed: 7,
  timeoutMs: 30_000,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("ensureModelLoaded skips when the endpoint is not Ollama-native", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    calls.push(String(input));
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const result = await ensureModelLoaded("gemma4:latest", CONFIG);

  assert.equal(result.skipped, true);
  assert.equal(result.loaded, false);
  // It probes /api/ps, sees it is not Ollama, and never tries to load.
  assert.deepEqual(calls, ["http://localhost:11434/api/ps"]);
});

test("ensureModelLoaded does not reload an already-resident model", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    calls.push(String(input));
    return new Response(JSON.stringify({ models: [{ name: "gemma4:latest" }] }), {
      status: 200,
    });
  }) as typeof fetch;

  const result = await ensureModelLoaded("gemma4:latest", CONFIG);

  assert.equal(result.loaded, true);
  assert.equal(result.skipped, false);
  assert.deepEqual(calls, ["http://localhost:11434/api/ps"]);
});

test("ensureModelLoaded loads the model when it is not resident", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/ps")) {
      return new Response(JSON.stringify({ models: [] }), { status: 200 });
    }
    return new Response(JSON.stringify({ done: true }), { status: 200 });
  }) as typeof fetch;

  const result = await ensureModelLoaded("gemma4:latest", CONFIG);

  assert.equal(result.loaded, true);
  assert.equal(result.skipped, false);
  assert.deepEqual(calls, [
    "http://localhost:11434/api/ps",
    "http://localhost:11434/api/generate",
  ]);
});
