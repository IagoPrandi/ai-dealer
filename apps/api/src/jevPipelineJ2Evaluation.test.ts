import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildP03Questions,
  buildP04Questions,
  buildPublicP03State,
  buildPublicP04State,
  createP03EvaluationTasks,
  createP04EvaluationTasks,
  deriveP03Judgment,
  deriveP04Judgment,
  expectedP03Labels,
  expectedP04NoulLabels,
  validateJ2EvaluationTasks,
  type P03EvaluationTask,
  type P04EvaluationTask,
} from "./jevPipelineJ2Evaluation.js";
import {
  validateJevResponse,
  type JevQuestionSet,
} from "./jevPipelineEvaluation.js";

function peakedProbabilities(length: number, selected: number) {
  return Object.fromEntries(
    Array.from({ length }, (_, index) => [
      String(index),
      index === selected ? 0.94 : 0.06 / (length - 1),
    ]),
  );
}

function choiceAnswer(options: string[], selected: string) {
  return {
    choice: selected,
    confidence: 0.9,
    probabilities: Object.fromEntries(
      options.map((option) => [
        option,
        option === selected ? 0.94 : 0.06 / (options.length - 1),
      ]),
    ),
    type: "choice",
  };
}

function p03OracleBody(task: P03EvaluationTask, questions: JevQuestionSet) {
  const labels = expectedP03Labels(task);
  return {
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        if (id === "p03_collective" && question.type === "choice") {
          return [
            id,
            choiceAnswer(
              Object.keys(question.criteria),
              task.expectedCollectiveChoice,
            ),
          ];
        }
        const match = id.match(
          /^p03_finding_(\d+)_(usefulness|source_supported|addresses_failure|material)$/u,
        );
        assert.ok(match, id);
        const finding = labels[`finding_${Number(match[1]) + 1}`]!;
        if (question.type === "score") {
          return [
            id,
            {
              confidence: 0.9,
              legend: Object.fromEntries(
                question.criteria.map((level, index) => [String(index), level]),
              ),
              probabilities: peakedProbabilities(
                question.criteria.length,
                finding.usefulnessLevel,
              ),
              score: finding.usefulnessLevel,
              type: "score",
            },
          ];
        }
        assert.equal(question.type, "noul");
        const label =
          match[2] === "source_supported"
            ? finding.sourceSupported
            : match[2] === "addresses_failure"
              ? finding.addressesObservedFailure
              : finding.materiallyChangesOutcome;
        return [id, { noul: label === 1 ? 0.95 : 0.05, type: "noul" }];
      }),
    ),
    model: "self-test-jev-j2",
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

function p04OracleBody(task: P04EvaluationTask, questions: JevQuestionSet) {
  const labels = expectedP04NoulLabels(task);
  return {
    answers: Object.fromEntries(
      Object.entries(questions).map(([id, question]) => {
        if (id === "p04_selection" && question.type === "choice") {
          return [
            id,
            choiceAnswer(Object.keys(question.criteria), task.expectedChoice),
          ];
        }
        assert.equal(question.type, "noul");
        return [id, { noul: labels[id] === 1 ? 0.95 : 0.05, type: "noul" }];
      }),
    ),
    model: "self-test-jev-j2",
    usage: { input_tokens: 100, output_tokens: 20 },
  };
}

test("J2 builds all ten-proposal P03 tasks and required P04 controls", () => {
  assert.doesNotThrow(() => validateJ2EvaluationTasks());
  const p03 = createP03EvaluationTasks(1);
  const p04 = createP04EvaluationTasks(1);
  assert.equal(p03.length, 12);
  assert.equal(p03.filter((task) => task.controlKind === "primary").length, 10);
  assert.equal(p04.length, 15);
  assert.equal(
    p04.filter((task) => task.controlKind === "candidate_omitted").length,
    5,
  );
  assert.equal(
    p04.filter((task) => task.controlKind === "provider_disagreement").length,
    8,
  );
});

test("public J2 states exclude expected labels, mutation notes, and provider identity", () => {
  const p03 = createP03EvaluationTasks(1)[0]!;
  const p04 = createP04EvaluationTasks(1)[0]!;
  const p03State = JSON.stringify(buildPublicP03State(p03));
  const p04State = JSON.stringify(buildPublicP04State(p04));
  for (const serialized of [p03State, p04State]) {
    assert.equal(serialized.includes("expected"), false);
    assert.equal(serialized.includes("mutationNote"), false);
    assert.equal(serialized.includes("labelledReasons"), false);
    assert.equal(serialized.includes("provider-a"), false);
    assert.equal(serialized.includes("provider-b"), false);
  }
  assert.equal(p04State.includes('"candidateId":"reference"'), false);
});

