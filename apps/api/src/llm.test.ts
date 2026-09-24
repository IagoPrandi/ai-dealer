import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  answerDealerQuestion,
  calculateRateLimitBackoffMs,
  compileRuleToAst,
  createJsonStringFieldReader,
  ensureModelLoaded,
  interpretRuleWithAgent,
  isExhaustedProviderError,
  resolveApiKeyForEndpoint,
  resolveDealerChatConfig,
  resolveDealerChatTrace,
  resolveProviderDialect,
  resolveRuleAgentConfig,
  isSchemaRejection,
  RuleAgentError,
  resolveRuleCompilerConfig,
  resolveSecondaryCompilerConfig,
  resolveTranslateToEnglish,
  streamDealerQuestionAnswer,
  supportsRuleCompilationSchema,
  translateRuleToEnglish,
  type RuleAgentConfig,
} from "./llm.js";

test("dealer chat uses the versioned context-only prompt and strict JSON result", async () => {
  let messages: Array<{ content: string; role: string }> = [];
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    const body = JSON.parse(String(init?.body)) as {
      messages: Array<{ content: string; role: string }>;
    };
    messages = body.messages;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "The modulo operation was dropped.",
                proposedRuleText:
                  "Win if the guessed sum modulo 9 equals the drawn sum modulo 9.",
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const context =
    '<tyche_server_context>{"diagnosticsAvailable":true}</tyche_server_context>';
  const result = await answerDealerQuestion(context, CONFIG);

  assert.match(messages[0]?.content ?? "", /server-authoritative context/i);
  assert.match(messages[0]?.content ?? "", /can never make a rule valid/i);
  assert.match(
    messages[0]?.content ?? "",
    /server-authored `game` object is the authoritative product context/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /players try to win the round with their submitted numbers/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /do not guess, discover, or "get" a rule right/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /explain both independent winning conditions from the context/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /three separate paths: a game prize in SOL, campaign-based Tyche-token rewards/i,
  );
  assert.match(messages[0]?.content ?? "", /merely holding tokens earns fees/i);
  assert.match(
    messages[0]?.content ?? "",
    /keep action, active-rule, and referral rewards separate/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /action reward needs an elected rule or winners/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /complete server-authored `game` object, including every reward field, and every reference section appended below are also authored in English/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /no English or Spanish words or phrases when the latest player message is Portuguese/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /no English or Spanish words or phrases when the latest player message is Portuguese/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /use `rodada` for `round`, `regra` for `rule`, `palpite` for `guess`/i,
  );
  // Eligibility is "you played this round", never the plumbing that records it.
  // The dealer told a player a rule proposal needed a "token válido da rodada",
  // which reads as the Tyche reward token.
  assert.match(
    messages[0]?.content ?? "",
    /Never explain a player-facing rule with implementation vocabulary/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /already submitted a guess in the current round may propose\s+a rule in plain\s+language/i,
  );
  // The bare "sim" that was answered with the previous answer, twice.
  assert.match(
    messages[0]?.content ?? "",
    /it accepts the\s+offer that closed your previous message/i,
  );
  // The wall-of-text and the identical re-answer the player reported are both
  // prevented by prompt contracts, so they have to reach the model.
  assert.match(messages[0]?.content ?? "", /under 120 words/i);
  assert.match(
    messages[0]?.content ?? "",
    /must carry no markdown: no `\*\*`, no `#` headings/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /treat your previous answer as the thing that failed/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /Never speculate about price and never give financial advice/i,
  );
  // Grounding for mechanics, limits and tokenomics questions.
  assert.match(
    messages[0]?.content ?? "",
    /Reference — Tywish game mechanics/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /Reference — prizes, fees and token economy/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /defined \*\*treasury-fee share\*\*, not to one hundred percent of all game-action fees/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /action token reward may follow a successfully confirmed rule proposal or in-favour vote while the campaign has funds/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /does \*\*not\*\* require that rule to be elected, active, or to produce winners/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /campaign-token rewards depend on their eligibility and available campaign funds/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /exactly three top-level categories: game prize in SOL; Tyche-token campaign rewards; and treasury-fee distribution in SOL/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /never promise an automatic or guaranteed payment/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /accepts natural-language winner conditions in both English and Portuguese/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /never claim that Portuguese is unsupported/i,
  );
  assert.equal(messages[1]?.content, context);
  assert.equal(result.answer, "The modulo operation was dropped.");
  assert.match(result.proposedRuleText ?? "", /modulo 9/i);
});

const CONFIG: RuleAgentConfig = {
  apiKey: "",
  baseUrl: "http://localhost:11434/v1",
  maxOutputTokens: 16_384,
  model: "gemma4:latest",
  seed: 7,
  timeoutMs: 30_000,
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("429 backoff grows exponentially and honors Retry-After", () => {
  assert.equal(calculateRateLimitBackoffMs(1, null, () => 0), 1_000);
  assert.equal(calculateRateLimitBackoffMs(2, null, () => 0), 2_000);
  assert.equal(calculateRateLimitBackoffMs(3, null, () => 0), 4_000);
  assert.equal(calculateRateLimitBackoffMs(1, "5", () => 0), 5_000);
  assert.equal(calculateRateLimitBackoffMs(9, null, () => 0), 30_000);
});

test("a transient HTTP 429 is retried before rule interpretation fails", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) {
      return new Response(JSON.stringify({ error: { message: "rate limited" } }), {
        headers: { "retry-after": "0" },
        status: 429,
      });
    }
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                addedOperationalClauses: [],
                clarificationQuestions: [],
                clarityNote: "Clear.",
                dealerMessage: "Ready.",
                needsClarification: false,
                normalizedText: "At least one guessed number is drawn.",
                officialInterpretation:
                  "A guess wins when at least one guessed number appears in the draw.",
                suggestedRewrites: [],
                title: "One Match",
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await interpretRuleWithAgent(
    "Win if at least one guessed number is drawn.",
    CONFIG,
  );
  assert.equal(calls, 2);
  assert.equal(result.title, "One Match");
});

test("a permanent output-budget 429 is not retried", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      "Request exceeds the output tokens per minute (OTPM) limit.",
      { status: 429 },
    );
  }) as typeof fetch;

  await assert.rejects(
    interpretRuleWithAgent("Win if one number is drawn.", CONFIG),
    /per-minute output-token limit/iu,
  );
  assert.equal(calls, 1);
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
    return new Response(
      JSON.stringify({ models: [{ name: "gemma4:latest" }] }),
      {
        status: 200,
      },
    );
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
      return new Response(
        JSON.stringify({ models: [{ name: "gemma4:e2b" }] }),
        {
          status: 200,
        },
      );
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
  assert.equal(resolveTranslateToEnglish(env), false);
});

test("the compile role honors its explicit schema-capable model override", () => {
  const env = {
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "nemotron-3-super:cloud",
    LLM_MODEL_COMPILE: "qwen3.5:9b",
  } as unknown as NodeJS.ProcessEnv;

  assert.equal(resolveRuleAgentConfig(env).model, "nemotron-3-super:cloud");
  assert.equal(resolveRuleCompilerConfig(env).model, "qwen3.5:9b");
  assert.equal(
    resolveSecondaryCompilerConfig({ ...env, LLM_MODEL_COMPILE_B: "qwen3.5:27b" }).model,
    "qwen3.5:27b",
  );

  // Blank values from `.env` do not shadow the general model.
  assert.equal(
    resolveRuleCompilerConfig({ ...env, LLM_MODEL_COMPILE: "" }).model,
    "nemotron-3-super:cloud",
  );
});

