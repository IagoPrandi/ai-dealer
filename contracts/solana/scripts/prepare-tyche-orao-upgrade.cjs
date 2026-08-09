const { createHash } = require("node:crypto");
const fs = require("node:fs");
const {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} = require("@solana/web3.js");

const DEVNET_GENESIS_HASH = "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG";
const LOADER_ID = new PublicKey("BPFLoaderUpgradeab1e11111111111111111111111");
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
const CURRENT_PROGRAM_LENGTH = 1_049_304;
const CURRENT_SHA256 =
  "3a8da33f590768b399e93aa6497cf92b2218701b9a9dd1e6342cc0c663bce200";
const PROGRAM_DATA_CAPACITY = 1_055_592;
const REVIEWED_ARTIFACT_BYTES = 1_018_304;
const REVIEWED_ARTIFACT_SHA256 =
  "fc54899f218c5c178639b426f994e06c451a858cf004d4ece5aabf216a56fb53";
const BUFFER_UPLOAD_FEE_RESERVE_LAMPORTS = 6_000_000;
const PACKET_DATA_SIZE = 1_232;

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
    throw new Error(
      "The finalized Tyche ProgramData is not in the reviewed state.",
    );
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
  const connection = new Connection(
    requiredEnvironment("SOLANA_RPC_URL"),
    "confirmed",
  );
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
    throw new Error(
      "The signed transaction failed simulation; nothing was sent.",
    );
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
    const buffer = await readReviewedBuffer(connection, bufferId, "finalized");
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
  const payerBalance = await connection.getBalance(
    TECHNICAL_PAYER,
    "finalized",
  );
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

