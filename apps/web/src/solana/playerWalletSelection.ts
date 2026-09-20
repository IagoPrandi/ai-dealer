import type { PlayerWalletSource } from "./PlayerWalletProvider";

/**
 * External wallets are selected only after the player chose one in this page
 * session. Otherwise a signed-in email player keeps their embedded wallet.
 */
export function resolvePlayerWalletSource({
  embeddedAvailable,
  externalAvailable,
  preferredSource,
}: {
  embeddedAvailable: boolean;
  externalAvailable: boolean;
  preferredSource: PlayerWalletSource | null;
}): PlayerWalletSource | null {
  if (externalAvailable && preferredSource === "external") return "external";
  if (embeddedAvailable && preferredSource === "embedded") return "embedded";
  if (externalAvailable) return "external";
  if (embeddedAvailable) return "embedded";
  return null;
}
