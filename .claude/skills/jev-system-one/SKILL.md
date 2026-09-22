---
name: jev-system-one
description: Design, implement, review, test, or troubleshoot TypeSafe AI Jev/System One integrations that use typed Choice, Score, or Noul questions. Use for deciding whether Jev fits a workflow; declaring questions; shaping state; consuming probabilities, confidence, usage, and model metadata; calibrating uncertain/review routes; integrating through the TypeScript SDK, Python SDK, HTTP API, OpenRouter, or Vercel AI Gateway; and auditing Jev use in Tyche rule pipelines. Do not use it as guidance for ordinary generative chat or code-completion prompts.
---

# Jev System One

Use Jev as a bounded semantic-decision component. Jev does not generate prose,
code, explanations, or arbitrary JSON. It evaluates one text-based `state`
against named typed questions and returns structured judgments. Keep code in
control of calculations, validation, authorization, execution, and workflow.

## Begin with current documentation

Read the live [documentation index](https://docs.typesafe.ai/llms.txt) and the
pages relevant to the task. Treat live TypeSafe documentation and installed SDK
types as authoritative for version-dependent names, limits, models, pricing,
and retry behavior. Do not silently preserve an older contract.

At minimum:

- For any design, read [State](https://docs.typesafe.ai/concepts/state),
  [Primitives](https://docs.typesafe.ai/primitives), and the selected primitive
  page.
- For implementation, read the current [HTTP API](https://docs.typesafe.ai/api)
  or chosen SDK page.
- For production thresholds, read [Confidence](https://docs.typesafe.ai/confidence)
  and [references/evaluation-and-consistency.md](references/evaluation-and-consistency.md).
- For model-specific limitations, read the current model's jaggedness page.

## Decide whether Jev is the right component

Use Jev when software needs a fast semantic judgment with a closed output shape:

| Required answer | Primitive | Consume |
| --- | --- | --- |
| Exactly one label from a closed set | `Choice` | `choice`, all `probabilities`, `confidence` |
| Position on ordered, described levels | `Score` | fractional `score`, `legend`, all `probabilities`, `confidence` |
| Probability that one condition is true | `Noul` | `noul` in `[0, 1]`; there is no separate confidence |

Use deterministic code for exact arithmetic, counting, dates, parsing, schema
validation, permissions, invariants, and known business rules. Use a generative
LLM when the required output is new text, an explanation, code, a plan, or an
open-ended structure. Generate or enumerate candidates first when needed, then
let Jev rank or judge a bounded candidate set.

Do not make Jev the sole authority for payments, access control, legal or safety
decisions, irreversible actions, on-chain state, or other high-impact effects.
Require deterministic gates and an explicit review/abstention path proportional
to the risk.

## Design the request

1. Define the application action and the cost of each wrong decision before
   writing questions. State which outcomes auto-act, request clarification,
   route to review, or fail closed.
2. Remove decisions that code can make exactly.
3. Build one relevant state. Prefer a named JSON object when several facts must
   be related. Keep observed facts, user-supplied text, policies, and derived
   values distinguishable. Exclude irrelevant context and secrets.
4. Ask one focused snap judgment per question. Write its full meaning in
   `instructions`; question IDs are only response keys and are not sent to the
   model. Point to structured state with backticked paths such as
   `` `ticket.message` ``.
5. Define mutually distinguishable `Choice` options, independently meaningful
   ordered `Score` levels, or aligned true/false `Noul` criteria. Add `other` or
   `none` when a Choice taxonomy is not exhaustive.
6. Batch independent questions over the same state. Questions in one request
   cannot see one another's answers. Use a second request only when the first
   answer is needed to fetch evidence, construct state, or define later options.
7. Send the call from a trusted server boundary. Never ship the API key to a
   browser or mobile client.

Read [references/request-response-contract.md](references/request-response-contract.md)
when declaring inputs, implementing an SDK/HTTP call, or processing outputs.

## Process the result

Treat typed output as a valid interface, not proof that the judgment is true.

- Match every expected answer ID and `type`; reject missing, extra, malformed,
  non-finite, or out-of-range values instead of inventing defaults.
- For `Choice`, use the selected label for routing only after applying the
  calibrated policy. Preserve the full probability distribution.
- For `Score`, remember that `score` is a probability-weighted expected position
  and may be fractional; inspect the distribution when tails or adjacent levels
  have different consequences.
- For `Noul`, interpret the number as P(yes). A value near `0.5` is uncertainty,
  not medium intensity. Use `Score` for intensity.
- Persist the requested model, resolved response model, question-set version or
  fingerprint, decision policy version, raw judgments, usage, latency, and
  review/action result where auditability permits. Redact sensitive state.
- Keep transport/service failure distinct from model uncertainty and from a
  negative answer. Never map an exception to a legitimate-looking zero, label,
  or score.

## Validate before release

Calibrate thresholds on representative labeled data for each language, domain,
stage, and consequence. Test paraphrases, polarity changes, boundary cases,
missing evidence, adversarial state, out-of-taxonomy inputs, and service errors.
Measure the behavior of the whole policy, including automation coverage and
review load, rather than only top-label accuracy.

For repeatability, probability bands, threshold crossings, and the linked
self-consistency cookbook, read
[references/evaluation-and-consistency.md](references/evaluation-and-consistency.md).
For architecture patterns, security, retries, observability, versioning, and
known failure modes, read
[references/production-operations.md](references/production-operations.md).

## Tyche boundary

When applying Jev in this repository, also read
[references/tyche-rule-pipeline.md](references/tyche-rule-pipeline.md) and
`docs/jev-rule-pipeline-experiment.md`. Jev may route, rank, or judge bounded rule
candidates, but it must not generate or authorize a final rule artifact by
itself. Preserve policy screening, schema and runtime validation, behavior
fixtures, independent review, player confirmation, commitment hashing, and
on-chain invariants.

## Final review

Before reporting completion, verify that:

- the task truly needs semantic judgment rather than code or generation;
- state and question wording carry complete, non-contradictory meaning;
- candidate sets and Score levels cover the intended domain;
- outputs are type-checked and uncertainty has an explicit route;
- thresholds are local policy backed by evaluation, not cookbook constants;
- failures remain observable and critical actions fail closed;
- credentials and sensitive bodies are absent from client bundles and logs;
- model/question/policy versions and tests make behavior reproducible.
