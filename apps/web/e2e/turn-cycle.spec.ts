import { expect, test } from "@playwright/test";

test("simulated turn cycle repeats and exposes accelerated lifecycle states", async ({ page }) => {
  await page.goto("/play/simulate");

  await expect(page.getByText("Step 1/4. Current turn is 2h; next turn is 2h.")).toBeVisible();
  await expect(page.getByText("1h 30m")).toBeVisible();
  await expect(page.getByText("1h 56m")).toBeVisible();
  await page.getByRole("button", { name: "Advance phase" }).click();
  await expect(page.getByRole("heading", { name: "Voting closed" })).toBeVisible();
  await page.getByRole("button", { name: "Reset" }).click();

  await page.getByRole("button", { name: "Next turn" }).click();
  await expect(page.getByText("Step 2/4. Current turn is 2h; next turn is 8h.")).toBeVisible();
  await page.getByRole("button", { name: "Next turn" }).click();
  await expect(page.getByText("Step 3/4. Current turn is 8h; next turn is 8h.")).toBeVisible();
  await page.getByRole("button", { name: "Next turn" }).click();
  await expect(page.getByText("Step 4/4. Current turn is 8h; next turn is 2h.")).toBeVisible();
  await page.getByRole("button", { name: "Next turn" }).click();
  await expect(page.getByText("Step 1/4. Current turn is 2h; next turn is 2h.")).toBeVisible();

  await page.getByRole("button", { name: "Jump to late entry" }).click();
  await expect(page.getByRole("heading", { name: "Guess submission is closed near the draw." })).toBeVisible();

  await page.getByRole("button", { name: "Accelerated simulation" }).click();
  await page.getByRole("button", { name: "Start accelerated run" }).click();
  await expect(page.getByRole("heading", { name: "Draw" })).toBeVisible({ timeout: 4_000 });
});
