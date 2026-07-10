import assert from "node:assert/strict";
import { test } from "node:test";
import { address, getAddressEncoder } from "@solana/kit";
import {
  type ClaimRecordLike,
  createRecordClaimInstruction,
  isClaimAlreadyRecorded,
  recordClaimsForTurn,
  selectRecordableClaims,
} from "./claims.js";
import type { TurnAutomationConfig } from "./turn-automation.js";

const PROGRAM_ID = address("ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd");
const AUTHORITY = address("4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH");
const CLAIMANT = address("BUo2vYwYvj2UWYFgryrMF7bBTrLQQFYVU6xHuoTJbJBD");
const RECORD_CLAIM_DISCRIMINATOR = [111, 123, 69, 192, 195, 228, 137, 30];
const addressEncoder = getAddressEncoder();

function fakeConfig(): TurnAutomationConfig {
  return {
    authorityKeypairBytes: new Uint8Array(64).fill(7),
    deferCloseToSettlement: false,
    desiredTurnDurationCycle: null,
    enabled: true,
    intervalMs: 30_000,
    programId: PROGRAM_ID,
    rpcUrl: "https://api.devnet.solana.com",
  };
}

function jsonResponse(body: unknown): Response {
  return {
    json: async () => body,
    ok: true,
    status: 200,
  } as unknown as Response;
}

test("record_claim instruction encodes discriminator and borsh args", async () => {
  const turnId = 42;
  const amountLamports = 6_000_000;
  const instruction = await createRecordClaimInstruction({
    amountLamports,
    authority: AUTHORITY,
    claimant: CLAIMANT,
    kind: "winner_payout",
    programId: PROGRAM_ID,
    turnId,
  });

  // 8 discriminator + 8 turn_id + 32 claimant + 1 kind + 8 amount = 57 bytes.
  assert.equal(instruction.data.length, 57);
  assert.deepEqual(
    [...instruction.data.slice(0, 8)],
    RECORD_CLAIM_DISCRIMINATOR,
  );
  const turnIdBytes = new DataView(
    new Uint8Array([...instruction.data.slice(8, 16)]).buffer,
  ).getBigUint64(0, true);
  assert.equal(turnIdBytes, BigInt(turnId));
  assert.deepEqual(
    [...instruction.data.slice(16, 48)],
    [...addressEncoder.encode(CLAIMANT)],
  );
  assert.ok(instruction.data[48] === 0); // winner_payout kind byte
  const amountBytes = new DataView(
    new Uint8Array([...instruction.data.slice(49, 57)]).buffer,
  ).getBigUint64(0, true);
  assert.equal(amountBytes, BigInt(amountLamports));

  // Authority is the writable signer; the claim PDA is writable; system program present.
  assert.equal(instruction.accounts.length, 5);
  assert.equal(instruction.accounts[0]?.address, AUTHORITY);
});

test("creator and voter reward kinds use distinct kind bytes", async () => {
  const creator = await createRecordClaimInstruction({
    amountLamports: 5_000_000,
    authority: AUTHORITY,
    claimant: CLAIMANT,
    kind: "creator_reward",
    programId: PROGRAM_ID,
    turnId: 1,
  });
  const voter = await createRecordClaimInstruction({
    amountLamports: 5_000_000,
    authority: AUTHORITY,
    claimant: CLAIMANT,
    kind: "voter_reward",
    programId: PROGRAM_ID,
    turnId: 1,
  });

  assert.ok(creator.data[48] === 1);
  assert.ok(voter.data[48] === 2);
});

test("only available claims are recordable", () => {
  const records: ClaimRecordLike[] = [
    { amountLamports: 6_000_000, kind: "winner_payout", status: "available", wallet: "a" },
    { amountLamports: 1_000_000, kind: "voter_reward", status: "unavailable", wallet: "b" },
    { amountLamports: 6_000_000, kind: "creator_reward", status: "claimed", wallet: "c" },
  ];
  const recordable = selectRecordableClaims(records);
  assert.equal(recordable.length, 1);
  assert.equal(recordable[0]?.wallet, "a");
});

test("already-recorded allocation errors are treated as the idempotent path", () => {
  assert.equal(
    isClaimAlreadyRecorded(new Error("Account Address { } already in use")),
    true,
  );
  assert.equal(isClaimAlreadyRecorded(new Error("some other failure")), false);
});

test("recordClaimsForTurn posts a record_claim only for available claims", async () => {
  const claims: ClaimRecordLike[] = [
    { amountLamports: 6_000_000, kind: "winner_payout", status: "available", wallet: CLAIMANT.toString() },
    { amountLamports: 1_000_000, kind: "voter_reward", status: "unavailable", wallet: CLAIMANT.toString() },
  ];
  const sent: string[] = [];

  const results = await recordClaimsForTurn({
    apiBaseUrl: "http://api.test",
    config: fakeConfig(),
    fetchImpl: (async () => jsonResponse({ claims: { claims } })) as unknown as typeof fetch,
    rpc: {} as never,
    send: async ({ instruction }) => {
      sent.push(`${instruction.data.length}`);
      return "sig-1" as never;
    },
    turnId: 7,
  });

  assert.equal(sent.length, 1);
  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, "recorded");
  assert.equal(results[0]?.signature, "sig-1");
});

test("recordClaimsForTurn tolerates an already-recorded claim", async () => {
  const claims: ClaimRecordLike[] = [
    { amountLamports: 6_000_000, kind: "winner_payout", status: "available", wallet: CLAIMANT.toString() },
  ];

  const results = await recordClaimsForTurn({
    apiBaseUrl: "http://api.test",
    config: fakeConfig(),
    fetchImpl: (async () => jsonResponse({ claims: { claims } })) as unknown as typeof fetch,
    rpc: {} as never,
    send: async () => {
      throw new Error("Account Address { } already in use");
    },
    turnId: 7,
  });

  assert.equal(results.length, 1);
  assert.equal(results[0]?.status, "already_recorded");
  assert.equal(results[0]?.signature, undefined);
});
