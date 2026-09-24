# JEV Pipeline J9 — End-to-End Pipeline Proposals

Date: 2026-09-22  
Scope: complete rule pipelines with **real AST generation**, built from the J0–J8 findings and measured against the current pipeline (B0)  
Rollout state: evaluation only; nothing reached production  
Raw packets: [`jev-pipeline-j9-results.json`](jev-pipeline-j9-results.json), [`jev-pipeline-j9-baseline-heldout-results.json`](jev-pipeline-j9-baseline-heldout-results.json), [`jev-pipeline-j9-baseline-fresh-results.json`](jev-pipeline-j9-baseline-fresh-results.json)

## Recommendation

Adopt **P3 — two independent compilers, JEV at the semantic boundary** as the candidate architecture for a controlled shadow rollout. Keep the P4 confident-negative veto as an optional safety net.

| | B0 (current) | **P3 (recommended)** |
| --- | ---: | ---: |
| Wrong artifact or ambiguous rule accepted | 0 | **0** (in 162 executions) |
| Clear rules accepted, held-out | 6/22 (27%) | **52/66 (79%)** |
| Clear rules accepted, fresh blind set | 3/8 (38%) | **21/24 (88%)** |
| Ambiguous → CLARIFY | 6/6 | 36/39; the other 3 → REVIEW/UNAVAILABLE, never ACCEPT |
| Cost per clear proposal | ≥ $0.0027–0.0053 (about half the calls unpriced) | **$0.00057–0.00069**, all priced |
| Clear-proposal time, fresh (B0 ran alone): p50 / max | 35 s / 419 s | **27 s / 85 s** |
| Clear-proposal time, held-out (runs overlapped): p50 / p95 | 153 s / 1,416 s | 27 s / 78 s |

The gain does not come from JEV being clever. It comes from four changes:
- two cheap independent compilers replace a chain of LLM reviewers, second opinions, and Guardian vetoes whose disagreements sent 14 of 22 clear held-out rules to CLARIFY;
- code verifies the compilers' agreement over generated boundary scenarios;
- the claim ledger gives JEV closed, local questions;
- JEV is used only where code and compiler agreement are blind.

## What was built

All four proposals use only what production would have: the source, a verified claim ledger, generated ASTs, and scenarios derived deterministically from the source. Hidden reference ASTs **score** outcomes afterwards and are seen by no stage.

Shared stages (`apps/api/src/jevPipelineJ9Pipelines.ts`, runner `scripts/jev-pipeline-j9-evaluation.mts`):

1. **Deterministic security screen** — unchanged `ruleInputSafety`.
2. **Claim ledger + JEV ledger gate** — J8 unchanged: literal claims, code-checked spans and material-term preservation, and JEV support/vagueness/decided/material Nouls.
3. **Compilers** — A `openai/gpt-oss-120b`, B `deepseek/deepseek-v4-flash`. Each writes the AST from the full grammar with one schema repair and sees the source only.
4. **Evidence library** (code) — ordered ticket families derived from the numbers the source states: k matches anywhere, k same-position matches, uniform and single-position distances, sum offsets, odd counts, range spans. Plus 200 seeded random scenarios.
5. **Vacuity check** (code) — an AST that always wins or always loses is refused before any model call.
6. **Behavioral equivalence** (code) — A and B are compared on every library and random scenario.
7. **JEV candidate check** — J8 forward/reverse/scenario Nouls on boundary pairs, which are adjacent family members with opposite verdicts. A code-computed structure note states "exactly one of …" when the AST has an exclusive-or shape.
8. **JEV adjudication** — only on disagreement. JEV sees the claims and at most three disagreement scenarios with computed facts and each candidate's verdict, and decides which verdict the claims require.

| Proposal | Route to ACCEPT |
| --- | --- |
| **A0** (ablation) | first schema-valid compile; no semantic gate |
| **P1** verified single compile | ledger verified → compile A → JEV check supported. One JEV-guided regeneration on a defect. |
| **P2** N-version + JEV check | ledger verified → A ≡ B → JEV check supported; disagreement → adjudication → winner's check supported |
| **P3** N-version, JEV at the boundary | ledger verified → A ≡ B → accept; disagreement → adjudication → winner's check supported |
| **P4** (variant of P3) | P3, but a confident JEV negative on A vetoes an agreement accept |
| **N-only / P5** (ablations) | P3 without adjudication / P3 with no JEV anywhere (ambiguity = the LLM lists an open choice) |

Every arm is derived from the **same provider calls**, so arm differences are pure policy differences. Costs and times charge each arm only for the stages it would run: sequential ledger → compile. `*_PARALLEL` variants run the ledger and compiles concurrently.

## Corpus and honesty boundary

