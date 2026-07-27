import assert from "node:assert/strict";
import test from "node:test";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  TOKENOMICS_UPGRADE_PROPOSAL_CONFIG,
  validateTokenomicsUpgradeProposalConfig,
} from "./tokenomicsUpgradeProposalConfig";

test("pins the reviewed devnet buffer and returns its rent to Squads vault 0", () => {
  assert.deepEqual(validateTokenomicsUpgradeProposalConfig(), []);
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.vaultAddress,
    SQUADS_DEVNET_CONFIG.vaultAddress,
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.spillAddress,
    SQUADS_DEVNET_CONFIG.vaultAddress,
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferSha256,
    "29825f38ff3d92214a4842e3ed00f983202b61ed7e82140df12f6af066948a35",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.currentProgramPrefixSha256,
    "2ca0484a3fef56bfa9f5831022474f3cef839bc27db36758d83cb8f57bf012d1",
  );
});
