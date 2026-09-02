import { expect, test } from "@playwright/test";

test("keeps the public shell chrome-free in browser and standalone PWA modes", async ({
  context,
  page,
}) => {
  await page.goto("/play");

  await expect(page.locator(".ide-di")).toHaveCount(0);
  await expect(page.locator(".ide-statusbar")).toHaveCount(0);
  await expect(page.locator(".ide-homebar")).toHaveCount(0);
  await expect(page.locator(".ide-phone-shell")).toHaveCount(0);

  const pwaPage = await context.newPage();
  await pwaPage.addInitScript(() => {
    const browserMatchMedia = window.matchMedia.bind(window);
    window.matchMedia = (query) => {
      if (query !== "(display-mode: standalone)") {
        return browserMatchMedia(query);
      }

      return {
        addEventListener: () => undefined,
        addListener: () => undefined,
        dispatchEvent: () => false,
        matches: true,
        media: query,
        onchange: null,
        removeEventListener: () => undefined,
        removeListener: () => undefined,
      };
    };
  });

  await pwaPage.goto("/play");
  await expect(pwaPage.locator(".ide-di")).toHaveCount(0);
  await expect(pwaPage.locator(".ide-statusbar")).toHaveCount(0);
  await expect(pwaPage.locator(".ide-homebar")).toHaveCount(0);
  await expect(pwaPage.locator(".ide-phone-shell")).toHaveCount(0);

  await pwaPage.getByRole("button", { exact: true, name: "Connect" }).click();
  await expect(pwaPage).toHaveURL(/\/play\/wallet$/);
  await expect(
    pwaPage.getByRole("heading", { name: "Connect your wallet" }),
  ).toBeVisible();
});
