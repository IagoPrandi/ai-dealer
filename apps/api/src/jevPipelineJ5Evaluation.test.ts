import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildP08Questions,
  buildP09Questions,
  buildP10Questions,
  buildP11Questions,
  buildPublicP08State,
  buildPublicP10State,
  buildPublicP11State,
  createP08EvaluationTasks,
  createP09EvaluationTasks,
  createP10EvaluationTasks,
  createP11EvaluationTasks,
  deriveP08Judgment,
  deriveP09Judgment,
  deriveP10Judgment,
  deriveP11Judgment,
  expectedP08Answers,
  expectedP09Answers,
  expectedP10Answers,
  expectedP11Answers,
  P10_DIMENSIONS,
  P11_DIMENSIONS,
  validateJ5EvaluationTasks,
  type ExpectedJevAnswer,
} from "./jevPipelineJ5Evaluation.js";
import {
  validateJevResponse,
  type JevQuestionSet,
} from "./jevPipelineEvaluation.js";

function oracleResponse(
  questions: JevQuestionSet,
  labels: Readonly<Record<string, ExpectedJevAnswer>>,
): unknown {
  return {
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        const label = labels[id];
        assert.ok(label, `Missing oracle label ${id}`);
        if (question.type === "noul") {
          assert.equal(label.type, "noul");
          return [id, { noul: label.value === 1 ? 0.95 : 0.05, type: "noul" }];
        }
        assert.equal(question.type, "score");
        assert.equal(label.type, "score");
        return [
          id,
          {
            confidence: 0.9,
            legend: Object.fromEntries(
              question.criteria.map((level, index) => [String(index), level]),
            ),
            probabilities: Object.fromEntries(
              question.criteria.map((_level, index) => [
                String(index),
                index === label.level ? 0.94 : 0.02,
              ]),
            ),
            score: label.level,
            type: "score",
          },
        ];
      }),
    ),
    model: "self-test-jev-j5",
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

test("J5 fixtures cover the frozen corpus and bounded attempts", () => {
  assert.doesNotThrow(() => validateJ5EvaluationTasks());
  assert.equal(createP08EvaluationTasks(1).length, 30);
  assert.equal(createP09EvaluationTasks(1).length, 50);
  assert.equal(createP10EvaluationTasks(1).length, 10);
  assert.equal(createP11EvaluationTasks(1).length, 20);
  assert.equal(P10_DIMENSIONS.length, 6);
  assert.equal(P11_DIMENSIONS.length, 8);
  assert.throws(() => createP08EvaluationTasks(0), /positive integer/iu);
  assert.throws(() => createP11EvaluationTasks(-1), /positive integer/iu);
});

test("P08 sends the complete normalization and explicit changed clauses without labels", () => {
  for (const task of createP08EvaluationTasks(1)) {
    const state = buildPublicP08State(task);
    assert.equal(
      state.normalization.completeNormalizedRule,
      task.normalizedRule,
    );
    assert.deepEqual(
      state.changedClauses,
      task.changedClauses.map(({ id, text }) => ({ id, text })),
    );
    const serialized = JSON.stringify(state);
    assert.equal(serialized.includes("expected"), false);
    assert.equal(serialized.includes("variant"), false);
    assert.equal(
      Object.keys(buildP08Questions(task)).length,
      2 + 4 * task.changedClauses.length,
    );
  }
});

test("P08 rejects unsupported material clauses and stops after one revision", () => {
  const first = createP08EvaluationTasks(1).find(
    (task) =>
      task.fixtureId === "CLR-01" &&
      task.variant === "defective" &&
      task.attempt === 1,
  );
  assert.ok(first);
  const questions = buildP08Questions(first);
  const response = validateJevResponse(
    oracleResponse(questions, expectedP08Answers(first)),
    questions,
  );
  const firstJudgment = deriveP08Judgment(first, response);
  assert.equal(firstJudgment.decision, "revision_required");
  assert.deepEqual(firstJudgment.unsupportedMaterialClauseIds, [
    "clause-1",
    "clause-2",
  ]);
  const second = createP08EvaluationTasks(1).find(
    (task) => task.taskId === "CLR-01/defective/attempt-2",
  );
  assert.ok(second);
  assert.equal(
    deriveP08Judgment(second, response).decision,
    "clarify_or_review",
  );
});

