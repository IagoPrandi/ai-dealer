# Rule Proposal Prompt Test Set 5 - Novel-Composition Session

Fifth rule-agent test set. Sets 1 and 2 measured coverage over curated prompts,
set 3 added a behaviour oracle, and set 4 turned the eight product questions into
an adversarial regression corpus. This set asks a narrower question that none of
them answers directly:

> When a player writes a rule that has **no precedent anywhere in the corpus, the
> deterministic compiler, or the authoring examples**, does the pipeline produce a
> correct executable rule - and if it refuses, is the refusal honest, actionable,
> and repeatable?

Context opened before this session: `PRD.md` (SS4.5 rule proposal UX, SS4.10 UX
copy, SS6.2 free-form input, SS6.6 vague-rule clarification, SS6.15 preflight,
SS7.2 multi-agent pipeline, SS7.3-7.4 multi-LLM configuration and confidence,
SS7.5 compilation flow), `.claude/CLAUDE.md`, `.claude/skills`,
`packages/rule-compiler/rule-authoring/SKILL.md` with `references/patterns.md`,
and `docs/rule-proposal-prompt-test-set-4.md`.

## Method

- Four prompts, each a composition that appears in no earlier set.
- **Novelty is proved, not asserted.** Every prompt was first pushed through
  `validateAndPrecompileRule` alone (`--offline`). All four returned
  `UNSUPPORTED_RULE` + `UNSAFE_RUNTIME_BOUNDS`, so the deterministic parser
  contributes nothing and the model carries the whole compilation.
- **The two-phase player flow.** Earlier sets called `phase: "compile"` directly.
  The Create screen never does that: it calls `phase: "interpret"`, shows the
  reading, and compiles with `approvedInterpretation`
  (`apps/web/src/features/tyche/screens/Create.tsx`). This set replays that exact
  handoff, which is what exposed finding F3.
- **Per-stage capture.** Requests use the NDJSON transport, so every
  `RulePreflightProgressStage` is recorded with its offset.
- **Behaviour oracle.** The AST returned by the API is executed against boundary
  fixtures derived from the original prompt - never from the agent's prose.
  Predicates run through `evaluatePredicate`; the ranking case scores every
  competing ticket with `evaluateRankingEntry` and resolves the winner set with
  `resolveRankingWinners`, so eligibility and the tiebreak fold are both tested.
- **Two identical runs**, because `:cloud`/hosted models ignore `LLM_SEED` and
  acceptance stability is itself a product property.

Environment: `apps/api` on `127.0.0.1:3199` with PostgreSQL and Redis healthy.
Primary/compile `openai/gpt-oss-120b`, reviewer `mistralai/mistral-small-24b-instruct-2501`,
guardian `openai/gpt-oss-safeguard-20b`, all through OpenRouter.
`LLM_ESCALATION_MODEL` empty, `LLM_TRANSLATE_TO_ENGLISH=false`.

Run locally:

```text
pnpm --filter @tyche/api stress:rules:set5 -- http://127.0.0.1:3099 --compact
pnpm --filter @tyche/api stress:rules:set5 -- unused --offline --compact
```

## Corpus

| ID | Prompt | Capability under test | Expected |
|---|---|---|---|
| N1 | Guess spread (max minus min) is at least 20 greater than the draw spread | arithmetic over two aggregates | VALID |
| N2 | The six picks strictly alternate odd/even in the order chosen **and** at least one is drawn | shifted zip over the guess plus a conjunct | VALID |
| N3 | Among tickets summing to no more than the drawn total, most matches wins; ties go to the larger sum | ranking with `eligibleWhen` and a two-criterion fold | VALID |
| N4 | Count of picks above the highest drawn number exceeds the count below the lowest by at least 2 | cross-array counting with a signed margin | VALID |

Twenty-one fixtures in total: 5 for N1, 7 for N2 (including the two inputs the
reviewer got wrong), 4 ranking scenarios for N3, and 5 for N4. Each set pairs an
exactly-on-threshold win with a one-unit-outside loss, and N1 additionally varies
only the draw to prove the rule is not guess-only.

## Results

| ID | Run 1 | Run 2 | Fixtures on the returned AST |
|---|---|---|---|
| N1 | VALID, 62 s, confidence 0.936 | VALID, 71 s, confidence 0.936 | 5/5 correct |
| N2 | INVALID, 164 s, confidence 0.869 | INVALID, 401 s, confidence 0.377 | no AST returned |
| N3 | INVALID, 244 s, confidence 0.869 | INVALID, 3 s, confidence 0.936 | no AST returned |
| N4 | VALID but clarification-blocked, 102 s | VALID and released, 93 s | 5/5 correct |

