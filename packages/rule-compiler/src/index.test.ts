import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  analyzeInterpretationCoverage,
  analyzeStatementFidelity,
  buildRuleCompilerSkillPrompt,
  compareDeterministicRuleSemantics,
  compileRuleArtifact,
  createDefaultProviderRoutingPolicy,
  createLocalOnlyProviderRoutingPolicy,
  createCompilerPlaceholder,
  describeRuleAstForPlayers,
  evaluateRankingEntry,
  evaluatePredicate,
  getDeterministicRuleCompilerPlan,
  getRuleCompilationCandidateJsonSchema,
  getRuleValidationPromptContract,
  hasAmbiguousWording,
  hasExternalDependency,
  hasInvalidConstraint,
  hasProvablyVacuousCondition,
  providerCompilationHasSchemaValidAst,
  RULE_COMPILER_SKILL_VERSION,
  ruleAstSchema,
  scoreGuess,
  validateAndPrecompileRule,
} from "./index.js";

type PromptTestSetFile =
  | "rule-proposal-prompt-test-set-2.md"
  | "rule-proposal-prompt-test-set.md";

test("compile provider routing prefers the per-role model and ignores blank overrides", () => {
  const dedicated = createDefaultProviderRoutingPolicy({
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL: "nemotron-3-super:cloud",
    LLM_MODEL_COMPILE: "qwen3.5:9b",
    LLM_PRIMARY_MODEL: "nemotron-3-super:cloud",
  });
  assert.equal(dedicated.providers[0]?.identity.model, "qwen3.5:9b");
  assert.equal(dedicated.providers[0]?.capabilities.json_schema_response, true);

  const blank = createDefaultProviderRoutingPolicy({
    LLM_BASE_URL: "http://localhost:11434/v1",
    LLM_MODEL_COMPILE: "",
    LLM_PRIMARY_MODEL: "gemma4:latest",
  });
  assert.equal(blank.providers[0]?.identity.model, "gemma4:latest");
});

function readPromptRows(
  expected: "BLOCK" | "CLARIFY" | "VALID",
  limit: number,
) {
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
  const rows = new Map<
    number,
    { expected: "BLOCK" | "CLARIFY" | "VALID"; prompt: string }
  >();
  const pattern =
    /^\|\s*(\d+)\s*\|\s*(BLOCK|CLARIFY|VALID)\s*\|\s*(.*?)\s*\|$/gm;
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

/**
 * A cooperating reviewer for the deterministic path.
 *
 * `preferDeterministic` freezes the deterministic AST but no longer skips the
 * model: the pattern compiler reviews the provider, so the provider must review
 * the pattern compiler, or a pattern that implements only half of a sentence
 * certifies itself. These fixtures therefore need a provider that AGREES, and
 * the cheapest way to guarantee agreement is to hand back the very AST the
 * offline compiler produced for the same text.
 */
function agreeingReviewer(onCall?: () => void) {
  return async ({ normalizedText }: { normalizedText: string }) => {
    onCall?.();
    const offline = validateAndPrecompileRule({
      prompt: normalizedText,
      tokenCount: tokenCount(normalizedText),
    });
    const ast = offline.artifact?.ast;
    if (!ast) {
      throw new Error(`no offline AST to review for: ${normalizedText}`);
    }
    return ast;
  };
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
  assert.ok(
    prompt.includes("second guessed number equals second drawn number"),
  );
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
  assert.match(prompt, /at least TWO valid domain cases/i);
  assert.match(prompt, /do NOT need to include both outcomes/i);
  assert.match(prompt, /draws without replacement/i);
  assert.match(prompt, /never use `0`, `101`, or a seventh value/i);
  assert.match(prompt, /decoder enforces this response schema/i);
  assert.ok(prompt.includes("guessSum - drawSum <= -10"));
  assert.ok(prompt.includes('"up":1'));
  assert.ok(prompt.includes("first pick only needs to be higher"));
  assert.ok(prompt.includes("sum(guess) mod 10"));
  assert.ok(prompt.includes("same tens range"));
  assert.ok(prompt.includes("pair.left div 10 == pair.right div 10"));
  assert.ok(
    prompt.includes("Never\nreplace the rule with a stock match-count example"),
  );
  // And forbid external/unverifiable inputs.
  assert.ok(/wallets|votes|oracle|external/i.test(prompt));
});

test("the compiler candidate schema makes every worked ticket a valid game input", () => {
  const schema = getRuleCompilationCandidateJsonSchema() as {
    additionalProperties?: boolean;
    definitions?: Record<string, unknown>;
    properties?: {
      workedExamples?: {
        items?: {
          anyOf?: Array<{
            properties?: {
              draw?: Record<string, unknown>;
              guess?: Record<string, unknown>;
            };
          }>;
        };
      };
    };
    required?: string[];
  };
  assert.equal(schema.additionalProperties, false);
  assert.ok(schema.definitions && Object.keys(schema.definitions).length > 0);
  assert.deepEqual(schema.required, ["ast", "consumedSpans", "workedExamples"]);
  const examples = schema.properties?.workedExamples?.items?.anyOf ?? [];
  assert.equal(examples.length, 2);
  for (const example of examples) {
    for (const ticket of [
      example.properties?.guess,
      example.properties?.draw,
    ]) {
      assert.deepEqual(ticket, {
        type: "array",
        minItems: 6,
        maxItems: 6,
        items: { type: "integer", minimum: 1, maximum: 100 },
      });
    }
  }
});

test("direct-position decoder schemas exclude binder-only scalar references", () => {
  const unconstrained = getRuleCompilationCandidateJsonSchema() as {
    definitions?: Record<string, { anyOf?: unknown[] }>;
  };
  const constrained = getRuleCompilationCandidateJsonSchema({
    forbidBinderScopedScalars: true,
  }) as {
    definitions?: Record<string, { anyOf?: unknown[] }>;
  };
  const kinds = (schema: typeof constrained) =>
    Object.values(schema.definitions ?? {}).flatMap((definition) =>
      (definition.anyOf ?? []).flatMap((variant) => {
        const kind = (
          variant as {
            properties?: { kind?: { const?: unknown } };
          }
        ).properties?.kind?.const;
        return typeof kind === "string" ? [kind] : [];
      }),
    );

  assert.ok(kinds(unconstrained).includes("elem"));
  assert.ok(kinds(unconstrained).includes("pair"));
  assert.ok(kinds(constrained).includes("at"));
  assert.ok(!kinds(constrained).includes("elem"));
  assert.ok(!kinds(constrained).includes("pair"));
  // Building the constrained schema must not mutate the shared base schema.
  assert.ok(
    kinds(
      getRuleCompilationCandidateJsonSchema() as typeof constrained,
    ).includes("elem"),
  );
});

test("deterministic compiler plans are exposed only after full source coverage", () => {
  const plan = getDeterministicRuleCompilerPlan(
    "ganha o jogador que o o primeiro n\u00famero seja maior que o primeiro n\u00famero do sorteio e o segundo n\u00famero dele seja maior que o \u00faltimo n\u00famero do sorteio",
  );
  assert.equal(plan?.ast.schemaVersion, 2);
  assert.match(plan?.interpretation ?? "", /1st value of your numbers/iu);
  assert.match(plan?.interpretation ?? "", /2nd value of your numbers/iu);
  assert.match(plan?.interpretation ?? "", /6th value of the drawn numbers/iu);

  assert.equal(
    getDeterministicRuleCompilerPlan(
      "Win when the ticket has an unprecedented harmonic relationship with the draw.",
    ),
    null,
  );
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
  assert.equal(result.artifact?.testHarnessVersion, "2.4.0");
});

test("compares known rule semantics instead of matching threshold words", () => {
  const equivalentPairs = [
    [
      "Win if at least 4 of your numbers appear in the draw.",
      "Compare every eligible guess by counting how many of its numbers appear in the draw; a guess wins when at least four match.",
    ],
    [
      "Vence quem tem pelo menos três números que coincidam com os números sorteados.",
      "A guess wins if at least 3 of its numbers appear in the official draw, regardless of order.",
    ],
    [
      "Vence quem acertar ao menos três dos seis números sorteados.",
      "A guess wins if at least three of its six numbers appear in the official draw.",
    ],
  ] as const;
  for (const [left, right] of equivalentPairs) {
    assert.equal(compareDeterministicRuleSemantics(left, right), "equivalent");
  }

  const mutations = [
    "A guess wins if at least 4 of its numbers appear in the official draw.",
    "A guess wins if exactly 3 of its numbers appear in the official draw.",
    "A guess wins if at least 3 of the 6 reversed positions match.",
    "A guess wins if at least 3 guessed numbers appear in the official draw and the guessed sum is greater than the drawn sum.",
  ];
  for (const mutation of mutations) {
    assert.equal(
      compareDeterministicRuleSemantics(
        "A guess wins if at least 3 guessed numbers appear in the official draw.",
        mutation,
      ),
      "different",
      mutation,
    );
  }

  assert.equal(
    compareDeterministicRuleSemantics(
      "A guess wins if its prime numbers form a palindrome.",
      "A guess wins if its prime numbers form a palindrome.",
    ),
    "unknown",
  );
});

test("compares every supported match threshold and stays conservative at equivalent boundaries", () => {
  for (let threshold = 1; threshold <= 6; threshold += 1) {
    assert.equal(
      compareDeterministicRuleSemantics(
        `Win if at least ${threshold} guessed numbers appear in the draw.`,
        `A guess wins when ${threshold} or more of its numbers match the official draw.`,
      ),
      "equivalent",
      `threshold ${threshold}`,
    );

    if (threshold < 6) {
      assert.equal(
        compareDeterministicRuleSemantics(
          `Win if at least ${threshold} guessed numbers appear in the draw.`,
          `Win if at least ${threshold + 1} guessed numbers appear in the draw.`,
        ),
        "different",
        `threshold mutation ${threshold} -> ${threshold + 1}`,
      );
    }
  }

  assert.equal(
    compareDeterministicRuleSemantics(
      "Win if exactly three guessed numbers appear in the draw.",
      "Win if exactly three guessed numbers do not appear in the draw.",
    ),
    "unknown",
    "with six numbers these predicates share a truth table, but different syntax is not proof of complete equivalence",
  );
  assert.equal(
    compareDeterministicRuleSemantics(
      "Win if at least six guessed numbers appear in the draw.",
      "Win if exactly six guessed numbers appear in the draw.",
    ),
    "unknown",
    "bounded samples cannot promote structurally different programs to equivalent",
  );
});

test("negative match counts never enter the positive deterministic shortcut", async () => {
  const negativeRules = [
    "Win if at least three guessed numbers do not appear in the draw.",
    "Vence se pelo menos três números do palpite não coincidirem com o sorteio.",
    "Vence se ao menos três números do palpite não coincidirem com o sorteio.",
    "Win if at least three guessed numbers are absent from the draw.",
    "Win with at least three missed numbers.",
  ];
  for (const text of negativeRules) {
    assert.equal(getDeterministicRuleCompilerPlan(text), null, text);
    assert.equal(
      compareDeterministicRuleSemantics(
        text,
        "A guess wins if at least 3 guessed numbers appear in the draw.",
      ),
      "different",
      text,
    );
  }
  assert.equal(
    compareDeterministicRuleSemantics(
      "Win if at least three guessed numbers do not appear in the draw.",
      "Win if at least four guessed numbers do not appear in the draw.",
    ),
    "different",
  );
  assert.equal(
    compareDeterministicRuleSemantics(
      "Win if at least three guessed numbers do not appear in the draw.",
      "Win if exactly three guessed numbers do not appear in the draw.",
    ),
    "different",
  );
  assert.equal(
    compareDeterministicRuleSemantics(
      "Win if at least three guessed numbers do not appear in the draw.",
      "A guess wins when at least three guessed numbers are absent from the draw.",
    ),
    "unknown",
    "matching negative fingerprints cannot prove whole-rule equivalence",
  );

  const negativeAst = {
    schemaVersion: 2 as const,
    result: {
      type: "predicate" as const,
      predicate: {
        kind: "count_at_least" as const,
        value: 3,
        of: {
          kind: "difference" as const,
          left: { kind: "source" as const, source: "guess" as const },
          right: { kind: "source" as const, source: "draw" as const },
        },
      },
    },
  };
  let generatorCalls = 0;
  let reviewerCalls = 0;
  const result = await compileRuleArtifact(
    {
      originalText: negativeRules[0]!,
      prompt: negativeRules[0]!,
      tokenCount: tokenCount(negativeRules[0]!),
    },
    {
      astProvider: async () => {
        generatorCalls += 1;
        return negativeAst;
      },
      astReviewer: async () => {
        reviewerCalls += 1;
        return negativeAst;
      },
      preferDeterministic: true,
    },
  );

  assert.equal(result.decision, "VALID");
  assert.equal(generatorCalls, 1);
  assert.equal(reviewerCalls, 1);
  assert.deepEqual(result.artifact?.ast, negativeAst);
});

