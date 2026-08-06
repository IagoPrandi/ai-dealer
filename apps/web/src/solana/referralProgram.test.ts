import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { address, getAddressEncoder } from "@solana/kit";

import { TYCHE_PROGRAM_ID } from "./tycheProgram";
import {
  buildReferralLink,
  countPlayerGameTokens,
  createAttributeReferralInstruction,
  decodeReferralAttribution,
  deriveReferralAttributionAddress,
  deriveReferralCodeHash,
  fetchReferralAttribution,
  parseReferralCode,
  REFERRAL_CODE_DOMAIN,
} from "./referralProgram";
import { TOKENOMICS_CORE_PROGRAM_ID } from "./tokenomicsProgram";

const encoder = getAddressEncoder();
const INVITER = "DTR7BM7wgHJQ7dJUnQe7KCkWVPB6Jky4EkHAVSstQakY";
const INVITEE = "BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm";

function attributionAccount({
  baseRewardSettled = false,
  bonusSettled = false,
  firstRoundAtoms = 0n,
  invitee = INVITEE,
  inviter = INVITER,
  qualifyingTurnId = 0n,
}: {
  baseRewardSettled?: boolean;
  bonusSettled?: boolean;
  firstRoundAtoms?: bigint;
  invitee?: string;
  inviter?: string;
  qualifyingTurnId?: bigint;
} = {}) {
  const bytes = new Uint8Array(131);
  bytes.set(
    createHash("sha256").update("account:ReferralAttribution").digest().subarray(0, 8),
    0,
  );
  bytes.set(new Uint8Array(encoder.encode(address(invitee))), 8);
  bytes.set(new Uint8Array(encoder.encode(address(inviter))), 40);
  bytes.set(new Uint8Array(32).fill(7), 72);
  const view = new DataView(bytes.buffer);
  view.setBigUint64(104, qualifyingTurnId, true);
  view.setBigUint64(112, firstRoundAtoms, true);
  bytes[120] = baseRewardSettled ? 1 : 0;
  bytes[121] = bonusSettled ? 1 : 0;
  view.setBigInt64(122, 1_770_000_000n, true);
  bytes[130] = 255;
  return bytes;
}

function gameTokenAccount(player: string) {
  const bytes = new Uint8Array(96);
  bytes.set(
    createHash("sha256").update("account:GameToken").digest().subarray(0, 8),
    0,
  );
  bytes.set(new Uint8Array(encoder.encode(address(player))), 16);
  return bytes;
}

test("an invite code is accepted from a link, a query string or a bare address", () => {
  assert.equal(parseReferralCode(INVITER), INVITER);
  assert.equal(parseReferralCode(`  ${INVITER}  `), INVITER);
  assert.equal(
    parseReferralCode(`https://tyche.example/play?ref=${INVITER}`),
    INVITER,
  );
  assert.equal(parseReferralCode(`?ref=${INVITER}`), INVITER);
  assert.equal(
    parseReferralCode(`https://tyche.example/play?utm=x&ref=${INVITER}#top`),
    INVITER,
  );
});

test("invalid invite codes are rejected instead of silently accepted", () => {
  assert.equal(parseReferralCode(""), null);
  assert.equal(parseReferralCode("not-an-address"), null);
  assert.equal(parseReferralCode("?ref="), null);
  // Base58 length is right but the checksum/length of a real key is not.
  assert.equal(parseReferralCode("1".repeat(45)), null);
});

test("the invite link points at the play route and carries the inviter", () => {
  assert.equal(
    buildReferralLink("https://tyche.example/", INVITER),
    `https://tyche.example/play?ref=${INVITER}`,
  );
});

test("the referral code hash is the domain-separated inviter commitment", async () => {
  const expected = createHash("sha256")
    .update(`${REFERRAL_CODE_DOMAIN}|${INVITER}`)
    .digest("hex");
  const hash = await deriveReferralCodeHash(INVITER);
  assert.equal(Buffer.from(hash).toString("hex"), expected);
  assert.equal(hash.length, 32);
});

test("the attribution PDA is derived from the invitee wallet", async () => {
  const attribution = await deriveReferralAttributionAddress(address(INVITEE));
  assert.equal(
    attribution,
    await deriveReferralAttributionAddress(address(INVITEE)),
  );
  assert.notEqual(
    attribution,
    await deriveReferralAttributionAddress(address(INVITER)),
  );
});

