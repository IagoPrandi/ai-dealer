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
  formatRpcDiagnostic,
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
  proposalAddress: "CC5PXs7X68jynmxeFvcxg7BxhVCcu1W5Tukur3Xv18LH",
  transactionAddress: "5JAZrf9fzxA33h2DKcKY3V2cPkPLRWLpUc6TbM5vpTdy",
  transactionIndex: 9n,
});

export type TokenomicsUpgradeGovernanceAction = "approve" | "execute";
export type TokenomicsUpgradeProposalStatus =
  | "Active"
  | "Approved"
  | "Executed";

export interface TokenomicsUpgradeGovernanceState {
  approved: readonly string[];
  bufferState: "Closed after execution" | "Reviewed and vault-controlled";
  cancelled: readonly string[];
  programCapacity: number;
  programSha256: string;
  proposalAddress: string;
  rejected: readonly string[];
  status: TokenomicsUpgradeProposalStatus;
  transactionAddress: string;
  upgradeComplete: boolean;
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
      role: roleForLegacyAccount(accountMeta.isSigner, accountMeta.isWritable),
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
  if (
    (await connection.getGenesisHash()) !== SQUADS_DEVNET_CONFIG.genesisHash
  ) {
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

function decodeAuthority(
  data: Buffer,
  expectedTag: number,
  optionOffset: number,
  authorityOffset: number,
  label: string,
) {
  if (
    data.length <= authorityOffset + 31 ||
    data.readUInt32LE(0) !== expectedTag ||
    data.readUInt8(optionOffset) !== 1
  ) {
    throw new Error(`${label} has invalid upgradeable-loader metadata.`);
  }
  return new PublicKey(data.subarray(authorityOffset, authorityOffset + 32));
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
  const proposal = TOKENOMICS_UPGRADE_PROPOSAL_CONFIG;
  const governance = TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG;
  if (
    vaultTransaction.multisig.toBase58() !== proposal.multisigAddress ||
    vaultTransaction.creator.toBase58() !==
      SQUADS_DEVNET_CONFIG.members[0]!.address ||
    bigintFromSdkValue(vaultTransaction.index) !==
      governance.transactionIndex ||
    vaultTransaction.vaultIndex !== proposal.vaultIndex
  ) {
    throw new Error("The stored Squads vault transaction identity changed.");
  }

  const expectedInstruction = createTokenomicsUpgradeInstruction();
  const message = vaultTransaction.message;
  const inner = message.instructions[0];
  if (
    message.instructions.length !== 1 ||
    message.addressTableLookups.length !== 0 ||
    !inner ||
    !Buffer.from(inner.data).equals(expectedInstruction.data)
  ) {
    throw new Error("The stored proposal does not contain only one upgrade.");
  }

  const loader = message.accountKeys[inner.programIdIndex];
  const actualAccounts = Array.from(inner.accountIndexes, (index) =>
    message.accountKeys[index]?.toBase58(),
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
  const knownMember = isKnownMember(memberAddress);
  return {
    canApprove:
      status === "Active" && knownMember && !approved.includes(memberAddress),
    canExecute:
      status === "Approved" &&
      approved.length >= SQUADS_DEVNET_CONFIG.threshold &&
      knownMember,
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
  const config = TOKENOMICS_UPGRADE_PROPOSAL_CONFIG;
  const proposalAddress = new PublicKey(governance.proposalAddress);
  const transactionAddress = new PublicKey(governance.transactionAddress);
  const programAddress = new PublicKey(config.programId);
  const programDataAddress = new PublicKey(config.programDataAddress);
  const bufferAddress = new PublicKey(config.bufferAddress);
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
  if (proposal.rejected.length > 0 || proposal.cancelled.length > 0) {
    throw new Error(
      "The proposal contains an unexpected rejection or cancellation.",
    );
  }
  assertStoredUpgradeMessage(vaultTransaction);

  const loaderProgramId = new PublicKey(config.loaderProgramId);
  if (
    !programInfo ||
    !programInfo.executable ||
    !programInfo.owner.equals(loaderProgramId) ||
    programInfo.data.length !== 36 ||
    programInfo.data.readUInt32LE(0) !== 2 ||
    !new PublicKey(programInfo.data.subarray(4, 36)).equals(programDataAddress)
  ) {
    throw new Error(
      "Tokenomics Core does not link to the reviewed ProgramData.",
    );
  }
  if (
    !programDataInfo ||
    !programDataInfo.owner.equals(loaderProgramId) ||
    decodeAuthority(
      programDataInfo.data,
      3,
      12,
      13,
      "Tokenomics Core ProgramData",
    ).toBase58() !== config.vaultAddress
  ) {
    throw new Error(
      "Tokenomics Core ProgramData authority is not Squads vault 0.",
    );
  }

  const programBytes = programDataInfo.data.subarray(
    PROGRAM_DATA_METADATA_LENGTH,
  );
  if (programBytes.length !== config.programDataCapacity) {
    throw new Error(
      "Tokenomics Core ProgramData capacity differs from the review.",
    );
  }

  let programSha256: string;
  let bufferState: TokenomicsUpgradeGovernanceState["bufferState"];
  if (status === "Executed") {
    programSha256 = await sha256Hex(
      programBytes.subarray(0, config.bufferProgramLength),
    );
    if (
      programSha256 !== config.bufferSha256 ||
      !allZero(programBytes.subarray(config.bufferProgramLength)) ||
      bufferInfo
    ) {
      throw new Error(
        "The finalized Tokenomics Core upgrade failed strict read-back.",
      );
    }
    bufferState = "Closed after execution";
  } else {
    programSha256 = await sha256Hex(
      programBytes.subarray(0, config.currentProgramPrefixLength),
    );
    if (
      programSha256 !== config.currentProgramPrefixSha256 ||
      !allZero(programBytes.subarray(config.currentProgramPrefixLength))
    ) {
      throw new Error(
        "The pre-upgrade Tokenomics Core bytes differ from the review.",
      );
    }
    if (
      !bufferInfo ||
      !bufferInfo.owner.equals(loaderProgramId) ||
      decodeAuthority(
        bufferInfo.data,
        1,
        4,
        5,
        "Tokenomics Core upgrade buffer",
      ).toBase58() !== config.vaultAddress
    ) {
      throw new Error(
        "The reviewed buffer is not controlled by Squads vault 0.",
      );
    }
    const bufferBytes = bufferInfo.data.subarray(BUFFER_METADATA_LENGTH);
    if (
      bufferBytes.length !== config.bufferProgramLength ||
      (await sha256Hex(bufferBytes)) !== config.bufferSha256
    ) {
      throw new Error(
        "The on-chain buffer differs from the reviewed artifact.",
      );
    }
    bufferState = "Reviewed and vault-controlled";
  }

  return {
    approved: proposal.approved.map((member) => member.toBase58()),
    bufferState,
    cancelled: proposal.cancelled.map((member) => member.toBase58()),
    programCapacity: programBytes.length,
    programSha256,
    proposalAddress: governance.proposalAddress,
    rejected: proposal.rejected.map((member) => member.toBase58()),
    status: status as TokenomicsUpgradeProposalStatus,
    transactionAddress: governance.transactionAddress,
    upgradeComplete: status === "Executed",
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

  const stateBefore = await readTokenomicsUpgradeGovernanceState(rpcEndpoint);
  const availability = governanceActionAvailability({
    approved: stateBefore.approved,
    memberAddress,
    status: stateBefore.status,
  });
  if (action === "approve" && !availability.canApprove) {
    throw new Error(
      "This member cannot approve the proposal in its current state.",
    );
  }
  if (action === "execute" && !availability.canExecute) {
    throw new Error(
      "Execution requires an approved 2-of-3 proposal and a connected devnet multisig member.",
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
        memo: "Approve reviewed JUSDEALER devnet Tokenomics Core reward v2 upgrade",
        multisigPda,
        programId,
        transactionIndex: TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex,
      }),
    ];
  } else {
    const execution = await multisigSdk.instructions.vaultTransactionExecute({
      connection,
      member,
      multisigPda,
      programId,
      transactionIndex: TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex,
    });
    if (execution.lookupTableAccounts.length !== 0) {
      throw new Error("Unexpected lookup table accounts blocked execution.");
    }
    instructions = [execution.instruction];
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
