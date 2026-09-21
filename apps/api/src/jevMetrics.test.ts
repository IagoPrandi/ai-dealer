import assert from "node:assert/strict";
import { test } from "node:test";
import {
  summarizeJevHoldout,
  type JevBenchmarkJudgment,
} from "./jevMetrics.js";

function row(candidateId: string, repetition: 1 | 2 | 3): JevBenchmarkJudgment {
  return {
    proposalId: candidateId,
    candidateId,
    split: "holdout",
    language: "en",
    complexity: "simple",
    correct: false,
    repetition,
    status: "MISMATCH",
    latencyMs: 300,
    costUsd: null,
    responseTimeMs: 2000,
    providerLatencySumMs: 1400,
    baselineResponseTimeMs: 4000,
    baselineCostUsd: 0.01,
    finalOutcome: "INVALID",
    finalArtifactCorrect: null,
    behaviorScenariosPassed: 204,
    reviewerLlmUsed: false,
    materialAmbiguities: 0,
    materialAmbiguitiesAsked: 0,
    questions: 0,
    unnecessaryQuestions: 0,
  };
}

test("three repeated judgments do not triple the false-acceptance sample size", () => {
  const rows = Array.from({ length: 120 }, (_, index) =>
    ([1, 2, 3] as const).map((repetition) => row(String(index), repetition)),
  ).flat();
  const report = summarizeJevHoldout(rows);
  assert.equal(report.independentIncorrectCandidates, 120);
  assert.equal(report.gates.falseAcceptance, false);
  assert.ok((report.falseAcceptUpper95 ?? 0) > 0.01);
  assert.equal(report.meanCost, null);
  assert.equal(report.gates.cost, false);
  assert.equal(report.passed, false);
});

test("360 distinct incorrect candidates with zero accepts pass only the accuracy gate", () => {
  const rows = Array.from({ length: 360 }, (_, index) =>
    ([1, 2, 3] as const).map((repetition) => row(String(index), repetition)),
  ).flat();
  const report = summarizeJevHoldout(rows);
  assert.equal(report.gates.falseAcceptance, true);
  assert.ok((report.falseAcceptUpper95 ?? 1) < 0.01);
  assert.equal(report.passed, false);
  const first = rows[0];
  assert.ok(first);
  first.status = "PASS";
  const unsafe = summarizeJevHoldout(rows);
  assert.equal(unsafe.falseAccepts, 1);
  assert.equal(unsafe.gates.falseAcceptance, false);
});

test("missing observations, duplicate repeats and leaked proposals cannot pass", () => {
  assert.equal(summarizeJevHoldout([]).passed, false);
  assert.throws(
    () => summarizeJevHoldout([row("a", 1), row("a", 1)]),
    /Duplicate/u,
  );
  assert.throws(
    () =>
      summarizeJevHoldout([
        row("a", 1),
        { ...row("a", 2), split: "calibration" },
      ]),
    /leaked/u,
  );
});
