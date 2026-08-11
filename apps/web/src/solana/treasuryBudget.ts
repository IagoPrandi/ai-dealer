"use client";

import { createWalletTransactionSigner } from "@solana/client";
import type { useSolanaClient, useWalletConnection } from "@solana/react-hooks";
import {
  AccountRole,
  address,
  getBase64EncodedWireTransaction,
} from "@solana/kit";
import {
  Connection,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  type TransactionInstruction as LegacyTransactionInstruction,
} from "@solana/web3.js";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { verifyExpectedDevnetMultisig } from "./squadsProvisioning";
import { TYCHE_TOKEN_MINT } from "./tokenomicsProgram";
import {
  deriveTokenomicsGenesisAddresses,
  type TokenomicsGenesisAddresses,
} from "./tokenomicsGenesisProvisioning";
import {
  BPF_UPGRADEABLE_LOADER_ID,
  TOKENOMICS_GENESIS_CONFIG,
} from "./tokenomicsGenesisConfig";
import {
  errorText,
  formatRpcDiagnostic,
  submitConfirmedAndAwaitFinalized,
} from "./tokenomicsUpgradeProposal";
import {
  ACTIVATE_SPENDING_LIMIT_DISCRIMINATOR,
  CANCEL_SPENDING_LIMIT_DISCRIMINATOR,
  SCHEDULE_TREASURY_OPERATION_DISCRIMINATOR,
  createActivateTreasuryBudgetInstruction,
  createCancelTreasuryBudgetInstruction,
  createScheduleTreasuryBudgetInstruction,
  createSpendWithinTreasuryBudgetInstruction,
  spendingLimitHash,
  type TreasuryBudgetDefinition,
} from "./treasuryBudgetInstructions";

type SolanaClient = ReturnType<typeof useSolanaClient>;
type WalletConnection = ReturnType<typeof useWalletConnection>;
type ConnectedWallet = NonNullable<WalletConnection["wallet"]>;
type ConfirmableTransaction = Parameters<
  SolanaClient["actions"]["sendTransaction"]
>[0];
type KitInstruction = Parameters<
  SolanaClient["transaction"]["prepare"]
>[0]["instructions"][number];

const FINALIZATION_TIMEOUT_MS = 120_000;
const FINALIZATION_POLL_INTERVAL_MS = 1_000;
const PROGRAM_DATA_METADATA_LENGTH = 45;
const TOKENOMICS_PROGRAM_DATA = "DBM5tfyUMcThsXyvMuYMEU1Xgfar4KZpXtSAh9LXusaS";

// Filled from the isolated reviewed SBF build and finalized governed upgrade.
// Any later byte drift disables budget creation so no unreviewed spending
// limit can be activated.
export const TREASURY_BUDGET_PROGRAM_ARTIFACT = Object.freeze({
  length: 1_073_632,
  sha256: "6dda1d95164486684957e8dddf7209a07aa31f4712ec9a9257a29fe6b9544173",
});

const DISCRIMINATORS = Object.freeze({
  distributionVault: Buffer.from([95, 145, 107, 71, 179, 186, 208, 249]),
  executor: Buffer.from([3, 72, 184, 163, 177, 250, 140, 231]),
  lockPosition: Buffer.from([95, 235, 144, 78, 23, 171, 45, 9]),
  spendingLimit: Buffer.from([166, 213, 231, 221, 133, 152, 66, 227]),
  tokenConfig: Buffer.from([92, 73, 255, 43, 107, 51, 117, 101]),
  treasurySolVault: Buffer.from([80, 234, 118, 93, 113, 105, 132, 137]),
});

export interface TreasuryOverview {
  addresses: TokenomicsGenesisAddresses;
  cancellationReady: boolean;
  deployedProgramSha256: string;
  feePoolLamports: bigint;
  lockedJdrAtoms: bigint;
  nextOperationId: bigint;
  treasurySolLamports: bigint;
}

export interface TreasuryBudgetRecord extends TreasuryBudgetDefinition {
  active: boolean;
  configHash: string;
  periodStartedAt: bigint;
  spentInPeriodLamports: bigint;
  spendingLimit: string;
}

export type TreasuryProposalKind = "activate-budget" | "cancel-budget";
export type TreasuryProposalStatus =
  | "Active"
  | "Approved"
  | "Executed"
  | "Rejected"
  | "Cancelled";

export interface TreasuryProposalState {
  approved: readonly string[];
  budget: TreasuryBudgetRecord | TreasuryBudgetDefinition;
  cancelled: readonly string[];
  cancellationReasonHash: string | null;
  kind: TreasuryProposalKind;
  proposalAddress: string;
  rejected: readonly string[];
  status: TreasuryProposalStatus;
  transactionAddress: string;
  transactionIndex: bigint;
}

export type TreasuryGovernanceAction = "approve" | "execute";

