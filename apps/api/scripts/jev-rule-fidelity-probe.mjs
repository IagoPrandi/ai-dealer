import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { describeRuleAstForPlayers, ruleAstSchema } from "@tyche/rule-compiler";
import { decide } from "./jev-rule-probe.mjs";
import {
  domain,
  llmJson,
  policyQuestions,
  samples,
} from "./jev-rule-doubt-pipeline.mjs";

// Read-only comparison: structural fit versus two directions of semantic fidelity.
// The ASTs are prebuilt test candidates. This file cannot submit a rule.
const fixtureIds = [
  "N1-correct",
  "PT-N1-correct",
  "N2-correct",
  "N1-ambiguous",
  "N1-ties-vague",
  "N1-threshold-vague",
  "N1-missing-gate",
  "N2-wrong-or",
  "V1-incomplete",
];
const goldAstSupported = {
  "N1-correct": true,
  "PT-N1-correct": true,
  "N2-correct": true,
  "N1-ambiguous": false,
  "N1-ties-vague": false,
  "N1-threshold-vague": false,
  "N1-missing-gate": false,
  "N2-wrong-or": false,
  "V1-incomplete": false,
};
const goldProposalCovered = {
  "N1-correct": true,
  "PT-N1-correct": true,
  "N2-correct": true,
  "N1-ambiguous": null,
  "N1-ties-vague": null,
  "N1-threshold-vague": null,
  "N1-missing-gate": false,
  "N2-wrong-or": false,
  "V1-incomplete": false,
};
const structureQuestion = {
  type: "choice",
  instructions:
    "Does `ast` preserve the main winning-rule structure and logic in `proposal`? Judge the broad eligibility, ranking or predicate mechanism. A plausible but unapproved choice for an operational detail can still count as yes here; separate questions test strict clause fidelity. A missing core branch or different winner mechanism is no.",
  criteria: {
    yes: "The AST has the same core winning mechanism, although some operational details may need the player's approval.",
    maybe:
      "Part of the core mechanism matches, but the intended rule family or a major branch is unclear.",
    no: "The AST omits or changes a core winning condition or mechanism.",
  },
};

const supportInstructions =
  "Is every material executable condition in `ast` explicitly stated or logically required by the player's `proposal`? Check numerical thresholds, meaning of measurements, and ties. A plausible completion or game default is not evidence from the player. Equivalent paraphrases count as stated. Judge AST-to-proposal support only.";
const coverageInstructions =
  "Does `ast` implement every material winning condition stated in the player's `proposal`, with no stated condition omitted or weakened? Judge proposal-to-AST coverage only; an extra AST condition belongs to the other question.";
function pair(instructions) {
  return {
    noul: { type: "noul", instructions },
    choice: {
      type: "choice",
      instructions,
      criteria: {
        yes: "Every material condition in the direction asked is semantically covered.",
        no: "At least one material condition in the direction asked is unsupported or omitted.",
      },
    },
  };
}
const support = pair(supportInstructions);
const coverage = pair(coverageInstructions);
function rankingFacts(ast) {
  if (ast.result.type !== "ranking") return [];
  const result = ast.result;
  const facts = [];
  if (result.eligibleWhen) {
    const threshold = result.eligibleWhen.right?.value;
    if (typeof threshold !== "number")
      throw new Error("Unexpected eligibility AST");
    facts.push({
      id: "eligibility",
      text: `A ticket needs at least ${threshold} matches between the guessed and drawn numbers to be eligible.`,
    });
  }
  if (result.score?.op !== "range_span" || result.direction !== "min")
    throw new Error("Unexpected ranking score AST");
  facts.push({
    id: "ranking",
    text: `${result.eligibleWhen ? "Among eligible tickets, the ticket" : "The ticket"} with the smallest difference between its highest and lowest guessed numbers wins.`,
  });
  if (result.tieBreak !== "share_pool") throw new Error("Unexpected tie AST");
  facts.push({
    id: "tie",
    text: "Equally ranked winning tickets share the prize equally.",
  });
  return facts;
}
function readNoul(answer, name) {
  if (typeof answer?.noul !== "number" || answer.noul < 0 || answer.noul > 1)
    throw new Error(`Invalid ${name} Noul`);
  return answer.noul;
}
function readChoice(answer, name) {
  if (
    !["yes", "no"].includes(answer?.choice) ||
    typeof answer.probabilities?.yes !== "number" ||
    typeof answer.probabilities?.no !== "number" ||
    typeof answer.confidence !== "number"
  )
    throw new Error(`Invalid ${name} Choice`);
  return {
    choice: answer.choice,
    probabilities: answer.probabilities,
    confidence: answer.confidence,
  };
}
function metrics() {
  return { jevCalls: 0, llmCalls: 0, unpricedCalls: 0, knownCostUsd: 0 };
}
function record(metric, result, provider) {
  metric[`${provider}Calls`] += 1;
  if (typeof result.usage?.cost === "number")
    metric.knownCostUsd += result.usage.cost;
  else metric.unpricedCalls += 1;
}
function validText(value, max = 300) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max &&
    !/\p{Cf}/u.test(value)
  );
}

