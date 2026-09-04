"use client";

/** RODADA (home) — prize, time, main action, rule preview. Ported from app-home.jsx. */
import { useState } from "react";
import { BRAND_NAME } from "@tyche/config";

import { useTyche } from "../context";
import {
  fmtClaimSol,
  fmtInt,
  fmtSol,
  lamportsToSol,
} from "../data/format";
import { usePlayerClaims } from "../data/hooks";
import { summarizePlayerClaims } from "../data/claimState";
import { getRoundPhase } from "../roundPhase";
import {
  Dealer,
  Ico,
  Medal,
  VoteTally,
  WalletButton,
  useCountdownTo,
  useLivePrize,
} from "../shared";

function PromptInput() {
  const { fees, go } = useTyche();
  const [val, setVal] = useState("");
  const openComposer = () => {
    const seed = val.trim();
    go("create", seed ? { seed } : { newConversation: true });
  };
  return (
    <div
      style={{
        padding: "14px 16px 15px",
        marginRight: 3,
        background: "var(--surface)",
        boxShadow: "var(--solid-5), var(--halo-cyan-lg)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          marginBottom: 11,
          flexWrap: "wrap",
        }}
      >
        <span
          style={{
            fontFamily: "Bevan, serif",
            fontSize: 13,
            textTransform: "uppercase",
            whiteSpace: "nowrap",
          }}
        >
          Create your rule
        </span>
        <span className="ide-tag">with AI</span>
        <span
          style={{
            marginLeft: "auto",
            fontFamily: "Oswald, sans-serif",
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            color: "var(--yellow)",
          }}
        >
          {fees.ruleNext === 0 ? "free" : `${fmtSol(fees.ruleNext)} SOL`}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              openComposer();
            }
          }}
          placeholder="e.g. the sum closest to 100 wins…"
          style={{
            flex: 1,
            minWidth: 0,
            background: "var(--surface-3)",
            border: "none",
            borderRadius: 0,
            padding: "13px 14px",
            color: "var(--text)",
            fontSize: 12.5,
            fontFamily: "var(--num-font, 'DM Mono'), ui-monospace, monospace",
            outline: "none",
          }}
        />
        <button
          onClick={openComposer}
          className="ide-btn"
          style={{
            width: 46, height: 46, padding: 0, flexShrink: 0,
            borderRadius: "var(--radius-btn-xs)", boxShadow: "var(--solid-4)",
          }}
          title="Create rule"
          type="button"
        >
          <Ico.send style={{ color: "var(--on-accent)" }} />
        </button>
      </div>
    </div>
  );
}

