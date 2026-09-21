import {
  evaluatePredicate,
  evaluateRankingEntry,
  ruleAstSchema,
} from "@tyche/rule-compiler";
import { writeFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { decide } from "./jev-rule-probe.mjs";

// Read-only experiment: Jev sees natural-language rules and game data, never an
// AST. Reference ASTs are local test oracles and cannot authorize or submit a rule.
const src = (source) => ({ kind: "source", source });
const lit = (value) => ({ kind: "lit", value });
const red = (op, of) => ({ kind: "reduce", op, of });
const arith = (op, left, right) => ({ kind: "arith", op, left, right });
const cmp = (op, left, right) => ({ kind: "compare", op, left, right });
const inter = (left = src("guess"), right = src("draw")) => ({
  kind: "intersection",
  left,
  right,
});
const diff = (left, right) => ({ kind: "difference", left, right });
const count = (of) => red("count", of);
const and = (...clauses) => ({ kind: "and", clauses });
const or = (...clauses) => ({ kind: "or", clauses });
const not = (clause) => ({ kind: "not", clause });
const pred = (predicate) => ({
  schemaVersion: 3,
  result: { type: "predicate", predicate },
});
const rank = (score, direction, eligibleWhen) => ({
  schemaVersion: 3,
  result: {
    type: "ranking",
    score,
    direction,
    tieBreak: "share_pool",
    ...(eligibleWhen ? { eligibleWhen } : {}),
  },
});
const xor = (left, right) => or(and(left, not(right)), and(not(left), right));
const hits = inter();
const hitCount = count(hits);
const sumGuess = red("sum", src("guess"));
const sumDraw = red("sum", src("draw"));
const maxGuess = red("max", src("guess"));
const maxDraw = red("max", src("draw"));
const minGuess = red("min", src("guess"));
const minDraw = red("min", src("draw"));
const units = (of) => ({ kind: "digits", place: "units", of });
const distinct = (of) => ({ kind: "distinct", of });
const mod = (value, modulus) => arith("mod", value, lit(modulus));
const D = [10, 20, 30, 40, 50, 60];

function absoluteScenarios(guesses, draws = guesses.map(() => D)) {
  return guesses.map((targetTicket, index) => ({
    id: `scenario-${index + 1}`,
    targetPlayer: "player-A",
    targetTicket,
    draw: draws[index],
  }));
}

function rankingScenario(id, entries, draw = D, targetPlayer = "player-A") {
  return {
    id,
    targetPlayer,
    targetTicket: entries[targetPlayer],
    entries,
    draw,
  };
}

const atLeastThree = cmp("gte", hitCount, lit(3));
const sumGreater = cmp("gt", sumGuess, sumDraw);
const highestDrawn = { kind: "contains", array: src("draw"), value: maxGuess };

const benchmark = [
  {
    id: "S01",
    tier: "simple",
    language: "pt",
    proposal:
      "O jogador ganha se pelo menos três dos seus seis números forem sorteados.",
    ast: pred(atLeastThree),
    scenarios: absoluteScenarios([
      [10, 20, 30, 1, 2, 3],
      [10, 20, 1, 2, 3, 4],
      [10, 20, 30, 40, 1, 2],
      [1, 2, 3, 4, 5, 6],
    ]),
  },
  {
    id: "S02",
    tier: "simple",
    language: "en",
    proposal:
      "The player wins if the sum of the six guessed numbers is greater than the sum of the six drawn numbers.",
    ast: pred(sumGreater),
    scenarios: absoluteScenarios([
      [40, 41, 42, 43, 44, 45],
      [1, 2, 3, 4, 5, 6],
      [10, 20, 30, 40, 50, 61],
      [10, 20, 30, 40, 50, 59],
    ]),
  },
  {
    id: "S03",
    tier: "simple",
    language: "pt",
    proposal:
      "O jogador ganha quando o maior número do seu jogo é igual ao maior número sorteado.",
    ast: pred(cmp("eq", maxGuess, maxDraw)),
    scenarios: absoluteScenarios([
      [1, 2, 3, 4, 5, 60],
      [1, 2, 3, 4, 60, 70],
      [1, 2, 3, 4, 5, 59],
      [10, 20, 30, 40, 50, 60],
    ]),
  },
  {
    id: "S04",
    tier: "simple",
    language: "en",
    proposal:
      "The player wins when the lowest guessed number is lower than the lowest drawn number.",
    ast: pred(cmp("lt", minGuess, minDraw)),
    scenarios: absoluteScenarios([
      [1, 20, 30, 40, 50, 60],
      [10, 11, 12, 13, 14, 15],
      [9, 20, 30, 40, 50, 60],
      [11, 20, 30, 40, 50, 60],
    ]),
  },
  {
    id: "S05",
    tier: "simple",
    language: "pt",
    proposal:
      "O jogador ganha se o maior número sorteado estiver entre os seis números do seu jogo.",
    ast: pred({ kind: "contains", array: src("guess"), value: maxDraw }),
    scenarios: absoluteScenarios([
      [1, 2, 3, 4, 5, 60],
      [1, 2, 3, 4, 5, 59],
      [60, 70, 80, 90, 99, 100],
      [10, 20, 30, 40, 50, 59],
    ]),
  },
  {
    id: "S06",
    tier: "simple",
    language: "en",
    proposal:
      "The player wins if exactly two guessed numbers appear in the draw.",
    ast: pred(cmp("eq", hitCount, lit(2))),
    scenarios: absoluteScenarios([
      [10, 20, 1, 2, 3, 4],
      [10, 20, 30, 1, 2, 3],
      [1, 2, 3, 4, 5, 6],
      [50, 60, 1, 2, 3, 4],
    ]),
  },
  {
    id: "S07",
    tier: "simple",
    language: "pt",
    proposal: "O jogador ganha se a soma dos seis números do seu jogo for par.",
    ast: pred(cmp("eq", mod(sumGuess, 2), lit(0))),
    scenarios: absoluteScenarios([
      [1, 2, 3, 4, 5, 7],
      [1, 2, 3, 4, 5, 6],
      [10, 20, 30, 40, 50, 60],
      [11, 20, 30, 40, 50, 60],
    ]),
  },
  {
    id: "S08",
    tier: "simple",
    language: "en",
    proposal:
      "The player wins if at least four of the six guessed numbers are odd.",
    ast: pred(
      cmp(
        "gte",
        count({
          kind: "filter",
          of: src("guess"),
          where: cmp("eq", mod({ kind: "elem" }, 2), lit(1)),
        }),
        lit(4),
      ),
    ),
    scenarios: absoluteScenarios([
      [1, 3, 5, 7, 20, 22],
      [1, 3, 5, 20, 22, 24],
      [2, 4, 6, 8, 10, 12],
      [11, 13, 15, 17, 19, 21],
    ]),
  },
  {
    id: "S09",
    tier: "simple",
    language: "pt",
    proposal:
      "Mantendo a ordem informada, o jogador ganha se seu primeiro número for igual ao primeiro número sorteado.",
    ast: pred(
      cmp(
        "eq",
        { kind: "at", index: 0, of: src("guess") },
        { kind: "at", index: 0, of: src("draw") },
      ),
    ),
    scenarios: absoluteScenarios([
      [10, 1, 2, 3, 4, 5],
      [20, 10, 1, 2, 3, 4],
      [10, 60, 50, 40, 30, 20],
      [60, 1, 2, 3, 4, 5],
    ]),
  },
  {
    id: "S10",
    tier: "simple",
    language: "en",
    proposal:
      "The player wins if the difference between the highest and lowest guessed number is less than 30.",
    ast: pred(cmp("lt", red("range_span", src("guess")), lit(30))),
    scenarios: absoluteScenarios([
      [10, 11, 12, 13, 14, 39],
      [10, 11, 12, 13, 14, 40],
      [1, 20, 40, 60, 80, 100],
      [50, 51, 52, 53, 54, 55],
    ]),
  },
  {
    id: "M01",
    tier: "medium",
    language: "pt",
    proposal:
      "O jogador ganha somente se acertar pelo menos dois números e a soma do seu jogo for maior que a soma do sorteio.",
    ast: pred(and(cmp("gte", hitCount, lit(2)), sumGreater)),
    scenarios: absoluteScenarios([
      [10, 20, 70, 80, 90, 100],
      [10, 20, 1, 2, 3, 4],
      [10, 70, 80, 90, 99, 100],
      [10, 20, 30, 40, 50, 61],
    ]),
  },
  {
    id: "M02",
    tier: "medium",
    language: "en",
    proposal:
      "The player wins if the guessed numbers use more distinct units digits than the drawn numbers.",
    ast: pred(
      cmp(
        "gt",
        count(distinct(units(src("guess")))),
        count(distinct(units(src("draw")))),
      ),
    ),
    scenarios: absoluteScenarios(
      [
        [1, 2, 3, 4, 5, 6],
        [11, 21, 31, 41, 51, 61],
        [10, 20, 31, 41, 52, 62],
        [7, 18, 29, 40, 51, 62],
      ],
      [
        [10, 20, 30, 40, 50, 60],
        [10, 21, 32, 43, 54, 65],
        [10, 20, 30, 40, 50, 60],
        [10, 21, 32, 43, 54, 65],
      ],
    ),
  },
  {
    id: "M03",
    tier: "medium",
    language: "pt",
    proposal:
      "Considerando as posições na ordem informada, o jogador ganha se exatamente duas posições tiverem o mesmo número no jogo e no sorteio.",
    ast: {
      schemaVersion: 2,
      result: {
        type: "predicate",
        predicate: {
          kind: "ordered_position_match_count_eq",
          left: src("guess"),
          right: src("draw"),
          value: 2,
        },
      },
    },
    scenarios: absoluteScenarios([
      [10, 20, 1, 2, 3, 4],
      [10, 20, 30, 1, 2, 3],
      [1, 2, 3, 40, 50, 4],
      [10, 2, 3, 4, 5, 6],
    ]),
  },
  {
    id: "M04",
    tier: "medium",
    language: "en",
    proposal:
      "Among all submitted tickets, the ticket matching the greatest number of drawn numbers wins. Tied tickets all win and share the prize.",
    ast: rank(hitCount, "max"),
    scenarios: [
      rankingScenario("scenario-1", {
        "player-A": [10, 20, 30, 1, 2, 3],
        B: [10, 20, 1, 2, 3, 4],
        C: [10, 1, 2, 3, 4, 5],
      }),
      rankingScenario("scenario-2", {
        "player-A": [10, 1, 2, 3, 4, 5],
        B: [10, 20, 30, 1, 2, 3],
        C: [1, 2, 3, 4, 5, 6],
      }),
      rankingScenario("scenario-3", {
        "player-A": [10, 20, 1, 2, 3, 4],
        B: [30, 40, 1, 2, 3, 4],
        C: [1, 2, 3, 4, 5, 6],
      }),
      rankingScenario("scenario-4", {
        "player-A": [1, 2, 3, 4, 5, 6],
        B: [7, 8, 9, 11, 12, 13],
        C: [10, 1, 2, 3, 4, 5],
      }),
    ],
  },
  {
    id: "M05",
    tier: "medium",
    language: "pt",
    proposal:
      "O jogador ganha se exatamente uma destas condições for verdadeira: acertou exatamente três números; ou a soma do jogo é igual à soma do sorteio.",
    ast: pred(xor(cmp("eq", hitCount, lit(3)), cmp("eq", sumGuess, sumDraw))),
    scenarios: absoluteScenarios([
      [10, 20, 30, 1, 2, 3],
      [10, 20, 30, 45, 49, 56],
      [15, 25, 35, 40, 45, 50],
      [10, 20, 30, 40, 50, 61],
    ]),
  },
  {
    id: "C01",
    tier: "complex",
    language: "en",
    proposal:
      "Only tickets matching at least two drawn numbers are eligible. Among eligible tickets, the ticket with the smallest difference between its highest and lowest number wins; all ties win and share the prize.",
    ast: rank(
      red("range_span", src("guess")),
      "min",
      cmp("gte", hitCount, lit(2)),
    ),
    scenarios: [
      rankingScenario("scenario-1", {
        "player-A": [10, 20, 21, 22, 23, 24],
        B: [10, 20, 70, 80, 90, 100],
        C: [10, 1, 2, 3, 4, 5],
      }),
      rankingScenario("scenario-2", {
        "player-A": [10, 20, 70, 80, 90, 100],
        B: [10, 20, 21, 22, 23, 24],
        C: [30, 40, 41, 42, 43, 44],
      }),
      rankingScenario("scenario-3", {
        "player-A": [10, 20, 21, 22, 23, 24],
        B: [30, 40, 41, 42, 43, 44],
        C: [1, 2, 3, 4, 5, 6],
      }),
      rankingScenario("scenario-4", {
        "player-A": [10, 1, 2, 3, 4, 5],
        B: [20, 30, 31, 32, 33, 34],
        C: [40, 50, 51, 52, 53, 54],
      }),
    ],
  },
  {
    id: "C02",
    tier: "complex",
    language: "pt",
    proposal:
      "Separe os números do jogo entre acertados e não acertados. O jogador ganha se algum número não acertado tiver o mesmo algarismo das unidades que algum número acertado.",
    ast: pred({
      kind: "exists",
      of: diff(src("guess"), src("draw")),
      where: {
        kind: "exists",
        of: hits,
        where: cmp(
          "eq",
          mod({ kind: "elem", up: 1 }, 10),
          mod({ kind: "elem" }, 10),
        ),
      },
    }),
    scenarios: absoluteScenarios([
      [10, 20, 30, 70, 52, 63],
      [10, 20, 30, 41, 52, 64],
      [10, 70, 80, 90, 91, 92],
      [1, 2, 3, 4, 5, 6],
    ]),
  },
  {
    id: "C03",
    tier: "complex",
    language: "en",
    proposal:
      "Keep both sequences in their stated order and compare them in mirror order: first guess to last draw, second guess to fifth draw, and so on. The player wins if at least one mirrored pair contains the same number.",
    ast: pred({
      kind: "pairs_exists",
      left: src("guess"),
      right: { kind: "reverse", of: src("draw") },
      where: cmp(
        "eq",
        { kind: "pair", side: "left" },
        { kind: "pair", side: "right" },
      ),
    }),
    scenarios: absoluteScenarios([
      [60, 1, 2, 3, 4, 5],
      [10, 20, 30, 40, 50, 60],
      [1, 2, 40, 4, 5, 6],
      [1, 2, 3, 4, 5, 6],
    ]),
  },
  {
    id: "C04",
    tier: "complex",
    language: "pt",
    proposal:
      "Só participam os jogos cuja soma seja menor que a soma do sorteio. Entre eles, vence o jogo com a maior quantidade de algarismos das unidades diferentes; empates dividem o prêmio.",
    ast: rank(
      count(distinct(units(src("guess")))),
      "max",
      cmp("lt", sumGuess, sumDraw),
    ),
    scenarios: [
      rankingScenario("scenario-1", {
        "player-A": [1, 2, 3, 4, 5, 6],
        B: [10, 20, 30, 40, 50, 60],
        C: [11, 21, 31, 41, 51, 61],
      }),
      rankingScenario("scenario-2", {
        "player-A": [11, 21, 31, 41, 51, 61],
        B: [1, 2, 3, 4, 5, 6],
        C: [10, 20, 30, 40, 50, 60],
      }),
      rankingScenario("scenario-3", {
        "player-A": [1, 2, 3, 14, 15, 16],
        B: [21, 22, 23, 34, 35, 36],
        C: [10, 20, 30, 40, 50, 60],
      }),
      rankingScenario("scenario-4", {
        "player-A": [70, 71, 72, 73, 74, 75],
        B: [1, 2, 3, 4, 5, 6],
        C: [11, 21, 31, 41, 51, 61],
      }),
    ],
  },
  {
    id: "C05",
    tier: "complex",
    language: "en",
    proposal:
      "The player wins only when exactly one of these three statements is true: at least three guessed numbers were drawn; the guessed numbers sum to more than the drawn numbers; the player's highest number was drawn.",
    ast: pred(
      and(
        or(atLeastThree, sumGreater, highestDrawn),
        not(and(atLeastThree, sumGreater)),
        not(and(atLeastThree, highestDrawn)),
        not(and(sumGreater, highestDrawn)),
      ),
    ),
    scenarios: absoluteScenarios([
      [10, 20, 30, 1, 2, 3],
      [10, 20, 30, 70, 80, 90],
      [1, 2, 3, 4, 5, 60],
      [70, 71, 72, 73, 74, 75],
    ]),
  },
];

function expectedOutcome(item, scenario) {
  if (item.ast.result.type === "predicate") {
    return evaluatePredicate(item.ast, {
      guess: scenario.targetTicket,
      draw: scenario.draw,
    }).result;
  }
  const evaluated = Object.entries(scenario.entries).map(([player, guess]) => ({
    player,
    ...evaluateRankingEntry(item.ast, { guess, draw: scenario.draw }),
  }));
  const eligible = evaluated.filter((entry) => entry.eligible);
  if (eligible.length === 0) return "LOSE";
  const scores = eligible.map((entry) => entry.score);
  const best =
    item.ast.result.direction === "min"
      ? Math.min(...scores)
      : Math.max(...scores);
  return eligible.some(
    (entry) => entry.player === scenario.targetPlayer && entry.score === best,
  )
    ? "WIN"
    : "LOSE";
}

function validateBenchmark() {
  if (
    benchmark.filter((item) => item.tier === "simple").length !== 10 ||
    benchmark.filter((item) => item.tier === "medium").length !== 5 ||
    benchmark.filter((item) => item.tier === "complex").length !== 5
  ) {
    throw new Error(
      "Benchmark must contain 10 simple, 5 medium, and 5 complex rules",
    );
  }
  for (const item of benchmark) {
    ruleAstSchema.parse(item.ast);
    if (item.scenarios.length !== 4)
      throw new Error(`${item.id} must have four scenarios`);
    for (const scenario of item.scenarios) expectedOutcome(item, scenario);
  }
}

function questionsFor(item) {
  return Object.fromEntries(
    item.scenarios.flatMap((scenario, index) => [
      [
        `choice_${index}`,
        {
          type: "choice",
          instructions: `Using only rule_proposal, game_context, and scenarios[${index}], determine whether targetPlayer wins. Apply every condition exactly. For a comparative rule, compare all entries and count a tied best eligible ticket as a win.`,
          criteria: {
            win: "The target player wins under the proposal.",
            lose: "The target player loses under the proposal.",
            cannot_determine:
              "The supplied information is insufficient to decide.",
          },
        },
      ],
      [
        `noul_${index}`,
        {
          type: "noul",
          instructions: `Does targetPlayer win, including a tied win, under rule_proposal in scenarios[${index}]? Calculate the rule exactly using game_context; answer no when the target loses. All required tickets are supplied.`,
        },
      ],
    ]),
  );
}

async function evaluateRule(item, run) {
  const started = performance.now();
  const state = {
    game_context: {
      ticket:
        "Six distinct integers from 1 through 100; listed order matters only when the proposal explicitly refers to positions.",
      draw: "Six distinct integers from 1 through 100.",
      comparative_rules:
        "All submitted tickets for the evaluated round appear in scenario.entries. Every ticket tied at the best eligible score wins.",
    },
    rule_proposal: item.proposal,
    scenarios: item.scenarios,
  };
  const response = await decide(state, questionsFor(item));
  return {
    run,
    ruleId: item.id,
    tier: item.tier,
    language: item.language,
    proposal: item.proposal,
    latencyMs: response.latencyMs,
    wallClockMs: Math.round(performance.now() - started),
    model: response.model,
    usage: response.usage,
    providerCostUsd: response.usage?.cost ?? response.estimatedCostUsd,
    scenarios: item.scenarios.map((scenario, index) => {
      const expected = expectedOutcome(item, scenario);
      const choice = response.answers[`choice_${index}`];
      const noul = response.answers[`noul_${index}`]?.noul ?? null;
      const choicePrediction =
        choice?.choice === "win"
          ? "WIN"
          : choice?.choice === "lose"
            ? "LOSE"
            : "ABSTAIN";
      const noulPrediction =
        noul === null ? "ABSTAIN" : noul >= 0.5 ? "WIN" : "LOSE";
      const selectedProbability =
        choice?.probabilities?.[choice?.choice] ?? null;
      const choiceActionable =
        choicePrediction !== "ABSTAIN" &&
        selectedProbability >= 0.7 &&
        choice?.confidence >= 0.7;
      const noulActionable = noul !== null && (noul >= 0.7 || noul <= 0.3);
      const combinedActionable =
        choiceActionable &&
        noulActionable &&
        choicePrediction === noulPrediction;
      return {
        scenarioId: scenario.id,
        input: scenario,
        expected,
        choice: {
          prediction: choicePrediction,
          rawChoice: choice?.choice ?? null,
          probabilities: choice?.probabilities ?? null,
          confidence: choice?.confidence ?? null,
          actionable70: choiceActionable,
          correct: choicePrediction === expected,
        },
        noul: {
          probabilityYes: noul,
          prediction: noulPrediction,
          actionable70: noulActionable,
          correct: noulPrediction === expected,
        },
        combined: {
          actionable70: combinedActionable,
          prediction: combinedActionable ? choicePrediction : "ABSTAIN",
          correct: combinedActionable && choicePrediction === expected,
        },
      };
    }),
  };
}

async function mapConcurrent(items, concurrency, fn) {
  const output = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      output[index] = await fn(items[index], index);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );
  return output;
}

