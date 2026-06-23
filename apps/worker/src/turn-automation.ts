import { readFile } from "node:fs/promises";
import bs58 from "bs58";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  getAddressDecoder,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";

const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_IDEALER_PROGRAM_ID =
  "6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4";
export const SYSTEM_PROGRAM_ID = address("11111111111111111111111111111111");
const OPEN_TURN_DISCRIMINATOR = new Uint8Array([
  78, 206, 19, 149, 237, 34, 191, 82,
]);
const CLOSE_TURN_DISCRIMINATOR = new Uint8Array([
  100, 243, 10, 218, 116, 61, 49, 153,
]);
const FORCE_SKIP_LEGACY_ACTIVE_TURN_DISCRIMINATOR = new Uint8Array([
  167, 139, 165, 45, 22, 50, 176, 166,
]);
const SET_TURN_DURATION_CYCLE_DISCRIMINATOR = new Uint8Array([
  163, 41, 240, 31, 94, 126, 122, 36,
]);
const BASIS_POINTS_DENOMINATOR = 10_000;
const PRODUCTION_TURN_DURATION_CYCLE_SECONDS = [
  7_200, 7_200, 28_800, 28_800,
] as const;
const CURRENT_TURN_STATE_DATA_LENGTH = 448;
const addressDecoder = getAddressDecoder();

export type SolanaAddress = ReturnType<typeof address>;

export interface GlobalConfigSnapshot {
  activeTurnId: number;
  hasActiveTurn: boolean;
  nextTurnId: number;
  paused: boolean;
  turnDurationCycle: readonly [number, number, number, number];
}

export interface TurnStateSnapshot {
  cycleIndex: number;
  endTimestamp: number;
  startTimestamp: number;
  status: "open" | "closed";
  turnDurationSeconds: number;
  turnId: number;
}

export interface TurnAutomationConfig {
  authorityKeypairBytes: null | Uint8Array;
  desiredTurnDurationCycle: null | readonly [number, number, number, number];
  enabled: boolean;
  intervalMs: number;
  programId: SolanaAddress;
  rpcUrl: string;
}

export type TurnAutomationResult =
  | {
      action: "closed_turn" | "opened_turn";
      signature: string;
      turnId: number;
    }
  | {
      action: "skipped_legacy_turn";
      signature: string;
      turnId: number;
    }
  | {
      action: "updated_duration_cycle";
      signature: string;
      turnId: number;
    }
  | {
      action:
        | "active_turn_not_expired"
        | "disabled"
        | "paused"
        | "turn_already_closed";
      turnId?: number;
    };

export function stringifySimulationError(error: unknown) {
  return JSON.stringify(error, (_key, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value,
  );
}

export function isLegacyTurnDeserializationError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.includes("AccountDidNotDeserialize") &&
    error.message.includes("account: turn_state")
  );
}

type AccountInfoResult = {
  value: null | {
    data: readonly [string, string] | string;
    owner: string;
  };
};

export type RpcClient = ReturnType<typeof createSolanaRpc>;

function envFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function envNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function resolveDesiredTurnDurationCycle(env: NodeJS.ProcessEnv) {
  if (!env.IDEALER_DEVNET_TURN_DURATION_SCALE_BPS) {
    return null;
  }

  const scaleBps = Number(env.IDEALER_DEVNET_TURN_DURATION_SCALE_BPS);
  if (
    !Number.isInteger(scaleBps) ||
    scaleBps <= 0 ||
    scaleBps > BASIS_POINTS_DENOMINATOR
  ) {
    throw new Error(
      "IDEALER_DEVNET_TURN_DURATION_SCALE_BPS must be an integer between 1 and 10000.",
    );
  }

  return PRODUCTION_TURN_DURATION_CYCLE_SECONDS.map((duration) =>
    Math.max(
      1,
      Math.floor((duration * scaleBps) / BASIS_POINTS_DENOMINATOR),
    ),
  ) as [number, number, number, number];
}

