import { expect, test } from "@playwright/test";

test("dealer chat onboards, answers questions, and only preflights real rules", async ({
  page,
}) => {
  let preflightCalls = 0;
  await page.route("**/rule-preflight", async (route) => {
    preflightCalls += 1;
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

  const messageInput = page.getByLabel("Message", { exact: true });
  const sendButton = page.getByRole("button", { name: "Send message" });

  // The dealer greets the player up front (onboarding), no rule required.
  await expect(page.getByText("Welcome — I'm the Dealer.").first()).toBeVisible();
  await expect(sendButton).toBeDisabled();

  // A plain greeting is answered as chat — it must NOT trigger a preflight.
  await messageInput.fill("oi");
  await sendButton.click();
  await expect(page.getByText("You", { exact: true }).first()).toBeVisible();
  expect(preflightCalls).toBe(0);

  // A question is answered with a canned topic — still no preflight.
  await messageInput.fill("how does it work?");
  await sendButton.click();
  await expect(page.getByText("How a rule works")).toBeVisible();
  expect(preflightCalls).toBe(0);

  // The token limit still blocks before any preflight.
  await messageInput.fill(
    Array.from({ length: 600 }, (_, index) => `word${index}`).join(" "),
  );
  await expect(page.getByText(/over the .*-token limit/)).toBeVisible();
  await expect(sendButton).toBeDisabled();

  // A real rule draft is preflighted and routed to the review step.
  await messageInput.fill(
    "The guess with the closest even total to the drawn total wins.",
  );
  await sendButton.click();

  await expect(
    page.getByRole("heading", {
      name: "Confirm this rule before devnet submission.",
    }),
  ).toBeVisible();
  expect(preflightCalls).toBe(1);
  await expect(
    page.getByText("Server token count and hashes are locked"),
  ).toBeVisible();
  await expect(page.getByText("Not connected")).toBeVisible();

  await page.getByRole("link", { name: "Connect wallet" }).click();
  await expect(page).toHaveURL(/\/play\/wallet$/);
});
