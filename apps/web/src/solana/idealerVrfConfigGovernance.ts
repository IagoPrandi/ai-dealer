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

import { decodeGlobalConfigAccount } from "./idealerProgram";
import { createIdealerVrfConfigInstruction } from "./idealerVrfConfigProposal";
import { IDEALER_VRF_CONFIG_PROPOSAL_CONFIG } from "./idealerVrfConfigProposalConfig";
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

const GLOBAL_CONFIG_DISCRIMINATOR = Buffer.from([
  149, 8, 156, 202, 160, 252, 176, 217,
]);
const FINALIZATION_TIMEOUT_MS = 120_000;
const FINALIZATION_POLL_INTERVAL_MS = 1_000;

export const IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG = Object.freeze({
  proposalAddress: "6jgmTQPCuesEaUzqgbAwD8zpV3uZVtizDJSG7MUFkPqN",
  transactionAddress: "736SgRStuJi7K1uSZJZenmxMVeZ489zU1N2qFm2Cs2Bd",
  transactionIndex: 8n,
});

export type IdealerVrfConfigGovernanceAction = "approve" | "execute";
export type IdealerVrfConfigProposalStatus =
  | "Active"
  | "Approved"
  | "Executed";

export interface IdealerVrfConfigGovernanceState {
  approved: readonly string[];
  cancelled: readonly string[];
  configurationComplete: boolean;
  drawProvider: string;
  electionProvider: string;
  nextTurnId: number;
  proposalAddress: string;
  rejected: readonly string[];
  status: IdealerVrfConfigProposalStatus;
  transactionAddress: string;
}

export interface PreparedIdealerVrfConfigGovernanceAction {
  action: IdealerVrfConfigGovernanceAction;
  instructions: readonly KitInstruction[];
  memberAddress: string;
  rpcEndpoint: string;
  stateBefore: IdealerVrfConfigGovernanceState;
}

export interface IdealerVrfConfigGovernanceResult {
  action: IdealerVrfConfigGovernanceAction;
  signature: string;
  state: IdealerVrfConfigGovernanceState;
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
  if ((await connection.getGenesisHash()) !== SQUADS_DEVNET_CONFIG.genesisHash) {
    throw new Error(
      "The configured RPC is not Solana devnet. Governance action was blocked.",
    );
  }
}

