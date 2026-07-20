import { address } from "@solana/kit";

import { IDEALER_PROGRAM_ID } from "./idealerProgram";
import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";

export const TOKENOMICS_PLACEHOLDER_PROGRAM_ID =
  "CWA3N4ew4guFuY3P4jJTyt5HgidCRW6c7mGAL5pUSmb6";
export const TOKENOMICS_DEVNET_PROGRAM_ID =
  "BRK6G8Sep66LFREp2nGMLiganfw2nbWe1f8zeAdoP1Fm";
export const TOKEN_METADATA_PROGRAM_ID =
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";
export const BPF_UPGRADEABLE_LOADER_ID =
  "BPFLoaderUpgradeab1e11111111111111111111111";
export const CLASSIC_SPL_TOKEN_PROGRAM_ID =
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";

export const INITIAL_CAMPAIGN_CONFIG_PREIMAGE =
  "idealer:jdr:initial-campaign-config:v1|proposal=400000000|supporter=60000000|referral-inviter=200000000|referral-invitee=30000000|active-rule-rate-bps=1500|active-rule-cap=250000000|creator-before-voters=true|campaign=0";
export const INITIAL_CAMPAIGN_CONFIG_HASH =
  "145e7abde160c7d6828624eb12f320b570b674ad46708659cf5e640751854efd";
export const INITIAL_UNUSED_BALANCE_POLICY_PREIMAGE =
  "idealer:jdr:initial-campaign-unused-balance:v1|stop=exhaustion-only|final-partial=true|residual=isolated|admin-sweep=false";
export const INITIAL_UNUSED_BALANCE_POLICY_HASH =
  "92f6153e1c48440fa5f7bf5e8fa45523a3d3956e6fd762b41ca2097c4522dbfd";

const TOKEN_ATOMS_PER_TOKEN = 1_000_000_000n;

export const TOKENOMICS_GENESIS_CONFIG = Object.freeze({
  campaignAllocationAtoms: 200_000_000n * TOKEN_ATOMS_PER_TOKEN,
  decimals: 9,
  epochRootPublisher: SQUADS_DEVNET_CONFIG.members[0]!.address,
  fixedSupplyAtoms: 1_000_000_000n * TOKEN_ATOMS_PER_TOKEN,
  gameProgramId: IDEALER_PROGRAM_ID.toString(),
  genesisPayer: SQUADS_DEVNET_CONFIG.members[0]!.address,
  governance: SQUADS_DEVNET_CONFIG.vaultAddress,
  guardian: SQUADS_DEVNET_CONFIG.members[0]!.address,
  metadataMutable: true,
  metadataUpdateAuthority: SQUADS_DEVNET_CONFIG.vaultAddress,
  metadataUri: process.env.NEXT_PUBLIC_IDEALER_TOKEN_METADATA_URI?.trim() ?? "",
  multisigAddress: SQUADS_DEVNET_CONFIG.multisigAddress,
  name: "JUSDEALER",
  network: "devnet",
  programArtifactLength: 1_082_976,
  programArtifactSha256:
    "cb7d9e93aa943b1e7edd2ff6b9eacbd5d770d886a1ac66d186b71b3f21d6bef8",
  programCapacity: 1_093_160,
  programId:
    process.env.NEXT_PUBLIC_TOKENOMICS_CORE_PROGRAM_ID ??
    TOKENOMICS_DEVNET_PROGRAM_ID,
  symbol: "JDR",
  treasuryAllocationAtoms: 800_000_000n * TOKEN_ATOMS_PER_TOKEN,
} as const);

export interface TokenomicsGenesisSnapshot {
  campaignAmountAtoms: bigint;
  campaignMint: string;
  campaignOwner: string;
  configGameAuthority: string;
  configGovernance: string;
  configGuardian: string;
  configMetadata: string;
  configMetadataMutable: boolean;
  configMetadataUpdateAuthority: string;
  configMetadataUri: string;
  configMint: string;
  configPublisher: string;
  configTreasuryEscrow: string;
  configTreasuryReserve: string;
  escrowAmountAtoms: bigint;
  escrowMint: string;
  escrowOwner: string;
  mintAuthority: null | string;
  mintDecimals: number;
  mintFreezeAuthority: null | string;
  mintOwner: string;
  mintSupplyAtoms: bigint;
  reserveAmountAtoms: bigint;
  reserveMint: string;
  reserveOwner: string;
  treasuryLockedAtoms: bigint;
  treasuryPositionBeneficialOwner: string;
  treasuryPositionMint: string;
  treasuryPositionReturnAccount: string;
  treasuryPositionUnlockAuthority: string;
}

