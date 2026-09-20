"use client";

/** Wallet-connect bottom sheet. Replaces the standalone /play/wallet flow. */
import { BRAND_NAME } from "@tyche/config";

import { Dealer, Ico } from "../shared";

interface Connector {
  icon?: string | undefined;
  id: string;
  name: string;
}

export function ConnectOverlay({
  connecting,
  connectors,
  emailOnboardingAvailable,
  error,
  onClose,
  onConnect,
  onEmailLogin,
}: {
  connecting: boolean;
  connectors: readonly Connector[];
  emailOnboardingAvailable: boolean;
  error?: null | string;
  onClose: () => void;
  onConnect: (id: string) => void;
  onEmailLogin: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="ide-overlay is-sheet"
      style={{
        position: "absolute", inset: 0, zIndex: 70, display: "flex",
        background: "rgba(6,4,10,0.62)", backdropFilter: "blur(6px)", animation: "ide-rise .2s ease both",
      }}
    >
      <div
        aria-labelledby="wallet-dialog-title"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
        className="ide-scroll ide-overlay-card is-connect"
        role="dialog"
        style={{
          width: "100%", maxHeight: "90%", overflowY: "auto",
          background: "var(--bg-2)", borderTopLeftRadius: 28, borderTopRightRadius: 28,
          border: "1px solid var(--line-2)", borderBottom: "none",
          padding: "10px 20px 28px", animation: "ide-rise .32s cubic-bezier(.2,.8,.3,1) both",
        }}
      >
        <div style={{ width: 40, height: 5, borderRadius: 3, background: "var(--line-2)", margin: "0 auto 18px" }} />
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 8 }}>
          <Dealer size={34} />
          <div style={{ flex: 1 }}>
            <h2 id="wallet-dialog-title" style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>Choose how to play</h2>
            <p style={{ margin: "2px 0 0", fontSize: 13, color: "var(--muted)" }}>Solana devnet · every action is approved by your wallet.</p>
          </div>
          <button aria-label="Close wallet dialog" onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--muted)", borderRadius: 12, padding: 7, display: "grid", placeItems: "center", cursor: "pointer" }} type="button">
            <Ico.close />
          </button>
        </div>

        {error ? (
          <div className="ide-card" style={{ padding: "11px 14px", marginTop: 14, borderColor: "rgba(255,59,47,0.3)", color: "var(--red)", fontSize: 13 }}>
            {error}
          </div>
        ) : null}

        <div style={{ display: "grid", gap: 9, marginTop: 14 }}>
          {emailOnboardingAvailable ? (
            <button
              onClick={onEmailLogin}
              className="ide-card ide-tap"
              style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", textAlign: "left", color: "var(--text)", cursor: "pointer" }}
              type="button"
            >
              <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--purple)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                <Ico.user style={{ color: "var(--on-accent)" }} />
              </span>
              <span style={{ flex: 1 }}>
                <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>Continue with email</span>
                <span style={{ display: "block", marginTop: 2, fontSize: 12.5, color: "var(--muted)" }}>Use a one-time code. Gmail and any email address work.</span>
              </span>
              <span style={{ fontSize: 12.5, color: "var(--dim)" }}>OTP</span>
            </button>
          ) : null}
          {emailOnboardingAvailable ? (
            <div className="ide-num" style={{ color: "var(--dim)", fontSize: 10.5, letterSpacing: "0.14em", margin: "6px 0 0", textTransform: "uppercase" }}>
              Or use an external wallet
            </div>
          ) : null}
          {connectors.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
              No compatible external wallet was detected. Open {BRAND_NAME} inside a Solana wallet&apos;s browser (Phantom, Backpack, Solflare) or install a Wallet Standard wallet.
            </p>
          ) : (
            connectors.map((connector) => (
              <button
                key={connector.id}
                onClick={() => onConnect(connector.id)}
                disabled={connecting}
                className="ide-card ide-tap"
                style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 15px", textAlign: "left", color: "var(--text)", cursor: "pointer", opacity: connecting ? 0.6 : 1 }}
                type="button"
              >
                <span style={{ width: 38, height: 38, borderRadius: 11, background: "var(--surface-2)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                  {connector.icon ? (
                    // Wallet Standard icons are trusted connector metadata.
                    <img alt="" height="22" src={connector.icon} width="22" />
                  ) : (
                    <Ico.wallet style={{ color: "var(--purple-soft)" }} />
                  )}
                </span>
                <span style={{ flex: 1, fontWeight: 700, fontSize: 15 }}>{connector.name}</span>
                <span style={{ fontSize: 12.5, color: "var(--dim)" }}>{connecting ? "connecting…" : "connect"}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
