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
import {
  CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
  CAMPAIGN_V1_ECONOMIC_CONFIG_HASH,
  CAMPAIGN_V2_ECONOMIC_CONFIG_HASH,
} from "@idealer/constants";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { verifyExpectedDevnetMultisig } from "./squadsProvisioning";
import {
  errorText,
  formatRpcDiagnostic,
  submitConfirmedAndAwaitFinalized,
  waitForFinalizedSignature,
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

const MIGRATION_INSTRUCTION_DATA = Uint8Array.of(
  100,
  178,
  128,
  189,
  111,
  51,
  245,
  184,
);
const EXPECTED_ORIGINAL_ALLOCATION_ATOMS = 200_000_000_000_000_000n;
const EXPECTED_CUMULATIVE_DISTRIBUTED_ATOMS = 5_395_925_000n;
const EXPECTED_REMAINING_ATOMS = 199_999_994_604_075_000n;
const TOKEN_PROGRAM_ID = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export const TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG = Object.freeze({
  campaignAddress: "426KgUGKdFfAAVkwg1oSep8Ki5AtFpmwCbA3ccBkyYi7",
  campaignVaultAddress: "2Ye9hSxMPwiAAgeMnuUoaCNDGBKTLcrTAekjJ7EwqbQq",
  memo: "JUSDEALER devnet campaign 0 JDR reward economics v1 to v2 migration",
  mintAddress: "FssXNhB2mUSjavX7jsXLuZevfGnJ5zn98nNNUbrY16rr",
  multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
  network: "devnet",
  programId: "BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm",
  proposalAddress: "4saa7Baohb9wPXvC71K56DQucVfUxYPo7aaDqos1pgjF",
  tokenConfigAddress: "4n2zaCSNHs8vykQ9E2L9MQSnrmQFFx3wrhz2YSBx1vLf",
  transactionAddress: "DWfb5yCKFttJpnA6wKAKu3u4ErSqtjuwrDZtfVWFRQAs",
  transactionIndex: 10n,
  vaultAddress: SQUADS_DEVNET_CONFIG.vaultAddress,
  vaultIndex: SQUADS_DEVNET_CONFIG.vaultIndex,
} as const);

export type CampaignV2MigrationAction = "create" | "approve" | "execute";
export type CampaignV2MigrationStatus =
  | "NotCreated"
  | "Active"
  | "Approved"
  | "Executed";

export interface CampaignV2Snapshot {
  cumulativeDistributedAtoms: bigint;
  economicConfigHash: string;
  originalAllocationAtoms: bigint;
  paused: boolean;
  remainingAtoms: bigint;
  state: number;
  unusedBalancePolicyHash: string;
  vaultAmountAtoms: bigint;
}

export interface CampaignV2MigrationState extends CampaignV2Snapshot {
  approved: readonly string[];
  cancelled: readonly string[];
  proposalAddress: string;
  rejected: readonly string[];
  status: CampaignV2MigrationStatus;
  transactionAddress: string;
}

export interface PreparedCampaignV2MigrationAction {
  action: CampaignV2MigrationAction;
  instructions: readonly KitInstruction[];
  memberAddress: string;
  rpcEndpoint: string;
  stateBefore: CampaignV2MigrationState;
}

export interface CampaignV2MigrationResult {
  action: CampaignV2MigrationAction;
  signature: string;
  state: CampaignV2MigrationState;
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
      "The configured RPC is not Solana devnet. Campaign migration was blocked.",
    );
  }
}

function hashHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

