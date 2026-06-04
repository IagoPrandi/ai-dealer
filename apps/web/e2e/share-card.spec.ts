import { expect, test } from "@playwright/test";

test("share card generator switches stories, shares, copies, and tracks intent", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: async () => undefined
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => undefined
      }
    });
  });

  await page.goto("/play/share");

  await expect(page.getByLabel("Active rule share card")).toBeVisible();
  await expect(page.getByText("Five-number lifeline", { exact: true })).toBeVisible();
  await expect(page.getByText("12.48 SOL", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Near miss" }).click();
  await expect(page.getByLabel("Near miss share card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "One number away from winning." })).toBeVisible();

  await page.getByRole("button", { name: "Creator elected" }).click();
  await expect(page.getByLabel("Creator elected share card")).toBeVisible();
  await expect(page.getByRole("heading", { name: "My rule became the Rule of the Hour." })).toBeVisible();

  await page.getByRole("button", { name: "Share card" }).click();
  await expect(page.getByText("Share sheet opened for this story.")).toBeVisible();
  await expect(page.getByText("Native share", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Copy link" }).click();
  await expect(page.getByText("Result link copied.")).toBeVisible();
  await expect(page.getByText("Share intents").locator("..").getByText("2")).toBeVisible();
  await expect(page.getByText("Copied link", { exact: true })).toBeVisible();
});

test("share card falls back to copying when native sharing is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", {
      configurable: true,
      value: undefined
    });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => undefined
      }
    });
  });

  await page.goto("/play/share");
  await page.getByRole("button", { name: "Share card" }).click();

  await expect(page.getByText("Sharing is unavailable. Result link copied.")).toBeVisible();
  await expect(page.getByText("Fallback copy", { exact: true })).toBeVisible();
});
