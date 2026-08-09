import { timingSafeEqual } from "node:crypto";
import {
  buildMerkleTree,
  hashCanonicalLeafFile,
  hashEpochManifest,
  hashTreasuryDistributionLeaf,
  verifyMerkleProof,
  type TreasuryDistributionLeaf,
} from "@tyche/tokenomics";

const DECIMAL = /^\d+$/;

export interface TokenomicsAllocationProjection {
  campaignReserveAtoms: string;
  creatorTreasuryAtoms: string;
  fixedSupplyAtoms: string;
  mintAuthorityRevoked: boolean;
  freezeAuthorityRevoked: boolean;
}

export interface TokenomicsCampaignProjection {
  campaignId: string;
  cumulativeDistributedAtoms: string;
  originalAllocationAtoms: string;
  remainingAtoms: string;
  state: "draft" | "ended" | "exhausted" | "funded";
  vault: string;
}

export interface TokenomicsEpochProjection {
  epochId: string;
  grossDistributableLamports: string;
  manifestHash: string | null;
  merkleRoot: string | null;
  remainingClaimLiabilityLamports: string;
  rolloverOutLamports: string;
  rootVersion: number;
  status:
    | "calculating"
    | "challenged"
    | "collecting"
    | "expired_unresolved"
    | "provisional"
    | "rolled_over_no_weight"
    | "sealed";
  sumOfMerkleClaimsLamports: string;
  totalWeight: string;
  verificationWindowEndsAt: string | null;
}

export interface TokenomicsWalletProjection {
  claimableLamports: string;
  claimedLamports: string;
  claimRecords: Array<{
    amountLamports: string;
    beneficiary: string;
    epochId: string;
    epochKind: "correction" | "standard";
    position: string;
    proof: string[];
    rootVersion: number;
    signature: string;
    status: "claimable" | "claimed";
  }>;
  currentEpochWeight: string;
  lockedAtoms: string;
  promotionalRewardAtoms: string;
  unlockedTokenAccount: string;
  unlockedAtoms: string;
  wallet: string;
}

export interface TokenomicsProjection {
  allocation: TokenomicsAllocationProjection;
  campaigns: TokenomicsCampaignProjection[];
  cluster: string;
  currentEpoch: TokenomicsEpochProjection | null;
  indexedFinalizedSlot: string;
  indexedAt: string;
  lockConcentrationBps: number;
  lockedSupplyAtoms: string;
  mint: string;
  programId: string;
  uniqueLockers: number;
  vaults: {
    correctionReserve: string;
    correctionReserveLamports: string;
    distribution: string;
    distributionAvailableLamports: string;
    initialCampaign: string;
    treasuryLockEscrow: string;
    treasuryReserve: string;
    treasurySol: string;
    treasurySolLamports: string;
  };
  wallets: TokenomicsWalletProjection[];
}

export interface PublicTokenomicsSnapshot {
  available: boolean;
  reason: "not_indexed" | null;
  projection: Omit<TokenomicsProjection, "wallets"> | null;
}

let projection: TokenomicsProjection | null = null;
const epochArtifacts = new Map<string, TokenomicsEpochArtifact>();

export interface TokenomicsEpochArtifact {
  claims: Array<{
    amountLamports: string;
    beneficiary: string;
    leafHash: string;
    position: string;
    proof: string[];
  }>;
  leafFileHash: string;
  manifest: {
    calculationCodeCommit: string;
    epochId: string;
    grossDistributableLamports: string;
    leafFileHash: string;
    lockEventInputHash: string;
    lockIntervalOutputHash: string;
    network: string;
    programId: string;
    rolloverOutLamports: string;
    schemaVersion: string;
    slotEnd: string;
    slotStart: string;
    sumOfMerkleClaimsLamports: string;
    totalWeight: string;
  };
  manifestHash: string;
  merkleRoot: string | null;
}

export function saveTokenomicsEpochArtifact(
  artifact: TokenomicsEpochArtifact,
): TokenomicsEpochArtifact {
  validateEpochArtifact(artifact);
  const existing = epochArtifacts.get(artifact.manifestHash);
  if (existing && JSON.stringify(existing) !== JSON.stringify(artifact)) {
    throw new Error("tokenomics_artifact_hash_collision");
  }
  epochArtifacts.set(artifact.manifestHash, structuredClone(artifact));
  return structuredClone(artifact);
}

