import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  createActiveRuleRewardInstruction,
  decodeActiveRuleProposalFact,
  decodeActiveRuleVoteFact,
  parseActiveRuleRewardTurnAllowlist,
  selectUniqueActiveRuleVoters,
  validateActiveRuleWinnerSummary,
  type ActiveRuleRewardPlan,
} from "./active-rule-reward-settlement.js";
import { CURRENT_TURN_STATE_DATA_LENGTH } from "./settlement.js";

const TYCHE_PROGRAM = key(1);
const TOKENOMICS_PROGRAM = key(2);
const AUTHORITY = key(3);
const GLOBAL_CONFIG = key(4);
const TURN_STATE = key(5);
const RULE_PROPOSAL = key(6);
const CAMPAIGN = key(7);
const CAMPAIGN_VAULT = key(8);
const MINT = key(9);
const TOKEN_CONFIG = key(10);
const CREATOR = key(11);
const CREATOR_TOKEN_ACCOUNT = key(12);
const ACTIVE_RULE_REWARD = key(13);

function key(value: number) {
  return new PublicKey(Buffer.alloc(32, value));
}

function discriminator(namespace: "account" | "global", name: string) {
  return createHash("sha256")
    .update(`${namespace}:${name}`)
    .digest()
    .subarray(0, 8);
}

function factData({
  account,
  identity,
  ruleId,
  turnId,
}: {
  account: "RuleProposal" | "RuleVote";
  identity: PublicKey;
  ruleId: bigint;
  turnId: bigint;
}) {
  const data = Buffer.alloc(80);
  discriminator("account", account).copy(data, 0);
  if (account === "RuleProposal") {
    data.writeBigUInt64LE(ruleId, 8);
    data.writeBigUInt64LE(turnId, 16);
  } else {
    data.writeBigUInt64LE(turnId, 8);
    data.writeBigUInt64LE(ruleId, 16);
  }
  identity.toBuffer().copy(data, 24);
  return data;
}

test("decodes proposal and vote facts only from their canonical account layouts", () => {
  const proposal = decodeActiveRuleProposalFact(
    factData({
      account: "RuleProposal",
      identity: CREATOR,
      ruleId: 7n,
      turnId: 4n,
    }),
  );
  assert.equal(proposal.turnId, 4n);
  assert.equal(proposal.ruleId, 7n);
  assert.equal(proposal.proposer.toBase58(), CREATOR.toBase58());

  const vote = decodeActiveRuleVoteFact(
    factData({
      account: "RuleVote",
      identity: key(21),
      ruleId: 7n,
      turnId: 4n,
    }),
  );
  assert.equal(vote.turnId, 4n);
  assert.equal(vote.ruleId, 7n);
  assert.equal(vote.voter.toBase58(), key(21).toBase58());

  assert.throws(
    () =>
      decodeActiveRuleProposalFact(
        factData({
          account: "RuleVote",
          identity: key(21),
          ruleId: 7n,
          turnId: 4n,
        }),
      ),
    /proposal account is invalid/,
  );
});

test("deduplicates repeated votes and sorts voters by public-key bytes", () => {
  const lower = new PublicKey(
    Buffer.from([0, ...Buffer.alloc(31, 255)]),
  );
  const higher = new PublicKey(
    Buffer.from([1, ...Buffer.alloc(31, 0)]),
  );
  const selected = selectUniqueActiveRuleVoters({
    activeRuleId: 7,
    turnId: 4,
    votes: [
      { ruleId: 7n, turnId: 4n, voter: higher },
      { ruleId: 7n, turnId: 4n, voter: lower },
      { ruleId: 7n, turnId: 4n, voter: higher },
      { ruleId: 8n, turnId: 4n, voter: key(22) },
      { ruleId: 7n, turnId: 5n, voter: key(23) },
    ],
  });
  assert.deepEqual(
    selected.map((voter) => voter.toBase58()),
    [lower.toBase58(), higher.toBase58()],
  );
});