export interface PreparedTreasuryWalletAction {
  action:
    | "create-budget-proposal"
    | "create-cancellation-proposal"
    | "approve"
    | "execute"
    | "spend";
  instructions: readonly KitInstruction[];
  memberOrOperator: string;
  rpcEndpoint: string;
  verify: () => Promise<void>;
}

function roleForLegacyAccount(isSigner: boolean, isWritable: boolean) {
  if (isSigner) {
    return isWritable
      ? AccountRole.WRITABLE_SIGNER
      : AccountRole.READONLY_SIGNER;
  }
  return isWritable ? AccountRole.WRITABLE : AccountRole.READONLY;
}

function convertLegacyInstruction(
  instruction: LegacyTransactionInstruction,
): KitInstruction {
  return {
    accounts: instruction.keys.map((meta) => ({
      address: address(meta.pubkey.toBase58()),
      role: roleForLegacyAccount(meta.isSigner, meta.isWritable),
    })),
    data: new Uint8Array(instruction.data),
    programAddress: address(instruction.programId.toBase58()),
  };
}

function bigintFromSdkValue(value: { toString(): string } | number) {
  return BigInt(value.toString());
}

function isKnownMember(memberAddress: string) {
  return SQUADS_DEVNET_CONFIG.members.some(
    (member) => member.address === memberAddress,
  );
}

function assertKnownMember(memberAddress: string) {
  if (!isKnownMember(memberAddress)) {
    throw new Error("The connected account is not a devnet multisig member.");
  }
}

function assertHasBlockhashLifetime(transaction: {
  lifetimeConstraint: unknown;
}): asserts transaction is ConfirmableTransaction & {
  lifetimeConstraint: { lastValidBlockHeight: bigint };
} {
  const lifetime = transaction.lifetimeConstraint;
  if (
    typeof lifetime !== "object" ||
    lifetime === null ||
    !("lastValidBlockHeight" in lifetime)
  ) {
    throw new Error(
      "The prepared transaction did not use a recent blockhash. Nothing was submitted.",
    );
  }
}

async function assertDevnetConnection(connection: Connection) {
  if (
    (await connection.getGenesisHash()) !== SQUADS_DEVNET_CONFIG.genesisHash
  ) {
    throw new Error(
      "The configured RPC is not Solana devnet. The action was blocked.",
    );
  }
}

async function sha256(data: Uint8Array) {
  const bytes = Uint8Array.from(data);
  return Buffer.from(await globalThis.crypto.subtle.digest("SHA-256", bytes));
}

async function sha256Hex(data: Uint8Array) {
  return (await sha256(data)).toString("hex");
}

function requireProgramAccount(
  info: Awaited<ReturnType<Connection["getAccountInfo"]>>,
  discriminator: Buffer,
  label: string,
) {
  const owner = new PublicKey(TOKENOMICS_GENESIS_CONFIG.programId);
  if (!info || !info.owner.equals(owner)) {
    throw new Error(`${label} is missing or has an invalid owner.`);
  }
  if (
    info.data.length < discriminator.length ||
    !info.data.subarray(0, discriminator.length).equals(discriminator)
  ) {
    throw new Error(`${label} has invalid account data.`);
  }
  return info;
}

async function availableLamports(
  connection: Connection,
  info: NonNullable<Awaited<ReturnType<Connection["getAccountInfo"]>>>,
) {
  const rent = await connection.getMinimumBalanceForRentExemption(
    info.data.length,
    "finalized",
  );
  const available = BigInt(info.lamports) - BigInt(rent);
  if (available < 0n) {
    throw new Error("A treasury vault is below rent exemption.");
  }
  return available;
}

