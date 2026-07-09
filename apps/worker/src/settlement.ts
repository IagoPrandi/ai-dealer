import bs58 from "bs58";
import {
  AnchorUtils,
  asV0Tx,
  ON_DEMAND_DEVNET_PID,
  ON_DEMAND_DEVNET_QUEUE,
  Randomness,
} from "@switchboard-xyz/on-demand";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  TransactionInstruction,
  VersionedTransaction,
  type Commitment,
  type Signer,
} from "@solana/web3.js";
import {
  type DrawCycleDeps,
  type DrawTurn,
  type PublishedDraw,
  type RandomnessState,
} from "./draw.js";
import {
  type ElectionCandidate,
  type ElectionRandomnessState,
  type ElectionTurn,
  type PublishedRuleElection,
  type RuleElectionCycleDeps,
} from "./election.js";
import { extractSwitchboardRandomnessValue } from "./switchboard.js";
import {
  type TurnAutomationConfig,
  decodeGlobalConfigAccount,
  stringifySimulationError,
} from "./turn-automation.js";

const DEFAULT_COMMITMENT: Commitment = "confirmed";
const ZERO_ADDRESS = "11111111111111111111111111111111";
const GLOBAL_CONFIG_SEED = Buffer.from("global_config");
const TURN_SEED = Buffer.from("turn");
const RULE_SEED = Buffer.from("rule");

const REQUEST_DRAW_DISCRIMINATOR = Buffer.from([
  22, 180, 8, 81, 47, 21, 86, 159,
]);
const SETTLE_DRAW_DISCRIMINATOR = Buffer.from([
  175, 154, 75, 30, 118, 117, 107, 194,
]);
const FAIL_DRAW_DISCRIMINATOR = Buffer.from([
  105, 253, 152, 106, 102, 239, 78, 119,
]);
const LOCK_RULE_ELECTION_POOL_DISCRIMINATOR = Buffer.from([
  94, 100, 197, 109, 194, 193, 177, 207,
]);
const REQUEST_RULE_ELECTION_VRF_DISCRIMINATOR = Buffer.from([
  41, 6, 23, 94, 45, 197, 194, 222,
]);
const SETTLE_RULE_ELECTION_DISCRIMINATOR = Buffer.from([
  81, 75, 204, 198, 66, 27, 54, 215,
]);
const REQUEST_ACTIVE_ELECTION_VRF_DISCRIMINATOR = Buffer.from([
  168, 255, 127, 112, 205, 5, 39, 160,
]);
const SETTLE_ACTIVE_ELECTION_DISCRIMINATOR = Buffer.from([
  138, 80, 52, 3, 102, 170, 20, 97,
]);
const CLOSE_ELIMINATION_WINDOW_DISCRIMINATOR = Buffer.from([
  177, 162, 145, 148, 132, 146, 226, 83,
]);
const CLOSE_TURN_DISCRIMINATOR = Buffer.from([
  100, 243, 10, 218, 116, 61, 49, 153,
]);

type SignableTransaction = Transaction | VersionedTransaction;

interface SettlementContext {
  authority: Keypair;
  commitment: Commitment;
  connection: Connection;
  programId: PublicKey;
  queue: PublicKey;
  switchboardProgramId: PublicKey;
  switchboardProgram: Awaited<
    ReturnType<typeof AnchorUtils.loadProgramFromConnection>
  >;
}

export interface SettlementSenderOptions {
  commitment?: Commitment;
  switchboardProgramId?: string | PublicKey;
  switchboardQueue?: string | PublicKey;
}

export interface ProductionDrawDepsOptions extends SettlementSenderOptions {
  publishDraw: (draw: PublishedDraw) => Promise<void>;
}

export interface ProductionRuleElectionDepsOptions
  extends SettlementSenderOptions {
  fetchCandidates: (turnId: number) => Promise<ElectionCandidate[]>;
  publishElection: (election: PublishedRuleElection) => Promise<void>;
}

interface SwitchboardRandomnessData {
  revealSlot: { toNumber(): number };
  seedSlot: { toNumber(): number };
  value: unknown;
}

function createAnchorWallet(keypair: Keypair) {
  return {
    publicKey: keypair.publicKey,
    async signAllTransactions<T extends SignableTransaction>(
      transactions: T[],
    ): Promise<T[]> {
      return transactions.map((transaction) =>
        signAnchorTransaction(transaction, keypair),
      );
    },
    async signTransaction<T extends SignableTransaction>(
      transaction: T,
    ): Promise<T> {
      return signAnchorTransaction(transaction, keypair);
    },
  };
}

function signAnchorTransaction<T extends SignableTransaction>(
  transaction: T,
  keypair: Keypair,
): T {
  if (transaction instanceof VersionedTransaction) {
    transaction.sign([keypair]);
    return transaction;
  }

  transaction.partialSign(keypair);
  return transaction;
}

function publicKeyFromOption(
  value: string | PublicKey | undefined,
  fallback: PublicKey,
) {
  if (!value) {
    return fallback;
  }
  return typeof value === "string" ? new PublicKey(value) : value;
}

