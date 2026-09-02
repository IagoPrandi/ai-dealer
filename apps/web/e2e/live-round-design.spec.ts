import { expect, test } from "@playwright/test";

test("play route renders the responsive live-round flow", async ({ page }) => {
  await page.goto("/play");

  await expect(page.getByText("Tywish").first()).toBeVisible();
  await expect(page.getByText("Accumulated prize")).toBeVisible();
  await expect(page.getByText("The rules", { exact: true })).toBeVisible();
  await expect(page.locator(".ide-phone-shell, .ide-di, .ide-statusbar")).toHaveCount(0);

  await page.getByRole("button", { name: /Play now/u }).click();
  await expect(page).toHaveURL(/\/play\/pick$/u);
  await expect(page.getByRole("heading", { name: "Make a guess" })).toBeVisible();

  await page.getByRole("button", { name: "Back" }).click();
  await expect(page).toHaveURL(/\/play$/u);
  await page.getByRole("button", { name: "Account" }).click();
  await expect(page).toHaveURL(/\/play\/account$/u);
  await expect(page.getByRole("heading", { name: "Your wallet" })).toBeVisible();
});
