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

/** Human-readable, English error message for a failed wallet/program action. */
export function describeTxError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();

  if (lower.includes("reject") || lower.includes("declin") || lower.includes("cancel")) {
    return "The wallet request was rejected. Nothing was submitted.";
  }
  if (
    lower.includes("already in use") ||
    lower.includes("accountalreadyinitialized") ||
    lower.includes("custom program error: 0x0")
  ) {
    return "This wallet has already performed this action for the current turn.";
  }
  if (lower.includes("insufficient") || lower.includes("lamports") || lower.includes("funds")) {
    return "This wallet needs more devnet SOL for the fee, account rent, and network fee.";
  }
  return message;
}