test("renders generic overlap-count ASTs as canonical player language", () => {
  const providerAst = {
    schemaVersion: 2 as const,
    result: {
      type: "predicate" as const,
      predicate: {
        kind: "compare" as const,
        op: "gte" as const,
        left: {
          kind: "reduce" as const,
          op: "count" as const,
          of: {
            kind: "intersection" as const,
            left: { kind: "source" as const, source: "guess" as const },
            right: { kind: "source" as const, source: "draw" as const },
          },
        },
        right: { kind: "lit" as const, value: 3 },
      },
    },
  };
  const interpretation = describeRuleAstForPlayers(providerAst);

  assert.equal(
    interpretation,
    "A guess wins if at least 3 of its numbers appear in the official draw, regardless of order.",
  );
  assert.deepEqual(getDeterministicRuleCompilerPlan(interpretation)?.ast, {
    node: { kind: "match_count_at_least", value: 3 },
    schemaVersion: 1,
  });
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

test("compiles an ordered literal prefix while leaving the stated remainder free", () => {
  const prompts = [
    "Win if the first four guessed numbers, in that order, are 1, 2, 3, and 4; the remaining two guessed numbers may be any values from 1 to 100, subject only to uniqueness.",
    "vence se a sequencia jogada for 1 2 3 4. os demais dois numeros devem ser ignorados.",
    "Only the first four guessed numbers in order need to match 1, 2, 3, 4; the final two numbers do not matter.",
  ];

  for (const prompt of prompts) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });

    assert.equal(result.decision, "VALID", prompt);
    assert.ok(result.artifact, prompt);
    assert.equal(
      evaluatePredicate(result.artifact.ast, {
        draw: [90, 91, 92, 93, 94, 95],
        guess: [1, 2, 3, 4, 80, 81],
      }).result,
      "WIN",
      prompt,
    );
    assert.equal(
      evaluatePredicate(result.artifact.ast, {
        draw: [1, 2, 3, 4, 80, 81],
        guess: [1, 2, 9, 4, 80, 81],
      }).result,
      "LOSE",
      prompt,
    );
    const coverage = analyzeInterpretationCoverage({
      ast: result.artifact.ast,
      officialInterpretation: result.artifact.officialInterpretation,
      text: prompt,
    });
    assert.equal(coverage.covered, true, prompt);
    assert.deepEqual(coverage.missingFromAst, [], prompt);
    assert.deepEqual(coverage.missingOperations, [], prompt);
  }
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

test("compiles every literal in an unordered guess-membership list", async () => {
  const prompts = [
    "A player wins if their six-number guess contains the numbers 1, 2, 3, and 4 in any order.",
    "The player wins if their guess includes 1, 2, 3, and 4, regardless of order or the other two numbers.",
    "Se o número do jogador tiver 1 2 3 4 em qualquer ordem, ele ganha.",
    "Se o número do jogador tiver 1 2 3 4 em qualquer ordem, ele ganha. The official draw does not affect the result.",
    "The player wins when their guess includes the numbers 1, 2, 3, and 4; the draw does not affect the outcome.",
    "The player wins if their six-number guess contains the numbers 1, 2, 3, and 4 (in any order) and two other distinct numbers from 5 to 100, with no repeats.",
    "The guess must contain 1, 2, 3, and 4, plus two additional values each from 5 through 100, all six values being unique; if satisfied, the guess wins.",
    "My ticket must include 7 and 13.",
  ];

  for (const prompt of prompts) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });

    assert.equal(result.decision, "VALID", prompt);
    assert.ok(result.artifact, prompt);
    assert.equal(
      evaluatePredicate(result.artifact.ast, {
        draw: [90, 91, 92, 93, 94, 95],
        guess: prompt.includes("7 and 13")
          ? [13, 80, 7, 81, 82, 83]
          : [4, 80, 2, 1, 81, 3],
      }).result,
      "WIN",
      prompt,
    );
    assert.equal(
      evaluatePredicate(result.artifact.ast, {
        draw: [1, 2, 3, 4, 5, 6],
        guess: prompt.includes("7 and 13")
          ? [7, 80, 81, 82, 83, 84]
          : [1, 2, 3, 80, 81, 82],
      }).result,
      "LOSE",
      prompt,
    );
    const coverage = analyzeInterpretationCoverage({
      ast: result.artifact.ast,
      officialInterpretation: result.artifact.officialInterpretation,
      text: prompt,
    });
    assert.equal(coverage.covered, true, prompt);
    assert.deepEqual(coverage.missingFromAst, [], prompt);
    // "two other numbers from 5 to 100" adds nothing to require: the four
    // pinned values leave exactly 5..100 for the other two, so only 1..4 are
    // load-bearing. The AST here does carry the range, and that stays fine —
    // coverage is one-directional, an artifact may say more than the prose.
    assert.deepEqual(
      coverage.requiredValues,
      prompt.includes("7 and 13") ? [7, 13] : [1, 2, 3, 4],
      prompt,
    );
  }

  let providerCalls = 0;
  for (const productionText of prompts) {
    const productionResult = await compileRuleArtifact(
      {
        originalText: productionText,
        prompt: productionText,
        tokenCount: tokenCount(productionText),
      },
      {
        astProvider: agreeingReviewer(() => {
          providerCalls += 1;
        }),
        preferDeterministic: true,
        requireProviderEvidence: true,
      },
    );
    assert.equal(productionResult.decision, "VALID", productionText);
  }
  // One review per rule: the deterministic artifact is still what gets frozen,
  // but it is no longer frozen unreviewed.
  assert.equal(providerCalls, prompts.length);

  const compound =
    "A guess wins if it contains 1, 2, 3, and 4 and the drawn sum is above 100.";
  const rejected = validateAndPrecompileRule({
    prompt: compound,
    tokenCount: tokenCount(compound),
  });
  assert.equal(rejected.decision, "INVALID");
  assert.equal(rejected.artifact, null);

  const prefixedCompound =
    "The draw differs from the guess and the ticket must include 7 and 13.";
  const prefixedRejection = validateAndPrecompileRule({
    prompt: prefixedCompound,
    tokenCount: tokenCount(prefixedCompound),
  });
  assert.equal(prefixedRejection.decision, "INVALID");
  assert.equal(prefixedRejection.artifact, null);

  for (const unsafeRemainder of [
    "The guess must contain 1, 2, 3, and 4, plus one other distinct number from 5 to 100.",
    "The guess must contain 1, 2, 3, and 4, plus two other distinct numbers from 6 to 100.",
    "The guess must contain 1, 2, 3, and 4, plus two other numbers from 5 to 100.",
  ]) {
    const invalid = validateAndPrecompileRule({
      prompt: unsafeRemainder,
      tokenCount: tokenCount(unsafeRemainder),
    });
    assert.equal(invalid.decision, "INVALID", unsafeRemainder);
    assert.equal(invalid.artifact, null, unsafeRemainder);
  }
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
    assert.equal(
      result.log.reasonCodes.includes("UNSUPPORTED_RULE"),
      false,
      prompt,
    );
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
    prompt:
      "Win if at least 4 guessed numbers appear in the draw, regardless of order.",
    tokenCount: 12,
  }).artifact?.ast;
  assert.ok(
    threshold?.schemaVersion === 1 &&
      threshold.node.kind === "match_count_at_least",
  );

  const versusDraw = validateAndPrecompileRule({
    prompt:
      "Win if the guessed numbers contain more multiples of 5 than the drawn numbers.",
    tokenCount: 13,
  }).artifact?.ast;
  assert.ok(
    versusDraw?.schemaVersion === 2 && versusDraw.result.type === "predicate",
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

test("compiles closest-sum rankings without treating the boundary as ambiguity", () => {
  const prompts = [
    "Vence quem tem a soma dos números do palpite mais próxima da soma dos números do sorteio, sem ultrapassar.",
    "The guess with the highest total that doesn't go over the drawn total takes the round.",
    "The winning guess is the one whose sum is the largest value that is less than or equal to the draw sum.",
  ];
  for (const prompt of prompts) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });
    const ast = result.artifact?.ast;
    assert.equal(result.decision, "VALID", prompt);
    assert.equal(
      result.log.reasonCodes.includes("AMBIGUOUS_RULE"),
      false,
      prompt,
    );
    assert.ok(
      ast?.schemaVersion === 3 &&
        ast.result.type === "ranking" &&
        ast.result.direction === "max" &&
        ast.result.eligibleWhen?.kind === "compare" &&
        ast.result.eligibleWhen.op === "lte",
      prompt,
    );
    assert.match(
      result.artifact?.officialInterpretation ?? "",
      /If no guess is eligible, there is no winner/,
    );
  }

  const ast = validateAndPrecompileRule({
    prompt: prompts[0]!,
    tokenCount: tokenCount(prompts[0]!),
  }).artifact?.ast;
  assert.ok(ast && ast.schemaVersion === 3 && ast.result.type === "ranking");
  const over = evaluateRankingEntry(ast, {
    draw: [1, 2, 3, 4, 5, 6],
    guess: [10, 11, 12, 13, 14, 15],
  });
  assert.equal(over.eligible, false);

  const absolute = validateAndPrecompileRule({
    prompt: "The guess whose sum is closest to the draw sum wins.",
    tokenCount: 10,
  }).artifact?.ast;
  assert.ok(
    absolute?.schemaVersion === 3 &&
      absolute.result.type === "ranking" &&
      absolute.result.direction === "min" &&
      absolute.result.score.kind === "abs",
  );
});

test("compiles 'most matches, then closest by position' as two ordered criteria", () => {
  // The exact wording a player submitted. It used to compile to the bare match
  // count: the generic ranking's guard against a position-qualified score was
  // English-only, so the whole second criterion was dropped and the frozen card
  // promised a rule the player had not written.
  const prompts = [
    "quero criar um regra que vence o palpite que mais acertar numeros, se nao houver nenhum ganhador, entao ganha o palpite que teve a menor diferenca entre os numeros sorteados, nas posicoes correspondentes entre o palpite e o resultado do sorteio",
    "The guess matching the most drawn numbers wins; if nobody matches any, the winner is the guess with the smallest total difference from the draw in the same positions.",
    "Whoever matches the most numbers wins. In case of a tie, the smallest distance between each pick and the drawn number in the corresponding positions wins.",
  ];

  for (const prompt of prompts) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });
    assert.equal(result.decision, "VALID", prompt);
    const ast = result.artifact?.ast;
    assert.ok(
      ast?.schemaVersion === 3 &&
        ast.result.type === "ranking" &&
        ast.result.direction === "max",
      `expected a v3 max ranking for: ${prompt}`,
    );
    assert.equal(result.artifact?.ruleMode, "ranking", prompt);

    // Both criteria must reach the player, in order. A card naming only the
    // match count is the exact defect this test covers.
    const interpretation = result.artifact?.officialInterpretation ?? "";
    assert.match(interpretation, /MOST of the official draw's numbers/, prompt);
    assert.match(interpretation, /position by position/, prompt);
    assert.match(interpretation, /tie is broken/, prompt);

    // The fold is exact, not a blend: ONE match must outrank ZERO matches even
    // when the single match is paired with the worst distance an input can have
    // and the zero-match guess with the best. Those are the two extremes that
    // decide whether the secondary criterion can ever overturn the primary one.
    const oneMatchFarthest = scoreGuess(ast, {
      guess: [1, 100, 99, 98, 97, 96],
      draw: [1, 2, 3, 4, 5, 6],
    });
    const noMatchClosest = scoreGuess(ast, {
      guess: [10, 20, 30, 40, 50, 60],
      draw: [11, 21, 31, 41, 51, 61],
    });
    assert.ok(
      oneMatchFarthest > noMatchClosest,
      `one match must outrank zero matches however far its numbers are: ${prompt}`,
    );

    const sameMatchesCloser = scoreGuess(ast, {
      guess: [1, 20, 30, 40, 50, 60],
      draw: [1, 21, 31, 41, 51, 61],
    });
    const sameMatchesFarther = scoreGuess(ast, {
      guess: [1, 20, 30, 40, 50, 60],
      draw: [1, 90, 91, 92, 93, 94],
    });
    assert.ok(
      sameMatchesCloser > sameMatchesFarther,
      `with equal match counts the closer guess must win: ${prompt}`,
    );
  }

  // The single-criterion ranking is untouched: the new pattern must not steal
  // it, and neither must the fallback guard that protects it. Spelling out the
  // share-the-pool default is a restatement of `tieBreak`, not a second
  // criterion, so these must still compile to the plain match count.
  const singleCriterion = [
    "vence quem mais acertar numeros",
    // Note: a restatement may not NAME the prize pool — that is an external
    // reference the preflight blocks on its own — so these say only "split".
    "vence quem mais acertar numeros, em caso de empate dividem igualmente",
    "the guess with the most matching numbers wins; in case of a tie they split evenly",
  ];
  for (const prompt of singleCriterion) {
    const plain = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    }).artifact?.ast;
    assert.ok(
      plain?.schemaVersion === 2 &&
        plain.result.type === "ranking" &&
        plain.result.score.kind === "reduce" &&
        plain.result.score.op === "count",
      `a rule with no second criterion must stay the plain match-count ranking: ${prompt}`,
    );
  }
});

test("deterministically compiles an eligible match ranking with a sum tiebreak", () => {
  const prompt =
    "Among tickets whose numbers add up to no more than the drawn total, the winner is the one with the most numbers matching the draw; if two tickets match the same amount, the one with the larger sum wins.";
  const result = validateAndPrecompileRule({
    prompt,
    tokenCount: tokenCount(prompt),
  });
  assert.equal(result.decision, "VALID");
  const ast = result.artifact?.ast;
  assert.ok(
    ast?.schemaVersion === 3 &&
      ast.result.type === "ranking" &&
      ast.result.eligibleWhen,
  );

  const draw = [10, 20, 30, 40, 50, 60];
  const smallerTie = evaluateRankingEntry(ast, {
    draw,
    guess: [10, 20, 30, 1, 2, 3],
  });
  const largerTie = evaluateRankingEntry(ast, {
    draw,
    guess: [10, 20, 30, 4, 5, 6],
  });
  const overLimit = evaluateRankingEntry(ast, {
    draw,
    guess: [10, 20, 30, 40, 50, 61],
  });
  const moreMatches = evaluateRankingEntry(ast, {
    draw,
    guess: [10, 20, 30, 40, 1, 2],
  });
  const fewerMatches = evaluateRankingEntry(ast, {
    draw,
    guess: [10, 20, 1, 2, 3, 90],
  });
  assert.equal(smallerTie.eligible, true);
  assert.equal(largerTie.eligible, true);
  assert.ok(largerTie.score > smallerTie.score);
  assert.equal(overLimit.eligible, false);
  assert.ok(moreMatches.score > fewerMatches.score);
});

test("deterministically compiles the margin between counts beyond draw extrema", () => {
  const prompt =
    "A guess wins if the count of its numbers above the highest drawn number exceeds the count of its numbers below the lowest drawn number by at least 2.";
  const result = validateAndPrecompileRule({
    prompt,
    tokenCount: tokenCount(prompt),
  });
  assert.equal(result.decision, "VALID");
  const ast = result.artifact?.ast;
  assert.ok(ast);
  const draw = [10, 20, 30, 40, 50, 60];
  const fixtures = [
    { guess: [61, 62, 30, 31, 32, 33], expected: "WIN" },
    { guess: [61, 30, 31, 32, 33, 34], expected: "LOSE" },
    { guess: [61, 62, 70, 80, 5, 30], expected: "WIN" },
    { guess: [61, 62, 1, 2, 3, 4], expected: "LOSE" },
    { guess: [70, 80, 90, 5, 6, 30], expected: "LOSE" },
  ] as const;
  for (const fixture of fixtures) {
    assert.equal(
      evaluatePredicate(ast, { draw, guess: [...fixture.guess] }).result,
      fixture.expected,
    );
  }
});

