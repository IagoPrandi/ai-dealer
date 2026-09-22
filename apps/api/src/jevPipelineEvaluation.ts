import { createHash } from "node:crypto";

import {
  describeRuleAstForPlayers,
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
  ruleAstSchema,
} from "@tyche/rule-compiler";

import {
  JEV_PIPELINE_CORPUS_V1,
  JEV_PIPELINE_CORPUS_VERSION,
  type AstCandidateFixture,
  type InterpretationFixture,
  type JevPipelineCorpusFixture,
  type SemanticDimension,
} from "./jevPipelineCorpusV1.js";

export const JEV_PIPELINE_STATE_SCHEMA_VERSION =
  "jev-pipeline-state-v1" as const;
export const JEV_PIPELINE_QUESTION_SET_VERSION =
  "jev-p01-p02-questions-v1" as const;
export const JEV_PIPELINE_DECISION_POLICY_VERSION =
  "jev-j1-advisory-bands-0.30-0.70-v1" as const;

export type ExperimentProcess = "P01" | "P02";
export type SemanticDecision =
  | "contradicted"
  | "insufficient_evidence"
  | "supported"
  | "unavailable";

export interface NoulQuestion {
  criteria: { false: string; true: string };
  instructions: string;
  type: "noul";
}

export interface ChoiceQuestion {
  criteria: Record<string, string>;
  instructions: string;
  type: "choice";
}

export interface ScoreQuestion {
  criteria: string[];
  instructions: string;
  type: "score";
}

export type JevQuestion = ChoiceQuestion | NoulQuestion | ScoreQuestion;
export type JevQuestionSet = Record<string, JevQuestion>;

export interface JevChoiceAnswer {
  choice: string;
  confidence: number;
  probabilities: Record<string, number>;
  type: "choice";
}

export interface JevNoulAnswer {
  noul: number;
  type: "noul";
}

export interface JevScoreAnswer {
  confidence: number;
  legend: Record<string, string>;
  probabilities: Record<string, number>;
  score: number;
  type: "score";
}

export type JevAnswer = JevChoiceAnswer | JevNoulAnswer | JevScoreAnswer;

export interface ValidatedJevResponse {
  answers: Record<string, JevAnswer>;
  model: string;
  usage: {
    costUsd: number | null;
    inputTokens: number;
    outputTokens: number;
  };
}

export interface JevEvaluationTask {
  candidate: AstCandidateFixture;
  expectedP01: Exclude<SemanticDecision, "unavailable">;
  fixture: JevPipelineCorpusFixture;
  interpretation: InterpretationFixture;
  kind: "p01_control" | "pipeline";
  processes: ExperimentProcess[];
  repeatId: number;
  taskId: string;
}

export interface PublicJevEvaluationState {
  approval: {
    status: "not_approved" | "player_approved_fixture";
  };
  artifact: {
    ast: unknown;
    behaviorDescription: string;
    behaviorFixtureSummary: unknown[];
    consumedSourceSpans: string[];
  };
  gamePolicy: {
    allowedInputs: string[];
    domain: string;
    rankingTiePolicy: string;
  };
  interpretation: {
    addedClauses: string[];
    normalizedText: string;
    officialText: string;
  };
  source: {
    language: "en" | "pt";
    originalText: string;
  };
}

export interface ProcessJudgment {
  atomicNouls: Record<string, number>;
  decision: SemanticDecision;
  directionalNouls: Record<string, number>;
  overallChoice: JevChoiceAnswer | null;
}

const DIMENSION_INSTRUCTIONS: Record<SemanticDimension, string> = {
  boolean_grouping: "AND, OR, exclusivity, and precedence",
  comparator: "comparators and inclusive or exclusive boundaries",
  eligibility: "eligibility and filtering conditions",
  named_literals: "named literal values and ranges",
  order: "position, order, and sorting relationships",
  polarity: "polarity, negation, and direction",
  predicate: "the winning predicate or scoring mechanism",
  quantity: "quantities, counts, and quantifiers",
  ranking: "ranking score and ranking direction",
  referenced_inputs: "the referenced ticket, draw, or external inputs",
  scope: "the scope over values, positions, or competing tickets",
  threshold: "numeric thresholds",
  ties: "tie behavior",
};

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function sha256Canonical(value: unknown): string {
  return createHash("sha256")
    .update(canonicalJson(value), "utf8")
    .digest("hex");
}

