import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  BPF_UPGRADEABLE_LOADER_ID,
  TOKENOMICS_DEVNET_PROGRAM_ID,
} from "./tokenomicsGenesisConfig";

export const TOKENOMICS_UPGRADE_PROPOSAL_CONFIG = Object.freeze({
  bufferAddress: "3hXmY4FCSBMa5gStMcbKvnvfPz2uFVCHAn5CBaKS5dXs",
  bufferProgramLength: 1_092_904,
  bufferSha256:
    "8f97ec2d4881f47df1e77109def9c1269c58cfc18845a6b0d53e6252fa4a69b4",
  currentProgramPrefixLength: 1_082_976,
  currentProgramPrefixSha256:
    "cb7d9e93aa943b1e7edd2ff6b9eacbd5d770d886a1ac66d186b71b3f21d6bef8",
  loaderProgramId: BPF_UPGRADEABLE_LOADER_ID,
  memo: "JUSDEALER devnet Tokenomics Core JDR reward v2 upgrade",
  multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
  network: "devnet",
  programDataAddress: "DBM5tfyUMcThsXyvMuYMEU1Xgfar4KZpXtSAh9LXusaS",
  programDataCapacity: 1_093_160,
  programId: TOKENOMICS_DEVNET_PROGRAM_ID,
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
  if (config.programId !== TOKENOMICS_DEVNET_PROGRAM_ID) {
    errors.push("The upgrade target does not match Tokenomics Core.");
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
    config.currentProgramPrefixLength >= config.bufferProgramLength ||
    !/^[0-9a-f]{64}$/.test(config.currentProgramPrefixSha256)
  ) {
    errors.push("The reviewed Tokenomics Core ProgramData layout is invalid.");
  }

  return errors;
}
