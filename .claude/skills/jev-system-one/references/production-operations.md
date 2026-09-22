# Production design and operations

Use this reference for architecture, security, failure handling, retries,
observability, model limits, and the decision of where not to use Jev.

## Contents

- Appropriate patterns
- Inappropriate uses
- Known Jev 1.13 limitations
- Security and privacy
- Errors, retries, and timeouts
- Versioning, caching, and observability
- Deployment checklist

## Appropriate patterns

Good Jev roles have a bounded semantic interface:

- intent or handler routing with an explicit no-match route;
- multilabel detection using independent Nouls;
- severity, quality, or fit along carefully described Score levels;
- ranking or selecting from candidates produced by code or retrieval;
- verifying a specific claim against supplied evidence;
- checking input/output guardrail dimensions while deterministic policy remains
  authoritative;
- speculative fan-out: ask all independent questions over one state, then use
  only the answers relevant to the selected code branch;
- composite scoring: ask one Score per dimension, then apply owned weights and
  policy in code;
- cascades: use Jev to decide when a more expensive generator, verifier, or
  human review is warranted;
- semantic feature extraction for a downstream statistical model, with a
  versioned feature definition and held-out evaluation.

Batch same-state independent questions. The official parallel-questions
cookbook observed one 13-question request to be 12.2x cheaper and 10.0x faster
than 13 single-question calls for its document-heavy workload, with unchanged
answers. Treat those figures as that experiment's result, not a universal
performance promise; measure the target workload.

## Inappropriate uses

Do not use Jev for:

- chat, code completion, explanation, summarization, or arbitrary generation;
- exact arithmetic, counting, date comparison, cryptography, randomness, or
  deterministic validation;
- extraction of values that code can parse exactly; enumerate source spans and
  let Jev select only when semantic disambiguation is needed;
- open-world classification without an `other`/abstain route or candidate
  coverage check;
- creating an AST, database mutation, transaction, legal conclusion, or policy
  text from scratch;
- sole authorization of access, payment, moderation penalties, asset freezing,
  on-chain state, or other high-impact effects;
- inference over evidence the request does not actually provide;
- a hidden fallback after service failure.

Function routing remains ordinary typed code: Jev may select a known function
and closed-set arguments, but code validates authorization, parameter domains,
idempotency, current state, and confirmation before invocation. Never let a
semantic label execute an irreversible tool call directly.

## Known Jev 1.13 limitations

Read the live [Jev 1.13 jaggedness page](https://docs.typesafe.ai/model-jaggedness/jev-1.13)
before relying on the model. As reviewed there on 2026-09-17, Jev 1.13 can be
literal and struggles with numeric precision and multi-hop indirection.

Design accordingly:

- state the exact condition and distinguish every option;
- perform math, counting, date/time comparison, and structural identities in
  code;
- minimize indirection and point questions directly to the relevant state path;
- filter large state before the call;
- align instructions and criteria; never encode opposite meanings;
- ask the same semantic decision one way and enforce cross-question invariants
  in code;
- use a generative model for generation;
- test adversarial content because state is data, not automatically treated as
  hostile instructions;
- test non-English workloads separately. English is Jev's primary training
  language and current documentation warns that other languages may be less
  accurate.

Current model documentation lists text-only input, a 64k-token request context,
and a 32k-token limit for state plus the longest question. These limits and
pricing are version-dependent; read the live
[Models page](https://docs.typesafe.ai/models) instead of hardcoding them in
long-lived product logic.

## Security and privacy

- Call Jev through a backend/service boundary. The API key must never reach the
  browser, mobile bundle, user-visible errors, telemetry, or repository.
- Load credentials from an environment variable or secret manager. Grant the
  narrowest access available and rotate exposed keys.
- Treat all external state as hostile. Enforce size/depth limits, schema
  validation, Unicode policy, and field allowlists before sending it.
- Keep deterministic policy outside user-controlled state. Explicit criteria
  reduce but do not eliminate prompt-injection/adversarial framing risk.
- Minimize personal, financial, and confidential data. Verify the current
  provider/legal data-handling terms before sending regulated data.
- Redact logs. The Python SDK documentation states that secret headers are
  redacted at debug level but request and response bodies are not. Do not enable
  body logging in production for sensitive workloads.
- Never record raw state in analytics merely because raw answers are useful.
  Store hashes, bounded metadata, or separately protected audit evidence when
  possible.

For LLM guardrails, define one Noul per hazard and a separate Score for severity
when needed. Screen inputs and outputs, then map raw probabilities to named,
versioned product policies such as pass/review/block/support. Keep deterministic
precedence in code. A guardrail model is defense in depth, not permission to
remove provider safety, input validation, access control, or human escalation.

## Errors, retries, and timeouts

Classify failures explicitly:

| Failure | Handling |
| --- | --- |
| Invalid key/authentication/permission | Do not retry; alert/configuration error |
| Bad request/schema/unsupported model | Do not retry unchanged; fix request or configuration |
| Rate limit (`429`) | Honor `Retry-After`; bounded exponential backoff with jitter |
| Timeout/connection/transient `5xx` | Bounded retry if budget permits; preserve final failure |
| Caller cancellation | Stop; do not continue hidden background work unless the product contract explicitly owns it |
| Valid but uncertain answer | Route through decision policy; this is not a transport retry |
| Malformed success payload | Integration error; fail closed and alert |

The official SDKs retry eligible failures by default; inspect installed SDK
defaults and set an end-to-end deadline. Per-attempt timeout is not the same as
the user's total latency budget. Repeated calls can create duplicate spend even
when inference has no external side effect, so cap attempts and record them.

Never catch an exception and substitute `0`, `0.5`, the most common label, a
previous result for different state, or a permissive outcome. If stale-cache use
is an approved product behavior, make its age and provenance explicit and keep
it outside critical authorization paths.

## Versioning, caching, and observability

Version or hash all behavior-shaping inputs:

- state-construction schema;
- complete question instructions and criteria;
- requested model and resolved model;
- SDK/API contract version;
- thresholds, weights, and consequence policy;
- code that combines answers.

Cache only when semantic state, questions, model policy, and freshness contract
match. A cache key based only on question IDs is invalid because IDs are not sent
to the model. When using `jev-latest`, prevent cache entries from obscuring an
alias upgrade.

Record metrics without sensitive bodies:

- request count and token usage;
- latency and retry distributions;
- error class/status and request ID;
- requested/resolved model;
- question-set and policy versions;
- probability/confidence histograms;
- auto-act, review, clarify, reject, and unavailable rates;
- downstream corrections and disagreement when available.

## Deployment checklist

- Run contract tests against the selected SDK/API version.
- Validate success payloads and every documented error class.
- Exercise timeout, rate-limit, unavailable, malformed-payload, and cancellation
  paths.
- Evaluate target languages and domain distributions.
- Start with shadow/advisory behavior for consequential flows.
- Set cost, latency, error, drift, and review-load alerts.
- Document disable/rollback behavior before enabling automatic action.
- Re-evaluate when aliases, questions, state construction, SDK, or policy change.
