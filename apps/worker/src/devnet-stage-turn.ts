import { pathToFileURL } from "node:url";
import { createSolanaRpc } from "@solana/kit";
import {
  createTurnAutomationConfig,
  fetchTurnState,
  runTurnAutomationOnce,
} from "./turn-automation.js";

/**
 * Gated devnet operator helper: drive the existing turn automation through one
 * full turn lifecycle so the draw pipeline can be exercised on a turn that uses
 * the current `TurnState` layout.
 *
 * Needed because an older devnet turn was opened under a previous account layout
 * and the trustless program (M5.1) can no longer deserialize it. The automation
 * force-skips that legacy turn, opens a fresh one, shrinks its duration so it
 * ends immediately, and closes it. Set `TYCHE_DEVNET_TURN_DURATION_SCALE_BPS`
 * low (e.g. `1`) so the staged turn ends right away. This is a manual tool, not
 * the production scheduler (M5.3).
 */

const MAX_STEPS = 10;
const STEP_DELAY_MS = 2_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function stageFreshClosedTurn() {
  const config = await createTurnAutomationConfig();
  if (!config.enabled) {
    throw new Error("Set TYCHE_TURN_AUTOMATION_ENABLED=true to stage a turn.");
  }
  if (!config.authorityKeypairBytes) {
    throw new Error(
      "Staging a turn requires TYCHE_TURN_AUTHORITY_KEYPAIR or TYCHE_TURN_AUTHORITY_KEYPAIR_PATH.",
    );
  }
  if (!config.desiredTurnDurationCycle) {
    throw new Error(
      "Set TYCHE_DEVNET_TURN_DURATION_SCALE_BPS low (e.g. 1) so the staged turn ends immediately.",
    );
  }

  // Phase A: clear any legacy active turn and open a fresh current-layout turn.
  // Run with no desired cycle so the automation never attempts
  // `set_turn_duration_cycle` on a legacy turn it cannot deserialize; it falls
  // straight through to the close/force-skip path instead.
  const openConfig = { ...config, desiredTurnDurationCycle: null };
  let freshTurnId: number | null = null;
  for (let step = 0; step < MAX_STEPS && freshTurnId === null; step += 1) {
    const result = await runTurnAutomationOnce(openConfig);
    console.log(`open step ${step}: ${JSON.stringify(result)}`);
    if (result.action === "opened_turn") {
      freshTurnId = result.turnId;
    } else if (
      result.action === "active_turn_not_expired" &&
      result.turnId !== undefined
    ) {
      // A fresh turn (future end) is already active.
      freshTurnId = result.turnId;
    } else {
      await sleep(STEP_DELAY_MS);
    }
  }

  if (freshTurnId === null) {
    throw new Error(
      `Did not open a fresh turn within ${MAX_STEPS} automation steps.`,
    );
  }

  // Phase B: shrink the fresh turn's duration so it ends immediately, then close
  // it. The fresh turn uses the current layout, so `set_turn_duration_cycle`
  // deserializes and the close succeeds normally.
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const result = await runTurnAutomationOnce(config);
    console.log(`close step ${step}: ${JSON.stringify(result)}`);

    if (result.action === "closed_turn") {
      const rpc = createSolanaRpc(config.rpcUrl);
      const turn = await fetchTurnState({
        programId: config.programId,
        rpc,
        turnId: result.turnId,
      });
      console.log(
        `staged closed turn ${result.turnId} status=${turn.snapshot.status} dataLength=${turn.dataLength}`,
      );
      return result.turnId;
    }

    await sleep(STEP_DELAY_MS);
  }

  throw new Error(
    `Did not close fresh turn ${freshTurnId} within ${MAX_STEPS} automation steps.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void stageFreshClosedTurn().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Turn staging failed.",
    );
    process.exitCode = 1;
  });
}
