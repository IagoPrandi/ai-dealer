# Rule Proposal Prompt Test Set 12 - Novel Compositions, Silent Corruption and the Clarification Loop

Evaluation run of the Tywish rule-proposal agent on four rule compositions that
appear nowhere in sets 1-11, plus two deliberately imprecise rules used to
exercise the clarification loop and its follow-through.

- Date: 2026-09-11
- Source tree measured: `2e41d19` (the set-11 causal-repair tree;
  `git diff HEAD -- packages/ apps/api/src/` is empty against it), with
  `@tyche/rule-schema`, `@tyche/rule-runtime` and `@tyche/rule-compiler`
  rebuilt first so no stale `dist` was measured
- Provider configuration: identical to set 11 - OpenRouter,
  `openai/gpt-oss-120b` (compile, escalation),
  `mistralai/mistral-small-24b-instruct-2501` (independent review),
  `openai/gpt-oss-safeguard-20b` on Groq (guardian), `LLM_TRANSLATE_TO_ENGLISH=false`
- Runner: `apps/api/scripts/rule-preflight-novel-set-12.mjs`
  (`pnpm --filter @tyche/api stress:rules:set12`), round-2 corpus in
  `apps/api/scripts/set-12-round2.json`
- Dedicated `apps/api` process on `127.0.0.1:3099`, no Postgres, so the
  re-proposal gate had no election history to mask a mis-compilation

## Method

Identical to sets 8-11, so the numbers are comparable:

- **Four novel prompts plus two deliberately imprecise ones.**
- **Novelty is proved, not asserted.** All six were first pushed through
  `validateAndPrecompileRule` offline. The deterministic parser emits **no
  artifact** for any of the four objective rules (`UNSUPPORTED_RULE`). It did
  **not** stay silent on the imprecise pair - see D5, where it emitted a
  confident artifact for a rule it does not understand.
- **Expressibility is proved before the agent is judged.** A reference AST was
  written for every objective rule and executed against boundary fixtures:
  **30/30 in round 1** and **38/38 in round 2**, first attempt, no fixture
  revisions. Every refusal below is a policy decision, never a DSL limit.
- **The two-phase player flow**, exactly as `Create.tsx` performs it:
  `phase: "interpret"` -> approve -> `phase: "compile"` with
  `approvedInterpretation`.
- **Behaviour oracle.** Every accepted AST **and every discarded candidate AST**
  is executed against fixtures written from the ORIGINAL prompt. Agent prose is
  never the oracle - and in this set that distinction is the whole story: four
  accepted artifacts carry a player-facing description that is correct while the
  artifact under it is not.
- Fixtures are not smoke tests: each set carries the boundary case on both sides
  of every threshold, a discriminator against the most likely misreading, an
  entry-order permutation, and a draw-sensitivity pair that flips the outcome.
- Round 2 answers the agent's own clarification questions for V1/V2, replays N1
  verbatim for stability, and re-submits N2/N4 with the misread aspect stated
  explicitly in the player's own words.

## Corpus

| ID  | Capability axis (absent from sets 1-11)                                                                                                                                                    |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| N1  | **residue-class diversity across both sides**: `distinct` over a `map` of `mod`, counted for the guess and for the draw and compared (sets 6/8 counted distinct digits of the guess alone) |
| N2  | **minimax** nearest-miss ranking: `reduce max` over a `map` whose element expression is itself a `reduce min` over a second `map` (binder depth 2)                                         |
| N3  | **gap vector**: `pairs_map` used as a self-zip of two slices of the same sorted array, collapsed with `range_span == 0` to say "equally spaced"                                            |
| N4  | **mutual set equality** of a derived view: two `forall`/`exists` clauses in opposite directions over `digits(units, ...)` of both sides                                                    |
| V1  | **partially specified**: one fully objective clause disjoined with a vague one - tests whether the agent isolates the vague half                                                           |
| V2  | **negation/quantifier scope** over an unnamed threshold ("none of your numbers sits too far from every drawn number")                                                                      |

## Results - round 1