- Compilation rate: **2/4**.
- Semantic accuracy of what did compile: **10/10 fixtures**. No mis-compiled
  artifact was accepted in either run, so the "announced equals settled"
  property held everywhere it could be measured.
- Acceptance stability: **1 of 4 rules flipped verdict** between two identical
  runs with no input change.
- Latency spread: 3 s to 401 s.
- Nine HTTP 429 responses from the reviewer model during a single-user
  sequential run.

## Findings

### F1 - the reviewer veto is unarbitrated and can discard a correct artifact

N2, run 1, attempt 0: the compiler produced

```text
and(
  pairs_forall(slice(guess,0,-1), slice(guess,1), (left mod 2) != (right mod 2)),
  count(intersection(guess,draw)) >= 1
)
```

which is exactly the rule. It passed `schema_validation`, `provider_evidence`
(its own worked examples were executed against it), `runtime_bounds`,
`interpretation_coverage`, `agent_statement_coverage`, and `runtime_harness`.
The single failed stage was `independent_review`:

```text
The independent reviewer and draft disagree for guess [6,5,4,3,2,1]
and draw [1,2,3,4,5,6]: reviewer=LOSE, draft=WIN.
```

That guess alternates (even, odd, even, odd, even, odd) and every value is drawn,
so the correct outcome is WIN. **The reviewer was wrong and the draft was right.**
Re-executing the discarded candidate against this set's fixtures gives 7/7
correct. Run 2 reproduced the same shape on a different input
(`guess [1,7,8,9,10,11]`, reviewer WIN, draft LOSE, and 1 followed by 7 is not
alternating - the draft was right again).

`REVIEWER_MISMATCH` is a hard veto in
`packages/rule-compiler/src/index.ts`: a candidate carrying executed evidence
loses to a reviewer AST carrying none, with no arbitration, no evidence
weighting, and no third opinion. The stronger compile model is overruled by the
weaker review model.

### F2 - the refusal blames the player's wording, and offers a degenerate reading

The F1 rejection surfaces as `AMBIGUOUS_RULE`: *"This wording has 2 different
executable readings, so which guesses win is not decided yet. Only you can say
which one you meant."* The wording had one reading; two models disagreed about it.

The second reading offered to the player is:

```text
every value of your numbers satisfies that (the value modulo 2) is equal to 0
or (the value modulo 2) is equal to 1
```

That clause is a tautology - it admits every possible guess. A reading whose
constraint is vacuous is presented as an equal alternative, even though
`analyzeRuleSemanticImpact` already knows how to detect trivially-true logic.

The same text also fails the UX copy guidance in PRD SS4.10: *"in every position
of positions 1 to -1 of your numbers"* and *"how many values are in the values
present in both your numbers and the drawn numbers"* are AST prose, not language
a player can act on.

### F3 - the escalation safety net cannot fire on the path the UI uses

PRD SS7.3/7.4 specify escalation to a stronger model on an invalid artifact or a
guardian-flagged drift. In `apps/api/src/index.ts` the trigger is:

```text
needsEscalation = !approvedInterpretation && (decision !== "VALID" || grounded === false)
```

The Create screen always sends `approvedInterpretation` on compile, so
`needsEscalation` is always false in the real player flow. `LLM_ESCALATION_MODEL`
is additionally empty in `.env`, so the net is off twice over. All three
problematic cases in this session (N2, N3 invalid; N4 guardian-flagged) are
exactly the conditions it exists to catch, and it never ran once - `escalated`
was `false` in every response.

### F4 - a rejection can be a dead end

N3, run 1, final player-facing message:

```text
The wording leaves part of the winning condition undefined. The compiler cannot
choose the missing meaning without changing your intent. Define the missing
threshold, comparison direction, position, digit meaning, boundary, or tie
behavior.
```

with `refinementQuestions: []` and `suggestedRewrites: []`. The prompt defines
its threshold (`no more than the drawn total`), its direction (`the most`), and
its tiebreak (`the larger sum wins`), so the diagnosis is wrong, and it ships
with nothing the player can act on. A player who has paid a sequenced proposal
fee has no next step.

### F5 - ranking disagreements are undiagnosable

`describeSemanticDisagreement` compares ranking outcomes with `!==` on the
objects returned by `evaluateRankingEntry`, so two distinct objects always differ
and the first probe input is always reported:

```text
The independent reviewer and draft disagree for guess [1,2,3,4,5,6] and
draw [1,2,3,4,5,6]: reviewer=[object Object], draft=[object Object].
```

