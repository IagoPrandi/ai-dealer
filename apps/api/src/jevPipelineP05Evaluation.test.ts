import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildP05Questions,
  buildPublicP05State,
  createP05EvaluationTasks,
  deriveP05Judgment,
  expectedP05NoulLabels,
  validateP05EvaluationTasks,
} from "./jevPipelineP05Evaluation.js";
import {
  validateJevResponse,
  type JevQuestionSet,
} from "./jevPipelineEvaluation.js";

function oracleResponse(
  questions: JevQuestionSet,
  labels: Record<string, 0 | 1>,
  choice: string,
): unknown {
  return {
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        if (question.type === "noul") {
          return [id, { noul: labels[id] === 1 ? 0.95 : 0.05, type: "noul" }];
        }
        const options = Object.keys(question.criteria);
        return [
          id,
          {
            choice,
            confidence: 0.9,
            probabilities: Object.fromEntries(
              options.map((option) => [
                option,
                option === choice ? 0.92 : 0.08 / (options.length - 1),
              ]),
            ),
            type: "choice",
          },
        ];
      }),
    ),
    model: "self-test-jev-p05",
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

test("P05 covers every candidate in the frozen ten-proposal corpus", () => {
  assert.doesNotThrow(() => validateP05EvaluationTasks());
  const tasks = createP05EvaluationTasks(1);
  assert.equal(tasks.length, 18);
  assert.deepEqual(
    Object.fromEntries(
      ["CLEAR", "AMBIGUOUS", "BLOCKED"].map((kind) => [
        kind,
        tasks.filter((task) => task.corpusClass === kind).length,
      ]),
    ),
    { AMBIGUOUS: 6, BLOCKED: 2, CLEAR: 10 },
  );
});

test("every provenance record has one deterministic path description", () => {
  for (const task of createP05EvaluationTasks(1)) {
    assert.deepEqual(
      task.provenanceRecords.map((record) => record.astPath),
      task.pathDescriptions.map((description) => description.astPath),
      task.taskId,
    );
    assert.equal(
      new Set(task.provenanceRecords.map((record) => record.astPath)).size,
      task.provenanceRecords.length,
      task.taskId,
    );
  }
});

test("semantic mutations retain source claims that disagree with changed paths", () => {
  const mutations = createP05EvaluationTasks(1).filter(
    (task) => task.candidate.kind === "semantic_mutation",
  );
  assert.equal(mutations.length, 5);
  for (const task of mutations) {
    assert.ok(
      task.expectedLabels.recordBehaviorAgreement.includes(0),
      task.taskId,
    );
    assert.equal(task.expectedChoice, "candidate_defect");
  }
});

test("the Jev allowlist excludes fixture labels and mutation notes", () => {
  const task = createP05EvaluationTasks(1).find(
    (candidate) => candidate.candidate.kind === "semantic_mutation",
  );
  assert.ok(task);
  const serialized = JSON.stringify(buildPublicP05State(task));
  assert.equal(serialized.includes("expectedChoice"), false);
  assert.equal(serialized.includes("expectedP01"), false);
  assert.equal(serialized.includes("mutationNote"), false);
  assert.equal(
    serialized.includes(task.candidate.mutationNote ?? "absent"),
    false,
  );
});

test("P05 batches two Nouls per record plus two collective Nouls and one Choice", () => {
  const task = createP05EvaluationTasks(1)[0]!;
  const questions = buildP05Questions(task);
  assert.equal(
    Object.keys(questions).length,
    task.provenanceRecords.length * 2 + 3,
  );
  assert.equal(questions.p05_overall?.type, "choice");
});

test("the self-test oracle validates and the policy preserves the expected route", () => {
  for (const task of createP05EvaluationTasks(1)) {
    const questions = buildP05Questions(task);
    const response = validateJevResponse(
      oracleResponse(
        questions,
        expectedP05NoulLabels(task),
        task.expectedChoice,
      ),
      questions,
    );
    assert.equal(
      deriveP05Judgment(task, response).decision,
      task.expectedChoice,
    );
  }
});

test("candidate support fails closed when one required Noul is uncertain", () => {
  const task = createP05EvaluationTasks(1).find(
    (candidate) => candidate.expectedChoice === "candidate_supported",
  );
  assert.ok(task);
  const questions = buildP05Questions(task);
  const body = oracleResponse(
    questions,
    expectedP05NoulLabels(task),
    task.expectedChoice,
  ) as { answers: Record<string, { noul?: number }> };
  body.answers.p05_all_source_conditions_covered!.noul = 0.69;
  const response = validateJevResponse(body, questions);
  const judgment = deriveP05Judgment(task, response);
  assert.equal(judgment.actionable, false);
  assert.equal(judgment.decision, "insufficient_evidence");
});
