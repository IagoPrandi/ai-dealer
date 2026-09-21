import { createHash } from "node:crypto";
import { ruleAstSchema, type RuleAst } from "@tyche/rule-compiler";
import {
  behaviorSignature,
  buildEquivalentAlternative,
  buildScenarios,
  selectMutations,
  TOTAL_SCENARIOS,
  type BenchmarkScenario,
  type CorpusCandidate,
} from "./jevCorpusEngine.js";
import {
  EXECUTABLE_PROPOSALS,
  NON_EXECUTABLE_PROPOSALS,
  type Complexity,
} from "./jevCorpusProposals.js";

/**
 * Assembles the blind corpus and refuses to emit one that cannot prove its own
 * labels. Every gate below is a property the release report later assumes; it is
 * cheaper and far safer to fail here than to discover a mislabeled candidate
 * after it has already counted as a false accept.
 */

/** Semantic mutations required per executable rule, set by the 360 accuracy gate. */
export const MUTATIONS_PER_RULE = 6;
/** 40% calibrates, 60% is holdout. Frozen before the holdout is opened. */
export const CALIBRATION_SHARE = 0.4;
const MIN_EQUIVALENT_SHARE = 1 / 3;

export type CorpusSplit = "calibration" | "holdout";
export type ProposalKind = "ambiguous" | "executable" | "prohibited";

export interface CorpusProposal {
  candidates: CorpusCandidate[];
  complexity: Complexity;
  id: string;
  kind: ProposalKind;
  language: "en" | "pt";
  /** Absent for ambiguous and prohibited proposals, which have no correct AST. */
  referenceAst: RuleAst | null;
  scenarios: BenchmarkScenario[];
  split: CorpusSplit;
  text: string;
  /** For non-executable proposals: the decision left open, or the refusal cause. */
  unresolved: string | null;
}

export interface Corpus {
  proposals: CorpusProposal[];
  stats: CorpusStats;
}

export interface CorpusStats {
  ambiguous: number;
  correctCandidates: number;
  equivalentShare: number;
  executable: number;
  holdoutIncorrectCandidates: number;
  incorrectCandidates: number;
  byComplexity: Record<Complexity, number>;
  byLanguage: Record<"en" | "pt", number>;
  bySplit: Record<CorpusSplit, number>;
  prohibited: number;
}

function digestFraction(id: string): number {
  return (
    createHash("sha256").update(`jev-corpus:${id}`).digest().readUInt32BE(0) /
    2 ** 32
  );
}

function assignSplit(id: string): CorpusSplit {
  return digestFraction(id) < CALIBRATION_SHARE ? "calibration" : "holdout";
}

function parseReference(ast: unknown, id: string): RuleAst {
  const parsed = ruleAstSchema.safeParse(ast);
  if (!parsed.success) {
    throw new Error(`Reference AST for ${id} is not schema-valid`);
  }
  return parsed.data;
}

/**
 * Builds the executable half. A proposal that cannot supply the required number
 * of behaviorally distinct mutations, or whose reference rule wins every
 * scenario or none, is a defect in the corpus and stops the build: a saturated
 * rule cannot separate a correct AST from a mutated one, so including it would
 * inflate coverage with judgments that carry no information.
 */
