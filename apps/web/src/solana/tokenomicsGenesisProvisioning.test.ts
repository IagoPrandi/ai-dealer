import assert from "node:assert/strict";
import test from "node:test";

import { TOKENOMICS_GENESIS_CONFIG } from "./tokenomicsGenesisConfig";
import {
  encodeInitializeGenesisInstructionData,
  submitGenesisConfirmedAndAwaitFinalized,
  validateReviewedTokenomicsProgramArtifact,
} from "./tokenomicsGenesisProvisioning";

test("initialize_genesis encoding is deterministic and starts with the Anchor discriminator", () => {
  const args = {
    epochRootPublisher: "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
    gameAuthority: "EtZ5ZyHKb8wZmMHFDLM6LtVmZV1WUMvFPER72eFE4qob",
    governance: "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp",
    guardian: "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
    metadataUri: "",
  };
  const first = encodeInitializeGenesisInstructionData(args);
  const second = encodeInitializeGenesisInstructionData(args);

  assert.deepEqual(first, second);
  assert.deepEqual(
    [...first.subarray(0, 8)],
    [17, 205, 102, 29, 35, 92, 43, 84],
  );
  assert.ok(first.length > 8 + 32 * 4 + 64);
});

test("accepts only the reviewed deployed Tokenomics Core artifact", () => {
  assert.deepEqual(
    validateReviewedTokenomicsProgramArtifact({
      capacity: TOKENOMICS_GENESIS_CONFIG.programCapacity,
      deployedHash: TOKENOMICS_GENESIS_CONFIG.programArtifactSha256,
      paddingZero: true,
    }),
    [],
  );
  assert.equal(
    validateReviewedTokenomicsProgramArtifact({
      capacity: TOKENOMICS_GENESIS_CONFIG.programCapacity,
      deployedHash: "0".repeat(64),
      paddingZero: true,
    }).length,
    1,
  );
});

test("submits genesis with confirmed preflight before finalized read-back", async () => {
  const calls: string[] = [];
  const signature = await submitGenesisConfirmedAndAwaitFinalized({
    send: async (commitment) => {
      calls.push(`send:${commitment}`);
      return "genesis-signature";
    },
    waitForFinalized: async (submittedSignature) => {
      calls.push(`finalize:${submittedSignature}`);
    },
  });

  assert.equal(signature, "genesis-signature");
  assert.deepEqual(calls, [
    "send:confirmed",
    "finalize:genesis-signature",
  ]);
});
