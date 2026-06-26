import assert from "node:assert/strict";
import test from "node:test";
import { isTerminalSettlementStep } from "./settlement-run.js";

test("manual settlement runner exits on first close and idempotent replay", () => {
  assert.equal(
    isTerminalSettlementStep({ action: "done", toState: "CLOSED" }),
    true,
  );
  assert.equal(
    isTerminalSettlementStep({ action: "done", reason: "already_closed" }),
    true,
  );
  assert.equal(
    isTerminalSettlementStep({ action: "done", reason: "other" }),
    false,
  );
});
