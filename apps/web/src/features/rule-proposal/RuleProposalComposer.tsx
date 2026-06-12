"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  CheckCircle2,
  LoaderCircle,
  Send,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";
import { MVP_FEES_SOL, RULE_MAX_TOKENS } from "@idealer/constants";
import { address } from "@solana/kit";
import {
  useSolanaClient,
  useWaitForSignature,
  useWalletConnection,
} from "@solana/react-hooks";
import {
  createProposeRuleInstruction,
  deriveRuleProposalAddress,
  deriveSubmitGuessAccounts,
  IDEALER_ACTIVE_TURN_ID,
  type RulePreflightResult,
  type RuleProposalReceipt,
} from "../../solana/idealerProgram";

const RULE_WARNING_THRESHOLD = 64;
const RULE_MAX_CHARACTERS = 320;
const API_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_API_URL ?? "http://localhost:3002";
const INSPIRATION_EXAMPLES = [
  "The guess with the closest even total wins.",
  "The guess containing the most drawn numbers wins.",
  "The guess with the smallest distance between its highest and lowest numbers wins.",
] as const;

type ComposerStep = "compose" | "review" | "success";
type ProposalStatus =
  | "idle"
  | "preflighting"
  | "awaiting_approval"
  | "pending"
  | "confirmed"
  | "failed";

interface ProposalFeedback {
  code?: string;
  message: string;
  receipt?: RuleProposalReceipt;
  signature?: string;
  status: ProposalStatus;
}

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

function truncateAddress(value: string) {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function ProposalPhoneChrome() {
  return (
    <>
      <div className="platform-dynamic-island" aria-hidden="true" />
      <div className="platform-statusbar" aria-hidden="true">
        <span>9:41</span>
        <span className="platform-status-icons">
          <i className="platform-cell-signal">
            <b />
            <b />
            <b />
            <b />
          </i>
          <i className="platform-wifi">⌁</i>
          <i className="platform-battery" />
        </span>
      </div>
      <div className="platform-home-indicator" aria-hidden="true" />
    </>
  );
}

function ProposalDealer({ size = 42 }: { size?: number }) {
  return (
    <span
      className="platform-dealer"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <span className="platform-dealer-hat" />
      <i />
      <i />
      <b />
    </span>
  );
}

function getAmbiguityMessage(value: string, tokenCount: number) {
  if (tokenCount < 8) {
    return "Add more detail about how guesses are compared.";
  }

  if (/\b(any|anything|something|whatever|somehow)\b/i.test(value)) {
    return "Replace vague words with measurable conditions.";
  }

  return "No obvious ambiguity detected.";
}

function normalizeProposalError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("reject") ||
    normalizedMessage.includes("declin") ||
    normalizedMessage.includes("cancel")
  ) {
    return {
      code: "TRANSACTION_REJECTED",
      message: "The wallet request was rejected. Your rule was not submitted.",
    };
  }

  if (
    normalizedMessage.includes("action window") ||
    normalizedMessage.includes("turn is not open") ||
    normalizedMessage.includes("no active turn")
  ) {
    return {
      code: "TURN_NOT_ACCEPTING_RULES",
      message:
        "This turn is no longer accepting rule proposals. Return to the live round.",
    };
  }

  return {
    code: "RULE_PROPOSAL_FAILED",
    message,
  };
}

