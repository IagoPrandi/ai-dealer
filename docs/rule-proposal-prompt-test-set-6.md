# Rule Proposal Prompt Test Set 6 - Post-Fix Novel-Composition Session

Sixth rule-agent test set, run directly against the build produced by the
2026-09-09 "test-set 5 causal fixes" work log. Set 5 asked whether a genuinely
novel rule compiles. This set asks the follow-up question that the fixes make
unavoidable:

> After the set-5 repairs, does the pipeline compile **new** novel compositions -
> or did it only learn the four prompts that were measured?

Context opened before this session: `PRD.md` (SS4.5 rule proposal UX, SS4.10 UX
copy, SS6.1-6.2 free-form input, SS6.6 vague-rule clarification, SS6.15 preflight,
SS7.2 multi-agent pipeline, SS7.3-7.5 multi-LLM configuration, confidence and
compilation flow), `.claude/CLAUDE.md`, `.claude/skills` (including the
`tyche-test-and-verify` root-cause and anti-overfitting gate),
`packages/rule-compiler/rule-authoring/SKILL.md` with `references/patterns.md`
and `references/examples.md`, `docs/rule-proposal-prompt-test-set-5.md`, and
`PROGRESS_TRACKER.md`.

## Method

Set 5's method, plus one addition that changes what a failure can be blamed on.

- **Four prompts, each a composition absent from sets 1-5**, from the deterministic
  compiler's parser families and from the authoring examples.
- **Expressibility is proved before the agent is judged.** Every rule was first
  hand-written as a schemaVersion-3 AST and executed against this set's fixtures.
  All four reference ASTs pass **27/27**. A refusal below therefore cannot be
  "the DSL cannot say that" - the DSL can, and the reference AST is in the
  session record.
- **The two-phase player flow**, exactly as `Create.tsx` performs it:
  `phase: "interpret"` -> approve -> `phase: "compile"` with
  `approvedInterpretation`.
- **Per-stage capture** over the NDJSON transport.
- **Behaviour oracle** derived from the original prompt, never from agent prose.
- **Two identical runs**, because acceptance stability is a product property.

Environment: `apps/api` on `127.0.0.1:3099`, restarted onto a freshly built
`@tyche/rule-compiler` (the previously running instance predated the set-5 fixes),
PostgreSQL and Redis healthy. Primary/compile `openai/gpt-oss-120b`, reviewer
`mistralai/mistral-small-24b-instruct-2501`, guardian
`openai/gpt-oss-safeguard-20b`, tertiary `qwen/qwen3.8-flash`, all through
OpenRouter. `LLM_ESCALATION_MODEL=openai/gpt-oss-120b`,
`LLM_TRANSLATE_TO_ENGLISH=false`.

Run locally:

```text
node apps/api/scripts/rule-preflight-novel-set-6.mjs http://127.0.0.1:3099 --compact
node apps/api/scripts/rule-preflight-novel-set-6.mjs unused --offline
```

## Corpus

| ID | Prompt | Capability under test | Expected |
|---|---|---|---|
| S1 | Product of the two smallest guessed numbers is at least three times the highest drawn number | multiplicative aggregate over a sorted slice vs a scaled draw aggregate | VALID |
| S2 | At least five different tens digits, and one number shares the tens digit of the highest drawn number | set cardinality over a digit projection (`distinct` + `digits`) plus a digit-membership conjunct | VALID |
| S3 | At least four of the five comparisons guess[i] > draw[i+1] hold | counted pairs over a shifted CROSS-ARRAY zip | VALID |
| S4 | Among tickets all above the lowest drawn number, smallest span wins; ties go to the smaller total | min-direction ranking with a draw-relative `eligibleWhen` and an ordered-criteria fold | VALID |

Twenty-seven fixtures: 7 for S1, 7 for S2, 7 for S3, 6 ranking scenarios for S4.
Each set pairs an exactly-on-threshold win with a one-unit-outside loss, varies
only the draw to prove draw-sensitivity, and includes a discriminator that
separates the intended rule from its most likely mis-compilation (S1: two
smallest vs first two picked; S3: shifted vs same-position comparison).

## Results

