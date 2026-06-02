import type { TurnId } from "@idealer/types";

export interface IdealerSdkConfig {
  apiBaseUrl: string;
}

export function createTurnPath(turnId: TurnId): string {
  return `/api/v1/turns/${turnId.value}`;
}
