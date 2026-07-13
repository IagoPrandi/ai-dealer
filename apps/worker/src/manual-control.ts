/**
 * Manual turn control — TEST-PHASE ONLY.
 *
 * The production worker advances turns automatically on a timer
 * (`turn-automation.ts`). During testing on devnet that means screens stay
 * empty until a turn happens to be open, and ending a turn means waiting out
 * its full duration. This module lets an operator open turns, end the phase-1
 * play window, then let the real settlement pipeline complete before the next
 * turn opens.
 *
 * It reuses the exact same on-chain instructions as the automatic loop, so the
 * data the UI reads is real devnet state, not a fabricated mock.
 *
 * Ending early: a turn is phase 1 (create rules + pick numbers) followed by
 * phase 2 (finalist shortlist → elimination voting → active rule → draw), and
 * phase 2 is driven by the settlement scheduler while the turn stays `Open`
 * (PRD §5.4/§5.5). Manually calling the on-chain `close_turn` would skip
 * phase 2 entirely — no shortlist, no elimination votes, no draw — so
 * `closeTurnManually` instead shrinks the active turn's duration to the time
 * already elapsed via `set_turn_duration_cycle` (recomputing
 * `end_timestamp ≈ now`, which also moves the phase-1 cutoffs into the past)
 * and lets the settlement loop run the whole phase-2 pipeline and issue the
 * real `close_turn` at the end. `openTurnManually` has no time gate — but a
 * freshly opened turn inherits whatever duration slot is currently configured
 * (possibly a shrunken value left by a previous manual end), so right after
 * opening we reset the whole cycle to a comfortable, playable duration.
 *
 * `forceCloseTurnManually` closes immediately by shrinking to 1s and calling
 * `close_turn`, skipping the shortlist/elimination/draw phase. It remains an
 * emergency test-only escape hatch and must never be followed by opening a new
 * turn until the prior prize pool has been reconciled. `/manual/cycle` ends
 * phase 1, drives the real settlement pipeline through `CLOSED`, and only then
 * opens the next turn.
 *
 * This is intentionally NOT wired into production: it is gated behind
 * `IDEALER_TURN_MANUAL_CONTROL_ENABLED` and must stay off outside testing.
 */
import { AccountRole, createSolanaRpc } from "@solana/kit";
import {
  createCloseTurnInstruction,
  createForceSkipLegacyActiveTurnInstruction,
  createOpenTurnInstruction,
  createSetTurnDurationCycleInstruction,
  createTurnAutomationConfig,
  deriveAuthorityAddress,
  fetchGlobalConfig,
  fetchTurnState,
  getGlobalConfigPda,
  isTurnSettlementClosed,
  isLegacyTurnDeserializationError,
  simulateAndSend,
  SYSTEM_PROGRAM_ID,
  u64LeArray,
  type RpcClient,
  type SolanaAddress,
} from "./turn-automation.js";

const DEFAULT_MANUAL_OPEN_DURATION_SECONDS = 3_600;
const SHRINK_DURATION_SECONDS = 1;
// sha256("global:reinitialize_global_config_for_migration")[..8].
const REINITIALIZE_GLOBAL_CONFIG_DISCRIMINATOR = new Uint8Array([
  129, 93, 81, 106, 191, 47, 41, 155,
]);

export interface ManualControlConfig {
  apiBaseUrl?: string | undefined;
  authorityKeypairBytes: null | Uint8Array;
  enabled: boolean;
  migrateNextTurnId: null | number;
  openDurationSeconds: number;
  programId: SolanaAddress;
  rpcUrl: string;
}

export type ManualControlResult =
  | {
      action: "opened_turn";
      openDurationSeconds: number;
      setCycleSignature: string;
      signature: string;
      turnId: number;
    }
  | {
      action: "closed_turn";
      shrinkSignature: string;
      signature: string;
      turnId: number;
    }
  | {
      action: "ended_play_window";
      playWindowSeconds: number;
      signature: string;
      turnId: number;
    }
  | { action: "settlement_in_progress"; turnId: number }
  | {
      action: "skipped_legacy_turn";
      signature: string;
      turnId: number;
    }
  | {
      action: "migrated_global_config";
      nextTurnId: number;
      signature: string;
    }
  | { action: "active_turn_exists"; turnId: number }
  | { action: "no_active_turn" }
  | { action: "paused" }
  | { action: "turn_already_closed"; turnId: number };

