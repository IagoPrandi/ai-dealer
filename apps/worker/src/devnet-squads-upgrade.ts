import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  SYSVAR_CLOCK_PUBKEY,
  SYSVAR_RENT_PUBKEY,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import bs58 from "bs58";

/**
 * Devnet operator for the governed Tyche program upgrade.
 *
 * The program's upgrade authority is Squads vault 0, so an upgrade is a
 * ceremony, not a deploy: a reviewed buffer is published and handed to the
 * vault, a vault transaction wrapping the loader's `Upgrade` instruction is
 * proposed, members approve it until the threshold is met, and only then is it
 * executed. Each stage is a separate command so nothing is bundled with an
 * approval the operator has not seen.
 *
 * Reads member secrets from the environment and never writes them to disk.
 */

const COMMITMENT: Commitment = "confirmed";
const LOADER_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const SQUADS_PROGRAM_ID = new PublicKey(
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
);
const MULTISIG_PDA = new PublicKey(
  "DQmcXBdLsQUVsk8UmgnTdnjruRHnAquuFP9wPa87T5RD",
);
const VAULT_INDEX = 0;
const VAULT_PDA = new PublicKey(
  "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp",
);
const PROGRAM_ID = new PublicKey(
  "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd",
);
const PROGRAM_DATA_ID = new PublicKey(
  "AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g",
);
/** The loader's `Upgrade` instruction discriminant. */
const LOADER_UPGRADE_INSTRUCTION = 3;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

/** Accepts either a base58 secret key or a JSON byte array. */
export function parseSecretKey(raw: string) {
  const trimmed = raw.trim();
  const bytes = trimmed.startsWith("[")
    ? Uint8Array.from(JSON.parse(trimmed) as number[])
    : bs58.decode(trimmed);
  return Keypair.fromSecretKey(bytes);
}

function loadMember(name: string) {
  return parseSecretKey(requiredEnvironment(name));
}

function connection() {
  return new Connection(
    requiredEnvironment("TYCHE_SOLANA_RPC_URL"),
    COMMITMENT,
  );
}

/**
 * The BPF loader's `Upgrade`: replaces the program's ProgramData contents with
 * the buffer's, refunds the buffer rent to the spill address, and closes the
 * buffer. The upgrade authority signs — here, the Squads vault PDA.
 */
export function createLoaderUpgradeInstruction({
  buffer,
  spill,
  upgradeAuthority,
}: {
  buffer: PublicKey;
  spill: PublicKey;
  upgradeAuthority: PublicKey;
}) {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(LOADER_UPGRADE_INSTRUCTION, 0);
  return new TransactionInstruction({
    data,
    keys: [
      { isSigner: false, isWritable: true, pubkey: PROGRAM_DATA_ID },
      { isSigner: false, isWritable: true, pubkey: PROGRAM_ID },
      { isSigner: false, isWritable: true, pubkey: buffer },
      { isSigner: false, isWritable: true, pubkey: spill },
      { isSigner: false, isWritable: false, pubkey: SYSVAR_RENT_PUBKEY },
      { isSigner: false, isWritable: false, pubkey: SYSVAR_CLOCK_PUBKEY },
      { isSigner: true, isWritable: false, pubkey: upgradeAuthority },
    ],
    programId: LOADER_ID,
  });
}

