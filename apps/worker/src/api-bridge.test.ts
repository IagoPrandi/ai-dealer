import assert from "node:assert/strict";
import { test } from "node:test";
import { ApiBridge } from "./api-bridge.js";

interface RecordedCall {
  body: unknown;
  method: string;
  url: string;
}

function fakeFetch(
  routes: Record<string, unknown>,
): { calls: RecordedCall[]; fetchImpl: typeof fetch } {
  const calls: RecordedCall[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ body, method, url });
    const key = `${method} ${new URL(url).pathname}${new URL(url).search}`;
    const payload = routes[key] ?? routes[`${method} ${new URL(url).pathname}`] ?? {};
    return new Response(JSON.stringify(payload), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const BASE = "http://api.test";

test("publishDraw and transitions POST to the right endpoints", async () => {
  const { calls, fetchImpl } = fakeFetch({});
  const bridge = new ApiBridge({ apiBaseUrl: `${BASE}/`, fetchImpl });

  await bridge.publishDraw({
    drawResult: [1, 2, 3, 4, 5, 6],
    drawnAt: "2026-06-23T00:00:00.000Z",
    failureCode: null,
    randomnessAccount: "acc",
    randomnessSource: "acc",
    randomnessValue: "ab".repeat(32),
    requestedAt: "2026-06-23T00:00:00.000Z",
    settleSignature: "sig",
    status: "fulfilled",
    turnId: 1,
  });
  await bridge.recordSettlementTransition({
    fromState: "DRAWN",
    idempotencyKey: "1:TURN_CLOSED",
    inputHash: "11".repeat(32),
    outputHash: "22".repeat(32),
    toState: "TURN_CLOSED",
    transitionReason: "close_turn",
    turnId: 1,
  });

  assert.equal(calls[0]?.url, `${BASE}/draws`);
  assert.equal(calls[0]?.method, "POST");
  assert.equal(calls[1]?.url, `${BASE}/settlement-transitions`);
  assert.equal(
    (calls[1]?.body as { idempotencyKey: string }).idempotencyKey,
    "1:TURN_CLOSED",
  );
});

test("fetchRecordedStates maps transitions to a toState set", async () => {
  const { fetchImpl } = fakeFetch({
    "GET /settlement-transitions?turnId=1": {
      transitions: [{ toState: "DRAWN" }, { toState: "VERIFYING" }],
    },
  });
  const bridge = new ApiBridge({ apiBaseUrl: BASE, fetchImpl });

  const states = await bridge.fetchRecordedStates(1);
  assert.ok(states.has("DRAWN"));
  assert.ok(states.has("VERIFYING"));
  assert.equal(states.size, 2);
});

test("projectVerificationResults verifies pending jobs and posts hex resultIds", async () => {
  const { calls, fetchImpl } = fakeFetch({
    "GET /verification-jobs?turnId=1": {
      jobs: [
        {
          activeRuleArtifact: null,
          activeRuleId: null,
          attempts: 0,
          draw: [1, 2, 3, 4, 5, 6],
          id: "job-1",
          maxAttempts: 3,
          payload: {
            draw_hash: "aa".repeat(32),
            guess_hash: "bb".repeat(32),
            guess_sequence: "1",
            turn_id: "1",
            wallet: "4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH",
          },
          playerGuess: [7, 8, 9, 10, 11, 12],
          runAfter: "2026-06-23T00:00:00.000Z",
          status: "pending",
        },
      ],
    },
  });
  const bridge = new ApiBridge({ apiBaseUrl: BASE, fetchImpl });

  const result = await bridge.projectVerificationResults(
    1,
    () => "2026-06-23T00:00:00.000Z",
  );

  assert.equal(result.posted, 1);
  assert.equal(result.failed.length, 0);
  const post = calls.find((call) => call.url.endsWith("/verification-results"));
  assert.ok(post);
  const body = post?.body as { resultId: string; status: string };
  assert.match(body.resultId, /^[0-9a-f]{64}$/);
  assert.equal(body.status, "completed");
});

test("non-2xx responses throw with the status code", async () => {
  const fetchImpl = (async () =>
    new Response("nope", { status: 500 })) as unknown as typeof fetch;
  const bridge = new ApiBridge({ apiBaseUrl: BASE, fetchImpl });

  await assert.rejects(() => bridge.calculateWinners(1), /HTTP 500/);
});
