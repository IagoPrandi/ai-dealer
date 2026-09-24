# JEV Pipeline J8 — Structured Claim-Ledger State

Date: 2026-09-22  
Scope: rework of the J1–J5 semantic processes (P01/P02 fidelity, P05 provenance, P07/P10 completeness, P09 interpretation) by changing **what JEV is given**, not the model  
Rollout state: evaluation only; JEV has no production-routing authority  
Raw packets: [`jev-pipeline-j8-results.json`](jev-pipeline-j8-results.json), [`jev-pipeline-j8-baseline-results.json`](jev-pipeline-j8-baseline-results.json)

## Decision

| Question | Answer from J8 |
| --- | --- |
| Was the input the problem? | **Yes.** The same model, fed closed and aligned evidence instead of open-world questions, went from 0–3% clear-rule recall (P05/P07/P10) to 12/15 accepted on corpus v1 and 30/60 on the held-out set, with zero false accepts. |
| Zero false positives? | **Held in this run**: 0 terminal false accepts in 120 executions; 0 Jev-only false supports on the 75 wrong clear candidates evaluated. This is an acceptance result, not a guarantee (see §Safety). |
| Recommendation | `REWORK_AND_RETEST` → `ADVISORY_ONLY` candidate. The structure is sound and safe. Clear-rule coverage (50% held-out) is still too low to replace the current reviewer. Three named defects below explain most of the gap and can be fixed without touching thresholds. |

No PRD checkbox is ticked; J8 awaits owner confirmation.

## What changed relative to J1–J6

J1–J5 asked "does the text state **every** material X?". JEV must then enumerate an open set by itself and prove nothing is missing. It either refused (P05/P07/P10 rejected every clear rule) or, on a quantifier, wrongly agreed (P09 `CLR-05`, 6/6). J8 splits the work by what each component is good at:

1. **Deterministic screen** (unchanged `ruleInputSafety`) — blocked sources make no model call.
2. **Claim ledger** — one LLM call (`openai/gpt-oss-120b`) splits the source into complete conditions. Each has an exact `sourceSpan` and a literal English `meaning`. It also lists `openChoices` the source leaves undecided.
3. **Code-owned completeness** — spans must be copied from the source. Every material term (quantifier, comparator, negation, disjunction, position word, number, PT and EN) must sit inside a claim span, and its class must reappear in that claim's meaning. Uncovered text with content words becomes a residual question.
4. **Local Nouls only** — span↔meaning support, "uses an undefined vague term", "open choice already decided", "uncovered segment is material".
5. **Candidate check on computed evidence** — per-claim forward Noul against `describeRuleAstTotal`, per-AST-unit reverse Noul, and one Noul per behavior scenario. For each scenario, code supplies the ticket facts, the value of every closed sub-expression, and, for each quantifier, how many elements satisfy its body. JEV never counts.
6. **Fail-closed routing** — confident ambiguity → `CLARIFY`; interpretation defect → one LLM revision (PRD §10 cap); any negative Noul → reject; any uncertain Noul → review. `ACCEPT` needs every Noul ≥ 0.80 **and** every deterministic behavior fixture to pass.

Bands 0.20/0.80 are experiment policy (`jev-j8-fail-closed-0.20-0.80-v2`), not calibrated thresholds.

## Honesty boundary

- Corpus v1 was used while designing J8. Three live probes (v1 only) drove two revisions: v1 → v2 prompt and questions, plus the quantifier count trace. **v1 rows are regression evidence only.**
- The held-out set was frozen (`jev-j8-heldout-v1`, SHA-256 `74736b60…`) before the first live J8 call, and the design was frozen (policy hash `762ddb5e…`) before the held-out run. The held-out set is:
  - the 20-rule benchmark with one mutation each;
  - two universal-quantifier rules with an existential mutation;
  - six unseen vague rules;
  - two blocked rules.
- No held-out result was used to change anything.
- Three repeats; resolved JEV model `typesafe/jev-1.13-20260917` on all 319 calls; zero JEV errors or retries.

## Accuracy

### Terminal routes

| Slice | Exact route | False accept | Ambiguous → CLARIFY | Blocked → BLOCK | Clear reference ACCEPT | Wrong clear candidate ACCEPT |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| v1 (regression) | 27/30 | **0** | 9/9 | 6/6 | 12/15 | 0/15 |
| held-out | 54/90 | **0** | 18/18 | 6/6 | 30/66 (30/60 excl. gate false-block) | 0/66 |

