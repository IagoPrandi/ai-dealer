import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  ensureModelLoaded,
  resolveEscalationModel,
  resolveRuleAgentConfig,
  resolveTranslateToEnglish,
  type RuleAgentConfig,
} from "./llm.js";

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

test("rule agent config ignores inline comments copied from .env examples", () => {
  const env = {
    LLM_API_KEY: "ollama # dummy value",
    LLM_BASE_URL: "http://localhost:11434/v1 # local endpoint",
    LLM_ESCALATION_MODEL: "gemma4:e2b # stronger model",
    LLM_MODEL: "gemma4:latest # primary model",
    LLM_SEED: "7 # deterministic",
    LLM_TIMEOUT_MS: "180000 # slow local model",
    LLM_TRANSLATE_TO_ENGLISH: "false # multilingual model",
  };

  const config = resolveRuleAgentConfig(env);

  assert.equal(config.apiKey, "ollama");
  assert.equal(config.baseUrl, "http://localhost:11434/v1");
  assert.equal(config.model, "gemma4:latest");
  assert.equal(config.seed, 7);
  assert.equal(config.timeoutMs, 180_000);
  assert.equal(resolveEscalationModel(env), "gemma4:e2b");
  assert.equal(resolveTranslateToEnglish(env), false);
});
