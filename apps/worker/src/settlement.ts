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

function decodeSettlementTurnState(data: Uint8Array) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const turnId = u64Number(view, 8);
  const endTimestampSeconds = i64Number(view, 24);
  const activeRuleId = u64Number(view, 52);
  const eligibleRulePoolHash = hex32At(data, 124);
  const electionVrfRequest = readPubkey(data, 503);
  const activeElectionVrfRequest = readPubkey(data, 576);
  const drawStatus = decodeDrawStatus(view.getUint8(649));
  const drawVrfRequest = readPubkey(data, 650);

  return {
    activeElectionVrfRequest,
    activeRuleId: activeRuleId === 0 ? null : activeRuleId,
    drawStatus,
    drawVrfRequest,
    electionCutoffTimestampSeconds: endTimestampSeconds,
    electionVrfRequest,
    eligibleRulePoolHash:
      eligibleRulePoolHash === "00".repeat(32) ? null : eligibleRulePoolHash,
    endTimestampSeconds,
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

async function fetchSettlementTurnState(
  context: SettlementContext,
  turnId: number,
) {
  const data = await fetchTurnAccountData(context, turnId);
  return data ? decodeSettlementTurnState(data) : null;
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
