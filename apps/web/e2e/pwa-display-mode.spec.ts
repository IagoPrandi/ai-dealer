import { expect, test } from "@playwright/test";

test("keeps preview chrome in the browser and keeps standalone PWA mode interactive", async ({
  context,
  page,
}) => {
  await page.goto("/play");

  const dynamicIsland = page.locator(".ide-di");
  const statusBar = page.locator(".ide-statusbar");
  const homeIndicator = page.locator(".ide-homebar");

  await expect(dynamicIsland).toBeVisible();
  await expect(statusBar).toBeVisible();
  await expect(homeIndicator).toBeVisible();
  await expect(page.locator(".ide-scroll").first()).toHaveCSS("padding-top", "52px");

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
  await expect(pwaPage.locator(".ide-phone-shell")).toHaveClass(/ide-standalone/);
  await expect(pwaPage.locator(".ide-di")).toBeHidden();
  await expect(pwaPage.locator(".ide-statusbar")).toBeHidden();
  await expect(pwaPage.locator(".ide-homebar")).toBeHidden();
  await expect(pwaPage.locator(".ide-scroll").first()).toHaveCSS("padding-top", "16px");

  await pwaPage.getByRole("button", { exact: true, name: "Connect" }).click();
  await expect(
    pwaPage.getByRole("heading", { name: "Connect your wallet" }),
  ).toBeVisible();
});
