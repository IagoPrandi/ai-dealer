import assert from "node:assert/strict";
import { test } from "node:test";

import type { ClaimRecordApi } from "./types";
import { fmtClaimSol } from "./format";
import {
  isClaimActionable,
  isClaimExpired,
  summarizePlayerClaims,
} from "./claimState";

const NOW = Date.parse("2026-08-10T13:00:00.000Z");

test("claim formatting preserves the live payout precision", () => {
  assert.equal(fmtClaimSol(0.095), "0.095");
  assert.equal(fmtClaimSol(0.1235), "0.1235");
});

function claim(
  overrides: Partial<ClaimRecordApi> &
    Pick<ClaimRecordApi, "claimId" | "kind" | "status">,
): ClaimRecordApi {
  return {
    amountLamports: 95_000_000,
    category: overrides.kind === "winner_payout" ? "alternative" : null,
    statusReason: "TEST",
    turnId: 50,
    ...overrides,
  };
}

test("pending and failed claims remain actionable until their claim window expires", () => {
  const pending = claim({
    claimId: "pending",
    claimWindowExpiresAt: "2026-08-17T03:25:10.066Z",
    kind: "winner_payout",
    status: "pending_wallet_approval",
  });
  const failed = claim({
    claimId: "failed",
    kind: "creator_reward",
    status: "failed",
  });
  const expired = claim({
    claimId: "expired",
    claimWindowExpiresAt: "2026-07-20T18:15:06.262Z",
    kind: "winner_payout",
    status: "pending_wallet_approval",
  });

  assert.equal(isClaimActionable(pending, NOW), true);
  assert.equal(isClaimActionable(failed, NOW), true);
  assert.equal(isClaimExpired(expired, NOW), true);
  assert.equal(isClaimActionable(expired, NOW), false);
});

test("profile totals include every earned prize while claimable totals stay actionable", () => {
  const records = [
    claim({
      amountLamports: 19_000_000,
      claimId: "claimed",
      kind: "winner_payout",
      status: "claimed",
    }),
    claim({
      claimId: "current-pending",
      claimWindowExpiresAt: "2026-08-17T03:25:10.066Z",
      kind: "winner_payout",
      status: "pending_wallet_approval",
    }),
    claim({
      amountLamports: 9_500_000,
      claimId: "expired-pending",
      claimWindowExpiresAt: "2026-07-20T18:15:06.262Z",
      kind: "winner_payout",
      status: "pending_wallet_approval",
    }),
    claim({
      amountLamports: 300_000,
      claimId: "dust-reward",
      kind: "creator_reward",
      status: "unavailable",
    }),
  ];

  const totals = summarizePlayerClaims(records, NOW);
  assert.equal(totals.claimablePrizeLamports, 95_000_000);
  assert.equal(totals.claimableRewardLamports, 0);
  assert.equal(totals.lifetimePrizeLamports, 123_500_000);
  assert.equal(totals.claimedRewardLamports, 0);
  assert.deepEqual(
    totals.actionable.map((record) => record.claimId),
    ["current-pending"],
  );
});
