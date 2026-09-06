"use client";

import type { RulePreflightResult } from "../../solana/tycheProgram";
import {
  buildConversationDraftBody,
  type ConversationDraftBody,
} from "./conversationDraft";
import {
  ApiRequestError,
  askDealer,
  cancelRulePreflightJob,
  consumeRulePreflightJob,
  postConversationDraft,
  SseStreamDisconnectedError,
  SseStreamExpiredError,
  startRulePreflightJob,
  type ConsumeRulePreflightJobArgs,
  type DealerQuestionApiResult,
  type RuleInterpretationApiResult,
  type RulePreflightJobOutcome,
} from "./data/apiClient";
import type { ConversationMessage } from "./data/types";
import { describeTxError } from "./data/tx";
import {
  patchConversationRun,
  patchConversationRunJob,
  getConversationRun,
  rememberLatestConversationRun,
  upsertConversationRun,
  type ConversationRunJob,
} from "./conversationRunStore";
import {
  clearPersistedPreflightJob,
  writePersistedPreflightJob,
} from "./preflightJobStore";

type DraftResponse = {
  draft: {
    draftId: string;
  };
};

export interface ConversationRunDeps {
  askDealer: (args: {
    draftId: string;
    message: string;
    /** Called with answer text as the model writes it. */
    onDelta?: (chunk: string) => void;
    /** Called with the model's reasoning as it thinks, before the answer. */
    onReasoning?: (chunk: string) => void;
    signal?: AbortSignal;
  }) => Promise<DealerQuestionApiResult>;
  cancelPreflightJob: (jobId: string) => Promise<void>;
  consumePreflightJob: (
    args: ConsumeRulePreflightJobArgs,
  ) => Promise<RulePreflightJobOutcome>;
  describeError: (cause: unknown) => string;
  postDraft: (
    wallet: string,
    body: ConversationDraftBody,
    signal?: AbortSignal,
  ) => Promise<DraftResponse>;
  readStorage: () => null | Storage;
  startPreflightJob: (args: {
    approvedInterpretation?: RuleInterpretationApiResult;
    draftId?: null | string;
    phase: "compile" | "interpret";
    signal?: AbortSignal;
    text: string;
  }) => Promise<{ jobId: string }>;
}

export interface StartConversationRunArgs {
  /** Exact interpretation the player confirmed. Compile retries must reuse it. */
  approvedInterpretation?: RuleInterpretationApiResult;
  dealerQuestion?: null | string;
  draftId: string;
  initialMessages: ConversationMessage[];
  lastUserMessage: string;
  localDealerReply: null | string;
  phase: "compile" | "interpret";
  previousRule?: null | RulePreflightResult;
  refinedDraft: null | string;
  ruleText: string;
  turnId: number;
  wallet: null | string | undefined;
}

export interface ResumeConversationRunArgs {
  cursor: null | string;
  draftId: string;
  jobId: string;
  messages: ConversationMessage[];
  phase: "compile" | "interpret";
  ruleText: string;
  turnId: number;
  wallet: null | string | undefined;
}

const defaultDeps: ConversationRunDeps = {
  askDealer,
  cancelPreflightJob: cancelRulePreflightJob,
  consumePreflightJob: consumeRulePreflightJob,
  describeError: describeTxError,
  postDraft: postConversationDraft,
  readStorage: () =>
    typeof window === "undefined" ? null : window.localStorage,
  startPreflightJob: startRulePreflightJob,
};

const activeRuns = new Map<
  string,
  { controller: AbortController; task: Promise<void> }
>();

export function isConversationDraftSaveError(error: null | string) {
  return error?.toLowerCase().includes("could not be saved") ?? false;
}

function rethrowCancelledSave(signal: AbortSignal, cause: unknown) {
  if (signal.aborted) {
    throw cause;
  }
}