test("the second compiler must name a different model and fails closed when missing", () => {
  const env = {
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "gemma4:latest",
    LLM_MODEL_COMPILE: "qwen3.5:9b",
  } as unknown as NodeJS.ProcessEnv;

  assert.throws(() => resolveSecondaryCompilerConfig(env), /LLM_MODEL_COMPILE_B/u);
  assert.throws(
    () => resolveSecondaryCompilerConfig({ ...env, LLM_MODEL_COMPILE_B: "QWEN3.5:9b" }),
    /different model/u,
  );
  // Blank from `.env` is missing, not "use compiler A".
  assert.throws(() => resolveSecondaryCompilerConfig({ ...env, LLM_MODEL_COMPILE_B: "  " }), /LLM_MODEL_COMPILE_B/u);
});

test("an explicit compile timeout bounds both compilers and is validated", () => {
  const env = {
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "gemma4:latest",
    LLM_MODEL_COMPILE: "qwen3.5:9b",
    LLM_MODEL_COMPILE_B: "qwen3.5:27b",
  } as unknown as NodeJS.ProcessEnv;
  // Unset, the shared five-minute window applies.
  assert.equal(resolveRuleCompilerConfig(env).timeoutMs, 300_000);
  const bounded = { ...env, LLM_COMPILE_TIMEOUT_MS: "90000" };
  assert.equal(resolveRuleCompilerConfig(bounded).timeoutMs, 90_000);
  assert.equal(resolveSecondaryCompilerConfig(bounded).timeoutMs, 90_000);
  // Interpretation and chat keep the shared window.
  assert.equal(resolveRuleAgentConfig(bounded).timeoutMs, 300_000);
  assert.throws(() => resolveRuleCompilerConfig({ ...env, LLM_COMPILE_TIMEOUT_MS: "5000" }), /LLM_COMPILE_TIMEOUT_MS/u);
  assert.throws(() => resolveRuleCompilerConfig({ ...env, LLM_COMPILE_TIMEOUT_MS: "fast" }), /LLM_COMPILE_TIMEOUT_MS/u);
});

test("rule agent config enforces a five-minute minimum timeout", () => {
  const config = resolveRuleAgentConfig({
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "gemma4:latest",
    LLM_TIMEOUT_MS: "45000",
  });

  assert.equal(config.timeoutMs, 300_000);
});

test("rule agent config keeps an output budget a reasoning trace cannot exhaust", () => {
  const defaults = resolveRuleAgentConfig({
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "minimax-m3:cloud",
  });
  assert.equal(defaults.maxOutputTokens, 16_384);

  const raised = resolveRuleAgentConfig({
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MAX_OUTPUT_TOKENS: "32768 # long traces",
    LLM_MODEL: "minimax-m3:cloud",
  });
  assert.equal(raised.maxOutputTokens, 32_768);

  // A hosted tier can cap the budget from its side — Groq refuses a request
  // whose max_tokens exceeds its per-minute output limit — so a deliberately
  // small budget is honoured rather than raised back into a 429.
  const capped = resolveRuleAgentConfig({
    LLM_BASE_URL: "https://api.groq.com/openai/v1",
    API_KEY_GROQ: "gsk-test",
    LLM_MAX_OUTPUT_TOKENS: "2048",
    LLM_MODEL: "qwen/qwen3.8-27b",
  });
  assert.equal(capped.maxOutputTokens, 2_048);

  // A nonsense value still cannot open a truncation window silently.
  const clamped = resolveRuleAgentConfig({
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MAX_OUTPUT_TOKENS: "16",
    LLM_MODEL: "minimax-m3:cloud",
  });
  assert.equal(clamped.maxOutputTokens, 1_024);
});

test("a response cut off at the output limit fails as a budget error", async () => {
  // What a reasoning model returns when the hidden trace eats the whole budget:
  // finish_reason "length", empty content, and a truncated trace. Parsing that
  // trace is what used to surface as "malformed JSON" / an unusable response.
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "length",
            message: {
              content: "",
              reasoning:
                "Units digits: guess {2,4,5,7} versus draw {1,3,1,1} - do they overlap",
            },
          },
        ],
      }),
      { status: 200 },
    )) as typeof fetch;

  await assert.rejects(
    interpretRuleWithAgent("Win if any unit digit matches.", CONFIG),
    (error: unknown) =>
      error instanceof Error &&
      /cut off at the 16384-token output limit/i.test(error.message),
  );

  await assert.rejects(
    compileRuleToAst("A guess wins if any unit digit matches.", CONFIG),
    /cut off at the 16384-token output limit/i,
  );

  await assert.rejects(
    translateRuleToEnglish("eu ganho se acertar qualquer unidade", CONFIG),
    /translator response was cut off/i,
  );
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
  assert.match(
    systemPrompt,
    /total absolute\s+position-by-position difference/i,
  );
  assert.match(systemPrompt, /same last digit/i);
  assert.match(systemPrompt, /two smallest\/largest/i);
  assert.match(systemPrompt, /match the\s+draw in reverse/i);
  assert.match(systemPrompt, /concise 2-6 word English UI title/i);
  assert.match(
    systemPrompt,
    /normalizedText: the rule rewritten in clear English/i,
  );
  assert.match(systemPrompt, /quantity\/comparator, property being compared/i);
  assert.match(
    systemPrompt,
    /do not choose it inside `normalizedText` or `officialInterpretation` before asking/i,
  );
  assert.match(
    systemPrompt,
    /must not become position-by-position unless the player said so/i,
  );
  assert.match(
    systemPrompt,
    /never offer stock examples, generic match-count rules/i,
  );
  assert.match(systemPrompt, /fewer than six values.*complete guess/i);
  assert.match(systemPrompt, /condition applies to the unspecified values/i);
  assert.match(
    systemPrompt,
    /explicitly says that the exact remaining values are ignored.*do not ask the same question again/i,
  );
  assert.match(systemPrompt, /never ask a generic question/i);
  assert.match(systemPrompt, /remaining guessed number/i);
  assert.match(systemPrompt, /draw 12 31 24 versus guess 11 30 29/i);
  assert.equal(requestBody.reasoning_effort, "none");
  assert.equal(requestBody.max_tokens, 16_384);

  await interpretRuleWithAgent("Win if the smallest number matches.", {
    ...CONFIG,
    apiKey: "cloud-key",
    baseUrl: "https://api.openai.example/v1",
  });
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
                officialInterpretation:
                  "Compare the six guess numbers with the draw.",
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
                ast: {
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
                },
                consumedSpans: [
                  {
                    text: "four or more picked numbers show up in the result",
                  },
                ],
                workedExamples: [
                  {
                    draw: [1, 2, 3, 4, 5, 6],
                    guess: [1, 2, 3, 4, 90, 91],
                    outcome: "WIN",
                  },
                  {
                    draw: [1, 2, 3, 4, 5, 6],
                    guess: [1, 2, 3, 90, 91, 92],
                    outcome: "LOSE",
                  },
                ],
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
  assert.match(
    systemPrompt,
    /smallest guessed number equals the smallest drawn number/i,
  );
  assert.match(
    systemPrompt,
    /largest guessed number is greater than the largest drawn number/i,
  );
  assert.match(systemPrompt, /four or more of my picked numbers show up/i);
  assert.match(
    systemPrompt,
    /second guessed number equals second drawn number/i,
  );
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
  assert.match(systemPrompt, /consumedSpans/);
  assert.match(systemPrompt, /workedExamples/);
  assert.match(systemPrompt, /at least TWO valid domain cases/i);
  assert.match(systemPrompt, /draws without replacement/i);
  assert.match(systemPrompt, /never use `0`, `101`, or a seventh value/i);
  assert.match(systemPrompt, /decoder enforces this response schema/i);
  assert.match(systemPrompt, /guessSum - drawSum <= -10/);
});

