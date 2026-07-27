import { IDEALER_PROGRAM_ID } from "./idealerProgram";
import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { BPF_UPGRADEABLE_LOADER_ID } from "./tokenomicsGenesisConfig";

export const IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG = Object.freeze({
  currentCapacity: 1_045_352,
  currentSha256:
    "29825f38ff3d92214a4842e3ed00f983202b61ed7e82140df12f6af066948a35",
  extensionBytes: 3_952,
  loaderProgramId: BPF_UPGRADEABLE_LOADER_ID,
  memo: "JUSDEALER devnet Idealer ProgramData extension for governed VRF configuration",
  multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
  network: "devnet",
  programDataAddress: "AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g",
  programId: IDEALER_PROGRAM_ID.toString(),
  requiredProgramDataLamports: 7_304_359_920,
  targetCapacity: 1_049_304,
  vaultAddress: SQUADS_DEVNET_CONFIG.vaultAddress,
  vaultIndex: SQUADS_DEVNET_CONFIG.vaultIndex,
} as const);

export function validateIdealerProgramExtensionProposalConfig(): string[] {
  const config = IDEALER_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const errors: string[] = [];

  if (config.network !== "devnet") {
    errors.push("The extension proposal must be pinned to devnet.");
  }
  if (config.programId !== IDEALER_PROGRAM_ID.toString()) {
    errors.push("The extension target does not match the Idealer program.");
  }
  if (config.multisigAddress !== SQUADS_DEVNET_CONFIG.multisigAddress) {
    errors.push("The extension proposal does not target the configured multisig.");
  }
  if (
    config.vaultAddress !== SQUADS_DEVNET_CONFIG.vaultAddress ||
    config.vaultIndex !== SQUADS_DEVNET_CONFIG.vaultIndex
  ) {
    errors.push("The extension authority must be Squads vault 0.");
  }
  if (
    config.extensionBytes <= 0 ||
    config.currentCapacity + config.extensionBytes !== config.targetCapacity
  ) {
    errors.push("The reviewed ProgramData extension is invalid.");
  }
  if (!/^[0-9a-f]{64}$/.test(config.currentSha256)) {
    errors.push("The reviewed current ProgramData SHA-256 is invalid.");
  }
  if (config.requiredProgramDataLamports <= 0) {
    errors.push("The reviewed ProgramData rent requirement is invalid.");
  }

  return errors;
}
