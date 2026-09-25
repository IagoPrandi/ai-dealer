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

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "out");
const baseUrl = process.env.TYCHE_VIDEO_BASE_URL ?? "http://localhost:3000";
const checkpoints = process.argv.includes("--checkpoints");
// The desktop shell (>= 1024px): rail, top bar, and master-detail decks.
const viewport = { width: 1440, height: 900 };
const RULE = "Win if at least four of my numbers appear in the draw.";
const PICKS = [7, 18, 26, 44, 63, 91];

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
        title: "Four is enough",
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
      title: "Four is enough",
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
await installMockRoutes(page, { preflight });

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
const smoothScroll = (selector, top) =>
  page.evaluate(([sel, y]) => {
    const scroller = document.querySelector(sel) ?? document.scrollingElement;
    scroller.scrollTo({ behavior: "smooth", top: y });
  }, [selector, top]);

// Scene 1 — the live round.
mark("round");
await page.goto(`${baseUrl}/play`, { waitUntil: "networkidle" });
await pause(2600);
await checkpoint("home");
await pause(1200);

// Scene 2 — pick six numbers.
mark("pick");
await tap(page.getByRole("button", { name: /play (now|again)/i }).first(), 1100);
await checkpoint("pick-empty");
for (const value of PICKS) {
  await tap(page.getByRole("button", { name: String(value), exact: true }).first(), 380);
}
// On desktop the review panel sits beside the grid and fills in as you pick.
await pause(2200);
await checkpoint("pick-full");

// Scene 3 — the rules in voting.
mark("vote");
const rail = page.locator(".ide-desktop-rail");
await tap(rail.getByRole("button", { name: /^Rules/ }), 1800);
await checkpoint("rules");
await tap(page.getByText("Closest Sum").first(), 1800);
await tap(page.getByText("Four Numbers Match").first(), 2000);
await checkpoint("rule-detail");

// Scene 4 — write a rule with the AI dealer.
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
await pause(2400);

// Scene 5 — the draw.
mark("draw");
await page.evaluate(() => {
  sessionStorage.setItem("video:finale", "1");
  localStorage.removeItem("tyche:draw-result-last-seen-turn");
});
await page.goto(`${baseUrl}/play`, { waitUntil: "networkidle" });
mark("draw-loaded");
await pause(3200);
await checkpoint("draw-popup");
await tap(page.getByRole("button", { name: /see the full result/i }), 300);
await page.waitForURL(/\/play\/results/, { timeout: 15_000 });
await pause(1800);
await checkpoint("result");
await smoothScroll(".ide-scroll", 700);
await pause(2400);
await checkpoint("result-scrolled");

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
