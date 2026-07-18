"use client";

import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

import { SYSTEM_PROGRAM_ID } from "./idealerProgram";

export const TOKENOMICS_CORE_PROGRAM_ID = address(
  process.env.NEXT_PUBLIC_TOKENOMICS_CORE_PROGRAM_ID ??
    "CWA3N4ew4guFuY3P4jJTyt5HgidCRW6c7mGAL5pUSmb6",
);
export const SPL_TOKEN_PROGRAM_ID = address(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);

const CREATE_LOCK_POSITION_DISCRIMINATOR = Uint8Array.from([
  24, 29, 50, 6, 99, 45, 118, 195,
]);
const TOP_UP_LOCK_DISCRIMINATOR = Uint8Array.from([
  169, 241, 34, 76, 195, 121, 50, 42,
]);
const UNLOCK_TOKENS_DISCRIMINATOR = Uint8Array.from([
  233, 35, 95, 159, 37, 185, 47, 88,
]);
const CLAIM_DISTRIBUTION_DISCRIMINATOR = Uint8Array.from([
  204, 156, 94, 85, 2, 125, 232, 180,
]);

const addressEncoder = getAddressEncoder();

export interface TokenomicsTransactionAccounts {
  lockPosition: ReturnType<typeof address>;
  tokenConfig: ReturnType<typeof address>;
}

export async function deriveTokenomicsTransactionAccounts(
  owner: ReturnType<typeof address>,
): Promise<TokenomicsTransactionAccounts> {
  const [tokenConfig, lockPosition] = await Promise.all([
    derivePda(["token_config"]),
    derivePda(["lock_position", addressEncoder.encode(owner)]),
  ]);
  return { lockPosition, tokenConfig };
}

