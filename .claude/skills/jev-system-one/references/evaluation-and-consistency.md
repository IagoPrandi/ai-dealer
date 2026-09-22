# Evaluation, calibration, and self-consistency

Use this reference when selecting thresholds, designing review bands, measuring
repeatability, or applying the
[Noul self-consistency cookbook](https://docs.typesafe.ai/cookbooks/consistency_noul_cookbook).

## Contents

- Separate probability, confidence, and correctness
- Design an action policy
- Calibrate thresholds
- Run self-consistency studies
- Evaluate the whole workflow
- Release and monitoring gates

## Separate probability, confidence, and correctness

- A `Noul` is P(yes). It has no separate confidence. Distance from `0.5` can be
  useful for routing, but does not prove correctness.
- `Choice` and `Score` return a probability distribution plus `confidence`, a
  statistic derived from how concentrated that distribution is.
- High confidence is not authorization, evidence completeness, or workflow
  correctness. A confident answer can still be wrong.
- A typed response guarantees shape, not truth.
- A Score value between two levels is an expected position, not a hidden extra
  category.

## Design an action policy

Map raw judgments to application outcomes in deterministic, versioned code.
Define at least:

- automatic positive action;
- automatic negative action when safe and appropriate;
- uncertain/review or clarification route;
- invalid response/service error route;
- stale-state route when the evidence changed after inference.

Use asymmetric thresholds when false positives and false negatives have
different costs. For example, a harmless UI suggestion may tolerate broad
automation; blocking a user, moving money, or freezing an artifact requires a
much stronger gate and usually independent verification.

Never copy `0.30`/`0.70`, `0.20`/`0.80`, or any cookbook/example threshold into
production without target-domain evaluation. Keep raw probabilities visible to
reviewers and downstream analysis instead of storing only the final label.

## Calibrate thresholds

Build a versioned evaluation set from real target-domain examples. Include:

- common and rare classes in realistic proportions;
- clear positives, clear negatives, genuinely ambiguous cases, and missing
  evidence;
- paraphrases, polarity reversals, near-boundary examples, and out-of-taxonomy
  inputs;
- adversarial or self-referential state;
- every supported language, evaluated separately;
- cases whose downstream consequences differ even if their semantic label is
  the same.

For each question and policy version, inspect:

- false-positive and false-negative rates;
- precision/recall or task-appropriate class metrics;
- probability calibration, such as reliability buckets, Brier score, or ECE;
- automation coverage, review rate, and unresolved rate;
- cost and latency percentiles;
- error rate by model version, language, source, and consequence tier.

Choose thresholds from the loss/impact of the resulting actions, not from a
single aggregate accuracy score. Preserve a holdout set and rerun it whenever
the model alias, question wording, criteria, state construction, or decision
policy changes.

## Run self-consistency studies

Use repeated calls to characterize stability, not to manufacture certainty.
The linked cookbook repeats the same 14 Noul questions 15 times and keeps every
probability. It adds a fresh throwaway `uid` to each call so each sample is a
distinct request. The cookbook explicitly notes that this design cannot
separate sensitivity to that irrelevant field from variation on an identical
request.

For a repeatability study:

1. Freeze the semantic state, questions, model request, SDK/API version, and
   policy. Compute a hash over state plus question content; question IDs alone
   are insufficient because the model does not see them.
2. Decide whether the experiment is identical-repeat or nuisance-variation.
   Do not mix the interpretations. If adding a UID or reordering irrelevant
   fields, report that factor.
3. Record every raw answer, resolved model, usage, latency, request ID, and
   transport failure. Never drop failed samples silently.
4. For Noul, report mean, standard deviation, min/max, quantiles, and the count
   of samples crossing every proposed action threshold.
5. For Choice, report label agreement and the automatic-action share under the
   confidence policy, not only the modal label.
6. For Score, inspect distribution and score stability; a stable mean can hide
   probability movement between consequence-heavy tail levels.
7. Separate model variation from caching. Include model and a content hash in
   cache keys; retain the resolved model when using an alias.

Do not use majority vote as a default production fallback. Repetition multiplies
cost and latency, and correlated errors are not corrected by voting. Use repeated
inference only when experiments show that a defined aggregation improves the
actual action policy. Otherwise route uncertainty to review, clarification, a
stronger verified stage, or a deterministic check.

## Evaluate the whole workflow

Measure the final behavior after code combines answers:

- Does speculative fan-out preserve the intended branch behavior?
- Are irrelevant branch answers ignored?
- Does a second request use genuinely new evidence/options rather than repeat
  questions that could have been batched?
- Are missing candidates discoverable through `other`, abstention, or review?
- Does stale state invalidate the decision before side effects?
- Do service failures remain distinguishable from semantic uncertainty?
- Can a reviewer see the source evidence and raw judgment without sensitive
  overexposure?

## Release and monitoring gates

Before rollout, require the approved metrics for each consequence tier. Start in
shadow/advisory mode, compare with existing outcomes, and expose drift by model,
question-set, policy, and language. Alert on:

- answer/schema validation failures;
- threshold-crossing or class-distribution drift;
- review-rate and automation-rate changes;
- latency, timeout, retry, and rate-limit changes;
- alias resolving to a new model version;
- rising disagreement with deterministic or human outcomes.

Roll back or disable automatic action when the evaluation contract is no longer
met. Do not silently widen thresholds to restore automation volume.
