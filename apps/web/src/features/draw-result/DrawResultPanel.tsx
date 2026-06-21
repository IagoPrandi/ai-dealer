"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { address } from "@solana/kit";
import {
  useSolanaClient,
  useWaitForSignature,
  useWalletConnection,
} from "@solana/react-hooks";
import {
  type ClaimKindLabel,
  createClaimInstruction,
} from "../../solana/idealerProgram";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_API_URL ?? "http://localhost:3002";

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
  statusReason: string;
  turnId: number;
  wallet: string;
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

type ClaimPhase =
  | "awaiting_approval"
  | "confirmed"
  | "failed"
  | "idle"
  | "pending";

interface ActiveClaim {
  claimId: string;
  kind: ClaimKindLabel;
  message: string;
  phase: ClaimPhase;
  signature?: string;
  turnId: number;
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

function normalizeClaimError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/reject|denied|cancell?ed/i.test(message)) {
    return { code: "WALLET_REJECTED", message: "The wallet rejected the claim." };
  }
  return { code: "CLAIM_FAILED", message };
}

export function DrawResultPanel() {
  const client = useSolanaClient();
  const { connected, wallet } = useWalletConnection();
  const walletAddress = wallet?.account.address.toString();

  const [summary, setSummary] = useState<PlayerClaimsSummary | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [active, setActive] = useState<ActiveClaim | null>(null);

  const signatureStatus = useWaitForSignature(active?.signature, {
    commitment: "confirmed",
    disabled: !active?.signature,
    subscribe: true,
  });

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
          error instanceof Error ? error.message : "Could not load your claims.",
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

  // Finalize the claim once the wallet signature confirms (or fails) on devnet.
  useEffect(() => {
    if (!active?.signature || active.phase !== "pending" || !walletAddress) {
      return;
    }
    const { claimId, signature } = active;

    if (signatureStatus.isSuccess) {
      void fetch(`${API_BASE_URL}/claim-records/complete`, {
        body: JSON.stringify({
          claimId,
          signature,
          status: "claimed",
          wallet: walletAddress,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
        .then(() => loadClaims())
        .finally(() => {
          setActive({
            ...active,
            message: "Claim confirmed on devnet. The payout was transferred.",
            phase: "confirmed",
          });
        });
    } else if (signatureStatus.isError) {
      const normalized = normalizeClaimError(signatureStatus.waitError);
      void fetch(`${API_BASE_URL}/claim-records/complete`, {
        body: JSON.stringify({
          claimId,
          failureReason: normalized.code,
          status: "failed",
          wallet: walletAddress,
        }),
        headers: { "content-type": "application/json" },
        method: "POST",
      })
        .then(() => loadClaims())
        .finally(() => {
          setActive({ ...active, message: normalized.message, phase: "failed" });
        });
    }
  }, [
    active,
    loadClaims,
    signatureStatus.isError,
    signatureStatus.isSuccess,
    signatureStatus.waitError,
    walletAddress,
  ]);

  async function claim(record: PlayerClaimRecord) {
    if (!connected || !wallet || !walletAddress) {
      setActive({
        claimId: record.claimId,
        kind: record.kind,
        message: "Connect your devnet wallet before claiming.",
        phase: "failed",
        turnId: record.turnId,
      });
      return;
    }

    setActive({
      claimId: record.claimId,
      kind: record.kind,
      message: "Approve the claim transaction in your wallet.",
      phase: "awaiting_approval",
      turnId: record.turnId,
    });

    try {
      const player = address(walletAddress);
      // Move the API record into pending so it cannot be double-claimed.
      const requestResponse = await fetch(
        `${API_BASE_URL}/claim-records/request`,
        {
          body: JSON.stringify({ claimId: record.claimId, wallet: walletAddress }),
          headers: { "content-type": "application/json" },
          method: "POST",
        },
      );
      if (!requestResponse.ok) {
        const body = (await requestResponse.json()) as { error?: string };
        throw new Error(body.error ?? `Claim request failed (${requestResponse.status}).`);
      }

      const instruction = await createClaimInstruction({
        kind: record.kind,
        player,
        turnId: record.turnId,
      });
      const signature = (
        await client.transaction.prepareAndSend(
          {
            authority: wallet,
            commitment: "confirmed",
            feePayer: player,
            instructions: [instruction],
            version: 0,
          },
          { commitment: "confirmed", maxRetries: 3, skipPreflight: false },
        )
      ).toString();

      setActive({
        claimId: record.claimId,
        kind: record.kind,
        message: "Wallet approval returned. Waiting for devnet confirmation.",
        phase: "pending",
        signature,
        turnId: record.turnId,
      });
    } catch (error) {
      const normalized = normalizeClaimError(error);
      setActive({
        claimId: record.claimId,
        kind: record.kind,
        message: normalized.message,
        phase: "failed",
        turnId: record.turnId,
      });
      void loadClaims();
    }
  }

  const records = summary?.records ?? [];
  const isBusy = active?.phase === "awaiting_approval" || active?.phase === "pending";

  return (
    <main className="result-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play">
          Live round
        </Link>
        <div>
          <p className="eyebrow">Rewards</p>
          <strong>Claim your payouts</strong>
        </div>
      </header>

      <div className="result-content">
        {!connected || !walletAddress ? (
          <section className="creator-outcome" aria-labelledby="connect-title">
            <div className="section-heading">
              <p className="eyebrow">Wallet</p>
              <span>Devnet</span>
            </div>
            <h2 id="connect-title">Connect your wallet to see claims</h2>
            <p>
              Winner payouts and creator/voter rewards are claimed from your
              connected devnet wallet.
            </p>
            <div className="result-actions">
              <Link className="primary-action" href="/play/wallet">
                Connect wallet
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="result-hero" aria-labelledby="summary-title">
              <p className="eyebrow">Claimable balance</p>
              <h1 id="summary-title">
                {formatSol(summary?.availableLamports ?? 0)}
              </h1>
              <p>Pull your winner payouts and rewards to your wallet.</p>
              <div className="result-pool-row">
                <div>
                  <span>Pending</span>
                  <strong>{formatSol(summary?.pendingLamports ?? 0)}</strong>
                </div>
                <div>
                  <span>Claimed</span>
                  <strong>{formatSol(summary?.claimedLamports ?? 0)}</strong>
                </div>
              </div>
            </section>

            {loadError ? (
              <section className="creator-outcome" aria-live="polite">
                <p className="eyebrow">Could not load claims</p>
                <p>{loadError}</p>
              </section>
            ) : null}

            {active ? (
              <section
                className="creator-outcome"
                aria-live="polite"
                aria-labelledby="claim-feedback-title"
              >
                <div className="section-heading">
                  <p className="eyebrow">Claim status</p>
                  <span>{KIND_LABEL[active.kind]}</span>
                </div>
                <h2 id="claim-feedback-title">
                  {active.phase === "confirmed"
                    ? "Claim successful"
                    : active.phase === "failed"
                      ? "Claim failed"
                      : "Claim in progress"}
                </h2>
                <p>{active.message}</p>
              </section>
            ) : null}

            <section className="result-explanations" aria-labelledby="claims-title">
              <div className="section-heading">
                <p className="eyebrow">Your claims</p>
                <span>{records.length} record(s)</span>
              </div>
              <h2 id="claims-title">Payouts and rewards</h2>
              {records.length === 0 ? (
                <p>
                  No claims yet. Play a turn and win under the original or active
                  rule to receive a payout.
                </p>
              ) : (
                <ul className="claim-list">
                  {records.map((record) => {
                    const claimable =
                      record.status === "available" || record.status === "failed";
                    return (
                      <li className="claim-item" key={record.claimId}>
                        <div className="claim-item-main">
                          <strong>{KIND_LABEL[record.kind]}</strong>
                          <span className="claim-item-meta">
                            Turn {record.turnId} ·{" "}
                            <Link href={`/round/${record.turnId}`}>details</Link>
                          </span>
                        </div>
                        <div className="claim-item-amount">
                          <strong>{formatSol(record.amountLamports)}</strong>
                          <span className={`claim-badge claim-badge-${record.status}`}>
                            {STATUS_LABEL[record.status]}
                          </span>
                        </div>
                        {claimable ? (
                          <button
                            className="primary-action"
                            disabled={isBusy}
                            onClick={() => void claim(record)}
                            type="button"
                          >
                            {record.status === "failed" ? "Retry claim" : "Claim"}
                          </button>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}

        <section className="result-return" aria-labelledby="return-title">
          <p className="eyebrow">Next round</p>
          <h2 id="return-title">Play the next turn.</h2>
          <p>The active rule changes each turn, creating new ways to win.</p>
          <div className="result-actions">
            <Link className="primary-action" href="/play/pick">
              Join next round
            </Link>
            <Link className="secondary-action" href="/play/rewards">
              Reward history
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
