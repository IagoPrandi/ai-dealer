import path from "node:path";

import type { NextConfig } from "next";

// Modo galeria de UI: ligado ao rodar `pnpm dev:mock` (npm_lifecycle_event) ou
// definindo NEXT_PUBLIC_UI_MOCK=1 manualmente. Nunca liga em build de produção.
const mockEnabled =
  process.env.npm_lifecycle_event === "dev:mock" ||
  process.env.NEXT_PUBLIC_UI_MOCK === "1";

const nextConfig: NextConfig = {
  env: {
    NEXT_PUBLIC_UI_MOCK: mockEnabled ? "1" : "0",
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