export function decodeCampaignV2Snapshot({
  campaignData,
  vaultData,
}: {
  campaignData: Uint8Array;
  vaultData: Uint8Array;
}): CampaignV2Snapshot {
  const campaign = Buffer.from(campaignData);
  const vault = Buffer.from(vaultData);
  if (campaign.length !== 171 || vault.length !== 165) {
    throw new Error(
      "The campaign or token vault layout differs from the review.",
    );
  }
  if (
    campaign.readBigUInt64LE(8) !== 0n ||
    new PublicKey(campaign.subarray(16, 48)).toBase58() !==
      TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG.mintAddress ||
    new PublicKey(campaign.subarray(48, 80)).toBase58() !==
      TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG.campaignVaultAddress ||
    new PublicKey(vault.subarray(0, 32)).toBase58() !==
      TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG.mintAddress ||
    new PublicKey(vault.subarray(32, 64)).toBase58() !==
      TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG.tokenConfigAddress
  ) {
    throw new Error("The canonical campaign identity differs from the review.");
  }

  return {
    cumulativeDistributedAtoms: campaign.readBigUInt64LE(88),
    economicConfigHash: hashHex(campaign.subarray(105, 137)),
    originalAllocationAtoms: campaign.readBigUInt64LE(80),
    paused: campaign[169] !== 0,
    remainingAtoms: campaign.readBigUInt64LE(96),
    state: campaign[104]!,
    unusedBalancePolicyHash: hashHex(campaign.subarray(137, 169)),
    vaultAmountAtoms: vault.readBigUInt64LE(64),
  };
}

function assertTokenConfig(data: Buffer) {
  if (
    data.length < 8 + 32 ||
    new PublicKey(data.subarray(8, 40)).toBase58() !==
      TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG.vaultAddress
  ) {
    throw new Error("Tokenomics governance differs from Squads vault 0.");
  }
  let cursor = 8 + 7 * 32;
  if (cursor + 4 > data.length) {
    throw new Error("Tokenomics configuration metadata is truncated.");
  }
  const metadataUriLength = data.readUInt32LE(cursor);
  cursor += 4 + metadataUriLength + 1 + 6 * 32;
  if (cursor + 4 > data.length) {
    throw new Error("Tokenomics configuration network is truncated.");
  }
  const networkLength = data.readUInt32LE(cursor);
  cursor += 4 + networkLength + 5 * 8;
  if (cursor >= data.length || data[cursor] !== 0) {
    throw new Error("Tokenomics Core is paused or its layout changed.");
  }
}

export function validateReviewedCampaignV2Snapshot(
  snapshot: CampaignV2Snapshot,
  {
    allowPostMigrationRewards,
    expectedHash,
  }: { allowPostMigrationRewards: boolean; expectedHash: string },
) {
  const distributionIsValid = allowPostMigrationRewards
    ? snapshot.cumulativeDistributedAtoms >=
        EXPECTED_CUMULATIVE_DISTRIBUTED_ATOMS &&
      snapshot.remainingAtoms <= EXPECTED_REMAINING_ATOMS
    : snapshot.cumulativeDistributedAtoms ===
        EXPECTED_CUMULATIVE_DISTRIBUTED_ATOMS &&
      snapshot.remainingAtoms === EXPECTED_REMAINING_ATOMS;
  const errors: string[] = [];
  if (
    snapshot.originalAllocationAtoms !== EXPECTED_ORIGINAL_ALLOCATION_ATOMS ||
    !distributionIsValid ||
    snapshot.vaultAmountAtoms !== snapshot.remainingAtoms ||
    snapshot.cumulativeDistributedAtoms + snapshot.remainingAtoms !==
      snapshot.originalAllocationAtoms ||
    snapshot.state !== 1 ||
    snapshot.paused ||
    snapshot.economicConfigHash !== expectedHash ||
    snapshot.unusedBalancePolicyHash !== CAMPAIGN_UNUSED_BALANCE_POLICY_HASH
  ) {
    errors.push(
      "The campaign balances, state, or configuration hashes differ from the reviewed migration boundary.",
    );
  }
  return errors;
}

function assertReviewedSnapshot(
  snapshot: CampaignV2Snapshot,
  expectedHash: string,
  allowPostMigrationRewards = false,
) {
  const errors = validateReviewedCampaignV2Snapshot(snapshot, {
    allowPostMigrationRewards,
    expectedHash,
  });
  if (errors.length > 0) {
    throw new Error(errors.join(" "));
  }
}

