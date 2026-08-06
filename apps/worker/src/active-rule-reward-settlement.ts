import { createHash } from "node:crypto";
import { calculateActiveRuleRewards } from "@tyche/tokenomics";
import bs58 from "bs58";
import {
  type Commitment,
  Connection,
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
  TransactionMessage,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  CURRENT_TURN_STATE_DATA_LENGTH,
  decodeSettlementTurnState,
} from "./settlement.js";
import {
  createAssociatedTokenInstruction,
  decodeCampaignAccounts,
  deriveAssociatedTokenAddress,
  sendRewardTransaction,
  type CampaignAccounts,
} from "./token-reward-settlement.js";
import {
  createTurnAutomationConfig,
  stringifySimulationError,
  type TurnAutomationConfig,
} from "./turn-automation.js";

const DEFAULT_COMMITMENT: Commitment = "finalized";
const DEFAULT_INTERVAL_MS = 30_000;
const TOKEN_PROGRAM_ID = new PublicKey(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
const SETTLE_ACTIVE_RULE_TOKEN_REWARDS_DISCRIMINATOR = Buffer.from([
  207, 226, 174, 94, 33, 27, 25, 230,
]);
const RULE_PROPOSAL_DISCRIMINATOR = accountDiscriminator("RuleProposal");
const RULE_VOTE_DISCRIMINATOR = accountDiscriminator("RuleVote");

export interface ActiveRuleRewardSettlementConfig {
  apiBaseUrl: string;
  automation: TurnAutomationConfig;
  enabled: boolean;
  intervalMs: number;
  tokenomicsProgramId: PublicKey | null;
  turnAllowlist: readonly number[];
}

export interface ActiveRuleProposalFact {
  proposer: PublicKey;
  ruleId: bigint;
  turnId: bigint;
}

export interface ActiveRuleVoteFact {
  ruleId: bigint;
  turnId: bigint;
  voter: PublicKey;
}

export interface ActiveRuleWinnerSummary {
  alternative: {
    bucketLamports: number;
    individualPayoutLamports: number;
    remainderLamports: number;
    winnerCount: number;
  };
  turnId: number;
}

export interface ActiveRuleRewardPlan {
  activeRuleId: number;
  activeRuleReward: PublicKey;
  alternativePrizePoolLamports: bigint;
  campaign: CampaignAccounts;
  creator: PublicKey;
  creatorPaidAtoms: bigint;
  creatorTokenAccount: PublicKey;
  globalConfig: PublicKey;
  individualAlternativePayoutLamports: bigint;
  ruleProposal: PublicKey;
  remainingCampaignAtoms: bigint;
  turnId: number;
  turnState: PublicKey;
  voterPayments: ReadonlyMap<string, bigint>;
  voterPoolPaidAtoms: bigint;
  voterTokenAccounts: readonly PublicKey[];
  voters: readonly PublicKey[];
  winnerCount: bigint;
}

export type ActiveRuleRewardInspection =
  | {
      action: "already_settled" | "not_eligible";
      reason: string;
      turnId: number;
    }
  | {
      action: "ready";
      plan: ActiveRuleRewardPlan;
      turnId: number;
    };

export type ActiveRuleRewardSettlementResult =
  | { action: "disabled" | "nothing_to_settle" }
  | {
      action: "settled";
      activeRuleId: number;
      receipt: string;
      signature: string;
      turnId: number;
    };

function envFlag(value: string | undefined) {
  return value === "1" || value?.toLowerCase() === "true";
}

function envNumber(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function accountDiscriminator(name: string) {
  return createHash("sha256")
    .update(`account:${name}`)
    .digest()
    .subarray(0, 8);
}

function u64Le(value: bigint) {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error("Active-rule reward value is outside the u64 range.");
  }
  const bytes = Buffer.alloc(8);
  bytes.writeBigUInt64LE(value);
  return bytes;
}

function derivePda(programId: PublicKey, seeds: Array<Buffer | Uint8Array>) {
  return PublicKey.findProgramAddressSync(
    seeds.map((seed) => Buffer.from(seed)),
    programId,
  )[0];
}

function comparePublicKeys(left: PublicKey, right: PublicKey) {
  return Buffer.compare(left.toBuffer(), right.toBuffer());
}

function assertSafeUnsignedInteger(value: number, label: string) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
}

