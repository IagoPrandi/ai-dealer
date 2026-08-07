import { readFile } from "node:fs/promises";
import bs58 from "bs58";
import { Connection } from "@solana/web3.js";
import {
  AccountRole,
  address,
  appendTransactionMessageInstructions,
  getAddressDecoder,
  getAddressEncoder,
  createKeyPairSignerFromBytes,
  createSolanaRpc,
  createTransactionMessage,
  getBase64EncodedWireTransaction,
  getProgramDerivedAddress,
  setTransactionMessageFeePayerSigner,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
} from "@solana/kit";
import { persistFinalizedTransaction } from "./durable-indexer.js";

const DEFAULT_DEVNET_RPC_URL = "https://api.devnet.solana.com";
const DEFAULT_API_BASE_URL = "http://localhost:3002";
const DEFAULT_TYCHE_PROGRAM_ID =
  "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd";
export const SYSTEM_PROGRAM_ID = address("11111111111111111111111111111111");
export const UPGRADEABLE_LOADER_PROGRAM_ID = address(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);
const OPEN_TURN_DISCRIMINATOR = new Uint8Array([
  78, 206, 19, 149, 237, 34, 191, 82,
]);
const CLOSE_TURN_DISCRIMINATOR = new Uint8Array([
  100, 243, 10, 218, 116, 61, 49, 153,
]);
const FORCE_SKIP_LEGACY_ACTIVE_TURN_DISCRIMINATOR = new Uint8Array([
  167, 139, 165, 45, 22, 50, 176, 166,
]);
const SET_VRF_CONFIG_DISCRIMINATOR = new Uint8Array([
  53, 52, 195, 216, 205, 110, 46, 74,
]);
const SET_TURN_DURATION_CYCLE_DISCRIMINATOR = new Uint8Array([
  163, 41, 240, 31, 94, 126, 122, 36,
]);
const TURN_STATE_DISCRIMINATOR = new Uint8Array([
  184, 240, 193, 137, 151, 216, 79, 187,
]);
const BASIS_POINTS_DENOMINATOR = 10_000;
// Production turn = 24h: ~22h phase 1 (create rules + pick numbers, up to the
// rule-election/guess cutoff) + ~2h phase 2 (finalist shortlist, elimination
// voting, active rule, draw at turn end). Equal slots keep the on-chain 4-slot
// cycle machinery valid (PRD §5.4).
const PRODUCTION_TURN_DURATION_CYCLE_SECONDS = [
  86_400, 86_400, 86_400, 86_400,
] as const;
// Byte length of a current-layout `TurnState` account (8-byte discriminator +
// trustless settlement fields). Turns smaller than this predate the current
// treasury-fee and rollover layout and cannot be
// settled by the current program, so they are force-skipped instead.
const CURRENT_TURN_STATE_DATA_LENGTH = 789;
const addressDecoder = getAddressDecoder();
const addressEncoder = getAddressEncoder();

export type SolanaAddress = ReturnType<typeof address>;

export interface GlobalConfigSnapshot {
  activeTurnId: number;
  authority: SolanaAddress;
  drawVrfConfig: SolanaAddress;
  electionVrfConfig: SolanaAddress;
  guessCutoffBps: number;
  guessSubmissionFeeLamports: bigint;
  hasActiveTurn: boolean;
  nextTurnId: number;
  paused: boolean;
  pendingAuthority: SolanaAddress | null;
  ruleElectionCutoffBps: number;
  ruleProposalFeeLamports: bigint;
  ruleRemovalFeeLamports: bigint | null;
  turnDurationCycle: readonly [number, number, number, number];
  voteFeeLamports: bigint;
}

export interface TurnStateSnapshot {
  cycleIndex: number;
  eliminationWindowEndTimestamp: number;
  endTimestamp: number;
  finalistCount: number;
  finalistRuleIds: number[];
  startTimestamp: number;
  status: "open" | "closed";
  turnDurationSeconds: number;
  turnId: number;
}

