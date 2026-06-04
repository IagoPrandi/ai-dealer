"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CREATOR_REWARD_RATE_BPS,
  MVP_FEES_SOL,
  TURN_DURATION_CYCLE_HOURS
} from "@idealer/constants";

type HubMode = "live" | "loading" | "empty" | "delayed";

interface ActivityEvent {
  id: string;
  label: string;
  detail: string;
  time: string;
}

const turn = {
  id: "TURN-0008",
  cycleIndex: 2,
  prizePoolSol: 12.48,
  startsAt: "14:00",
  votingClosesAt: "14:45",
  guessesCloseAt: "15:42",
  drawBeginsAt: "15:46",
  endsInSeconds: 2 * 60 * 60 + 18 * 60 + 42,
  activeRule: {
    title: "Closest even sum wins",
    status: "Leading rule",
    votes: 42,
    creator: "4sF...9k2"
  }
} as const;

const activityFeed: readonly ActivityEvent[] = [
  {
    id: "evt-1",
    label: "Rule proposed",
    detail: "Highest odd number wins",
    time: "2m ago"
  },
  {
    id: "evt-2",
    label: "Vote cast",
    detail: "Closest even sum wins",
    time: "5m ago"
  },
  {
    id: "evt-3",
    label: "Prize increased",
    detail: "+0.21 SOL entered this turn",
    time: "8m ago"
  }
];

const secondaryActions = [
  { href: "/play/vote", label: "Vote" },
  { href: "/play/propose", label: "Propose rule" },
  { href: "/play/simulate", label: "Cycle" },
  { href: "/play/results", label: "Results" }
] as const;

function formatCountdown(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  return [hours, minutes, seconds].map((value) => value.toString().padStart(2, "0")).join(":");
}

function useCountdown(initialSeconds: number) {
  const [remainingSeconds, setRemainingSeconds] = useState(initialSeconds);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  return formatCountdown(remainingSeconds);
}

function ModeButton({
  activeMode,
  children,
  mode,
  setMode
}: {
  activeMode: HubMode;
  children: React.ReactNode;
  mode: HubMode;
  setMode: (mode: HubMode) => void;
}) {
  return (
    <button
      aria-pressed={activeMode === mode}
      className="mode-button"
      onClick={() => setMode(mode)}
      type="button"
    >
      {children}
    </button>
  );
}

function StickyHeader({ countdown }: { countdown: string }) {
  return (
    <header className="live-header">
      <div>
        <p className="eyebrow">Prize pool</p>
        <strong>{turn.prizePoolSol.toFixed(2)} SOL</strong>
      </div>
      <div className="header-divider" aria-hidden="true" />
      <div>
        <p className="eyebrow">Closes in</p>
        <strong className="numeric">{countdown}</strong>
      </div>
      <div className="wallet-pill" aria-label="Connected wallet">
        4sF...9k2
      </div>
    </header>
  );
}

function LoadingState() {
  return (
    <section className="state-panel" aria-live="polite">
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
      <div className="skeleton-grid">
        <div className="skeleton skeleton-block" />
        <div className="skeleton skeleton-block" />
      </div>
    </section>
  );
}

function EmptyState() {
  return (
    <section className="state-panel">
      <p className="eyebrow">No active turn</p>
      <h1>New turn opens shortly.</h1>
      <p>The latest result remains available while the next turn is prepared.</p>
      <button className="primary-action inline-action" type="button">
        View results
      </button>
    </section>
  );
}

function DelayedState() {
  return (
    <section className="state-panel warning-panel">
      <p className="eyebrow">Draw delayed</p>
      <h1>VRF confirmation is pending.</h1>
      <p>Your guess remains recorded. The audit trail will update when the draw is fulfilled.</p>
      <button className="secondary-action inline-action" type="button">
        View audit
      </button>
    </section>
  );
}

