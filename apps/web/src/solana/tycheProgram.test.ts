import assert from "node:assert/strict";
import { test } from "node:test";

import { address } from "@solana/kit";

import {
  confirmedProgramAccountExists,
  getActionCutoffTimestamp,
  getTurnActionReadiness,
  TYCHE_PROGRAM_ID,
  waitForConfirmedProgramAccount,
} from "./tycheProgram.js";

type AccountInfoResult = {
  value: null | {
    data: readonly [string, string];
    owner: string;
  };
};

function createAccountReader(results: AccountInfoResult[]) {
  let calls = 0;
  return {
    calls: () => calls,
    client: {
      runtime: {
        rpc: {
          getAccountInfo: () => ({
            send: async () => {
              const result = results[Math.min(calls, results.length - 1)] ?? {
                value: null,
              };
              calls += 1;
              return result;
            },
          }),
        },
      },
    },
  };
}

const ACCOUNT = address("11111111111111111111111111111111");
const PROGRAM_ACCOUNT: AccountInfoResult = {
  value: {
    data: ["", "base64"],
    owner: TYCHE_PROGRAM_ID.toString(),
  },
};

test("confirmedProgramAccountExists returns false for missing accounts", async () => {
  const reader = createAccountReader([{ value: null }]);

  assert.equal(
    await confirmedProgramAccountExists({
      account: ACCOUNT,
      client: reader.client,
      label: "Your round pass",
    }),
    false,
  );
});

test("waitForConfirmedProgramAccount retries until the program account is visible", async () => {
  const reader = createAccountReader([{ value: null }, PROGRAM_ACCOUNT]);

  await waitForConfirmedProgramAccount({
    account: ACCOUNT,
    attempts: 2,
    client: reader.client,
    intervalMs: 0,
    label: "Your round pass",
  });

  assert.equal(reader.calls(), 2);
});

test("waitForConfirmedProgramAccount rejects unexpected account owners", async () => {
  const reader = createAccountReader([
    {
      value: {
        data: ["", "base64"],
        owner: "11111111111111111111111111111111",
      },
    },
  ]);

  await assert.rejects(
    waitForConfirmedProgramAccount({
      account: ACCOUNT,
      attempts: 1,
      client: reader.client,
      intervalMs: 0,
      label: "Your round pass",
    }),
    /owner does not match/,
  );
});

test("getActionCutoffTimestamp uses the base turn duration, not an extended draw end", () => {
  assert.equal(
    getActionCutoffTimestamp({
      cutoffBps: 5_000,
      turn: {
        eliminationWindowEndTimestamp: 0,
        endTimestamp: 1_000,
        finalistCount: 0,
        finalistRuleIds: [],
        startTimestamp: 100,
        status: "open",
        turnDurationSeconds: 200,
        turnId: 1,
      },
    }),
    200,
  );
});

test("no active turn surfaces the previous settlement blocker", () => {
  const readiness = getTurnActionReadiness({
    cutoffBps: 9_167,
    globalConfig: {
      activeTurnId: 0,
      guessCutoffBps: 9_167,
      guessSubmissionFeeLamports: 10_000_000n,
      hasActiveTurn: false,
      nextTurnId: 25,
      paused: false,
      ruleElectionCutoffBps: 9_167,
      ruleRemovalFeeLamports: 50_000_000n,
      voteFeeLamports: 5_000_000n,
    },
    openingGate: {
      blockingTurnId: 24,
      canOpen: false,
      code: "PREVIOUS_TURN_SETTLEMENT_PENDING",
    },
    turn: null,
  });

  assert.equal(readiness.ok, false);
  assert.equal(readiness.code, "PREVIOUS_TURN_SETTLEMENT_PENDING");
  assert.match(readiness.message, /Round 24.*settlement is incomplete/);
});
