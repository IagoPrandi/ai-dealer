"use client";

/**
 * How a reopened conversation decides what it is looking at.
 *
 * Two pointers can name the same in-flight preflight job - the draft record's
 * `preflightJobId` and the `localStorage` slot - and they disagree in normal
 * use: the local one is missing after a reload in another browser, the draft
 * one is missing while an anonymous run is in flight. Keeping the reconciliation
 * here rather than inside the Create screen's effect makes it testable, which
 * matters: a wrong answer silently drops a run that is still producing a result.
 */
import type { ConversationDraftApi, ConversationMessage } from "./data/types";
import type { PersistedPreflightJob } from "./preflightJobStore";

/** A job a reopened conversation can still attach to, from either pointer. */
export interface ReattachableJob {
  /**
   * Replay position, and only ever the local pointer's - a cursor belongs to
   * one job's sequence space, so carrying it across to a different job id would
   * silently skip that job's events.
   */
  cursor: null | string;
  jobId: string;
  phase: "compile" | "interpret";
  ruleText: string;
  /** When the pointer was written, which is what the TTL is measured from. */
  stampedAt: number;
}

/**
 * The draft record's pointer wins over the local one: it is written by whichever
 * browser started the run, so it is the only one that is right after a reload in
 * a different tab. The local pointer is the fallback, and the only source of a
 * cursor and of the phase.
 */
export function resolveReattachableJob(
  draft: ConversationDraftApi | undefined,
  pointer: null | PersistedPreflightJob,
): null | ReattachableJob {
  if (draft?.preflightJobId) {
    const local = pointer?.jobId === draft.preflightJobId ? pointer : null;
    return {
      cursor: local?.cursor ?? null,
      jobId: draft.preflightJobId,
      // Without the local pointer the phase is unknown: the draft records which
      // job is running, not which leg of the chain it is. `interpret` is the
      // same default "Run again" already falls back to, and the phase only
      // steers a rerun - the outcome is read from the terminal event's type.
      phase: local?.phase ?? "interpret",
      ruleText: local?.ruleText ?? draft.prompt,
      stampedAt: Date.parse(draft.updatedAt),
    };
  }
  if (pointer) {
    return {
      cursor: pointer.cursor,
      jobId: pointer.jobId,
      phase: pointer.phase,
      ruleText: pointer.ruleText,
      stampedAt: pointer.startedAt,
    };
  }
  return null;
}

/**
 * The transcript a resumed conversation opens with. The saved draft is the only
 * complete copy; the pointer knows a single message, which is all an anonymous
 * run ever has.
 */
export function buildResumeTranscript(
  draft: ConversationDraftApi | undefined,
  pointer: null | PersistedPreflightJob,
): ConversationMessage[] {
  if (draft?.messages && draft.messages.length > 0) {
    return draft.messages;
  }
  if (draft) {
    // Older drafts predate transcript persistence - reconstruct from the stored
    // summary so the conversation still reads coherently.
    return [
      { text: draft.prompt, who: "user" },
      ...(draft.lastMessage ? [{ text: draft.lastMessage, who: "ai" as const }] : []),
    ];
  }
  return pointer ? [{ text: pointer.ruleText, who: "user" }] : [];
}
