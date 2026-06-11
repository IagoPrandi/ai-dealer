import assert from "node:assert/strict";
import { test } from "node:test";
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
  });

  assert.deepEqual(result, { invalid: 1, processed: 2, valid: 1 });
  assert.equal(published[0]?.decision, "VALID");
  assert.equal(published[0]?.confidenceAction, "ACCEPT");
  assert.match(published[0]?.compiledArtifactHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(published[1]?.decision, "INVALID");
  assert.equal(published[1]?.confidenceAction, "REJECT");
  assert.ok(published[1]?.reasonCodes.includes("AMBIGUOUS_RULE"));
});
