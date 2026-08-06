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

import { decodeGlobalConfigAccount } from "./tycheProgram";
import {
  TYCHE_VRF_CONFIG_PROPOSAL_CONFIG,
  validateTycheVrfConfigProposalConfig,
} from "./tycheVrfConfigProposalConfig";
import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { verifyExpectedDevnetMultisig } from "./squadsProvisioning";
import {
  errorText,
  formatRpcDiagnostic,
  submitConfirmedAndAwaitFinalized,
} from "./tokenomicsUpgradeProposal";
import { readTokenomicsUpgradeGovernanceState } from "./tokenomicsUpgradeGovernance";

type SolanaClient = ReturnType<typeof useSolanaClient>;
type WalletConnection = ReturnType<typeof useWalletConnection>;
type ConnectedWallet = NonNullable<WalletConnection["wallet"]>;
type ConfirmableTransaction = Parameters<
  SolanaClient["actions"]["sendTransaction"]
>[0];
type KitInstruction = Parameters<
  SolanaClient["transaction"]["prepare"]
>[0]["instructions"][number];

const GLOBAL_CONFIG_DISCRIMINATOR = Uint8Array.of(
  149,
  8,
  156,
  202,
  160,
  252,
  176,
  217,
);
const SET_VRF_CONFIG_DISCRIMINATOR = Uint8Array.of(
  53,
  52,
  195,
  216,
  205,
  110,
  46,
  74,
);
const LOADER_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const FINALIZATION_TIMEOUT_MS = 120_000;
const FINALIZATION_POLL_INTERVAL_MS = 1_000;

export interface TycheVrfConfigProposalSummary {
  currentDrawProvider: string;
  currentElectionProvider: string;
  globalConfigAddress: string;
  multisigAddress: string;
  nextTurnId: number;
  payerBalanceLamports: bigint;
  programDataAddress: string;
  programId: string;
  proposalAddress: string;
  targetDrawProvider: string;
  targetElectionProvider: string;
  transactionAddress: string;
  transactionIndex: bigint;
  vaultAddress: string;
}

export interface PreparedTycheVrfConfigProposal {
  instructions: readonly KitInstruction[];
  rpcEndpoint: string;
  summary: TycheVrfConfigProposalSummary;
}

