import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createAttributeReferralInstruction } from "./devnet-referral-validation.js";

test("referral attribution builder uses the canonical instruction and PDA", () => {
  const invitee = Keypair.generate().publicKey;
  const inviter = Keypair.generate().publicKey;
  const tokenomicsProgramId = Keypair.generate().publicKey;
  const referralCodeHash = Buffer.alloc(32, 9);
  const built = createAttributeReferralInstruction({
    invitee,
    inviter,
    referralCodeHash,
    tokenomicsProgramId,
  });

  const expected = PublicKey.findProgramAddressSync(
    [Buffer.from("referral_attribution"), invitee.toBuffer()],
    tokenomicsProgramId,
  )[0];
  assert.equal(built.attribution.toBase58(), expected.toBase58());
  assert.deepEqual(
    built.instruction.data.subarray(0, 8),
    createHash("sha256").update("global:attribute_referral").digest().subarray(0, 8),
  );
  assert.deepEqual(built.instruction.data.subarray(8), referralCodeHash);
  assert.equal(built.instruction.keys[0]?.isSigner, true);
  assert.equal(built.instruction.keys[0]?.isWritable, true);
  assert.equal(built.instruction.keys[1]?.pubkey.toBase58(), inviter.toBase58());
});

test("referral attribution builder rejects self-referral", () => {
  const wallet = Keypair.generate().publicKey;
  assert.throws(
    () =>
      createAttributeReferralInstruction({
        invitee: wallet,
        inviter: wallet,
        referralCodeHash: Buffer.alloc(32),
        tokenomicsProgramId: Keypair.generate().publicKey,
      }),
    /same inviter and invitee/,
  );
});
