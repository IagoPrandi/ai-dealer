import assert from "node:assert/strict";
import { test } from "node:test";
import { ruleAstSchema, type RuleAst } from "@tyche/rule-compiler";
import {
  behaviorSignature,
  buildEquivalentAlternative,
  buildScenarios,
  evaluateScenario,
  selectMutations,
  TOTAL_SCENARIOS,
} from "./jevCorpusEngine.js";

function ast(node: unknown): RuleAst {
  return ruleAstSchema.parse({
    result: { predicate: node, type: "predicate" },
    schemaVersion: 3,
  });
}

const matches = {
  kind: "reduce",
  of: {
    kind: "intersection",
    left: { kind: "source", source: "guess" },
    right: { kind: "source", source: "draw" },
  },
  op: "count",
};

const atLeastThree = ast({
  kind: "compare",
  left: matches,
  op: "gte",
  right: { kind: "lit", value: 3 },
});

const rankingAst = ruleAstSchema.parse({
  result: {
    direction: "max",
    eligibleWhen: {
      kind: "compare",
      left: matches,
      op: "gte",
      right: { kind: "lit", value: 1 },
    },
    score: {
      kind: "reduce",
      of: { kind: "source", source: "guess" },
      op: "sum",
    },
    tieBreak: "share_pool",
    type: "ranking",
  },
  schemaVersion: 3,
});

test("scenarios are deterministic, sized, and not degenerate", () => {
  const first = buildScenarios("EXE-001");
  const again = buildScenarios("EXE-001");
  const other = buildScenarios("EXE-002");

  assert.equal(first.length, TOTAL_SCENARIOS);
  assert.deepEqual(first, again, "the same id must rebuild byte-identically");
  assert.notDeepEqual(first, other, "different ids must not share scenarios");
  for (const scenario of first) {
    const guess = scenario.entries[scenario.targetPlayer];
    assert.equal(guess?.length, 6);
    assert.equal(new Set(guess).size, 6, "a ticket cannot repeat a number");
    assert.equal(scenario.draw.length, 6);
    assert.equal(new Set(scenario.draw).size, 6);
    assert.ok(
      [...(guess ?? []), ...scenario.draw].every(
        (value) => Number.isInteger(value) && value >= 1 && value <= 100,
      ),
    );
  }

  // Uniform random tickets almost never overlap the draw, which would make
  // every match-count rule a certain loss and measure nothing.
  const signature = behaviorSignature(atLeastThree, first);
  assert.ok(signature);
  assert.ok(
    signature.wins > 0 && signature.wins < first.length,
    `at-least-three won ${signature.wins}/${first.length}; the corpus needs both outcomes`,
  );
});

test("a ranking rule is scored against its opponents, not in isolation", () => {
  const scenarios = buildScenarios("EXE-070");
  const contested = scenarios.find(
    (scenario) => Object.keys(scenario.entries).length > 1,
  );
  assert.ok(contested, "ranking rules need competing tickets");

  const highest = { ...contested, entries: { ...contested.entries } };
  // The rule gates on eligibility first, so the winning ticket must both match a
  // drawn number and carry the largest sum. A ticket of 95..100 that matches
  // nothing is correctly a loss, which is what the eligibility clause is for.
  const anchor = contested.draw[0];
  assert.ok(anchor !== undefined);
  highest.entries[highest.targetPlayer] = [
    anchor,
    ...[96, 97, 98, 99, 100, 95]
      .filter((value) => value !== anchor)
      .slice(0, 5),
  ];
  assert.equal(evaluateScenario(rankingAst, highest), true);

  const lowest = { ...contested, entries: { ...contested.entries } };
  lowest.entries[lowest.targetPlayer] = [1, 2, 3, 4, 5, 6];
  lowest.entries["player-B"] = [...contested.draw];
  assert.equal(evaluateScenario(rankingAst, lowest), false);
});

test("every selected mutation actually changes behavior", () => {
  const scenarios = buildScenarios("EXE-001");
  const reference = behaviorSignature(atLeastThree, scenarios);
  assert.ok(reference);
  const { mutations } = selectMutations(atLeastThree, scenarios, 6);

  assert.equal(mutations.length, 6);
  const digests = new Set<string>();
  for (const mutation of mutations) {
    const signature = behaviorSignature(mutation.ast, scenarios);
    assert.ok(signature, `${mutation.note} must evaluate`);
    assert.notEqual(
      signature.digest,
      reference.digest,
      `${mutation.note} is behaviorally identical to the reference`,
    );
    // Two mutants that agree on every scenario are one sample, not two.
    assert.ok(
      !digests.has(signature.digest),
      `${mutation.note} duplicates another mutant`,
    );
    digests.add(signature.digest);
    assert.ok(ruleAstSchema.safeParse(mutation.ast).success);
  }
  // Six variations of one operator would not show the reviewer catches six
  // kinds of defect.
  assert.ok(
    new Set(mutations.map((mutation) => mutation.operator)).size >= 3,
    "mutation selection must spread across operators",
  );
});

test("a rule with no expressible defect reports it instead of inventing one", () => {
  // `count(guess) >= 0` is true for every ticket; no single-dimension edit makes
  // it behave differently on tickets that always have six numbers.
  const vacuous = ast({
    kind: "compare",
    left: {
      kind: "reduce",
      of: { kind: "source", source: "guess" },
      op: "count",
    },
    op: "gte",
    right: { kind: "lit", value: 0 },
  });
  const scenarios = buildScenarios("vacuous");
  const { mutations, unavailableOperators } = selectMutations(
    vacuous,
    scenarios,
    6,
  );
  assert.ok(mutations.length < 6);
  assert.ok(unavailableOperators.includes("boolean_composition"));
});

test("an equivalent alternative is proven equivalent, not assumed", () => {
  const scenarios = buildScenarios("EXE-001");
  const reference = behaviorSignature(atLeastThree, scenarios);
  const equivalent = buildEquivalentAlternative(atLeastThree, scenarios);
  assert.ok(reference && equivalent);
  assert.notDeepEqual(
    equivalent.ast,
    atLeastThree,
    "it must be a different tree",
  );
  assert.equal(
    behaviorSignature(equivalent.ast, scenarios)?.digest,
    reference.digest,
  );
});

test("a mutant that cannot be evaluated is discarded, never scored", () => {
  const scenarios = buildScenarios("EXE-001");
  const broken = { ...atLeastThree, result: { type: "predicate" } } as RuleAst;
  assert.equal(behaviorSignature(broken, scenarios), null);
});
