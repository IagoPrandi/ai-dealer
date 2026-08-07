import type { NextRequest } from "next/server";

import {
  buildApiProxyUrl,
  describeProxyFetchError,
  getApiProxyTimeoutMs,
  getForwardedApiHeaders,
  getProxiedResponseHeaders,
  isStreamingProxyRequest,
} from "../../../../lib/apiProxy";

export const dynamic = "force-dynamic";

type ApiProxyContext = {
  params: Promise<{ path?: string[] }>;
};

async function resolvePath(context: ApiProxyContext) {
  const params = await context.params;
  return params.path ?? [];
}

async function proxyApiRequest(request: NextRequest, context: ApiProxyContext) {
  const path = await resolvePath(context);
  const target = buildApiProxyUrl({
    path,
    search: request.nextUrl.search,
  });
  const timeoutMs = getApiProxyTimeoutMs();
  const streaming = isStreamingProxyRequest(request.headers);
  const init: RequestInit = {
    cache: "no-store",
    headers: getForwardedApiHeaders(request.headers),
    method: request.method,
    // A streamed preflight sends headers immediately and has its own per-model
    // timeouts in the API. Applying the ordinary whole-request proxy timeout to
    // its body would recreate the HTTP 504 while useful progress is arriving.
    // Following the client's own signal instead also releases the upstream
    // socket when the tab closes, which the previous timeout-less branch leaked.
    signal: streaming ? request.signal : AbortSignal.timeout(timeoutMs),
  };
  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  let upstream: Response;
  try {
    upstream = await fetch(target, init);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    return Response.json(
      {
        error: timedOut ? "API_PROXY_TIMEOUT" : "API_PROXY_UNAVAILABLE",
        message: timedOut
          ? `The API did not respond within ${timeoutMs}ms.`
          : `The API proxy could not reach the backend. ${describeProxyFetchError(error)}`,
      },
      { status: timedOut ? 504 : 502 },
    );
  }

  return new Response(upstream.body, {
    headers: getProxiedResponseHeaders(upstream.headers),
    status: upstream.status,
    statusText: upstream.statusText,
  });
}

export function GET(request: NextRequest, context: ApiProxyContext) {
  return proxyApiRequest(request, context);
}

export function POST(request: NextRequest, context: ApiProxyContext) {
  return proxyApiRequest(request, context);
}

export function PUT(request: NextRequest, context: ApiProxyContext) {
  return proxyApiRequest(request, context);
}

export function PATCH(request: NextRequest, context: ApiProxyContext) {
  return proxyApiRequest(request, context);
}

export function DELETE(request: NextRequest, context: ApiProxyContext) {
  return proxyApiRequest(request, context);
}

export function OPTIONS(request: NextRequest, context: ApiProxyContext) {
  return proxyApiRequest(request, context);
}
