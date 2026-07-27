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
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  TransactionMessage,
  type TransactionInstruction as LegacyTransactionInstruction,
} from "@solana/web3.js";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { verifyExpectedDevnetMultisig } from "./squadsProvisioning";
import {
  TOKENOMICS_UPGRADE_PROPOSAL_CONFIG,
  validateTokenomicsUpgradeProposalConfig,
} from "./tokenomicsUpgradeProposalConfig";

type SolanaClient = ReturnType<typeof useSolanaClient>;
type WalletConnection = ReturnType<typeof useWalletConnection>;
type ConnectedWallet = NonNullable<WalletConnection["wallet"]>;
type ConfirmableTransaction = Parameters<
  SolanaClient["actions"]["sendTransaction"]
>[0];
type KitInstruction = Parameters<
  SolanaClient["transaction"]["prepare"]
>[0]["instructions"][number];

const BUFFER_METADATA_LENGTH = 37;
const FINALIZATION_TIMEOUT_MS = 120_000;
const FINALIZATION_POLL_INTERVAL_MS = 1_000;
const UPGRADE_INSTRUCTION_DATA = Uint8Array.of(3, 0, 0, 0);

export interface TokenomicsUpgradeProposalSummary {
  bufferAddress: string;
  bufferProgramLength: number;
  bufferSha256: string;
  multisigAddress: string;
  payerBalanceLamports: bigint;
  programDataAddress: string;
  programId: string;
  proposalAddress: string;
  transactionAddress: string;
  transactionIndex: bigint;
  vaultAddress: string;
}

export interface PreparedTokenomicsUpgradeProposal {
  instructions: readonly KitInstruction[];
  rpcEndpoint: string;
  summary: TokenomicsUpgradeProposalSummary;
}

export interface TokenomicsUpgradeProposalResult
  extends TokenomicsUpgradeProposalSummary {
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

function collectErrorDiagnostics(
  value: unknown,
  output: string[],
  depth = 0,
): void {
  if (depth > 5 || output.length >= 8) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
      output.push(trimmed);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectErrorDiagnostics(item, output, depth + 1);
    }
    return;
  }
  if (typeof value !== "object" || value === null) {
    return;
  }
  const record = value as Record<string, unknown>;
  for (const key of [
    "message",
    "cause",
    "context",
    "__serverMessage",
    "err",
    "error",
    "logs",
  ]) {
    if (key in record) {
      collectErrorDiagnostics(record[key], output, depth + 1);
    }
  }
}

export function errorText(error: unknown) {
  const diagnostics: string[] = [];
  collectErrorDiagnostics(error, diagnostics);
  const unique = [...new Set(diagnostics)].slice(0, 6);
  return unique.length > 0 ? unique.join(" ") : String(error);
}

export function formatRpcDiagnostic(value: unknown) {
  try {
    return (
      JSON.stringify(value, (_key, nestedValue) =>
        typeof nestedValue === "bigint"
          ? nestedValue.toString()
          : nestedValue,
      ) ?? String(value)
    );
  } catch (serializationError) {
    return `${errorText(value)} [diagnostic serialization failed: ${errorText(serializationError)}]`;
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

function isPhantomWalletA(wallet: ConnectedWallet) {
  return (
    wallet.account.address.toString() ===
      SQUADS_DEVNET_CONFIG.members[0]?.address &&
    wallet.connector.name.toLowerCase().includes("phantom")
  );
}

async function assertDevnetConnection(connection: Connection) {
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== SQUADS_DEVNET_CONFIG.genesisHash) {
    throw new Error(
      "The configured RPC is not Solana devnet. Proposal creation was blocked.",
    );
  }
}

function decodeProgramDataAuthority(data: Buffer) {
  if (data.length < 13 || data.readUInt32LE(0) !== 3) {
    throw new Error("Idealer has an invalid ProgramData account.");
  }
  const authorityOption = data.readUInt8(12);
  if (authorityOption === 0) {
    return null;
  }
  if (authorityOption !== 1 || data.length < 45) {
    throw new Error("Idealer has an invalid upgrade authority option.");
  }
  return new PublicKey(data.subarray(13, 45)).toBase58();
}

function decodeBufferAuthority(data: Buffer) {
  if (data.length < BUFFER_METADATA_LENGTH || data.readUInt32LE(0) !== 1) {
    throw new Error("The reviewed account is not an upgradeable-loader buffer.");
  }
  const authorityOption = data.readUInt8(4);
  if (authorityOption !== 1) {
    throw new Error("The reviewed buffer has no upgrade authority.");
  }
  return new PublicKey(data.subarray(5, BUFFER_METADATA_LENGTH)).toBase58();
}

async function sha256Hex(data: Uint8Array) {
  const bytes = new Uint8Array(data);
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export function createTokenomicsUpgradeInstruction() {
  const config = TOKENOMICS_UPGRADE_PROPOSAL_CONFIG;
  return new TransactionInstruction({
    data: Buffer.from(UPGRADE_INSTRUCTION_DATA),
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
        isWritable: true,
        pubkey: new PublicKey(config.bufferAddress),
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: new PublicKey(config.spillAddress),
      },
      { isSigner: false, isWritable: false, pubkey: SYSVAR_RENT_PUBKEY },
      { isSigner: false, isWritable: false, pubkey: SYSVAR_CLOCK_PUBKEY },
      {
        isSigner: true,
        isWritable: false,
        pubkey: new PublicKey(config.vaultAddress),
      },
    ],
    programId: new PublicKey(config.loaderProgramId),
  });
}

