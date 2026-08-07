"use client";

/**
 * Play: pick 6 numbers (1-100), review, submit on-chain. Repeated guesses are
 * allowed with escalating per-wallet fees. Ported from app-play.jsx; submission salvaged from the original
 * NumberPicker (createSubmitGuessInstruction → send → POST /guess-receipts).
 */
import { useEffect, useMemo, useState } from "react";
import { address } from "@solana/kit";

import {
  createSubmitGuessInstruction,
  deriveSubmitGuessAccounts,
  TYCHE_PROGRAM_ID,
  validateGuessNumbers,
  waitForConfirmedProgramAccount,
  type GuessReceipt,
} from "../../../solana/tycheProgram";
import { fetchActiveTurnSnapshotFromWorker } from "../../../solana/activeTurnApi";
import { useTyche } from "../context";
import { postGuessReceipt } from "../data/apiClient";
import { fmtSol, fmtTurnId } from "../data/format";
import {
  clearPendingWalletAction,
  describeTxError,
  isBlockingWalletAction,
  readPendingWalletAction,
  releaseActionFromOtherTurn,
  sendInstruction,
  txErrorCode,
  type WalletPendingAction,
  writePendingWalletAction,
} from "../data/tx";
import { Confetti, Dealer, Ico, ScreenHead, SectionLabel } from "../shared";

const PICK = 6;
const MAXN = 100;
// Bounds the worker + RPC reads that run before the wallet is asked to sign;
// without it a stalled endpoint leaves the submit spinner hanging forever.
const PREFLIGHT_TIMEOUT_MS = 30_000;

function ReviewRow({ label, last, mono, value }: { label: string; last?: boolean; mono?: boolean; value: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 2px", borderBottom: last ? "none" : "1px solid var(--line)" }}>
      <span style={{ fontSize: 14, color: "var(--muted)" }}>{label}</span>
      <span className={mono ? "ide-num" : ""} style={{ fontSize: 14.5, fontWeight: 700, color: "var(--text)" }}>{value}</span>
    </div>
  );
}

function isSubmitGuessAction(action: WalletPendingAction | null, walletAddress: string | undefined) {
  return (
    action?.action === "submit_guess" &&
    (!action.walletAddress || !walletAddress || action.walletAddress === walletAddress)
  );
}

function walletActionCopy(action: WalletPendingAction) {
  if (action.status === "awaiting_approval") {
    return {
      tone: "var(--purple-soft)",
      title: "Awaiting wallet approval",
      message: "The approval request opened in your wallet. Approve within 2 minutes, then return here after signing.",
    };
  }
  if (action.status === "pending_confirmation") {
    return {
      tone: "var(--yellow)",
      title: "Transaction pending",
      message: "The wallet signed the transaction. Tyche is waiting for confirmed network status before allowing another submit.",
    };
  }
  if (action.status === "delayed_confirmation") {
    return {
      tone: "var(--yellow)",
      title: "Transaction delayed",
      message: "Confirmation is taking longer than usual. Keep this action pending so a retry cannot duplicate the same guess sequence.",
    };
  }
  if (action.status === "duplicate") {
    return {
      tone: "var(--green)",
      title: "Guess sequence already recorded",
      message: "This guess sequence is already recorded. Refreshing the round state will show the confirmed entry.",
    };
  }
  if (action.status === "turn_changed") {
    return {
      tone: "var(--yellow)",
      title: "Round changed during approval",
      message: `The wallet action targeted round ${fmtTurnId(action.turnId ?? 0)}. Tyche refreshed the live round before allowing another submit.`,
    };
  }
  if (action.status === "confirmed") {
    return {
      tone: "var(--green)",
      title: "Guess confirmed",
      message: "The guess was recorded and the local wallet action can be cleared.",
    };
  }
  return {
    tone: "var(--red)",
    title: "Transaction failed",
    message: action.errorMessage ?? "The wallet action failed. Nothing was recorded unless the receipt is visible below.",
  };
}

