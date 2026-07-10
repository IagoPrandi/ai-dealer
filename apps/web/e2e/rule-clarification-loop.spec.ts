import { expect, test, type Page } from "@playwright/test";

function hashBytes(seed: number) {
  return Array.from({ length: 32 }, (_, index) => (seed + index) % 256);
}

function validPreflight(text: string, ruleId: number) {
  return {
    preflight: {
      addedOperationalClauses: [],
      clarityNote: "",
      decision: "VALID",
      dealerMessage: "Done. I compiled your rule into a deterministic condition.",
      difficultyClass: "MEDIUM",
      finalConfidence: 0.91,
      maxTokens: 1000,
      needsClarification: false,
      normalizedText: text,
      normalizedTextHash: hashBytes(1),
      officialInterpretation: "The engine compares only the player's guess and the official draw.",
      officialInterpretationHash: hashBytes(2),
      preflightResultHash: hashBytes(3),
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
      decision: "INVALID",
      dealerMessage: "I need one objective threshold before this can be compiled.",
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

async function mockShellData(page: Page) {
  await page.route("**/turn/active", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        globalConfig: {
          activeTurnId: 7,
          guessCutoffBps: 7500,
          guessSubmissionFeeLamports: "10000000",
          hasActiveTurn: true,
          nextTurnId: 8,
          paused: false,
          ruleElectionCutoffBps: 6500,
          ruleRemovalFeeLamports: "50000000",
          voteFeeLamports: "5000000",
        },
        globalConfigAddress: "11111111111111111111111111111111",
        turnState: {
          endTimestamp: Math.floor(Date.now() / 1000) + 3600,
          startTimestamp: Math.floor(Date.now() / 1000) - 1800,
          status: "open",
          turnId: 7,
        },
        turnStateAddress: "11111111111111111111111111111111",
      },
      status: 200,
    });
  });
  await page.route("**/rounds/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        round: {
          draw: null,
          election: null,
          elimination: null,
          pool: { guesses: 0, indicativeSol: 0, proposals: 0, totalVisiblePrizePoolSol: 0 },
          rules: [],
          status: "open",
          turnId: 7,
          winners: { records: [] },
        },
      },
      status: 200,
    });
  });
  await page.route("**/rule-proposals?**", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { proposals: [] }, status: 200 });
  });
  await page.route("**/rule-votes?**", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { counts: {}, votes: [] }, status: 200 });
  });
  await page.route("**/rule-elimination-votes?**", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { counts: {}, votes: [] }, status: 200 });
  });
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
  await page.route("**/rule-preflight", async (route) => {
    const body = (await route.request().postDataJSON()) as { text: string };
    preflightTexts.push(body.text);
    // The initial vague rule needs clarification.
    if (/close to the draw/i.test(body.text) && !/at least/i.test(body.text)) {
      await route.fulfill({ contentType: "application/json", json: clarifyPreflight(body.text), status: 200 });
      return;
    }
    // A measurable answer compiles cleanly.
    await route.fulfill({
      contentType: "application/json",
      json: validPreflight(body.text, 961),
      status: 200,
    });
  });

  await page.goto("/play/propose");

  const messageInput = page.getByLabel("Message", { exact: true });
  const sendButton = page.getByRole("button", { name: "Send message" });

  await messageInput.fill("Win if my guess is close to the draw.");
  await sendButton.click();

  // Dealer asks to clarify the vague rule.
  await expect(page.getByRole("heading", { name: "Clarify this rule?" })).toBeVisible();
  await page.getByRole("button", { name: "Dismiss" }).click();

  // User answers with a concrete, measurable rule instead of a fragment.
  await messageInput.fill("Win if at least 4 guessed numbers appear in the draw, regardless of order.");
  await sendButton.click();

  // The flow must reach the finalized "valid rule" card (the pre-submit /
  // connect-wallet state) — NOT loop back to the same clarification.
  await expect(
    page.locator(".ide-card").filter({ hasText: "valid rule" }).filter({
      hasText: "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clarify this rule?" })).toHaveCount(0);

  // Prove the answer was sent standalone, not appended onto the vague base
  // (the old loop produced texts like "Win if my guess is close to the draw. ...").
  expect(preflightTexts).toHaveLength(2);
  expect(preflightTexts[1]).toBe(
    "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
  );
});
