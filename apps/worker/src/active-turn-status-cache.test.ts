import assert from "node:assert/strict";
import { test } from "node:test";

import { createActiveTurnStatusLoader } from "./active-turn-status-cache.js";

test("active turn reads in the same burst share one RPC request", async () => {
  let calls = 0;
  let resolveLoad: ((value: { turnId: number }) => void) | undefined;
  const loader = createActiveTurnStatusLoader(
    () => {
      calls += 1;
      return new Promise<{ turnId: number }>((resolve) => {
        resolveLoad = resolve;
      });
    },
    { freshForMs: 5_000, maxStaleMs: 60_000 },
  );

  const first = loader();
  const second = loader({ requireFresh: true });
  resolveLoad?.({ turnId: 42 });

  assert.equal((await first).value.turnId, 42);
  assert.equal((await second).value.turnId, 42);
  assert.equal(calls, 1);
});

test("polling can surface an explicitly stale observation during an RPC outage", async () => {
  let nowMs = Date.parse("2026-08-07T12:00:00.000Z");
  let fail = false;
  const loader = createActiveTurnStatusLoader(
    async () => {
      if (fail) {
        throw new Error("HTTP 429");
      }
      return { turnId: 42 };
    },
    { freshForMs: 5_000, maxStaleMs: 60_000, now: () => nowMs },
  );

  const fresh = await loader();
  fail = true;
  nowMs += 10_000;
  const stale = await loader();

  assert.equal(fresh.freshness, "fresh");
  assert.equal(stale.freshness, "stale");
  assert.equal(stale.source, "cache");
  assert.deepEqual(stale.value, { turnId: 42 });
});

test("transaction gates never receive stale turn state", async () => {
  let nowMs = Date.parse("2026-08-07T12:00:00.000Z");
  let fail = false;
  const loader = createActiveTurnStatusLoader(
    async () => {
      if (fail) {
        throw new Error("HTTP 429");
      }
      return { turnId: 42 };
    },
    { freshForMs: 5_000, maxStaleMs: 60_000, now: () => nowMs },
  );

  await loader();
  fail = true;
  nowMs += 10_000;

  await assert.rejects(loader({ requireFresh: true }), /HTTP 429/);
});
