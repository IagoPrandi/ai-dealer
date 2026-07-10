import assert from "node:assert/strict";
import { test } from "node:test";

import { getApiBaseUrl } from "./apiBase.js";

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

test("api base defaults browser calls to the same-origin proxy", () => {
  withEnv({ NEXT_PUBLIC_IDEALER_API_URL: undefined }, () => {
    withBrowserLocation({ hostname: "localhost", protocol: "http:" }, () => {
      assert.equal(getApiBaseUrl(), "/__api");
    });
  });
});

test("api base uses the same-origin proxy from public HTTPS origins", () => {
  withEnv({ NEXT_PUBLIC_IDEALER_API_URL: undefined }, () => {
    withBrowserLocation(
      { hostname: "example.trycloudflare.com", protocol: "https:" },
      () => {
        assert.equal(getApiBaseUrl(), "/__api");
      },
    );
  });
});

test("api base honors explicit browser override and strips trailing slash", () => {
  withEnv({ NEXT_PUBLIC_IDEALER_API_URL: "http://localhost:3002///" }, () => {
    withBrowserLocation({ hostname: "localhost", protocol: "http:" }, () => {
      assert.equal(getApiBaseUrl(), "http://localhost:3002");
    });
  });
});

test("api base uses direct loopback URL during server-side execution", () => {
  withEnv(
    {
      IDEALER_API_BASE_URL: undefined,
      NEXT_PUBLIC_IDEALER_API_URL: undefined,
    },
    () => {
      assert.equal(getApiBaseUrl(), "http://localhost:3002");
    },
  );
});

test("api base honors explicit server-side API URL", () => {
  withEnv({ IDEALER_API_BASE_URL: "http://api.internal:3002/" }, () => {
    assert.equal(getApiBaseUrl(), "http://api.internal:3002");
  });
});
