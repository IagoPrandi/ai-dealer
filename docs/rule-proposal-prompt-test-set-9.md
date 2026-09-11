# Rule Proposal Prompt Test Set 9 - Novel Compositions and the Clarification Loop

Session date: 2026-09-11. Build `f2e22e7`. Live `POST /rule-preflight` on a
dedicated API process (`PORT=3096`), OpenRouter profile from `.env`:

| Role       | Model                                       |
| ---------- | ------------------------------------------- |
| interpret  | `qwen/qwen3.8-27b`                          |
| compile    | `openai/gpt-oss-120b`                       |
| review     | `mistralai/mistral-small-24b-instruct-2501` |
| guardian   | `openai/gpt-oss-safeguard-20b` (Groq)       |
| escalation | `openai/gpt-oss-120b`                       |

Runner: `apps/api/scripts/rule-preflight-novel-set-9.mjs`
(+ `apps/api/scripts/set-9-round2.json`, written **after** round 1 from the
questions the agent itself asked).

## Method

Identical to set 8, so the numbers are comparable:

- **Four novel prompts plus two deliberately imprecise ones.**
- **Novelty is proved, not asserted.** All six were first pushed through
  `validateAndPrecompileRule` offline.
- **Expressibility is proved before the agent is judged.** A reference AST was
  written for every objective rule and executed against the boundary fixtures:
  **27/27 in round 1, 40/40 in round 2**. Every refusal below is a policy
  decision, never a DSL limit.
- **The two-phase player flow**, exactly as `Create.tsx` performs it:
  `phase: "interpret"` -> approve -> `phase: "compile"` with
  `approvedInterpretation`.
- **Behaviour oracle.** Every accepted AST **and every discarded candidate AST**
  is executed against fixtures written from the ORIGINAL prompt.
- Round 2 replays the two vague rules with answers to the agent's own questions,
  plus three isolation variants that each change exactly one thing, plus one
  verbatim replay for stability.

## Corpus

| ID  | Capability axis (absent from sets 1-8)                                                     |
| --- | ------------------------------------------------------------------------------------------ |
| N1  | top-k positional dominance: `sort desc` + `slice` on both sides, then `pairs_forall`         |
| N2  | PRD 6.7's canonical guarded transformation (double, keep original past 100) + membership     |
| N3  | equality between a guess statistic and the SAME statistic of the draw + `product` of a slice |
| N4  | min-ranking whose score carries a conditional penalty: sorted distance + `ite(hit, 10, 0)`   |
| V1  | an undefined baseline ("more spread out than usual") + an undefined categorisation           |
| V2  | a subjective similarity metric with an undefined exclusion ("without actually copying it")   |

Round 2: `V1b`/`V2b` (clarified), `N2b` (N2 with `past 100` -> `above 100`),
`N3b` (N3 with `exactly as many ... as` -> `the same number of ... as`),
`N4b` (N4 with the tie sentence reworded away from the literal "same total"),
`N1b` (N1 verbatim, stability).

## Results

| Case | Verdict | Fixtures | Latency | Candidates discarded |
| ---- | ------- | -------- | ------- | -------------------- |
| N1   | **VALID** | **7/7** | 93 s | 0 |
| N2   | **BLOCK 400** (`RULE_EXTERNAL_DEPENDENCY`) | - | **4 ms** | 0 (no model ran) |
| N3   | CLARIFY (false positive) | - | 7 s | 0 (no compile ran) |
| N4   | CLARIFY | - | 178 s | 3 (0 correct) |
| V1   | CLARIFY (expected) | - | 7 s | 0 |
| V2   | CLARIFY (expected) | - | 7 s | 0 |
| V1b  | **VALID but WRONG** | **4/7** | 66 s | 0 |
| V2b  | CLARIFY | - | 175 s | 3 (**2 correct**) |
| N2b  | CLARIFY | - | 169 s | 3 (0 correct) |
| N3b  | CLARIFY | - | 202 s | 3 (**3 correct**) |
| N4b  | CLARIFY | - | 177 s | 3 (**1 correct**) |
| N1b  | **VALID** | **7/7** | 55 s | 0 |
| V1b replay 2 | CLARIFY | - | 23 s | 0 |
| V1b replay 3 | CLARIFY | - | 23 s | 0 |

