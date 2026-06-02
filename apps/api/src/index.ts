import { TURN_DURATION_CYCLE_HOURS } from "@idealer/constants";

export function getHealth() {
  return {
    service: "api",
    status: "ok",
    turnDurationCycleHours: TURN_DURATION_CYCLE_HOURS
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(getHealth()));
}