| ID  | outcome                                    | fixtures | conf   | guardian grounded | reason codes                                                                                                                                 | latency | discarded ASTs |
| --- | ------------------------------------------ | -------- | ------ | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- | -------------- |
| N1  | refused                                    | -        | 0.8685 | n/a               | `SUPPORTED_RULE`, `AGENT_STATEMENT_MISMATCH`                                                                                                 | 239 s   | **9**          |
| N2  | **VALID, WRONG**                           | **5/6**  | 0.936  | **false**         | `SUPPORTED_RULE`, `PROVIDER_DISAGREEMENT`                                                                                                    | 47 s    | 1              |
| N3  | refused                                    | -        | 0.936  | n/a               | `SUPPORTED_RULE`, `DIFFICULTY_IMPOSSIBLE`, `PROVIDER_DISAGREEMENT`, `AMBIGUOUS_RULE`                                                         | 125 s   | 3              |
| N4  | **VALID, WRONG**                           | **5/8**  | 0.936  | **false**         | `SUPPORTED_RULE`, `PROVIDER_DISAGREEMENT`                                                                                                    | 48 s    | 1              |
| V1  | clarify, 3 questions                       | -        | -      | -                 | -                                                                                                                                            | 9 s     | 0              |
| V2  | clarification **suppressed**, then refused | -        | 0.8685 | n/a               | `SUPPORTED_RULE`, `REVIEWER_MISMATCH`, `PROVIDER_EVIDENCE_UNVERIFIED`, `AGENT_STATEMENT_MISMATCH`, `PROVIDER_DISAGREEMENT`, `AMBIGUOUS_RULE` | 268 s   | 6              |

- Novel-rule compilation: **0/4 correct**. Two refusals and **two wrong
  artifacts frozen**.
- Clarification detection: **1/2**. V1 was caught with three precise questions;
  V2's detection was overridden by the server (D6).
- Of the **14** candidate ASTs the pipeline discarded, **11 were behaviorally
  exact**.

## Results - round 2

Round 2 answers the agent's own questions for V1/V2, replays N1 verbatim, and
re-submits N2/N4 with the misread aspect stated explicitly by the player.

| ID                               | outcome          | fixtures | conf  | guardian grounded | reason codes                              | latency | discarded ASTs      |
| -------------------------------- | ---------------- | -------- | ----- | ----------------- | ----------------------------------------- | ------- | ------------------- |
| N1r verbatim replay              | **VALID**        | **8/8**  | 0.936 | true              | `SUPPORTED_RULE`, `PROVIDER_DISAGREEMENT` | 57 s    | 2                   |
| N2b "regardless of order" stated | **VALID, WRONG** | **5/6**  | 0.936 | **false**         | `SUPPORTED_RULE`, `PROVIDER_DISAGREEMENT` | 121 s   | 1 (**6/6 correct**) |
| N4b set equality stated          | **VALID, WRONG** | **5/8**  | 0.936 | **false**         | `SUPPORTED_RULE`, `PROVIDER_DISAGREEMENT` | 51 s    | 1 (**8/8 correct**) |
| V1b clarification answered       | **VALID**        | **8/8**  | 0.936 | true              | `SUPPORTED_RULE`                          | 148 s   | 0                   |
| V2b clarification answered       | **VALID**        | **8/8**  | 0.936 | true              | `SUPPORTED_RULE`                          | 34 s    | 0                   |

### Cross-round census

| metric                                            | set 11               | set 12       |
| ------------------------------------------------- | -------------------- | ------------ |
| artifacts frozen with a wrong reading             | **0**                | **4**        |
| correct compilations of a novel objective rule    | 2 of 7 live attempts | **1 of 7**   |
| discarded candidates that were behaviorally exact | 14 of 19             | **14 of 18** |
| clarification detection                           | 2/2                  | **1/2**      |
| clarification follow-through                      | 0/2                  | **2/2**      |

Every candidate AST the pipeline threw away, executed against the fixtures:

| prompt       | discarded | behaviorally exact | genuinely wrong |
| ------------ | --------- | ------------------ | --------------- |
| N1 (round 1) | 9         | **9**              | 0               |
| N2 (round 1) | 1         | 0                  | 1               |
| N3 (round 1) | 3         | **1**              | 2               |
| N4 (round 1) | 1         | **1**              | 0               |
| N1r          | 2         | **1**              | 1               |
| N2b          | 1         | **1**              | 0               |
| N4b          | 1         | **1**              | 0               |
| **total**    | **18**    | **14**             | **4**           |

## Findings

### D1 (SEVERE) - a wrong reading is frozen while the correct one is discarded, four times

