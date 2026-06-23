# Trustless Settlement Pipeline — Action Plan

> **Status:** M5.0 confirmed and ticked (2026-06-23); M5.1 (trustless on-chain randomness verification) implemented and SBF-tested (7/7 green) — devnet upgrade held for user go-ahead before ticking.
> **Created:** 2026-06-22
> **Decision:** **Trustless** — `settle_*` instructions must verify Switchboard randomness on-chain (no authority-supplied randomness value).
> **Scope:** Everything in the post-turn-close settlement pipeline EXCEPT turn open/close (which stays a manual test helper today and the automatic timed loop in production). Goal: validate the real pipeline end-to-end on devnet **without mocks or fallbacks**.

---

## 1. Context & motivation

A turn now opens/closes on devnet (manual control), but a closed turn never produces a result: the Result screen shows "draw has not settled yet" / "no alternative rule elected" forever. Investigation (PRD × code) found the settlement layer is **logic + unit tests with injected mocks**, with **no live wiring** and **no real randomness source**, and the on-chain `settle_*` instructions are **authority-trusted** (no Switchboard verification). This plan closes those gaps trustlessly.

### Current reality (verified)

| Layer | State | Evidence |
| --- | --- | --- |
| On-chain settlement instructions | ✅ Exist | `request_draw`/`settle_draw`/`fail_draw`, `lock_rule_election_pool`/`request_rule_election_vrf`/`settle_rule_election`, `eliminate_vote_rule`/`close_elimination_window`, `request_active_election_vrf`/`settle_active_election`, `record_claim`/`claim_prize`/`claim_reward` (`contracts/solana/programs/idealer/src/lib.rs`) |
| Deterministic logic | ✅ Real | `packages/rule-runtime`, `packages/game-engine`, `packages/rule-compiler`; worker `deriveDrawNumbers`, `runRuleElection`, `evaluatePredicate`/`scoreGuess`; API winner/reward/claim calculation |
| On-chain claim sender | ✅ Real | `apps/worker/src/claims.ts:recordClaimsForTurn` builds & sends `record_claim` |
| **Real randomness source (Switchboard On-Demand)** | ❌ Missing | No `@switchboard-xyz` dependency anywhere; `fetchRandomness`/`randomnessAccountFor` only exist as mocks in `*.test.ts` |
| **On-chain VRF verification (trustless)** | ❌ Missing | `settle_draw`/`settle_rule_election`/`settle_active_election` only check `randomness_source == recorded pubkey` and trust `args.randomness` (32 bytes). No CPI / no Switchboard account deserialization |
| **Production settlement scheduler** | ❌ Missing | `apps/worker/src/index.ts` only schedules turn open/close; the draw/election/verification/claim cycles are never called outside tests |
| **Worker → API live projection bridge** | ❌ Missing | API endpoints compute real results but nothing POSTs to them in a live flow |
| **State machine §5.5 orchestration** | 🟠 Partial | On-chain `DrawStatus` + election fields exist; the full state machine with `input_hash/output_hash/transition_reason` is not driven in production |
| **Real player inputs** | 🟠 Needed | `submit_guess` exists; real guesses + LLM rule proposals + votes are required to exercise winners/election for real |

### Milestone reconciliation note

PRD milestones **M3.1 (VRF Draw), M3.2 (Rule Election), M3.5 (Guess Verification)** are marked "Completed", but they were validated as **on-chain instructions + deterministic logic + unit/SBF tests**, NOT as a **live, automated, trustless pipeline with real Switchboard randomness**. This plan is what makes those milestones true end-to-end on devnet. It does not unmark them; it supersedes the "settlement works" perception with the trustless, wired reality.

---

## 2. Central design decision (locked): Trustless

`settle_draw`, `settle_rule_election`, and `settle_active_election` will be changed to **read and verify the Switchboard On-Demand randomness account on-chain** (deserialize the revealed value with slot/queue validity checks), instead of accepting an authority-supplied `args.randomness`. This fulfills PRD §5.6 ("VRF proofs publicly auditable") and removes the authority trust anchor. Requires a contract change + devnet program upgrade and a `switchboard-on-demand` crate dependency.

---

## 3. Milestones

Phases map 1:1 to milestones. Each milestone lists Objective, Scope, Deliverables, Acceptance Criteria, Dependencies, and Risks. Tick checkboxes ONLY after user confirmation.

