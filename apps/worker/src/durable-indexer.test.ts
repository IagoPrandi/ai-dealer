import assert from "node:assert/strict";
import test from "node:test";
import {
  DURABLE_SOLANA_EVENT_SCHEMA,
  rebuildDurableSolanaEventProjection,
  findOrphanedEvents,
  hashEventPayload,
  stableEventKey,
  storeDurableSolanaEvent,
  type DurableSolanaEvent,
  type DurableSolanaEventRow,
} from "./durable-indexer.js";

const signature = "4TzMqySK4kdpcYb1ojTEzYyoCiibq8wrDkUMGdmNx2iXvTF2PLCXqUAbE7S1spLsV1o7XqLCRsZRnm9uJN8N3kAx";
const blockhash = "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea";

function event(): DurableSolanaEvent {
  return {
    cluster: "devnet",
    eventKind: "settlement.request_draw",
    executionBlockhash: blockhash,
    finalizedAt: "2026-07-27T17:15:00.000Z",
    instructionIndex: 0,
    payload: { turnId: 33 },
    signature,
    slot: 479_312_427,
  };
}

test("durable index uses Solana transaction identity and deterministic payload hashes", () => {
  assert.equal(stableEventKey(event()), `devnet:${signature}:0`);
  assert.equal(hashEventPayload({ b: 2, a: 1 }), hashEventPayload({ a: 1, b: 2 }));
  assert.match(DURABLE_SOLANA_EVENT_SCHEMA, /solana_event_raw/);
  assert.match(DURABLE_SOLANA_EVENT_SCHEMA, /PRIMARY KEY \(cluster, signature, instruction_index\)/);
});

test("durable index accepts an exact replay but rejects an identity collision", async () => {
  const stored = new Map<string, { blockhash: string; payloadHash: string }>();
  const client = {
    async query<T>(text: string, values: readonly unknown[] = []) {
      if (text.includes("INSERT INTO solana_event_raw")) {
        const key = `${values[0]}:${values[1]}:${values[2]}`;
        if (stored.has(key)) {
          return { rowCount: 0, rows: [] as T[] };
        }
        stored.set(key, { blockhash: String(values[4]), payloadHash: String(values[6]) });
        return { rowCount: 1, rows: [] as T[] };
      }
      const key = `${values[0]}:${values[1]}:${values[2]}`;
      const row = stored.get(key);
      return {
        rowCount: row ? 1 : 0,
        rows: (row ? [{ execution_blockhash: row.blockhash, payload_hash: row.payloadHash }] : []) as T[],
      };
    },
  };
  assert.equal((await storeDurableSolanaEvent(client, event())).action, "inserted");
  assert.equal((await storeDurableSolanaEvent(client, event())).action, "replayed");
  await assert.rejects(
    () => storeDurableSolanaEvent(client, { ...event(), payload: { turnId: 34 } }),
    /identity collision/,
  );
});

test("durable index identifies orphaned blocks without double-counting canonical events", () => {
  const rows: DurableSolanaEventRow[] = [
    {
      cluster: "devnet",
      event_kind: "settlement.request_draw",
      execution_blockhash: blockhash,
      finalized_at: event().finalizedAt,
      instruction_index: 0,
      orphaned_at: null,
      payload_hash: hashEventPayload(event().payload),
      payload_json: event().payload,
      signature,
      slot: String(event().slot),
    },
  ];
  assert.deepEqual(findOrphanedEvents(rows, new Map([[event().slot, blockhash]])), []);
  assert.equal(findOrphanedEvents(rows, new Map([[event().slot, null]])).length, 1);
  assert.equal(findOrphanedEvents(rows, new Map([[event().slot, "other"]])).length, 1);
});

test("durable index rebuilds the projection atomically from canonical raw events", async () => {
  const queries: string[] = [];
  const client = {
    async query<T>(text: string) {
      queries.push(text);
      return {
        rowCount: 1,
        rows: (text.includes("SELECT count(*)") ? [{ count: "2" }] : []) as T[],
      };
    },
  };
  assert.equal(
    await rebuildDurableSolanaEventProjection(
      client,
      "devnet",
      "2026-07-27T17:15:00.000Z",
    ),
    2,
  );
  assert.deepEqual(queries.map((query) => query.split(" ")[0]), [
    "BEGIN",
    "DELETE",
    "WITH",
    "COMMIT",
  ]);
  assert.match(queries[2] ?? "", /orphaned_at IS NULL/);
});
