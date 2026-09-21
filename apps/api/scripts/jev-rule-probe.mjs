import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";

// Experimental, read-only probe. No Jev answer is allowed to authorize a rule.
const ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
const MODEL = "~typesafe/jev-latest";
const PRICE_PER_MILLION_INPUT_TOKENS_USD = 0.042;

function configuredValue(name, required = true) {
  if (process.env[name]) return process.env[name];
  const line = readFileSync(new URL("../../../.env", import.meta.url), "utf8")
    .split(/\r?\n/u)
    .find((value) => value.startsWith(`${name}=`));
  const value = line?.slice(`${name}=`.length).trim();
  if (!value) {
    if (required) throw new Error(`${name} is not configured`);
    return null;
  }
  return value.replace(/^['"]|['"]$/gu, "");
}

function openRouterKey() {
  return configuredValue("API_KEY_OPENROUTER");
}

async function decide(state, questions) {
  const started = performance.now();
  const response = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      authorization: `Bearer ${openRouterKey()}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, state, questions }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json();
  if (!response.ok || !body.answers) {
    throw new Error(
      `Jev HTTP ${response.status}: ${JSON.stringify(body).slice(0, 500)}`,
    );
  }
  const promptTokens =
    body.usage?.prompt_tokens ?? body.usage?.input_tokens ?? null;
  return {
    answers: body.answers,
    model: body.model ?? null,
    latencyMs: Math.round(performance.now() - started),
    usage: body.usage ?? null,
    estimatedCostUsd:
      typeof promptTokens === "number"
        ? (promptTokens * PRICE_PER_MILLION_INPUT_TOKENS_USD) / 1_000_000
        : null,
  };
}

const cases = [
  {
    id: "set13-N1",
    baseline: "REFUSED",
    text: "Only tickets that match at least two of the drawn numbers are in the running. Among those, the ticket whose six numbers are packed into the smallest range between its lowest and its highest number wins, and tickets level on that range share the prize equally.",
    expected: {
      route: "defined",
      result: "ranking",
      composition: "eligibility",
      direction: "min",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "set13-N2",
    baseline: "VALID",
    text: "You win if exactly one of these two statements is true, and you lose if both are true or neither is: your six numbers add up to more than the six drawn numbers add up to, or your highest number was drawn.",
    expected: {
      route: "defined",
      result: "predicate",
      composition: "xor",
      direction: "none",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "set13-N3",
    baseline: "VALID",
    text: "Split your six numbers into the ones that were drawn and the ones that were not. You win if at least one of the numbers you missed ends in the same last digit as one of the numbers you got right.",
    expected: {
      route: "defined",
      result: "predicate",
      composition: "single",
      direction: "none",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "set13-N4",
    baseline: "VALID",
    text: "Line your six numbers up against the drawn numbers in mirror order: your first number against the last drawn number, your second against the fifth drawn, and so on to your sixth against the first drawn. You win if at least one of those mirrored pairs holds the same number on both sides.",
    expected: {
      route: "defined",
      result: "predicate",
      composition: "single",
      direction: "none",
      relation: "positional",
      orderMapping: "reversed",
    },
  },
  {
    id: "set12-N1",
    baseline: "VALID",
    text: "A guess wins if its six numbers leave more different remainders when divided by four than the six drawn numbers do.",
    expected: {
      route: "defined",
      result: "predicate",
      composition: "single",
      direction: "none",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "set12-N2",
    baseline: "VALID",
    text: "For each of your six numbers measure the distance to the nearest drawn number. The winning ticket is the one whose largest such distance is the smallest, and tickets level on that distance share the prize equally.",
    expected: {
      route: "defined",
      result: "ranking",
      composition: "single",
      direction: "min",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "set12-V1",
    baseline: "CLARIFY",
    text: "You win if at least three of your numbers were drawn, or if the rest of them are very close to the drawn numbers.",
    expected: {
      route: "clarify",
      result: "predicate",
      composition: "or",
      direction: "none",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "set12-V2",
    baseline: "CLARIFY",
    text: "You do not win unless none of your numbers sits too far from every drawn number.",
    expected: {
      route: "clarify",
      result: "predicate",
      composition: "single",
      direction: "none",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "outside-wallet",
    baseline: "UNSUPPORTED_BY_PRD",
    text: "You win if your wallet holds at least 2 SOL when the draw happens.",
    expected: {
      route: "unsupported",
      result: "predicate",
      composition: "single",
      direction: "none",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "pt-N1",
    baseline: "NOT_MEASURED",
    text: "Só concorrem bilhetes com pelo menos dois números sorteados. Entre eles, ganha o bilhete com a menor diferença entre seu maior e seu menor número. Bilhetes empatados dividem o prêmio.",
    expected: {
      route: "defined",
      result: "ranking",
      composition: "eligibility",
      direction: "min",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "pt-N2",
    baseline: "NOT_MEASURED",
    text: "Você ganha se exatamente uma destas condições for verdadeira, mas perde se ambas ou nenhuma forem: a soma dos seus seis números é maior que a soma dos seis números sorteados; ou o seu maior número foi sorteado.",
    expected: {
      route: "defined",
      result: "predicate",
      composition: "xor",
      direction: "none",
      relation: "unordered",
      orderMapping: "none",
    },
  },
  {
    id: "pt-vague",
    baseline: "NOT_MEASURED",
    text: "Você ganha se três números acertarem ou se os demais ficarem bem perto dos sorteados.",
    expected: {
      route: "clarify",
      result: "predicate",
      composition: "or",
      direction: "none",
      relation: "unordered",
      orderMapping: "none",
    },
  },
];

const questions = {
  route: {
    type: "choice",
    instructions:
      "Can the player's entire winning condition be determined objectively from only the six guessed numbers and six drawn numbers, without guessing missing meanings?",
    criteria: {
      defined:
        "Every material term and comparison is defined, and only guess and draw are needed.",
      clarify:
        "The player must specify at least one missing term, grouping, threshold, or scope.",
      unsupported:
        "The condition needs outside information, other players' private state, or an unsupported source.",
    },
  },
  result: {
    type: "choice",
    instructions:
      "Does the text define a winning condition for each ticket independently, or compare eligible tickets to choose the best?",
    criteria: {
      predicate:
        "Each ticket either wins or loses independently of other tickets.",
      ranking:
        "The winner is the eligible ticket with the best score compared with other tickets.",
      unclear: "The text does not say enough to choose predicate or ranking.",
    },
  },
  composition: {
    type: "choice",
    instructions:
      "What is the top-level relation between the player's material conditions? Choose eligibility when one clause determines who can compete and another ranks qualified tickets.",
    criteria: {
      single:
        "One condition, possibly with nested calculations or quantifiers.",
      and: "All independent conditions must hold.",
      or: "At least one independent condition must hold, including when both hold.",
      xor: "Exactly one of two conditions must hold, excluding both and neither.",
      eligibility:
        "A qualification gate limits which tickets may enter a ranking.",
      unclear: "The scope or grouping of conditions is unspecified.",
    },
  },
  direction: {
    type: "choice",
    instructions:
      "If this is a ranking, is a lower or higher calculated score better? If it is not a ranking, choose none.",
    criteria: {
      min: "Lower calculated score wins.",
      max: "Higher calculated score wins.",
      none: "There is no comparative ranking score.",
      unclear: "A ranking is intended but direction is unspecified.",
    },
  },
  relation: {
    type: "choice",
    instructions:
      "Do corresponding positions in the player's entered order matter to the winning test?",
    criteria: {
      positional: "Yes, corresponding entered positions are compared.",
      unordered:
        "No, the rule uses sets, counts, sums, digits, extrema, or sorted values without entered-position correspondence.",
      unclear: "The text does not make order semantics clear.",
    },
  },
  orderMapping: {
    type: "choice",
    instructions:
      "If positions matter, how does the player map their six entered positions to the draw's six positions?",
    criteria: {
      same: "The player's first value is compared with the draw's first, and so on.",
      reversed:
        "The player's first value is compared with the draw's last, second with fifth, and so on.",
      none: "No entered-position pairing is required.",
      unclear: "Pairing matters, but the mapping is not specified.",
    },
  },
  complete: {
    type: "noul",
    instructions:
      "Is every material part of the player's proposed winning condition objectively specified by the text, using only the player's six numbers and the draw's six numbers?",
  },
};

const categoryQuestions = {
  threshold:
    "Does the player need to give an exact numeric distance, count, or boundary before this rule can be compiled?",
  reference:
    "Does the player need to define which derived value or reference point a term denotes before this rule can be compiled?",
  grouping:
    "Does the player need to clarify arithmetic grouping or precedence before this rule can be compiled?",
  direction:
    "Does the player need to specify which side or direction of a comparison counts before this rule can be compiled?",
  quantity:
    "Does the player need to specify whether a stated quantity means exactly, at least, or at most that many before this rule can be compiled?",
  scope:
    "Does the player need to clarify the scope of a negation or quantifier before this rule can be compiled?",
};

export {
  cases,
  decide,
  questions,
  categoryQuestions,
  configuredValue,
  openRouterKey,
};

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  if (process.argv.includes("--clarification")) {
    const ambiguous = [
      {
        id: "set12-V1",
        text: cases.find((item) => item.id === "set12-V1").text,
        expected: ["threshold"],
      },
      {
        id: "set12-V2",
        text: cases.find((item) => item.id === "set12-V2").text,
        expected: ["threshold", "scope"],
      },
      {
        id: "set13-V1",
        text: "You win if your highest number minus your lowest plus how many of your numbers were drawn is more than forty.",
        expected: ["grouping"],
      },
      {
        id: "set13-V2",
        text: "You win if half your numbers land on the far side of the middle of the draw.",
        expected: ["reference", "direction", "quantity"],
      },
    ];
    for (const item of ambiguous) {
      const result = await decide(
        { proposal: item.text },
        Object.fromEntries(
          Object.entries(categoryQuestions).map(([key, instructions]) => [
            key,
            { type: "noul", instructions },
          ]),
        ),
      );
      const probabilities = Object.fromEntries(
        Object.keys(categoryQuestions).map((key) => [
          key,
          result.answers[key]?.noul ?? null,
        ]),
      );
      console.log(
        JSON.stringify({
          id: item.id,
          expected: item.expected,
          probabilities,
          topCategories: Object.entries(probabilities)
            .sort((a, b) => b[1] - a[1])
            .slice(0, item.expected.length)
            .map(([key]) => key),
          latencyMs: result.latencyMs,
          model: result.model,
          usage: result.usage,
        }),
      );
    }
  } else {
    const selected = cases.filter(
      (item) =>
        process.argv.length <= 2 || process.argv.slice(2).includes(item.id),
    );
    if (selected.length === 0) throw new Error("No matching probe cases");
    for (const item of selected) {
      const result = await decide({ proposal: item.text }, questions);
      const predicted = Object.fromEntries(
        Object.keys(item.expected).map((key) => [
          key,
          result.answers[key]?.choice ?? null,
        ]),
      );
      const correct = Object.fromEntries(
        Object.entries(item.expected).map(([key, value]) => [
          key,
          predicted[key] === value,
        ]),
      );
      console.log(
        JSON.stringify({
          id: item.id,
          baseline: item.baseline,
          expected: item.expected,
          predicted,
          correct,
          probabilities: Object.fromEntries(
            Object.keys(item.expected).map((key) => [
              key,
              result.answers[key]?.probabilities ?? null,
            ]),
          ),
          completeNoul: result.answers.complete?.noul ?? null,
          latencyMs: result.latencyMs,
          model: result.model,
          usage: result.usage,
          providerCostUsd: result.usage?.cost ?? null,
          estimatedCostUsd: result.estimatedCostUsd,
        }),
      );
    }
  }
}
