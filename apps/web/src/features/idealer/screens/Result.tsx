"use client";

/**
 * RESULTADO DA RODADA — drawn numbers and the two win conditions (original
 * exact-sequence 50% + elected alternative rule 50%), your eligibility, and the
 * finalists that entered the draw. Ported from app-result.jsx, wired to
 * GET /rounds/{prevTurnId} (+ winner records & the wallet's guess).
 */
import { useEffect, useMemo, useState } from "react";

import { useIdealer } from "../context";
import { getRuleVotes } from "../data/apiClient";
import { lamportsToSol, fmtInt, fmtSol, fmtTurnId } from "../data/format";
import { usePlayerGuess, useRound } from "../data/hooks";
import { Confetti, Ico, ScreenHead, SectionLabel, VoteTally } from "../shared";

function EligItem({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 24, height: 24, borderRadius: 8, display: "grid", placeItems: "center", flexShrink: 0, background: ok ? "rgba(20,241,149,0.16)" : "var(--surface-2)", color: ok ? "var(--green)" : "var(--dim)" }}>
        {ok ? <Ico.check style={{ color: "var(--green)", width: 15, height: 15 }} /> : <Ico.close style={{ color: "var(--dim)", width: 14, height: 14 }} />}
      </span>
      <span style={{ fontSize: 13, color: ok ? "var(--text)" : "var(--dim)", fontWeight: 600 }}>{label}</span>
    </div>
  );
}

type GuessRuleMatch = "both" | "none" | "original" | "turn";

export function getGuessRuleMatch(
  wins: Array<{ category: "alternative" | "original" }>,
): GuessRuleMatch {
  const original = wins.some((win) => win.category === "original");
  const turn = wins.some((win) => win.category === "alternative");

  if (original && turn) return "both";
  if (original) return "original";
  if (turn) return "turn";
  return "none";
}

function GuessNumber({ number, match }: { number: number; match: GuessRuleMatch }) {
  const stateLabel =
    match === "both"
      ? "matched both rules"
      : match === "original"
        ? "matched the original rule"
        : match === "turn"
          ? "matched the rule of the turn"
          : "did not match a winning rule";

  return (
    <span
      aria-label={`${number}: ${stateLabel}`}
      className={`ide-num ide-result-number${match === "none" ? "" : ` is-${match}`}`}
      role="listitem"
    >
      {number}
    </span>
  );
}