Headline numbers:

- **Compilation rate on novel rules: 1/4** (N1). The other three were retried
  once each with a single variable changed: still 0/3.
- **Clarification detection: 2/2.**
- **Clarification follow-through: 0/2.** V1b was accepted with a wrong artifact
  once and sent back to clarification twice; V2b was refused. Neither vague rule
  ever reached a correct frozen artifact. Set 8 scored 2/2 here.
- **A wrong artifact was accepted on the approved-interpretation path** (H1
  below). Set 8 reported 21/21 clean on that path; set 9 is 2 of 3.
- **Discarded candidates that were behaviourally correct: 6 of 15 (40 %).**
- **Two distinct deterministic over-claims** turned a regex match into the whole
  rule (H2, H3), each emitted three times in a row.

## Findings

### H1 (SEVERE) - compile silently dropped two of three clauses, and rewrote the approved interpretation to match

V1b is the clarified rewrite of V1, written from the agent's own two questions:

```text
player : A guess wins if the difference between its highest and lowest number is
         greater than the same difference for the drawn numbers, and at least two
         of its numbers are below 50 while at least two are above 50.
```

`interpret` read it exactly right, including the edge case nobody asked about:

```text
... The guess must have a strictly larger range than the draw. Additionally, the
guess must contain at least two numbers strictly less than 50 and at least two
numbers strictly greater than 50. Numbers equal to 50 do not count toward either
the 'below' or 'above' requirements.
```

That text was approved and sent back with `phase: "compile"`. The frozen AST is
an `and` with **one clause** - the range comparison. Both "at least two" clauses
are gone. It fails 3 of 7 fixtures (every ticket that is wide but not split).

What makes it severe is that every guard reported success:

- `decision: "VALID"`, `finalConfidence: 0.936` - the highest in the set;
- `coverage: {"missingFromAst": [], "missingOperations": []}`;
- `rejectedCompilerAttempts: []` - it was accepted first try, no reviewer veto;
- the compile-stage `officialInterpretation` was **rewritten** to
  *"A guess wins if (the largest of your numbers minus the smallest of your
  numbers) is greater than (the largest of the drawn numbers minus the smallest
  of the drawn numbers)"* - i.e. the record now describes the truncated rule, not
  the one the player approved.

The rewrite is deliberate, and that is the problem.
`apps/api/src/index.ts:4566-4578` runs
`analyzeStatementFidelity({ ast, statement: modelNormalizedText })` and, when the
prose and the AST disagree, **replaces the prose with the AST-derived
description** - the comment says *"the prose is the part that is wrong - the
player never wrote it"*. Here the AST was the wrong part, so the divergence was
resolved by editing the record to agree with the truncated rule. The comparison
is against compile's own `modelNormalizedText`; the interpretation the player
actually approved is never one of the two sides.

Not reproducible: two verbatim replays both returned CLARIFY (a reasonable
question about whether 50 counts as below or above). So the same prompt on the
same build pays out as *wrong-and-frozen*, *clarify*, *clarify* - see
[the instability memo](rule-proposal-prompt-test-set-7.md) for the same pattern.

### H2 - a tie-break clause became the entire rule (`sum_equals`)

N4's last sentence is *"and tickets on the same total split it equally."*
The deterministic pre-compiler matches `/\b(same-total|same total)\b/` +
`/draw|drawn/` + `/numbers?/` and returns

```json
{"schemaVersion": 1, "node": {"kind": "sum_equals"}}
```