export interface ManualCycleResult {
  action: "opened_next_turn" | "settlement_required";
  close: ManualControlResult;
  open?: ManualControlResult;
  settlementPasses?: number;
}

export interface ManualCycleSettlementState {
  activeTurnId: number;
  hasActiveTurn: boolean;
  paused: boolean;
  settlementClosed: boolean;
}

export interface ManualCycleSettlementDeps {
  nowMs: () => number;
  openNextTurn: () => Promise<ManualControlResult>;
  readState: (turnId: number) => Promise<ManualCycleSettlementState>;
  runSettlementPass: () => Promise<unknown>;
  sleep: (milliseconds: number) => Promise<void>;
  timeoutMs: number;
}

const MANUAL_CYCLE_POLL_INTERVAL_MS = 2_000;

function envFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function resolveOpenDurationSeconds(value: string | undefined) {
  if (!value) {
    return DEFAULT_MANUAL_OPEN_DURATION_SECONDS;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      "IDEALER_TURN_MANUAL_OPEN_DURATION_SECONDS must be a positive integer number of seconds.",
    );
  }

  return parsed;
}

export async function createManualControlConfig(
  env = process.env,
): Promise<ManualControlConfig> {
  // Reuse the automation config purely for the shared RPC/program/authority
  // resolution. The manual `enabled` flag is independent of the automatic loop
  // so the two never run at the same time.
  const automation = await createTurnAutomationConfig(env);
  return {
    apiBaseUrl: automation.apiBaseUrl,
    authorityKeypairBytes: automation.authorityKeypairBytes,
    enabled: envFlag(env.IDEALER_TURN_MANUAL_CONTROL_ENABLED),
    migrateNextTurnId: resolveMigrateNextTurnId(
      env.IDEALER_TURN_MANUAL_MIGRATE_NEXT_TURN_ID,
    ),
    openDurationSeconds: resolveOpenDurationSeconds(
      env.IDEALER_TURN_MANUAL_OPEN_DURATION_SECONDS,
    ),
    programId: automation.programId,
    rpcUrl: automation.rpcUrl,
  };
}

function resolveMigrateNextTurnId(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(
      "IDEALER_TURN_MANUAL_MIGRATE_NEXT_TURN_ID must be a positive integer turn id.",
    );
  }

  return parsed;
}

function assertEnabled(
  config: ManualControlConfig,
): asserts config is ManualControlConfig & {
  authorityKeypairBytes: Uint8Array;
} {
  if (!config.enabled) {
    throw new Error(
      "Manual turn control is disabled. Set IDEALER_TURN_MANUAL_CONTROL_ENABLED=true to use it (testing only).",
    );
  }

  if (!config.authorityKeypairBytes) {
    throw new Error(
      "Manual turn control is enabled but IDEALER_TURN_AUTHORITY_KEYPAIR or IDEALER_TURN_AUTHORITY_KEYPAIR_PATH is not set.",
    );
  }
}

async function forceSkipLegacyActiveTurn({
  authority,
  authorityKeypairBytes,
  programId,
  rpc,
  turnId,
  turnState,
}: {
  authority: SolanaAddress;
  authorityKeypairBytes: Uint8Array;
  programId: SolanaAddress;
  rpc: RpcClient;
  turnId: number;
  turnState: SolanaAddress;
}): Promise<ManualControlResult> {
  const instruction = await createForceSkipLegacyActiveTurnInstruction({
    authority,
    programId,
    turnState,
  });
  const signature = await simulateAndSend({
    authorityKeypairBytes,
    instruction,
    rpc,
  });
  return {
    action: "skipped_legacy_turn",
    signature: signature.toString(),
    turnId,
  };
}

/**
 * Open the next turn immediately and reset its duration to a comfortable,
 * playable window. No-op (returns `active_turn_exists`) when a turn is already
 * open — close it first.
 */
