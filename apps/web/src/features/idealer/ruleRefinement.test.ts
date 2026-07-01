import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composeRefinedRuleDraft,
  getRuleRefinementBase,
  isRuleRefinementPatch,
} from "./ruleRefinement.js";

test("uses the suggested rewrite as the refinement base when present", () => {
  assert.equal(
    getRuleRefinementBase({
      currentRuleText:
        "Win if the guess and draw contain the same set of numbers.",
      suggestedRewrite:
        "Win if all 6 guessed numbers appear in the draw, regardless of order.",
    }),
    "Win if all 6 guessed numbers appear in the draw, regardless of order.",
  );
});

test("turns a short order correction into a complete revised rule", () => {
  const context = {
    currentRuleText:
      "Win if the guess and draw contain the same set of numbers.",
    refinementQuestions: ["Should order be ignored completely?"],
  };

  assert.equal(isRuleRefinementPatch("ignore order", context), true);
  assert.equal(
    composeRefinedRuleDraft("ignore order", context),
    "Win if the guess and draw contain the same set of numbers. Order is ignored.",
  );
});

test("turns a yes answer to an order question into a complete revised rule", () => {
  assert.equal(
    composeRefinedRuleDraft("yes", {
      currentRuleText:
        "Win if the guess and draw contain the same set of numbers.",
      refinementQuestions: ["Should order be ignored completely?"],
    }),
    "Win if the guess and draw contain the same set of numbers. Order is ignored.",
  );
});

test("does not treat help or cost questions as rule refinements", () => {
  const context = {
    currentRuleText:
      "Win if the guess and draw contain the same set of numbers.",
  };

  assert.equal(isRuleRefinementPatch("how does it work?", context), false);
  assert.equal(isRuleRefinementPatch("how much does it cost?", context), false);
});
