"use client";

import { useState } from "react";
import {
  createDefaultAuthorizationCache,
  createDefaultChainSelector,
  createDefaultWalletNotFoundHandler,
  registerMwa,
} from "@solana-mobile/wallet-standard-mobile";
import { autoDiscover, createClient } from "@solana/client";
import { SolanaProvider } from "@solana/react-hooks";

import { isSupportedIdealerWallet } from "./walletDiscovery";

const DEVNET_RPC_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_RPC_URL ?? "https://api.devnet.solana.com";
const DEVNET_WEBSOCKET_ENDPOINT =
  process.env.NEXT_PUBLIC_SOLANA_WS_URL ?? "wss://api.devnet.solana.com";
const DEVNET_CHAIN = "solana:devnet";
const MWA_REGISTRATION_KEY = "__idealerMwaRegistered";

function registerMobileWalletAdapter() {
  if (typeof window === "undefined") {
    return;
  }

  const registrationState = window as unknown as Record<string, unknown>;
  if (registrationState[MWA_REGISTRATION_KEY]) {
    return;
  }

  registrationState[MWA_REGISTRATION_KEY] = true;
  registerMwa({
    appIdentity: {
      name: "Idealer",
      uri: window.location.origin,
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: [DEVNET_CHAIN],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
    remoteHostAuthority: window.location.host,
  });
}

function createIdealerSolanaClient() {
  registerMobileWalletAdapter();

  return createClient({
    commitment: "confirmed",
    endpoint: DEVNET_RPC_ENDPOINT,
    walletConnectors: autoDiscover({
      filter: isSupportedIdealerWallet,
      overrides: () => ({
        defaultChain: DEVNET_CHAIN,
      }),
    }),
    websocketEndpoint: DEVNET_WEBSOCKET_ENDPOINT,
  });
}

export function SolanaProviders({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [client] = useState(createIdealerSolanaClient);

  return (
    <SolanaProvider
      client={client}
      query={{
        config: { revalidateOnFocus: true, revalidateOnReconnect: true },
      }}
      walletPersistence={{
        autoConnect: true,
        storage: typeof window === "undefined" ? null : window.localStorage,
        storageKey: "idealer.solana.wallet",
      }}
    >
      {children}
    </SolanaProvider>
  );
}
