import { expect, test } from "@playwright/test";

test("number picker requires a connected wallet before devnet submission", async ({
  page,
}) => {
  await page.goto("/play/pick");

  await expect(
    page.getByRole("heading", { name: "Choose six unique numbers." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Review guess" }),
  ).toBeDisabled();

  for (const label of ["01", "02", "03", "04", "05", "06"]) {
    await page.getByRole("button", { name: label }).click();
  }

  await expect(page.getByText("Ready to review your guess.")).toBeVisible();
  await page.getByRole("button", { name: "Review guess" }).click();

  await expect(
    page.getByRole("heading", {
      name: "Confirm these numbers before devnet submission.",
    }),
  ).toBeVisible();
  await expect(page.getByText("Not connected")).toBeVisible();

  await page.getByRole("link", { name: "Connect wallet" }).click();

  await expect(page).toHaveURL(/\/play\/wallet$/);
});
