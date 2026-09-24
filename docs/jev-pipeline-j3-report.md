# JEV Pipeline Evaluation — J3 Report

Date: 2026-09-22  
Experiment: `jev-j3-p05-2026-09-22T11-52-25-566Z`  
Scope: J3 structured AST provenance and isolated/cumulative `P05` evaluation  
Rollout state: evaluation only; JEV has no production-routing authority

## Decision

| Process                                               | Recommendation      | Rationale                                                                                                                                                                                         |
| ----------------------------------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P05 — candidate AST explanation and semantic coverage | `REWORK_AND_RETEST` | The fail-closed policy made no automatic wrong acceptance, but scored only 27/54 (50.00%) against the 54/54 baseline and sent 33/54 cases to review. It therefore fails the non-inferiority gate. |
| P05 cumulative                                        | Do not promote      | `C5` equals `I5` because no downstream JEV process has owner-confirmed promotion. No production route or authoritative validator was replaced.                                                    |

J3 implementation is ready for owner review, but its PRD checkbox remains unchecked pending explicit owner confirmation.

## Implementation delivered

- The compiler candidate contract now requires one `AstProvenanceRecord` for every deterministic semantic AST path. Each record contains an exact `astPath`, exact source citations, a behavioral claim, and a selection reason.
- A deterministic, exhaustive path renderer supplies the authoritative behavior description for each version 2 and version 3 AST path. Unknown, duplicate, missing, extra, malformed, or non-source provenance fails provider evidence closed.
- Compiled artifacts retain the deterministic path descriptions and verified provenance records for audit. Legacy artifact fields remain readable, but newly compiled provider artifacts must satisfy the provenance contract.
- The rule-authoring prompt/skill is versioned and requires complete structured provenance. Provenance is evidence only; it does not replace schema, coverage, runtime, behavioral, review, confirmation, or artifact-binding checks.
- The P05 runner batches two Nouls per record, two collective Nouls, and one five-way Choice in one request per candidate. The provisional 70% Choice-confidence, Choice-probability, and support-Noul gates are named experimental policy, not production defaults.
- Dry-run, oracle self-test, strict schema/model checks, bounded retry, atomic storage, reaggregation, and timeout/malformed/storage failure injection are implemented. The runner imports no production server, database, wallet, payment, artifact-freeze, or chain-write entry point.

## Reproducibility boundary

- Corpus: `jev-pipeline-corpus-v1`; exactly 10 fixed proposals: 5 clear, 3 ambiguous, and 2 blocked.
- Candidate tasks per repeat: 18 — 10 clear candidates, 6 ambiguous candidates, and 2 blocked approximations.
- Corpus SHA-256: `f925049a8c2105065eb441c42b17fe11fb331b415ce1aedc3cbe0526ede1b178`.
- State schema: `jev-p05-state-schema-v1`.
- Question set: `jev-p05-question-set-v1`.
- Question/policy SHA-256: `f99079b399b62362760158b5af4709d5e14a7811b057b5aa2af6b7089dc5699e`.
- Decision policy: `jev-p05-advisory-70-v1`.
- Repeats: 3; 54 P05 calls and 1,092 labeled Nouls.
- Requested model: `~typesafe/jev-latest`; resolved model on every call: `typesafe/jev-1.13-20260917`.
- Source revision: dirty worktree disclosed. Corpus, state, question, and policy hashes are the exact reproducibility boundary.
- Raw packet: [`jev-pipeline-j3-results.json`](jev-pipeline-j3-results.json).

Hidden reference labels, expected choices, mutation notes, and oracles are excluded from the public JEV state. No proposal, payment, artifact freeze, wallet, database, or on-chain state was mutated.

## Accuracy

| Arm                             | Correct | Accuracy | Raw Choice accuracy | Automatic wrong accepts | Review/unresolved | Automation coverage |
| ------------------------------- | ------: | -------: | ------------------: | ----------------------: | ----------------: | ------------------: |
| B0 deterministic fixture oracle |   54/54 |  100.00% |             100.00% |                       0 |                 6 |              88.89% |
| I5 P05 isolated                 |   27/54 |   50.00% |              88.89% |                       0 |                33 |              38.89% |
| C5 cumulative                   |   27/54 |   50.00% |              88.89% |                       0 |                33 |              38.89% |

The isolated and cumulative results are identical by design because no downstream process is owner-confirmed for cumulative inclusion.

### P05 confusion matrix

| Expected route          | Correct route | `insufficient_evidence` | Other wrong route |
| ----------------------- | ------------: | ----------------------: | ----------------: |
| `candidate_supported`   |          0/15 |                      15 |                 0 |
| `candidate_defect`      |         12/15 |                       3 |                 0 |
| `source_ambiguous`      |          9/18 |                       9 |                 0 |
| `insufficient_evidence` |           6/6 |                       0 |                 0 |

All 18 candidate decisions were stable across the three repeats, but stability did not imply correctness. Every correct clear reference was conservatively downgraded because at least one required source-support Noul fell below 0.70. The clearest failure was the record granularity: full source sentences supported the rule as a whole, while generic per-node reasons did not convincingly justify low-level source, literal, reducer, and binder paths independently.

