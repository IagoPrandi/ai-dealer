import { createServer } from "node:http";
import { URL } from "node:url";
import { TURN_DURATION_CYCLE_HOURS } from "@idealer/constants";
import pg from "pg";
import { createClient } from "redis";

const { Pool } = pg;

export interface ServiceHealth {
  service: string;
  status: "ok" | "error";
  turnDurationCycleHours: readonly number[];
  postgres: "ok" | "error";
  redis: "ok" | "error";
}

export interface GuessReceiptRecord {
  gameToken: string;
  numbers: readonly number[];
  player: string;
  playerGuess: string;
  programId: string;
  signature: string;
  submittedAt: string;
  turnId: number;
}

const guessReceipts = new Map<string, GuessReceiptRecord>();

function getGuessReceiptKey(turnId: number, player: string) {
  return `${turnId}:${player}`;
}

function isBase58Like(value: unknown) {
  return (
    typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(value)
  );
}

function isValidGuessReceipt(value: unknown): value is GuessReceiptRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const receipt = value as Partial<GuessReceiptRecord>;
  const numbers = receipt.numbers;

  return (
    Number.isInteger(receipt.turnId) &&
    Number(receipt.turnId) > 0 &&
    Array.isArray(numbers) &&
    numbers.length === 6 &&
    new Set(numbers).size === 6 &&
    numbers.every(
      (number) => Number.isInteger(number) && number >= 1 && number <= 100,
    ) &&
    isBase58Like(receipt.player) &&
    isBase58Like(receipt.playerGuess) &&
    isBase58Like(receipt.gameToken) &&
    isBase58Like(receipt.programId) &&
    isBase58Like(receipt.signature) &&
    typeof receipt.submittedAt === "string" &&
    !Number.isNaN(Date.parse(receipt.submittedAt))
  );
}

async function readJsonBody(request: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return null;
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
}

function sendJson(
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, { "content-type": "application/json" });
  response.end(JSON.stringify(body));
}

export function saveGuessReceipt(receipt: GuessReceiptRecord) {
  const key = getGuessReceiptKey(receipt.turnId, receipt.player);
  guessReceipts.set(key, receipt);
  return receipt;
}

export function getGuessReceipt(turnId: number, player: string) {
  return guessReceipts.get(getGuessReceiptKey(turnId, player)) ?? null;
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

export async function getHealth(): Promise<ServiceHealth> {
  const databaseUrl = process.env.DATABASE_URL;
  const redisUrl = process.env.REDIS_URL;

  if (!databaseUrl || !redisUrl) {
    return {
      service: "api",
      status: "error",
      turnDurationCycleHours: TURN_DURATION_CYCLE_HOURS,
      postgres: databaseUrl ? "ok" : "error",
      redis: redisUrl ? "ok" : "error",
    };
  }

  const [postgres, redis] = await Promise.all([
    checkPostgres(databaseUrl),
    checkRedis(redisUrl),
  ]);

  return {
    service: "api",
    status: postgres === "ok" && redis === "ok" ? "ok" : "error",
    turnDurationCycleHours: TURN_DURATION_CYCLE_HOURS,
    postgres,
    redis,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 3002);
  const host = process.env.HOST ?? "0.0.0.0";

  const server = createServer((request, response) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? host}`,
    );

    if (request.method === "GET" && url.pathname === "/health") {
      void getHealth().then((health) => {
        sendJson(response, health.status === "ok" ? 200 : 503, health);
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/guess-receipts") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidGuessReceipt(body)) {
            sendJson(response, 400, { error: "invalid_guess_receipt" });
            return;
          }

          const existing = getGuessReceipt(body.turnId, body.player);
          if (existing && existing.signature !== body.signature) {
            sendJson(response, 409, {
              error: "duplicate_guess_receipt",
              receipt: existing,
            });
            return;
          }

          sendJson(response, 201, { receipt: saveGuessReceipt(body) });
        })
        .catch((error: unknown) => {
          sendJson(response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/guess-receipts") {
      const player = url.searchParams.get("player");
      const turnId = Number(url.searchParams.get("turnId"));

      if (!player || !Number.isInteger(turnId) || turnId <= 0) {
        sendJson(response, 400, { error: "invalid_query" });
        return;
      }

      const receipt = getGuessReceipt(turnId, player);
      sendJson(
        response,
        receipt ? 200 : 404,
        receipt ? { receipt } : { error: "not_found" },
      );
      return;
    }

    sendJson(response, 404, { error: "not_found" });
  });

  server.listen(port, host, () => {
    console.log(`@idealer/api listening on ${host}:${port}`);
  });
}
