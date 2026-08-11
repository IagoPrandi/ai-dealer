import { createHash } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import bs58 from "bs58";

const FINALIZED: Commitment = "finalized";
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const LOADER_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
const SQUADS_PROGRAM_ID = new PublicKey(
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
);
const MULTISIG_PDA = new PublicKey(
  "DQmcXBdLsQUVsk8UmgnTdnjruRHnAquuFP9wPa87T5RD",
);
const VAULT_PDA = new PublicKey("DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp");
const WALLET_A = new PublicKey("EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea");
const WALLET_B = new PublicKey("EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW");
const TYCHE_PROGRAM_ID = new PublicKey(
  "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd",
);
const TYCHE_PROGRAM_DATA = new PublicKey(
  "AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g",
);
const EXTEND_PROGRAM_CHECKED_FEATURE = new PublicKey(
  "2oMRZEDWT2tqtYMofhmmfQ8SsjqUFzT6sYXppQDavxwz",
);
const TRANSACTION_INDEX = 15n;
const CURRENT_CAPACITY = 1_055_592;
const CURRENT_PROGRAM_DATA_LAMPORTS = 7_348_124_400;
const CURRENT_SHA256 =
  "b44896d44b6e6ac0c2bce7c7e672c58f245c0a60d8a073ab92cea892a862b79a";
const EXTENSION_BYTES = 65_536;
const TARGET_CAPACITY = CURRENT_CAPACITY + EXTENSION_BYTES;
const REQUIRED_PROGRAM_DATA_LAMPORTS = 7_804_254_960;

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function loadKeypair(name: "PRIVATE_KEY_WALLET_A" | "PRIVATE_KEY_WALLET_B") {
  const raw = requiredEnvironment(name);
  const bytes = raw.startsWith("[")
    ? Uint8Array.from(JSON.parse(raw) as number[])
    : bs58.decode(raw);
  const keypair = Keypair.fromSecretKey(bytes);
  const expected = name === "PRIVATE_KEY_WALLET_A" ? WALLET_A : WALLET_B;
  if (!keypair.publicKey.equals(expected)) {
    throw new Error(`${name} does not match the reviewed Squads member.`);
  }
  return keypair;
}

function connection() {
  return new Connection(requiredEnvironment("TYCHE_SOLANA_RPC_URL"), FINALIZED);
}

function sha256(data: Buffer) {
  return createHash("sha256").update(data).digest("hex");
}

export function createTycheAuthorityBridgeInstruction() {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(4, 0);
  return new TransactionInstruction({
    data,
    keys: [
      { isSigner: false, isWritable: true, pubkey: TYCHE_PROGRAM_DATA },
      { isSigner: true, isWritable: false, pubkey: VAULT_PDA },
      { isSigner: false, isWritable: false, pubkey: WALLET_A },
    ],
    programId: LOADER_ID,
  });
}

function createSetAuthorityInstruction(
  currentAuthority: PublicKey,
  newAuthority: PublicKey,
) {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(4, 0);
  return new TransactionInstruction({
    data,
    keys: [
      { isSigner: false, isWritable: true, pubkey: TYCHE_PROGRAM_DATA },
      { isSigner: true, isWritable: false, pubkey: currentAuthority },
      { isSigner: false, isWritable: false, pubkey: newAuthority },
    ],
    programId: LOADER_ID,
  });
}

export function createTycheExtensionInstruction() {
  const data = Buffer.alloc(8);
  data.writeUInt32LE(6, 0);
  data.writeUInt32LE(EXTENSION_BYTES, 4);
  return new TransactionInstruction({
    data,
    keys: [
      { isSigner: false, isWritable: true, pubkey: TYCHE_PROGRAM_DATA },
      { isSigner: false, isWritable: true, pubkey: TYCHE_PROGRAM_ID },
      { isSigner: false, isWritable: false, pubkey: SystemProgram.programId },
      { isSigner: true, isWritable: true, pubkey: WALLET_A },
    ],
    programId: LOADER_ID,
  });
}

