"use client";

/** Rules: two-phase voting hub. Ported from app-vote.jsx, wired to live data. */
import { useTyche } from "../context";
import { fmtSol, fmtTurnId } from "../data/format";
import type { UiRule } from "../data/types";
import { getRoundPhase } from "../roundPhase";
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
  const { fees, go } = useTyche();
  return (
    <div style={{ padding: "14px 16px", margin: "0 3px 18px 0", background: "var(--surface)", boxShadow: "var(--solid-5), 0 0 50px -14px rgba(255,46,136,0.5)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 7 }}>
        <Ico.lock style={{ color: "var(--yellow)", width: 16, height: 16 }} />
        <b style={{ fontFamily: "Bevan, serif", fontSize: 17, fontWeight: 400, textTransform: "uppercase" }}>Play to unlock voting</b>
      </div>
      <p style={{ margin: "0 0 13px", fontFamily: "Archivo, sans-serif", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
        You can follow everything now. To vote, make a guess this round - it issues your round pass.
      </p>
      <button onClick={() => go("play")} className="ide-btn" style={{ width: "100%", padding: 13, fontSize: 16, borderRadius: "var(--radius-btn-sm)", boxShadow: "var(--solid-4)" }} type="button">
        <Ico.bolt style={{ color: "var(--on-accent)" }} /> Play now - {fees.playNext === 0 ? "Free" : `${fmtSol(fees.playNext)} SOL`}
      </button>
    </div>
  );
}
function RuleVoteRow({ rank, rule, votingOpen }: { rank: number; rule: UiRule; votingOpen: boolean }) {
  const { approvedIds, openDetail, played, voteApprove, voteBusyRuleId } = useTyche();
  const approved = approvedIds.includes(rule.ruleId);
  const isTop = rank <= 3;
  const busy = voteBusyRuleId === rule.ruleId;
  const feeLabel =
    rule.nextApproveFeeSol === 0 ? "Free" : `${fmtSol(rule.nextApproveFeeSol)} SOL`;
  return (
    <div className="ide-rulerow ide-tap" style={{ boxShadow: isTop ? "inset 0 0 0 1.5px rgba(255,46,136,0.5)" : "var(--ring)" }}>
      <div onClick={() => openDetail(rule.ruleId, { canAgainst: false, rank })} style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
        <Medal pos={rank} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 500, fontSize: 15, letterSpacing: "0.04em", textTransform: "uppercase", lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.title}</div>
          <div style={{ marginTop: 4 }}><VoteTally approve={rule.approve} against={rule.against} size="sm" /></div>
        </div>
      </div>
      <button
        onClick={() => (played ? voteApprove(rule.ruleId) : openDetail(rule.ruleId, { canAgainst: false, rank }))}
        disabled={busy || !votingOpen}
        className={"ide-votebtn for" + (approved ? " on" : "")}
        style={{ flexShrink: 0, opacity: played && votingOpen && !busy ? 1 : 0.5 }}
        type="button"
      >
        <Ico.up style={{ color: "currentColor" }} /> {approved ? "again" : "in favor"} -{" "}
        <span className="ide-num">{feeLabel}</span>
      </button>
    </div>
  );
}
function FinalistRow({ rule, votingOpen }: { rule: UiRule; votingOpen: boolean }) {
  const { approvedIds, eliminatedIds, openDetail, played, voteApprove, voteBusyRuleId, voteEliminate } = useTyche();
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
      boxShadow: dead
        ? "var(--ring-red)"
        : st === "risco"
          ? "var(--ring-yellow), var(--solid-yellow)"
          : "var(--ring-cyan), var(--solid-cyan-5)",
      marginRight: dead ? 0 : 5,
      opacity: dead ? 0.65 : 1,
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
            disabled={busy || !votingOpen || dead}
            className={"ide-votebtn for" + (approved ? " on" : "")}
            style={{ opacity: played && votingOpen && !dead && !busy ? 1 : 0.5 }}
            type="button"
          >
            <Ico.up style={{ color: "currentColor" }} /> {approved ? "again" : "in favor"} -{" "}
            <span className="ide-num">{approveFeeLabel}</span>
          </button>
          <button
            onClick={() => (played ? voteEliminate(rule.ruleId) : openDetail(rule.ruleId, { canAgainst: true }))}
            disabled={busy || !votingOpen || dead}
            className={"ide-votebtn against" + (eliminated ? " on" : "")}
            style={{ opacity: played && votingOpen && !dead && !busy ? 1 : 0.5 }}
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
    endSeconds,
    phase1EndsAt,
    played,
    reloadAll,
    round,
    roundLoading,
    rules,
    turnId,
    turnState,
  } = useTyche();
  // Elimination voting spans all of phase 2 and closes at the turn end, so the
  // turn countdown in the header is the single visible timer of this screen.
  const [h, m, s] = useCountdownTo(endSeconds);
  const nowSec = Math.floor(Date.now() / 1000);
  const phase = getRoundPhase({ nowSeconds: nowSec, phase1EndsAt, turn: turnState });
  const phase1Open = phase === "create_play";
  const finalistVotingOpen = phase === "shortlist_vote";
  // Do not let a stale tab selection expose phase-1 rules after the on-chain
  // cutoff. The displayed content follows the authoritative phase instead.
  const tab = phase1Open ? "abertas" : "finalistas";
  const setTab = (...args: ["abertas" | "finalistas"]) => void args;
  const all = rules.rules;
  const finalists = all.filter((r) => r.finalist);
  const shortlistPending =
    phase === "shortlist_selection" &&
    finalists.length === 0 &&
    round?.election?.status !== "original_only";

  const finalistPhase = getFinalistPhaseView({
    decisionPhase: finalistVotingOpen,
    electionStatus: round?.election?.status ?? null,
    finalistsCount: finalists.length,
    roundLoading,
    shortlistPending,
  });
  const gated = !played;

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "var(--ide-shell-content-top) 20px 96px" }}>

        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
          <h1 className="ide-plate" style={{ fontSize: 25, margin: 0 }}>Rules</h1>
          <div style={{ display: "grid", gap: 3, justifyItems: "end" }}>
            <span className="ide-num" style={{ fontSize: 12.5, color: "var(--purple-soft)", fontWeight: 700, letterSpacing: "0.06em" }}>{fmtTurnId(turnId)}</span>
            {endSeconds !== null ? (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 5, fontSize: 12.5, color: "var(--muted)", whiteSpace: "nowrap" }}>
                <Ico.clock style={{ color: "var(--yellow)", width: 13, height: 13 }} /> <span className="ide-num" style={{ color: "var(--text)", fontWeight: 700 }}>{h}:{m}:{s}</span>
              </span>
            ) : null}
          </div>
        </div>

        <div className={`ide-tabs ${phase1Open ? "ide-phase-create" : "ide-phase-finalists"}`} style={{ marginBottom: 18 }}>
          <button className={tab === "abertas" ? "on" : ""} onClick={() => setTab("abertas")} type="button">In voting · {all.length}</button>
          <button className={tab === "finalistas" ? "on" : ""} onClick={() => setTab("finalistas")} type="button">Finalists · {finalists.length}</button>
        </div>

        {gated ? <VoteGate /> : null}
        {phase === "unavailable" ? (
          <div className="ide-notice" style={{ marginBottom: 18, borderTopColor: "rgba(255,59,47,0.28)" }}>
            Live round status is unavailable. Voting is disabled until it reloads.
          </div>
        ) : null}
        {actionError ? (
          <div className="ide-card" style={{ padding: "11px 14px", marginBottom: 14, borderColor: "rgba(255,59,47,0.3)", color: "var(--red)", fontSize: 13 }}>{actionError}</div>
        ) : null}

        {tab === "abertas" ? (
          <>
            {all.length === 0 ? (
              <div className="ide-notice" style={{ textAlign: "center", color: "var(--muted)", fontSize: 14 }}>No rules to vote on yet.</div>
            ) : (
              <div className="ide-rule-group">
                <div className="ide-rule-stack">
                  {all.map((r, i) => <RuleVoteRow key={r.id} rule={r} rank={i + 1} votingOpen />)}
                </div>
              </div>
            )}
          </>
        ) : (
          <>
            {/* No standing annotation above the finalists: the rows carry the
                state (risk, eliminated, tallies, fees) and the header carries
                the turn countdown. The phase copy below still speaks when there
                is nothing to show. */}
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
              <div className="ide-rule-group">
                <div className="ide-rule-stack">
                  {finalists.map((r) => <FinalistRow key={r.id} rule={r} votingOpen={finalistVotingOpen} />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
