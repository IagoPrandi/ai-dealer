"use client";

import { createWalletTransactionSigner } from "@solana/client";
import type { useSolanaClient, useWalletConnection } from "@solana/react-hooks";
import {
  AccountRole,
  address,
  generateKeyPairSigner,
  getBase64EncodedWireTransaction,
  type KeyPairSigner,
} from "@solana/kit";
import {
  Connection,
  PublicKey,
  type TransactionInstruction as LegacyTransactionInstruction,
} from "@solana/web3.js";

import {
  SQUADS_DEVNET_CONFIG,
  validateMultisigSnapshot,
  validateSquadsDevnetConfig,
} from "./squadsDevnetConfig";

type SolanaClient = ReturnType<typeof useSolanaClient>;
type WalletConnection = ReturnType<typeof useWalletConnection>;
type ConnectedWallet = NonNullable<WalletConnection["wallet"]>;
type ConfirmableTransaction = Parameters<
  SolanaClient["actions"]["sendTransaction"]
>[0];
type KitInstruction = Parameters<
  SolanaClient["transaction"]["prepare"]
>[0]["instructions"][number];

export interface SquadsCreationSummary {
  creationFeeLamports: bigint;
  createKey: string;
  estimatedRentLamports: bigint;
  multisigAddress: string;
  programTreasury: string;
  vaultAddress: string;
}

export interface PreparedSquadsCreation {
  createKeySigner: KeyPairSigner;
  instruction: KitInstruction;
  rpcEndpoint: string;
  summary: SquadsCreationSummary;
}

export interface SquadsCreationResult extends SquadsCreationSummary {
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
  createKeySigner: KeyPairSigner,
): KitInstruction {
  return {
    accounts: instruction.keys.map((accountMeta) => {
      const accountAddress = address(accountMeta.pubkey.toBase58());
      const role = roleForLegacyAccount(
        accountMeta.isSigner,
        accountMeta.isWritable,
      );

      if (accountMeta.isSigner && accountAddress === createKeySigner.address) {
        return {
          address: accountAddress,
          role:
            role === AccountRole.WRITABLE_SIGNER
              ? AccountRole.WRITABLE_SIGNER
              : AccountRole.READONLY_SIGNER,
          signer: createKeySigner,
        };
      }

      return { address: accountAddress, role };
    }),
    data: new Uint8Array(instruction.data),
    programAddress: address(instruction.programId.toBase58()),
  };
}

function bigintFromSdkValue(value: { toString(): string } | number) {
  return BigInt(value.toString());
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : String(error);
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
  const expectedCreator = SQUADS_DEVNET_CONFIG.members[0]?.address;
  return (
    wallet.account.address.toString() === expectedCreator &&
    wallet.connector.name.toLowerCase().includes("phantom")
  );
}

async function assertDevnetConnection(connection: Connection) {
  const genesisHash = await connection.getGenesisHash();
  if (genesisHash !== SQUADS_DEVNET_CONFIG.genesisHash) {
    throw new Error(
      "The configured RPC is not Solana devnet. Multisig creation was blocked.",
    );
  }
}

