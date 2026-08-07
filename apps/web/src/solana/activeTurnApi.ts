"use client";

import { address } from "@solana/kit";

import { getWorkerBaseUrl } from "../lib/workerBase";
import type { ActiveTurnSnapshot } from "./tycheProgram";

interface ActiveTurnApiResponse {
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

export async function fetchActiveTurnSnapshotFromWorker(
  signal?: AbortSignal,
): Promise<ActiveTurnSnapshot> {
  const response = await fetch(`${getWorkerBaseUrl()}/turn/active`, {
    cache: "no-store",
    ...(signal ? { signal } : {}),
  });

  if (!response.ok) {
    throw new Error(`/turn/active returned HTTP ${response.status}.`);
  }

  const body = (await response.json()) as ActiveTurnApiResponse;
  return {
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
    openingGate: body.openingGate,
    turnState: body.turnState,
    turnStateAddress: body.turnStateAddress
      ? address(body.turnStateAddress)
      : null,
  };
}
