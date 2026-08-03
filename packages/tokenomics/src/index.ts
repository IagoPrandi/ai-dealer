import { createHash } from "node:crypto";

import {
  ACTIVE_RULE_REWARD_CAP_ATOMS,
  ACTIVE_RULE_REWARD_RATE_BPS as ACTIVE_RULE_REWARD_RATE_BPS_NUMBER,
  CAMPAIGN_REWARD_BPS_DENOMINATOR,
  CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
  CAMPAIGN_V1_ECONOMIC_CONFIG_HASH,
  CAMPAIGN_V2_ECONOMIC_CONFIG_HASH,
  PROPOSAL_REWARD_ATOMS,
  REFERRAL_INVITEE_REWARD_ATOMS,
  REFERRAL_INVITEE_REWARD_RATE_BPS,
  REFERRAL_INVITER_FIRST_ROUND_BONUS_RATE_BPS,
  REFERRAL_INVITER_REWARD_ATOMS,
  SUPPORTER_REWARD_ATOMS,
} from "@idealer/constants";

export const TOKEN_DECIMALS = 9;
export const TOKEN_ATOMS_PER_TOKEN = 1_000_000_000n;
export const FIXED_SUPPLY_ATOMS = 1_000_000_000n * TOKEN_ATOMS_PER_TOKEN;
export const INITIAL_CAMPAIGN_ALLOCATION_ATOMS =
  200_000_000n * TOKEN_ATOMS_PER_TOKEN;
export const CREATOR_TREASURY_ALLOCATION_ATOMS =
  800_000_000n * TOKEN_ATOMS_PER_TOKEN;
export const TURNS_PER_EPOCH = 7;
export const EPOCH_REVIEW_SECONDS = 24n * 60n * 60n;
export const CHALLENGE_RESOLUTION_SECONDS = 48n * 60n * 60n;
export const DEFAULT_CHALLENGE_BOND_LAMPORTS = 20_000_000n;
// A 2-of-3 multisig approval remains mandatory; the approved execution delay
// for treasury operations is intentionally zero.
export const TREASURY_OPERATION_DELAY_SECONDS = 0n;
export const UNPAUSE_NOTICE_SECONDS = 24n * 60n * 60n;
// Campaign reward economics live in @idealer/constants so the API, the web app
// and this package cannot drift apart; they are re-exported here because the
// on-chain mirror and the epoch calculators are consumed through this module.
export {
  ACTIVE_RULE_REWARD_CAP_ATOMS,
  CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
  CAMPAIGN_V1_ECONOMIC_CONFIG_HASH,
  CAMPAIGN_V2_ECONOMIC_CONFIG_HASH,
  PROPOSAL_REWARD_ATOMS,
  REFERRAL_INVITEE_REWARD_ATOMS,
  REFERRAL_INVITEE_REWARD_RATE_BPS,
  REFERRAL_INVITER_FIRST_ROUND_BONUS_RATE_BPS,
  REFERRAL_INVITER_REWARD_ATOMS,
  SUPPORTER_REWARD_ATOMS,
};
export const BPS_DENOMINATOR = CAMPAIGN_REWARD_BPS_DENOMINATOR;
export const ACTIVE_RULE_REWARD_RATE_BPS = BigInt(
  ACTIVE_RULE_REWARD_RATE_BPS_NUMBER,
);

const LEAF_DOMAIN = utf8("idealer:treasury-distribution-leaf:v1");
const NODE_DOMAIN = utf8("idealer:treasury-distribution-node:v1");
const MANIFEST_DOMAIN = "idealer:epoch-calculation-manifest:v1";

export type CampaignRewardKind =
  | "active_rule_creator"
  | "elected_rule_voter_pool"
  | "proposal"
  | "referral_invitee"
  | "referral_inviter"
  | "referral_inviter_first_round_bonus"
  | "supporter";

export interface CanonicalChainOrder {
  logIndex: number;
  signature: string;
  slot: bigint;
  transactionIndex: number;
}

export interface LockEvent extends CanonicalChainOrder {
  amountAtoms: bigint;
  positionId: string;
  timestamp: bigint;
  type: "lock" | "unlock";
}

export interface LockInterval {
  amountAtoms: bigint;
  endTimestamp: bigint;
  positionId: string;
  startTimestamp: bigint;
  weight: bigint;
}

export interface PositionWeight {
  positionId: string;
  weight: bigint;
}

