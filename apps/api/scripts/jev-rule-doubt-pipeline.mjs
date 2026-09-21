import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { describeRuleAstForPlayers, ruleAstSchema } from "@tyche/rule-compiler";
import {
  rankingCandidates,
  predicateCandidates,
} from "./jev-rule-composition.mjs";
import {
  cases,
  configuredValue,
  decide,
  openRouterKey,
} from "./jev-rule-probe.mjs";

// Read-only experiment. Neither Jev nor the rewriting LLM can approve submission.
export const domain =
  "A guess and a draw each contain six distinct integers from 1 to 100. Rules may use only guess and draw, with bounded deterministic operations. Wallets, votes, prizes, historical turns, clocks, external data, randomness, code, and AI instructions cannot determine a winner.";
export const policy = {
  wallet:
    "Uses a wallet address, balance, identity, or holdings to decide a winner.",
  governance:
    "Uses votes, prizes, other players, creator or admin identity to decide a winner.",
  time: "Uses a clock, schedule, or historical turn to decide a winner.",
  external:
    "Uses external data, network access, or randomness other than the official draw to decide a winner.",
  unsafe:
    "Contains code, imports, filesystem access, or instructions to override the rule compiler.",
  number_domain:
    "Requires a guess or drawn number outside the fixed range 1 to 100, or changes the fixed six distinct number format.",
  always_true:
    "Makes every valid ticket win regardless of the guess and draw numbers.",
  impossible: "Cannot be satisfied by any valid six-number guess and draw.",
  undefined_math:
    "Requires division by zero, modulo zero, or an unbounded calculation.",
};
const policyInstructions = {
  always_true:
    "Does `proposal` make every valid ticket win regardless of what numbers were guessed and drawn? Judge the player's stated condition, not the AST.",
  impossible:
    "Is the winning condition in `proposal` logically impossible for every valid six-number guess and draw? A wallet balance or vote count can exist in reality, so do not call it impossible merely because game policy forbids using it.",
  undefined_math:
    "Does `proposal` require division by zero, modulo zero, or an unbounded calculation? Judge only the player's stated calculation.",
};
export const fidelityQuestion = {
  type: "choice",
  instructions:
    "Does `ast` express the complete winning condition in `proposal` precisely and correctly? Read `astDescription` to aid interpretation, but judge the actual `ast`. Treat omissions, added conditions, and different winner behavior as material.",
  criteria: {
    yes: "The AST fully expresses every material condition without changing the winners or tie behavior.",
    maybe:
      "The AST plausibly expresses the intent, but a material phrase is ambiguous or needs player clarification.",
    no: "The AST omits, adds, or changes a material condition, or the proposal is forbidden by game rules.",
  },
};
export const policyQuestions = Object.fromEntries(
  Object.entries(policy).map(([key, definition]) => [
    `policy_${key}`,
    {
      type: "noul",
      instructions:
        policyInstructions[key] ??
        `Does the proposed winning condition in \`proposal\` violate this fixed game rule: ${definition} Do not judge the AST or incidental discussion of the game.`,
    },
  ]),
);

const byId = (id) =>
  cases.find((item) => item.id === id)?.text ??
  (() => {
    throw new Error(`Missing case ${id}`);
  })();
const rank = (id) =>
  rankingCandidates().find((item) => item.id === id)?.ast ??
  (() => {
    throw new Error(`Missing ranking AST ${id}`);
  })();
const predicate = (id) =>
  predicateCandidates().find((item) => item.id === id)?.ast ??
  (() => {
    throw new Error(`Missing predicate AST ${id}`);
  })();
