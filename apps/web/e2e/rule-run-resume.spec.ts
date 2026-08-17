import { expect, test } from "@playwright/test";

import { sseBody } from "./helpers/preflight";
import { mockShellData } from "./helpers/shell";

/**
 * The rule pipeline outlives the connection that started it. These specs drive
 * the three ways that connection can end: a mid-run drop, a page reload, and a
 * job the server no longer holds.
 */

const RULE_TEXT = "Win if at least 4 guessed numbers appear in the draw, regardless of order.";
const JOB_ID = "e2e-resume-job";

function interpretationFrame(id: number) {
  return {
    data: {
      interpretation: {
        addedOperationalClauses: [],
        clarificationQuestions: [],
        clarityNote: "",
        dealerMessage: "This is how I understand your rule.",
        englishText: RULE_TEXT,
        guardianChecked: false,
        needsClarification: false,
        normalizedText: RULE_TEXT,
        officialInterpretation:
          "The engine compares only the player's guess and the official draw.",
        sanitizedText: RULE_TEXT,
        suggestedRewrites: [],
        title: "Rule interpretation",
        tokenCount: 12,
      },
      type: "interpretation",
    },
    event: "interpretation",
    id,
  };
}

function progressFrame(id: number) {
  return {
    data: {
      progress: {
        message: "Interpreting your winning condition...",
        stage: "interpreting",
      },
      type: "progress",
    },
    event: "progress",
    id,
  };
}

test("a dropped stream resumes from its cursor and still delivers the result", async ({
  page,
}) => {
  await mockShellData(page);
  await page.route("**/rule-preflight", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { idempotent: false, jobId: JOB_ID, phase: "interpret", status: "running" },
      status: 202,
    });
  });

  const cursors: (null | string)[] = [];
  const lastEventIds: (null | string)[] = [];
  let attempts = 0;
  await page.route(`**/rule-preflight/jobs/${JOB_ID}/events**`, async (route) => {
    attempts += 1;
    const url = new URL(route.request().url());
    cursors.push(url.searchParams.get("cursor"));
    lastEventIds.push(route.request().headers()["last-event-id"] ?? null);

    if (attempts === 1) {
      // Progress, then the body ends with no terminal frame: the mid-run drop.
      await route.fulfill({
        body: sseBody([progressFrame(1)]),
        contentType: "text/event-stream",
        status: 200,
      });
      return;
    }
    await route.fulfill({
      body: sseBody([interpretationFrame(2)]),
      contentType: "text/event-stream",
      status: 200,
    });
  });

  await page.goto("/play/propose");
  await page.getByLabel("Message", { exact: true }).fill(RULE_TEXT);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByRole("button", { name: "Confirm and generate" })).toBeVisible();

  expect(attempts).toBe(2);
  // The replay position travelled both ways, so the server never replays events
  // the player already saw.
  expect(cursors[1]).toBe("1");
  expect(lastEventIds[1]).toBe("1");
});

test("a reload reattaches to the job the page left running", async ({ page }) => {
  await mockShellData(page);
  await page.route("**/rule-preflight", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { idempotent: false, jobId: JOB_ID, phase: "interpret", status: "running" },
      status: 202,
    });
  });

  let attempts = 0;
  let releaseFirstAttempt!: () => void;
  const firstAttemptHeld = new Promise<void>((resolve) => {
    releaseFirstAttempt = resolve;
  });

  await page.route(`**/rule-preflight/jobs/${JOB_ID}/events**`, async (route) => {
    attempts += 1;
    if (attempts === 1) {
      // Hold the first connection open so the run is genuinely still in flight
      // when the page goes away.
      await firstAttemptHeld;
      await route.abort("connectionaborted").catch(() => undefined);
      return;
    }
    await route.fulfill({
      body: sseBody([progressFrame(1), interpretationFrame(2)]),
      contentType: "text/event-stream",
      status: 200,
    });
  });

  await page.goto("/play/propose");
  await page.getByLabel("Message", { exact: true }).fill(RULE_TEXT);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect.poll(() => attempts).toBe(1);

  // A fresh page keeps no in-memory run at all; only the persisted pointer can
  // bring the conversation back.
  await page.reload();
  releaseFirstAttempt();

  await expect(page.getByRole("button", { name: "Confirm and generate" })).toBeVisible();
  expect(attempts).toBeGreaterThanOrEqual(2);
});

test("an expired job offers a rerun and is never mistaken for a blocked rule", async ({
  page,
}) => {
  await mockShellData(page);
  await page.route("**/rule-preflight", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { idempotent: false, jobId: JOB_ID, phase: "interpret", status: "running" },
      status: 202,
    });
  });
  await page.route(`**/rule-preflight/jobs/${JOB_ID}/events**`, async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: { error: "rule_preflight_job_not_found" },
      status: 404,
    });
  });

  await page.goto("/play/propose");
  await page.getByLabel("Message", { exact: true }).fill(RULE_TEXT);
  await page.getByRole("button", { name: "Send message" }).click();

  await expect(page.getByText("This run expired")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run again" })).toBeVisible();

  // The regression that matters: a 404 must not travel the blocked-rule path.
  await expect(page.getByRole("heading", { name: "Fix this blocked rule?" })).toHaveCount(0);
  await expect(page.getByText("Dealer engine unavailable")).toHaveCount(0);
});