test("a second criterion no deterministic pattern implements is never compiled away", () => {
  // The failure mode is not "this shape is unsupported" — it is claiming the
  // text and freezing only the half that happened to match. Refusing sends the
  // rule to the LLM path with the whole sentence intact.
  const unimplemented = [
    // Fallback on a quantity outside the guess/draw sandbox.
    "vence quem mais acertar numeros, se nao houver ganhador entao ganha quem tiver o palpite mais antigo",
    // A distance between SUMS is a different score with the same wording.
    "vence quem mais acertar numeros, em caso de empate ganha a menor diferenca entre a soma do palpite e a soma do sorteio",
    // Tiebreak on the units digit, not on the value distance.
    "the most matching numbers wins, otherwise the guess with the smallest difference in the units digit of the same positions",
  ];
  for (const prompt of unimplemented) {
    const result = validateAndPrecompileRule({
      prompt,
      tokenCount: tokenCount(prompt),
    });
    assert.equal(
      result.artifact,
      null,
      `deterministic compile must not claim: ${prompt}`,
    );
  }
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
    assert.equal(
      result.log.reasonCodes.includes("UNSUPPORTED_RULE"),
      false,
      prompt,
    );
    assert.match(result.artifactHash ?? "", /^[0-9a-f]{64}$/, prompt);
    const ast = result.artifact?.ast;
    assert.ok(
      ast?.schemaVersion === 1 && ast.node.kind === "match_count_at_least",
      prompt,
    );
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
    assert.equal(
      result.log.reasonCodes.includes("UNSUPPORTED_RULE"),
      false,
      prompt,
    );
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
  assert.ok(
    ast?.schemaVersion === 1 && ast.node.kind === "match_count_at_least",
  );
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
  assert.equal(
    hasAmbiguousWording("Win if my numbers are close to the draw."),
    true,
  );
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
    evaluatePredicate(parityAst, {
      guess: [1, 4, 5, 8, 9, 12],
      draw: [3, 2, 7, 6, 11, 20],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(parityAst, {
      guess: [2, 4, 5, 8, 9, 12],
      draw: [3, 2, 7, 6, 11, 20],
    }).result,
    "LOSE",
  );

  const removalAst = validateAndPrecompileRule({
    prompt:
      "Remove up to 2 guessed numbers with the largest absolute difference from any drawn number, then win if 3 remaining guessed numbers appear in the draw.",
    tokenCount: 26,
  }).artifact!.ast;
  assert.equal(
    evaluatePredicate(removalAst, {
      guess: [1, 2, 3, 40, 50, 60],
      draw: [1, 2, 3, 70, 80, 90],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(removalAst, {
      guess: [1, 2, 40, 41, 50, 60],
      draw: [1, 2, 3, 70, 80, 90],
    }).result,
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

  const compiled = new Map<
    number,
    ReturnType<typeof validateAndPrecompileRule>
  >();
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
    evaluatePredicate(balancedAst, {
      guess: [1, 3, 5, 2, 4, 6],
      draw: [9, 9, 9, 9, 9, 9],
    }).result,
    "WIN",
  );
  assert.equal(
    evaluatePredicate(balancedAst, {
      guess: [1, 3, 2, 2, 4, 6],
      draw: [9, 9, 9, 9, 9, 9],
    }).result,
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
  // An unread clause is a span-coverage fault, not a dropped literal: the codes
  // stay distinct so the player is told what actually blocked them.
  assert.ok(
    omitted.log.reasonCodes.includes("PROVIDER_SPAN_COVERAGE_INCOMPLETE"),
    JSON.stringify(omitted.log.reasonCodes),
  );
  assert.equal(
    omitted.log.reasonCodes.includes("INTERPRETATION_MISMATCH"),
    false,
  );

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
  // The model contradicted its own artifact. Nothing the player wrote was
  // dropped, so this must not surface as INTERPRETATION_MISMATCH.
  assert.ok(
    result.log.reasonCodes.includes("PROVIDER_EVIDENCE_UNVERIFIED"),
    JSON.stringify(result.log.reasonCodes),
  );
  assert.equal(
    result.log.reasonCodes.includes("INTERPRETATION_MISMATCH"),
    false,
  );
  const rejected = result.log.attemptDiagnostics.find(
    (attempt) => attempt.candidate !== null,
  );
  assert.deepEqual(rejected?.candidate?.ast, wrongSignAst);
  assert.deepEqual(rejected?.candidate?.workedExamples, [
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
  ]);
  const evidenceStage = rejected?.stages.find(
    (stage) => stage.stage === "provider_evidence",
  );
  assert.equal(evidenceStage?.status, "failed");
  assert.match(evidenceStage?.detail ?? "", /Declared outcome does not match/i);
  assert.equal(rejected?.providerEvidence?.exampleResults[1]?.status, "failed");
  assert.equal(
    rejected?.providerEvidence?.exampleResults[1]?.declaredOutcome,
    "LOSE",
  );
  assert.equal(
    rejected?.providerEvidence?.exampleResults[1]?.actualOutcome,
    "WIN",
  );
  assert.ok(
    rejected?.stages.some(
      (stage) =>
        stage.stage === "decision" &&
        stage.status === "failed" &&
        stage.reasonCodes.includes("PROVIDER_EVIDENCE_UNVERIFIED"),
    ),
  );
});

test("worked-example ticket uniqueness is enforced after schema decoding", async () => {
  const text =
    "A guess wins if the sum of its six numbers equals the sum of the six drawn numbers.";
  const duplicateTicket = [1, 1, 2, 3, 4, 5];
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast: { schemaVersion: 1, node: { kind: "sum_equals" } },
        consumedSpans: [{ text }],
        workedExamples: [
          {
            draw: [10, 20, 30, 40, 50, 60],
            guess: duplicateTicket,
            outcome: "LOSE",
          },
          {
            draw: [1, 2, 3, 4, 5, 6],
            guess: [7, 8, 9, 10, 11, 12],
            outcome: "LOSE",
          },
        ],
      }),
      requireProviderEvidence: true,
    },
  );

  assert.equal(result.decision, "INVALID");
  assert.ok(result.log.reasonCodes.includes("PROVIDER_EVIDENCE_UNVERIFIED"));
  const evidence = result.log.attemptDiagnostics[0]?.providerEvidence;
  assert.match(
    evidence?.exampleResults[0]?.detail ?? "",
    /six unique integers/iu,
  );
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
      astProvider: agreeingReviewer(() => {
        providerCalled = true;
      }),
      preferDeterministic: true,
    },
  );

  // `preferDeterministic` decides which AST is FROZEN, not whether the reading
  // is reviewed.
  assert.equal(providerCalled, true);
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
      astProvider: agreeingReviewer(),
      preferDeterministic: true,
    },
  );

  assert.equal(minResult.decision, "VALID");
  assert.match(
    minResult.artifact?.officialInterpretation ?? "",
    /smallest number in the guess is equal to the smallest number in the official draw/i,
  );

  // A reviewer that cannot be reached is not a licence to freeze the pattern's
  // reading unreviewed — the same policy the provider path already applies when
  // a required second opinion is missing.
  const unreviewed = await compileRuleArtifact(
    {
      prompt:
        "Win if the smallest guessed number equals the smallest drawn number.",
      tokenCount: 10,
    },
    {
      astProvider: async () => {
        throw new Error("reviewer offline");
      },
      preferDeterministic: true,
    },
  );
  assert.equal(unreviewed.decision, "INVALID");
  assert.ok(
    unreviewed.log.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"),
    JSON.stringify(unreviewed.log.reasonCodes),
  );

  // `disableConsensus` is the documented escape hatch for stopping second
  // opinions, so it stops this one too and the deterministic reading is frozen
  // on its own.
  const diagnostic = await compileRuleArtifact(
    {
      prompt:
        "Win if the smallest guessed number equals the smallest drawn number.",
      tokenCount: 10,
    },
    {
      astProvider: async () => {
        throw new Error("reviewer must not be called");
      },
      disableConsensus: true,
      preferDeterministic: true,
    },
  );
  assert.equal(diagnostic.decision, "VALID");
});

test("a dedicated reviewer validates a deterministic artifact without calling the generator", async () => {
  const prompt =
    "The winning guess is the one whose six numbers include at least three numbers that also appear in the official draw.";
  let generatorCalls = 0;
  let reviewerCalls = 0;
  const result = await compileRuleArtifact(
    { originalText: prompt, prompt, tokenCount: tokenCount(prompt) },
    {
      astProvider: async () => {
        generatorCalls += 1;
        throw new Error("the generator is not needed for a known rule shape");
      },
      astReviewer: agreeingReviewer(() => {
        reviewerCalls += 1;
      }),
      preferDeterministic: true,
      requireProviderEvidence: true,
    },
  );

  assert.equal(result.decision, "VALID");
  assert.equal(generatorCalls, 0);
  assert.equal(reviewerCalls, 1);
  assert.deepEqual(result.artifact?.ast, {
    node: { kind: "match_count_at_least", value: 3 },
    schemaVersion: 1,
  });
  assert.deepEqual(result.log.reasonCodes, ["SUPPORTED_RULE"]);
});

test("the dealer's own sentence is a promise the artifact must keep", async () => {
  // The gap this closes: on the deterministic path the compiler REPLACES the
  // interpret agent's sentence with the AST-derived description. The player
  // approved the agent's sentence in chat, so if the artifact does not implement
  // it, the two diverge with nothing comparing them.
  const prompt = "vence quem mais acertar numeros";
  const request = {
    originalText: prompt,
    prompt,
    tokenCount: tokenCount(prompt),
  };

  // The dealer promised a positional tiebreak the frozen rule does not have.
  const diverged = await compileRuleArtifact(
    {
      ...request,
      agentInterpretation:
        "Got it - the guess with the most matching numbers wins; if nobody matches any, the guess closest to the draw in the same positions wins.",
    },
    { astProvider: agreeingReviewer(), preferDeterministic: true },
  );
  assert.equal(diverged.decision, "INVALID");
  assert.ok(
    diverged.log.reasonCodes.includes("AGENT_STATEMENT_MISMATCH"),
    JSON.stringify(diverged.log.reasonCodes),
  );

  // A faithful restatement of the same rule is not a divergence: the check is
  // one-directional, so prose that says less than the artifact is fine.
  const faithful = await compileRuleArtifact(
    {
      ...request,
      agentInterpretation:
        "Got it - the guess with the most matching numbers wins.",
    },
    { astProvider: agreeingReviewer(), preferDeterministic: true },
  );
  assert.equal(faithful.decision, "VALID");
  assert.equal(
    faithful.log.reasonCodes.includes("AGENT_STATEMENT_MISMATCH"),
    false,
  );
});

test("a deterministic pattern that disagrees with the model is not frozen", async () => {
  // The gap this closes: the pattern compiler used to be both author and
  // reviewer of its own reading, so REVIEWER_MISMATCH could never fire on a
  // deterministic artifact however wrong the pattern's reading was.
  const prompt = "vence quem mais acertar numeros";
  const result = await compileRuleArtifact(
    { originalText: prompt, prompt, tokenCount: tokenCount(prompt) },
    {
      // A different rule entirely: fewest matches instead of most.
      astProvider: async () => ({
        schemaVersion: 2,
        result: {
          type: "ranking",
          direction: "min",
          tieBreak: "share_pool",
          score: {
            kind: "reduce",
            op: "count",
            of: {
              kind: "intersection",
              left: { kind: "source", source: "guess" },
              right: { kind: "source", source: "draw" },
            },
          },
        },
      }),
      preferDeterministic: true,
    },
  );

  assert.equal(result.decision, "INVALID");
  assert.ok(
    result.log.reasonCodes.includes("REVIEWER_MISMATCH"),
    JSON.stringify(result.log.reasonCodes),
  );
});

