const fs = require("node:fs");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = require("@solana/web3.js");

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const LOADER_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const PROGRAM_ID = new PublicKey(
  "BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm",
);
const PROGRAM_DATA_ID = new PublicKey(
  "DBM5tfyUMcThsXyvMuYMEU1Xgfar4KZpXtSAh9LXusaS",
);
const EXPECTED_PAYER = new PublicKey(
  "4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH",
);
const LOADER_METADATA_BYTES = 45;
const REVIEWED_ARTIFACT_BYTES = 1_082_976;
const EXPECTED_INITIAL_CAPACITY = 1_082_920;
const EXTENSION_BYTES = 10_240;

function requiredEnvironment(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function readKeypair(path) {
  const secret = Uint8Array.from(JSON.parse(fs.readFileSync(path, "utf8")));
  return Keypair.fromSecretKey(secret);
}

function extendInstruction(payer) {
  const data = Buffer.alloc(8);
  data.writeUInt32LE(6, 0); // UpgradeableLoaderInstruction::ExtendProgram
  data.writeUInt32LE(EXTENSION_BYTES, 4);
  return new TransactionInstruction({
    data,
    keys: [
      { pubkey: PROGRAM_DATA_ID, isSigner: false, isWritable: true },
      { pubkey: PROGRAM_ID, isSigner: false, isWritable: true },
      {
        pubkey: SystemProgram.programId,
        isSigner: false,
        isWritable: false,
      },
      { pubkey: payer, isSigner: true, isWritable: true },
    ],
    programId: LOADER_ID,
  });
}

async function programDataSnapshot(connection, commitment) {
  const account = await connection.getAccountInfo(PROGRAM_DATA_ID, commitment);
  if (!account || !account.owner.equals(LOADER_ID)) {
    throw new Error("Tokenomics Core ProgramData is missing or has a wrong owner.");
  }
  if (account.data.length < LOADER_METADATA_BYTES) {
    throw new Error("Tokenomics Core ProgramData is malformed.");
  }
  return {
    capacity: account.data.length - LOADER_METADATA_BYTES,
    lamports: account.lamports,
    totalBytes: account.data.length,
  };
}

async function main() {
  const rpcUrl = requiredEnvironment("SOLANA_RPC_URL");
  const payer = readKeypair(requiredEnvironment("SOLANA_KEYPAIR_PATH"));
  if (!payer.publicKey.equals(EXPECTED_PAYER)) {
    throw new Error("The supplied keypair is not the reviewed devnet deployer.");
  }

  const connection = new Connection(rpcUrl, "confirmed");
  if ((await connection.getGenesisHash()) !== DEVNET_GENESIS_HASH) {
    throw new Error("The RPC endpoint is not Solana devnet.");
  }
  const [derivedProgramData] = PublicKey.findProgramAddressSync(
    [PROGRAM_ID.toBuffer()],
    LOADER_ID,
  );
  if (!derivedProgramData.equals(PROGRAM_DATA_ID)) {
    throw new Error("The configured ProgramData is not derived from Tokenomics Core.");
  }

  const before = await programDataSnapshot(connection, "finalized");
  if (before.capacity >= REVIEWED_ARTIFACT_BYTES) {
    console.log(
      JSON.stringify({
        alreadyExtended: true,
        capacity: before.capacity,
        programData: PROGRAM_DATA_ID.toBase58(),
      }),
    );
    return;
  }
  if (before.capacity !== EXPECTED_INITIAL_CAPACITY) {
    throw new Error(
      `Unexpected ProgramData capacity ${before.capacity}; expected ${EXPECTED_INITIAL_CAPACITY}.`,
    );
  }

  const expectedTotalBytes = before.totalBytes + EXTENSION_BYTES;
  const requiredLamports =
    await connection.getMinimumBalanceForRentExemption(expectedTotalBytes);
  const additionalRentLamports = requiredLamports - before.lamports;
  const payerBalance = await connection.getBalance(payer.publicKey, "finalized");
  if (additionalRentLamports <= 0 || payerBalance <= additionalRentLamports) {
    throw new Error("The reviewed deployer cannot fund the ProgramData extension.");
  }

  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: [extendInstruction(payer.publicKey)],
      payerKey: payer.publicKey,
      recentBlockhash: latest.blockhash,
    }).compileToV0Message(),
  );
  transaction.sign([payer]);

  const simulation = await connection.simulateTransaction(transaction, {
    commitment: "confirmed",
    replaceRecentBlockhash: false,
    sigVerify: true,
  });
  console.log(
    JSON.stringify({
      additionalRentLamports,
      error: simulation.value.err,
      logs: simulation.value.logs,
      stage: "signed-simulation",
      unitsConsumed: simulation.value.unitsConsumed,
    }),
  );
  if (simulation.value.err) {
    throw new Error("The signed extension failed simulation; nothing was sent.");
  }

  const signature = await connection.sendRawTransaction(
    transaction.serialize(),
    {
      maxRetries: 5,
      preflightCommitment: "confirmed",
      skipPreflight: false,
    },
  );
  const confirmation = await connection.confirmTransaction(
    { ...latest, signature },
    "finalized",
  );
  if (confirmation.value.err) {
    throw new Error(
      `The extension failed on-chain: ${JSON.stringify(confirmation.value.err)}.`,
    );
  }

  const after = await programDataSnapshot(connection, "finalized");
  if (
    after.capacity !== EXPECTED_INITIAL_CAPACITY + EXTENSION_BYTES ||
    after.lamports < requiredLamports
  ) {
    throw new Error(
      "The extension finalized, but strict ProgramData read-back failed.",
    );
  }
  console.log(
    JSON.stringify({
      additionalRentLamports,
      capacityAfter: after.capacity,
      capacityBefore: before.capacity,
      programDataLamportsAfter: after.lamports,
      signature,
      stage: "finalized",
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
