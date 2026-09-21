import { performance } from "node:perf_hooks";
import { createRuleInterpretation } from "../src/index.ts";
import { getAiUsageRuns } from "../src/usage.ts";
import {
  assessCandidates,
  predicateCandidates,
  rankingCandidates,
} from "./jev-rule-composition.mjs";
import {
  cases,
  categoryQuestions,
  configuredValue,
  decide,
  openRouterKey,
  questions,
} from "./jev-rule-probe.mjs";

// One experimental Jev-first flow. It stops at an AST candidate or a question;
// the production validator, user approval, and submission are never bypassed.
const defaultCases = new Set([
  "set13-N1",
  "set13-N2",
  "set12-V1",
  "pt-N1",
  "pt-N2",
  "pt-vague",
  "outside-wallet",
]);
const requested = new Set(
  process.argv.slice(2).filter((argument) => !argument.startsWith("--")),
);
const selected = cases.filter((item) =>
  requested.size > 0 ? requested.has(item.id) : defaultCases.has(item.id),
);
if (selected.length === 0) throw new Error("No matching pipeline cases");
const dynamicClarification = process.argv.includes("--dynamic-clarification");
const GAME_DOMAIN =
  "A guess and a draw each contain exactly six distinct integer numbers from 1 through 100. Repeated numbers are impossible and these game mechanics are fixed.";

async function llmJson(state, task, field) {
  const model =
    configuredValue("LLM_MODEL_COMPILE", false) ??
    configuredValue("LLM_MODEL_INTERPRET", false) ??
    configuredValue("LLM_MODEL", false) ??
    configuredValue("LLM_PRIMARY_MODEL");
  const started = performance.now();
  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${openRouterKey()}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: task },
          {
            role: "user",
            content: JSON.stringify({ gameDomain: GAME_DOMAIN, ...state }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: `rule_${field}`,
            strict: true,
            schema: {
              type: "object",
              properties: {
                [field]: {
                  type: "array",
                  items: { type: "string" },
                  minItems: 1,
                  maxItems: 4,
                },
              },
              required: [field],
              additionalProperties: false,
            },
          },
        },
        max_tokens: 1024,
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `LLM HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`,
    );
  }
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error(
      `LLM did not return JSON text (content type: ${typeof content}; finish reason: ${body.choices?.[0]?.finish_reason ?? "missing"}; message fields: ${Object.keys(body.choices?.[0]?.message ?? {}).join(",")})`,
    );
  }
  const parsed = JSON.parse(content);
  const items = parsed?.[field];
  if (
    !Array.isArray(items) ||
    items.length < 1 ||
    items.length > 4 ||
    items.some(
      (item) =>
        typeof item !== "string" ||
        !item.trim() ||
        item.length > 240 ||
        /\p{Cf}/u.test(item),
    )
  ) {
    throw new Error(`LLM returned invalid ${field}`);
  }
  return {
    items,
    model: body.model ?? model,
    latencyMs: Math.round(performance.now() - started),
    costUsd: body.usage?.cost ?? null,
  };
}