test("compiles direct ticket-sum comparisons without provider evidence", async () => {
  let providerCalls = 0;
  const prompts = [
    "Got it - your guess wins when its total sum is higher than the draw's total sum.",
    "A guess wins if the sum of your six numbers is greater than the sum of the official draw's six numbers.",
    "For each guess, compute the sum of its six numbers; compute the sum of the official draw's six numbers; the guess wins when its sum is strictly greater than the draw's sum.",
    "Você vence se a soma dos seus seis números for maior que a soma dos números do sorteio oficial.",
  ];

  for (const prompt of prompts) {
    const result = await compileRuleArtifact(
      {
        originalText: prompt,
        prompt,
        tokenCount: tokenCount(prompt),
      },
      {
        astProvider: agreeingReviewer(() => {
          providerCalls += 1;
        }),
        preferDeterministic: true,
        requireProviderEvidence: true,
      },
    );

    assert.equal(result.decision, "VALID", prompt);
    assert.match(
      result.artifact?.officialInterpretation ?? "",
      /sum of the guess's six numbers is greater than the sum of the official draw's six numbers/i,
    );
    assert.equal(
      evaluatePredicate(result.artifact!.ast, {
        draw: [1, 2, 3, 4, 5, 6],
        guess: [10, 11, 12, 13, 14, 15],
      }).result,
      "WIN",
    );
    assert.equal(
      evaluatePredicate(result.artifact!.ast, {
        draw: [10, 11, 12, 13, 14, 15],
        guess: [1, 2, 3, 4, 5, 6],
      }).result,
      "LOSE",
    );
  }

  // "without provider evidence" means the frozen artifact needs none of its own
  // — the deterministic reading is still reviewed once per rule.
  assert.equal(providerCalls, prompts.length);

  const unsupportedCompound = validateAndPrecompileRule({
    originalText:
      "Você vence se a soma dos seus seis números for maior que a soma dos números do sorteio oficial e o primeiro número for par.",
    prompt:
      "Você vence se a soma dos seus seis números for maior que a soma dos números do sorteio oficial e o primeiro número for par.",
    tokenCount: 24,
  });
  assert.equal(unsupportedCompound.decision, "INVALID");
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

test("a provider that returned no AST is not reported as a fidelity failure", async () => {
  // With required evidence, every provider failure also produced
  // INTERPRETATION_MISMATCH — "the compiled artifact did not preserve every
  // stated value" about an artifact that was never built. The player was sent
  // to rewrite numbers that were never the problem; the real cause is the
  // provider code already recorded.
  const text = "A guess wins if at least four of its numbers are drawn.";
  for (const provider of [
    async () => {
      throw new Error("provider unreachable");
    },
    async () => ({
      ast: { totally: "not an ast" },
      consumedSpans: [],
      workedExamples: [],
    }),
  ]) {
    const result = await compileRuleArtifact(
      { originalText: text, prompt: text, tokenCount: countWords(text) },
      { astProvider: provider, requireProviderEvidence: true },
    );
    assert.equal(result.decision, "INVALID");
    assert.equal(
      result.log.reasonCodes.includes("INTERPRETATION_MISMATCH"),
      false,
      JSON.stringify(result.log.reasonCodes),
    );
    assert.ok(result.log.reasonCodes.includes("UNSUPPORTED_RULE"));
  }

  // A provider that DID emit an AST but no usable evidence still fails closed.
  const unevidenced = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast: {
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
        },
        consumedSpans: [],
        workedExamples: [],
      }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(unevidenced.decision, "INVALID");
  assert.ok(
    unevidenced.log.reasonCodes.includes("PROVIDER_SPAN_COVERAGE_INCOMPLETE"),
    JSON.stringify(unevidenced.log.reasonCodes),
  );
  assert.equal(
    unevidenced.log.reasonCodes.includes("INTERPRETATION_MISMATCH"),
    false,
  );
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
    assert.equal(
      result.decision,
      "VALID",
      JSON.stringify(result.log.reasonCodes),
    );
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

test("differing confidence over the same reading is not a disagreement", () => {
  // Every attempt here compiles the SAME text with the SAME deterministic
  // compiler, so all three hold the identical reading and only their confidence
  // action differs. That is not dissent: confidence is enforced by the
  // thresholds and the escalation ladder, and counting it again as disagreement
  // blocked rules every provider had read the same way. Genuine divergence —
  // providers emitting ASTs that behave differently — is covered by the
  // compileRuleArtifact tests further down.
  const result = validateAndPrecompileRule({
    prompt: "Win if at least 4 of your numbers appear in the draw.",
    providerConfidenceActionByPriority: {
      primary: "ESCALATE",
      tertiary: "REJECT",
    },
    tokenCount: 12,
  });

  assert.equal(result.log.providerDisagreementRateSample, 0);
  assert.ok(!result.log.reasonCodes.includes("PROVIDER_DISAGREEMENT"));
  assert.equal(result.decision, "VALID");
  assert.ok(result.artifactHash);
  // The escalated primary still hands off, so the fallback path is exercised.
  assert.equal(result.log.fallbackTriggered, true);
  assert.deepEqual(
    result.log.providerPath.map((attempt) => attempt.priority),
    ["primary", "secondary"],
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
        {
          kind: "compare",
          left: { kind: "elem" },
          op: "gte",
          right: { kind: "lit", value: 1 },
        },
        {
          kind: "compare",
          left: { kind: "elem" },
          op: "lte",
          right: { kind: "lit", value: 99 },
        },
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
          where: {
            kind: "compare",
            left: { kind: "elem" },
            op: "lte",
            right: { kind: "lit", value: 6 },
          },
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
    assert.equal(
      result.decision,
      "VALID",
      JSON.stringify(result.log.reasonCodes),
    );
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

test("a position the player named must survive compilation", () => {
  // The defect this closes: the reported rule's second criterion was positional,
  // the text carried no literals and none of the four original operations, so
  // every gate passed an artifact that had dropped it.
  const dropped = analyzeInterpretationCoverage({
    ast: {
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
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
          },
        },
      },
    },
    officialInterpretation:
      "The winning guess is the one whose numbers include the MOST of the official draw's numbers.",
    text: "vence o palpite que mais acertar numeros; se nao houver ganhador, ganha a menor diferenca nas posicoes correspondentes",
  });
  assert.equal(dropped.covered, false);
  assert.deepEqual(dropped.missingOperations, ["position"]);

  // The v1 grammar spells the positional comparison in the node name, so the
  // generic node visitor cannot see it. It still counts.
  const orderedExact = analyzeInterpretationCoverage({
    ast: { schemaVersion: 1, node: { kind: "ordered_exact" } },
    officialInterpretation:
      "A guess wins if all six guessed numbers match the official draw in the same positions.",
    text: "Win if all six of my numbers match the drawn numbers in the same positions.",
  });
  assert.equal(orderedExact.covered, true);
  assert.deepEqual(orderedExact.requiredOperations, ["position"]);

  // Sorting imposes an order to aggregate over; it is not a positional claim.
  // Counting it would make the cue satisfiable by almost any AST.
  const sortedIsNotPositional = analyzeInterpretationCoverage({
    ast: {
      schemaVersion: 2,
      result: {
        type: "predicate",
        predicate: {
          kind: "compare",
          left: {
            kind: "reduce",
            op: "min",
            of: { kind: "source", source: "guess" },
          },
          op: "eq",
          right: {
            kind: "reduce",
            op: "min",
            of: { kind: "source", source: "draw" },
          },
        },
      },
    },
    officialInterpretation:
      "A guess wins if its lowest number equals the lowest drawn number.",
    text: "Win if the smallest number in the same position as the lowest draw matches.",
  });
  assert.equal(sortedIsNotPositional.covered, false);
});

test("a positional clause that constrains nothing is not a required operation", () => {
  // "the first drawn number is between 1 and 100" names a POSITION but is true
  // of every draw, so a faithful compile omits the clause entirely. Requiring a
  // positional node for it would reject the correct artifact — the same discount
  // the value side already applies to full-domain ranges.
  const vacuousPosition = analyzeInterpretationCoverage({
    ast: {
      schemaVersion: 1,
      node: { kind: "match_count_at_least", value: 6 },
    },
    officialInterpretation:
      "A guess wins if all six guessed numbers appear in the official draw.",
    text: "Win if all your numbers are drawn and the first drawn number is between 1 and 100.",
  });
  assert.deepEqual(vacuousPosition.requiredOperations, []);
  assert.equal(vacuousPosition.covered, true);

  // The discount is scoped to the vacuous clause: a positional clause that
  // really does constrain still requires a positional node.
  const constrainingPosition = analyzeInterpretationCoverage({
    ast: {
      schemaVersion: 1,
      node: { kind: "match_count_at_least", value: 6 },
    },
    officialInterpretation:
      "A guess wins if all six guessed numbers appear in the official draw.",
    text: "Win if all your numbers are drawn and the first drawn number is between 40 and 60.",
  });
  assert.deepEqual(constrainingPosition.requiredOperations, ["position"]);
  assert.equal(constrainingPosition.covered, false);
});

test("a leading positional scope is an ordered comparison, not a match count", () => {
  // Prompt #16 of test set 2. It used to compile to
  // `count(intersection(guess,draw)) == 2` — "exactly two of my numbers were
  // drawn" — which ignores position and is a different rule. The `position`
  // coverage operation is what surfaced it.
  const result = validateAndPrecompileRule({
    prompt:
      "Exactly two positions should have my picked number higher than the drawn number there.",
    tokenCount: 14,
  });
  assert.equal(result.decision, "VALID");
  const ast = result.artifact?.ast;
  assert.ok(
    ast?.schemaVersion === 2 &&
      ast.result.type === "predicate" &&
      ast.result.predicate.kind === "ordered_position_compare_count_eq" &&
      ast.result.predicate.op === "gt" &&
      ast.result.predicate.value === 2,
    `expected an ordered position comparison, got ${JSON.stringify(ast)}`,
  );
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

test("does not reject a near-certain rule when a deterministic loss exists", async () => {
  const text =
    "A guess wins when the sum of its six numbers is greater than the difference between the largest and smallest drawn numbers.";
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: 23 },
    {
      astProvider: async () => ({
        schemaVersion: 2,
        result: {
          type: "predicate",
          predicate: {
            kind: "compare",
            op: "gt",
            left: {
              kind: "reduce",
              op: "sum",
              of: { kind: "source", source: "guess" },
            },
            right: {
              kind: "reduce",
              op: "range_span",
              of: { kind: "source", source: "draw" },
            },
          },
        },
      }),
    },
  );

  assert.equal(result.log.estimatedWinRate, 1);
  assert.equal(result.log.difficultyClass, "TOO_EASY");
  assert.equal(result.decision, "VALID");
  assert.ok(!result.log.reasonCodes.includes("DIFFICULTY_ALWAYS_TRUE"));
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
        return {
          schemaVersion: 1,
          node: { kind: "match_count_at_least", value: 4 },
        };
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
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
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

test("a dedicated LLM reviewer certifies a novel rule without provider fallbacks", async () => {
  let generationCalls = 0;
  let reviewCalls = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => {
        generationCalls += 1;
        return sumCompareAst("lt", 10);
      },
      astReviewer: async () => {
        reviewCalls += 1;
        return sumCompareAst("lt", 10);
      },
    },
  );

  assert.equal(result.decision, "VALID");
  assert.equal(generationCalls, 1);
  assert.equal(reviewCalls, 1);
  assert.ok(!result.log.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"));
  assert.equal(result.log.providerPath.length, 1);
});

test("a novel rule with reviewer consensus binds the complete approved source", async () => {
  const ast = sumCompareAst("lt", 10);
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => ({
        ast,
        consumedSpans: [{ text: "my ticket total" }],
        workedExamples: [
          {
            draw: [95, 96, 97, 98, 99, 100],
            guess: [1, 2, 3, 4, 5, 6],
            outcome: "WIN",
          },
          {
            draw: [1, 2, 3, 4, 5, 6],
            guess: [95, 96, 97, 98, 99, 100],
            outcome: "LOSE",
          },
        ],
      }),
      astReviewer: async () => ast,
      requireProviderEvidence: true,
    },
  );

  assert.equal(result.decision, "VALID");
  assert.deepEqual(result.artifact?.sourceSpans, [
    { text: result.log.normalizedText },
  ]);
  const evidenceStage = result.log.attemptDiagnostics[0]?.stages.find(
    (stage) => stage.stage === "provider_evidence",
  );
  assert.match(
    evidenceStage?.detail ?? "",
    /server bound the complete approved source/i,
  );
});

test("a novel-rule LLM disagreement reports a behavioral counterexample", async () => {
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => sumCompareAst("lt", 10),
      astReviewer: async () => sumCompareAst("gt", 10),
    },
  );

  assert.equal(result.decision, "VALID");
  assert.ok(
    result.log.attemptDiagnostics[0]?.reasonCodes.includes("REVIEWER_MISMATCH"),
  );
  const reviewStage = result.log.attemptDiagnostics[0]?.stages.find(
    (stage) => stage.stage === "independent_review",
  );
  assert.match(reviewStage?.detail ?? "", /guess \[/u);
  assert.match(reviewStage?.detail ?? "", /draw \[/u);
  assert.match(reviewStage?.detail ?? "", /reviewer=/u);
  assert.match(reviewStage?.detail ?? "", /draft=/u);
  const witness = result.log.attemptDiagnostics[0]?.semanticDisagreementWitness;
  assert.ok(witness);
  assert.equal(witness.guess.length, 6);
  assert.equal(witness.draw.length, 6);
  assert.notEqual(witness.reviewerResult, witness.draftResult);
});

test("a third provider arbitrates a reviewer mismatch instead of treating it as a veto", async () => {
  const draft = sumCompareAst("lt", 10);
  const reviewer = sumCompareAst("gt", 10);
  let generationCalls = 0;
  let reviewCalls = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => {
        generationCalls += 1;
        return draft;
      },
      astReviewer: async () => {
        reviewCalls += 1;
        return reviewer;
      },
    },
  );

  assert.equal(result.decision, "VALID");
  assert.equal(generationCalls, 2);
  assert.equal(reviewCalls, 1);
  assert.equal(result.log.providerDisagreementRateSample, 1);
  assert.ok(result.log.reasonCodes.includes("PROVIDER_DISAGREEMENT"));
});

test("ranking disagreement diagnostics compare score and eligibility fields", async () => {
  const ranking = (eligible: boolean) => ({
    schemaVersion: 3,
    result: {
      direction: "max",
      eligibleWhen: {
        kind: "compare",
        left: { kind: "lit", value: eligible ? 1 : 0 },
        op: "eq",
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
  });
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => ranking(true),
      astReviewer: async () => ranking(false),
    },
  );
  const review = result.log.attemptDiagnostics[0]?.stages.find(
    (stage) => stage.stage === "independent_review",
  );
  assert.match(review?.detail ?? "", /reviewer=\{"eligible":false,"score":/u);
  assert.match(review?.detail ?? "", /draft=\{"eligible":true,"score":/u);
  assert.doesNotMatch(review?.detail ?? "", /\[object Object\]/u);
});

test("a provably vacuous reviewer cannot veto a novel candidate with executed evidence", async () => {
  const text =
    "the six picks strictly alternate odd/even in the order chosen and at least one is drawn";
  const source = { kind: "source", source: "guess" } as const;
  const draw = { kind: "source", source: "draw" } as const;
  const parityDiffers = {
    kind: "compare",
    left: {
      kind: "arith",
      left: { kind: "pair", side: "left" },
      op: "mod",
      right: { kind: "lit", value: 2 },
    },
    op: "neq",
    right: {
      kind: "arith",
      left: { kind: "pair", side: "right" },
      op: "mod",
      right: { kind: "lit", value: 2 },
    },
  } as const;
  const matchClause = {
    kind: "compare",
    left: {
      kind: "reduce",
      of: { kind: "intersection", left: source, right: draw },
      op: "count",
    },
    op: "gte",
    right: { kind: "lit", value: 1 },
  } as const;
  const candidate = {
    schemaVersion: 3,
    result: {
      predicate: {
        clauses: [
          {
            kind: "pairs_forall",
            left: { kind: "slice", end: -1, of: source, start: 0 },
            right: { kind: "slice", of: source, start: 1 },
            where: parityDiffers,
          },
          matchClause,
        ],
        kind: "and",
      },
      type: "predicate",
    },
  } as const;
  const parityIsAlwaysValid = {
    clauses: [
      {
        kind: "forall",
        of: source,
        where: {
          clauses: [0, 1].map((value) => ({
            kind: "compare" as const,
            left: {
              kind: "arith" as const,
              left: { kind: "elem" as const },
              op: "mod" as const,
              right: { kind: "lit" as const, value: 2 },
            },
            op: "eq" as const,
            right: { kind: "lit" as const, value },
          })),
          kind: "or",
        },
      },
      matchClause,
    ],
    kind: "and",
  } as const;
  const vacuousReviewer = ruleAstSchema.parse({
    schemaVersion: 3,
    result: { predicate: parityIsAlwaysValid, type: "predicate" },
  });
  assert.equal(hasProvablyVacuousCondition(vacuousReviewer), true);

  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: 16 },
    {
      astProvider: async () => ({
        ast: candidate,
        consumedSpans: [{ text }],
        workedExamples: [
          {
            draw: [5, 20, 30, 40, 50, 60],
            guess: [2, 3, 4, 5, 6, 7],
            outcome: "WIN",
          },
          {
            draw: [5, 20, 30, 40, 50, 60],
            guess: [2, 4, 5, 6, 7, 8],
            outcome: "LOSE",
          },
        ],
      }),
      astReviewer: async () => vacuousReviewer,
      requireProviderEvidence: true,
    },
  );

  assert.equal(result.decision, "VALID");
  assert.ok(!result.log.reasonCodes.includes("REVIEWER_MISMATCH"));
  assert.equal(result.log.providerDisagreementReadings.length, 1);
  const review = result.log.attemptDiagnostics[0]?.stages.find(
    (stage) => stage.stage === "independent_review",
  );
  assert.match(review?.detail ?? "", /vacuous condition.*discarded/iu);
});