export function createTycheAuthorityReturnInstruction() {
  return createSetAuthorityInstruction(WALLET_A, VAULT_PDA);
}

async function assertReviewedPrestate(
  rpc: Connection,
  options: {
    expectedAuthority?: PublicKey;
    expectedMultisigTransactionIndex?: bigint;
  } = {},
) {
  const expectedAuthority = options.expectedAuthority ?? VAULT_PDA;
  const expectedMultisigTransactionIndex =
    options.expectedMultisigTransactionIndex ?? 14n;
  if ((await rpc.getGenesisHash()) !== DEVNET_GENESIS_HASH) {
    throw new Error("The configured RPC is not Solana devnet.");
  }
  const [program, programData, feature, multisigAccount] = await Promise.all([
    rpc.getAccountInfo(TYCHE_PROGRAM_ID, FINALIZED),
    rpc.getAccountInfo(TYCHE_PROGRAM_DATA, FINALIZED),
    rpc.getAccountInfo(EXTEND_PROGRAM_CHECKED_FEATURE, FINALIZED),
    multisig.accounts.Multisig.fromAccountAddress(rpc, MULTISIG_PDA, FINALIZED),
  ]);
  if (
    !program?.executable ||
    !program.owner.equals(LOADER_ID) ||
    program.data.length !== 36 ||
    program.data.readUInt32LE(0) !== 2 ||
    !new PublicKey(program.data.subarray(4, 36)).equals(TYCHE_PROGRAM_DATA)
  ) {
    throw new Error("Tyche does not link to the reviewed ProgramData.");
  }
  if (
    !programData?.owner.equals(LOADER_ID) ||
    programData.data.length !== CURRENT_CAPACITY + 45 ||
    programData.data.readUInt32LE(0) !== 3 ||
    programData.data.readUInt8(12) !== 1 ||
    !new PublicKey(programData.data.subarray(13, 45)).equals(
      expectedAuthority,
    ) ||
    programData.lamports !== CURRENT_PROGRAM_DATA_LAMPORTS ||
    sha256(programData.data.subarray(45)) !== CURRENT_SHA256
  ) {
    throw new Error("Tyche ProgramData changed from the reviewed prestate.");
  }
  if (feature) {
    throw new Error(
      "ExtendProgramChecked is active; the legacy bridge is invalid.",
    );
  }
  if (
    BigInt(multisigAccount.transactionIndex.toString()) !==
      expectedMultisigTransactionIndex ||
    multisigAccount.threshold !== 2 ||
    multisigAccount.timeLock !== 0 ||
    multisigAccount.members.length !== 3
  ) {
    throw new Error(
      "Squads no longer matches the reviewed proposal-15 boundary.",
    );
  }
  return {
    programDataLamports: programData.lamports,
    transactionIndex: BigInt(multisigAccount.transactionIndex.toString()),
  };
}

async function sendAndConfirm(
  rpc: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
) {
  const { blockhash, lastValidBlockHeight } =
    await rpc.getLatestBlockhash(FINALIZED);
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions,
      payerKey: payer.publicKey,
      recentBlockhash: blockhash,
    }).compileToV0Message(),
  );
  transaction.sign([payer]);
  const simulation = await rpc.simulateTransaction(transaction, {
    commitment: FINALIZED,
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `Signed simulation failed: ${JSON.stringify(simulation.value.err)}; logs=${JSON.stringify(simulation.value.logs ?? [])}`,
    );
  }
  const signature = await rpc.sendTransaction(transaction, {
    maxRetries: 5,
    preflightCommitment: FINALIZED,
  });
  const confirmation = await rpc.confirmTransaction(
    { blockhash, lastValidBlockHeight, signature },
    FINALIZED,
  );
  if (confirmation.value.err) {
    throw new Error(
      `Transaction ${signature} failed: ${JSON.stringify(confirmation.value.err)}`,
    );
  }
  return { signature, unitsConsumed: simulation.value.unitsConsumed ?? null };
}

