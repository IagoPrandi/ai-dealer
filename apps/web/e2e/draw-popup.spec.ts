import { expect, test, type Page } from "@playwright/test";

/**
 * End-of-turn UX on the home screen (network-mocked):
 * 1. While the numbers are being drawn, the elected rule is shown on the main
 *    screen with a "Drawing the numbers" state.
 * 2. When the draw settles, a full-screen pop-up shows the drawn numbers, the
 *    prize, the winner counts, and the active rule, and closes with the X.
 */

const TURN_ID = 7;

const rules = [
  { proposer: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", ruleId: 3, sanitizedText: "The guess whose sum of numbers lands closest to 100 wins the round.", state: "eligible", title: "Closest sum to 100", tokenCount: 12, votes: 21 },
  { proposer: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", ruleId: 4, sanitizedText: "Guesses with three even numbers split the pot.", state: "eligible", title: "Three even numbers", tokenCount: 9, votes: 8 },
];

function roundPayload(drawSettled: boolean) {
  return {
    round: {
      draw: drawSettled
        ? { drawResult: [4, 8, 15, 16, 23, 42], drawnAt: new Date().toISOString(), status: "fulfilled", turnId: TURN_ID }
        : { drawResult: null, drawnAt: null, status: "requested", turnId: TURN_ID },
      election: {
        activeRuleId: 3,
        eligibleRuleIds: [3, 4],
        finalistRuleIds: [3, 4],
        randomRuleIds: [4],
        status: "settled",
        topVotedRuleIds: [3],
      },
      elimination: {
        decisionWindowClosesAt: null,
        eliminatedRuleIds: [],
        finalists: [],
        status: "closed",
        survivorRuleIds: [3, 4],
      },
      pool: {
        accounting: {
          buckets: {
            alternative: { rolloverLamports: 0, totalLamports: 6_200_000_000 },
            original: { rolloverLamports: 0, totalLamports: 6_200_000_000 },
          },
        },
        guesses: 31,
        indicativeSol: 12.4,
        totalVisiblePrizePoolSol: 12.4,
      },
      rules,
      status: drawSettled ? "completed" : "current",
      totalVotes: 29,
      turnId: TURN_ID,
      ...(drawSettled
        ? {
            winners: {
              alternative: { bucketLamports: 6_200_000_000, individualPayoutLamports: 3_100_000_000, winnerCount: 2 },
              original: { bucketLamports: 6_200_000_000, individualPayoutLamports: 0, winnerCount: 0 },
              records: [],
              turnId: TURN_ID,
            },
          }
        : {}),
    },
  };
}

function roundFor(turnId: number, drawSettled: boolean) {
  const round = roundPayload(drawSettled).round;
  return {
    ...round,
    draw: { ...round.draw, turnId },
    turnId,
    ...(round.winners
      ? { winners: { ...round.winners, turnId } }
      : {}),
  };
}

async function mockBackend(page: Page, drawSettled: boolean) {
  const nowSec = Math.floor(Date.now() / 1000);
  // Origins vary with the dev setup (NEXT_PUBLIC_* overrides vs the /__api and
  // /__worker same-origin proxies), so every mock matches on the path.
  await page.route("**/turn/active", (route) =>
    route.fulfill({
      json: {
        globalConfig: {
          activeTurnId: TURN_ID,
          guessCutoffBps: 9167,
          guessSubmissionFeeLamports: "10000000",
          hasActiveTurn: true,
          nextTurnId: TURN_ID + 1,
          paused: false,
          ruleElectionCutoffBps: 9167,
          ruleRemovalFeeLamports: "50000000",
          voteFeeLamports: "5000000",
        },
        globalConfigAddress: "11111111111111111111111111111111",
        // Turn still open, already past its planned end: the draw window.
        turnState: { eliminationWindowEndTimestamp: 0, endTimestamp: nowSec - 30, finalistCount: 0, finalistRuleIds: [], startTimestamp: nowSec - 7_230, status: "open", turnDurationSeconds: 7_200, turnId: TURN_ID },
        turnStateAddress: "11111111111111111111111111111111",
      },
    }),
  );
  // Isolate the test from any locally running API: every API-shaped path that
  // is not explicitly mocked below answers 404. Later routes win, so the
  // specific mocks registered after this catch-all take precedence.
  await page.route(
    /\/api\/proxy\/(rounds\/\d+|rule-proposals\?|rule-votes\?|rule-elimination-votes\?|guess-receipts\?|winner-records\?|players\/)/,
    (route) => route.fulfill({ json: { error: "not_mocked" }, status: 404 }),
  );
  await page.route(new RegExp(`/rounds/${TURN_ID}(?:\\?activeTurnId=${TURN_ID})?$`), (route) =>
    route.fulfill({ json: roundPayload(drawSettled) }),
  );
  await page.route(new RegExp(`/rule-proposals\\?turnId=${TURN_ID}$`), (route) =>
    route.fulfill({ json: { proposals: rules } }),
  );
  await page.route(new RegExp(`/rule-votes\\?turnId=${TURN_ID}$`), (route) =>
    route.fulfill({ json: { counts: { "3": 21, "4": 8 }, votes: [] } }),
  );
  await page.route(new RegExp(`/rule-elimination-votes\\?turnId=${TURN_ID}$`), (route) =>
    route.fulfill({ json: { counts: {}, votes: [] } }),
  );
}

async function mockCanonicalRoundNavigation(page: Page) {
  const activeTurnId = 31;
  const nowSec = Math.floor(Date.now() / 1000);

  await page.route("**/turn/active", (route) =>
    route.fulfill({
      json: {
        globalConfig: {
          activeTurnId,
          guessCutoffBps: 9167,
          guessSubmissionFeeLamports: "10000000",
          hasActiveTurn: true,
          nextTurnId: activeTurnId + 1,
          paused: false,
          ruleElectionCutoffBps: 9167,
          ruleRemovalFeeLamports: "50000000",
          voteFeeLamports: "5000000",
        },
        globalConfigAddress: "11111111111111111111111111111111",
        turnState: {
          eliminationWindowEndTimestamp: 0,
          endTimestamp: nowSec + 3_600,
          finalistCount: 0,
          finalistRuleIds: [],
          startTimestamp: nowSec - 1_800,
          status: "open",
          turnDurationSeconds: 5_400,
          turnId: activeTurnId,
        },
        turnStateAddress: "11111111111111111111111111111111",
      },
    }),
  );
  await page.route(
    /\/api\/proxy\/(rounds\/\d+|rule-proposals\?|rule-votes\?|rule-elimination-votes\?|guess-receipts\?|winner-records\?|players\/)/,
    (route) => route.fulfill({ json: { error: "not_mocked" }, status: 404 }),
  );
  await page.route(/\/api\/proxy\/rounds\/(24|30|31)(?:\?activeTurnId=31)?$/, (route) => {
    const turnId = Number(new URL(route.request().url()).pathname.split("/").at(-1));
    return route.fulfill({
      json: { round: roundFor(turnId, turnId !== activeTurnId) },
    });
  });
  await page.route(new RegExp(`/rule-proposals\\?turnId=${activeTurnId}$`), (route) =>
    route.fulfill({ json: { proposals: [] } }),
  );
  await page.route(new RegExp(`/rule-votes\\?turnId=${activeTurnId}$`), (route) =>
    route.fulfill({ json: { counts: {}, votes: [] } }),
  );
  await page.route(new RegExp(`/rule-elimination-votes\\?turnId=${activeTurnId}$`), (route) =>
    route.fulfill({ json: { counts: {}, votes: [] } }),
  );
}

test("while the numbers are drawn the elected rule is shown on the home screen", async ({ page }) => {
  await mockBackend(page, false);
  await page.goto("/play");

  // The app converges to the mocked turn through its 10s polling cycles.
  await expect(page.getByText("Drawing the numbers")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("Elected rule", { exact: true })).toBeVisible();
  await expect(page.getByText("Closest sum to 100").first()).toBeVisible();
  await expect(page.getByText("The numbers are being drawn", { exact: false })).toBeVisible();
  // The draw has not settled: no result pop-up yet.
  await expect(page.getByRole("heading", { name: "The numbers are out" })).toHaveCount(0);
});

test("when the draw settles a pop-up covers the home screen with the result", async ({ page }) => {
  await mockBackend(page, true);
  await page.goto("/play");

  const heading = page.getByRole("heading", { name: "The numbers are out" });
  // The app converges to the mocked turn through its 10s polling cycles.
  await expect(heading).toBeVisible({ timeout: 30_000 });

  // Drawn numbers, active rule, prize, and winner counts are all in the pop-up.
  for (const n of [4, 8, 15, 16, 23, 42]) {
    await expect(page.getByText(String(n), { exact: true }).first()).toBeVisible();
  }
  await expect(page.getByText("Active rule", { exact: true })).toBeVisible();
  await expect(page.getByText("Closest sum to 100").first()).toBeVisible();
  await expect(page.getByText("Prize pool", { exact: true })).toBeVisible();
  await expect(page.getByText("12.4", { exact: false }).first()).toBeVisible();
  await expect(page.getByText("Winners", { exact: true })).toBeVisible();
  // While the pop-up is up, the home "being drawn" card is gone.
  await expect(page.getByText("The numbers are being drawn", { exact: false })).toHaveCount(0);

  // The X closes the pop-up and the dismissal is remembered across reloads.
  await page.getByRole("button", { name: "Close result" }).click();
  await expect(heading).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Accumulated prize")).toBeVisible();
  await expect(page.getByRole("heading", { name: "The numbers are out" })).toHaveCount(0);
});

test("historical round and live round keep canonical URLs across navigation and reload", async ({ page }) => {
  await mockCanonicalRoundNavigation(page);
  await page.goto("/round/24");

  await expect(page).toHaveURL(/\/rounds\/24$/);
  await expect(page.getByRole("heading", { name: "Round settled" })).toBeVisible();

  await page.getByRole("link", { name: "Play", exact: true }).click();
  await expect(page).toHaveURL(/\/play$/);
  // Back on the live round the app resolves the latest settled turn (#0030),
  // which is what the result pop-up announces.
  await expect(page.getByText("Round #0030 settled")).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByText("Round #0030 settled")).toBeVisible();
  await expect(page.getByText("#0024", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "See the full result" }).click();
  await expect(page).toHaveURL(/\/rounds\/30$/);
  await expect(page.getByText(/Turn 30/).first()).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/play$/);
  await expect(page.getByText("Accumulated prize")).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/rounds\/30$/);
  await expect(page.getByText(/Turn 30/).first()).toBeVisible();

  await page.reload();
  await expect(page).toHaveURL(/\/rounds\/30$/);
  await expect(page.getByText(/Turn 30/).first()).toBeVisible();
});
