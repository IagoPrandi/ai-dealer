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

test("ensureModelLoaded does not confuse explicit tags from the same model family", async () => {
  const calls: string[] = [];
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const url = String(input);
    calls.push(url);
    if (url.endsWith("/api/ps")) {
      return new Response(JSON.stringify({ models: [{ name: "gemma4:e2b" }] }), {
        status: 200,
      });
    }
    const body = JSON.parse(String(init?.body)) as { model?: string };
    assert.equal(body.model, "gemma4:latest");
    return new Response(JSON.stringify({ done: true }), { status: 200 });
  }) as typeof fetch;

  const result = await ensureModelLoaded("gemma4:latest", CONFIG);

  assert.equal(result.loaded, true);
  assert.deepEqual(calls, [
    "http://localhost:11434/api/ps",
    "http://localhost:11434/api/generate",
  ]);
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

test("ensureModelLoaded propagates an already-aborted external signal", async () => {
  const controller = new AbortController();
  controller.abort(new DOMException("cancelled", "AbortError"));
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    assert.equal(init?.signal?.aborted, true);
    throw init?.signal?.reason;
  }) as typeof fetch;

  await assert.rejects(
    ensureModelLoaded("gemma4:latest", CONFIG, 180_000, controller.signal),
    (error: unknown) => error instanceof Error && error.name === "AbortError",
  );
});

test("rule agent config ignores inline comments copied from .env examples", () => {
  const env = {
    LLM_API_KEY: "ollama # dummy value",
    LLM_BASE_URL: "http://localhost:11434/v1 # local endpoint",
    LLM_ESCALATION_MODEL: "gemma4:e2b # stronger model",
    LLM_MODEL: "gemma4:latest # primary model",
    LLM_SEED: "7 # deterministic",
    LLM_TIMEOUT_MS: "300000 # slow local model",
    LLM_TRANSLATE_TO_ENGLISH: "false # multilingual model",
  };

  const config = resolveRuleAgentConfig(env);

  assert.equal(config.apiKey, "ollama");
  assert.equal(config.baseUrl, "http://localhost:11434/v1");
  assert.equal(config.model, "gemma4:latest");
  assert.equal(config.seed, 7);
  assert.equal(config.timeoutMs, 300_000);
  assert.equal(resolveEscalationModel(env), "gemma4:e2b");
  assert.equal(resolveTranslateToEnglish(env), false);
});

test("rule agent config enforces a five-minute minimum timeout", () => {
  const config = resolveRuleAgentConfig({
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "gemma4:latest",
    LLM_TIMEOUT_MS: "45000",
  });

  assert.equal(config.timeoutMs, 300_000);
});

test("interpret harness teaches predicate min/max and casual threshold cases", async () => {
  let systemPrompt = "";
  let requestBody: Record<string, unknown> = {};
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: string; role: string }>;
    };
    requestBody = body;
    systemPrompt = body.messages[0]?.content ?? "";
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                addedOperationalClauses: [],
                clarificationQuestions: [],
                clarityNote: "",
                dealerMessage: "Compiled as a predicate.",
                needsClarification: false,
                normalizedText:
                  "A guess wins if the smallest guessed number equals the smallest drawn number.",
                officialInterpretation:
                  "A guess wins if min(guess) equals min(draw).",
                suggestedRewrites: [],
                title: "Matching Minimums",
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
  assert.match(systemPrompt, /concise 2-6 word English UI title/i);
  assert.match(systemPrompt, /normalizedText: the rule rewritten in clear English/i);
  assert.match(systemPrompt, /quantity\/comparator, property being compared/i);
  assert.match(systemPrompt, /never offer stock examples, generic match-count rules/i);
  assert.match(systemPrompt, /draw 12 31 24 versus guess 11 30 29/i);
  assert.equal(requestBody.reasoning_effort, "none");
  assert.equal(requestBody.max_tokens, 2_048);

  await interpretRuleWithAgent(
    "Win if the smallest number matches.",
    {
      ...CONFIG,
      apiKey: "cloud-key",
      baseUrl: "https://api.openai.example/v1",
    },
  );
  assert.equal("reasoning_effort" in requestBody, false);
});

test("rule agent responses without a title fail closed", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                addedOperationalClauses: [],
                clarificationQuestions: [],
                clarityNote: "",
                dealerMessage: "Compiled as a predicate.",
                needsClarification: false,
                normalizedText: "A guess wins if one number matches.",
                officialInterpretation: "Compare the six guess numbers with the draw.",
                suggestedRewrites: [],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  await assert.rejects(
    interpretRuleWithAgent("Win if one number matches.", CONFIG),
    /omitted the title/i,
  );
});

test("rule agent responses without structured clarification arrays fail closed", async () => {
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                addedOperationalClauses: [],
                clarityNote: "A threshold is missing.",
                dealerMessage: "Please clarify the threshold.",
                needsClarification: true,
                normalizedText: "A guess wins if it is close to the draw.",
                officialInterpretation:
                  "The exact distance threshold has not been defined.",
                title: "Distance Needs Detail",
              }),
            },
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  await assert.rejects(
    interpretRuleWithAgent("Win if my guess is close to the draw.", CONFIG),
    /must return clarificationQuestions/i,
  );
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