Set 11's headline was over-refusal: nothing wrong was ever frozen. That property
did not hold here. **Four of the five artifacts this run accepted are wrong**,
and in three of those cases the pipeline had produced the correct AST and threw
it away first.

**N2 / N2b - an order-dependent rule under an order-independent contract.**
The accepted artifact scores

```json
{
  "kind": "reduce",
  "op": "max",
  "of": {
    "kind": "pairs_map",
    "left": { "kind": "source", "source": "guess" },
    "right": { "kind": "source", "source": "draw" },
    "expr": {
      "kind": "abs",
      "of": {
        "kind": "arith",
        "op": "sub",
        "left": { "kind": "pair", "side": "left" },
        "right": { "kind": "pair", "side": "right" }
      }
    }
  }
}
```

`pairs_map` is a positional zip, so this is `max |guess[i] - draw[i]|` in entry
order - not "distance to the nearest drawn number". The player-facing text
frozen with it says the opposite:

```text
For each guess, calculate the minimum absolute difference between each of its
six numbers and any of the six drawn numbers.
```

The consequence is not academic: the same six numbers submitted in a different
order produce a different score and a different winner. Round 2's text said so
in the player's own words - "comparing every guessed number against all six
drawn numbers regardless of the order either list is written in" - and the same
positional AST was accepted anyway. This also violates PRD 6.4.2, which allows
position-based logic "only when the rule explicitly references position or
order".

