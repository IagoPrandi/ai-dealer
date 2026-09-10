# Rule Proposal Prompt Test Set 7 - Novel Compositions and the Clarification Loop

Seventh rule-agent test set, run against `HEAD` = `aa3e63f`, the build that
contains the 2026-09-10 "test-set 6 causal repairs". Set 6 asked whether a
genuinely novel rule compiles and got 0/4. This set asks two questions:

> 1. Do the set-6 repairs **generalise**, or did they only close the four
>    prompts set 6 measured?
> 2. When the agent says a rule needs clarification, does **answering it work**?

Context opened before this session: `PRD.md` (SS4.5 rule proposal UX, SS4.10 UX
copy, SS6.4-6.6 rule constraints, DSL/AST and vague-rule clarification, SS6.15
preflight, SS7.2-7.5 multi-agent pipeline, multi-LLM configuration, composite
confidence and compilation flow), `.claude/CLAUDE.md`, the `.claude/skills`
catalog, `docs/rule-proposal-prompt-test-set-6.md`, and `PROGRESS_TRACKER.md`.

## Method

Set 6's method, plus a clarification round.

- **Four novel prompts**, each on a capability axis absent from sets 1-6.
- **Expressibility proved before the agent is judged.** Every novel rule was
  first hand-written as a schemaVersion-3 AST and executed against this set's
  fixtures. All four reference ASTs pass **29/29**. A refusal below therefore
  cannot be "the DSL cannot say that".
- **Two imprecise prompts** whose vagueness is deliberate, to test detection.
- **A second round that follows the clarification through**: V1b/V2b answer the
  agent's own questions, N1b pastes back the agent's own offered rewrite
  verbatim, and N4b rewords only the tie-break of N4. Round-2 reference ASTs
  pass **25/25**.
- **The two-phase player flow**, exactly as `Create.tsx` performs it:
  `phase: "interpret"` -> approve -> `phase: "compile"` with
  `approvedInterpretation`.
- **Behaviour oracle** derived from the original prompt, never from agent prose.

Environment: `apps/api` on `127.0.0.1:3099`, started 18:12 onto the current
`@tyche/rule-compiler` build (08:13), PostgreSQL and Redis healthy. Compile
`openai/gpt-oss-120b`, review `mistralai/mistral-small-24b-instruct-2501`,
guardian `openai/gpt-oss-safeguard-20b` on Groq, tertiary `qwen/qwen3.8-flash`,
`LLM_ESCALATION_MODEL=openai/gpt-oss-120b`, `LLM_TRANSLATE_TO_ENGLISH=false`.

**Concurrency caveat.** Another session was replaying test set 6 against the
same `apps/api` instance during this run (its addendum is at the end of
`docs/rule-proposal-prompt-test-set-6.md`). Latencies here may therefore be
inflated by shared provider load, and the one
`SECOND_OPINION_UNAVAILABLE` on N3 is a plausible symptom. Outcome classes are
not affected: each is either a deterministic gate result or reproduced offline
by `--offline` / `--refs`, both of which run without the server.

Run locally:

```text
pnpm --filter @tyche/api stress:rules:set7            # round 1
pnpm --filter @tyche/api stress:rules:set7 -- http://127.0.0.1:3099 --round2
node apps/api/scripts/rule-preflight-novel-set-7.mjs unused --refs
node apps/api/scripts/rule-preflight-novel-set-7.mjs unused --offline
```

## Corpus

| ID | Prompt | Capability under test | Expected |
|---|---|---|---|
| N1 | Every drawn number has a guessed number within 3 of it, and no guessed number is drawn | nested quantifier in the DRAW->guess direction plus an empty-intersection conjunct | VALID |
| N2 | Draw sum even -> guess sum even and higher; draw sum odd -> guess sum odd and lower | a property of the DRAW selects which branch applies | VALID |
| N3 | Sorted, the five consecutive gaps are all different, and the largest is below the lowest drawn number | distinctness over a derived array (`pairs_map` of two slices of one sorted guess, then `distinct`) | VALID |
| N4 | Biggest remainder of the ticket total divided by the lowest drawn number; must hold a drawn number; ties share the prize | ranking scored by a modulo whose divisor is a draw aggregate, with a membership eligibility gate | VALID |
| V1 | "spread out enough and not too close to the drawn ones" | two undefined magnitudes | CLARIFY |
| V2 | "the one that best mirrors the draw wins" | undefined ranking criterion | CLARIFY |

