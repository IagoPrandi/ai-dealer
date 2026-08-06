import { existsSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getTurnDurationHours } from "@tyche/game-engine";
import { createSolanaRpc } from "@solana/kit";
import pg from "pg";
import { createClient } from "redis";
import {
  closeTurnManually,
  createManualControlConfig,
  cycleTurnManually,
  forceCloseTurnManually,
  migrateGlobalConfigManually,
  openTurnManually,
  type ManualControlConfig,
  type ManualControlResult,
  type ManualCycleResult,
} from "./manual-control.js";
import {
  fetchGlobalConfig,
  fetchTurnState,
  getTurnOpeningGate,
  isTurnSettlementClosed,
  createTurnAutomationConfig,
  startTurnAutomationLoop,
  type TurnAutomationConfig,
} from "./turn-automation.js";
import {
  createSettlementCycleDeps,
  createSettlementSchedulerConfig,
  resolveSettlementTurnId,
  type SettlementSchedulerConfig,
  runSettlementSchedulerOnce,
  startSettlementLoop,
} from "./settlement-loop.js";
import {
  createPrecompileLoopConfig,
  startPrecompileLoop,
} from "./precompile-loop.js";
import {
  createTokenRewardSettlementConfig,
  startTokenRewardSettlementLoop,
} from "./token-reward-settlement.js";
import {
  createActiveRuleRewardSettlementConfig,
  startActiveRuleRewardSettlementLoop,
} from "./active-rule-reward-settlement.js";
import {
  createReferralRewardSettlementConfig,
  startReferralRewardSettlementLoop,
} from "./referral-reward-settlement.js";
import {
  createDurableIndexerConfig,
  startDurableSolanaReconciliationLoop,
} from "./durable-indexer.js";

export * from "./active-rule-reward-settlement.js";
export * from "./referral-reward-settlement.js";
export * from "./api-bridge.js";
export * from "./claims.js";
export * from "./draw.js";
export * from "./durable-indexer.js";
export * from "./guess-verification.js";
export * from "./manual-control.js";
export * from "./precompile-loop.js";
export * from "./rule-validation.js";
export * from "./settlement.js";
export * from "./settlement-loop.js";
export * from "./settlement-scheduler.js";
export * from "./switchboard.js";
export * from "./token-reward-settlement.js";
export * from "./turn-automation.js";

// Load the repo-root .env for native (non-Docker) dev so DATABASE_URL/REDIS_URL,
// the turn-authority keypair path, and the LLM/TYCHE_* settings are available
// without Docker Compose injecting them. Existing process env wins over the file.
const ROOT_ENV_PATH = resolve(
  fileURLToPath(new URL("../../..", import.meta.url)),
  ".env",
);
if (existsSync(ROOT_ENV_PATH)) {
  process.loadEnvFile(ROOT_ENV_PATH);
}

const { Pool } = pg;

export interface WorkerStatus {
  service: string;
  status: "ok" | "error";
  firstTurnDurationHours: number;
  firstTurnDurationSeconds: number;
  postgres: "ok" | "error";
  redis: "ok" | "error";
  turnAutomation: "disabled" | "enabled" | "error";
  manualControl: "disabled" | "enabled" | "error";
  settlementAutomation: "disabled" | "enabled" | "error";
}

async function checkPostgres(databaseUrl: string): Promise<"ok" | "error"> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    await pool.query("select 1");
    return "ok";
  } catch {
    return "error";
  } finally {
    await pool.end();
  }
}

async function checkRedis(redisUrl: string): Promise<"ok" | "error"> {
  const client = createClient({ url: redisUrl });
  try {
    await client.connect();
    await client.ping();
    return "ok";
  } catch {
    return "error";
  } finally {
    await client.disconnect().catch(() => undefined);
  }
}