export function parseActiveRuleRewardTurnAllowlist(
  value: string | undefined,
): number[] {
  const entries = value
    ?.split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  if (!entries || entries.length === 0) {
    return [];
  }
  const turns = entries.map((entry) => Number(entry));
  if (turns.some((turnId) => !Number.isSafeInteger(turnId) || turnId <= 0)) {
    throw new Error(
      "Active-rule reward turn allowlist must contain positive safe integers.",
    );
  }
  if (new Set(turns).size !== turns.length) {
    throw new Error("Active-rule reward turn allowlist contains a duplicate.");
  }
  return turns.sort((left, right) => left - right);
}

export function decodeActiveRuleProposalFact(
  data: Uint8Array,
): ActiveRuleProposalFact {
  const bytes = Buffer.from(data);
  if (
    bytes.length < 56 ||
    !bytes.subarray(0, 8).equals(RULE_PROPOSAL_DISCRIMINATOR)
  ) {
    throw new Error("Active-rule proposal account is invalid.");
  }
  return {
    proposer: new PublicKey(bytes.subarray(24, 56)),
    ruleId: bytes.readBigUInt64LE(8),
    turnId: bytes.readBigUInt64LE(16),
  };
}

export function decodeActiveRuleVoteFact(
  data: Uint8Array,
): ActiveRuleVoteFact {
  const bytes = Buffer.from(data);
  if (
    bytes.length < 56 ||
    !bytes.subarray(0, 8).equals(RULE_VOTE_DISCRIMINATOR)
  ) {
    throw new Error("Active-rule vote account is invalid.");
  }
  return {
    ruleId: bytes.readBigUInt64LE(16),
    turnId: bytes.readBigUInt64LE(8),
    voter: new PublicKey(bytes.subarray(24, 56)),
  };
}

export function selectUniqueActiveRuleVoters({
  activeRuleId,
  turnId,
  votes,
}: {
  activeRuleId: number;
  turnId: number;
  votes: readonly ActiveRuleVoteFact[];
}) {
  const unique = new Map<string, PublicKey>();
  for (const vote of votes) {
    if (
      vote.turnId === BigInt(turnId) &&
      vote.ruleId === BigInt(activeRuleId)
    ) {
      unique.set(vote.voter.toBase58(), vote.voter);
    }
  }
  return [...unique.values()].sort(comparePublicKeys);
}

export function validateActiveRuleWinnerSummary({
  summary,
  turnId,
}: {
  summary: ActiveRuleWinnerSummary;
  turnId: number;
}) {
  if (summary.turnId !== turnId) {
    throw new Error("Winner summary turn does not match the requested turn.");
  }
  const alternative = summary.alternative;
  assertSafeUnsignedInteger(
    alternative.bucketLamports,
    "alternative bucket lamports",
  );
  assertSafeUnsignedInteger(
    alternative.individualPayoutLamports,
    "individual alternative payout lamports",
  );
  assertSafeUnsignedInteger(
    alternative.remainderLamports,
    "alternative remainder lamports",
  );
  assertSafeUnsignedInteger(
    alternative.winnerCount,
    "alternative winner count",
  );
  if (alternative.winnerCount === 0) {
    return null;
  }
  const bucket = BigInt(alternative.bucketLamports);
  const winnerCount = BigInt(alternative.winnerCount);
  const individualPayout = bucket / winnerCount;
  const remainder = bucket % winnerCount;
  if (
    BigInt(alternative.individualPayoutLamports) !== individualPayout ||
    BigInt(alternative.remainderLamports) !== remainder
  ) {
    throw new Error(
      "Winner summary does not reconcile to the alternative prize bucket.",
    );
  }
  return {
    alternativePrizePoolLamports: bucket,
    individualAlternativePayoutLamports: individualPayout,
    winnerCount,
  };
}