## Results

### Round 1

| ID | Outcome | Confidence | Attempts | Time | Fixtures on a returned AST |
|---|---|---|---|---|---|
| N1 | INVALID + clarification | 0.869 | 3 | 70 s | no AST |
| N2 | **VALID** | 0.936 | 0 | 110 s | **8/8** |
| N3 | **VALID** | 0.936 | 2 | 217 s | **8/8** |
| N4 | **HTTP 400 before any model ran** | - | 0 | 0.013 s | no AST |
| V1 | clarification correctly requested | - | 0 | 34 s | n/a |
| V2 | clarification correctly requested | 0.633 | 3 | 78 s | n/a |

### Round 2 - following the clarification

| ID | What was submitted | Outcome | Fixtures |
|---|---|---|---|
| V1b | V1 with all three of the agent's questions answered | INVALID + clarification | no AST |
| V2b | V2 with the agent's question answered | `decision: VALID`, `needsClarification: true`, confidence 0.936 | **5/5 correct AST, refused anyway** |
| N1b | the agent's own `suggestedRewrites[1]`, verbatim | INVALID + clarification | no AST |
| N4b | N4 with only the tie-break reworded | INVALID + clarification | no AST |

### Headline numbers

- Novel-rule compile rate: **2/4** (N2, N3), up from **0/4** in set 6. Both
  accepted rules are **behaviourally exact**: 16/16 fixtures, and N3's accepted
  AST is structurally identical to the hand-written reference.
- Clarification **detection**: **2/2**. Both vague prompts were caught, with
  specific, player-readable, model-written questions.
- Clarification **follow-through**: **0/2**. Answering the questions precisely
  did not produce a rule either time.
- The agent's own offered rewrite is **rejected by the agent** (N1b).
- Was any wrong artifact accepted? **No.** Settlement integrity held throughout.
- Cost: 10 preflight case-runs, 979 s of wall clock, 21 rejected compilation
  attempts. Failed-stage codes: `REVIEWER_MISMATCH` 24,
  `PROVIDER_EVIDENCE_UNVERIFIED` 6, `UNSUPPORTED_RULE` 4, `AMBIGUOUS_RULE` 3,
  `EXTERNAL_DEPENDENCY` 2, `SCHEMA_INVALID` 2, `UNSAFE_RUNTIME_BOUNDS` 2,
  `SECOND_OPINION_UNAVAILABLE` 1, `PROVIDER_MALFORMED_RESPONSE` 1.

### What the set-6 repairs did close

- **G8 (tertiary arbiter HTTP 400)** - no `uniqueItems` schema-decode failure
  occurred in this session.
- **G9 (escalation reported for the same model)** - `escalated: false` on N1, N2
  and N3, rather than unconditionally true.
- **G10 (discarded candidates invisible)** - `rejectedCompilerAttempts[].candidate`
  now carries the AST on every attempt, which is how findings H1 and H2 below
  were reconstructed directly from the response.
- **G7 (ranking dead end)** - partly. The player-facing copy now distinguishes
  "this is a compiler conflict, not a missing answer from you" from player
  vagueness, and N4b/V2b receive that message correctly.

## Findings

### H1 - the deterministic parser still claims rules it half-implements, and still labels them SUPPORTED_RULE

Set 6's G2 is **not closed**. It reproduces on fresh prompts, and the mechanism
is the same 80-character look-ahead in `parseMatchCountThreshold`
(`packages/rule-compiler/src/index.ts`):

```text
\b(at least)\s+([1-6])\b.{0,80}\b(MATCH_COUNT_NOUN|MATCH_COUNT_ACTION)\b
```

`MATCH_COUNT_ACTION` contains the bare word `drawn`, so **any** "at least N"
within 80 characters of "drawn" or "number" becomes a match count. The set-6
repair added a guard for exactly one phrase - "at least N **times**" - and left
the class open.

Measured offline, model-free, via `validateAndPrecompileRule`:

| Prompt | Returned | AST |
|---|---|---|
| N1 | `VALID` / `SUPPORTED_RULE` | `count(guess ∩ draw) == 0` - the coverage clause dropped entirely; fails 2/7 fixtures |
| V1b | `VALID` / `SUPPORTED_RULE` | `match_count_at_least 4`, official interpretation "at least 4 of its numbers appear in the official draw" |
| N1b | (live) | `match_count_at_least 1` |