All six of N3's attempts recorded this. The gate itself is correct -
`astsAreSemanticallyEqual` compares `score` and `eligible` field by field - but
the only evidence an operator ever reads is both misleading (wrong input) and
unreadable (stringified objects).

### F6 - groundedness is a non-deterministic gate on a correct rule

N4 produced an identical, exactly correct AST in both runs (5/5 fixtures). Run 1
returned `guardianGrounded: false`, which set `needsClarification` and blocked
the proposal. Run 2 returned `guardianGrounded: true` and released it. Same text,
same artifact, opposite outcome. The code comments at the fidelity check already
document that groundedness under-scores novel compositions; this session
measured it happening on an artifact with no defect.

The one thing the pipeline does well here is stay honest about it: *"Your rule is
clear and compiled successfully, but the fidelity check could not verify that the
compiled condition preserves the reading you approved. Retry generation; you do
not need to rephrase the rule."*

### F7 - provider limits reject rules, and the two roles share a provider

Nine 429 responses from OpenRouter on
`mistralai/mistral-small-24b-instruct-2501` during a single-user sequential run.
The consequence is `SECOND_OPINION_UNAVAILABLE`, which fails closed:

```text
The required independent validation attempt was unavailable. The confidence
policy requires that check before accepting this rule.
```

N3, run 2, was rejected in 3.4 seconds on this alone. Failing closed is the right
default for settlement integrity, but as written a transient provider limit is
indistinguishable to the player from a rejected rule, the repair loop retries
against the same rate-limited model, and the tertiary provider configured in
`.env` is never consulted.

### F8 - the model cannot keep a ranking fold self-consistent

N3's provider attempts declared worked-example scores that did not match their
own emitted AST in 8 of 8 examples (`PROVIDER_EVIDENCE_UNVERIFIED`). The
`SCALE * primary + secondary` fold prescribed by
`rule-authoring/references/patterns.md` section 2c is the weakest capability
measured in this session; the evidence gate caught every instance, which is the
gate working as designed.

### F9 - cost of a refusal

N2 run 2 spent 401 seconds and six compilation attempts to produce a rejection.
At the 20-minute test turn duration that is 3% of the whole turn for one failed
proposal, and every attempt is paid provider traffic.

## Answers to the questions this set asked

| Question | Result |
|---|---|
| Does a novel composition compile? | 2/4 |
| Is what compiled correct? | 10/10 fixtures, both runs |
| Was any wrong artifact accepted? | No |
| Is the refusal honest about its cause? | N4 yes; N2 and N3 no (F2, F4) |
| Is the refusal actionable? | N4 yes; N3 no |
| Is the verdict repeatable? | No - 1 of 4 flipped (F6) |
| Did the PRD escalation path run? | Never (F3) |

## Verdict

Settlement integrity held: nothing mis-compiled reached acceptance, and both
accepted artifacts execute their prompt exactly, including boundaries. The
failures in this session are not integrity failures - they are availability,
attribution, and determinism failures. A correct artifact was discarded (F1), a
correct artifact was blocked by a coin-flip guard (F6), and in both cases the
player was told their wording was at fault.

The gap this exposes is against PRD SS4.5 and SS6.2, which promise free-form rule
creation with no templates. Rules whose shape already exists in the corpus pass;
genuinely novel ones passed roughly half the time, and only when the reviewer
model happened to agree and the provider happened to answer.

Highest-leverage repairs, in order:

1. Arbitrate `REVIEWER_MISMATCH` instead of vetoing on it - prefer the candidate
   with verified executed evidence, or break the tie with the configured tertiary
   provider, and never present a trivially-true reading as an alternative.
2. Re-enable escalation on the `approvedInterpretation` path and configure
   `LLM_ESCALATION_MODEL`, so PRD SS7.3/7.4 is effective where players actually
   are.
3. Treat a rate-limited reviewer as a transport fault with retry/backoff and a
   fallback provider, distinct from a rejected rule.
4. Fix `describeSemanticDisagreement` for rankings (compare `score`/`eligible`,
   not object identity) so ranking rejections can be investigated.
5. Never emit a refusal with an empty question set and an empty rewrite set.

## Verification scope

`apps/api` lint passed with zero warnings on the new runner. The offline mode of
the runner reproduces the novelty control (4/4 `UNSUPPORTED_RULE`). No package
source was modified by this session, so no package test ladder was re-run and no
milestone checkbox was marked; findings F1-F9 are reported for user decision
before any repair is implemented.
