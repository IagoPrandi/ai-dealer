import { pathToFileURL } from "node:url";
import { createSolanaRpc } from "@solana/kit";
import {
  createExpireClaimInstruction,
  createTurnAutomationConfig,
  deriveAuthorityAddress,
  fetchExpirableClaims,
  fetchGlobalConfig,
  fetchPrizeVault,
  simulateAndSend,
} from "./turn-automation.js";

/**
 * Devnet operator: release a turn's abandoned winner payouts back into its
 * prize vault so the lamports can roll forward.
 *
 * Turn automation only ever looks at the turn immediately before the one it
 * just opened, so a payout abandoned on an older turn keeps its reservation --
 * and, because a vault that owes a claim may not be swept, keeps that turn's
 * whole leftover pool pinned. This operator targets any turn by id.
 *
 * The programme re-checks both claim-window bounds, so a payout still inside
 * its window is rejected on chain rather than trusted from here.
 *
 * Dry-run by default; set TYCHE_EXPIRE_CLAIMS_BROADCAST=1 to broadcast.
 */

const BROADCAST = process.env.TYCHE_EXPIRE_CLAIMS_BROADCAST === "1";

function resolveTurnId() {
  const parsed = Number(process.argv[2]);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Usage: devnet-expire-claims.ts <turnId>");
  }
  return parsed;
}

export async function runExpireClaims() {
  const turnId = resolveTurnId();
  const config = await createTurnAutomationConfig();
  if (!config.authorityKeypairBytes) {
    throw new Error(
      "Expiring a claim requires the turn authority keypair; set TYCHE_TURN_AUTHORITY_KEYPAIR_PATH or TYCHE_TURN_AUTHORITY_KEYPAIR.",
    );
  }
  const rpc = createSolanaRpc(config.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.programId,
    rpc,
  });
  const vaultBefore = await fetchPrizeVault({
    programId: config.programId,
    rpc,
    turnId,
  });
  const expirable = await fetchExpirableClaims({
    currentTurnId: globalConfig.snapshot.nextTurnId,
    nowSeconds: Math.floor(Date.now() / 1000),
    programId: config.programId,
    rpc,
    turnId,
  });

  console.log(
    JSON.stringify(
      {
        broadcast: BROADCAST,
        currentNextTurnId: globalConfig.snapshot.nextTurnId,
        expirableClaims: expirable.map((claim) => ({
          amountLamports: Number(claim.amountLamports),
          claimant: claim.claimant.toString(),
        })),
        prizeVault: vaultBefore.address.toString(),
        turnId,
        vaultFreeLamports: Number(vaultBefore.freeLamports),
        vaultUnreservedLamports: Number(
          vaultBefore.snapshot.totalCollectedLamports,
        ),
      },
      null,
      2,
    ),
  );

  if (expirable.length === 0) {
    console.log(`Turn ${turnId} has no payout past its claim window.`);
    return;
  }
  if (!BROADCAST) {
    console.log(
      "Dry run only. Set TYCHE_EXPIRE_CLAIMS_BROADCAST=1 to release these payouts.",
    );
    return;
  }

  const authority = deriveAuthorityAddress(config.authorityKeypairBytes);
  for (const claim of expirable) {
    const instruction = await createExpireClaimInstruction({
      authority,
      claimant: claim.claimant,
      programId: config.programId,
      turnId,
    });
    const signature = await simulateAndSend({
      authorityKeypairBytes: config.authorityKeypairBytes,
      instruction,
      rpc,
    });
    console.log(
      `expired ${claim.claimant.toString()} (${claim.amountLamports} lamports) signature=${signature.toString()}`,
    );
  }

  const vaultAfter = await fetchPrizeVault({
    programId: config.programId,
    rpc,
    turnId,
  });
  console.log(
    `vault unreserved ${vaultBefore.snapshot.totalCollectedLamports} -> ${vaultAfter.snapshot.totalCollectedLamports}, free ${vaultAfter.freeLamports}`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runExpireClaims().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
