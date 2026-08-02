"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { address } from "@solana/kit";

import { useIdealer } from "../context";
import {
  expiresInLabel,
  fmtSol,
  lamportsToSol,
  truncateAddress,
} from "../data/format";
import { usePlayerClaims, useTokenomics } from "../data/hooks";
import type { ClaimKind, ClaimRecordApi, ClaimStatus } from "../data/types";
import {
  createAssociatedTokenAccountInstruction,
  createLockTokensInstruction,
  createManualTokenRewardClaimInstruction,
  createTokenomicsClaimInstruction,
  createTopUpLockInstruction,
  createUnlockTokensInstruction,
  fetchManualTokenRewards,
  fetchOnChainTokenBalance,
  fetchOnChainTokenomicsPosition,
  IDEALER_TOKEN_MINT,
  TOKENOMICS_CORE_PROGRAM_ID,
  type ManualTokenReward,
  type OnChainTokenomicsPosition,
} from "../../../solana/tokenomicsProgram";
import { Dealer, Ico, ScreenHead } from "../shared";
import { describeTxError, sendInstruction, sendInstructions } from "../data/tx";

const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_IDEALER_TOKEN_SYMBOL || "JDR";

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

export interface RewardsClaimSummary {
  availableSol: number;
  claimedSol: number;
  notificationCount: number;
  records: ClaimRecordApi[];
}

export function summarizeRewardClaims(
  records: ClaimRecordApi[],
): RewardsClaimSummary {
  const sorted = [...records].sort((left, right) => {
    const turnDelta = right.turnId - left.turnId;
    if (turnDelta !== 0) {
      return turnDelta;
    }
    return left.claimId.localeCompare(right.claimId);
  });
  return {
    availableSol: lamportsToSol(
      sorted
        .filter((record) => record.status === "available")
        .reduce((total, record) => total + record.amountLamports, 0),
    ),
    claimedSol: lamportsToSol(
      sorted
        .filter((record) => record.status === "claimed")
        .reduce((total, record) => total + record.amountLamports, 0),
    ),
    notificationCount: sorted.filter(
      (record) =>
        record.status === "available" ||
        record.status === "failed" ||
        record.status === "pending_wallet_approval",
    ).length,
    records: sorted,
  };
}

function claimTone(status: ClaimStatus) {
  if (status === "available") {
    return "var(--green)";
  }
  if (status === "failed") {
    return "var(--red)";
  }
  if (status === "pending_wallet_approval") {
    return "var(--yellow)";
  }
  if (status === "claimed") {
    return "var(--purple-soft)";
  }
  return "var(--dim)";
}

export function parseTokenAmountToAtoms(value: string): bigint {
  if (!/^\d+(?:\.\d{0,9})?$/.test(value)) {
    throw new Error(
      "Enter a positive token amount with up to 9 decimal places.",
    );
  }
  const [whole = "0", fraction = ""] = value.split(".");
  const atoms =
    BigInt(whole) * 1_000_000_000n + BigInt(fraction.padEnd(9, "0") || "0");
  if (atoms <= 0n) {
    throw new Error("Enter an amount greater than zero.");
  }
  return atoms;
}

