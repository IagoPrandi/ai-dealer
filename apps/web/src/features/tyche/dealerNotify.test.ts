import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEALER_NOTIFY_STORAGE_KEY,
  DEALER_NOTIFY_URL,
  notifyDealerReply,
  readDealerNotifyState,
  setDealerNotifyEnabled,
  summarizeDealerReply,
  type DealerNotificationOptions,
  type DealerNotifyDeps,
  type DealerNotifyPermission,
} from "./dealerNotify.js";

function fakeStorage(initial: Record<string, string> = {}) {
  const items = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => items.get(key) ?? null,
    setItem: (key: string, value: string) => {
      items.set(key, value);
    },
    read: (key: string) => items.get(key) ?? null,
  };
}

function harness(options: {
  hidden?: boolean;
  permission?: DealerNotifyPermission;
  /** Permission the browser settles on once the prompt is answered. */
  prompted?: DealerNotifyPermission;
  stored?: Record<string, string>;
  supported?: boolean;
}) {
  const storage = fakeStorage(options.stored);
  const shown: { options: DealerNotificationOptions; title: string }[] = [];
  let permission = options.permission ?? "default";
  let prompts = 0;

  const deps: DealerNotifyDeps = {
    isHidden: () => options.hidden ?? true,
    permission: () => permission,
    readStorage: () => storage as unknown as Storage,
    requestPermission: async () => {
      prompts += 1;
      permission = options.prompted ?? permission;
      return permission;
    },
    showNotification: async (title, notification) => {
      shown.push({ options: notification, title });
    },
    supported: () => options.supported ?? true,
  };

  return { deps, promptCount: () => prompts, shown, storage };
}

test("the state stays off until the player opted in and the browser agreed", () => {
  assert.equal(readDealerNotifyState(harness({}).deps), "off");
  assert.equal(
    readDealerNotifyState(
      harness({
        permission: "granted",
        stored: { [DEALER_NOTIFY_STORAGE_KEY]: "on" },
      }).deps,
    ),
    "on",
  );
  // Opted in, but the permission was revoked in the browser afterwards.
  assert.equal(
    readDealerNotifyState(
      harness({
        permission: "denied",
        stored: { [DEALER_NOTIFY_STORAGE_KEY]: "on" },
      }).deps,
    ),
    "blocked",
  );
  assert.equal(
    readDealerNotifyState(harness({ supported: false }).deps),
    "unsupported",
  );
});

test("enabling prompts once and remembers the grant", async () => {
  const { deps, promptCount, storage } = harness({ prompted: "granted" });

  assert.equal(await setDealerNotifyEnabled(deps, true), "on");
  assert.equal(promptCount(), 1);
  assert.equal(storage.read(DEALER_NOTIFY_STORAGE_KEY), "on");

  // Already granted: no second prompt.
  assert.equal(await setDealerNotifyEnabled(deps, true), "on");
  assert.equal(promptCount(), 1);
});

test("a denied prompt reports blocked and is not remembered as on", async () => {
  const { deps, storage } = harness({ prompted: "denied" });

  assert.equal(await setDealerNotifyEnabled(deps, true), "blocked");
  assert.equal(storage.read(DEALER_NOTIFY_STORAGE_KEY), "off");
});

test("a dismissed prompt leaves the toggle off rather than claiming success", async () => {
  const { deps, storage } = harness({ prompted: "default" });

  assert.equal(await setDealerNotifyEnabled(deps, true), "off");
  assert.equal(storage.read(DEALER_NOTIFY_STORAGE_KEY), "off");
});

test("disabling clears the preference without touching the permission", async () => {
  const { deps, promptCount, storage } = harness({
    permission: "granted",
    stored: { [DEALER_NOTIFY_STORAGE_KEY]: "on" },
  });

  assert.equal(await setDealerNotifyEnabled(deps, false), "off");
  assert.equal(storage.read(DEALER_NOTIFY_STORAGE_KEY), "off");
  assert.equal(promptCount(), 0);
});

test("an unsupported browser never writes a preference", async () => {
  const { deps, storage } = harness({ supported: false });

  assert.equal(await setDealerNotifyEnabled(deps, true), "unsupported");
  assert.equal(storage.read(DEALER_NOTIFY_STORAGE_KEY), null);
});

test("the banner only fires when it is on and the player is away", async () => {
  const off = harness({ permission: "granted" });
  assert.equal(
    await notifyDealerReply(off.deps, { body: "Ready.", draftId: "d1" }),
    false,
  );

  const visible = harness({
    hidden: false,
    permission: "granted",
    stored: { [DEALER_NOTIFY_STORAGE_KEY]: "on" },
  });
  assert.equal(
    await notifyDealerReply(visible.deps, { body: "Ready.", draftId: "d1" }),
    false,
  );
  assert.equal(visible.shown.length, 0);

  const away = harness({
    permission: "granted",
    stored: { [DEALER_NOTIFY_STORAGE_KEY]: "on" },
  });
  assert.equal(
    await notifyDealerReply(away.deps, {
      body: "  Your rule\n  compiles.  ",
      draftId: "client:85:abc",
    }),
    true,
  );
  const [banner] = away.shown;
  assert.ok(banner);
  assert.equal(away.shown.length, 1);
  assert.equal(banner.title, "The dealer replied");
  assert.equal(banner.options.body, "Your rule compiles.");
  assert.equal(banner.options.data.url, DEALER_NOTIFY_URL);
  assert.equal(banner.options.tag, "tyche:dealer-reply:client:85:abc");
});

test("a failed run is announced as a failure, not as a reply", async () => {
  const { deps, shown } = harness({
    permission: "granted",
    stored: { [DEALER_NOTIFY_STORAGE_KEY]: "on" },
  });

  await notifyDealerReply(deps, {
    body: "The rule could not be compiled.",
    draftId: "d1",
    failed: true,
  });

  const [banner] = shown;
  assert.ok(banner);
  assert.equal(banner.title, "The dealer could not finish");
});

test("an empty body raises nothing", async () => {
  const { deps, shown } = harness({
    permission: "granted",
    stored: { [DEALER_NOTIFY_STORAGE_KEY]: "on" },
  });

  assert.equal(
    await notifyDealerReply(deps, { body: "   \n ", draftId: "d1" }),
    false,
  );
  assert.equal(shown.length, 0);
});

test("long replies are collapsed to one banner line", () => {
  const summary = summarizeDealerReply(`${"a".repeat(200)}\n\nmore`);

  assert.equal(summary.length, 140);
  assert.ok(summary.endsWith("…"));
  assert.equal(summarizeDealerReply("Short  reply\nhere"), "Short reply here");
});
