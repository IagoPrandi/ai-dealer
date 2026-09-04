/**
 * Substituto de "@solana/react-hooks" no modo galeria (NEXT_PUBLIC_UI_MOCK=1).
 *
 * O next.config.ts faz o alias deste arquivo no lugar do pacote real quando o
 * flag está ligado. Assim TODAS as telas enxergam uma carteira conectada e um
 * client falso, sem nenhuma chamada de rede — ideal para validar a UI.
 *
 * Importante: este arquivo NÃO pode importar "@solana/react-hooks" (o alias
 * causaria um ciclo). Ele só depende do client falso local.
 */
import type { ReactNode } from "react";

import { mockSolanaClient } from "./mockClient";
import { MOCK_WALLET_ADDRESS } from "./mockData";
import { installMockFetch } from "./mockFetch";

// Este módulo só existe quando o alias de mock está ativo, então instalar aqui
// dá dados canned a QUALQUER rota (/play, /rounds, ...), não só /dev/gallery —
// que é o que permite validar o shell web real sem backend. installMockFetch é
// idempotente, logo a instalação explícita da galeria continua válida.
if (typeof window !== "undefined") {
  installMockFetch();
}

const mockWallet = {
  account: {
    address: {
      toString: () => MOCK_WALLET_ADDRESS,
    },
  },
};

const mockConnectors = [
  { icon: undefined as string | undefined, id: "mock-phantom", name: "Phantom" },
];

export function SolanaProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export function useSolanaClient() {
  return mockSolanaClient;
}

export function useWalletConnection() {
  return {
    connect: async () => {},
    connecting: false,
    connectionError: null,
    connectors: mockConnectors,
    connected: true,
    currentConnector: { name: "Phantom" },
    disconnect: async () => {},
    error: null,
    isReady: true,
    status: "connected" as const,
    wallet: mockWallet,
  };
}

export function useWaitForSignature() {
  return {
    isError: false,
    isSuccess: false,
    waitError: null,
  };
}
