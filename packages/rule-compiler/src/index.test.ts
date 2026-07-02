import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  buildRuleCompilerSkillPrompt,
  compileRuleArtifact,
  createLocalOnlyProviderRoutingPolicy,
  createCompilerPlaceholder,
  getRuleValidationPromptContract,
  RULE_COMPILER_SKILL_VERSION,
  validateAndPrecompileRule,
} from "./index.js";

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
