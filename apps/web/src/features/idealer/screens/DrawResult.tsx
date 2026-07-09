"use client";

/**
 * DRAW RESULT POP-UP — full-screen overlay shown on the home screen when the
 * latest round's number draw settles. Covers the screen with the dark
 * translucent backdrop used by RuleDetail/ConnectOverlay and shows the drawn
 * numbers, the prize, the winner counts, and the elected rule. Dismissed with
 * the close button (or backdrop tap); the last seen turn is persisted so the
 * pop-up appears once per settled round.
 */
import { useEffect, useState } from "react";

import { useIdealer } from "../context";
import { fmtSol, fmtTurnId, lamportsToSol } from "../data/format";
import { useRound } from "../data/hooks";
import { Ico, SectionLabel } from "../shared";

const LAST_SEEN_TURN_KEY = "idealer:draw-result-last-seen-turn";

export function DrawResultPopup() {
  const { go, resultTurnId } = useIdealer();
  const { round } = useRound(resultTurnId);
  const [visible, setVisible] = useState(false);

  const draw = round?.draw?.drawResult ?? [];
  const drawSettled = round?.draw?.status === "fulfilled" && draw.length > 0;

  // Auto-open once per settled round; localStorage keeps it dismissed across
  // polls and reloads. Runs in an effect so SSR/hydration never touch storage.
  useEffect(() => {
    if (!drawSettled || resultTurnId <= 0) {
      setVisible(false);
      return;
    }
    const lastSeen = Number(window.localStorage.getItem(LAST_SEEN_TURN_KEY) ?? 0);
    setVisible(resultTurnId > lastSeen);
  }, [drawSettled, resultTurnId]);

  if (!visible || !round) {
    return null;
  }

  const dismiss = () => {
    window.localStorage.setItem(LAST_SEEN_TURN_KEY, String(resultTurnId));
    setVisible(false);
  };

  const activeRuleId = round.election?.activeRuleId ?? null;
  const electedRule = round.rules.find((r) => r.ruleId === activeRuleId) ?? null;
  const originalOnly = round.election?.status === "original_only";
  const prizeSol = round.pool.totalVisiblePrizePoolSol;
  const originalPoolSol = lamportsToSol(round.pool.accounting.buckets.original.totalLamports);
  const alternativePoolSol = lamportsToSol(round.pool.accounting.buckets.alternative.totalLamports);
  const winners = round.winners ?? null;
  const totalWinners = winners
    ? winners.original.winnerCount + winners.alternative.winnerCount
    : null;

  return (
    <div
      onClick={dismiss}
      style={{
        position: "absolute", inset: 0, zIndex: 70, display: "flex", alignItems: "center",
        padding: 18, background: "rgba(6,4,10,0.62)", backdropFilter: "blur(6px)",
        animation: "ide-rise .2s ease both",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="ide-scroll"
        style={{
          width: "100%", maxHeight: "90%", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
          background: "var(--bg-2)", border: "1px solid var(--line-2)", borderRadius: 24,
          padding: "18px 18px 20px", animation: "ide-rise .32s cubic-bezier(.2,.8,.3,1) both",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <span className="ide-pill" style={{ color: "var(--gold)", borderColor: "rgba(255,210,63,0.3)" }}>
            <Ico.trophy style={{ color: "var(--gold)", width: 14, height: 14 }} /> Round {fmtTurnId(resultTurnId)} settled
          </span>
          <button
            onClick={dismiss}
            aria-label="Close result"
            style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--muted)", borderRadius: 12, padding: 7, display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}
            type="button"
          >
            <Ico.close />
          </button>
        </div>

        <h2 style={{ margin: "0 0 14px", fontSize: 24, fontWeight: 800, letterSpacing: "-0.02em" }}>The numbers are out</h2>

        <SectionLabel>Drawn numbers</SectionLabel>
        <div style={{ display: "flex", gap: 8, margin: "10px 0 16px", flexWrap: "wrap" }}>
          {draw.map((n) => (
            <span key={n} className="ide-num" style={{ width: 44, height: 44, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line-2)", display: "grid", placeItems: "center", fontWeight: 700, fontSize: 17 }}>{n}</span>
          ))}
        </div>

        <div className="ide-card" style={{ padding: 15, marginBottom: 10, borderColor: "rgba(255,210,63,0.35)", background: "linear-gradient(120deg, rgba(255,210,63,0.1), var(--surface))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: electedRule ? 8 : 0 }}>
            <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--gold)", color: "#0B0910", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Ico.spark style={{ color: "#0B0910", width: 16, height: 16 }} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)" }}>Active rule</div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>
                {electedRule?.title ?? (originalOnly ? "Original rule only" : "No alternative rule elected")}
              </div>
            </div>
          </div>
          {electedRule ? (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{electedRule.sanitizedText}</p>
          ) : null}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
          <div style={{ padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14 }}>
            <div style={{ fontSize: 11.5, color: "var(--dim)", marginBottom: 4, letterSpacing: "0.03em" }}>Prize pool</div>
            <div className="ide-num" style={{ fontSize: 18, fontWeight: 700 }}>{fmtSol(prizeSol)} <span style={{ fontSize: 12, color: "var(--purple-soft)" }}>SOL</span></div>
          </div>
          <div style={{ padding: "12px 14px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14 }}>
            <div style={{ fontSize: 11.5, color: "var(--dim)", marginBottom: 4, letterSpacing: "0.03em" }}>Winners</div>
            {totalWinners === null ? (
              <div style={{ fontSize: 13, color: "var(--muted)", fontWeight: 600 }}>Settling…</div>
            ) : (
              <div className="ide-num" style={{ fontSize: 18, fontWeight: 700, color: totalWinners > 0 ? "var(--green)" : "var(--text)" }}>{totalWinners}</div>
            )}
          </div>
        </div>

        {winners ? (
          <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14 }}>
              <Ico.dice style={{ color: "var(--muted)", width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>Original rule</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}><span className="ide-num" style={{ color: winners.original.winnerCount > 0 ? "var(--green)" : "var(--dim)" }}>{winners.original.winnerCount}</span> won · <span className="ide-num">{fmtSol(originalPoolSol)}</span> SOL</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "10px 14px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 14 }}>
              <Ico.trophy style={{ color: "var(--gold)", width: 16, height: 16, flexShrink: 0 }} />
              <span style={{ fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0 }}>Elected rule</span>
              <span style={{ fontSize: 12.5, color: "var(--muted)" }}><span className="ide-num" style={{ color: winners.alternative.winnerCount > 0 ? "var(--green)" : "var(--dim)" }}>{winners.alternative.winnerCount}</span> won · <span className="ide-num">{fmtSol(alternativePoolSol)}</span> SOL</span>
            </div>
          </div>
        ) : (
          <p style={{ margin: "0 0 16px", fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <Ico.info style={{ color: "var(--dim)" }} /> Winner payouts are being settled — check back in a moment.
          </p>
        )}

        <button
          onClick={() => { dismiss(); go("result"); }}
          className="ide-btn"
          style={{ width: "100%", padding: 13 }}
          type="button"
        >
          <Ico.trophy style={{ color: "#08110C" }} /> See the full result
        </button>
      </div>
    </div>
  );
}