function WalletActionStatus({
  action,
  onClear,
}: {
  action: WalletPendingAction;
  onClear: () => void;
}) {
  const copy = walletActionCopy(action);
  const showClear = action.status === "failed" || action.status === "turn_changed" || action.status === "confirmed";

  return (
    <div
      className="ide-card"
      data-testid="wallet-action-status"
      style={{
        borderColor: "rgba(255,255,255,0.13)",
        display: "grid",
        gap: 10,
        marginBottom: 14,
        padding: 14,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span
          style={{
            alignItems: "center",
            background: "var(--surface-2)",
            border: "1px solid var(--line)",
            borderRadius: 12,
            color: copy.tone,
            display: "grid",
            flexShrink: 0,
            height: 34,
            placeItems: "center",
            width: 34,
          }}
        >
          {action.status === "confirmed" || action.status === "duplicate" ? (
            <Ico.check style={{ color: "currentColor" }} />
          ) : (
            <Ico.clock style={{ color: "currentColor", height: 17, width: 17 }} />
          )}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "var(--text)", fontSize: 15, fontWeight: 800 }}>{copy.title}</div>
          <div style={{ color: "var(--muted)", fontSize: 12.5, lineHeight: 1.4 }}>{copy.message}</div>
        </div>
      </div>
      {action.errorCode ? (
        <div className="ide-pill" style={{ color: copy.tone, justifySelf: "start" }}>
          <span className="ide-num">{action.errorCode}</span>
        </div>
      ) : null}
      {action.signature ? (
        <div style={{ color: "var(--dim)", fontSize: 12, overflowWrap: "anywhere" }}>
          Signature <span className="ide-num">{action.signature}</span>
        </div>
      ) : null}
      {showClear ? (
        <button className="ide-votebtn" onClick={onClear} style={{ justifySelf: "start", padding: "8px 12px" }} type="button">
          Retry
        </button>
      ) : null}
    </div>
  );
}

function PlayDone({ sel }: { sel: number[] }) {
  const { go, turnId } = useTyche();
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
        <button onClick={() => go("create", { newConversation: true })} className="ide-btn-ghost ide-btn" style={{ width: "100%", padding: 14, marginTop: 10 }} type="button"><Ico.chat style={{ color: "var(--purple-soft)" }} /> Create a rule</button>
        <button onClick={() => go("home")} className="ide-btn-ghost ide-btn" style={{ width: "100%", padding: 14, marginTop: 10 }} type="button">Back to the round</button>
      </div>
    </div>
  );
}

export function PlayScreen() {
  return <PlayFlow />;
}

