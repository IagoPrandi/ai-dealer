import { TURN_DURATION_CYCLE_HOURS } from "@idealer/constants";

export function getTurnDurationHours(cycleIndex: number): number {
  const normalizedIndex = cycleIndex % TURN_DURATION_CYCLE_HOURS.length;
  return TURN_DURATION_CYCLE_HOURS[normalizedIndex] ?? TURN_DURATION_CYCLE_HOURS[0];
}

export function getNextTurnDurationHours(cycleIndex: number): number {
  return getTurnDurationHours(cycleIndex + 1);
}
