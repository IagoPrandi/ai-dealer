import {
  describeRuleAstForPlayers,
  evaluatePredicate,
  evaluateRankingEntry,
  ruleAstSchema,
} from "@tyche/rule-compiler";
import { fileURLToPath } from "node:url";
import { cases, decide } from "./jev-rule-probe.mjs";

// A bounded grammar experiment. Candidate ASTs are built from public DSL nodes;
// fixtures are withheld from Jev and used only to judge executable behavior.
const src = (source) => ({ kind: "source", source });
const red = (op, of) => ({ kind: "reduce", op, of });
const lit = (value) => ({ kind: "lit", value });
const cmp = (op, left, right) => ({ kind: "compare", op, left, right });
const hits = { kind: "intersection", left: src("guess"), right: src("draw") };
const countHits = red("count", hits);

function rankingCandidates() {
  const candidates = [];
  for (const score of ["span", "hits"]) {
    for (const direction of ["min", "max"]) {
      for (const minimumMatches of [null, 1, 2, 3]) {
        const ast = {
          schemaVersion: 3,
          result: {
            type: "ranking",
            direction,
            tieBreak: "share_pool",
            score:
              score === "span" ? red("range_span", src("guess")) : countHits,
            ...(minimumMatches === null
              ? {}
              : { eligibleWhen: cmp("gte", countHits, lit(minimumMatches)) }),
          },
        };
        candidates.push({
          id: `score_${score}__${direction}__gate_${minimumMatches ?? "none"}`,
          ast,
          parameters: { score, direction, minimumMatches },
        });
      }
    }
  }
  return candidates;
}

function xor(a, b) {
  return {
    kind: "or",
    clauses: [
      { kind: "and", clauses: [a, { kind: "not", clause: b }] },
      { kind: "and", clauses: [{ kind: "not", clause: a }, b] },
    ],
  };
}

function predicateCandidates() {
  const candidates = [];
  for (const connective of ["xor", "or", "and"]) {
    for (const sumComparison of ["gt", "gte"]) {
      for (const extremum of ["max", "min"]) {
        const a = cmp(
          sumComparison,
          red("sum", src("guess")),
          red("sum", src("draw")),
        );
        const b = {
          kind: "contains",
          array: src("draw"),
          value: red(extremum, src("guess")),
        };
        const ast = {
          schemaVersion: 3,
          result: {
            type: "predicate",
            predicate:
              connective === "xor"
                ? xor(a, b)
                : { kind: connective, clauses: [a, b] },
          },
        };
        candidates.push({
          id: `${connective}__sum_${sumComparison}__${extremum}_drawn`,
          ast,
          parameters: { connective, sumComparison, extremum },
        });
      }
    }
  }
  return candidates;
}

const rankingFixtures = [
  {
    draw: [10, 20, 30, 40, 50, 60],
    entries: { A: [10, 20, 21, 22, 23, 24], B: [10, 20, 30, 40, 50, 60] },
    winners: ["A"],
  },
  {
    draw: [10, 20, 30, 40, 50, 60],
    entries: { C: [1, 2, 3, 4, 5, 6], D: [10, 20, 45, 46, 47, 48] },
    winners: ["D"],
  },
  {
    draw: [10, 20, 30, 40, 50, 60],
    entries: { E: [10, 20, 90, 91, 92, 93], F: [10, 11, 12, 13, 14, 15] },
    winners: ["E"],
  },
  {
    draw: [10, 20, 30, 40, 50, 60],
    entries: { G: [10, 20, 31, 32, 33, 34], H: [40, 50, 61, 62, 63, 64] },
    winners: ["G", "H"],
  },
  {
    draw: [10, 20, 30, 40, 50, 60],
    entries: { A: [24, 10, 23, 20, 22, 21], B: [60, 50, 40, 30, 20, 10] },
    winners: ["A"],
  },
  {
    draw: [10, 20, 30, 40, 50, 60],
    entries: { I: [10, 20, 30, 40, 50, 60], J: [10, 20, 21, 22, 23, 24] },
    winners: ["J"],
  },
  {
    draw: [10, 20, 30, 40, 50, 60],
    entries: { P: [10, 20, 70, 80, 89, 90], Q: [10, 20, 30, 31, 32, 34] },
    winners: ["Q"],
  },
  {
    draw: [10, 20, 30, 40, 50, 60],
    entries: { X: [1, 2, 3, 4, 5, 7], Y: [71, 72, 73, 74, 75, 76] },
    winners: [],
  },
  {
    draw: [1, 2, 55, 66, 77, 88],
    entries: { C: [1, 2, 3, 4, 5, 6], D: [10, 20, 45, 46, 47, 48] },
    winners: ["C"],
  },
];
const predicateFixtures = [
  {
    guess: [11, 21, 31, 41, 51, 62],
    draw: [10, 20, 30, 40, 50, 60],
    outcome: "WIN",
  },
  {
    guess: [1, 2, 3, 4, 5, 60],
    draw: [10, 20, 30, 40, 50, 60],
    outcome: "WIN",
  },
  {
    guess: [20, 30, 40, 50, 60, 11],
    draw: [10, 20, 30, 40, 50, 60],
    outcome: "LOSE",
  },
  {
    guess: [1, 2, 3, 4, 5, 6],
    draw: [10, 20, 30, 40, 50, 60],
    outcome: "LOSE",
  },
  {
    guess: [35, 36, 37, 38, 39, 25],
    draw: [10, 20, 30, 40, 50, 60],
    outcome: "LOSE",
  },
  {
    guess: [30, 31, 32, 33, 34, 50],
    draw: [10, 20, 30, 40, 50, 60],
    outcome: "WIN",
  },
  {
    guess: [11, 60, 20, 50, 30, 40],
    draw: [10, 20, 30, 40, 50, 60],
    outcome: "LOSE",
  },
  {
    guess: [1, 2, 3, 4, 5, 60],
    draw: [10, 20, 30, 40, 50, 55],
    outcome: "LOSE",
  },
];

