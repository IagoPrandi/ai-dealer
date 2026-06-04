"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";

type VotingMode = "rules" | "empty";

interface ProposedRule {
  id: string;
  title: string;
  text: string;
  explanation: string;
  creator: string;
  initialVotes: number;
  clarity: "High" | "Medium";
  difficulty: "Medium" | "Hard";
  tokenCount: number;
}

interface VoteActivity {
  id: string;
  detail: string;
  time: string;
}

const VOTING_CLOSE_SECONDS = 37 * 60 + 12;

const PROPOSED_RULES: readonly ProposedRule[] = [
  {
    id: "closest-even-sum",
    title: "Closest even sum wins",
    text: "The guess with the closest even total to the drawn total wins.",
    explanation: "Compares the even-number totals in each eligible guess.",
    creator: "4sF...9k2",
    initialVotes: 42,
    clarity: "High",
    difficulty: "Hard",
    tokenCount: 12
  },
  {
    id: "balanced-spread",
    title: "Balanced spread wins",
    text: "The guess with the smallest distance between its highest and lowest numbers wins.",
    explanation: "Rewards the tightest range between the lowest and highest number.",
    creator: "8xP...K2m",
    initialVotes: 42,
    clarity: "High",
    difficulty: "Medium",
    tokenCount: 14
  },
  {
    id: "highest-odd-number",
    title: "Highest odd number wins",
    text: "The guess containing the highest odd number drawn wins.",
    explanation: "Looks for the highest odd drawn number in each eligible guess.",
    creator: "2vR...Q7a",
    initialVotes: 38,
    clarity: "Medium",
    difficulty: "Medium",
    tokenCount: 10
  }
] as const;

const INITIAL_ACTIVITY: readonly VoteActivity[] = [
  { id: "activity-1", detail: "Balanced spread wins reached 40 votes.", time: "3m ago" },
  { id: "activity-2", detail: "Closest even sum wins took the lead.", time: "7m ago" }
] as const;

function formatCountdown(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function createInitialVoteCounts() {
  return Object.fromEntries(PROPOSED_RULES.map((rule) => [rule.id, rule.initialVotes]));
}

export function RuleVotingPanel() {
  const [mode, setMode] = useState<VotingMode>("rules");
  const [remainingSeconds, setRemainingSeconds] = useState(VOTING_CLOSE_SECONDS);
  const [voteCounts, setVoteCounts] = useState<Record<string, number>>(createInitialVoteCounts);
  const [currentVoteId, setCurrentVoteId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState("Choose one rule. You can change your vote in this prototype.");
  const [activity, setActivity] = useState<readonly VoteActivity[]>(INITIAL_ACTIVITY);
  const activitySequence = useRef(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const leadingRule = useMemo(
    () =>
      PROPOSED_RULES.reduce((leader, rule) =>
        (voteCounts[rule.id] ?? 0) > (voteCounts[leader.id] ?? 0) ? rule : leader
      ),
    [voteCounts]
  );

  function castVote(rule: ProposedRule) {
    if (currentVoteId === rule.id) {
      setFeedback(`Your vote remains on ${rule.title}.`);
      return;
    }

    const previousVoteId = currentVoteId;

    setVoteCounts((current) => {
      const next = { ...current, [rule.id]: (current[rule.id] ?? 0) + 1 };

      if (previousVoteId) {
        next[previousVoteId] = Math.max(0, (current[previousVoteId] ?? 0) - 1);
      }

      return next;
    });
    setCurrentVoteId(rule.id);
    setFeedback(previousVoteId ? `Vote changed to ${rule.title}.` : `Vote cast for ${rule.title}.`);
    activitySequence.current += 1;
    setActivity((current) => [
      {
        id: `vote-${activitySequence.current}`,
        detail: `You voted for ${rule.title}.`,
        time: "Now"
      },
      ...current
    ]);
  }

  return (
    <main className="voting-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play">
          Live round
        </Link>
        <div className="voting-header-copy">
          <div>
            <p className="eyebrow">Turn TURN-0008</p>
            <strong>Vote for a rule</strong>
          </div>
          <div className="voting-countdown">
            <span>Voting closes</span>
            <strong className="numeric">{formatCountdown(remainingSeconds)}</strong>
          </div>
        </div>
      </header>

      <div className="voting-mode-control" aria-label="Voting prototype state">
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
        <section className="voting-empty-state" aria-labelledby="empty-rules-title">
          <p className="eyebrow">Rule pool</p>
          <h1 id="empty-rules-title">No eligible rules yet.</h1>
          <p>New proposals will appear here after they pass prototype preflight.</p>
          <button className="primary-action inline-action" onClick={() => setMode("rules")} type="button">
            View prototype rules
          </button>
        </section>
      ) : (
        <div className="voting-content">
          <section className="voting-summary" aria-labelledby="voting-title">
            <div>
              <p className="eyebrow">Leading rule</p>
              <h1 id="voting-title">{leadingRule.title}</h1>
              <p>
                {voteCounts[leadingRule.id]} votes. Voting influences the finalist set; VRF still
                selects the Rule of the Hour.
              </p>
            </div>
            <div className="your-vote-summary">
              <span>Your vote</span>
              <strong>
                {currentVoteId
                  ? PROPOSED_RULES.find((rule) => rule.id === currentVoteId)?.title
                  : "Not cast"}
              </strong>
            </div>
          </section>

          <p className="vote-feedback" aria-live="polite">
            {feedback}
          </p>

          <section className="rule-voting-list" aria-label="Proposed rules">
            {PROPOSED_RULES.map((rule) => {
              const isLeading = leadingRule.id === rule.id;
              const isCurrentVote = currentVoteId === rule.id;

              return (
                <article
                  className={isLeading ? "voting-rule-card leading" : "voting-rule-card"}
                  key={rule.id}
                  aria-labelledby={`${rule.id}-title`}
                >
                  <div className="voting-card-heading">
                    <div>
                      <p className="eyebrow">{isLeading ? "Leading rule" : "Eligible rule"}</p>
                      <h2 id={`${rule.id}-title`}>{rule.title}</h2>
                    </div>
                    <strong className="vote-total">{voteCounts[rule.id]} votes</strong>
                  </div>

                  <p className="rule-original-text">“{rule.text}”</p>
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

                  <button
                    aria-pressed={isCurrentVote}
                    className={isCurrentVote ? "vote-action selected" : "vote-action"}
                    onClick={() => castVote(rule)}
                    type="button"
                  >
                    {isCurrentVote
                      ? "Your vote"
                      : currentVoteId
                        ? `Change vote to ${rule.title}`
                        : `Vote for ${rule.title}`}
                  </button>
                </article>
              );
            })}
          </section>

          <section className="vote-activity-panel" aria-labelledby="vote-activity-title">
            <div className="section-heading">
              <p className="eyebrow">Activity</p>
              <span>Live prototype feed</span>
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
