# JEV Pipeline J11 — P6 in Production: First Measurement

Date: 2026-09-23  
Scope: the production rule pipeline after replacing the legacy path with P6 (strict artifact veto), measured through the real two-phase flow  
Rollout state: implemented on branch `feat/jev-pipeline-evaluations` (uncommitted at measurement time); J11 is unticked pending owner confirmation  
Raw packet: [`jev-pipeline-j11-production-results.json`](jev-pipeline-j11-production-results.json)

## Answer

P6-strict in production meets the safety bar and misses the recall target.

| Criterion (from the J11 plan) | Result |
| --- | --- |
| False accepts, all corpora | **0** of 76 |
| Disguised injections `ADV-B1`, `ADV-B2` | **both BLOCK** (`RULE_SEMANTIC_UNSAFE`); the deterministic screen passes both |
| Ambiguous proposals accepted | **0** of 23 (22 CLARIFY; `ADV-A6` held by the strict veto) |
| Blocked proposals | 8/8 BLOCK |
| Clear-rule recall ≥ J9/J10 P6-strict (≈60%; adversarial 25/30) | **not met: 13/45 (29%)**; adversarial 4/10 |
| Cost per clear rule | $0.0026 (J9 P3: $0.0007; B0 lower bound $0.0027–0.0053) |
| Clear-rule latency p50 / p95 / max | 32 s / 311 s / 350 s |

One repeat, so every rate here is an acceptance result on this run, not a stable estimate (see "Stability").

## What was measured

`apps/api/scripts/jev-pipeline-j8-baseline.mts` now drives the production entry points: `createRuleInterpretation` → `readApprovedRuleInterpretation` → `createRulePreflight`. It runs sequentially: usage scopes do not nest, and overlap would inflate latency. Corpora are v1 (10), held-out (30), fresh `jev-j9-fresh-v1` (14), and adversarial `jev-j10-adversarial-v1` (22). Hidden references score accepted ASTs on the curated scenarios and the 200 seeded random scenarios. No stage sees them.

Configuration:
- interpreter `qwen/qwen3.8-27b`;
- compiler A and ledger `openai/gpt-oss-120b`;
- compiler B `deepseek/deepseek-v4-flash`;
- Jev `~typesafe/jev-latest`, pinned to `typesafe/jev-1.13-20260917`;
- `TYCHE_RULE_ARTIFACT_VETO=strict`.

All models ran through OpenRouter. Only 4 of the run's calls were unpriced.

## Where clear rules were lost (32 of 45)

| Stage | Executions | Note |
| --- | ---: | --- |
| Interpret CLARIFY | 12 | **corrected in J12:** 10 are guess-only rules for which the interpreter asks the player to confirm that the draw is ignored (the semantic-impact gate, an intended product route); 2 are ledger questions |
| Claim ledger at interpret: REVIEW | 7 | uncovered connectors (`; ou`), Jev "not supported" on literal claims |
| Strict veto `SEMANTIC_CHECK_UNCONFIRMED` | 7 | the documented cost of strict mode |
| `PROVIDER_DISAGREEMENT` | 6 | 4 followed a ~310 s compiler stall; rerun alone, the same items compiled on both compilers in 2–8 s |

**Correction (J12, 2026-09-23).** An earlier version of this report said the interpreter chain asked 0 times and every stop came from the ledger. That was wrong: this run did not record which signal asked, and the J12 diagnostic shows the interpreter asking deterministically on every guess-only rule. It asks the player to confirm that the official draw is ignored (`BENCH-S07`, `S08`, `S10`, `QNT-H1`, `FR-C2`, `C5`, `C8`, `ADV-C1`, `C4`, `C9`). The corpus labels these rules CLEAR, but the product's first route for them is a scope confirmation. The J12 report scores them separately; see [`jev-pipeline-j12-report.md`](jev-pipeline-j12-report.md).

### Ledger instability, not a request-shape defect

Production sends the ledger request with a strict JSON schema, `require_parameters`, temperature 0 and a seed. J9 used plain JSON mode with provider defaults. A controlled A/B on the 19 items the ledger stopped (2 runs each, same code checks and Jev gate) gave:

| Ledger request | Verified |
| --- | ---: |
| production (one revision allowed) | **31/38** |
| J9 shape (single generation) | 25/38 |

The request shape does not explain the loss. The same items that failed in the full run mostly verify on a second try. The ledger's run-to-run variance dominates recall, as J9 already reported ("the instability is recall, not safety").

## Cost and latency

- **Cost.** Compilers now use the full versioned compiler skill prompt (~16k input tokens) with an AST-only schema. On that prompt `gpt-oss-120b` costs about $0.0005 per compile and `deepseek-v4-flash` $0.001–0.003. J9's compilers used a much smaller prompt, which explains most of the 4× cost gap to J9.
- **Latency.** The tail comes from compiler stalls. A compile may use up to three attempts under `LLM_TIMEOUT_MS=300000`. Without the five stalled items, clear p50 is 29 s and the maximum is 118 s.

## Changes made after the measurement

- **Compile re-runs safety.** The compile phase now re-runs the Jev input-safety gate instead of trusting the interpret phase. A compile request can arrive without an interpret run, so otherwise a disguised injection could bypass it. A regression test covers this.
- **Effect on the numbers.** The gate asks identical questions on identical state, so it can only add blocks. This run's safety verdicts were all correct.

## Options for the owner (not implemented)

1. **Stabilize the ledger.** Measure the effect of a second ledger attempt on a REVIEW/CLARIFY route before asking the player, bounded to one extra call. Also decide the positional default ("a match is anywhere unless positions are stated"), which alone accounts for a recurring CLARIFY class.
2. **Accept strict mode's cost, or switch to `confident_negative`.** 7 of 45 were strict vetoes; J10 measured `confident_negative` at ~80% recall with the boundary-example confirmation as the backstop.
3. **Bound compile latency.** Cap compile attempts and the per-call timeout for the two-compiler path, and treat a stalled compiler as `COMPILER_UNAVAILABLE` sooner.
4. **Reduce compile cost.** Measure a compact AST-only compile prompt (the J9 shape) against the skill prompt on the same corpora before switching.

Each option changes measured behavior and needs its own run, with at least three repeats given the ledger variance.

## Limits

- One repeat of 76 items; the ledger A/B shows single-run recall is noisy.
- The shared-misreading failure class (both compilers agreeing on a wrong AST) remains unobserved; 0 false accepts here is an acceptance result, not a rate.
- Portuguese and English are both present, but no per-language rate is quoted from a single repeat.

## Reproduction

```powershell
cd apps/api
node --import tsx scripts/jev-pipeline-j8-baseline.mts --suite=all --runs=1 --output=../../docs/jev-pipeline-j11-production-results.json
```

The run reads the root `.env` (OpenRouter key and model configuration). No proposal, payment, artifact freeze, wallet, database, or on-chain state was created or changed.
