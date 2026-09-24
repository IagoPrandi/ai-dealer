# JEV Pipeline Evaluation — J0/J1 Report

Date: 2026-09-22  
Experiment: `jev-j0-j1-2026-09-22T03-13-37-043Z`  
Scope: J0 experiment foundation and J1 downstream review (`P01`, `P02`)  
Rollout state: shadow evaluation only; no production authority changed

## Decision

| Process                                       | Recommendation      | Rationale                                                                                                                                                                                                                          |
| --------------------------------------------- | ------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01 — final artifact fulfils approved promise | `ADVISORY_ONLY`     | JEV stage accuracy was 113/114 (99.12%), but the fail-closed combined arm remained 111/114 (97.37%), identical to Guardian, while adding cost and latency. One raw JEV judgment falsely supported a wrong clear-proposal artifact. |
| P02 — interpretation is supported by source   | `REWORK_AND_RETEST` | JEV stage accuracy was 70/90 (77.78%), below Guardian at 72/90 (80.00%). It reduced false supports from 18 to 3, but the three remaining false supports and lower stage accuracy fail the promotion gate.                          |
| P01 + P02 cumulative                          | Do not promote      | Cumulative accuracy improved from 69/90 (76.67%) to 74/90 (82.22%) with zero terminal false supports in the fixture pipeline, but P02 has not passed its isolated gate and total cost is incomplete.                               |
| Guardian replacement                          | Do not remove       | The fixed ten-proposal suite is not production proof, the combined P01 arm did not improve accuracy, and P02 JEV remained fallible. The existing Guardian authority is unchanged.                                                  |

J0 and J1 are implemented and ready for owner review. Their PRD checkboxes remain unchecked because the PRD requires explicit owner confirmation.

## Reproducibility boundary

> **Runner retired (2026-09-22).** This comparison's runner imported the production Guardian, which the J11 production integration removed. The runner and the Guardian client remain in git history at commit `e3306bd`; check that commit out to reproduce these results.


- Corpus: `jev-pipeline-corpus-v1`, exactly 10 immutable source proposals: 5 clear, 3 ambiguous, and 2 blocked.
- Corpus SHA-256: `f925049a8c2105065eb441c42b17fe11fb331b415ce1aedc3cbe0526ede1b178`.
- State schema: `jev-pipeline-state-v1`.
- Question set: `jev-p01-p02-questions-v1`.
- Question/policy SHA-256: `3bfa2364699ee6e8925902125783b2f0ebfb0ccf1cff1f51332e4930dbc0ed3e`.
- Policy: `jev-j1-advisory-bands-0.30-0.70-v1`.
- Repeats: 3; 114 paired tasks; 38 P01 and 30 P02 judgments per repeat.
- Requested JEV model: `~typesafe/jev-latest`; resolved model on all 204 calls: `typesafe/jev-1.13-20260917`.
- Guardian model: `openai/gpt-oss-safeguard-20b`.
- Source revision: dirty worktree disclosed. The corpus, question, and policy hashes are the exact reproducibility boundary.
- Raw packet: [`jev-pipeline-j0-j1-results.json`](jev-pipeline-j0-j1-results.json).

The runner imports no API server, database, wallet, payment, artifact-freeze, or chain-write entry point. No proposal, payment, artifact, wallet, or on-chain state was mutated.

## Accuracy

### P01 isolated and cumulative

| Arm/reviewer        | Correct | Accuracy | False support | Insufficient evidence |
| ------------------- | ------: | -------: | ------------: | --------------------: |
| B0 / Guardian       | 111/114 |   97.37% |             0 |                    84 |
| JEV alone           | 113/114 |   99.12% |             1 |                    84 |
| I1 / Guardian + JEV | 111/114 |   97.37% |             0 |                    84 |
| C1 / Guardian + JEV | 111/114 |   97.37% |             0 |                    84 |

Isolated effect (`I1 - B0`): 0 accuracy points, 0 false-support change. Incremental and total cumulative effects are the same because P01 is the first downstream process. The fail-closed combination prevented the raw JEV false support from changing the combined decision.

The raw P01 Choice head was correct on 87/114 (76.32%): it frequently chose `contradicted` where the reference required `insufficient_evidence`. The deterministic authority gate correctly prevented unapproved interpretations from becoming supported decisions, but the raw evidence remains preserved in the result packet.

### P02 isolated and cumulative

| Arm/reviewer         | Correct | Accuracy | False support | Insufficient evidence |
| -------------------- | ------: | -------: | ------------: | --------------------: |
| Guardian stage alone |   72/90 |   80.00% |            18 |                     0 |
| JEV stage alone      |   70/90 |   77.78% |             3 |                    11 |
| B0 pipeline          |   69/90 |   76.67% |             0 |                    33 |
| I2 pipeline          |   74/90 |   82.22% |             0 |                    16 |
| C1 pipeline          |   69/90 |   76.67% |             0 |                    33 |
| C2 pipeline          |   74/90 |   82.22% |             0 |                    16 |

Isolated effect (`I2 - B0`): +5/90 correct (+5.56 percentage points), with no terminal false-support change. Incremental cumulative effect (`C2 - C1`): +5/90 correct. Total cumulative effect (`C2 - B0`): +5/90 correct. P01 JEV did not contribute an accuracy gain in this cumulative run.

The safety trade-off is explicit: JEV reduced P02 stage false supports from 18 to 3, but introduced abstentions and false rejections, leaving isolated stage accuracy 2.22 points below Guardian. This prevents cumulative promotion without a reworked policy and a fresh three-repeat run.

### Disagreements

