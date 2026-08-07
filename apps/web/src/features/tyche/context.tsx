"use client";

/**
 * App-wide state for the Tyche single-page shell: wallet, the live turn,
 * round + rules data, the player's guess, screen navigation, and the
 * rule-detail overlay. Screens read this via `useTyche()` (see TycheApp).
 */
import { createContext, useContext } from "react";
import type { useSolanaClient, useWalletConnection } from "@solana/react-hooks";

import type { TurnStateSnapshot } from "../../solana/tycheProgram";
import type { RulesView } from "./data/hooks";
import type { RoundSummaryApi } from "./data/types";

export type Screen =
  | "claims"
  | "create"
  | "home"
  | "invite"
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
  seed?: string;
}

type SolanaClient = ReturnType<typeof useSolanaClient>;
type ConnectedWallet = ReturnType<typeof useWalletConnection>["wallet"];

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
  connect: () => void;
  connected: boolean;
  connecting: boolean;
  decisionPhase: boolean;
  eliminatedIds: number[];
  endSeconds: null | number;
  /** The first guess is confirmed on-chain but its API receipt is still indexing. */
  entrySyncing: boolean;
  fees: { play: number; playNext: number; remove: number; rule: number; ruleNext: number; vote: number };
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
  openDetail: (ruleId: number, opts?: { canAgainst?: boolean; rank?: number | null }) => void;
  players: number;
  playCount: number;
  played: boolean;
  prizeSol: number;
  reloadAll: () => void;
  removeBusyRuleId: null | number;
  removeRule: (ruleId: number) => Promise<void>;
  round: RoundSummaryApi | null;
  roundLoading: boolean;
  rules: RulesView;
  screen: Screen;
  seed: string;
  resultTurnId: number;
  turnId: number;
  turnReadyToPlay: boolean;
  turnStatusMessage: string;
  /** Current on-chain TurnState used to gate phase-specific actions. */
  turnState: null | TurnStateSnapshot;
  voteApprove: (ruleId: number) => Promise<void>;
  voteBusyRuleId: null | number;
  voteEliminate: (ruleId: number) => Promise<void>;
  wallet: ConnectedWallet;
  walletAddress: string | undefined;
}

export const TycheContext = createContext<TycheContextValue | null>(null);

export function useTyche(): TycheContextValue {
  const ctx = useContext(TycheContext);
  if (!ctx) {
    throw new Error("useTyche must be used within the Tyche shell.");
  }
  return ctx;
}
