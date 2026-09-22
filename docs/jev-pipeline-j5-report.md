# JEV Pipeline J5 — Interpretation Preparation

Date: 2026-09-22  
Corpus: `jev-pipeline-corpus-v1` (`f925049a8c2105065eb441c42b17fe11fb331b415ce1aedc3cbe0526ede1b178`)  
Requested model: `~typesafe/jev-latest`  
Resolved model: `typesafe/jev-1.13-20260917`  
Question/policy hash: `572095807e6aa0d5490bc9297502e05ea71e06243c4f293c117d096b088e1a80`  
Raw packet: [`jev-pipeline-j5-results.json`](jev-pipeline-j5-results.json)

## Result

J5 is implemented and evaluated, but no process is suitable for cumulative
promotion. P09 failed the safety gate by supporting the same interpretation
omission on all three repeats and on both the first and final attempts. P08,
P10, and P11 failed conservatively by rejecting every faithful positive control.

| Process                         | Recommendation      | Main result                                                                                                                                                                                                          |
| ------------------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P08 — normalization fidelity    | `REWORK_AND_RETEST` | 75/90 decisions correct (83.33%). Every defective normalization was rejected at both attempts, but all 15 faithful clear normalizations were returned for revision.                                                  |
| P09 — interpretation fidelity   | `REWORK_AND_RETEST` | 92/150 decisions correct (61.33%). Six wrong automatic supports occurred on the `CLR-05` omission control; cause scoring also failed to make most first-attempt defects actionable.                                  |
| P10 — clarity and measurability | `REWORK_AND_RETEST` | 12/30 decisions correct (40.00%). All nine ambiguous cases exposed unsupported useful improvements as player choices, but no complete condition was recognized as complete.                                          |
| P11 — translation fidelity      | `REWORK_AND_RETEST` | 45/60 decisions correct (75.00%). All 15 defective Portuguese controls respected the retry/review cap and all 15 English identity branches skipped inference, but every faithful Portuguese translation was retried. |

J5 remains experimental and disconnected from production routing. No Guardian,
deterministic security check, schema/runtime validator, player-confirmation gate,
artifact binding, payment path, or on-chain invariant was removed or changed.

## What was implemented

- P08 asks four independent Nouls for every changed clause and two collective
  Nouls over the complete normalized rule. The retry state always contains both
  the complete rule and the explicit `changedClauses` delta. Unsupported material
  clauses cannot be accepted merely because they improve executability, and a
  second failure stops at clarification/review.
- P09 asks the two directional fidelity Nouls. Each proposed cause receives an
  independent applicability Noul and the required ordered usefulness Score, so
  overlapping causes remain expressible. Only applicable, actionable causes can
  enter one revision; a persistent mismatch cannot loop.
- P10 asks the six focused clarity/measurability Nouls. Improvement options each
  receive usefulness, source-support, and new-material-choice judgments. Useful
  unsupported options become player choices and are never silently incorporated.
  Exact sizes, numeric domains, and prohibited patterns remain deterministic.
- P11 asks all eight fidelity dimensions and evaluates overlapping error causes
  with Noul plus Score. Portuguese translations get at most one retry. All five
  English-source proposals remain in the corpus through an explicit identity
  branch that makes no provider call.
- Every public state has an exact allowlist and excludes fixture labels,
  applicability masks, expected routes, mutation notes, and retry outcomes.
- The read-only runner records raw answers, complete primitive distributions,
  requested/resolved model, state and question hashes, attempts, errors, tokens,
  cost, provider/retry/wall timing, decisions, routes, language splits, Brier
  scores, Score error, and repeat stability. It imports no production mutation
  entry point.

The 70% Noul band and Score level-2 action boundary are explicitly versioned
experiment policy, not production thresholds. Noul has no invented confidence
field.

## Method

The unchanged ten-proposal corpus was run three times. Each repeat contained:

- 30 P08 tasks: one faithful normalization and defective first/final attempts
  for every proposal;
- 50 P09 tasks: one reference interpretation and first/final attempts for each
  introduced-assumption and omission control;
- 10 P10 tasks: one source evaluation per proposal, with bounded improvement
  options only where the fixture declares them;