export interface TurnAutomationConfig {
  apiBaseUrl?: string | undefined;
  authorityKeypairBytes: null | Uint8Array;
  // When true (settlement automation owns the close), the automation loop opens
  // turns and updates durations but does NOT close ended turns — the settlement
  // scheduler closes them only after the election pipeline + draw complete, so
  // the pipeline (which needs the turn `Open`) is never wedged (M5.2 follow-up).
  deferCloseToSettlement: boolean;
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
      action: "awaiting_previous_settlement";
      turnId: number;
    }
  | {
      action:
        | "active_turn_not_expired"
        | "close_deferred_to_settlement"
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
  if (!env.TYCHE_DEVNET_TURN_DURATION_SCALE_BPS) {
    return null;
  }

  const scaleBps = Number(env.TYCHE_DEVNET_TURN_DURATION_SCALE_BPS);
  if (
    !Number.isInteger(scaleBps) ||
    scaleBps <= 0 ||
    scaleBps > BASIS_POINTS_DENOMINATOR
  ) {
    throw new Error(
      "TYCHE_DEVNET_TURN_DURATION_SCALE_BPS must be an integer between 1 and 10000.",
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
  if (env.TYCHE_TURN_AUTHORITY_KEYPAIR_PATH) {
    const raw = await readFile(env.TYCHE_TURN_AUTHORITY_KEYPAIR_PATH, "utf8");
    return parseAuthorityKeypairBytes(raw);
  }

  if (env.TYCHE_TURN_AUTHORITY_KEYPAIR) {
    return parseAuthorityKeypairBytes(env.TYCHE_TURN_AUTHORITY_KEYPAIR);
  }

  return null;
}

export async function createTurnAutomationConfig(
  env = process.env,
): Promise<TurnAutomationConfig> {
  return {
    apiBaseUrl: env.TYCHE_API_BASE_URL ?? DEFAULT_API_BASE_URL,
    authorityKeypairBytes: await loadAuthorityKeypairBytesFromEnv(env),
    deferCloseToSettlement: envFlag(env.TYCHE_SETTLEMENT_AUTOMATION_ENABLED),
    desiredTurnDurationCycle: resolveDesiredTurnDurationCycle(env),
    enabled: envFlag(env.TYCHE_TURN_AUTOMATION_ENABLED),
    intervalMs: envNumber(env.TYCHE_TURN_AUTOMATION_INTERVAL_MS, 30_000),
    programId: address(
      env.TYCHE_PROGRAM_ID ??
        env.NEXT_PUBLIC_TYCHE_PROGRAM_ID ??
        DEFAULT_TYCHE_PROGRAM_ID,
    ),
    rpcUrl:
      env.TYCHE_SOLANA_RPC_URL ??
      env.NEXT_PUBLIC_SOLANA_RPC_URL ??
      DEFAULT_DEVNET_RPC_URL,
  };
}

type SettlementTransitionResponse = {
  transitions?: unknown;
};

/**
 * A turn may open only after the previous turn's off-chain settlement has
 * reached CLOSED. This includes winner calculation and rollover projection;
 * opening earlier would expose a new round with an empty visible prize pool
 * even though the previous round still owns unallocated lamports.
 */
export async function isTurnSettlementClosed(
  turnId: number,
  apiBaseUrl: string = DEFAULT_API_BASE_URL,
  fetchImpl: typeof fetch = fetch,
) {
  const url = new URL("/settlement-transitions", apiBaseUrl);
  url.searchParams.set("turnId", String(turnId));

  const response = await fetchImpl(url);
  if (!response.ok) {
    throw new Error(
      `Settlement gate could not read turn ${turnId} (HTTP ${response.status}).`,
    );
  }

  const body = (await response.json()) as SettlementTransitionResponse;
  if (!Array.isArray(body.transitions)) {
    throw new Error(`Settlement gate received an invalid response for turn ${turnId}.`);
  }

  return body.transitions.some(
    (transition) =>
      typeof transition === "object" &&
      transition !== null &&
      "toState" in transition &&
      transition.toState === "CLOSED",
  );
}

export interface TurnOpeningGate {
  blockingTurnId: number | null;
  canOpen: boolean;
  code: "PREVIOUS_TURN_SETTLEMENT_PENDING" | "READY_TO_OPEN";
}

export async function getTurnOpeningGate(
  snapshot: Pick<GlobalConfigSnapshot, "hasActiveTurn" | "nextTurnId">,
  apiBaseUrl: string = DEFAULT_API_BASE_URL,
  fetchImpl: typeof fetch = fetch,
): Promise<TurnOpeningGate> {
  if (snapshot.hasActiveTurn || snapshot.nextTurnId <= 1) {
    return { blockingTurnId: null, canOpen: true, code: "READY_TO_OPEN" };
  }

  const previousTurnId = snapshot.nextTurnId - 1;
  const settlementClosed = await isTurnSettlementClosed(
    previousTurnId,
    apiBaseUrl,
    fetchImpl,
  );
  return settlementClosed
    ? { blockingTurnId: null, canOpen: true, code: "READY_TO_OPEN" }
    : {
        blockingTurnId: previousTurnId,
        canOpen: false,
        code: "PREVIOUS_TURN_SETTLEMENT_PENDING",
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
    throw new Error("Account owner does not match the Tyche program.");
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
    readU64BigInt() {
      const value = view.getBigUint64(offset, true);
      offset += 8;
      return value;
    },
    readU64Number() {
      const value = Number(view.getBigUint64(offset, true));
      offset += 8;
      return value;
    },
    readAddress() {
      const value = addressDecoder.decode(
        data.slice(offset, offset + 32),
      ) as SolanaAddress;
      offset += 32;
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
  const authority = reader.readAddress();
  const pendingAuthorityTag = reader.readU8();
  let pendingAuthority: SolanaAddress | null = null;

  if (pendingAuthorityTag === 1) {
    pendingAuthority = reader.readAddress();
  } else if (pendingAuthorityTag !== 0) {
    throw new Error("GlobalConfig pending authority option is invalid.");
  }

  reader.skip(32);
  const drawVrfConfig = reader.readAddress();
  const electionVrfConfig = reader.readAddress();
  const guessSubmissionFeeLamports = reader.readU64BigInt();
  const ruleProposalFeeLamports = reader.readU64BigInt();
  const ruleRemovalFeeLamports = hasRuleRemovalFee
    ? reader.readU64BigInt()
    : null;
  const voteFeeLamports = reader.readU64BigInt();
  reader.skip(2);
  const turnDurationCycle = [
    reader.readU32(),
    reader.readU32(),
    reader.readU32(),
    reader.readU32(),
  ] as const;
  reader.skip(1);
  const ruleElectionCutoffBps = reader.readU16();
  const guessCutoffBps = reader.readU16();
  reader.skip(2 + 1 + 1 + 2 + 2 + 8 + 2 + 2 + 8 + 4 + 4);
  const nextTurnId = reader.readU64Number();
  const activeTurnId = reader.readU64Number();
  const hasActiveTurn = reader.readBool();
  const paused = reader.readBool();

  return {
    activeTurnId,
    authority,
    drawVrfConfig,
    electionVrfConfig,
    guessCutoffBps,
    guessSubmissionFeeLamports,
    hasActiveTurn,
    nextTurnId,
    paused,
    pendingAuthority,
    ruleElectionCutoffBps,
    ruleProposalFeeLamports,
    ruleRemovalFeeLamports,
    turnDurationCycle,
    voteFeeLamports,
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
  const isLegacyLayout = data.length === 780;
  const isCurrentLayout = data.length === CURRENT_TURN_STATE_DATA_LENGTH;
  if (
    (!isLegacyLayout && !isCurrentLayout) ||
    !data
      .subarray(0, TURN_STATE_DISCRIMINATOR.length)
      .every((byte, index) => byte === TURN_STATE_DISCRIMINATOR[index])
  ) {
    throw new Error(
      "TurnState account must use the recognized 780-byte legacy or 789-byte current layout.",
    );
  }
  const reader = createAccountReader(data);
  const turnId = reader.readU64Number();
  const startTimestamp = reader.readI64Number();
  const endTimestamp = reader.readI64Number();
  const statusIndex = reader.readU8();

  if (statusIndex !== 0 && statusIndex !== 1) {
    throw new Error("TurnState status is invalid.");
  }

  // Both layouts contain prize_pool_amount_lamports. The current layout then
  // adds treasury_fee_amount_lamports and treasury_fee_bridged before duration.
  reader.skip(isCurrentLayout ? 17 : 8);
  const turnDurationSeconds = reader.readU32();
  const cycleIndex = reader.readU8();
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const finalistCount = isCurrentLayout ? view.getUint8(261) : 0;
  const finalistRuleIds = isCurrentLayout
    ? Array.from({ length: finalistCount }, (_, index) =>
        Number(view.getBigUint64(262 + index * 8, true)),
      )
    : [];
  const eliminationWindowEndTimestamp = isCurrentLayout
    ? Number(view.getBigInt64(496, true))
    : 0;

  return {
    cycleIndex,
    eliminationWindowEndTimestamp,
    endTimestamp,
    finalistCount,
    finalistRuleIds,
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

function createSetVrfConfigData({
  drawVrfConfig,
  electionVrfConfig,
}: {
  drawVrfConfig: SolanaAddress;
  electionVrfConfig: SolanaAddress;
}) {
  return new Uint8Array([
    ...SET_VRF_CONFIG_DISCRIMINATOR,
    ...addressEncoder.encode(drawVrfConfig),
    ...addressEncoder.encode(electionVrfConfig),
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

export async function createSetVrfConfigInstruction({
  governanceAuthority,
  drawVrfConfig,
  electionVrfConfig,
  programId,
}: {
  governanceAuthority: SolanaAddress;
  drawVrfConfig: SolanaAddress;
  electionVrfConfig: SolanaAddress;
  programId: SolanaAddress;
}) {
  const [globalConfig, [programData]] = await Promise.all([
    getGlobalConfigPda(programId),
    getProgramDerivedAddress({
      programAddress: UPGRADEABLE_LOADER_PROGRAM_ID,
      seeds: [addressEncoder.encode(programId)],
    }),
  ]);

  return {
    accounts: [
      { address: governanceAuthority, role: AccountRole.READONLY_SIGNER },
      { address: globalConfig, role: AccountRole.WRITABLE },
      { address: programData, role: AccountRole.READONLY },
    ],
    data: createSetVrfConfigData({ drawVrfConfig, electionVrfConfig }),
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

/**
 * Sign and simulate an authority instruction without sending it to Solana.
 * Operator preflight uses the same signer, message, and `sigVerify` path as a
 * real action, while leaving all on-chain state unchanged.
 */
export async function simulateAuthorityInstruction({
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

  return simulation.value;
}

/**
 * Simulate an ordered operator sequence without broadcasting it. This is used
 * to review dependent actions, such as opening a turn and then applying its
 * manual test duration, against the same simulated account state.
 */
export async function simulateAuthorityInstructions({
  authorityKeypairBytes,
  instructions,
  rpc,
}: {
  authorityKeypairBytes: Uint8Array;
  instructions: readonly AuthorityInstruction[];
  rpc: RpcClient;
}) {
  if (instructions.length === 0) {
    throw new Error("Authority simulation requires at least one instruction.");
  }

  const authority = await createKeyPairSignerFromBytes(authorityKeypairBytes);
  const latestBlockhash = await rpc
    .getLatestBlockhash({ commitment: "confirmed" })
    .send();
  const message = appendTransactionMessageInstructions(
    instructions,
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

  return simulation.value;
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
  await persistFinalizedTransaction({
    cluster: "devnet",
    connection: new Connection(
      process.env.TYCHE_SOLANA_RPC_URL ?? DEFAULT_DEVNET_RPC_URL,
      "finalized",
    ),
    eventKind: "turn_automation.authority_instruction",
    payload: {
      accountCount: instruction.accounts.length,
      instructionDataHex: Buffer.from(instruction.data).toString("hex"),
      programId: instruction.programAddress.toString(),
    },
    signature: signature.toString(),
  });
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
      "Turn automation is enabled but TYCHE_TURN_AUTHORITY_KEYPAIR or TYCHE_TURN_AUTHORITY_KEYPAIR_PATH is not set.",
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
    const previousTurnId = turnId - 1;
    if (
      previousTurnId > 0 &&
      !(await isTurnSettlementClosed(previousTurnId, config.apiBaseUrl))
    ) {
      return { action: "awaiting_previous_settlement", turnId: previousTurnId };
    }
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

  // A turn whose account predates the trustless layout cannot be closed or
  // settled by the current program (it fails to deserialize on-chain), so it
  // would otherwise wedge the loop forever. Force-skip it up front — before the
  // duration-cycle and close branches — regardless of expiry (M5.2 follow-up).
  if (activeTurn.dataLength < CURRENT_TURN_STATE_DATA_LENGTH) {
    const recoveryInstruction = await createForceSkipLegacyActiveTurnInstruction({
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

  // The settlement scheduler owns the close so the election pipeline (which
  // requires the turn to stay `Open`) completes first. Leave the ended turn
  // open for it (M5.2 follow-up).
  if (config.deferCloseToSettlement) {
    return {
      action: "close_deferred_to_settlement",
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
