import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  analyzeInterpretationCoverage,
  buildRuleCompilerSkillPrompt,
  compileRuleArtifact,
  createLocalOnlyProviderRoutingPolicy,
  createCompilerPlaceholder,
  evaluatePredicate,
  getRuleValidationPromptContract,
  hasAmbiguousWording,
  hasExternalDependency,
  hasInvalidConstraint,
  RULE_COMPILER_SKILL_VERSION,
  ruleAstSchema,
  validateAndPrecompileRule,
} from "./index.js";

type PromptTestSetFile =
  | "rule-proposal-prompt-test-set-2.md"
  | "rule-proposal-prompt-test-set.md";

function readPromptRows(expected: "BLOCK" | "CLARIFY" | "VALID", limit: number) {
  const markdown = readFileSync(
    new URL("../../../docs/rule-proposal-prompt-test-set.md", import.meta.url),
    "utf8",
  );
  const rows: string[] = [];
  const pattern = new RegExp(
    String.raw`^\|\s*\d+\s*\|\s*${expected}\s*\|\s*(.*?)\s*\|$`,
    "gm",
  );
  for (const match of markdown.matchAll(pattern)) {
    const prompt = match[1]?.trim();
    if (prompt) {
      rows.push(prompt);
    }
    if (rows.length >= limit) {
      break;
    }
  }
  assert.equal(rows.length, limit);
  return rows;
}

function readPromptRowsById(
  ids: readonly number[],
  fileName: PromptTestSetFile = "rule-proposal-prompt-test-set.md",
) {
  const markdown = readFileSync(
    new URL(`../../../docs/${fileName}`, import.meta.url),
    "utf8",
  );
  const rows = new Map<number, { expected: "BLOCK" | "CLARIFY" | "VALID"; prompt: string }>();
  const pattern = /^\|\s*(\d+)\s*\|\s*(BLOCK|CLARIFY|VALID)\s*\|\s*(.*?)\s*\|$/gm;
  for (const match of markdown.matchAll(pattern)) {
    const id = Number(match[1]);
    if (ids.includes(id)) {
      rows.set(id, {
        expected: match[2] as "BLOCK" | "CLARIFY" | "VALID",
        prompt: match[3]?.trim() ?? "",
      });
    }
  }
  assert.equal(rows.size, ids.length);
  return rows;
}

function tokenCount(prompt: string) {
  return prompt.trim().split(/\s+/).filter(Boolean).length;
}

test("the compile_rule_to_ast skill prompt is versioned and covers both rule modes", () => {
  const prompt = buildRuleCompilerSkillPrompt();
  assert.match(RULE_COMPILER_SKILL_VERSION, /^tyche_rule_compiler_skill_/);
  assert.ok(prompt.includes('"schemaVersion":3'));
  assert.ok(prompt.includes("predicate") && prompt.includes("ranking"));
  // It must teach the digit + ranking path (the previously-impossible case).
  assert.ok(prompt.includes("digits") && prompt.includes("units"));
  // It must teach unordered same-set equality, the prompt #7 simulation case.
  assert.ok(prompt.includes("same set of numbers"));
  // It must teach the compositional idioms for novel rules.
  assert.ok(prompt.includes("pairs_map") && prompt.includes("Shifted zip"));
  assert.ok(prompt.includes("count(intersection(guess,draw)) == 6"));
  // It must teach the prompt 9/10/11/101 harness cases and their variants.
  assert.ok(prompt.includes("guessed sum is greater than the drawn sum"));
  assert.ok(prompt.includes("min(guess) == min(draw)"));
  assert.ok(prompt.includes("max(guess) > max(draw)"));
  assert.ok(prompt.includes("four or more of my picked numbers show up"));
  // It must teach prompt 12/13/103 and sequence 10 reverse-order cases via the
  // core grammar (pairwise zips, quantifiers, filters).
  assert.ok(prompt.includes("second guessed number equals second drawn number"));
  assert.ok(prompt.includes("pairs_forall"));
  assert.ok(prompt.includes("pairs_exists"));
  assert.ok(prompt.includes('"kind":"reverse"'));
  assert.ok(prompt.includes('"kind":"filter"'));
  assert.ok(prompt.includes('"kind":"ite"'));
  assert.ok(prompt.includes('"kind":"contains"'));
  assert.ok(prompt.includes('"kind":"forall"'));
  assert.ok(prompt.includes('"kind":"abs"'));
  assert.ok(prompt.includes("consumedSpans"));
  assert.ok(prompt.includes("workedExamples"));
  assert.ok(prompt.includes("guessSum - drawSum <= -10"));
  assert.ok(prompt.includes('"up":1'));
  assert.ok(prompt.includes("first pick only needs to be higher"));
  assert.ok(prompt.includes("sum(guess) mod 10"));
  assert.ok(prompt.includes("same tens range"));
  assert.ok(prompt.includes("pair.left div 10 == pair.right div 10"));
  assert.ok(prompt.includes("Never\nreplace the rule with a stock match-count example"));
  // And forbid external/unverifiable inputs.
  assert.ok(/wallets|votes|oracle|external/i.test(prompt));
});

test("every worked example in the skill validates against the rule AST schema", () => {
  const markdown = readFileSync(
    new URL("../rule-authoring/references/examples.md", import.meta.url),
    "utf8",
  );
  const lines = markdown
    .split("\n")
    .filter((line) => line.startsWith('{"schemaVersion"'));
  assert.ok(lines.length >= 30, "examples.md must keep its worked examples");
  for (const line of lines) {
    const parsed = ruleAstSchema.safeParse(JSON.parse(line));
    assert.equal(
      parsed.success,
      true,
      `invalid example AST: ${line.slice(0, 120)}...`,
    );
  }
});

test("validates and precompiles a clear match-count rule", () => {
  const result = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    ruleId: 10,
    timestamp: "2026-06-11T00:00:00.000Z",
    tokenCount: 12,
  });

  assert.equal(result.decision, "VALID");
  const ast = result.artifact?.ast;
  assert.ok(
    ast?.schemaVersion === 1 && ast.node.kind === "match_count_at_least",
  );
  assert.equal(ast.node.value, 4);
  assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(result.log.confidenceAction, "ACCEPT");
  assert.ok(result.log.confidence.final_confidence >= 0.85);
  assert.ok(result.log.evaluatedTestCases.every((testCase) => testCase.passed));
  assert.equal(
    result.artifact?.originalText,
    "Win if at least 4 of your numbers appear in the draw.",
  );
  // The interpretation is a pure function of the frozen AST, never the request
  // text — that is what makes it impossible to show a rule the runtime will not
  // execute.
  assert.equal(
    result.artifact?.officialInterpretation,
    "A guess wins if at least 4 of its numbers appear in the official draw, regardless of order.",
  );
  assert.ok((result.artifact?.workedExamples.length ?? 0) > 0);
  assert.equal(result.artifact?.createdAt, "2026-06-11T00:00:00.000Z");
  assert.ok((result.artifact?.generatedTestCases.length ?? 0) > 0);
  assert.ok((result.artifact?.evaluatedTestCases.length ?? 0) > 0);
  assert.ok((result.artifact?.harnessCases.length ?? 0) > 0);
  assert.equal(result.artifact?.skillVersion, RULE_COMPILER_SKILL_VERSION);
  assert.equal(result.artifact?.testHarnessVersion, "2.2.0");
});

test("validates supported sum and exact-order rules", () => {
  const sum = validateAndPrecompileRule({
    prompt:
      "Win if the sum of your numbers equals the sum of the drawn numbers.",
    tokenCount: 14,
  });
  const exact = validateAndPrecompileRule({
    prompt: "Win if your exact sequence matches the draw in the same order.",
    tokenCount: 13,
  });

  assert.equal(sum.decision, "VALID");
  const sumAst = sum.artifact?.ast;
  assert.ok(sumAst?.schemaVersion === 1 && sumAst.node.kind === "sum_equals");
  assert.equal(exact.decision, "VALID");
  const exactAst = exact.artifact?.ast;
  assert.ok(
    exactAst?.schemaVersion === 1 && exactAst.node.kind === "ordered_exact",
  );
});

test("validates unordered same-set rules as all six numbers matched", () => {
  const result = validateAndPrecompileRule({
    prompt:
      "Win if the guess and draw contain the same set of numbers, regardless of order.",
    tokenCount: 14,
  });

  assert.equal(result.decision, "VALID");
  const ast = result.artifact?.ast;
  assert.ok(ast?.schemaVersion === 2 && ast.result.type === "predicate");
  const predicate = ast.result.predicate;
  assert.equal(predicate.kind, "compare");
  assert.equal(predicate.op, "eq");
  assert.deepEqual(predicate.right, { kind: "lit", value: 6 });
  assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/);
});

test("deterministically compiles the canonical most/fewest-matches ranking family", () => {
  const maximizing = [
    "win who guess more number",
    "whoever guesses more numbers wins",
    "The guess with the most drawn numbers wins.",
    "Win if the player matches more numbers than anyone else.",
    "most matches wins",
    "quem acertar mais números ganha",
    "quem tiver mais acertos ganha",
    "vence quem mais acertar",
  ];
  for (const prompt of maximizing) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: prompt.split(/\s+/).length,
    });
    assert.equal(result.decision, "VALID", prompt);
    const ast = result.artifact?.ast;
    assert.ok(
      ast?.schemaVersion === 2 &&
        ast.result.type === "ranking" &&
        ast.result.direction === "max",
      `expected a max ranking for: ${prompt}`,
    );
    assert.equal(result.artifact?.ruleMode, "ranking", prompt);
    assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, prompt);
    assert.equal(result.log.reasonCodes.includes("UNSUPPORTED_RULE"), false, prompt);
  }

  const minimizing = validateAndPrecompileRule({
    prompt: "the winner is whoever matches the fewest drawn numbers",
    tokenCount: 8,
  });
  const minAst = minimizing.artifact?.ast;
  assert.equal(minimizing.decision, "VALID");
  assert.ok(
    minAst?.schemaVersion === 2 &&
      minAst.result.type === "ranking" &&
      minAst.result.direction === "min",
  );

  const missRankings = [
    "ganha quem errar mais números",
    "whoever misses the most numbers",
  ];
  for (const prompt of missRankings) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });
    const ast = result.artifact?.ast;
    assert.equal(result.decision, "VALID", prompt);
    assert.ok(
      ast?.schemaVersion === 2 &&
        ast.result.type === "ranking" &&
        ast.result.direction === "max" &&
        ast.result.score.kind === "reduce" &&
        ast.result.score.of.kind === "difference",
      `expected a max ranking over missed numbers for: ${prompt}`,
    );
  }

  // Absolute thresholds and guess-vs-draw comparatives stay predicates, never a
  // ranking; a specific score qualifier (digits) is left to the LLM path.
  const threshold = validateAndPrecompileRule({
    prompt: "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
    tokenCount: 12,
  }).artifact?.ast;
  assert.ok(threshold?.schemaVersion === 1 && threshold.node.kind === "match_count_at_least");

  const versusDraw = validateAndPrecompileRule({
    prompt: "Win if the guessed numbers contain more multiples of 5 than the drawn numbers.",
    tokenCount: 13,
  }).artifact?.ast;
  assert.ok(
    versusDraw?.schemaVersion === 2 &&
      versusDraw.result.type === "predicate",
    "guess-vs-draw comparative must remain a predicate",
  );
  const portugueseThreshold = validateAndPrecompileRule({
    prompt: "ganha quem acertar pelo menos um numero",
    tokenCount: 6,
  }).artifact?.ast;
  assert.ok(
    portugueseThreshold?.schemaVersion === 1 &&
      portugueseThreshold.node.kind === "match_count_at_least",
    "Portuguese threshold wording must stay predicate, not ranking",
  );
});

