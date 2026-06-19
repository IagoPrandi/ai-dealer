import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  checkGroundedness,
  isClearlyGroundedRuleInterpretation,
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
