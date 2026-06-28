# Plan — Open Insights Page (M5 rework) + Tokenomics & Revenue Sharing

## Context

Two product changes were requested for Idealer (a Solana, SOL-native, AI-ruled lottery game):

1. **M5 must stop being a hidden, restricted admin console.** Today PRD §15.6 defines M5 as a
   *Restricted Admin Insights Console* (`apps/admin`, strong auth, RBAC, IP allowlist, hidden from
   public navigation). The owner wants the opposite: an **open public web page**, inside the main
   DApp, where the only gate to view it is **connecting a wallet**. It stays insight-only / read-only
   (it must never mutate game outcomes), but it is discoverable and public.

2. **Introduce a real token economy** (today PRD §8.1 says "native SOL, no SPL token"):
   - Max supply **400,000,000**. **360M minted at genesis** (founder/treasury/allocation).
     **40M** reserved for **play-to-earn** distribution.
   - Each qualifying action (submit guess, propose rule, vote) earns **1 token × multiplier**
     (default multiplier = 1), drawn from the 40M, which is a **hard cap** (emission stops forever
     at 40M).
   - **Referral multiplier:** +1 to the inviter's multiplier per invited player who actually plays
     (pays for an action) and joined because of that inviter. The boosted multiplier is **single-use**
     and **only** usable by the inviter, then resets to 1.
   - **Revenue sharing:** token holders withdraw a **pro-rata** share of game revenue.

### Decisions confirmed with the owner

| Topic | Decision |
|---|---|
| Revenue-share denominator | **All circulating supply up to 400M** (founders/treasury included). Implication accepted: while everything is minted, the 360M allocation captures the majority of revenue; players' 40M earns ~10%. Founder/treasury allocation + its revenue participation must be **explicit and configurable** so it can be revisited. |
| Withdrawal model | **Cumulative-index / pro-rata accumulator, NO burn.** Holders keep tokens; each can only claim revenue accrued since its last checkpoint; total claims can never exceed total deposited; the infinite-drain attack the owner intuited is structurally impossible. |
| Transferability | **Transferable / tradable from the start.** |
| Revenue source | A configurable slice of the **fees charged for game actions**, routed into a revenue-share vault on-chain. |

### Why the withdrawal model matters (owner's own concern, validated)

The naive "withdraw `your_share × current_vault` repeatedly" is catastrophic: a single 1% holder
drains the **entire** vault over many small steps (`1 + 0.99 + 0.98… → 100%`). The accumulator model
(ERC-2222 / Synthetix `StakingRewards` / MasterChef) eliminates this: revenue deposits bump a
per-token index; a wallet claims only `balance × (index − index_paid[wallet])`, then sets
`index_paid = index`. This beats burn-to-redeem (which triggers a bank-run rush and concentrates
future revenue) and push-distribution (computationally infeasible on Solana with many holders).

---

## Part A — M5 rework: open, wallet-gated public Insights page

**Goal:** replace the hidden `apps/admin` console with a public **Insights / Stats** surface inside
`apps/web`, gated only by wallet connection, read-only, that *also* surfaces the new tokenomics.

### Implementation

- **Surface:** add a new screen to the existing single-page shell rather than a separate app.
  - Add `"insights"` to the `Screen` union in
    [apps/web/src/features/idealer/context.tsx](apps/web/src/features/idealer/context.tsx).
  - New screen `apps/web/src/features/idealer/screens/Insights.tsx`, following the
    `idealer-design-system` / `idealer-ui-coherence` skills (dark premium, purple→green neon, inline
    CSS tokens, `ide-card` patterns). Reuse the wallet-gating pattern already used by other screens
    via `useIdealer()` (`connected`, `connect`, `walletAddress`).
  - Add a public route `apps/web/src/app/insights/page.tsx` rendering `IdealerApp` on the insights
    screen, and a nav entry (discoverable, not hidden).
  - **Gate:** if `!connected`, show a connect-wallet prompt; after connect, render dashboards. No
    RBAC, no IP allowlist, no separate domain.
