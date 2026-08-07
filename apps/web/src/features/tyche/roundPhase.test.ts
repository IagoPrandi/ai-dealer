import assert from "node:assert/strict";
import { test } from "node:test";

import {
  canVoteForRule,
  canVoteRuleOut,
  getRoundPhase,
} from "./roundPhase";

const phase1EndsAt = 1_000;
const baseTurn = {
  eliminationWindowEndTimestamp: 0,
  endTimestamp: 1_100,
  finalistCount: 0,
  finalistRuleIds: [],
  startTimestamp: 0,
  status: "open" as const,
  turnDurationSeconds: 1_100,
  turnId: 9,
};

test("phase 1 permits approval votes for proposed rules", () => {
  const phase = getRoundPhase({ nowSeconds: 999, phase1EndsAt, turn: baseTurn });

  assert.equal(phase, "create_play");
  assert.equal(canVoteForRule({ phase, ruleId: 44, turn: baseTurn }), true);
  assert.equal(canVoteRuleOut({ phase, ruleId: 44, turn: baseTurn }), false);
});

test("shortlist selection blocks every vote after the phase-1 cutoff", () => {
  const phase = getRoundPhase({ nowSeconds: 1_001, phase1EndsAt, turn: baseTurn });

  assert.equal(phase, "shortlist_selection");
  assert.equal(canVoteForRule({ phase, ruleId: 44, turn: baseTurn }), false);
  assert.equal(canVoteRuleOut({ phase, ruleId: 44, turn: baseTurn }), false);
});

test("phase 2 permits votes only for the published on-chain finalists", () => {
  const turn = {
    ...baseTurn,
    eliminationWindowEndTimestamp: 1_100,
    finalistCount: 2,
    finalistRuleIds: [7, 11],
  };
  const phase = getRoundPhase({ nowSeconds: 1_050, phase1EndsAt, turn });

  assert.equal(phase, "shortlist_vote");
  assert.equal(canVoteForRule({ phase, ruleId: 7, turn }), true);
  assert.equal(canVoteRuleOut({ phase, ruleId: 7, turn }), true);
  assert.equal(canVoteForRule({ phase, ruleId: 44, turn }), false);
  assert.equal(canVoteRuleOut({ phase, ruleId: 44, turn }), false);
});

test("settlement blocks votes once the elimination window ends", () => {
  const turn = {
    ...baseTurn,
    eliminationWindowEndTimestamp: 1_050,
    finalistCount: 1,
    finalistRuleIds: [7],
  };
  const phase = getRoundPhase({ nowSeconds: 1_050, phase1EndsAt, turn });

  assert.equal(phase, "settling");
  assert.equal(canVoteForRule({ phase, ruleId: 7, turn }), false);
  assert.equal(canVoteRuleOut({ phase, ruleId: 7, turn }), false);
});
