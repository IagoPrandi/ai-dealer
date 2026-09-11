# Rule Proposal Prompt Test Set 8 - Novel Compositions and the Clarification Loop

Session date: 2026-09-10. Build `c397d48`. Live `POST /rule-preflight` on a
dedicated API process (`PORT=3097`), OpenRouter profile from `.env`:

| Role      | Model                                     |
| --------- | ----------------------------------------- |
| interpret | `qwen/qwen3.8-27b`                        |
| compile   | `openai/gpt-oss-120b`                     |
| review    | `mistralai/mistral-small-24b-instruct-2501` |
| guardian  | `openai/gpt-oss-safeguard-20b` (Groq)     |
| escalation| `openai/gpt-oss-120b`                     |

Runner: `apps/api/scripts/rule-preflight-novel-set-8.mjs`
(+ `apps/api/scripts/set-8-round2.json`, written **after** round 1 from the
questions the agent itself asked).

## Method

- **Four novel prompts + two deliberately imprecise ones**, as asked.
- **Novelty is proved, not asserted.** All six were first pushed through
  `validateAndPrecompileRule` offline: 6/6 returned `UNSUPPORTED_RULE`, so no
  existing deterministic pattern covers them.
- **Expressibility is proved before the agent is judged.** A reference AST was
  written for each objective rule and executed against the boundary fixtures:
  **27/27 pass in round 1, 13/13 in round 2**. Every refusal below is therefore a
  policy decision, never a DSL limit.
- **The two-phase player flow**, exactly as `Create.tsx` performs it:
  `phase: "interpret"` → approve → `phase: "compile"` with
  `approvedInterpretation`. When interpret asks for clarification, compile is
  called without approval (this is what exposed H6).
- **Behaviour oracle.** Every accepted AST **and every discarded candidate AST**
  is executed against fixtures written from the ORIGINAL prompt. Agent prose is
  never the oracle.
- Round 2 replays the two vague rules with the players' answers to the agent's
  own questions, plus three isolation retries that each change exactly one thing.

## Corpus

| ID  | Capability axis (absent from sets 1-7)                                                          |
| --- | ---------------------------------------------------------------------------------------------- |
| N1  | tiered per-element scoring: `map` + nested `ite`, inner branch an `exists` over the draw        |
| N2  | count threshold against a **derived draw statistic** (the mean) + an extreme-value clause       |
| N3  | set algebra at the **digit** level: `distinct(digits(units))` + intersection cardinality        |
| N4  | **min**-direction ranking on `abs(range_span(guess) - range_span(draw))` + negative eligibility |
| V1  | two undefined magnitudes *and* an undefined comparison target                                   |
| V2  | undefined branch condition + self-reference to an unstated default ("the usual applies")        |

Round 2: `V1b`/`V2b` (clarified), `N1b` (N1 minus the tie sentence), `N3b` (N3
verbatim, stability), `N4b` (N4 with "comes closest" → "smallest difference").

## Results

| Case | Verdict | Fixtures | Latency | Candidates discarded |
| ---- | ------- | -------- | ------- | -------------------- |
| N1   | CLARIFY | - | 130 s | 3 (**3 correct**) |
| N2   | **VALID** | **8/8** | 152 s | 2 (1 correct) |
| N3   | CLARIFY | - | 274 s | 6 (**5 correct**) |
| N4   | CLARIFY | - | 12 s | 1 (no AST) |
| V1   | CLARIFY (expected) | - | 27 s | 2 (no AST) |
| V2   | REPROPOSAL_BLOCKED | - | 23 s | 0 |
| V1b  | **VALID** | **6/6** | 132 s | 0 |
| V2b  | **VALID** | **7/7** | 152 s | 0 |
| N1b  | CLARIFY | - | 200 s | 3 (**2 correct**) |
| N3b  | CLARIFY | - | 183 s | 3 (**2 correct**) |
| N4b  | CLARIFY | - | 453 s | 4 (**2 correct**) |

Headline numbers:

- **Compilation rate on novel rules: 1/4** (N2). Retried with one variable
  changed each: still 0/3.