export async function getWorkerStatus(): Promise<WorkerStatus> {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;
  const turnAutomation = await createTurnAutomationConfig().catch(() => null);
  const manualControl = await createManualControlConfig().catch(() => null);
  const settlementAutomation = await createSettlementSchedulerConfig().catch(
    () => null,
  );

  if (!databaseUrl || !redisUrl) {
    const firstTurnDurationSeconds =
      getFirstTurnDurationSeconds(turnAutomation);
    return {
      service: "worker",
      status: "error",
      firstTurnDurationHours: firstTurnDurationSeconds / 3_600,
      firstTurnDurationSeconds,
      manualControl: getManualControlStatus(manualControl),
      postgres: databaseUrl ? "ok" : "error",
      redis: redisUrl ? "ok" : "error",
      settlementAutomation: getSettlementAutomationStatus(settlementAutomation),
      turnAutomation: getTurnAutomationStatus(turnAutomation),
    };
  }

  const [postgres, redis] = await Promise.all([
    checkPostgres(databaseUrl),
    checkRedis(redisUrl),
  ]);

  const firstTurnDurationSeconds = getFirstTurnDurationSeconds(turnAutomation);
  return {
    service: "worker",
    status: postgres === "ok" && redis === "ok" ? "ok" : "error",
    firstTurnDurationHours: firstTurnDurationSeconds / 3_600,
    firstTurnDurationSeconds,
    manualControl: getManualControlStatus(manualControl),
    postgres,
    redis,
    settlementAutomation: getSettlementAutomationStatus(settlementAutomation),
    turnAutomation: getTurnAutomationStatus(turnAutomation),
  };
}

function getManualControlStatus(
  config: null | ManualControlConfig,
): WorkerStatus["manualControl"] {
  if (!config) {
    return "error";
  }

  if (!config.enabled) {
    return "disabled";
  }

  return config.authorityKeypairBytes ? "enabled" : "error";
}

function getFirstTurnDurationSeconds(config: null | TurnAutomationConfig) {
  return config?.desiredTurnDurationCycle?.[0] ?? getTurnDurationHours(0) * 3_600;
}

function getTurnAutomationStatus(
  config: null | TurnAutomationConfig,
): WorkerStatus["turnAutomation"] {
  if (!config) {
    return "error";
  }

  if (!config.enabled) {
    return "disabled";
  }

  return config.authorityKeypairBytes ? "enabled" : "error";
}

function getSettlementAutomationStatus(
  config: null | SettlementSchedulerConfig,
): WorkerStatus["settlementAutomation"] {
  if (!config) {
    return "error";
  }

  if (!config.enabled) {
    return "disabled";
  }

  return config.automation.authorityKeypairBytes ? "enabled" : "error";
}

const LOCAL_WEB_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3})(:\d+)?$/;

function getAllowedCorsOrigin(origin: string | undefined) {
  if (!origin) {
    return null;
  }

  const configuredOrigins = (process.env.TYCHE_WORKER_CORS_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (
    configuredOrigins.includes(origin) ||
    LOCAL_WEB_ORIGIN_PATTERN.test(origin)
  ) {
    return origin;
  }

  return null;
}

function getCorsHeaders(request: IncomingMessage) {
  const allowedOrigin = getAllowedCorsOrigin(request.headers.origin);
  if (!allowedOrigin) {
    return {};
  }

  return {
    "access-control-allow-headers": "content-type",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-origin": allowedOrigin,
    "access-control-max-age": "600",
    vary: "Origin",
  };
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    ...getCorsHeaders(request),
  });
  response.end(JSON.stringify(body));
}

function sendNoContent(request: IncomingMessage, response: ServerResponse) {
  response.writeHead(204, getCorsHeaders(request));
  response.end();
}

async function getActiveTurnStatus() {
  const config = await createTurnAutomationConfig();
  const rpc = createSolanaRpc(config.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.programId,
    rpc,
  });

  let turnState: null | Awaited<ReturnType<typeof fetchTurnState>> = null;
  if (
    globalConfig.snapshot.hasActiveTurn &&
    globalConfig.snapshot.activeTurnId > 0
  ) {
    turnState = await fetchTurnState({
      programId: config.programId,
      rpc,
      turnId: globalConfig.snapshot.activeTurnId,
    });
  }

  const openingGate = await getTurnOpeningGate(
    globalConfig.snapshot,
    config.apiBaseUrl,
  );

  return {
    globalConfig: {
      activeTurnId: globalConfig.snapshot.activeTurnId,
      guessCutoffBps: globalConfig.snapshot.guessCutoffBps,
      guessSubmissionFeeLamports:
        globalConfig.snapshot.guessSubmissionFeeLamports.toString(),
      hasActiveTurn: globalConfig.snapshot.hasActiveTurn,
      nextTurnId: globalConfig.snapshot.nextTurnId,
      paused: globalConfig.snapshot.paused,
      ruleElectionCutoffBps: globalConfig.snapshot.ruleElectionCutoffBps,
      ruleRemovalFeeLamports:
        globalConfig.snapshot.ruleRemovalFeeLamports?.toString() ?? null,
      voteFeeLamports: globalConfig.snapshot.voteFeeLamports.toString(),
    },
    globalConfigAddress: globalConfig.address.toString(),
    openingGate,
    turnState: turnState
      ? {
          endTimestamp: turnState.snapshot.endTimestamp,
          startTimestamp: turnState.snapshot.startTimestamp,
          status: turnState.snapshot.status,
          turnDurationSeconds: turnState.snapshot.turnDurationSeconds,
          turnId: turnState.snapshot.turnId,
        }
      : null,
    turnStateAddress: turnState?.address.toString() ?? null,
  };
}

