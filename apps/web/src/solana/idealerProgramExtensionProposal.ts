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
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  type TransactionInstruction as LegacyTransactionInstruction,
} from "@solana/web3.js";

import {
  errorText,
  formatRpcDiagnostic,
  submitConfirmedAndAwaitFinalized,
} from "./tokenomicsUpgradeProposal";
import {
  IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG,
  validateIdealerProgramExtensionProposalConfig,
} from "./idealerProgramExtensionProposalConfig";
import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { verifyExpectedDevnetMultisig } from "./squadsProvisioning";

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
const SET_AUTHORITY_DISCRIMINATOR = 4;
const EXTEND_PROGRAM_DISCRIMINATOR = 6;

export interface IdealerProgramExtensionProposalSummary {
  bridgeAuthorityAddress: string;
  currentCapacity: number;
  currentSha256: string;
  extensionBytes: number;
  multisigAddress: string;
  payerBalanceLamports: bigint;
  programDataAddress: string;
  programDataLamports: bigint;
  programId: string;
  proposalAddress: string;
  requiredProgramDataLamports: bigint;
  targetCapacity: number;
  transactionAddress: string;
  transactionIndex: bigint;
  vaultAddress: string;
}

export interface PreparedIdealerProgramExtensionProposal {
  instructions: readonly KitInstruction[];
  rpcEndpoint: string;
  summary: IdealerProgramExtensionProposalSummary;
}

