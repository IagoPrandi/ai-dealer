import assert from "node:assert/strict";
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

test("the compile_rule_to_ast skill prompt is versioned and covers both rule modes", () => {
  const prompt = buildRuleCompilerSkillPrompt();
  assert.match(RULE_COMPILER_SKILL_VERSION, /^idealer_rule_compiler_skill_/);
  assert.ok(prompt.includes('"schemaVersion":2'));
  assert.ok(prompt.includes("predicate") && prompt.includes("ranking"));
  // It must teach the digit + ranking path (the previously-impossible case).
  assert.ok(prompt.includes("digits") && prompt.includes("units"));
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
  assert.ok(ast?.schemaVersion === 1 && ast.node.kind === "match_count_at_least");
  assert.equal(ast.node.value, 4);
  assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/);
  assert.equal(result.log.confidenceAction, "ACCEPT");
  assert.ok(result.log.confidence.final_confidence >= 0.85);
  assert.ok(result.log.evaluatedTestCases.every((testCase) => testCase.passed));
});

test("validates supported sum and exact-order rules", () => {
  const sum = validateAndPrecompileRule({
    prompt: "Win if the sum of your numbers equals the sum of the drawn numbers.",
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
  assert.ok(exactAst?.schemaVersion === 1 && exactAst.node.kind === "ordered_exact");
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
    result.ast.schemaVersion === 1 && result.ast.node.kind === "match_count_at_least",
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
          left: { kind: "digits", place: "units", of: { kind: "source", source: "guess" } },
          right: { kind: "digits", place: "units", of: { kind: "source", source: "draw" } },
        },
      },
    },
  };
  const result = await compileRuleArtifact(
    {
      prompt: "The winner is whoever matches the most units digits of the draw.",
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
      predicate: { kind: "count_at_least", value: 0, of: { kind: "source", source: "guess" } },
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
  assert.equal(schemaFailure.log.providerPath[0]?.status, "schema_validation_failed");
});

test("supports local-only OpenAI-compatible routing with Ollama request shape", () => {
  const result = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    providerRouting: createLocalOnlyProviderRoutingPolicy("http://localhost:11434/v1"),
    tokenCount: 12,
  });

  assert.equal(result.decision, "VALID");
  assert.equal(result.log.providerPath.length, 1);
  assert.equal(result.log.providerPath[0]?.request_shape, "ollama_format");
  assert.equal(result.log.providerPath[0]?.capability_flags.openai_compatible, true);
  assert.equal(result.log.providerPath[0]?.capability_flags.grammar_constrained_decoding, true);
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
