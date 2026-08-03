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
    "8f97ec2d4881f47df1e77109def9c1269c58cfc18845a6b0d53e6252fa4a69b4",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.currentProgramPrefixSha256,
    "cb7d9e93aa943b1e7edd2ff6b9eacbd5d770d886a1ac66d186b71b3f21d6bef8",
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.programDataCapacity,
    1_093_160,
  );
  assert.equal(
    TOKENOMICS_UPGRADE_PROPOSAL_CONFIG.bufferProgramLength,
    1_092_904,
  );
});
