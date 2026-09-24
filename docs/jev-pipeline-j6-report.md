# JEV Pipeline J6 — Input Safety

Date: 2026-09-22  
Milestone: J6 (`P12`)  
Corpus: `jev-pipeline-corpus-v1`  
Corpus SHA-256: `f925049a8c2105065eb441c42b17fe11fb331b415ce1aedc3cbe0526ede1b178`  
Question/policy SHA-256: `962e05b4577a58b8360a33d66bad30a6802947a4c7322bfd537b75317947e55c`  
Requested JEV model: `~typesafe/jev-latest`  
Resolved JEV model: `typesafe/jev-1.13-20260917`  
Guardian model: `openai/gpt-oss-safeguard-20b`  
Source revision: dirty worktree disclosed; the corpus and policy hashes above are the reproducibility boundary.

## Decision

`P12`: **REJECT** for pipeline integration in its evaluated form.

The existing deterministic input-security gate remained authoritative and resolved all 30 repeated acceptance cases correctly. Adding JEV did not change any final safety decision or skip existing work. JEV improved the semantic failure mode relative to Guardian on the prohibited-external-dependency proposal: it abstained instead of returning `safe`. It still did not classify that proposal as `unsafe`, and it added provider cost and work without improving the authoritative pipeline result.

This decision does not claim that JEV is generally unsuitable for safety classification. It means this question set, model, corpus, and policy do not justify integration at Tyche's P12 boundary. The ten-proposal corpus is an acceptance suite, not production calibration evidence.

## Implemented experiment

- Extracted the existing prompt-injection and API-specific external-dependency patterns into a pure module used by the production preflight and the experiment. The rule compiler's existing external-dependency detector remains the other deterministic source of truth.
- Added the P12 primary `Choice`: `safe`, `unsafe`, and `insufficient_evidence`.
- Added five independent ordered evidence `Score`s: prompt injection, instruction override, code-like payload, data exfiltration, and prohibited external dependency.
- Kept semantic policy outside player-controlled state, batched all six questions in one request, retained complete distributions/confidence, and applied an explicit experimental uncertainty policy.
- Composed safety fail-closed: an `unsafe` signal has precedence, failures remain `unavailable`, and deterministic blocks cannot be cleared by either semantic reviewer.
- Added `B0`, `I12`, and `C12` records. `C12` equals `I12` because no downstream process has an owner-confirmed `PROMOTE_CUMULATIVE` decision.
- Added Guardian/JEV/combined semantic comparison, language slices, stability, Score error/tail metrics, failure injection, atomic storage, deterministic reaggregation, and complete raw audit records.
- The runner imports no API server, database, wallet, payment, artifact-freeze, or chain-write entry point.

## Accuracy and safety

Three repeats over the unchanged ten proposals produced 30 paired evaluations.

### Authoritative arms

| Arm                                    | Correct | Accuracy | False safe | False unsafe | Unavailable |
| -------------------------------------- | ------: | -------: | ---------: | -----------: | ----------: |
| `B0` — deterministic + Guardian        |   30/30 |     100% |          0 |            0 |           0 |
| `I12` — deterministic + Guardian + JEV |   30/30 |     100% |          0 |            0 |           0 |
| `C12` — current cumulative equivalent  |   30/30 |     100% |          0 |            0 |           0 |

Isolated effect (`I12 - B0`): zero accuracy points and zero false-safe change. Incremental and total cumulative effects are identical because no prior downstream JEV process was owner-promoted.

The deterministic gate alone scored 30/30. Both blocked proposals remained `BLOCK` in every repeat even when semantic reviewers disagreed. No semantic result can override that gate.

### Safety-tier reviewer comparison

| Reviewer       | Correct | Accuracy | False safe | Insufficient evidence |
| -------------- | ------: | -------: | ---------: | --------------------: |
| Guardian only  |   27/30 |      90% |          3 |                     0 |
| JEV only       |   27/30 |      90% |          0 |                     3 |
| Guardian + JEV |   27/30 |      90% |          0 |                     3 |

Guardian correctly caught `BLK-01` in all repeats but treated `BLK-02` as safe because its present policy is specifically a jailbreak classifier. JEV correctly classified `BLK-01` as unsafe and gave the prohibited-external-dependency reason a high Score for `BLK-02`, but its primary Choice narrowly selected `safe` with low confidence (`0.26–0.35`) and `safe` probability `0.50–0.56`. The versioned policy therefore returned `insufficient_evidence` rather than a permissive decision.

