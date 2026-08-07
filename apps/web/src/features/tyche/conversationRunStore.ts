"use client";

import type { RulePreflightResult } from "../../solana/tycheProgram";
import type { RuleInterpretationApiResult } from "./data/apiClient";
import type { ConversationMessage } from "./data/types";
import type { RulePreflightProgress } from "./data/apiClient";
import type { RuleGuidanceContext } from "./ruleRefinement";

/** The server-side run this snapshot is following, if any. */
export interface ConversationRunJob {
  /** Last event id seen, so a reconnect resumes instead of replaying. */
  cursor: null | string;
  jobId: string;
  phase: "compile" | "interpret";
  /** Kept so "Run again" never asks the player to retype their rule. */
  ruleText: string;
  startedAt: number;
  turnId: number;
}

export interface ConversationRunSnapshot {
  // Connection health is deliberately a separate field rather than a new
  // `status` member: `status === "pending"` drives the typing spinner and the
  // guidance suppression in several places, and widening it would break those
  // silently.
  connection: "closed" | "live" | "reconnecting";
  draftId: string;
  error: null | string;
  guidanceContext?: RuleGuidanceContext | null;
  interpretation: RuleInterpretationApiResult | null;
  job: ConversationRunJob | null;
  messages: ConversationMessage[];
  progress: RulePreflightProgress | null;
  rule: RulePreflightResult | null;
  status: "disconnected" | "done" | "error" | "expired" | "pending";
}

type Listener = (snapshot: ConversationRunSnapshot) => void;

const runs = new Map<string, ConversationRunSnapshot>();
const latestRunByScope = new Map<string, string>();
const listeners = new Map<string, Set<Listener>>();

function scopeKey(wallet: null | string | undefined, turnId: number) {
  return `${wallet ? wallet.toLowerCase() : "anonymous"}:${turnId}`;
}

export function getConversationRun(draftId: null | string) {
  return draftId ? runs.get(draftId) ?? null : null;
}

export function getLatestConversationRun(wallet: null | string | undefined, turnId: number) {
  return getConversationRun(latestRunByScope.get(scopeKey(wallet, turnId)) ?? null);
}

export function rememberLatestConversationRun(args: {
  draftId: string;
  turnId: number;
  wallet: null | string | undefined;
}) {
  latestRunByScope.set(scopeKey(args.wallet, args.turnId), args.draftId);
}

export function forgetLatestConversationRun(args: {
  draftId?: null | string;
  turnId: number;
  wallet: null | string | undefined;
}) {
  const key = scopeKey(args.wallet, args.turnId);
  const current = latestRunByScope.get(key);
  if (!args.draftId || current === args.draftId) {
    latestRunByScope.delete(key);
  }
}

export function upsertConversationRun(snapshot: ConversationRunSnapshot) {
  runs.set(snapshot.draftId, snapshot);
  listeners.get(snapshot.draftId)?.forEach((listener) => listener(snapshot));
}

export function patchConversationRun(
  draftId: null | string,
  patch: Partial<Omit<ConversationRunSnapshot, "draftId">>,
) {
  if (!draftId) {
    return;
  }
  const current = runs.get(draftId);
  if (!current) {
    return;
  }
  upsertConversationRun({ ...current, ...patch });
}

/** Merges into the current job rather than replacing it, for cursor updates. */
export function patchConversationRunJob(
  draftId: null | string,
  patch: Partial<ConversationRunJob>,
) {
  if (!draftId) {
    return;
  }
  const current = runs.get(draftId);
  if (!current?.job) {
    return;
  }
  upsertConversationRun({ ...current, job: { ...current.job, ...patch } });
}

export function subscribeConversationRun(
  draftId: null | string,
  listener: Listener,
) {
  if (!draftId) {
    return () => {};
  }
  const set = listeners.get(draftId) ?? new Set<Listener>();
  set.add(listener);
  listeners.set(draftId, set);

  const current = runs.get(draftId);
  if (current) {
    listener(current);
  }

  return () => {
    set.delete(listener);
    if (set.size === 0) {
      listeners.delete(draftId);
    }
  };
}
