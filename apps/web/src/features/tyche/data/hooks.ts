"use client";

/**
 * Data hooks for the Tyche screens: they compose the on-chain turn snapshot
 * (tycheProgram) with the HTTP API (apiClient) into the screen-facing shapes.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSolanaClient, useWalletConnection } from "@solana/react-hooks";
import { address } from "@solana/kit";
import { BRAND_NAME } from "@tyche/config";
import {
  MVP_FEES_SOL,
  REPEATED_ACTION_FEE_MULTIPLIER,
  VOTE_FEE_START_TURN,
} from "@tyche/constants";

import {
  confirmedProgramAccountExists,
  deriveSubmitGuessAccounts,
  getTurnActionReadiness,
  TYCHE_ACTIVE_TURN_ID,
  type ActiveTurnSnapshot,
} from "../../../solana/tycheProgram";
import { fetchActiveTurnSnapshotFromWorker } from "../../../solana/activeTurnApi";
import {
  deleteConversationDraft,
  getConversationDrafts,
  getGuessReceipt,
  getGuessReceipts,
  getPlayerClaims,
  getPlayerHistory,
  getPublicTokenomics,
  getRound,
  getRuleEliminationVotes,
  getRuleProposals,
  getRuleVotes,
  getWalletTokenomics,
} from "./apiClient";
import { truncateAddress } from "./format";
import type {
  GuessReceiptApi,
  ConversationDraftApi,
  PlayerClaimsApi,
  PlayerHistoryApi,
  RoundSummaryApi,
  RuleProposalApi,
  TokenomicsPublicApi,
  TokenomicsWalletApi,
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

type ActiveTurnViewState = Omit<ActiveTurnView, "refresh">;

export function resolveActiveTurnLoadFailure(
  previous: ActiveTurnViewState,
): ActiveTurnViewState {
  return {
    ...previous,
    message: previous.snapshot
      ? "Live turn refresh is delayed. Showing the last confirmed status."
      : "The live turn status could not be loaded. Try again shortly.",
    readinessCode: "TURN_STATUS_UNAVAILABLE",
    state: "unavailable",
  };
}

export function resolveVisibleTurnId(snapshot: ActiveTurnSnapshot) {
  if (
    snapshot.globalConfig.hasActiveTurn &&
    snapshot.globalConfig.activeTurnId > 0
  ) {
    return snapshot.globalConfig.activeTurnId;
  }

  const latestKnownTurnId = snapshot.globalConfig.nextTurnId - 1;
  return latestKnownTurnId > 0 ? latestKnownTurnId : TYCHE_ACTIVE_TURN_ID;
}

/** Loads the on-chain GlobalConfig + active TurnState and exposes manual refresh. */
export function useActiveTurn(): ActiveTurnView {
  const [view, setView] = useState<ActiveTurnViewState>({
    activeTurnId: TYCHE_ACTIVE_TURN_ID,
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
        ...(snapshot.openingGate ? { openingGate: snapshot.openingGate } : {}),
        turn: snapshot.turnState,
      });
      const stale = snapshot.freshness === "stale";
      setView({
        activeTurnId: resolveVisibleTurnId(snapshot),
        endTimestamp: snapshot.turnState?.endTimestamp ?? null,
        message: stale
          ? "Live turn refresh is delayed. Showing the last confirmed status."
          : readiness.ok
            ? "The active turn is accepting plays."
            : readiness.message,
        snapshot,
        state: stale ? "unavailable" : readiness.ok ? "open" : "closed",
        ...(stale
          ? { readinessCode: "TURN_STATUS_UNAVAILABLE" }
          : readiness.ok
            ? {}
            : { readinessCode: readiness.code }),
      });
    } catch (error) {
      console.warn("Failed to load the active turn.", error);
      setView(resolveActiveTurnLoadFailure);
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
    return () => {
      mounted = false;
    };
  }, [load]);

  return { ...view, refresh: () => void load() };
}