### The same processes before and after (same model)

| Process | J1–J5 result | J8 result |
| --- | --- | --- |
| P09 interpretation fidelity | 6 wrong supports (`CLR-05` "cada"), 92/150 | 0/48 wrong supports; 21/24 faithful supported. 30 of 48 unfaithful variants were caught by code with no JEV call. JEV scored the other 18 at 0.07–0.24. |
| P05 candidate semantic coverage | 0/15 clear references supported | 12/15 v1 references accepted; 35/60 held-out references Jev-supported |
| P07/P10 completeness | 0/15 clear rules recognized complete | 15/15 v1 ledgers verified; 49/60 held-out ledgers verified |
| P07/P10 ambiguity | 9/9 clarified (by rejecting everything) | 27/27 clarified while clear rules pass |
| P01 artifact fidelity | 113/114, 1 raw false support | 0 Jev-only false supports on 75 wrong clear candidates |

### Why the remaining clear references did not reach ACCEPT (held-out)

| Cause | Count (of 66) | Nature |
| --- | ---: | --- |
| Current production gate blocks the source (`BENCH-M04`, `BENCH-C01`) | 6 | **Existing false positive**: `hasExternalDependency` treats "Among all submitted tickets…" (a supported ranking rule) as an external dependency. Found by J8; not caused by it. |
| At least one forward Noul between 0.33 and 0.79 (`insufficient_evidence`) | 16 | Mostly a knife-edge on the 0.80 band (S01, S02, S08, S09, M01, M03, C03); C02 (nested units-digit rule) sat at 0.33–0.50. The band was not re-tuned on held-out data. |
| Exclusive-or ASTs judged defective (`M05`, `C05`) | 3 | The expanded `or(and(A,¬B),and(¬A,B))` description does not read as "exactly one of". A renderer problem, not a JEV one. |
| Ledger routed to review after its one revision | 9 | 5 were caught by code: paraphrased span ("destas" → "dessas"), dropped clause ("Considerando as posições"), uncovered "ou", material residual text (M05×2, M03, S09, C04). 4 were JEV interpretation defects (S09, C03, C04, C05). All fail closed. |
| Positional default questioned (`M01` "acertar pelo menos dois") | 2 | JEV asked same-position vs anywhere. Arguably right unless the product declares "match = anywhere" as a disclosed default. |

Total: 36 non-accepted references out of 66, all routed to `BLOCK`, `REVIEW`, `CLARIFY`, or `REJECT_CANDIDATE`. None was silently accepted or silently dropped.

### Safety

- **Terminal**: 0 wrong candidate, ambiguous source, or blocked source reached `ACCEPT` in 120 executions.
- **Jev-only** (ignoring the deterministic behavior fixtures): 0/75 wrong clear candidates were supported.
- **Where Jev alone would have failed**: 3 supports of plausible candidates for the **ambiguous** `AMB-02` (Portuguese). Only the ledger's vagueness gate (vague 0.86–0.95) stopped them. The candidate check alone is **not** an ambiguity detector; the ledger gate must precede it.
- **Known Jev blind spot, still present**: `CLR-05/strict-distance` (`< 5` instead of `≤ 5`). The scenario Nouls said the verdict was consistent (0.94) even with the per-position count supplied. The forward Noul (0.61–0.64) kept it at `REVIEW`, and the behavior fixtures reject it anyway. Boundary-inclusive comparators must stay a fixture responsibility.
- Scenario Noul Brier 0.079 over 528 exact labels; 13 threshold crossings, 10 of them Portuguese.

## Financial impact

| Boundary | Calls | Provider-reported cost |
| --- | ---: | ---: |
| J8 ledger LLM | 125 | $0.02859 (82,625 in / 73,513 out tokens) |
| J8 JEV (ledger + candidates + controls) | 319 | $0.02240 (533,232 in / 28,315 out tokens) |
| Per non-blocked proposal (ledger + 2 candidate checks) | — | p50 $0.00039, mean $0.00049 |

### Contemporaneous B0 (current two-phase pipeline, corpus v1, one repeat)

| Route | B0 current pipeline | J8 (v1, 3 repeats) |
| --- | --- | --- |
| Clear → ACCEPT | 3/5 (`CLR-01` CLARIFY on `GUARDIAN_FIDELITY_CONFLICT`; `CLR-03` CLARIFY on `REVIEWER_MISMATCH`) | 12/15 (`CLR-02` REVIEW ×3) |
| Ambiguous → CLARIFY | 3/3 | 9/9 |
| Blocked → BLOCK | 2/2 | 6/6 |
| Wrong AST accepted | 0 | 0 |

