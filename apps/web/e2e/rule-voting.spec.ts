import { expect, test } from "@playwright/test";

test("rule voting shows indexed rules and requires wallet for devnet vote", async ({
  page,
}) => {
  await page.goto("/play/vote");

  await expect(
    page.getByRole("heading", { name: "All six drawn numbers" }).first(),
  ).toBeVisible();
  await expect(page.getByText("1 indexed votes")).toBeVisible();
  await expect(
    page.getByText("Each wallet can create one RuleVote account per rule."),
  ).toBeVisible();

  await page.getByRole("link", { name: "Connect wallet to vote" }).click();
  await expect(page).toHaveURL(/\/play\/wallet$/);

  await page.goto("/play/vote");

  await page.getByRole("button", { name: "Empty state" }).click();
  await expect(
    page.getByRole("heading", { name: "No eligible rules yet." }),
  ).toBeVisible();
});