export interface EpochClaimInput extends PositionWeight {
  beneficiary: Uint8Array;
}

export interface EpochClaim extends EpochClaimInput {
  amountLamports: bigint;
}

export interface EpochAccounting {
  claims: EpochClaim[];
  grossDistributableLamports: bigint;
  roundingDustLamports: bigint;
  rolloverOutLamports: bigint;
  sumOfMerkleClaimsLamports: bigint;
  totalWeight: bigint;
  zeroWeightRolloverOutLamports: bigint;
}

export interface TreasuryDistributionLeaf {
  amountLamports: bigint;
  asset: "SOL";
  beneficiary: Uint8Array;
  epochId: bigint;
  network: string;
  positionId: Uint8Array;
  programId: Uint8Array;
}

export interface MerkleLeafRecord {
  hash: Uint8Array;
  leaf: TreasuryDistributionLeaf;
}

export interface MerkleTree {
  leaves: MerkleLeafRecord[];
  levels: Uint8Array[][];
  root: Uint8Array;
}

export interface RewardLeg {
  beneficiary: string;
  kind: CampaignRewardKind;
  nominalAtoms: bigint;
}

export interface PaidRewardLeg extends RewardLeg {
  finalPartialReward: boolean;
  paidAtoms: bigint;
}

export interface CampaignSettlement {
  exhausted: boolean;
  legs: PaidRewardLeg[];
  remainingAtoms: bigint;
}

export interface ActiveRuleRewardCalculation {
  calculatedCreatorAtoms: bigint;
  calculatedVoterPoolAtoms: bigint;
  creatorPaidAtoms: bigint;
  individualAlternativePayoutLamports: bigint;
  remainingCampaignAtoms: bigint;
  voterPayments: ReadonlyMap<string, bigint>;
  voterPoolPaidAtoms: bigint;
}

export interface EpochManifestInput {
  calculationCodeCommit: string;
  epochId: bigint;
  grossDistributableLamports: bigint;
  leafFileHash: string;
  lockEventInputHash: string;
  lockIntervalOutputHash: string;
  network: string;
  programId: string;
  rolloverOutLamports: bigint;
  schemaVersion: string;
  slotEnd: bigint;
  slotStart: bigint;
  sumOfMerkleClaimsLamports: bigint;
  totalWeight: bigint;
}

export interface RootLifecycleTimes {
  resolutionDeadline: bigint;
  verificationWindowEndsAt: bigint;
}

export function assertFixedSupplyAllocation(
  campaignAtoms: bigint,
  treasuryAtoms: bigint,
): void {
  if (campaignAtoms !== INITIAL_CAMPAIGN_ALLOCATION_ATOMS) {
    throw new Error("invalid_initial_campaign_allocation");
  }
  if (treasuryAtoms !== CREATOR_TREASURY_ALLOCATION_ATOMS) {
    throw new Error("invalid_creator_treasury_allocation");
  }
  if (campaignAtoms + treasuryAtoms !== FIXED_SUPPLY_ATOMS) {
    throw new Error("invalid_fixed_supply_allocation");
  }
}

export function compareChainOrder(
  left: CanonicalChainOrder,
  right: CanonicalChainOrder,
): number {
  if (left.slot !== right.slot) {
    return left.slot < right.slot ? -1 : 1;
  }
  if (left.transactionIndex !== right.transactionIndex) {
    return left.transactionIndex - right.transactionIndex;
  }
  if (left.logIndex !== right.logIndex) {
    return left.logIndex - right.logIndex;
  }
  return left.signature.localeCompare(right.signature);
}