export async function readTreasuryOverview(
  rpcEndpoint: string,
): Promise<TreasuryOverview> {
  const connection = new Connection(rpcEndpoint, "finalized");
  await assertDevnetConnection(connection);
  await verifyExpectedDevnetMultisig({ rpcEndpoint });
  const addresses = await deriveTokenomicsGenesisAddresses(
    TYCHE_TOKEN_MINT.toString(),
  );
  const [
    configInfo,
    executorInfo,
    positionInfo,
    treasuryInfo,
    feePoolInfo,
    programInfo,
    programDataInfo,
  ] = await connection.getMultipleAccountsInfo(
    [
      addresses.tokenConfig,
      addresses.executor,
      addresses.treasuryPosition,
      addresses.treasurySolVault,
      addresses.distributionVault,
      TOKENOMICS_GENESIS_CONFIG.programId,
      TOKENOMICS_PROGRAM_DATA,
    ].map((value) => new PublicKey(value)),
    "finalized",
  );
  requireProgramAccount(
    configInfo ?? null,
    DISCRIMINATORS.tokenConfig,
    "Tokenomics configuration",
  );
  const executor = requireProgramAccount(
    executorInfo ?? null,
    DISCRIMINATORS.executor,
    "Treasury policy executor",
  );
  const position = requireProgramAccount(
    positionInfo ?? null,
    DISCRIMINATORS.lockPosition,
    "Treasury lock position",
  );
  const treasury = requireProgramAccount(
    treasuryInfo ?? null,
    DISCRIMINATORS.treasurySolVault,
    "Treasury SOL Vault",
  );
  const feePool = requireProgramAccount(
    feePoolInfo ?? null,
    DISCRIMINATORS.distributionVault,
    "Treasury fee pool",
  );
  const loader = new PublicKey(BPF_UPGRADEABLE_LOADER_ID);
  if (
    !programInfo ||
    !programInfo.executable ||
    !programInfo.owner.equals(loader) ||
    programInfo.data.length !== 36 ||
    programInfo.data.readUInt32LE(0) !== 2 ||
    new PublicKey(programInfo.data.subarray(4, 36)).toBase58() !==
      TOKENOMICS_PROGRAM_DATA ||
    !programDataInfo ||
    !programDataInfo.owner.equals(loader) ||
    programDataInfo.data.length !==
      PROGRAM_DATA_METADATA_LENGTH +
        TOKENOMICS_GENESIS_CONFIG.programCapacity ||
    programDataInfo.data.readUInt32LE(0) !== 3 ||
    programDataInfo.data.readUInt8(12) !== 1 ||
    new PublicKey(programDataInfo.data.subarray(13, 45)).toBase58() !==
      SQUADS_DEVNET_CONFIG.vaultAddress
  ) {
    throw new Error(
      "Tokenomics Core program identity, capacity, or upgrade authority is invalid.",
    );
  }
  const deployedBytes = programDataInfo.data.subarray(
    PROGRAM_DATA_METADATA_LENGTH,
  );
  const expectedLength = TREASURY_BUDGET_PROGRAM_ARTIFACT.length;
  const deployedProgramSha256 =
    expectedLength > 0 && deployedBytes.length >= expectedLength
      ? await sha256Hex(deployedBytes.subarray(0, expectedLength))
      : "unreviewed";
  const cancellationReady =
    expectedLength > 0 &&
    deployedProgramSha256 === TREASURY_BUDGET_PROGRAM_ARTIFACT.sha256 &&
    deployedBytes.subarray(expectedLength).every((byte) => byte === 0);

  return {
    addresses,
    cancellationReady,
    deployedProgramSha256,
    feePoolLamports: await availableLamports(connection, feePool),
    lockedJdrAtoms: position.data.readBigUInt64LE(168),
    nextOperationId: executor.data.readBigUInt64LE(48),
    treasurySolLamports: await availableLamports(connection, treasury),
  };
}

function deriveBudgetAddresses(limitId: bigint) {
  const program = new PublicKey(TOKENOMICS_GENESIS_CONFIG.programId);
  const id = Buffer.alloc(8);
  id.writeBigUInt64LE(limitId);
  return {
    operation: PublicKey.findProgramAddressSync(
      [Buffer.from("treasury_operation"), id],
      program,
    )[0].toBase58(),
    spendingLimit: PublicKey.findProgramAddressSync(
      [Buffer.from("spending_limit"), id],
      program,
    )[0].toBase58(),
  };
}

function proposalAddresses(transactionIndex: bigint) {
  const multisigProgram = new PublicKey(SQUADS_DEVNET_CONFIG.programId);
  const multisigPda = new PublicKey(SQUADS_DEVNET_CONFIG.multisigAddress);
  return import("@sqds/multisig").then((sdk) => ({
    proposalAddress: sdk.getProposalPda({
      multisigPda,
      programId: multisigProgram,
      transactionIndex,
    })[0],
    transactionAddress: sdk.getTransactionPda({
      index: transactionIndex,
      multisigPda,
      programId: multisigProgram,
    })[0],
  }));
}

async function nextSquadsTransaction(
  connection: Connection,
  creatorAddress: string,
) {
  const sdk = await import("@sqds/multisig");
  const multisigPda = new PublicKey(SQUADS_DEVNET_CONFIG.multisigAddress);
  const account = await sdk.accounts.Multisig.fromAccountAddress(
    connection,
    multisigPda,
    "confirmed",
  );
  const transactionIndex = bigintFromSdkValue(account.transactionIndex) + 1n;
  const addresses = await proposalAddresses(transactionIndex);
  const [transactionInfo, proposalInfo] = await Promise.all([
    connection.getAccountInfo(addresses.transactionAddress, "confirmed"),
    connection.getAccountInfo(addresses.proposalAddress, "confirmed"),
  ]);
  if (transactionInfo || proposalInfo) {
    throw new Error(
      "The next Squads transaction index is already occupied. Prepare again.",
    );
  }
  return {
    ...addresses,
    creator: new PublicKey(creatorAddress),
    multisigPda,
    programId: new PublicKey(SQUADS_DEVNET_CONFIG.programId),
    transactionIndex,
  };
}

