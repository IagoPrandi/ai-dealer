import { expect, test, type Page } from "@playwright/test";

import { mockRulePreflight } from "./helpers/preflight";
import { mockShellData } from "./helpers/shell";

function hashBytes(seed: number) {
  return Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

function interpretation(text: string, needsClarification = false) {
  return {
    interpretation: {
      addedOperationalClauses: [],
      clarityNote: needsClarification
        ? "The rule needs a precise measurable threshold."
        : "",
      dealerMessage: needsClarification
        ? "I need clarification before I can generate this rule."
        : "This is how I understand your rule.",
      englishText: text,
      guardianChecked: false,
      needsClarification,
      normalizedText: text,
      officialInterpretation:
        "The engine compares only the player's guess and the official draw.",
      sanitizedText: text,
      suggestedRewrites: [],
      title: "Rule interpretation",
      tokenCount: 12,
    },
  };
}

function validPreflight(text: string, ruleId: number) {
  return {
    preflight: {
      addedOperationalClauses: [],
      clarityNote: "",
      coverage: { missingFromAst: [], missingOperations: [] },
      decision: "VALID",
      dealerMessage:
        "Done. I compiled your rule into a deterministic condition.",
      difficultyClass: "MEDIUM",
      finalConfidence: 0.91,
      maxTokens: 1000,
      needsClarification: false,
      normalizedText: text,
      normalizedTextHash: hashBytes(1),
      officialInterpretation:
        "The engine compares only the player's guess and the official draw.",
      officialInterpretationHash: hashBytes(2),
      preflightResultHash: hashBytes(3),
      reasonCodes: ["SUPPORTED_RULE"],
      ruleId,
      ruleMode: "predicate",
      sanitizedText: text,
      sanitizedTextHash: hashBytes(4),
      tokenCount: 12,
    },
  };
}

// A vague rule that the compiler cannot turn into a measurable rule, with NO
// suggestedRewrite — this is the base that previously caused an infinite
// clarification loop when the user answered.
function clarifyPreflight(text: string) {
  return {
    preflight: {
      addedOperationalClauses: [],
      clarityNote: "Close needs a precise measurable threshold.",
      coverage: null,
      decision: "INVALID",
      dealerMessage:
        "I need one objective threshold before this can be compiled.",
      finalConfidence: 0.36,
      maxTokens: 1000,
      needsClarification: true,
      normalizedText: text,
      normalizedTextHash: hashBytes(5),
      officialInterpretation: "",
      officialInterpretationHash: hashBytes(6),
      preflightResultHash: hashBytes(7),
      reasonSummary:
        "Rule needs refinement before payment: the compiler could not turn it into a safe executable rule from this wording.",
      reasonCodes: ["AMBIGUOUS_RULE"],
      refinementFocus: ["Define the minimum number of matches."],
      refinementQuestions: [
        "What exact count or comparison should make a guess win?",
        "Should order or positions matter, or should matching ignore order?",
      ],
      ruleId: 961,
      sanitizedText: text,
      sanitizedTextHash: hashBytes(8),
      tokenCount: 12,
    },
  };
}

function alwaysTruePreflight(text: string) {
  const suggestedRewrites = [
    "A guess wins if every guessed number is lower than the official drawn number in the corresponding position.",
    "A guess wins if every guessed number is higher than the official drawn number in the corresponding position.",
  ];
  const reasonSummary =
    "Every official draw already contains six unique numbers from 1 to 100. This condition is therefore always true and cannot distinguish winners from losers.";
  return {
    preflight: {
      addedOperationalClauses: [],
      clarityNote: reasonSummary,
      compiledArtifactHash: null,
      confirmationRequired: false,
      coverage: null,
      decision: "INVALID",
      dealerMessage: `This rule cannot pass preflight. ${reasonSummary} Choose one of the valid variations below or write a different rule.`,
      finalConfidence: 0.94,
      maxTokens: 1000,
      needsClarification: true,
      normalizedText: text,
      normalizedTextHash: hashBytes(9),
      officialInterpretation:
        "The condition checks only whether every official draw number is between 1 and 100.",
      officialInterpretationHash: hashBytes(10),
      preflightResultHash: hashBytes(11),
      reasonSummary,
      reasonCodes: ["DIFFICULTY_ALWAYS_TRUE"],
      refinementQuestions: [],
      ruleId: 962,
      sanitizedText: text,
      sanitizedTextHash: hashBytes(12),
      semanticImpact: {
        drawIndependent: false,
        rangeBoundsAmbiguous: false,
        sharedOutcome: true,
        triviallyAlwaysTrue: true,
        usesDraw: true,
        usesGuess: false,
      },
      suggestedRewrite: suggestedRewrites[0],
      suggestedRewrites,
      title: "Draw Range Check",
      tokenCount: 21,
    },
  };
}

// Regression for the clarification loop: when a vague rule (no suggestedRewrite,
// never VALID) gets a clarification and the user answers with a short natural
// reply, the client must NOT keep re-appending the answer to the unfixable base
// and re-asking the same question forever. With the fix, the answer is sent
// standalone, so a measurable answer reaches VALID / submit-allowed.
test("answering a clarification on an unfixable base finalizes instead of re-asking forever", async ({
  page,
}) => {
  await mockShellData(page);

  // Track the exact text the client sends to preflight on each turn so we can
  // prove the answer was NOT merged onto the vague base.
  const preflightTexts: string[] = [];
  await mockRulePreflight(page, (body) => {
    preflightTexts.push(body.text);
    if (body.phase === "interpret") {
      return {
        json: interpretation(body.text),
        status: 200,
      };
    }
    // The initial vague rule needs clarification.
    if (/close to the draw/i.test(body.text) && !/at least/i.test(body.text)) {
      return { json: clarifyPreflight(body.text), status: 200 };
    }
    // A measurable answer compiles cleanly.
    return {
      json: validPreflight(body.text, 961),
      status: 200,
    };
  });

  await page.goto("/play/propose");

  const messageInput = page.getByLabel("Message", { exact: true });
  const sendButton = page.getByRole("button", { name: "Send message" });

  await messageInput.fill("Win if my guess is close to the draw.");
  await sendButton.click();
  await page.getByRole("button", { name: "Confirm and generate" }).click();

  // Dealer asks to clarify the vague rule.
  await expect(
    page.getByRole("heading", { name: "Clarify this rule?" }),
  ).toBeVisible();
  await expect(
    page.getByText("What exact count or comparison should make a guess win?"),
  ).toBeVisible();
  await expect(
    page.getByText("Define the minimum number of matches."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();

  // User answers with a concrete, measurable rule instead of a fragment.
  await messageInput.fill(
    "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
  );
  await sendButton.click();
  await page.getByRole("button", { name: "Confirm and generate" }).click();

  // The flow must reach the finalized "valid rule" card (the pre-submit /
  // connect-wallet state) — NOT loop back to the same clarification.
  await expect(
    page.getByText(
      "Done. I compiled your rule into a deterministic condition.",
    ),
  ).toBeVisible();
  await expect(
    page.locator("p").filter({
      hasText:
        "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Clarify this rule?" }),
  ).toHaveCount(0);

  // Prove the answer was sent standalone, not appended onto the vague base
  // (the old loop produced texts like "Win if my guess is close to the draw. ...").
  expect(preflightTexts).toHaveLength(4);
  expect(preflightTexts[2]).toBe(
    "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
  );
  expect(preflightTexts[3]).toBe(
    "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
  );
});

test("a follow-up question uses dealer chat and offers an uncompiled rule suggestion", async ({
  page,
}) => {
  await mockShellData(page);
  const asked: unknown[] = [];
  await page.route("**/rule-dealer/ask", async (route) => {
    const body = await route.request().postDataJSON();
    asked.push(body);
    await route.fulfill({
      contentType: "application/json",
      json: {
        answer:
          "The dealer needs an explicit threshold before the compiler can evaluate the rule.",
        proposedRuleText:
          "Win if at least four guessed numbers appear in the official draw, regardless of order.",
      },
      status: 200,
    });
  });

  await page.goto("/play/propose");
  await page
    .getByLabel("Message", { exact: true })
    .fill("Why does this rule need an explicit threshold?");
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(
    page.getByText(
      "The dealer needs an explicit threshold before the compiler can evaluate the rule.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Try this rule?" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: /Win if at least four guessed numbers appear/i,
    }),
  ).toBeVisible();
  expect(asked).toHaveLength(1);
  expect(asked[0]).toMatchObject({
    message: "Why does this rule need an explicit threshold?",
  });
});

test("an always-true rule is rejected with valid replacements instead of entering confirmation loop", async ({
  page,
}) => {
  await mockShellData(page);
  const original =
    "A guess wins if all six official draw numbers are between 1 and 100, inclusive.";
  const replacement =
    "A guess wins if every guessed number is lower than the official drawn number in the corresponding position.";
  const preflightTexts: string[] = [];

  await mockRulePreflight(page, (body) => {
    preflightTexts.push(body.text);
    if (body.phase === "interpret") {
      return { json: interpretation(body.text), status: 200 };
    }
    return {
      json:
        body.text === original
          ? alwaysTruePreflight(body.text)
          : validPreflight(body.text, 963),
      status: 200,
    };
  });

  await page.goto("/play/propose");
  await page.getByLabel("Message", { exact: true }).fill(original);
  await page.getByRole("button", { name: "Send message" }).click();
  await page.getByRole("button", { name: "Confirm and generate" }).click();

  await expect(page.getByText("invalid rule", { exact: true })).toBeVisible();
  await expect(
    page.getByText(/this rule cannot pass preflight/i),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Choose a valid variation" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Confirm rule impact" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: /1 A guess wins.*lower/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /2 A guess wins.*higher/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Write a different valid rule/i }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Submit to the round/i }),
  ).toHaveCount(0);

  await page.getByRole("button", { name: /1 A guess wins.*lower/i }).click();
  await page.getByRole("button", { name: /^Use rule/ }).click();
  await page.getByRole("button", { name: "Confirm and generate" }).click();

  await expect(
    page.getByText(
      "Done. I compiled your rule into a deterministic condition.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("paragraph").filter({ hasText: replacement }),
  ).toBeVisible();
  expect(preflightTexts).toEqual([
    original,
    original,
    replacement,
    replacement,
  ]);
});