export function ResultScreen() {
  const { go, resultTurnId, walletAddress } = useIdealer();
  const { round, loading } = useRound(resultTurnId);
  const { receipt } = usePlayerGuess(resultTurnId, walletAddress);
  const [votedElected, setVotedElected] = useState(false);

  const draw = round?.draw?.drawResult ?? [];
  const activeRuleId = round?.election?.activeRuleId ?? null;
  const electedRule = round?.rules.find((r) => r.ruleId === activeRuleId) ?? null;

  // Eligibility: did this wallet vote for the elected rule?
  useEffect(() => {
    if (!walletAddress || !activeRuleId) {
      setVotedElected(false);
      return;
    }
    const controller = new AbortController();
    getRuleVotes(resultTurnId, controller.signal)
      .then((body) => {
        const mine = (body?.votes ?? []).some(
          (v) => v.voter === walletAddress && v.ruleId === activeRuleId,
        );
        setVotedElected(mine);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [resultTurnId, walletAddress, activeRuleId]);

  const myWins = useMemo(
    () => (round?.winners?.records ?? []).filter((r) => r.player === walletAddress),
    [round, walletAddress],
  );
  const youWonLamports = myWins.reduce((total, r) => total + r.payoutLamports, 0);
  const youWon = youWonLamports > 0;
  const guessRuleMatch = getGuessRuleMatch(myWins);
  const verificationAvailable = Boolean(round?.winners);

  const original = round?.winners?.original;
  const alternative = round?.winners?.alternative;
  const originalPoolSol = lamportsToSol(round?.pool.accounting.buckets.original.totalLamports ?? 0);
  const alternativePoolSol = lamportsToSol(round?.pool.accounting.buckets.alternative.totalLamports ?? 0);

  const finalistIds = round?.election?.finalistRuleIds ?? [];
  const eliminatedIds = round?.elimination?.eliminatedRuleIds ?? [];
  const finalistRules = (round?.rules ?? [])
    .filter((r) => finalistIds.includes(r.ruleId))
    .sort((a, b) => b.votes - a.votes);
  const maxV = Math.max(1, ...finalistRules.map((r) => r.votes));

  if (loading && !round) {
    return (
      <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
        <div className="ide-ambient" />
        <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "var(--ide-shell-content-top) 20px 96px" }}>
          <ScreenHead onBack={() => go("home")} title="Result" />
          <div className="ide-card" style={{ height: 120, marginBottom: 12 }} />
          <div className="ide-card" style={{ height: 90 }} />
        </div>
      </div>
    );
  }

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      {youWon ? <Confetti /> : null}
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "var(--ide-shell-content-top) 20px 96px" }}>
        <ScreenHead
          onBack={() => go("home")}
          title="Result"
          right={
            <button onClick={() => go("share")} aria-label="Share result" style={{ width: 40, height: 40, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--purple-soft)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }} type="button">
              <Ico.send style={{ color: "currentColor" }} />
            </button>
          }
        />

        {!walletAddress ? (
          <div style={{ textAlign: "center", padding: "18px 0 24px", borderBottom: "1px solid var(--line)", marginBottom: 22 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800 }}>Round settled</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 5 }}>Draw, rule, and payout results are available on-chain.</div>
          </div>
        ) : youWon ? (
          <div style={{ position: "relative", textAlign: "center", marginBottom: 28, paddingTop: 6 }}>
            <div style={{ position: "absolute", inset: "-10px 40px auto", height: 160, background: "radial-gradient(circle, rgba(255,210,63,0.2), transparent 68%)", filter: "blur(14px)", zIndex: 0 }} />
            <div style={{ position: "relative", zIndex: 1 }}>
              <div style={{ fontSize: 40, marginBottom: 4 }}>🏆</div>
              <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--gold)", fontWeight: 800 }}>You won!</div>
              <div className="ide-num" style={{ fontSize: 44, fontWeight: 800, margin: "6px 0 2px" }}>+{fmtSol(lamportsToSol(youWonLamports))} <span style={{ fontSize: 18, color: "var(--purple-soft)" }}>SOL</span></div>
              <div style={{ fontSize: 13.5, color: "var(--muted)" }}>available to claim in your account</div>
              <button onClick={() => go("claims")} className="ide-btn" style={{ width: "100%", marginTop: 20, padding: 14 }} type="button"><Ico.withdraw style={{ color: "#08110C" }} /> Go to claims</button>
            </div>
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "18px 0 24px", borderBottom: "1px solid var(--line)", marginBottom: 22 }}>
            <div style={{ fontSize: 16.5, fontWeight: 800 }}>Not this time</div>
            <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 5 }}>The next round is already live — good luck!</div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", margin: "0 2px 16px" }}>
          <span className="ide-num" style={{ fontSize: 13, letterSpacing: "0.12em", color: "var(--purple-soft)", fontWeight: 700 }}>{fmtTurnId(resultTurnId)}</span>
          <span style={{ fontSize: 13, color: "var(--muted)", display: "inline-flex", alignItems: "center", gap: 6 }}><Ico.users style={{ color: "var(--dim)" }} /> <span className="ide-num">{fmtInt(round?.pool.guesses ?? 0)}</span> players</span>
        </div>

        {/* drawn numbers — chips over the background */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginBottom: 26 }}>
          <SectionLabel>Drawn numbers</SectionLabel>
          <div aria-label="Drawn numbers" className="ide-result-numbers" role="list" style={{ marginTop: 14 }}>
            {draw.length === 0 ? (
              <span style={{ fontSize: 13.5, color: "var(--muted)" }}>The draw has not settled yet.</span>
            ) : draw.map((n) => (
              <span key={n} className="ide-num ide-result-number is-drawn" role="listitem">{n}</span>
            ))}
          </div>
        </div>

        {/* The elected rule leads the result story: draw, rule, then entry. */}
        <SectionLabel>Rule of the turn</SectionLabel>
        <div style={{ margin: "12px 0 26px" }}>
          {/* elected alternative rule — emphasis by color, not by box */}
          <div style={{ padding: "2px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--gold)", color: "#0B0910", display: "grid", placeItems: "center", flexShrink: 0 }}><Ico.trophy style={{ color: "#0B0910", width: 15, height: 15 }} /></span>
              <div style={{ fontWeight: 800, fontSize: 16, color: "var(--gold)" }}>{electedRule?.title ?? "No alternative rule elected"}</div>
            </div>
            {electedRule ? <p style={{ margin: "0 0 11px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{electedRule.sanitizedText}</p> : null}
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="ide-num" style={{ fontSize: 13, color: "var(--purple-soft)", fontWeight: 700 }}>{fmtSol(alternativePoolSol)} SOL pool</span>
              <span style={{ marginLeft: "auto", fontSize: 12.5, color: "var(--muted)" }}><span className="ide-num" style={{ color: "var(--green)" }}>{alternative?.winnerCount ?? 0}</span> won</span>
            </div>
          </div>
        </div>

        {receipt ? (
          <div style={{ borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", padding: "16px 2px", marginBottom: 26 }}>
            <SectionLabel>Your guess</SectionLabel>
            <div aria-label="Your submitted numbers" className="ide-result-numbers" role="list" style={{ marginTop: 14 }}>
              {receipt.numbers.map((number, index) => (
                <GuessNumber key={`${number}-${index}`} match={verificationAvailable ? guessRuleMatch : "none"} number={number} />
              ))}
            </div>
            {verificationAvailable ? (
              <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45 }}>
                {guessRuleMatch === "both"
                  ? "Your entry won under both rules."
                  : guessRuleMatch === "original"
                    ? "Your entry won under the original rule."
                    : guessRuleMatch === "turn"
                      ? "Your entry won under the rule of the turn."
                      : "Your entry did not win under either rule."}
              </p>
            ) : (
              <p style={{ margin: "12px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.45 }}>Verified rule results are not available yet.</p>
            )}
            <div aria-label="Number color legend" className="ide-result-legend">
              <span><i className="original" />Original rule</span>
              {electedRule ? <span><i className="turn" />Rule of the turn</span> : null}
              {electedRule ? <span><i className="both" />Both rules</span> : null}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 13 }}>
              <EligItem ok={votedElected} label={votedElected ? "Voted for the elected rule" : "Didn't vote for the elected rule"} />
            </div>
          </div>
        ) : null}

        <div style={{ padding: "2px 2px 18px", borderBottom: "1px solid var(--line)", marginBottom: 26 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
            <span style={{ width: 26, height: 26, borderRadius: 8, background: "var(--surface-2)", color: "var(--muted)", display: "grid", placeItems: "center", flexShrink: 0 }}><Ico.dice style={{ color: "var(--muted)", width: 15, height: 15 }} /></span>
            <div style={{ fontWeight: 700, fontSize: 15.5 }}>Original rule</div>
            <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--dim)" }}>exact sequence</span>
          </div>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
            {!original || original.winnerCount === 0
              ? <>No one matched the exact sequence. The <span className="ide-num" style={{ color: "var(--text)" }}>{fmtSol(originalPoolSol)}</span> SOL rolls over to the next round.</>
              : <><span className="ide-num" style={{ color: "var(--green)" }}>{original.winnerCount}</span> winner(s) shared <span className="ide-num" style={{ color: "var(--text)" }}>{fmtSol(originalPoolSol)}</span> SOL.</>}
          </p>
        </div>

        {finalistRules.length > 0 ? (
          <>
            <SectionLabel>Finalists in the draw</SectionLabel>
            <div className="ide-list" style={{ marginTop: 8 }}>
              {finalistRules.map((r, i) => {
                const pct = Math.round((r.votes / maxV) * 100);
                const won = r.ruleId === activeRuleId;
                const eliminated = eliminatedIds.includes(r.ruleId);
                return (
                  <div key={r.ruleId} style={{ position: "relative", overflow: "hidden", padding: "14px 2px", opacity: eliminated ? 0.6 : 1 }}>
                    <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: won ? "linear-gradient(90deg, rgba(255,210,63,0.14), transparent)" : "linear-gradient(90deg, rgba(255,255,255,0.035), transparent)" }} />
                    <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 11 }}>
                      <span className="ide-num" style={{ width: 20, textAlign: "center", color: "var(--dim)", fontWeight: 700, fontSize: 14 }}>{i + 1}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                          <span style={{ fontWeight: won ? 700 : 600, fontSize: 15, color: won ? "var(--gold)" : "var(--text)", textDecoration: eliminated ? "line-through" : "none" }}>{r.title}</span>
                          {won ? <Ico.trophy style={{ color: "var(--gold)", width: 15, height: 15, flexShrink: 0 }} /> : null}
                          {eliminated ? <span style={{ fontSize: 10, fontWeight: 700, color: "var(--red)", flexShrink: 0 }}>eliminated</span> : null}
                        </div>
                      </div>
                      <VoteTally approve={r.votes} against={0} size="sm" />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : null}

        <button onClick={() => go("home")} className="ide-btn-ghost ide-btn" style={{ width: "100%", marginTop: 18, padding: 14 }} type="button">
          <Ico.bolt style={{ color: "var(--green)" }} /> Back to the current round
        </button>
      </div>
    </div>
  );
}
