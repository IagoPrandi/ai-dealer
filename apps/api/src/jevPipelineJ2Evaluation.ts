import {
  describeRuleAstForPlayers,
  evaluatePredicate,
  evaluateRankingEntry,
  resolveRankingWinners,
  ruleAstSchema,
} from "@tyche/rule-compiler";

import {
  JEV_PIPELINE_CORPUS_V1,
  type AstCandidateFixture,
  type JevCorpusClass,
  type JevPipelineCorpusFixture,
  type SemanticDimension,
} from "./jevPipelineCorpusV1.js";
import {
  sha256Canonical,
  type JevChoiceAnswer,
  type JevQuestionSet,
  type JevScoreAnswer,
  type ValidatedJevResponse,
} from "./jevPipelineEvaluation.js";

export const JEV_J2_STATE_SCHEMA_VERSION = "jev-j2-state-schema-v1" as const;
export const JEV_J2_QUESTION_SET_VERSION =
  "jev-p03-p04-question-set-v1" as const;
export const JEV_J2_DECISION_POLICY_VERSION = "jev-j2-advisory-70-v1" as const;

export type P03CollectiveChoice =
  | "contradictory_set"
  | "none_adequate"
  | "partial_set"
  | "sufficient_set";
export type P03Decision = P03CollectiveChoice | "unavailable";
export type P04ControlKind =
  | "candidate_omitted"
  | "provider_disagreement"
  | "single_unauthorized_candidate";
export type P04Choice = `candidate_${number}` | "none_adequate";
export type P04Decision = P04Choice | "unavailable";

type BinaryLabel = 0 | 1;
type ScoreLevel = 0 | 1 | 2 | 3;

interface RepairFindingFixture {
  addressesObservedFailure: BinaryLabel;
  contradicts: readonly string[];
  dslCapable: boolean;
  duplicateOf: string | null;
  expectedUsefulnessLevel: ScoreLevel;
  id: string;
  materiallyChangesOutcome: BinaryLabel;
  schemaLegal: boolean;
  sourceSupported: BinaryLabel;
  text: string;
}

interface RepairScenario {
  expectedCollectiveChoice: P03CollectiveChoice;
  findings: readonly RepairFindingFixture[];
  observedFailure: string;
}

export interface P03EvaluationTask {
  candidate: AstCandidateFixture;
  controlKind: "contradiction" | "duplicate" | "primary";
  corpusClass: JevCorpusClass;
  expectedCollectiveChoice: P03CollectiveChoice;
  findings: readonly RepairFindingFixture[];
  fixture: JevPipelineCorpusFixture;
  observedFailure: string;
  repeatId: number;
  taskId: string;
}

interface P04CandidateEntry {
  candidate: AstCandidateFixture;
  provider: string;
  publicId: `candidate_${number}`;
}

export interface P04EvaluationTask {
  candidateEntries: readonly P04CandidateEntry[];
  controlKind: P04ControlKind;
  corpusClass: JevCorpusClass;
  disagreementDimensions: readonly SemanticDimension[];
  expectedChoice: P04Choice;
  fixture: JevPipelineCorpusFixture;
  repeatId: number;
  taskId: string;
}

export interface P03Judgment {
  actionable: boolean;
  decision: P03Decision;
  eligibleFindingIds: string[];
  overallChoice: JevChoiceAnswer;
  playerQuestionFindingIds: string[];
  reason: string;
}

export interface P04Judgment {
  actionable: boolean;
  decision: P04Decision;
  overallChoice: JevChoiceAnswer;
  reason: string;
}

const USEFULNESS_LEVELS = [
  "Irrelevant: it does not help correct the observed candidate failure.",
  "Possibly useful: it may help investigation but does not directly correct the observed failure.",
  "Directly useful: it addresses a concrete part of the observed failure but is not by itself required for a complete correction.",
  "Required to correct the candidate: a corrected candidate cannot preserve the supplied source without this repair.",
];

