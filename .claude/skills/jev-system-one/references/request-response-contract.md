# Request and response contract

Use this reference when declaring questions, choosing an input representation,
calling Jev, or consuming a result. Verify the live docs before implementation:
[API](https://docs.typesafe.ai/api),
[JavaScript SDK](https://docs.typesafe.ai/sdk/javascript), and
[Python SDK](https://docs.typesafe.ai/sdk/python/usage).

## Contents

- Request envelope
- Provider routes
- State types
- Question declarations
- Answer types
- TypeScript example
- Python example
- HTTP example
- Response validation

## Request envelope

`POST https://api.typesafe.ai/v1/systemone` accepts:

```json
{
  "model": "jev-latest",
  "state": {},
  "questions": {}
}
```

- `model`: use an available alias such as `jev-latest` for upgrades, or a
  versioned ID when reproducibility requires a pinned model. Always retain the
  resolved `response.model` because an alias can change.
- `state`: the common evidence all questions evaluate.
- `questions`: a non-empty map from stable application IDs to question objects.
  Answers return under the same IDs. IDs are not inference context.

## Provider routes

Keep the model ID and base URL paired with the provider. Do not assume that a
native TypeSafe model name is valid through a compatible gateway.

| Provider | Base URL | Documented model | Credential |
| --- | --- | --- | --- |
| TypeSafe native | `https://api.typesafe.ai` | `jev-latest` | `TYPESAFE_API_KEY` |
| OpenRouter compatibility | `https://openrouter.ai/api` | `~typesafe/jev-latest` | OpenRouter API key |
| Vercel AI Gateway compatibility | `https://ai-gateway.vercel.sh/typesafe` | `typesafe-ai/jev` | AI Gateway API key |

The alternative must follow the TypeSafe OpenAPI contract. Validate model
availability explicitly and capture the resolved model. Provider-specific
pricing, limits, headers, and data handling remain provider concerns even when
the payload is compatible.

## State types

Jev accepts text-based state as a string, JSON object, or array. It does not
accept image, audio, or video input. Prefer:

- a string for one self-contained passage;
- an object for named facts, related records, policies, candidates, and source
  text;
- an array for an ordered sequence when the order itself matters.

Keep the state JSON-serializable. Give fields semantic names, preserve source
boundaries, and point questions to relevant values by backticked path. Do not
flatten structured data into an ambiguous prose template. Filter unrelated data
before the call.

Although numeric fields can appear in state, Jev is not an arithmetic engine.
Calculate sums, counts, distances, dates, thresholds, and exact comparisons in
code, then supply the result only when a semantic judgment needs it.

## Question declarations

The structured entry fields used by questions support a string, object, array,
or `null`. Always supply meaningful, non-null instructions. Prefer a clear
string first; use structure for labeled definitions, contrasts, examples, or
code-built supporting data. Option descriptions can be `null` only when their
keys are already unambiguous.

### Choice

Use for exactly one label from a fixed unordered set:

```json
{
  "type": "choice",
  "instructions": "Which route best matches `request.text`?",
  "criteria": {
    "billing": "Charges, invoices, refunds, or subscriptions",
    "technical": "Bugs, outages, or integrations",
    "other": "None of the listed routes"
  }
}
```

Option keys are machine values; descriptions define the semantic boundaries.
Use separate Nouls when several labels may simultaneously apply. Include an
explicit no-match option unless the taxonomy is demonstrably exhaustive.

### Score

Use for one ordered dimension with at least two distinct descriptive levels:

```json
{
  "type": "score",
  "instructions": "How severe is the impact described in `request.text`?",
  "criteria": [
    "Cosmetic; no functional impact",
    "Feature degraded; workaround exists",
    "Blocking; no workaround exists"
  ]
}
```

Do not use bare numbers as level descriptions. Do not combine independent
dimensions such as urgency, harm, and sentiment in one scale. The current API
documentation allows up to ten levels; verify the current limit before relying
on it.

### Noul

Use for one true/false condition whose probability is useful:

```json
{
  "type": "noul",
  "instructions": "Does `request.text` explicitly ask for a refund?",
  "criteria": {
    "true": "The sender asks to have money returned",
    "false": "No refund request is present"
  }
}
```

`criteria` is optional. When present, align `true` with yes and `false` with no;
do not reverse their meanings. For multilabel classification, declare one Noul
per label and combine them in code.

## Answer types

| Question | Required answer fields | Semantics |
| --- | --- | --- |
| Choice | `type`, `choice`, `probabilities`, `confidence` | `choice` is the highest-probability supplied option; probabilities sum to approximately 1 |
| Score | `type`, `score`, `legend`, `probabilities`, `confidence` | `score` is the expected position over integer rubric levels and can be fractional |
| Noul | `type`, `noul` | `noul` is P(yes) in `[0, 1]`; no separate confidence field |

The top-level response also carries the resolved `model` and `usage` with input
and output token counts. SDKs may expose request IDs through response helpers or
exceptions; retain them for support and tracing when available.

## TypeScript example

Requires Node.js 20 or newer according to the current JavaScript SDK docs:

```ts
import { choice, noul, score, TypeSafeClient } from "@typesafe-ai/sdk";

const client = new TypeSafeClient(); // reads TYPESAFE_API_KEY server-side

const questions = {
  route: choice("Which route best matches `request.text`?", {
    billing: "Charges, invoices, refunds, or subscriptions",
    technical: "Bugs, outages, or integrations",
    other: "None of the listed routes",
  }),
  urgent: noul("Does `request.text` require time-sensitive handling?", {
    true: "A delay would materially worsen the stated outcome",
    false: "No time-sensitive consequence is stated",
  }),
  impact: score("How severe is the impact in `request.text`?", [
    "Cosmetic; no functional impact",
    "Feature degraded; workaround exists",
    "Blocking; no workaround exists",
  ]),
};

const result = await client.systemOne({
  model: "jev-latest",
  state: {
    request: { text: "Checkout fails and today's launch is blocked." },
  },
  questions,
});

const route = result.answers.route;
const urgent = result.answers.urgent;
const impact = result.answers.impact;

// Apply a separately versioned, evaluated policy here.
console.info({
  model: result.model,
  route: route.choice,
  routeConfidence: route.confidence,
  routeProbabilities: route.probabilities,
  urgentProbability: urgent.noul,
  impactScore: impact.score,
  impactProbabilities: impact.probabilities,
  usage: result.usage,
});
```

Do not use this logging shape unchanged for sensitive production state. Keep the
client on the server; the JavaScript SDK refuses browser use by default because
it would expose the API key.

## Python example

Python SDK requires Python 3.10 or newer according to current docs:

```python
from typesafe_sdk import Choice, Noul, NoulCriteria, Score, TypeSafeClient

questions = {
    "route": Choice(
        instructions="Which route best matches `request.text`?",
        criteria={
            "billing": "Charges, invoices, refunds, or subscriptions",
            "technical": "Bugs, outages, or integrations",
            "other": "None of the listed routes",
        },
    ),
    "urgent": Noul(
        instructions="Does `request.text` require time-sensitive handling?",
        criteria=NoulCriteria(
            true="A delay would materially worsen the stated outcome",
            false="No time-sensitive consequence is stated",
        ),
    ),
    "impact": Score(
        instructions="How severe is the impact in `request.text`?",
        criteria=[
            "Cosmetic; no functional impact",
            "Feature degraded; workaround exists",
            "Blocking; no workaround exists",
        ],
    ),
}

with TypeSafeClient() as client:
    result = client.system_one(
        model="jev-latest",
        state={"request": {"text": "Checkout fails and today's launch is blocked."}},
        questions=questions,
    )

route = result.answers["route"]
urgent = result.answers["urgent"]
impact = result.answers["impact"]
```

Use `AsyncTypeSafeClient` in asynchronous applications. The Python SDK also
supports typed/custom Pydantic response models when the application benefits
from stronger static and runtime validation.

## HTTP example

```bash
curl -X POST https://api.typesafe.ai/v1/systemone \
  -H "Authorization: Bearer $TYPESAFE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "jev-latest",
    "state": {"request": {"text": "Checkout fails and today\u0027s launch is blocked."}},
    "questions": {
      "urgent": {
        "type": "noul",
        "instructions": "Does `request.text` require time-sensitive handling?"
      }
    }
  }'
```

Use an SDK unless direct HTTP is required. With direct HTTP, implement bounded
timeouts, rate-limit handling, status-specific errors, schema validation, and
request ID capture explicitly.

## Response validation

At the integration boundary:

1. Require a successful HTTP status and parse JSON once.
2. Require a non-empty resolved model and numeric token usage.
3. Require exactly the expected answer IDs unless forward-compatible extras are
   an intentional, tested policy.
4. Match each answer `type` to its question.
5. Require finite probabilities in `[0, 1]`; check Choice/Score distributions
   sum to 1 within a documented floating-point tolerance.
6. Require a Choice label from the declared criteria.
7. Require Score `legend` and probability keys to correspond to declared levels,
   and the score to fall within the level range.
8. Treat any violation as an integration error. Do not coerce it into an
   application decision.