test("accepts broad Portuguese match-count threshold variations", () => {
  const prompts = new Map<string, number>([
    ["ganha quem acertar 1 número em qualquer ordem", 1],
    ["premia quem acertar 1 número em qualquer ordem", 1],
    ["prêmeia quer acertar 1 número em qualquer ordem", 1],
    ["ganha quem acertar uma dezena em qualquer ordem", 1],
    ["ganha quem acertar pelo menos um numero", 1],
    ["se tiver um acerto ganha", 1],
    ["um numero certo em qualquer ordem ganha", 1],
    ["acertou uma dezena ganha", 1],
    ["premia qualquer bilhete com 1 acerto", 1],
    ["pelo menos dois números acertados no sorteio", 2],
    ["dois ou mais números acertados no sorteio", 2],
    ["vence com dois ou mais acertos", 2],
    ["acertar duas dezenas vale", 2],
    ["tenha tres numeros corretos", 3],
  ]);

  for (const [prompt, expectedValue] of prompts) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });

    assert.equal(result.decision, "VALID", prompt);
    assert.equal(result.artifact?.ruleMode, "predicate", prompt);
    assert.equal(result.log.reasonCodes.includes("UNSUPPORTED_RULE"), false, prompt);
    assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, prompt);
    const ast = result.artifact?.ast;
    assert.ok(ast?.schemaVersion === 1 && ast.node.kind === "match_count_at_least", prompt);
    assert.equal(ast.node.value, expectedValue, prompt);
  }
});

test("accepts exact Portuguese and English match-count wording as equality", () => {
  const prompts = new Map<string, number>([
    ["exatamente um numero acertado ganha", 1],
    ["apenas uma dezena acertada", 1],
    ["somente 2 acertos", 2],
    ["Win if exactly 3 guessed numbers appear in the draw.", 3],
  ]);

  for (const [prompt, expectedValue] of prompts) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });
    const ast = result.artifact?.ast;
    const predicate =
      ast?.schemaVersion === 2 && ast.result.type === "predicate"
        ? ast.result.predicate
        : null;

    assert.equal(result.decision, "VALID", prompt);
    assert.equal(predicate?.kind, "compare", prompt);
    assert.equal(predicate?.op, "eq", prompt);
    assert.deepEqual(predicate?.right, { kind: "lit", value: expectedValue });
  }
});

test("handles the first 10 VALID prompts from the rule proposal test set", () => {
  const prompts = readPromptRows("VALID", 10);

  for (const [index, prompt] of prompts.entries()) {
    const result = validateAndPrecompileRule({
      prompt,
      ruleId: index + 1,
      tokenCount: tokenCount(prompt),
    });

    assert.equal(result.decision, "VALID", prompt);
    assert.equal(result.log.reasonCodes.includes("UNSUPPORTED_RULE"), false, prompt);
    assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, prompt);
  }
});

test("handles prompts 1-20 from rule proposal test set 2 as valid rules", () => {
  const rows = readPromptRowsById(
    Array.from({ length: 20 }, (_value, index) => index + 1),
    "rule-proposal-prompt-test-set-2.md",
  );

  for (const [ruleId, row] of rows) {
    const result = validateAndPrecompileRule({
      prompt: row.prompt,
      ruleId,
      tokenCount: tokenCount(row.prompt),
    });

    assert.equal(row.expected, "VALID", `#${ruleId}: ${row.prompt}`);
    assert.equal(result.decision, "VALID", `#${ruleId}: ${row.prompt}`);
    assert.equal(
      result.log.reasonCodes.includes("UNSUPPORTED_RULE"),
      false,
      `#${ruleId}: ${row.prompt}`,
    );
    assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, row.prompt);
    assert.ok(
      result.log.evaluatedTestCases.every((testCase) => testCase.passed),
      `#${ruleId}: ${row.prompt}`,
    );
  }

  const predicateKindFor = (ruleId: number) => {
    const row = rows.get(ruleId);
    assert.ok(row, `missing prompt #${ruleId}`);
    const result = validateAndPrecompileRule({
      prompt: row.prompt,
      ruleId,
      tokenCount: tokenCount(row.prompt),
    });
    const ast = result.artifact?.ast;
    return ast?.schemaVersion === 2 && ast.result.type === "predicate"
      ? ast.result.predicate.kind
      : ast?.schemaVersion === 1
        ? ast.node.kind
        : null;
  };

  assert.equal(predicateKindFor(1), "match_count_at_least");
  assert.equal(predicateKindFor(3), "compare");
  assert.equal(predicateKindFor(6), "all_ordered_compare");
  assert.equal(predicateKindFor(7), "compare");
  assert.equal(predicateKindFor(9), "and");
  assert.equal(predicateKindFor(13), "all_ordered_abs_diff_lte");
  assert.equal(predicateKindFor(17), "all_values_between_min_max");
  assert.equal(predicateKindFor(20), "compare");
});

test("preserves selected prompt-test semantics for rule proposal agent prompts", () => {
  const prompts = new Map([
    [
      9,
      "Win if the guessed sum is greater than the drawn sum and at least 2 numbers match.",
    ],
    [
      10,
      "Win if the smallest guessed number equals the smallest drawn number.",
    ],
    [
      11,
      "Win if the largest guessed number is greater than the largest drawn number.",
    ],
    [
      101,
      "I want the win to go to guesses that really show up in the result, like when four or more of my picked numbers are somewhere in the draw.",
    ],
  ]);

  for (const [ruleId, prompt] of prompts) {
    const result = validateAndPrecompileRule({
      prompt,
      ruleId,
      tokenCount: tokenCount(prompt),
    });
    assert.equal(result.decision, "VALID", prompt);
    assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, prompt);
  }

  const compound = validateAndPrecompileRule({
    prompt: prompts.get(9) ?? "",
    ruleId: 9,
    tokenCount: tokenCount(prompts.get(9) ?? ""),
  });
  assert.deepEqual(compound.artifact?.ast, {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "and",
        clauses: [
          {
            kind: "compare",
            left: {
              kind: "reduce",
              of: { kind: "source", source: "guess" },
              op: "sum",
            },
            op: "gt",
            right: {
              kind: "reduce",
              of: { kind: "source", source: "draw" },
              op: "sum",
            },
          },
          {
            kind: "count_at_least",
            of: {
              kind: "intersection",
              left: { kind: "source", source: "guess" },
              right: { kind: "source", source: "draw" },
            },
            value: 2,
          },
        ],
      },
    },
  });

  const casualThreshold = validateAndPrecompileRule({
    prompt: prompts.get(101) ?? "",
    ruleId: 101,
    tokenCount: tokenCount(prompts.get(101) ?? ""),
  });
  const ast = casualThreshold.artifact?.ast;
  assert.ok(ast?.schemaVersion === 1 && ast.node.kind === "match_count_at_least");
  assert.equal(ast.node.value, 4);
});

test("preserves prompt semantics for position, distance, and reverse-order rules", () => {
  const prompts = readPromptRowsById([12, 13, 98, 99, 100, 103]);

  const expected = new Map<number, "BLOCK" | "CLARIFY" | "VALID">([
    [12, "VALID"],
    [13, "VALID"],
    [98, "CLARIFY"],
    [99, "VALID"],
    [100, "VALID"],
    [103, "VALID"],
  ]);

  for (const [ruleId, row] of prompts) {
    assert.equal(row.expected, expected.get(ruleId));
    const result = validateAndPrecompileRule({
      prompt: row.prompt,
      ruleId,
      tokenCount: tokenCount(row.prompt),
    });

    if (row.expected === "VALID") {
      assert.equal(result.decision, "VALID", row.prompt);
      assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, row.prompt);
    } else {
      assert.equal(result.decision, "INVALID", row.prompt);
      assert.ok(result.log.reasonCodes.includes("AMBIGUOUS_RULE"), row.prompt);
      assert.equal(result.artifactHash, null, row.prompt);
    }
  }

  const secondPosition = validateAndPrecompileRule({
    prompt: prompts.get(12)?.prompt ?? "",
    ruleId: 12,
    tokenCount: tokenCount(prompts.get(12)?.prompt ?? ""),
  });
  assert.deepEqual(secondPosition.artifact?.ast, {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        left: { kind: "at", of: { kind: "source", source: "guess" }, index: 1 },
        op: "eq",
        right: { kind: "at", of: { kind: "source", source: "draw" }, index: 1 },
      },
    },
  });

  const absDiff = validateAndPrecompileRule({
    prompt: prompts.get(13)?.prompt ?? "",
    ruleId: 13,
    tokenCount: tokenCount(prompts.get(13)?.prompt ?? ""),
  });
  assert.deepEqual(absDiff.artifact?.ast, {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "all_ordered_abs_diff_lte",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
        value: 5,
      },
    },
  });

  const reverseExact = validateAndPrecompileRule({
    prompt: prompts.get(99)?.prompt ?? "",
    ruleId: 99,
    tokenCount: tokenCount(prompts.get(99)?.prompt ?? ""),
  });
  assert.equal(
    reverseExact.artifact?.ast.schemaVersion === 2 &&
      reverseExact.artifact.ast.result.type === "predicate" &&
      reverseExact.artifact.ast.result.predicate.kind ===
        "reversed_position_match_count_at_least"
      ? reverseExact.artifact.ast.result.predicate.value
      : null,
    6,
  );

  const reverseThreshold = validateAndPrecompileRule({
    prompt: prompts.get(100)?.prompt ?? "",
    ruleId: 100,
    tokenCount: tokenCount(prompts.get(100)?.prompt ?? ""),
  });
  assert.equal(
    reverseThreshold.artifact?.ast.schemaVersion === 2 &&
      reverseThreshold.artifact.ast.result.type === "predicate" &&
      reverseThreshold.artifact.ast.result.predicate.kind ===
        "reversed_position_match_count_at_least"
      ? reverseThreshold.artifact.ast.result.predicate.value
      : null,
    4,
  );

  const firstPickGreater = validateAndPrecompileRule({
    prompt: prompts.get(103)?.prompt ?? "",
    ruleId: 103,
    tokenCount: tokenCount(prompts.get(103)?.prompt ?? ""),
  });
  assert.deepEqual(firstPickGreater.artifact?.ast, {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        left: { kind: "at", of: { kind: "source", source: "guess" }, index: 0 },
        op: "gt",
        right: { kind: "at", of: { kind: "source", source: "draw" }, index: 0 },
      },
    },
  });
});