test("a missing dedicated reviewer falls back to another configured provider", async () => {
  let generationCalls = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => {
        generationCalls += 1;
        return sumCompareAst("lt", 10);
      },
      astReviewer: async () => {
        throw new Error("review model unavailable");
      },
    },
  );

  assert.equal(result.decision, "VALID");
  assert.equal(generationCalls, 2);
  assert.ok(!result.log.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"));
  assert.equal(result.log.providerPath.length, 2);
});

test("a missing reviewer still fails closed when every fallback provider is unavailable", async () => {
  let generationCalls = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => {
        generationCalls += 1;
        if (generationCalls > 1) {
          throw new Error("fallback provider unavailable");
        }
        return sumCompareAst("lt", 10);
      },
      astReviewer: async () => {
        throw new Error("review model unavailable");
      },
    },
  );

  assert.equal(result.decision, "INVALID");
  assert.equal(generationCalls, 3);
  assert.ok(result.log.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"));
});

test("fails closed when two providers compile the same text differently", async () => {
  const answers = [sumCompareAst("lt", 10), sumCompareAst("gt", 10)];
  let index = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => answers[index++] ?? answers[0],
    },
  );

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifact, null);
  assert.equal(result.log.providerDisagreementRateSample, 1);
  assert.ok(result.log.reasonCodes.includes("PROVIDER_DISAGREEMENT"));
});

test("a reviewer that agreed cannot certify away an operation the text names", async () => {
  // Both models simplified the same clause out of existence, so they agreed —
  // and agreement was being read as an independent reading of the whole
  // sentence. It is not: two readings that lost the same clause are not a
  // reading of that clause. The positional condition is named in the text and
  // absent from the AST, which always changes which guesses win.
  const text =
    "a guess wins if the sum of the guessed numbers that also appear in the draw equals the sum of all six drawn numbers, and at least two of those matching numbers are at the same positions in the guess and in the draw.";
  const droppedPositions = { schemaVersion: 1, node: { kind: "sum_equals" } };
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: 34 },
    {
      astProvider: async () => droppedPositions,
      astReviewer: async () => droppedPositions,
    },
  );

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifact, null);
  assert.ok(result.log.reasonCodes.includes("INTERPRETATION_MISMATCH"));
  // The reviewer agreed, so this is not reported as a reviewer conflict — the
  // fault is that neither reading implements the clause.
  assert.ok(!result.log.reasonCodes.includes("REVIEWER_MISMATCH"));
  const coverageStage = result.log.attemptDiagnostics[0]?.stages.find(
    (stage) => stage.stage === "interpretation_coverage",
  );
  assert.equal(coverageStage?.status, "failed");
  assert.match(
    coverageStage?.detail ?? "",
    /missing operations: .*position/u,
  );
});

test("divergent readings of one text are reported as the text being ambiguous", async () => {
  // Two providers, one sentence, two executable meanings. The divergence is
  // evidence about the WORDING, so it must reach the player as a question
  // (AMBIGUOUS_RULE, PRD 6.6) rather than as a compiler conflict they are told
  // not to try to fix.
  const answers = [sumCompareAst("lt", 10), sumCompareAst("gt", 10)];
  let index = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => answers[index++] ?? answers[0],
    },
  );

  assert.equal(result.decision, "INVALID");
  assert.ok(result.log.reasonCodes.includes("AMBIGUOUS_RULE"));
  // Both readings are named, so a consumer can ask which one was meant instead
  // of inventing a question.
  assert.equal(result.log.providerDisagreementReadings.length, 2);
  assert.notEqual(
    result.log.providerDisagreementReadings[0],
    result.log.providerDisagreementReadings[1],
  );
  assert.match(result.log.reasonSummary, /2 different executable readings/u);
});

test("a disagreement with only one reading is not reported as ambiguity", async () => {
  // The secondary answers off-grammar, so it holds no opinion and contributes no
  // reading. Nothing about the player's wording has been shown to be ambiguous;
  // blaming it would send them rewording a sentence that was never the problem.
  const answers: unknown[] = [sumCompareAst("lt", 10), { schemaVersion: 9 }];
  let index = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      providerConfidenceActionByPriority: { primary: "ESCALATE" },
      tokenCount: 14,
    },
    {
      astProvider: async () => answers[index++] ?? answers[0],
    },
  );

  assert.ok(!result.log.reasonCodes.includes("AMBIGUOUS_RULE"));
  assert.ok(result.log.providerDisagreementReadings.length < 2);
});

test("disableConsensus lifts the rejection but still records the divergence", async () => {
  const answers = [sumCompareAst("lt", 10), sumCompareAst("gt", 10)];
  let index = 0;
  let calls = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    {
      astProvider: async () => {
        calls += 1;
        return answers[index++] ?? answers[0];
      },
      disableConsensus: true,
    },
  );

  // The mandatory second opinion is not bought, so the second reading that
  // would have contradicted the first is never requested.
  assert.equal(calls, 1);
  assert.equal(result.log.providerDisagreementRateSample, 0);
  assert.equal(result.decision, "VALID");
  assert.ok(result.artifact);
  assert.ok(!result.log.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"));
});

test("disableConsensus keeps PROVIDER_DISAGREEMENT in the log when it still happens", async () => {
  // The primary escalates, so the loop reaches the secondary regardless of the
  // flag and the readings do diverge. The divergence must stay auditable; only
  // the rejection is lifted.
  const answers = [sumCompareAst("lt", 10), sumCompareAst("gt", 10)];
  let index = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      providerConfidenceActionByPriority: { primary: "ESCALATE" },
      tokenCount: 14,
    },
    {
      astProvider: async () => answers[index++] ?? answers[0],
      disableConsensus: true,
    },
  );

  assert.equal(result.log.providerDisagreementRateSample, 1);
  assert.ok(result.log.reasonCodes.includes("PROVIDER_DISAGREEMENT"));
  assert.ok(
    !result.log.reasonSummary.includes("provider attempts disagreed"),
    `disagreement must not drive the summary: ${result.log.reasonSummary}`,
  );
});

test("the tertiary resolves a real disagreement by behaviour, not byte equality", async () => {
  // The primary reads the rule one way; the secondary and tertiary read it the
  // other way in two DIFFERENT but algebraically identical shapes. Requiring
  // byte-identical serialized ASTs to corroborate made this unreachable, so
  // every genuine divergence was a permanent dead end.
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
          left: {
            kind: "reduce",
            op: "sum",
            of: { kind: "source", source: "guess" },
          },
          right: { kind: "lit", value: 10 },
        },
        right: {
          kind: "reduce",
          op: "sum",
          of: { kind: "source", source: "draw" },
        },
      },
    },
  };
  const answers: unknown[] = [
    sumCompareAst("gt", 10), // primary — a genuinely different rule
    sumCompareAst("lt", 10), // secondary
    shifted, // tertiary — same behaviour as the secondary, different shape
  ];
  let index = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    { astProvider: async () => answers[index++] ?? answers[0] },
  );

  // The divergence is real and stays on the record...
  assert.equal(result.log.providerDisagreementRateSample, 1);
  assert.ok(result.log.reasonCodes.includes("PROVIDER_DISAGREEMENT"));
  assert.equal(result.log.providerPath.length, 3);
  // ...and the tiebreaker now actually resolves it.
  assert.equal(result.decision, "VALID");
  assert.ok(result.artifact);
  // The corroborated reading is what got frozen: a low guess total against a
  // high draw total WINS under the secondary/tertiary reading and LOSES under
  // the primary's inverted one.
  assert.equal(
    evaluatePredicate(result.artifact.ast, {
      draw: [90, 91, 92, 93, 94, 95],
      guess: [1, 2, 3, 4, 5, 6],
    }).result,
    "WIN",
  );
});

test("a schema-invalid response holds no opinion, so it is not dissent", async () => {
  // The primary emits a node the schema cannot express; the secondary compiles
  // the text fine. That is one compiler producing nothing, not two compilers
  // disagreeing, and the player must not be told otherwise.
  const answers: unknown[] = [
    {
      schemaVersion: 2,
      result: {
        type: "predicate",
        predicate: { kind: "definitely_not_a_real_kind", value: 3 },
      },
    },
    sumCompareAst("lt", 10),
  ];
  let index = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      providerConfidenceActionByPriority: { primary: "ESCALATE" },
      tokenCount: 14,
    },
    { astProvider: async () => answers[index++] ?? answers[1] },
  );

  assert.equal(result.log.providerDisagreementRateSample, 0);
  assert.ok(!result.log.reasonCodes.includes("PROVIDER_DISAGREEMENT"));
  assert.equal(result.log.providerDisagreementBlocked, false);
  // The aggregate reason codes describe the SELECTED reading, so the discarded
  // attempt's fault lives on its own providerPath entry — which is exactly where
  // an operator asking "why was a second opinion needed" will look.
  assert.equal(result.log.providerPath[0]?.decision, "INVALID");
  assert.equal(result.log.providerPath[0]?.status, "escalated");
  const schemaError = result.log.providerPath[0]?.schema_error;
  assert.ok(
    typeof schemaError === "string" && schemaError.length > 0,
    `expected the rejected AST's schema error to be recorded, got ${String(schemaError)}`,
  );
  // One reading survived and nothing corroborated it — say so rather than
  // presenting it as a checked result.
  assert.ok(result.log.reasonCodes.includes("SECOND_OPINION_UNAVAILABLE"));
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
          left: {
            kind: "reduce",
            op: "sum",
            of: { kind: "source", source: "guess" },
          },
          right: { kind: "lit", value: 10 },
        },
        right: {
          kind: "reduce",
          op: "sum",
          of: { kind: "source", source: "draw" },
        },
      },
    },
  };
  const answers = [sumCompareAst("lt", 10), shifted];
  let index = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
    { astProvider: async () => answers[index++] ?? answers[0] },
  );

  assert.equal(result.log.providerDisagreementRateSample, 0);
  assert.equal(result.decision, "VALID");
});

test("records that a required second opinion could not be obtained", async () => {
  let calls = 0;
  const result = await compileRuleArtifact(
    {
      originalText: NO_REFERENCE_PROMPT,
      prompt: NO_REFERENCE_PROMPT,
      tokenCount: 14,
    },
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

test("positional comparisons preserve every compound clause", () => {
  for (const text of [
    "A guess wins when its first number is greater than the first drawn number and its second number is greater than the last drawn number.",
    "ganha o jogador que o o primeiro n\u00famero seja maior que o primeiro n\u00famero do sorteio e o segundo n\u00famero dele seja maior que o \u00faltimo n\u00famero do sorteio",
    "Ganha o jogador cujo primeiro número seja maior que o primeiro número do sorteio e cujo segundo número seja maior que o último número do sorteio.",
  ]) {
    const result = validateAndPrecompileRule({
      agentInterpretation:
        "A guess wins when its first number is greater than the first drawn number and its second number is greater than the last drawn number.",
      originalText: text,
      prompt: text,
      tokenCount: countWords(text),
    });

    assert.equal(
      result.decision,
      "VALID",
      `${text}: ${result.log.reasonCodes.join(",")}`,
    );
    const ast = result.artifact?.ast;
    assert.equal(ast?.schemaVersion, 2);
    assert.equal(
      ast?.schemaVersion === 2 && ast.result.type === "predicate"
        ? ast.result.predicate.kind
        : null,
      "and",
    );
    assert.equal(
      evaluatePredicate(ast!, {
        draw: [10, 20, 30, 40, 50, 60],
        guess: [11, 61, 70, 80, 90, 100],
      }).result,
      "WIN",
    );
    assert.equal(
      evaluatePredicate(ast!, {
        draw: [10, 20, 30, 40, 50, 60],
        guess: [11, 59, 70, 80, 90, 100],
      }).result,
      "LOSE",
    );
  }
});

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

test("multipliers are never reinterpreted as match-count thresholds", () => {
  for (const text of [
    "A guess wins if the product of its two smallest numbers is at least three times the highest drawn number.",
    "A guess wins when its two lowest values multiplied together are at least four times the largest value in the draw.",
    "O palpite vence se o produto dos dois menores numeros for pelo menos cinco vezes o maior numero sorteado.",
  ]) {
    const result = compile(text);
    assert.equal(result.decision, "INVALID", text);
    assert.ok(!result.log.reasonCodes.includes("SUPPORTED_RULE"), text);
    assert.equal(result.artifact, null, text);
  }

  const genuineCount = compile(
    "A guess wins if at least three of its numbers match the official draw.",
  );
  assert.equal(genuineCount.decision, "VALID");
  assert.deepEqual(genuineCount.artifact?.ast, {
    node: { kind: "match_count_at_least", value: 3 },
    schemaVersion: 1,
  });
});

test("partial positional enumerations fail closed instead of becoming conjunctions", () => {
  for (const text of [
    "A guess wins if at least four of these five comparisons hold: the first guessed number is greater than the second drawn number, the second guessed number is greater than the third drawn number, and so on through the fifth guessed number being greater than the sixth drawn number.",
    "A guess wins if exactly three comparisons hold: the first guessed number is greater than the second drawn number, the second guessed number is greater than the third drawn number, and the pattern continues.",
    "O palpite vence se pelo menos quatro comparacoes forem verdadeiras: o primeiro numero e maior que o segundo numero do sorteio, o segundo numero e maior que o terceiro numero do sorteio, e assim por diante.",
  ]) {
    const result = compile(text);
    assert.equal(result.decision, "INVALID", text);
    assert.ok(!result.log.reasonCodes.includes("SUPPORTED_RULE"), text);
    assert.equal(result.artifact, null, text);
  }
});

test("rejected deterministic candidates remain inspectable but are not player readings", async () => {
  const text =
    "A guess wins if its first number is greater than the first drawn number.";
  const providerReading = ruleAstSchema.parse({
    schemaVersion: 1,
    node: { kind: "sum_equals" },
  });
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: tokenCount(text) },
    {
      astProvider: async () => providerReading,
      astReviewer: async () => providerReading,
      preferDeterministic: true,
    },
  );
  const firstAttempt = result.log.attemptDiagnostics[0];
  assert.equal(firstAttempt?.decision, "INVALID");
  assert.ok(firstAttempt?.candidate?.ast);
  // The provider's sum AST drops the position comparison, so it is compiler
  // evidence only; it must not be presented as a reading of the player's text.
  assert.deepEqual(result.log.providerDisagreementReadings, []);
  assert.ok(!result.log.reasonCodes.includes("AMBIGUOUS_RULE"));
});

test("v3 composition descriptions expose digit counts and shifted comparisons", () => {
  const guess = { kind: "source", source: "guess" } as const;
  const draw = { kind: "source", source: "draw" } as const;
  const digitCount = ruleAstSchema.parse({
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
            kind: "distinct",
            of: { kind: "digits", of: guess, place: "tens" },
          },
        },
        right: { kind: "lit", value: 5 },
      },
    },
  });
  assert.match(
    describeRuleAstForPlayers(digitCount),
    /number of different tens digits in your numbers is at least 5/iu,
  );

  const shifted = ruleAstSchema.parse({
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
            left: { kind: "slice", of: guess, start: 0, end: 5 },
            right: { kind: "slice", of: draw, start: 1 },
            expr: {
              kind: "ite",
              if: {
                kind: "compare",
                op: "gt",
                left: { kind: "pair", side: "left" },
                right: { kind: "pair", side: "right" },
              },
              then: { kind: "lit", value: 1 },
              else: { kind: "lit", value: 0 },
            },
          },
        },
        right: { kind: "lit", value: 4 },
      },
    },
  });
  const description = describeRuleAstForPlayers(shifted);
  assert.match(description, /at least 4 of the paired comparisons hold/iu);
  assert.match(description, /positions 1 to 5 of your numbers/iu);
  assert.match(description, /drawn numbers from position 2 onward/iu);
  assert.match(description, /greater than/iu);
});

