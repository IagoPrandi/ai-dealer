import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ACTIVE_RULE_REWARD_CAP_ATOMS,
  ACTIVE_RULE_REWARD_RATE_BPS,
  CAMPAIGN_REWARD_BPS_DENOMINATOR,
  CREATOR_REWARD_RATE_BPS,
  DEVELOPMENT_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX,
  PRODUCTION_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX,
  PROPOSAL_REWARD_ATOMS,
  REFERRAL_INVITEE_REWARD_ATOMS,
  REFERRAL_INVITEE_REWARD_RATE_BPS,
  REFERRAL_INVITER_FIRST_ROUND_BONUS_RATE_BPS,
  REFERRAL_INVITER_REWARD_ATOMS,
  resolveFreeActionWindowEndsBeforeTurnIndex,
  SUPPORTER_REWARD_ATOMS,
  VOTER_REWARD_RATE_BPS,
} from "./index.js";

test("free-action cutoff is mainnet 30 and non-mainnet 100", () => {
  assert.equal(
    resolveFreeActionWindowEndsBeforeTurnIndex("mainnet-beta"),
    PRODUCTION_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX,
  );
  assert.equal(
    resolveFreeActionWindowEndsBeforeTurnIndex("devnet"),
    DEVELOPMENT_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX,
  );
  assert.equal(resolveFreeActionWindowEndsBeforeTurnIndex(undefined), 100);
});

test("JDR action rewards keep the 15% supporter-to-proposal relation", () => {
  assert.equal(PROPOSAL_REWARD_ATOMS, 600_000_000n);
  assert.equal(SUPPORTER_REWARD_ATOMS, 90_000_000n);
  assert.equal(
    (PROPOSAL_REWARD_ATOMS * 1_500n) / CAMPAIGN_REWARD_BPS_DENOMINATOR,
    SUPPORTER_REWARD_ATOMS,
  );
});

test("the invitee base reward is exactly 150% of the inviter base reward", () => {
  assert.equal(REFERRAL_INVITER_REWARD_ATOMS, 200_000_000n);
  assert.equal(REFERRAL_INVITEE_REWARD_RATE_BPS, 15_000n);
  assert.equal(REFERRAL_INVITEE_REWARD_ATOMS, 300_000_000n);
  assert.equal(
    (REFERRAL_INVITER_REWARD_ATOMS * REFERRAL_INVITEE_REWARD_RATE_BPS) /
      CAMPAIGN_REWARD_BPS_DENOMINATOR,
    REFERRAL_INVITEE_REWARD_ATOMS,
  );
});

test("active-rule and first-round bonus rates are 22.5% with an unchanged cap", () => {
  assert.equal(ACTIVE_RULE_REWARD_RATE_BPS, 2_250);
  assert.equal(CREATOR_REWARD_RATE_BPS, ACTIVE_RULE_REWARD_RATE_BPS);
  assert.equal(VOTER_REWARD_RATE_BPS, ACTIVE_RULE_REWARD_RATE_BPS);
  assert.equal(REFERRAL_INVITER_FIRST_ROUND_BONUS_RATE_BPS, 2_250n);
  assert.equal(ACTIVE_RULE_REWARD_CAP_ATOMS, 250_000_000n);
});