function assertKeypairByteArray(value: unknown): asserts value is number[] {
  if (
    !Array.isArray(value) ||
    value.length !== 64 ||
    !value.every(
      (byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255,
    )
  ) {
    throw new Error(
      "Authority keypair must be a 64-byte Solana keypair JSON array or base58-encoded 64-byte secret key.",
    );
  }
}

function u64Le(value: number) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

export function u64LeArray(value: number) {
  return Array.from(u64Le(value));
}

function u32LeArray(value: number) {
  const bytes = new Uint8Array(4);
  new DataView(bytes.buffer).setUint32(0, value, true);
  return Array.from(bytes);
}

function parseAuthorityKeypairBytes(raw: string) {
  const trimmed = raw.trim();

  if (trimmed.startsWith("[")) {
    const parsed = JSON.parse(trimmed) as unknown;
    assertKeypairByteArray(parsed);
    return Uint8Array.from(parsed);
  }

  try {
    const decoded = bs58.decode(trimmed);
    assertKeypairByteArray([...decoded]);
    return decoded;
  } catch {
    throw new Error(
      "Authority keypair must be a 64-byte Solana keypair JSON array or base58-encoded 64-byte secret key.",
    );
  }
}

export async function loadAuthorityKeypairBytesFromEnv(env = process.env) {
  if (env.IDEALER_TURN_AUTHORITY_KEYPAIR_PATH) {
    const raw = await readFile(env.IDEALER_TURN_AUTHORITY_KEYPAIR_PATH, "utf8");
    return parseAuthorityKeypairBytes(raw);
  }

  if (env.IDEALER_TURN_AUTHORITY_KEYPAIR) {
    return parseAuthorityKeypairBytes(env.IDEALER_TURN_AUTHORITY_KEYPAIR);
  }

  return null;
}

export async function createTurnAutomationConfig(
  env = process.env,
): Promise<TurnAutomationConfig> {
  return {
    authorityKeypairBytes: await loadAuthorityKeypairBytesFromEnv(env),
    desiredTurnDurationCycle: resolveDesiredTurnDurationCycle(env),
    enabled: envFlag(env.IDEALER_TURN_AUTOMATION_ENABLED),
    intervalMs: envNumber(env.IDEALER_TURN_AUTOMATION_INTERVAL_MS, 30_000),
    programId: address(
      env.IDEALER_PROGRAM_ID ??
        env.NEXT_PUBLIC_IDEALER_PROGRAM_ID ??
        DEFAULT_IDEALER_PROGRAM_ID,
    ),
    rpcUrl:
      env.IDEALER_SOLANA_RPC_URL ??
      env.NEXT_PUBLIC_SOLANA_RPC_URL ??
      DEFAULT_DEVNET_RPC_URL,
  };
}

function getAccountDataBase64(
  account: AccountInfoResult["value"],
  expectedOwner: SolanaAddress,
) {
  if (!account) {
    throw new Error("Account was not found on devnet.");
  }

  if (account.owner !== expectedOwner.toString()) {
    throw new Error("Account owner does not match the Idealer program.");
  }

  if (Array.isArray(account.data) && typeof account.data[0] === "string") {
    return account.data[0];
  }

  if (typeof account.data === "string") {
    return account.data;
  }

  throw new Error("RPC account data was not base64 encoded.");
}

async function fetchProgramAccountData({
  account,
  programId,
  rpc,
}: {
  account: SolanaAddress;
  programId: SolanaAddress;
  rpc: RpcClient;
}) {
  const result = (await rpc
    .getAccountInfo(account, {
      commitment: "confirmed",
      encoding: "base64",
    })
    .send()) as AccountInfoResult;

  return Uint8Array.from(
    Buffer.from(getAccountDataBase64(result.value, programId), "base64"),
  );
}

function createAccountReader(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 8;

  return {
    readBool() {
      return this.readU8() !== 0;
    },
    readI64Number() {
      const value = Number(view.getBigInt64(offset, true));
      offset += 8;
      return value;
    },
    readU8() {
      const value = view.getUint8(offset);
      offset += 1;
      return value;
    },
    readU16() {
      const value = view.getUint16(offset, true);
      offset += 2;
      return value;
    },
    readU32() {
      const value = view.getUint32(offset, true);
      offset += 4;
      return value;
    },
    readU64Number() {
      const value = Number(view.getBigUint64(offset, true));
      offset += 8;
      return value;
    },
    skip(bytes: number) {
      offset += bytes;
    },
  };
}

function isPlausibleGlobalConfig(snapshot: GlobalConfigSnapshot) {
  if (
    snapshot.turnDurationCycle.some(
      (duration) => duration <= 0 || duration > 31_536_000,
    )
  ) {
    return false;
  }

  if (!snapshot.hasActiveTurn) {
    return snapshot.activeTurnId === 0;
  }

  return (
    snapshot.activeTurnId > 0 &&
    snapshot.nextTurnId >= snapshot.activeTurnId &&
    snapshot.nextTurnId - snapshot.activeTurnId < 10_000
  );
}

function decodeGlobalConfigAccountWithLayout(
  data: Uint8Array,
  hasRuleRemovalFee: boolean,
): GlobalConfigSnapshot {
  const reader = createAccountReader(data);
  reader.skip(32);
  const pendingAuthorityTag = reader.readU8();

  if (pendingAuthorityTag === 1) {
    reader.skip(32);
  } else if (pendingAuthorityTag !== 0) {
    throw new Error("GlobalConfig pending authority option is invalid.");
  }

  reader.skip(32 * 3);
  // guess_submission + rule_proposal + [rule_removal] + vote fees.
  reader.skip(8 + 8 + (hasRuleRemovalFee ? 8 : 0) + 8);
  reader.skip(2);
  const turnDurationCycle = [
    reader.readU32(),
    reader.readU32(),
    reader.readU32(),
    reader.readU32(),
  ] as const;
  reader.skip(1);
  reader.readU16();
  reader.readU16();
  reader.skip(2 + 1 + 1 + 2 + 2 + 8 + 2 + 2 + 8 + 4 + 4);
  const nextTurnId = reader.readU64Number();
  const activeTurnId = reader.readU64Number();
  const hasActiveTurn = reader.readBool();
  const paused = reader.readBool();

  return {
    activeTurnId,
    hasActiveTurn,
    nextTurnId,
    paused,
    turnDurationCycle,
  };
}

// The current program adds `rule_removal_fee_lamports` to `GlobalConfig`; older
// devnet accounts predate it. Decode with the current layout first and fall
// back to the legacy layout, mirroring the web decoder, so the worker reads the
// account correctly both before and after a migration.
export function decodeGlobalConfigAccount(
  data: Uint8Array,
): GlobalConfigSnapshot {
  const current = decodeGlobalConfigAccountWithLayout(data, true);
  if (isPlausibleGlobalConfig(current)) {
    return current;
  }

  const legacy = decodeGlobalConfigAccountWithLayout(data, false);
  if (isPlausibleGlobalConfig(legacy)) {
    return legacy;
  }

  throw new Error("GlobalConfig layout could not be decoded safely.");
}

export function decodeTurnStateAccount(data: Uint8Array): TurnStateSnapshot {
  const reader = createAccountReader(data);
  const turnId = reader.readU64Number();
  const startTimestamp = reader.readI64Number();
  const endTimestamp = reader.readI64Number();
  const statusIndex = reader.readU8();

  if (statusIndex !== 0 && statusIndex !== 1) {
    throw new Error("TurnState status is invalid.");
  }

  reader.skip(8);
  const turnDurationSeconds = reader.readU32();
  const cycleIndex = reader.readU8();

  return {
    cycleIndex,
    endTimestamp,
    startTimestamp,
    status: statusIndex === 0 ? "open" : "closed",
    turnDurationSeconds,
    turnId,
  };
}

async function derivePda({
  programId,
  seeds,
}: {
  programId: SolanaAddress;
  seeds: Parameters<typeof getProgramDerivedAddress>[0]["seeds"];
}) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: programId,
    seeds,
  });
  return pda;
}

