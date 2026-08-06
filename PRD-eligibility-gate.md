# Tyche — Feature PRD: Social Eligibility Gate

> **Version:** 0.1.0 (Draft for review)
> **Status:** Proposal — not implemented; no code or schema changes made yet
> **Last Updated:** 2026-06-15
> **Parent Document:** [PRD.md](PRD.md) — this feature extends §6 (Rule System)
> **Owner:** Product / Rule Engine
> **Language:** Portuguese / English technical terms where useful

---

## Table of Contents

1. [Summary](#1-summary)
2. [Motivation & Problem Statement](#2-motivation--problem-statement)
3. [Scope](#3-scope)
4. [Feasibility Assessment](#4-feasibility-assessment)
5. [Functional Design](#5-functional-design)
6. [Data & Freeze Model](#6-data--freeze-model)
7. [Difficulty Re-Analysis](#7-difficulty-re-analysis)
8. [Compiler & Validation Changes](#8-compiler--validation-changes)
9. [UX Requirements](#9-ux-requirements)
10. [Security & Abuse Analysis](#10-security--abuse-analysis)
11. [Implementation Forecast](#11-implementation-forecast)
12. [Definition of Done](#12-definition-of-done)
13. [Out of Scope / Explicitly Rejected](#13-out-of-scope--explicitly-rejected)
14. [Open Questions](#14-open-questions)

---

## 1. Summary

This feature extends the Tyche rule engine so that a community rule can condition winning on **social / election state** (how a player participated in governance for the current turn) — **but only as a conjunctive gate on top of a mandatory numeric core** evaluated over `guess` and `draw`.

The win is always anchored to the drawn numbers. Social conditions can only **narrow** the winning set; they can never be the sole determinant of a win, and they can never make a rule easier.

Example rule this feature enables:

```text
Win if at least 4 of your numbers appear in the draw — and you voted for this rule.
```

Example rule this feature still rejects (unchanged from parent PRD §6.4.3):

```text
Win if you match 4 numbers and your wallet is 8xP...K2m.   ❌ literal wallet targeting
Win if the individual prize for this round is Z.            ❌ circular / post-hoc
```

## 2. Motivation & Problem Statement

The parent PRD (§6.4.1 / §6.4.3) restricts rules to two inputs — `guess` and `draw` — and prohibits any reference to wallet, votes, prize pool, time, or history. That prohibition conflated **two distinct concerns**:

1. **Circular / causal references** (e.g. "individual prize"): depend on an event that is only knowable *after* winners are computed. These are logically impossible (no unique fixed point) and must stay banned.
2. **Identity / social state** (wallet, votes, election): these are **fixed and knowable before the draw**, so they do not create a circular dependency. Their prohibition was an **anti-abuse policy choice**, not a determinism limitation.

This feature targets only category (2), and only the safe subset of it (social/election participation, not literal wallet identity), unlocking rules that align with the product thesis ("back the rule that changes everything") while preserving determinism, auditability, and fairness.

## 3. Scope

**In scope (confirmed):** social / election-participation gates only.

Allowed gate predicates (closed enum — no free-form fields):

| Predicate | Meaning |
| --- | --- |
| `voted_for_active_rule` | The player voted (approval) for the rule that was elected as Rule of the Hour. |
| `voted_for_any_finalist` | The player voted for at least one of the 10 finalists. |
| `voted_against_active_rule` | The player cast an elimination vote against the elected rule during the decision window. |
| `is_creator_of_active_rule` | The player is the creator of the active rule. |

**Explicitly out of scope:** literal wallet whitelisting (`wallet == 0x…`), prize/pool references, time/history references. See §13.

## 4. Feasibility Assessment

**Verdict: technically viable.** The blocker is abuse/fairness mitigation, not determinism.

| Dimension | Assessment |
| --- | --- |
| **Determinism** | ✅ All gate signals are fixed before the draw. Wallet identity is fixed at `submit_guess`; the vote ledger is locked at `finalist_set_lock` / `VOTING_CLOSED`; `electedRuleId` exists at `RULE_ELECTED`. All precede `DRAW_PENDING`. No circular dependency. |
| **Auditability** | ✅ Preserved by sealing a `TurnSocialSnapshot` (with a hash) into the frozen artifact at `RULE_FROZEN`. Same `(guess, draw, artifact, snapshot)` → same result. |
| **Sandbox safety** | ✅ Gate predicates are O(1) read-only lookups into frozen structures — no clock, RNG, IO, or unbounded loop. Each clause costs one runtime operation tick. |
| **Self-dealing** | ⚠️ Mitigated by banning literal-wallet equality; only relational/role predicates allowed. A creator cannot write "wins wallet X". |
| **Vote-buying / governance coupling** | ⚠️ Already partially present (voter reward = 15%, parent §2.4). Amplified by gating the win itself on votes. Mitigated by Game Token gate + `VOTE_FEE` (turn 100+). Requires Sybil cost analysis. |
| **Difficulty estimation** | ⚠️ Win rate now depends on the turn population, not only number combinatorics — classification becomes per-turn (see §7). |

## 5. Functional Design

### 5.1 Rule shape (schema v3)

The top-level rule gains an optional envelope. `schemaVersion` 1 and 2 remain valid and execute unchanged (no silent re-hash).

```jsonc
{
  "schemaVersion": 3,
  "eligibilityGate": {              // OPTIONAL — social clauses only, AND only
    "kind": "social_and",
    "clauses": [
      { "kind": "voted_for_active_rule" }
    ]
  },
  "core": { /* predicate | ranking over guess/draw — REQUIRED */ }
}
```

### 5.2 Structural invariants (enforced by schema + compiler)

- `core` is **required** and must **not** classify as `ALWAYS_TRUE` — the win is always anchored to the numbers.
- Social clauses may appear **only** inside `eligibilityGate`, never inside `core`.
- The gate composes by **AND only**. No `OR` / `NOT` in the MVP, so a gate can only restrict (never widen) the winning set.
- Gate clauses are drawn from the closed enum in §3 — no free-form text, no literal wallet operands.

### 5.3 Evaluation order

The runtime evaluates the gate **before** the core. If the gate is `false`, the result is `LOSE` and the core is not evaluated. This keeps each guess independently reproducible and bounds work.

## 6. Data & Freeze Model

### 6.1 Turn social snapshot

A new read-only input to the runtime (today it receives only `{ guess, draw }`):

```ts
interface TurnSocialSnapshot {
  electedRuleId: string;
  finalistRuleIds: readonly string[];
  // wallet -> the rules they approved / voted to eliminate this turn
  voteLedger: ReadonlyMap<Wallet, { approvedRuleIds: Set<string>; eliminationRuleIds: Set<string> }>;
  creatorByRuleId: ReadonlyMap<string, Wallet>;
  snapshotHash: string; // sha256 over the canonicalized snapshot
}
```

Per-guess, the runtime also receives a minimal `PlayerContext` (the player's wallet) to resolve the predicates.

### 6.2 Freeze timing (parent §5.5 state machine)

- Vote ledger is already locked at `VOTING_CLOSED` / `finalist_set_lock`.
- `electedRuleId` is known at `RULE_ELECTED`.
- The `TurnSocialSnapshot` is sealed at `RULE_FROZEN`, **before** `DRAW_PENDING`.
- `snapshotHash` is added to `CompiledRuleArtifact` (parent §6.5 / §6.10) so winner evaluation uses only frozen data.

### 6.3 Canonicalization compatibility

The v3 envelope needs its **own** canonicalization rule for the AST signature used by the mandate re-proposal gate (parent §6.13). It must not change the canonical form of v1/v2 artifacts (those signatures must remain stable).

## 7. Difficulty Re-Analysis

Today the Monte Carlo difficulty analysis (parent §6.8) simulates only the number space. With a social gate, the effective win rate is approximately:

```text
win_rate ≈ P(core over guess/draw) × (eligible fraction of the turn population)
```

Required changes:

- Estimate `P(core)` analytically / via bounded Monte Carlo as today.
- Apply the gate as a **multiplier measured over the frozen snapshot population** (the real per-turn population is available at freeze time).
- Reclassify `TOO_EASY` / `ALWAYS_TRUE` / `IMPOSSIBLE` over the **joint** (core × gate). Example: a gate that covers almost all voters combined with an easy core can still be rejected as too easy.

Consequence: difficulty classification becomes **per-turn**, not static. This affects the precompiled-artifact cache (parent §5.4): the core can be precompiled and cached, but the final difficulty verdict is resolved against the frozen population at election time.

## 8. Compiler & Validation Changes

- `PROMPT_CONTRACT` / `RuleValidationPromptContract`: add the four social predicates as **allowed-only-within-gate** inputs; keep `wallet`/`address` literal, `prize`/`pool`, `time`/`history` prohibited.
- The external-dependency detection (which today maps `votes`, `voter`, `wallet`, `prize`, etc. to an `EXTERNAL_DEPENDENCY` rejection) is updated so the **social verbs** map to a gate node instead of a rejection — **only** when expressed as one of the closed predicates. Everything else stays rejected.
- Literal wallet equality, prize/pool, and time/history references continue to produce `EXTERNAL_DEPENDENCY` → `INVALID`, unchanged.

## 9. UX Requirements

- Rule cards render the gate in plain language, e.g. *"Win if you match ≥4 numbers **and** you voted for this rule."*
- The proposal composer suggests the four closed gate predicates (not free-form). It must remain clear that the gate only restricts who can win.
- The result screen shows whether the player was gate-eligible, distinct from whether their numbers matched, so near-miss messaging stays accurate ("Your numbers matched, but this rule only paid voters").
- All UI must follow the `tyche-design-system` conventions and reuse the existing voter-reward narrative (parent §2.4 / §4.6).

## 10. Security & Abuse Analysis

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Self-dealing / targeting via literal wallet | High | Banned by construction — only relational/role predicates; no wallet-literal operand exists in the grammar. |
| Vote-buying / payout coupled to governance | Medium | Game Token gate + `VOTE_FEE` (turn 100+); Sybil cost analysis required before launch. |
| Difficulty back-door (easy among voters) | Medium | Per-turn joint difficulty re-analysis (§7) rejects gate+core combinations that are too easy over the real population. |
| Fairness / regulatory perception | Medium | Winning still requires a numeric match; gate only narrows. Document the social-only boundary; product/compliance sign-off before launch. |
| Snapshot availability / ordering | Medium | Snapshot sealed at `RULE_FROZEN` after the vote ledger locks; state-machine ordering test required. |

This feature must pass the `security-threat-checklist` before merge.

## 11. Implementation Forecast

> Forecast only — no code is written by this document. Phases are ordered by dependency.

**Phase 0 — Spec freeze (this document + parent PRD).** Add §6.4.x "Eligibility Gate" and adjust §6.4.3 in the parent PRD; add `socialSnapshotHash` to `CompiledRuleArtifact`; open the PROGRESS_TRACKER submilestone (unticked).

**Phase 1 — Deterministic core.**
- `packages/rule-schema` — `CURRENT_SCHEMA_VERSION = 3`; envelope `{ eligibilityGate?, core }`; `SocialClause` enum; AND-only `social_and`; Zod rejects social clauses in `core`, missing `core`, and `OR`/`NOT` in the gate.
- `packages/rule-runtime` — extend `RuleRuntimeInput` with `playerContext` + `turnSocial`; evaluate gate before core; one op tick per clause; limits unchanged.
- `packages/rule-test-harness` — gate true/false × core win/lose; gate-without-core rejection; v3 serialization stability; `ALWAYS_TRUE` core still rejected even with a gate.

**Phase 2 — Compiler + difficulty.**
- `packages/rule-compiler` — update `PROMPT_CONTRACT`; map social verbs to a gate node; keep wallet-literal/prize/time rejected; per-turn joint difficulty re-analysis.

**Phase 3 — Social snapshot (data source).**
- `apps/worker/src/guess-verification.ts` + indexer — build and hash `TurnSocialSnapshot`, seal at `RULE_FROZEN`, pass `playerContext` per guess (idempotent / replay-safe).
- `apps/api/src/index.ts` + `docs/api-contracts.md` / `docs/data-model-draft.md` — expose the gate + `snapshotHash`; document the contract.

**Phase 4 — UX.**
- `apps/web/src/features/rule-proposal/RuleProposalComposer.tsx` — gate suggestions + preview.
- `apps/web/src/features/rule-voting/RuleVotingPanel.tsx` and `draw-result/DrawResultPanel.tsx` — render gate; show eligibility in the result.

**Phase 5 — Contract (evaluate necessity).**
- `contracts/solana/programs/tyche` — **likely no on-chain change**: the gate is evaluated off-chain over data already on-chain (votes, creator, elected rule). Only needed if `snapshotHash` must be committed on-chain for strong audit. Decision deferred to Phase 0.

## 12. Definition of Done

- Schema v3 + runtime + harness green; v1/v2 artifacts still validate and execute unchanged.
- Compiler rejects literal-wallet targeting and accepts the four social gates only inside the gate.
- Difficulty classification is per-turn over the joint (core × gate).
- `TurnSocialSnapshot` is deterministic, hashed, and sealed into the frozen artifact before the draw.
- UX follows `tyche-design-system`; result screen distinguishes numeric match from gate eligibility.
- `security-threat-checklist` passed; product/compliance sign-off on the social-only boundary.
- PROGRESS_TRACKER submilestone ticked **only after user confirmation**.

## 13. Out of Scope / Explicitly Rejected

- **Literal wallet whitelisting** (`wallet == address`): pure self-dealing/targeting vector with no game value. Stays banned.
- **Prize / pool references** (e.g. "if the individual prize is Z"): circular / post-hoc — logically impossible. Stays banned.
- **Time / clock / historical-turn references**: stay banned (parent §6.4.3).
- **`OR` / `NOT` in the gate**: deferred — would allow a gate to widen the winning set.

## 14. Open Questions

1. Should `snapshotHash` be committed on-chain (Phase 5), or is off-chain audit with the frozen artifact sufficient for MVP?
2. Sybil/vote-buying threshold: is the existing Game Token + `VOTE_FEE` (turn 100+) deterrent enough, or does a gated win require an additional cost/limit?
3. Should `voted_against_active_rule` be included at launch, or deferred? (It rewards players who tried to eliminate the very rule that won — semantically valid but potentially confusing UX.)
4. Does a social-gated win change the creator/voter reward math (parent §2.4), since the winner set is now a subset of voters?
