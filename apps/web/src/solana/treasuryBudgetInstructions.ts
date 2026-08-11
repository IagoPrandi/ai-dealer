import { PublicKey, SystemProgram, TransactionInstruction } from "@solana/web3.js";

import { TOKENOMICS_GENESIS_CONFIG } from "./tokenomicsGenesisConfig";

export const SCHEDULE_TREASURY_OPERATION_DISCRIMINATOR = Buffer.from([
  69, 191, 60, 79, 215, 247, 90, 90,
]);
export const ACTIVATE_SPENDING_LIMIT_DISCRIMINATOR = Buffer.from([
  221, 127, 203, 17, 163, 6, 236, 166,
]);
export const SPEND_WITHIN_LIMIT_DISCRIMINATOR = Buffer.from([
  48, 34, 82, 224, 9, 223, 81, 183,
]);
export const CANCEL_SPENDING_LIMIT_DISCRIMINATOR = Buffer.from([
  2, 88, 21, 20, 26, 157, 136, 212,
]);

const U64_MAX = 0xffff_ffff_ffff_ffffn;
const I64_MAX = 0x7fff_ffff_ffff_ffffn;
const SPENDING_LIMIT_HASH_DOMAIN = Buffer.from(
  "idealer:treasury-spending-limit:v1",
  "utf8",
);

export interface TreasuryBudgetDefinition {
  destination: string;
  limitId: bigint;
  maxLamports: bigint;
  operator: string;
  periodSeconds: bigint;
}

function u64Le(value: bigint, field: string) {
  if (value < 0n || value > U64_MAX) {
    throw new Error(`${field} must fit an unsigned 64-bit integer.`);
  }
  const output = Buffer.alloc(8);
  output.writeBigUInt64LE(value);
  return output;
}

function i64Le(value: bigint, field: string) {
  if (value <= 0n || value > I64_MAX) {
    throw new Error(`${field} must be a positive signed 64-bit integer.`);
  }
  const output = Buffer.alloc(8);
  output.writeBigInt64LE(value);
  return output;
}

function requirePublicKey(value: string, field: string) {
  let key: PublicKey;
  try {
    key = new PublicKey(value);
  } catch {
    throw new Error(`${field} must be a valid Solana address.`);
  }
  if (key.equals(PublicKey.default)) {
    throw new Error(`${field} cannot be the default Solana address.`);
  }
  return key;
}

function concat(...values: readonly Uint8Array[]) {
  return Buffer.concat(values.map((value) => Buffer.from(value)));
}

export async function spendingLimitHash(
  budget: TreasuryBudgetDefinition,
): Promise<Buffer> {
  const operator = requirePublicKey(budget.operator, "Operator");
  const destination = requirePublicKey(budget.destination, "Destination");
  const preimage = concat(
    SPENDING_LIMIT_HASH_DOMAIN,
    u64Le(budget.limitId, "Limit id"),
    operator.toBuffer(),
    destination.toBuffer(),
    u64Le(budget.maxLamports, "Maximum amount"),
    i64Le(budget.periodSeconds, "Period"),
  );
  const digest = await globalThis.crypto.subtle.digest("SHA-256", preimage);
  return Buffer.from(digest);
}

