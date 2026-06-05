import { createHash, randomInt } from "node:crypto";
import { createServer } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { RULE_MAX_TOKENS, TURN_DURATION_CYCLE_HOURS } from "@idealer/constants";
import pg from "pg";
import { createClient } from "redis";

const { Pool } = pg;
const MAX_RULE_TEXT_BYTES = 320;
const RULE_PREVENTED_PATTERNS = [
  /\bignore\b.{0,40}\b(instructions?|rules?|prompt)\b/i,
  /\b(system|developer)\s+(prompt|message|instruction)\b/i,
  /\bjailbreak\b/i,
  /\bprompt\s*injection\b/i,
  /\breveal\b.{0,40}\b(prompt|secret|private key|seed phrase)\b/i,
] as const;

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

export interface RulePreflightResult {
  maxTokens: number;
  normalizedTextHash: readonly number[];
  officialInterpretationHash: readonly number[];
  preflightResultHash: readonly number[];
  ruleId: number;
  sanitizedText: string;
  sanitizedTextHash: readonly number[];
  tokenCount: number;
}

export interface RuleProposalRecord extends RulePreflightResult {
  proposer: string;
  ruleProposal: string;
  signature: string;
  submittedAt: string;
  title: string;
  turnId: number;
}

const guessReceipts = new Map<string, GuessReceiptRecord>();
const ruleProposals = new Map<string, RuleProposalRecord>();
const LOCAL_WEB_ORIGIN_PATTERN =
  /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const CORS_PATHS = new Set([
  "/guess-receipts",
  "/rule-preflight",
  "/rule-proposals",
]);

function getGuessReceiptKey(turnId: number, player: string) {
  return `${turnId}:${player}`;
}

function getRuleProposalKey(turnId: number, ruleId: number) {
  return `${turnId}:${ruleId}`;
}

function isBase58Like(value: unknown) {
  return (
    typeof value === "string" && /^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(value)
  );
}

function countRuleTokens(value: string) {
  return value.match(/\p{L}+|\p{N}+|[^\s\p{L}\p{N}]/gu)?.length ?? 0;
}

function removeControlCharacters(value: string) {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);

      return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
        ? " "
        : character;
    })
    .join("");
}

function sanitizeRuleText(value: string) {
  return removeControlCharacters(value).replace(/\s+/g, " ").trim();
}

function hashBytes(value: string) {
  return Array.from(createHash("sha256").update(value, "utf8").digest());
}

function getRuleTitle(sanitizedText: string) {
  const firstSentence =
    sanitizedText.split(/[.!?]/)[0]?.trim() || sanitizedText;
  return firstSentence.length <= 48
    ? firstSentence
    : `${firstSentence.slice(0, 45).trim()}...`;
}

function hasPreventedRulePattern(value: string) {
  return RULE_PREVENTED_PATTERNS.some((pattern) => pattern.test(value));
}

function createRuleId() {
  return Date.now() * 1_000 + randomInt(0, 1_000);
}

