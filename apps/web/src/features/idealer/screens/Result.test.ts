import assert from "node:assert/strict";
import { test } from "node:test";

import { getGuessRuleMatch } from "./Result";

test("result guess colors follow the verified winning categories", () => {
  assert.equal(getGuessRuleMatch([]), "none");
  assert.equal(getGuessRuleMatch([{ category: "original" }]), "original");
  assert.equal(getGuessRuleMatch([{ category: "alternative" }]), "turn");
  assert.equal(
    getGuessRuleMatch([{ category: "original" }, { category: "alternative" }]),
    "both",
  );
});
