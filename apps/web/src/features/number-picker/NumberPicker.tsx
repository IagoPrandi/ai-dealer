"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { MVP_FEES_SOL } from "@idealer/constants";
import { createWalletTransactionSigner } from "@solana/client";
import { address } from "@solana/kit";
import {
  useSolanaClient,
  useWaitForSignature,
  useWalletConnection,
} from "@solana/react-hooks";
import {
  createSubmitGuessInstruction,
  deriveSubmitGuessAccounts,
  fetchActiveTurnSnapshot,
  getTurnActionReadiness,
  IDEALER_ACTIVE_TURN_ID,
  IDEALER_PROGRAM_ID,
  type GuessReceipt,
  validateGuessNumbers,
} from "../../solana/idealerProgram";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Dice5,
  ExternalLink,
  LoaderCircle,
  Sparkles,
  Wallet,
  X,
  Zap,
} from "lucide-react";

const MAX_SELECTION_COUNT = 6;
const NUMBER_OPTIONS = Array.from({ length: 100 }, (_, index) => index + 1);
const PENDING_GUESS_KEY = "idealer.guess.pending";
const API_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_API_URL ?? "http://localhost:3002";
const LAMPORTS_PER_SOL = 1_000_000_000;
const ESTIMATED_NETWORK_FEE_LAMPORTS = 100_000;
const PLAYER_GUESS_ACCOUNT_SPACE = 99;
const GAME_TOKEN_ACCOUNT_SPACE = 126;

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringifyErrorValue(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.message;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function collectErrorDetails(error: unknown, depth = 0): string[] {
  if (depth > 3 || !isRecord(error)) {
    return [];
  }

  const details: string[] = [];
  const message = error.message;
  if (typeof message === "string") {
    details.push(message);
  }

  for (const key of [
    "transactionPlanResult",
    "context",
    "logs",
    "err",
    "error",
    "details",
  ]) {
    if (key in error) {
      details.push(stringifyErrorValue(error[key]));
    }
  }

  if ("cause" in error) {
    details.push(...collectErrorDetails(error.cause, depth + 1));
  }

  return details.filter(Boolean);
}

function getGuessErrorMessage(error: unknown) {
  const details = collectErrorDetails(error);
  if (details.length > 0) {
    return details.join(" ");
  }

  return error instanceof Error ? error.message : String(error);
}

function normalizeProgramError(message: string) {
  const normalizedMessage = message.toLowerCase();

  if (
    normalizedMessage.includes("custom program error: 0x1773") ||
    normalizedMessage.includes("custom program error: 0x1774") ||
    normalizedMessage.includes("no active turn") ||
    normalizedMessage.includes("invalid turn id")
  ) {
    return {
      code: "DEVNET_TURN_NOT_READY",
      message:
        "The configured devnet turn is not ready for this app build. Open a live turn or update NEXT_PUBLIC_IDEALER_ACTIVE_TURN_ID.",
      status: "expired" as const,
    };
  }

  if (
    normalizedMessage.includes("action window") ||
    normalizedMessage.includes("turn is not open") ||
    normalizedMessage.includes("custom program error: 0x1775") ||
    normalizedMessage.includes("custom program error: 0x1777")
  ) {
    return {
      code: "TURN_NOT_ACCEPTING_GUESSES",
      message:
        "This turn is no longer accepting guesses. Return to the live round.",
      status: "expired" as const,
    };
  }

  if (
    normalizedMessage.includes("insufficient") ||
    normalizedMessage.includes("lamports") ||
    normalizedMessage.includes("funds")
  ) {
    return {
      code: "INSUFFICIENT_SOL",
      message:
        "This wallet needs more devnet SOL for the entry fee, account rent, and network fee.",
      status: "failed" as const,
    };
  }

  return null;
}

function normalizeGuessError(error: unknown) {
  const message = getGuessErrorMessage(error);
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

  const programError = normalizeProgramError(message);
  if (programError) {
    return programError;
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

function PickerPhoneChrome() {
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

function Dealer({ size = 38 }: { size?: number }) {
  return (
    <span
      aria-hidden="true"
      className="platform-dealer"
      style={{ width: size, height: size }}
    >
      <span className="platform-dealer-hat" />
      <i />
      <i />
      <b />
    </span>
  );
}

function PickerFrame({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <main className="platform-stage">
      <div className="platform-phone-shell">
        <PickerPhoneChrome />
        {children}
      </div>
    </main>
  );
}

async function hasAccount(
  client: ReturnType<typeof useSolanaClient>,
  account: ReturnType<typeof address>,
) {
  const result = await client.runtime.rpc
    .getAccountInfo(account, {
      commitment: "confirmed",
      encoding: "base64",
    })
    .send();

  return Boolean(result.value);
}

async function getMinimumBalanceForRentExemption(
  client: ReturnType<typeof useSolanaClient>,
  space: number,
) {
  const result = await client.runtime.rpc
    .getMinimumBalanceForRentExemption(BigInt(space), {
      commitment: "confirmed",
    })
    .send();

  return BigInt(result);
}

async function getGuessSubmissionCostLamports(
  client: ReturnType<typeof useSolanaClient>,
) {
  const [playerGuessRent, gameTokenRent] = await Promise.all([
    getMinimumBalanceForRentExemption(client, PLAYER_GUESS_ACCOUNT_SPACE),
    getMinimumBalanceForRentExemption(client, GAME_TOKEN_ACCOUNT_SPACE),
  ]);

  return (
    BigInt(Math.round(MVP_FEES_SOL.guessSubmission * LAMPORTS_PER_SOL)) +
    playerGuessRent +
    gameTokenRent +
    BigInt(ESTIMATED_NETWORK_FEE_LAMPORTS)
  );
}

function lamportsToSol(lamports: bigint) {
  return Number(lamports) / LAMPORTS_PER_SOL;
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
  const [activeTurnId, setActiveTurnId] = useState(IDEALER_ACTIVE_TURN_ID);
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
    let mounted = true;

    void fetchActiveTurnSnapshot(client)
      .then((snapshot) => {
        if (!mounted || !snapshot.globalConfig.hasActiveTurn) {
          return;
        }
        setActiveTurnId(snapshot.globalConfig.activeTurnId);
      })
      .catch(() => undefined);

    return () => {
      mounted = false;
    };
  }, [client]);

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
      const activeTurn = await fetchActiveTurnSnapshot(client);
      const turnReadiness = getTurnActionReadiness({
        cutoffBps: activeTurn.globalConfig.guessCutoffBps,
        globalConfig: activeTurn.globalConfig,
        turn: activeTurn.turnState,
      });

      if (!turnReadiness.ok) {
        setFeedback({
          code: turnReadiness.code,
          message: turnReadiness.message,
          status: "expired",
        });
        return;
      }

      const turnId = activeTurn.globalConfig.activeTurnId;
      setActiveTurnId(turnId);
      const accounts = await deriveSubmitGuessAccounts({
        player,
        turnId,
      });

      const [globalConfigReady, turnReady, treasuryReady, prizeReady] =
        await Promise.all([
          hasAccount(client, accounts.globalConfig),
          hasAccount(client, accounts.turnState),
          hasAccount(client, accounts.treasuryVault),
          hasAccount(client, accounts.prizeVault),
        ]);

      if (!globalConfigReady || !turnReady || !treasuryReady || !prizeReady) {
        setFeedback({
          code: "DEVNET_TURN_NOT_READY",
          message:
            "The devnet turn accounts are not ready for submissions. Open the turn before asking the wallet to approve.",
          status: "expired",
        });
        return;
      }

      const [balance, requiredLamports] = await Promise.all([
        client.runtime.rpc
          .getBalance(player, { commitment: "confirmed" })
          .send(),
        getGuessSubmissionCostLamports(client),
      ]);
      const balanceLamports = BigInt(balance.value);
      const balanceSol = lamportsToSol(balanceLamports);
      const requiredSol = lamportsToSol(requiredLamports);

      if (balanceLamports < requiredLamports) {
        setFeedback({
          code: "INSUFFICIENT_SOL",
          message: `This wallet has ${balanceSol.toFixed(
            4,
          )} SOL. Add devnet SOL before submitting; this flow needs at least ${requiredSol.toFixed(
            6,
          )} SOL for the entry fee, account rent, and network fee.`,
          status: "failed",
        });
        return;
      }

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
          turnId,
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
        turnId,
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
        turnId,
      });
      const walletSigner = createWalletTransactionSigner(wallet, {
        commitment: "confirmed",
      }).signer;
      const signature = (
        await client.transaction.prepareAndSend(
          {
            authority: walletSigner,
            commitment: "confirmed",
            feePayer: walletSigner,
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
      <PickerFrame>
        <section
          className="platform-screen platform-picker-screen"
          aria-labelledby="guess-success-title"
        >
          <div className="platform-ambient" />
          <div className="platform-scroll platform-picker-scroll">
            <article className="platform-picker-success-card">
              <CheckCircle2 aria-hidden="true" size={42} />
              <p className="platform-section-label">Guess submitted</p>
              <h1 id="guess-success-title">Your devnet guess is locked.</h1>
              <p>
                {feedback.message ||
                  "The guess receipt was confirmed for this wallet."}
              </p>
              <SelectedNumberTray
                selectedNumbers={sortedSelection}
                onRemove={() => undefined}
              />
            </article>
            {receipt ? (
              <dl className="platform-picker-meta">
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
                      View receipt <ExternalLink aria-hidden="true" size={13} />
                    </a>
                  </dd>
                </div>
              </dl>
            ) : null}
          </div>
          <div className="platform-picker-actions">
            <Link className="platform-ghost-button" href="/play">
              <ArrowLeft aria-hidden="true" size={17} />
              Live round
            </Link>
            <button
              className="platform-primary-button"
              onClick={() => {
                setStep("selecting");
                setSelectedNumbers([]);
                clearPendingGuess();
                setFeedback({ message: "", status: "idle" });
              }}
              type="button"
            >
              <Dice5 aria-hidden="true" size={18} />
              Pick again
            </button>
          </div>
        </section>
      </PickerFrame>
    );
  }

  return (
    <PickerFrame>
      <section
        className="platform-screen platform-picker-screen"
        aria-labelledby="number-picker-title"
      >
        <div className="platform-ambient" />
        <div className="platform-scroll platform-picker-scroll">
          <header className="platform-screen-header platform-picker-header">
            <Link aria-label="Back to current round" href="/play">
              <ArrowLeft aria-hidden="true" size={22} />
            </Link>
            <div>
              <p className="platform-section-label">
                TURN-{activeTurnId.toString().padStart(4, "0")}
              </p>
              <h1 id="number-picker-title">Choose six unique numbers.</h1>
            </div>
            <span className="platform-picker-count">
              {selectedNumbers.length}/6
            </span>
          </header>

          <article className="platform-picker-card platform-picker-tray-card">
            <span className="platform-chat-avatar" aria-hidden="true">
              <Dealer size={30} />
            </span>
            <div>
              <p className="platform-section-label">Your guess</p>
              <SelectedNumberTray
                selectedNumbers={sortedSelection}
                onRemove={removeNumber}
              />
              <p
                className={
                  hasCompleteSelection
                    ? "platform-picker-message ready"
                    : "platform-picker-message"
                }
                id="number-picker-status"
              >
                {validationMessage}
              </p>
            </div>
          </article>

          {step === "review" ? (
            <section
              className="platform-picker-card platform-picker-review"
              aria-labelledby="guess-review-title"
            >
              <p className="platform-section-label">Review guess</p>
              <h2 id="guess-review-title">
                Confirm these numbers before devnet submission.
              </h2>
              <dl className="platform-picker-meta">
                <div>
                  <dt>Entry fee</dt>
                  <dd>{MVP_FEES_SOL.guessSubmission.toFixed(2)} SOL</dd>
                </div>
                <div>
                  <dt>Account rent</dt>
                  <dd>Calculated before wallet</dd>
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
                  className={`guess-status-card platform-picker-status ${feedback.status}`}
                  role={feedback.status === "failed" ? "alert" : undefined}
                >
                  {feedback.status === "awaiting_approval" ||
                  feedback.status === "pending" ? (
                    <LoaderCircle
                      aria-hidden="true"
                      className="wallet-spinner"
                      size={20}
                    />
                  ) : feedback.status === "confirmed" ? (
                    <CheckCircle2 aria-hidden="true" size={20} />
                  ) : (
                    <AlertTriangle aria-hidden="true" size={20} />
                  )}
                  <div>
                    <strong>
                      {feedback.status === "awaiting_approval"
                        ? "Awaiting wallet approval"
                        : null}
                      {feedback.status === "pending"
                        ? "Transaction pending"
                        : null}
                      {feedback.status === "confirmed"
                        ? "Guess confirmed"
                        : null}
                      {feedback.status === "duplicate"
                        ? "Duplicate blocked"
                        : null}
                      {feedback.status === "expired" ? "Turn closed" : null}
                      {feedback.status === "failed"
                        ? "Submission failed"
                        : null}
                    </strong>
                    <p>{feedback.message}</p>
                    {feedback.code ? <code>{feedback.code}</code> : null}
                    {feedback.signature ? (
                      <a
                        href={`https://explorer.solana.com/tx/${feedback.signature}?cluster=devnet`}
                        rel="noreferrer"
                        target="_blank"
                      >
                        View devnet transaction{" "}
                        <ExternalLink aria-hidden="true" size={13} />
                      </a>
                    ) : null}
                    {feedback.receipt?.playerGuess ? (
                      <small>
                        PlayerGuess PDA:{" "}
                        {truncateAddress(feedback.receipt.playerGuess)}
                      </small>
                    ) : null}
                  </div>
                </article>
              ) : null}
            </section>
          ) : (
            <>
              <div className="platform-picker-tools" aria-label="Selection tools">
                <button
                  className="platform-ghost-button"
                  onClick={randomizeSelection}
                  type="button"
                >
                  <Dice5 aria-hidden="true" size={17} />
                  Randomize
                </button>
                <button
                  className="platform-ghost-button"
                  onClick={clearSelection}
                  type="button"
                >
                  <X aria-hidden="true" size={17} />
                  Clear
                </button>
              </div>

              <div
                className="platform-picker-grid"
                aria-describedby="number-picker-status"
              >
                {NUMBER_OPTIONS.map((number) => {
                  const isSelected = selectedNumbers.includes(number);
                  const isDisabled =
                    !isSelected &&
                    selectedNumbers.length >= MAX_SELECTION_COUNT;

                  return (
                    <button
                      aria-pressed={isSelected}
                      className="platform-picker-number"
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
        </div>

        <nav className="platform-picker-actions" aria-label="Number picker actions">
          {step === "review" ? (
            <button
              className="platform-ghost-button"
              onClick={() => setStep("selecting")}
              type="button"
            >
              <ArrowLeft aria-hidden="true" size={17} />
              Edit numbers
            </button>
          ) : (
            <button
              className="platform-ghost-button"
              onClick={randomizeSelection}
              type="button"
            >
              <Sparkles aria-hidden="true" size={17} />
              Lucky pick
            </button>
          )}
          {step === "review" ? (
            connected ? (
              <button
                className="platform-primary-button"
                disabled={isSubmitting}
                onClick={submitGuess}
                type="button"
              >
                {isSubmitting ? (
                  <LoaderCircle
                    aria-hidden="true"
                    className="wallet-spinner"
                    size={18}
                  />
                ) : (
                  <Zap aria-hidden="true" size={18} />
                )}
                {isSubmitting ? "Submitting..." : "Submit to devnet"}
              </button>
            ) : (
              <Link className="platform-primary-button" href="/play/wallet">
                <Wallet aria-hidden="true" size={18} />
                Connect wallet
              </Link>
            )
          ) : (
            <button
              className="platform-primary-button"
              disabled={!hasCompleteSelection}
              onClick={() => setStep("review")}
              type="button"
            >
              <CheckCircle2 aria-hidden="true" size={18} />
              Review guess
            </button>
          )}
        </nav>
      </section>
    </PickerFrame>
  );
}