function fixtureScore(ast, kind) {
  if (kind === "predicate") {
    return predicateFixtures.filter(
      ({ guess, draw, outcome }) =>
        evaluatePredicate(ast, { guess, draw }).result === outcome,
    ).length;
  }
  return rankingFixtures.filter(({ draw, entries, winners }) => {
    const eligible = Object.entries(entries)
      .map(([id, guess]) => ({
        id,
        ...evaluateRankingEntry(ast, { guess, draw }),
      }))
      .filter((item) => item.eligible);
    const values = eligible.map((item) => item.score);
    const best =
      ast.result.direction === "min"
        ? Math.min(...values)
        : Math.max(...values);
    const actual = eligible
      .filter((item) => item.score === best)
      .map((item) => item.id);
    return (
      JSON.stringify(actual.sort()) === JSON.stringify([...winners].sort())
    );
  }).length;
}

export { rankingCandidates, predicateCandidates };

export async function assessCandidates(
  proposal,
  kind,
  build,
  omitCorrect = false,
) {
  const allCandidates = build().map((candidate) => {
    const parsed = ruleAstSchema.safeParse(candidate.ast);
    if (!parsed.success) throw new Error(`Invalid candidate ${candidate.id}`);
    return {
      ...candidate,
      description: describeRuleAstForPlayers(candidate.ast),
      fixtureScore: fixtureScore(candidate.ast, kind),
    };
  });
  // Negative control: hide every behaviorally exact candidate from Jev.
  const candidates = omitCorrect
    ? allCandidates.filter(
        (candidate) =>
          candidate.fixtureScore <
          (kind === "ranking"
            ? rankingFixtures.length
            : predicateFixtures.length),
      )
    : allCandidates;
  const questions = Object.fromEntries(
    candidates.map((candidate, index) => [
      `candidate_${index}`,
      {
        type: "noul",
        instructions: `Does the complete executable meaning in candidates[${index}].description faithfully implement every material condition in proposal, without adding or removing a condition?`,
      },
    ]),
  );
  const result = await decide(
    {
      proposal,
      candidates: candidates.map(({ id, description }) => ({
        id,
        description,
      })),
    },
    questions,
  );
  const ranked = candidates
    .map((candidate, index) => ({
      id: candidate.id,
      parameters: candidate.parameters,
      fixtureScore: candidate.fixtureScore,
      fixtureTotal:
        kind === "ranking" ? rankingFixtures.length : predicateFixtures.length,
      noul: result.answers[`candidate_${index}`]?.noul ?? null,
    }))
    .sort((a, b) => (b.noul ?? -1) - (a.noul ?? -1));
  const confidenceGap = (ranked[0]?.noul ?? 0) - (ranked[1]?.noul ?? 0);
  const wouldAccept = (ranked[0]?.noul ?? 0) >= 0.8 && confidenceGap >= 0.2;
  const correctIfAccepted =
    !wouldAccept || ranked[0].fixtureScore === ranked[0].fixtureTotal;
  return {
    omitCorrect,
    candidateCount: candidates.length,
    best: ranked[0],
    selectedAst:
      candidates.find((candidate) => candidate.id === ranked[0].id)?.ast ??
      null,
    correctCandidateCount: ranked.filter(
      (item) => item.fixtureScore === item.fixtureTotal,
    ).length,
    confidenceGap,
    wouldAccept,
    correctIfAccepted,
    topFive: ranked.slice(0, 5),
    latencyMs: result.latencyMs,
    model: result.model,
    usage: result.usage,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  for (const [caseId, kind, build] of [
    ["set13-N1", "ranking", rankingCandidates],
    ["set13-N2", "predicate", predicateCandidates],
    ["pt-N1", "ranking", rankingCandidates],
    ["pt-N2", "predicate", predicateCandidates],
  ]) {
    const requestedCases = process.argv
      .slice(2)
      .filter((argument) => !argument.startsWith("--"));
    if (requestedCases.length > 0 && !requestedCases.includes(caseId)) continue;
    const testCase = cases.find((item) => item.id === caseId);
    const omitCorrect = process.argv.includes("--omit-correct");
    const result = await assessCandidates(
      testCase.text,
      kind,
      build,
      omitCorrect,
    );
    delete result.selectedAst;
    console.log(
      JSON.stringify({ caseId, baseline: testCase.baseline, ...result }),
    );
    if (process.argv.includes("--assert")) {
      if (
        omitCorrect
          ? result.wouldAccept
          : !result.wouldAccept || !result.correctIfAccepted
      ) {
        process.exitCode = 1;
      }
    }
  }
}