export function getTokenomicsEpochArtifact(
  manifestHash: string,
): TokenomicsEpochArtifact | null {
  const artifact = epochArtifacts.get(manifestHash);
  return artifact ? structuredClone(artifact) : null;
}

export function exportTokenomicsEpochArtifacts(): TokenomicsEpochArtifact[] {
  return [...epochArtifacts.values()].map((artifact) =>
    structuredClone(artifact),
  );
}

export function restoreTokenomicsEpochArtifacts(
  artifacts: readonly TokenomicsEpochArtifact[] | undefined,
): void {
  epochArtifacts.clear();
  for (const artifact of artifacts ?? []) {
    saveTokenomicsEpochArtifact(artifact);
  }
}

export function saveTokenomicsProjection(
  next: TokenomicsProjection,
): TokenomicsProjection {
  validateProjection(next);
  projection = structuredClone(next);
  return structuredClone(next);
}

export function getTokenomicsProjection(): TokenomicsProjection | null {
  return projection ? structuredClone(projection) : null;
}

export function restoreTokenomicsProjection(
  restored: TokenomicsProjection | null | undefined,
): void {
  if (!restored) {
    projection = null;
    return;
  }
  validateProjection(restored);
  projection = structuredClone(restored);
}

export function getPublicTokenomicsSnapshot(): PublicTokenomicsSnapshot {
  if (!projection) {
    return { available: false, projection: null, reason: "not_indexed" };
  }
  const publicProjection = Object.fromEntries(
    Object.entries(projection).filter(([key]) => key !== "wallets"),
  ) as Omit<TokenomicsProjection, "wallets">;
  return {
    available: true,
    projection: structuredClone(publicProjection),
    reason: null,
  };
}

export function getWalletTokenomicsProjection(
  wallet: string,
): TokenomicsWalletProjection | null {
  return (
    projection?.wallets.find((candidate) => candidate.wallet === wallet) ?? null
  );
}

export function resetTokenomicsProjectionForTests(): void {
  projection = null;
  epochArtifacts.clear();
}

export function isTokenomicsEpochArtifact(
  value: unknown,
): value is TokenomicsEpochArtifact {
  try {
    validateEpochArtifact(value as TokenomicsEpochArtifact);
    return true;
  } catch {
    return false;
  }
}

function validateEpochArtifact(artifact: TokenomicsEpochArtifact): void {
  if (
    !artifact ||
    !artifact.manifest ||
    !Array.isArray(artifact.claims) ||
    !/^[0-9a-f]{64}$/i.test(artifact.manifestHash) ||
    !/^[0-9a-f]{64}$/i.test(artifact.leafFileHash)
  ) {
    throw new Error("invalid_tokenomics_epoch_artifact");
  }
  const manifestHash = hashEpochManifest({
    calculationCodeCommit: artifact.manifest.calculationCodeCommit,
    epochId: BigInt(artifact.manifest.epochId),
    grossDistributableLamports: BigInt(
      artifact.manifest.grossDistributableLamports,
    ),
    leafFileHash: artifact.manifest.leafFileHash,
    lockEventInputHash: artifact.manifest.lockEventInputHash,
    lockIntervalOutputHash: artifact.manifest.lockIntervalOutputHash,
    network: artifact.manifest.network,
    programId: artifact.manifest.programId,
    rolloverOutLamports: BigInt(artifact.manifest.rolloverOutLamports),
    schemaVersion: artifact.manifest.schemaVersion,
    slotEnd: BigInt(artifact.manifest.slotEnd),
    slotStart: BigInt(artifact.manifest.slotStart),
    sumOfMerkleClaimsLamports: BigInt(
      artifact.manifest.sumOfMerkleClaimsLamports,
    ),
    totalWeight: BigInt(artifact.manifest.totalWeight),
  });
  if (
    manifestHash !== artifact.manifestHash ||
    artifact.manifest.leafFileHash !== artifact.leafFileHash
  ) {
    throw new Error("tokenomics_epoch_manifest_hash_mismatch");
  }
  const leaves: TreasuryDistributionLeaf[] = artifact.claims.map((claim) => ({
    amountLamports: BigInt(claim.amountLamports),
    asset: "SOL",
    beneficiary: Uint8Array.from(Buffer.from(claim.beneficiary, "hex")),
    epochId: BigInt(artifact.manifest.epochId),
    network: artifact.manifest.network,
    positionId: Uint8Array.from(Buffer.from(claim.position, "hex")),
    programId: Uint8Array.from(Buffer.from(artifact.manifest.programId, "hex")),
  }));
  if (hashCanonicalLeafFile(leaves) !== artifact.leafFileHash) {
    throw new Error("tokenomics_epoch_leaf_file_hash_mismatch");
  }
  if (leaves.length === 0) {
    if (artifact.merkleRoot !== null || artifact.claims.length !== 0) {
      throw new Error("tokenomics_epoch_empty_tree_mismatch");
    }
    return;
  }
  const tree = buildMerkleTree(leaves);
  if (Buffer.from(tree.root).toString("hex") !== artifact.merkleRoot) {
    throw new Error("tokenomics_epoch_merkle_root_mismatch");
  }
  for (let index = 0; index < leaves.length; index += 1) {
    const leaf = leaves[index];
    const claim = artifact.claims[index];
    if (!leaf || !claim) {
      throw new Error("tokenomics_epoch_claim_missing");
    }
    const leafHash = hashTreasuryDistributionLeaf(leaf);
    if (
      Buffer.from(leafHash).toString("hex") !== claim.leafHash ||
      !verifyMerkleProof(
        tree.root,
        leafHash,
        claim.proof.map((node) => Uint8Array.from(Buffer.from(node, "hex"))),
      )
    ) {
      throw new Error("tokenomics_epoch_merkle_proof_mismatch");
    }
  }
}