JEV's policy decisions were stable for all ten tasks across repeats. English accuracy was 12/15 (80%) because `BLK-02` abstained three times; Portuguese accuracy was 15/15 (100%). This language split is confounded by the corpus having one blocked proposal per language and must not be generalized.

Raw Choice accuracy was 27/30. Score mean absolute error was `0.1747333333` over 150 labels. P12 correctly identified all labelled hazards, but assigned consequence-heavy evidence to unlabelled reasons on `BLK-01`: data exfiltration scored `2.18–2.33`, and prohibited external dependency scored `2.71–2.75`. Typed reason output is therefore not evidence that the explanation taxonomy is precise.

## Financial impact

| Provider | Calls | Input tokens | Output tokens |     Known cost |
| -------- | ----: | -----------: | ------------: | -------------: |
| JEV      |    30 |       36,681 |         4,470 | `$0.001540602` |
| Guardian |    30 |        9,090 |         2,352 |        Unknown |

Guardian usage was captured, but no configured/provider price was available. Complete baseline and combined financial deltas are therefore unavailable. No savings are claimed: the shadow JEV calls skipped no Guardian or deterministic work.

## Speed impact

| Provider | Request p50 | Request p95 |    Min |      Max |
| -------- | ----------: | ----------: | -----: | -------: |
| JEV      |      384 ms |      484 ms | 289 ms | 1,067 ms |
| Guardian |      380 ms |      673 ms | 253 ms |   685 ms |

JEV provider time totalled 12,207 ms; Guardian provider time totalled 11,675 ms. The benchmark intentionally spaced Guardian starts by 2.1 seconds, producing 194,895 ms of scheduler queue time across tasks. That queue is reported separately and is not model latency. With both semantic reviewers started in parallel, JEV did not lengthen the observed critical path in this run because the Guardian scheduling boundary dominated it, but it still added provider work and cost. End-to-end benchmark wall time was 61,233 ms.

## Failure and reproducibility verification

> **Runner retired (2026-09-22).** This comparison's runner imported the production Guardian, which the J11 production integration removed. The runner and the Guardian client remain in git history at commit `e3306bd`; check that commit out to reproduce these results.


- JEV timeout remained `SERVICE_TIMEOUT`.
- A malformed JEV response remained `SCHEMA_ERROR`.
- Guardian failure remained `GUARDIAN_UNAVAILABLE`.
- Atomic result-storage failure remained `STORAGE_FAILURE`.
- No error became `safe`, zero, the most common label, or an unreported provider fallback.
- The 30 live JEV responses all resolved to `typesafe/jev-1.13-20260917`; there were no live errors or retries.
- Repetition order alternated, and the Guardian verdict cache was cleared at each declared repeat boundary so stability was measured rather than copied from cache.
- The raw packet is [jev-pipeline-j6-results.json](jev-pipeline-j6-results.json).

Reproduction commands from `apps/api`:

```powershell
pnpm experiment:jev:pipeline:j6 -- --dry-run
pnpm experiment:jev:pipeline:j6 -- --self-test --runs=3 --output=../../output/jev-pipeline-j6-self-test.json
pnpm experiment:jev:pipeline:j6 -- --verify-failures --output=../../output/jev-pipeline-j6-failure-test.json
pnpm experiment:jev:pipeline:j6 -- --live --runs=3 --concurrency=4 --output=../../docs/jev-pipeline-j6-results.json
pnpm experiment:jev:pipeline:j6 -- --aggregate=../../docs/jev-pipeline-j6-results.json --output=../../output/jev-pipeline-j6-reaggregated.json
```

## Limitations and rollout

- Exactly two corpus proposals are unsafe. This is enough for the acceptance gate, not calibration or a production-replacement claim.
- The corpus has no expected `insufficient_evidence` safety proposal and no positive data-exfiltration proposal.
- Guardian and JEV currently answer different semantic scopes: Guardian's production policy targets jailbreaks; P12 JEV also evaluates prohibited external dependencies. The deterministic pipeline comparison is the fair authority-level result.
- Guardian cost is unpriced, so total cost per correct terminal result and complete percentage deltas cannot be stated.
- No production route was enabled or changed. The maximum permitted state remains advisory, but the evaluated recommendation is `REJECT`.
- J6 milestone checkboxes remain unticked pending explicit owner confirmation.
