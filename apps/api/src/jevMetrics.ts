import type { JevSemanticReviewStatus } from "@tyche/rule-compiler";

/** Offline measurements only. This module cannot authorize a production rule. */
export interface JevBenchmarkJudgment {
  proposalId: string;
  candidateId: string;
  split: "calibration" | "holdout";
  language: "pt" | "en";
  complexity: "simple" | "medium" | "complex";
  correct: boolean;
  repetition: 1 | 2 | 3;
  status: JevSemanticReviewStatus;
  latencyMs: number;
  costUsd: number | null;
  /** HTTP ingress through terminal event, including queues and retries. */
  responseTimeMs: number;
  providerLatencySumMs: number;
  baselineResponseTimeMs: number;
  baselineCostUsd: number | null;
  finalOutcome: "VALID" | "CLARIFY" | "INVALID";
  finalArtifactCorrect: boolean | null;
  behaviorScenariosPassed: number;
  reviewerLlmUsed: boolean;
  materialAmbiguities: number;
  materialAmbiguitiesAsked: number;
  questions: number;
  unnecessaryQuestions: number;
}

export function percentile(
  values: readonly number[],
  quantile: number,
): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.max(0, Math.ceil(quantile * sorted.length) - 1)] ?? null;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator > 0 ? numerator / denominator : null;
}

function averageCost(values: readonly (number | null)[]): number | null {
  return values.length && values.every((value) => value !== null)
    ? (values as number[]).reduce((sum, value) => sum + value, 0) /
        values.length
    : null;
}

