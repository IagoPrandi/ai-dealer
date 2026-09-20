"use client";

/**
 * App-wide state for the Tyche single-page shell: wallet, the live turn,
 * round + rules data, the player's guess, screen navigation, and the
 * rule-detail overlay. Screens read this via `useTyche()` (see TycheApp).
 */
import { createContext, useContext } from "react";
import type { useSolanaClient } from "@solana/react-hooks";

import type { TurnStateSnapshot } from "../../solana/tycheProgram";
import type { PlayerWallet, PlayerWalletSource } from "../../solana/PlayerWalletProvider";
import type { RulesView } from "./data/hooks";
import type { RoundSummaryApi } from "./data/types";

export type Screen =
  | "claims"
  | "create"
  | "home"
  | "guesses"
  | "invite"
  | "myrules"
  | "play"
  | "profile"
  | "rewards"
  | "result"
  | "share"
  | "vote";

export interface NavParams {
  chatId?: null | string;
  newConversation?: boolean;
  resultTurnId?: number;
  /**
   * Where the back control of the screen being opened should return to.
   * Defaults to `"home"`, so a screen only has to pass it when it is not the
   * round itself that launched the navigation.
   */
  returnTo?: Screen;
  seed?: string;
}

/**
 * `"new"` - an explicit blank chat; `"resume"` - reopening a saved
 * conversation; `"seed"` - a prompt typed on Home, auto-sent on arrival;
 * `null` - the screen was not reached through `go`, i.e. a direct load of
 * `/play/propose`.
 */
export type CreateIntent = "new" | "resume" | "seed" | null;

/**
 * Derives the intent of a single navigation. Deliberately a function of the
 * params alone: the counter it replaces (`newConversationKey`) accumulated
 * across a whole page session, so one visit to a blank chat made every later
 * "reopen this conversation" look like a new one and silently disabled the
 * reattach to a preflight job that was still running.
 */
export function resolveCreateIntent(params?: NavParams): CreateIntent {
  if (params?.newConversation) {
    return "new";
  }
  if (params?.chatId) {
    return "resume";
  }
  if (params && "seed" in params && params.seed !== undefined) {
    return "seed";
  }
  return null;
}

type SolanaClient = ReturnType<typeof useSolanaClient>;
export interface TycheContextValue {
  actionError: null | string;
  /**
   * True when the backend API (rounds/rules) could not be reached. Surfaced so
   * screens show an explicit "backend unavailable" state instead of rendering
   * zero-value fallbacks that contradict the live on-chain turn status.
   */
  apiUnavailable: boolean;
  approvedIds: number[];
  bet: null | number[];
  chatId: null | string;
  client: SolanaClient;
  /**
   * Why the Create screen is being shown right now, as opposed to whether this
   * page session has ever opened it a given way. `newConversationKey` cannot
   * answer that — it only ever counts up — so the Create screen keys its
   * mount-time reattach off this instead.
   */
  createIntent: CreateIntent;
  connect: () => void;
  connected: boolean;
  connecting: boolean;
  emailOnboardingAvailable: boolean;
  emailSignedIn: boolean;
  logoutEmail: () => Promise<void>;
  selectEmbeddedWallet: () => void;
  decisionPhase: boolean;
  eliminatedIds: number[];
  endSeconds: null | number;
  /** The first guess is confirmed on-chain but its API receipt is still indexing. */
  entrySyncing: boolean;
  fees: {
    play: number;
    playNext: number;
    remove: number;
    rule: number;
    ruleNext: number;
    vote: number;
  };
  guessCutoffEndsAt: null | number;
  /**
   * When phase 1 (create rules + pick numbers) ends. The shortlist draw starts
   * after this cutoff; phase 2 starts only once finalist IDs are published.
   * `null` while no turn is loaded.
   */
  phase1EndsAt: null | number;
  /** True while the active on-chain turn account exists with status `open`. */
  turnOpen: boolean;
  go: (screen: Screen, params?: NavParams) => void;
  newConversationKey: number;
  openDetail: (
    ruleId: number,
    opts?: { canAgainst?: boolean; rank?: number | null },
  ) => void;
  players: number;
  playCount: number;
  played: boolean;
  prizeSol: number;
  reloadAll: () => void;
  removeBusyRuleId: null | number;
  removeRule: (ruleId: number) => Promise<void>;
  /** Screen the current screen's back control returns to (see NavParams.returnTo). */
  returnTo: Screen;
  round: RoundSummaryApi | null;
  roundLoading: boolean;
  rules: RulesView;
  screen: Screen;
  seed: string;
  resultTurnId: number;
  turnId: number;
  turnReadyToPlay: boolean;
  turnStatusMessage: string;
  /** True when the last confirmed turn is retained while a live refresh fails. */
  turnStatusUnavailable: boolean;
  /** Current on-chain TurnState used to gate phase-specific actions. */
  turnState: null | TurnStateSnapshot;
  voteApprove: (ruleId: number) => Promise<void>;
  voteBusyRuleId: null | number;
  voteEliminate: (ruleId: number) => Promise<void>;
  wallet: PlayerWallet | null;
  walletAddress: string | undefined;
  walletSource: PlayerWalletSource | null;
}

export const TycheContext = createContext<TycheContextValue | null>(null);

export function useTyche(): TycheContextValue {
  const ctx = useContext(TycheContext);
  if (!ctx) {
    throw new Error("useTyche must be used within the Tyche shell.");
  }
  return ctx;
}
