/**
 * Thin typed wrappers over the Idealer HTTP API (apps/api, default :3002).
 *
 * Errors are propagated (never silently swallowed) so screens can surface a
 * real failure state — per the project rule "never use fallbacks that hide
 * issues". The only tolerated non-2xx is an explicit 404/409 where the caller
 * asks for it (e.g. a guess receipt that does not exist yet).
 */
import type {
  ConversationDraftApi,
  GuessReceiptApi,
  PlayerClaimsApi,
  PlayerHistoryApi,
  RoundSummaryApi,
  RuleProposalApi,
  RuleVotesApi,
} from "./types";
import { getApiBaseUrl } from "../../../lib/apiBase";

export const API_BASE_URL = getApiBaseUrl;

export class ApiRequestError extends Error {
  readonly code: string | null;
  readonly detail: unknown;
  readonly status: number;

  constructor(args: {
    code?: string | null;
    detail: unknown;
    message: string;
    status: number;
  }) {
    super(args.message);
    this.name = "ApiRequestError";
    this.code = args.code ?? null;
    this.detail = args.detail;
    this.status = args.status;
  }
}

async function getJson<T>(
  path: string,
  options: { allow404?: boolean; signal?: AbortSignal } = {},
): Promise<T | null> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...(options.signal ? { signal: options.signal } : {}),
  });

  if (options.allow404 && response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`GET ${path} returned HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  // 409 is a benign "already recorded" for receipts/votes — treat as success.
  if (!response.ok && response.status !== 409) {
    throw new Error(`POST ${path} returned HTTP ${response.status}.`);
  }

  return (await response.json()) as T;
}

function apiErrorMessage(path: string, status: number, detail: unknown) {
  if (detail && typeof detail === "object") {
    const record = detail as Record<string, unknown>;
    const message =
      typeof record.message === "string"
        ? record.message
        : typeof record.error === "string"
          ? record.error
          : null;
    if (message) {
      return `POST ${path} returned HTTP ${status}. ${message}`;
    }
  }
  return `POST ${path} returned HTTP ${status}.`;
}

function apiErrorCode(detail: unknown) {
  if (!detail || typeof detail !== "object") {
    return null;
  }
  const record = detail as Record<string, unknown>;
  return typeof record.error === "string" ? record.error : null;
}

async function postStrictJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    let detail: unknown;
    try {
      detail = await response.json();
    } catch {
      detail = undefined;
    }
    throw new ApiRequestError({
      code: apiErrorCode(detail),
      detail,
      message: apiErrorMessage(path, response.status, detail),
      status: response.status,
    });
  }

  return (await response.json()) as T;
}

export function getRuleProposals(turnId: number, signal?: AbortSignal) {
  return getJson<{ proposals: RuleProposalApi[] }>(
    `/rule-proposals?turnId=${turnId}`,
    signal ? { signal } : {},
  );
}

export function getRuleVotes(turnId: number, signal?: AbortSignal) {
  return getJson<RuleVotesApi>(
    `/rule-votes?turnId=${turnId}`,
    signal ? { signal } : {},
  );
}

export function getRuleEliminationVotes(turnId: number, signal?: AbortSignal) {
  return getJson<RuleVotesApi>(
    `/rule-elimination-votes?turnId=${turnId}`,
    signal ? { signal } : {},
  );
}

export function getRound(turnId: number, signal?: AbortSignal) {
  return getJson<{ round: RoundSummaryApi }>(
    `/rounds/${turnId}`,
    signal ? { signal } : {},
  );
}

export function getWinnerRecords(turnId: number, signal?: AbortSignal) {
  return getJson<{ winners: RoundSummaryApi["winners"] }>(
    `/winner-records?turnId=${turnId}`,
    signal ? { signal } : {},
  );
}

export function getPlayerClaims(wallet: string, signal?: AbortSignal) {
  return getJson<{ claims: PlayerClaimsApi }>(
    `/players/${wallet}/claims`,
    signal ? { signal } : {},
  );
}

export function getPlayerHistory(
  wallet: string,
  args: { cursor?: string | null; limit?: number; signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams();
  if (args.cursor) {
    params.set("cursor", args.cursor);
  }
  if (args.limit) {
    params.set("limit", String(args.limit));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return getJson<{ history: PlayerHistoryApi }>(
    `/players/${wallet}/history${suffix}`,
    args.signal ? { signal: args.signal } : {},
  );
}

export function getConversationDrafts(wallet: string, signal?: AbortSignal) {
  return getJson<{ drafts: ConversationDraftApi[] }>(
    `/players/${wallet}/conversation-drafts`,
    signal ? { signal } : {},
  );
}

export async function getGuessReceipt(
  turnId: number,
  player: string,
  signal?: AbortSignal,
): Promise<GuessReceiptApi | null> {
  const body = await getJson<{ receipt: GuessReceiptApi | null }>(
    `/guess-receipts?turnId=${turnId}&player=${player}`,
    { allow404: true, ...(signal ? { signal } : {}) },
  );
  return body?.receipt ?? null;
}

/* --------------------------- preflight / writes --------------------------- */

export interface RulePreflightApiResult {
  // The full RulePreflightResult shape lives in solana/idealerProgram.ts; the
  // create screen passes this straight into createProposeRuleInstruction.
  [key: string]: unknown;
  decision?: "INVALID" | "VALID";
  dealerMessage: string;
  needsClarification: boolean;
  normalizedText: string;
  ruleId: number;
  tokenCount: number;
}

export function postRulePreflight(text: string) {
  return postStrictJson<{ preflight: RulePreflightApiResult }>("/rule-preflight", {
    text,
  });
}

export function postRuleProposal(body: unknown) {
  return postJson<{ proposal: unknown }>("/rule-proposals", body);
}

export function postGuessReceipt(body: unknown) {
  return postJson<{ receipt: unknown }>("/guess-receipts", body);
}

export function postRuleVote(body: unknown) {
  return postJson<{ vote: unknown }>("/rule-votes", body);
}

export function postRuleEliminationVote(body: unknown) {
  return postJson<{ vote: unknown }>("/rule-elimination-votes", body);
}

export function postRuleRemoval(body: unknown) {
  return postStrictJson<{ removal: unknown }>("/rule-removals", body);
}

export function postClaimRequest(claimId: string, wallet: string) {
  return postJson<{ claim: unknown }>("/claim-records/request", {
    claimId,
    wallet,
  });
}

export function postClaimComplete(body: {
  claimId: string;
  signature?: string;
  status: "claimed" | "failed";
  wallet: string;
}) {
  return postJson<{ claim: unknown }>("/claim-records/complete", body);
}

export function postConversationDraft(
  wallet: string,
  body: Omit<ConversationDraftApi, "createdAt" | "draftId" | "updatedAt"> & {
    createdAt?: string;
    draftId?: string;
    updatedAt?: string;
  },
) {
  return postJson<{ draft: ConversationDraftApi }>(
    `/players/${wallet}/conversation-drafts`,
    body,
  );
}
