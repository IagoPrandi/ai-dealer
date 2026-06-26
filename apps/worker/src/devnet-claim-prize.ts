import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import { createTurnAutomationConfig, stringifySimulationError } from "./turn-automation.js";

/**
 * M4.7 devnet operator: execute a real, claimant-signed `claim_prize` (winner
 * payout pull-payment) on devnet for a turn seeded by `devnet-seed-real-inputs`.
 *
 * Dry-run by default; set IDEALER_SETTLE_BROADCAST=1 to broadcast. The claimant
 * is reconstructed deterministically from the same seed the input-seeder used
 * (idealer:m5.4:devnet-player:v1:<turnId>:<index>), so no real wallet secret is
 * read or stored. It then mirrors the frontend flow by POSTing the signature to
 * /claim-records/complete, and re-sends once to prove the double-claim guard.
 */

const BROADCAST = process.env.IDEALER_SETTLE_BROADCAST === "1";
const COMMITMENT: Commitment = "confirmed";
const DEFAULT_API_BASE_URL = "http://127.0.0.1:3002";
const MAX_PLAYER_INDEX = 17;
const CLAIM_PRIZE_DISCRIMINATOR = Buffer.from([
  157, 233, 139, 121, 246, 62, 234, 235,
]);
const CLAIM_KIND_WINNER_PAYOUT = 0;

function u64Le(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function derivePda(programId: PublicKey, seeds: Buffer[]) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function deterministicPlayer(turnId: number, index: number) {
  const seed = createHash("sha256")
    .update(`idealer:m5.4:devnet-player:v1:${turnId}:${index}`)
    .digest()
    .subarray(0, 32);
  return Keypair.fromSeed(seed);
}

function resolveTurnId() {
  const raw = process.argv[2];
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Usage: devnet-claim-prize.ts <turnId>");
  }
  return parsed;
}

interface ClaimRecord {
  amountLamports: number;
  claimId?: string;
  kind: string;
  status: string;
  wallet: string;
}

async function fetchAvailableWinnerClaims(apiBaseUrl: string, turnId: number) {
  const response = await fetch(
    new URL(`/claim-records?turnId=${turnId}`, apiBaseUrl),
  );
  const payload = (await response.json()) as {
    claims?: { records?: ClaimRecord[] };
  };
  if (!response.ok) {
    throw new Error(`/claim-records returned HTTP ${response.status}`);
  }
  return (payload.claims?.records ?? []).filter(
    (record) => record.kind === "winner_payout" && record.status === "available",
  );
}

function createClaimPrizeInstruction({
  claimant,
  programId,
  turnId,
}: {
  claimant: PublicKey;
  programId: PublicKey;
  turnId: number;
}) {
  const globalConfig = derivePda(programId, [Buffer.from("global_config")]);
  const claim = derivePda(programId, [
    Buffer.from("claim"),
    u64Le(turnId),
    claimant.toBuffer(),
    Buffer.from([CLAIM_KIND_WINNER_PAYOUT]),
  ]);
  const prizeVault = derivePda(programId, [
    Buffer.from("prize_vault"),
    u64Le(turnId),
  ]);
  return {
    claim,
    instruction: {
      data: Buffer.concat([CLAIM_PRIZE_DISCRIMINATOR, u64Le(turnId)]),
      keys: [
        { isSigner: true, isWritable: true, pubkey: claimant },
        { isSigner: false, isWritable: false, pubkey: globalConfig },
        { isSigner: false, isWritable: true, pubkey: claim },
        { isSigner: false, isWritable: true, pubkey: prizeVault },
      ],
      programId,
    },
  };
}

async function sendClaim({
  claimant,
  connection,
  instruction,
}: {
  claimant: Keypair;
  connection: Connection;
  instruction: ReturnType<typeof createClaimPrizeInstruction>["instruction"];
}) {
  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(COMMITMENT);
  const message = new TransactionMessage({
    instructions: [instruction],
    payerKey: claimant.publicKey,
    recentBlockhash: blockhash,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([claimant]);

  const simulation = await connection.simulateTransaction(transaction, {
    commitment: COMMITMENT,
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `claim_prize simulation failed: ${stringifySimulationError(
        simulation.value.err,
      )}; logs=${stringifySimulationError(simulation.value.logs ?? [])}`,
    );
  }
  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 3,
    preflightCommitment: COMMITMENT,
  });
  const confirmation = await connection.confirmTransaction(
    { blockhash, lastValidBlockHeight, signature },
    COMMITMENT,
  );
  if (confirmation.value.err) {
    throw new Error(
      `claim_prize ${signature} failed after send: ${stringifySimulationError(
        confirmation.value.err,
      )}`,
    );
  }
  return signature;
}

