import assert from "node:assert/strict";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  createCloseEliminationWindowInstruction,
  createFailDrawInstruction,
  createLockRuleElectionPoolInstruction,
  createRequestDrawInstruction,
  createRequestRuleElectionVrfInstruction,
  createSettleActiveElectionInstruction,
  createSettleDrawInstruction,
  createSettleRuleElectionInstruction,
  createSettlementCloseTurnInstruction,
  decodeRuleProposalCandidate,
  decodeSettlementTurnState,
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

test("close_elimination_window passes finalist rule accounts as writable", () => {
  const finalists = [candidate(11), candidate(12)];
  const instruction = createCloseEliminationWindowInstruction({
    authority: AUTHORITY,
    finalists,
    programId: PROGRAM_ID,
    turnId: 9,
  });

  assert.deepEqual(
    [...instruction.data],
    [177, 162, 145, 148, 132, 146, 226, 83],
  );
  assert.equal(instruction.keys.length, 5);
  assert.equal(
    instruction.keys[3]?.pubkey.toBase58(),
    pda(Buffer.from("rule"), u64Le(9), u64Le(11)).toBase58(),
  );
  assert.equal(instruction.keys[3]?.isWritable, true);
  assert.equal(instruction.keys[4]?.isWritable, true);
});

test("settlement close_turn writes global config and turn state", () => {
  const instruction = createSettlementCloseTurnInstruction({
    authority: AUTHORITY,
    programId: PROGRAM_ID,
    turnId: 9,
  });

  assert.deepEqual([...instruction.data], [100, 243, 10, 218, 116, 61, 49, 153]);
  assert.equal(instruction.keys.length, 3);
  assert.equal(instruction.keys[0]?.isSigner, true);
  assert.equal(instruction.keys[1]?.isWritable, true);
  assert.equal(instruction.keys[2]?.isWritable, true);
});

function buildTurnStateBuffer(): Uint8Array {
  const data = Buffer.alloc(788);
  data.writeBigUInt64LE(42n, 8); // turn_id
  data.writeBigInt64LE(200n, 16); // start_timestamp
  data.writeBigInt64LE(1_000n, 24); // end_timestamp
  data.writeUInt8(1, 32); // status = closed
  data.writeUInt32LE(800, 41); // turn_duration_seconds
  Buffer.from([1, 2, 3, 4, 5, 6]).copy(data, 46); // draw_result
  data.writeBigUInt64LE(7n, 52); // active_rule_id
  Buffer.alloc(32, 0xaa).copy(data, 60); // active_rule_hash
  Buffer.alloc(32, 0xbb).copy(data, 92); // frozen_rule_artifact_hash
  Buffer.alloc(32, 0xcc).copy(data, 124); // eligible_rule_pool_hash
  Buffer.alloc(32, 0xdd).copy(data, 156); // top_voted_finalist_hash
  Buffer.alloc(32, 0xee).copy(data, 188); // random_finalist_hash
  Buffer.alloc(32, 0x11).copy(data, 220); // finalist_set_hash
  data.writeUInt8(2, 252); // finalist_count
  data.writeBigUInt64LE(7n, 253); // finalist_rule_ids[0]
  data.writeBigUInt64LE(8n, 261); // finalist_rule_ids[1]
  data.writeUInt8(0, 413); // finalist_eliminated[0]
  data.writeUInt8(1, 414); // finalist_eliminated[1]
  Buffer.alloc(32, 0x22).copy(data, 423); // eliminated_finalist_hash
  Buffer.alloc(32, 0x33).copy(data, 455); // survivor_finalist_hash
  data.writeBigInt64LE(900n, 487); // elimination_window_start
  data.writeBigInt64LE(4_500n, 495); // elimination_window_end
  data.writeUInt8(2, 649); // draw_status = fulfilled
  data.writeBigInt64LE(1_234n, 762); // drawn_at
  return data;
}

test("decodeSettlementTurnState reads the trustless TurnState layout", () => {
  const state = decodeSettlementTurnState(buildTurnStateBuffer(), 9_167);

  assert.equal(state.turnId, 42);
  assert.equal(state.status, "closed");
  assert.equal(state.startTimestampSeconds, 200);
  assert.equal(state.endTimestampSeconds, 1_000);
  assert.equal(state.turnDurationSeconds, 800);
  // Phase-1 → phase-2 boundary: start + floor((end - start) * bps / 10000).
  assert.equal(state.electionCutoffTimestampSeconds, 933);
  assert.equal(state.drawStatus, "fulfilled");
  assert.deepEqual(state.drawResult, [1, 2, 3, 4, 5, 6]);
  assert.equal(state.activeRuleId, 7);
  assert.equal(state.activeRuleHash, "aa".repeat(32));
  assert.equal(state.activeRuleArtifactHash, "bb".repeat(32));
  assert.equal(state.eligibleRulePoolHash, "cc".repeat(32));
  assert.equal(state.finalistSetHash, "11".repeat(32));
  assert.equal(state.finalistCount, 2);
  assert.deepEqual(state.finalistRuleIds, [7, 8]);
  assert.deepEqual(state.finalistEliminated, [false, true]);
  assert.equal(state.eliminatedFinalistHash, "22".repeat(32));
  assert.equal(state.survivorFinalistHash, "33".repeat(32));
  assert.equal(state.eliminationWindowEndSeconds, 4_500);
  assert.equal(state.drawnAtSeconds, 1_234);
});

test("decodeSettlementTurnState reports all-zero hashes as null", () => {
  const data = Buffer.alloc(788);
  data.writeBigUInt64LE(1n, 8);
  const state = decodeSettlementTurnState(data, 9_167);

  assert.equal(state.status, "open");
  assert.equal(state.drawStatus, "not_requested");
  assert.equal(state.drawResult, null);
  assert.equal(state.activeRuleId, null);
  assert.equal(state.eligibleRulePoolHash, null);
  assert.equal(state.finalistSetHash, null);
  assert.equal(state.survivorFinalistHash, null);
  assert.equal(state.finalistCount, 0);
});

test("decodeRuleProposalCandidate handles the variable-length text prefix", () => {
  const data = Buffer.alloc(300);
  data.writeBigUInt64LE(5n, 8); // rule_id
  data.writeBigUInt64LE(3n, 16); // turn_id
  Buffer.alloc(32, 0xab).copy(data, 56); // sanitized_text_hash
  data.writeUInt32LE(4, 88); // text length
  Buffer.from("abcd").copy(data, 92);
  const base = 92 + 4;
  Buffer.alloc(32, 0xcd).copy(data, base + 64); // compiled_artifact_hash
  data.writeUInt32LE(9, base + 98); // vote_count
  data.writeUInt32LE(0, base + 102); // report_count
  data.writeUInt8(1, base + 106); // state = Eligible
  data.writeUInt8(1, base + 139); // precompilation_status = Passed
  data.writeBigInt64LE(777n, base + 140); // created_at

  const decoded = decodeRuleProposalCandidate(data);
  assert.equal(decoded.ruleId, 5);
  assert.equal(decoded.sanitizedTextHash, "ab".repeat(32));
  assert.equal(decoded.compiledArtifactHash, "cd".repeat(32));
  assert.equal(decoded.voteCount, 9);
  assert.equal(decoded.reportCount, 0);
  assert.equal(decoded.isEligibleState, true);
  assert.equal(decoded.isPrecompiledValid, true);
  assert.equal(decoded.createdAtSeconds, 777);
});
