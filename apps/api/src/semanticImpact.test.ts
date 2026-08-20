import assert from "node:assert/strict";
import { test } from "node:test";
import {
  validateAndPrecompileRule,
  type RuleAst,
} from "@tyche/rule-compiler";
import { analyzeRuleSemanticImpact } from "./semanticImpact.js";

const drawOnlyRangeAst = {
  schemaVersion: 3,
  result: {
    type: "predicate",
    predicate: {
      kind: "forall",
      of: { kind: "source", source: "draw" },
      where: {
        kind: "and",
        clauses: [
          {
            kind: "compare",
            left: { kind: "elem" },
            op: "gte",
            right: { kind: "lit", value: 9 },
          },
          {
            kind: "compare",
            left: { kind: "elem" },
            op: "lte",
            right: { kind: "lit", value: 40 },
          },
        ],
      },
    },
  },
} satisfies RuleAst;

const guessAndDrawRangeAst = {
  schemaVersion: 3,
  result: {
    type: "predicate",
    predicate: {
      kind: "and",
      clauses: [
        {
          kind: "forall",
          of: { kind: "source", source: "guess" },
          where: {
            kind: "and",
            clauses: [
              {
                kind: "compare",
                left: { kind: "elem" },
                op: "gte",
                right: { kind: "lit", value: 9 },
              },
              {
                kind: "compare",
                left: { kind: "elem" },
                op: "lte",
                right: { kind: "lit", value: 40 },
              },
            ],
          },
        },
        {
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
          right: { kind: "lit", value: 2 },
        },
      ],
    },
  },
} satisfies RuleAst;

test("stress prompt 1: informal Portuguese draw-only range requires scope and endpoint confirmation", () => {
  const review = analyzeRuleSemanticImpact({
    ast: drawOnlyRangeAst,
    normalizedText:
      "A guess wins if all official draw numbers are between 9 and 40.",
    officialInterpretation:
      "Check whether all six official draw numbers fall within the range from 9 to 40.",
    sourceText:
      "eu ganho se todos os número do sorteio forem entre 9 e 40??? é isso aí msm",
  });

  assert.equal(review.confirmationRequired, true);
  assert.equal(review.impact.sharedOutcome, true);
  assert.equal(review.impact.rangeBoundsAmbiguous, true);
  assert.equal(review.refinementQuestions.length, 2);
  assert.equal(review.suggestedRewrites.length, 2);
  assert.match(review.suggestedRewrites[0] ?? "", /inclusive/i);
  assert.match(review.suggestedRewrites[1] ?? "", /strictly greater/i);
  assert.match(review.officialInterpretation, /every eligible guess wins or loses together/i);
});

test("stress prompt 2: explicit draw-only and inclusive intent passes while retaining the shared-outcome warning", () => {
  const review = analyzeRuleSemanticImpact({
    ast: drawOnlyRangeAst,
    normalizedText:
      "A guess wins if all six official draw numbers are between 9 and 40, inclusive; the player's guess is ignored.",
    officialInterpretation:
      "Check whether every official draw number is at least 9 and at most 40.",
    sourceText:
      "NEM olha meu jogo!!! usa SÓ os 6 sorteados: todos de 09 até 40, INCLUINDO AS PONTAS; é isso mesmo, independente do palpite",
  });

  assert.equal(review.confirmationRequired, false);
  assert.equal(review.impact.sharedOutcome, true);
  assert.equal(review.impact.rangeBoundsAmbiguous, false);
  assert.equal(review.impact.triviallyAlwaysTrue, false);
  assert.deepEqual(review.refinementQuestions, []);
  assert.match(review.officialInterpretation, /every eligible guess wins or loses together/i);
});

test("rejects a full-domain draw range as always true and offers executable replacements", () => {
  const fullDomainAst = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "forall",
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
              right: { kind: "lit", value: 100 },
            },
          ],
        },
      },
    },
  } satisfies RuleAst;
  const review = analyzeRuleSemanticImpact({
    ast: fullDomainAst,
    normalizedText:
      "A guess wins if all six official draw numbers are between 1 and 100, inclusive.",
    officialInterpretation:
      "Check whether all official draw numbers are in the inclusive range from 1 to 100.",
    sourceText:
      "A guess wins if all six official draw numbers are between 1 and 100, inclusive.",
  });

  assert.equal(review.impact.triviallyAlwaysTrue, true);
  assert.equal(review.confirmationRequired, false);
  assert.deepEqual(review.refinementQuestions, []);
  assert.match(review.dealerMessage ?? "", /cannot pass preflight/i);
  assert.match(review.reasonSummary ?? "", /always true/i);
  assert.equal(review.suggestedRewrites.length, 2);
  for (const rewrite of review.suggestedRewrites) {
    assert.equal(
      validateAndPrecompileRule({
        prompt: rewrite,
        tokenCount: rewrite.split(/\s+/u).length,
      }).decision,
      "VALID",
      rewrite,
    );
  }
});

