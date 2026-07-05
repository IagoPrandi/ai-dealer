import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  compileRuleToAst,
  ensureModelLoaded,
  interpretRuleWithAgent,
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

test("interpret harness teaches predicate min/max and casual threshold cases", async () => {
  let systemPrompt = "";
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: string; role: string }>;
    };
    systemPrompt = body.messages[0]?.content ?? "";
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                addedOperationalClauses: [],
                clarityNote: "",
                dealerMessage: "Compiled as a predicate.",
                needsClarification: false,
                normalizedText:
                  "A guess wins if the smallest guessed number equals the smallest drawn number.",
                officialInterpretation:
                  "A guess wins if min(guess) equals min(draw).",
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  await interpretRuleWithAgent(
    "Win if the smallest guessed number equals the smallest drawn number.",
    CONFIG,
  );

  assert.match(systemPrompt, /'win if' means an absolute predicate/i);
  assert.match(systemPrompt, /min\(guess\) == min\(draw\)/i);
  assert.match(systemPrompt, /max\(guess\) > max\(draw\)/i);
  assert.match(systemPrompt, /four or more picked numbers show up/i);
  assert.match(systemPrompt, /second guessed number equals/i);
  assert.match(systemPrompt, /absolute difference/i);
  assert.match(systemPrompt, /exactly 2 guessed numbers/i);
  assert.match(systemPrompt, /total absolute\s+position-by-position difference/i);
  assert.match(systemPrompt, /same last digit/i);
  assert.match(systemPrompt, /two smallest\/largest/i);
  assert.match(systemPrompt, /match the\s+draw in reverse/i);
});

test("compile harness prompt includes selected prompt-set examples", async () => {
  let systemPrompt = "";
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: string; role: string }>;
    };
    systemPrompt = body.messages[0]?.content ?? "";
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                result: {
                  predicate: {
                    kind: "count_at_least",
                    of: {
                      kind: "intersection",
                      left: { kind: "source", source: "guess" },
                      right: { kind: "source", source: "draw" },
                    },
                    value: 4,
                  },
                  type: "predicate",
                },
                schemaVersion: 2,
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  await compileRuleToAst(
    "I want the win to go to guesses where four or more picked numbers show up in the result.",
    CONFIG,
  );

  assert.match(systemPrompt, /guessed sum is greater than the drawn sum/i);
  assert.match(systemPrompt, /smallest guessed number equals the smallest drawn number/i);
  assert.match(systemPrompt, /largest guessed number is greater than the largest drawn number/i);
  assert.match(systemPrompt, /four or more of my picked numbers show up/i);
  assert.match(systemPrompt, /second guessed number equals second drawn number/i);
  // v3 compositional core: pairwise zips, quantifiers, and the novel-rule idioms.
  assert.match(systemPrompt, /"schemaVersion":3/);
  assert.match(systemPrompt, /pairs_forall/);
  assert.match(systemPrompt, /pairs_map/);
  assert.match(systemPrompt, /"kind":"filter"/);
  assert.match(systemPrompt, /"kind":"ite"/);
  assert.match(systemPrompt, /Shifted zip/i);
  assert.match(systemPrompt, /below-50 split/i);
  assert.match(systemPrompt, /"up":1/);
  assert.match(systemPrompt, /sum\(guess\) mod 10/i);
});
