import assert from "node:assert/strict";
import { test } from "node:test";
import {
  ruleAstSchema,
  type JevSemanticReviewRequest,
} from "@tyche/rule-compiler";
import {
  jevCohort,
  resolveJevReviewConfig,
  reviewInterpretationWithJev,
  reviewRuleAstWithJev,
  type JevReviewConfig,
} from "./jev.js";

const request: JevSemanticReviewRequest = {
  ast: ruleAstSchema.parse({
    schemaVersion: 1,
    node: { kind: "match_count_at_least", value: 3 },
  }),
  astDescription: "Win with at least three matches.",
  candidateArtifactHash: "b".repeat(64),
  facets: ["threshold"],
  normalizedText: "Win with at least three matches.",
  officialInterpretation: "Win with at least three matches.",
  originalText: "Win with at least three matches.",
};

const config: JevReviewConfig = {
  apiKey: "test-key",
  astCoverageThreshold: 0.7,
  canaryPercent: 5,
  endpoint: "https://example.test/decisions",
  facetThreshold: 0.9,
  mode: "active",
  calibration: {
    model: "typesafe/jev-1.13-20260917",
    evidenceHash: "c".repeat(64),
    incorrectHoldoutAsts: 360,
    falseAccepts: 0,
    shadowPreflights: 1000,
    audited: true,
    allMetricGatesPassed: true,
    cohorts: ["en:simple"],
    thresholds: {
      probability: 0.7,
      confidence: 0.7,
      support: 0.7,
      coverage: 0.7,
      facet: 0.9,
    },
  },
  model: "typesafe/jev-1.13-20260917",
  sourceSupportThreshold: 0.7,
  structuralConfidenceThreshold: 0.7,
  structuralProbabilityThreshold: 0.7,
  timeoutMs: 100,
};

function response(answers: Record<string, unknown>, usage: unknown = {}) {
  return new Response(
    JSON.stringify({
      answers,
      model: "typesafe/jev-1.13-20260917",
      usage,
    }),
    { headers: { "content-type": "application/json" }, status: 200 },
  );
}

function answers(args: {
  confidence: number;
  coverage: number;
  facet: number;
  label: "maybe" | "no" | "yes";
  probability: number;
  support: number;
}) {
  return {
    ast_covers_source: { noul: args.coverage },
    facet_threshold: { noul: args.facet },
    source_supports_ast: { noul: args.support },
    structural: {
      choice: args.label,
      confidence: args.confidence,
      probabilities: {
        maybe:
          args.label === "maybe"
            ? args.probability
            : (1 - args.probability) / 2,
        no: args.label === "no" ? args.probability : (1 - args.probability) / 2,
        yes:
          args.label === "yes" ? args.probability : (1 - args.probability) / 2,
      },
    },
  };
}

test("JEV config is off by default and pins the validated model", () => {
  const resolved = resolveJevReviewConfig({});
  assert.equal(resolved.mode, "off");
  assert.equal(resolved.model, "typesafe/jev-1.13-20260917");
  assert.equal(resolved.canaryPercent, 5);
  assert.equal(resolved.facetThreshold, 0.9);
});

test("interpretation review records support, question materiality and policy scores only", async () => {
  const advisory = await reviewInterpretationWithJev(
    {
      addedOperationalClauses: [],
      clarificationQuestions: ["What match threshold should apply?"],
      normalizedText: "Win with enough matches.",
      officialInterpretation: "The match threshold is not specified.",
      originalText: "Win with enough matches.",
    },
    config,
    undefined,
    (async () =>
      response({
        assumptions_supported: { noul: 1 },
        interpretation_supported: { noul: 0.94 },
        question_0: { noul: 0.97 },
        policy_boolean_scope: { noul: 0.02 },
        policy_eligibility: { noul: 0.1 },
        policy_external_state: { noul: 0.01 },
        policy_ordering_or_source: { noul: 0.05 },
        policy_randomness: { noul: 0.01 },
        policy_threshold: { noul: 0.96 },
        policy_tie_handling: { noul: 0.4 },
      })) as typeof fetch,
  );

  assert.equal(advisory.status, "RECORDED");
  assert.equal(advisory.clarificationMateriality["0"], 0.97);
  assert.equal(advisory.policyCategories.threshold, 0.96);
  assert.match(advisory.attestationHash, /^[a-f0-9]{64}$/u);
});