function aggregate(evaluations) {
  const rows = evaluations.flatMap((evaluation) =>
    evaluation.scenarios.map((scenario) => ({
      ...scenario,
      tier: evaluation.tier,
      language: evaluation.language,
      ruleId: evaluation.ruleId,
      run: evaluation.run,
    })),
  );
  const group = (selected) => {
    const choiceCorrect = selected.filter((row) => row.choice.correct).length;
    const noulCorrect = selected.filter((row) => row.noul.correct).length;
    const choiceActionable = selected.filter((row) => row.choice.actionable70);
    const noulActionable = selected.filter((row) => row.noul.actionable70);
    const combinedActionable = selected.filter(
      (row) => row.combined.actionable70,
    );
    return {
      judgments: selected.length,
      choiceTopAccuracy: choiceCorrect / selected.length,
      noulThresholdAccuracy: noulCorrect / selected.length,
      choiceActionable70Coverage: choiceActionable.length / selected.length,
      choiceActionable70Accuracy: choiceActionable.length
        ? choiceActionable.filter((row) => row.choice.correct).length /
          choiceActionable.length
        : null,
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
      choiceFalseWins: selected.filter(
        (row) => row.expected === "LOSE" && row.choice.prediction === "WIN",
      ).length,
      choiceFalseLosses: selected.filter(
        (row) => row.expected === "WIN" && row.choice.prediction === "LOSE",
      ).length,
    };
  };
  const byTier = Object.fromEntries(
    ["simple", "medium", "complex"].map((tier) => [
      tier,
      group(rows.filter((row) => row.tier === tier)),
    ]),
  );
  const keys = [
    ...new Set(rows.map((row) => `${row.ruleId}/${row.scenarioId}`)),
  ];
  const stableChoice = keys.filter(
    (key) =>
      new Set(
        rows
          .filter((row) => `${row.ruleId}/${row.scenarioId}` === key)
          .map((row) => row.choice.prediction),
      ).size === 1,
  ).length;
  return {
    rules: benchmark.length,
    scenariosPerRun: benchmark.reduce(
      (sum, item) => sum + item.scenarios.length,
      0,
    ),
    runs: new Set(evaluations.map((item) => item.run)).size,
    overall: group(rows),
    byTier,
    choicePredictionStability: stableChoice / keys.length,
    totalLatencyMs: evaluations.reduce((sum, item) => sum + item.latencyMs, 0),
    meanRequestLatencyMs:
      evaluations.reduce((sum, item) => sum + item.latencyMs, 0) /
      evaluations.length,
    knownProviderCostUsd: evaluations.reduce(
      (sum, item) => sum + (item.providerCostUsd ?? 0),
      0,
    ),
    unpricedRequests: evaluations.filter(
      (item) => item.providerCostUsd === null,
    ).length,
  };
}

