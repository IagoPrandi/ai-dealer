export interface WebSecurityHeaderOptions {
  apiUrl?: string | undefined;
  rpcUrl: string | undefined;
  workerUrl?: string | undefined;
}

function resolveOptionalHttpOrigin(
  value: string | undefined,
  variableName: string,
): string[] {
  const normalizedValue = value?.trim();
  if (!normalizedValue) {
    return [];
  }

  // `/__api` and `/__worker` are explicit same-origin proxy overrides. They
  // are already covered by `'self'` and must not be parsed as external URLs.
  if (normalizedValue.startsWith("/")) {
    return [];
  }

  const url = new URL(normalizedValue);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${variableName} must use HTTP or HTTPS.`);
  }

  return [url.origin];
}

function resolveSolanaRpcSources(rpcUrl: string | undefined): string[] {
  if (!rpcUrl?.trim()) {
    throw new Error(
      "NEXT_PUBLIC_SOLANA_RPC_URL must be configured. Tyche will not fall back to the rate-limited public Solana RPC.",
    );
  }

  const url = new URL(rpcUrl);
  if (url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_SOLANA_RPC_URL must use HTTPS.");
  }

  const websocketUrl = new URL(url);
  websocketUrl.protocol = "wss:";
  return [url.origin, websocketUrl.origin];
}

/**
 * Builds the response headers for every player-web route. Query parameters,
 * including an RPC API key, are deliberately reduced to origins before being
 * emitted in the browser-visible CSP header.
 */
export function createWebSecurityHeaders({
  apiUrl,
  rpcUrl,
  workerUrl,
}: WebSecurityHeaderOptions) {
  const connectSources = [
    "'self'",
    "https://auth.privy.io",
    "wss://relay.walletconnect.com",
    "wss://relay.walletconnect.org",
    "wss://www.walletlink.org",
    "https://*.rpc.privy.systems",
    "https://explorer-api.walletconnect.com",
    ...resolveSolanaRpcSources(rpcUrl),
    ...resolveOptionalHttpOrigin(apiUrl, "NEXT_PUBLIC_TYCHE_API_URL"),
    ...resolveOptionalHttpOrigin(workerUrl, "NEXT_PUBLIC_TYCHE_WORKER_URL"),
  ];
  const csp = [
    "default-src 'self'",
    "script-src 'self' https://challenges.cloudflare.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "child-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
    "frame-src https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org https://challenges.cloudflare.com",
    `connect-src ${[...new Set(connectSources)].join(" ")}`,
    "worker-src 'self'",
    "manifest-src 'self'",
  ].join("; ");

  return [
    { key: "Content-Security-Policy", value: csp },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), geolocation=(), microphone=()",
    },
  ];
}