| ID | Run 1 | Run 2 | Fixtures on a returned AST |
|---|---|---|---|
| S1 | INVALID, 50 s, confidence 0.869 | INVALID, 65 s, confidence 0.869 | no AST returned |
| S2 | INVALID, 138 s, confidence 0.377 | INVALID, 78 s, confidence 0.936 | no AST returned |
| S3 | INVALID, 73 s, confidence 0.936 | INVALID, 296 s, confidence 0.936 | no AST returned |
| S4 | INVALID, 179 s, confidence 0.869 | INVALID, 232 s, confidence 0.869 | no AST returned |

- Compilation rate: **0/4**, in both runs.
- Semantic accuracy of what compiled: not measurable - nothing compiled.
- Was any wrong artifact accepted? **No.** Settlement integrity held.
- Acceptance stability: **4/4 verdicts identical** across runs. Set 5's coin-flip
  (F6) did not reproduce; the pipeline is now deterministically refusing.
- Reference-AST expressibility: **27/27 fixtures pass**, so every refusal is a
  pipeline failure and not a DSL limitation.
- Cost: 440 s + 671 s of wall clock and 23 rejected compilation attempts to
  produce eight refusals.
- Provider faults: 8 HTTP 429 responses and 3 hard schema-decode rejections,
  **all** on the tertiary model.

### What the fixes did close

Three set-5 findings are genuinely repaired, and this session confirms them:

- **F3 (escalation could not fire)** - `shouldEscalateRulePreflight` no longer
  requires `!approvedInterpretation`.
- **F5 (`[object Object]` ranking diagnostics)** - S4 now reports
  `reviewer={"eligible":false,"score":526}, draft={"eligible":true,"score":2951}`.
- **F6 (guardian coin-flip veto)** - the guardian is advisory once the player
  approved the reading.

## Findings

### G1 - the set-5 repair was fitted to the set-5 prompts

`parseExtremeCountMarginRule` (`packages/rule-compiler/src/index.ts`) is a single
regex that transcribes set-5's N4 prompt almost word for word:

```text
count ... numbers ... above ... highest ... draw ... exceeds ...
count ... numbers ... below ... lowest ... draw ... by at least (N)
```

The closest-sum-without-exceeding family was added the same way, and set 5's N3
artifact now appears verbatim in `rule-authoring/references/examples.md`. Those
four prompts pass; four new ones from the same product space score 0/4.

This is precisely the case the repository's own
`.claude/skills/tyche-test-and-verify` anti-overfitting gate forbids: *"Reject
literal phrase/value/fixture exceptions unless the product contract is itself
literal and bounded."* PRD SS6.1-6.2 makes the contract explicitly **not** literal
and **not** bounded - "Write the rule you want this round to use", no templates.

### G2 - the deterministic parser emits wrong rules and labels them SUPPORTED_RULE

The offline control is no longer a clean novelty proof, and what replaced it is
worse. `validateAndPrecompileRule` alone returns **VALID / `SUPPORTED_RULE`** with
a semantically wrong AST for two of the four prompts:

- **S1** -> `{"schemaVersion":1,"node":{"kind":"match_count_at_least","value":3}}`.
  `parseMatchCountThreshold` matches `at least three` within 80 characters of
  `drawn`, so "at least three **times** the highest drawn number" - a multiplier -
  is compiled as "at least 3 matching numbers". Fails 2/7 fixtures.
- **S3** -> an `and` of only three of the five comparisons (indexes 0, 1 and 4).
  `parsePositionComparisonRule` collects whatever ordinal pairs it can regex out,
  silently drops the elided "and so on" comparisons, and discards the governing
  "at least four of these five" quantifier by ANDing the clauses it found. Fails
  1/7 fixtures.

Neither result is flagged as partial or ambiguous. Both are reported as a
supported rule.

For a deterministic candidate the `provider_evidence` stage is **skipped**
("Skipped for the deterministic compiler path"), so no executed worked example
ever contradicts it. The only semantic check standing between a wrong regex AST
and acceptance is the reviewer LLM.

In this session the reviewer did hold that line - on every S1 and S3 probe the
reviewer's verdict matched the true rule and the deterministic draft was wrong,
verified independently:

```text
guess [41,20,66,36,65,42] draw [78,33,1,85,71,49] -> true LOSE, deterministic draft WIN
guess [1,7,8,9,10,11]     draw [1,2,3,4,5,6]      -> true WIN,  deterministic draft LOSE
```

The integrity of two of these four rules therefore rested entirely on a
stochastic 24B reviewer disagreeing with a deterministic component that the
system trusts by name.

`interpretation_coverage` and `agent_statement_coverage` both **passed** on S1's
`match_count_at_least 3` while the agent's own interpretation described a product
compared to three times the draw maximum. Those two gates did not notice that the
AST and the interpretation describe different games.

### G3 - the regex bug is offered to the player as a legitimate reading of their rule

S1's refusal reaches the player as `AMBIGUOUS_RULE` with three numbered choices.
Choice **(1)** is the regex artifact:

```text
(1) A guess wins if at least 3 of its numbers appear in the official draw,
    regardless of order.
```

That is not a reading of the player's sentence. It is a different game, produced
by a false positive, presented as an equal alternative and offered as a
one-click rewrite. Set 5's F2 was the tautological reading; this is the same
defect with a non-vacuous - and therefore undetectable - wrong rule.

S3 is the same shape: choice (1) is the three-of-five bug, choice (2) is
all-five-required, and only choice (3) is near the player's actual rule.

### G4 - the correct reading is regularly present and regularly discarded

In every one of the eight case-runs the **Rule Interpreter produced a correct,
precise restatement of the rule**. Examples, unedited:

- S1: *"sort its six numbers and multiply the first two (the two smallest).
  Compare that product to three times the maximum value in the official draw."*
- S3: *"evaluate five specific cross-position comparisons ... wins if the count of
  true comparisons is at least four. The sixth guessed number and the first drawn
  number are not used."*
- S4: *"filter ... where min(guess) > min(draw) ... calculate the range as
  max(guess) - min(guess). The guess with the lowest range wins. If there is a tie
  in range, the guess with the lowest sum wins."*

S2 run 2 went further and produced the exactly correct AST as reading (3),
`(max(draw) div 10) mod 10` - identical to this session's reference AST. It was
discarded with the other two.

The pipeline understands these rules. It cannot ship them.

### G5 - S2 is refused over a divergence that exists only at the value 100

S2's competing readings are behaviourally identical for every value from 1 to 99.
They differ only for `100`, because `digits(place:"tens")` is `floor(n/10) mod 10`
(so `100 -> 0`) while `n div 10` is `10`. Verified directly against the runtime.

The semantic sampler correctly found that single input
(`guess [1,20,40,60,80,100]`, `draw [95,96,97,98,99,100]`) and reported a real
disagreement. The product consequence is disproportionate: a rule that is
unambiguous across 99% of its domain is refused outright, and the player is asked
to arbitrate an invisible boundary case between two sentences that read almost
identically.

### G6 - the reading choices are unreadable, so the clarification flow cannot be used

PRD SS4.10 requires player-actionable copy. The choices shipped are AST prose:

```text
A guess wins if how many values are in the distinct values of the tens digits of
your numbers is at least 5 ...

A guess wins if the sum of each position of your numbers and the drawn numbers
combined into 1 when the value from the first list is greater than the value from
the second list, otherwise 0 is at least 4
```

The second is `describeAst`'s rendering of the counted-pairs idiom that
`patterns.md` SS2b prescribes as *the* way to compile novel compositions: the
`pairs_map` case renders as "each position of X and Y combined into <expr>".
The idiom the guidance mandates has no player-readable description, so the one
option that might be correct is the one the player is least able to recognise.

S3's readings (2) and (3) also cannot be told apart on the decisive point -
neither sentence reveals whether the comparison is same-position or shifted.

### G7 - the ranking refusal is still a dead end, and the diagnosis is still wrong

S4, both runs, final player-facing message:

```text
The wording leaves part of the winning condition undefined. The compiler cannot
choose the missing meaning without changing your intent.
```

