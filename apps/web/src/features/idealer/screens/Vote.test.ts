import assert from "node:assert/strict";
import { test } from "node:test";

import { getFinalistPhaseView } from "./Vote";

test("finalist phase reports the shortlist draw between phase 1 close and phase 2 start", () => {
  const view = getFinalistPhaseView({
    decisionPhase: false,
    electionStatus: null,
    finalistsCount: 0,
    roundLoading: false,
    shortlistPending: true,
  });

  assert.equal(view.kind, "pending");
  assert.equal(view.emptyTitle, "Shortlist draw in progress");
});

test("finalist phase shows decision window as soon as finalists are published", () => {
  const view = getFinalistPhaseView({
    decisionPhase: true,
    electionStatus: "requested",
    finalistsCount: 10,
    roundLoading: false,
    shortlistPending: false,
  });

  assert.equal(view.kind, "decision");
  assert.equal(view.label, "Decision window");
});

test("finalist phase distinguishes original-only rounds from missing shortlist data", () => {
  const view = getFinalistPhaseView({
    decisionPhase: false,
    electionStatus: "original_only",
    finalistsCount: 0,
    roundLoading: false,
    shortlistPending: true,
  });

  assert.equal(view.kind, "original_only");
  assert.equal(view.emptyTitle, "Original draw only");
});
