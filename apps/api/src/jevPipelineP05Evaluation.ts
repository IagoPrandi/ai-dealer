import {
  describeRuleAstPaths,
  ruleAstSchema,
  type AstPathDescription,
  type AstProvenanceRecord,
} from "@tyche/rule-compiler";

import {
  JEV_PIPELINE_CORPUS_V1,
  type AstCandidateFixture,
  type JevCorpusClass,
  type JevPipelineCorpusFixture,
} from "./jevPipelineCorpusV1.js";
import {
  sha256Canonical,
  type JevChoiceAnswer,
  type JevQuestionSet,
  type ValidatedJevResponse,
} from "./jevPipelineEvaluation.js";

export const JEV_P05_STATE_SCHEMA_VERSION = "jev-p05-state-schema-v1" as const;
export const JEV_P05_QUESTION_SET_VERSION = "jev-p05-question-set-v1" as const;
export const JEV_P05_DECISION_POLICY_VERSION =
  "jev-p05-advisory-70-v1" as const;

export type P05Choice =
  | "candidate_defect"
  | "candidate_supported"
  | "grammar_gap"
  | "insufficient_evidence"
  | "source_ambiguous";

export interface P05ExpectedLabels {
  assembledAstBehavesAsClaimed: 0 | 1;
  completeSourceCoverage: 0 | 1;
  recordBehaviorAgreement: readonly (0 | 1)[];
  recordReasonSupport: readonly (0 | 1)[];
}

export interface P05EvaluationTask {
  candidate: AstCandidateFixture;
  corpusClass: JevCorpusClass;
  expectedChoice: P05Choice;
  expectedLabels: P05ExpectedLabels;
  fixtureId: string;
  language: "en" | "pt";
  pathDescriptions: readonly AstPathDescription[];
  provenanceRecords: readonly AstProvenanceRecord[];
  repeatId: number;
  source: string;
  taskId: string;
}

export interface PublicP05State {
  artifact: {
    ast: AstCandidateFixture["ast"];
    deterministicPathDescriptions: readonly AstPathDescription[];
  };
  gamePolicy: {
    allowedInputs: readonly ["guess", "draw"];
    authorityBoundary: string;
    domain: string;
  };
  provenanceRecords: readonly AstProvenanceRecord[];
  source: { language: "en" | "pt"; originalText: string };
}

export interface P05Judgment {
  actionable: boolean;
  decision: P05Choice;
  overallChoice: JevChoiceAnswer;
  reason: string;
}

function referenceCandidate(
  fixture: JevPipelineCorpusFixture,
): AstCandidateFixture | null {
  return (
    fixture.astCandidates.find((candidate) => candidate.kind === "reference") ??
    null
  );
}

function expectedChoiceFor(
  fixture: JevPipelineCorpusFixture,
  candidate: AstCandidateFixture,
): P05Choice {
  if (fixture.class === "AMBIGUOUS") return "source_ambiguous";
  if (fixture.class === "BLOCKED") return "insufficient_evidence";
  return candidate.kind === "reference"
    ? "candidate_supported"
    : "candidate_defect";
}

function buildProvenance(
  fixture: JevPipelineCorpusFixture,
  candidate: AstCandidateFixture,
): {
  labels: P05ExpectedLabels;
  pathDescriptions: readonly AstPathDescription[];
  records: readonly AstProvenanceRecord[];
} {
  const ast = ruleAstSchema.parse(candidate.ast);
  const pathDescriptions = describeRuleAstPaths(ast);
  const reference = referenceCandidate(fixture);
  const referenceDescriptions = new Map(
    reference
      ? describeRuleAstPaths(ruleAstSchema.parse(reference.ast)).map(
          (entry) => [entry.astPath, entry.behaviorDescription],
        )
      : [],
  );
  const shouldClaimReference =
    fixture.class === "CLEAR" && candidate.kind === "semantic_mutation";
  const records = pathDescriptions.map((description) => ({
    astPath: description.astPath,
    claimedBehavior:
      (shouldClaimReference
        ? referenceDescriptions.get(description.astPath)
        : null) ?? description.behaviorDescription,
    selectionReason:
      "The cited player source requires this semantic unit in the compiled rule.",
    sourceSpans: [fixture.source],
  }));
  const recordBehaviorAgreement = records.map((record, index) =>
    record.claimedBehavior === pathDescriptions[index]?.behaviorDescription
      ? 1
      : 0,
  ) as (0 | 1)[];
  const sourceIsComplete = fixture.class === "CLEAR" ? 1 : 0;
  return {
    labels: {
      assembledAstBehavesAsClaimed: recordBehaviorAgreement.every(Boolean)
        ? 1
        : 0,
      completeSourceCoverage: sourceIsComplete,
      recordBehaviorAgreement,
      recordReasonSupport: records.map(() => sourceIsComplete),
    },
    pathDescriptions,
    records,
  };
}

