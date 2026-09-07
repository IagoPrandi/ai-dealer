import assert from "node:assert/strict";
import { test } from "node:test";
import {
  captureAiRun,
  exportAiUsageRunSummaries,
  getAiUsagePricingStatus,
  getAiUsageRunSummaries,
  getAiUsageRuns,
  importAiUsageRunSummaries,
  readProviderUsage,
  recordAiCall,
  resetAiUsageRegistry,
  setAiRunSubject,
  type RecordAiCallInput,
} from "./usage.js";

function call(overrides: Partial<RecordAiCallInput> = {}): RecordAiCallInput {
  return {
    completionTokens: 200,
    durationMs: 1_000,
    model: "openai/gpt-oss-120b",
    outcome: "ok",
    promptTokens: 15_300,
    provider: "openrouter",
    startedAt: "2026-09-07T00:00:00.000Z",
    step: "compile",
    ...overrides,
  };
}

function clearPricingEnv() {
  delete process.env.LLM_PRICE_TABLE_JSON;
  delete process.env.LLM_ESTIMATED_COST_PER_1K_TOKENS_USD;
  resetAiUsageRegistry();
}

test("the OpenAI-compatible usage object is read whole, cost and details included", () => {
  const usage = readProviderUsage({
    choices: [],
    usage: {
      completion_tokens: 2_048,
      completion_tokens_details: { reasoning_tokens: 1_700 },
      cost: 0.0031,
      prompt_tokens: 15_300,
      prompt_tokens_details: { cached_tokens: 12_000 },
      total_tokens: 17_348,
    },
  });
  assert.deepEqual(usage, {
    cachedPromptTokens: 12_000,
    completionTokens: 2_048,
    costUsd: 0.0031,
    promptTokens: 15_300,
    reasoningTokens: 1_700,
    totalTokens: 17_348,
  });
});

test("Ollama's native /api/chat counters are read as tokens too", () => {
  // The Granite guardian talks to that surface, so without this branch every
  // local guardrail call would be recorded as untokenized.
  const usage = readProviderUsage({
    eval_count: 24,
    message: { content: "<score>no</score>" },
    prompt_eval_count: 412,
  });
  assert.equal(usage?.promptTokens, 412);
  assert.equal(usage?.completionTokens, 24);
  assert.equal(usage?.totalTokens, 436);
  assert.equal(usage?.costUsd, null);
});

test("a payload that reports no counters yields null rather than zeros", () => {
  assert.equal(readProviderUsage({ choices: [{ message: {} }] }), null);
  assert.equal(readProviderUsage(null), null);
  assert.equal(readProviderUsage({ usage: {} }), null);
});

test("a run collects every call made below it, including from nested callbacks", async () => {
  clearPricingEnv();
  const { report } = await captureAiRun("rule_preflight", async () => {
    setAiRunSubject("1757203200000123");
    recordAiCall(call({ step: "translate", promptTokens: 300, completionTokens: 40 }));
    // Stands in for the RuleAstProvider callback the rule compiler invokes from
    // inside its own provider loop — the reason the scope is ambient.
    const provider = async () => {
      await new Promise((resolve) => setImmediate(resolve));
      recordAiCall(call({ step: "compile" }));
      recordAiCall(call({ step: "review", model: "mistralai/mistral-small-24b" }));
    };
    await provider();
    return "done";
  });

  assert.equal(report.subject, "1757203200000123");
  assert.equal(report.totals.callCount, 3);
  assert.equal(report.totals.promptTokens, 300 + 15_300 * 2);
  assert.equal(report.totals.completionTokens, 40 + 200 * 2);
  assert.equal(report.totals.totalTokens, 340 + 15_500 * 2);
  assert.deepEqual(
    report.calls.map((entry) => entry.step),
    ["translate", "compile", "review"],
  );
});

test("a run that throws still publishes its report", async () => {
  clearPricingEnv();
  await assert.rejects(
    captureAiRun("rule_preflight", async () => {
      recordAiCall(call());
      throw new Error("RULE_EXTERNAL_DEPENDENCY");
    }),
    /RULE_EXTERNAL_DEPENDENCY/,
  );
  const [latest] = getAiUsageRuns();
  // The rules that fail are the expensive ones; dropping them would make the
  // failure look free.
  assert.equal(latest?.totals.callCount, 1);
  assert.equal(latest?.totals.totalTokens, 15_500);
});

test("a truncated call is counted apart from an error and keeps its tokens", async () => {
  clearPricingEnv();
  const { report } = await captureAiRun("rule_preflight", async () => {
    recordAiCall(call({ completionTokens: 16_384, outcome: "truncated" }));
    recordAiCall(
      call({ completionTokens: null, outcome: "error", promptTokens: null }),
    );
  });
  assert.equal(report.totals.truncatedCallCount, 1);
  assert.equal(report.totals.errorCallCount, 1);
  assert.equal(report.totals.untokenizedCallCount, 1);
  assert.equal(report.totals.totalTokens, 15_300 + 16_384);
});

