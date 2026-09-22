# Tyche rule-pipeline application

Use this reference only for Jev work in this repository. Read the fuller local
evidence in `docs/jev-rule-pipeline-experiment.md` before changing the pipeline.

## Authority boundary

Jev can supply advisory, typed semantic judgments inside the rule pipeline. It
cannot generate an executable AST, explain reasoning, prove equivalence, or
authorize a final rule. Preserve this boundary:

```text
player source
  -> deterministic policy/input screen
  -> candidate generation or finite grammar enumeration
  -> Jev routing/ranking/judgment (advisory)
  -> schema + source coverage + runtime bounds + behavior fixtures
  -> independent review + player approval
  -> commitment hash/freeze
  -> on-chain invariants remain authoritative
```

Never let a Jev probability bypass policy screening, the existing validator,
guardian/reviewer requirements, player confirmation, fees, commitment hashing,
or contract checks. An unsupported or incomplete candidate space must abstain;
the highest-ranked available candidate is not thereby correct.

## Suitable uses in Tyche

- Route a proposal among bounded, predeclared composition families.
- Rank finite parameter or AST candidates produced before Jev sees the prompt.
- Judge whether a fully described candidate matches the original player source.
- Score possible missing-information categories as advisory metadata while the
  original source and generative interpreter remain available.
- Compare a candidate or citation against supplied evidence as one signal among
  deterministic and independent checks.

## Unsuitable uses in Tyche

- Generate novel ASTs or player-facing clarification text.
- Decide that an omitted candidate or interpretation does not exist.
- Suppress a clarification solely because its Noul is low.
- Treat a high Noul as proof that a clarification is necessary.
- Approve semantic fidelity, policy safety, payout behavior, or artifact freeze
  without the existing gates.
- Replace numerical evaluation of the rule runtime or six-number domain.
- Use Jev as entropy, randomness, a VRF substitute, or an on-chain authority.

## Repository evidence to preserve

The September 2026 experiment found:

- bounded candidate selection worked on a small designed set, including English
  and Portuguese examples;
- removing the correct candidate produced low winning Nouls in those samples,
  but the experimental cutoffs are not release thresholds;
- clarification-category ranking missed required categories in some cases;
- top Choice labels failed as a reliable ambiguity gate on observed cases;
- high Nouls were assigned to some debatable or redundant clarification
  categories;
- Portuguese routing/completeness scores differed from English results;
- the strongest safe conclusion was candidate readiness for the existing
  validator, never production authorization.

Do not generalize these observations into universal model properties. Extend the
corpus, calibrate by language and stage, and require held-out behavior fixtures
before changing an automatic route.

## Provider configuration

The official Python SDK currently documents this OpenRouter-compatible setup:

```python
TypeSafeClient(
    api_key=os.environ["OPENROUTER_API_KEY"],
    base_url="https://openrouter.ai/api",
    model="~typesafe/jev-latest",
)
```

The local experiment reads `API_KEY_OPENROUTER` or the root `.env` and observed
that the tilde-prefixed alias worked while `typesafe/jev-latest` did not at the
OpenRouter Decisions endpoint. Treat this as provider-specific configuration,
not the native TypeSafe API model name. Validate configured aliases at startup
or in an explicit health check; do not hide an invalid model with a generative
fallback.

## Local experimental runners

The documented scripts are paid, non-production experiments and must not submit
a proposal:

```powershell
node apps/api/scripts/jev-rule-probe.mjs
node apps/api/scripts/jev-rule-probe.mjs --clarification
node apps/api/scripts/jev-rule-composition.mjs --assert
node apps/api/scripts/jev-rule-composition.mjs --omit-correct --assert
node --import tsx apps/api/scripts/jev-rule-pipeline.mjs
node --import tsx apps/api/scripts/jev-rule-pipeline.mjs --dynamic-clarification set12-V1 pt-vague
node apps/api/scripts/jev-rule-doubt-pipeline.mjs --screen-only
```

Before executing paid calls, state the expected scope and avoid concurrent runs
that would confound latency/cost observations. Record the source revision,
resolved model, full candidate-set fingerprint, question-set version, response
probabilities, known provider cost, latency, fixture results, and every
abstention/failure.

## Review gate for Tyche changes

Require all applicable repository checks plus these semantic cases:

- exact regression and paraphrases in English and Portuguese;
- polarity/operator/threshold/order/scope mutations;
- correct-candidate-omitted control;
- incomplete or unsupported composition family;
- adversarial/player text attempting to steer policy;
- service failure and malformed response;
- cross-check against schema and executable behavior fixtures;
- proof that no fee, proposal, artifact freeze, transaction, or on-chain state
  occurs before the existing authority gates.
