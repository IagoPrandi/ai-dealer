"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  createWalletStandardConnector,
} from "@solana/client";
import { useWalletConnection } from "@solana/react-hooks";
import { PrivyProvider, usePrivy } from "@privy-io/react-auth";
import {
  useWallets as usePrivySolanaWallets,
  type ConnectedStandardSolanaWallet,
} from "@privy-io/react-auth/solana";

import { resolvePrivyAppId } from "./privyConfig";
import { resolvePlayerWalletSource } from "./playerWalletSelection";

export type PlayerWalletSource = "embedded" | "external";
export type PlayerWallet = NonNullable<ReturnType<typeof useWalletConnection>["wallet"]>;

interface PlayerWalletContextValue {
  connectExternal: (connectorId: string) => Promise<void>;
  connected: boolean;
  connecting: boolean;
  connectors: ReturnType<typeof useWalletConnection>["connectors"];
  emailOnboardingAvailable: boolean;
  emailSignedIn: boolean;
  emailWalletError: string | null;
  logoutEmail: () => Promise<void>;
  requestEmailLogin: () => void;
  selectEmbeddedWallet: () => void;
  source: PlayerWalletSource | null;
  wallet: PlayerWallet | null;
  walletAddress: string | undefined;
}

const PlayerWalletContext = createContext<PlayerWalletContextValue | null>(null);

async function connectEmbeddedWallet(
  wallet: ConnectedStandardSolanaWallet,
): Promise<PlayerWallet> {
  // This uses the exported Wallet Standard connector used for external
  // wallets. Privy owns the embedded signer; this adapter only translates its
  // standard interface into Tyche's existing transaction session shape.
  const connector = createWalletStandardConnector(
    wallet.standardWallet as Parameters<typeof createWalletStandardConnector>[0],
    {
      canAutoConnect: false,
      defaultChain: "solana:devnet",
      id: "privy:embedded-solana",
      kind: "embedded",
      name: "Email wallet",
    },
  );
  // Privy's SDK brings its own Solana package graph, so TypeScript sees two
  // nominal copies of the otherwise identical WalletSession type. The adapter
  // above produces the exact Wallet Standard session contract expected by
  // @solana/react-hooks; this is a type-boundary cast, not a runtime fallback.
  return (await connector.connect()) as unknown as PlayerWallet;
}

function ExternalOnlyPlayerWalletProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const external = useWalletConnection();
  const wallet = external.wallet ?? null;
  const value = useMemo<PlayerWalletContextValue>(
    () => ({
      connectExternal: async (connectorId) => {
        await external.connect(connectorId);
      },
      connected: external.connected,
      connecting: external.connecting,
      connectors: external.connectors,
      emailOnboardingAvailable: false,
      emailSignedIn: false,
      emailWalletError: null,
      logoutEmail: async () => {},
      requestEmailLogin: () => {},
      selectEmbeddedWallet: () => {},
      source: wallet ? "external" : null,
      wallet,
      walletAddress: wallet?.account.address.toString(),
    }),
    [external.connect, external.connected, external.connecting, external.connectors, wallet],
  );

  return (
    <PlayerWalletContext.Provider value={value}>
      {children}
    </PlayerWalletContext.Provider>
  );
}

function PrivyPlayerWalletProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const external = useWalletConnection();
  const { authenticated, login, logout, ready } = usePrivy();
  const { ready: embeddedWalletsReady, wallets } = usePrivySolanaWallets();
  const [preferredSource, setPreferredSource] = useState<PlayerWalletSource | null>(
    null,
  );
  const [embeddedSession, setEmbeddedSession] = useState<PlayerWallet | null>(null);
  const [embeddedWalletError, setEmbeddedWalletError] = useState<string | null>(null);
  const embeddedWallet = wallets[0];

  useEffect(() => {
    let active = true;
    if (!embeddedWallet) {
      setEmbeddedSession(null);
      setEmbeddedWalletError(null);
      return () => {
        active = false;
      };
    }
    setEmbeddedSession(null);
    setEmbeddedWalletError(null);
    void connectEmbeddedWallet(embeddedWallet)
      .then((session) => {
        if (active) setEmbeddedSession(session);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        setEmbeddedWalletError(
          cause instanceof Error
            ? `The email wallet could not connect: ${cause.message}`
            : "The email wallet could not connect. Please try signing in again.",
        );
      });
    return () => {
      active = false;
    };
  }, [embeddedWallet]);

  useEffect(() => {
    if (!authenticated) {
      setPreferredSource(null);
    }
  }, [authenticated]);

  const source = resolvePlayerWalletSource({
    embeddedAvailable: embeddedSession !== null,
    externalAvailable: Boolean(external.wallet),
    preferredSource,
  });
  const wallet = source === "external" ? external.wallet ?? null : embeddedSession;

  const value = useMemo<PlayerWalletContextValue>(
    () => ({
      connectExternal: async (connectorId) => {
        await external.connect(connectorId);
        setPreferredSource("external");
      },
      connected: wallet !== null,
      connecting:
        external.connecting ||
        (preferredSource === "embedded" &&
          (!ready || (authenticated && !embeddedWalletsReady))),
      connectors: external.connectors,
      emailOnboardingAvailable: true,
      emailSignedIn: authenticated,
      emailWalletError: embeddedWalletError,
      logoutEmail: async () => {
        await logout();
        setPreferredSource(external.wallet ? "external" : null);
      },
      requestEmailLogin: () => {
        setPreferredSource("embedded");
        login();
      },
      selectEmbeddedWallet: () => setPreferredSource("embedded"),
      source,
      wallet,
      walletAddress: wallet?.account.address.toString(),
    }),
    [
      authenticated,
      embeddedWalletsReady,
      embeddedWalletError,
      external.connect,
      external.connecting,
      external.connectors,
      external.wallet,
      login,
      logout,
      ready,
      preferredSource,
      source,
      wallet,
    ],
  );

  return (
    <PlayerWalletContext.Provider value={value}>
      {children}
    </PlayerWalletContext.Provider>
  );
}

export function PlayerWalletProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const appId = resolvePrivyAppId({
    appId: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
    deploymentEnvironment: process.env.VERCEL_ENV,
    nodeEnvironment: process.env.NODE_ENV,
  });

  if (!appId) {
    return <ExternalOnlyPlayerWalletProvider>{children}</ExternalOnlyPlayerWalletProvider>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        embeddedWallets: {
          solana: { createOnLogin: "all-users" },
        },
        loginMethods: ["email"],
      }}
    >
      <PrivyPlayerWalletProvider>{children}</PrivyPlayerWalletProvider>
    </PrivyProvider>
  );
}

export function usePlayerWallet(): PlayerWalletContextValue {
  const context = useContext(PlayerWalletContext);
  if (!context) {
    throw new Error("usePlayerWallet must be used within PlayerWalletProvider.");
  }
  return context;
}
