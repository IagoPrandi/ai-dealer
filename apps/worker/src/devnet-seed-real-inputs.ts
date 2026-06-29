import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
  type TransactionInstruction,
} from "@solana/web3.js";
import { createSolanaRpc } from "@solana/kit";
import {
  createManualControlConfig,
  openTurnManually,
} from "./manual-control.js";
import {
  createTurnAutomationConfig,
  fetchGlobalConfig,
  fetchTurnState,
  stringifySimulationError,
} from "./turn-automation.js";

/**
 * M5.4 devnet operator: seed one open turn with real player inputs.
 *
 * Dry-run by default. Set IDEALER_M5_INPUTS_BROADCAST=1 to send real devnet
 * transactions. This signs only with deterministic devnet test players and the
 * configured devnet authority; it does not read or persist any player secrets.
 */

const BROADCAST = process.env.IDEALER_M5_INPUTS_BROADCAST === "1";
const OPEN_TURN_IF_MISSING = process.env.IDEALER_M5_INPUTS_OPEN_TURN === "1";
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3002";
const DEFAULT_PLAYER_COUNT = 3;
const MAX_PLAYER_COUNT = 17;
const DEFAULT_FUND_LAMPORTS = 120_000_000;
const COMMITMENT: Commitment = "confirmed";
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const GLOBAL_CONFIG_SEED = Buffer.from("global_config");
const TURN_SEED = Buffer.from("turn");
const GUESS_SEED = Buffer.from("guess");
const GAME_TOKEN_SEED = Buffer.from("game_token");
const TREASURY_VAULT_SEED = Buffer.from("treasury_vault");
const PRIZE_VAULT_SEED = Buffer.from("prize_vault");
const RULE_SEED = Buffer.from("rule");
const VOTE_SEED = Buffer.from("vote");

const SUBMIT_GUESS_DISCRIMINATOR = Buffer.from([
  61, 124, 32, 227, 64, 198, 252, 3,
]);
const PROPOSE_RULE_DISCRIMINATOR = Buffer.from([
  14, 35, 67, 184, 137, 188, 125, 233,
]);
const VOTE_RULE_DISCRIMINATOR = Buffer.from([
  40, 87, 133, 249, 114, 164, 242, 183,
]);
const PRECOMPILE_RULE_DISCRIMINATOR = Buffer.from([
  168, 4, 65, 64, 176, 165, 132, 179,
]);

interface RulePreflightResult {
  addedOperationalClauses: string[];
  clarityNote: string;
  compiledArtifactHash?: string | null;
  decision?: "VALID" | "INVALID";
  dealerMessage: string;
  difficultyClass?: string;
  finalConfidence?: number;
  maxTokens: number;
  needsClarification: boolean;
  normalizedText: string;
  normalizedTextHash: number[];
  officialInterpretation: string;
  officialInterpretationHash: number[];
  preflightResultHash: number[];
  reasonSummary?: string;
  reproposalBlocked?: boolean;
  ruleId: number;
  ruleMode?: "predicate" | "ranking";
  sanitizedText: string;
  sanitizedTextHash: number[];
  tokenCount: number;
}

interface SeedConfig {
  apiBaseUrl: string;
  fundLamportsPerPlayer: number;
  playerCount: number;
  ruleText: string;
}

interface SeededInputSummary {
  apiBaseUrl: string;
  broadcast: boolean;
  players: {
    address: string;
    gameToken: string;
    guess: number[];
    guessSignature: string;
    playerGuess: string;
    voteSignature: string | null;
  }[];
  precompileSignature: string | null;
  proposal: {
    compiledArtifactHash: string;
    proposer: string;
    ruleId: number;
    ruleProposal: string;
    signature: string;
    text: string;
  } | null;
  turnId: number;
}

export function readSeedConfig(env = process.env): SeedConfig {
  const playerCount = Number(env.IDEALER_M5_INPUTS_PLAYER_COUNT ?? DEFAULT_PLAYER_COUNT);
  if (!Number.isInteger(playerCount) || playerCount < 1 || playerCount > MAX_PLAYER_COUNT) {
    throw new Error(
      `IDEALER_M5_INPUTS_PLAYER_COUNT must be an integer from 1 to ${MAX_PLAYER_COUNT}.`,
    );
  }

  const fundLamportsPerPlayer = Number(
    env.IDEALER_M5_INPUTS_FUND_LAMPORTS ?? DEFAULT_FUND_LAMPORTS,
  );
  if (!Number.isSafeInteger(fundLamportsPerPlayer) || fundLamportsPerPlayer < 0) {
    throw new Error("IDEALER_M5_INPUTS_FUND_LAMPORTS must be a non-negative safe integer.");
  }

  return {
    apiBaseUrl: env.IDEALER_API_BASE_URL ?? DEFAULT_API_BASE_URL,
    fundLamportsPerPlayer,
    playerCount,
    ruleText:
      env.IDEALER_M5_RULE_TEXT ??
      "Win if at least 1 of your numbers appears in the draw.",
  };
}