test("preserves prompt sequence semantics for sequences 8, 9, and 10", () => {
  const prompts = readPromptRowsById([92, 93, 94, 95, 96, 97, 98, 99, 100]);

  const cleanSamePosition = validateAndPrecompileRule({
    prompt: prompts.get(94)?.prompt ?? "",
    ruleId: 94,
    tokenCount: tokenCount(prompts.get(94)?.prompt ?? ""),
  });
  assert.deepEqual(cleanSamePosition.artifact?.ast, {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "ordered_position_match_count_eq",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
        value: 2,
      },
    },
  });

  const closeAmongPlayers = validateAndPrecompileRule({
    prompt: prompts.get(95)?.prompt ?? "",
    ruleId: 95,
    tokenCount: tokenCount(prompts.get(95)?.prompt ?? ""),
  });
  assert.equal(closeAmongPlayers.decision, "INVALID");
  assert.ok(closeAmongPlayers.log.reasonCodes.includes("EXTERNAL_DEPENDENCY"));

  const closeToDraw = validateAndPrecompileRule({
    prompt: prompts.get(96)?.prompt ?? "",
    ruleId: 96,
    tokenCount: tokenCount(prompts.get(96)?.prompt ?? ""),
  });
  assert.equal(closeToDraw.decision, "INVALID");
  assert.ok(closeToDraw.log.reasonCodes.includes("AMBIGUOUS_RULE"));

  const totalDistance = validateAndPrecompileRule({
    prompt: prompts.get(97)?.prompt ?? "",
    ruleId: 97,
    tokenCount: tokenCount(prompts.get(97)?.prompt ?? ""),
  });
  assert.deepEqual(totalDistance.artifact?.ast, {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "total_ordered_abs_diff_lte",
        left: { kind: "source", source: "guess" },
        right: { kind: "source", source: "draw" },
        value: 30,
      },
    },
  });

  const reverseClarify = validateAndPrecompileRule({
    prompt: prompts.get(98)?.prompt ?? "",
    ruleId: 98,
    tokenCount: tokenCount(prompts.get(98)?.prompt ?? ""),
  });
  assert.equal(reverseClarify.decision, "INVALID");
  assert.ok(reverseClarify.log.reasonCodes.includes("AMBIGUOUS_RULE"));

  const reverseExact = validateAndPrecompileRule({
    prompt: prompts.get(99)?.prompt ?? "",
    ruleId: 99,
    tokenCount: tokenCount(prompts.get(99)?.prompt ?? ""),
  });
  const reversePatch = `${prompts.get(99)?.prompt ?? ""} ${prompts.get(100)?.prompt ?? ""}`;
  const reverseThreshold = validateAndPrecompileRule({
    prompt: reversePatch,
    ruleId: 100,
    tokenCount: tokenCount(reversePatch),
  });
  assert.equal(
    reverseExact.artifact?.ast.schemaVersion === 2 &&
      reverseExact.artifact.ast.result.type === "predicate" &&
      reverseExact.artifact.ast.result.predicate.kind ===
        "reversed_position_match_count_at_least"
      ? reverseExact.artifact.ast.result.predicate.value
      : null,
    6,
  );
  assert.equal(
    reverseThreshold.artifact?.ast.schemaVersion === 2 &&
      reverseThreshold.artifact.ast.result.type === "predicate" &&
      reverseThreshold.artifact.ast.result.predicate.kind ===
        "reversed_position_match_count_at_least"
      ? reverseThreshold.artifact.ast.result.predicate.value
      : null,
    4,
  );
});

test("preserves prompt semantics for requested valid, clarify, block, and sequence cases", () => {
  const ids = [
    ...Array.from({ length: 7 }, (_, index) => 14 + index),
    ...Array.from({ length: 9 }, (_, index) => 31 + index),
    ...Array.from({ length: 8 }, (_, index) => 48 + index),
    104,
    105,
    ...Array.from({ length: 6 }, (_, index) => 86 + index),
  ];
  const prompts = readPromptRowsById(ids);

  for (const [ruleId, row] of prompts) {
    const result = validateAndPrecompileRule({
      prompt: row.prompt,
      ruleId,
      tokenCount: tokenCount(row.prompt),
    });
    if (row.expected === "VALID") {
      assert.equal(result.decision, "VALID", row.prompt);
      assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, row.prompt);
    } else {
      assert.equal(result.decision, "INVALID", row.prompt);
      assert.equal(result.artifactHash, null, row.prompt);
    }
  }

  const predicateFor = (ruleId: number) => {
    const prompt = prompts.get(ruleId)?.prompt ?? "";
    const result = validateAndPrecompileRule({
      prompt,
      ruleId,
      tokenCount: tokenCount(prompt),
    });
    return result.artifact?.ast.schemaVersion === 2 &&
      result.artifact.ast.result.type === "predicate"
      ? result.artifact.ast.result.predicate
      : null;
  };

  assert.equal(predicateFor(14)?.kind, "digit_match_count_at_least");
  assert.equal(predicateFor(16)?.kind, "ordered_position_compare_count_eq");
  assert.equal(predicateFor(17)?.kind, "all_values_between_min_max");
  assert.equal(predicateFor(18)?.kind, "compare");
  assert.equal(predicateFor(19)?.kind, "compare");
  assert.equal(predicateFor(20)?.kind, "compare");
  assert.equal(predicateFor(105)?.kind, "compare");

  const compound = predicateFor(91);
  assert.equal(compound?.kind, "and");
  assert.equal(
    compound?.kind === "and" &&
      compound.clauses.some((clause) => clause.kind === "count_at_least"),
    true,
  );
  assert.equal(
    compound?.kind === "and" &&
      compound.clauses.some(
        (clause) => clause.kind === "compare" && clause.op === "lt",
      ),
    true,
  );

  const division = predicateFor(87);
  assert.equal(division?.kind, "and");
});

test("classifies the first 10 CLARIFY prompts as ambiguous", () => {
  const prompts = readPromptRows("CLARIFY", 10);

  for (const prompt of prompts) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });

    assert.equal(result.decision, "INVALID", prompt);
    assert.ok(result.log.reasonCodes.includes("AMBIGUOUS_RULE"), prompt);
    assert.equal(result.artifactHash, null, prompt);
  }
});

test("blocks the first 10 BLOCK prompts as external dependencies", () => {
  const prompts = readPromptRows("BLOCK", 10);

  for (const prompt of prompts) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });

    assert.equal(result.decision, "INVALID", prompt);
    assert.ok(result.log.reasonCodes.includes("EXTERNAL_DEPENDENCY"), prompt);
    assert.equal(result.artifactHash, null, prompt);
  }
});

test("detects provider / AI-subjectivity / meta / social external dependencies", () => {
  // Prompts that previously fell through to the LLM (or were mislabeled as merely
  // ambiguous) must now be caught deterministically as external dependencies so
  // the API preflight can reject them before spending a model call.
  const externalIds = [56, 57, 60, 85, 111];
  for (const [ruleId, row] of readPromptRowsById(externalIds)) {
    assert.equal(
      hasExternalDependency(row.prompt),
      true,
      `#${ruleId} should be flagged external: ${row.prompt}`,
    );
    const result = validateAndPrecompileRule({
      prompt: row.prompt,
      ruleId,
      tokenCount: tokenCount(row.prompt),
    });
    assert.equal(result.decision, "INVALID", row.prompt);
    assert.ok(
      result.log.reasonCodes.includes("EXTERNAL_DEPENDENCY"),
      row.prompt,
    );
  }

  // The guard must not swallow legitimately objective or merely-ambiguous rules.
  const notExternalIds = [21, 24, 27, 29, 30, 40, 82, 84, 106, 108, 110];
  for (const [ruleId, row] of readPromptRowsById(notExternalIds)) {
    assert.equal(
      hasExternalDependency(row.prompt),
      false,
      `#${ruleId} must NOT be flagged external: ${row.prompt}`,
    );
  }

  // Sanity: the exported ambiguity helper still recognizes vague wording.
  assert.equal(hasAmbiguousWording("Win if my numbers are close to the draw."), true);
  assert.equal(
    hasAmbiguousWording(
      "Win if exactly one guessed number matches the drawn number in the same position.",
    ),
    false,
  );
  assert.equal(
    hasExternalDependency(
      "Use the next Solana slot hash as a bonus condition.",
    ),
    true,
  );
  assert.equal(
    hasExternalDependency(
      "Each picked number can be off by five at most from the drawn number in the same slot.",
    ),
    false,
  );
});