const clearScenarios: Record<string, RepairScenario> = {
  "CLR-01": {
    expectedCollectiveChoice: "sufficient_set",
    findings: [
      finding(
        "threshold",
        "Restore the inclusive winning threshold to at least three matching numbers.",
        3,
        1,
        1,
        1,
      ),
      finding(
        "rename",
        "Rename internal compiler nodes without changing executable behavior.",
        0,
        0,
        0,
        0,
      ),
      finding(
        "four",
        "Change the winning threshold to at least four matching numbers.",
        0,
        0,
        0,
        1,
      ),
    ],
    observedFailure:
      "Deterministic boundary fixtures show that the candidate accepts a ticket with two matches even though the approved source requires at least three.",
  },
  "CLR-02": {
    expectedCollectiveChoice: "sufficient_set",
    findings: [
      finding(
        "equality",
        "Restore exact equality between the ticket sum and draw sum.",
        3,
        1,
        1,
        1,
      ),
      finding(
        "ordering",
        "Sort both number lists before summing them.",
        0,
        0,
        0,
        0,
      ),
      finding(
        "less",
        "Replace the comparison with ticket sum less than or equal to draw sum.",
        0,
        0,
        0,
        1,
      ),
    ],
    observedFailure:
      "Deterministic boundary fixtures show that the candidate accepts a ticket sum greater than the draw sum, while the approved source requires exact equality.",
  },
  "CLR-03": {
    expectedCollectiveChoice: "sufficient_set",
    findings: [
      finding(
        "minimum",
        "Rank eligible tickets by the smallest range rather than the largest range.",
        3,
        1,
        1,
        1,
      ),
      finding(
        "tie",
        "Replace shared ties with an arbitrary single-winner tie break.",
        0,
        0,
        0,
        1,
      ),
      finding(
        "format",
        "Reformat the AST without changing its semantics.",
        0,
        0,
        0,
        0,
      ),
    ],
    observedFailure:
      "Deterministic ranking fixtures show that the candidate rewards the largest ticket range, while the approved source requires the smallest range among eligible tickets.",
  },
  "CLR-04": {
    expectedCollectiveChoice: "sufficient_set",
    findings: [
      finding(
        "exact",
        "Restore exactly four same-position matches rather than at least four.",
        3,
        1,
        1,
        1,
      ),
      finding(
        "unordered",
        "Count matches without regard to position.",
        0,
        0,
        0,
        1,
      ),
      finding("title", "Change the generated rule title only.", 0, 0, 0, 0),
    ],
    observedFailure:
      "Deterministic boundary fixtures show that the candidate accepts five or six same-position matches, while the approved source requires exactly four.",
  },
  "CLR-05": {
    expectedCollectiveChoice: "sufficient_set",
    findings: [
      finding(
        "inclusive",
        "Restore an inclusive maximum distance of five at every matching position.",
        3,
        1,
        1,
        1,
      ),
      finding(
        "any",
        "Compare every ticket number with any drawn number instead of the same position.",
        0,
        0,
        0,
        1,
      ),
      finding(
        "explanation",
        "Rewrite the player explanation without changing the AST.",
        0,
        0,
        0,
        0,
      ),
    ],
    observedFailure:
      "Deterministic boundary fixtures show that the candidate rejects a position whose absolute distance is exactly five, although the approved source includes that boundary.",
  },
};