export async function openTurnManually(
  config: ManualControlConfig,
): Promise<ManualControlResult> {
  assertEnabled(config);

  const rpc = createSolanaRpc(config.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.programId,
    rpc,
  });

  if (globalConfig.snapshot.paused) {
    return { action: "paused" };
  }

  if (globalConfig.snapshot.hasActiveTurn) {
    return {
      action: "active_turn_exists",
      turnId: globalConfig.snapshot.activeTurnId,
    };
  }

  const previousTurnId = globalConfig.snapshot.nextTurnId - 1;
  if (
    previousTurnId > 0 &&
    !(await isTurnSettlementClosed(previousTurnId, config.apiBaseUrl))
  ) {
    throw new Error(
      `Cannot open the next turn before turn ${previousTurnId} reaches CLOSED settlement.`,
    );
  }

  const authority = deriveAuthorityAddress(config.authorityKeypairBytes);
  const turnId = globalConfig.snapshot.nextTurnId;

  const openInstruction = await createOpenTurnInstruction({
    authority,
    programId: config.programId,
    turnId,
  });
  const signature = await simulateAndSend({
    authorityKeypairBytes: config.authorityKeypairBytes,
    instruction: openInstruction,
    rpc,
  });

  // Reset the whole cycle to the manual open duration so the just-opened turn
  // is playable even if a previous manual close left a 1-second slot behind.
  const openedTurn = await fetchTurnState({
    programId: config.programId,
    rpc,
    turnId,
  });
  const playableCycle = [
    config.openDurationSeconds,
    config.openDurationSeconds,
    config.openDurationSeconds,
    config.openDurationSeconds,
  ] as const;
  const setCycleInstruction = await createSetTurnDurationCycleInstruction({
    authority,
    programId: config.programId,
    turnDurationCycle: playableCycle,
    turnState: openedTurn.address,
  });
  const setCycleSignature = await simulateAndSend({
    authorityKeypairBytes: config.authorityKeypairBytes,
    instruction: setCycleInstruction,
    rpc,
  });

  return {
    action: "opened_turn",
    openDurationSeconds: config.openDurationSeconds,
    setCycleSignature: setCycleSignature.toString(),
    signature: signature.toString(),
    turnId,
  };
}

/**
 * End the active turn's phase-1 play window immediately by shrinking its
 * duration to the time already elapsed (moving `end_timestamp` — and the
 * proportional rule/guess cutoffs — into the past). The turn stays `Open` so
 * the settlement scheduler runs the full phase-2 pipeline (finalist shortlist
 * → elimination decision window → active-rule election → draw) and issues the
 * real `close_turn` at the end. Returns `settlement_in_progress` when the play
 * window already ended and phase 2 is underway. Falls back to
 * `force_skip_legacy_active_turn` when the active turn is a legacy account the
 * current program cannot deserialize.
 */
export async function closeTurnManually(
  config: ManualControlConfig,
): Promise<ManualControlResult> {
  assertEnabled(config);

  const rpc = createSolanaRpc(config.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.programId,
    rpc,
  });

  if (globalConfig.snapshot.paused) {
    return { action: "paused" };
  }

  if (!globalConfig.snapshot.hasActiveTurn) {
    return { action: "no_active_turn" };
  }

  const authority = deriveAuthorityAddress(config.authorityKeypairBytes);
  const turnId = globalConfig.snapshot.activeTurnId;
  const activeTurn = await fetchTurnState({
    programId: config.programId,
    rpc,
    turnId,
  });

  if (activeTurn.snapshot.status !== "open") {
    return { action: "turn_already_closed", turnId };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds >= activeTurn.snapshot.endTimestamp) {
    // The play window already ended; phase 2 (shortlist → elimination →
    // draw → close) belongs to the settlement scheduler. Do not interfere.
    return { action: "settlement_in_progress", turnId };
  }

  try {
    // Shrink only the active turn's duration slot so future turns keep their
    // configured duration; the per-turn `end_timestamp` is recomputed from
    // `start + slot[cycle_index]`. Using the elapsed time moves the end (and
    // the bps-proportional phase-1 cutoffs) into the past without closing the
    // turn, so the settlement pipeline can start phase 2 right away.
    const elapsedSeconds = Math.max(
      SHRINK_DURATION_SECONDS,
      nowSeconds - activeTurn.snapshot.startTimestamp,
    );
    const shrunkCycle = [...globalConfig.snapshot.turnDurationCycle] as [
      number,
      number,
      number,
      number,
    ];
    shrunkCycle[activeTurn.snapshot.cycleIndex] = elapsedSeconds;
    const shrinkInstruction = await createSetTurnDurationCycleInstruction({
      authority,
      programId: config.programId,
      turnDurationCycle: shrunkCycle,
      turnState: activeTurn.address,
    });
    const signature = await simulateAndSend({
      authorityKeypairBytes: config.authorityKeypairBytes,
      instruction: shrinkInstruction,
      rpc,
    });

    return {
      action: "ended_play_window",
      playWindowSeconds: elapsedSeconds,
      signature: signature.toString(),
      turnId,
    };
  } catch (error) {
    if (!isLegacyTurnDeserializationError(error)) {
      throw error;
    }

    return forceSkipLegacyActiveTurn({
      authority,
      authorityKeypairBytes: config.authorityKeypairBytes,
      programId: config.programId,
      rpc,
      turnId,
      turnState: activeTurn.address,
    });
  }
}

