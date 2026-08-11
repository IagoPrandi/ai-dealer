import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { PublicKey } from "@solana/web3.js";
import {
  createMigrateFeePoolCustodyInstruction,
  deriveMigrationGovernanceAddresses,
} from "./devnet-fee-pool-migration.js";

test("fee-pool migration pins custody, accounting split, and canonical accounts", () => {
  const governance = new PublicKey(
    "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp",
  );
  const instruction = createMigrateFeePoolCustodyInstruction(governance);
  const expectedDiscriminator = createHash("sha256")
    .update("global:migrate_fee_pool_custody")
    .digest()
    .subarray(0, 8);

  assert.deepEqual(instruction.data.subarray(0, 8), expectedDiscriminator);
  assert.equal(instruction.data.readBigUInt64LE(8), 18_000_000n);
  assert.equal(instruction.data.readBigUInt64LE(16), 5_000_000n);
  assert.equal(instruction.keys.length, 7);
  assert.equal(instruction.keys[0]?.pubkey.toBase58(), governance.toBase58());
  assert.equal(instruction.keys[0]?.isSigner, true);
  assert.equal(
    instruction.keys[6]?.pubkey.toBase58(),
    "FbJ6EnyvRE6ro5sGnpGdc4qfVCa7ibDgYpjwchaGxiCj",
  );
  assert.equal(instruction.keys[6]?.isWritable, true);
});

test("fee-pool migration keeps the Squads proposal and vault transaction PDAs distinct", () => {
  const { proposalPda, transactionPda } =
    deriveMigrationGovernanceAddresses(18n);

  assert.equal(
    proposalPda.toBase58(),
    "HoJtVX5ShxZ43fjmyJfcbWtGbCSQ3iSj1SJCCyS4w2Jm",
  );
  assert.equal(
    transactionPda.toBase58(),
    "5UN3M4V3bD8gzewVd8bmqjY881GJK4wNg51zvxHVUoD7",
  );
});
