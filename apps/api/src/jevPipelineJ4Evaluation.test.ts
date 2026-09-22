import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildP06Questions,
  buildP07Questions,
  buildPublicP06State,
  buildPublicP07State,
  createP06EvaluationTasks,
  createP07EvaluationTasks,
  deriveP06Judgment,
  deriveP07Judgment,
  expectedP06NoulLabels,
  expectedP07NoulLabels,
  P06_REWRITE_DIMENSIONS,
  P07_CRITERIA,
  validateJ4EvaluationTasks,
} from "./jevPipelineJ4Evaluation.js";
import {
  validateJevResponse,
  type JevQuestionSet,
} from "./jevPipelineEvaluation.js";

function oracleResponse(
  questions: JevQuestionSet,
  labels: Record<string, 0 | 1>,
): unknown {
  return {
    answers: Object.fromEntries(
      Object.keys(questions).map((id) => [
        id,
        { noul: labels[id] === 1 ? 0.95 : 0.05, type: "noul" },
      ]),
    ),
    model: "self-test-jev-j4",
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

test("J4 fixtures cover all ten proposals and all twenty P07 criteria", () => {
  assert.doesNotThrow(() => validateJ4EvaluationTasks());
  assert.equal(createP06EvaluationTasks(1).length, 30);
  assert.equal(createP07EvaluationTasks(1).length, 10);
  assert.equal(P06_REWRITE_DIMENSIONS.length, 10);
  assert.equal(P07_CRITERIA.length, 20);
  assert.equal(new Set(P07_CRITERIA.map((criterion) => criterion.id)).size, 20);
  assert.throws(() => createP06EvaluationTasks(0), /positive integer/iu);
  assert.throws(() => createP07EvaluationTasks(-1), /positive integer/iu);
});

test("P06 batches all ten Nouls and applies masks only in deterministic code", () => {
  const questions = buildP06Questions();
  assert.equal(Object.keys(questions).length, 10);
  assert.ok(
    Object.values(questions).every((question) => question.type === "noul"),
  );
  for (const task of createP06EvaluationTasks(1)) {
    const publicState = JSON.stringify(buildPublicP06State(task));
    assert.equal(publicState.includes("applicableDimensions"), false);
    assert.equal(publicState.includes("expectedDecision"), false);
    assert.equal(publicState.includes("expectedLabels"), false);
  }
});

test("P06 sends negative and uncertain applicable dimensions back exactly once", () => {
  const task = createP06EvaluationTasks(1).find(
    (candidate) =>
      candidate.fixtureId === "CLR-01" &&
      candidate.variant === "defective" &&
      candidate.attempt === 1,
  );
  assert.ok(task);
  const questions = buildP06Questions();
  const body = oracleResponse(questions, expectedP06NoulLabels(task)) as {
    answers: Record<string, { noul: number; type: "noul" }>;
  };
  body.answers.p06_quantities_and_named_numbers!.noul = 0.2;
  body.answers.p06_comparator_and_boundary!.noul = 0.55;
  const response = validateJevResponse(body, questions);
  const judgment = deriveP06Judgment(task, response);
  assert.equal(judgment.decision, "revision_required");
  assert.ok(
    judgment.negativeDimensions.includes("quantities_and_named_numbers"),
  );
  assert.ok(judgment.uncertainDimensions.includes("comparator_and_boundary"));
  assert.deepEqual(
    new Set(judgment.feedbackDimensions),
    new Set([...judgment.negativeDimensions, ...judgment.uncertainDimensions]),
  );

  const secondAttempt = createP06EvaluationTasks(1).find(
    (candidate) =>
      candidate.fixtureId === task.fixtureId &&
      candidate.variant === "defective" &&
      candidate.attempt === 2,
  );
  assert.ok(secondAttempt);
  assert.equal(
    deriveP06Judgment(secondAttempt, response).decision,
    "clarify_or_review",
  );
});

test("P06 ignores an inapplicable low Noul but preserves its raw value", () => {
  const task = createP06EvaluationTasks(1).find(
    (candidate) =>
      candidate.fixtureId === "CLR-02" && candidate.variant === "faithful",
  );
  assert.ok(task);
  assert.equal(task.applicableDimensions.includes("order_and_position"), false);
  const questions = buildP06Questions();
  const body = oracleResponse(questions, expectedP06NoulLabels(task)) as {
    answers: Record<string, { noul: number; type: "noul" }>;
  };
  body.answers.p06_order_and_position!.noul = 0.01;
  const judgment = deriveP06Judgment(
    task,
    validateJevResponse(body, questions),
  );
  assert.equal(judgment.decision, "rewrite_supported");
  assert.equal(judgment.probabilities.order_and_position, 0.01);
});

test("P07 asks exactly the applicable atomic criteria and hides the mask", () => {
  for (const task of createP07EvaluationTasks(1)) {
    const questions = buildP07Questions(task);
    assert.deepEqual(
      Object.keys(questions).sort(),
      task.applicableCriteria.map((id) => `p07_${id}`).sort(),
    );
    const publicState = JSON.stringify(buildPublicP07State(task));
    assert.equal(publicState.includes("applicableCriteria"), false);
    assert.equal(publicState.includes("expectedDecision"), false);
    assert.equal(publicState.includes("expectedLabels"), false);
  }
});

test("P07 oracle preserves complete, clarify, and prohibited-dependency routes", () => {
  const decisions = new Set<string>();
  for (const task of createP07EvaluationTasks(1)) {
    const questions = buildP07Questions(task);
    const response = validateJevResponse(
      oracleResponse(questions, expectedP07NoulLabels(task)),
      questions,
    );
    const judgment = deriveP07Judgment(task, response);
    assert.equal(judgment.decision, task.expectedDecision, task.taskId);
    decisions.add(judgment.decision);
    if (judgment.decision === "clarification_required") {
      assert.ok(judgment.requiredQuestionCriteria.length > 0, task.taskId);
    }
  }
  assert.deepEqual(
    decisions,
    new Set(["blocked_dependency", "clarification_required", "complete"]),
  );
});

test("P07 does not suppress a required question near the study threshold", () => {
  const task = createP07EvaluationTasks(1).find(
    (candidate) => candidate.fixtureId === "CLR-01",
  );
  assert.ok(task);
  const questions = buildP07Questions(task);
  const body = oracleResponse(questions, expectedP07NoulLabels(task)) as {
    answers: Record<string, { noul: number; type: "noul" }>;
  };
  body.answers.p07_c06_numeric_threshold!.noul = 0.59;
  const judgment = deriveP07Judgment(
    task,
    validateJevResponse(body, questions),
  );
  assert.equal(judgment.decision, "clarification_required");
  assert.deepEqual(judgment.requiredQuestionCriteria, [
    "c06_numeric_threshold",
  ]);
});

test("malformed J4 responses fail strict shared validation", () => {
  const task = createP07EvaluationTasks(1)[0]!;
  const questions = buildP07Questions(task);
  const labels = expectedP07NoulLabels(task);
  const body = oracleResponse(questions, labels) as {
    answers: Record<string, unknown>;
  };
  delete body.answers[Object.keys(questions)[0]!];
  assert.throws(
    () => validateJevResponse(body, questions),
    /answer IDs differ/iu,
  );
});