async function sendAndConfirm(
  rpc: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
  extraSigners: Keypair[] = [],
) {
  const { blockhash, lastValidBlockHeight } =
    await rpc.getLatestBlockhash(COMMITMENT);
  const message = new TransactionMessage({
    instructions,
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([payer, ...extraSigners]);

  const simulation = await rpc.simulateTransaction(transaction, {
    commitment: COMMITMENT,
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `simulation failed: ${JSON.stringify(simulation.value.err)}; logs=${JSON.stringify(
        simulation.value.logs ?? [],
      )}`,
    );
  }

  const signature = await rpc.sendTransaction(transaction, {
    maxRetries: 5,
    preflightCommitment: COMMITMENT,
  });
  const confirmation = await rpc.confirmTransaction(
    { blockhash, lastValidBlockHeight, signature },
    COMMITMENT,
  );
  if (confirmation.value.err) {
    throw new Error(
      `${signature} failed after send: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
  return signature;
}

/** Read a published buffer's payload and authority straight from the chain. */
export async function readBuffer(rpc: Connection, buffer: PublicKey) {
  const account = await rpc.getAccountInfo(buffer, COMMITMENT);
  if (!account) {
    throw new Error(`Buffer ${buffer.toBase58()} does not exist.`);
  }
  if (!account.owner.equals(LOADER_ID)) {
    throw new Error(`Buffer ${buffer.toBase58()} is not owned by the loader.`);
  }
  const tag = account.data.readUInt32LE(0);
  if (tag !== 1) {
    throw new Error(`Account ${buffer.toBase58()} is not a buffer (tag ${tag}).`);
  }
  const hasAuthority = account.data[4] === 1;
  const payload = account.data.subarray(37);
  let significantBytes = payload.length;
  while (significantBytes > 0 && payload[significantBytes - 1] === 0) {
    significantBytes -= 1;
  }
  return {
    authority: hasAuthority
      ? new PublicKey(account.data.subarray(5, 37))
      : null,
    lamports: account.lamports,
    payloadBytes: payload.length,
    /**
     * Hash of the artifact-length prefix. An artifact can legitimately end in
     * zero bytes, so trimming trailing zeros before hashing would compare a
     * different span than the one that was reviewed.
     */
    sha256OfPrefix(length: number) {
      if (length > payload.length) {
        throw new Error(
          `Buffer holds ${payload.length} bytes, fewer than the reviewed ${length}.`,
        );
      }
      return createHash("sha256")
        .update(payload.subarray(0, length))
        .digest("hex");
    },
    significantBytes,
  };
}

async function commandInspect() {
  const rpc = connection();
  const account = await multisig.accounts.Multisig.fromAccountAddress(
    rpc,
    MULTISIG_PDA,
  );
  const programData = await rpc.getAccountInfo(PROGRAM_DATA_ID, COMMITMENT);
  if (!programData) {
    throw new Error("ProgramData account is missing.");
  }
  console.log(
    JSON.stringify(
      {
        currentTransactionIndex: Number(account.transactionIndex),
        members: account.members.map((member) => ({
          address: member.key.toBase58(),
          permissions: member.permissions.mask,
        })),
        multisig: MULTISIG_PDA.toBase58(),
        programDataCapacity: programData.data.length - 45,
        threshold: account.threshold,
        upgradeAuthority: new PublicKey(
          programData.data.subarray(13, 45),
        ).toBase58(),
        vault: VAULT_PDA.toBase58(),
        vaultIndex: VAULT_INDEX,
      },
      null,
      2,
    ),
  );
}

/** Compare the published buffer against the reviewed artifact's exact bytes. */
async function assertBufferMatchesArtifact(rpc: Connection, buffer: PublicKey) {
  const expectedSha256 = requiredEnvironment("TYCHE_ARTIFACT_SHA256");
  const expectedBytes = Number(requiredEnvironment("TYCHE_ARTIFACT_BYTES"));
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
    throw new Error("TYCHE_ARTIFACT_BYTES must be a positive integer.");
  }
  const state = await readBuffer(rpc, buffer);
  const sha256 = state.sha256OfPrefix(expectedBytes);
  const report = {
    authorityIsSquadsVault: state.authority?.equals(VAULT_PDA) ?? false,
    buffer: buffer.toBase58(),
    bufferAuthority: state.authority?.toBase58() ?? null,
    expectedBytes,
    expectedSha256,
    payloadBytes: state.payloadBytes,
    rentLamports: state.lamports,
    sha256,
    sha256Matches: sha256 === expectedSha256,
    significantBytes: state.significantBytes,
  };
  if (!report.sha256Matches) {
    throw new Error(
      `Buffer bytes do not match the reviewed artifact: ${JSON.stringify(report)}`,
    );
  }
  if (!report.authorityIsSquadsVault) {
    throw new Error(
      `Buffer authority is not the Squads vault: ${JSON.stringify(report)}`,
    );
  }
  return report;
}

async function commandVerifyBuffer() {
  const rpc = connection();
  const buffer = new PublicKey(requiredEnvironment("TYCHE_UPGRADE_BUFFER"));
  console.log(
    JSON.stringify(await assertBufferMatchesArtifact(rpc, buffer), null, 2),
  );
}

/**
 * Wrap the loader upgrade in a vault transaction and open a proposal with zero
 * approvals. Creating is not approving: the proposer still has to vote.
 */
async function commandPropose() {
  const rpc = connection();
  const proposer = loadMember("PRIVATE_KEY_WALLET_A");
  const buffer = new PublicKey(requiredEnvironment("TYCHE_UPGRADE_BUFFER"));
  // Never propose bytes that were not reviewed, and never propose a buffer the
  // vault cannot consume.
  await assertBufferMatchesArtifact(rpc, buffer);

  const account = await multisig.accounts.Multisig.fromAccountAddress(
    rpc,
    MULTISIG_PDA,
  );
  const transactionIndex = BigInt(Number(account.transactionIndex) + 1);
  const upgradeMessage = new TransactionMessage({
    instructions: [
      createLoaderUpgradeInstruction({
        buffer,
        // The buffer's rent is released on upgrade; refund it to whoever funded
        // the publication rather than to whoever happens to propose.
        spill: new PublicKey(requiredEnvironment("TYCHE_UPGRADE_SPILL")),
        upgradeAuthority: VAULT_PDA,
      }),
    ],
    payerKey: VAULT_PDA,
    recentBlockhash: (await rpc.getLatestBlockhash(COMMITMENT)).blockhash,
  });

  const createTransaction = multisig.instructions.vaultTransactionCreate({
    creator: proposer.publicKey,
    ephemeralSigners: 0,
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex,
    transactionMessage: upgradeMessage,
    vaultIndex: VAULT_INDEX,
  });
  const createProposal = multisig.instructions.proposalCreate({
    creator: proposer.publicKey,
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex,
  });

  const signature = await sendAndConfirm(rpc, proposer, [
    createTransaction,
    createProposal,
  ]);
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex,
  });
  console.log(
    JSON.stringify(
      {
        approvals: 0,
        proposal: proposalPda.toBase58(),
        proposer: proposer.publicKey.toBase58(),
        signature,
        transactionIndex: Number(transactionIndex),
      },
      null,
      2,
    ),
  );
}

async function commandApprove() {
  const rpc = connection();
  const member = loadMember(requiredEnvironment("TYCHE_APPROVER_ENV"));
  const transactionIndex = BigInt(
    requiredEnvironment("TYCHE_TRANSACTION_INDEX"),
  );
  const signature = await sendAndConfirm(rpc, member, [
    multisig.instructions.proposalApprove({
      member: member.publicKey,
      multisigPda: MULTISIG_PDA,
      programId: SQUADS_PROGRAM_ID,
      transactionIndex,
    }),
  ]);
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex,
  });
  const proposal = await multisig.accounts.Proposal.fromAccountAddress(
    rpc,
    proposalPda,
  );
  console.log(
    JSON.stringify(
      {
        approvals: proposal.approved.map((key) => key.toBase58()),
        member: member.publicKey.toBase58(),
        signature,
        status: proposal.status.__kind,
        transactionIndex: Number(transactionIndex),
      },
      null,
      2,
    ),
  );
}

async function commandStatus() {
  const rpc = connection();
  const transactionIndex = BigInt(
    requiredEnvironment("TYCHE_TRANSACTION_INDEX"),
  );
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex,
  });
  const proposal = await multisig.accounts.Proposal.fromAccountAddress(
    rpc,
    proposalPda,
  );
  const account = await multisig.accounts.Multisig.fromAccountAddress(
    rpc,
    MULTISIG_PDA,
  );
  console.log(
    JSON.stringify(
      {
        approvals: proposal.approved.map((key) => key.toBase58()),
        proposal: proposalPda.toBase58(),
        rejections: proposal.rejected.map((key) => key.toBase58()),
        status: proposal.status.__kind,
        threshold: account.threshold,
        transactionIndex: Number(transactionIndex),
      },
      null,
      2,
    ),
  );
}

async function commandExecute() {
  const rpc = connection();
  const executor = loadMember("PRIVATE_KEY_WALLET_A");
  const transactionIndex = BigInt(
    requiredEnvironment("TYCHE_TRANSACTION_INDEX"),
  );
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex,
  });
  const proposal = await multisig.accounts.Proposal.fromAccountAddress(
    rpc,
    proposalPda,
  );
  const account = await multisig.accounts.Multisig.fromAccountAddress(
    rpc,
    MULTISIG_PDA,
  );
  if (proposal.approved.length < account.threshold) {
    throw new Error(
      `Proposal has ${proposal.approved.length} approvals but the threshold is ${account.threshold}.`,
    );
  }

  const { instruction, lookupTableAccounts } =
    await multisig.instructions.vaultTransactionExecute({
      connection: rpc,
      member: executor.publicKey,
      multisigPda: MULTISIG_PDA,
      programId: SQUADS_PROGRAM_ID,
      transactionIndex,
    });
  const { blockhash, lastValidBlockHeight } =
    await rpc.getLatestBlockhash(COMMITMENT);
  const message = new TransactionMessage({
    instructions: [instruction],
    payerKey: executor.publicKey,
    recentBlockhash: blockhash,
  }).compileToV0Message(lookupTableAccounts);
  const transaction = new VersionedTransaction(message);
  transaction.sign([executor]);

  const simulation = await rpc.simulateTransaction(transaction, {
    commitment: COMMITMENT,
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `execute simulation failed: ${JSON.stringify(simulation.value.err)}; logs=${JSON.stringify(
        simulation.value.logs ?? [],
      )}`,
    );
  }
  const signature = await rpc.sendTransaction(transaction, {
    maxRetries: 5,
    preflightCommitment: COMMITMENT,
  });
  const confirmation = await rpc.confirmTransaction(
    { blockhash, lastValidBlockHeight, signature },
    COMMITMENT,
  );
  if (confirmation.value.err) {
    throw new Error(
      `execute ${signature} failed after send: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
  console.log(
    JSON.stringify(
      { executor: executor.publicKey.toBase58(), signature, transactionIndex: Number(transactionIndex) },
      null,
      2,
    ),
  );
}

/**
 * Move devnet SOL from a member wallet to the technical payer that holds the
 * buffer-publication keypair. Buffer rent is refunded to the spill address when
 * the upgrade consumes it.
 */
async function commandFundPayer() {
  const rpc = connection();
  const source = loadMember("PRIVATE_KEY_WALLET_A");
  const recipient = new PublicKey(requiredEnvironment("TYCHE_FUND_RECIPIENT"));
  const lamports = Number(requiredEnvironment("TYCHE_FUND_LAMPORTS"));
  if (!Number.isSafeInteger(lamports) || lamports <= 0) {
    throw new Error("TYCHE_FUND_LAMPORTS must be a positive integer.");
  }
  const signature = await sendAndConfirm(rpc, source, [
    SystemProgram.transfer({
      fromPubkey: source.publicKey,
      lamports,
      toPubkey: recipient,
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        lamports,
        recipient: recipient.toBase58(),
        recipientBalance: await rpc.getBalance(recipient, COMMITMENT),
        signature,
        source: source.publicKey.toBase58(),
      },
      null,
      2,
    ),
  );
}

const COMMANDS: Record<string, () => Promise<void>> = {
  approve: commandApprove,
  execute: commandExecute,
  "fund-payer": commandFundPayer,
  inspect: commandInspect,
  propose: commandPropose,
  status: commandStatus,
  "verify-buffer": commandVerifyBuffer,
};

export async function runSquadsUpgrade() {
  const command = process.argv[2] ?? "";
  const action = COMMANDS[command];
  if (!action) {
    throw new Error(
      `Usage: devnet-squads-upgrade.ts <${Object.keys(COMMANDS).sort().join("|")}>`,
    );
  }
  await action();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runSquadsUpgrade().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
