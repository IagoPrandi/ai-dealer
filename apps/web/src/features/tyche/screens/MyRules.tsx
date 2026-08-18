"use client";

/**
 * MY RULES — the player's rule conversations with the dealer: drafts still
 * being written, runs still compiling, and the ones already submitted to a
 * round. Reached from the bottom nav; the "+" here opens a new conversation.
 * Like the Home composer, starting one does not require a connected wallet —
 * only the saved list does, because drafts are keyed by wallet.
 */
import type { UIEvent } from "react";

import { useTyche } from "../context";
import { useConversationDrafts } from "../data/hooks";
import { ConversationList, Dealer, Ico } from "../shared";

export function MyRulesScreen() {
  const { connect, connected, go, walletAddress } = useTyche();
  const conversations = useConversationDrafts(walletAddress);

  const startNewConversation = () =>
    go("create", { newConversation: true, returnTo: "myrules" });

  const loadMoreOnScroll = (event: UIEvent<HTMLDivElement>) => {
    const { clientHeight, scrollHeight, scrollTop } = event.currentTarget;
    if (scrollHeight - scrollTop - clientHeight <= 160) {
      conversations.loadMore();
    }
  };

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
          overflowX: "hidden",
          padding: "var(--ide-shell-content-top) 20px 96px",
        }}
        onScroll={loadMoreOnScroll}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            marginBottom: 18,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
            <Dealer size={34} />
            <h1
              style={{
                fontSize: 24,
                fontWeight: 800,
                margin: 0,
                letterSpacing: "-0.025em",
              }}
            >
              My rules
            </h1>
          </div>
          <button
            aria-label="New conversation"
            className="ide-btn"
            onClick={startNewConversation}
            style={{ width: 46, height: 46, padding: 0, borderRadius: 16 }}
            title="New conversation"
            type="button"
          >
            <Ico.plus style={{ color: "var(--on-accent)" }} />
          </button>
        </div>

        {connected ? (
          <ConversationList
            drafts={conversations.drafts}
            error={conversations.error}
            hasMore={conversations.hasMore}
            loading={conversations.loading}
            loadingMore={conversations.loadingMore}
            loadMoreError={conversations.loadMoreError}
            onCreate={startNewConversation}
            onLoadMore={conversations.loadMore}
            onResume={(draft) =>
              go("create", {
                chatId: draft.draftId,
                returnTo: "myrules",
                seed: draft.prompt,
              })
            }
            onRetry={conversations.reload}
          />
        ) : (
          <div
            className="ide-notice"
            style={{ borderTop: "none", textAlign: "center" }}
          >
            <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}>
              <Ico.wallet
                style={{ color: "var(--dim)", width: 22, height: 22 }}
              />
            </div>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              Connect to see your conversations
            </div>
            <p
              style={{
                margin: "6px 0 14px",
                fontSize: 13,
                color: "var(--muted)",
                lineHeight: 1.5,
              }}
            >
              Saved drafts belong to the wallet that created them.
            </p>
            <button
              className="ide-btn-ghost ide-btn"
              onClick={() => connect()}
              style={{ padding: 12 }}
              type="button"
            >
              <Ico.wallet style={{ color: "var(--purple-soft)" }} /> Connect
              wallet
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