async function createOrSimulateBuffer({ broadcast }) {
  verifyArtifact();
  const { connection, payer } = await connectionAndPayer();
  const programData = await readProgramData(connection, "finalized");
  verifyProgramData(programData);

  const bufferId = new PublicKey(requiredEnvironment("TYCHE_BUFFER_ADDRESS"));
  const bufferSigner = readKeypair(
    requiredEnvironment("TYCHE_BUFFER_KEYPAIR_PATH"),
  );
  if (!bufferSigner.publicKey.equals(bufferId)) {
    throw new Error(
      "The supplied buffer keypair does not match the reviewed address.",
    );
  }
  if (await connection.getAccountInfo(bufferId, "finalized")) {
    throw new Error("The reviewed buffer account already exists.");
  }

  const accountBytes = BUFFER_METADATA_BYTES + REVIEWED_ARTIFACT_BYTES;
  const bufferRentLamports =
    await connection.getMinimumBalanceForRentExemption(accountBytes);
  const payerBalanceLamports = await connection.getBalance(
    payer.publicKey,
    "finalized",
  );
  const initializeBuffer = new TransactionInstruction({
    data: Buffer.alloc(4),
    keys: [
      { pubkey: bufferId, isSigner: false, isWritable: true },
      { pubkey: payer.publicKey, isSigner: false, isWritable: false },
    ],
    programId: LOADER_ID,
  });
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: [
        SystemProgram.createAccount({
          fromPubkey: payer.publicKey,
          lamports: bufferRentLamports,
          newAccountPubkey: bufferId,
          programId: LOADER_ID,
          space: accountBytes,
        }),
        initializeBuffer,
      ],
      payerKey: payer.publicKey,
      recentBlockhash: latest.blockhash,
    }).compileToV0Message(),
  );
  transaction.sign([payer, bufferSigner]);

  const [fee, simulation] = await Promise.all([
    connection.getFeeForMessage(transaction.message, "confirmed"),
    connection.simulateTransaction(transaction, {
      commitment: "confirmed",
      replaceRecentBlockhash: false,
      sigVerify: true,
    }),
  ]);
  console.log(
    JSON.stringify({
      accountBytes,
      artifactBytes: REVIEWED_ARTIFACT_BYTES,
      artifactSha256: REVIEWED_ARTIFACT_SHA256,
      buffer: bufferId.toBase58(),
      bufferAuthority: payer.publicKey.toBase58(),
      bufferRentLamports,
      cluster: "devnet",
      error: simulation.value.err,
      estimatedNetworkFeeLamports: fee.value,
      feePayer: payer.publicKey.toBase58(),
      lastValidBlockHeight: latest.lastValidBlockHeight,
      payerBalanceLamports,
      stage: broadcast
        ? "signed-create-buffer-preflight"
        : "signed-create-buffer-simulation",
      unitsConsumed: simulation.value.unitsConsumed,
      writes: [bufferId.toBase58(), payer.publicKey.toBase58()],
    }),
  );
  if (simulation.value.err) {
    throw new Error(
      "The signed buffer-creation transaction failed simulation.",
    );
  }
  if (!broadcast) {
    return;
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
      `The buffer-creation transaction failed on-chain: ${JSON.stringify(confirmation.value.err)}.`,
    );
  }

  const [bufferAccount, finalizedTransaction] = await Promise.all([
    connection.getAccountInfo(bufferId, "finalized"),
    connection.getTransaction(signature, {
      commitment: "finalized",
      maxSupportedTransactionVersion: 0,
    }),
  ]);
  const buffer = decodeAuthority(
    bufferAccount,
    1,
    BUFFER_METADATA_BYTES,
    "Tyche revenue-fee upgrade buffer",
  );
  if (
    !buffer.authority.equals(payer.publicKey) ||
    buffer.totalBytes !== accountBytes ||
    buffer.bytes.length !== REVIEWED_ARTIFACT_BYTES ||
    buffer.bytes.some((byte) => byte !== 0) ||
    buffer.lamports !== bufferRentLamports ||
    !finalizedTransaction?.meta ||
    finalizedTransaction.meta.err
  ) {
    throw new Error("The finalized empty buffer failed strict read-back.");
  }
  const payerIndex = finalizedTransaction.transaction.message
    .getAccountKeys()
    .staticAccountKeys.findIndex((key) => key.equals(payer.publicKey));
  const payerDebitLamports =
    payerIndex >= 0
      ? finalizedTransaction.meta.preBalances[payerIndex] -
        finalizedTransaction.meta.postBalances[payerIndex]
      : null;
  console.log(
    JSON.stringify({
      authority: buffer.authority.toBase58(),
      buffer: bufferId.toBase58(),
      dataLength: buffer.totalBytes,
      emptyProgramBytes: buffer.bytes.length,
      feeLamports: finalizedTransaction.meta.fee,
      lamports: buffer.lamports,
      payerDebitLamports,
      signature,
      slot: finalizedTransaction.slot,
      stage: "finalized-empty-buffer",
    }),
  );
}

async function simulateBufferCreation() {
  return createOrSimulateBuffer({ broadcast: false });
}

async function createBuffer() {
  return createOrSimulateBuffer({ broadcast: true });
}

function createBufferWriteInstruction(bufferId, authority, offset, bytes) {
  const data = Buffer.alloc(16 + bytes.length);
  data.writeUInt32LE(1, 0);
  data.writeUInt32LE(offset, 4);
  data.writeBigUInt64LE(BigInt(bytes.length), 8);
  Buffer.from(bytes).copy(data, 16);
  return new TransactionInstruction({
    data,
    keys: [
      { pubkey: bufferId, isSigner: false, isWritable: true },
      { pubkey: authority, isSigner: true, isWritable: false },
    ],
    programId: LOADER_ID,
  });
}