function isReferenceApproval(task: JevEvaluationTask): boolean {
  return (
    task.fixture.class === "CLEAR" && task.interpretation.kind === "reference"
  );
}

function summarizeCandidateBehavior(task: JevEvaluationTask): unknown[] {
  const ast = ruleAstSchema.parse(task.candidate.ast);
  const rankingDirection =
    ast.schemaVersion !== 1 && "direction" in ast.result
      ? ast.result.direction
      : null;
  if (rankingDirection === null) {
    return task.fixture.behaviorFixtures.flatMap((behavior) => {
      if (!behavior.guess) return [];
      return [
        {
          fixtureId: behavior.id,
          runtimeResult: evaluatePredicate(ast, {
            draw: [...behavior.draw],
            guess: [...behavior.guess],
          }).result,
        },
      ];
    });
  }

  return task.fixture.behaviorFixtures.flatMap((behavior) => {
    if (!behavior.entries) return [];
    const entries = Object.entries(behavior.entries).map(([player, guess]) => {
      const result = evaluateRankingEntry(ast, {
        draw: [...behavior.draw],
        guess: [...guess],
      });
      return { eligible: result.eligible, player, score: result.score };
    });
    return [
      {
        entries,
        fixtureId: behavior.id,
        runtimeWinners: [
          ...resolveRankingWinners(entries, rankingDirection),
        ].sort(),
      },
    ];
  });
}

/**
 * Builds the exact allowlisted state sent to Jev. Reference labels, mutation
 * notes, expected decisions, and fixture oracle expectations are deliberately
 * absent from this return type.
 */
export function buildPublicJevEvaluationState(
  task: JevEvaluationTask,
): PublicJevEvaluationState {
  return {
    approval: {
      status: isReferenceApproval(task)
        ? "player_approved_fixture"
        : "not_approved",
    },
    artifact: {
      ast: task.candidate.ast,
      behaviorDescription: describeRuleAstForPlayers(task.candidate.ast),
      behaviorFixtureSummary: summarizeCandidateBehavior(task),
      consumedSourceSpans: [...task.fixture.consumedSourceSpans],
    },
    gamePolicy: {
      allowedInputs: ["guess", "draw"],
      domain:
        "A ticket and draw each contain six distinct integers from 1 through 100.",
      rankingTiePolicy:
        "Eligible tickets tied at the best score share the prize.",
    },
    interpretation: {
      addedClauses: [],
      normalizedText: task.interpretation.text,
      officialText: task.interpretation.text,
    },
    source: {
      language: task.fixture.language,
      originalText: task.fixture.source,
    },
  };
}

/** Keeps each process on the smallest state that can answer its own questions. */
export function buildProcessJevEvaluationState(
  task: JevEvaluationTask,
  process: ExperimentProcess,
): unknown {
  const state = buildPublicJevEvaluationState(task);
  if (process === "P01") return state;
  return {
    gamePolicy: state.gamePolicy,
    interpretation: { officialText: state.interpretation.officialText },
    source: state.source,
  };
}

function noul(instructions: string): NoulQuestion {
  return {
    criteria: {
      false:
        "The condition is contradicted, omitted, added without support, or cannot be established from the supplied evidence.",
      true: "The condition is fully supported by the supplied evidence.",
    },
    instructions,
    type: "noul",
  };
}

