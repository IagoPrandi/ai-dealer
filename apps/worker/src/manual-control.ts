/**
 * Manual turn control — TEST-PHASE ONLY.
 *
 * The production worker advances turns automatically on a timer
 * (`turn-automation.ts`). During testing on devnet that means screens stay
 * empty until a turn happens to be open, and closing a turn means waiting out
 * its full duration. This module lets an operator open and close turns on
 * demand instead.
 *
 * It reuses the exact same on-chain instructions as the automatic loop, so the
 * data the UI reads is real devnet state, not a fabricated mock.
 *
 * Closing early: the on-chain `close_turn` requires
 * `clock.unix_timestamp >= turn.end_timestamp` (IdealerError::TurnNotEnded), so
 * a turn cannot be closed before it ends. We work around this for testing by
 * first shrinking the active turn's duration to 1 second via
 * `set_turn_duration_cycle` (which recomputes `end_timestamp = start + 1`,
 * moving it into the past) and only then calling `close_turn`. `open_turn` has
 * no time gate, so opening on demand needs no workaround — but a freshly opened
 * turn inherits whatever duration slot is currently configured (possibly the
 * 1-second value left by a previous manual close), so right after opening we
 * reset the whole cycle to a comfortable, playable duration.
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
  action: "cycled_turn";
  close: ManualControlResult;
  open: ManualControlResult | null;
}

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
 * Close the active turn immediately by shrinking its duration to 1 second
 * (moving `end_timestamp` into the past) and then calling `close_turn`. Falls
 * back to `force_skip_legacy_active_turn` when the active turn is a legacy
 * account the current program cannot deserialize.
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

  try {
    // Shrink only the active turn's duration slot so future turns keep their
    // configured duration; the per-turn `end_timestamp` is recomputed from
    // `start + slot[cycle_index]`, moving it into the past.
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

/**
 * Close the active turn (if any) and immediately open the next one. Handy for
 * advancing the round in a single step during testing.
 */
export async function cycleTurnManually(
  config: ManualControlConfig,
): Promise<ManualCycleResult> {
  const close = await closeTurnManually(config);

  // Only open when the close left no active turn behind.
  const open =
    close.action === "closed_turn" ||
    close.action === "skipped_legacy_turn" ||
    close.action === "no_active_turn"
      ? await openTurnManually(config)
      : null;

  return { action: "cycled_turn", close, open };
}