test("P09 evaluates both fidelity directions and only actionable overlapping causes", () => {
  const introduced = createP09EvaluationTasks(1).find(
    (task) => task.taskId === "CLR-01/assume-position/attempt-1",
  );
  assert.ok(introduced);
  const questions = buildP09Questions(introduced);
  const judgment = deriveP09Judgment(
    introduced,
    validateJevResponse(
      oracleResponse(questions, expectedP09Answers(introduced)),
      questions,
    ),
  );
  assert.equal(judgment.interpretationSupported, 0.05);
  assert.equal(judgment.sourceCovered, 0.95);
  assert.equal(judgment.decision, "revision_required");
  assert.deepEqual(judgment.actionableCauseIds.sort(), ["order", "scope"]);
  assert.equal(
    judgment.actionableCauseIds.includes("number-domain-decoy"),
    false,
  );
});

test("P09 persistent mismatch routes to review instead of looping", () => {
  const task = createP09EvaluationTasks(1).find(
    (candidate) => candidate.taskId === "CLR-02/omit-exactness/attempt-2",
  );
  assert.ok(task);
  const questions = buildP09Questions(task);
  const response = validateJevResponse(
    oracleResponse(questions, expectedP09Answers(task)),
    questions,
  );
  assert.equal(deriveP09Judgment(task, response).decision, "clarify_or_review");
});

test("P10 keeps unsupported useful improvements as player choices", () => {
  const task = createP10EvaluationTasks(1).find(
    (candidate) => candidate.fixtureId === "AMB-03",
  );
  assert.ok(task);
  const questions = buildP10Questions(task);
  const judgment = deriveP10Judgment(
    task,
    validateJevResponse(
      oracleResponse(questions, expectedP10Answers(task)),
      questions,
    ),
  );
  assert.equal(judgment.decision, "player_choice_required");
  assert.deepEqual(judgment.playerChoiceOptionIds, ["define-six-within-five"]);
  assert.deepEqual(judgment.sourceSupportedOptionIds, []);
});

test("P10 leaves deterministic prohibited-pattern handling outside the semantic judge", () => {
  const task = createP10EvaluationTasks(1).find(
    (candidate) => candidate.fixtureId === "BLK-02",
  );
  assert.ok(task);
  const questions = buildP10Questions(task);
  const judgment = deriveP10Judgment(
    task,
    validateJevResponse(
      oracleResponse(questions, expectedP10Answers(task)),
      questions,
    ),
  );
  assert.equal(judgment.decision, "complete");
  assert.equal(
    JSON.stringify(buildPublicP10State(task)).includes("expectedDecision"),
    false,
  );
});

test("P11 uses an explicit no-call identity branch for every English proposal", () => {
  const identityTasks = createP11EvaluationTasks(1).filter(
    (task) => task.variant === "identity",
  );
  assert.equal(identityTasks.length, 5);
  for (const task of identityTasks) {
    assert.equal(task.translation, task.source);
    assert.equal(task.expectedDecision, "identity_no_translation");
    assert.deepEqual(buildP11Questions(task), {});
    assert.throws(() => buildPublicP11State(task), /must not call JEV/iu);
  }
});

test("P11 preserves a faithful translation and caps a defective retry", () => {
  for (const taskId of [
    "CLR-05/faithful/attempt-1",
    "CLR-05/defective/attempt-1",
    "CLR-05/defective/attempt-2",
  ]) {
    const task = createP11EvaluationTasks(1).find(
      (candidate) => candidate.taskId === taskId,
    );
    assert.ok(task);
    const questions = buildP11Questions(task);
    const response = validateJevResponse(
      oracleResponse(questions, expectedP11Answers(task)),
      questions,
    );
    const judgment = deriveP11Judgment(task, response);
    assert.equal(judgment.decision, task.expectedDecision);
    if (task.variant === "defective") {
      assert.ok(judgment.actionableCauseIds.length > 0);
    }
    const publicState = JSON.stringify(buildPublicP11State(task));
    assert.equal(publicState.includes("applicableDimensions"), false);
    assert.equal(publicState.includes("expectedLabels"), false);
  }
});

test("malformed mixed J5 responses fail strict shared validation", () => {
  const task = createP09EvaluationTasks(1).find(
    (candidate) => candidate.variant !== "reference",
  );
  assert.ok(task);
  const questions = buildP09Questions(task);
  const body = oracleResponse(questions, expectedP09Answers(task)) as {
    answers: Record<string, unknown>;
  };
  delete body.answers[Object.keys(questions)[0]!];
  assert.throws(
    () => validateJevResponse(body, questions),
    /answer IDs differ/iu,
  );
});
