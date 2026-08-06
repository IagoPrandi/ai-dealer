import assert from "node:assert/strict";
import { test } from "node:test";

import {
  describeTxError,
  describeWalletConnectError,
  expireStaleApprovalAction,
  isBlockingWalletAction,
  raceWithAbort,
  releaseActionFromOtherTurn,
  txErrorCode,
  WalletApprovalTimeoutError,
  WALLET_APPROVAL_TIMEOUT_ERROR_CODE,
  WALLET_APPROVAL_TIMEOUT_MS,
  type WalletPendingAction,
} from "./tx.js";

test("transaction plan diagnostics are surfaced from nested client errors", () => {
  const error = new Error(
    "The provided transaction plan failed to execute. See the `transactionPlanResult` attribute for more details. Note that the `cause` property is deprecated, and a future version will not set it.",
  ) as Error & {
    transactionPlanResult: unknown;
  };
  error.transactionPlanResult = {
    error: {
      logs: [
        "Program ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd invoke [1]",
        "AnchorError caused by account: rule_proposal. Error Code: AccountNotInitialized.",
      ],
    },
  };

  assert.equal(txErrorCode(error), "TRANSACTION_FAILED");
  assert.equal(
    describeTxError(error),
    "The transaction could not be completed. Program ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd invoke [1] AnchorError caused by account: rule_proposal. Error Code: AccountNotInitialized.",
  );
});

test("a wallet rejection nested in a transaction plan result is classified as rejected", () => {
  // Mirrors the @solana/client shape observed live: the compiled transaction's
  // account keys sit next to the failed step, whose cause chain carries the
  // wallet's "User rejected the request." error.
  const error = new Error(
    "The provided transaction plan failed to execute. See the `transactionPlanResult` attribute for more details.",
  ) as Error & {
    transactionPlanResult: unknown;
  };
  error.transactionPlanResult = {
    kind: "single",
    message: {
      accountKeys: [
        "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd",
        "ComputeBudget111111111111111111111111111111",
        "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
      ],
      version: "legacy",
    },
    status: {
      error: { cause: new Error("User rejected the request.") },
      kind: "failed",
    },
  };

  assert.equal(txErrorCode(error), "TRANSACTION_REJECTED");
  assert.equal(
    describeTxError(error),
    "The wallet request was rejected. Nothing was submitted.",
  );
});

test("missing game token simulation errors are normalized to round-pass copy", () => {
  const error = new Error("Simulation failed") as Error & {
    transactionPlanResult: unknown;
  };
  error.transactionPlanResult = {
    error: {
      logs: [
        "Program ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd invoke [1]",
        "AnchorError caused by account: game_token. Error Code: AccountNotInitialized.",
      ],
    },
  };

  assert.equal(txErrorCode(error), "ROUND_PASS_NOT_CONFIRMED");
  assert.equal(
    describeTxError(error),
    "Your round pass is not confirmed on devnet yet. Wait for the guess confirmation to finish, then submit again.",
  );
});

test("connect errors surface the connector message or an actionable fallback", () => {
  assert.equal(
    describeWalletConnectError(new Error("User rejected the request.")),
    "The connection request was declined in the wallet. Approve it to connect.",
  );
  assert.equal(
    describeWalletConnectError(
      new Error('Wallet connector "phantom" is not supported in this environment.'),
    ),
    'The wallet connection failed: Wallet connector "phantom" is not supported in this environment.',
  );
  // Connector rejections can be bare objects with no usable text — the console
  // shows "wallet connection failed {}" — never surface "[object Object]".
  assert.equal(
    describeWalletConnectError({}),
    "The wallet connection failed. Unlock your wallet, make sure it is on Solana devnet, and try again.",
  );
});

test("wallet approval timeout errors are normalized", () => {
  const error = new WalletApprovalTimeoutError(120_000);

  assert.equal(txErrorCode(error), WALLET_APPROVAL_TIMEOUT_ERROR_CODE);
  assert.equal(
    describeTxError(error),
    "The wallet approval timed out after 2 minutes. Check your wallet status before retrying.",
  );
});

