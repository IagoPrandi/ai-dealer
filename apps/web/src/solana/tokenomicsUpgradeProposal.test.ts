import assert from "node:assert/strict";
import test from "node:test";

import {
  TOKENOMICS_UPGRADE_PROPOSAL_CONFIG,
  validateTokenomicsUpgradeProposalConfig,
} from "./tokenomicsUpgradeProposalConfig";
import {
  createTokenomicsUpgradeInstruction,
  errorText,
  formatRpcDiagnostic,
  submitConfirmedAndAwaitFinalized,
} from "./tokenomicsUpgradeProposal";

test("builds the canonical upgradeable-loader Upgrade instruction", () => {
  assert.deepEqual(validateTokenomicsUpgradeProposalConfig(), []);
  const instruction = createTokenomicsUpgradeInstruction();

  assert.equal(
    instruction.programId.toBase58(),
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.loaderProgramId,
  );
  assert.deepEqual(Array.from(instruction.data), [3, 0, 0, 0]);
  assert.deepEqual(
    instruction.keys.map((key) => ({
      address: key.pubkey.toBase58(),
      signer: key.isSigner,
      writable: key.isWritable,
    })),
    [
      {
        address: TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.programDataAddress,
        signer: false,
        writable: true,
      },
      {
        address: TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.programId,
        signer: false,
        writable: true,
      },
      {
        address: TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferAddress,
        signer: false,
        writable: true,
      },
      {
        address: TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.spillAddress,
        signer: false,
        writable: true,
      },
      {
        address: "SysvarRent111111111111111111111111111111111",
        signer: false,
        writable: false,
      },
      {
        address: "SysvarC1ock11111111111111111111111111111111",
        signer: false,
        writable: false,
      },
      {
        address: TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.vaultAddress,
        signer: true,
        writable: false,
      },
    ],
  );
});

test("submits with confirmed preflight before waiting for finalization", async () => {
  const calls: string[] = [];
  const signature = await submitConfirmedAndAwaitFinalized({
    send: async (commitment) => {
      calls.push(`send:${commitment}`);
      return "proposal-signature";
    },
    waitForFinalized: async (submittedSignature) => {
      calls.push(`finalize:${submittedSignature}`);
    },
  });

  assert.equal(signature, "proposal-signature");
  assert.deepEqual(calls, [
    "send:confirmed",
    "finalize:proposal-signature",
  ]);
});

test("surfaces nested RPC simulation diagnostics", () => {
  const error = new Error("Transaction simulation failed") as Error & {
    context: unknown;
  };
  error.context = {
    __serverMessage: "Transaction simulation failed",
    err: "BlockhashNotFound",
    logs: [],
  };

  assert.equal(
    errorText(error),
    "Transaction simulation failed BlockhashNotFound",
  );
});

test("formats bigint RPC diagnostics without masking simulation failures", () => {
  assert.equal(
    formatRpcDiagnostic({
      InstructionError: [0n, { Custom: 1_234n }],
    }),
    '{"InstructionError":["0",{"Custom":"1234"}]}',
  );
});
