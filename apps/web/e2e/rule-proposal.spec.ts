import { expect, test } from "@playwright/test";

test("free-form rule composer enforces the token limit and completes proposal simulation", async ({
  page
}) => {
  await page.goto("/play/propose");

  const ruleInput = page.getByLabel("Rule text");
  const reviewButton = page.getByRole("button", { name: "Review proposal" });

  await expect(reviewButton).toBeDisabled();
  await ruleInput.fill(Array.from({ length: 81 }, (_, index) => `word${index}`).join(" "));
  await expect(page.getByText(/over the limit/)).toBeVisible();
  await expect(reviewButton).toBeDisabled();

  await ruleInput.fill("The guess with the closest even total to the drawn total wins.");
  await expect(page.locator(".sanitized-preview p")).toHaveText(
    "The guess with the closest even total to the drawn total wins.",
  );
  await reviewButton.click();

  await expect(
    page.getByRole("heading", { name: "Confirm this rule before simulated submission." })
  ).toBeVisible();
  await page.getByRole("button", { name: "Submit simulation" }).click();

  await expect(page.getByRole("heading", { name: "Your simulated rule is queued." })).toBeVisible();
});
