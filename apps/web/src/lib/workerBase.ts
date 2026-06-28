"use client";

const CONFIGURED_WORKER_BASE_URL =
  process.env.NEXT_PUBLIC_IDEALER_WORKER_URL?.trim();

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

export function getWorkerBaseUrl() {
  if (CONFIGURED_WORKER_BASE_URL) {
    return stripTrailingSlash(CONFIGURED_WORKER_BASE_URL);
  }

  if (typeof window === "undefined") {
    return "http://localhost:3003";
  }

  const { hostname, protocol } = window.location;
  if (isPrivateDevelopmentHost(hostname)) {
    return `${protocol}//${hostname}:3003`;
  }

  throw new Error(
    "NEXT_PUBLIC_IDEALER_WORKER_URL must be set outside local development.",
  );
}
