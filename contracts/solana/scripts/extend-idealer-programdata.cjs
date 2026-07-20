const { createHash } = require("node:crypto");
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
  "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd",
);
const PROGRAM_DATA_ID = new PublicKey(
  "AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g",
);
const EXPECTED_PAYER = new PublicKey(
  "4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH",
);
const EXPECTED_INITIAL_AUTHORITY = EXPECTED_PAYER;
const LOADER_METADATA_BYTES = 45;
const EXPECTED_INITIAL_CAPACITY = 790_960;
const EXPECTED_INITIAL_SHA256 =
  "2b64705d56a3e410f7a701c496060d4754711a15e6441857745ca36bedf2d274";
const REVIEWED_ARTIFACT_BYTES = 1_023_336;
const REVIEWED_ARTIFACT_SHA256 =
  "2ca0484a3fef56bfa9f5831022474f3cef839bc27db36758d83cb8f57bf012d1";
const EXTENSION_BYTES = REVIEWED_ARTIFACT_BYTES - EXPECTED_INITIAL_CAPACITY;

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

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function extendInstruction(payer) {
  const data = Buffer.alloc(8);
  data.writeUInt32LE(6, 0);
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

function decodeProgramData(account) {
  if (!account || !account.owner.equals(LOADER_ID)) {
    throw new Error("Idealer ProgramData is missing or has a wrong owner.");
  }
  if (
    account.data.length < LOADER_METADATA_BYTES ||
    account.data.readUInt32LE(0) !== 3 ||
    account.data[12] !== 1
  ) {
    throw new Error("Idealer ProgramData loader metadata is malformed.");
  }
  return {
    authority: new PublicKey(account.data.subarray(13, 45)),
    capacity: account.data.length - LOADER_METADATA_BYTES,
    lamports: account.lamports,
    programBytes: account.data.subarray(LOADER_METADATA_BYTES),
    totalBytes: account.data.length,
  };
}

async function snapshot(connection, commitment) {
  const [programAccount, programDataAccount] = await Promise.all([
    connection.getAccountInfo(PROGRAM_ID, commitment),
    connection.getAccountInfo(PROGRAM_DATA_ID, commitment),
  ]);
  if (
    !programAccount ||
    !programAccount.executable ||
    !programAccount.owner.equals(LOADER_ID) ||
    programAccount.data.length !== 36 ||
    programAccount.data.readUInt32LE(0) !== 2 ||
    !new PublicKey(programAccount.data.subarray(4, 36)).equals(PROGRAM_DATA_ID)
  ) {
    throw new Error("Idealer program does not link to the expected ProgramData.");
  }
  return decodeProgramData(programDataAccount);
}

async function main() {
  const rpcUrl = requiredEnvironment("SOLANA_RPC_URL");
  const payer = readKeypair(requiredEnvironment("SOLANA_KEYPAIR_PATH"));
  if (!payer.publicKey.equals(EXPECTED_PAYER)) {
    throw new Error("The supplied keypair is not the reviewed devnet deployer.");
  }

  const artifact = fs.readFileSync(requiredEnvironment("IDEALER_ARTIFACT_PATH"));
  if (
    artifact.length !== REVIEWED_ARTIFACT_BYTES ||
    sha256(artifact) !== REVIEWED_ARTIFACT_SHA256
  ) {
    throw new Error("The supplied Idealer artifact is not the reviewed binary.");
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
    throw new Error("The configured ProgramData is not derived from Idealer.");
  }

  const before = await snapshot(connection, "finalized");
  if (before.capacity === REVIEWED_ARTIFACT_BYTES) {
    const paddingSha256 = sha256(before.programBytes);
    console.log(
      JSON.stringify({
        alreadyExtended: true,
        authority: before.authority.toBase58(),
        capacity: before.capacity,
        programData: PROGRAM_DATA_ID.toBase58(),
        programDataSha256: paddingSha256,
      }),
    );
    return;
  }
  if (
    before.capacity !== EXPECTED_INITIAL_CAPACITY ||
    !before.authority.equals(EXPECTED_INITIAL_AUTHORITY) ||
    sha256(before.programBytes) !== EXPECTED_INITIAL_SHA256
  ) {
    throw new Error(
      "The finalized Idealer ProgramData does not match the reviewed pre-extension state.",
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

  const after = await snapshot(connection, "finalized");
  const preservedPrefix = after.programBytes.subarray(
    0,
    EXPECTED_INITIAL_CAPACITY,
  );
  const extension = after.programBytes.subarray(EXPECTED_INITIAL_CAPACITY);
  if (
    after.capacity !== REVIEWED_ARTIFACT_BYTES ||
    after.lamports < requiredLamports ||
    !after.authority.equals(EXPECTED_INITIAL_AUTHORITY) ||
    sha256(preservedPrefix) !== EXPECTED_INITIAL_SHA256 ||
    extension.some((byte) => byte !== 0)
  ) {
    throw new Error(
      "The extension finalized, but strict ProgramData read-back failed.",
    );
  }
  console.log(
    JSON.stringify({
      additionalRentLamports,
      authority: after.authority.toBase58(),
      capacityAfter: after.capacity,
      capacityBefore: before.capacity,
      extensionBytes: EXTENSION_BYTES,
      programDataLamportsAfter: after.lamports,
      signature,
      stage: "finalized",
      zeroPaddingBytes: extension.length,
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
