"use client";

/**
 * Shared transaction send + error-normalization helpers for the Idealer
 * write actions (guess, propose, vote, eliminate, claim). Mirrors the proven
 * send pattern from the original NumberPicker (createWalletTransactionSigner →
 * client.transaction.prepareAndSend).
 */
import { createWalletTransactionSigner } from "@solana/client";
import type { useSolanaClient, useWalletConnection } from "@solana/react-hooks";

type SolanaClient = ReturnType<typeof useSolanaClient>;
type WalletConnection = ReturnType<typeof useWalletConnection>;
type ConnectedWallet = NonNullable<WalletConnection["wallet"]>;
type PrepareAndSendInput = Parameters<SolanaClient["transaction"]["prepareAndSend"]>[0];
type ProgramInstruction = PrepareAndSendInput["instructions"][number];

export const WALLET_PENDING_ACTION_KEY = "idealer.wallet.pending-action";

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
): Promise<string> {
  const walletSigner = createWalletTransactionSigner(wallet, {
    commitment: "confirmed",
  }).signer;

  const signature = await client.transaction.prepareAndSend(
    {
      authority: walletSigner,
      commitment: "confirmed",
      feePayer: walletSigner,
      instructions: [instruction],
      version: 0,
    },
    { commitment: "confirmed", maxRetries: 3, skipPreflight: false },
  );

  return signature.toString();
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
    return {
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
    };
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

function collectDiagnosticStrings(value: unknown, output: string[], depth = 0): void {
  if (depth > 5 || output.length >= 12) {
    return;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed) {
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

  for (const key of ["message", "error", "errorMessage", "logs", "logMessages", "instructionError", "reason"]) {
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

/** Human-readable, English error message for a failed wallet/program action. */
export function describeTxError(error: unknown): string {
  const code = txErrorCode(error);
  const planDiagnostic = getTransactionPlanDiagnostic(error);

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
  if (planDiagnostic) {
    return `The transaction simulation failed before wallet submission. ${planDiagnostic}`;
  }
  return error instanceof Error ? error.message : String(error);
}
