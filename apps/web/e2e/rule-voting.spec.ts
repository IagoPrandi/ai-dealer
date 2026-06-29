import { expect, test } from "@playwright/test";

test("rule voting shows indexed rules and requires wallet for devnet vote", async ({
  page,
}) => {
  await page.goto("/play");
  await page.getByRole("button", { exact: true, name: "vote" }).click();

  await expect(
    page.getByRole("heading", { name: "Rules" }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Repeat votes are allowed and each paid repeat doubles."),
  ).toBeVisible();

  await expect(page.getByText("Play to unlock voting")).toBeVisible();
});
