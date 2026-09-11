# Rule Proposal Prompt Test Set 10 - Novel Compositions and the Clarification Loop

Session date: 2026-09-11. Build `e114cad` — the **first live provider run after
the set-9 repair addendum**, which explicitly made no claim about stochastic
compile rate or latency. Live `POST /rule-preflight` on a dedicated API process
(`PORT=3097`), OpenRouter profile from `.env`:

| Role       | Model                                       |
| ---------- | ------------------------------------------- |
| interpret  | `qwen/qwen3.8-27b`                          |
| compile    | `openai/gpt-oss-120b`                       |
| review     | `mistralai/mistral-small-24b-instruct-2501` |
| guardian   | `openai/gpt-oss-safeguard-20b` (Groq)       |
| escalation | `openai/gpt-oss-120b`                       |

Runner: `apps/api/scripts/rule-preflight-novel-set-10.mjs`
(`pnpm --filter @tyche/api stress:rules:set10`) +
`apps/api/scripts/set-10-round2.json`, written **after** round 1 from the
questions the agent itself asked.

## Method

Identical to sets 8 and 9, so the numbers are comparable:

- **Four novel prompts plus two deliberately imprecise ones.**
- **Novelty is proved, not asserted.** All six were first pushed through
  `validateAndPrecompileRule` offline.
- **Expressibility is proved before the agent is judged.** A reference AST was
  written for every objective rule and executed against the boundary fixtures:
  **27/27 in round 1, 39/39 in round 2**. Every refusal below is a policy
  decision, never a DSL limit.
- **The two-phase player flow**, exactly as `Create.tsx` performs it:
  `phase: "interpret"` -> approve -> `phase: "compile"` with
  `approvedInterpretation`.
- **Behaviour oracle.** Every accepted AST **and every discarded candidate AST**
  is executed against fixtures written from the ORIGINAL prompt. Agent prose is
  never the oracle.
- Round 2 replays the two vague rules with answers to the agent's own questions,
  replays N1 using the agent's own suggested rewrite, changes exactly one
  variable in N4, and replays N2/N3 verbatim for stability.

## Corpus

| ID  | Capability axis (absent from sets 1-9)                                                      |
| --- | ------------------------------------------------------------------------------------------- |
| N1  | positional selection with `at` on both sides - second largest and second smallest             |
| N2  | set subtraction (`difference`) as the subject, plus a non-emptiness clause                    |
| N3  | mirrored pairing: guess ascending zipped against draw **descending**, then a counted threshold |
| N4  | max-ranking needing a nested binder with an outer reference (`elem up:1`): divisor count       |
| V1  | **referential** ambiguity: every threshold objective, but "it" has three antecedents            |
| V2  | undefined count idiom ("a couple") + undefined margin ("just under") + undefined pairing       |

`at`, `difference`, `reverse` and `elem up:1` appear in no reference AST of sets
5-9. Offline control: N1, N2, N3, V1 and V2 are all `UNSUPPORTED_RULE` with no
artifact; N4 is discussed in D1/D2 below.

Round 2: `V1b`/`V2b` (clarified), `N1b` (N1's refusal offered two rewrites —
this is rewrite 2, submitted verbatim), `N4b` (N4 with only the tie sentence
changed), `N2b`/`N3b` (verbatim, stability).

## Results

| Case | Verdict | Fixtures | Latency | Candidates discarded (behaviourally correct) |
| ---- | ------- | -------- | ------- | -------------------------------------------- |
| N1   | CLARIFY | -        | 175 s   | 3 (**3 correct**) |
| N2   | **VALID** | **7/7** | 142 s  | 0 |
| N3   | **VALID** | **7/7** | 121 s  | 2 (1 correct) |
| N4   | **BLOCK 400** (`RULE_EXTERNAL_DEPENDENCY`) | - | **4 ms** | 0 (no model ran) |
| V1   | CLARIFY (expected) | - | 10 s | 0 |
| V2   | CLARIFY (expected) | - | 8 s  | 0 |
| V1b  | CLARIFY | -        | 169 s   | 3 (**2 correct**) |
| V2b  | CLARIFY (false positive) | - | 6 s | 0 (no compile ran) |
| N1b  | **VALID** | **7/7** | 92 s   | 0 |
| N4b  | CLARIFY | -        | 54 s    | 3 (0 correct — all three the same v1 over-claim) |
| N2b  | **VALID** | **7/7** | 87 s   | 0 |
| N3b  | **VALID** | **7/7** | 201 s  | 2 (**2 correct**) |

