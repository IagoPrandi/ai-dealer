import assert from "node:assert/strict";
import { test } from "node:test";
import { AccountRole, address, getAddressEncoder } from "@solana/kit";
import {
  createExpireClaimInstruction,
  createSweepPrizeRolloverInstruction,
  decodePrizeVaultAccount,
  fetchRolloverAttribution,
  isPrizeVaultSweepable,
  selectExpirableClaims,
  splitRolloverLamports,
} from "./turn-automation.js";

const addressEncoder = getAddressEncoder();
const PROGRAM_ID = address("ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd");
const AUTHORITY = address("4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH");
const SWEEP_PRIZE_ROLLOVER_DISCRIMINATOR = [149, 162, 64, 17, 170, 54, 213, 248];

function prizeVaultAccount({
  totalCollectedLamports,
  turnId,
}: {
  totalCollectedLamports: bigint;
  turnId: number;
}) {
  const data = new Uint8Array(25);
  const view = new DataView(data.buffer);
  data.set([1, 2, 3, 4, 5, 6, 7, 8], 0);
  view.setBigUint64(8, BigInt(turnId), true);
  view.setBigUint64(16, totalCollectedLamports, true);
  data[24] = 254;
  return data;
}

test("prize vault decoder exposes the unreserved balance", () => {
  assert.deepEqual(
    decodePrizeVaultAccount(
      prizeVaultAccount({ totalCollectedLamports: 61_750_000n, turnId: 50 }),
    ),
    { totalCollectedLamports: 61_750_000n, turnId: 50 },
  );
});

test("prize vault decoder rejects an unexpected account length", () => {
  assert.throws(
    () => decodePrizeVaultAccount(new Uint8Array(24)),
    /unexpected length 24/,
  );
});

test("rollover split scales the API attribution onto the on-chain total", () => {
  // The API attributed 3:1 to the original bucket; the vault actually holds
  // more than the API recorded, and the halves must still sum to the total.
  const split = splitRolloverLamports({
    alternativeShare: 10_000_000,
    originalShare: 30_000_000,
    totalLamports: 50_000_000n,
  });

  assert.deepEqual(split, {
    alternativeLamports: 12_500_000n,
    originalLamports: 37_500_000n,
  });
  assert.equal(split.originalLamports + split.alternativeLamports, 50_000_000n);
});

test("rollover split falls back to an even split with no attribution", () => {
  assert.deepEqual(
    splitRolloverLamports({
      alternativeShare: 0,
      originalShare: 0,
      totalLamports: 9_500_001n,
    }),
    { alternativeLamports: 4_750_001n, originalLamports: 4_750_000n },
  );
});

test("rollover split of an empty vault carries nothing", () => {
  assert.deepEqual(
    splitRolloverLamports({
      alternativeShare: 5,
      originalShare: 5,
      totalLamports: 0n,
    }),
    { alternativeLamports: 0n, originalLamports: 0n },
  );
});

test("an odd total never loses a lamport to rounding", () => {
  const split = splitRolloverLamports({
    alternativeShare: 1,
    originalShare: 2,
    totalLamports: 100n,
  });

  assert.equal(split.originalLamports + split.alternativeLamports, 100n);
});

test("sweep instruction carries the declared split and only writable vaults", async () => {
  const instruction = await createSweepPrizeRolloverInstruction({
    alternativeLamports: 12_500_000n,
    authority: AUTHORITY,
    destinationTurnId: 51,
    originalLamports: 37_500_000n,
    programId: PROGRAM_ID,
    sourceTurnId: 50,
  });

  assert.equal(instruction.programAddress, PROGRAM_ID);
  assert.deepEqual(
    Array.from(instruction.data.slice(0, 8)),
    SWEEP_PRIZE_ROLLOVER_DISCRIMINATOR,
  );
  const view = new DataView(
    instruction.data.buffer,
    instruction.data.byteOffset,
    instruction.data.byteLength,
  );
  assert.equal(view.getBigUint64(8, true), 50n);
  assert.equal(view.getBigUint64(16, true), 51n);
  assert.equal(view.getBigUint64(24, true), 37_500_000n);
  assert.equal(view.getBigUint64(32, true), 12_500_000n);

  assert.equal(instruction.accounts[0]?.address, AUTHORITY);
  assert.equal(instruction.accounts[0]?.role, AccountRole.WRITABLE_SIGNER);
  // The source turn state is read-only; only the vaults and the destination
  // turn (whose rollover fields accumulate) may be written.
  assert.equal(instruction.accounts[2]?.role, AccountRole.READONLY);
  assert.equal(instruction.accounts[3]?.role, AccountRole.WRITABLE);
  assert.equal(instruction.accounts[4]?.role, AccountRole.WRITABLE);
  assert.equal(instruction.accounts[5]?.role, AccountRole.WRITABLE);
  assert.equal(instruction.accounts.length, 6);
  // Every account address is a real 32-byte Solana address.
  for (const account of instruction.accounts) {
    assert.equal(addressEncoder.encode(account.address).length, 32);
  }
});

test("a vault whose free lamports are all unreserved is sweepable", () => {
  assert.equal(
    isPrizeVaultSweepable({
      freeLamports: 61_750_000n,
      totalCollectedLamports: 61_750_000n,
    }),
    true,
  );
});

test("a vault still owing a recorded payout is not sweepable", () => {
  // Turn 50 after its top-up: 0.095 SOL sits in the vault but 0.06175 SOL is
  // all the unreserved counter claims, so the rest belongs to the winner.
  assert.equal(
    isPrizeVaultSweepable({
      freeLamports: 95_000_000n,
      totalCollectedLamports: 61_750_000n,
    }),
    false,
  );
});

