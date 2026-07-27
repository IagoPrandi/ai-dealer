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
  type TransactionInstruction as LegacyTransactionInstruction,
} from "@solana/web3.js";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { verifyExpectedDevnetMultisig } from "./squadsProvisioning";
import {
  errorText,
  formatRpcDiagnostic,
  submitConfirmedAndAwaitFinalized,
} from "./tokenomicsUpgradeProposal";
import {
  createIdealerProgramDataAuthorityBridgeInstruction,
  createIdealerProgramDataAuthorityReturnInstruction,
  createIdealerProgramExtensionInstruction,
} from "./idealerProgramExtensionProposal";
import { IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG } from "./idealerProgramExtensionProposalConfig";

type SolanaClient = ReturnType<typeof useSolanaClient>;
type WalletConnection = ReturnType<typeof useWalletConnection>;
type ConnectedWallet = NonNullable<WalletConnection["wallet"]>;
type ConfirmableTransaction = Parameters<
  SolanaClient["actions"]["sendTransaction"]
>[0];
type KitInstruction = Parameters<
  SolanaClient["transaction"]["prepare"]
>[0]["instructions"][number];

const PROGRAM_DATA_METADATA_LENGTH = 45;
const FINALIZATION_TIMEOUT_MS = 120_000;
const FINALIZATION_POLL_INTERVAL_MS = 1_000;

export const TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG = Object.freeze({
  proposalAddress: "3xoEM9XMESn3CHgs4sBqGznQscoboo1i4PPbhp9wQuEy",
  transactionAddress: "8ySkm4mRP62JozFfjfm2ehy6QZ6mq6ZY7bf6WyDdfu3L",
  transactionIndex: 6n,
});

export type TokenomicsUpgradeGovernanceAction = "approve" | "execute";
export type TokenomicsUpgradeProposalStatus =
  | "Active"
  | "Approved"
  | "Executed";

export interface TokenomicsUpgradeGovernanceState {
  approved: readonly string[];
  cancelled: readonly string[];
  extensionComplete: boolean;
  programCapacity: number;
  programSha256: string;
  proposalAddress: string;
  rejected: readonly string[];
  status: TokenomicsUpgradeProposalStatus;
  transactionAddress: string;
}

export interface PreparedTokenomicsUpgradeGovernanceAction {
  action: TokenomicsUpgradeGovernanceAction;
  instructions: readonly KitInstruction[];
  memberAddress: string;
  rpcEndpoint: string;
  stateBefore: TokenomicsUpgradeGovernanceState;
}