Headline numbers:

- **Compilation rate on novel rules: 2/4 in round 1** (N2, N3), **3/4 after one
  follow-up round** (N1b). N4 never compiled: blocked pre-LLM in round 1, and in
  round 2 all three compile attempts spent the retry budget on the same
  deterministic over-claim.
- **Clarification detection: 2/2**, and both question sets were specific,
  answerable and player-readable.
- **Clarification follow-through: 1/2.** V1b was refused after producing a
  correct artifact twice; V2b was bounced back with a generic template question.
- **Wrong artifacts frozen: 0 of 12.** Every accepted AST is behaviourally exact.
  Set 9's severe H1 (a truncated AST frozen at confidence 0.936 with the approved
  prose rewritten to match it) **did not reproduce** — this is the single biggest
  improvement in the set.
- **Stability: 2/2.** N2 and N3 replayed verbatim both reproduced VALID 7/7.
- **Discarded candidates that were behaviourally correct: 8 of 13 (62 %).**

## Findings

### D1 (SEVERE) - a partial keyword match still replaces the whole rule, and turns a ranking into a predicate

N4's text is *"The ticket holding the most numbers that divide exactly into at
least one drawn number wins, and ties share it equally."* The deterministic
pre-compiler reads *"at least one drawn number"* and returns

```json
{"schemaVersion": 1, "node": {"kind": "match_count_at_least", "value": 1}}
```

with `decision: "VALID"`, `reasonCodes: ["SUPPORTED_RULE"]` and the official
interpretation *"A guess wins if at least 1 of its numbers appear in the official
draw, regardless of order"* — an unrelated rule, and a **predicate where the
player wrote a ranking**. Reproducible offline in 0 ms:

```bash
node apps/api/scripts/rule-preflight-novel-set-10.mjs <url> --round2 --offline
# N4b-tie-clause-reworded -> VALID, fixtureChecks 6, fixtureFailures 6
```

Live, this v1 AST was the candidate in **all three** N4b compile attempts
(`scoreGuess requires a v2/v3 ranking rule` on every ranking fixture). The model
never got to draft the divisor rule. The only thing that stopped the freeze was
the independent reviewer raising `REVIEWER_MISMATCH`.

This is set-9 H2/H3 unchanged in substance. The set-9 repair removed protocol
tie/share clauses before deterministic dispatch, which does fix the
`sum_equals` specimen; it does not address the general defect, which is that the
regex layer may claim `SUPPORTED_RULE` on a fragment of a compound sentence and
its artifact then pre-empts drafting.

### D2 - the player's own tie wording is classified as external game state

N4 as first written ends *"and tickets level on that count share the prize
equally."* The API rejects it in **4 ms**, before any model call:

```json
{"error":"RULE_EXTERNAL_DEPENDENCY",
 "message":"Rule text depends on unavailable external game state. Rewrite it using only your guess and the official draw."}
```

`EXTERNAL_DEPENDENCY_PATTERNS` blacklists `prize`
(`packages/rule-compiler/src/index.ts:628`). `stripProtocolTieBreakClauses`
exists precisely to stop this, but its patterns only cover
`ties ... share/split the prize` and `tickets equally close share the prize`; the
subject-bearing paraphrase *"tickets level on that count share the prize
equally"* is not matched, so `prize` leaks to the gate. Proof it is the wording
and not the rule: `N4b` is the same sentence with *"and ties share it equally"*
and reaches the model (54 s of pipeline). Same class as set-9 H4 (`past 100`):
the block text tells the player to rewrite a rule that only ever reads guess and
draw.

### D3 - the clarified rewrite is refused by the `some` blacklist, with an unanswerable question

V2's round-1 questions were excellent:

```text
Does 'just under' mean the guessed number is exactly 1 less than a drawn number,
or can it be any smaller number (e.g., 2 or 3 less)?
Should the comparison be position-by-position (guess[i] vs draw[i]) or can a
guessed number match any drawn number?
```

V2b answers both: *"A guess wins if at least two of its numbers are exactly one
less than some drawn number."* Nothing in it is undefined. `hasAmbiguousWording`
returns true on `/\bsome\b/i` (`index.ts:582`), `enforceSourceAmbiguity` then
discards the model's interpretation and substitutes the fixed template:

```text
The winning condition is not complete yet. Which measurable numeric property and
threshold should define this condition?
```