async function simulateSignedLegacyTransaction(connection, transaction) {
  const response = await fetch(connection.rpcEndpoint, {
    body: JSON.stringify({
      id: 1,
      jsonrpc: "2.0",
      method: "simulateTransaction",
      params: [
        transaction.serialize().toString("base64"),
        {
          commitment: "confirmed",
          encoding: "base64",
          replaceRecentBlockhash: false,
          sigVerify: true,
        },
      ],
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json();
  if (!response.ok || payload.error || !payload.result?.value) {
    throw new Error("The signed loader write simulation RPC failed.");
  }
  return payload.result.value;
}

async function simulateBufferWrites() {
  verifyArtifact();
  const artifact = fs.readFileSync(requiredEnvironment("TYCHE_ARTIFACT_PATH"));
  const { connection, payer } = await connectionAndPayer();
  const programData = await readProgramData(connection, "finalized");
  verifyProgramData(programData);
  const bufferId = new PublicKey(requiredEnvironment("TYCHE_BUFFER_ADDRESS"));
  const buffer = decodeAuthority(
    await connection.getAccountInfo(bufferId, "finalized"),
    1,
    BUFFER_METADATA_BYTES,
    "Tyche revenue-fee upgrade buffer",
  );
  if (
    !buffer.authority.equals(payer.publicKey) ||
    buffer.bytes.length !== REVIEWED_ARTIFACT_BYTES ||
    buffer.bytes.some((byte) => byte !== 0)
  ) {
    throw new Error(
      "The reviewed buffer is not empty under technical authority.",
    );
  }

  const latest = await connection.getLatestBlockhash("confirmed");
  const baseline = new Transaction({
    feePayer: payer.publicKey,
    recentBlockhash: latest.blockhash,
  }).add(
    createBufferWriteInstruction(bufferId, payer.publicKey, 0, Buffer.alloc(0)),
  );
  baseline.sign(payer);
  const chunkSize = PACKET_DATA_SIZE - baseline.serialize().length - 1;
  if (chunkSize <= 0) {
    throw new Error("The calculated loader write chunk size is invalid.");
  }
  const chunkCount = Math.ceil(artifact.length / chunkSize);
  const indices = [...new Set([0, Math.floor(chunkCount / 2), chunkCount - 1])];
  const samples = [];
  let feeLamports = null;
  for (const index of indices) {
    const offset = index * chunkSize;
    const bytes = artifact.subarray(
      offset,
      Math.min(offset + chunkSize, artifact.length),
    );
    const transaction = new Transaction({
      feePayer: payer.publicKey,
      recentBlockhash: latest.blockhash,
    }).add(
      createBufferWriteInstruction(bufferId, payer.publicKey, offset, bytes),
    );
    transaction.sign(payer);
    const [fee, simulation] = await Promise.all([
      connection.getFeeForMessage(transaction.compileMessage(), "confirmed"),
      simulateSignedLegacyTransaction(connection, transaction),
    ]);
    feeLamports ??= fee.value;
    samples.push({
      byteLength: bytes.length,
      error: simulation.err,
      index,
      offset,
      unitsConsumed: simulation.unitsConsumed,
      wireBytes: transaction.serialize().length,
    });
    if (simulation.err) {
      throw new Error(`Loader write sample ${index} failed signed simulation.`);
    }
  }
  console.log(
    JSON.stringify({
      artifactBytes: artifact.length,
      artifactSha256: sha256(artifact),
      buffer: bufferId.toBase58(),
      chunkCount,
      chunkSize,
      cluster: "devnet",
      estimatedTotalFeeLamports: feeLamports * chunkCount,
      feeLamportsPerWrite: feeLamports,
      feePayer: payer.publicKey.toBase58(),
      samples,
      stage: "signed-buffer-write-simulations",
    }),
  );
}

async function readReviewedBuffer(connection, bufferId, commitment) {
  const account = await connection.getAccountInfo(bufferId, commitment);
  const buffer = decodeAuthority(
    account,
    1,
    BUFFER_METADATA_BYTES,
    "Tyche revenue-fee upgrade buffer",
  );
  if (
    buffer.bytes.length !== REVIEWED_ARTIFACT_BYTES ||
    sha256(buffer.bytes) !== REVIEWED_ARTIFACT_SHA256
  ) {
    throw new Error(
      "The on-chain buffer does not match the reviewed artifact.",
    );
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

function createSetBufferAuthorityInstruction(bufferId, currentAuthority) {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(4, 0);
  return new TransactionInstruction({
    data,
    keys: [
      { pubkey: bufferId, isSigner: false, isWritable: true },
      { pubkey: currentAuthority, isSigner: true, isWritable: false },
      { pubkey: SQUADS_VAULT, isSigner: false, isWritable: false },
    ],
    programId: LOADER_ID,
  });
}

async function simulateBufferAuthorityTransfer() {
  verifyArtifact();
  const { connection, payer } = await connectionAndPayer();
  const programData = await readProgramData(connection, "finalized");
  verifyProgramData(programData);
  const bufferId = new PublicKey(requiredEnvironment("TYCHE_BUFFER_ADDRESS"));
  const before = await readReviewedBuffer(connection, bufferId, "finalized");
  if (!before.authority.equals(payer.publicKey)) {
    throw new Error("The technical payer is not the current buffer authority.");
  }
  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: [
        createSetBufferAuthorityInstruction(bufferId, payer.publicKey),
      ],
      payerKey: payer.publicKey,
      recentBlockhash: latest.blockhash,
    }).compileToV0Message(),
  );
  transaction.sign([payer]);
  const [fee, simulation] = await Promise.all([
    connection.getFeeForMessage(transaction.message, "confirmed"),
    connection.simulateTransaction(transaction, {
      commitment: "confirmed",
      replaceRecentBlockhash: false,
      sigVerify: true,
    }),
  ]);
  console.log(
    JSON.stringify({
      artifactBytes: before.bytes.length,
      artifactSha256: sha256(before.bytes),
      buffer: bufferId.toBase58(),
      cluster: "devnet",
      currentAuthority: payer.publicKey.toBase58(),
      error: simulation.value.err,
      estimatedNetworkFeeLamports: fee.value,
      feePayer: payer.publicKey.toBase58(),
      newAuthority: SQUADS_VAULT.toBase58(),
      stage: "signed-buffer-authority-transfer-simulation",
      unitsConsumed: simulation.value.unitsConsumed,
    }),
  );
  if (simulation.value.err) {
    throw new Error("The signed buffer-authority transfer failed simulation.");
  }
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

  const instruction = createSetBufferAuthorityInstruction(
    bufferId,
    payer.publicKey,
  );
  console.log(
    JSON.stringify({
      buffer: bufferId.toBase58(),
      cluster: "devnet",
      currentAuthority: payer.publicKey.toBase58(),
      newAuthority: SQUADS_VAULT.toBase58(),
      stage: "reviewed-plan",
    }),
  );
  const signature = await simulateSendAndFinalize(connection, payer, [
    instruction,
  ]);
  const after = await readReviewedBuffer(connection, bufferId, "finalized");
  if (!after.authority.equals(SQUADS_VAULT)) {
    throw new Error(
      "The authority transfer finalized, but strict read-back failed.",
    );
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
    : command === "simulate-create-buffer"
      ? simulateBufferCreation
      : command === "create-buffer"
        ? createBuffer
        : command === "simulate-buffer-writes"
          ? simulateBufferWrites
          : command === "simulate-transfer-buffer-authority"
            ? simulateBufferAuthorityTransfer
            : command === "verify-buffer"
              ? verifyBuffer
              : command === "transfer-buffer-authority"
                ? transferBufferAuthority
                : null;

if (!action) {
  console.error(
    "Usage: prepare-tyche-orao-upgrade.cjs <plan-buffer|simulate-create-buffer|create-buffer|simulate-buffer-writes|verify-buffer|simulate-transfer-buffer-authority|transfer-buffer-authority>",
  );
  process.exitCode = 1;
} else {
  action().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