export function createActiveRuleRewardInstruction({
  authority,
  campaign,
  globalConfig,
  tycheProgramId,
  plan,
  ruleProposal,
  tokenomicsProgramId,
  turnState,
}: {
  authority: PublicKey;
  campaign: CampaignAccounts;
  globalConfig: PublicKey;
  tycheProgramId: PublicKey;
  plan: ActiveRuleRewardPlan;
  ruleProposal: PublicKey;
  tokenomicsProgramId: PublicKey;
  turnState: PublicKey;
}) {
  return new TransactionInstruction({
    data: Buffer.concat([
      SETTLE_ACTIVE_RULE_TOKEN_REWARDS_DISCRIMINATOR,
      u64Le(BigInt(plan.turnId)),
      u64Le(plan.alternativePrizePoolLamports),
      u64Le(plan.winnerCount),
    ]),
    keys: [
      { isSigner: true, isWritable: true, pubkey: authority },
      { isSigner: false, isWritable: false, pubkey: globalConfig },
      { isSigner: false, isWritable: false, pubkey: turnState },
      { isSigner: false, isWritable: false, pubkey: ruleProposal },
      { isSigner: false, isWritable: false, pubkey: tokenomicsProgramId },
      { isSigner: false, isWritable: false, pubkey: campaign.tokenConfig },
      { isSigner: false, isWritable: false, pubkey: campaign.mint },
      { isSigner: false, isWritable: true, pubkey: campaign.campaign },
      { isSigner: false, isWritable: true, pubkey: campaign.campaignVault },
      {
        isSigner: false,
        isWritable: true,
        pubkey: plan.creatorTokenAccount,
      },
      {
        isSigner: false,
        isWritable: true,
        pubkey: plan.activeRuleReward,
      },
      { isSigner: false, isWritable: false, pubkey: TOKEN_PROGRAM_ID },
      {
        isSigner: false,
        isWritable: false,
        pubkey: SystemProgram.programId,
      },
      ...plan.voterTokenAccounts.map((pubkey) => ({
        isSigner: false,
        isWritable: true,
        pubkey,
      })),
    ],
    programId: tycheProgramId,
  });
}

async function fetchWinnerSummary({
  apiBaseUrl,
  fetchImpl,
  turnId,
}: {
  apiBaseUrl: string;
  fetchImpl: typeof fetch;
  turnId: number;
}) {
  const response = await fetchImpl(
    `${apiBaseUrl.replace(/\/+$/, "")}/winner-records?turnId=${turnId}`,
  );
  if (!response.ok) {
    throw new Error(`Winner summary returned HTTP ${response.status}.`);
  }
  const payload = (await response.json()) as {
    winners?: ActiveRuleWinnerSummary;
  };
  if (!payload.winners) {
    throw new Error("Winner summary response is missing winners.");
  }
  return payload.winners;
}

async function listActiveRuleVotes(
  connection: Connection,
  tycheProgramId: PublicKey,
) {
  const accounts = await connection.getProgramAccounts(tycheProgramId, {
    commitment: DEFAULT_COMMITMENT,
    filters: [
      {
        memcmp: {
          bytes: bs58.encode(RULE_VOTE_DISCRIMINATOR),
          offset: 0,
        },
      },
    ],
  });
  return accounts.map(({ account }) => decodeActiveRuleVoteFact(account.data));
}

