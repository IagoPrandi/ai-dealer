import type { Page } from "@playwright/test";

/**
 * Stubs the two-call rule preflight contract: `POST /rule-preflight` accepts a
 * job, and `GET /rule-preflight/jobs/:id/events` streams it back as SSE.
 *
 * Specs keep writing a single resolver over the request body, exactly as they
 * did when the endpoint answered inline.
 */

export interface PreflightStubReply {
  json: unknown;
  status?: number;
}

export interface PreflightStubRequest {
  phase?: string;
  text: string;
}

export type PreflightStubResolver = (
  body: PreflightStubRequest,
) => PreflightStubReply | Promise<PreflightStubReply>;

export interface SseFrameInit {
  data: unknown;
  event: string;
  id?: number;
}

export function sseBody(frames: SseFrameInit[]) {
  return frames
    .map((frame) => {
      const id = frame.id === undefined ? "" : `id: ${frame.id}\n`;
      return `${id}event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`;
    })
    .join("");
}

export async function mockRulePreflight(
  page: Page,
  resolve: PreflightStubResolver,
) {
  const jobs = new Map<string, { phase: string; reply: PreflightStubReply }>();
  let issued = 0;

  await page.route("**/rule-preflight", async (route) => {
    const body = (await route.request().postDataJSON()) as PreflightStubRequest;
    const reply = await resolve(body);
    const status = reply.status ?? 200;
    if (status !== 200) {
      // Deterministic gates still reject synchronously, before a job exists.
      await route.fulfill({
        contentType: "application/json",
        json: reply.json,
        status,
      });
      return;
    }
    issued += 1;
    const jobId = `e2e-job-${issued}`;
    const phase = body.phase ?? "compile";
    jobs.set(jobId, { phase, reply });
    await route.fulfill({
      contentType: "application/json",
      headers: { location: `/rule-preflight/jobs/${jobId}/events` },
      json: { idempotent: false, jobId, phase, status: "running" },
      status: 202,
    });
  });

  await page.route("**/rule-preflight/jobs/*/events**", async (route) => {
    const jobId = new URL(route.request().url()).pathname.split("/").at(-2) ?? "";
    const job = jobs.get(jobId);
    if (!job) {
      await route.fulfill({
        contentType: "application/json",
        json: { error: "rule_preflight_job_not_found" },
        status: 404,
      });
      return;
    }
    const event = job.phase === "interpret" ? "interpretation" : "result";
    await route.fulfill({
      body: sseBody([
        {
          data: {
            progress: {
              message: "Interpreting your winning condition...",
              stage: "interpreting",
            },
            type: "progress",
          },
          event: "progress",
          id: 1,
        },
        {
          data: { ...(job.reply.json as Record<string, unknown>), type: event },
          event,
          id: 2,
        },
      ]),
      contentType: "text/event-stream",
      status: 200,
    });
  });
}
