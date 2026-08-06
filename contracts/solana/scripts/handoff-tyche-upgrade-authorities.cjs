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
const BUFFER_ID = new PublicKey(
  "9G8tkVowKwf6s5TZNbqk4wBc1noKvj4PzoUocRsbGMU7",
);
const EXPECTED_CURRENT_AUTHORITY = new PublicKey(
  "4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH",
);
const SQUADS_VAULT = new PublicKey(
  "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp",
);
const PROGRAM_DATA_METADATA_BYTES = 45;
const BUFFER_METADATA_BYTES = 37;
const EXPECTED_CAPACITY = 1_023_336;
const EXPECTED_DEPLOYED_PREFIX_BYTES = 790_960;
const EXPECTED_DEPLOYED_PREFIX_SHA256 =
  "2b64705d56a3e410f7a701c496060d4754711a15e6441857745ca36bedf2d274";
const EXPECTED_BUFFER_SHA256 =
  "2ca0484a3fef56bfa9f5831022474f3cef839bc27db36758d83cb8f57bf012d1";

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
    account.data.readUInt32LE(0) !== expectedTag ||
    account.data[expectedTag === 1 ? 4 : 12] !== 1
  ) {
    throw new Error(`${label} loader metadata is missing or malformed.`);
  }
  const authorityOffset = expectedTag === 1 ? 5 : 13;
  return {
    authority: new PublicKey(
      account.data.subarray(authorityOffset, authorityOffset + 32),
    ),
    bytes: account.data.subarray(metadataBytes),
    lamports: account.lamports,
  };
}

function setAuthorityInstruction(target, currentAuthority, newAuthority) {
  const data = Buffer.alloc(4);
  data.writeUInt32LE(4, 0);
  return new TransactionInstruction({
    data,
    keys: [
      { pubkey: target, isSigner: false, isWritable: true },
      { pubkey: currentAuthority, isSigner: true, isWritable: false },
      { pubkey: newAuthority, isSigner: false, isWritable: false },
    ],
    programId: LOADER_ID,
  });
}

async function snapshot(connection, commitment) {
  const [program, programDataAccount, bufferAccount, vaultAccount] =
    await Promise.all([
      connection.getAccountInfo(PROGRAM_ID, commitment),
      connection.getAccountInfo(PROGRAM_DATA_ID, commitment),
      connection.getAccountInfo(BUFFER_ID, commitment),
      connection.getAccountInfo(SQUADS_VAULT, commitment),
    ]);
  if (
    !program ||
    !program.executable ||
    !program.owner.equals(LOADER_ID) ||
    program.data.length !== 36 ||
    program.data.readUInt32LE(0) !== 2 ||
    !new PublicKey(program.data.subarray(4, 36)).equals(PROGRAM_DATA_ID)
  ) {
    throw new Error("Tyche does not link to the expected ProgramData.");
  }
  if (!vaultAccount) {
    throw new Error("The reviewed Squads vault does not exist on devnet.");
  }

  const programData = decodeAuthority(
    programDataAccount,
    3,
    PROGRAM_DATA_METADATA_BYTES,
    "Tyche ProgramData",
  );
  const buffer = decodeAuthority(
    bufferAccount,
    1,
    BUFFER_METADATA_BYTES,
    "Tyche upgrade buffer",
  );
  return { buffer, programData };
}

function verifyReviewedBytes(snapshot) {
  if (
    snapshot.programData.bytes.length !== EXPECTED_CAPACITY ||
    snapshot.buffer.bytes.length !== EXPECTED_CAPACITY ||
    sha256(
      snapshot.programData.bytes.subarray(0, EXPECTED_DEPLOYED_PREFIX_BYTES),
    ) !== EXPECTED_DEPLOYED_PREFIX_SHA256 ||
    snapshot.programData.bytes
      .subarray(EXPECTED_DEPLOYED_PREFIX_BYTES)
      .some((byte) => byte !== 0) ||
    sha256(snapshot.buffer.bytes) !== EXPECTED_BUFFER_SHA256
  ) {
    throw new Error("The deployed programme or buffer bytes are not reviewed.");
  }
}

async function main() {
  const rpcUrl = requiredEnvironment("SOLANA_RPC_URL");
  const authority = readKeypair(requiredEnvironment("SOLANA_KEYPAIR_PATH"));
  if (!authority.publicKey.equals(EXPECTED_CURRENT_AUTHORITY)) {
    throw new Error("The supplied keypair is not the reviewed devnet authority.");
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
    throw new Error("The configured ProgramData is not derived from Tyche.");
  }

  const before = await snapshot(connection, "finalized");
  verifyReviewedBytes(before);
  if (
    before.programData.authority.equals(SQUADS_VAULT) &&
    before.buffer.authority.equals(SQUADS_VAULT)
  ) {
    console.log(
      JSON.stringify({
        alreadyTransferred: true,
        buffer: BUFFER_ID.toBase58(),
        program: PROGRAM_ID.toBase58(),
        squadsVault: SQUADS_VAULT.toBase58(),
      }),
    );
    return;
  }
  if (
    !before.programData.authority.equals(EXPECTED_CURRENT_AUTHORITY) ||
    !before.buffer.authority.equals(EXPECTED_CURRENT_AUTHORITY)
  ) {
    throw new Error("One of the current authorities is not the reviewed deployer.");
  }

  const latest = await connection.getLatestBlockhash("confirmed");
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions: [
        setAuthorityInstruction(
          BUFFER_ID,
          authority.publicKey,
          SQUADS_VAULT,
        ),
        setAuthorityInstruction(
          PROGRAM_DATA_ID,
          authority.publicKey,
          SQUADS_VAULT,
        ),
      ],
      payerKey: authority.publicKey,
      recentBlockhash: latest.blockhash,
    }).compileToV0Message(),
  );
  transaction.sign([authority]);

  const simulation = await connection.simulateTransaction(transaction, {
    commitment: "confirmed",
    replaceRecentBlockhash: false,
    sigVerify: true,
  });
  console.log(
    JSON.stringify({
      error: simulation.value.err,
      instructionCount: 2,
      stage: "signed-simulation",
      unitsConsumed: simulation.value.unitsConsumed,
    }),
  );
  if (simulation.value.err) {
    throw new Error(
      "The signed authority handoff failed simulation; nothing was sent.",
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
      `The authority handoff failed on-chain: ${JSON.stringify(confirmation.value.err)}.`,
    );
  }

  const after = await snapshot(connection, "finalized");
  verifyReviewedBytes(after);
  if (
    !after.programData.authority.equals(SQUADS_VAULT) ||
    !after.buffer.authority.equals(SQUADS_VAULT)
  ) {
    throw new Error(
      "The handoff finalized, but strict authority read-back failed.",
    );
  }
  console.log(
    JSON.stringify({
      buffer: BUFFER_ID.toBase58(),
      bufferAuthority: after.buffer.authority.toBase58(),
      program: PROGRAM_ID.toBase58(),
      programUpgradeAuthority: after.programData.authority.toBase58(),
      signature,
      stage: "finalized",
    }),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
