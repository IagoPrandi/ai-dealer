# Jev-guarded single compiler — rollout runbook

Operational reference for the typed semantic reviewer specified in PRD §7.3.2.
It covers the configuration surface, the calibration evidence an operator must
approve, the release gates, and the four rollout phases. The measurements this
plan rests on are in [the experiment report](jev-rule-pipeline-experiment.md);
the tests that keep those measurements honest are in
`apps/api/src/jevEvidence.test.ts`.

**Default state is `off`.** Nothing here is enabled by shipping the code.

## What the reviewer is allowed to do

It may replace the routine `review_rule_ast` LLM call for one candidate AST.

It may not decide `WIN`/`LOSE`, take part in settlement, authorize a payment or
claim, freeze an artifact, submit a proposal, or remove, answer, or reword a
clarification question. A high score is never player consent. These limits are
structural, not configured: the review request carries no guess, no draw, and no
ticket (`packages/rule-compiler/src/index.test.ts`, "the JEV request carries no
guess, draw, or settlement input"), and every deterministic gate still runs after
a `PASS` ("a JEV PASS cannot authorize an artifact a deterministic gate
rejects").

## Configuration

All variables are read by `resolveJevReviewConfig` in `apps/api/src/jev.ts`. An
invalid value throws at resolution rather than degrading to a default.

| Variable                               | Default                      | Meaning                                                                               |
| -------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- |
| `JEV_REVIEW_MODE`                      | `off`                        | `off`, `shadow`, `gated`, `active`.                                                   |
| `JEV_CALIBRATION_JSON`                 | empty                        | Operator-approved evidence. Empty forces `ABSTAIN` in `gated`/`active`.               |
| `JEV_MODEL`                            | `typesafe/jev-1.13-20260917` | Pinned resolved version. A `latest` alias is rejected in calibration.                 |
| `JEV_DECISIONS_ENDPOINT`               | OpenRouter Decisions         | Typed-decision endpoint.                                                              |
| `JEV_API_KEY`                          | empty                        | Falls back to `API_KEY_OPENROUTER`.                                                   |
| `JEV_TIMEOUT_MS`                       | `30000`                      | A timeout is an `ERROR`, never a `PASS`.                                              |
| `JEV_CANARY_PERCENT`                   | `5`                          | `gated` cohort size, hashed from the rule id so a rule keeps its route.               |
| `JEV_STRUCTURAL_PROBABILITY_THRESHOLD` | `0.70`                       | Shadow-mode gate, reproducing the experiment.                                         |
| `JEV_STRUCTURAL_CONFIDENCE_THRESHOLD`  | `0.70`                       | Shadow-mode gate.                                                                     |
| `JEV_SOURCE_SUPPORT_THRESHOLD`         | `0.70`                       | Is every AST condition supported by the source?                                       |
| `JEV_AST_COVERAGE_THRESHOLD`           | `0.70`                       | Does the AST implement every stated condition?                                        |
| `JEV_FACET_THRESHOLD`                  | `0.90`                       | Per-clause gate: eligibility, score, tie, Boolean, order, source, threshold, binders. |

The threshold variables are the **shadow-mode** values taken from the experiment.
They are not release thresholds. In `gated` and `active` the thresholds come from
the approved calibration evidence, per cohort, and the environment values are
ignored.

### Calibration evidence

`JEV_CALIBRATION_JSON` is rejected unless every field below holds. A rejected or
absent value makes `gated` and `active` abstain to the LLM reviewer, which is the
intended failure mode.

```json
{
  "model": "typesafe/jev-1.13-20260917",
  "evidenceHash": "<sha256 of the holdout report>",
  "incorrectHoldoutAsts": 360,
  "falseAccepts": 0,
  "shadowPreflights": 1000,
  "audited": true,
  "allMetricGatesPassed": true,
  "cohorts": ["en:simple", "en:medium", "pt:simple"],
  "thresholds": {
    "probability": 0.7,
    "confidence": 0.7,
    "support": 0.7,
    "coverage": 0.7,
    "facet": 0.9
  }
}
```

- `model` must be a pinned version and must equal both `JEV_MODEL` and the
  version the provider reports on each call. Any drift abstains.
- `cohorts` are `<language>:<complexity>` keys produced by `jevCohort`. Language
  is `en`, `pt`, or `unknown`; a text that reads as both languages or neither is
  `unknown` and never matches a calibrated cohort. Complexity is counted on the
  AST, not on sentence length.
- Only cohorts listed here are released. Everything else keeps the LLM reviewer.

## Release gates

`summarizeJevHoldout` in `apps/api/src/jevMetrics.ts` computes every gate from the
raw judgments. Run it with:

```powershell
node --import tsx apps/api/scripts/jev-release-report.mts <judgments.json>
```

It exits non-zero unless all gates pass. Three repetitions of the same candidate
count as one independent sample; a proposal that appears in both splits is an
error, not a warning.

### Blind corpus

The corpus is generated and validated by `apps/api/src/jevCorpus.ts`:

```powershell
node --import tsx apps/api/scripts/jev-build-corpus.mts
```

It carries **100 executable proposals** (50 pt / 50 en; 34 simple, 33 medium, 33
complex), 30 ambiguous and 30 prohibited. Each executable rule contributes six
behaviorally distinct semantic mutations, one serializer-divergence candidate,
and — where one exists — a behaviorally equivalent alternative.

The original plan called for 300 executable proposals with two mutations each.
100 × 6 produces the same 600 incorrect ASTs and therefore the same holdout
sample; what it removes is the authoring of 200 further proposals, not the
statistical power. That matters because the `360` in the accuracy gate is not a
round number: with `n` independent incorrect candidates and zero false accepts,
the one-sided 95% bound is `1 − 0.05^(1/n)`, which only drops below 1% at
**n ≥ 299**. A corpus of 100 rules with two mutations each would leave 120 in the
holdout and a 2.47% bound.

Every label is proven, not asserted. Each proposal gets 204 scenarios (4 curated
plus 200 deterministic, from a seeded PRNG so a rebuild is byte-identical). A
mutation is kept only if it changes the outcome on at least one scenario; an
"equivalent" alternative only if it changes none. The build throws rather than
emit a corpus that cannot prove this, and also rejects a rule that wins every
scenario or none, since a saturated rule cannot separate a correct AST from a
mutated one.

Half the scenarios force overlap between the ticket and the draw, and the
competing tickets in a ranking scenario do too. Uniform random tickets almost
never share a number, so an unforced corpus would make every match-count rule a
certain loss and measure nothing.

Splits are assigned by a stable hash of the proposal id, and a proposal can never
appear in both.

**What this corpus does not test.** The executable proposals are templated: the
wording and the reference AST are two renderings of one parameter set. They
measure whether the reviewer catches semantic defects across many rule shapes.
They do not measure messy, contradictory or adversarial player wording — that
stays the job of the ambiguous and prohibited sets, and of shadow traffic.

### Reviewer run

```powershell
node --import tsx apps/api/scripts/jev-run-reviewer-benchmark.mts --concurrency 8
```

This judges every candidate three times with the real typed reviewer in `shadow`
mode and writes `docs/jev-reviewer-benchmark-judgments.json` and
`-report.json`. It exercises the reviewer, not the pipeline, so it answers the
accuracy, coverage, language, stability and latency gates and **cannot** answer
cost, response time, questions, final artifacts or reviewer usage. The report
names those under `gatesNotMeasured`; a release still needs
`summarizeJevHoldout` over a full two-sided pipeline run.

### Gates

| Dimension      | Gate                                                                                                       |
| -------------- | ---------------------------------------------------------------------------------------------------------- |
| Accuracy       | Zero automatic false accepts over ≥360 incorrect holdout ASTs; one-sided 95% upper bound below 1%.         |
| Coverage       | ≥75% of correct ASTs skip the LLM reviewer; ≥60% on complex rules.                                         |
| Final pipeline | No semantically incorrect artifact accepted; 204 equivalent scenarios for every released artifact.         |
| Language       | Coverage gap between pt and en ≤5 points, with no difference in false accepts.                             |
| Questions      | 100% of material ambiguities produce a question; unnecessary questions ≤15%.                               |
| Stability      | Same route in ≥98% of the three repetitions, or mandatory fallback.                                        |
| Jev latency    | p50 ≤500 ms, p95 ≤1 s, availability ≥99.5%.                                                                |
| Response time  | Clear rules: ≥25% reduction in p50 and p95 from HTTP ingress to terminal event; fallback adds ≤1 s of p95. |
| Cost           | Clear accepted rules ≤75% of baseline; overall ≤85% of baseline.                                           |
| Reviewer usage | LLM reviewer on ≤25% of clear rules after activation.                                                      |

Keep the four measurement families separate and never substitute one for another:
**response time** is HTTP ingress through terminal event including queues and
retries; **latency** is per provider call; **cost** is per call, per rule, per
`VALID`/`CLARIFY`/`INVALID` outcome, and per valid artifact; **accuracy** is
precision, recall, false accept, false block, abstention, coverage, and
behavioral equivalence.

## Offline phase 1 result — FAILED (2026-09-21)

First run of the reviewer benchmark over the full corpus. Model
`typesafe/jev-1.13-20260917`, 2,688 judgments, 114.6 s wall clock, $0.1216 total.
Raw data: `docs/jev-reviewer-benchmark-judgments.json` and `-report.json`,
pinned as a regression in `apps/api/src/jevEvidence.test.ts`.

| Measured gate | Result                                                                      | Verdict  |
| ------------- | --------------------------------------------------------------------------- | -------- |
| Accuracy      | **12 false accepts** in 385 independent incorrect holdout candidates (3.1%) | **FAIL** |
| Coverage      | 50.9% overall, 47.5% on complex rules (needs ≥75% / ≥60%)                   | **FAIL** |
| Language      | gap 3.8 points (within 5), but false accepts ≠ 0                            | **FAIL** |
| Stability     | 94.9% identical across three repetitions (needs ≥98%)                       | **FAIL** |
| Latency       | p50 331 ms, p95 431 ms, availability 100%                                   | **PASS** |

**The reviewer must not be given authority.** `JEV_REVIEW_MODE` stays `off`.

### What it missed

Eight of the twelve are a swapped source. Given _"A ticket wins if the sum of
**its** six numbers is greater than 280"_, the reviewer accepted an AST reading
_"the sum of **the drawn** numbers is greater than 280"_ — a rule that ignores the
player's ticket entirely and pays every ticket or none based only on the draw. It
had the approved interpretation and the candidate's own description side by side,
and passed it in all three repetitions. Every rule of this family failed the same
way, so this is a systematic blind spot, not noise.

The other four are serializer divergence: the AST said _"exactly three matches"_
while the description left in place still said _"at least three"_. The reviewer
followed the prose rather than the tree — the exact failure that candidate class
was built to detect.

Everything else was caught every time: thresholds, comparators, reducers, set
operators, Boolean composition, clause omission, ranking direction and ranking
eligibility all scored zero false accepts.

### A bug this run found

Before the run, `collectSemanticReviewFacets` seeded all eight facets
unconditionally, leaving its own conditional detection dead. A plain predicate
rule was asked whether it preserved "tie" and "binders" semantics it does not
have; the honest answer is an uncertain score, and because the facet gate is
conjunctive, that blocked a PASS on completely correct ASTs. The first smoke run
returned **zero** PASS results for every candidate, correct or not — `active`
mode would have paid for a provider call on every rule and delivered no coverage
at all. Fixed, with a regression test in
`packages/rule-compiler/src/index.test.ts`.

### Methodological note

This holdout is now open. Per the plan, thresholds may not be re-tuned against a
holdout that has been read. Any change aimed at the source-swap blind spot —
reworded facet questions, a dedicated source question, a stricter gate — must be
calibrated on the calibration split and then validated on a **freshly generated**
holdout, which the seeded corpus builder can produce with new ids.

### What is still unmeasured

Cost, response time, questions, final artifacts and reviewer usage. Those need the
full preflight pipeline run twice, with and without the reviewer, and scored by
`summarizeJevHoldout`. They were not attempted: a reviewer that accepts a rule
ignoring the player's ticket cannot be promoted on the strength of being fast.

## Phases

1. **Offline.** Pass every gate on the blind corpus. No production change.
2. **Shadow** (`JEV_REVIEW_MODE=shadow`). At least 1,000 preflights. The LLM
   reviewer stays authoritative and no decision changes. Audit every divergence
   and a stratified 10% sample of the agreements.
3. **Gated canary** (`gated`). `JEV_CANARY_PERCENT` 5 → 25 → 100. Only a `PASS`
   skips the LLM reviewer. Each step requires seven days with no false accept and
   the cost and latency gates still met.
4. **Active** (`active`). The typed reviewer is the default. `ABSTAIN`, technical
   errors, uncalibrated cohorts, and divergences keep using the explicitly
   recorded LLM fallback.

Rollback is a single variable change back to `shadow`; it takes effect on the
next compilation and needs no deploy of new code.

## Auditing a run

With any mode other than `off`, the API emits two operator log lines:

- `JEV_INTERPRETATION_ADVISORY` — support, question materiality, and policy
  category scores from the interpretation step. Advisory only: it never removes
  or answers a question.
- `JEV_COMPILER_AUDIT` — every attempt for the rule, including the full typed
  result, the route, the fallback cause, latency, cost, and both hashes.

The player-facing preflight result carries only `{ status, route,
attestationHash }`. Scores and cost are stripped by `redactSemanticReviewScores`
before any rejected attempt reaches a response. Provider cost is also recorded
through the usage ledger under the `jev_semantic_review` and
`jev_interpretation_advisory` steps, with an unreported charge left `unknown`
rather than zero.

## Failure modes and what they do

| Condition                                 | Result                                             |
| ----------------------------------------- | -------------------------------------------------- |
| No API key                                | `ERROR` / `NOT_CONFIGURED` → LLM fallback.         |
| HTTP failure or timeout                   | `ERROR` → LLM fallback.                            |
| Missing resolved model version            | `ERROR` / `MISSING_MODEL_VERSION` → LLM fallback.  |
| Malformed or incomplete answers           | `ERROR` / `MALFORMED_RESPONSE` → LLM fallback.     |
| Attestation or candidate hash mismatch    | Treated as `ERROR` by the compiler → LLM fallback. |
| Cohort not calibrated in `gated`/`active` | `ABSTAIN` / `UNCALIBRATED_COHORT` → LLM fallback.  |
| Rule outside the canary cohort            | Shadow route; the LLM reviewer decides.            |

No path returns `PASS` on a failure, and no path accepts a candidate because a
check could not run.