export function buildP01Questions(
  fixture: JevPipelineCorpusFixture,
): JevQuestionSet {
  const questions: JevQuestionSet = {
    p01_all_artifact_conditions_supported: noul(
      "Is every material condition in `artifact.behaviorDescription` and `artifact.ast` supported by `interpretation.officialText`, without adding an unauthorized condition? Treat `approval.status` as required evidence; an unapproved interpretation cannot authorize freeze readiness.",
    ),
    p01_all_promises_represented: noul(
      "Does `artifact.behaviorDescription` represent every material promise in `interpretation.officialText`, with the same meaning and no omission? Treat `approval.status` as required evidence; an unapproved interpretation cannot authorize freeze readiness.",
    ),
    p01_overall: {
      criteria: {
        contradicted:
          "The supplied artifact materially contradicts or fails to implement the approved interpretation.",
        insufficient_evidence:
          "Approval is absent, evidence is incomplete, or the relationship cannot be established honestly.",
        supported:
          "The interpretation is approved and the artifact implements every material promise without unsupported additions.",
      },
      instructions:
        "Which freeze-readiness evidence label best describes whether `artifact` fulfils `interpretation.officialText` under `gamePolicy`? This is advisory evidence only; it does not replace deterministic validation, review, player approval, or hashing.",
      type: "choice",
    },
  };
  for (const dimension of fixture.p01Dimensions) {
    questions[`p01_dimension_${dimension}`] = noul(
      `Does the artifact preserve ${DIMENSION_INSTRUCTIONS[dimension]} exactly as stated by \`interpretation.officialText\`? Judge only this semantic dimension using \`artifact.ast\`, \`artifact.behaviorDescription\`, and \`gamePolicy\`.`,
    );
  }
  return questions;
}

export function buildP02Questions(
  fixture: JevPipelineCorpusFixture,
): JevQuestionSet {
  const questions: JevQuestionSet = {
    p02_interpretation_supported_by_source: noul(
      "Is every material claim in `interpretation.officialText` entailed by `source.originalText`, without an introduced assumption or changed meaning?",
    ),
    p02_source_preserved_by_interpretation: noul(
      "Does `interpretation.officialText` preserve every material condition in `source.originalText`, without omission?",
    ),
  };
  for (const dimension of fixture.p02Dimensions) {
    questions[`p02_dimension_${dimension}`] = noul(
      `Does \`interpretation.officialText\` preserve ${DIMENSION_INSTRUCTIONS[dimension]} from \`source.originalText\` without adding, dropping, or changing meaning?`,
    );
  }
  return questions;
}

export function buildQuestionsForTask(task: JevEvaluationTask): JevQuestionSet {
  return Object.assign(
    {},
    task.processes.includes("P01") ? buildP01Questions(task.fixture) : {},
    task.processes.includes("P02") ? buildP02Questions(task.fixture) : {},
  );
}

export function buildQuestionsForProcess(
  task: JevEvaluationTask,
  process: ExperimentProcess,
): JevQuestionSet {
  return process === "P01"
    ? buildP01Questions(task.fixture)
    : buildP02Questions(task.fixture);
}

function expectedP01For(
  fixture: JevPipelineCorpusFixture,
  candidate: AstCandidateFixture,
  interpretation: InterpretationFixture,
): Exclude<SemanticDecision, "unavailable"> {
  if (fixture.class !== "CLEAR" || interpretation.kind !== "reference") {
    return "insufficient_evidence";
  }
  return candidate.expectedP01;
}

export function createJevEvaluationTasks(
  repeatId: number,
): JevEvaluationTask[] {
  if (!Number.isInteger(repeatId) || repeatId < 1) {
    throw new Error("repeatId must be a positive integer");
  }
  return JEV_PIPELINE_CORPUS_V1.flatMap((fixture) => {
    const primaryCandidate = fixture.astCandidates[0];
    if (!primaryCandidate) throw new Error(`${fixture.id} has no candidate`);
    const pipeline = fixture.interpretationVariants.map((interpretation) => ({
      candidate: primaryCandidate,
      expectedP01: expectedP01For(fixture, primaryCandidate, interpretation),
      fixture,
      interpretation,
      kind: "pipeline" as const,
      processes: ["P01", "P02"] as ExperimentProcess[],
      repeatId,
      taskId: `${fixture.id}/${interpretation.id}/${primaryCandidate.id}`,
    }));
    const referenceInterpretation = fixture.interpretationVariants.find(
      (interpretation) => interpretation.kind === "reference",
    );
    if (!referenceInterpretation) {
      throw new Error(`${fixture.id} has no reference interpretation`);
    }
    const controls = fixture.astCandidates.slice(1).map((candidate) => ({
      candidate,
      expectedP01: expectedP01For(fixture, candidate, referenceInterpretation),
      fixture,
      interpretation: referenceInterpretation,
      kind: "p01_control" as const,
      processes: ["P01"] as ExperimentProcess[],
      repeatId,
      taskId: `${fixture.id}/${referenceInterpretation.id}/${candidate.id}`,
    }));
    return [...pipeline, ...controls];
  });
}

