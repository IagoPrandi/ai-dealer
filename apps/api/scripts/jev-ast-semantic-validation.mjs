import { describeRuleAstForPlayers, ruleAstSchema } from "@tyche/rule-compiler";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { benchmark } from "./jev-direct-rule-evaluation.mjs";
import { decide } from "./jev-rule-probe.mjs";

// Read-only experiment. It measures Jev as an advisory semantic reviewer and
// never permits an answer to validate, activate, or submit a rule.
const AST_CONTRACT = {
  result:
    "predicate means the ticket wins when predicate is true. ranking compares every eligible ticket's numeric score; direction min or max selects winners; ties share the prize.",
  arrays:
    "source loads guess or draw; intersection/difference are set operations; digits extracts units or tens; distinct removes duplicates; reverse changes order; filter keeps values satisfying where.",
  scalars:
    "lit is a constant; reduce applies count/sum/product/min/max/range_span; at reads a zero-based position; arith applies add/sub/mul/div/mod; elem is the current quantified value; pair is one side of a paired position.",
  predicates:
    "compare uses eq/neq/lt/lte/gt/gte; contains checks membership; and/or/not are Boolean; exists/forall quantify an array; pairs_exists/pairs_forall compare aligned positions.",
};

function clone(value) {
  return structuredClone(value);
}

function mutateReference(item) {
  const ast = clone(item.ast);
  let mutation;
  switch (item.id) {
    case "S01":
      ast.result.predicate.right.value = 2;
      mutation = "at-least-three threshold changed to two";
      break;
    case "S02":
      ast.result.predicate.op = "gte";
      mutation = "strict greater-than changed to greater-than-or-equal";
      break;
    case "S03":
      ast.result.predicate.left.op = "min";
      mutation = "highest guessed number changed to lowest guessed number";
      break;
    case "S04":
      ast.result.predicate.op = "lte";
      mutation = "strict lower-than changed to lower-than-or-equal";
      break;
    case "S05":
      ast.result.predicate.value.of.source = "guess";
      mutation = "highest drawn number changed to highest guessed number";
      break;
    case "S06":
      ast.result.predicate.op = "gte";
      mutation = "exactly two matches changed to at least two";
      break;
    case "S07":
      ast.result.predicate.right.value = 1;
      mutation = "even remainder changed to odd remainder";
      break;
    case "S08":
      ast.result.predicate.right.value = 3;
      mutation = "at-least-four odd numbers changed to three";
      break;
    case "S09":
      ast.result.predicate.left.index = 1;
      mutation = "first guessed position changed to second";
      break;
    case "S10":
      ast.result.predicate.op = "lte";
      mutation = "range below 30 changed to range at most 30";
      break;
    case "M01":
      ast.result.predicate.kind = "or";
      mutation = "both required clauses changed to either clause";
      break;
    case "M02":
      ast.result.predicate.op = "gte";
      mutation = "more distinct digits changed to at least as many";
      break;
    case "M03":
      ast.result.predicate.value = 3;
      mutation = "exactly two matching positions changed to three";
      break;
    case "M04":
      ast.result.direction = "min";
      mutation = "greatest match count changed to smallest";
      break;
    case "M05": {
      const first = ast.result.predicate.clauses[0].clauses[0];
      const second = ast.result.predicate.clauses[1].clauses[1];
      ast.result.predicate = { kind: "or", clauses: [first, second] };
      mutation = "exclusive-or changed to inclusive-or";
      break;
    }
    case "C01":
      ast.result.eligibleWhen.right.value = 1;
      mutation = "two-match eligibility gate changed to one match";
      break;
    case "C02":
      ast.result.predicate.where.where.right.right.value = 5;
      mutation =
        "same units digit changed to incompatible modulo-five comparison";
      break;
    case "C03":
      ast.result.predicate.right = ast.result.predicate.right.of;
      mutation = "mirrored draw order changed to original order";
      break;
    case "C04":
      ast.result.eligibleWhen.op = "gt";
      mutation = "sum-below-draw eligibility changed to sum-above-draw";
      break;
    case "C05":
      ast.result.predicate = ast.result.predicate.clauses[0];
      mutation = "exactly one of three conditions changed to at least one";
      break;
    default:
      throw new Error(`No mutation for ${item.id}`);
  }
  return { ast: ruleAstSchema.parse(ast), mutation };
}