export function deriveLockIntervals(
  events: readonly LockEvent[],
  epochStartsAt: bigint,
  epochEndsAt: bigint,
): LockInterval[] {
  if (epochStartsAt < 0n || epochEndsAt <= epochStartsAt) {
    throw new Error("invalid_epoch_boundary");
  }

  const ordered = [...events].sort(compareChainOrder);
  const states = new Map<
    string,
    { amountAtoms: bigint; lastTimestamp: bigint }
  >();
  const intervals: LockInterval[] = [];

  for (const event of ordered) {
    if (event.amountAtoms <= 0n) {
      throw new Error("lock_event_amount_must_be_positive");
    }
    if (event.timestamp < epochStartsAt || event.timestamp > epochEndsAt) {
      throw new Error("lock_event_outside_epoch");
    }

    const state = states.get(event.positionId) ?? {
      amountAtoms: 0n,
      lastTimestamp: epochStartsAt,
    };
    if (event.timestamp < state.lastTimestamp) {
      throw new Error("lock_event_timestamp_regression");
    }
    appendInterval(
      intervals,
      event.positionId,
      state.amountAtoms,
      state.lastTimestamp,
      event.timestamp,
    );

    if (event.type === "lock") {
      state.amountAtoms += event.amountAtoms;
    } else {
      if (event.amountAtoms > state.amountAtoms) {
        throw new Error("lock_event_underflow");
      }
      state.amountAtoms -= event.amountAtoms;
    }
    state.lastTimestamp = event.timestamp;
    states.set(event.positionId, state);
  }

  for (const [positionId, state] of states) {
    appendInterval(
      intervals,
      positionId,
      state.amountAtoms,
      state.lastTimestamp,
      epochEndsAt,
    );
  }

  return intervals;
}

export function aggregatePositionWeights(
  intervals: readonly LockInterval[],
): PositionWeight[] {
  const weights = new Map<string, bigint>();
  for (const interval of intervals) {
    if (
      interval.amountAtoms < 0n ||
      interval.endTimestamp < interval.startTimestamp ||
      interval.weight !==
        interval.amountAtoms * (interval.endTimestamp - interval.startTimestamp)
    ) {
      throw new Error("invalid_lock_interval");
    }
    weights.set(
      interval.positionId,
      (weights.get(interval.positionId) ?? 0n) + interval.weight,
    );
  }
  return [...weights.entries()]
    .map(([positionId, weight]) => ({ positionId, weight }))
    .sort((left, right) => left.positionId.localeCompare(right.positionId));
}

export function calculateEpochAccounting(
  grossTreasuryFeesLamports: bigint,
  rolloverInLamports: bigint,
  positions: readonly EpochClaimInput[],
): EpochAccounting {
  if (grossTreasuryFeesLamports < 0n || rolloverInLamports < 0n) {
    throw new Error("negative_epoch_amount");
  }
  const grossDistributableLamports =
    grossTreasuryFeesLamports + rolloverInLamports;
  const seen = new Set<string>();
  let totalWeight = 0n;
  for (const position of positions) {
    if (position.weight < 0n) {
      throw new Error("negative_position_weight");
    }
    if (seen.has(position.positionId)) {
      throw new Error("duplicate_position");
    }
    assertBytes32(position.beneficiary, "beneficiary");
    seen.add(position.positionId);
    totalWeight += position.weight;
  }

  if (totalWeight === 0n) {
    return {
      claims: [],
      grossDistributableLamports,
      roundingDustLamports: 0n,
      rolloverOutLamports: grossDistributableLamports,
      sumOfMerkleClaimsLamports: 0n,
      totalWeight,
      zeroWeightRolloverOutLamports: grossDistributableLamports,
    };
  }

  const claims = positions
    .filter((position) => position.weight > 0n)
    .map((position) => ({
      ...position,
      amountLamports:
        (grossDistributableLamports * position.weight) / totalWeight,
    }))
    .sort((left, right) => left.positionId.localeCompare(right.positionId));
  const sumOfMerkleClaimsLamports = claims.reduce(
    (sum, claim) => sum + claim.amountLamports,
    0n,
  );
  const roundingDustLamports =
    grossDistributableLamports - sumOfMerkleClaimsLamports;

  return {
    claims,
    grossDistributableLamports,
    roundingDustLamports,
    rolloverOutLamports: roundingDustLamports,
    sumOfMerkleClaimsLamports,
    totalWeight,
    zeroWeightRolloverOutLamports: 0n,
  };
}

export function hashTreasuryDistributionLeaf(
  leaf: TreasuryDistributionLeaf,
): Uint8Array {
  assertBytes32(leaf.programId, "program_id");
  assertBytes32(leaf.positionId, "position_id");
  assertBytes32(leaf.beneficiary, "beneficiary");
  if (leaf.amountLamports < 0n || leaf.epochId < 0n) {
    throw new Error("negative_leaf_value");
  }
  if (leaf.asset !== "SOL") {
    throw new Error("unsupported_leaf_asset");
  }
  const network = utf8(leaf.network);
  if (network.length === 0 || network.length > 32) {
    throw new Error("invalid_network");
  }
  return sha256(
    concat(
      LEAF_DOMAIN,
      leaf.programId,
      u32le(network.length),
      network,
      u64le(leaf.epochId),
      leaf.positionId,
      leaf.beneficiary,
      Uint8Array.of(0),
      u64le(leaf.amountLamports),
    ),
  );
}

