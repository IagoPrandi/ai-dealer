import { expect, test } from "@playwright/test";

import { mockShellData } from "./helpers/shell";

/**
 * The centre of the bottom nav opens the rule-conversation hub instead of
 * jumping straight into a blank chat. Starting a new conversation is one tap
 * deeper, and closing it returns to the hub rather than to the round.
 */
test("the nav opens My rules, and its + starts a conversation that returns there", async ({
  page,
}) => {
  await mockShellData(page);

  await page.goto("/play");

  await page.getByRole("button", { name: "My rules", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My rules" })).toBeVisible();
  // Without a wallet there is no saved list, but the composer is still reachable.
  await expect(
    page.getByText("Connect to see your conversations"),
  ).toBeVisible();

  await page.getByRole("button", { name: "New conversation" }).click();
  await expect(page.getByLabel("Message", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(page.getByRole("heading", { name: "My rules" })).toBeVisible();
});
