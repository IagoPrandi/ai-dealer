"use client";

/** Rules: two-phase voting hub. Ported from app-vote.jsx, wired to live data. */
import { useEffect, useRef, useState } from "react";

import { VOTE_FEE_START_TURN } from "@idealer/constants";

import { useIdealer } from "../context";
import { fmtSol, fmtTurnId } from "../data/format";
import type { UiRule } from "../data/types";
import { Ico, Medal, VoteTally, finalistStatus, useCountdownTo } from "../shared";

type FinalistPhaseKind = "decision" | "locked" | "original_only" | "pending" | "waiting";

export function getFinalistPhaseView({
  decisionPhase,
  electionStatus,
  finalistsCount,
  roundLoading,
  shortlistPending,
}: {
  decisionPhase: boolean;
  electionStatus: null | "locked" | "original_only" | "requested" | "settled";
  finalistsCount: number;
  roundLoading: boolean;
  shortlistPending: boolean;
}): {
  body: string;
  emptyBody: string;
  emptyTitle: string;
  kind: FinalistPhaseKind;
  label: string;
} {
  if (finalistsCount > 0) {
    return decisionPhase
      ? {
          body:
            "10 finalists - 3 most voted + 7 by VRF. Vote in favor to defend a finalist or vote against to eliminate one (max 5) any time this phase. A rule falls when down-votes overtake up-votes. Survivors go to the active rule draw.",
          emptyBody: "",
          emptyTitle: "",
          kind: "decision",
          label: "Shortlist voting open",
        }
      : {
          body:
            "Elimination voting has closed for this round. The active rule is now being elected from the surviving finalists.",
          emptyBody: "Elimination voting has closed. Electing the active rule from the survivors.",
          emptyTitle: "Active rule election in progress",
          kind: "locked",
          label: "Active rule election",
        };
  }

  if (electionStatus === "original_only") {
    return {
      body:
        "No eligible alternative rule was available for this round, so the original draw is the only active path.",
      emptyBody:
        "No eligible alternative rule was available when the play window closed.",
      emptyTitle: "Original draw only",
      kind: "original_only",
      label: "Original only",
    };
  }

  if (roundLoading || shortlistPending || electionStatus === "locked" || electionStatus === "requested") {
    return {
      body:
        "Phase 1 is closed. The shortlist draw is in progress, and phase 2 starts when finalist IDs are published.",
      emptyBody:
        "The eligible pool is locked. Waiting for the VRF result that publishes the finalist shortlist.",
      emptyTitle: "Shortlist draw in progress",
      kind: "pending",
      label: "Shortlist draw",
    };
  }

  return {
    body:
      "Finalists are created after the play window closes and the eligible rule pool is locked.",
    emptyBody: "Finalists are locked when the play window closes.",
    emptyTitle: "No finalists yet",
    kind: "waiting",
    label: "Waiting for phase 2",
  };
}

