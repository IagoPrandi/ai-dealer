import { timingSafeEqual } from "node:crypto";

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

export function saveTokenomicsProjection(
  next: TokenomicsProjection,
): TokenomicsProjection {
  validateProjection(next);
  projection = structuredClone(next);
  return structuredClone(next);
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
    if (claims + rollover !== gross || remaining > claims) {
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