export async function prepareSquadsCreation({
  creatorAddress,
  rpcEndpoint,
}: {
  creatorAddress: string;
  rpcEndpoint: string;
}): Promise<PreparedSquadsCreation> {
  const configErrors = validateSquadsDevnetConfig();
  if (configErrors.length > 0) {
    throw new Error(configErrors.join(" "));
  }
  if (creatorAddress !== SQUADS_DEVNET_CONFIG.members[0]?.address) {
    throw new Error("Only devnet wallet A can create this multisig.");
  }

  const multisig = await import("@sqds/multisig");
  const connection = new Connection(rpcEndpoint, "confirmed");
  await assertDevnetConnection(connection);

  const programId = new PublicKey(SQUADS_DEVNET_CONFIG.programId);
  if (!multisig.PROGRAM_ID.equals(programId)) {
    throw new Error(
      "The installed Squads SDK program ID does not match the PRD.",
    );
  }

  const createKeySigner = await generateKeyPairSigner();
  const createKey = new PublicKey(createKeySigner.address);
  const creator = new PublicKey(creatorAddress);
  const [multisigAddress, multisigBump] = multisig.getMultisigPda({
    createKey,
    programId,
  });
  const [vaultAddress] = multisig.getVaultPda({
    index: SQUADS_DEVNET_CONFIG.vaultIndex,
    multisigPda: multisigAddress,
    programId,
  });
  const [programConfigAddress] = multisig.getProgramConfigPda({ programId });
  const programConfig =
    await multisig.accounts.ProgramConfig.fromAccountAddress(
      connection,
      programConfigAddress,
      "confirmed",
    );

  const members = SQUADS_DEVNET_CONFIG.members.map((member) => ({
    key: new PublicKey(member.address),
    permissions: multisig.types.Permissions.all(),
  }));
  const instruction = multisig.instructions.multisigCreateV2({
    configAuthority: null,
    createKey,
    creator,
    members,
    memo: "JUSDEALER devnet governance multisig",
    multisigPda: multisigAddress,
    programId,
    rentCollector: null,
    threshold: SQUADS_DEVNET_CONFIG.threshold,
    timeLock: SQUADS_DEVNET_CONFIG.timeLockSeconds,
    treasury: programConfig.treasury,
  });
  const estimatedAccountSize = multisig.accounts.Multisig.byteSize({
    bump: multisigBump,
    configAuthority: PublicKey.default,
    createKey,
    members,
    rentCollector: null,
    staleTransactionIndex: 0,
    threshold: SQUADS_DEVNET_CONFIG.threshold,
    timeLock: SQUADS_DEVNET_CONFIG.timeLockSeconds,
    transactionIndex: 0,
  });
  const estimatedRentLamports =
    await connection.getMinimumBalanceForRentExemption(estimatedAccountSize);

  return {
    createKeySigner,
    instruction: convertLegacyInstruction(instruction, createKeySigner),
    rpcEndpoint,
    summary: {
      creationFeeLamports: bigintFromSdkValue(
        programConfig.multisigCreationFee,
      ),
      createKey: createKey.toBase58(),
      estimatedRentLamports: BigInt(estimatedRentLamports),
      multisigAddress: multisigAddress.toBase58(),
      programTreasury: programConfig.treasury.toBase58(),
      vaultAddress: vaultAddress.toBase58(),
    },
  };
}

async function verifyCreatedMultisig(
  prepared: PreparedSquadsCreation,
): Promise<void> {
  const multisig = await import("@sqds/multisig");
  const connection = new Connection(prepared.rpcEndpoint, "finalized");
  await assertDevnetConnection(connection);

  const multisigAddress = new PublicKey(prepared.summary.multisigAddress);
  const [account, accountInfo] = await Promise.all([
    multisig.accounts.Multisig.fromAccountAddress(
      connection,
      multisigAddress,
      "finalized",
    ),
    connection.getAccountInfo(multisigAddress, "finalized"),
  ]);
  if (!accountInfo) {
    throw new Error("The finalized multisig account could not be read back.");
  }

  const defaultPublicKey = PublicKey.default.toBase58();
  const verificationErrors = validateMultisigSnapshot({
    configAuthority:
      account.configAuthority.toBase58() === defaultPublicKey
        ? null
        : account.configAuthority.toBase58(),
    members: account.members.map((member) => ({
      address: member.key.toBase58(),
      permissionMask: member.permissions.mask,
    })),
    owner: accountInfo.owner.toBase58(),
    rentCollector: account.rentCollector?.toBase58() ?? null,
    threshold: account.threshold,
    timeLockSeconds: account.timeLock,
  });

  if (verificationErrors.length > 0) {
    throw new Error(
      `The transaction finalized, but strict read-back verification failed: ${verificationErrors.join(" ")}`,
    );
  }
}

export async function signSimulateSendAndVerify({
  client,
  prepared,
  wallet,
}: {
  client: SolanaClient;
  prepared: PreparedSquadsCreation;
  wallet: ConnectedWallet;
}): Promise<SquadsCreationResult> {
  if (!isPhantomWalletA(wallet)) {
    throw new Error(
      "Creation requires Phantom connected to the configured devnet wallet A.",
    );
  }

  const walletSigner = createWalletTransactionSigner(wallet, {
    commitment: "confirmed",
  });
  if (walletSigner.mode !== "partial") {
    throw new Error(
      "This Phantom connection cannot return a signed transaction for simulation. Nothing was submitted.",
    );
  }

  const transaction = await client.transaction.prepare({
    authority: walletSigner.signer,
    commitment: "confirmed",
    feePayer: walletSigner.signer,
    instructions: [prepared.instruction],
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
      simulation.value.logs?.slice(-6).join(" ") ?? "No logs returned.";
    throw new Error(
      `The signed transaction failed simulation and was not submitted. ${JSON.stringify(simulation.value.err)} ${logs}`,
    );
  }

  assertHasBlockhashLifetime(signedTransaction);

  let signature: string;
  try {
    signature = (
      await client.actions.sendTransaction(signedTransaction, "finalized")
    ).toString();
  } catch (error) {
    throw new Error(
      `The simulated transaction was not finalized: ${errorText(error)}`,
      { cause: error },
    );
  }

  await verifyCreatedMultisig(prepared);
  return { ...prepared.summary, signature };
}