function VoteGate() {
  const { fees, go } = useIdealer();
  return (
    <div className="ide-notice" style={{ marginBottom: 18, borderTopColor: "rgba(255,210,63,0.28)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
        <Ico.lock style={{ color: "var(--yellow)", width: 16, height: 16 }} />
        <b style={{ fontSize: 15 }}>Play to unlock voting</b>
      </div>
      <p style={{ margin: "0 0 13px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
        You can follow everything now. To vote, make a guess this round - it issues your round pass.
      </p>
      <button onClick={() => go("play")} className="ide-btn" style={{ width: "100%", padding: 13 }} type="button">
        <Ico.bolt style={{ color: "#08110C" }} /> Play now - {fees.playNext === 0 ? "Free" : `${fmtSol(fees.playNext)} SOL`}
      </button>
    </div>
  );
}
function RuleVoteRow({ rank, rule }: { rank: number; rule: UiRule }) {
  const { approvedIds, openDetail, played, voteApprove, voteBusyRuleId } = useIdealer();
  const approved = approvedIds.includes(rule.ruleId);
  const isTop = rank <= 3;
  const busy = voteBusyRuleId === rule.ruleId;
  const feeLabel =
    rule.nextApproveFeeSol === 0 ? "Free" : `${fmtSol(rule.nextApproveFeeSol)} SOL`;
  return (
    <div className="ide-rulerow ide-tap" style={{ borderColor: isTop ? "var(--line-2)" : "var(--line)" }}>
      <div onClick={() => openDetail(rule.ruleId, { canAgainst: false, rank })} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <Medal pos={rank} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.2 }}>{rule.title}</div>
          <div style={{ marginTop: 4 }}><VoteTally approve={rule.approve} against={rule.against} size="sm" /></div>
        </div>
      </div>
      <button
        onClick={() => (played ? voteApprove(rule.ruleId) : openDetail(rule.ruleId, { canAgainst: false, rank }))}
        disabled={busy}
        className={"ide-votebtn for" + (approved ? " on" : "")}
        style={{ flexShrink: 0, opacity: played && !busy ? 1 : 0.5 }}
        type="button"
      >
        <Ico.up style={{ color: "currentColor" }} /> {approved ? "again" : "in favor"} -{" "}
        <span className="ide-num">{feeLabel}</span>
      </button>
    </div>
  );
}
function FinalistRow({ rule }: { rule: UiRule }) {
  const { approvedIds, eliminatedIds, openDetail, played, voteApprove, voteBusyRuleId, voteEliminate } = useIdealer();
  const approved = approvedIds.includes(rule.ruleId);
  const eliminated = eliminatedIds.includes(rule.ruleId);
  const st = finalistStatus(rule);
  const total = rule.approve + rule.against;
  const forPct = total ? Math.round((rule.approve / total) * 100) : 50;
  const dead = st === "eliminada";
  const busy = voteBusyRuleId === rule.ruleId;
  const approveFeeLabel =
    rule.nextApproveFeeSol === 0 ? "Free" : `${fmtSol(rule.nextApproveFeeSol)} SOL`;
  const againstFeeLabel =
    rule.nextAgainstFeeSol === 0 ? "Free" : `${fmtSol(rule.nextAgainstFeeSol)} SOL`;
  return (
    <div className="ide-card" style={{
      padding: "13px 15px",
      borderColor: dead ? "rgba(255,107,107,0.3)" : st === "risco" ? "rgba(255,210,63,0.3)" : "var(--line)",
      opacity: dead ? 0.72 : 1,
    }}>
      <div onClick={() => openDetail(rule.ruleId, { canAgainst: true })} className="ide-tap" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 11 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15.5, lineHeight: 1.2, textDecoration: dead ? "line-through" : "none", color: dead ? "var(--muted)" : "var(--text)" }}>{rule.title}</span>
            {st === "risco" ? <span style={{ flexShrink: 0, display: "inline-flex", alignItems: "center", gap: 3, fontSize: 10, fontWeight: 700, color: "var(--yellow)" }}><Ico.flame style={{ color: "var(--yellow)", width: 11, height: 11 }} /> risk</span> : null}
            {dead ? <span style={{ flexShrink: 0, fontSize: 10, fontWeight: 700, color: "var(--red)" }}>eliminated</span> : null}
          </div>
          <div style={{ fontSize: 11, color: "var(--dim)", marginTop: 2 }}>{rule.src === "top" ? "most voted" : "VRF draw"} - {rule.handle}</div>
        </div>
        <VoteTally approve={rule.approve} against={rule.against} size="sm" />
      </div>

      <div className="ide-balance"><span style={{ width: `${forPct}%` }} /></div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 11, flexWrap: "wrap" }}>
        <span style={{ fontSize: 11.5, color: "var(--dim)" }} className="ide-num">{forPct}% in favor</span>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <button
            onClick={() => (played ? voteApprove(rule.ruleId) : openDetail(rule.ruleId, { canAgainst: true }))}
            disabled={busy}
            className={"ide-votebtn for" + (approved ? " on" : "")}
            style={{ opacity: played && !busy ? 1 : 0.5 }}
            type="button"
          >
            <Ico.up style={{ color: "currentColor" }} /> {approved ? "again" : "in favor"} -{" "}
            <span className="ide-num">{approveFeeLabel}</span>
          </button>
          <button
            onClick={() => (played ? voteEliminate(rule.ruleId) : openDetail(rule.ruleId, { canAgainst: true }))}
            disabled={busy}
            className={"ide-votebtn against" + (eliminated ? " on" : "")}
            style={{ opacity: played && !busy ? 1 : 0.5 }}
            type="button"
          >
            <Ico.down style={{ color: "currentColor" }} /> {eliminated ? "again" : "against"} -{" "}
            <span className="ide-num">{againstFeeLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function VoteScreen() {
  const {
    actionError,
    decisionPhase,
    endSeconds,
    fees,
    phase1EndsAt,
    played,
    reloadAll,
    round,
    roundLoading,
    rules,
    turnId,
    turnOpen,
  } = useIdealer();
  const [tab, setTab] = useState<"abertas" | "finalistas">(decisionPhase ? "finalistas" : "abertas");
  // Elimination voting spans all of phase 2 and closes at the turn end, so the
  // decision-window countdown is the single visible turn timer.
  const [h, m, s] = useCountdownTo(endSeconds);
  const nowSec = Math.floor(Date.now() / 1000);
  const phase1Closed =
    turnOpen &&
    phase1EndsAt !== null &&
    nowSec >= phase1EndsAt;
  const all = rules.rules;
  const finalists = all.filter((r) => r.finalist);
  const shortlistPending =
    phase1Closed &&
    finalists.length === 0 &&
    round?.election?.status !== "original_only";

  // When the play window closes or the decision window opens while this screen
  // is mounted, jump to the finalists tab once so the settlement state is clear.
  const prevDecisionPhase = useRef(decisionPhase);
  const prevPhase1Closed = useRef(phase1Closed);
  useEffect(() => {
    if ((decisionPhase && !prevDecisionPhase.current) || (phase1Closed && !prevPhase1Closed.current)) {
      setTab("finalistas");
    }
    prevDecisionPhase.current = decisionPhase;
    prevPhase1Closed.current = phase1Closed;
  }, [decisionPhase, phase1Closed]);

  const eliminatedCount = finalists.filter((r) => finalistStatus(r) === "eliminada").length;
  const finalistPhase = getFinalistPhaseView({
    decisionPhase,
    electionStatus: round?.election?.status ?? null,
    finalistsCount: finalists.length,
    roundLoading,
    shortlistPending,
  });
  const gated = !played;
  // Before turn 100, only the first same-wallet/same-rule vote is free.
  const firstVoteFree = turnId < VOTE_FEE_START_TURN;
  const voteFeeLabel = firstVoteFree ? "First vote free" : `${fmtSol(fees.vote)} SOL`;
  const displayedShortlistFeeLabel = firstVoteFree
    ? "First vote per side free"
    : `${fmtSol(fees.vote)} SOL`;

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "var(--ide-shell-content-top) 20px 96px" }}>

        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 18 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, letterSpacing: "-0.025em" }}>Rules</h1>
          <span className="ide-num" style={{ fontSize: 12.5, color: "var(--purple-soft)", fontWeight: 700, letterSpacing: "0.06em" }}>{fmtTurnId(turnId)}</span>
        </div>

        <div className="ide-tabs" style={{ marginBottom: 18 }}>
          <button className={tab === "abertas" ? "on" : ""} onClick={() => setTab("abertas")} type="button">In voting · {all.length}</button>
          <button className={tab === "finalistas" ? "on" : ""} onClick={() => setTab("finalistas")} type="button">Finalists · {finalists.length}</button>
        </div>

        {gated ? <VoteGate /> : null}
        {actionError ? (
          <div className="ide-card" style={{ padding: "11px 14px", marginBottom: 14, borderColor: "rgba(255,107,107,0.3)", color: "var(--red)", fontSize: 13 }}>{actionError}</div>
        ) : null}

        {tab === "abertas" ? (
          <>
            <p style={{ margin: "0 0 6px", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
              Vote <b style={{ color: "var(--green)" }}>in favor</b> of the rules you want in this round. The most voted become finalists.
            </p>
            <div style={{ margin: "0 0 6px", fontSize: 12.5, color: firstVoteFree ? "var(--green)" : "var(--dim)", display: "flex", alignItems: "center", gap: 5 }}>
              <Ico.up style={{ color: "currentColor", width: 12, height: 12 }} /> Vote · <span className="ide-num">{voteFeeLabel}</span> — each paid repeat doubles
            </div>
            {all.length === 0 ? (
              <div className="ide-notice" style={{ textAlign: "center", color: "var(--muted)", fontSize: 14 }}>No rules to vote on yet.</div>
            ) : (
              <div className="ide-rule-stack" style={{ margin: "0 -20px" }}>
                {all.map((r, i) => <RuleVoteRow key={r.id} rule={r} rank={i + 1} />)}
              </div>
            )}
          </>
        ) : (
          <>
            {/* decision window — section block bounded by hairlines, no balloon */}
            <div style={{ borderTop: "1px solid rgba(255,210,63,0.28)", borderBottom: "1px solid var(--line)", padding: "14px 0 16px", marginBottom: 6 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}>
                {finalistPhase.kind === "decision" ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 13, color: "var(--muted)" }}>
                    <Ico.clock style={{ color: "var(--yellow)" }} /> <span className="ide-num" style={{ fontWeight: 700, color: "var(--text)" }}>{h}:{m}:{s}</span>
                  </span>
                ) : null}
              </div>
              <p style={{ margin: "10px 0 0", fontSize: 13.5, color: "var(--muted)", lineHeight: 1.5 }}>
                {finalistPhase.body}
              </p>
              <div style={{ marginTop: 12, display: "flex", gap: 18, fontSize: 12.5, flexWrap: "wrap" }}>
                <span style={{ color: "var(--muted)" }}><span className="ide-num" style={{ color: "var(--red)", fontWeight: 700 }}>{eliminatedCount}</span> eliminated · {Math.max(0, 5 - eliminatedCount)} left</span>
                <span style={{ color: "var(--muted)" }}><span className="ide-num" style={{ color: "var(--green)", fontWeight: 700 }}>{finalists.length - eliminatedCount}</span> survivors</span>
                <span style={{ color: firstVoteFree ? "var(--green)" : "var(--muted)" }}>vote · <span className="ide-num">{displayedShortlistFeeLabel}</span></span>
              </div>
            </div>

            {finalists.length === 0 ? (
              <div className="ide-notice" style={{ borderTop: "none", color: "var(--muted)", fontSize: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: finalistPhase.kind === "pending" ? 12 : 0 }}>
                  <Ico.clock style={{ color: finalistPhase.kind === "pending" ? "var(--yellow)" : "var(--dim)", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: "var(--text)", fontWeight: 700, marginBottom: 3 }}>{finalistPhase.emptyTitle}</div>
                    <div style={{ lineHeight: 1.45 }}>{finalistPhase.emptyBody}</div>
                  </div>
                </div>
                {finalistPhase.kind === "pending" ? (
                  <button
                    className="ide-btn-ghost ide-btn"
                    onClick={reloadAll}
                    style={{ width: "100%", minHeight: 44, justifyContent: "center", padding: 12 }}
                    type="button"
                  >
                    Refresh shortlist state
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="ide-rule-stack" style={{ margin: "0 -20px" }}>
                {finalists.map((r) => <FinalistRow key={r.id} rule={r} />)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