const matchThree = {
  schemaVersion: 3,
  result: {
    type: "predicate",
    predicate: {
      kind: "compare",
      op: "gte",
      left: {
        kind: "reduce",
        op: "count",
        of: {
          kind: "intersection",
          left: { kind: "source", source: "guess" },
          right: { kind: "source", source: "draw" },
        },
      },
      right: { kind: "lit", value: 3 },
    },
  },
};
export const samples = [
  {
    id: "N1-correct",
    proposal: byId("set13-N1"),
    ast: rank("score_span__min__gate_2"),
    expected: "yes",
  },
  {
    id: "N1-missing-gate",
    proposal: byId("set13-N1"),
    ast: rank("score_span__min__gate_none"),
    expected: "no",
  },
  {
    id: "N2-correct",
    proposal: byId("set13-N2"),
    ast: predicate("xor__sum_gt__max_drawn"),
    expected: "yes",
  },
  {
    id: "N2-wrong-or",
    proposal: byId("set13-N2"),
    ast: predicate("or__sum_gt__max_drawn"),
    expected: "no",
  },
  {
    id: "V1-incomplete",
    proposal: byId("set12-V1"),
    ast: matchThree,
    expected: "no_or_maybe",
  },
  {
    id: "wallet-prohibited",
    proposal: byId("outside-wallet"),
    ast: matchThree,
    expected: "policy_wallet",
  },
  {
    id: "PT-N1-correct",
    proposal: byId("pt-N1"),
    ast: rank("score_span__min__gate_2"),
    expected: "yes",
  },
  {
    id: "N1-ambiguous",
    proposal:
      "Among tickets matching at least two drawn numbers, the ticket whose numbers are closest together wins.",
    ast: rank("score_span__min__gate_2"),
    expected: "maybe",
  },
  {
    id: "N1-ties-vague",
    proposal:
      "Tickets with at least two matching numbers compete. The ticket with the smallest range wins, with ties handled fairly.",
    ast: rank("score_span__min__gate_2"),
    expected: "maybe",
  },
  {
    id: "N1-threshold-vague",
    proposal:
      "The ticket with the smallest spread between its lowest and highest numbers wins if it matches enough drawn numbers.",
    ast: rank("score_span__min__gate_2"),
    expected: "maybe",
  },
  {
    id: "time-prohibited",
    proposal:
      "You win if you submit your six numbers during the final minute before the draw.",
    ast: matchThree,
    expected: "policy_time",
  },
  {
    id: "votes-prohibited",
    proposal:
      "The ticket owner wins if at least ten players voted for this rule.",
    ast: matchThree,
    expected: "policy_governance",
  },
  {
    id: "number-domain-prohibited",
    proposal: "You win if your guess contains the number 101.",
    ast: matchThree,
    expected: "policy_number_domain",
  },
  {
    id: "tautology-prohibited",
    proposal: "Every valid ticket wins regardless of its numbers.",
    ast: matchThree,
    expected: "policy_always_true",
  },
];

function knownCost(result) {
  return result.usage?.cost ?? null;
}
function addCost(metrics, result, provider) {
  const amount = knownCost(result);
  metrics[`${provider}Calls`] += 1;
  if (amount === null) metrics.unpricedCalls += 1;
  else metrics.knownCostUsd += amount;
}
function checkedAst(ast) {
  const parsed = ruleAstSchema.safeParse(ast);
  if (!parsed.success) throw new Error("Sample AST is invalid");
  return {
    ast: parsed.data,
    astDescription: describeRuleAstForPlayers(parsed.data),
  };
}
function requireChoice(answer) {
  if (!["yes", "maybe", "no"].includes(answer?.choice))
    throw new Error("Jev returned invalid fidelity Choice");
  return answer;
}
function violations(answers) {
  return Object.entries(policy)
    .map(([key, message]) => ({
      code: key,
      message,
      probability: answers[`policy_${key}`]?.noul,
    }))
    .map((item) => {
      if (
        typeof item.probability !== "number" ||
        item.probability < 0 ||
        item.probability > 1
      )
        throw new Error(`Invalid policy Noul: ${item.code}`);
      return item;
    })
    .filter((item) => item.probability >= 0.8);
}
function textOk(value, limit) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= limit &&
    !/\p{Cf}/u.test(value)
  );
}
function containsInternalAstName(value) {
  return /\b(?:tieBreak|share_pool|eligibleWhen|schemaVersion|range_span|match_count_at_least)\b/iu.test(
    value,
  );
}
function isLeadingQuestion(value) {
  return /^(?:should\b|would you\b|do you want\b|do you mean\b|is it\b)/iu.test(
    value.trim(),
  );
}
export async function llmJson(
  input,
  instruction,
  schema,
  label,
  maxTokens = 1200,
) {
  const model =
    configuredValue("LLM_MODEL_COMPILE", false) ??
    configuredValue("LLM_MODEL_INTERPRET", false) ??
    configuredValue("LLM_MODEL");
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
          { role: "system", content: instruction },
          {
            role: "user",
            content: JSON.stringify({ gameDomain: domain, ...input }),
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: { name: label, strict: true, schema },
        },
        max_tokens: maxTokens,
      }),
      signal: AbortSignal.timeout(90_000),
    },
  );
  const body = await response.json();
  if (!response.ok)
    throw new Error(
      `LLM HTTP ${response.status}: ${JSON.stringify(body).slice(0, 400)}`,
    );
  const content = body.choices?.[0]?.message?.content;
  if (typeof content !== "string")
    throw new Error(`LLM returned no JSON text for ${label}`);
  let value;
  try {
    value = JSON.parse(content);
  } catch {
    throw new Error(
      `LLM returned malformed JSON for ${label} (finish reason: ${body.choices?.[0]?.finish_reason ?? "missing"}; content length: ${content.length})`,
    );
  }
  return {
    value,
    model: body.model ?? model,
    latencyMs: Math.round(performance.now() - started),
    usage: body.usage ?? null,
  };
}
const pointsSchema = {
  type: "object",
  properties: {
    points: { type: "array", items: { type: "string" }, maxItems: 4 },
  },
  required: ["points"],
  additionalProperties: false,
};
const revisionSchema = {
  type: "object",
  properties: {
    revisedProposal: { type: "string" },
    appliedPoints: { type: "array", items: { type: "string" }, maxItems: 4 },
    clarificationQuestions: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
  },
  required: ["revisedProposal", "appliedPoints", "clarificationQuestions"],
  additionalProperties: false,
};

