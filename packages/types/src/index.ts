export type WalletAddress = string;

export interface TurnId {
  value: string;
}

export interface NumberSequence {
  values: readonly [number, number, number, number, number, number];
}

export interface RuleSummary {
  id: string;
  title: string;
  creatorWallet: WalletAddress;
  status: "draft" | "eligible" | "frozen" | "active" | "expired";
}
