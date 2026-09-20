import assert from "node:assert/strict";
import { test } from "node:test";

import { createWebSecurityHeaders } from "./securityHeaders";

test("builds Privy-compatible CSP without leaking RPC query parameters", () => {
  const headers = createWebSecurityHeaders({
    apiUrl: "http://localhost:3002",
    rpcUrl: "https://devnet.helius-rpc.com/?api-key=not-for-headers",
    workerUrl: "http://localhost:3003",
  });
  const csp = headers.find(
    ({ key }) => key === "Content-Security-Policy",
  )?.value;

  assert.ok(csp);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /https:\/\/auth\.privy\.io/);
  assert.match(csp, /https:\/\/verify\.walletconnect\.com/);
  assert.match(csp, /wss:\/\/relay\.walletconnect\.com/);
  assert.match(csp, /https:\/\/devnet\.helius-rpc\.com/);
  assert.match(csp, /wss:\/\/devnet\.helius-rpc\.com/);
  assert.match(csp, /http:\/\/localhost:3002/);
  assert.doesNotMatch(csp, /not-for-headers/);
  assert.equal(
    headers.find(({ key }) => key === "X-Frame-Options")?.value,
    "DENY",
  );
});

test("requires a secure configured Solana RPC instead of adding a fallback", () => {
  assert.throws(
    () => createWebSecurityHeaders({ rpcUrl: undefined }),
    /NEXT_PUBLIC_SOLANA_RPC_URL must be configured/,
  );
  assert.throws(
    () => createWebSecurityHeaders({ rpcUrl: "http://localhost:8899" }),
    /NEXT_PUBLIC_SOLANA_RPC_URL must use HTTPS/,
  );
});

test("keeps explicit same-origin API proxies within self", () => {
  const headers = createWebSecurityHeaders({
    apiUrl: "/__api",
    rpcUrl: "https://devnet.helius-rpc.com/?api-key=test-key",
    workerUrl: "/__worker",
  });
  const csp = headers.find(
    ({ key }) => key === "Content-Security-Policy",
  )?.value;

  assert.ok(csp);
  assert.match(csp, /connect-src 'self'/);
  assert.doesNotMatch(csp, /__api|__worker/);
});

test("allows only the Next.js development script requirements in development", () => {
  const developmentHeaders = createWebSecurityHeaders({
    isDevelopment: true,
    rpcUrl: "https://devnet.helius-rpc.com",
  });
  const developmentCsp = developmentHeaders.find(
    ({ key }) => key === "Content-Security-Policy",
  )?.value;
  const productionHeaders = createWebSecurityHeaders({
    isDevelopment: false,
    rpcUrl: "https://devnet.helius-rpc.com",
  });
  const productionCsp = productionHeaders.find(
    ({ key }) => key === "Content-Security-Policy",
  )?.value;

  assert.match(
    developmentCsp ?? "",
    /script-src 'self' 'unsafe-inline' 'unsafe-eval'/,
  );
  assert.doesNotMatch(
    productionCsp ?? "",
    /script-src[^;]*'unsafe-inline'|script-src[^;]*'unsafe-eval'/,
  );
});