export function validateTokenomicsMetadataUri({
  metadataUri,
  network,
  programId,
}: {
  metadataUri: string;
  network: string;
  programId: string;
}): string[] {
  const errors: string[] = [];
  const devnetEmptyUriAllowed =
    network === "devnet" && programId === TOKENOMICS_DEVNET_PROGRAM_ID;

  if (!metadataUri) {
    if (!devnetEmptyUriAllowed) {
      errors.push(
        "A durable HTTPS JDR metadata URI is required before any mainnet build or genesis.",
      );
    }
    return errors;
  }

  try {
    const uri = new URL(metadataUri);
    if (uri.protocol !== "https:") {
      errors.push("The JDR metadata URI must use HTTPS.");
    }
  } catch {
    errors.push("The JDR metadata URI is invalid.");
  }
  if (new TextEncoder().encode(metadataUri).length > 200) {
    errors.push("The JDR metadata URI exceeds the 200-byte on-chain limit.");
  }
  return errors;
}

export function validateTokenomicsGenesisConfig(): string[] {
  const errors: string[] = [];
  const config = TOKENOMICS_GENESIS_CONFIG;

  if (config.network !== "devnet") {
    errors.push("The genesis rehearsal must be pinned to devnet.");
  }
  if (config.programId === TOKENOMICS_PLACEHOLDER_PROGRAM_ID) {
    errors.push(
      "Tokenomics Core still uses the non-deployable placeholder program ID.",
    );
  } else if (config.programId !== TOKENOMICS_DEVNET_PROGRAM_ID) {
    errors.push(
      "The configured Tokenomics Core program ID does not match the approved devnet identity.",
    );
  }
  errors.push(
    ...validateTokenomicsMetadataUri({
      metadataUri: config.metadataUri,
      network: config.network,
      programId: config.programId,
    }),
  );
  if (config.name !== "JUSDEALER" || config.symbol !== "JDR") {
    errors.push("The configured token identity does not match JUSDEALER/JDR.");
  }
  if (config.decimals !== 9) {
    errors.push("JDR must use exactly nine decimals.");
  }
  if (
    !/^[0-9a-f]{64}$/.test(config.programArtifactSha256) ||
    config.programArtifactLength <= 0 ||
    config.programCapacity < config.programArtifactLength
  ) {
    errors.push("The reviewed devnet Tokenomics Core artifact is invalid.");
  }
  if (
    config.campaignAllocationAtoms + config.treasuryAllocationAtoms !==
    config.fixedSupplyAtoms
  ) {
    errors.push(
      "The 200M and 800M allocations do not sum to the fixed supply.",
    );
  }
  if (
    config.governance !== SQUADS_DEVNET_CONFIG.vaultAddress ||
    config.metadataUpdateAuthority !== SQUADS_DEVNET_CONFIG.vaultAddress
  ) {
    errors.push(
      "Governance and metadata updates must be controlled by Squads vault 0.",
    );
  }
  if (
    config.genesisPayer !== SQUADS_DEVNET_CONFIG.members[0]?.address ||
    config.guardian !== SQUADS_DEVNET_CONFIG.members[0]?.address ||
    config.epochRootPublisher !== SQUADS_DEVNET_CONFIG.members[0]?.address
  ) {
    errors.push(
      "The devnet payer, guardian, and epoch publisher must be wallet A.",
    );
  }

  return errors;
}

