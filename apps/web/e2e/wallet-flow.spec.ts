import { expect, test } from "@playwright/test";

test("wallet flow keeps the modal and canonical URL in sync", async ({ page }) => {
  await page.goto("/play/wallet");

  const dialogHeading = page.getByRole("heading", { name: "Connect your wallet" });
  await expect(dialogHeading).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Mobile Wallet Adapter/u }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Close wallet dialog" }).click();
  await expect(page).toHaveURL(/\/play$/u);
  await expect(dialogHeading).toHaveCount(0);
});
