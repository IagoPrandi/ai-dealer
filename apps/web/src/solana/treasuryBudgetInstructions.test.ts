import assert from "node:assert/strict";
import test from "node:test";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  ACTIVATE_SPENDING_LIMIT_DISCRIMINATOR,
  CANCEL_SPENDING_LIMIT_DISCRIMINATOR,
  SCHEDULE_TREASURY_OPERATION_DISCRIMINATOR,
  SPEND_WITHIN_LIMIT_DISCRIMINATOR,
  createActivateTreasuryBudgetInstruction,
  createCancelTreasuryBudgetInstruction,
  createScheduleTreasuryBudgetInstruction,
  createSpendWithinTreasuryBudgetInstruction,
  parseSolToLamports,
  spendingLimitHash,
} from "./treasuryBudgetInstructions";

const budget = {
  destination: SQUADS_DEVNET_CONFIG.members[1]!.address,
  limitId: 7n,
  maxLamports: 1_234_567_890n,
  operator: SQUADS_DEVNET_CONFIG.members[0]!.address,
  periodSeconds: 2_592_000n,
};
const account = SQUADS_DEVNET_CONFIG.members[2]!.address;

test("matches the canonical spending-limit hash vector", async () => {
  assert.equal(
    (await spendingLimitHash(budget)).toString("hex"),
    "50fa5d02095640665484411610f030df46f23307ccd5444f3bbd01f9d5a96fa3",
  );
});

test("serializes the governed schedule and activation instructions", async () => {
  const schedule = await createScheduleTreasuryBudgetInstruction({
    budget,
    executor: account,
    governance: SQUADS_DEVNET_CONFIG.vaultAddress,
    operation: account,
    tokenConfig: account,
  });
  const activate = createActivateTreasuryBudgetInstruction({
    budget,
    governance: SQUADS_DEVNET_CONFIG.vaultAddress,
    operation: account,
    spendingLimit: account,
    tokenConfig: account,
  });

  assert.equal(schedule.data.length, 89);
  assert.deepEqual(schedule.data.subarray(0, 8), SCHEDULE_TREASURY_OPERATION_DISCRIMINATOR);
  assert.equal(schedule.data.readBigUInt64LE(8), budget.limitId);
  assert.equal(schedule.data.readUInt8(16), 0);
  assert.equal(schedule.data.readBigUInt64LE(49), budget.maxLamports);
  assert.equal(schedule.keys[0]?.isSigner, true);
  assert.equal(schedule.keys[0]?.isWritable, true);

  assert.equal(activate.data.length, 96);
  assert.deepEqual(activate.data.subarray(0, 8), ACTIVATE_SPENDING_LIMIT_DISCRIMINATOR);
  assert.equal(activate.data.readBigUInt64LE(8), budget.limitId);
  assert.equal(activate.data.readBigUInt64LE(80), budget.maxLamports);
  assert.equal(activate.data.readBigInt64LE(88), budget.periodSeconds);
});

test("serializes destination-bound spend and governed cancellation", () => {
  const spend = createSpendWithinTreasuryBudgetInstruction({
    amountLamports: 500_000_000n,
    destination: budget.destination,
    operator: budget.operator,
    spendingLimit: account,
    tokenConfig: account,
    treasurySolVault: account,
  });
  const reasonHash = Buffer.alloc(32, 9);
  const cancel = createCancelTreasuryBudgetInstruction({
    governance: SQUADS_DEVNET_CONFIG.vaultAddress,
    reasonHash,
    spendingLimit: account,
    tokenConfig: account,
  });

  assert.deepEqual(spend.data.subarray(0, 8), SPEND_WITHIN_LIMIT_DISCRIMINATOR);
  assert.equal(spend.data.readBigUInt64LE(8), 500_000_000n);
  assert.equal(spend.keys[0]?.isSigner, true);
  assert.equal(spend.keys[4]?.pubkey.toBase58(), budget.destination);
  assert.deepEqual(cancel.data.subarray(0, 8), CANCEL_SPENDING_LIMIT_DISCRIMINATOR);
  assert.deepEqual(cancel.data.subarray(8), reasonHash);
  assert.equal(cancel.keys[0]?.isSigner, true);
});

test("parses exact SOL values and rejects unsafe input", () => {
  assert.equal(parseSolToLamports("1"), 1_000_000_000n);
  assert.equal(parseSolToLamports("0.000000001"), 1n);
  assert.equal(parseSolToLamports("12.3456"), 12_345_600_000n);
  assert.throws(() => parseSolToLamports("0"), /outside the supported range/);
  assert.throws(() => parseSolToLamports("1.0000000001"), /up to nine decimals/);
  assert.throws(
    () => createCancelTreasuryBudgetInstruction({
      governance: SQUADS_DEVNET_CONFIG.vaultAddress,
      reasonHash: Buffer.alloc(32),
      spendingLimit: account,
      tokenConfig: account,
    }),
    /non-zero 32-byte reason hash/,
  );
});