/** GET /rounds/{turnId}. `turnId <= 0` is treated as "no round yet". */
export function useRound(turnId: null | number, activeTurnId?: number) {
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
      getRound(turnId, {
        ...(activeTurnId ? { activeTurnId } : {}),
        ...(signal ? { signal } : {}),
      })
        .then((body) => {
          setRound(body?.round ?? null);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          console.warn("Failed to load round.", cause);
          setError("round_unavailable");
        })
        .finally(() => setLoading(false));
    },
    [activeTurnId, turnId],
  );

  // Load when this round becomes active. Later updates are explicit so the UI
  // does not repeatedly return to a loading state while the user is reading.
  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => {
      controller.abort();
    };
  }, [reload]);

  return { error, loading, reload, round };
}

export function buildUiRule(
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
    how: proposal.officialInterpretation,
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
    summary: proposal.normalizedText,
    title: proposal.title,
    tokens: proposal.tokenCount ?? 0,
    wallet: truncateAddress(proposal.proposer),
  };
}

function repeatedActionFeeSol(
  turnId: number,
  sequence: number,
  baseFeeSol: number,
) {
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
export function useRules(
  turnId: number,
  round: RoundSummaryApi | null,
  onChainFinalistRuleIds: readonly number[] = [],
): RulesView {
  const { wallet } = useWalletConnection();
  const walletAddress = wallet?.account.address.toString();
  const [proposals, setProposals] = useState<RuleProposalApi[]>([]);
  const [approveCounts, setApproveCounts] = useState<Record<string, number>>(
    {},
  );
  const [againstCounts, setAgainstCounts] = useState<Record<string, number>>(
    {},
  );
  const [myApproveCounts, setMyApproveCounts] = useState<
    Record<string, number>
  >({});
  const [myAgainstCounts, setMyAgainstCounts] = useState<
    Record<string, number>
  >({});
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
            const approvalCountsByRule = approvalVotes.reduce<
              Record<string, number>
            >((current, vote) => {
              current[String(vote.ruleId)] =
                (current[String(vote.ruleId)] ?? 0) + 1;
              return current;
            }, {});
            const eliminationCountsByRule = eliminationVotes.reduce<
              Record<string, number>
            >((current, vote) => {
              current[String(vote.ruleId)] =
                (current[String(vote.ruleId)] ?? 0) + 1;
              return current;
            }, {});
            setMyApproveCounts(approvalCountsByRule);
            setMyAgainstCounts(eliminationCountsByRule);
            setApprovedIds([...new Set(approvalVotes.map((v) => v.ruleId))]);
            setEliminatedIds([
              ...new Set(eliminationVotes.map((v) => v.ruleId)),
            ]);
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
          console.warn("Failed to load rules.", cause);
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
    // The finalist list on TurnState is authoritative as soon as phase 2 opens;
    // the API projection can arrive a polling interval later.
    for (const id of onChainFinalistRuleIds) {
      finalistIds.add(id);
    }
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
        const approve =
          approveCounts[String(id)] ?? finalState?.approvalVotes ?? 0;
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
          repeatedActionFeeSol(turnId, nextAgainstSequence, MVP_FEES_SOL.vote),
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
    onChainFinalistRuleIds,
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

export function resolvePlayerGuessState(
  receipt: GuessReceiptApi | null,
  onChainFirstGuess: boolean,
) {
  return {
    entrySyncing: receipt === null && onChainFirstGuess,
    // The PlayerGuess PDA is the authoritative record. The API receipt supplies
    // display details, but an indexing delay must not lock a confirmed player out
    // of the home, voting, or rule-creation flows.
    playCount: receipt?.sequence ?? (onChainFirstGuess ? 1 : 0),
    played: receipt !== null || onChainFirstGuess,
  };
}

/** Whether the connected wallet already submitted a guess for `turnId`. */
export function usePlayerGuess(
  turnId: number,
  walletAddress: string | undefined,
) {
  const client = useSolanaClient();
  const [receipt, setReceipt] = useState<GuessReceiptApi | null>(null);
  const [onChainFirstGuess, setOnChainFirstGuess] = useState(false);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!walletAddress || !turnId || turnId <= 0) {
        setReceipt(null);
        setOnChainFirstGuess(false);
        setLoading(false);
        return;
      }
      setLoading(true);

      try {
        const player = address(walletAddress);
        const accounts = await deriveSubmitGuessAccounts({
          player,
          sequence: 1,
          turnId,
        });
        const [receiptResult, onChainResult] = await Promise.allSettled([
          getGuessReceipt(turnId, walletAddress, signal),
          confirmedProgramAccountExists({
            account: accounts.playerGuess,
            client,
            label: "Your first guess",
          }),
        ]);

        if (signal?.aborted) {
          return;
        }

        if (receiptResult.status === "fulfilled") {
          setReceipt(receiptResult.value);
        } else if (
          !(
            receiptResult.reason instanceof DOMException &&
            receiptResult.reason.name === "AbortError"
          )
        ) {
          console.warn("Failed to load guess receipt.", receiptResult.reason);
          setReceipt(null);
        }

        if (onChainResult.status === "fulfilled") {
          setOnChainFirstGuess(onChainResult.value);
        } else {
          console.warn(
            "Failed to verify the on-chain first guess.",
            onChainResult.reason,
          );
          setOnChainFirstGuess(false);
        }
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
        }
      }
    },
    [client, turnId, walletAddress],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => controller.abort();
  }, [reload]);

  return {
    ...resolvePlayerGuessState(receipt, onChainFirstGuess),
    loading,
    receipt,
    reload: () => reload(),
  };
}

