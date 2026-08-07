self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") {
    return;
  }

  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin !== self.location.origin) {
    // Chrome must receive MWA loopback requests directly from the document
    // so it can display the Local Network Access permission prompt.
    return;
  }

  const accept = event.request.headers.get("accept") || "";
  if (accept.includes("text/event-stream")) {
    // Server-sent events must reach the network untouched: a service-worker hop
    // can buffer the stream, and a worker restart would kill a live rule run.
    return;
  }

  event.respondWith(fetch(event.request));
});