- P01 Guardian false-rejected three Portuguese reference cases across repeats (`CLR-01` once and `CLR-03` twice).
- P01 JEV falsely supported `CLR-05/reference/strict-distance` in one repeat.
- P02 Guardian falsely supported six omission/assumption cases in every repeat: `CLR-02`, `CLR-05`, `AMB-01`, `AMB-03`, `BLK-01`, and `BLK-02` (18 judgments).
- P02 JEV falsely supported `CLR-05/omit-universal/reference` in every repeat (3 judgments). Its other 17 errors were abstentions or false rejections on faithful interpretations.

All per-proposal responses, probabilities, Nouls, confusion outcomes, and timing are retained in the raw packet.

## Calibration

- Overall Noul Brier score: 0.27839 over 888 labeled Nouls.
- P01 Brier: 0.21158 over 240 samples.
- P02 Brier: 0.30313 over 648 samples.
- English Brier: 0.28865; Portuguese Brier: 0.27002.
- At the experimental 0.30/0.70 bands: 296 high, 474 low, and 118 uncertain values; 6 false-high and 237 false-low threshold crossings.

The full five-bin calibration table and process-level threshold coverage are stored in the raw summary. These bands are experimental and are not production thresholds.

## Cost

| Provider/arm                 |   Known cost | Completeness                                            |
| ---------------------------- | -----------: | ------------------------------------------------------- |
| JEV, all 204 calls           |  $0.01216656 | Complete; provider reported                             |
| P01 I1/C1                    |  $0.00821520 | JEV portion only                                        |
| P02 I2 incremental           |  $0.00395136 | JEV portion only                                        |
| P02 C1                       | $0.006429906 | JEV portion only                                        |
| P02 C2 total                 | $0.010381266 | JEV portion only                                        |
| Guardian, 105 provider calls |      Unknown | Provider usage was recorded but pricing was unavailable |

No savings are claimed: shadow JEV did not skip any existing provider or review work. Total cost, percentage deltas, cost per correct terminal result, and cost per correctly routed class cannot be stated honestly until Guardian pricing and an approved human-review rate are available. This keeps the financial gate incomplete.

## Speed

| Boundary               | p50 wall |  p95 wall | p50 queue | p95 queue |
| ---------------------- | -------: | --------: | --------: | --------: |
| Guardian provider task | 7,960 ms | 10,862 ms |  7,809 ms | 10,147 ms |
| JEV provider task      |   372 ms |    609 ms |      0 ms |      0 ms |
| P01 B0                 |     0 ms | 10,539 ms |      0 ms | 10,083 ms |
| P01 I1/C1              |   429 ms | 10,539 ms |      0 ms | 10,083 ms |
| P02 B0/I2              | 8,611 ms | 19,854 ms |  8,072 ms | 18,818 ms |
| P02 C1/C2              | 9,075 ms | 19,854 ms |  8,072 ms | 18,818 ms |

End-to-end benchmark wall time was 250,490 ms. JEV provider time totaled 82,076 ms; Guardian provider time totaled 52,577 ms. Guardian queue time totaled 1,049,570 ms across concurrent tasks, with zero retry/backoff time and zero retries. Queue values are benchmark scheduler waits caused by the predeclared 2.1-second Guardian start interval; they are reported separately and must not be treated as intrinsic provider latency.

P01 added 429 ms at p50 with no accuracy gain. P02 JEV executed in parallel with the slower Guardian path, so I2 did not change the observed p50/p95 boundary; cumulative C2 added 464 ms at p50 relative to B0 because P01 and P02 JEV work both remained in the measured route.

## Failure and safety verification

- Timeout injection remained `SERVICE_TIMEOUT` and fail-closed.
- Malformed JEV output remained `SCHEMA_ERROR` and fail-closed.
- Guardian failure remained `GUARDIAN_UNAVAILABLE`; it was not converted to a permissive result.
- Storage failure remained `STORAGE_FAILURE`; atomic output did not conceal it.
- Missing, extra, non-finite, wrong-type, and invalid-distribution answers are rejected by strict response validation.
- The resolved JEV model is checked against the pinned experiment model; drift is an explicit failure.
- `unavailable` is distinct from semantic uncertainty and from `contradicted`.
- Existing Guardian behavior and authority were not removed or modified.

## Verification commands

```text
pnpm --filter @tyche/api experiment:jev:pipeline -- --dry-run
pnpm --filter @tyche/api experiment:jev:pipeline -- --self-test
pnpm --filter @tyche/api experiment:jev:pipeline -- --verify-failures
pnpm --filter @tyche/api experiment:jev:pipeline -- --live --output=docs/jev-pipeline-j0-j1-results.json
pnpm --filter @tyche/api experiment:jev:pipeline -- --aggregate=docs/jev-pipeline-j0-j1-results.json --output=docs/jev-pipeline-j0-j1-results.json
```

## Limitations and acceptance status

- Ten proposals and three repeats are an acceptance suite, not statistical production proof.
- Provider responses are stochastic and no seed is supported; pairing, exact versions, hashes, and raw responses are recorded instead.
- Guardian cost is unpriced, so complete financial comparisons are unavailable.
- Human-review and infrastructure costs are unavailable because no approved rate or measured review session was supplied.
- The Guardian model identifier was recorded, but its upstream implementation may not be immutable.
- P01 does not justify replacement: combined accuracy did not improve and raw JEV produced one false support.
- P02 does not meet the stage non-inferiority gate and produced three false supports.
- The cumulative safety result is promising but cannot override the failed isolated P02 gate.

The ten-proposal safety target was met by the fail-closed cumulative fixture pipeline: no repeated blocked or ambiguous proposal reached a supported terminal decision, and deterministic behavior fixtures prevented release of an incorrect AST. The process promotion gate was not met. Maximum permitted state remains `ADVISORY`, subject to owner confirmation; production remains unchanged.
