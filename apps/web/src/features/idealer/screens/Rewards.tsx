"use client";

import { useMemo } from "react";

import { useIdealer } from "../context";
import { expiresInLabel, fmtSol, lamportsToSol, truncateAddress } from "../data/format";
import { usePlayerClaims } from "../data/hooks";
import type { ClaimKind, ClaimRecordApi, ClaimStatus } from "../data/types";
import { Dealer, Ico, ScreenHead, SectionLabel } from "../shared";

const KIND_LABELS: Record<ClaimKind, string> = {
  creator_reward: "Creator reward",
  voter_reward: "Voter reward",
  winner_payout: "Prize payout",
};

const STATUS_LABELS: Record<ClaimStatus, string> = {
  available: "Available",
  claimed: "Claimed",
  failed: "Failed",
  pending_wallet_approval: "Pending wallet approval",
  unavailable: "Unavailable",
};

function RewardSummaryTile({
  label,
  value,
}: {
  label: string;
  value: number;
}) {
  return (
    <div className="ide-card" style={{ padding: "12px 13px" }}>
      <div style={{ color: "var(--dim)", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
      <div className="ide-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 5 }}>{fmtSol(value)} <span style={{ color: "var(--purple-soft)", fontSize: 12 }}>SOL</span></div>
    </div>
  );
}

function groupByTurn(records: ClaimRecordApi[]) {
  const groups = new Map<number, ClaimRecordApi[]>();
  for (const record of records) {
    groups.set(record.turnId, [...(groups.get(record.turnId) ?? []), record]);
  }
  return [...groups.entries()].sort(([a], [b]) => b - a);
}

export function RewardsScreen() {
  const { connect, connected, go, walletAddress } = useIdealer();
  const { claims, error, loading, reload } = usePlayerClaims(walletAddress);

  const grouped = useMemo(
    () => groupByTurn(claims?.records ?? []),
    [claims?.records],
  );

  if (!connected) {
    return (
      <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
        <div className="ide-ambient" />
        <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 28px" }}>
          <Dealer size={60} />
          <h2 style={{ fontSize: 23, fontWeight: 800, margin: "16px 0 8px" }}>Connect your wallet</h2>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 24px" }}>Reward history is tied to your wallet address.</p>
          <button onClick={() => connect()} className="ide-btn" style={{ width: "100%", padding: 16 }} type="button"><Ico.wallet style={{ color: "#08110C" }} /> Connect wallet</button>
        </div>
      </div>
    );
  }

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", overflowX: "hidden", padding: "52px 18px 96px" }}>
        <ScreenHead onBack={() => go("profile")} title="Rewards" />

        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 14 }}>
          <div style={{ width: 42, height: 42, borderRadius: 14, background: "var(--grad)", display: "grid", placeItems: "center", color: "#0B0910", fontWeight: 800 }}>
            {walletAddress?.slice(0, 1).toUpperCase() ?? "I"}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>Claim ledger</div>
            <div className="ide-num" style={{ color: "var(--muted)", fontSize: 13 }}>{walletAddress ? truncateAddress(walletAddress) : "Wallet"}</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <RewardSummaryTile label="Available" value={lamportsToSol(claims?.availableLamports ?? 0)} />
          <RewardSummaryTile label="Claimed" value={lamportsToSol(claims?.claimedLamports ?? 0)} />
          <RewardSummaryTile label="Total" value={lamportsToSol(claims?.totalLamports ?? 0)} />
          <div className="ide-card" style={{ padding: "12px 13px" }}>
            <div style={{ color: "var(--dim)", fontSize: 11.5, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>Records</div>
            <div className="ide-num" style={{ fontSize: 20, fontWeight: 800, marginTop: 5 }}>{claims?.records.length ?? 0}</div>
          </div>
        </div>

        {loading ? (
          <div style={{ display: "grid", gap: 10 }}>
            <div className="ide-card" style={{ height: 92 }} />
            <div className="ide-card" style={{ height: 92 }} />
            <div className="ide-card" style={{ height: 92 }} />
          </div>
        ) : null}

        {!loading && error ? (
          <div className="ide-card" style={{ padding: 18, textAlign: "center" }}>
            <Ico.info style={{ color: "var(--red)", width: 22, height: 22 }} />
            <div style={{ fontWeight: 800, marginTop: 8 }}>Could not load your reward history.</div>
            <p style={{ margin: "6px 0 14px", color: "var(--muted)", fontSize: 13.5 }}>The claims endpoint returned an error.</p>
            <button className="ide-btn-ghost ide-btn" onClick={() => reload()} style={{ width: "100%", justifyContent: "center" }} type="button">Try again</button>
          </div>
        ) : null}

        {!loading && !error && grouped.length === 0 ? (
          <div className="ide-card" style={{ padding: 22, textAlign: "center" }}>
            <Ico.gift style={{ color: "var(--dim)", width: 24, height: 24 }} />
            <div style={{ fontWeight: 800, marginTop: 9 }}>No reward or claim records yet.</div>
            <p style={{ margin: "6px 0 0", color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5 }}>Wins, creator rewards, and voter rewards will appear here after settlement.</p>
          </div>
        ) : null}

        {!loading && !error && grouped.length > 0 ? (
          <div style={{ display: "grid", gap: 14 }}>
            {grouped.map(([turn, records]) => (
              <section key={turn}>
                <SectionLabel>Turn #{turn.toString().padStart(4, "0")}</SectionLabel>
                <div style={{ display: "grid", gap: 8, marginTop: 9 }}>
                  {records.map((record) => (
                    <div key={record.claimId} className="ide-card" style={{ padding: "13px 14px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ width: 32, height: 32, borderRadius: 11, display: "grid", placeItems: "center", background: "var(--surface-2)", color: record.kind === "winner_payout" ? "var(--gold)" : "var(--green)", flexShrink: 0 }}>
                          {record.kind === "winner_payout" ? <Ico.trophy style={{ color: "currentColor" }} /> : <Ico.gift style={{ color: "currentColor" }} />}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 800, fontSize: 14.5 }}>{KIND_LABELS[record.kind]}</div>
                          <div className="ide-num" style={{ color: "var(--dim)", fontSize: 12, marginTop: 2 }}>{truncateAddress(record.claimId)}</div>
                        </div>
                        <div style={{ textAlign: "right" }}>
                          <div className="ide-num" style={{ fontWeight: 800, fontSize: 15 }}>{fmtSol(lamportsToSol(record.amountLamports))} SOL</div>
                          <div style={{ color: record.status === "available" ? "var(--green)" : "var(--muted)", fontSize: 11.5, marginTop: 2 }}>{STATUS_LABELS[record.status]}</div>
                          {record.status === "available" && record.claimWindowExpiresAt ? (
                            <div style={{ color: "var(--dim)", fontSize: 10.5, marginTop: 2 }}>{expiresInLabel(record.claimWindowExpiresAt)}</div>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