export function buildMerkleTree(
  leaves: readonly TreasuryDistributionLeaf[],
): MerkleTree {
  const records = leaves
    .map((leaf) => ({ hash: hashTreasuryDistributionLeaf(leaf), leaf }))
    .sort((left, right) => compareBytes(left.hash, right.hash));
  if (records.length === 0) {
    throw new Error("empty_merkle_tree");
  }
  const levels: Uint8Array[][] = [records.map((record) => record.hash)];
  while ((levels.at(-1)?.length ?? 0) > 1) {
    const current = levels.at(-1);
    if (!current) {
      throw new Error("missing_merkle_level");
    }
    const next: Uint8Array[] = [];
    for (let index = 0; index < current.length; index += 2) {
      const left = current[index];
      const right = current[index + 1] ?? left;
      if (!left || !right) {
        throw new Error("invalid_merkle_pair");
      }
      next.push(hashMerkleNode(left, right));
    }
    levels.push(next);
  }
  const root = levels.at(-1)?.[0];
  if (!root) {
    throw new Error("missing_merkle_root");
  }
  return { leaves: records, levels, root };
}

export function createMerkleProof(
  tree: MerkleTree,
  leafHash: Uint8Array,
): Uint8Array[] {
  let index = tree.levels[0]?.findIndex(
    (candidate) => compareBytes(candidate, leafHash) === 0,
  );
  if (index === undefined || index < 0) {
    throw new Error("merkle_leaf_not_found");
  }
  const proof: Uint8Array[] = [];
  for (
    let levelIndex = 0;
    levelIndex < tree.levels.length - 1;
    levelIndex += 1
  ) {
    const level = tree.levels[levelIndex];
    if (!level) {
      throw new Error("missing_merkle_level");
    }
    const siblingIndex = index % 2 === 0 ? index + 1 : index - 1;
    proof.push(level[siblingIndex] ?? (level[index] as Uint8Array));
    index = Math.floor(index / 2);
  }
  return proof;
}

export function verifyMerkleProof(
  root: Uint8Array,
  leafHash: Uint8Array,
  proof: readonly Uint8Array[],
): boolean {
  assertBytes32(root, "merkle_root");
  assertBytes32(leafHash, "leaf_hash");
  let cursor = leafHash;
  for (const sibling of proof) {
    assertBytes32(sibling, "merkle_sibling");
    cursor = hashMerkleNode(cursor, sibling);
  }
  return compareBytes(cursor, root) === 0;
}

export function serializeCanonicalLeafFile(
  leaves: readonly TreasuryDistributionLeaf[],
): string {
  return [...leaves]
    .sort((left, right) => {
      const positionOrder = compareBytes(left.positionId, right.positionId);
      return positionOrder !== 0
        ? positionOrder
        : compareBytes(left.beneficiary, right.beneficiary);
    })
    .map((leaf) =>
      canonicalJson({
        amountLamports: leaf.amountLamports.toString(),
        asset: leaf.asset,
        beneficiary: toHex(leaf.beneficiary),
        epochId: leaf.epochId.toString(),
        network: leaf.network,
        positionId: toHex(leaf.positionId),
        programId: toHex(leaf.programId),
      }),
    )
    .join("\n");
}

export function hashCanonicalLeafFile(
  leaves: readonly TreasuryDistributionLeaf[],
): string {
  return toHex(sha256(utf8(serializeCanonicalLeafFile(leaves))));
}

export function hashEpochManifest(input: EpochManifestInput): string {
  return toHex(
    sha256(
      utf8(
        canonicalJson({
          calculationCodeCommit: input.calculationCodeCommit,
          domain: MANIFEST_DOMAIN,
          epochId: input.epochId.toString(),
          grossDistributableLamports:
            input.grossDistributableLamports.toString(),
          leafFileHash: input.leafFileHash,
          lockEventInputHash: input.lockEventInputHash,
          lockIntervalOutputHash: input.lockIntervalOutputHash,
          network: input.network,
          programId: input.programId,
          rolloverOutLamports: input.rolloverOutLamports.toString(),
          schemaVersion: input.schemaVersion,
          slotEnd: input.slotEnd.toString(),
          slotStart: input.slotStart.toString(),
          sumOfMerkleClaimsLamports: input.sumOfMerkleClaimsLamports.toString(),
          totalWeight: input.totalWeight.toString(),
        }),
      ),
    ),
  );
}

