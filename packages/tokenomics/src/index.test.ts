import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTIVE_RULE_REWARD_CAP_ATOMS,
  calculateActiveRuleRewards,
  calculateEpochAccounting,
  calculateInviterFirstRoundBonus,
  createMerkleProof,
  CREATOR_TREASURY_ALLOCATION_ATOMS,
  deriveLockIntervals,
  FIXED_SUPPLY_ATOMS,
  hashCanonicalLeafFile,
  hashTreasuryDistributionLeaf,
  INITIAL_CAMPAIGN_ALLOCATION_ATOMS,
  PROPOSAL_REWARD_ATOMS,
  REFERRAL_INVITEE_REWARD_ATOMS,
  repeatedActionFeeAtoms,
  settleCampaignRewardLegs,
  splitVoterPool,
  SUPPORTER_REWARD_ATOMS,
  TREASURY_OPERATION_DELAY_SECONDS,
  aggregatePositionWeights,
  assertFixedSupplyAllocation,
  buildMerkleTree,
  verifyMerkleProof,
  type LockEvent,
  type TreasuryDistributionLeaf,
} from "./index.js";

const bytes = (value: number) => new Uint8Array(32).fill(value);
const wallet = (value: number) => Buffer.from(bytes(value)).toString("hex");

test("fixed supply allocation is exact", () => {
  assertFixedSupplyAllocation(
    INITIAL_CAMPAIGN_ALLOCATION_ATOMS,
    CREATOR_TREASURY_ALLOCATION_ATOMS,
  );
  assert.equal(
    INITIAL_CAMPAIGN_ALLOCATION_ATOMS + CREATOR_TREASURY_ALLOCATION_ATOMS,
    FIXED_SUPPLY_ATOMS,
  );
  assert.throws(
    () =>
      assertFixedSupplyAllocation(
        INITIAL_CAMPAIGN_ALLOCATION_ATOMS - 1n,
        CREATOR_TREASURY_ALLOCATION_ATOMS + 1n,
      ),
    /invalid_initial_campaign_allocation/,
  );
});

test("treasury operations have no post-approval execution delay", () => {
  assert.equal(TREASURY_OPERATION_DELAY_SECONDS, 0n);
});

test("lock intervals use amount multiplied by confirmed time", () => {
  const events: LockEvent[] = [
    {
      amountAtoms: 10n,
      logIndex: 0,
      positionId: "alice",
      signature: "a",
      slot: 1n,
      timestamp: 10n,
      transactionIndex: 0,
      type: "lock",
    },
    {
      amountAtoms: 4n,
      logIndex: 0,
      positionId: "alice",
      signature: "b",
      slot: 2n,
      timestamp: 30n,
      transactionIndex: 0,
      type: "unlock",
    },
    {
      amountAtoms: 5n,
      logIndex: 0,
      positionId: "bob",
      signature: "c",
      slot: 2n,
      timestamp: 20n,
      transactionIndex: 1,
      type: "lock",
    },
  ];
  const intervals = deriveLockIntervals(events, 0n, 50n);
  assert.deepEqual(aggregatePositionWeights(intervals), [
    { positionId: "alice", weight: 320n },
    { positionId: "bob", weight: 150n },
  ]);
});

test("lock events cannot backdate or unlock more than locked", () => {
  assert.throws(
    () =>
      deriveLockIntervals(
        [
          {
            amountAtoms: 1n,
            logIndex: 0,
            positionId: "alice",
            signature: "a",
            slot: 1n,
            timestamp: 5n,
            transactionIndex: 0,
            type: "unlock",
          },
        ],
        0n,
        10n,
      ),
    /lock_event_underflow/,
  );
});

test("epoch accounting floors claims and rolls only dust", () => {
  const accounting = calculateEpochAccounting(10n, 1n, [
    { beneficiary: bytes(1), positionId: "alice", weight: 2n },
    { beneficiary: bytes(2), positionId: "bob", weight: 1n },
  ]);
  assert.equal(accounting.grossDistributableLamports, 11n);
  assert.deepEqual(
    accounting.claims.map((claim) => claim.amountLamports),
    [7n, 3n],
  );
  assert.equal(accounting.sumOfMerkleClaimsLamports, 10n);
  assert.equal(accounting.roundingDustLamports, 1n);
  assert.equal(accounting.rolloverOutLamports, 1n);
});

