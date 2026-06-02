import { getTurnDurationHours } from "@idealer/game-engine";

export function getWorkerStatus() {
  return {
    service: "worker",
    status: "idle",
    firstTurnDurationHours: getTurnDurationHours(0)
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(JSON.stringify(getWorkerStatus()));
}
