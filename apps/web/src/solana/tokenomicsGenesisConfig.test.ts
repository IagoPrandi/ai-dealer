import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSIC_SPL_TOKEN_PROGRAM_ID,
  TOKENOMICS_DEVNET_PROGRAM_ID,
  TOKENOMICS_GENESIS_CONFIG,
  validateTokenomicsMetadataUri,
  validateTokenomicsGenesisSnapshot,
} from "./tokenomicsGenesisConfig";

test("the pinned devnet genesis accepts an empty off-chain metadata URI", () => {
  assert.deepEqual(
    validateTokenomicsMetadataUri({
      metadataUri: "",
      network: "devnet",
      programId: TOKENOMICS_DEVNET_PROGRAM_ID,
    }),
    [],
  );
});

test("empty metadata remains blocked outside the exact devnet identity", () => {
  const expected =
    "A durable HTTPS JDR metadata URI is required before any mainnet build or genesis.";
  assert.deepEqual(
    validateTokenomicsMetadataUri({
      metadataUri: "",
      network: "mainnet-beta",
      programId: "MainnetTokenomics111111111111111111111111111",
    }),
    [expected],
  );
  assert.deepEqual(
    validateTokenomicsMetadataUri({
      metadataUri: "",
      network: "devnet",
      programId: "WrongDevnetTokenomics111111111111111111111111",
    }),
    [expected],
  );
});

test("published metadata must be valid HTTPS and fit on-chain", () => {
  assert.deepEqual(
    validateTokenomicsMetadataUri({
      metadataUri: "https://metadata.example/jdr.json",
      network: "mainnet-beta",
      programId: "MainnetTokenomics111111111111111111111111111",
    }),
    [],
  );
  assert.deepEqual(
    validateTokenomicsMetadataUri({
      metadataUri: "http://metadata.example/jdr.json",
      network: "devnet",
      programId: TOKENOMICS_DEVNET_PROGRAM_ID,
    }),
    ["The JDR metadata URI must use HTTPS."],
  );
  assert.deepEqual(
    validateTokenomicsMetadataUri({
      metadataUri: `https://metadata.example/${"a".repeat(201)}`,
      network: "mainnet-beta",
      programId: "MainnetTokenomics111111111111111111111111111",
    }),
    ["The JDR metadata URI exceeds the 200-byte on-chain limit."],
  );
});

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
