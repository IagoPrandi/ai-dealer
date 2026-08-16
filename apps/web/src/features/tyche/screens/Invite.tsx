"use client";

/**
 * INVITE — the referral mechanic (PRD-TOKENOMICS §5.4). Two halves:
 *  - "Your invite": the shareable link/code every connected wallet already owns.
 *  - "Invited by": the invitee's set-once on-chain attribution, which must exist
 *    before their first guess for the referral to qualify.
 *
 * Attribution is signed by the invitee itself; nothing here can create a reward.
 * Qualification and payment stay with the on-chain settlement path.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { address } from "@solana/kit";

import {
  CAMPAIGN_REWARD_BPS_DENOMINATOR,
  PROPOSAL_REWARD_ATOMS,
  REFERRAL_INVITEE_REWARD_ATOMS,
  REFERRAL_INVITER_FIRST_ROUND_BONUS_RATE_BPS,
  REFERRAL_INVITER_REWARD_ATOMS,
  SUPPORTER_REWARD_ATOMS,
} from "@tyche/constants";

import {
  buildReferralLink,
  countPlayerGameTokens,
  createAttributeReferralInstruction,
  fetchReferralAttribution,
  parseReferralCode,
  type ReferralAttribution,
} from "../../../solana/referralProgram";
import { useTyche } from "../context";
import { formatTokenAtoms, fmtTurnId, truncateAddress } from "../data/format";
import { describeTxError, sendInstruction } from "../data/tx";
import { Dealer, Ico, ScreenHead, SectionLabel } from "../shared";

const TOKEN_SYMBOL = process.env.NEXT_PUBLIC_TYCHE_TOKEN_SYMBOL || "JDR";
const PENDING_INVITE_STORAGE_KEY = "tyche:pending-invite";

export const INVITER_REWARD_LABEL = `${formatTokenAtoms(REFERRAL_INVITER_REWARD_ATOMS)} ${TOKEN_SYMBOL}`;
export const INVITEE_REWARD_LABEL = `${formatTokenAtoms(REFERRAL_INVITEE_REWARD_ATOMS)} ${TOKEN_SYMBOL}`;
export const PROPOSAL_REWARD_LABEL = `${formatTokenAtoms(PROPOSAL_REWARD_ATOMS)} ${TOKEN_SYMBOL}`;
export const SUPPORTER_REWARD_LABEL = `${formatTokenAtoms(SUPPORTER_REWARD_ATOMS)} ${TOKEN_SYMBOL}`;
export const FIRST_ROUND_BONUS_LABEL = `${Number(REFERRAL_INVITER_FIRST_ROUND_BONUS_RATE_BPS) / 100}%`;
export const INVITEE_FIRST_ROUND_MAXIMUM_REWARD_ATOMS =
  REFERRAL_INVITEE_REWARD_ATOMS + PROPOSAL_REWARD_ATOMS + SUPPORTER_REWARD_ATOMS;
export const INVITER_FIRST_ROUND_MAXIMUM_BONUS_ATOMS =
  (INVITEE_FIRST_ROUND_MAXIMUM_REWARD_ATOMS * REFERRAL_INVITER_FIRST_ROUND_BONUS_RATE_BPS) /
  CAMPAIGN_REWARD_BPS_DENOMINATOR;
export const INVITER_REWARD_WITH_MAXIMUM_BONUS_LABEL = `${formatTokenAtoms(REFERRAL_INVITER_REWARD_ATOMS + INVITER_FIRST_ROUND_MAXIMUM_BONUS_ATOMS)} ${TOKEN_SYMBOL}`;
export const INVITER_FIRST_ROUND_MAXIMUM_BONUS_LABEL = `${formatTokenAtoms(INVITER_FIRST_ROUND_MAXIMUM_BONUS_ATOMS)} ${TOKEN_SYMBOL}`;

export type InviteAction =
  | { kind: "attributed" }
  | { kind: "connect" }
  | { kind: "enter_code" }
  | { kind: "played_already" }
  | { kind: "ready"; inviter: string }
  | { kind: "self_invite" };

export interface InviteEligibility {
  /** Attribution already recorded on-chain for this wallet, if any. */
  attributed: boolean;
  /** The invite code carried by the link or pasted by the player. */
  code: null | string;
  /** `GameToken` count for this wallet; `null` while unknown. */
  gameTokenCount: null | number;
  wallet: null | string;
}

/**
 * Which invite step this wallet is on. A wallet that already holds a `GameToken`
 * has passed its first guess, so an invite can no longer qualify for it.
 */
