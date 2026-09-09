import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import vm from "node:vm";

type NotificationClickEvent = {
  notification: {
    close: () => void;
    data?: { url?: string } | undefined;
  };
  waitUntil: (task: Promise<unknown>) => void;
};

type WindowClient = { focus: () => Promise<void>; url: string };

function loadNotificationClickHandler(windows: WindowClient[]) {
  const handlers = new Map<string, (event: NotificationClickEvent) => void>();
  const opened: string[] = [];
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
        handler: (event: NotificationClickEvent) => void,
      ) => {
        handlers.set(eventName, handler);
      },
      clients: {
        claim: async () => undefined,
        matchAll: async () => windows,
        openWindow: async (url: string) => {
          opened.push(url);
        },
      },
      location: {
        origin: "https://tyche.example",
      },
      skipWaiting: () => undefined,
    },
  });

  const handler = handlers.get("notificationclick");
  assert.ok(handler, "the service worker must register a notificationclick handler");
  return { handler, opened };
}

async function dispatchClick(
  windows: WindowClient[],
  data?: { url?: string } | undefined,
) {
  const { handler, opened } = loadNotificationClickHandler(windows);
  const tasks: Promise<unknown>[] = [];
  let closed = false;

  handler({
    notification: {
      close: () => {
        closed = true;
      },
      data,
    },
    waitUntil: (task) => tasks.push(task),
  });
  await Promise.all(tasks);

  return { closed, opened };
}

test("clicking a dealer notification focuses the tab that already holds the chat", async () => {
  const focused: string[] = [];
  const result = await dispatchClick(
    [
      {
        focus: async () => {
          focused.push("https://tyche.example/play/pick");
        },
        url: "https://tyche.example/play/pick",
      },
    ],
    { url: "/play/propose" },
  );

  assert.deepEqual(focused, ["https://tyche.example/play/pick"]);
  assert.deepEqual(result.opened, []);
  assert.equal(result.closed, true);
});

test("clicking a dealer notification with no open tab opens the chat", async () => {
  const result = await dispatchClick([], { url: "/play/propose" });

  assert.deepEqual(result.opened, ["/play/propose"]);
});

test("a notification from another origin's tab does not hijack that tab", async () => {
  const result = await dispatchClick(
    [{ focus: async () => undefined, url: "https://example.com/" }],
    { url: "/play/propose" },
  );

  assert.deepEqual(result.opened, ["/play/propose"]);
});

test("a notification without a target is dismissed without navigating", async () => {
  const result = await dispatchClick([]);

  assert.deepEqual(result.opened, []);
  assert.equal(result.closed, true);
});
