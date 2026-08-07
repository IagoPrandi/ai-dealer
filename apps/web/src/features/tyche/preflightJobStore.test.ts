import assert from "node:assert/strict";
import { test } from "node:test";
import { PREFLIGHT_JOB_TTL_MS } from "@tyche/constants";

import {
  clearPersistedPreflightJob,
  isPreflightJobFresh,
  matchesPreflightJobScope,
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

test("freshness uses the same window the API enforces", () => {
  const started = 10_000;
  const pointer = job({ startedAt: started });

  assert.equal(isPreflightJobFresh(pointer, started), true);
  assert.equal(
    isPreflightJobFresh(pointer, started + PREFLIGHT_JOB_TTL_MS - 1),
    true,
  );
  assert.equal(
    isPreflightJobFresh(pointer, started + PREFLIGHT_JOB_TTL_MS),
    false,
  );
  // A clock that moved backwards is not a fresh job either.
  assert.equal(isPreflightJobFresh(pointer, started - 1), false);
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