`CLR-05/strict-distance` was also downgraded rather than classified as `candidate_defect` in all repeats. Its raw Choice incorrectly preferred `candidate_supported`, but with probability and confidence below the action threshold, so the fail-closed policy prevented a wrong acceptance. Three ambiguous candidate shapes were consistently identified as `source_ambiguous`; the remaining three were conservatively downgraded in one or both candidate variants.

The acceptance-suite safety conditions held: no ambiguous or blocked proposal was automatically accepted, and no mutated clear candidate was released. This necessary safety result is insufficient for promotion because stage accuracy regressed by 50 percentage points.

## Calibration

- Noul Brier score: `0.0737646520` over 1,092 labeled Nouls.
- Raw Choice selected-option accuracy: 48/54 (88.89%).
- Policy accuracy after the experimental 70% gates: 27/54 (50.00%).
- All 15 correct-reference judgments had raw `candidate_supported` as the top Choice, but per-record source-support Nouls caused all 15 to abstain.

The 70% values are not calibrated production thresholds. The result indicates a state/provenance-granularity mismatch, so threshold lowering alone would be unsafe and would not address the incorrect `CLR-05/strict-distance` Choice.

## Financial impact

| Boundary          |                     Calls |   Known cost | Cost per correct stage result |
| ----------------- | ------------------------: | -----------: | ----------------------------: |
| B0 fixture oracle |                         0 |           $0 |                            $0 |
| I5 P05 isolated   |                        54 | $0.009956268 |                  $0.000368751 |
| C5 cumulative     | 54 shared I5 observations | $0.009956268 |                  $0.000368751 |

The provider reported all costs. The 54 calls consumed 237,054 input tokens and 29,760 output tokens. Average reported cost was approximately $0.00018438 per call.

No savings are claimed. This was a shadow evaluation and skipped no compiler, Guardian, deterministic validation, independent review, player confirmation, or human-review work. Infrastructure and human-review rates were not supplied, so those costs remain unavailable.

## Speed

| Boundary          | p50 wall | p95 wall | Minimum | Maximum |
| ----------------- | -------: | -------: | ------: | ------: |
| I5/C5 P05 request |   360 ms |   600 ms |  316 ms |  651 ms |

Provider p50/p95 were 360/599 ms. The complete concurrent benchmark took 5,378 ms at concurrency four. There were no retries, timeouts, malformed responses, or model-drift failures. The deterministic B0 fixture oracle recorded zero network latency and is not presented as an end-to-end production compiler comparison.

## Failure and safety verification

- Timeout injection remained `SERVICE_TIMEOUT` and produced no judgment.
- Malformed response injection remained `SCHEMA_ERROR` and produced no judgment.
- Storage failure remained `STORAGE_FAILURE`; atomic output did not conceal it.
- Response validation rejects missing, extra, malformed, non-finite, or distribution-invalid answers.
- The resolved model is checked against the pinned experiment model; drift is an explicit failure.
- Provider provenance with incomplete or invalid AST path coverage is rejected as `PROVIDER_EVIDENCE_UNVERIFIED`.
- JEV remains advisory and cannot authorize payment, artifact freeze, execution, or settlement.

## Verification commands

```text
pnpm --filter @tyche/api experiment:jev:pipeline:p05 --dry-run
pnpm --filter @tyche/api experiment:jev:pipeline:p05 --self-test --runs=3 --output=<temporary-path>
pnpm --filter @tyche/api experiment:jev:pipeline:p05 --verify-failures
pnpm --filter @tyche/api experiment:jev:pipeline:p05 --live --runs=3 --concurrency=4
pnpm --filter @tyche/api experiment:jev:pipeline:p05 --aggregate=../../docs/jev-pipeline-j3-results.json --output=../../docs/jev-pipeline-j3-results.json
pnpm --filter @tyche/rule-compiler typecheck
pnpm --filter @tyche/rule-compiler test
pnpm --filter @tyche/rule-compiler lint
pnpm --filter @tyche/rule-compiler build
pnpm --filter @tyche/api typecheck
pnpm --filter @tyche/api test
pnpm --filter @tyche/api lint
pnpm --filter @tyche/api build
```

## Required rework before a fresh P05 run

1. Define provenance records over player-meaningful semantic units rather than requiring independent source justification for every implementation-level AST path.
2. Cite the narrowest exact source span and emit a specific selection reason for each semantic claim; do not reuse the entire proposal and a generic reason for every node.
3. Preserve deterministic path descriptions as the behavioral authority and retain exact path coverage, but explicitly map implementation paths to their owning semantic record.
4. Add focused mutations where AST shapes differ as well as mutations that preserve the same path shape, then rerun all three repeats under a new state/question/policy version.
5. Keep JEV shadow-only until isolated accuracy is non-inferior to B0 with zero automatic wrong acceptance.

The ten-proposal corpus is an acceptance suite, not statistical production proof. P05 did not meet the process promotion gate and must remain off the production route.
