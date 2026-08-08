import assert from "node:assert/strict";
import { test } from "node:test";
import { address } from "@solana/kit";

import {
  buildUiRule,
  resolveActiveTurnLoadFailure,
  resolvePlayerGuessState,
  resolveVisibleTurnId,
} from "./hooks.js";
import type { RuleProposalApi } from "./types.js";
import type { ActiveTurnSnapshot } from "../../../solana/tycheProgram.js";

function snapshot(overrides: Partial<ActiveTurnSnapshot["globalConfig"]>) {
  return {
    globalConfig: {
      activeTurnId: 0,
      guessCutoffBps: 9_670,
      guessSubmissionFeeLamports: 10_000_000n,
      hasActiveTurn: false,
      nextTurnId: 1,
      paused: false,
      ruleElectionCutoffBps: 7_500,
      ruleRemovalFeeLamports: 50_000_000n,
      voteFeeLamports: 5_000_000n,
      ...overrides,
    },
    globalConfigAddress: address("EtZ5ZyHKb8wZmMHFDLM6LtVmZV1WUMvFPER72eFE4qob"),
    turnState: null,
    turnStateAddress: null,
  } satisfies ActiveTurnSnapshot;
}

test("visible turn uses the active turn when one exists", () => {
  assert.equal(
    resolveVisibleTurnId(
      snapshot({ activeTurnId: 102, hasActiveTurn: true, nextTurnId: 102 }),
    ),
    102,
  );
});

test("visible turn uses the latest completed turn when no turn is active", () => {
  assert.equal(resolveVisibleTurnId(snapshot({ nextTurnId: 102 })), 101);
});

test("visible turn falls back to the bootstrap turn before any turn exists", () => {
  assert.equal(resolveVisibleTurnId(snapshot({ nextTurnId: 0 })), 1);
});

test("a transient refresh failure preserves the last confirmed turn snapshot", () => {
  const lastConfirmed = snapshot({
    activeTurnId: 102,
    hasActiveTurn: true,
    nextTurnId: 103,
  });

  const unavailable = resolveActiveTurnLoadFailure({
    activeTurnId: 102,
    endTimestamp: 1_786_125_600,
    message: "The active turn is accepting plays.",
    snapshot: lastConfirmed,
    state: "open",
  });

  assert.equal(unavailable.activeTurnId, 102);
  assert.equal(unavailable.snapshot, lastConfirmed);
  assert.equal(unavailable.state, "unavailable");
  assert.equal(unavailable.readinessCode, "TURN_STATUS_UNAVAILABLE");
  assert.match(unavailable.message, /last confirmed status/);
});

test("on-chain guess confirmation keeps the player in the round while receipt indexing catches up", () => {
  assert.deepEqual(resolvePlayerGuessState(null, true), {
    entrySyncing: true,
    playCount: 1,
    played: true,
  });
});

test("rule detail uses the dealer title and executable explanation, not the raw prompt", () => {
  const proposal: RuleProposalApi = {
    normalizedText:
      "A guess wins if at least one of its numbers appears in the official draw.",
    officialInterpretation:
      "Compare each guess with the draw; it wins when at least one full number matches, regardless of order.",
    proposer: "8xP...K2m",
    ruleId: 7,
    sanitizedText: "win if I get any number in any order, for example...",
    title: "One Number Match",
  };

  const rule = buildUiRule(
    proposal,
    0,
    0,
    false,
    0,
    0,
    0,
    0,
    null,
    undefined,
  );

  assert.equal(rule.title, "One Number Match");
  assert.equal(rule.summary, proposal.normalizedText);
  assert.equal(rule.how, proposal.officialInterpretation);
  assert.equal(rule.seed, proposal.sanitizedText);
});
