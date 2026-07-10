import assert from "node:assert/strict";
import { test } from "node:test";
import bs58 from "bs58";
import {
  closeTurnManually,
  createManualControlConfig,
  cycleTurnManually,
  forceCloseTurnManually,
  migrateGlobalConfigManually,
  openTurnManually,
  shouldOpenAfterManualCycleClose,
  type ManualControlConfig,
} from "./manual-control.js";

const SAMPLE_KEYPAIR = bs58.encode(
  Uint8Array.from(Array.from({ length: 64 }, (_, index) => index)),
);

test("manual control is disabled unless explicitly enabled", async () => {
  const config = await createManualControlConfig({});

  assert.equal(config.enabled, false);
  assert.equal(config.authorityKeypairBytes, null);
  assert.equal(config.openDurationSeconds, 3_600);
});

test("manual control can be explicitly enabled for testing", async () => {
  const config = await createManualControlConfig({
    IDEALER_TURN_MANUAL_CONTROL_ENABLED: "true",
    IDEALER_TURN_AUTHORITY_KEYPAIR: SAMPLE_KEYPAIR,
  });

  assert.equal(config.enabled, true);
  assert.ok(config.authorityKeypairBytes instanceof Uint8Array);
});

test("manual control resolves a custom open duration", async () => {
  const config = await createManualControlConfig({
    IDEALER_TURN_MANUAL_OPEN_DURATION_SECONDS: "120",
  });

  assert.equal(config.openDurationSeconds, 120);
});

test("manual control rejects a non-positive open duration", async () => {
  await assert.rejects(
    createManualControlConfig({
      IDEALER_TURN_MANUAL_OPEN_DURATION_SECONDS: "0",
    }),
    /must be a positive integer/,
  );
});

const DISABLED_CONFIG: ManualControlConfig = {
  authorityKeypairBytes: null,
  enabled: false,
  migrateNextTurnId: null,
  openDurationSeconds: 3_600,
  programId: "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd" as never,
  rpcUrl: "http://127.0.0.1:9",
};

test("manual open/close/cycle/migrate reject when disabled with no RPC side effects", async () => {
  await assert.rejects(openTurnManually(DISABLED_CONFIG), /disabled/);
  await assert.rejects(closeTurnManually(DISABLED_CONFIG), /disabled/);
  await assert.rejects(forceCloseTurnManually(DISABLED_CONFIG), /disabled/);
  await assert.rejects(cycleTurnManually(DISABLED_CONFIG), /disabled/);
  await assert.rejects(
    migrateGlobalConfigManually(DISABLED_CONFIG),
    /disabled/,
  );
});

test("manual migrate resolves a custom next turn id override", async () => {
  const config = await createManualControlConfig({
    IDEALER_TURN_MANUAL_MIGRATE_NEXT_TURN_ID: "28",
  });

  assert.equal(config.migrateNextTurnId, 28);
});

test("enabled manual control requires an authority keypair", async () => {
  const config: ManualControlConfig = {
    ...DISABLED_CONFIG,
    enabled: true,
  };

  await assert.rejects(
    openTurnManually(config),
    /IDEALER_TURN_AUTHORITY_KEYPAIR/,
  );
  await assert.rejects(
    closeTurnManually(config),
    /IDEALER_TURN_AUTHORITY_KEYPAIR/,
  );
  await assert.rejects(
    forceCloseTurnManually(config),
    /IDEALER_TURN_AUTHORITY_KEYPAIR/,
  );
});

test("manual cycle opens a new turn only after a terminal close result", () => {
  assert.equal(
    shouldOpenAfterManualCycleClose({
      action: "closed_turn",
      shrinkSignature: "shrink",
      signature: "close",
      turnId: 7,
    }),
    true,
  );
  assert.equal(
    shouldOpenAfterManualCycleClose({
      action: "skipped_legacy_turn",
      signature: "skip",
      turnId: 7,
    }),
    true,
  );
  assert.equal(
    shouldOpenAfterManualCycleClose({ action: "no_active_turn" }),
    true,
  );
  assert.equal(
    shouldOpenAfterManualCycleClose({
      action: "settlement_in_progress",
      turnId: 7,
    }),
    false,
  );
  assert.equal(
    shouldOpenAfterManualCycleClose({
      action: "turn_already_closed",
      turnId: 7,
    }),
    false,
  );
});
