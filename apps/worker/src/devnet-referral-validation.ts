import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  AccountRole,
  createSolanaRpc,
  type Instruction as KitInstruction,
} from "@solana/kit";
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
import {
  createManualControlConfig,
} from "./manual-control.js";
import {
  createSubmitGuessInstruction,
  deterministicGuess,
  deterministicPlayer,
} from "./devnet-seed-real-inputs.js";
import { persistFinalizedTransaction } from "./durable-indexer.js";
import {
  createOpenTurnInstruction,
  createSetTurnDurationCycleInstruction,
  createTurnAutomationConfig,
  deriveAuthorityAddress,
  fetchGlobalConfig,
  stringifySimulationError,
} from "./turn-automation.js";

/**
 * One-shot, devnet-only referral qualification ceremony.
 *
 * The transaction orders: technical funding -> invitee-signed referral
 * attribution -> authority opens the next short test turn -> duration reset ->
 * invitee's first GameToken/guess. It therefore proves the attribution exists
 * no later than the first GameToken without exposing or retaining any key.
 *
 * Dry-run is the default. Set TYCHE_REFERRAL_TEST_BROADCAST=1 only after the
 * exact preflight summary has been reviewed and approved.
 */

const COMMITMENT: Commitment = "finalized";
const DEFAULT_FUND_LAMPORTS = 120_000_000;
const REFERRAL_ATTRIBUTION_ACCOUNT_BYTES = 130;
const SYSTEM_PROGRAM_ID = new PublicKey("11111111111111111111111111111111");
const ATTRIBUTE_REFERRAL_DISCRIMINATOR = discriminator("attribute_referral");

export interface AtomicReferralValidationPlan {
  attribution: string;
  broadcast: boolean;
  cluster: "devnet";
  estimatedNetworkFeeLamports: null | number;
  fundingLamports: number;
  gameToken: string;
  invitee: string;
  inviter: string;
  playerGuess: string;
  referralAttributionRentLamports: number;
  referralCodeHash: string;
  signature: null | string;
  simulationUnitsConsumed: null | number;
  turnId: number;
}

function discriminator(name: string) {
  return createHash("sha256")
    .update(`global:${name}`)
    .digest()
    .subarray(0, 8);
}

function hash32(value: string) {
  return createHash("sha256").update(value).digest().subarray(0, 32);
}

function u64Le(value: number) {
  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error("Referral validation turn id must be a positive safe integer.");
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(BigInt(value));
  return bytes;
}

function derivePda(programId: PublicKey, seeds: Buffer[]) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function envFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function readFundingLamports(value: string | undefined) {
  if (!value) {
    return DEFAULT_FUND_LAMPORTS;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) {
    throw new Error(
      "TYCHE_REFERRAL_TEST_FUND_LAMPORTS must be a positive safe integer.",
    );
  }
  return parsed;
}

function toWeb3Instruction(instruction: KitInstruction) {
  if (!instruction.data || !instruction.accounts) {
    throw new Error("Kit instruction must include instruction data and accounts.");
  }
  return new TransactionInstruction({
    data: Buffer.from(instruction.data),
    keys: instruction.accounts.map((account) => ({
      isSigner:
        account.role === AccountRole.READONLY_SIGNER ||
        account.role === AccountRole.WRITABLE_SIGNER,
      isWritable:
        account.role === AccountRole.WRITABLE ||
        account.role === AccountRole.WRITABLE_SIGNER,
      pubkey: new PublicKey(account.address),
    })),
    programId: new PublicKey(instruction.programAddress),
  });
}

export function createAttributeReferralInstruction({
  invitee,
  inviter,
  referralCodeHash,
  tokenomicsProgramId,
}: {
  invitee: PublicKey;
  inviter: PublicKey;
  referralCodeHash: Buffer;
  tokenomicsProgramId: PublicKey;
}) {
  if (referralCodeHash.length !== 32) {
    throw new Error("Referral code hash must contain exactly 32 bytes.");
  }
  if (invitee.equals(inviter)) {
    throw new Error("Referral validation cannot use the same inviter and invitee.");
  }
  const tokenConfig = derivePda(tokenomicsProgramId, [Buffer.from("token_config")]);
  const attribution = derivePda(tokenomicsProgramId, [
    Buffer.from("referral_attribution"),
    invitee.toBuffer(),
  ]);
  return {
    attribution,
    instruction: new TransactionInstruction({
      data: Buffer.concat([ATTRIBUTE_REFERRAL_DISCRIMINATOR, referralCodeHash]),
      keys: [
        { isSigner: true, isWritable: true, pubkey: invitee },
        { isSigner: false, isWritable: false, pubkey: inviter },
        { isSigner: false, isWritable: false, pubkey: tokenConfig },
        { isSigner: false, isWritable: true, pubkey: attribution },
        { isSigner: false, isWritable: false, pubkey: SYSTEM_PROGRAM_ID },
      ],
      programId: tokenomicsProgramId,
    }),
  };
}

