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

export interface RulePreflightResult {
  maxTokens: number;
  normalizedTextHash: readonly number[];
  officialInterpretationHash: readonly number[];
  preflightResultHash: readonly number[];
  ruleId: number;
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

export async function deriveRuleProposalAddress({
  ruleId,
  turnId,
}: {
  ruleId: number;
  turnId: number;
}) {
  return derivePda(["rule", u64Le(turnId), u64Le(ruleId)]);
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
