"use client";

/**
 * Opt-in browser notification for the moment the dealer stops writing.
 *
 * A rule run can take a while, so players routinely switch tabs or lock the
 * phone while the dealer works. This module is the whole permission/preference
 * side of telling them the reply landed; `dealerReplyNotifier.ts` is what
 * watches the runs and calls in here.
 *
 * The banner is raised through the service-worker registration rather than
 * `new Notification(...)`: Android Chrome throws `Illegal constructor` for that
 * call on any page inside a service worker's scope, and this app is mobile
 * first. The same registration owns the `notificationclick` handler in
 * `public/sw.js`, which is what brings the player back to the chat.
 */

/** Internal codename prefix, matching the app's other browser-storage keys. */
export const DEALER_NOTIFY_STORAGE_KEY = "tyche:dealer-notify";

/** One banner per draft: a newer reply replaces the older one instead of stacking. */
export const DEALER_NOTIFY_TAG_PREFIX = "tyche:dealer-reply:";

/** Where `notificationclick` sends the player back to. */
export const DEALER_NOTIFY_URL = "/play/propose";

const NOTIFY_BODY_MAX = 140;

export type DealerNotifyPermission = "default" | "denied" | "granted";

export type DealerNotifyState =
  /** The browser refuses notifications for this origin; only its settings can undo it. */
  | "blocked"
  | "off"
  | "on"
  /** No Notification API, no service worker, or an insecure origin. */
  | "unsupported";

export interface DealerNotificationOptions {
  body: string;
  data: { url: string };
  icon: string;
  tag: string;
}

export interface DealerNotifyDeps {
  /** True while the player is looking at another tab or has the screen off. */
  isHidden: () => boolean;
  permission: () => DealerNotifyPermission;
  readStorage: () => null | Storage;
  requestPermission: () => Promise<DealerNotifyPermission>;
  showNotification: (
    title: string,
    options: DealerNotificationOptions,
  ) => Promise<void>;
  supported: () => boolean;
}

export const browserDealerNotifyDeps: DealerNotifyDeps = {
  isHidden: () => document.visibilityState === "hidden",
  permission: () => Notification.permission as DealerNotifyPermission,
  readStorage: () =>
    typeof window === "undefined" ? null : window.localStorage,
  requestPermission: async () =>
    (await Notification.requestPermission()) as DealerNotifyPermission,
  showNotification: async (title, options) => {
    const registration = await navigator.serviceWorker.ready;
    await registration.showNotification(title, options);
  },
  supported: () =>
    typeof window !== "undefined" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    window.isSecureContext,
};

function readPreference(deps: DealerNotifyDeps) {
  return deps.readStorage()?.getItem(DEALER_NOTIFY_STORAGE_KEY) === "on";
}

function writePreference(deps: DealerNotifyDeps, enabled: boolean) {
  deps.readStorage()?.setItem(DEALER_NOTIFY_STORAGE_KEY, enabled ? "on" : "off");
}

function stateFor(deps: DealerNotifyDeps, enabled: boolean): DealerNotifyState {
  if (!deps.supported()) {
    return "unsupported";
  }
  if (deps.permission() === "denied") {
    return "blocked";
  }
  return enabled && deps.permission() === "granted" ? "on" : "off";
}

export function readDealerNotifyState(
  deps: DealerNotifyDeps = browserDealerNotifyDeps,
): DealerNotifyState {
  if (!deps.supported()) {
    return "unsupported";
  }
  return stateFor(deps, readPreference(deps));
}

/**
 * Turns the preference on or off. Must be called from a user gesture: browsers
 * only honour `requestPermission()` inside one.
 */
export async function setDealerNotifyEnabled(
  deps: DealerNotifyDeps,
  enabled: boolean,
): Promise<DealerNotifyState> {
  if (!deps.supported()) {
    return "unsupported";
  }
  if (!enabled) {
    writePreference(deps, false);
    return stateFor(deps, false);
  }
  if (deps.permission() === "default") {
    await deps.requestPermission();
  }
  // A prompt the player dismissed leaves the permission at "default": remember
  // the intent so the next gesture re-asks instead of silently doing nothing.
  const granted = deps.permission() === "granted";
  writePreference(deps, granted);
  return stateFor(deps, granted);
}

/** Collapses a streamed reply into one banner-sized line. */
export function summarizeDealerReply(text: string) {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > NOTIFY_BODY_MAX
    ? `${collapsed.slice(0, NOTIFY_BODY_MAX - 1).trimEnd()}…`
    : collapsed;
}

/**
 * Raises the banner, unless the player is already looking at the app — the
 * reply is on screen in that case and a duplicate notification is just noise.
 * Returns whether a banner was actually shown.
 */
export async function notifyDealerReply(
  deps: DealerNotifyDeps,
  args: { body: string; draftId: string; failed?: boolean },
): Promise<boolean> {
  if (readDealerNotifyState(deps) !== "on" || !deps.isHidden()) {
    return false;
  }
  const body = summarizeDealerReply(args.body);
  if (!body) {
    return false;
  }
  await deps.showNotification(
    args.failed ? "The dealer could not finish" : "The dealer replied",
    {
      body,
      data: { url: DEALER_NOTIFY_URL },
      icon: "/icons/icon-192.png",
      tag: `${DEALER_NOTIFY_TAG_PREFIX}${args.draftId}`,
    },
  );
  return true;
}
