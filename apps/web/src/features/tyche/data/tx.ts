"use client";

/**
 * Shared transaction send + error-normalization helpers for the Tyche
 * write actions (guess, propose, vote, eliminate, claim). Mirrors the proven
 * send pattern from the original NumberPicker (createWalletTransactionSigner →
 * client.transaction.prepareAndSend).
 */
import { createWalletTransactionSigner } from "@solana/client";
import type { useSolanaClient, useWalletConnection } from "@solana/react-hooks";
import { describeTycheProgramError } from "./programErrors";

type SolanaClient = ReturnType<typeof useSolanaClient>;
type WalletConnection = ReturnType<typeof useWalletConnection>;
type ConnectedWallet = NonNullable<WalletConnection["wallet"]>;
type PrepareAndSendInput = Parameters<SolanaClient["transaction"]["prepareAndSend"]>[0];
type ProgramInstruction = PrepareAndSendInput["instructions"][number];

export const WALLET_PENDING_ACTION_KEY = "tyche.wallet.pending-action";
export const WALLET_APPROVAL_TIMEOUT_MS = 120_000;
export const WALLET_APPROVAL_TIMEOUT_ERROR_CODE =
  "TRANSACTION_APPROVAL_TIMEOUT";
const WALLET_APPROVAL_TIMEOUT_MESSAGE =
  "The wallet approval timed out after 2 minutes. Check your wallet status before retrying.";
const WALLET_APPROVAL_EXPIRY_GRACE_MS = 10_000;

export interface SendInstructionOptions {
  approvalTimeoutMs?: number;
}

