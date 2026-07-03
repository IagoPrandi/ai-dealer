import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
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
  assert.match(RULE_COMPILER_SKILL_VERSION, /^idealer_rule_compiler_skill_/);
  assert.ok(prompt.includes('"schemaVersion":2'));
  assert.ok(prompt.includes("predicate") && prompt.includes("ranking"));
  // It must teach the digit + ranking path (the previously-impossible case).
  assert.ok(prompt.includes("digits") && prompt.includes("units"));
  // It must teach unordered same-set equality, the prompt #7 simulation case.
  assert.ok(prompt.includes("same set of numbers"));
  assert.ok(prompt.includes("count(intersection(guess,draw)) == 6"));
  // It must teach the prompt 9/10/11/101 harness cases and their variants.
  assert.ok(prompt.includes("guessed sum is greater than the drawn sum"));
  assert.ok(prompt.includes("min(guess) == min(draw)"));
  assert.ok(prompt.includes("max(guess) > max(draw)"));
  assert.ok(prompt.includes("four or more of my picked numbers show up"));
  // It must teach prompt 12/13/103 and sequence 10 reverse-order cases.
  assert.ok(prompt.includes("second guessed number equals second drawn number"));
  assert.ok(prompt.includes("all_ordered_abs_diff_lte"));
  assert.ok(prompt.includes("ordered_position_match_count_eq"));
  assert.ok(prompt.includes("ordered_position_compare_count_eq"));
  assert.ok(prompt.includes("digit_match_count_at_least"));
  assert.ok(prompt.includes("all_values_between_min_max"));
  assert.ok(prompt.includes("total_ordered_abs_diff_lte"));
  assert.ok(prompt.includes("first pick only needs to be higher"));
  assert.ok(prompt.includes("reversed_position_match_count_at_least"));
  assert.ok(prompt.includes("remove_up_to_n"));
  assert.ok(prompt.includes("map_with_guard"));
  assert.ok(prompt.includes("value_within_any_count_at_least"));
  assert.ok(prompt.includes("sum(guess) mod 10"));
  // And forbid external/unverifiable inputs.
  assert.ok(/wallets|votes|oracle|external/i.test(prompt));
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
  assert.equal(
    result.artifact?.officialInterpretation,
    result.artifact?.normalizedText,
  );
  assert.equal(result.artifact?.createdAt, "2026-06-11T00:00:00.000Z");
  assert.ok((result.artifact?.generatedTestCases.length ?? 0) > 0);
  assert.ok((result.artifact?.evaluatedTestCases.length ?? 0) > 0);
  assert.ok((result.artifact?.harnessCases.length ?? 0) > 0);
  assert.equal(result.artifact?.skillVersion, RULE_COMPILER_SKILL_VERSION);
  assert.equal(result.artifact?.testHarnessVersion, "2.0.0");
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
  assert.equal(
    result.artifact?.officialInterpretation,
    "Win when at least four guessed numbers appear in the draw.",
  );
  assert.equal(
    result.artifact?.originalText,
    "Win if at least 4 of your numbers appear in the draw.",
  );
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

test("allows an LLM-emitted ALWAYS_TRUE rule but labels its difficulty", async () => {
  // Policy: difficulty never gates. A verifiable, external-free rule is allowed.
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

  assert.equal(result.decision, "VALID");
  assert.equal(result.log.difficultyClass, "ALWAYS_TRUE");
});

test("exposes the prompt contract for audit", () => {
  const contract = getRuleValidationPromptContract();

  assert.equal(contract.version, "idealer_rule_validation_prompt_v1");
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
