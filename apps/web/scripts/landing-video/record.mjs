// Records the landing-page product video from the real /play screens.
//
//   1. pnpm --filter @tyche/web dev:mock      (wallet hooks mocked, port 3000)
//   2. node scripts/landing-video/record.mjs  (from apps/web)
//
// API data comes from src/dev/mock/mockData.ts through Playwright routes, so
// the recording needs no backend, wallet, or devnet. The raw .webm lands in
// scripts/landing-video/out/; `node scripts/landing-video/encode.mjs` turns it
// into the public/videos assets.
import { mkdir, readdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

import { installMockRoutes } from "./mockRoutes.mjs";
import {
  MOCK_ACTIVE_TURN_ID,
  MOCK_ROUND,
  MOCK_RULE_VOTES,
  MOCK_WALLET_ADDRESS,
} from "../../src/dev/mock/mockData.ts";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "out");
const baseUrl = process.env.TYCHE_VIDEO_BASE_URL ?? "http://localhost:3000";
const checkpoints = process.argv.includes("--checkpoints");
// The desktop shell (>= 1024px): rail, top bar, and master-detail decks.
const viewport = { width: 1440, height: 900 };
const RULE = "Win if at least four of my numbers appear in the draw.";
const PICKS = [7, 18, 23, 41, 63, 91];
const GUESS_RECEIPT = {
  receipt: {
    feeLamports: 20_000_000,
    numbers: PICKS,
    sequence: 2,
    signature: "5Zx9k2QmA7bC3dE4fG6hJ8kL1mN2oP3qR4sT5uV6wX7yZ8aB9cD0eF1gH2iJ3kL4mN5",
    submittedAt: "2026-06-21T10:30:00.000Z",
  },
  receipts: [],
};
const RECORDING_ROUND = {
  round: {
    ...MOCK_ROUND.round,
    rules: MOCK_ROUND.round.rules.map((rule) =>
      rule.ruleId === 1
        ? {
            ...rule,
            officialInterpretation:
              "A guess wins when at least 4 of its 6 numbers appear anywhere in the official draw, in any order.",
          }
        : rule,
    ),
    winners: {
      alternative: {
        bucketLamports: 5_000_000_000,
        individualPayoutLamports: 1_000_000_000,
        winnerCount: 5,
      },
      original: {
        bucketLamports: 15_000_000_000,
        individualPayoutLamports: 0,
        winnerCount: 0,
      },
      records: [
        {
          activeRuleId: 1,
          category: "alternative",
          payoutLamports: 1_000_000_000,
          player: MOCK_WALLET_ADDRESS,
          turnId: MOCK_ACTIVE_TURN_ID,
          winnerCount: 5,
        },
      ],
      turnId: MOCK_ACTIVE_TURN_ID,
    },
  },
};

const hash = (seed) => Array.from({ length: 32 }, (_, index) => (seed + index) % 256);

function preflight(body) {
  if (body.phase === "interpret") {
    return {
      interpretation: {
        addedOperationalClauses: [],
        clarificationQuestions: [],
        clarityNote: "",
        claimLedger: null,
        dealerMessage: "This is how I understand your rule.",
        englishText: body.text,
        needsClarification: false,
        normalizedText: body.text,
        officialInterpretation: "A guess wins when at least 4 of its 6 numbers appear anywhere in the official draw, in any order.",
        sanitizedText: body.text,
        suggestedRewrites: [],
        title: "Four Numbers Match",
        tokenCount: 12,
      },
    };
  }
  return {
    preflight: {
      addedOperationalClauses: [],
      boundaryExamples: [
        { draw: [7, 18, 23, 41, 49, 56], id: "matches_anywhere:3", outcome: "LOSE", ticket: [7, 18, 23, 2, 3, 5] },
        { draw: [7, 18, 23, 41, 49, 56], id: "matches_anywhere:4", outcome: "WIN", ticket: [56, 7, 41, 18, 3, 5] },
      ],
      clarityNote: "",
      confirmationRequired: false,
      decision: "VALID",
      dealerMessage: "Done. I compiled your rule into a deterministic condition.",
      difficultyClass: "MEDIUM",
      finalConfidence: 0.93,
      maxTokens: 1000,
      needsClarification: false,
      normalizedText: RULE,
      normalizedTextHash: hash(1),
      officialInterpretation: "A guess wins when at least 4 of its 6 numbers appear anywhere in the official draw, in any order.",
      officialInterpretationHash: hash(2),
      preflightResultHash: hash(3),
      ruleId: 4,
      ruleMode: "predicate",
      sanitizedText: RULE,
      sanitizedTextHash: hash(4),
      semanticImpact: { drawIndependent: false, rangeBoundsAmbiguous: false, sharedOutcome: false, usesDraw: true, usesGuess: true },
      title: "Four Numbers Match",
      tokenCount: 12,
    },
  };
}