export async function getGlobalConfigPda(programId: SolanaAddress) {
  return derivePda({ programId, seeds: ["global_config"] });
}

async function getTurnStatePda({
  programId,
  turnId,
}: {
  programId: SolanaAddress;
  turnId: number;
}) {
  return derivePda({ programId, seeds: ["turn", u64Le(turnId)] });
}

async function getPrizeVaultPda({
  programId,
  turnId,
}: {
  programId: SolanaAddress;
  turnId: number;
}) {
  return derivePda({ programId, seeds: ["prize_vault", u64Le(turnId)] });
}

export function deriveAuthorityAddress(authorityKeypairBytes: Uint8Array) {
  return addressDecoder.decode(authorityKeypairBytes.slice(32, 64));
}

export async function fetchGlobalConfig({
  programId,
  rpc,
}: {
  programId: SolanaAddress;
  rpc: RpcClient;
}) {
  const globalConfig = await getGlobalConfigPda(programId);
  const data = await fetchProgramAccountData({
    account: globalConfig,
    programId,
    rpc,
  });
  return {
    address: globalConfig,
    snapshot: decodeGlobalConfigAccount(data),
  };
}

export async function fetchTurnState({
  programId,
  rpc,
  turnId,
}: {
  programId: SolanaAddress;
  rpc: RpcClient;
  turnId: number;
}) {
  const turnState = await getTurnStatePda({ programId, turnId });
  const data = await fetchProgramAccountData({
    account: turnState,
    programId,
    rpc,
  });
  return {
    address: turnState,
    dataLength: data.length,
    snapshot: decodeTurnStateAccount(data),
  };
}