async function assertReviewedProgramAndBuffer(connection: Connection) {
  const config = TOKENOMICS_UPGRADE_PROPOSAL_CONFIG;
  const loader = new PublicKey(config.loaderProgramId);
  const program = new PublicKey(config.programId);
  const programData = new PublicKey(config.programDataAddress);
  const buffer = new PublicKey(config.bufferAddress);
  const [programInfo, programDataInfo, bufferInfo] =
    await connection.getMultipleAccountsInfo(
      [program, programData, buffer],
      "finalized",
    );

  if (
    !programInfo ||
    !programInfo.executable ||
    !programInfo.owner.equals(loader) ||
    programInfo.data.length < 36 ||
    programInfo.data.readUInt32LE(0) !== 2
  ) {
    throw new Error("Idealer is not the reviewed upgradeable program.");
  }
  const linkedProgramData = new PublicKey(programInfo.data.subarray(4, 36));
  if (!linkedProgramData.equals(programData)) {
    throw new Error("Idealer links to a different ProgramData account.");
  }
  if (!programDataInfo || !programDataInfo.owner.equals(loader)) {
    throw new Error("Idealer ProgramData could not be verified.");
  }
  if (decodeProgramDataAuthority(programDataInfo.data) !== config.vaultAddress) {
    throw new Error(
      "Idealer upgrade authority is not Squads vault 0.",
    );
  }
  const deployedBytes = programDataInfo.data.subarray(45);
  if (deployedBytes.length !== config.programDataCapacity) {
    throw new Error("Idealer ProgramData capacity does not match the review.");
  }
  const deployedPrefix = deployedBytes.subarray(
    0,
    config.currentProgramPrefixLength,
  );
  const zeroPadding = deployedBytes.subarray(
    config.currentProgramPrefixLength,
  );
  if (
    (await sha256Hex(deployedPrefix)) !==
      config.currentProgramPrefixSha256 ||
    zeroPadding.some((byte) => byte !== 0)
  ) {
    throw new Error(
      "Idealer deployed bytes or pre-upgrade zero padding differ from the review.",
    );
  }
  if (!bufferInfo || !bufferInfo.owner.equals(loader)) {
    throw new Error("The reviewed buffer is missing or has the wrong owner.");
  }
  if (decodeBufferAuthority(bufferInfo.data) !== config.vaultAddress) {
    throw new Error("The reviewed buffer authority is not Squads vault 0.");
  }

  const programBytes = bufferInfo.data.subarray(BUFFER_METADATA_LENGTH);
  if (programBytes.length !== config.bufferProgramLength) {
    throw new Error("The on-chain buffer length does not match the review.");
  }
  const bufferHash = await sha256Hex(programBytes);
  if (bufferHash !== config.bufferSha256) {
    throw new Error("The on-chain buffer SHA-256 does not match the review.");
  }
}