export function resolveInviteAction(input: InviteEligibility): InviteAction {
  if (!input.wallet) {
    return { kind: "connect" };
  }
  if (input.attributed) {
    return { kind: "attributed" };
  }
  if (!input.code) {
    return { kind: "enter_code" };
  }
  if (input.code === input.wallet) {
    return { kind: "self_invite" };
  }
  if (input.gameTokenCount !== null && input.gameTokenCount > 0) {
    return { kind: "played_already" };
  }
  return { kind: "ready", inviter: input.code };
}

/** Settlement progress of a recorded attribution, in the canonical leg order. */
export function describeAttributionProgress(
  attribution: ReferralAttribution,
): string {
  if (attribution.bonusSettled) {
    return "Base rewards and the first-round bonus are settled.";
  }
  if (attribution.baseRewardSettled) {
    return `Base rewards are settled for turn ${fmtTurnId(attribution.qualifyingTurnId)}. The inviter bonus is settled after that turn closes.`;
  }
  return "Attribution is recorded. Rewards qualify on your first confirmed guess.";
}

export function readPendingInvite(storage: {
  getItem: (key: string) => null | string;
}): null | string {
  const stored = storage.getItem(PENDING_INVITE_STORAGE_KEY);
  return stored ? parseReferralCode(stored) : null;
}

export function storePendingInvite(
  storage: { setItem: (key: string, value: string) => void },
  code: string,
): boolean {
  const parsed = parseReferralCode(code);
  if (!parsed) {
    return false;
  }
  storage.setItem(PENDING_INVITE_STORAGE_KEY, parsed);
  return true;
}

function RewardTile({
  hint,
  label,
  value,
}: {
  hint: string;
  label: string;
  value: string;
}) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--line)",
        borderRadius: 13,
        padding: "11px 12px",
      }}
    >
      <div style={{ color: "var(--muted)", fontSize: 12, marginBottom: 5 }}>
        {label}
      </div>
      <div className="ide-num" style={{ fontSize: 17, fontWeight: 800 }}>
        {value}
      </div>
      <div style={{ color: "var(--dim)", fontSize: 11.5, marginTop: 4 }}>
        {hint}
      </div>
    </div>
  );
}