export function createP05EvaluationTasks(
  repeatId: number,
): P05EvaluationTask[] {
  return JEV_PIPELINE_CORPUS_V1.flatMap((fixture) =>
    fixture.astCandidates.map((candidate) => {
      const provenance = buildProvenance(fixture, candidate);
      return {
        candidate,
        corpusClass: fixture.class,
        expectedChoice: expectedChoiceFor(fixture, candidate),
        expectedLabels: provenance.labels,
        fixtureId: fixture.id,
        language: fixture.language,
        pathDescriptions: provenance.pathDescriptions,
        provenanceRecords: provenance.records,
        repeatId,
        source: fixture.source,
        taskId: `${fixture.id}/${candidate.id}`,
      };
    }),
  );
}

/** Exact state allowlist: fixture labels and mutation notes never cross it. */
export function buildPublicP05State(task: P05EvaluationTask): PublicP05State {
  return {
    artifact: {
      ast: task.candidate.ast,
      deterministicPathDescriptions: task.pathDescriptions,
    },
    gamePolicy: {
      allowedInputs: ["guess", "draw"],
      authorityBoundary:
        "Jev is advisory. Schema, source coverage, runtime bounds, behavior fixtures, independent review, player confirmation, and artifact hashing remain authoritative.",
      domain:
        "A ticket and draw each contain six distinct integers from 1 through 100.",
    },
    provenanceRecords: task.provenanceRecords,
    source: { language: task.language, originalText: task.source },
  };
}

function noul(instructions: string) {
  return {
    criteria: {
      false:
        "The supplied evidence contradicts the claim, omits material support, or is insufficient to establish it.",
      true: "The supplied evidence fully supports the claim.",
    },
    instructions,
    type: "noul" as const,
  };
}

export function buildP05Questions(task: P05EvaluationTask): JevQuestionSet {
  const recordQuestions = Object.fromEntries(
    task.provenanceRecords.flatMap((_record, index) => [
      [
        `p05_record_${index}_behavior_agrees`,
        noul(
          `Does \`provenanceRecords[${index}].claimedBehavior\` agree completely with \`artifact.deterministicPathDescriptions[${index}].behaviorDescription\` for the same exact \`astPath\`? Judge semantic behavior, not wording similarity.`,
        ),
      ],
      [
        `p05_record_${index}_reason_supported`,
        noul(
          `Is \`provenanceRecords[${index}].selectionReason\` supported by its exact \`sourceSpans\` within \`source.originalText\`, without inventing a comparator, threshold, input, order, scope, polarity, eligibility rule, ranking direction, or tie meaning?`,
        ),
      ],
    ]),
  );
  return {
    ...recordQuestions,
    p05_all_source_conditions_covered: noul(
      "Do all `provenanceRecords` together cover every material winning condition in `source.originalText`, with no material source condition left without a record?",
    ),
    p05_ast_behaves_as_records_claim: noul(
      "Does `artifact.ast`, as authoritatively described by all `artifact.deterministicPathDescriptions`, behave as the `provenanceRecords` collectively claim?",
    ),
    p05_overall: {
      criteria: {
        candidate_defect:
          "The source is sufficiently clear and representable, but at least one material provenance claim conflicts with the deterministic AST behavior or the assembled candidate changes the approved rule.",
        candidate_supported:
          "The source is sufficiently clear, every provenance claim agrees with its deterministic path description, cited reasons are source-supported, and the records cover the full source without adding behavior.",
        grammar_gap:
          "The source is clear and allowed, but a required behavior cannot be represented by the supplied DSL; do not mislabel prohibited external state as a grammar gap.",
        insufficient_evidence:
          "The supplied evidence cannot safely establish support, defect, source ambiguity, or a genuine grammar gap; this includes unsafe/prohibited source that belongs to an earlier gate.",
        source_ambiguous:
          "The player source omits a material choice, so more than one materially different candidate could fit and provenance cannot establish authorization.",
      },
      instructions:
        "Which advisory P05 route is supported by `source`, `provenanceRecords`, and the deterministic descriptions of `artifact.ast`? Select exactly one route. Do not treat schema-valid structure as semantic fidelity and do not authorize progression.",
      type: "choice",
    },
  };
}