const issuesSchema = {
  type: "object",
  properties: {
    issues: {
      type: "array",
      maxItems: 7,
      items: {
        type: "object",
        properties: {
          id: { type: "string" },
          gap: { type: "string" },
          choices: {
            type: "array",
            minItems: 1,
            maxItems: 3,
            items: { type: "string" },
          },
        },
        required: ["id", "gap", "choices"],
        additionalProperties: false,
      },
    },
  },
  required: ["issues"],
  additionalProperties: false,
};
const draftSchema = {
  type: "object",
  properties: {
    proposedRevision: { type: "string" },
    suggestedVersionForApproval: { type: "string" },
    improvementsForPlayer: {
      type: "array",
      maxItems: 7,
      items: { type: "string" },
    },
    questionsForPlayer: {
      type: "array",
      maxItems: 7,
      items: { type: "string" },
    },
    assumptionsForApproval: {
      type: "array",
      maxItems: 7,
      items: { type: "string" },
    },
  },
  required: [
    "proposedRevision",
    "suggestedVersionForApproval",
    "improvementsForPlayer",
    "questionsForPlayer",
    "assumptionsForApproval",
  ],
  additionalProperties: false,
};

export async function runFidelity(sample, pipeline = false) {
  const started = performance.now();
  const parsed = ruleAstSchema.safeParse(sample.ast);
  if (!parsed.success) throw new Error(`Invalid AST in ${sample.id}`);
  const ast = parsed.data;
  const facts = rankingFacts(ast);
  const state = {
    gameDomain: domain,
    proposal: sample.proposal,
    ast,
    astDescription: describeRuleAstForPlayers(ast),
    astFacts: facts,
  };
  const questions = {
    broad: structureQuestion,
    ast_supported_noul: support.noul,
    ast_supported_choice: support.choice,
    proposal_covered_noul: coverage.noul,
    proposal_covered_choice: coverage.choice,
    ...Object.fromEntries(
      facts.map((fact, i) => [
        `fact_${i}`,
        {
          type: "noul",
          instructions: `Is \`astFacts[${i}].text\` explicitly stated or logically required by \`proposal\`? A plausible default does not count.`,
        },
      ]),
    ),
    ...policyQuestions,
  };
  const metric = metrics();
  const screened = await decide(state, questions);
  record(metric, screened, "jev");
  const answers = screened.answers;
  const broad = answers.broad;
  if (!["yes", "maybe", "no"].includes(broad?.choice))
    throw new Error("Invalid broad Choice");
  const result = {
    id: sample.id,
    goldAstSupported: goldAstSupported[sample.id],
    goldProposalCovered: goldProposalCovered[sample.id],
    broad: {
      choice: broad.choice,
      probabilities: broad.probabilities,
      confidence: broad.confidence,
    },
    astSupported: {
      noul: readNoul(answers.ast_supported_noul, "support"),
      choice: readChoice(answers.ast_supported_choice, "support"),
    },
    proposalCovered: {
      noul: readNoul(answers.proposal_covered_noul, "coverage"),
      choice: readChoice(answers.proposal_covered_choice, "coverage"),
    },
    factScores: facts.map((fact, i) => ({
      ...fact,
      noul: readNoul(answers[`fact_${i}`], fact.id),
    })),
    policyHits: Object.keys(policyQuestions)
      .filter((key) => readNoul(answers[key], key) >= 0.8)
      .map((key) => key.slice(7)),
    jevMs: screened.latencyMs,
    metric,
  };
  if (!pipeline) {
    result.wallClockMs = Math.round(performance.now() - started);
    return result;
  }
  if (result.policyHits.length) {
    result.outcome = "POLICY_REVIEW";
    result.wallClockMs = Math.round(performance.now() - started);
    return result;
  }
  // Both directions matter: an AST can add a clause or omit one.
  const strictPass =
    result.broad.choice === "yes" &&
    result.broad.probabilities.yes >= 0.7 &&
    result.broad.confidence >= 0.7 &&
    result.astSupported.noul >= 0.7 &&
    result.proposalCovered.noul >= 0.7 &&
    result.factScores.every((fact) => fact.noul >= 0.9);
  if (strictPass) {
    result.outcome = "STRICT_FIDELITY_CANDIDATE";
    result.wallClockMs = Math.round(performance.now() - started);
    return result;
  }

  const generated = await llmJson(
    {
      proposal: sample.proposal,
      ast,
      astFacts: facts,
      fidelity: result.astSupported,
      coverage: result.proposalCovered,
    },
    "Identify exhaustively every material mismatch or unresolved choice between the player's proposal and the candidate AST, in both directions. Check each astFact and each player condition. The AST operators have fixed semantics: range_span is exactly max(guess)-min(guess); do not ask the player to define an implementation operator. Do not invent an issue for an explicitly matching clause: 'at least two' already means two or more. Focus only on winning-rule semantics; do not ask about fixed game mechanics, payout when no ticket qualifies, or implementation names. Return distinct issues, each with a short gap and 1-3 concrete possible interpretations for Jev to compare. Every option must use only guess/draw and allowed bounded deterministic operations; never suggest new randomness, wallet data, votes, another player's data, or input arrival order. Do not silently choose for the player. English output.",
    issuesSchema,
    "rule_fidelity_issues",
    2400,
  );
  record(metric, generated, "llm");
  const issues = generated.value.issues;
  if (
    !Array.isArray(issues) ||
    issues.length < 1 ||
    issues.length > 7 ||
    issues.some(
      (issue) =>
        !validText(issue.id, 60) ||
        !validText(issue.gap) ||
        !Array.isArray(issue.choices) ||
        issue.choices.length < 1 ||
        issue.choices.length > 3 ||
        issue.choices.some((choice) => !validText(choice)),
    )
  )
    throw new Error("Invalid LLM issue list");
  if (new Set(issues.map((issue) => issue.id)).size !== issues.length)
    throw new Error("Duplicate issue IDs");
  result.issues = issues;
  result.issueGenerationMs = generated.latencyMs;

  const optionQuestions = Object.fromEntries([
    ...issues.map((_, i) => [
      `material_${i}`,
      {
        type: "noul",
        instructions: `Can the concrete alternatives in \`issues[${i}].choices\` change which valid ticket wins or how tied winners are paid for some valid guesses and draw? A constant added to every ranking score cannot change winners or ties.`,
      },
    ]),
    ...issues.map((issue, i) => [
      `issue_${i}`,
      {
        type: "choice",
        instructions: `Which interpretation in \`issues[${i}].choices\` is best supported by the player's \`proposal\` for \`issues[${i}].gap\`? Choose ask_player when the wording does not support any one option sufficiently. Do not infer intent from \`ast\` alone.`,
        criteria: {
          ...Object.fromEntries(
            issue.choices.map((choice, j) => [`option_${j}`, choice]),
          ),
          ask_player:
            "The player's words do not determine one of these interpretations; ask the player to choose.",
        },
      },
    ]),
    ...issues.flatMap((issue, i) =>
      issue.choices.map((_, j) => [
        `legal_${i}_${j}`,
        {
          type: "noul",
          instructions: `Is \`issues[${i}].choices[${j}]\` a legal, bounded, deterministic rule interpretation using only a player's guess and the official draw, without new randomness, wallet/vote data, another player's data, or input arrival order?`,
        },
      ]),
    ),
  ]);
  const judged = await decide({ ...state, issues }, optionQuestions);
  record(metric, judged, "jev");
  result.issueChoiceMs = judged.latencyMs;
  result.judgments = issues.map((issue, i) => {
    const answer = judged.answers[`issue_${i}`];
    const valid = [...issue.choices.map((_, j) => `option_${j}`), "ask_player"];
    if (
      !valid.includes(answer?.choice) ||
      typeof answer.probabilities?.[answer.choice] !== "number" ||
      typeof answer.confidence !== "number"
    )
      throw new Error(`Invalid issue Choice ${i}`);
    const probability = answer.probabilities[answer.choice];
    const materialNoul = readNoul(
      judged.answers[`material_${i}`],
      `material_${i}`,
    );
    const optionIndex =
      answer.choice === "ask_player" ? null : Number(answer.choice.slice(7));
    const legalNoul =
      optionIndex === null
        ? null
        : readNoul(
            judged.answers[`legal_${i}_${optionIndex}`],
            `legal_${i}_${optionIndex}`,
          );
    const reliable =
      answer.choice !== "ask_player" &&
      probability >= 0.7 &&
      answer.confidence >= 0.7 &&
      legalNoul >= 0.8 &&
      materialNoul >= 0.7;
    return {
      id: issue.id,
      gap: issue.gap,
      choice: answer.choice,
      interpretation: reliable ? issue.choices[optionIndex] : null,
      probabilities: answer.probabilities,
      confidence: answer.confidence,
      legalNoul,
      materialNoul,
      reliable,
    };
  });

  const selected = result.judgments.filter((item) => item.reliable);
  const unresolved = result.judgments.filter(
    (item) => item.materialNoul >= 0.7 && !item.reliable,
  );
  result.ignoredAsNonmaterial = result.judgments.filter(
    (item) => item.materialNoul < 0.7,
  );
  if (!selected.length && !unresolved.length) {
    result.outcome = "ESCALATE_FIDELITY_DISAGREEMENT";
    result.wallClockMs = Math.round(performance.now() - started);
    return result;
  }
  const drafted = await llmJson(
    { proposal: sample.proposal, astFacts: facts, selected, unresolved },
    "Return two English texts for the player. proposedRevision applies only reliable selected interpretations; for unresolved choices, retain the original meaning, and when nothing was selected copy the proposal verbatim. suggestedVersionForApproval is an optional concrete candidate based on the AST's legal choices, explicitly pending player acceptance; list every assumption that differs from the original in assumptionsForApproval. The candidate is never official. Ask one neutral open question per material unresolved gap and report what the player can improve. Never present forbidden game mechanisms as alternatives, even examples. Do not ask about implementation details, fixed mechanics, or a clear clause. Do not expose AST field names. Return proposedRevision, suggestedVersionForApproval, improvementsForPlayer, questionsForPlayer, assumptionsForApproval.",
    draftSchema,
    "rule_fidelity_draft",
    1800,
  );
  record(metric, drafted, "llm");
  const draft = drafted.value;
  if (
    !validText(draft.proposedRevision, 1200) ||
    !validText(draft.suggestedVersionForApproval, 1200) ||
    [
      draft.improvementsForPlayer,
      draft.questionsForPlayer,
      draft.assumptionsForApproval,
    ].some(
      (items) =>
        !Array.isArray(items) ||
        items.length > 7 ||
        items.some((value) => !validText(value)),
    )
  )
    throw new Error("Invalid LLM draft");
  if (!selected.length && draft.proposedRevision !== sample.proposal)
    throw new Error("Draft changed without a reliable selected interpretation");
  if (unresolved.length && !draft.questionsForPlayer.length)
    throw new Error("Unresolved choices have no player question");
  if (
    draft.suggestedVersionForApproval !== sample.proposal &&
    !draft.assumptionsForApproval.length
  )
    throw new Error("Suggested version has no visible assumptions");
  result.draft = draft;
  result.draftMs = drafted.latencyMs;
  const activeIssues = [...selected, ...unresolved];
  const reviewed = await decide(
    {
      ...state,
      proposal: draft.proposedRevision,
      originalProposal: sample.proposal,
      selected,
      unresolved,
      activeIssues,
      draft,
    },
    {
      added_unselected: {
        type: "noul",
        instructions:
          "Does `draft.proposedRevision` assert a material winning condition that is absent from `originalProposal` and not among the reliable `selected` interpretations? Ignore questions and clearly labeled assumptions; judge only proposedRevision.",
      },
      ...Object.fromEntries(
        activeIssues.map((_, index) => [
          `assumption_${index}`,
          {
            type: "noul",
            instructions: `Does \`draft.assumptionsForApproval\` explicitly disclose how \`draft.suggestedVersionForApproval\` resolves \`activeIssues[${index}].gap\`, so the player can accept or reject that choice?`,
          },
        ]),
      ),
      ...Object.fromEntries(
        draft.questionsForPlayer.map((_, index) => [
          `question_${index}`,
          {
            type: "noul",
            instructions: `Is \`draft.questionsForPlayer[${index}]\` necessary to resolve one of \`unresolved\`, neutral, distinct from other questions, and free of forbidden or implementation-specific options?`,
          },
        ]),
      ),
      ...Object.fromEntries(
        draft.improvementsForPlayer.map((_, index) => [
          `improvement_${index}`,
          {
            type: "noul",
            instructions: `Is \`draft.improvementsForPlayer[${index}]\` a relevant, non-duplicative player-actionable improvement grounded in \`proposal\` and \`unresolved\`, without asking about fixed mechanics or implementation details?`,
          },
        ]),
      ),
      ...policyQuestions,
      ...Object.fromEntries(
        Object.entries(policyQuestions).map(([key, question]) => [
          `suggested_${key}`,
          {
            ...question,
            instructions: question.instructions.replaceAll(
              "`proposal`",
              "`draft.suggestedVersionForApproval`",
            ),
          },
        ]),
      ),
    },
  );
  record(metric, reviewed, "jev");
  result.draftReview = {
    addedUnselectedNoul: readNoul(
      reviewed.answers.added_unselected,
      "draft additions",
    ),
    policyHits: Object.keys(policyQuestions)
      .filter((key) => readNoul(reviewed.answers[key], key) >= 0.8)
      .map((key) => key.slice(7)),
    suggestedPolicyHits: Object.keys(policyQuestions)
      .filter(
        (key) =>
          readNoul(reviewed.answers[`suggested_${key}`], `suggested_${key}`) >=
          0.8,
      )
      .map((key) => key.slice(7)),
    candidateAssumptionScores: activeIssues.map((_, index) =>
      readNoul(reviewed.answers[`assumption_${index}`], `assumption_${index}`),
    ),
    questionScores: draft.questionsForPlayer.map((_, index) =>
      readNoul(reviewed.answers[`question_${index}`], `question_${index}`),
    ),
    improvementScores: draft.improvementsForPlayer.map((_, index) =>
      readNoul(
        reviewed.answers[`improvement_${index}`],
        `improvement_${index}`,
      ),
    ),
    forbiddenQuestionExample: draft.questionsForPlayer.some((question) =>
      /\b(?:first.come.first.served|random draw|wallet balance|vote count|roll.over|next draw)\b/iu.test(
        question,
      ),
    ),
    latencyMs: reviewed.latencyMs,
  };
  result.outcome =
    result.draftReview.addedUnselectedNoul >= 0.5 ||
    result.draftReview.policyHits.length ||
    result.draftReview.suggestedPolicyHits.length ||
    result.draftReview.candidateAssumptionScores.some((score) => score < 0.7) ||
    result.draftReview.forbiddenQuestionExample ||
    result.draftReview.questionScores.some((score) => score < 0.8) ||
    result.draftReview.improvementScores.some((score) => score < 0.8)
      ? "DRAFT_REJECTED_BY_REVIEW"
      : unresolved.length
        ? "DRAFT_AWAITING_PLAYER_CHOICES"
        : "DRAFT_FOR_PLAYER_APPROVAL";
  result.wallClockMs = Math.round(performance.now() - started);
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const requested = new Set(
    process.argv.slice(2).filter((arg) => !arg.startsWith("--")),
  );
  const selected = samples.filter(
    (sample) =>
      fixtureIds.includes(sample.id) &&
      (!requested.size || requested.has(sample.id)),
  );
  if (!selected.length) throw new Error("No fidelity fixtures selected");
  for (const sample of selected)
    console.log(
      JSON.stringify(
        await runFidelity(sample, process.argv.includes("--pipeline")),
      ),
    );
}