- 20 P11 tasks: faithful and defective first/final Portuguese translations plus
  one deterministic identity branch for every English source;
- alternating process order between repeats, concurrency four, and at most two
  bounded transport attempts.

This produced 330 task executions: 315 live JEV calls and 15 deterministic P11
identity branches. `B0` is the frozen fixture oracle at the same stage, not a
timed invocation of the complete current compiler pipeline. Because no downstream
process has an owner-confirmed `PROMOTE_CUMULATIVE` decision, `C8 = I8`, `C9 = I9`,
`C10 = I10`, and `C11 = I11`.

## Accuracy

| Process |      B0 | Isolated / cumulative | Wrong automatic support | Observed decisions                                      |
| ------- | ------: | --------------------: | ----------------------: | ------------------------------------------------------- |
| P08     |   90/90 |        75/90 (83.33%) |                       0 | 45 review, 45 revise, 0 support                         |
| P09     | 150/150 |       92/150 (61.33%) |                       6 | 109 review, 14 revise, 27 support                       |
| P10     |   30/30 |        12/30 (40.00%) |                       0 | 21 review, 9 player choice, 0 complete                  |
| P11     |   60/60 |        45/60 (75.00%) |                       0 | 15 review, 30 retry, 15 identity, 0 translation support |

### P08

Every defective first attempt was returned for revision and every persistent
defect stopped at review. The current questions nevertheless classified all 15
faithful clear normalizations as needing revision. Across all controls, the
collective equivalence Noul fell below the experiment band 68 times and the
collective executability Noul fell below it 63 times. This is conservative but
not useful enough to replace or gate normalization.

### P09

The unsafe error is narrow and fully repeatable: the interpretation
`The ticket wins when guessed numbers are at most five units from their
same-position drawn numbers.` omits the universal meaning of the Portuguese
`cada número`, but P09 returned `interpretation_supported` on both attempt 1 and
attempt 2 in all three repeats. Those six results would be wrong automatic
supports if P09 were authoritative.

P09 also returned 90 defective cases without any actionable cause, so many
first-attempt mismatches went directly to review instead of the intended single
revision. One task was unstable across repeats: the first-attempt
`BLK-02/assume-wallet-irrelevant` control returned revision twice and review once.

### P10

All three ambiguous proposals consistently preserved the intended safety
boundary: their useful but unsupported improvement options became player
choices in all nine samples. `BLK-01` consistently went to review. However, all
15 clear-proposal samples and all three semantically explicit `BLK-02` samples
were also treated as incomplete. The largest systematic failure was the
`explicit_quantities` Noul, below the band in all 30 samples.

### P11

All defective Portuguese translations were retried on attempt one and sent to
human review after the repeated failure. All English identity branches were
correct and incurred no provider call. The process failed usefulness because
every faithful Portuguese translation was also sent to retry in every repeat.

## Language results

| Process |                   English |     Portuguese |
| ------- | ------------------------: | -------------: |
| P08     |            39/45 (86.67%) | 36/45 (80.00%) |
| P09     |            53/75 (70.67%) | 39/75 (52.00%) |
| P10     |             6/15 (40.00%) |  6/15 (40.00%) |
| P11     | 15/15 (100.00%, identity) | 30/45 (66.67%) |

The P11 English number measures deterministic identity routing, not model
translation accuracy. The corpus is too small for calibration, and P09's
Portuguese result plus its universal-quantifier miss are release blockers.

## Primitive quality

| Process | Labelled Nouls |   Noul Brier | Labelled Scores | Score mean absolute error |
| ------- | -------------: | -----------: | --------------: | ------------------------: |
| P08     |            756 | 0.1556812169 |               0 |                         — |
| P09     |            744 | 0.2292705645 |             444 |              1.2619819820 |
| P10     |            204 | 0.1420009804 |              12 |              0.6500000000 |
| P11     |            486 | 0.3038751029 |             126 |              0.7069841270 |

The Score value is a probability-weighted expected rubric position; the table
does not reinterpret fractional scores as hidden categories.

## Cost and speed