export async function saveConversationDraftSnapshot({
  deps = defaultDeps,
  draftId,
  lastMessage,
  messages,
  normalizedText,
  officialInterpretation,
  preflightJobId,
  prompt,
  ruleId,
  status,
  signal,
  turnId,
  wallet,
}: {
  deps?: ConversationRunDeps;
  draftId: null | string;
  lastMessage: string;
  messages: ConversationMessage[];
  normalizedText?: null | string;
  officialInterpretation?: null | string;
  preflightJobId?: null | string;
  prompt: string;
  ruleId?: null | number;
  status?: "draft" | "submitted";
  signal?: AbortSignal;
  turnId: number;
  wallet: null | string | undefined;
}) {
  if (!wallet) {
    return draftId;
  }

  const body = buildConversationDraftBody({
    draftId,
    lastMessage,
    messages,
    prompt,
    turnId,
    wallet,
    ...(normalizedText !== undefined ? { normalizedText } : {}),
    ...(officialInterpretation !== undefined ? { officialInterpretation } : {}),
    ...(preflightJobId !== undefined ? { preflightJobId } : {}),
    ...(ruleId !== undefined ? { ruleId } : {}),
    ...(status !== undefined ? { status } : {}),
  });
  if (!body) {
    return draftId;
  }

  const saved = await deps.postDraft(wallet, body, signal);
  rememberLatestConversationRun({
    draftId: saved.draft.draftId,
    turnId,
    wallet,
  });
  return saved.draft.draftId;
}

export function isConversationRunActive(draftId: string) {
  return activeRuns.has(draftId);
}

/**
 * Stops following a run and forgets its durable pointer. The server-side job is
 * untouched — this is "I am done with this", not "cancel the work".
 */
export function cancelConversationRun(
  draftId: null | string,
  deps: ConversationRunDeps = defaultDeps,
) {
  if (!draftId) {
    return;
  }
  const jobId = getConversationRun(draftId)?.job?.jobId;
  if (jobId) {
    void deps.cancelPreflightJob(jobId).catch((error: unknown) => {
      console.error(
        "Could not cancel the discarded rule preflight job",
        error instanceof Error ? error.name : "UnknownError",
      );
    });
  }
  const activeRun = activeRuns.get(draftId);
  activeRun?.controller.abort();
  // A follow-up may start in the same event turn. Release the slot now instead
  // of making it reuse the task we just aborted; the old task's identity check
  // in `finally` guarantees it cannot delete the replacement run later.
  if (activeRun && activeRuns.get(draftId) === activeRun) {
    activeRuns.delete(draftId);
  }
  clearPersistedPreflightJob(deps.readStorage(), draftId);
}

export const abandonConversationRun = cancelConversationRun;

export function startConversationRun(
  args: StartConversationRunArgs,
  deps: ConversationRunDeps = defaultDeps,
) {
  const existing = activeRuns.get(args.draftId);
  if (existing) {
    return existing.task;
  }

  rememberLatestConversationRun({
    draftId: args.draftId,
    turnId: args.turnId,
    wallet: args.wallet,
  });
  upsertConversationRun({
    connection: "closed",
    draftId: args.draftId,
    error: null,
    guidanceContext: null,
    interpretation: null,
    job: null,
    messages: args.initialMessages,
    progress: {
      message: args.dealerQuestion
        ? "Reviewing your question..."
        : args.phase === "interpret"
          ? "Reading your rule..."
          : "Building your rule...",
      stage: "checking_input",
    },
    rule: args.previousRule ?? null,
    status: "pending",
    streaming: false,
  });

  const controller = new AbortController();
  const task = runConversation(args, deps, controller.signal).finally(() => {
    if (activeRuns.get(args.draftId)?.task === task) {
      activeRuns.delete(args.draftId);
    }
  });
  activeRuns.set(args.draftId, { controller, task });
  return task;
}

/**
 * Reattaches to a job that outlived the page. Used on mount when a persisted
 * pointer or a draft record names a job we were waiting on.
 */
