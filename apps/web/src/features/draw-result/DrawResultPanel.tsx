"use client";

import { CREATOR_REWARD_RATE_BPS } from "@idealer/constants";
import Link from "next/link";
import { useState } from "react";

type ResultMode = "near-miss" | "winner" | "creator";
type ClaimStatus = "available" | "claimed" | "failed" | "pending";

interface OutcomeCopy {
  eyebrow: string;
  title: string;
  summary: string;
  originalResult: string;
  alternativeResult: string;
  nearMiss: string;
}

const DRAWN_NUMBERS = [7, 19, 32, 44, 58, 91] as const;
const NEAR_MISS_GUESS = [7, 19, 32, 44, 57, 83] as const;
const WINNING_GUESS = [7, 19, 32, 44, 58, 83] as const;
const ACTIVE_RULE =
  "Win if at least five of your numbers appear in the draw, regardless of order.";
const WINNER_PAYOUT_SOL = 1.2;
const CREATOR_REWARD_SOL = WINNER_PAYOUT_SOL * (CREATOR_REWARD_RATE_BPS / 10_000);

const OUTCOME_COPY: Readonly<Record<ResultMode, OutcomeCopy>> = {
  "near-miss": {
    eyebrow: "Near miss",
    title: "One number away from an alternative-rule win.",
    summary:
      "Your guess matched four drawn numbers. The original rule requires all six in order, while the active alternative rule requires five matches.",
    originalResult: "Lost: four of six numbers matched, but the order-exact rule requires all six.",
    alternativeResult: "Lost: four numbers matched, one short of the active rule threshold.",
    nearMiss: "One more match would have triggered the active rule. Numbers 57 and 83 missed."
  },
  winner: {
    eyebrow: "Alternative-rule winner",
    title: "Your guess won under the Rule of the Hour.",
    summary:
      "Your guess did not satisfy the original ordered rule, but it met the active alternative-rule threshold.",
    originalResult: "Lost: the exact ordered sequence did not match all six drawn numbers.",
    alternativeResult: "Won: five of your numbers appeared in the draw, regardless of order.",
    nearMiss: "The active rule changed this outcome from a loss into a win."
  },
  creator: {
    eyebrow: "Creator outcome",
    title: "Your elected rule created a winner.",
    summary:
      "The active rule produced a simulated alternative-rule winner and earned a creator reward from the creator reward reserve.",
    originalResult: "Player lost: the exact ordered sequence did not match all six drawn numbers.",
    alternativeResult: "Player won: five numbers appeared in the draw, regardless of order.",
    nearMiss: "Your rule made the difference for this round's alternative-rule winner."
  }
};