export async function inspectActiveRuleRewardSettlement({
  apiBaseUrl,
  connection,
  fetchImpl = fetch,
  tycheProgramId,
  tokenomicsProgramId,
  turnId,
}: {
  apiBaseUrl: string;
  connection: Connection;
  fetchImpl?: typeof fetch;
  tycheProgramId: PublicKey;
  tokenomicsProgramId: PublicKey;
  turnId: number;
}): Promise<ActiveRuleRewardInspection> {
  const turnState = derivePda(tycheProgramId, [
    Buffer.from("turn"),
    u64Le(BigInt(turnId)),
  ]);
  const turnInfo = await connection.getAccountInfo(
    turnState,
    DEFAULT_COMMITMENT,
  );
  if (!turnInfo || !turnInfo.owner.equals(tycheProgramId)) {
    throw new Error(`Turn ${turnId} is missing or has the wrong owner.`);
  }
  if (turnInfo.data.length !== CURRENT_TURN_STATE_DATA_LENGTH) {
    return {
      action: "not_eligible",
      reason: `legacy_turn_state_layout_${turnInfo.data.length}_bytes`,
      turnId,
    };
  }
  const turn = decodeSettlementTurnState(turnInfo.data, 1);
  if (turn.turnId !== turnId) {
    throw new Error("TurnState account data does not match its PDA.");
  }
  if (turn.drawStatus !== "fulfilled" || turn.activeRuleId === null) {
    return {
      action: "not_eligible",
      reason: "active_rule_with_alternative_winners_not_finalized",
      turnId,
    };
  }

  const activeRuleId = turn.activeRuleId;
  const ruleProposal = derivePda(tycheProgramId, [
    Buffer.from("rule"),
    u64Le(BigInt(turnId)),
    u64Le(BigInt(activeRuleId)),
  ]);
  const campaignAddress = derivePda(tokenomicsProgramId, [
    Buffer.from("campaign"),
    u64Le(0n),
  ]);
  const activeRuleReward = derivePda(tokenomicsProgramId, [
    Buffer.from("active_rule_reward"),
    campaignAddress.toBuffer(),
    u64Le(BigInt(turnId)),
  ]);

  const [proposalInfo, campaignInfo, settlementInfo, winnerSummary, votes] =
    await Promise.all([
      connection.getAccountInfo(ruleProposal, DEFAULT_COMMITMENT),
      connection.getAccountInfo(campaignAddress, DEFAULT_COMMITMENT),
      connection.getAccountInfo(activeRuleReward, DEFAULT_COMMITMENT),
      fetchWinnerSummary({ apiBaseUrl, fetchImpl, turnId }),
      listActiveRuleVotes(connection, tycheProgramId),
    ]);
  if (settlementInfo) {
    if (!settlementInfo.owner.equals(tokenomicsProgramId)) {
      throw new Error("Active-rule reward PDA exists with the wrong owner.");
    }
    return {
      action: "already_settled",
      reason: "canonical_active_rule_reward_receipt_exists",
      turnId,
    };
  }
  if (!proposalInfo || !proposalInfo.owner.equals(tycheProgramId)) {
    throw new Error("Active-rule proposal is missing or has the wrong owner.");
  }
  if (!campaignInfo || !campaignInfo.owner.equals(tokenomicsProgramId)) {
    throw new Error("Initial campaign is missing or has the wrong owner.");
  }

  const proposal = decodeActiveRuleProposalFact(proposalInfo.data);
  if (
    proposal.turnId !== BigInt(turnId) ||
    proposal.ruleId !== BigInt(activeRuleId)
  ) {
    throw new Error("Active-rule proposal facts do not match TurnState.");
  }
  const winnerFacts = validateActiveRuleWinnerSummary({
    summary: winnerSummary,
    turnId,
  });
  if (!winnerFacts || winnerFacts.individualAlternativePayoutLamports === 0n) {
    return {
      action: "not_eligible",
      reason: "no_alternative_winner_payout",
      turnId,
    };
  }

  const campaign = decodeCampaignAccounts({
    campaign: campaignAddress,
    data: campaignInfo.data,
    tokenomicsProgramId,
  });
  const voters = selectUniqueActiveRuleVoters({
    activeRuleId,
    turnId,
    votes,
  });
  const voterHex = voters.map((voter) => voter.toBuffer().toString("hex"));
  const calculated = calculateActiveRuleRewards(
    winnerFacts.alternativePrizePoolLamports,
    winnerFacts.winnerCount,
    campaign.remainingAtoms,
    voterHex,
  );
  const voterPayments = new Map(
    voters.map((voter, index) => [
      voter.toBase58(),
      calculated.voterPayments.get(voterHex[index] as string) ?? 0n,
    ]),
  );

  return {
    action: "ready",
    plan: {
      activeRuleId,
      activeRuleReward,
      alternativePrizePoolLamports:
        winnerFacts.alternativePrizePoolLamports,
      campaign,
      creator: proposal.proposer,
      creatorPaidAtoms: calculated.creatorPaidAtoms,
      creatorTokenAccount: deriveAssociatedTokenAddress({
        mint: campaign.mint,
        owner: proposal.proposer,
      }),
      globalConfig: derivePda(tycheProgramId, [
        Buffer.from("global_config"),
      ]),
      individualAlternativePayoutLamports:
        calculated.individualAlternativePayoutLamports,
      ruleProposal,
      remainingCampaignAtoms: calculated.remainingCampaignAtoms,
      turnId,
      turnState,
      voterPayments,
      voterPoolPaidAtoms: calculated.voterPoolPaidAtoms,
      voterTokenAccounts: voters.map((owner) =>
        deriveAssociatedTokenAddress({ mint: campaign.mint, owner }),
      ),
      voters,
      winnerCount: winnerFacts.winnerCount,
    },
    turnId,
  };
}

