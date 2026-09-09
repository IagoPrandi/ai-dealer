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

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const target = event.notification.data && event.notification.data.url;
  if (!target) {
    return;
  }

  event.waitUntil(
    (async () => {
      // Reuse the tab the player already has open: the conversation lives in
      // it, and opening a second window would start the chat from scratch.
      const windows = await self.clients.matchAll({
        includeUncontrolled: true,
        type: "window",
      });
      const existing = windows.find(
        (client) => new URL(client.url).origin === self.location.origin,
      );
      if (existing) {
        await existing.focus();
        return;
      }
      await self.clients.openWindow(target);
    })(),
  );
});
