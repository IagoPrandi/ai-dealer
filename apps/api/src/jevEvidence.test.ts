import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  summarizeJevReviewerHoldout,
  type JevReviewerJudgment,
} from "./jevMetrics.js";

/**
 * Immutable regressions over the stored Jev experiment results.
 *
 * The rollout in `docs/jev-guarded-rollout.md` rests on two measured facts: Jev
 * must never be asked to decide `WIN`/`LOSE` directly, and it is accurate
 * enough to review a proposal against an AST when it also sees the
 * deterministic description. Both facts live in raw JSON that nothing else
 * executes, so a summary edit — or a redefined metric — would silently move the
 * ground under the release gates.
 *
 * These tests recompute every headline number from the individual judgments and
 * compare them against the summary stored beside them. They assert the measured
 * values, not a threshold, so a future re-run must update the JSON and this file
 * together and cannot quietly improve the record.
 */

const ACTIONABLE_GATE = "Choice probability >= 0.70 and confidence >= 0.70";

interface StoredDecision {
  actionable70: boolean;
  correct: boolean;
  prediction: string;
}

interface StoredCandidate {
  choice: StoredDecision;
  combined: StoredDecision;
  expected: "NO" | "YES";
}

interface StoredScenario {
  choice: StoredDecision;
  combined: StoredDecision;
  expected: "LOSE" | "WIN";
}

/** The stored aggregate each test recomputes from the individual judgments. */
interface StoredSummary {
  choiceFalseWins?: number;
  choiceTopAccuracy: number;
  combinedActionable70Accuracy: number;
  combinedActionable70Coverage: number;
  combinedActionable70FalseAccepts?: number;
  judgments: number;
}

interface StoredResults<T> {
  evaluations: T[];
  method: Record<string, unknown>;
  summary: {
    byMode?: Record<string, { overall: StoredSummary }>;
    overall?: StoredSummary;
  };
}

function readResults<T>(name: string): StoredResults<T> {
  return JSON.parse(
    readFileSync(new URL(`../../../docs/${name}`, import.meta.url), "utf8"),
  ) as StoredResults<T>;
}

function share(matching: number, total: number): number {
  assert.ok(total > 0, "a stored experiment must contain judgments");
  return matching / total;
}

test("direct WIN/LOSE evaluation stays prohibited by its own measurements", () => {
  const results = readResults<{ scenarios: StoredScenario[] }>(
    "jev-direct-rule-evaluation-results.json",
  );
  const scenarios = results.evaluations.flatMap(
    (evaluation) => evaluation.scenarios,
  );
  const stored = results.summary.overall;
  assert.ok(stored);

  assert.equal(scenarios.length, 240);
  assert.equal(stored.judgments, scenarios.length);
  assert.equal(
    share(scenarios.filter((row) => row.choice.correct).length, 240),
    stored.choiceTopAccuracy,
  );
  // 82.92% is far below what a settlement decision may be. The reason the
  // prohibition is unconditional, though, is the next two assertions: the
  // confident subset is not safe either.
  assert.equal(stored.choiceTopAccuracy, 0.8291666666666667);
  assert.equal(
    scenarios.filter(
      (row) => row.expected === "LOSE" && row.choice.prediction === "WIN",
    ).length,
    stored.choiceFalseWins,
  );
  assert.equal(stored.choiceFalseWins, 32);

  // Requiring BOTH primitives to be confident discards half the scenarios and
  // still pays six tickets that must lose. No gate over this evidence reaches
  // zero false winners, which is why no Jev route may settle a guess.
  const gated = scenarios.filter((row) => row.combined.actionable70);
  assert.equal(
    share(gated.length, scenarios.length),
    stored.combinedActionable70Coverage,
  );
  assert.equal(stored.combinedActionable70Coverage, 0.475);
  assert.equal(
    gated.filter(
      (row) => row.expected === "LOSE" && row.combined.prediction === "WIN",
    ).length,
    6,
  );
});

test("proposal-to-AST review keeps its zero false accepts under the 70/70 gate", () => {
  const results = readResults<{ candidates: StoredCandidate[]; mode: string }>(
    "jev-ast-semantic-validation-single-results.json",
  );
  assert.equal(
    results.method.thresholds,
    `${ACTIONABLE_GATE}; Noul <= 0.30 or >= 0.70`,
  );
  // One AST per request, which is the shape a production review has.
  assert.equal(results.method.layout, "single");

  for (const [mode, expected] of [
    ["raw", { topAccuracy: 0.9166666666666666, ungatedFalseAccepts: 3 }],
    ["described", { topAccuracy: 0.975, ungatedFalseAccepts: 0 }],
  ] as const) {
    const candidates = results.evaluations
      .filter((evaluation) => evaluation.mode === mode)
      .flatMap((evaluation) => evaluation.candidates);
    const stored = results.summary.byMode?.[mode]?.overall;
    assert.ok(stored, `stored summary for ${mode}`);

    assert.equal(candidates.length, 120);
    assert.equal(stored.judgments, candidates.length);
    assert.equal(
      share(candidates.filter((row) => row.choice.correct).length, 120),
      stored.choiceTopAccuracy,
    );
    assert.equal(stored.choiceTopAccuracy, expected.topAccuracy);
    // Without the deterministic description Jev accepts three mutated ASTs
    // outright. That is why the production request always carries
    // `describeRuleAstTotal` output, and why the raw mode is not the evidence
    // the rollout gates rely on.
    assert.equal(
      candidates.filter(
        (row) => row.expected === "NO" && row.choice.prediction === "YES",
      ).length,
      expected.ungatedFalseAccepts,
    );

    const gated = candidates.filter((row) => row.combined.actionable70);
    assert.equal(
      share(gated.length, candidates.length),
      stored.combinedActionable70Coverage,
    );
    assert.equal(
      share(gated.filter((row) => row.combined.correct).length, gated.length),
      stored.combinedActionable70Accuracy,
    );
    // The gate itself admits no wrong AST in either mode. This is the single
    // measurement the shadow and canary phases exist to reproduce on live
    // traffic before a PASS may replace the LLM reviewer.
    assert.equal(
      gated.filter(
        (row) => row.expected === "NO" && row.combined.prediction === "YES",
      ).length,
      0,
    );
    assert.equal(stored.combinedActionable70FalseAccepts, 0);
  }

  const described = results.summary.byMode?.described?.overall;
  assert.equal(described?.combinedActionable70Coverage, 0.8416666666666667);
  assert.equal(described?.combinedActionable70Accuracy, 1);
});