**N4 / N4b - set equality compiled as a cardinality.** Accepted:
`count(intersection(digits(units, guess), digits(units, draw))) == 6`, which is
equivalent to set equality only when all six digits are distinct. The frozen
description again states the correct rule ("the guess wins if and only if these
two sets are identical"). It fails the three fixtures where the digit sets are
equal but small - including the exact copy of the draw, where the player-facing
text promises a win and the artifact pays nothing.

### D2 (SEVERE) - the independent reviewer's misreading becomes the frozen rule

In N2b and N4b the compile model produced the **exactly correct** AST on its
first attempt and the reviewer vetoed it with an arithmetically wrong verdict.
The pipeline then accepted a later candidate that implements the reviewer's
misreading.

N2b's veto, verbatim:

```text
The independent reviewer and draft disagree for guess [2,3,4,5,6,1] and draw
[1,2,3,4,5,6]: reviewer={"score":5,"winner":false}, draft={"score":0,"winner":true}
```

Every guessed number _is_ a drawn number, so every nearest-neighbour distance is
0 and the maximum is 0. The draft was right. The reviewer's 5 is exactly what
the **positional** reading yields (|1-6| = 5) - and the positional reading is
what the pipeline went on to freeze. The discarded candidate scores **6/6**.

N4b is the same shape: `guess = draw = [2,4,6,8,10,12]` has identical units-digit
sets, the draft said WIN, the reviewer said LOSE, and the vetoed candidate
scores **8/8**.

Set 11 recorded wrong reviewer vetoes as D4. What is new and worse here is the
second half: the veto does not merely destroy a correct artifact, it selects
the wrong one.

### D3 (SEVERE) - `guardianGrounded: false` predicts every wrong freeze and is ignored

Across all seven live compile results in this run the correlation is exact:

| guardianGrounded | cases            | artifact              |
| ---------------- | ---------------- | --------------------- |
| `false`          | N2, N4, N2b, N4b | **all four wrong**    |
| `true`           | N1r, V1b, V2b    | **all three correct** |

The signal is computed, recorded in the response, and not used as an acceptance
condition. Every one of the four silent corruptions in this set was accepted at
confidence `0.936` with the guardian reporting the artifact ungrounded. All four
also carried `PROVIDER_DISAGREEMENT` in their reason codes.

### D4 (SEVERE) - the agent's own parenthetical makes its own correct AST unacceptable

N1 burned **nine** compile attempts, all nine producing an AST structurally
identical to the reference, all nine rejected with the same message:

```text
The candidate AST does not keep every load-bearing claim in the agent
interpretation (missing values: 0, 1, 2).
```

The agent's approved interpretation opened with "compute the set of remainders
**(0, 1, 2, or 3)**". `collectRequiredValues` reads that parenthetical as
literals the artifact must contain, and a correct AST
(`count(distinct(map(guess, mod 4))) > count(distinct(map(draw, mod 4)))`) never
contains 0, 1 or 2. Reproducible offline in milliseconds, model-independent:

```text
"the set of remainders (0, 1, 2, or 3) obtained by dividing ... by four"  -> [0,1,2]
"the set of remainders (0 to 3) obtained by dividing ... by four"         -> []
"the set of remainders obtained by dividing ... by four"                  -> []
```

`collectRequiredValues` already carries `isRemainderScopedRange` /
`coversRemainingDomain` guards for the _range_ form
([interpretationCoverage.ts:300-310](../packages/rule-compiler/src/interpretationCoverage.ts#L300-L310)); the
enumerated form never reaches them, because it is consumed by `NUMBER_ENUMERATION`
at [interpretationCoverage.ts:281](../packages/rule-compiler/src/interpretationCoverage.ts#L281).

Round 2's verbatim replay of the identical player text proves the consequence.
The agent happened to write "(value % 4)" instead, and the same AST was accepted
**8/8 in 57 s** at confidence 0.936. Same input, same build, same models: a
four-word stylistic choice in the agent's own prose decided between a 239-second
refusal and an acceptance.

### D5 (SEVERE) - the deterministic parser claims "none of your numbers ..." as zero overlap, whatever follows

V2's text never reached a model reading. `validateAndPrecompileRule` returned
`SUPPORTED_RULE` with:

```text
A guess wins if exactly 0 of its numbers appear in the official draw, regardless of order.
```

The rule says nothing about appearing in the draw. The matcher at
[index.ts:3393](../packages/rule-compiler/src/index.ts#L3393) is
`\b(?:none\s+of|not\s+one\s+of)\s+...numbers?\b.{0,60}\b(appear|appears|match|matches|drawn|in the draw)\b`

- the `.{0,60}` wildcard swallows whatever relation sits between the subject and
  the word `drawn`. It is a class, not one prompt, and it captures **precise,
  expressible** rules too:

```text
over-claimed  "none of your numbers sits too far from every drawn number"
over-claimed  "none of your numbers is greater than any drawn number"
over-claimed  "none of your numbers divides a drawn number exactly"
correct        "none of your numbers is within 10 of a drawn number"        -> UNSUPPORTED
correct        "none of your numbers shares its last digit with a drawn number" -> UNSUPPORTED
```

Executed side by side, the claimed artifact and the faithful one disagree on
three of four boundary cases for "none of your numbers is greater than any drawn
number" - including the exact copy of the draw, which the faithful rule wins and
the claimed one loses. This is the set-6/7 over-claim class reproducing on new
material, and set 10's D1 divisor case reappearing through a different door.

### D6 (SEVERE) - that over-claim then erases a correct clarification request

For V2 the interpret agent did ask for clarification. The player never saw it.
`enforceSourceClarity`
([apps/api/src/index.ts:2729](../apps/api/src/index.ts#L2729)) drops the
questions whenever `hasAmbiguousWording(sourceText)` is false and the
deterministic precompiler returned VALID - and both conditions held, the first
because `AMBIGUOUS_PATTERNS`
([index.ts:596](../packages/rule-compiler/src/index.ts#L596)) enumerates
`too many|much|high|low|predictable|boring` and has no entry for `too far`.

What the player was shown at the approval step, from one response:

```text
dealerMessage:           A guess wins if exactly 0 of its numbers appear in the
                         official draw, regardless of order.
officialInterpretation:  ... If any guessed number has an absolute difference of
                         at least the threshold from all six drawn numbers, the
                         guess loses ...
needsClarification:      false
```

The two player-facing fields describe different rules, one of them still
contains an undefined "the threshold", and the flag says no question is
outstanding. Compile then spent **268 s** and refused with "3 different
executable readings" - the question the agent had already written, asked 268
seconds later and worse.

### D7 - the clarification exits are AST pretty-print, an impossible rule, or a different game

N3's refusal offered the player this choice, verbatim:

```text
(1) A guess wins if in every position of positions 1 to -1 of your numbers
    sorted from lowest to highest and your numbers sorted from lowest to highest
    from position 2 onward, (the value from the second list minus the value from
    the first list) is equal to ...
(2) ... and (the 6th value of your numbers sorted from lowest to highest minus
    the 1st value) is equal to ((the 6th value ... minus the 1st value) divided by 5)
```

Option 1 leaks a raw negative slice index ("positions 1 to -1") into player copy.
Option 2 is algebraically unsatisfiable for any non-zero span, and it is offered
as a rewrite the player may accept. V2's three options were no better: option (1)
is the D5 over-claim (an unrelated game), option (3) reads "the value 1 level(s)
further out", and option (2) invents the threshold `10`, a number the player
never wrote. PRD 6.6 requires a clarification the player can answer; set 11
recorded this class as D9 and it persists in a new form.

### D8 - coverage checks are keyword-level, so they catch the crude error and miss the subtle one

N2's first candidate (`max(guess)`, no reference to the draw at all) was
correctly rejected with "missing operations: distance". The candidate that was
then **accepted** contains an `abs`/`sub` pair, so the same check passed - even
though it composes those operations positionally rather than over the nearest
neighbour. Operation presence is not composition, and nothing downstream
compares winner sets, although `resolveRankingWinners` is available in process
and the harness used here scores a candidate in microseconds.

### D9 - refusing still costs more than succeeding

N1 refused in 239 s; the identical text was accepted in 57 s. V2 refused in
268 s. N3 refused in 125 s. The three clean successes averaged 80 s. A player
who trips D4 or D6 waits four minutes to be told nothing they can act on.

## What did work

- **The clarification follow-through closed, 2/2.** Set 11's V1b/V2b both
  failed; here both answered prompts compiled on the first attempt, with zero
  discarded candidates, clean `SUPPORTED_RULE` reason codes, a grounded
  guardian, and **8/8** fixtures each. V1b's artifact even reproduced the
  explicit `count < 3` guard of the player's second sentence rather than
  collapsing it into a bare disjunction.
- **V1's detection was exemplary.** Three questions, each answerable, isolating
  precisely the three undefined things: the distance threshold, the referent of
  "the rest of them", and whether "close" means nearest-neighbour or a total.
  The precise half of the rule ("at least three of your numbers were drawn") was
  never questioned. The compile boundary then held with
  `missing_approved_interpretation` rather than inventing the missing intent.
- **The deterministic parser did not over-claim any of the four objective
  rules.** All four returned `UNSUPPORTED_RULE` with no artifact. The over-claim
  in D5 came through the vague prompt, not the novel ones.
- **The DSL was never the limit.** 30/30 and 38/38 reference fixtures passed on
  the first attempt, including the two axes the pipeline never got right
  (nested `reduce min` inside `reduce max`, and bidirectional `forall`/`exists`
  over `digits`).
- **The difficulty gate behaved.** N3's two `DIFFICULTY_IMPOSSIBLE` rejections
  landed on genuinely unsatisfiable candidates (4/8 each), and the correct
  reference AST classifies as `EXTREME`, not `IMPOSSIBLE` - so the gate
  separated a rare rule from a broken one. It is worth noting that the correct
  reading sits at an estimated win rate of 0 with a 0.0015 upper bound, i.e. at
  the edge of that distinction.
- **One set-11 repair is visibly holding.** N4/N4b quantify over
  `digits(units, draw)`, exactly the derived-view shape that set-11 D1 said could
  never satisfy `all_draw` coverage. No `INTERPRETATION_MISMATCH` appeared on any
  attempt in this set.

## Reproduction

```bash
pnpm --filter @tyche/rule-schema --filter @tyche/rule-runtime --filter @tyche/rule-compiler build
node apps/api/scripts/rule-preflight-novel-set-12.mjs --refs            # 30/30 reference fixtures
node apps/api/scripts/rule-preflight-novel-set-12.mjs --refs --round2   # 38/38 reference fixtures
node apps/api/scripts/rule-preflight-novel-set-12.mjs --offline --compact  # novelty + D5

PORT=3099 HOST=127.0.0.1 npx tsx apps/api/src/index.ts
node apps/api/scripts/rule-preflight-novel-set-12.mjs http://127.0.0.1:3099 > round1.ndjson
node apps/api/scripts/rule-preflight-novel-set-12.mjs http://127.0.0.1:3099 --round2 > round2.ndjson
node apps/api/scripts/rule-preflight-novel-set-12.mjs --verify-rejected round1.ndjson
node apps/api/scripts/rule-preflight-novel-set-12.mjs --verify-rejected --round2 round2.ndjson
```

D4, D5 and D6 reproduce offline in milliseconds and do not need a provider.

## Repair addendum (2026-09-11)

The repair attacks the reusable decision boundaries behind D1-D9 rather than
adding deterministic parsers for N1-N4:

- Semantic coverage now distinguishes nearest-neighbour minimax from positional
  zip, and equality of duplicate-bearing derived sets from intersection
  cardinality. The correct N2/N4 compositions cover their source; the four
  silently wrong shapes measured above do not.
- A reviewer has veto authority only after source coverage, runtime-bound,
  harness, and non-degenerate difficulty checks. Impossible, always-true,
  unsafe, vacuous, or runtime-failing candidates cannot become player-visible
  disagreement readings.
- A negative guardian verdict plus independent compiler-conflict evidence now
  blocks even after approval. Guardian disagreement alone remains advisory, so
  one stochastic classifier does not become a single-point veto.
- Complete residue-domain enumerations are explanatory, not AST literals. The
  zero-overlap parser requires a direct membership/match relation. `too far`
  remains ambiguous until the player supplies a number, and deterministic
  source clarity cannot erase a clarification whose semantic claims the parsed
  AST does not cover.
- Suggested rewrites cannot introduce a numeric threshold absent from the
  player's text. Adjacent-gap, nearest-neighbour, derived-set-equality, and
  negative-slice descriptions no longer leak binder levels or negative
  positions. Compiler skill v17 teaches the correct compositions and names the
  invalid positional/cardinality substitutes.

Verification on the repaired tree: compiler **142/142** tests and API
**259/259** tests passed with typecheck, zero-warning lint, and production builds;
the set-12 references remain **30/30** and **38/38**. The rebuilt offline control
now routes both V1 and V2 to clarification and emits no artifact for any novel
objective prompt. No live provider corpus was rerun, so the addendum does not
claim a new stochastic compile rate or latency.

## Live verification of the repairs (2026-09-11, `6a14b83`)

The repair addendum above deliberately made no live claim. This section supplies
it: the **same corpus, same runner, same providers**, replayed end to end on the
repaired tree with the rule packages rebuilt and a fresh `apps/api` on
`127.0.0.1:3099`. Reference ASTs re-verified first (**30/30**, **38/38**), and
the independent test suites re-run here: compiler **142/142**, API **259/259**.

### Round 1, before and after

| ID  | on `2e41d19` | on `6a14b83` |
| --- | --- | --- |
| N1 | refused, 239 s, **9 correct ASTs burned** | **VALID 8/8**, 0 discarded, guardian grounded, 144 s |
| N2 | **VALID, WRONG 5/6** (positional `pairs_map`) | **VALID 6/6**, the nested nearest-neighbour AST, 0 discarded, 54 s |
| N3 | refused, 125 s | `decision: VALID` **with** `needsClarification`, AST 7/8 **held, not frozen**, 150 s |
| N4 | **VALID, WRONG 5/8** (`count(intersection)==6`) | refused on `AGENT_STATEMENT_MISMATCH`, 306 s, **5 of 6 discarded ASTs were 8/8** |
| V1 | clarify, 3 questions | clarify, 2 questions, 10 s |
| V2 | **clarification suppressed**, then refused after 268 s | **clarify in 8 s**, one precise question |

### Round 2, before and after

| ID  | on `2e41d19` | on `6a14b83` |
| --- | --- | --- |
| N1r | VALID 8/8 | **VALID 8/8**, 0 discarded, 74 s |
| N2b | **VALID, WRONG 5/6**, correct AST discarded | **VALID 6/6**, 0 discarded, guardian grounded, 44 s |
| N4b | **VALID, WRONG 5/8**, correct AST discarded | refused, **2 of 3 discarded ASTs were 8/8**, 103 s |
| V1b | VALID 8/8 | **VALID 8/8**, 41 s |
| V2b | VALID 8/8 | **VALID 8/8**, 53 s |

### Verdict per defect

| defect | status | evidence |
| --- | --- | --- |
| D1 silent corruption | **closed for N2, converted to refusal for N4** | 4 wrong freezes -> **0**. N2/N2b now freeze the reference AST |
| D2 reviewer veto selects the wrong artifact | **partially closed** | N2b/N4b vetoes gone; N3's wrong veto reproduced (see R2) |
| D3 guardian signal unused | **closed as designed** | paired guardian + conflict evidence; N2 round 1 was grounded-false, conflict-free, and correct, so the paired rule avoided a false refusal the solo signal would have caused |
| D4 parenthetical kills its own AST | **closed for values, open for operations** | `(0, 1, 2, or 3)` now yields no required literals; see R1 |
| D5 `none of your numbers ...` over-claim | **closed** | every probe now `UNSUPPORTED_RULE`/`AMBIGUOUS_RULE`; the legitimate zero-overlap wording still compiles |
| D6 suppressed clarification | **closed** | V2 asks its question in 8 s instead of refusing after 268 s |
| D7 refusal offers no exit | **open** | N3 and N4 both return `refinementQuestions: []`, `suggestedRewrites: []` |
| D8 keyword-level coverage | **closed for these two shapes** | `nearest_each` and `set_equality` block the positional and cardinality substitutes |
| D9 refusal costs more than success | **open** | N4 306 s refusal against 44-144 s successes |

### Residual defects

#### R1 (SEVERE) - the dealer's chat sentence is screened as a binding contract, and a synonym in it destroys the correct AST

`agentInterpretation` is built as `dealerMessage + "\n" + officialInterpretation`
([apps/api/src/index.ts:4366](../apps/api/src/index.ts#L4366)), and
`agent_statement_coverage` requires the AST to credit every operation cue in it.
A faithful set-equality AST (`forall`/`exists` in both directions) contains
neither a `distinct` nor a `membership` node, so any gloss that names one kills
it. N4 failed this way in **both** rounds, with different words:

```text
round 1 dealer/official prose: "every last digit present in the draw must appear in the guess"
                               -> required membership -> AGENT_STATEMENT_MISMATCH (5 ASTs, all 8/8)
round 2 dealer prose:          "the unique last digits in your guess match the unique last digits in the draw"
                               -> required distinct   -> AGENT_STATEMENT_MISMATCH (2 ASTs, both 8/8)
```

Reproducible offline in milliseconds against the live AST and the live sentence:

```text
agent officialInterpretation alone        covered: true
dealerMessage alone                       covered: false, missing: ["distinct"]
dealerMessage + officialInterpretation    covered: false, missing: ["distinct"]
```

This is the D4 class relocated from numeric literals to operations. Eight
behaviorally exact artifacts were destroyed by it in this verification run, and
no player wording can prevent it - the sentence that fails the check is written
by the dealer, not by the player.

#### R2 - a structurally plausible reviewer can still veto a correct AST with a wrong verdict

The new eligibility gate (runtime bounds, harness coverage, non-degenerate
difficulty, source preservation) disqualifies a reviewer whose reading is
structurally unfaithful - which is why N2b's positional veto disappeared. It does
not disqualify a reviewer that is structurally fine and arithmetically wrong.
N3 reproduced the set-11 D4 witness exactly:

```text
The independent reviewer and draft disagree for guess [1,2,3,4,5,6] and
draw [1,2,3,4,5,6]: reviewer=WIN, draft=LOSE
```

The sorted gaps are all 1 and the two lowest drawn numbers are 1 apart, so
`spacing > drawn gap` is false and `LOSE` is right. The vetoed candidate scores
**8/8**; what reached the player instead was a 7/8 artifact that checks only the
first gap.

#### R3 - the held artifact and the refusal text still leave the player with nothing

N3's response is a new hybrid - `decision: VALID` with `needsClarification: true`
and a wrong-but-unfrozen AST - which is the right failure direction, but it
carries no question and no rewrite. N4's refusal says "independent compiler
attempts produced different executable readings" when all five discarded
candidates were the same correct reading rejected by one coverage cue.

### What the repairs did achieve

- **Wrong artifacts frozen: 4 -> 0.** Every artifact accepted in this run is
  behaviorally exact against its fixtures.
- **Correct compilations of a novel objective rule: 1/7 -> 4/7** (N1, N2, N1r,
  N2b). N2 and N2b, both frozen wrong before, now freeze the reference AST.
- **Clarification detection 1/2 -> 2/2**, follow-through held at **2/2**, and
  V2's path shortened from a 268-second refusal to an 8-second question.
- **Discarded work fell from 18 candidates (14 exact) to 10 (8 exact)**, and all
  eight of the surviving losses are the single R1 cue on one rule.
- **N1 is now stable across both rounds**, where the same text previously
  produced a refusal and an acceptance on the same build.
