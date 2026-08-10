import assert from "node:assert/strict";
import { test } from "node:test";

import { WalletApprovalTimeoutError } from "./tx";
import {
  claimRecordToWallet,
  type ClaimFlowDependencies,
} from "./claimFlow";
import type { ClaimRecordApi } from "./types";

const record: ClaimRecordApi = {
  amountLamports: 95_000_000,
  category: "alternative",
  claimId: "05".repeat(32),
  kind: "winner_payout",
  status: "pending_wallet_approval",
  statusReason: "WALLET_APPROVAL_PENDING",
  turnId: 50,
};

function harness(sendError: Error) {
  const completions: Array<{ status: string }> = [];
  const dependencies = {
    complete: async (body) => {
      completions.push(body);
      return { claim: body };
    },
    createInstruction: async () => ({}) as never,
    request: async () => ({ claim: record }),
    send: async () => {
      throw sendError;
    },
  } as ClaimFlowDependencies;
  return { completions, dependencies };
}

test("a rejected claim is persisted as failed so it can be retried", async () => {
  const { completions, dependencies } = harness(
    new Error("User rejected the request"),
  );
  await assert.rejects(
    claimRecordToWallet({
      client: {} as never,
      dependencies,
      record,
      wallet: {} as never,
      walletAddress: "EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW",
    }),
    /rejected/,
  );
  assert.deepEqual(completions.map(({ status }) => status), ["failed"]);
});

test("an approval timeout remains pending because the wallet request may settle later", async () => {
  const { completions, dependencies } = harness(
    new WalletApprovalTimeoutError(120_000),
  );
  await assert.rejects(
    claimRecordToWallet({
      client: {} as never,
      dependencies,
      record,
      wallet: {} as never,
      walletAddress: "EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW",
    }),
    /timed out/,
  );
  assert.deepEqual(completions, []);
});
