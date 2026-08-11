import { TYCHE_PROGRAM_ID } from "./tycheProgram";
import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import { BPF_UPGRADEABLE_LOADER_ID } from "./tokenomicsGenesisConfig";

export const TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG = Object.freeze({
  currentCapacity: 1_055_592,
  currentProgramDataLamports: 7_348_124_400,
  currentSha256:
    "b44896d44b6e6ac0c2bce7c7e672c58f245c0a60d8a073ab92cea892a862b79a",
  extendProgramCheckedFeatureAddress:
    "2oMRZEDWT2tqtYMofhmmfQ8SsjqUFzT6sYXppQDavxwz",
  extensionBytes: 65_536,
  loaderProgramId: BPF_UPGRADEABLE_LOADER_ID,
  memo: "DEVNET ATOMIC-ONLY: ProgramData authority bridge; do not execute in generic Squads UI",
  multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
  network: "devnet",
  programDataAddress: "AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g",
  programId: TYCHE_PROGRAM_ID.toString(),
  requiredProgramDataLamports: 7_804_254_960,
  targetCapacity: 1_121_128,
  temporaryAuthorityAddress: SQUADS_DEVNET_CONFIG.members[0]!.address,
  vaultAddress: SQUADS_DEVNET_CONFIG.vaultAddress,
  vaultIndex: SQUADS_DEVNET_CONFIG.vaultIndex,
} as const);

export function validateTycheProgramExtensionProposalConfig(): string[] {
  const config = TYCHE_PROGRAM_EXTENSION_PROPOSAL_CONFIG;
  const errors: string[] = [];

  if (config.network !== "devnet") {
    errors.push("The extension proposal must be pinned to devnet.");
  }
  if (config.programId !== TYCHE_PROGRAM_ID.toString()) {
    errors.push("The extension target does not match the Tyche program.");
  }
  if (config.multisigAddress !== SQUADS_DEVNET_CONFIG.multisigAddress) {
    errors.push(
      "The extension proposal does not target the configured multisig.",
    );
  }
  if (
    config.vaultAddress !== SQUADS_DEVNET_CONFIG.vaultAddress ||
    config.vaultIndex !== SQUADS_DEVNET_CONFIG.vaultIndex
  ) {
    errors.push("The extension authority must be Squads vault 0.");
  }
  if (
    config.temporaryAuthorityAddress !==
    SQUADS_DEVNET_CONFIG.members[0]?.address
  ) {
    errors.push("The atomic extension bridge must use devnet wallet A.");
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
  if (
    config.currentProgramDataLamports <= 0 ||
    config.requiredProgramDataLamports <= config.currentProgramDataLamports
  ) {
    errors.push("The reviewed ProgramData rent requirement is invalid.");
  }

  return errors;
}