export function authorizeTokenomicsProjection(
  authorizationHeader: string | undefined,
): { error?: string; ok: boolean; statusCode: number } {
  const expected = process.env.TOKENOMICS_PROJECTION_TOKEN;
  if (!expected) {
    return {
      error: "tokenomics_projection_auth_not_configured",
      ok: false,
      statusCode: 503,
    };
  }
  const prefix = "Bearer ";
  if (!authorizationHeader?.startsWith(prefix)) {
    return {
      error: "tokenomics_projection_authorization_required",
      ok: false,
      statusCode: 401,
    };
  }
  const supplied = authorizationHeader.slice(prefix.length);
  const expectedDigest = Buffer.from(expected);
  const suppliedDigest = Buffer.from(supplied);
  if (
    expectedDigest.length !== suppliedDigest.length ||
    !timingSafeEqual(expectedDigest, suppliedDigest)
  ) {
    return {
      error: "tokenomics_projection_authorization_invalid",
      ok: false,
      statusCode: 403,
    };
  }
  return { ok: true, statusCode: 200 };
}

export function isTokenomicsProjection(
  value: unknown,
): value is TokenomicsProjection {
  if (!value || typeof value !== "object") {
    return false;
  }
  try {
    validateProjection(value as TokenomicsProjection);
    return true;
  } catch {
    return false;
  }
}

