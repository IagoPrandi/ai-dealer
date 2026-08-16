"use client";

import { useMemo, useState } from "react";

import { useTyche } from "../context";
import { claimRecordToWallet } from "../data/claimFlow";
import {
  isClaimActionable,
  isClaimExpired,
  summarizePlayerClaims,
} from "../data/claimState";
import { fmtClaimSol, fmtTurnId, lamportsToSol, truncateAddress } from "../data/format";
import { usePlayerClaims } from "../data/hooks";
import { describeTxError } from "../data/tx";
import type { ClaimKind, ClaimRecordApi, ClaimStatus } from "../data/types";
import { Dealer, Ico, ScreenHead, SectionLabel } from "../shared";

const KIND_LABELS: Record<ClaimKind, string> = {
  creator_reward: "Creator reward",
  voter_reward: "Voter reward",
  winner_payout: "Prize payout",
};

const STATUS_LABELS: Record<ClaimStatus, string> = {
  available: "Claimable",
  claimed: "Claimed",
  failed: "Failed",
  pending_wallet_approval: "Pending wallet approval",
  unavailable: "Unavailable",
};

function statusRank(status: ClaimStatus) {
  if (status === "available") {
    return 0;
  }
  if (status === "pending_wallet_approval") {
    return 1;
  }
  if (status === "claimed") {
    return 2;
  }
  if (status === "failed") {
    return 3;
  }
  return 4;
}

function claimTone(status: ClaimStatus) {
  if (status === "available") {
    return "var(--green)";
  }
  if (status === "pending_wallet_approval") {
    return "var(--yellow)";
  }
  if (status === "failed") {
    return "var(--red)";
  }
  return "var(--muted)";
}

function ClaimRow({
  busy,
  onClaim,
  record,
}: {
  busy: boolean;
  onClaim: (record: ClaimRecordApi) => void;
  record: ClaimRecordApi;
}) {
  const expired = isClaimExpired(record);
  const claimable = isClaimActionable(record);
  const actionLabel =
    record.status === "pending_wallet_approval"
      ? "Resume claim"
      : record.status === "failed"
        ? "Retry claim"
        : "Claim to wallet";
  return (
    <div className="ide-card" style={{ padding: "14px 15px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span style={{ width: 36, height: 36, borderRadius: 12, background: "var(--surface-2)", color: record.kind === "winner_payout" ? "var(--gold)" : "var(--green)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          {record.kind === "winner_payout" ? <Ico.trophy style={{ color: "currentColor" }} /> : <Ico.gift style={{ color: "currentColor" }} />}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{KIND_LABELS[record.kind]}</div>
            <span className="ide-pill" style={{ color: expired ? "var(--dim)" : claimTone(record.status), padding: "4px 8px" }}>{expired ? "Expired" : STATUS_LABELS[record.status]}</span>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 12.5, marginTop: 4 }}>
            <span className="ide-num">{fmtTurnId(record.turnId)}</span>
            <span style={{ margin: "0 6px", color: "var(--dim)" }}>·</span>
            <span className="ide-num">{truncateAddress(record.claimId)}</span>
          </div>
        </div>
        <div style={{ textAlign: "right", flexShrink: 0 }}>
          <div className="ide-num" style={{ fontWeight: 800, fontSize: 15.5 }}>{fmtClaimSol(lamportsToSol(record.amountLamports))} SOL</div>
          <a href={`/round/${record.turnId}`} style={{ color: "var(--purple-soft)", fontSize: 12.5, textDecoration: "none" }}>Round detail</a>
        </div>
      </div>
      {claimable ? (
        <button
          className="ide-btn"
          disabled={busy}
          onClick={() => onClaim(record)}
          style={{ width: "100%", justifyContent: "center", marginTop: 12, padding: 12, opacity: busy ? 0.6 : 1 }}
          type="button"
        >
          <Ico.withdraw style={{ color: "var(--on-accent)" }} /> {busy ? "Claiming..." : actionLabel}
        </button>
      ) : (
        <div style={{ color: "var(--dim)", fontSize: 12.5, lineHeight: 1.45, marginTop: 10 }}>
          {expired ? "Claim window expired" : record.statusReason}
        </div>
      )}
    </div>
  );
}

