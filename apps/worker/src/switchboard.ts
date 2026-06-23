import {
  AnchorUtils,
  asV0Tx,
  ON_DEMAND_DEVNET_PID,
  ON_DEMAND_DEVNET_QUEUE,
  ON_DEMAND_DEVNET_QUEUE_PDA,
  Randomness,
} from "@switchboard-xyz/on-demand";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import { address, createSolanaRpc } from "@solana/kit";
import {
  createSetVrfConfigInstruction,
  createTurnAutomationConfig,
  deriveAuthorityAddress,
  loadAuthorityKeypairBytesFromEnv,
  simulateAndSend,
} from "./turn-automation.js";

const DEFAULT_COMMITMENT: Commitment = "confirmed";

export const SWITCHBOARD_DEVNET_ON_DEMAND = {
  programId: ON_DEMAND_DEVNET_PID.toBase58(),
  queue: ON_DEMAND_DEVNET_QUEUE.toBase58(),
  queuePda: ON_DEMAND_DEVNET_QUEUE_PDA.toBase58(),
} as const;

export interface SwitchboardProofConfig {
  authorityKeypairBytes: Uint8Array;
  commitment?: Commitment;
  programId?: PublicKey;
  queue?: PublicKey;
  rpcUrl: string;
}

export interface SwitchboardProofResult {
  commitSignature: string;
  programId: string;
  queue: string;
  queuePda: string;
  randomnessAccount: string;
  revealSignature: string;
  valueHex: string;
}

type SignableTransaction = Transaction | VersionedTransaction;

function createAnchorWallet(keypair: Keypair) {
  return {
    publicKey: keypair.publicKey,
    async signAllTransactions<T extends SignableTransaction>(
      transactions: T[],
    ): Promise<T[]> {
      return transactions.map((transaction) =>
        signAnchorTransaction(transaction, keypair),
      );
    },
    async signTransaction<T extends SignableTransaction>(
      transaction: T,
    ): Promise<T> {
      return signAnchorTransaction(transaction, keypair);
    },
  };
}

function signAnchorTransaction<T extends SignableTransaction>(
  transaction: T,
  keypair: Keypair,
): T {
  if (transaction instanceof VersionedTransaction) {
    transaction.sign([keypair]);
    return transaction;
  }

  transaction.partialSign(keypair);
  return transaction;
}

function publicKeyFromEnv(value: string | undefined, fallback: PublicKey) {
  return value ? new PublicKey(value) : fallback;
}

export async function createSwitchboardProofConfig(
  env = process.env,
): Promise<SwitchboardProofConfig> {
  const authorityKeypairBytes = await loadAuthorityKeypairBytesFromEnv(env);
  if (!authorityKeypairBytes) {
    throw new Error(
      "Switchboard proof requires IDEALER_TURN_AUTHORITY_KEYPAIR or IDEALER_TURN_AUTHORITY_KEYPAIR_PATH.",
    );
  }

  const automation = await createTurnAutomationConfig(env);
  return {
    authorityKeypairBytes,
    programId: publicKeyFromEnv(
      env.IDEALER_SWITCHBOARD_ON_DEMAND_PROGRAM_ID,
      ON_DEMAND_DEVNET_PID,
    ),
    queue: publicKeyFromEnv(
      env.IDEALER_SWITCHBOARD_ON_DEMAND_QUEUE,
      ON_DEMAND_DEVNET_QUEUE,
    ),
    rpcUrl: automation.rpcUrl,
  };
}

