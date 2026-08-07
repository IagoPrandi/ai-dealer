import type { Page } from "@playwright/test";

/** The ambient turn/round data every Create-screen spec needs before it can render. */
export async function mockShellData(page: Page) {
  await page.route("**/turn/active", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        globalConfig: {
          activeTurnId: 7,
          guessCutoffBps: 7500,
          guessSubmissionFeeLamports: "10000000",
          hasActiveTurn: true,
          nextTurnId: 8,
          paused: false,
          ruleElectionCutoffBps: 6500,
          ruleRemovalFeeLamports: "50000000",
          voteFeeLamports: "5000000",
        },
        globalConfigAddress: "11111111111111111111111111111111",
        turnState: {
          eliminationWindowEndTimestamp: 0,
          endTimestamp: Math.floor(Date.now() / 1000) + 3600,
          finalistCount: 0,
          finalistRuleIds: [],
          startTimestamp: Math.floor(Date.now() / 1000) - 1800,
          status: "open",
          turnDurationSeconds: 5400,
          turnId: 7,
        },
        turnStateAddress: "11111111111111111111111111111111",
      },
      status: 200,
    });
  });
  await page.route("**/rounds/**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      json: {
        round: {
          draw: null,
          election: null,
          elimination: null,
          pool: { guesses: 0, indicativeSol: 0, proposals: 0, totalVisiblePrizePoolSol: 0 },
          rules: [],
          status: "open",
          turnId: 7,
          winners: { records: [] },
        },
      },
      status: 200,
    });
  });
  await page.route("**/rule-proposals?**", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { proposals: [] }, status: 200 });
  });
  await page.route("**/rule-votes?**", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { counts: {}, votes: [] }, status: 200 });
  });
  await page.route("**/rule-elimination-votes?**", async (route) => {
    await route.fulfill({ contentType: "application/json", json: { counts: {}, votes: [] }, status: 200 });
  });
}
