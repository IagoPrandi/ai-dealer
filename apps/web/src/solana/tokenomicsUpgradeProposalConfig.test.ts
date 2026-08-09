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
    "fc54899f218c5c178639b426f994e06c451a858cf004d4ece5aabf216a56fb53",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.currentProgramPrefixSha256,
    "3a8da33f590768b399e93aa6497cf92b2218701b9a9dd1e6342cc0c663bce200",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.programDataCapacity,
    1_055_592,
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferProgramLength,
    1_018_304,
  );
});
