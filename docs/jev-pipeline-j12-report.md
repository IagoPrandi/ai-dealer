# JEV Pipeline J12 — Recovering P6's Recall Without Losing Its Safety

Date: 2026-09-23  
Scope: targeted fixes for the J11 recall losses in the production rule pipeline (P6, strict artifact veto), measured through the real two-phase flow  
Rollout state: implemented on branch `feat/jev-pipeline-evaluations` (uncommitted); J12 is unticked pending owner confirmation  
Raw packets: [`jev-pipeline-j12-production-results.json`](jev-pipeline-j12-production-results.json) (pipeline), [`jev-pipeline-j12-artifact-check-results.json`](jev-pipeline-j12-artifact-check-results.json) (offline artifact check)

## Answer

Recall roughly doubled. Every J11 safety result still holds.

| Criterion | J11 (1 repeat, 76 runs) | J12 (repeats 1–2, 152 runs) |
| --- | ---: | ---: |
| False accepts | 0 | **0** |
| Disguised injections `ADV-B1`, `ADV-B2` blocked | 2/2 | **4/4** |
| Ambiguous proposals accepted | 0/23 | **0/46** |
| Blocked proposals blocked | 8/8 | 16/16 |
| **Clear rules that read the draw, accepted** | 13/34 (38%) | **53/68 (78%)** |
| All clear rules, accepted | 13/45 (29%) | 55/90 (61%) |
| Guess-only clear rules routed to scope confirmation | 10/11 | 20/22 (2 accepted) |
| Spend per accepted rule (all runs' cost ÷ accepts) | $0.0118 | **$0.0065** |
| Cost per clear-rule run | $0.0026 | $0.0032 |
| Clear-rule latency p50 / p95 / max | 32 s / 311 s / 350 s | 29 s / **127 s** / 169 s |

**Why repeat 3 is incomplete.** The OpenRouter account reached its monthly budget during repeat 3. After 24 of 76 executions, every Jev call returned HTTP 403 ("Budget limit exceeded"). The pipeline failed closed as designed: each of the 52 affected runs stopped with `RULE_SAFETY_UNAVAILABLE` and nothing was accepted. Headline figures use the two complete repeats. With the 24 valid repeat-3 runs, draw-reading clear recall is 65/80 (81%), still with 0 false accepts.

**Guess-only rules are scored separately.** 11 of the 45 corpus rules labeled CLEAR never read the draw ("the sum of your six numbers is even"). For these, the interpreter always asks the player to confirm that the draw is ignored. This is the product's semantic-impact gate (2026-07-15): a guess-only rule lets every player choose a winning ticket, so the player must consent. For these rules, CLARIFY is the intended first route, not a loss. J11 had counted it as one; see "Correction to J11".

By suite, for clear rules that read the draw, over repeats 1–2:

| Suite | Accepted |
| --- | ---: |
| v1 | 10/10 |
| held-out | 26/36 |
| fresh | 9/10 |
| adversarial | 8/12 |

## What changed

Each change targets a loss J11 measured. The diagnostics were run live on the lost items; they are summarized here and are not in the repo.

| # | Change | J11 evidence |
| --- | --- | --- |
| 1 | The ledger's product defaults state the compiler's own reading of a match: anywhere in the draw unless positions or order are stated. | The ledger asked "same position or anywhere?" on `BENCH-M01`/`M05`; the compiler already reads a match as `intersection(guess, draw)`. |
| 2 | A verbatim claim (meaning equals its span after normalization) is judged supported by code, and Jev is not asked. | Jev answered 0.50–0.77 on verbatim English claims (`BENCH-C01`, `FR-C6`, `M04`), a coin flip on a question with an exact answer. |
| 3 | A ledger still routed to REVIEW after its revision gets one fresh generation, independently seeded. The exception is a ledger on which Jev leaned ambiguous (P(vague) ≥ 0.5 or P(decided) ≤ 0.5). CLARIFY is never regenerated. | Most REVIEW items verified on a second try. J10's implicit ambiguity `ADV-A1` scores vague 0.73–0.76, so the guard keeps it from being regenerated away. |
| 4 | The artifact-check state defines the vocabulary of the code-generated description ("your numbers" = all six ticket numbers, "is equal to" = exactly equal, …). A context claim (dimension `other`) is checked for consistency. An instruction or a condition filed as context must still be implemented. | Scenario questions scored 0.97 on correct ASTs, yet "does the description implement the claim" scored 0.58–0.61 when the description dropped "six" or "exactly", and 0.34 on a context clause. |
| 5 | Boundary pairs never repeat a ticket already shown by another pair. This applies both to the scenarios Jev reads and to the examples the player sees. | `BENCH-S02` showed the same ticket twice. |
| 6 | When exactly one compiler produced a viable AST, the other is asked once more; acceptance still needs behavioral agreement. `LLM_COMPILE_TIMEOUT_MS=120000` bounds each compiler call. | 4 of 6 `PROVIDER_DISAGREEMENT` losses followed ~310 s stalls, and the same items compiled in 2–8 s on rerun. |

These changes are implemented but have not been measured yet:
- **Reason codes before compilation (after measurement).** A refusal made before any compile no longer reports `SCHEMA_INVALID`/`UNSUPPORTED_RULE` from a null candidate. It only reports why it refused. This affected diagnostics, not routing.
- **Measurement harness.** It now records the interpret-time clarification questions and the guess-only split.

The changes were measured together; the budget did not allow ablation runs. The offline evaluation below isolates change 4.

## Offline artifact-check evaluation (change 4)

`scripts/jev-artifact-check-evaluation.mts` compares the J11 check state with the J12 state on the corpora's candidate ASTs. It uses one freshly verified ledger per item, shared by both variants, with 2 repeats. There are 44 correct candidates and 33 non-degenerate wrong candidates (one-change mutations).

| Check | J11 state | J12 state |
| --- | ---: | ---: |
| Correct AST supported | 63/88 (72%) | **76/88 (86%)** |
| Wrong AST supported (false support) | 0/66 | **0/66** |
| Wrong AST confident defect | 48/66 | 50/66 |
| Wrong AST only uncertain | 18/66 | 16/66 |

The last row is why strict mode stays the default. Wrong ASTs such as `FR-C2` "at most → fewer than" and `FR-C8` "at least → greater" come back only *uncertain*, never confidently negative. `confident_negative` mode would accept them if both compilers agreed on them.

## Remaining losses (clear rules that read the draw, 15 of 68)

| Stage | Runs | Items |
| --- | ---: | --- |
| Strict veto `SEMANTIC_CHECK_UNCONFIRMED` | 7 | `BENCH-M04` ×2, `M05`, `C05`, `C03`, `ADV-C6` ×2 |
| Ledger re-verification at compile flipped to REVIEW | 2 | `BENCH-C04`, `S09`: verified at interpret, and the same ledger scored just under 0.80 on the second Jev call |
| `PROVIDER_DISAGREEMENT` | 2 | `BENCH-C05`, `C02` |
| Ledger CLARIFY at interpret | 2 | `ADV-C5` ×2 |
| Jev confident negative `SEMANTIC_CHECK_FAILED` | 1 | `BENCH-M05` |
| Ledger REVIEW at interpret | 1 | `FR-C7` |

`ADV-C6` ("mais da metade dos números") needs Jev to infer that "more than half" of six means at least 4; the vocabulary does not cover that. Several strict vetoes are ranking or compound rules for which the ledger wrote a fragment claim (for example, "All submitted tickets.").

## Correction to J11

The J11 report attributed its 12 interpret CLARIFYs to the claim ledger and said the interpreter asked in none of them. That was wrong. That run did not record which signal asked. J12's diagnostic shows the interpreter asking deterministically on every guess-only rule: 10 of those 12 were the scope confirmation above. The J11 report now carries the correction. Under the J12 scoring, J11's recall on clear rules that read the draw was 13/34 (38%).

## Options for the owner (not implemented)

1. **Restore the OpenRouter budget and complete the third repeat** (or run three new repeats) before any rollout decision.
2. **Remove the compile-time re-ask noise.** Replace the second Jev call on an unchanged ledger with a server-signed interpret verdict: a MAC over the sanitized text, the ledger, and the verdict. The client still cannot forge it, and one Jev call per rule goes away. This needs a new server secret.
3. **Reduce fragment claims.** Ask the ledger prompt to keep frame phrases inside the condition they frame ("Among all submitted tickets, the ticket … wins"), or give eligibility fragments the context-claim treatment. Either one must be re-measured under strict mode.
4. **Label guess-only rules in the corpora** as CONFIRM, so that future reports score the confirmation route directly. The harness already separates them.

## Limits

- Two complete repeats plus 24 runs of a third. The ledger and Jev vary from run to run, so rates are estimates on this corpus, not guarantees.
- The shared-misreading failure class (both compilers agreeing on the same wrong AST) is still unobserved in production runs.
- Changes 1–6 were measured together, and only change 4 has an isolated measurement.
- A Jev budget or quota failure currently surfaces as `JEV_NOT_CONFIGURED` internally and `RULE_SAFETY_UNAVAILABLE` (503) to the player. Both fail closed, but the internal code names the wrong cause.

## Reproduction

```powershell
cd apps/api
node --import tsx scripts/jev-pipeline-j8-baseline.mts --suite=all --runs=3 --output=../../docs/jev-pipeline-j12-production-results.json
node --import tsx scripts/jev-artifact-check-evaluation.mts --repeats=2 --out=../../docs/jev-pipeline-j12-artifact-check-results.json
```

Both runs read the root `.env`, including the new `LLM_COMPILE_TIMEOUT_MS=120000`. They created or changed no proposal, payment, artifact freeze, wallet, database, or on-chain state.
