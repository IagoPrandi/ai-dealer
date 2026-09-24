# JEV pipeline J2 evaluation report

Date: 2026-09-22  
Experiment: `jev-j2-2026-09-22T12-35-27-462Z`  
Corpus: `jev-pipeline-corpus-v1`  
Corpus SHA-256: `f925049a8c2105065eb441c42b17fe11fb331b415ce1aedc3cbe0526ede1b178`  
Question/policy SHA-256: `09b44ae78a3a4b0fb7c288c83a019b674104151fe1fe29944ffd7d0f901e55c8`  
Requested model: `~typesafe/jev-latest`  
Resolved model: `typesafe/jev-1.13-20260917`

## Outcome

J2 is implemented and evaluated in isolated and cumulative-shadow form. Nothing
was enabled in production.

- `P03` recommendation: `REWORK_AND_RETEST`.
- `P04` recommendation: `ADVISORY_ONLY`.
- Neither process is promoted into a production route or a later cumulative
  arm. `C3` equals `I3` and `C4` equals `I4` because no downstream JEV process
  has owner-confirmed promotion.
- Existing compiler generation, deterministic validation, behavior fixtures,
  independent review, player confirmation, artifact binding, and runtime
  execution remain authoritative.

## Method

The experiment used the unchanged ten source proposals for three repeats. It
executed 36 P03 tasks and 45 P04 tasks. Repeat order alternated, P04 candidate
order rotated, candidate IDs were opaque, and provider identity was excluded
from JEV state.

P03 evaluated ten primary repair sets plus a duplicate-finding control and a
contradictory-set control per repeat. Each finding received one ordered Score
and three Nouls. Deterministic code separately enforced DSL/schema legality,
duplicate removal, and finding contradiction. Only a high-confidence
`sufficient_set` could expose source-supported findings to a hypothetical repair
model; this experiment invoked no repair model.

P04 evaluated five complete clear-rule provider disagreements, five
correct-candidate-omitted controls, three ambiguous provider disagreements, and
two prohibited-source candidate sets per repeat. Each candidate received source
fidelity, interpretation coverage, and disputed-clause Nouls plus one Choice
over opaque candidate IDs and `none_adequate`. A selected candidate also had to
clear every required Noul; otherwise the policy returned `unavailable`.

`B0` is the frozen authoritative fixture decision at the same stage. It is a
correctness oracle with zero simulated provider cost, not a measurement of the
full current compiler pipeline. Repair findings and candidates were frozen
fixtures, so generative-provider cost and latency were deliberately not claimed
as savings or included in the measured boundary.

## Financial, accuracy, and speed results

| Process | Arm  | Correct stage decisions | Raw Choice accuracy | Automation coverage |         Cost | Cost/correct | Wall p50 | Wall p95 |
| ------- | ---- | ----------------------: | ------------------: | ------------------: | -----------: | -----------: | -------: | -------: |
| P03     | `B0` |            36/36 (100%) |                100% |                100% |           $0 |           $0 |     0 ms |     0 ms |
| P03     | `I3` |           6/36 (16.67%) |      15/36 (41.67%) |              22.22% | $0.003479868 | $0.000579978 |   365 ms |   632 ms |
| P03     | `C3` |           6/36 (16.67%) |      15/36 (41.67%) |              22.22% | $0.003479868 | $0.000579978 |   365 ms |   632 ms |
| P04     | `B0` |            45/45 (100%) |                100% |                100% |           $0 |           $0 |     0 ms |     0 ms |
| P04     | `I4` |          39/45 (86.67%) |        45/45 (100%) |              86.67% | $0.003343914 | $0.000085741 |   363 ms |   481 ms |
| P04     | `C4` |          39/45 (86.67%) |        45/45 (100%) |              86.67% | $0.003343914 | $0.000085741 |   363 ms |   481 ms |

The actual live run made 81 provider calls and cost $0.006823782. Isolated and
cumulative records reuse the same shadow observation; their costs must not be
added together as if separate calls occurred. There were no retries, transport
errors, malformed live responses, or model drift.

P03 recorded 108 Score answers with 79.63% rounded-level accuracy and 324 Noul
answers with Brier score 0.06575. P04 recorded 327 Noul answers with Brier score
0.01946.

