import assert from "node:assert/strict";
import { test } from "node:test";
import { PREFLIGHT_JOB_TTL_MS } from "@tyche/constants";

import {
  clearPersistedPreflightJob,
  isPreflightJobFresh,
  isPreflightJobPointerFresh,
  matchesPreflightJobScope,
  PREFLIGHT_JOB_POINTER_TTL_MS,
  readPersistedPreflightJob,
  writePersistedPreflightJob,
  type PersistedPreflightJob,
} from "./preflightJobStore.js";

const STORAGE_KEY = "tyche.preflightJob.v1";

function fakeStorage(seed?: string) {
  const entries = new Map<string, string>();
  if (seed !== undefined) {
    entries.set(STORAGE_KEY, seed);
  }
  return {
    entries,
    storage: {
      getItem: (key: string) => entries.get(key) ?? null,
      removeItem: (key: string) => {
        entries.delete(key);
      },
      setItem: (key: string, value: string) => {
        entries.set(key, value);
      },
    } as unknown as Storage,
  };
}

function job(overrides: Partial<PersistedPreflightJob> = {}) {
  return {
    cursor: null,
    draftId: "draft-1",
    jobId: "job-1",
    phase: "interpret",
    ruleText: "Win if all six numbers are even.",
    startedAt: 1_000,
    turnId: 12,
    wallet: "wallet-1",
    ...overrides,
  } satisfies PersistedPreflightJob;
}

test("a persisted preflight job round-trips", () => {
  const { storage } = fakeStorage();

  writePersistedPreflightJob(storage, job({ cursor: "5" }));

  assert.deepEqual(readPersistedPreflightJob(storage), job({ cursor: "5" }));
});

test("a corrupt slot is dropped rather than kept", () => {
  const { entries, storage } = fakeStorage("{not json");

  assert.equal(readPersistedPreflightJob(storage), null);
  // Left in place, it would block every future resume for this browser.
  assert.equal(entries.has(STORAGE_KEY), false);
});

test("a slot missing required fields is dropped", () => {
  const { entries, storage } = fakeStorage(JSON.stringify({ jobId: "job-1" }));

  assert.equal(readPersistedPreflightJob(storage), null);
  assert.equal(entries.has(STORAGE_KEY), false);
});

test("reading without storage is tolerated for server rendering", () => {
  assert.equal(readPersistedPreflightJob(null), null);
  writePersistedPreflightJob(null, job());
  clearPersistedPreflightJob(null);
});

test("clearing only removes the slot when the draft matches", () => {
  const { entries, storage } = fakeStorage();
  writePersistedPreflightJob(storage, job());

  clearPersistedPreflightJob(storage, "another-draft");
  assert.equal(entries.has(STORAGE_KEY), true);

  clearPersistedPreflightJob(storage, "draft-1");
  assert.equal(entries.has(STORAGE_KEY), false);
});

test("clearing without a draft id removes whatever is there", () => {
  const { entries, storage } = fakeStorage();
  writePersistedPreflightJob(storage, job());

  clearPersistedPreflightJob(storage);

  assert.equal(entries.has(STORAGE_KEY), false);
});

test("freshness covers the whole life the API gives a job", () => {
  const started = 10_000;
  const pointer = job({ startedAt: started });

  assert.equal(isPreflightJobFresh(pointer, started), true);
  // The window is measured from the start of the run, but the API only starts
  // counting its terminal TTL when the run finishes - and a run may take the
  // full PREFLIGHT_JOB_RUNNING_TTL_MS to get there. Counting only the terminal
  // TTL from `startedAt` threw away the pointer of a nine-minute preflight
  // minutes before the API stopped answering for it.
  assert.equal(
    isPreflightJobFresh(pointer, started + PREFLIGHT_JOB_TTL_MS + 1),
    true,
  );
  assert.equal(
    isPreflightJobFresh(pointer, started + PREFLIGHT_JOB_POINTER_TTL_MS - 1),
    true,
  );
  assert.equal(
    isPreflightJobFresh(pointer, started + PREFLIGHT_JOB_POINTER_TTL_MS),
    false,
  );
  // A clock that moved backwards is not a fresh job either.
  assert.equal(isPreflightJobFresh(pointer, started - 1), false);
});

test("the pointer freshness rule is shared with the draft record's stamp", () => {
  // The conversation list has no PersistedPreflightJob to hand - only the
  // draft's `updatedAt` - and must reach the same verdict, or the compiling
  // badge and the reattach disagree about the same job.
  const stamped = 10_000;

  assert.equal(isPreflightJobPointerFresh(stamped, stamped), true);
  assert.equal(
    isPreflightJobPointerFresh(stamped, stamped + PREFLIGHT_JOB_POINTER_TTL_MS - 1),
    true,
  );
  assert.equal(
    isPreflightJobPointerFresh(stamped, stamped + PREFLIGHT_JOB_POINTER_TTL_MS),
    false,
  );
  // `Date.parse` of a missing timestamp is NaN, which must not read as fresh.
  assert.equal(isPreflightJobPointerFresh(Number.NaN, stamped), false);
});

test("scope matching keeps a job from leaking across turns or wallets", () => {
  const pointer = job();

  assert.equal(
    matchesPreflightJobScope(pointer, { turnId: 12, wallet: "wallet-1" }),
    true,
  );
  assert.equal(
    matchesPreflightJobScope(pointer, { turnId: 13, wallet: "wallet-1" }),
    false,
  );
  assert.equal(
    matchesPreflightJobScope(pointer, { turnId: 12, wallet: "wallet-2" }),
    false,
  );
  assert.equal(
    matchesPreflightJobScope(pointer, {
      draftId: "draft-2",
      turnId: 12,
      wallet: "wallet-1",
    }),
    false,
  );
});

test("an anonymous job matches an anonymous scope", () => {
  const pointer = job({ wallet: null });

  assert.equal(
    matchesPreflightJobScope(pointer, { turnId: 12, wallet: undefined }),
    true,
  );
  assert.equal(
    matchesPreflightJobScope(pointer, { turnId: 12, wallet: "wallet-1" }),
    false,
  );
});
