"use client";

import {
  AccountRole,
  address,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

export const TYCHE_PROGRAM_ID = address(
  process.env.NEXT_PUBLIC_TYCHE_PROGRAM_ID ??
    "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd",
);
const TOKENOMICS_CORE_PROGRAM_ID = address(
  process.env.NEXT_PUBLIC_TOKENOMICS_CORE_PROGRAM_ID ??
    "BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm",
);
export const TYCHE_ACTIVE_TURN_ID = Number(
  process.env.NEXT_PUBLIC_TYCHE_ACTIVE_TURN_ID ?? "1",
);
export const SYSTEM_PROGRAM_ID = address("11111111111111111111111111111111");

const SUBMIT_GUESS_DISCRIMINATOR = new Uint8Array([
  61, 124, 32, 227, 64, 198, 252, 3,
]);
const SUBMIT_ADDITIONAL_GUESS_DISCRIMINATOR = new Uint8Array([
  141, 186, 105, 183, 228, 255, 164, 47,
]);
const PROPOSE_RULE_DISCRIMINATOR = new Uint8Array([
  14, 35, 67, 184, 137, 188, 125, 233,
]);
const VOTE_RULE_DISCRIMINATOR = new Uint8Array([
  40, 87, 133, 249, 114, 164, 242, 183,
]);
const ELIMINATE_VOTE_RULE_DISCRIMINATOR = new Uint8Array([
  82, 128, 200, 74, 171, 186, 232, 227,
]);
const REMOVE_RULE_DISCRIMINATOR = new Uint8Array([
  208, 2, 212, 252, 142, 122, 159, 232,
]);
const CLAIM_PRIZE_DISCRIMINATOR = new Uint8Array([
  157, 233, 139, 121, 246, 62, 234, 235,
]);
const CLAIM_REWARD_DISCRIMINATOR = new Uint8Array([
  149, 95, 181, 242, 94, 90, 158, 162,
]);
// On-chain `ClaimKind` enum order: WinnerPayout=0, CreatorReward=1, VoterReward=2.
export type ClaimKindLabel =
  | "creator_reward"
  | "voter_reward"
  | "winner_payout";
const CLAIM_KIND_BYTE: Readonly<Record<ClaimKindLabel, number>> = {
  creator_reward: 1,
  voter_reward: 2,
  winner_payout: 0,
};
const addressEncoder = getAddressEncoder();
const textEncoder = new TextEncoder();

export interface SubmitGuessAccounts {
  feePool: ReturnType<typeof address>;
  gameToken: ReturnType<typeof address>;
  globalConfig: ReturnType<typeof address>;
  playerGuess: ReturnType<typeof address>;
  prizeVault: ReturnType<typeof address>;
  treasuryVault: ReturnType<typeof address>;
  turnState: ReturnType<typeof address>;
}

export interface GuessReceipt {
  feeLamports?: number;
  gameToken: string;
  numbers: readonly number[];
  player: string;
  playerGuess: string;
  programId: string;
  sequence: number;
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
  ruleRemovalFeeLamports: bigint | null;
  voteFeeLamports: bigint;
}

export interface TurnStateSnapshot {
  eliminationWindowEndTimestamp: number;
  endTimestamp: number;
  finalistCount: number;
  finalistRuleIds: number[];
  startTimestamp: number;
  status: "open" | "closed";
  turnDurationSeconds: number;
  turnId: number;
}

export interface TurnOpeningGate {
  blockingTurnId: number | null;
  canOpen: boolean;
  code: "PREVIOUS_TURN_SETTLEMENT_PENDING" | "READY_TO_OPEN";
}

export interface ActiveTurnSnapshot {
  globalConfig: GlobalConfigSnapshot;
  globalConfigAddress: ReturnType<typeof address>;
  openingGate?: TurnOpeningGate;
  turnState: null | TurnStateSnapshot;
  turnStateAddress: null | ReturnType<typeof address>;
}

export interface RulePreflightResult {
  addedOperationalClauses: string[];
  ast?: unknown | null;
  clarityNote: string;
  confirmationRequired: boolean;
  coverage: {
    missingFromAst: number[];
    // Forwarded, never inspected — see the note in features/tyche/data/apiClient.
    missingOperations: string[];
  } | null;
  // Compile-gate verdict: the rule is only proposable when decision === "VALID".
  compiledArtifactHash?: string | null;
  decision?: "VALID" | "INVALID";
  dealerMessage: string;
  difficultyClass?: string;
  finalConfidence?: number;
  /** Server-authored recovery hint for compiler-generation faults. Missing on
   * drafts persisted before retry support was introduced. */
  generationRetryable?: boolean;
  maxTokens: number;
  needsClarification: boolean;
  normalizedText: string;
  normalizedTextHash: readonly number[];
  officialInterpretation: string;
  officialInterpretationHash: readonly number[];
  preflightResultHash: readonly number[];
  reasonSummary?: string;
  reasonCodes: string[];
  refinementFocus?: readonly string[];
  refinementQuestions?: readonly string[];
  reproposalBlocked?: boolean;
  ruleId: number;
  ruleMode?: "predicate" | "ranking";
  sanitizedText: string;
  sanitizedTextHash: readonly number[];
  semanticImpact: {
    drawIndependent: boolean;
    rangeBoundsAmbiguous: boolean;
    sharedOutcome: boolean;
    triviallyAlwaysTrue: boolean;
    usesDraw: boolean;
    usesGuess: boolean;
  };
  suggestedRewrite?: string;
  suggestedRewrites?: readonly string[];
  title: string;
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
  feeLamports?: number;
  ruleId: number;
  ruleProposal: string;
  ruleVote: string;
  sequence: number;
  signature: string;
  submittedAt: string;
  turnId: number;
  voter: string;
}

export interface RuleEliminationVoteReceipt {
  eliminationVote: string;
  feeLamports?: number;
  ruleId: number;
  ruleProposal: string;
  sequence: number;
  signature: string;
  submittedAt: string;
  turnId: number;
  voter: string;
}

export interface RuleRemovalReceipt {
  removalKind: "creator_self" | "third_party";
  removedAt: string;
  remover: string;
  ruleId: number;
  ruleProposal: string;
  ruleRemoval: string;
  signature: string;
  turnId: number;
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
    programAddress: TYCHE_PROGRAM_ID,
    seeds,
  });
  return pda;
}

