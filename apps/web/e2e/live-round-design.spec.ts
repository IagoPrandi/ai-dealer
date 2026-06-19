import { expect, test } from "@playwright/test";

test("play route reproduces the Plataforma app flow", async ({ page }) => {
  await page.goto("/play");

  await expect(page.getByRole("heading", { name: "Result" })).toBeVisible();
  await expect(page.getByText("You won!")).toBeVisible();
  await expect(page.getByRole("heading", { name: "+0.92 SOL" })).toBeVisible();
  await expect(page.getByText("Drawn numbers")).toBeVisible();

  await page.getByRole("button", { name: "Back to current round" }).first().click();
  await expect(page.getByText("Idealer")).toBeVisible();
  await expect(page.locator(".platform-prize-hero h1")).toHaveText("24.86SOL");
  await expect(
    page
      .getByRole("link", { name: /Play now/ })
      .or(page.getByRole("button", { name: /Checking turn|Waiting for next turn/ })),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "The rules" })).toBeVisible();

  await page.getByRole("button", { name: /^1 Closest even sum/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByText("15% reserve-funded")).toBeVisible();
  await page.getByRole("button", { name: "Close rule details" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Account" }).click();
  await expect(page.getByRole("heading", { name: "My account" })).toBeVisible();
});