Isolation (one word changed at a time): `some drawn number` -> ambiguous,
`a drawn number` -> clean, `any drawn number` -> clean. In mathematical English
`some` is an existential quantifier — the most precise word available for this
rule. The player answered the agent's own questions and received a worse,
generic question in return, with no rewrite to accept. Same class as set-9 H5
(`as many`).

### D4 - the independent reviewer returned demonstrably wrong verdicts, and each one killed a correct AST

Two reviewer vetoes in this set, both arithmetically wrong:

- **N1 attempt 0** (7/7 correct): *"disagree for guess [1,2,3,98,99,100] and draw
  [2,4,6,8,10,12]: reviewer=LOSE, draft=WIN"*. Second largest 99 > 10 and second
  smallest 2 < 4, so WIN is right.
- **N3 attempt 0** (7/7 correct): *"guess [1,2,3,4,5,6], draw [1,2,3,4,5,6]:
  reviewer=WIN, draft=LOSE"*. Mirrored pairs all total 7, so no pair clears 70
  and LOSE is right.

Set-9 H7 unchanged. The reviewer is not useless — it is the only guard that
stopped D1 from freezing an unrelated rule — but on these two folds it destroyed
correct work.

### D5 - `at(1, sort desc)` does not satisfy "maximum" coverage

Two of N1's three correct candidates were rejected with

```text
INTERPRETATION_MISMATCH: The candidate AST does not cover every intent-bearing
part of the rule text (missing operations: maximum).
```

The text says *"second largest"*, so the coverage analyzer requires a `maximum`
operation; the correct encoding is `{"kind":"at","index":1,"of":{"kind":"sort",
"order":"desc",...}}`, which contains no `max` reduce. This is exactly the
set-9 H6 defect class (`reduce(op:"product")` not registering as `product`), now
on the `at` node and the `maximum` operation. The vocabulary is enumerated per
node kind, so every newly exercised node re-opens it.

### D6 - `AGENT_STATEMENT_MISMATCH` is the single largest destroyer of correct work

