"use client";

/**
 * Data hooks for the Idealer screens: they compose the on-chain turn snapshot
 * (idealerProgram) with the HTTP API (apiClient) into the screen-facing shapes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useWalletConnection } from "@solana/react-hooks";
import {
  MVP_FEES_SOL,
  REPEATED_ACTION_FEE_MULTIPLIER,
  VOTE_FEE_START_TURN,
} from "@idealer/constants";

import {
  getTurnActionReadiness,
  IDEALER_ACTIVE_TURN_ID,
  type ActiveTurnSnapshot,
} from "../../../solana/idealerProgram";
import { fetchActiveTurnSnapshotFromWorker } from "../../../solana/activeTurnApi";
import {
  getConversationDrafts,
  getGuessReceipt,
  getPlayerClaims,
  getPlayerHistory,
  getRound,
  getRuleEliminationVotes,
  getRuleProposals,
  getRuleVotes,
} from "./apiClient";
import { truncateAddress } from "./format";
import type {
  GuessReceiptApi,
  ConversationDraftApi,
  PlayerClaimsApi,
  PlayerHistoryApi,
  RoundSummaryApi,
  RuleProposalApi,
  UiRule,
} from "./types";

export type TurnState = "checking" | "closed" | "open" | "unavailable";

export interface ActiveTurnView {
  activeTurnId: number;
  endTimestamp: null | number;
  message: string;
  readinessCode?: string;
  refresh: () => void;
  snapshot: ActiveTurnSnapshot | null;
  state: TurnState;
}

/** Polls the on-chain GlobalConfig + active TurnState every 10s (and on focus). */
export function useActiveTurn(): ActiveTurnView {
  const [view, setView] = useState<Omit<ActiveTurnView, "refresh">>({
    activeTurnId: IDEALER_ACTIVE_TURN_ID,
    endTimestamp: null,
    message: "Checking the active turn.",
    snapshot: null,
    state: "checking",
  });

  const load = useCallback(async () => {
    try {
      const snapshot = await fetchActiveTurnSnapshotFromWorker();
      const readiness = getTurnActionReadiness({
        cutoffBps: snapshot.globalConfig.guessCutoffBps,
        globalConfig: snapshot.globalConfig,
        turn: snapshot.turnState,
      });
      setView({
        activeTurnId: snapshot.globalConfig.activeTurnId || IDEALER_ACTIVE_TURN_ID,
        endTimestamp: snapshot.turnState?.endTimestamp ?? null,
        message: readiness.ok ? "The active turn is accepting plays." : readiness.message,
        snapshot,
        state: readiness.ok ? "open" : "closed",
        ...(readiness.ok ? {} : { readinessCode: readiness.code }),
      });
    } catch (error) {
      console.error("Failed to load the active turn.", error);
      setView({
        activeTurnId: IDEALER_ACTIVE_TURN_ID,
        endTimestamp: null,
        message: "The live turn status could not be loaded. Try again shortly.",
        readinessCode: "TURN_STATUS_UNAVAILABLE",
        snapshot: null,
        state: "unavailable",
      });
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    const run = () => {
      if (mounted) {
        void load();
      }
    };
    run();
    const id = window.setInterval(run, 10_000);
    window.addEventListener("focus", run);
    return () => {
      mounted = false;
      window.clearInterval(id);
      window.removeEventListener("focus", run);
    };
  }, [load]);

  return { ...view, refresh: () => void load() };
}

/** GET /rounds/{turnId}. `turnId <= 0` is treated as "no round yet". */
export function useRound(turnId: null | number) {
  const [round, setRound] = useState<RoundSummaryApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!turnId || turnId <= 0) {
        setRound(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      getRound(turnId, signal)
        .then((body) => {
          setRound(body?.round ?? null);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          console.error("Failed to load round.", cause);
          setError("round_unavailable");
        })
        .finally(() => setLoading(false));
    },
    [turnId],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { error, loading, reload, round };
}

function buildUiRule(
  proposal: RuleProposalApi,
  approve: number,
  against: number,
  finalist: boolean,
  myApproveCount: number,
  myAgainstCount: number,
  nextApproveFeeSol: number,
  nextAgainstFeeSol: number,
  src: "top" | "vrf" | null,
  walletAddress: string | undefined,
): UiRule {
  const state = proposal.state ?? "proposed";
  return {
    against,
    approve,
    created: "",
    finalist,
    handle: truncateAddress(proposal.proposer),
    how: "The dealer evaluates every guess against this rule and the best one wins the round. The house applies it automatically after the draw (VRF).",
    id: `r${proposal.ruleId}`,
    mine: Boolean(walletAddress && proposal.proposer === walletAddress),
    myAgainstCount,
    myApproveCount,
    nextAgainstFeeSol,
    nextApproveFeeSol,
    removed: state === "removed_paid",
    ruleId: proposal.ruleId,
    ruleProposal: proposal.ruleProposal,
    seed: proposal.sanitizedText,
    src,
    state,
    summary: proposal.sanitizedText,
    title: proposal.title ?? `Rule #${proposal.ruleId}`,
    tokens: proposal.tokenCount ?? 0,
    wallet: truncateAddress(proposal.proposer),
  };
}

function repeatedActionFeeSol(turnId: number, sequence: number, baseFeeSol: number) {
  if (turnId < VOTE_FEE_START_TURN && sequence === 1) {
    return 0;
  }
  const paidIndex = sequence - 1;
  let feeSol = baseFeeSol;
  for (let index = 0; index < paidIndex; index += 1) {
    feeSol *= REPEATED_ACTION_FEE_MULTIPLIER;
  }
  return feeSol;
}

export interface RulesView {
  approvedIds: number[];
  eliminatedIds: number[];
  error: null | string;
  finalistsCount: number;
  loading: boolean;
  reload: () => void;
  rules: UiRule[];
}

/**
 * Combines /rule-proposals + /rule-votes + /rule-elimination-votes with the
 * round summary's elimination/election state into UiRule[]. `against`/finalist
 * status only exist for finalists during the decision window.
 */
export function useRules(turnId: number, round: RoundSummaryApi | null): RulesView {
  const { wallet } = useWalletConnection();
  const walletAddress = wallet?.account.address.toString();
  const [proposals, setProposals] = useState<RuleProposalApi[]>([]);
  const [approveCounts, setApproveCounts] = useState<Record<string, number>>({});
  const [againstCounts, setAgainstCounts] = useState<Record<string, number>>({});
  const [myApproveCounts, setMyApproveCounts] = useState<Record<string, number>>({});
  const [myAgainstCounts, setMyAgainstCounts] = useState<Record<string, number>>({});
  const [approvedIds, setApprovedIds] = useState<number[]>([]);
  const [eliminatedIds, setEliminatedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!turnId || turnId <= 0) {
        setLoading(false);
        return;
      }
      setLoading(true);
      Promise.all([
        getRuleProposals(turnId, signal),
        getRuleVotes(turnId, signal),
        getRuleEliminationVotes(turnId, signal),
      ])
        .then(([proposalsBody, votesBody, elimBody]) => {
          setProposals(proposalsBody?.proposals ?? []);
          setApproveCounts(votesBody?.counts ?? {});
          setAgainstCounts(elimBody?.counts ?? {});
          if (walletAddress) {
            const approvalVotes = (votesBody?.votes ?? []).filter(
              (v) => v.voter === walletAddress,
            );
            const eliminationVotes = (elimBody?.votes ?? []).filter(
              (v) => v.voter === walletAddress,
            );
            const approvalCountsByRule = approvalVotes.reduce<Record<string, number>>(
              (current, vote) => {
                current[String(vote.ruleId)] = (current[String(vote.ruleId)] ?? 0) + 1;
                return current;
              },
              {},
            );
            const eliminationCountsByRule = eliminationVotes.reduce<Record<string, number>>(
              (current, vote) => {
                current[String(vote.ruleId)] = (current[String(vote.ruleId)] ?? 0) + 1;
                return current;
              },
              {},
            );
            setMyApproveCounts(approvalCountsByRule);
            setMyAgainstCounts(eliminationCountsByRule);
            setApprovedIds([...new Set(approvalVotes.map((v) => v.ruleId))]);
            setEliminatedIds([...new Set(eliminationVotes.map((v) => v.ruleId))]);
          } else {
            setMyApproveCounts({});
            setMyAgainstCounts({});
            setApprovedIds([]);
            setEliminatedIds([]);
          }
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          console.error("Failed to load rules.", cause);
          setError("rules_unavailable");
        })
        .finally(() => setLoading(false));
    },
    [turnId, walletAddress],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  const rules = useMemo(() => {
    const topIds = new Set(round?.election?.topVotedRuleIds ?? []);
    const randomIds = new Set(round?.election?.randomRuleIds ?? []);
    const finalistIds = new Set(round?.election?.finalistRuleIds ?? []);
    const finalistStates = new Map(
      (round?.elimination?.finalists ?? []).map((f) => [f.ruleId, f]),
    );
    // Elimination finalists are authoritative for the finalist set when present.
    for (const id of finalistStates.keys()) {
      finalistIds.add(id);
    }

    return proposals
      .map((proposal) => {
        const id = proposal.ruleId;
        const finalState = finalistStates.get(id);
        const approve = approveCounts[String(id)] ?? finalState?.approvalVotes ?? 0;
        const against =
          againstCounts[String(id)] ?? finalState?.eliminationVotes ?? 0;
        const myApproveCount = myApproveCounts[String(id)] ?? 0;
        const myAgainstCount = myAgainstCounts[String(id)] ?? 0;
        const nextApproveSequence = myApproveCount + 1;
        const nextAgainstSequence = myAgainstCount + 1;
        const finalist = finalistIds.has(id);
        const src: "top" | "vrf" | null = topIds.has(id)
          ? "top"
          : randomIds.has(id) || finalist
            ? "vrf"
            : null;
        return buildUiRule(
          proposal,
          approve,
          against,
          finalist,
          myApproveCount,
          myAgainstCount,
          repeatedActionFeeSol(turnId, nextApproveSequence, MVP_FEES_SOL.vote),
          repeatedActionFeeSol(
            turnId,
            nextAgainstSequence,
            MVP_FEES_SOL.vote,
          ),
          src,
          walletAddress,
        );
      })
      .sort((a, b) => b.approve - a.approve);
  }, [
    proposals,
    approveCounts,
    againstCounts,
    myApproveCounts,
    myAgainstCounts,
    round,
    turnId,
    walletAddress,
  ]);

  return {
    approvedIds,
    eliminatedIds,
    error,
    finalistsCount: rules.filter((r) => r.finalist).length,
    loading,
    reload: () => reload(),
    rules,
  };
}