export async function runAtomicReferralValidation(
  env = process.env,
): Promise<AtomicReferralValidationPlan> {
  const automation = await createTurnAutomationConfig(env);
  const manual = await createManualControlConfig(env);
  if (!manual.enabled || !automation.authorityKeypairBytes) {
    throw new Error(
      "Referral validation requires enabled manual devnet control and the technical authority keypair.",
    );
  }

  const tokenomicsProgramId = new PublicKey(
    env.TOKENOMICS_CORE_PROGRAM_ID ?? "BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm",
  );
  const tycheProgramId = new PublicKey(automation.programId.toString());
  const connection = new Connection(automation.rpcUrl, COMMITMENT);
  const rpc = createSolanaRpc(automation.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: automation.programId,
    rpc,
  });
  if (globalConfig.snapshot.paused) {
    throw new Error("Referral validation cannot run while the game is paused.");
  }
  if (globalConfig.snapshot.hasActiveTurn) {
    throw new Error(
      `Referral validation requires no active turn; turn ${globalConfig.snapshot.activeTurnId} is still open.`,
    );
  }

  const turnId = globalConfig.snapshot.nextTurnId;
  const authority = Keypair.fromSecretKey(automation.authorityKeypairBytes);
  const authorityAddress = deriveAuthorityAddress(automation.authorityKeypairBytes);
  if (!authority.publicKey.equals(new PublicKey(authorityAddress))) {
    throw new Error("Technical authority keypair does not match the configured authority address.");
  }
  const invitee = deterministicPlayer(turnId, 0);
  const inviter = new PublicKey(
    env.TYCHE_REFERRAL_TEST_INVITER ??
      "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
  );
  const referralCodeHash = hash32(
    `tyche:devnet:referral-validation:v1:${turnId}:${inviter.toBase58()}:${invitee.publicKey.toBase58()}`,
  );
  const referral = createAttributeReferralInstruction({
    invitee: invitee.publicKey,
    inviter,
    referralCodeHash,
    tokenomicsProgramId,
  });
  const [attributionInfo, gameTokenInfo] = await Promise.all([
    connection.getAccountInfo(referral.attribution, COMMITMENT),
    connection.getAccountInfo(
      derivePda(tycheProgramId, [
        Buffer.from("game_token"),
        u64Le(turnId),
        invitee.publicKey.toBuffer(),
      ]),
      COMMITMENT,
    ),
  ]);
  if (attributionInfo || gameTokenInfo) {
    throw new Error(
      "The deterministic referral-test invitee already has referral or GameToken state for the next turn; choose a new clean test target.",
    );
  }

  const openTurn = await createOpenTurnInstruction({
    authority: authorityAddress,
    programId: automation.programId,
    turnId,
  });
  const turnState = openTurn.accounts[2]?.address;
  if (!turnState) {
    throw new Error("Open-turn instruction did not expose its turn-state account.");
  }
  const playableCycle = [
    manual.openDurationSeconds,
    manual.openDurationSeconds,
    manual.openDurationSeconds,
    manual.openDurationSeconds,
  ] as const;
  const setCycle = await createSetTurnDurationCycleInstruction({
    authority: authorityAddress,
    programId: automation.programId,
    turnDurationCycle: playableCycle,
    turnState,
  });
  const guess = createSubmitGuessInstruction({
    numbers: deterministicGuess(0),
    player: invitee.publicKey,
    programId: tycheProgramId,
    sequence: 1,
    turnId,
  });
  const fundingLamports = readFundingLamports(env.TYCHE_REFERRAL_TEST_FUND_LAMPORTS);
  const instructions = [
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      lamports: fundingLamports,
      toPubkey: invitee.publicKey,
    }),
    referral.instruction,
    toWeb3Instruction(openTurn),
    toWeb3Instruction(setCycle),
    guess.instruction,
  ];
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(COMMITMENT);
  const message = new TransactionMessage({
    instructions,
    payerKey: authority.publicKey,
    recentBlockhash: blockhash,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([authority, invitee]);
  const [simulation, networkFee, referralAttributionRentLamports] = await Promise.all([
    connection.simulateTransaction(transaction, { commitment: COMMITMENT, sigVerify: true }),
    connection.getFeeForMessage(message, COMMITMENT),
    connection.getMinimumBalanceForRentExemption(
      REFERRAL_ATTRIBUTION_ACCOUNT_BYTES,
      COMMITMENT,
    ),
  ]);
  if (simulation.value.err) {
    throw new Error(
      `Atomic referral-validation simulation failed: ${stringifySimulationError(
        simulation.value.err,
      )}; logs=${stringifySimulationError(simulation.value.logs ?? [])}`,
    );
  }

  let signature: null | string = null;
  if (envFlag(env.TYCHE_REFERRAL_TEST_BROADCAST)) {
    signature = await connection.sendTransaction(transaction, {
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
        `Atomic referral-validation ${signature} failed after send: ${stringifySimulationError(
          confirmation.value.err,
        )}`,
      );
    }
    await persistFinalizedTransaction({
      cluster: "devnet",
      connection,
      eventKind: "devnet.referral_validation.atomic_setup",
      payload: {
        invitee: invitee.publicKey.toBase58(),
        inviter: inviter.toBase58(),
        turnId,
      },
      signature,
    });
  }

  return {
    attribution: referral.attribution.toBase58(),
    broadcast: envFlag(env.TYCHE_REFERRAL_TEST_BROADCAST),
    cluster: "devnet",
    estimatedNetworkFeeLamports: networkFee.value,
    fundingLamports,
    gameToken: guess.accounts.gameToken.toBase58(),
    invitee: invitee.publicKey.toBase58(),
    inviter: inviter.toBase58(),
    playerGuess: guess.accounts.playerGuess.toBase58(),
    referralAttributionRentLamports,
    referralCodeHash: referralCodeHash.toString("hex"),
    signature,
    simulationUnitsConsumed: simulation.value.unitsConsumed ?? null,
    turnId,
  };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  runAtomicReferralValidation()
    .then((summary) => console.log(JSON.stringify(summary, null, 2)))
    .catch((error: unknown) => {
      console.error(error);
      process.exitCode = 1;
    });
}