async function assertStoredProposal(rpc: Connection) {
  const [transactionPda] = multisig.getTransactionPda({
    index: TRANSACTION_INDEX,
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
  });
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex: TRANSACTION_INDEX,
  });
  const [stored, proposal] = await Promise.all([
    multisig.accounts.VaultTransaction.fromAccountAddress(
      rpc,
      transactionPda,
      FINALIZED,
    ),
    multisig.accounts.Proposal.fromAccountAddress(rpc, proposalPda, FINALIZED),
  ]);
  const expected = createTycheAuthorityBridgeInstruction();
  const inner = stored.message.instructions[0];
  if (
    !stored.multisig.equals(MULTISIG_PDA) ||
    BigInt(stored.index.toString()) !== TRANSACTION_INDEX ||
    stored.vaultIndex !== 0 ||
    stored.message.addressTableLookups.length !== 0 ||
    stored.message.instructions.length !== 1 ||
    !inner ||
    !stored.message.accountKeys[inner.programIdIndex]?.equals(
      expected.programId,
    ) ||
    !Buffer.from(inner.data).equals(expected.data)
  ) {
    throw new Error(
      "Stored Squads proposal 15 identity or instruction is invalid.",
    );
  }
  const accountIndexes = Array.from(inner.accountIndexes);
  const expectedRoles = [
    [false, true],
    // Squads compiles vault 0 as the inner message fee payer, which promotes
    // the otherwise read-only authority signer to writable in the message.
    [true, true],
    [false, false],
  ] as const;
  if (
    accountIndexes.length !== expected.keys.length ||
    accountIndexes.some((accountIndex, index) => {
      const account = stored.message.accountKeys[accountIndex];
      const [signer, writable] = expectedRoles[index]!;
      return (
        !account?.equals(expected.keys[index]!.pubkey) ||
        multisig.utils.isSignerIndex(stored.message, accountIndex) !== signer ||
        multisig.utils.isStaticWritableIndex(stored.message, accountIndex) !==
          writable
      );
    })
  ) {
    throw new Error(
      `Stored Squads proposal 15 accounts or roles are invalid: ${JSON.stringify(
        accountIndexes.map((accountIndex) => ({
          address: stored.message.accountKeys[accountIndex]?.toBase58(),
          signer: multisig.utils.isSignerIndex(stored.message, accountIndex),
          writable: multisig.utils.isStaticWritableIndex(
            stored.message,
            accountIndex,
          ),
        })),
      )}`,
    );
  }
  return { proposal, proposalPda, transactionPda };
}

async function commandInspect() {
  const rpc = connection();
  const prestate = await assertReviewedPrestate(rpc);
  const walletABalance = await rpc.getBalance(WALLET_A, FINALIZED);
  console.log(
    JSON.stringify(
      {
        authority: VAULT_PDA.toBase58(),
        currentCapacity: CURRENT_CAPACITY,
        currentSha256: CURRENT_SHA256,
        nextTransactionIndex: (prestate.transactionIndex + 1n).toString(),
        programData: TYCHE_PROGRAM_DATA.toBase58(),
        programDataLamports: prestate.programDataLamports,
        temporaryAuthority: WALLET_A.toBase58(),
        walletABalance,
      },
      null,
      2,
    ),
  );
}

