# Rule Proposal Prompt Test Set 11 - Novel Compositions and the Clarification Loop

Evaluation run of the Tywish rule-proposal agent on four rule compositions that
appear nowhere in sets 1-10, plus two deliberately imprecise rules used to
exercise the clarification loop and its follow-through.

- Date: 2026-09-11
- Source tree measured: the set-10 repair tree, committed during the run as
  `1cc9258` (`git diff HEAD -- packages/ apps/api/src/` is empty against it), with
  every rule package rebuilt first so no stale `dist` was measured
- Provider configuration: OpenRouter, `openai/gpt-oss-120b` (compile, escalation),
  `mistralai/mistral-small-24b-instruct-2501` (independent review),
  `openai/gpt-oss-safeguard-20b` on Groq (guardian), `LLM_TRANSLATE_TO_ENGLISH=false`
- Runner: `apps/api/scripts/rule-preflight-novel-set-11.mjs`
  (`pnpm --filter @tyche/api stress:rules:set11`), round-2 corpus in
  `apps/api/scripts/set-11-round2.json`
- Dedicated `apps/api` process on `127.0.0.1:3099`, no Postgres, so the
  re-proposal gate had no election history to mask a mis-compilation

## Method

Identical to sets 8, 9 and 10, so the numbers are comparable:

- **Four novel prompts plus two deliberately imprecise ones.**
- **Novelty is proved, not asserted.** All six were first pushed through
  `validateAndPrecompileRule` offline: the deterministic parser emits **no
  artifact** for any of the four objective rules (`UNSUPPORTED_RULE`), and
  classifies both imprecise ones as `AMBIGUOUS_RULE`. Nothing here is answered
  by a pre-existing fragment matcher, and the deterministic over-claim class of
  sets 6/7 did **not** reproduce.
- **Expressibility is proved before the agent is judged.** A reference AST was
  written for every objective rule and executed against boundary fixtures:
  **29/29 in round 1** and **33/33 in round 2**, first attempt, no fixture
  revisions. Every refusal below is a policy decision, never a DSL limit.
- **The two-phase player flow**, exactly as `Create.tsx` performs it:
  `phase: "interpret"` -> approve -> `phase: "compile"` with
  `approvedInterpretation`.
- **Behaviour oracle.** Every accepted AST **and every discarded candidate AST**
  is executed against fixtures written from the ORIGINAL prompt. Agent prose is
  never the oracle - `officialInterpretation` is derived from the AST and so
  faithfully describes a wrong rule when the AST is wrong.
- Fixtures are not smoke tests: each set carries the boundary case on both sides
  of every threshold, a discriminator against the most likely misreading, an
  entry-order permutation, and a draw-sensitivity pair that flips the outcome.
- Round 2 answers the agent's own clarification questions for V1/V2, replays N1
  verbatim for stability, and re-submits N2/N3 with only the tie-break sentence
  reworded, which is the single variable the round-1 evidence implicated.

## Corpus

| ID  | Capability axis (absent from sets 1-10)                                                     |
| --- | ------------------------------------------------------------------------------------------- |
| N1  | **cross-place** digit quantification: the TENS digit of the draw must appear as a UNITS digit of the guess (every earlier digit rule matched a place against the same place) |
| N2  | **nearest-element** ranking: `reduce min` over a map of absolute distances to the drawn average (set 9 summed distances, set 8 took a single distance) |
| N3  | **product over a derived array**: `reduce product` of the units digits, gated by a `forall` eligibility clause |
| N4  | **complementary set reductions**: sum of the picks the draw holds against the sum of the ones it does not |
| V1  | **procedural** rule with an undefined loop budget ("too many" removals), where the iteration itself is well defined |
| V2  | **multi-objective** with no weighting: both metrics objective, the trade-off and the tie-break are not |

`digits` on a different place from its counterpart, `reduce min` over a `map`,
`reduce product` over a `digits` array, and `intersection` compared against its
complementary `difference` appear in no reference AST of sets 5-10.