function PlayFlow() {
  const { client, connect, connected, fees, go, playCount, reloadAll, turnId, turnReadyToPlay, turnStatusMessage, wallet, walletAddress } = useTyche();
  const [step, setStep] = useState<"pick" | "review" | "done">("pick");
  const [sel, setSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<null | string>(null);
  const [pendingAction, setPendingAction] = useState<WalletPendingAction | null>(null);
  const complete = sel.length === PICK;
  const visiblePendingAction = useMemo(
    () =>
      pendingAction && isSubmitGuessAction(pendingAction, walletAddress)
        ? releaseActionFromOtherTurn(pendingAction, turnId)
        : null,
    [pendingAction, turnId, walletAddress],
  );
  const submitBlocked = isBlockingWalletAction(visiblePendingAction);

  useEffect(() => {
    const sync = () => setPendingAction(readPendingWalletAction());
    sync();
    window.addEventListener("focus", sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  function saveAction(next: Omit<WalletPendingAction, "updatedAt" | "version">) {
    const saved = writePendingWalletAction(next);
    setPendingAction(saved);
    return saved;
  }

  function clearAction() {
    clearPendingWalletAction();
    setPendingAction(null);
    setError(null);
  }

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
    if (submitBlocked) {
      setError("A wallet action is still pending. Wait for it to resolve before retrying.");
      return;
    }
    if (!validateGuessNumbers(sel)) {
      setError("Pick exactly six unique numbers from 1 to 100.");
      return;
    }
    if (!connected || !wallet || !walletAddress) {
      connect();
      return;
    }
    setBusy(true);
    const startedAt = new Date().toISOString();
    let delayTimer: number | null = null;
    try {
      const player = address(walletAddress);
      if (!turnReadyToPlay) {
        setError(turnStatusMessage);
        return;
      }
      const sequence = playCount + 1;
      const accounts = await deriveSubmitGuessAccounts({ player, sequence, turnId });
      const preflightSignal = AbortSignal.timeout(PREFLIGHT_TIMEOUT_MS);
      const loadPreflight = () =>
        Promise.all([
          fetchActiveTurnSnapshotFromWorker(preflightSignal),
          client.runtime.rpc
            .getAccountInfo(accounts.playerGuess, {
              commitment: "confirmed",
              encoding: "base64",
            })
            .send({ abortSignal: preflightSignal }),
        ]);
      let preflight: Awaited<ReturnType<typeof loadPreflight>>;
      try {
        preflight = await loadPreflight();
      } catch (preflightError) {
        if (preflightSignal.aborted) {
          setError("Live round status did not respond within 30 seconds, so the wallet was not called. Check that the API and worker are running, then retry.");
          return;
        }
        throw preflightError;
      }
      const [freshTurn, existingGuess] = preflight;
      if (freshTurn.globalConfig.activeTurnId !== turnId) {
        saveAction({
          action: "submit_guess",
          createdAt: startedAt,
          errorCode: "TURN_CHANGED",
          errorMessage: "The active round changed before wallet approval.",
          numbers: sel,
          status: "turn_changed",
          turnId,
          walletAddress,
        });
        reloadAll();
        setError("The active round changed before wallet approval. Review the new round before submitting.");
        return;
      }
      if (existingGuess.value) {
        saveAction({
          action: "submit_guess",
          createdAt: startedAt,
          errorCode: "DUPLICATE_ACTION",
          errorMessage: "This guess sequence is already recorded for the current turn.",
          numbers: sel,
          status: "duplicate",
          turnId,
          walletAddress,
        });
        reloadAll();
        return;
      }
      const instruction = await createSubmitGuessInstruction({ numbers: sel, player, sequence, turnId });
      saveAction({
        action: "submit_guess",
        createdAt: startedAt,
        numbers: sel,
        status: "awaiting_approval",
        turnId,
        walletAddress,
      });
      const signature = await sendInstruction(client, wallet, instruction);
      saveAction({
        action: "submit_guess",
        createdAt: startedAt,
        numbers: sel,
        signature,
        status: "pending_confirmation",
        turnId,
        walletAddress,
      });
      delayTimer = window.setTimeout(() => {
        saveAction({
          action: "submit_guess",
          createdAt: startedAt,
          numbers: sel,
          signature,
          status: "delayed_confirmation",
          turnId,
          walletAddress,
        });
      }, 15_000);

      try {
        await Promise.all([
          waitForConfirmedProgramAccount({
            account: accounts.gameToken,
            client,
            label: "Your round pass",
          }),
          waitForConfirmedProgramAccount({
            account: accounts.playerGuess,
            client,
            label: "Your guess",
          }),
        ]);
      } catch (confirmationError) {
        saveAction({
          action: "submit_guess",
          createdAt: startedAt,
          errorCode: "CONFIRMATION_UNVERIFIED",
          errorMessage: describeTxError(confirmationError),
          numbers: sel,
          signature,
          status: "delayed_confirmation",
          turnId,
          walletAddress,
        });
        reloadAll();
        setError("The wallet signed the guess, but Tyche could not verify the on-chain round pass yet. Wait a moment, then refresh before retrying.");
        return;
      }

      const receipt: GuessReceipt = {
        feeLamports: Math.round(fees.playNext * 1_000_000_000),
        gameToken: accounts.gameToken.toString(),
        numbers: sel,
        player: walletAddress,
        playerGuess: accounts.playerGuess.toString(),
        programId: TYCHE_PROGRAM_ID.toString(),
        sequence,
        signature,
        submittedAt: new Date().toISOString(),
        turnId,
      };
      await postGuessReceipt(receipt);
      let latestTurn: Awaited<ReturnType<typeof fetchActiveTurnSnapshotFromWorker>>;
      try {
        latestTurn = await fetchActiveTurnSnapshotFromWorker();
      } catch {
        saveAction({
          action: "submit_guess",
          createdAt: startedAt,
          errorCode: "TURN_RECOVERY_UNVERIFIED",
          errorMessage: "The receipt was recorded, but Tyche could not verify the live round after wallet return.",
          numbers: sel,
          signature,
          status: "delayed_confirmation",
          turnId,
          walletAddress,
        });
        reloadAll();
        setError("The receipt was recorded, but live round recovery could not be verified. Refresh status before retrying.");
        return;
      }
      if (latestTurn.globalConfig.activeTurnId !== turnId) {
        saveAction({
          action: "submit_guess",
          createdAt: startedAt,
          errorCode: "TURN_CHANGED_AFTER_SIGNATURE",
          errorMessage: "The round changed while the wallet signature was being processed.",
          numbers: sel,
          signature,
          status: "turn_changed",
          turnId,
          walletAddress,
        });
        reloadAll();
        setError("The round changed while the wallet signature was being processed. The signed receipt was recorded for the previous round.");
        return;
      }
      reloadAll();
      clearPendingWalletAction();
      setPendingAction(null);
      setStep("done");
    } catch (cause) {
      const message = describeTxError(cause);
      const code = txErrorCode(cause);
      saveAction({
        action: "submit_guess",
        createdAt: startedAt,
        errorCode: code,
        errorMessage: message,
        numbers: sel,
        status: code === "DUPLICATE_ACTION" ? "duplicate" : "failed",
        turnId,
        walletAddress,
      });
      setError(message);
    } finally {
      if (delayTimer) {
        window.clearTimeout(delayTimer);
      }
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
        <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "var(--ide-shell-content-top) 20px 150px" }}>
          <ScreenHead onBack={() => setStep("pick")} title="Review guess" />
          <p style={{ margin: "2px 2px 22px", fontSize: 14, color: "var(--muted)", lineHeight: 1.5 }}>
            Check your numbers before confirming. Once submitted, the guess <b style={{ color: "var(--text)" }}>cannot be edited</b>.
          </p>
          {/* your numbers — chips over the background, no box */}
          <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginBottom: 4 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <SectionLabel>Your numbers</SectionLabel>
              <button onClick={() => setStep("pick")} className="ide-votebtn" style={{ padding: "6px 11px" }} type="button"><Ico.edit style={{ color: "currentColor" }} /> edit</button>
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center", marginBottom: 22 }}>
              {sel.map((n) => <span key={n} className="ide-chip">{n}</span>)}
            </div>
          </div>
          {/* summary — hairline-divided list, no box */}
          <div style={{ marginBottom: 22 }}>
            <ReviewRow label="Round" value={fmtTurnId(turnId)} mono />
            <ReviewRow label="Numbers chosen" value={`${sel.length} of ${PICK}`} mono />
            <ReviewRow label="Entry fee" value={fees.playNext === 0 ? "Free" : `${fmtSol(fees.playNext)} SOL`} mono />
            <ReviewRow label="Account rent + network fee" value="shown by wallet" last />
          </div>
          {visiblePendingAction ? (
            <WalletActionStatus action={visiblePendingAction} onClear={clearAction} />
          ) : null}
          {error ? (
            <div className="ide-card" style={{ padding: "11px 14px", marginBottom: 14, borderColor: "rgba(255,107,107,0.3)", color: "var(--red)", fontSize: 13 }}>{error}</div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", gap: 9, padding: "0 2px", fontSize: 12.5, color: "var(--dim)" }}>
              <Ico.info style={{ color: "var(--purple-soft)", flexShrink: 0 }} />
              <span>Playing issues your round pass — unlocks creating rules and voting.</span>
            </div>
          )}
        </div>
        <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 30, padding: "16px 20px calc(20px + env(safe-area-inset-bottom,0px))", background: "linear-gradient(180deg, transparent, var(--bg) 36%)" }}>
          <button onClick={confirm} disabled={busy || submitBlocked} className="ide-btn" style={{ width: "100%", padding: 17, fontSize: 17, opacity: busy || submitBlocked ? 0.7 : 1 }} type="button">
            {busy ? <><span className="ide-spin" style={{ width: 18, height: 18, border: "2px solid #08110C", borderTopColor: "transparent", borderRadius: "50%", display: "inline-block" }} /> Submitting…</>
              : submitBlocked ? <><Ico.clock style={{ color: "#08110C" }} /> Wallet action pending</>
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
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", padding: "var(--ide-shell-content-top) 20px 150px" }}>
        <ScreenHead onBack={() => go("home")} title="Make a guess"
          right={sel.length > 0 ? <button onClick={() => setSel([])} style={{ background: "none", border: "none", color: "var(--dim)", fontSize: 13, fontWeight: 600, cursor: "pointer", fontFamily: "Outfit" }} type="button">clear</button> : undefined} />

        <div style={{ textAlign: "center", margin: "4px 0 16px" }}>
          <div style={{ fontSize: 15, color: "var(--muted)" }}>Pick <b style={{ color: "var(--text)" }}>{PICK} numbers</b> from 1 to {MAXN}</div>
          <div className="ide-num" style={{ marginTop: 6, fontSize: 14, color: complete ? "var(--green)" : "var(--dim)", fontWeight: 700 }}>{sel.length}/{PICK} selected</div>
        </div>

        {visiblePendingAction ? (
          <WalletActionStatus action={visiblePendingAction} onClear={clearAction} />
        ) : null}

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

      <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 30, padding: "16px 20px calc(20px + env(safe-area-inset-bottom,0px))", background: "linear-gradient(180deg, transparent, var(--bg) 36%)" }}>
        <button onClick={() => complete && setStep("review")} disabled={!complete || !turnReadyToPlay} className="ide-btn" style={{ width: "100%", padding: 17, fontSize: 17, opacity: complete && turnReadyToPlay ? 1 : 0.4 }} type="button">
          {complete ? <>Review guess <Ico.arrow style={{ color: "#08110C" }} /></> : `${PICK - sel.length} number${PICK - sel.length === 1 ? "" : "s"} left`}
        </button>
      </div>
    </div>
  );
}
