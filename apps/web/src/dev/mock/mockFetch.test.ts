import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { MOCK_ACTIVE_TURN_ID } from "./mockData.js";
import { installMockFetch } from "./mockFetch.js";

type TestWindow = {
  __idealerMockFetchInstalled?: boolean;
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
