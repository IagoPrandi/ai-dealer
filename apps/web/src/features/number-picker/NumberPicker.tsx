"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { MVP_FEES_SOL } from "@idealer/constants";
import { address } from "@solana/kit";
import {
  useSolanaClient,
  useWaitForSignature,
  useWalletConnection,
} from "@solana/react-hooks";
import {
  createSubmitGuessInstruction,
  deriveSubmitGuessAccounts,
  IDEALER_ACTIVE_TURN_ID,
  IDEALER_PROGRAM_ID,
  type GuessReceipt,
  validateGuessNumbers,
} from "../../solana/idealerProgram";

const MAX_SELECTION_COUNT = 6;
const NUMBER_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);
const PENDING_GUESS_KEY = "idealer.guess.pending";
const API_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_API_URL ?? "http://localhost:3002";

type PickerStep = "selecting" | "review" | "success";
type GuessStatus =
  | "idle"
  | "awaiting_approval"
  | "pending"
  | "confirmed"
  | "duplicate"
  | "expired"
  | "failed";

interface GuessFeedback {
  code?: string;
  message: string;
  receipt?: GuessReceipt;
  signature?: string;
  status: GuessStatus;
}

function formatNumber(value: number) {
  return value.toString().padStart(2, "0");
}

function getRandomSelection() {
  const pool = [...NUMBER_OPTIONS];
  const selected: number[] = [];

  while (selected.length < MAX_SELECTION_COUNT) {
    const index = Math.floor(Math.random() * pool.length);
    const [value] = pool.splice(index, 1);
    if (typeof value !== "number") {
      throw new Error("Random selection pool was exhausted unexpectedly.");
    }
    selected.push(value);
  }

  return selected.sort((a, b) => a - b);
}

function truncateAddress(value: string) {
  return `${value.slice(0, 5)}...${value.slice(-5)}`;
}

function normalizeGuessError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("reject") ||
    normalizedMessage.includes("declin") ||
    normalizedMessage.includes("cancel")
  ) {
    return {
      code: "TRANSACTION_REJECTED",
      message: "The wallet request was rejected. Your guess was not submitted.",
      status: "failed" as const,
    };
  }

  if (
    normalizedMessage.includes("already in use") ||
    normalizedMessage.includes("accountalreadyinitialized") ||
    normalizedMessage.includes("custom program error: 0x0")
  ) {
    return {
      code: "DUPLICATE_GUESS",
      message: "This wallet already submitted a guess for the active turn.",
      status: "duplicate" as const,
    };
  }

  if (
    normalizedMessage.includes("action window") ||
    normalizedMessage.includes("turn is not open") ||
    normalizedMessage.includes("no active turn") ||
    normalizedMessage.includes("custom program error: 0x1773") ||
    normalizedMessage.includes("custom program error: 0x1775") ||
    normalizedMessage.includes("custom program error: 0x1778")
  ) {
    return {
      code: "TURN_NOT_ACCEPTING_GUESSES",
      message:
        "This turn is no longer accepting guesses. Return to the live round.",
      status: "expired" as const,
    };
  }

  return {
    code: "GUESS_SUBMISSION_FAILED",
    message,
    status: "failed" as const,
  };
}

function savePendingGuess(feedback: GuessFeedback) {
  window.localStorage.setItem(PENDING_GUESS_KEY, JSON.stringify(feedback));
}

function clearPendingGuess() {
  window.localStorage.removeItem(PENDING_GUESS_KEY);
}

function readPendingGuess(): GuessFeedback | null {
  const stored = window.localStorage.getItem(PENDING_GUESS_KEY);
  if (!stored) {
    return null;
  }

  try {
    const parsed = JSON.parse(stored) as Partial<GuessFeedback>;
    if (!parsed.status || !parsed.message) {
      throw new Error("Invalid pending guess.");
    }
    return parsed as GuessFeedback;
  } catch {
    clearPendingGuess();
    return {
      code: "BAD_PENDING_GUESS",
      message: "A saved guess receipt was invalid and could not be recovered.",
      status: "failed",
    };
  }
}