test("JEV returns PASS with provider cost, resolved model and an attestation", async () => {
  let sent: Record<string, unknown> | null = null;
  const result = await reviewRuleAstWithJev(request, config, undefined, (async (
    _url,
    init,
  ) => {
    sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return response(
      answers({
        confidence: 0.91,
        coverage: 0.93,
        facet: 0.95,
        label: "yes",
        probability: 0.94,
        support: 0.92,
      }),
      { cost: 0.00004, input_tokens: 100, output_tokens: 10 },
    );
  }) as typeof fetch);

  assert.equal(result.status, "PASS");
  assert.equal(result.costUsd, 0.00004);
  assert.equal(result.candidateArtifactHash, request.candidateArtifactHash);
  assert.match(result.attestationHash, /^[a-f0-9]{64}$/u);
  assert.equal((sent as Record<string, unknown> | null)?.model, config.model);
});

test("JEV separates confident mismatch from uncertain abstention", async () => {
  const mismatch = await reviewRuleAstWithJev(
    request,
    config,
    undefined,
    (async () =>
      response(
        answers({
          confidence: 0.95,
          coverage: 0.05,
          facet: 0.05,
          label: "no",
          probability: 0.96,
          support: 0.05,
        }),
      )) as typeof fetch,
  );
  const abstain = await reviewRuleAstWithJev(
    request,
    config,
    undefined,
    (async () =>
      response(
        answers({
          confidence: 0.2,
          coverage: 0.6,
          facet: 0.8,
          label: "maybe",
          probability: 0.4,
          support: 0.6,
        }),
      )) as typeof fetch,
  );

  assert.equal(mismatch.status, "MISMATCH");
  assert.equal(abstain.status, "ABSTAIN");
  assert.equal(abstain.costUsd, null);
});

test("JEV fails closed on missing configuration and malformed responses", async () => {
  const missingKey = await reviewRuleAstWithJev(request, {
    ...config,
    apiKey: "",
  });
  const malformed = await reviewRuleAstWithJev(
    request,
    config,
    undefined,
    (async () => response({ structural: { choice: "yes" } })) as typeof fetch,
  );

  assert.equal(missingKey.status, "ERROR");
  assert.equal(missingKey.errorCode, "NOT_CONFIGURED");
  assert.equal(malformed.status, "ERROR");
  assert.equal(malformed.errorCode, "MALFORMED_RESPONSE");
});

test("JEV timeout is an ERROR and never a PASS", async () => {
  const result = await reviewRuleAstWithJev(
    request,
    { ...config, timeoutMs: 5 },
    undefined,
    ((_url: Parameters<typeof fetch>[0], init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener(
          "abort",
          () => reject(init.signal?.reason ?? new Error("aborted")),
          { once: true },
        );
      })) as typeof fetch,
  );

  assert.equal(result.status, "ERROR");
  assert.equal(result.errorCode, "TIMEOUT");
});

test("active mode abstains without calibration and on resolved-model drift", async () => {
  const uncalibrated = { ...config };
  delete uncalibrated.calibration;
  const successful = () =>
    response(
      answers({
        confidence: 0.95,
        coverage: 0.95,
        facet: 0.98,
        label: "yes",
        probability: 0.97,
        support: 0.96,
      }),
    );
  const missing = await reviewRuleAstWithJev(
    request,
    uncalibrated,
    undefined,
    (async () => successful()) as typeof fetch,
  );
  assert.equal(missing.status, "ABSTAIN");
  assert.equal(missing.errorCode, "UNCALIBRATED_COHORT");
  const drift = await reviewRuleAstWithJev(
    request,
    { ...config, model: "typesafe/jev-new" },
    undefined,
    (async () => successful()) as typeof fetch,
  );
  assert.equal(drift.status, "ABSTAIN");
  assert.equal(drift.resolvedModel, "typesafe/jev-1.13-20260917");
});

test("invalid deployment settings fail explicitly", () => {
  assert.throws(
    () => resolveJevReviewConfig({ JEV_REVIEW_MODE: "actve" }),
    /JEV_MODE_INVALID/u,
  );
  assert.throws(
    () => resolveJevReviewConfig({ JEV_FACET_THRESHOLD: "NaN" }),
    /JEV_THRESHOLD_INVALID/u,
  );
  assert.throws(
    () => resolveJevReviewConfig({ JEV_CALIBRATION_JSON: "{}" }),
    /JEV_CALIBRATION_INVALID/u,
  );
});

/** Six `kind` nodes: two of these make the cohort's node count exceed simple. */
function MATCH_COUNT_AT_LEAST(value: number) {
  return {
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
    right: { kind: "lit", value },
  };
}