/**
 * ESCAPE HATCH — close the active turn immediately by shrinking its duration
 * to 1 second and calling `close_turn`, SKIPPING the phase-2 pipeline
 * (shortlist, elimination voting, draw). Only for recovering a wedged turn
 * during testing; the normal path is `closeTurnManually` + the settlement
 * scheduler. Falls back to `force_skip_legacy_active_turn` when the active
 * turn is a legacy account the current program cannot deserialize.
 */
export async function forceCloseTurnManually(
  config: ManualControlConfig,
): Promise<ManualControlResult> {
  assertEnabled(config);

  const rpc = createSolanaRpc(config.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.programId,
    rpc,
  });

  if (globalConfig.snapshot.paused) {
    return { action: "paused" };
  }

  if (!globalConfig.snapshot.hasActiveTurn) {
    return { action: "no_active_turn" };
  }

  const authority = deriveAuthorityAddress(config.authorityKeypairBytes);
  const turnId = globalConfig.snapshot.activeTurnId;
  const activeTurn = await fetchTurnState({
    programId: config.programId,
    rpc,
    turnId,
  });

  if (activeTurn.snapshot.status !== "open") {
    return { action: "turn_already_closed", turnId };
  }

  try {
    const shrunkCycle = [...globalConfig.snapshot.turnDurationCycle] as [
      number,
      number,
      number,
      number,
    ];
    shrunkCycle[activeTurn.snapshot.cycleIndex] = SHRINK_DURATION_SECONDS;
    const shrinkInstruction = await createSetTurnDurationCycleInstruction({
      authority,
      programId: config.programId,
      turnDurationCycle: shrunkCycle,
      turnState: activeTurn.address,
    });
    const shrinkSignature = await simulateAndSend({
      authorityKeypairBytes: config.authorityKeypairBytes,
      instruction: shrinkInstruction,
      rpc,
    });

    const closeInstruction = await createCloseTurnInstruction({
      authority,
      programId: config.programId,
      turnState: activeTurn.address,
    });
    const signature = await simulateAndSend({
      authorityKeypairBytes: config.authorityKeypairBytes,
      instruction: closeInstruction,
      rpc,
    });

    return {
      action: "closed_turn",
      shrinkSignature: shrinkSignature.toString(),
      signature: signature.toString(),
      turnId,
    };
  } catch (error) {
    if (!isLegacyTurnDeserializationError(error)) {
      throw error;
    }

    return forceSkipLegacyActiveTurn({
      authority,
      authorityKeypairBytes: config.authorityKeypairBytes,
      programId: config.programId,
      rpc,
      turnId,
      turnState: activeTurn.address,
    });
  }
}

/**
 * TEST-ONLY: repair a stale `global_config` whose on-chain layout predates the
 * current program (which wedges every authority turn instruction). Calls the
 * feature-gated `reinitialize_global_config_for_migration` instruction. The
 * deployed program must have been upgraded with the `devnet-test` feature for
 * this to exist on-chain.
 *
 * The new `next_turn_id` defaults to one past the current/active turn (read via
 * the dual-layout decoder) so it skips any pre-existing turn PDAs; override with
 * `IDEALER_TURN_MANUAL_MIGRATE_NEXT_TURN_ID`.
 */
