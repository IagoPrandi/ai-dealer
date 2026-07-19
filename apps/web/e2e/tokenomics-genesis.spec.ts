import { expect, test } from "@playwright/test";

test("JDR genesis route exposes the fixed allocation and fails closed", async ({
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
  ).toBeVisible();
  await expect(
    page.getByText("The approved JDR metadata URI is not configured."),
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
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
});
