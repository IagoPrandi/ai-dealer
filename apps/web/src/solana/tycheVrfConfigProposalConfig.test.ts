import assert from "node:assert/strict";
import test from "node:test";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  TYCHE_VRF_CONFIG_PROPOSAL_CONFIG,
  validateTycheVrfConfigProposalConfig,
} from "./tycheVrfConfigProposalConfig";

test("pins the devnet VRF transition from Switchboard to canonical ORAO", () => {
  assert.deepEqual(validateTycheVrfConfigProposalConfig(), []);
  assert.equal(
    TYCHE_VRF_CONFIG_PROPOSAL_CONFIG.currentProviderAddress,
    "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7",
  );
  assert.equal(
    TYCHE_VRF_CONFIG_PROPOSAL_CONFIG.targetProviderAddress,
    "5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK",
  );
  assert.equal(
    TYCHE_VRF_CONFIG_PROPOSAL_CONFIG.governanceAuthority,
    SQUADS_DEVNET_CONFIG.vaultAddress,
  );
});
