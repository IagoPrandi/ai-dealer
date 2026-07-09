"use client";

// Served on the Next origin and rewritten to the worker by next.config.ts. Keeps
// worker calls same-origin so an HTTPS tunnel (used to install the PWA on a
// phone) works without mixed-content or CORS issues. Mirrors the API proxy.
const SAME_ORIGIN_WORKER_PROXY = "/__worker";

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

export function getWorkerBaseUrl() {
  const configuredWorkerBaseUrl =
    process.env.NEXT_PUBLIC_IDEALER_WORKER_URL?.trim();

  // Server-side rendering: reach the worker directly over loopback.
  if (typeof window === "undefined") {
    return stripTrailingSlash(
      process.env.IDEALER_WORKER_BASE_URL ?? "http://localhost:3003",
    );
  }

  // Explicit override (absolute URL or a same-origin proxy prefix like
  // "/__worker").
  if (configuredWorkerBaseUrl) {
    return stripTrailingSlash(configuredWorkerBaseUrl);
  }

  return SAME_ORIGIN_WORKER_PROXY;
}