with `decision: "VALID"`, `reasonCodes: ["SUPPORTED_RULE"]`, and the official
interpretation *"A guess wins if the sum of its six numbers equals the sum of the
six official draw numbers"* - a rule with nothing in common with the player's.
Reproducible offline in 0 ms
(`node apps/api/scripts/rule-preflight-novel-set-9.mjs <url> --offline`).

Live, this AST was the draft in **all three** compile attempts. The only thing
that stopped it from being frozen was the independent reviewer, which compiled a
ranking and so raised `REVIEWER_MISMATCH`. The retry budget of three was spent
on three byte-identical candidates.

`N4b` is N4 with the tie sentence reworded to "tickets tied for the smallest
total": the `sum_equals` candidates disappear and the model gets to draft.

### H3 - the same over-claim drops a whole transformation (`match_count_at_least`)

N2b (*"Double each of your numbers, but if doubling a number would take it above
100 then keep that number as it is. You win if at least three of the resulting
numbers appear in the draw."*) deterministically precompiles to

```json
{"schemaVersion": 1, "node": {"kind": "match_count_at_least", "value": 3}}
```

which is *"at least three of your own numbers are drawn"* - the doubling and the
guard are simply gone. `interpret` had described the transformation correctly.
Again three identical drafts, again only the reviewer refused them.

H2 and H3 are the same defect class: when the regex layer claims
`SUPPORTED_RULE`, its artifact is used as the candidate and the model's drafting
never happens, so a partial keyword match silently replaces the player's rule.

### H4 - "past" in "past 100" is read as a reference to past turns

N2's player text is PRD 6.7's own guard example. The API rejected it in **4 ms**,
before any model call, with

```json
{"error":"RULE_EXTERNAL_DEPENDENCY",
 "message":"Rule text depends on unavailable external game state. Rewrite it using only your guess and the official draw."}
```

`EXTERNAL_DEPENDENCY_PATTERNS` contains
`/\b(previous|next|future|past|history|streak|yesterday|today|tomorrow|last\s+turn|...)\b/i`,
and *"take it past 100"* uses `past` as a preposition. Proof it is the word and
not the rule: `N2b` is the same sentence with `above 100`, and it reaches the
model (169 s of pipeline) instead of a 4 ms block. The player is told to rewrite
a rule that only ever reads guess and draw.

### H5 - "as many" trips the server ambiguity template on a fully objective rule

N3 (*"exactly as many multiples of three as the draw does"*) has no undefined
threshold. `hasAmbiguousWording` returns true on `as many`, and
`enforceSourceAmbiguity` (`apps/api/src/index.ts:2704-2727`) then **discards the
model's interpretation** and substitutes a fixed template:

```text
clarityNote: The player's wording is subjective or leaves a required threshold undefined.
question   : Which measurable numeric property and threshold should define this condition?
rewrites   : []
```

Third person, no rewrite to accept, and a question the rule has no answer to.
`N3b` is the same rule with *"the same number of multiples of three as"*: the
override does not fire and the request reaches the compiler. Same template hit
V2, where the outcome was right but the copy is still unanswerable, while V1 -
which the model itself flagged - got two specific, player-readable questions.
The template only replaces good model output; it never adds anything.

### H6 - `reduce(product, ...)` does not register as the `product` operation

All three N3b candidates were **behaviourally perfect** (7/7 fixtures, structurally
identical to the reference AST) and all three were rejected with
`INTERPRETATION_MISMATCH: missing operations: product` - while literally
containing `{"kind":"reduce","op":"product", ...}`.

`packages/rule-compiler/src/interpretationCoverage.ts:567` reads

```ts
if (op === "mul" || kind.includes("product")) operations.add("product");
```

For a reduce node `kind` is `"reduce"` and `op` is `"product"`, so neither arm
matches. `min`, `max` (line 653) and `sum` (line 678) are all handled; `product`
is the one reduce op that is not. Offline-reproducible:

```text
analyzeInterpretationCoverage -> missingOperations: ["product"],
                                 requiredOperations: ["minimum","maximum","product"]
```

This is the set-8 H2 defect class (`all_guess`) on a new operation.

### H7 - the reviewer vetoed a correct ranking with arithmetic it got wrong

N4b attempt 0 scored **6/6** on the fixtures and was discarded on

```text
The independent reviewer and draft disagree for guess [1,2,3,4,5,6] and
draw [1,2,3,4,5,6]: reviewer={"eligible":true,"score":16}, draft={"eligible":true,"score":10}
```

For identical guess and draw the sorted positional distance is 0 and the penalty
is 10, so 10 is right and 16 is not. A correct artifact was thrown away on the
reviewer's arithmetic error. (The reviewer is not always wrong: on V2b attempt 0
and N2b it correctly caught genuinely broken drafts.)

