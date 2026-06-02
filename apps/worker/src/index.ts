import { createServer } from "node:http";
import { getTurnDurationHours } from "@idealer/game-engine";
import pg from "pg";
import { createClient } from "redis";

const { Pool } = pg;

export interface WorkerStatus {
  service: string;
  status: "ok" | "error";
  firstTurnDurationHours: number;
  postgres: "ok" | "error";
  redis: "ok" | "error";
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

  if (!databaseUrl || !redisUrl) {
    return {
      service: "worker",
      status: "error",
      firstTurnDurationHours: getTurnDurationHours(0),
      postgres: databaseUrl ? "ok" : "error",
      redis: redisUrl ? "ok" : "error"
    };
  }

  const [postgres, redis] = await Promise.all([checkPostgres(databaseUrl), checkRedis(redisUrl)]);

  return {
    service: "worker",
    status: postgres === "ok" && redis === "ok" ? "ok" : "error",
    firstTurnDurationHours: getTurnDurationHours(0),
    postgres,
    redis
  };
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
      response.writeHead(health.status === "ok" ? 200 : 503, { "content-type": "application/json" });
      response.end(JSON.stringify(health));
    });
  });

  server.listen(port, host, () => {
    console.log(`@idealer/worker listening on ${host}:${port}`);
  });
}
