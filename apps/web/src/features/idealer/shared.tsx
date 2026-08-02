"use client";

/**
 * Shared icons, mascot, badges, the rule-detail bottom sheet, and the live
 * countdown / prize hooks. Ported from the design handoff's `shared.jsx`
 * (window globals replaced with ES exports; copy translated to English).
 */
import { useEffect, useState, type CSSProperties, type SVGProps } from "react";

import { fmtCountdown, fmtSol } from "./data/format";
import type { UiRule } from "./data/types";

type IconProps = SVGProps<SVGSVGElement>;
type IconComponent = (props: IconProps) => React.ReactElement;

/* ----------------------------- ICONS ----------------------------- */
export const Ico = {
  arrow: (p) => (<svg viewBox="0 0 24 24" fill="none" width="20" height="20" {...p}><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  wallet: (p) => (<svg viewBox="0 0 24 24" fill="none" width="18" height="18" {...p}><rect x="3" y="6" width="18" height="13" rx="3" stroke="currentColor" strokeWidth="2"/><path d="M16 12h2" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M3 9h13a2 2 0 012 2" stroke="currentColor" strokeWidth="2"/></svg>),
  bolt: (p) => (<svg viewBox="0 0 24 24" fill="currentColor" width="18" height="18" {...p}><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z"/></svg>),
  up: (p) => (<svg viewBox="0 0 24 24" fill="none" width="16" height="16" {...p}><path d="M12 19V5M6 11l6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  down: (p) => (<svg viewBox="0 0 24 24" fill="none" width="16" height="16" {...p}><path d="M12 5v14M18 13l-6 6-6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  chevron: (p) => (<svg viewBox="0 0 24 24" fill="none" width="18" height="18" {...p}><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  close: (p) => (<svg viewBox="0 0 24 24" fill="none" width="20" height="20" {...p}><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>),
  clock: (p) => (<svg viewBox="0 0 24 24" fill="none" width="14" height="14" {...p}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  users: (p) => (<svg viewBox="0 0 24 24" fill="none" width="15" height="15" {...p}><circle cx="9" cy="8" r="3.2" stroke="currentColor" strokeWidth="2"/><path d="M3.5 19a5.5 5.5 0 0111 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><path d="M16 5.5a3.2 3.2 0 010 5M17.5 19a5.5 5.5 0 00-2-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  spark: (p) => (<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16" {...p}><path d="M12 2l1.8 6.4L20 10l-6.2 1.6L12 18l-1.8-6.4L4 10l6.2-1.6L12 2z"/></svg>),
  trophy: (p) => (<svg viewBox="0 0 24 24" fill="none" width="18" height="18" {...p}><path d="M7 4h10v4a5 5 0 01-10 0V4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M9 15h6M10 19h4M12 15v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  send: (p) => (<svg viewBox="0 0 24 24" fill="none" width="20" height="20" {...p}><path d="M5 12h13M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  home: (p) => (<svg viewBox="0 0 24 24" fill="none" width="22" height="22" {...p}><path d="M4 11l8-7 8 7M6 9.5V20h12V9.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  user: (p) => (<svg viewBox="0 0 24 24" fill="none" width="22" height="22" {...p}><circle cx="12" cy="8" r="3.5" stroke="currentColor" strokeWidth="2"/><path d="M5 20a7 7 0 0114 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  plus: (p) => (<svg viewBox="0 0 24 24" fill="none" width="24" height="24" {...p}><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>),
  back: (p) => (<svg viewBox="0 0 24 24" fill="none" width="22" height="22" {...p}><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  check: (p) => (<svg viewBox="0 0 24 24" fill="none" width="18" height="18" {...p}><path d="M5 12.5l4.5 4.5L19 7" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  dice: (p) => (<svg viewBox="0 0 24 24" fill="none" width="18" height="18" {...p}><rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="2"/><circle cx="8.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="15.5" r="1.4" fill="currentColor"/><circle cx="15.5" cy="8.5" r="1.4" fill="currentColor"/><circle cx="8.5" cy="15.5" r="1.4" fill="currentColor"/></svg>),
  withdraw: (p) => (<svg viewBox="0 0 24 24" fill="none" width="18" height="18" {...p}><path d="M12 3v11m0 0l-4-4m4 4l4-4" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/><path d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>),
  copy: (p) => (<svg viewBox="0 0 24 24" fill="none" width="15" height="15" {...p}><rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2"/><path d="M5 15H4.5A1.5 1.5 0 013 13.5V4.5A1.5 1.5 0 014.5 3h9A1.5 1.5 0 0115 4.5V5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  gift: (p) => (<svg viewBox="0 0 24 24" fill="none" width="18" height="18" {...p}><rect x="4" y="9" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M3 9h18M12 9v11M12 9S9 3 6.5 5s2.5 4 5.5 4c3 0 6.5 1 5-4S12 9 12 9z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>),
  vote: (p) => (<svg viewBox="0 0 24 24" fill="none" width="22" height="22" {...p}><path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><rect x="3.5" y="4.5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="2"/></svg>),
  chat: (p) => (<svg viewBox="0 0 24 24" fill="none" width="17" height="17" {...p}><path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v8a2 2 0 01-2 2H9l-4 4v-4H6a2 2 0 01-2-2V6z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>),
  edit: (p) => (<svg viewBox="0 0 24 24" fill="none" width="16" height="16" {...p}><path d="M4 20h4L18.5 9.5a2 2 0 000-3l-1-1a2 2 0 00-3 0L4 16v4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M13.5 7.5l3 3" stroke="currentColor" strokeWidth="2"/></svg>),
  flame: (p) => (<svg viewBox="0 0 24 24" fill="none" width="16" height="16" {...p}><path d="M12 3s5 4 5 9a5 5 0 01-10 0c0-1.6.7-3 1.5-4 .2 1 .9 1.8 1.7 1.8C12 10.6 11 7 12 3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>),
  lock: (p) => (<svg viewBox="0 0 24 24" fill="none" width="14" height="14" {...p}><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V8a4 4 0 018 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  unlock: (p) => (<svg viewBox="0 0 24 24" fill="none" width="17" height="17" {...p}><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2"/><path d="M8 11V7a4 4 0 017-2.7" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  bell: (p) => (<svg viewBox="0 0 24 24" fill="none" width="20" height="20" {...p}><path d="M6 16v-4.5a6 6 0 0112 0V16l1.8 2.2H4.2L6 16z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><path d="M10 20a2 2 0 004 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>),
  coin: (p) => (<svg viewBox="0 0 24 24" fill="none" width="22" height="22" {...p}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 6.6v10.8M14.4 9.3c-.4-.9-1.3-1.4-2.4-1.4-1.4 0-2.4.7-2.4 1.8 0 2.5 5 1.3 5 3.9 0 1.2-1.1 1.9-2.6 1.9-1.2 0-2.2-.5-2.6-1.4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></svg>),
  shield: (p) => (<svg viewBox="0 0 24 24" fill="none" width="16" height="16" {...p}><path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>),
  info: (p) => (<svg viewBox="0 0 24 24" fill="none" width="15" height="15" {...p}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2"/><path d="M12 11v5" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/><circle cx="12" cy="7.6" r="1.2" fill="currentColor"/></svg>),
} satisfies Record<string, IconComponent>;

/* ----------------------------- HOOKS ----------------------------- */

/** Live countdown to an absolute epoch-seconds target. Ticks every second. */
export function useCountdownTo(endSeconds: null | number): [string, string, string] {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const id = window.setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => window.clearInterval(id);
  }, []);
  const remaining = endSeconds === null ? 0 : Math.max(0, endSeconds - now);
  return fmtCountdown(remaining);
}

/** Eased "count up to target" used for the prize hero. */
export function useLivePrize(target: number): number {
  const [val, setVal] = useState(() => Math.max(0, target - 1.4));
  useEffect(() => {
    const from = Math.max(0, target - 1.4);
    const steps = 46;
    let i = 0;
    const id = window.setInterval(() => {
      i++;
      const p = i / steps;
      const e = 1 - Math.pow(1 - p, 3);
      setVal(i >= steps ? target : from + (target - from) * e);
      if (i >= steps) {
        window.clearInterval(id);
      }
    }, 26);
    return () => window.clearInterval(id);
  }, [target]);
  return val;
}

/* ----------------------------- MASCOT / BADGES ----------------------------- */

export function Dealer({ size = 38 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id="dlrg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#C77DFF" /><stop offset="1" stopColor="#14F195" />
        </linearGradient>
      </defs>
      <circle cx="24" cy="25" r="15" fill="#1E1830" stroke="url(#dlrg)" strokeWidth="2" />
      <path d="M11 16c2.5-5 23-5 26 0l-2 2H13l-2-2z" fill="url(#dlrg)" />
      <rect x="9" y="15.5" width="30" height="2.6" rx="1.3" fill="url(#dlrg)" />
      <circle cx="19" cy="24" r="2.1" fill="#14F195" />
      <circle cx="29" cy="24" r="2.1" fill="#14F195" />
      <path d="M19 30c2.6 2.4 7.4 2.4 10 0" stroke="#C77DFF" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Medal({ pos }: { pos: number }) {
  const map: Record<number, { c: string; l: string }> = {
    1: { c: "var(--gold)", l: "1st" },
    2: { c: "var(--silver)", l: "2nd" },
    3: { c: "var(--bronze)", l: "3rd" },
  };
  const m = map[pos];
  if (!m) {
    return <span className="ide-num" style={{ width: 26, textAlign: "center", color: "var(--dim)", fontWeight: 700, fontSize: 15 }}>{pos}</span>;
  }
  return (
    <span className="ide-num" style={{
      width: 26, height: 26, borderRadius: 9, display: "grid", placeItems: "center",
      fontSize: 12, fontWeight: 800, color: "#0B0910",
      background: m.c, boxShadow: `0 0 14px -2px ${m.c}`,
    }}>{m.l}</span>
  );
}

export function VoteTally({ approve, against, size = "md" }: { against: number; approve: number; size?: "md" | "sm" }) {
  const sm = size === "sm";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: sm ? 9 : 12 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--green)", fontSize: sm ? 12.5 : 13.5 }}>
        <Ico.up style={{ color: "var(--green)", width: sm ? 13 : 15, height: sm ? 13 : 15 }} />
        <span className="ide-num" style={{ fontWeight: 700 }}>{approve}</span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: against > 0 ? "var(--red)" : "var(--dim)", fontSize: sm ? 12.5 : 13.5 }}>
        <Ico.down style={{ color: against > 0 ? "var(--red)" : "var(--dim)", width: sm ? 13 : 15, height: sm ? 13 : 15 }} />
        <span className="ide-num" style={{ fontWeight: 700 }}>{against}</span>
      </span>
    </div>
  );
}

/** Status of a finalist during the elimination window. */
export function finalistStatus(r: { against: number; approve: number; finalist: boolean }): null | "eliminada" | "risco" | "segura" {
  if (!r.finalist) {
    return null;
  }
  if (r.against > r.approve) {
    return "eliminada";
  }
  if (r.against >= r.approve * 0.8) {
    return "risco";
  }
  return "segura";
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--dim)" }}>{children}</div>;
}

export function Meta({ label, value, mono }: { label: string; mono?: boolean; value: React.ReactNode }) {
  return (
    <div className="ide-metric">
      <div style={{ fontSize: 11.5, color: "var(--dim)", marginBottom: 5, letterSpacing: "0.03em" }}>{label}</div>
      <div className={mono ? "ide-num" : ""} style={{ fontSize: 15, fontWeight: 600, color: "var(--text)" }}>{value}</div>
    </div>
  );
}

/* ------------------------ OVERLAY: RULE DETAIL ------------------------ */

export interface RuleDetailVote {
  approved: boolean;
  busy?: boolean;
  canAgainst: boolean;
  canRemove: boolean;
  eliminated: boolean;
  onApprove: () => void;
  onEliminate: () => void;
  onPlayToRemove: () => void;
  onRemove: () => void;
  played: boolean;
  removeBusy?: boolean;
  removeFeeSol: number;
}

export function canShowRuleRemovalAction(
  rule: Pick<UiRule, "finalist" | "mine" | "removed">,
) {
  return rule.mine && !rule.finalist && !rule.removed;
}

export function RuleDetail({
  onClose,
  rank,
  rule,
  vote,
}: {
  onClose: () => void;
  rank?: number | null;
  rule: UiRule;
  vote?: RuleDetailVote | null;
}) {
  const st = finalistStatus(rule);
  const approved = vote && vote.approved;
  const eliminated = vote && vote.eliminated;
  const removalUnlocked = vote?.played && vote.canRemove && !rule.removed;
  const removalGated = vote && !vote.played && vote.canRemove && !rule.removed;
  const balance = rule.approve - rule.against;
  const cardStyle: CSSProperties = {
    width: "100%", maxHeight: "90%", overflowY: "auto", WebkitOverflowScrolling: "touch", overscrollBehavior: "contain",
    background: "var(--bg-2)", borderTopLeftRadius: 28, borderTopRightRadius: 28,
    border: "1px solid var(--line-2)", borderBottom: "none",
    padding: "10px 20px 28px", animation: "ide-rise .32s cubic-bezier(.2,.8,.3,1) both",
  };
  return (
    <div onClick={onClose} style={{
      position: "absolute", inset: 0, zIndex: 60, display: "flex", alignItems: "flex-end",
      background: "rgba(6,4,10,0.62)", backdropFilter: "blur(6px)",
      animation: "ide-rise .2s ease both",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="ide-scroll" style={cardStyle}>
        <div style={{ width: 40, height: 5, borderRadius: 3, background: "var(--line-2)", margin: "0 auto 18px" }} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {rank && rank <= 3 ? <Medal pos={rank} /> : null}
            {rule.finalist ? <span className="ide-pill" style={{ color: "var(--purple-soft)", borderColor: "rgba(199,125,255,0.3)" }}><Ico.shield style={{ color: "var(--purple-soft)", width: 13, height: 13 }} /> finalist</span> : null}
            {rule.removed ? <span className="ide-pill" style={{ color: "var(--red)", borderColor: "rgba(255,107,107,0.3)" }}><Ico.close style={{ color: "var(--red)", width: 13, height: 13 }} /> Removed</span> : null}
            {st === "eliminada" ? <span className="ide-pill" style={{ color: "var(--red)", borderColor: "rgba(255,107,107,0.3)" }}>eliminated</span> : null}
            {st === "risco" ? <span className="ide-pill" style={{ color: "var(--yellow)", borderColor: "rgba(255,210,63,0.3)" }}><Ico.flame style={{ color: "var(--yellow)", width: 12, height: 12 }} /> at risk</span> : null}
          </div>
          <button onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--muted)", borderRadius: 12, padding: 7, display: "grid", placeItems: "center", cursor: "pointer" }}>
            <Ico.close />
          </button>
        </div>
        <h2 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{rule.title}</h2>
        <p style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 16, lineHeight: 1.5 }}>{rule.summary}</p>

        <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", marginBottom: 18 }}>
          <VoteTally approve={rule.approve} against={rule.against} />
          {rule.finalist ? <span style={{ marginLeft: "auto", fontSize: 12, color: st === "eliminada" ? "var(--red)" : "var(--dim)" }}>{st === "eliminada" ? "down-votes overtook" : "balance " + (balance >= 0 ? "+" : "") + balance}</span> : null}
        </div>

        {vote?.played ? (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: vote.canAgainst ? 22 : 8 }}>
              <button onClick={() => vote.onApprove()} disabled={vote.busy} className={"ide-votebtn for" + (approved ? " on" : "")} style={{ flex: 1, justifyContent: "center", padding: "13px", fontSize: 14.5, opacity: vote.busy ? 0.6 : 1 }}>
                {approved ? <><Ico.check style={{ color: "currentColor" }} /> in favor</> : <><Ico.up style={{ color: "currentColor" }} /> vote in favor</>}
              </button>
              <button onClick={() => vote.canAgainst && vote.onEliminate()} disabled={!vote.canAgainst || vote.busy} className={"ide-votebtn against" + (eliminated ? " on" : "")} style={{ flex: 1, justifyContent: "center", padding: "13px", fontSize: 14.5, opacity: vote.canAgainst && !vote.busy ? 1 : 0.4, pointerEvents: vote.canAgainst ? "auto" : "none" }}>
                {eliminated ? <><Ico.check style={{ color: "currentColor" }} /> against</> : <><Ico.down style={{ color: "currentColor" }} /> vote against</>}
              </button>
            </div>
            {!vote.canAgainst ? <p style={{ margin: "0 0 20px", fontSize: 12, color: "var(--dim)", display: "flex", alignItems: "center", gap: 6 }}><Ico.info style={{ color: "var(--dim)" }} /> Voting against is only allowed in the finalist phase.</p> : null}
          </>
        ) : null}

        {removalUnlocked ? (
          <div style={{ margin: "0 0 20px", padding: "13px", background: "rgba(255,107,107,0.08)", border: "1px solid rgba(255,107,107,0.22)", borderRadius: 16 }}>
            <button
              className="ide-votebtn against"
              disabled={vote.removeBusy}
              onClick={() => vote.onRemove()}
              style={{ width: "100%", justifyContent: "center", padding: "13px", fontSize: 14.5, opacity: vote.removeBusy ? 0.6 : 1 }}
              type="button"
            >
              <Ico.close style={{ color: "currentColor" }} />
              {vote.removeBusy ? "Removing..." : `Remove · ${fmtSol(vote.removeFeeSol)} SOL`}
            </button>
            <p style={{ margin: "10px 2px 0", fontSize: 12, color: "var(--muted)", lineHeight: 1.45 }}>
              Creator removal keeps the rule in the ledger and marks it as removed.
            </p>
          </div>
        ) : null}

        {removalGated ? (
          <div style={{ margin: "0 0 20px", padding: "13px", background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 16 }}>
            <p style={{ margin: "0 0 10px", fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
              <Ico.lock style={{ color: "var(--dim)" }} /> Play this round before removing your rule.
            </p>
            <button className="ide-btn" onClick={() => vote.onPlayToRemove()} style={{ width: "100%", justifyContent: "center" }} type="button">
              Play to remove
            </button>
          </div>
        ) : null}

        {rule.removed ? (
          <p style={{ margin: "0 0 20px", fontSize: 12.5, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>
            <Ico.info style={{ color: "var(--dim)" }} /> This rule was removed by a paid on-chain action and remains visible for auditability.
          </p>
        ) : null}

        <SectionLabel>How it works</SectionLabel>
        <p style={{ margin: "8px 0 22px", fontSize: 16, lineHeight: 1.6, color: "var(--text)" }}>{rule.how}</p>

        {rule.seed ? (
          <>
            <SectionLabel>Prompt seed</SectionLabel>
            <div style={{ margin: "10px 0 24px", fontSize: 16, lineHeight: 1.6, color: "var(--purple-soft)", fontStyle: "italic" }}>
              “{rule.seed}”
            </div>
          </>
        ) : null}

        <SectionLabel>Details</SectionLabel>
        <div style={{ display: "grid", gap: 10, margin: "10px 0 22px" }}>
          <div style={{ alignItems: "baseline", display: "flex", gap: 8, minWidth: 0 }}>
            <span style={{ color: "var(--dim)", flexShrink: 0, fontSize: 11.5, letterSpacing: "0.03em" }}>Created by</span>
            <span className="ide-num" style={{ color: "var(--text)", fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.handle}</span>
          </div>
          <div style={{ alignItems: "baseline", display: "flex", gap: 8, minWidth: 0 }}>
            <span style={{ color: "var(--dim)", flexShrink: 0, fontSize: 11.5, letterSpacing: "0.03em" }}>When</span>
            <span style={{ color: "var(--text)", fontSize: 13, fontWeight: 600, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rule.created}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Confetti() {
  const cols = ["#9945FF", "#14F195", "#FFD23F", "#C77DFF"];
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 5 }}>
      {Array.from({ length: 28 }).map((_, i) => (
        <span key={i} style={{
          position: "absolute", top: -20, left: `${(i * 37) % 100}%`,
          width: 8, height: 12, background: cols[i % 4], borderRadius: 2,
          animation: `ide-confetti ${1.6 + (i % 5) * 0.3}s ${(i % 7) * 0.12}s ease-in forwards`,
        }} />
      ))}
    </div>
  );
}

export function ScreenHead({ onBack, right, title }: { onBack: () => void; right?: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
      <button onClick={onBack} style={{ width: 40, height: 40, borderRadius: 13, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--text)", display: "grid", placeItems: "center", cursor: "pointer", flexShrink: 0 }}><Ico.back /></button>
      <h1 style={{ fontSize: 21, fontWeight: 800, margin: 0, flex: 1, letterSpacing: "-0.02em" }}>{title}</h1>
      {right}
    </div>
  );
}