Three held-out probes confirm the class rather than the instance:

```text
"every one of its numbers is at least 4 away from every drawn number"
  -> VALID, match_count_at_least 4
"at least 2 of its numbers sit more than 10 below the lowest drawn number"
  -> VALID, match_count_at_least 2
"the gap between its two smallest numbers is at least 5 and its largest
 number is above every drawn number"
  -> VALID, match_count_at_least 5
```

For a deterministic candidate the `provider_evidence` stage is **skipped by
design**, so no executed worked example ever contradicts it. In every instance
above the only thing standing between the wrong artifact and acceptance was the
stochastic 24B reviewer - which in this session was right each time, and was
right about N1 attempt 0 only by accident (it mis-evaluated the probe and
happened to disagree).

This is the repository's own anti-overfitting gate in
`.claude/skills/tyche-test-and-verify` being missed again: the repair was
per-phrase, and a new phrase reopens it.

**This qualifies the set-6 addendum.** The concurrent set-6 run 3 records
"G2 - the deterministic parser no longer emits wrong rules", on the evidence
that the offline control now returns `UNSUPPORTED_RULE` for all four set-6
prompts. That observation is correct and the finding is closed *for those four
prompts*. As a class it is open: the same parser, same build, same offline
control, emits `SUPPORTED_RULE` with a wrong AST for N1, V1b and N1b, and for
three of four held-out probes. G2 should be read as "closed on the measured
prompts", which is the distinction the anti-overfitting gate exists to force.

### H2 - the fidelity gates are vacuous on the rules that most need them

`interpretation_coverage` and `agent_statement_coverage` both reported
**passed** on the N1 artifact that had dropped an entire quantified clause. The
reason is not a bug in the comparison but the absence of anything to compare:

```text
collectRequiredValues("...within 3 of it, and none of the guessed numbers
                       is itself one of the drawn numbers.")  -> []
collectRequiredOperations(same text)                          -> []
```

`collectRequiredValues` only harvests braced sets, enumerations, membership
literals and ranges - **never a bare comparison threshold**. Across this set's
six prompts it returns `[]` for **6 of 6**: "within 3", "at least 8", "at least
4 away", "at least one" are all invisible. `OPERATION_TEXT_CUES` is a closed
list of seven cues with no entry for quantification (`every`/`all`/`at least
one`/`none`), proximity/distance, membership/intersection, extremes
(`min`/`max`), sorting or gaps. The gate is therefore fully vacuous on **3 of 6**
prompts (N1, N3, V1b).

The product consequence is the reporting, not just the coverage: a gate with
nothing to check emits `status: "passed"` and the sentence "The candidate AST
covers the intent-bearing parts of the rule text." An operator reading the
attempt log is told a fidelity check succeeded where none ran.

### H3 - the gate that binds the dealer's promise reads a different string than the player approved

`agent_statement_coverage` exists because, in its own words, "the player
answered 'yes, generate this rule' to the chat sentence, so anything
load-bearing in it must survive into the artifact". The chat sentence the player
approves is `dealerMessage`. The gate is passed
`agentInterpretation: interpretation.officialInterpretation`
(`apps/api/src/index.ts:4209`) - `dealerMessage` is never supplied to it.

N1 shows why that matters. The two prose artifacts describe different games:

```text
officialInterpretation (correct, draw-side):
  "for each of the six drawn numbers, check if there exists at least one
   guessed number such that the absolute difference between them is 3 or less"

dealerMessage (the chat bubble, guess-side):
  "you win if your numbers are all within 3 of the drawn numbers, but you
   don't actually hit any of them exactly"
```

Executed against both readings, ticket `[7,8,9,11,12,13]` with draw
`[10,20,30,40,50,60]` is **WIN** under the bubble and **LOSE** under the real
rule. Nothing in the pipeline compares them.

Independently, `analyzeStatementFidelity` can only ever detect one claim shape -
`exclusive_guess_set`. Every other prose/AST divergence is structurally
incapable of raising `AGENT_STATEMENT_MISMATCH`.

### H4 - stating a ranking tie-break is penalised twice, and one penalty is a hard block

Both natural ways to write the tie-break that PRD SS6.12 requires and that the
DSL implements as `tieBreak: "share_pool"` are punished:

- **"tickets with the same remainder share the prize"** trips
  `hasExternalDependency`, which `apps/api` runs **pre-LLM as a blocking 400**.
  N4 died in 13 ms with:

  ```text
  HTTP 400 {"error":"RULE_EXTERNAL_DEPENDENCY","message":"Rule text depends on
  unavailable external game state. Rewrite it using only your guess and the
  official draw."}
  ```

  The rule uses only guess and draw. The instruction the player is given is
  already satisfied, so the message is not merely wrong, it is unactionable.
  "share the pool" fails identically.

- **"if several tickets tie on that count, they split it equally"** trips
  `hasAmbiguousWording` on the word **"several"** (also "some"). On V2b this
  replaced the model's interpretation with a server template:

  ```text
  clarityNote: "The player's wording is subjective or leaves a required
                threshold undefined."
  question:    "Which measurable numeric property and threshold should define
                this condition?"
  ```

  V2b names its property (count of same-position matches) and, being a
  max-ranking rule, has no threshold to define. The question cannot be answered
  as posed. The same string also addresses the player in the third person
  ("The player's wording"), against PRD SS4.10.

Removing only the word "several" clears the gate. Ranking rules are half the
PRD's rule model, and this obstructs the clause that makes them well-formed.

### H5 - a behaviourally exact, high-confidence artifact is refused with nothing for the player to do

V2b returned:

```text
decision: VALID       needsClarification: true
finalConfidence: 0.936   guardianGrounded: true   difficulty: BALANCED
refinementQuestions: []  suggestedRewrites: 0
```

The returned AST is byte-for-byte the reference AST and scores **5/5** on the
ranking fixtures, including the position-vs-membership discriminator. Confidence
is above the 0.85 accept threshold of PRD SS7.4. The rule is nevertheless
withheld, and the player is handed an empty action set - set 6's G7 in its
original form, on a fresh case.

The two player-facing strings in that same response contradict each other:

```text
reasonSummary: "... Your wording is clear, but independent compiler attempts
                produced different executable readings. This is a compiler
                conflict, not a missing answer from you."
dealerMessage: "The player's wording is subjective or leaves a required
                threshold undefined. Please define it before the rule is
                submitted."
```

### H6 - the clarification loop has no exit

This is the set's most serious product finding, because each step individually
looks like the system working.

1. V1 is vague. The agent asks three precise, well-formed questions.
2. V1b answers all three. `interpret` returns `needsClarification: false` and an
   **exactly correct** official interpretation.
3. All three compile attempts return the same wrong regex artifact
   (`match_count_at_least 4`, H1).
4. The player is told: *"This wording has 2 different executable readings, so
   which guesses win is not decided yet. Only you can say which one you meant."*
   - blame returned to the player for a compiler defect, with two rewrites in
   unreadable AST prose.

The N1 branch closes the loop completely:

1. N1 is refused as ambiguous and two rewrites are offered.
2. Rewrite (2) **is** the player's rule, correctly rendered as an AST.
3. N1b submits that rewrite verbatim. `interpret` reads it back perfectly and
   the approved interpretation is sent - the UI-faithful path.
4. It is refused, with `match_count_at_least 1` as the draft.

The system offers a rewrite as the remedy and then rejects its own remedy. There
is no wording a player can reach from here.

### H7 - the "boundary value 100" explanation fires on rules that have nothing to do with 100

N1b's player-facing reason was:

```text
"The rule is clear except for how the boundary value 100 is interpreted, and the
 compiler found a concrete guess/draw pair where that choice changes the winner."
```

N1b contains no reference to 100 and no reading that turns on it. The condition
(`apps/api/src/index.ts:3393-3402`) selects a `boundaryWitness` whenever any
rejected attempt's disagreement witness merely **contains** the value 100:

```typescript
(witness.guess.includes(100) || witness.draw.includes(100)) &&
/^(?:WIN|LOSE)$/u.test(witness.reviewerResult) && ...
```

It never checks that the two readings actually diverge *because of* 100. The
semantic sampler picks 100 freely - here on 1 of 3 attempts - so any rule can
inherit this diagnosis. Worse, `boundaryChoiceQuestion ?? readingChoiceQuestion`
means the false boundary question **suppresses** the real reading choice, so the
one question that could have resolved the case is never asked.

This is the set-6 G5 repair generalising in the wrong direction: it was built to
make a genuine 100-boundary divergence answerable, and it now mis-labels
unrelated refusals.

### H8 - the bounded retry is inert whenever the deterministic parser is the author

