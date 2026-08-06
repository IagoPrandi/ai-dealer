const { createHash } = require("node:crypto");
const fs = require("node:fs");
const {
  Connection,
  Keypair,
  PublicKey,
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
const TECHNICAL_PAYER = new PublicKey(
  "4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH",
);
const SQUADS_VAULT = new PublicKey(
  "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp",
);
const PROGRAM_DATA_METADATA_BYTES = 45;
const BUFFER_METADATA_BYTES = 37;
const CURRENT_PROGRAM_LENGTH = 1_045_352;
const CURRENT_SHA256 =
  "29825f38ff3d92214a4842e3ed00f983202b61ed7e82140df12f6af066948a35";
const PROGRAM_DATA_CAPACITY = 1_055_592;
const REVIEWED_ARTIFACT_BYTES = 1_049_304;
const REVIEWED_ARTIFACT_SHA256 =
  "3a8da33f590768b399e93aa6497cf92b2218701b9a9dd1e6342cc0c663bce200";
const BUFFER_UPLOAD_FEE_RESERVE_LAMPORTS = 6_000_000;

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

function decodeAuthority(account, expectedTag, metadataBytes, label) {
  if (
    !account ||
    !account.owner.equals(LOADER_ID) ||
    account.data.length < metadataBytes ||
    account.data.readUInt32LE(0) !== expectedTag
  ) {
    throw new Error(`${label} loader metadata is missing or malformed.`);
  }
  const optionOffset = expectedTag === 1 ? 4 : 12;
  const authorityOffset = optionOffset + 1;
  if (account.data[optionOffset] !== 1) {
    throw new Error(`${label} has no authority.`);
  }
  return {
    authority: new PublicKey(
      account.data.subarray(authorityOffset, authorityOffset + 32),
    ),
    bytes: account.data.subarray(metadataBytes),
    lamports: account.lamports,
    totalBytes: account.data.length,
  };
}

async function readProgramData(connection, commitment) {
  const [program, programDataAccount] = await Promise.all([
    connection.getAccountInfo(PROGRAM_ID, commitment),
    connection.getAccountInfo(PROGRAM_DATA_ID, commitment),
  ]);
  if (
    !program ||
    !program.executable ||
    !program.owner.equals(LOADER_ID) ||
    program.data.length !== 36 ||
    program.data.readUInt32LE(0) !== 2 ||
    !new PublicKey(program.data.subarray(4, 36)).equals(PROGRAM_DATA_ID)
  ) {
    throw new Error("Tyche does not link to the reviewed ProgramData.");
  }
  return decodeAuthority(
    programDataAccount,
    3,
    PROGRAM_DATA_METADATA_BYTES,
    "Tyche ProgramData",
  );
}

function verifyProgramData(programData) {
  if (
    !programData.authority.equals(SQUADS_VAULT) ||
    programData.bytes.length !== PROGRAM_DATA_CAPACITY ||
    sha256(programData.bytes.subarray(0, CURRENT_PROGRAM_LENGTH)) !==
      CURRENT_SHA256 ||
    programData.bytes
      .subarray(CURRENT_PROGRAM_LENGTH)
      .some((byte) => byte !== 0)
  ) {
    throw new Error("The finalized Tyche ProgramData is not in the reviewed state.");
  }
}

function verifyArtifact() {
  const artifact = fs.readFileSync(requiredEnvironment("TYCHE_ARTIFACT_PATH"));
  if (
    artifact.length !== REVIEWED_ARTIFACT_BYTES ||
    sha256(artifact) !== REVIEWED_ARTIFACT_SHA256
  ) {
    throw new Error("The supplied Tyche artifact is not the reviewed binary.");
  }
}

async function devnetConnection() {
  const connection = new Connection(requiredEnvironment("SOLANA_RPC_URL"), "confirmed");
  if ((await connection.getGenesisHash()) !== DEVNET_GENESIS_HASH) {
    throw new Error("The RPC endpoint is not Solana devnet.");
  }
  const [derivedProgramData] = PublicKey.findProgramAddressSync(
    [PROGRAM_ID.toBuffer()],
    LOADER_ID,
  );
  if (!derivedProgramData.equals(PROGRAM_DATA_ID)) {
    throw new Error("The configured ProgramData is not derived from Tyche.");
  }
  return connection;
}

async function connectionAndPayer() {
  const payer = readKeypair(requiredEnvironment("SOLANA_KEYPAIR_PATH"));
  if (!payer.publicKey.equals(TECHNICAL_PAYER)) {
    throw new Error("The supplied keypair is not the reviewed devnet payer.");
  }
  const connection = await devnetConnection();
  return { connection, payer };
}

async function simulateSendAndFinalize(connection, payer, instructions) {
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions,
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
      error: simulation.value.err,
      stage: "signed-simulation",
      unitsConsumed: simulation.value.unitsConsumed,
    }),
  );
  if (simulation.value.err) {
    throw new Error("The signed transaction failed simulation; nothing was sent.");
  }
  const signature = await connection.sendRawTransaction(transaction.serialize(), {
    maxRetries: 5,
    preflightCommitment: "confirmed",
    skipPreflight: false,
  });
  const confirmation = await connection.confirmTransaction(
    { ...latest, signature },
    "finalized",
  );
  if (confirmation.value.err) {
    throw new Error(
      `The transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}.`,
    );
  }
  return signature;
}

