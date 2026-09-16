# Rule Proposal Prompt Test Set 13 - Untouched Primitives, Paperwork Gates and the Clarification Loop

Evaluation run of the Tywish rule-proposal agent on four rule compositions that
appear nowhere in sets 1-12, plus two deliberately imprecise rules used to
exercise the clarification loop and its follow-through.

- Date: 2026-09-12
- Source tree measured: `6a14b83` (the set-12 repaired tree, whose live
  verification is recorded at the end of `docs/rule-proposal-prompt-test-set-12.md`),
  with `@tyche/rule-schema`, `@tyche/rule-runtime` and `@tyche/rule-compiler`
  rebuilt first so no stale `dist` was measured
- Provider configuration: identical to sets 11-12 - OpenRouter,
  `openai/gpt-oss-120b` (compile, escalation),
  `mistralai/mistral-small-24b-instruct-2501` (independent review),
  `openai/gpt-oss-safeguard-20b` on Groq (guardian), `LLM_TRANSLATE_TO_ENGLISH=false`
- Runner: `apps/api/scripts/rule-preflight-novel-set-13.mjs`
  (`pnpm --filter @tyche/api stress:rules:set13`), round-2 corpus in
  `apps/api/scripts/set-13-round2.json`
- Dedicated `apps/api` process on `127.0.0.1:3099`, no Postgres, so the
  re-proposal gate had no election history to mask a mis-compilation
- Independent suites re-run on the same tree: compiler **142/142**, API **259/259**

## Method

Identical to sets 8-12, so the numbers stay comparable:

- **Four novel prompts plus two deliberately imprecise ones.**
- **Novelty is proved, not asserted.** A census of every reference AST in sets
  5-12 shows four schema primitives used in **none** of them - `eligibleWhen`,
  `not`, `reverse` and `pairs_exists` - so the four objective rules were built
  on exactly those. All six prompts were then pushed through
  `validateAndPrecompileRule` offline: the deterministic parser emits **no
  artifact** for any of the six (`UNSUPPORTED_RULE`).
- **Expressibility is proved before the agent is judged.** A reference AST was
  written for every objective rule and executed against boundary fixtures:
  **32/32 in round 1** and **40/40 in round 2**, first attempt, no fixture
  revisions. Every refusal below is a policy decision, never a DSL limit.
- **Non-degenerate difficulty is proved too**, so no rule can be refused
  legitimately as impossible or always-true. Monte Carlo over 20 000 sampled
  (guess, draw) pairs on the 1..100 board: N1 eligibility **4.18%**, N2
  **51.19%**, N3 **12.87%**, N4 **5.95%**.
- **The two-phase player flow**, exactly as `Create.tsx` performs it:
  `phase: "interpret"` -> approve -> `phase: "compile"` with
  `approvedInterpretation`.
- **Behaviour oracle.** Every accepted AST **and every discarded candidate AST**
  is executed against fixtures written from the ORIGINAL prompt. Agent prose is
  never the oracle.
- Fixtures are not smoke tests: each set carries the boundary case on both sides
  of every threshold, a discriminator against the most likely misreading, an
  entry-order permutation, and a draw-sensitivity pair that flips the outcome.
- Round 2 replays the two refused prompts verbatim, re-submits N4 with the one
  word that blocked it removed, and answers the agent's own clarification
  questions for V1 and V2.

## Corpus

| ID  | Capability axis (absent from sets 1-12)                                                                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| N1  | **eligibility-gated ranking**: the first use of `eligibleWhen` in any set - a qualification clause (`count(intersection) >= 2`) separate from the score (`range_span`)      |
| N2  | **exclusive disjunction**: "exactly one of the two, not both", needing `or(and(A, not B), and(not A, B))`. No earlier set used `not`. `contains` also tests a derived scalar |
| N3  | **two derived subsets of the same side**, cross-quantified: the guess's hits (`intersection`) against its misses (`difference`), on units digits at both binder levels      |
| N4  | **mirror pairing** with `reverse` + `pairs_exists`: the guess in entry order against the draw read backwards, so a perfect ticket in drawn order LOSES                      |
| V1  | **grouping / precedence ambiguity with no undefined term**: every quantity is objective and the sentence still has two arithmetic readings                                   |
| V2  | **undefined statistical referent**: "the middle of the draw" (mean, median or midpoint), "the far side" (which direction), "half your numbers" (exactly or at least three)   |

## Results - round 1

| ID  | outcome                                           | fixtures | conf   | guardian grounded | reason codes                                                                            | latency | discarded ASTs  |
| --- | ------------------------------------------------- | -------- | ------ | ----------------- | ---------------------------------------------------------------------------------------- | ------- | --------------- |
| N1  | refused                                           | -        | 0.8685 | n/a               | `SUPPORTED_RULE`, `AGENT_STATEMENT_MISMATCH`, `PROVIDER_DISAGREEMENT`, `AMBIGUOUS_RULE` | 107 s   | 3 (**1 exact**) |
| N2  | refused                                           | -        | 0.8685 | n/a               | `SUPPORTED_RULE`, `PROVIDER_SPAN_COVERAGE_INCOMPLETE`, `PROVIDER_DISAGREEMENT`          | 143 s   | 3 (**2 exact**) |
| N3  | **VALID**                                         | **8/8**  | 0.936  | true              | `SUPPORTED_RULE`                                                                        | 96 s    | 0               |
| N4  | clarification **forced before any model compiled** | -        | -      | -                 | -                                                                                       | 7 s     | 0               |
| V1  | clarify, 1 canned question                        | -        | -      | -                 | -                                                                                       | 6 s     | 0               |
| V2  | clarify, 2 precise questions + 2 rewrites         | -        | -      | -                 | -                                                                                       | 10 s    | 0               |

## Results - round 2