### M5.0 — Switchboard On-Demand provisioning (devnet)
- [x] **M5.0** — confirmed by user 2026-06-23.
- **Objective:** Have a usable Switchboard On-Demand setup on devnet and the program's VRF config addresses pointing at it.
- **Scope:** Add `@switchboard-xyz/on-demand` (worker) and the matching Rust crate (contract). Identify/provision the On-Demand queue on devnet. Replace the placeholder `draw_vrf_config`/`election_vrf_config` (currently the program ID after the migration) with the real Switchboard queue/config via an authority-only admin instruction.
- **Deliverables:** dependency added; documented queue/config addresses in `deployments/<chainId>.json` (or env); an admin `set_vrf_config` path (or reuse migration/reinit) to write the addresses on-chain.
- **Acceptance:** the worker can create + commit + reveal a Switchboard randomness account on devnet and read a non-zero 32-byte value (proof-of-life script, no game state involved).
- **Dependencies:** funded deployer (`4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH`), Docker SBF toolchain.
- **Risks:** external dependency (Switchboard queue availability, cranking, SOL); SDK version compatibility with `@solana/kit`.
- **Implementation note (2026-06-23):** Added worker and Rust Switchboard dependencies, documented the public devnet On-Demand queue in `deployments/solana-devnet.json` and `.env.example`, added authority-only `set_vrf_config`, and added manual worker scripts for `switchboard:set-vrf-config` and `switchboard:proof`.
- **Live devnet execution (2026-06-23, user-approved):**
  - **Program upgrade** (adds `set_vrf_config`; built with `devnet-test`): extended program data account +10240 bytes, then `solana program deploy` sig `2wBW45vY4sBkCsi7i1yAPw4e2nhWiXYgvMtQD3XkCghnr1E75gKNw3e1Gkn4mgimamJ2uxDmZqPMwDCWygDnDiQe` (slot 471325647, data length 741384 B).
  - **`set_vrf_config`**: sig `2WnXP3n5Q9JQfzzkvdUMvSJQhmrhRzJfaRytJ33X4NF1YMmX3TG7nc423bbCJb8bxzy9eYoSfssPcEc1H89WULt9`. On-chain `GlobalConfig.draw_vrf_config` and `election_vrf_config` now both equal the Switchboard queue `EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7` (verified by reading the account).
  - **Switchboard proof-of-life** (acceptance criterion): randomness account `FWBa3Ubjyv7niKs3cxQkccmBvym3yoH9bYCXmUB5W1oq`, commit `5RzraoM7uymx9LMwXLi3U5YudYGFBroY6tEjnRGxC9KKqZjenvUxDJHcjPWsDXHdv3XkW4kDKvG9JztHk2Mg9GzN`, reveal `5ucEUGVQccnLoa7bWZde8yEeBnH4XJuoutvi5UHuBDLeXxgZ1B8akWozsUNLNVzLW8fGiMEVbBXMSTn6cBYHuo5j`, revealed value `b979191a6f9f56a14a910d075eeda5378283967ee347f1e6378a809b4b07dbc6` (non-zero 32 bytes).
  - **Note:** the deployed build still carries the test-only `devnet-test` feature (`reinitialize_global_config_for_migration`); per §5 it must be rebuilt without `devnet-test` before production. This is intentional for the devnet validation phase, not a defect.
  - The milestone checkbox remains open until user confirmation.

