const DEFAULT_API_PROXY_TARGET = "http://localhost:3002";
const DEFAULT_API_PROXY_TIMEOUT_MS = 300_000;

type EnvLike = Record<string, string | undefined>;

function cleanEnvValue(value: string | undefined): string {
  return (value ?? "").replace(/\s+#.*$/u, "").trim();
}

export function getApiProxyTarget(env: EnvLike = process.env) {
  const target = cleanEnvValue(env.TYCHE_API_PROXY_TARGET);
  if (!target && cleanEnvValue(env.VERCEL_ENV) === "production") {
    throw new Error("TYCHE_API_PROXY_TARGET is required in production.");
  }
  return (target || DEFAULT_API_PROXY_TARGET).replace(/\/+$/u, "");
}

export function getApiProxyTimeoutMs(env: EnvLike = process.env) {
  const raw = Number(cleanEnvValue(env.TYCHE_API_PROXY_TIMEOUT_MS));
  return Number.isFinite(raw) && raw > 0
    ? raw
    : DEFAULT_API_PROXY_TIMEOUT_MS;
}

export function buildApiProxyUrl(args: {
  env?: EnvLike;
  path: string[];
  search: string;
}) {
  const encodedPath = args.path
    .map((segment) => encodeURIComponent(segment))
    .join("/");
  const suffix = encodedPath ? `/${encodedPath}` : "";
  return `${getApiProxyTarget(args.env)}${suffix}${args.search}`;
}

export function getForwardedApiHeaders(requestHeaders: Headers) {
  const headers = new Headers();
  // `last-event-id` carries the replay position of a reconnecting stream
  // reader; dropping it would silently restart every resumed rule preflight.
  for (const name of [
    "accept",
    "authorization",
    "content-type",
    "last-event-id",
  ]) {
    const value = requestHeaders.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return headers;
}

/**
 * Streamed responses send headers immediately and rely on their own
 * server-side deadlines. Applying the whole-request proxy timeout to the body
 * would cut a live rule run off mid-pipeline.
 */
export function isStreamingProxyRequest(requestHeaders: Headers) {
  const accept = requestHeaders.get("accept")?.toLowerCase() ?? "";
  return (
    accept.includes("application/x-ndjson") ||
    accept.includes("text/event-stream")
  );
}

export function describeProxyFetchError(error: unknown) {
  if (!(error instanceof Error)) {
    return String(error);
  }
  const cause =
    "cause" in error && error.cause instanceof Error
      ? `: ${error.cause.message}`
      : "";
  return `${error.message}${cause}`;
}

export function getProxiedResponseHeaders(upstreamHeaders: Headers) {
  const headers = new Headers();
  const contentType = upstreamHeaders.get("content-type");
  if (contentType) {
    headers.set("content-type", contentType);
  }
  const cacheControl = upstreamHeaders.get("cache-control");
  if (cacheControl) {
    headers.set("cache-control", cacheControl);
  }
  if (contentType?.toLowerCase().includes("text/event-stream")) {
    // Defeat response buffering and any transforming cache in front of Next.
    // `connection` is deliberately not set: it is hop-by-hop and undici rejects
    // it.
    headers.set("cache-control", "no-cache, no-transform");
    headers.set("x-accel-buffering", "no");
  }
  return headers;
}
