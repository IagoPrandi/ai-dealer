import assert from "node:assert/strict";
import { test } from "node:test";

import { address } from "@solana/kit";

import {
  createLockTokensInstruction,
  createTokenomicsClaimInstruction,
  createTopUpLockInstruction,
  createUnlockTokensInstruction,
  TOKENOMICS_CORE_PROGRAM_ID,
} from "./tokenomicsProgram.js";

const owner = address("11111111111111111111111111111111");
const mint = "So11111111111111111111111111111111111111112";
const tokenAccount = "SysvarRent111111111111111111111111111111111";
const escrow = "SysvarC1ock11111111111111111111111111111111";

test("lock builders serialize u64 atoms and bind Tokenomics Core", async () => {
  const create = await createLockTokensInstruction({
    amountAtoms: 400_000_000n,
    escrow,
    mint,
    owner,
    sourceTokenAccount: tokenAccount,
  });
  assert.equal(create.programAddress, TOKENOMICS_CORE_PROGRAM_ID);
  assert.equal(create.accounts.length, 9);
  assert.equal(
    new DataView(create.data.buffer).getBigUint64(8, true),
    400_000_000n,
  );

  const topUp = await createTopUpLockInstruction({
    amountAtoms: 1n,
    escrow,
    mint,
    owner,
    sourceTokenAccount: tokenAccount,
  });
  assert.equal(topUp.accounts.length, 7);

  const unlock = await createUnlockTokensInstruction({
    amountAtoms: 1n,
    escrow,
    mint,
    owner,
    returnTokenAccount: tokenAccount,
  });
  assert.equal(unlock.accounts.length, 7);
});

test("lock builders reject zero and u64 overflow", async () => {
  await assert.rejects(
    () =>
      createLockTokensInstruction({
        amountAtoms: 0n,
        escrow,
        mint,
        owner,
        sourceTokenAccount: tokenAccount,
      }),
    /unsigned 64-bit/,
  );
});

test("claim builder binds epoch, beneficiary, vaults, and proof", async () => {
  const claim = await createTokenomicsClaimInstruction({
    amountLamports: 8n,
    beneficiary: owner,
    caller: owner,
    correctionReserveVault: escrow,
    distributionVault: tokenAccount,
    epochId: 1n,
    position: mint,
    proof: ["01".repeat(32)],
    rootVersion: 1,
    treasurySolVault: owner,
  });
  assert.equal(claim.accounts.length, 9);
  assert.equal(claim.data.length, 128);
  assert.equal(new DataView(claim.data.buffer).getBigUint64(8, true), 1n);
});
