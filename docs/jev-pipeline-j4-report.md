# JEV Pipeline J4 — Clarification and Rewrite

Date: 2026-09-22  
Corpus: `jev-pipeline-corpus-v1` (`f925049a8c2105065eb441c42b17fe11fb331b415ce1aedc3cbe0526ede1b178`)  
Requested model: `~typesafe/jev-latest`  
Resolved model: `typesafe/jev-1.13-20260917`  
Question/policy hash: `60cef771e01beaea6c1a54a055c3cccd1630ebc7b435d5e97e2296873b4f4d85`  
Raw packet: [`jev-pipeline-j4-results.json`](jev-pipeline-j4-results.json)

## Result

J4 is implemented and evaluated, but neither process is suitable for promotion.

| Process                  | Recommendation      | Main result                                                                                                                                                                                                                     |
| ------------------------ | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P06 — rewrite fidelity   | `REWORK_AND_RETEST` | 61/90 policy decisions correct (67.78%). All 30 defective first attempts were returned for revision and all 30 persistent defects stopped after the second check, but 29/30 faithful rewrites were also returned unnecessarily. |
| P07 — clarification need | `REWORK_AND_RETEST` | 12/30 policy decisions correct (40.00%). All nine ambiguous-proposal repeats requested clarification and all three prohibited-dependency repeats blocked, but all 15 clear-proposal repeats also requested clarification.       |

There were zero automatic wrong supports, zero response/schema/model-drift failures, and no production write. Safety came from conservative abstention, not useful discrimination. P06 and P07 remain experimental and disconnected from production routing.

## What was implemented

- P06 asks the required ten independent Nouls in one request. Deterministic masks decide which dimensions apply; all raw answers remain stored.
- A negative or uncertain applicable P06 dimension is returned as feedback exactly once. Persistent failure on attempt two becomes `clarify_or_review`; it cannot create an unbounded rewrite loop.
- P07 declares all 20 PRD criteria. Each proposal has a deterministic applicability mask and only applicable atomic Nouls are asked.
- P07 exposes every failed/uncertain applicable criterion as a required question category. JEV neither generates player-facing prose nor suppresses a required question.
- The study's 60% P07 floor and the provisional 70% P06 band are explicitly versioned experiment policies, not production thresholds. Noul values are consumed directly; no separate confidence value is invented.
- Public state builders exclude expected labels, fixture reasons, applicability masks, and mutation annotations. Player text is explicitly treated as data.
- Strict shared response validation rejects missing, extra, malformed, non-finite, out-of-range, or wrong-primitive answers.
- The read-only runner records raw answers, requested/resolved model, state and question hashes, attempts, errors, tokens, cost, provider/retry/wall timing, decisions, routes, per-language results, Brier scores, and stability.

No existing Guardian, deterministic security check, schema/runtime validator, player-confirmation gate, artifact binding, payment path, or on-chain invariant was removed or changed.

## Method

The unchanged ten-proposal corpus was run three times. Each repeat contained:

- 30 P06 tasks: one faithful rewrite, one defective first attempt, and the same persistent defect at the second and final attempt for every proposal;
- 10 P07 tasks: one completeness/applicability evaluation per proposal;
- alternating P06/P07 ordering between repeats;
- one batched JEV request per task, concurrency four, maximum two transport attempts;
- 120 live requests total.

`B0` is the frozen fixture oracle at the same stage. It is a correctness reference with zero simulated provider cost, not a measured invocation of the complete current compiler pipeline. Because no downstream JEV process has an owner-confirmed production promotion, `C6 = I6` and `C7 = I7`; no earlier experimental JEV result was silently added to cumulative routing.

## Accuracy

### P06

| Arm | Correct | Accuracy | Wrong automatic support | Decision counts                         |
| --- | ------: | -------: | ----------------------: | --------------------------------------- |
| B0  |   90/90 |  100.00% |                       0 | 30 supported, 30 revise, 30 stop/review |
| I6  |   61/90 |   67.78% |                       0 | 1 supported, 59 revise, 30 stop/review  |
| C6  |   61/90 |   67.78% |                       0 | Identical to I6                         |

The defect controls were safe: every defective attempt one returned `revision_required`, and every repeated attempt two returned `clarify_or_review`. The process failed usefulness because only one of 30 faithful rewrite evaluations passed. The faithful CLR-02 rewrite was also unstable (`revision_required`, `rewrite_supported`, `revision_required`).

### P07

| Arm | Correct | Accuracy | Wrong automatic support | Decision counts                               |
| --- | ------: | -------: | ----------------------: | --------------------------------------------- |
| B0  |   30/30 |  100.00% |                       0 | 15 complete, 12 clarify, 3 blocked dependency |
| I7  |   12/30 |   40.00% |                       0 | 0 complete, 24 clarify, 6 blocked dependency  |
| C7  |   12/30 |   40.00% |                       0 | Identical to I7                               |

Class behavior across three repeats:

| Fixtures                  | Expected                                                      | Observed                  |
| ------------------------- | ------------------------------------------------------------- | ------------------------- |
| `CLR-01` through `CLR-05` | 15 complete                                                   | 15 clarification required |
| `AMB-01` through `AMB-03` | 9 clarification required                                      | 9 clarification required  |
| `BLK-01`                  | 3 clarification required at P07; upstream safety still blocks | 3 blocked dependency      |
| `BLK-02`                  | 3 blocked dependency                                          | 3 blocked dependency      |

The 20-criterion registry and masks are complete. Nineteen criteria are applicable somewhere in this fixed corpus. Criterion 12 (exclusive/fallback precedence) is correctly masked out for all ten sources because none contains an exclusive or fallback branch; it therefore has implementation and tests but no empirical J4 sample. Player-approved prior-answer state is supported but empty in the frozen v1 corpus, so resolved-clarification behavior remains unevaluated.

## Language results

| Process |        English |     Portuguese |
| ------- | -------------: | -------------: |
| P06     | 31/45 (68.89%) | 30/45 (66.67%) |
| P07     |  9/15 (60.00%) |  3/15 (20.00%) |

The corpus is too small for calibration, but P07's Portuguese gap is a release blocker under the PRD.

## Probability quality

Only applicable Nouls enter the Brier calculation; every raw speculative P06 answer remains available in the packet.

| Process | Labelled answers |  Brier score |
| ------- | ---------------: | -----------: |
| P06     |              648 | 0.3336820988 |
| P07     |              390 | 0.2332710256 |

The P07 model assigned low probabilities to several clearly present properties. Across all applicable samples, quantity, comparator, aggregation, polarity, and literal/range questions were below the 60% experiment floor in every observation. This is evidence against the current question/state construction, not a reason to lower a threshold on the same acceptance corpus.

## Cost and speed

| Process | Calls | Input tokens | Output tokens |         Cost | Wall p50 | Wall p95 | Retries |
| ------- | ----: | -----------: | ------------: | -----------: | -------: | -------: | ------: |
| P06     |    90 |      120,345 |        20,880 | $0.005054490 |   403 ms |   662 ms |       1 |
| P07     |    30 |       61,749 |         9,888 | $0.002593458 |   376 ms |   477 ms |       0 |
| Total   |   120 |      182,094 |        30,768 | $0.007647948 |        — |        — |       1 |

End-to-end concurrent benchmark time was 12,561 ms. All costs were provider-reported. No savings are claimed: shadow J4 skipped no existing compiler or reviewer work, so both processes add cost and latency to the measured path.

## Failure and safety verification

- Requested and resolved models matched on every live result.
- Injected P06 and P07 timeouts became `SERVICE_TIMEOUT` with no judgment.
- Injected malformed P06 and P07 responses became `SCHEMA_ERROR` with no judgment.
- Injected atomic-storage failure became `STORAGE_FAILURE`.
- Reaggregation reproduced the stored summary from raw results.
- Blocked proposals never received a terminal `ACCEPT` route.
- No proposal, payment, artifact freeze, API/database mutation, wallet operation, transaction, or on-chain mutation occurred.

## Decision and next experiment

Both processes are `REWORK_AND_RETEST`.

P06 needs revised atomic wording or a different state decomposition that can distinguish faithful preservation from introduced assumptions without losing its perfect defect rejection. P07 needs its questions rewritten as literal, criterion-specific judgments with fewer semantic hops, then a new versioned three-repeat run. That work must not tune and re-score this same corpus as held-out evidence. A later release decision still requires a larger held-out English/Portuguese set, explicit prior-answer cases, and sources exercising exclusive/fallback precedence.

J4 remains at `OFF`/experimental shadow status. The PRD milestone checkboxes remain unchecked until explicit owner confirmation.

## Reproduction

```powershell
pnpm --filter @tyche/api experiment:jev:pipeline:j4 -- --dry-run
pnpm --filter @tyche/api experiment:jev:pipeline:j4 -- --self-test --runs=3 --output=../../output/jev-j4-self-test.json
pnpm --filter @tyche/api experiment:jev:pipeline:j4 -- --verify-failures --output=../../output/jev-j4-failure-test.json
pnpm --filter @tyche/api experiment:jev:pipeline:j4 -- --live --runs=3 --concurrency=4 --output=../../docs/jev-pipeline-j4-results.json
pnpm --filter @tyche/api experiment:jev:pipeline:j4 -- --aggregate=../../docs/jev-pipeline-j4-results.json --output=../../output/jev-j4-reaggregated.json
```

Required-document confirmation: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `PRD-JEV-PIPELINE-EVALUATION.md`, `.claude/skills/jev-system-one/SKILL.md`, its request/response, evaluation, and Tyche pipeline references, `.claude/skills/tyche-test-and-verify/SKILL.md`, and the current official TypeSafe State, primitives, Noul, API, confidence, fan-out, self-consistency, documentation index, and Jev 1.13 jaggedness pages were opened before implementation and evaluation.