test("the cohort separates language and complexity, and never guesses", () => {
  const portuguese = {
    ...request,
    originalText:
      "O jogador ganha se pelo menos três dos seus números forem sorteados.",
  };
  const english = {
    ...request,
    originalText: "A guess wins if at least three of its numbers are drawn.",
  };
  assert.equal(jevCohort(english), "en:simple");
  assert.equal(jevCohort(portuguese), "pt:simple");

  // Coverage must be comparable across languages, so a text that reads as both
  // or as neither is not silently filed under one of them. `unknown:*` never
  // matches a calibrated cohort, so those rules keep the LLM reviewer.
  assert.match(
    jevCohort({
      ...request,
      originalText: "A guess wins if o jogador ganha with numbers drawn.",
    }),
    /^unknown:/u,
  );
  assert.match(jevCohort({ ...request, originalText: "1 + 1" }), /^unknown:/u);

  // Complexity is counted on the AST, not on how long the sentence is.
  assert.equal(
    jevCohort({
      ...english,
      ast: ruleAstSchema.parse({
        schemaVersion: 3,
        result: {
          type: "predicate",
          predicate: {
            kind: "and",
            clauses: [MATCH_COUNT_AT_LEAST(3), MATCH_COUNT_AT_LEAST(4)],
          },
        },
      }),
    }),
    "en:medium",
  );
});

test("a calibrated cohort mismatch abstains instead of using default thresholds", async () => {
  const confident = () =>
    response(
      answers({
        confidence: 0.95,
        coverage: 0.95,
        facet: 0.98,
        label: "yes",
        probability: 0.97,
        support: 0.96,
      }),
    );
  // `config` is calibrated for `en:simple` only. The same confident answer on a
  // Portuguese rule may not be released on English evidence.
  const uncalibratedLanguage = await reviewRuleAstWithJev(
    {
      ...request,
      originalText:
        "O jogador ganha se pelo menos três dos seus números forem sorteados.",
    },
    config,
    undefined,
    (async () => confident()) as typeof fetch,
  );
  assert.equal(uncalibratedLanguage.status, "ABSTAIN");
  assert.equal(uncalibratedLanguage.errorCode, "UNCALIBRATED_COHORT");
  assert.equal(uncalibratedLanguage.cohort, "pt:simple");

  // Shadow mode is a measurement, not a release, so it scores every cohort with
  // the configured thresholds and records what a calibrated run would have done.
  const shadow = await reviewRuleAstWithJev(
    { ...request, originalText: "O jogador ganha com três acertos." },
    { ...config, mode: "shadow" },
    undefined,
    (async () => confident()) as typeof fetch,
  );
  assert.equal(shadow.status, "PASS");
});

test("provider unavailability and an unreported cost never fail open", async () => {
  const unavailable = await reviewRuleAstWithJev(
    request,
    config,
    undefined,
    (async () =>
      new Response("upstream is down", { status: 503 })) as typeof fetch,
  );
  assert.equal(unavailable.status, "ERROR");
  assert.equal(unavailable.errorCode, "HTTP_503");
  assert.equal(unavailable.costUsd, null);

  // A provider that reports no cost leaves the field unknown. Treating an
  // unreported charge as zero would understate the rollout's cost gates.
  const uncosted = await reviewRuleAstWithJev(
    request,
    config,
    undefined,
    (async () =>
      new Response(
        JSON.stringify({
          answers: answers({
            confidence: 0.95,
            coverage: 0.95,
            facet: 0.98,
            label: "yes",
            probability: 0.97,
            support: 0.96,
          }),
          model: "typesafe/jev-1.13-20260917",
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      )) as typeof fetch,
  );
  assert.equal(uncosted.status, "PASS");
  assert.equal(uncosted.costUsd, null);

  // A response missing the resolved version cannot be attributed to the pinned
  // model, so it is an error rather than a PASS credited to the wrong build.
  const unversioned = await reviewRuleAstWithJev(
    request,
    config,
    undefined,
    (async () =>
      new Response(
        JSON.stringify({
          answers: answers({
            confidence: 0.95,
            coverage: 0.95,
            facet: 0.98,
            label: "yes",
            probability: 0.97,
            support: 0.96,
          }),
        }),
        { headers: { "content-type": "application/json" }, status: 200 },
      )) as typeof fetch,
  );
  assert.equal(unversioned.status, "ERROR");
  assert.equal(unversioned.errorCode, "MISSING_MODEL_VERSION");
});
