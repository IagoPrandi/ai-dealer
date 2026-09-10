import assert from "node:assert/strict";
import { test } from "node:test";
import {
  compileRuleArtifact,
  validateAndPrecompileRule,
} from "@tyche/rule-compiler";
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
      return compileRuleArtifact(request, {
        astProvider: async () => deterministic.artifact!.ast,
        astReviewer: async () => deterministic.artifact!.ast,
        preferDeterministic: true,
        requireProviderEvidence: true,
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
    /without the required independent review and provider-evidence audit/u,
  );
  assert.equal(published, false);
});