export function formatTokenAtoms(value: string): string {
  const atoms = BigInt(value);
  const whole = atoms / 1_000_000_000n;
  const fraction = (atoms % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function formatLamportString(value: string): string {
  const lamports = BigInt(value);
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

function ClaimActivity({ record }: { record: ClaimRecordApi }) {
  const tone = claimTone(record.status);
  return (
    <article className="ide-rewards-activity-row">
      <span className="ide-rewards-activity-icon" style={{ color: tone }}>
        {record.kind === "winner_payout" ? <Ico.trophy /> : <Ico.gift />}
      </span>
      <div className="ide-rewards-activity-copy">
        <strong>{KIND_LABELS[record.kind]}</strong>
        <span>
          Turn #{record.turnId.toString().padStart(4, "0")} ·{" "}
          {STATUS_LABELS[record.status]}
        </span>
      </div>
      <div className="ide-rewards-activity-value">
        <strong className="ide-num" style={{ color: tone }}>
          {fmtSol(lamportsToSol(record.amountLamports))} SOL
        </strong>
        {record.status === "available" && record.claimWindowExpiresAt ? (
          <span>{expiresInLabel(record.claimWindowExpiresAt)}</span>
        ) : null}
      </div>
    </article>
  );
}

function NotificationSheet({
  onClose,
  onMarkRead,
  records,
}: {
  onClose: () => void;
  onMarkRead: () => void;
  records: ClaimRecordApi[];
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  useEffect(() => {
    setPortalTarget(
      backdropRef.current?.closest<HTMLElement>(".ide-root") ?? null,
    );
  }, []);

  const notable = records.filter((record) => record.status !== "claimed");
  const sheet = (
    <div
      className="ide-rewards-sheet-backdrop"
      onClick={onClose}
      ref={backdropRef}
      role="presentation"
    >
      <section
        aria-labelledby="reward-notifications-title"
        aria-modal="true"
        className="ide-rewards-sheet ide-scroll"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="ide-rewards-sheet-handle" />
        <header>
          <h2 id="reward-notifications-title">Notifications</h2>
          <button
            className="ide-rewards-text-button"
            onClick={onMarkRead}
            type="button"
          >
            Mark all read
          </button>
          <button
            aria-label="Close notifications"
            className="ide-rewards-icon-button"
            onClick={onClose}
            ref={closeRef}
            type="button"
          >
            <Ico.close />
          </button>
        </header>
        {notable.length === 0 ? (
          <div className="ide-rewards-empty">
            <Ico.bell />
            <strong>No reward notifications</strong>
            <span>New claim and settlement updates will appear here.</span>
          </div>
        ) : (
          <div className="ide-rewards-notification-list">
            {notable.map((record) => (
              <article key={record.claimId}>
                <span style={{ color: claimTone(record.status) }}>
                  {record.kind === "winner_payout" ? (
                    <Ico.trophy />
                  ) : (
                    <Ico.gift />
                  )}
                </span>
                <div>
                  <strong>
                    {KIND_LABELS[record.kind]} · {STATUS_LABELS[record.status]}
                  </strong>
                  <p>
                    {fmtSol(lamportsToSol(record.amountLamports))} SOL from turn
                    #{record.turnId.toString().padStart(4, "0")}.
                  </p>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  return portalTarget ? createPortal(sheet, portalTarget) : sheet;
}

export function RewardsScreen() {
  const { client, connect, go, wallet, walletAddress } = useIdealer();
  const { claims, error, loading, reload } = usePlayerClaims(walletAddress);
  const tokenomics = useTokenomics(walletAddress);
  const [tab, setTab] = useState<"activity" | "overview">("overview");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [notificationsRead, setNotificationsRead] = useState(false);
  const [tokenAction, setTokenAction] = useState<"lock" | "unlock" | null>(
    null,
  );
  const [tokenAmount, setTokenAmount] = useState("");
  const [tokenBusy, setTokenBusy] = useState(false);
  const [tokenMessage, setTokenMessage] = useState<string | null>(null);
  const [onChainBalance, setOnChainBalance] = useState<{
    atoms: string | null;
    error: boolean;
    exists: boolean;
    loading: boolean;
    tokenAccount: string | null;
  }>({ atoms: null, error: false, exists: false, loading: true, tokenAccount: null });
  const [onChainPosition, setOnChainPosition] = useState<{
    data: OnChainTokenomicsPosition | null;
    error: boolean;
    loading: boolean;
  }>({ data: null, error: false, loading: true });
  const [manualRewards, setManualRewards] = useState<{
    error: boolean;
    loading: boolean;
    pending: ManualTokenReward[];
  }>({ error: false, loading: true, pending: [] });
  const [balanceReload, setBalanceReload] = useState(0);
  const summary = useMemo(
    () => summarizeRewardClaims(claims?.records ?? []),
    [claims?.records],
  );
  const unreadCount = notificationsRead ? 0 : summary.notificationCount;
  const publicProjection = tokenomics.publicState?.projection ?? null;
  const walletProjection = tokenomics.walletState;
  const indexedTokenomicsReady =
    tokenomics.publicState?.available === true &&
    Boolean(publicProjection) &&
    Boolean(walletProjection) &&
    publicProjection?.programId === TOKENOMICS_CORE_PROGRAM_ID &&
    publicProjection?.mint === IDEALER_TOKEN_MINT;
  const claimableTokenomics = walletProjection?.claimRecords.find(
    (claim) => claim.status === "claimable",
  );

  useEffect(() => {
    let active = true;
    if (!walletAddress) {
      setOnChainBalance({
        atoms: null,
        error: false,
        exists: false,
        loading: false,
        tokenAccount: null,
      });
      return () => {
        active = false;
      };
    }

    setOnChainBalance((current) => ({
      ...current,
      error: false,
      loading: true,
    }));
    fetchOnChainTokenBalance({
      client,
      owner: address(walletAddress),
    })
      .then((balance) => {
        if (active) {
          setOnChainBalance({
            atoms: balance.atoms,
            error: false,
            exists: balance.exists,
            loading: false,
            tokenAccount: balance.tokenAccount.toString(),
          });
        }
      })
      .catch((cause: unknown) => {
        console.warn("Failed to load the on-chain JDR balance.", cause);
        if (active) {
          setOnChainBalance({
            atoms: null,
            error: true,
            exists: false,
            loading: false,
            tokenAccount: null,
          });
        }
      });

    return () => {
      active = false;
    };
  }, [balanceReload, client, walletAddress]);

  useEffect(() => {
    let active = true;
    if (!walletAddress) {
      setOnChainPosition({ data: null, error: false, loading: false });
      setManualRewards({ error: false, loading: false, pending: [] });
      return () => {
        active = false;
      };
    }

    const owner = address(walletAddress);
    setOnChainPosition((current) => ({ ...current, error: false, loading: true }));
    setManualRewards((current) => ({ ...current, error: false, loading: true }));
    fetchOnChainTokenomicsPosition({ client, owner })
      .then((data) => {
        if (active) setOnChainPosition({ data, error: false, loading: false });
      })
      .catch((cause: unknown) => {
        console.warn("Failed to load the on-chain JDR lock position.", cause);
        if (active) setOnChainPosition({ data: null, error: true, loading: false });
      });
    fetchManualTokenRewards({ client, owner })
      .then((pending) => {
        if (active) setManualRewards({ error: false, loading: false, pending });
      })
      .catch((cause: unknown) => {
        console.warn("Failed to load manual JDR rewards.", cause);
        if (active) setManualRewards({ error: true, loading: false, pending: [] });
      });

    return () => {
      active = false;
    };
  }, [balanceReload, client, walletAddress]);

  async function submitTokenAction() {
    if (
      !tokenAction ||
      !wallet ||
      !walletAddress ||
      !onChainPosition.data ||
      !onChainBalance.tokenAccount
    ) {
      return;
    }
    setTokenBusy(true);
    setTokenMessage(null);
    try {
      const amountAtoms = parseTokenAmountToAtoms(tokenAmount);
      const availableAtoms = BigInt(
        tokenAction === "lock"
          ? onChainBalance.atoms ?? "0"
          : onChainPosition.data.lockedAtoms,
      );
      if (amountAtoms > availableAtoms) {
        throw new Error(
          tokenAction === "lock"
            ? "The lock amount exceeds your unlocked balance."
            : "The unlock amount exceeds your locked balance.",
        );
      }
      const owner = address(walletAddress);
      const shared = {
        amountAtoms,
        escrow: onChainPosition.data.treasuryLockEscrow.toString(),
        mint: onChainPosition.data.mint.toString(),
        owner,
      };
      const instruction =
        tokenAction === "lock"
          ? !onChainPosition.data.lockExists
            ? await createLockTokensInstruction({
                ...shared,
                sourceTokenAccount: onChainBalance.tokenAccount,
              })
            : await createTopUpLockInstruction({
                ...shared,
                sourceTokenAccount: onChainBalance.tokenAccount,
              })
          : await createUnlockTokensInstruction({
              ...shared,
              returnTokenAccount:
                onChainPosition.data.returnTokenAccount?.toString() ??
                onChainBalance.tokenAccount,
            });
      const signature = await sendInstruction(client, wallet, instruction);
      setTokenMessage(
        `${tokenAction === "lock" ? "Lock" : "Unlock"} confirmed: ${truncateAddress(signature)}.`,
      );
      setTokenAction(null);
      setTokenAmount("");
      tokenomics.reload();
      setBalanceReload((value) => value + 1);
    } catch (cause) {
      setTokenMessage(describeTxError(cause));
    } finally {
      setTokenBusy(false);
    }
  }

  async function claimManualJdr() {
    if (
      !wallet ||
      !walletAddress ||
      !onChainPosition.data ||
      !onChainBalance.tokenAccount ||
      manualRewards.pending.length === 0
    ) {
      return;
    }
    setTokenBusy(true);
    setTokenMessage(null);
    try {
      const owner = address(walletAddress);
      const batch = manualRewards.pending.slice(0, 4);
      const instructions = [];
      if (!onChainBalance.exists) {
        instructions.push(
          createAssociatedTokenAccountInstruction({
            owner,
            payer: owner,
            tokenAccount: address(onChainBalance.tokenAccount),
          }),
        );
      }
      instructions.push(
        ...(await Promise.all(
          batch.map((reward) =>
            createManualTokenRewardClaimInstruction({
              campaignVault: onChainPosition.data!.initialCampaignVault,
              owner,
              reward,
              tokenAccount: address(onChainBalance.tokenAccount!),
            }),
          ),
        )),
      );
      const signature = await sendInstructions(client, wallet, instructions);
      setTokenMessage(
        `${batch.length} JDR reward${batch.length === 1 ? "" : "s"} claimed: ${truncateAddress(signature)}.`,
      );
      setBalanceReload((value) => value + 1);
    } catch (cause) {
      setTokenMessage(describeTxError(cause));
    } finally {
      setTokenBusy(false);
    }
  }

  async function claimTokenomicsSol() {
    if (
      !wallet ||
      !walletAddress ||
      !claimableTokenomics ||
      !publicProjection
    ) {
      return;
    }
    setTokenBusy(true);
    setTokenMessage(null);
    try {
      const instruction = await createTokenomicsClaimInstruction({
        amountLamports: BigInt(claimableTokenomics.amountLamports),
        beneficiary: claimableTokenomics.beneficiary,
        caller: address(walletAddress),
        correctionReserveVault: publicProjection.vaults.correctionReserve,
        distributionVault: publicProjection.vaults.distribution,
        epochId: BigInt(claimableTokenomics.epochId),
        position: claimableTokenomics.position,
        proof: claimableTokenomics.proof,
        rootVersion: claimableTokenomics.rootVersion,
        treasurySolVault: publicProjection.vaults.treasurySol,
      });
      const signature = await sendInstruction(client, wallet, instruction);
      setTokenMessage(
        `Treasury-fee claim confirmed: ${truncateAddress(signature)}.`,
      );
      tokenomics.reload();
    } catch (cause) {
      setTokenMessage(describeTxError(cause));
    } finally {
      setTokenBusy(false);
    }
  }

  if (!walletAddress) {
    return (
      <div
        className="ide-app ide-screen"
        style={{ height: "100%", position: "relative", overflow: "hidden" }}
      >
        <div className="ide-ambient" />
        <div className="ide-rewards-connect">
          <Dealer size={60} />
          <h2>Connect your wallet</h2>
          <p>
            Staking positions, epoch rewards, and claim activity are tied to
            your wallet address.
          </p>
          <button className="ide-btn" onClick={connect} type="button">
            <Ico.wallet style={{ color: "#08110C" }} /> Connect wallet
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ide-app ide-screen"
      style={{ height: "100%", position: "relative", overflow: "hidden" }}
    >
      <div className="ide-ambient" />
      <div className="ide-scroll ide-rewards-scroll">
        <ScreenHead
          onBack={() => go("profile")}
          right={
            <button
              aria-label={
                unreadCount > 0
                  ? `Notifications, ${unreadCount} unread`
                  : "Notifications"
              }
              className="ide-rewards-icon-button ide-rewards-notification-button"
              onClick={() => setNotificationsOpen(true)}
              type="button"
            >
              <Ico.bell />
              {unreadCount > 0 ? (
                <span className="ide-num">{Math.min(unreadCount, 9)}</span>
              ) : null}
            </button>
          }
          title="Stake & earn"
        />

        <section
          className="ide-rewards-hero"
          aria-labelledby="staking-balance-title"
        >
          <div className="ide-rewards-hero-glow" />
          <div className="ide-rewards-hero-content">
            <span className="ide-rewards-status" id="staking-balance-title">
              {onChainBalance.loading
                ? "Checking JDR on devnet"
                : onChainBalance.error
                  ? "JDR balance unavailable"
                  : "Live JDR wallet balance"}
            </span>
            <div className="ide-rewards-token-balance ide-num">
              {onChainBalance.atoms !== null
                ? formatTokenAtoms(onChainBalance.atoms)
                : "—"}{" "}
              <span>{TOKEN_SYMBOL} available</span>
            </div>
            <div className="ide-rewards-balance-strip">
              <div>
                <span>Locked</span>
                <strong className="ide-num">
                  {onChainPosition.data
                    ? formatTokenAtoms(onChainPosition.data.lockedAtoms)
                    : "—"}
                </strong>
              </div>
              <i aria-hidden="true" />
              <div>
                <span>Wallet</span>
                <strong className="ide-num">
                  {truncateAddress(walletAddress)}
                </strong>
              </div>
            </div>
            <div
              className="ide-rewards-actions"
              aria-describedby="staking-unavailable-note"
            >
              <button
                className="ide-btn"
                disabled={
                  !onChainPosition.data ||
                  BigInt(onChainBalance.atoms ?? "0") === 0n ||
                  tokenBusy
                }
                onClick={() => setTokenAction("lock")}
                type="button"
              >
                <Ico.lock /> Lock
              </button>
              <button
                className="ide-btn ide-btn-ghost"
                disabled={
                  !onChainPosition.data ||
                  BigInt(onChainPosition.data?.lockedAtoms ?? "0") === 0n ||
                  tokenBusy
                }
                onClick={() => setTokenAction("unlock")}
                type="button"
              >
                <Ico.unlock /> Unlock
              </button>
            </div>
            {tokenAction ? (
              <div className="ide-rewards-retry">
                <label htmlFor="token-lock-amount">
                  {tokenAction === "lock"
                    ? "Amount to lock"
                    : "Amount to unlock"}
                </label>
                <input
                  id="token-lock-amount"
                  inputMode="decimal"
                  maxLength={30}
                  onChange={(event) => setTokenAmount(event.target.value)}
                  placeholder={`0.0 ${TOKEN_SYMBOL}`}
                  value={tokenAmount}
                />
                <button
                  disabled={tokenBusy || !tokenAmount}
                  onClick={() => void submitTokenAction()}
                  type="button"
                >
                  {tokenBusy ? "Waiting for wallet…" : `Confirm ${tokenAction}`}
                </button>
                <button
                  disabled={tokenBusy}
                  onClick={() => setTokenAction(null)}
                  type="button"
                >
                  Cancel
                </button>
              </div>
            ) : null}
            <p id="staking-unavailable-note">
              {onChainBalance.error
                ? "The live JDR wallet balance could not be read from devnet."
                : onChainPosition.error
                  ? "The JDR lock configuration could not be read from devnet."
                  : onChainPosition.loading
                    ? "Checking your on-chain JDR lock position."
                    : "Claim JDR manually, then lock it to participate in future revenue epochs."}
            </p>
            {tokenMessage ? <p role="status">{tokenMessage}</p> : null}
          </div>
        </section>

        <div
          className="ide-tabs ide-rewards-tabs"
          role="tablist"
          aria-label="Reward details"
        >
          <button
            aria-selected={tab === "overview"}
            className={tab === "overview" ? "on" : ""}
            onClick={() => setTab("overview")}
            role="tab"
            type="button"
          >
            Overview
          </button>
          <button
            aria-selected={tab === "activity"}
            className={tab === "activity" ? "on" : ""}
            onClick={() => setTab("activity")}
            role="tab"
            type="button"
          >
            Activity
          </button>
        </div>

        {tab === "overview" ? (
          <div className="ide-rewards-panel-stack" role="tabpanel">
            <section className="ide-card ide-rewards-overview-card">
              <div className="ide-rewards-card-heading">
                <span className="ide-rewards-card-icon">
                  <Ico.gift />
                </span>
                <div>
                  <h2>Reward tokens</h2>
                  <p>All campaign reward routes</p>
                </div>
                <div>
                  <strong className="ide-num">
                    {manualRewards.loading
                      ? "—"
                      : formatTokenAtoms(
                          manualRewards.pending
                            .reduce(
                              (total, reward) => total + BigInt(reward.atoms),
                              0n,
                            )
                            .toString(),
                        )}
                  </strong>
                  <span>
                    {TOKEN_SYMBOL} ready to claim
                  </span>
                </div>
              </div>
              <p className="ide-rewards-inline-state">
                JDR is not credited automatically. Claim proposal and supporter
                rewards with an explicit wallet approval.
              </p>
              <button
                className="ide-btn"
                disabled={
                  manualRewards.loading ||
                  manualRewards.error ||
                  manualRewards.pending.length === 0 ||
                  tokenBusy ||
                  !onChainPosition.data
                }
                onClick={() => void claimManualJdr()}
                type="button"
              >
                <Ico.withdraw /> {tokenBusy ? "Waiting for wallet…" : "Claim JDR"}
              </button>
              {manualRewards.error ? (
                <p className="ide-rewards-inline-state">
                  Pending JDR rewards could not be read from devnet.
                </p>
              ) : !manualRewards.loading && manualRewards.pending.length === 0 ? (
                <p className="ide-rewards-inline-state">
                  No unclaimed proposal or supporter rewards were found.
                </p>
              ) : manualRewards.pending.length > 4 ? (
                <p className="ide-rewards-inline-state">
                  Up to four rewards are claimed per transaction. Claim again
                  for the remaining rewards.
                </p>
              ) : null}
            </section>

            <section className="ide-card ide-rewards-overview-card">
              <div className="ide-rewards-epoch-heading">
                <span>Revenue epoch</span>
                <strong className="ide-num">
                  #{publicProjection?.currentEpoch?.epochId ?? "—"}
                </strong>
              </div>
              <div className="ide-rewards-epoch-metrics">
                <div>
                  <span>Your weight</span>
                  <strong className="ide-num">
                    {walletProjection?.currentEpochWeight ?? "—"}
                  </strong>
                </div>
                <div>
                  <span>Pool this epoch</span>
                  <strong className="ide-num">
                    {publicProjection?.currentEpoch
                      ? formatLamportString(
                          publicProjection.currentEpoch
                            .grossDistributableLamports,
                        )
                      : "—"}{" "}
                    <small>SOL</small>
                  </strong>
                </div>
                <div>
                  <span>Claimable</span>
                  <strong className="ide-num">
                    {walletProjection
                      ? formatLamportString(walletProjection.claimableLamports)
                      : "—"}{" "}
                    <small>SOL</small>
                  </strong>
                </div>
              </div>
              <div className="ide-rewards-epoch-state">
                <Ico.info />
                <span>
                  {publicProjection?.currentEpoch
                    ? `Epoch is ${publicProjection.currentEpoch.status.replaceAll("_", " ")}. Claims activate only after sealing.`
                    : "Epoch accounting is not indexed."}
                </span>
              </div>
              <button
                className="ide-btn"
                disabled={
                  !claimableTokenomics || tokenBusy || !indexedTokenomicsReady
                }
                onClick={() => void claimTokenomicsSol()}
                type="button"
              >
                <Ico.withdraw /> Claim sealed SOL
              </button>
            </section>

            <section className="ide-card ide-rewards-overview-card">
              <div className="ide-rewards-claim-summary">
                <div>
                  <span>Available game claims</span>
                  <strong className="ide-num">
                    {loading
                      ? "Loading…"
                      : error
                        ? "Unavailable"
                        : `${fmtSol(summary.availableSol)} SOL`}
                  </strong>
                </div>
                <button
                  className="ide-btn"
                  disabled={
                    Boolean(error) || loading || summary.availableSol <= 0
                  }
                  onClick={() => go("claims")}
                  type="button"
                >
                  <Ico.withdraw /> View claims
                </button>
              </div>
              {!loading && !error ? (
                <p className="ide-rewards-claimed-total ide-num">
                  {fmtSol(summary.claimedSol)} SOL claimed from game rewards
                </p>
              ) : null}
              {error ? (
                <div className="ide-rewards-retry">
                  <span>The game claim ledger could not be loaded.</span>
                  <button onClick={() => reload()} type="button">
                    Try again
                  </button>
                </div>
              ) : null}
            </section>

            <div className="ide-rewards-disclosure">
              <Ico.info />
              <p>
                Unlocking stops future accrual for the unlocked amount—it is not
                burned. Estimated share is indicative, never guaranteed yield.
              </p>
            </div>
          </div>
        ) : (
          <div className="ide-rewards-activity" role="tabpanel">
            {loading ? (
              <div
                className="ide-rewards-loading"
                aria-label="Loading reward activity"
              >
                <span />
                <span />
                <span />
              </div>
            ) : null}
            {!loading && error ? (
              <div className="ide-rewards-empty is-error">
                <Ico.info />
                <strong>Could not load reward activity</strong>
                <span>The game claim ledger returned an error.</span>
                <button
                  className="ide-btn ide-btn-ghost"
                  onClick={() => reload()}
                  type="button"
                >
                  Try again
                </button>
              </div>
            ) : null}
            {!loading && !error && summary.records.length === 0 ? (
              <div className="ide-rewards-empty">
                <Ico.gift />
                <strong>No reward activity yet</strong>
                <span>Game claims will appear here after settlement.</span>
              </div>
            ) : null}
            {!loading && !error
              ? summary.records.map((record) => (
                  <ClaimActivity key={record.claimId} record={record} />
                ))
              : null}
          </div>
        )}
      </div>

      {notificationsOpen ? (
        <NotificationSheet
          onClose={() => setNotificationsOpen(false)}
          onMarkRead={() => setNotificationsRead(true)}
          records={summary.records}
        />
      ) : null}
    </div>
  );
}
