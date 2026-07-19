import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  BPF_UPGRADEABLE_LOADER_ID,
  TOKENOMICS_GENESIS_CONFIG,
} from "./tokenomicsGenesisConfig";

export const TOKENOMICS_UPGRADE_PROPOSAL_CONFIG = Object.freeze({
  bufferAddress: "4HHMDBPqr3hTX5wr2cs4mMRsATGeKiHUjQrs5aqVguoE",
  bufferProgramLength: 1_082_976,
  bufferSha256:
    "cb7d9e93aa943b1e7edd2ff6b9eacbd5d770d886a1ac66d186b71b3f21d6bef8",
  loaderProgramId: BPF_UPGRADEABLE_LOADER_ID,
  memo: "JUSDEALER devnet empty-metadata URI upgrade",
  multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
  network: "devnet",
  programDataAddress: "DBM5tfyUMcThsXyvMuYMEU1Xgfar4KZpXtSAh9LXusaS",
  programId: TOKENOMICS_GENESIS_CONFIG.programId,
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
  if (config.programId !== TOKENOMICS_GENESIS_CONFIG.programId) {
    errors.push("The upgrade target does not match Tokenomics Core.");
  }
  if (config.multisigAddress !== SQUADS_DEVNET_CONFIG.multisigAddress) {
    errors.push("The upgrade proposal does not target the configured multisig.");
  }
  if (
    config.vaultAddress !== SQUADS_DEVNET_CONFIG.vaultAddress ||
    config.spillAddress !== SQUADS_DEVNET_CONFIG.vaultAddress
  ) {
    errors.push("The authority and spill recipient must both be Squads vault 0.");
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

  return errors;
}
