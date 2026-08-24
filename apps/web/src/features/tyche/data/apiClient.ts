/**
 * Thin typed wrappers over the Tyche HTTP API (apps/api, default :3002).
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
  TokenomicsPublicApi,
  TokenomicsWalletApi,
} from "./types";
import { createSseParser, readSseStream, type SseFrame } from "./sseStream";
import { getApiBaseUrl } from "../../../lib/apiBase";

export { SseStreamDisconnectedError, SseStreamExpiredError } from "./sseStream";

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
    cache: "no-store",
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

async function postJson<T>(
  path: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
    ...(signal ? { signal } : {}),
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

async function postStrictJson<T>(
  path: string,
  body: unknown,
  extraHeaders: Record<string, string> = {},
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", ...extraHeaders },
    method: "POST",
    ...(signal ? { signal } : {}),
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

export function getRound(
  turnId: number,
  options: { activeTurnId?: number; signal?: AbortSignal } = {},
) {
  const params = new URLSearchParams();
  if (options.activeTurnId !== undefined) {
    params.set("activeTurnId", String(options.activeTurnId));
  }
  const suffix = params.toString() ? `?${params.toString()}` : "";
  return getJson<{ round: RoundSummaryApi }>(
    `/rounds/${turnId}${suffix}`,
    options.signal ? { signal: options.signal } : {},
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

export function getPublicTokenomics(signal?: AbortSignal) {
  return getJson<{ tokenomics: TokenomicsPublicApi }>(
    "/tokenomics/public",
    signal ? { signal } : {},
  );
}

export function getWalletTokenomics(wallet: string, signal?: AbortSignal) {
  return getJson<{ wallet: TokenomicsWalletApi }>(
    `/tokenomics/wallets/${wallet}`,
    { allow404: true, ...(signal ? { signal } : {}) },
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

export function getConversationDrafts(
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
  return getJson<{
    cursor: string | null;
    drafts: ConversationDraftApi[];
    limit: number;
    nextCursor: string | null;
  }>(
    `/players/${wallet}/conversation-drafts${suffix}`,
    args.signal ? { signal: args.signal } : {},
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

export async function getGuessReceipts(
  turnId: number,
  player: string,
  signal?: AbortSignal,
): Promise<GuessReceiptApi[]> {
  const body = await getJson<{ receipts: GuessReceiptApi[] }>(
    `/guess-receipts?turnId=${turnId}&player=${player}`,
    { allow404: true, ...(signal ? { signal } : {}) },
  );
  if (!body) {
    return [];
  }
  if (!Array.isArray(body.receipts)) {
    throw new Error("Guess receipt response is missing the receipts list.");
  }
  return body.receipts;
}

/* --------------------------- preflight / writes --------------------------- */

export interface RulePreflightApiResult {
  // The full RulePreflightResult shape lives in solana/tycheProgram.ts; the
  // create screen passes this straight into createProposeRuleInstruction.
  [key: string]: unknown;
  confirmationRequired: boolean;
  coverage: {
    missingFromAst: number[];
    // The compiler owns this vocabulary and it grows (it gained `position`).
    // The web only forwards the list, so mirroring the literal union here bought
    // nothing and silently went stale — a member the gate enforces would be
    // rejected by a type that had not been updated.
    missingOperations: string[];
  } | null;
  decision?: "INVALID" | "VALID";
  dealerMessage: string;
  generationRetryable?: boolean;
  needsClarification: boolean;
  normalizedText: string;
  reasonCodes: string[];
  ruleId: number;
  tokenCount: number;
}

export interface RuleInterpretationApiResult {
  addedOperationalClauses: string[];
  clarificationQuestions: string[];
  clarityNote: string;
  dealerMessage: string;
  englishText: string;
  guardianChecked: boolean;
  needsClarification: boolean;
  normalizedText: string;
  officialInterpretation: string;
  sanitizedText: string;
  suggestedRewrites: string[];
  title: string;
  tokenCount: number;
}

export type RulePreflightProgressStage =
  | "checking_input"
  | "loading_models"
  | "checking_safety"
  | "translating"
  | "interpreting"
  | "compiling"
  | "checking_fidelity"
  | "escalating"
  | "reviewing_impact";