test("v3 ranking descriptions explain eligibility and ordered criteria", () => {
  const guess = { kind: "source", source: "guess" } as const;
  const draw = { kind: "source", source: "draw" } as const;
  const ranking = ruleAstSchema.parse({
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "min",
      tieBreak: "share_pool",
      eligibleWhen: {
        kind: "forall",
        of: guess,
        where: {
          kind: "compare",
          op: "gt",
          left: { kind: "elem" },
          right: { kind: "reduce", op: "min", of: draw },
        },
      },
      score: {
        kind: "arith",
        op: "add",
        left: {
          kind: "arith",
          op: "mul",
          left: { kind: "lit", value: 1000 },
          right: { kind: "reduce", op: "range_span", of: guess },
        },
        right: { kind: "reduce", op: "sum", of: guess },
      },
    },
  });
  const description = describeRuleAstForPlayers(ranking);
  assert.match(description, /all greater than the smallest drawn number/iu);
  assert.match(description, /smallest gap between its highest and lowest/iu);
  assert.match(description, /smaller sum breaks a tie/iu);
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

test("an enumerated ordered sequence is not a guess-versus-draw ordered match", async () => {
  // Reported from the app: the player asked for "win with 1 2 3 4 5 6, in that
  // order, when the draw is not that sequence". The pattern compiler's broad
  // `exact + order + match` fallback answered with the v1 `ordered_exact` macro
  // — "the guess equals the DRAW" — which mentions none of the six values and
  // inverts the draw clause. It then blocked the player twice: as the primary
  // AST (INTERPRETATION_MISMATCH, with no rewrite that escapes it) and as the
  // reviewer AST, which rejected a faithful provider compile of the same text.
  const text =
    "A guess wins only if it exactly equals [1, 2, 3, 4, 5, 6] in that order and the official draw does not equal [1, 2, 3, 4, 5, 6] in that same order.";

  const deterministic = compile(text);
  assert.equal(deterministic.decision, "INVALID");
  assert.equal(deterministic.artifact, null);

  const orderedLiteral = (source: "draw" | "guess") => ({
    kind: "and",
    clauses: [1, 2, 3, 4, 5, 6].map((value, index) => ({
      kind: "compare",
      op: "eq",
      left: { kind: "at", index, of: { kind: "source", source } },
      right: { kind: "lit", value },
    })),
  });
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast: {
          schemaVersion: 3,
          result: {
            type: "predicate",
            predicate: {
              kind: "and",
              clauses: [
                orderedLiteral("guess"),
                { kind: "not", clause: orderedLiteral("draw") },
              ],
            },
          },
        },
        consumedSpans: [
          { text: "it exactly equals [1, 2, 3, 4, 5, 6] in that order" },
          {
            text: "the official draw does not equal [1, 2, 3, 4, 5, 6] in that same order",
          },
        ],
        workedExamples: [
          {
            draw: [10, 20, 30, 40, 50, 60],
            guess: [1, 2, 3, 4, 5, 6],
            outcome: "WIN" as const,
          },
          {
            draw: [1, 2, 3, 4, 5, 6],
            guess: [1, 2, 3, 4, 5, 6],
            outcome: "LOSE" as const,
          },
        ],
      }),
      preferDeterministic: true,
      requireProviderEvidence: true,
    },
  );

  assert.equal(result.decision, "VALID");
  const frozen = result.artifact!.ast;
  for (const [expected, guess, draw] of [
    ["WIN", [1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12]],
    ["LOSE", [1, 2, 3, 4, 5, 6], [1, 2, 3, 4, 5, 6]],
    ["LOSE", [6, 5, 4, 3, 2, 1], [7, 8, 9, 10, 11, 12]],
    ["LOSE", [1, 2, 3, 4, 5, 7], [7, 8, 9, 10, 11, 12]],
  ] as const) {
    assert.equal(
      evaluatePredicate(frozen, { draw: [...draw], guess: [...guess] }).result,
      expected,
      `${guess.join(" ")} vs ${draw.join(" ")}`,
    );
  }

  // The fallback still serves the rule it actually implements: both sides named,
  // no enumerated values to drop.
  const guessVersusDraw = compile(
    "A guess wins if its numbers match the official draw exactly, in the same order.",
  );
  assert.equal(guessVersusDraw.decision, "VALID");
  assert.deepEqual(guessVersusDraw.artifact?.ast, {
    node: { kind: "ordered_exact" },
    schemaVersion: 1,
  });
});