test("deterministically compiles filtered-count, sliced-sum, parity, sum-diff and bounded-removal rules", () => {
  const expectedKind: Record<number, string> = {
    24: "compare",
    25: "compare",
    26: "compare",
    27: "all_equal_ordered",
    82: "compare",
    84: "count_at_least",
  };
  for (const [ruleId, row] of readPromptRowsById([24, 25, 26, 27, 82, 84])) {
    const result = validateAndPrecompileRule({
      prompt: row.prompt,
      ruleId,
      tokenCount: tokenCount(row.prompt),
    });
    assert.equal(result.decision, "VALID", `#${ruleId}: ${row.prompt}`);
    assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, row.prompt);
    const ast = result.artifact?.ast;
    const predicate =
      ast?.schemaVersion === 2 && ast.result.type === "predicate"
        ? ast.result.predicate
        : null;
    assert.equal(predicate?.kind, expectedKind[ruleId], `#${ruleId} kind`);
  }

  // Spot-check runtime semantics for the two shapes with the subtlest meaning.
  const parityAst = validateAndPrecompileRule({
    prompt:
      "Win if every guessed number has the same parity as the drawn number in the same position.",
    tokenCount: 16,
  }).artifact!.ast;
  assert.equal(
    evaluatePredicate(parityAst, { guess: [1, 4, 5, 8, 9, 12], draw: [3, 2, 7, 6, 11, 20] }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(parityAst, { guess: [2, 4, 5, 8, 9, 12], draw: [3, 2, 7, 6, 11, 20] }).result,
    "LOSE",
  );

  const removalAst = validateAndPrecompileRule({
    prompt:
      "Remove up to 2 guessed numbers with the largest absolute difference from any drawn number, then win if 3 remaining guessed numbers appear in the draw.",
    tokenCount: 26,
  }).artifact!.ast;
  assert.equal(
    evaluatePredicate(removalAst, { guess: [1, 2, 3, 40, 50, 60], draw: [1, 2, 3, 70, 80, 90] }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(removalAst, { guess: [1, 2, 40, 41, 50, 60], draw: [1, 2, 3, 70, 80, 90] }).result,
    "LOSE",
  );
});

test("deterministically compiles prompt-test-set-2 prompts 21 through 30", () => {
  const ids = Array.from({ length: 10 }, (_, index) => 21 + index);
  const prompts = readPromptRowsById(ids, "rule-proposal-prompt-test-set-2.md");
  const expectedKind: Record<number, string> = {
    21: "compare",
    22: "count_at_least",
    23: "count_at_least",
    24: "compare",
    25: "compare",
    26: "compare",
    27: "all_equal_ordered",
    28: "value_within_any_count_at_least",
    29: "compare",
    30: "ordered_position_match_count_eq",
  };

  const compiled = new Map<number, ReturnType<typeof validateAndPrecompileRule>>();
  for (const [ruleId, row] of prompts) {
    assert.equal(row.expected, "VALID", `#${ruleId}: ${row.prompt}`);
    const result = validateAndPrecompileRule({
      prompt: row.prompt,
      ruleId,
      tokenCount: tokenCount(row.prompt),
    });
    compiled.set(ruleId, result);
    assert.equal(result.decision, "VALID", `#${ruleId}: ${row.prompt}`);
    assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, row.prompt);
    const predicate =
      result.artifact?.ast.schemaVersion === 2 &&
      result.artifact.ast.result.type === "predicate"
        ? result.artifact.ast.result.predicate
        : null;
    assert.equal(predicate?.kind, expectedKind[ruleId], `#${ruleId} kind`);
  }

  const doubled = compiled.get(23)?.artifact?.ast;
  assert.ok(doubled);
  assert.equal(
    evaluatePredicate(doubled, {
      guess: [5, 10, 20, 60, 70, 80],
      draw: [10, 20, 40, 1, 2, 3],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(doubled, {
      guess: [5, 10, 20, 60, 70, 80],
      draw: [10, 20, 120, 1, 2, 3],
    }).result,
    "LOSE",
  );

  const lastThree = compiled.get(26)?.artifact?.ast;
  assert.ok(lastThree);
  assert.equal(
    evaluatePredicate(lastThree, {
      guess: [1, 2, 3, 10, 20, 30],
      draw: [99, 98, 97, 5, 25, 30],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(lastThree, {
      guess: [1, 2, 3, 10, 20, 30],
      draw: [10, 20, 30, 1, 2, 3],
    }).result,
    "LOSE",
  );

  const withinAny = compiled.get(28)?.artifact?.ast;
  assert.ok(withinAny);
  assert.equal(
    evaluatePredicate(withinAny, {
      guess: [8, 29, 41, 62, 90, 100],
      draw: [10, 20, 50, 70, 1, 2],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(withinAny, {
      guess: [8, 29, 41, 90, 95, 100],
      draw: [10, 20, 70, 1, 2, 3],
    }).result,
    "LOSE",
  );

  const modulo = compiled.get(29)?.artifact?.ast;
  assert.ok(modulo);
  assert.equal(
    evaluatePredicate(modulo, {
      guess: [1, 2, 3, 4, 5, 6],
      draw: [11, 12, 13, 14, 15, 16],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(modulo, {
      guess: [1, 2, 3, 4, 5, 6],
      draw: [1, 2, 3, 4, 5, 7],
    }).result,
    "LOSE",
  );

  const exactOnePosition = compiled.get(30)?.artifact?.ast;
  assert.ok(exactOnePosition);
  assert.equal(
    evaluatePredicate(exactOnePosition, {
      guess: [1, 20, 30, 40, 50, 60],
      draw: [1, 2, 3, 4, 5, 6],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(exactOnePosition, {
      guess: [1, 2, 30, 40, 50, 60],
      draw: [1, 2, 3, 4, 5, 6],
    }).result,
    "LOSE",
  );
});

test("compiles defined vague terms (sequences 1 & 2) while keeping bare vague rules ambiguous", () => {
  // Bare vague term -> still needs clarification.
  for (const [, row] of readPromptRowsById([71, 74])) {
    const result = validateAndPrecompileRule({
      prompt: row.prompt,
      tokenCount: tokenCount(row.prompt),
    });
    assert.equal(result.decision, "INVALID", row.prompt);
    assert.ok(result.log.reasonCodes.includes("AMBIGUOUS_RULE"), row.prompt);
  }
  // Same vague word, now explicitly defined with objective, compilable criteria.
  const expectedKind: Record<number, string> = {
    72: "all_ordered_abs_diff_lte",
    75: "and",
    76: "and",
  };
  for (const [ruleId, row] of readPromptRowsById([72, 75, 76])) {
    const result = validateAndPrecompileRule({
      prompt: row.prompt,
      ruleId,
      tokenCount: tokenCount(row.prompt),
    });
    assert.equal(result.decision, "VALID", `#${ruleId}: ${row.prompt}`);
    const ast = result.artifact?.ast;
    const predicate =
      ast?.schemaVersion === 2 && ast.result.type === "predicate"
        ? ast.result.predicate
        : null;
    assert.equal(predicate?.kind, expectedKind[ruleId], `#${ruleId} kind`);
  }

  // #75 semantics: exactly 3 odd and 3 even guessed numbers.
  const balancedAst = validateAndPrecompileRule({
    prompt:
      "Balanced means exactly 3 guessed numbers are odd and exactly 3 are even.",
    tokenCount: 12,
  }).artifact!.ast;
  assert.equal(
    evaluatePredicate(balancedAst, { guess: [1, 3, 5, 2, 4, 6], draw: [9, 9, 9, 9, 9, 9] }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(balancedAst, { guess: [1, 3, 2, 2, 4, 6], draw: [9, 9, 9, 9, 9, 9] }).result,
    "LOSE",
  );
});

test("rejects impossible-by-construction rules (out-of-range value, even-and-odd)", () => {
  for (const [, row] of readPromptRowsById([64, 65])) {
    assert.equal(hasInvalidConstraint(row.prompt), true, row.prompt);
  }
  // Must not fire on legitimate in-range references or thresholds.
  for (const [, row] of readPromptRowsById([23, 28, 82])) {
    assert.equal(hasInvalidConstraint(row.prompt), false, row.prompt);
  }
});

test("fails ambiguous or external-dependent rules closed", () => {
  const ambiguous = validateAndPrecompileRule({
    prompt: "Win if your guess is close to the draw.",
    tokenCount: 9,
  });
  const external = validateAndPrecompileRule({
    prompt: "Win if the creator wallet has the most votes.",
    tokenCount: 10,
  });

  assert.equal(ambiguous.decision, "INVALID");
  assert.ok(ambiguous.log.reasonCodes.includes("AMBIGUOUS_RULE"));
  assert.equal(external.decision, "INVALID");
  assert.ok(external.log.reasonCodes.includes("EXTERNAL_DEPENDENCY"));
});

test("requires clarification when an example implies unspecified digit matching", () => {
  const result = validateAndPrecompileRule({
    prompt:
      "Venço se eu acertar qualquer número em qualquer ordem. Por exemplo, se eu jogar 12 e sair 10 e 20, eu venço tanto por ter acertado o número 1 quanto o número 2.",
    tokenCount: 38,
  });

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifact, null);
  assert.ok(result.log.reasonCodes.includes("AMBIGUOUS_RULE"));
});

test("compiles an all-position tens-range example without turning it into exact equality", () => {
  const result = validateAndPrecompileRule({
    prompt:
      "Vence quem acertar todas as dezenas na mesma ordem. Por exemplo, se sair 12 31 24 e eu jogar 11 30 29, eu venço pois acertei as dezenas na ordem (10 30 20).",
    tokenCount: 42,
  });

  assert.equal(result.decision, "VALID");
  assert.equal(result.artifact?.ast.schemaVersion, 3);
  assert.equal(
    evaluatePredicate(result.artifact!.ast, {
      draw: [12, 31, 24, 45, 56, 67],
      guess: [11, 30, 29, 49, 50, 69],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(result.artifact!.ast, {
      draw: [12, 31, 24, 45, 56, 67],
      guess: [11, 30, 29, 49, 50, 79],
    }).result,
    "LOSE",
  );
  assert.equal(
    evaluatePredicate(result.artifact!.ast, {
      draw: [100, 31, 24, 45, 56, 67],
      guess: [99, 30, 29, 49, 50, 69],
    }).result,
    "LOSE",
  );
});

test("fails unsupported rules without producing an artifact", () => {
  const result = validateAndPrecompileRule({
    prompt: "Win if all numbers are prime.",
    tokenCount: 7,
  });

  assert.equal(result.decision, "INVALID");
  assert.equal(result.log.confidenceAction, "REJECT");
  assert.equal(result.artifactHash, null);
  assert.ok(result.log.reasonCodes.includes("UNSUPPORTED_RULE"));
});

test("escalates disagreement-band rules without accepting artifacts", () => {
  const result = validateAndPrecompileRule({
    prompt:
      "Win if at least 4 of your numbers appear in the draw and the creator wallet has votes.",
    tokenCount: 17,
  });

  assert.equal(result.decision, "INVALID");
  assert.equal(result.log.confidenceAction, "ESCALATE");
  assert.equal(result.artifactHash, null);
  assert.ok(result.log.reasonCodes.includes("EXTERNAL_DEPENDENCY"));
  assert.ok(result.log.confidence.final_confidence >= 0.7);
  assert.ok(result.log.confidence.final_confidence < 0.85);
});

test("rejects malformed empty rules conservatively", () => {
  const result = validateAndPrecompileRule({
    prompt: "   ",
    tokenCount: 0,
  });

  assert.equal(result.decision, "INVALID");
  assert.equal(result.log.confidenceAction, "REJECT");
  assert.equal(result.artifactHash, null);
  assert.ok(result.log.confidence.final_confidence < 0.7);
});

test("keeps the legacy compiler placeholder backed by validation", () => {
  const result = createCompilerPlaceholder({
    prompt: "Win if at least four numbers match the draw.",
    tokenCount: 9,
  });

  assert.ok(
    result.ast.schemaVersion === 1 &&
      result.ast.node.kind === "match_count_at_least",
  );
});

test("compiles an LLM-emitted v2 ranking AST (digit rule) to a VALID artifact", async () => {
  const rankingAst = {
    schemaVersion: 2,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      score: {
        kind: "reduce",
        op: "count",
        of: {
          kind: "intersection",
          left: {
            kind: "digits",
            place: "units",
            of: { kind: "source", source: "guess" },
          },
          right: {
            kind: "digits",
            place: "units",
            of: { kind: "source", source: "draw" },
          },
        },
      },
    },
  };
  const result = await compileRuleArtifact(
    {
      prompt:
        "The winner is whoever matches the most units digits of the draw.",
      tokenCount: 14,
    },
    { astProvider: async () => rankingAst },
  );

  assert.equal(result.decision, "VALID");
  assert.equal(result.artifact?.ruleMode, "ranking");
  assert.equal(result.artifact?.schemaVersion, 2);
  assert.ok(result.artifact?.constrainedDecodingUsed);
  assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/);
});

test("accepts a semantically equivalent LLM v2 AST for a known threshold rule", async () => {
  const v2MatchCount = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "count_at_least",
        value: 4,
        of: {
          kind: "intersection",
          left: { kind: "source", source: "guess" },
          right: { kind: "source", source: "draw" },
        },
      },
    },
  };
  const result = await compileRuleArtifact(
    {
      officialInterpretation:
        "Win when at least four guessed numbers appear in the draw.",
      originalText: "Win if at least 4 of your numbers appear in the draw.",
      prompt: "Win if at least 4 of your numbers appear in the draw.",
      timestamp: "2026-06-11T00:00:00.000Z",
      tokenCount: 12,
    },
    { astProvider: async () => v2MatchCount },
  );

  assert.equal(result.decision, "VALID");
  assert.equal(result.artifact?.schemaVersion, 2);
  // Model prose supplied on the request is ignored: the interpretation must
  // describe the AST that was actually frozen.
  assert.equal(
    result.artifact?.officialInterpretation,
    "A guess wins if at least 4 of its numbers appear in the official draw, regardless of order.",
  );
  assert.equal(
    result.artifact?.originalText,
    "Win if at least 4 of your numbers appear in the draw.",
  );
});

test("accepts an LLM-emitted v3 core AST that matches the reviewer semantically", async () => {
  // v3 desugared form of "at least 4 guessed numbers appear in the draw"; the
  // deterministic reviewer compiles the same prompt to a v1 macro, so only the
  // sampled semantic equivalence can certify agreement across versions.
  const v3MatchCount = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op: "gte",
        left: {
          kind: "reduce",
          op: "count",
          of: {
            kind: "intersection",
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
          },
        },
        right: { kind: "lit", value: 4 },
      },
    },
  };
  const result = await compileRuleArtifact(
    {
      prompt: "Win if at least 4 of your numbers appear in the draw.",
      tokenCount: 12,
    },
    { astProvider: async () => v3MatchCount },
  );

  assert.equal(result.decision, "VALID");
  assert.equal(result.artifact?.schemaVersion, 3);
  assert.equal(result.artifact?.ruleMode, "predicate");
  assert.ok(!result.log.reasonCodes.includes("REVIEWER_MISMATCH"));
});

test("compiles a novel v3 composition no specialized v2 kind can express", async () => {
  // "At least four picks within 3 of the drawn number in the same slot" — the
  // counted same-position near-match from the rule-algebra design doc.
  const countedNearSlots = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op: "gte",
        left: {
          kind: "reduce",
          op: "sum",
          of: {
            kind: "pairs_map",
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
            expr: {
              kind: "ite",
              if: {
                kind: "compare",
                op: "lte",
                left: {
                  kind: "abs",
                  of: {
                    kind: "arith",
                    op: "sub",
                    left: { kind: "pair", side: "left" },
                    right: { kind: "pair", side: "right" },
                  },
                },
                right: { kind: "lit", value: 3 },
              },
              then: { kind: "lit", value: 1 },
              else: { kind: "lit", value: 0 },
            },
          },
        },
        right: { kind: "lit", value: 4 },
      },
    },
  };
  const result = await compileRuleArtifact(
    {
      prompt:
        "Win when at least four guessed numbers are within 3 of the drawn number in the same position.",
      tokenCount: 18,
    },
    { astProvider: async () => countedNearSlots },
  );

  assert.equal(result.decision, "VALID");
  assert.equal(result.artifact?.schemaVersion, 3);
  assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/);
});

