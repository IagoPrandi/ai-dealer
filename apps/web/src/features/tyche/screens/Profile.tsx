"use client";

/**
 * CONTA — wallet, claims/withdraw (prize + reward), my rules, and the entry
 * point to the last settled round's result. Ported from
 * app-profile.jsx. Earnings/claims come from the wallet's claim ledger
 * (GET /players/{wallet}/claims). Conversations and History now read the
 * player projection endpoints instead of deferred empty states.
 */
import { useEffect, useState, type UIEvent } from "react";

import { useTyche } from "../context";
import { lamportsToSol, fmtClaimSol, fmtTurnId, timeAgo } from "../data/format";
import { useConversationDrafts, usePlayerClaims, usePlayerHistory } from "../data/hooks";
import { claimRecordToWallet } from "../data/claimFlow";
import { summarizePlayerClaims } from "../data/claimState";
import { describeTxError } from "../data/tx";
import { ConversationList, Dealer, Ico, VoteTally, WalletButton } from "../shared";
import type { PlayerHistoryEventApi } from "../data/types";

/* withdraw-breakdown tile — square block on the inner surface, DM Mono micro
   label over a Bevan value tinted by what the money is (prize vs reward). */
function BreakdownItem({ label, tone, value }: { label: string; tone: string; value: number }) {
  return (
    <div style={{ background: "var(--surface-3)", borderRadius: 0, padding: "10px 12px" }}>
      <div className="ide-num" style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--dim)" }}>{label}</div>
      <div style={{ fontFamily: "Bevan, serif", fontSize: 18, color: tone, marginTop: 2 }}>{fmtClaimSol(value)}</div>
    </div>
  );
}