for (const item of selected) {
  const started = performance.now();
  const facet = await decide({ proposal: item.text }, questions);
  const route = facet.answers.route?.choice ?? null;
  let candidate = null;
  let clarification = null;
  let outcome = "ESCALATE_GENERAL_LLM";
  let llmCostUsd = 0;
  let unpricedLlmCalls = 0;
  let categoryCostUsd = null;

  if (route === "clarify") {
    if (dynamicClarification) {
      const missing = await llmJson(
        { proposal: item.text },
        "Identify every material piece of information missing from this proposed lottery rule before it can be evaluated deterministically. Respect the fixed gameDomain in the input: never ask whether numbers can repeat or about any other fixed mechanic. Return concise missing-information categories, not questions. Do not invent a numerical threshold.",
        "categories",
      );
      const categoryScores = await decide(
        {
          gameDomain: GAME_DOMAIN,
          proposal: item.text,
          categories: missing.items,
        },
        Object.fromEntries(
          missing.items.map((_, index) => [
            `category_${index}`,
            {
              type: "noul",
              instructions: `Is categories[${index}] a material missing detail that the player must clarify before the proposed rule can be compiled faithfully?`,
            },
          ]),
        ),
      );
      categoryCostUsd = categoryScores.usage?.cost ?? null;
      const scored = missing.items.map((name, index) => ({
        name,
        noul: categoryScores.answers[`category_${index}`]?.noul ?? null,
      }));
      const formulated = await llmJson(
        { proposal: item.text, missingDetails: scored },
        "Ask the player clear, minimal questions that resolve every material missing detail in the proposed lottery rule. Respect the fixed gameDomain in the input; never ask about repeated numbers or other fixed mechanics. Jev probabilities indicate priority only; do not omit a necessary detail because its probability is low. Keep all questions specific and do not choose an answer for the player. Return English questions.",
        "questions",
      );
      llmCostUsd = (missing.costUsd ?? 0) + (formulated.costUsd ?? 0);
      unpricedLlmCalls =
        Number(missing.costUsd === null) + Number(formulated.costUsd === null);
      clarification = {
        questions: formulated.items,
        needsClarification: true,
        categories: scored,
        llmCalls: 2,
        unpricedLlmCalls,
        llmCategoryLatencyMs: missing.latencyMs,
        llmQuestionLatencyMs: formulated.latencyMs,
      };
      outcome = "ASK_PLAYER";
    } else {
      const interpreted = await createRuleInterpretation(item.text);
      const report = getAiUsageRuns(1)[0] ?? null;
      llmCostUsd = report?.totals.costUsd ?? 0;
      unpricedLlmCalls =
        report?.calls.filter((call) => call.costUsd === null).length ?? 0;
      // The LLM has generated the questions; Jev scores possible reasons for them.
      const categories = await decide(
        {
          proposal: item.text,
          llmQuestions: interpreted.clarificationQuestions,
        },
        Object.fromEntries(
          Object.entries(categoryQuestions).map(([key, instructions]) => [
            key,
            { type: "noul", instructions },
          ]),
        ),
      );
      categoryCostUsd = categories.usage?.cost ?? null;
      clarification = {
        questions: interpreted.clarificationQuestions,
        needsClarification: interpreted.needsClarification,
        categoryNoul: Object.fromEntries(
          Object.keys(categoryQuestions).map((key) => [
            key,
            categories.answers[key]?.noul ?? null,
          ]),
        ),
        llmCalls: report?.totals.callCount ?? null,
        unpricedLlmCalls,
      };
      outcome = interpreted.needsClarification
        ? "ASK_PLAYER"
        : "ESCALATE_ROUTE_DISAGREEMENT";
    }
  } else if (route === "unsupported") {
    outcome = "ESCALATE_POLICY_GATE";
  } else if (route === "defined") {
    const result = facet.answers.result?.choice;
    const composition = facet.answers.composition?.choice;
    let family = null;
    let build = null;
    if (result === "ranking" && composition === "eligibility") {
      family = "ranking";
      build = rankingCandidates;
    } else if (result === "predicate" && composition === "xor") {
      family = "predicate";
      build = predicateCandidates;
    }
    if (build) {
      const assessed = await assessCandidates(item.text, family, build);
      const visible = { ...assessed };
      delete visible.selectedAst;
      candidate = visible;
      outcome = assessed.wouldAccept
        ? "CANDIDATE_READY_FOR_EXISTING_VALIDATOR"
        : "ESCALATE_LOW_CANDIDATE_CONFIDENCE";
    }
  } else {
    outcome = "ESCALATE_UNREADABLE_ROUTE";
  }

  const jevCosts = [
    facet.usage?.cost ?? null,
    ...(candidate ? [candidate.usage?.cost ?? null] : []),
    ...(route === "clarify" ? [categoryCostUsd] : []),
  ];
  const jevCostUsd = jevCosts.reduce((sum, cost) => sum + (cost ?? 0), 0);
  const unpricedJevCalls = jevCosts.filter((cost) => cost === null).length;
  console.log(
    JSON.stringify({
      id: item.id,
      dynamicClarification,
      outcome,
      route,
      routeProbability: facet.answers.route?.probabilities?.[route] ?? null,
      completeNoul: facet.answers.complete?.noul ?? null,
      result: facet.answers.result?.choice ?? null,
      composition: facet.answers.composition?.choice ?? null,
      candidate,
      clarification,
      wallClockMs: Math.round(performance.now() - started),
      jevCostUsd,
      unpricedJevCalls,
      pricedLlmCostUsd: llmCostUsd,
      totalKnownCostUsd: jevCostUsd + llmCostUsd,
      unpricedLlmCalls,
    }),
  );
}
