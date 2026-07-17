import path from "node:path";

import type { NextConfig } from "next";

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
  process.env.IDEALER_WORKER_PROXY_TARGET ?? "http://localhost:3003";

const nextConfig: NextConfig = {
  // Quick Tunnels use a random trusted hostname on every run. Allow that
  // development-only origin so React assets and the HMR WebSocket can hydrate
  // an installed PWA reached through `pnpm --filter @idealer/web dev:tunnel`.
  allowedDevOrigins: ["*.trycloudflare.com"],
  env: {
    NEXT_PUBLIC_UI_MOCK: mockEnabled ? "1" : "0",
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
