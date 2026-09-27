import { expect, test } from "@playwright/test";

test("landing page leads with the hero and sends Play now to the live round", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/$/u);
  await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Break the bad luck. Make your rules.");
  await expect(page.getByText("A game where the players hold the pen")).toHaveCount(0);
  await expect(page.getByText("The house always wins")).toHaveCount(0);
  await expect(page.getByText("Watch a round happen")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Play now" }).first()).toHaveAttribute("href", "/play");

  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBe(0);
});

test("product video replaces the walkthrough and chapters seek it", async ({ page }) => {
  await page.goto("/");
  const walkthrough = page.locator("#how");
  const video = walkthrough.locator(".lp-video video");
  await expect(walkthrough.locator(".lp-video")).toHaveCount(1);
  await expect(walkthrough.locator(".lp-demo")).toHaveCount(0);
  await expect(page.locator(".lp-hero .lp-video")).toHaveCount(0);
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused)).toBe(true);

  const writeChapter = walkthrough.locator(".lp-chapters").getByRole("button", { name: /Write a rule/ });
  await writeChapter.click();
  await expect(writeChapter).toHaveAttribute("aria-current", "step");
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(2);

  await walkthrough.getByRole("button", { name: "Pause video" }).click();
  await expect(walkthrough.getByRole("button", { name: "Play video" })).toBeVisible();
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
});