function proposalCreationInstructions({
  creator,
  innerInstructions,
  memo,
  multisigPda,
  programId,
  transactionIndex,
}: {
  creator: PublicKey;
  innerInstructions: TransactionInstruction[];
  memo: string;
  multisigPda: PublicKey;
  programId: PublicKey;
  transactionIndex: bigint;
}) {
  return import("@sqds/multisig").then((sdk) => {
    const transactionMessage = new TransactionMessage({
      instructions: innerInstructions,
      payerKey: new PublicKey(SQUADS_DEVNET_CONFIG.vaultAddress),
      recentBlockhash: PublicKey.default.toBase58(),
    });
    return [
      sdk.instructions.vaultTransactionCreate({
        creator,
        ephemeralSigners: 0,
        memo: memo.slice(0, 120),
        multisigPda,
        programId,
        transactionIndex,
        transactionMessage,
        vaultIndex: SQUADS_DEVNET_CONFIG.vaultIndex,
      }),
      sdk.instructions.proposalCreate({
        creator,
        isDraft: false,
        multisigPda,
        programId,
        transactionIndex,
      }),
    ];
  });
}

export async function prepareTreasuryBudgetProposal({
  creatorAddress,
  destination,
  maxLamports,
  periodSeconds,
  purpose,
  rpcEndpoint,
}: {
  creatorAddress: string;
  destination: string;
  maxLamports: bigint;
  periodSeconds: bigint;
  purpose: string;
  rpcEndpoint: string;
}) {
  assertKnownMember(creatorAddress);
  if (purpose.trim().length < 3) {
    throw new Error(
      "Enter a public budget purpose of at least three characters.",
    );
  }
  const connection = new Connection(rpcEndpoint, "confirmed");
  await assertDevnetConnection(connection);
  const overview = await readTreasuryOverview(rpcEndpoint);
  if (!overview.cancellationReady) {
    throw new Error(
      "Budget creation is locked until the reviewed cancellable-budget Tokenomics Core upgrade is deployed.",
    );
  }
  if (maxLamports > overview.treasurySolLamports) {
    throw new Error(
      "The requested budget exceeds the available Treasury SOL Vault balance.",
    );
  }
  if (periodSeconds < 3_600n || periodSeconds > 31_536_000n) {
    throw new Error("The budget period must be between one hour and 365 days.");
  }
  const budget: TreasuryBudgetDefinition = {
    destination,
    limitId: overview.nextOperationId,
    maxLamports,
    operator: creatorAddress,
    periodSeconds,
  };
  const budgetAddresses = deriveBudgetAddresses(budget.limitId);
  const next = await nextSquadsTransaction(connection, creatorAddress);
  const innerInstructions = [
    await createScheduleTreasuryBudgetInstruction({
      budget,
      executor: overview.addresses.executor,
      governance: SQUADS_DEVNET_CONFIG.vaultAddress,
      operation: budgetAddresses.operation,
      tokenConfig: overview.addresses.tokenConfig,
    }),
    createActivateTreasuryBudgetInstruction({
      budget,
      governance: SQUADS_DEVNET_CONFIG.vaultAddress,
      operation: budgetAddresses.operation,
      spendingLimit: budgetAddresses.spendingLimit,
      tokenConfig: overview.addresses.tokenConfig,
    }),
  ];
  const instructions = await proposalCreationInstructions({
    ...next,
    innerInstructions,
    memo: `Tyche treasury budget ${budget.limitId.toString()}: ${purpose.trim()}`,
  });
  const prepared: PreparedTreasuryWalletAction = {
    action: "create-budget-proposal",
    instructions: instructions.map(convertLegacyInstruction),
    memberOrOperator: creatorAddress,
    rpcEndpoint,
    verify: async () => {
      const state = await readTreasuryProposalState({
        rpcEndpoint,
        transactionIndex: next.transactionIndex,
      });
      if (
        state.kind !== "activate-budget" ||
        state.status !== "Active" ||
        state.approved.length !== 0
      ) {
        throw new Error(
          "The finalized budget proposal failed strict read-back.",
        );
      }
    },
  };
  return {
    budget,
    prepared,
    proposalAddress: next.proposalAddress.toBase58(),
    transactionAddress: next.transactionAddress.toBase58(),
    transactionIndex: next.transactionIndex,
  };
}

function accountAddressesForInstruction(
  message: {
    accountKeys: PublicKey[];
  },
  instruction: { accountIndexes: Uint8Array | number[] },
) {
  return Array.from(instruction.accountIndexes, (index) => {
    const account = message.accountKeys[index];
    if (!account) {
      throw new Error(
        "The stored treasury proposal has an invalid account index.",
      );
    }
    return account.toBase58();
  });
}

