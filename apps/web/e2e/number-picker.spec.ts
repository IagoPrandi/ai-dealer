import { expect, test } from "@playwright/test";

test("number picker requires a connected wallet before devnet submission", async ({
  page,
}) => {
  await page.goto("/play/pick");

  await expect(
    page.getByRole("heading", { name: "Make a guess" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "6 numbers left" }),
  ).toBeDisabled();

  for (const label of ["1", "2", "3", "4", "5", "6"]) {
    await page.getByRole("button", { name: label, exact: true }).click();
  }

  await page.getByRole("button", { name: "Review guess" }).click();

  await expect(
    page.getByRole("heading", { name: "Review guess" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect and submit" }).click();

  await expect(page).toHaveURL(/\/play\/wallet$/);
  await expect(
    page.getByRole("heading", { name: "Connect your wallet" }),
  ).toBeVisible();
});
