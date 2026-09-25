// Playwright route stubs that serve the gallery fixtures (src/dev/mock/mockData.ts)
// to the real /play screens, so the landing-page video shows the actual app UI
// with canned data. Node >= 23.6 strips the fixture file's TypeScript types.
import {
  MOCK_ACTIVE_TURN_ID,
  MOCK_GLOBAL_CONFIG,
  MOCK_GUESS_RECEIPT,
  MOCK_PLAYER_CLAIMS,
  MOCK_ROUND,
  MOCK_RULE_ELIMINATION_VOTES,
  MOCK_RULE_PROPOSALS,
  MOCK_RULE_VOTES,
  MOCK_TURN_STATE,
  MOCK_WALLET_ADDRESS,
} from "../../src/dev/mock/mockData.ts";

const API_TYPES = new Set(["fetch", "xhr", "eventsource"]);

const json = (route, body, status = 200) =>
  route.fulfill({ contentType: "application/json", json: body, status });

/** Registers a stub that only answers API calls, never page loads or JS chunks. */
function api(page, pattern, handler) {
  return page.route(pattern, (route) =>
    API_TYPES.has(route.request().resourceType()) ? handler(route) : route.fallback(),
  );
}

function turnActive() {
  const now = Math.floor(Date.now() / 1000);
  return {
    globalConfig: Object.fromEntries(
      Object.entries(MOCK_GLOBAL_CONFIG).map(([key, value]) => [key, typeof value === "bigint" ? String(value) : value]),
    ),
    globalConfigAddress: "EtZ5ZyHKb8wZmMHFDLM6LtVmZV1WUMvFPER72eFE4qob",
    openingGate: { blockingTurnId: null, canOpen: true, code: "READY_TO_OPEN" },
    turnState: { ...MOCK_TURN_STATE, endTimestamp: now + 3600, startTimestamp: now - 1800, turnId: MOCK_ACTIVE_TURN_ID },
    turnStateAddress: "8xUJHW97K55qCMPNv6kaRMaiRnnkKFKhJKYDZKhsMk3R",
  };
}

/**
 * @param {import("@playwright/test").Page} page
 * @param {{ played?: boolean, preflight?: (body: any) => unknown }} options
 */
export async function installMockRoutes(page, options = {}) {
  const played = options.played ?? false;
  const drafts = [];

  await api(page, "**/turn/active**", (route) => json(route, turnActive()));
  await api(page, "**/rule-proposals**", (route) => json(route, MOCK_RULE_PROPOSALS));
  await api(page, "**/rule-elimination-votes**", (route) => json(route, MOCK_RULE_ELIMINATION_VOTES));
  await api(page, "**/rule-votes**", (route) => json(route, MOCK_RULE_VOTES));
  await api(page, "**/elimination**", (route) => json(route, {}));
  await api(page, "**/guess-receipts**", (route) =>
    json(route, played ? MOCK_GUESS_RECEIPT : { receipt: null, receipts: [] }),
  );
  await api(page, "**/tokenomics/public**", (route) =>
    json(route, { tokenomics: { accruedTreasuryFeesLamports: "0", available: false, projection: null, reason: "not_indexed" } }),
  );
  await api(page, "**/tokenomics/wallets/**", (route) => json(route, { wallet: null }));
  await api(page, "**/claims**", (route) => json(route, MOCK_PLAYER_CLAIMS));
  await api(page, "**/rounds/**", (route) => json(route, MOCK_ROUND));

  await api(page, `**/players/${MOCK_WALLET_ADDRESS}/conversation-drafts**`, async (route) => {
    const request = route.request();
    if (request.method() !== "POST") {
      return json(route, { cursor: null, drafts, limit: 20, nextCursor: null });
    }
    if (request.url().endsWith("/delete")) {
      return json(route, { deleted: request.postDataJSON().draftId });
    }
    const body = request.postDataJSON();
    const now = new Date().toISOString();
    const draftId = body.draftId ?? "draft-video-1";
    const existing = drafts.findIndex((item) => item.draftId === draftId);
    const draft = { createdAt: existing >= 0 ? drafts[existing].createdAt : now, ...body, draftId, updatedAt: now };
    // Keep what the app saves so its Conversations list shows the live draft.
    if (existing >= 0) drafts[existing] = draft;
    else drafts.unshift(draft);
    return json(route, { draft });
  });

  if (options.preflight) {
    await installPreflight(page, options.preflight);
  }
}

function sse(frames) {
  return frames.map((frame) => `id: ${frame.id}\nevent: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`).join("");
}

async function installPreflight(page, resolve) {
  const jobs = new Map();
  let issued = 0;
  await api(page, "**/rule-preflight", async (route) => {
    const body = route.request().postDataJSON();
    issued += 1;
    const jobId = `video-job-${issued}`;
    const phase = body.phase ?? "compile";
    jobs.set(jobId, { phase, reply: resolve(body) });
    await route.fulfill({
      contentType: "application/json",
      headers: { location: `/rule-preflight/jobs/${jobId}/events` },
      json: { idempotent: false, jobId, phase, status: "running" },
      status: 202,
    });
  });
  await api(page, "**/rule-preflight/jobs/*/events**", async (route) => {
    const jobId = new URL(route.request().url()).pathname.split("/").at(-2) ?? "";
    const job = jobs.get(jobId);
    if (!job) return json(route, { error: "rule_preflight_job_not_found" }, 404);
    // A short pause keeps the dealer's "thinking" state on screen for the video.
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 1400));
    const event = job.phase === "interpret" ? "interpretation" : "result";
    await route.fulfill({
      body: sse([
        { data: { progress: { message: "Interpreting your winning condition...", stage: "interpreting" }, type: "progress" }, event: "progress", id: 1 },
        { data: { ...job.reply, type: event }, event, id: 2 },
      ]),
      contentType: "text/event-stream",
      status: 200,
    });
  });
}