export interface TokenomicsUpgradeGovernanceResult {
  action: TokenomicsUpgradeGovernanceAction;
  signature: string;
  state: TokenomicsUpgradeGovernanceState;
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
    accounts: instruction.keys.map((accountMeta) => ({
      address: address(accountMeta.pubkey.toBase58()),
      role: roleForLegacyAccount(
        accountMeta.isSigner,
        accountMeta.isWritable,
      ),
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
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== SQUADS_DEVNET_CONFIG.genesisHash) {
    throw new Error(
      "The configured RPC is not Solana devnet. Governance action was blocked.",
    );
  }
}

async function sha256Hex(data: Uint8Array) {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new Uint8Array(data),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

function allZero(data: Uint8Array) {
  return data.every((byte) => byte === 0);
}

function decodeProgramDataAuthority(data: Buffer) {
  if (
    data.length < PROGRAM_DATA_METADATA_LENGTH ||
    data.readUInt32LE(0) !== 3 ||
    data.readUInt8(12) !== 1
  ) {
    throw new Error("Idealer has invalid ProgramData metadata.");
  }
  return new PublicKey(data.subarray(13, 45)).toBase58();
}

function assertStoredUpgradeMessage(vaultTransaction: {
  creator: PublicKey;
  index: { toString(): string } | number;
  message: {
    accountKeys: PublicKey[];
    addressTableLookups: unknown[];
    instructions: Array<{
      accountIndexes: Uint8Array | number[];
      data: Uint8Array;
      programIdIndex: number;
    }>;
  };
  multisig: PublicKey;
  vaultIndex: number;
}) {
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  if (
    vaultTransaction.multisig.toBase58() !== config.multisigAddress ||
    vaultTransaction.creator.toBase58() !==
      SQUADS_DEVNET_CONFIG.members[0]!.address ||
    bigintFromSdkValue(vaultTransaction.index) !==
      TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex ||
    vaultTransaction.vaultIndex !== config.vaultIndex
  ) {
    throw new Error("The stored Squads vault transaction identity changed.");
  }

  const message = vaultTransaction.message;
  const inner = message.instructions[0];
  if (
    message.instructions.length !== 1 ||
    message.addressTableLookups.length !== 0 ||
    !inner ||
    !Buffer.from(inner.data).equals(
      createIdealerProgramDataAuthorityBridgeInstruction().data,
    )
  ) {
    throw new Error(
      "The stored proposal does not contain only the reviewed authority bridge.",
    );
  }

  const expectedInstruction =
    createIdealerProgramDataAuthorityBridgeInstruction();
  const loader = message.accountKeys[inner.programIdIndex];
  const actualAccounts = Array.from(
    inner.accountIndexes,
    (index) => message.accountKeys[index]?.toBase58(),
  );
  const expectedAccounts = expectedInstruction.keys.map((key) =>
    key.pubkey.toBase58(),
  );
  if (
    loader?.toBase58() !== expectedInstruction.programId.toBase58() ||
    actualAccounts.length !== expectedAccounts.length ||
    actualAccounts.some(
      (actualAccount, index) => actualAccount !== expectedAccounts[index],
    )
  ) {
    throw new Error(
      "The stored authority-bridge accounts differ from the review.",
    );
  }
}

export function governanceActionAvailability({
  approved,
  memberAddress,
  status,
}: {
  approved: readonly string[];
  memberAddress: string;
  status: TokenomicsUpgradeProposalStatus;
}) {
  return {
    canApprove:
      status === "Active" &&
      isKnownMember(memberAddress) &&
      !approved.includes(memberAddress),
    canExecute:
      status === "Approved" &&
      approved.length >= SQUADS_DEVNET_CONFIG.threshold &&
      memberAddress ===
        IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG.temporaryAuthorityAddress,
  };
}

export function createAtomicProgramDataExtensionInstructions(
  squadsExecutionInstruction: LegacyTransactionInstruction,
) {
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  return [
    squadsExecutionInstruction,
    createIdealerProgramExtensionInstruction(
      config.temporaryAuthorityAddress,
    ),
    createIdealerProgramDataAuthorityReturnInstruction(),
  ] as const;
}

export async function readTokenomicsUpgradeGovernanceState(
  rpcEndpoint: string,
): Promise<TokenomicsUpgradeGovernanceState> {
  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "finalized");
  await assertDevnetConnection(connection);
  await verifyExpectedDevnetMultisig({
    multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
    rpcEndpoint,
  });

  const governance = TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG;
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const proposalAddress = new PublicKey(governance.proposalAddress);
  const transactionAddress = new PublicKey(governance.transactionAddress);
  const programAddress = new PublicKey(config.programId);
  const programDataAddress = new PublicKey(config.programDataAddress);
  const [
    proposal,
    vaultTransaction,
    programInfo,
    programDataInfo,
    checkedExtensionFeatureInfo,
    payerBalanceLamports,
  ] =
    await Promise.all([
      multisigSdk.accounts.Proposal.fromAccountAddress(
        connection,
        proposalAddress,
        "finalized",
      ),
      multisigSdk.accounts.VaultTransaction.fromAccountAddress(
        connection,
        transactionAddress,
        "finalized",
      ),
      connection.getAccountInfo(programAddress, "finalized"),
      connection.getAccountInfo(programDataAddress, "finalized"),
      connection.getAccountInfo(
        new PublicKey(config.extendProgramCheckedFeatureAddress),
        "finalized",
      ),
      connection.getBalance(
        new PublicKey(config.temporaryAuthorityAddress),
        "finalized",
      ),
    ]);

  if (
    proposal.multisig.toBase58() !== config.multisigAddress ||
    bigintFromSdkValue(proposal.transactionIndex) !==
      governance.transactionIndex
  ) {
    throw new Error("The Squads proposal identity changed.");
  }
  const status = proposal.status.__kind;
  if (!["Active", "Approved", "Executed"].includes(status)) {
    throw new Error(`The proposal is in the unexpected ${status} state.`);
  }
  assertStoredUpgradeMessage(vaultTransaction);

  const loaderProgramId = new PublicKey(config.loaderProgramId);
  if (
    !programInfo ||
    !programInfo.executable ||
    !programInfo.owner.equals(loaderProgramId) ||
    programInfo.data.length < 36 ||
    programInfo.data.readUInt32LE(0) !== 2 ||
    !new PublicKey(programInfo.data.subarray(4, 36)).equals(programDataAddress)
  ) {
    throw new Error("Idealer does not link to the reviewed ProgramData.");
  }
  if (
    !programDataInfo ||
    !programDataInfo.owner.equals(loaderProgramId)
  ) {
    throw new Error("Idealer ProgramData could not be verified.");
  }
  if (checkedExtensionFeatureInfo) {
    throw new Error(
      "ExtendProgramChecked activated on devnet. The reviewed legacy extension path is no longer valid.",
    );
  }
  if (
    decodeProgramDataAuthority(programDataInfo.data) !==
    config.vaultAddress
  ) {
    throw new Error("Idealer authority is not Squads vault 0.");
  }

  const programBytes = programDataInfo.data.subarray(
    PROGRAM_DATA_METADATA_LENGTH,
  );
  const expectedCapacity =
    status === "Executed" ? config.targetCapacity : config.currentCapacity;
  if (programBytes.length !== expectedCapacity) {
    throw new Error(
      "Idealer ProgramData capacity does not match the proposal state.",
    );
  }
  const expectedProgramDataLamports =
    status === "Executed"
      ? config.requiredProgramDataLamports
      : config.currentProgramDataLamports;
  if (programDataInfo.lamports !== expectedProgramDataLamports) {
    throw new Error("Idealer ProgramData funding differs from the review.");
  }
  const extensionRentLamports =
    config.requiredProgramDataLamports - config.currentProgramDataLamports;
  if (status !== "Executed" && payerBalanceLamports <= extensionRentLamports) {
    throw new Error(
      "Devnet Wallet A cannot fund the reviewed extension rent and network fee.",
    );
  }
  const deployedPrefix = programBytes.subarray(0, config.currentCapacity);
  const extension = programBytes.subarray(config.currentCapacity);
  const programSha256 = await sha256Hex(deployedPrefix);
  if (
    programSha256 !== config.currentSha256 ||
    (status === "Executed" && !allZero(extension)) ||
    (status !== "Executed" && extension.length !== 0)
  ) {
    throw new Error("Idealer ProgramData bytes failed strict read-back.");
  }

  return {
    approved: proposal.approved.map((member) => member.toBase58()),
    cancelled: proposal.cancelled.map((member) => member.toBase58()),
    extensionComplete: status === "Executed",
    programCapacity: programBytes.length,
    programSha256,
    proposalAddress: governance.proposalAddress,
    rejected: proposal.rejected.map((member) => member.toBase58()),
    status: status as TokenomicsUpgradeProposalStatus,
    transactionAddress: governance.transactionAddress,
  };
}

export async function prepareTokenomicsUpgradeGovernanceAction({
  action,
  memberAddress,
  rpcEndpoint,
}: {
  action: TokenomicsUpgradeGovernanceAction;
  memberAddress: string;
  rpcEndpoint: string;
}): Promise<PreparedTokenomicsUpgradeGovernanceAction> {
  if (!isKnownMember(memberAddress)) {
    throw new Error("The connected account is not a devnet multisig member.");
  }

  const stateBefore =
    await readTokenomicsUpgradeGovernanceState(rpcEndpoint);
  const availability = governanceActionAvailability({
    approved: stateBefore.approved,
    memberAddress,
    status: stateBefore.status,
  });
  if (action === "approve" && !availability.canApprove) {
    throw new Error("This member cannot approve the proposal in its current state.");
  }
  if (action === "execute" && !availability.canExecute) {
    throw new Error(
      "Atomic execution requires an approved 2-of-3 proposal and devnet Wallet A as the connected signer.",
    );
  }

  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "confirmed");
  const multisigPda = new PublicKey(SQUADS_DEVNET_CONFIG.multisigAddress);
  const member = new PublicKey(memberAddress);
  const programId = new PublicKey(SQUADS_DEVNET_CONFIG.programId);
  let instructions: readonly LegacyTransactionInstruction[];

  if (action === "approve") {
    instructions = [
      multisigSdk.instructions.proposalApprove({
        member,
        memo: "Approve JUSDEALER devnet atomic ProgramData extension",
        multisigPda,
        programId,
        transactionIndex:
          TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex,
      }),
    ];
  } else {
    const execution = await multisigSdk.instructions.vaultTransactionExecute({
      connection,
      member,
      multisigPda,
      programId,
      transactionIndex:
        TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex,
    });
    if (execution.lookupTableAccounts.length !== 0) {
      throw new Error("Unexpected lookup table accounts blocked execution.");
    }
    instructions = createAtomicProgramDataExtensionInstructions(
      execution.instruction,
    );
  }

  return {
    action,
    instructions: instructions.map(convertLegacyInstruction),
    memberAddress,
    rpcEndpoint,
    stateBefore,
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
        `The governance transaction failed on-chain: ${formatRpcDiagnostic(status.err)}.`,
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
    "The governance transaction did not reach finalized commitment within 120 seconds.",
  );
}

export async function signSimulateSendAndVerifyGovernanceAction({
  client,
  prepared,
  wallet,
}: {
  client: SolanaClient;
  prepared: PreparedTokenomicsUpgradeGovernanceAction;
  wallet: ConnectedWallet;
}): Promise<TokenomicsUpgradeGovernanceResult> {
  if (wallet.account.address.toString() !== prepared.memberAddress) {
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
  const signedTransaction = await client.transaction.sign(transaction);
  const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);
  const simulation = await client.runtime.rpc
    .simulateTransaction(wireTransaction, {
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
      `The signed ${prepared.action} transaction failed simulation and was not submitted. ${formatRpcDiagnostic(simulation.value.err)} ${logs}`,
    );
  }

  assertHasBlockhashLifetime(signedTransaction);
  let signature: string;
  try {
    signature = await submitConfirmedAndAwaitFinalized({
      send: async (commitment) =>
        (
          await client.actions.sendTransaction(signedTransaction, commitment)
        ).toString(),
      waitForFinalized: async (submittedSignature) =>
        waitForFinalizedSignature({
          rpcEndpoint: prepared.rpcEndpoint,
          signature: submittedSignature,
        }),
    });
  } catch (error) {
    throw new Error(
      `The ${prepared.action} transaction was not submitted or finalized: ${errorText(error)}`,
      { cause: error },
    );
  }

  const state = await readTokenomicsUpgradeGovernanceState(
    prepared.rpcEndpoint,
  );
  if (
    prepared.action === "approve" &&
    !state.approved.includes(prepared.memberAddress)
  ) {
    throw new Error("The finalized approval failed strict read-back.");
  }
  if (prepared.action === "execute" && state.status !== "Executed") {
    throw new Error("The finalized execution failed strict read-back.");
  }

  return { action: prepared.action, signature, state };
}