export class WalletApprovalTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Wallet approval timed out after ${formatTimeoutMs(timeoutMs)}.`);
    this.name = "WalletApprovalTimeoutError";
  }
}

export type WalletPendingStatus =
  | "awaiting_approval"
  | "confirmed"
  | "delayed_confirmation"
  | "duplicate"
  | "failed"
  | "pending_confirmation"
  | "turn_changed";

export interface WalletPendingAction {
  action: string;
  createdAt: string;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  numbers?: number[] | undefined;
  signature?: string | undefined;
  status: WalletPendingStatus;
  turnId?: number | undefined;
  updatedAt: string;
  version: 1;
  walletAddress?: string | undefined;
}

/** Sign + send a single program instruction; resolves to the tx signature. */
export async function sendInstruction(
  client: SolanaClient,
  wallet: ConnectedWallet,
  instruction: ProgramInstruction,
  options: SendInstructionOptions = {},
): Promise<string> {
  return sendInstructions(client, wallet, [instruction], options);
}

/** Sign + send one atomic transaction containing one or more instructions. */
export async function sendInstructions(
  client: SolanaClient,
  wallet: ConnectedWallet,
  instructions: readonly ProgramInstruction[],
  options: SendInstructionOptions = {},
): Promise<string> {
  if (instructions.length === 0) {
    throw new Error("At least one transaction instruction is required.");
  }
  const walletSigner = createWalletTransactionSigner(wallet, {
    commitment: "confirmed",
  }).signer;
  const approvalTimeoutMs =
    options.approvalTimeoutMs ?? WALLET_APPROVAL_TIMEOUT_MS;
  const approvalController = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    approvalController.abort(
      new WalletApprovalTimeoutError(approvalTimeoutMs),
    );
  }, approvalTimeoutMs);

  const sendPromise = client.transaction.prepareAndSend(
    {
      authority: walletSigner,
      commitment: "confirmed",
      feePayer: walletSigner,
      instructions: [...instructions],
      version: 0,
    },
    {
      commitment: "confirmed",
      maxRetries: 3,
      skipPreflight: false,
    },
  );

  try {
    const signature = await raceWithAbort(
      sendPromise,
      approvalController.signal,
    );
    return signature.toString();
  } catch (error) {
    if (approvalController.signal.aborted) {
      // The abandoned send may still settle later; swallow its outcome so it
      // does not surface as an unhandled rejection.
      sendPromise.catch(() => {});
      const reason = approvalController.signal.reason;
      throw reason instanceof WalletApprovalTimeoutError
        ? reason
        : new WalletApprovalTimeoutError(approvalTimeoutMs);
    }
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
  }
}

/**
 * Await `promise`, but reject as soon as `signal` aborts. Passing the signal
 * into the Wallet Standard transaction pipeline can prevent some wallet
 * adapters from opening their approval UI. Keep cancellation outside
 * `prepareAndSend`: the timeout releases the DApp UI without altering the
 * wallet's signing request.
 */
export async function raceWithAbort<T>(
  promise: Promise<T>,
  signal: AbortSignal,
): Promise<T> {
  if (signal.aborted) {
    throw signal.reason;
  }
  let unsubscribe = () => {};
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        const onAbort = () => reject(signal.reason);
        signal.addEventListener("abort", onAbort, { once: true });
        unsubscribe = () => signal.removeEventListener("abort", onAbort);
      }),
    ]);
  } finally {
    unsubscribe();
  }
}

/**
 * A pending action recorded for a different turn cannot duplicate anything in
 * the active turn (guess accounts derive from turn id + sequence), so it must
 * not keep blocking new submits; surface it as turn_changed so the player can
 * clear it. Failed/confirmed entries keep their own copy and clear button.
 */
export function releaseActionFromOtherTurn(
  action: WalletPendingAction,
  activeTurnId: number,
): WalletPendingAction {
  const releasableStatus =
    action.status === "awaiting_approval" ||
    action.status === "pending_confirmation" ||
    action.status === "delayed_confirmation" ||
    action.status === "duplicate";
  if (
    !releasableStatus ||
    activeTurnId <= 0 ||
    action.turnId === undefined ||
    action.turnId === activeTurnId
  ) {
    return action;
  }
  return {
    ...action,
    errorCode: "TURN_CHANGED",
    errorMessage: "The active round changed while this wallet action was pending.",
    status: "turn_changed",
  };
}

/**
 * A pending `awaiting_approval` entry older than the approval timeout can only
 * come from an attempt that hung without resolving; report it as failed so one
 * hung attempt cannot block submits forever.
 */
export function expireStaleApprovalAction(
  action: WalletPendingAction,
  nowMs: number,
): WalletPendingAction {
  if (action.status !== "awaiting_approval") {
    return action;
  }
  const updatedAtMs = Date.parse(action.updatedAt);
  if (
    Number.isFinite(updatedAtMs) &&
    nowMs - updatedAtMs <=
      WALLET_APPROVAL_TIMEOUT_MS + WALLET_APPROVAL_EXPIRY_GRACE_MS
  ) {
    return action;
  }
  return {
    ...action,
    errorCode: WALLET_APPROVAL_TIMEOUT_ERROR_CODE,
    errorMessage: WALLET_APPROVAL_TIMEOUT_MESSAGE,
    status: "failed",
  };
}

export function readPendingWalletAction(): WalletPendingAction | null {
  if (typeof window === "undefined") {
    return null;
  }
  const raw = window.localStorage.getItem(WALLET_PENDING_ACTION_KEY);
  if (!raw) {
    return null;
  }
  try {
    const parsed = JSON.parse(raw) as Partial<WalletPendingAction>;
    if (parsed.version !== 1 || typeof parsed.action !== "string") {
      return null;
    }
    if (
      parsed.status !== "awaiting_approval" &&
      parsed.status !== "pending_confirmation" &&
      parsed.status !== "delayed_confirmation" &&
      parsed.status !== "confirmed" &&
      parsed.status !== "duplicate" &&
      parsed.status !== "failed" &&
      parsed.status !== "turn_changed"
    ) {
      return null;
    }
    return expireStaleApprovalAction(
      {
        action: parsed.action,
        createdAt: parsed.createdAt ?? new Date(0).toISOString(),
        errorCode: parsed.errorCode,
        errorMessage: parsed.errorMessage,
        numbers: parsed.numbers,
        signature: parsed.signature,
        status: parsed.status,
        turnId: parsed.turnId,
        updatedAt: parsed.updatedAt ?? parsed.createdAt ?? new Date(0).toISOString(),
        version: 1,
        walletAddress: parsed.walletAddress,
      },
      Date.now(),
    );
  } catch {
    return null;
  }
}

export function writePendingWalletAction(
  next: Omit<WalletPendingAction, "updatedAt" | "version"> & {
    updatedAt?: string;
  },
): WalletPendingAction {
  const action: WalletPendingAction = {
    ...next,
    updatedAt: next.updatedAt ?? new Date().toISOString(),
    version: 1,
  };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(WALLET_PENDING_ACTION_KEY, JSON.stringify(action));
  }
  return action;
}

export function clearPendingWalletAction(): void {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(WALLET_PENDING_ACTION_KEY);
  }
}

export function isBlockingWalletAction(action: WalletPendingAction | null): boolean {
  return (
    action?.status === "awaiting_approval" ||
    action?.status === "pending_confirmation" ||
    action?.status === "delayed_confirmation"
  );
}

export function txErrorCode(error: unknown): string {
  const message = getTxDiagnosticText(error);
  const lower = message.toLowerCase();

  if (
    error instanceof WalletApprovalTimeoutError ||
    lower.includes("approval timed out") ||
    lower.includes("transaction_approval_timeout")
  ) {
    return WALLET_APPROVAL_TIMEOUT_ERROR_CODE;
  }
  if (lower.includes("reject") || lower.includes("declin") || lower.includes("cancel")) {
    return "TRANSACTION_REJECTED";
  }
  if (
    lower.includes("already in use") ||
    lower.includes("accountalreadyinitialized") ||
    lower.includes("custom program error: 0x0") ||
    lower.includes("already performed")
  ) {
    return "DUPLICATE_ACTION";
  }
  if (
    lower.includes("account: game_token") &&
    (lower.includes("accountnotinitialized") ||
      lower.includes("account not initialized"))
  ) {
    return "ROUND_PASS_NOT_CONFIRMED";
  }
  if (lower.includes("insufficient") || lower.includes("lamports") || lower.includes("funds")) {
    return "INSUFFICIENT_FUNDS";
  }
  return "TRANSACTION_FAILED";
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function findNestedProperty(value: unknown, property: string, depth = 0): unknown {
  if (depth > 6) {
    return undefined;
  }
  const record = asRecord(value);
  if (!record) {
    return undefined;
  }
  if (property in record) {
    return record[property];
  }
  for (const nested of Object.values(record)) {
    const found = findNestedProperty(nested, property, depth + 1);
    if (found !== undefined) {
      return found;
    }
  }
  return undefined;
}

// Transaction plan results embed the compiled transaction, so a naive string
// sweep collects base58 account keys and version markers instead of the actual
// failure cause. Those tokens carry no diagnostic value — drop them.
function isDiagnosticText(value: string) {
  if (/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value)) {
    return false;
  }
  return value !== "legacy" && value !== "0";
}

function collectDiagnosticStrings(value: unknown, output: string[], depth = 0): void {
  if (depth > 5 || output.length >= 12) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed && isDiagnosticText(trimmed)) {
      output.push(trimmed);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      collectDiagnosticStrings(item, output, depth + 1);
    }
    return;
  }
  const record = asRecord(value);
  if (!record) {
    return;
  }

  // "cause" matters: a plan that fails AT the wallet step (e.g. the user
  // rejects in Phantom) wraps the wallet's error there — without it the
  // rejection is misreported as a generic transaction failure.
  for (const key of ["message", "error", "errorMessage", "cause", "logs", "logMessages", "instructionError", "reason"]) {
    if (key in record) {
      collectDiagnosticStrings(record[key], output, depth + 1);
    }
  }
  for (const nested of Object.values(record)) {
    if (output.length >= 12) {
      return;
    }
    collectDiagnosticStrings(nested, output, depth + 1);
  }
}

function getTransactionPlanDiagnostic(error: unknown): string | null {
  const planResult = findNestedProperty(error, "transactionPlanResult");
  if (planResult === undefined) {
    return null;
  }

  const diagnostics: string[] = [];
  collectDiagnosticStrings(planResult, diagnostics);
  const unique = [...new Set(diagnostics)]
    .filter((entry) => !/provided transaction plan failed to execute|cause.*deprecated/i.test(entry))
    .slice(0, 5);
  return unique.length > 0 ? unique.join(" ") : null;
}

function getTxDiagnosticText(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const planDiagnostic = getTransactionPlanDiagnostic(error);
  return planDiagnostic ? `${message} ${planDiagnostic}` : message;
}

function formatTimeoutMs(timeoutMs: number) {
  if (timeoutMs % 60_000 === 0) {
    const minutes = timeoutMs / 60_000;
    return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  }

  if (timeoutMs % 1_000 === 0) {
    const seconds = timeoutMs / 1_000;
    return `${seconds} second${seconds === 1 ? "" : "s"}`;
  }

  return `${timeoutMs} ms`;
}

/**
 * Message for a failed wallet connect. Connector errors often carry no usable
 * text (the console shows "wallet connection failed {}"), so fall back to
 * actionable copy instead of surfacing "[object Object]".
 */
export function describeWalletConnectError(error: unknown): string {
  if (txErrorCode(error) === "TRANSACTION_REJECTED") {
    return "The connection request was declined in the wallet. Approve it to connect.";
  }
  const message = error instanceof Error ? error.message.trim() : "";
  return message
    ? `The wallet connection failed: ${message}`
    : "The wallet connection failed. Unlock your wallet, make sure it is on Solana devnet, and try again.";
}

/** Human-readable, English error message for a failed wallet/program action. */
export function describeTxError(error: unknown): string {
  const code = txErrorCode(error);
  const planDiagnostic = getTransactionPlanDiagnostic(error);

  if (code === WALLET_APPROVAL_TIMEOUT_ERROR_CODE) {
    return WALLET_APPROVAL_TIMEOUT_MESSAGE;
  }
  if (code === "TRANSACTION_REJECTED") {
    return "The wallet request was rejected. Nothing was submitted.";
  }
  if (code === "DUPLICATE_ACTION") {
    return "This wallet has already performed this action for the current turn.";
  }
  if (code === "ROUND_PASS_NOT_CONFIRMED") {
    return "Your round pass is not confirmed on devnet yet. Wait for the guess confirmation to finish, then submit again.";
  }
  if (code === "INSUFFICIENT_FUNDS") {
    return "This wallet needs more devnet SOL for the fee, account rent, and network fee.";
  }
  // A named program error says exactly what went wrong; the raw simulation
  // dump does not. Unknown codes deliberately fall through to the diagnostic
  // so a real defect stays visible instead of becoming friendly noise.
  const programError = describeTycheProgramError(getTxDiagnosticText(error));
  if (programError) {
    return programError;
  }
  if (planDiagnostic) {
    // A plan can fail before the wallet (blockhash/simulation), at the wallet,
    // or on send — don't claim a specific phase, surface the actual cause.
    return `The transaction could not be completed. ${planDiagnostic}`;
  }
  return error instanceof Error ? error.message : String(error);
}
