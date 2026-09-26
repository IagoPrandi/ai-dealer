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

test("round demo walks from picking numbers to the same-draw verdict", async ({ page }) => {
  await page.goto("/");
  const demo = page.locator("#how");

  // Swapping a number out leaves one slot open and blocks the next step.
  await demo.getByRole("button", { name: "Number 7", exact: true }).click();
  await expect(demo.getByRole("button", { name: "1 number left" })).toBeDisabled();
  await demo.getByRole("button", { name: "Number 8", exact: true }).click();

  await demo.getByRole("button", { name: "Write a rule" }).click();
  await demo.getByRole("button", { name: "Submit rule" }).click();
  await expect(demo.getByText("matches(guess, draw) ≥ 4")).toBeVisible();

  await demo.getByRole("button", { name: "Send it to the vote" }).click();
  await expect(demo.getByText("Rule of the Round").first()).toBeVisible();
  await demo.getByRole("button", { name: "▲ Back it" }).nth(1).click();
  await expect(demo.getByText("backed by 132 players")).toBeVisible();

  await demo.getByRole("button", { name: "Go to the draw" }).click();
  await demo.getByRole("button", { name: "Draw", exact: true }).click();
  await expect(demo.getByText("Same draw. Different ways to win.")).toBeVisible();
  await expect(demo.getByText("4 of 6 matched")).toBeVisible();
  await expect(demo.getByRole("link", { name: "Play the real round" })).toHaveAttribute("href", "/play");
});

test("product video plays the real app and chapters seek it", async ({ page }) => {
  await page.goto("/");
  const video = page.locator(".lp-video video");
  await video.scrollIntoViewIfNeeded();
  await expect.poll(() => video.evaluate((element: HTMLVideoElement) => !element.paused)).toBe(true);

  const writeChapter = page.locator(".lp-chapters").getByRole("button", { name: /Write a rule/ });
  await writeChapter.click();
  await expect(writeChapter).toHaveAttribute("aria-current", "step");
  expect(await video.evaluate((element: HTMLVideoElement) => element.currentTime)).toBeGreaterThanOrEqual(2);

  await page.getByRole("button", { name: "Pause video" }).click();
  await expect(page.getByRole("button", { name: "Play video" })).toBeVisible();
  expect(await video.evaluate((element: HTMLVideoElement) => element.paused)).toBe(true);
});