export function settleCampaignRewardLegs(
  availableAtoms: bigint,
  legs: readonly RewardLeg[],
): CampaignSettlement {
  if (availableAtoms < 0n) {
    throw new Error("negative_campaign_balance");
  }
  let remainingAtoms = availableAtoms;
  const paidLegs: PaidRewardLeg[] = [];
  for (const leg of legs) {
    if (leg.nominalAtoms < 0n) {
      throw new Error("negative_reward_leg");
    }
    const paidAtoms =
      leg.nominalAtoms < remainingAtoms ? leg.nominalAtoms : remainingAtoms;
    paidLegs.push({
      ...leg,
      finalPartialReward: paidAtoms > 0n && paidAtoms < leg.nominalAtoms,
      paidAtoms,
    });
    remainingAtoms -= paidAtoms;
  }
  return {
    exhausted: remainingAtoms === 0n,
    legs: paidLegs,
    remainingAtoms,
  };
}

export function splitVoterPool(
  poolAtoms: bigint,
  eligibleWallets: readonly string[],
): ReadonlyMap<string, bigint> {
  if (poolAtoms < 0n) {
    throw new Error("negative_voter_pool");
  }
  const wallets = [...new Set(eligibleWallets)].sort(comparePublicKeyStrings);
  if (wallets.length === 0) {
    return new Map();
  }
  const count = BigInt(wallets.length);
  const base = poolAtoms / count;
  const remainder = Number(poolAtoms % count);
  return new Map(
    wallets.map((wallet, index) => [
      wallet,
      base + (index < remainder ? 1n : 0n),
    ]),
  );
}

export function calculateActiveRuleRewards(
  alternativePrizePoolLamports: bigint,
  winnerCount: bigint,
  availableCampaignAtoms: bigint,
  eligibleVoterWallets: readonly string[],
): ActiveRuleRewardCalculation {
  if (
    alternativePrizePoolLamports < 0n ||
    winnerCount <= 0n ||
    availableCampaignAtoms < 0n
  ) {
    throw new Error("invalid_active_rule_reward_input");
  }
  const individualAlternativePayoutLamports =
    alternativePrizePoolLamports / winnerCount;
  const calculatedCreatorAtoms =
    (individualAlternativePayoutLamports * ACTIVE_RULE_REWARD_RATE_BPS) /
    BPS_DENOMINATOR;
  const calculatedVoterPoolAtoms = calculatedCreatorAtoms;
  const creatorPaidAtoms = minBigInt(
    calculatedCreatorAtoms,
    ACTIVE_RULE_REWARD_CAP_ATOMS,
    availableCampaignAtoms,
  );
  let remainingCampaignAtoms = availableCampaignAtoms - creatorPaidAtoms;
  const nominalVoterPool =
    eligibleVoterWallets.length === 0
      ? 0n
      : minBigInt(
          calculatedVoterPoolAtoms,
          ACTIVE_RULE_REWARD_CAP_ATOMS,
          remainingCampaignAtoms,
        );
  remainingCampaignAtoms -= nominalVoterPool;
  return {
    calculatedCreatorAtoms,
    calculatedVoterPoolAtoms,
    creatorPaidAtoms,
    individualAlternativePayoutLamports,
    remainingCampaignAtoms,
    voterPayments: splitVoterPool(nominalVoterPool, eligibleVoterWallets),
    voterPoolPaidAtoms: nominalVoterPool,
  };
}

export function calculateInviterFirstRoundBonus(
  actuallyPaidInviteeRewardAtoms: readonly bigint[],
): bigint {
  const eligibleBase = actuallyPaidInviteeRewardAtoms.reduce((sum, amount) => {
    if (amount < 0n) {
      throw new Error("negative_invitee_reward");
    }
    return sum + amount;
  }, 0n);
  return (
    (eligibleBase * REFERRAL_INVITER_FIRST_ROUND_BONUS_RATE_BPS) /
    BPS_DENOMINATOR
  );
}