export async function migrateGlobalConfigManually(
  config: ManualControlConfig,
): Promise<ManualControlResult> {
  assertEnabled(config);

  const rpc = createSolanaRpc(config.rpcUrl);
  const authority = deriveAuthorityAddress(config.authorityKeypairBytes);

  let nextTurnId = config.migrateNextTurnId ?? 1;
  if (config.migrateNextTurnId === null) {
    // Best-effort read of the current counters to avoid colliding with existing
    // turn PDAs. If the account is too corrupt to decode, fall back to 1 and let
    // the operator override via env.
    try {
      const globalConfig = await fetchGlobalConfig({
        programId: config.programId,
        rpc,
      });
      nextTurnId = Math.max(
        globalConfig.snapshot.nextTurnId,
        globalConfig.snapshot.activeTurnId + 1,
        1,
      );
    } catch (error) {
      console.warn(
        "manual migrate: could not decode current global_config, defaulting next_turn_id=1",
        error,
      );
    }
  }

  const globalConfigPda = await getGlobalConfigPda(config.programId);
  const instruction = {
    accounts: [
      { address: authority, role: AccountRole.WRITABLE_SIGNER },
      { address: globalConfigPda, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array([
      ...REINITIALIZE_GLOBAL_CONFIG_DISCRIMINATOR,
      ...u64LeArray(nextTurnId),
    ]),
    programAddress: config.programId,
  };
  const signature = await simulateAndSend({
    authorityKeypairBytes: config.authorityKeypairBytes,
    instruction,
    rpc,
  });

  return {
    action: "migrated_global_config",
    nextTurnId,
    signature: signature.toString(),
  };
}

export function shouldOpenNextTurnAfterManualCycle(
  close: ManualControlResult,
) {
  return close.action === "no_active_turn";
}

function settlementTurnId(close: ManualControlResult) {
  if (
    close.action === "ended_play_window" ||
    close.action === "settlement_in_progress"
  ) {
    return close.turnId;
  }
  return null;
}

export function isRetryableManualCycleError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /HTTP error \(429\): Too Many Requests/i.test(message);
}

export async function completeManualCycleSettlement(
  close: ManualControlResult,
  deps: ManualCycleSettlementDeps,
): Promise<ManualCycleResult> {
  const turnId = settlementTurnId(close);
  if (turnId === null) {
    return { action: "settlement_required", close };
  }

  const deadline = deps.nowMs() + deps.timeoutMs;
  let settlementPasses = 0;
  while (deps.nowMs() < deadline) {
    try {
      await deps.runSettlementPass();
      settlementPasses += 1;

      const state = await deps.readState(turnId);
      if (state.paused) {
        throw new Error(`Manual cycle paused while settling turn ${turnId}.`);
      }
      if (state.hasActiveTurn && state.activeTurnId !== turnId) {
        throw new Error(
          `Manual cycle expected turn ${turnId}, but active turn ${state.activeTurnId} appeared before settlement completed.`,
        );
      }
      if (!state.hasActiveTurn && state.settlementClosed) {
        const open = await deps.openNextTurn();
        if (open.action !== "opened_turn") {
          throw new Error(
            `Manual cycle settled turn ${turnId}, but opening the next turn returned ${open.action}.`,
          );
        }
        return {
          action: "opened_next_turn",
          close,
          open,
          settlementPasses,
        };
      }
    } catch (error) {
      if (!isRetryableManualCycleError(error)) {
        throw error;
      }
    }

    await deps.sleep(MANUAL_CYCLE_POLL_INTERVAL_MS);
  }

  throw new Error(
    `Manual cycle timed out after ${deps.timeoutMs}ms while settling turn ${turnId}; the next turn was not opened.`,
  );
}

/**
 * End phase 1 during testing. When settlement dependencies are provided, drive
 * the real pipeline until the predecessor has written the CLOSED transition
 * and rollover projection, then open the next turn in the same operator call.
 */
export async function cycleTurnManually(
  config: ManualControlConfig,
  settlementDeps?: ManualCycleSettlementDeps,
): Promise<ManualCycleResult> {
  const close = await closeTurnManually(config);
  if (shouldOpenNextTurnAfterManualCycle(close)) {
    const open = await openTurnManually(config);
    return { action: "opened_next_turn", close, open };
  }
  if (settlementDeps) {
    return completeManualCycleSettlement(close, settlementDeps);
  }
  return { action: "settlement_required", close };
}