const nonClearScenarios: Record<string, RepairScenario> = {
  "AMB-01": ambiguousScenario(
    "The source does not define the distance metric, the comparison population, or tie behavior, so deterministic validation cannot authorize a unique ranking candidate.",
    "Record the missing distance metric, comparison population, and tie behavior as unresolved player choices before attempting another candidate.",
    "Silently use same-position absolute distance across all tickets and share ties.",
  ),
  "AMB-02": ambiguousScenario(
    "The source omits the match threshold, distance definition, comparison target, and tie behavior, so deterministic validation cannot authorize a unique ranking candidate.",
    "Record the missing match threshold, distance definition, comparison target, and tie behavior as unresolved player choices.",
    "Silently require two matches, minimize ticket range, and share ties.",
  ),
  "AMB-03": ambiguousScenario(
    "The source omits the distance bound, required quantity, positional scope, and comparator, so deterministic validation cannot authorize a unique predicate candidate.",
    "Record the missing distance bound, required quantity, positional scope, and comparator as unresolved player choices.",
    "Silently require all six same-position distances to be at most five.",
  ),
  "BLK-01": blockedScenario(
    "The source is blocked by the deterministic safety screen for instruction override and a code-like payload; semantic repair must not compile it.",
    "Discard the attack text and invent a three-match winning rule.",
  ),
  "BLK-02": blockedScenario(
    "The source requires wallet identity, vote history, and wall-clock state that the rule DSL and settlement contract prohibit.",
    "Drop the wallet, vote, and time conditions and keep only a two-match predicate.",
  ),
};

function finding(
  id: string,
  text: string,
  usefulness: ScoreLevel,
  sourceSupported: BinaryLabel,
  addressesObservedFailure: BinaryLabel,
  materiallyChangesOutcome: BinaryLabel,
  overrides: Partial<
    Pick<
      RepairFindingFixture,
      "contradicts" | "dslCapable" | "duplicateOf" | "schemaLegal"
    >
  > = {},
): RepairFindingFixture {
  return {
    addressesObservedFailure,
    contradicts: overrides.contradicts ?? [],
    dslCapable: overrides.dslCapable ?? true,
    duplicateOf: overrides.duplicateOf ?? null,
    expectedUsefulnessLevel: usefulness,
    id,
    materiallyChangesOutcome,
    schemaLegal: overrides.schemaLegal ?? true,
    sourceSupported,
    text,
  };
}

function ambiguousScenario(
  observedFailure: string,
  gapFinding: string,
  inventedDefault: string,
): RepairScenario {
  return {
    expectedCollectiveChoice: "partial_set",
    findings: [
      finding("gaps", gapFinding, 2, 1, 1, 1),
      finding("default", inventedDefault, 2, 0, 1, 1),
      finding(
        "format",
        "Reformat the candidate without resolving any missing choice.",
        0,
        0,
        0,
        0,
      ),
    ],
    observedFailure,
  };
}

function blockedScenario(
  observedFailure: string,
  approximation: string,
): RepairScenario {
  return {
    expectedCollectiveChoice: "none_adequate",
    findings: [
      finding("approximation", approximation, 1, 0, 0, 1),
      finding(
        "retry",
        "Retry compilation with the same source and no policy change.",
        0,
        0,
        0,
        0,
      ),
      finding(
        "format",
        "Reformat the candidate without changing behavior.",
        0,
        0,
        0,
        0,
      ),
    ],
    observedFailure,
  };
}

function candidateForRepair(
  fixture: JevPipelineCorpusFixture,
): AstCandidateFixture {
  return (
    fixture.astCandidates.find((candidate) =>
      fixture.class === "CLEAR" ? candidate.kind === "semantic_mutation" : true,
    ) ??
    (() => {
      throw new Error(`${fixture.id} has no P03 candidate`);
    })()
  );
}