function createRulePreflight(text: string): RulePreflightResult {
  const sanitizedText = sanitizeRuleText(text);
  const tokenCount = countRuleTokens(sanitizedText);
  const textByteLength = Buffer.byteLength(sanitizedText, "utf8");

  if (!sanitizedText) {
    throw new Error("RULE_EMPTY");
  }

  if (hasPreventedRulePattern(sanitizedText)) {
    throw new Error("RULE_PROMPT_INJECTION");
  }

  if (tokenCount > RULE_MAX_TOKENS) {
    throw new Error("RULE_TOKEN_LIMIT_EXCEEDED");
  }

  if (textByteLength > MAX_RULE_TEXT_BYTES) {
    throw new Error("RULE_TEXT_TOO_LONG");
  }

  const normalizedText = sanitizedText.toLowerCase();
  const officialInterpretation = `Compare every eligible guess using this measurable rule: ${sanitizedText}`;
  const ruleId = createRuleId();
  const preflightResult = JSON.stringify({
    maxTokens: RULE_MAX_TOKENS,
    ruleId,
    sanitizedText,
    tokenCount,
    version: 1,
  });

  return {
    maxTokens: RULE_MAX_TOKENS,
    normalizedTextHash: hashBytes(normalizedText),
    officialInterpretationHash: hashBytes(officialInterpretation),
    preflightResultHash: hashBytes(preflightResult),
    ruleId,
    sanitizedText,
    sanitizedTextHash: hashBytes(sanitizedText),
    tokenCount,
  };
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

function isHashArray(value: unknown) {
  return (
    Array.isArray(value) &&
    value.length === 32 &&
    value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  );
}

function isValidRuleProposal(value: unknown): value is RuleProposalRecord {
  if (!value || typeof value !== "object") {
    return false;
  }

  const proposal = value as Partial<RuleProposalRecord>;

  return (
    Number.isInteger(proposal.turnId) &&
    Number(proposal.turnId) > 0 &&
    Number.isInteger(proposal.ruleId) &&
    Number(proposal.ruleId) > 0 &&
    typeof proposal.sanitizedText === "string" &&
    sanitizeRuleText(proposal.sanitizedText) === proposal.sanitizedText &&
    Number.isInteger(proposal.tokenCount) &&
    Number(proposal.tokenCount) > 0 &&
    Number(proposal.tokenCount) <= RULE_MAX_TOKENS &&
    countRuleTokens(proposal.sanitizedText) === proposal.tokenCount &&
    isHashArray(proposal.sanitizedTextHash) &&
    isHashArray(proposal.normalizedTextHash) &&
    isHashArray(proposal.officialInterpretationHash) &&
    isHashArray(proposal.preflightResultHash) &&
    isBase58Like(proposal.proposer) &&
    isBase58Like(proposal.ruleProposal) &&
    isBase58Like(proposal.signature) &&
    typeof proposal.submittedAt === "string" &&
    !Number.isNaN(Date.parse(proposal.submittedAt))
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

function getAllowedCorsOrigin(origin: string | undefined) {
  if (!origin) {
    return null;
  }

  const configuredOrigins = (process.env.WEB_ORIGIN ?? "")
    .split(",")
    .map((configuredOrigin) => configuredOrigin.trim())
    .filter(Boolean);

  if (
    configuredOrigins.includes(origin) ||
    LOCAL_WEB_ORIGIN_PATTERN.test(origin)
  ) {
    return origin;
  }

  return null;
}

function getCorsHeaders(request: import("node:http").IncomingMessage) {
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
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
  statusCode: number,
  body: unknown,
) {
  response.writeHead(statusCode, {
    "content-type": "application/json",
    ...getCorsHeaders(request),
  });
  response.end(JSON.stringify(body));
}

function sendNoContent(
  request: import("node:http").IncomingMessage,
  response: import("node:http").ServerResponse,
) {
  response.writeHead(204, getCorsHeaders(request));
  response.end();
}

export function saveGuessReceipt(receipt: GuessReceiptRecord) {
  const key = getGuessReceiptKey(receipt.turnId, receipt.player);
  guessReceipts.set(key, receipt);
  return receipt;
}

export function getGuessReceipt(turnId: number, player: string) {
  return guessReceipts.get(getGuessReceiptKey(turnId, player)) ?? null;
}

export function saveRuleProposal(proposal: RuleProposalRecord) {
  const normalizedProposal = {
    ...proposal,
    title: getRuleTitle(proposal.sanitizedText),
  };
  ruleProposals.set(
    getRuleProposalKey(proposal.turnId, proposal.ruleId),
    normalizedProposal,
  );
  return normalizedProposal;
}

export function listRuleProposals(turnId: number) {
  return [...ruleProposals.values()]
    .filter((proposal) => proposal.turnId === turnId)
    .sort((left, right) => right.ruleId - left.ruleId);
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

function isMainModule() {
  const entrypoint = process.argv[1];
  return (
    typeof entrypoint === "string" &&
    fileURLToPath(import.meta.url) === resolve(entrypoint)
  );
}

if (isMainModule()) {
  const port = Number(process.env.PORT ?? 3002);
  const host = process.env.HOST ?? "0.0.0.0";

  const server = createServer((request, response) => {
    const url = new URL(
      request.url ?? "/",
      `http://${request.headers.host ?? host}`,
    );

    if (request.method === "GET" && url.pathname === "/health") {
      void getHealth().then((health) => {
        sendJson(request, response, health.status === "ok" ? 200 : 503, health);
      });
      return;
    }

    if (request.method === "OPTIONS" && CORS_PATHS.has(url.pathname)) {
      sendNoContent(request, response);
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-preflight") {
      void readJsonBody(request)
        .then((body) => {
          const text =
            body && typeof body === "object" && "text" in body
              ? (body as { text?: unknown }).text
              : null;

          if (typeof text !== "string") {
            sendJson(request, response, 400, { error: "invalid_rule_text" });
            return;
          }

          try {
            sendJson(request, response, 200, {
              preflight: createRulePreflight(text),
            });
          } catch (error) {
            const code =
              error instanceof Error ? error.message : "RULE_REJECTED";
            sendJson(request, response, 400, {
              error: code,
              message:
                code === "RULE_PROMPT_INJECTION"
                  ? "Rule text contains prompt-injection language. Rewrite it as a measurable game condition."
                  : code === "RULE_TOKEN_LIMIT_EXCEEDED"
                    ? `Rule text exceeds the ${RULE_MAX_TOKENS}-token limit.`
                    : code === "RULE_TEXT_TOO_LONG"
                      ? `Rule text exceeds the ${MAX_RULE_TEXT_BYTES}-byte on-chain limit.`
                      : "Rule text is invalid.",
            });
          }
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "POST" && url.pathname === "/guess-receipts") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidGuessReceipt(body)) {
            sendJson(request, response, 400, {
              error: "invalid_guess_receipt",
            });
            return;
          }

          const existing = getGuessReceipt(body.turnId, body.player);
          if (existing && existing.signature !== body.signature) {
            sendJson(request, response, 409, {
              error: "duplicate_guess_receipt",
              receipt: existing,
            });
            return;
          }

          sendJson(request, response, 201, { receipt: saveGuessReceipt(body) });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "POST" && url.pathname === "/rule-proposals") {
      void readJsonBody(request)
        .then((body) => {
          if (!isValidRuleProposal(body)) {
            sendJson(request, response, 400, {
              error: "invalid_rule_proposal",
            });
            return;
          }

          const existing = ruleProposals.get(
            getRuleProposalKey(body.turnId, body.ruleId),
          );
          if (existing && existing.signature !== body.signature) {
            sendJson(request, response, 409, {
              error: "duplicate_rule_proposal",
              proposal: existing,
            });
            return;
          }

          sendJson(request, response, 201, {
            proposal: saveRuleProposal(body),
          });
        })
        .catch((error: unknown) => {
          sendJson(request, response, 400, {
            error: "invalid_json",
            message: error instanceof Error ? error.message : String(error),
          });
        });
      return;
    }

    if (request.method === "GET" && url.pathname === "/rule-proposals") {
      const turnId = Number(url.searchParams.get("turnId"));

      if (!Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      sendJson(request, response, 200, {
        proposals: listRuleProposals(turnId),
      });
      return;
    }

    if (request.method === "GET" && url.pathname === "/guess-receipts") {
      const player = url.searchParams.get("player");
      const turnId = Number(url.searchParams.get("turnId"));

      if (!player || !Number.isInteger(turnId) || turnId <= 0) {
        sendJson(request, response, 400, { error: "invalid_query" });
        return;
      }

      const receipt = getGuessReceipt(turnId, player);
      sendJson(
        request,
        response,
        receipt ? 200 : 404,
        receipt ? { receipt } : { error: "not_found" },
      );
      return;
    }

    sendJson(request, response, 404, { error: "not_found" });
  });

  server.listen(port, host, () => {
    console.log(`@idealer/api listening on ${host}:${port}`);
  });
}