test("compile requests schema-constrained tickets and never falls back to JSON mode", async () => {
  let requestBody: unknown = null;
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                ast: {
                  schemaVersion: 3,
                  result: {
                    type: "predicate",
                    predicate: {
                      kind: "compare",
                      op: "gt",
                      left: {
                        kind: "at",
                        index: 0,
                        of: { kind: "source", source: "guess" },
                      },
                      right: { kind: "lit", value: 1 },
                    },
                  },
                },
                consumedSpans: [
                  { text: "first guessed number is greater than 1" },
                ],
                workedExamples: [
                  {
                    guess: [2, 3, 4, 5, 6, 7],
                    draw: [10, 20, 30, 40, 50, 60],
                    outcome: "WIN",
                  },
                  {
                    guess: [1, 3, 4, 5, 6, 7],
                    draw: [10, 20, 30, 40, 50, 60],
                    outcome: "LOSE",
                  },
                ],
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  await compileRuleToAst(
    "A guess wins if its first number is greater than 1.",
    CONFIG,
  );

  const responseFormat = (requestBody as Record<string, unknown>)
    .response_format as {
    type?: string;
    json_schema?: {
      name?: string;
      strict?: boolean;
      schema?: { properties?: Record<string, unknown>; required?: string[] };
    };
  };
  assert.equal(responseFormat.type, "json_schema");
  assert.equal(responseFormat.json_schema?.name, "tyche_rule_ast");
  assert.equal(responseFormat.json_schema?.strict, true);
  // The two-compiler pipeline asks for the AST and nothing else: no spans,
  // provenance or worked examples to be judged as paperwork.
  assert.deepEqual(Object.keys(responseFormat.json_schema?.schema?.properties ?? {}), ["ast"]);
  assert.deepEqual(responseFormat.json_schema?.schema?.required, ["ast"]);
  const messages =
    (
      requestBody as {
        messages?: Array<{ content?: string; role?: string }>;
      }
    ).messages ?? [];
  assert.match(messages[0]?.content ?? "", /AST-only envelope/i);
  // Independence: no server-authored plan is injected, so two compilers cannot
  // both copy the same deterministic reading.
  assert.doesNotMatch(messages[0]?.content ?? "", /server-verified semantic plan/i);
  assert.equal(
    messages[1]?.content,
    "A guess wins if its first number is greater than 1.",
  );
});

interface CompileRequestBody {
  messages?: Array<{ content?: string }>;
  reasoning_effort?: unknown;
  response_format?: {
    json_schema?: {
      schema?: {
        definitions?: Record<
          string,
          {
            anyOf?: Array<{ properties?: { kind?: { const?: unknown } } }>;
          }
        >;
      };
    };
  };
}

// A schema-valid candidate, so the transport's off-grammar re-ask does not
// fire and each test counts only the calls it is actually about.
const VALID_CANDIDATE = {
  "ast": {
    "schemaVersion": 3,
    "result": {
      "type": "predicate",
      "predicate": {
        "kind": "compare",
        "op": "gt",
        "left": {
          "kind": "at",
          "index": 0,
          "of": {
            "kind": "source",
            "source": "guess"
          }
        },
        "right": {
          "kind": "at",
          "index": 0,
          "of": {
            "kind": "source",
            "source": "draw"
          }
        }
      }
    }
  },
  "consumedSpans": [
    {
      "text": "its first number is greater than the first drawn number"
    }
  ],
  "workedExamples": [
    {
      "draw": [
        10,
        20,
        30,
        40,
        50,
        60
      ],
      "guess": [
        11,
        21,
        31,
        41,
        51,
        61
      ],
      "outcome": "WIN"
    },
    {
      "draw": [
        10,
        20,
        30,
        40,
        50,
        60
      ],
      "guess": [
        9,
        21,
        31,
        41,
        51,
        61
      ],
      "outcome": "LOSE"
    }
  ]
} as const;

function collectSchemaKinds(body: CompileRequestBody | undefined) {
  const definitions =
    body?.response_format?.json_schema?.schema?.definitions ?? {};
  return Object.values(definitions).flatMap((definition) =>
    (definition.anyOf ?? []).flatMap((variant) => {
      const kind = variant.properties?.kind?.const;
      return typeof kind === "string" ? [kind] : [];
    }),
  );
}

test("direct positional rules constrain the LLM to indexed access", async () => {
  const requestBodies: Array<Record<string, unknown>> = [];
  const text =
    "A guess wins when its first number is greater than the first drawn number and its second number is greater than the last drawn number.";
  const at = (source: "draw" | "guess", index: number) => ({
    kind: "at",
    index,
    of: { kind: "source", source },
  });
  const candidate = {
    ast: {
      schemaVersion: 3,
      result: {
        type: "predicate",
        predicate: {
          kind: "and",
          clauses: [
            {
              kind: "compare",
              op: "gt",
              left: at("guess", 0),
              right: at("draw", 0),
            },
            {
              kind: "compare",
              op: "gt",
              left: at("guess", 1),
              right: at("draw", 5),
            },
          ],
        },
      },
    },
    consumedSpans: [
      {
        text: "its first number is greater than the first drawn number and its second number is greater than the last drawn number",
      },
    ],
    workedExamples: [
      {
        draw: [10, 20, 30, 40, 50, 60],
        guess: [11, 61, 70, 80, 90, 100],
        outcome: "WIN",
      },
      {
        draw: [10, 20, 30, 40, 50, 60],
        guess: [11, 59, 70, 80, 90, 100],
        outcome: "LOSE",
      },
    ],
  };
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    requestBodies.push(
      JSON.parse(String(init?.body)) as Record<string, unknown>,
    );
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(candidate) } }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  assert.deepEqual(await compileRuleToAst(text, CONFIG), candidate);
  assert.deepEqual(
    await compileRuleToAst(
      "For each guess, compare guess[0] with draw[0] and guess[1] with draw[5]; both comparisons must be true.",
      CONFIG,
    ),
    candidate,
  );
  const requestBody = requestBodies[0] ?? {};
  const responseFormat = requestBody.response_format as {
    json_schema?: {
      schema?: { definitions?: Record<string, { anyOf?: unknown[] }> };
    };
  };
  const kinds = Object.values(
    responseFormat.json_schema?.schema?.definitions ?? {},
  ).flatMap((definition) =>
    (definition.anyOf ?? []).flatMap((variant) => {
      const kind = (variant as { properties?: { kind?: { const?: unknown } } })
        .properties?.kind?.const;
      return typeof kind === "string" ? [kind] : [];
    }),
  );
  assert.ok(kinds.includes("at"));
  assert.ok(!kinds.includes("elem"));
  assert.ok(!kinds.includes("pair"));
  const messages = requestBody.messages as Array<{ content?: string }>;
  assert.match(
    messages[0]?.content ?? "",
    /direct-position decoder constraint/i,
  );
  assert.match(
    messages[0]?.content ?? "",
    /1-based ordinal to a 0-based index/i,
  );
  assert.doesNotMatch(messages[0]?.content ?? "", /server-verified semantic plan/i);
  const indexedResponseFormat = requestBodies[1]?.response_format as {
    json_schema?: {
      schema?: { definitions?: Record<string, { anyOf?: unknown[] }> };
    };
  };
  const indexedKinds = Object.values(
    indexedResponseFormat.json_schema?.schema?.definitions ?? {},
  ).flatMap((definition) =>
    (definition.anyOf ?? []).flatMap((variant) => {
      const kind = (variant as { properties?: { kind?: { const?: unknown } } })
        .properties?.kind?.const;
      return typeof kind === "string" ? [kind] : [];
    }),
  );
  assert.ok(indexedKinds.includes("at"));
  assert.ok(!indexedKinds.includes("elem"));
});

