import assert from "node:assert/strict";
import { test } from "node:test";
import bs58 from "bs58";
import {
  closeTurnManually,
  completeManualCycleAfterClose,
  completeManualCycleSettlement,
  createManualControlConfig,
  cycleTurnManually,
  forceCloseTurnManually,
  isRetryableManualCycleError,
  migrateGlobalConfigManually,
  openTurnManually,
  shouldOpenNextTurnAfterManualCycle,
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
    TYCHE_TURN_MANUAL_CONTROL_ENABLED: "true",
    TYCHE_TURN_AUTHORITY_KEYPAIR: SAMPLE_KEYPAIR,
  });

  assert.equal(config.enabled, true);
  assert.ok(config.authorityKeypairBytes instanceof Uint8Array);
});

test("manual control resolves a custom open duration", async () => {
  const config = await createManualControlConfig({
    TYCHE_TURN_MANUAL_OPEN_DURATION_SECONDS: "120",
  });

  assert.equal(config.openDurationSeconds, 120);
});

test("manual control rejects a non-positive open duration", async () => {
  await assert.rejects(
    createManualControlConfig({
      TYCHE_TURN_MANUAL_OPEN_DURATION_SECONDS: "0",
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
    TYCHE_TURN_MANUAL_MIGRATE_NEXT_TURN_ID: "28",
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
    /TYCHE_TURN_AUTHORITY_KEYPAIR/,
  );
  await assert.rejects(
    closeTurnManually(config),
    /TYCHE_TURN_AUTHORITY_KEYPAIR/,
  );
  await assert.rejects(
    forceCloseTurnManually(config),
    /TYCHE_TURN_AUTHORITY_KEYPAIR/,
  );
});

test("manual cycle opens only after the previous turn is no longer active", () => {
  assert.equal(
    shouldOpenNextTurnAfterManualCycle({ action: "no_active_turn" }),
    true,
  );
  assert.equal(
    shouldOpenNextTurnAfterManualCycle({
      action: "ended_play_window",
      playWindowSeconds: 60,
      signature: "shrink",
      turnId: 16,
    }),
    false,
  );
  assert.equal(
    shouldOpenNextTurnAfterManualCycle({
      action: "settlement_in_progress",
      turnId: 16,
    }),
    false,
  );
});

test("manual cycle resumes an incomplete predecessor after on-chain close", async () => {
  let settlementPasses = 0;
  const result = await completeManualCycleAfterClose(
    { action: "no_active_turn" },
    {
      nowMs: () => 0,
      openNextTurn: async () => ({
        action: "opened_turn",
        expiredClaims: [],
        openDurationSeconds: 1_200,
        setCycleSignature: "set-cycle",
        signature: "open",
        sweepSignature: null,
        turnId: 25,
      }),
      readState: async () => ({
        activeTurnId: 0,
        hasActiveTurn: false,
        paused: false,
        settlementClosed: true,
      }),
      resolveSettlementTurnId: async () => 24,
      runSettlementPass: async () => {
        settlementPasses += 1;
      },
      sleep: async () => undefined,
      timeoutMs: 2_000,
    },
  );

  assert.equal(result.action, "opened_next_turn");
  assert.equal(result.open?.action, "opened_turn");
  assert.equal(settlementPasses, 1);
});

test("manual cycle drives settlement through CLOSED before opening the next turn", async () => {
  let nowMs = 0;
  let reads = 0;
  let settlementPasses = 0;
  let openCalls = 0;
  const result = await completeManualCycleSettlement(
    {
      action: "ended_play_window",
      playWindowSeconds: 60,
      signature: "shrink",
      turnId: 20,
    },
    {
      nowMs: () => nowMs,
      openNextTurn: async () => {
        openCalls += 1;
        return {
          action: "opened_turn",
          expiredClaims: [],
          openDurationSeconds: 1_200,
          setCycleSignature: "set-cycle",
          signature: "open",
          sweepSignature: null,
          turnId: 21,
        };
      },
      readState: async () => {
        reads += 1;
        return reads === 1
          ? {
              activeTurnId: 20,
              hasActiveTurn: true,
              paused: false,
              settlementClosed: false,
            }
          : {
              activeTurnId: 20,
              hasActiveTurn: false,
              paused: false,
              settlementClosed: true,
            };
      },
      runSettlementPass: async () => {
        settlementPasses += 1;
      },
      sleep: async (milliseconds) => {
        nowMs += milliseconds;
      },
      timeoutMs: 5_000,
    },
  );

  assert.equal(result.action, "opened_next_turn");
  assert.equal(result.open?.action, "opened_turn");
  assert.equal(result.settlementPasses, 2);
  assert.equal(settlementPasses, 2);
  assert.equal(openCalls, 1);
});

test("manual cycle times out without opening when CLOSED is not recorded", async () => {
  let nowMs = 0;
  let openCalls = 0;
  await assert.rejects(
    completeManualCycleSettlement(
      { action: "settlement_in_progress", turnId: 20 },
      {
        nowMs: () => nowMs,
        openNextTurn: async () => {
          openCalls += 1;
          return { action: "no_active_turn" };
        },
        readState: async () => ({
          activeTurnId: 20,
          hasActiveTurn: false,
          paused: false,
          settlementClosed: false,
        }),
        runSettlementPass: async () => undefined,
        sleep: async (milliseconds) => {
          nowMs += milliseconds;
        },
        timeoutMs: 2_000,
      },
    ),
    /timed out.*next turn was not opened/,
  );
  assert.equal(openCalls, 0);
});

test("manual cycle fails closed if a different active turn appears", async () => {
  let openCalls = 0;
  await assert.rejects(
    completeManualCycleSettlement(
      { action: "settlement_in_progress", turnId: 20 },
      {
        nowMs: () => 0,
        openNextTurn: async () => {
          openCalls += 1;
          return { action: "no_active_turn" };
        },
        readState: async () => ({
          activeTurnId: 21,
          hasActiveTurn: true,
          paused: false,
          settlementClosed: true,
        }),
        runSettlementPass: async () => undefined,
        sleep: async () => undefined,
        timeoutMs: 2_000,
      },
    ),
    /active turn 21 appeared/,
  );
  assert.equal(openCalls, 0);
});

test("manual cycle retries a transient RPC 429 and still opens after CLOSED", async () => {
  let nowMs = 0;
  let settlementCalls = 0;
  const result = await completeManualCycleSettlement(
    { action: "settlement_in_progress", turnId: 22 },
    {
      nowMs: () => nowMs,
      openNextTurn: async () => ({
        action: "opened_turn",
        expiredClaims: [],
        openDurationSeconds: 1_200,
        setCycleSignature: "set-cycle",
        signature: "open",
        sweepSignature: null,
        turnId: 23,
      }),
      readState: async () => ({
        activeTurnId: 0,
        hasActiveTurn: false,
        paused: false,
        settlementClosed: true,
      }),
      runSettlementPass: async () => {
        settlementCalls += 1;
        if (settlementCalls === 1) {
          throw new Error("HTTP error (429): Too Many Requests");
        }
      },
      sleep: async (milliseconds) => {
        nowMs += milliseconds;
      },
      timeoutMs: 5_000,
    },
  );

  assert.equal(result.action, "opened_next_turn");
  assert.equal(settlementCalls, 2);
});

test("manual cycle retries only explicit RPC rate limiting", () => {
  assert.equal(
    isRetryableManualCycleError(
      new Error("HTTP error (429): Too Many Requests"),
    ),
    true,
  );
  assert.equal(
    isRetryableManualCycleError(
      new Error("request_draw transaction simulation failed"),
    ),
    false,
  );
});