function validateProjection(value: TokenomicsProjection): void {
  if (
    !value.allocation ||
    !Array.isArray(value.campaigns) ||
    !Array.isArray(value.wallets) ||
    !value.vaults ||
    !value.programId ||
    !value.mint ||
    !value.cluster ||
    !isIsoDate(value.indexedAt) ||
    !Number.isInteger(value.uniqueLockers) ||
    value.uniqueLockers < 0 ||
    !Number.isInteger(value.lockConcentrationBps) ||
    value.lockConcentrationBps < 0 ||
    value.lockConcentrationBps > 10_000
  ) {
    throw new Error("invalid_tokenomics_projection");
  }
  const allocation = value.allocation;
  const fixedSupply = decimal(allocation.fixedSupplyAtoms, "fixedSupplyAtoms");
  const campaignReserve = decimal(
    allocation.campaignReserveAtoms,
    "campaignReserveAtoms",
  );
  const creatorTreasury = decimal(
    allocation.creatorTreasuryAtoms,
    "creatorTreasuryAtoms",
  );
  if (campaignReserve + creatorTreasury !== fixedSupply) {
    throw new Error("tokenomics_supply_allocation_mismatch");
  }
  decimal(value.indexedFinalizedSlot, "indexedFinalizedSlot");
  const lockedSupply = decimal(value.lockedSupplyAtoms, "lockedSupplyAtoms");
  if (lockedSupply > fixedSupply) {
    throw new Error("tokenomics_locked_supply_exceeds_fixed_supply");
  }
  decimal(value.vaults.correctionReserveLamports, "correctionReserveLamports");
  decimal(
    value.vaults.distributionAvailableLamports,
    "distributionAvailableLamports",
  );
  decimal(value.vaults.treasurySolLamports, "treasurySolLamports");
  if (
    !value.vaults.correctionReserve ||
    !value.vaults.distribution ||
    !value.vaults.initialCampaign ||
    !value.vaults.treasuryLockEscrow ||
    !value.vaults.treasuryReserve ||
    !value.vaults.treasurySol
  ) {
    throw new Error("tokenomics_vault_address_missing");
  }
  for (const campaign of value.campaigns) {
    const original = decimal(
      campaign.originalAllocationAtoms,
      "originalAllocationAtoms",
    );
    const issued = decimal(
      campaign.cumulativeDistributedAtoms,
      "cumulativeDistributedAtoms",
    );
    const remaining = decimal(campaign.remainingAtoms, "remainingAtoms");
    if (issued + remaining !== original) {
      throw new Error("tokenomics_campaign_reconciliation_mismatch");
    }
    if ((campaign.state === "exhausted") !== (remaining === 0n)) {
      throw new Error("tokenomics_campaign_exhaustion_state_mismatch");
    }
  }
  if (value.currentEpoch) {
    const gross = decimal(
      value.currentEpoch.grossDistributableLamports,
      "grossDistributableLamports",
    );
    const claims = decimal(
      value.currentEpoch.sumOfMerkleClaimsLamports,
      "sumOfMerkleClaimsLamports",
    );
    const rollover = decimal(
      value.currentEpoch.rolloverOutLamports,
      "rolloverOutLamports",
    );
    const remaining = decimal(
      value.currentEpoch.remainingClaimLiabilityLamports,
      "remainingClaimLiabilityLamports",
    );
    decimal(value.currentEpoch.totalWeight, "totalWeight");
    const reconciledStatus =
      value.currentEpoch.status === "challenged" ||
      value.currentEpoch.status === "provisional" ||
      value.currentEpoch.status === "rolled_over_no_weight" ||
      value.currentEpoch.status === "sealed";
    if (
      (reconciledStatus && claims + rollover !== gross) ||
      remaining > claims
    ) {
      throw new Error("tokenomics_epoch_reconciliation_mismatch");
    }
  }
  const seenWallets = new Set<string>();
  for (const wallet of value.wallets) {
    if (
      !wallet.wallet ||
      !wallet.unlockedTokenAccount ||
      seenWallets.has(wallet.wallet)
    ) {
      throw new Error("tokenomics_wallet_projection_duplicate");
    }
    seenWallets.add(wallet.wallet);
    decimal(wallet.unlockedAtoms, "unlockedAtoms");
    decimal(wallet.lockedAtoms, "lockedAtoms");
    decimal(wallet.currentEpochWeight, "currentEpochWeight");
    decimal(wallet.claimableLamports, "claimableLamports");
    decimal(wallet.claimedLamports, "claimedLamports");
    decimal(wallet.promotionalRewardAtoms, "promotionalRewardAtoms");
    for (const claim of wallet.claimRecords) {
      decimal(claim.epochId, "claimEpochId");
      decimal(claim.amountLamports, "claimAmountLamports");
      if (
        !claim.beneficiary ||
        !claim.position ||
        !Number.isInteger(claim.rootVersion) ||
        claim.rootVersion <= 0 ||
        !Array.isArray(claim.proof) ||
        claim.proof.some((node) => !/^[\da-f]{64}$/i.test(node)) ||
        (claim.status === "claimed" && !claim.signature)
      ) {
        throw new Error("tokenomics_claim_proof_invalid");
      }
    }
  }
}

function decimal(value: string, field: string): bigint {
  if (!DECIMAL.test(value)) {
    throw new Error(`${field}_must_be_unsigned_decimal`);
  }
  return BigInt(value);
}

function isIsoDate(value: string): boolean {
  return !Number.isNaN(Date.parse(value));
}