test("the paired layout is recorded but is not the released measurement", () => {
  const results = readResults<{ candidates: StoredCandidate[]; mode: string }>(
    "jev-ast-semantic-validation-results.json",
  );
  const described = results.evaluations
    .filter((evaluation) => evaluation.mode === "described")
    .flatMap((evaluation) => evaluation.candidates);
  const stored = results.summary.byMode?.described?.overall;
  assert.ok(stored);

  // This run predates the `layout` field and showed both candidates side by
  // side, so one answer could inform the other. Its higher accuracy cannot be
  // claimed for a production call that reviews one AST at a time. It is kept
  // only so a re-run can detect a drift in the model.
  assert.equal(results.method.layout, undefined);
  assert.equal(
    share(described.filter((row) => row.choice.correct).length, 120),
    stored.choiceTopAccuracy,
  );
  assert.equal(stored.choiceTopAccuracy, 1);
  assert.equal(
    described.filter(
      (row) =>
        row.expected === "NO" &&
        row.combined.actionable70 &&
        row.combined.prediction === "YES",
    ).length,
    0,
  );
});

test("the offline reviewer run failed its gates, and stays failed", () => {
  const judgments = JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/jev-reviewer-benchmark-judgments.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as JevReviewerJudgment[];
  const stored = JSON.parse(
    readFileSync(
      new URL(
        "../../../docs/jev-reviewer-benchmark-report.json",
        import.meta.url,
      ),
      "utf8",
    ),
  ) as {
    model: string;
    report: ReturnType<typeof summarizeJevReviewerHoldout>;
  };
  const recomputed = summarizeJevReviewerHoldout(judgments);

  assert.equal(judgments.length, 2688);
  assert.equal(stored.model, "typesafe/jev-1.13-20260917");
  assert.deepEqual(
    recomputed,
    stored.report,
    "the stored report must be reproducible from the raw judgments",
  );

  // The result that blocks the rollout. 12 of 385 independent incorrect
  // candidates in the holdout were accepted, so the one-sided bound cannot even
  // be computed and the accuracy gate fails outright.
  assert.equal(recomputed.independentIncorrectCandidates, 385);
  assert.equal(recomputed.falseAccepts, 12);
  assert.equal(recomputed.falseAcceptUpper95, null);
  assert.equal(recomputed.gates.falseAcceptance, false);
  assert.equal(recomputed.measuredGatesPassed, false);

  // Swapping `guess` for `draw` makes the rule ignore the player's ticket
  // entirely. The reviewer saw both descriptions side by side and still passed
  // it eight times; this is the single most dangerous miss in the run.
  assert.equal(recomputed.falseAcceptsByLabel.source_swap?.falseAccepts, 8);
  // Reading the prose instead of the tree: "at least three" became "exactly
  // three" while the reference description was left in place.
  assert.equal(
    recomputed.falseAcceptsByLabel.serializer_divergence?.falseAccepts,
    4,
  );
  for (const label of [
    "boolean_composition",
    "clause_omission",
    "comparator_strictness",
    "ranking_direction",
    "ranking_eligibility",
    "reduce_operator",
    "set_operator",
    "threshold",
  ]) {
    assert.equal(
      recomputed.falseAcceptsByLabel[label]?.falseAccepts,
      0,
      `${label} was caught every time and must stay caught`,
    );
  }

  // Coverage and stability are far from their gates too, so this is not a
  // near-miss that a threshold nudge would fix.
  assert.ok((recomputed.coverageAll ?? 1) < 0.75);
  assert.ok((recomputed.coverageComplex ?? 1) < 0.6);
  assert.ok((recomputed.stability ?? 1) < 0.98);

  // Latency is the one measured gate that passed, and it passed comfortably.
  assert.equal(recomputed.gates.latency, true);
  assert.ok((recomputed.latency.p95 ?? Infinity) <= 1000);

  // No reviewer-only run may ever imply it decided a pipeline gate.
  assert.deepEqual(recomputed.gatesNotMeasured, [
    "cost",
    "finalArtifacts",
    "questions",
    "responseTime",
    "reviewerUsage",
  ]);
});