### M5.1 — Trustless on-chain randomness verification (contract)
- [ ] **M5.1**
- **Objective:** Make the draw and both election settlements verify Switchboard randomness on-chain.
- **Scope:** Change `settle_draw`, `settle_rule_election`, `settle_active_election` to take the Switchboard randomness **account** and deserialize/verify the revealed value + slot/queue, replacing `args.randomness`. Keep deterministic derivation (`derive_draw_numbers`, `run_rule_election`) reading the verified value. Preserve `randomness_source` binding to the account recorded at request time. Update SBF instruction tests to use a real/managed randomness account.
- **Deliverables:** updated handlers + Accounts structs (Switchboard account type); `switchboard-on-demand` crate dep; SBF build (Docker) + devnet program upgrade; updated `core.rs`/`instructions.rs` tests.
- **Acceptance:** `settle_draw` rejects a value that does not match the on-chain Switchboard account; succeeds only with the genuine revealed randomness; SBF suite green; devnet upgrade verified.
- **Dependencies:** M5.0.
- **Risks:** Switchboard account layout/CPI specifics; compute-unit budget; another irreversible program upgrade.
- **Implementation note (2026-06-23):** Contract rewritten to verify Switchboard On-Demand randomness **on-chain**, removing the authority-supplied `args.randomness` (and the `SettleDrawArgs`/`SettleRuleElectionArgs` structs) entirely. Design:
  - The three `settle_*` instructions now take the Switchboard randomness **account** and run `verify_revealed_randomness`: bind to the account recorded at request (`require_keys_eq`), verify owner == Switchboard program (build-time constant — `sb-devnet` → devnet PID `Aio4ga…`, else mainnet `SBond…`), `RandomnessAccountData::parse`, verify `queue == config.*_vrf_config` and `seed_slot == recorded commit slot`, then `get_value(clock.slot)` (succeeds only if revealed in the current slot → forces atomic reveal+settle, one shot per request). The verified 32-byte value feeds the unchanged deterministic `derive_draw_numbers` / `run_rule_election` / `derive_active_survivor_index`.
  - The three `request_*` instructions became the commit step (`read_committed_randomness`: owner + queue check, record `seed_slot`). Added `draw_commit_slot` / `election_commit_slot` / `active_election_commit_slot` to `TurnState`, the `randomness` account to all six Accounts structs, four error variants (`InvalidRandomnessOwner`, `RandomnessQueueMismatch`, `RandomnessCommitSlotMismatch`, `RandomnessNotResolved`), and a `sb-devnet` cargo feature.
  - SBF tests rewritten to inject genuine-format `RandomnessAccountData` accounts (correct discriminator/layout, owned by the Switchboard devnet program), pre-registered at genesis and slot-controlled — no mocks, no production bypass.
  - **Verification:** `clippy -D warnings` green for both `sb-devnet` and production (default) feature sets; Docker SBF build with `devnet-test,sb-devnet` succeeds; full ignored SBF instruction suite **7/7 green**.
  - **Held:** the devnet program upgrade is NOT broadcast — awaiting user go-ahead (per the M5.0 pattern). The deploy must build the `.so` from current source with `SBF_FEATURES=devnet-test,sb-devnet`.
  - The milestone checkbox remains open until user confirmation.

### M5.2 — Worker randomness client + production settlement senders
- [ ] **M5.2**
- **Objective:** Real production implementations of the previously-mocked settlement dependencies.
- **Scope:** Implement the production `DrawCycleDeps` / `RuleElectionCycleDeps` (`fetchRandomness`, `randomnessAccountFor`, `requestDraw`, `settleDraw`, `failDraw`, `requestElectionVrf`, `settleElection`) using the Switchboard client and real on-chain instruction builders for `request_draw`/`settle_draw`/`fail_draw` and the two election VRF steps. Reuse the existing `simulateAndSend` + instruction-building patterns.
- **Deliverables:** new worker module(s) wiring real deps; instruction builders for the draw/election instructions (discriminators + accounts + arg serialization).
- **Acceptance:** with a closed turn on devnet, the worker drives a real `request_draw` → Switchboard reveal → `settle_draw`, and the on-chain turn reaches `DrawStatus::Fulfilled` with verified numbers.
- **Dependencies:** M5.1.
- **Risks:** VRF reveal latency (commit→reveal slots) requires a wait/retry loop; idempotency across retries.

### M5.3 — Settlement scheduler + state machine + worker→API bridge
- [ ] **M5.3**
- **Objective:** Automate the full post-close pipeline as a scheduled, idempotent, state-machine-driven loop, and project results to the API so the UI populates.
- **Scope:** Add a settlement loop to `apps/worker/src/index.ts` that, per closed play window, advances PRD §5.5 states in PRD order: eligible rule pool lock → finalist-election VRF → finalist set → elimination window → active-election VRF → rule elected/frozen → `DRAW_PENDING → DRAWN` (draw cycle) → `VERIFYING` (guess verification cycle) → `FINALIZED` (winners + rewards) → `CLAIMABLE` (`record_claim` on-chain) → `CLOSED`. If zero eligible rules exist, skip the decision/election branch and continue to draw/original-only settlement. Enforce idempotency (PRD §10.13: `idempotency_key`, `input_hash`, `output_hash`, no duplicate payouts/rewards). POST projections to the existing API endpoints (`/draws`, `/elections`, `/verification-jobs/create-turn`, `/verification-results`, `/winner-records/calculate-turn`, `/reward-records/calculate-turn`, `/claim-records/create-turn`).
- **Deliverables:** scheduler wiring; state-transition records with hashes; worker→API client calls; gated test-only manual triggers (`/manual/settle/*`) for stepping the pipeline during testing.
- **Acceptance:** a closed turn auto-progresses to `CLOSED`; `GET /rounds/{turnId}` returns real `draw`, `election`, winners, claims; the Result screen renders drawn numbers + elected rule (or a real "no alternative rule" when none qualified).
- **Dependencies:** M5.2.
- **Risks:** ordering/idempotency under retries; reconciling on-chain vs API state; partial-failure recovery (`DRAW_FAILED`, `VERIFICATION_FAILED`, `ACCOUNTING_FAILED`).