| Process | Live calls | Skipped identity | Input tokens | Output tokens |         Cost | Wall p50 | Wall p95 | Retries |
| ------- | ---------: | ---------------: | -----------: | ------------: | -----------: | -------: | -------: | ------: |
| P08     |         90 |                0 |      104,514 |        18,504 | $0.004389588 |   345 ms |   630 ms |       0 |
| P09     |        150 |                0 |      171,561 |        28,218 | $0.007205562 |   336 ms |   438 ms |       0 |
| P10     |         30 |                0 |       26,697 |         5,082 | $0.001121274 |   336 ms |   432 ms |       0 |
| P11     |         45 |               15 |       73,920 |        14,292 | $0.003104640 |   346 ms |   427 ms |       0 |
| Total   |        315 |               15 |      376,692 |        66,096 | $0.015821064 |        — |        — |       0 |

End-to-end concurrent benchmark time was 28,774 ms. All costs were
provider-reported. Shadow J5 skipped no current compiler or reviewer work, so no
savings are claimed. The English P11 identity path is the only avoided JEV call,
and that skip is part of the process contract rather than a replacement saving.

## Failure and safety verification

- Every live response resolved to `typesafe/jev-1.13-20260917`; there were no
  response/schema errors, timeouts, rate limits, or retries in the live run.
- Injected P08, P09, P10, and P11 timeouts became `SERVICE_TIMEOUT` with no
  judgment.
- Injected malformed responses for all four processes became `SCHEMA_ERROR` with
  no judgment.
- Injected atomic-storage failure became `STORAGE_FAILURE`.
- Reaggregation reproduced the stored summary from raw results.
- No blocked proposal received an `ACCEPT` terminal route because existing
  upstream deterministic policy remains authoritative. P09 nevertheless failed
  its stage safety gate through six wrong supports and must not control routing.
- No proposal, payment, artifact freeze, API/database mutation, wallet operation,
  transaction, or on-chain mutation occurred.

## Decision and next experiment

All four processes are `REWORK_AND_RETEST`.

- P08 needs a state/question decomposition that distinguishes a faithful
  operational clause from invention without rejecting every positive control.
- P09 must first fix the universal-quantifier omission miss and make cause
  assessments usable; no threshold relaxation can address the observed wrong
  support safely.
- P10 needs literal, dimension-specific wording that can recognize explicit
  quantities and complete clear conditions while preserving the correct player
  choice route for ambiguous sources.
- P11 needs revised atomic translation wording that accepts faithful Portuguese
  translations without weakening its perfect rejection of the measured defects.

Any changed question set requires a new version and all three repeats. The same
acceptance corpus must not be relabelled or presented as held-out evidence. J5
remains `OFF`/experimental shadow status, and its PRD checkboxes remain unchecked
until explicit owner confirmation.

## Reproduction

```powershell
pnpm --filter @tyche/api experiment:jev:pipeline:j5 -- --dry-run
pnpm --filter @tyche/api experiment:jev:pipeline:j5 -- --self-test --runs=3 --output=../../output/jev-j5-self-test.json
pnpm --filter @tyche/api experiment:jev:pipeline:j5 -- --verify-failures --output=../../output/jev-j5-failure-test.json
pnpm --filter @tyche/api experiment:jev:pipeline:j5 -- --live --runs=3 --concurrency=4 --output=../../docs/jev-pipeline-j5-results.json
pnpm --filter @tyche/api experiment:jev:pipeline:j5 -- --aggregate=../../docs/jev-pipeline-j5-results.json --output=../../output/jev-j5-reaggregated.json
```

Required-document confirmation: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`,
`PRD-JEV-PIPELINE-EVALUATION.md`, `mapeamento-validacao-pipeline.md`,
`estudo-jev-pipeline.md`, `docs/jev-rule-pipeline-experiment.md`,
`.claude/skills/jev-system-one/SKILL.md`, its request/response, evaluation,
production-operations, and Tyche pipeline references,
`.claude/skills/tyche-test-and-verify/SKILL.md`, and the current official TypeSafe
documentation index, State, primitives, API, confidence, and Jev 1.13 jaggedness
pages were opened before implementation and evaluation.
