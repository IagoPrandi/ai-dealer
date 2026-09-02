import { expect, test } from "@playwright/test";

test("share screen uses native sharing and copies the canonical public round link", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: async () => undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });

  await page.goto("/play/share");
  await expect(page.getByRole("heading", { name: "Share" })).toBeVisible();
  await expect(page.getByText("Live round", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Share round" }).click();
  await page.getByRole("button", { name: "Copy public link" }).click();
  await expect(page.getByText("Round link copied.")).toBeVisible();
});

test("share screen falls back to copying when native sharing is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => undefined },
    });
  });

  await page.goto("/play/share");
  await page.getByRole("button", { name: "Share round" }).click();
  await expect(page.getByText("Share text copied.")).toBeVisible();
});
