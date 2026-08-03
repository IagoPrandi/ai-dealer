"use client";

/**
 * Referral (invite) mechanic — client side of Tokenomics Core
 * `attribute_referral` plus the `ReferralAttribution` reader (PRD-TOKENOMICS §5.4).
 *
 * The invite artifact is the inviter's own wallet address: it is the code, it is
 * what the link carries, and it is what the on-chain attribution stores. There is
 * no server-side code registry, so an invite stays valid across API restarts and
 * can be verified from the chain alone. `referral_code_hash` binds the recorded
 * attribution to the exact link that produced it.
 */
import {
  AccountRole,
  address,
  getAddressDecoder,
  getAddressEncoder,
  getProgramDerivedAddress,
} from "@solana/kit";

import { IDEALER_PROGRAM_ID, SYSTEM_PROGRAM_ID } from "./idealerProgram";
import { TOKENOMICS_CORE_PROGRAM_ID } from "./tokenomicsProgram";

export const REFERRAL_CODE_DOMAIN = "idealer:referral-code:v1";
export const REFERRAL_LINK_PARAM = "ref";

const ATTRIBUTE_REFERRAL_DISCRIMINATOR = Uint8Array.from([
  230, 199, 139, 240, 119, 14, 112, 32,
]);
const REFERRAL_ATTRIBUTION_DISCRIMINATOR = Uint8Array.from([
  155, 92, 31, 71, 203, 180, 4, 72,
]);
const GAME_TOKEN_DISCRIMINATOR = Uint8Array.from([
  146, 160, 167, 120, 232, 217, 240, 63,
]);
/** `GameToken.player` offset: discriminator + `turn_id`. */
const GAME_TOKEN_PLAYER_OFFSET = 16n;
/** discriminator + invitee + inviter + code hash + 2 u64 + 2 bool + i64 + bump. */
const REFERRAL_ATTRIBUTION_SIZE = 131;

const addressEncoder = getAddressEncoder();
const addressDecoder = getAddressDecoder();

export type ReferralAddress = ReturnType<typeof address>;

export interface ReferralAttribution {
  attributedAt: number;
  baseRewardSettled: boolean;
  bonusSettled: boolean;
  inviteeFirstRoundRewardAtoms: string;
  inviter: ReferralAddress;
  qualifyingTurnId: number;
  referralCodeHash: string;
}

type AccountInfoResult = {
  value: null | {
    data: readonly [string, string] | string;
    owner: string;
  };
};

export type ReferralRpcReader = {
  runtime: {
    rpc: {
      getAccountInfo: (
        account: ReferralAddress,
        config: { commitment: "confirmed"; encoding: "base64" },
      ) => { send: () => Promise<AccountInfoResult> };
    };
  };
};

type ProgramAccountResult = {
  account: { data: readonly [string, string] | string; owner: string };
  pubkey: string;
};

type ProgramAccountsRpc = {
  getProgramAccounts: (
    program: ReferralAddress,
    config: {
      commitment: "confirmed";
      encoding: "base64";
      filters: Array<{
        memcmp: { bytes: string; encoding: "base58"; offset: bigint };
      }>;
    },
  ) => { send: () => Promise<ProgramAccountResult[]> };
};

/**
 * A referral only qualifies on the invitee's first confirmed guess, so an invite
 * is useless once the wallet already holds a `GameToken`. Counting them is the
 * only honest way to tell a genuinely new player from a returning one.
 */
export async function countPlayerGameTokens({
  client,
  player,
}: {
  client: ReferralRpcReader;
  player: ReferralAddress;
}): Promise<number> {
  const rpc = client.runtime.rpc as typeof client.runtime.rpc &
    ProgramAccountsRpc;
  const accounts = await rpc
    .getProgramAccounts(IDEALER_PROGRAM_ID, {
      commitment: "confirmed",
      encoding: "base64",
      filters: [
        {
          memcmp: {
            bytes: player.toString(),
            encoding: "base58",
            offset: GAME_TOKEN_PLAYER_OFFSET,
          },
        },
      ],
    })
    .send();
  return accounts.filter(({ account }) => {
    if (account.owner !== IDEALER_PROGRAM_ID.toString()) {
      return false;
    }
    const bytes = decodeBase64Data(account.data);
    return (
      equalBytes(bytes.subarray(0, 8), GAME_TOKEN_DISCRIMINATOR) &&
      equalBytes(bytes.subarray(16, 48), addressEncoder.encode(player))
    );
  }).length;
}

/**
 * Reads an invite code out of anything a player can paste: a full invite URL, a
 * bare `?ref=` query string, or the inviter address on its own. Returns `null`
 * for every input that is not a valid Solana address.
 */
