"use client";

import { address } from "@solana/kit";

import { getWorkerBaseUrl } from "../lib/workerBase";
import type { ActiveTurnSnapshot } from "./idealerProgram";

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
  turnState: null | {
    endTimestamp: number;
    startTimestamp: number;
    status: "closed" | "open";
    turnId: number;
  };
  turnStateAddress: null | string;
}

export async function fetchActiveTurnSnapshotFromWorker(
  signal?: AbortSignal,
): Promise<ActiveTurnSnapshot> {
  const response = await fetch(`${getWorkerBaseUrl()}/turn/active`, {
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
    turnState: body.turnState,
    turnStateAddress: body.turnStateAddress
      ? address(body.turnStateAddress)
      : null,
  };
}