/* metric cell — Bevan number over the background, separated by hairlines */
function MetricCell({ l, n, unit }: { l: string; n: number | string; unit?: string }) {
  return (
    <div className="ide-metric">
      <div style={{ fontFamily: "Bevan, serif", fontSize: 24, color: "var(--text)" }}>
        {n}
        {unit ? <span className="ide-num" style={{ fontSize: 11, color: "var(--cyan)", marginLeft: 5 }}>{unit}</span> : null}
      </div>
      <div className="ide-num" style={{ fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--dim)", marginTop: 4 }}>{l}</div>
    </div>
  );
}

function historyRowKey(event: PlayerHistoryEventApi, index: number) {
  return `${event.id}:${event.createdAt}:${index}`;
}

function historyIcon(type: PlayerHistoryEventApi["type"]) {
  if (type === "claim") {
    return <Ico.gift style={{ width: 16, height: 16, color: "var(--green)" }} />;
  }
  if (type === "rule_proposal") {
    return <Ico.spark style={{ width: 16, height: 16, color: "var(--purple-soft)" }} />;
  }
  if (type === "vote" || type === "elimination_vote") {
    return <Ico.vote style={{ width: 16, height: 16, color: "var(--yellow)" }} />;
  }
  return <Ico.dice style={{ width: 16, height: 16, color: "var(--gold)" }} />;
}

function HistoryRow({ event }: { event: PlayerHistoryEventApi }) {
  const amount = typeof event.amountLamports === "number" ? lamportsToSol(event.amountLamports) : null;
  const isWin = event.type === "claim";
  return (
    <div className="ide-listrow" style={{ cursor: "default", minWidth: 0 }}>
      <span style={{ width: 32, height: 32, borderRadius: 0, display: "grid", placeItems: "center", flexShrink: 0, background: isWin ? "rgba(124,246,184,0.14)" : "var(--surface-2)" }}>
        {historyIcon(event.type)}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 700, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>Round {fmtTurnId(event.turnId)} · {event.title}</div>
        <div style={{ fontSize: 12.5, color: "var(--dim)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.summary} · {timeAgo(event.createdAt)}</div>
      </div>
      <span className="ide-num" style={{ fontWeight: 700, fontSize: 14.5, flexShrink: 0, color: amount !== null ? "var(--green)" : "var(--dim)" }}>
        {amount !== null ? `+${fmtClaimSol(amount)}` : "—"}
      </span>
    </div>
  );
}

export function ProfileScreen() {
  const {
    apiUnavailable,
    client,
    connect,
    connected,
    go,
    resultTurnId,
    round,
    rules,
    turnId,
    walletAddress,
    wallet,
  } = useTyche();
  const { claims, error, loading, reload } = usePlayerClaims(walletAddress);
  const history = usePlayerHistory(walletAddress);
  const conversations = useConversationDrafts(walletAddress);
  const [tab, setTab] = useState<"chats" | "hist" | "regras">("regras");
  const [visibleRuleCount, setVisibleRuleCount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [txError, setTxError] = useState<null | string>(null);
  const [done, setDone] = useState(false);
  const myRules = rules.rules.filter((r) => r.mine);

  useEffect(() => {
    setVisibleRuleCount(10);
  }, [myRules.length]);

  if (!connected) {
    return (
      <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
        <div className="ide-ambient" />
        <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 28px" }}>
          <Dealer size={60} />
          <h2 className="ide-plate" style={{ fontSize: 26, fontWeight: 400, margin: "16px 0 8px" }}>Your wallet</h2>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 24px" }}>Connect to see your rules, earnings, and claims.</p>
          <button onClick={() => connect()} className="ide-btn" style={{ width: "100%", padding: 16 }} type="button"><Ico.wallet style={{ color: "var(--on-accent)" }} /> Connect wallet</button>
        </div>
      </div>
    );
  }

  const records = claims?.records ?? [];
  const claimTotals = summarizePlayerClaims(records);
  const available = claimTotals.actionable;
  const wdPrize = lamportsToSol(claimTotals.claimablePrizeLamports);
  const wdReward = lamportsToSol(claimTotals.claimableRewardLamports);
  const wd = wdPrize + wdReward;
  const lifetimePrize = lamportsToSol(claimTotals.lifetimePrizeLamports);
  const claimedReward = lamportsToSol(claimTotals.claimedRewardLamports);
  // Only point at a round the API has actually settled: either an earlier turn
  // than the live one, or the live turn once its draw/winners are published.
  const showResultLink =
    !apiUnavailable &&
    resultTurnId > 0 &&
    (resultTurnId < turnId ||
      round?.status === "completed" ||
      round?.draw?.status === "fulfilled" ||
      Boolean(round?.winners?.records.length));

  async function withdrawAll() {
    if (!wallet || !walletAddress || available.length === 0) {
      return;
    }
    setBusy(true);
    setTxError(null);
    try {
      for (const record of available) {
        await claimRecordToWallet({
          client,
          record,
          wallet,
          walletAddress,
        });
      }
      setDone(true);
    } catch (cause) {
      setTxError(describeTxError(cause));
    } finally {
      reload();
      setBusy(false);
    }
  }

  function loadMoreOnScroll(event: UIEvent<HTMLDivElement>) {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight > 160) {
      return;
    }
    if (tab === "regras") {
      setVisibleRuleCount((count) => Math.min(count + 10, myRules.length));
      return;
    }
    if (tab === "chats") {
      conversations.loadMore();
      return;
    }
    history.loadMore();
  }

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" onScroll={loadMoreOnScroll} style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", overflowX: "hidden", padding: "var(--ide-shell-content-top) 18px 96px" }}>

        {/* screen head — brand mark, plate title, the round's wallet pill */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Dealer size={34} />
            <h1 className="ide-plate" style={{ fontSize: "clamp(18px, 5.4vw, 22px)", fontWeight: 400, margin: 0, whiteSpace: "nowrap" }}>Account</h1>
          </div>
          <WalletButton />
        </div>

        {/* Desktop splits the wallet side from the activity side; the deck
            is `display: contents` below 1024px. */}
        <div className="ide-deck">
        <div>

        {/* CLAIM HERO — sits directly on the page surface: no fill and no solid
            offset, so the yellow CTA is the only weight in the block. */}
        <div style={{ borderRadius: 0, padding: "18px 0", marginBottom: 14 }}>
          <div style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--muted)" }}>Available to claim</div>
          <div style={{ display: "flex", alignItems: "flex-start", gap: 6, margin: "6px 0 14px" }}>
            <span style={{ fontFamily: "Bevan, serif", fontSize: 44, lineHeight: 1, color: "var(--text)", textShadow: "var(--plate-num-md)" }}>{fmtClaimSol(wd)}</span>
            <span className="ide-num" style={{ fontSize: 13, color: "var(--cyan)", marginTop: 10 }}>SOL</span>
          </div>

          {/* prize | reward breakdown */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 14 }}>
            <BreakdownItem label="Prize" tone="var(--yellow)" value={wdPrize} />
            <BreakdownItem label="Reward" tone="var(--green)" value={wdReward} />
          </div>

          <button onClick={withdrawAll} disabled={wd <= 0 || busy} className="ide-btn" style={{ width: "100%", padding: 13, fontSize: 16, opacity: wd > 0 && !busy ? 1 : 0.45, pointerEvents: wd > 0 && !busy ? "auto" : "none" }} type="button">
            {busy ? "Claiming…" : wd > 0 ? "Claim to wallet" : "Nothing to claim"}
          </button>
          {done ? <div style={{ marginTop: 10, fontSize: 13, color: "var(--green)", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><Ico.check style={{ color: "var(--green)" }} /> Claim sent to your wallet</div> : null}
          {txError ? <div style={{ marginTop: 10, fontSize: 13, color: "var(--red)", textAlign: "center" }}>{txError}</div> : null}
          {error ? <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--dim)", textAlign: "center" }}>Could not load your claim ledger. Pull to retry.</div> : null}
        </div>

        {/* secondary actions — cyan ghost, then the magenta tertiary */}
        <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
          <button onClick={() => go("rewards")} className="ide-btn-ghost ide-btn" style={{ width: "100%", padding: 13, fontSize: 13.5 }} type="button">
            Reward history
          </button>
          <button onClick={() => go("invite")} className="ide-btn-ghost ide-btn is-magenta" style={{ width: "100%", padding: 13, fontSize: 13.5 }} type="button">
            Invite friends
          </button>
        </div>

        {/* PREVIOUS ROUND RESULT — follows the invite action */}
        {showResultLink ? (
          <button onClick={() => go("result", { resultTurnId })} className="ide-listrow" style={{ background: "var(--surface-2)", borderRadius: 0, boxShadow: "var(--solid-yellow)", padding: "13px 14px", margin: "0 3px 18px 0", width: "calc(100% - 3px)" }} type="button">
            <span style={{ width: 34, height: 34, borderRadius: 0, background: "var(--yellow)", color: "var(--on-accent)", display: "grid", placeItems: "center", flexShrink: 0 }}>
              <Ico.trophy style={{ color: "var(--on-accent)", width: 17, height: 17 }} />
            </span>
            <span style={{ flex: 1, minWidth: 0, fontFamily: "Oswald, sans-serif", fontSize: 14, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text)" }}>
              Result of round {fmtTurnId(resultTurnId)}
            </span>
            <Ico.arrow style={{ color: "var(--yellow)", flexShrink: 0, width: 18, height: 18 }} />
          </button>
        ) : null}

        </div>
        <div>

        {/* accumulated metrics — 2x2 grid divided by hairlines (no boxes) */}
        <div className="ide-metrics" style={{ marginBottom: 18 }}>
          <MetricCell n={fmtClaimSol(lifetimePrize)} unit="SOL" l="total prize won" />
          <MetricCell n={fmtClaimSol(claimedReward)} unit="SOL" l="reward claimed" />
          <MetricCell n={myRules.length} l="rules this round" />
          <MetricCell n={loading ? "—" : records.length} l="claim records" />
        </div>

        {/* underline tabs */}
        <div className="ide-tabs is-spread" style={{ marginBottom: 6 }}>
          <button className={tab === "regras" ? "on" : ""} onClick={() => setTab("regras")} type="button">Rules</button>
          <button className={tab === "chats" ? "on" : ""} onClick={() => setTab("chats")} type="button">Conversations{conversations.drafts.length ? ` · ${conversations.drafts.length}` : ""}</button>
          <button className={tab === "hist" ? "on" : ""} onClick={() => setTab("hist")} type="button">History</button>
        </div>

        {tab === "regras" ? (
          myRules.length === 0 ? (
            <div className="ide-notice" style={{ borderTop: "none", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              You haven&apos;t created a rule in this round yet.
            </div>
          ) : (
            <div className="ide-list">
              {myRules.slice(0, visibleRuleCount).map((r) => (
                <div key={r.id} className="ide-listrow" style={{ cursor: "default" }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: "Oswald, sans-serif", fontSize: 15, letterSpacing: "0.04em", textTransform: "uppercase" }}>{r.title}</div>
                    <div style={{ marginTop: 3 }}><VoteTally approve={r.approve} against={r.against} size="sm" /></div>
                  </div>
                  <span style={{ fontFamily: "Oswald, sans-serif", fontWeight: 600, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", flexShrink: 0, color: r.finalist ? "var(--cyan)" : "var(--yellow)" }}>
                    {r.finalist ? "finalist" : "● in voting"}
                  </span>
                </div>
              ))}
              {visibleRuleCount < myRules.length ? <div aria-hidden="true" style={{ height: 1 }} /> : null}
            </div>
          )
        ) : null}

        {tab === "chats" ? (
          <ConversationList
            drafts={conversations.drafts}
            error={conversations.error}
            hasMore={conversations.hasMore}
            loading={conversations.loading}
            loadingMore={conversations.loadingMore}
            loadMoreError={conversations.loadMoreError}
            onCreate={() => go("create", { newConversation: true, returnTo: "profile" })}
            onLoadMore={conversations.loadMore}
            onResume={(draft) => go("create", { chatId: draft.draftId, returnTo: "profile", seed: draft.prompt })}
            onRetry={conversations.reload}
          />
        ) : null}

        {tab === "hist" ? (
          history.loading ? (
            <div className="ide-notice" style={{ borderTop: "none", textAlign: "center", color: "var(--muted)", fontSize: 14 }}>Loading history…</div>
          ) : history.error ? (
            <div className="ide-notice" style={{ borderTop: "none", textAlign: "center", color: "var(--red)", fontSize: 14 }}>Could not load your play history.</div>
          ) : (history.history?.events.length ?? 0) === 0 ? (
            <div className="ide-notice" style={{ borderTop: "none", textAlign: "center" }}>
              <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}><Ico.dice style={{ color: "var(--dim)", width: 22, height: 22 }} /></div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>No play history yet</div>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Guesses, votes, rule proposals, and claims appear here after your wallet acts.</p>
            </div>
          ) : (
            <div className="ide-list">
              {history.history?.events.map((event, index) => <HistoryRow key={historyRowKey(event, index)} event={event} />)}
              {history.loadingMore ? <div aria-live="polite" style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", padding: "14px 0 2px" }}>Loading more history...</div> : null}
              {history.loadMoreError ? <div style={{ padding: "12px 0 2px", textAlign: "center" }}><div style={{ color: "var(--red)", fontSize: 12.5, marginBottom: 8 }}>Could not load more history.</div><button className="ide-btn-ghost ide-btn" onClick={history.loadMore} style={{ padding: "9px 12px" }} type="button">Try again</button></div> : null}
              <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", padding: "14px 0 2px" }}>
                {history.history?.nextCursor
                  ? <>Scroll down to load 10 more events.</>
                  : <>End of history · <span className="ide-num">{history.history?.events.length ?? 0}</span> events</>}
              </div>
            </div>
          )
        ) : null}
        </div>
        </div>
      </div>
    </div>
  );
}