test("attribution data decodes the inviter and settlement flags", () => {
  const decoded = decodeReferralAttribution(
    attributionAccount({
      baseRewardSettled: true,
      firstRoundAtoms: 765_000_000n,
      qualifyingTurnId: 42n,
    }),
    address(INVITEE),
  );
  assert.equal(decoded.inviter, INVITER);
  assert.equal(decoded.qualifyingTurnId, 42);
  assert.equal(decoded.inviteeFirstRoundRewardAtoms, "765000000");
  assert.equal(decoded.baseRewardSettled, true);
  assert.equal(decoded.bonusSettled, false);
  assert.equal(decoded.referralCodeHash, "07".repeat(32));
});

test("attribution data for another wallet is rejected", () => {
  assert.throws(
    () =>
      decodeReferralAttribution(
        attributionAccount({ invitee: INVITER }),
        address(INVITEE),
      ),
    /different wallet/,
  );
});

test("a missing attribution account reads as no attribution", async () => {
  const client = {
    runtime: {
      rpc: {
        getAccountInfo: () => ({ send: async () => ({ value: null }) }),
      },
    },
  };
  assert.equal(
    await fetchReferralAttribution({ client, invitee: address(INVITEE) }),
    null,
  );
});

test("an attribution owned by another program is rejected", async () => {
  const client = {
    runtime: {
      rpc: {
        getAccountInfo: () => ({
          send: async () => ({
            value: {
              data: [
                Buffer.from(attributionAccount()).toString("base64"),
                "base64",
              ] as const,
              owner: TYCHE_PROGRAM_ID.toString(),
            },
          }),
        }),
      },
    },
  };
  await assert.rejects(
    fetchReferralAttribution({ client, invitee: address(INVITEE) }),
    /invalid owner/,
  );
});

test("a stored attribution is read back from the chain", async () => {
  const client = {
    runtime: {
      rpc: {
        getAccountInfo: () => ({
          send: async () => ({
            value: {
              data: [
                Buffer.from(attributionAccount({ bonusSettled: true })).toString(
                  "base64",
                ),
                "base64",
              ] as const,
              owner: TOKENOMICS_CORE_PROGRAM_ID.toString(),
            },
          }),
        }),
      },
    },
  };
  const attribution = await fetchReferralAttribution({
    client,
    invitee: address(INVITEE),
  });
  assert.equal(attribution?.inviter, INVITER);
  assert.equal(attribution?.bonusSettled, true);
});

test("only real GameToken accounts of the wallet are counted", async () => {
  const foreign = new Uint8Array(96);
  foreign.set(new Uint8Array(encoder.encode(address(INVITEE))), 16);
  const client = {
    runtime: {
      rpc: {
        getAccountInfo: () => ({ send: async () => ({ value: null }) }),
        getProgramAccounts: () => ({
          send: async () => [
            {
              account: {
                data: [
                  Buffer.from(gameTokenAccount(INVITEE)).toString("base64"),
                  "base64",
                ] as const,
                owner: TYCHE_PROGRAM_ID.toString(),
              },
              pubkey: INVITEE,
            },
            {
              account: {
                data: [Buffer.from(foreign).toString("base64"), "base64"] as const,
                owner: TYCHE_PROGRAM_ID.toString(),
              },
              pubkey: INVITER,
            },
            {
              account: {
                data: [
                  Buffer.from(gameTokenAccount(INVITEE)).toString("base64"),
                  "base64",
                ] as const,
                owner: TOKENOMICS_CORE_PROGRAM_ID.toString(),
              },
              pubkey: INVITER,
            },
          ],
        }),
      },
    },
  };
  assert.equal(
    await countPlayerGameTokens({ client, player: address(INVITEE) }),
    1,
  );
});

test("the attribution instruction is invitee-signed and commits the code hash", async () => {
  const instruction = await createAttributeReferralInstruction({
    invitee: address(INVITEE),
    inviter: INVITER,
  });
  assert.equal(instruction.programAddress, TOKENOMICS_CORE_PROGRAM_ID);
  assert.equal(instruction.data.length, 40);
  assert.deepEqual(
    Array.from(instruction.data.subarray(8)),
    Array.from(await deriveReferralCodeHash(INVITER)),
  );
  assert.equal(instruction.accounts[0]?.address, INVITEE);
  assert.equal(instruction.accounts[1]?.address, INVITER);
  assert.equal(
    instruction.accounts[3]?.address,
    await deriveReferralAttributionAddress(address(INVITEE)),
  );
});

test("self-referral is rejected before a transaction is built", async () => {
  await assert.rejects(
    createAttributeReferralInstruction({
      invitee: address(INVITEE),
      inviter: INVITEE,
    }),
    /own wallet/,
  );
});
