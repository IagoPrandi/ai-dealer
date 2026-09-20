"use client";

/** Wallet-connect bottom sheet. Replaces the standalone /play/wallet flow. */
import { BRAND_NAME } from "@tyche/config";

import { Ico } from "../shared";

interface Connector {
  icon?: string | undefined;
  id: string;
  name: string;
}

export function ConnectOverlay({
  connecting,
  connectors,
  emailOnboardingAvailable,
  emailSignedIn,
  error,
  onClose,
  onConnect,
  onEmailLogin,
  onSelectEmailWallet,
}: {
  connecting: boolean;
  connectors: readonly Connector[];
  emailOnboardingAvailable: boolean;
  emailSignedIn: boolean;
  error?: null | string;
  onClose: () => void;
  onConnect: (id: string) => void;
  onEmailLogin: () => void;
  onSelectEmailWallet: () => void;
}) {
  return (
    <div
      className="ide-overlay is-sheet ide-connect-overlay"
      onClick={onClose}
      style={{ position: "absolute", inset: 0, zIndex: 70, display: "flex" }}
    >
      <div
        aria-labelledby="wallet-dialog-title"
        aria-modal="true"
        className="ide-scroll ide-overlay-card is-connect ide-connect-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="ide-connect-handle" />
        <div className="ide-connect-header">
          <div className="ide-connect-header-copy">
            <h2 className="ide-connect-title" id="wallet-dialog-title">Choose how to play</h2>
            <p className="ide-connect-subtitle">Solana devnet · every action is approved by your wallet.</p>
          </div>
          <button aria-label="Close wallet dialog" className="ide-connect-close" onClick={onClose} type="button">
            <Ico.close />
          </button>
        </div>

        {error ? <div className="ide-connect-error">{error}</div> : null}

        <div className="ide-connect-options">
          {emailOnboardingAvailable ? (
            <button
              className="ide-connect-row ide-tap is-featured"
              onClick={emailSignedIn ? onSelectEmailWallet : onEmailLogin}
              type="button"
            >
              <span className="ide-connect-icon"><Ico.user /></span>
              <span className="ide-connect-row-copy">
                <span className="ide-connect-row-title">
                  {emailSignedIn ? "Use email wallet" : "Continue with email"}
                </span>
                <span className="ide-connect-row-description">
                  {emailSignedIn
                    ? "Switch to the Solana wallet created for your email account."
                    : "Use a one-time code. Gmail and any email address work."}
                </span>
              </span>
              <span className="ide-connect-row-action">{emailSignedIn ? "switch" : "OTP"}</span>
            </button>
          ) : null}

          {emailOnboardingAvailable ? <div className="ide-connect-divider">Or use an external wallet</div> : null}

          {connectors.length === 0 ? (
            <p className="ide-connect-empty">
              No compatible external wallet was detected. Open {BRAND_NAME} inside a Solana wallet&apos;s browser (Phantom, Backpack, Solflare) or install a Wallet Standard wallet.
            </p>
          ) : (
            connectors.map((connector) => (
              <button
                className="ide-connect-row ide-tap"
                disabled={connecting}
                key={connector.id}
                onClick={() => onConnect(connector.id)}
                style={{ opacity: connecting ? 0.6 : 1 }}
                type="button"
              >
                <span className="ide-connect-icon">
                  {connector.icon ? (
                    // Wallet Standard icons are trusted connector metadata.
                    <img alt="" height="22" src={connector.icon} width="22" />
                  ) : (
                    <Ico.wallet />
                  )}
                </span>
                <span className="ide-connect-row-copy">
                  <span className="ide-connect-row-title">{connector.name}</span>
                </span>
                <span className="ide-connect-row-action">{connecting ? "connecting…" : "connect"}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
