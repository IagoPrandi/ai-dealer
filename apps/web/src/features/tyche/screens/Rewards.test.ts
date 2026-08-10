import assert from "node:assert/strict";
import { test } from "node:test";

import { formatTokenAtoms } from "../data/format";
import type { ClaimRecordApi } from "../data/types";
import {
  formatLamportString,
  getTreasuryClaimMinimumMessage,
  parseTokenAmountToAtoms,
  summarizeRewardClaims,
  type JdrStateSnapshot,
  waitForExpectedJdrState,
} from "./Rewards";

const records: ClaimRecordApi[] = [
  {
    amountLamports: 250_000_000,
    category: null,
    claimId: "claimed",
    kind: "creator_reward",
    status: "claimed",
    statusReason: "CLAIMED",
    turnId: 6,
  },
  {
    amountLamports: 920_000_000,
    category: "alternative",
    claimId: "available",
    kind: "winner_payout",
    status: "available",
    statusReason: "READY",
    turnId: 7,
  },
  {
    amountLamports: 60_000_000,
    category: null,
    claimId: "pending",
    kind: "voter_reward",
    status: "pending_wallet_approval",
    statusReason: "PENDING",
    turnId: 7,
  },
];

test("rewards summary uses only real claim statuses and sorts newest turns first", () => {
  const summary = summarizeRewardClaims(records);

  assert.equal(summary.availableSol, 0.92);
  assert.equal(summary.claimedSol, 0.25);
  assert.equal(summary.notificationCount, 2);
  assert.deepEqual(summary.records.map((record) => record.claimId), ["available", "pending", "claimed"]);
});

test("token and SOL formatting stays exact above Number safe integer range", () => {
  assert.equal(parseTokenAmountToAtoms("1.000000001"), 1_000_000_001n);
  assert.equal(formatTokenAtoms("1000000001"), "1.000000001");
  assert.equal(
    formatLamportString("9007199254740993000"),
    "9007199254.740993",
  );
  assert.throws(() => parseTokenAmountToAtoms("1.0000000001"), /up to 9/);
});

test("the minimum treasury claim notice appears only for an attempted amount below the threshold", () => {
  assert.equal(getTreasuryClaimMinimumMessage(null), null);
  assert.match(
    getTreasuryClaimMinimumMessage("4999999") ?? "",
    /At least 0\.005 SOL/,
  );
  assert.equal(getTreasuryClaimMinimumMessage("5000000"), null);
});

function jdrSnapshot(
  balanceAtoms: string,
  lockedAtoms: string,
): JdrStateSnapshot {
  return {
    balance: { atoms: balanceAtoms },
    position: { lockedAtoms },
  } as JdrStateSnapshot;
}

test("confirmed JDR state retries stale RPC reads before updating the UI", async () => {
  let reads = 0;
  const snapshots = [
    jdrSnapshot("3220000000", "0"),
    jdrSnapshot("3220000000", "0"),
    jdrSnapshot("0", "3220000000"),
  ];

  const result = await waitForExpectedJdrState({
    attempts: snapshots.length,
    expectedBalanceAtoms: "0",
    expectedLockedAtoms: "3220000000",
    read: async () => snapshots[reads++]!,
    wait: async () => {},
  });

  assert.equal(reads, 3);
  assert.equal(result.balance.atoms, "0");
  assert.equal(result.position.lockedAtoms, "3220000000");
});

test("confirmed JDR state reports when the RPC never catches up", async () => {
  await assert.rejects(
    waitForExpectedJdrState({
      attempts: 2,
      expectedBalanceAtoms: "0",
      expectedLockedAtoms: "3220000000",
      read: async () => jdrSnapshot("3220000000", "0"),
      wait: async () => {},
    }),
    /not visible through RPC/,
  );
});