export async function createScheduleTreasuryBudgetInstruction({
  budget,
  executor,
  governance,
  operation,
  tokenConfig,
}: {
  budget: TreasuryBudgetDefinition;
  executor: string;
  governance: string;
  operation: string;
  tokenConfig: string;
}) {
  const purposeHash = await spendingLimitHash(budget);
  return new TransactionInstruction({
    programId: new PublicKey(TOKENOMICS_GENESIS_CONFIG.programId),
    keys: [
      { pubkey: requirePublicKey(governance, "Governance"), isSigner: true, isWritable: true },
      { pubkey: requirePublicKey(tokenConfig, "Token config"), isSigner: false, isWritable: false },
      { pubkey: requirePublicKey(executor, "Treasury executor"), isSigner: false, isWritable: true },
      { pubkey: requirePublicKey(operation, "Treasury operation"), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(
      SCHEDULE_TREASURY_OPERATION_DISCRIMINATOR,
      u64Le(budget.limitId, "Operation id"),
      Buffer.from([0]),
      requirePublicKey(budget.destination, "Destination").toBuffer(),
      u64Le(budget.maxLamports, "Maximum amount"),
      purposeHash,
    ),
  });
}

export function createActivateTreasuryBudgetInstruction({
  budget,
  governance,
  operation,
  spendingLimit,
  tokenConfig,
}: {
  budget: TreasuryBudgetDefinition;
  governance: string;
  operation: string;
  spendingLimit: string;
  tokenConfig: string;
}) {
  return new TransactionInstruction({
    programId: new PublicKey(TOKENOMICS_GENESIS_CONFIG.programId),
    keys: [
      { pubkey: requirePublicKey(governance, "Governance"), isSigner: true, isWritable: true },
      { pubkey: requirePublicKey(tokenConfig, "Token config"), isSigner: false, isWritable: false },
      { pubkey: requirePublicKey(operation, "Treasury operation"), isSigner: false, isWritable: true },
      { pubkey: requirePublicKey(spendingLimit, "Spending limit"), isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: concat(
      ACTIVATE_SPENDING_LIMIT_DISCRIMINATOR,
      u64Le(budget.limitId, "Limit id"),
      requirePublicKey(budget.operator, "Operator").toBuffer(),
      requirePublicKey(budget.destination, "Destination").toBuffer(),
      u64Le(budget.maxLamports, "Maximum amount"),
      i64Le(budget.periodSeconds, "Period"),
    ),
  });
}

export function createSpendWithinTreasuryBudgetInstruction({
  amountLamports,
  destination,
  operator,
  spendingLimit,
  tokenConfig,
  treasurySolVault,
}: {
  amountLamports: bigint;
  destination: string;
  operator: string;
  spendingLimit: string;
  tokenConfig: string;
  treasurySolVault: string;
}) {
  if (amountLamports <= 0n) {
    throw new Error("Transfer amount must be greater than zero.");
  }
  return new TransactionInstruction({
    programId: new PublicKey(TOKENOMICS_GENESIS_CONFIG.programId),
    keys: [
      { pubkey: requirePublicKey(operator, "Operator"), isSigner: true, isWritable: false },
      { pubkey: requirePublicKey(tokenConfig, "Token config"), isSigner: false, isWritable: false },
      { pubkey: requirePublicKey(spendingLimit, "Spending limit"), isSigner: false, isWritable: true },
      { pubkey: requirePublicKey(treasurySolVault, "Treasury SOL vault"), isSigner: false, isWritable: true },
      { pubkey: requirePublicKey(destination, "Destination"), isSigner: false, isWritable: true },
    ],
    data: concat(
      SPEND_WITHIN_LIMIT_DISCRIMINATOR,
      u64Le(amountLamports, "Transfer amount"),
    ),
  });
}

export function createCancelTreasuryBudgetInstruction({
  governance,
  reasonHash,
  spendingLimit,
  tokenConfig,
}: {
  governance: string;
  reasonHash: Uint8Array;
  spendingLimit: string;
  tokenConfig: string;
}) {
  if (reasonHash.length !== 32 || reasonHash.every((byte) => byte === 0)) {
    throw new Error("Cancellation requires a non-zero 32-byte reason hash.");
  }
  return new TransactionInstruction({
    programId: new PublicKey(TOKENOMICS_GENESIS_CONFIG.programId),
    keys: [
      { pubkey: requirePublicKey(governance, "Governance"), isSigner: true, isWritable: false },
      { pubkey: requirePublicKey(tokenConfig, "Token config"), isSigner: false, isWritable: false },
      { pubkey: requirePublicKey(spendingLimit, "Spending limit"), isSigner: false, isWritable: true },
    ],
    data: concat(CANCEL_SPENDING_LIMIT_DISCRIMINATOR, reasonHash),
  });
}

export function parseSolToLamports(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+(?:\.\d{1,9})?$/.test(normalized)) {
    throw new Error("Enter a positive SOL amount with up to nine decimals.");
  }
  const [whole, fraction = ""] = normalized.split(".");
  const lamports = BigInt(whole!) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0"));
  if (lamports <= 0n || lamports > U64_MAX) {
    throw new Error("SOL amount is outside the supported range.");
  }
  return lamports;
}
