import assert from "node:assert/strict";
import { test } from "node:test";
import { ruleAstSchema, type RuleAst } from "@tyche/rule-compiler";
import {
  assertCorpusIsReleasable,
  summarizeCorpus,
  type CorpusProposal,
} from "./jevCorpus.js";
import { buildScenarios } from "./jevCorpusEngine.js";
import {
  EXECUTABLE_PROPOSALS,
  NON_EXECUTABLE_PROPOSALS,
} from "./jevCorpusProposals.js";

/**
 * The full build is exercised by `scripts/jev-build-corpus.mts`, which an
 * operator runs before a release; at 100 rules times 204 scenarios it is far too
 * slow to sit in the unit suite. These tests cover the part that decides whether
 * a corpus may be used at all.
 */

const matches = {
  kind: "reduce",
  of: {
    kind: "intersection",
    left: { kind: "source", source: "guess" },
    right: { kind: "source", source: "draw" },
  },
  op: "count",
};

function predicateAst(value: number): RuleAst {
  return ruleAstSchema.parse({
    result: {
      predicate: {
        kind: "compare",
        left: matches,
        op: "gte",
        right: { kind: "lit", value },
      },
      type: "predicate",
    },
    schemaVersion: 3,
  });
}

function executable(index: number): CorpusProposal {
  const id = `EXE-${String(index + 1).padStart(3, "0")}`;
  return {
    candidates: [
      {
        ast: predicateAst(3),
        candidateId: `${id}-correct`,
        correct: true,
        label: "correct",
        mutationNote: null,
      },
      {
        ast: predicateAst(5),
        candidateId: `${id}-mut-1`,
        correct: false,
        label: "threshold",
        mutationNote: "threshold shifted",
      },
    ],
    complexity:
      index % 3 === 0 ? "simple" : index % 3 === 1 ? "medium" : "complex",
    id,
    kind: "executable",
    language: index % 2 === 0 ? "en" : "pt",
    referenceAst: predicateAst(3),
    scenarios: buildScenarios(id),
    split: index % 5 === 0 ? "calibration" : "holdout",
    text: "A ticket wins if at least three of its numbers appear in the draw.",
    unresolved: null,
  };
}

function corpusOf(count: number): CorpusProposal[] {
  return Array.from({ length: count }, (_unused, index) => executable(index));
}

test("the authored proposal set has the shape the corpus promises", () => {
  assert.equal(EXECUTABLE_PROPOSALS.length, 100);
  const byComplexity = EXECUTABLE_PROPOSALS.reduce<Record<string, number>>(
    (totals, proposal) => ({
      ...totals,
      [proposal.complexity]: (totals[proposal.complexity] ?? 0) + 1,
    }),
    {},
  );
  assert.ok((byComplexity.simple ?? 0) >= 30);
  assert.ok((byComplexity.medium ?? 0) >= 30);
  assert.ok((byComplexity.complex ?? 0) >= 30);
  // Both renderings must exist, and must differ: a proposal whose Portuguese is
  // its English would silently make the language gate compare a cohort to itself.
  for (const proposal of EXECUTABLE_PROPOSALS) {
    assert.ok(proposal.en.trim().length > 0 && proposal.pt.trim().length > 0);
    assert.notEqual(proposal.en, proposal.pt);
    assert.ok(ruleAstSchema.safeParse(proposal.ast).success);
  }
  assert.equal(
    NON_EXECUTABLE_PROPOSALS.filter((entry) => entry.kind === "ambiguous")
      .length,
    15,
  );
  assert.equal(
    NON_EXECUTABLE_PROPOSALS.filter((entry) => entry.kind === "prohibited")
      .length,
    15,
  );
  for (const entry of NON_EXECUTABLE_PROPOSALS) {
    assert.ok(
      entry.reason.trim().length > 0,
      "every one must name what blocks it",
    );
  }
});

test("a corpus too small for the accuracy gate is refused", () => {
  const proposals = corpusOf(100);
  const stats = summarizeCorpus(proposals);
  // 100 rules with one mutation each cannot reach 360 incorrect holdout ASTs,
  // which is the whole reason the corpus carries six mutations per rule.
  assert.ok(stats.holdoutIncorrectCandidates < 360);
  assert.throws(
    () => assertCorpusIsReleasable(proposals, stats),
    /at least 360/u,
  );
});

test("a mislabeled candidate stops the build instead of scoring", () => {
  const proposals = corpusOf(1);
  const proposal = proposals[0];
  assert.ok(proposal);
  // Labeled incorrect, but it is the reference rule written out again. Counting
  // this as a false accept would blame the reviewer for the corpus's mistake.
  proposal.candidates.push({
    ast: predicateAst(3),
    candidateId: "EXE-001-fake",
    correct: false,
    label: "threshold",
    mutationNote: "identical to the reference",
  });
  assert.throws(
    () => assertCorpusIsReleasable(proposals, summarizeCorpus(proposals)),
    /behaviorally identical to the reference/u,
  );

  proposal.candidates.pop();
  // The mirror image: labeled correct, but it behaves differently.
  proposal.candidates.push({
    ast: predicateAst(6),
    candidateId: "EXE-001-alt",
    correct: true,
    label: "equivalent",
    mutationNote: "not actually equivalent",
  });
  assert.throws(
    () => assertCorpusIsReleasable(proposals, summarizeCorpus(proposals)),
    /labeled correct but behaves differently/u,
  );
});

test("language imbalance and duplicate ids are refused", () => {
  const skewed = corpusOf(100).map((proposal) => ({
    ...proposal,
    language: "en" as const,
  }));
  assert.throws(
    () => assertCorpusIsReleasable(skewed, summarizeCorpus(skewed)),
    /language balance/u,
  );

  const duplicated = corpusOf(2).map((proposal) => ({
    ...proposal,
    id: "EXE-001",
  }));
  assert.throws(
    () => assertCorpusIsReleasable(duplicated, summarizeCorpus(duplicated)),
    /duplicate id/u,
  );
});

test("summary counts independent candidates, split by correctness", () => {
  const stats = summarizeCorpus(corpusOf(10));
  assert.equal(stats.executable, 10);
  assert.equal(stats.correctCandidates, 10);
  assert.equal(stats.incorrectCandidates, 10);
  assert.equal(stats.byLanguage.en + stats.byLanguage.pt, 10);
  assert.equal(stats.bySplit.calibration + stats.bySplit.holdout, 10);
});
