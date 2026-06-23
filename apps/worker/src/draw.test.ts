import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveDrawNumbers,
  planDrawAction,
  runDrawCycle,
  type DrawCycleDeps,
  type DrawTurn,
  type PublishedDraw,
  type RandomnessState,
} from "./draw.js";

const ENDED_NOT_REQUESTED: DrawTurn = {
  drawStatus: "not_requested",
  endTimestampSeconds: 1_000,
  turnId: 5,
};

test("planDrawAction waits until the turn ends", () => {
  assert.equal(planDrawAction(ENDED_NOT_REQUESTED, 999, null), "none");
});

test("planDrawAction requests a draw once ended", () => {
  assert.equal(planDrawAction(ENDED_NOT_REQUESTED, 1_000, null), "request");
});

test("planDrawAction retries a failed draw", () => {
  const turn: DrawTurn = { ...ENDED_NOT_REQUESTED, drawStatus: "failed" };
  assert.equal(planDrawAction(turn, 1_500, null), "request");
});

test("planDrawAction waits for delayed randomness", () => {
  const turn: DrawTurn = { ...ENDED_NOT_REQUESTED, drawStatus: "requested" };
  assert.equal(planDrawAction(turn, 1_500, null), "wait");
  assert.equal(planDrawAction(turn, 1_500, { status: "pending" }), "wait");
});

test("planDrawAction settles when randomness is ready and fails when it errors", () => {
  const turn: DrawTurn = { ...ENDED_NOT_REQUESTED, drawStatus: "requested" };
  const ready: RandomnessState = {
    randomness: new Uint8Array(32).fill(9),
    source: "Source1111111111111111111111111111111111111",
    status: "ready",
  };
  assert.equal(planDrawAction(turn, 1_500, ready), "settle");
  assert.equal(planDrawAction(turn, 1_500, { status: "failed" }), "fail");
});

test("planDrawAction does nothing once fulfilled", () => {
  const turn: DrawTurn = { ...ENDED_NOT_REQUESTED, drawStatus: "fulfilled" };
  assert.equal(planDrawAction(turn, 5_000, null), "none");
});

test("deriveDrawNumbers is deterministic, unique, and in range", () => {
  const randomness = new Uint8Array(32).fill(7);
  const first = deriveDrawNumbers(randomness, 1);
  const second = deriveDrawNumbers(randomness, 1);

  assert.deepEqual(first, second);
  assert.equal(first.length, 6);
  assert.equal(new Set(first).size, 6);
  assert.ok(first.every((number) => number >= 1 && number <= 100));
  assert.notDeepEqual(first, deriveDrawNumbers(randomness, 2));
});

test("deriveDrawNumbers rejects non-32-byte randomness", () => {
  assert.throws(() => deriveDrawNumbers(new Uint8Array(16), 1));
});

test("deriveDrawNumbers matches the on-chain known vectors", () => {
  // Identical assertions live in the Rust suite
  // (`contracts/solana/programs/idealer/tests/core.rs`) to lock cross-language
  // parity between the worker mirror and the on-chain derivation.
  assert.deepEqual(deriveDrawNumbers(new Uint8Array(32).fill(7), 1), [
    20, 18, 99, 69, 90, 37,
  ]);
  assert.deepEqual(deriveDrawNumbers(new Uint8Array(32).fill(3), 5), [
    65, 11, 13, 10, 69, 17,
  ]);
});

function baseDeps(overrides: Partial<DrawCycleDeps> = {}): {
  deps: DrawCycleDeps;
  published: PublishedDraw[];
} {
  const published: PublishedDraw[] = [];
  const deps: DrawCycleDeps = {
    failDraw: async () => undefined,
    fetchRandomness: async () => null,
    fetchTurn: async () => ENDED_NOT_REQUESTED,
    nowIso: () => "2026-06-08T00:00:00.000Z",
    nowSeconds: () => 2_000,
    publishDraw: async (draw) => {
      published.push(draw);
    },
    randomnessAccountFor: async () =>
      "Acct11111111111111111111111111111111111111",
    requestDraw: async () => undefined,
    settleDraw: async (_turnId, _source, randomness) => {
      if (!randomness) {
        throw new Error("test randomness missing");
      }
      return {
        randomness,
        signature: "Sig1111111111111111111111111111111111111111",
      };
    },
    ...overrides,
  };
  return { deps, published };
}

test("runDrawCycle requests and publishes a requested draw", async () => {
  const { deps, published } = baseDeps();
  const result = await runDrawCycle(5, deps);

  assert.equal(result.action, "request");
  assert.equal(published.length, 1);
  assert.equal(published[0]?.status, "requested");
  assert.equal(published[0]?.drawResult, null);
});

test("runDrawCycle accepts randomness returned by trustless settle", async () => {
  const settledRandomness = new Uint8Array(32).fill(4);
  const { deps, published } = baseDeps({
    fetchRandomness: async () => ({
      randomness: null,
      source: "Source1111111111111111111111111111111111111",
      status: "ready",
    }),
    fetchTurn: async () => ({
      drawStatus: "requested",
      endTimestampSeconds: 1_000,
      turnId: 5,
    }),
    settleDraw: async () => ({
      randomness: settledRandomness,
      signature: "Sig2222222222222222222222222222222222222222",
    }),
  });

  const result = await runDrawCycle(5, deps);

  assert.equal(result.action, "settle");
  assert.deepEqual(result.drawResult, deriveDrawNumbers(settledRandomness, 5));
  assert.equal(
    published[0]?.randomnessValue,
    Buffer.from(settledRandomness).toString("hex"),
  );
});

test("runDrawCycle settles and publishes a fulfilled draw", async () => {
  const randomness = new Uint8Array(32).fill(3);
  const { deps, published } = baseDeps({
    fetchRandomness: async () => ({
      randomness,
      source: "Source1111111111111111111111111111111111111",
      status: "ready",
    }),
    fetchTurn: async () => ({
      drawStatus: "requested",
      endTimestampSeconds: 1_000,
      turnId: 5,
    }),
  });

  const result = await runDrawCycle(5, deps);

  assert.equal(result.action, "settle");
  assert.deepEqual(result.drawResult, deriveDrawNumbers(randomness, 5));
  assert.equal(published[0]?.status, "fulfilled");
  assert.equal(published[0]?.randomnessValue, Buffer.from(randomness).toString("hex"));
});

test("runDrawCycle fails a draw when randomness errors", async () => {
  let failed = -1;
  const { deps } = baseDeps({
    failDraw: async (_turnId, code) => {
      failed = code;
    },
    fetchRandomness: async () => ({ status: "failed" }),
    fetchTurn: async () => ({
      drawStatus: "requested",
      endTimestampSeconds: 1_000,
      turnId: 5,
    }),
  });

  const result = await runDrawCycle(5, deps);

  assert.equal(result.action, "fail");
  assert.equal(failed, 1);
});