test("a negative quantifier is a quantifier, so the binder nodes stay available", async () => {
  // Regression: "none of its even numbers appear in the draw" quantifies over
  // the whole guess exactly as "every ... number" does, but "none" was missing
  // from the quantifier list. The rule ALSO names a position ("the first drawn
  // number"), so the decoder was told to forbid `elem` / `pair` while half the
  // rule required one. Measured against the real provider, that unsatisfiable
  // grammar made both mistral-small-24b and gpt-oss-20b run to the full output
  // ceiling and return no AST at all.
  const bodies: CompileRequestBody[] = [];
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    bodies.push(JSON.parse(String(init?.body)) as CompileRequestBody);
    return new Response(
      JSON.stringify({
        choices: [
          { message: { content: JSON.stringify(VALID_CANDIDATE) } },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  await compileRuleToAst(
    "A guess wins if none of its even numbers appear in the draw and the first drawn number is odd.",
    CONFIG,
  );

  const kinds = collectSchemaKinds(bodies[0]);
  assert.ok(kinds.includes("elem"), "the binder node the rule needs must exist");
  assert.ok(kinds.includes("at"), "positional access stays available too");
  assert.doesNotMatch(
    String(bodies[0]?.messages?.[0]?.content ?? ""),
    /direct-position decoder constraint/i,
  );
});

test("an output budget spent under the positional constraint re-asks without it", async () => {
  // The whitelist above will keep missing phrasings. When it does, the decoder
  // is handed a grammar no token sequence can close and the provider bills the
  // whole output budget for nothing. One relaxed re-ask turns that dead end into
  // a compile instead of surfacing it as the player's bad rule.
  const bodies: CompileRequestBody[] = [];
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    bodies.push(JSON.parse(String(init?.body)) as CompileRequestBody);
    if (bodies.length === 1) {
      return new Response(
        JSON.stringify({
          choices: [{ finish_reason: "length", message: { content: "" } }],
          usage: { completion_tokens: 16384, prompt_tokens: 14000 },
        }),
        { status: 200 },
      );
    }
    return new Response(
      JSON.stringify({
        choices: [
          { message: { content: JSON.stringify(VALID_CANDIDATE) } },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const result = await compileRuleToAst(
    "A guess wins when its first number is greater than the first drawn number.",
    CONFIG,
  );
  assert.deepEqual(result, VALID_CANDIDATE);
  assert.equal(bodies.length, 2);

  // First ask carried the restriction; the re-ask dropped it, in BOTH the
  // schema and the guidance paragraph, which must never disagree.
  assert.ok(!collectSchemaKinds(bodies[0]).includes("elem"));
  assert.ok(collectSchemaKinds(bodies[1]).includes("elem"));
  assert.match(
    String(bodies[0]?.messages?.[0]?.content ?? ""),
    /direct-position decoder constraint/i,
  );
  assert.doesNotMatch(
    String(bodies[1]?.messages?.[0]?.content ?? ""),
    /direct-position decoder constraint/i,
  );
  // Relaxing is a different fault from an unparseable envelope, so it must not
  // also buy the reasoning trace.
  assert.equal(bodies[1]?.reasoning_effort, bodies[0]?.reasoning_effort);
});

test("a budget exhausted WITHOUT the positional constraint is still reported", async () => {
  // Only the unsatisfiable-grammar case is recoverable. A genuine budget
  // exhaustion must keep surfacing, or the relaxation would hide a real limit.
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        choices: [{ finish_reason: "length", message: { content: "" } }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  await assert.rejects(
    compileRuleToAst(
      "A guess wins if the sum of its numbers is greater than the sum of the drawn numbers.",
      CONFIG,
    ),
    /cut off/,
  );
  assert.equal(calls, 1);
});

test("compile fails closed before calling a provider without schema-constrained decoding", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error("must not be called");
  }) as typeof fetch;

  await assert.rejects(
    compileRuleToAst("A guess wins if its sum is greater than the draw sum.", {
      ...CONFIG,
      model: "nemotron-3-super:cloud",
    }),
    /does not support required schema-constrained decoding/i,
  );
  assert.equal(calls, 0);
});

test("a stray character after the compiled JSON does not discard the compilation", async () => {
  // Observed from the live compile model: a correct envelope followed by one
  // extra `}`. Reading the response from the first brace to the LAST brace in
  // the string made the whole thing unparseable, so a faithful compilation was
  // reported to the player as a malformed provider response — and no rewording
  // of the rule could ever fix it.
  const candidate = {
    ast: {
      result: {
        predicate: {
          kind: "compare",
          left: {
            kind: "at",
            index: 0,
            of: { kind: "source", source: "guess" },
          },
          op: "eq",
          right: { kind: "lit", value: 1 },
        },
        type: "predicate",
      },
      schemaVersion: 3,
    },
    consumedSpans: [{ text: "the first guessed number is 1" }],
    workedExamples: [
      {
        draw: [10, 20, 30, 40, 50, 60],
        guess: [1, 2, 3, 4, 5, 6],
        outcome: "WIN",
      },
      {
        draw: [10, 20, 30, 40, 50, 60],
        guess: [2, 3, 4, 5, 6, 7],
        outcome: "LOSE",
      },
    ],
  };

  for (const suffix of ["}", "\n}", "\nDone.", '\n{"note":"trailing"}']) {
    globalThis.fetch = (async () =>
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: `${JSON.stringify(candidate)}${suffix}` } },
          ],
        }),
        { status: 200 },
      )) as typeof fetch;

    assert.deepEqual(
      await compileRuleToAst(
        "A guess wins if the first guessed number is 1.",
        CONFIG,
      ),
      candidate,
      suffix,
    );
  }

  // A response that carries no parseable object still fails closed.
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({ choices: [{ message: { content: '{"ast": ,}' } }] }),
      { status: 200 },
    )) as typeof fetch;
  await assert.rejects(
    compileRuleToAst("A guess wins if the first guessed number is 1.", CONFIG),
    /malformed JSON/i,
  );
});

test("an unparseable compile response is re-asked before it blocks the rule", async () => {
  const candidate = {
    ast: {
      result: {
        predicate: {
          kind: "compare",
          left: {
            kind: "reduce",
            op: "sum",
            of: { kind: "source", source: "guess" },
          },
          op: "gt",
          right: {
            kind: "reduce",
            op: "sum",
            of: { kind: "source", source: "draw" },
          },
        },
        type: "predicate",
      },
      schemaVersion: 3,
    },
    consumedSpans: [{ text: "the guessed sum is greater than the drawn sum" }],
    workedExamples: [
      {
        draw: [1, 2, 3, 4, 5, 6],
        guess: [95, 96, 97, 98, 99, 100],
        outcome: "WIN",
      },
      {
        draw: [95, 96, 97, 98, 99, 100],
        guess: [1, 2, 3, 4, 5, 6],
        outcome: "LOSE",
      },
    ],
  };
  const text = "A guess wins if the guessed sum is greater than the drawn sum.";

  let calls = 0;
  const respond = (content: string) =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
    });
  globalThis.fetch = (async () => {
    calls += 1;
    return respond(
      calls === 1 ? "{not json at all,}" : JSON.stringify(candidate),
    );
  }) as typeof fetch;

  assert.deepEqual(await compileRuleToAst(text, CONFIG), candidate);
  assert.equal(calls, 2);

  // The retry is bounded: a second unparseable response still fails closed.
  calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return respond("{not json at all,}");
  }) as typeof fetch;
  await assert.rejects(compileRuleToAst(text, CONFIG), /malformed JSON/i);
  assert.equal(calls, 3);

  // A non-JSON failure mode is NOT retried — it is a real condition to report.
  calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response("upstream exploded", { status: 500 });
  }) as typeof fetch;
  await assert.rejects(compileRuleToAst(text, CONFIG));
  assert.equal(calls, 1);
});

