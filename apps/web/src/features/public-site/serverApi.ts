import "server-only";

import { cache } from "react";

export class PublicApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "PublicApiError";
  }
}

export function getPublicApiBaseUrl(env = process.env) {
  const configured = env.TYCHE_API_PROXY_TARGET?.trim().replace(/\/+$/u, "");
  if (configured) {
    return configured;
  }
  if (env.VERCEL_ENV === "production") {
    throw new Error("TYCHE_API_PROXY_TARGET is required in production.");
  }
  return "http://localhost:3002";
}

export const getPublicApiJson = cache(async <T>(path: string): Promise<T> => {
  const response = await fetch(`${getPublicApiBaseUrl()}${path}`, {
    next: { revalidate: 15 },
  });
  if (!response.ok) {
    throw new PublicApiError(`Public API returned HTTP ${response.status}.`, response.status);
  }
  return (await response.json()) as T;
});