function buildExecutableProposals(): CorpusProposal[] {
  return EXECUTABLE_PROPOSALS.map((proposal, index) => {
    const id = `EXE-${String(index + 1).padStart(3, "0")}`;
    const language = index % 2 === 0 ? "en" : "pt";
    const referenceAst = parseReference(proposal.ast, id);
    const scenarios = buildScenarios(id);
    const signature = behaviorSignature(referenceAst, scenarios);
    if (!signature)
      throw new Error(`Reference AST for ${id} does not evaluate`);
    if (signature.wins === 0 || signature.wins === scenarios.length) {
      throw new Error(
        `Reference rule ${id} is saturated (${signature.wins}/${scenarios.length} wins) and cannot discriminate`,
      );
    }

    const { mutations } = selectMutations(
      referenceAst,
      scenarios,
      MUTATIONS_PER_RULE,
    );
    if (mutations.length < MUTATIONS_PER_RULE) {
      throw new Error(
        `Rule ${id} yields only ${mutations.length} distinct semantic mutations; ${MUTATIONS_PER_RULE} are required`,
      );
    }

    const candidates: CorpusCandidate[] = [
      {
        ast: referenceAst,
        candidateId: `${id}-correct`,
        correct: true,
        label: "correct",
        mutationNote: null,
      },
      ...mutations.map((mutation, position) => ({
        ast: mutation.ast,
        candidateId: `${id}-mut-${position + 1}`,
        correct: false,
        label: mutation.operator,
        mutationNote: mutation.note,
      })),
    ];

    // A serializer defect: the AST is wrong but the description handed to the
    // reviewer still describes the correct rule. A reviewer that reads only the
    // prose, rather than the tree, accepts this one.
    const firstMutation = mutations[0];
    if (firstMutation) {
      candidates.push({
        ast: firstMutation.ast,
        candidateId: `${id}-serializer`,
        correct: false,
        describeFromAst: referenceAst,
        label: "serializer_divergence",
        mutationNote: `${firstMutation.note}, presented with the reference description`,
      });
    }

    const equivalent = buildEquivalentAlternative(referenceAst, scenarios);
    if (equivalent) {
      candidates.push({
        ast: equivalent.ast,
        candidateId: `${id}-equivalent`,
        correct: true,
        label: "equivalent",
        mutationNote: equivalent.note,
      });
    }

    return {
      candidates,
      complexity: proposal.complexity,
      id,
      kind: "executable" as const,
      language,
      referenceAst,
      scenarios,
      split: assignSplit(id),
      text: language === "en" ? proposal.en : proposal.pt,
      unresolved: null,
    };
  });
}

function buildNonExecutableProposals(): CorpusProposal[] {
  return NON_EXECUTABLE_PROPOSALS.flatMap((proposal, index) =>
    (["en", "pt"] as const).map((language) => {
      const id = `${proposal.kind === "ambiguous" ? "AMB" : "PRO"}-${String(index + 1).padStart(3, "0")}-${language}`;
      return {
        candidates: [],
        // These never reach a compiler, so complexity is not a tier of AST size.
        complexity: "simple" as Complexity,
        id,
        kind: proposal.kind,
        language,
        referenceAst: null,
        scenarios: [],
        split: assignSplit(id),
        text: language === "en" ? proposal.en : proposal.pt,
        unresolved: proposal.reason,
      };
    }),
  );
}

export function buildCorpus(): Corpus {
  const proposals = [
    ...buildExecutableProposals(),
    ...buildNonExecutableProposals(),
  ];
  const stats = summarizeCorpus(proposals);
  assertCorpusIsReleasable(proposals, stats);
  return { proposals, stats };
}

export function summarizeCorpus(
  proposals: readonly CorpusProposal[],
): CorpusStats {
  const executable = proposals.filter(
    (proposal) => proposal.kind === "executable",
  );
  const candidates = executable.flatMap((proposal) =>
    proposal.candidates.map((candidate) => ({ candidate, proposal })),
  );
  const incorrect = candidates.filter((row) => !row.candidate.correct);
  const byComplexity: Record<Complexity, number> = {
    complex: 0,
    medium: 0,
    simple: 0,
  };
  const byLanguage: Record<"en" | "pt", number> = { en: 0, pt: 0 };
  const bySplit: Record<CorpusSplit, number> = { calibration: 0, holdout: 0 };
  for (const proposal of executable) {
    byComplexity[proposal.complexity] += 1;
    byLanguage[proposal.language] += 1;
    bySplit[proposal.split] += 1;
  }
  return {
    ambiguous: proposals.filter((proposal) => proposal.kind === "ambiguous")
      .length,
    byComplexity,
    byLanguage,
    bySplit,
    correctCandidates: candidates.filter((row) => row.candidate.correct).length,
    equivalentShare:
      executable.length === 0
        ? 0
        : executable.filter((proposal) =>
            proposal.candidates.some(
              (candidate) => candidate.label === "equivalent",
            ),
          ).length / executable.length,
    executable: executable.length,
    holdoutIncorrectCandidates: incorrect.filter(
      (row) => row.proposal.split === "holdout",
    ).length,
    incorrectCandidates: incorrect.length,
    prohibited: proposals.filter((proposal) => proposal.kind === "prohibited")
      .length,
  };
}