function createOpenTurnData(turnId: number) {
  return new Uint8Array([...OPEN_TURN_DISCRIMINATOR, ...u64LeArray(turnId)]);
}

function createSetTurnDurationCycleData(
  turnDurationCycle: readonly [number, number, number, number],
) {
  return new Uint8Array([
    ...SET_TURN_DURATION_CYCLE_DISCRIMINATOR,
    ...turnDurationCycle.flatMap((duration) => u32LeArray(duration)),
  ]);
}

function turnDurationCyclesEqual(
  left: readonly [number, number, number, number],
  right: readonly [number, number, number, number],
) {
  return left.every((duration, index) => duration === right[index]);
}

export async function createOpenTurnInstruction({
  authority,
  programId,
  turnId,
}: {
  authority: SolanaAddress;
  programId: SolanaAddress;
  turnId: number;
}) {
  const [globalConfig, turnState, prizeVault] = await Promise.all([
    getGlobalConfigPda(programId),
    getTurnStatePda({ programId, turnId }),
    getPrizeVaultPda({ programId, turnId }),
  ]);

  return {
    accounts: [
      { address: authority, role: AccountRole.WRITABLE_SIGNER },
      { address: globalConfig, role: AccountRole.WRITABLE },
      { address: turnState, role: AccountRole.WRITABLE },
      { address: prizeVault, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: createOpenTurnData(turnId),
    programAddress: programId,
  };
}

export async function createSetTurnDurationCycleInstruction({
  authority,
  programId,
  turnDurationCycle,
  turnState,
}: {
  authority: SolanaAddress;
  programId: SolanaAddress;
  turnDurationCycle: readonly [number, number, number, number];
  turnState: SolanaAddress;
}) {
  const globalConfig = await getGlobalConfigPda(programId);

  return {
    accounts: [
      { address: authority, role: AccountRole.READONLY_SIGNER },
      { address: globalConfig, role: AccountRole.WRITABLE },
      { address: turnState, role: AccountRole.WRITABLE },
    ],
    data: createSetTurnDurationCycleData(turnDurationCycle),
    programAddress: programId,
  };
}

export async function createCloseTurnInstruction({
  authority,
  programId,
  turnState,
}: {
  authority: SolanaAddress;
  programId: SolanaAddress;
  turnState: SolanaAddress;
}) {
  const globalConfig = await getGlobalConfigPda(programId);

  return {
    accounts: [
      { address: authority, role: AccountRole.READONLY_SIGNER },
      { address: globalConfig, role: AccountRole.WRITABLE },
      { address: turnState, role: AccountRole.WRITABLE },
    ],
    data: CLOSE_TURN_DISCRIMINATOR,
    programAddress: programId,
  };
}

export async function createForceSkipLegacyActiveTurnInstruction({
  authority,
  programId,
  turnState,
}: {
  authority: SolanaAddress;
  programId: SolanaAddress;
  turnState: SolanaAddress;
}) {
  const globalConfig = await getGlobalConfigPda(programId);

  return {
    accounts: [
      { address: authority, role: AccountRole.READONLY_SIGNER },
      { address: globalConfig, role: AccountRole.WRITABLE },
      { address: turnState, role: AccountRole.READONLY },
    ],
    data: FORCE_SKIP_LEGACY_ACTIVE_TURN_DISCRIMINATOR,
    programAddress: programId,
  };
}

export interface AuthorityInstruction {
  accounts: { address: SolanaAddress; role: AccountRole }[];
  data: Uint8Array;
  programAddress: SolanaAddress;
}

export async function simulateAndSend({
  authorityKeypairBytes,
  instruction,
  rpc,
}: {
  authorityKeypairBytes: Uint8Array;
  instruction: AuthorityInstruction;
  rpc: RpcClient;
}) {
  const authority = await createKeyPairSignerFromBytes(authorityKeypairBytes);
  const latestBlockhash = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = appendTransactionMessageInstructions(
    [instruction],
    setTransactionMessageLifetimeUsingBlockhash(
      latestBlockhash.value,
      setTransactionMessageFeePayerSigner(
        authority,
        createTransactionMessage({ version: 0 }),
      ),
    ),
  );

  const signedTransaction = await signTransactionMessageWithSigners(message);
  const wireTransaction = getBase64EncodedWireTransaction(signedTransaction);
  const simulation = await rpc
    .simulateTransaction(wireTransaction, {
      commitment: "confirmed",
      encoding: "base64",
      sigVerify: true,
    })
    .send();

  if (simulation.value.err) {
    throw new Error(
      `Turn automation transaction simulation failed: ${stringifySimulationError(
        simulation.value.err,
      )}; logs=${stringifySimulationError(simulation.value.logs ?? [])}`,
    );
  }

  const signature = await rpc
    .sendTransaction(wireTransaction, {
      encoding: "base64",
      maxRetries: 3n,
      preflightCommitment: "confirmed",
      skipPreflight: false,
    })
    .send();
  await waitForSignatureConfirmation(rpc, signature.toString());
  return signature;
}

async function waitForSignatureConfirmation(
  rpc: RpcClient,
  signature: string,
) {
  const deadline = Date.now() + 60_000;

  while (Date.now() < deadline) {
    const result = await rpc
      .getSignatureStatuses([signature as never], {
        searchTransactionHistory: true,
      })
      .send();
    const status = result.value[0];

    if (status?.err) {
      throw new Error(
        `Turn automation transaction ${signature} failed after send: ${stringifySimulationError(
          status.err,
        )}`,
      );
    }

    if (
      status?.confirmationStatus === "confirmed" ||
      status?.confirmationStatus === "finalized"
    ) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `Turn automation transaction ${signature} was not confirmed within 60s.`,
  );
}

export async function runTurnAutomationOnce(
  config: TurnAutomationConfig,
): Promise<TurnAutomationResult> {
  if (!config.enabled) {
    return { action: "disabled" };
  }

  if (!config.authorityKeypairBytes) {
    throw new Error(
      "Turn automation is enabled but IDEALER_TURN_AUTHORITY_KEYPAIR or IDEALER_TURN_AUTHORITY_KEYPAIR_PATH is not set.",
    );
  }

  const rpc = createSolanaRpc(config.rpcUrl);
  const globalConfig = await fetchGlobalConfig({
    programId: config.programId,
    rpc,
  });

  if (globalConfig.snapshot.paused) {
    return { action: "paused" };
  }

  const authority = addressDecoder.decode(
    config.authorityKeypairBytes.slice(32, 64),
  );

  if (!globalConfig.snapshot.hasActiveTurn) {
    const turnId = globalConfig.snapshot.nextTurnId;
    const instruction = await createOpenTurnInstruction({
      authority,
      programId: config.programId,
      turnId,
    });
    const signature = await simulateAndSend({
      authorityKeypairBytes: config.authorityKeypairBytes,
      instruction,
      rpc,
    });
    return { action: "opened_turn", signature: signature.toString(), turnId };
  }

  const activeTurn = await fetchTurnState({
    programId: config.programId,
    rpc,
    turnId: globalConfig.snapshot.activeTurnId,
  });

  if (
    config.desiredTurnDurationCycle &&
    activeTurn.dataLength >= CURRENT_TURN_STATE_DATA_LENGTH &&
    !turnDurationCyclesEqual(
      globalConfig.snapshot.turnDurationCycle,
      config.desiredTurnDurationCycle,
    )
  ) {
    const instruction = await createSetTurnDurationCycleInstruction({
      authority,
      programId: config.programId,
      turnDurationCycle: config.desiredTurnDurationCycle,
      turnState: activeTurn.address,
    });
    const signature = await simulateAndSend({
      authorityKeypairBytes: config.authorityKeypairBytes,
      instruction,
      rpc,
    });
    return {
      action: "updated_duration_cycle",
      signature: signature.toString(),
      turnId: activeTurn.snapshot.turnId,
    };
  }

  if (activeTurn.snapshot.status !== "open") {
    return {
      action: "turn_already_closed",
      turnId: activeTurn.snapshot.turnId,
    };
  }

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (nowSeconds < activeTurn.snapshot.endTimestamp) {
    return {
      action: "active_turn_not_expired",
      turnId: activeTurn.snapshot.turnId,
    };
  }

  const instruction = await createCloseTurnInstruction({
    authority,
    programId: config.programId,
    turnState: activeTurn.address,
  });
  let signature;
  try {
    signature = await simulateAndSend({
      authorityKeypairBytes: config.authorityKeypairBytes,
      instruction,
      rpc,
    });
  } catch (error) {
    if (!isLegacyTurnDeserializationError(error)) {
      throw error;
    }

    const recoveryInstruction =
      await createForceSkipLegacyActiveTurnInstruction({
        authority,
        programId: config.programId,
        turnState: activeTurn.address,
      });
    const recoverySignature = await simulateAndSend({
      authorityKeypairBytes: config.authorityKeypairBytes,
      instruction: recoveryInstruction,
      rpc,
    });
    return {
      action: "skipped_legacy_turn",
      signature: recoverySignature.toString(),
      turnId: activeTurn.snapshot.turnId,
    };
  }
  return {
    action: "closed_turn",
    signature: signature.toString(),
    turnId: activeTurn.snapshot.turnId,
  };
}

export function startTurnAutomationLoop(config: TurnAutomationConfig) {
  if (!config.enabled) {
    return null;
  }

  let running = false;
  const logResult = (result: TurnAutomationResult) => {
    if (
      result.action === "closed_turn" ||
      result.action === "opened_turn" ||
      result.action === "skipped_legacy_turn" ||
      result.action === "updated_duration_cycle"
    ) {
      console.log(
        `turn automation ${result.action} turn=${result.turnId} signature=${result.signature}`,
      );
    }
  };

  const run = async () => {
    if (running) {
      return;
    }

    running = true;
    try {
      const result = await runTurnAutomationOnce(config);
      logResult(result);

      if (
        result.action === "closed_turn" ||
        result.action === "skipped_legacy_turn" ||
        result.action === "updated_duration_cycle"
      ) {
        logResult(await runTurnAutomationOnce(config));
      }
    } catch (error) {
      console.error("turn automation failed", error);
    } finally {
      running = false;
    }
  };

  void run();
  return setInterval(() => {
    void run();
  }, config.intervalMs);
}
