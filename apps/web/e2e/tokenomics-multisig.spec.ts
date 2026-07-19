import { expect, test } from "@playwright/test";

test.describe("devnet tokenomics multisig ceremony", () => {
  test("renders the exact 2-of-3 configuration and blocks writes without Phantom", async ({
    page,
  }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    await page.goto("/dev/tokenomics/multisig");

    await expect(
      page.getByRole("heading", {
        name: "Create the 2-of-3 governance multisig",
      }),
    ).toBeVisible();
    await expect(page.getByText("Devnet only", { exact: true })).toBeVisible();
    await expect(page.getByText("Threshold 2", { exact: true })).toBeVisible();
    await expect(page.getByText("Time lock 0s", { exact: true })).toBeVisible();

    for (const address of [
      "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
      "EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW",
      "7E3DMct5umGMA4mSeAr1UcJUFSd5kd444rK39G8GTC9p",
    ]) {
      await expect(page.getByText(address, { exact: true })).toBeVisible();
    }

    await expect(
      page.getByRole("button", { name: "Prepare creation" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", {
        name: "Sign in Phantom, simulate, and create",
      }),
    ).toHaveCount(0);

    expect(consoleErrors).toEqual([]);
  });

  test("fits a narrow mobile viewport without horizontal overflow", async ({
    page,
  }) => {
    await page.setViewportSize({ height: 800, width: 320 });
    await page.goto("/dev/tokenomics/multisig");

    const dimensions = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
    }));

    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  });
});