test("P03 batches one Score and three Nouls per finding plus the collective Choice", () => {
  for (const task of createP03EvaluationTasks(1)) {
    const questions = buildP03Questions(task);
    assert.equal(Object.keys(questions).length, task.findings.length * 4 + 1);
    assert.equal(questions.p03_collective?.type, "choice");
    assert.equal(
      Object.values(questions).filter((question) => question.type === "score")
        .length,
      task.findings.length,
    );
  }
});

test("Score validation preserves the full distribution and rejects drifted legends", () => {
  const task = createP03EvaluationTasks(1)[0]!;
  const questions = buildP03Questions(task);
  const body = p03OracleBody(task, questions);
  const response = validateJevResponse(body, questions);
  const score = response.answers.p03_finding_0_usefulness;
  const scoreQuestion = questions.p03_finding_0_usefulness;
  assert.equal(score?.type, "score");
  assert.equal(scoreQuestion?.type, "score");
  if (score?.type === "score" && scoreQuestion?.type === "score") {
    assert.equal(score.legend["3"], scoreQuestion.criteria[3]);
    assert.equal(score.probabilities["3"], 0.94);
  }

  const malformed = structuredClone(body) as {
    answers: Record<string, { legend?: Record<string, string> }>;
  };
  malformed.answers.p03_finding_0_usefulness!.legend!["3"] = "drifted";
  assert.throws(
    () => validateJevResponse(malformed, questions),
    /legend differs/u,
  );
});

test("P03 oracle preserves sufficient, partial, none, and contradictory outcomes", () => {
  const decisions = new Set<string>();
  for (const task of createP03EvaluationTasks(1)) {
    const questions = buildP03Questions(task);
    const response = validateJevResponse(
      p03OracleBody(task, questions),
      questions,
    );
    const judgment = deriveP03Judgment(task, response);
    assert.equal(judgment.decision, task.expectedCollectiveChoice, task.taskId);
    decisions.add(judgment.decision);
    if (task.expectedCollectiveChoice === "sufficient_set") {
      assert.ok(judgment.eligibleFindingIds.length > 0, task.taskId);
    } else {
      assert.deepEqual(judgment.eligibleFindingIds, [], task.taskId);
    }
  }
  assert.deepEqual([...decisions].sort(), [
    "contradictory_set",
    "none_adequate",
    "partial_set",
    "sufficient_set",
  ]);
});

test("P03 duplicate findings are removed by deterministic eligibility", () => {
  const task = createP03EvaluationTasks(1).find(
    (entry) => entry.controlKind === "duplicate",
  );
  assert.ok(task);
  const questions = buildP03Questions(task);
  const response = validateJevResponse(
    p03OracleBody(task, questions),
    questions,
  );
  const judgment = deriveP03Judgment(task, response);
  assert.deepEqual(judgment.eligibleFindingIds, ["finding_1"]);
});

test("P04 rotates candidate order and always exposes an honest none_adequate option", () => {
  const first = createP04EvaluationTasks(1).find(
    (task) => task.taskId === "CLR-01/provider_disagreement",
  );
  const second = createP04EvaluationTasks(2).find(
    (task) => task.taskId === "CLR-01/provider_disagreement",
  );
  assert.ok(first && second);
  assert.notEqual(
    first.candidateEntries[0]?.candidate.id,
    second.candidateEntries[0]?.candidate.id,
  );
  for (const task of createP04EvaluationTasks(1)) {
    const selection = buildP04Questions(task).p04_selection;
    assert.equal(selection?.type, "choice");
    if (selection?.type === "choice") {
      assert.ok("none_adequate" in selection.criteria);
    }
  }
});

test("P04 oracle selects the supported candidate and abstains when it is omitted", () => {
  for (const task of createP04EvaluationTasks(1)) {
    const questions = buildP04Questions(task);
    const response = validateJevResponse(
      p04OracleBody(task, questions),
      questions,
    );
    assert.equal(
      deriveP04Judgment(task, response).decision,
      task.expectedChoice,
      task.taskId,
    );
  }
});

test("P04 rejects a confident best-wrong candidate when its evidence Nouls fail", () => {
  const task = createP04EvaluationTasks(1).find(
    (entry) => entry.controlKind === "candidate_omitted",
  );
  assert.ok(task);
  const questions = buildP04Questions(task);
  const body = p04OracleBody(task, questions) as {
    answers: Record<string, Record<string, unknown>>;
  };
  const wrongCandidate = task.candidateEntries[0]!.publicId;
  body.answers.p04_selection = choiceAnswer(
    Object.keys(
      (questions.p04_selection as { criteria: Record<string, string> })
        .criteria,
    ),
    wrongCandidate,
  );
  const response = validateJevResponse(body, questions);
  const judgment = deriveP04Judgment(task, response);
  assert.equal(judgment.actionable, false);
  assert.equal(judgment.decision, "unavailable");
});
