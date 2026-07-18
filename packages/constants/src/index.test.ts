import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEVELOPMENT_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX,
  PRODUCTION_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX,
  resolveFreeActionWindowEndsBeforeTurnIndex,
} from "./index.js";

test("free-action cutoff is mainnet 30 and non-mainnet 100", () => {
  assert.equal(
    resolveFreeActionWindowEndsBeforeTurnIndex("mainnet-beta"),
    PRODUCTION_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX,
  );
  assert.equal(
    resolveFreeActionWindowEndsBeforeTurnIndex("devnet"),
    DEVELOPMENT_FREE_ACTION_WINDOW_ENDS_BEFORE_TURN_INDEX,
  );
  assert.equal(resolveFreeActionWindowEndsBeforeTurnIndex(undefined), 100);
});
