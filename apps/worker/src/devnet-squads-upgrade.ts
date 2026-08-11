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

const COMMITMENT: Commitment = "finalized";
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const LOADER_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const SQUADS_PROGRAM_ID = new PublicKey(
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
);
const MULTISIG_PDA = new PublicKey(
  "DQmcXBdLsQUVsk8UmgnTdnjruRHnAquuFP9wPa87T5RD",
);
const VAULT_INDEX = 0;
const VAULT_PDA = new PublicKey("DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp");
const EXECUTOR_PUBLIC_KEYS = new Map<string, PublicKey>([
  [
    "PRIVATE_KEY_WALLET_A",
    new PublicKey("EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea"),
  ],
  [
    "PRIVATE_KEY_WALLET_B",
    new PublicKey("EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW"),
  ],
]);
const PROGRAM_ID = new PublicKey(
  process.env.TYCHE_UPGRADE_PROGRAM_ID?.trim() ||
    "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd",
);
const PROGRAM_DATA_ID = new PublicKey(
  process.env.TYCHE_UPGRADE_PROGRAM_DATA_ID?.trim() ||
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

function loadExecutor() {
  const name = requiredEnvironment("TYCHE_EXECUTOR_ENV");
  const expected = EXECUTOR_PUBLIC_KEYS.get(name);
  if (!expected) {
    throw new Error(
      "TYCHE_EXECUTOR_ENV must be PRIVATE_KEY_WALLET_A or PRIVATE_KEY_WALLET_B.",
    );
  }
  const executor = loadMember(name);
  if (!executor.publicKey.equals(expected)) {
    throw new Error(`${name} does not match the reviewed Squads member.`);
  }
  return executor;
}

function connection() {
  return new Connection(
    requiredEnvironment("TYCHE_SOLANA_RPC_URL"),
    COMMITMENT,
  );
}

async function assertDevnet(rpc: Connection) {
  const genesisHash = await rpc.getGenesisHash();
  if (genesisHash !== DEVNET_GENESIS_HASH) {
    throw new Error(`Expected Solana devnet, received genesis ${genesisHash}.`);
  }
}

async function readProgramDeployment(rpc: Connection) {
  await assertDevnet(rpc);
  const [program, programData] = await rpc.getMultipleAccountsInfo(
    [PROGRAM_ID, PROGRAM_DATA_ID],
    COMMITMENT,
  );
  if (
    !program ||
    !program.executable ||
    !program.owner.equals(LOADER_ID) ||
    program.data.length !== 36 ||
    program.data.readUInt32LE(0) !== 2 ||
    !new PublicKey(program.data.subarray(4, 36)).equals(PROGRAM_DATA_ID)
  ) {
    throw new Error(
      "The upgrade target is not the expected executable loader program.",
    );
  }
  if (
    !programData ||
    !programData.owner.equals(LOADER_ID) ||
    programData.data.length < 45 ||
    programData.data.readUInt32LE(0) !== 3 ||
    programData.data.readUInt8(12) !== 1
  ) {
    throw new Error("The canonical ProgramData account is missing or invalid.");
  }
  const authority = new PublicKey(programData.data.subarray(13, 45));
  if (!authority.equals(VAULT_PDA)) {
    throw new Error(
      `ProgramData authority is ${authority.toBase58()}, not Squads vault 0.`,
    );
  }
  return {
    authority,
    capacity: programData.data.length - 45,
    deployedBytes: programData.data.subarray(45),
    deploymentSlot: programData.data.readBigUInt64LE(4),
  };
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
    throw new Error(
      `Account ${buffer.toBase58()} is not a buffer (tag ${tag}).`,
    );
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
  const deployment = await readProgramDeployment(rpc);
  const account = await multisig.accounts.Multisig.fromAccountAddress(
    rpc,
    MULTISIG_PDA,
  );
  console.log(
    JSON.stringify(
      {
        currentTransactionIndex: Number(account.transactionIndex),
        members: account.members.map((member) => ({
          address: member.key.toBase58(),
          permissions: member.permissions.mask,
        })),
        multisig: MULTISIG_PDA.toBase58(),
        program: PROGRAM_ID.toBase58(),
        programData: PROGRAM_DATA_ID.toBase58(),
        programDataCapacity: deployment.capacity,
        deploymentSlot: deployment.deploymentSlot.toString(),
        threshold: account.threshold,
        upgradeAuthority: deployment.authority.toBase58(),
        vault: VAULT_PDA.toBase58(),
        vaultIndex: VAULT_INDEX,
      },
      null,
      2,
    ),
  );
}

/** Compare the published buffer against the reviewed artifact's exact bytes. */
async function assertBufferMatchesArtifact(
  rpc: Connection,
  buffer: PublicKey,
  expectedAuthority = VAULT_PDA,
) {
  const expectedSha256 = requiredEnvironment("TYCHE_ARTIFACT_SHA256");
  const expectedBytes = Number(requiredEnvironment("TYCHE_ARTIFACT_BYTES"));
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes <= 0) {
    throw new Error("TYCHE_ARTIFACT_BYTES must be a positive integer.");
  }
  const state = await readBuffer(rpc, buffer);
  const sha256 = state.sha256OfPrefix(expectedBytes);
  const report = {
    authorityMatchesExpected:
      state.authority?.equals(expectedAuthority) ?? false,
    authorityIsSquadsVault: state.authority?.equals(VAULT_PDA) ?? false,
    buffer: buffer.toBase58(),
    bufferAuthority: state.authority?.toBase58() ?? null,
    expectedBufferAuthority: expectedAuthority.toBase58(),
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
  if (!report.authorityMatchesExpected) {
    throw new Error(
      `Buffer authority does not match the expected authority: ${JSON.stringify(report)}`,
    );
  }
  return report;
}

async function assertStoredUpgradeMatches({
  buffer,
  rpc,
  spill,
  transactionIndex,
}: {
  buffer: PublicKey;
  rpc: Connection;
  spill: PublicKey;
  transactionIndex: bigint;
}) {
  const [transactionPda] = multisig.getTransactionPda({
    index: transactionIndex,
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
  });
  const stored = await multisig.accounts.VaultTransaction.fromAccountAddress(
    rpc,
    transactionPda,
    COMMITMENT,
  );
  if (
    !stored.multisig.equals(MULTISIG_PDA) ||
    BigInt(stored.index.toString()) !== transactionIndex ||
    stored.vaultIndex !== VAULT_INDEX ||
    stored.message.addressTableLookups.length !== 0 ||
    stored.message.instructions.length !== 1
  ) {
    throw new Error("The stored Squads vault transaction identity is invalid.");
  }
  const inner = stored.message.instructions[0]!;
  const loader = stored.message.accountKeys[inner.programIdIndex];
  const expectedAccounts = [
    PROGRAM_DATA_ID,
    PROGRAM_ID,
    buffer,
    spill,
    SYSVAR_RENT_PUBKEY,
    SYSVAR_CLOCK_PUBKEY,
    VAULT_PDA,
  ];
  const accountIndexes = Array.from(inner.accountIndexes);
  const actualAccounts = accountIndexes.map(
    (index) => stored.message.accountKeys[index],
  );
  const expectedRoles = [
    [false, true],
    [false, true],
    [false, true],
    [false, true],
    [false, false],
    [false, false],
    [true, true],
  ] as const;
  if (
    !loader?.equals(LOADER_ID) ||
    !Buffer.from(inner.data).equals(Buffer.from([3, 0, 0, 0])) ||
    actualAccounts.length !== expectedAccounts.length ||
    actualAccounts.some(
      (account, index) => !account?.equals(expectedAccounts[index]!),
    ) ||
    accountIndexes.some((accountIndex, index) => {
      const [signer, writable] = expectedRoles[index]!;
      return (
        multisig.utils.isSignerIndex(stored.message, accountIndex) !== signer ||
        multisig.utils.isStaticWritableIndex(stored.message, accountIndex) !==
          writable
      );
    })
  ) {
    throw new Error(
      "The stored Squads transaction is not the exact reviewed loader upgrade.",
    );
  }
  return transactionPda;
}

async function commandVerifyBuffer() {
  const rpc = connection();
  const buffer = new PublicKey(requiredEnvironment("TYCHE_UPGRADE_BUFFER"));
  const expectedAuthority = process.env.TYCHE_EXPECTED_BUFFER_AUTHORITY?.trim()
    ? new PublicKey(process.env.TYCHE_EXPECTED_BUFFER_AUTHORITY.trim())
    : VAULT_PDA;
  console.log(
    JSON.stringify(
      await assertBufferMatchesArtifact(rpc, buffer, expectedAuthority),
      null,
      2,
    ),
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
  const spill = new PublicKey(requiredEnvironment("TYCHE_UPGRADE_SPILL"));
  // Never propose bytes that were not reviewed, and never propose a buffer the
  // vault cannot consume.
  const [deployment] = await Promise.all([
    readProgramDeployment(rpc),
    assertBufferMatchesArtifact(rpc, buffer),
  ]);
  const expectedBytes = Number(requiredEnvironment("TYCHE_ARTIFACT_BYTES"));
  if (expectedBytes > deployment.capacity) {
    throw new Error(
      `Artifact has ${expectedBytes} bytes but ProgramData capacity is ${deployment.capacity}.`,
    );
  }

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
        spill,
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
  await assertStoredUpgradeMatches({ buffer, rpc, spill, transactionIndex });
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
  const buffer = new PublicKey(requiredEnvironment("TYCHE_UPGRADE_BUFFER"));
  const spill = new PublicKey(requiredEnvironment("TYCHE_UPGRADE_SPILL"));
  await Promise.all([
    readProgramDeployment(rpc),
    assertBufferMatchesArtifact(rpc, buffer),
    assertStoredUpgradeMatches({ buffer, rpc, spill, transactionIndex }),
  ]);
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
  const executor = loadExecutor();
  const transactionIndex = BigInt(
    requiredEnvironment("TYCHE_TRANSACTION_INDEX"),
  );
  const buffer = new PublicKey(requiredEnvironment("TYCHE_UPGRADE_BUFFER"));
  const spill = new PublicKey(requiredEnvironment("TYCHE_UPGRADE_SPILL"));
  await Promise.all([
    readProgramDeployment(rpc),
    assertBufferMatchesArtifact(rpc, buffer),
    assertStoredUpgradeMatches({ buffer, rpc, spill, transactionIndex }),
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
  const expectedBytes = Number(requiredEnvironment("TYCHE_ARTIFACT_BYTES"));
  const expectedSha256 = requiredEnvironment("TYCHE_ARTIFACT_SHA256");
  const [after, proposalAfter, bufferAfter] = await Promise.all([
    readProgramDeployment(rpc),
    multisig.accounts.Proposal.fromAccountAddress(rpc, proposalPda, COMMITMENT),
    rpc.getAccountInfo(buffer, COMMITMENT),
  ]);
  const deployedSha256 = createHash("sha256")
    .update(after.deployedBytes.subarray(0, expectedBytes))
    .digest("hex");
  const trailingZeroBytes = after.capacity - expectedBytes;
  if (
    proposalAfter.status.__kind !== "Executed" ||
    expectedBytes > after.capacity ||
    deployedSha256 !== expectedSha256 ||
    !after.deployedBytes.subarray(expectedBytes).every((byte) => byte === 0) ||
    bufferAfter !== null
  ) {
    throw new Error(
      "The finalized upgrade failed deployed-byte, proposal, padding, authority, or buffer-closure verification.",
    );
  }
  console.log(
    JSON.stringify(
      {
        bufferClosed: true,
        deployedSha256,
        deploymentSlot: after.deploymentSlot.toString(),
        executor: executor.publicKey.toBase58(),
        program: PROGRAM_ID.toBase58(),
        programData: PROGRAM_DATA_ID.toBase58(),
        programDataCapacity: after.capacity,
        proposalStatus: proposalAfter.status.__kind,
        signature,
        trailingZeroBytes,
        transactionIndex: Number(transactionIndex),
        upgradeAuthority: after.authority.toBase58(),
      },
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
