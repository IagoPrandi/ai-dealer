import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runPrecompileLoopOnce,
  type PrecompileLoopConfig,
  type PrecompileLoopDeps,
} from "./precompile-loop.js";

const HASH_A =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const HASH_B =
  "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";

// The config only needs `enabled` + a non-null authority for the guard; the
// on-chain/API/turn behaviors are all injected through deps.
const config = {
  automation: { authorityKeypairBytes: new Uint8Array([1, 2, 3]) },
  enabled: true,
} as unknown as PrecompileLoopConfig;

interface Proposal {
  compiledArtifactHash: string | null;
  precompilationStatus: "failed" | "passed" | "pending";
  ruleId: number;
  sanitizedText: string;
  state: "eligible" | "invalidated" | "proposed" | "removed_paid";
  tokenCount: number;
}

function proposal(over: Partial<Proposal> & { ruleId: number }): Proposal {
  return {
    compiledArtifactHash: null,
    precompilationStatus: "pending",
    sanitizedText: "Win if at least 4 of your numbers appear in the draw.",
    state: "proposed",
    tokenCount: 12,
    ...over,
  };
}

interface Recorder {
  deps: PrecompileLoopDeps;
  validated: number[];
  sent: { ruleId: number; hash: string }[];
}

function recorder(options: {
  cutoffTimestamp?: number;
  now?: number;
  paused?: boolean;
  proposals: Proposal[];
  turn?: { cutoffTimestamp: number; turnId: number } | null;
  validate: (ruleId: number) => {
    compiledArtifactHash: string | null;
    decision: "INVALID" | "VALID";
  };
}): Recorder {
  const validated: number[] = [];
  const sent: { ruleId: number; hash: string }[] = [];
  const deps: PrecompileLoopDeps = {
    resolveTurn: async () =>
      options.paused
        ? { paused: true }
        : {
            paused: false,
            turn:
              options.turn === undefined
                ? { cutoffTimestamp: 1_000, turnId: 42 }
                : options.turn,
          },
    fetchProposals: async () => options.proposals,
    nowSeconds: () => options.now ?? 0,
    runValidation: async (_turnId, ruleId) => {
      validated.push(ruleId);
      return options.validate(ruleId);
    },
    sendPrecompile: async ({ compiledArtifactHash, ruleId }) => {
      sent.push({ hash: compiledArtifactHash, ruleId });
      return `sig-${ruleId}`;
    },
  };
  return { deps, sent, validated };
}

test("precompiles a valid proposed rule on-chain and reports the signature", async () => {
  const rec = recorder({
    proposals: [proposal({ ruleId: 7 })],
    validate: () => ({ compiledArtifactHash: HASH_A, decision: "VALID" }),
  });

  const result = await runPrecompileLoopOnce(config, rec.deps);

  assert.equal(result.action, "precompiled");
  assert.deepEqual(rec.validated, [7]);
  assert.deepEqual(rec.sent, [{ hash: HASH_A, ruleId: 7 }]);
  if (result.action === "precompiled") {
    assert.deepEqual(result.precompiled, [
      { decision: "VALID", ruleId: 7, signature: "sig-7" },
    ]);
  }
});

test("validates an invalid rule but never sends precompile for it", async () => {
  const rec = recorder({
    proposals: [proposal({ ruleId: 8 })],
    validate: () => ({ compiledArtifactHash: null, decision: "INVALID" }),
  });

  const result = await runPrecompileLoopOnce(config, rec.deps);

  assert.equal(result.action, "precompiled");
  assert.deepEqual(rec.validated, [8]);
  assert.deepEqual(rec.sent, []);
});

test("skips rules that already moved out of proposed/pending (idempotent)", async () => {
  const rec = recorder({
    proposals: [
      proposal({ ruleId: 1, precompilationStatus: "passed", state: "eligible" }),
      proposal({
        ruleId: 2,
        precompilationStatus: "failed",
        state: "invalidated",
      }),
    ],
    validate: () => ({ compiledArtifactHash: HASH_A, decision: "VALID" }),
  });

  const result = await runPrecompileLoopOnce(config, rec.deps);

  assert.equal(result.action, "no_pending_rules");
  assert.deepEqual(rec.validated, []);
  assert.deepEqual(rec.sent, []);
});

test("does not act once the phase-1 rule-election cutoff has passed", async () => {
  const rec = recorder({
    now: 2_000,
    proposals: [proposal({ ruleId: 3 })],
    turn: { cutoffTimestamp: 1_000, turnId: 42 },
    validate: () => ({ compiledArtifactHash: HASH_A, decision: "VALID" }),
  });

  const result = await runPrecompileLoopOnce(config, rec.deps);

  assert.equal(result.action, "cutoff_passed");
  assert.deepEqual(rec.validated, []);
  assert.deepEqual(rec.sent, []);
});

test("stops mid-pass if the cutoff is crossed between rules", async () => {
  const rec = recorder({
    proposals: [proposal({ ruleId: 4 }), proposal({ ruleId: 5 })],
    turn: { cutoffTimestamp: 1_000, turnId: 42 },
    validate: () => ({ compiledArtifactHash: HASH_B, decision: "VALID" }),
  });
  // nowSeconds is read at the top-level cutoff gate, then once per rule before
  // its send. Stay under the cutoff for the gate and rule 4, then cross it so
  // rule 5 is skipped.
  const clock = [990, 990, 1_010];
  let call = 0;
  rec.deps.nowSeconds = () => clock[Math.min(call++, clock.length - 1)] ?? 0;

  const result = await runPrecompileLoopOnce(config, rec.deps);

  assert.equal(result.action, "precompiled");
  assert.deepEqual(rec.validated, [4]);
  assert.deepEqual(rec.sent, [{ hash: HASH_B, ruleId: 4 }]);
});

test("reports no_active_turn when no turn is open", async () => {
  const rec = recorder({
    proposals: [],
    turn: null,
    validate: () => ({ compiledArtifactHash: HASH_A, decision: "VALID" }),
  });

  const result = await runPrecompileLoopOnce(config, rec.deps);

  assert.equal(result.action, "no_active_turn");
});

test("is disabled when the flag is off", async () => {
  const rec = recorder({
    proposals: [proposal({ ruleId: 9 })],
    validate: () => ({ compiledArtifactHash: HASH_A, decision: "VALID" }),
  });

  const result = await runPrecompileLoopOnce(
    { ...config, enabled: false },
    rec.deps,
  );

  assert.equal(result.action, "disabled");
  assert.deepEqual(rec.sent, []);
});