test("accepts only winner summaries that exactly reconcile quotient and remainder", () => {
  assert.deepEqual(
    validateActiveRuleWinnerSummary({
      summary: {
        alternative: {
          bucketLamports: 10,
          individualPayoutLamports: 3,
          remainderLamports: 1,
          winnerCount: 3,
        },
        turnId: 4,
      },
      turnId: 4,
    }),
    {
      alternativePrizePoolLamports: 10n,
      individualAlternativePayoutLamports: 3n,
      winnerCount: 3n,
    },
  );
  assert.equal(
    validateActiveRuleWinnerSummary({
      summary: {
        alternative: {
          bucketLamports: 10,
          individualPayoutLamports: 0,
          remainderLamports: 10,
          winnerCount: 0,
        },
        turnId: 4,
      },
      turnId: 4,
    }),
    null,
  );
  assert.throws(
    () =>
      validateActiveRuleWinnerSummary({
        summary: {
          alternative: {
            bucketLamports: 10,
            individualPayoutLamports: 4,
            remainderLamports: 1,
            winnerCount: 3,
          },
          turnId: 4,
        },
        turnId: 4,
      }),
    /does not reconcile/,
  );
});

test("builds the exact Tyche CPI with canonical voter account order", () => {
  const voterTokenAccounts = [key(31), key(32)];
  const plan: ActiveRuleRewardPlan = {
    activeRuleId: 7,
    activeRuleReward: ACTIVE_RULE_REWARD,
    alternativePrizePoolLamports: 1_000_000_000n,
    campaign: {
      campaign: CAMPAIGN,
      campaignVault: CAMPAIGN_VAULT,
      mint: MINT,
      remainingAtoms: 2_000_000_000n,
      tokenConfig: TOKEN_CONFIG,
    },
    creator: CREATOR,
    creatorPaidAtoms: 150_000_000n,
    creatorTokenAccount: CREATOR_TOKEN_ACCOUNT,
    globalConfig: GLOBAL_CONFIG,
    individualAlternativePayoutLamports: 500_000_000n,
    ruleProposal: RULE_PROPOSAL,
    remainingCampaignAtoms: 1_700_000_000n,
    turnId: 4,
    turnState: TURN_STATE,
    voterPayments: new Map([
      [key(21).toBase58(), 75_000_000n],
      [key(22).toBase58(), 75_000_000n],
    ]),
    voterPoolPaidAtoms: 150_000_000n,
    voterTokenAccounts,
    voters: [key(21), key(22)],
    winnerCount: 2n,
  };
  const instruction = createActiveRuleRewardInstruction({
    authority: AUTHORITY,
    campaign: plan.campaign,
    globalConfig: GLOBAL_CONFIG,
    tycheProgramId: TYCHE_PROGRAM,
    plan,
    ruleProposal: RULE_PROPOSAL,
    tokenomicsProgramId: TOKENOMICS_PROGRAM,
    turnState: TURN_STATE,
  });

  assert.deepEqual(
    [...instruction.data.subarray(0, 8)],
    [...discriminator("global", "settle_active_rule_token_rewards")],
  );
  assert.equal(instruction.data.readBigUInt64LE(8), 4n);
  assert.equal(instruction.data.readBigUInt64LE(16), 1_000_000_000n);
  assert.equal(instruction.data.readBigUInt64LE(24), 2n);
  assert.deepEqual(
    instruction.keys.slice(-2).map(({ pubkey }) => pubkey.toBase58()),
    voterTokenAccounts.map((pubkey) => pubkey.toBase58()),
  );
  assert.ok(instruction.keys.slice(-2).every((account) => account.isWritable));
});

test("requires a finite, positive, unique turn allowlist", () => {
  assert.equal(CURRENT_TURN_STATE_DATA_LENGTH, 789);
  assert.deepEqual(parseActiveRuleRewardTurnAllowlist(undefined), []);
  assert.deepEqual(parseActiveRuleRewardTurnAllowlist(" 7, 2 "), [2, 7]);
  assert.throws(
    () => parseActiveRuleRewardTurnAllowlist("2,2"),
    /duplicate/,
  );
  assert.throws(
    () => parseActiveRuleRewardTurnAllowlist("2,0"),
    /positive safe integers/,
  );
  assert.throws(
    () => parseActiveRuleRewardTurnAllowlist("2,1.5"),
    /positive safe integers/,
  );
});
