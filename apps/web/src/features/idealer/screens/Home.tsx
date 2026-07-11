"use client";

/** RODADA (home) — prize, time, main action, rule preview. Ported from app-home.jsx. */
import { useState } from "react";

import { useIdealer } from "../context";
import { fmtInt, fmtSol, fmtTurnId, lamportsToSol, truncateAddress } from "../data/format";
import { usePlayerClaims } from "../data/hooks";
import { Dealer, Ico, Medal, VoteTally, useCountdownTo, useLivePrize } from "../shared";

function WalletBtn() {
  const { connect, connected, go, walletAddress } = useIdealer();
  return (
    <button
      onClick={() => (connected ? go("profile") : connect())}
      className="ide-btn"
      style={{ padding: "9px 14px", fontSize: 14, borderRadius: 13 }}
      type="button"
    >
      <Ico.wallet style={{ color: "#08110C" }} />{" "}
      {connected && walletAddress ? truncateAddress(walletAddress) : "Connect"}
    </button>
  );
}

function PromptInput() {
  const { fees, go } = useIdealer();
  const [val, setVal] = useState("");
  const openComposer = () => {
    const seed = val.trim();
    go("create", seed ? { seed } : { newConversation: true });
  };
  return (
    <div className="ide-card" style={{ padding: 12, borderColor: "var(--line-2)", background: "linear-gradient(180deg, var(--surface-2), var(--surface))" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: "nowrap" }}>Create your rule</span>
        <span className="ide-pill" style={{ padding: "3px 8px", fontSize: 11 }}><Ico.spark style={{ width: 12, height: 12, color: "var(--purple-soft)" }} /> with AI</span>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "var(--dim)" }}>cost <span className="ide-num" style={{ color: "var(--muted)" }}>{fees.ruleNext === 0 ? "Free" : `${fmtSol(fees.ruleNext)} SOL`}</span></span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { openComposer(); } }}
          placeholder="e.g. the sum closest to 100 wins…"
          style={{ flex: 1, minWidth: 0, background: "var(--bg)", border: "1px solid var(--line-2)", borderRadius: 13, padding: "13px 14px", color: "var(--text)", fontSize: 14.5, fontFamily: "Outfit", outline: "none" }}
        />
        <button onClick={openComposer} className="ide-btn" style={{ padding: 13, borderRadius: 13, flexShrink: 0 }} title="Create rule" type="button">
          <Ico.send style={{ color: "#08110C" }} />
        </button>
      </div>
    </div>
  );
}