/** Every indexed guess submitted by the connected wallet for one turn. */
export function usePlayerGuesses(
  turnId: number,
  walletAddress: string | undefined,
) {
  const [receipts, setReceipts] = useState<GuessReceiptApi[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    if (!walletAddress || !turnId || turnId <= 0) {
      setReceipts([]);
      setError(null);
      setLoading(false);
      return () => controller.abort();
    }

    setLoading(true);
    setError(null);
    void getGuessReceipts(turnId, walletAddress, controller.signal)
      .then((next) => {
        setReceipts(next);
      })
      .catch((cause: unknown) => {
        if (cause instanceof DOMException && cause.name === "AbortError") {
          return;
        }
        console.warn("Failed to load guess receipts.", cause);
        setReceipts([]);
        setError(`${BRAND_NAME} could not load your guesses for this round.`);
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [reloadKey, turnId, walletAddress]);

  return {
    error,
    loading,
    receipts,
    reload: () => setReloadKey((key) => key + 1),
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
          console.warn("Failed to load player claims.", cause);
          setError("claims_unavailable");
        })
        .finally(() => setLoading(false));
    },
    [walletAddress],
  );

  // Load on screen entry or wallet change. Screens expose explicit retry or
  // pull-to-refresh controls for later updates.
  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => {
      controller.abort();
    };
  }, [reload]);

  return { claims, error, loading, reload: () => reload() };
}

export function useTokenomics(walletAddress: string | undefined) {
  const [publicState, setPublicState] = useState<TokenomicsPublicApi | null>(
    null,
  );
  const [walletState, setWalletState] = useState<TokenomicsWalletApi | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<null | string>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      Promise.all([
        getPublicTokenomics(signal),
        walletAddress
          ? getWalletTokenomics(walletAddress, signal)
          : Promise.resolve(null),
      ])
        .then(([publicBody, walletBody]) => {
          setPublicState(publicBody?.tokenomics ?? null);
          setWalletState(walletBody?.wallet ?? null);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          console.warn("Failed to load Tokenomics Core data.", cause);
          setError("tokenomics_unavailable");
        })
        .finally(() => setLoading(false));
    },
    [walletAddress],
  );

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal);
    return () => {
      controller.abort();
    };
  }, [reload]);

  return {
    error,
    loading,
    publicState,
    reload: () => reload(),
    walletState,
  };
}

const PLAYER_LIST_PAGE_SIZE = 10;

