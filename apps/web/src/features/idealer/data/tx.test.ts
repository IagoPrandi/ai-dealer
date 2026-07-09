import assert from "node:assert/strict";
import { test } from "node:test";

import { describeTxError, txErrorCode } from "./tx.js";

test("transaction plan diagnostics are surfaced from nested client errors", () => {
  const error = new Error(
    "The provided transaction plan failed to execute. See the `transactionPlanResult` attribute for more details. Note that the `cause` property is deprecated, and a future version will not set it.",
  ) as Error & {
    transactionPlanResult: unknown;
  };
  error.transactionPlanResult = {
    error: {
      logs: [
        "Program 6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4 invoke [1]",
        "AnchorError caused by account: rule_proposal. Error Code: AccountNotInitialized.",
      ],
    },
  };

  assert.equal(txErrorCode(error), "TRANSACTION_FAILED");
  assert.equal(
    describeTxError(error),
    "The transaction simulation failed before wallet submission. Program 6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4 invoke [1] AnchorError caused by account: rule_proposal. Error Code: AccountNotInitialized.",
  );
});

test("missing game token simulation errors are normalized to round-pass copy", () => {
  const error = new Error("Simulation failed") as Error & {
    transactionPlanResult: unknown;
  };
  error.transactionPlanResult = {
    error: {
      logs: [
        "Program 6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4 invoke [1]",
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
