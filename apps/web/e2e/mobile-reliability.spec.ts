import { expect, type Page, test } from "@playwright/test";

const PENDING_ACTION_KEY = "idealer.wallet.pending-action";

type Status =
  | "awaiting_approval"
  | "delayed_confirmation"
  | "duplicate"
  | "failed"
  | "pending_confirmation"
  | "turn_changed";

async function openWithPendingAction(page: Page, status: Status) {
  const now = new Date().toISOString();
  await page.addInitScript(
    ({ key, pendingStatus, timestamp }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          action: "submit_guess",
          createdAt: timestamp,
          errorCode:
            pendingStatus === "failed"
              ? "TRANSACTION_REJECTED"
              : pendingStatus === "turn_changed"
                ? "TURN_CHANGED_AFTER_SIGNATURE"
                : pendingStatus === "duplicate"
                  ? "DUPLICATE_ACTION"
                  : undefined,
          errorMessage:
            pendingStatus === "failed"
              ? "The wallet request was rejected. Nothing was submitted."
              : undefined,
          numbers: [1, 2, 3, 4, 5, 6],
          signature: pendingStatus === "pending_confirmation" ? "5sigPending" : undefined,
          status: pendingStatus,
          turnId: 7,
          updatedAt: timestamp,
          version: 1,
        }),
      );
    },
    { key: PENDING_ACTION_KEY, pendingStatus: status, timestamp: now },
  );
  await page.goto("/play/pick");
}

test("mobile play flow recovers awaiting and pending wallet states", async ({
  page,
}) => {
  await openWithPendingAction(page, "awaiting_approval");

  await expect(page.getByTestId("wallet-action-status")).toContainText(
    "Awaiting wallet approval",
  );

  await page.evaluate((key) => {
    const current = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...current,
        signature: "5sigPending",
        status: "pending_confirmation",
      }),
    );
    window.dispatchEvent(new Event("storage"));
  }, PENDING_ACTION_KEY);

  await expect(page.getByTestId("wallet-action-status")).toContainText(
    "Transaction pending",
  );
  await expect(page.getByText("5sigPending")).toBeVisible();
});

test("mobile play flow shows delayed, rejected, duplicate, and turn-changed outcomes", async ({
  page,
}) => {
  await openWithPendingAction(page, "delayed_confirmation");
  await expect(page.getByTestId("wallet-action-status")).toContainText(
    "Transaction delayed",
  );

  await page.evaluate((key) => {
    const current = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...current,
        errorCode: "TRANSACTION_REJECTED",
        errorMessage: "The wallet request was rejected. Nothing was submitted.",
        status: "failed",
      }),
    );
    window.dispatchEvent(new Event("storage"));
  }, PENDING_ACTION_KEY);

  await expect(page.getByTestId("wallet-action-status")).toContainText(
    "Transaction failed",
  );
  await expect(page.getByText("TRANSACTION_REJECTED")).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry" })).toBeVisible();

  await page.evaluate((key) => {
    const current = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...current,
        errorCode: "DUPLICATE_ACTION",
        errorMessage: "This wallet already has a guess for the current turn.",
        status: "duplicate",
      }),
    );
    window.dispatchEvent(new Event("storage"));
  }, PENDING_ACTION_KEY);

  await expect(page.getByTestId("wallet-action-status")).toContainText(
    "Guess already recorded",
  );

  await page.evaluate((key) => {
    const current = JSON.parse(window.localStorage.getItem(key) ?? "{}");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        ...current,
        errorCode: "TURN_CHANGED_AFTER_SIGNATURE",
        status: "turn_changed",
      }),
    );
    window.dispatchEvent(new Event("storage"));
  }, PENDING_ACTION_KEY);

  await expect(page.getByTestId("wallet-action-status")).toContainText(
    "Round changed during approval",
  );
});
