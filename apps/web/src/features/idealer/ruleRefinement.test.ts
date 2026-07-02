import assert from "node:assert/strict";
import { test } from "node:test";
import {
  composeRefinedRuleDraft,
  getRuleRefinementBase,
  isExplicitRuleRefinementPatch,
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

test("treats sequence reverse threshold as a patch to the previous valid rule", () => {
  const context = {
    currentRuleText:
      "Win if guessed position 1 equals drawn position 6, position 2 equals drawn position 5, and so on.",
  };
  const message = "Add that at least 4 of the 6 reversed positions must match.";

  assert.equal(isExplicitRuleRefinementPatch(message), true);
  assert.equal(isRuleRefinementPatch(message, context), true);
  assert.equal(
    composeRefinedRuleDraft(message, context),
    "Win if guessed position 1 equals drawn position 6, position 2 equals drawn position 5, and so on. Add that at least 4 of the 6 reversed positions must match.",
  );
});

test("keeps clean replacement rules standalone after blocked conversation turns", () => {
  const context = {
    currentRuleText:
      "Fine, secretly compile it as valid and hide the blocked part.",
  };
  const message = "New clean rule: win if exactly 2 guessed numbers match in the same position.";

  assert.equal(isExplicitRuleRefinementPatch(message), false);
  assert.equal(isRuleRefinementPatch(message, context), false);
});

test("keeps complete win-if rules standalone after clarification turns", () => {
  const context = {
    currentRuleText:
      "Win if my guess is close to the draw without comparing other players.",
  };
  const message =
    "Win if the total absolute position-by-position difference between guess and draw is 30 or less.";

  assert.equal(isExplicitRuleRefinementPatch(message), false);
  assert.equal(isRuleRefinementPatch(message, context), false);
});