export function rootLifecycleTimes(
  provisionalPublishedAt: bigint,
): RootLifecycleTimes {
  if (provisionalPublishedAt < 0n) {
    throw new Error("invalid_root_publication_time");
  }
  const verificationWindowEndsAt =
    provisionalPublishedAt + EPOCH_REVIEW_SECONDS;
  return {
    resolutionDeadline: verificationWindowEndsAt + CHALLENGE_RESOLUTION_SECONDS,
    verificationWindowEndsAt,
  };
}

export function isFirstActionFree(
  turnIndex: bigint,
  sequence: bigint,
  freeActionWindowEndsBeforeTurnIndex: bigint,
): boolean {
  if (
    turnIndex < 0n ||
    sequence <= 0n ||
    freeActionWindowEndsBeforeTurnIndex < 0n
  ) {
    throw new Error("invalid_fee_window_input");
  }
  return sequence === 1n && turnIndex < freeActionWindowEndsBeforeTurnIndex;
}

export function repeatedActionFeeAtoms(
  baseFee: bigint,
  turnIndex: bigint,
  sequence: bigint,
  freeActionWindowEndsBeforeTurnIndex: bigint,
): bigint {
  if (baseFee < 0n || sequence <= 0n || sequence > 63n) {
    throw new Error("invalid_repeated_action_fee_input");
  }
  if (
    isFirstActionFree(turnIndex, sequence, freeActionWindowEndsBeforeTurnIndex)
  ) {
    return 0n;
  }
  return baseFee * (1n << sequence);
}

function appendInterval(
  intervals: LockInterval[],
  positionId: string,
  amountAtoms: bigint,
  startTimestamp: bigint,
  endTimestamp: bigint,
): void {
  if (amountAtoms === 0n || startTimestamp === endTimestamp) {
    return;
  }
  if (amountAtoms < 0n || endTimestamp < startTimestamp) {
    throw new Error("invalid_lock_interval");
  }
  intervals.push({
    amountAtoms,
    endTimestamp,
    positionId,
    startTimestamp,
    weight: amountAtoms * (endTimestamp - startTimestamp),
  });
}

function hashMerkleNode(left: Uint8Array, right: Uint8Array): Uint8Array {
  assertBytes32(left, "left_node");
  assertBytes32(right, "right_node");
  const ordered =
    compareBytes(left, right) <= 0 ? [left, right] : [right, left];
  return sha256(
    concat(NODE_DOMAIN, ordered[0] as Uint8Array, ordered[1] as Uint8Array),
  );
}

function comparePublicKeyStrings(left: string, right: string): number {
  const leftBytes = decodePublicKeyString(left);
  const rightBytes = decodePublicKeyString(right);
  return compareBytes(leftBytes, rightBytes);
}

function decodePublicKeyString(value: string): Uint8Array {
  if (/^[\da-f]{64}$/i.test(value)) {
    return Uint8Array.from(Buffer.from(value, "hex"));
  }
  throw new Error("wallet_key_must_be_32_byte_hex");
}

function canonicalJson(value: Record<string, string>): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(value).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
  );
}

function minBigInt(...values: bigint[]): bigint {
  if (values.length === 0) {
    throw new Error("min_requires_value");
  }
  return values.reduce((minimum, value) => (value < minimum ? value : minimum));
}

function assertBytes32(value: Uint8Array, field: string): void {
  if (value.length !== 32) {
    throw new Error(`${field}_must_be_32_bytes`);
  }
}

function compareBytes(left: Uint8Array, right: Uint8Array): number {
  return Buffer.compare(Buffer.from(left), Buffer.from(right));
}

function concat(...values: Uint8Array[]): Uint8Array {
  return Uint8Array.from(
    Buffer.concat(values.map((value) => Buffer.from(value))),
  );
}

function sha256(value: Uint8Array): Uint8Array {
  return Uint8Array.from(createHash("sha256").update(value).digest());
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function u32le(value: number): Uint8Array {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffff_ffff) {
    throw new Error("u32_out_of_range");
  }
  const buffer = Buffer.alloc(4);
  buffer.writeUInt32LE(value);
  return Uint8Array.from(buffer);
}

function u64le(value: bigint): Uint8Array {
  if (value < 0n || value > 0xffff_ffff_ffff_ffffn) {
    throw new Error("u64_out_of_range");
  }
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(value);
  return Uint8Array.from(buffer);
}

function toHex(value: Uint8Array): string {
  return Buffer.from(value).toString("hex");
}
