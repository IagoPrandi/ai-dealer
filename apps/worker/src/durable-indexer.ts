import { createHash } from "node:crypto";
import pg from "pg";
import { Connection } from "@solana/web3.js";

const { Pool } = pg;
const RECONCILIATION_BLOCK_READ_DELAY_MS = 250;

export const DURABLE_SOLANA_EVENT_SCHEMA = `
CREATE TABLE IF NOT EXISTS solana_event_raw (
  cluster text NOT NULL,
  signature text NOT NULL,
  instruction_index integer NOT NULL,
  slot bigint NOT NULL,
  execution_blockhash text NOT NULL,
  event_kind text NOT NULL,
  payload_hash text NOT NULL,
  payload_json jsonb NOT NULL,
  finalized_at timestamptz NOT NULL,
  orphaned_at timestamptz,
  PRIMARY KEY (cluster, signature, instruction_index)
);

CREATE INDEX IF NOT EXISTS solana_event_raw_canonical_slot_idx
  ON solana_event_raw (cluster, slot, instruction_index)
  WHERE orphaned_at IS NULL;

CREATE TABLE IF NOT EXISTS solana_event_projection (
  cluster text NOT NULL,
  signature text NOT NULL,
  instruction_index integer NOT NULL,
  slot bigint NOT NULL,
  event_kind text NOT NULL,
  payload_hash text NOT NULL,
  payload_json jsonb NOT NULL,
  rebuilt_at timestamptz NOT NULL,
  PRIMARY KEY (cluster, signature, instruction_index)
);

CREATE INDEX IF NOT EXISTS solana_event_projection_slot_idx
  ON solana_event_projection (cluster, slot, instruction_index);
`;

export interface DurableSolanaEvent {
  cluster: "devnet" | "mainnet-beta";
  eventKind: string;
  executionBlockhash: string;
  finalizedAt: string;
  instructionIndex: number;
  payload: Record<string, unknown>;
  signature: string;
  slot: number;
}

export interface DurableSolanaEventRow {
  cluster: DurableSolanaEvent["cluster"];
  event_kind: string;
  execution_blockhash: string;
  finalized_at: string;
  instruction_index: number;
  orphaned_at: string | null;
  payload_hash: string;
  payload_json: Record<string, unknown>;
  signature: string;
  slot: string;
}

export interface SqlClient {
  query: <T = unknown>(
    text: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: T[]; rowCount?: number | null }>;
}

export interface DurableIndexerConfig {
  cluster: DurableSolanaEvent["cluster"];
  connection: Connection;
  databaseUrl: string;
  enabled: boolean;
  reconciliationIntervalMs: number;
}

let pool: InstanceType<typeof Pool> | null = null;
let initialized: Promise<void> | null = null;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableJson(entry)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function stableEventKey(event: Pick<
  DurableSolanaEvent,
  "cluster" | "instructionIndex" | "signature"
>) {
  return `${event.cluster}:${event.signature}:${event.instructionIndex}`;
}

export function hashEventPayload(payload: Record<string, unknown>) {
  return createHash("sha256").update(stableJson(payload), "utf8").digest("hex");
}

function assertEvent(event: DurableSolanaEvent) {
  if (!Number.isSafeInteger(event.slot) || event.slot < 0) {
    throw new Error("Durable event slot must be a non-negative safe integer.");
  }
  if (!Number.isInteger(event.instructionIndex) || event.instructionIndex < 0) {
    throw new Error("Durable event instruction index must be a non-negative integer.");
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(event.signature)) {
    throw new Error("Durable event signature is invalid.");
  }
  if (!/^[1-9A-HJ-NP-Za-km-z]{32,88}$/.test(event.executionBlockhash)) {
    throw new Error("Durable event execution blockhash is invalid.");
  }
  if (!event.eventKind.trim()) {
    throw new Error("Durable event kind is required.");
  }
  if (Number.isNaN(Date.parse(event.finalizedAt))) {
    throw new Error("Durable event finalized timestamp is invalid.");
  }
}