function candidatesFor(item, run) {
  const incorrect = mutateReference(item);
  const correct = {
    ast: ruleAstSchema.parse(clone(item.ast)),
    expected: "YES",
    mutation: null,
  };
  const wrong = { ...incorrect, expected: "NO" };
  const numeric = Number(item.id.slice(1));
  return (numeric + run) % 2 === 0 ? [correct, wrong] : [wrong, correct];
}

function questionsFor(candidates) {
  return Object.fromEntries(
    candidates.flatMap((_candidate, index) => [
      [
        `choice_${index}`,
        {
          type: "choice",
          instructions: `Does candidates[${index}].ast implement rule_proposal exactly under ast_contract? Judge executable behavior, thresholds, operators, scope, ordering, eligibility, ranking direction, and ties. Use candidates[${index}].behavior_description only as a deterministic rendering of that AST.`,
          criteria: {
            yes: "Every material behavior in the proposal is implemented exactly, with no changed or extra behavior.",
            maybe:
              "The relationship cannot be determined reliably from the supplied proposal, AST, contract, and description.",
            no: "The AST has at least one material behavioral mismatch with the proposal.",
          },
        },
      ],
      [
        `noul_${index}`,
        {
          type: "noul",
          instructions: `Does candidates[${index}].ast implement every material behavior in rule_proposal exactly, without changing or adding behavior? Use ast_contract and candidates[${index}].behavior_description.`,
        },
      ],
    ]),
  );
}

function singleQuestions() {
  return {
    choice: {
      type: "choice",
      instructions:
        "Does candidate.ast implement rule_proposal exactly under ast_contract? Judge executable behavior, thresholds, operators, scope, ordering, eligibility, ranking direction, and ties. Use candidate.behavior_description only as a deterministic rendering of that AST when it is present.",
      criteria: {
        yes: "Every material behavior in the proposal is implemented exactly, with no changed or extra behavior.",
        maybe:
          "The relationship cannot be determined reliably from the supplied proposal, AST, contract, and optional description.",
        no: "The AST has at least one material behavioral mismatch with the proposal.",
      },
    },
    noul: {
      type: "noul",
      instructions:
        "Does candidate.ast implement every material behavior in rule_proposal exactly, without changing or adding behavior? Use ast_contract and candidate.behavior_description when present.",
    },
  };
}

function scoredCandidate(candidate, choice, noul, position, mode) {
  const rawChoice = choice?.choice ?? null;
  const prediction =
    rawChoice === "yes" ? "YES" : rawChoice === "no" ? "NO" : "ABSTAIN";
  const selectedProbability = choice?.probabilities?.[rawChoice] ?? null;
  const noulPrediction = noul === null ? "ABSTAIN" : noul >= 0.5 ? "YES" : "NO";
  const choiceActionable =
    prediction !== "ABSTAIN" &&
    selectedProbability >= 0.7 &&
    choice?.confidence >= 0.7;
  const noulActionable = noul !== null && (noul >= 0.7 || noul <= 0.3);
  const combinedActionable =
    choiceActionable && noulActionable && prediction === noulPrediction;
  return {
    position,
    expected: candidate.expected,
    mutation: candidate.mutation,
    ast: candidate.ast,
    behaviorDescription:
      mode === "described" ? describeRuleAstForPlayers(candidate.ast) : null,
    choice: {
      rawChoice,
      prediction,
      probabilities: choice?.probabilities ?? null,
      confidence: choice?.confidence ?? null,
      actionable70: choiceActionable,
      correct: prediction === candidate.expected,
    },
    noul: {
      probabilityYes: noul,
      prediction: noulPrediction,
      actionable70: noulActionable,
      correct: noulPrediction === candidate.expected,
    },
    combined: {
      prediction: combinedActionable ? prediction : "ABSTAIN",
      actionable70: combinedActionable,
      correct: combinedActionable && prediction === candidate.expected,
    },
  };
}

async function evaluateRule(item, run, mode) {
  const candidates = candidatesFor(item, run);
  const visible = candidates.map((candidate) => ({
    ast: candidate.ast,
    ...(mode === "described"
      ? { behavior_description: describeRuleAstForPlayers(candidate.ast) }
      : {}),
  }));
  const started = performance.now();
  const response = await decide(
    {
      game_context:
        "A ticket and draw each contain six distinct integers from 1 through 100. Listed order matters only when the rule says so.",
      rule_proposal: item.proposal,
      ast_contract: AST_CONTRACT,
      candidates: visible,
    },
    questionsFor(candidates),
  );
  return {
    run,
    mode,
    ruleId: item.id,
    tier: item.tier,
    language: item.language,
    proposal: item.proposal,
    latencyMs: response.latencyMs,
    wallClockMs: Math.round(performance.now() - started),
    model: response.model,
    usage: response.usage,
    providerCostUsd: response.usage?.cost ?? response.estimatedCostUsd,
    candidates: candidates.map((candidate, index) =>
      scoredCandidate(
        candidate,
        response.answers[`choice_${index}`],
        response.answers[`noul_${index}`]?.noul ?? null,
        index,
        mode,
      ),
    ),
  };
}