export function HomeScreen() {
  const {
    bet, decisionPhase, endSeconds, fees, go, openDetail, phase1EndsAt, played, players, prizeSol, rules, turnId,
    resultTurnId, round, turnOpen, turnReadyToPlay, turnStatusMessage, walletAddress,
  } = useIdealer();

  const [h, m, s] = useCountdownTo(endSeconds);
  const [p1h, p1m, p1s] = useCountdownTo(phase1EndsAt);
  const { claims } = usePlayerClaims(walletAddress);
  const claimableSol = lamportsToSol(claims?.availableLamports ?? 0);
  const nowSec = Math.floor(Date.now() / 1000);
  // Phase 1 is fixed by the rule-election cutoff. The shortlist draw happens
  // after it closes; phase 2 starts when finalists are published.
  const inPhase1 = turnOpen && phase1EndsAt !== null && nowSec < phase1EndsAt;
  const hasFinalists = rules.rules.some((rule) => rule.finalist);
  const shortlistDrawPending =
    turnOpen &&
    !inPhase1 &&
    !hasFinalists &&
    round?.election?.status !== "original_only";
  const inPhase2 = turnOpen && !inPhase1 && hasFinalists && endSeconds !== null && nowSec < endSeconds;
  const drawingNow = turnOpen && !inPhase1 && !inPhase2;
  // Once phase 2 ends the rule is elected first, then the numbers are drawn.
  // While the draw runs, surface the elected rule on the main screen; once the
  // draw is fulfilled the result pop-up takes over.
  const drawFulfilled = round?.draw?.status === "fulfilled";
  const activeRuleId = round?.election?.activeRuleId ?? null;
  const electedRule =
    drawingNow && !drawFulfilled && round?.election?.status === "settled" && activeRuleId !== null
      ? round.rules.find((r) => r.ruleId === activeRuleId) ?? null
      : null;
  const electingRuleNow =
    drawingNow && !drawFulfilled && !electedRule && round?.election?.status !== "original_only";
  const showResultLink =
    resultTurnId > 0 &&
    (resultTurnId < turnId ||
      round?.status === "completed" ||
      round?.draw?.status === "fulfilled" ||
      Boolean(round?.winners?.records.length));
  const prize = useLivePrize(prizeSol);
  const top = rules.rules.slice(0, 3);
  const intStr = Math.floor(prize).toString();
  const decStr = (prize % 1).toFixed(2).slice(1);

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "52px 18px 96px" }}>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 22 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            <Dealer size={34} />
            <span style={{ fontWeight: 800, fontSize: 19, letterSpacing: "-0.02em" }}>Idealer</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <button onClick={() => go("share")} aria-label="Share round" style={{ width: 38, height: 38, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--purple-soft)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }} type="button">
              <Ico.send style={{ color: "currentColor", width: 18, height: 18 }} />
            </button>
            <WalletBtn />
          </div>
        </div>

        {/* HERO */}
        <div style={{ textAlign: "center", position: "relative", marginBottom: 24 }}>
          <div style={{ position: "absolute", inset: "-26px 16px auto", height: 210, background: "radial-gradient(circle, rgba(20,241,149,0.2), transparent 68%)", filter: "blur(14px)", animation: "ide-pulse 3.6s ease-in-out infinite", zIndex: 0 }} />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 }}>
              {inPhase1 ? (
                <span className="ide-pill" style={{ color: "var(--muted)" }}><Ico.clock style={{ color: "var(--green)" }} /> Create &amp; play · ends in <span className="ide-num" style={{ color: "var(--text)", fontWeight: 700, marginLeft: 2 }}>{p1h}:{p1m}:{p1s}</span></span>
              ) : shortlistDrawPending ? (
                <span className="ide-pill" style={{ color: "var(--muted)", borderColor: "rgba(199,125,255,0.3)" }}><Ico.dice style={{ color: "var(--purple-soft)", width: 14, height: 14 }} /> Shortlist draw in progress</span>
              ) : inPhase2 ? (
                <span className="ide-pill" style={{ color: "var(--muted)", borderColor: "rgba(255,210,63,0.3)" }}><Ico.vote style={{ color: "var(--yellow)", width: 14, height: 14 }} /> Shortlist &amp; draw · ends in <span className="ide-num" style={{ color: "var(--text)", fontWeight: 700, marginLeft: 2 }}>{h}:{m}:{s}</span></span>
              ) : electingRuleNow ? (
                <span className="ide-pill" style={{ color: "var(--muted)", borderColor: "rgba(255,210,63,0.3)" }}><Ico.spark style={{ color: "var(--yellow)", width: 14, height: 14 }} /> Electing the rule</span>
              ) : drawingNow && drawFulfilled ? (
                <span className="ide-pill" style={{ color: "var(--muted)", borderColor: "rgba(20,241,149,0.3)" }}><Ico.check style={{ color: "var(--green)", width: 14, height: 14 }} /> Numbers drawn · settling the turn</span>
              ) : drawingNow ? (
                <span className="ide-pill" style={{ color: "var(--muted)", borderColor: "rgba(199,125,255,0.3)" }}><Ico.dice style={{ color: "var(--purple-soft)", width: 14, height: 14 }} /> Drawing the numbers</span>
              ) : (
                <span className="ide-pill" style={{ color: "var(--yellow)", borderColor: "rgba(255,210,63,0.3)" }}><Ico.clock style={{ color: "var(--yellow)" }} /> {turnStatusMessage}</span>
              )}
            </div>
            <div style={{ fontSize: 13, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)", fontWeight: 700, marginBottom: 2 }}>Accumulated prize</div>
            <div className="ide-num" style={{ display: "flex", alignItems: "flex-start", justifyContent: "center", gap: 3 }}>
              <span className="ide-grad-text" style={{ fontSize: 72, fontWeight: 700, lineHeight: 0.9 }}>{intStr}</span>
              <span className="ide-grad-text" style={{ fontSize: 34, fontWeight: 700, marginTop: 6 }}>{decStr}</span>
              <span style={{ fontSize: 21, fontWeight: 700, color: "var(--purple-soft)", marginTop: 11, marginLeft: 4 }}>SOL</span>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 18, flexWrap: "wrap" }}>
              <span className="ide-pill"><Ico.users style={{ color: "var(--purple-soft)" }} /> <span className="ide-num">{fmtInt(players)}</span> playing</span>
              <span className="ide-pill"><Ico.spark style={{ color: "var(--yellow)" }} /> {rules.rules.length} rules</span>
            </div>
          </div>
        </div>

        {/* ELECTED RULE — shown on the main screen while the numbers are drawn */}
        {drawingNow && electedRule ? (
          <div className="ide-card" style={{ padding: 15, marginBottom: 14, borderColor: "rgba(255,210,63,0.35)", background: "linear-gradient(120deg, rgba(255,210,63,0.1), var(--surface))" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--gold)", color: "#0B0910", display: "grid", placeItems: "center", flexShrink: 0 }}><Ico.spark style={{ color: "#0B0910", width: 16, height: 16 }} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)" }}>Elected rule</div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{electedRule.title}</div>
              </div>
            </div>
            <p style={{ margin: "0 0 10px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>{electedRule.sanitizedText}</p>
            <div style={{ fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Ico.dice style={{ color: "var(--purple-soft)", width: 14, height: 14 }} /> The numbers are being drawn — the result lands here.
            </div>
          </div>
        ) : drawingNow && !drawFulfilled && round?.election?.status === "original_only" ? (
          <div className="ide-card" style={{ padding: 15, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 28, height: 28, borderRadius: 9, background: "var(--surface-2)", color: "var(--muted)", display: "grid", placeItems: "center", flexShrink: 0 }}><Ico.dice style={{ color: "var(--muted)", width: 16, height: 16 }} /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>Original rule only this round</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>No alternative rule was elected — the numbers are being drawn.</div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ELIMINATION VOTING (open for all of phase 2) */}
        {decisionPhase ? (
          <button onClick={() => go("vote")} className="ide-tap" style={{
            width: "100%", textAlign: "left", marginBottom: 14, padding: "13px 16px", borderRadius: 16, cursor: "pointer", color: "var(--text)",
            border: "1px solid rgba(255,210,63,0.4)", background: "linear-gradient(110deg, rgba(255,210,63,0.13), var(--surface))",
            display: "flex", alignItems: "center", gap: 12,
          }} type="button">
            <span style={{ width: 38, height: 38, borderRadius: 12, background: "var(--yellow)", color: "#0B0910", display: "grid", placeItems: "center", flexShrink: 0 }}><Ico.vote style={{ color: "#0B0910" }} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>Vote finalists out</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                Open all phase 2 - eliminate up to 5 of the 10 finalists
              </div>
            </div>
            <Ico.arrow style={{ color: "var(--yellow)", flexShrink: 0 }} />
          </button>
        ) : null}

        {/* PRIZE READY TO CLAIM */}
        {claimableSol > 0 ? (
          <button onClick={() => go("claims")} className="ide-tap" style={{
            width: "100%", textAlign: "left", marginBottom: 14, padding: "13px 16px", borderRadius: 16, cursor: "pointer", color: "var(--text)",
            border: "1px solid rgba(20,241,149,0.4)", background: "linear-gradient(110deg, rgba(20,241,149,0.13), var(--surface))",
            display: "flex", alignItems: "center", gap: 12,
          }} type="button">
            <span style={{ width: 38, height: 38, borderRadius: 12, background: "var(--green)", color: "#08110C", display: "grid", placeItems: "center", flexShrink: 0 }}><Ico.gift style={{ color: "#08110C" }} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>Prize ready to claim</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}><span className="ide-num" style={{ color: "var(--green)", fontWeight: 700 }}>{fmtSol(claimableSol)} SOL</span> available - claim before it expires</div>
            </div>
            <Ico.arrow style={{ color: "var(--green)", flexShrink: 0 }} />
          </button>
        ) : null}

        {/* MAIN ACTION */}
        {played ? (
          <div className="ide-notice" style={{ display: "grid", gap: 12, marginBottom: 22 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span style={{ width: 30, height: 30, borderRadius: 10, background: "var(--green)", color: "#08110C", display: "grid", placeItems: "center", flexShrink: 0 }}><Ico.check /></span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>You&apos;re in this round</div>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Good luck! You can now vote and create rules.</div>
              </div>
              <button onClick={() => go("play")} className="ide-votebtn" style={{ flexShrink: 0 }} type="button">
                play again · {fees.playNext === 0 ? "free" : `${fmtSol(fees.playNext)} SOL`}
              </button>
            </div>
            {bet && bet.length > 0 ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                {bet.map((n) => <span key={n} className="ide-chip" style={{ width: 40, height: 40, fontSize: 15 }}>{n}</span>)}
              </div>
            ) : null}
          </div>
        ) : (
          <button onClick={() => go("play")} disabled={!turnReadyToPlay} className="ide-btn" style={{ width: "100%", padding: "17px", fontSize: 17, marginBottom: 18, opacity: turnReadyToPlay ? 1 : 0.5 }} type="button">
            <Ico.bolt style={{ color: "#08110C" }} /> {turnReadyToPlay ? `Play now · ${fees.playNext === 0 ? "Free" : `${fmtSol(fees.playNext)} SOL`}` : "Waiting for next turn"}
          </button>
        )}

        {/* PREVIOUS ROUND RESULT — hairline row, not a balloon */}
        {showResultLink ? (
          <button onClick={() => go("result")} className="ide-listrow" style={{ marginBottom: 26, padding: "15px 2px", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)" }} type="button">
            <span style={{ width: 36, height: 36, borderRadius: 11, background: "var(--gold)", color: "#0B0910", display: "grid", placeItems: "center", flexShrink: 0 }}><Ico.trophy style={{ color: "#0B0910" }} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>Result of round {fmtTurnId(resultTurnId)}</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>See the drawn numbers and the elected rule</div>
            </div>
            <Ico.arrow style={{ color: "var(--gold)", flexShrink: 0 }} />
          </button>
        ) : null}

        {/* CREATE RULE — prompt entry, no box (only the input has a border) */}
        <div style={{ marginBottom: 28 }}>
          <PromptInput />
        </div>

        {/* RULE PREVIEW → voting */}
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 2px 12px" }}>
          <span style={{ fontWeight: 800, fontSize: 22, letterSpacing: "-0.025em", whiteSpace: "nowrap" }}>The rules</span>
          <button onClick={() => go("vote")} style={{ background: "none", border: "none", color: "var(--purple-soft)", fontSize: 13.5, fontWeight: 700, cursor: "pointer", fontFamily: "Outfit", display: "inline-flex", alignItems: "center", gap: 4 }} type="button">
            vote <Ico.arrow style={{ color: "var(--purple-soft)", width: 15, height: 15 }} />
          </button>
        </div>

        {rules.loading && top.length === 0 ? (
          <div className="ide-rule-stack" style={{ margin: "0 -18px 14px" }}>
            {[0, 1, 2].map((i) => <div key={i} className="ide-card" style={{ height: 64 }} />)}
          </div>
        ) : top.length === 0 ? (
          <div className="ide-card" style={{ padding: 18, margin: "0 -18px 14px", textAlign: "center", color: "var(--muted)", fontSize: 14, borderRadius: 0 }}>
            No rules proposed yet - be the first to create one.
          </div>
        ) : (
          <div className="ide-rule-stack" style={{ margin: "0 -18px 14px" }}>
            {top.map((r, i) => (
              <button key={r.id} onClick={() => openDetail(r.ruleId, { rank: i + 1 })} className="ide-rulerow ide-tap" style={{ borderColor: i === 0 ? "var(--line-2)" : "var(--line)", boxShadow: i === 0 ? "0 0 24px -14px rgba(255,210,63,0.6)" : "none" }} type="button">
                <Medal pos={i + 1} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</div>
                  <div style={{ marginTop: 4 }}><VoteTally approve={r.approve} against={r.against} size="sm" /></div>
                </div>
                <Ico.chevron style={{ color: "var(--dim)", transform: "rotate(-90deg)", flexShrink: 0 }} />
              </button>
            ))}
          </div>
        )}

        <button onClick={() => go("vote")} className="ide-btn-ghost ide-btn" style={{ width: "100%", padding: 13, marginBottom: 4 }} type="button">
          <Ico.vote style={{ color: "var(--purple-soft)", width: 19, height: 19 }} /> View and vote on {rules.rules.length} rules
        </button>
      </div>
    </div>
  );
}