/**
 * The properties the release report assumes. Each one, if violated, would make a
 * gate pass for a reason that has nothing to do with the reviewer's accuracy.
 */
export function assertCorpusIsReleasable(
  proposals: readonly CorpusProposal[],
  stats: CorpusStats,
): void {
  const problems: string[] = [];
  if (stats.executable !== 100) {
    problems.push(
      `expected 100 executable proposals, found ${stats.executable}`,
    );
  }
  if (stats.byLanguage.en !== 50 || stats.byLanguage.pt !== 50) {
    problems.push(
      `language balance is ${stats.byLanguage.en} en / ${stats.byLanguage.pt} pt, expected 50/50`,
    );
  }
  if (stats.ambiguous !== 30 || stats.prohibited !== 30) {
    problems.push(
      `expected 30 ambiguous and 30 prohibited, found ${stats.ambiguous} and ${stats.prohibited}`,
    );
  }
  for (const complexity of ["complex", "medium", "simple"] as const) {
    if (stats.byComplexity[complexity] < 30) {
      problems.push(
        `only ${stats.byComplexity[complexity]} ${complexity} proposals; at least 30 are required`,
      );
    }
  }
  // The accuracy gate needs 360 independent incorrect candidates in the holdout.
  if (stats.holdoutIncorrectCandidates < 360) {
    problems.push(
      `holdout carries ${stats.holdoutIncorrectCandidates} incorrect candidates; the accuracy gate needs at least 360`,
    );
  }
  if (stats.equivalentShare < MIN_EQUIVALENT_SHARE) {
    problems.push(
      `only ${(stats.equivalentShare * 100).toFixed(1)}% of rules carry a behaviorally equivalent alternative; at least a third must`,
    );
  }
  const seenIds = new Set<string>();
  for (const proposal of proposals) {
    if (seenIds.has(proposal.id)) problems.push(`duplicate id ${proposal.id}`);
    seenIds.add(proposal.id);
    if (proposal.kind !== "executable") continue;
    if (proposal.scenarios.length !== TOTAL_SCENARIOS) {
      problems.push(
        `${proposal.id} has ${proposal.scenarios.length} scenarios, expected ${TOTAL_SCENARIOS}`,
      );
    }
    const reference = proposal.referenceAst;
    if (!reference) {
      problems.push(`${proposal.id} is executable but has no reference AST`);
      continue;
    }
    const referenceSignature = behaviorSignature(reference, proposal.scenarios);
    if (!referenceSignature) {
      problems.push(`${proposal.id} reference AST does not evaluate`);
      continue;
    }
    // Re-verify every label against the oracle rather than trusting the builder.
    for (const candidate of proposal.candidates) {
      const signature = behaviorSignature(candidate.ast, proposal.scenarios);
      if (!signature) {
        problems.push(`${candidate.candidateId} does not evaluate`);
        continue;
      }
      const behavesLikeReference =
        signature.digest === referenceSignature.digest;
      if (candidate.correct && !behavesLikeReference) {
        problems.push(
          `${candidate.candidateId} is labeled correct but behaves differently from the reference`,
        );
      }
      if (!candidate.correct && behavesLikeReference) {
        problems.push(
          `${candidate.candidateId} is labeled incorrect but is behaviorally identical to the reference`,
        );
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`Corpus is not releasable:\n- ${problems.join("\n- ")}`);
  }
}
