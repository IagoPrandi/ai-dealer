import { expect, test } from "@playwright/test";

const completedRound = {
  cycle: {
    durationHours: 2,
    nextDurationHours: 8,
    pattern: [2, 2, 8, 8],
    stepIndex: 1,
  },
  draw: {
    drawResult: [20, 18, 99, 69, 90, 37],
    drawnAt: "2026-06-08T00:05:00.000Z",
    failureCode: null,
    randomnessAccount: "Rnd1nK5JhWRFjH1aHXfhnXsKuFM479JoeGUeNv7Po6dYC",
    randomnessSource: "Rnd1nK5JhWRFjH1aHXfhnXsKuFM479JoeGUeNv7Po6dYC",
    randomnessValue:
      "0707070707070707070707070707070707070707070707070707070707070707",
    requestedAt: "2026-06-08T00:00:00.000Z",
    settleSignature: null,
    status: "fulfilled",
    turnId: 2,
  },
  election: {
    activeRuleArtifactHash:
      "0808080808080808080808080808080808080808080808080808080808080808",
    activeRuleHash:
      "0101010101010101010101010101010101010101010101010101010101010101",
    activeRuleId: 1,
    electedFinalistIndex: 0,
    eligibleRuleIds: [1],
    eligibleRulePoolHash:
      "1111111111111111111111111111111111111111111111111111111111111111",
    finalistRuleIds: [1],
    finalistSetHash:
      "2222222222222222222222222222222222222222222222222222222222222222",
    randomFinalistHash:
      "3333333333333333333333333333333333333333333333333333333333333333",
    randomRuleIds: [],
    randomnessAccount: "Rnd1nK5JhWRFjH1aHXfhnXsKuFM479JoeGUeNv7Po6dYC",
    randomnessSource: "Rnd1nK5JhWRFjH1aHXfhnXsKuFM479JoeGUeNv7Po6dYC",
    randomnessValue:
      "0909090909090909090909090909090909090909090909090909090909090909",
    requestedAt: "2026-06-08T00:00:00.000Z",
    settledAt: "2026-06-08T00:02:00.000Z",
    status: "settled",
    topVotedFinalistHash:
      "4444444444444444444444444444444444444444444444444444444444444444",
    topVotedRuleIds: [1],
    turnId: 2,
  },
  pool: {
    guessSol: 0.02,
    guesses: 2,
    indicativeSol: 0.06,
    proposalSol: 0.04,
    proposals: 2,
  },
  rules: [
    {
      compiledArtifactHash:
        "0808080808080808080808080808080808080808080808080808080808080808",
      precompilationStatus: "passed",
      proposer: "4bYqf3rJ7m2nQh9sV1xCH8kLpWtD6eZaUg5oNbMcXyTH",
      ruleId: 1,
      ruleProposal: "B1KHQhbEzaXBTTMXSNVCWM6GhSAjFTEwdrY1N7DvBnZU",
      sanitizedText: "Win if the submitted guess contains all six drawn numbers.",
      state: "eligible",
      title: "All six drawn numbers",
      tokenCount: 11,
      votes: 5,
    },
  ],
  status: "completed",
  totalVotes: 5,
  turnId: 2,
};

test("public round page shows indexed devnet round state and audit links", async ({
  page,
}) => {
  await page.route(/api\.devnet\.solana\.com/, (route) => route.abort());
  await page.route("**/rounds/2", async (route) => {
    await route.fulfill({ json: { round: completedRound } });
  });

  await page.goto("/round/2");

  await expect(page.getByRole("heading", { name: "TURN-0002" })).toBeVisible();
  await expect(page.getByText("This round is closed.")).toBeVisible();
  await expect(page.getByText("2h -> 2h -> 8h -> 8h")).toBeVisible();
  await expect(page.getByText("0.0600 SOL").first()).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "All six drawn numbers" }),
  ).toBeVisible();
  await expect(page.getByText("5 votes")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Drawn numbers", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Rule of the Hour settled" }),
  ).toBeVisible();
  await expect(page.getByText("Active alternative rule: #1.")).toBeVisible();
  await expect(page.locator(".round-draw-numbers li").first()).toHaveText("20");
  await expect(page.locator(".round-draw-numbers li")).toHaveCount(6);
  await expect(
    page.getByRole("heading", { name: "On-chain references" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Copy round link" }),
  ).toBeVisible();
});

test("public round page shows a delayed draw waiting for randomness", async ({
  page,
}) => {
  await page.route(/api\.devnet\.solana\.com/, (route) => route.abort());
  await page.route("**/rounds/8", async (route) => {
    await route.fulfill({
      json: {
        round: {
          ...completedRound,
          draw: {
            drawResult: null,
            drawnAt: null,
            failureCode: null,
            randomnessAccount: "Rnd1nK5JhWRFjH1aHXfhnXsKuFM479JoeGUeNv7Po6dYC",
            randomnessSource: null,
            randomnessValue: null,
            requestedAt: "2026-06-08T00:00:00.000Z",
            settleSignature: null,
            status: "requested",
            turnId: 8,
          },
          status: "current",
          turnId: 8,
        },
      },
    });
  });

  await page.goto("/round/8");

  await expect(
    page.getByRole("heading", { name: "Draw requested" }),
  ).toBeVisible();
  await expect(
    page.getByText("Waiting for verifiable randomness"),
  ).toBeVisible();
});

test("public round page rejects an invalid round link", async ({ page }) => {
  await page.route(/api\.devnet\.solana\.com/, (route) => route.abort());

  await page.goto("/round/not-a-turn");

  await expect(
    page.getByText("This round link is not a valid turn id."),
  ).toBeVisible();
});
