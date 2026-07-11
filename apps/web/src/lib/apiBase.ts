"use client";

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

// Served on the Next origin and forwarded by an App Router route. Keeps
// API calls same-origin so an HTTPS tunnel (used to install the PWA on a phone)
// works without mixed-content or CORS issues.
const LEGACY_SAME_ORIGIN_API_PROXY = "/__api";
const SAME_ORIGIN_API_PROXY = "/api/proxy";

function normalizeConfiguredApiBaseUrl(value: string) {
  const stripped = stripTrailingSlash(value);
  return stripped === LEGACY_SAME_ORIGIN_API_PROXY
    ? SAME_ORIGIN_API_PROXY
    : stripped;
}

export function getApiBaseUrl() {
  const configuredApiBaseUrl = process.env.NEXT_PUBLIC_IDEALER_API_URL?.trim();

  // Server-side rendering: reach the API directly over loopback.
  if (typeof window === "undefined") {
    return stripTrailingSlash(
      process.env.IDEALER_API_BASE_URL ?? "http://localhost:3002",
    );
  }

  // Explicit override (absolute URL or a same-origin proxy prefix like "/__api").
  if (configuredApiBaseUrl) {
    return normalizeConfiguredApiBaseUrl(configuredApiBaseUrl);
  }

  // Browser calls always go through Next's same-origin rewrite. This works from
  // localhost, LAN IPs, Docker, and HTTPS tunnels without CORS or mixed-content
  // failures.
  return SAME_ORIGIN_API_PROXY;
}
