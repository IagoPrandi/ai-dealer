import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";

import {
  createTycheVrfConfigInstruction,
  type TycheVrfConfigProposalSummary,
} from "./tycheVrfConfigProposal";
import { TYCHE_VRF_CONFIG_PROPOSAL_CONFIG } from "./tycheVrfConfigProposalConfig";

test("builds the exact ProgramData-governed ORAO activation instruction", () => {
  const config = TYCHE_VRF_CONFIG_PROPOSAL_CONFIG;
  const instruction = createTycheVrfConfigInstruction();
  const target = new PublicKey(config.targetProviderAddress).toBuffer();

  assert.equal(instruction.programId.toBase58(), config.programId);
  assert.equal(instruction.data.length, 72);
  assert.deepEqual(Array.from(instruction.data.subarray(0, 8)), [
    53, 52, 195, 216, 205, 110, 46, 74,
  ]);
  assert.deepEqual(instruction.data.subarray(8, 40), target);
  assert.deepEqual(instruction.data.subarray(40, 72), target);
  assert.deepEqual(
    instruction.keys.map((key) => ({
      address: key.pubkey.toBase58(),
      signer: key.isSigner,
      writable: key.isWritable,
    })),
    [
      {
        address: config.governanceAuthority,
        signer: true,
        writable: false,
      },
      {
        address: config.globalConfigAddress,
        signer: false,
        writable: true,
      },
      {
        address: config.programDataAddress,
        signer: false,
        writable: false,
      },
    ],
  );
});

test("VRF proposal summaries keep transaction indexes as bigint", () => {
  const summary = {
    transactionIndex: 8n,
  } as TycheVrfConfigProposalSummary;
  assert.equal(summary.transactionIndex, 8n);
});
