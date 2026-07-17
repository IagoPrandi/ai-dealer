import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClaimRecordApi } from "../data/types";
import { summarizeRewardClaims } from "./Rewards";

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