export async function simulateActiveRuleRewardSettlement({
  authority,
  connection,
  tycheProgramId,
  plan,
  tokenomicsProgramId,
}: {
  authority: Keypair;
  connection: Connection;
  tycheProgramId: PublicKey;
  plan: ActiveRuleRewardPlan;
  tokenomicsProgramId: PublicKey;
}) {
  const ownersByAta = new Map<string, PublicKey>([
    [plan.creatorTokenAccount.toBase58(), plan.creator],
    ...plan.voterTokenAccounts.map((ata, index) => [
      ata.toBase58(),
      plan.voters[index] as PublicKey,
    ] as const),
  ]);
  const missingTokenAccounts: Array<{
    address: PublicKey;
    owner: PublicKey;
  }> = [];
  for (const [address, owner] of ownersByAta) {
    const tokenAccount = new PublicKey(address);
    if (!await connection.getAccountInfo(tokenAccount, DEFAULT_COMMITMENT)) {
      missingTokenAccounts.push({ address: tokenAccount, owner });
    }
  }
  const instructions = [
    ...missingTokenAccounts.map(({ address, owner }) =>
      createAssociatedTokenInstruction({
        associatedToken: address,
        mint: plan.campaign.mint,
        owner,
        payer: authority.publicKey,
      }),
    ),
    createActiveRuleRewardInstruction({
      authority: authority.publicKey,
      campaign: plan.campaign,
      globalConfig: plan.globalConfig,
      tycheProgramId,
      plan,
      ruleProposal: plan.ruleProposal,
      tokenomicsProgramId,
      turnState: plan.turnState,
    }),
  ];
  const { blockhash } = await connection.getLatestBlockhash("confirmed");
  const transaction = new VersionedTransaction(
    new TransactionMessage({
      instructions,
      payerKey: authority.publicKey,
      recentBlockhash: blockhash,
    }).compileToV0Message(),
  );
  transaction.sign([authority]);
  const simulation = await connection.simulateTransaction(transaction, {
    commitment: "confirmed",
    sigVerify: true,
  });
  if (simulation.value.err) {
    throw new Error(
      `Active-rule reward dry-run simulation failed: ${stringifySimulationError(
        simulation.value.err,
      )}; logs=${stringifySimulationError(simulation.value.logs ?? [])}`,
    );
  }
  const fee = await connection.getFeeForMessage(
    transaction.message,
    "confirmed",
  );
  if (fee.value === null) {
    throw new Error("RPC did not return an active-rule reward fee estimate.");
  }
  const rentPerTokenAccountLamports =
    missingTokenAccounts.length === 0
      ? 0
      : await connection.getMinimumBalanceForRentExemption(
          165,
          DEFAULT_COMMITMENT,
        );
  return {
    computeUnitsConsumed: simulation.value.unitsConsumed ?? null,
    estimatedNetworkFeeLamports:
      fee.value * (missingTokenAccounts.length + 1),
    estimatedRentLamports:
      rentPerTokenAccountLamports * missingTokenAccounts.length,
    missingTokenAccounts: missingTokenAccounts.map(({ address }) =>
      address.toBase58(),
    ),
    simulation: "passed" as const,
    transactionCount: missingTokenAccounts.length + 1,
  };
}

async function ensureRewardTokenAccounts({
  authority,
  connection,
  plan,
}: {
  authority: Keypair;
  connection: Connection;
  plan: ActiveRuleRewardPlan;
}) {
  const ownersByAta = new Map<string, PublicKey>([
    [plan.creatorTokenAccount.toBase58(), plan.creator],
    ...plan.voterTokenAccounts.map((ata, index) => [
      ata.toBase58(),
      plan.voters[index] as PublicKey,
    ] as const),
  ]);
  for (const [ataAddress, owner] of ownersByAta) {
    const ata = new PublicKey(ataAddress);
    const account = await connection.getAccountInfo(ata, DEFAULT_COMMITMENT);
    if (account) {
      if (!account.owner.equals(TOKEN_PROGRAM_ID)) {
        throw new Error(`Reward token account ${ataAddress} has wrong owner.`);
      }
      continue;
    }
    await sendRewardTransaction({
      authority,
      connection,
      instructions: [
        createAssociatedTokenInstruction({
          associatedToken: ata,
          mint: plan.campaign.mint,
          owner,
          payer: authority.publicKey,
        }),
      ],
      label: `create reward ATA ${ataAddress}`,
    });
  }
}

