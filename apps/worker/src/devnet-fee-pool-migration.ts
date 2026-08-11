import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { pathToFileURL } from "node:url";
import * as multisig from "@sqds/multisig";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import bs58 from "bs58";
import { decodeTokenConfig } from "./tokenomics-revenue-loop.js";

const FINALIZED: Commitment = "finalized";
const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const UPGRADEABLE_LOADER_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const SQUADS_PROGRAM_ID = new PublicKey(
  "SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf",
);
const MULTISIG_PDA = new PublicKey(
  "DQmcXBdLsQUVsk8UmgnTdnjruRHnAquuFP9wPa87T5RD",
);
const VAULT_INDEX = 0;
const VAULT_PDA = new PublicKey("DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp");
const TYCHE_PROGRAM_ID = new PublicKey(
  "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd",
);
const TYCHE_PROGRAM_DATA = new PublicKey(
  "AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g",
);
const TOKENOMICS_PROGRAM_ID = new PublicKey(
  "BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm",
);
const ATTRIBUTED_UNBRIDGED_LAMPORTS = 18_000_000n;
const LEGACY_ROLLOVER_LAMPORTS = 5_000_000n;
const LEGACY_TOTAL_LAMPORTS =
  ATTRIBUTED_UNBRIDGED_LAMPORTS + LEGACY_ROLLOVER_LAMPORTS;

function discriminator(namespace: "account" | "global", name: string) {
  return createHash("sha256")
    .update(`${namespace}:${name}`)
    .digest()
    .subarray(0, 8);
}

function u64(value: bigint) {
  const data = Buffer.alloc(8);
  data.writeBigUInt64LE(value);
  return data;
}

function pda(programId: PublicKey, seeds: (Buffer | string)[]) {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => (typeof seed === "string" ? Buffer.from(seed) : seed)),
    programId,
  )[0];
}

const GLOBAL_CONFIG = pda(TYCHE_PROGRAM_ID, ["global_config"]);
const TREASURY_VAULT = pda(TYCHE_PROGRAM_ID, ["treasury_vault"]);
const TOKEN_CONFIG = pda(TOKENOMICS_PROGRAM_ID, ["token_config"]);
const DISTRIBUTION_VAULT = pda(TOKENOMICS_PROGRAM_ID, ["distribution_vault"]);

export function createMigrateFeePoolCustodyInstruction(
  governanceAuthority = VAULT_PDA,
) {
  return new TransactionInstruction({
    data: Buffer.concat([
      discriminator("global", "migrate_fee_pool_custody"),
      u64(ATTRIBUTED_UNBRIDGED_LAMPORTS),
      u64(LEGACY_ROLLOVER_LAMPORTS),
    ]),
    keys: [
      { isSigner: true, isWritable: false, pubkey: governanceAuthority },
      { isSigner: false, isWritable: true, pubkey: GLOBAL_CONFIG },
      { isSigner: false, isWritable: true, pubkey: TREASURY_VAULT },
      { isSigner: false, isWritable: false, pubkey: TYCHE_PROGRAM_DATA },
      { isSigner: false, isWritable: false, pubkey: TOKENOMICS_PROGRAM_ID },
      { isSigner: false, isWritable: true, pubkey: TOKEN_CONFIG },
      { isSigner: false, isWritable: true, pubkey: DISTRIBUTION_VAULT },
    ],
    programId: TYCHE_PROGRAM_ID,
  });
}

