import { createHash } from "node:crypto";

/**
 * Off-chain draw orchestration for M3.1.
 *
 * The on-chain program is the source of truth: `request_draw` records the
 * verifiable randomness account, `settle_draw` consumes the revealed value and
 * deterministically derives the 6 drawn numbers, and `fail_draw` records a
 * recoverable failure. This module decides, for a turn at a given time, which
 * of those instructions to issue, mirrors the deterministic derivation so the
 * worker can publish/cross-check the result, and drives the cycle through
 * injected dependencies so it stays testable without a live cluster.
 */

export type WorkerDrawStatus =
  | "failed"
  | "fulfilled"
  | "not_requested"
  | "requested";

export type DrawAction = "fail" | "none" | "request" | "settle" | "wait";

export interface DrawTurn {
  drawStatus: WorkerDrawStatus;
  endTimestampSeconds: number;
  turnId: number;
}

export type RandomnessState =
  | { status: "failed" }
  | { status: "pending" }
  | { randomness: Uint8Array | null; source: string; status: "ready" };

const DRAW_COUNT = 6;
const UPPER_BOUND = 100;
const REJECTION_LIMIT = 200; // largest multiple of 100 within a u8 byte domain

/**
 * Decide which draw instruction (if any) a turn needs right now.
 *
 * - Before the turn ends, or once fulfilled: nothing to do.
 * - Ended and not yet requested (or previously failed): request a draw.
 * - Requested: settle when randomness is ready, fail when it errored, wait
 *   while it is still pending (delayed VRF).
 */
export function planDrawAction(
  turn: DrawTurn,
  nowSeconds: number,
  randomness: RandomnessState | null,
): DrawAction {
  if (turn.drawStatus === "fulfilled") {
    return "none";
  }
  if (nowSeconds < turn.endTimestampSeconds) {
    return "none";
  }
  if (turn.drawStatus === "not_requested" || turn.drawStatus === "failed") {
    return "request";
  }

  // drawStatus === "requested"
  if (!randomness || randomness.status === "pending") {
    return "wait";
  }
  if (randomness.status === "failed") {
    return "fail";
  }
  return "settle";
}

/**
 * Deterministic mirror of the on-chain `derive_draw_numbers`. Produces 6 unique
 * numbers in 1..=100 from the revealed randomness and the turn id, using the
 * same input layout (`randomness | turnId(u64 LE) | counter(u64 LE)`), SHA-256,
 * and rejection sampling so the worker can reproduce and verify the published
 * draw.
 */
export function deriveDrawNumbers(
  randomness: Uint8Array,
  turnId: number,
): number[] {
  if (randomness.length !== 32) {
    throw new Error("Randomness must be exactly 32 bytes.");
  }

  const numbers: number[] = [];
  const seen = new Set<number>();
  let counter = 0n;

  while (numbers.length < DRAW_COUNT) {
    const input = Buffer.alloc(48);
    Buffer.from(randomness).copy(input, 0);
    input.writeBigUInt64LE(BigInt(turnId), 32);
    input.writeBigUInt64LE(counter, 40);
    const digest = createHash("sha256").update(input).digest();

    for (const byte of digest) {
      if (byte >= REJECTION_LIMIT) {
        continue;
      }
      const candidate = (byte % UPPER_BOUND) + 1;
      if (!seen.has(candidate)) {
        seen.add(candidate);
        numbers.push(candidate);
        if (numbers.length === DRAW_COUNT) {
          break;
        }
      }
    }

    counter = BigInt.asUintN(64, counter + 1n);
  }

  return numbers;
}

export interface PublishedDraw {
  drawResult: number[] | null;
  drawnAt: string | null;
  failureCode: number | null;
  randomnessAccount: string;
  randomnessSource: string | null;
  randomnessValue: string | null;
  requestedAt: string;
  settleSignature: string | null;
  status: "failed" | "fulfilled" | "requested";
  turnId: number;
}

export interface DrawCycleDeps {
  failDraw: (turnId: number, failureCode: number) => Promise<void>;
  fetchRandomness: (turnId: number) => Promise<RandomnessState | null>;
  fetchTurn: (turnId: number) => Promise<DrawTurn | null>;
  nowSeconds: () => number;
  nowIso: () => string;
  publishDraw: (draw: PublishedDraw) => Promise<void>;
  randomnessAccountFor: (turnId: number) => Promise<string>;
  requestDraw: (turnId: number, randomnessAccount: string) => Promise<void>;
  settleDraw: (
    turnId: number,
    source: string,
    randomness: Uint8Array | null,
  ) => Promise<string | { randomness: Uint8Array; signature: string }>;
}

export interface DrawCycleResult {
  action: DrawAction;
  drawResult?: number[];
  turnId: number;
}

/**
 * Run a single draw cycle for one turn: read its state, decide the action, and
 * execute it through the injected on-chain/API dependencies. Returns the action
 * taken so a scheduler can log it and retry delayed turns on the next tick.
 */
export async function runDrawCycle(
  turnId: number,
  deps: DrawCycleDeps,
): Promise<DrawCycleResult> {
  const turn = await deps.fetchTurn(turnId);
  if (!turn) {
    return { action: "none", turnId };
  }

  const randomness = await deps.fetchRandomness(turnId);
  const action = planDrawAction(turn, deps.nowSeconds(), randomness);

  if (action === "request") {
    const account = await deps.randomnessAccountFor(turnId);
    await deps.requestDraw(turnId, account);
    await deps.publishDraw({
      drawResult: null,
      drawnAt: null,
      failureCode: null,
      randomnessAccount: account,
      randomnessSource: null,
      randomnessValue: null,
      requestedAt: deps.nowIso(),
      settleSignature: null,
      status: "requested",
      turnId,
    });
    return { action, turnId };
  }

  if (action === "settle" && randomness && randomness.status === "ready") {
    const settleResult = await deps.settleDraw(
      turnId,
      randomness.source,
      randomness.randomness,
    );
    const signature =
      typeof settleResult === "string" ? settleResult : settleResult.signature;
    const settledRandomness =
      typeof settleResult === "string"
        ? randomness.randomness
        : settleResult.randomness;
    if (!settledRandomness) {
      throw new Error("Settled draw did not return a randomness value.");
    }
    const drawResult = deriveDrawNumbers(settledRandomness, turnId);
    await deps.publishDraw({
      drawResult,
      drawnAt: deps.nowIso(),
      failureCode: null,
      randomnessAccount: randomness.source,
      randomnessSource: randomness.source,
      randomnessValue: Buffer.from(settledRandomness).toString("hex"),
      requestedAt: deps.nowIso(),
      settleSignature: signature.toString(),
      status: "fulfilled",
      turnId,
    });
    return { action, drawResult, turnId };
  }

  if (action === "fail") {
    const failureCode = 1;
    await deps.failDraw(turnId, failureCode);
    return { action, turnId };
  }

  return { action, turnId };
}