export interface TycheVrfConfigProposalResult
  extends TycheVrfConfigProposalSummary {
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

function isPhantomWalletA(wallet: ConnectedWallet) {
  return (
    wallet.connector.name.toLowerCase().includes("phantom") &&
    wallet.account.address.toString() ===
      SQUADS_DEVNET_CONFIG.members[0]!.address
  );
}

function decodeProgramDataAuthority(data: Buffer) {
  if (
    data.length < 45 ||
    data.readUInt32LE(0) !== 3 ||
    data.readUInt8(12) !== 1
  ) {
    throw new Error("Tyche has invalid ProgramData metadata.");
  }
  return new PublicKey(data.subarray(13, 45)).toBase58();
}

function decodeVrfProviderAddresses(data: Buffer) {
  if (
    data.length < 137 ||
    !Buffer.from(data.subarray(0, 8)).equals(
      Buffer.from(GLOBAL_CONFIG_DISCRIMINATOR),
    )
  ) {
    throw new Error("Tyche GlobalConfig metadata is invalid.");
  }

  let offset = 8 + 32;
  const pendingAuthorityTag = data.readUInt8(offset);
  offset += 1;
  if (pendingAuthorityTag === 1) {
    offset += 32;
  } else if (pendingAuthorityTag !== 0) {
    throw new Error("GlobalConfig pending authority option is invalid.");
  }
  offset += 32;

  return {
    drawProvider: new PublicKey(data.subarray(offset, offset + 32)).toBase58(),
    electionProvider: new PublicKey(
      data.subarray(offset + 32, offset + 64),
    ).toBase58(),
  };
}

export function createTycheVrfConfigInstruction() {
  const config = TYCHE_VRF_CONFIG_PROPOSAL_CONFIG;
  const target = new PublicKey(config.targetProviderAddress);
  return new TransactionInstruction({
    data: Buffer.concat([
      Buffer.from(SET_VRF_CONFIG_DISCRIMINATOR),
      target.toBuffer(),
      target.toBuffer(),
    ]),
    keys: [
      {
        isSigner: true,
        isWritable: false,
        pubkey: new PublicKey(config.governanceAuthority),
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: new PublicKey(config.globalConfigAddress),
      },
      {
        isSigner: false,
        isWritable: false,
        pubkey: new PublicKey(config.programDataAddress),
      },
    ],
    programId: new PublicKey(config.programId),
  });
}

async function assertReviewedPreProposalState(connection: Connection) {
  const config = TYCHE_VRF_CONFIG_PROPOSAL_CONFIG;
  const upgradeState = await readTokenomicsUpgradeGovernanceState(
    connection.rpcEndpoint,
  );
  if (
    !upgradeState.upgradeComplete ||
    upgradeState.programSha256 !==
      "3a8da33f590768b399e93aa6497cf92b2218701b9a9dd1e6342cc0c663bce200"
  ) {
    throw new Error("The reviewed ProgramData-governed artifact is not deployed.");
  }

  const [
    globalConfigInfo,
    programDataInfo,
    oraoProgramInfo,
    oraoNetworkStateInfo,
  ] = await connection.getMultipleAccountsInfo(
    [
      new PublicKey(config.globalConfigAddress),
      new PublicKey(config.programDataAddress),
      new PublicKey(config.oraoProgramId),
      new PublicKey(config.targetProviderAddress),
    ],
    "finalized",
  );
  const tycheProgram = new PublicKey(config.programId);
  const oraoProgram = new PublicKey(config.oraoProgramId);
  if (!globalConfigInfo || !globalConfigInfo.owner.equals(tycheProgram)) {
    throw new Error("The reviewed Tyche GlobalConfig account is unavailable.");
  }
  if (
    !programDataInfo ||
    !programDataInfo.owner.equals(LOADER_ID) ||
    decodeProgramDataAuthority(programDataInfo.data) !==
      config.governanceAuthority
  ) {
    throw new Error("Tyche ProgramData is not controlled by Squads vault 0.");
  }
  if (
    !oraoProgramInfo ||
    !oraoProgramInfo.executable ||
    !oraoNetworkStateInfo ||
    !oraoNetworkStateInfo.owner.equals(oraoProgram)
  ) {
    throw new Error("The official ORAO devnet program state is unavailable.");
  }

  const globalConfig = decodeGlobalConfigAccount(globalConfigInfo.data);
  if (globalConfig.hasActiveTurn || globalConfig.activeTurnId !== 0) {
    throw new Error(
      "An Tyche turn is active. VRF configuration cannot change now.",
    );
  }
  const providers = decodeVrfProviderAddresses(globalConfigInfo.data);
  if (
    providers.drawProvider !== config.currentProviderAddress ||
    providers.electionProvider !== config.currentProviderAddress
  ) {
    throw new Error(
      "The current VRF provider configuration differs from the review.",
    );
  }

  return {
    ...providers,
    nextTurnId: globalConfig.nextTurnId,
  };
}

export async function prepareTycheVrfConfigProposal({
  creatorAddress,
  rpcEndpoint,
}: {
  creatorAddress: string;
  rpcEndpoint: string;
}): Promise<PreparedTycheVrfConfigProposal> {
  const configErrors = validateTycheVrfConfigProposalConfig();
  if (configErrors.length > 0) {
    throw new Error(configErrors.join(" "));
  }
  if (creatorAddress !== SQUADS_DEVNET_CONFIG.members[0]!.address) {
    throw new Error("Only devnet wallet A can create this proposal.");
  }

  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "confirmed");
  await assertDevnetConnection(connection);
  await verifyExpectedDevnetMultisig({
    multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
    rpcEndpoint,
  });
  const providerState = await assertReviewedPreProposalState(connection);

  const config = TYCHE_VRF_CONFIG_PROPOSAL_CONFIG;
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
    instructions: [createTycheVrfConfigInstruction()],
    payerKey: new PublicKey(config.governanceAuthority),
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
      currentDrawProvider: providerState.drawProvider,
      currentElectionProvider: providerState.electionProvider,
      globalConfigAddress: config.globalConfigAddress,
      multisigAddress: config.multisigAddress,
      nextTurnId: providerState.nextTurnId,
      payerBalanceLamports: BigInt(payerBalanceLamports),
      programDataAddress: config.programDataAddress,
      programId: config.programId,
      proposalAddress: proposalAddress.toBase58(),
      targetDrawProvider: config.targetProviderAddress,
      targetElectionProvider: config.targetProviderAddress,
      transactionAddress: transactionAddress.toBase58(),
      transactionIndex,
      vaultAddress: config.governanceAuthority,
    },
  };
}

async function verifyCreatedProposal(
  prepared: PreparedTycheVrfConfigProposal,
) {
  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(prepared.rpcEndpoint, "finalized");
  await assertDevnetConnection(connection);
  await assertReviewedPreProposalState(connection);

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
      TYCHE_VRF_CONFIG_PROPOSAL_CONFIG.vaultIndex
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
  const expectedInstruction = createTycheVrfConfigInstruction();
  if (
    message.instructions.length !== 1 ||
    message.addressTableLookups.length !== 0 ||
    !inner ||
    !Buffer.from(inner.data).equals(expectedInstruction.data)
  ) {
    throw new Error(
      "The stored proposal does not contain only the reviewed VRF configuration.",
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
    throw new Error("The stored VRF configuration accounts differ from review.");
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
    "The proposal transaction did not reach finalized commitment within 120 seconds.",
  );
}

export async function signSimulateSendAndVerifyTycheVrfConfigProposal({
  client,
  prepared,
  wallet,
}: {
  client: SolanaClient;
  prepared: PreparedTycheVrfConfigProposal;
  wallet: ConnectedWallet;
}): Promise<TycheVrfConfigProposalResult> {
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
      simulation.value.logs?.slice(-10).join(" ") ?? "No logs returned.";
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
