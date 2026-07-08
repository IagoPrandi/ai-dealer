"use client";

/**
 * CONTA — wallet, claims/withdraw (prize + reward), my rules. Ported from
 * app-profile.jsx. Earnings/claims come from the wallet's claim ledger
 * (GET /players/{wallet}/claims). Conversations and History now read the
 * player projection endpoints instead of deferred empty states.
 */
import { useState } from "react";
import { address } from "@solana/kit";

import { createClaimInstruction } from "../../../solana/idealerProgram";
import { useIdealer } from "../context";
import { postClaimComplete, postClaimRequest } from "../data/apiClient";
import { lamportsToSol, fmtSol, fmtTurnId, timeAgo, truncateAddress } from "../data/format";
import { useConversationDrafts, usePlayerClaims, usePlayerHistory } from "../data/hooks";
import { describeTxError, sendInstruction } from "../data/tx";
import { Dealer, Ico, VoteTally } from "../shared";
import type { ClaimRecordApi, ConversationDraftApi, PlayerHistoryEventApi } from "../data/types";

function BalanceTile({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div style={{ background: "var(--surface)", border: "1px solid var(--line)", borderRadius: 13, padding: "10px 12px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 12, marginBottom: 5 }}>{icon} {label}</div>
      <div className="ide-num" style={{ fontSize: 18, fontWeight: 800 }}>{fmtSol(value)} <span style={{ fontSize: 11, color: "var(--purple-soft)", fontWeight: 700 }}>SOL</span></div>
    </div>
  );
}

function StatTile({ icon, l, n, unit }: { icon: React.ReactNode; l: string; n: number | string; unit?: string }) {
  return (
    <div className="ide-stat">
      <div style={{ marginBottom: 8 }}>{icon}</div>
      <div className="ide-num" style={{ fontSize: 22, fontWeight: 800 }}>{n}{unit ? <span style={{ fontSize: 13, color: "var(--purple-soft)", fontWeight: 700, marginLeft: 3 }}>{unit}</span> : null}</div>
      <div style={{ fontSize: 12.5, color: "var(--dim)", marginTop: 1 }}>{l}</div>
    </div>
  );
}

function sumLamports(records: ClaimRecordApi[], predicate: (r: ClaimRecordApi) => boolean) {
  return records.filter(predicate).reduce((total, r) => total + r.amountLamports, 0);
}

const isReward = (kind: ClaimRecordApi["kind"]) => kind === "creator_reward" || kind === "voter_reward";

function StatusPill({ children, tone = "purple" }: { children: React.ReactNode; tone?: "green" | "purple" | "yellow" }) {
  const color = tone === "green" ? "var(--green)" : tone === "yellow" ? "var(--yellow)" : "var(--purple-soft)";
  return (
    <span className="ide-pill" style={{ color, padding: "4px 9px", whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

function ConversationRow({ draft, onResume }: { draft: ConversationDraftApi; onResume: () => void }) {
  return (
    <div className="ide-card" style={{ padding: "13px 15px", display: "grid", gap: 10, minWidth: 0, maxWidth: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10, minWidth: 0 }}>
        <div style={{ width: 34, height: 34, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", color: "var(--purple-soft)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Ico.chat style={{ width: 17, height: 17, color: "var(--purple-soft)" }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ marginBottom: 4, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 15.5, maxWidth: "100%", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {draft.normalizedText || draft.prompt}
            </div>
          </div>
          <div style={{ color: "var(--muted)", fontSize: 13, lineHeight: 1.45, overflowWrap: "anywhere", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
            {draft.lastMessage || draft.prompt}
          </div>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        <StatusPill tone={draft.status === "submitted" ? "green" : "yellow"}>{draft.status}</StatusPill>
        <span className="ide-pill"><span className="ide-num">{fmtTurnId(draft.turnId)}</span></span>
        <span className="ide-pill"><span className="ide-num">{draft.tokenCount}</span> tokens</span>
        <span style={{ color: "var(--dim)", fontSize: 12.5, marginLeft: "auto" }}>{timeAgo(draft.updatedAt)}</span>
      </div>
      <button onClick={onResume} className="ide-btn-ghost ide-btn" style={{ width: "100%", maxWidth: "100%", minWidth: 0, padding: 11 }} type="button">
        <Ico.spark style={{ color: "var(--purple-soft)" }} /> {draft.status === "submitted" ? "Open conversation" : "Resume draft"}
      </button>
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
  return (
    <div className="ide-card" style={{ padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}>
      <div style={{ width: 36, height: 36, borderRadius: 12, background: "var(--surface-2)", border: "1px solid var(--line)", display: "grid", placeItems: "center", flexShrink: 0 }}>
        {historyIcon(event.type)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.title}</div>
          <span style={{ color: "var(--dim)", fontSize: 12, marginLeft: "auto" }}>{timeAgo(event.createdAt)}</span>
        </div>
        <div style={{ color: "var(--muted)", fontSize: 12.8, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{event.summary}</div>
      </div>
      <div style={{ textAlign: "right", flexShrink: 0 }}>
        <div className="ide-num" style={{ fontSize: 13.5, fontWeight: 800 }}>{fmtTurnId(event.turnId)}</div>
        {amount !== null ? <div className="ide-num" style={{ color: "var(--green)", fontSize: 12.5, fontWeight: 800 }}>{fmtSol(amount)} SOL</div> : <div style={{ color: "var(--dim)", fontSize: 12 }}>{event.status}</div>}
      </div>
    </div>
  );
}

export function ProfileScreen() {
  const { client, connect, connected, go, rules, walletAddress, wallet } = useIdealer();
  const { claims, error, loading, reload } = usePlayerClaims(walletAddress);
  const history = usePlayerHistory(walletAddress);
  const conversations = useConversationDrafts(walletAddress);
  const [tab, setTab] = useState<"chats" | "hist" | "regras">("regras");
  const [busy, setBusy] = useState(false);
  const [txError, setTxError] = useState<null | string>(null);
  const [done, setDone] = useState(false);

  if (!connected) {
    return (
      <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
        <div className="ide-ambient" />
        <div style={{ position: "relative", zIndex: 1, height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 28px" }}>
          <Dealer size={60} />
          <h2 style={{ fontSize: 23, fontWeight: 800, margin: "16px 0 8px" }}>Your wallet</h2>
          <p style={{ color: "var(--muted)", fontSize: 15, margin: "0 0 24px" }}>Connect to see your rules, earnings, and claims.</p>
          <button onClick={() => connect()} className="ide-btn" style={{ width: "100%", padding: 16 }} type="button"><Ico.wallet style={{ color: "#08110C" }} /> Connect wallet</button>
        </div>
      </div>
    );
  }

  const records = claims?.records ?? [];
  const available = records.filter((r) => r.status === "available");
  const wdPrize = lamportsToSol(sumLamports(available, (r) => r.kind === "winner_payout"));
  const wdReward = lamportsToSol(sumLamports(available, (r) => isReward(r.kind)));
  const wd = wdPrize + wdReward;
  const earnedPrize = lamportsToSol(sumLamports(records, (r) => r.kind === "winner_payout" && r.status === "claimed"));
  const earnedReward = lamportsToSol(sumLamports(records, (r) => isReward(r.kind) && r.status === "claimed"));
  const myRules = rules.rules.filter((r) => r.mine);

  async function withdrawAll() {
    if (!wallet || !walletAddress || available.length === 0) {
      return;
    }
    setBusy(true);
    setTxError(null);
    try {
      const player = address(walletAddress);
      for (const record of available) {
        await postClaimRequest(record.claimId, walletAddress);
        const instruction = await createClaimInstruction({ kind: record.kind, player, turnId: record.turnId });
        const signature = await sendInstruction(client, wallet, instruction);
        await postClaimComplete({ claimId: record.claimId, signature, status: "claimed", wallet: walletAddress });
      }
      setDone(true);
      reload();
    } catch (cause) {
      setTxError(describeTxError(cause));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="ide-app ide-screen" style={{ height: "100%", position: "relative", overflow: "hidden" }}>
      <div className="ide-ambient" />
      <div className="ide-scroll" style={{ position: "relative", zIndex: 1, height: "100%", overflowY: "auto", overflowX: "hidden", padding: "52px 18px 96px" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, margin: "0 0 18px", letterSpacing: "-0.025em" }}>My account</h1>

        <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 18 }}>
          <div style={{ width: 52, height: 52, borderRadius: 17, background: "var(--grad)", display: "grid", placeItems: "center", flexShrink: 0 }}>
            <span style={{ fontWeight: 800, fontSize: 20, color: "#0B0910" }}>{walletAddress?.slice(0, 1).toUpperCase() ?? "I"}</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 18 }}>{walletAddress ? truncateAddress(walletAddress) : "Wallet"}</div>
            <div style={{ color: "var(--muted)", fontSize: 13.5 }} className="ide-num">Solana devnet</div>
          </div>
        </div>

        <div className="ide-card" style={{ padding: 18, marginBottom: 14, position: "relative", overflow: "hidden", borderColor: "var(--line-2)", background: "linear-gradient(150deg, var(--surface-2), var(--surface))" }}>
          <div style={{ position: "absolute", top: -30, right: -20, width: 130, height: 130, background: "radial-gradient(circle, rgba(20,241,149,0.28), transparent 65%)", filter: "blur(8px)" }} />
          <div style={{ position: "relative" }}>
            <div style={{ fontSize: 12.5, letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--dim)", fontWeight: 700 }}>Available to claim</div>
            <div className="ide-num" style={{ display: "flex", alignItems: "flex-end", gap: 6, margin: "6px 0 14px" }}>
              <span className="ide-grad-text" style={{ fontSize: 40, fontWeight: 700, lineHeight: 1 }}>{fmtSol(wd)}</span>
              <span style={{ fontSize: 16, fontWeight: 700, color: "var(--purple-soft)", marginBottom: 4 }}>SOL</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9, marginBottom: 14 }}>
              <BalanceTile icon={<Ico.trophy style={{ color: "var(--gold)", width: 15, height: 15 }} />} label="Prize" value={wdPrize} />
              <BalanceTile icon={<Ico.gift style={{ color: "var(--green)", width: 15, height: 15 }} />} label="Reward" value={wdReward} />
            </div>
            <button onClick={withdrawAll} disabled={wd <= 0 || busy} className="ide-btn" style={{ width: "100%", padding: 14, opacity: wd > 0 && !busy ? 1 : 0.45, pointerEvents: wd > 0 && !busy ? "auto" : "none" }} type="button">
              <Ico.withdraw style={{ color: "#08110C" }} /> {busy ? "Claiming…" : wd > 0 ? "Claim to wallet" : "Nothing to claim"}
            </button>
            {done && walletAddress ? <div style={{ marginTop: 10, fontSize: 13, color: "var(--green)", display: "flex", alignItems: "center", gap: 6, justifyContent: "center" }}><Ico.check style={{ color: "var(--green)" }} /> Claim sent to {truncateAddress(walletAddress)}</div> : null}
            {txError ? <div style={{ marginTop: 10, fontSize: 13, color: "var(--red)", textAlign: "center" }}>{txError}</div> : null}
            {error ? <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--dim)", textAlign: "center" }}>Could not load your claim ledger. Pull to retry.</div> : null}
          </div>
        </div>

        <button onClick={() => go("rewards")} className="ide-btn-ghost ide-btn" style={{ width: "100%", padding: 13, marginBottom: 16 }} type="button">
          <Ico.gift style={{ color: "var(--green)" }} /> Reward history
        </button>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          <StatTile icon={<Ico.trophy style={{ color: "var(--gold)" }} />} n={fmtSol(earnedPrize)} unit="SOL" l="prize claimed" />
          <StatTile icon={<Ico.gift style={{ color: "var(--green)" }} />} n={fmtSol(earnedReward)} unit="SOL" l="reward claimed" />
          <StatTile icon={<Ico.spark style={{ color: "var(--purple-soft)" }} />} n={myRules.length} l="rules this round" />
          <StatTile icon={<Ico.dice style={{ color: "var(--yellow)" }} />} n={loading ? "—" : records.length} l="claim records" />
        </div>

        <div className="ide-seg" style={{ marginBottom: 14 }}>
          <button className={tab === "regras" ? "on" : ""} onClick={() => setTab("regras")} type="button">Rules</button>
          <button className={tab === "chats" ? "on" : ""} onClick={() => setTab("chats")} type="button">Conversations</button>
          <button className={tab === "hist" ? "on" : ""} onClick={() => setTab("hist")} type="button">History</button>
        </div>

        {tab === "regras" ? (
          myRules.length === 0 ? (
            <div className="ide-card" style={{ padding: 18, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>
              You haven&apos;t created a rule in this round yet.
            </div>
          ) : (
            <div style={{ display: "grid", gap: 9, gridTemplateColumns: "minmax(0, 1fr)" }}>
              {myRules.map((r) => (
                <div key={r.id} className="ide-card" style={{ padding: "13px 15px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15.5 }}>{r.title}</div>
                    <div style={{ marginTop: 4 }}><VoteTally approve={r.approve} against={r.against} size="sm" /></div>
                  </div>
                  {r.finalist ? (
                    <span className="ide-pill" style={{ color: "var(--purple-soft)", borderColor: "rgba(199,125,255,0.3)" }}><Ico.shield style={{ width: 12, height: 12, color: "var(--purple-soft)" }} /> finalist</span>
                  ) : (
                    <span className="ide-pill" style={{ color: "var(--green)" }}>● in voting</span>
                  )}
                </div>
              ))}
            </div>
          )
        ) : null}

        {tab === "chats" ? (
          conversations.loading ? (
            <div className="ide-card" style={{ padding: 18, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>Loading conversations…</div>
          ) : conversations.error ? (
            <div className="ide-card" style={{ padding: 18, textAlign: "center", color: "var(--red)", fontSize: 14 }}>Could not load saved conversations.</div>
          ) : conversations.drafts.length === 0 ? (
            <div className="ide-card" style={{ padding: 22, textAlign: "center" }}>
              <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}><Ico.chat style={{ color: "var(--dim)", width: 22, height: 22 }} /></div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>No AI drafts yet</div>
              <p style={{ margin: "6px 0 14px", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Drafts appear here after the dealer compiles a rule preview.</p>
              <button onClick={() => go("create", { newConversation: true })} className="ide-btn-ghost ide-btn" style={{ padding: 12 }} type="button"><Ico.spark style={{ color: "var(--purple-soft)" }} /> Create a rule</button>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 9, gridTemplateColumns: "minmax(0, 1fr)" }}>
              {conversations.drafts.map((draft) => (
                <ConversationRow
                  key={draft.draftId}
                  draft={draft}
                  onResume={() => go("create", { chatId: draft.draftId, seed: draft.prompt })}
                />
              ))}
            </div>
          )
        ) : null}

        {tab === "hist" ? (
          history.loading ? (
            <div className="ide-card" style={{ padding: 18, textAlign: "center", color: "var(--muted)", fontSize: 14 }}>Loading history…</div>
          ) : history.error ? (
            <div className="ide-card" style={{ padding: 18, textAlign: "center", color: "var(--red)", fontSize: 14 }}>Could not load your play history.</div>
          ) : (history.history?.events.length ?? 0) === 0 ? (
            <div className="ide-card" style={{ padding: 22, textAlign: "center" }}>
              <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}><Ico.dice style={{ color: "var(--dim)", width: 22, height: 22 }} /></div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>No play history yet</div>
              <p style={{ margin: "6px 0 0", fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>Guesses, votes, rule proposals, and claims appear here after your wallet acts.</p>
            </div>
          ) : (
            <div style={{ display: "grid", gap: 9, gridTemplateColumns: "minmax(0, 1fr)" }}>
              {history.history?.events.map((event, index) => <HistoryRow key={historyRowKey(event, index)} event={event} />)}
              {history.history?.nextCursor ? (
                <div style={{ color: "var(--dim)", fontSize: 12.5, textAlign: "center", padding: "4px 0" }}>
                  Showing latest <span className="ide-num">{history.history.events.length}</span> events.
                </div>
              ) : null}
            </div>
          )
        ) : null}
      </div>
    </div>
  );
}