function u64Le(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function i64Number(view: DataView, offset: number) {
  return Number(view.getBigInt64(offset, true));
}

function u64Number(view: DataView, offset: number) {
  return Number(view.getBigUint64(offset, true));
}

function bytesToHex(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("hex");
}

function isZeroPubkey(pubkey: PublicKey) {
  return pubkey.toBase58() === ZERO_ADDRESS;
}

function derivePda(programId: PublicKey, seeds: Buffer[]) {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}

function globalConfigPda(programId: PublicKey) {
  return derivePda(programId, [GLOBAL_CONFIG_SEED]);
}

function turnStatePda(programId: PublicKey, turnId: number) {
  return derivePda(programId, [TURN_SEED, u64Le(turnId)]);
}

function ruleProposalPda(programId: PublicKey, turnId: number, ruleId: number) {
  return derivePda(programId, [RULE_SEED, u64Le(turnId), u64Le(ruleId)]);
}

function accountKeysForAuthorityTurn({
  authority,
  programId,
  turnId,
}: {
  authority: PublicKey;
  programId: PublicKey;
  turnId: number;
}) {
  return [
    { isSigner: true, isWritable: false, pubkey: authority },
    { isSigner: false, isWritable: false, pubkey: globalConfigPda(programId) },
    { isSigner: false, isWritable: true, pubkey: turnStatePda(programId, turnId) },
  ];
}

function candidateAccountKeys(
  programId: PublicKey,
  turnId: number,
  candidates: readonly ElectionCandidate[],
) {
  return candidates.map((candidate) => ({
    isSigner: false,
    isWritable: false,
    pubkey: ruleProposalPda(programId, turnId, candidate.ruleId),
  }));
}

export function createRequestDrawInstruction({
  authority,
  programId,
  randomnessAccount,
  turnId,
}: {
  authority: PublicKey;
  programId: PublicKey;
  randomnessAccount: PublicKey;
  turnId: number;
}) {
  return new TransactionInstruction({
    data: REQUEST_DRAW_DISCRIMINATOR,
    keys: [
      ...accountKeysForAuthorityTurn({ authority, programId, turnId }),
      { isSigner: false, isWritable: false, pubkey: randomnessAccount },
    ],
    programId,
  });
}

export function createSettleDrawInstruction({
  authority,
  programId,
  randomnessAccount,
  turnId,
}: {
  authority: PublicKey;
  programId: PublicKey;
  randomnessAccount: PublicKey;
  turnId: number;
}) {
  return new TransactionInstruction({
    data: SETTLE_DRAW_DISCRIMINATOR,
    keys: [
      ...accountKeysForAuthorityTurn({ authority, programId, turnId }),
      { isSigner: false, isWritable: false, pubkey: randomnessAccount },
    ],
    programId,
  });
}

export function createFailDrawInstruction({
  authority,
  failureCode,
  programId,
  turnId,
}: {
  authority: PublicKey;
  failureCode: number;
  programId: PublicKey;
  turnId: number;
}) {
  if (!Number.isInteger(failureCode) || failureCode <= 0 || failureCode > 255) {
    throw new Error("failureCode must be an integer between 1 and 255.");
  }

  return new TransactionInstruction({
    data: Buffer.from([...FAIL_DRAW_DISCRIMINATOR, failureCode]),
    keys: accountKeysForAuthorityTurn({ authority, programId, turnId }),
    programId,
  });
}

export function createLockRuleElectionPoolInstruction({
  authority,
  candidates,
  programId,
  turnId,
}: {
  authority: PublicKey;
  candidates: readonly ElectionCandidate[];
  programId: PublicKey;
  turnId: number;
}) {
  return new TransactionInstruction({
    data: LOCK_RULE_ELECTION_POOL_DISCRIMINATOR,
    keys: [
      ...accountKeysForAuthorityTurn({ authority, programId, turnId }),
      ...candidateAccountKeys(programId, turnId, candidates),
    ],
    programId,
  });
}

export function createRequestRuleElectionVrfInstruction({
  authority,
  programId,
  randomnessAccount,
  turnId,
}: {
  authority: PublicKey;
  programId: PublicKey;
  randomnessAccount: PublicKey;
  turnId: number;
}) {
  return new TransactionInstruction({
    data: REQUEST_RULE_ELECTION_VRF_DISCRIMINATOR,
    keys: [
      ...accountKeysForAuthorityTurn({ authority, programId, turnId }),
      { isSigner: false, isWritable: false, pubkey: randomnessAccount },
    ],
    programId,
  });
}

export function createSettleRuleElectionInstruction({
  authority,
  candidates,
  programId,
  randomnessAccount,
  turnId,
}: {
  authority: PublicKey;
  candidates: readonly ElectionCandidate[];
  programId: PublicKey;
  randomnessAccount: PublicKey;
  turnId: number;
}) {
  return new TransactionInstruction({
    data: SETTLE_RULE_ELECTION_DISCRIMINATOR,
    keys: [
      ...accountKeysForAuthorityTurn({ authority, programId, turnId }),
      { isSigner: false, isWritable: false, pubkey: randomnessAccount },
      ...candidateAccountKeys(programId, turnId, candidates),
    ],
    programId,
  });
}

export function createRequestActiveElectionVrfInstruction({
  authority,
  programId,
  randomnessAccount,
  turnId,
}: {
  authority: PublicKey;
  programId: PublicKey;
  randomnessAccount: PublicKey;
  turnId: number;
}) {
  return new TransactionInstruction({
    data: REQUEST_ACTIVE_ELECTION_VRF_DISCRIMINATOR,
    keys: [
      ...accountKeysForAuthorityTurn({ authority, programId, turnId }),
      { isSigner: false, isWritable: false, pubkey: randomnessAccount },
    ],
    programId,
  });
}

export function createSettleActiveElectionInstruction({
  authority,
  candidates,
  programId,
  randomnessAccount,
  turnId,
}: {
  authority: PublicKey;
  candidates: readonly ElectionCandidate[];
  programId: PublicKey;
  randomnessAccount: PublicKey;
  turnId: number;
}) {
  return new TransactionInstruction({
    data: SETTLE_ACTIVE_ELECTION_DISCRIMINATOR,
    keys: [
      ...accountKeysForAuthorityTurn({ authority, programId, turnId }),
      { isSigner: false, isWritable: false, pubkey: randomnessAccount },
      ...candidateAccountKeys(programId, turnId, candidates),
    ],
    programId,
  });
}

/**
 * `close_turn` flips the turn to `Closed` and advances the global cycle. The
 * settlement scheduler issues this only after the draw is fulfilled (and, when
 * rules exist, the active rule is frozen) so the election pipeline — which
 * requires the turn to stay `Open` (`validate_live_turn`) — has completed. It
 * needs no duration shrink because the play window has genuinely ended by then.
 */
export function createSettlementCloseTurnInstruction({
  authority,
  programId,
  turnId,
}: {
  authority: PublicKey;
  programId: PublicKey;
  turnId: number;
}) {
  return new TransactionInstruction({
    data: CLOSE_TURN_DISCRIMINATOR,
    keys: [
      { isSigner: true, isWritable: false, pubkey: authority },
      { isSigner: false, isWritable: true, pubkey: globalConfigPda(programId) },
      { isSigner: false, isWritable: true, pubkey: turnStatePda(programId, turnId) },
    ],
    programId,
  });
}

/**
 * `close_elimination_window` applies the elimination decision and flips each
 * finalist rule proposal to `Eliminated`/`SurvivedElimination`, so the finalist
 * rule PDAs are passed as WRITABLE remaining accounts (unlike the read-only
 * candidate lists used by the VRF settle instructions).
 */
export function createCloseEliminationWindowInstruction({
  authority,
  finalists,
  programId,
  turnId,
}: {
  authority: PublicKey;
  finalists: readonly ElectionCandidate[];
  programId: PublicKey;
  turnId: number;
}) {
  return new TransactionInstruction({
    data: CLOSE_ELIMINATION_WINDOW_DISCRIMINATOR,
    keys: [
      ...accountKeysForAuthorityTurn({ authority, programId, turnId }),
      ...finalists.map((finalist) => ({
        isSigner: false,
        isWritable: true,
        pubkey: ruleProposalPda(programId, turnId, finalist.ruleId),
      })),
    ],
    programId,
  });
}

async function createSettlementContext(
  config: TurnAutomationConfig,
  options: SettlementSenderOptions = {},
): Promise<SettlementContext> {
  if (!config.authorityKeypairBytes) {
    throw new Error(
      "Settlement senders require IDEALER_TURN_AUTHORITY_KEYPAIR or IDEALER_TURN_AUTHORITY_KEYPAIR_PATH.",
    );
  }

  const commitment = options.commitment ?? DEFAULT_COMMITMENT;
  const authority = Keypair.fromSecretKey(config.authorityKeypairBytes);
  const connection = new Connection(config.rpcUrl, commitment);
  const switchboardProgramId = publicKeyFromOption(
    options.switchboardProgramId ?? process.env.IDEALER_SWITCHBOARD_ON_DEMAND_PROGRAM_ID,
    ON_DEMAND_DEVNET_PID,
  );
  const queue = publicKeyFromOption(
    options.switchboardQueue ?? process.env.IDEALER_SWITCHBOARD_ON_DEMAND_QUEUE,
    ON_DEMAND_DEVNET_QUEUE,
  );
  const switchboardProgram = await AnchorUtils.loadProgramFromConnection(
    connection,
    createAnchorWallet(authority) as never,
    switchboardProgramId,
  );

  return {
    authority,
    commitment,
    connection,
    programId: new PublicKey(config.programId.toString()),
    queue,
    switchboardProgram,
    switchboardProgramId,
  };
}

async function simulateAndSendWeb3({
  commitment,
  connection,
  label,
  transaction,
}: {
  commitment: Commitment;
  connection: Connection;
  label: string;
  transaction: VersionedTransaction;
}) {
  const simulation = await connection.simulateTransaction(transaction, {
    commitment,
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `${label} transaction simulation failed: ${stringifySimulationError(
        simulation.value.err,
      )}; logs=${stringifySimulationError(simulation.value.logs ?? [])}`,
    );
  }

  const signature = await connection.sendTransaction(transaction, {
    maxRetries: 3,
    preflightCommitment: commitment,
    skipPreflight: false,
  });
  const confirmation = await connection.confirmTransaction(signature, commitment);
  if (confirmation.value.err) {
    throw new Error(
      `${label} transaction ${signature} failed after send: ${stringifySimulationError(
        confirmation.value.err,
      )}`,
    );
  }
  return signature;
}

async function sendInstructions({
  context,
  instructions,
  label,
  signers = [],
}: {
  context: SettlementContext;
  instructions: TransactionInstruction[];
  label: string;
  signers?: Signer[];
}) {
  const transaction = await asV0Tx({
    computeUnitLimitMultiple: 1.3,
    connection: context.connection,
    ixs: instructions,
    signers: [context.authority, ...signers],
  });
  return simulateAndSendWeb3({
    commitment: context.commitment,
    connection: context.connection,
    label,
    transaction,
  });
}

async function createAndCommitRandomness(context: SettlementContext) {
  const [randomness, randomnessKeypair, createAndCommitIxs] =
    await Randomness.createAndCommitIxs(
      context.switchboardProgram,
      context.queue,
      context.authority.publicKey,
    );
  const signature = await sendInstructions({
    context,
    instructions: createAndCommitIxs,
    label: "switchboard randomness commit",
    signers: [randomnessKeypair],
  });

  return {
    randomnessAccount: randomness.pubkey.toBase58(),
    signature,
  };
}

function readPubkey(data: Uint8Array, offset: number) {
  return new PublicKey(data.slice(offset, offset + 32));
}

function hex32At(data: Uint8Array, offset: number) {
  return bytesToHex(data.slice(offset, offset + 32));
}

function decodeDrawStatus(value: number): DrawTurn["drawStatus"] {
  if (value === 0) {
    return "not_requested";
  }
  if (value === 1) {
    return "requested";
  }
  if (value === 2) {
    return "fulfilled";
  }
  if (value === 3) {
    return "failed";
  }
  throw new Error("TurnState draw_status is invalid.");
}

const ZERO_HASH_HEX = "00".repeat(32);

/**
 * Full on-chain settlement view of a `TurnState`, decoded from the current
 * program layout (788-byte account; offsets verified against the live devnet
 * turn from M5.2). Drives the M5.3 settlement state machine: every PRD §5.5
 * phase boundary is derivable from these fields (status, election pipeline
 * hashes/slots, elimination window timestamps, active-election freeze, draw
 * status). A hash/pubkey that is all-zero means "not set yet".
 */
export interface SettlementTurnState {
  activeElectionVrfFulfillment: PublicKey;
  activeElectionVrfRequest: PublicKey;
  activeRuleArtifactHash: string | null;
  activeRuleHash: string | null;
  activeRuleId: number | null;
  drawResult: number[] | null;
  drawStatus: DrawTurn["drawStatus"];
  drawVrfRequest: PublicKey;
  drawnAtSeconds: number;
  electionCutoffTimestampSeconds: number;
  electionVrfFulfillment: PublicKey;
  electionVrfRequest: PublicKey;
  eligibleRulePoolHash: string | null;
  eliminationWindowEndSeconds: number;
  eliminationWindowStartSeconds: number;
  eliminatedFinalistHash: string | null;
  endTimestampSeconds: number;
  startTimestampSeconds: number;
  turnDurationSeconds: number;
  finalistCount: number;
  finalistEliminated: boolean[];
  finalistRuleIds: number[];
  finalistSetHash: string | null;
  randomFinalistHash: string | null;
  status: "closed" | "open";
  survivorFinalistHash: string | null;
  topVotedFinalistHash: string | null;
  turnId: number;
}

/**
 * Decode a `TurnState` account into the settlement view. The rule-election
 * cutoff (`ruleElectionCutoffBps` from `GlobalConfig`) marks the phase-1 →
 * phase-2 boundary of the turn (PRD §5.4): the election pipeline (finalist
 * shortlist → decision/elimination window → active rule) runs during phase 2,
 * inside the turn, and the draw fires at the turn's end. The cutoff timestamp
 * is derived with the exact on-chain formula (`require_election_cutoff_reached`)
 * so the scheduler never plans a `lock_pool` the program would reject.
 */
export function decodeSettlementTurnState(
  data: Uint8Array,
  ruleElectionCutoffBps: number,
): SettlementTurnState {
  if (
    !Number.isInteger(ruleElectionCutoffBps) ||
    ruleElectionCutoffBps <= 0 ||
    ruleElectionCutoffBps > 10_000
  ) {
    throw new Error("ruleElectionCutoffBps must be an integer between 1 and 10000.");
  }
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const turnId = u64Number(view, 8);
  const startTimestampSeconds = i64Number(view, 16);
  const endTimestampSeconds = i64Number(view, 24);
  const status = view.getUint8(32) === 0 ? "open" : "closed";
  const turnDurationSeconds = view.getUint32(41, true);
  const drawResult = Array.from(data.slice(46, 52));
  const activeRuleId = u64Number(view, 52);
  const activeRuleHash = hex32At(data, 60);
  const activeRuleArtifactHash = hex32At(data, 92);
  const eligibleRulePoolHash = hex32At(data, 124);
  const topVotedFinalistHash = hex32At(data, 156);
  const randomFinalistHash = hex32At(data, 188);
  const finalistSetHash = hex32At(data, 220);
  const finalistCount = view.getUint8(252);
  const finalistRuleIds: number[] = [];
  const finalistEliminated: boolean[] = [];
  for (let index = 0; index < finalistCount; index += 1) {
    finalistRuleIds.push(u64Number(view, 253 + index * 8));
    finalistEliminated.push(view.getUint8(413 + index) !== 0);
  }
  const eliminatedFinalistHash = hex32At(data, 423);
  const survivorFinalistHash = hex32At(data, 455);
  const eliminationWindowStartSeconds = i64Number(view, 487);
  const eliminationWindowEndSeconds = i64Number(view, 495);
  const electionVrfRequest = readPubkey(data, 503);
  const electionVrfFulfillment = readPubkey(data, 535);
  const activeElectionVrfRequest = readPubkey(data, 576);
  const activeElectionVrfFulfillment = readPubkey(data, 608);
  const drawStatus = decodeDrawStatus(view.getUint8(649));
  const drawVrfRequest = readPubkey(data, 650);
  const drawnAtSeconds = i64Number(view, 762);

  const hashOrNull = (value: string) =>
    value === ZERO_HASH_HEX ? null : value;

  return {
    activeElectionVrfFulfillment,
    activeElectionVrfRequest,
    activeRuleArtifactHash: hashOrNull(activeRuleArtifactHash),
    activeRuleHash: hashOrNull(activeRuleHash),
    activeRuleId: activeRuleId === 0 ? null : activeRuleId,
    drawResult: drawStatus === "fulfilled" ? drawResult : null,
    drawStatus,
    drawVrfRequest,
    drawnAtSeconds,
    electionCutoffTimestampSeconds:
      startTimestampSeconds +
      Math.floor((turnDurationSeconds * ruleElectionCutoffBps) / 10_000),
    electionVrfFulfillment,
    electionVrfRequest,
    eligibleRulePoolHash: hashOrNull(eligibleRulePoolHash),
    eliminationWindowEndSeconds,
    eliminationWindowStartSeconds,
    eliminatedFinalistHash: hashOrNull(eliminatedFinalistHash),
    endTimestampSeconds,
    startTimestampSeconds,
    turnDurationSeconds,
    finalistCount,
    finalistEliminated,
    finalistRuleIds,
    finalistSetHash: hashOrNull(finalistSetHash),
    randomFinalistHash: hashOrNull(randomFinalistHash),
    status,
    survivorFinalistHash: hashOrNull(survivorFinalistHash),
    topVotedFinalistHash: hashOrNull(topVotedFinalistHash),
    turnId,
  };
}

async function fetchTurnAccountData(context: SettlementContext, turnId: number) {
  const account = await context.connection.getAccountInfo(
    turnStatePda(context.programId, turnId),
    context.commitment,
  );
  if (!account) {
    return null;
  }
  if (!account.owner.equals(context.programId)) {
    throw new Error("TurnState account owner does not match the Idealer program.");
  }
  return account.data;
}

/**
 * Read `rule_election_cutoff_bps` from the on-chain `GlobalConfig` so the
 * settlement view derives the phase-1 → phase-2 boundary from the same value
 * the program enforces.
 */
export async function fetchRuleElectionCutoffBps({
  commitment = DEFAULT_COMMITMENT,
  connection,
  programId,
}: {
  commitment?: Commitment;
  connection: Connection;
  programId: PublicKey;
}) {
  const account = await connection.getAccountInfo(
    globalConfigPda(programId),
    commitment,
  );
  if (!account) {
    throw new Error("GlobalConfig account was not found on-chain.");
  }
  if (!account.owner.equals(programId)) {
    throw new Error("GlobalConfig account owner does not match the Idealer program.");
  }
  return decodeGlobalConfigAccount(account.data).ruleElectionCutoffBps;
}

async function fetchSettlementTurnState(
  context: SettlementContext,
  turnId: number,
) {
  const data = await fetchTurnAccountData(context, turnId);
  if (!data) {
    return null;
  }
  const ruleElectionCutoffBps = await fetchRuleElectionCutoffBps({
    commitment: context.commitment,
    connection: context.connection,
    programId: context.programId,
  });
  return decodeSettlementTurnState(data, ruleElectionCutoffBps);
}

function asSwitchboardData(data: unknown): SwitchboardRandomnessData {
  if (
    !data ||
    typeof data !== "object" ||
    !("seedSlot" in data) ||
    !("revealSlot" in data) ||
    !("value" in data)
  ) {
    throw new Error("Switchboard randomness account data has an unexpected shape.");
  }
  return data as SwitchboardRandomnessData;
}

async function fetchCommittedRandomness({
  context,
  randomnessAccount,
  staleReveal,
}: {
  context: SettlementContext;
  randomnessAccount: PublicKey;
  staleReveal: "failed" | "throw";
}): Promise<ElectionRandomnessState | RandomnessState | null> {
  if (isZeroPubkey(randomnessAccount)) {
    return null;
  }

  const randomness = new Randomness(
    context.switchboardProgram,
    randomnessAccount,
  );
  const data = asSwitchboardData(await randomness.loadData());
  const seedSlot = data.seedSlot.toNumber();
  const revealSlot = data.revealSlot.toNumber();
  const currentSlot = await context.connection.getSlot(context.commitment);

  if (revealSlot > 0) {
    if (revealSlot === currentSlot) {
      return {
        randomness: extractSwitchboardRandomnessValue(data),
        source: randomnessAccount.toBase58(),
        status: "ready",
      };
    }

    if (staleReveal === "failed") {
      return { status: "failed" };
    }
    throw new Error(
      `Switchboard randomness ${randomnessAccount.toBase58()} was revealed outside the current settle slot.`,
    );
  }

  if (seedSlot === 0 || currentSlot <= seedSlot) {
    return { status: "pending" };
  }

  return {
    randomness: null,
    source: randomnessAccount.toBase58(),
    status: "ready",
  };
}

async function revealAndSendCallback({
  callbackInstructions,
  context,
  label,
  randomnessAccount,
}: {
  callbackInstructions: TransactionInstruction[];
  context: SettlementContext;
  label: string;
  randomnessAccount: PublicKey;
}) {
  const randomness = new Randomness(
    context.switchboardProgram,
    randomnessAccount,
  );
  const revealIx = await randomness.revealIx(context.authority.publicKey);
  const signature = await sendInstructions({
    context,
    instructions: [revealIx, ...callbackInstructions],
    label,
  });
  const data = await randomness.loadData();
  return {
    randomness: extractSwitchboardRandomnessValue(data),
    signature,
  };
}

export function createProductionDrawSettlementSenders(
  config: TurnAutomationConfig,
  options: SettlementSenderOptions = {},
) {
  let contextPromise: Promise<SettlementContext> | null = null;
  const getContext = () => {
    contextPromise ??= createSettlementContext(config, options);
    return contextPromise;
  };

  return {
    async failDraw(turnId: number, failureCode: number) {
      const context = await getContext();
      await sendInstructions({
        context,
        instructions: [
          createFailDrawInstruction({
            authority: context.authority.publicKey,
            failureCode,
            programId: context.programId,
            turnId,
          }),
        ],
        label: "fail_draw",
      });
    },
    async fetchRandomness(turnId: number): Promise<RandomnessState | null> {
      const context = await getContext();
      const turn = await fetchSettlementTurnState(context, turnId);
      if (!turn) {
        return null;
      }
      return fetchCommittedRandomness({
        context,
        randomnessAccount: turn.drawVrfRequest,
        staleReveal: "failed",
      }) as Promise<RandomnessState | null>;
    },
    async fetchTurn(turnId: number): Promise<DrawTurn | null> {
      const context = await getContext();
      const turn = await fetchSettlementTurnState(context, turnId);
      if (!turn) {
        return null;
      }
      return {
        drawStatus: turn.drawStatus,
        endTimestampSeconds: turn.endTimestampSeconds,
        turnId: turn.turnId,
      };
    },
    async randomnessAccountFor() {
      const context = await getContext();
      const result = await createAndCommitRandomness(context);
      return result.randomnessAccount;
    },
    async requestDraw(turnId: number, randomnessAccount: string) {
      const context = await getContext();
      await sendInstructions({
        context,
        instructions: [
          createRequestDrawInstruction({
            authority: context.authority.publicKey,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        label: "request_draw",
      });
    },
    async settleDraw(
      turnId: number,
      randomnessAccount: string,
    ): Promise<{ randomness: Uint8Array; signature: string }> {
      const context = await getContext();
      return revealAndSendCallback({
        callbackInstructions: [
          createSettleDrawInstruction({
            authority: context.authority.publicKey,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        context,
        label: "settle_draw",
        randomnessAccount: new PublicKey(randomnessAccount),
      });
    },
  };
}

export function createProductionDrawCycleDeps(
  config: TurnAutomationConfig,
  options: ProductionDrawDepsOptions,
): DrawCycleDeps {
  const senders = createProductionDrawSettlementSenders(config, options);
  return {
    ...senders,
    nowIso: () => new Date().toISOString(),
    nowSeconds: () => Math.floor(Date.now() / 1_000),
    publishDraw: options.publishDraw,
  };
}

export function createProductionRuleElectionSettlementSenders(
  config: TurnAutomationConfig,
  options: SettlementSenderOptions = {},
) {
  let contextPromise: Promise<SettlementContext> | null = null;
  const getContext = () => {
    contextPromise ??= createSettlementContext(config, options);
    return contextPromise;
  };

  return {
    async fetchRandomness(
      turnId: number,
    ): Promise<ElectionRandomnessState | null> {
      const context = await getContext();
      const turn = await fetchSettlementTurnState(context, turnId);
      if (!turn) {
        return null;
      }
      return fetchCommittedRandomness({
        context,
        randomnessAccount: turn.electionVrfRequest,
        staleReveal: "throw",
      }) as Promise<ElectionRandomnessState | null>;
    },
    async fetchTurn(turnId: number): Promise<ElectionTurn | null> {
      const context = await getContext();
      const turn = await fetchSettlementTurnState(context, turnId);
      if (!turn) {
        return null;
      }
      return {
        activeRuleId: turn.activeRuleId,
        electionCutoffTimestampSeconds: turn.electionCutoffTimestampSeconds,
        electionVrfRequest: isZeroPubkey(turn.electionVrfRequest)
          ? null
          : turn.electionVrfRequest.toBase58(),
        eligibleRulePoolHash: turn.eligibleRulePoolHash,
        turnId: turn.turnId,
      };
    },
    async lockEligiblePool(
      turnId: number,
      candidates: ElectionCandidate[],
    ) {
      const context = await getContext();
      await sendInstructions({
        context,
        instructions: [
          createLockRuleElectionPoolInstruction({
            authority: context.authority.publicKey,
            candidates,
            programId: context.programId,
            turnId,
          }),
        ],
        label: "lock_rule_election_pool",
      });
    },
    async randomnessAccountFor() {
      const context = await getContext();
      const result = await createAndCommitRandomness(context);
      return result.randomnessAccount;
    },
    async requestActiveElectionVrf(
      turnId: number,
      randomnessAccount: string,
    ) {
      const context = await getContext();
      await sendInstructions({
        context,
        instructions: [
          createRequestActiveElectionVrfInstruction({
            authority: context.authority.publicKey,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        label: "request_active_election_vrf",
      });
    },
    async requestElectionVrf(turnId: number, randomnessAccount: string) {
      const context = await getContext();
      await sendInstructions({
        context,
        instructions: [
          createRequestRuleElectionVrfInstruction({
            authority: context.authority.publicKey,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        label: "request_rule_election_vrf",
      });
    },
    async settleActiveElection(
      turnId: number,
      randomnessAccount: string,
      candidates: ElectionCandidate[],
    ) {
      const context = await getContext();
      return revealAndSendCallback({
        callbackInstructions: [
          createSettleActiveElectionInstruction({
            authority: context.authority.publicKey,
            candidates,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        context,
        label: "settle_active_election",
        randomnessAccount: new PublicKey(randomnessAccount),
      });
    },
    async settleElection(
      turnId: number,
      randomnessAccount: string,
      _randomness: Uint8Array | null,
      candidates: ElectionCandidate[],
    ): Promise<{ randomness: Uint8Array }> {
      const context = await getContext();
      return revealAndSendCallback({
        callbackInstructions: [
          createSettleRuleElectionInstruction({
            authority: context.authority.publicKey,
            candidates,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        context,
        label: "settle_rule_election",
        randomnessAccount: new PublicKey(randomnessAccount),
      });
    },
  };
}

export function createProductionRuleElectionCycleDeps(
  config: TurnAutomationConfig,
  options: ProductionRuleElectionDepsOptions,
): RuleElectionCycleDeps {
  const senders = createProductionRuleElectionSettlementSenders(
    config,
    options,
  );
  return {
    fetchCandidates: options.fetchCandidates,
    fetchRandomness: senders.fetchRandomness,
    fetchTurn: senders.fetchTurn,
    lockEligiblePool: senders.lockEligiblePool,
    nowIso: () => new Date().toISOString(),
    nowSeconds: () => Math.floor(Date.now() / 1_000),
    publishElection: options.publishElection,
    randomnessAccountFor: senders.randomnessAccountFor,
    requestElectionVrf: senders.requestElectionVrf,
    settleElection: senders.settleElection,
  };
}

const RULE_PROPOSAL_DISCRIMINATOR = Buffer.from([
  233, 212, 161, 38, 30, 217, 172, 177,
]);
// RuleState enum order: Proposed=0, Eligible=1, ... ; PrecompilationStatus:
// Pending=0, Passed=1, Failed=2. Mirrors the on-chain candidate eligibility
// (`is_eligible_state = state == Eligible`, `is_precompiled_valid = Passed`).
const RULE_STATE_ELIGIBLE = 1;
const PRECOMPILATION_STATUS_PASSED = 1;

/**
 * Decode the fixed-prefix + variable-`sanitized_text` `RuleProposal` layout into
 * the `ElectionCandidate` shape the election logic and the on-chain settle
 * instructions consume. Offsets after the Borsh `String` are computed from its
 * 4-byte length prefix.
 */
export function decodeRuleProposalCandidate(data: Uint8Array): ElectionCandidate {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const ruleId = u64Number(view, 8);
  const sanitizedTextHash = hex32At(data, 56);
  const textLength = view.getUint32(88, true);
  const base = 92 + textLength;
  const compiledArtifactHash = hex32At(data, base + 64);
  const voteCount = view.getUint32(base + 98, true);
  const reportCount = view.getUint32(base + 102, true);
  const state = view.getUint8(base + 106);
  const precompilationStatus = view.getUint8(base + 139);
  const createdAtSeconds = i64Number(view, base + 140);

  return {
    compiledArtifactHash,
    createdAtSeconds,
    isEligibleState: state === RULE_STATE_ELIGIBLE,
    isPrecompiledValid: precompilationStatus === PRECOMPILATION_STATUS_PASSED,
    reportCount,
    ruleId,
    sanitizedTextHash,
    voteCount,
  };
}

/**
 * Enumerate the turn's on-chain `RuleProposal` accounts (the trustless election
 * candidate source). Returns the full set sorted by `ruleId` so the eligible
 * pool hash is deterministic across `lock`/`settle`; returns `[]` when the turn
 * has no rules (the original-rule-only settlement path, PRD §6.12). The election
 * logic and the program both filter eligibility internally.
 */
export async function fetchOnChainElectionCandidates(
  config: TurnAutomationConfig,
  turnId: number,
  options: SettlementSenderOptions = {},
): Promise<ElectionCandidate[]> {
  const context = await createSettlementContext(config, options);
  const accounts = await context.connection.getProgramAccounts(
    context.programId,
    {
      commitment: context.commitment,
      filters: [
        { memcmp: { bytes: bs58.encode(RULE_PROPOSAL_DISCRIMINATOR), offset: 0 } },
        { memcmp: { bytes: bs58.encode(u64Le(turnId)), offset: 16 } },
      ],
    },
  );
  return accounts
    .map(({ account }) => decodeRuleProposalCandidate(account.data))
    .filter((candidate) => candidate.ruleId > 0)
    .sort((left, right) => left.ruleId - right.ruleId);
}

export interface SettleVrfResult {
  randomness: Uint8Array;
  signature: string;
}

/**
 * Granular, single-context on-chain settlement operations used by the M5.3
 * settlement scheduler. Unlike the per-cycle dep factories above (which each
 * spin up their own context and only read a single VRF account), these share
 * one Switchboard/RPC context and let the scheduler read the full settlement
 * state and drive each of the three VRF accounts independently. Every step is
 * the real trustless on-chain instruction — no mocks, no fallbacks.
 */
export interface SettlementSenders {
  closeEliminationWindow: (
    turnId: number,
    finalists: readonly ElectionCandidate[],
  ) => Promise<string>;
  closeTurn: (turnId: number) => Promise<string>;
  createCommittedRandomness: () => Promise<{
    randomnessAccount: string;
    signature: string;
  }>;
  failDraw: (turnId: number, failureCode: number) => Promise<string>;
  fetchRandomnessFor: (
    randomnessAccount: PublicKey,
    staleReveal: "failed" | "throw",
  ) => Promise<ElectionRandomnessState | RandomnessState | null>;
  fetchState: (turnId: number) => Promise<SettlementTurnState | null>;
  lockEligiblePool: (
    turnId: number,
    candidates: readonly ElectionCandidate[],
  ) => Promise<string>;
  requestActiveElectionVrf: (
    turnId: number,
    randomnessAccount: string,
  ) => Promise<string>;
  requestDraw: (turnId: number, randomnessAccount: string) => Promise<string>;
  requestElectionVrf: (
    turnId: number,
    randomnessAccount: string,
  ) => Promise<string>;
  settleActiveElection: (
    turnId: number,
    randomnessAccount: string,
    candidates: readonly ElectionCandidate[],
  ) => Promise<SettleVrfResult>;
  settleDraw: (
    turnId: number,
    randomnessAccount: string,
  ) => Promise<SettleVrfResult>;
  settleElection: (
    turnId: number,
    randomnessAccount: string,
    candidates: readonly ElectionCandidate[],
  ) => Promise<SettleVrfResult>;
}

export function createSettlementSenders(
  config: TurnAutomationConfig,
  options: SettlementSenderOptions = {},
): SettlementSenders {
  let contextPromise: Promise<SettlementContext> | null = null;
  const getContext = () => {
    contextPromise ??= createSettlementContext(config, options);
    return contextPromise;
  };

  return {
    async closeEliminationWindow(turnId, finalists) {
      const context = await getContext();
      return sendInstructions({
        context,
        instructions: [
          createCloseEliminationWindowInstruction({
            authority: context.authority.publicKey,
            finalists,
            programId: context.programId,
            turnId,
          }),
        ],
        label: "close_elimination_window",
      });
    },
    async closeTurn(turnId) {
      const context = await getContext();
      return sendInstructions({
        context,
        instructions: [
          createSettlementCloseTurnInstruction({
            authority: context.authority.publicKey,
            programId: context.programId,
            turnId,
          }),
        ],
        label: "close_turn",
      });
    },
    async createCommittedRandomness() {
      return createAndCommitRandomness(await getContext());
    },
    async failDraw(turnId, failureCode) {
      const context = await getContext();
      return sendInstructions({
        context,
        instructions: [
          createFailDrawInstruction({
            authority: context.authority.publicKey,
            failureCode,
            programId: context.programId,
            turnId,
          }),
        ],
        label: "fail_draw",
      });
    },
    async fetchRandomnessFor(randomnessAccount, staleReveal) {
      return fetchCommittedRandomness({
        context: await getContext(),
        randomnessAccount,
        staleReveal,
      });
    },
    async fetchState(turnId) {
      const context = await getContext();
      return fetchSettlementTurnState(context, turnId);
    },
    async lockEligiblePool(turnId, candidates) {
      const context = await getContext();
      return sendInstructions({
        context,
        instructions: [
          createLockRuleElectionPoolInstruction({
            authority: context.authority.publicKey,
            candidates,
            programId: context.programId,
            turnId,
          }),
        ],
        label: "lock_rule_election_pool",
      });
    },
    async requestActiveElectionVrf(turnId, randomnessAccount) {
      const context = await getContext();
      return sendInstructions({
        context,
        instructions: [
          createRequestActiveElectionVrfInstruction({
            authority: context.authority.publicKey,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        label: "request_active_election_vrf",
      });
    },
    async requestDraw(turnId, randomnessAccount) {
      const context = await getContext();
      return sendInstructions({
        context,
        instructions: [
          createRequestDrawInstruction({
            authority: context.authority.publicKey,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        label: "request_draw",
      });
    },
    async requestElectionVrf(turnId, randomnessAccount) {
      const context = await getContext();
      return sendInstructions({
        context,
        instructions: [
          createRequestRuleElectionVrfInstruction({
            authority: context.authority.publicKey,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        label: "request_rule_election_vrf",
      });
    },
    async settleActiveElection(turnId, randomnessAccount, candidates) {
      const context = await getContext();
      return revealAndSendCallback({
        callbackInstructions: [
          createSettleActiveElectionInstruction({
            authority: context.authority.publicKey,
            candidates,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        context,
        label: "settle_active_election",
        randomnessAccount: new PublicKey(randomnessAccount),
      });
    },
    async settleDraw(turnId, randomnessAccount) {
      const context = await getContext();
      return revealAndSendCallback({
        callbackInstructions: [
          createSettleDrawInstruction({
            authority: context.authority.publicKey,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        context,
        label: "settle_draw",
        randomnessAccount: new PublicKey(randomnessAccount),
      });
    },
    async settleElection(turnId, randomnessAccount, candidates) {
      const context = await getContext();
      return revealAndSendCallback({
        callbackInstructions: [
          createSettleRuleElectionInstruction({
            authority: context.authority.publicKey,
            candidates,
            programId: context.programId,
            randomnessAccount: new PublicKey(randomnessAccount),
            turnId,
          }),
        ],
        context,
        label: "settle_rule_election",
        randomnessAccount: new PublicKey(randomnessAccount),
      });
    },
  };
}