function finiteProbability(value: unknown, label: string): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0 ||
    value > 1
  ) {
    throw new Error(`${label} must be a finite probability in [0, 1]`);
  }
  return value;
}

function numericUsage(
  usage: Record<string, unknown>,
  snake: string,
  camel: string,
): number {
  const value = usage[snake] ?? usage[camel];
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Jev usage.${snake} must be a non-negative number`);
  }
  return value;
}

export function validateJevResponse(
  body: unknown,
  questions: JevQuestionSet,
): ValidatedJevResponse {
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Jev response must be an object");
  }
  const response = body as Record<string, unknown>;
  if (
    typeof response.model !== "string" ||
    response.model.trim().length === 0
  ) {
    throw new Error("Jev response.model must be a non-empty string");
  }
  if (
    response.answers === null ||
    typeof response.answers !== "object" ||
    Array.isArray(response.answers)
  ) {
    throw new Error("Jev response.answers must be an object");
  }
  const answers = response.answers as Record<string, unknown>;
  const expectedIds = Object.keys(questions).sort();
  const actualIds = Object.keys(answers).sort();
  if (JSON.stringify(expectedIds) !== JSON.stringify(actualIds)) {
    throw new Error(
      `Jev answer IDs differ: expected ${expectedIds.join(",")}; received ${actualIds.join(",")}`,
    );
  }

  const validated: Record<string, JevAnswer> = {};
  for (const id of expectedIds) {
    const question = questions[id]!;
    const raw = answers[id];
    if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Jev answer ${id} must be an object`);
    }
    const answer = raw as Record<string, unknown>;
    if (answer.type !== question.type) {
      throw new Error(`Jev answer ${id} has the wrong primitive type`);
    }
    if (question.type === "noul") {
      validated[id] = {
        noul: finiteProbability(answer.noul, `${id}.noul`),
        type: "noul",
      };
      continue;
    }
    if (question.type === "score") {
      if (question.criteria.length < 2 || question.criteria.length > 10) {
        throw new Error(`Jev Score question ${id} must have 2 to 10 levels`);
      }
      const expectedLevels = question.criteria.map((_, index) => String(index));
      if (
        answer.legend === null ||
        typeof answer.legend !== "object" ||
        Array.isArray(answer.legend)
      ) {
        throw new Error(`Jev answer ${id}.legend must be an object`);
      }
      const legend = answer.legend as Record<string, unknown>;
      if (
        JSON.stringify(Object.keys(legend).sort()) !==
          JSON.stringify([...expectedLevels].sort()) ||
        expectedLevels.some(
          (level, index) => legend[level] !== question.criteria[index],
        )
      ) {
        throw new Error(`Jev answer ${id}.legend differs from Score levels`);
      }
      if (
        answer.probabilities === null ||
        typeof answer.probabilities !== "object" ||
        Array.isArray(answer.probabilities)
      ) {
        throw new Error(`Jev answer ${id}.probabilities must be an object`);
      }
      const probabilityRecord = answer.probabilities as Record<string, unknown>;
      if (
        JSON.stringify(Object.keys(probabilityRecord).sort()) !==
        JSON.stringify([...expectedLevels].sort())
      ) {
        throw new Error(
          `Jev answer ${id} probabilities differ from Score levels`,
        );
      }
      const probabilities = Object.fromEntries(
        expectedLevels.map((level) => [
          level,
          finiteProbability(probabilityRecord[level], `${id}.${level}`),
        ]),
      );
      const total = Object.values(probabilities).reduce(
        (sum, probability) => sum + probability,
        0,
      );
      if (Math.abs(total - 1) > 0.011) {
        throw new Error(`Jev answer ${id} probabilities must sum to 1`);
      }
      if (
        typeof answer.score !== "number" ||
        !Number.isFinite(answer.score) ||
        answer.score < 0 ||
        answer.score > question.criteria.length - 1
      ) {
        throw new Error(
          `Jev answer ${id}.score must be within the declared level range`,
        );
      }
      validated[id] = {
        confidence: finiteProbability(answer.confidence, `${id}.confidence`),
        legend: Object.fromEntries(
          expectedLevels.map((level, index) => [
            level,
            question.criteria[index]!,
          ]),
        ),
        probabilities,
        score: answer.score,
        type: "score",
      };
      continue;
    }
    if (
      typeof answer.choice !== "string" ||
      !(answer.choice in question.criteria)
    ) {
      throw new Error(`Jev answer ${id} selected an undeclared Choice option`);
    }
    if (
      answer.probabilities === null ||
      typeof answer.probabilities !== "object" ||
      Array.isArray(answer.probabilities)
    ) {
      throw new Error(`Jev answer ${id}.probabilities must be an object`);
    }
    const probabilityRecord = answer.probabilities as Record<string, unknown>;
    const expectedOptions = Object.keys(question.criteria).sort();
    const actualOptions = Object.keys(probabilityRecord).sort();
    if (JSON.stringify(expectedOptions) !== JSON.stringify(actualOptions)) {
      throw new Error(
        `Jev answer ${id} probabilities differ from Choice options`,
      );
    }
    const probabilities = Object.fromEntries(
      expectedOptions.map((option) => [
        option,
        finiteProbability(probabilityRecord[option], `${id}.${option}`),
      ]),
    );
    const total = Object.values(probabilities).reduce(
      (sum, probability) => sum + probability,
      0,
    );
    // Providers commonly round each displayed probability to two decimals.
    // Accept the resulting 0.99/1.01 totals, but reject wider malformed shapes.
    if (Math.abs(total - 1) > 0.011) {
      throw new Error(`Jev answer ${id} probabilities must sum to 1`);
    }
    validated[id] = {
      choice: answer.choice,
      confidence: finiteProbability(answer.confidence, `${id}.confidence`),
      probabilities,
      type: "choice",
    };
  }

  const rawUsage = response.usage;
  if (
    rawUsage === null ||
    typeof rawUsage !== "object" ||
    Array.isArray(rawUsage)
  ) {
    throw new Error("Jev response.usage must be an object");
  }
  const usage = rawUsage as Record<string, unknown>;
  const rawCost = usage.cost ?? usage.cost_usd;
  const costUsd =
    rawCost === undefined
      ? null
      : typeof rawCost === "number" && Number.isFinite(rawCost) && rawCost >= 0
        ? rawCost
        : (() => {
            throw new Error("Jev usage cost must be a non-negative number");
          })();
  return {
    answers: validated,
    model: response.model,
    usage: {
      costUsd,
      inputTokens: numericUsage(usage, "input_tokens", "prompt_tokens"),
      outputTokens: numericUsage(usage, "output_tokens", "completion_tokens"),
    },
  };
}