test("rejects a v3 AST that semantically contradicts the deterministic reviewer", async () => {
  // Reviewer compiles "none of my numbers appear" to count == 0; the provider
  // emits the complement (count >= 1), which diverges on every sampled input.
  const complementAst = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op: "gte",
        left: {
          kind: "reduce",
          op: "count",
          of: {
            kind: "intersection",
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
          },
        },
        right: { kind: "lit", value: 1 },
      },
    },
  };
  const result = await compileRuleArtifact(
    {
      prompt: "None of my numbers appear in the draw.",
      tokenCount: 8,
    },
    { astProvider: async () => complementAst },
  );

  assert.equal(result.decision, "INVALID");
  assert.ok(result.log.reasonCodes.includes("REVIEWER_MISMATCH"));
});

test("rejects a text-to-AST reviewer mismatch from an LLM provider", async () => {
  const wrongAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        left: {
          kind: "reduce",
          op: "sum",
          of: { kind: "source", source: "guess" },
        },
        op: "eq",
        right: {
          kind: "reduce",
          op: "sum",
          of: { kind: "source", source: "draw" },
        },
      },
    },
  };
  const result = await compileRuleArtifact(
    {
      prompt: "Win if at least 4 of your numbers appear in the draw.",
      tokenCount: 12,
    },
    { astProvider: async () => wrongAst },
  );

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifactHash, null);
  assert.ok(result.log.reasonCodes.includes("REVIEWER_MISMATCH"));
});

test("provider source spans reject an omitted clause without a conjunction heuristic", async () => {
  const text =
    "A guess wins if all six guessed numbers are strictly greater than 10 and strictly less than 90.";
  const rangeAst = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "forall",
        of: { kind: "source", source: "guess" },
        where: {
          kind: "and",
          clauses: [
            {
              kind: "compare",
              left: { kind: "elem" },
              op: "gt",
              right: { kind: "lit", value: 10 },
            },
            {
              kind: "compare",
              left: { kind: "elem" },
              op: "lt",
              right: { kind: "lit", value: 90 },
            },
          ],
        },
      },
    },
  };
  const workedExamples = [
    {
      draw: [1, 2, 3, 4, 5, 6],
      guess: [11, 20, 30, 40, 50, 89],
      outcome: "WIN" as const,
    },
    {
      draw: [1, 2, 3, 4, 5, 6],
      guess: [10, 20, 30, 40, 50, 89],
      outcome: "LOSE" as const,
    },
  ];

  const omitted = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast: rangeAst,
        consumedSpans: [
          { text: "all six guessed numbers are strictly greater than 10" },
        ],
        workedExamples,
      }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(omitted.decision, "INVALID");
  assert.ok(omitted.log.reasonCodes.includes("INTERPRETATION_MISMATCH"));

  const complete = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast: rangeAst,
        // One source span is valid here: it records that the quantified range
        // consumed both bounds. No AST `and` node count is inferred from prose.
        consumedSpans: [{ text: text.toLowerCase() }],
        workedExamples,
      }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(complete.decision, "VALID");
  assert.deepEqual(complete.artifact?.workedExamples, workedExamples);
});

test("provider worked examples catch an inverted signed bound", async () => {
  const text =
    "After adding ten to my ticket total, it must still be below the draw total.";
  const wrongSignAst = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        left: {
          kind: "arith",
          left: { kind: "reduce", of: { kind: "source", source: "guess" }, op: "sum" },
          op: "sub",
          right: { kind: "reduce", of: { kind: "source", source: "draw" }, op: "sum" },
        },
        op: "lte",
        right: { kind: "lit", value: 10 },
      },
    },
  };
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast: wrongSignAst,
        consumedSpans: [{ text: text.toLowerCase() }],
        workedExamples: [
          {
            draw: [10, 20, 30, 40, 50, 60],
            guess: [5, 15, 25, 35, 55, 65],
            outcome: "WIN",
          },
          {
            draw: [10, 20, 30, 40, 50, 60],
            guess: [5, 15, 25, 35, 56, 65],
            outcome: "LOSE",
          },
        ],
      }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(result.decision, "INVALID");
  assert.ok(result.log.reasonCodes.includes("INTERPRETATION_MISMATCH"));
});

test("can prefer deterministic compilation for known preflight patterns", async () => {
  let providerCalled = false;
  const result = await compileRuleArtifact(
    {
      prompt:
        "Win if the guessed sum is greater than the drawn sum and at least 2 numbers match.",
      tokenCount: 16,
    },
    {
      astProvider: async () => {
        providerCalled = true;
        throw new Error("provider should not be needed for supported grammar");
      },
      preferDeterministic: true,
    },
  );

  assert.equal(providerCalled, false);
  assert.equal(result.decision, "VALID");
  assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/);
  assert.match(
    result.artifact?.officialInterpretation ?? "",
    /sum of the guess's six numbers.*greater than.*sum of the official draw's six numbers.*at least 2/i,
  );

  const minResult = await compileRuleArtifact(
    {
      prompt:
        "Win if the smallest guessed number equals the smallest drawn number.",
      tokenCount: 10,
    },
    {
      astProvider: async () => {
        throw new Error("provider should not be needed for supported grammar");
      },
      preferDeterministic: true,
    },
  );

  assert.equal(minResult.decision, "VALID");
  assert.match(
    minResult.artifact?.officialInterpretation ?? "",
    /smallest number in the guess is equal to the smallest number in the official draw/i,
  );
});

test("rejects an LLM response that is not a valid AST and escalates", async () => {
  const result = await compileRuleArtifact(
    { prompt: "Win if the numbers feel lucky.", tokenCount: 7 },
    { astProvider: async () => ({ totally: "not an ast" }) },
  );

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifactHash, null);
  assert.ok(result.log.reasonCodes.includes("SCHEMA_INVALID"));
});

