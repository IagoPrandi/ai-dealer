"use client";

import {
  AccountRole,
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

import { IDEALER_PROGRAM_ID, SYSTEM_PROGRAM_ID } from "./idealerProgram";

export const TOKENOMICS_CORE_PROGRAM_ID = address(
  process.env.NEXT_PUBLIC_TOKENOMICS_CORE_PROGRAM_ID ??
    "BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm",
);
export const IDEALER_TOKEN_MINT = address(
  process.env.NEXT_PUBLIC_IDEALER_TOKEN_MINT ??
    "FssXNhB2mUSjavX7jsXLuZevfGnJ5zn98nNNUbrY16rr",
);
export const SPL_TOKEN_PROGRAM_ID = address(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ASSOCIATED_TOKEN_PROGRAM_ID = address(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
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
const TOKEN_CONFIG_DISCRIMINATOR = Uint8Array.from([
  92, 73, 255, 43, 107, 51, 117, 101,
]);
const LOCK_POSITION_DISCRIMINATOR = Uint8Array.from([
  95, 235, 144, 78, 23, 171, 45, 9,
]);
const RULE_PROPOSAL_DISCRIMINATOR = Uint8Array.from([
  233, 212, 161, 38, 30, 217, 172, 177,
]);
const RULE_VOTE_DISCRIMINATOR = Uint8Array.from([
  218, 17, 7, 255, 16, 223, 234, 149,
]);
const SETTLE_PROPOSAL_TOKEN_REWARD_DISCRIMINATOR = Uint8Array.from([
  102, 19, 56, 179, 43, 237, 219, 1,
]);
const SETTLE_SUPPORTER_TOKEN_REWARD_DISCRIMINATOR = Uint8Array.from([
  178, 202, 23, 241, 117, 160, 209, 179,
]);

const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

type TokenAccountInfoResult = {
  value: null | {
    data: readonly [string, string] | string;
    owner: string;
  };
};

export type TokenBalanceRpcReader = {
  runtime: {
    rpc: {
      getAccountInfo: (
        account: ReturnType<typeof address>,
        config: { commitment: "confirmed"; encoding: "base64" },
      ) => { send: () => Promise<TokenAccountInfoResult> };
    };
  };
};

export interface OnChainTokenBalance {
  atoms: string;
  exists: boolean;
  tokenAccount: ReturnType<typeof address>;
}

export async function deriveAssociatedTokenAddress(
  owner: ReturnType<typeof address>,
  mint: ReturnType<typeof address> = IDEALER_TOKEN_MINT,
) {
  const [tokenAccount] = await getProgramDerivedAddress({
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ID,
    seeds: [
      addressEncoder.encode(owner),
      addressEncoder.encode(SPL_TOKEN_PROGRAM_ID),
      addressEncoder.encode(mint),
    ],
  });
  return tokenAccount;
}

export async function fetchOnChainTokenBalance({
  client,
  mint = IDEALER_TOKEN_MINT,
  owner,
}: {
  client: TokenBalanceRpcReader;
  mint?: ReturnType<typeof address>;
  owner: ReturnType<typeof address>;
}): Promise<OnChainTokenBalance> {
  const tokenAccount = await deriveAssociatedTokenAddress(owner, mint);
  const result = await client.runtime.rpc
    .getAccountInfo(tokenAccount, {
      commitment: "confirmed",
      encoding: "base64",
    })
    .send();

  if (!result.value) {
    return { atoms: "0", exists: false, tokenAccount };
  }
  if (result.value.owner !== SPL_TOKEN_PROGRAM_ID.toString()) {
    throw new Error("JDR token account has an invalid owner.");
  }

  const encoded = Array.isArray(result.value.data)
    ? result.value.data[0]
    : result.value.data;
  const binary = globalThis.atob(encoded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  if (bytes.length < 72) {
    throw new Error("JDR token account data is truncated.");
  }
  if (!equalBytes(bytes.subarray(0, 32), addressEncoder.encode(mint))) {
    throw new Error(
      "JDR token account mint does not match the configured mint.",
    );
  }
  if (!equalBytes(bytes.subarray(32, 64), addressEncoder.encode(owner))) {
    throw new Error("JDR token account beneficiary does not match the wallet.");
  }

  const atoms = new DataView(
    bytes.buffer,
    bytes.byteOffset,
    bytes.byteLength,
  ).getBigUint64(64, true);
  return { atoms: atoms.toString(), exists: true, tokenAccount };
}

export interface OnChainTokenomicsPosition {
  initialCampaignVault: ReturnType<typeof address>;
  lockExists: boolean;
  lockedAtoms: string;
  mint: ReturnType<typeof address>;
  returnTokenAccount: ReturnType<typeof address> | null;
  tokenConfig: ReturnType<typeof address>;
  treasuryLockEscrow: ReturnType<typeof address>;
}

export async function fetchOnChainTokenomicsPosition({
  client,
  owner,
}: {
  client: TokenBalanceRpcReader;
  owner: ReturnType<typeof address>;
}): Promise<OnChainTokenomicsPosition> {
  const { lockPosition, tokenConfig } =
    await deriveTokenomicsTransactionAccounts(owner);
  const [configResult, lockResult] = await Promise.all([
    client.runtime.rpc
      .getAccountInfo(tokenConfig, {
        commitment: "confirmed",
        encoding: "base64",
      })
      .send(),
    client.runtime.rpc
      .getAccountInfo(lockPosition, {
        commitment: "confirmed",
        encoding: "base64",
      })
      .send(),
  ]);
  const configBytes = requireOwnedAccountBytes(
    configResult,
    TOKENOMICS_CORE_PROGRAM_ID,
    "Tokenomics configuration",
  );
  if (
    configBytes.length < 397 ||
    !equalBytes(configBytes.subarray(0, 8), TOKEN_CONFIG_DISCRIMINATOR)
  ) {
    throw new Error("Tokenomics configuration data is invalid.");
  }
  const metadataUriLength = readU32(configBytes, 232);
  const vaultOffset = 236 + metadataUriLength + 1;
  if (vaultOffset + 96 > configBytes.length) {
    throw new Error("Tokenomics configuration data is truncated.");
  }
  const mint = addressFromBytes(configBytes.subarray(136, 168));
  if (mint !== IDEALER_TOKEN_MINT) {
    throw new Error("Tokenomics configuration uses an unexpected JDR mint.");
  }

  if (!lockResult.value) {
    return {
      initialCampaignVault: addressFromBytes(
        configBytes.subarray(vaultOffset + 64, vaultOffset + 96),
      ),
      lockExists: false,
      lockedAtoms: "0",
      mint,
      returnTokenAccount: null,
      tokenConfig,
      treasuryLockEscrow: addressFromBytes(
        configBytes.subarray(vaultOffset + 32, vaultOffset + 64),
      ),
    };
  }

  const lockBytes = requireOwnedAccountBytes(
    lockResult,
    TOKENOMICS_CORE_PROGRAM_ID,
    "JDR lock position",
  );
  if (
    lockBytes.length < 194 ||
    !equalBytes(lockBytes.subarray(0, 8), LOCK_POSITION_DISCRIMINATOR) ||
    !equalBytes(lockBytes.subarray(8, 40), addressEncoder.encode(owner)) ||
    !equalBytes(lockBytes.subarray(136, 168), addressEncoder.encode(mint))
  ) {
    throw new Error("JDR lock position data is invalid.");
  }
  return {
    initialCampaignVault: addressFromBytes(
      configBytes.subarray(vaultOffset + 64, vaultOffset + 96),
    ),
    lockExists: true,
    lockedAtoms: readU64(lockBytes, 168).toString(),
    mint,
    returnTokenAccount: addressFromBytes(lockBytes.subarray(72, 104)),
    tokenConfig,
    treasuryLockEscrow: addressFromBytes(
      configBytes.subarray(vaultOffset + 32, vaultOffset + 64),
    ),
  };
}

export type ManualTokenRewardKind = "proposal" | "supporter";

export interface ManualTokenReward {
  action: ReturnType<typeof address>;
  atoms: string;
  kind: ManualTokenRewardKind;
  receipt: ReturnType<typeof address>;
}

type ProgramAccountResult = {
  account: { data: readonly [string, string] | string; owner: string };
  pubkey: string;
};

export async function fetchManualTokenRewards({
  client,
  owner,
}: {
  client: TokenBalanceRpcReader;
  owner: ReturnType<typeof address>;
}): Promise<ManualTokenReward[]> {
  const rpc = client.runtime.rpc as typeof client.runtime.rpc & {
    getProgramAccounts: (
      program: ReturnType<typeof address>,
      config: {
        commitment: "confirmed";
        encoding: "base64";
        filters: Array<{ memcmp: { bytes: string; offset: bigint } }>;
      },
    ) => { send: () => Promise<ProgramAccountResult[]> };
  };
  const actions = await rpc
    .getProgramAccounts(IDEALER_PROGRAM_ID, {
      commitment: "confirmed",
      encoding: "base64",
      filters: [{ memcmp: { bytes: owner.toString(), offset: 24n } }],
    })
    .send();
  const [campaign] = await getProgramDerivedAddress({
    programAddress: TOKENOMICS_CORE_PROGRAM_ID,
    seeds: ["campaign", u64Le(0n)],
  });
  const candidates = actions.flatMap(({ account, pubkey }) => {
    if (account.owner !== IDEALER_PROGRAM_ID.toString()) {
      return [];
    }
    const bytes = decodeBase64Data(account.data);
    const kind = equalBytes(bytes.subarray(0, 8), RULE_PROPOSAL_DISCRIMINATOR)
      ? "proposal"
      : equalBytes(bytes.subarray(0, 8), RULE_VOTE_DISCRIMINATOR)
        ? "supporter"
        : null;
    if (!kind || !equalBytes(bytes.subarray(24, 56), addressEncoder.encode(owner))) {
      return [];
    }
    return [{ action: address(pubkey), kind }];
  });
  const pending = await Promise.all(
    candidates.map(async ({ action, kind }) => {
      const [receipt] = await getProgramDerivedAddress({
        programAddress: TOKENOMICS_CORE_PROGRAM_ID,
        seeds: ["campaign_reward", addressEncoder.encode(campaign), addressEncoder.encode(action)],
      });
      const result = await client.runtime.rpc
        .getAccountInfo(receipt, { commitment: "confirmed", encoding: "base64" })
        .send();
      return result.value
        ? null
        : {
            action,
            atoms: (kind === "proposal" ? 400_000_000n : 60_000_000n).toString(),
            kind,
            receipt,
          };
    }),
  );
  return pending.filter((reward): reward is ManualTokenReward => reward !== null);
}

export async function createManualTokenRewardClaimInstruction(args: {
  campaignVault: ReturnType<typeof address>;
  owner: ReturnType<typeof address>;
  reward: ManualTokenReward;
  tokenAccount: ReturnType<typeof address>;
}) {
  const [globalConfig, tokenConfig, campaign] = await Promise.all([
    getProgramDerivedAddress({ programAddress: IDEALER_PROGRAM_ID, seeds: ["global_config"] }).then(([pda]) => pda),
    derivePda(["token_config"]),
    derivePda(["campaign", u64Le(0n)]),
  ]);
  return {
    accounts: [
      { address: args.owner, role: AccountRole.WRITABLE_SIGNER },
      { address: globalConfig, role: AccountRole.READONLY },
      { address: args.reward.action, role: AccountRole.READONLY },
      { address: TOKENOMICS_CORE_PROGRAM_ID, role: AccountRole.READONLY },
      { address: tokenConfig, role: AccountRole.READONLY },
      { address: IDEALER_TOKEN_MINT, role: AccountRole.READONLY },
      { address: campaign, role: AccountRole.WRITABLE },
      { address: args.campaignVault, role: AccountRole.WRITABLE },
      { address: args.tokenAccount, role: AccountRole.WRITABLE },
      { address: args.reward.receipt, role: AccountRole.WRITABLE },
      { address: SPL_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data:
      args.reward.kind === "proposal"
        ? SETTLE_PROPOSAL_TOKEN_REWARD_DISCRIMINATOR
        : SETTLE_SUPPORTER_TOKEN_REWARD_DISCRIMINATOR,
    programAddress: IDEALER_PROGRAM_ID,
  };
}

export function createAssociatedTokenAccountInstruction(args: {
  owner: ReturnType<typeof address>;
  payer: ReturnType<typeof address>;
  tokenAccount: ReturnType<typeof address>;
}) {
  return {
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.tokenAccount, role: AccountRole.WRITABLE },
      { address: args.owner, role: AccountRole.READONLY },
      { address: IDEALER_TOKEN_MINT, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
      { address: SPL_TOKEN_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: Uint8Array.from([1]),
    programAddress: ASSOCIATED_TOKEN_PROGRAM_ID,
  };
}

function requireOwnedAccountBytes(
  result: TokenAccountInfoResult,
  expectedOwner: ReturnType<typeof address>,
  label: string,
) {
  if (!result.value) {
    throw new Error(`${label} is missing on devnet.`);
  }
  if (result.value.owner !== expectedOwner.toString()) {
    throw new Error(`${label} has an invalid owner.`);
  }
  return decodeBase64Data(result.value.data);
}

function decodeBase64Data(data: readonly [string, string] | string) {
  const encoded = Array.isArray(data) ? data[0] : data;
  const binary = globalThis.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function addressFromBytes(bytes: Uint8Array) {
  return addressDecoder.decode(bytes);
}

function readU32(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset, true);
}

function readU64(bytes: Uint8Array, offset: number) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(offset, true);
}

function equalBytes(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

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
