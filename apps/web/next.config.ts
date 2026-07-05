import path from "node:path";

import type { NextConfig } from "next";

// Modo galeria de UI: ligado ao rodar `pnpm dev:mock` (npm_lifecycle_event) ou
// definindo NEXT_PUBLIC_UI_MOCK=1 manualmente. Nunca liga em build de produção.
const mockEnabled =
  process.env.npm_lifecycle_event === "dev:mock" ||
  process.env.NEXT_PUBLIC_UI_MOCK === "1";

// Same-origin proxy to the API (apps/api, default :3002). Lets the DApp reach
// the API from any origin the browser is served on — notably an HTTPS tunnel
// used to install the PWA on a phone — without mixed-content or CORS problems.
const apiProxyTarget = process.env.IDEALER_API_PROXY_TARGET ?? "http://localhost:3002";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_UI_MOCK: mockEnabled ? "1" : "0",
  },
  async rewrites() {
    return [
      {
        source: "/__api/:path*",
        destination: `${apiProxyTarget}/:path*`,
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
