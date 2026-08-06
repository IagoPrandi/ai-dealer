import assert from "node:assert/strict";
import { test } from "node:test";

import { getWorkerBaseUrl } from "./workerBase.js";

function withEnv(
  updates: Record<string, string | undefined>,
  run: () => void,
) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(updates)) {
    previous.set(key, process.env[key]);
    const value = updates[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    run();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function withBrowserLocation(
  location: { hostname: string; protocol: string },
  run: () => void,
) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { location },
  });

  try {
    run();
  } finally {
    if (previous) {
      Object.defineProperty(globalThis, "window", previous);
    } else {
      delete (globalThis as { window?: unknown }).window;
    }
  }
}

test("worker base defaults browser calls to the same-origin proxy", () => {
  withEnv({ NEXT_PUBLIC_TYCHE_WORKER_URL: undefined }, () => {
    withBrowserLocation({ hostname: "localhost", protocol: "http:" }, () => {
      assert.equal(getWorkerBaseUrl(), "/__worker");
    });
  });
});

test("worker base honors explicit browser override and strips trailing slash", () => {
  withEnv(
    { NEXT_PUBLIC_TYCHE_WORKER_URL: "http://localhost:3003///" },
    () => {
      withBrowserLocation({ hostname: "localhost", protocol: "http:" }, () => {
        assert.equal(getWorkerBaseUrl(), "http://localhost:3003");
      });
    },
  );
});

test("worker base uses direct loopback URL during server-side execution", () => {
  withEnv(
    {
      TYCHE_WORKER_BASE_URL: undefined,
      NEXT_PUBLIC_TYCHE_WORKER_URL: undefined,
    },
    () => {
      assert.equal(getWorkerBaseUrl(), "http://localhost:3003");
    },
  );
});

test("worker base honors explicit server-side worker URL", () => {
  withEnv({ TYCHE_WORKER_BASE_URL: "http://worker.internal:3003/" }, () => {
    assert.equal(getWorkerBaseUrl(), "http://worker.internal:3003");
  });
});