const MANUAL_CYCLE_TIMEOUT_MS = 300_000;

async function cycleTurnAndSettleManually(config: ManualControlConfig) {
  const settlementConfig = await createSettlementSchedulerConfig();
  const enabledSettlementConfig = { ...settlementConfig, enabled: true };
  const settlementDeps = createSettlementCycleDeps(enabledSettlementConfig);
  return cycleTurnManually(config, {
    nowMs: () => Date.now(),
    openNextTurn: () => openTurnManually(config),
    readState: async (turnId) => {
      const rpc = createSolanaRpc(config.rpcUrl);
      const globalConfig = await fetchGlobalConfig({
        programId: config.programId,
        rpc,
      });
      const settlementClosed = globalConfig.snapshot.hasActiveTurn
        ? false
        : await isTurnSettlementClosed(turnId, config.apiBaseUrl);
      return {
        activeTurnId: globalConfig.snapshot.activeTurnId,
        hasActiveTurn: globalConfig.snapshot.hasActiveTurn,
        paused: globalConfig.snapshot.paused,
        settlementClosed,
      };
    },
    resolveSettlementTurnId: async () => {
      const resolved = await resolveSettlementTurnId(enabledSettlementConfig);
      return resolved.turnId;
    },
    runSettlementPass: () =>
      runSettlementSchedulerOnce(enabledSettlementConfig, settlementDeps),
    sleep: (milliseconds) =>
      new Promise((resolveSleep) => setTimeout(resolveSleep, milliseconds)),
    timeoutMs: MANUAL_CYCLE_TIMEOUT_MS,
  });
}

const MANUAL_CONTROL_ACTIONS = {
  "/manual/close": closeTurnManually,
  "/manual/cycle": cycleTurnAndSettleManually,
  // Escape hatch: closes the turn skipping the phase-2 pipeline. Testing only.
  "/manual/force-close": forceCloseTurnManually,
  "/manual/migrate": migrateGlobalConfigManually,
  "/manual/open": openTurnManually,
} as const;

type ManualControlPath = keyof typeof MANUAL_CONTROL_ACTIONS;

function isManualControlPath(value: string): value is ManualControlPath {
  return value in MANUAL_CONTROL_ACTIONS;
}

/**
 * Routes the TEST-ONLY manual turn-control endpoints. Returns `true` once it
 * has handled the request. When manual control is disabled the paths report
 * 404 so they stay invisible outside testing.
 */