export function createP03EvaluationTasks(
  repeatId: number,
): P03EvaluationTask[] {
  requireRepeatId(repeatId);
  const primary = JEV_PIPELINE_CORPUS_V1.map((fixture) => {
    const scenario =
      fixture.class === "CLEAR"
        ? clearScenarios[fixture.id]
        : nonClearScenarios[fixture.id];
    if (!scenario) throw new Error(`${fixture.id} has no P03 scenario`);
    return {
      candidate: candidateForRepair(fixture),
      controlKind: "primary" as const,
      corpusClass: fixture.class,
      expectedCollectiveChoice: scenario.expectedCollectiveChoice,
      findings: scenario.findings,
      fixture,
      observedFailure: scenario.observedFailure,
      repeatId,
      taskId: `${fixture.id}/primary`,
    };
  });

  const duplicateBase = primary.find((task) => task.fixture.id === "CLR-01")!;
  const duplicate = finding(
    "threshold_duplicate",
    "Set the inclusive minimum match count back to three.",
    3,
    1,
    1,
    1,
    { duplicateOf: "threshold" },
  );
  const contradictionBase = primary.find(
    (task) => task.fixture.id === "CLR-02",
  )!;
  const contradictionFindings = [
    finding(
      "restore_equality",
      "Require the two sums to be exactly equal.",
      3,
      1,
      1,
      1,
      { contradicts: ["keep_inequality"] },
    ),
    finding(
      "keep_inequality",
      "Keep a non-equality comparison and only change its display text.",
      0,
      0,
      0,
      1,
      { contradicts: ["restore_equality"] },
    ),
  ];
  return [
    ...primary,
    {
      ...duplicateBase,
      controlKind: "duplicate",
      findings: [...duplicateBase.findings, duplicate],
      taskId: "CLR-01/duplicate-control",
    },
    {
      ...contradictionBase,
      controlKind: "contradiction",
      expectedCollectiveChoice: "contradictory_set",
      findings: contradictionFindings,
      taskId: "CLR-02/contradiction-control",
    },
  ];
}

function requireRepeatId(repeatId: number): void {
  if (!Number.isInteger(repeatId) || repeatId < 1) {
    throw new Error("repeatId must be a positive integer");
  }
}