- **Deprecate the restricted admin:** repurpose/remove `apps/admin` (currently a 2-file read-only
  skeleton, no auth). Plan: fold its read-only config display into the public Insights page and
  remove `apps/admin` from the monorepo (or leave an empty stub noting the move). Confirm removal
  with the owner before deleting.
- **Data:** reuse existing wallet-scoped + round endpoints in
  [apps/api/src/index.ts](apps/api/src/index.ts) and `data/hooks.ts`; add read-only aggregate
  endpoints for any new metric (engagement counts, emission progress, revenue distributed, referral
  leaderboard). All read-only — **no instruction may mutate game state from this surface**
  (preserve the M5.6 safety boundaries).

### Dashboards (carry over the useful M5 content, drop the "restricted" framing)

Keep, as **public** read-only panels: engagement (guesses/votes/rules per turn, ratios), creator &
reward insights, prize-pool / rollover stats, turn lifecycle status. **Add tokenomics panels** (see
Part B): emission progress toward 40M, current circulating supply, revenue-share vault balance,
total revenue distributed, per-connected-wallet claimable revenue & token rewards, referral
leaderboard / "friends you brought who played".

**Sensitivity note (non-blocking):** deep retention-cohort and mobile-funnel internals are
business-sensitive. Recommendation: expose **aggregate** game stats publicly and keep
cohort/funnel internals either aggregated-only or out of the public page. Owner already chose "open";
this only refines *what* is shown, and is called out in the PRD edit for a decision.

### PRD edits for Part A

- Rewrite **§15.6** title/objective to **"M5 — Open Public Insights Page (wallet-gated)"**: remove
  "restricted/hidden/RBAC/IP allowlist/separate domain"; require public discoverability + wallet
  connect to view; **keep** the read-only safety boundaries (former M5.6) and the dashboard content;
  add a tokenomics-insights submilestone.
- Update references to `apps/admin` across the PRD (and README) to the public Insights surface.

---

## Part B — Tokenomics, Play-to-Earn Emission & Revenue Sharing

Reuses the existing **"compute off-chain → record on-chain (authority) → pull-claim (wallet)"**
pipeline (`record_claim` / `claim_prize` / `claim_reward`, the `ClaimKind` enum, `pay_from_vault`,
the wallet-scoped `Claims.tsx` screen). The token is a **plain SPL mint** (Tokenkeg, 9 decimals) with
a **PDA mint authority** — *not* Token-2022, so it trades on all venues.

### B1. Revenue accumulator — epoch/snapshot Merkle distributor (chosen)

A continuous on-chain accumulator with a *transferable* SPL token would require settling both
parties on every transfer; plain SPL transfers cannot call our program, and a Token-2022 transfer
hook makes the token untradeable on most venues and puts a CPI on the hot path of every transfer
(rejected). Instead use the battle-tested Solana pattern that fits the existing architecture:

1. A configurable slice of action fees streams into a `revenue_share_vault` PDA continuously.
2. At each **epoch close** (align to `close_turn`, or every K turns), the authority **seals** the
   epoch: snapshot the vault pot and every holder balance at a **finalized** slot.
3. The API computes each holder's share = `floor(balance × pot / 400M_base_units)` (fixed 400M
   denominator → `sum(leaves) ≤ pot`, so over-distribution / drain is impossible), builds a Merkle
   tree, and the worker publishes only the **32-byte root** on-chain.