It fired on **7 of the 13** discarded candidates and was the **only** rejection
reason for V1b attempt 2 and both N3b attempts — all three behaviourally exact.
Its message (*"The candidate AST does not keep every load-bearing claim in the
agent interpretation"*) names no clause, so neither the player nor the log can
tell which claim was considered dropped. When the same rule is retried it often
passes (N3b's third attempt), which means the check is not discriminating
between artifacts but between phrasings of the agent's own prose.

### D7 - the no-exit refusal persists, now with nothing offered at all

Both final refusals in round 2 returned

```json
"refinementQuestions": [], "suggestedRewrites": []
```

with the message *"Your wording is clear, but independent compiler attempts
produced different executable readings. This is a compiler conflict, not a
missing answer from you."* The diagnosis is honest and the set-9 repair
correctly stopped echoing the player's own sentence back as a "rewrite" — but
the player is now left with an empty screen and no action. For V1b this happens
**after** they correctly answered the agent's clarification question.

### D8 - when the loop does offer an exit, it asks the player to arbitrate a compiler bug

N1's refusal offered two readings. Reading 2 is the player's rule; reading 1 has
both comparison directions swapped — it is a mis-compilation, not an alternative
reading of the sentence. Both are rendered in generated prose such as *"the
smallest of positions 2 to 2 of your numbers sorted from lowest to highest"*.
Submitting reading 2 verbatim did work (`N1b` VALID 7/7, 92 s, zero discarded
candidates), so this loop has an exit — but only for a player who can read
generated AST prose well enough to spot which of the two is theirs.

### D9 - cost of a refusal equals cost of an acceptance

Median latency 106 s, maximum 201 s, for a single rule proposal. A refusal is not
cheaper: N1 spent 175 s and V1b 169 s to end with a question. Two of the twelve
cases (N4, V2b) were decided in under 10 ms/10 s by deterministic gates — and
both of those decisions were wrong (D2, D3).

## What did work

- **`interpret` was correct in 10 of 10 cases where it ran**, including the
  divisor semantics (*"for a guessed number g, there exists a drawn number d such
  that d % g == 0"*), the mirrored pairing, the set difference, and both
  clarified rewrites. Every failure in this set is downstream of interpretation.
- **No wrong artifact was frozen in twelve live cases.** The approved
  interpretation was never rewritten to match a truncated AST — the set-9 H1
  repair holds on this corpus.
- **Three of the four novel axes compiled**, with the model authoring its own
  formulations rather than the reference ones: N2 used `difference` + a negated
  `exists`, N3 used a `pairs_map` of `ite` indicators summed against a threshold,
  N1b used `at` on two oppositely sorted arrays.
- **Stability reproduced**: both verbatim replays (N2b, N3b) returned the same
  verdict and the same 7/7 behaviour as round 1, one of them via a different
  internal path (2 discarded candidates instead of 0).
- **Clarification detection remains 2/2**, on a class no earlier set tested
  (referential ambiguity with fully objective thresholds). V1's single question
  named all three possible antecedents.

## Trust assessment

Do not treat the agent as autonomous on novel rules yet. The blocking issues are,
in order:

1. **D1** — a deterministic fragment match can still substitute an unrelated rule
   for the player's, and it consumes the entire compile retry budget. Today only
   a stochastic reviewer stands between that artifact and a frozen rule.
2. **D3/D2** — two deterministic gates reject correct, fully objective rules on
   single words (`some`, `prize`), and D3 does it to the text the player wrote by
   following the agent's own instructions.
3. **D7** — a refusal can leave the player with no question, no rewrite and no
   path forward.
4. **D4/D5/D6** — 62 % of discarded candidates were behaviourally correct, so the
   acceptance decision is currently dominated by guard noise rather than by
   artifact quality.

What is now trustworthy enough to build on: interpretation fidelity, the absence
of frozen wrong artifacts in this run, and reproducibility of accepted rules.

## Repair addendum (2026-09-11)

The repair was applied at the four decision boundaries that caused the failures,
without adding a deterministic parser for any set-10 rule:

- Match-count shortcuts now require a complete match relation. A bare fragment
  such as *"at least one drawn number"* no longer authorizes an overlap AST, and
  exact-count recognition no longer treats *"two numbers are exactly one less"*
  as exactly two matches. The N4/N4b divisor ranking and the V2b shifted-value
  predicate are both `UNSUPPORTED_RULE` on the offline deterministic path, with
  no artifact; genuine exact/at-least match-count rules remain supported.
- Protocol tie-clause stripping recognizes subject-bearing equality language
  (`tickets level/equal on that count`) before external-state screening. Genuine
  prize-pool conditions remain blocked. `some` is ambiguous only when it supplies
  an undefined plural quantity; before a singular draw value it is treated as an
  existential quantifier.
- Coverage now treats a full sort as supporting order statistics from either end.
  This makes equivalent `at(1, sort(desc))` and `at(4, sort(asc))` encodings of a
  second-largest value satisfy the same `maximum` requirement. An
  `AGENT_STATEMENT_MISMATCH` diagnostic now names the missing operations or
  values instead of returning an opaque sentence.
- A source-only reviewer remains an independent veto and still triggers bounded
  arbitration, but its uncorroborated AST can no longer become a player-facing
  "alternative reading". Only independently generated compile candidates can
  populate that choice list. Existing fail-closed coverage, provider-evidence,
  runtime and disagreement gates were not weakened.

The no-exit report in D7 omitted an existing response/UI path: compiler faults
already return `generationRetryable: true`, and `Create.tsx` renders the explicit
**Retry generation** action. Regression coverage now also requires compiler
conflicts without a usable reading choice to carry the exact-interpretation retry
instruction in `refinementFocus`; no fake question or no-op rewrite was added.

Targeted live re-measurement used a fresh API process on `127.0.0.1:3098` after
rebuilding `@tyche/rule-compiler`:

| Case | Before | After repair | Fixtures | Latency |
| ---- | ------ | ------------ | -------- | ------- |
| N1 | CLARIFY | **VALID** | **7/7** | 76 s |
| V2b | false CLARIFY | **VALID** | **7/7** | 139 s |
| N3b | VALID after two correct candidates were discarded | **VALID** | **7/7** | 142 s |
| N4 | pre-LLM external-dependency block | CLARIFY after provider schema failures | - | 248 s |

N4 therefore closes D1/D2 specifically: it reached model compilation, and no
unrelated deterministic match-count artifact was produced or frozen. It does not
yet prove reliable live compilation of the divisor ranking; in this run the
provider exhausted its bounded schema retries and the pipeline correctly failed
closed. The latency sample is too small to claim a general D9 performance fix;
in this targeted sample N1 fell from 175 s to 76 s and N3b from 201 s to 142 s.

Verification on the repaired tree: compiler **131/131** tests and API **256/256**
tests passed, including exact regressions, semantic paraphrases, one-dimension
mutations, retained ambiguity/external-dependency boundaries, order-statistic
encoding variants, reviewer arbitration and actionable retry. The full package
typecheck/lint/build ladder is recorded in the Progress Tracker. No milestone
checkbox was changed pending user confirmation.
