import type { ClaimRecordApi } from "./types";

const RETRYABLE_CLAIM_STATUSES = new Set<ClaimRecordApi["status"]>([
  "available",
  "failed",
  "pending_wallet_approval",
]);

export function isClaimExpired(
  record: ClaimRecordApi,
  nowMs = Date.now(),
): boolean {
  if (!record.claimWindowExpiresAt) {
    return false;
  }
  const expiresAt = Date.parse(record.claimWindowExpiresAt);
  return Number.isFinite(expiresAt) && expiresAt <= nowMs;
}

export function isClaimActionable(
  record: ClaimRecordApi,
  nowMs = Date.now(),
): boolean {
  return (
    RETRYABLE_CLAIM_STATUSES.has(record.status) &&
    !isClaimExpired(record, nowMs)
  );
}

export interface PlayerClaimTotals {
  actionable: ClaimRecordApi[];
  claimedRewardLamports: number;
  claimablePrizeLamports: number;
  claimableRewardLamports: number;
  lifetimePrizeLamports: number;
}

function isReward(record: ClaimRecordApi) {
  return record.kind === "creator_reward" || record.kind === "voter_reward";
}

export function summarizePlayerClaims(
  records: ClaimRecordApi[],
  nowMs = Date.now(),
): PlayerClaimTotals {
  const totals: PlayerClaimTotals = {
    actionable: [],
    claimedRewardLamports: 0,
    claimablePrizeLamports: 0,
    claimableRewardLamports: 0,
    lifetimePrizeLamports: 0,
  };

  for (const record of records) {
    const reward = isReward(record);
    if (record.kind === "winner_payout") {
      totals.lifetimePrizeLamports += record.amountLamports;
    } else if (reward && record.status === "claimed") {
      totals.claimedRewardLamports += record.amountLamports;
    }

    if (!isClaimActionable(record, nowMs)) {
      continue;
    }
    totals.actionable.push(record);
    if (record.kind === "winner_payout") {
      totals.claimablePrizeLamports += record.amountLamports;
    } else if (reward) {
      totals.claimableRewardLamports += record.amountLamports;
    }
  }

  return totals;
}