export function resumeConversationRun(
  args: ResumeConversationRunArgs,
  deps: ConversationRunDeps = defaultDeps,
) {
  const existing = activeRuns.get(args.draftId);
  if (existing) {
    // Same tab, screen just remounted: the store subscription already covers it.
    return existing.task;
  }

  rememberLatestConversationRun({
    draftId: args.draftId,
    turnId: args.turnId,
    wallet: args.wallet,
  });

  const job: ConversationRunJob = {
    cursor: args.cursor,
    jobId: args.jobId,
    phase: args.phase,
    ruleText: args.ruleText,
    startedAt: Date.now(),
    turnId: args.turnId,
  };
  // Must be an upsert: after a reload there is no snapshot for this draftId and
  // patchConversationRun silently no-ops on an unknown one, which would swallow
  // every progress and cursor update that follows.
  upsertConversationRun({
    connection: "reconnecting",
    draftId: args.draftId,
    error: null,
    guidanceContext: null,
    interpretation: null,
    job,
    messages: args.messages,
    progress: {
      message: "Reconnecting to the dealer...",
      stage: "checking_input",
    },
    rule: null,
    status: "pending",
  });

  const controller = new AbortController();
  const task = settlePreflightJob({
    deps,
    draftId: args.draftId,
    job,
    persistedDraftId: args.draftId,
    transcript: args.messages,
    turnId: args.turnId,
    wallet: args.wallet,
    signal: controller.signal,
  }).finally(() => {
    if (activeRuns.get(args.draftId)?.task === task) {
      activeRuns.delete(args.draftId);
    }
  });
  activeRuns.set(args.draftId, { controller, task });
  return task;
}

