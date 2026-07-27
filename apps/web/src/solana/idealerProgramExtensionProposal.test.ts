import assert from "node:assert/strict";
import test from "node:test";

import {
  createIdealerProgramExtensionInstruction,
} from "./idealerProgramExtensionProposal";
import {
  IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG,
  validateIdealerProgramExtensionProposalConfig,
} from "./idealerProgramExtensionProposalConfig";

test("pins the exact rent-funded devnet ProgramData extension", () => {
  assert.deepEqual(validateIdealerProgramExtensionProposalConfig(), []);
  assert.equal(
    IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG.currentCapacity +
      IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG.extensionBytes,
    IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG.targetCapacity,
  );
  assert.equal(
    IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG.currentSha256,
    "29825f38ff3d92214a4842e3ed00f983202b61ed7e82140df12f6af066948a35",
  );
  assert.equal(
    IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG.requiredProgramDataLamports,
    7_304_359_920,
  );
});

test("builds only ExtendProgramChecked with the Squads vault signer", () => {
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const instruction = createIdealerProgramExtensionInstruction();

  assert.equal(instruction.programId.toBase58(), config.loaderProgramId);
  assert.deepEqual(Array.from(instruction.data), [9, 0, 0, 0, 112, 15, 0, 0]);
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
        address: config.vaultAddress,
        signer: true,
        writable: false,
      },
    ],
  );
});