test("raceWithAbort rejects with the abort reason while the send hangs", async () => {
  const controller = new AbortController();
  const hangingSend = new Promise<never>(() => {});
  const race = raceWithAbort(hangingSend, controller.signal);

  controller.abort(new WalletApprovalTimeoutError(120_000));

  await assert.rejects(race, WalletApprovalTimeoutError);
});

test("raceWithAbort resolves when the send settles before the abort", async () => {
  const controller = new AbortController();

  assert.equal(await raceWithAbort(Promise.resolve("sig"), controller.signal), "sig");
});

test("raceWithAbort throws immediately for an already-aborted signal", async () => {
  const controller = new AbortController();
  controller.abort(new WalletApprovalTimeoutError(120_000));

  await assert.rejects(
    raceWithAbort(new Promise<never>(() => {}), controller.signal),
    WalletApprovalTimeoutError,
  );
});

function pendingApproval(updatedAt: string): WalletPendingAction {
  return {
    action: "submit_guess",
    createdAt: updatedAt,
    status: "awaiting_approval",
    turnId: 7,
    updatedAt,
    version: 1,
  };
}

test("awaiting_approval entries older than the approval timeout expire to failed", () => {
  const nowMs = Date.parse("2026-07-11T12:00:00.000Z");
  const staleAt = new Date(nowMs - WALLET_APPROVAL_TIMEOUT_MS - 60_000).toISOString();

  const expired = expireStaleApprovalAction(pendingApproval(staleAt), nowMs);

  assert.equal(expired.status, "failed");
  assert.equal(expired.errorCode, WALLET_APPROVAL_TIMEOUT_ERROR_CODE);
});

test("awaiting_approval entries within the approval timeout are kept blocking", () => {
  const nowMs = Date.parse("2026-07-11T12:00:00.000Z");
  const recentAt = new Date(nowMs - 30_000).toISOString();

  const action = expireStaleApprovalAction(pendingApproval(recentAt), nowMs);

  assert.equal(action.status, "awaiting_approval");
});

test("pending actions from a previous round are released as turn_changed", () => {
  const action: WalletPendingAction = {
    ...pendingApproval("2026-07-11T11:00:00.000Z"),
    signature: "sig",
    status: "delayed_confirmation",
    turnId: 7,
  };

  const released = releaseActionFromOtherTurn(action, 8);

  assert.equal(released.status, "turn_changed");
  assert.equal(released.errorCode, "TURN_CHANGED");
  assert.equal(isBlockingWalletAction(released), false);
});

test("pending actions for the active round keep blocking", () => {
  const action: WalletPendingAction = {
    ...pendingApproval("2026-07-11T11:00:00.000Z"),
    signature: "sig",
    status: "delayed_confirmation",
    turnId: 8,
  };

  const kept = releaseActionFromOtherTurn(action, 8);

  assert.equal(kept.status, "delayed_confirmation");
  assert.equal(isBlockingWalletAction(kept), true);
});

test("actions are not released before the active round is known", () => {
  const action = pendingApproval("2026-07-11T11:00:00.000Z");

  assert.equal(releaseActionFromOtherTurn(action, 0).status, "awaiting_approval");
});

test("failed actions from a previous round keep their own error copy", () => {
  const action: WalletPendingAction = {
    ...pendingApproval("2026-07-11T11:00:00.000Z"),
    errorCode: "TRANSACTION_FAILED",
    errorMessage: "boom",
    status: "failed",
    turnId: 7,
  };

  assert.equal(releaseActionFromOtherTurn(action, 8).status, "failed");
});

test("non-approval statuses are never expired", () => {
  const nowMs = Date.parse("2026-07-11T12:00:00.000Z");
  const staleAt = new Date(nowMs - WALLET_APPROVAL_TIMEOUT_MS - 60_000).toISOString();
  const action: WalletPendingAction = {
    ...pendingApproval(staleAt),
    signature: "sig",
    status: "pending_confirmation",
  };

  assert.equal(expireStaleApprovalAction(action, nowMs).status, "pending_confirmation");
});
