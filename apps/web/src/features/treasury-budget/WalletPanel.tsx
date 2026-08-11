"use client";

import type { useWalletConnection } from "@solana/react-hooks";

import { shortAddress } from "./shared";

type WalletConnection = ReturnType<typeof useWalletConnection>;

export function WalletPanel({
  busy,
  connection,
  error,
  memberLabel,
}: {
  busy: boolean;
  connection: WalletConnection;
  error: (message: string) => void;
  memberLabel: string | null;
}) {
  const { connect, connected, connecting, connectors, disconnect, isReady, wallet } = connection;
  const walletAddress = wallet?.account.address.toString() ?? "";
  return (
    <section className="tm-card" aria-labelledby="treasury-wallet-title">
      <div className="tm-section-heading">
        <div>
          <p className="tm-eyebrow">Authorized wallet</p>
          <h2 id="treasury-wallet-title">Connect a multisig member</h2>
        </div>
        <span className={`tm-status${memberLabel ? " tm-status-ready" : ""}`}>
          {memberLabel ?? "Required"}
        </span>
      </div>
      {!isReady ? <p className="tm-muted">Detecting wallets...</p> : null}
      {isReady && !connected ? (
        <div className="tb-connectors">
          {connectors.length ? connectors.map((connector) => (
            <button
              className="tm-button tm-button-secondary"
              disabled={connecting || busy}
              key={connector.id}
              onClick={() => void connect(connector.id).catch((connectError) => error(String(connectError)))}
              type="button"
            >
              {connecting ? "Connecting..." : `Connect ${connector.name}`}
            </button>
          )) : <p className="tm-error">No Wallet Standard wallet was detected.</p>}
        </div>
      ) : null}
      {connected && walletAddress ? (
        <div className="tm-wallet-row">
          <div>
            <span>{memberLabel ?? "Unknown account"} via {wallet?.connector.name}</span>
            <code title={walletAddress}>{shortAddress(walletAddress)}</code>
          </div>
          <button className="tm-button tm-button-secondary" disabled={busy} onClick={() => void disconnect()} type="button">
            Disconnect
          </button>
        </div>
      ) : null}
      {connected && !memberLabel ? (
        <p className="tm-error">This account is not a member of the configured devnet multisig.</p>
      ) : null}
    </section>
  );
}
