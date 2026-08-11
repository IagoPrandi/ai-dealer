import assert from "node:assert/strict";
import test from "node:test";

import {
  createTycheProgramExtensionInstruction,
  createTycheProgramDataAuthorityBridgeInstruction,
  createTycheProgramDataAuthorityReturnInstruction,
} from "./tycheProgramExtensionProposal";
import {
  TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG,
  validateTycheProgramExtensionProposalConfig,
} from "./tycheProgramExtensionProposalConfig";

test("pins the exact rent-funded devnet ProgramData extension", () => {
  assert.deepEqual(validateTycheProgramExtensionProposalConfig(), []);
  assert.equal(
    TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG.currentCapacity +
      TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG.extensionBytes,
    TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG.targetCapacity,
  );
  assert.equal(
    TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG.currentSha256,
    "b44896d44b6e6ac0c2bce7c7e672c58f245c0a60d8a073ab92cea892a862b79a",
  );
  assert.equal(
    TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG.requiredProgramDataLamports,
    7_804_254_960,
  );
  assert.equal(TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG.extensionBytes, 65_536);
});

test("builds the devnet legacy extension with system funding from Wallet A", () => {
  const config = TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const instruction = createTycheProgramExtensionInstruction();

  assert.equal(instruction.programId.toBase58(), config.loaderProgramId);
  assert.deepEqual(Array.from(instruction.data), [6, 0, 0, 0, 0, 0, 1, 0]);
  assert.deepEqual(
    instruction.keys.map((key) => ({
      address: key.pubkey.toBase58(),
      signer: key.isSigner,
      writable: key.isWritable,
    })),
    [
      {
        address: config.programDataAddress,
        signer: false,
        writable: true,
      },
      {
        address: config.programId,
        signer: false,
        writable: true,
      },
      {
        address: "11111111111111111111111111111111",
        signer: false,
        writable: false,
      },
      {
        address: config.temporaryAuthorityAddress,
        signer: true,
        writable: true,
      },
    ],
  );
});

test("builds the atomic extension authority bridge governed by Squads", () => {
  const config = TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const instruction = createTycheProgramDataAuthorityBridgeInstruction();

  assert.equal(instruction.programId.toBase58(), config.loaderProgramId);
  assert.deepEqual(Array.from(instruction.data), [4, 0, 0, 0]);
  assert.deepEqual(
    instruction.keys.map((key) => ({
      address: key.pubkey.toBase58(),
      signer: key.isSigner,
      writable: key.isWritable,
    })),
    [
      {
        address: config.programDataAddress,
        signer: false,
        writable: true,
      },
      {
        address: config.vaultAddress,
        signer: true,
        writable: false,
      },
      {
        address: config.temporaryAuthorityAddress,
        signer: false,
        writable: false,
      },
    ],
  );
});

test("builds the Wallet A extension and immediate authority return", () => {
  const config = TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const extension = createTycheProgramExtensionInstruction(
    config.temporaryAuthorityAddress,
  );
  const authorityReturn = createTycheProgramDataAuthorityReturnInstruction();

  assert.equal(
    extension.keys[3]?.pubkey.toBase58(),
    config.temporaryAuthorityAddress,
  );
  assert.equal(extension.keys[3]?.isSigner, true);
  assert.equal(extension.keys[3]?.isWritable, true);
  assert.deepEqual(
    authorityReturn.keys.map((key) => ({
      address: key.pubkey.toBase58(),
      signer: key.isSigner,
      writable: key.isWritable,
    })),
    [
      {
        address: config.programDataAddress,
        signer: false,
        writable: true,
      },
      {
        address: config.temporaryAuthorityAddress,
        signer: true,
        writable: false,
      },
      {
        address: config.vaultAddress,
        signer: false,
        writable: false,
      },
    ],
  );
});
