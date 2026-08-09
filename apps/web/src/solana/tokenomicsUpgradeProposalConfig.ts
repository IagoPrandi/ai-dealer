import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { BPF_UPGRADEABLE_LOADER_ID } from "./tokenomicsGenesisConfig";
import { TYCHE_PROGRAM_ID } from "./tycheProgram";

export const TOKENOMICS_UPGRADE_PROPOSAL_CONFIG = Object.freeze({
  bufferAddress: "HxxGXN9ZLaqwWvGpkSuB1DjAtUuRNANGfpF98PKgitv4",
  bufferProgramLength: 1_018_304,
  bufferSha256:
    "fc54899f218c5c178639b426f994e06c451a858cf004d4ece5aabf216a56fb53",
  currentProgramPrefixLength: 1_049_304,
  currentProgramPrefixSha256:
    "3a8da33f590768b399e93aa6497cf92b2218701b9a9dd1e6342cc0c663bce200",
  loaderProgramId: BPF_UPGRADEABLE_LOADER_ID,
  memo: "JUSDEALER devnet Tyche revenue fee and epoch bridge upgrade",
  multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
  network: "devnet",
  programDataAddress: "AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g",
  programDataCapacity: 1_055_592,
  programId: TYCHE_PROGRAM_ID.toString(),
  spillAddress: SQUADS_DEVNET_CONFIG.vaultAddress,
  vaultAddress: SQUADS_DEVNET_CONFIG.vaultAddress,
  vaultIndex: SQUADS_DEVNET_CONFIG.vaultIndex,
} as const);

export function validateTokenomicsUpgradeProposalConfig(): string[] {
  const config = TOKENOMICS_UPGRADE_PROPOSAL_CONFIG;
  const errors: string[] = [];

  if (config.network !== "devnet") {
    errors.push("The upgrade proposal must be pinned to devnet.");
  }
  if (config.programId !== TYCHE_PROGRAM_ID.toString()) {
    errors.push("The upgrade target does not match Tyche.");
  }
  if (config.multisigAddress !== SQUADS_DEVNET_CONFIG.multisigAddress) {
    errors.push(
      "The upgrade proposal does not target the configured multisig.",
    );
  }
  if (
    config.vaultAddress !== SQUADS_DEVNET_CONFIG.vaultAddress ||
    config.spillAddress !== SQUADS_DEVNET_CONFIG.vaultAddress
  ) {
    errors.push(
      "The authority and spill recipient must both be Squads vault 0.",
    );
  }
  if (config.vaultIndex !== SQUADS_DEVNET_CONFIG.vaultIndex) {
    errors.push("The upgrade proposal must use Squads vault index 0.");
  }
  if (!/^[0-9a-f]{64}$/.test(config.bufferSha256)) {
    errors.push("The reviewed buffer SHA-256 is invalid.");
  }
  if (config.bufferProgramLength <= 0) {
    errors.push("The reviewed buffer length is invalid.");
  }
  if (
    config.bufferProgramLength > config.programDataCapacity ||
    config.currentProgramPrefixLength <= 0 ||
    config.currentProgramPrefixLength > config.programDataCapacity ||
    !/^[0-9a-f]{64}$/.test(config.currentProgramPrefixSha256)
  ) {
    errors.push("The reviewed Tyche ProgramData layout is invalid.");
  }

  return errors;
}