### M5.4 — Real player inputs (no mocks)
- [ ] **M5.4**
- **Objective:** Feed the pipeline with genuine player data so winners/election are exercised for real.
- **Scope:** Real `submit_guess` transactions (web with a test wallet, and/or a worker test-helper that signs real guesses); real rule proposals through the AI compiler (requires the LLM endpoint running) + votes; optional elimination votes.
- **Deliverables:** a documented way to seed a turn with N real guesses + ≥1 real compiled rule + votes on devnet.
- **Acceptance:** a turn closes with ≥1 guess and ≥1 eligible rule; verification produces real WIN/LOSE; an alternative rule can be elected and verified.
- **Dependencies:** M5.3; LLM endpoint available.
- **Risks:** LLM availability/latency; devnet SOL for many player accounts.

### M5.5 — End-to-end verification & reconciliation
- [ ] **M5.5**
- **Objective:** Prove the whole pipeline works trustlessly on devnet and is auditable.
- **Scope:** Run a complete turn (open → guesses → rules → votes → close play window → finalist election → eliminations → active election → freeze active rule → draw → verification → winners → rewards → claims). Verify the app shows drawn numbers, elected rule, winners, and claims; verify idempotency (re-running steps changes nothing); verify audit hashes and that on-chain state, API state, and audit state reconcile (PRD §5.5).
- **Deliverables:** an end-to-end run log with signatures; reconciliation check; updated docs.
- **Acceptance:** Result/Rewards screens fully populated from real data; replays are no-ops; audit chain verifies.
- **Dependencies:** M5.0–M5.4.
- **Risks:** timing of VRF reveal windows; flakiness of multi-step orchestration.

---

## 4. Critical path & sequencing

```
M5.0 (Switchboard setup) → M5.1 (trustless contract) → M5.2 (worker senders)
   → M5.3 (scheduler + state machine + API bridge) → M5.4 (real inputs) → M5.5 (e2e verify)
```

M5.0–M5.3 are the critical path (the missing machinery). M5.4–M5.5 validate. The Switchboard On-Demand integration (M5.0/M5.1) is the highest-risk, externally-dependent piece; a feasibility spike is recommended before committing to M5.1's contract change.

## 5. Cross-cutting requirements

- **No mocks / no fallbacks** in production paths (per project rule and the verification goal). Test-only helpers must be clearly gated (e.g. `devnet-test` cargo feature, `IDEALER_TURN_MANUAL_*` env) and excluded from production builds.
- **Idempotency** on every settlement step (PRD §10.13).
- **Auditability**: persist `input_hash`/`output_hash`/`transition_reason`; keep the hash-chained audit log (M3.7) extended to settlement steps.
- **Production switch**: the devnet build currently carries the test-only `reinitialize_global_config_for_migration`; before production, rebuild without `devnet-test` and redeploy.

## 6. Progress sub-tracker

| Milestone | Title | Status | Notes |
| --- | --- | --- | --- |
| M5.0 | Switchboard On-Demand provisioning (devnet) | ✅ Done | Confirmed by user 2026-06-23. `set_vrf_config` + proof-of-life broadcast on devnet; on-chain VRF config addresses verified. |
| M5.1 | Trustless on-chain randomness verification (contract) | In review | Implemented 2026-06-23; clippy clean (both feature sets); SBF suite 7/7 green. Devnet upgrade held for user go-ahead; checkbox open pending confirmation. |
| M5.2 | Worker randomness client + production settlement senders | Planned | — |
| M5.3 | Settlement scheduler + state machine + worker→API bridge | Planned | — |
| M5.4 | Real player inputs (no mocks) | Planned | — |
| M5.5 | End-to-end verification & reconciliation | Planned | — |