function u64Le(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function u16Le(value: number) {
  const buffer = Buffer.alloc(2);
  buffer.writeUInt16LE(value);
  return buffer;
}

function u32Le(value: number) {
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return buffer;
}

function hash32(value: string) {
  return createHash("sha256").update(value).digest().subarray(0, 32);
}

function hexToBytes32(name: string, value: string | null | undefined) {
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) {
    throw new Error(`${name} must be a 32-byte hex string.`);
  }
  return Buffer.from(value, "hex");
}

function assertHashArray(name: string, value: readonly number[]) {
  if (
    value.length !== 32 ||
    !value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    throw new Error(`${name} must be a 32-byte array.`);
  }
}

function derivePda(programId: PublicKey, seeds: Buffer[]) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function globalConfigPda(programId: PublicKey) {
  return derivePda(programId, [GLOBAL_CONFIG_SEED]);
}

function turnStatePda(programId: PublicKey, turnId: number) {
  return derivePda(programId, [TURN_SEED, u64Le(turnId)]);
}

function playerGuessPda(
  programId: PublicKey,
  turnId: number,
  player: PublicKey,
  sequence: number,
) {
  return derivePda(programId, [
    GUESS_SEED,
    u64Le(turnId),
    player.toBuffer(),
    u64Le(sequence),
  ]);
}

function gameTokenPda(programId: PublicKey, turnId: number, player: PublicKey) {
  return derivePda(programId, [GAME_TOKEN_SEED, u64Le(turnId), player.toBuffer()]);
}

function treasuryVaultPda(programId: PublicKey) {
  return derivePda(programId, [TREASURY_VAULT_SEED]);
}

function prizeVaultPda(programId: PublicKey, turnId: number) {
  return derivePda(programId, [PRIZE_VAULT_SEED, u64Le(turnId)]);
}

function ruleProposalPda(programId: PublicKey, turnId: number, ruleId: number) {
  return derivePda(programId, [RULE_SEED, u64Le(turnId), u64Le(ruleId)]);
}

function ruleVotePda(
  programId: PublicKey,
  turnId: number,
  ruleId: number,
  voter: PublicKey,
  sequence: number,
) {
  return derivePda(programId, [
    VOTE_SEED,
    u64Le(turnId),
    u64Le(ruleId),
    voter.toBuffer(),
    u64Le(sequence),
  ]);
}

function deterministicPlayer(turnId: number, index: number) {
  const seed = hash32(`idealer:m5.4:devnet-player:v1:${turnId}:${index}`);
  return Keypair.fromSeed(seed);
}

export function deterministicGuess(index: number) {
  if (index === 16) {
    return [95, 96, 97, 98, 99, 100];
  }
  const base = 1 + index * 6;
  return [base, base + 1, base + 2, base + 3, base + 4, base + 5];
}

function createSubmitGuessInstruction({
  numbers,
  player,
  programId,
  sequence,
  turnId,
}: {
  numbers: readonly number[];
  player: PublicKey;
  programId: PublicKey;
  sequence: number;
  turnId: number;
}) {
  const playerGuess = playerGuessPda(programId, turnId, player, sequence);
  return {
    instruction: {
      data: Buffer.concat([SUBMIT_GUESS_DISCRIMINATOR, Buffer.from(numbers), u64Le(sequence)]),
      keys: [
        { isSigner: true, isWritable: true, pubkey: player },
        { isSigner: false, isWritable: false, pubkey: globalConfigPda(programId) },
        { isSigner: false, isWritable: true, pubkey: turnStatePda(programId, turnId) },
        { isSigner: false, isWritable: true, pubkey: playerGuess },
        { isSigner: false, isWritable: true, pubkey: gameTokenPda(programId, turnId, player) },
        { isSigner: false, isWritable: true, pubkey: treasuryVaultPda(programId) },
        { isSigner: false, isWritable: true, pubkey: prizeVaultPda(programId, turnId) },
        { isSigner: false, isWritable: false, pubkey: SYSTEM_PROGRAM_ID },
      ],
      programId,
    },
    accounts: {
      gameToken: gameTokenPda(programId, turnId, player),
      playerGuess,
    },
  };
}