export interface RulePreflightProgress {
  message: string;
  model?: string;
  stage: RulePreflightProgressStage;
}

type RulePreflightStreamEvent =
  | { progress: RulePreflightProgress; type: "progress" }
  | { preflight: RulePreflightApiResult; type: "result" }
  | { interpretation: RuleInterpretationApiResult; type: "interpretation" }
  | { error?: string; message?: string; status?: number; type: "error" };

function throwRulePreflightStreamError(
  event: Extract<RulePreflightStreamEvent, { type: "error" }>,
) {
  throw new ApiRequestError({
    code: event.error ?? null,
    detail: event,
    message: event.message ?? "The rule preflight stream ended with an error.",
    status: event.status ?? 502,
  });
}

export type RulePreflightPhase = "compile" | "interpret";

export function rulePreflightJobEventsPath(jobId: string) {
  return `/rule-preflight/jobs/${encodeURIComponent(jobId)}/events`;
}

export async function cancelRulePreflightJob(jobId: string) {
  const path = `/rule-preflight/jobs/${encodeURIComponent(jobId)}`;
  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    cache: "no-store",
    method: "DELETE",
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`DELETE ${path} returned HTTP ${response.status}.`);
  }
}

/**
 * Starts a rule preflight run and returns as soon as the API has accepted it.
 * The pipeline then belongs to the server, not to this request — a synchronous
 * rejection (prompt injection, token limit) still arrives here as an
 * ApiRequestError, so the caller's blocked-rule handling is unchanged.
 */
export function startRulePreflightJob(args: {
  approvedInterpretation?: RuleInterpretationApiResult;
  draftId?: null | string;
  phase: RulePreflightPhase;
  signal?: AbortSignal;
  text: string;
}) {
  return postStrictJson<{
    idempotent: boolean;
    jobId: string;
    phase: RulePreflightPhase;
    status: string;
  }>(
    "/rule-preflight",
    {
      ...(args.approvedInterpretation
        ? { approvedInterpretation: args.approvedInterpretation }
        : {}),
      ...(args.draftId ? { draftId: args.draftId } : {}),
      phase: args.phase,
      text: args.text,
    },
    { accept: "text/event-stream" },
    args.signal,
  );
}

export interface DealerQuestionApiResult {
  answer: string;
  proposedRuleText: string | null;
}

/**
 * Asks the dealer a conversational question and reports the answer as the model
 * writes it. The reply is a one-shot SSE stream: `delta` frames carry answer
 * text, and exactly one `answer` or `error` frame ends it.
 *
 * Unlike the preflight stream this one never reconnects — there is no job to
 * reattach to, so a retry would re-run the model and replay text the player has
 * already read. A drop is reported as the failure it is.
 */
