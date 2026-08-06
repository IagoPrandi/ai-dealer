# Tyche — Security Review (Stressed Red-Team)

- **Date:** 2026-07-19
- **Scope:** on-chain programs (`tyche`, `tokenomics_core`), `apps/{api,worker,web,admin}`, `packages/*`, infra/CI/Docker, dependencies
- **Method:** multi-specialist parallel review + direct auditing + a dedicated adversarial-verification pass that built working exploit chains
- **Status:** review-only — no source files were modified
- **Docs consulted (per CLAUDE.md):** `PRD.md`, `PRD-TOKENOMICS-v2.8.md`, `PRD-eligibility-gate.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`

> **Caveats.** One reviewer (tyche remaining-instruction stress) stopped early on a session token limit; its ground was largely covered by the attack-surface and economic reviewers. Two reviewers ran while the automated safety classifier was unavailable; the single CRITICAL claim they raised (v3 minimize-ranking inversion, H2) was independently re-verified against current code. File:line citations are point-in-time — re-verify before acting.

---

## 1. Executive summary

The two Solana programs are **well-built** — trustless Switchboard VRF, rejection-sampled unbiased draws, checked arithmetic, IDOR-safe claim PDAs, revoked mint/freeze authority, Merkle-gated distributions with vault-solvency invariants, a hardened rule interpreter.

**But winner/payout truth is decided off-chain by an API that has zero authentication and is exposed to the open internet through two catch-all web proxies.** The worker holds the on-chain authority keypair and signs `record_claim` using the API's numbers verbatim. Therefore every on-chain guarantee is bypassed at the HTTP layer. This was **confirmed end-to-end** as a fund-theft chain.

Separately, even with auth fixed, the game's economics are Sybil-exploitable for profit because **all fee escalation is per-wallet, not per-identity**.

**Verdict:** in its current state the system must **not** hold real value on a network-reachable deployment. The on-chain code is a solid base; the required change is to move winner-truth on-chain (or behind an authenticated keeper) and make governance Sybil-resistant.

### Severity counts

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 7 |
| Medium | 15 |
| Low | ~18 |

---

## 2. The trust boundary (and where it breaks)

```
Browser
  ├── /api/proxy/[...path]   (open relay: forwards ALL methods+paths)  ─▶  apps/api :3002   ❌ NO AUTH on any mutating route
  └── /__worker/:path*       (next.config rewrite: ALL methods)        ─▶  apps/worker :3003 ❌ /manual/* gated by env flag only
                                                                              │ holds the on-chain AUTHORITY KEYPAIR
                                                                              │ trusts API projections verbatim
                                                                              ▼
                                              tyche / tokenomics_core   ✅ strong (VRF, checked math, IDOR-safe)
                                                                              │ but blindly trusts the authority key
                                                                              ▼
                                              Switchboard On-Demand oracle  (trusted for randomness)
```