function decodeActivation(data: Uint8Array): TreasuryBudgetDefinition {
  const bytes = Buffer.from(data);
  if (
    bytes.length !== 96 ||
    !bytes.subarray(0, 8).equals(ACTIVATE_SPENDING_LIMIT_DISCRIMINATOR)
  ) {
    throw new Error("The stored activation instruction data is invalid.");
  }
  return {
    limitId: bytes.readBigUInt64LE(8),
    operator: new PublicKey(bytes.subarray(16, 48)).toBase58(),
    destination: new PublicKey(bytes.subarray(48, 80)).toBase58(),
    maxLamports: bytes.readBigUInt64LE(80),
    periodSeconds: bytes.readBigInt64LE(88),
  };
}

async function readSpendingLimit(
  connection: Connection,
  spendingLimit: string,
): Promise<TreasuryBudgetRecord> {
  const info = requireProgramAccount(
    await connection.getAccountInfo(new PublicKey(spendingLimit), "finalized"),
    DISCRIMINATORS.spendingLimit,
    "Treasury spending limit",
  );
  if (info.data.length < 146) {
    throw new Error("Treasury spending limit data is truncated.");
  }
  const record: TreasuryBudgetRecord = {
    active: info.data.readUInt8(144) !== 0,
    configHash: info.data.subarray(112, 144).toString("hex"),
    destination: new PublicKey(info.data.subarray(48, 80)).toBase58(),
    limitId: info.data.readBigUInt64LE(8),
    maxLamports: info.data.readBigUInt64LE(80),
    operator: new PublicKey(info.data.subarray(16, 48)).toBase58(),
    periodSeconds: info.data.readBigInt64LE(88),
    periodStartedAt: info.data.readBigInt64LE(96),
    spentInPeriodLamports: info.data.readBigUInt64LE(104),
    spendingLimit,
  };
  const expectedAddress = deriveBudgetAddresses(record.limitId).spendingLimit;
  const expectedHash = await spendingLimitHash(record);
  if (
    expectedAddress !== spendingLimit ||
    record.configHash !== expectedHash.toString("hex")
  ) {
    throw new Error(
      "Treasury spending limit failed canonical hash or address verification.",
    );
  }
  return record;
}