export interface IdealerProgramExtensionProposalResult
  extends IdealerProgramExtensionProposalSummary {
  signature: string;
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

function isPhantomWalletA(wallet: ConnectedWallet) {
  return (
    wallet.account.address.toString() ===
      SQUADS_DEVNET_CONFIG.members[0]?.address &&
    wallet.connector.name.toLowerCase().includes("phantom")
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
  if ((await connection.getGenesisHash()) !== SQUADS_DEVNET_CONFIG.genesisHash) {
    throw new Error(
      "The configured RPC is not Solana devnet. Proposal creation was blocked.",
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

export function createIdealerProgramExtensionInstruction(
  payerAddress: string =
    IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG.temporaryAuthorityAddress,
) {
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const data = Buffer.alloc(8);
  data.writeUInt32LE(EXTEND_PROGRAM_DISCRIMINATOR, 0);
  data.writeUInt32LE(config.extensionBytes, 4);

  return new TransactionInstruction({
    data,
    keys: [
      {
        isSigner: false,
        isWritable: true,
        pubkey: new PublicKey(config.programDataAddress),
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: new PublicKey(config.programId),
      },
      {
        isSigner: false,
        isWritable: false,
        pubkey: SystemProgram.programId,
      },
      {
        isSigner: true,
        isWritable: true,
        pubkey: new PublicKey(payerAddress),
      },
    ],
    programId: new PublicKey(config.loaderProgramId),
  });
}

function createIdealerProgramDataAuthorityInstruction({
  currentAuthorityAddress,
  newAuthorityAddress,
}: {
  currentAuthorityAddress: string;
  newAuthorityAddress: string;
}) {
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const data = Buffer.alloc(4);
  data.writeUInt32LE(SET_AUTHORITY_DISCRIMINATOR, 0);

  return new TransactionInstruction({
    data,
    keys: [
      {
        isSigner: false,
        isWritable: true,
        pubkey: new PublicKey(config.programDataAddress),
      },
      {
        isSigner: true,
        isWritable: false,
        pubkey: new PublicKey(currentAuthorityAddress),
      },
      {
        isSigner: false,
        isWritable: false,
        pubkey: new PublicKey(newAuthorityAddress),
      },
    ],
    programId: new PublicKey(config.loaderProgramId),
  });
}

export function createIdealerProgramDataAuthorityBridgeInstruction() {
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  return createIdealerProgramDataAuthorityInstruction({
    currentAuthorityAddress: config.vaultAddress,
    newAuthorityAddress: config.temporaryAuthorityAddress,
  });
}

export function createIdealerProgramDataAuthorityReturnInstruction() {
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  return createIdealerProgramDataAuthorityInstruction({
    currentAuthorityAddress: config.temporaryAuthorityAddress,
    newAuthorityAddress: config.vaultAddress,
  });
}

async function assertReviewedProgramData(connection: Connection) {
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const loader = new PublicKey(config.loaderProgramId);
  const program = new PublicKey(config.programId);
  const programData = new PublicKey(config.programDataAddress);
  const [programInfo, programDataInfo, checkedExtensionFeatureInfo] =
    await connection.getMultipleAccountsInfo(
      [
        program,
        programData,
        new PublicKey(config.extendProgramCheckedFeatureAddress),
      ],
      "finalized",
    );

  if (
    !programInfo ||
    !programInfo.executable ||
    !programInfo.owner.equals(loader) ||
    programInfo.data.length !== 36 ||
    programInfo.data.readUInt32LE(0) !== 2 ||
    !new PublicKey(programInfo.data.subarray(4, 36)).equals(programData)
  ) {
    throw new Error("Idealer does not link to the reviewed ProgramData.");
  }
  if (checkedExtensionFeatureInfo) {
    throw new Error(
      "ExtendProgramChecked activated on devnet. The reviewed legacy extension path is no longer valid.",
    );
  }
  if (
    !programDataInfo ||
    !programDataInfo.owner.equals(loader) ||
    decodeProgramDataAuthority(programDataInfo.data) !== config.vaultAddress
  ) {
    throw new Error(
      "Idealer ProgramData is not controlled by Squads vault 0.",
    );
  }

  const programBytes = programDataInfo.data.subarray(
    PROGRAM_DATA_METADATA_LENGTH,
  );
  if (programBytes.length !== config.currentCapacity) {
    throw new Error("Idealer ProgramData capacity changed.");
  }
  if ((await sha256Hex(programBytes)) !== config.currentSha256) {
    throw new Error("Idealer deployed bytes changed.");
  }
  if (programDataInfo.lamports !== config.currentProgramDataLamports) {
    throw new Error(
      "Idealer ProgramData funding changed from the reviewed pre-extension balance.",
    );
  }

  return BigInt(programDataInfo.lamports);
}

export async function prepareIdealerProgramExtensionProposal({
  creatorAddress,
  rpcEndpoint,
}: {
  creatorAddress: string;
  rpcEndpoint: string;
}): Promise<PreparedIdealerProgramExtensionProposal> {
  const configErrors = validateIdealerProgramExtensionProposalConfig();
  if (configErrors.length > 0) {
    throw new Error(configErrors.join(" "));
  }
  if (creatorAddress !== SQUADS_DEVNET_CONFIG.members[0]?.address) {
    throw new Error("Only devnet wallet A can create this extension proposal.");
  }

  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "confirmed");
  await assertDevnetConnection(connection);
  await verifyExpectedDevnetMultisig({
    multisigAddress:
      IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG.multisigAddress,
    rpcEndpoint,
  });
  const programDataLamports = await assertReviewedProgramData(connection);

  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const multisigPda = new PublicKey(config.multisigAddress);
  const creator = new PublicKey(creatorAddress);
  const squadsProgramId = new PublicKey(SQUADS_DEVNET_CONFIG.programId);
  const multisigAccount =
    await multisigSdk.accounts.Multisig.fromAccountAddress(
      connection,
      multisigPda,
      "confirmed",
    );
  const transactionIndex =
    bigintFromSdkValue(multisigAccount.transactionIndex) + 1n;
  const [transactionAddress] = multisigSdk.getTransactionPda({
    index: transactionIndex,
    multisigPda,
    programId: squadsProgramId,
  });
  const [proposalAddress] = multisigSdk.getProposalPda({
    multisigPda,
    programId: squadsProgramId,
    transactionIndex,
  });
  const [transactionInfo, proposalInfo, payerBalanceLamports] =
    await Promise.all([
      connection.getAccountInfo(transactionAddress, "confirmed"),
      connection.getAccountInfo(proposalAddress, "confirmed"),
      connection.getBalance(creator, "confirmed"),
    ]);
  if (transactionInfo || proposalInfo) {
    throw new Error(
      "The next Squads transaction index is already occupied. Prepare again.",
    );
  }

  const transactionMessage = new TransactionMessage({
    instructions: [createIdealerProgramDataAuthorityBridgeInstruction()],
    payerKey: new PublicKey(config.vaultAddress),
    recentBlockhash: PublicKey.default.toBase58(),
  });
  const createVaultTransaction =
    multisigSdk.instructions.vaultTransactionCreate({
      creator,
      ephemeralSigners: 0,
      memo: config.memo,
      multisigPda,
      programId: squadsProgramId,
      transactionIndex,
      transactionMessage,
      vaultIndex: config.vaultIndex,
    });
  const createProposal = multisigSdk.instructions.proposalCreate({
    creator,
    isDraft: false,
    multisigPda,
    programId: squadsProgramId,
    transactionIndex,
  });

  return {
    instructions: [
      convertLegacyInstruction(createVaultTransaction),
      convertLegacyInstruction(createProposal),
    ],
    rpcEndpoint,
    summary: {
      bridgeAuthorityAddress: config.temporaryAuthorityAddress,
      currentCapacity: config.currentCapacity,
      currentSha256: config.currentSha256,
      extensionBytes: config.extensionBytes,
      multisigAddress: config.multisigAddress,
      payerBalanceLamports: BigInt(payerBalanceLamports),
      programDataAddress: config.programDataAddress,
      programDataLamports,
      programId: config.programId,
      proposalAddress: proposalAddress.toBase58(),
      requiredProgramDataLamports: BigInt(
        config.requiredProgramDataLamports,
      ),
      targetCapacity: config.targetCapacity,
      transactionAddress: transactionAddress.toBase58(),
      transactionIndex,
      vaultAddress: config.vaultAddress,
    },
  };
}

async function verifyCreatedProposal(
  prepared: PreparedIdealerProgramExtensionProposal,
) {
  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(prepared.rpcEndpoint, "finalized");
  await assertDevnetConnection(connection);
  await assertReviewedProgramData(connection);

  const [vaultTransaction, proposal] = await Promise.all([
    multisigSdk.accounts.VaultTransaction.fromAccountAddress(
      connection,
      new PublicKey(prepared.summary.transactionAddress),
      "finalized",
    ),
    multisigSdk.accounts.Proposal.fromAccountAddress(
      connection,
      new PublicKey(prepared.summary.proposalAddress),
      "finalized",
    ),
  ]);
  const walletA = SQUADS_DEVNET_CONFIG.members[0]!.address;
  if (
    vaultTransaction.multisig.toBase58() !==
      prepared.summary.multisigAddress ||
    vaultTransaction.creator.toBase58() !== walletA ||
    bigintFromSdkValue(vaultTransaction.index) !==
      prepared.summary.transactionIndex ||
    vaultTransaction.vaultIndex !==
      IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG.vaultIndex
  ) {
    throw new Error("The finalized Squads vault transaction failed read-back.");
  }
  if (
    proposal.multisig.toBase58() !== prepared.summary.multisigAddress ||
    bigintFromSdkValue(proposal.transactionIndex) !==
      prepared.summary.transactionIndex ||
    proposal.status.__kind !== "Active" ||
    proposal.approved.length !== 0 ||
    proposal.rejected.length !== 0 ||
    proposal.cancelled.length !== 0
  ) {
    throw new Error(
      "The finalized proposal is not active with zero votes as required.",
    );
  }

  const message = vaultTransaction.message;
  const inner = message.instructions[0];
  const expectedInstruction =
    createIdealerProgramDataAuthorityBridgeInstruction();
  if (
    message.instructions.length !== 1 ||
    message.addressTableLookups.length !== 0 ||
    !inner ||
    !Buffer.from(inner.data).equals(expectedInstruction.data)
  ) {
    throw new Error(
      "The stored proposal does not contain only the reviewed authority bridge.",
    );
  }
  const actualAccounts = Array.from(
    inner.accountIndexes,
    (index) => message.accountKeys[index]?.toBase58(),
  );
  const expectedAccounts = expectedInstruction.keys.map((key) =>
    key.pubkey.toBase58(),
  );
  if (
    message.accountKeys[inner.programIdIndex]?.toBase58() !==
      expectedInstruction.programId.toBase58() ||
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
        `The proposal transaction failed on-chain: ${formatRpcDiagnostic(status.err)}.`,
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
    "The proposal was submitted but did not reach finalized commitment within 120 seconds.",
  );
}

export async function signSimulateSendAndVerifyExtensionProposal({
  client,
  prepared,
  wallet,
}: {
  client: SolanaClient;
  prepared: PreparedIdealerProgramExtensionProposal;
  wallet: ConnectedWallet;
}): Promise<IdealerProgramExtensionProposalResult> {
  if (!isPhantomWalletA(wallet)) {
    throw new Error(
      "Proposal creation requires Phantom connected to devnet wallet A.",
    );
  }
  const walletSigner = createWalletTransactionSigner(wallet, {
    commitment: "confirmed",
  });
  if (walletSigner.mode !== "partial") {
    throw new Error(
      "This Phantom connection cannot return signed bytes for simulation. Nothing was submitted.",
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
  const simulation = await client.runtime.rpc
    .simulateTransaction(getBase64EncodedWireTransaction(signedTransaction), {
      commitment: "confirmed",
      encoding: "base64",
      replaceRecentBlockhash: false,
      sigVerify: true,
    })
    .send();
  if (simulation.value.err) {
    const logs =
      simulation.value.logs?.slice(-8).join(" ") ?? "No logs returned.";
    throw new Error(
      `The signed proposal failed simulation and was not submitted. ${formatRpcDiagnostic(simulation.value.err)} ${logs}`,
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
      `The proposal was not submitted or finalized: ${errorText(error)}`,
      { cause: error },
    );
  }

  await verifyCreatedProposal(prepared);
  return { ...prepared.summary, signature };
}
