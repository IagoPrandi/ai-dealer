"use client";

/**
 * JOGAR — pick 6 numbers (1–100), review, submit on-chain. One guess per wallet
 * per turn. Ported from app-play.jsx; submission salvaged from the original
 * NumberPicker (createSubmitGuessInstruction → send → POST /guess-receipts).
 */
import { useState } from "react";
import { address } from "@solana/kit";

import {
  createSubmitGuessInstruction,
  deriveSubmitGuessAccounts,
  IDEALER_PROGRAM_ID,
  validateGuessNumbers,
  type GuessReceipt,
} from "../../../solana/idealerProgram";
import { useIdealer } from "../context";
import { postGuessReceipt } from "../data/apiClient";
import { fmtSol, fmtTurnId } from "../data/format";
import { describeTxError, sendInstruction } from "../data/tx";
import { Confetti, Dealer, Ico, ScreenHead, SectionLabel } from "../shared";

const PICK = 6;
const MAXN = 100;

function ReviewRow({ label, last, mono, value }: { label: string; last?: boolean; mono?: boolean; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 0", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <span style={{ fontSize: 14, color: "var(--muted)" }}>{label}</span>
      <span className={mono ? "ide-num" : ""} style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)" }}>{value}</span>
    </div>
  );
}

function PlaySubmitted({ bet }: { bet: number[] }) {
  const { go, turnId } = useIdealer();
  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "52px 18px 96px" }}>
        <ScreenHead onBack={() => go("home")} title="Your guess" />
        <div className="ide-card" style={{ padding: 18, marginBottom: 14, borderColor: "rgba(20,241,149,0.3)", background: "linear-gradient(120deg, rgba(20,241,149,0.08), var(--surface))" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
            <span style={{ width: 30, height: 30, borderRadius: 10, background: "var(--green)", color: "#08110C", display: "grid", placeItems: "center", flexShrink: 0 }}><Ico.check /></span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15.5 }}>Guess confirmed</div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Round {fmtTurnId(turnId)} · good luck!</div>
            </div>
            <span className="ide-pill" style={{ marginLeft: "auto", padding: "4px 9px", fontSize: 11, color: "var(--dim)" }}><Ico.lock style={{ color: "var(--dim)", width: 12, height: 12 }} /> locked</span>
          </div>
          <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center" }}>
            {bet.map((n) => <span key={n} className="ide-chip">{n}</span>)}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 9, padding: "0 4px 18px", fontSize: 12.5, color: "var(--dim)", lineHeight: 1.5 }}>
          <Ico.info style={{ color: "var(--purple-soft)", flexShrink: 0, marginTop: 1 }} />
          <span>Each wallet makes <b style={{ color: "var(--muted)" }}>one guess per round</b>. It cannot be edited once submitted.</span>
        </div>
        <button onClick={() => go("vote")} className="ide-btn" style={{ width: "100%", padding: 15, marginBottom: 10 }} type="button">
          <Ico.vote style={{ color: "#08110C", width: 19, height: 19 }} /> Vote on the rules
        </button>
        <button onClick={() => go("create")} className="ide-btn-ghost ide-btn" style={{ width: "100%", padding: 14 }} type="button">
          <Ico.spark style={{ color: "var(--purple-soft)" }} /> Create a rule
        </button>
      </div>
    </div>
  );
}

function PlayDone({ sel }: { sel: number[] }) {
  const { go, turnId } = useIdealer();
  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <Confetti />
      <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "0 28px", textAlign: "center" }}>
        <div style={{ animation: "ide-pop .5s cubic-bezier(.2,.8,.3,1) both" }}><Dealer size={72} /></div>
        <h2 style={{ fontSize: 27, fontWeight: 800, margin: "20px 0 8px", letterSpacing: "-0.02em" }}>Guess confirmed!</h2>
        <p style={{ color: "var(--muted)", fontSize: 15.5, lineHeight: 1.5, margin: "0 0 22px" }}>You&apos;re in round <b style={{ color: "var(--text)" }}>{fmtTurnId(turnId)}</b>. You can now vote and create rules.</p>
        <div style={{ display: "flex", gap: 8, marginBottom: 30, flexWrap: "wrap", justifyContent: "center" }}>
          {sel.map((n) => <span key={n} className="ide-chip" style={{ width: 40, height: 40, fontSize: 15 }}>{n}</span>)}
        </div>
        <button onClick={() => go("vote")} className="ide-btn" style={{ width: "100%", padding: 16, fontSize: 16 }} type="button"><Ico.vote style={{ color: "#08110C", width: 19, height: 19 }} /> Vote on the rules</button>
        <button onClick={() => go("home")} className="ide-btn-ghost ide-btn" style={{ width: "100%", padding: 14, marginTop: 10 }} type="button">Back to the round</button>
      </div>
    </div>
  );
}

