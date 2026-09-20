import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

import { loadWorkspaceEnvironment } from "./src/config/workspaceEnv";
import { createWebSecurityHeaders } from "./src/config/securityHeaders";

const webAppRoot = path.dirname(fileURLToPath(import.meta.url));
loadWorkspaceEnvironment(path.resolve(webAppRoot, "../.."));

// Modo galeria de UI: ligado ao rodar `pnpm dev:mock` (npm_lifecycle_event) ou
// definindo NEXT_PUBLIC_UI_MOCK=1 manualmente. Nunca liga em build de produção.
const mockEnabled =
  process.env.npm_lifecycle_event === "dev:mock" ||
  process.env.NEXT_PUBLIC_UI_MOCK === "1";

// Legacy /__api requests are routed to the App Router proxy, which forwards
// long-running compiler calls to apps/api without the rewrite proxy timeout.

// Same-origin proxy to the worker (apps/worker, default :3003). Mirrors the API
// proxy so the DApp can read live turn status from any origin the browser is
// served on — notably an HTTPS Cloudflare tunnel used to install the PWA on a
// phone — without mixed-content or CORS problems.
const workerProxyTarget =
  process.env.TYCHE_WORKER_PROXY_TARGET?.trim() ||
  (process.env.VERCEL_ENV === "production"
    ? (() => {
        throw new Error("TYCHE_WORKER_PROXY_TARGET is required in production.");
      })()
    : "http://localhost:3003");

const securityHeaders = createWebSecurityHeaders({
  apiUrl: process.env.NEXT_PUBLIC_TYCHE_API_URL,
  isDevelopment: process.env.NODE_ENV === "development",
  rpcUrl: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
  workerUrl: process.env.NEXT_PUBLIC_TYCHE_WORKER_URL,
});

const nextConfig: NextConfig = {
  output: "standalone",
  // Quick Tunnels use a random trusted hostname on every run. Allow that
  // development-only origin so React assets and the HMR WebSocket can hydrate
  // an installed PWA reached through `pnpm --filter @tyche/web dev:tunnel`.
  allowedDevOrigins: ["*.trycloudflare.com"],
  env: {
    NEXT_PUBLIC_UI_MOCK: mockEnabled ? "1" : "0",
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
  async rewrites() {
    return [
      {
        source: "/__api/:path*",
        destination: "/api/proxy/:path*",
      },
      {
        source: "/__worker/:path*",
        destination: `${workerProxyTarget}/:path*`,
      },
    ];
  },
  webpack: (config) => {
    if (mockEnabled) {
      config.resolve = config.resolve ?? {};
      config.resolve.alias = {
        ...(config.resolve.alias ?? {}),
        // Troca os hooks reais por mocks (carteira conectada + client falso).
        "@solana/react-hooks": path.resolve(
          process.cwd(),
          "src/dev/mock/solanaReactHooks.tsx",
        ),
      };
    }
    return config;
  },
};

export default nextConfig;
