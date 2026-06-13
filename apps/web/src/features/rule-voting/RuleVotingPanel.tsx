"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { address } from "@solana/kit";
import {
  useSolanaClient,
  useWaitForSignature,
  useWalletConnection,
} from "@solana/react-hooks";
import {
  createVoteRuleInstruction,
  deriveRuleProposalAddress,
  deriveRuleVoteAddress,
  deriveSubmitGuessAccounts,
  fetchActiveTurnSnapshot,
  getTurnActionReadiness,
  IDEALER_ACTIVE_TURN_ID,
  type RuleVoteReceipt,
} from "../../solana/idealerProgram";

type VotingMode = "rules" | "empty";
type VoteStatus =
  | "idle"
  | "awaiting_approval"
  | "pending"
  | "confirmed"
  | "duplicate"
  | "closed"
  | "failed";

interface ProposedRule {
  clarity: "High" | "Medium";
  creator: string;
  difficulty: "Medium" | "Hard";
  explanation: string;
  initialVotes: number;
  ruleId: number;
  ruleProposal?: string;
  text: string;
  title: string;
  tokenCount: number;
}

interface VoteActivity {
  detail: string;
  id: string;
  time: string;
}

interface VoteFeedback {
  code?: string;
  message: string;
  receipt?: RuleVoteReceipt;
  signature?: string;
  status: VoteStatus;
}

interface ApiRuleProposal {
  proposer: string;
  ruleId: number;
  ruleProposal?: string;
  sanitizedText: string;
  title?: string;
  tokenCount: number;
}

