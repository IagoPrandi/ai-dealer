import { createSolanaRpc } from "@solana/kit";
import { ApiBridge } from "./api-bridge.js";
import { recordClaimsForTurn } from "./claims.js";
import type { RuleElectionConfig } from "./election.js";
import {
  createSettlementSenders,
  fetchOnChainElectionCandidates,
} from "./settlement.js";
import {
  runSettlementCycle,
  type SettlementCycleDeps,
  type SettlementCycleResult,
} from "./settlement-scheduler.js";
import {
  createTurnAutomationConfig,
  fetchGlobalConfig,
  type TurnAutomationConfig,
} from "./turn-automation.js";

/**
 * Production settlement scheduler loop (M5.3). Env-gated and OFF by default, so
 * wiring it changes nothing until `TYCHE_SETTLEMENT_AUTOMATION_ENABLED` is
 * set. When enabled it advances the post-play-window pipeline for the current
 * settlement turn each tick by calling `runSettlementCycle` until the next step
 * has to wait (VRF reveal latency, open elimination window, before draw time)
 * or the turn is fully CLOSED. Turn open/duration stays with `turn-automation`,
 * which defers the close to this loop.
 */

const DEFAULT_API_BASE_URL = "http://localhost:3002";
const DEFAULT_INTERVAL_MS = 30_000;
const DEFAULT_MAX_STEPS_PER_TICK = 10;
const DEFAULT_TOP_VOTED_FINALISTS = 3;
const DEFAULT_RANDOM_FINALISTS = 7;

export interface SettlementSchedulerConfig {
  apiBaseUrl: string;
  automation: TurnAutomationConfig;
  electionConfig: RuleElectionConfig;
  enabled: boolean;
  intervalMs: number;
  maxStepsPerTick: number;
}

export type SettlementSchedulerResult =
  | {
      action: "advanced";
      steps: SettlementCycleResult[];
      turnId: number;
    }
  | { action: "disabled" | "no_settlement_turn" | "paused" };

function envFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function envNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export async function createSettlementSchedulerConfig(
  env = process.env,
): Promise<SettlementSchedulerConfig> {
  return {
    apiBaseUrl: env.TYCHE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
    automation: await createTurnAutomationConfig(env),
    electionConfig: {
      randomFinalistCount: envNumber(
        env.TYCHE_ELECTION_RANDOM_FINALISTS,
        DEFAULT_RANDOM_FINALISTS,
      ),
      topVotedFinalistCount: envNumber(
        env.TYCHE_ELECTION_TOP_VOTED_FINALISTS,
        DEFAULT_TOP_VOTED_FINALISTS,
      ),
    },
    enabled: envFlag(env.TYCHE_SETTLEMENT_AUTOMATION_ENABLED),
    intervalMs: envNumber(
      env.TYCHE_SETTLEMENT_AUTOMATION_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
    ),
    maxStepsPerTick: envNumber(
      env.TYCHE_SETTLEMENT_MAX_STEPS_PER_TICK,
      DEFAULT_MAX_STEPS_PER_TICK,
    ),
  };
}

/**
 * Build the per-cycle dependencies once. The Switchboard/RPC context inside the
 * senders is created lazily and cached, so reusing this object across ticks
 * avoids re-loading the Switchboard program every cycle.
 */
export function createSettlementCycleDeps(
  config: SettlementSchedulerConfig,
): SettlementCycleDeps {
  const senders = createSettlementSenders(config.automation);
  const bridge = new ApiBridge({ apiBaseUrl: config.apiBaseUrl });
  return {
    bridge,
    electionConfig: config.electionConfig,
    fetchCandidates: (turnId) =>
      fetchOnChainElectionCandidates(config.automation, turnId),
    nowIso: () => new Date().toISOString(),
    nowSeconds: () => Math.floor(Date.now() / 1_000),
    recordClaims: async (turnId) => {
      const results = await recordClaimsForTurn({
        apiBaseUrl: config.apiBaseUrl,
        config: config.automation,
        turnId,
      });
      return results.length;
    },
    senders,
  };
}

/**
 * Resolve the turn the scheduler should settle right now: the active turn while
 * one is open (it may have ended but is kept open for settlement), otherwise the
 * most-recently-closed turn (`nextTurnId - 1`) so post-close projections finish.
 */
export async function resolveSettlementTurnId(
  config: SettlementSchedulerConfig,
): Promise<{ paused: boolean; turnId: number | null }> {
  const rpc = createSolanaRpc(config.automation.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.automation.programId,
    rpc,
  });
  if (globalConfig.snapshot.paused) {
    return { paused: true, turnId: null };
  }
  const turnId = globalConfig.snapshot.hasActiveTurn
    ? globalConfig.snapshot.activeTurnId
    : globalConfig.snapshot.nextTurnId - 1;
  return { paused: false, turnId: turnId > 0 ? turnId : null };
}

async function executeSettlementSchedulerOnce(
  config: SettlementSchedulerConfig,
  deps: SettlementCycleDeps = createSettlementCycleDeps(config),
): Promise<SettlementSchedulerResult> {
  if (!config.enabled) {
    return { action: "disabled" };
  }
  if (!config.automation.authorityKeypairBytes) {
    throw new Error(
      "Settlement automation is enabled but TYCHE_TURN_AUTHORITY_KEYPAIR or TYCHE_TURN_AUTHORITY_KEYPAIR_PATH is not set.",
    );
  }

  const { paused, turnId } = await resolveSettlementTurnId(config);
  if (paused) {
    return { action: "paused" };
  }
  if (turnId === null) {
    return { action: "no_settlement_turn" };
  }

  const steps: SettlementCycleResult[] = [];
  for (let step = 0; step < config.maxStepsPerTick; step += 1) {
    const result = await runSettlementCycle(turnId, deps);
    steps.push(result);
    if (
      result.action === "wait" ||
      result.action === "done" ||
      result.action === "none"
    ) {
      break;
    }
  }

  return { action: "advanced", steps, turnId };
}

let activeSettlementPass: Promise<SettlementSchedulerResult> | null = null;

/**
 * Serialize every settlement pass in this worker process. Manual settlement,
 * manual cycle, and the periodic loop share the same on-chain state machine;
 * allowing them to run concurrently could commit duplicate randomness
 * accounts or race adjacent instructions.
 */
export async function runSettlementSchedulerOnce(
  config: SettlementSchedulerConfig,
  deps: SettlementCycleDeps = createSettlementCycleDeps(config),
): Promise<SettlementSchedulerResult> {
  while (activeSettlementPass) {
    await activeSettlementPass;
  }

  const pass = executeSettlementSchedulerOnce(config, deps);
  activeSettlementPass = pass;
  try {
    return await pass;
  } finally {
    if (activeSettlementPass === pass) {
      activeSettlementPass = null;
    }
  }
}

export function startSettlementLoop(config: SettlementSchedulerConfig) {
  if (!config.enabled) {
    return null;
  }

  const deps = createSettlementCycleDeps(config);
  let running = false;
  const run = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const result = await runSettlementSchedulerOnce(config, deps);
      if (result.action === "advanced") {
        for (const step of result.steps) {
          if (step.action !== "wait" && step.action !== "none") {
            console.log(
              `settlement turn=${step.turnId} action=${step.action}${
                step.toState ? ` -> ${step.toState}` : ""
              }${step.signature ? ` signature=${step.signature}` : ""}`,
            );
          }
        }
      }
    } catch (error) {
      console.error("settlement scheduler failed", error);
    } finally {
      running = false;
    }
  };

  void run();
  return setInterval(() => {
    void run();
  }, config.intervalMs);
}