function createProposeRuleInstruction({
  player,
  preflight,
  programId,
  turnId,
}: {
  player: PublicKey;
  preflight: RulePreflightResult;
  programId: PublicKey;
  turnId: number;
}) {
  for (const [name, value] of [
    ["sanitizedTextHash", preflight.sanitizedTextHash],
    ["normalizedTextHash", preflight.normalizedTextHash],
    ["officialInterpretationHash", preflight.officialInterpretationHash],
    ["preflightResultHash", preflight.preflightResultHash],
  ] as const) {
    assertHashArray(name, value);
  }

  const textBytes = Buffer.from(preflight.sanitizedText, "utf8");
  const ruleProposal = ruleProposalPda(programId, turnId, preflight.ruleId);
  const data = Buffer.concat([
    PROPOSE_RULE_DISCRIMINATOR,
    u64Le(preflight.ruleId),
    u32Le(textBytes.length),
    textBytes,
    Buffer.from(preflight.sanitizedTextHash),
    Buffer.from(preflight.normalizedTextHash),
    Buffer.from(preflight.officialInterpretationHash),
    Buffer.from(preflight.preflightResultHash),
    u16Le(preflight.tokenCount),
  ]);

  return {
    instruction: {
      data,
      keys: [
        { isSigner: true, isWritable: true, pubkey: player },
        { isSigner: false, isWritable: false, pubkey: globalConfigPda(programId) },
        { isSigner: false, isWritable: true, pubkey: turnStatePda(programId, turnId) },
        { isSigner: false, isWritable: true, pubkey: gameTokenPda(programId, turnId, player) },
        { isSigner: false, isWritable: true, pubkey: ruleProposal },
        { isSigner: false, isWritable: true, pubkey: treasuryVaultPda(programId) },
        { isSigner: false, isWritable: true, pubkey: prizeVaultPda(programId, turnId) },
        { isSigner: false, isWritable: false, pubkey: SYSTEM_PROGRAM_ID },
      ],
      programId,
    },
    ruleProposal,
  };
}

function createPrecompileRuleInstruction({
  authority,
  compiledArtifactHash,
  programId,
  ruleId,
  turnId,
}: {
  authority: PublicKey;
  compiledArtifactHash: Buffer;
  programId: PublicKey;
  ruleId: number;
  turnId: number;
}) {
  return {
    data: Buffer.concat([
      PRECOMPILE_RULE_DISCRIMINATOR,
      compiledArtifactHash,
      Buffer.from([1]),
    ]),
    keys: [
      { isSigner: true, isWritable: false, pubkey: authority },
      { isSigner: false, isWritable: false, pubkey: globalConfigPda(programId) },
      { isSigner: false, isWritable: false, pubkey: turnStatePda(programId, turnId) },
      { isSigner: false, isWritable: true, pubkey: ruleProposalPda(programId, turnId, ruleId) },
    ],
    programId,
  };
}

function createVoteRuleInstruction({
  player,
  programId,
  ruleId,
  sequence,
  turnId,
}: {
  player: PublicKey;
  programId: PublicKey;
  ruleId: number;
  sequence: number;
  turnId: number;
}) {
  const ruleProposal = ruleProposalPda(programId, turnId, ruleId);
  const ruleVote = ruleVotePda(programId, turnId, ruleId, player, sequence);
  return {
    instruction: {
      data: Buffer.concat([VOTE_RULE_DISCRIMINATOR, u64Le(sequence)]),
      keys: [
        { isSigner: true, isWritable: true, pubkey: player },
        { isSigner: false, isWritable: false, pubkey: globalConfigPda(programId) },
        { isSigner: false, isWritable: true, pubkey: turnStatePda(programId, turnId) },
        { isSigner: false, isWritable: true, pubkey: gameTokenPda(programId, turnId, player) },
        { isSigner: false, isWritable: true, pubkey: ruleProposal },
        { isSigner: false, isWritable: true, pubkey: ruleVote },
        { isSigner: false, isWritable: true, pubkey: prizeVaultPda(programId, turnId) },
        { isSigner: false, isWritable: false, pubkey: SYSTEM_PROGRAM_ID },
      ],
      programId,
    },
    ruleProposal,
    ruleVote,
  };
}