/** Whether the connected wallet already submitted a guess for `turnId`. */
export function usePlayerGuess(turnId: number, walletAddress: string | undefined) {
  const [receipt, setReceipt] = useState<GuessReceiptApi | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!walletAddress || !turnId || turnId <= 0) {
        setReceipt(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      getGuessReceipt(turnId, walletAddress, signal)
        .then((value) => setReceipt(value))
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          console.error("Failed to load guess receipt.", cause);
        })
        .finally(() => setLoading(false));
    },
    [turnId, walletAddress],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return {
    loading,
    playCount: receipt?.sequence ?? (receipt ? 1 : 0),
    played: receipt !== null,
    receipt,
    reload: () => reload(),
  };
}

/** Cross-turn claim ledger for the connected wallet (Profile screen). */
export function usePlayerClaims(walletAddress: string | undefined) {
  const [claims, setClaims] = useState<PlayerClaimsApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!walletAddress) {
        setClaims(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      getPlayerClaims(walletAddress, signal)
        .then((body) => {
          setClaims(body?.claims ?? null);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          console.error("Failed to load player claims.", cause);
          setError("claims_unavailable");
        })
        .finally(() => setLoading(false));
    },
    [walletAddress],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { claims, error, loading, reload: () => reload() };
}

export function usePlayerHistory(walletAddress: string | undefined) {
  const [history, setHistory] = useState<PlayerHistoryApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!walletAddress) {
        setHistory(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      getPlayerHistory(walletAddress, {
        limit: 25,
        ...(signal ? { signal } : {}),
      })
        .then((body) => {
          setHistory(body?.history ?? null);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          console.error("Failed to load player history.", cause);
          setError("history_unavailable");
        })
        .finally(() => setLoading(false));
    },
    [walletAddress],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { error, history, loading, reload: () => reload() };
}

export function useConversationDrafts(walletAddress: string | undefined) {
  const [drafts, setDrafts] = useState<ConversationDraftApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!walletAddress) {
        setDrafts([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      getConversationDrafts(walletAddress, signal)
        .then((body) => {
          setDrafts(body?.drafts ?? []);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          console.error("Failed to load conversation drafts.", cause);
          setError("drafts_unavailable");
        })
        .finally(() => setLoading(false));
    },
    [walletAddress],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return { drafts, error, loading, reload: () => reload() };
}