### H8 - `PROVIDER_EVIDENCE_UNVERIFIED` still kills correct ranking ASTs

Both remaining V2b candidates were behaviourally correct (6/6) and both were
rejected because the model mis-computed its own worked examples
(*"Declared score does not match the candidate AST"*). Unchanged from set 8,
still worst on ranking folds.

### H9 - the no-exit clarification loop persists

N4's refusal offered exactly one `suggestedRewrites` entry: the player's own
sentence, verbatim. Submitting it changes nothing. `refinementQuestions` was
empty, and the reason text says *"This is a compiler conflict, not a missing
answer from you"* - correct, and it leaves the player with no action.

## What did work

- **N1 compiled correctly twice** (7/7 and 7/7, 93 s and 55 s, zero discarded
  candidates) on a composition no earlier set covers - `sort desc` + `slice` +
  `pairs_forall`. Deterministic-path successes reproduce; this one is
  model-authored and reproduced as well.
- **`interpret` was right in every single case**, including N2's guard, N4's
  penalty term, N3's cross-source count and V1b's three clauses. Every failure in
  this set is downstream of interpretation.
- **Clarification detection is 2/2** and V1's questions were the best copy in the
  whole run.
- **The reviewer blocked both deterministic over-claims** (H2, H3). Without it,
  two unrelated rules would have been frozen.

## Repair addendum (2026-09-11)

The repair targets the shared trust and classification boundaries rather than
adding parsers for N2-N4:

- **H1:** source coverage is no longer waived because a reviewer repeats the
  same omission. The reviewer AST must first preserve every detected source
  value and operation; otherwise it is recorded as unavailable and cannot
  certify or veto the candidate. The API also keeps the approved
  approved `normalizedText` and `officialInterpretation` instead of replacing
  or truncating them with an AST-derived description.
- **H2-H3:** protocol tie/share clauses are removed before deterministic parser
  dispatch, so settlement wording cannot select the winning expression. The
  coverage vocabulary now recognizes guarded conditionals, multiplication,
  membership, sorting, and aggregate distance, preventing partial shortcuts
  from claiming compound rules.
- **H4-H6:** `past` is external only with a history-bearing object (for example,
  past rounds), `as many` is not treated like an unspecified bare `many`, and
  `reduce(op: "product")` now satisfies product coverage.
- **H7-H8:** a source-incomplete reviewer has no veto authority. On genuinely
  novel rules, a later independent provider may corroborate an earlier
  behaviorally identical, source-complete AST and thereby correct only bad
  worked-example arithmetic. Deterministic references, malformed evidence,
  incomplete source spans, and unresolved disagreement remain fail-closed.
- **H9:** compiler retry remains explicit through `generationRetryable`; the
  unchanged submitted sentence is no longer presented as a rewrite.

Regression tests reproduce the severe shared-omission case, guarded transform,
product reduction, misleading tie clause, reviewer arithmetic failure, and
no-op rewrite loop. The offline novelty control now leaves every objective
set-9 rule unsupported with no artifact instead of accepting a partial AST;
the vague cases still request clarification. The live provider corpus was not
re-run, so this addendum makes no claim about stochastic compile rate or
provider latency.