export async function createLockTokensInstruction(args: {
  amountAtoms: bigint;
  escrow: string;
  mint: string;
  owner: ReturnType<typeof address>;
  sourceTokenAccount: string;
}) {
  assertTokenAmount(args.amountAtoms);
  const accounts = await deriveTokenomicsTransactionAccounts(args.owner);
  return {
    accounts: [
      { address: args.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.tokenConfig, role: AccountRole.READONLY },
      { address: address(args.mint), role: AccountRole.READONLY },
      { address: address(args.sourceTokenAccount), role: AccountRole.WRITABLE },
      { address: address(args.sourceTokenAccount), role: AccountRole.READONLY },
      { address: address(args.escrow), role: AccountRole.WRITABLE },
      { address: accounts.lockPosition, role: AccountRole.WRITABLE },
      { address: SPL_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: instructionWithAmount(
      CREATE_LOCK_POSITION_DISCRIMINATOR,
      args.amountAtoms,
    ),
    programAddress: TOKENOMICS_CORE_PROGRAM_ID,
  };
}

export async function createTopUpLockInstruction(args: {
  amountAtoms: bigint;
  escrow: string;
  mint: string;
  owner: ReturnType<typeof address>;
  sourceTokenAccount: string;
}) {
  assertTokenAmount(args.amountAtoms);
  const accounts = await deriveTokenomicsTransactionAccounts(args.owner);
  return {
    accounts: [
      { address: args.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.tokenConfig, role: AccountRole.READONLY },
      { address: address(args.mint), role: AccountRole.READONLY },
      { address: address(args.sourceTokenAccount), role: AccountRole.WRITABLE },
      { address: accounts.lockPosition, role: AccountRole.WRITABLE },
      { address: address(args.escrow), role: AccountRole.WRITABLE },
      { address: SPL_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: instructionWithAmount(TOP_UP_LOCK_DISCRIMINATOR, args.amountAtoms),
    programAddress: TOKENOMICS_CORE_PROGRAM_ID,
  };
}

export async function createUnlockTokensInstruction(args: {
  amountAtoms: bigint;
  escrow: string;
  mint: string;
  owner: ReturnType<typeof address>;
  returnTokenAccount: string;
}) {
  assertTokenAmount(args.amountAtoms);
  const accounts = await deriveTokenomicsTransactionAccounts(args.owner);
  return {
    accounts: [
      { address: args.owner, role: AccountRole.READONLY_SIGNER },
      { address: accounts.tokenConfig, role: AccountRole.READONLY },
      { address: address(args.mint), role: AccountRole.READONLY },
      { address: accounts.lockPosition, role: AccountRole.WRITABLE },
      { address: address(args.escrow), role: AccountRole.WRITABLE },
      { address: address(args.returnTokenAccount), role: AccountRole.WRITABLE },
      { address: SPL_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: instructionWithAmount(UNLOCK_TOKENS_DISCRIMINATOR, args.amountAtoms),
    programAddress: TOKENOMICS_CORE_PROGRAM_ID,
  };
}

export async function createTokenomicsClaimInstruction(args: {
  amountLamports: bigint;
  beneficiary: string;
  caller: ReturnType<typeof address>;
  correctionReserveVault: string;
  distributionVault: string;
  epochId: bigint;
  position: string;
  proof: string[];
  rootVersion: number;
  treasurySolVault: string;
}) {
  assertTokenAmount(args.amountLamports);
  if (
    args.epochId < 0n ||
    args.epochId > 0xffff_ffff_ffff_ffffn ||
    !Number.isInteger(args.rootVersion) ||
    args.rootVersion <= 0 ||
    args.rootVersion > 0xffff_ffff ||
    args.proof.length > 32
  ) {
    throw new Error("Invalid Tokenomics Core claim values.");
  }
  const position = address(args.position);
  const beneficiary = address(args.beneficiary);
  const [tokenConfig, epoch, claim] = await Promise.all([
    derivePda(["token_config"]),
    derivePda(["epoch", u64Le(args.epochId)]),
    derivePda([
      "distribution_claim",
      u64Le(args.epochId),
      addressEncoder.encode(position),
    ]),
  ]);
  const proof = args.proof.map((node) => bytes32FromHex(node, "proof"));
  const data = new Uint8Array(96 + proof.length * 32);
  let offset = 0;
  data.set(CLAIM_DISTRIBUTION_DISCRIMINATOR, offset);
  offset += 8;
  data.set(u64Le(args.epochId), offset);
  offset += 8;
  new DataView(data.buffer).setUint32(offset, args.rootVersion, true);
  offset += 4;
  data.set(addressEncoder.encode(position), offset);
  offset += 32;
  data.set(addressEncoder.encode(beneficiary), offset);
  offset += 32;
  data.set(u64Le(args.amountLamports), offset);
  offset += 8;
  new DataView(data.buffer).setUint32(offset, proof.length, true);
  offset += 4;
  for (const node of proof) {
    data.set(node, offset);
    offset += 32;
  }
  return {
    accounts: [
      { address: args.caller, role: AccountRole.WRITABLE_SIGNER },
      { address: tokenConfig, role: AccountRole.WRITABLE },
      { address: epoch, role: AccountRole.WRITABLE },
      { address: claim, role: AccountRole.WRITABLE },
      { address: address(args.distributionVault), role: AccountRole.WRITABLE },
      {
        address: address(args.correctionReserveVault),
        role: AccountRole.WRITABLE,
      },
      { address: address(args.treasurySolVault), role: AccountRole.WRITABLE },
      { address: beneficiary, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data,
    programAddress: TOKENOMICS_CORE_PROGRAM_ID,
  };
}

function derivePda(
  seeds: Parameters<typeof getProgramDerivedAddress>[0]["seeds"],
) {
  return getProgramDerivedAddress({
    programAddress: TOKENOMICS_CORE_PROGRAM_ID,
    seeds,
  }).then(([pda]) => pda);
}

function instructionWithAmount(
  discriminator: Uint8Array,
  amountAtoms: bigint,
): Uint8Array {
  const data = new Uint8Array(16);
  data.set(discriminator);
  new DataView(data.buffer).setBigUint64(8, amountAtoms, true);
  return data;
}

function u64Le(value: bigint): Uint8Array {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, value, true);
  return bytes;
}

function bytes32FromHex(value: string, field: string): Uint8Array {
  if (!/^[\da-f]{64}$/i.test(value)) {
    throw new Error(`${field} must be a 32-byte hexadecimal value.`);
  }
  const bytes = new Uint8Array(32);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function assertTokenAmount(value: bigint): void {
  if (value <= 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error("Token amount must fit an unsigned 64-bit integer.");
  }
}
