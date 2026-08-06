import { expect, test } from "@playwright/test";

test("wallet flow exposes mobile handoff and recovers an interrupted action", async ({
  page,
}) => {
  await page.goto("/play/wallet");

  await expect(
    page.getByRole("heading", { name: "Connect your mobile wallet." }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Mobile Wallet Adapter/ }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Phantom" })).toHaveAttribute(
    "href",
    /https:\/\/phantom\.app\/ul\/browse\//,
  );
  await expect(page.getByRole("link", { name: "Backpack" })).toHaveAttribute(
    "href",
    /https:\/\/backpack\.app\/ul\/v1\/browse\//,
  );
  await expect(page.getByRole("link", { name: "Solflare" })).toHaveAttribute(
    "href",
    /https:\/\/solflare\.com\/ul\/v1\/browse\//,
  );

  await page.evaluate(() => {
    window.localStorage.setItem(
      "tyche.wallet.pending-action",
      JSON.stringify({
        action: "devnet_test_transaction",
        createdAt: new Date().toISOString(),
        status: "awaiting_approval",
        version: 1,
      }),
    );
  });
  await page.reload();

  await expect(page.getByText("Awaiting wallet approval")).toBeVisible();
  await expect(
    page.getByText(
      "Recovered the approval step. Retry to request a fresh wallet approval.",
    ),
  ).toBeVisible();

  await page.evaluate(() => {
    window.localStorage.setItem(
      "tyche.wallet.pending-action",
      JSON.stringify({
        action: "devnet_test_transaction",
        createdAt: new Date().toISOString(),
        errorCode: "TRANSACTION_REJECTED",
        errorMessage:
          "The wallet request was rejected. Your DApp state is unchanged.",
        status: "failed",
        version: 1,
      }),
    );
  });
  await page.reload();

  await expect(page.getByText("Transaction failed")).toBeVisible();
  await expect(page.getByText("TRANSACTION_REJECTED")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();
});
