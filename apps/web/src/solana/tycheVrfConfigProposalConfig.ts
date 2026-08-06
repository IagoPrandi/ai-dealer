import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { TYCHE_PROGRAM_ID } from "./tycheProgram";

export const TYCHE_VRF_CONFIG_PROPOSAL_CONFIG = Object.freeze({
  currentProviderAddress: "EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7",
  globalConfigAddress: "8eAwKD514LK6rJYLLFZh92g3V5a5MwbyLZMU83EpWWZ",
  governanceAuthority: SQUADS_DEVNET_CONFIG.vaultAddress,
  memo: "Activate canonical ORAO v2 for JUSDEALER devnet draw and election VRF",
  multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
  network: "devnet",
  oraoProgramId: "VRFzZoJdhFWL8rkvu87LpKM3RbcVezpMEc6X5GVDr7y",
  programDataAddress: "AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g",
  programId: "ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd",
  targetProviderAddress: "5ER1oENnV4srxYdAynUfRzWeQCPQaqMiAp4VqyMbSqnK",
  vaultIndex: SQUADS_DEVNET_CONFIG.vaultIndex,
} as const);

export function validateTycheVrfConfigProposalConfig(): string[] {
  const config = TYCHE_VRF_CONFIG_PROPOSAL_CONFIG;
  const errors: string[] = [];

  if (config.network !== "devnet") {
    errors.push("The VRF configuration proposal must be pinned to devnet.");
  }
  if (config.programId !== TYCHE_PROGRAM_ID.toString()) {
    errors.push("The VRF configuration target is not the Tyche program.");
  }
  if (
    config.multisigAddress !== SQUADS_DEVNET_CONFIG.multisigAddress ||
    config.governanceAuthority !== SQUADS_DEVNET_CONFIG.vaultAddress ||
    config.vaultIndex !== SQUADS_DEVNET_CONFIG.vaultIndex
  ) {
    errors.push("The VRF configuration proposal is not controlled by vault 0.");
  }
  if (
    String(config.currentProviderAddress) === config.targetProviderAddress ||
    !config.currentProviderAddress ||
    !config.targetProviderAddress
  ) {
    errors.push("The reviewed VRF provider transition is invalid.");
  }
  if (!config.oraoProgramId || !config.programDataAddress) {
    errors.push("The reviewed ORAO or ProgramData identity is missing.");
  }

  return errors;
}