const VOTING_CLOSE_SECONDS = 37 * 60 + 12;
const API_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_API_URL ?? "http://localhost:3002";
const DEVNET_BOOTSTRAP_RULE: ProposedRule = {
  clarity: "High",
  creator: "4bY...xCH",
  difficulty: "Medium",
  explanation:
    "This rule is already committed on devnet and can receive on-chain votes.",
  initialVotes: 1,
  ruleId: 1,
  ruleProposal: "B1KHQhbEzaXBTTMXSNVCWM6GhSAjFTEwdrY1N7DvBnZU",
  text: "Win if the submitted guess contains all six drawn numbers.",
  title: "All six drawn numbers",
  tokenCount: 11,
};
const INITIAL_ACTIVITY: readonly VoteActivity[] = [
  {
    detail: "All six drawn numbers has one indexed devnet vote.",
    id: "activity-1",
    time: "Indexed",
  },
] as const;

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds
    .toString()
    .padStart(2, "0")}`;
}

function truncateAddress(value: string) {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function normalizeVoteError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("reject") ||
    normalizedMessage.includes("declin") ||
    normalizedMessage.includes("cancel")
  ) {
    return {
      code: "TRANSACTION_REJECTED",
      message: "The wallet request was rejected. Your vote was not submitted.",
      status: "failed" as const,
    };
  }

  if (
    normalizedMessage.includes("already in use") ||
    normalizedMessage.includes("accountalreadyinitialized") ||
    normalizedMessage.includes("custom program error: 0x0")
  ) {
    return {
      code: "DUPLICATE_RULE_VOTE",
      message: "This wallet already voted for this rule in the active turn.",
      status: "duplicate" as const,
    };
  }

  if (
    normalizedMessage.includes("action window") ||
    normalizedMessage.includes("turn is not open") ||
    normalizedMessage.includes("no active turn") ||
    normalizedMessage.includes("custom program error: 0x1773") ||
    normalizedMessage.includes("custom program error: 0x1775") ||
    normalizedMessage.includes("custom program error: 0x1777")
  ) {
    return {
      code: "VOTING_CLOSED",
      message: "Voting is closed for this turn.",
      status: "closed" as const,
    };
  }

  return {
    code: "RULE_VOTE_FAILED",
    message,
    status: "failed" as const,
  };
}

async function persistRuleVote(receipt: RuleVoteReceipt) {
  const response = await fetch(`${API_BASE_URL}/rule-votes`, {
    body: JSON.stringify(receipt),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`Rule vote API returned HTTP ${response.status}.`);
  }
}

export function RuleVotingPanel() {
  const client = useSolanaClient();
  const { connected, wallet } = useWalletConnection();
  const [mode, setMode] = useState<VotingMode>("rules");
  const [remainingSeconds, setRemainingSeconds] =
    useState(VOTING_CLOSE_SECONDS);
  const [rules, setRules] = useState<ProposedRule[]>([DEVNET_BOOTSTRAP_RULE]);
  const [voteCounts, setVoteCounts] = useState<Record<number, number>>({
    [DEVNET_BOOTSTRAP_RULE.ruleId]: DEVNET_BOOTSTRAP_RULE.initialVotes,
  });
  const [currentVoteRuleId, setCurrentVoteRuleId] = useState<number | null>(
    null,
  );
  const [feedback, setFeedback] = useState<VoteFeedback>({
    message:
      "Choose one committed devnet rule. Each wallet can create one RuleVote account per rule.",
    status: "idle",
  });
  const [activity, setActivity] =
    useState<readonly VoteActivity[]>(INITIAL_ACTIVITY);
  const activitySequence = useRef(0);
  const walletAddress = wallet?.account.address.toString();
  const isVotingClosed = remainingSeconds === 0;
  const isSubmitting =
    feedback.status === "awaiting_approval" || feedback.status === "pending";
  const signatureStatus = useWaitForSignature(feedback.signature, {
    commitment: "confirmed",
    disabled: !feedback.signature,
    subscribe: true,
  });

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void Promise.all([
      fetch(`${API_BASE_URL}/rule-proposals?turnId=${IDEALER_ACTIVE_TURN_ID}`, {
        signal: controller.signal,
      }),
      fetch(`${API_BASE_URL}/rule-votes?turnId=${IDEALER_ACTIVE_TURN_ID}`, {
        signal: controller.signal,
      }),
    ])
      .then(async ([proposalResponse, voteResponse]) => {
        const proposalBody = proposalResponse.ok
          ? ((await proposalResponse.json()) as {
              proposals?: ApiRuleProposal[];
            })
          : { proposals: [] };
        const voteBody = voteResponse.ok
          ? ((await voteResponse.json()) as { counts?: Record<string, number> })
          : { counts: {} };
        const apiRules = await Promise.all(
          (proposalBody.proposals ?? []).map(async (proposal) => ({
            clarity: "High" as const,
            creator: truncateAddress(proposal.proposer),
            difficulty: "Medium" as const,
            explanation:
              "This proposal passed server preflight and was committed on-chain.",
            initialVotes: voteBody.counts?.[String(proposal.ruleId)] ?? 0,
            ruleId: proposal.ruleId,
            ruleProposal:
              proposal.ruleProposal ??
              (
                await deriveRuleProposalAddress({
                  ruleId: proposal.ruleId,
                  turnId: IDEALER_ACTIVE_TURN_ID,
                })
              ).toString(),
            text: proposal.sanitizedText,
            title: proposal.title ?? `Rule #${proposal.ruleId}`,
            tokenCount: proposal.tokenCount,
          })),
        );
        const nextRules = [
          ...apiRules.filter(
            (rule) => rule.ruleId !== DEVNET_BOOTSTRAP_RULE.ruleId,
          ),
          DEVNET_BOOTSTRAP_RULE,
        ];
        const nextCounts = Object.fromEntries(
          nextRules.map((rule) => [
            rule.ruleId,
            (voteBody.counts?.[String(rule.ruleId)] ?? 0) +
              (rule.ruleId === DEVNET_BOOTSTRAP_RULE.ruleId ? 1 : 0),
          ]),
        );

        setRules(nextRules);
        setVoteCounts(nextCounts);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        setFeedback({
          code: "RULE_VOTE_FEED_FAILED",
          message:
            error instanceof Error
              ? error.message
              : "Could not load indexed vote state.",
          status: "failed",
        });
      });

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!feedback.signature || !feedback.receipt) {
      return;
    }

    const receipt = feedback.receipt;
    const signature = feedback.signature;
    const votedRule = rules.find((rule) => rule.ruleId === receipt.ruleId);

    if (signatureStatus.isSuccess) {
      void persistRuleVote(receipt)
        .then(() => {
          setCurrentVoteRuleId(receipt.ruleId);
          setVoteCounts((current) => ({
            ...current,
            [receipt.ruleId]: (current[receipt.ruleId] ?? 0) + 1,
          }));
          setFeedback({
            message: `Vote confirmed for ${votedRule?.title ?? "the selected rule"}.`,
            receipt,
            signature,
            status: "confirmed",
          });
          activitySequence.current += 1;
          setActivity((current) => [
            {
              detail: `You voted for ${votedRule?.title ?? "the selected rule"}.`,
              id: `vote-${activitySequence.current}`,
              time: "Now",
            },
            ...current,
          ]);
        })
        .catch((error: unknown) => {
          setFeedback({
            code: "RULE_VOTE_API_FAILED",
            message: error instanceof Error ? error.message : String(error),
            receipt,
            signature,
            status: "failed",
          });
        });
    } else if (signatureStatus.isError) {
      const normalized = normalizeVoteError(signatureStatus.waitError);
      setFeedback({
        code: normalized.code,
        message: normalized.message,
        receipt,
        signature,
        status: normalized.status,
      });
    }
  }, [
    feedback.receipt,
    feedback.signature,
    rules,
    signatureStatus.isError,
    signatureStatus.isSuccess,
    signatureStatus.waitError,
  ]);

  const leadingRule = useMemo(
    () =>
      rules.reduce((leader, rule) =>
        (voteCounts[rule.ruleId] ?? 0) > (voteCounts[leader.ruleId] ?? 0)
          ? rule
          : leader,
      ),
    [rules, voteCounts],
  );

  async function castVote(rule: ProposedRule) {
    if (isVotingClosed) {
      setFeedback({
        code: "VOTING_CLOSED",
        message: "Voting is closed for this turn.",
        status: "closed",
      });
      return;
    }

    if (!connected || !wallet || !walletAddress) {
      setFeedback({
        code: "WALLET_NOT_CONNECTED",
        message: "Connect a Solana devnet wallet before voting.",
        status: "failed",
      });
      return;
    }

    let receipt: RuleVoteReceipt | undefined;

    try {
      const player = address(walletAddress);
      const activeTurn = await fetchActiveTurnSnapshot(client);
      const turnReadiness = getTurnActionReadiness({
        cutoffBps: activeTurn.globalConfig.ruleElectionCutoffBps,
        globalConfig: activeTurn.globalConfig,
        turn: activeTurn.turnState,
      });

      if (!turnReadiness.ok) {
        setFeedback({
          code: turnReadiness.code,
          message: turnReadiness.message,
          status: "closed",
        });
        return;
      }

      const turnId = activeTurn.globalConfig.activeTurnId;
      const accounts = await deriveSubmitGuessAccounts({
        player,
        turnId,
      });
      const gameToken = await client.runtime.rpc
        .getAccountInfo(accounts.gameToken, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();

      if (!gameToken.value) {
        setFeedback({
          code: "GAME_TOKEN_REQUIRED",
          message: "Submit a guess for this turn before voting.",
          status: "failed",
        });
        return;
      }

      const ruleProposal = await deriveRuleProposalAddress({
        ruleId: rule.ruleId,
        turnId,
      });
      const ruleVote = await deriveRuleVoteAddress({
        player,
        ruleId: rule.ruleId,
        turnId,
      });
      const existingVote = await client.runtime.rpc
        .getAccountInfo(ruleVote, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();

      if (existingVote.value) {
        setCurrentVoteRuleId(rule.ruleId);
        setFeedback({
          code: "DUPLICATE_RULE_VOTE",
          message:
            "This wallet already voted for this rule in the active turn.",
          status: "duplicate",
        });
        return;
      }

      receipt = {
        ruleId: rule.ruleId,
        ruleProposal: ruleProposal.toString(),
        ruleVote: ruleVote.toString(),
        signature: "",
        submittedAt: new Date().toISOString(),
        turnId,
        voter: walletAddress,
      };
      setFeedback({
        message: "Approve the rule vote transaction in your wallet.",
        receipt,
        status: "awaiting_approval",
      });

      const instruction = await createVoteRuleInstruction({
        player,
        ruleId: rule.ruleId,
        turnId,
      });
      const signature = (
        await client.transaction.prepareAndSend(
          {
            authority: wallet,
            commitment: "confirmed",
            feePayer: player,
            instructions: [instruction],
            version: 0,
          },
          { commitment: "confirmed", maxRetries: 3, skipPreflight: false },
        )
      ).toString();
      const pendingReceipt = { ...receipt, signature };
      setFeedback({
        message: "Wallet approval returned. Waiting for devnet confirmation.",
        receipt: pendingReceipt,
        signature,
        status: "pending",
      });
    } catch (error) {
      const normalized = normalizeVoteError(error);
      setFeedback({
        code: normalized.code,
        message: normalized.message,
        status: normalized.status,
        ...(receipt ? { receipt } : {}),
      });
    }
  }

  return (
    <main className="voting-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play">
          Live round
        </Link>
        <div className="voting-header-copy">
          <div>
            <p className="eyebrow">
              Turn TURN-{IDEALER_ACTIVE_TURN_ID.toString().padStart(4, "0")}
            </p>
            <strong>Vote for a rule</strong>
          </div>
          <div className="voting-countdown">
            <span>Voting closes</span>
            <strong className="numeric">
              {formatCountdown(remainingSeconds)}
            </strong>
          </div>
        </div>
      </header>

      <div className="voting-mode-control" aria-label="Voting state">
        <button
          aria-pressed={mode === "rules"}
          className="mode-button"
          onClick={() => setMode("rules")}
          type="button"
        >
          Eligible rules
        </button>
        <button
          aria-pressed={mode === "empty"}
          className="mode-button"
          onClick={() => setMode("empty")}
          type="button"
        >
          Empty state
        </button>
      </div>

      {mode === "empty" ? (
        <section
          className="voting-empty-state"
          aria-labelledby="empty-rules-title"
        >
          <p className="eyebrow">Rule pool</p>
          <h1 id="empty-rules-title">No eligible rules yet.</h1>
          <p>
            New proposals will appear here after they pass devnet preflight.
          </p>
          <button
            className="primary-action inline-action"
            onClick={() => setMode("rules")}
            type="button"
          >
            View eligible rules
          </button>
        </section>
      ) : (
        <div className="voting-content">
          <section className="voting-summary" aria-labelledby="voting-title">
            <div>
              <p className="eyebrow">Leading rule</p>
              <h1 id="voting-title">{leadingRule.title}</h1>
              <p>
                {voteCounts[leadingRule.ruleId] ?? 0} indexed votes. Voting
                influences the finalist set; VRF still selects the Rule of the
                Hour.
              </p>
            </div>
            <div className="your-vote-summary">
              <span>Your vote</span>
              <strong>
                {currentVoteRuleId
                  ? rules.find((rule) => rule.ruleId === currentVoteRuleId)
                      ?.title
                  : "Not cast"}
              </strong>
            </div>
          </section>

          <article
            aria-live="polite"
            className={`guess-status-card ${feedback.status}`}
            role={feedback.status === "failed" ? "alert" : undefined}
          >
            <strong>
              {feedback.status === "awaiting_approval"
                ? "Awaiting wallet approval"
                : null}
              {feedback.status === "pending" ? "Transaction pending" : null}
              {feedback.status === "confirmed" ? "Vote confirmed" : null}
              {feedback.status === "duplicate" ? "Duplicate blocked" : null}
              {feedback.status === "closed" ? "Voting closed" : null}
              {feedback.status === "failed" ? "Vote failed" : null}
              {feedback.status === "idle" ? "Voting status" : null}
            </strong>
            <p>{feedback.message}</p>
            {feedback.code ? <code>{feedback.code}</code> : null}
            {feedback.signature ? (
              <a
                href={`https://explorer.solana.com/tx/${feedback.signature}?cluster=devnet`}
                rel="noreferrer"
                target="_blank"
              >
                View devnet transaction
              </a>
            ) : null}
          </article>

          <section className="rule-voting-list" aria-label="Proposed rules">
            {rules.map((rule) => {
              const isLeading = leadingRule.ruleId === rule.ruleId;
              const isCurrentVote = currentVoteRuleId === rule.ruleId;

              return (
                <article
                  aria-labelledby={`rule-${rule.ruleId}-title`}
                  className={
                    isLeading ? "voting-rule-card leading" : "voting-rule-card"
                  }
                  key={rule.ruleId}
                >
                  <div className="voting-card-heading">
                    <div>
                      <p className="eyebrow">
                        {isLeading ? "Leading rule" : "Eligible rule"}
                      </p>
                      <h2 id={`rule-${rule.ruleId}-title`}>{rule.title}</h2>
                    </div>
                    <strong className="vote-total">
                      {voteCounts[rule.ruleId] ?? 0} votes
                    </strong>
                  </div>

                  <p className="rule-original-text">"{rule.text}"</p>
                  <p className="rule-explanation">{rule.explanation}</p>

                  <dl className="rule-metadata">
                    <div>
                      <dt>Creator</dt>
                      <dd>{rule.creator}</dd>
                    </div>
                    <div>
                      <dt>Clarity</dt>
                      <dd>{rule.clarity}</dd>
                    </div>
                    <div>
                      <dt>Difficulty</dt>
                      <dd>{rule.difficulty}</dd>
                    </div>
                    <div>
                      <dt>Tokens</dt>
                      <dd>{rule.tokenCount}/80</dd>
                    </div>
                  </dl>

                  {connected ? (
                    <button
                      aria-pressed={isCurrentVote}
                      className={
                        isCurrentVote ? "vote-action selected" : "vote-action"
                      }
                      disabled={isSubmitting || isVotingClosed}
                      onClick={() => castVote(rule)}
                      type="button"
                    >
                      {isCurrentVote
                        ? "Your vote"
                        : isSubmitting
                          ? "Submitting..."
                          : `Vote for ${rule.title}`}
                    </button>
                  ) : (
                    <Link className="vote-action" href="/play/wallet">
                      Connect wallet to vote
                    </Link>
                  )}
                </article>
              );
            })}
          </section>

          <section
            className="vote-activity-panel"
            aria-labelledby="vote-activity-title"
          >
            <div className="section-heading">
              <p className="eyebrow">Activity</p>
              <span>Indexed devnet feed</span>
            </div>
            <h2 id="vote-activity-title">Recent voting events</h2>
            <ul className="activity-list">
              {activity.map((event) => (
                <li key={event.id}>
                  <strong>{event.detail}</strong>
                  <time>{event.time}</time>
                </li>
              ))}
            </ul>
          </section>
        </div>
      )}
    </main>
  );
}