export function usePlayerHistory(walletAddress: string | undefined) {
  const [history, setHistory] = useState<PlayerHistoryApi | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [loadMoreError, setLoadMoreError] = useState<null | string>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!walletAddress) {
        setHistory(null);
        setLoading(false);
        setLoadingMore(false);
        setLoadMoreError(null);
        return;
      }
      setLoading(true);
      setLoadMoreError(null);
      getPlayerHistory(walletAddress, {
        limit: PLAYER_LIST_PAGE_SIZE,
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
          console.warn("Failed to load player history.", cause);
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

  const loadMore = useCallback(() => {
    if (!walletAddress || !history?.nextCursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setLoadMoreError(null);
    getPlayerHistory(walletAddress, {
      cursor: history.nextCursor,
      limit: PLAYER_LIST_PAGE_SIZE,
    })
      .then((body) => {
        const nextPage = body?.history;
        if (!nextPage) {
          return;
        }
        setHistory((current) =>
          current
            ? {
                ...nextPage,
                cursor: current.cursor,
                events: [...current.events, ...nextPage.events],
              }
            : nextPage,
        );
      })
      .catch((cause: unknown) => {
        console.warn("Failed to load more player history.", cause);
        setLoadMoreError("history_unavailable");
      })
      .finally(() => setLoadingMore(false));
  }, [history?.nextCursor, loadingMore, walletAddress]);

  return {
    error,
    history,
    loadMore,
    loadMoreError,
    loading,
    loadingMore,
    reload: () => reload(),
  };
}

export function useConversationDrafts(walletAddress: string | undefined) {
  const [drafts, setDrafts] = useState<ConversationDraftApi[]>([]);
  const [nextCursor, setNextCursor] = useState<null | string>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [loadMoreError, setLoadMoreError] = useState<null | string>(null);
  const [deletingDraftId, setDeletingDraftId] = useState<null | string>(null);

  const reload = useCallback(
    (signal?: AbortSignal) => {
      if (!walletAddress) {
        setDrafts([]);
        setNextCursor(null);
        setLoading(false);
        setLoadingMore(false);
        setLoadMoreError(null);
        return;
      }
      setLoading(true);
      setLoadMoreError(null);
      getConversationDrafts(walletAddress, {
        limit: PLAYER_LIST_PAGE_SIZE,
        ...(signal ? { signal } : {}),
      })
        .then((body) => {
          setDrafts(body?.drafts ?? []);
          setNextCursor(body?.nextCursor ?? null);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (cause instanceof DOMException && cause.name === "AbortError") {
            return;
          }
          console.warn("Failed to load conversation drafts.", cause);
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

  /**
   * Deletes one saved conversation. The row leaves the list only after the API
   * confirms the delete, so a failure keeps the conversation visible and the
   * caller reports it instead of showing a list the next reload contradicts.
   */
  const remove = useCallback(
    async (draftId: string) => {
      if (!walletAddress) {
        throw new Error("Connect a wallet to delete a conversation.");
      }
      setDeletingDraftId(draftId);
      try {
        await deleteConversationDraft(walletAddress, draftId);
        setDrafts((current) =>
          current.filter((draft) => draft.draftId !== draftId),
        );
      } finally {
        setDeletingDraftId(null);
      }
    },
    [walletAddress],
  );

  const loadMore = useCallback(() => {
    if (!walletAddress || !nextCursor || loadingMore) {
      return;
    }
    setLoadingMore(true);
    setLoadMoreError(null);
    getConversationDrafts(walletAddress, {
      cursor: nextCursor,
      limit: PLAYER_LIST_PAGE_SIZE,
    })
      .then((body) => {
        const nextDrafts = body?.drafts ?? [];
        setDrafts((current) => [...current, ...nextDrafts]);
        setNextCursor(body?.nextCursor ?? null);
      })
      .catch((cause: unknown) => {
        console.warn("Failed to load more conversation drafts.", cause);
        setLoadMoreError("drafts_unavailable");
      })
      .finally(() => setLoadingMore(false));
  }, [loadingMore, nextCursor, walletAddress]);

  return {
    deletingDraftId,
    drafts,
    error,
    hasMore: nextCursor !== null,
    loadMore,
    loadMoreError,
    loading,
    loadingMore,
    reload: () => reload(),
    remove,
  };
}
