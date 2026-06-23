import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { pathToFileURL } from "node:url";
import { getTurnDurationHours } from "@idealer/game-engine";
import pg from "pg";
import { createClient } from "redis";
import {
  closeTurnManually,
  createManualControlConfig,
  cycleTurnManually,
  migrateGlobalConfigManually,
  openTurnManually,
  type ManualControlConfig,
} from "./manual-control.js";
import {
  createTurnAutomationConfig,
  startTurnAutomationLoop,
  type TurnAutomationConfig,
} from "./turn-automation.js";

export * from "./claims.js";
export * from "./draw.js";
export * from "./guess-verification.js";
export * from "./manual-control.js";
export * from "./rule-validation.js";
export * from "./switchboard.js";
export * from "./turn-automation.js";

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

function sendJson(
  response: ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

const MANUAL_CONTROL_ACTIONS = {
  "/manual/close": closeTurnManually,
  "/manual/cycle": cycleTurnManually,
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
    sendJson(response, 404, { error: "manual_control_disabled" });
    return true;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return true;
  }

  const action = MANUAL_CONTROL_ACTIONS[path];
  void action(manualConfig)
    .then((result) => {
      console.log(`manual turn control ${path}`, result);
      sendJson(response, 200, { result });
    })
    .catch((error: unknown) => {
      console.error(`manual turn control ${path} failed`, error);
      sendJson(response, 500, {
        error: "manual_control_failed",
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

    if (path === "/health") {
      void getWorkerStatus().then((health) => {
        sendJson(response, health.status === "ok" ? 200 : 503, health);
      });
      return;
    }

    void manualConfigPromise
      .then((manualConfig) => {
        if (handleManualControlRequest(request, response, manualConfig)) {
          return;
        }
        sendJson(response, 404, { error: "not_found" });
      })
      .catch((error: unknown) => {
        sendJson(response, 500, {
          error: "manual_control_config_error",
          message: error instanceof Error ? error.message : String(error),
        });
      });
  });

  server.listen(port, host, () => {
    console.log(`@idealer/worker listening on ${host}:${port}`);
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
}
