import { expect, test } from "@playwright/test";

test("claims panel prompts wallet connection and links to next round and history", async ({
  page,
}) => {
  await page.goto("/play/claims");

  // Without a connected wallet the panel asks the player to connect first.
  await expect(
    page.getByRole("heading", { name: "Connect your wallet to see claims" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Connect wallet" }),
  ).toHaveAttribute("href", "/play/wallet");

  // The return section links to the next round and the reward history.
  await expect(
    page.getByRole("link", { name: "Join next round" }),
  ).toHaveAttribute("href", "/play/pick");
  await expect(
    page.getByRole("link", { name: "Reward history" }),
  ).toHaveAttribute("href", "/play/rewards");
});

test("reward history page prompts wallet connection at the canonical wallet URL", async ({
  page,
}) => {
  await page.goto("/play/rewards");

  await expect(
    page.getByRole("heading", { name: "Connect your wallet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Connect wallet" }).click();
  await expect(page).toHaveURL(/\/play\/wallet$/u);
  await expect(
    page.getByRole("heading", { name: "Connect your wallet" }).first(),
  ).toBeVisible();
});