export function HomeScreen() {
  const {
    apiUnavailable,
    endSeconds,
    fees,
    go,
    openDetail,
    phase1EndsAt,
    played,
    players,
    prizeSol,
    reloadAll,
    rules,
    round,
    turnReadyToPlay,
    turnStatusMessage,
    turnStatusUnavailable,
    turnState,
    walletAddress,
  } = useTyche();

  const [h, m, s] = useCountdownTo(endSeconds);
  const [p1h, p1m, p1s] = useCountdownTo(phase1EndsAt);
  const { claims } = usePlayerClaims(walletAddress);
  const claimTotals = summarizePlayerClaims(claims?.records ?? []);
  const claimableSol = lamportsToSol(
    claimTotals.claimablePrizeLamports + claimTotals.claimableRewardLamports,
  );
  const nowSec = Math.floor(Date.now() / 1000);
  const phase = getRoundPhase({
    nowSeconds: nowSec,
    phase1EndsAt,
    turn: turnState,
  });
  const inPhase1 = phase === "create_play";
  const shortlistDrawPending = phase === "shortlist_selection";
  const inPhase2 = phase === "shortlist_vote";
  const drawingNow = phase === "settling";
  // Once phase 2 ends the rule is elected first, then the numbers are drawn.
  // While the draw runs, surface the elected rule on the main screen; once the
  // draw is fulfilled the result pop-up takes over.
  const drawFulfilled = round?.draw?.status === "fulfilled";
  const activeRuleId = round?.election?.activeRuleId ?? null;
  const electedRule =
    drawingNow &&
    !drawFulfilled &&
    round?.election?.status === "settled" &&
    activeRuleId !== null
      ? (round.rules.find((r) => r.ruleId === activeRuleId) ?? null)
      : null;
  const electingRuleNow =
    drawingNow &&
    !drawFulfilled &&
    !electedRule &&
    round?.election?.status !== "original_only";
  const prize = useLivePrize(prizeSol);
  const top = rules.rules.slice(0, 3);
  const intStr = Math.floor(prize).toString();
  const decStr = (prize % 1).toFixed(2).slice(1);

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
          padding: "var(--ide-shell-content-top) 18px 96px",
        }}
      >
        <div
          className="ide-screen-head"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 22,
          }}
        >
          <div
            className="ide-brandlock"
            style={{ display: "flex", alignItems: "center", gap: 9 }}
          >
            <Dealer size={34} />
            <span className="ide-plate" style={{ fontSize: 22 }}>
              {BRAND_NAME}
            </span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <WalletButton />
          </div>
        </div>

        {/* BACKEND UNAVAILABLE — the round + rules API could not be reached.
            Surface it plainly instead of rendering zero-value fallbacks that
            contradict the live turn status. */}
        {apiUnavailable ? (
          <button
            onClick={() => reloadAll()}
            className="ide-tap"
            style={{
              width: "100%",
              textAlign: "left",
              marginBottom: 16,
              padding: "13px 16px",
              borderRadius: 16,
              cursor: "pointer",
              color: "var(--text)",
              border: "1px solid rgba(255,59,47,0.45)",
              background:
                "linear-gradient(110deg, rgba(255,59,47,0.14), var(--surface))",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
            type="button"
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "#ff6b6b",
                color: "var(--on-accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Ico.clock style={{ color: "var(--on-accent)" }} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>
                Round data unavailable
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                Cannot reach the backend right now - tap to retry.
              </div>
            </div>
            <Ico.arrow style={{ color: "#ff6b6b", flexShrink: 0 }} />
          </button>
        ) : null}

        {/* On desktop the round state and the rule activity sit side by
            side; `.ide-deck` is `display: contents` below 1024px, so the
            mobile flow below is unchanged. */}
        <div className="ide-deck">
        <div>

        {/* HERO */}
        <div
          style={{
            textAlign: "center",
            position: "relative",
            marginBottom: 24,
          }}
        >
          {/* Prize rays + halo. Both are decoration: pointer-events off and
              behind the content, so they never intercept a tap. */}
          <div aria-hidden="true" className="ide-sunburst ide-prize-rays" />
          <div aria-hidden="true" className="ide-prize-halo" />
          <div style={{ position: "relative", zIndex: 1 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "center",
                gap: 8,
                marginBottom: 14,
              }}
            >
              {turnStatusUnavailable ? (
                <span
                  className="ide-pill"
                  style={{
                    color: "var(--yellow)",
                    borderColor: "rgba(255,210,63,0.3)",
                  }}
                >
                  <Ico.clock style={{ color: "var(--yellow)" }} />{" "}
                  {turnStatusMessage}
                </span>
              ) : inPhase1 ? (
                // The one genuinely live state on this screen gets the skewed
                // red badge; every other phase stays a neutral status chip.
                <span className="ide-live">
                  <span className="ide-live-dot" />
                  <span>
                    Create &amp; play ·{" "}
                    <span className="ide-num" style={{ letterSpacing: "0.1em" }}>
                      {p1h}:{p1m}:{p1s}
                    </span>
                  </span>
                </span>
              ) : shortlistDrawPending ? (
                <span
                  className="ide-pill"
                  style={{
                    color: "var(--muted)",
                    borderColor: "rgba(255,122,184,0.3)",
                  }}
                >
                  <Ico.dice
                    style={{
                      color: "var(--purple-soft)",
                      width: 14,
                      height: 14,
                    }}
                  />{" "}
                  Shortlist draw in progress
                </span>
              ) : inPhase2 ? (
                <span
                  className="ide-pill"
                  style={{
                    color: "var(--muted)",
                    borderColor: "rgba(255,210,63,0.3)",
                  }}
                >
                  <Ico.vote
                    style={{ color: "var(--yellow)", width: 14, height: 14 }}
                  />{" "}
                  Shortlist &amp; draw · ends in{" "}
                  <span
                    className="ide-num"
                    style={{
                      color: "var(--text)",
                      fontWeight: 700,
                      marginLeft: 2,
                    }}
                  >
                    {h}:{m}:{s}
                  </span>
                </span>
              ) : electingRuleNow ? (
                <span
                  className="ide-pill"
                  style={{
                    color: "var(--muted)",
                    borderColor: "rgba(255,210,63,0.3)",
                  }}
                >
                  <Ico.spark
                    style={{ color: "var(--yellow)", width: 14, height: 14 }}
                  />{" "}
                  Electing the rule
                </span>
              ) : drawingNow && drawFulfilled ? (
                <span
                  className="ide-pill"
                  style={{
                    color: "var(--muted)",
                    borderColor: "rgba(124,246,184,0.3)",
                  }}
                >
                  <Ico.check
                    style={{ color: "var(--green)", width: 14, height: 14 }}
                  />{" "}
                  Numbers drawn · settling the turn
                </span>
              ) : drawingNow ? (
                <span
                  className="ide-pill"
                  style={{
                    color: "var(--muted)",
                    borderColor: "rgba(255,122,184,0.3)",
                  }}
                >
                  <Ico.dice
                    style={{
                      color: "var(--purple-soft)",
                      width: 14,
                      height: 14,
                    }}
                  />{" "}
                  Drawing the numbers
                </span>
              ) : (
                <span
                  className="ide-pill"
                  style={{
                    color: "var(--yellow)",
                    borderColor: "rgba(255,210,63,0.3)",
                  }}
                >
                  <Ico.clock style={{ color: "var(--yellow)" }} />{" "}
                  {turnStatusMessage}
                </span>
              )}
            </div>
            <div
              style={{
                fontFamily: "Oswald, sans-serif",
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: "0.28em",
                textTransform: "uppercase",
                color: "var(--cyan)",
                marginBottom: 2,
              }}
            >
              Accumulated prize
            </div>
            {/* The integer carries the plate, the decimals drop to gold and the
                unit to DM Mono cyan — one weight per line, per screens.md. */}
            <div className="ide-prize">
              <span className="ide-prize-int">{intStr}</span>
              <span className="ide-prize-dec">{decStr}</span>
              <span className="ide-num ide-prize-unit">SOL</span>
            </div>
            <div
              aria-hidden="true"
              style={{ display: "flex", alignItems: "center", gap: 10, margin: "8px 4px" }}
            >
              <span className="ide-dashed" />
              <span className="ide-diamond" />
              <span className="ide-dashed" />
            </div>
            {apiUnavailable ? null : (
              <div
                className="ide-hero-stats"
                aria-label={`${fmtInt(players)} playing, ${rules.rules.length} rules`}
              >
                <span className="ide-hero-stat">
                  <span className="ide-hero-stat-value">{fmtInt(players)}</span>
                  <span className="ide-hero-stat-label">playing</span>
                </span>
                <span className="ide-hero-stat is-green">
                  <span className="ide-hero-stat-value">{rules.rules.length}</span>
                  <span className="ide-hero-stat-label">rules</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ELECTED RULE — shown on the main screen while the numbers are drawn */}
        {drawingNow && electedRule ? (
          <div
            className="ide-card"
            style={{
              padding: 15,
              marginBottom: 14,
              borderColor: "rgba(255,210,63,0.35)",
              background:
                "linear-gradient(120deg, rgba(255,210,63,0.1), var(--surface))",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 9,
                marginBottom: 8,
              }}
            >
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: "var(--gold)",
                  color: "var(--on-accent)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Ico.spark
                  style={{ color: "var(--on-accent)", width: 16, height: 16 }}
                />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    color: "var(--dim)",
                  }}
                >
                  Elected rule
                </div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {electedRule.title}
                </div>
              </div>
            </div>
            <p
              style={{
                margin: "0 0 10px",
                fontSize: 13.5,
                color: "var(--muted)",
                lineHeight: 1.5,
              }}
            >
              {electedRule.officialInterpretation ?? electedRule.sanitizedText}
            </p>
            <div
              style={{
                fontSize: 12.5,
                color: "var(--muted)",
                display: "flex",
                alignItems: "center",
                gap: 6,
              }}
            >
              <Ico.dice
                style={{ color: "var(--purple-soft)", width: 14, height: 14 }}
              />{" "}
              The numbers are being drawn — the result lands here.
            </div>
          </div>
        ) : drawingNow &&
          !drawFulfilled &&
          round?.election?.status === "original_only" ? (
          <div className="ide-card" style={{ padding: 15, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 9,
                  background: "var(--surface-2)",
                  color: "var(--muted)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Ico.dice
                  style={{ color: "var(--muted)", width: 16, height: 16 }}
                />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                  Original rule only this round
                </div>
                <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                  No alternative rule was elected — the numbers are being drawn.
                </div>
              </div>
            </div>
          </div>
        ) : null}

        {/* ELIMINATION VOTING (open for all of phase 2) */}
        {inPhase2 ? (
          <button
            onClick={() => go("vote")}
            className="ide-tap"
            style={{
              width: "100%",
              textAlign: "left",
              marginBottom: 14,
              padding: "13px 16px",
              borderRadius: 16,
              cursor: "pointer",
              color: "var(--text)",
              border: "1px solid rgba(255,210,63,0.4)",
              background:
                "linear-gradient(110deg, rgba(255,210,63,0.13), var(--surface))",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
            type="button"
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "var(--yellow)",
                color: "var(--on-accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Ico.vote style={{ color: "var(--on-accent)" }} />
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>
                Vote finalists out
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                Open all phase 2 - eliminate up to 5 of the 10 finalists
              </div>
            </div>
            <Ico.arrow style={{ color: "var(--yellow)", flexShrink: 0 }} />
          </button>
        ) : null}

        {/* PRIZE READY TO CLAIM */}
        {claimableSol > 0 ? (
          <button
            onClick={() => go("claims")}
            className="ide-tap"
            style={{
              width: "100%",
              textAlign: "left",
              marginBottom: 14,
              padding: "13px 16px",
              borderRadius: 16,
              cursor: "pointer",
              color: "var(--text)",
              border: "none",
              background:
                "linear-gradient(110deg, rgba(124,246,184,0.13), var(--surface))",
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
            type="button"
          >
            <span
              style={{
                width: 38,
                height: 38,
                borderRadius: 12,
                background: "var(--green)",
                color: "var(--on-accent)",
                display: "grid",
                placeItems: "center",
                flexShrink: 0,
              }}
            >
              <Ico.gift style={{ color: "var(--on-accent)" }} />
            </span>
            <div
              style={{ flex: 1, minWidth: 0, fontSize: 15.5, fontWeight: 700 }}
            >
              You win{" "}
              <span
                className="ide-num"
                style={{ color: "var(--green)", fontSize: 22, fontWeight: 800 }}
              >
                {fmtClaimSol(claimableSol)} SOL
              </span>
              !!
            </div>
            <Ico.arrow style={{ color: "var(--green)", flexShrink: 0 }} />
          </button>
        ) : null}

        {/* MAIN ACTION — hidden while the round API is unreachable: `played`
            can reflect a stale on-chain guess and `entrySyncing` would be stuck
            true (the receipt never arrives), producing a false "still syncing"
            state. The error banner above already explains the situation. */}
        {apiUnavailable ? null : played ? (
          <div
            className="ide-notice"
            style={{ display: "grid", gap: 12, marginBottom: 22 }}
          >
            <button
              onClick={() => go("guesses")}
              className="ide-tap"
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                width: "100%",
                padding: 0,
                border: 0,
                background: "none",
                color: "var(--text)",
                textAlign: "left",
                fontFamily: "Archivo",
                cursor: "pointer",
                minHeight: 44,
              }}
              type="button"
            >
              <span
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  background: "var(--green)",
                  color: "var(--on-accent)",
                  display: "grid",
                  placeItems: "center",
                  flexShrink: 0,
                }}
              >
                <Ico.check />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14.5 }}>
                  You&apos;re in this round
                </div>
              </div>
              <Ico.arrow style={{ color: "var(--green)", flexShrink: 0 }} />
            </button>
            <button
              onClick={() => go("play")}
              className="ide-btn"
              style={{ width: "100%", padding: 17, fontSize: 17 }}
              type="button"
            >
              <Ico.bolt style={{ color: "var(--on-accent)" }} />
              Play again ·{" "}
              {fees.playNext === 0 ? "Free" : `${fmtSol(fees.playNext)} SOL`}
            </button>
          </div>
        ) : (
          <button
            onClick={() => go("play")}
            disabled={!turnReadyToPlay}
            className="ide-btn"
            style={{
              width: "100%",
              padding: "17px",
              fontSize: 17,
              marginBottom: 18,
              opacity: turnReadyToPlay ? 1 : 0.5,
            }}
            type="button"
          >
            <Ico.bolt style={{ color: "var(--on-accent)" }} />{" "}
            {turnReadyToPlay
              ? `Play now · ${fees.playNext === 0 ? "Free" : `${fmtSol(fees.playNext)} SOL`}`
              : turnStatusUnavailable
                ? "Refreshing turn status"
                : "Waiting for next turn"}
          </button>
        )}

        </div>
        <div>

        {/* CREATE RULE — prompt entry, no box (only the input has a border) */}
        <div style={{ marginBottom: 28 }}>
          <PromptInput />
        </div>

        {/* RULE PREVIEW → voting */}
        {/* Section head: plate title, then a rule that fills the gap, then the
            secondary exit — screens.md "Título de seção". */}
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 10,
            margin: "0 2px 10px",
          }}
        >
          <span className="ide-plate" style={{ fontSize: 22, whiteSpace: "nowrap" }}>
            The rules
          </span>
          <span
            aria-hidden="true"
            style={{
              flex: 1,
              height: 2,
              borderRadius: 999,
              background: "rgba(241,232,214,0.3)",
            }}
          />
          <button
            onClick={() => go("vote")}
            className="ide-num"
            style={{
              background: "none",
              border: "none",
              color: "var(--yellow)",
              fontSize: 11,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              whiteSpace: "nowrap",
            }}
            type="button"
          >
            vote{" "}
            <Ico.arrow style={{ color: "var(--yellow)", width: 14, height: 14 }} />
          </button>
        </div>

        {rules.loading && top.length === 0 ? (
          <div className="ide-rule-group" style={{ marginBottom: 14 }}>
            <div className="ide-rule-stack">
              {[0, 1, 2].map((i) => (
                <div key={i} className="ide-rule-skeleton" style={{ height: 64 }} />
              ))}
            </div>
          </div>
        ) : top.length === 0 ? (
          <div
            className="ide-card"
            style={{
              padding: 18,
              margin: "0 0 14px",
              textAlign: "center",
              color: "var(--muted)",
              fontSize: 14,
            }}
          >
            No rules proposed yet - be the first to create one.
          </div>
        ) : (
          <div className="ide-rule-group" style={{ marginBottom: 14 }}>
            <div className="ide-rule-stack">
            {top.map((r, i) => (
              <button
                key={r.id}
                onClick={() => openDetail(r.ruleId, { rank: i + 1 })}
                className="ide-rulerow ide-tap"
                style={{
                  boxShadow:
                    i === 0 ? "inset 0 0 0 1.5px rgba(255,46,136,0.5)" : "none",
                }}
                type="button"
              >
                <Medal pos={i + 1} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontFamily: "Oswald, sans-serif",
                      fontWeight: 500,
                      fontSize: 15.5,
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {r.title}
                  </div>
                  <div style={{ marginTop: 4 }}>
                    <VoteTally
                      approve={r.approve}
                      against={r.against}
                      size="sm"
                    />
                  </div>
                </div>
                <Ico.chevron
                  style={{
                    color: "var(--dim)",
                    transform: "rotate(-90deg)",
                    flexShrink: 0,
                  }}
                />
              </button>
            ))}
            </div>
          </div>
        )}

        <button
          onClick={() => go("vote")}
          className="ide-btn-ghost ide-btn"
          style={{ width: "100%", padding: 13, marginBottom: 4 }}
          type="button"
        >
          <Ico.vote
            style={{ color: "var(--purple-soft)", width: 19, height: 19 }}
          />{" "}
          View and vote on {rules.rules.length} rules
        </button>
        </div>
        </div>
      </div>
    </div>
  );
}
