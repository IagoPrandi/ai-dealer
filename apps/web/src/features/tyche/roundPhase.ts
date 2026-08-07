import type { TurnStateSnapshot } from "../../solana/tycheProgram";

/**
 * The on-chain TurnState is authoritative for player-action phases. API
 * projections can lag settlement and must not decide whether a vote is valid.
 */
export type RoundPhase =
  | "closed"
  | "create_play"
  | "settling"
  | "shortlist_selection"
  | "shortlist_vote"
  | "unavailable";

export function getTurnEndTimestamp(turn: TurnStateSnapshot) {
  return turn.startTimestamp + turn.turnDurationSeconds;
}

export function getRoundPhase({
  nowSeconds,
  phase1EndsAt,
  turn,
}: {
  nowSeconds: number;
  phase1EndsAt: null | number;
  turn: null | TurnStateSnapshot;
}): RoundPhase {
  if (!turn || phase1EndsAt === null) {
    return "unavailable";
  }
  if (turn.status !== "open") {
    return "closed";
  }
  if (nowSeconds < phase1EndsAt) {
    return "create_play";
  }
  if (turn.finalistCount === 0 || turn.eliminationWindowEndTimestamp <= 0) {
    return nowSeconds < getTurnEndTimestamp(turn)
      ? "shortlist_selection"
      : "settling";
  }
  if (
    nowSeconds < Math.min(
      turn.eliminationWindowEndTimestamp,
      getTurnEndTimestamp(turn),
    )
  ) {
    return "shortlist_vote";
  }
  return "settling";
}

export function canVoteForRule({
  phase,
  ruleId,
  turn,
}: {
  phase: RoundPhase;
  ruleId: number;
  turn: null | TurnStateSnapshot;
}) {
  return phase === "create_play" || (
    phase === "shortlist_vote" &&
    Boolean(turn?.finalistRuleIds.includes(ruleId))
  );
}

export function canVoteRuleOut({
  phase,
  ruleId,
  turn,
}: {
  phase: RoundPhase;
  ruleId: number;
  turn: null | TurnStateSnapshot;
}) {
  return phase === "shortlist_vote" && Boolean(turn?.finalistRuleIds.includes(ruleId));
}