async function evaluateSingle(item, candidate, run, mode, position) {
  const visible = {
    ast: candidate.ast,
    ...(mode === "described"
      ? { behavior_description: describeRuleAstForPlayers(candidate.ast) }
      : {}),
  };
  const started = performance.now();
  const response = await decide(
    {
      game_context:
        "A ticket and draw each contain six distinct integers from 1 through 100. Listed order matters only when the rule says so.",
      rule_proposal: item.proposal,
      ast_contract: AST_CONTRACT,
      candidate: visible,
    },
    singleQuestions(),
  );
  return {
    run,
    mode,
    layout: "single",
    ruleId: item.id,
    tier: item.tier,
    language: item.language,
    proposal: item.proposal,
    latencyMs: response.latencyMs,
    wallClockMs: Math.round(performance.now() - started),
    model: response.model,
    usage: response.usage,
    providerCostUsd: response.usage?.cost ?? response.estimatedCostUsd,
    candidates: [
      scoredCandidate(
        candidate,
        response.answers.choice,
        response.answers.noul?.noul ?? null,
        position,
        mode,
      ),
    ],
  };
}

async function mapConcurrent(items, concurrency, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      output[index] = await fn(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return output;
}

function metrics(rows) {
  const group = (selected) => {
    const choiceActionable = selected.filter((row) => row.choice.actionable70);
    const noulActionable = selected.filter((row) => row.noul.actionable70);
    const combinedActionable = selected.filter(
      (row) => row.combined.actionable70,
    );
    return {
      judgments: selected.length,
      choiceTopAccuracy:
        selected.filter((row) => row.choice.correct).length / selected.length,
      choiceFalseAccepts: selected.filter(
        (row) => row.expected === "NO" && row.choice.prediction === "YES",
      ).length,
      choiceFalseRejects: selected.filter(
        (row) => row.expected === "YES" && row.choice.prediction === "NO",
      ).length,
      choiceActionable70Coverage: choiceActionable.length / selected.length,
      choiceActionable70Accuracy: choiceActionable.length
        ? choiceActionable.filter((row) => row.choice.correct).length /
          choiceActionable.length
        : null,
      choiceActionable70FalseAccepts: choiceActionable.filter(
        (row) => row.expected === "NO" && row.choice.prediction === "YES",
      ).length,
      noulThresholdAccuracy:
        selected.filter((row) => row.noul.correct).length / selected.length,
      noulActionable70Coverage: noulActionable.length / selected.length,
      noulActionable70Accuracy: noulActionable.length
        ? noulActionable.filter((row) => row.noul.correct).length /
          noulActionable.length
        : null,
      combinedActionable70Coverage: combinedActionable.length / selected.length,
      combinedActionable70Accuracy: combinedActionable.length
        ? combinedActionable.filter((row) => row.combined.correct).length /
          combinedActionable.length
        : null,
      combinedActionable70FalseAccepts: combinedActionable.filter(
        (row) => row.expected === "NO" && row.combined.prediction === "YES",
      ).length,
    };
  };
  return {
    overall: group(rows),
    byTier: Object.fromEntries(
      ["simple", "medium", "complex"].map((tier) => [
        tier,
        group(rows.filter((row) => row.tier === tier)),
      ]),
    ),
  };
}

function aggregate(evaluations) {
  const rows = evaluations.flatMap((evaluation) =>
    evaluation.candidates.map((candidate) => ({
      ...candidate,
      mode: evaluation.mode,
      ruleId: evaluation.ruleId,
      tier: evaluation.tier,
      run: evaluation.run,
    })),
  );
  const byMode = Object.fromEntries(
    ["raw", "described"].map((mode) => [
      mode,
      metrics(rows.filter((row) => row.mode === mode)),
    ]),
  );
  const keys = [
    ...new Set(
      rows.map(
        (row) => `${row.mode}/${row.ruleId}/${row.expected}/${row.mutation}`,
      ),
    ),
  ];
  const stable = keys.filter((key) => {
    const predictions = rows
      .filter(
        (row) =>
          `${row.mode}/${row.ruleId}/${row.expected}/${row.mutation}` === key,
      )
      .map((row) => row.choice.prediction);
    return new Set(predictions).size === 1;
  }).length;
  return {
    rules: benchmark.length,
    candidatesPerRule: 2,
    modes: 2,
    runs: new Set(evaluations.map((evaluation) => evaluation.run)).size,
    totalJudgments: rows.length,
    byMode,
    choicePredictionStability: stable / keys.length,
    totalLatencyMs: evaluations.reduce(
      (sum, evaluation) => sum + evaluation.latencyMs,
      0,
    ),
    meanRequestLatencyMs:
      evaluations.reduce((sum, evaluation) => sum + evaluation.latencyMs, 0) /
      evaluations.length,
    knownProviderCostUsd: evaluations.reduce(
      (sum, evaluation) => sum + (evaluation.providerCostUsd ?? 0),
      0,
    ),
    unpricedRequests: evaluations.filter(
      (evaluation) => evaluation.providerCostUsd === null,
    ).length,
  };
}

function validateBenchmark() {
  if (benchmark.length !== 20) throw new Error("Expected 20 source rules");
  for (const item of benchmark) {
    ruleAstSchema.parse(item.ast);
    const mutated = mutateReference(item);
    if (JSON.stringify(mutated.ast) === JSON.stringify(item.ast)) {
      throw new Error(`${item.id} mutation did not change the AST`);
    }
  }
}

async function main() {
  validateBenchmark();
  if (process.argv.includes("--dry-run")) {
    console.log(
      JSON.stringify(
        {
          rules: benchmark.length,
          validReferenceAsts: benchmark.length,
          validMutatedAsts: benchmark.length,
          pairsPerRun: benchmark.length * 2 * 2,
          mutations: benchmark.map((item) => ({
            id: item.id,
            mutation: mutateReference(item).mutation,
          })),
        },
        null,
        2,
      ),
    );
    return;
  }
  const runsArg = process.argv.find((arg) => arg.startsWith("--runs="));
  const concurrencyArg = process.argv.find((arg) =>
    arg.startsWith("--concurrency="),
  );
  const outputArg = process.argv.find((arg) => arg.startsWith("--output="));
  const layoutArg = process.argv.find((arg) => arg.startsWith("--layout="));
  const runs = Number(runsArg?.split("=")[1] ?? 3);
  const concurrency = Number(concurrencyArg?.split("=")[1] ?? 4);
  const layout = layoutArg?.split("=")[1] ?? "paired";
  if (!new Set(["paired", "single"]).has(layout)) {
    throw new Error(`Unknown layout: ${layout}`);
  }
  const evaluations = [];
  const wallStarted = performance.now();
  for (let run = 1; run <= runs; run += 1) {
    for (const mode of ["raw", "described"]) {
      if (layout === "paired") {
        evaluations.push(
          ...(await mapConcurrent(benchmark, concurrency, (item) =>
            evaluateRule(item, run, mode),
          )),
        );
      } else {
        const tasks = benchmark.flatMap((item) =>
          candidatesFor(item, run).map((candidate, position) => ({
            item,
            candidate,
            position,
          })),
        );
        evaluations.push(
          ...(await mapConcurrent(tasks, concurrency, (task) =>
            evaluateSingle(task.item, task.candidate, run, mode, task.position),
          )),
        );
      }
    }
  }
  const report = {
    generatedAt: new Date().toISOString(),
    method: {
      model: "~typesafe/jev-latest",
      layout,
      candidates: "one correct and one schema-valid one-dimension mutation",
      hiddenLabels: true,
      modes: {
        raw: "proposal + AST + compact DSL contract",
        described:
          "proposal + AST + compact DSL contract + deterministic AST description",
      },
      thresholds:
        "Choice probability >= 0.70 and confidence >= 0.70; Noul <= 0.30 or >= 0.70",
    },
    summary: {
      ...aggregate(evaluations),
      endToEndWallClockMs: Math.round(performance.now() - wallStarted),
    },
    evaluations,
  };
  const output = outputArg?.slice("--output=".length);
  if (output) {
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  }
  console.log(JSON.stringify(report.summary, null, 2));
}

export { aggregate, candidatesFor, mutateReference, validateBenchmark };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