function noulValue(answers: Record<string, JevAnswer>, id: string): number {
  const answer = answers[id];
  if (!answer || answer.type !== "noul") {
    throw new Error(`Expected Noul answer ${id}`);
  }
  return answer.noul;
}

export function deriveProcessJudgment(
  process: ExperimentProcess,
  fixture: JevPipelineCorpusFixture,
  response: ValidatedJevResponse,
): ProcessJudgment {
  if (process === "P01") {
    const overall = response.answers.p01_overall;
    if (!overall || overall.type !== "choice") {
      throw new Error("Expected Choice answer p01_overall");
    }
    const atomicNouls = Object.fromEntries(
      fixture.p01Dimensions.map((dimension) => [
        dimension,
        noulValue(response.answers, `p01_dimension_${dimension}`),
      ]),
    );
    return {
      atomicNouls,
      decision: overall.choice as Exclude<SemanticDecision, "unavailable">,
      directionalNouls: {
        allArtifactConditionsSupported: noulValue(
          response.answers,
          "p01_all_artifact_conditions_supported",
        ),
        allPromisesRepresented: noulValue(
          response.answers,
          "p01_all_promises_represented",
        ),
      },
      overallChoice: overall,
    };
  }

  const atomicNouls = Object.fromEntries(
    fixture.p02Dimensions.map((dimension) => [
      dimension,
      noulValue(response.answers, `p02_dimension_${dimension}`),
    ]),
  );
  const directionalNouls = {
    interpretationSupportedBySource: noulValue(
      response.answers,
      "p02_interpretation_supported_by_source",
    ),
    sourcePreservedByInterpretation: noulValue(
      response.answers,
      "p02_source_preserved_by_interpretation",
    ),
  };
  const values = [
    ...Object.values(directionalNouls),
    ...Object.values(atomicNouls),
  ];
  return {
    atomicNouls,
    decision: values.every((value) => value >= 0.7)
      ? "supported"
      : values.some((value) => value <= 0.3)
        ? "contradicted"
        : "insufficient_evidence",
    directionalNouls,
    overallChoice: null,
  };
}