export function summarizeJevHoldout(input: readonly JevBenchmarkJudgment[]) {
  const splitByProposal = new Map<string, string>();
  for (const row of input) {
    if (
      splitByProposal.has(row.proposalId) &&
      splitByProposal.get(row.proposalId) !== row.split
    ) {
      throw new Error("Proposal leaked between calibration and holdout");
    }
    splitByProposal.set(row.proposalId, row.split);
    if (![1, 2, 3].includes(row.repetition))
      throw new Error("Invalid repetition");
  }
  const rows = input.filter((row) => row.split === "holdout");
  const candidates = new Map<string, JevBenchmarkJudgment[]>();
  for (const row of rows) {
    for (const value of [
      row.latencyMs,
      row.responseTimeMs,
      row.providerLatencySumMs,
      row.baselineResponseTimeMs,
      row.behaviorScenariosPassed,
      row.materialAmbiguities,
      row.materialAmbiguitiesAsked,
      row.questions,
      row.unnecessaryQuestions,
    ]) {
      if (!Number.isFinite(value) || value < 0)
        throw new Error("Invalid benchmark measurement");
    }
    if (
      row.materialAmbiguitiesAsked > row.materialAmbiguities ||
      row.unnecessaryQuestions > row.questions ||
      [row.costUsd, row.baselineCostUsd].some(
        (cost) => cost !== null && (!Number.isFinite(cost) || cost < 0),
      )
    ) {
      throw new Error("Invalid benchmark counts or cost");
    }
    const key = JSON.stringify([row.proposalId, row.candidateId]);
    const group = candidates.get(key) ?? [];
    if (
      group.some(
        (prior) =>
          prior.repetition === row.repetition ||
          prior.correct !== row.correct ||
          prior.language !== row.language ||
          prior.complexity !== row.complexity,
      )
    ) {
      throw new Error("Duplicate repetition or inconsistent candidate labels");
    }
    group.push(row);
    candidates.set(key, group);
  }
  const groups = [...candidates.values()];
  const complete =
    groups.length > 0 &&
    groups.every(
      (group) =>
        group.length === 3 &&
        new Set(group.map((row) => row.repetition)).size === 3,
    );
  const incorrect = groups.filter((group) => group[0]?.correct === false);
  const correct = groups.filter((group) => group[0]?.correct === true);
  // Count independent candidates, never treat three repeats as three samples.
  const falseAccepts = incorrect.filter((group) =>
    group.some((row) => row.status === "PASS"),
  ).length;
  const released = (group: JevBenchmarkJudgment[]) =>
    group.length === 3 && group.every((row) => row.status === "PASS");
  const coverage = (subset: JevBenchmarkJudgment[][]) =>
    ratio(subset.filter(released).length, subset.length);
  const coverageAll = coverage(correct);
  const coverageComplex = coverage(
    correct.filter((group) => group[0]?.complexity === "complex"),
  );
  const coveragePt = coverage(
    correct.filter((group) => group[0]?.language === "pt"),
  );
  const coverageEn = coverage(
    correct.filter((group) => group[0]?.language === "en"),
  );
  const coverageGap =
    coveragePt === null || coverageEn === null
      ? null
      : Math.abs(coveragePt - coverageEn);
  const stability = ratio(
    groups.filter(
      (group) =>
        group.length === 3 &&
        new Set(group.map((row) => `${row.status}:${row.reviewerLlmUsed}`))
          .size === 1,
    ).length,
    groups.length,
  );
  const upper95 =
    falseAccepts === 0 && incorrect.length > 0
      ? 1 - Math.pow(0.05, 1 / incorrect.length)
      : null;
  const clear = rows.filter(
    (row) => row.correct && row.materialAmbiguities === 0,
  );
  const clearAccepted = clear.filter((row) => row.finalOutcome === "VALID");
  const meanCost = averageCost(rows.map((row) => row.costUsd));
  const meanBaselineCost = averageCost(rows.map((row) => row.baselineCostUsd));
  const clearCost = averageCost(clearAccepted.map((row) => row.costUsd));
  const clearBaselineCost = averageCost(
    clearAccepted.map((row) => row.baselineCostUsd),
  );
  const latency = {
    p50: percentile(
      rows.map((row) => row.latencyMs),
      0.5,
    ),
    p95: percentile(
      rows.map((row) => row.latencyMs),
      0.95,
    ),
    p99: percentile(
      rows.map((row) => row.latencyMs),
      0.99,
    ),
  };
  const response = {
    p50: percentile(
      clear.map((row) => row.responseTimeMs),
      0.5,
    ),
    p95: percentile(
      clear.map((row) => row.responseTimeMs),
      0.95,
    ),
  };
  const baselineResponse = {
    p50: percentile(
      clear.map((row) => row.baselineResponseTimeMs),
      0.5,
    ),
    p95: percentile(
      clear.map((row) => row.baselineResponseTimeMs),
      0.95,
    ),
  };
  const fallbackOverheadP95 = percentile(
    rows
      .filter((row) => row.reviewerLlmUsed)
      .map((row) =>
        Math.max(0, row.responseTimeMs - row.baselineResponseTimeMs),
      ),
    0.95,
  );
  const availability = ratio(
    rows.filter((row) => row.status !== "ERROR").length,
    rows.length,
  );
  const reviewerShare = ratio(
    clear.filter((row) => row.reviewerLlmUsed).length,
    clear.length,
  );
  const ambiguities = rows.reduce(
    (sum, row) => sum + row.materialAmbiguities,
    0,
  );
  const ambiguityRecall = ratio(
    rows.reduce((sum, row) => sum + row.materialAmbiguitiesAsked, 0),
    ambiguities,
  );
  const unnecessaryQuestionRate = ratio(
    rows.reduce((sum, row) => sum + row.unnecessaryQuestions, 0),
    rows.reduce((sum, row) => sum + row.questions, 0),
  );
  const passRows = rows.filter((row) => row.status === "PASS");
  const correctPasses = passRows.filter((row) => row.correct).length;
  const atLeast = (value: number | null, threshold: number) =>
    value !== null && value >= threshold;
  const atMost = (value: number | null, threshold: number) =>
    value !== null && value <= threshold;
  const reduced = (
    value: number | null,
    baseline: number | null,
    factor: number,
  ) =>
    value !== null &&
    baseline !== null &&
    baseline > 0 &&
    value <= factor * baseline;
  const gates = {
    repetitions: complete,
    falseAcceptance:
      incorrect.length >= 360 &&
      falseAccepts === 0 &&
      upper95 !== null &&
      upper95 < 0.01,
    coverage: atLeast(coverageAll, 0.75) && atLeast(coverageComplex, 0.6),
    language: atMost(coverageGap, 0.05) && falseAccepts === 0,
    stability: atLeast(stability, 0.98),
    finalArtifacts:
      rows.some((row) => row.finalOutcome === "VALID") &&
      rows.every(
        (row) =>
          row.finalOutcome !== "VALID" ||
          (row.finalArtifactCorrect === true &&
            row.behaviorScenariosPassed === 204),
      ),
    questions: ambiguityRecall === 1 && atMost(unnecessaryQuestionRate, 0.15),
    latency:
      atMost(latency.p50, 500) &&
      atMost(latency.p95, 1000) &&
      atLeast(availability, 0.995),
    responseTime:
      reduced(response.p50, baselineResponse.p50, 0.75) &&
      reduced(response.p95, baselineResponse.p95, 0.75) &&
      atMost(fallbackOverheadP95, 1000),
    cost:
      reduced(clearCost, clearBaselineCost, 0.75) &&
      reduced(meanCost, meanBaselineCost, 0.85),
    reviewerUsage: atMost(reviewerShare, 0.25),
  };
  return {
    gates,
    passed: Object.values(gates).every(Boolean),
    judgments: rows.length,
    independentIncorrectCandidates: incorrect.length,
    falseAccepts,
    falseAcceptUpper95: upper95,
    precision: ratio(correctPasses, passRows.length),
    recall: ratio(correctPasses, rows.filter((row) => row.correct).length),
    falseBlockRate: ratio(
      rows.filter((row) => row.correct && row.status === "MISMATCH").length,
      rows.filter((row) => row.correct).length,
    ),
    abstentionRate: ratio(
      rows.filter((row) => row.status === "ABSTAIN").length,
      rows.length,
    ),
    coverageAll,
    coverageComplex,
    coveragePt,
    coverageEn,
    coverageGap,
    stability,
    ambiguityRecall,
    unnecessaryQuestionRate,
    latency,
    response,
    baselineResponse,
    fallbackOverheadP95,
    availability,
    reviewerShare,
    meanCost,
    meanBaselineCost,
    providerLatencySumMs: rows.reduce(
      (sum, row) => sum + row.providerLatencySumMs,
      0,
    ),
    costsByOutcome: Object.fromEntries(
      ["VALID", "CLARIFY", "INVALID"].map((outcome) => [
        outcome,
        averageCost(
          rows
            .filter((row) => row.finalOutcome === outcome)
            .map((row) => row.costUsd),
        ),
      ]),
    ),
  };
}