async function sendTransaction({
  connection,
  feePayer,
  instructions,
  label,
  signers,
}: {
  connection: Connection;
  feePayer: PublicKey;
  instructions: TransactionInstruction[];
  label: string;
  signers: Keypair[];
}) {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(COMMITMENT);
  const message = new TransactionMessage({
    instructions,
    payerKey: feePayer,
    recentBlockhash: blockhash,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign(signers);

  const simulation = await connection.simulateTransaction(transaction, {
    commitment: COMMITMENT,
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `${label} simulation failed: ${stringifySimulationError(
        simulation.value.err,
      )}; logs=${stringifySimulationError(simulation.value.logs ?? [])}`,
    );
  }

  if (!BROADCAST) {
    return `dry-run:${label}`;
  }

  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 3,
    preflightCommitment: COMMITMENT,
    skipPreflight: false,
  });
  const confirmation = await connection.confirmTransaction(
    { blockhash, lastValidBlockHeight, signature },
    COMMITMENT,
  );
  if (confirmation.value.err) {
    throw new Error(
      `${label} ${signature} failed after send: ${stringifySimulationError(
        confirmation.value.err,
      )}`,
    );
  }
  return signature;
}

async function postJson<T>({
  body,
  path,
  seedConfig,
}: {
  body: unknown;
  path: string;
  seedConfig: SeedConfig;
}): Promise<T> {
  if (!BROADCAST) {
    return body as T;
  }
  const response = await fetch(new URL(path, seedConfig.apiBaseUrl), {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(
      `POST ${path} failed with ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  return payload as T;
}

/**
 * Compile + STORE the rule validation in the API (`/rule-validations/run`) so the
 * verifier can later resolve the active rule's artifact (`getActiveRuleArtifact`
 * needs a stored VALID validation with the AST). Returns the authoritative
 * compiled-artifact hash; we use the SAME hash for the on-chain `precompile_rule`
 * so the on-chain `compiled_artifact_hash`, the frozen election hash, and the
 * stored artifact all reconcile. Broadcast-only (the API stores nothing on a dry
 * run); the dry run falls back to the preflight hash for simulation.
 */
async function runStoredRuleValidation({
  ruleId,
  seedConfig,
  turnId,
}: {
  ruleId: number;
  seedConfig: SeedConfig;
  turnId: number;
}): Promise<string | null> {
  if (!BROADCAST) {
    return null;
  }
  const response = await fetch(
    new URL("/rule-validations/run", seedConfig.apiBaseUrl),
    {
      body: JSON.stringify({ ruleId, turnId }),
      headers: { "content-type": "application/json" },
      method: "POST",
    },
  );
  const payload = (await response.json().catch(() => null)) as {
    validation?: { compiledArtifactHash?: string | null; decision?: string };
  } | null;
  const validation = payload?.validation;
  if (!response.ok || !validation) {
    throw new Error(
      `/rule-validations/run failed with ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  if (validation.decision !== "VALID" || !validation.compiledArtifactHash) {
    throw new Error(
      `Stored rule validation is not a usable artifact: ${JSON.stringify(validation)}`,
    );
  }
  return validation.compiledArtifactHash;
}

async function fetchRulePreflight(seedConfig: SeedConfig) {
  const response = await fetch(new URL("/rule-preflight", seedConfig.apiBaseUrl), {
    body: JSON.stringify({ text: seedConfig.ruleText }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const payload = (await response.json()) as { preflight?: RulePreflightResult };
  if (!response.ok || !payload.preflight) {
    throw new Error(
      `/rule-preflight failed with ${response.status}: ${JSON.stringify(payload)}`,
    );
  }
  if (payload.preflight.decision !== "VALID" || payload.preflight.needsClarification) {
    throw new Error(
      `Rule preflight did not return a directly proposable rule: ${JSON.stringify(
        payload.preflight,
      )}`,
    );
  }
  return payload.preflight;
}

async function ensureOpenTurn() {
  const automation = await createTurnAutomationConfig();
  const rpc = createSolanaRpc(automation.rpcUrl);
  let globalConfig = await fetchGlobalConfig({
    programId: automation.programId,
    rpc,
  });

  if (!globalConfig.snapshot.hasActiveTurn && OPEN_TURN_IF_MISSING) {
    if (!BROADCAST) {
      throw new Error(
        "IDEALER_M5_INPUTS_OPEN_TURN=1 would open a real devnet turn. Set IDEALER_M5_INPUTS_BROADCAST=1 to use it.",
      );
    }
    const manualConfig = await createManualControlConfig();
    const opened = await openTurnManually(manualConfig);
    if (opened.action !== "opened_turn" && opened.action !== "active_turn_exists") {
      throw new Error(`Could not open a turn for seeding: ${JSON.stringify(opened)}`);
    }
    globalConfig = await fetchGlobalConfig({
      programId: automation.programId,
      rpc,
    });
  }

  if (!globalConfig.snapshot.hasActiveTurn || globalConfig.snapshot.activeTurnId <= 0) {
    throw new Error(
      "No active devnet turn. Open one first or set IDEALER_M5_INPUTS_OPEN_TURN=1 with manual control enabled.",
    );
  }

  const turnId = globalConfig.snapshot.activeTurnId;
  const turn = await fetchTurnState({
    programId: automation.programId,
    rpc,
    turnId,
  });
  const nowSeconds = Math.floor(Date.now() / 1_000);
  if (turn.snapshot.status !== "open") {
    throw new Error(`Active turn ${turnId} is not open.`);
  }
  if (nowSeconds >= turn.snapshot.endTimestamp) {
    throw new Error(`Active turn ${turnId} has already ended.`);
  }

  return {
    authority: automation.authorityKeypairBytes
      ? Keypair.fromSecretKey(automation.authorityKeypairBytes)
      : null,
    programId: new PublicKey(automation.programId.toString()),
    rpcUrl: automation.rpcUrl,
    turn,
    turnId,
  };
}

async function accountExists(connection: Connection, account: PublicKey) {
  return (await connection.getAccountInfo(account, COMMITMENT)) !== null;
}

export async function seedRealInputs(): Promise<SeededInputSummary> {
  const seedConfig = readSeedConfig();
  const preflight = await fetchRulePreflight(seedConfig);
  const { authority, programId, rpcUrl, turnId } = await ensureOpenTurn();
  if (!authority) {
    throw new Error(
      "M5.4 input seeding requires IDEALER_TURN_AUTHORITY_KEYPAIR or IDEALER_TURN_AUTHORITY_KEYPAIR_PATH.",
    );
  }

  const connection = new Connection(rpcUrl, COMMITMENT);
  const players = Array.from({ length: seedConfig.playerCount }, (_, index) =>
    deterministicPlayer(turnId, index),
  );
  const proposer = players[0];
  if (!proposer) {
    throw new Error("At least one M5.4 player is required.");
  }
  const proposalBuilder = createProposeRuleInstruction({
    player: proposer.publicKey,
    preflight,
    programId,
    turnId,
  });

  const summary: SeededInputSummary = {
    apiBaseUrl: seedConfig.apiBaseUrl,
    broadcast: BROADCAST,
    players: [],
    precompileSignature: null,
    proposal: null,
    turnId,
  };

  for (const [index, player] of players.entries()) {
    const guess = deterministicGuess(index);
    const guessBuilder = createSubmitGuessInstruction({
      numbers: guess,
      player: player.publicKey,
      programId,
      sequence: 1,
      turnId,
    });
    const guessAlreadyExists = await accountExists(
      connection,
      guessBuilder.accounts.playerGuess,
    );
    const fundInstruction =
      seedConfig.fundLamportsPerPlayer > 0
        ? SystemProgram.transfer({
            fromPubkey: authority.publicKey,
            lamports: seedConfig.fundLamportsPerPlayer,
            toPubkey: player.publicKey,
          })
        : null;
    const guessSignature = guessAlreadyExists
      ? "already-exists"
      : await sendTransaction({
          connection,
          feePayer: authority.publicKey,
          instructions: [
            ...(fundInstruction ? [fundInstruction] : []),
            guessBuilder.instruction,
          ],
          label: `submit_guess:${index}`,
          signers: [authority, player],
        });

    await postJson({
      body: {
        gameToken: guessBuilder.accounts.gameToken.toBase58(),
        numbers: guess,
        player: player.publicKey.toBase58(),
        playerGuess: guessBuilder.accounts.playerGuess.toBase58(),
        programId: programId.toBase58(),
        sequence: 1,
        signature: guessSignature,
        submittedAt: new Date().toISOString(),
        turnId,
      },
      path: "/guess-receipts",
      seedConfig,
    });

    summary.players.push({
      address: player.publicKey.toBase58(),
      gameToken: guessBuilder.accounts.gameToken.toBase58(),
      guess,
      guessSignature,
      playerGuess: guessBuilder.accounts.playerGuess.toBase58(),
      voteSignature: null,
    });
  }

  const proposalAlreadyExists = await accountExists(
    connection,
    proposalBuilder.ruleProposal,
  );
  const proposalSignature = proposalAlreadyExists
    ? "already-exists"
    : await sendTransaction({
        connection,
        feePayer: proposer.publicKey,
        instructions: [proposalBuilder.instruction],
        label: "propose_rule",
        signers: [proposer],
      });

  await postJson({
    body: {
      ...preflight,
      compiledArtifactHash: preflight.compiledArtifactHash ?? null,
      precompilationStatus: "pending",
      proposer: proposer.publicKey.toBase58(),
      ruleProposal: proposalBuilder.ruleProposal.toBase58(),
      signature: proposalSignature,
      state: "proposed",
      submittedAt: new Date().toISOString(),
      turnId,
    },
    path: "/rule-proposals",
    seedConfig,
  });

  // Compile + store the validation (the artifact the verifier resolves), and use
  // its hash for the on-chain precompile so on-chain/API/artifact reconcile.
  const resolvedArtifactHashHex =
    (await runStoredRuleValidation({
      ruleId: preflight.ruleId,
      seedConfig,
      turnId,
    })) ?? preflight.compiledArtifactHash;
  const compiledArtifactHash = hexToBytes32(
    "compiledArtifactHash",
    resolvedArtifactHashHex,
  );

  summary.proposal = {
    compiledArtifactHash: compiledArtifactHash.toString("hex"),
    proposer: proposer.publicKey.toBase58(),
    ruleId: preflight.ruleId,
    ruleProposal: proposalBuilder.ruleProposal.toBase58(),
    signature: proposalSignature,
    text: preflight.sanitizedText,
  };

  summary.precompileSignature = proposalAlreadyExists
    ? "already-exists"
    : await sendTransaction({
        connection,
        feePayer: authority.publicKey,
        instructions: [
          createPrecompileRuleInstruction({
            authority: authority.publicKey,
            compiledArtifactHash,
            programId,
            ruleId: preflight.ruleId,
            turnId,
          }),
        ],
        label: "precompile_rule",
        signers: [authority],
      });

  await postJson({
    body: {
      compiledArtifactHash: compiledArtifactHash.toString("hex"),
      ruleId: preflight.ruleId,
      status: "passed",
      turnId,
      updatedAt: new Date().toISOString(),
    },
    path: "/rule-precompilations",
    seedConfig,
  });

  for (const [index, player] of players.entries()) {
    const voteBuilder = createVoteRuleInstruction({
      player: player.publicKey,
      programId,
      ruleId: preflight.ruleId,
      sequence: 1,
      turnId,
    });
    const voteAlreadyExists = await accountExists(connection, voteBuilder.ruleVote);
    const voteSignature = voteAlreadyExists
      ? "already-exists"
      : await sendTransaction({
          connection,
          feePayer: player.publicKey,
          instructions: [voteBuilder.instruction],
          label: `vote_rule:${index}`,
          signers: [player],
        });

    await postJson({
      body: {
        ruleId: preflight.ruleId,
        ruleProposal: voteBuilder.ruleProposal.toBase58(),
        ruleVote: voteBuilder.ruleVote.toBase58(),
        sequence: 1,
        signature: voteSignature,
        submittedAt: new Date().toISOString(),
        turnId,
        voter: player.publicKey.toBase58(),
      },
      path: "/rule-votes",
      seedConfig,
    });

    const playerSummary = summary.players[index];
    if (!playerSummary) {
      throw new Error(`Missing player summary for player index ${index}.`);
    }
    summary.players[index] = { ...playerSummary, voteSignature };
  }

  return summary;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void seedRealInputs()
    .then((summary) => {
      console.log(JSON.stringify(summary, null, 2));
      if (!BROADCAST) {
        console.log(
          "Dry run only. Set IDEALER_M5_INPUTS_BROADCAST=1 to submit real devnet inputs.",
        );
      }
    })
    .catch((error: unknown) => {
      console.error(error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    });
}