export async function storeDurableSolanaEvent(
  client: SqlClient,
  event: DurableSolanaEvent,
) {
  assertEvent(event);
  const payloadHash = hashEventPayload(event.payload);
  const result = await client.query<{
    execution_blockhash: string;
    payload_hash: string;
  }>(
    `INSERT INTO solana_event_raw (
       cluster, signature, instruction_index, slot, execution_blockhash,
       event_kind, payload_hash, payload_json, finalized_at
     ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::timestamptz)
     ON CONFLICT (cluster, signature, instruction_index) DO NOTHING
     RETURNING execution_blockhash, payload_hash`,
    [
      event.cluster,
      event.signature,
      event.instructionIndex,
      event.slot,
      event.executionBlockhash,
      event.eventKind,
      payloadHash,
      JSON.stringify(event.payload),
      event.finalizedAt,
    ],
  );
  if ((result.rowCount ?? result.rows.length) > 0) {
    return { action: "inserted" as const, key: stableEventKey(event) };
  }

  const existing = await client.query<{
    execution_blockhash: string;
    payload_hash: string;
  }>(
    `SELECT execution_blockhash, payload_hash
       FROM solana_event_raw
      WHERE cluster = $1 AND signature = $2 AND instruction_index = $3`,
    [event.cluster, event.signature, event.instructionIndex],
  );
  const row = existing.rows[0];
  if (!row) {
    throw new Error("Durable event upsert lost its canonical row.");
  }
  if (
    row.execution_blockhash !== event.executionBlockhash ||
    row.payload_hash !== payloadHash
  ) {
    throw new Error(
      `Durable event identity collision for ${stableEventKey(event)}.`,
    );
  }
  return { action: "replayed" as const, key: stableEventKey(event) };
}

export function findOrphanedEvents(
  events: readonly DurableSolanaEventRow[],
  canonicalBlockhashBySlot: ReadonlyMap<number, string | null>,
) {
  return events.filter((event) => {
    if (event.orphaned_at !== null) {
      return false;
    }
    const canonical = canonicalBlockhashBySlot.get(Number(event.slot));
    return canonical === null || canonical !== event.execution_blockhash;
  });
}

function isRpcRateLimitError(error: unknown) {
  return error instanceof Error && /\b429\b|too many requests/i.test(error.message);
}

function sleep(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

async function fetchFinalizedBlockhashWithRetry(
  connection: Connection,
  slot: number,
) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    try {
      const block = await connection.getBlock(slot, {
        commitment: "finalized",
        maxSupportedTransactionVersion: 0,
        transactionDetails: "none",
        rewards: false,
      });
      return block?.blockhash ?? null;
    } catch (error) {
      if (!isRpcRateLimitError(error) || attempt === 3) {
        throw error;
      }
      await sleep(RECONCILIATION_BLOCK_READ_DELAY_MS * 2 ** attempt);
    }
  }
  throw new Error(`Unable to read finalized block ${slot}.`);
}

export async function markOrphanedDurableSolanaEvents(
  client: SqlClient,
  events: readonly DurableSolanaEventRow[],
  orphanedAt: string,
) {
  if (events.length === 0) {
    return 0;
  }
  if (Number.isNaN(Date.parse(orphanedAt))) {
    throw new Error("Orphaned timestamp is invalid.");
  }
  for (const event of events) {
    await client.query(
      `UPDATE solana_event_raw
          SET orphaned_at = $1::timestamptz
        WHERE cluster = $2 AND signature = $3 AND instruction_index = $4
          AND orphaned_at IS NULL`,
      [orphanedAt, event.cluster, event.signature, event.instruction_index],
    );
  }
  return events.length;
}

/**
 * Rebuild the confirmed projection strictly from non-orphaned raw events. The
 * delete/insert runs in one database transaction so consumers never observe a
 * partially rebuilt projection.
 */
