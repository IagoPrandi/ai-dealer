"use client";

import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

export const IDEALER_PROGRAM_ID = address(
  process.env.NEXT_PUBLIC_IDEALER_PROGRAM_ID ??
    "6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4",
);
export const IDEALER_ACTIVE_TURN_ID = Number(
  process.env.NEXT_PUBLIC_IDEALER_ACTIVE_TURN_ID ?? "1",
);
export const SYSTEM_PROGRAM_ID = address("11111111111111111111111111111111");

const SUBMIT_GUESS_DISCRIMINATOR = new Uint8Array([
  61, 124, 32, 227, 64, 198, 252, 3,
]);
const PROPOSE_RULE_DISCRIMINATOR = new Uint8Array([
  14, 35, 67, 184, 137, 188, 125, 233,
]);
const VOTE_RULE_DISCRIMINATOR = new Uint8Array([
  40, 87, 133, 249, 114, 164, 242, 183,
]);
const addressEncoder = getAddressEncoder();
const textEncoder = new TextEncoder();

export interface SubmitGuessAccounts {
  gameToken: ReturnType<typeof address>;
  globalConfig: ReturnType<typeof address>;
  playerGuess: ReturnType<typeof address>;
  prizeVault: ReturnType<typeof address>;
  treasuryVault: ReturnType<typeof address>;
  turnState: ReturnType<typeof address>;
}

export interface GuessReceipt {
  gameToken: string;
  numbers: readonly number[];
  player: string;
  playerGuess: string;
  programId: string;
  signature: string;
  submittedAt: string;
  turnId: number;
}

export interface GlobalConfigSnapshot {
  activeTurnId: number;
  guessCutoffBps: number;
  guessSubmissionFeeLamports: bigint;
  hasActiveTurn: boolean;
  nextTurnId: number;
  paused: boolean;
  ruleElectionCutoffBps: number;
}

export interface TurnStateSnapshot {
  endTimestamp: number;
  startTimestamp: number;
  status: "open" | "closed";
  turnId: number;
}

export interface ActiveTurnSnapshot {
  globalConfig: GlobalConfigSnapshot;
  globalConfigAddress: ReturnType<typeof address>;
  turnState: null | TurnStateSnapshot;
  turnStateAddress: null | ReturnType<typeof address>;
}

export interface RulePreflightResult {
  addedOperationalClauses: string[];
  clarityNote: string;
  // Compile-gate verdict: the rule is only proposable when decision === "VALID".
  compiledArtifactHash?: string | null;
  decision?: "VALID" | "INVALID";
  dealerMessage: string;
  difficultyClass?: string;
  finalConfidence?: number;
  maxTokens: number;
  needsClarification: boolean;
  normalizedText: string;
  normalizedTextHash: readonly number[];
  officialInterpretation: string;
  officialInterpretationHash: readonly number[];
  preflightResultHash: readonly number[];
  reasonSummary?: string;
  ruleId: number;
  ruleMode?: "predicate" | "ranking";
  sanitizedText: string;
  sanitizedTextHash: readonly number[];
  tokenCount: number;
}

export interface RuleProposalReceipt extends RulePreflightResult {
  proposer: string;
  ruleProposal: string;
  signature: string;
  submittedAt: string;
  turnId: number;
}

export interface RuleVoteReceipt {
  ruleId: number;
  ruleProposal: string;
  ruleVote: string;
  signature: string;
  submittedAt: string;
  turnId: number;
  voter: string;
}

function u64Le(value: number) {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setBigUint64(0, BigInt(value), true);
  return bytes;
}

async function derivePda(
  seeds: Parameters<typeof getProgramDerivedAddress>[0]["seeds"],
) {
  const [pda] = await getProgramDerivedAddress({
    programAddress: IDEALER_PROGRAM_ID,
    seeds,
  });
  return pda;
}

type AccountInfoResult = {
  value: null | {
    data: readonly [string, string] | string;
    owner: string;
  };
};