export function PlayScreen() {
  const ctx = useIdealer();
  if (ctx.played && ctx.bet && ctx.bet.length) {
    return <PlaySubmitted bet={ctx.bet} />;
  }
  return <PlayFlow />;
}

function PlayFlow() {
  const { client, connect, connected, fees, go, reloadAll, turnId, turnReadyToPlay, turnStatusMessage, wallet, walletAddress } = useIdealer();
  const [step, setStep] = useState<"pick" | "review" | "done">("pick");
  const [sel, setSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const complete = sel.length === PICK;

  const toggle = (n: number) =>
    setSel((cur) => (cur.includes(n) ? cur.filter((x) => x !== n) : cur.length < PICK ? [...cur, n].sort((a, b) => a - b) : cur));
  const quickPick = () => {
    const s = new Set<number>();
    while (s.size < PICK) {
      s.add(1 + Math.floor(Math.random() * MAXN));
    }
    setSel([...s].sort((a, b) => a - b));
  };

  async function confirm() {
    setError(null);
    if (!validateGuessNumbers(sel)) {
      setError("Pick exactly six unique numbers from 1 to 100.");
      return;
    }
    if (!connected || !wallet || !walletAddress) {
      connect();
      return;
    }
    setBusy(true);
    try {
      const player = address(walletAddress);
      if (!turnReadyToPlay) {
        setError(turnStatusMessage);
        return;
      }
      const accounts = await deriveSubmitGuessAccounts({ player, turnId });
      const instruction = await createSubmitGuessInstruction({ numbers: sel, player, turnId });
      const signature = await sendInstruction(client, wallet, instruction);

      const receipt: GuessReceipt = {
        gameToken: accounts.gameToken.toString(),
        numbers: sel,
        player: walletAddress,
        playerGuess: accounts.playerGuess.toString(),
        programId: IDEALER_PROGRAM_ID.toString(),
        signature,
        submittedAt: new Date().toISOString(),
        turnId,
      };
      await postGuessReceipt(receipt);
      reloadAll();
      setStep("done");
    } catch (cause) {
      setError(describeTxError(cause));
    } finally {
      setBusy(false);
    }
  }

  if (step === "done") {
    return <PlayDone sel={sel} />;
  }

  if (step === "review") {
    return (
      <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
        <div className="ide-ambient" />
        <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "52px 18px 150px" }}>
          <ScreenHead onBack={() => setStep("pick")} title="Review guess" />
          <p style={{ margin: "2px 2px 18px", fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
            Check your numbers before confirming. Once submitted, the guess <b style={{ color: "var(--text)" }}>cannot be edited</b>.
          </p>
          <div className="ide-card" style={{ padding: 18, marginBottom: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <SectionLabel>Your numbers</SectionLabel>
              <button onClick={() => setStep("pick")} className="ide-votebtn" style={{ padding: "6px 11px" }} type="button"><Ico.edit style={{ color: "currentColor" }} /> edit</button>
            </div>
            <div style={{ display: "flex", gap: 9, flexWrap: "wrap", justifyContent: "center" }}>
              {sel.map((n) => <span key={n} className="ide-chip">{n}</span>)}
            </div>
          </div>
          <div className="ide-card" style={{ padding: "4px 16px", marginBottom: 14 }}>
            <ReviewRow label="Numbers chosen" value={`${sel.length} of ${PICK}`} mono />
            <ReviewRow label="Entry fee" value={`${fmtSol(fees.play)} SOL`} mono />
            <ReviewRow label="Account rent + network fee" value="shown by wallet" last />
          </div>
          {error ? (
            <div className="ide-card" style={{ padding: "11px 14px", marginBottom: 14, borderColor: "rgba(255,107,107,0.3)", color: "var(--red)", fontSize: 13 }}>{error}</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 4px", fontSize: 12.5, color: "var(--dim)" }}>
              <Ico.info style={{ color: "var(--purple-soft)", flexShrink: 0 }} />
              <span>Playing issues your round pass — unlocks creating rules and voting.</span>
            </div>
          )}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 30, padding: "16px 18px calc(20px + env(safe-area-inset-bottom,0px))", background: "linear-gradient(180deg, transparent, var(--bg) 36%)" }}>
          <button onClick={confirm} disabled={busy} className="ide-btn" style={{ width: "100%", padding: 17, fontSize: 17, opacity: busy ? 0.7 : 1 }} type="button">
            {busy ? <><span className="ide-spin" style={{ width: 18, height: 18, border: "2px solid #08110C", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block" }} /> Submitting…</>
              : connected ? <><Ico.check style={{ color: "#08110C" }} /> Confirm and submit</>
              : <><Ico.wallet style={{ color: "#08110C" }} /> Connect and submit</>}
          </button>
        </div>
      </div>
    );
  }

  // step "pick"
  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "52px 18px 150px" }}>
        <ScreenHead onBack={() => go("home")} title="Make a guess"
          right={sel.length > 0 ? <button onClick={() => setSel([])} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Outfit" }} type="button">clear</button> : undefined} />

        <div style={{ textAlign: "center", margin: "4px 0 16px" }}>
          <div style={{ fontSize: 15, color: "var(--muted)" }}>Pick <b style={{ color: "var(--text)" }}>{PICK} numbers</b> from 1 to {MAXN}</div>
          <div className="ide-num" style={{ marginTop: 6, fontSize: 14, color: complete ? "var(--green)" : "var(--dim)", fontWeight: 700 }}>{sel.length}/{PICK} selected</div>
        </div>

        <button onClick={quickPick} className="ide-votebtn" style={{ width: "100%", justifyContent: "center", padding: "12px", fontSize: 14.5, marginBottom: 16 }} type="button">
          <Ico.dice style={{ color: "var(--purple-soft)" }} /> Lucky pick (choose for me)
        </button>

        <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16, flexWrap: "wrap" }}>
          {Array.from({ length: PICK }).map((_, i) => {
            const n = sel[i];
            return n != null
              ? <span key={i} className="ide-chip" style={{ width: 42, height: 42, fontSize: 16 }}>{n}</span>
              : <span key={i} className="ide-num" style={{ width: 42, height: 42, borderRadius: 13, border: "1px dashed var(--line-2)", display: "grid", placeItems: "center", color: "var(--dim)", fontSize: 16, fontWeight: 700 }}>·</span>;
          })}
        </div>

        <div className="ide-numgrid">
          {Array.from({ length: MAXN }, (_, i) => i + 1).map((n) => (
            <button key={n} onClick={() => toggle(n)} className={"ide-numcell" + (sel.includes(n) ? " sel" : "")} type="button">{n}</button>
          ))}
        </div>
      </div>

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 30, padding: "16px 18px calc(20px + env(safe-area-inset-bottom,0px))", background: "linear-gradient(180deg, transparent, var(--bg) 36%)" }}>
        <button onClick={() => complete && setStep("review")} disabled={!complete || !turnReadyToPlay} className="ide-btn" style={{ width: "100%", padding: 17, fontSize: 17, opacity: complete && turnReadyToPlay ? 1 : 0.4 }} type="button">
          {complete ? <>Review guess <Ico.arrow style={{ color: "#08110C" }} /></> : `${PICK - sel.length} number${PICK - sel.length === 1 ? "" : "s"} left`}
        </button>
      </div>
    </div>
  );
}