test("stress prompt 3: explicit inclusive compound rule using guess and draw needs no semantic confirmation", () => {
  const review = analyzeRuleSemanticImpact({
    ast: guessAndDrawRangeAst,
    normalizedText:
      "A guess wins if all six guessed numbers are between 9 and 40, inclusive, and at least two appear in the draw.",
    officialInterpretation:
      "Check the inclusive guessed-number range and then count at least two matches with the official draw.",
    sourceText:
      "Meu PALPITE ganha se TODOS meus 6 números estiverem de 9 até 40, INCLUINDO 9 e 40, E pelo menos 2 deles saírem no sorteio — não troque o E por OU!!!",
  });

  assert.equal(review.confirmationRequired, false);
  assert.equal(review.impact.usesGuess, true);
  assert.equal(review.impact.usesDraw, true);
  assert.equal(review.impact.sharedOutcome, false);
  assert.equal(review.impact.drawIndependent, false);
  assert.equal(review.impact.rangeBoundsAmbiguous, false);
});

test("English stress prompt 1: noisy draw-only range requires scope and endpoint confirmation", () => {
  const review = analyzeRuleSemanticImpact({
    ast: drawOnlyRangeAst,
    normalizedText:
      "A guess wins if all official draw numbers are between 9 and 40.",
    officialInterpretation:
      "Check whether all six official draw numbers fall within the range from 9 to 40.",
    sourceText:
      "i WIN if ALL the official draw nums r between 9 and 40?!?! just make it work",
  });

  assert.equal(review.confirmationRequired, true);
  assert.equal(review.impact.sharedOutcome, true);
  assert.equal(review.impact.rangeBoundsAmbiguous, true);
  assert.equal(review.refinementQuestions.length, 2);
  assert.equal(review.suggestedRewrites.length, 2);
  assert.match(review.suggestedRewrites[0] ?? "", /inclusive/i);
  assert.match(review.suggestedRewrites[1] ?? "", /strictly greater/i);
});

test("English stress prompt 2: explicit draw-only inclusive intent passes with disclosure", () => {
  const review = analyzeRuleSemanticImpact({
    ast: drawOnlyRangeAst,
    normalizedText:
      "A guess wins if all six official draw numbers are between 9 and 40, inclusive; the player's guess is ignored.",
    officialInterpretation:
      "Check whether every official draw number is at least 9 and at most 40.",
    sourceText:
      "IGNORE my ticket completely!!! use ONLY the 6 official drawn numbers, from 09 through 40 INCLUDING both endpoints; yes, every ticket gets the same result",
  });

  assert.equal(review.confirmationRequired, false);
  assert.equal(review.impact.sharedOutcome, true);
  assert.equal(review.impact.rangeBoundsAmbiguous, false);
  assert.deepEqual(review.refinementQuestions, []);
  assert.match(
    review.officialInterpretation,
    /every eligible guess wins or loses together/i,
  );
});

test("English stress prompt 3: emphatic compound rule using guess and draw needs no confirmation", () => {
  const review = analyzeRuleSemanticImpact({
    ast: guessAndDrawRangeAst,
    normalizedText:
      "A guess wins if all six guessed numbers are between 9 and 40, inclusive, and at least two appear in the draw.",
    officialInterpretation:
      "Check the inclusive guessed-number range and then count at least two matches with the official draw.",
    sourceText:
      "My TICKET wins only if ALL 6 picks are from 9 to 40, INCLUDING 9 AND 40, AND at least 2 of them appear in the official draw — keep the AND, do NOT turn it into OR!!!",
  });

  assert.equal(review.confirmationRequired, false);
  assert.equal(review.impact.usesGuess, true);
  assert.equal(review.impact.usesDraw, true);
  assert.equal(review.impact.sharedOutcome, false);
  assert.equal(review.impact.drawIndependent, false);
  assert.equal(review.impact.rangeBoundsAmbiguous, false);
});

test("subject-first wording explicitly confirms that an input is irrelevant", () => {
  const drawOnly = analyzeRuleSemanticImpact({
    ast: drawOnlyRangeAst,
    normalizedText: "A guess wins if all six drawn numbers are below 40.",
    officialInterpretation: "Every drawn number must be below 40.",
    sourceText:
      "A guess wins if all six drawn numbers are below 40. The player's guessed numbers do not affect the result.",
  });
  assert.equal(drawOnly.confirmationRequired, false);

  const guessOnlyAst = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "contains",
        array: { kind: "source", source: "guess" },
        value: { kind: "lit", value: 77 },
      },
    },
  } satisfies RuleAst;
  const guessOnly = analyzeRuleSemanticImpact({
    ast: guessOnlyAst,
    normalizedText: "A guess wins if it contains 77.",
    officialInterpretation: "The guess must contain 77.",
    sourceText:
      "A guess wins if it contains 77. The official draw does not affect the result.",
  });
  assert.equal(guessOnly.confirmationRequired, false);
});