export async function setConfiguredVrfToSwitchboardDevnet(
  env = process.env,
) {
  const [authorityKeypairBytes, automation] = await Promise.all([
    loadAuthorityKeypairBytesFromEnv(env),
    createTurnAutomationConfig(env),
  ]);
  if (!authorityKeypairBytes) {
    throw new Error(
      "set_vrf_config requires IDEALER_TURN_AUTHORITY_KEYPAIR or IDEALER_TURN_AUTHORITY_KEYPAIR_PATH.",
    );
  }

  const authority = deriveAuthorityAddress(authorityKeypairBytes);
  const queueAddress = address(SWITCHBOARD_DEVNET_ON_DEMAND.queue);
  const instruction = await createSetVrfConfigInstruction({
    authority,
    drawVrfConfig: queueAddress,
    electionVrfConfig: queueAddress,
    programId: automation.programId,
  });
  const signature = await simulateAndSend({
    authorityKeypairBytes,
    instruction,
    rpc: createSolanaRpc(automation.rpcUrl),
  });

  return {
    drawVrfConfig: queueAddress.toString(),
    electionVrfConfig: queueAddress.toString(),
    signature: signature.toString(),
  };
}

export function extractSwitchboardRandomnessValue(data: unknown): Uint8Array {
  if (!data || typeof data !== "object" || !("value" in data)) {
    throw new Error("Switchboard randomness account did not expose a value.");
  }

  const value = (data as { value: unknown }).value;
  const bytes = valueToByteArray(value);

  if (!bytes || bytes.length !== 32) {
    throw new Error("Switchboard randomness value was not a 32-byte array.");
  }

  if (bytes.every((byte) => byte === 0)) {
    throw new Error("Switchboard randomness value was all zero bytes.");
  }

  return bytes;
}

function valueToByteArray(value: unknown) {
  if (value instanceof Uint8Array) {
    return Uint8Array.from(value);
  }

  if (
    Array.isArray(value) &&
    value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    return Uint8Array.from(value);
  }

  return null;
}

async function confirmSignature(
  connection: Connection,
  signature: string,
  commitment: Commitment,
  label: string,
) {
  const confirmation = await connection.confirmTransaction(
    signature,
    commitment,
  );
  if (confirmation.value.err) {
    throw new Error(
      `Switchboard ${label} transaction failed: ${JSON.stringify(
        confirmation.value.err,
      )}`,
    );
  }
}

export async function runSwitchboardRandomnessProofOfLife(
  config: SwitchboardProofConfig,
): Promise<SwitchboardProofResult> {
  const commitment = config.commitment ?? DEFAULT_COMMITMENT;
  const connection = new Connection(config.rpcUrl, commitment);
  const authority = Keypair.fromSecretKey(config.authorityKeypairBytes);
  const programId = config.programId ?? ON_DEMAND_DEVNET_PID;
  const queue = config.queue ?? ON_DEMAND_DEVNET_QUEUE;
  const wallet = createAnchorWallet(authority);
  const program = await AnchorUtils.loadProgramFromConnection(
    connection,
    wallet as never,
    programId,
  );
  const [randomness, randomnessKeypair, createAndCommitIxs] =
    await Randomness.createAndCommitIxs(
      program,
      queue,
      authority.publicKey,
    );
  const commitTransaction = await asV0Tx({
    computeUnitLimitMultiple: 1.3,
    connection,
    ixs: createAndCommitIxs,
    signers: [authority, randomnessKeypair],
  });
  const commitSignature = await connection.sendTransaction(commitTransaction, {
    maxRetries: 3,
    preflightCommitment: commitment,
    skipPreflight: false,
  });
  await confirmSignature(connection, commitSignature, commitment, "commit");

  const revealIx = await randomness.revealIx(authority.publicKey);
  const revealTransaction = await asV0Tx({
    computeUnitLimitMultiple: 1.3,
    connection,
    ixs: [revealIx],
    signers: [authority],
  });
  const revealSignature = await connection.sendTransaction(revealTransaction, {
    maxRetries: 3,
    preflightCommitment: commitment,
    skipPreflight: false,
  });
  await confirmSignature(connection, revealSignature, commitment, "reveal");

  const randomnessData = await randomness.loadData();
  const value = extractSwitchboardRandomnessValue(randomnessData);
  return {
    commitSignature,
    programId: programId.toBase58(),
    queue: queue.toBase58(),
    queuePda: SWITCHBOARD_DEVNET_ON_DEMAND.queuePda,
    randomnessAccount: randomness.pubkey.toBase58(),
    revealSignature,
    valueHex: Buffer.from(value).toString("hex"),
  };
}
