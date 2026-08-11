import assert from "node:assert/strict";
import test from "node:test";

import {
  createTycheAuthorityBridgeInstruction,
  createTycheAuthorityReturnInstruction,
  createTycheExtensionInstruction,
} from "./devnet-tyche-extension-governance.js";

test("Tyche extension proposal 15 contains only the reviewed authority bridge", () => {
  const instruction = createTycheAuthorityBridgeInstruction();
  assert.equal(
    instruction.programId.toBase58(),
    "BPFLoaderUpgradeab1e11111111111111111111111",
  );
  assert.deepEqual(Array.from(instruction.data), [4, 0, 0, 0]);
  assert.deepEqual(
    instruction.keys.map((key) => [
      key.pubkey.toBase58(),
      key.isSigner,
      key.isWritable,
    ]),
    [
      ["AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g", false, true],
      ["DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp", true, false],
      ["EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea", false, false],
    ],
  );
});

test("Tyche extension and authority return are pinned for one atomic transaction", () => {
  const extension = createTycheExtensionInstruction();
  const authorityReturn = createTycheAuthorityReturnInstruction();
  assert.deepEqual(Array.from(extension.data), [6, 0, 0, 0, 0, 0, 1, 0]);
  assert.deepEqual(Array.from(authorityReturn.data), [4, 0, 0, 0]);
  assert.equal(
    extension.keys[3]?.pubkey.toBase58(),
    "EHHVmFK3FM9qb2eyc8wnEwpHtVH3yW1FGZzrEGn4iSea",
  );
  assert.equal(extension.keys[3]?.isSigner, true);
  assert.equal(
    authorityReturn.keys[2]?.pubkey.toBase58(),
    "DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp",
  );
});
