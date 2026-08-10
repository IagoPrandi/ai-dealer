import { pathToFileURL } from "node:url";
import {
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionMessage,
  VersionedTransaction,
  type Commitment,
} from "@solana/web3.js";
import {
  createTurnAutomationConfig,
  stringifySimulationError,
} from "./turn-automation.js";

/**
 * Devnet operator: top up a turn's `prize_vault` so its recorded `Claim`
 * accounts are actually payable.
 *
 * A turn's prize vault only ever receives that turn's own fee share, but a
 * winner payout is recorded for the whole visible pool (current turn +
 * rollover). Rollover lamports stay physically in the *source* turn's vault, so
 * a turn won with rollover in its pool produces claims larger than its vault
 * and `claim_prize` fails with `InsufficientVaultBalance` (6068).
 *
 * `sweep_prize_rollover` is the structural fix for new turns. This operator is
 * the recovery path for turns already settled under the broken accounting: it
 * reads the turn's outstanding on-chain claims, compares them against the
 * vault's spendable balance, and transfers exactly the shortfall from the
 * authority wallet.
 *
 * Dry-run by default; set TYCHE_VAULT_TOPUP_BROADCAST=1 to broadcast.
 */

const BROADCAST = process.env.TYCHE_VAULT_TOPUP_BROADCAST === "1";
const COMMITMENT: Commitment = "confirmed";
const CLAIM_ACCOUNT_SIZE = 75;
const CLAIM_KIND_WINNER_PAYOUT = 0;
const CLAIM_STATE_AVAILABLE = 0;

function u64Le(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function derivePda(programId: PublicKey, seeds: Buffer[]) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function resolveTurnId() {
  const parsed = Number(process.argv[2]);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Usage: devnet-fund-prize-vault.ts <turnId>");
  }
  return parsed;
}

/**
 * Sum of every still-unpaid winner payout recorded against this turn, read from
 * the chain rather than the API: the API store is in-memory and a restart drops
 * its projections, but the `Claim` PDAs are authoritative and survive.
 */
export function sumOutstandingWinnerClaims(
  accounts: { data: Buffer }[],
  turnId: number,
) {
  let total = 0;
  let count = 0;
  for (const account of accounts) {
    const data = account.data;
    if (data.length !== CLAIM_ACCOUNT_SIZE) {
      continue;
    }
    if (Number(data.readBigUInt64LE(8)) !== turnId) {
      continue;
    }
    if (data[48] !== CLAIM_KIND_WINNER_PAYOUT) {
      continue;
    }
    if (data[57] !== CLAIM_STATE_AVAILABLE) {
      continue;
    }
    total += Number(data.readBigUInt64LE(49));
    count += 1;
  }
  return { count, totalLamports: total };
}

export function calculateVaultShortfall({
  outstandingLamports,
  rentExemptLamports,
  vaultLamports,
}: {
  outstandingLamports: number;
  rentExemptLamports: number;
  vaultLamports: number;
}) {
  const spendableLamports = Math.max(vaultLamports - rentExemptLamports, 0);
  return {
    shortfallLamports: Math.max(outstandingLamports - spendableLamports, 0),
    spendableLamports,
  };
}

export async function runFundPrizeVault() {
  const turnId = resolveTurnId();
  const config = await createTurnAutomationConfig();
  const programId = new PublicKey(config.programId.toString());
  const connection = new Connection(config.rpcUrl, COMMITMENT);
  if (!config.authorityKeypairBytes) {
    throw new Error(
      "The authority keypair is required to fund a prize vault; set TYCHE_TURN_AUTHORITY_KEYPAIR_PATH or TYCHE_TURN_AUTHORITY_KEYPAIR.",
    );
  }
  const authority = Keypair.fromSecretKey(config.authorityKeypairBytes);

  const prizeVault = derivePda(programId, [
    Buffer.from("prize_vault"),
    u64Le(turnId),
  ]);
  const vaultAccount = await connection.getAccountInfo(prizeVault, COMMITMENT);
  if (!vaultAccount) {
    throw new Error(`Prize vault for turn ${turnId} does not exist on-chain.`);
  }
  const rentExemptLamports =
    await connection.getMinimumBalanceForRentExemption(
      vaultAccount.data.length,
      COMMITMENT,
    );

  const claimAccounts = await connection.getProgramAccounts(programId, {
    commitment: COMMITMENT,
    filters: [{ dataSize: CLAIM_ACCOUNT_SIZE }],
  });
  const outstanding = sumOutstandingWinnerClaims(
    claimAccounts.map((entry) => ({ data: entry.account.data })),
    turnId,
  );
  const { shortfallLamports, spendableLamports } = calculateVaultShortfall({
    outstandingLamports: outstanding.totalLamports,
    rentExemptLamports,
    vaultLamports: vaultAccount.lamports,
  });
  const authorityBalance = await connection.getBalance(
    authority.publicKey,
    COMMITMENT,
  );

  console.log(
    JSON.stringify(
      {
        authority: authority.publicKey.toBase58(),
        authorityBalanceLamports: authorityBalance,
        broadcast: BROADCAST,
        outstandingClaimCount: outstanding.count,
        outstandingClaimLamports: outstanding.totalLamports,
        prizeVault: prizeVault.toBase58(),
        rentExemptLamports,
        // Host only: the RPC URL carries a provider API key in its query string.
        rpcHost: new URL(config.rpcUrl).host,
        shortfallLamports,
        turnId,
        vaultLamports: vaultAccount.lamports,
        vaultSpendableLamports: spendableLamports,
      },
      null,
      2,
    ),
  );

  if (shortfallLamports === 0) {
    console.log(
      `Turn ${turnId} prize vault already covers its outstanding claims. Nothing to do.`,
    );
    return;
  }
  if (authorityBalance <= shortfallLamports) {
    throw new Error(
      `Authority balance ${authorityBalance} cannot cover the ${shortfallLamports} lamport shortfall plus fees.`,
    );
  }
  if (!BROADCAST) {
    console.log(
      "Dry run only. Set TYCHE_VAULT_TOPUP_BROADCAST=1 to broadcast the top-up.",
    );
    return;
  }

  const { blockhash, lastValidBlockHeight } =
    await connection.getLatestBlockhash(COMMITMENT);
  const message = new TransactionMessage({
    instructions: [
      SystemProgram.transfer({
        fromPubkey: authority.publicKey,
        lamports: shortfallLamports,
        toPubkey: prizeVault,
      }),
    ],
    payerKey: authority.publicKey,
    recentBlockhash: blockhash,
  }).compileToV0Message();
  const transaction = new VersionedTransaction(message);
  transaction.sign([authority]);

  const simulation = await connection.simulateTransaction(transaction, {
    commitment: COMMITMENT,
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `prize vault top-up simulation failed: ${stringifySimulationError(
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
      `prize vault top-up ${signature} failed after send: ${stringifySimulationError(
        confirmation.value.err,
      )}`,
    );
  }

  const vaultAfter = await connection.getBalance(prizeVault, COMMITMENT);
  console.log(
    `prize vault top-up signature=${signature} vaultLamportsAfter=${vaultAfter} spendableAfter=${
      vaultAfter - rentExemptLamports
    }`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runFundPrizeVault().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