async function planBufferPublication() {
  verifyArtifact();
  const connection = await devnetConnection();
  const programData = await readProgramData(connection, "finalized");
  verifyProgramData(programData);
  const bufferId = new PublicKey(requiredEnvironment("TYCHE_BUFFER_ADDRESS"));
  const bufferAccount = await connection.getAccountInfo(bufferId, "finalized");
  if (bufferAccount) {
    const buffer = await readReviewedBuffer(
      connection,
      bufferId,
      "finalized",
    );
    console.log(
      JSON.stringify({
        alreadyPublished: true,
        authority: buffer.authority.toBase58(),
        buffer: bufferId.toBase58(),
        bytes: buffer.bytes.length,
        sha256: sha256(buffer.bytes),
        stage: "finalized-readback",
      }),
    );
    return;
  }

  const bufferRentLamports = await connection.getMinimumBalanceForRentExemption(
    BUFFER_METADATA_BYTES + REVIEWED_ARTIFACT_BYTES,
  );
  const payerBalance = await connection.getBalance(TECHNICAL_PAYER, "finalized");
  const requiredPayerLamports =
    bufferRentLamports + BUFFER_UPLOAD_FEE_RESERVE_LAMPORTS;
  const fundingShortfallLamports = Math.max(
    0,
    requiredPayerLamports - payerBalance,
  );
  console.log(
    JSON.stringify({
      artifactBytes: REVIEWED_ARTIFACT_BYTES,
      artifactSha256: REVIEWED_ARTIFACT_SHA256,
      buffer: bufferId.toBase58(),
      bufferRentLamports,
      bufferUploadFeeReserveLamports: BUFFER_UPLOAD_FEE_RESERVE_LAMPORTS,
      cluster: "devnet",
      feePayer: TECHNICAL_PAYER.toBase58(),
      fundingShortfallLamports,
      payerBalanceLamports: payerBalance,
      programDataCapacity: programData.bytes.length,
      programDataCurrentSha256: CURRENT_SHA256,
      requiredPayerLamports,
      stage: "reviewed-plan",
    }),
  );
}

async function readReviewedBuffer(connection, bufferId, commitment) {
  const account = await connection.getAccountInfo(bufferId, commitment);
  const buffer = decodeAuthority(
    account,
    1,
    BUFFER_METADATA_BYTES,
    "Tyche ORAO upgrade buffer",
  );
  if (
    buffer.bytes.length !== REVIEWED_ARTIFACT_BYTES ||
    sha256(buffer.bytes) !== REVIEWED_ARTIFACT_SHA256
  ) {
    throw new Error("The on-chain buffer does not match the reviewed artifact.");
  }
  return buffer;
}

async function verifyBuffer() {
  verifyArtifact();
  const connection = await devnetConnection();
  const programData = await readProgramData(connection, "finalized");
  verifyProgramData(programData);
  const bufferId = new PublicKey(requiredEnvironment("TYCHE_BUFFER_ADDRESS"));
  const buffer = await readReviewedBuffer(connection, bufferId, "finalized");
  if (
    !buffer.authority.equals(TECHNICAL_PAYER) &&
    !buffer.authority.equals(SQUADS_VAULT)
  ) {
    throw new Error("The reviewed buffer has an unexpected authority.");
  }
  console.log(
    JSON.stringify({
      authority: buffer.authority.toBase58(),
      buffer: bufferId.toBase58(),
      bytes: buffer.bytes.length,
      sha256: sha256(buffer.bytes),
      stage: "finalized-readback",
    }),
  );
}

async function transferBufferAuthority() {
  verifyArtifact();
  const { connection, payer } = await connectionAndPayer();
  const programData = await readProgramData(connection, "finalized");
  verifyProgramData(programData);
  const bufferId = new PublicKey(requiredEnvironment("TYCHE_BUFFER_ADDRESS"));
  const before = await readReviewedBuffer(connection, bufferId, "finalized");
  if (before.authority.equals(SQUADS_VAULT)) {
    console.log(
      JSON.stringify({
        alreadyTransferred: true,
        buffer: bufferId.toBase58(),
        bufferAuthority: before.authority.toBase58(),
      }),
    );
    return;
  }
  if (!before.authority.equals(payer.publicKey)) {
    throw new Error("The technical payer is not the current buffer authority.");
  }

  const data = Buffer.alloc(4);
  data.writeUInt32LE(4, 0);
  const instruction = new TransactionInstruction({
    data,
    keys: [
      { pubkey: bufferId, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: true, isWritable: false },
      { pubkey: SQUADS_VAULT, isSigner: false, isWritable: false },
    ],
    programId: LOADER_ID,
  });
  console.log(
    JSON.stringify({
      buffer: bufferId.toBase58(),
      cluster: "devnet",
      currentAuthority: payer.publicKey.toBase58(),
      newAuthority: SQUADS_VAULT.toBase58(),
      stage: "reviewed-plan",
    }),
  );
  const signature = await simulateSendAndFinalize(connection, payer, [instruction]);
  const after = await readReviewedBuffer(connection, bufferId, "finalized");
  if (!after.authority.equals(SQUADS_VAULT)) {
    throw new Error("The authority transfer finalized, but strict read-back failed.");
  }
  console.log(
    JSON.stringify({
      buffer: bufferId.toBase58(),
      bufferAuthority: after.authority.toBase58(),
      sha256: sha256(after.bytes),
      signature,
      stage: "finalized",
    }),
  );
}

const command = process.argv[2];
const action =
  command === "plan-buffer"
    ? planBufferPublication
    : command === "verify-buffer"
      ? verifyBuffer
      : command === "transfer-buffer-authority"
        ? transferBufferAuthority
        : null;

if (!action) {
  console.error(
    "Usage: prepare-tyche-orao-upgrade.cjs <plan-buffer|verify-buffer|transfer-buffer-authority>",
  );
  process.exitCode = 1;
} else {
  action().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
