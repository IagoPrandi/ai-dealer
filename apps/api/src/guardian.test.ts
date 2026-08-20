import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  checkGroundedness,
  detectJailbreak,
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

test("accepts equivalent Portuguese match-count variations without guardian scoring", async () => {
  globalThis.fetch = (async () => {
    throw new Error("guardian should not be called for a clear equivalent rule");
  }) as typeof fetch;

  const cases = [
    [
      "Premia quem acertar 1 número em qualquer ordem.",
      "A guess wins if at least 1 of its numbers appear in the official draw, regardless of order.",
    ],
    [
      "Ganha quem acertar pelo menos um numero.",
      "A guess wins if at least one of its numbers appear in the official draw.",
    ],
    [
      "Vence com dois ou mais acertos.",
      "A guess wins if at least 2 of its numbers appear in the official draw.",
    ],
    [
      "Se tiver um acerto ganha.",
      "A guess wins if at least one number matches the official draw.",
    ],
    [
      "Um numero certo em qualquer ordem ganha.",
      "A guess wins if at least one number appears in the official draw.",
    ],
  ] as const;

  for (const [rule, interpretation] of cases) {
    assert.equal(await checkGroundedness(rule, interpretation, GUARDIAN_CONFIG), true, rule);
  }
});

test("does not treat a changed match threshold as clearly grounded", () => {
  assert.equal(
    isClearlyGroundedRuleInterpretation(
      "Win if at least 4 of your numbers appear in the draw.",
      "A guess wins when at least five of its numbers appear in the draw.",
    ),
    false,
  );
  assert.equal(
    isClearlyGroundedRuleInterpretation(
      "Premia quem acertar 1 número em qualquer ordem.",
      "A guess wins if at least 2 of its numbers appear in the official draw, regardless of order.",
    ),
    false,
  );
  assert.equal(
    isClearlyGroundedRuleInterpretation(
      "Vence com dois ou mais acertos.",
      "A guess wins if at least 3 of its numbers appear in the official draw.",
    ),
    false,
  );
  assert.equal(
    isClearlyGroundedRuleInterpretation(
      "Exatamente um numero acertado ganha.",
      "A guess wins if at least 1 of its numbers appear in the official draw.",
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

test("the guardrail is decoded greedily, never sampled", async () => {
  // A yes/no risk classifier must not be sampled. Ollama applies the model's own
  // default temperature when a request carries no `options` at all, which made
  // the verdict a coin flip in BOTH directions: measured on
  // granite4.1-guardian:8b, a real injection was caught only 6/10 times and a
  // legitimate Portuguese rule was blocked 7/10 times.
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({ message: { content: "<score>no</score>" } }),
      { status: 200 },
    );
  }) as typeof fetch;

  await detectJailbreak(
    "A guess wins if the guessed sum is odd.",
    GUARDIAN_CONFIG,
  );

  const options = bodies[0]?.options as Record<string, unknown> | undefined;
  assert.equal(options?.temperature, 0);
  assert.equal(options?.top_k, 1);
  assert.equal(options?.top_p, 1);
  assert.equal(typeof options?.seed, "number");
});