async function main() {
  validateBenchmark();
  const dryRun = process.argv.includes("--dry-run");
  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          rules: benchmark.length,
          scenarios: benchmark.reduce(
            (sum, item) => sum + item.scenarios.length,
            0,
          ),
          tiers: Object.fromEntries(
            ["simple", "medium", "complex"].map((tier) => [
              tier,
              benchmark.filter((item) => item.tier === tier).length,
            ]),
          ),
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
  const runs = Number(runsArg?.split("=")[1] ?? 3);
  const concurrency = Number(concurrencyArg?.split("=")[1] ?? 4);
  const evaluations = [];
  const wallStarted = performance.now();
  for (let run = 1; run <= runs; run += 1) {
    evaluations.push(
      ...(await mapConcurrent(benchmark, concurrency, (item) =>
        evaluateRule(item, run),
      )),
    );
  }
  const report = {
    generatedAt: new Date().toISOString(),
    method: {
      model: "~typesafe/jev-latest",
      astSentToJev: false,
      thresholds:
        "Choice selected probability >= 0.70 and confidence >= 0.70; Noul <= 0.30 or >= 0.70",
      note: "Reference ASTs are hidden test oracles only.",
    },
    summary: {
      ...aggregate(evaluations),
      endToEndWallClockMs: Math.round(performance.now() - wallStarted),
    },
    evaluations,
  };
  const output = outputArg?.slice("--output=".length);
  if (output)
    writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(report.summary, null, 2));
}

export { aggregate, benchmark, expectedOutcome, validateBenchmark };

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  await main();
}