export function combineSemanticDecisions(
  ...decisions: SemanticDecision[]
): SemanticDecision {
  if (decisions.includes("unavailable")) return "unavailable";
  if (decisions.includes("contradicted")) return "contradicted";
  if (decisions.every((decision) => decision === "supported")) {
    return "supported";
  }
  return "insufficient_evidence";
}

export function expectedNoulLabels(
  task: JevEvaluationTask,
  process: ExperimentProcess,
): Record<string, 0 | 1> | null {
  if (process === "P01") {
    if (task.expectedP01 === "insufficient_evidence") return null;
    const failed = new Set(task.candidate.failedDimensions ?? []);
    return {
      allArtifactConditionsSupported: task.expectedP01 === "supported" ? 1 : 0,
      allPromisesRepresented: task.expectedP01 === "supported" ? 1 : 0,
      ...Object.fromEntries(
        task.fixture.p01Dimensions.map((dimension) => [
          dimension,
          failed.has(dimension) ? 0 : 1,
        ]),
      ),
    } as Record<string, 0 | 1>;
  }
  const failed = new Set(task.interpretation.failedDimensions);
  return {
    interpretationSupportedBySource:
      task.interpretation.kind === "introduced_assumption" ? 0 : 1,
    sourcePreservedByInterpretation:
      task.interpretation.kind === "omission" ? 0 : 1,
    ...Object.fromEntries(
      task.fixture.p02Dimensions.map((dimension) => [
        dimension,
        failed.has(dimension) ? 0 : 1,
      ]),
    ),
  } as Record<string, 0 | 1>;
}

