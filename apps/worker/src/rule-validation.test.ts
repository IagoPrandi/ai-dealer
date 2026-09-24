import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildCompilerCandidateResult,
  gateCompilerCandidate,
  validateAndPrecompileRule,
  type RuleCompilerStageResult,
} from "@tyche/rule-compiler";

const REVIEWED_STAGES: RuleCompilerStageResult[] = [
  { detail: "Compiler B agreed.", reasonCodes: [], stage: "independent_review", status: "passed" },
  { detail: "Semantic check supported.", reasonCodes: [], stage: "semantic_check", status: "passed" },
];
import {
  runRuleValidationCycle,
  type PublishedRuleValidation,
} from "./rule-validation.js";

test("runRuleValidationCycle publishes valid and invalid validation logs", async () => {
  const published: PublishedRuleValidation[] = [];
  const result = await runRuleValidationCycle({
    fetchPendingRules: async () => [
      {
        ruleId: 1,
        sanitizedText: "Win if at least 4 of your numbers appear in the draw.",
        tokenCount: 12,
        turnId: 1,
      },
      {
        ruleId: 2,
        sanitizedText: "Win if your guess is close to the draw.",
        tokenCount: 9,
        turnId: 1,
      },
    ],
    nowIso: () => "2026-06-11T00:00:00.000Z",
    publishValidation: async (validation) => {
      published.push(validation);
    },
    validateRule: async (rule, timestamp) => {
      const request = {
        originalText: rule.sanitizedText,
        prompt: rule.sanitizedText,
        ruleId: rule.ruleId,
        timestamp,
        tokenCount: rule.tokenCount,
      };
      const deterministic = validateAndPrecompileRule(request);
      if (deterministic.decision !== "VALID" || !deterministic.artifact) {
        return deterministic;
      }
      // The shape the two-compiler preflight freezes: the same AST with the
      // second compiler's review and the semantic check on record.
      return buildCompilerCandidateResult({
        blockingReasonCodes: [],
        constrainedDecodingUsed: true,
        extraStages: REVIEWED_STAGES,
        gate: gateCompilerCandidate(deterministic.artifact.ast),
        modelIdentity: deterministic.artifact.modelIdentity,
        providerPath: [],
        request,
        timestamp,
      });
    },
  });

  assert.deepEqual(result, { invalid: 1, processed: 2, valid: 1 });
  assert.equal(published[0]?.decision, "VALID");
  assert.equal(published[0]?.confidenceAction, "ACCEPT");
  assert.ok(published[0]?.compiledArtifact);
  assert.equal(
    published[0]?.compiledArtifact?.originalText,
    "Win if at least 4 of your numbers appear in the draw.",
  );
  assert.ok(
    (published[0]?.compiledArtifact?.evaluatedTestCases.length ?? 0) > 0,
  );
  assert.match(published[0]?.compiledArtifactHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(published[1]?.decision, "INVALID");
  assert.equal(published[1]?.compiledArtifact, null);
  assert.equal(published[1]?.confidenceAction, "REJECT");
  assert.ok(published[1]?.reasonCodes.includes("AMBIGUOUS_RULE"));
});

test("runRuleValidationCycle refuses an unreviewed VALID artifact", async () => {
  const rule = {
    ruleId: 7,
    sanitizedText: "Win if at least 4 of your numbers appear in the draw.",
    tokenCount: 12,
    turnId: 3,
  };
  const unreviewed = validateAndPrecompileRule({
    originalText: rule.sanitizedText,
    prompt: rule.sanitizedText,
    ruleId: rule.ruleId,
    tokenCount: rule.tokenCount,
  });
  assert.equal(unreviewed.decision, "VALID");

  let published = false;
  await assert.rejects(
    runRuleValidationCycle({
      fetchPendingRules: async () => [rule],
      nowIso: () => "2026-09-10T00:00:00.000Z",
      publishValidation: async () => {
        published = true;
      },
      validateRule: async () => unreviewed,
    }),
    /without the required second-compiler review and semantic-check audit/u,
  );
  assert.equal(published, false);
});
