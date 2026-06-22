/**
 * Pure formatting helpers shared across the Idealer screens.
 * All on-chain amounts are native SOL (lamports / 1e9) — never USDC, despite the
 * original design mock's label (see plan: currency decision = SOL).
 */
import { LAMPORTS_PER_SOL } from "@idealer/constants";

export function lamportsToSol(lamports: bigint | number): number {
  return Number(lamports) / LAMPORTS_PER_SOL;
}

/** SOL amount with 2 decimals, locale grouping (e.g. "24.86"). */
export function fmtSol(value: number): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  });
}

/** Integer with locale grouping (e.g. "1,284"). */
export function fmtInt(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** Split a countdown in seconds into zero-padded [hh, mm, ss]. */
export function fmtCountdown(totalSeconds: number): [string, string, string] {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) =>
    value.toString().padStart(2, "0"),
  ) as [string, string, string];
}

/** Shorten a base58 address for display (e.g. "4sF9k2…aQ7x"). */
export function truncateAddress(value: string): string {
  if (value.length <= 11) {
    return value;
  }
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

/** Turn id → display label (e.g. 42 → "#0042"). */
export function fmtTurnId(turnId: number): string {
  return `#${turnId.toString().padStart(4, "0")}`;
}

/** Relative "expires in …" from a future ISO timestamp, in English. */
export function expiresInLabel(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const at = Date.parse(iso);
  if (Number.isNaN(at)) {
    return "";
  }
  const seconds = Math.floor((at - Date.now()) / 1000);
  if (seconds <= 0) {
    return "expired";
  }
  const hours = Math.floor(seconds / 3600);
  if (hours < 1) {
    return "expires within the hour";
  }
  if (hours < 24) {
    return `expires in ${hours} h`;
  }
  const days = Math.floor(hours / 24);
  return `expires in ${days} day${days === 1 ? "" : "s"}`;
}

/** Relative "time ago" from an ISO timestamp, in English. */
export function timeAgo(iso: string | null | undefined): string {
  if (!iso) {
    return "";
  }
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return "";
  }
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 60) {
    return "just now";
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} min ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours} h ago`;
  }
  const days = Math.floor(hours / 24);
  return days === 1 ? "yesterday" : `${days} days ago`;
}
