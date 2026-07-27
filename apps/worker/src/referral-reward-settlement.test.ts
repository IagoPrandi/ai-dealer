import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  decodeReferralAttributionFact,
  parseReferralRewardTargetAllowlist,
} from "./referral-reward-settlement.js";

function key(value: number) {
  return new PublicKey(Buffer.alloc(32, value));
}

test("referral reward targets require a unique turn and invitee allowlist", () => {
  const invitee = key(7).toBase58();
  assert.deepEqual(parseReferralRewardTargetAllowlist(`34:${invitee}`), [
    { invitee: key(7), turnId: 34 },
  ]);
  assert.throws(
    () => parseReferralRewardTargetAllowlist(`34:${invitee},34:${invitee}`),
    /duplicated/,
  );
  assert.throws(
    () => parseReferralRewardTargetAllowlist("34:not-a-public-key"),
    /Invalid referral reward invitee/,
  );
});

test("referral attribution decoder reads the canonical account layout", () => {
  const bytes = Buffer.alloc(130);
  createHash("sha256")
    .update("account:ReferralAttribution")
    .digest()
    .copy(bytes, 0, 0, 8);
  key(4).toBuffer().copy(bytes, 8);
  key(5).toBuffer().copy(bytes, 40);
  bytes[120] = 1;
  bytes[121] = 0;
  bytes.writeBigInt64LE(1_785_184_000n, 122);

  assert.deepEqual(decodeReferralAttributionFact(bytes), {
    attributedAt: 1_785_184_000n,
    baseRewardSettled: true,
    bonusSettled: false,
    invitee: key(4),
    inviter: key(5),
  });
  assert.throws(
    () => decodeReferralAttributionFact(Buffer.alloc(130)),
    /invalid/,
  );
});
