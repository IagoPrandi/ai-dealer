import { expect, test } from "@playwright/test";

test("simulated result explains outcomes, creator reward, return, and sharing", async ({ page }) => {
  await page.goto("/play/results");

  await expect(
    page.getByRole("heading", { name: "One number away from an alternative-rule win." })
  ).toBeVisible();
  await expect(
    page.getByText("One more match would have triggered the active rule. Numbers 57 and 83 missed.")
  ).toBeVisible();
  await expect(page.getByText("Deducted from winner")).toBeVisible();
  await expect(page.getByText("0.00 SOL")).toBeVisible();

  await page.getByRole("button", { name: "Winner" }).click();
  await expect(page.getByRole("heading", { name: "Your guess won under the Rule of the Hour." })).toBeVisible();
  await expect(page.getByText("The active rule changed this outcome from a loss into a win.")).toBeVisible();

  await page.getByRole("button", { name: "Creator" }).click();
  await expect(page.getByRole("heading", { name: "Your elected rule created a winner." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Creator reward: 0.18 SOL" })).toBeVisible();
  await expect(page.getByText(/winner still receives the full 1.20 SOL/)).toBeVisible();

  await expect(page.getByRole("link", { name: "Share result" })).toHaveAttribute("href", "/play/share");
  await expect(page.getByRole("link", { name: "Join next round" })).toHaveAttribute("href", "/play/pick");
});
