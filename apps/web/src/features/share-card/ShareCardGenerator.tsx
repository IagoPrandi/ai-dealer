"use client";

import Link from "next/link";
import { useState } from "react";

type ShareStory = "active-rule" | "near-miss" | "creator-elected";
type ShareIntent = "Native share" | "Copied link" | "Fallback copy";

interface ShareCardContent {
  eyebrow: string;
  outcome: string;
  detail: string;
  accent: string;
}

const ROUND_NUMBER = 8;
const RULE_TITLE = "Five-number lifeline";
const PRIZE_POOL = "12.48 SOL";

const SHARE_STORIES: Readonly<Record<ShareStory, ShareCardContent>> = {
  "active-rule": {
    eyebrow: "Rule of the Hour",
    outcome: "A new way to win is active.",
    detail: "Match at least five drawn numbers, regardless of order.",
    accent: "rule"
  },
  "near-miss": {
    eyebrow: "Near miss",
    outcome: "One number away from winning.",
    detail: "Four numbers matched. One more would have triggered the active rule.",
    accent: "near-miss"
  },
  "creator-elected": {
    eyebrow: "Creator elected",
    outcome: "My rule became the Rule of the Hour.",
    detail: "Five-number lifeline was elected and created an alternative-rule winner.",
    accent: "creator"
  }
};

const STORY_LABELS: Readonly<Record<ShareStory, string>> = {
  "active-rule": "Active rule",
  "near-miss": "Near miss",
  "creator-elected": "Creator elected"
};

function getStory(content: ShareCardContent) {
  return `${content.outcome} ${RULE_TITLE}, turn ${ROUND_NUMBER}, prize pool ${PRIZE_POOL}.`;
}

export function ShareCardGenerator() {
  const [story, setStory] = useState<ShareStory>("active-rule");
  const [shareIntentCount, setShareIntentCount] = useState(0);
  const [lastIntent, setLastIntent] = useState<ShareIntent | "None">("None");
  const [feedback, setFeedback] = useState("Choose a story, then share or copy its result link.");
  const content = SHARE_STORIES[story];

  function getShareUrl() {
    return new URL(`/play/results?story=${story}`, window.location.origin).toString();
  }

  function recordIntent(intent: ShareIntent) {
    setShareIntentCount((current) => current + 1);
    setLastIntent(intent);
  }

  async function copyLink(intent: ShareIntent = "Copied link") {
    recordIntent(intent);

    if (!navigator.clipboard) {
      setFeedback("Clipboard access is unavailable. Open the completed round and copy its URL.");
      return;
    }

    try {
      await navigator.clipboard.writeText(getShareUrl());
      setFeedback(intent === "Fallback copy" ? "Sharing is unavailable. Result link copied." : "Result link copied.");
    } catch {
      setFeedback("Copy failed. Clipboard permission is required.");
    }
  }

  async function shareCard() {
    if (!navigator.share) {
      await copyLink("Fallback copy");
      return;
    }

    recordIntent("Native share");

    try {
      await navigator.share({
        title: `Idealer turn ${ROUND_NUMBER}: ${RULE_TITLE}`,
        text: getStory(content),
        url: getShareUrl()
      });
      setFeedback("Share sheet opened for this story.");
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        setFeedback("Share canceled.");
        return;
      }

      setFeedback("Share failed. Use Copy link to share this result.");
    }
  }

  return (
    <main className="share-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play/results">
          Result
        </Link>
        <div>
          <p className="eyebrow">Turn {ROUND_NUMBER}</p>
          <strong>Share card generator</strong>
        </div>
      </header>

      <div className="share-content">
        <section className="share-builder" aria-labelledby="share-builder-title">
          <div className="section-heading">
            <p className="eyebrow">Story selector</p>
            <span>Mobile social card</span>
          </div>
          <h1 id="share-builder-title">Share what made this round interesting.</h1>
          <div className="share-story-control" aria-label="Share card story">
            {(Object.keys(SHARE_STORIES) as ShareStory[]).map((shareStory) => (
              <button
                aria-pressed={story === shareStory}
                className="mode-button"
                key={shareStory}
                onClick={() => setStory(shareStory)}
                type="button"
              >
                {STORY_LABELS[shareStory]}
              </button>
            ))}
          </div>
        </section>

        <article className={`social-share-card ${content.accent}`} aria-label={`${STORY_LABELS[story]} share card`}>
          <header>
            <strong>IDEALER</strong>
            <span>TURN {ROUND_NUMBER}</span>
          </header>
          <div className="share-card-story">
            <p>{content.eyebrow}</p>
            <h2>{content.outcome}</h2>
            <span>{content.detail}</span>
          </div>
          <div className="share-card-rule">
            <span>RULE OF THE HOUR</span>
            <strong>{RULE_TITLE}</strong>
          </div>
          <footer>
            <div>
              <span>PRIZE POOL</span>
              <strong>{PRIZE_POOL}</strong>
            </div>
            <p>Pick numbers. Vote for the rule. Watch the game change.</p>
          </footer>
        </article>

        <section className="share-actions-panel" aria-labelledby="share-actions-title">
          <div className="section-heading">
            <p className="eyebrow">Share actions</p>
            <span>Completed round link</span>
          </div>
          <h2 id="share-actions-title">Send this story without technical friction.</h2>
          <div className="share-actions">
            <button className="primary-action" onClick={shareCard} type="button">
              Share card
            </button>
            <button className="secondary-action" onClick={() => copyLink()} type="button">
              Copy link
            </button>
          </div>
          <p aria-live="polite" className="share-feedback">
            {feedback}
          </p>
        </section>

        <section className="share-analytics" aria-labelledby="share-analytics-title">
          <div className="section-heading">
            <p className="eyebrow">Prototype analytics</p>
            <span>Session only</span>
          </div>
          <h2 id="share-analytics-title">Share intent tracking</h2>
          <dl>
            <div>
              <dt>Share intents</dt>
              <dd>{shareIntentCount}</dd>
            </div>
            <div>
              <dt>Last intent</dt>
              <dd>{lastIntent}</dd>
            </div>
            <div>
              <dt>Selected story</dt>
              <dd>{STORY_LABELS[story]}</dd>
            </div>
          </dl>
        </section>
      </div>
    </main>
  );
}