async function commandPropose() {
  const rpc = connection();
  const creator = loadKeypair("PRIVATE_KEY_WALLET_A");
  await assertReviewedPrestate(rpc);
  const transactionMessage = new TransactionMessage({
    instructions: [createTycheAuthorityBridgeInstruction()],
    payerKey: VAULT_PDA,
    recentBlockhash: (await rpc.getLatestBlockhash(FINALIZED)).blockhash,
  });
  const result = await sendAndConfirm(rpc, creator, [
    multisig.instructions.vaultTransactionCreate({
      creator: creator.publicKey,
      ephemeralSigners: 0,
      memo: "DEVNET ATOMIC-ONLY: Tyche ProgramData extension authority bridge",
      multisigPda: MULTISIG_PDA,
      programId: SQUADS_PROGRAM_ID,
      transactionIndex: TRANSACTION_INDEX,
      transactionMessage,
      vaultIndex: 0,
    }),
    multisig.instructions.proposalCreate({
      creator: creator.publicKey,
      multisigPda: MULTISIG_PDA,
      programId: SQUADS_PROGRAM_ID,
      transactionIndex: TRANSACTION_INDEX,
    }),
  ]);
  const stored = await assertStoredProposal(rpc);
  if (
    stored.proposal.status.__kind !== "Active" ||
    stored.proposal.approved.length !== 0
  ) {
    throw new Error(
      "Proposal 15 was not finalized active with zero approvals.",
    );
  }
  console.log(
    JSON.stringify(
      {
        approvals: 0,
        proposal: stored.proposalPda.toBase58(),
        transaction: stored.transactionPda.toBase58(),
        transactionIndex: TRANSACTION_INDEX.toString(),
        ...result,
      },
      null,
      2,
    ),
  );
}

async function approve(name: "PRIVATE_KEY_WALLET_A" | "PRIVATE_KEY_WALLET_B") {
  const rpc = connection();
  const member = loadKeypair(name);
  const storedBefore = await assertStoredProposal(rpc);
  if (storedBefore.proposal.status.__kind !== "Active") {
    throw new Error("Proposal 15 is not active.");
  }
  const result = await sendAndConfirm(rpc, member, [
    multisig.instructions.proposalApprove({
      member: member.publicKey,
      multisigPda: MULTISIG_PDA,
      programId: SQUADS_PROGRAM_ID,
      transactionIndex: TRANSACTION_INDEX,
    }),
  ]);
  const storedAfter = await assertStoredProposal(rpc);
  if (
    !storedAfter.proposal.approved.some((key) => key.equals(member.publicKey))
  ) {
    throw new Error(
      "The finalized proposal does not contain the member approval.",
    );
  }
  console.log(
    JSON.stringify(
      {
        approvals: storedAfter.proposal.approved.map((key) => key.toBase58()),
        member: member.publicKey.toBase58(),
        proposalStatus: storedAfter.proposal.status.__kind,
        transactionIndex: TRANSACTION_INDEX.toString(),
        ...result,
      },
      null,
      2,
    ),
  );
}

async function commandStatus() {
  const rpc = connection();
  const stored = await assertStoredProposal(rpc);
  console.log(
    JSON.stringify(
      {
        approvals: stored.proposal.approved.map((key) => key.toBase58()),
        proposal: stored.proposalPda.toBase58(),
        status: stored.proposal.status.__kind,
        transaction: stored.transactionPda.toBase58(),
        transactionIndex: TRANSACTION_INDEX.toString(),
      },
      null,
      2,
    ),
  );
}

async function commandExecuteBridge() {
  const rpc = connection();
  const executor = loadKeypair("PRIVATE_KEY_WALLET_A");
  await assertReviewedPrestate(rpc, {
    expectedMultisigTransactionIndex: TRANSACTION_INDEX,
  });
  const stored = await assertStoredProposal(rpc);
  const expectedApprovals = new Set([WALLET_A.toBase58(), WALLET_B.toBase58()]);
  if (
    stored.proposal.status.__kind !== "Approved" ||
    stored.proposal.approved.length !== 2 ||
    stored.proposal.approved.some(
      (member) => !expectedApprovals.has(member.toBase58()),
    )
  ) {
    throw new Error(
      "Proposal 15 does not have exactly the reviewed approvals.",
    );
  }
  const execution = await multisig.instructions.vaultTransactionExecute({
    connection: rpc,
    member: executor.publicKey,
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex: TRANSACTION_INDEX,
  });
  const result = await sendAndConfirm(rpc, executor, [execution.instruction]);
  await assertReviewedPrestate(rpc, {
    expectedAuthority: WALLET_A,
    expectedMultisigTransactionIndex: TRANSACTION_INDEX,
  });
  const after = await assertStoredProposal(rpc);
  if (after.proposal.status.__kind !== "Executed") {
    throw new Error("Proposal 15 did not finalize as Executed.");
  }
  console.log(
    JSON.stringify(
      {
        authorityAfter: WALLET_A.toBase58(),
        proposalStatus: after.proposal.status.__kind,
        transactionIndex: TRANSACTION_INDEX.toString(),
        ...result,
      },
      null,
      2,
    ),
  );
}