- **v1** (10) — used to design J8; regression only.
- **held-out** (30) — frozen before J8, but J8's results on it shaped J9 (the structure note and the second compiler). No longer blind.
- **fresh** `jev-j9-fresh-v1` (14; SHA-256 `750af818…`) — written and frozen before the first J9 run at scale:
  - 8 clear rules, each with a reference, a one-change mutation, and curated boundaries, including a both-conditions-true XOR case;
  - 4 vague rules;
  - 2 blocked rules.

  **This is the only blind J9 evidence.**
- 3 repeats: 162 executions; zero item errors; zero JEV errors on 297 calls. JEV resolved to `typesafe/jev-1.13-20260917`.
- B0 ran once per held-out and fresh proposal. The held-out B0 run overlapped J9 on the same OpenRouter key, so its latency is inflated where they overlapped. The fresh B0 run ran alone, and B0's v1 run in J8 was sequential (clear p50 132 s).

## Results

### Safety and accuracy (all arms, same calls)

| Arm | False accepts | Clear accepted (all) | Clear, fresh | Ambiguous → CLARIFY | Accept precision |
| --- | ---: | ---: | ---: | ---: | ---: |
| A0 no gate | **39** (every ambiguous execution) | 98/105 | 24/24 | 0/39 | 0.715 |
| P1 | 0 | 63/105 | 19/24 | 36/39 | 1.000 |
| P2 | 0 | 63/105 | 19/24 | 36/39 | 1.000 |
| **P3** | **0** | **88/105** | **21/24** | 36/39 | **1.000** |
| P4 (P3 + veto) | 0 | 84/105 | — | 36/39 | 1.000 |
| P5 (no JEV) | 0 | 91/105 | 22/24 | 35/39 | 1.000 |

The 105 clear executions include 6 of `BENCH-M04`/`BENCH-C01`, which the **current** security screen false-blocks ("Among all submitted tickets…" is read as an external dependency). This is a production bug J8 found; every arm inherits it.

### Why each JEV use earned or lost its place

| JEV use | Measured effect | Verdict |
| --- | --- | --- |
| Ledger: claim support (span ↔ meaning) | J8 controls: caught 18/48 unfaithful interpretations that code missed; 0 false supports. In J9 it sent 3 correct rules to review (C03 ×2, FR-C6). | **Keep.** It is the only check on the LLM's own translation. |
| Ledger: vagueness / open choice decided | Corroborated the LLM on 35/36 clarifications. On `FR-A3` ("The best ticket wins") the LLM listed no open choice and **only JEV** routed it to CLARIFY. | **Keep.** The two compilers agreed on 21/39 ambiguous executions, so agreement cannot detect ambiguity. A missed open choice would otherwise be accepted about half the time. |
| Candidate check on agreed ASTs | In all 98 clear executions where both compilers produced an AST, they were equivalent and correct. The check caught **no** error (none existed) and cost 25 correct accepts (P1/P2 vs P3). | **Drop as a gate.** Keep only as the P4 confident-negative veto (4 correct ASTs sent to review, 0 wrong ASTs existed to catch). |
| JEV-guided regeneration (P1) | 4 regenerations, 0 improvements; each "repaired" an already-correct AST. The zod union error `(root): Invalid input` also gave the repair turn nothing to act on. | **Drop.** |
| Adjudication on disagreement | Never needed on a clear rule (0/98 disagreements); on ambiguous rules the ledger stopped them first. | **Keep as designed**, unmeasured. It is the only path to recover a correct AST when compilers split. |
| Candidate check as sole semantic gate | Supported a plausible AST for ambiguous `AMB-02` in 3/3 repeats (also seen in J8). | **Never** let it run without the ledger gate in front. |

### Cost and speed (P3, per proposal)

| | Clear | Ambiguous |
| --- | ---: | ---: |
| P3 cost mean | $0.00069 | $0.00036 |
| P3 critical path p50 / p95 | 27 s / 78 s | 18 s / 54 s |
| B0 cost mean, held-out (lower bound) | $0.0053 | $0.0015 |
| B0 wall p50, held-out (ran concurrently with J9) | 153 s | 10 s |
| B0 cost mean, fresh (lower bound; 32/64 calls unpriced) | $0.0027 | $0.0018 |
| B0 wall p50 / max, fresh (ran alone) | 35 s / 419 s | 9 s |

P3 is **4–8× cheaper** than the B0 lower bound on clear rules. On the clean fresh timing it is only modestly faster at the median (27 s vs 35 s). The large speed gain is the **tail**: B0 reached 419 s alone and 1,416 s under load, while P3 stayed under 90 s. On ambiguous rules, B0's interpreter asks its question in about 10 s; P3 needs about 18 s because the ledger call is heavier. Running the ledger and both compilers in parallel (`P3_PARALLEL`) cuts the clear p50/p95 to 20 s / 50 s. It then pays for compiles on ambiguous sources too: $0.00094 versus $0.00060 mean.

Provider totals: compiler A $0.0307 (141 calls, 1 failure), compiler B $0.0576 (139 calls), ledger LLM $0.0357 (157 calls), JEV $0.0243 (297 calls, p50 380 ms).

### Stability

