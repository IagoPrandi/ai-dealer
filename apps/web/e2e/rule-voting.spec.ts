import { expect, test } from "@playwright/test";

test("rule voting exposes its public empty state and requires a round pass", async ({
  page,
}) => {
  await page.goto("/play");
  await page.getByRole("button", { exact: true, name: "vote" }).click();

  await expect(
    page.getByRole("heading", { name: "Rules" }).first(),
  ).toBeVisible();
  await expect(page.getByText("Play to unlock voting")).toBeVisible();
  await expect(page.getByText("No rules to vote on yet.")).toBeVisible();
});
