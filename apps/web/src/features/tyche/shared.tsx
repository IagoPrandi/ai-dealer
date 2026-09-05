"use client";

/**
 * Shared icons, mascot, badges, the rule-detail bottom sheet, and the live
 * countdown / prize hooks. Ported from the design handoff's `shared.jsx`
 * (window globals replaced with ES exports; copy translated to English).
 */
import Image from "next/image";
import { useEffect, useState, type CSSProperties, type SVGProps } from "react";

import { useTyche } from "./context";
import { fmtCountdown, fmtSol, fmtTurnId, timeAgo, truncateAddress } from "./data/format";
import type { ConversationDraftApi, UiRule } from "./data/types";
import { isPreflightJobPointerFresh } from "./preflightJobStore";

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
    <span
      aria-hidden="true"
      className="ide-dealer"
      style={{ height: size, width: size }}
    >
      <Image
        alt=""
        className="ide-dealer-image"
        fill
        sizes={`${size}px`}
        src="/illustrations/logo-deusa-vetorizada.svg?v=goddess-magenta-v1"
        unoptimized
      />
    </span>
  );
}

/**
 * Wallet pill of the round header. Shared so every screen that shows the
 * wallet — the round, the account head — carries the same control instead of
 * a per-screen copy. It keeps the truncated address on one line and trades
 * padding and type size for width on narrow shells, where the head also has
 * to hold the brand mark and the screen title.
 */
export function WalletButton() {
  const { connect, connected, go, walletAddress } = useTyche();
  return (
    <button
      onClick={() => (connected ? go("profile") : connect())}
      className="ide-btn"
      style={{
        flexShrink: 0, whiteSpace: "nowrap",
        padding: "clamp(8px, 2.5vw, 10px) clamp(11px, 4vw, 16px)",
        borderRadius: "var(--radius-pill)",
        fontFamily: "Oswald, sans-serif", fontSize: "clamp(11px, 3.4vw, 13px)", fontWeight: 600,
        letterSpacing: "0.14em",
        boxShadow: "var(--solid-4), var(--halo-magenta)",
      }}
      type="button"
    >
      <Ico.wallet style={{ color: "var(--on-accent)" }} />{" "}
      {connected && walletAddress ? truncateAddress(walletAddress) : "Connect"}
    </button>
  );
}

/**
 * Rank index. 3a shows the position as a square Bevan plate: gold for 1st, a
 * bone outline for 2nd, bronze for 3rd, a neutral outline beyond that.
 */
export function Medal({ pos }: { pos: number }) {
  const base: CSSProperties = {
    width: 30, height: 30, flexShrink: 0, display: "grid", placeItems: "center",
    borderRadius: 0, fontFamily: "Bevan, serif", fontSize: 13, fontWeight: 400,
  };
  const fill: Record<number, string> = {
    1: "var(--gold)",
    3: "var(--bronze)",
  };
  const label = String(pos).padStart(2, "0");
  if (pos === 2) {
    return <span style={{ ...base, color: "var(--text)", boxShadow: "inset 0 0 0 1.5px rgba(241,232,214,0.4)" }}>{label}</span>;
  }
  const bg = fill[pos];
  if (!bg) {
    return <span style={{ ...base, color: "var(--muted)", boxShadow: "var(--ring)" }}>{label}</span>;
  }
  return <span style={{ ...base, background: bg, color: "var(--on-accent)" }}>{label}</span>;
}