export function createCampaignV2MigrationInstruction() {
  const config = TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG;
  return new TransactionInstruction({
    data: Buffer.from(MIGRATION_INSTRUCTION_DATA),
    keys: [
      {
        isSigner: true,
        isWritable: false,
        pubkey: new PublicKey(config.vaultAddress),
      },
      {
        isSigner: false,
        isWritable: false,
        pubkey: new PublicKey(config.tokenConfigAddress),
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: new PublicKey(config.campaignAddress),
      },
      {
        isSigner: false,
        isWritable: false,
        pubkey: new PublicKey(config.campaignVaultAddress),
      },
    ],
    programId: new PublicKey(config.programId),
  });
}

function assertStoredMigrationMessage(vaultTransaction: {
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
  const config = TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG;
  if (
    vaultTransaction.multisig.toBase58() !== config.multisigAddress ||
    vaultTransaction.creator.toBase58() !==
      SQUADS_DEVNET_CONFIG.members[0]!.address ||
    bigintFromSdkValue(vaultTransaction.index) !== config.transactionIndex ||
    vaultTransaction.vaultIndex !== config.vaultIndex
  ) {
    throw new Error(
      "The stored campaign migration transaction identity changed.",
    );
  }
  const expected = createCampaignV2MigrationInstruction();
  const message = vaultTransaction.message;
  const instruction = message.instructions[0];
  if (
    message.instructions.length !== 1 ||
    message.addressTableLookups.length !== 0 ||
    !instruction ||
    !Buffer.from(instruction.data).equals(expected.data)
  ) {
    throw new Error(
      "The stored proposal does not contain exactly one reviewed campaign migration.",
    );
  }
  const actualProgram = message.accountKeys[instruction.programIdIndex];
  const actualAccounts = Array.from(instruction.accountIndexes, (index) =>
    message.accountKeys[index]?.toBase58(),
  );
  const expectedAccounts = expected.keys.map((key) => key.pubkey.toBase58());
  if (
    actualProgram?.toBase58() !== expected.programId.toBase58() ||
    actualAccounts.length !== expectedAccounts.length ||
    actualAccounts.some(
      (actualAccount, index) => actualAccount !== expectedAccounts[index],
    )
  ) {
    throw new Error(
      "The stored campaign migration accounts differ from review.",
    );
  }
}

export function campaignV2MigrationActionAvailability({
  approved,
  memberAddress,
  status,
}: {
  approved: readonly string[];
  memberAddress: string;
  status: CampaignV2MigrationStatus;
}) {
  const knownMember = isKnownMember(memberAddress);
  return {
    canApprove:
      status === "Active" && knownMember && !approved.includes(memberAddress),
    canCreate:
      status === "NotCreated" &&
      memberAddress === SQUADS_DEVNET_CONFIG.members[0]!.address,
    canExecute:
      status === "Approved" &&
      knownMember &&
      approved.length >= SQUADS_DEVNET_CONFIG.threshold,
  };
}

export async function readCampaignV2MigrationState(
  rpcEndpoint: string,
): Promise<CampaignV2MigrationState> {
  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "finalized");
  const config = TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG;
  await assertDevnetConnection(connection);
  await verifyExpectedDevnetMultisig({
    multisigAddress: config.multisigAddress,
    rpcEndpoint,
  });
  const upgradeState = await readTokenomicsUpgradeGovernanceState(rpcEndpoint);
  if (!upgradeState.upgradeComplete || upgradeState.status !== "Executed") {
    throw new Error("The reviewed Tokenomics Core upgrade is not finalized.");
  }

  const proposalAddress = new PublicKey(config.proposalAddress);
  const transactionAddress = new PublicKey(config.transactionAddress);
  const tokenConfigAddress = new PublicKey(config.tokenConfigAddress);
  const campaignAddress = new PublicKey(config.campaignAddress);
  const campaignVaultAddress = new PublicKey(config.campaignVaultAddress);
  const [
    multisigAccount,
    proposalInfo,
    transactionInfo,
    tokenConfigInfo,
    campaignInfo,
    campaignVaultInfo,
  ] = await Promise.all([
    multisigSdk.accounts.Multisig.fromAccountAddress(
      connection,
      new PublicKey(config.multisigAddress),
      "finalized",
    ),
    connection.getAccountInfo(proposalAddress, "finalized"),
    connection.getAccountInfo(transactionAddress, "finalized"),
    connection.getAccountInfo(tokenConfigAddress, "finalized"),
    connection.getAccountInfo(campaignAddress, "finalized"),
    connection.getAccountInfo(campaignVaultAddress, "finalized"),
  ]);
  if (
    !tokenConfigInfo ||
    !tokenConfigInfo.owner.equals(new PublicKey(config.programId)) ||
    !campaignInfo ||
    !campaignInfo.owner.equals(new PublicKey(config.programId)) ||
    !campaignVaultInfo ||
    campaignVaultInfo.owner.toBase58() !== TOKEN_PROGRAM_ID
  ) {
    throw new Error("The reviewed campaign accounts are missing or misowned.");
  }
  assertTokenConfig(tokenConfigInfo.data);
  const snapshot = decodeCampaignV2Snapshot({
    campaignData: campaignInfo.data,
    vaultData: campaignVaultInfo.data,
  });

  if (!proposalInfo && !transactionInfo) {
    if (
      bigintFromSdkValue(multisigAccount.transactionIndex) !==
      config.transactionIndex - 1n
    ) {
      throw new Error(
        "The next Squads transaction index is not the reviewed migration index.",
      );
    }
    assertReviewedSnapshot(snapshot, CAMPAIGN_V1_ECONOMIC_CONFIG_HASH);
    return {
      ...snapshot,
      approved: [],
      cancelled: [],
      proposalAddress: config.proposalAddress,
      rejected: [],
      status: "NotCreated",
      transactionAddress: config.transactionAddress,
    };
  }
  if (!proposalInfo || !transactionInfo) {
    throw new Error("Only one of the two Squads migration accounts exists.");
  }

  const [proposal, vaultTransaction] = await Promise.all([
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
  ]);
  if (
    proposal.multisig.toBase58() !== config.multisigAddress ||
    bigintFromSdkValue(proposal.transactionIndex) !== config.transactionIndex
  ) {
    throw new Error("The Squads campaign migration proposal identity changed.");
  }
  const status = proposal.status.__kind;
  if (!["Active", "Approved", "Executed"].includes(status)) {
    throw new Error(`The campaign migration proposal is ${status}.`);
  }
  if (proposal.rejected.length > 0 || proposal.cancelled.length > 0) {
    throw new Error(
      "The campaign migration proposal was rejected or cancelled.",
    );
  }
  assertStoredMigrationMessage(vaultTransaction);
  assertReviewedSnapshot(
    snapshot,
    status === "Executed"
      ? CAMPAIGN_V2_ECONOMIC_CONFIG_HASH
      : CAMPAIGN_V1_ECONOMIC_CONFIG_HASH,
    status === "Executed",
  );
  return {
    ...snapshot,
    approved: proposal.approved.map((member) => member.toBase58()),
    cancelled: proposal.cancelled.map((member) => member.toBase58()),
    proposalAddress: config.proposalAddress,
    rejected: proposal.rejected.map((member) => member.toBase58()),
    status: status as CampaignV2MigrationStatus,
    transactionAddress: config.transactionAddress,
  };
}