4. Holders **pull-claim** with a Merkle proof; a set-once `RevenueShareClaim` PDA per `(epoch, wallet)`
   blocks double-claims (same `init`-idempotency as today's `Claim`).

This is per-epoch pro-rata (not real-time), which is the correct, standard revenue-share model and
keeps the token a vanilla, tradable SPL mint.

### B2. New on-chain accounts/PDAs (in the existing `idealer` program)

| PDA | Seeds | Purpose |
|---|---|---|
| `TokenConfig` | `["token_config"]` | mint, mint-authority bump, default multiplier (=1), `revenue_share_bps` |
| mint authority | `["mint_authority"]` | PDA-only signer holding SPL mint authority (no hot key) |
| `EmissionState` | `["emission_state"]` | `total_emitted_base_units`, `hard_cap_base_units` (=40M×10⁹) — the **40M counter** |
| `ReferralLink` | `["referral", invitee]` | `inviter`, `attributed_action_done`, set-once (immutable) |
| `ReferralState` | `["referral_state", inviter]` | `pending_boost` (capped), single-use |
| `RevenueShareVault` | `["revenue_share_vault"]` | collected / distributed lamports |
| `EpochDistributor` | `["epoch_distributor", epoch_le]` | `merkle_root`, `sealed_pot`, `claimed`, `snapshot_slot` |
| `RevenueShareClaim` | `["rsc", epoch_le, wallet]` | set-once per (epoch, wallet) |
| token-reward claim | reuse `Claim` seed `["claim", turn_id, claimant, &[TokenReward as u8]]` | mirrors existing `Claim` |

Extend `ClaimKind` (append-only) in
[contracts/solana/programs/idealer/src/lib.rs](contracts/solana/programs/idealer/src/lib.rs):
`TokenReward = 3`, `RevenueShare = 4`.

### B3. New instructions (reuse existing patterns)

- `initialize_token` — authority; init mint (decimals 9, PDA mint authority, freeze authority None),
  `TokenConfig`, `EmissionState` (cap = 40M×10⁹); **genesis-mint 360M** to the allocation ATA
  (genesis does NOT touch `EmissionState`).
- `set_revenue_share_bps` / config updates (validate ≤ 10000).
- `register_referral` (`init` `ReferralLink`, set-once) + `confirm_referral_play` (authority-mirrored
  on the invitee's **first paid action**; flips the bool, `+1` to inviter `pending_boost`, capped).
- `record_token_reward` — authority; mirrors off-chain-computed token entitlement into a
  `Claim`-shaped PDA (`kind = TokenReward`). Clone of `record_claim`.
- `claim_token_reward` — claimant; **enforces the 40M cap atomically and mints** (see B4); CPI
  `mint_to` via PDA authority; consumes referral boost (reset to 1) in the same tx (CEI).
- `seal_revenue_epoch(epoch, root, sealed_pot, snapshot_slot)` — authority; `init` `EpochDistributor`,
  reserve `sealed_pot` from the vault (`require sealed_pot ≤ available`).
- `claim_revenue_share(epoch, amount, proof)` — claimant; verify leaf = `hash(epoch‖wallet‖amount)`
  against root, `init` `RevenueShareClaim`, check `claimed + amount ≤ sealed_pot`, `pay_from_vault`.

Add the corresponding entries to the §9.8 instruction list.

### B4. 40M hard cap (atomic) — in `claim_token_reward`

```
new_total = emission.total_emitted.checked_add(amount)?;       // overflow-checked
require!(new_total <= emission.hard_cap, EmissionCapExceeded);  // before effect
emission.total_emitted = new_total;                            // effect
claim.status = Claimed;                                        // effect (CEI)
token::mint_to(cpi_with_pda_signer, amount)?;                  // interaction
```
One `EmissionState` PDA serializes concurrent claims (account-write lock); genesis 360M is excluded;
once `total_emitted == 40M`, every further claim reverts → UI shows "emission exhausted". v1 uses a
hard revert (simpler than partial last-mint).

### B5. Referral Sybil resistance

- **Paid-action gating (core):** boost granted only after the invitee performs a real fee-paying
  action — fakes cost real SOL each, so Sybil is economically self-limiting.
- **Set-once attribution:** one inviter per invitee forever (`init` `ReferralLink`).
- **Single-use, inviter-only boost:** consumed (reset to 1) when the inviter claims with it; signer
  must equal the inviter.
- **Caps:** `MAX_REFERRAL_BOOST` (recommend 50); each invitee contributes exactly +1.
- Off-chain heuristics may *withhold* `confirm_referral_play` (funding/timing clusters) but never grant.

### B6. Revenue source — carve from the treasury slice only (no prize cannibalization)

Today fees split into treasury (`treasury_fee_bps`, default 500) + prize pool (remainder); votes/
eliminations go 100% to the prize pool. **Add `revenue_share_bps` taken out of the treasury slice**,
default **3000 bps** (= 30% of the 5% treasury fee = **1.5% of gross fees**), leaving 3.5% for
treasury ops; **prize pool unchanged**. Three-way split implemented in `collect_fee` / `split_fee`
([contracts/solana/programs/idealer/src/domain.rs](contracts/solana/programs/idealer/src/domain.rs)).
All defaults configurable per environment. (Owner phrased revenue as "fees on actions"; this routes a
defined, auditable slice of those fees without reducing player jackpots — surfaced in the PRD as a
default to confirm.)

### B7. Off-chain + web changes (reuse existing shapes)

- **[apps/api/src/index.ts](apps/api/src/index.ts):** extend the `ClaimKind` union; add per-turn
  token-reward computation (sum paid actions × effective multiplier, clamped to remaining 40M by
  mirroring on-chain `EmissionState`); referral register/attribution endpoints; revenue-epoch seal
  (snapshot balances at a finalized slot → Merkle root + leaves) and `/players/{wallet}/revenue-claims`
  (leaf + proof). Reuse `getMinimumClaimThresholdLamports`.
- **[apps/worker/src/claims.ts](apps/worker/src/claims.ts) / settlement:** clone
  `createRecordClaimInstruction` for `record_token_reward`; add `seal_revenue_epoch` builder + loop;
  mirror `confirm_referral_play`. Reuse `createSettlementSenders` and the idempotent
  `already_recorded` handling.
- **Indexer:** SPL holder-balance tracking by snapshot slot + referral projections, following the
  `indexer-reorg-idempotent` conventions (stable identity keys `(epoch,wallet)`, `(turn,wallet,kind)`).
- **Web:** [apps/web/src/features/idealer/screens/Claims.tsx](apps/web/src/features/idealer/screens/Claims.tsx)
  already renders any `ClaimKind` generically — add `token_reward` + `revenue_share` labels. Add
  `createClaimTokenRewardInstruction` (ATA) and `createClaimRevenueShareInstruction` (proof) in
  `apps/web/src/solana/idealerProgram.ts`; extend `data/types.ts`, `data/apiClient.ts`, `data/hooks.ts`
  (`usePlayerRevenueClaims`, token-reward hooks). New small **Referral** surface (invite link +
  "friends who played / +multiplier").

### B8. PRD edits for Part B

- Rewrite **§8.1** (token now exists: 400M max, 360M genesis, 40M play-to-earn hard cap, 9 decimals,
  plain SPL, PDA mint authority, transferable).
- Add new §8 subsections: **Play-to-Earn Emission & Multiplier**, **Referral Multiplier & Sybil
  Resistance**, **Revenue Sharing (epoch Merkle accumulator, all-circulating denominator, no burn)**,
  **Revenue Source & Fee Split** (`revenue_share_bps` default), with config blocks mirroring the
  existing `*_CONFIG` style and `Required fields` interfaces.
- Update **§9.1–9.9** with the new accounts, instructions, and on-chain/off-chain split entries.
- Add a **securities/legal gate to §15.7 (M9)**: a transferable token paying pro-rata revenue is
  close to an investment contract (Howey) and reverses the prior "no SPL token" stance — block any
  mainnet/real-value activation on legal sign-off + geofencing. (M9 already gates real-SOL flows.)
- Add a **new milestone "M10 — Token, Play-to-Earn Emission & Revenue Sharing"** in §15, depending on
  the M9 securities gate, with submilestones: token genesis & cap, play-to-earn emission, referral &
  Sybil, revenue vault & fee split, epoch Merkle distributor & claims, web claim/referral UI,
  tokenomics insights panels, full test/verify ladder. Update the **Progress Tracker**.

---

## Key risks (carried into the PRD)

- **Securities/legal (highest, go/no-go):** flag before any deploy; resolve out of code (counsel +
  geofence) — gated in M9.
- **Rounding/dust:** fixed 400M denominator guarantees `sum(leaves) ≤ pot`; roll remainder to next
  epoch; on-chain `claimed + amount ≤ sealed_pot`; `u128` intermediates.
- **Reorg/idempotency:** snapshot only at finalized slots; all records via `init` PDAs (re-post = the
  idempotent success path).
- **Merkle pitfalls:** domain-separate leaf vs node bytes; bind `epoch` into the leaf; shared
  Rust+TS test vector.
- **Cap drift:** API mirrors `EmissionState` and clamps; on-chain `require!` is the hard backstop.
- **Mint-authority key:** PDA-only; freeze authority None.

---

## Verification

Follow the `idealer-test-and-verify` skill (no mocks; per-package ladder; Docker for Rust/SBF).

1. **Rust/SBF (contracts):** unit tests for the 40M atomic cap (revert at boundary, serialized
   concurrent claims), referral set-once + single-use boost + cap, three-way fee split math
   (prize pool unchanged), Merkle proof verify (valid/invalid/replay-across-epoch), revenue claim
   `claimed ≤ sealed_pot`, double-claim rejection (`init` PDAs). Shared Rust↔TS Merkle test vector.
2. **API/worker (TS, node:test):** token-reward computation clamps to remaining 40M; referral
   attribution on first paid action; epoch seal builds a root whose `sum(leaves) ≤ pot`; settlement
   idempotency (`already_recorded`).
3. **Web:** `Claims.tsx` renders `token_reward` + `revenue_share`; token-reward and revenue-share
   pull flows build valid instructions; Insights page renders only when wallet connected and never
   issues a mutating instruction.
4. **Live devnet (dry-run → broadcast):** init token + 360M genesis; run a turn so a wallet earns a
   play-to-earn claim and claims it (assert `EmissionState` counter advances, ATA balance increases);
   register a referral, have the invitee pay an action, confirm the inviter's boost applies once;
   seal a revenue epoch and have ≥2 wallets claim pro-rata; reconcile on-chain ↔ API ↔ audit log and
   re-run for idempotency. Verify the open Insights page loads on wallet connect and reflects
   emission/circulating/revenue figures.

## Critical files

- [contracts/solana/programs/idealer/src/lib.rs](contracts/solana/programs/idealer/src/lib.rs) — new PDAs, instructions, `ClaimKind` extension, `claim_token_reward` cap+mint
- [contracts/solana/programs/idealer/src/domain.rs](contracts/solana/programs/idealer/src/domain.rs) — fee three-way split, Merkle leaf hashing
- [apps/api/src/index.ts](apps/api/src/index.ts) — token-reward + revenue Merkle compute, referral, new endpoints
- [apps/worker/src/claims.ts](apps/worker/src/claims.ts) + settlement — record/seal/confirm builders & loops
- [apps/web/src/features/idealer/screens/Claims.tsx](apps/web/src/features/idealer/screens/Claims.tsx), new `screens/Insights.tsx`, `solana/idealerProgram.ts`, `context.tsx`, `data/*`
- [PRD.md](PRD.md) — §8.1 + new §8 subsections, §9.1–9.9, §15.6 (M5 rework), §15.7 (M9 legal gate), new §15 M10, Progress Tracker
- Remove/repurpose `apps/admin`
