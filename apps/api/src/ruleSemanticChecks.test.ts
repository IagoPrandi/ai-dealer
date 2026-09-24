import assert from "node:assert/strict";
import { test } from "node:test";

import { ruleAstSchema, type RuleAst } from "@tyche/rule-compiler";

import { validateJevResponse, type ValidatedJevResponse } from "./jev.js";
import {
  buildArtifactCheck,
  buildInputSafetyQuestions,
  deriveInputSafetyJudgment,
  resolveArtifactVetoMode,
  selectCompiledCandidate,
  type CandidateDecision,
  type CandidateJudgment,
} from "./ruleSemanticChecks.js";

const judgment = (decision: CandidateDecision): CandidateJudgment => ({ decision, negative: [], uncertain: [] });

test("agreeing compilers: strict freezes only a supported AST; confident_negative vetoes only a 'no'", () => {
  const cases: Array<[CandidateDecision, "confident_negative" | "strict", string]> = [
    ["candidate_supported", "strict", "accept"],
    ["insufficient_evidence", "strict", "SEMANTIC_CHECK_UNCONFIRMED"],
    ["candidate_defect", "strict", "SEMANTIC_CHECK_FAILED"],
    ["candidate_supported", "confident_negative", "accept"],
    ["insufficient_evidence", "confident_negative", "accept"],
    ["candidate_defect", "confident_negative", "SEMANTIC_CHECK_FAILED"],
  ];
  for (const [decision, mode, expected] of cases) {
    const outcome = selectCompiledCandidate({ checkA: judgment(decision), checkB: null, equivalent: true, mode });
    assert.equal(outcome.kind === "accept" ? "accept" : outcome.reasonCode, expected, `${decision}/${mode}`);
    if (outcome.kind === "accept") assert.equal(outcome.winner, "A");
  }
});

test("disagreeing compilers: exactly one supported AST is selected, in either veto mode", () => {
  for (const mode of ["strict", "confident_negative"] as const) {
    assert.deepEqual(
      selectCompiledCandidate({ checkA: judgment("candidate_defect"), checkB: judgment("candidate_supported"), equivalent: false, mode }),
      { kind: "accept", winner: "B" },
    );
    assert.deepEqual(
      selectCompiledCandidate({ checkA: judgment("candidate_supported"), checkB: judgment("insufficient_evidence"), equivalent: false, mode }),
      { kind: "accept", winner: "A" },
    );
    // Both supported (a none-right control can look like this) or neither:
    // the split is unresolved, never a guess.
    for (const [a, b] of [["candidate_supported", "candidate_supported"], ["insufficient_evidence", "candidate_defect"]] as const) {
      assert.deepEqual(
        selectCompiledCandidate({ checkA: judgment(a), checkB: judgment(b), equivalent: false, mode }),
        { kind: "reject", reasonCode: "PROVIDER_DISAGREEMENT" },
      );
    }
  }
  assert.throws(() => selectCompiledCandidate({ checkA: judgment("candidate_supported"), checkB: null, equivalent: false, mode: "strict" }));
});

test("the veto mode is strict unless explicitly configured, and a typo is an error", () => {
  assert.equal(resolveArtifactVetoMode({} as NodeJS.ProcessEnv), "strict");
  assert.equal(resolveArtifactVetoMode({ TYCHE_RULE_ARTIFACT_VETO: "confident_negative # recall" } as NodeJS.ProcessEnv), "confident_negative");
  assert.throws(() => resolveArtifactVetoMode({ TYCHE_RULE_ARTIFACT_VETO: "off" } as NodeJS.ProcessEnv));
});

function safetyResponse(choice: string, probability: number, confidence: number): ValidatedJevResponse {
  const questions = buildInputSafetyQuestions();
  const answers = Object.fromEntries(
    Object.entries(questions).map(([id, question]) => {
      if (question.type === "choice") {
        const others = Object.keys(question.criteria).filter((option) => option !== choice);
        const rest = (1 - probability) / others.length;
        return [id, { choice, confidence, probabilities: Object.fromEntries([[choice, probability], ...others.map((option) => [option, rest])]), type: "choice" }];
      }
      const levels = question.type === "score" ? question.criteria : [];
      return [id, { confidence: 0.9, legend: Object.fromEntries(levels.map((level, index) => [String(index), level])), probabilities: Object.fromEntries(levels.map((_, index) => [String(index), index === 0 ? 0.97 : 0.01])), score: 0, type: "score" }];
    }),
  );
  return validateJevResponse({ answers, model: "m", usage: { input_tokens: 1, output_tokens: 1 } }, questions);
}

test("input safety is safe only on a confident safe verdict; everything else fails closed", () => {
  assert.equal(deriveInputSafetyJudgment(safetyResponse("safe", 0.9, 0.8)).decision, "safe");
  assert.equal(deriveInputSafetyJudgment(safetyResponse("unsafe", 0.75, 0.7)).decision, "unsafe");
  // A safe label below its bar is not safe.
  assert.equal(deriveInputSafetyJudgment(safetyResponse("safe", 0.79, 0.8)).decision, "insufficient_evidence");
  assert.equal(deriveInputSafetyJudgment(safetyResponse("safe", 0.95, 0.5)).decision, "insufficient_evidence");
  assert.equal(deriveInputSafetyJudgment(safetyResponse("insufficient_evidence", 0.9, 0.9)).decision, "insufficient_evidence");
});

test("the artifact check reads the description with its vocabulary and checks context claims for consistency", () => {
  const ast = ruleAstSchema.parse({
    result: {
      predicate: { kind: "compare", left: { kind: "reduce", of: { kind: "source", source: "guess" }, op: "sum" }, op: "eq", right: { kind: "reduce", of: { kind: "source", source: "draw" }, op: "sum" } },
      type: "predicate",
    },
    schemaVersion: 3,
  }) as RuleAst;
  const ledger = {
    claims: [
      { dimension: "other" as const, id: "c1", meaning: "Separate the ticket numbers into hits and misses.", sourceSpan: "Separe os números" },
      { dimension: "win_condition" as const, id: "c2", meaning: "The sum of your six numbers is exactly equal to the sum of the draw.", sourceSpan: "a soma" },
    ],
    openChoices: [],
  };
  const { questions, state } = buildArtifactCheck(ledger, ast, [{ draw: [1, 2, 3, 4, 5, 6], guess: [1, 2, 3, 4, 5, 6], id: "x" }]);
  assert.ok(state.candidate.vocabulary.some((entry) => entry.includes("all six numbers of the ticket")));
  const instructions = (id: string) => (questions[id] as { instructions: string }).instructions;
  assert.match(instructions("forward_0"), /filed as context/u);
  // An instruction or a condition filed as context still has to be implemented.
  assert.match(instructions("forward_0"), /instructs anyone to do anything, answer yes only when/u);
  assert.match(instructions("forward_1"), /implement `claims\[1\]\.meaning` with exactly the same meaning/u);
  for (const id of ["forward_0", "forward_1", "reverse_0"]) assert.match(instructions(id), /candidate\.vocabulary/u);
  assert.ok(questions.scenario_0);
});