function requiredEnvironment(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function loadKeypair(name: string) {
  const raw = requiredEnvironment(name);
  const bytes = raw.startsWith("[")
    ? Uint8Array.from(JSON.parse(raw) as number[])
    : bs58.decode(raw);
  return Keypair.fromSecretKey(bytes);
}

function rpcConnection() {
  return new Connection(requiredEnvironment("TYCHE_SOLANA_RPC_URL"), FINALIZED);
}

async function assertDevnet(connection: Connection) {
  const genesis = await connection.getGenesisHash();
  if (genesis !== DEVNET_GENESIS_HASH) {
    throw new Error(`Expected Solana devnet, received genesis ${genesis}.`);
  }
}

function decodeGlobalTreasuryAddress(data: Buffer) {
  if (
    data.length < 73 ||
    !data.subarray(0, 8).equals(discriminator("account", "GlobalConfig"))
  ) {
    throw new Error("Tyche GlobalConfig layout is invalid.");
  }
  let offset = 8 + 32;
  const pendingTag = data.readUInt8(offset);
  offset += 1;
  if (pendingTag === 1) offset += 32;
  else if (pendingTag !== 0)
    throw new Error("GlobalConfig pending authority tag is invalid.");
  return new PublicKey(data.subarray(offset, offset + 32));
}

async function readMigrationState(connection: Connection) {
  await assertDevnet(connection);
  const [global, treasury, tokenConfigInfo, distribution, programData] =
    await connection.getMultipleAccountsInfo(
      [
        GLOBAL_CONFIG,
        TREASURY_VAULT,
        TOKEN_CONFIG,
        DISTRIBUTION_VAULT,
        TYCHE_PROGRAM_DATA,
      ],
      FINALIZED,
    );
  if (
    !global?.owner.equals(TYCHE_PROGRAM_ID) ||
    !treasury?.owner.equals(TYCHE_PROGRAM_ID)
  ) {
    throw new Error(
      "Canonical Tyche migration accounts are missing or have the wrong owner.",
    );
  }
  if (
    !tokenConfigInfo?.owner.equals(TOKENOMICS_PROGRAM_ID) ||
    !distribution?.owner.equals(TOKENOMICS_PROGRAM_ID)
  ) {
    throw new Error(
      "Canonical Tokenomics fee-pool accounts are missing or have the wrong owner.",
    );
  }
  if (
    !programData?.owner.equals(UPGRADEABLE_LOADER_ID) ||
    programData.data.length < 45 ||
    programData.data.readUInt32LE(0) !== 3 ||
    programData.data.readUInt8(12) !== 1 ||
    !new PublicKey(programData.data.subarray(13, 45)).equals(VAULT_PDA)
  ) {
    throw new Error(
      "Tyche ProgramData is not governed by the canonical Squads vault.",
    );
  }
  if (
    treasury.data.length !== 49 ||
    !treasury.data
      .subarray(0, 8)
      .equals(discriminator("account", "TreasuryVault"))
  ) {
    throw new Error("Tyche TreasuryVault layout is invalid.");
  }
  if (
    distribution.data.length !== 25 ||
    !distribution.data
      .subarray(0, 8)
      .equals(discriminator("account", "DistributionVaultRecord"))
  ) {
    throw new Error("Tokenomics DistributionVault layout is invalid.");
  }

  const tokenConfig = decodeTokenConfig(tokenConfigInfo.data);
  const treasuryAuthority = new PublicKey(treasury.data.subarray(8, 40));
  const treasuryCounter = treasury.data.readBigUInt64LE(40);
  const treasuryRent = BigInt(
    await connection.getMinimumBalanceForRentExemption(
      treasury.data.length,
      FINALIZED,
    ),
  );
  const distributionRent = BigInt(
    await connection.getMinimumBalanceForRentExemption(
      distribution.data.length,
      FINALIZED,
    ),
  );
  const globalTreasuryAddress = decodeGlobalTreasuryAddress(global.data);
  const availableLegacyClaims = await connection.getProgramAccounts(
    TYCHE_PROGRAM_ID,
    {
      commitment: FINALIZED,
      filters: [
        { dataSize: 75 },
        {
          memcmp: {
            bytes: bs58.encode(discriminator("account", "Claim")),
            offset: 0,
          },
        },
      ],
    },
  );
  const legacyClaimLiability = availableLegacyClaims.reduce((total, claim) => {
    const kind = claim.account.data.readUInt8(48);
    const status = claim.account.data.readUInt8(57);
    return status === 0 && (kind === 1 || kind === 2)
      ? total + claim.account.data.readBigUInt64LE(49)
      : total;
  }, 0n);

  return {
    distributionAvailableLamports:
      BigInt(distribution.lamports) - distributionRent,
    distributionTotalClaimedLamports: distribution.data.readBigUInt64LE(16),
    distributionTotalDepositedLamports: distribution.data.readBigUInt64LE(8),
    globalTreasuryAddress,
    legacyClaimLiability,
    pendingRolloverLamports: tokenConfig.pendingRolloverLamports,
    tokenomicsGameAuthority: tokenConfig.gameAuthority,
    tokenomicsNextEpochId: tokenConfig.nextEpochId,
    treasuryAuthority,
    treasuryAvailableLamports: BigInt(treasury.lamports) - treasuryRent,
    treasuryCounter,
  };
}

function assertPreMigrationState(
  state: Awaited<ReturnType<typeof readMigrationState>>,
) {
  if (
    !state.globalTreasuryAddress.equals(state.treasuryAuthority) ||
    !state.tokenomicsGameAuthority.equals(GLOBAL_CONFIG) ||
    state.treasuryCounter !== LEGACY_TOTAL_LAMPORTS ||
    state.treasuryAvailableLamports !== LEGACY_TOTAL_LAMPORTS ||
    state.legacyClaimLiability !== 0n ||
    state.tokenomicsNextEpochId !== 0n ||
    state.pendingRolloverLamports !== 0n
  ) {
    throw new Error(
      `Live state does not match the reviewed migration boundary: ${stateJson(state)}`,
    );
  }
}

function assertPostMigrationState(
  state: Awaited<ReturnType<typeof readMigrationState>>,
) {
  if (
    !state.globalTreasuryAddress.equals(DISTRIBUTION_VAULT) ||
    state.treasuryCounter !== ATTRIBUTED_UNBRIDGED_LAMPORTS ||
    state.treasuryAvailableLamports !== 0n ||
    state.pendingRolloverLamports !== LEGACY_ROLLOVER_LAMPORTS ||
    state.distributionTotalDepositedLamports < LEGACY_ROLLOVER_LAMPORTS ||
    state.distributionAvailableLamports < LEGACY_TOTAL_LAMPORTS
  ) {
    throw new Error(
      `Post-migration state is not reconciled: ${stateJson(state)}`,
    );
  }
}

function stateJson(state: Awaited<ReturnType<typeof readMigrationState>>) {
  return JSON.stringify(
    state,
    (_key, value: unknown) =>
      typeof value === "bigint"
        ? value.toString()
        : value instanceof PublicKey
          ? value.toBase58()
          : value,
    2,
  );
}

async function sendAndConfirm(
  connection: Connection,
  payer: Keypair,
  instructions: TransactionInstruction[],
) {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(FINALIZED);
  const message = new TransactionMessage({
    instructions,
    payerKey: payer.publicKey,
    recentBlockhash: blockhash,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([payer]);
  const simulation = await connection.simulateTransaction(transaction, {
    commitment: FINALIZED,
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `Simulation failed: ${JSON.stringify(simulation.value.err)}; logs=${JSON.stringify(simulation.value.logs ?? [])}`,
    );
  }
  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 5,
    preflightCommitment: FINALIZED,
  });
  const confirmation = await connection.confirmTransaction(
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

async function assertStoredMigration(
  connection: Connection,
  transactionIndex: bigint,
) {
  const { proposalPda, transactionPda } =
    deriveMigrationGovernanceAddresses(transactionIndex);
  const stored = await multisig.accounts.VaultTransaction.fromAccountAddress(
    connection,
    transactionPda,
    FINALIZED,
  );
  if (
    !stored.multisig.equals(MULTISIG_PDA) ||
    BigInt(stored.index.toString()) !== transactionIndex ||
    stored.vaultIndex !== VAULT_INDEX ||
    stored.message.addressTableLookups.length !== 0 ||
    stored.message.instructions.length !== 1
  ) {
    throw new Error("Stored Squads migration transaction identity is invalid.");
  }
  const expected = createMigrateFeePoolCustodyInstruction();
  const inner = stored.message.instructions[0]!;
  const actualProgram = stored.message.accountKeys[inner.programIdIndex];
  const accountIndexes = Array.from(inner.accountIndexes);
  const actualAccounts = accountIndexes.map(
    (index) => stored.message.accountKeys[index],
  );
  const expectedRoles = [
    [true, true],
    [false, true],
    [false, true],
    [false, false],
    [false, false],
    [false, true],
    [false, true],
  ] as const;
  if (
    !actualProgram?.equals(expected.programId) ||
    !Buffer.from(inner.data).equals(expected.data) ||
    actualAccounts.length !== expected.keys.length ||
    actualAccounts.some(
      (account, index) => !account?.equals(expected.keys[index]!.pubkey),
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
      "Stored Squads transaction is not the exact reviewed fee-pool migration.",
    );
  }
  return proposalPda;
}

export function deriveMigrationGovernanceAddresses(transactionIndex: bigint) {
  const [transactionPda] = multisig.getTransactionPda({
    index: transactionIndex,
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
  });
  const [proposalPda] = multisig.getProposalPda({
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex,
  });
  return { proposalPda, transactionPda };
}

async function commandInspect() {
  const connection = rpcConnection();
  const state = await readMigrationState(connection);
  console.log(stateJson(state));
}

async function commandPropose() {
  const connection = rpcConnection();
  const proposer = loadKeypair("PRIVATE_KEY_WALLET_A");
  assertPreMigrationState(await readMigrationState(connection));
  const multisigAccount = await multisig.accounts.Multisig.fromAccountAddress(
    connection,
    MULTISIG_PDA,
    FINALIZED,
  );
  const transactionIndex =
    BigInt(multisigAccount.transactionIndex.toString()) + 1n;
  const transactionMessage = new TransactionMessage({
    instructions: [createMigrateFeePoolCustodyInstruction()],
    payerKey: VAULT_PDA,
    recentBlockhash: (await connection.getLatestBlockhash(FINALIZED)).blockhash,
  });
  const result = await sendAndConfirm(connection, proposer, [
    multisig.instructions.vaultTransactionCreate({
      creator: proposer.publicKey,
      ephemeralSigners: 0,
      multisigPda: MULTISIG_PDA,
      programId: SQUADS_PROGRAM_ID,
      transactionIndex,
      transactionMessage,
      vaultIndex: VAULT_INDEX,
    }),
    multisig.instructions.proposalCreate({
      creator: proposer.publicKey,
      multisigPda: MULTISIG_PDA,
      programId: SQUADS_PROGRAM_ID,
      transactionIndex,
    }),
  ]);
  const proposal = await assertStoredMigration(connection, transactionIndex);
  console.log(
    JSON.stringify(
      {
        approvals: 0,
        proposal: proposal.toBase58(),
        transactionIndex: transactionIndex.toString(),
        ...result,
      },
      null,
      2,
    ),
  );
}

async function commandApprove() {
  const connection = rpcConnection();
  const member = loadKeypair(requiredEnvironment("TYCHE_APPROVER_ENV"));
  const transactionIndex = BigInt(
    requiredEnvironment("TYCHE_TRANSACTION_INDEX"),
  );
  await assertStoredMigration(connection, transactionIndex);
  const result = await sendAndConfirm(connection, member, [
    multisig.instructions.proposalApprove({
      member: member.publicKey,
      multisigPda: MULTISIG_PDA,
      programId: SQUADS_PROGRAM_ID,
      transactionIndex,
    }),
  ]);
  console.log(
    JSON.stringify(
      {
        member: member.publicKey.toBase58(),
        transactionIndex: transactionIndex.toString(),
        ...result,
      },
      null,
      2,
    ),
  );
}

async function commandStatus() {
  const connection = rpcConnection();
  const transactionIndex = BigInt(
    requiredEnvironment("TYCHE_TRANSACTION_INDEX"),
  );
  const proposalPda = await assertStoredMigration(connection, transactionIndex);
  const proposal = await multisig.accounts.Proposal.fromAccountAddress(
    connection,
    proposalPda,
    FINALIZED,
  );
  console.log(
    JSON.stringify(
      {
        approvals: proposal.approved.map((key) => key.toBase58()),
        proposal: proposalPda.toBase58(),
        status: proposal.status.__kind,
        transactionIndex: transactionIndex.toString(),
      },
      null,
      2,
    ),
  );
}

async function commandExecute() {
  const connection = rpcConnection();
  const executor = loadKeypair("PRIVATE_KEY_WALLET_A");
  const transactionIndex = BigInt(
    requiredEnvironment("TYCHE_TRANSACTION_INDEX"),
  );
  const proposalPda = await assertStoredMigration(connection, transactionIndex);
  assertPreMigrationState(await readMigrationState(connection));
  const [proposal, multisigAccount] = await Promise.all([
    multisig.accounts.Proposal.fromAccountAddress(
      connection,
      proposalPda,
      FINALIZED,
    ),
    multisig.accounts.Multisig.fromAccountAddress(
      connection,
      MULTISIG_PDA,
      FINALIZED,
    ),
  ]);
  if (proposal.approved.length < multisigAccount.threshold) {
    throw new Error(
      `Proposal has ${proposal.approved.length} approvals; ${multisigAccount.threshold} required.`,
    );
  }
  const execution = await multisig.instructions.vaultTransactionExecute({
    connection,
    member: executor.publicKey,
    multisigPda: MULTISIG_PDA,
    programId: SQUADS_PROGRAM_ID,
    transactionIndex,
  });
  const result = await sendAndConfirm(connection, executor, [
    execution.instruction,
  ]);
  assertPostMigrationState(await readMigrationState(connection));
  console.log(
    JSON.stringify(
      { transactionIndex: transactionIndex.toString(), ...result },
      null,
      2,
    ),
  );
}

const COMMANDS: Record<string, () => Promise<void>> = {
  approve: commandApprove,
  execute: commandExecute,
  inspect: commandInspect,
  propose: commandPropose,
  status: commandStatus,
};

export async function runFeePoolMigration() {
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
      `Usage: devnet-fee-pool-migration.ts <${Object.keys(COMMANDS).join("|")}>`,
    );
  }
  await action();
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runFeePoolMigration().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
