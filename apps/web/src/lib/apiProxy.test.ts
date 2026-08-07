import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildApiProxyUrl,
  getApiProxyTarget,
  getApiProxyTimeoutMs,
  getForwardedApiHeaders,
  getProxiedResponseHeaders,
  isStreamingProxyRequest,
} from "./apiProxy.js";

test("api proxy defaults to the local API target", () => {
  assert.equal(getApiProxyTarget({}), "http://localhost:3002");
});

test("api proxy strips trailing slashes from configured target", () => {
  assert.equal(
    getApiProxyTarget({ TYCHE_API_PROXY_TARGET: "http://api.local:3002///" }),
    "http://api.local:3002",
  );
});

test("api proxy builds encoded upstream URLs with query strings", () => {
  assert.equal(
    buildApiProxyUrl({
      env: { TYCHE_API_PROXY_TARGET: "http://api.local:3002" },
      path: ["players", "wallet/with/slash"],
      search: "?limit=10",
    }),
    "http://api.local:3002/players/wallet%2Fwith%2Fslash?limit=10",
  );
});

test("api proxy timeout defaults high enough for local rule compilation", () => {
  assert.equal(getApiProxyTimeoutMs({}), 300_000);
  assert.equal(getApiProxyTimeoutMs({ TYCHE_API_PROXY_TIMEOUT_MS: "90000" }), 90_000);
  assert.equal(getApiProxyTimeoutMs({ TYCHE_API_PROXY_TIMEOUT_MS: "nope" }), 300_000);
});

test("api proxy drops hop-by-hop request headers", () => {
  const headers = getForwardedApiHeaders(
    new Headers({
      accept: "application/json",
      authorization: "Bearer token",
      connection: "keep-alive",
      "content-length": "10",
      "content-type": "application/json",
      host: "localhost:3000",
    }),
  );

  assert.equal(headers.get("accept"), "application/json");
  assert.equal(headers.get("authorization"), "Bearer token");
  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.has("connection"), false);
  assert.equal(headers.has("content-length"), false);
  assert.equal(headers.has("host"), false);
});

test("api proxy preserves response content metadata", () => {
  const headers = getProxiedResponseHeaders(
    new Headers({
      "cache-control": "no-store",
      "content-length": "10",
      "content-type": "application/json",
      "transfer-encoding": "chunked",
    }),
  );

  assert.equal(headers.get("content-type"), "application/json");
  assert.equal(headers.get("cache-control"), "no-store");
  assert.equal(headers.has("content-length"), false);
  assert.equal(headers.has("transfer-encoding"), false);
});

test("api proxy forwards the stream resume position", () => {
  const headers = getForwardedApiHeaders(
    new Headers({
      accept: "text/event-stream",
      "last-event-id": "12",
    }),
  );

  assert.equal(headers.get("last-event-id"), "12");
});

test("api proxy recognises both streaming transports", () => {
  const streaming = (accept?: string) =>
    isStreamingProxyRequest(new Headers(accept ? { accept } : {}));

  assert.equal(streaming("text/event-stream"), true);
  assert.equal(streaming("application/x-ndjson"), true);
  assert.equal(streaming("TEXT/EVENT-STREAM"), true);
  assert.equal(streaming("application/json"), false);
  assert.equal(streaming(), false);
});

test("api proxy defeats buffering on server-sent event responses", () => {
  const headers = getProxiedResponseHeaders(
    new Headers({
      "cache-control": "no-cache, no-store, no-transform",
      "content-type": "text/event-stream; charset=utf-8",
    }),
  );

  assert.equal(headers.get("content-type"), "text/event-stream; charset=utf-8");
  assert.equal(headers.get("cache-control"), "no-cache, no-transform");
  assert.equal(headers.get("x-accel-buffering"), "no");
});

test("api proxy leaves ordinary JSON responses untouched", () => {
  const headers = getProxiedResponseHeaders(
    new Headers({
      "cache-control": "no-store",
      "content-type": "application/json",
    }),
  );

  assert.equal(headers.has("x-accel-buffering"), false);
  assert.equal(headers.get("cache-control"), "no-store");
});