test("a compile re-ask lets the model think; first calls keep the fast mode", async () => {
  const bodies: Array<Record<string, unknown>> = [];
  const capture = (content: string) =>
    (async (
      _input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { status: 200 },
      );
    }) as typeof fetch;
  // Ollama-served config: the thinking control only applies there at all.
  const ollamaConfig: RuleAgentConfig = { ...CONFIG, apiKey: "ollama" };

  const compiled = JSON.stringify({
    ast: { schemaVersion: 1, node: { kind: "sum_equals" } },
    consumedSpans: [{ text: "the sums are equal" }],
    workedExamples: [],
  });
  globalThis.fetch = capture(compiled);
  await compileRuleToAst("Win if the sums are equal.", ollamaConfig);

  // Same call, but the first response is unparseable: the re-ask drops the flag.
  let compileCalls = 0;
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    compileCalls += 1;
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        choices: [
          { message: { content: compileCalls === 1 ? "{broken,}" : compiled } },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  await compileRuleToAst("Win if the sums are equal.", ollamaConfig);

  globalThis.fetch = capture(
    JSON.stringify({
      addedOperationalClauses: [],
      clarificationQuestions: [],
      clarityNote: "",
      dealerMessage: "Understood.",
      needsClarification: false,
      normalizedText: "Win if the sums are equal.",
      officialInterpretation: "The two sums must be equal.",
      suggestedRewrites: [],
      title: "Equal Sums",
    }),
  );
  await interpretRuleWithAgent("Win if the sums are equal.", ollamaConfig);

  // First compile call: fast mode, like every other step. Re-ask after an
  // unparseable response: reasoning allowed, because that is the failure the
  // suppressed trace causes. The interpret step always keeps the saving.
  assert.equal(bodies[0]?.reasoning_effort, "none", "first compile call");
  assert.equal(bodies[1]?.reasoning_effort, "none", "compile retry, attempt 1");
  assert.equal(
    bodies[2]?.reasoning_effort,
    undefined,
    "compile retry, attempt 2",
  );
  assert.equal(bodies[3]?.reasoning_effort, "none", "interpret");
});

test("the streamed answer reader emits only the answer field, decoded", () => {
  const reader = createJsonStringFieldReader("answer");
  const chunks: string[] = [];
  // Split exactly where a naive reader breaks: mid-key, mid-escape, and mid
  // unicode escape. `answerLanguage` must not be mistaken for `answer`.
  for (const chunk of [
    '<think>the player asks about ties</think>{"answerLan',
    'guage":"pt","ans',
    'wer":"Linha 1\\',
    'nLinha 2 \\"cita',
    'da\\" e ca\\u00e7',
    'ada","proposedRuleText":"Win if x."}',
  ]) {
    chunks.push(reader.push(chunk));
  }

  assert.equal(chunks.join(""), 'Linha 1\nLinha 2 "citada" e caçada');
  assert.equal(reader.closed, true);
  // Nothing after the closing quote can leak into the answer.
  assert.equal(reader.push('{"answer":"again"}'), "");
});

test("the streamed answer reader stays silent until the field opens", () => {
  const reader = createJsonStringFieldReader("answer");

  assert.equal(
    reader.push('{"answerLanguage":"en","proposedRuleText":null'),
    "",
  );
  assert.equal(reader.closed, false);
  assert.equal(reader.push(',"answer":"Ready."}'), "Ready.");
});