export async function askDealer(args: {
  draftId: string;
  fetchImpl?: typeof fetch;
  message: string;
  onDelta?: (chunk: string) => void;
  signal?: AbortSignal;
}): Promise<DealerQuestionApiResult> {
  const path = "/rule-dealer/ask";
  const fetchImpl = args.fetchImpl ?? fetch;
  const response = await fetchImpl(`${getApiBaseUrl()}${path}`, {
    body: JSON.stringify({ draftId: args.draftId, message: args.message }),
    cache: "no-store",
    headers: {
      accept: "text/event-stream",
      "content-type": "application/json",
    },
    method: "POST",
    ...(args.signal ? { signal: args.signal } : {}),
  });

  if (!response.ok) {
    // Rejections happen before the stream opens, so they are still plain JSON.
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
  if (!response.body) {
    throw new Error(`POST ${path} returned no readable body.`);
  }

  let answer: DealerQuestionApiResult | null = null;
  let failure: null | Record<string, unknown> = null;
  const parser = createSseParser();
  const decoder = new TextDecoder();
  const reader = response.body.getReader();

  const handle = (frames: readonly SseFrame[]) => {
    for (const frame of frames) {
      if (frame.event === "delta") {
        const { text } = JSON.parse(frame.data) as { text?: unknown };
        if (typeof text === "string" && text) {
          args.onDelta?.(text);
        }
        continue;
      }
      if (frame.event === "answer") {
        answer = JSON.parse(frame.data) as DealerQuestionApiResult;
        return true;
      }
      if (frame.event === "error") {
        failure = JSON.parse(frame.data) as Record<string, unknown>;
        return true;
      }
    }
    return false;
  };

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (handle(parser.push(decoder.decode(value, { stream: !done })))) {
        break;
      }
      if (done) {
        handle(parser.end());
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  if (failure) {
    const body = failure as { error?: unknown; status?: unknown };
    throw new ApiRequestError({
      code: apiErrorCode(failure),
      detail: failure,
      message: apiErrorMessage(
        path,
        typeof body.status === "number" ? body.status : 502,
        failure,
      ),
      status: typeof body.status === "number" ? body.status : 502,
    });
  }
  if (!answer) {
    throw new Error(
      `POST ${path} ended before the dealer answer was complete.`,
    );
  }
  return answer;
}

export interface ConsumeRulePreflightJobArgs {
  cursor?: null | string;
  fetchImpl?: typeof fetch;
  jobId: string;
  onCursor?: (cursor: string) => void;
  onOpen?: () => void;
  onProgress?: (progress: RulePreflightProgress) => void;
  onReconnecting?: (attempt: number) => void;
  signal?: AbortSignal;
  sleep?: (ms: number) => Promise<void>;
}

export type RulePreflightJobOutcome =
  | { interpretation: RuleInterpretationApiResult }
  | { preflight: RulePreflightApiResult };

/**
 * Follows a preflight job to its result, reconnecting and replaying from the
 * last event id whenever the connection drops.
 */
export async function consumeRulePreflightJob(
  args: ConsumeRulePreflightJobArgs,
): Promise<RulePreflightJobOutcome> {
  let outcome: null | RulePreflightJobOutcome = null;
  let streamError: unknown = null;

  await readSseStream({
    cursor: args.cursor ?? null,
    ...(args.fetchImpl ? { fetchImpl: args.fetchImpl } : {}),
    onFrame: (frame) => {
      if (frame.id) {
        args.onCursor?.(frame.id);
      }
      if (frame.event === "reset" || frame.event === "done") {
        return "continue";
      }
      const event = JSON.parse(frame.data) as RulePreflightStreamEvent;
      if (event.type === "progress") {
        args.onProgress?.(event.progress);
        return "continue";
      }
      if (event.type === "result") {
        outcome = { preflight: event.preflight };
        return "stop";
      }
      if (event.type === "interpretation") {
        outcome = { interpretation: event.interpretation };
        return "stop";
      }
      if (event.type === "error") {
        // Captured rather than thrown from inside the reader, which would look
        // like a dropped connection and trigger a pointless reconnect.
        try {
          throwRulePreflightStreamError(event);
        } catch (cause) {
          streamError = cause;
        }
        return "stop";
      }
      return "continue";
    },
    ...(args.onOpen ? { onOpen: args.onOpen } : {}),
    ...(args.onReconnecting ? { onReconnecting: args.onReconnecting } : {}),
    ...(args.signal ? { signal: args.signal } : {}),
    ...(args.sleep ? { sleep: args.sleep } : {}),
    url: `${getApiBaseUrl()}${rulePreflightJobEventsPath(args.jobId)}`,
  });

  if (streamError) {
    throw streamError;
  }
  if (!outcome) {
    throw new Error("The rule preflight job ended before returning a result.");
  }
  return outcome;
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
  return postStrictJson<{ claim: unknown }>("/claim-records/request", {
    claimId,
    wallet,
  });
}

export function postClaimComplete(body: {
  claimId: string;
  failureReason?: string;
  signature?: string;
  status: "claimed" | "failed";
  wallet: string;
}) {
  return postStrictJson<{ claim: unknown }>("/claim-records/complete", body);
}

export function postConversationDraft(
  wallet: string,
  body: Omit<ConversationDraftApi, "createdAt" | "draftId" | "updatedAt"> & {
    createdAt?: string;
    draftId?: string;
    updatedAt?: string;
  },
  signal?: AbortSignal,
) {
  return postJson<{ draft: ConversationDraftApi }>(
    `/players/${wallet}/conversation-drafts`,
    body,
    signal,
  );
}