test("rejects an LLM-emitted ALWAYS_TRUE rule (PRD 6.8)", async () => {
  // A rule every guess wins cannot distinguish winners from losers, so electing
  // it only burns a turn — PRD §6.8 rejects it.
  const alwaysTrue = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "count_at_least",
        value: 0,
        of: { kind: "source", source: "guess" },
      },
    },
  };
  const result = await compileRuleArtifact(
    { prompt: "Everyone always wins.", tokenCount: 5 },
    { astProvider: async () => alwaysTrue },
  );

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifact, null);
  assert.equal(result.log.difficultyClass, "ALWAYS_TRUE");
  assert.ok(result.log.reasonCodes.includes("DIFFICULTY_ALWAYS_TRUE"));
});

test("exposes the prompt contract for audit", () => {
  const contract = getRuleValidationPromptContract();

  assert.equal(contract.version, "tyche_rule_validation_prompt_v2");
  assert.equal(contract.output, "RuleCompilationCandidate | INVALID");
  assert.deepEqual(contract.allowedInputs, ["guess", "draw"]);
});

test("stores canonical confidence breakdown and configured policy", () => {
  const result = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    tokenCount: 12,
  });

  assert.deepEqual(Object.keys(result.log.confidence).sort(), [
    "compiler_confidence",
    "final_confidence",
    "model_confidence",
    "reviewer_agreement_score",
    "rule_clarity_score",
    "runtime_safety_score",
    "schema_score",
    "test_coverage_score",
  ]);
  assert.deepEqual(result.log.confidenceWeights, {
    compiler_confidence: 0.2,
    model_confidence: 0.2,
    reviewer_agreement_score: 0.15,
    rule_clarity_score: 0.2,
    runtime_safety_score: 0.05,
    schema_score: 0.05,
    test_coverage_score: 0.15,
  });
  assert.deepEqual(result.log.confidenceThresholds, {
    accept_min: 0.85,
    escalate_min: 0.7,
  });
});

test("uses the primary provider only for accepted rules", () => {
  const result = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    tokenCount: 12,
  });

  assert.equal(result.decision, "VALID");
  assert.equal(result.log.fallbackTriggered, false);
  assert.equal(result.log.fallbackRateSample, 0);
  assert.equal(result.log.providerDisagreementRateSample, 0);
  assert.equal(result.log.providerPath.length, 1);
  assert.equal(result.log.providerPath[0]?.priority, "primary");
  assert.equal(result.artifact?.modelIdentity.provider, result.log.provider);
  assert.deepEqual(result.artifact?.providerPath, result.log.providerPath);
});

test("escalates timeout, malformed, and schema failures through provider path", () => {
  const timeout = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    providerFailureModeByPriority: { primary: "timeout" },
    tokenCount: 12,
  });
  const malformed = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    providerFailureModeByPriority: { primary: "malformed_response" },
    tokenCount: 12,
  });
  const schemaFailure = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    providerFailureModeByPriority: { primary: "schema_validation_failure" },
    tokenCount: 12,
  });

  for (const result of [timeout, malformed, schemaFailure]) {
    assert.equal(result.decision, "VALID");
    assert.equal(result.log.fallbackTriggered, true);
    assert.equal(result.log.fallbackRateSample, 1);
    assert.equal(result.log.providerDisagreementRateSample, 0);
    assert.equal(result.log.providerPath.length, 2);
    assert.equal(result.log.providerPath[0]?.priority, "primary");
    assert.equal(result.log.providerPath[1]?.priority, "secondary");
  }

  assert.equal(timeout.log.providerPath[0]?.status, "timeout");
  assert.equal(malformed.log.providerPath[0]?.status, "malformed_response");
  assert.equal(
    schemaFailure.log.providerPath[0]?.status,
    "schema_validation_failed",
  );
});

test("supports local-only OpenAI-compatible routing with Ollama request shape", () => {
  const result = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    providerRouting: createLocalOnlyProviderRoutingPolicy(
      "http://localhost:11434/v1",
    ),
    tokenCount: 12,
  });

  assert.equal(result.decision, "VALID");
  assert.equal(result.log.providerPath.length, 1);
  assert.equal(result.log.providerPath[0]?.request_shape, "ollama_format");
  assert.equal(
    result.log.providerPath[0]?.capability_flags.openai_compatible,
    true,
  );
  assert.equal(
    result.log.providerPath[0]?.capability_flags.grammar_constrained_decoding,
    true,
  );
  assert.equal(result.log.modelIdentity.serving_engine, "ollama");
});

test("uses tertiary path and fails closed when providers disagree", () => {
  const result = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    providerConfidenceActionByPriority: {
      primary: "ESCALATE",
      tertiary: "REJECT",
    },
    tokenCount: 12,
  });

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifactHash, null);
  assert.equal(result.log.fallbackTriggered, true);
  assert.equal(result.log.providerDisagreementRateSample, 1);
  assert.ok(result.log.reasonCodes.includes("PROVIDER_DISAGREEMENT"));
  assert.deepEqual(
    result.log.providerPath.map((attempt) => attempt.priority),
    ["primary", "secondary", "tertiary"],
  );
});

// --- Regression: turn 55 shipped an artifact that did not match its own card ---
// The elected rule read "guess is exactly {1,2,3,4,5,6} and a drawn number is in
// [1,99]" but compiled to `count(guess ∩ draw) == 6`, so the only player who
// followed the card to the letter lost, and the alternative pool paid nobody.

const TURN_55_TEXT =
  "a guess wins if its six numbers are exactly the set {1, 2, 3, 4, 5, 6}, ignoring order, and at least one of the six drawn numbers is between 1 and 99 inclusive on both endpoints.";

const TURN_55_COMPILED_AST = {
  schemaVersion: 2,
  result: {
    type: "predicate",
    predicate: {
      kind: "compare",
      left: {
        kind: "reduce",
        of: {
          kind: "intersection",
          left: { kind: "source", source: "guess" },
          right: { kind: "source", source: "draw" },
        },
        op: "count",
      },
      op: "eq",
      right: { kind: "lit", value: 6 },
    },
  },
} as const;

test("rejects an artifact that dropped numeric conditions stated in the rule", async () => {
  const result = await compileRuleArtifact(
    {
      officialInterpretation:
        "A guess wins if the count of guessed numbers that appear in the official draw is equal to 6.",
      originalText: TURN_55_TEXT,
      prompt: TURN_55_TEXT,
      tokenCount: 47,
    },
    { astProvider: async () => TURN_55_COMPILED_AST },
  );

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifact, null);
  assert.equal(result.artifactHash, null);
  // The deterministic reviewer now has a reference reading for this family, so
  // the rejection comes from behavioural disagreement rather than from literal
  // matching — a strictly stronger signal.
  assert.ok(result.log.reasonCodes.includes("REVIEWER_MISMATCH"));
});

test("elects the same rule when the provider compiles it faithfully", async () => {
  // The turn-55 wording must be usable, not merely blocked: both faithful
  // encodings of "exactly {1..6}" have to survive, including the terse one whose
  // AST never mentions 2, 3, 4 or 5.
  const drawInRange = {
    kind: "exists",
    of: { kind: "source", source: "draw" },
    where: {
      kind: "and",
      clauses: [
        { kind: "compare", left: { kind: "elem" }, op: "gte", right: { kind: "lit", value: 1 } },
        { kind: "compare", left: { kind: "elem" }, op: "lte", right: { kind: "lit", value: 99 } },
      ],
    },
  };
  const encodings = {
    terse: {
      kind: "and",
      clauses: [
        {
          kind: "forall",
          of: { kind: "source", source: "guess" },
          where: { kind: "compare", left: { kind: "elem" }, op: "lte", right: { kind: "lit", value: 6 } },
        },
        drawInRange,
      ],
    },
    explicit: {
      kind: "and",
      clauses: [
        ...[1, 2, 3, 4, 5, 6].map((value) => ({
          kind: "contains",
          array: { kind: "source", source: "guess" },
          value: { kind: "lit", value },
        })),
        drawInRange,
      ],
    },
  };

  for (const predicate of Object.values(encodings)) {
    const result = await compileRuleArtifact(
      { originalText: TURN_55_TEXT, prompt: TURN_55_TEXT, tokenCount: 47 },
      {
        astProvider: async () => ({
          schemaVersion: 3,
          result: { type: "predicate", predicate },
        }),
      },
    );
    assert.equal(result.decision, "VALID");
    assert.equal(result.log.difficultyClass, "EXTREME");
    assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/);
  }
});

test("states the frozen rule in the player's own terms, with worked examples", () => {
  const result = validateAndPrecompileRule({
    originalText: TURN_55_TEXT,
    prompt: TURN_55_TEXT,
    tokenCount: 47,
  });

  assert.equal(result.decision, "VALID");
  assert.equal(
    result.artifact?.officialInterpretation,
    "A guess wins if your six numbers are exactly 1, 2, 3, 4, 5 and 6, in any order and at least one of the drawn numbers is between 1 and 99 (both included).",
  );

  const examples = result.artifact?.workedExamples ?? [];
  assert.ok(examples.some((example) => example.outcome === "WIN"));
  assert.ok(examples.some((example) => example.outcome === "LOSE"));
  // Every example must be reproducible against the frozen AST itself.
  for (const example of examples) {
    assert.equal(
      evaluatePredicate(result.artifact!.ast, {
        draw: [...example.draw],
        guess: [...example.guess],
      }).result,
      example.outcome,
    );
  }
});

test("reports every dropped value and keeps a faithful artifact covered", () => {
  const dropped = analyzeInterpretationCoverage({
    ast: TURN_55_COMPILED_AST,
    officialInterpretation:
      "A guess wins if the count of guessed numbers that appear in the official draw is equal to 6.",
    text: TURN_55_TEXT,
  });
  assert.equal(dropped.covered, false);
  assert.deepEqual(dropped.missingFromAst, [1, 2, 3, 4, 5, 99]);
  assert.deepEqual(dropped.missingFromInterpretation, [1, 2, 3, 4, 5, 99]);

  const faithful = analyzeInterpretationCoverage({
    ast: {
      schemaVersion: 2,
      result: {
        type: "predicate",
        predicate: {
          kind: "compare",
          left: {
            kind: "reduce",
            of: {
              kind: "intersection",
              left: { kind: "source", source: "guess" },
              right: { kind: "source", source: "draw" },
            },
            op: "count",
          },
          op: "gte",
          right: { kind: "lit", value: 4 },
        },
      },
    },
    officialInterpretation:
      "A guess wins if at least 4 guessed numbers appear in the official draw.",
    text: "Win if at least 4 of your numbers appear in the draw.",
  });
  assert.equal(faithful.covered, true);
});