async function requestRulePreflight(text: string) {
  const response = await fetch(`${API_BASE_URL}/rule-preflight`, {
    body: JSON.stringify({ text }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  const body = (await response.json()) as {
    error?: string;
    message?: string;
    preflight?: RulePreflightResult;
  };

  if (!response.ok || !body.preflight) {
    throw new Error(body.message ?? body.error ?? "Rule preflight failed.");
  }

  return body.preflight;
}

async function persistRuleProposal(receipt: RuleProposalReceipt) {
  const response = await fetch(`${API_BASE_URL}/rule-proposals`, {
    body: JSON.stringify(receipt),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`Rule proposal API returned HTTP ${response.status}.`);
  }
}

export function RuleProposalComposer() {
  const client = useSolanaClient();
  const { connected, wallet } = useWalletConnection();
  const [ruleText, setRuleText] = useState("");
  const [step, setStep] = useState<ComposerStep>("compose");
  const [preflight, setPreflight] = useState<RulePreflightResult | null>(null);
  const [feedback, setFeedback] = useState<ProposalFeedback>({
    message: "",
    status: "idle",
  });
  const tokenCount = useMemo(
    () => countApproximateTokens(ruleText),
    [ruleText],
  );
  const sanitizedPreview = useMemo(() => sanitizePreview(ruleText), [ruleText]);
  const ambiguityMessage = useMemo(
    () => getAmbiguityMessage(sanitizedPreview, tokenCount),
    [sanitizedPreview, tokenCount],
  );
  const walletAddress = wallet?.account.address.toString();
  const isEmpty = sanitizedPreview.length === 0;
  const isOverLimit = tokenCount > RULE_MAX_TOKENS;
  const isNearLimit = tokenCount >= RULE_WARNING_THRESHOLD && !isOverLimit;
  const isSubmitting =
    feedback.status === "preflighting" ||
    feedback.status === "awaiting_approval" ||
    feedback.status === "pending";
  const canReview = !isEmpty && !isOverLimit && !isSubmitting;
  const signatureStatus = useWaitForSignature(feedback.signature, {
    commitment: "confirmed",
    disabled: !feedback.signature,
    subscribe: true,
  });

  useEffect(() => {
    if (!feedback.signature || !feedback.receipt) {
      return;
    }

    const receipt = feedback.receipt;
    const signature = feedback.signature;

    if (signatureStatus.isSuccess) {
      void persistRuleProposal(receipt)
        .then(() => {
          setFeedback({
            message: "Your rule proposal was confirmed on Solana devnet.",
            receipt,
            signature,
            status: "confirmed",
          });
          setStep("success");
        })
        .catch((error: unknown) => {
          setFeedback({
            code: "RULE_PROPOSAL_API_FAILED",
            message: error instanceof Error ? error.message : String(error),
            receipt,
            signature,
            status: "failed",
          });
        });
    } else if (signatureStatus.isError) {
      const normalized = normalizeProposalError(signatureStatus.waitError);
      setFeedback({
        code: normalized.code,
        message: normalized.message,
        receipt,
        signature,
        status: "failed",
      });
    }
  }, [
    feedback.receipt,
    feedback.signature,
    signatureStatus.isError,
    signatureStatus.isSuccess,
    signatureStatus.waitError,
  ]);

  function resetComposer() {
    setRuleText("");
    setStep("compose");
    setPreflight(null);
    setFeedback({ message: "", status: "idle" });
  }

  function updateRuleText(value: string) {
    setRuleText(value);
    setPreflight(null);
    setFeedback({ message: "", status: "idle" });
  }

  async function reviewProposal() {
    if (!canReview) {
      return;
    }

    setFeedback({
      message: "Running server-side token and safety preflight.",
      status: "preflighting",
    });

    try {
      const result = await requestRulePreflight(ruleText);
      setPreflight(result);
      setFeedback({ message: "", status: "idle" });
      setStep("review");
    } catch (error) {
      setFeedback({
        code: "RULE_PREFLIGHT_FAILED",
        message: error instanceof Error ? error.message : String(error),
        status: "failed",
      });
    }
  }

  async function submitProposal() {
    if (!preflight) {
      await reviewProposal();
      return;
    }

    if (!connected || !wallet || !walletAddress) {
      setFeedback({
        code: "WALLET_NOT_CONNECTED",
        message: "Connect a Solana devnet wallet before submitting your rule.",
        status: "failed",
      });
      return;
    }

    let receipt: RuleProposalReceipt | undefined;

    try {
      const player = address(walletAddress);
      const accounts = await deriveSubmitGuessAccounts({
        player,
        turnId: IDEALER_ACTIVE_TURN_ID,
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
          message: "Submit a guess for this turn before proposing a rule.",
          status: "failed",
        });
        return;
      }

      const ruleProposal = await deriveRuleProposalAddress({
        ruleId: preflight.ruleId,
        turnId: IDEALER_ACTIVE_TURN_ID,
      });
      const existingRule = await client.runtime.rpc
        .getAccountInfo(ruleProposal, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();

      if (existingRule.value) {
        setFeedback({
          code: "RULE_ID_COLLISION",
          message: "This rule id already exists. Edit the rule and try again.",
          status: "failed",
        });
        return;
      }

      receipt = {
        ...preflight,
        proposer: walletAddress,
        ruleProposal: ruleProposal.toString(),
        signature: "",
        submittedAt: new Date().toISOString(),
        turnId: IDEALER_ACTIVE_TURN_ID,
      };
      setFeedback({
        message: "Approve the rule proposal transaction in your wallet.",
        receipt,
        status: "awaiting_approval",
      });

      const instruction = await createProposeRuleInstruction({
        player,
        preflight,
        turnId: IDEALER_ACTIVE_TURN_ID,
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
      const normalized = normalizeProposalError(error);
      setFeedback({
        code: normalized.code,
        message: normalized.message,
        status: "failed",
        ...(receipt ? { receipt } : {}),
      });
    }
  }

  if (step === "success") {
    return (
      <main className="platform-stage">
        <div className="platform-phone-shell">
          <ProposalPhoneChrome />
          <section
            className="platform-screen platform-propose-screen"
            aria-labelledby="proposal-success-title"
          >
            <div className="platform-ambient" />
            <div className="platform-scroll platform-propose-scroll">
              <div className="proposal-success-card">
                <CheckCircle2 aria-hidden="true" size={34} />
                <p className="platform-section-label">Proposal submitted</p>
                <h1 id="proposal-success-title">
                  Your devnet rule is queued.
                </h1>
                <p>{feedback.message}</p>
              </div>
              <div className="sanitized-preview proposal-chat-card">
                <span>Submitted rule</span>
                <p>{preflight?.sanitizedText ?? sanitizedPreview}</p>
              </div>
              {feedback.receipt ? (
                <dl className="review-costs proposal-meta-grid">
                  <div>
                    <dt>RuleProposal PDA</dt>
                    <dd>{truncateAddress(feedback.receipt.ruleProposal)}</dd>
                  </div>
                  <div>
                    <dt>Signature</dt>
                    <dd>
                      <a
                        href={`https://explorer.solana.com/tx/${feedback.receipt.signature}?cluster=devnet`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View receipt
                      </a>
                    </dd>
                  </div>
                </dl>
              ) : null}
            </div>
            <nav
              className="proposal-chat-actions"
              aria-label="Proposal success actions"
            >
              <Link className="platform-ghost-button" href="/play">
                Back to live round
              </Link>
              <button
                className="platform-primary-button proposal-primary-button"
                onClick={resetComposer}
                type="button"
              >
                Propose another
              </button>
            </nav>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="platform-stage">
      <div className="platform-phone-shell">
        <ProposalPhoneChrome />
        <section
          className="platform-screen platform-propose-screen"
          aria-labelledby="rule-composer-title"
        >
          <div className="platform-ambient" />
          <div className="platform-scroll platform-propose-scroll">
            <header className="platform-screen-header proposal-chat-header">
              <Link aria-label="Back to live round" href="/play">
                <ArrowLeft aria-hidden="true" size={20} />
              </Link>
              <div>
                <p className="platform-section-label">
                  Turn TURN-{IDEALER_ACTIVE_TURN_ID.toString().padStart(4, "0")}
                </p>
                <h1 id="rule-composer-title">Dealer chat</h1>
              </div>
              <span
                className={
                  isOverLimit
                    ? "proposal-token-pill over"
                    : isNearLimit
                      ? "proposal-token-pill warning"
                      : "proposal-token-pill"
                }
              >
                {preflight?.tokenCount ?? tokenCount}/{RULE_MAX_TOKENS}
              </span>
            </header>

            <section className="proposal-chat-intro">
              <ProposalDealer />
              <div>
                <p className="platform-section-label">Free-form rule</p>
                <h2>Describe a new way to win.</h2>
                <p>
                  Write one measurable winning condition. The server preflight
                  locks tokens and hashes before wallet approval.
                </p>
              </div>
            </section>

            {step === "review" ? (
              <section
                className="proposal-chat-thread"
                aria-labelledby="proposal-review-title"
              >
                <article className="proposal-bubble-ai">
                  <Sparkles aria-hidden="true" size={16} />
                  <div>
                    <p className="platform-section-label">Review proposal</p>
                    <h2 id="proposal-review-title">
                      Confirm this rule before devnet submission.
                    </h2>
                  </div>
                </article>
                <div className="sanitized-preview proposal-bubble-user">
                  <span>Sanitized rule text</span>
                  <p>{preflight?.sanitizedText ?? sanitizedPreview}</p>
                </div>
                <div className="mock-check proposal-chat-card">
                  <span>Official interpretation preview</span>
                  <p>
                    Compare every eligible guess using this measurable rule:{" "}
                    {preflight?.sanitizedText ?? sanitizedPreview}
                  </p>
                </div>
                <div className="mock-check proposal-chat-card">
                  <span>Preflight commitment</span>
                  <p>
                    Server token count and hashes are locked before wallet
                    approval.
                  </p>
                </div>
                <dl className="review-costs proposal-meta-grid">
                  <div>
                    <dt>Proposal fee</dt>
                    <dd>{MVP_FEES_SOL.ruleProposal.toFixed(2)} SOL</dd>
                  </div>
                  <div>
                    <dt>Token count</dt>
                    <dd>
                      {preflight?.tokenCount ?? tokenCount}/{RULE_MAX_TOKENS}
                    </dd>
                  </div>
                  <div>
                    <dt>Wallet</dt>
                    <dd>
                      {walletAddress
                        ? truncateAddress(walletAddress)
                        : "Not connected"}
                    </dd>
                  </div>
                </dl>
                {feedback.status !== "idle" ? (
                  <article
                    aria-live="polite"
                    className={`guess-status-card proposal-status-card ${feedback.status}`}
                    role={feedback.status === "failed" ? "alert" : undefined}
                  >
                    <strong>
                      {feedback.status === "preflighting"
                        ? "Running preflight"
                        : null}
                      {feedback.status === "awaiting_approval"
                        ? "Awaiting wallet approval"
                        : null}
                      {feedback.status === "pending"
                        ? "Transaction pending"
                        : null}
                      {feedback.status === "confirmed"
                        ? "Proposal confirmed"
                        : null}
                      {feedback.status === "failed" ? "Proposal failed" : null}
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
                ) : null}
              </section>
            ) : (
              <section className="proposal-chat-thread">
                <article className="proposal-bubble-ai">
                  <ShieldCheck aria-hidden="true" size={16} />
                  <div>
                    <strong>Keep it clear and testable.</strong>
                    <p>
                      Avoid vague words. The rule can be creative, but it must
                      compare guesses against the draw.
                    </p>
                  </div>
                </article>

                {sanitizedPreview ? (
                  <div className="sanitized-preview proposal-bubble-user">
                    <span>Your rule draft</span>
                    <p>{sanitizedPreview}</p>
                  </div>
                ) : (
                  <div className="sanitized-preview proposal-chat-card">
                    <span>Sanitized preview</span>
                    <p>Your normalized rule preview will appear here.</p>
                  </div>
                )}

                {feedback.status === "failed" ? (
                  <article
                    className="guess-status-card proposal-status-card failed"
                    role="alert"
                  >
                    <strong>Preflight failed</strong>
                    <p>{feedback.message}</p>
                    {feedback.code ? <code>{feedback.code}</code> : null}
                  </article>
                ) : null}

                <div className="mock-check proposal-chat-card">
                  <span>Preflight preview</span>
                  <p>
                    {isEmpty
                      ? "Write a rule to run server-side preflight."
                      : "Ready for server-side token, safety, and hash preflight."}
                  </p>
                </div>

                <div className="mock-check proposal-chat-card">
                  <span>Ambiguity check</span>
                  <p>
                    {isEmpty
                      ? "Write a rule to run the ambiguity check."
                      : ambiguityMessage}
                  </p>
                </div>

                <section
                  className="inspiration-panel proposal-chat-card"
                  aria-labelledby="inspiration-title"
                >
                  <p className="platform-section-label">Inspiration only</p>
                  <h2 id="inspiration-title">Examples are not templates.</h2>
                  <ul>
                    {INSPIRATION_EXAMPLES.map((example) => (
                      <li key={example}>{example}</li>
                    ))}
                  </ul>
                </section>
              </section>
            )}
          </div>

          {step === "compose" ? (
            <nav
              className="proposal-chat-composer"
              aria-label="Rule proposal actions"
            >
              <div className="composer-field proposal-input-field">
                <label htmlFor="rule-text">Rule text</label>
                <textarea
                  aria-describedby="rule-token-guidance"
                  id="rule-text"
                  maxLength={RULE_MAX_CHARACTERS}
                  onChange={(event) => updateRuleText(event.target.value)}
                  placeholder="Example: The guess with the closest even total wins."
                  rows={2}
                  value={ruleText}
                />
              </div>
              <button
                aria-label="Review proposal"
                className="proposal-send-button"
                disabled={!canReview}
                onClick={reviewProposal}
                type="button"
              >
                {feedback.status === "preflighting" ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="wallet-spinner"
                    size={19}
                  />
                ) : (
                  <Send aria-hidden="true" size={19} />
                )}
                <span>Review proposal</span>
              </button>
              <button
                className="proposal-clear-button"
                onClick={() => updateRuleText("")}
                type="button"
              >
                Clear
              </button>
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
                    : "Write freely. Server preflight is authoritative."}
              </p>
            </nav>
          ) : (
            <nav
              className="proposal-chat-actions"
              aria-label="Rule proposal review actions"
            >
              <button
                className="platform-ghost-button"
                onClick={() => setStep("compose")}
                type="button"
              >
                Edit rule
              </button>
              {connected ? (
                <button
                  className="platform-primary-button proposal-primary-button"
                  disabled={isSubmitting}
                  onClick={submitProposal}
                  type="button"
                >
                  {isSubmitting ? "Submitting..." : "Submit to devnet"}
                </button>
              ) : (
                <Link
                  className="platform-primary-button proposal-primary-button"
                  href="/play/wallet"
                >
                  <Wallet aria-hidden="true" size={17} />
                  Connect wallet
                </Link>
              )}
            </nav>
          )}
        </section>
      </div>
    </main>
  );
}
