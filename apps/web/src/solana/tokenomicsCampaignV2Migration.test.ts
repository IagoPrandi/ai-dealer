import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
  CAMPAIGN_V1_ECONOMIC_CONFIG_HASH,
  CAMPAIGN_V2_ECONOMIC_CONFIG_HASH,
} from "@idealer/constants";

import { SQUADS_DEVNET_CONFIG } from "./squadsDevnetConfig";
import {
  TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG,
  campaignV2MigrationActionAvailability,
  createCampaignV2MigrationInstruction,
  decodeCampaignV2Snapshot,
  validateReviewedCampaignV2Snapshot,
} from "./tokenomicsCampaignV2Migration";

function reviewedCampaignBytes() {
  const config = TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG;
  const campaign = Buffer.alloc(171);
  campaign.writeBigUInt64LE(0n, 8);
  new PublicKey(config.mintAddress).toBuffer().copy(campaign, 16);
  new PublicKey(config.campaignVaultAddress).toBuffer().copy(campaign, 48);
  campaign.writeBigUInt64LE(200_000_000_000_000_000n, 80);
  campaign.writeBigUInt64LE(5_395_925_000n, 88);
  campaign.writeBigUInt64LE(199_999_994_604_075_000n, 96);
  campaign[104] = 1;
  Buffer.from(CAMPAIGN_V1_ECONOMIC_CONFIG_HASH, "hex").copy(campaign, 105);
  Buffer.from(CAMPAIGN_UNUSED_BALANCE_POLICY_HASH, "hex").copy(campaign, 137);
  const vault = Buffer.alloc(165);
  new PublicKey(config.mintAddress).toBuffer().copy(vault, 0);
  new PublicKey(config.tokenConfigAddress).toBuffer().copy(vault, 32);
  vault.writeBigUInt64LE(199_999_994_604_075_000n, 64);
  return { campaign, vault };
}

test("builds only the reviewed campaign v2 migration instruction", () => {
  const config = TOKENOMICS_CAMPAIGN_V2_MIGRATION_CONFIG;
  const instruction = createCampaignV2MigrationInstruction();
  assert.equal(instruction.programId.toBase58(), config.programId);
  assert.deepEqual(
    Array.from(instruction.data),
    [100, 178, 128, 189, 111, 51, 245, 184],
  );
  assert.deepEqual(
    instruction.keys.map((key) => ({
      address: key.pubkey.toBase58(),
      signer: key.isSigner,
      writable: key.isWritable,
    })),
    [
      { address: config.vaultAddress, signer: true, writable: false },
      { address: config.tokenConfigAddress, signer: false, writable: false },
      { address: config.campaignAddress, signer: false, writable: true },
      {
        address: config.campaignVaultAddress,
        signer: false,
        writable: false,
      },
    ],
  );
});

test("decodes the exact pre-migration campaign balance boundary", () => {
  const { campaign, vault } = reviewedCampaignBytes();
  assert.deepEqual(
    decodeCampaignV2Snapshot({ campaignData: campaign, vaultData: vault }),
    {
      cumulativeDistributedAtoms: 5_395_925_000n,
      economicConfigHash: CAMPAIGN_V1_ECONOMIC_CONFIG_HASH,
      originalAllocationAtoms: 200_000_000_000_000_000n,
      paused: false,
      remainingAtoms: 199_999_994_604_075_000n,
      state: 1,
      unusedBalancePolicyHash: CAMPAIGN_UNUSED_BALANCE_POLICY_HASH,
      vaultAmountAtoms: 199_999_994_604_075_000n,
    },
  );
});

test("allows creation, distinct approvals, and execution in order", () => {
  const [walletA, walletB] = SQUADS_DEVNET_CONFIG.members;
  assert.deepEqual(
    campaignV2MigrationActionAvailability({
      approved: [],
      memberAddress: walletA!.address,
      status: "NotCreated",
    }),
    { canApprove: false, canCreate: true, canExecute: false },
  );
  assert.deepEqual(
    campaignV2MigrationActionAvailability({
      approved: [walletA!.address],
      memberAddress: walletB!.address,
      status: "Active",
    }),
    { canApprove: true, canCreate: false, canExecute: false },
  );
  assert.deepEqual(
    campaignV2MigrationActionAvailability({
      approved: [walletA!.address, walletB!.address],
      memberAddress: walletB!.address,
      status: "Approved",
    }),
    { canApprove: false, canCreate: false, canExecute: true },
  );
});

test("accepts only reconciled reward distribution after migration", () => {
  const { campaign, vault } = reviewedCampaignBytes();
  Buffer.from(CAMPAIGN_V2_ECONOMIC_CONFIG_HASH, "hex").copy(campaign, 105);
  campaign.writeBigUInt64LE(5_995_925_000n, 88);
  campaign.writeBigUInt64LE(199_999_994_004_075_000n, 96);
  vault.writeBigUInt64LE(199_999_994_004_075_000n, 64);
  const snapshot = decodeCampaignV2Snapshot({
    campaignData: campaign,
    vaultData: vault,
  });
  assert.deepEqual(
    validateReviewedCampaignV2Snapshot(snapshot, {
      allowPostMigrationRewards: true,
      expectedHash: CAMPAIGN_V2_ECONOMIC_CONFIG_HASH,
    }),
    [],
  );
  assert.notDeepEqual(
    validateReviewedCampaignV2Snapshot(
      { ...snapshot, vaultAmountAtoms: snapshot.vaultAmountAtoms - 1n },
      {
        allowPostMigrationRewards: true,
        expectedHash: CAMPAIGN_V2_ECONOMIC_CONFIG_HASH,
      },
    ),
    [],
  );
});
