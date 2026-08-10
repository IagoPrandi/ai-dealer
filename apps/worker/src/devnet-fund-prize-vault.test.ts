import assert from "node:assert/strict";
import { test } from "node:test";
import {
  calculateVaultShortfall,
  sumOutstandingWinnerClaims,
} from "./devnet-fund-prize-vault.js";

const CLAIM_KIND_WINNER_PAYOUT = 0;
const CLAIM_KIND_CREATOR_REWARD = 1;
const CLAIM_STATE_AVAILABLE = 0;
const CLAIM_STATE_CLAIMED = 1;

function claimAccount({
  amountLamports,
  kind = CLAIM_KIND_WINNER_PAYOUT,
  state = CLAIM_STATE_AVAILABLE,
  turnId,
}: {
  amountLamports: number;
  kind?: number;
  state?: number;
  turnId: number;
}) {
  const data = Buffer.alloc(75);
  data.writeBigUInt64LE(BigInt(turnId), 8);
  data[48] = kind;
  data.writeBigUInt64LE(BigInt(amountLamports), 49);
  data[57] = state;
  return { data };
}

test("outstanding winner claims exclude other turns, kinds, and settled claims", () => {
  const accounts = [
    claimAccount({ amountLamports: 95_000_000, turnId: 50 }),
    claimAccount({ amountLamports: 9_500_000, turnId: 49 }),
    claimAccount({
      amountLamports: 19_000_000,
      state: CLAIM_STATE_CLAIMED,
      turnId: 50,
    }),
    claimAccount({
      amountLamports: 1_000_000,
      kind: CLAIM_KIND_CREATOR_REWARD,
      turnId: 50,
    }),
    { data: Buffer.alloc(25) },
  ];

  assert.deepEqual(sumOutstandingWinnerClaims(accounts, 50), {
    count: 1,
    totalLamports: 95_000_000,
  });
});

test("multiple outstanding winners on the same turn are summed", () => {
  const accounts = [
    claimAccount({ amountLamports: 30_000_000, turnId: 7 }),
    claimAccount({ amountLamports: 12_500_000, turnId: 7 }),
  ];

  assert.deepEqual(sumOutstandingWinnerClaims(accounts, 7), {
    count: 2,
    totalLamports: 42_500_000,
  });
});

test("shortfall is measured against the vault balance above rent exemption", () => {
  // Turn 50 on devnet: 0.095 SOL recorded, 0.06175 SOL spendable.
  assert.deepEqual(
    calculateVaultShortfall({
      outstandingLamports: 95_000_000,
      rentExemptLamports: 1_064_880,
      vaultLamports: 62_814_880,
    }),
    { shortfallLamports: 33_250_000, spendableLamports: 61_750_000 },
  );
});

test("a vault that already covers its claims reports no shortfall", () => {
  assert.deepEqual(
    calculateVaultShortfall({
      outstandingLamports: 9_500_000,
      rentExemptLamports: 1_064_880,
      vaultLamports: 58_064_880,
    }),
    { shortfallLamports: 0, spendableLamports: 57_000_000 },
  );
});

test("rent-exempt lamports are never treated as spendable", () => {
  assert.deepEqual(
    calculateVaultShortfall({
      outstandingLamports: 1_000_000,
      rentExemptLamports: 1_064_880,
      vaultLamports: 1_064_880,
    }),
    { shortfallLamports: 1_000_000, spendableLamports: 0 },
  );
});