export async function prepareTokenomicsUpgradeProposal({
  creatorAddress,
  rpcEndpoint,
}: {
  creatorAddress: string;
  rpcEndpoint: string;
}): Promise<PreparedTokenomicsUpgradeProposal> {
  const configErrors = validateTokenomicsUpgradeProposalConfig();
  if (configErrors.length > 0) {
    throw new Error(configErrors.join(" "));
  }
  if (creatorAddress !== SQUADS_DEVNET_CONFIG.members[0]?.address) {
    throw new Error("Only devnet wallet A can create this upgrade proposal.");
  }

  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "confirmed");
  await assertDevnetConnection(connection);
  await verifyExpectedDevnetMultisig({
    multisigAddress: TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.multisigAddress,
    rpcEndpoint,
  });
  await assertReviewedProgramAndBuffer(connection);

  const config = TOKENOMICS_UPGRADE_PROPOSAL_CONFIG;
  const multisigPda = new PublicKey(config.multisigAddress);
  const creator = new PublicKey(creatorAddress);
  const programId = new PublicKey(SQUADS_DEVNET_CONFIG.programId);
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
    programId,
  });
  const [proposalAddress] = multisigSdk.getProposalPda({
    multisigPda,
    programId,
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
    instructions: [createTokenomicsUpgradeInstruction()],
    payerKey: new PublicKey(config.vaultAddress),
    recentBlockhash: PublicKey.default.toBase58(),
  });
  const createVaultTransaction =
    multisigSdk.instructions.vaultTransactionCreate({
      creator,
      ephemeralSigners: 0,
      memo: config.memo,
      multisigPda,
      programId,
      transactionIndex,
      transactionMessage,
      vaultIndex: config.vaultIndex,
    });
  const createProposal = multisigSdk.instructions.proposalCreate({
    creator,
    isDraft: false,
    multisigPda,
    programId,
    transactionIndex,
  });

  return {
    instructions: [
      convertLegacyInstruction(createVaultTransaction),
      convertLegacyInstruction(createProposal),
    ],
    rpcEndpoint,
    summary: {
      bufferAddress: config.bufferAddress,
      bufferProgramLength: config.bufferProgramLength,
      bufferSha256: config.bufferSha256,
      multisigAddress: config.multisigAddress,
      payerBalanceLamports: BigInt(payerBalanceLamports),
      programDataAddress: config.programDataAddress,
      programId: config.programId,
      proposalAddress: proposalAddress.toBase58(),
      transactionAddress: transactionAddress.toBase58(),
      transactionIndex,
      vaultAddress: config.vaultAddress,
    },
  };
}

async function verifyCreatedProposal(
  prepared: PreparedTokenomicsUpgradeProposal,
) {
  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(prepared.rpcEndpoint, "finalized");
  await assertDevnetConnection(connection);
  await assertReviewedProgramAndBuffer(connection);

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
      TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.vaultIndex
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
  if (
    message.instructions.length !== 1 ||
    message.addressTableLookups.length !== 0 ||
    !inner ||
    !Buffer.from(inner.data).equals(Buffer.from(UPGRADE_INSTRUCTION_DATA))
  ) {
    throw new Error("The stored proposal does not contain only one upgrade.");
  }
  const loader = message.accountKeys[inner.programIdIndex];
  const innerAccounts = Array.from(
    inner.accountIndexes,
    (index) => message.accountKeys[index]?.toBase58(),
  );
  const expectedAccounts = createTokenomicsUpgradeInstruction().keys.map(
    (key) => key.pubkey.toBase58(),
  );
  if (
    loader?.toBase58() !==
      TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.loaderProgramId ||
    innerAccounts.length !== expectedAccounts.length ||
    innerAccounts.some((account, index) => account !== expectedAccounts[index])
  ) {
    throw new Error("The stored upgrade accounts differ from the review.");
  }
}

export async function submitConfirmedAndAwaitFinalized({
  send,
  waitForFinalized,
}: {
  send: (commitment: "confirmed") => Promise<string>;
  waitForFinalized: (signature: string) => Promise<void>;
}) {
  const signature = await send("confirmed");
  await waitForFinalized(signature);
  return signature;
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
        `The proposal transaction failed on-chain: ${JSON.stringify(status.err)}.`,
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

export async function signSimulateSendAndVerifyUpgradeProposal({
  client,
  prepared,
  wallet,
}: {
  client: SolanaClient;
  prepared: PreparedTokenomicsUpgradeProposal;
  wallet: ConnectedWallet;
}): Promise<TokenomicsUpgradeProposalResult> {
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
      simulation.value.logs?.slice(-8).join(" ") ?? "No logs returned.";
    throw new Error(
      `The signed proposal failed simulation and was not submitted. ${JSON.stringify(simulation.value.err)} ${logs}`,
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