function LiveState({ countdown }: { countdown: string }) {
  const currentDuration = TURN_DURATION_CYCLE_HOURS[turn.cycleIndex];
  const creatorRewardPercent = CREATOR_REWARD_RATE_BPS / 100;

  return (
    <>
      <section className="hero-panel" aria-labelledby="round-title">
        <div className="round-meta">
          <span>{turn.id}</span>
          <span>
            {currentDuration}h turn, cycle {turn.cycleIndex + 1}/{TURN_DURATION_CYCLE_HOURS.length}
          </span>
        </div>
        <h1 id="round-title">Pick six numbers before the draw.</h1>
        <p>
          Vote for the rule, follow the countdown, and keep the next action within reach.
        </p>
        <div className="hero-metrics" aria-label="Current turn metrics">
          <div>
            <span>Prize</span>
            <strong>{turn.prizePoolSol.toFixed(2)} SOL</strong>
          </div>
          <div>
            <span>Countdown</span>
            <strong className="numeric">{countdown}</strong>
          </div>
        </div>
      </section>

      <section className="rule-panel" aria-labelledby="rule-title">
        <div className="section-heading">
          <p className="eyebrow">Rule of the Hour</p>
          <span>{turn.activeRule.status}</span>
        </div>
        <h2 id="rule-title">{turn.activeRule.title}</h2>
        <p>
          {turn.activeRule.votes} votes. Creator reward is {creatorRewardPercent}% of each
          alternative winner payout, funded from the creator reward reserve.
        </p>
        <div className="rule-footer">
          <span>Creator {turn.activeRule.creator}</span>
          <button className="link-action" type="button">
            Audit
          </button>
        </div>
      </section>

      <section className="timeline-panel" aria-labelledby="timeline-title">
        <div className="section-heading">
          <p className="eyebrow">Next milestones</p>
          <span>Started {turn.startsAt}</span>
        </div>
        <h2 id="timeline-title">This turn is moving toward the draw.</h2>
        <ol className="timeline-list">
          <li>
            <span>Voting closes</span>
            <strong>{turn.votingClosesAt}</strong>
          </li>
          <li>
            <span>Guesses close</span>
            <strong>{turn.guessesCloseAt}</strong>
          </li>
          <li>
            <span>Draw begins</span>
            <strong>{turn.drawBeginsAt}</strong>
          </li>
        </ol>
      </section>

      <section className="status-panel" aria-labelledby="status-title">
        <div className="section-heading">
          <p className="eyebrow">Your status</p>
          <span>Entry fee {MVP_FEES_SOL.guessSubmission.toFixed(2)} SOL</span>
        </div>
        <h2 id="status-title">Guess not submitted.</h2>
        <p>Submit one guess to mint the current-turn Game Token for voting and rule actions.</p>
      </section>

      <section className="activity-panel" aria-labelledby="activity-title">
        <div className="section-heading">
          <p className="eyebrow">Activity</p>
          <span>Live feed</span>
        </div>
        <h2 id="activity-title">Recent turn events</h2>
        <ul className="activity-list">
          {activityFeed.map((event) => (
            <li key={event.id}>
              <div>
                <strong>{event.label}</strong>
                <span>{event.detail}</span>
              </div>
              <time>{event.time}</time>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

export function MobileLiveRoundHub() {
  const [mode, setMode] = useState<HubMode>("live");
  const countdown = useCountdown(turn.endsInSeconds);
  const mainContent = useMemo(() => {
    if (mode === "loading") {
      return <LoadingState />;
    }

    if (mode === "empty") {
      return <EmptyState />;
    }

    if (mode === "delayed") {
      return <DelayedState />;
    }

    return <LiveState countdown={countdown} />;
  }, [countdown, mode]);

  return (
    <main className="play-shell">
      <StickyHeader countdown={countdown} />

      <div className="mode-control" aria-label="Prototype state">
        <ModeButton activeMode={mode} mode="live" setMode={setMode}>
          Live
        </ModeButton>
        <ModeButton activeMode={mode} mode="loading" setMode={setMode}>
          Loading
        </ModeButton>
        <ModeButton activeMode={mode} mode="empty" setMode={setMode}>
          Empty
        </ModeButton>
        <ModeButton activeMode={mode} mode="delayed" setMode={setMode}>
          Delayed
        </ModeButton>
      </div>

      <div className="play-content">{mainContent}</div>

      <nav className="bottom-nav" aria-label="Round actions">
        <div className="secondary-actions">
          {secondaryActions.map((action) => (
            <Link className="secondary-action" href={action.href} key={action.label}>
              {action.label}
            </Link>
          ))}
        </div>
        <Link className="primary-action" href="/play/pick">
          Pick numbers
        </Link>
      </nav>
    </main>
  );
}