export function parseReferralCode(input: string): null | string {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const fromQuery = trimmed.includes(`${REFERRAL_LINK_PARAM}=`)
    ? (/[?&#]?ref=([1-9A-HJ-NP-Za-km-z]+)/.exec(trimmed)?.[1] ?? null)
    : trimmed;
  if (!fromQuery || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(fromQuery)) {
    return null;
  }
  try {
    return address(fromQuery).toString();
  } catch {
    return null;
  }
}

export function buildReferralLink(origin: string, inviter: string): string {
  const base = origin.replace(/\/+$/, "");
  return `${base}/play?${REFERRAL_LINK_PARAM}=${inviter}`;
}

/**
 * The on-chain `referral_code_hash`: a domain-separated commitment to the invite
 * link that produced the attribution. Deterministic, so any client can rebuild
 * and verify it from the inviter address alone.
 */
export async function deriveReferralCodeHash(
  inviter: string,
): Promise<Uint8Array> {
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`${REFERRAL_CODE_DOMAIN}|${inviter}`),
  );
  return new Uint8Array(digest);
}

export async function deriveReferralAttributionAddress(
  invitee: ReferralAddress,
): Promise<ReferralAddress> {
  const [attribution] = await getProgramDerivedAddress({
    programAddress: TOKENOMICS_CORE_PROGRAM_ID,
    seeds: ["referral_attribution", addressEncoder.encode(invitee)],
  });
  return attribution;
}

export function decodeReferralAttribution(
  bytes: Uint8Array,
  invitee: ReferralAddress,
): ReferralAttribution {
  if (
    bytes.length < REFERRAL_ATTRIBUTION_SIZE ||
    !equalBytes(bytes.subarray(0, 8), REFERRAL_ATTRIBUTION_DISCRIMINATOR)
  ) {
    throw new Error("Referral attribution data is invalid.");
  }
  if (!equalBytes(bytes.subarray(8, 40), addressEncoder.encode(invitee))) {
    throw new Error("Referral attribution belongs to a different wallet.");
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    attributedAt: Number(view.getBigInt64(122, true)),
    baseRewardSettled: bytes[120] === 1,
    bonusSettled: bytes[121] === 1,
    inviteeFirstRoundRewardAtoms: view.getBigUint64(112, true).toString(),
    inviter: addressDecoder.decode(bytes.subarray(40, 72)),
    qualifyingTurnId: Number(view.getBigUint64(104, true)),
    referralCodeHash: toHex(bytes.subarray(72, 104)),
  };
}

/** `null` means this wallet has no attribution yet, so an invite can still be used. */
export async function fetchReferralAttribution({
  client,
  invitee,
}: {
  client: ReferralRpcReader;
  invitee: ReferralAddress;
}): Promise<null | ReferralAttribution> {
  const attribution = await deriveReferralAttributionAddress(invitee);
  const result = await client.runtime.rpc
    .getAccountInfo(attribution, { commitment: "confirmed", encoding: "base64" })
    .send();
  if (!result.value) {
    return null;
  }
  if (result.value.owner !== TOKENOMICS_CORE_PROGRAM_ID.toString()) {
    throw new Error("Referral attribution has an invalid owner.");
  }
  return decodeReferralAttribution(
    decodeBase64Data(result.value.data),
    invitee,
  );
}

/**
 * `attribute_referral` — the invitee signs and pays for their own set-once
 * attribution. Self-referral is rejected here and again on-chain.
 */
export async function createAttributeReferralInstruction({
  invitee,
  inviter,
}: {
  invitee: ReferralAddress;
  inviter: string;
}) {
  const inviterAddress = address(inviter);
  if (inviterAddress.toString() === invitee.toString()) {
    throw new Error("An invite cannot be attributed to your own wallet.");
  }
  const [tokenConfig, attribution, referralCodeHash] = await Promise.all([
    getProgramDerivedAddress({
      programAddress: TOKENOMICS_CORE_PROGRAM_ID,
      seeds: ["token_config"],
    }).then(([pda]) => pda),
    deriveReferralAttributionAddress(invitee),
    deriveReferralCodeHash(inviterAddress.toString()),
  ]);
  const data = new Uint8Array(40);
  data.set(ATTRIBUTE_REFERRAL_DISCRIMINATOR, 0);
  data.set(referralCodeHash, 8);
  return {
    accounts: [
      { address: invitee, role: AccountRole.WRITABLE_SIGNER },
      { address: inviterAddress, role: AccountRole.READONLY },
      { address: tokenConfig, role: AccountRole.READONLY },
      { address: attribution, role: AccountRole.WRITABLE },
      { address: SYSTEM_PROGRAM_ID, role: AccountRole.READONLY },
    ],
    data,
    programAddress: TOKENOMICS_CORE_PROGRAM_ID,
  };
}

function decodeBase64Data(data: readonly [string, string] | string) {
  const encoded = Array.isArray(data) ? data[0] : data;
  const binary = globalThis.atob(encoded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function equalBytes(left: ArrayLike<number>, right: ArrayLike<number>) {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}
