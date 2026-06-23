import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  createFailDrawInstruction,
  createLockRuleElectionPoolInstruction,
  createRequestDrawInstruction,
  createRequestRuleElectionVrfInstruction,
  createSettleActiveElectionInstruction,
  createSettleDrawInstruction,
  createSettleRuleElectionInstruction,
} from "./settlement.js";
import type { ElectionCandidate } from "./election.js";

const PROGRAM_ID = new PublicKey("6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4");
const AUTHORITY = new PublicKey("4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH");
const RANDOMNESS = new PublicKey("FWBa3Ubjyv7niKs3cxQkccmBvym3yoH9bYCXmUB5W1oq");

const REQUEST_DRAW_DISCRIMINATOR = [22, 180, 8, 81, 47, 21, 86, 159];
const SETTLE_DRAW_DISCRIMINATOR = [175, 154, 75, 30, 118, 117, 107, 194];
const FAIL_DRAW_DISCRIMINATOR = [105, 253, 152, 106, 102, 239, 78, 119];
const LOCK_RULE_ELECTION_POOL_DISCRIMINATOR = [
  94, 100, 197, 109, 194, 193, 177, 207,
];
const REQUEST_RULE_ELECTION_VRF_DISCRIMINATOR = [
  41, 6, 23, 94, 45, 197, 194, 222,
];
const SETTLE_RULE_ELECTION_DISCRIMINATOR = [
  81, 75, 204, 198, 66, 27, 54, 215,
];
const SETTLE_ACTIVE_ELECTION_DISCRIMINATOR = [
  138, 80, 52, 3, 102, 170, 20, 97,
];

function u64Le(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64LE(BigInt(value));
  return buffer;
}

function pda(...seeds: Buffer[]) {
  return PublicKey.findProgramAddressSync(seeds, PROGRAM_ID)[0];
}

function hex(byte: number) {
  return byte.toString(16).padStart(2, "0").repeat(32);
}

function candidate(ruleId: number): ElectionCandidate {
  return {
    compiledArtifactHash: hex(ruleId + 100),
    createdAtSeconds: 1,
    isEligibleState: true,
    isPrecompiledValid: true,
    reportCount: 0,
    ruleId,
    sanitizedTextHash: hex(ruleId),
    voteCount: 1,
  };
}

test("draw settlement builders use trustless randomness account", () => {
  const request = createRequestDrawInstruction({
    authority: AUTHORITY,
    programId: PROGRAM_ID,
    randomnessAccount: RANDOMNESS,
    turnId: 7,
  });
  const settle = createSettleDrawInstruction({
    authority: AUTHORITY,
    programId: PROGRAM_ID,
    randomnessAccount: RANDOMNESS,
    turnId: 7,
  });

  assert.deepEqual([...request.data], REQUEST_DRAW_DISCRIMINATOR);
  assert.deepEqual([...settle.data], SETTLE_DRAW_DISCRIMINATOR);
  assert.equal(request.programId.toBase58(), PROGRAM_ID.toBase58());
  assert.equal(request.keys[0]?.pubkey.toBase58(), AUTHORITY.toBase58());
  assert.equal(request.keys[0]?.isSigner, true);
  assert.equal(request.keys[0]?.isWritable, false);
  assert.equal(request.keys[1]?.pubkey.toBase58(), pda(Buffer.from("global_config")).toBase58());
  assert.equal(
    request.keys[2]?.pubkey.toBase58(),
    pda(Buffer.from("turn"), u64Le(7)).toBase58(),
  );
  assert.equal(request.keys[2]?.isWritable, true);
  assert.equal(request.keys[3]?.pubkey.toBase58(), RANDOMNESS.toBase58());
  assert.equal(request.keys[3]?.isWritable, false);
});

test("fail_draw serializes the failure code byte", () => {
  const instruction = createFailDrawInstruction({
    authority: AUTHORITY,
    failureCode: 3,
    programId: PROGRAM_ID,
    turnId: 8,
  });

  assert.deepEqual([...instruction.data], [...FAIL_DRAW_DISCRIMINATOR, 3]);
  assert.equal(instruction.keys.length, 3);
  assert.throws(() =>
    createFailDrawInstruction({
      authority: AUTHORITY,
      failureCode: 0,
      programId: PROGRAM_ID,
      turnId: 8,
    }),
  );
});

test("rule election builders include derived rule proposal accounts", () => {
  const candidates = [candidate(11), candidate(12)];
  const lock = createLockRuleElectionPoolInstruction({
    authority: AUTHORITY,
    candidates,
    programId: PROGRAM_ID,
    turnId: 9,
  });
  const request = createRequestRuleElectionVrfInstruction({
    authority: AUTHORITY,
    programId: PROGRAM_ID,
    randomnessAccount: RANDOMNESS,
    turnId: 9,
  });
  const settle = createSettleRuleElectionInstruction({
    authority: AUTHORITY,
    candidates,
    programId: PROGRAM_ID,
    randomnessAccount: RANDOMNESS,
    turnId: 9,
  });
  const settleActive = createSettleActiveElectionInstruction({
    authority: AUTHORITY,
    candidates,
    programId: PROGRAM_ID,
    randomnessAccount: RANDOMNESS,
    turnId: 9,
  });

  assert.deepEqual([...lock.data], LOCK_RULE_ELECTION_POOL_DISCRIMINATOR);
  assert.deepEqual([...request.data], REQUEST_RULE_ELECTION_VRF_DISCRIMINATOR);
  assert.deepEqual([...settle.data], SETTLE_RULE_ELECTION_DISCRIMINATOR);
  assert.deepEqual([...settleActive.data], SETTLE_ACTIVE_ELECTION_DISCRIMINATOR);
  assert.equal(lock.keys.length, 5);
  assert.equal(settle.keys.length, 6);
  assert.equal(
    settle.keys[4]?.pubkey.toBase58(),
    pda(Buffer.from("rule"), u64Le(9), u64Le(11)).toBase58(),
  );
  assert.equal(
    settle.keys[5]?.pubkey.toBase58(),
    pda(Buffer.from("rule"), u64Le(9), u64Le(12)).toBase58(),
  );
});