test("a drained vault is trivially sweepable and moves nothing", () => {
  assert.equal(
    isPrizeVaultSweepable({ freeLamports: 0n, totalCollectedLamports: 0n }),
    true,
  );
});

const CLAIMANT = address("BUo2vYwYvj2UWYFgryrMF7bBTrLQQFYVU6xHuoTJbJBD");
const EXPIRE_CLAIM_DISCRIMINATOR = [176, 78, 241, 29, 159, 81, 26, 6];
const DAY_SECONDS = 24 * 60 * 60;

function claimAccount({
  amountLamports = 9_500_000,
  claimant = CLAIMANT,
  kind = 0,
  recordedAt,
  state = 0,
  turnId,
}: {
  amountLamports?: number;
  claimant?: ReturnType<typeof address>;
  kind?: number;
  recordedAt: number;
  state?: number;
  turnId: number;
}) {
  const data = new Uint8Array(75);
  const view = new DataView(data.buffer);
  view.setBigUint64(8, BigInt(turnId), true);
  data.set(addressEncoder.encode(claimant), 16);
  data[48] = kind;
  view.setBigUint64(49, BigInt(amountLamports), true);
  data[57] = state;
  view.setBigInt64(58, BigInt(recordedAt), true);
  return { data };
}

test("a payout inside its claim window is never selected for expiry", () => {
  const recordedAt = 1_800_000_000;
  assert.deepEqual(
    selectExpirableClaims({
      accounts: [claimAccount({ recordedAt, turnId: 50 })],
      currentTurnId: 51,
      nowSeconds: recordedAt + 6 * DAY_SECONDS,
      turnId: 50,
    }),
    [],
  );
});

test("either window bound expires a payout, whichever comes first", () => {
  const recordedAt = 1_800_000_000;
  // Seven days elapsed, only one turn later.
  assert.deepEqual(
    selectExpirableClaims({
      accounts: [claimAccount({ recordedAt, turnId: 50 })],
      currentTurnId: 51,
      nowSeconds: recordedAt + 7 * DAY_SECONDS,
      turnId: 50,
    }),
    [{ amountLamports: 9_500_000n, claimant: CLAIMANT }],
  );
  // Twelve turns later, only minutes elapsed.
  assert.deepEqual(
    selectExpirableClaims({
      accounts: [claimAccount({ recordedAt, turnId: 50 })],
      currentTurnId: 62,
      nowSeconds: recordedAt + 600,
      turnId: 50,
    }),
    [{ amountLamports: 9_500_000n, claimant: CLAIMANT }],
  );
});

test("expiry selection skips other turns, kinds, and already-settled claims", () => {
  const recordedAt = 1_800_000_000;
  const nowSeconds = recordedAt + 30 * DAY_SECONDS;
  assert.deepEqual(
    selectExpirableClaims({
      accounts: [
        claimAccount({ recordedAt, turnId: 49 }),
        claimAccount({ kind: 1, recordedAt, turnId: 50 }),
        claimAccount({ recordedAt, state: 1, turnId: 50 }),
        claimAccount({ recordedAt, state: 2, turnId: 50 }),
        { data: new Uint8Array(25) },
      ],
      currentTurnId: 80,
      nowSeconds,
      turnId: 50,
    }),
    [],
  );
});

test("expire instruction targets the claim and its turn vault", async () => {
  const instruction = await createExpireClaimInstruction({
    authority: AUTHORITY,
    claimant: CLAIMANT,
    programId: PROGRAM_ID,
    turnId: 50,
  });

  assert.deepEqual(
    Array.from(instruction.data.slice(0, 8)),
    EXPIRE_CLAIM_DISCRIMINATOR,
  );
  const view = new DataView(
    instruction.data.buffer,
    instruction.data.byteOffset,
    instruction.data.byteLength,
  );
  assert.equal(view.getBigUint64(8, true), 50n);
  assert.deepEqual(
    Array.from(instruction.data.slice(16, 48)),
    Array.from(addressEncoder.encode(CLAIMANT)),
  );
  assert.equal(instruction.data.length, 48);
  assert.equal(instruction.accounts.length, 4);
  assert.equal(instruction.accounts[0]?.address, AUTHORITY);
  assert.equal(instruction.accounts[0]?.role, AccountRole.WRITABLE_SIGNER);
  assert.equal(instruction.accounts[2]?.role, AccountRole.WRITABLE);
  assert.equal(instruction.accounts[3]?.role, AccountRole.WRITABLE);
});

test("rollover attribution reads the API record", async () => {
  const attribution = await fetchRolloverAttribution(
    51,
    "http://api.test",
    (async (input: URL) => {
      assert.equal(input.searchParams.get("turnId"), "51");
      return {
        json: async () => ({
          rollover: {
            alternativeRolloverLamports: 4_000_000,
            originalRolloverLamports: 6_000_000,
          },
        }),
        ok: true,
      };
    }) as unknown as typeof fetch,
  );

  assert.deepEqual(attribution, {
    alternativeShare: 4_000_000,
    originalShare: 6_000_000,
  });
});

test("a missing rollover record is not an error and yields no attribution", async () => {
  const attribution = await fetchRolloverAttribution(
    51,
    "http://api.test",
    (async () => ({ json: async () => ({ rollover: null }), ok: true })) as unknown as typeof fetch,
  );

  assert.deepEqual(attribution, { alternativeShare: 0, originalShare: 0 });
});

test("rollover attribution fails closed on an API error", async () => {
  await assert.rejects(
    fetchRolloverAttribution(
      51,
      "http://api.test",
      (async () => ({ json: async () => ({}), ok: false, status: 500 })) as unknown as typeof fetch,
    ),
    /HTTP 500/,
  );
});
