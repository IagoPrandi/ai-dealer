import assert from "node:assert/strict";
import { test } from "node:test";

import { canShowRuleRemovalAction } from "./shared";

test("rule removal action is visible only to the rule creator", () => {
  assert.equal(
    canShowRuleRemovalAction({ finalist: false, mine: true, removed: false }),
    true,
  );
  assert.equal(
    canShowRuleRemovalAction({ finalist: false, mine: false, removed: false }),
    false,
  );
});

test("rule removal action is hidden for finalized or removed rules", () => {
  assert.equal(
    canShowRuleRemovalAction({ finalist: true, mine: true, removed: false }),
    false,
  );
  assert.equal(
    canShowRuleRemovalAction({ finalist: false, mine: true, removed: true }),
    false,
  );
});