export async function createActiveRuleRewardSettlementConfig(
  env = process.env,
): Promise<ActiveRuleRewardSettlementConfig> {
  const enabled = envFlag(
    env.TYCHE_ACTIVE_RULE_REWARD_SETTLEMENT_ENABLED,
  );
  const tokenomicsProgramId = env.TOKENOMICS_CORE_PROGRAM_ID
    ? new PublicKey(env.TOKENOMICS_CORE_PROGRAM_ID)
    : null;
  const turnAllowlist = parseActiveRuleRewardTurnAllowlist(
    env.TYCHE_ACTIVE_RULE_REWARD_TURN_ALLOWLIST,
  );
  if (enabled && !tokenomicsProgramId) {
    throw new Error(
      "Active-rule reward settlement is enabled but TOKENOMICS_CORE_PROGRAM_ID is not set.",
    );
  }
  if (enabled && turnAllowlist.length === 0) {
    throw new Error(
      "Active-rule reward settlement requires a non-empty explicit turn allowlist.",
    );
  }
  return {
    apiBaseUrl: env.TYCHE_API_BASE_URL ?? "http://localhost:3002",
    automation: await createTurnAutomationConfig(env),
    enabled,
    intervalMs: envNumber(
      env.TYCHE_ACTIVE_RULE_REWARD_SETTLEMENT_INTERVAL_MS,
      DEFAULT_INTERVAL_MS,
    ),
    tokenomicsProgramId,
    turnAllowlist,
  };
}

export async function runActiveRuleRewardSettlementOnce(
  config: ActiveRuleRewardSettlementConfig,
): Promise<ActiveRuleRewardSettlementResult> {
  if (!config.enabled) {
    return { action: "disabled" };
  }
  if (!config.automation.authorityKeypairBytes || !config.tokenomicsProgramId) {
    throw new Error(
      "Active-rule reward settlement requires the turn-authority keypair and Tokenomics Core program ID.",
    );
  }
  const authority = Keypair.fromSecretKey(
    config.automation.authorityKeypairBytes,
  );
  const connection = new Connection(
    config.automation.rpcUrl,
    DEFAULT_COMMITMENT,
  );
  const tycheProgramId = new PublicKey(
    config.automation.programId.toString(),
  );

  for (const turnId of config.turnAllowlist) {
    const inspection = await inspectActiveRuleRewardSettlement({
      apiBaseUrl: config.apiBaseUrl,
      connection,
      tycheProgramId,
      tokenomicsProgramId: config.tokenomicsProgramId,
      turnId,
    });
    if (inspection.action !== "ready") {
      continue;
    }
    await ensureRewardTokenAccounts({
      authority,
      connection,
      plan: inspection.plan,
    });
    const signature = await sendRewardTransaction({
      authority,
      connection,
      instructions: [
        createActiveRuleRewardInstruction({
          authority: authority.publicKey,
          campaign: inspection.plan.campaign,
          globalConfig: inspection.plan.globalConfig,
          tycheProgramId,
          plan: inspection.plan,
          ruleProposal: inspection.plan.ruleProposal,
          tokenomicsProgramId: config.tokenomicsProgramId,
          turnState: inspection.plan.turnState,
        }),
      ],
      label: `active-rule reward turn ${turnId}`,
    });
    const receipt = await connection.getAccountInfo(
      inspection.plan.activeRuleReward,
      DEFAULT_COMMITMENT,
    );
    if (!receipt || !receipt.owner.equals(config.tokenomicsProgramId)) {
      throw new Error(
        "Active-rule reward finalized without its canonical receipt.",
      );
    }
    return {
      action: "settled",
      activeRuleId: inspection.plan.activeRuleId,
      receipt: inspection.plan.activeRuleReward.toBase58(),
      signature,
      turnId,
    };
  }
  return { action: "nothing_to_settle" };
}

export function startActiveRuleRewardSettlementLoop(
  config: ActiveRuleRewardSettlementConfig,
) {
  if (!config.enabled) {
    return null;
  }
  let running = false;
  const run = async () => {
    if (running) {
      return;
    }
    running = true;
    try {
      const result = await runActiveRuleRewardSettlementOnce(config);
      if (result.action === "settled") {
        console.log(
          `active-rule reward turn=${result.turnId} activeRule=${result.activeRuleId} receipt=${result.receipt} signature=${result.signature}`,
        );
      }
    } catch (error) {
      console.error("active-rule reward settlement failed", error);
    } finally {
      running = false;
    }
  };
  void run();
  return setInterval(() => void run(), config.intervalMs);
}