export function InviteScreen() {
  const { client, connect, go, played, turnId, wallet, walletAddress } =
    useTyche();
  const [pendingCode, setPendingCode] = useState<null | string>(null);
  const [codeInput, setCodeInput] = useState("");
  const [attribution, setAttribution] = useState<{
    data: null | ReferralAttribution;
    error: boolean;
    loading: boolean;
  }>({ data: null, error: false, loading: true });
  const [gameTokens, setGameTokens] = useState<{
    count: null | number;
    error: boolean;
  }>({ count: null, error: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<null | string>(null);
  const [copied, setCopied] = useState<null | string>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const inviteLink = useMemo(
    () =>
      walletAddress && typeof window !== "undefined"
        ? buildReferralLink(window.location.origin, walletAddress)
        : "",
    [walletAddress],
  );

  useEffect(() => {
    setPendingCode(readPendingInvite(window.localStorage));
  }, []);

  useEffect(() => {
    let active = true;
    if (!walletAddress) {
      setAttribution({ data: null, error: false, loading: false });
      setGameTokens({ count: null, error: false });
      return () => {
        active = false;
      };
    }
    const invitee = address(walletAddress);
    setAttribution((current) => ({ ...current, error: false, loading: true }));
    fetchReferralAttribution({ client, invitee })
      .then((data) => {
        if (active) setAttribution({ data, error: false, loading: false });
      })
      .catch((cause: unknown) => {
        console.warn("Failed to read the referral attribution.", cause);
        if (active) setAttribution({ data: null, error: true, loading: false });
      });
    countPlayerGameTokens({ client, player: invitee })
      .then((count) => {
        if (active) setGameTokens({ count, error: false });
      })
      .catch((cause: unknown) => {
        console.warn("Failed to count the wallet's game tokens.", cause);
        if (active) setGameTokens({ count: null, error: true });
      });
    return () => {
      active = false;
    };
  }, [client, reloadKey, walletAddress]);

  const action = resolveInviteAction({
    attributed: attribution.data !== null,
    code: pendingCode,
    // A confirmed guess in this turn already proves a GameToken exists, even if
    // the account scan itself did not come back.
    gameTokenCount: played ? (gameTokens.count ?? 1) : gameTokens.count,
    wallet: walletAddress ?? null,
  });

  const copy = useCallback(async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
  }, []);

  async function shareInvite() {
    setMessage(null);
    const text = `Play Tyche with me — the AI writes the rule, the chain draws the winner. Your first invited guess earns ${INVITEE_REWARD_LABEL}.`;
    try {
      if (navigator.share) {
        await navigator.share({ text, title: "Tyche invite", url: inviteLink });
        return;
      }
      await copy(`${text} ${inviteLink}`, "Invite text");
    } catch (cause) {
      setMessage(describeTxError(cause));
    }
  }

  function applyCode() {
    setMessage(null);
    if (!storePendingInvite(window.localStorage, codeInput)) {
      setMessage("That invite code is not a valid Solana wallet address.");
      return;
    }
    setPendingCode(parseReferralCode(codeInput));
    setCodeInput("");
  }

  async function registerAttribution(inviter: string) {
    if (!wallet || !walletAddress) {
      connect();
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const instruction = await createAttributeReferralInstruction({
        invitee: address(walletAddress),
        inviter,
      });
      const signature = await sendInstruction(client, wallet, instruction);
      setMessage(`Attribution confirmed: ${truncateAddress(signature)}.`);
      setReloadKey((key) => key + 1);
    } catch (cause) {
      setMessage(describeTxError(cause));
    } finally {
      setBusy(false);
    }
  }

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
          padding: "var(--ide-shell-content-top) 18px 96px",
        }}
      >
        <ScreenHead onBack={() => go("profile")} title="Invite friends" />

        <div className="ide-card" style={{ padding: "18px 18px 12px", marginBottom: 14 }}>
          <SectionLabel>Referral rewards</SectionLabel>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 9,
              margin: "10px 0 0",
            }}
          >
            <RewardTile
              hint="maximum referral payout"
              label="You earn"
              value={INVITER_REWARD_WITH_MAXIMUM_BONUS_LABEL}
            />
            <RewardTile
              hint="paid to them"
              label="They earn"
              value={INVITEE_REWARD_LABEL}
            />
          </div>
        </div>

        {walletAddress ? (
          <div className="ide-card" style={{ padding: 18, marginBottom: 14 }}>
            <SectionLabel>Your invite link</SectionLabel>
            <div
              className="ide-num"
              style={{
                background: "var(--surface)",
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: "11px 12px",
                margin: "10px 0 10px",
                fontSize: 12.5,
                color: "var(--muted)",
                overflowWrap: "anywhere",
              }}
            >
              {inviteLink}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
              <button
                className="ide-btn"
                onClick={() => void copy(inviteLink, "Invite link")}
                type="button"
              >
                <Ico.copy style={{ color: "var(--on-accent)" }} /> Copy link
              </button>
              <button
                className="ide-btn ide-btn-ghost"
                onClick={() => void shareInvite()}
                type="button"
              >
                <Ico.send style={{ color: "var(--purple-soft)" }} /> Share
              </button>
            </div>
            <button
              className="ide-btn ide-btn-ghost"
              onClick={() => void copy(walletAddress, "Invite code")}
              style={{ width: "100%", marginTop: 9 }}
              type="button"
            >
              <Ico.users style={{ color: "var(--purple-soft)" }} /> Copy invite
              code
            </button>
            {copied ? (
              <p
                role="status"
                style={{
                  margin: "10px 0 0",
                  fontSize: 13,
                  color: "var(--green)",
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                }}
              >
                <Ico.check style={{ color: "var(--green)" }} /> {copied} copied.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="ide-card" style={{ padding: 18, marginBottom: 14, textAlign: "center" }}>
            <div style={{ display: "grid", placeItems: "center", marginBottom: 10 }}>
              <Dealer size={54} />
            </div>
            <h2 style={{ fontSize: 19, fontWeight: 800, margin: "0 0 6px" }}>
              Connect to get your invite link
            </h2>
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 14px" }}>
              Your wallet address is your invite code, so the link works without
              any account.
            </p>
            <button className="ide-btn" onClick={connect} style={{ width: "100%" }} type="button">
              <Ico.wallet style={{ color: "var(--on-accent)" }} /> Connect wallet
            </button>
          </div>
        )}

        <div className="ide-card" style={{ padding: 18, marginBottom: 14 }}>
          <SectionLabel>Invited by</SectionLabel>

          {attribution.loading && walletAddress ? (
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "10px 0 0" }}>
              Checking your on-chain attribution…
            </p>
          ) : null}

          {attribution.error ? (
            <p style={{ color: "var(--red)", fontSize: 13.5, margin: "10px 0 0" }}>
              Your referral attribution could not be read from devnet.
            </p>
          ) : null}

          {!attribution.loading && action.kind === "attributed" && attribution.data ? (
            <div style={{ marginTop: 10 }}>
              <div className="ide-listrow" style={{ cursor: "default" }}>
                <span
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 10,
                    display: "grid",
                    placeItems: "center",
                    flexShrink: 0,
                    background: "rgba(124,246,184,0.14)",
                  }}
                >
                  <Ico.users style={{ color: "var(--green)" }} />
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>
                    {truncateAddress(attribution.data.inviter)}
                  </div>
                  <div style={{ color: "var(--dim)", fontSize: 12.5 }}>
                    Attributed once · cannot be changed
                  </div>
                </div>
              </div>
              <p style={{ color: "var(--muted)", fontSize: 13.5, margin: "10px 0 0", lineHeight: 1.55 }}>
                {describeAttributionProgress(attribution.data)}
              </p>
            </div>
          ) : null}

          {!attribution.loading && action.kind === "ready" ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 12px", lineHeight: 1.55 }}>
                You were invited by{" "}
                <strong className="ide-num">{truncateAddress(action.inviter)}</strong>
                . Register the invite before your first guess in turn{" "}
                {fmtTurnId(turnId)}.
              </p>
              {gameTokens.error ? (
                <p style={{ color: "var(--yellow)", fontSize: 13, margin: "0 0 10px" }}>
                  Your previous rounds could not be read from devnet, so this
                  wallet&apos;s eligibility is unverified here. The programme
                  checks it at settlement.
                </p>
              ) : null}
              <button
                className="ide-btn"
                disabled={busy}
                onClick={() => void registerAttribution(action.inviter)}
                style={{ width: "100%" }}
                type="button"
              >
                <Ico.check style={{ color: "var(--on-accent)" }} />
                {busy ? "Waiting for wallet…" : "Register invite"}
              </button>
            </div>
          ) : null}

          {!attribution.loading && action.kind === "played_already" ? (
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "10px 0 0", lineHeight: 1.55 }}>
              This wallet has already played, so a referral can no longer qualify
              for it — the reward requires an attribution recorded before the
              invitee&apos;s first guess. Share your own link instead.
            </p>
          ) : null}

          {!attribution.loading && action.kind === "self_invite" ? (
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "10px 0 0", lineHeight: 1.55 }}>
              That invite code is your own wallet. Self-referral is rejected
              on-chain.
            </p>
          ) : null}

          {!attribution.loading && action.kind === "enter_code" ? (
            <div style={{ marginTop: 10 }}>
              <p style={{ color: "var(--muted)", fontSize: 14, margin: "0 0 10px", lineHeight: 1.55 }}>
                Paste an invite link or code to be attributed to the player who
                invited you.
              </p>
              <input
                aria-label="Invite link or code"
                className="ide-num"
                onChange={(event) => setCodeInput(event.target.value)}
                placeholder="https://…/play?ref=…"
                style={{
                  width: "100%",
                  background: "var(--surface)",
                  border: "1px solid var(--line)",
                  borderRadius: 12,
                  color: "var(--text)",
                  fontSize: 13,
                  padding: "12px 12px",
                }}
                value={codeInput}
              />
              <button
                className="ide-btn ide-btn-ghost"
                disabled={!codeInput.trim()}
                onClick={applyCode}
                style={{ width: "100%", marginTop: 9 }}
                type="button"
              >
                <Ico.arrow style={{ color: "var(--purple-soft)" }} /> Use invite
                code
              </button>
            </div>
          ) : null}

          {action.kind === "connect" ? (
            <p style={{ color: "var(--muted)", fontSize: 14, margin: "10px 0 0" }}>
              Connect your wallet to register an invite.
            </p>
          ) : null}

          {message ? (
            <p role="status" style={{ margin: "12px 0 0", fontSize: 13, color: "var(--muted)" }}>
              {message}
            </p>
          ) : null}
        </div>

        <div className="ide-notice" role="note" style={{ display: "flex", gap: 9, alignItems: "flex-start" }}>
          <Ico.info style={{ color: "var(--dim)", flexShrink: 0, marginTop: 3 }} />
          <div>
            <p style={{ margin: 0, color: "var(--dim)", fontSize: 12.5, lineHeight: 1.6 }}>
              One attribution per wallet, set once and never editable. Rewards are
              paid from the promotional campaign reserve, are never a guaranteed
              return, and can be partial when the reserve reaches its final atoms.
              Visiting a link pays nothing on its own.
            </p>
            <p style={{ margin: "10px 0 0", color: "var(--dim)", fontSize: 12.5, lineHeight: 1.6 }}>
              <strong style={{ color: "var(--text)" }}>Reward details.</strong>{" "}
              The maximum includes your {INVITER_REWARD_LABEL} referral reward
              and a {INVITER_FIRST_ROUND_MAXIMUM_BONUS_LABEL} bonus: {FIRST_ROUND_BONUS_LABEL} of their {INVITEE_REWARD_LABEL} invite reward, {PROPOSAL_REWARD_LABEL} rule reward, and {SUPPORTER_REWARD_LABEL} vote reward in their first round.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
