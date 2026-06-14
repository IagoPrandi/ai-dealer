import { expect, test } from "@playwright/test";

test("free-form rule composer enforces token limit and requires wallet for devnet submission", async ({
  page,
}) => {
  await page.route("**/rule-preflight", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        preflight: {
          addedOperationalClauses: [],
          clarityNote: "",
          dealerMessage:
            "Got it — the guess whose even total is closest to the drawn total wins.",
          maxTokens: 1000,
          needsClarification: false,
          normalizedText:
            "The guess with the even total closest to the drawn total wins.",
          normalizedTextHash: Array.from({ length: 32 }, (_, index) => index),
          officialInterpretation:
            "Compare every eligible guess by the absolute distance between its even total and the drawn total; the smallest distance wins.",
          officialInterpretationHash: Array.from(
            { length: 32 },
            (_, index) => 31 - index,
          ),
          preflightResultHash: Array.from({ length: 32 }, () => 7),
          ruleId: 123456,
          sanitizedText:
            "The guess with the closest even total to the drawn total wins.",
          sanitizedTextHash: Array.from({ length: 32 }, () => 9),
          tokenCount: 12,
        },
      },
      status: 200,
    });
  });

  await page.goto("/play/propose");

  const ruleInput = page.getByLabel("Rule text");
  const reviewButton = page.getByRole("button", { name: "Review proposal" });

  await expect(reviewButton).toBeDisabled();
  // Each "wordN" entry counts as two approximate tokens (letters + number), so
  // 600 entries (~1200 tokens) exceeds the 1000-token limit.
  await ruleInput.fill(
    Array.from({ length: 600 }, (_, index) => `word${index}`).join(" "),
  );
  await expect(page.getByText(/over the .*-token limit/)).toBeVisible();
  await expect(reviewButton).toBeDisabled();

  await ruleInput.fill(
    "The guess with the closest even total to the drawn total wins.",
  );
  await expect(page.locator(".sanitized-preview p").first()).toHaveText(
    "The guess with the closest even total to the drawn total wins.",
  );
  await reviewButton.click();

  await expect(
    page.getByRole("heading", {
      name: "Confirm this rule before devnet submission.",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Server token count and hashes are locked"),
  ).toBeVisible();
  await expect(page.getByText("Not connected")).toBeVisible();

  await page.getByRole("link", { name: "Connect wallet" }).click();
  await expect(page).toHaveURL(/\/play\/wallet$/);
});
