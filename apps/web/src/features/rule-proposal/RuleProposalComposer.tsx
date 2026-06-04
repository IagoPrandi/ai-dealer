"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MVP_FEES_SOL, RULE_MAX_TOKENS } from "@idealer/constants";

const RULE_WARNING_THRESHOLD = 64;
const RULE_MAX_CHARACTERS = 1_200;
const INSPIRATION_EXAMPLES = [
  "The guess with the closest even total wins.",
  "The guess containing the most drawn numbers wins.",
  "The guess with the smallest distance between its highest and lowest numbers wins."
] as const;

type ComposerStep = "compose" | "review" | "success";

function countApproximateTokens(value: string) {
  return value.match(/\p{L}+|\p{N}+|[^\s\p{L}\p{N}]/gu)?.length ?? 0;
}

function removeControlCharacters(value: string) {
  return Array.from(value)
    .map((character) => {
      const codePoint = character.codePointAt(0);

      return codePoint !== undefined && (codePoint < 32 || codePoint === 127)
        ? " "
        : character;
    })
    .join("");
}

function sanitizePreview(value: string) {
  return removeControlCharacters(value).replace(/\s+/g, " ").trim();
}

function getAmbiguityMessage(value: string, tokenCount: number) {
  if (tokenCount < 8) {
    return "Mock ambiguity check: add more detail about how guesses are compared.";
  }

  if (/\b(any|anything|something|whatever|somehow)\b/i.test(value)) {
    return "Mock ambiguity check: replace vague words with measurable conditions.";
  }

  return "Mock ambiguity check: no obvious ambiguity detected.";
}

export function RuleProposalComposer() {
  const [ruleText, setRuleText] = useState("");
  const [step, setStep] = useState<ComposerStep>("compose");
  const tokenCount = useMemo(() => countApproximateTokens(ruleText), [ruleText]);
  const sanitizedPreview = useMemo(() => sanitizePreview(ruleText), [ruleText]);
  const ambiguityMessage = useMemo(
    () => getAmbiguityMessage(sanitizedPreview, tokenCount),
    [sanitizedPreview, tokenCount]
  );
  const isEmpty = sanitizedPreview.length === 0;
  const isOverLimit = tokenCount > RULE_MAX_TOKENS;
  const isNearLimit = tokenCount >= RULE_WARNING_THRESHOLD && !isOverLimit;
  const canReview = !isEmpty && !isOverLimit;

  function resetComposer() {
    setRuleText("");
    setStep("compose");
  }

  if (step === "success") {
    return (
      <main className="composer-shell success-shell">
        <section className="composer-panel success-panel" aria-labelledby="proposal-success-title">
          <p className="eyebrow">Proposal submitted</p>
          <h1 id="proposal-success-title">Your simulated rule is queued.</h1>
          <p>
            The production flow will submit the proposal after preflight and wallet approval.
          </p>
          <div className="sanitized-preview">
            <span>Submitted rule</span>
            <p>{sanitizedPreview}</p>
          </div>
          <div className="picker-actions">
            <Link className="secondary-link-action" href="/play">
              Back to live round
            </Link>
            <button className="primary-action" onClick={resetComposer} type="button">
              Propose another
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="composer-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play">
          Live round
        </Link>
        <div>
          <p className="eyebrow">Turn TURN-0008</p>
          <strong>Propose a rule</strong>
        </div>
      </header>

      <section className="composer-panel" aria-labelledby="rule-composer-title">
        <div className="composer-title-row">
          <div>
            <p className="eyebrow">Free-form rule</p>
            <h1 id="rule-composer-title">Describe a new way to win.</h1>
          </div>
          <span
            className={isOverLimit ? "token-count over" : isNearLimit ? "token-count warning" : "token-count"}
          >
            {tokenCount}/{RULE_MAX_TOKENS}
          </span>
        </div>

        {step === "review" ? (
          <section className="review-panel" aria-labelledby="proposal-review-title">
            <p className="eyebrow">Review proposal</p>
            <h2 id="proposal-review-title">Confirm this rule before simulated submission.</h2>
            <div className="sanitized-preview">
              <span>Sanitized preview</span>
              <p>{sanitizedPreview}</p>
            </div>
            <div className="mock-check">
              <span>Prototype AI preview</span>
              <p>
                Mock interpretation: compare every eligible guess using the measurable condition
                expressed in this rule.
              </p>
            </div>
            <div className="mock-check">
              <span>Ambiguity check</span>
              <p>{ambiguityMessage}</p>
            </div>
            <dl className="review-costs">
              <div>
                <dt>Proposal fee</dt>
                <dd>{MVP_FEES_SOL.ruleProposal.toFixed(2)} SOL</dd>
              </div>
              <div>
                <dt>Token count</dt>
                <dd>{tokenCount}/{RULE_MAX_TOKENS}</dd>
              </div>
            </dl>
            <div className="picker-actions">
              <button className="secondary-action" onClick={() => setStep("compose")} type="button">
                Edit rule
              </button>
              <button className="primary-action" onClick={() => setStep("success")} type="button">
                Submit simulation
              </button>
            </div>
          </section>
        ) : (
          <>
            <div className="composer-field">
              <label htmlFor="rule-text">Rule text</label>
              <textarea
                aria-describedby="rule-token-guidance"
                id="rule-text"
                maxLength={RULE_MAX_CHARACTERS}
                onChange={(event) => setRuleText(event.target.value)}
                placeholder="Example: The guess with the closest even total wins."
                rows={6}
                value={ruleText}
              />
              <p
                className={
                  isOverLimit
                    ? "token-guidance error"
                    : isNearLimit
                      ? "token-guidance warning"
                      : "token-guidance"
                }
                id="rule-token-guidance"
              >
                {isOverLimit
                  ? `Rule is ${tokenCount - RULE_MAX_TOKENS} approximate token${
                      tokenCount - RULE_MAX_TOKENS === 1 ? "" : "s"
                    } over the limit. Shorten it before review.`
                  : isNearLimit
                    ? "Approaching the token limit. Keep the condition concise and measurable."
                    : "Write freely. The counter is approximate and the production preflight is authoritative."}
              </p>
            </div>

            <div className="sanitized-preview">
              <span>Sanitized preview</span>
              <p>{sanitizedPreview || "Your normalized rule preview will appear here."}</p>
            </div>

            <div className="mock-check">
              <span>Prototype AI preview</span>
              <p>
                {isEmpty
                  ? "Write a rule to generate a mock interpretation."
                  : "Mock interpretation ready. Production AI compilation is not running in this prototype."}
              </p>
            </div>

            <div className="mock-check">
              <span>Ambiguity check</span>
              <p>{isEmpty ? "Write a rule to run the mock ambiguity check." : ambiguityMessage}</p>
            </div>

            <section className="inspiration-panel" aria-labelledby="inspiration-title">
              <p className="eyebrow">Inspiration only</p>
              <h2 id="inspiration-title">Examples are not templates.</h2>
              <ul>
                {INSPIRATION_EXAMPLES.map((example) => (
                  <li key={example}>{example}</li>
                ))}
              </ul>
            </section>
          </>
        )}
      </section>

      {step === "compose" ? (
        <nav className="composer-bottom-bar" aria-label="Rule proposal actions">
          <button className="secondary-action" onClick={() => setRuleText("")} type="button">
            Clear
          </button>
          <button
            className="primary-action"
            disabled={!canReview}
            onClick={() => setStep("review")}
            type="button"
          >
            Review proposal
          </button>
        </nav>
      ) : null}
    </main>
  );
}