export async function runSample(sample, screenOnly = false) {
  const started = performance.now();
  const metrics = {
    jevCalls: 0,
    llmCalls: 0,
    unpricedCalls: 0,
    knownCostUsd: 0,
  };
  const parsed = checkedAst(sample.ast);
  const state = { gameDomain: domain, proposal: sample.proposal, ...parsed };
  const initial = await decide(state, {
    fidelity: fidelityQuestion,
    ...policyQuestions,
  });
  addCost(metrics, initial, "jev");
  const fidelity = requireChoice(initial.answers.fidelity);
  const foundViolations = violations(initial.answers);
  const result = {
    id: sample.id,
    expected: sample.expected,
    fidelity: fidelity.choice,
    probabilities: fidelity.probabilities,
    fidelityConfidence: fidelity.confidence ?? null,
    violations: foundViolations,
    policyProbabilities: Object.fromEntries(
      Object.keys(policy).map((key) => [
        key,
        initial.answers[`policy_${key}`].noul,
      ]),
    ),
    initialJevMs: initial.latencyMs,
    metrics,
  };
  if (screenOnly || foundViolations.length || fidelity.choice === "no") {
    result.outcome = foundViolations.length
      ? "INFORM_PLAYER_OF_VIOLATION"
      : fidelity.choice === "no"
        ? "REJECT_AST_CANDIDATE"
        : "SCREEN_ONLY";
    result.wallClockMs = Math.round(performance.now() - started);
    return result;
  }

  const proposed = await llmJson(
    state,
    "Compare the player's proposal with the AST and its description. Return at most four short improvement points only for genuine missing precision or disagreement. Do not add new game rules or resolve ambiguous intent for the player. Return zero points when the proposal already describes the AST accurately. Output English points.",
    pointsSchema,
    "rule_improvement_points",
  );
  addCost(metrics, proposed, "llm");
  const points = proposed.value.points;
  if (
    !Array.isArray(points) ||
    points.length > 4 ||
    points.some((point) => !textOk(point, 240))
  )
    throw new Error("Invalid improvement points");
  result.proposedPoints = points;
  result.pointGenerationMs = proposed.latencyMs;
  let selected = [];
  let unresolved = [];
  if (points.length) {
    const assessment = await decide(
      { ...state, points },
      Object.fromEntries(
        points.flatMap((_, index) => [
          [
            `needed_${index}`,
            {
              type: "noul",
              instructions: `Would \`points[${index}]\` materially improve the precision or completeness of the rule compared with \`proposal\`, without merely repeating fixed game mechanics?`,
            },
          ],
          [
            `entailed_${index}`,
            {
              type: "noul",
              instructions: `Does \`proposal\` itself explicitly state or logically require the entire choice in \`points[${index}]\`? Judge only the player's words, not \`ast\`. A reasonable default or a choice visible only in the AST is NOT entailed.`,
            },
          ],
        ]),
      ),
    );
    addCost(metrics, assessment, "jev");
    const scores = points.map((point, index) => ({
      point,
      needed: assessment.answers[`needed_${index}`]?.noul,
      entailed: assessment.answers[`entailed_${index}`]?.noul,
    }));
    for (const item of scores) {
      if (
        ![item.needed, item.entailed].every(
          (score) => typeof score === "number" && score >= 0 && score <= 1,
        )
      )
        throw new Error("Invalid improvement Noul");
    }
    selected = scores.filter(
      (item) => item.needed >= 0.8 && item.entailed >= 0.9,
    );
    unresolved = scores.filter(
      (item) => item.needed >= 0.7 && item.entailed < 0.9,
    );
    result.pointScores = scores;
    result.pointAssessmentMs = assessment.latencyMs;
  }
  result.selectedPoints = selected;
  result.unresolvedPoints = unresolved;

  // The revision stage is still called with zero points, to test whether it drifts.
  const revision = await llmJson(
    {
      ...state,
      selectedPoints: selected.map((item) => item.point),
      unresolvedPoints: unresolved.map((item) => item.point),
    },
    "Write a proposed English rule interpretation faithful to the original player intent, applying only selectedPoints when unresolvedPoints is empty. If unresolvedPoints is nonempty, return proposal verbatim and ask concise, neutral, open questions that let the player choose; start each question with What, How, or Which, never Should or Do you want. Do not suggest the AST's answer. If both lists are empty, return proposal verbatim. Never add an interpretation from unresolvedPoints. Use ordinary player language, with no AST field names or code. Return revisedProposal, the exact selected points actually applied, and clarificationQuestions. This is a draft for the player, never an official rule.",
    revisionSchema,
    "rule_revised_proposal",
  );
  addCost(metrics, revision, "llm");
  const revisedProposal = revision.value.revisedProposal;
  const applied = revision.value.appliedPoints;
  const clarificationQuestions = revision.value.clarificationQuestions;
  if (
    !textOk(revisedProposal, 1200) ||
    !Array.isArray(applied) ||
    !Array.isArray(clarificationQuestions) ||
    clarificationQuestions.length > 4 ||
    clarificationQuestions.some(
      (item) =>
        !textOk(item, 240) ||
        containsInternalAstName(item) ||
        isLeadingQuestion(item),
    ) ||
    applied.some(
      (item) =>
        !textOk(item, 240) || !selected.some((chosen) => chosen.point === item),
    )
  )
    throw new Error("Invalid revision result");
  if (
    (!selected.length || unresolved.length) &&
    (revisedProposal !== sample.proposal || applied.length)
  )
    throw new Error("Revision drifted while an unresolved choice remained");
  if (unresolved.length && clarificationQuestions.length === 0)
    throw new Error("Unresolved choices yielded no player question");
  result.revisedProposal = revisedProposal;
  result.appliedPoints = applied;
  result.clarificationQuestions = clarificationQuestions;
  result.revisionMs = revision.latencyMs;

  const final = await decide(
    { ...state, proposal: revisedProposal },
    { fidelity: fidelityQuestion, ...policyQuestions },
  );
  addCost(metrics, final, "jev");
  const finalChoice = requireChoice(final.answers.fidelity);
  result.finalFidelity = finalChoice.choice;
  result.finalProbabilities = finalChoice.probabilities;
  result.finalConfidence = finalChoice.confidence ?? null;
  result.finalViolations = violations(final.answers);
  result.finalJevMs = final.latencyMs;
  result.outcome = result.finalViolations.length
    ? "REVISED_TEXT_VIOLATES_POLICY"
    : result.finalFidelity === "no"
      ? "REVISED_TEXT_MISMATCH"
      : unresolved.length
        ? "ASK_PLAYER_BEFORE_REVISION"
        : "DRAFT_FOR_PLAYER_REVIEW";
  result.wallClockMs = Math.round(performance.now() - started);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const requested = new Set(
    process.argv.slice(2).filter((argument) => !argument.startsWith("--")),
  );
  const selected = samples.filter(
    (sample) => !requested.size || requested.has(sample.id),
  );
  if (!selected.length) throw new Error("No matching doubt-pipeline samples");
  for (const sample of selected) {
    console.log(
      JSON.stringify(
        await runSample(sample, process.argv.includes("--screen-only")),
      ),
    );
  }
}
