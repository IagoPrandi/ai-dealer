/**
 * The durable pointer to an in-flight rule preflight job.
 *
 * `conversationRunStore` keeps a run alive across screen unmounts, but it lives
 * in module memory and dies with the page. This survives a reload, a tab kill,
 * and coming back to the conversation later — which is the whole point of the
 * server-side job.
 *
 * A single slot, not a map: only one rule can be compiling at a time in this
 * UI, and one slot cannot leak unbounded entries.
 */
import { PREFLIGHT_JOB_TTL_MS } from "@tyche/constants";

const STORAGE_KEY = "tyche.preflightJob.v1";

export interface PersistedPreflightJob {
  cursor: null | string;
  draftId: string;
  jobId: string;
  phase: "compile" | "interpret";
  ruleText: string;
  startedAt: number;
  turnId: number;
  wallet: null | string;
}

type ReadableStorage = Pick<Storage, "getItem" | "removeItem" | "setItem">;

function isPersistedPreflightJob(
  value: unknown,
): value is PersistedPreflightJob {
  if (!value || typeof value !== "object") {
    return false;
  }
  const job = value as Partial<PersistedPreflightJob>;
  return (
    typeof job.jobId === "string" &&
    job.jobId.length > 0 &&
    typeof job.draftId === "string" &&
    job.draftId.length > 0 &&
    (job.phase === "compile" || job.phase === "interpret") &&
    typeof job.ruleText === "string" &&
    typeof job.startedAt === "number" &&
    Number.isFinite(job.startedAt) &&
    typeof job.turnId === "number" &&
    Number.isInteger(job.turnId) &&
    (job.cursor === null || typeof job.cursor === "string") &&
    (job.wallet === null || typeof job.wallet === "string")
  );
}

export function readPersistedPreflightJob(
  storage: null | ReadableStorage,
): null | PersistedPreflightJob {
  if (!storage) {
    return null;
  }
  let raw: null | string;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Never keep state we cannot read: a corrupt slot would block every future
    // resume attempt for this browser.
    clearPersistedPreflightJob(storage);
    return null;
  }
  if (!isPersistedPreflightJob(parsed)) {
    clearPersistedPreflightJob(storage);
    return null;
  }
  return parsed;
}

export function writePersistedPreflightJob(
  storage: null | ReadableStorage,
  job: PersistedPreflightJob,
) {
  if (!storage) {
    return;
  }
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(job));
  } catch {
    // A full or blocked storage only costs cross-reload resume, never the run.
  }
}

/** Clears the slot, or only the entry belonging to `draftId` when given. */
export function clearPersistedPreflightJob(
  storage: null | ReadableStorage,
  draftId?: null | string,
) {
  if (!storage) {
    return;
  }
  try {
    if (draftId) {
      const raw = storage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed: unknown = JSON.parse(raw);
        if (isPersistedPreflightJob(parsed) && parsed.draftId !== draftId) {
          return;
        }
      }
    }
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing useful to do; the TTL check below still rejects a stale slot.
  }
}

/**
 * Whether the server could still be holding this job. Uses the same TTL the API
 * enforces, so an expired pointer is dropped without a network round-trip.
 */
export function isPreflightJobFresh(
  job: PersistedPreflightJob,
  now: number,
  ttlMs: number = PREFLIGHT_JOB_TTL_MS,
) {
  const age = now - job.startedAt;
  return age >= 0 && age < ttlMs;
}

export function matchesPreflightJobScope(
  job: PersistedPreflightJob,
  scope: {
    draftId?: null | string;
    turnId: number;
    wallet: null | string | undefined;
  },
) {
  if (job.turnId !== scope.turnId) {
    return false;
  }
  if ((job.wallet ?? null) !== (scope.wallet ?? null)) {
    return false;
  }
  return !scope.draftId || job.draftId === scope.draftId;
}
