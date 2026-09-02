import { expect, test } from "@playwright/test";

const wallet = "4bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTH";

test("legacy round URL permanently redirects to the public round", async ({ page }) => {
  await page.goto("/round/42");
  await expect(page).toHaveURL(/\/rounds\/42$/u);
  await expect(page.getByRole("heading", { name: "Round settled" })).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "All six drawn numbers" }),
  ).toBeVisible();
  await expect(page.locator(".public-numbers li")).toHaveCount(6);
});

test("public archive, rule, player, leaderboard, and audit deep links render", async ({ page }) => {
  const cases = [
    ["/rounds", "Every round"],
    ["/rules", "Community rules"],
    ["/rules/42/1", "All six drawn numbers"],
    [`/players/${wallet}`, "4bYqf3…McXyTH"],
    ["/leaderboard", "Leaderboard"],
    ["/audit/42", "Audit chain"],
  ] as const;

  for (const [path, heading] of cases) {
    await page.goto(path);
    await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
    await expect(page.locator("[data-nextjs-dialog]")).toHaveCount(0);
  }
});

test("game navigation keeps the URL and browser history in sync", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  await page.goto("/play");
  await expect(page.locator(".ide-di, .ide-statusbar, .ide-homebar")).toHaveCount(0);
  await page.getByRole("button", { name: "Rules", exact: true }).click();
  await expect(page).toHaveURL(/\/play\/rules$/u);
  await page.goBack();
  await expect(page).toHaveURL(/\/play$/u);
  await page.goto("/play/results");
  await expect(page).toHaveURL(/\/play\/claims$/u);
  expect(consoleErrors).toEqual([]);
});

test("game deep links render the guess, vote, proposal, wallet, and account surfaces", async ({
  page,
}) => {
  const cases = [
    ["/play/pick", "Make a guess"],
    ["/play/rules", "Rules"],
    ["/play/propose", "Message"],
    ["/play/wallet", "Connect your wallet"],
    ["/play/account", "Your wallet"],
    ["/play/claims", "Connect your wallet to see claims"],
    ["/play/share", "Share"],
  ] as const;

  for (const [path, accessibleName] of cases) {
    await page.goto(path);
    const surface =
      path === "/play/propose"
        ? page.getByRole("textbox", { name: accessibleName })
        : page.getByRole("heading", { name: accessibleName }).first();
    await expect(surface).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path.replaceAll("/", "\\/")}$`, "u"));
  }
});

test("public round publishes dynamic metadata and crawl endpoints", async ({
  page,
  request,
}) => {
  await page.goto("/rounds/42");
  await expect(page).toHaveTitle(/Turn 42 \| Tywish/u);
  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    "content",
    /turn 42/iu,
  );

  const robots = await request.get("/robots.txt");
  const sitemap = await request.get("/sitemap.xml");
  expect(robots.ok()).toBe(true);
  expect(await robots.text()).toContain("Sitemap:");
  expect(sitemap.ok()).toBe(true);
  expect(await sitemap.text()).toContain("/leaderboard");
});

for (const width of [320, 390, 768, 1024, 1440]) {
  test(`public round has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ height: width < 700 ? 844 : 900, width });
    await page.goto("/rounds/42");
    await expect(page.getByRole("heading", { name: "Round settled" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });

  test(`game shell has no horizontal overflow at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ height: width < 700 ? 844 : 900, width });
    await page.goto("/play/pick");
    await expect(page.getByRole("heading", { name: "Make a guess" })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(1);

    const luckyPick = page.getByRole("button", { name: /Lucky pick/u });
    const box = await luckyPick.boundingBox();
    expect(box?.height ?? 0).toBeGreaterThanOrEqual(44);
  });
}