test("dealer chat streaming reports deltas and returns the validated answer", async () => {
  const answer = "Ties split the alternative pool equally.";
  const payload = JSON.stringify({
    answer,
    answerLanguage: "en",
    proposedRuleText: null,
  });
  let requestBody: { stream?: unknown } = {};
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    requestBody = JSON.parse(String(init?.body)) as { stream?: unknown };
    // One SSE frame per character, the worst case for a chunk-boundary bug.
    const frames = [...payload]
      .map(
        (char) =>
          `data: ${JSON.stringify({ choices: [{ delta: { content: char } }] })}\n\n`,
      )
      .join("");
    return new Response(`${frames}data: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
      status: 200,
    });
  }) as typeof fetch;

  const deltas: string[] = [];
  const result = await streamDealerQuestionAnswer(
    '<tyche_server_context>{"diagnosticsAvailable":true}</tyche_server_context>',
    (chunk) => deltas.push(chunk),
    CONFIG,
  );

  assert.equal(requestBody.stream, true);
  assert.equal(result.answer, answer);
  assert.equal(result.proposedRuleText, null);
  // The player saw the answer arrive in pieces, and only the answer.
  assert.ok(deltas.length > 1);
  assert.equal(deltas.join(""), answer);
});

test("a dealer answer stream cut off at the token limit is rejected", async () => {
  globalThis.fetch = (async () =>
    new Response(
      `data: ${JSON.stringify({
        choices: [{ delta: { content: '{"answer":"Half of an ans' } }],
      })}\n\ndata: ${JSON.stringify({
        choices: [{ delta: {}, finish_reason: "length" }],
      })}\n\ndata: [DONE]\n\n`,
      { headers: { "content-type": "text/event-stream" }, status: 200 },
    )) as typeof fetch;

  await assert.rejects(
    streamDealerQuestionAnswer(
      "<tyche_server_context>{}</tyche_server_context>",
      () => {},
      CONFIG,
    ),
    /cut off at the 16384-token output limit/,
  );
});

test("the chat step runs on LLM_MODEL_CHAT without touching the rule pipeline", () => {
  const env = {
    LLM_API_KEY: "ollama",
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "nemotron-3-super:cloud",
    LLM_MODEL_CHAT: "gpt-oss:20b-cloud",
    LLM_MODEL_INTERPRET: "",
  } as unknown as NodeJS.ProcessEnv;

  assert.equal(resolveDealerChatConfig(env).model, "gpt-oss:20b-cloud");
  assert.equal(resolveRuleAgentConfig(env).model, "nemotron-3-super:cloud");
});

test("chat falls back to LLM_MODEL, and the interpret override never leaks into it", () => {
  const env = {
    LLM_API_KEY: "ollama",
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "nemotron-3-super:cloud",
    // Set but blank, the shape `firstConfigured` exists for.
    LLM_MODEL_CHAT: "",
    // Names the interpret step; a chat answer must not inherit it.
    LLM_MODEL_INTERPRET: "gemma4:latest",
  } as unknown as NodeJS.ProcessEnv;

  assert.equal(resolveDealerChatConfig(env).model, "nemotron-3-super:cloud");
  assert.equal(resolveRuleAgentConfig(env).model, "gemma4:latest");
});

test("the chat step asks for a low trace, which is the only level gpt-oss honours", async () => {
  // gpt-oss ignores `reasoning_effort: "none"` (Ollama documents low/medium/high
  // only), so "none" would leave the trace on and the player waiting. Measured
  // on gpt-oss:20b-cloud: 26 characters of trace at low against 155 unset.
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "Ready.",
                proposedRuleText: null,
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  await answerDealerQuestion(
    "<tyche_server_context>{}</tyche_server_context>",
    CONFIG,
  );

  assert.equal(bodies[0]?.reasoning_effort, "low");
});

test("a schema-invalid compile AST is re-asked with the reasoning trace", async () => {
  // The trace-suppressed mode degrades this model's nested output two ways. A
  // truncated envelope fails to parse and was already re-asked. A COMPLETE
  // envelope whose AST is off-grammar parses fine, so it used to be returned
  // as-is and surfaced to the player as SCHEMA_INVALID telling them to rewrite
  // a rule that compiles fine — while the re-ask built for this never ran.
  const text =
    "A guess wins when it contains exactly the numbers 1, 2, 3, 4, 5, and 7.";
  const good = {
    ast: {
      result: {
        predicate: {
          clauses: [1, 2, 3, 4, 5, 7].map((value) => ({
            array: { kind: "source", source: "guess" },
            kind: "contains",
            value: { kind: "lit", value },
          })),
          kind: "and",
        },
        type: "predicate",
      },
      schemaVersion: 3,
    },
    consumedSpans: [
      { text: "contains exactly the numbers 1, 2, 3, 4, 5, and 7" },
    ],
    workedExamples: [
      {
        draw: [10, 20, 30, 40, 50, 60],
        guess: [1, 2, 3, 4, 5, 7],
        outcome: "WIN",
      },
      {
        draw: [10, 20, 30, 40, 50, 60],
        guess: [1, 2, 3, 4, 5, 8],
        outcome: "LOSE",
      },
    ],
  };
  // Valid JSON, and a shape the grammar has no node for: there is no array
  // literal and no set equality, so this is what a model reaches for.
  const offGrammar = {
    ast: {
      result: {
        predicate: {
          kind: "compare",
          left: { kind: "source", source: "guess" },
          op: "eq",
          right: { kind: "set", values: [1, 2, 3, 4, 5, 7] },
        },
        type: "predicate",
      },
      schemaVersion: 3,
    },
    consumedSpans: [],
    workedExamples: [],
  };

  const bodies: Record<string, unknown>[] = [];
  let calls = 0;
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    calls += 1;
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify(calls === 1 ? offGrammar : good),
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  const ollamaConfig = { ...CONFIG, baseUrl: "http://localhost:11434/v1" };
  assert.deepEqual(await compileRuleToAst(text, ollamaConfig), good);
  assert.equal(calls, 2, "the off-grammar AST bought a retry");
  assert.equal(bodies[0]?.reasoning_effort, "none", "first call stays fast");
  assert.equal(
    bodies[1]?.reasoning_effort,
    undefined,
    "the re-ask restores the reasoning trace",
  );
});

test("a compile that never returns a valid AST is reported, not retried forever", async () => {
  // The transport does not decide validity: once the retries are spent it hands
  // the off-grammar artifact downstream, where the schema gate produces the real
  // SCHEMA_INVALID verdict exactly as before.
  const offGrammar = {
    ast: {
      result: { predicate: { kind: "set_equals" }, type: "predicate" },
      schemaVersion: 3,
    },
    consumedSpans: [],
    workedExamples: [],
  };
  let calls = 0;
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response(
      JSON.stringify({
        choices: [{ message: { content: JSON.stringify(offGrammar) } }],
      }),
      { status: 200 },
    );
  }) as typeof fetch;

  assert.deepEqual(
    await compileRuleToAst(
      "A guess wins if its set equals the draw set.",
      CONFIG,
    ),
    offGrammar,
  );
  assert.equal(calls, 3, "bounded by COMPILE_BAD_RESPONSE_ATTEMPTS");
});

// --------------------------------------------------------------------------
// Provider dialects. "OpenAI-compatible" is not one protocol: the parameters
// below are the ones that make a request fail outright on the wrong endpoint.
// --------------------------------------------------------------------------

const GROQ_CONFIG: RuleAgentConfig = {
  apiKey: "gsk-test",
  baseUrl: "https://api.groq.com/openai/v1",
  maxOutputTokens: 16_384,
  model: "qwen/qwen3.8-27b",
  seed: 7,
  timeoutMs: 30_000,
};

function captureRequestBody() {
  const bodies: Array<Record<string, unknown>> = [];
  globalThis.fetch = (async (
    _input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ) => {
    bodies.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: "Ties split the pool.",
                proposedRuleText: null,
              }),
            },
          },
        ],
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  return bodies;
}

test("the chat step can move to its own endpoint, key and all", () => {
  // The chat prompt is the largest in the system, so a hosted tier's per-minute
  // input allowance refuses it first. Moving just that step keeps the dealer
  // talking without taking the artifact steps off the schema-capable provider.
  const config = resolveDealerChatConfig({
    API_KEY_GROQ: "gsk-real",
    LLM_API_KEY: "ollama",
    LLM_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_CHAT_BASE_URL: "http://localhost:11434/v1/",
    LLM_MODEL: "qwen/qwen3.8-27b",
    LLM_MODEL_CHAT: "gemma3:4b",
  } as NodeJS.ProcessEnv);

  assert.equal(config.baseUrl, "http://localhost:11434/v1");
  assert.equal(config.model, "gemma3:4b");
  // The credential follows the endpoint; the Groq key never leaves Groq.
  assert.equal(config.apiKey, "ollama");
  assert.equal(resolveProviderDialect(config), "ollama");

  // Without the override the chat stays exactly where the rule agent is.
  const shared = resolveDealerChatConfig({
    API_KEY_GROQ: "gsk-real",
    LLM_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_MODEL: "qwen/qwen3.8-27b",
  } as NodeJS.ProcessEnv);
  assert.equal(shared.baseUrl, "https://api.groq.com/openai/v1");
  assert.equal(shared.apiKey, "gsk-real");
});

test("the endpoint decides the dialect, not the model name", () => {
  assert.equal(resolveProviderDialect(GROQ_CONFIG), "groq");
  assert.equal(resolveProviderDialect(CONFIG), "ollama");
  assert.equal(
    resolveProviderDialect({ apiKey: "ollama", baseUrl: "http://gpu:8000/v1" }),
    "ollama",
  );
  assert.equal(
    resolveProviderDialect({ apiKey: "sk-x", baseUrl: "http://vllm:8000/v1" }),
    "openai-compatible",
  );
});

const OPENROUTER_CONFIG: RuleAgentConfig = {
  apiKey: "sk-or-test",
  baseUrl: "https://openrouter.ai/api/v1",
  maxOutputTokens: 16_384,
  model: "qwen/qwen3.8-27b",
  seed: 7,
  timeoutMs: 30_000,
};

test("OpenRouter routing and reasoning never travel in the same request", async () => {
  // `require_parameters` filters backends on EVERY parameter in the request and
  // cannot be scoped to one, so asking for a schema AND a reasoning setting
  // leaves no endpoint for a model with no reasoning support at all — measured
  // as HTTP 404 "No endpoints found that can handle the requested parameters"
  // on mistral-small-24b. The schema is what the artifact depends on, so a
  // schema-constrained call pins routing and stays silent about reasoning.
  const bodies = captureRequestBody();
  await translateRuleToEnglish("Ganha com 3 acertos.", OPENROUTER_CONFIG);

  // Unconstrained step: control the trace, do not filter the routing.
  assert.equal("provider" in bodies[0]!, false);
  assert.deepEqual(bodies[0]?.reasoning, { enabled: false });

  // gpt-oss refuses to have reasoning turned off here exactly as it refuses
  // `reasoning_effort: "none"` on Groq, so its floor is the shortest trace.
  await translateRuleToEnglish("Ganha com 3 acertos.", {
    ...OPENROUTER_CONFIG,
    model: "openai/gpt-oss-120b",
  });
  assert.deepEqual(bodies[1]?.reasoning, { effort: "low" });

  // The chat step wants a short trace to show the player.
  await answerDealerQuestion("<tyche_server_context>{}</tyche_server_context>", OPENROUTER_CONFIG);
  assert.deepEqual(bodies[2]?.reasoning, { effort: "low" });

  // And no keep_alive anywhere — that is Ollama's field alone.
  assert.equal(bodies.some((body) => "keep_alive" in body), false);
});

test("the free router never asks a backend to disable reasoning", async () => {
  // `openrouter/free` is a router, not a model: it picks a free backend per
  // request and the request cannot know which. Measured 2026-09-16, 5 identical
  // interpret calls were served by z-ai/glm-5.2:free, nex-agi/nex-n2.5-pro:free
  // and dots-studio/dots-3-note-preview:free — and 2 of the 5 returned HTTP 400
  // "Reasoning is mandatory for this endpoint and cannot be disabled". A model
  // name whose backend is unknown gets the same floor gpt-oss gets.
  const bodies = captureRequestBody();
  const freeRouter = { ...OPENROUTER_CONFIG, model: "openrouter/free" };
  await translateRuleToEnglish("Ganha com 3 acertos.", freeRouter);
  assert.deepEqual(bodies[0]?.reasoning, { effort: "low" });

  await answerDealerQuestion(
    "<tyche_server_context>{}</tyche_server_context>",
    freeRouter,
  );
  assert.deepEqual(bodies[1]?.reasoning, { effort: "low" });
});

test("a router slug can never attest to the compiler's decoder", () => {
  // The hostname says OpenRouter enforces the schema, but the slug names no
  // backend for it to enforce with. Measured against the real 8274-byte
  // candidate schema: openrouter/free produced 0 of 4 parseable candidates, one
  // of them HTTP 404 "No endpoints found that can handle the requested
  // parameters" because `require_parameters` had filtered the free pool to
  // nothing. Failing closed here is what keeps an unconstrained decode from
  // being recorded as a schema-enforced artifact.
  assert.equal(
    supportsRuleCompilationSchema({
      ...OPENROUTER_CONFIG,
      model: "openrouter/free",
    }),
    false,
  );
  assert.equal(
    supportsRuleCompilationSchema({
      ...OPENROUTER_CONFIG,
      model: "openrouter/auto",
    }),
    false,
  );
});

test("OpenRouter is accepted as the artifact emitter, unlike Groq", () => {
  // Verified against the real candidate schema: openai/gpt-oss-120b and
  // mistralai/mistral-small-24b both returned schema-valid ASTs through
  // compileRuleToAst, where Groq cannot build the grammar at all.
  assert.equal(supportsRuleCompilationSchema(OPENROUTER_CONFIG), true);
  assert.equal(resolveProviderDialect(OPENROUTER_CONFIG), "openrouter");
});

test("a Groq request never carries Ollama's keep_alive, which Groq rejects", async () => {
  // Measured against the live API: `keep_alive` returns HTTP 400
  // "property 'keep_alive' is unsupported". Sending it makes EVERY call fail,
  // so this is the difference between a working provider and a dead one.
  const bodies = captureRequestBody();
  await answerDealerQuestion("<tyche_server_context>{}</tyche_server_context>", GROQ_CONFIG);

  assert.equal("keep_alive" in bodies[0]!, false);
  // The trace is split into its own field so the chat can show it separately.
  assert.equal(bodies[0]?.reasoning_format, "parsed");
});

test("an Ollama request keeps keep_alive so the model stays resident", async () => {
  const bodies = captureRequestBody();
  await answerDealerQuestion("<tyche_server_context>{}</tyche_server_context>", CONFIG);

  assert.equal(bodies[0]?.keep_alive, "10m");
  assert.equal("reasoning_format" in bodies[0]!, false);
});

test("gpt-oss on Groq is never asked for a trace level it rejects", async () => {
  // The gpt-oss family documents only low/medium/high; "none" is a 400. Qwen
  // accepts "none", so the suppressed rule steps still get the cheap path there.
  // Translation is a rule step, so it asks for the suppressed trace: the level
  // the two families disagree about.
  const bodies = captureRequestBody();
  await translateRuleToEnglish("Ganha com 3 acertos.", {
    ...GROQ_CONFIG,
    model: "openai/gpt-oss-120b",
  });
  assert.equal(bodies[0]?.reasoning_effort, "low");

  await translateRuleToEnglish("Ganha com 3 acertos.", GROQ_CONFIG);
  assert.equal(bodies[1]?.reasoning_effort, "none");
});

test("Groq is not accepted as the artifact emitter, whatever it advertises", () => {
  // PRD 7.3.1 needs constrained decoding on the schema this compiler actually
  // emits, not on schemas in general. Groq decodes a flat schema in ~0.6 s but
  // hangs ~33 s and drops the connection on the real 8288-byte candidate schema,
  // measured 6/6 across qwen3.8-27b and gpt-oss-120b. So the compile role must
  // fail closed here rather than pick a provider that cannot emit the artifact.
  assert.equal(supportsRuleCompilationSchema(GROQ_CONFIG), false);
  assert.equal(
    supportsRuleCompilationSchema({ ...GROQ_CONFIG, model: "openai/gpt-oss-120b" }),
    false,
  );
  // A local Ollama endpoint remains the capable one.
  assert.equal(supportsRuleCompilationSchema(CONFIG), true);
});

test("the compile role can be pinned to the endpoint that can decode the schema", () => {
  // The provider serving interpretation and chat is frequently NOT the one that
  // can build a decoder grammar for the candidate schema, so the artifact steps
  // get their own endpoint, credential and budget.
  const compiler = resolveRuleCompilerConfig({
    API_KEY_GROQ: "gsk-real",
    LLM_API_KEY: "ollama",
    LLM_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_COMPILE_BASE_URL: "http://localhost:11434/v1/",
    LLM_COMPILE_MAX_OUTPUT_TOKENS: "16384",
    LLM_MODEL: "qwen/qwen3.8-27b",
    LLM_MODEL_COMPILE: "gemma4:latest",
  } as NodeJS.ProcessEnv);

  assert.equal(compiler.baseUrl, "http://localhost:11434/v1");
  assert.equal(compiler.model, "gemma4:latest");
  assert.equal(compiler.apiKey, "ollama");
  assert.equal(compiler.maxOutputTokens, 16_384);
  // ...and that endpoint IS accepted as the artifact emitter.
  assert.equal(supportsRuleCompilationSchema(compiler), true);

  // Compiler B follows the compile endpoint; only its model differs.
  const secondary = resolveSecondaryCompilerConfig({
    API_KEY_GROQ: "gsk-real",
    LLM_API_KEY: "ollama",
    LLM_BASE_URL: "https://api.groq.com/openai/v1",
    LLM_COMPILE_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "qwen/qwen3.8-27b",
    LLM_MODEL_COMPILE: "gemma4:latest",
    LLM_MODEL_COMPILE_B: "gemma4:e2b",
  } as NodeJS.ProcessEnv);
  assert.equal(secondary.baseUrl, "http://localhost:11434/v1");
  assert.equal(secondary.model, "gemma4:e2b");
});

test("the second compiler can be budgeted and routed apart from compiler A", () => {
  const shared = {
    LLM_API_KEY: "ollama",
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_COMPILE_MAX_OUTPUT_TOKENS: "16384",
    LLM_MODEL: "gemma4:latest",
    LLM_MODEL_COMPILE_B: "deepseek/deepseek-v4-flash",
  } as NodeJS.ProcessEnv;

  // Unset, compiler B inherits the compile budget.
  assert.equal(resolveSecondaryCompilerConfig(shared).maxOutputTokens, 16_384);
  const capped = { ...shared, LLM_COMPILE_B_MAX_OUTPUT_TOKENS: "4096" } as NodeJS.ProcessEnv;
  assert.equal(resolveSecondaryCompilerConfig(capped).maxOutputTokens, 4_096);
  assert.equal(resolveRuleCompilerConfig(capped).maxOutputTokens, 16_384);

  // It may move to its own endpoint, whose key follows the endpoint...
  const routed = resolveSecondaryCompilerConfig({
    ...shared,
    API_KEY_OPENROUTER: "sk-or-real",
    LLM_COMPILE_B_BASE_URL: "https://openrouter.ai/api/v1/",
  } as NodeJS.ProcessEnv);
  assert.equal(routed.baseUrl, "https://openrouter.ai/api/v1");
  assert.equal(routed.apiKey, "sk-or-real");
  // ...without dragging compiler A along.
  assert.equal(
    resolveRuleCompilerConfig({
      ...shared,
      API_KEY_OPENROUTER: "sk-or-real",
      LLM_COMPILE_B_BASE_URL: "https://openrouter.ai/api/v1/",
    } as NodeJS.ProcessEnv).baseUrl,
    "http://localhost:11434/v1",
  );
});

test("a backend refusing the compile schema is a configuration fault, not an outage", () => {
  // Measured from OpenRouter serving `qwen/qwen3.8-flash`: the router wraps the
  // backend's own message, so the text this guard reads is deeply escaped.
  const observed = [
    '{"error":{"message":"Provider returned error","code":400,"metadata":',
    '{"raw":"data: {\\"error\\":{\\"code\\":\\"invalid_parameter_error\\",',
    '\\"message\\":\\"Format error : \'response_format.json_schema.schema\'. ',
    "the specific reason is as follows: When the schema contains the fields ",
    '\\\\\\"uniqueItems\\\\\\", \\\\\\"contains\\\\\\", \\\\\\"minContains\\\\\\", or ',
    '\\\\\\"maxContains\\\\\\", the type should not be \\\\\\"array\\\\\\"',
  ].join("");
  assert.equal(isSchemaRejection(observed), true);

  assert.equal(
    isSchemaRejection(
      '{"error":{"message":"response_format json_schema is not supported by this model"}}',
    ),
    true,
  );

  // An ordinary bad-parameter 400 keeps being reported as the transport failure
  // it is; relabelling one of those as configuration would hide a real outage.
  assert.equal(
    isSchemaRejection(
      '{"error":{"message":"property keep_alive is unsupported"}}',
    ),
    false,
  );
  assert.equal(isSchemaRejection('{"error":{"message":"model not found"}}'), false);
  assert.equal(isSchemaRejection(""), false);
});

test("the Groq secret has one home and a missing one is not silently ignored", () => {
  assert.equal(
    resolveApiKeyForEndpoint("https://api.groq.com/openai/v1", {
      API_KEY_GROQ: "gsk-real",
      LLM_API_KEY: "ollama",
    } as NodeJS.ProcessEnv),
    "gsk-real",
  );
  // A local endpoint is unaffected by the Groq key.
  assert.equal(
    resolveApiKeyForEndpoint("http://localhost:11434/v1", {
      LLM_API_KEY: "ollama",
    } as NodeJS.ProcessEnv),
    "ollama",
  );
  assert.throws(
    () =>
      resolveApiKeyForEndpoint("https://api.groq.com/openai/v1", {
        LLM_API_KEY: "ollama",
      } as NodeJS.ProcessEnv),
    /API_KEY_GROQ is not set/,
  );

  // OpenRouter follows the same rule, so a role moved there picks up the right
  // credential instead of sending the local dummy key.
  assert.equal(
    resolveApiKeyForEndpoint("https://openrouter.ai/api/v1", {
      API_KEY_OPENROUTER: "sk-or-real",
      LLM_API_KEY: "ollama",
    } as NodeJS.ProcessEnv),
    "sk-or-real",
  );
  assert.throws(
    () =>
      resolveApiKeyForEndpoint("https://openrouter.ai/api/v1", {
        LLM_API_KEY: "ollama",
      } as NodeJS.ProcessEnv),
    /API_KEY_OPENROUTER is not set/,
  );
});

test("an unreadable chat reasoning setting fails instead of guessing", () => {
  assert.equal(resolveDealerChatTrace({} as NodeJS.ProcessEnv), "low");
  assert.equal(
    resolveDealerChatTrace({ LLM_CHAT_REASONING: "off" } as NodeJS.ProcessEnv),
    "suppressed",
  );
  assert.equal(
    resolveDealerChatTrace({ LLM_CHAT_REASONING: "full" } as NodeJS.ProcessEnv),
    "full",
  );
  // A typo here would quietly change what the player is shown.
  assert.throws(
    () =>
      resolveDealerChatTrace({
        LLM_CHAT_REASONING: "medium",
      } as NodeJS.ProcessEnv),
    /LLM_CHAT_REASONING must be one of/,
  );
});

test("the dealer's reasoning streams separately and never joins the answer", async () => {
  const answer = "Ties split the pool.";
  const trace = "The player asks about ties. The rule splits.";
  globalThis.fetch = (async () => {
    const frames = [
      ...[...trace].map((char) => ({ choices: [{ delta: { reasoning: char } }] })),
      ...[...JSON.stringify({ answer, proposedRuleText: null })].map((char) => ({
        choices: [{ delta: { content: char } }],
      })),
    ]
      .map((event) => `data: ${JSON.stringify(event)}\n\n`)
      .join("");
    return new Response(`${frames}data: [DONE]\n\n`, {
      headers: { "content-type": "text/event-stream" },
      status: 200,
    });
  }) as typeof fetch;

  const deltas: string[] = [];
  const reasoning: string[] = [];
  const result = await streamDealerQuestionAnswer(
    "<tyche_server_context>{}</tyche_server_context>",
    (chunk) => deltas.push(chunk),
    GROQ_CONFIG,
    undefined,
    (chunk) => reasoning.push(chunk),
  );

  // The trace is reported as it is produced, ahead of the answer.
  assert.equal(reasoning.join(""), trace);
  assert.ok(reasoning.length > 1);
  // ...and the answer the player is given contains none of it.
  assert.equal(deltas.join(""), answer);
  assert.equal(result.answer, answer);
  // It also rides on the result, so a reconnect or the JSON transport sees it.
  assert.equal(result.reasoning, trace);
});

test("only endpoint-permanent failures are treated as exhausted", () => {
  const permanent = [
    new RuleAgentError("RULE_AGENT_UNAVAILABLE", "rate limited", "", 429),
    new RuleAgentError("RULE_AGENT_UNAVAILABLE", "too large", "", 413),
    new RuleAgentError("RULE_AGENT_SCHEMA_UNSUPPORTED", "no schema", "", 400),
  ];
  for (const error of permanent) {
    assert.equal(isExhaustedProviderError(error), true, error.message);
  }

  // Each of these can answer differently on the next call, so skipping the
  // provider on one of them would turn a blip into a silently dropped opinion.
  const transient = [
    new RuleAgentError("RULE_AGENT_TIMEOUT", "took too long"),
    new RuleAgentError("RULE_AGENT_BAD_RESPONSE", "unparseable"),
    new RuleAgentError("RULE_AGENT_UNAVAILABLE", "gateway", "", 502),
    new RuleAgentError("RULE_AGENT_UNAVAILABLE", "socket closed"),
    new Error("something else"),
  ];
  for (const error of transient) {
    assert.equal(isExhaustedProviderError(error), false, String(error));
  }
});

test("an HTTP failure carries the status that produced it", async () => {
  globalThis.fetch = (async () =>
    new Response("Rate limit exceeded for this model.", {
      status: 429,
    })) as typeof fetch;

  // Four attempts, because the detail is transient; the error the caller sees
  // must still say it was a 429 so the provider can be skipped afterwards.
  const error = await interpretRuleWithAgent(
    "Win if one number is drawn.",
    CONFIG,
  ).then(
    () => null,
    (caught: unknown) => caught,
  );
  assert.ok(error instanceof RuleAgentError);
  assert.equal(error.status, 429);
  assert.equal(isExhaustedProviderError(error), true);
});