function NumberRow({
  label,
  numbers,
  missedNumbers = []
}: {
  label: string;
  numbers: readonly number[];
  missedNumbers?: readonly number[];
}) {
  return (
    <div className="result-number-row">
      <span>{label}</span>
      <ol aria-label={label}>
        {numbers.map((number) => (
          <li className={missedNumbers.includes(number) ? "missed" : undefined} key={number}>
            {number.toString().padStart(2, "0")}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function DrawResultPanel() {
  const [mode, setMode] = useState<ResultMode>("near-miss");
  const [claimStatus, setClaimStatus] = useState<ClaimStatus>("available");
  const outcome = OUTCOME_COPY[mode];
  const submittedGuess = mode === "near-miss" ? NEAR_MISS_GUESS : WINNING_GUESS;
  const missedNumbers = mode === "near-miss" ? [57, 83] : [83];
  const creatorRewardPercent = CREATOR_REWARD_RATE_BPS / 100;
  const claimTitle =
    claimStatus === "available"
      ? "Claimable balance"
      : claimStatus === "pending"
        ? "Wallet approval pending"
        : claimStatus === "claimed"
          ? "Claim successful"
          : "Claim failed";
  const claimDetail =
    claimStatus === "available"
      ? "1.20 SOL payout is ready for wallet approval."
      : claimStatus === "pending"
        ? "Approve the claim in your wallet to receive the payout."
        : claimStatus === "claimed"
          ? "The payout claim was approved and recorded."
          : "The wallet rejected the approval. You can try again.";

  return (
    <main className="result-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play">
          Live round
        </Link>
        <div>
          <p className="eyebrow">Turn 8 complete</p>
          <strong>Simulated result</strong>
        </div>
      </header>

      <div className="result-mode-control" aria-label="Prototype result state">
        {(["near-miss", "winner", "creator"] as const).map((resultMode) => (
          <button
            aria-pressed={mode === resultMode}
            className="mode-button"
            key={resultMode}
            onClick={() => setMode(resultMode)}
            type="button"
          >
            {resultMode === "near-miss" ? "Near miss" : resultMode === "winner" ? "Winner" : "Creator"}
          </button>
        ))}
      </div>

      <div className="result-content">
        <section className={`result-hero ${mode}`} aria-labelledby="result-title">
          <p className="eyebrow">{outcome.eyebrow}</p>
          <h1 id="result-title">{outcome.title}</h1>
          <p>{outcome.summary}</p>
          <div className="result-pool-row">
            <div>
              <span>Round prize</span>
              <strong>12.48 SOL</strong>
            </div>
            <div>
              <span>Next turn</span>
              <strong>8h cycle step</strong>
            </div>
          </div>
        </section>

        <section className="result-numbers" aria-labelledby="numbers-title">
          <div className="section-heading">
            <p className="eyebrow">Draw evidence</p>
            <span>Switchboard VRF simulated</span>
          </div>
          <h2 id="numbers-title">Numbers compared</h2>
          <NumberRow label="Drawn numbers" numbers={DRAWN_NUMBERS} />
          <NumberRow label="Your guess" missedNumbers={missedNumbers} numbers={submittedGuess} />
        </section>

        <section className="result-rule" aria-labelledby="active-rule-title">
          <div className="section-heading">
            <p className="eyebrow">Rule of the Hour</p>
            <span>Active and frozen</span>
          </div>
          <h2 id="active-rule-title">Five-number lifeline</h2>
          <p>{ACTIVE_RULE}</p>
          <div className="result-creator-line">
            <span>Created by 4sF...9k2</span>
            <strong>Creator attributed</strong>
          </div>
        </section>

        <section className="result-explanations" aria-labelledby="explanation-title">
          <div className="section-heading">
            <p className="eyebrow">Why this happened</p>
            <span>Deterministic explanation</span>
          </div>
          <h2 id="explanation-title">Rule evaluation</h2>
          <article>
            <span>Original rule</span>
            <strong>{outcome.originalResult}</strong>
          </article>
          <article>
            <span>Alternative rule</span>
            <strong>{outcome.alternativeResult}</strong>
          </article>
          <article className="near-miss-detail">
            <span>{mode === "creator" ? "Creator impact" : "Near-miss detail"}</span>
            <strong>{outcome.nearMiss}</strong>
          </article>
        </section>

        <section className="creator-outcome" aria-labelledby="creator-outcome-title">
          <div className="section-heading">
            <p className="eyebrow">Creator outcome</p>
            <span>Reserve-funded</span>
          </div>
          <h2 id="creator-outcome-title">
            Creator reward: {CREATOR_REWARD_SOL.toFixed(2)} SOL
          </h2>
          <p>
            This equals {creatorRewardPercent}% of the simulated 1.20 SOL individual winner
            payout. It comes from the creator reward reserve; the winner still receives the full
            1.20 SOL.
          </p>
          <dl>
            <div>
              <dt>Winner payout</dt>
              <dd>1.20 SOL</dd>
            </div>
            <div>
              <dt>Creator reward</dt>
              <dd>+{CREATOR_REWARD_SOL.toFixed(2)} SOL</dd>
            </div>
            <div>
              <dt>Deducted from winner</dt>
              <dd>0.00 SOL</dd>
            </div>
          </dl>
        </section>

        <section className="creator-outcome" aria-labelledby="claim-state-title">
          <div className="section-heading">
            <p className="eyebrow">Claim status</p>
            <span>Mobile wallet approval</span>
          </div>
          <h2 id="claim-state-title">{claimTitle}</h2>
          <p>{claimDetail}</p>
          <dl>
            <div>
              <dt>Claimable payout</dt>
              <dd>{claimStatus === "claimed" ? "0.00 SOL" : "1.20 SOL"}</dd>
            </div>
            <div>
              <dt>Approval state</dt>
              <dd>{claimStatus}</dd>
            </div>
          </dl>
          <div className="result-actions">
            {claimStatus === "available" || claimStatus === "failed" ? (
              <button
                className="primary-action"
                onClick={() => setClaimStatus("pending")}
                type="button"
              >
                Claim payout
              </button>
            ) : null}
            {claimStatus === "pending" ? (
              <>
                <button
                  className="primary-action"
                  onClick={() => setClaimStatus("claimed")}
                  type="button"
                >
                  Approve in wallet
                </button>
                <button
                  className="secondary-action"
                  onClick={() => setClaimStatus("failed")}
                  type="button"
                >
                  Reject approval
                </button>
              </>
            ) : null}
          </div>
        </section>

        <section className="result-return" aria-labelledby="return-title">
          <p className="eyebrow">Next round</p>
          <h2 id="return-title">Try the next 8h turn with a new guess.</h2>
          <p>The active rule will change, creating another way for this guess to matter.</p>
          <div className="result-actions">
            <Link className="primary-action" href="/play/pick">
              Join next round
            </Link>
            <Link className="secondary-action" href="/play/share">
              Share result
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}
