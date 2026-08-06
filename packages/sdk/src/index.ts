import type { TurnId } from "@tyche/types";

export interface TycheSdkConfig {
  apiBaseUrl: string;
}

export function createTurnPath(turnId: TurnId): string {
  return `/api/v1/turns/${turnId.value}`;
}
