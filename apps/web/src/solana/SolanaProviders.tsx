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
import { BRAND_NAME } from "@tyche/config";

import { resolvePublicSolanaConfig } from "./publicRpcConfig";
import { PlayerWalletProvider } from "./PlayerWalletProvider";
import { isSupportedTycheWallet } from "./walletDiscovery";

const {
  endpoint: DEVNET_RPC_ENDPOINT,
  websocketEndpoint: DEVNET_WEBSOCKET_ENDPOINT,
} = resolvePublicSolanaConfig({
  rpcEndpoint: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
});
const DEVNET_CHAIN = "solana:devnet";
const MWA_REGISTRATION_KEY = "__tycheMwaRegistered";

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
      name: BRAND_NAME,
      uri: window.location.origin,
    },
    authorizationCache: createDefaultAuthorizationCache(),
    chains: [DEVNET_CHAIN],
    chainSelector: createDefaultChainSelector(),
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
    remoteHostAuthority: window.location.host,
  });
}

function createTycheSolanaClient() {
  registerMobileWalletAdapter();

  return createClient({
    commitment: "confirmed",
    endpoint: DEVNET_RPC_ENDPOINT,
    walletConnectors: autoDiscover({
      filter: isSupportedTycheWallet,
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
  const [client] = useState(createTycheSolanaClient);

  return (
    <SolanaProvider
      client={client}
      query={{
        config: { revalidateOnFocus: true, revalidateOnReconnect: true },
      }}
      walletPersistence={{
        autoConnect: true,
        storage: typeof window === "undefined" ? null : window.localStorage,
        storageKey: "tyche.solana.wallet",
      }}
    >
      <PlayerWalletProvider>{children}</PlayerWalletProvider>
    </SolanaProvider>
  );
}