with `refinementQuestions: []` and `suggestedRewrites: []`. The prompt defines its
eligibility ("all greater than the lowest drawn number"), its direction
("smallest distance"), and its tiebreak ("the smaller total wins"). Set 5's F4
reproduces exactly, and set 5's recommendation 5 ("never emit a refusal with an
empty question set and an empty rewrite set") is not satisfied on this path.

The mechanism is now precise. The compiler set `AMBIGUOUS_RULE`, which requires
`collectDivergentProviderReadings` to have returned at least two readings. Those
readings then failed `isPreflightViableRewrite` in `apps/api/src/index.ts`, so
`readingChoices` collapsed to empty - while the same `AMBIGUOUS_RULE` code
suppresses the "offer the unchanged rule as a retry" safety net, which is guarded
by `!reasonCodes.has("AMBIGUOUS_RULE")`. Ranking prose fails the viability filter
and lands in the gap between the two mechanisms, leaving the player nothing.

### G8 - the tertiary arbiter cannot answer, so set 5's arbitration fix is inert

Set 5's headline repair replaced the reviewer's one-shot veto with three-opinion
arbitration, breaking ties with the configured tertiary provider. That third
opinion is `qwen/qwen3.8-flash`, and it is structurally incapable of serving the
role:

```text
Format error : 'response_format.json_schema.schema'. ... When the schema contains
the fields "uniqueItems", "contains", "minContains", or "maxContains", the type
should not be "array"
```

`ticketSchema` in `packages/rule-compiler/src/index.ts` sets `uniqueItems: true`
on an array, so **every** compile call to this model returns HTTP 400. Across the
session: 3 hard schema-decode failures and 8 rate-limit retries, all on this one
model, and zero successful tertiary opinions. S3 was rejected on
`SECOND_OPINION_UNAVAILABLE` in both runs as a direct consequence.

`.env.example` points the tertiary tier at `groq` / `openai/gpt-oss-20b`; the
local `.env` points it at a model that cannot decode the schema. The arbitration
that is supposed to rescue a REVIEWER_MISMATCH has never once run.

### G9 - escalation is configured to the model it escalates from

`LLM_ESCALATION_MODEL=openai/gpt-oss-120b` is the same value as
`LLM_MODEL_COMPILE`. Every case in this session reported `escalated: true`,
because `isComplexRule` matches any rule containing "and"/"or"/"not"/"smallest"
and routes it proactively to the "stronger" model - which is the same model.

PRD SS7.3/7.4 specifies escalation to a *stronger* model. The audit log records an
escalation that adds no capability, and a reader of `escalated: true` would
reasonably conclude a second, stronger opinion was obtained.

### G10 - discarded deterministic candidates are invisible to operators

`rejectedCompilerAttempts[].candidate` was `null` for every S1, S3 and S4 attempt.
Only S2 recorded ASTs. The attempts that matter most - the ones where a wrong
deterministic artifact was drafted and vetoed - leave no inspectable AST in the
diagnostic payload, so G2 was only reconstructable by running the offline path
separately.

### G11 - the model still cannot keep a ranking fold self-consistent

S4 attempt 1 declared worked-example scores that did not match its own emitted AST
in 8 of 8 examples in run 1 and 5 of 5 in run 2 (`PROVIDER_EVIDENCE_UNVERIFIED`).
Set 5's F8 is unchanged: the `SCALE * primary +/- secondary` fold remains the
weakest measured capability, and the evidence gate catches every instance, which
is the gate working as designed.

### G12 - a latent settlement path validates rules with the buggy parser alone

`runRuleValidationCycle` in `apps/worker/src/rule-validation.ts` calls
`validateAndPrecompileRule` with no reviewer, no evidence gate and no LLM, and
publishes `compiledArtifact` and `compiledArtifactHash` with its decision. For
S1's text that path would publish `match_count_at_least 3` as a VALID artifact.

It has **no production caller** today, so this is a latent risk rather than an
active one - but it is a fully wired function whose only semantic guard is the
component proven wrong in G2.

## Answers to the questions this set asked

