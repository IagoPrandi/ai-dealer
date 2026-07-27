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
    "3a8da33f590768b399e93aa6497cf92b2218701b9a9dd1e6342cc0c663bce200",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.currentProgramPrefixSha256,
    "29825f38ff3d92214a4842e3ed00f983202b61ed7e82140df12f6af066948a35",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.programDataCapacity,
    1_055_592,
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferProgramLength,
    1_049_304,
  );
});
