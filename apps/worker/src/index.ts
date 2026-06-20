import { createServer } from "node:http";
import { getTurnDurationHours } from "@idealer/game-engine";
import pg from "pg";
import { createClient } from "redis";
import {
  createTurnAutomationConfig,
  startTurnAutomationLoop,
  type TurnAutomationConfig,
} from "./turn-automation.js";

export * from "./draw.js";
export * from "./guess-verification.js";
export * from "./rule-validation.js";
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

  if (!databaseUrl || !redisUrl) {
    const firstTurnDurationSeconds =
      getFirstTurnDurationSeconds(turnAutomation);
    return {
      service: "worker",
      status: "error",
      firstTurnDurationHours: firstTurnDurationSeconds / 3_600,
      firstTurnDurationSeconds,
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
    postgres,
    redis,
    turnAutomation: getTurnAutomationStatus(turnAutomation),
  };
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

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3003);
  const host = process.env.HOST ?? "0.0.0.0";

  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "not_found" }));
      return;
    }

    void getWorkerStatus().then((health) => {
      response.writeHead(health.status === "ok" ? 200 : 503, {
        "content-type": "application/json",
      });
      response.end(JSON.stringify(health));
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
