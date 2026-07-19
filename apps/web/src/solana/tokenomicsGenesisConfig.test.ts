import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSIC_SPL_TOKEN_PROGRAM_ID,
  TOKENOMICS_GENESIS_CONFIG,
  validateTokenomicsGenesisSnapshot,
} from "./tokenomicsGenesisConfig";

test("the fixed JDR allocation is exactly 1B tokens with nine decimals", () => {
  assert.equal(
    TOKENOMICS_GENESIS_CONFIG.campaignAllocationAtoms +
      TOKENOMICS_GENESIS_CONFIG.treasuryAllocationAtoms,
    TOKENOMICS_GENESIS_CONFIG.fixedSupplyAtoms,
  );
  assert.equal(
    TOKENOMICS_GENESIS_CONFIG.fixedSupplyAtoms,
    1_000_000_000_000_000_000n,
  );
  assert.equal(TOKENOMICS_GENESIS_CONFIG.decimals, 9);
});

test("a complete finalized genesis snapshot passes strict verification", () => {
  const addresses = {
    campaignVault: "CampaignVault11111111111111111111111111111",
    executor: "Executor111111111111111111111111111111111",
    gameAuthority: "GameAuthority111111111111111111111111111",
    metadata: "Metadata111111111111111111111111111111111",
    mint: "Mint1111111111111111111111111111111111111",
    tokenConfig: "Config11111111111111111111111111111111111",
    treasuryEscrow: "Escrow1111111111111111111111111111111111",
    treasuryReserve: "Reserve111111111111111111111111111111111",
  };

  assert.deepEqual(
    validateTokenomicsGenesisSnapshot(
      {
        campaignAmountAtoms: TOKENOMICS_GENESIS_CONFIG.campaignAllocationAtoms,
        campaignMint: addresses.mint,
        campaignOwner: addresses.tokenConfig,
        configGameAuthority: addresses.gameAuthority,
        configGovernance: TOKENOMICS_GENESIS_CONFIG.governance,
        configGuardian: TOKENOMICS_GENESIS_CONFIG.guardian,
        configMetadata: addresses.metadata,
        configMetadataMutable: true,
        configMetadataUpdateAuthority:
          TOKENOMICS_GENESIS_CONFIG.metadataUpdateAuthority,
        configMetadataUri: TOKENOMICS_GENESIS_CONFIG.metadataUri,
        configMint: addresses.mint,
        configPublisher: TOKENOMICS_GENESIS_CONFIG.epochRootPublisher,
        configTreasuryEscrow: addresses.treasuryEscrow,
        configTreasuryReserve: addresses.treasuryReserve,
        escrowAmountAtoms: TOKENOMICS_GENESIS_CONFIG.treasuryAllocationAtoms,
        escrowMint: addresses.mint,
        escrowOwner: addresses.tokenConfig,
        mintAuthority: null,
        mintDecimals: 9,
        mintFreezeAuthority: null,
        mintOwner: CLASSIC_SPL_TOKEN_PROGRAM_ID,
        mintSupplyAtoms: TOKENOMICS_GENESIS_CONFIG.fixedSupplyAtoms,
        reserveAmountAtoms: 0n,
        reserveMint: addresses.mint,
        reserveOwner: addresses.executor,
        treasuryLockedAtoms: TOKENOMICS_GENESIS_CONFIG.treasuryAllocationAtoms,
        treasuryPositionBeneficialOwner: TOKENOMICS_GENESIS_CONFIG.governance,
        treasuryPositionMint: addresses.mint,
        treasuryPositionReturnAccount: addresses.treasuryReserve,
        treasuryPositionUnlockAuthority: TOKENOMICS_GENESIS_CONFIG.governance,
      },
      addresses,
    ),
    [],
  );
});

test("strict verification rejects a retained authority and wrong allocation", () => {
  const addresses = {
    campaignVault: "CampaignVault11111111111111111111111111111",
    executor: "Executor111111111111111111111111111111111",
    gameAuthority: "GameAuthority111111111111111111111111111",
    metadata: "Metadata111111111111111111111111111111111",
    mint: "Mint1111111111111111111111111111111111111",
    tokenConfig: "Config11111111111111111111111111111111111",
    treasuryEscrow: "Escrow1111111111111111111111111111111111",
    treasuryReserve: "Reserve111111111111111111111111111111111",
  };
  const errors = validateTokenomicsGenesisSnapshot(
    {
      campaignAmountAtoms: 1n,
      campaignMint: addresses.mint,
      campaignOwner: addresses.tokenConfig,
      configGameAuthority: addresses.gameAuthority,
      configGovernance: TOKENOMICS_GENESIS_CONFIG.governance,
      configGuardian: TOKENOMICS_GENESIS_CONFIG.guardian,
      configMetadata: addresses.metadata,
      configMetadataMutable: true,
      configMetadataUpdateAuthority:
        TOKENOMICS_GENESIS_CONFIG.metadataUpdateAuthority,
      configMetadataUri: TOKENOMICS_GENESIS_CONFIG.metadataUri,
      configMint: addresses.mint,
      configPublisher: TOKENOMICS_GENESIS_CONFIG.epochRootPublisher,
      configTreasuryEscrow: addresses.treasuryEscrow,
      configTreasuryReserve: addresses.treasuryReserve,
      escrowAmountAtoms: TOKENOMICS_GENESIS_CONFIG.treasuryAllocationAtoms,
      escrowMint: addresses.mint,
      escrowOwner: addresses.tokenConfig,
      mintAuthority: TOKENOMICS_GENESIS_CONFIG.guardian,
      mintDecimals: 9,
      mintFreezeAuthority: null,
      mintOwner: CLASSIC_SPL_TOKEN_PROGRAM_ID,
      mintSupplyAtoms: TOKENOMICS_GENESIS_CONFIG.fixedSupplyAtoms,
      reserveAmountAtoms: 0n,
      reserveMint: addresses.mint,
      reserveOwner: addresses.executor,
      treasuryLockedAtoms: TOKENOMICS_GENESIS_CONFIG.treasuryAllocationAtoms,
      treasuryPositionBeneficialOwner: TOKENOMICS_GENESIS_CONFIG.governance,
      treasuryPositionMint: addresses.mint,
      treasuryPositionReturnAccount: addresses.treasuryReserve,
      treasuryPositionUnlockAuthority: TOKENOMICS_GENESIS_CONFIG.governance,
    },
    addresses,
  );

  assert.ok(errors.some((error) => error.includes("authority")));
  assert.ok(errors.some((error) => error.includes("campaign vault")));
});
