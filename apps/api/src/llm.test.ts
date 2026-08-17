import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import {
  answerDealerQuestion,
  compileRuleToAst,
  ensureModelLoaded,
  interpretRuleWithAgent,
  resolveEscalationModel,
  resolveRuleAgentConfig,
  resolveTranslateToEnglish,
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
  assert.match(
    messages[0]?.content ?? "",
    /merely holding tokens earns fees/i,
  );
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
    /complete server-authored `game` object, including every reward field, is also authored in English/i,
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
    /use `rodada` for `round` and `regra` for `rule`/i,
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

  // A stale/too-small override must not reintroduce the truncation window.
  const clamped = resolveRuleAgentConfig({
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MAX_OUTPUT_TOKENS: "2048",
    LLM_MODEL: "minimax-m3:cloud",
  });
  assert.equal(clamped.maxOutputTokens, 4_096);
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
    /never offer stock examples, generic match-count rules/i,
  );
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
  assert.match(systemPrompt, /guessSum - drawSum <= -10/);
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
          left: { kind: "at", index: 0, of: { kind: "source", source: "guess" } },
          op: "eq",
          right: { kind: "lit", value: 1 },
        },
        type: "predicate",
      },
      schemaVersion: 3,
    },
    consumedSpans: [{ text: "the first guessed number is 1" }],
    workedExamples: [
      { draw: [10, 20, 30, 40, 50, 60], guess: [1, 2, 3, 4, 5, 6], outcome: "WIN" },
      { draw: [10, 20, 30, 40, 50, 60], guess: [2, 3, 4, 5, 6, 7], outcome: "LOSE" },
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
      await compileRuleToAst("A guess wins if the first guessed number is 1.", CONFIG),
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
          left: { kind: "reduce", op: "sum", of: { kind: "source", source: "guess" } },
          op: "gt",
          right: { kind: "reduce", op: "sum", of: { kind: "source", source: "draw" } },
        },
        type: "predicate",
      },
      schemaVersion: 3,
    },
    consumedSpans: [{ text: "the guessed sum is greater than the drawn sum" }],
    workedExamples: [
      { draw: [1, 2, 3, 4, 5, 6], guess: [95, 96, 97, 98, 99, 100], outcome: "WIN" },
      { draw: [95, 96, 97, 98, 99, 100], guess: [1, 2, 3, 4, 5, 6], outcome: "LOSE" },
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
    return respond(calls === 1 ? "{not json at all,}" : JSON.stringify(candidate));
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
  assert.equal(bodies[2]?.reasoning_effort, undefined, "compile retry, attempt 2");
  assert.equal(bodies[3]?.reasoning_effort, "none", "interpret");
});