async function deriveFeePool() {
  const [feePool] = await getProgramDerivedAddress({
    programAddress: TOKENOMICS_CORE_PROGRAM_ID,
    seeds: ["distribution_vault"],
  });
  return feePool;
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

function sleep(ms: number) {
  return new Promise<void>((resolve) => globalThis.setTimeout(resolve, ms));
}

export async function confirmedProgramAccountExists({
  account,
  client,
  label,
}: {
  account: ReturnType<typeof address>;
  client: AccountInfoRpcReader;
  label: string;
}) {
  const result = await client.runtime.rpc
    .getAccountInfo(account, {
      commitment: "confirmed",
      encoding: "base64",
    })
    .send();

  if (!result.value) {
    return false;
  }

  if (result.value.owner !== TYCHE_PROGRAM_ID.toString()) {
    throw new Error(`${label} account owner does not match the Tyche program.`);
  }

  return true;
}

export async function waitForConfirmedProgramAccount({
  account,
  attempts = 12,
  client,
  intervalMs = 1_000,
  label,
}: {
  account: ReturnType<typeof address>;
  attempts?: number;
  client: AccountInfoRpcReader;
  intervalMs?: number;
  label: string;
}) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (await confirmedProgramAccountExists({ account, client, label })) {
      return;
    }

    if (attempt < attempts - 1) {
      await sleep(intervalMs);
    }
  }

  throw new Error(
    `${label} is not confirmed on devnet yet. Wait for confirmation, then try again.`,
  );
}

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

  if (account.owner !== TYCHE_PROGRAM_ID.toString()) {
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

function isPlausibleGlobalConfig(snapshot: GlobalConfigSnapshot) {
  if (
    snapshot.guessCutoffBps > 10_000 ||
    snapshot.ruleElectionCutoffBps > 10_000 ||
    snapshot.voteFeeLamports > 100_000_000_000n
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
  const guessSubmissionFeeLamports = reader.readU64BigInt();
  reader.skip(8);
  const ruleRemovalFeeLamports = hasRuleRemovalFee
    ? reader.readU64BigInt()
    : null;
  const voteFeeLamports = reader.readU64BigInt();
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
    ruleRemovalFeeLamports,
    voteFeeLamports,
  };
}

export function decodeGlobalConfigAccount(
  data: Uint8Array,
): GlobalConfigSnapshot {
  const withRuleRemovalFee = decodeGlobalConfigAccountWithLayout(data, true);
  if (isPlausibleGlobalConfig(withRuleRemovalFee)) {
    return withRuleRemovalFee;
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
  const currentLayout = data.length === 789;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const finalistCount = currentLayout ? view.getUint8(261) : 0;
  const finalistRuleIds = currentLayout
    ? Array.from({ length: finalistCount }, (_, index) =>
        Number(view.getBigUint64(262 + index * 8, true)),
      )
    : [];
  const eliminationWindowEndTimestamp = currentLayout
    ? Number(view.getBigInt64(496, true))
    : 0;

  return {
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

export function getActionCutoffTimestamp({
  cutoffBps,
  turn,
}: {
  cutoffBps: number;
  turn: TurnStateSnapshot;
}) {
  const duration = turn.turnDurationSeconds;
  return turn.startTimestamp + Math.floor((duration * cutoffBps) / 10_000);
}

export function getTurnActionReadiness({
  cutoffBps,
  globalConfig,
  nowSeconds = Math.floor(Date.now() / 1000),
  openingGate,
  turn,
}: {
  cutoffBps: number;
  globalConfig: GlobalConfigSnapshot;
  nowSeconds?: number;
  openingGate?: TurnOpeningGate;
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
    if (
      openingGate?.code === "PREVIOUS_TURN_SETTLEMENT_PENDING" &&
      openingGate.blockingTurnId
    ) {
      return {
        code: "PREVIOUS_TURN_SETTLEMENT_PENDING",
        message: `Round ${openingGate.blockingTurnId} is closed on-chain, but its settlement is incomplete. The next round will open after recovery finishes.`,
        ok: false,
      } as const;
    }
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
      message: "This devnet turn is closed. The next turn opens automatically.",
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
      message: "This devnet turn has ended. The next turn opens automatically.",
      ok: false,
    } as const;
  }

  const cutoffTimestamp = getActionCutoffTimestamp({ cutoffBps, turn });
  if (nowSeconds >= cutoffTimestamp) {
    return {
      code: "ACTION_WINDOW_CLOSED",
      message:
        "This devnet turn already passed its action cutoff. Wait for the next automatic turn before submitting.",
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
  sequence,
  turnId,
}: {
  player: ReturnType<typeof address>;
  sequence: number;
  turnId: number;
}): Promise<SubmitGuessAccounts> {
  const turnSeed = u64Le(turnId);
  const playerSeed = addressEncoder.encode(player);
  const sequenceSeed = u64Le(sequence);

  const [
    globalConfig,
    turnState,
    playerGuess,
    gameToken,
    treasuryVault,
    feePool,
    prizeVault,
  ] = await Promise.all([
    derivePda(["global_config"]),
    derivePda(["turn", turnSeed]),
    derivePda(["guess", turnSeed, playerSeed, sequenceSeed]),
    derivePda(["game_token", turnSeed, playerSeed]),
    derivePda(["treasury_vault"]),
    deriveFeePool(),
    derivePda(["prize_vault", turnSeed]),
  ]);

  return {
    gameToken,
    feePool,
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
  sequence,
  turnId,
}: {
  player: ReturnType<typeof address>;
  ruleId: number;
  sequence: number;
  turnId: number;
}) {
  return derivePda([
    "vote",
    u64Le(turnId),
    u64Le(ruleId),
    addressEncoder.encode(player),
    u64Le(sequence),
  ]);
}

export async function deriveRuleEliminationVoteAddress({
  player,
  ruleId,
  sequence,
  turnId,
}: {
  player: ReturnType<typeof address>;
  ruleId: number;
  sequence: number;
  turnId: number;
}) {
  return derivePda([
    "elimination_vote",
    u64Le(turnId),
    u64Le(ruleId),
    addressEncoder.encode(player),
    u64Le(sequence),
  ]);
}

export async function deriveRuleRemovalAddress({
  player,
  ruleId,
  turnId,
}: {
  player: ReturnType<typeof address>;
  ruleId: number;
  turnId: number;
}) {
  return derivePda([
    "rule_removal",
    u64Le(turnId),
    u64Le(ruleId),
    addressEncoder.encode(player),
  ]);
}

export async function createSubmitGuessInstruction({
  numbers,
  player,
  sequence,
  turnId,
}: {
  numbers: readonly number[];
  player: ReturnType<typeof address>;
  sequence: number;
  turnId: number;
}) {
  const accounts = await deriveSubmitGuessAccounts({
    player,
    sequence,
    turnId,
  });
  const discriminator =
    sequence === 1
      ? SUBMIT_GUESS_DISCRIMINATOR
      : SUBMIT_ADDITIONAL_GUESS_DISCRIMINATOR;
  const data = new Uint8Array(discriminator.length + 6 + 8);
  data.set(discriminator);
  data.set(numbers, discriminator.length);
  data.set(u64Le(sequence), discriminator.length + 6);

  return {
    accounts: [
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.globalConfig, role: AccountRole.READONLY },
      { address: accounts.turnState, role: AccountRole.WRITABLE },
      { address: accounts.playerGuess, role: AccountRole.WRITABLE },
      { address: accounts.gameToken, role: AccountRole.WRITABLE },
      { address: accounts.treasuryVault, role: AccountRole.WRITABLE },
      { address: accounts.feePool, role: AccountRole.WRITABLE },
      { address: accounts.prizeVault, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data,
    programAddress: TYCHE_PROGRAM_ID,
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

  const accounts = await deriveSubmitGuessAccounts({
    player,
    sequence: 1,
    turnId,
  });
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
      { address: accounts.feePool, role: AccountRole.WRITABLE },
      { address: accounts.prizeVault, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: new Uint8Array(data),
    programAddress: TYCHE_PROGRAM_ID,
  };
}

export async function createVoteRuleInstruction({
  player,
  ruleId,
  sequence,
  turnId,
}: {
  player: ReturnType<typeof address>;
  ruleId: number;
  sequence: number;
  turnId: number;
}) {
  const accounts = await deriveSubmitGuessAccounts({
    player,
    sequence: 1,
    turnId,
  });
  const ruleProposal = await deriveRuleProposalAddress({ ruleId, turnId });
  const ruleVote = await deriveRuleVoteAddress({
    player,
    ruleId,
    sequence,
    turnId,
  });
  const data = new Uint8Array(VOTE_RULE_DISCRIMINATOR.length + 8);
  data.set(VOTE_RULE_DISCRIMINATOR);
  data.set(u64Le(sequence), VOTE_RULE_DISCRIMINATOR.length);

  return {
    accounts: [
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.globalConfig, role: AccountRole.READONLY },
      { address: accounts.turnState, role: AccountRole.WRITABLE },
      { address: accounts.gameToken, role: AccountRole.WRITABLE },
      { address: ruleProposal, role: AccountRole.WRITABLE },
      { address: ruleVote, role: AccountRole.WRITABLE },
      { address: accounts.treasuryVault, role: AccountRole.WRITABLE },
      { address: accounts.feePool, role: AccountRole.WRITABLE },
      { address: accounts.prizeVault, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data,
    programAddress: TYCHE_PROGRAM_ID,
  };
}

export async function createEliminateVoteRuleInstruction({
  player,
  ruleId,
  sequence,
  turnId,
}: {
  player: ReturnType<typeof address>;
  ruleId: number;
  sequence: number;
  turnId: number;
}) {
  const accounts = await deriveSubmitGuessAccounts({
    player,
    sequence: 1,
    turnId,
  });
  const ruleProposal = await deriveRuleProposalAddress({ ruleId, turnId });
  const ruleEliminationVote = await deriveRuleEliminationVoteAddress({
    player,
    ruleId,
    sequence,
    turnId,
  });
  const data = new Uint8Array(ELIMINATE_VOTE_RULE_DISCRIMINATOR.length + 8);
  data.set(ELIMINATE_VOTE_RULE_DISCRIMINATOR);
  data.set(u64Le(sequence), ELIMINATE_VOTE_RULE_DISCRIMINATOR.length);

  return {
    accounts: [
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.globalConfig, role: AccountRole.READONLY },
      { address: accounts.turnState, role: AccountRole.WRITABLE },
      { address: accounts.gameToken, role: AccountRole.READONLY },
      { address: ruleProposal, role: AccountRole.READONLY },
      { address: ruleEliminationVote, role: AccountRole.WRITABLE },
      { address: accounts.treasuryVault, role: AccountRole.WRITABLE },
      { address: accounts.feePool, role: AccountRole.WRITABLE },
      { address: accounts.prizeVault, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data,
    programAddress: TYCHE_PROGRAM_ID,
  };
}

export async function createRemoveRuleInstruction({
  player,
  ruleId,
  turnId,
}: {
  player: ReturnType<typeof address>;
  ruleId: number;
  turnId: number;
}) {
  const accounts = await deriveSubmitGuessAccounts({
    player,
    sequence: 1,
    turnId,
  });
  const ruleProposal = await deriveRuleProposalAddress({ ruleId, turnId });
  const ruleRemoval = await deriveRuleRemovalAddress({
    player,
    ruleId,
    turnId,
  });

  return {
    accounts: [
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: accounts.globalConfig, role: AccountRole.READONLY },
      { address: accounts.turnState, role: AccountRole.WRITABLE },
      { address: accounts.gameToken, role: AccountRole.READONLY },
      { address: ruleProposal, role: AccountRole.WRITABLE },
      { address: ruleRemoval, role: AccountRole.WRITABLE },
      { address: accounts.treasuryVault, role: AccountRole.WRITABLE },
      { address: accounts.feePool, role: AccountRole.WRITABLE },
      { address: accounts.prizeVault, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data: REMOVE_RULE_DISCRIMINATOR,
    programAddress: TYCHE_PROGRAM_ID,
  };
}

export async function deriveClaimAddress({
  claimant,
  kind,
  turnId,
}: {
  claimant: ReturnType<typeof address>;
  kind: ClaimKindLabel;
  turnId: number;
}) {
  return derivePda([
    "claim",
    u64Le(turnId),
    addressEncoder.encode(claimant),
    Uint8Array.of(CLAIM_KIND_BYTE[kind]),
  ]);
}

export async function createClaimPrizeInstruction({
  player,
  turnId,
}: {
  player: ReturnType<typeof address>;
  turnId: number;
}) {
  const [globalConfig, claim, prizeVault] = await Promise.all([
    derivePda(["global_config"]),
    deriveClaimAddress({ claimant: player, kind: "winner_payout", turnId }),
    derivePda(["prize_vault", u64Le(turnId)]),
  ]);
  const data = [...CLAIM_PRIZE_DISCRIMINATOR];
  pushU64Le(data, turnId);

  return {
    accounts: [
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: globalConfig, role: AccountRole.READONLY },
      { address: claim, role: AccountRole.WRITABLE },
      { address: prizeVault, role: AccountRole.WRITABLE },
    ],
    data: new Uint8Array(data),
    programAddress: TYCHE_PROGRAM_ID,
  };
}

export async function createClaimRewardInstruction({
  kind,
  player,
  turnId,
}: {
  kind: "creator_reward" | "voter_reward";
  player: ReturnType<typeof address>;
  turnId: number;
}) {
  const [globalConfig, claim, treasuryVault] = await Promise.all([
    derivePda(["global_config"]),
    deriveClaimAddress({ claimant: player, kind, turnId }),
    derivePda(["treasury_vault"]),
  ]);
  const data = [...CLAIM_REWARD_DISCRIMINATOR];
  pushU64Le(data, turnId);
  data.push(CLAIM_KIND_BYTE[kind]);

  return {
    accounts: [
      { address: player, role: AccountRole.WRITABLE_SIGNER },
      { address: globalConfig, role: AccountRole.READONLY },
      { address: claim, role: AccountRole.WRITABLE },
      { address: treasuryVault, role: AccountRole.WRITABLE },
    ],
    data: new Uint8Array(data),
    programAddress: TYCHE_PROGRAM_ID,
  };
}

/// Build the right claim instruction for a claim record: winner payouts pull
/// from the turn prize vault, creator/voter rewards from the treasury reserve.
export async function createClaimInstruction({
  kind,
  player,
  turnId,
}: {
  kind: ClaimKindLabel;
  player: ReturnType<typeof address>;
  turnId: number;
}) {
  return kind === "winner_payout"
    ? createClaimPrizeInstruction({ player, turnId })
    : createClaimRewardInstruction({ kind, player, turnId });
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
