import { expect, test } from "@playwright/test";

test("JDR genesis route exposes the devnet-only empty metadata policy", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });

  await page.goto("/dev/tokenomics/genesis");

  await expect(
    page.getByRole("heading", { name: "Create the fixed JDR supply" }),
  ).toBeVisible();
  await expect(page.getByText("1,000,000,000 JDR · 9 decimals")).toBeVisible();
  await expect(page.getByText("200,000,000 JDR")).toBeVisible();
  await expect(page.getByText("800,000,000 JDR")).toBeVisible();
  await expect(
    page.getByText(
      "Tokenomics Core still uses the non-deployable placeholder program ID.",
    ),
  ).toHaveCount(0);
  await expect(
    page.getByText(
      "Tokenomics Core identity BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm is fixed for devnet.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText(
      "The devnet Metadata account may use an empty URI. A durable HTTPS URI, content review, and separate metadata-governance decision remain mandatory before mainnet.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Prepare JDR genesis" }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
});

test("JDR genesis route has no horizontal overflow at 320px", async ({
  page,
}) => {
  await page.setViewportSize({ height: 800, width: 320 });
  await page.goto("/dev/tokenomics/genesis");
  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    shellClientWidth:
      document.querySelector<HTMLElement>(".tm-shell")?.clientWidth ?? 0,
    shellScrollWidth:
      document.querySelector<HTMLElement>(".tm-shell")?.scrollWidth ?? 0,
    widestRightEdge: Math.max(
      ...Array.from(
        document.querySelectorAll<HTMLElement>(".tm-hero, .tm-card"),
      ).map((element) => element.getBoundingClientRect().right),
    ),
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  expect(dimensions.shellScrollWidth).toBeLessThanOrEqual(
    dimensions.shellClientWidth,
  );
  expect(dimensions.widestRightEdge).toBeLessThanOrEqual(
    dimensions.clientWidth,
  );
});