type AccountInfoRpcReader = {
  runtime: {
    rpc: {
      getAccountInfo: (
        account: ReturnType<typeof address>,
        config: { commitment: "confirmed"; encoding: "base64" },
      ) => { send: () => Promise<AccountInfoResult> };
    };
  };
};

function pushU16Le(bytes: number[], value: number) {
  bytes.push(value & 0xff, (value >> 8) & 0xff);
}

function pushU32Le(bytes: number[], value: number) {
  bytes.push(
    value & 0xff,
    (value >> 8) & 0xff,
    (value >> 16) & 0xff,
    (value >> 24) & 0xff,
  );
}

function pushU64Le(bytes: number[], value: number) {
  const encoded = u64Le(value);
  bytes.push(...encoded);
}

function assertHashBytes(name: string, value: readonly number[]) {
  if (
    value.length !== 32 ||
    !value.every((byte) => Number.isInteger(byte) && byte >= 0 && byte <= 255)
  ) {
    throw new Error(`${name} must be a 32-byte hash.`);
  }
}

function decodeBase64(value: string) {
  const binary = globalThis.atob(value);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function getAccountDataBase64(account: AccountInfoResult["value"]) {
  if (!account) {
    throw new Error("Account was not found on devnet.");
  }

  if (account.owner !== IDEALER_PROGRAM_ID.toString()) {
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

async function fetchProgramAccountData(
  client: AccountInfoRpcReader,
  account: ReturnType<typeof address>,
) {
  const result = await client.runtime.rpc
    .getAccountInfo(account, {
      commitment: "confirmed",
      encoding: "base64",
    })
    .send();

  return decodeBase64(getAccountDataBase64(result.value));
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
    skip(bytes: number) {
      offset += bytes;
    },
  };
}

export function decodeGlobalConfigAccount(data: Uint8Array): GlobalConfigSnapshot {
  const reader = createAccountReader(data);
  reader.skip(32);
  const pendingAuthorityTag = reader.readU8();

  if (pendingAuthorityTag === 1) {
    reader.skip(32);
  } else if (pendingAuthorityTag !== 0) {
    throw new Error("GlobalConfig pending authority option is invalid.");
  }

  reader.skip(32 * 3);
  const guessSubmissionFeeLamports = reader.readU64BigInt();
  reader.skip(8 + 8);
  reader.skip(2);
  reader.skip(4 * 4);
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
    guessCutoffBps,
    guessSubmissionFeeLamports,
    hasActiveTurn,
    nextTurnId,
    paused,
    ruleElectionCutoffBps,
  };
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

  return {
    endTimestamp,
    startTimestamp,
    status: statusIndex === 0 ? "open" : "closed",
    turnId,
  };
}

export function getActionCutoffTimestamp({
  cutoffBps,
  turn,
}: {
  cutoffBps: number;
  turn: TurnStateSnapshot;
}) {
  const duration = turn.endTimestamp - turn.startTimestamp;
  return turn.startTimestamp + Math.floor((duration * cutoffBps) / 10_000);
}

export function getTurnActionReadiness({
  cutoffBps,
  globalConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
  turn,
}: {
  cutoffBps: number;
  globalConfig: GlobalConfigSnapshot;
  nowSeconds?: number;
  turn: null | TurnStateSnapshot;
}) {
  if (globalConfig.paused) {
    return {
      code: "PROTOCOL_PAUSED",
      message: "The devnet program is paused.",
      ok: false,
    } as const;
  }

  if (!globalConfig.hasActiveTurn || globalConfig.activeTurnId <= 0) {
    return {
      code: "NO_ACTIVE_TURN",
      message: "There is no active devnet turn. Open a turn before submitting.",
      ok: false,
    } as const;
  }

  if (!turn) {
    return {
      code: "DEVNET_TURN_NOT_READY",
      message: "The active devnet turn account does not exist yet.",
      ok: false,
    } as const;
  }

  if (turn.turnId !== globalConfig.activeTurnId) {
    return {
      code: "DEVNET_TURN_MISMATCH",
      message: "The active devnet turn does not match the loaded turn account.",
      ok: false,
    } as const;
  }

  if (turn.status !== "open") {
    return {
      code: "TURN_CLOSED",
      message: "This devnet turn is closed. Open the next turn before submitting.",
      ok: false,
    } as const;
  }

  if (nowSeconds < turn.startTimestamp) {
    return {
      code: "TURN_NOT_OPEN",
      message: "This devnet turn has not started yet.",
      ok: false,
    } as const;
  }

  if (nowSeconds >= turn.endTimestamp) {
    return {
      code: "TURN_ENDED",
      message:
        "This devnet turn has ended. Close it and open the next turn before submitting.",
      ok: false,
    } as const;
  }

  const cutoffTimestamp = getActionCutoffTimestamp({ cutoffBps, turn });
  if (nowSeconds >= cutoffTimestamp) {
    return {
      code: "ACTION_WINDOW_CLOSED",
      message:
        "This devnet turn already passed its action cutoff. Close it and open the next turn before submitting.",
      ok: false,
    } as const;
  }

  return { ok: true } as const;
}

export async function fetchActiveTurnSnapshot(
  client: AccountInfoRpcReader,
): Promise<ActiveTurnSnapshot> {
  const globalConfigAddress = await derivePda(["global_config"]);
  const globalConfig = decodeGlobalConfigAccount(
    await fetchProgramAccountData(client, globalConfigAddress),
  );

  if (!globalConfig.hasActiveTurn || globalConfig.activeTurnId <= 0) {
    return {
      globalConfig,
      globalConfigAddress,
      turnState: null,
      turnStateAddress: null,
    };
  }

  const turnSeed = u64Le(globalConfig.activeTurnId);
  const turnStateAddress = await derivePda(["turn", turnSeed]);
  const turnState = decodeTurnStateAccount(
    await fetchProgramAccountData(client, turnStateAddress),
  );

  return {
    globalConfig,
    globalConfigAddress,
    turnState,
    turnStateAddress,
  };
}

export async function deriveSubmitGuessAccounts({
  player,
  turnId,
}: {
  player: ReturnType<typeof address>;
  turnId: number;
}): Promise<SubmitGuessAccounts> {
  const turnSeed = u64Le(turnId);
  const playerSeed = addressEncoder.encode(player);

  const [
    globalConfig,
    turnState,
    playerGuess,
    gameToken,
    treasuryVault,
    prizeVault,
  ] = await Promise.all([
    derivePda(["global_config"]),
    derivePda(["turn", turnSeed]),
    derivePda(["guess", turnSeed, playerSeed]),
    derivePda(["game_token", turnSeed, playerSeed]),
    derivePda(["treasury_vault"]),
    derivePda(["prize_vault", turnSeed]),
  ]);

  return {
    gameToken,
    globalConfig,
    playerGuess,
    prizeVault,
    treasuryVault,
    turnState,
  };
}

export async function deriveRoundAccounts({ turnId }: { turnId: number }) {
  const turnSeed = u64Le(turnId);
  const [turnState, prizeVault] = await Promise.all([
    derivePda(["turn", turnSeed]),
    derivePda(["prize_vault", turnSeed]),
  ]);

  return { prizeVault, turnState };
}

export async function deriveRuleProposalAddress({
  ruleId,
  turnId,
}: {
  ruleId: number;
  turnId: number;
}) {
  return derivePda(["rule", u64Le(turnId), u64Le(ruleId)]);
}

export async function deriveRuleVoteAddress({
  player,
  ruleId,
  turnId,
}: {
  player: ReturnType<typeof address>;
  ruleId: number;
  turnId: number;
}) {
  return derivePda([
    "vote",
    u64Le(turnId),
    u64Le(ruleId),
    addressEncoder.encode(player),
  ]);
}

export async function createSubmitGuessInstruction({
  numbers,
  player,
  turnId,
}: {
  numbers: readonly number[];
  player: ReturnType<typeof address>;
  turnId: number;
}) {
  const accounts = await deriveSubmitGuessAccounts({ player, turnId });
  const data = new Uint8Array(SUBMIT_GUESS_DISCRIMINATOR.length + 6);
  data.set(SUBMIT_GUESS_DISCRIMINATOR);
  data.set(numbers, SUBMIT_GUESS_DISCRIMINATOR.length);

  return {
    accounts: [
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.globalConfig, role: AccountRole.READONLY },
      { address: accounts.turnState, role: AccountRole.WRITABLE },
      { address: accounts.playerGuess, role: AccountRole.WRITABLE },
      { address: accounts.gameToken, role: AccountRole.WRITABLE },
      { address: accounts.treasuryVault, role: AccountRole.WRITABLE },
      { address: accounts.prizeVault, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data,
    programAddress: IDEALER_PROGRAM_ID,
  };
}

export async function createProposeRuleInstruction({
  player,
  preflight,
  turnId,
}: {
  player: ReturnType<typeof address>;
  preflight: RulePreflightResult;
  turnId: number;
}) {
  assertHashBytes("sanitizedTextHash", preflight.sanitizedTextHash);
  assertHashBytes("normalizedTextHash", preflight.normalizedTextHash);
  assertHashBytes(
    "officialInterpretationHash",
    preflight.officialInterpretationHash,
  );
  assertHashBytes("preflightResultHash", preflight.preflightResultHash);

  const accounts = await deriveSubmitGuessAccounts({ player, turnId });
  const ruleProposal = await deriveRuleProposalAddress({
    ruleId: preflight.ruleId,
    turnId,
  });
  const sanitizedTextBytes = textEncoder.encode(preflight.sanitizedText);
  const data = [...PROPOSE_RULE_DISCRIMINATOR];

  pushU64Le(data, preflight.ruleId);
  pushU32Le(data, sanitizedTextBytes.length);
  data.push(...sanitizedTextBytes);
  data.push(...preflight.sanitizedTextHash);
  data.push(...preflight.normalizedTextHash);
  data.push(...preflight.officialInterpretationHash);
  data.push(...preflight.preflightResultHash);
  pushU16Le(data, preflight.tokenCount);

  return {
    accounts: [
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.globalConfig, role: AccountRole.READONLY },
      { address: accounts.turnState, role: AccountRole.WRITABLE },
      { address: accounts.gameToken, role: AccountRole.WRITABLE },
      { address: ruleProposal, role: AccountRole.WRITABLE },
      { address: accounts.treasuryVault, role: AccountRole.WRITABLE },
      { address: accounts.prizeVault, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
    programAddress: IDEALER_PROGRAM_ID,
  };
}

export async function createVoteRuleInstruction({
  player,
  ruleId,
  turnId,
}: {
  player: ReturnType<typeof address>;
  ruleId: number;
  turnId: number;
}) {
  const accounts = await deriveSubmitGuessAccounts({ player, turnId });
  const ruleProposal = await deriveRuleProposalAddress({ ruleId, turnId });
  const ruleVote = await deriveRuleVoteAddress({ player, ruleId, turnId });

  return {
    accounts: [
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.globalConfig, role: AccountRole.READONLY },
      { address: accounts.turnState, role: AccountRole.READONLY },
      { address: accounts.gameToken, role: AccountRole.WRITABLE },
      { address: ruleProposal, role: AccountRole.WRITABLE },
      { address: ruleVote, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: VOTE_RULE_DISCRIMINATOR,
    programAddress: IDEALER_PROGRAM_ID,
  };
}

export function validateGuessNumbers(numbers: readonly number[]) {
  const uniqueNumbers = new Set(numbers);
  return (
    numbers.length === 6 &&
    uniqueNumbers.size === 6 &&
    numbers.every(
      (number) => Number.isInteger(number) && number >= 1 && number <= 100,
    )
  );
}
