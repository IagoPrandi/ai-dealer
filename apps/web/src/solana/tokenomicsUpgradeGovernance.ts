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
  createTokenomicsUpgradeInstruction,
  errorText,
  submitConfirmedAndAwaitFinalized,
} from "./tokenomicsUpgradeProposal";
import { TOKENOMICS_UPGRADE_PROPOSAL_CONFIG } from "./tokenomicsUpgradeProposalConfig";

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
const BUFFER_METADATA_LENGTH = 37;
const FINALIZATION_TIMEOUT_MS = 120_000;
const FINALIZATION_POLL_INTERVAL_MS = 1_000;

export const TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG = Object.freeze({
  proposalAddress: "Hnhnm1x1vUb7AKk1mnSC4MFdy9vpMTDNreY38CKhhkHS",
  transactionAddress: "6vziiip4rKcVc7TppkBhbYRYrNxYn4c6adDFi1cxvQoY",
  transactionIndex: 2n,
});

export type TokenomicsUpgradeGovernanceAction = "approve" | "execute";
export type TokenomicsUpgradeProposalStatus =
  | "Active"
  | "Approved"
  | "Executed";

export interface TokenomicsUpgradeGovernanceState {
  approved: readonly string[];
  bufferAvailable: boolean;
  cancelled: readonly string[];
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

function decodeBufferAuthority(data: Buffer) {
  if (
    data.length < BUFFER_METADATA_LENGTH ||
    data.readUInt32LE(0) !== 1 ||
    data.readUInt8(4) !== 1
  ) {
    throw new Error("The reviewed account is not an authorised loader buffer.");
  }
  return new PublicKey(data.subarray(5, BUFFER_METADATA_LENGTH)).toBase58();
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
  const config = TOKENOMICS_UPGRADE_PROPOSAL_CONFIG;
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
    !Buffer.from(inner.data).equals(Buffer.from([3, 0, 0, 0]))
  ) {
    throw new Error("The stored proposal does not contain only one upgrade.");
  }

  const expectedInstruction = createTokenomicsUpgradeInstruction();
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
    throw new Error("The stored upgrade accounts differ from the review.");
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
      isKnownMember(memberAddress),
  };
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
  const proposalAddress = new PublicKey(governance.proposalAddress);
  const transactionAddress = new PublicKey(governance.transactionAddress);
  const programAddress = new PublicKey(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.programId,
  );
  const programDataAddress = new PublicKey(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.programDataAddress,
  );
  const bufferAddress = new PublicKey(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferAddress,
  );
  const [proposal, vaultTransaction, programInfo, programDataInfo, bufferInfo] =
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
      connection.getAccountInfo(bufferAddress, "finalized"),
    ]);

  if (
    proposal.multisig.toBase58() !==
      TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.multisigAddress ||
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

  const loaderProgramId = new PublicKey(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.loaderProgramId,
  );
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
  if (
    decodeProgramDataAuthority(programDataInfo.data) !==
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.vaultAddress
  ) {
    throw new Error("Idealer authority is not Squads vault 0.");
  }

  const programBytes = programDataInfo.data.subarray(
    PROGRAM_DATA_METADATA_LENGTH,
  );
  if (
    programBytes.length !==
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.programDataCapacity
  ) {
    throw new Error("Idealer ProgramData capacity changed.");
  }

  let programSha256: string;
  if (status === "Executed") {
    if (bufferInfo) {
      throw new Error("The executed upgrade buffer was not closed.");
    }
    const deployedBytes = programBytes.subarray(
      0,
      TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferProgramLength,
    );
    const padding = programBytes.subarray(
      TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferProgramLength,
    );
    programSha256 = await sha256Hex(deployedBytes);
    if (
      programSha256 !== TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferSha256 ||
      !allZero(padding)
    ) {
      throw new Error("The executed Idealer bytes failed read-back.");
    }
  } else {
    if (
      !bufferInfo ||
      !bufferInfo.owner.equals(loaderProgramId) ||
      decodeBufferAuthority(bufferInfo.data) !==
        TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.vaultAddress
    ) {
      throw new Error(
        "The reviewed upgrade buffer owner or Squads authority changed.",
      );
    }
    const currentBytes = programBytes.subarray(
      0,
      TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.currentProgramPrefixLength,
    );
    const padding = programBytes.subarray(
      TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.currentProgramPrefixLength,
    );
    programSha256 = await sha256Hex(currentBytes);
    if (
      programSha256 !==
        TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.currentProgramPrefixSha256 ||
      !allZero(padding)
    ) {
      throw new Error("The pre-upgrade Idealer bytes changed.");
    }

    const bufferProgramBytes = bufferInfo.data.subarray(
      BUFFER_METADATA_LENGTH,
    );
    if (
      bufferProgramBytes.length !==
        TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferProgramLength ||
      (await sha256Hex(bufferProgramBytes)) !==
        TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferSha256
    ) {
      throw new Error("The reviewed on-chain upgrade buffer changed.");
    }
  }

  return {
    approved: proposal.approved.map((member) => member.toBase58()),
    bufferAvailable: bufferInfo !== null,
    cancelled: proposal.cancelled.map((member) => member.toBase58()),
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
    throw new Error("The proposal cannot be executed by this member yet.");
  }

  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "confirmed");
  const multisigPda = new PublicKey(SQUADS_DEVNET_CONFIG.multisigAddress);
  const member = new PublicKey(memberAddress);
  const programId = new PublicKey(SQUADS_DEVNET_CONFIG.programId);
  let instruction: LegacyTransactionInstruction;

  if (action === "approve") {
    instruction = multisigSdk.instructions.proposalApprove({
      member,
      memo: "Approve JUSDEALER devnet Idealer M10 reward CPI upgrade",
      multisigPda,
      programId,
      transactionIndex:
        TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex,
    });
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
    instruction = execution.instruction;
  }

  return {
    action,
    instructions: [convertLegacyInstruction(instruction)],
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
        `The governance transaction failed on-chain: ${JSON.stringify(status.err)}.`,
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
      `The signed ${prepared.action} transaction failed simulation and was not submitted. ${JSON.stringify(simulation.value.err)} ${logs}`,
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
