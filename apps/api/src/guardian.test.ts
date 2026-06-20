import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  checkGroundedness,
  isClearlyGroundedRuleInterpretation,
  resolveGuardianConfig,
  type GuardianConfig,
} from "./guardian.js";

const GUARDIAN_CONFIG: GuardianConfig = {
  apiKey: "",
  chatUrl: "http://localhost:11434/api/chat",
  enabled: true,
  model: "guardian",
  timeoutMs: 30_000,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("accepts an equivalent at-least-N match interpretation without guardian scoring", async () => {
  globalThis.fetch = (async () => {
    throw new Error("guardian should not be called for a clear equivalent rule");
  }) as typeof fetch;

  const grounded = await checkGroundedness(
    "Win if at least 4 of your numbers appear in the draw.",
    "Compare every eligible guess by counting how many of its numbers appear in the draw; a guess wins when at least four match.",
    GUARDIAN_CONFIG,
  );

  assert.equal(grounded, true);
});

test("does not treat a changed match threshold as clearly grounded", () => {
  assert.equal(
    isClearlyGroundedRuleInterpretation(
      "Win if at least 4 of your numbers appear in the draw.",
      "A guess wins when at least five of its numbers appear in the draw.",
    ),
    false,
  );
});

test("guardian config ignores inline comments copied from .env examples", () => {
  const config = resolveGuardianConfig({
    LLM_API_KEY: "ollama # dummy value",
    LLM_BASE_URL: "http://localhost:11434/v1 # local endpoint",
    LLM_GUARDIAN_MODEL: "granite4.1-guardian:8b # guard model",
    LLM_GUARDIAN_TIMEOUT_MS: "120000 # slow local model",
  });

  assert.equal(config.apiKey, "ollama");
  assert.equal(config.chatUrl, "http://localhost:11434/api/chat");
  assert.equal(config.enabled, true);
  assert.equal(config.model, "granite4.1-guardian:8b");
  assert.equal(config.timeoutMs, 120_000);
});
