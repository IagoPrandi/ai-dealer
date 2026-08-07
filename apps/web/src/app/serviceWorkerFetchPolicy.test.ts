import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

type FetchEvent = {
  request: {
    headers: Headers;
    method: string;
    url: string;
  };
  respondWith: (response: Promise<unknown>) => void;
};

function loadFetchHandler() {
  const handlers = new Map<string, (event: FetchEvent) => void>();
  const serviceWorkerSource = readFileSync(
    new URL("../../public/sw.js", import.meta.url),
    "utf8",
  );

  vm.runInNewContext(serviceWorkerSource, {
    URL,
    fetch: async () => new Response(),
    self: {
      addEventListener: (
        eventName: string,
        handler: (event: FetchEvent) => void,
      ) => {
        handlers.set(eventName, handler);
      },
      clients: {
        claim: async () => undefined,
      },
      location: {
        origin: "https://tyche.example",
      },
      skipWaiting: () => undefined,
    },
  });

  const fetchHandler = handlers.get("fetch");
  assert.ok(fetchHandler, "the service worker must register a fetch handler");
  return fetchHandler;
}

function dispatchFetch(
  method: string,
  url: string,
  headers: Record<string, string> = {},
) {
  const responses: Promise<unknown>[] = [];
  loadFetchHandler()({
    request: { headers: new Headers(headers), method, url },
    respondWith: (response) => responses.push(response),
  });
  return responses;
}

test("the service worker handles same-origin GET requests", () => {
  assert.equal(dispatchFetch("GET", "https://tyche.example/play").length, 1);
});

test("the service worker leaves cross-origin loopback requests to the document", () => {
  assert.equal(dispatchFetch("GET", "http://localhost/").length, 0);
});

test("the service worker ignores non-GET requests", () => {
  assert.equal(dispatchFetch("POST", "https://tyche.example/api").length, 0);
});

test("the service worker leaves server-sent event streams to the network", () => {
  assert.equal(
    dispatchFetch(
      "GET",
      "https://tyche.example/api/proxy/rule-preflight/jobs/abc/events",
      { accept: "text/event-stream" },
    ).length,
    0,
  );
});