test("the provider's own cost wins over any configured price", async () => {
  clearPricingEnv();
  process.env.LLM_PRICE_TABLE_JSON = JSON.stringify({
    "openai/gpt-oss-120b": { inputPerMillionUsd: 1, outputPerMillionUsd: 1 },
  });
  const { report } = await captureAiRun("rule_preflight", async () => {
    recordAiCall(call({ providerCostUsd: 0.0042 }));
  });
  assert.equal(report.calls[0]?.costSource, "provider_reported");
  assert.equal(report.totals.costUsd, 0.0042);
  clearPricingEnv();
});

test("the price table prices a call the provider did not price", async () => {
  clearPricingEnv();
  process.env.LLM_PRICE_TABLE_JSON = JSON.stringify({
    "openai/gpt-oss-120b": {
      inputPerMillionUsd: 0.05,
      outputPerMillionUsd: 0.25,
    },
  });
  const { report } = await captureAiRun("rule_preflight", async () => {
    recordAiCall(call());
  });
  assert.equal(report.calls[0]?.costSource, "configured_model_rate");
  assert.equal(
    report.totals.costUsd,
    (15_300 / 1_000_000) * 0.05 + (200 / 1_000_000) * 0.25,
  );
  clearPricingEnv();
});

test("the flat rate is the last resort, and an unknown price is null, never zero", async () => {
  clearPricingEnv();
  process.env.LLM_ESTIMATED_COST_PER_1K_TOKENS_USD = "0.002";
  const { report: flat } = await captureAiRun("rule_preflight", async () => {
    recordAiCall(call());
  });
  assert.equal(flat.calls[0]?.costSource, "configured_flat_rate");
  assert.equal(flat.totals.costUsd, (15_500 / 1_000) * 0.002);

  clearPricingEnv();
  const { report: unpriced } = await captureAiRun("rule_preflight", async () => {
    recordAiCall(call());
  });
  // A zero here would read as "this run was free".
  assert.equal(unpriced.calls[0]?.costSource, "unavailable");
  assert.equal(unpriced.totals.costUsd, null);
  assert.equal(unpriced.totals.unpricedCallCount, 1);
});

test("a malformed price table is reported, not silently treated as empty", async () => {
  clearPricingEnv();
  process.env.LLM_PRICE_TABLE_JSON = '{"openai/gpt-oss-120b": {"inputPerMillionUsd": "free"}}';
  const status = getAiUsagePricingStatus();
  assert.match(status.configurationError ?? "", /LLM_PRICE_TABLE_JSON is unusable/);
  assert.deepEqual(status.pricedModels, []);
  clearPricingEnv();
  assert.equal(getAiUsagePricingStatus().configurationError, null);
});

test("resource figures are real and concurrent runs disclose the shared attribution", async () => {
  clearPricingEnv();
  const spin = () => {
    const until = performance.now() + 30;
    while (performance.now() < until) {
      // Busy work, so cpuTotalMs is measurably above zero.
    }
  };
  const [{ report: first }, { report: second }] = await Promise.all([
    captureAiRun("rule_preflight", async () => {
      spin();
      await new Promise((resolve) => setTimeout(resolve, 20));
      spin();
    }),
    captureAiRun("rule_preflight", async () => {
      spin();
      await new Promise((resolve) => setTimeout(resolve, 20));
    }),
  ]);

  for (const report of [first, second]) {
    assert.equal(report.resources.wallClockMs > 0, true);
    assert.equal(report.resources.cpuTotalMs > 0, true);
    assert.equal(report.resources.rssPeakBytes >= report.resources.rssStartBytes, true);
    assert.equal(report.resources.cpuCores > 0, true);
    assert.equal(report.resources.hostTotalMemoryBytes > 0, true);
    // process.cpuUsage() is process-wide: overlapping runs must say so instead
    // of presenting a shared measurement as a single-run one.
    assert.equal(report.resources.concurrentRunsPeak >= 2, true);
  }
  assert.equal(
    first.resources.hostLoadAverage1m === null ||
      typeof first.resources.hostLoadAverage1m === "number",
    true,
  );
});

test("a call recorded with no scope open is counted, not dropped in silence", async () => {
  clearPricingEnv();
  const before = getAiUsagePricingStatus().unscopedCallCount;
  recordAiCall(call({ step: "chat" }));
  assert.equal(getAiUsagePricingStatus().unscopedCallCount, before + 1);
  assert.deepEqual(getAiUsageRuns(), []);
});

test("run summaries survive an export/import round trip without the call rows", async () => {
  clearPricingEnv();
  await captureAiRun("rule_preflight", async () => {
    setAiRunSubject("42");
    recordAiCall(call());
  });
  const exported = exportAiUsageRunSummaries();
  assert.equal(exported.length, 1);
  assert.equal(Object.hasOwn(exported[0] ?? {}, "calls"), false);

  resetAiUsageRegistry();
  assert.deepEqual(getAiUsageRunSummaries(), []);

  importAiUsageRunSummaries(exported);
  const restored = getAiUsageRunSummaries();
  assert.equal(restored.length, 1);
  assert.equal(restored[0]?.subject, "42");
  assert.equal(restored[0]?.totals.totalTokens, 15_500);
  // The detail tier is in-memory only, so a restore brings back totals alone.
  assert.deepEqual(getAiUsageRuns(), []);
});
