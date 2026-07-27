import assert from "node:assert/strict";
import test from "node:test";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  IDEALER_VRF_CONFIG_PROPOSAL_CONFIG,
  validateIdealerVrfConfigProposalConfig,
} from "./idealerVrfConfigProposalConfig";

test("pins the devnet VRF transition from Switchboard to canonical ORAO", () => {
  assert.deepEqual(validateIdealerVrfConfigProposalConfig(), []);
  assert.equal(
    IDEALER_VRF_CONFIG_PROPOSAL_CONFIG.currentProviderAddress,
    "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7",
  );
  assert.equal(
    IDEALER_VRF_CONFIG_PROPOSAL_CONFIG.targetProviderAddress,
    "5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK",
  );
  assert.equal(
    IDEALER_VRF_CONFIG_PROPOSAL_CONFIG.governanceAuthority,
    SQUADS_DEVNET_CONFIG.vaultAddress,
  );
});
