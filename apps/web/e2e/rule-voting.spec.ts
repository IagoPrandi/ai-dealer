import { expect, test } from "@playwright/test";

test("rule voting updates the current vote, leader, feedback, and activity feed", async ({ page }) => {
  await page.goto("/play/vote");

  await expect(page.getByRole("heading", { name: "Closest even sum wins" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Vote for Balanced spread wins" }).click();

  await expect(page.getByText("Vote cast for Balanced spread wins.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Balanced spread wins" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Your vote" })).toBeVisible();
  await expect(page.getByText("You voted for Balanced spread wins.")).toBeVisible();

  await page.getByRole("button", { name: "Change vote to Highest odd number wins" }).click();
  await expect(page.getByText("Vote changed to Highest odd number wins.")).toBeVisible();
  await expect(page.getByText("You voted for Highest odd number wins.")).toBeVisible();

  await page.getByRole("button", { name: "Empty state" }).click();
  await expect(page.getByRole("heading", { name: "No eligible rules yet." })).toBeVisible();
});