export async function readTreasuryProposalState({
  rpcEndpoint,
  transactionIndex,
}: {
  rpcEndpoint: string;
  transactionIndex: bigint;
}): Promise<TreasuryProposalState> {
  const sdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "finalized");
  await assertDevnetConnection(connection);
  await verifyExpectedDevnetMultisig({ rpcEndpoint });
  const addresses = await proposalAddresses(transactionIndex);
  const [proposal, vaultTransaction] = await Promise.all([
    sdk.accounts.Proposal.fromAccountAddress(
      connection,
      addresses.proposalAddress,
      "finalized",
    ),
    sdk.accounts.VaultTransaction.fromAccountAddress(
      connection,
      addresses.transactionAddress,
      "finalized",
    ),
  ]);
  if (
    proposal.multisig.toBase58() !== SQUADS_DEVNET_CONFIG.multisigAddress ||
    vaultTransaction.multisig.toBase58() !==
      SQUADS_DEVNET_CONFIG.multisigAddress ||
    bigintFromSdkValue(proposal.transactionIndex) !== transactionIndex ||
    bigintFromSdkValue(vaultTransaction.index) !== transactionIndex ||
    vaultTransaction.vaultIndex !== SQUADS_DEVNET_CONFIG.vaultIndex
  ) {
    throw new Error("The stored treasury proposal identity is invalid.");
  }
  const status = proposal.status.__kind as TreasuryProposalStatus;
  if (
    !["Active", "Approved", "Executed", "Rejected", "Cancelled"].includes(
      status,
    )
  ) {
    throw new Error(
      `The treasury proposal is in the unexpected ${status} state.`,
    );
  }
  const message = vaultTransaction.message;
  if (message.addressTableLookups.length !== 0) {
    throw new Error("Treasury proposals must not use lookup tables.");
  }
  const programId = new PublicKey(
    TOKENOMICS_GENESIS_CONFIG.programId,
  ).toBase58();
  let kind: TreasuryProposalKind;
  let budget: TreasuryBudgetRecord | TreasuryBudgetDefinition;
  let cancellationReasonHash: string | null = null;
  if (message.instructions.length === 2) {
    const [schedule, activate] = message.instructions;
    if (
      !schedule ||
      !activate ||
      message.accountKeys[schedule.programIdIndex]?.toBase58() !== programId ||
      message.accountKeys[activate.programIdIndex]?.toBase58() !== programId ||
      !Buffer.from(schedule.data)
        .subarray(0, 8)
        .equals(SCHEDULE_TREASURY_OPERATION_DISCRIMINATOR)
    ) {
      throw new Error("The stored budget proposal instructions are invalid.");
    }
    const activation = decodeActivation(activate.data);
    const scheduleData = Buffer.from(schedule.data);
    const expectedHash = await spendingLimitHash(activation);
    if (
      scheduleData.length !== 89 ||
      scheduleData.readBigUInt64LE(8) !== activation.limitId ||
      scheduleData.readUInt8(16) !== 0 ||
      new PublicKey(scheduleData.subarray(17, 49)).toBase58() !==
        activation.destination ||
      scheduleData.readBigUInt64LE(49) !== activation.maxLamports ||
      !scheduleData.subarray(57, 89).equals(expectedHash)
    ) {
      throw new Error(
        "The scheduled operation does not match the spending limit.",
      );
    }
    const derived = deriveBudgetAddresses(activation.limitId);
    const overview = await readTreasuryOverview(rpcEndpoint);
    const expectedScheduleAccounts = [
      SQUADS_DEVNET_CONFIG.vaultAddress,
      overview.addresses.tokenConfig,
      overview.addresses.executor,
      derived.operation,
      "11111111111111111111111111111111",
    ];
    const actualScheduleAccounts = accountAddressesForInstruction(
      message,
      schedule,
    );
    const actualActivateAccounts = accountAddressesForInstruction(
      message,
      activate,
    );
    const expectedActivateAccounts = [
      SQUADS_DEVNET_CONFIG.vaultAddress,
      overview.addresses.tokenConfig,
      derived.operation,
      derived.spendingLimit,
      "11111111111111111111111111111111",
    ];
    if (
      actualScheduleAccounts.length !== expectedScheduleAccounts.length ||
      actualActivateAccounts.length !== expectedActivateAccounts.length ||
      actualScheduleAccounts.some(
        (value, index) => value !== expectedScheduleAccounts[index],
      ) ||
      actualActivateAccounts.some(
        (value, index) => value !== expectedActivateAccounts[index],
      )
    ) {
      throw new Error(
        "The stored budget proposal accounts differ from the canonical accounts.",
      );
    }
    kind = "activate-budget";
    if (status === "Executed") {
      const record = await readSpendingLimit(connection, derived.spendingLimit);
      if (
        record.limitId !== activation.limitId ||
        record.operator !== activation.operator ||
        record.destination !== activation.destination ||
        record.maxLamports !== activation.maxLamports ||
        record.periodSeconds !== activation.periodSeconds
      ) {
        throw new Error(
          "The active budget differs from its executed proposal.",
        );
      }
      budget = record;
    } else {
      budget = activation;
    }
  } else if (message.instructions.length === 1) {
    const cancel = message.instructions[0]!;
    const data = Buffer.from(cancel.data);
    if (
      message.accountKeys[cancel.programIdIndex]?.toBase58() !== programId ||
      data.length !== 40 ||
      !data.subarray(0, 8).equals(CANCEL_SPENDING_LIMIT_DISCRIMINATOR) ||
      data.subarray(8).every((byte) => byte === 0)
    ) {
      throw new Error("The stored budget cancellation instruction is invalid.");
    }
    const accounts = accountAddressesForInstruction(message, cancel);
    const overview = await readTreasuryOverview(rpcEndpoint);
    if (
      accounts.length !== 3 ||
      accounts[0] !== SQUADS_DEVNET_CONFIG.vaultAddress ||
      accounts[1] !== overview.addresses.tokenConfig
    ) {
      throw new Error(
        "The stored cancellation accounts differ from the canonical accounts.",
      );
    }
    kind = "cancel-budget";
    cancellationReasonHash = data.subarray(8).toString("hex");
    budget = await readSpendingLimit(connection, accounts[2]!);
  } else {
    throw new Error(
      "The stored transaction is not a treasury budget proposal.",
    );
  }
  return {
    approved: proposal.approved.map((member) => member.toBase58()),
    budget,
    cancelled: proposal.cancelled.map((member) => member.toBase58()),
    cancellationReasonHash,
    kind,
    proposalAddress: addresses.proposalAddress.toBase58(),
    rejected: proposal.rejected.map((member) => member.toBase58()),
    status,
    transactionAddress: addresses.transactionAddress.toBase58(),
    transactionIndex,
  };
}

export function treasuryGovernanceAvailability({
  memberAddress,
  state,
}: {
  memberAddress: string;
  state: TreasuryProposalState;
}) {
  const known = isKnownMember(memberAddress);
  return {
    canApprove:
      known &&
      state.status === "Active" &&
      !state.approved.includes(memberAddress),
    canExecute:
      known &&
      state.status === "Approved" &&
      state.approved.length >= SQUADS_DEVNET_CONFIG.threshold,
  };
}

