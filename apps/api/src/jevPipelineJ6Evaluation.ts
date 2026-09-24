import {
  JEV_PIPELINE_CORPUS_V1,
  type JevCorpusClass,
} from "./jevPipelineCorpusV1.js";
import { sha256Canonical } from "./jevPipelineEvaluation.js";
import {
  buildInputSafetyQuestions,
  INPUT_SAFETY_REASON_IDS,
  type InputSafetyJudgment,
  type InputSafetyReasonId,
  type PublicInputSafetyState,
} from "./ruleSemanticChecks.js";
import {
  evaluateDeterministicRuleSafety,
  type DeterministicRuleSafetyResult,
} from "./ruleInputSafety.js";

export const JEV_J6_STATE_SCHEMA_VERSION = "jev-j6-state-schema-v1" as const;
export const JEV_J6_QUESTION_SET_VERSION = "jev-p12-question-set-v1" as const;
export const JEV_J6_DECISION_POLICY_VERSION =
  "jev-j6-experimental-safe-0.80-unsafe-0.70-confidence-0.60-v1" as const;

// The question set, state and judgment are the production input-safety gate
// (./ruleSemanticChecks.ts); J6 keeps its original names for its runner.
export const P12_REASON_IDS = INPUT_SAFETY_REASON_IDS;
export type P12ReasonId = InputSafetyReasonId;
export {
  buildInputSafetyQuestions as buildP12Questions,
  buildPublicInputSafetyState as buildPublicP12State,
  deriveInputSafetyJudgment as deriveP12Judgment,
} from "./ruleSemanticChecks.js";
export type P12Decision =
  | "insufficient_evidence"
  | "safe"
  | "unavailable"
  | "unsafe";

export interface P12EvaluationTask {
  corpusClass: JevCorpusClass;
  deterministic: DeterministicRuleSafetyResult;
  expectedDecision: Exclude<
    P12Decision,
    "insufficient_evidence" | "unavailable"
  >;
  expectedReasonLevels: Record<P12ReasonId, 0 | 1 | 2 | 3>;
  fixtureId: string;
  language: "en" | "pt";
  repeatId: number;
  source: string;
  taskId: string;
}

export type PublicP12State = PublicInputSafetyState;
export type P12Judgment = InputSafetyJudgment;

export type ExpectedP12Answer =
  | { choice: "safe" | "unsafe"; type: "choice" }
  | { level: 0 | 1 | 2 | 3; type: "score" };

function assertPositiveRepeat(repeatId: number): void {
  if (!Number.isInteger(repeatId) || repeatId < 1) {
    throw new Error("repeatId must be a positive integer");
  }
}

function expectedLevels(labels: readonly string[]): Record<P12ReasonId, 0 | 3> {
  return Object.fromEntries(
    P12_REASON_IDS.map((reason) => [reason, labels.includes(reason) ? 3 : 0]),
  ) as Record<P12ReasonId, 0 | 3>;
}

export function createP12EvaluationTasks(
  repeatId: number,
): P12EvaluationTask[] {
  assertPositiveRepeat(repeatId);
  return JEV_PIPELINE_CORPUS_V1.map((fixture) => ({
    corpusClass: fixture.class,
    deterministic: evaluateDeterministicRuleSafety(fixture.source),
    expectedDecision: fixture.class === "BLOCKED" ? "unsafe" : "safe",
    expectedReasonLevels: expectedLevels(fixture.safetyLabels),
    fixtureId: fixture.id,
    language: fixture.language,
    repeatId,
    source: fixture.source,
    taskId: `${fixture.id}/source`,
  }));
}

export function expectedP12Answers(
  task: P12EvaluationTask,
): Record<string, ExpectedP12Answer> {
  return {
    p12_overall: { choice: task.expectedDecision, type: "choice" },
    ...Object.fromEntries(
      P12_REASON_IDS.map((reason) => [
        `p12_reason_${reason}`,
        { level: task.expectedReasonLevels[reason], type: "score" as const },
      ]),
    ),
  };
}

/** Fail-closed semantic composition. An unsafe signal has precedence. */
export function combineP12Decisions(
  ...decisions: readonly P12Decision[]
): P12Decision {
  if (decisions.includes("unsafe")) return "unsafe";
  if (decisions.includes("unavailable")) return "unavailable";
  if (decisions.includes("insufficient_evidence")) {
    return "insufficient_evidence";
  }
  return "safe";
}

/** Deterministic blocks always win; semantic safety can only add a block. */
export function applyDeterministicP12Gate(
  deterministic: DeterministicRuleSafetyResult,
  semantic: P12Decision,
): P12Decision {
  return deterministic.decision === "unsafe" ? "unsafe" : semantic;
}

export function validateJ6EvaluationTasks(): void {
  const tasks = createP12EvaluationTasks(1);
  if (tasks.length !== 10)
    throw new Error("P12 must cover exactly ten proposals");
  for (const fixture of JEV_PIPELINE_CORPUS_V1) {
    const task = tasks.find((candidate) => candidate.fixtureId === fixture.id);
    if (!task || task.source !== fixture.source) {
      throw new Error(`P12 corpus drift for ${fixture.id}`);
    }
  }
  const blocked = tasks.filter(
    (task) => task.deterministic.decision === "unsafe",
  );
  if (
    blocked.length !== 2 ||
    blocked.some((task) => task.corpusClass !== "BLOCKED")
  ) {
    throw new Error(
      "Deterministic P12 gate must block only both blocked fixtures",
    );
  }
}

export const JEV_J6_QUESTION_POLICY_SHA256 = sha256Canonical({
  combination: "unsafe > unavailable > insufficient_evidence > safe",
  decisionPolicy: JEV_J6_DECISION_POLICY_VERSION,
  questions: buildInputSafetyQuestions(),
  stateSchema: JEV_J6_STATE_SCHEMA_VERSION,
});
