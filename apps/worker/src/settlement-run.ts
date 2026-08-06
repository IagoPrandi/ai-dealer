import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  createSettlementCycleDeps,
  createSettlementSchedulerConfig,
  resolveSettlementTurnId,
  runSettlementSchedulerOnce,
} from "./settlement-loop.js";
import {
  isEligibleSettlementCandidate,
  planSettlementAction,
} from "./settlement-scheduler.js";

/**
 * Gated manual operator driver for the M5.3 acceptance: drive the settlement
 * scheduler over the current settlement turn until it reaches CLOSED.
 *
 * Dry-run by default — it only reads on-chain + API + recorded state and prints
 * the next planned action, broadcasting nothing. Set `TYCHE_SETTLE_BROADCAST=1`
 * to actually drive the pipeline (request/settle/close + API projections).
 *
 * This is a manual operator tool (like `switchboard-settle-draw.ts`), separate
 * from the production loop (`startSettlementLoop`). It must run inside the
 * worker container so it can sign with the on-chain authority keypair, and it
 * needs the API reachable (set `TYCHE_API_BASE_URL`).
 */

const ROOT_ENV_PATH = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
  ".env",
);
if (existsSync(ROOT_ENV_PATH)) {
  process.loadEnvFile(ROOT_ENV_PATH);
}

const BROADCAST = process.env.TYCHE_SETTLE_BROADCAST === "1";
const TIMEOUT_MS = 15 * 60_000;
const POLL_INTERVAL_MS = 8_000;

export function isTerminalSettlementStep(step: {
  action: string;
  reason?: string;
  toState?: string;
}) {
  return (
    step.action === "done" &&
    (step.toState === "CLOSED" || step.reason === "already_closed")
  );
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function runManualSettlement() {
  const config = { ...(await createSettlementSchedulerConfig()), enabled: true };
  if (!config.automation.authorityKeypairBytes) {
    throw new Error(
      "Settlement run requires TYCHE_TURN_AUTHORITY_KEYPAIR or TYCHE_TURN_AUTHORITY_KEYPAIR_PATH.",
    );
  }

  const deps = createSettlementCycleDeps(config);
  const { paused, turnId } = await resolveSettlementTurnId(config);

  console.log(
    JSON.stringify(
      {
        apiBaseUrl: config.apiBaseUrl,
        broadcast: BROADCAST,
        electionConfig: config.electionConfig,
        paused,
        rpcUrl: config.automation.rpcUrl,
        targetTurnId: turnId,
      },
      null,
      2,
    ),
  );

  if (paused || turnId === null) {
    console.log("No settleable turn (paused or no current/closed turn).");
    return;
  }

  const onChain = await deps.senders.fetchState(turnId);
  if (!onChain) {
    console.log(`Turn ${turnId} has no on-chain TurnState account.`);
    return;
  }
  const candidates = await deps.fetchCandidates(turnId);
  const eligible = candidates.filter(isEligibleSettlementCandidate);
  const recordedStates = await deps.bridge.fetchRecordedStates(turnId);
  const plan = planSettlementAction({
    eligibleCandidateCount: eligible.length,
    nowSeconds: Math.floor(Date.now() / 1_000),
    onChain,
    recordedStates,
  });

  console.log(
    JSON.stringify(
      {
        eligibleCandidates: eligible.length,
        onChain: {
          activeRuleId: onChain.activeRuleId,
          drawStatus: onChain.drawStatus,
          eligibleRulePoolHash: onChain.eligibleRulePoolHash,
          endTimestampSeconds: onChain.endTimestampSeconds,
          finalistSetHash: onChain.finalistSetHash,
          status: onChain.status,
          survivorFinalistHash: onChain.survivorFinalistHash,
        },
        plannedAction: plan,
        recordedStates: [...recordedStates],
        totalCandidates: candidates.length,
      },
      null,
      2,
    ),
  );

  if (!BROADCAST) {
    console.log(
      "Dry run only. Set TYCHE_SETTLE_BROADCAST=1 to drive the settlement pipeline.",
    );
    return;
  }

  const deadline = Date.now() + TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = await runSettlementSchedulerOnce(config, deps);
    if (result.action !== "advanced") {
      console.log(`scheduler ${result.action}`);
      if (result.action === "no_settlement_turn" || result.action === "paused") {
        return;
      }
      await sleep(POLL_INTERVAL_MS);
      continue;
    }

    let onlyWaits = true;
    let closed = false;
    for (const step of result.steps) {
      console.log(
        `turn=${step.turnId} action=${step.action}${
          step.toState ? ` -> ${step.toState}` : ""
        }${step.signature ? ` signature=${step.signature}` : ""}${
          step.reason ? ` (${step.reason})` : ""
        }`,
      );
      if (step.action !== "wait") {
        onlyWaits = false;
      }
      if (isTerminalSettlementStep(step)) {
        closed = true;
      }
    }

    if (closed) {
      console.log(`turn ${result.turnId} reached CLOSED.`);
      return;
    }
    if (onlyWaits) {
      await sleep(POLL_INTERVAL_MS);
    }
  }

  throw new Error(
    `settlement did not reach CLOSED within ${TIMEOUT_MS / 1000}s.`,
  );
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  void runManualSettlement().catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Manual settlement failed.",
    );
    process.exitCode = 1;
  });
}