export async function prepareTreasuryGovernanceAction({
  action,
  memberAddress,
  rpcEndpoint,
  transactionIndex,
}: {
  action: TreasuryGovernanceAction;
  memberAddress: string;
  rpcEndpoint: string;
  transactionIndex: bigint;
}): Promise<PreparedTreasuryWalletAction> {
  assertKnownMember(memberAddress);
  const state = await readTreasuryProposalState({
    rpcEndpoint,
    transactionIndex,
  });
  const availability = treasuryGovernanceAvailability({ memberAddress, state });
  if (!availability[action === "approve" ? "canApprove" : "canExecute"]) {
    throw new Error(
      `This member cannot ${action} the proposal in its current state.`,
    );
  }
  if (action === "execute") {
    const overview = await readTreasuryOverview(rpcEndpoint);
    if (!overview.cancellationReady) {
      throw new Error(
        "Execution is locked until the reviewed cancellable-budget program is deployed.",
      );
    }
    if (
      state.kind === "activate-budget" &&
      state.budget.limitId !== overview.nextOperationId
    ) {
      throw new Error(
        "This budget uses a stale treasury operation id and cannot execute.",
      );
    }
  }
  const sdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "confirmed");
  const multisigPda = new PublicKey(SQUADS_DEVNET_CONFIG.multisigAddress);
  const member = new PublicKey(memberAddress);
  const programId = new PublicKey(SQUADS_DEVNET_CONFIG.programId);
  const instruction =
    action === "approve"
      ? sdk.instructions.proposalApprove({
          member,
          memo: `Approve Tyche treasury ${state.kind} ${transactionIndex.toString()}`,
          multisigPda,
          programId,
          transactionIndex,
        })
      : (
          await sdk.instructions.vaultTransactionExecute({
            connection,
            member,
            multisigPda,
            programId,
            transactionIndex,
          })
        ).instruction;
  return {
    action,
    instructions: [convertLegacyInstruction(instruction)],
    memberOrOperator: memberAddress,
    rpcEndpoint,
    verify: async () => {
      const after = await readTreasuryProposalState({
        rpcEndpoint,
        transactionIndex,
      });
      if (
        (action === "approve" && !after.approved.includes(memberAddress)) ||
        (action === "execute" && after.status !== "Executed")
      ) {
        throw new Error(`The finalized ${action} failed strict read-back.`);
      }
    },
  };
}

export async function prepareTreasuryBudgetCancellationProposal({
  creatorAddress,
  limitId,
  reason,
  rpcEndpoint,
}: {
  creatorAddress: string;
  limitId: bigint;
  reason: string;
  rpcEndpoint: string;
}) {
  assertKnownMember(creatorAddress);
  if (reason.trim().length < 3) {
    throw new Error(
      "Enter a public cancellation reason of at least three characters.",
    );
  }
  const overview = await readTreasuryOverview(rpcEndpoint);
  if (!overview.cancellationReady) {
    throw new Error(
      "Cancellation proposals require the reviewed Tokenomics Core upgrade.",
    );
  }
  const connection = new Connection(rpcEndpoint, "confirmed");
  const spendingLimit = deriveBudgetAddresses(limitId).spendingLimit;
  const budget = await readSpendingLimit(connection, spendingLimit);
  if (!budget.active) {
    throw new Error("This treasury budget is already inactive.");
  }
  const reasonHash = await sha256(Buffer.from(reason.trim(), "utf8"));
  const next = await nextSquadsTransaction(connection, creatorAddress);
  const innerInstructions = [
    createCancelTreasuryBudgetInstruction({
      governance: SQUADS_DEVNET_CONFIG.vaultAddress,
      reasonHash,
      spendingLimit,
      tokenConfig: overview.addresses.tokenConfig,
    }),
  ];
  const instructions = await proposalCreationInstructions({
    ...next,
    innerInstructions,
    memo: `Cancel Tyche treasury budget ${limitId.toString()}: ${reason.trim()}`,
  });
  return {
    prepared: {
      action: "create-cancellation-proposal",
      instructions: instructions.map(convertLegacyInstruction),
      memberOrOperator: creatorAddress,
      rpcEndpoint,
      verify: async () => {
        const state = await readTreasuryProposalState({
          rpcEndpoint,
          transactionIndex: next.transactionIndex,
        });
        if (state.kind !== "cancel-budget" || state.status !== "Active") {
          throw new Error(
            "The finalized cancellation proposal failed strict read-back.",
          );
        }
      },
    } satisfies PreparedTreasuryWalletAction,
    transactionIndex: next.transactionIndex,
  };
}