export async function rebuildDurableSolanaEventProjection(
  client: SqlClient,
  cluster: DurableSolanaEvent["cluster"],
  rebuiltAt: string,
) {
  if (Number.isNaN(Date.parse(rebuiltAt))) {
    throw new Error("Projection rebuilt timestamp is invalid.");
  }
  await client.query("BEGIN");
  try {
    await client.query(
      "DELETE FROM solana_event_projection WHERE cluster = $1",
      [cluster],
    );
    const inserted = await client.query<{ count: string }>(
      `WITH inserted AS (
         INSERT INTO solana_event_projection (
           cluster, signature, instruction_index, slot, event_kind,
           payload_hash, payload_json, rebuilt_at
         )
         SELECT cluster, signature, instruction_index, slot, event_kind,
                payload_hash, payload_json, $2::timestamptz
           FROM solana_event_raw
          WHERE cluster = $1 AND orphaned_at IS NULL
         ORDER BY slot ASC, instruction_index ASC
         RETURNING 1
       ) SELECT count(*)::text AS count FROM inserted`,
      [cluster, rebuiltAt],
    );
    await client.query("COMMIT");
    return Number(inserted.rows[0]?.count ?? "0");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

export function createDurableIndexerConfig(
  env = process.env,
): DurableIndexerConfig | null {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    return null;
  }
  const reconciliationIntervalMs = Number(
    env.IDEALER_DURABLE_INDEXER_RECONCILIATION_INTERVAL_MS ?? "300000",
  );
  if (
    !Number.isInteger(reconciliationIntervalMs) ||
    reconciliationIntervalMs < 10_000
  ) {
    throw new Error(
      "IDEALER_DURABLE_INDEXER_RECONCILIATION_INTERVAL_MS must be an integer of at least 10000.",
    );
  }
  return {
    cluster: "devnet",
    connection: new Connection(
      env.IDEALER_SOLANA_RPC_URL ?? "https://api.devnet.solana.com",
      "finalized",
    ),
    databaseUrl,
    enabled: env.IDEALER_DURABLE_INDEXER_ENABLED !== "false",
    reconciliationIntervalMs,
  };
}

export function startDurableSolanaReconciliationLoop(
  config: DurableIndexerConfig | null,
) {
  if (!config || !config.enabled) {
    return null;
  }
  const reconcile = () =>
    reconcileDurableSolanaEvents(config).catch((error: unknown) => {
      console.error(
        "durable Solana event reconciliation failed",
        error instanceof Error ? error.message : String(error),
      );
    });
  void reconcile();
  return setInterval(reconcile, config.reconciliationIntervalMs);
}

export async function persistFinalizedTransaction({
  cluster,
  connection,
  databaseUrl = process.env.DATABASE_URL,
  eventKind,
  payload,
  signature,
}: {
  cluster: DurableSolanaEvent["cluster"];
  connection: Connection;
  databaseUrl?: string;
  eventKind: string;
  payload: Record<string, unknown>;
  signature: string;
}) {
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required to persist finalized Solana index events.",
    );
  }
  const transaction = await connection.getTransaction(signature, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
  });
  if (!transaction || transaction.meta?.err) {
    throw new Error(
      `Finalized transaction ${signature} is missing or failed; refusing to index it.`,
    );
  }
  const block = await connection.getBlock(transaction.slot, {
    commitment: "finalized",
    maxSupportedTransactionVersion: 0,
    transactionDetails: "none",
    rewards: false,
  });
  if (!block) {
    throw new Error(
      `Finalized execution block ${transaction.slot} is unavailable for ${signature}.`,
    );
  }
  if (!pool || (pool as unknown as { options?: { connectionString?: string } }).options?.connectionString !== databaseUrl) {
    await pool?.end();
    pool = new Pool({ connectionString: databaseUrl });
    initialized = null;
  }
  initialized ??= pool.query(DURABLE_SOLANA_EVENT_SCHEMA).then(() => undefined);
  await initialized;
  return storeDurableSolanaEvent(pool, {
    cluster,
    eventKind,
    executionBlockhash: block.blockhash,
    finalizedAt: new Date().toISOString(),
    instructionIndex: 0,
    payload: {
      ...payload,
      recentBlockhash: transaction.transaction.message.recentBlockhash,
    },
    signature,
    slot: transaction.slot,
  });
}

export async function reconcileDurableSolanaEvents({
  cluster,
  connection,
  databaseUrl = process.env.DATABASE_URL,
}: {
  cluster: DurableSolanaEvent["cluster"];
  connection: Connection;
  databaseUrl?: string;
}) {
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required to reconcile Solana index events.");
  }
  const reconciliationPool = new Pool({ connectionString: databaseUrl });
  try {
    await reconciliationPool.query(DURABLE_SOLANA_EVENT_SCHEMA);
    const rows = await reconciliationPool.query<DurableSolanaEventRow>(
      `SELECT cluster, signature, instruction_index, slot, execution_blockhash,
              event_kind, payload_hash, payload_json, finalized_at, orphaned_at
         FROM solana_event_raw
        WHERE cluster = $1 AND orphaned_at IS NULL
        ORDER BY slot ASC, instruction_index ASC`,
      [cluster],
    );
    const canonical = new Map<number, string | null>();
    for (const slot of new Set(rows.rows.map((event) => Number(event.slot)))) {
      canonical.set(slot, await fetchFinalizedBlockhashWithRetry(connection, slot));
      await sleep(RECONCILIATION_BLOCK_READ_DELAY_MS);
    }
    const orphaned = findOrphanedEvents(rows.rows, canonical);
    const marked = await markOrphanedDurableSolanaEvents(
      reconciliationPool,
      orphaned,
      new Date().toISOString(),
    );
    const projectedEvents = await rebuildDurableSolanaEventProjection(
      reconciliationPool,
      cluster,
      new Date().toISOString(),
    );
    return {
      canonicalEvents: rows.rows.length - marked,
      orphanedEvents: marked,
      projectedEvents,
    };
  } finally {
    await reconciliationPool.end();
  }
}