export function VoteTally({ approve, against, size = "md" }: { against: number; approve: number; size?: "md" | "sm" }) {
  const sm = size === "sm";
  return (
    // Approve reads cyan, against reads red once it is non-zero and stays dim
    // at zero. The arrows remain SVG rather than ▲/▼ glyphs so the accessible
    // text content — which the e2e suite matches on — is unchanged.
    <div style={{ display: "flex", alignItems: "center", gap: sm ? 9 : 11 }}>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "var(--cyan)", fontSize: sm ? 11 : 11.5 }}>
        <Ico.up style={{ color: "var(--cyan)", width: sm ? 12 : 13, height: sm ? 12 : 13 }} />
        <span className="ide-num">{approve}</span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: against > 0 ? "var(--red)" : "var(--dim)", fontSize: sm ? 11 : 11.5 }}>
        <Ico.down style={{ color: against > 0 ? "var(--red)" : "var(--dim)", width: sm ? 12 : 13, height: sm ? 12 : 13 }} />
        <span className="ide-num">{against}</span>
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
  return <div className="ide-eyebrow">{children}</div>;
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
    background: "var(--surface)", borderRadius: 0, border: "none",
    boxShadow: "0 -6px 0 var(--orange), 0 -40px 90px -20px rgba(255,46,136,0.55)",
    padding: "14px 20px 28px", animation: "ide-rise .32s cubic-bezier(.2,.8,.3,1) both",
  };
  return (
    <div onClick={onClose} className="ide-overlay is-sheet ide-rule-detail-overlay" style={{
      position: "absolute", inset: 0, zIndex: 60, display: "flex",
      background: "rgba(6,4,10,0.62)", backdropFilter: "blur(6px)",
      animation: "ide-rise .2s ease both",
    }}>
      <div onClick={(e) => e.stopPropagation()} className="ide-scroll ide-overlay-card ide-rule-detail-dialog" style={cardStyle}>
        <div className="ide-rule-detail-handle" style={{ width: 40, height: 5, borderRadius: 3, background: "var(--line-2)", margin: "0 auto 18px" }} />
        <div className="ide-rule-detail-dialog-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span className="ide-desktop-only ide-rule-detail-dialog-label">Rule detail</span>
            {rank && rank <= 3 ? <Medal pos={rank} /> : null}
            {rule.finalist ? <span className="ide-pill" style={{ color: "var(--purple-soft)", borderColor: "rgba(255,122,184,0.3)" }}><Ico.shield style={{ color: "var(--purple-soft)", width: 13, height: 13 }} /> finalist</span> : null}
            {rule.removed ? <span className="ide-pill" style={{ color: "var(--red)", borderColor: "rgba(255,59,47,0.3)" }}><Ico.close style={{ color: "var(--red)", width: 13, height: 13 }} /> Removed</span> : null}
            {st === "eliminada" ? <span className="ide-pill" style={{ color: "var(--red)", borderColor: "rgba(255,59,47,0.3)" }}>eliminated</span> : null}
            {st === "risco" ? <span className="ide-pill" style={{ color: "var(--yellow)", borderColor: "rgba(255,210,63,0.3)" }}><Ico.flame style={{ color: "var(--yellow)", width: 12, height: 12 }} /> at risk</span> : null}
          </div>
          <button className="ide-rule-detail-close" aria-label="Close rule detail" onClick={onClose} style={{ background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--muted)", borderRadius: 12, padding: 7, display: "grid", placeItems: "center", cursor: "pointer" }}>
            <Ico.close />
          </button>
        </div>
        <h2 className="ide-rule-detail-dialog-title" style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, letterSpacing: "-0.02em" }}>{rule.title}</h2>
        <p className="ide-rule-detail-dialog-summary" style={{ margin: "0 0 16px", color: "var(--muted)", fontSize: 16, lineHeight: 1.5 }}>{rule.summary}</p>

        <div className="ide-rule-detail-dialog-tally" style={{ display: "flex", alignItems: "center", gap: 16, padding: "14px 0", borderTop: "1px solid var(--line)", borderBottom: "1px solid var(--line)", marginBottom: 18 }}>
          <VoteTally approve={rule.approve} against={rule.against} />
          {rule.finalist ? <span style={{ marginLeft: "auto", fontSize: 12, color: st === "eliminada" ? "var(--red)" : "var(--dim)" }}>{st === "eliminada" ? "down-votes overtook" : "balance " + (balance >= 0 ? "+" : "") + balance}</span> : null}
        </div>

        {vote?.played ? (
          <>
            <div className="ide-rule-detail-dialog-actions" style={{ display: "flex", gap: 10, marginBottom: vote.canAgainst ? 22 : 8 }}>
              <button onClick={() => vote.onApprove()} disabled={vote.busy} className={"ide-votebtn for" + (approved ? " on" : "")} style={{ flex: 1, justifyContent: "center", padding: "13px", fontSize: 14.5, opacity: vote.busy ? 0.6 : 1 }}>
                {approved ? <><Ico.check style={{ color: "currentColor" }} /> in favor</> : <><Ico.up style={{ color: "currentColor" }} /> vote in favor</>}
              </button>
              <button onClick={() => vote.canAgainst && vote.onEliminate()} disabled={!vote.canAgainst || vote.busy} className={"ide-votebtn against" + (eliminated ? " on" : "")} style={{ flex: 1, justifyContent: "center", padding: "13px", fontSize: 14.5, opacity: vote.canAgainst && !vote.busy ? 1 : 0.4, pointerEvents: vote.canAgainst ? "auto" : "none" }}>
                {eliminated ? <><Ico.check style={{ color: "currentColor" }} /> against</> : <><Ico.down style={{ color: "currentColor" }} /> vote against</>}
              </button>
            </div>
            {!vote.canAgainst ? <p className="ide-rule-detail-dialog-hint" style={{ margin: "0 0 20px", fontSize: 12, color: "var(--dim)", display: "flex", alignItems: "center", gap: 6 }}><Ico.info style={{ color: "var(--dim)" }} /> Voting against is only allowed in the finalist phase.</p> : null}
          </>
        ) : null}

        {removalUnlocked ? (
          <div style={{ margin: "0 0 20px", padding: "13px", background: "rgba(255,59,47,0.08)", border: "1px solid rgba(255,59,47,0.22)", borderRadius: 16 }}>
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
        <p className="ide-rule-detail-dialog-how" style={{ margin: "8px 0 22px", fontSize: 16, lineHeight: 1.6, color: "var(--text)" }}>{rule.how}</p>

        {rule.seed ? (
          <>
            <SectionLabel>Prompt seed</SectionLabel>
            <div className="ide-rule-detail-dialog-seed" style={{ margin: "10px 0 24px", fontSize: 16, lineHeight: 1.6, color: "var(--purple-soft)", fontStyle: "italic" }}>
              “{rule.seed}”
            </div>
          </>
        ) : null}

        <SectionLabel>Details</SectionLabel>
        <div className="ide-rule-detail-dialog-meta" style={{ display: "grid", gap: 10, margin: "10px 0 22px" }}>
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
  const cols = ["#FF2E88", "#35F0E0", "#FFD23F", "#FF6A1F"];
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

/**
 * Head of every secondary screen: back control, brand mark, plate title, and
 * an optional control on the right. `onBack` is omitted by the screens that
 * are reachable from the bottom nav — there the brand mark takes the slot the
 * back arrow would occupy.
 */
export function ScreenHead({ onBack, right, title }: { onBack?: () => void; right?: React.ReactNode; title: string }) {
  return (
    <div className="ide-screen-head" style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 16 }}>
      {onBack ? (
        <button aria-label="Back" className="ide-iconbtn" onClick={onBack} type="button">
          <Ico.back style={{ width: 18, height: 18 }} />
        </button>
      ) : null}
      <Dealer size={34} />
      {/* The brand mark costs the row ~35px, so the plate gives width back on
          narrow shells instead of wrapping the longest titles onto two lines. */}
      <h1 className="ide-plate" style={{ fontSize: "clamp(18px, 5.4vw, 22px)", fontWeight: 400, margin: 0, flex: 1, minWidth: 0 }}>{title}</h1>
      {right}
    </div>
  );
}

