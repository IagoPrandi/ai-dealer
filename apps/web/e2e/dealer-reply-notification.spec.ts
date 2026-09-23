import { expect, test } from "@playwright/test";

import { mockRulePreflight } from "./helpers/preflight";
import { mockShellData } from "./helpers/shell";

/**
 * A rule run outlives the player's attention: they send the message and switch
 * away. These specs pin the two halves of telling them it landed — the opt-in
 * row in Account, and the banner the finished run raises through the service
 * worker while the tab is hidden.
 *
 * Headless Chromium keeps `Notification.permission` at "denied" whatever the
 * context grants, and Playwright blocks the service worker, so both are stubbed
 * in the page. Everything between them is the app's own code.
 */

const ANSWER =
  "Got it - a guess wins only when its first number is 10 and its second is 12.";

type RaisedBanner = { body: string; title: string };

async function stubGrantedBrowser(
  page: import("@playwright/test").Page,
  options: { hidden?: boolean } = {},
) {
  await page.addInitScript((hidden) => {
    class StubNotification {
      static permission = "granted";
      static async requestPermission() {
        return "granted";
      }
    }
    Object.defineProperty(window, "Notification", {
      configurable: true,
      value: StubNotification,
    });
    if (hidden) {
      Object.defineProperty(document, "visibilityState", {
        configurable: true,
        get: () => "hidden",
      });
    }
    const raised: RaisedBanner[] = [];
    (window as unknown as { __raised: RaisedBanner[] }).__raised = raised;
    Object.defineProperty(navigator.serviceWorker, "ready", {
      configurable: true,
      get: async () => ({
        showNotification: (title: string, notification: { body: string }) => {
          raised.push({ body: notification.body, title });
        },
      }),
    });
  }, options.hidden ?? false);
}

function raisedBanners(page: import("@playwright/test").Page) {
  return page.evaluate(
    () => (window as unknown as { __raised: RaisedBanner[] }).__raised,
  );
}

test("the account row opts in and reports the browser's answer", async ({
  page,
}) => {
  await stubGrantedBrowser(page);
  await mockShellData(page);
  await page.goto("/play/account");

  const row = page.getByRole("button", { name: /Dealer replies/ });
  await expect(row).toBeVisible();
  await expect(row).toHaveAttribute("aria-pressed", "false");
  await expect(row).toContainText("Off");

  await row.click();
  await expect(row).toHaveAttribute("aria-pressed", "true");
  await expect(row).toContainText("pinged while you are away");

  // The opt-in survives a reload: it is the player's preference, not screen state.
  await page.reload();
  await expect(page.getByRole("button", { name: /Dealer replies/ })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("a browser that blocked notifications says so instead of looking off", async ({
  page,
}) => {
  await mockShellData(page);
  await page.goto("/play/account");

  await expect(page.getByRole("button", { name: /Dealer replies/ })).toContainText(
    "Blocked in your browser settings",
  );
});

test("a finished run raises one banner while the tab is hidden", async ({
  page,
}) => {
  await stubGrantedBrowser(page, { hidden: true });
  await page.addInitScript(() => {
    localStorage.setItem("tyche:dealer-notify", "on");
  });
  await mockShellData(page);
  await mockRulePreflight(page, (body) => ({
    json: {
      interpretation: {
        addedOperationalClauses: [],
        clarificationQuestions: [],
        clarityNote: "",
        dealerMessage: ANSWER,
        englishText: body.text,
        claimLedger: null,
        needsClarification: false,
        normalizedText: body.text,
        officialInterpretation: ANSWER,
        sanitizedText: body.text,
        suggestedRewrites: [],
        title: "Rule interpretation",
        tokenCount: 12,
      },
    },
    status: 200,
  }));

  await page.goto("/play/propose");
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      "A guess wins when its first number is 10 and its second number is 12.",
    );
  await page.getByRole("button", { name: "Send message" }).click();

  await expect
    .poll(async () => (await raisedBanners(page)).length, { timeout: 30_000 })
    .toBe(1);
  expect(await raisedBanners(page)).toEqual([
    { body: ANSWER, title: "The dealer replied" },
  ]);
});

test("no banner is raised while the player is watching the chat", async ({
  page,
}) => {
  await stubGrantedBrowser(page);
  await page.addInitScript(() => {
    localStorage.setItem("tyche:dealer-notify", "on");
  });
  await mockShellData(page);
  await mockRulePreflight(page, (body) => ({
    json: {
      interpretation: {
        addedOperationalClauses: [],
        clarificationQuestions: [],
        clarityNote: "",
        dealerMessage: ANSWER,
        englishText: body.text,
        claimLedger: null,
        needsClarification: false,
        normalizedText: body.text,
        officialInterpretation: ANSWER,
        sanitizedText: body.text,
        suggestedRewrites: [],
        title: "Rule interpretation",
        tokenCount: 12,
      },
    },
    status: 200,
  }));

  await page.goto("/play/propose");
  await page
    .getByLabel("Message", { exact: true })
    .fill(
      "A guess wins when its first number is 10 and its second number is 12.",
    );
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(
    page.getByRole("button", { name: "Confirm and generate" }),
  ).toBeVisible({ timeout: 30_000 });
  expect(await raisedBanners(page)).toEqual([]);
});
