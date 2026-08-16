"use client";

import { useTyche } from "../context";
import { fmtSol, fmtTurnId, lamportsToSol } from "../data/format";
import { usePlayerGuesses } from "../data/hooks";
import type { GuessReceiptApi } from "../data/types";
import { Dealer, Ico, ScreenHead, SectionLabel } from "../shared";

function GuessCard({
  index,
  receipt,
}: {
  index: number;
  receipt: GuessReceiptApi;
}) {
  const sequence = receipt.sequence ?? index + 1;
  const feeSol =
    receipt.feeLamports == null ? null : lamportsToSol(receipt.feeLamports);

  return (
    <div
      className="ide-card"
      style={{ display: "grid", gap: 10, padding: "11px 12px" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 9,
              background: "var(--surface-2)",
              color: "var(--purple-soft)",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            <Ico.dice
              style={{ color: "currentColor", width: 14, height: 14 }}
            />
          </span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.2 }}>
              Guess <span className="ide-num">#{sequence}</span>
            </div>
            {feeSol == null ? null : (
              <div
                style={{
                  color: "var(--dim)",
                  fontSize: 11.5,
                  lineHeight: 1.3,
                  marginTop: 1,
                }}
              >
                Entry fee{" "}
                <span className="ide-num" style={{ color: "var(--muted)" }}>
                  {feeSol === 0 ? "Free" : `${fmtSol(feeSol)} SOL`}
                </span>
              </div>
            )}
          </div>
        </div>
        <span
          className="ide-pill"
          style={{
            color: "var(--green)",
            padding: "3px 8px",
            fontSize: 11.5,
            gap: 5,
            flexShrink: 0,
          }}
        >
          <Ico.check style={{ color: "currentColor", width: 12, height: 12 }} />{" "}
          Confirmed
        </span>
      </div>

      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 5,
        }}
      >
        {receipt.numbers.map((number, numberIndex) => (
          <span
            className="ide-chip"
            key={`${sequence}-${number}-${numberIndex}`}
            style={{
              width: "clamp(30px, 8.4vw, 34px)",
              height: "clamp(30px, 8.4vw, 34px)",
              borderRadius: 11,
              fontSize: 13.5,
            }}
          >
            {number}
          </span>
        ))}
      </div>
    </div>
  );
}

export function GuessesScreen() {
  const { connect, entrySyncing, go, turnId, turnReadyToPlay, walletAddress } =
    useTyche();
  const { error, loading, receipts, reload } = usePlayerGuesses(
    turnId,
    walletAddress,
  );

  if (!walletAddress) {
    return (
      <div
        className="ide-app ide-screen"
        style={{ height: "100%", position: "relative", overflow: "hidden" }}
      >
        <div className="ide-ambient" />
        <div
          style={{
            position: "relative",
            zIndex: 1,
            height: "100%",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            padding: "0 28px",
          }}
        >
          <Dealer size={60} />
          <h2 style={{ fontSize: 23, fontWeight: 800, margin: "16px 0 8px" }}>
            Connect your wallet to see your guesses
          </h2>
          <p
            style={{
              color: "var(--muted)",
              fontSize: 15,
              lineHeight: 1.5,
              margin: "0 0 24px",
            }}
          >
            Your entries are linked to the wallet that submitted them.
          </p>
          <button
            className="ide-btn"
            onClick={connect}
            style={{ width: "100%", padding: 16 }}
            type="button"
          >
            <Ico.wallet style={{ color: "var(--on-accent)" }} /> Connect wallet
          </button>
          <button
            className="ide-btn-ghost ide-btn"
            onClick={() => go("home")}
            style={{ width: "100%", padding: 14, marginTop: 10 }}
            type="button"
          >
            Back to the round
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="ide-app ide-screen"
      style={{ height: "100%", position: "relative", overflow: "hidden" }}
    >
      <div className="ide-ambient" />
      <div
        className="ide-scroll"
        style={{
          position: "relative",
          zIndex: 1,
          height: "100%",
          overflowY: "auto",
          overflowX: "hidden",
          padding: "var(--ide-shell-content-top) 18px 36px",
        }}
      >
        <ScreenHead onBack={() => go("home")} title="My guesses" />

        <div
          style={{
            display: "flex",
            alignItems: "end",
            justifyContent: "space-between",
            gap: 12,
            margin: "2px 2px 16px",
          }}
        >
          <div>
            <SectionLabel>Current round</SectionLabel>
            <div
              className="ide-num"
              style={{ fontSize: 23, fontWeight: 800, marginTop: 3 }}
            >
              {fmtTurnId(turnId)}
            </div>
          </div>
          {!loading && !error ? (
            <span className="ide-pill" style={{ color: "var(--green)" }}>
              <span className="ide-num">{receipts.length}</span>{" "}
              {receipts.length === 1 ? "guess" : "guesses"}
            </span>
          ) : null}
        </div>

        {loading ? (
          <div
            style={{ display: "grid", gap: 10 }}
            aria-label="Loading guesses"
          >
            {[0, 1].map((item) => (
              <div className="ide-card" key={item} style={{ height: 88 }} />
            ))}
          </div>
        ) : error ? (
          <div
            className="ide-card"
            style={{
              padding: 18,
              borderColor: "var(--line-2)",
              textAlign: "center",
            }}
          >
            <Ico.clock style={{ color: "var(--red)", width: 24, height: 24 }} />
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 8 }}>
              Guesses unavailable
            </div>
            <p
              style={{
                color: "var(--muted)",
                fontSize: 13.5,
                lineHeight: 1.5,
                margin: "6px 0 14px",
              }}
            >
              {error}
            </p>
            <button
              className="ide-votebtn"
              onClick={reload}
              style={{ minHeight: 44, justifyContent: "center", width: "100%" }}
              type="button"
            >
              Try again
            </button>
          </div>
        ) : receipts.length > 0 ? (
          <div style={{ display: "grid", gap: 10 }}>
            {receipts.map((receipt, index) => (
              <GuessCard
                index={receipts.length - index - 1}
                key={`${receipt.sequence ?? index}-${receipt.signature}`}
                receipt={receipt}
              />
            ))}
          </div>
        ) : (
          <div
            className="ide-card"
            style={{ padding: 20, textAlign: "center" }}
          >
            <Ico.dice
              style={{
                color: entrySyncing ? "var(--yellow)" : "var(--purple-soft)",
                width: 28,
                height: 28,
              }}
            />
            <div style={{ fontSize: 15, fontWeight: 800, marginTop: 8 }}>
              {entrySyncing
                ? "Your guess is syncing"
                : "No guesses in this round"}
            </div>
            <p
              style={{
                color: "var(--muted)",
                fontSize: 13.5,
                lineHeight: 1.5,
                margin: "6px 0 0",
              }}
            >
              {entrySyncing
                ? "Your entry is confirmed on-chain. Its display details will appear here after indexing finishes."
                : "Submit a guess to join the current round."}
            </p>
          </div>
        )}

        <div
          style={{ display: "flex", justifyContent: "center", marginTop: 18 }}
        >
          <button
            className="ide-btn"
            disabled={!turnReadyToPlay}
            onClick={() => go("play")}
            style={{ padding: "14px 22px", opacity: turnReadyToPlay ? 1 : 0.5 }}
            type="button"
          >
            <Ico.dice style={{ color: "var(--on-accent)" }} />{" "}
            {receipts.length > 0 ? "Play again" : "Make a guess"}
          </button>
        </div>
      </div>
    </div>
  );
}