/* ------------------- CONVERSATION DRAFTS (rule chats) ------------------- */

export function ConversationRow({ draft, onResume }: { draft: ConversationDraftApi; onResume: () => void }) {
  const isDraft = draft.status !== "submitted";
  // The pointer alone is not enough: it is cleared by whichever client sees the
  // run end, so a tab that was closed mid-run leaves it set. Bounding it by the
  // longest life the API gives a job keeps the badge from promising a
  // reconnect that can only 404.
  const compiling =
    Boolean(draft.preflightJobId) &&
    isPreflightJobPointerFresh(Date.parse(draft.updatedAt), Date.now());
  return (
    <button onClick={onResume} className="ide-listrow" type="button">
      <span style={{ width: 34, height: 34, borderRadius: 11, display: "grid", placeItems: "center", flexShrink: 0, background: compiling ? "rgba(124,246,184,0.12)" : isDraft ? "rgba(255,210,63,0.12)" : "var(--surface-2)", color: compiling ? "var(--green)" : isDraft ? "var(--yellow)" : "var(--dim)" }}>
        <Ico.chat style={{ color: "currentColor" }} />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {draft.normalizedText || draft.prompt}
        </div>
        <div style={{ fontSize: 12.5, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {compiling ? <span style={{ color: "var(--green)", fontWeight: 700 }}>● compiling</span> : isDraft ? "draft" : `submitted · ${fmtTurnId(draft.turnId)}`} · <span className="ide-num">{draft.tokenCount}</span> tokens · {timeAgo(draft.updatedAt)}
        </div>
      </div>
      {compiling ? (
        <span style={{ flexShrink: 0, color: "var(--green)", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}><Ico.bolt style={{ color: "currentColor" }} /> Reconnect</span>
      ) : isDraft ? (
        <span style={{ flexShrink: 0, color: "var(--yellow)", fontWeight: 700, fontSize: 13, display: "inline-flex", alignItems: "center", gap: 5 }}><Ico.edit style={{ color: "currentColor" }} /> continue</span>
      ) : (
        <Ico.chevron style={{ color: "var(--dim)", transform: "rotate(-90deg)", flexShrink: 0 }} />
      )}
    </button>
  );
}

/**
 * Every state of the saved rule-conversation list, shared by the My rules
 * screen and the Account screen's Conversations tab so both stay identical.
 */
export function ConversationList({
  drafts,
  error,
  loading,
  hasMore = false,
  loadingMore = false,
  loadMoreError = null,
  onLoadMore,
  onCreate,
  onResume,
  onRetry,
}: {
  drafts: ConversationDraftApi[];
  error: null | string;
  hasMore?: boolean;
  loading: boolean;
  loadingMore?: boolean;
  loadMoreError?: null | string;
  onCreate: () => void;
  onLoadMore?: () => void;
  onResume: (draft: ConversationDraftApi) => void;
  onRetry: () => void;
}) {
  if (loading) {
    return <div className="ide-notice" style={{ borderTop: "none", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>Loading conversations…</div>;
  }

  if (error) {
    return (
      <div className="ide-notice" style={{ borderTop: "none", textAlign: "center" }}>
        <div style={{ color: "var(--red)", fontSize: 14, fontWeight: 700 }}>Could not load saved conversations.</div>
        <button onClick={onRetry} className="ide-btn-ghost ide-btn" style={{ marginTop: 12, padding: 12 }} type="button">Try again</button>
      </div>
    );
  }

  if (drafts.length === 0) {
    return (
      <div className="ide-notice" style={{ borderTop: "none", textAlign: "center" }}>
        <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}><Ico.chat style={{ color: "var(--dim)", width: 22, height: 22 }} /></div>
        <div style={{ fontWeight: 700, fontSize: 15 }}>No AI drafts yet</div>
        <p style={{ margin: "6px 0 14px", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Drafts appear here after the dealer compiles a rule preview.</p>
        <button onClick={onCreate} className="ide-btn-ghost ide-btn" style={{ padding: 12 }} type="button"><Ico.spark style={{ color: "var(--purple-soft)" }} /> Create a rule</button>
      </div>
    );
  }

  return (
    <div className="ide-list">
      {drafts.map((draft) => (
        <ConversationRow key={draft.draftId} draft={draft} onResume={() => onResume(draft)} />
      ))}
      {loadingMore ? (
        <div aria-live="polite" style={{ color: "var(--dim)", fontSize: 12.5, padding: "14px 0 2px", textAlign: "center" }}>
          Loading more conversations...
        </div>
      ) : null}
      {loadMoreError ? (
        <div style={{ padding: "12px 0 2px", textAlign: "center" }}>
          <div style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 8 }}>Could not load more conversations.</div>
          <button className="ide-btn-ghost ide-btn" onClick={onLoadMore} style={{ padding: "9px 12px" }} type="button">Try again</button>
        </div>
      ) : null}
      {hasMore && !loadingMore && !loadMoreError ? (
        <div aria-hidden="true" style={{ height: 1 }} />
      ) : null}
    </div>
  );
}
