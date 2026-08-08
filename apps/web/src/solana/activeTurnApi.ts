"use client";

import { address } from "@solana/kit";

import { getWorkerBaseUrl } from "../lib/workerBase";
import type { ActiveTurnSnapshot } from "./tycheProgram";

interface ActiveTurnApiResponse {
  freshness: "fresh" | "stale";
  globalConfig: {
    activeTurnId: number;
    guessCutoffBps: number;
    guessSubmissionFeeLamports: string;
    hasActiveTurn: boolean;
    nextTurnId: number;
    paused: boolean;
    ruleElectionCutoffBps: number;
    ruleRemovalFeeLamports: null | string;
    voteFeeLamports: string;
  };
  globalConfigAddress: string;
  openingGate: {
    blockingTurnId: number | null;
    canOpen: boolean;
    code: "PREVIOUS_TURN_SETTLEMENT_PENDING" | "READY_TO_OPEN";
  };
  observedAt: string;
  source: "cache" | "rpc";
  turnState: null | {
    eliminationWindowEndTimestamp: number;
    endTimestamp: number;
    finalistCount: number;
    finalistRuleIds: number[];
    startTimestamp: number;
    status: "closed" | "open";
    turnDurationSeconds: number;
    turnId: number;
  };
  turnStateAddress: null | string;
}

export type ActiveTurnWorkerSnapshot = ActiveTurnSnapshot & {
  freshness: "fresh" | "stale";
  observedAt: string;
  source: "cache" | "rpc";
};

export async function fetchActiveTurnSnapshotFromWorker(
  options: { requireFresh?: boolean; signal?: AbortSignal } = {},
): Promise<ActiveTurnWorkerSnapshot> {
  const params = new URLSearchParams();
  if (options.requireFresh) {
    params.set("fresh", "1");
  }
  const query = params.toString();
  const response = await fetch(`${getWorkerBaseUrl()}/turn/active${query ? `?${query}` : ""}`, {
    cache: "no-store",
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (!response.ok) {
    throw new Error(`/turn/active returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as ActiveTurnApiResponse;
  return {
    freshness: body.freshness,
    globalConfig: {
      activeTurnId: body.globalConfig.activeTurnId,
      guessCutoffBps: body.globalConfig.guessCutoffBps,
      guessSubmissionFeeLamports: BigInt(
        body.globalConfig.guessSubmissionFeeLamports,
      ),
      hasActiveTurn: body.globalConfig.hasActiveTurn,
      nextTurnId: body.globalConfig.nextTurnId,
      paused: body.globalConfig.paused,
      ruleElectionCutoffBps: body.globalConfig.ruleElectionCutoffBps,
      ruleRemovalFeeLamports:
        body.globalConfig.ruleRemovalFeeLamports === null
          ? null
          : BigInt(body.globalConfig.ruleRemovalFeeLamports),
      voteFeeLamports: BigInt(body.globalConfig.voteFeeLamports),
    },
    globalConfigAddress: address(body.globalConfigAddress),
    observedAt: body.observedAt,
    openingGate: body.openingGate,
    turnState: body.turnState,
    turnStateAddress: body.turnStateAddress
      ? address(body.turnStateAddress)
      : null,
    source: body.source,
  };
}
