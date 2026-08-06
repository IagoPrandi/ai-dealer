import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ApiRequestError,
  consumeRulePreflightResponse,
  type RulePreflightProgress,
} from "./apiClient.js";

function ndjsonResponse(lines: string[]) {
  const encoder = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(controller) {
        lines.forEach((line) => controller.enqueue(encoder.encode(line)));
        controller.close();
      },
    }),
    { headers: { "content-type": "application/x-ndjson; charset=utf-8" } },
  );
}

test("rule preflight stream reports real stages before returning the result", async () => {
  const progress: RulePreflightProgress[] = [];
  const response = ndjsonResponse([
    '{"type":"progress","progress":{"stage":"checking_safety","message":"Checking safety..."}}\n',
    '{"type":"progress","progress":{"stage":"interpreting","message":"Interpreting your rule..."}}\n',
    '{"type":"result","preflight":{"confirmationRequired":false,"dealerMessage":"Done","needsClarification":false,"normalizedText":"A guess wins.","ruleId":91,"tokenCount":4}}\n',
  ]);

  const result = await consumeRulePreflightResponse(response, (event) => {
    progress.push(event);
  });

  assert.deepEqual(progress.map((event) => event.stage), [
    "checking_safety",
    "interpreting",
  ]);
  assert.equal(result.preflight.ruleId, 91);
});

test("rule preflight stream preserves typed backend errors", async () => {
  const response = ndjsonResponse([
    '{"type":"error","error":"RULE_AGENT_TIMEOUT","message":"The dealer timed out.","status":502}\n',
  ]);

  await assert.rejects(
    consumeRulePreflightResponse(response),
    (error: unknown) =>
      error instanceof ApiRequestError &&
      error.code === "RULE_AGENT_TIMEOUT" &&
      error.status === 502,
  );
});