export function validateJevPipelineCorpus(): void {
  if (JEV_PIPELINE_CORPUS_VERSION !== "jev-pipeline-corpus-v1") {
    throw new Error("Unexpected corpus version");
  }
  if (JEV_PIPELINE_CORPUS_V1.length !== 10) {
    throw new Error("The JEV v1 corpus must contain exactly ten proposals");
  }
  const counts = { AMBIGUOUS: 0, BLOCKED: 0, CLEAR: 0 };
  const ids = new Set<string>();
  for (const fixture of JEV_PIPELINE_CORPUS_V1) {
    counts[fixture.class] += 1;
    if (ids.has(fixture.id))
      throw new Error(`Duplicate corpus ID ${fixture.id}`);
    ids.add(fixture.id);
    if (!fixture.source || !fixture.referenceInterpretation) {
      throw new Error(`${fixture.id} lacks required source evidence`);
    }
    if (fixture.interpretationVariants.length !== 3) {
      throw new Error(`${fixture.id} must have three interpretation variants`);
    }
    if (
      fixture.interpretationVariants.filter(
        (value) => value.kind === "reference",
      ).length !== 1 ||
      fixture.interpretationVariants.filter(
        (value) => value.kind === "introduced_assumption",
      ).length !== 1 ||
      fixture.interpretationVariants.filter(
        (value) => value.kind === "omission",
      ).length !== 1
    ) {
      throw new Error(`${fixture.id} interpretation variants are incomplete`);
    }
    if (fixture.astCandidates.length === 0) {
      throw new Error(`${fixture.id} lacks candidate fixtures`);
    }
    for (const candidate of fixture.astCandidates) {
      ruleAstSchema.parse(candidate.ast);
    }
    if (fixture.class === "CLEAR") {
      if (
        fixture.astCandidates.length < 2 ||
        fixture.behaviorFixtures.length < 2
      ) {
        throw new Error(`${fixture.id} lacks clear-rule boundary fixtures`);
      }
      const reference = fixture.astCandidates.find(
        (candidate) => candidate.kind === "reference",
      );
      const mutation = fixture.astCandidates.find(
        (candidate) => candidate.kind === "semantic_mutation",
      );
      if (!reference || !mutation) {
        throw new Error(
          `${fixture.id} needs reference and mutation candidates`,
        );
      }
      const task: JevEvaluationTask = {
        candidate: reference,
        expectedP01: "supported",
        fixture,
        interpretation: fixture.interpretationVariants.find(
          (value) => value.kind === "reference",
        )!,
        kind: "pipeline",
        processes: ["P01", "P02"],
        repeatId: 1,
        taskId: `${fixture.id}/oracle`,
      };
      const summary = summarizeCandidateBehavior(task);
      for (const behavior of fixture.behaviorFixtures) {
        const actual = summary.find(
          (value) =>
            (value as { fixtureId?: string }).fixtureId === behavior.id,
        ) as { runtimeResult?: string; runtimeWinners?: string[] } | undefined;
        if (!actual)
          throw new Error(`${fixture.id}/${behavior.id} did not run`);
        if (
          behavior.expectedWin !== undefined &&
          actual.runtimeResult !== (behavior.expectedWin ? "WIN" : "LOSE")
        ) {
          throw new Error(
            `${fixture.id}/${behavior.id} predicate oracle mismatch`,
          );
        }
        if (
          behavior.expectedWinners &&
          JSON.stringify(actual.runtimeWinners) !==
            JSON.stringify([...behavior.expectedWinners].sort())
        ) {
          throw new Error(
            `${fixture.id}/${behavior.id} ranking oracle mismatch`,
          );
        }
      }
    }
    if (fixture.class === "AMBIGUOUS" && fixture.astCandidates.length < 2) {
      throw new Error(`${fixture.id} needs two incompatible candidates`);
    }
    if (
      fixture.class === "BLOCKED" &&
      !fixture.astCandidates.some(
        (candidate) => candidate.kind === "unauthorized_approximation",
      )
    ) {
      throw new Error(`${fixture.id} needs an unauthorized approximation`);
    }
  }
  if (counts.CLEAR !== 5 || counts.AMBIGUOUS !== 3 || counts.BLOCKED !== 2) {
    throw new Error(
      `Unexpected corpus distribution: ${JSON.stringify(counts)}`,
    );
  }
}

export const JEV_PIPELINE_QUESTION_POLICY_SHA256 = sha256Canonical({
  combination:
    "unavailable dominates; contradicted dominates; supported requires all supported; otherwise insufficient_evidence",
  decisionPolicyVersion: JEV_PIPELINE_DECISION_POLICY_VERSION,
  questionSets: JEV_PIPELINE_CORPUS_V1.map((fixture) => ({
    fixtureId: fixture.id,
    p01: buildP01Questions(fixture),
    p02: buildP02Questions(fixture),
  })),
  questionSetVersion: JEV_PIPELINE_QUESTION_SET_VERSION,
  stateSchemaVersion: JEV_PIPELINE_STATE_SCHEMA_VERSION,
});
