"use client";

import { useMemo, useState } from "react";

import { useIdealer } from "../context";
import { fmtInt, fmtSol, fmtTurnId } from "../data/format";
import { Ico, ScreenHead, SectionLabel } from "../shared";

export function ShareScreen() {
  const { go, prizeSol, round, rules, turnId } = useIdealer();
  const [feedback, setFeedback] = useState<null | string>(null);

  const currentUrl = typeof window === "undefined" ? "" : window.location.origin;
  const publicRoundUrl = `${currentUrl}/round/${turnId}`;
  const draw = round?.draw?.drawResult ?? [];
  const electedRuleId = round?.election?.activeRuleId ?? null;
  const electedRule = round?.rules.find((rule) => rule.ruleId === electedRuleId) ?? null;
  const bestRule = electedRule ?? round?.rules[0] ?? null;

  const shareText = useMemo(() => {
    if (draw.length > 0) {
      return `Idealer ${fmtTurnId(turnId)} settled with draw ${draw.join(", ")}. Prize pool: ${fmtSol(prizeSol)} SOL.`;
    }
    return `Idealer ${fmtTurnId(turnId)} is live with ${fmtSol(prizeSol)} SOL in the visible prize pool and ${fmtInt(rules.rules.length)} community rules.`;
  }, [draw, prizeSol, rules.rules.length, turnId]);

  async function copyLink() {
    await navigator.clipboard.writeText(publicRoundUrl);
    setFeedback("Round link copied.");
  }

  async function shareRound() {
    if (navigator.share) {
      await navigator.share({
        text: shareText,
        title: `Idealer ${fmtTurnId(turnId)}`,
        url: publicRoundUrl,
      });
      return;
    }
    await navigator.clipboard.writeText(`${shareText} ${publicRoundUrl}`);
    setFeedback("Share text copied.");
  }

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", overflowX: "hidden", padding: "var(--ide-shell-content-top) 18px 96px" }}>
        <ScreenHead onBack={() => go("home")} title="Share" />

        <div className="ide-card" style={{ padding: 18, marginBottom: 14 }}>
          <SectionLabel>{draw.length > 0 ? "Round result" : "Live round"}</SectionLabel>
          <h2 style={{ fontSize: 23, lineHeight: 1.15, margin: "10px 0 8px", fontWeight: 800 }}>
            {draw.length > 0 ? `Draw ${draw.join(" · ")}` : `${fmtSol(prizeSol)} SOL prize pool`}
          </h2>
          <p style={{ margin: 0, color: "var(--muted)", fontSize: 14.5, lineHeight: 1.55 }}>{shareText}</p>
        </div>

        <div className="ide-card" style={{ padding: 15, marginBottom: 14 }}>
          <SectionLabel>{electedRule ? "Elected rule" : "Round rule"}</SectionLabel>
          {bestRule ? (
            <>
              <div style={{ fontWeight: 800, fontSize: 16, marginTop: 9 }}>{bestRule.title}</div>
              <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5, margin: "6px 0 0" }}>{bestRule.sanitizedText}</p>
            </>
          ) : (
            <p style={{ color: "var(--muted)", fontSize: 13.5, lineHeight: 1.5, margin: "9px 0 0" }}>No rule data is available for this round yet.</p>
          )}
        </div>

        <div style={{ display: "grid", gap: 10 }}>
          <button className="ide-btn" onClick={() => void shareRound()} style={{ width: "100%", justifyContent: "center", padding: 14 }} type="button">
            <Ico.send style={{ color: "#08110C" }} /> Share round
          </button>
          <button className="ide-btn-ghost ide-btn" onClick={() => void copyLink()} style={{ width: "100%", justifyContent: "center", padding: 14 }} type="button">
            <Ico.copy style={{ color: "var(--purple-soft)" }} /> Copy public link
          </button>
        </div>

        {feedback ? <div style={{ marginTop: 12, color: "var(--green)", textAlign: "center", fontSize: 13 }}>{feedback}</div> : null}
      </div>
    </div>
  );
}
