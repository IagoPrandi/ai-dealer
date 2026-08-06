import { pathToFileURL } from "node:url";
import { createSolanaRpc } from "@solana/kit";
import { runDrawCycle, type PublishedDraw } from "./draw.js";
import { createProductionDrawCycleDeps } from "./settlement.js";
import {
  createTurnAutomationConfig,
  fetchGlobalConfig,
  fetchTurnState,
} from "./turn-automation.js";

/**
 * Manual, gated driver for the M5.2 acceptance criterion: drive a real
 * `request_draw` -> Switchboard reveal -> `settle_draw` against devnet for one
 * closed/ended turn and confirm the on-chain turn reaches `DrawStatus::Fulfilled`
 * with verified numbers.
 *
 * This is a manual operator tool (like `switchboard-proof.ts`), NOT the
 * production scheduler (that wiring is M5.3). It refuses to broadcast unless
 * `TYCHE_SETTLE_BROADCAST=1` so a default run is a safe, read-only inspection
 * of the live turn state.
 */

const SETTLE_TIMEOUT_MS = 6 * 60_000;
const POLL_INTERVAL_MS = 6_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function resolveTurnId(activeTurnId: number) {
  const raw = process.argv[2];
  if (!raw) {
    return activeTurnId;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error("Turn id argument must be a positive integer.");
  }
  return parsed;
}

export async function runManualDrawSettlement() {
  const config = await createTurnAutomationConfig();
  if (!config.authorityKeypairBytes) {
    throw new Error(
      "Manual draw settlement requires TYCHE_TURN_AUTHORITY_KEYPAIR or TYCHE_TURN_AUTHORITY_KEYPAIR_PATH.",
    );
  }

  const rpc = createSolanaRpc(config.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.programId,
    rpc,
  });
  const turnId = resolveTurnId(globalConfig.snapshot.activeTurnId);

  const turnState = await fetchTurnState({
    programId: config.programId,
    rpc,
    turnId,
  });
  const nowSeconds = Math.floor(Date.now() / 1000);

  console.log(
    JSON.stringify(
      {
        broadcast: process.env.TYCHE_SETTLE_BROADCAST === "1",
        globalConfig: {
          activeTurnId: globalConfig.snapshot.activeTurnId,
          drawVrfConfig: globalConfig.snapshot.drawVrfConfig.toString(),
          hasActiveTurn: globalConfig.snapshot.hasActiveTurn,
          paused: globalConfig.snapshot.paused,
        },
        nowSeconds,
        rpcUrl: config.rpcUrl,
        turn: {
          endTimestamp: turnState.snapshot.endTimestamp,
          ended: nowSeconds >= turnState.snapshot.endTimestamp,
          status: turnState.snapshot.status,
          turnId: turnState.snapshot.turnId,
        },
      },
      null,
      2,
    ),
  );

  if (process.env.TYCHE_SETTLE_BROADCAST !== "1") {
    console.log(
      "Dry run only. Set TYCHE_SETTLE_BROADCAST=1 to drive request_draw -> reveal -> settle_draw.",
    );
    return;
  }

  const deps = createProductionDrawCycleDeps(config, {
    publishDraw: async (draw: PublishedDraw) => {
      console.log(`publishDraw ${JSON.stringify(draw)}`);
    },
  });

  const deadline = Date.now() + SETTLE_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await runDrawCycle(turnId, deps);
    console.log(
      `cycle action=${result.action}${
        result.drawResult ? ` draw=${result.drawResult.join(",")}` : ""
      }`,
    );

    const turn = await deps.fetchTurn(turnId);
    if (turn?.drawStatus === "fulfilled") {
      console.log(`turn ${turnId} reached DrawStatus::Fulfilled`);
      return;
    }
    if (turn?.drawStatus === "failed") {
      throw new Error(`turn ${turnId} draw failed; inspect fail_draw logs.`);
    }

    await sleep(POLL_INTERVAL_MS);
  }

  throw new Error(
    `turn ${turnId} did not reach DrawStatus::Fulfilled within ${
      SETTLE_TIMEOUT_MS / 1000
    }s.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runManualDrawSettlement().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Manual draw settlement failed.",
    );
    process.exitCode = 1;
  });
}