async function commandExtendAndReturn() {
  const rpc = connection();
  const walletA = loadKeypair("PRIVATE_KEY_WALLET_A");
  await assertReviewedPrestate(rpc, {
    expectedAuthority: WALLET_A,
    expectedMultisigTransactionIndex: TRANSACTION_INDEX,
  });
  const [requiredLamports, walletBalance] = await Promise.all([
    rpc.getMinimumBalanceForRentExemption(TARGET_CAPACITY + 45, FINALIZED),
    rpc.getBalance(WALLET_A, FINALIZED),
  ]);
  if (
    requiredLamports !== REQUIRED_PROGRAM_DATA_LAMPORTS ||
    walletBalance <= requiredLamports - CURRENT_PROGRAM_DATA_LAMPORTS
  ) {
    throw new Error("Extension rent or Wallet A funding changed from review.");
  }
  const result = await sendAndConfirm(rpc, walletA, [
    createTycheExtensionInstruction(),
    createTycheAuthorityReturnInstruction(),
  ]);
  const [programData, stored] = await Promise.all([
    rpc.getAccountInfo(TYCHE_PROGRAM_DATA, FINALIZED),
    assertStoredProposal(rpc),
  ]);
  if (
    !programData?.owner.equals(LOADER_ID) ||
    programData.data.length !== TARGET_CAPACITY + 45 ||
    programData.data.readUInt32LE(0) !== 3 ||
    programData.data.readUInt8(12) !== 1 ||
    !new PublicKey(programData.data.subarray(13, 45)).equals(VAULT_PDA) ||
    programData.lamports !== REQUIRED_PROGRAM_DATA_LAMPORTS ||
    sha256(programData.data.subarray(45, 45 + CURRENT_CAPACITY)) !==
      CURRENT_SHA256 ||
    programData.data
      .subarray(45 + CURRENT_CAPACITY)
      .some((byte) => byte !== 0) ||
    stored.proposal.status.__kind !== "Executed"
  ) {
    throw new Error("Atomic extension finalized but strict readback failed.");
  }
  console.log(
    JSON.stringify(
      {
        authorityAfter: VAULT_PDA.toBase58(),
        capacityAfter: TARGET_CAPACITY,
        extensionBytes: EXTENSION_BYTES,
        fullCapacitySha256: sha256(programData.data.subarray(45)),
        programDataLamportsAfter: programData.lamports,
        rentPaidLamports:
          REQUIRED_PROGRAM_DATA_LAMPORTS - CURRENT_PROGRAM_DATA_LAMPORTS,
        ...result,
      },
      null,
      2,
    ),
  );
}

const COMMANDS: Record<string, () => Promise<void>> = {
  "approve-a": () => approve("PRIVATE_KEY_WALLET_A"),
  "approve-b": () => approve("PRIVATE_KEY_WALLET_B"),
  "execute-bridge": commandExecuteBridge,
  "extend-return": commandExtendAndReturn,
  inspect: commandInspect,
  propose: commandPropose,
  status: commandStatus,
};

export async function runTycheExtensionGovernance() {
  try {
    process.loadEnvFile(
      fileURLToPath(new URL("../../../.env", import.meta.url)),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  const command = process.argv[2] ?? "";
  const action = COMMANDS[command];
  if (!action) {
    throw new Error(
      `Usage: devnet-tyche-extension-governance.ts <${Object.keys(COMMANDS).join("|")}>`,
    );
  }
  await action();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runTycheExtensionGovernance().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