N1, V1b and N1b each produced **three byte-identical candidate ASTs** across
three attempts, with identical stage results. The 2026-08-23 design gives each
retry "structured schema, failed-stage, evidence, and behavioural-counterexample
diagnostics", but a retry that re-enters the deterministic path re-runs the same
regex on the same text and cannot produce anything different. Three of the
session's ten case-runs spent their entire retry budget re-deriving one artifact.

### H9 - the reading choices remain unreadable, and one pair is not a real ambiguity

PRD SS4.10 requires player-actionable copy. N1's two choices ship as:

```text
(1) A guess wins if every value of the drawn numbers satisfies that at least one
    value of your numbers satisfies that the distance from zero of (the value 1
    level(s) further out minus the value) is at most 3
(2) ... the same, and every value of your numbers satisfies that it is not the
    case that the drawn numbers include the value
```

Set 6's G6 is unchanged. Two further problems are new:

- Reading (1) is a strict **prefix** of reading (2) - it is reading (2) with the
  player's second clause deleted. Presenting a dropped-clause artifact as a
  candidate *reading of the player's wording* misattributes a compiler defect to
  the text, which is set 6's G3 in a form the player cannot detect.
- V1b's two readings differ on `forall(gaps) >= 8` versus `max(gaps) >= 8`. The
  player wrote "the largest gap ... is at least 8", which is unambiguous, and
  `interpret` had already read it correctly.

### H10 - the guardian's groundedness verdict carries no signal

Of the two accepted, behaviourally exact rules, the guardian scored N2
`guardianGrounded: false` and N3 `guardianGrounded: true`. A 1-of-2 verdict on
artifacts that are provably faithful means the field cannot support a decision.
It is currently advisory, which is the only reason this is harmless.

### H11 - the model still cannot keep a ranking fold self-consistent

N4b attempts 1 and 2 declared worked-example scores that contradict their own
emitted AST (`PROVIDER_EVIDENCE_UNVERIFIED`, 6 occurrences this session). Set
5's F8 and set 6's G11 are unchanged. The evidence gate caught every instance,
which is the gate working as designed - and it is the only stage that caught
them.

### H12 - the vague-rule compile path answers 502 instead of clarifying

`POST /rule-preflight` with `phase: "compile"` on V1's text returns:

```text
502 {"error":"RULE_AGENT_BAD_RESPONSE","message":"The dealer agent returned an
unusable response. Try rephrasing the rule."}
```

PRD SS6.6 requires a vague rule to produce a clarification, and the `interpret`
phase produced an excellent one. A 502 presents a server fault as the player's
problem. `Create.tsx` always sends `approvedInterpretation` on compile, so this
is reachable through the API rather than the UI, and is an API-contract defect
rather than a live player-facing one.

### H13 - the latent settlement path is unchanged

`runRuleValidationCycle` (`apps/worker/src/rule-validation.ts`) still calls
`validateAndPrecompileRule` with no reviewer, no evidence gate and no LLM, and
publishes `compiledArtifact` with its decision. For V1b's text it would publish
`match_count_at_least 4` as `VALID`. It still has **no production caller**, so
set 6's G12 remains a latent risk of exactly the same shape - now with three
more prompts that would trigger it.

## Assessment

The compiler is better than set 6 measured. Two of four novel compositions now
compile, and both are exactly right - N2 on the first attempt with no retries,
N3 after the retry loop did its job. Nothing wrong was ever accepted. The rule
interpreter was correct on **every one of the ten case-runs**, including all four
it then failed to ship, which is consistent with sets 5 and 6: understanding is
not the bottleneck.

What blocks trust is not model quality. Of the eight refusals, the causes are:
two blocking-gate false positives on ordinary English (H4), one acceptance-policy
refusal of a provably correct artifact (H5), three refusals whose only draft came
from a regex that mis-parsed the sentence (H1), and two genuine model faults that
the evidence gate correctly caught (H11). Only the last group is a model limit.

The reason a player cannot be handed this yet is H6: the clarification loop does
not terminate. The agent asks good questions, the player answers them, and the
answer is refused with the blame returned to the player - and when the agent
offers a rewrite as the fix, it rejects that rewrite too. Combined with H1, where
a wrong artifact is labelled `SUPPORTED_RULE` and only a stochastic reviewer
stands between it and the prize pool, and H2, where the gates built to catch
exactly that report "passed" without checking anything, the honest summary is
that correctness currently depends on a 24B model disagreeing with a regex.