// A visible tap marker: headless recordings do not show the pointer.
const TAP_MARKER = `
  addEventListener("pointerdown", (event) => {
    const dot = document.createElement("div");
    dot.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(255,210,63,.35);box-shadow:0 0 0 2px rgba(255,210,63,.9),0 0 24px rgba(255,46,136,.6);transition:transform .45s ease-out,opacity .45s ease-out;left:" + event.clientX + "px;top:" + event.clientY + "px";
    document.documentElement.appendChild(dot);
    requestAnimationFrame(() => { dot.style.transform = "scale(1.6)"; dot.style.opacity = "0"; });
    setTimeout(() => dot.remove(), 500);
  }, true);
`;

await mkdir(outDir, { recursive: true });
for (const file of await readdir(outDir)) await rm(path.join(outDir, file), { force: true, recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({
  deviceScaleFactor: 1,
  hasTouch: false,
  reducedMotion: "no-preference",
  serviceWorkers: "block",
  viewport,
  ...(checkpoints ? {} : { recordVideo: { dir: outDir, size: viewport } }),
});
await context.addInitScript(
  ({ guessReceipt, round, ruleVotes }) => {
    window.__tycheMockDataOverrides = { guessReceipt, round, ruleVotes };
  },
  {
    guessReceipt: GUESS_RECEIPT,
    round: RECORDING_ROUND,
    ruleVotes: {
      counts: { ...MOCK_RULE_VOTES.counts },
      votes: [...MOCK_RULE_VOTES.votes],
    },
  },
);
await context.addInitScript(TAP_MARKER);
// Mark the settled draw as seen so the round opens on the home screen; the
// finale clears it to bring the draw popup back.
await context.addInitScript(() => {
  if (!sessionStorage.getItem("video:finale")) localStorage.setItem("tyche:draw-result-last-seen-turn", "7");
});

const page = await context.newPage();
const t0 = Date.now();
// Scene start times (seconds into the raw video) for encode.mjs and the chapters.
const mark = (label) => console.log(`scene ${((Date.now() - t0) / 1000).toFixed(1)}s ${label}`);
page.on("pageerror", (error) => console.error("pageerror:", error.message));
await installMockRoutes(page, {
  guessReceipt: GUESS_RECEIPT,
  played: true,
  preflight,
  round: RECORDING_ROUND,
});

let shot = 0;
const pause = (ms) => page.waitForTimeout(ms);
const checkpoint = async (name) => {
  if (checkpoints) await page.screenshot({ path: path.join(outDir, `${String(++shot).padStart(2, "0")}-${name}.png`) });
};
const tap = async (locator, hold = 450) => {
  await locator.scrollIntoViewIfNeeded();
  await locator.click();
  await pause(hold);
};
const visualTap = async (locator, hold = 450) => {
  await locator.scrollIntoViewIfNeeded();
  await locator.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    element.dispatchEvent(new PointerEvent("pointerdown", {
      bubbles: true,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2,
    }));
  });
  await pause(hold);
};
// Scene 1 — the live round, held for two seconds before any interaction.
mark("round");
const rail = page.locator(".ide-desktop-rail");
await page.goto(`${baseUrl}/play`, { timeout: 60_000, waitUntil: "domcontentloaded" });
await rail.waitFor({ timeout: 60_000 });
await pause(2000);
await checkpoint("home");

