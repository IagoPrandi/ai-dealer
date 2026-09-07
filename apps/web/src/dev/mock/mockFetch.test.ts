import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { askDealer } from "../../features/tyche/data/apiClient.js";
import { MOCK_ACTIVE_TURN_ID } from "./mockData.js";
import { installMockFetch } from "./mockFetch.js";

type TestWindow = {
  __tycheMockFetchInstalled?: boolean;
  fetch: typeof fetch;
};

const originalWindow = globalThis.window;

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalThis, "window");
  } else {
    globalThis.window = originalWindow;
  }
});

test("mock fetch returns an open active turn snapshot", async () => {
  const calls: string[] = [];
  const testWindow: TestWindow = {
    fetch: async (input) => {
      calls.push(String(input));
      return new Response("not mocked", { status: 599 });
    },
  };
  globalThis.window = testWindow as Window & typeof globalThis;

  installMockFetch();

  const response = await testWindow.fetch("/__worker/turn/active");
  const body = (await response.json()) as {
    globalConfig: { activeTurnId: number; guessSubmissionFeeLamports: string };
    turnState: { status: string; turnId: number };
  };

  assert.equal(response.status, 200);
  assert.equal(body.globalConfig.activeTurnId, MOCK_ACTIVE_TURN_ID);
  assert.equal(body.globalConfig.guessSubmissionFeeLamports, "10000000");
  assert.equal(body.turnState.status, "open");
  assert.equal(body.turnState.turnId, MOCK_ACTIVE_TURN_ID);
  assert.deepEqual(calls, []);
});

test("mock mode forwards conversation drafts to the real API", async () => {
  const calls: string[] = [];
  const testWindow: TestWindow = {
    fetch: async (input) => {
      calls.push(String(input));
      return new Response(JSON.stringify({ draft: { draftId: "server:7:abc" } }), {
        headers: { "content-type": "application/json" },
        status: 201,
      });
    },
  };
  globalThis.window = testWindow as Window & typeof globalThis;
  installMockFetch();

  const created = await testWindow.fetch(
    "/__api/players/GZRY3NG9xUxkzF9Z9z4N5Q7A9k7X8vB2c5E9F3Q7tHe/conversation-drafts",
    { body: JSON.stringify({ draftId: "client:7:abc", prompt: "hi" }), method: "POST" },
  );
  const saved = (await created.json()) as { draft?: { draftId?: string } };
  assert.equal(created.status, 201);
  assert.equal(saved.draft?.draftId, "server:7:abc");
  assert.deepEqual(calls, [
    "/__api/players/GZRY3NG9xUxkzF9Z9z4N5Q7A9k7X8vB2c5E9F3Q7tHe/conversation-drafts",
  ]);
});

test("mock mode forwards both interpretation and compilation preflight requests", async () => {
  const calls: Array<{ body: unknown; url: string }> = [];
  const testWindow: TestWindow = {
    fetch: async (input, init) => {
      calls.push({
        body: init?.body ? JSON.parse(String(init.body)) : null,
        url: String(input),
      });
      return new Response(JSON.stringify({ jobId: "real-preflight-job" }), {
        headers: { "content-type": "application/json" },
        status: 202,
      });
    },
  };
  globalThis.window = testWindow as Window & typeof globalThis;
  installMockFetch();

  const source =
    "Vence quem tiver a soma dos palpites maior que a soma dos dois primeiros números sorteados.";
  await testWindow.fetch("/api/proxy/rule-preflight", {
    body: JSON.stringify({ phase: "interpret", text: source }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });
  await testWindow.fetch("/api/proxy/rule-preflight", {
    body: JSON.stringify({
      approvedInterpretation: { officialInterpretation: "The guessed sum is greater." },
      phase: "compile",
      text: source,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

  assert.deepEqual(calls, [
    { body: { phase: "interpret", text: source }, url: "/api/proxy/rule-preflight" },
    {
      body: {
        approvedInterpretation: { officialInterpretation: "The guessed sum is greater." },
        phase: "compile",
        text: source,
      },
      url: "/api/proxy/rule-preflight",
    },
  ]);
});

test("mock mode forwards dealer chat to the real LLM stream", async () => {
  const calls: string[] = [];
  const testWindow: TestWindow = {
    fetch: async (input) => {
      calls.push(String(input));
      return new Response(
        [
          `event: reasoning
data: {"text":"Checking the saved rule..."}

`,
          `event: delta
data: {"text":"Ties split the alternative pool equally."}

`,
          `event: answer
data: {"answer":"Ties split the alternative pool equally.","proposedRuleText":null}

`,
        ].join(""),
        { headers: { "content-type": "text/event-stream" }, status: 200 },
      );
    },
  };
  globalThis.window = testWindow as Window & typeof globalThis;
  installMockFetch();

  const deltas: string[] = [];
  const reasoning: string[] = [];
  const answer = await askDealer({
    draftId: "client:7:abc",
    fetchImpl: testWindow.fetch,
    message: "How are ties decided?",
    onDelta: (chunk) => deltas.push(chunk),
    onReasoning: (chunk) => reasoning.push(chunk),
  });

  assert.equal(answer.answer, "Ties split the alternative pool equally.");
  assert.deepEqual(deltas, [answer.answer]);
  assert.deepEqual(reasoning, ["Checking the saved rule..."]);
  assert.equal(answer.proposedRuleText, null);
  assert.deepEqual(calls, ["/api/proxy/rule-dealer/ask"]);
});