async function runConversation(
  args: StartConversationRunArgs,
  deps: ConversationRunDeps,
  signal: AbortSignal,
) {
  let draftId = args.draftId;
  let transcript = args.initialMessages;

  try {
    try {
      draftId =
        (await saveConversationDraftSnapshot({
          deps,
          draftId,
          lastMessage: args.lastUserMessage,
          messages: transcript,
          prompt: args.ruleText,
          signal,
          turnId: args.turnId,
          wallet: args.wallet,
        })) ?? draftId;
      patchConversationRun(args.draftId, {
        error: null,
        guidanceContext: null,
        interpretation: null,
        messages: transcript,
        progress: {
          message: args.dealerQuestion
            ? "Reviewing your question..."
            : args.phase === "interpret"
              ? "Reading your rule..."
              : "Building your rule...",
          stage: "checking_input",
        },
        rule: args.previousRule ?? null,
        status: "pending",
      });
    } catch (draftError) {
      rethrowCancelledSave(signal, draftError);
      patchConversationRun(args.draftId, {
        error: `Your message was sent, but the draft could not be saved. ${deps.describeError(draftError)}`,
        status: "pending",
      });
    }

    if (args.localDealerReply) {
      transcript = [...transcript, { text: args.localDealerReply, who: "ai" }];
      patchConversationRun(args.draftId, {
        error: null,
        guidanceContext: null,
        interpretation: null,
        messages: transcript,
        progress: null,
        rule: args.previousRule ?? null,
        status: "done",
      });
      try {
        await saveConversationDraftSnapshot({
          deps,
          draftId,
          lastMessage: args.localDealerReply,
          messages: transcript,
          prompt: args.ruleText,
          signal,
          turnId: args.turnId,
          wallet: args.wallet,
        });
      } catch (draftError) {
        rethrowCancelledSave(signal, draftError);
        patchConversationRun(args.draftId, {
          error: `Dealer replied, but the draft could not be saved. ${deps.describeError(draftError)}`,
          status: "error",
        });
      }
      return;
    }

    if (args.dealerQuestion) {
      // The answer streams: each delta grows the dealer bubble in place, so the
      // player reads it as it is written instead of waiting for the whole reply.
      // `streaming` tells the screen the last message is still arriving.
      const questionTranscript = transcript;
      let streamed = "";
      let reasoned = "";
      // One patch shape for both streams: reasoning lands ahead of the answer,
      // so the bubble exists (and shows the dealer thinking) before the first
      // answer character arrives.
      const patchStreamingMessage = () => {
        patchConversationRun(args.draftId, {
          error: null,
          messages: [
            ...questionTranscript,
            {
              ...(reasoned ? { reasoning: reasoned } : {}),
              text: streamed,
              who: "ai" as const,
            },
          ],
          progress: null,
          status: "pending",
          streaming: true,
        });
      };
      const dealerAnswer = await deps.askDealer({
        draftId,
        message: args.dealerQuestion,
        onDelta: (chunk) => {
          if (signal.aborted) {
            return;
          }
          streamed += chunk;
          patchStreamingMessage();
        },
        onReasoning: (chunk) => {
          if (signal.aborted) {
            return;
          }
          reasoned += chunk;
          patchStreamingMessage();
        },
        signal,
      });
      transcript = [
        ...transcript,
        {
          // The server's copy is authoritative — a reconnect or a non-streaming
          // transport still produces it — so the streamed accumulation is only
          // the fallback for a provider that streamed without repeating it.
          ...(dealerAnswer.reasoning || reasoned
            ? { reasoning: dealerAnswer.reasoning || reasoned }
            : {}),
          text: dealerAnswer.answer,
          who: "ai",
        },
      ];
      patchConversationRun(args.draftId, {
        connection: "closed",
        error: null,
        guidanceContext: dealerAnswer.proposedRuleText
          ? {
              dealerSuggestion: true,
              suggestedRewrites: [dealerAnswer.proposedRuleText],
            }
          : null,
        interpretation: null,
        job: null,
        messages: transcript,
        progress: null,
        rule: args.previousRule ?? null,
        status: "done",
        streaming: false,
      });
      try {
        await saveConversationDraftSnapshot({
          deps,
          draftId,
          lastMessage: dealerAnswer.answer,
          messages: transcript,
          prompt: args.ruleText,
          signal,
          turnId: args.turnId,
          wallet: args.wallet,
        });
      } catch (draftError) {
        rethrowCancelledSave(signal, draftError);
        patchConversationRun(args.draftId, {
          error: `Dealer replied, but the draft could not be saved. ${deps.describeError(draftError)}`,
          status: "error",
        });
      }
      return;
    }

    if (args.refinedDraft) {
      transcript = [
        ...transcript,
        {
          text: `I applied that to your previous draft: ${args.refinedDraft}`,
          who: "ai",
        },
      ];
      patchConversationRun(args.draftId, {
        guidanceContext: null,
        messages: transcript,
        status: "pending",
      });
    }

    const { jobId } = await deps.startPreflightJob({
      ...(args.approvedInterpretation
        ? { approvedInterpretation: args.approvedInterpretation }
        : {}),
      draftId,
      phase: args.phase,
      signal,
      text: args.ruleText,
    });
    const job: ConversationRunJob = {
      cursor: null,
      jobId,
      phase: args.phase,
      ruleText: args.ruleText,
      startedAt: Date.now(),
      turnId: args.turnId,
    };
    patchConversationRun(args.draftId, { connection: "live", job });
    writePersistedPreflightJob(deps.readStorage(), {
      ...job,
      // The pointer follows the draft record's id, not the client-minted one:
      // reopening from the conversation list only ever knows the server id.
      draftId,
      wallet: args.wallet ?? null,
    });
    // The durable half of the same pointer. localStorage only helps the browser
    // that started the run; the draft record is what lets the conversation list
    // show this run as still compiling and reattach to it from anywhere.
    try {
      await saveConversationDraftSnapshot({
        deps,
        draftId,
        lastMessage: args.lastUserMessage,
        messages: transcript,
        preflightJobId: jobId,
        prompt: args.ruleText,
        signal,
        turnId: args.turnId,
        wallet: args.wallet,
      });
    } catch (draftError) {
      rethrowCancelledSave(signal, draftError);
      patchConversationRun(args.draftId, {
        error: `Your rule is compiling, but the draft could not be saved, so reopening it later may not reconnect. ${deps.describeError(draftError)}`,
        status: "pending",
      });
    }

    await settlePreflightJob({
      deps,
      draftId: args.draftId,
      job,
      persistedDraftId: draftId,
      transcript,
      turnId: args.turnId,
      wallet: args.wallet,
      signal,
    });
    return;
  } catch (cause) {
    reportConversationRunFailure({
      cause,
      deps,
      draftId: args.draftId,
      ruleText: args.ruleText,
      signal,
      transcript,
    });
  }
}

