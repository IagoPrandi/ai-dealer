export interface PublicSolanaConfig {
  endpoint: string;
  websocketEndpoint: string;
}

export function resolvePublicSolanaConfig({
  rpcEndpoint,
}: {
  rpcEndpoint: string | undefined;
}): PublicSolanaConfig {
  if (!rpcEndpoint) {
    throw new Error(
      "NEXT_PUBLIC_SOLANA_RPC_URL must be configured. Tyche will not fall back to the rate-limited public Solana RPC.",
    );
  }
  const rpcUrl = new URL(rpcEndpoint);
  if (rpcUrl.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL must use HTTPS.");
  }

  // Helius exposes RPC and WebSocket traffic through the same endpoint. Derive
  // WSS from the canonical RPC URL so the provider host and API key cannot
  // drift independently.
  const websocketUrl = new URL(rpcUrl);
  websocketUrl.protocol = "wss:";

  return {
    endpoint: rpcUrl.toString(),
    websocketEndpoint: websocketUrl.toString(),
  };
}