async function persistGuessReceipt(receipt: GuessReceipt) {
  const response = await fetch(`${API_BASE_URL}/guess-receipts`, {
    body: JSON.stringify(receipt),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok && response.status !== 409) {
    throw new Error(`Receipt API returned HTTP ${response.status}.`);
  }
}

function SelectedNumberTray({
  selectedNumbers,
  onRemove,
}: {
  selectedNumbers: readonly number[];
  onRemove: (value: number) => void;
}) {
  const emptySlots = MAX_SELECTION_COUNT - selectedNumbers.length;

  return (
    <div className="selection-tray" aria-label="Selected numbers">
      {selectedNumbers.map((number) => (
        <button
          aria-label={`Remove ${formatNumber(number)}`}
          className="selected-number"
          key={number}
          onClick={() => onRemove(number)}
          type="button"
        >
          {formatNumber(number)}
        </button>
      ))}
      {Array.from({ length: emptySlots }, (_, index) => (
        <span className="selected-placeholder" key={`empty-${index}`}>
          --
        </span>
      ))}
    </div>
  );
}

export function NumberPicker() {
  const client = useSolanaClient();
  const { connected, wallet } = useWalletConnection();
  const [selectedNumbers, setSelectedNumbers] = useState<number[]>([]);
  const [step, setStep] = useState<PickerStep>("selecting");
  const [feedback, setFeedback] = useState<GuessFeedback>({
    message: "",
    status: "idle",
  });
  const hasCompleteSelection = selectedNumbers.length === MAX_SELECTION_COUNT;
  const isSubmitting =
    feedback.status === "awaiting_approval" || feedback.status === "pending";
  const validationMessage = hasCompleteSelection
    ? "Ready to review your guess."
    : `Choose ${MAX_SELECTION_COUNT - selectedNumbers.length} more number${
        MAX_SELECTION_COUNT - selectedNumbers.length === 1 ? "" : "s"
      }.`;

  const sortedSelection = useMemo(
    () => [...selectedNumbers].sort((a, b) => a - b),
    [selectedNumbers],
  );
  const walletAddress = wallet?.account.address.toString();
  const signatureStatus = useWaitForSignature(feedback.signature, {
    commitment: "confirmed",
    disabled: !feedback.signature,
    subscribe: true,
  });

  useEffect(() => {
    const pendingGuess = readPendingGuess();
    if (!pendingGuess) {
      return;
    }

    setFeedback(pendingGuess);
    if (pendingGuess.receipt?.numbers) {
      setSelectedNumbers([...pendingGuess.receipt.numbers]);
      setStep(pendingGuess.status === "confirmed" ? "success" : "review");
    }
  }, []);

  useEffect(() => {
    if (!feedback.signature || !feedback.receipt) {
      return;
    }

    const receipt = feedback.receipt;
    const signature = feedback.signature;

    if (signatureStatus.isSuccess) {
      void persistGuessReceipt(receipt)
        .then(() => {
          const confirmedFeedback: GuessFeedback = {
            message: "Your guess was confirmed on Solana devnet.",
            receipt,
            signature,
            status: "confirmed",
          };
          setFeedback(confirmedFeedback);
          savePendingGuess(confirmedFeedback);
          setStep("success");
        })
        .catch((error: unknown) => {
          setFeedback({
            code: "RECEIPT_API_FAILED",
            message: error instanceof Error ? error.message : String(error),
            receipt,
            signature,
            status: "failed",
          });
        });
    } else if (signatureStatus.isError) {
      const normalized = normalizeGuessError(signatureStatus.waitError);
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
    signatureStatus.isError,
    signatureStatus.isSuccess,
    signatureStatus.waitError,
  ]);

  function toggleNumber(value: number) {
    setFeedback({ message: "", status: "idle" });
    setStep("selecting");
    setSelectedNumbers((current) => {
      if (current.includes(value)) {
        return current.filter((number) => number !== value);
      }

      if (current.length >= MAX_SELECTION_COUNT) {
        return current;
      }

      return [...current, value].sort((a, b) => a - b);
    });
  }

  function removeNumber(value: number) {
    setFeedback({ message: "", status: "idle" });
    setStep("selecting");
    setSelectedNumbers((current) =>
      current.filter((number) => number !== value),
    );
  }

  function clearSelection() {
    setFeedback({ message: "", status: "idle" });
    setStep("selecting");
    setSelectedNumbers([]);
  }

  function randomizeSelection() {
    setFeedback({ message: "", status: "idle" });
    setStep("selecting");
    setSelectedNumbers(getRandomSelection());
  }

  async function submitGuess() {
    if (!validateGuessNumbers(sortedSelection)) {
      setFeedback({
        code: "INVALID_GUESS",
        message: "Choose exactly six unique numbers from 1 to 100.",
        status: "failed",
      });
      return;
    }

    if (!connected || !wallet || !walletAddress) {
      setFeedback({
        code: "WALLET_NOT_CONNECTED",
        message: "Connect a Solana devnet wallet before submitting your guess.",
        status: "failed",
      });
      return;
    }

    let receipt: GuessReceipt | undefined;

    try {
      const player = address(walletAddress);
      const accounts = await deriveSubmitGuessAccounts({
        player,
        turnId: IDEALER_ACTIVE_TURN_ID,
      });
      const existingGuess = await client.runtime.rpc
        .getAccountInfo(accounts.playerGuess, {
          commitment: "confirmed",
          encoding: "base64",
        })
        .send();

      if (existingGuess.value) {
        const duplicateReceipt: GuessReceipt = {
          gameToken: accounts.gameToken.toString(),
          numbers: sortedSelection,
          player: walletAddress,
          playerGuess: accounts.playerGuess.toString(),
          programId: IDEALER_PROGRAM_ID.toString(),
          signature: feedback.signature ?? "",
          submittedAt: new Date().toISOString(),
          turnId: IDEALER_ACTIVE_TURN_ID,
        };
        setFeedback({
          code: "DUPLICATE_GUESS",
          message: "This wallet already submitted a guess for the active turn.",
          receipt: duplicateReceipt,
          status: "duplicate",
        });
        return;
      }

      receipt = {
        gameToken: accounts.gameToken.toString(),
        numbers: sortedSelection,
        player: walletAddress,
        playerGuess: accounts.playerGuess.toString(),
        programId: IDEALER_PROGRAM_ID.toString(),
        signature: "",
        submittedAt: new Date().toISOString(),
        turnId: IDEALER_ACTIVE_TURN_ID,
      };
      const awaitingFeedback: GuessFeedback = {
        message: "Approve the devnet guess transaction in your wallet.",
        receipt,
        status: "awaiting_approval",
      };

      setFeedback(awaitingFeedback);
      savePendingGuess(awaitingFeedback);

      const instruction = await createSubmitGuessInstruction({
        numbers: sortedSelection,
        player,
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
      const pendingFeedback: GuessFeedback = {
        message: "Wallet approval returned. Waiting for devnet confirmation.",
        receipt: pendingReceipt,
        signature,
        status: "pending",
      };
      setFeedback(pendingFeedback);
      savePendingGuess(pendingFeedback);
    } catch (error) {
      const normalized = normalizeGuessError(error);
      const failedFeedback: GuessFeedback = {
        code: normalized.code,
        message: normalized.message,
        status: normalized.status,
        ...(receipt ? { receipt } : {}),
      };
      setFeedback(failedFeedback);
      savePendingGuess(failedFeedback);
    }
  }

  if (step === "success") {
    const receipt = feedback.receipt;

    return (
      <main className="picker-shell success-shell">
        <section
          className="picker-panel success-panel"
          aria-labelledby="guess-success-title"
        >
          <p className="eyebrow">Guess submitted</p>
          <h1 id="guess-success-title">Your devnet guess is locked.</h1>
          <p>
            {feedback.message ||
              "The guess receipt was confirmed for this wallet."}
          </p>
          <SelectedNumberTray
            selectedNumbers={sortedSelection}
            onRemove={() => undefined}
          />
          {receipt ? (
            <dl className="review-costs">
              <div>
                <dt>PlayerGuess PDA</dt>
                <dd>{truncateAddress(receipt.playerGuess)}</dd>
              </div>
              <div>
                <dt>Signature</dt>
                <dd>
                  <a
                    href={`https://explorer.solana.com/tx/${receipt.signature}?cluster=devnet`}
                    rel="noreferrer"
                    target="_blank"
                  >
                    View receipt
                  </a>
                </dd>
              </div>
            </dl>
          ) : null}
          <div className="picker-actions">
            <Link className="secondary-link-action" href="/play">
              Back to live round
            </Link>
            <button
              className="primary-action"
              onClick={() => {
                setStep("selecting");
                setSelectedNumbers([]);
                clearPendingGuess();
                setFeedback({ message: "", status: "idle" });
              }}
              type="button"
            >
              Pick again
            </button>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="picker-shell">
      <header className="picker-header">
        <Link className="back-link" href="/play">
          Live round
        </Link>
        <div>
          <p className="eyebrow">
            Turn TURN-{IDEALER_ACTIVE_TURN_ID.toString().padStart(4, "0")}
          </p>
          <strong>Pick 6 numbers</strong>
        </div>
      </header>

      <section className="picker-panel" aria-labelledby="number-picker-title">
        <div className="picker-title-row">
          <div>
            <p className="eyebrow">Number picker</p>
            <h1 id="number-picker-title">Choose six unique numbers.</h1>
          </div>
          <span>{selectedNumbers.length}/6</span>
        </div>

        <div className="sticky-selection">
          <SelectedNumberTray
            selectedNumbers={sortedSelection}
            onRemove={removeNumber}
          />
          <p
            className={
              hasCompleteSelection
                ? "selection-message ready"
                : "selection-message"
            }
            id="number-picker-status"
          >
            {validationMessage}
          </p>
        </div>

        {step === "review" ? (
          <section
            className="review-panel"
            aria-labelledby="guess-review-title"
          >
            <p className="eyebrow">Review guess</p>
            <h2 id="guess-review-title">
              Confirm these numbers before devnet submission.
            </h2>
            <SelectedNumberTray
              selectedNumbers={sortedSelection}
              onRemove={removeNumber}
            />
            <dl className="review-costs">
              <div>
                <dt>Entry fee</dt>
                <dd>{MVP_FEES_SOL.guessSubmission.toFixed(2)} SOL</dd>
              </div>
              <div>
                <dt>Network fee</dt>
                <dd>Shown by wallet</dd>
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
                className={`guess-status-card ${feedback.status}`}
                role={feedback.status === "failed" ? "alert" : undefined}
              >
                <strong>
                  {feedback.status === "awaiting_approval"
                    ? "Awaiting wallet approval"
                    : null}
                  {feedback.status === "pending" ? "Transaction pending" : null}
                  {feedback.status === "confirmed" ? "Guess confirmed" : null}
                  {feedback.status === "duplicate" ? "Duplicate blocked" : null}
                  {feedback.status === "expired" ? "Turn closed" : null}
                  {feedback.status === "failed" ? "Submission failed" : null}
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
                {feedback.receipt?.playerGuess ? (
                  <small>
                    PlayerGuess PDA:{" "}
                    {truncateAddress(feedback.receipt.playerGuess)}
                  </small>
                ) : null}
              </article>
            ) : null}
            <div className="picker-actions">
              <button
                className="secondary-action"
                onClick={() => setStep("selecting")}
                type="button"
              >
                Edit numbers
              </button>
              {connected ? (
                <button
                  className="primary-action"
                  disabled={isSubmitting}
                  onClick={submitGuess}
                  type="button"
                >
                  {isSubmitting ? "Submitting..." : "Submit to devnet"}
                </button>
              ) : (
                <Link className="primary-action" href="/play/wallet">
                  Connect wallet
                </Link>
              )}
            </div>
          </section>
        ) : (
          <>
            <div className="picker-tools" aria-label="Selection tools">
              <button
                className="secondary-action"
                onClick={randomizeSelection}
                type="button"
              >
                Randomize
              </button>
              <button
                className="secondary-action"
                onClick={clearSelection}
                type="button"
              >
                Clear
              </button>
            </div>

            <div
              className="number-grid"
              aria-describedby="number-picker-status"
            >
              {NUMBER_OPTIONS.map((number) => {
                const isSelected = selectedNumbers.includes(number);
                const isDisabled =
                  !isSelected && selectedNumbers.length >= MAX_SELECTION_COUNT;

                return (
                  <button
                    aria-pressed={isSelected}
                    className="number-tile"
                    disabled={isDisabled}
                    key={number}
                    onClick={() => toggleNumber(number)}
                    type="button"
                  >
                    {formatNumber(number)}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </section>

      {step !== "review" ? (
        <nav className="picker-bottom-bar" aria-label="Number picker actions">
          <button
            className="secondary-action"
            onClick={randomizeSelection}
            type="button"
          >
            Randomize
          </button>
          <button
            className="primary-action"
            disabled={!hasCompleteSelection}
            onClick={() => setStep("review")}
            type="button"
          >
            Review guess
          </button>
        </nav>
      ) : null}
    </main>
  );
}