// ---------------------------------------------------------------------------
// Reviewer-only measurement
// ---------------------------------------------------------------------------

/**
 * One typed review of one candidate AST. This is what a corpus run can measure
 * on its own: it exercises the reviewer, not the surrounding pipeline, so it
 * answers the accuracy, coverage, language, stability and latency gates and
 * CANNOT answer the cost, response-time, question or final-artifact gates. Those
 * need the full preflight run twice, and `summarizeJevHoldout` remains the
 * report that decides a release.
 */
export interface JevReviewerJudgment {
  candidateId: string;
  complexity: "complex" | "medium" | "simple";
  correct: boolean;
  costUsd: number | null;
  /** "correct", "equivalent", or the mutation operator that produced it. */
  label: string;
  language: "en" | "pt";
  latencyMs: number;
  proposalId: string;
  repetition: 1 | 2 | 3;
  split: "calibration" | "holdout";
  status: JevSemanticReviewStatus;
}

/** Gates that no reviewer-only run can decide. Named so a report cannot imply it did. */
export const GATES_NEEDING_FULL_PIPELINE = [
  "cost",
  "finalArtifacts",
  "questions",
  "responseTime",
  "reviewerUsage",
] as const;

export function summarizeJevReviewerHoldout(
  input: readonly JevReviewerJudgment[],
) {
  const splitByProposal = new Map<string, string>();
  for (const row of input) {
    if (
      splitByProposal.has(row.proposalId) &&
      splitByProposal.get(row.proposalId) !== row.split
    ) {
      throw new Error("Proposal leaked between calibration and holdout");
    }
    splitByProposal.set(row.proposalId, row.split);
    if (![1, 2, 3].includes(row.repetition))
      throw new Error("Invalid repetition");
    if (!Number.isFinite(row.latencyMs) || row.latencyMs < 0)
      throw new Error("Invalid latency measurement");
  }

  const rows = input.filter((row) => row.split === "holdout");
  const candidates = new Map<string, JevReviewerJudgment[]>();
  for (const row of rows) {
    const group = candidates.get(row.candidateId) ?? [];
    if (group.some((prior) => prior.repetition === row.repetition)) {
      throw new Error(`Duplicate repetition for ${row.candidateId}`);
    }
    group.push(row);
    candidates.set(row.candidateId, group);
  }
  const groups = [...candidates.values()];
  const complete =
    groups.length > 0 && groups.every((group) => group.length === 3);
  const incorrect = groups.filter((group) => group[0]?.correct === false);
  const correct = groups.filter((group) => group[0]?.correct === true);

  // One candidate is one sample. A single PASS in any repetition is a false
  // accept: the release route would have taken it.
  const falseAcceptGroups = incorrect.filter((group) =>
    group.some((row) => row.status === "PASS"),
  );
  const released = (group: JevReviewerJudgment[]) =>
    group.length === 3 && group.every((row) => row.status === "PASS");
  const coverage = (subset: JevReviewerJudgment[][]) =>
    ratio(subset.filter(released).length, subset.length);
  const coveragePt = coverage(
    correct.filter((group) => group[0]?.language === "pt"),
  );
  const coverageEn = coverage(
    correct.filter((group) => group[0]?.language === "en"),
  );
  const upper95 =
    falseAcceptGroups.length === 0 && incorrect.length > 0
      ? 1 - Math.pow(0.05, 1 / incorrect.length)
      : null;
  const stability = ratio(
    groups.filter(
      (group) =>
        group.length === 3 &&
        new Set(group.map((row) => row.status)).size === 1,
    ).length,
    groups.length,
  );
  const latencies = rows.map((row) => row.latencyMs);
  const passRows = rows.filter((row) => row.status === "PASS");
  const atLeast = (value: number | null, threshold: number) =>
    value !== null && value >= threshold;
  const atMost = (value: number | null, threshold: number) =>
    value !== null && value <= threshold;
  const coverageAll = coverage(correct);
  const coverageComplex = coverage(
    correct.filter((group) => group[0]?.complexity === "complex"),
  );
  const coverageGap =
    coveragePt === null || coverageEn === null
      ? null
      : Math.abs(coveragePt - coverageEn);
  const availability = ratio(
    rows.filter((row) => row.status !== "ERROR").length,
    rows.length,
  );
  const gates = {
    repetitions: complete,
    falseAcceptance:
      incorrect.length >= 360 &&
      falseAcceptGroups.length === 0 &&
      upper95 !== null &&
      upper95 < 0.01,
    coverage: atLeast(coverageAll, 0.75) && atLeast(coverageComplex, 0.6),
    language: atMost(coverageGap, 0.05) && falseAcceptGroups.length === 0,
    stability: atLeast(stability, 0.98),
    latency:
      atMost(percentile(latencies, 0.5), 500) &&
      atMost(percentile(latencies, 0.95), 1000) &&
      atLeast(availability, 0.995),
  };
  // Which defect class slips through matters more than the total: a reviewer
  // blind to one operator is not the same risk as one that is uniformly noisy.
  const byLabel: Record<string, { candidates: number; falseAccepts: number }> =
    {};
  for (const group of incorrect) {
    const label = group[0]?.label ?? "unknown";
    const entry = byLabel[label] ?? { candidates: 0, falseAccepts: 0 };
    entry.candidates += 1;
    if (group.some((row) => row.status === "PASS")) entry.falseAccepts += 1;
    byLabel[label] = entry;
  }
  return {
    gates,
    gatesNotMeasured: [...GATES_NEEDING_FULL_PIPELINE],
    measuredGatesPassed: Object.values(gates).every(Boolean),
    judgments: rows.length,
    independentCorrectCandidates: correct.length,
    independentIncorrectCandidates: incorrect.length,
    falseAccepts: falseAcceptGroups.length,
    falseAcceptExamples: falseAcceptGroups
      .slice(0, 10)
      .map((group) => group[0]?.candidateId ?? "unknown"),
    falseAcceptUpper95: upper95,
    falseAcceptsByLabel: byLabel,
    precision: ratio(
      passRows.filter((row) => row.correct).length,
      passRows.length,
    ),
    recall: ratio(
      passRows.filter((row) => row.correct).length,
      rows.filter((row) => row.correct).length,
    ),
    falseBlockRate: ratio(
      rows.filter((row) => row.correct && row.status === "MISMATCH").length,
      rows.filter((row) => row.correct).length,
    ),
    abstentionRate: ratio(
      rows.filter((row) => row.status === "ABSTAIN").length,
      rows.length,
    ),
    coverageAll,
    coverageComplex,
    coveragePt,
    coverageEn,
    coverageGap,
    stability,
    availability,
    latency: {
      p50: percentile(latencies, 0.5),
      p95: percentile(latencies, 0.95),
      p99: percentile(latencies, 0.99),
    },
    totalCostUsd: rows.every((row) => row.costUsd !== null)
      ? rows.reduce((sum, row) => sum + (row.costUsd ?? 0), 0)
      : null,
  };
}