- Both back-end services are reachable from the public web: [`apps/web/src/app/api/proxy/[...path]/route.ts`](apps/web/src/app/api/proxy/%5B...path%5D/route.ts) and the rewrite in [`apps/web/next.config.ts:36-38`](apps/web/next.config.ts#L36).
- **CORS is cosmetic** — it is a browser policy, not a server-side gate; `curl` ignores it.
- The API's only real authentication (an ed25519 operator challenge) guards **two read-only GETs** — and the proxy strips the `x-operator-*` headers, so the one authenticated path can't traverse the proxy while all the unauthenticated ones can.
- The **real** security boundary for fund movement is on-chain signatures. The problem is that the authority key signs whatever the unauthenticated API tells it.

---

## 3. Confirmed exploit chains (adversarially verified)

### ① Self-declared winner → prize-vault drain — **CONFIRMED**
Every hop connects; no guard breaks it.

1. `POST /api/proxy/guess-receipts` — attacker wallet; body only shape-checked (accepted even after the draw).
2. `POST /api/proxy/verification-jobs/create-turn {turnId}` (unauth; requires draw `Fulfilled`).
3. `GET /api/proxy/verification-jobs?turnId=…` → read the `jobId` for the attacker's receipt.
4. `POST /api/proxy/verification-results {jobId, player: attacker, status:"completed", original:{result:"WIN"}}` — the API stores the **client-posted** WIN verbatim ([`apps/api/src/index.ts:3859`](apps/api/src/index.ts#L3859), `saveGuessVerificationResult` ~5070, `calculateAndStoreWinnerRecords` ~3932).
5. `POST /api/proxy/claim-records/create-turn {turnId}` → a `winner_payout` claim record for the attacker.
6. The settlement loop signs on-chain `record_claim(attacker, amount)` with the authority key, `amountLamports`+`wallet` **verbatim, no recomputation** ([`apps/worker/src/claims.ts:190-197`](apps/worker/src/claims.ts#L190)).
7. Attacker calls `claim_prize` signed by their own wallet (passes `claim.claimant == signer`) and pulls SOL.

Stolen amount is bounded to the real pool bucket (`bucketLamports / winnerCount`) — an attacker drains the actual pooled deposits, not an invented sum. Window: the verification phase of any turn whose draw is `Fulfilled`.

**Fix:** authenticate `/verification-results` and all settlement/claim routes to the worker only (mTLS / signed payload); recompute winner eligibility server-side from the compiled artifact + on-chain draw; cap `record_claim` against the prize-vault balance on-chain.

### ② All player actions forgeable — **CONFIRMED**
Guess/propose/vote/eliminate/remove/claim signatures are only `isBase58Like` shape-checked ([`index.ts:1292`](apps/api/src/index.ts#L1292)), **never ed25519-verified**. The only real `crypto.verify` guards the operator console ([`index.ts:8074`](apps/api/src/index.ts#L8074)). No nonce/expiry/replay protection. Anyone acts as any wallet by putting it in the body.

### ③ Claim-bricking → permanent on-chain fund denial — **CONFIRMED**
`GET /players/{wallet}/claims` leaks victims' `claimId`s unauthenticated. `POST /claim-records/request` then `/claim-records/complete {wallet: victim, status:"claimed", signature:<any base58>}` marks the claim `claimed` on the attacker-supplied `wallet` alone ([`index.ts:4861/4895/4907`](apps/api/src/index.ts#L4861)). If bricked **before** the worker records it on-chain, `recordClaimsForTurn` filters to `status==="available"` and skips it forever — the victim can never `claim_prize`. Mass-brick every winner per turn.

### ④ Worker trusts API-supplied draw — **CONFIRMED (defense-in-depth gap)**
`verifyGuessJob` feeds `job.draw` into rule evaluation without ever checking `draw === deriveDrawNumbers(onChainRandomness, turnId)` or `hash(draw) === draw_hash` ([`apps/worker/src/guess-verification.ts:252`](apps/worker/src/guess-verification.ts#L252)). The verification pass is therefore **not** a compensating control for ①.

### ⑤ Unauthenticated worker `/manual/*` — **CONFIRMED (flag-on)**
When `TYCHE_TURN_MANUAL_CONTROL_ENABLED` is set, `/manual/force-close|migrate|settle|cycle` require **no credential** and drive the authority key on-chain ([`apps/worker/src/index.ts:504`](apps/worker/src/index.ts#L504), `manual-control.ts`). `/__worker` makes them **publicly reachable**. `force-close` wedges settlement permanently (`closed_without_fulfilled_draw`), locking the prize pool.

---

## 4. Findings by severity

### CRITICAL

**C1 — Unauthenticated settlement pipeline = fund theft + winner-bricking + state forgery.**
~25 unauthenticated state-mutating API routes feed the authority's on-chain signing (chains ①②③④). The economically load-bearing ones: `/winner-records/calculate-turn`, `/reward-records/calculate-turn`, `/claim-records/*`, `/draws`, `/elections`, `/verification-results`, `/prize-pool-rollovers`, `/turn-rollovers/settle`, `/settlement-transitions`. **The** issue.

**C2 — Sybil election capture (profitable).**
All fee escalation is **per-wallet, not per-identity** ([`tyche/src/domain.rs:241`](contracts/solana/programs/tyche/src/domain.rs#L241)), so N fresh wallets defeat the `2^n` wall linearly. An attacker: (1) seats their 3 rules as top-voted via free approval votes; (2) floods the eligible pool to dominate the random-7 finalists; (3) eliminates 5 rival finalists for ~1 vote each — random finalists' frozen approval is ~0, so `elim(1) > approval(0)` qualifies ([`lib.rs:1010`](contracts/solana/programs/tyche/src/lib.rs#L1010)); (4) their rule is VRF-selected active → they win the alternative pool + creator/voter rewards. Cost ≈ a few `VOTE_FEE`, ~free in the early free-window.

### HIGH

**H1 — Rule-authorship structural self-advantage.** Difficulty (`ALWAYS_TRUE`/`TOO_EASY`) is a **label, never a gate** ([`packages/rule-compiler/src/index.ts:746`](packages/rule-compiler/src/index.ts#L746)). Guesses are public and lock before the rule is chosen, so an author crafts a rule whose structural clause excludes rivals' already-visible guesses but includes their own → near-deterministic jackpot when combined with C2.

**H2 — v3 minimize-ranking payout inversion (verified).** `CURRENT_SCHEMA_VERSION = 3`, but the worker only wires ranking `direction` when `schemaVersion === 2` ([`apps/worker/src/guess-verification.ts:120`](apps/worker/src/guess-verification.ts#L120)); the API fallback defaults undefined→`"max"` ([`apps/api/src/index.ts:3876`](apps/api/src/index.ts#L3876)). Every "fewest/lowest wins" turn therefore pays the **highest** scorers — silent, deterministic misdirection of the real pool.

**H3 — Uncapped reward/referral farming.** `settle_action_reward` (0.4 tok/proposal, 0.06/vote) and referral rewards (0.2+0.03/invitee) have **no per-wallet cap**; self-referral blocked only by `inviter != invitee` ([`tokenomics_core/src/lib.rs:1280`](contracts/solana/programs/tokenomics_core/src/lib.rs#L1280)). Drains the 200M reserve as pure Sybil arbitrage. On-chain and reachable; only ungated today because the keeper isn't wired yet.

**H4 — Statistical runtime-safety gate lets throwing artifacts through.** `runtime_safe` samples only 200 inputs; a rule overflowing `MAX_SCALAR_ABS` on a small input subset is frozen, then at settlement **silently drops** affected guessers from the ranking pool (per-job dead-letter), biasing winners. `classifyDifficulty` (2000 samples, **no try/catch**) is a compile-time DoS. Make safety static/deterministic; treat an eval throw as LOSE, not drop.

**H5 — Single over-permissioned authority key + draw re-roll grinding.** One key signs open/close/VRF/`record_claim`/config/migrate. `reset_stale_vrf_request` + the failed-draw re-request path let a compromised authority re-roll the draw after guesses lock (Switchboard values are peekable pre-broadcast). Split keys by role; cap on-chain re-requests per turn.

**H6 — Tokenomics epoch pipeline permanent deadlock.** With ≥2 challenges on one root, accepting one leaves `unresolved_challenges != 0`; past the deadline `resolve`/`expire_unresolved_root`/`refund` all revert and `publish_provisional_root` is blocked forever → the whole distribution pipeline halts and the bond freezes ([`tokenomics_core/src/lib.rs:848-966`](contracts/solana/programs/tokenomics_core/src/lib.rs#L848)). **Fix:** let `expire_unresolved_root` accept `Cancelled` / add a governance escape hatch.

**H7 — API DoS: unbounded body + unauthenticated LLM.** `readJsonBody` buffers all chunks with no size cap before parsing ([`index.ts:3065`](apps/api/src/index.ts#L3065)); every unauthenticated POST is a memory-exhaustion vector. `/rule-preflight` fans out to multiple LLM round-trips (300s timeout floor) with no auth/rate-limit — cheap compute/cost DoS.

### MEDIUM

| ID | Finding | Reference |
|---|---|---|
| M1 | `record_claim` has no on-chain conservation cap — authority can direct the whole vault to one wallet (the on-chain half of C1) | [tyche lib.rs:1711](contracts/solana/programs/tyche/src/lib.rs#L1711) |
| M2 | Treasury timelock is a no-op (`DELAY=0`, immutable) → schedule+execute drain in one bundle; permissionless `execute_treasury_sol/token_operation` cranks make it worse | [tokenomics domain.rs:17](contracts/solana/programs/tokenomics_core/src/domain.rs#L17) |
| M3 | `initialize_genesis` front-runnable — authorities taken from caller args | [tokenomics lib.rs:49](contracts/solana/programs/tokenomics_core/src/lib.rs#L49) |
| M4 | No key rotation for governance/guardian/game_authority/publisher | tokenomics_core (whole) |
| M5 | Campaign-funding op front-run desync (generic executor consumes a campaign op) | [tokenomics lib.rs:1476](contracts/solana/programs/tokenomics_core/src/lib.rs#L1476) |
| M6 | Settlement not idempotent (projection runs before `recordTransition`) + no cross-process lock → double-rollover risk; replicas race | [settlement-scheduler.ts:302](apps/worker/src/settlement-scheduler.ts#L302) |
| M7 | VRF wedge when the committed account exists but its reveal window lapsed | [settlement-scheduler.ts:392](apps/worker/src/settlement-scheduler.ts#L392) |
| M8 | Dev/operator pages + mock-fetch ship ungated to prod | [dev/tokenomics/genesis/page.tsx:4](apps/web/src/app/dev/tokenomics/genesis/page.tsx#L4), [dev/gallery/page.tsx:21](apps/web/src/app/dev/gallery/page.tsx#L21) |
| M9 | No CSP / security headers on web or admin (clickjacking a wallet DApp; no XSS defense-in-depth; no HSTS) | `apps/web/next.config.ts`, `apps/admin/next.config.ts` |
| M10 | No rate limiting anywhere on the API | `apps/api/src/index.ts` |
| M11 | Prompt-injection defense shallow (7 English regexes); guardian optional/fail-open | [index.ts:88](apps/api/src/index.ts#L88), [guardian.ts:55](apps/api/src/guardian.ts#L55) |
| M12 | Passwordless Redis + default Postgres/Grafana creds published on `0.0.0.0` | [docker-compose.yml:19](docker-compose.yml#L19) |
| M13 | Solana toolchain drift — deployed `.so` ≠ CI-blessed toolchain; build not verifiable | `.github/workflows/solana-program.yml`, `infra/docker/Dockerfile.node`, `contracts/solana/scripts/sbf.sh` |
| M14 | `bigint-buffer` high CVE (via `@sqds/multisig` → `@solana/spl-token`); +2 moderate, 1 low | `pnpm-lock.yaml` |
| M15 | Mandate dedup not semantic across v2/v3 encodings → cooldown bypass by re-encoding | [index.ts:3796](apps/api/src/index.ts#L3796) |

### LOW

- Merkle tree odd-node duplication + position-agnostic proof (CVE-2012-2459 shape) in SOL distribution — [packages/tokenomics/src/index.ts:365](packages/tokenomics/src/index.ts#L365)
- Non-canonical `hashJson` artifact identity — [rule-compiler/src/index.ts:2923](packages/rule-compiler/src/index.ts#L2923)
- `RULE_RUNTIME_LIMITS.timeoutMs` declared but never enforced — [rule-runtime/src/index.ts:23](packages/rule-runtime/src/index.ts#L23)
- Unbounded v2 AST integer literals (safety leans on a runtime throw) — `packages/rule-schema/src/index.ts`
- Guardian pause skips `claim_distribution` / `unlock_tokens` — [tokenomics lib.rs:1026](contracts/solana/programs/tokenomics_core/src/lib.rs#L1026)
- Single-key permissionless `seal_epoch_root` (optimistic-model trust anchor) — tokenomics_core
- Challenge-bond griefing (0.02 SOL) and VRF-wedge griefing
- `record_external_treasury_fee` can over-attribute from pre-existing vault balance
- API leaks internal `error.message` to clients
- Operator-challenge map grows unbounded (in-memory)
- CORS reflects any localhost/RFC-1918 origin (API + worker)
- Worker/Docker `curl | sh` toolchain install without checksum (CI does verify it)
- Containers run as root; no CI `permissions:` scoping; CI actions not SHA-pinned
- Worker carries lamports as JS `number`
- No in-app pre-sign transaction summary (relies on wallet decode)

---

## 5. Attack-surface map (condensed)

### API — `apps/api/src/index.ts` (dispatcher ~8537)
- **Auth:** none on any mutating route. Only two **read-only** GETs use ed25519 (`GET /operator/ai-operations[/export]`), and the proxy strips their headers.
- **Unauthenticated, state-mutating, proxy-reachable:** `/rule-preflight`, `/guess-receipts`, `/rule-proposals`, `/rule-precompilations`, `/rule-validations[/run]`, `/rule-votes`, `/rule-elimination-votes`, `/rule-eliminations`, `/rule-removals`, `/prize-pool-rollovers`, `/turn-rollovers/settle`, `/draws`, `/elections`, `/verification-jobs/create-turn`, `/verification-results`, `/winner-records/calculate-turn`, `/reward-records/calculate-turn`, `/claim-records/create-turn`, `/claim-records/expire-unclaimed`, `/claim-records/request`, `/claim-records/complete`, `/settlement-transitions`.

### Worker — `apps/worker/src/index.ts` (server ~476)
- `GET /health`, `GET /turn/active` — unauth read.
- `POST /manual/{open,close,cycle,force-close,migrate,settle}` — **env-flag gated only**, drive the authority key on-chain; publicly reachable via `/__worker`.

### On-chain — permissionless-but-stateful instructions (flagged)
- **tyche:** `settle_proposal_token_reward`, `settle_supporter_token_reward` (beneficiary-bound cranks; permissionless triggering).
- **tokenomics_core:** `open_distribution_epoch`, `publish_provisional_root`, `refund_expired_challenge`, `expire_unresolved_root`, `seal_epoch_root`, `fund_future_campaign`, `execute_treasury_token_operation`, `execute_treasury_sol_operation`, `fund_correction_reserve`. All optimistic/challenge-gated or bound to a governance-scheduled op + timelock — but the **timelock delay is 0** (M2), so scheduled treasury ops are executable immediately by anyone.
- `reinitialize_global_config_for_migration` (tyche) uses an `UncheckedAccount` global_config with manual discriminator/authority validation — deeper review recommended.

### Admin — `apps/admin`
- `/` public transparency dashboard (unauth by design).
- `/operator/ai-operations` — client-side wallet gate only; real enforcement is the API's `OPERATOR_AI_CONSOLE_AUTHORIZED_WALLETS` allowlist. No `middleware.ts`, no session.

### Beyond HTTP
- Env-flag features (`TYCHE_TURN_MANUAL_CONTROL_ENABLED` highest-value), the automation/settlement/precompile loops (all sign with the authority key), and operator CLI scripts that load keypairs. `packages/mcp-tools` has **no** live tool surface. No inbound oracle webhooks (Switchboard is pull-based).

---

## 6. Economic / game-theory attacks (auth assumed fixed)

| # | Attack | Type | Severity | Status |
|---|---|---|---|---|
| 1 | Sybil election capture (seat finalists + cheap elimination) | Profitable | Critical | Live |
| 2 | Rule-authorship structural self-advantage (difficulty is a label) | Profitable | High | Live |
| 3 | Proposal/supporter reward farming (no per-wallet cap) | Profitable drain | High | On-chain, keeper not wired |
| 4 | Referral Sybil farming (pubkey-only self-ref check, no cap) | Profitable drain | High | On-chain, keeper not wired |
| 5 | Sybil guess flooding (per-wallet fee escalation) | Profitable w/ 1–2 | Medium | Live |
| 6 | `is_creator_of_active_rule` self-dealing gate | Self-dealing | Med (Crit if shipped) | Not implemented |
| 7 | No-winner rollover engineering | Griefing/jackpot | Low–Med | Live |
| 8 | Challenge-bond / VRF-wedge griefing | Griefing | Low | Live |

**Single highest-leverage economic fix:** make governance weight (approval votes, elimination votes, the `elim > approval` qualifier) resistant to fresh-wallet Sybils — stake/age weighting, absolute vote floors, per-creator finalist caps — and turn the specified per-turn joint difficulty analysis into an actual **electability gate**, not a label.

---

## 7. Verified NOT vulnerable

- On-chain VRF draw: trustless, atomic reveal+settle (one-shot, no grinding), rejection-sampled (no modulo bias), no `Math.random`/timestamp/blockhash anywhere in selection.
- tyche claim IDOR: claim PDA seeded by `turn_id+claimant+kind`, `claim.claimant == signer`, `init` (no flag-reset), CEI + state flag, `pay_from_vault` checked-sub with rent floor.
- **Rule interpreter sandbox is genuinely hardened:** no `eval`/`Function`/`RegExp`/`require`/`child_process`; depth/op/array/scalar caps; zod strips unknown keys (no prototype pollution); integer-only (no cross-machine FP divergence).
- tokenomics_core: mint & freeze authority revoked + supply-invariant asserted; `transfer_checked` everywhere; Merkle leaf/node domain separation; cumulative vault solvency; strictly-increasing voter accounts block aliasing; all singletons `init` (no reinit).
- Web proxy is **not** SSRF/open-proxy (fixed base host, `encodeURIComponent` segments, minimal header forwarding).
- No XSS sinks (`dangerouslySetInnerHTML`/`eval`/`innerHTML` absent; user text rendered as React text nodes).
- `.env` gitignored; `.env.example` = public keys + placeholder dev creds; no secrets in git or client bundle; no hardcoded private keys (all from env).
- No SQL/command injection (pg used only for `select 1`; `execFile` with argv, no shell).
- CI is `pull_request` (not `pull_request_target`); `sbf.sh` keypair handling is careful; lockfiles committed and installs frozen.

---

## 8. Remediation roadmap (by leverage)

1. **Authenticate the settlement boundary.** Worker-only credential (mTLS / signed payload) on *every* mutating API route; recompute winner eligibility server-side from the compiled artifact + on-chain draw instead of storing the client's `result`; worker reconciles claimant/amount against the on-chain draw and vault balance before signing; add a vault-conservation cap in `record_claim`. **Kills C1 / ①–④, H2, H5.**
2. **Verify player signatures** (ed25519 + server nonce + expiry + domain binding) on all mutating player routes. **Kills ②③.**
3. **Lock the worker control plane** — auth token + loopback-bind `/manual/*`; do not expose `/__worker/manual/*`; split the authority key by role; cap on-chain draw re-requests. (⑤, H5.)
4. **Sybil / economic hardening** — stake/age-weighted votes, absolute elimination floors, per-creator finalist caps, creator-dedup the random pool, per-wallet reward/referral caps, and make the joint per-turn difficulty an electability gate. (C2, H1, H3.)
5. **Robustness** — deterministic runtime-safety (static bound, not sampling; throw→LOSE) (H4); epoch-deadlock escape hatch (H6); body-size cap + rate limits + LLM queue (H7); idempotency keys + settlement lock (M6).
6. **Governance / infra** — real timelock + setter, initializer restriction, key rotation (M2–M4); private-bind Redis/DB and drop default creds (M12); unify toolchain + verifiable build (M13); CSP/headers + gate `dev/**` (M8/M9); patch `bigint-buffer` (M14).
7. **Wire the DoD scans** (`gitleaks`, `semgrep`, `osv-scanner`, `slither`) as merge gates — the security checklist lists them but CI runs none.

---

## 9. Definition-of-Done gate (security checklist status)

| Check | Tool | Present in CI? |
|---|---|---|
| Secrets scan | gitleaks | ❌ |
| Dependency CVEs | osv-scanner | ❌ (manual `pnpm audit` only) |
| SAST | semgrep | ❌ |
| Solidity/Rust static analysis | slither / aderyn | ❌ |
| Contract tests | Rust/SBF via Docker | ✅ (present) |
| Web2 auth tests | project suite | ❌ (no auth to test) |

> This document is a point-in-time review. Re-verify each finding against current code before remediating, and re-run the full pass after the settlement-boundary auth work lands, since it changes the primary trust boundary.
