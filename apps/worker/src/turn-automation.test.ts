import assert from "node:assert/strict";
import { test } from "node:test";
import { address } from "@solana/kit";
import {
  createTurnAutomationConfig,
  loadAuthorityKeypairBytesFromEnv,
  runTurnAutomationOnce,
} from "./turn-automation.js";

test("turn automation is disabled unless explicitly enabled", async () => {
  const config = await createTurnAutomationConfig({});

  assert.equal(config.enabled, false);
  assert.equal(config.authorityKeypairBytes, null);
  assert.equal(config.intervalMs, 30_000);
});

test("turn automation can be explicitly enabled for the worker loop", async () => {
  const config = await createTurnAutomationConfig({
    IDEALER_TURN_AUTOMATION_ENABLED: "true",
    IDEALER_TURN_AUTOMATION_INTERVAL_MS: "10000",
  });

  assert.equal(config.enabled, true);
  assert.equal(config.authorityKeypairBytes, null);
  assert.equal(config.intervalMs, 10_000);
});

test("turn automation validates Solana keypair byte shape", async () => {
  await assert.rejects(
    loadAuthorityKeypairBytesFromEnv({
      IDEALER_TURN_AUTHORITY_KEYPAIR: JSON.stringify([1, 2, 3]),
    }),
    /64-byte Solana keypair/,
  );
});

test("turn automation disabled check has no RPC side effects", async () => {
  const result = await runTurnAutomationOnce({
    authorityKeypairBytes: null,
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
      enabled: true,
      intervalMs: 10_000,
      programId: address("6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4"),
      rpcUrl: "http://127.0.0.1:9",
    }),
    /IDEALER_TURN_AUTHORITY_KEYPAIR/,
  );
});