test("coverage ignores illustrative examples and full-domain ranges", () => {
  // Numbers used to illustrate a rule are not conditions the AST must carry.
  const withExample = analyzeInterpretationCoverage({
    ast: {
      schemaVersion: 1,
      node: { kind: "ordered_exact" },
    },
    officialInterpretation:
      "A guess wins if every guessed number equals the official drawn number in the same position.",
    text: "Win if your numbers match the draw in the same order. For example, if 12 31 24 is drawn you must play 12 31 24.",
  });
  assert.deepEqual(withExample.requiredValues, []);
  assert.equal(withExample.covered, true);

  // "between 1 and 100" spans the whole number domain, so dropping it in
  // compilation loses no meaning and must not be reported as a mismatch.
  const vacuousRange = analyzeInterpretationCoverage({
    ast: {
      schemaVersion: 1,
      node: { kind: "match_count_at_least", value: 6 },
    },
    officialInterpretation:
      "A guess wins if all six guessed numbers appear in the official draw.",
    text: "Win if all your numbers are drawn and the first drawn number is between 1 and 100.",
  });
  assert.deepEqual(vacuousRange.requiredValues, []);
  assert.equal(vacuousRange.covered, true);
});

test("rejects rules that no guess can win and rules every guess wins (PRD 6.8)", async () => {
  // Self-contradictory: the same count cannot be both 0 and 6.
  const impossible = await compileRuleArtifact(
    {
      originalText: "Win only if you match none and all of the drawn numbers.",
      prompt: "Win only if you match none and all of the drawn numbers.",
      tokenCount: 20,
    },
    {
      astProvider: async () => ({
        schemaVersion: 2,
        result: {
          type: "predicate",
          predicate: {
            kind: "and",
            clauses: [0, 6].map((value) => ({
              kind: "compare",
              left: {
                kind: "reduce",
                of: {
                  kind: "intersection",
                  left: { kind: "source", source: "guess" },
                  right: { kind: "source", source: "draw" },
                },
                op: "count",
              },
              op: "eq",
              right: { kind: "lit", value },
            })),
          },
        },
      }),
    },
  );
  assert.equal(impossible.log.difficultyClass, "IMPOSSIBLE");
  assert.equal(impossible.decision, "INVALID");
  assert.equal(impossible.artifact, null);
  assert.ok(impossible.log.reasonCodes.includes("DIFFICULTY_IMPOSSIBLE"));

  const alwaysTrue = await compileRuleArtifact(
    {
      originalText: "Win if your numbers count is at least zero.",
      prompt: "Win if your numbers count is at least zero.",
      tokenCount: 12,
    },
    {
      astProvider: async () => ({
        schemaVersion: 2,
        result: {
          type: "predicate",
          predicate: {
            kind: "compare",
            left: {
              kind: "reduce",
              of: { kind: "source", source: "guess" },
              op: "count",
            },
            op: "gte",
            right: { kind: "lit", value: 0 },
          },
        },
      }),
    },
  );
  assert.equal(alwaysTrue.log.difficultyClass, "ALWAYS_TRUE");
  assert.equal(alwaysTrue.decision, "INVALID");
  assert.equal(alwaysTrue.artifact, null);
  assert.ok(alwaysTrue.log.reasonCodes.includes("DIFFICULTY_ALWAYS_TRUE"));
});

test("keeps a legitimately rare rule winnable instead of impossible", () => {
  // "At least 4 of 6 from 100" wins ~1.4e-5 of the time: zero wins in any
  // feasible uniform sample, but a constructible winner exists.
  const rare = validateAndPrecompileRule({
    originalText: "Win if at least 4 of your numbers appear in the draw.",
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    tokenCount: 12,
  });
  assert.equal(rare.log.estimatedWinRate, 0);
  assert.equal(rare.log.difficultyClass, "EXTREME");
  assert.equal(rare.decision, "VALID");
  assert.ok(!rare.log.reasonCodes.includes("DIFFICULTY_IMPOSSIBLE"));
});

// --- Layer 2: a second opinion where no deterministic reading exists ----------

const NO_REFERENCE_PROMPT =
  "After adding ten to my ticket total, it must still be below the draw total.";

function sumCompareAst(op: "gt" | "lt", offset: number) {
  return {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op,
        left: {
          kind: "reduce",
          op: "sum",
          of: { kind: "source", source: "guess" },
        },
        right: {
          kind: "arith",
          op: "sub",
          left: {
            kind: "reduce",
            op: "sum",
            of: { kind: "source", source: "draw" },
          },
          right: { kind: "lit", value: offset },
        },
      },
    },
  };
}

test("buys a second opinion only when no deterministic reading exists", async () => {
  let calls = 0;
  const withReference = await compileRuleArtifact(
    {
      originalText: "Win if at least 4 of your numbers appear in the draw.",
      prompt: "Win if at least 4 of your numbers appear in the draw.",
      tokenCount: 12,
    },
    {
      astProvider: async () => {
        calls += 1;
        return { schemaVersion: 1, node: { kind: "match_count_at_least", value: 4 } };
      },
    },
  );
  assert.equal(withReference.decision, "VALID");
  // The deterministic reviewer already corroborates it — no extra call spent.
  assert.equal(calls, 1);
  assert.ok(
    !withReference.log.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"),
  );

  calls = 0;
  const withoutReference = await compileRuleArtifact(
    { originalText: NO_REFERENCE_PROMPT, prompt: NO_REFERENCE_PROMPT, tokenCount: 14 },
    {
      astProvider: async () => {
        calls += 1;
        return sumCompareAst("lt", 10);
      },
    },
  );
  assert.equal(withoutReference.decision, "VALID");
  assert.ok(calls >= 2, `expected a second opinion, got ${calls} call(s)`);
  assert.equal(withoutReference.log.providerDisagreementRateSample, 0);
});

test("fails closed when two providers compile the same text differently", async () => {
  const answers = [sumCompareAst("lt", 10), sumCompareAst("gt", 10)];
  let index = 0;
  const result = await compileRuleArtifact(
    { originalText: NO_REFERENCE_PROMPT, prompt: NO_REFERENCE_PROMPT, tokenCount: 14 },
    {
      astProvider: async () => answers[index++] ?? answers[0],
    },
  );

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifact, null);
  assert.equal(result.log.providerDisagreementRateSample, 1);
  assert.ok(result.log.reasonCodes.includes("PROVIDER_DISAGREEMENT"));
});

test("treats an equivalent rewrite as agreement, not disagreement", async () => {
  // Same rule, two shapes: `sum(guess) < sum(draw) - 10` and the algebraically
  // identical `sum(guess) + 10 < sum(draw)`. Serialized ASTs differ; behaviour
  // does not, and only behaviour decides who gets paid.
  const shifted = {
    schemaVersion: 2,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op: "lt",
        left: {
          kind: "arith",
          op: "add",
          left: { kind: "reduce", op: "sum", of: { kind: "source", source: "guess" } },
          right: { kind: "lit", value: 10 },
        },
        right: { kind: "reduce", op: "sum", of: { kind: "source", source: "draw" } },
      },
    },
  };
  const answers = [sumCompareAst("lt", 10), shifted];
  let index = 0;
  const result = await compileRuleArtifact(
    { originalText: NO_REFERENCE_PROMPT, prompt: NO_REFERENCE_PROMPT, tokenCount: 14 },
    { astProvider: async () => answers[index++] ?? answers[0] },
  );

  assert.equal(result.log.providerDisagreementRateSample, 0);
  assert.equal(result.decision, "VALID");
});

