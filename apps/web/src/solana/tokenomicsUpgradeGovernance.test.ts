import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey, TransactionInstruction } from "@solana/web3.js";

import { IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG } from "./idealerProgramExtensionProposalConfig";
import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG,
  createAtomicProgramDataExtensionInstructions,
  governanceActionAvailability,
} from "./tokenomicsUpgradeGovernance";

const [walletA, walletB] = SQUADS_DEVNET_CONFIG.members;

test("pins governance to the finalized atomic extension proposal", () => {
  assert.equal(TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionIndex, 6n);
  assert.equal(
    TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.proposalAddress,
    "3xoEM9XMESn3CHgs4sBqGznQscoboo1i4PPbhp9wQuEy",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_GOVERNANCE_CONFIG.transactionAddress,
    "8ySkm4mRP62JozFfjfm2ehy6QZ6mq6ZY7bf6WyDdfu3L",
  );
});

test("allows each member to approve only once while active", () => {
  assert.deepEqual(
    governanceActionAvailability({
      approved: [],
      memberAddress: walletA!.address,
      status: "Active",
    }),
    { canApprove: true, canExecute: false },
  );
  assert.deepEqual(
    governanceActionAvailability({
      approved: [walletA!.address],
      memberAddress: walletA!.address,
      status: "Active",
    }),
    { canApprove: false, canExecute: false },
  );
});

test("allows atomic execution only for Wallet A after approval", () => {
  assert.deepEqual(
    governanceActionAvailability({
      approved: [walletA!.address, walletB!.address],
      memberAddress: walletA!.address,
      status: "Approved",
    }),
    { canApprove: false, canExecute: true },
  );
  assert.deepEqual(
    governanceActionAvailability({
      approved: [walletA!.address, walletB!.address],
      memberAddress: walletB!.address,
      status: "Approved",
    }),
    { canApprove: false, canExecute: false },
  );
  assert.deepEqual(
    governanceActionAvailability({
      approved: [walletA!.address],
      memberAddress: walletB!.address,
      status: "Active",
    }),
    { canApprove: true, canExecute: false },
  );
});

test("builds execute, devnet extension, and authority return in atomic order", () => {
  const squadsExecution = new TransactionInstruction({
    data: Buffer.from([1, 2, 3]),
    keys: [],
    programId: new PublicKey(SQUADS_DEVNET_CONFIG.programId),
  });
  const instructions =
    createAtomicProgramDataExtensionInstructions(squadsExecution);
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;

  assert.equal(instructions.length, 3);
  assert.equal(instructions[0], squadsExecution);
  assert.deepEqual(Array.from(instructions[1].data), [
    6, 0, 0, 0, 0, 40, 0, 0,
  ]);
  assert.equal(
    instructions[1].keys[3]?.pubkey.toBase58(),
    config.temporaryAuthorityAddress,
  );
  assert.equal(instructions[1].keys[3]?.isSigner, true);
  assert.equal(instructions[1].keys[3]?.isWritable, true);
  assert.deepEqual(Array.from(instructions[2].data), [4, 0, 0, 0]);
  assert.deepEqual(
    instructions[2].keys.map((key) => key.pubkey.toBase58()),
    [
      config.programDataAddress,
      config.temporaryAuthorityAddress,
      config.vaultAddress,
    ],
  );
});

test("rejects unknown accounts for both governance actions", () => {
  assert.deepEqual(
    governanceActionAvailability({
      approved: [walletA!.address, walletB!.address],
      memberAddress: "11111111111111111111111111111111",
      status: "Approved",
    }),
    { canApprove: false, canExecute: false },
  );
});