export async function runClaimPrize() {
  const turnId = resolveTurnId();
  const apiBaseUrl = process.env.IDEALER_API_BASE_URL ?? DEFAULT_API_BASE_URL;
  const config = await createTurnAutomationConfig();
  const programId = new PublicKey(config.programId.toString());
  const connection = new Connection(config.rpcUrl, COMMITMENT);

  const winners = await fetchAvailableWinnerClaims(apiBaseUrl, turnId);
  if (winners.length === 0) {
    console.log(`No available winner_payout claims for turn ${turnId}.`);
    return;
  }

  // Map each seeded player's pubkey -> keypair so we can sign as the winner.
  const playerByPubkey = new Map<string, Keypair>();
  for (let index = 0; index < MAX_PLAYER_INDEX; index += 1) {
    const player = deterministicPlayer(turnId, index);
    playerByPubkey.set(player.publicKey.toBase58(), player);
  }

  const target = winners.find((winner) => playerByPubkey.has(winner.wallet));
  if (!target) {
    throw new Error(
      "No available winner claim maps to a known seeded player keypair.",
    );
  }
  const claimant = playerByPubkey.get(target.wallet);
  if (!claimant) {
    throw new Error("Claimant keypair unexpectedly missing.");
  }

  const built = createClaimPrizeInstruction({
    claimant: claimant.publicKey,
    programId,
    turnId,
  });
  const balanceBefore = await connection.getBalance(
    claimant.publicKey,
    COMMITMENT,
  );

  console.log(
    JSON.stringify(
      {
        amountLamports: target.amountLamports,
        apiBaseUrl,
        balanceBeforeLamports: balanceBefore,
        broadcast: BROADCAST,
        claimPda: built.claim.toBase58(),
        claimant: claimant.publicKey.toBase58(),
        rpcUrl: config.rpcUrl,
        turnId,
      },
      null,
      2,
    ),
  );

  if (!BROADCAST) {
    console.log(
      "Dry run only. Set IDEALER_SETTLE_BROADCAST=1 to broadcast claim_prize.",
    );
    return;
  }

  const signature = await sendClaim({
    claimant,
    connection,
    instruction: built.instruction,
  });
  const balanceAfter = await connection.getBalance(
    claimant.publicKey,
    COMMITMENT,
  );
  console.log(
    `claim_prize signature=${signature} balanceAfter=${balanceAfter} delta=${
      balanceAfter - balanceBefore
    }`,
  );

  // Mirror the frontend: request approval, then record the real signature.
  // Best-effort — the on-chain claim above is the authoritative result.
  if (target.claimId) {
    try {
      const wallet = claimant.publicKey.toBase58();
      const request = await fetch(new URL("/claim-records/request", apiBaseUrl), {
        body: JSON.stringify({ claimId: target.claimId, wallet }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      const complete = await fetch(new URL("/claim-records/complete", apiBaseUrl), {
        body: JSON.stringify({
          claimId: target.claimId,
          signature,
          status: "claimed",
          wallet,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      });
      console.log(
        `/claim-records request HTTP ${request.status}, complete HTTP ${complete.status}`,
      );
    } catch (error) {
      console.log(
        `claim-records mirror skipped: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Double-claim must now be rejected on-chain (status is Claimed).
  let doubleClaimRejected = false;
  try {
    await sendClaim({ claimant, connection, instruction: built.instruction });
  } catch (error) {
    doubleClaimRejected = true;
    const message = error instanceof Error ? error.message : String(error);
    console.log(`double-claim correctly rejected: ${message.slice(0, 140)}`);
  }
  if (!doubleClaimRejected) {
    throw new Error("Double-claim was unexpectedly accepted on-chain.");
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runClaimPrize().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
