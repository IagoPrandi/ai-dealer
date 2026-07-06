"use client";

/**
 * App-wide state for the Idealer single-page shell: wallet, the live turn,
 * round + rules data, the player's guess, screen navigation, and the
 * rule-detail overlay. Screens read this via `useIdealer()` (see IdealerApp).
 */
import { createContext, useContext } from "react";
import type { useSolanaClient, useWalletConnection } from "@solana/react-hooks";

import type { RulesView } from "./data/hooks";
import type { RoundSummaryApi } from "./data/types";

export type Screen =
  | "claims"
  | "create"
  | "home"
  | "play"
  | "profile"
  | "rewards"
  | "result"
  | "share"
  | "vote";

export interface NavParams {
  chatId?: null | string;
  seed?: string;
}

type SolanaClient = ReturnType<typeof useSolanaClient>;
type ConnectedWallet = ReturnType<typeof useWalletConnection>["wallet"];

export interface IdealerContextValue {
  actionError: null | string;
  approvedIds: number[];
  bet: null | number[];
  chatId: null | string;
  client: SolanaClient;
  connect: () => void;
  connected: boolean;
  connecting: boolean;
  decisionEndsAt: null | number;
  decisionPhase: boolean;
  eliminatedIds: number[];
  endSeconds: null | number;
  fees: { play: number; playNext: number; remove: number; rule: number; ruleNext: number; vote: number };
  guessCutoffEndsAt: null | number;
  go: (screen: Screen, params?: NavParams) => void;
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
  voteApprove: (ruleId: number) => Promise<void>;
  voteBusyRuleId: null | number;
  voteEliminate: (ruleId: number) => Promise<void>;
  wallet: ConnectedWallet;
  walletAddress: string | undefined;
}

export const IdealerContext = createContext<IdealerContextValue | null>(null);

export function useIdealer(): IdealerContextValue {
  const ctx = useContext(IdealerContext);
  if (!ctx) {
    throw new Error("useIdealer must be used within the Idealer shell.");
  }
  return ctx;
}
