"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { address } from "@solana/kit";
import { MINIMUM_CLAIM_THRESHOLD_SOL } from "@tyche/constants";

import { useTyche } from "../context";
import {
  expiresInLabel,
  fmtSol,
  formatTokenAtoms,
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
  type ManualTokenReward,
  type OnChainTokenBalance,
  type OnChainTokenomicsPosition,
} from "../../../solana/tokenomicsProgram";
import { Dealer, Ico, ScreenHead } from "../shared";
import { describeTxError, sendInstruction, sendInstructions } from "../data/tx";

const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TYCHE_TOKEN_SYMBOL || "JDR";
const PULL_REFRESH_THRESHOLD_PX = 56;
const MINIMUM_CLAIM_THRESHOLD_LAMPORTS = BigInt(
  Math.round(MINIMUM_CLAIM_THRESHOLD_SOL * 1_000_000_000),
);

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

export function formatLamportString(value: string): string {
  const lamports = BigInt(value);
  const whole = lamports / 1_000_000_000n;
  const fraction = (lamports % 1_000_000_000n)
    .toString()
    .padStart(9, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
}

export function getTreasuryClaimMinimumMessage(
  claimableLamports: string | null,
): string | null {
  if (
    claimableLamports === null ||
    BigInt(claimableLamports) >= MINIMUM_CLAIM_THRESHOLD_LAMPORTS
  ) {
    return null;
  }
  return `At least ${formatLamportString(MINIMUM_CLAIM_THRESHOLD_LAMPORTS.toString())} SOL must be claimable before a treasury-fee claim can be submitted.`;
}

export interface JdrStateSnapshot {
  balance: OnChainTokenBalance;
  position: OnChainTokenomicsPosition;
}

export async function waitForExpectedJdrState({
  expectedBalanceAtoms,
  expectedLockedAtoms,
  read,
  retryDelayMs = 400,
  wait = (delayMs: number) =>
    new Promise<void>((resolve) => globalThis.setTimeout(resolve, delayMs)),
  attempts = 8,
}: {
  expectedBalanceAtoms: string;
  expectedLockedAtoms: string;
  read: () => Promise<JdrStateSnapshot>;
  retryDelayMs?: number;
  wait?: (delayMs: number) => Promise<void>;
  attempts?: number;
}): Promise<JdrStateSnapshot> {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const snapshot = await read();
    if (
      snapshot.balance.atoms === expectedBalanceAtoms &&
      snapshot.position.lockedAtoms === expectedLockedAtoms
    ) {
      return snapshot;
    }
    if (attempt < attempts - 1) {
      await wait(retryDelayMs);
    }
  }
  throw new Error("The confirmed JDR state is not visible through RPC yet.");
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
  const { client, connect, go, wallet, walletAddress } = useTyche();
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
  const [claimMessage, setClaimMessage] = useState<string | null>(null);
  const [epochMessage, setEpochMessage] = useState<string | null>(null);
  const [treasuryClaimMessage, setTreasuryClaimMessage] = useState<
    string | null
  >(null);
  const [pullDistance, setPullDistance] = useState(0);
  const [manualRefreshing, setManualRefreshing] = useState(false);
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
  const balanceRequestRef = useRef(0);
  const positionRequestRef = useRef(0);
  const pullDistanceRef = useRef(0);
  const pullStartYRef = useRef<number | null>(null);
  const summary = useMemo(
    () => summarizeRewardClaims(claims?.records ?? []),
    [claims?.records],
  );
  const manualClaimableAtoms = useMemo(
    () =>
      manualRewards.pending.reduce(
        (total, reward) => total + BigInt(reward.atoms),
        0n,
      ),
    [manualRewards.pending],
  );
  const unreadCount = notificationsRead ? 0 : summary.notificationCount;
  const publicProjection = tokenomics.publicState?.projection ?? null;
  const walletProjection = tokenomics.walletState;
  const accruedTreasuryFeesLamports =
    tokenomics.publicState?.accruedTreasuryFeesLamports ?? null;
  const revenuePoolLamports =
    publicProjection?.currentEpoch?.grossDistributableLamports ??
    accruedTreasuryFeesLamports;
  const sealedClaimableLamports =
    walletProjection?.claimableLamports ??
    (!tokenomics.loading && !tokenomics.error ? "0" : null);
  const claimableTokenomics = walletProjection?.claimRecords.find(
    (claim) => claim.status === "claimable",
  );

  useEffect(() => {
    let active = true;
    const requestId = ++balanceRequestRef.current;
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
        if (active && requestId === balanceRequestRef.current) {
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
        if (active && requestId === balanceRequestRef.current) {
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
    const requestId = ++positionRequestRef.current;
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
        if (active && requestId === positionRequestRef.current) {
          setOnChainPosition({ data, error: false, loading: false });
        }
      })
      .catch((cause: unknown) => {
        console.warn("Failed to load the on-chain JDR lock position.", cause);
        if (active && requestId === positionRequestRef.current) {
          setOnChainPosition({ data: null, error: true, loading: false });
        }
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

  useEffect(() => {
    if (
      !manualRefreshing ||
      loading ||
      tokenomics.loading ||
      onChainBalance.loading ||
      onChainPosition.loading ||
      manualRewards.loading
    ) {
      return;
    }
    const id = window.setTimeout(() => {
      pullDistanceRef.current = 0;
      setPullDistance(0);
      setManualRefreshing(false);
    }, 180);
    return () => window.clearTimeout(id);
  }, [
    loading,
    manualRefreshing,
    manualRewards.loading,
    onChainBalance.loading,
    onChainPosition.loading,
    tokenomics.loading,
  ]);

  function refreshRewards() {
    if (manualRefreshing || tokenBusy) {
      return;
    }
    pullDistanceRef.current = 44;
    setPullDistance(44);
    setManualRefreshing(true);
    setTreasuryClaimMessage(null);
    setOnChainBalance((current) => ({ ...current, loading: true }));
    setOnChainPosition((current) => ({ ...current, loading: true }));
    setManualRewards((current) => ({ ...current, loading: true }));
    reload();
    tokenomics.reload();
    setBalanceReload((value) => value + 1);
  }

  function resetPullGesture() {
    pullStartYRef.current = null;
    if (!manualRefreshing) {
      pullDistanceRef.current = 0;
      setPullDistance(0);
    }
  }

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
    setEpochMessage(null);
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
      const action = tokenAction;
      const owner = address(walletAddress);
      const currentBalanceAtoms = BigInt(onChainBalance.atoms ?? "0");
      const currentLockedAtoms = BigInt(onChainPosition.data.lockedAtoms);
      const expectedBalanceAtoms =
        action === "lock"
          ? currentBalanceAtoms - amountAtoms
          : currentBalanceAtoms + amountAtoms;
      const expectedLockedAtoms =
        action === "lock"
          ? currentLockedAtoms + amountAtoms
          : currentLockedAtoms - amountAtoms;
      const shared = {
        amountAtoms,
        escrow: onChainPosition.data.treasuryLockEscrow.toString(),
        mint: onChainPosition.data.mint.toString(),
        owner,
      };
      const instruction =
        action === "lock"
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
      balanceRequestRef.current += 1;
      positionRequestRef.current += 1;
      setOnChainBalance((current) => ({
        ...current,
        atoms: expectedBalanceAtoms.toString(),
        error: false,
        loading: true,
      }));
      setOnChainPosition({
        data: {
          ...onChainPosition.data,
          lockExists: true,
          lockedAtoms: expectedLockedAtoms.toString(),
          returnTokenAccount:
            onChainPosition.data.returnTokenAccount ??
            address(onChainBalance.tokenAccount),
        },
        error: false,
        loading: true,
      });
      setEpochMessage(
        `${action === "lock" ? "Lock" : "Unlock"} confirmed: ${truncateAddress(signature)}. Syncing live balances…`,
      );
      setTokenAction(null);
      setTokenAmount("");
      tokenomics.reload();
      try {
        const snapshot = await waitForExpectedJdrState({
          expectedBalanceAtoms: expectedBalanceAtoms.toString(),
          expectedLockedAtoms: expectedLockedAtoms.toString(),
          read: async () => {
            const [balance, position] = await Promise.all([
              fetchOnChainTokenBalance({ client, owner }),
              fetchOnChainTokenomicsPosition({ client, owner }),
            ]);
            return { balance, position };
          },
        });
        setOnChainBalance({
          atoms: snapshot.balance.atoms,
          error: false,
          exists: snapshot.balance.exists,
          loading: false,
          tokenAccount: snapshot.balance.tokenAccount.toString(),
        });
        setOnChainPosition({
          data: snapshot.position,
          error: false,
          loading: false,
        });
        setEpochMessage(
          `${action === "lock" ? "Lock" : "Unlock"} confirmed: ${truncateAddress(signature)}.`,
        );
      } catch (syncCause) {
        console.warn("Confirmed JDR state is still syncing.", syncCause);
        setOnChainBalance((current) => ({ ...current, loading: false }));
        setOnChainPosition((current) => ({ ...current, loading: false }));
        setEpochMessage(
          `${action === "lock" ? "Lock" : "Unlock"} confirmed: ${truncateAddress(signature)}. Pull down to refresh live balances.`,
        );
      }
    } catch (cause) {
      setEpochMessage(describeTxError(cause));
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
    setClaimMessage(null);
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
      setClaimMessage(
        `${batch.length} JDR reward${batch.length === 1 ? "" : "s"} claimed: ${truncateAddress(signature)}.`,
      );
      setBalanceReload((value) => value + 1);
    } catch (cause) {
      setClaimMessage(describeTxError(cause));
    } finally {
      setTokenBusy(false);
    }
  }

  async function claimTokenomicsSol() {
    setTreasuryClaimMessage(null);
    const minimumMessage = getTreasuryClaimMinimumMessage(
      sealedClaimableLamports,
    );
    if (minimumMessage) {
      setTreasuryClaimMessage(minimumMessage);
      return;
    }
    if (
      !wallet ||
      !walletAddress ||
      !claimableTokenomics ||
      !publicProjection
    ) {
      setTreasuryClaimMessage(
        "A sealed treasury-fee claim is not ready for this wallet yet.",
      );
      return;
    }
    setTokenBusy(true);
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
      setTreasuryClaimMessage(
        `Treasury-fee claim confirmed: ${truncateAddress(signature)}.`,
      );
      tokenomics.reload();
    } catch (cause) {
      setTreasuryClaimMessage(describeTxError(cause));
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
      <div
        className="ide-scroll ide-rewards-scroll"
        onTouchCancel={resetPullGesture}
        onTouchEnd={() => {
          const shouldRefresh =
            pullDistanceRef.current >= PULL_REFRESH_THRESHOLD_PX;
          pullStartYRef.current = null;
          if (shouldRefresh) {
            refreshRewards();
          } else {
            resetPullGesture();
          }
        }}
        onTouchMove={(event) => {
          if (pullStartYRef.current === null || manualRefreshing) {
            return;
          }
          const delta = event.touches[0]!.clientY - pullStartYRef.current;
          const nextDistance = Math.min(76, Math.max(0, delta * 0.5));
          pullDistanceRef.current = nextDistance;
          setPullDistance(nextDistance);
        }}
        onTouchStart={(event) => {
          if (
            event.currentTarget.scrollTop <= 0 &&
            event.touches.length === 1 &&
            !manualRefreshing
          ) {
            pullStartYRef.current = event.touches[0]!.clientY;
          }
        }}
      >
        <div
          aria-hidden={!manualRefreshing && pullDistance === 0}
          aria-live="polite"
          className={`ide-rewards-pull-refresh${manualRefreshing ? " is-refreshing" : ""}`}
          style={{ height: manualRefreshing ? 44 : pullDistance }}
        >
          <Ico.down className={manualRefreshing ? "ide-spin" : undefined} />
          <span>
            {manualRefreshing
              ? "Refreshing…"
              : pullDistance >= PULL_REFRESH_THRESHOLD_PX
                ? "Release to refresh"
                : "Pull to refresh"}
          </span>
        </div>
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
              Live JDR rewards on devnet
            </span>
            <div className="ide-rewards-balance-strip">
              <div>
                <span>{TOKEN_SYMBOL} available</span>
                <strong className="ide-num">
                  {onChainBalance.loading
                    ? "Loading…"
                    : onChainBalance.error
                      ? "Unavailable"
                      : `${formatTokenAtoms(onChainBalance.atoms ?? "0")} ${TOKEN_SYMBOL}`}
                </strong>
              </div>
              <i aria-hidden="true" />
              <div>
                <span>{TOKEN_SYMBOL} claimable</span>
                <strong className="ide-num">
                  {manualRewards.loading
                    ? "Loading…"
                    : manualRewards.error
                      ? "Unavailable"
                      : `${formatTokenAtoms(manualClaimableAtoms.toString())} ${TOKEN_SYMBOL}`}
                </strong>
              </div>
            </div>
            <div
              className="ide-rewards-actions is-single"
              aria-describedby="jdr-claim-note"
            >
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
                <Ico.withdraw />
                {tokenBusy ? "Waiting for wallet…" : "Claim JDR"}
              </button>
            </div>
            <p id="jdr-claim-note">
              {onChainBalance.error
                ? "The live JDR wallet balance could not be read from devnet."
                : manualRewards.error
                  ? "Pending JDR rewards could not be read from devnet."
                  : manualRewards.loading
                    ? "Checking your pending proposal and supporter rewards."
                    : manualRewards.pending.length === 0
                      ? "No unclaimed proposal or supporter rewards were found."
                      : manualRewards.pending.length > 4
                        ? "Up to four rewards are claimed per transaction. Claim again for the remaining rewards."
                        : "Claim proposal and supporter rewards with an explicit wallet approval."}
            </p>
            {claimMessage ? <p role="status">{claimMessage}</p> : null}
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
              <div className="ide-rewards-epoch-heading">
                <span>Treasury revenue</span>
                <strong className="ide-num">
                  {publicProjection?.currentEpoch
                    ? `#${publicProjection.currentEpoch.epochId}`
                    : "Accrued"}
                </strong>
              </div>
              <div className="ide-rewards-epoch-metrics">
                <div>
                  <span>Locked {TOKEN_SYMBOL}</span>
                  <strong className="ide-num">
                    {onChainPosition.loading
                      ? "Loading…"
                      : onChainPosition.error
                        ? "Unavailable"
                        : formatTokenAtoms(
                            onChainPosition.data?.lockedAtoms ?? "0",
                          )}
                  </strong>
                </div>
                <div>
                  <span>Treasury pool</span>
                  <strong className="ide-num">
                    {tokenomics.loading
                      ? "Loading…"
                      : tokenomics.error || revenuePoolLamports === null
                        ? "Unavailable"
                        : formatLamportString(revenuePoolLamports)}{" "}
                    <small>SOL</small>
                  </strong>
                </div>
                <div>
                  <span>Claimable now</span>
                  <strong className="ide-num">
                    {tokenomics.loading
                      ? "Loading…"
                      : tokenomics.error || sealedClaimableLamports === null
                        ? "Unavailable"
                        : formatLamportString(sealedClaimableLamports)}{" "}
                    <small>SOL</small>
                  </strong>
                </div>
              </div>
              <button
                className="ide-btn ide-rewards-treasury-claim-button"
                disabled={tokenBusy || tokenomics.loading || Boolean(tokenomics.error)}
                onClick={() => void claimTokenomicsSol()}
                type="button"
              >
                <Ico.withdraw /> Claim sealed SOL
              </button>
              {treasuryClaimMessage ? (
                <p
                  className="ide-rewards-treasury-claim-message"
                  role="status"
                >
                  {treasuryClaimMessage}
                </p>
              ) : null}

              <div className="ide-rewards-lock-panel">
                <div
                  className="ide-rewards-actions"
                  aria-describedby="staking-lock-note"
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
                  <form
                    className="ide-rewards-token-form"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void submitTokenAction();
                    }}
                  >
                    <div className="ide-rewards-token-field">
                      <div className="ide-rewards-token-field-heading">
                        <label htmlFor="token-lock-amount">
                          {tokenAction === "lock"
                            ? "Amount to lock"
                            : "Amount to unlock"}
                        </label>
                        {tokenAction === "lock" ? (
                          <button
                            aria-label="Use 100% of available JDR"
                            className="ide-btn ide-btn-ghost ide-rewards-token-max"
                            disabled={
                              tokenBusy ||
                              BigInt(onChainBalance.atoms ?? "0") === 0n
                            }
                            onClick={() =>
                              setTokenAmount(
                                formatTokenAtoms(onChainBalance.atoms ?? "0"),
                              )
                            }
                            type="button"
                          >
                            100%
                          </button>
                        ) : null}
                      </div>
                      <div className="ide-rewards-token-input">
                        <input
                          className="ide-num"
                          id="token-lock-amount"
                          inputMode="decimal"
                          maxLength={30}
                          onChange={(event) =>
                            setTokenAmount(event.target.value)
                          }
                          placeholder="0.0"
                          value={tokenAmount}
                        />
                        <span>{TOKEN_SYMBOL}</span>
                      </div>
                    </div>
                    <div className="ide-rewards-token-form-actions">
                      <button
                        className="ide-btn"
                        disabled={tokenBusy || !tokenAmount}
                        type="submit"
                      >
                        {tokenBusy
                          ? "Waiting for wallet…"
                          : `Confirm ${tokenAction}`}
                      </button>
                      <button
                        className="ide-btn ide-btn-ghost"
                        disabled={tokenBusy}
                        onClick={() => {
                          setTokenAction(null);
                          setTokenAmount("");
                        }}
                        type="button"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                ) : null}
                <p className="ide-rewards-lock-note" id="staking-lock-note">
                  {onChainPosition.error
                    ? "The JDR lock configuration could not be read from devnet."
                    : onChainPosition.loading
                      ? "Checking your on-chain JDR lock position."
                      : "Locked JDR sets your weight in future revenue epochs."}
                </p>
                {epochMessage ? (
                  <p className="ide-rewards-lock-note" role="status">
                    {epochMessage}
                  </p>
                ) : null}
              </div>
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