| Question | Result |
|---|---|
| Does a post-fix novel composition compile? | 0/4, twice |
| Is what compiled correct? | nothing compiled |
| Was any wrong artifact accepted? | No |
| Did the deterministic compiler produce a wrong artifact? | Yes, 2/4, labelled `SUPPORTED_RULE` |
| Is the refusal honest about its cause? | No - S1/S3 blame the player for a regex bug; S4's diagnosis is factually wrong |
| Is the refusal actionable? | S1-S3 offer unreadable choices; S4 offers nothing |
| Is the verdict repeatable? | Yes - 4/4 stable |
| Did arbitration run? | Never - the tertiary model returns HTTP 400 on every call |
| Did escalation add capability? | No - it escalates to the same model |

## Verdict

Settlement integrity held again: nothing mis-compiled was accepted, and the
reviewer correctly overruled the deterministic parser every time it mattered.
That is the system's real strength and it should be preserved.

But the trust question the user asked is answered plainly by 0/4 across two runs.
The pipeline cannot yet be trusted to deliver PRD SS6.1-6.2's free-form promise,
for three distinct reasons that compound:

1. **The compiler is now a source of wrong rules, not only a fallback.** G2 is the
   most serious finding in this session. A component that returns
   `SUPPORTED_RULE` with a different game than the player wrote, whose evidence
   gate is skipped by design, is a fidelity risk that did not exist when the
   deterministic path simply returned `UNSUPPORTED_RULE`. Its errors are then
   laundered into player-facing rewrites (G3).
2. **The safety nets are configured off.** Arbitration cannot run (G8) and
   escalation escalates to itself (G9), so the two mechanisms set 5's repair
   depended on contribute nothing while reporting success in the audit log.
3. **The refusal path cannot be acted on.** Unreadable AST prose (G6), a dead-end
   ranking refusal (G7), and a diagnosis that blames wording which is not at fault
   (G3, G7) mean a player who has paid a sequenced proposal fee has no route
   forward.

The measurement that matters most is the comparison with set 5. The same four
prompts that failed in set 5 now pass, and four new prompts of the same kind fail
completely. That is the signature of fitting to the test set rather than to the
capability (G1), and it means published pass rates on sets 1-5 should not be read
as evidence about rules a player has not yet written.

Highest-leverage repairs, in order:

1. Make the deterministic parser fail closed on partial matches. A parse that
   leaves intent-bearing text unconsumed (S3's elided comparisons, S3's "at least
   four of these five") or that matches a count cue inside a multiplier phrase
   (S1's "three times") must return `UNSUPPORTED_RULE`, not `SUPPORTED_RULE`.
   Require the same source-span coverage audit from the deterministic path that
   the provider path already passes, and stop skipping `provider_evidence` for it -
   run its own boundary examples instead.
2. Never present a deterministic-parser artifact as a candidate "reading" of the
   player's rule in the clarification UI.
3. Point the tertiary tier at a provider that can decode the compile schema (or
   drop `uniqueItems` from `ticketSchema` and validate uniqueness after decoding),
   and set `LLM_ESCALATION_MODEL` to a genuinely stronger model than
   `LLM_MODEL_COMPILE` - or stop reporting `escalated: true` when they are equal.
4. Give `describeAst` player-readable renderings for `pairs_map`, `ite`-counting
   and ranking folds, so the clarification flow the pipeline depends on is usable.
5. Close the S4 gap: when `AMBIGUOUS_RULE` is set but no reading survives the
   viability filter, fall back to the unchanged-rule retry rather than emitting an
   empty question set with a diagnosis of missing information.
6. Treat a near-boundary divergence like S2's (readings identical except at a
   single domain value) as a targeted question about that value, not as a total
   refusal.
7. Re-run this set - and a further unseen set - after each repair. A fix validated
   only against the prompts that motivated it cannot distinguish a causal fix from
   a fixture exception.

## Verification scope

`apps/api` lint passed with zero warnings including the new runner. The four
reference ASTs were executed against all 27 fixtures before the agent was judged
(27/27). The offline mode of the runner reproduces the deterministic-path finding
(G2) on demand. No package source or configuration was modified by this session,
so no package test ladder was re-run and no milestone checkbox was marked;
findings G1-G12 are reported for user decision before any repair is implemented.

---

# Addendum - Run 3, re-measured after the `aa3e63f` repairs

The same four prompts, unchanged, replayed after commit `aa3e63f` ("enhance rule
compiler with new predicate descriptions and validation checks"), which modified
`packages/rule-compiler` in response to findings G1-G12. This is therefore a
**cross-build comparison**, not a reproduction: runs 1-2 measured the pre-fix
build, run 3 measures the repaired one. The prompts, fixtures and reference ASTs
are byte-identical.

Environment note: PostgreSQL and Redis had stopped between sessions, so Docker
Desktop and both containers were restarted and `apps/api` was relaunched on
`127.0.0.1:3099` against the rebuilt compiler before measuring.

## Results

| ID | Runs 1-2 (pre-fix) | Run 3 (post-fix) | Fixtures on the returned AST |
|---|---|---|---|
| S1 | INVALID, INVALID | **VALID**, 106 s, confidence 0.936 | **7/7 correct** |
| S2 | INVALID, INVALID | **VALID**, 60 s, confidence 0.936 | **7/7 correct** |
| S3 | INVALID, INVALID | stream terminated at 312 s; retry INVALID, 33 s | no AST returned |
| S4 | INVALID, INVALID | INVALID, 147 s, confidence 0.869 | no AST returned |

- Compilation rate: **2/4**, up from 0/4.
- Semantic accuracy of what compiled: **14/14 fixtures**. No mis-compiled artifact
  was accepted, so the "announced equals settled" property still holds.
- Provider faults: **0** schema-decode rejections (was 3) and 3 rate limits, all on
  the reviewer rather than the tertiary tier (was 8, all tertiary).
- S1's accepted AST is **byte-identical to this set's hand-written reference AST**.

## Findings closed by `aa3e63f`

- **G2 - the deterministic parser no longer emits wrong rules.** The offline
  control now returns `UNSUPPORTED_RULE` for all four prompts, replacing the two
  `SUPPORTED_RULE` artifacts that were semantically wrong. `parseMatchCountThreshold`
  refuses when the number is a multiplier ("at least three times"), and
  `parsePositionComparisonRule` refuses a sentence that counts comparisons or
  abbreviates them with an ellipsis.
- **G8 - the tertiary arbiter can answer.** `uniqueItems` was removed from the
  compile JSON schema (uniqueness is now checked after decoding), and no HTTP 400
  schema-decode rejection occurred in this run.
- **G9 - escalation no longer reports itself when it is a no-op.** Proactive
  routing is now guarded by `!sameModel(escalationModel, agentConfig.model)`;
  `escalated` was `false` throughout this run.
- **G7 (partly) - the ranking refusal is no longer a dead end.** `AMBIGUOUS_RULE`
  is dropped from the reason codes when fewer than two readings survive, which
  re-enables the unchanged-rule retry. S4 now ships one rewrite instead of none,
  and its message attributes the fault correctly: "Your wording is clear, but
  independent compiler attempts produced different executable readings. This is a
  compiler conflict, not a missing answer from you." The earlier, factually wrong
  "the wording leaves part of the winning condition undefined" is gone.

Notably, the repair for G2 was **not** another literal-phrase compile path. The
load-bearing change is in `interpretationCoverage.ts`, which now tracks
`comparison_count` and `product` as intent-bearing operations, so any AST that
drops the aggregation or the multiplication fails the coverage gate regardless of
which component produced it. That gate is observably working: S3 attempt 2 was
rejected with "missing operations: comparison_count". No bespoke parser was added
for S4's family.

## Findings still open

### H1 - S2 compiles a reading that differs from the prompt at the value 100

The accepted S2 AST uses the tens-**range** reading (`elem div 10 == max(draw) div 10`)
rather than the tens-**digit** reading the prompt asks for. Executed against the
reference AST, the two agree everywhere except when the draw's maximum is 100 and
the guess contains a single-digit number:

```text
guess [5,11,22,33,44,55] draw [10,20,30,40,50,100] -> accepted LOSE, reference WIN
```

In runs 1-2 this same 100-boundary divergence caused an outright refusal. It is
now resolved silently in favour of one reading, and the player is not told which
one was chosen or that a choice was made. Shipping a rule beats refusing it, but
the resolution should be surfaced rather than hidden.

### H2 - S3's compile request can die without a terminal event

S3's first run 3 attempt streamed four `compiling` stages and then the NDJSON
connection was terminated by the server at 312 s, with no terminal event and no
verdict - against a documented contract that "every exit lands a terminal event,
which is what lets attached readers rely on one terminal event, exactly once".
`LLM_TIMEOUT_MS` is 300000, which the 312 s failure point matches closely. The API
process itself stayed healthy, so this is a per-request stream fault.

The job registry did keep the pipeline running: re-issuing the same request
returned a verdict in 33 s with five recorded attempts. That is the resumable
behaviour PRD SS6.15.1 promises, and it worked - but the first client saw only a
dropped connection.

An earlier attempt of the same case exceeded the runner's own 900 s ceiling, so S3
costs somewhere between 5 and 15 minutes of paid provider traffic per refusal.

### H3 - S3 still cannot compile, and its reading choices remain unusable

Five attempts produced two malformed responses, one AST that dropped the
aggregation, one with incomplete span coverage, and one whose declared examples
contradicted its own AST. The first of the three readings offered to the player
reads:

```text
(1) ((((1 when the 1st value of your numbers is greater than the 2nd value of the
    drawn numbers, otherwise 0 plus 1 when ... ) plus 1 when ... ) is at least 4
```

Reading (1) is in fact **semantically correct** - an unrolled five-term sum
compared against 4 - but it is rendered as nested arithmetic prose no player can
evaluate. Reading (2) is off by one position, and reading (3) is incoherent. The
new `describePairComparisonCountPredicate` renderer does produce readable text,
but only for the canonical `pairs_map` shape; these candidates are unrolled
`arith add` chains and miss that path entirely.

### H4 - the ranking fold remains the blocking capability for S4

Two of S4's three attempts failed `PROVIDER_EVIDENCE_UNVERIFIED` on every declared
example score. G11 is unchanged: the `SCALE * primary +/- secondary` fold is still
the weakest measured capability, and the evidence gate catches it every time.

### G1 - the overfitting question is now answered more favourably

Set 5's repair fitted its prompts and scored 0/4 on this set. This repair scored
2/4 on prompts it was written against, but it did so through a coverage invariant
rather than per-prompt parsers, and it left S3 and S4 failing rather than forcing
them through. That is the healthier signature. It is still a fix measured against
the prompts that motivated it: a further unseen set is required before the
improvement can be attributed to capability rather than to this corpus.

## Verdict

The direction of travel is right. Compilation went from 0/4 to 2/4 with no loss of
settlement integrity, the most dangerous finding (G2, a deterministic component
emitting a different game and labelling it supported) is closed, the provider tier
that could never answer now answers, and the refusal copy now blames the compiler
when the compiler is at fault.

What still blocks trust is narrower than before and mostly concentrated in two
places: the counted-pairs composition that `patterns.md` itself prescribes for
novel rules cannot be compiled or described (H3), and the ordered-criteria ranking
fold cannot be produced self-consistently (H4). Added to those is one new
availability defect (H2) and one silent semantic choice (H1).

Next repairs, in order:

1. Emit a terminal event on LLM timeout instead of terminating the NDJSON stream,
   so a timed-out compile is reported rather than dropped (H2).
2. Normalise unrolled `ite`-sum chains to the canonical `pairs_map` counted-pairs
   shape before describing or comparing them, so the correct reading is both
   recognised as one reading and rendered legibly (H3).
3. Surface, rather than hide, a resolved boundary ambiguity like the tens-digit
   versus tens-range choice at 100 (H1).
4. Keep the ranking fold out of the provider's hands: derive `SCALE` and the
   worked-example scores deterministically from the emitted AST rather than asking
   the model to declare them (H4).
5. Run a seventh, unseen set before treating any of this as a capability gain (G1).

## Addendum verification scope

`apps/api` lint passed with zero warnings. The runner's stream loop was hardened so
a mid-stream abort is recorded as a transport fault on that case instead of
crashing the whole run - the first run 3 attempt was lost to exactly that. The
reference ASTs were re-executed against all 27 fixtures (27/27) on the rebuilt
compiler before judging the agent. No package source or configuration was modified
by this addendum, and no milestone checkbox was marked.
