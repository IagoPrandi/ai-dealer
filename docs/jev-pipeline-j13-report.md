# JEV Pipeline J13 — Ledger Attestation and Frame-Aware Claims

Date: 2026-09-23  
Scope: J12's two open options, measured with one repeat through the real two-phase flow  
Rollout state: implemented on branch `feat/jev-pipeline-evaluations` (uncommitted); J13 is unticked pending owner confirmation  
Raw packet: [`jev-pipeline-j13-production-results.json`](jev-pipeline-j13-production-results.json)

## Answer

Both options work where they act, and neither weakened safety. Aggregate recall did not move, because compiler disagreements rose in this run and absorbed the gain.

| Criterion | J12 repeat 1 | J13 (1 repeat) |
| --- | ---: | ---: |
| False accepts | 0 | **0** |
| Disguised injections blocked | 2/2 | 2/2 |
| Ambiguous proposals accepted | 0/23 | 0/23 |
| Clear rules that read the draw, accepted | 28/34 | 28/34 |
| — lost to strict veto `SEMANTIC_CHECK_UNCONFIRMED` | 4 | **1** |
| — lost to `PROVIDER_DISAGREEMENT` | 0 | 4 |
| Compile-time Jev ledger re-asks | 34 | **0** (34/34 attested) |
| Spend per accepted rule | $0.0065 | $0.0063 |
| Clear-rule latency p50 / p95 | 28 s / 125 s | 35 s / 122 s |

One repeat per arm, so these are acceptance results. They are not rates. J12's two repeats scored 78% on clear rules that read the draw; this run scored 82% (28/34).

## Option A — server-signed ledger attestation

At interpret time, when the claim ledger verifies, the API returns `claimLedgerAttestation`. This is an HMAC-SHA256 over the sanitized text, the serialized ledger, the verdict, and the ledger question-set version, plus an issue time valid for 6 hours (`apps/api/src/ruleLedgerAttestation.ts`).

At compile time, a valid attestation replaces the repeated Jev ledger call. The code checks (spans and material terms) and the Jev safety gate always run. An absent, invalid, expired, or future-dated attestation sends the ledger back to Jev exactly as before.

- **Tampering.** A client that changes the text, the ledger, or the token gets a full re-verification. The regression test swaps the ledger and keeps the original token; it is re-verified and refused.
- **Key.** `TYCHE_RULE_LEDGER_ATTESTATION_KEY` is optional and must be at least 32 characters. Unset, each API process uses a random key, so an approval that reaches another instance, or arrives after a restart, is re-verified by Jev.
- **Retries.** The compile result re-issues the token for a ledger it confirmed, so a generation retry keeps skipping the Jev re-ask.
- **Measured.** 34 of 34 compiles used the attestation. The J12 failure mode (a verified ledger flipping to REVIEW on the second Jev call, 2 of 68) could not occur, and every compile saved one Jev call.

## Option B — frame phrases stay inside their condition

The ledger prompt (`jev-j13-ledger-prompt-v4`) now says that a phrase which only frames a condition belongs to that condition's span. Examples: "Among all submitted tickets", "You win if both of these are true:", "Considerando as posições na ordem informada". When one frame governs several conditions, they form one claim.

- **Measured.** Strict vetoes fell from 4 in J12 repeat 1 (`BENCH-M04`, `M05`, `C05`, `ADV-C6`) to 1 (`ADV-C6`). `M04` and `M05`, the ranking and compound rules with fragment claims, were accepted.
- **Safety.** No ambiguous rule was accepted. `ADV-A6` was still held, now at the ledger (REVIEW), and `ADV-A1` still went to CLARIFY.

## Why the disagreements rose

The compilers never read the ledger, so neither option can change their output. Re-running both compilers twice on the four lost items gave these results:

| Item | Compiler A (gpt-oss-120b) | Compiler B (deepseek-v4-flash) |
| --- | --- | --- |
| `BENCH-C04` | wrong ×2 | correct ×2 |
| `FR-C4` | correct ×2 | degenerate ×2 (always true / impossible) |
| `BENCH-C02` | wrong, then correct | wrong, then correct |
| `BENCH-C05` | correct ×2 | correct ×2 |

- **`C04` and `FR-C4` are systematic single-compiler defects.** The two-compiler rule refuses them correctly, and only a better compiler or prompt recovers them.
- **`C02` is worth noting for safety.** In one run both compilers were wrong in different ways, and the Jev artifact check supported at least one of the wrong ASTs. The behavioral-agreement requirement is what stopped it. This is the closest the corpora have come to the unobserved shared-misreading class: had both compilers made the same mistake, nothing downstream would have caught it.

## Remaining losses (6 of 34)

| Loss | Items |
| --- | --- |
| Compiler disagreement | 4, per the table above |
| Strict veto | `ADV-C6`: "mais da metade" needs "more than half of six means at least 4" |
| Ledger CLARIFY | `ADV-C5`: the ledger judged "difference … is less than 10" vague |

## Recommendation

Keep both options. They remove a measured noise source and a measured veto class without any observed safety cost. The next lever is compiler quality on `C04`-type rules (compiler A) and `FR-C4`-type rules (compiler B). One way to pull it is to measure a third compiler or a compact AST-only prompt as its own arm. Measure the two options together with at least three repeats before relying on rates.

## Reproduction

```powershell
cd apps/api
node --import tsx scripts/jev-pipeline-j8-baseline.mts --suite=all --runs=1 --output=../../docs/jev-pipeline-j13-production-results.json
```

The run reads the root `.env`. It changed no proposal, payment, artifact, wallet, database, or on-chain state.