/**
 * Follows a job to its result and lands the outcome. Shared by a fresh run and
 * by a resume, so both produce exactly the same UI states.
 */
async function settlePreflightJob(ctx: {
  deps: ConversationRunDeps;
  draftId: string;
  job: ConversationRunJob;
  /** The draft record id, which may differ from the store key. */
  persistedDraftId: string;
  transcript: ConversationMessage[];
  turnId: number;
  wallet: null | string | undefined;
  signal: AbortSignal;
}) {
  const { deps, draftId, job } = ctx;
  let transcript = ctx.transcript;
  let cursor = job.cursor;

  const persist = () => {
    writePersistedPreflightJob(deps.readStorage(), {
      ...job,
      cursor,
      draftId: ctx.persistedDraftId,
      wallet: ctx.wallet ?? null,
    });
  };

  try {
    const outcome = await deps.consumePreflightJob({
      cursor,
      jobId: job.jobId,
      onCursor: (next) => {
        cursor = next;
        patchConversationRunJob(draftId, { cursor: next });
        persist();
      },
      onOpen: () => patchConversationRun(draftId, { connection: "live" }),
      onProgress: (progress) =>
        patchConversationRun(draftId, { connection: "live", progress }),
      onReconnecting: () =>
        patchConversationRun(draftId, { connection: "reconnecting" }),
      signal: ctx.signal,
    });

    clearPersistedPreflightJob(deps.readStorage(), ctx.persistedDraftId);

    if ("interpretation" in outcome) {
      const { interpretation } = outcome;
      const dealerMessage =
        interpretation.dealerMessage ||
        "Here is how I understood your rule. Confirm it before I generate the executable rule.";
      transcript = [...transcript, { text: dealerMessage, who: "ai" }];
      patchConversationRun(draftId, {
        connection: "closed",
        error: null,
        guidanceContext: null,
        interpretation,
        job: null,
        messages: transcript,
        progress: null,
        rule: null,
        status: "done",
      });
      try {
        await saveConversationDraftSnapshot({
          deps,
          draftId: ctx.persistedDraftId,
          lastMessage: dealerMessage,
          messages: transcript,
          normalizedText: interpretation.normalizedText,
          officialInterpretation: interpretation.officialInterpretation,
          preflightJobId: null,
          prompt: interpretation.sanitizedText,
          signal: ctx.signal,
          turnId: ctx.turnId,
          wallet: ctx.wallet,
        });
      } catch (draftError) {
        rethrowCancelledSave(ctx.signal, draftError);
        patchConversationRun(draftId, {
          error: `Interpretation received, but the draft could not be saved. ${deps.describeError(draftError)}`,
          status: "error",
        });
      }
      return;
    }

    // RulePreflightApiResult is a narrower mirror of what the API actually
    // sends; the on-chain fields the Create screen needs ride along untyped.
    const preflight = outcome.preflight as unknown as RulePreflightResult;
    const valid =
      preflight.decision === "VALID" && !preflight.needsClarification;
    const dealerMessage =
      preflight.dealerMessage ||
      (valid
        ? "Done! I compiled your rule. Review it - if you like it, submit it to the round."
        : "Almost there! Try describing the win condition in a few clear words.");
    transcript = [...transcript, { text: dealerMessage, who: "ai" }];
    patchConversationRun(draftId, {
      connection: "closed",
      error: null,
      guidanceContext: null,
      interpretation: null,
      job: null,
      messages: transcript,
      progress: null,
      rule: preflight,
      status: "done",
    });

    try {
      await saveConversationDraftSnapshot({
        deps,
        draftId: ctx.persistedDraftId,
        lastMessage: dealerMessage,
        messages: transcript,
        normalizedText: preflight.normalizedText || null,
        officialInterpretation: preflight.officialInterpretation || null,
        preflightJobId: null,
        prompt: preflight.sanitizedText,
        signal: ctx.signal,
        ruleId: preflight.ruleId,
        status: "draft",
        turnId: ctx.turnId,
        wallet: ctx.wallet,
      });
    } catch (draftError) {
      rethrowCancelledSave(ctx.signal, draftError);
      patchConversationRun(draftId, {
        error: `Rule compiled, but the draft could not be saved. ${deps.describeError(draftError)}`,
        status: "error",
      });
    }
  } catch (cause) {
    reportConversationRunFailure({
      cause,
      deps,
      draftId,
      persistedDraftId: ctx.persistedDraftId,
      ruleText: job.ruleText,
      signal: ctx.signal,
      transcript,
    });
  }
}