test("framing words outside the consumed spans do not block a faithful compile", async () => {
  // Source-span coverage exists to catch a CONDITION the AST never compiled. It
  // used to demand that the leftover text be empty after stripping a short
  // stopword list, so ordinary framing ("wins ONLY if", "the PLAYER wins")
  // rejected correct compiles — and the player was told to restate their
  // numbers, which could never fix the word that actually blocked them.
  const text =
    "The player wins only if the sum of the guessed numbers is greater than the sum of the drawn numbers.";
  const condition = {
    kind: "compare",
    op: "gt",
    left: {
      kind: "reduce",
      op: "sum",
      of: { kind: "source", source: "guess" },
    },
    right: {
      kind: "reduce",
      op: "sum",
      of: { kind: "source", source: "draw" },
    },
  };
  const workedExamples = [
    {
      draw: [1, 2, 3, 4, 5, 6],
      guess: [95, 96, 97, 98, 99, 100],
      outcome: "WIN" as const,
    },
    {
      draw: [95, 96, 97, 98, 99, 100],
      guess: [1, 2, 3, 4, 5, 6],
      outcome: "LOSE" as const,
    },
  ];
  const framed = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast: {
          schemaVersion: 3,
          result: { type: "predicate", predicate: condition },
        },
        consumedSpans: [
          {
            text: "the sum of the guessed numbers is greater than the sum of the drawn numbers",
          },
        ],
        workedExamples,
      }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(framed.decision, "VALID");

  // A clause the AST never compiled still blocks: the residue carries its own
  // operation and comparator.
  const compoundText = `${text.replace(/\.$/u, "")} and at least two guessed numbers appear in the official draw.`;
  const dropped = await compileRuleArtifact(
    {
      originalText: compoundText,
      prompt: compoundText,
      tokenCount: countWords(compoundText),
    },
    {
      astProvider: async () => ({
        ast: {
          schemaVersion: 3,
          result: { type: "predicate", predicate: condition },
        },
        consumedSpans: [
          {
            text: "the sum of the guessed numbers is greater than the sum of the drawn numbers",
          },
        ],
        workedExamples,
      }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(dropped.decision, "INVALID");
  assert.ok(
    dropped.log.reasonCodes.includes("PROVIDER_SPAN_COVERAGE_INCOMPLETE"),
    JSON.stringify(dropped.log.reasonCodes),
  );
});

test("an operation the player named must survive compilation", () => {
  // A dropped VALUE is not the only way to freeze a different rule: these all
  // kept every literal the player wrote and still changed the rule. The pattern
  // compiler now declines them outright (UNSUPPORTED_RULE) instead of emitting
  // the mis-compile for the coverage gate to catch, so in production the
  // provider still gets to compile the text — but on this deterministic-only
  // path the outcome that matters is unchanged: no artifact is frozen.
  for (const text of [
    "A guess wins if the sum of the guessed numbers modulo 10 equals the sum of the drawn numbers modulo 10.",
    "A guess wins if it has exactly three odd guessed numbers and the official draw also has exactly three odd drawn numbers.",
    "A guess wins if at least one guessed number appears in the official draw and at least one guessed number has the same tens digit as a drawn number.",
    "A guess wins if at least three of its guessed numbers appear in the official draw and the sum of the guessed numbers is greater than 200.",
  ]) {
    const result = compile(text);
    assert.equal(result.decision, "INVALID", text);
    assert.equal(result.artifact, null, text);
    assert.ok(
      result.log.reasonCodes.includes("UNSUPPORTED_RULE") ||
        result.log.reasonCodes.includes("INTERPRETATION_MISMATCH"),
      text,
    );
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

test("position-specific inclusive ranges compile in English and Portuguese", () => {
  const texts = [
    "A guess wins if the first number is between 1 and 100, the second between 2 and 99, and the third between 3 and 98.",
    "Quero ganhar se o primeiro n\u00famero estiver entre 1 e 100, o segundo entre 2 e 99 e o terceiro entre 3 e 98.",
  ];

  for (const text of texts) {
    const result = compile(text);
    assert.equal(result.decision, "VALID", text);
    assert.equal(
      result.artifact?.officialInterpretation,
      "A guess wins if its 1st number is between 1 and 100 (both included), its 2nd number is between 2 and 99 (both included) and its 3rd number is between 3 and 98 (both included).",
    );

    const evaluate = (guess: number[]) =>
      evaluatePredicate(result.artifact!.ast, {
        draw: [10, 20, 30, 40, 50, 60],
        guess,
      }).result;

    assert.equal(evaluate([1, 2, 3, 40, 50, 60]), "WIN", "lower endpoints win");
    assert.equal(
      evaluate([100, 99, 98, 40, 50, 60]),
      "WIN",
      "upper endpoints win",
    );
    assert.equal(
      evaluate([1, 1, 3, 40, 50, 60]),
      "LOSE",
      "second position below range loses",
    );
    assert.equal(
      evaluate([1, 2, 99, 40, 50, 60]),
      "LOSE",
      "third position above range loses",
    );
  }
});

test("stress set 4 objective rules compile to their stated boundary behaviour", () => {
  const cases: Array<{
    text: string;
    fixtures: Array<{
      draw: number[];
      guess: number[];
      expected: "WIN" | "LOSE";
    }>;
  }> = [
    {
      text: "Every guessed number must be within 4 of the drawn number in the same position, and at least two guessed numbers must exactly equal their drawn numbers in those positions.",
      fixtures: [
        {
          guess: [10, 20, 34, 44, 54, 64],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "WIN",
        },
        {
          guess: [14, 24, 34, 44, 54, 64],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if the sum of its numbers is at least 12 higher than the sum of the drawn numbers.",
      fixtures: [
        {
          guess: [10, 20, 30, 40, 50, 72],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "WIN",
        },
        {
          guess: [10, 20, 30, 40, 50, 71],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if the sum of its three smallest numbers is greater than the sum of the three smallest drawn numbers.",
      fixtures: [
        {
          guess: [11, 21, 31, 70, 80, 90],
          draw: [10, 20, 30, 80, 90, 100],
          expected: "WIN",
        },
        {
          guess: [9, 20, 30, 70, 80, 90],
          draw: [10, 20, 30, 80, 90, 100],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if none of its even guessed numbers appear anywhere in the official draw.",
      fixtures: [
        {
          guess: [4, 6, 13, 15, 17, 19],
          draw: [2, 3, 5, 7, 9, 11],
          expected: "WIN",
        },
        {
          guess: [2, 4, 13, 15, 17, 19],
          draw: [2, 3, 5, 7, 9, 11],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if its number sum modulo 7 equals the official draw's number sum modulo 7.",
      fixtures: [
        {
          guess: [5, 15, 25, 35, 55, 75],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "WIN",
        },
        {
          guess: [5, 15, 25, 35, 55, 76],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if it contains 42 and the sum of the six drawn numbers is below 150.",
      fixtures: [
        {
          guess: [1, 2, 3, 4, 5, 42],
          draw: [1, 2, 3, 4, 5, 100],
          expected: "WIN",
        },
        {
          guess: [1, 2, 3, 4, 5, 41],
          draw: [1, 2, 3, 4, 5, 100],
          expected: "LOSE",
        },
        {
          guess: [1, 2, 3, 4, 5, 42],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if all six guessed numbers are strictly greater than 10 and strictly less than 90.",
      fixtures: [
        {
          guess: [11, 20, 30, 40, 50, 89],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "WIN",
        },
        {
          guess: [10, 20, 30, 40, 50, 89],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "LOSE",
        },
        {
          guess: [11, 20, 30, 40, 50, 90],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if its total is at least ten lower than the official draw total.",
      fixtures: [
        {
          guess: [5, 15, 25, 35, 55, 65],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "WIN",
        },
        {
          guess: [5, 15, 25, 35, 56, 65],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if its six numbers are exactly 1, 2, 3, 4, 5 and 6 in any order and at least one drawn number is between 40 and 60, inclusive.",
      fixtures: [
        {
          guess: [1, 2, 3, 4, 5, 6],
          draw: [10, 20, 30, 40, 70, 80],
          expected: "WIN",
        },
        {
          guess: [1, 2, 3, 4, 5, 7],
          draw: [10, 20, 30, 40, 70, 80],
          expected: "LOSE",
        },
        {
          guess: [1, 2, 3, 4, 5, 6],
          draw: [1, 2, 3, 98, 99, 100],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if all six drawn numbers are below 40. The player's guessed numbers do not affect the result.",
      fixtures: [
        {
          guess: [50, 60, 70, 80, 90, 100],
          draw: [1, 2, 3, 4, 5, 39],
          expected: "WIN",
        },
        {
          guess: [1, 2, 3, 4, 5, 6],
          draw: [1, 2, 3, 4, 5, 40],
          expected: "LOSE",
        },
      ],
    },
    {
      text: "A guess wins if it contains the number 77. The official draw does not affect the result.",
      fixtures: [
        {
          guess: [1, 2, 3, 4, 5, 77],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "WIN",
        },
        {
          guess: [1, 2, 3, 4, 5, 76],
          draw: [10, 20, 30, 40, 50, 60],
          expected: "LOSE",
        },
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

// Turn 57 regression, defect 1 of 2.
//
// The card printed "a guess wins if and only if it contains EXACTLY the numbers
// 1, 2, 3 and 4 (and two other numbers from 5 through 100)" over an AST that
// only requires the guess to INCLUDE those four. Every literal survived, so the
// value/operation coverage gate saw nothing; the claim that changed was a
// quantifier. That sentence is what the player reads, what voters vote on, and
// what `normalizedTextHash` commits on-chain.
test("a headline that claims exclusivity the artifact does not implement is not faithful", () => {
  const includesFour = {
    result: {
      predicate: {
        clauses: [1, 2, 3, 4].map((value) => ({
          array: { kind: "source", source: "guess" },
          kind: "contains",
          value: { kind: "lit", value },
        })),
        kind: "and",
      },
      type: "predicate",
    },
    schemaVersion: 3,
  } as const;
  const ast = ruleAstSchema.parse(includesFour);

  const unfaithful = analyzeStatementFidelity({
    ast,
    statement:
      "a guess wins if and only if it contains exactly the numbers 1, 2, 3 and 4 (and two other numbers from 5 through 100), and none of the numbers 1, 2, 3 or 4 appears in the official draw.",
  });
  assert.equal(unfaithful.faithful, false);
  assert.deepEqual(unfaithful.unsupportedClaims, ["exclusive_guess_set"]);

  // The same artifact described without the exclusivity claim is fine.
  assert.equal(
    analyzeStatementFidelity({
      ast,
      statement:
        "a guess wins if it contains the numbers 1, 2, 3 and 4 and none of 1, 2, 3, 4 appears in the official draw.",
    }).faithful,
    true,
  );

  // And an artifact that DOES pin a whole ticket may say "exactly": six pinned
  // values over six distinct slots is set equality.
  const pinsSix = ruleAstSchema.parse({
    result: {
      predicate: {
        clauses: [1, 2, 3, 4, 5, 6].map((value) => ({
          array: { kind: "source", source: "guess" },
          kind: "contains",
          value: { kind: "lit", value },
        })),
        kind: "and",
      },
      type: "predicate",
    },
    schemaVersion: 3,
  });
  assert.equal(
    analyzeStatementFidelity({
      ast: pinsSix,
      statement:
        "a guess wins if its six numbers are exactly 1, 2, 3, 4, 5 and 6, in any order.",
    }).faithful,
    true,
  );

  // An exclusivity word with no enumeration states no set claim at all.
  assert.equal(
    analyzeStatementFidelity({
      ast,
      statement:
        "a guess wins if only the sum of its numbers is greater than 200.",
    }).faithful,
    true,
  );

  // ...and neither does one that merely shares a sentence with an enumeration.
  // The cue has to introduce the set, or every rule that pins a few values and
  // states an exact threshold would lose its readable headline for no reason.
  assert.equal(
    analyzeStatementFidelity({
      ast,
      statement:
        "a guess wins if it contains the numbers 1, 2, 3 and 4 and the sum of its numbers is exactly 100.",
    }).faithful,
    true,
  );
});

// Turn 57 regression, defect 2 of 2.
//
// A correct compile of a rare winning condition was rejected because the model
// could not hand-build a WINNING ticket for it. Discrimination is measured
// downstream over many samples (DIFFICULTY_IMPOSSIBLE / DIFFICULTY_ALWAYS_TRUE);
// requiring the provider to also demonstrate it by example penalised exactly the
// hard rules it was meant to protect, and reported the refusal as if the player
// had dropped a number.
test("provider evidence does not have to include a winning example", async () => {
  const text =
    "A guess wins if it contains the numbers 1, 2, 3 and 4 and none of 1, 2, 3 or 4 appears in the official draw.";
  const ast = {
    result: {
      predicate: {
        clauses: [
          ...[1, 2, 3, 4].map((value) => ({
            array: { kind: "source", source: "guess" },
            kind: "contains",
            value: { kind: "lit", value },
          })),
          {
            clause: {
              clauses: [1, 2, 3, 4].map((value) => ({
                array: { kind: "source", source: "draw" },
                kind: "contains",
                value: { kind: "lit", value },
              })),
              kind: "or",
            },
            kind: "not",
          },
        ],
        kind: "and",
      },
      type: "predicate",
    },
    schemaVersion: 3,
  };
  const losingOnly = [
    {
      draw: [1, 20, 30, 40, 50, 60],
      guess: [1, 2, 3, 4, 57, 88],
      outcome: "LOSE",
    },
    {
      draw: [9, 20, 30, 40, 50, 60],
      guess: [5, 6, 7, 8, 57, 88],
      outcome: "LOSE",
    },
  ];
  const accepted = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast,
        consumedSpans: [{ text: text.toLowerCase() }],
        workedExamples: losingOnly,
      }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(
    accepted.decision,
    "VALID",
    JSON.stringify(accepted.log.reasonCodes),
  );

  // What evidence still proves: an example that contradicts the artifact blocks,
  // under the code that names that fault.
  const contradicting = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast,
        consumedSpans: [{ text: text.toLowerCase() }],
        workedExamples: [
          losingOnly[0],
          {
            draw: [1, 20, 30, 40, 50, 60],
            guess: [1, 2, 3, 4, 57, 88],
            outcome: "WIN",
          },
        ],
      }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(contradicting.decision, "INVALID");
  assert.ok(
    contradicting.log.reasonCodes.includes("PROVIDER_EVIDENCE_UNVERIFIED"),
    JSON.stringify(contradicting.log.reasonCodes),
  );
  assert.equal(
    contradicting.log.reasonCodes.includes("INTERPRETATION_MISMATCH"),
    false,
  );
});

// Turn 57 regression, defect 3 of 3 — the block that survived the first two fixes.
//
// Once the player confirms that the remaining numbers are unrestricted, the
// interpret agent preserves that remainder in the wording (its own contract says
// to, so the same question is not asked twice). The compiler then refuses to
// compile the remainder, because for a ticket that already contains 1, 2, 3 and
// 4 the clause "the remaining two numbers are distinct and from 1 to 100
// excluding 1, 2, 3, and 4" is true of every valid guess. The span gate used to
// read that unconsumed no-op as a dropped condition, so the two contracts
// contradicted each other and no wording satisfied both.
test("a vacuously true remainder clause is not an unread condition", async () => {
  const text =
    "A guess wins if it contains the numbers 1, 2, 3, and 4, does not contain any of the numbers 1, 2, 3, or 4 in the official draw, and the remaining two numbers in the guess are distinct and from 1 to 100 excluding 1, 2, 3, and 4.";
  const ast = {
    result: {
      predicate: {
        clauses: [
          ...[1, 2, 3, 4].map((value) => ({
            array: { kind: "source", source: "guess" },
            kind: "contains",
            value: { kind: "lit", value },
          })),
          {
            clause: {
              clauses: [1, 2, 3, 4].map((value) => ({
                array: { kind: "source", source: "draw" },
                kind: "contains",
                value: { kind: "lit", value },
              })),
              kind: "or",
            },
            kind: "not",
          },
        ],
        kind: "and",
      },
      type: "predicate",
    },
    schemaVersion: 3,
  };
  // The spans the provider actually reported for this text in production: the
  // two load-bearing clauses, and not the vacuous remainder.
  const consumedSpans = [
    { text: "contains the numbers 1, 2, 3, and 4" },
    {
      text: "does not contain any of the numbers 1, 2, 3, or 4 in the official draw",
    },
  ];
  const workedExamples = [
    {
      draw: [1, 20, 30, 40, 50, 60],
      guess: [1, 2, 3, 4, 57, 88],
      outcome: "LOSE",
    },
    {
      draw: [9, 20, 30, 40, 50, 60],
      guess: [1, 2, 3, 4, 57, 88],
      outcome: "WIN",
    },
  ];
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({ ast, consumedSpans, workedExamples }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(
    result.decision,
    "VALID",
    JSON.stringify(result.log.reasonCodes),
  );

  // The narrowing is about vacuous text, not about leniency: a leftover clause
  // that can still change who wins keeps blocking, digits or no digits.
  const withRealDrop = `${text.replace(/\.$/u, "")} and at least two guessed numbers appear in the official draw.`;
  const dropped = await compileRuleArtifact(
    {
      originalText: withRealDrop,
      prompt: withRealDrop,
      tokenCount: countWords(withRealDrop),
    },
    {
      astProvider: async () => ({ ast, consumedSpans, workedExamples }),
      requireProviderEvidence: true,
    },
  );
  assert.equal(dropped.decision, "INVALID");
  assert.ok(
    dropped.log.reasonCodes.includes("PROVIDER_SPAN_COVERAGE_INCOMPLETE"),
    JSON.stringify(dropped.log.reasonCodes),
  );
});

test("a range over the numbers a rule has not pinned is vacuous, not a required literal", () => {
  // Reported from the app: the player asked for "1, 2, 3, 4 in my guess, none of
  // them in the draw, and the other two between 5 and 100". A ticket holds six
  // distinct values from 1..100, so once 1..4 are pinned the other two are
  // ALREADY in 5..100 — the clause constrains nothing. Requiring 5 and 100 to
  // survive into the AST left the rule with no reachable compile: a faithful
  // artifact omits the redundant bounds and fails coverage, while one that reads
  // the bounds as covering the whole guess contradicts the pinned values and is
  // IMPOSSIBLE. Two providers landing on the two readings is also a
  // PROVIDER_DISAGREEMENT, which tells the player the fault is not theirs to fix.
  const pinned = [1, 2, 3, 4];
  const ast = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "and",
        clauses: [
          ...pinned.map((value) => ({
            kind: "contains",
            array: { kind: "source", source: "guess" },
            value: { kind: "lit", value },
          })),
          ...pinned.map((value) => ({
            kind: "not",
            clause: {
              kind: "contains",
              array: { kind: "source", source: "draw" },
              value: { kind: "lit", value },
            },
          })),
        ],
      },
    },
  } as const;
  const parsedAst = ruleAstSchema.parse(ast);

  for (const text of [
    "I win if my numbers are 1 2 3 4 and the lottery numbers contain none of these numbers. The remaining two guessed numbers should be any number between 5 and 100, including 5 and 100.",
    "Win if my guess contains 1, 2, 3, 4 in any order, the draw has none of those, and the other two numbers are each between 5 and 100 inclusive.",
  ]) {
    const coverage = analyzeInterpretationCoverage({
      ast: parsedAst,
      officialInterpretation:
        "The guess contains 1, 2, 3 and 4, and the official draw contains none of them.",
      text,
    });
    assert.deepEqual(coverage.requiredValues, pinned, text);
    assert.equal(coverage.covered, true, JSON.stringify(coverage));
  }

  // The narrowing is about a range that provably adds nothing, not about
  // dropping bounds. Without the remainder cue the same words constrain the
  // WHOLE guess and contradict the pinned values, so the bounds stay required
  // and the contradiction is still reported instead of being relaxed away.
  const wholeGuess = analyzeInterpretationCoverage({
    ast: parsedAst,
    officialInterpretation:
      "The guess contains 1, 2, 3 and 4, and the official draw contains none of them.",
    text: "I win if my guess contains 1, 2, 3, 4 and all six guessed numbers are between 5 and 100.",
  });
  assert.deepEqual(wholeGuess.requiredValues, [1, 2, 3, 4, 5, 100]);
  assert.deepEqual(wholeGuess.missingFromAst, [5, 100]);
  assert.equal(wholeGuess.covered, false);

  // A gap in the pinned block means the range genuinely excludes something: with
  // 2 and 4 pinned, "the others between 5 and 100" rules out 1 and 3.
  const gapped = analyzeInterpretationCoverage({
    ast: parsedAst,
    officialInterpretation:
      "The guess contains 1, 2, 3 and 4, and the official draw contains none of them.",
    text: "I win if my guess contains 2 and 4 and the remaining four numbers are between 5 and 100.",
  });
  assert.ok(
    gapped.requiredValues.includes(5) && gapped.requiredValues.includes(100),
    JSON.stringify(gapped.requiredValues),
  );
});

test("providerCompilationHasSchemaValidAst separates a usable envelope from an off-grammar one", () => {
  const contains = (value: number) => ({
    array: { kind: "source", source: "guess" },
    kind: "contains",
    value: { kind: "lit", value },
  });
  const usable = {
    ast: {
      result: {
        predicate: { clauses: [1, 2, 3, 4, 5, 7].map(contains), kind: "and" },
        type: "predicate",
      },
      schemaVersion: 3,
    },
    consumedSpans: [],
    workedExamples: [],
  };
  assert.equal(providerCompilationHasSchemaValidAst(usable), true);

  // No array literal and no set equality exist in the grammar, so this is the
  // shape a model reaches for when asked for "the set equals {…}".
  assert.equal(
    providerCompilationHasSchemaValidAst({
      ast: {
        result: {
          predicate: {
            kind: "compare",
            left: { kind: "source", source: "guess" },
            op: "eq",
            right: { kind: "set", values: [1, 2, 3, 4, 5, 7] },
          },
          type: "predicate",
        },
        schemaVersion: 3,
      },
      consumedSpans: [],
      workedExamples: [],
    }),
    false,
  );

  // A bare AST with no envelope wrapper is still read correctly.
  assert.equal(providerCompilationHasSchemaValidAst(usable.ast), true);
  assert.equal(providerCompilationHasSchemaValidAst(null), false);
  assert.equal(providerCompilationHasSchemaValidAst({ ast: null }), false);
});

test("set-7 distance, gap, and quantified rules cannot enter the match-count shortcut", () => {
  const falseMatchCountShapes = [
    "A guess wins if every drawn number has at least one guessed number within 3 of it, and none of the guessed numbers is itself one of the drawn numbers.",
    "A guess wins if both of these hold: the largest gap between its consecutive sorted numbers is at least 8, and every one of its numbers is at least 4 away from every drawn number.",
    "Every one of its numbers is at least 4 away from every drawn number.",
    "At least 2 of its numbers sit more than 10 below the lowest drawn number.",
    "The gap between its two smallest numbers is at least 5 and its largest number is above every drawn number.",
  ];

  for (const text of falseMatchCountShapes) {
    const result = compile(text);
    assert.equal(result.decision, "INVALID", text);
    assert.ok(!result.log.reasonCodes.includes("SUPPORTED_RULE"), text);
    assert.equal(result.artifact, null, text);
  }

  const genuine = compile(
    "A guess wins if at least four of its numbers appear in the official draw.",
  );
  assert.equal(genuine.decision, "VALID");
  assert.ok(genuine.log.reasonCodes.includes("SUPPORTED_RULE"));
});

test("set-7 coverage sees directional quantifiers, distance thresholds, and derived gaps", () => {
  const text =
    "A guess wins if every drawn number has at least one guessed number within 3 of it, and none of the guessed numbers is itself one of the drawn numbers.";
  const droppedCoverage = ruleAstSchema.parse({
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op: "eq",
        left: {
          kind: "reduce",
          op: "count",
          of: {
            kind: "intersection",
            left: { kind: "source", source: "guess" },
            right: { kind: "source", source: "draw" },
          },
        },
        right: { kind: "lit", value: 0 },
      },
    },
  });
  const coverage = analyzeInterpretationCoverage({
    ast: droppedCoverage,
    officialInterpretation: describeRuleAstForPlayers(droppedCoverage),
    text,
  });
  assert.equal(coverage.covered, false);
  assert.deepEqual(coverage.requiredValues, [3]);
  assert.ok(coverage.missingOperations.includes("all_draw"));
  assert.ok(coverage.missingOperations.includes("distance"));

  const gapRequirements = analyzeInterpretationCoverage({
    ast: droppedCoverage,
    officialInterpretation: describeRuleAstForPlayers(droppedCoverage),
    text: "The five gaps between consecutive sorted numbers are all different, and the largest gap is below the lowest drawn number.",
  });
  for (const operation of [
    "adjacent_gap",
    "distinct",
    "maximum",
    "minimum",
    "sort",
  ] as const) {
    assert.ok(gapRequirements.requiredOperations.includes(operation));
    assert.ok(gapRequirements.missingOperations.includes(operation));
  }
});

test("protocol ranking tie clauses are neither external state nor ambiguity", () => {
  const prizeTie =
    "The winning ticket has the biggest remainder after division by the lowest drawn number; tickets with the same remainder share the prize.";
  const severalTie =
    "The ticket with the most same-position matches wins; if several tickets tie on that count, they split it equally.";
  assert.equal(hasExternalDependency(prizeTie), false);
  assert.equal(hasAmbiguousWording(severalTie), false);
  assert.equal(
    hasExternalDependency(
      "A ticket wins only when the current prize pool is above 10 SOL.",
    ),
    true,
  );
  assert.equal(
    hasAmbiguousWording("A guess wins if some positions match the draw."),
    true,
  );
});

test("agent-authored tie phrasing and objective superlatives do not create ambiguity", () => {
  for (const text of [
    "The ticket with the highest score wins, with ties splitting the prize equally.",
    "Ties on the highest score result in an equal split of the prize.",
    "The lowest score wins, with ties sharing the pool equally.",
    "The closest range wins, and tickets that are equally close split it equally.",
  ]) {
    assert.equal(hasExternalDependency(text), false, text);
    assert.equal(hasAmbiguousWording(text), false, text);
  }
  assert.equal(
    hasExternalDependency(
      "The closest score wins, with ties splitting the prize equally, but only when the prize exceeds 10 SOL.",
    ),
    true,
  );

  for (const text of [
    "The ticket whose range is closest to the drawn range wins.",
    "The ticket with the nearest total to the drawn total wins.",
  ]) {
    assert.equal(hasAmbiguousWording(text), false, text);
  }
  assert.equal(
    hasAmbiguousWording("A guess wins if its total is close to the drawn total."),
    true,
  );
});

test("coverage recognizes whole-ticket scoring maps and units digits as modulo 10", () => {
  const tieredScore = ruleAstSchema.parse({
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      score: {
        kind: "reduce",
        op: "sum",
        of: {
          kind: "map",
          of: { kind: "source", source: "guess" },
          expr: {
            kind: "ite",
            if: {
              kind: "contains",
              array: { kind: "source", source: "draw" },
              value: { kind: "elem" },
            },
            then: { kind: "lit", value: 3 },
            else: { kind: "lit", value: 0 },
          },
        },
      },
    },
  });
  const scoreCoverage = analyzeInterpretationCoverage({
    ast: tieredScore,
    officialInterpretation: describeRuleAstForPlayers(tieredScore),
    text: "Each of your numbers that was drawn is worth 3 points, and the ticket with the highest total wins.",
  });
  assert.ok(scoreCoverage.requiredOperations.includes("all_guess"));
  assert.ok(!scoreCoverage.missingOperations.includes("all_guess"));

  const units = ruleAstSchema.parse({
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
            kind: "distinct",
            of: {
              kind: "digits",
              place: "units",
              of: { kind: "source", source: "guess" },
            },
          },
        },
        right: { kind: "lit", value: 2 },
      },
    },
  });
  const digitCoverage = analyzeInterpretationCoverage({
    ast: units,
    officialInterpretation: describeRuleAstForPlayers(units),
    text: "At least two distinct last digits (each value modulo 10) must appear in the guess.",
  });
  assert.ok(digitCoverage.requiredOperations.includes("mod"));
  assert.ok(!digitCoverage.missingOperations.includes("mod"));
});

test("independent behavioral review lets the server correct ranking arithmetic", async () => {
  const text = "The ticket with the highest sum of its guessed numbers wins.";
  const ast = ruleAstSchema.parse({
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "max",
      tieBreak: "share_pool",
      score: {
        kind: "reduce",
        op: "sum",
        of: { kind: "source", source: "guess" },
      },
    },
  });
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: 11 },
    {
      astProvider: async () => ({
        ast,
        consumedSpans: [{ text }],
        workedExamples: [
          {
            draw: [10, 20, 30, 40, 50, 60],
            guess: [1, 2, 3, 4, 5, 6],
            score: 999,
          },
          {
            draw: [11, 21, 31, 41, 51, 61],
            guess: [7, 8, 9, 10, 11, 12],
            score: -1,
          },
        ],
      }),
      astReviewer: async () => ast,
      requireProviderEvidence: true,
    },
  );

  assert.equal(result.decision, "VALID");
  assert.ok(!result.log.reasonCodes.includes("PROVIDER_EVIDENCE_UNVERIFIED"));
  const evidence = result.log.attemptDiagnostics[0]?.providerEvidence;
  assert.ok(
    evidence?.exampleResults.every((example) => example.status === "passed"),
  );
  assert.match(
    evidence?.exampleResults[0]?.detail ?? "",
    /corrected to the deterministic runtime score/iu,
  );
});

test("set-9 objective wording cannot be claimed by a partial deterministic shortcut", () => {
  const guardedTransform =
    "Double each of your numbers, but if doubling a number would take it past 100 then keep that number as it is. You win if at least three of the resulting numbers appear in the draw.";
  const guardedTransformParaphrase = guardedTransform.replace(
    "past 100",
    "above 100",
  );
  const penaltyRanking =
    "Line up your six numbers against the six drawn numbers from lowest to highest and add up the differences; the ticket with the smallest total wins. A ticket that holds any of the drawn numbers has 10 added to its total as a penalty, and tickets on the same total split it equally.";

  for (const text of [
    guardedTransform,
    guardedTransformParaphrase,
    penaltyRanking,
  ]) {
    const result = validateAndPrecompileRule({
      originalText: text,
      prompt: text,
      tokenCount: countWords(text),
    });
    assert.equal(result.artifact, null, text);
    assert.ok(result.log.reasonCodes.includes("UNSUPPORTED_RULE"), text);
    assert.ok(!result.log.reasonCodes.includes("SUPPORTED_RULE"), text);
  }

  assert.equal(hasExternalDependency(guardedTransform), false);
  assert.equal(
    hasExternalDependency(
      "A guess wins only if it would also have won in past rounds.",
    ),
    true,
  );
  assert.equal(hasAmbiguousWording("exactly as many multiples as the draw"), false);
  assert.equal(hasAmbiguousWording("a ticket with many multiples wins"), true);
});

test("set-9 coverage recognizes product reductions and guarded transformations", () => {
  const guardedProduct = ruleAstSchema.parse({
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
            kind: "filter",
            of: {
              kind: "map",
              of: { kind: "source", source: "guess" },
              expr: {
                kind: "ite",
                if: {
                  kind: "compare",
                  op: "lte",
                  left: {
                    kind: "arith",
                    op: "mul",
                    left: { kind: "elem" },
                    right: { kind: "lit", value: 2 },
                  },
                  right: { kind: "lit", value: 100 },
                },
                then: {
                  kind: "arith",
                  op: "mul",
                  left: { kind: "elem" },
                  right: { kind: "lit", value: 2 },
                },
                else: { kind: "elem" },
              },
            },
            where: {
              kind: "contains",
              array: { kind: "source", source: "draw" },
              value: { kind: "elem" },
            },
          },
        },
        right: { kind: "lit", value: 3 },
      },
    },
  });
  const guardedCoverage = analyzeInterpretationCoverage({
    ast: guardedProduct,
    officialInterpretation: describeRuleAstForPlayers(guardedProduct),
    text: "Double each number, but if doubling would exceed 100 then keep it; at least three resulting numbers must appear in the draw.",
  });
  for (const operation of [
    "conditional",
    "membership",
    "product",
  ] as const) {
    assert.ok(guardedCoverage.requiredOperations.includes(operation));
    assert.ok(!guardedCoverage.missingOperations.includes(operation));
  }

  const product = ruleAstSchema.parse({
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op: "gt",
        left: {
          kind: "reduce",
          op: "product",
          of: {
            kind: "slice",
            start: 0,
            end: 2,
            of: {
              kind: "sort",
              order: "asc",
              of: { kind: "source", source: "guess" },
            },
          },
        },
        right: {
          kind: "reduce",
          op: "max",
          of: { kind: "source", source: "draw" },
        },
      },
    },
  });
  const productCoverage = analyzeInterpretationCoverage({
    ast: product,
    officialInterpretation: describeRuleAstForPlayers(product),
    text: "The product of the two smallest guessed numbers is greater than the largest drawn number.",
  });
  assert.ok(productCoverage.requiredOperations.includes("product"));
  assert.ok(!productCoverage.missingOperations.includes("product"));
});

test("two compilers cannot certify the same dropped numeric clauses", async () => {
  const text =
    "A guess wins if the difference between its highest and lowest number is greater than the same difference for the drawn numbers, and at least two of its numbers are below 50 while at least two are above 50.";
  const truncated = ruleAstSchema.parse({
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "compare",
        op: "gt",
        left: {
          kind: "reduce",
          op: "range_span",
          of: { kind: "source", source: "guess" },
        },
        right: {
          kind: "reduce",
          op: "range_span",
          of: { kind: "source", source: "draw" },
        },
      },
    },
  });
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => ({
        ast: truncated,
        consumedSpans: [{ text }],
        workedExamples: [
          {
            draw: [10, 20, 30, 40, 50, 60],
            guess: [1, 2, 3, 98, 99, 100],
            outcome: "WIN",
          },
          {
            draw: [10, 20, 30, 40, 50, 60],
            guess: [10, 51, 52, 53, 54, 100],
            outcome: "WIN",
          },
        ],
      }),
      astReviewer: async () => truncated,
      requireProviderEvidence: true,
    },
  );

  assert.equal(result.decision, "INVALID");
  assert.equal(result.artifact, null);
  assert.ok(result.log.reasonCodes.includes("INTERPRETATION_MISMATCH"));
});

test("a source-incomplete reviewer cannot veto two corroborating provider programs", async () => {
  const text =
    "Line up the guess and draw from lowest to highest and add up the absolute differences; the smallest total wins. A ticket holding a drawn number receives a 10 point penalty.";
  const candidate = ruleAstSchema.parse({
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "min",
      tieBreak: "share_pool",
      score: {
        kind: "arith",
        op: "add",
        left: {
          kind: "reduce",
          op: "sum",
          of: {
            kind: "pairs_map",
            left: {
              kind: "sort",
              order: "asc",
              of: { kind: "source", source: "guess" },
            },
            right: {
              kind: "sort",
              order: "asc",
              of: { kind: "source", source: "draw" },
            },
            expr: {
              kind: "abs",
              of: {
                kind: "arith",
                op: "sub",
                left: { kind: "pair", side: "left" },
                right: { kind: "pair", side: "right" },
              },
            },
          },
        },
        right: {
          kind: "ite",
          if: {
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
          then: { kind: "lit", value: 10 },
          else: { kind: "lit", value: 0 },
        },
      },
    },
  });
  const incompleteReviewer = ruleAstSchema.parse({
    schemaVersion: 3,
    result: {
      type: "ranking",
      direction: "min",
      tieBreak: "share_pool",
      score: {
        kind: "reduce",
        op: "count",
        of: {
          kind: "intersection",
          left: { kind: "source", source: "guess" },
          right: { kind: "source", source: "draw" },
        },
      },
    },
  });
  let providerCalls = 0;
  const result = await compileRuleArtifact(
    { originalText: text, prompt: text, tokenCount: countWords(text) },
    {
      astProvider: async () => {
        providerCalls += 1;
        return {
          ast: candidate,
          consumedSpans: [{ text }],
          workedExamples: [
            {
              draw: [1, 2, 3, 4, 5, 6],
              guess: [1, 2, 3, 4, 5, 6],
              score: providerCalls === 1 ? 10 : 999,
            },
            {
              draw: [1, 2, 3, 4, 5, 6],
              guess: [7, 8, 9, 10, 11, 12],
              score: providerCalls === 1 ? 36 : -1,
            },
          ],
        };
      },
      astReviewer: async () => incompleteReviewer,
      requireProviderEvidence: true,
    },
  );

  assert.equal(result.decision, "VALID", JSON.stringify(result.log.reasonCodes));
  assert.deepEqual(result.artifact?.ast, candidate);
  assert.equal(providerCalls, 2);
  const correctedEvidence = result.log.attemptDiagnostics[1]?.providerEvidence;
  assert.ok(
    correctedEvidence?.exampleResults.every(
      (example) => example.status === "passed",
    ),
  );
});

test("nested cross-source distance ASTs render without binder implementation prose", () => {
  const ast = ruleAstSchema.parse({
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "forall",
        of: { kind: "source", source: "draw" },
        where: {
          kind: "exists",
          of: { kind: "source", source: "guess" },
          where: {
            kind: "compare",
            op: "lte",
            left: {
              kind: "abs",
              of: {
                kind: "arith",
                op: "sub",
                left: { kind: "elem" },
                right: { kind: "elem", up: 1 },
              },
            },
            right: { kind: "lit", value: 3 },
          },
        },
      },
    },
  });
  const description = describeRuleAstForPlayers(ast);
  assert.match(
    description,
    /every drawn number is within 3 of at least one guessed number/iu,
  );
  assert.doesNotMatch(description, /level\(s\)|distance from zero/iu);
});