// Scene 2 — write the rule that will later win the round.
mark("write");
await tap(rail.getByRole("button", { name: "Create a rule" }), 1400);
const composer = page.getByLabel("Message", { exact: true });
await composer.click();
await composer.pressSequentially(RULE, { delay: 38 });
await pause(500);
await tap(page.getByRole("button", { name: "Send message" }), 300);
await page.getByRole("button", { name: "Confirm and generate" }).waitFor({ timeout: 20_000 });
await pause(1800);
await checkpoint("interpretation");
await tap(page.getByRole("button", { name: "Confirm and generate" }), 300);
await page.getByRole("list", { name: "Examples of the compiled rule" }).waitFor({ timeout: 20_000 });
await pause(1200);
await checkpoint("compiled");
await pause(1800);

// Scene 3 — pick six numbers. Four of them will appear in the final draw.
mark("pick");
await tap(rail.getByRole("button", { name: /^Round/ }), 900);
await tap(page.getByRole("button", { name: /play (now|again)/i }).first(), 1000);
await checkpoint("pick-empty");
for (const value of PICKS) {
  await tap(page.getByRole("button", { name: String(value), exact: true }).first(), 360);
}
await pause(1800);
await checkpoint("pick-full");

// Scene 4 — vote in favor of the same four-number rule.
mark("vote");
await tap(rail.getByRole("button", { name: /^Rules/ }), 1500);
await checkpoint("rules");
await tap(page.getByText("Four Numbers Match").first(), 1200);
await visualTap(page.getByRole("button", { name: /in favor/i }).first(), 700);
await page.evaluate(({ ruleId, turnId, voter }) => {
  const overrides = window.__tycheMockDataOverrides;
  if (!overrides?.ruleVotes) return;
  overrides.ruleVotes.counts[String(ruleId)] += 1;
  overrides.ruleVotes.votes.push({
    ruleId,
    sequence: 1,
    signature: "video-vote-signature",
    submittedAt: new Date().toISOString(),
    turnId,
    voter,
  });
}, { ruleId: 1, turnId: MOCK_ACTIVE_TURN_ID, voter: MOCK_WALLET_ADDRESS });
await pause(1100);
await checkpoint("rule-voted");
await pause(1200);

// Scene 5 — reveal the draw, then the coherent winning result.
mark("result");
await page.evaluate(() => {
  localStorage.removeItem("tyche:draw-result-last-seen-turn");
});
await tap(rail.getByRole("button", { name: /^Round/ }), 300);
await page.getByRole("button", { name: /see the full result/i }).waitFor({ timeout: 60_000 });
mark("result-loaded");
await pause(2200);
await checkpoint("draw-popup");
await tap(page.getByRole("button", { name: /see the full result/i }), 300);
await page.waitForURL(/\/play\/results/, { timeout: 15_000 });
if (checkpoints) {
  await pause(2500);
  await checkpoint("result-route");
}
await page.locator(".ide-result-summary").getByRole("heading", { name: /you won/i }).waitFor({ timeout: 60_000 });
await pause(1800);
await checkpoint("result");
await pause(4000);
await checkpoint("result-held");

const video = page.video();
await context.close();
await browser.close();
if (video) {
  const raw = await video.path();
  await rename(raw, path.join(outDir, "landing-raw.webm"));
  for (const file of await readdir(outDir)) {
    if (file.endsWith(".webm") && file !== "landing-raw.webm") await rm(path.join(outDir, file));
  }
  console.log("recorded", path.join(outDir, "landing-raw.webm"));
} else {
  console.log("checkpoints written to", outDir);
}