function reportConversationRunFailure(ctx: {
  cause: unknown;
  deps: ConversationRunDeps;
  draftId: string;
  persistedDraftId?: string;
  ruleText: string;
  signal?: AbortSignal;
  transcript: ConversationMessage[];
}) {
  const { cause, deps, draftId, transcript } = ctx;

  if (ctx.signal?.aborted) {
    return;
  }

  // These two are checked before the ApiRequestError branch on purpose. An
  // expired job is an HTTP 404, and the blocked-rule branch below accepts any
  // 4xx — so modelling expiry as an ApiRequestError would tell the player their
  // rule asks the compiler to ignore the app rules.
  if (cause instanceof SseStreamExpiredError) {
    clearPersistedPreflightJob(
      deps.readStorage(),
      ctx.persistedDraftId ?? draftId,
    );
    patchConversationRun(draftId, {
      connection: "closed",
      error: null,
      guidanceContext: null,
      interpretation: null,
      job: null,
      messages: transcript,
      progress: null,
      rule: null,
      status: "expired",
    });
    return;
  }

  if (cause instanceof SseStreamDisconnectedError) {
    // The job is kept so the player can reconnect to work that may still be
    // running.
    patchConversationRun(draftId, {
      connection: "closed",
      error: null,
      guidanceContext: null,
      messages: transcript,
      progress: null,
      status: "disconnected",
    });
    return;
  }

  if (
    cause instanceof ApiRequestError &&
    cause.status < 500 &&
    cause.code !== "invalid_json" &&
    cause.code !== "invalid_rule_text"
  ) {
    const blockedMessage =
      cause.code === "RULE_PROMPT_INJECTION"
        ? "That is blocked because it asks the compiler to ignore or hide the app rules. Choose a clean measurable rule instead."
        : cause.code === "RULE_EXTERNAL_DEPENDENCY"
          ? "That is blocked because it depends on information outside this guess and draw. Choose a rewrite that only compares your guess with the official draw."
          : cause.message;
    clearPersistedPreflightJob(
      deps.readStorage(),
      ctx.persistedDraftId ?? draftId,
    );
    patchConversationRun(draftId, {
      connection: "closed",
      error: null,
      guidanceContext: {
        apiCode: cause.code,
        reasonSummary: cause.message,
        sanitizedText: ctx.ruleText,
      },
      interpretation: null,
      job: null,
      messages: [...transcript, { text: blockedMessage, who: "ai" }],
      progress: null,
      rule: null,
      status: "done",
    });
    return;
  }

  clearPersistedPreflightJob(
    deps.readStorage(),
    ctx.persistedDraftId ?? draftId,
  );
  patchConversationRun(draftId, {
    connection: "closed",
    error: deps.describeError(cause),
    guidanceContext: null,
    interpretation: null,
    job: null,
    messages: [
      ...transcript,
      {
        text: "Dealer engine unavailable. The compiler must be online before I can lock a rule.",
        who: "ai",
      },
    ],
    progress: null,
    rule: null,
    status: "error",
  });
}