export function deriveP05Judgment(
  task: P05EvaluationTask,
  response: ValidatedJevResponse,
): P05Judgment {
  const overall = response.answers.p05_overall;
  if (!overall || overall.type !== "choice") {
    throw new Error("P05 response has no validated overall Choice");
  }
  const choice = overall.choice as P05Choice;
  const selectedProbability = overall.probabilities[choice] ?? 0;
  const choiceActionable =
    overall.confidence >= 0.7 && selectedProbability >= 0.7;
  const allSupportNoulsPass = Object.entries(response.answers)
    .filter(([id]) => id !== "p05_overall")
    .every(([, answer]) => answer.type === "noul" && answer.noul >= 0.7);
  const actionable =
    choiceActionable &&
    (choice !== "candidate_supported" || allSupportNoulsPass);
  return {
    actionable,
    decision: actionable ? choice : "insufficient_evidence",
    overallChoice: overall,
    reason: !choiceActionable
      ? "Overall Choice did not clear the named experimental 70/70 band."
      : choice === "candidate_supported" && !allSupportNoulsPass
        ? "At least one required supporting Noul did not clear the experimental 70% band."
        : "The selected advisory route cleared the named experimental policy.",
  };
}

export function expectedP05NoulLabels(
  task: P05EvaluationTask,
): Record<string, 0 | 1> {
  const labels: Record<string, 0 | 1> = {
    p05_all_source_conditions_covered:
      task.expectedLabels.completeSourceCoverage,
    p05_ast_behaves_as_records_claim:
      task.expectedLabels.assembledAstBehavesAsClaimed,
  };
  task.expectedLabels.recordBehaviorAgreement.forEach((label, index) => {
    labels[`p05_record_${index}_behavior_agrees`] = label;
  });
  task.expectedLabels.recordReasonSupport.forEach((label, index) => {
    labels[`p05_record_${index}_reason_supported`] = label;
  });
  return labels;
}

export function validateP05EvaluationTasks(): void {
  const tasks = createP05EvaluationTasks(1);
  if (tasks.length !== 18) {
    throw new Error(
      `P05 expected 18 candidate tasks; received ${tasks.length}`,
    );
  }
  for (const task of tasks) {
    if (task.pathDescriptions.length !== task.provenanceRecords.length) {
      throw new Error(`${task.taskId} has incomplete provenance coverage`);
    }
    const expectedPaths = task.pathDescriptions.map((entry) => entry.astPath);
    const actualPaths = task.provenanceRecords.map((entry) => entry.astPath);
    if (JSON.stringify(expectedPaths) !== JSON.stringify(actualPaths)) {
      throw new Error(`${task.taskId} provenance paths are not deterministic`);
    }
    for (const record of task.provenanceRecords) {
      if (!record.sourceSpans.every((span) => task.source.includes(span))) {
        throw new Error(`${task.taskId} contains a non-source citation`);
      }
    }
  }
}

export const JEV_P05_QUESTION_POLICY_SHA256 = sha256Canonical({
  decisionPolicyVersion: JEV_P05_DECISION_POLICY_VERSION,
  questionSetVersion: JEV_P05_QUESTION_SET_VERSION,
  questions: createP05EvaluationTasks(1).map((task) => ({
    questions: buildP05Questions(task),
    taskId: task.taskId,
  })),
  stateSchemaVersion: JEV_P05_STATE_SCHEMA_VERSION,
});
