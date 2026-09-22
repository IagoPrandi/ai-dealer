import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPublicJevEvaluationState,
  buildQuestionsForTask,
  combineSemanticDecisions,
  createJevEvaluationTasks,
  deriveProcessJudgment,
  expectedNoulLabels,
  validateJevPipelineCorpus,
  validateJevResponse,
  type JevQuestionSet,
} from "./jevPipelineEvaluation.js";
import {
  fingerprintJevPipelineCorpusV1,
  JEV_PIPELINE_CORPUS_V1,
  JEV_PIPELINE_CORPUS_V1_SHA256,
} from "./jevPipelineCorpusV1.js";

function validResponse(questions: JevQuestionSet): unknown {
  return {
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        if (question.type === "noul") {
          return [id, { noul: 0.9, type: "noul" }];
        }
        const options = Object.keys(question.criteria);
        const selected = options[0]!;
        return [
          id,
          {
            choice: selected,
            confidence: 0.8,
            probabilities: Object.fromEntries(
              options.map((option, index) => [
                option,
                index === 0 ? 0.8 : 0.2 / (options.length - 1),
              ]),
            ),
            type: "choice",
          },
        ];
      }),
    ),
    model: "typesafe/jev-1.13-20260917",
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

test("the frozen corpus has the required distribution and deterministic oracles", () => {
  assert.doesNotThrow(() => validateJevPipelineCorpus());
  assert.equal(JEV_PIPELINE_CORPUS_V1.length, 10);
  assert.deepEqual(
    Object.fromEntries(
      ["CLEAR", "AMBIGUOUS", "BLOCKED"].map((kind) => [
        kind,
        JEV_PIPELINE_CORPUS_V1.filter((fixture) => fixture.class === kind)
          .length,
      ]),
    ),
    { AMBIGUOUS: 3, BLOCKED: 2, CLEAR: 5 },
  );
});

test("the corpus fingerprint is pinned and detects fixture drift", () => {
  assert.equal(fingerprintJevPipelineCorpusV1(), JEV_PIPELINE_CORPUS_V1_SHA256);
});

test("one repeat builds all P01 controls and paired P01/P02 fixtures", () => {
  const tasks = createJevEvaluationTasks(1);
  assert.equal(tasks.length, 38);
  assert.equal(
    tasks.filter((task) => task.processes.includes("P01")).length,
    38,
  );
  assert.equal(
    tasks.filter((task) => task.processes.includes("P02")).length,
    30,
  );
  assert.equal(tasks.filter((task) => task.kind === "p01_control").length, 8);
});

test("the Jev state allowlist excludes hidden labels and mutation notes", () => {
  const mutationTask = createJevEvaluationTasks(1).find(
    (task) => task.candidate.kind === "semantic_mutation",
  );
  assert.ok(mutationTask);
  const serialized = JSON.stringify(
    buildPublicJevEvaluationState(mutationTask),
  );
  assert.equal(serialized.includes("expectedP01"), false);
  assert.equal(serialized.includes("expectedP02"), false);
  assert.equal(serialized.includes("labelledReasons"), false);
  assert.equal(serialized.includes("mutationNote"), false);
  assert.equal(
    serialized.includes(mutationTask.candidate.mutationNote ?? "not-present"),
    false,
  );
});

test("response validation preserves complete typed answers and usage", () => {
  const task = createJevEvaluationTasks(1)[0]!;
  const questions = buildQuestionsForTask(task);
  const response = validateJevResponse(validResponse(questions), questions);
  assert.deepEqual(
    Object.keys(response.answers).sort(),
    Object.keys(questions).sort(),
  );
  assert.equal(response.usage.inputTokens, 100);
  assert.equal(response.usage.outputTokens, 20);
});

test("response validation rejects missing, extra, malformed, and non-finite answers", () => {
  const task = createJevEvaluationTasks(1)[0]!;
  const questions = buildQuestionsForTask(task);
  const base = validResponse(questions) as {
    answers: Record<string, Record<string, unknown>>;
    model: string;
    usage: Record<string, unknown>;
  };
  const firstId = Object.keys(base.answers)[0]!;

  const missing = structuredClone(base);
  delete missing.answers[firstId];
  assert.throws(
    () => validateJevResponse(missing, questions),
    /answer IDs differ/u,
  );

  const extra = structuredClone(base);
  extra.answers.extra = { noul: 0.5, type: "noul" };
  assert.throws(
    () => validateJevResponse(extra, questions),
    /answer IDs differ/u,
  );

  const malformed = structuredClone(base);
  malformed.answers[firstId]!.type = "score";
  assert.throws(
    () => validateJevResponse(malformed, questions),
    /wrong primitive/u,
  );

  const nonFinite = structuredClone(base);
  const noulId = Object.keys(questions).find(
    (id) => questions[id]?.type === "noul",
  )!;
  nonFinite.answers[noulId]!.noul = Number.NaN;
  assert.throws(
    () => validateJevResponse(nonFinite, questions),
    /finite probability/u,
  );
});

test("P01 keeps Choice uncertainty explicit and P02 applies only the named evaluation bands", () => {
  const task = createJevEvaluationTasks(1)[0]!;
  const questions = buildQuestionsForTask(task);
  const body = validResponse(questions) as {
    answers: Record<string, Record<string, unknown>>;
    model: string;
    usage: Record<string, unknown>;
  };
  body.answers.p01_overall!.choice = "insufficient_evidence";
  body.answers.p01_overall!.probabilities = {
    contradicted: 0.1,
    insufficient_evidence: 0.8,
    supported: 0.1,
  };
  body.answers.p02_interpretation_supported_by_source!.noul = 0.69;
  const response = validateJevResponse(body, questions);
  assert.equal(
    deriveProcessJudgment("P01", task.fixture, response).decision,
    "insufficient_evidence",
  );
  assert.equal(
    deriveProcessJudgment("P02", task.fixture, response).decision,
    "insufficient_evidence",
  );
});

test("combined policy fails closed without converting failures into semantic labels", () => {
  assert.equal(combineSemanticDecisions("supported", "supported"), "supported");
  assert.equal(
    combineSemanticDecisions("supported", "insufficient_evidence"),
    "insufficient_evidence",
  );
  assert.equal(
    combineSemanticDecisions("supported", "contradicted"),
    "contradicted",
  );
  assert.equal(
    combineSemanticDecisions("contradicted", "unavailable"),
    "unavailable",
  );
});

test("Brier labels preserve directional and atomic interpretation failures", () => {
  const assumption = createJevEvaluationTasks(1).find(
    (task) =>
      task.fixture.id === "CLR-04" &&
      task.interpretation.kind === "introduced_assumption",
  );
  assert.ok(assumption);
  const labels = expectedNoulLabels(assumption, "P02");
  assert.equal(labels?.interpretationSupportedBySource, 0);
  assert.equal(labels?.sourcePreservedByInterpretation, 1);
  assert.equal(labels?.quantity, 0);
  assert.equal(labels?.comparator, 0);
  assert.equal(labels?.polarity, 1);
});