function handleManualControlRequest(
  request: IncomingMessage,
  response: ServerResponse,
  manualConfig: ManualControlConfig,
): boolean {
  const path = (request.url ?? "").split("?")[0] ?? "";
  if (!isManualControlPath(path)) {
    return false;
  }

  if (!manualConfig.enabled) {
    sendJson(request, response, 404, { error: "manual_control_disabled" });
    return true;
  }

  if (request.method !== "POST") {
    sendJson(request, response, 405, { error: "method_not_allowed" });
    return true;
  }

  const action = MANUAL_CONTROL_ACTIONS[path];
  void action(manualConfig)
    .then((result) => {
      console.log(`manual turn control ${path}`, result);
      if (endedPlayWindow(result)) {
        kickSettlementPass();
      }
      sendJson(request, response, 200, { result });
    })
    .catch((error: unknown) => {
      console.error(`manual turn control ${path} failed`, error);
      sendJson(request, response, 500, {
        error: "manual_control_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  return true;
}

function endedPlayWindow(result: ManualControlResult | ManualCycleResult) {
  if (result.action === "opened_next_turn") {
    return false;
  }
  return result.action === "settlement_required"
    ? result.close.action === "ended_play_window"
    : result.action === "ended_play_window";
}

/**
 * Fire one settlement scheduler pass right after a manual play-window end so
 * phase 2 (finalist shortlist → elimination window → draw) starts immediately
 * instead of waiting for the next loop tick. Fire-and-forget: the periodic
 * settlement loop keeps driving the pipeline either way.
 */
function kickSettlementPass() {
  void createSettlementSchedulerConfig()
    .then((config) => runSettlementSchedulerOnce({ ...config, enabled: true }))
    .then((result) => {
      console.log("manual settlement kick", JSON.stringify(result));
    })
    .catch((error: unknown) => {
      console.error("manual settlement kick failed", error);
    });
}

/**
 * TEST-ONLY manual settlement trigger. Runs one settlement scheduler pass for
 * the current settlement turn, stepping the PRD §5.5 pipeline as far as it can
 * right now. Gated behind manual control (same flag as the other `/manual/*`
 * paths); the manual invocation itself authorizes the run, so the loop's
 * `enabled` flag is forced on for this single pass.
 */
function handleSettlementManualRequest(
  request: IncomingMessage,
  response: ServerResponse,
  manualConfig: ManualControlConfig,
): boolean {
  const path = (request.url ?? "").split("?")[0] ?? "";
  if (path !== "/manual/settle") {
    return false;
  }

  if (!manualConfig.enabled) {
    sendJson(request, response, 404, { error: "manual_control_disabled" });
    return true;
  }
  if (request.method !== "POST") {
    sendJson(request, response, 405, { error: "method_not_allowed" });
    return true;
  }

  void createSettlementSchedulerConfig()
    .then((config) => runSettlementSchedulerOnce({ ...config, enabled: true }))
    .then((result) => {
      console.log("manual settlement", JSON.stringify(result));
      sendJson(request, response, 200, { result });
    })
    .catch((error: unknown) => {
      console.error("manual settlement failed", error);
      sendJson(request, response, 500, {
        error: "manual_settlement_failed",
        message: error instanceof Error ? error.message : String(error),
      });
    });
  return true;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const port = Number(process.env.PORT ?? 3003);
  const host = process.env.HOST ?? "0.0.0.0";
  const manualConfigPromise = createManualControlConfig();

  const server = createServer((request, response) => {
    const path = (request.url ?? "").split("?")[0] ?? "";

    if (request.method === "OPTIONS") {
      sendNoContent(request, response);
      return;
    }

    if (path === "/health") {
      void getWorkerStatus().then((health) => {
        sendJson(request, response, health.status === "ok" ? 200 : 503, health);
      });
      return;
    }

    if (request.method === "GET" && path === "/turn/active") {
      void getActiveTurnStatus()
        .then((status) => sendJson(request, response, 200, status))
        .catch((error: unknown) => {
          console.error("active turn status failed", error);
          sendJson(request, response, 500, {
            error: "active_turn_status_failed",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    void manualConfigPromise
      .then((manualConfig) => {
        if (handleManualControlRequest(request, response, manualConfig)) {
          return;
        }
        if (handleSettlementManualRequest(request, response, manualConfig)) {
          return;
        }
        sendJson(request, response, 404, { error: "not_found" });
      })
      .catch((error: unknown) => {
        sendJson(request, response, 500, {
          error: "manual_control_config_error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
  });

  server.listen(port, host, () => {
    console.log(`@tyche/worker listening on ${host}:${port}`);
  });

  void createTurnAutomationConfig().then((config) => {
    const timer = startTurnAutomationLoop(config);

    if (!timer) {
      return;
    }

    const stop = () => {
      clearInterval(timer);
      server.close();
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  void createSettlementSchedulerConfig().then((settlementConfig) => {
    const timer = startSettlementLoop(settlementConfig);

    if (!timer) {
      return;
    }

    const stop = () => {
      clearInterval(timer);
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  void createPrecompileLoopConfig().then((precompileConfig) => {
    const timer = startPrecompileLoop(precompileConfig);

    if (!timer) {
      return;
    }

    const stop = () => {
      clearInterval(timer);
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  void createTokenRewardSettlementConfig().then((rewardConfig) => {
    const timer = startTokenRewardSettlementLoop(rewardConfig);

    if (!timer) {
      return;
    }

    const stop = () => {
      clearInterval(timer);
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  void createActiveRuleRewardSettlementConfig().then((rewardConfig) => {
    const timer = startActiveRuleRewardSettlementLoop(rewardConfig);

    if (!timer) {
      return;
    }

    const stop = () => {
      clearInterval(timer);
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  void createReferralRewardSettlementConfig().then((rewardConfig) => {
    const timer = startReferralRewardSettlementLoop(rewardConfig);

    if (!timer) {
      return;
    }

    const stop = () => {
      clearInterval(timer);
    };

    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });

  const durableIndexerTimer = startDurableSolanaReconciliationLoop(
    createDurableIndexerConfig(),
  );
  if (durableIndexerTimer) {
    const stop = () => clearInterval(durableIndexerTimer);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  }
}