function runtimeEvidence(
  fixture: JevPipelineCorpusFixture,
  candidate: AstCandidateFixture,
): unknown[] {
  const ast = ruleAstSchema.parse(candidate.ast);
  if (ast.schemaVersion === 1 || !("direction" in ast.result)) {
    return fixture.behaviorFixtures.flatMap((behavior) =>
      behavior.guess
        ? [
            {
              fixtureId: behavior.id,
              runtimeResult: evaluatePredicate(ast, {
                draw: [...behavior.draw],
                guess: [...behavior.guess],
              }).result,
            },
          ]
        : [],
    );
  }
  const rankingDirection = ast.result.direction;
  return fixture.behaviorFixtures.flatMap((behavior) => {
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

export function buildPublicP03State(task: P03EvaluationTask) {
  return {
    candidate: {
      ast: task.candidate.ast,
      deterministicBehaviorDescription: describeRuleAstForPlayers(
        task.candidate.ast,
      ),
      deterministicRuntimeEvidence: runtimeEvidence(
        task.fixture,
        task.candidate,
      ),
    },
    findings: task.findings.map((entry, index) => ({
      deterministicChecks: {
        dslCapable: entry.dslCapable,
        schemaLegal: entry.schemaLegal,
      },
      findingId: `finding_${index + 1}`,
      text: entry.text,
    })),
    observedValidationFailure: task.observedFailure,
    policy: {
      authorityBoundary:
        "Jev supplies advisory evidence only. Deterministic validation, independent review, player confirmation, and artifact binding remain authoritative.",
      repairRule:
        "Only legal findings supported by the original or player-approved source may be supplied to an AST repair model. Unsupported material choices require a neutral player question.",
    },
    source: {
      approvalStatus:
        task.fixture.class === "CLEAR"
          ? "approved_fixture"
          : "no_complete_approved_interpretation",
      originalText: task.fixture.source,
      referenceInterpretation:
        task.fixture.class === "CLEAR"
          ? task.fixture.referenceInterpretation
          : null,
    },
  };
}

function noul(instructions: string) {
  return {
    criteria: {
      false:
        "The supplied evidence contradicts the condition or is insufficient to establish it.",
      true: "The supplied evidence fully supports the condition.",
    },
    instructions,
    type: "noul" as const,
  };
}

export function buildP03Questions(task: P03EvaluationTask): JevQuestionSet {
  const perFinding = Object.fromEntries(
    task.findings.flatMap((_finding, index) => {
      const path = `findings[${index}]`;
      const prefix = `p03_finding_${index}`;
      return [
        [
          `${prefix}_usefulness`,
          {
            criteria: [...USEFULNESS_LEVELS],
            instructions: `How useful is \`${path}.text\` for correcting the concrete \`observedValidationFailure\` without changing player intent? Judge one ordered usefulness dimension.`,
            type: "score" as const,
          },
        ],
        [
          `${prefix}_source_supported`,
          noul(
            `Is \`${path}.text\` fully supported by \`source.originalText\` and any approved \`source.referenceInterpretation\`, without inventing a material player choice?`,
          ),
        ],
        [
          `${prefix}_addresses_failure`,
          noul(
            `Does \`${path}.text\` directly address the supplied \`observedValidationFailure\`, rather than an unrelated or cosmetic issue?`,
          ),
        ],
        [
          `${prefix}_material`,
          noul(
            `Could applying \`${path}.text\` materially change winners, ties, eligibility, ranking, or the rule outcome?`,
          ),
        ],
      ];
    }),
  );
  return {
    ...perFinding,
    p03_collective: {
      criteria: {
        contradictory_set:
          "Two or more proposed findings prescribe mutually incompatible repairs, so the set cannot be applied coherently.",
        none_adequate:
          "No proposed finding is both source-supported and capable of helping produce a legal corrected candidate.",
        partial_set:
          "At least one finding identifies a real source-supported gap, but the set cannot yield a complete corrected candidate without unresolved player choices or additional evidence.",
        sufficient_set:
          "The set contains every source-supported repair needed to correct the observed candidate failure, without contradiction or invented player intent.",
      },
      instructions:
        "Which collective description best fits `findings` against `source`, `candidate`, and `observedValidationFailure`? Deterministic legality checks remain authoritative; do not approve an edit that invents player intent.",
      type: "choice",
    },
  };
}

function scoreAnswer(
  response: ValidatedJevResponse,
  id: string,
): JevScoreAnswer {
  const answer = response.answers[id];
  if (!answer || answer.type !== "score") {
    throw new Error(`Expected Score answer ${id}`);
  }
  return answer;
}

function noulValue(response: ValidatedJevResponse, id: string): number {
  const answer = response.answers[id];
  if (!answer || answer.type !== "noul") {
    throw new Error(`Expected Noul answer ${id}`);
  }
  return answer.noul;
}

function publicFindingId(index: number): string {
  return `finding_${index + 1}`;
}

function hasDeterministicConflict(
  task: P03EvaluationTask,
  index: number,
): boolean {
  const findingEntry = task.findings[index]!;
  return task.findings.some(
    (other) =>
      findingEntry.contradicts.includes(other.id) ||
      other.contradicts.includes(findingEntry.id),
  );
}

export function deriveP03Judgment(
  task: P03EvaluationTask,
  response: ValidatedJevResponse,
): P03Judgment {
  const overall = response.answers.p03_collective;
  if (!overall || overall.type !== "choice") {
    throw new Error("P03 response has no validated collective Choice");
  }
  const rawChoice = overall.choice as P03CollectiveChoice;
  const choiceActionable =
    overall.confidence >= 0.7 && (overall.probabilities[rawChoice] ?? 0) >= 0.7;
  const eligibleFindingIds = task.findings.flatMap((entry, index) => {
    const prefix = `p03_finding_${index}`;
    const usefulness = scoreAnswer(response, `${prefix}_usefulness`);
    const usefulTail =
      (usefulness.probabilities["2"] ?? 0) +
      (usefulness.probabilities["3"] ?? 0);
    const deterministicEligible =
      entry.schemaLegal &&
      entry.dslCapable &&
      entry.duplicateOf === null &&
      !hasDeterministicConflict(task, index);
    return deterministicEligible &&
      usefulTail >= 0.7 &&
      noulValue(response, `${prefix}_source_supported`) >= 0.7 &&
      noulValue(response, `${prefix}_addresses_failure`) >= 0.7
      ? [publicFindingId(index)]
      : [];
  });
  const playerQuestionFindingIds = task.findings.flatMap((_entry, index) => {
    const prefix = `p03_finding_${index}`;
    const usefulness = scoreAnswer(response, `${prefix}_usefulness`);
    const usefulTail =
      (usefulness.probabilities["2"] ?? 0) +
      (usefulness.probabilities["3"] ?? 0);
    return usefulTail >= 0.7 &&
      noulValue(response, `${prefix}_source_supported`) <= 0.3 &&
      noulValue(response, `${prefix}_material`) >= 0.7
      ? [publicFindingId(index)]
      : [];
  });
  const canRepair =
    choiceActionable &&
    rawChoice === "sufficient_set" &&
    eligibleFindingIds.length > 0;
  return {
    actionable: choiceActionable,
    decision: choiceActionable ? rawChoice : "unavailable",
    eligibleFindingIds: canRepair ? eligibleFindingIds : [],
    overallChoice: overall,
    playerQuestionFindingIds,
    reason: !choiceActionable
      ? "The collective Choice did not clear the named experimental 70/70 band."
      : canRepair
        ? "The sufficient set cleared the advisory policy and deterministic finding filters."
        : "The set cannot trigger automatic repair; unresolved or unsupported material choices remain outside repair authority.",
  };
}

export function expectedP03Labels(task: P03EvaluationTask) {
  return Object.fromEntries(
    task.findings.map((entry, index) => [
      publicFindingId(index),
      {
        addressesObservedFailure: entry.addressesObservedFailure,
        materiallyChangesOutcome: entry.materiallyChangesOutcome,
        sourceSupported: entry.sourceSupported,
        usefulnessLevel: entry.expectedUsefulnessLevel,
      },
    ]),
  );
}

function rotateCandidates(
  candidates: readonly AstCandidateFixture[],
  repeatId: number,
): AstCandidateFixture[] {
  if (candidates.length < 2 || repeatId % 2 === 1) return [...candidates];
  return [...candidates].reverse();
}

function p04Task(
  fixture: JevPipelineCorpusFixture,
  candidates: readonly AstCandidateFixture[],
  repeatId: number,
  controlKind: P04ControlKind,
): P04EvaluationTask {
  const rotated = rotateCandidates(candidates, repeatId);
  const entries = rotated.map((candidate, index) => ({
    candidate,
    provider: `provider-${String.fromCharCode(97 + index)}`,
    publicId: `candidate_${index + 1}` as const,
  }));
  const reference = entries.find(
    (entry) => entry.candidate.kind === "reference",
  );
  const disagreementDimensions = [
    ...new Set(
      fixture.class === "CLEAR"
        ? candidates.flatMap((candidate) => candidate.failedDimensions ?? [])
        : fixture.p01Dimensions,
    ),
  ];
  return {
    candidateEntries: entries,
    controlKind,
    corpusClass: fixture.class,
    disagreementDimensions,
    expectedChoice:
      fixture.class === "CLEAR" && reference
        ? reference.publicId
        : "none_adequate",
    fixture,
    repeatId,
    taskId: `${fixture.id}/${controlKind}`,
  };
}

export function createP04EvaluationTasks(
  repeatId: number,
): P04EvaluationTask[] {
  requireRepeatId(repeatId);
  return JEV_PIPELINE_CORPUS_V1.flatMap((fixture) => {
    if (fixture.class === "CLEAR") {
      const reference = fixture.astCandidates.find(
        (candidate) => candidate.kind === "reference",
      );
      const wrong = fixture.astCandidates.filter(
        (candidate) => candidate.kind !== "reference",
      );
      if (!reference || wrong.length === 0) {
        throw new Error(`${fixture.id} lacks P04 clear controls`);
      }
      return [
        p04Task(
          fixture,
          [reference, ...wrong],
          repeatId,
          "provider_disagreement",
        ),
        p04Task(fixture, wrong, repeatId, "candidate_omitted"),
      ];
    }
    return [
      p04Task(
        fixture,
        fixture.astCandidates,
        repeatId,
        fixture.astCandidates.length > 1
          ? "provider_disagreement"
          : "single_unauthorized_candidate",
      ),
    ];
  });
}

export function buildPublicP04State(task: P04EvaluationTask) {
  return {
    candidates: task.candidateEntries.map((entry) => ({
      ast: entry.candidate.ast,
      candidateId: entry.publicId,
      deterministicEvidence: {
        behaviorDescription: describeRuleAstForPlayers(entry.candidate.ast),
        runtimeEvidence: runtimeEvidence(task.fixture, entry.candidate),
        schemaValid: true,
      },
    })),
    gamePolicy: {
      allowedInputs: ["guess", "draw"],
      authorityBoundary:
        "Candidate selection is advisory. Deterministic behavioral equivalence, validators, independent review, player confirmation, and artifact binding remain authoritative.",
      domain:
        "A ticket and draw each contain six distinct integers from 1 through 100.",
    },
    interpretation: {
      approvalStatus:
        task.fixture.class === "CLEAR"
          ? "player_approved_fixture"
          : "no_complete_player_approved_interpretation",
      text:
        task.fixture.class === "CLEAR"
          ? task.fixture.referenceInterpretation
          : null,
    },
    source: {
      language: task.fixture.language,
      originalText: task.fixture.source,
    },
  };
}

export function buildP04Questions(task: P04EvaluationTask): JevQuestionSet {
  const perCandidate = Object.fromEntries(
    task.candidateEntries.flatMap((entry, index) => {
      const candidatePath = `candidates[${index}]`;
      const prefix = `p04_${entry.publicId}`;
      return [
        [
          `${prefix}_source_fidelity`,
          noul(
            `Does \`${candidatePath}\` preserve every material condition authorized by \`source.originalText\` without inventing a missing player choice? Require an honest negative when the source is unsafe, prohibited, or materially ambiguous.`,
          ),
        ],
        [
          `${prefix}_interpretation_coverage`,
          noul(
            `Does \`${candidatePath}\` completely implement the player-approved \`interpretation.text\`? If \`interpretation.approvalStatus\` says no complete interpretation is approved, the condition is not established.`,
          ),
        ],
        ...task.disagreementDimensions.map((dimension) => [
          `${prefix}_dimension_${dimension}`,
          noul(
            `On the disputed ${dimension.replaceAll("_", " ")} dimension, is \`${candidatePath}\` fully supported by the supplied source and player-approved interpretation, without an invented material choice?`,
          ),
        ]),
      ];
    }),
  );
  const candidateCriteria = Object.fromEntries(
    task.candidateEntries.map((entry, index) => [
      entry.publicId,
      `Select only if \`candidates[${index}]\` has the strongest complete evidence and fully preserves both the source and a player-approved interpretation on every disputed dimension.`,
    ]),
  );
  return {
    ...perCandidate,
    p04_selection: {
      criteria: {
        ...candidateCriteria,
        none_adequate:
          "No supplied candidate has complete source fidelity and approved-interpretation coverage; use this when the correct candidate may be omitted, the source is ambiguous or prohibited, or all candidates contain a material defect.",
      },
      instructions:
        "Which supplied candidate, if any, has the strongest complete evidence? Choose `none_adequate` instead of the best wrong candidate. Candidate order carries no meaning and provider identity is intentionally absent.",
      type: "choice",
    },
  };
}

export function deriveP04Judgment(
  task: P04EvaluationTask,
  response: ValidatedJevResponse,
): P04Judgment {
  const overall = response.answers.p04_selection;
  if (!overall || overall.type !== "choice") {
    throw new Error("P04 response has no validated selection Choice");
  }
  const choice = overall.choice as P04Choice;
  const choiceActionable =
    overall.confidence >= 0.7 && (overall.probabilities[choice] ?? 0) >= 0.7;
  if (!choiceActionable) {
    return {
      actionable: false,
      decision: "unavailable",
      overallChoice: overall,
      reason:
        "The selection Choice did not clear the named experimental 70/70 band.",
    };
  }
  if (choice === "none_adequate") {
    return {
      actionable: true,
      decision: choice,
      overallChoice: overall,
      reason: "Jev explicitly abstained from the bounded candidate set.",
    };
  }
  const selected = task.candidateEntries.find(
    (entry) => entry.publicId === choice,
  );
  if (!selected) throw new Error(`P04 selected unknown candidate ${choice}`);
  const prefix = `p04_${selected.publicId}`;
  const requiredNouls = [
    `${prefix}_source_fidelity`,
    `${prefix}_interpretation_coverage`,
    ...task.disagreementDimensions.map(
      (dimension) => `${prefix}_dimension_${dimension}`,
    ),
  ];
  const evidencePasses = requiredNouls.every(
    (id) => noulValue(response, id) >= 0.7,
  );
  return {
    actionable: evidencePasses,
    decision: evidencePasses ? choice : "unavailable",
    overallChoice: overall,
    reason: evidencePasses
      ? "The selected candidate and all required evidence cleared the advisory policy."
      : "The selected candidate lacked a required source, interpretation, or disputed-clause signal and failed closed.",
  };
}

export function expectedP04NoulLabels(
  task: P04EvaluationTask,
): Record<string, BinaryLabel> {
  const labels: Record<string, BinaryLabel> = {};
  for (const entry of task.candidateEntries) {
    const supported =
      task.fixture.class === "CLEAR" && entry.candidate.kind === "reference";
    const prefix = `p04_${entry.publicId}`;
    labels[`${prefix}_source_fidelity`] = supported ? 1 : 0;
    labels[`${prefix}_interpretation_coverage`] = supported ? 1 : 0;
    const failed = new Set(entry.candidate.failedDimensions ?? []);
    for (const dimension of task.disagreementDimensions) {
      labels[`${prefix}_dimension_${dimension}`] =
        task.fixture.class === "CLEAR" && !failed.has(dimension) ? 1 : 0;
    }
  }
  return labels;
}

export function validateJ2EvaluationTasks(): void {
  const p03 = createP03EvaluationTasks(1);
  const p04 = createP04EvaluationTasks(1);
  if (p03.length !== 12) {
    throw new Error(`P03 expected 12 tasks; received ${p03.length}`);
  }
  if (p04.length !== 15) {
    throw new Error(`P04 expected 15 tasks; received ${p04.length}`);
  }
  if (
    p04.filter((task) => task.controlKind === "candidate_omitted").length !== 5
  ) {
    throw new Error("P04 must have five correct-candidate-omitted controls");
  }
  if (
    p04.filter((task) => task.controlKind === "provider_disagreement")
      .length !== 8
  ) {
    throw new Error("P04 must have eight provider-disagreement controls");
  }
  for (const task of [...p03, ...p04]) {
    if ("candidate" in task) ruleAstSchema.parse(task.candidate.ast);
    else {
      for (const entry of task.candidateEntries) {
        ruleAstSchema.parse(entry.candidate.ast);
      }
    }
  }
  const repeatOne = createP04EvaluationTasks(1).find(
    (task) => task.taskId === "CLR-01/provider_disagreement",
  )!;
  const repeatTwo = createP04EvaluationTasks(2).find(
    (task) => task.taskId === "CLR-01/provider_disagreement",
  )!;
  if (
    repeatOne.candidateEntries[0]?.candidate.id ===
    repeatTwo.candidateEntries[0]?.candidate.id
  ) {
    throw new Error("P04 candidate order did not rotate across repeats");
  }
}

export const JEV_J2_QUESTION_POLICY_SHA256 = sha256Canonical({
  decisionPolicyVersion: JEV_J2_DECISION_POLICY_VERSION,
  p03: createP03EvaluationTasks(1).map((task) => ({
    questions: buildP03Questions(task),
    taskId: task.taskId,
  })),
  p04: createP04EvaluationTasks(1).map((task) => ({
    questions: buildP04Questions(task),
    taskId: task.taskId,
  })),
  questionSetVersion: JEV_J2_QUESTION_SET_VERSION,
  stateSchemaVersion: JEV_J2_STATE_SCHEMA_VERSION,
});