export async function prepareCampaignV2MigrationAction({
  action,
  memberAddress,
  rpcEndpoint,
}: {
  action: CampaignV2MigrationAction;
  memberAddress: string;
  rpcEndpoint: string;
}): Promise<PreparedCampaignV2MigrationAction> {
  if (!isKnownMember(memberAddress)) {
    throw new Error("The connected account is not a devnet multisig member.");
  }
  const stateBefore = await readCampaignV2MigrationState(rpcEndpoint);
  const availability = campaignV2MigrationActionAvailability({
    approved: stateBefore.approved,
    memberAddress,
    status: stateBefore.status,
  });
  if (action === "create" && !availability.canCreate) {
    throw new Error(
      "Only Wallet A can create the reviewed migration proposal.",
    );
  }
  if (action === "approve" && !availability.canApprove) {
    throw new Error("This member cannot approve the migration proposal now.");
  }
  if (action === "execute" && !availability.canExecute) {
    throw new Error(
      "Execution requires two distinct approvals and a known devnet member.",
    );
  }

  const multisigSdk = await import("@sqds/multisig");
  const config = TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG;
  const connection = new Connection(rpcEndpoint, "confirmed");
  const member = new PublicKey(memberAddress);
  const multisigPda = new PublicKey(config.multisigAddress);
  const programId = new PublicKey(SQUADS_DEVNET_CONFIG.programId);
  let instructions: readonly LegacyTransactionInstruction[];

  if (action === "create") {
    const transactionMessage = new TransactionMessage({
      instructions: [createCampaignV2MigrationInstruction()],
      payerKey: new PublicKey(config.vaultAddress),
      recentBlockhash: PublicKey.default.toBase58(),
    });
    instructions = [
      multisigSdk.instructions.vaultTransactionCreate({
        creator: member,
        ephemeralSigners: 0,
        memo: config.memo,
        multisigPda,
        programId,
        transactionIndex: config.transactionIndex,
        transactionMessage,
        vaultIndex: config.vaultIndex,
      }),
      multisigSdk.instructions.proposalCreate({
        creator: member,
        isDraft: false,
        multisigPda,
        programId,
        transactionIndex: config.transactionIndex,
      }),
    ];
  } else if (action === "approve") {
    instructions = [
      multisigSdk.instructions.proposalApprove({
        member,
        memo: "Approve reviewed JUSDEALER devnet campaign v2 migration",
        multisigPda,
        programId,
        transactionIndex: config.transactionIndex,
      }),
    ];
  } else {
    const execution = await multisigSdk.instructions.vaultTransactionExecute({
      connection,
      member,
      multisigPda,
      programId,
      transactionIndex: config.transactionIndex,
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

export async function signSimulateSendAndVerifyCampaignV2MigrationAction({
  client,
  prepared,
  wallet,
}: {
  client: SolanaClient;
  prepared: PreparedCampaignV2MigrationAction;
  wallet: ConnectedWallet;
}): Promise<CampaignV2MigrationResult> {
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
      `The campaign migration ${prepared.action} transaction was not submitted or finalized: ${errorText(error)}`,
      { cause: error },
    );
  }

  const state = await readCampaignV2MigrationState(prepared.rpcEndpoint);
  if (
    prepared.action === "create" &&
    (state.status !== "Active" || state.approved.length !== 0)
  ) {
    throw new Error(
      "The finalized migration proposal is not active with zero votes.",
    );
  }
  if (
    prepared.action === "approve" &&
    !state.approved.includes(prepared.memberAddress)
  ) {
    throw new Error(
      "The finalized migration approval failed strict read-back.",
    );
  }
  if (
    prepared.action === "execute" &&
    (state.status !== "Executed" ||
      state.economicConfigHash !== CAMPAIGN_V2_ECONOMIC_CONFIG_HASH ||
      state.originalAllocationAtoms !==
        prepared.stateBefore.originalAllocationAtoms ||
      state.cumulativeDistributedAtoms !==
        prepared.stateBefore.cumulativeDistributedAtoms ||
      state.remainingAtoms !== prepared.stateBefore.remainingAtoms ||
      state.vaultAmountAtoms !== prepared.stateBefore.vaultAmountAtoms)
  ) {
    throw new Error(
      "The finalized campaign migration failed strict read-back.",
    );
  }
  return { action: prepared.action, signature, state };
}
