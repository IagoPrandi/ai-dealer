"use client";

const CONFIGURED_API_BASE_URL = process.env.NEXT_PUBLIC_IDEALER_API_URL?.trim();

function stripTrailingSlash(value: string) {
  return value.replace(/\/+$/, "");
}

function isPrivateDevelopmentHost(hostname: string) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") {
    return true;
  }
  if (hostname.startsWith("192.168.") || hostname.startsWith("10.")) {
    return true;
  }

  const match = /^172\.(\d{1,2})\./.exec(hostname);
  return Boolean(match && Number(match[1]) >= 16 && Number(match[1]) <= 31);
}

// Served on the Next origin and rewritten to the API by next.config.ts. Keeps
// API calls same-origin so an HTTPS tunnel (used to install the PWA on a phone)
// works without mixed-content or CORS issues.
const SAME_ORIGIN_API_PROXY = "/__api";

export function getApiBaseUrl() {
  // Server-side rendering: reach the API directly over loopback.
  if (typeof window === "undefined") {
    return stripTrailingSlash(
      process.env.IDEALER_API_BASE_URL ?? "http://localhost:3002",
    );
  }

  // Explicit override (absolute URL or a same-origin proxy prefix like "/__api").
  if (CONFIGURED_API_BASE_URL) {
    return stripTrailingSlash(CONFIGURED_API_BASE_URL);
  }

  const { hostname, protocol } = window.location;
  if (isPrivateDevelopmentHost(hostname)) {
    return `${protocol}//${hostname}:3002`;
  }

  // Public origin (e.g. a Cloudflare tunnel): go through the same-origin proxy.
  return SAME_ORIGIN_API_PROXY;
}