function decodeVrfState(data: Buffer) {
  if (
    data.length < 137 ||
    !data.subarray(0, 8).equals(GLOBAL_CONFIG_DISCRIMINATOR)
  ) {
    throw new Error("Idealer GlobalConfig metadata is invalid.");
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

function assertStoredVrfMessage(vaultTransaction: {
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
  const config = IDEALER_VRF_CONFIG_PROPOSAL_CONFIG;
  const governance = IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG;
  if (
    vaultTransaction.multisig.toBase58() !== config.multisigAddress ||
    vaultTransaction.creator.toBase58() !==
      SQUADS_DEVNET_CONFIG.members[0]!.address ||
    bigintFromSdkValue(vaultTransaction.index) !==
      governance.transactionIndex ||
    vaultTransaction.vaultIndex !== config.vaultIndex
  ) {
    throw new Error("The stored Squads vault transaction identity changed.");
  }

  const expectedInstruction = createIdealerVrfConfigInstruction();
  const message = vaultTransaction.message;
  const inner = message.instructions[0];
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

export function vrfGovernanceActionAvailability({
  approved,
  memberAddress,
  status,
}: {
  approved: readonly string[];
  memberAddress: string;
  status: IdealerVrfConfigProposalStatus;
}) {
  const knownMember = isKnownMember(memberAddress);
  return {
    canApprove:
      status === "Active" &&
      knownMember &&
      !approved.includes(memberAddress),
    canExecute:
      status === "Approved" &&
      approved.length >= SQUADS_DEVNET_CONFIG.threshold &&
      knownMember,
  };
}

export async function readIdealerVrfConfigGovernanceState(
  rpcEndpoint: string,
): Promise<IdealerVrfConfigGovernanceState> {
  const multisigSdk = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "finalized");
  await assertDevnetConnection(connection);
  await verifyExpectedDevnetMultisig({
    multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
    rpcEndpoint,
  });

  const deployedState =
    await readTokenomicsUpgradeGovernanceState(rpcEndpoint);
  if (
    !deployedState.upgradeComplete ||
    deployedState.programSha256 !==
      "3a8da33f590768b399e93aa6497cf92b2218701b9a9dd1e6342cc0c663bce200"
  ) {
    throw new Error("The reviewed ORAO-capable Idealer artifact is not deployed.");
  }

  const governance = IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG;
  const config = IDEALER_VRF_CONFIG_PROPOSAL_CONFIG;
  const [proposal, vaultTransaction, globalConfigInfo, oraoProgramInfo, oraoStateInfo] =
    await Promise.all([
      multisigSdk.accounts.Proposal.fromAccountAddress(
        connection,
        new PublicKey(governance.proposalAddress),
        "finalized",
      ),
      multisigSdk.accounts.VaultTransaction.fromAccountAddress(
        connection,
        new PublicKey(governance.transactionAddress),
        "finalized",
      ),
      connection.getAccountInfo(
        new PublicKey(config.globalConfigAddress),
        "finalized",
      ),
      connection.getAccountInfo(new PublicKey(config.oraoProgramId), "finalized"),
      connection.getAccountInfo(
        new PublicKey(config.targetProviderAddress),
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
  if (proposal.rejected.length > 0 || proposal.cancelled.length > 0) {
    throw new Error(
      "The proposal contains an unexpected rejection or cancellation.",
    );
  }
  assertStoredVrfMessage(vaultTransaction);

  const idealerProgram = new PublicKey(config.programId);
  const oraoProgram = new PublicKey(config.oraoProgramId);
  if (!globalConfigInfo || !globalConfigInfo.owner.equals(idealerProgram)) {
    throw new Error("The reviewed Idealer GlobalConfig account is unavailable.");
  }
  if (
    !oraoProgramInfo ||
    !oraoProgramInfo.executable ||
    !oraoStateInfo ||
    !oraoStateInfo.owner.equals(oraoProgram)
  ) {
    throw new Error("The official ORAO devnet program state is unavailable.");
  }

  const globalConfig = decodeGlobalConfigAccount(globalConfigInfo.data);
  if (globalConfig.hasActiveTurn || globalConfig.activeTurnId !== 0) {
    throw new Error(
      "An Idealer turn is active. VRF governance was blocked.",
    );
  }
  const providers = decodeVrfState(globalConfigInfo.data);
  const expectedProvider =
    status === "Executed"
      ? config.targetProviderAddress
      : config.currentProviderAddress;
  if (
    providers.drawProvider !== expectedProvider ||
    providers.electionProvider !== expectedProvider
  ) {
    throw new Error(
      "The finalized VRF provider configuration differs from the proposal state.",
    );
  }

  return {
    approved: proposal.approved.map((member) => member.toBase58()),
    cancelled: proposal.cancelled.map((member) => member.toBase58()),
    configurationComplete: status === "Executed",
    drawProvider: providers.drawProvider,
    electionProvider: providers.electionProvider,
    nextTurnId: globalConfig.nextTurnId,
    proposalAddress: governance.proposalAddress,
    rejected: proposal.rejected.map((member) => member.toBase58()),
    status: status as IdealerVrfConfigProposalStatus,
    transactionAddress: governance.transactionAddress,
  };
}

export async function prepareIdealerVrfConfigGovernanceAction({
  action,
  memberAddress,
  rpcEndpoint,
}: {
  action: IdealerVrfConfigGovernanceAction;
  memberAddress: string;
  rpcEndpoint: string;
}): Promise<PreparedIdealerVrfConfigGovernanceAction> {
  if (!isKnownMember(memberAddress)) {
    throw new Error("The connected account is not a devnet multisig member.");
  }

  const stateBefore =
    await readIdealerVrfConfigGovernanceState(rpcEndpoint);
  const availability = vrfGovernanceActionAvailability({
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
        memo: "Approve canonical ORAO activation for JUSDEALER devnet",
        multisigPda,
        programId,
        transactionIndex:
          IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG.transactionIndex,
      }),
    ];
  } else {
    const execution = await multisigSdk.instructions.vaultTransactionExecute({
      connection,
      member,
      multisigPda,
      programId,
      transactionIndex:
        IDEALER_VRF_CONFIG_GOVERNANCE_CONFIG.transactionIndex,
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

export async function signSimulateSendAndVerifyIdealerVrfGovernanceAction({
  client,
  prepared,
  wallet,
}: {
  client: SolanaClient;
  prepared: PreparedIdealerVrfConfigGovernanceAction;
  wallet: ConnectedWallet;
}): Promise<IdealerVrfConfigGovernanceResult> {
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

  const state = await readIdealerVrfConfigGovernanceState(
    prepared.rpcEndpoint,
  );
  if (
    prepared.action === "approve" &&
    !state.approved.includes(prepared.memberAddress)
  ) {
    throw new Error("The finalized approval failed strict read-back.");
  }
  if (
    prepared.action === "execute" &&
    (!state.configurationComplete || state.status !== "Executed")
  ) {
    throw new Error("The finalized ORAO activation failed strict read-back.");
  }

  return { action: prepared.action, signature, state };
}