test("position-specific range confirmation preserves every position and bound", () => {
  const sourceText =
    "quero ganhar se o primeiro n\u00famero estiver entre 1 e 100, o segundo entre 2 e 99 e o terceiro entre 3 e 98";
  const compilation = validateAndPrecompileRule({
    originalText: sourceText,
    prompt: sourceText,
    tokenCount: 25,
  });
  assert.equal(compilation.decision, "VALID");

  const review = analyzeRuleSemanticImpact({
    ast: compilation.artifact!.ast,
    normalizedText: compilation.artifact!.normalizedText,
    officialInterpretation: compilation.artifact!.officialInterpretation,
    sourceText,
  });

  assert.equal(review.confirmationRequired, true);
  assert.equal(review.suggestedRewrites.length, 1);
  const rewrite = review.suggestedRewrites[0] ?? "";
  assert.match(rewrite, /1st number is between 1 and 100/i);
  assert.match(rewrite, /2nd number is between 2 and 99/i);
  assert.match(rewrite, /3rd number is between 3 and 98/i);
  assert.match(rewrite, /official draw does not affect the result/i);
  assert.doesNotMatch(rewrite, /all six guessed numbers are between 1 and 100/i);
});

test("a single-range rule with other conditions keeps them in the offered rewrite", () => {
  // Regression: "first number is 10, second is 12, the other four are any
  // values from 1 to 100" carries exactly ONE textual range, so the synthesized
  // "all six guessed numbers are between 1 and 100" sentence was offered as an
  // intent-preserving rewrite. Selecting it replaced the player's rule with an
  // always-true one, which the next preflight rejected as DIFFICULTY_ALWAYS_TRUE
  // — a terminal reason that also cannot be patched, so the rule the player
  // actually wrote became unreachable.
  const positionalPlusRangeAst = {
    schemaVersion: 3,
    result: {
      type: "predicate",
      predicate: {
        kind: "and",
        clauses: [
          {
            kind: "compare",
            left: {
              index: 0,
              kind: "at",
              of: { kind: "source", source: "guess" },
            },
            op: "eq",
            right: { kind: "lit", value: 10 },
          },
          {
            kind: "compare",
            left: {
              index: 1,
              kind: "at",
              of: { kind: "source", source: "guess" },
            },
            op: "eq",
            right: { kind: "lit", value: 12 },
          },
          {
            kind: "forall",
            of: { kind: "source", source: "guess" },
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
                  right: { kind: "lit", value: 100 },
                },
              ],
            },
          },
        ],
      },
    },
  } as unknown as RuleAst;

  const review = analyzeRuleSemanticImpact({
    ast: positionalPlusRangeAst,
    normalizedText:
      "A guess wins if the first number is 10, the second is 12, and the other four are any distinct numbers from 1 to 100 except 10 and 12.",
    officialInterpretation:
      "Check whether the first guessed number is 10, the second guessed number is 12, and the remaining four guessed numbers are distinct values from 1 to 100 other than 10 and 12.",
    sourceText:
      "A guess wins when its first number is 10, its second number is 12, and the remaining four numbers are any unique values from 1 to 100 not equal to 10 or 12.",
  });

  assert.equal(review.confirmationRequired, true);
  assert.equal(review.impact.drawIndependent, true);
  assert.equal(review.impact.triviallyAlwaysTrue, false);
  assert.equal(review.suggestedRewrites.length, 1);
  const rewrite = review.suggestedRewrites[0] ?? "";
  assert.match(rewrite, /\b10\b/);
  assert.match(rewrite, /\b12\b/);
  assert.match(rewrite, /official draw does not affect the result/i);
  assert.doesNotMatch(
    rewrite,
    /all six guessed numbers are between 1 and 100/i,
  );
});

test("a rule that is only a whole-source range still gets the compact range rewrite", () => {
  // The compact template stays available for the rule it is actually true for,
  // so tightening the guard above does not cost the simple case its two
  // endpoint-disambiguating options.
  const review = analyzeRuleSemanticImpact({
    ast: drawOnlyRangeAst,
    normalizedText:
      "A guess wins if all official draw numbers are between 9 and 40.",
    officialInterpretation:
      "Check whether all six official draw numbers fall within the range from 9 to 40.",
    sourceText:
      "A guess wins if all official draw numbers are between 9 and 40.",
  });

  assert.equal(review.suggestedRewrites.length, 2);
  assert.match(
    review.suggestedRewrites[0] ?? "",
    /all six official draw numbers are between 9 and 40, inclusive/i,
  );
});
