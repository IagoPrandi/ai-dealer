"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useWalletConnection } from "@solana/react-hooks";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_API_URL ?? "http://localhost:3002";

type ClaimKindLabel = "creator_reward" | "voter_reward" | "winner_payout";
type ClaimRecordStatus =
  | "available"
  | "claimed"
  | "failed"
  | "pending_wallet_approval"
  | "unavailable";

interface PlayerClaimRecord {
  amountLamports: number;
  claimId: string;
  kind: ClaimKindLabel;
  status: ClaimRecordStatus;
  turnId: number;
}

interface PlayerClaimsSummary {
  availableLamports: number;
  claimedLamports: number;
  failedLamports: number;
  pendingLamports: number;
  records: PlayerClaimRecord[];
  totalLamports: number;
  unavailableLamports: number;
  wallet: string;
}

const KIND_LABEL: Readonly<Record<ClaimKindLabel, string>> = {
  creator_reward: "Creator reward",
  voter_reward: "Voter reward",
  winner_payout: "Winner payout",
};

const STATUS_LABEL: Readonly<Record<ClaimRecordStatus, string>> = {
  available: "Claimable",
  claimed: "Claimed",
  failed: "Failed",
  pending_wallet_approval: "Approving",
  unavailable: "Below minimum",
};

function formatSol(lamports: number) {
  return `${(lamports / 1_000_000_000).toFixed(4)} SOL`;
}

function groupByTurn(records: readonly PlayerClaimRecord[]) {
  const byTurn = new Map<number, PlayerClaimRecord[]>();
  for (const record of records) {
    const existing = byTurn.get(record.turnId) ?? [];
    existing.push(record);
    byTurn.set(record.turnId, existing);
  }
  return [...byTurn.entries()].sort((left, right) => right[0] - left[0]);
}

export function PlayerRewardsHistory() {
  const { connected, wallet } = useWalletConnection();
  const walletAddress = wallet?.account.address.toString();
  const [summary, setSummary] = useState<PlayerClaimsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadClaims = useCallback(
    async (signal?: AbortSignal) => {
      if (!walletAddress) {
        return;
      }
      try {
        const response = await fetch(
          `${API_BASE_URL}/players/${walletAddress}/claims`,
          signal ? { signal } : {},
        );
        if (!response.ok) {
          throw new Error(`Claims API returned HTTP ${response.status}.`);
        }
        const body = (await response.json()) as { claims: PlayerClaimsSummary };
        setSummary(body.claims);
        setLoadError(null);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setLoadError(
          error instanceof Error
            ? error.message
            : "Could not load your reward history.",
        );
      }
    },
    [walletAddress],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadClaims(controller.signal);
    return () => controller.abort();
  }, [loadClaims]);

  const grouped = groupByTurn(summary?.records ?? []);

  return (
    <main className="result-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play/results">
          Claims
        </Link>
        <div>
          <p className="eyebrow">Rewards</p>
          <strong>Reward history</strong>
        </div>
      </header>

      <div className="result-content">
        {!connected || !walletAddress ? (
          <section className="creator-outcome" aria-labelledby="connect-title">
            <div className="section-heading">
              <p className="eyebrow">Wallet</p>
              <span>Devnet</span>
            </div>
            <h2 id="connect-title">Connect your wallet</h2>
            <p>Your reward history is tied to your connected devnet wallet.</p>
            <div className="result-actions">
              <Link className="primary-action" href="/play/wallet">
                Connect wallet
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="result-hero" aria-labelledby="history-summary">
              <p className="eyebrow">Total rewards</p>
              <h1 id="history-summary">
                {formatSol(summary?.totalLamports ?? 0)}
              </h1>
              <div className="result-pool-row">
                <div>
                  <span>Claimed</span>
                  <strong>{formatSol(summary?.claimedLamports ?? 0)}</strong>
                </div>
                <div>
                  <span>Claimable</span>
                  <strong>{formatSol(summary?.availableLamports ?? 0)}</strong>
                </div>
              </div>
            </section>

            {loadError ? (
              <section className="creator-outcome" aria-live="polite">
                <p className="eyebrow">Could not load history</p>
                <p>{loadError}</p>
              </section>
            ) : null}

            {grouped.length === 0 ? (
              <section className="result-explanations">
                <h2>No rewards yet</h2>
                <p>
                  Once you win a turn or back the elected rule, your payouts and
                  rewards appear here.
                </p>
              </section>
            ) : (
              grouped.map(([turnId, records]) => (
                <section
                  className="result-explanations"
                  aria-labelledby={`turn-${turnId}-title`}
                  key={turnId}
                >
                  <div className="section-heading">
                    <p className="eyebrow">Turn {turnId}</p>
                    <Link href={`/round/${turnId}`}>Round details</Link>
                  </div>
                  <h2 id={`turn-${turnId}-title`}>Turn {turnId} rewards</h2>
                  <ul className="claim-list">
                    {records.map((record) => (
                      <li className="claim-item" key={record.claimId}>
                        <div className="claim-item-main">
                          <strong>{KIND_LABEL[record.kind]}</strong>
                        </div>
                        <div className="claim-item-amount">
                          <strong>{formatSol(record.amountLamports)}</strong>
                          <span
                            className={`claim-badge claim-badge-${record.status}`}
                          >
                            {STATUS_LABEL[record.status]}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </section>
              ))
            )}

            <section className="result-return" aria-labelledby="history-return">
              <p className="eyebrow">Claims</p>
              <h2 id="history-return">Claim your available rewards</h2>
              <div className="result-actions">
                <Link className="primary-action" href="/play/results">
                  Go to claims
                </Link>
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