## Results - round 1

| ID  | outcome | fixtures | conf | reason codes | latency | discarded ASTs |
| --- | --- | --- | --- | --- | --- | --- |
| N1 | refused | - | 0.936 | `SUPPORTED_RULE`, `PROVIDER_DISAGREEMENT` | 108 s | 2 |
| N2 | refused | - | 0.7665 | `EXTERNAL_DEPENDENCY`, `SUPPORTED_RULE`, `PROVIDER_DISAGREEMENT`, `AMBIGUOUS_RULE` | 92 s | 3 |
| N3 | **HTTP 400 pre-LLM** | - | - | `RULE_EXTERNAL_DEPENDENCY` | 0.01 s | 0 |
| N4 | **VALID** | **8/8** | 0.936 | `SUPPORTED_RULE` | 103 s | 0 |
| V1 | clarify, 1 question | - | - | - | 11 s | 0 |
| V2 | clarify, 2 questions | - | - | - | 24 s | 0 |

- Novel-rule compilation: **1/4**.
- Clarification detection: **2/2**, both with precise, answerable questions.
- Wrong artifacts frozen: **0**. Every failure was a refusal, never a silently
  wrong rule, so the severe H1/severe-freeze class of sets 9 and 10 did not
  reproduce.
- Of the **5** candidate ASTs the pipeline discarded, **4 were behaviorally
  exact** against the same fixtures the reference AST passes.

## Results - round 2

Round 2 answers the agent's own questions for V1/V2, replays N1 verbatim, and
changes only the tie-break sentence in N2/N3.

| ID  | outcome | fixtures | conf | reason codes | latency | discarded ASTs |
| --- | --- | --- | --- | --- | --- | --- |
| N1r verbatim replay | **VALID** | **8/8** | 0.936 | `SUPPORTED_RULE`, `PROVIDER_DISAGREEMENT` | 101 s | 2 |
| N2b tie clause reworded | refused | - | 0.7665 | `EXTERNAL_DEPENDENCY`, `SUPPORTED_RULE` | 241 s | 3 |
| N3b tie clause reworded | refused | - | 0.8685 | `SUPPORTED_RULE`, `PROVIDER_EVIDENCE_UNVERIFIED`, `PROVIDER_DISAGREEMENT`, `AMBIGUOUS_RULE` | 229 s | 3 |
| V1b removal budget answered | refused | - | 0.8685 | `SUPPORTED_RULE`, `REVIEWER_MISMATCH`, `AGENT_STATEMENT_MISMATCH`, `PROVIDER_DISAGREEMENT` | 237 s | 3 |
| V2b formula answered | refused | - | 0.7665 | `EXTERNAL_DEPENDENCY`, `SUPPORTED_RULE` | 126 s | 3 |

### The clarification loop: detection 2/2, follow-through 0/2

Both imprecise rules were detected correctly and asked precise questions. Neither
answer produced a compiled rule, and the two failures have different causes:

- **V1b** used the agent's **own first suggested rewrite, verbatim**. All three
  candidates were **genuinely wrong** - each compiled a *ranking* for a rule
  whose winning condition is plainly a predicate ("... is at most 1"), and each
  scored **0/7**. The reviewer diagnosed it exactly ("the independent reviewer
  compiled a predicate, while the draft compiled a ranking") and the refusal was
  **correct**. The defect is upstream: the loop offered a rewrite its own
  compiler cannot compile. A reference AST proves the rule is expressible -
  a removal budget of at most one top element is just
  `at(1, sort desc guess) < average(draw)`, **7/7**.
- **V2b** answered both questions with an explicit formula, using the very
  combination the agent proposed ("match count times 100 minus the total") and
  the direction it asked about. All three candidates were **5/5 correct** and all
  three were rejected on `EXTERNAL_DEPENDENCY` alone - see D3. The player's text
  contains no prohibited word; the agent's paraphrase added one.

### Cross-round census of discarded work

Every candidate AST the pipeline threw away, executed against the fixtures:

| prompt | discarded | behaviorally exact | genuinely wrong |
| --- | --- | --- | --- |
| N1 (round 1) | 2 | **2** | 0 |
| N2 (round 1) | 3 | **2** | 1 |
| N1r | 2 | **2** | 0 |
| N2b | 3 | **3** | 0 |
| N3b | 3 | **2** | 1 |
| V1b | 3 | 0 | 3 |
| V2b | 3 | **3** | 0 |
| **total** | **19** | **14** | **5** |

**14 of 19 discarded artifacts were correct.** In five of the eleven live cases
(N1, N2, N2b, N3b, V2b) the pipeline held a correct, executable rule in hand and
refused anyway.

## Findings

### D1 (SEVERE) - `all_draw` coverage is satisfied only by a syntactically bare source, so a whole rule class cannot be accepted

N1's faithful encoding quantifies over a *derived* view of the draw
(`forall` over `digits(tens, draw)`). `collectAstOperations` credits `all_draw`
only when `forall.of.kind === "source"`
([interpretationCoverage.ts:644-651](../packages/rule-compiler/src/interpretationCoverage.ts#L644-L651)),
while the prose cue for `all_draw` fires on "every drawn number ... at least one"
([interpretationCoverage.ts:375](../packages/rule-compiler/src/interpretationCoverage.ts#L375)).
The two never meet, so coverage reports a mismatch on a correct artifact.

Reproducible offline in milliseconds, model-independent:

```text
required ops from text:                   [ 'all_draw', 'digit' ]
ops of the CORRECT derived-array AST:     [ 'digit', 'mod' ]       <- no all_draw
ops of a forall over a bare source:       [ 'all_draw', 'exists_guess' ]
```

It is a class, not one prompt. Every derived view loses the credit:

```text
credits all_draw    forall over source draw
NO all_draw credit  forall over sort(asc, draw)
NO all_draw credit  forall over digits(tens, draw)
NO all_draw credit  forall over distinct(draw)
NO all_draw credit  forall over difference(guess, draw)
NO all_draw credit  forall over filter(draw)
NO all_draw credit  forall over slice(draw, 0, 3)
NO all_draw credit  forall over map(draw)
```

Consequence: whenever the player writes "every/each drawn number ..." and the
faithful AST needs any transformation of the draw, the candidate is rejected with
`INTERPRETATION_MISMATCH` no matter which model produced it or how many times it
retries. It also disqualifies the *reviewer* through the same check
([index.ts:1684-1686](../packages/rule-compiler/src/index.ts#L1684-L1686)), which
is how N1's first attempt died of `SECOND_OPINION_UNAVAILABLE` while passing all
eight of its own stages.

### D2 - the player's own tie clause is still blocked pre-LLM as external game state, and the set-10 repair only covered the nouns set 10 happened to use

N3 never reached a model. `POST /rule-preflight` returned:

```json
{ "error": "RULE_EXTERNAL_DEPENDENCY",
  "message": "Rule text depends on unavailable external game state. Rewrite it using only your guess and the official draw." }
```

The rule uses only guess and draw. The trigger is the word `prize` inside the
player's own tie sentence. `stripProtocolTieBreakClauses` is supposed to remove
such clauses first, but its allowlist keys on a closed noun list -
`same\s+(?:score|count|remainder|total|value)`
([index.ts:610](../packages/rule-compiler/src/index.ts#L610)) - and N3 says
"tickets on the same **product** share the prize equally". One control, changing
only four words:

```text
"... and tickets on the same product share the prize equally."  -> HTTP 400
"... and tickets on the same product split it equally."         -> HTTP 200
```

Set 10 recorded this as D2 and closed it by adding regexes. The defect survives
because each new score noun - product, distance, spread, gap, points - needs
another one. The player-facing message is also wrong: it tells the player to
rewrite using only their guess and the draw, which is exactly what they did.

### D3 (SEVERE) - the agent's own paraphrase manufactures the violation, and no player action can avoid it

N2's *player* text passes the external-dependency gate in both wordings. The
agent's approved interpretation re-states the tie rule as its own sentence:

```text
round 1: If multiple guesses have the same lowest minimum difference, they are
         all winners and share the prize equally.
round 2: If multiple guesses share the same smallest difference, they split the
         prize equally.
```

Round 1 rejected all three attempts with `EXTERNAL_DEPENDENCY`; **round 2, with
the player's tie clause reworded to avoid `prize` entirely, rejected all three
again** - and this time `decision` was the ONLY failing stage on every attempt.
All three candidate ASTs scored **6/6** against the fixtures. Three perfect
artifacts, destroyed by a word the agent itself wrote into the text it then
screened. What the player was told:

```text
The rule depends on information outside the guess and official draw. External
or identity-based data is unavailable to the deterministic rule runtime.
```

That statement is false about the rule the player submitted.

The root cause is narrower than D2's noun list and, unlike D2, unreachable by
the player. `PROTOCOL_TIE_BREAK_CLAUSE_PATTERN` is anchored on
`(?:^|\s*(?:,|;|\band\b)\s*)` and its inner spans are `[^.;]`, so it only
strips a tie clause **attached to the preceding sentence**. A tie clause written
as its own sentence - which is how every agent paraphrase in this set wrote it -
is never stripped. Reproducible offline in milliseconds:

```text
allowed  appended with a comma      "... wins, and tickets on the same score share the prize equally."
allowed  appended with a semicolon  "... wins; tickets on the same score share the prize equally."
BLOCKED  its own sentence           "... wins. If multiple tickets on the same score share the prize equally."
BLOCKED  its own sentence, no 'if'  "... wins. Tickets on the same score share the prize equally."
```

The allowlisted noun does not save it: sentence position alone decides. The
player can read the paraphrase in the approval step but cannot edit it - the
only text they control is their own - so no wording they choose prevents the
agent from re-emitting the clause as a separate sentence.

### D4 - the independent reviewer returned a demonstrably wrong verdict and killed a perfect AST

Round 2's N1 replay recorded:

```text
independent_review FAILED: The independent reviewer and draft disagree for
guess [7,8,9,10,11,12] and draw [1,2,3,4,5,6]: reviewer=LOSE, draft=WIN.
```

The drawn numbers are all single digit, so every drawn tens digit is 0; the
guess contains 10, whose last digit is 0; the rule is satisfied. `WIN` is
correct and the reviewer's `LOSE` is arithmetically wrong. The candidate it
vetoed scores **8/8**. Set 10 recorded the same class (D4, two wrong vetoes);
it reproduced here on a new prompt.

### D5 - `PROVIDER_DISAGREEMENT` is reported with no witness, over candidates that are behaviorally identical

N1's refusal is labelled `PROVIDER_DISAGREEMENT`, yet
`semanticDisagreementWitness` is `null` on both attempts, both candidates'
worked examples verified against their own ASTs, and both score **8/8** on the
same fixtures. There was no disagreement to report; the real causes were the
missing reviewer (D1) and the coverage gap (D1). A player is told the compiler
conflicted with itself when it did not.

### D6 - ranking equivalence compares raw scores, so a monotone rescaling reads as a disagreement

`sampledSemanticsMatch` rejects two rankings whenever any sampled entry's score
differs ([index.ts:6564-6569](../packages/rule-compiler/src/index.ts#L6564-L6569)), even
though a ranking's meaning is its induced winner set. N2's draft scored
`min |6x - sum(draw)|` - the standard way to avoid integer division - while the
reviewer scored `min |x - sum(draw)/6|`. Same winners, scores differing by a
factor of 6, reported as `REVIEWER_MISMATCH`. The runtime already exposes
`resolveRankingWinners`, so the behavioral comparison is available and unused.
(For a draw whose total is not divisible by 6 the two readings can genuinely
diverge, and the scaled one is the more faithful of the two; the pipeline has no
way to prefer it.)

### D7 - a refusal still offers neither a question nor a rewrite

Both N1 and N2 returned `refinementQuestions: []` and `suggestedRewrites: []`
with `coverage: null`. The player-facing summary is honest -

```text
Your wording is clear, but independent compiler attempts produced different
executable readings. This is a compiler conflict, not a missing answer from you.
```

\- but it is a dead end: nothing in the response tells the player what to change,
and for the derived-array encoding of D1 no wording change can ever succeed.
Set 10 recorded this as D7; it persists.

### D8 - refusing costs as much as succeeding

N1 refused in 108 s, N2 in 92 s, and the one success took 103 s. Three compile
attempts plus review plus guardian are spent either way, so a player who hits
D1 or D3 waits the full latency to be told nothing actionable.

### D9 (SEVERE) - when the loop does offer an exit, the exit is a different game

N3b's interpretation was precise and correct:

```text
First, filter all eligible guesses to keep only those where each of the six
guessed numbers is strictly less than the maximum number in the official draw.
For each remaining guess, calculate the product of the last digit (value modulo
10) of each of its six numbers. The guess with the highest product wins.
```

The refusal attached to it:

```text
question: "Should matching compare tens digits, units digits, or either digit?"
rewrite 1: "Win if at least one guessed number shares either its tens digit or
            its units digit with any drawn number, regardless of order."
rewrite 2: "Win if at least one guessed number has the same tens digit as any
            drawn number, regardless of order."
rewrite 3: "Win if at least one guessed number has the same units digit as any
            drawn number, regardless of order."
```

The rule does not *match* digits at all - it multiplies them - and it is a
ranking, while all three rewrites are predicates. A player who accepts any of
them elects a rule unrelated to the one they proposed, under wording the system
presented as a fix for their own rule.

The trigger is a keyword heuristic, not an analysis:
`looksLikeAmbiguousDigitExample`
([index.ts:3164-3179](../apps/api/src/index.ts#L3164-L3179)) fires whenever the
text contains `digit`/`digits` and does **not** contain the literal words
`units` or `tens`. "The last digits of its numbers" is unambiguous English for
the units digit, and it trips the template. The same heuristic is what put
`AMBIGUOUS_RULE` in N3b's reason codes.

Set 10 recorded a weaker version of this as D8 ("the exit asks the player to
arbitrate a compiler bug"). This variant is worse: the exit silently substitutes
the rule.

### D10 - the model's narration of its own artifact destroys correct artifacts

Two of N3b's three candidates were **7/7** correct and were rejected for
`PROVIDER_EVIDENCE_UNVERIFIED`:

```text
attempt 1: Example 0: Declared score does not match the candidate AST. (x4)
attempt 2: Example 0: Ranking examples must declare a finite numeric score. (x3)
```

The AST was right; the model's own worked-example arithmetic about it was wrong.
N3's scores are six-digit products (720, 1080, 20160, 60480), which the compile
model cannot multiply reliably. The gate cannot tell "AST wrong" from "AST right,
narration wrong", yet the deterministic runtime that the harness uses to score
these candidates in microseconds is already in the process. Set 8's repair added
a path to correct a declared example after independent review; it did not fire
here.

## What did work

- **N4 is an unqualified success.** `sum(intersection) > sum(difference)` - a
  composition no earlier set contains - compiled on the first attempt with zero
  retries, confidence 0.936, guardian grounded, an AST **identical** to the
  reference, and **8/8** fixtures including the equality boundary, the
  empty-intersection identity and a three-match discriminator that loses. The
  interpretation prose was precise: "partition its six numbers into two sets:
  those present in the official draw and those absent."
- **Nothing wrong was ever frozen.** Zero wrong artifacts across all cases: the
  pipeline's failure mode in this set is over-refusal, not silent corruption.
- **The deterministic parser did not over-claim once.** All four novel texts
  returned `UNSUPPORTED_RULE` with no artifact, so the set-6/7 over-claim class
  stayed closed on new material.
- **Clarification detection is genuinely good.** Both imprecise rules were
  caught, with `needsClarification: true`, a correct diagnosis of *why*, and
  questions a player can actually answer. V1's note even volunteered the
  strict/non-strict boundary the player had left open:

  ```text
  The phrase 'too many' is subjective and does not define a measurable
  threshold. Additionally, it is unclear whether the comparison for stopping
  removal is 'greater than or equal to' or 'greater than' the average [...]
  ```

- **The compile boundary held.** With clarification still pending, `compile`
  refused with `missing_approved_interpretation` rather than inventing the
  missing intent - the set-8 repair working as designed.
- **The reviewer is not uniformly wrong - it made two correct catches.** On N3b
  it rejected a candidate whose eligibility used `<=` where the rule says
  "below" (`reviewer={"eligible":false}, draft={"eligible":true}` for
  guess = draw = [1,2,3,4,5,6], and that candidate does fail 2/7 fixtures). On
  V1b it correctly identified that the draft had compiled a ranking for a
  predicate, three times. Both vetoes prevented a wrong freeze. The problem is
  precision, not the existence of the veto: the same mechanism destroyed correct
  ASTs in N1, N1r and N2.
- **Reason codes are honest about provenance.** The refusals explicitly
  distinguish "this is a compiler conflict, not a missing answer from you" from a
  clarification request, which is the right thing to tell a player even when the
  underlying diagnosis (D5) is wrong.

## Trust assessment

What this run does support:

- The pipeline **does not freeze wrong rules**. Eleven live cases, zero wrong
  artifacts, and every mis-compiled candidate was caught before acceptance. The
  severe classes of sets 9 and 10 (a frozen AST missing approved clauses, an
  interpretation rewritten to match a wrong AST) did not reproduce.
- Its **clarification detection is trustworthy** on new classes of imprecision:
  2/2 with correct diagnoses and answerable questions.
- Its **deterministic parser no longer over-claims** on novel material: 0 false
  artifacts in 6 offline probes.

What this run does **not** support:

1. **No compile rate can be quoted.** The identical prompt on the identical tree
   refused in round 1 and compiled in round 2 (N1 / N1r). Any single-run number,
   including the 1/4 and 1/5 above, is a sample of a stochastic process.
2. **Over-refusal is the dominant failure mode, and most of it is
   self-inflicted.** 14 of 19 discarded ASTs were correct. The causes are the
   system's own: a coverage extractor that requires a syntactic shape (D1), a
   tie-clause allowlist keyed on sentence position (D2/D3), a score-identity
   equivalence test (D6), and a gate that requires the model to narrate its own
   artifact's arithmetic correctly (D10).
3. **D3 is a trust-level defect, not an inconvenience.** The system rejects a
   player's legal rule because of words the *system* wrote, and then tells the
   player their rule depends on external data. That statement is false, the
   player cannot act on it, and it happened in three of eleven live cases
   (N2, N2b, V2b) destroying eight correct ASTs between them.
4. **D9 is the most dangerous finding.** A refusal offered three rewrites for a
   different game, presented as fixes for the player's own rule. Nothing in the
   response signals the substitution. A player who accepts one elects a rule they
   did not propose - and the accepted rule is the one that pays the prize.
5. **Diagnostics cannot be taken at face value.** `PROVIDER_DISAGREEMENT` was
   reported with a null witness over behaviorally identical candidates (D5), and
   `EXTERNAL_DEPENDENCY` was reported for rules with no external reference
   (D2/D3). Operators triaging these codes will look in the wrong place.
6. **Cost is symmetric.** A refusal costs the same 100-240 s as a success (D8),
   so the failure modes above are not cheap to discover in production.

Ranked by what should be repaired first:

| # | defect | severity | reproducible without a model |
| --- | --- | --- | --- |
| 1 | D3 - the agent's paraphrase manufactures `EXTERNAL_DEPENDENCY` | severe | yes, milliseconds |
| 2 | D9 - the offered rewrite is a different game | severe | yes, milliseconds |
| 3 | D1 - `all_draw` needs a bare source | severe | yes, milliseconds |
| 4 | D2 - the tie-clause noun list | high | yes, milliseconds |
| 5 | D10 - model narration kills correct artifacts | high | no |
| 6 | D6 - score identity instead of winner identity | medium | yes |
| 7 | D4 - wrong reviewer verdicts | medium | no |
| 8 | D5 / D7 / D8 - diagnosis, dead-end refusals, cost | medium | partly |

Four of the top six are deterministic and fixable without touching a model.

## Reproduction

```bash
# reference ASTs and boundary fixtures (no server, no model)
node apps/api/scripts/rule-preflight-novel-set-11.mjs --refs
node apps/api/scripts/rule-preflight-novel-set-11.mjs --refs --round2
# deterministic-parser novelty control
node apps/api/scripts/rule-preflight-novel-set-11.mjs --offline --compact
# live two-phase player flow
PORT=3099 HOST=127.0.0.1 npx tsx apps/api/src/index.ts
pnpm --filter @tyche/api stress:rules:set11 http://127.0.0.1:3099 > round1.ndjson
pnpm --filter @tyche/api stress:rules:set11 http://127.0.0.1:3099 --round2 > round2.ndjson
# execute every DISCARDED candidate AST against the same fixtures
node apps/api/scripts/rule-preflight-novel-set-11.mjs --verify-rejected round1.ndjson
node apps/api/scripts/rule-preflight-novel-set-11.mjs --verify-rejected --round2 round2.ndjson
```

## Repair addendum - 2026-09-11

The repair keeps the compiler fail-closed and changes the earliest boundary that
had enough information to enforce each invariant:

- **D1:** collection lineage, rather than a bare `source` child, now supplies
  `all_draw`/`exists_guess` coverage through derived arrays. The N1 reference
  shape covers every required operation without adding a deterministic parser
  for N1.
- **D2/D3:** tie settlement is recognized independently of sentence position
  and metric noun. Player-authored source is the authority for
  `EXTERNAL_DEPENDENCY`; non-protocol external text introduced by an interpreter
  still blocks as a compiler statement mismatch.
- **D5/D6:** reviewer disagreement and provider disagreement are no longer
  conflated. Rankings are compared by eligible winner sets over deterministic
  multi-ticket cohorts, so score-unit changes do not create false conflicts and
  real changes in winners, ties, direction, or eligibility still produce a
  witness.
- **D9:** a digit clarification requires an unqualified digit *comparison* (or
  an example that splits a played number). Explicit last-digit aggregation does
  not activate it, and rewrite filtering preserves product plus eligibility
  clauses.
- **D10:** when an independent source-complete reviewer agrees with the program,
  the deterministic runtime can reconstruct wrong or omitted declared example
  results. Invalid inputs, incomplete source coverage, unreviewed contradictions,
  and reviewer disagreement remain blocking.
- **V1 follow-through:** compiler skill v16 explicitly maps bounded procedural
  removal counts to predicate order statistics; no test-specific parser was
  added.

D4 remains a stochastic reviewer-quality risk rather than something a regex can
prove away. The existing independent-provider arbitration remains the safe
recovery path, and this repair stops an isolated reviewer veto from being
misreported as provider disagreement. D7/D8 are reduced causally because the
deterministic false refusals now clear earlier gates; unresolved conflicts still
fail closed and no latency claim is made without a new live run.

Verification on the repaired tree: compiler **136/136**, API **258/258**,
typecheck/lint/build green for both packages, `git diff --check` green, and all
set-11 reference ASTs schema-valid with **62/62** executable fixtures. The
offline novelty control still returns no artifact for N1-N4 and keeps V1/V2 in
clarification, proving the repair did not add prompt-specific shortcuts. The
live provider corpus was not rerun, so the original report remains the measured
baseline for stochastic acceptance and latency.