8 of 54 proposals changed P3 route across repeats: S10, M01, M05, C03, C04, FR-C6, FR-C7, FR-A2. Every change was between ACCEPT (correct) and CLARIFY/REVIEW/UNAVAILABLE. **No proposal flipped between a correct and a wrong accept.** The instability is recall, not safety.

## What still loses recall (P3, 17 of 105 clear executions)

| Cause | Executions | Fix |
| --- | ---: | --- |
| Current screen false-blocks ranking rules (`M04`, `C01`) | 6 | Narrow `hasExternalDependency`: "among all submitted tickets" is the supported ranking domain, not external state. |
| Ledger CLARIFY on a clear rule (`M01`, `M05`, `C04`) | 5 | The LLM raises positional or "what counts" questions that the product could decide by default. Declare "a match means the number appears anywhere in the draw unless positions are stated" in `J8_PRODUCT_DEFAULTS`. **Owner policy decision.** |
| Ledger REVIEW after its one revision (`C03` ×2, `FR-C6`, `FR-C7`), plus one ledger service failure (`FR-C6`, HTTP error → UNAVAILABLE) | 5 | Paraphrased spans and residual segments. Accept an open-choice span that differs from the source only by inflection; `FR-A2`'s "acertar bastante" vs "acerte bastante" also failed this way. |
| Compiler A schema failure (`S10`) | 1 | Replace the detail-free zod union message with the failing branch's issues so the repair turn can act. |

The deterministic renderer also needs grouping. `describeRuleAstTotal` prints `A and not B or not A and B` with no parentheses, so the description is ambiguous for any reader. J9's structure note works around this for the JEV state only.

## Recommended pipeline

```text
player source
  └─ deterministic security screen (fix the ranking false block)            code
       ├─ claim ledger LLM ─ span/term checks ─ JEV ledger gate               LLM + code + JEV (~15 s)
       │     vague / undecided ─────────────────────────► CLARIFY (LLM writes the question)
       │     interpretation defect ─ one revision ─ else ► REVIEW
       ├─ compiler A (gpt-oss-120b)  ┐                                         LLM ×2 in parallel (~10–20 s)
       └─ compiler B (deepseek-v4)   ┘
             vacuity check · equivalence over boundary + random scenarios      code (ms)
             A ≡ B ───────────── [P4: confident JEV negative → REVIEW] ──► boundary examples shown to the player
             A ≠ B ─ JEV adjudication on disagreeing scenarios ─ winner's JEV check ─ else REVIEW
  └─ player confirms the boundary examples ─ hash ─ freeze ─ deterministic runtime (unchanged)
```

What each layer guarantees:

| Failure | Stopped by |
| --- | --- |
| Injection, external dependency | deterministic screen |
| Ambiguous source | ledger LLM open choices **and** JEV vagueness, two independent signals |
| LLM mistranslates the source | code material-term preservation (quantifiers, numbers, comparators, positions) + JEV claim support |
| One compiler misreads | behavioral disagreement (code) → JEV adjudication or review |
| Both compilers misread the same way | P4 JEV veto, then **player confirmation of concrete boundary examples**. This is the one failure class not exercised here (0 events in 98). The evidence library cannot build a "both conditions true" case for exclusive-or rules, so shared XOR mistakes need the structure note plus player examples. |
| Vacuous rule | code vacuity check |

## Limits

- Generation was near-perfect on this corpus (98/98 agreed and correct when both compiled). The corpus therefore cannot measure how P3 behaves when both compilers are wrong the same way. That needs adversarial rules where the natural reading is a trap.
- The fresh set has 14 proposals. Zero false accepts in 42 fresh executions is an acceptance result, not a rate.
- B0 is one repeat per proposal; J9 arms are three.
- Thresholds (0.20/0.80, 0.7/0.7) are experiment policy, not calibrated values.
- Player-confirmation timing and quality are not simulated.

## Reproduction

```powershell
cd apps/api
node --import tsx scripts/jev-pipeline-j9-evaluation.mts --self-test --runs=1 --output=../../output/jev-j9-self-test.json
node --import tsx scripts/jev-pipeline-j9-evaluation.mts --live --suite=all --runs=3 --concurrency=3 --output=../../docs/jev-pipeline-j9-results.json
node --import tsx scripts/jev-pipeline-j9-evaluation.mts --aggregate=../../docs/jev-pipeline-j9-results.json --output=../../output/jev-j9-reaggregated.json
node --import tsx scripts/jev-pipeline-j8-baseline.mts --suite=heldout --runs=1 --output=../../docs/jev-pipeline-j9-baseline-heldout-results.json
node --import tsx scripts/jev-pipeline-j8-baseline.mts --suite=fresh --runs=1 --output=../../docs/jev-pipeline-j9-baseline-fresh-results.json
```

No proposal, payment, artifact, wallet, database, or on-chain state was created or changed. An item-level exception is recorded as that item's `UNAVAILABLE` outcome with its error class; none occurred in the final run.