## P03 findings

P03 failed the stage-accuracy gate. All five clear primary repair sets were
expected to be `sufficient_set`, but none cleared the policy in any repeat. Raw
Choice repeatedly interpreted the presence of rejected distractor findings as a
partial or contradictory set, even though deterministic filtering preserved the
single source-supported correction. The explicit contradiction control also
remained below the 70/70 action band in all three repeats.

The policy failed closed: it supplied no wrong automatic repair finding, and no
blocked or ambiguous proposal became repairable. That safety property is not
enough to promote a process with 16.67% exact stage accuracy, 22.22% coverage,
added cost, and added latency. P03 should be redesigned so the collective
judgment evaluates the deterministically filtered viable set, while duplicates
and contradictions remain explicit code-owned evidence, then rerun from a new
question-set version.

## P04 controls and disagreements

The raw P04 Choice was correct on all 45 observations:

- all 15 complete clear-rule observations selected the reference candidate,
  despite candidate-order rotation;
- all 15 correct-candidate-omitted observations selected `none_adequate`;
- all nine ambiguous provider-disagreement observations selected
  `none_adequate`;
- all six prohibited-source observations selected `none_adequate`.

The named 70/70 policy converted six correct `none_adequate` Choices into
explicit `unavailable` abstentions: all three `CLR-05` omitted-candidate
observations, two `AMB-01` observations, and one `AMB-03` observation. Exact
policy accuracy was therefore 39/45. Safety remained 45/45: no best-wrong
candidate was selected, every omitted-candidate control returned
`none_adequate` or abstained, and every provider-disagreement control selected
the correct candidate, selected `none_adequate`, or abstained. No wrong
candidate crossed the automatic-action policy.

P04 has useful advisory signal, but it adds cost and about 0.36 seconds median
latency without replacing any existing authoritative work. The ten-proposal
corpus is not a calibration population, so the observed threshold behavior does
not justify controlled routing or production use.

## Failure and reproducibility checks

Failure injection passed:

- timeout -> `SERVICE_TIMEOUT` with no semantic judgment;
- malformed response -> `SCHEMA_ERROR` with no semantic judgment;
- storage failure -> `STORAGE_FAILURE`, with no partial report replacement.

The response boundary rejects missing, extra, malformed, non-finite, and
out-of-range answers. Score validation requires exact declared legend keys and
values, complete probabilities, valid confidence, and an in-range score. Raw
distributions, Nouls, Scores, model IDs, tokens, provider cost, latency, retries,
errors, state hashes, question hashes, policy versions, and per-task outcomes
are in `jev-pipeline-j2-results.json`.

Reproduction:

```powershell
pnpm --filter @tyche/api experiment:jev:pipeline:j2 -- --dry-run
pnpm --filter @tyche/api experiment:jev:pipeline:j2 -- --verify-failures
pnpm --filter @tyche/api experiment:jev:pipeline:j2 -- --self-test --runs=3
pnpm --filter @tyche/api experiment:jev:pipeline:j2 -- --live --runs=3 --concurrency=4 --output=../../docs/jev-pipeline-j2-results.json
pnpm --filter @tyche/api experiment:jev:pipeline:j2 -- --aggregate=../../docs/jev-pipeline-j2-results.json --output=../../docs/jev-pipeline-j2-results.json
```

The runner imports no API server, database, wallet, payment, proposal,
artifact-freeze, or chain-write entry point. No production data, proposal,
payment, frozen artifact, transaction, or on-chain state was created or changed.

## Limitations

- The corpus contains exactly ten proposals and cannot calibrate thresholds or
  establish population accuracy.
- P03 findings and P04 candidates are frozen fixtures. The experiment does not
  measure generative candidate/finding quality or its provider cost.
- `B0` is an authoritative stage oracle rather than a paid replay of the entire
  current compiler and reviewer pipeline.
- P04's raw result is encouraging, but its perfect Choice result is 45 repeated
  observations over 15 task shapes, not 45 independent proposal types.
- No terminal payment, artifact, or settlement route was exercised; those
  actions remain intentionally outside JEV authority.
