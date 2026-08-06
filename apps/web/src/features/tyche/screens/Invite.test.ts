import assert from "node:assert/strict";
import { test } from "node:test";

import type { ReferralAttribution } from "../../../solana/referralProgram";
import {
  describeAttributionProgress,
  FIRST_ROUND_BONUS_LABEL,
  INVITER_FIRST_ROUND_MAXIMUM_BONUS_LABEL,
  INVITEE_REWARD_LABEL,
  INVITER_REWARD_LABEL,
  INVITER_REWARD_WITH_MAXIMUM_BONUS_LABEL,
  readPendingInvite,
  resolveInviteAction,
  storePendingInvite,
} from "./Invite";

const INVITER = "DTR7BM7wgHJQ7dJUnQe7KCkWVPB6Jky4EkHAVSstQakY";
const INVITEE = "BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm";

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    values,
  };
}

function attribution(
  overrides: Partial<ReferralAttribution> = {},
): ReferralAttribution {
  return {
    attributedAt: 1_770_000_000,
    baseRewardSettled: false,
    bonusSettled: false,
    inviteeFirstRoundRewardAtoms: "0",
    inviter: INVITER as ReferralAttribution["inviter"],
    qualifyingTurnId: 0,
    referralCodeHash: "00".repeat(32),
    ...overrides,
  };
}

test("the displayed reward terms come from the approved constants", () => {
  assert.equal(INVITER_REWARD_LABEL, "0.2 JDR");
  assert.equal(INVITEE_REWARD_LABEL, "0.3 JDR");
  assert.equal(FIRST_ROUND_BONUS_LABEL, "22.5%");
  assert.equal(INVITER_FIRST_ROUND_MAXIMUM_BONUS_LABEL, "0.22275 JDR");
  assert.equal(INVITER_REWARD_WITH_MAXIMUM_BONUS_LABEL, "0.42275 JDR");
});

test("a wallet-less visitor is asked to connect", () => {
  assert.deepEqual(
    resolveInviteAction({
      attributed: false,
      code: INVITER,
      gameTokenCount: 0,
      wallet: null,
    }),
    { kind: "connect" },
  );
});

test("an existing attribution wins over any pending invite code", () => {
  assert.deepEqual(
    resolveInviteAction({
      attributed: true,
      code: INVITER,
      gameTokenCount: 0,
      wallet: INVITEE,
    }),
    { kind: "attributed" },
  );
});

test("a new player with an invite code can register it", () => {
  assert.deepEqual(
    resolveInviteAction({
      attributed: false,
      code: INVITER,
      gameTokenCount: 0,
      wallet: INVITEE,
    }),
    { inviter: INVITER, kind: "ready" },
  );
  // An unverified scan must not block a legitimate registration; the programme
  // remains the authority on qualification.
  assert.deepEqual(
    resolveInviteAction({
      attributed: false,
      code: INVITER,
      gameTokenCount: null,
      wallet: INVITEE,
    }),
    { inviter: INVITER, kind: "ready" },
  );
});

test("a wallet that already played can no longer be attributed", () => {
  assert.deepEqual(
    resolveInviteAction({
      attributed: false,
      code: INVITER,
      gameTokenCount: 1,
      wallet: INVITEE,
    }),
    { kind: "played_already" },
  );
});

test("self-referral is refused before any transaction", () => {
  assert.deepEqual(
    resolveInviteAction({
      attributed: false,
      code: INVITEE,
      gameTokenCount: 0,
      wallet: INVITEE,
    }),
    { kind: "self_invite" },
  );
});

test("without a code the player is asked for one", () => {
  assert.deepEqual(
    resolveInviteAction({
      attributed: false,
      code: null,
      gameTokenCount: 0,
      wallet: INVITEE,
    }),
    { kind: "enter_code" },
  );
});

test("attribution progress follows the canonical leg order", () => {
  assert.match(
    describeAttributionProgress(attribution()),
    /qualify on your first confirmed guess/,
  );
  assert.match(
    describeAttributionProgress(
      attribution({ baseRewardSettled: true, qualifyingTurnId: 35 }),
    ),
    /#0035/,
  );
  assert.match(
    describeAttributionProgress(
      attribution({ baseRewardSettled: true, bonusSettled: true }),
    ),
    /first-round bonus are settled/,
  );
});

test("only a valid invite code is persisted and read back", () => {
  const storage = memoryStorage();
  assert.equal(storePendingInvite(storage, "not-a-wallet"), false);
  assert.equal(storage.values.size, 0);
  assert.equal(
    storePendingInvite(storage, `https://tyche.example/play?ref=${INVITER}`),
    true,
  );
  assert.equal(readPendingInvite(storage), INVITER);
});

test("a corrupted stored invite reads as no invite", () => {
  assert.equal(
    readPendingInvite(memoryStorage({ "tyche:pending-invite": "garbage" })),
    null,
  );
  assert.equal(readPendingInvite(memoryStorage()), null);
});
