import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { hashCanonicalLeafFile, hashEpochManifest } from "@tyche/tokenomics";

import {
  authorizeTokenomicsProjection,
  getPublicTokenomicsSnapshot,
  getTokenomicsEpochArtifact,
  getWalletTokenomicsProjection,
  resetTokenomicsProjectionForTests,
  restoreTokenomicsEpochArtifacts,
  restoreTokenomicsProjection,
  saveTokenomicsEpochArtifact,
  saveTokenomicsProjection,
  type TokenomicsProjection,
} from "./tokenomics.js";

const projection: TokenomicsProjection = {
  allocation: {
    campaignReserveAtoms: "200",
    creatorTreasuryAtoms: "800",
    fixedSupplyAtoms: "1000",
    freezeAuthorityRevoked: true,
    mintAuthorityRevoked: true,
  },
  campaigns: [
    {
      campaignId: "0",
      cumulativeDistributedAtoms: "25",
      originalAllocationAtoms: "200",
      remainingAtoms: "175",
      state: "funded",
      vault: "campaign-vault",
    },
  ],
  cluster: "devnet",
  currentEpoch: {
    epochId: "1",
    grossDistributableLamports: "11",
    manifestHash: "manifest",
    merkleRoot: "root",
    remainingClaimLiabilityLamports: "8",
    rolloverOutLamports: "1",
    rootVersion: 1,
    status: "sealed",
    sumOfMerkleClaimsLamports: "10",
    totalWeight: "3",
    verificationWindowEndsAt: null,
  },
  indexedAt: "2026-07-17T00:00:00.000Z",
  indexedFinalizedSlot: "123",
  lockConcentrationBps: 8_000,
  lockedSupplyAtoms: "800",
  mint: "mint",
  programId: "program",
  uniqueLockers: 1,
  vaults: {
    correctionReserve: "correction-reserve",
    correctionReserveLamports: "0",
    distribution: "distribution-vault",
    distributionAvailableLamports: "8",
    initialCampaign: "campaign-vault",
    treasuryLockEscrow: "lock-escrow",
    treasuryReserve: "treasury-reserve",
    treasurySol: "treasury-sol-vault",
    treasurySolLamports: "0",
  },
  wallets: [
    {
      claimableLamports: "8",
      claimedLamports: "0",
      claimRecords: [
        {
          amountLamports: "8",
          beneficiary: "wallet",
          epochId: "1",
          epochKind: "standard",
          position: "position",
          proof: [],
          rootVersion: 1,
          signature: "",
          status: "claimable",
        },
      ],
      currentEpochWeight: "3",
      lockedAtoms: "800",
      promotionalRewardAtoms: "25",
      unlockedTokenAccount: "wallet-token-account",
      unlockedAtoms: "0",
      wallet: "wallet",
    },
  ],
};

afterEach(() => {
  delete process.env.TOKENOMICS_PROJECTION_TOKEN;
  resetTokenomicsProjectionForTests();
});

test("public tokenomics remains explicitly unavailable before indexing", () => {
  assert.deepEqual(getPublicTokenomicsSnapshot(), {
    available: false,
    projection: null,
    reason: "not_indexed",
  });
});

test("projection reconciliation gates public and wallet views", () => {
  saveTokenomicsProjection(projection);
  assert.equal(getPublicTokenomicsSnapshot().available, true);
  assert.equal(getWalletTokenomicsProjection("wallet")?.lockedAtoms, "800");
  assert.throws(
    () =>
      saveTokenomicsProjection({
        ...projection,
        campaigns: [
          {
            ...projection.campaigns[0]!,
            remainingAtoms: "176",
          },
        ],
      }),
    /tokenomics_campaign_reconciliation_mismatch/,
  );
});

test("projection writes fail closed without the configured bearer token", () => {
  assert.deepEqual(authorizeTokenomicsProjection(undefined), {
    error: "tokenomics_projection_auth_not_configured",
    ok: false,
    statusCode: 503,
  });
  process.env.TOKENOMICS_PROJECTION_TOKEN = "secret";
  assert.equal(authorizeTokenomicsProjection("Bearer wrong").statusCode, 403);
  assert.equal(authorizeTokenomicsProjection("Bearer secret").ok, true);
});

test("projection and content-addressed epoch artifacts survive restoration", () => {
  saveTokenomicsProjection(projection);
  const leafFileHash = hashCanonicalLeafFile([]);
  const manifest = {
    calculationCodeCommit: "1".repeat(64),
    epochId: "7",
    grossDistributableLamports: "0",
    leafFileHash,
    lockEventInputHash: "2".repeat(64),
    lockIntervalOutputHash: "3".repeat(64),
    network: "devnet",
    programId: "4".repeat(64),
    rolloverOutLamports: "0",
    schemaVersion: "1",
    slotEnd: "11",
    slotStart: "10",
    sumOfMerkleClaimsLamports: "0",
    totalWeight: "0",
  };
  const manifestHash = hashEpochManifest({
    calculationCodeCommit: manifest.calculationCodeCommit,
    epochId: 7n,
    grossDistributableLamports: 0n,
    leafFileHash,
    lockEventInputHash: manifest.lockEventInputHash,
    lockIntervalOutputHash: manifest.lockIntervalOutputHash,
    network: manifest.network,
    programId: manifest.programId,
    rolloverOutLamports: 0n,
    schemaVersion: "1",
    slotEnd: 11n,
    slotStart: 10n,
    sumOfMerkleClaimsLamports: 0n,
    totalWeight: 0n,
  });
  const artifact = saveTokenomicsEpochArtifact({
    claims: [],
    leafFileHash,
    manifest,
    manifestHash,
    merkleRoot: null,
  });

  resetTokenomicsProjectionForTests();
  restoreTokenomicsProjection(projection);
  restoreTokenomicsEpochArtifacts([artifact]);

  assert.equal(getPublicTokenomicsSnapshot().available, true);
  assert.deepEqual(getTokenomicsEpochArtifact(manifestHash), artifact);
});