export async function prepareTreasuryBudgetSpend({
  amountLamports,
  limitId,
  operatorAddress,
  rpcEndpoint,
}: {
  amountLamports: bigint;
  limitId: bigint;
  operatorAddress: string;
  rpcEndpoint: string;
}): Promise<PreparedTreasuryWalletAction> {
  const connection = new Connection(rpcEndpoint, "finalized");
  const overview = await readTreasuryOverview(rpcEndpoint);
  const spendingLimit = deriveBudgetAddresses(limitId).spendingLimit;
  const before = await readSpendingLimit(connection, spendingLimit);
  if (!before.active || before.operator !== operatorAddress) {
    throw new Error("The connected wallet is not the active budget operator.");
  }
  const now = BigInt(Math.floor(Date.now() / 1_000));
  const effectiveSpent =
    now >= before.periodStartedAt + before.periodSeconds
      ? 0n
      : before.spentInPeriodLamports;
  if (amountLamports > before.maxLamports - effectiveSpent) {
    throw new Error(
      "The transfer exceeds the remaining budget for this period.",
    );
  }
  if (amountLamports > overview.treasurySolLamports) {
    throw new Error("The Treasury SOL Vault cannot cover this transfer.");
  }
  const destinationBefore = BigInt(
    await connection.getBalance(new PublicKey(before.destination), "finalized"),
  );
  return {
    action: "spend",
    instructions: [
      convertLegacyInstruction(
        createSpendWithinTreasuryBudgetInstruction({
          amountLamports,
          destination: before.destination,
          operator: operatorAddress,
          spendingLimit,
          tokenConfig: overview.addresses.tokenConfig,
          treasurySolVault: overview.addresses.treasurySolVault,
        }),
      ),
    ],
    memberOrOperator: operatorAddress,
    rpcEndpoint,
    verify: async () => {
      const [after, destinationAfter] = await Promise.all([
        readSpendingLimit(
          new Connection(rpcEndpoint, "finalized"),
          spendingLimit,
        ),
        new Connection(rpcEndpoint, "finalized").getBalance(
          new PublicKey(before.destination),
          "finalized",
        ),
      ]);
      if (
        !after.active ||
        BigInt(destinationAfter) < destinationBefore + amountLamports ||
        after.spentInPeriodLamports < amountLamports
      ) {
        throw new Error(
          "The finalized budget transfer failed strict read-back.",
        );
      }
    },
  };
}

async function waitForFinalizedSignature({
  rpcEndpoint,
  signature,
}: {
  rpcEndpoint: string;
  signature: string;
}) {
  const connection = new Connection(rpcEndpoint, "finalized");
  const deadline = Date.now() + FINALIZATION_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const status = (
      await connection.getSignatureStatuses([signature], {
        searchTransactionHistory: true,
      })
    ).value[0];
    if (status?.err) {
      throw new Error(
        `The transaction failed on-chain: ${formatRpcDiagnostic(status.err)}.`,
      );
    }
    if (status?.confirmationStatus === "finalized") {
      return;
    }
    await new Promise((resolve) =>
      globalThis.setTimeout(resolve, FINALIZATION_POLL_INTERVAL_MS),
    );
  }
  throw new Error(
    "The transaction did not reach finalized commitment within 120 seconds.",
  );
}

export async function signSimulateSendAndVerifyTreasuryAction({
  client,
  prepared,
  wallet,
}: {
  client: SolanaClient;
  prepared: PreparedTreasuryWalletAction;
  wallet: ConnectedWallet;
}) {
  if (wallet.account.address.toString() !== prepared.memberOrOperator) {
    throw new Error("The connected account changed after preparation.");
  }
  const walletSigner = createWalletTransactionSigner(wallet, {
    commitment: "confirmed",
  });
  if (walletSigner.mode !== "partial") {
    throw new Error(
      "This wallet cannot return signed bytes for simulation. Nothing was submitted.",
    );
  }
  const transaction = await client.transaction.prepare({
    authority: walletSigner.signer,
    commitment: "confirmed",
    feePayer: walletSigner.signer,
    instructions: [...prepared.instructions],
    version: 0,
  });
  const signed = await client.transaction.sign(transaction);
  const wire = getBase64EncodedWireTransaction(signed);
  const simulation = await client.runtime.rpc
    .simulateTransaction(wire, {
      commitment: "confirmed",
      encoding: "base64",
      replaceRecentBlockhash: false,
      sigVerify: true,
    })
    .send();
  if (simulation.value.err) {
    const logs =
      simulation.value.logs?.slice(-10).join(" ") ?? "No logs returned.";
    throw new Error(
      `The signed ${prepared.action} failed simulation and was not submitted. ${formatRpcDiagnostic(simulation.value.err)} ${logs}`,
    );
  }
  assertHasBlockhashLifetime(signed);
  let signature: string;
  try {
    signature = await submitConfirmedAndAwaitFinalized({
      send: async (commitment) =>
        (await client.actions.sendTransaction(signed, commitment)).toString(),
      waitForFinalized: async (submitted) =>
        waitForFinalizedSignature({
          rpcEndpoint: prepared.rpcEndpoint,
          signature: submitted,
        }),
    });
  } catch (error) {
    throw new Error(
      `The ${prepared.action} was not submitted or finalized: ${errorText(error)}`,
      {
        cause: error,
      },
    );
  }
  await prepared.verify();
  return signature;
}
