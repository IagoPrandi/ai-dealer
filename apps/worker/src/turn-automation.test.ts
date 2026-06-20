import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { address } from "@solana/kit";
import bs58 from "bs58";
import {
  createTurnAutomationConfig,
  isLegacyTurnDeserializationError,
  loadAuthorityKeypairBytesFromEnv,
  runTurnAutomationOnce,
  stringifySimulationError,
} from "./turn-automation.js";

test("turn automation is disabled unless explicitly enabled", async () => {
  const config = await createTurnAutomationConfig({});

  assert.equal(config.enabled, false);
  assert.equal(config.authorityKeypairBytes, null);
  assert.equal(config.desiredTurnDurationCycle, null);
  assert.equal(config.intervalMs, 30_000);
});

test("turn automation can be explicitly enabled for the worker loop", async () => {
  const config = await createTurnAutomationConfig({
    IDEALER_TURN_AUTOMATION_ENABLED: "true",
    IDEALER_TURN_AUTOMATION_INTERVAL_MS: "10000",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.authorityKeypairBytes, null);
  assert.equal(config.desiredTurnDurationCycle, null);
  assert.equal(config.intervalMs, 10_000);
});

test("turn automation resolves shortened devnet duration cycle", async () => {
  const config = await createTurnAutomationConfig({
    IDEALER_DEVNET_TURN_DURATION_SCALE_BPS: "1500",
  });

  assert.deepEqual(config.desiredTurnDurationCycle, [
    1_080, 1_080, 4_320, 4_320,
  ]);
});

test("turn automation validates Solana keypair byte shape", async () => {
  await assert.rejects(
    loadAuthorityKeypairBytesFromEnv({
      IDEALER_TURN_AUTHORITY_KEYPAIR: JSON.stringify([1, 2, 3]),
    }),
    /64-byte Solana keypair JSON array or base58-encoded/,
  );
});

test("turn automation accepts a base58-encoded authority keypair", async () => {
  const keypairBytes = Uint8Array.from(
    Array.from({ length: 64 }, (_, index) => index),
  );
  const parsed = await loadAuthorityKeypairBytesFromEnv({
    IDEALER_TURN_AUTHORITY_KEYPAIR: bs58.encode(keypairBytes),
  });

  assert.deepEqual(parsed, keypairBytes);
});

test("turn automation prefers authority keypair path over inline value", async () => {
  const dir = await mkdtemp(join(tmpdir(), "idealer-worker-"));
  try {
    const pathBytes = Uint8Array.from(
      Array.from({ length: 64 }, (_, index) => 63 - index),
    );
    const inlineBytes = Uint8Array.from(
      Array.from({ length: 64 }, (_, index) => index),
    );
    const keypairPath = join(dir, "authority.json");
    await writeFile(keypairPath, JSON.stringify([...pathBytes]));

    const parsed = await loadAuthorityKeypairBytesFromEnv({
      IDEALER_TURN_AUTHORITY_KEYPAIR_PATH: keypairPath,
      IDEALER_TURN_AUTHORITY_KEYPAIR: bs58.encode(inlineBytes),
    });

    assert.deepEqual(parsed, pathBytes);
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
});

test("turn automation stringifies simulation errors containing bigint values", () => {
  assert.equal(
    stringifySimulationError({ InstructionError: [0n, { Custom: 6001n }] }),
    '{"InstructionError":["0",{"Custom":"6001"}]}',
  );
});

test("turn automation detects legacy active turn deserialization failures", () => {
  assert.equal(
    isLegacyTurnDeserializationError(
      new Error(
        'Turn automation transaction simulation failed: {"InstructionError":["0",{"Custom":"3003"}]}; logs=["Program log: AnchorError caused by account: turn_state. Error Code: AccountDidNotDeserialize. Error Number: 3003. Error Message: Failed to deserialize the account."]',
      ),
    ),
    true,
  );
  assert.equal(
    isLegacyTurnDeserializationError(new Error("TurnNotEnded")),
    false,
  );
});

test("turn automation disabled check has no RPC side effects", async () => {
  const result = await runTurnAutomationOnce({
    authorityKeypairBytes: null,
    desiredTurnDurationCycle: null,
    enabled: false,
    intervalMs: 30_000,
    programId: address("6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4"),
    rpcUrl: "http://127.0.0.1:9",
  });

  assert.deepEqual(result, { action: "disabled" });
});

test("enabled turn automation requires an authority keypair", async () => {
  await assert.rejects(
    runTurnAutomationOnce({
      authorityKeypairBytes: null,
      desiredTurnDurationCycle: null,
      enabled: true,
      intervalMs: 10_000,
      programId: address("6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4"),
      rpcUrl: "http://127.0.0.1:9",
    }),
    /IDEALER_TURN_AUTHORITY_KEYPAIR/,
  );
});
