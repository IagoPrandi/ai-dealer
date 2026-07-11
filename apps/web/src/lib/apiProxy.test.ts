import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildApiProxyUrl,
  getApiProxyTarget,
  getApiProxyTimeoutMs,
  getForwardedApiHeaders,
  getProxiedResponseHeaders,
} from "./apiProxy.js";

test("api proxy defaults to the local API target", () => {
  assert.equal(getApiProxyTarget({}), "http://localhost:3002");
});

test("api proxy strips trailing slashes from configured target", () => {
  assert.equal(
    getApiProxyTarget({ IDEALER_API_PROXY_TARGET: "http://api.local:3002///" }),
    "http://api.local:3002",
  );
});

test("api proxy builds encoded upstream URLs with query strings", () => {
  assert.equal(
    buildApiProxyUrl({
      env: { IDEALER_API_PROXY_TARGET: "http://api.local:3002" },
      path: ["players", "wallet/with/slash"],
      search: "?limit=10",
    }),
    "http://api.local:3002/players/wallet%2Fwith%2Fslash?limit=10",
  );
});

test("api proxy timeout defaults high enough for local rule compilation", () => {
  assert.equal(getApiProxyTimeoutMs({}), 300_000);
  assert.equal(getApiProxyTimeoutMs({ IDEALER_API_PROXY_TIMEOUT_MS: "90000" }), 90_000);
  assert.equal(getApiProxyTimeoutMs({ IDEALER_API_PROXY_TIMEOUT_MS: "nope" }), 300_000);
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
