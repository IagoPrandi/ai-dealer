import assert from "node:assert/strict";
import test from "node:test";

import { encodeInitializeGenesisInstructionData } from "./tokenomicsGenesisProvisioning";

test("initialize_genesis encoding is deterministic and starts with the Anchor discriminator", () => {
  const args = {
    epochRootPublisher: "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
    gameAuthority: "EtZ5ZyHKb8wZmMHFDLM6LtVmZV1WUMvFPER72eFE4qob",
    governance: "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp",
    guardian: "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
    metadataUri: "https://example.com/jdr-devnet.json",
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
