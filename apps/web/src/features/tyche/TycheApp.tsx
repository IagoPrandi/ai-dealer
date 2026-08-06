"use client";

/**
 * Tyche single-page shell — ported from the design handoff's app.jsx.
 * Holds screen navigation, the rule-detail overlay, and wires the global app
 * state to live wallet + on-chain + API data. Replaces the old per-route pages.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSolanaClient, useWalletConnection } from "@solana/react-hooks";
import { address } from "@solana/kit";
import { usePathname, useRouter } from "next/navigation";

import "./tyche.css";

import {
  MVP_FEES_SOL,
  REPEATED_ACTION_FEE_MULTIPLIER,
  VOTE_FEE_START_TURN,
} from "@tyche/constants";

import {
  createEliminateVoteRuleInstruction,
  createRemoveRuleInstruction,
  createVoteRuleInstruction,
  deriveRuleEliminationVoteAddress,
  deriveRuleProposalAddress,
  deriveRuleRemovalAddress,
  deriveRuleVoteAddress,
  getActionCutoffTimestamp,
} from "../../solana/tycheProgram";
import {
  TycheContext,
  type TycheContextValue,
  type NavParams,
  type Screen,
} from "./context";
import { lamportsToSol } from "./data/format";
import {
  usePlayerGuess,
  useActiveTurn,
  useRound,
  useRules,
} from "./data/hooks";
import {
  postRuleEliminationVote,
  postRuleRemoval,
  postRuleVote,
} from "./data/apiClient";
import { describeTxError, describeWalletConnectError, sendInstruction } from "./data/tx";
import {
  canShowRuleRemovalAction,
  Ico,
  RuleDetail,
  type RuleDetailVote,
} from "./shared";
import { HomeScreen } from "./screens/Home";
import { PlayScreen } from "./screens/Play";
import { VoteScreen } from "./screens/Vote";
import { CreateScreen } from "./screens/Create";
import { ProfileScreen } from "./screens/Profile";
import { ClaimsScreen } from "./screens/Claims";
import { InviteScreen, storePendingInvite } from "./screens/Invite";
import { RewardsScreen } from "./screens/Rewards";
import { ResultScreen } from "./screens/Result";
import { ShareScreen } from "./screens/Share";
import { ConnectOverlay } from "./screens/Connect";
import { DrawResultPopup } from "./screens/DrawResult";

function PhoneChrome() {
  return (
    <>
      <div className="ide-di" />
      <div className="ide-statusbar">
        <span className="ide-time">9:41</span>
        <span className="ide-status-icons">
          <svg width="18" height="11" viewBox="0 0 18 11"><rect x="0" y="7" width="3" height="4" rx=".6" fill="#fff"/><rect x="4.6" y="4.8" width="3" height="6.2" rx=".6" fill="#fff"/><rect x="9.2" y="2.5" width="3" height="8.5" rx=".6" fill="#fff"/><rect x="13.8" y="0" width="3" height="11" rx=".6" fill="#fff"/></svg>
          <svg width="16" height="11" viewBox="0 0 17 12"><path d="M8.5 3.2C10.8 3.2 12.9 4.1 14.4 5.6L15.5 4.5C13.7 2.7 11.2 1.5 8.5 1.5C5.8 1.5 3.3 2.7 1.5 4.5L2.6 5.6C4.1 4.1 6.2 3.2 8.5 3.2Z" fill="#fff"/><path d="M8.5 6.8C9.9 6.8 11.1 7.3 12 8.2L13.1 7.1C11.8 5.9 10.2 5.1 8.5 5.1C6.8 5.1 5.2 5.9 3.9 7.1L5 8.2C5.9 7.3 7.1 6.8 8.5 6.8Z" fill="#fff"/><circle cx="8.5" cy="10.5" r="1.5" fill="#fff"/></svg>
          <svg width="25" height="12" viewBox="0 0 27 13"><rect x=".5" y=".5" width="23" height="12" rx="3.5" stroke="#fff" strokeOpacity=".4" fill="none"/><rect x="2" y="2" width="18" height="9" rx="2" fill="#fff"/><path d="M25 4.5V8.5C25.8 8.2 26.5 7.2 26.5 6.5C26.5 5.8 25.8 4.8 25 4.5Z" fill="#fff" fillOpacity=".5"/></svg>
        </span>
      </div>
      <div className="ide-homebar" />
    </>
  );
}

function useStandaloneDisplayMode() {
  const [standalone, setStandalone] = useState(false);

  useEffect(() => {
    const displayMode = window.matchMedia("(display-mode: standalone)");
    const update = () => {
      const navigatorStandalone =
        "standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      setStandalone(displayMode.matches || navigatorStandalone);
    };

    update();
    displayMode.addEventListener("change", update);
    return () => displayMode.removeEventListener("change", update);
  }, []);

  return standalone;
}

function repeatedActionFeeSol(turnId: number, sequence: number, baseFeeSol: number) {
  if (turnId < VOTE_FEE_START_TURN && sequence === 1) {
    return 0;
  }
  let feeSol = baseFeeSol;
  for (let index = 0; index < sequence - 1; index += 1) {
    feeSol *= REPEATED_ACTION_FEE_MULTIPLIER;
  }
  return feeSol;
}

export function TycheApp({
  initialConnect = false,
  initialResultTurnId,
  initialScreen = "home",
}: { initialConnect?: boolean; initialResultTurnId?: number; initialScreen?: Screen } = {}) {
  const client = useSolanaClient();
  const standalone = useStandaloneDisplayMode();
  const { connect, connecting, connected, connectors, wallet } = useWalletConnection();
  const walletAddress = wallet?.account.address.toString();
  const pathname = usePathname();
  const router = useRouter();

  const activeTurn = useActiveTurn();
  const turnId = activeTurn.activeTurnId;
  const { reload: reloadRound, round, loading: roundLoading, error: roundError } = useRound(turnId, turnId);
  const rules = useRules(turnId, round);
  const { entrySyncing, playCount, played, receipt, reload: reloadPlayer } = usePlayerGuess(turnId, walletAddress);

  const latestResultTurnId = useMemo(() => {
    const currentTurnHasResult =
      round?.turnId === turnId &&
      (round.status === "completed" ||
        round.draw?.status === "fulfilled" ||
        Boolean(round.winners?.records.length));
    return currentTurnHasResult ? turnId : Math.max(1, turnId - 1);
  }, [round, turnId]);
  const historicalResultTurnId =
    initialResultTurnId &&
    Number.isInteger(initialResultTurnId) &&
    initialResultTurnId > 0
      ? initialResultTurnId
      : null;
  const resultTurnId = historicalResultTurnId ?? latestResultTurnId;

  const [screen, setScreen] = useState<Screen>(initialScreen);
  const [seed, setSeed] = useState("");
  const [chatId, setChatId] = useState<null | string>(null);
  const [newConversationKey, setNewConversationKey] = useState(0);
  const [detail, setDetail] = useState<{ canAgainst: boolean; rank: number | null; ruleId: number } | null>(null);
  const [showConnect, setShowConnect] = useState(initialConnect);
  const [voteBusyRuleId, setVoteBusyRuleId] = useState<null | number>(null);
  const [removeBusyRuleId, setRemoveBusyRuleId] = useState<null | number>(null);
  const [actionError, setActionError] = useState<null | string>(null);
  const [connectError, setConnectError] = useState<null | string>(null);

  const go = useCallback((next: Screen, params?: NavParams) => {
    if (next === "home" && pathname !== "/play" && !pathname.startsWith("/dev/gallery")) {
      router.push("/play");
      return;
    }
    if (next === "result" && !pathname.startsWith("/dev/gallery")) {
      const requestedResultTurnId = params?.resultTurnId ?? resultTurnId;
      if (Number.isInteger(requestedResultTurnId) && requestedResultTurnId > 0) {
        const resultPath = `/round/${requestedResultTurnId}`;
        if (pathname !== resultPath) {
          router.push(resultPath);
          return;
        }
      }
    }
    if (params?.newConversation) {
      setSeed("");
      setChatId(null);
      setNewConversationKey((key) => key + 1);
    } else if (params && "seed" in params && params.seed !== undefined) {
      setSeed(params.seed);
      setChatId(params?.chatId ?? null);
    } else {
      setChatId(params?.chatId ?? null);
    }
    setDetail(null);
    setScreen(next);
  }, [pathname, resultTurnId, router]);

  const openDetail = useCallback(
    (ruleId: number, opts?: { canAgainst?: boolean; rank?: number | null }) => {
      setDetail({ canAgainst: Boolean(opts?.canAgainst), rank: opts?.rank ?? null, ruleId });
    },
    [],
  );

  const reloadAll = useCallback(() => {
    activeTurn.refresh();
    reloadRound();
    rules.reload();
    reloadPlayer();
  }, [activeTurn, reloadRound, rules, reloadPlayer]);

  const requestConnect = useCallback(() => {
    setConnectError(null);
    setShowConnect(true);
  }, []);

  // An invite link (`/play?ref=<inviter>`) is captured once, before any wallet
  // exists, and kept until the invitee registers their attribution. The query
  // parameter is dropped afterwards so a shared screenshot cannot re-attribute
  // another player.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("ref");
    if (!code) {
      return;
    }
    const stored = storePendingInvite(window.localStorage, code);
    params.delete("ref");
    const query = params.toString();
    window.history.replaceState(
      null,
      "",
      `${window.location.pathname}${query ? `?${query}` : ""}`,
    );
    if (stored) {
      setScreen("invite");
    }
  }, []);

  const sendVote = useCallback(
    async (ruleId: number, kind: "approve" | "eliminate") => {
      if (!connected || !wallet || !walletAddress) {
        requestConnect();
        return;
      }
      setActionError(null);
      setVoteBusyRuleId(ruleId);
      try {
        const player = address(walletAddress);
        const ruleProposal = (await deriveRuleProposalAddress({ ruleId, turnId })).toString();
        const rule = rules.rules.find((candidate) => candidate.ruleId === ruleId);
        const sequence =
          kind === "approve"
            ? (rule?.myApproveCount ?? 0) + 1
            : (rule?.myAgainstCount ?? 0) + 1;
        const submittedAt = new Date().toISOString();
        if (kind === "approve") {
          const instruction = await createVoteRuleInstruction({ player, ruleId, sequence, turnId });
          const signature = await sendInstruction(client, wallet, instruction);
          const ruleVote = (await deriveRuleVoteAddress({ player, ruleId, sequence, turnId })).toString();
          await postRuleVote({
            feeLamports: Math.round((rule?.nextApproveFeeSol ?? 0) * 1_000_000_000),
            ruleId,
            ruleProposal,
            ruleVote,
            sequence,
            signature,
            submittedAt,
            turnId,
            voter: walletAddress,
          });
        } else {
          const instruction = await createEliminateVoteRuleInstruction({ player, ruleId, sequence, turnId });
          const signature = await sendInstruction(client, wallet, instruction);
          const eliminationVote = (await deriveRuleEliminationVoteAddress({
            player,
            ruleId,
            sequence,
            turnId,
          })).toString();
          await postRuleEliminationVote({
            eliminationVote,
            feeLamports: Math.round((rule?.nextAgainstFeeSol ?? 0) * 1_000_000_000),
            ruleId,
            ruleProposal,
            sequence,
            signature,
            submittedAt,
            turnId,
            voter: walletAddress,
          });
        }
        rules.reload();
      } catch (error) {
        setActionError(describeTxError(error));
      } finally {
        setVoteBusyRuleId(null);
      }
    },
    [client, connected, wallet, walletAddress, turnId, rules, requestConnect],
  );

  const sendRemoveRule = useCallback(
    async (ruleId: number) => {
      if (!connected || !wallet || !walletAddress) {
        requestConnect();
        return;
      }

      const rule = rules.rules.find((candidate) => candidate.ruleId === ruleId);
      if (!rule) {
        setActionError("Rule is not available for removal.");
        return;
      }
      if (rule.removed) {
        setActionError("This rule has already been removed.");
        return;
      }
      if (rule.finalist) {
        setActionError("Finalist rules cannot be removed from this screen.");
        return;
      }
      if (!rule.mine) {
        setActionError("Only the rule creator can remove this rule.");
        return;
      }
      if (!played) {
        go("play");
        return;
      }

      setActionError(null);
      setRemoveBusyRuleId(ruleId);
      try {
        const player = address(walletAddress);
        const [ruleProposal, ruleRemoval] = await Promise.all([
          deriveRuleProposalAddress({ ruleId, turnId }),
          deriveRuleRemovalAddress({ player, ruleId, turnId }),
        ]);
        const instruction = await createRemoveRuleInstruction({ player, ruleId, turnId });
        const signature = await sendInstruction(client, wallet, instruction);
        await postRuleRemoval({
          removalKind: "creator_self",
          removedAt: new Date().toISOString(),
          remover: walletAddress,
          ruleId,
          ruleProposal: ruleProposal.toString(),
          ruleRemoval: ruleRemoval.toString(),
          signature,
          turnId,
        });
        reloadAll();
      } catch (error) {
        setActionError(describeTxError(error));
      } finally {
        setRemoveBusyRuleId(null);
      }
    },
    [client, connected, go, played, reloadAll, requestConnect, rules.rules, turnId, wallet, walletAddress],
  );

  const fees = useMemo(() => {
    const gc = activeTurn.snapshot?.globalConfig;
    const basePlayFee = gc
      ? lamportsToSol(gc.guessSubmissionFeeLamports)
      : MVP_FEES_SOL.guessSubmission;
    const baseRuleFee = MVP_FEES_SOL.ruleProposal;
    const ruleProposalCount = rules.rules.filter((rule) => rule.mine).length;
    return {
      play: basePlayFee,
      playNext: repeatedActionFeeSol(turnId, playCount + 1, basePlayFee),
      remove: gc?.ruleRemovalFeeLamports
        ? lamportsToSol(gc.ruleRemovalFeeLamports)
        : MVP_FEES_SOL.paidRuleRemoval,
      rule: baseRuleFee,
      ruleNext: repeatedActionFeeSol(turnId, ruleProposalCount + 1, baseRuleFee),
      vote: gc ? lamportsToSol(gc.voteFeeLamports) : MVP_FEES_SOL.vote,
    };
  }, [activeTurn.snapshot, playCount, rules.rules, turnId]);

  // When does guess submission close? (guessCutoffBps into the turn window.)
  const guessCutoffEndsAt = useMemo(() => {
    const snap = activeTurn.snapshot;
    if (!snap?.turnState) {
      return null;
    }
    return getActionCutoffTimestamp({
      cutoffBps: snap.globalConfig.guessCutoffBps,
      turn: snap.turnState,
    });
  }, [activeTurn.snapshot]);

  // Phase 1 → phase 2 boundary: the rule-election cutoff. Phase 1 is create
  // rules + pick numbers; phase 2 is the finalist shortlist, elimination
  // voting, active rule and the draw at the turn's end (PRD §5.4).
  const phase1EndsAt = useMemo(() => {
    const snap = activeTurn.snapshot;
    if (!snap?.turnState) {
      return null;
    }
    return getActionCutoffTimestamp({
      cutoffBps: snap.globalConfig.ruleElectionCutoffBps,
      turn: snap.turnState,
    });
  }, [activeTurn.snapshot]);

  const turnOpen = activeTurn.snapshot?.turnState?.status === "open";

  // The round + rules come from the HTTP API; the turn status comes from the
  // worker/on-chain snapshot. When the API is unreachable the hooks fall back to
  // null/[], so surface that explicitly rather than letting screens render
  // fabricated zeros next to a live turn banner.
  const apiUnavailable = roundError !== null || rules.error !== null;

  const value: TycheContextValue = {
    actionError,
    apiUnavailable,
    approvedIds: rules.approvedIds,
    bet: receipt?.numbers ?? null,
    chatId,
    client,
    connect: requestConnect,
    connected,
    connecting,
    // Elimination voting is open for the whole of phase 2; it has no separate
    // countdown — the single visible phase-2 timer (endSeconds) governs it, and
    // it closes at the turn end.
    decisionPhase: round?.elimination?.status === "open",
    eliminatedIds: rules.eliminatedIds,
    endSeconds: activeTurn.endTimestamp,
    entrySyncing,
    fees,
    guessCutoffEndsAt,
    phase1EndsAt,
    turnOpen,
    go,
    newConversationKey,
    openDetail,
    players: round?.pool?.guesses ?? 0,
    playCount,
    played,
    prizeSol:
      round?.pool?.totalVisiblePrizePoolSol ?? round?.pool?.indicativeSol ?? 0,
    reloadAll,
    removeBusyRuleId,
    removeRule: sendRemoveRule,
    round,
    roundLoading,
    rules,
    screen,
    seed,
    resultTurnId,
    turnId,
    turnReadyToPlay: activeTurn.state === "open",
    turnStatusMessage: activeTurn.message,
    voteApprove: (ruleId) => sendVote(ruleId, "approve"),
    voteBusyRuleId,
    voteEliminate: (ruleId) => sendVote(ruleId, "eliminate"),
    wallet,
    walletAddress,
  };

  const showNav = screen === "home" || screen === "vote" || screen === "rewards" || screen === "profile";
  const detailRule = detail ? rules.rules.find((r) => r.ruleId === detail.ruleId) ?? null : null;
  const detailVote: RuleDetailVote | null =
    detailRule
      ? {
          approved: rules.approvedIds.includes(detailRule.ruleId),
          busy: voteBusyRuleId === detailRule.ruleId,
          canAgainst: Boolean(detail?.canAgainst) && detailRule.finalist,
          canRemove: canShowRuleRemovalAction(detailRule),
          eliminated: rules.eliminatedIds.includes(detailRule.ruleId),
          onApprove: () => void sendVote(detailRule.ruleId, "approve"),
          onEliminate: () => void sendVote(detailRule.ruleId, "eliminate"),
          onPlayToRemove: () => go("play"),
          onRemove: () => void sendRemoveRule(detailRule.ruleId),
          played,
          removeBusy: removeBusyRuleId === detailRule.ruleId,
          removeFeeSol: fees.remove,
        }
      : null;

  return (
    <TycheContext.Provider value={value}>
      <main className={`ide-stage${standalone ? " ide-standalone" : ""}`}>
        <div className={`ide-phone-shell ide-app${standalone ? " ide-standalone" : ""}`}>
          <PhoneChrome />
          <div className="ide-root">
            {screen === "home" ? <HomeScreen /> : null}
            {screen === "play" ? <PlayScreen /> : null}
            {screen === "vote" ? <VoteScreen /> : null}
            {screen === "create" ? <CreateScreen /> : null}
            {screen === "profile" ? <ProfileScreen /> : null}
            {screen === "claims" ? <ClaimsScreen /> : null}
            {screen === "invite" ? <InviteScreen /> : null}
            {screen === "rewards" ? <RewardsScreen /> : null}
            {screen === "result" ? <ResultScreen /> : null}
            {screen === "share" ? <ShareScreen /> : null}

            {showNav ? (
              <div className="ide-nav">
                <button className={"ide-nav-btn" + (screen === "home" ? " on" : "")} onClick={() => go("home")} type="button">
                  <Ico.home style={{ color: "currentColor" }} /> Round
                </button>
                <button className={"ide-nav-btn" + (screen === "vote" ? " on" : "")} onClick={() => go("vote")} type="button">
                  <Ico.vote style={{ color: "currentColor" }} /> Rules
                </button>
                <button className="ide-nav-fab" onClick={() => go("create", { newConversation: true })} title="Create rule" type="button"><Ico.plus style={{ color: "#08110C" }} /></button>
                <button className={"ide-nav-btn" + (screen === "rewards" ? " on" : "")} onClick={() => go("rewards")} type="button">
                  <Ico.coin style={{ color: "currentColor" }} /> Rewards
                </button>
                <button className={"ide-nav-btn" + (screen === "profile" ? " on" : "")} onClick={() => go("profile")} type="button">
                  <Ico.user style={{ color: "currentColor" }} /> Account
                </button>
              </div>
            ) : null}

            {detail && detailRule ? (
              <RuleDetail rule={detailRule} rank={detail.rank} vote={detailVote} onClose={() => setDetail(null)} />
            ) : null}

            {screen === "home" ? <DrawResultPopup /> : null}

            {showConnect ? (
              <ConnectOverlay
                connecting={connecting}
                connectors={connectors}
                error={connectError}
                onClose={() => setShowConnect(false)}
                onConnect={async (id) => {
                  setConnectError(null);
                  try {
                    await connect(id);
                    setShowConnect(false);
                    reloadAll();
                  } catch (error) {
                    setConnectError(describeWalletConnectError(error));
                  }
                }}
              />
            ) : null}
          </div>
        </div>
      </main>
    </TycheContext.Provider>
  );
}