export function ClaimsScreen() {
  const { client, go, wallet, walletAddress } = useTyche();
  const { claims, error, loading, reload } = usePlayerClaims(walletAddress);
  const [busyClaimId, setBusyClaimId] = useState<null | string>(null);
  const [txError, setTxError] = useState<null | string>(null);

  const records = useMemo(
    () =>
      [...(claims?.records ?? [])].sort((left, right) => {
        const statusDelta = statusRank(left.status) - statusRank(right.status);
        return statusDelta !== 0 ? statusDelta : right.turnId - left.turnId;
      }),
    [claims?.records],
  );

  const claimTotals = summarizePlayerClaims(records);
  const actionable = claimTotals.actionable;
  const actionableLamports =
    claimTotals.claimablePrizeLamports + claimTotals.claimableRewardLamports;
  const claimableCount = actionable.length;
  const pendingCount = actionable.filter((record) => record.status === "pending_wallet_approval").length;
  const claimedCount = records.filter((record) => record.status === "claimed").length;

  async function claim(record: ClaimRecordApi) {
    if (!wallet || !walletAddress) {
      return;
    }
    setBusyClaimId(record.claimId);
    setTxError(null);
    try {
      await claimRecordToWallet({
        client,
        record,
        wallet,
        walletAddress,
      });
    } catch (cause) {
      setTxError(describeTxError(cause));
    } finally {
      reload();
      setBusyClaimId(null);
    }
  }

  if (!walletAddress) {
    return (
      <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
        <div className="ide-ambient" />
        <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 28px" }}>
          <Dealer size={60} />
          <h2 style={{ fontSize: 23, fontWeight: 800, margin: "16px 0 8px" }}>Connect your wallet to see claims</h2>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 24px" }}>Claimable payouts, pending approvals, and claimed rewards are wallet-scoped.</p>
          <a href="/play/wallet" className="ide-btn" style={{ width: "100%", padding: 16, justifyContent: "center", textDecoration: "none" }}><Ico.wallet style={{ color: "var(--on-accent)" }} /> Connect wallet</a>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, width: "100%", marginTop: 12 }}>
            <a href="/play/pick" className="ide-btn-ghost ide-btn" style={{ padding: 12, justifyContent: "center", textDecoration: "none" }}>Join next round</a>
            <a href="/play/rewards" className="ide-btn-ghost ide-btn" style={{ padding: 12, justifyContent: "center", textDecoration: "none" }}>Reward history</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", overflowX: "hidden", padding: "var(--ide-shell-content-top) 18px 96px" }}>
        <ScreenHead onBack={() => go("home")} title="Claims" />

        <div className="ide-card" style={{ padding: 18, marginBottom: 14, borderColor: "var(--line-2)", background: "linear-gradient(150deg, var(--surface-2), var(--surface))" }}>
          <SectionLabel>Available to claim</SectionLabel>
          <div className="ide-num" style={{ fontSize: 36, fontWeight: 800, marginTop: 6 }}>{fmtClaimSol(lamportsToSol(actionableLamports))} <span style={{ color: "var(--purple-soft)", fontSize: 16 }}>SOL</span></div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 9, marginBottom: 14 }}>
          <div className="ide-card" style={{ padding: 12 }}>
            <div className="ide-num" style={{ fontSize: 22, fontWeight: 800 }}>{claimableCount}</div>
            <div style={{ color: "var(--dim)", fontSize: 12 }}>claimable</div>
          </div>
          <div className="ide-card" style={{ padding: 12 }}>
            <div className="ide-num" style={{ fontSize: 22, fontWeight: 800 }}>{pendingCount}</div>
            <div style={{ color: "var(--dim)", fontSize: 12 }}>pending</div>
          </div>
          <div className="ide-card" style={{ padding: 12 }}>
            <div className="ide-num" style={{ fontSize: 22, fontWeight: 800 }}>{claimedCount}</div>
            <div style={{ color: "var(--dim)", fontSize: 12 }}>claimed</div>
          </div>
        </div>

        {txError ? (
          <div className="ide-card" style={{ padding: 14, color: "var(--red)", fontSize: 13.5, marginBottom: 12 }}>
            {txError}
          </div>
        ) : null}

        {loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="ide-card" style={{ height: 92 }} />
            <div className="ide-card" style={{ height: 92 }} />
          </div>
        ) : null}

        {!loading && error ? (
          <div className="ide-card" style={{ padding: 18, textAlign: "center" }}>
            <div style={{ fontWeight: 800 }}>Could not load your claims.</div>
            <p style={{ margin: "6px 0 14px", color: "var(--muted)", fontSize: 13.5 }}>The claims endpoint returned an error.</p>
            <button className="ide-btn-ghost ide-btn" onClick={() => reload()} style={{ width: "100%", justifyContent: "center" }} type="button">Try again</button>
          </div>
        ) : null}

        {!loading && !error && records.length === 0 ? (
          <div className="ide-card" style={{ padding: 22, textAlign: "center" }}>
            <Ico.gift style={{ color: "var(--dim)", width: 24, height: 24 }} />
            <div style={{ fontWeight: 800, marginTop: 9 }}>No claims yet.</div>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>Prize payouts and creator or voter rewards appear here after settlement.</p>
          </div>
        ) : null}

        {!loading && !error && records.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {records.map((record) => (
              <ClaimRow
                key={record.claimId}
                busy={busyClaimId !== null}
                onClaim={(claimRecord) => void claim(claimRecord)}
                record={record}
              />
            ))}
          </div>
        ) : null}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 14 }}>
          <a href="/play/pick" className="ide-btn-ghost ide-btn" style={{ padding: 12, justifyContent: "center", textDecoration: "none" }}>Join next round</a>
          <a href="/play/rewards" className="ide-btn-ghost ide-btn" style={{ padding: 12, justifyContent: "center", textDecoration: "none" }}>Reward history</a>
        </div>
      </div>
    </div>
  );
}