test("records that a required second opinion could not be obtained", async () => {
  let calls = 0;
  const result = await compileRuleArtifact(
    { originalText: NO_REFERENCE_PROMPT, prompt: NO_REFERENCE_PROMPT, tokenCount: 14 },
    {
      astProvider: async () => {
        calls += 1;
        // Only the first provider answers; every later attempt fails.
        if (calls > 1) throw new Error("provider unreachable");
        return sumCompareAst("lt", 10);
      },
    },
  );

  assert.equal(result.decision, "VALID");
  assert.ok(result.log.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"));
});

// Regression set from the 2026-08-11 rule-agent behaviour session
// (docs/rule-proposal-prompt-test-set-3.md). Each case below shipped a VALID
// artifact whose behaviour contradicted the rule the player wrote.

function compile(text: string) {
  return validateAndPrecompileRule({
    originalText: text,
    prompt: text,
    tokenCount: countWords(text),
  });
}

function countWords(text: string) {
  return text.trim().split(/\s+/u).filter(Boolean).length;
}

test("a cardinality phrase is not a match threshold", () => {
  // Every guess and every draw always has exactly six numbers, so "its six
  // numbers" describes the ticket, never how many of them must match. Reading
  // it as a threshold turned three unrelated rules into `match_count_at_least 6`
  // — the first of them being the exact logical inverse of the request.
  const zeroOverlap = compile(
    "a guess wins if none of its six numbers appear in the official draw.",
  );
  assert.equal(zeroOverlap.decision, "VALID");
  assert.equal(
    evaluatePredicate(zeroOverlap.artifact!.ast, {
      draw: [7, 8, 9, 10, 11, 12],
      guess: [1, 2, 3, 4, 5, 6],
    }).result,
    "WIN",
    "no overlap must win",
  );
  assert.equal(
    evaluatePredicate(zeroOverlap.artifact!.ast, {
      draw: [6, 8, 9, 10, 11, 12],
      guess: [1, 2, 3, 4, 5, 6],
    }).result,
    "LOSE",
    "one overlap must lose",
  );

  // The same sentence without the cardinality word already compiled correctly;
  // both readings must now agree.
  assert.deepEqual(
    compile("a guess wins if none of its numbers appear in the official draw.")
      .artifact!.ast,
    zeroOverlap.artifact!.ast,
  );

  const sumEquality = compile(
    "a guess wins if the sum of its six numbers equals the sum of the six drawn numbers.",
  );
  assert.equal(sumEquality.decision, "VALID");
  assert.deepEqual(sumEquality.artifact!.ast, {
    node: { kind: "sum_equals" },
    schemaVersion: 1,
  });

  // Unsupported, so it must fail closed rather than compile to a match count.
  assert.equal(
    compile(
      "a guess wins if its six numbers are all even and the six drawn numbers are all odd.",
    ).decision,
    "INVALID",
  );
});

test("an explicit six-number set compiles without losing enumerated values", () => {
  // The reviewer used to be the same compileSupportedRule call on the same text
  // as the AST under review, so it always agreed with itself and the coverage
  // gate behind it never ran on the deterministic path — leaving the turn-55
  // failure reachable.
  const exactSet = compile(
    "A guess wins if its six numbers are exactly 1, 2, 3, 4, 5 and 6 in any order.",
  );
  assert.equal(exactSet.decision, "VALID");
  assert.equal(
    evaluatePredicate(exactSet.artifact!.ast, {
      draw: [10, 20, 30, 40, 50, 60],
      guess: [1, 2, 3, 4, 5, 6],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(exactSet.artifact!.ast, {
      draw: [10, 20, 30, 40, 50, 60],
      guess: [1, 2, 3, 4, 5, 7],
    }).result,
    "LOSE",
  );
});

test("an operation the player named must survive compilation", () => {
  // A dropped VALUE is not the only way to freeze a different rule: these all
  // kept every literal the player wrote and still changed the rule.
  for (const text of [
    "A guess wins if the sum of the guessed numbers modulo 10 equals the sum of the drawn numbers modulo 10.",
    "A guess wins if it has exactly three odd guessed numbers and the official draw also has exactly three odd drawn numbers.",
    "A guess wins if at least one guessed number appears in the official draw and at least one guessed number has the same tens digit as a drawn number.",
    "A guess wins if at least three of its guessed numbers appear in the official draw and the sum of the guessed numbers is greater than 200.",
  ]) {
    const result = compile(text);
    assert.equal(result.decision, "INVALID", text);
    assert.ok(result.log.reasonCodes.includes("INTERPRETATION_MISMATCH"), text);
  }

  // ...while a rule that genuinely performs the operation still compiles. A
  // modulus of 10 IS the last digit and a modulus of 2 IS parity, so one
  // arithmetic node satisfies every cue it actually implements.
  for (const text of [
    "Only the last digit of the totals matters: my ticket sum modulo 10 equals the draw sum modulo 10.",
    "A guess wins if the count of even guessed numbers equals the count of even drawn numbers.",
    "A guess wins if the sum of its six numbers equals the sum of the six drawn numbers.",
  ]) {
    assert.equal(compile(text).decision, "VALID", text);
  }
});

test("a threshold over filtered numbers is not an overlap count", () => {
  // "at least one drawn number is above 50" counts numbers passing a threshold.
  // Read as an overlap it collapsed a two-condition rule into
  // `match_count_at_least 1`, which any guess sharing one number would win.
  const result = compile(
    "A guess wins if it contains the number 13 and at least one drawn number is above 50.",
  );
  if (result.decision === "VALID") {
    assert.notDeepEqual(result.artifact!.ast, {
      node: { kind: "match_count_at_least", value: 1 },
      schemaVersion: 1,
    });
  }
});

test("H03 keeps both same-position conditions executable", () => {
  const result = compile(
    "Each guessed number is within 6 of the drawn number in the same position, and at least one guessed number equals the drawn number in the same position.",
  );
  assert.equal(result.decision, "VALID");
  assert.equal(result.artifact?.ast.schemaVersion, 3);
  assert.equal(
    result.artifact?.officialInterpretation,
    "A guess wins if every guessed number is within 6 of the drawn number in the same position and at least one guessed number equals the drawn number in the same position.",
  );

  const evaluate = (guess: number[], draw: number[]) =>
    evaluatePredicate(result.artifact!.ast, { draw, guess }).result;

  assert.equal(
    evaluate([10, 26, 36, 46, 56, 66], [10, 20, 30, 40, 50, 60]),
    "WIN",
    "all positions are within 6 and position 1 is exact",
  );
  assert.equal(
    evaluate([16, 26, 36, 46, 56, 66], [10, 20, 30, 40, 50, 60]),
    "LOSE",
    "being within 6 everywhere is insufficient without an exact position",
  );
  assert.equal(
    evaluate([10, 27, 36, 46, 56, 66], [10, 20, 30, 40, 50, 60]),
    "LOSE",
    "an exact position is insufficient when another position is more than 6 away",
  );
});

test("G04 preserves the negative bound for a sum that is at least N lower", () => {
  for (const text of [
    "A guess wins if the sum of the guessed numbers is at least 10 lower than the sum of the drawn numbers.",
    "My ticket total should be at least ten lower than the draw total.",
  ]) {
    const result = compile(text);
    assert.equal(result.decision, "VALID", text);
    assert.deepEqual(result.artifact?.ast, {
      schemaVersion: 2,
      result: {
        type: "predicate",
        predicate: {
          kind: "compare",
          left: {
            kind: "arith",
            left: {
              kind: "reduce",
              of: { kind: "source", source: "guess" },
              op: "sum",
            },
            op: "sub",
            right: {
              kind: "reduce",
              of: { kind: "source", source: "draw" },
              op: "sum",
            },
          },
          op: "lte",
          right: { kind: "lit", value: -10 },
        },
      },
    });
    assert.equal(
      result.artifact?.officialInterpretation,
      "A guess wins if the sum of the guessed numbers is at least 10 lower than the sum of the drawn numbers.",
    );

    const evaluate = (guess: number[]) =>
      evaluatePredicate(result.artifact!.ast, {
        draw: [10, 20, 30, 40, 50, 60],
        guess,
      }).result;
    assert.equal(evaluate([5, 15, 25, 35, 55, 65]), "WIN", "exactly 10 lower");
    assert.equal(evaluate([5, 15, 25, 35, 56, 65]), "LOSE", "only 9 lower");
    assert.equal(evaluate([10, 20, 30, 40, 50, 70]), "LOSE", "10 higher");
  }
});

test("stress set 4 objective rules compile to their stated boundary behaviour", () => {
  const cases: Array<{
    text: string;
    fixtures: Array<{ draw: number[]; guess: number[]; expected: "WIN" | "LOSE" }>;
  }> = [
    {
      text: "Every guessed number must be within 4 of the drawn number in the same position, and at least two guessed numbers must exactly equal their drawn numbers in those positions.",
      fixtures: [
        { guess: [10, 20, 34, 44, 54, 64], draw: [10, 20, 30, 40, 50, 60], expected: "WIN" },
        { guess: [14, 24, 34, 44, 54, 64], draw: [10, 20, 30, 40, 50, 60], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if the sum of its numbers is at least 12 higher than the sum of the drawn numbers.",
      fixtures: [
        { guess: [10, 20, 30, 40, 50, 72], draw: [10, 20, 30, 40, 50, 60], expected: "WIN" },
        { guess: [10, 20, 30, 40, 50, 71], draw: [10, 20, 30, 40, 50, 60], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if the sum of its three smallest numbers is greater than the sum of the three smallest drawn numbers.",
      fixtures: [
        { guess: [11, 21, 31, 70, 80, 90], draw: [10, 20, 30, 80, 90, 100], expected: "WIN" },
        { guess: [9, 20, 30, 70, 80, 90], draw: [10, 20, 30, 80, 90, 100], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if none of its even guessed numbers appear anywhere in the official draw.",
      fixtures: [
        { guess: [4, 6, 13, 15, 17, 19], draw: [2, 3, 5, 7, 9, 11], expected: "WIN" },
        { guess: [2, 4, 13, 15, 17, 19], draw: [2, 3, 5, 7, 9, 11], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if its number sum modulo 7 equals the official draw's number sum modulo 7.",
      fixtures: [
        { guess: [5, 15, 25, 35, 55, 75], draw: [10, 20, 30, 40, 50, 60], expected: "WIN" },
        { guess: [5, 15, 25, 35, 55, 76], draw: [10, 20, 30, 40, 50, 60], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if it contains 42 and the sum of the six drawn numbers is below 150.",
      fixtures: [
        { guess: [1, 2, 3, 4, 5, 42], draw: [1, 2, 3, 4, 5, 100], expected: "WIN" },
        { guess: [1, 2, 3, 4, 5, 41], draw: [1, 2, 3, 4, 5, 100], expected: "LOSE" },
        { guess: [1, 2, 3, 4, 5, 42], draw: [10, 20, 30, 40, 50, 60], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if all six guessed numbers are strictly greater than 10 and strictly less than 90.",
      fixtures: [
        { guess: [11, 20, 30, 40, 50, 89], draw: [10, 20, 30, 40, 50, 60], expected: "WIN" },
        { guess: [10, 20, 30, 40, 50, 89], draw: [10, 20, 30, 40, 50, 60], expected: "LOSE" },
        { guess: [11, 20, 30, 40, 50, 90], draw: [10, 20, 30, 40, 50, 60], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if its total is at least ten lower than the official draw total.",
      fixtures: [
        { guess: [5, 15, 25, 35, 55, 65], draw: [10, 20, 30, 40, 50, 60], expected: "WIN" },
        { guess: [5, 15, 25, 35, 56, 65], draw: [10, 20, 30, 40, 50, 60], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if its six numbers are exactly 1, 2, 3, 4, 5 and 6 in any order and at least one drawn number is between 40 and 60, inclusive.",
      fixtures: [
        { guess: [1, 2, 3, 4, 5, 6], draw: [10, 20, 30, 40, 70, 80], expected: "WIN" },
        { guess: [1, 2, 3, 4, 5, 7], draw: [10, 20, 30, 40, 70, 80], expected: "LOSE" },
        { guess: [1, 2, 3, 4, 5, 6], draw: [1, 2, 3, 98, 99, 100], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if all six drawn numbers are below 40. The player's guessed numbers do not affect the result.",
      fixtures: [
        { guess: [50, 60, 70, 80, 90, 100], draw: [1, 2, 3, 4, 5, 39], expected: "WIN" },
        { guess: [1, 2, 3, 4, 5, 6], draw: [1, 2, 3, 4, 5, 40], expected: "LOSE" },
      ],
    },
    {
      text: "A guess wins if it contains the number 77. The official draw does not affect the result.",
      fixtures: [
        { guess: [1, 2, 3, 4, 5, 77], draw: [10, 20, 30, 40, 50, 60], expected: "WIN" },
        { guess: [1, 2, 3, 4, 5, 76], draw: [10, 20, 30, 40, 50, 60], expected: "LOSE" },
      ],
    },
  ];

  for (const testCase of cases) {
    const result = compile(testCase.text);
    assert.equal(result.decision, "VALID", testCase.text);
    if (testCase.text.includes("at least two guessed numbers")) {
      assert.equal(
        result.artifact?.officialInterpretation,
        "A guess wins if every guessed number is within 4 of the drawn number in the same position and at least 2 guessed positions exactly match the draw.",
      );
    }
    for (const fixture of testCase.fixtures) {
      assert.equal(
        evaluatePredicate(result.artifact!.ast, fixture).result,
        fixture.expected,
        testCase.text,
      );
    }
  }
});