export function validateTokenomicsGenesisSnapshot(
  snapshot: TokenomicsGenesisSnapshot,
  addresses: {
    campaignVault: string;
    executor: string;
    gameAuthority: string;
    metadata: string;
    mint: string;
    tokenConfig: string;
    treasuryEscrow: string;
    treasuryReserve: string;
  },
): string[] {
  const errors: string[] = [];
  const config = TOKENOMICS_GENESIS_CONFIG;

  if (snapshot.mintOwner !== CLASSIC_SPL_TOKEN_PROGRAM_ID) {
    errors.push("The JDR mint is not owned by the classic SPL Token program.");
  }
  if (snapshot.mintSupplyAtoms !== config.fixedSupplyAtoms) {
    errors.push("The finalized JDR supply is not exactly 1B tokens.");
  }
  if (snapshot.mintDecimals !== config.decimals) {
    errors.push("The finalized JDR mint does not use nine decimals.");
  }
  if (snapshot.mintAuthority !== null) {
    errors.push("The JDR mint authority was not revoked.");
  }
  if (snapshot.mintFreezeAuthority !== null) {
    errors.push("The JDR freeze authority was not revoked.");
  }

  const expectedTokenAccounts = [
    {
      amount: config.campaignAllocationAtoms,
      actualAmount: snapshot.campaignAmountAtoms,
      actualMint: snapshot.campaignMint,
      actualOwner: snapshot.campaignOwner,
      expectedOwner: addresses.tokenConfig,
      label: "campaign vault",
    },
    {
      amount: config.treasuryAllocationAtoms,
      actualAmount: snapshot.escrowAmountAtoms,
      actualMint: snapshot.escrowMint,
      actualOwner: snapshot.escrowOwner,
      expectedOwner: addresses.tokenConfig,
      label: "treasury escrow",
    },
    {
      amount: 0n,
      actualAmount: snapshot.reserveAmountAtoms,
      actualMint: snapshot.reserveMint,
      actualOwner: snapshot.reserveOwner,
      expectedOwner: addresses.executor,
      label: "treasury reserve",
    },
  ];
  for (const account of expectedTokenAccounts) {
    if (account.actualMint !== addresses.mint) {
      errors.push(`The ${account.label} uses the wrong mint.`);
    }
    if (account.actualAmount !== account.amount) {
      errors.push(`The ${account.label} has the wrong finalized balance.`);
    }
    if (account.actualOwner !== account.expectedOwner) {
      errors.push(`The ${account.label} has the wrong token authority.`);
    }
  }

  if (snapshot.configGovernance !== config.governance) {
    errors.push("TokenConfig governance is not the Squads vault.");
  }
  if (snapshot.configGuardian !== config.guardian) {
    errors.push("TokenConfig guardian is not devnet wallet A.");
  }
  if (snapshot.configPublisher !== config.epochRootPublisher) {
    errors.push("TokenConfig epoch publisher is not devnet wallet A.");
  }
  if (snapshot.configMint !== addresses.mint) {
    errors.push("TokenConfig references the wrong mint.");
  }
  if (snapshot.configMetadata !== addresses.metadata) {
    errors.push("TokenConfig references the wrong metadata account.");
  }
  if (
    snapshot.configMetadataUpdateAuthority !== config.metadataUpdateAuthority
  ) {
    errors.push("Metadata update authority is not the Squads vault.");
  }
  if (
    snapshot.configMetadataUri !== config.metadataUri ||
    snapshot.configMetadataMutable !== config.metadataMutable
  ) {
    errors.push(
      "Finalized metadata settings do not match the reviewed values.",
    );
  }
  if (
    snapshot.configTreasuryReserve !== addresses.treasuryReserve ||
    snapshot.configTreasuryEscrow !== addresses.treasuryEscrow
  ) {
    errors.push(
      "TokenConfig treasury custody addresses do not match the PDAs.",
    );
  }
  if (snapshot.configGameAuthority !== addresses.gameAuthority) {
    errors.push("TokenConfig references the wrong game authority.");
  }
  if (
    snapshot.treasuryLockedAtoms !== config.treasuryAllocationAtoms ||
    snapshot.treasuryPositionBeneficialOwner !== config.governance ||
    snapshot.treasuryPositionUnlockAuthority !== config.governance ||
    snapshot.treasuryPositionReturnAccount !== addresses.treasuryReserve ||
    snapshot.treasuryPositionMint !== addresses.mint
  ) {
    errors.push(
      "The treasury lock position does not match the 800M custody plan.",
    );
  }

  return errors;
}

export function tokenomicsProgramAddress() {
  return address(TOKENOMICS_GENESIS_CONFIG.programId);
}