B0 cost **$0.01926 for 54 calls, and 28 of those calls were unpriced**, so it is a lower bound: $0.0030 per clear proposal and $0.0014 per ambiguous one. J8 cost $0.00046 per clear and $0.00037 per ambiguous proposal, all calls priced.

**The two are not the same boundary.** J8 checks frozen candidate ASTs; it does not generate one. B0 includes generation. A J8-integrated pipeline would still need one compile call. The J8 piece-selection experiment measured that call at about $0.0005 and 22 s (`llm-free`, 20/20 correct), which gives an **estimated, unmeasured** ≈ $0.001 per clear proposal. That is at least 3× cheaper than the B0 lower bound, and the saving comes from dropping the current reviewer/Guardian/second-opinion calls, not from JEV being cheap. The `CLR-02` B0 row is a rerun after a scorer bug on my side (it rejected the legacy v1 AST the pipeline returned); this is disclosed in the packet.

## Speed

| Boundary | p50 | p95 |
| --- | ---: | ---: |
| JEV request | 361–371 ms | 456–890 ms |
| Ledger LLM request | 12.8–13.9 s | 39–57 s |
| J8 proposal wall time (non-blocked) | 17.6–18.1 s | 40.5–90.7 s |

The ledger LLM call is 95% of J8 wall time. JEV adds roughly 1 s per proposal over three sequential calls. The full J8 run (120 executions, concurrency 4) took 607 s.

B0 clear-proposal wall times were 67–793 s (p50 132 s; `CLR-05` took 793 s under provider rate limiting). B0 ambiguous proposals took 4–12 s. J8 took 17.6 s p50 (max 44 s) on clear and 19.1 s on ambiguous v1 proposals.

- **Clear rules**: an integrated J8 path (ledger ≈ 13 s + compile ≈ 22 s + JEV ≈ 1 s) is **estimated** at ≈ 36 s against a measured 90–180 s typical B0, before B0's rate-limit outliers.
- **Ambiguous rules**: J8 is **slower** by about 10 s, because the ledger call is heavier than the current interpreter's clarification call. That regression is real. It could be recovered by keeping the current interpreter as the first, fast ambiguity screen and running the ledger only on sources it passes; this has not been measured.

## Required rework before the next run

1. **Fix the production false block**: `hasExternalDependency` must not treat "among all submitted tickets" in ranking rules as external. This affects the live pipeline today, independently of JEV.
2. **Render exclusive-or as "exactly one of"** in `describeRuleAstTotal` when the AST has the expanded XOR shape, then retest M05/C05.
3. **Declare the positional default** ("a match is a value present anywhere in the draw unless positions are stated") in `J8_PRODUCT_DEFAULTS` if the product owner confirms it is policy.
4. **Keep the ledger gate ahead of the candidate check** in any integration; never let the candidate check run as the sole semantic gate.
5. Run a larger held-out set (≥100 proposals, PT/EN balanced) to choose the support band. The 0.80 band cost 17/60 clear references here and cannot be re-set on this data.

## Reproduction

```powershell
pnpm --filter @tyche/api experiment:jev:pipeline:j8 -- --dry-run
pnpm --filter @tyche/api experiment:jev:pipeline:j8 -- --self-test --runs=2 --output=../../output/jev-j8-self-test.json
pnpm --filter @tyche/api experiment:jev:pipeline:j8 -- --verify-failures --output=../../output/jev-j8-failure-test.json
pnpm --filter @tyche/api experiment:jev:pipeline:j8 -- --live --suite=all --runs=3 --concurrency=4 --output=../../docs/jev-pipeline-j8-results.json
cd apps/api; node --import tsx scripts/jev-pipeline-j8-baseline.mts --runs=1 --output=../../docs/jev-pipeline-j8-baseline-results.json
```

The runners import no API server entry point, database, wallet, payment, proposal-submission, artifact-freeze, or chain-write path. (The baseline imports the preflight functions from `src/index.ts`, whose server start is guarded by `isMainModule`.) No proposal, payment, artifact, or on-chain state was created or changed.

Failure injection verified: JEV timeout → `SERVICE_TIMEOUT`, malformed JEV → `SCHEMA_ERROR`, malformed ledger → `LEDGER_MALFORMED` (after the single revision), storage → `STORAGE_FAILURE`. None produced an `ACCEPT`.