- **Clarification detection: 2/2**, with specific, player-readable questions.
- **Clarification follow-through: 2/2** - both clarified rules compiled on the
  first attempt and scored **13/13** on fixtures. Set 7 scored 0/2 here.
- **Semantic accuracy of everything accepted: 21/21 fixtures. No wrong artifact
  was accepted on the approved-interpretation path.**
- **Discarded candidates that were behaviourally correct: 15 of 20 (75 %).**
- One severe non-deterministic fabrication on the unapproved-compile path (H6).

## Findings

### H1 - the agent's own normalization injects "prize" and the compiler then blocks the rule

N1's player text passes the external-dependency gate
(`hasExternalDependency` = false). The interpret step rewrites the tie sentence:

```text
player     : ... and tickets on the same total split it equally.
normalized : ... with ties splitting the prize equally.
operational: "Ties on the highest score result in an equal split of the prize ..."
```

`prize` is an `EXTERNAL_DEPENDENCY_PATTERNS` entry, so compile answers *"The rule
depends on information outside the guess and official draw"* - about a rule that
only ever reads guess and draw. `PROTOCOL_TIE_BREAK_CLAUSE_PATTERN` does not
rescue it, because it requires a `tickets?|guesses?|players?` noun before the tie
word and the agent wrote "with ties splitting …".

Proof it is the agent, not the player: **N1b is N1 with the tie sentence deleted,
and `EXTERNAL_DEPENDENCY` disappears from the reason codes.**

The operational clause added under PRD §6.7 is itself phrased with the banned
noun, so the pipeline can manufacture this block on any ranking rule.

### H2 - "each of your numbers is worth N points" demands a `forall` the scoring AST cannot have

`analyzeInterpretationCoverage` harvests `all_guess` from "each of your numbers …"
and reports `missing operations: all_guess` against a score that sums over every
guessed number - which is the same claim, expressed as a fold. Reproduced
offline on both the player text and the normalized text:

```text
player     -> missingOperations: ["all_guess"], required: [all_guess, distance, sum]
normalized -> missingOperations: ["all_guess"], required: [all_guess, distance, membership, sum]
```

Every N1/N1b candidate that scored 6/6 on fixtures was rejected with
`INTERPRETATION_MISMATCH` for this reason alone. The gate has no notion that a
`reduce(sum, map(guess, …))` quantifies over the whole ticket.

### H3 - the agent's own parenthetical gloss vetoes the artifact

N3's interpretation is verbatim correct and says *"the last digit (value modulo
10)"*. `agent_statement_coverage` parses "modulo" as a required `mod` operation;
the correct AST uses the `digits` node - which **is** modulo 10 - so the gate
reports:

```json
{"covered":false,"missingOperations":["mod"],"requiredOperations":["distinct","mod","digit"]}
```

→ `AGENT_STATEMENT_MISMATCH`, five correct ASTs discarded in round 1 and two more
in round 2. This is deterministic and reproducible offline, and it is caused
purely by the explanatory phrasing the agent chose for the player.

### H4 - the model's own arithmetic, not the AST, is what fails `provider_evidence`

`PROVIDER_EVIDENCE_UNVERIFIED` is attached to **10 of the 15 correct-but-discarded
candidates**. The stage detail is always of the form *"Example 0: Declared score
does not match the candidate AST"*: the model emitted a correct AST and then
mis-computed its own worked example. N4b #2 and #3 are exactly this - 6/6 on
fixtures, discarded because the model cannot evaluate its own scoring fold.
Set 5 F8 and set 6 G11 reported the same inability; it is still live and it is
now the single biggest cause of correct artifacts being thrown away.

### H5 - the vocabulary gate misreads an exactly-defined rule, and the remedy offered is the player's own sentence

N4 says "comes closest to the spread of the draw", which is exactly
`min |range_span(guess) − range_span(draw)|`. `AMBIGUOUS_PATTERNS` matches
`close|closest`, so the run ended in 12 s with `difficulty: IMPOSSIBLE` and one
server-template question:

> "What exact match count or numeric distance defines this near match?"

There is no "near match" anywhere in the rule. Meanwhile the agent's own
`officialInterpretation` for the same request describes the rule perfectly.

N4b removes the trigger word: interpret then returns a perfect reading with no
clarification needed, and compile **still** refuses (`AMBIGUOUS_RULE`,
`PROVIDER_DISAGREEMENT`) - while `suggestedRewrites` contains **the player's own
text, verbatim, as the suggested fix**. The refusal loop has no exit, exactly as
recorded in set 7, now on a different rule and a different trigger.

### H6 - SEVERE: compile without an approved interpretation can fabricate an unrelated rule and call it VALID

V2 ("If the draw comes out mostly high, a guess wins by staying low; otherwise
the usual applies") is correctly detected as vague by interpret. Calling
`phase: "compile"` without `approvedInterpretation` returned, in **2 of 7 runs**:

```json
{"decision":"VALID","finalConfidence":0.936,"reasonCodes":["SUPPORTED_RULE"],
 "ast":{"schemaVersion":1,"node":{"kind":"match_count_at_least","value":4}},
 "officialInterpretation":"A guess wins if at least 4 of its numbers appear in the official draw, regardless of order.",
 "coverage":{"missingFromAst":[],"missingOperations":[]},
 "reproposalBlocked":true}
```

Nothing in the player's text mentions matching four numbers. The coverage gate
reported **clean** on a fabricated rule, and the only thing that stopped the
artifact was the canonical-signature re-proposal gate - i.e. the accident that
`match_count_at_least 4` had already been a Rule of the Hour in this database.
On a fresh registry this is an accepted artifact that pays a prize pool for a
rule nobody proposed.

Scope, stated precisely: `Create.tsx` only calls compile after an explicit player
confirmation, so the browser flow does not reach this today. The exposure is the
API itself, which accepts the request and answers `VALID` - and the API, not the
client, is the trust boundary (see the unauthenticated-settlement note in
`SECURITY-REVIEW.md`). The other 5 runs returned `INVALID` correctly, so this is
a stochastic path, which makes it harder to notice, not safer.

### H7 - the clarification loop closes now, but it can also invent the question it answers

Both vague rules produced good questions and both clarified rewrites compiled
correctly on the first attempt (`V1b` 6/6, `V2b` 7/7, confidence 0.936, zero
rejected candidates, and neither text is a deterministic pattern match - the
model compiled them). That is a real improvement over set 7's 0/2.

The caveat is in V1's third question: the player wrote "noticeably bigger than
the drawn ones" with no notion of position, and the agent's reading was already
*"counts how many positions satisfy `guess[i] > draw[i] + margin`"*. It did ask
whether the comparison is positional, so the invention is visible and
answerable - but the reading was formed before the question was asked, and a
player who answers "yes, positional" is confirming the agent's assumption rather
than their own rule.

### H8 - the set-7 parser over-claim did not reproduce on this corpus

N2's wording ("at least four of its numbers … the six drawn numbers") is exactly
the shape that `parseMatchCountThreshold` mis-claimed as `match_count_at_least 4`
in set 7. Offline, all six prompts now return `UNSUPPORTED_RULE`, and N2's live
compile produced the correct `filter`/`count`/`mean` AST. No silent over-claim in
this set.

Also verified: N2's AST divides with `arith.div`, which truncates. For integer
guess values, `x > trunc(sum/6)` and `x > sum/6` agree for every draw, so the
truncation is not a fidelity defect here - it was checked rather than assumed.

## What this says about trusting the agent

Trustworthy today:

- **Interpretation.** Every one of the 11 case-runs was understood correctly,
  including all four novel compositions. Not one `officialInterpretation` was
  wrong.
- **Settlement integrity on the approved path.** 21/21 fixtures on everything
  accepted; no wrong artifact was frozen.
- **Vagueness detection and, now, recovery.** 2/2 detected, 2/2 recovered.

Not trustworthy yet:

1. **Acceptance policy, not model quality, is what blocks shipping.** 15 of 20
   discarded ASTs were behaviourally correct. Three independent gates
   (`interpretation_coverage`, `agent_statement_coverage`, `provider_evidence`)
   each reject correct artifacts, and two of them are triggered by wording the
   **agent itself** produced (H1, H2, H3).
2. **A refusal is still a dead end.** N4b's only suggested rewrite is the
   player's own sentence; N1 got no question and no rewrite at all.
3. **A vague rule can still become a confident, unrelated artifact** on the
   unapproved-compile path, caught only by a duplicate-signature accident (H6).
4. **Non-determinism.** The same text yields VALID or INVALID across runs
   (V2: 2/7). Acceptance is not yet a property of the rule.
5. **Cost of a refusal.** 12 s to 453 s per attempt, and 20 rejected compilation
   attempts to accept three rules.

## Verification scope

- `--refs`: 27/27 (round 1) and 13/13 (round 2) reference fixtures pass.
- `--offline`: 6/6 round-1 and 5/5 round-2 prompts unsupported by the
  deterministic parser (novelty proof).
- Live: 11 case-runs over two rounds plus 7 V2 repetitions.
- `--verify-rejected`: 20 discarded candidate ASTs executed against the same
  fixtures.
- Raw NDJSON kept in the session scratchpad; the runner reproduces it with
  `node scripts/rule-preflight-novel-set-8.mjs http://127.0.0.1:<port>`.

## Repair addendum (2026-09-10)

The causal repairs prompted by this report are now implemented. This addendum
supersedes the open status of H1-H7 above; H8 required no change because the
reported parser over-claim did not reproduce.

- **H1/H5 — protocol language and objective rankings:** interpreter-authored
  tie forms such as "with ties sharing the prize equally" and "players that are
  equally close share it" are stripped as protocol clauses before dependency
  and ambiguity analysis. `closest` and `nearest` are no longer blanket
  ambiguity triggers because they define an objective argmin ranking; genuinely
  vague `close`, `near`, and `almost` wording remains blocked. A trailing,
  player-authored prize dependency is still detected.
- **H2/H3 — equivalent executable operations:** coverage now recognizes a
  `map` over the whole guess as satisfying an "each number scores" requirement,
  and recognizes `digits(place: "units")` as the canonical modulo-10 projection.
  The acceptance gates therefore compare semantics rather than demanding one
  spelling of the AST.
- **H4 — unreliable declared arithmetic:** worked-example inputs remain
  mandatory and are still executed by the server. A wrong declared score or
  outcome may now be corrected only when a separate source-only reviewer has
  already agreed with the candidate's executable behavior. Without that
  independent agreement, or when an example is malformed, compilation still
  fails closed.
- **H6 — unapproved compilation:** the API now rejects compile requests that
  omit a complete, source-bound `approvedInterpretation` with HTTP 400 and
  `missing_approved_interpretation`, before allocating a job or calling a model.
  The legacy omitted-phase request follows the same compile contract. The PRD
  now states this trust-boundary requirement explicitly.
- **H7 — assumptions inside clarification:** whenever clarification is still
  required, the server restores `normalizedText` to the translated player text,
  clears operational clauses, and replaces any declarative interpretation with
  a neutral incomplete-reading statement plus the unresolved questions. The
  prompt contract is versioned to v6 and forbids selecting a missing dimension
  before the player answers.
- **Runner classification:** a deliberate compile refusal with
  `missing_approved_interpretation` is classified as `CLARIFY`, so the harness no
  longer treats the new fail-closed boundary as a transport failure.

Post-repair verification on the final tree: compiler tests **125/125**, API tests
**255/255**, typecheck, zero-warning lint, and production builds all pass for
both packages. Reference ASTs remain schema-valid and pass **27/27** fixtures.
After rebuilding `dist`, the offline novelty control emits no
`AMBIGUOUS_RULE` for N1-N4; all four remain safely `UNSUPPORTED_RULE` without an
artifact, while both deliberately vague inputs remain clarification results.
The live provider corpus was not re-run in this repair pass, so no claim is made
here about provider latency, rate limits, or stochastic acceptance rate.