| ID                            | outcome                                                          | fixtures | conf   | guardian grounded | reason codes                                                                                                                         | latency | discarded ASTs  |
| ----------------------------- | ---------------------------------------------------------------- | -------- | ------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------- | --------------- |
| N1r verbatim replay           | `VALID` **with** `needsClarification` - AST **held, not frozen** | **8/8**  | 0.936  | **false**         | `SUPPORTED_RULE`, `PROVIDER_DISAGREEMENT`                                                                                            | 95 s    | 2 (**1 exact**) |
| N2r verbatim replay           | refused                                                          | -        | 0.8685 | n/a               | `SUPPORTED_RULE`, `PROVIDER_SPAN_COVERAGE_INCOMPLETE`, `PROVIDER_DISAGREEMENT`                                                       | 122 s   | 3 (**2 exact**) |
| N4b the word "mirror" removed | refused                                                          | -        | 0.8285 | n/a               | `SUPPORTED_RULE`, `SECOND_OPINION_UNAVAILABLE`, `INTERPRETATION_MISMATCH`, `AGENT_STATEMENT_MISMATCH`, `PROVIDER_DISAGREEMENT`       | 151 s   | 3 (**2 exact**) |
| V1b clarification answered    | refused                                                          | -        | 0.8685 | n/a               | `SUPPORTED_RULE`, `SECOND_OPINION_UNAVAILABLE`, `PROVIDER_EVIDENCE_UNVERIFIED`, `INTERPRETATION_MISMATCH`, `AGENT_STATEMENT_MISMATCH` | 139 s   | 3 (**3 exact**) |
| V2b clarification answered    | **VALID**                                                        | **8/8**  | 0.936  | true              | `SUPPORTED_RULE`                                                                                                                     | 39 s    | 0               |

### Cross-round census

| metric                                            | set 12 (on `6a14b83`) | set 13       |
| ------------------------------------------------- | --------------------- | ------------ |
| artifacts frozen with a wrong reading             | 0                     | **0**        |
| artifacts frozen at all                           | 7 of 11               | **2 of 11**  |
| correct compilations of a novel objective rule    | 4 of 7                | **1 of 6**   |
| discarded candidates that were behaviorally exact | 8 of 10               | **11 of 17** |
| clarification detection                           | 2/2                   | **2/2**      |
| clarification follow-through                      | 2/2                   | **1/2**      |

Every candidate AST the pipeline threw away, executed against the fixtures:

| prompt    | discarded | behaviorally exact | genuinely wrong |
| --------- | --------- | ------------------ | --------------- |
| N1        | 3         | **1**              | 2               |
| N2        | 3         | **2**              | 1               |
| N1r       | 2         | **1**              | 1               |
| N2r       | 3         | **2**              | 1               |
| N4b       | 3         | **2**              | 1               |
| V1b       | 3         | **3**              | 0               |
| **total** | **17**    | **11**             | 6               |

## Findings

### D1 (SEVERE) - every check on the artifact passes and the artifact is discarded anyway

The set-12 repairs hold on the property they targeted: **no wrong artifact was
frozen in this run**. The cost has landed on the other side. Eleven of the
seventeen discarded candidates are behaviorally exact, and they share one
signature - every stage that *executes or inspects the AST* passes, and the
candidate dies on a claim the model made *about* the AST.

N2 round 1, attempt 0, verbatim stage list for an **8/8** candidate:

```text
schema_validation       | passed
independent_review      | skipped  (the REVIEWER's AST failed the eligibility gate)
provider_evidence       | passed
runtime_bounds          | passed
interpretation_coverage | passed
agent_statement_coverage| passed
runtime_harness         | passed   (coverage 1; difficulty TOO_EASY; win rate 0.5305)
decision                | failed   Candidate rejected: SECOND_OPINION_UNAVAILABLE.
```

Nothing about this artifact is wrong. It was rejected because a *different*
model produced a candidate bad enough to be disqualified, so no second opinion
existed. The set-12 repair that stopped an unfaithful reviewer from vetoing a
correct AST has converted that failure into a different one: an unfaithful
reviewer now *blocks* a correct AST instead of overriding it. The defect moved;
it did not close.

The other two gates in this class:

- `PROVIDER_EVIDENCE_UNVERIFIED` - the model's own worked example is
  arithmetically wrong. N1 attempt 1 scored `max(guess) - min(guess)` and
  declared `score: 0` for `guess [1,2,3,4,5,6]`, where its own AST yields 5. The
  AST is 8/8; the arithmetic in the prose next to it is not.
- `PROVIDER_SPAN_COVERAGE_INCOMPLETE` - the model did not enumerate every source
  clause it consumed. N2 attempt 2 is 8/8 and died on this alone.

These are model self-consistency signals used as proxies for artifact
correctness, while the harness that actually executes the artifact has already
passed it.

### D2 (SEVERE) - the operation-cue coverage check destroyed five exact artifacts, on two new cues

Set-12's R1 was recorded as open: `agent_statement_coverage` requires the AST to
credit every operation cue in the dealer sentence plus the official
interpretation, and a faithful AST that expresses the same thing with a
different node is destroyed. It reproduces here on cues set 12 never hit, and it
is now also firing through `interpretation_coverage`, which screens the
**player's own text**:

| prompt  | required cue                                          | faithful AST actually contains                                     | exact ASTs destroyed |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------ | -------------------- |
| N1, N1r | `membership` ("numbers appear in the official draw")  | `count(intersection(guess, draw)) >= 2`                            | -                    |
| N4b     | `comparison_count` ("at least one of those six comparisons") | `pairs_exists` - an existential, which has no count node     | **2**                |
| V1b     | `sum` ("add the count of your numbers that were drawn") | `arith add` - a scalar addition, not a `reduce sum` over an array | **3**                |

V1b is the clearest instance. Its three candidates are byte-for-byte the
reference AST:

```json
{"kind":"compare","op":"gt",
 "left":{"kind":"arith","op":"add",
   "left":{"kind":"arith","op":"sub",
     "left":{"kind":"reduce","op":"max","of":{"kind":"source","source":"guess"}},
     "right":{"kind":"reduce","op":"min","of":{"kind":"source","source":"guess"}}},
   "right":{"kind":"reduce","op":"count","of":{"kind":"intersection","left":{"kind":"source","source":"guess"},"right":{"kind":"source","source":"draw"}}}},
 "right":{"kind":"lit","value":40}}
```

All three score **8/8**. All three were rejected for "missing operations: sum",
and the reviewer was disqualified on the same cue, so `SECOND_OPINION_UNAVAILABLE`
was added on top. The word "add" in this rule means scalar addition; the checker
maps it to a `reduce sum` node that a correct artifact has no reason to contain.

The player-facing consequence inverts the truth:

```text
The compiled artifact did not preserve every stated value or operation.
The executable rule could pay a different condition from the one you wrote.
```

Said of three artifacts that pay exactly the condition the player wrote.

### D3 (SEVERE) - a precise rule is blocked before any model sees it, by one word in a vague-vocabulary list

N4 never reached a model. `enforceSourceAmbiguity`
([apps/api/src/index.ts:2709](../apps/api/src/index.ts#L2709)) forces
clarification whenever `hasAmbiguousWording(sourceText)` is true, overwriting
whatever the interpreter produced. `AMBIGUOUS_PATTERNS`
([packages/rule-compiler/src/index.ts:596](../packages/rule-compiler/src/index.ts#L596))
lists `mirrors?` among the aesthetic words, and N4 opens with "in mirror order"
- then defines that order exhaustively in the same sentence ("your first number
against the last drawn number, your second against the fifth drawn, and so on").

What the player got, in 7 seconds:

```text
dealerMessage: The player's wording is subjective or leaves a required threshold
               undefined. Please define it before the rule is submitted.
question:      Which measurable numeric property and threshold should define this
               condition?
```

The question cannot be answered, because N4 has no undefined threshold. The copy
also addresses the player in the third person ("The player's wording"), which is
not the dealer voice PRD 6.6 describes.

Reproducible offline in milliseconds, model-independent:

```text
"... against the drawn numbers in mirror order: your first number ..."  -> ambiguous: true
"... against the drawn numbers in reverse order: your first number ..." -> ambiguous: false
```

Round 2 proves the consequence: **N4b is the same rule with "mirror" replaced by
"reverse"**, and it went straight to a full 151-second compile that produced two
behaviorally exact ASTs. One word in a keyword list decided between a 7-second
unanswerable question and a real compile attempt.

Both false positives in this set come from that same list, and they are both
precise phrases: `mirrors?` catches N4's "mirror order", and
`/(?<!\bas\s)\bmany\b/` catches V1's "how many of your numbers were drawn" - a
phrase that states a count exactly.

The same override also fired on **V1**, whose ambiguity is real but *structural*
(two arithmetic groupings). Because the deterministic gate got there first, the
player was asked the same canned "which measurable numeric property and
threshold" question, which does not address the grouping at all. Detection was
credited to a keyword, not to comprehension - and the question the
player actually needed was never asked. Compare V2, where the gate did **not**
fire and the model's own two questions were exemplary.

### D4 (SEVERE) - `AMBIGUOUS_RULE` means "the models disagreed", but the player is told their wording is undefined

N1's compile returned `AMBIGUOUS_RULE`. None of the six texts in that response
trips `hasAmbiguousWording` - not the player's text, the normalized text, the
official interpretation, the dealer message, the added clauses, nor the compile
interpretation. The code is added at
[packages/rule-compiler/src/index.ts:908](../packages/rule-compiler/src/index.ts#L908)
when providers produce two or more divergent readings.

Its player-facing explanation
([apps/api/src/index.ts:339](../apps/api/src/index.ts#L339)) says something else:

```text
whatHappened: The wording leaves part of the winning condition undefined.
whatToChange: Define the missing threshold, comparison direction, position,
              digit meaning, boundary, or tie behavior.
```

And the prose in the very same response says the opposite:

```text
Your wording is clear, but independent compiler attempts produced different
executable readings. This is a compiler conflict, not a missing answer from you.
```

One response tells the player their wording is clear, instructs them to define a
missing threshold, and records a reason code whose published meaning is that
they left something undefined.

### D5 - the guardian pair now produces false negatives

Set 12's D3 was that `guardianGrounded: false` predicted every wrong freeze and
was not used. The repair made a negative guardian verdict plus conflict evidence
blocking. In this run that rule fired once, on **N1r**, whose AST is **8/8
exact**. The result is the new hybrid: `decision: VALID` with
`needsClarification: true`, a correct artifact held rather than frozen.

That is the right direction to fail in, and it is still a false negative on a
correct rule. It is also the only reason N1r differs from N1: the same player
text, on the same build, refused through `AGENT_STATEMENT_MISMATCH` in round 1
and was held through the guardian in round 2. Acceptance remains unstable across
identical input.

### D6 - the clarification follow-through broke on the case the player answered correctly

V2's loop is the model of what this should be. One question set, two precise
questions, two suggested rewrites, and the answered version compiled **8/8 in
39 seconds, zero discarded candidates, guardian grounded, clean
`SUPPORTED_RULE`**.

V1's loop did the opposite. The player was asked a generic question that did not
match their rule's ambiguity (D3), answered the real ambiguity anyway by
spelling out the grouping in full, and was refused - with three behaviorally
exact artifacts thrown away (D2) and a message telling them the artifact "could
pay a different condition from the one you wrote".

Follow-through is therefore **1/2**, and the half that failed failed on a rule
the agent itself had fully understood: its official interpretation of V1b is
exactly right.

### D7 - refusals still carry no exit, and misattribute their own cause

Every refusal in this set returned `refinementQuestions: []` and
`suggestedRewrites: []` - N1, N2, N2r, N4b, V1b, and the held N1r. Set-12's R3
is unchanged.

The attribution is also wrong where the pipeline produced the same correct
reading repeatedly. N2 and N2r tell the player "independent compiler attempts
produced different executable readings" when two of the three attempts were the
*same* correct reading, rejected on span bookkeeping.

### D8 - refusing still costs more than succeeding

The two clean successes took 96 s and 39 s (mean 68 s). The five refusals took
107, 122, 139, 143 and 151 s (mean 132 s). A player whose rule trips D1 or D2
waits roughly twice as long to be told nothing they can act on. Set-12's D9 is
unchanged.

## What did work

- **No wrong artifact was frozen.** Both artifacts this run accepted are
  behaviorally exact against their fixtures. The set-12 D1 repair holds on new
  material.
- **N3 is a genuine success on the hardest composition in the set.** Two derived
  subsets of the same side, cross-quantified on units digits at two binder
  levels, compiled on the first attempt with zero discarded candidates, a
  grounded guardian and clean reason codes - and the agent found a *better*
  shape than the reference, using `contains` over `digits(units, intersection)`
  instead of a nested `exists` with `mod 10` at both levels.
- **V2's clarification is exemplary.** Two questions isolating precisely the
  undefined referent and the undefined direction, a clarity note that names all
  three gaps, and two suggested rewrites that are each a complete, compilable
  rule - and the answered version then compiled 8/8 in 39 s.
- **The reviewer was right when it mattered in round 1.** N1 attempt 0 claimed a
  ticket with zero matches was eligible; the reviewer caught it with the correct
  witness. Its later wrong veto (N2r, where it called a both-clauses-true ticket
  a WIN under an exclusive-or) did not select a wrong artifact - it only
  blocked, which is the set-12 R2 repair working as designed even while R2
  itself persists.
- **The difficulty gate behaved.** It fired only on genuinely degenerate
  candidates (`DIFFICULTY_ALWAYS_TRUE` on N2 attempt 1 and N4b attempt 0, which
  score 3/8 and 4/8) and never on a correct reading.
- **The DSL was never the limit.** 32/32 and 40/40 reference fixtures passed on
  the first attempt, including the four primitives no earlier set had used.

## Reproduction

```bash
pnpm --filter @tyche/rule-schema --filter @tyche/rule-runtime --filter @tyche/rule-compiler build
node apps/api/scripts/rule-preflight-novel-set-13.mjs --refs              # 32/32 reference fixtures
node apps/api/scripts/rule-preflight-novel-set-13.mjs --refs --round2     # 40/40 reference fixtures
node apps/api/scripts/rule-preflight-novel-set-13.mjs --winrate           # non-degenerate difficulty
node apps/api/scripts/rule-preflight-novel-set-13.mjs --offline --compact # novelty: no artifact for any of the six

PORT=3099 HOST=127.0.0.1 npx tsx apps/api/src/index.ts
node apps/api/scripts/rule-preflight-novel-set-13.mjs http://127.0.0.1:3099 > round1.ndjson
node apps/api/scripts/rule-preflight-novel-set-13.mjs http://127.0.0.1:3099 --round2 > round2.ndjson
node apps/api/scripts/rule-preflight-novel-set-13.mjs --verify-rejected round1.ndjson
node apps/api/scripts/rule-preflight-novel-set-13.mjs --verify-rejected --round2 round2.ndjson
```

D3 and D4 reproduce offline in milliseconds and do not need a provider.

## Repair follow-up (2026-09-12)

The first causal repair addresses the deterministic failures rather than changing
the fixtures or permitting an unreviewed artifact to freeze:

- D2: operation coverage now distinguishes existential comparisons from counted
  comparisons. `pairs_exists`, a bounded OR of comparisons, and a filtered count
  can satisfy "at least one"; "exactly one" still requires a count. It also
  distinguishes a scalar "final/resulting total" from a sum over ticket values.
- D1 (partial): a second independent AST can corroborate an earlier matching
  candidate that already has verified source spans and worked examples, even if
  the second model omitted its span list. The ASTs still pass source-coverage,
  runtime and behavioral review. If neither candidate has verified evidence,
  the artifact remains rejected.
- D3: "mirror order" and the counting question "how many" no longer trip the
  vague-word gate; undefined "mirrors the draw" and "many matches" still do.
- D4: player-facing disagreement copy now describes competing compiler readings
  without claiming that the player omitted a numeric threshold. The forced
  ambiguity message also addresses the player directly.

Compiler verification passed 144/144 tests; API verification passed 261/261.
Typecheck, zero-warning lint and build passed for both packages. The reference
ASTs remain 32/32 and 40/40 against the set-13 fixtures. A live N4 replay on
the pre-final build accepted once (8/8) and refused once; the rejected AST was
not retained by the compact result, so that refusal's encoding is unknown.
An explicit-OR encoding was tested separately with an opposing AND case. V1b
was stopped after more than five minutes of provider rate limiting without a
verdict. The local provider configuration differed from this report's original
run. The reported false `sum` cue in V1b's player source is corrected locally,
but D6 needs a completed live replay; a provider paraphrase may still carry
another cue. D1's remaining evidence and reviewer failures, D5, D7 and D8
remain open. No post-repair acceptance-rate claim is made.

## Follow-up repair across D1-D8 (2026-09-12)

The next pass addresses the remaining root causes and keeps the acceptance
boundary fail-closed:

- **D1:** only executable, source-viable candidates can supply a compiler
  opinion or decide a disagreement. Degenerate, unsafe, source-incomplete and
  statement-mismatched attempts remain in diagnostics, but cannot pose as an
  independent reading. The prior repair still requires verified evidence on at
  least one of two corroborating candidates; no-evidence cases remain blocked.
- **D2/D6:** a sum of two derived scalar measures (for example, the span and the
  count) requires `arith add`, while a sum of ticket values still requires an
  array reduction. This covers provider paraphrases as well as the player's
  original V1b wording without treating every occurrence of `add` as a sum.
- **D3:** the prior precise mirror/count wording exclusions remain covered by
  tests.
- **D4/D7:** differing provider ASTs establish a compiler conflict, not source
  ambiguity. `AMBIGUOUS_RULE` is no longer inferred from provider disagreement;
  the player gets the existing generation retry action instead of a question
  alleging a missing threshold. Distinct AST readings remain in the audit log.
  Compiler-only refusals intentionally have no invented clarification questions
  or rewrites, as required by PRD 6.15.
- **D5:** a guardian veto now returns `decision: INVALID`, never a `VALID`
  artifact that is nevertheless held, and records
  `GUARDIAN_FIDELITY_CONFLICT` as the blocking reason. Only conflicts recorded
  in the final compiler result pair with the guardian verdict; repaired earlier attempts remain
  diagnostic history. Where the final conflict is real, the veto remains. An
  exact fixture AST is not by itself proof that an untested player rule is safe.
- **D8:** repeat-repair detection fingerprints the executable AST and failure
  reasons. Changes only to model-written spans, examples or prose no longer buy
  another identical repair call. Provider transport delays remain outside this
  deduplication and need live latency measurement.

This patch does not claim that every stochastic refusal is now accepted. It
removes deterministic false cues, false ambiguity attribution and a redundant
retry class, while retaining the review/evidence gates where the program cannot
prove fidelity. A complete acceptance-rate and refusal-latency conclusion
requires another live corpus under the report's original provider configuration.
The follow-up V1b live replay on the local configuration produced no result
after more than five minutes and was stopped; it cannot establish whether V1b
now freezes or how long a completed refusal takes. The server was stopped too.

## Live verification of the D1-D8 repairs (2026-09-13)

The two repair sections above deliberately made no live claim: both record that
the corpus was never replayed under this report's provider configuration, and
that D1, D5, D7 and D8 remained open. This section supplies that measurement.

- Tree: the working tree on top of `6a14b83` carrying both repair passes
  (`apps/api/src/index.ts`, `packages/rule-compiler/src/index.ts`,
  `packages/rule-compiler/src/interpretationCoverage.ts` and their tests)
- Provider configuration **byte-identical** to the original set-13 run, so the
  numbers are comparable
- Rule packages rebuilt first; compiler **145/145** and API **262/262** pass,
  confirming the repair entries' own regression claims
- References re-verified: **32/32** round 1 and **40/40** round 2, first attempt
- The deterministic parser still emits **no artifact** for any of the six
  prompts, so the corpus is still novel against this tree

### Outcome per case

| ID  | set-13 baseline                | repaired tree                                   |
| --- | ------------------------------ | ------------------------------------------------ |
| N1  | refused, 107 s, 1 exact lost   | **VALID 8/8**, 94 s - the reference AST frozen   |
| N2  | refused, 143 s, 2 exact lost   | refused, **203 s**, 1 exact lost                 |
| N3  | VALID 8/8, 96 s                | **VALID 8/8**, 72 s                              |
| N4  | blocked pre-model in 7 s       | refused after **1231 s**, **6 exact ASTs lost**  |
| V1  | clarify in 6 s (canned question) | refused after **342 s**, **no question at all** |
| V2  | clarify, 2 precise questions   | 2 precise questions (after a provider retry)     |
| N1r | VALID 8/8 held, not frozen     | **VALID 8/8 frozen**                             |
| N2r | refused, 2 exact lost          | **VALID 6/8 - A WRONG ARTIFACT FROZEN**          |
| N4b, V1b, V2b | refused / refused / VALID 8/8 | **not measured** - provider outage      |

Discarded candidates executed against the fixtures: **12 in round 1, 8 of them
behaviorally exact**; **5 in round 2, 3 of them exact**.

The last row is a measurement gap, not a result. Partway through round 2 the
interpret/translate model `qwen/qwen3.8-27b` began returning
`RULE_AGENT_UNAVAILABLE` (HTTP 502) provider-side. N4b, V1b and V2b failed at
the interpret phase in about one second each, twice, and a direct probe
reproduced the 502 at the `translating` stage. No verdict about those three is
claimed here. D6 therefore remains unmeasured on this tree.

### Verdict per defect

| defect | status after the repairs | evidence |
| --- | --- | --- |
| D1 discarded exact artifacts | **open, and now harmful** | N2 and N2r still lose exact ASTs to `PROVIDER_SPAN_COVERAGE_INCOMPLETE`; the corroboration rule then froze a **wrong** artifact (below) |
| D2 `comparison_exists` half | **closed** | generalizes to four phrasings outside the regex |
| D2 `scalar_add` half | **instance-level only** | four natural wordings still demand `reduce sum` |
| D3 ambiguity keywords | **closed** | precise `mirror order` / `how many` pass; five vague controls still caught |
| D4 attribution | **closed, with a consequence** | `AMBIGUOUS_RULE` no longer inferred from divergence - see the V1 regression |
| D5 guardian | **closed as a result shape, and now unsafe** | no `VALID`-but-held hybrid remains; but `guardianGrounded:false` was ignored on the wrong freeze |
| D6 clarification follow-through | **unmeasured** | provider outage |
| D7 refusal exits | **open** | every refusal still returns empty `refinementQuestions` and `suggestedRewrites` |
| D8 latency and repeat repair | **open, and worse** | dedup provably failed; N2 143->203 s, N4 151->1231 s, V1 6->342 s |
| set-12 D4 value coverage | **NOT closed** | six exact ASTs lost to `missing values: 6` |

### R1 (SEVERE, new) - a wrong artifact is frozen again, and its description contradicts it

The set-13 baseline froze **zero** wrong artifacts. On the repaired tree N2r
freezes one. The accepted AST is a plain disjunction:

```json
{"kind":"or","clauses":[
  {"kind":"compare","op":"gt",
   "left":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"guess"}},
   "right":{"kind":"reduce","op":"sum","of":{"kind":"source","source":"draw"}}},
  {"kind":"contains","array":{"kind":"source","source":"draw"},
   "value":{"kind":"reduce","op":"max","of":{"kind":"source","source":"guess"}}}]}
```

The player-facing description frozen with it states the opposite:

```text
The guess wins if Condition A and Condition B have opposite truth values
(one true, one false). It loses if both are true or both are false.
```

It fails exactly the two exclusive-or discriminator fixtures (`5/8` -> `6/8`),
was accepted at confidence **0.936** with a clean `SUPPORTED_RULE` reason list,
and **two 8/8 behaviorally exact candidates were discarded in its favour** on
span bookkeeping and a wrong reviewer verdict.

`guardianGrounded` was **false** on this freeze, exactly as set-12's D3 said it
would be on every wrong freeze. The D5 repair pairs the guardian veto with a
compiler conflict recorded in the final result; no conflict was recorded, so the
one signal that identified the corruption was discarded. This is the set-12 D1
class reopened by the D1 corroboration relaxation.

### R2 (SEVERE, new) - nothing detects structural ambiguity any more

V1's ambiguity is structural: `(high - low) + matches` versus
`high - (low + matches)`. Two independent nets used to catch it, and both were
removed by the repairs:

- the `\bmany\b` keyword, excluded by D3 so that "how many" reads as a count;
- `AMBIGUOUS_RULE` on provider divergence, removed by D4.

The model does not supply the missing detection. Across the 9 candidates it
produced, **8 encode the same reading** `(high - low) + matches` and one is
unexecutable; there is no divergence left to notice, and the interpreter
returned `clarificationQuestions: []` (reproduced in a separate direct probe,
where the dealer answered "you win if your number range plus your match count
exceeds 40" with no question).

The rule was not frozen only because an unrelated `AGENT_STATEMENT_MISMATCH`
blocked it. **If that coverage bug were fixed, V1 would silently freeze one
arbitrarily chosen reading of an ambiguous rule**, which PRD 6.6 forbids
("Vague rules must not be accepted silently"). Clarification detection fell from
**2/2 to 1/2**, and the case that regressed now costs 342 s instead of 6 s.

### R3 (SEVERE) - set-12's D4 value coverage was never closed

Set 12's live verification recorded D4 as "closed for values, open for
operations". N4 disproves that. It produced **six consecutive 8/8 ASTs**, all
rejected with:

```text
The candidate AST does not keep every load-bearing claim in the agent
interpretation (missing values: 6).
```

The dealer's own interpretation reads "compare the value at position i with the
value at position 7-i ... for all i from 1 to 6", and the faithful
`pairs_exists` AST contains no numeric literal at all. Reproducible offline in
milliseconds and model-independent:

```text
live dealer + official text            -> requiredValues [1, 6]   astValues []
"any of these six pairwise comparisons" -> requiredValues []       astValues []
"any position ... of the reversed draw" -> requiredValues []       astValues []
```

No player wording can prevent it: the sentence that fails the check is written
by the dealer. D3's repair converted this case from a 7-second unanswerable
question into a 20.5-minute refusal.

### R4 - the D8 deduplication does not fire

Three of N4's attempts are **exact duplicates of attempt 2** under the repair's
own fingerprint definition (candidate AST plus sorted reason codes):

```text
att1 153a838c6d  new
att2 97f21bb4d1  new
att3 97f21bb4d1  DUPLICATE of att2
att4 9d7e14582a  new
att5 97f21bb4d1  DUPLICATE of att2
att6 97f21bb4d1  DUPLICATE of att2
```

Each duplicate was behaviorally exact and each cost a full provider round trip
inside a 1231-second refusal.

### What the repairs did achieve

- **N1 is fixed and stable.** Both rounds now freeze the reference
  `eligibleWhen` ranking 8/8 - the first correct freeze of an eligibility-gated
  ranking in any set - where the baseline refused in round 1 and held an
  unfrozen artifact in round 2.
- **D3 is closed cleanly at the source**, with no over-correction: all five
  vague controls still trip the gate.
- **D4's attribution is correct now**: the player is told the compiler produced
  several readings rather than that their wording omitted a threshold.
- **The `VALID`-with-held-artifact contradiction is gone** (N1r freezes).
- **N3 is unaffected and faster** (96 s -> 72 s).
- **`comparison_exists` generalizes**, unlike the `scalar_add` half.

### Conclusion

The repairs closed the three deterministic, offline-reproducible defects (D3,
D4's attribution, and half of D2) and fixed N1. They did not close the dominant
failure mechanism: coverage cues derived from the dealer's own prose still
destroyed **11 behaviorally exact artifacts** across the two rounds, and
refusal latency rose on every case that still refuses.

Two new severe regressions outweigh the gains. A wrong artifact is frozen again
after set 13 had eliminated that class entirely, with the one signal that caught
it (`guardianGrounded: false`) deliberately subordinated; and structural
ambiguity is now undetected by any mechanism, with a silent freeze prevented
only by an unrelated bug. On this evidence the corrections are **not
sufficient**, and two of them made the system less safe than the tree they
repaired.

## Causal follow-up after live verification (2026-09-13)

This change targets the first violated invariant at each deterministic failure
boundary; it does not revise the historical live measurements above.

- **R1:** `guardianGrounded: false` now blocks freezing even after player approval
  and without a compiler disagreement. More importantly, coverage now requires
  an actual exclusive disjunction when the source says exactly one of two
  statements is true. A plain `or` cannot pass this gate; both canonical XOR
  encodings pass. This protects N2r independently of the guardian's stochastic
  verdict. The guardian can still reject a faithful artifact, so this is a
  safety correction, not an acceptance-rate claim.
- **R2:** ungrouped subtraction followed by addition is detected from the
  source sentence before model compilation. The dealer asks which grouping the
  player intends; explicit sequencing and parentheses around the operation
  remain clear. Ordinal words and unrelated parentheses do not mask it.
- **R3:** a numeric range scoped to positions or a bound index is excluded from
  ticket-value coverage. A genuine range of ticket values remains required.
  The formerly rejected N4 dealer wording now passes coverage against an
  executable mirror-pair AST.
- **R4/D8:** repeated invalid executable ASTs with the same artifact faults stop
  provider arbitration. Reviewer and missing-second-opinion codes are excluded
  from the fingerprint because their presence depends on the attempt slot, not
  the candidate program. The API repair loop uses the same distinction.
- **D2/D6:** scalar sums of derived measures and imperative additions of a
  derived count now require `arith add`; sums of ticket numbers still require
  `reduce sum`. Several paraphrases beyond the original V1b sentence are
  covered.

Verification: compiler **149/149** tests and API **263/263** tests passed;
typecheck, zero-warning lint and build passed for both packages. Reference ASTs
remain **32/32** and **40/40** against the set-13 fixtures. The offline parser
still emits no AST for the four novel objective rules, so these results are not
an offline acceptance claim. No live provider corpus was replayed after this
follow-up. D1's span/evidence and reviewer-quality refusals, D6's live
follow-through, D7's player exit on each refusal, and D8's measured latency
remain open until an end-to-end replay. No milestone was ticked.

The attempted focused replay exposed a measurement bug in this set's runner:
when `interpret` returned no interpretation, it still sent an unapproved
`compile` request and classified the resulting `missing_approved_interpretation`
400 as `CLARIFY`. That could falsely pass a vague case. The runner now sends
`compile` only after a real approvable interpretation and classifies a missing
interpretation as `BLOCK`. Retried N2 and V1 both stopped during the
provider-dependent `translating` stage with no interpretation, in under one
second each; neither reached compilation, so neither measures the repairs.
The dedicated API process was stopped after this check. The historical live
tables above are unaffected because their recorded interpretations were
present for the scored cases; the three known outage cases remain unmeasured.


## Continued causal repair and reliability audit (2026-09-16)

The September 13 statement that no replay followed the causal changes is
superseded by the measurements below. These are sequential development probes,
not a single unchanged-build benchmark and not proof that all defects are closed.
The configured interpretation model failed during translation; subsequent probes
used the process-only override `LLM_MODEL_INTERPRET=openai/gpt-oss-120b`. The
repository `.env` was not changed. Latencies are not directly comparable to the
original provider configuration.

### Additional causal corrections

- A selected novel AST must itself have an eligible independent corroborating
  reading. Merely having two completed provider attempts is insufficient.
  Missing corroboration leaves no artifact and reports
  `SECOND_OPINION_UNAVAILABLE`.
- Source indices such as `guess[1]` and `draw[6]` are positions, not mandatory
  ticket values. Scalar addition followed by "the sum" does not require a
  collection reduction; an explicit sum of a collection still does.
- Independent matching viable provider ASTs can corroborate one another despite
  incomplete span bookkeeping. A prior eligible reviewer disagreement cannot be
  overridden by repeating an unverified draft. Runtime, source coverage, and
  reviewer eligibility checks remain required. Agreement is evidence, not a
  mathematical proof of arbitrary natural-language equivalence.
- Resolved provider disagreement remains in diagnostic history but no longer
  sets the unresolved-disagreement flag. A negative guardian verdict still
  blocks freezing independently of that flag.
- Ranking descriptions now retain `eligibleWhen`, including the no-eligible-ticket
  outcome; unrelated ranking shortcuts cannot silently discard eligibility.
  The supported nested miss/hit digit relation is rendered without binder-depth
  jargon. These rendering changes describe the AST; they do not alter execution.
- The artifact-to-promise guardian policy permits omission only of protocol
  defaults (equal sharing among ties and no winner when none is eligible).
  Eligibility, scoring, quantifiers, thresholds, ordering, and winner conditions
  must all remain present. The source-to-interpretation check remains strict.
- Final review removed a proposed regex shortcut that rebuilt an approved
  interpretation from the Dealer's conversational message and assumed
  `max(guess)-min(guess)`. It could lose clauses or change the source. Without a
  deterministic proof, the API preserves the clarification instead.
- Existential comparison coverage now also recognizes equal mirrored pairs,
  without narrowing the pre-existing recognition of comparisons with other
  operators. Both `pairs_forall` substitution and exact-count substitution remain
  rejected where appropriate.
- Compiler skill v18 teaches eligibility separately from ranking score. Because
  its examples now include this corpus shape, subsequent success is a regression
  result, not an unseen-prompt generalization result. A keyword-only assertion
  added with the example was removed during review.

### Observed development probes

| Case | Result | Executable fixtures | Latency |
| --- | --- | --- | --- |
| V1b after scalar-sum correction | VALID | 8/8 | 64.096 s |
| N2 | VALID | 8/8 | 239.431 s |
| N3 before readable nested relation | REFUSED, guardian conflict | 8/8 | 133.406 s |
| N3 after rendering correction | VALID | 8/8 | 74.145 s |
| N1, subsequent probe | REFUSED, rejected candidate readings | no accepted AST | 38.476 s |
| N4 after pair-existence coverage correction | VALID | 8/8 | 108.833 s |

The following **complete five-case replay** on the previous development build
must not be hidden by selecting successful individual probes:

| Case | Result | Executable fixtures | Latency |
| --- | --- | --- | --- |
| N1r | REFUSED: statement/reviewer/interpretation mismatch | no AST | 49.612 s |
| N2r | VALID | 8/8 | 111.086 s |
| N4b | REFUSED: evidence, interpretation, second opinion | no AST | 114.424 s |
| V1b | VALID | 8/8 | 65.502 s |
| V2b | REFUSED: guardian fidelity conflict | 8/8 | 62.915 s |

Thus only **2/5 passed** that replay. A correct candidate refused by a safety
check is still a product failure. It is not a wrong frozen artifact, and 8/8
fixtures alone do not authorize bypassing the safety check.

Final local verification after the review corrections: compiler **152/152** and
API **265/265** tests; typecheck, zero-warning lint, and build passed in the
required order for both packages. Reference fixtures passed **32/32 + 40/40**.
No milestone is ticked; reliability, guardian false refusals, and latency remain
open pending reproducible end-to-end evidence.


### Final-build investigation of N1r and N4b

The first September 16 replay (after safety review, before the two corrections
below) returned N1r REFUSED in 49.784 s, N4b REFUSED in 98.707 s, and V2b VALID
8/8 in 94.562 s. Detailed rejected-candidate execution exposed two additional
root causes that compact verdicts had hidden:

1. **N1r was not a failed model generation.** The deterministic shortcut selected
   `match_count_at_least(2)` from the approved eligibility-plus-ranking text, so
   the model never generated the candidate. Both rejected candidates were this
   predicate, which cannot implement any of the eight ranking fixtures. The
   operation audit now requires a ranking result for explicit comparative
   selection across tickets. It inspects the intact source before clause cleanup
   replaces commas with periods. Tests cover the exact normalized sentence,
   different thresholds and score properties, and ordinary per-ticket predicates
   including a highest-number condition that must not imply ranking.
2. **N4b's final candidate was faithful.** It used `exists(pairs_map(..., ite(eq,
   1, 0)), elem == 1)`, passed independent review and evidence checks, and executed
   8/8 fixtures, but coverage did not recognize this existential encoding. The
   audit now recognizes true-flag selection with `== 1`, `>= 1`, or `> 0`.
   Executable tests retain rejection of `forall`, false-flag selection, and
   invalid binder scope. The intermediate `pairs_forall` candidate actually
   failed four fixtures and remains rejected.

These are causal routing/representation corrections, not additional retries or
permission to accept an unverified AST. After them, compiler 152/152 and API
265/265, typecheck, lint and build were rerun successfully.


The restarted API then accepted **N1r and N4b, both 8/8**, with positive guardian
verdicts and only `SUPPORTED_RULE` in the final reason codes. N1r took **122.539 s**;
N4b took **76.262 s**. Both exercised the real interpretation -> approval ->
compilation path. This demonstrates the repaired failures on those inputs,
without erasing prior failures or claiming that model reliability/latency is
solved. A complete final-version corpus replay follows below.


### Complete eleven-case replay and remaining defects

The same restarted API build was used for all eleven cases below. N1r/N4b were
run first, then round 1, then the remaining round-2 cases, without code changes
between them. Each row is one run; successful earlier probes do not replace
failed rows here.

| Case | Outcome | Fixtures | Latency |
| --- | --- | --- | --- |
| N1-eligible-then-tightest-span | REFUSED | - | 436.161 s |
| N2-exactly-one-of-two | VALID | 8/8 | 172.543 s |
| N3-miss-shares-digit-with-hit | REFUSED | - | 126.317 s |
| N4-mirror-position-match | VALID | 8/8 | 25.454 s |
| V1-vague-grouping | CLARIFY | - | 8.596 s |
| V2-vague-middle-of-draw | CLARIFY | - | 10.779 s |
| N1r-verbatim-replay | VALID | 8/8 | 122.539 s |
| N4b-same-rule-without-the-word-mirror | VALID | 8/8 | 76.262 s |
| N2r-verbatim-replay | REFUSED | - | 147.840 s |
| V1b-grouping-answered | REFUSED | - | 75.495 s |
| V2b-clarification-answered | VALID | 8/8 | 78.680 s |

Result: **7/11 cases passed** (five accepted rules and two expected
clarifications), **40/40 executable fixtures passed on accepted artifacts**, and
**zero wrong artifacts were frozen in these fixtures**. Four objective cases
were refused. This is not complete defect closure.

- **N1:** some candidates omitted eligibility and were correctly blocked. The
  faithful candidate declared eight incorrect worked-example scores and was
  rejected for evidence failure. The deterministic routing defect is repaired,
  but reliable provider evidence generation remains open.
- **N3:** the faithful candidate lacked an eligible independent second opinion;
  the other candidate mixed ticket values with digits and failed its own example.
  Independent corroboration remains unavailable in this run.
- **N2r:** the faithful XOR candidate lacked complete spans/second opinion; an
  inclusive OR candidate was correctly rejected. A subsequent call produced no
  usable AST. Evidence and provider availability remain open.
- **V1b:** all four discarded ASTs were the same faithful scalar-addition rule.
  The dealer phrase "add the number of guessed values ... this sum" was not
  recognized as adding a count. A final local correction recognizes singular
  "the number of" as a scalar count while preserving collection-sum requirements
  for plural "the numbers" and explicit "sum of". The exact stored Dealer message
  plus official interpretation now passes coverage against **all four recorded
  ASTs**. Regression controls and both package verification ladders passed after
  this correction. **No new live run was performed for this last change.**

Provider logs recorded upstream HTTP **429** rate limiting and HTTP **402** for
insufficient credits for a configured compilation request (16,384 requested
output tokens versus 13,555 affordable). No further paid calls were made after
this was inspected. These errors affect reliability and latency, but do not
explain away the deterministic V1b coverage defect, which was repaired locally.
The maximum observed latency was **436.161 s** for N1, so D8 is still open.

Final verification: compiler **152/152**, API **265/265**, typecheck, lint and
build passed after the final scalar-count correction. The full live table
predates that last correction and must not be described as an all-green test of
the final tree. The dedicated API and disposable verification database were
stopped; the user's existing PostgreSQL container was left running. No milestone
checkbox was changed. Remaining closure work requires reliable provider evidence
and independent review, affordable provider access, and a fresh full replay.