test("zero-weight epoch creates no liability and rolls all funds", () => {
  const accounting = calculateEpochAccounting(9n, 2n, []);
  assert.deepEqual(accounting.claims, []);
  assert.equal(accounting.totalWeight, 0n);
  assert.equal(accounting.sumOfMerkleClaimsLamports, 0n);
  assert.equal(accounting.zeroWeightRolloverOutLamports, 11n);
  assert.equal(accounting.rolloverOutLamports, 11n);
});

test("domain-separated Merkle proof binds beneficiary and amount", () => {
  const leaves: TreasuryDistributionLeaf[] = [1, 2, 3].map((value) => ({
    amountLamports: BigInt(value * 10),
    asset: "SOL",
    beneficiary: bytes(value),
    epochId: 7n,
    network: "devnet",
    positionId: bytes(value + 10),
    programId: bytes(9),
  }));
  const tree = buildMerkleTree(leaves);
  const leafHash = hashTreasuryDistributionLeaf(
    leaves[1] as TreasuryDistributionLeaf,
  );
  const proof = createMerkleProof(tree, leafHash);
  assert.equal(verifyMerkleProof(tree.root, leafHash, proof), true);
  assert.equal(
    verifyMerkleProof(
      tree.root,
      hashTreasuryDistributionLeaf({
        ...(leaves[1] as TreasuryDistributionLeaf),
        amountLamports: 21n,
      }),
      proof,
    ),
    false,
  );
  assert.equal(hashCanonicalLeafFile(leaves).length, 64);
  assert.equal(
    Buffer.from(
      hashTreasuryDistributionLeaf(leaves[0] as TreasuryDistributionLeaf),
    ).toString("hex"),
    "a4d6c762066fd5e3eb46de10800da4244543b5395d8c04992357dd57f6a1b5b9",
  );
});

test("terminal partial reward consumes the exact remaining atoms", () => {
  const settlement = settleCampaignRewardLegs(650_000_000n, [
    {
      beneficiary: wallet(1),
      kind: "proposal",
      nominalAtoms: PROPOSAL_REWARD_ATOMS,
    },
    {
      beneficiary: wallet(2),
      kind: "supporter",
      nominalAtoms: SUPPORTER_REWARD_ATOMS,
    },
  ]);
  assert.equal(settlement.legs[0]?.paidAtoms, 600_000_000n);
  assert.equal(settlement.legs[1]?.paidAtoms, 50_000_000n);
  assert.equal(settlement.legs[1]?.finalPartialReward, true);
  assert.equal(settlement.remainingAtoms, 0n);
  assert.equal(settlement.exhausted, true);
});

test("voter remainder follows canonical public-key byte order", () => {
  const payments = splitVoterPool(5n, [
    wallet(3),
    wallet(1),
    wallet(2),
    wallet(1),
  ]);
  assert.deepEqual(
    [...payments],
    [
      [wallet(1), 2n],
      [wallet(2), 2n],
      [wallet(3), 1n],
    ],
  );
});

test("active-rule rewards cap independently and debit creator first", () => {
  const result = calculateActiveRuleRewards(10_000_000_000n, 1n, 400_000_000n, [
    wallet(1),
    wallet(2),
    wallet(3),
  ]);
  assert.equal(result.calculatedCreatorAtoms, 2_250_000_000n);
  assert.equal(result.creatorPaidAtoms, ACTIVE_RULE_REWARD_CAP_ATOMS);
  assert.equal(result.voterPoolPaidAtoms, 150_000_000n);
  assert.equal(result.remainingCampaignAtoms, 0n);
  assert.equal(
    [...result.voterPayments.values()].reduce((sum, value) => sum + value, 0n),
    150_000_000n,
  );
});

test("referral first-round bonus uses actually paid closed-list inputs", () => {
  // 22.5% of the invitee base (0.3) + proposal (0.6) + supporter (0.09) legs.
  assert.equal(
    calculateInviterFirstRoundBonus([
      REFERRAL_INVITEE_REWARD_ATOMS,
      PROPOSAL_REWARD_ATOMS,
      SUPPORTER_REWARD_ATOMS,
    ]),
    222_750_000n,
  );
});

test("environment-configured free window and exponential fee are exact", () => {
  assert.equal(repeatedActionFeeAtoms(10n, 29n, 1n, 30n), 0n);
  assert.equal(repeatedActionFeeAtoms(10n, 30n, 1n, 30n), 20n);
  assert.equal(repeatedActionFeeAtoms(10n, 1n, 2n, 30n), 40n);
  assert.equal(repeatedActionFeeAtoms(10n, 99n, 1n, 100n), 0n);
  assert.equal(repeatedActionFeeAtoms(10n, 100n, 1n, 100n), 20n);
});
