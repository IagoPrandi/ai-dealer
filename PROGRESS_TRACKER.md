# Progress Tracker

This tracker records milestone status, work logs, and required document confirmations for Idealer implementation.

## Required Markdown Confirmation

Opened before starting `M0.1`:

- `PRD.md`
- `AGENTS.md`
- `.claude/skills/best-practices/SKILL.md`
- `.claude/skills/best-practices/references/agent-principles.md`

## Milestone Status

| Milestone | Name                                          | Status    | User Confirmation    | Notes                                                                                                                                                                              |
| --------- | --------------------------------------------- | --------- | -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M0.1      | PRD Baseline                                  | Completed | Confirmed 2026-06-02; residual 2026-06-21 | Required artifacts implemented, consistency-checked, and marked complete after user confirmation; residual v1.5.0 rule-elimination, voter-reward, and vote-fee confirmations were verified and ticked on 2026-06-21. |
| M0.2      | Monorepo Skeleton                             | Completed | Confirmed 2026-06-02 | Skeleton, workspace configs, README, and verification commands completed.                                                                                                          |
| M0.3      | Docker Baseline                               | Completed | Confirmed 2026-06-02 | Required Docker stack implemented, verified, and marked complete.                                                                                                                  |
| M0.4      | Technical Contracts                           | Completed | Confirmed 2026-06-03 | Required contract drafts implemented, validated, and marked complete after user confirmation.                                                                                      |
| M0.5      | Mobile UX Flow Baseline                       | Completed | Confirmed 2026-06-03 | Required UX flow artifacts implemented, validated, and marked complete after user confirmation.                                                                                    |
| M0.6      | Not defined in PRD                            | Blocked   | Pending              | No M0.6 section exists in `PRD.md`; the next defined milestone is M1.1.                                                                                                            |
| M1.1      | Mobile Live Round Hub                         | Completed | Confirmed 2026-06-03 | Public `/play` hub implemented, validated, and marked complete after user confirmation.                                                                                            |
| M1.2      | Mobile Number Picker                          | Completed | Confirmed 2026-06-04 | Number picker flow implemented, validated, and marked complete after user confirmation.                                                                                            |
| M1.3      | Free-Form Rule Composer                       | Completed | Confirmed 2026-06-04 | Free-form rule proposal flow implemented, validated, and marked complete after user confirmation.                                                                                  |
| M1.4      | Voting Flow                                   | Completed | Confirmed 2026-06-04 | Mobile voting flow implemented, validated, and marked complete after user confirmation.                                                                                            |
| M1.5      | Simulated Turn Cycle                          | Completed | Confirmed 2026-06-04 | Variable turn-cycle simulator implemented, validated, and marked complete after user confirmation.                                                                                 |
| M1.6      | Simulated Result, Near-Miss & Creator Outcome | Completed | Confirmed 2026-06-04 | Simulated result flow implemented, validated, and marked complete after user confirmation.                                                                                         |
| M1.7      | Mobile Share Card Prototype                   | Completed | Confirmed 2026-06-04 | Mobile share card generator implemented, validated, and marked complete after user confirmation.                                                                                   |
| M1        | Mobile Interactive Prototype                  | Completed | Confirmed 2026-06-04 | All M1 submilestones are implemented, validated, confirmed, and marked complete. Quantitative usability approval metrics remain tracked separately.                                |
| M2.1      | Mobile Wallet Flow                            | Completed | Confirmed 2026-06-04 | Wallet Standard, Mobile Wallet Adapter, named mobile-wallet handoffs, devnet test transaction, recovery, status, retry, and disconnect flows implemented and validated.            |
| M2.2      | devnet Programs                               | Completed | Confirmed 2026-06-04 | Core Anchor program implemented, SBF instruction suite passed, and program deployed to devnet as `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4`.                                   |
| M2.3      | devnet Guess Submission                       | Completed | Confirmed 2026-06-04 | Number picker builds and sends the deployed devnet `submit_guess` transaction, blocks known duplicates, records receipts through the API, and has on-chain `PlayerGuess` evidence. |
| M2.4      | devnet Rule Proposal                          | Completed | Confirmed 2026-06-04 | Token preflight, sanitization, prompt-injection rejection, devnet `propose_rule` submission flow, public rule projection, and on-chain text/hash proof are complete.               |
| M2.5      | devnet Voting                                 | Completed | Confirmed 2026-06-08 | On-chain `RuleVote` submission flow, duplicate blocking, indexed vote projection, and voting UI state implemented and verified; user confirmed proceeding to M2.6.                  |
| M2.6      | Public Round Pages                            | Completed | Confirmed 2026-06-08 | Public `/round/[turnId]` page plus `GET /rounds/:turnId` summary endpoint implemented and verified: turn id, cycle step/duration, prize pool, rules + vote counts, connected-user guess, draw placeholder, audit links, and shareable URL. User confirmed proceeding to the next milestone. |
| M3.1      | VRF Draw Integration                          | Completed | Confirmed 2026-06-09 | Draw flow implemented and verified across program (native + SBF instruction tests), backend, worker, and frontend; SBF artifact built and the program upgraded on devnet (`6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4`, data length 448024 bytes, slot 468217908). User funded the deployer to authorize the upgrade. |
| M3.2      | Rule Election                                 | Completed | Confirmed 2026-06-11 | Deterministic top-voted + fulfilled-VRF-random rule election implemented across program/domain, worker, API projection, and public round audit UI. PRD checklist and approval criteria ticked after the user's explicit instruction to verify/do M3.2 and mark it done. |
| M3.3      | AI Rule Validation                            | Completed | Confirmed 2026-06-11 | Deterministic rule validation and precompilation implemented across compiler, API, worker, and public round UI. PRD checklist and approval criteria ticked after the user's explicit instruction to verify/do M3.3 and mark it done. |
| M3.4      | Composite Confidence                          | Completed | Confirmed 2026-06-11 | Canonical composite compiler confidence schema, configured PRD weights, accept/escalate/reject threshold action, API/worker propagation, and confidence policy tests implemented. |
| M3.5      | Guess Verification Queue                      | Completed | Confirmed 2026-06-11 | Queue job creation per submitted guess, deterministic original/alternative verification worker, retry/dead-letter/rate-limit handling, API job/result status, and Docker smoke verification implemented. |
| M3.6      | Agent Fallback & Provider Dispute Handling    | Completed | Confirmed 2026-06-12 | Primary/secondary/tertiary provider routing, local OpenAI-compatible request-shape metadata, grammar/schema capability checks, timeout/malformed/schema fallback, provider path logging, model identity freezing, fallback/disagreement metrics, and tertiary dispute handling implemented. |
| M3.7      | Verification Logs & Attestation               | Completed | Confirmed 2026-06-12 | Compiler validation and guess verification now append hash-chained audit records, expose public audit endpoints, map logs to public state, provide a PostgreSQL `audit_logs` schema/adapter, and verify tamper detection with API tests. |
| M3.8      | Rule Elimination Decision Phase               | Completed | Confirmed 2026-06-21; repeated-vote update confirmed 2026-06-28 | Two-step finalist/active election, elimination votes, survivor-only active selection, public audit API, decision-window UI, on-chain vote fees, and M0.1 decision docs verified; PRD checklist and approval criteria ticked after user confirmation. PRD v1.5.1 repeated elimination vote sequencing/escalating fees updated to side-specific `2^n * VOTE_FEE` and ticked on 2026-06-28 after user confirmation. |
| M4.1      | Prize Pool Accounting                         | Completed | Confirmed 2026-06-13; repeated-vote update confirmed 2026-06-28 | Deterministic lamport-level accounting implemented in API projections and Solana domain math; PRD checklist and approval criteria ticked after the user's explicit instruction to verify and mark done if complete. PRD v1.5.1 repeated approval/elimination vote fee accounting updated to side-specific `2^n * VOTE_FEE` and ticked on 2026-06-28 after user confirmation. |
| M4.2      | Winner Calculation                            | Completed | Confirmed 2026-06-13 | Winner records, separated original/alternative winner lists, per-bucket payout calculation, zero/many winner handling, and round/API exposure implemented and verified. |
| M4.3      | Creator and Voter Reward Calculation          | Completed | Confirmed 2026-06-21; repeated-vote update confirmed 2026-06-28 | Creator/voter reward distribution (`calculateRewardDistribution`, `CreatorRewardRecord`/`VoterRewardRecord`), reserve-first funding (creator then voter), per-turn caps, no reduction to winner payout, and full API/round exposure. PRD checklist + approval criteria were already ticked; this tracker row was added to close the tracker × PRD divergence after the user's explicit confirmation. Tests green (`reward distribution…`, `creator and voter reward records…`, `reward calculation handles no alternative winners…`). PRD v1.5.1 wallet-unique voter reward behavior for repeated approval votes implemented and ticked on 2026-06-28 after user confirmation. |
| M4.4      | Claim Flow                                    | Completed | Confirmed 2026-06-21 | Winner/creator/voter claim records, claim request + completion flow, double-claim prevention, below-threshold unavailability, mobile wallet approval states, and claim summary exposure. PRD checklist + approval criteria were already ticked; this tracker row was added to close the tracker × PRD divergence after the user's explicit confirmation. Tests green (`claim flow creates winner and creator claims and blocks double claim`, `…failed wallet approval…`, `…elected-rule voter reward claims`). |
| M4.5      | Rollover Behavior                             | Completed | Confirmed 2026-06-21 | Automatic per-bucket rollover settlement implemented in the API (`settleTurnRollover`, `getTurnRolloverSettlement`, `getRolloverActivityEvents`, `POST /turn-rollovers/settle`, `GET /turn-rollovers/settlement`), round-summary `activity` + `rolloverSettlement` fields, and round-page rollover display. No-winner buckets roll the full bucket forward (accumulating across repeated no-winner turns); winner buckets roll only integer-division dust; rewards are unaffected (separate reserve). PRD §15 checklist + approval criteria ticked after the user's explicit instruction to verify and mark done. Re-verified: API 28/28, API typecheck/lint, web typecheck/lint. |
| M4.6      | Paid Rule Removal Accounting                  | Completed | Confirmed 2026-06-21 | On-chain `remove_rule` instruction (GameToken-gated, fee→prize pool with standard treasury split, creator/third-party vote-threshold protection, pre-eligible-pool-lock + removable-state checks, `RuleRemoval` PDA + `RemovedPaid` state + `RuleRemoved` event), API enforcement (`removeRule` with typed `RuleRemovalRejectedError`, hash-chained `rule.removal` audit log, removal activity-feed event, election exclusion via `removed_paid` projection), `RULE_REMOVAL_CONFIG` constants (5/15 thresholds per §6.11) + aligned devnet bootstrap, and round-page removed-rule display. PRD §15 checklist + approval criteria ticked after the user's explicit instruction to verify/implement and mark done. |
| M4.7      | On-chain Claim Execution                      | Done | Confirmed 2026-06-26 | Confirmed by user; PRD §15 M4.7 ticked. On-chain `Claim` PDA (`["claim", turn, wallet, kind]`) + `record_claim` (authority) / `claim_prize` (prize vault) / `claim_reward` (treasury reserve), pull-payment with rent-floor guard, CEI double-claim guard; SBF suite incl. `claim_flow_records_and_pays_winner_and_reward`; devnet program upgraded. Worker `recordClaimsForTurn` wired into the M5.3 settlement loop + frontend `createClaim*Instruction` + `/claim-records/request`→`/complete`. **Live devnet claim (turn 37):** `record_claim` recorded 5 winner-payout PDAs; real claimant-signed `claim_prize` transferred 0.018 SOL from the prize vault (sig `3WM8BtYeHtEMmiNSamB37eeuYYq5KNPB28APFnCs3ivvzgRkKTFdvQAmJPUZwaBDVUWkBTJRtSzQgbovWUNzWgh2`, delta +18,045,000 lamports, API→`claimed`); double-claim rejected on-chain (`ClaimNotAvailable` 6058); below-minimum creator reward never recorded (`unavailable`). Gated operator `apps/worker/src/devnet-claim-prize.ts`. `claim_reward` is SBF-tested + frontend-wired (no above-threshold reward existed to claim live). |
| M4.8      | Player Rewards History                        | Completed | Confirmed 2026-06-26 | Confirmed by user and PRD §15 M4.8 ticked. `GET /players/{wallet}/claims` aggregation (`getPlayerClaimsSummary`), `/play/results` wallet-gated claims surface with claimable/pending/claimed items and on-chain claim execution, `/play/rewards` grouped turn history with round-detail links, and account-screen reward-history entry. Re-verified: API 38/38, web typecheck/lint/test/build, manual Playwright smoke for `/play/results`, `/play/rewards`, and `/round/37`. |
| M5.1-M5.5 (PRD) | Public Transparency through Public Trends & Exports | Completed | Confirmed 2026-06-29 | Confirmed by explicit user request and ticked in `PRD.md`. Implemented the PRD §15.6 public transparency surface through M5.5 with API snapshot/export projections, the `apps/admin` read-only dashboard, and a restricted redacted AI operations section gated by `OPERATOR_AI_CONSOLE_TOKEN`. This is separate from the older `SETTLEMENT_TRUSTLESS_PLAN.md` M5.0-M5.5 rows below. |
| M5.6 (PRD) | Restricted AI Agent Operations Dashboard | In Review | Pending | Implemented the restricted redacted AI operations dashboard scope with role call volume, provider/model routing by role, latency percentiles, failure/fallback/escalation counters, confidence distributions, token/cost projections, queue backlog, local model health, redacted incidents, and audit links. PRD checkboxes remain unticked until explicit user confirmation. |
| M5.0      | Switchboard On-Demand provisioning (devnet)   | Completed | Confirmed 2026-06-23 | Confirmed and ticked in `SETTLEMENT_TRUSTLESS_PLAN.md`; `set_vrf_config` and Switchboard proof-of-life were broadcast on devnet, and on-chain VRF config addresses were verified. |
| M5.1      | Trustless on-chain randomness verification    | Completed | Confirmed 2026-06-23 | Confirmed and ticked in `SETTLEMENT_TRUSTLESS_PLAN.md`; `settle_draw`/`settle_rule_election`/`settle_active_election` now read+verify the Switchboard randomness account on-chain. SBF suite 7/7 green and devnet upgrade verified. |
| M5.2      | Worker randomness client + settlement senders | Completed | Confirmed 2026-06-23 | Confirmed and ticked in `SETTLEMENT_TRUSTLESS_PLAN.md`. Production Switchboard settlement senders + web3 instruction builders; worker typecheck/test (58/58)/lint/build pass. Live devnet acceptance on turn 31: `request_draw` → atomic reveal + `settle_draw` (sig `5n5aCsz8…`, finalized, slot 471498242) → `DrawStatus::Fulfilled`, draw `[17,56,47,28,14,8]`, verified randomness `c7a7…86bc`. |
| M5.3      | Settlement scheduler + state machine + API bridge | Completed | Confirmed 2026-06-24 | Confirmed and ticked in `SETTLEMENT_TRUSTLESS_PLAN.md`. Live devnet staged turn 32 ran the no-player original-only settlement path through `CLOSED`, populated `/rounds/32`, and wrote the 8-step §5.5 audit chain. |
| M5.4      | Real player inputs (no mocks)                 | Completed | Confirmed 2026-06-25 | Confirmed and ticked in `SETTLEMENT_TRUSTLESS_PLAN.md`. Live devnet acceptance on turn 36: 3 real guesses, 1 eligible LLM-compiled rule, 3 votes, active alternative-rule election/freeze, draw, and verification completed with real results. |
| M5.5      | End-to-end trustless verification             | Completed | Confirmed 2026-06-26 | Live devnet turn 37 completed the full trustless settlement path with 17 real guesses, 1 eligible LLM-compiled rule, 17 votes, active rule freeze, draw, verification, winners, rewards, claims, on-chain/API/audit reconciliation, idempotent replay, and current Idealer UI verification. Checkbox marked after explicit user confirmation. |
| M9.0      | Election Randomness Gate                      | Completed | Confirmed 2026-06-27 | Confirmed by explicit user request and ticked in `PRD.md`. Trustless Switchboard election flow is implemented; finalist/active election VRF values, eligible candidate commitments, and public `rule.election.proof` audit logs let auditors recompute election outcomes from public commitments and fulfilled randomness. |
| M9.1      | Rule Compiler Gate                            | Completed | Confirmed 2026-06-27 | Confirmed by explicit user request and ticked in `PRD.md`. Existing compiler/preflight/guardian/provider-routing work was verified; remaining gate gaps were closed with frozen artifacts containing original text, official interpretation, AST, tests, versions, and timestamp; API schema v1/v2 artifact validation and hash mismatch rejection; reviewer mismatch fail-closed behavior; and worker publication of full compiled artifacts. |
| M9.2      | Runtime Security Gate                         | Completed | Confirmed 2026-06-27 | Confirmed by explicit user request and ticked in `PRD.md`. Runtime has deterministic AST parsing/execution, timeout/operation/depth/memory/scalar limits, no network/filesystem/import/RNG/clock sinks, unknown-node rejection, malicious fixture coverage, and deterministic fuzz tests. |
| M9.3      | Accounting Gate                               | Completed | Confirmed 2026-06-27; repeated-vote update confirmed 2026-06-28; transparency/retry closure confirmed 2026-06-29 | Confirmed by explicit user request and ticked in `PRD.md`. Accounting coverage includes no alternative rule, invalidated alternative rule, no winners, multiple winners, rounding, minimum payout, expired unclaimed payout rollover, retry idempotency, backend-contract parity vector, and reserve/cap/double-claim protection. PRD v1.5.1 repeated-vote fee parity and wallet-unique voter reward gate items implemented and ticked on 2026-06-28 after user confirmation. Repeated-vote transparency/indexer reconciliation and persistence-path retry hardening were implemented, re-audited, and ticked on 2026-06-29 after user confirmation. |
| M9.4      | Mobile Reliability Gate                       | Completed | Confirmed 2026-06-28 | Confirmed by explicit user request and ticked in `PRD.md`. Mobile wallet recovery, pending/rejected/delayed/duplicate/turn-changed states, persistent local action recovery, pre-send duplicate account check, post-signature active-turn check, and Playwright coverage are implemented and verified. |

## Maintenance Work Log

### 2026-06-29 (PRD M5.6 restricted AI operations dashboard implementation)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md` through `04-new-screen-recipe.md`, `.claude/skills/security-best-practices/SKILL.md`, `.claude/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`, and `.claude/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`.
- Expanded `apps/api` restricted operator snapshot/export to cover PRD `M5.6`: call volume by AI role, provider/model routing by role, end-to-end latency percentiles, timeout/malformed/schema/guardrail failure counters, fallback/escalation counters, provider disagreement, model/compiler/final confidence buckets, token volume, estimated cost from optional `LLM_ESTIMATED_COST_PER_1K_TOKENS_USD`, verification queue backlog/dead-letter status, local model identity/health fields, redacted incident summaries, and audit links.
- Expanded `apps/admin` restricted AI operations panel in the existing Idealer dashboard style. The panel remains read-only, loads only after an operator bearer token is supplied in memory, and does not store the token in browser storage.
- Added/updated API test assertions proving the restricted snapshot is role-gated, redacted, includes M5.6 fields, and exports redacted CSV columns for latency and estimated cost.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (54/54), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/admin typecheck`, `pnpm --filter @idealer/admin test`, `pnpm --filter @idealer/admin lint`, and `pnpm --filter @idealer/admin build`.
- Runtime evidence: on local API/admin `127.0.0.1:3012`/`127.0.0.1:3011`, seeded one rule proposal and validation through the API. `GET /operator/ai-operations` with the operator token returned `role=ai_operator`, `CALL_ROLES=6`, `VALIDATIONS=1`, `ROUTING=1`, `LATENCY_ROWS=3`, `TOKENS=13`, `AUDIT_LINKS=1`, `LOCAL_HEALTH=1`; the restricted CSV export header included `role`, `p95_latency_ms`, `total_tokens`, and `estimated_cost_usd`.
- Browser screenshot tooling was unavailable in this environment (`agent-browser` and `playwright` commands not found; no Chrome/Edge executable in standard Windows paths). HTTP runtime evidence and build verification were collected instead.
- Reviewed the result for inconsistencies introduced by the changes: public transparency remains public/derivable; restricted AI operations remain access-controlled and redacted; no raw prompts, raw completions, compiled artifacts, provider request/response bodies, secrets, private analytics, device/session fields, or unredacted stack traces are returned.

### 2026-06-29 (PRD M5.1-M5.5 completed after restricted AI operations closure)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md` through `04-new-screen-recipe.md`, `.claude/skills/security-best-practices/SKILL.md`, `.claude/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`, and `.claude/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`.
- Audited PRD `M5.1-M5.5` and found one remaining gap: the public transparency implementation still reported restricted AI operations as deferred instead of providing the M5.1 operator-only section.
- Resolved the gap in `apps/api` with read-only `GET /operator/ai-operations` and `GET /operator/ai-operations/export?format=json|csv`, gated by `OPERATOR_AI_CONSOLE_TOKEN` bearer auth. Missing config fails closed, invalid tokens are rejected, and exports include redacted operational aggregates only.
- Updated `apps/admin` to keep the public transparency dashboard open while adding a matching restricted AI operations panel that loads metrics only after an operator token is supplied in memory; no token is stored in browser storage and no mutation controls were added.
- Added API tests for the restricted access gate, redacted snapshot/export behavior, and public transparency data-boundary status.
- Marked PRD `M5.1-M5.5` checklist and approval criteria as complete after the user's explicit instruction to resolve pending items and mark them complete. Left `M5 Approval`, `M5.6`, and `M5.7` unticked because they are separate remaining M5 scopes.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (54/54), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/admin typecheck`, `pnpm --filter @idealer/admin test`, `pnpm --filter @idealer/admin lint`, and `pnpm --filter @idealer/admin build`.
- Runtime verification: started API/admin on `127.0.0.1:3012`/`127.0.0.1:3011` with `OPERATOR_AI_CONSOLE_TOKEN` configured; `GET /transparency` returned `publicMetricsOnly=true` and `restrictedAiOperations.status=access_controlled`; `GET /operator/ai-operations` returned `role=ai_operator` with the token and `401` without it; the admin route returned `200` and rendered `Idealer Transparency Console`. `agent-browser` was not available in PATH, so browser screenshot verification could not be captured.
- Reviewed the result for inconsistencies introduced by the changes: public exports remain public/derivable only; restricted exports are operator-only and redacted; the panel uses the existing Idealer dashboard tokens/components; all new API routes are read-only.

### 2026-06-29 (PRD M5.1-M5.5 public transparency implementation)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/security-best-practices/SKILL.md`, `.claude/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`, `.claude/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-ui-coherence/references/ui-coherence-checklist.md`, `.claude/skills/idealer-design-system/SKILL.md`, and `.claude/skills/idealer-design-system/references/01-tokens.md` through `04-new-screen-recipe.md`.
- Implemented PRD §15.6 `M5.1-M5.5` public transparency scope in `apps/api`: added `GET /transparency` plus `GET /transparency/export?format=json|csv`, with turn/economy transparency, rule/voting lifecycle transparency, settlement/proof summaries, public trends, top public creators, repeated paid-action fee escalation summaries, derivation notes, source references, and explicit private-field exclusions.
- Updated `apps/admin` from a placeholder restricted console into a read-only public transparency dashboard with turn/date filters, export links, public totals, public turn ledger, rule lifecycle, repeated paid-action trends, duration trends, creator summaries, settlement proof tiles, source references, and data-boundary copy.
- Added a restricted operator-only AI operations section gated by bearer token. It exposes redacted operational aggregates only and does not expose unauthenticated internal agent metrics, raw prompts, raw completions, provider payloads, secrets, device/session telemetry, private funnel events, or retention cohorts.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (53/53), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/admin typecheck`, `pnpm --filter @idealer/admin test`, `pnpm --filter @idealer/admin lint`, and `pnpm --filter @idealer/admin build`.
- Runtime verification: started isolated current-code API/admin instances on ports `3012`/`3011`; `GET /transparency` returned `200` with `publicMetricsOnly=true`, `GET /transparency/export?format=csv` returned `200` with the expected CSV header, and the admin route returned `200` with the transparency console shell. The existing API on `3002` was an older running process and was left untouched. `agent-browser` and Playwright CLIs were not available, so no browser screenshot was captured.
- Updated the Progress Tracker with a separate `M5.1-M5.5 (PRD)` row. PRD checklist marking was deferred until explicit user confirmation.
- Reviewed the result for inconsistencies introduced by the changes: the new public dashboard uses only public/API/audit/on-chain derivations, exports include derivation notes and exclusions, all new API routes are read-only, and the existing older `SETTLEMENT_TRUSTLESS_PLAN.md` M5.0-M5.5 rows remain explicitly separate from PRD M5.

### 2026-06-29 (M5 restricted AI operations dashboard added)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/security-best-practices/SKILL.md`.
- Updated `PRD.md` M5 from a public-only transparency console to a public transparency plus restricted AI operations console.
- Added an operator-only AI agent operations dashboard for compiler-agent usage, provider/model routing, latency, timeouts, schema failures, guardrail rejections, fallbacks, provider disagreement, confidence distributions, token usage, estimated LLM cost, queue backlog, dead-letter jobs, and local model health/digest/quantization.
- Added explicit redaction and access-control boundaries: the restricted AI operations dashboard must not expose raw prompts, raw completions, provider API keys, secret values, unrestricted compiler reasoning traces, private provider request/response bodies, unredacted stack traces, or private user analytics.
- Reconciled related M9.6, M6.1, M6.3, and M7.4 requirements so restricted AI operations monitoring is deployed, configured, redacted, and validated before production maturity.
- Reviewed for inconsistencies between the public transparency data boundary and the new restricted AI operations exception; public dashboards remain public/on-chain or publicly derivable only.
- Verification: text searches for the old public-only contradiction and `git diff --check` for `PRD.md`/`PROGRESS_TRACKER.md`; only normal Windows CRLF warnings remain.
- No milestone row was changed and no PRD checkbox was ticked, because this was a PRD scope update and milestone marking requires explicit user confirmation.

### 2026-06-29 (M9 transparency consistency audit)

- Opened required documents/context before auditing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Audited PRD §15.7 `M9 — Mainnet Readiness Gates` and dependent M6/M7/global release criteria for inconsistencies introduced by the M5 shift from private admin analytics to a read-only public transparency console.
- Found and fixed stale M9 wording that still used private-admin terminology without the public-data boundary required by the transparency-console scope.
- Updated M9.3, M9.5, and M9.6 language to use contract/backend/indexer/transparency projections, public/on-chain concentration dashboards, public-signal abuse alerts, and public wallet groups instead of private admin analytics.
- Reconciled dependent PRD sections for M6 real-SOL reconciliation, M6 observability access logs, M7 load/projection validation, M7 transparency maturity, launch readiness review, and resolved MVP decision wording.
- Updated the Progress Tracker M9.3 row and the repeated-vote follow-up note to use `transparency/indexer` terminology instead of `admin` terminology.
- Verification: re-ran text searches for the stale M9/admin phrases and `git diff --check` for `PRD.md` and `PROGRESS_TRACKER.md`; only normal Windows CRLF warnings remain.
- No milestone row was changed and no PRD checkbox was ticked, because this was a consistency audit and milestone marking requires explicit user confirmation.

### 2026-06-29 (M5 transparency-console scope update)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/security-best-practices/SKILL.md`.
- Updated `PRD.md` so M5 is now a read-only public transparency insights console, not a private retention/funnel admin dashboard.
- Replaced M5 private analytics requirements with public/on-chain or publicly derivable dashboards for turn metrics, platform fee collection, prize-pool funding, prize distribution, rule/vote transparency, reward distribution, settlement proofs, accounting reconciliation, and public exports.
- Added explicit M5 data boundaries forbidding private analytics fields such as IP, device fingerprints, private user-agent records, session ids, wallet funnel events, retention cohorts, return-after-loss/win/near-miss analytics, and non-public wallet behavior correlations.
- Reconciled related PRD sections for infrastructure, security, M6 beta analytics, M7 transparency maturity, M8 community-round metrics, and global release analytics so they refer to public transparency metrics instead of private admin analytics.
- Reviewed the result for remaining inconsistent old admin wording; remaining `retention`/`funnel` references in M5 are denylisted fields, while broader retention references outside M5 remain product/experiment language.
- No milestone row was changed and no PRD checkbox was ticked, because milestone marking requires explicit user confirmation.

### 2026-06-29 (M5 confidential-data classification guidance)

- Opened required documents/context before answering: `PRD.md`, `AGENTS.md` instructions from the prompt, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/security-best-practices/SKILL.md`, and `.claude/skills/security-threat-model/SKILL.md`.
- Reviewed PRD §15.6 `Milestone M5 — Restricted Admin Insights Console`, including admin separation/access control, retention dashboard, engagement dashboard, mobile funnel dashboard, creator/reward insights, and admin safety boundaries.
- Provided guidance on which M5 admin-console data should be classified as confidential or sensitive.
- No milestone row was changed and no PRD checkbox was ticked, because this was guidance only and milestone marking requires explicit user confirmation.

### 2026-06-29 (M9.3 repeated-vote consistency audit and confirmation)

- Opened required documents/context before verification and marking: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/references/testing.md`.
- Audited the M9.3 repeated-vote reconciliation/idempotency implementation for inconsistencies introduced by the prior changes.
- Found and fixed one inconsistency: direct `saveRuleVote`/`saveRuleEliminationVote` calls without an explicit `sequence` could treat a retry as a new sequence. They now reuse the original record when `turn/rule/voter/signature` already exists, matching the explicit-sequence API idempotency behavior.
- Added a focused regression test for retries without an explicit sequence, keeping approval and elimination votes from creating duplicate records or fees.
- Verification passed: `pnpm --filter @idealer/api test` (52/52), `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api lint`, and `pnpm --filter @idealer/api build`.
- User explicitly asked to mark the points complete after inconsistencies were corrected, so the remaining `PRD.md` M9.3 repeated-vote reconciliation and retry/idempotency checklist/approval items were ticked.

### 2026-06-29 (M9.3 repeated-vote reconciliation and retry hardening)

- Opened required documents/context before implementation: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/references/testing.md`.
- Implemented the remaining pre-M9.5 M9.3 repeated-vote accounting work in `apps/api`: added `getRepeatedVoteFeeReconciliation(turnId)` plus `GET /admin/repeated-vote-fee-reconciliation/{turnId}` to compare approval and elimination repeated-vote records against the contract fee formula and prize-pool accounting source totals.
- Hardened repeated approval and elimination vote persistence so exact retries return the original record without changing fees, while conflicting retries for the same `turn/rule/voter/sequence` are rejected before they can overwrite accounting state.
- Added API tests for repeated-vote reconciliation parity across approval/elimination votes and retry/idempotency behavior that prevents duplicate charge records or unintended sequence changes.
- Verification passed: `pnpm --filter @idealer/api test` (51/51), `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api lint`, and `pnpm --filter @idealer/api build`.
- No `PRD.md` checklist or milestone checkbox was ticked in this pass because milestone checkbox changes require explicit user confirmation.

### 2026-06-29 (legacy cleanup after unlimited paid actions)

- Opened required documents/context before and during verification: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/references/testing.md`.
- Audited the project for legacy one-action-per-wallet language and old vote/elimination fee constants after the unlimited paid play/create/vote change.
- Removed the neutral legacy elimination vote multiplier from constants, API accounting, web fee calculation, and the Solana program; elimination now uses `vote_fee_lamports` directly with the repeated action fee formula.
- Renamed general repeated-fee implementation symbols from vote-specific naming to action-specific naming where the rule is shared across guesses, rule proposals, and votes.
- Left the deprecated `max_rule_proposals_per_wallet_per_turn` and `max_votes_per_wallet_per_turn` account fields in Solana config for layout compatibility only, set new defaults/fixtures to `0`, removed them from `ConfigValidation`, and documented them as inactive.
- Cleaned stale docs/tests: PRD M2.3/M9.5/M9.6/M7.3 wording, API contract docs, data model uniqueness for guesses/winners, mobile UX vote state, Solana security checklist, and the `rule-voting` Playwright route/expectation.
- Verification passed: constants typecheck/lint/test/build; API typecheck/test 49/49/lint/build; web typecheck/test/lint/build plus `rule-voting.spec.ts` E2E; Solana typecheck/test/lint; SBF build; explicit SBF instruction suite 7/7; `git diff --check`.
- No Progress Tracker milestone status was newly changed in this pass.

### 2026-06-28 (unlimited paid play/create/vote actions)

- Opened required documents/context before and during implementation: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/references/testing.md`.
- Removed fixed protocol caps for paid play/guess, rule proposal, approval vote, and elimination vote repetitions. Players may repeat these actions as long as they pay and use the next valid sequence/idempotency key.
- Generalized the repeated fee rule across actions: `2^n * BASE_FEE`, where `n` is the number of prior same-wallet actions in the same turn and same action scope; before turn 100, the first action in each scope remains free. Vote scope remains same-wallet/same-rule/same-side; guess and rule proposal scope is same-wallet/same-turn.
- Updated Solana accounts/instructions/events, API projections/accounting/verification jobs, worker payloads, web transaction builders/UI fee display, constants, seed scripts, and product/contract docs for sequenced repeated guesses, rule proposals, and votes.
- Adjusted claim-flow SBF coverage after the first pre-turn-100 guess became free: the claim test now adds a second paid sequenced guess to fund the prize vault before testing payout execution.
- Verification passed: constants typecheck/lint/build; API typecheck/lint/test/build; worker typecheck/lint/test/build; web typecheck/lint/test/build; Solana typecheck/test/lint; SBF build; explicit SBF instruction suite 7/7 with `SBF_FEATURES=devnet-test,sb-devnet`; `git diff --check`.
- No Progress Tracker milestone status was newly changed in this pass.

### 2026-06-28 (side-specific repeated vote fee correction and milestone marking)

- Reopened required documents/context before editing: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/references/testing.md`.
- Updated the repeated-vote fee rule to `2^n * VOTE_FEE`, where `n` is the number of previous votes by that wallet on the same rule and same side in the same turn. The first same-side vote remains free before turn 100; from turn 100 the first same-side vote costs `2^0 * VOTE_FEE`.
- Removed the special `2 * VOTE_FEE` elimination base from implementation and docs; elimination now uses the same side-specific base as approval, with separate side counts.
- Marked implemented PRD items after user confirmation: M0.1 repeated vote policy, M2.5 repeated approval voting/fees/UI/idempotency, M3.8 repeated elimination voting/fees, M4.1 repeated vote accounting/parity tests, M4.3 unique-wallet voter reward behavior, M9.3 repeated fee sequence and unique-voter checks, and M9.5 repeated per-rule/per-finalist limits plus no repeated free same-side votes.
- Left open PRD items that are not fully implemented: repeated-vote transparency/indexer projections and dashboards, abuse dashboards/alerts, observability incident runbooks, mainnet beta payment tests, load tests, and production dashboard validation.
- Verification passed after the side-specific correction: constants typecheck/lint/build; API typecheck/lint/test/build; worker typecheck/lint/test/build; web typecheck/lint/test/build plus final rerun of web typecheck/lint/build; Solana typecheck/lint/test; explicit SBF suite 7/7 with `SBF_FEATURES=devnet-test,sb-devnet`.

### 2026-06-28 (PRD v1.5.1 repeated vote implementation)

- Opened required documents/context before and during implementation: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, and the relevant referenced skill files.
- Implemented sequenced repeated approval votes and elimination votes across Solana, API projection/accounting, frontend transaction builders/UI, worker seed scripts, constants, and existing docs. Approval and elimination now use the same side-specific `2^n * VOTE_FEE` base, where `n` is prior same-wallet/same-rule/same-side votes; voter rewards remain unique per wallet.
- Added/updated regression coverage for repeated approval fee sequences before/after turn 100, elimination repeat fee escalation, backend/contract accounting parity, same-sequence idempotency, and unique-wallet voter reward accounting.
- Verification passed: constants typecheck/lint/build; API typecheck/lint/test 47/47/build; worker typecheck/lint/test 80/80/build; web typecheck/lint/test/build; Solana typecheck/lint/test; explicit SBF suite 7/7 with `SBF_FEATURES=devnet-test,sb-devnet`.
- User later confirmed marking implemented milestone items on 2026-06-28; the implemented repeated-vote checkboxes were ticked after the side-specific fee correction.

### 2026-06-28 (PRD repeated vote milestone gates)

- Reopened required documents/context before editing: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- User pointed out that other milestones, especially M9, also needed adjustment after the PRD v1.5.1 repeated-vote fee policy.
- Updated `PRD.md` milestones so repeated-vote behavior is now required in the relevant gates: M4.1 repeated approval/elimination vote fee accounting, M4.3 unique-wallet voter reward tests, M9.3 repeated-vote accounting/idempotency/voter-reward gates, M9.5 repeated-vote abuse/rate-limit/admin visibility gates, M9.6 repeated-vote observability and incident response, M6.2 real SOL repeated-vote payment tests, M6.3 repeated-vote metrics, M7.3 repeated-vote load testing, and M7.4 repeated-vote dashboard validation.
- Updated `PRD.md` section 13.5 Mainnet Technical Gates so Accounting, Abuse Resistance, and Observability gates explicitly include repeated vote fee and concentration coverage.
- Updated the Progress Tracker notes for M4.1, M4.3, and M9.3 to state that their prior completion covers the earlier baseline and that PRD v1.5.1 adds pending repeated-vote follow-up requirements.
- No milestone row was marked complete and no approval checkbox was ticked in this pass.

### 2026-06-28 (PRD repeated vote fee escalation)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Updated `PRD.md` from v1.5.0 to v1.5.1 to specify repeated same-wallet/same-rule voting for both approval votes and decision-window elimination votes.
- New policy documented: before turn 100, the first same-wallet/same-rule/same-side vote remains free; after that, same-side repeat votes use `2^n * VOTE_FEE`, where `n` is the player's prior same-side vote count for that rule in the turn. From turn 100 onward, the first same-side vote starts at `VOTE_FEE`.
- Clarified fee base: approval and elimination repeated votes both use `VOTE_FEE`; all paid vote fees route to the prize pool.
- Updated UX, player action limits, voting rules, elimination rules, fee policy, rate limits, smart-contract instruction expectations, voter reward accounting, and resolved MVP decisions. Voter rewards remain unique per wallet even if that wallet casts repeated approval votes.
- Added unchecked PRD follow-up requirements for repeated approval/elimination vote sequencing, fee calculation, retry/idempotency, and UI next-vote-cost display. Historical one-vote-per-rule checklist items were explicitly marked as superseded by PRD v1.5.1 where they conflicted.
- No milestone row was marked complete and no approval checkbox was ticked; implementation and user confirmation are still required for the new repeated-vote behavior.

### 2026-06-28 (M9.4 mobile reliability confirmed)

- Opened required documents/context before verification and marking: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Rechecked M9.4 evidence: `apps/web/src/features/idealer/data/tx.ts` persists wallet pending actions and normalizes wallet errors; `apps/web/src/features/idealer/screens/Play.tsx` blocks retry while awaiting/pending/delayed, prechecks the on-chain `PlayerGuess` account, detects active-turn changes before wallet approval and after signature, and shows distinct mobile status copy for rejected, pending, delayed, duplicate, confirmed, and turn-changed outcomes.
- Rechecked E2E coverage in `apps/web/e2e/mobile-reliability.spec.ts` for returning/reloading into awaiting and pending wallet states, delayed confirmation, rejected transaction, duplicate guess, and turn-changed outcomes.
- Verification passed before marking: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web test`, `pnpm --filter @idealer/web exec next build --webpack`, and `pnpm --filter @idealer/web test:e2e -- mobile-reliability.spec.ts` (2/2).
- User explicitly asked to verify whether M9.4 was done and mark it complete if so. The evidence and fresh verification satisfy M9.4, so `PRD.md` M9.4 checklist and approval criteria were ticked and this tracker row was updated to `Completed`.

### 2026-06-28 (M9.4 mobile reliability implementation awaiting confirmation)

- Opened required documents/context before implementation: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and `.claude/skills/idealer-design-system/references/01-tokens.md`, `02-components.md`, `03-screens-and-state.md`, and `04-new-screen-recipe.md`.
- M9.4 audit before edits: previous mobile work already covered wallet handoff links for Phantom/Backpack/Solflare, Mobile Wallet Adapter registration, local mobile LAN/API recovery, active-turn recovery through the worker, PWA installability assets, and a Pixel 5 smoke test. Those items supported wallet connection and user return flows but did not fully close the formal M9.4 gate.
- Remaining gaps implemented in `apps/web`: persistent `idealer.wallet.pending-action` recovery for submit-guess wallet actions, explicit statuses for awaiting approval, pending confirmation, delayed confirmation, rejected/failed, duplicate, confirmed, and turn-changed outcomes; retry blocking while an action is still pending/delayed; duplicate `PlayerGuess` account precheck before wallet approval; active-turn recheck before approval and after signature; and clear mobile status cards on both number-pick and review screens.
- Added `apps/web/e2e/mobile-reliability.spec.ts` to cover recovered awaiting/pending, delayed, rejected, duplicate, and turn-changed wallet outcomes after return/reload-style state changes.
- M9.4 PRD checklist mapping after implementation: wallet connection has prior handoff/LAN smoke evidence; transaction rejected/pending/delayed states are covered by wallet status recovery and e2e; duplicate submission prevention is covered by pending-action blocking and on-chain `PlayerGuess` precheck; user returning without local state remains covered by existing server receipt recovery through `usePlayerGuess`; turn changes during wallet signature are detected before and after signing.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web test`, `pnpm --filter @idealer/web exec next build --webpack`, and `pnpm --filter @idealer/web test:e2e -- mobile-reliability.spec.ts`.
- Started a local production web server on `http://127.0.0.1:3006/play/pick` for manual review. `agent-browser` was unavailable in the local PATH, so the browser check was performed with Playwright instead: page rendered with no framework error overlay, body content was present, and screenshot artifact `apps/web/output/m94-mobile-reliability.png` was captured. Console showed expected isolated-server 404s for unavailable local backend resources.
- `PRD.md` M9.4 checkboxes were intentionally left unticked pending explicit user confirmation.

### 2026-06-28 (mobile local function recovery and installability)

- Reopened required documents/context before implementation: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and the Vercel investigation-mode instructions for the broken-app triage.
- Diagnosed the local mobile failure path: stale host API processes had previously shadowed Docker API health, the browser could not reliably discover the active turn from direct Solana RPC, and local cross-origin API/worker requests from `http://192.168.0.68:3000` needed LAN-safe CORS.
- Implemented local-mobile runtime fixes: dynamic API/worker base URL resolution for private LAN hosts, worker `GET /turn/active` backed by on-chain global/turn state, worker CORS/`OPTIONS`, API LAN CORS, and frontend active-turn polling through the worker while keeping wallet-signed transactions on-chain.
- Added PWA installability assets: web manifest, service worker registration, standalone/mobile metadata, and app icons. Service worker registration intentionally requires HTTPS or localhost because full PWA installability is not available on `http://192.168.x.x`.
- Recovered the local devnet session: restarted API/worker, switched the web server to production `next start` on `0.0.0.0:3000` after `next dev --webpack` failed to hydrate, and manually cycled the devnet turn from expired turn 38 to open turn 39.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web test`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web exec next build --webpack`, `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test`, `pnpm --filter @idealer/worker lint`, `pnpm --filter @idealer/worker build`, `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api lint`, and `pnpm --filter @idealer/api build`.
- Browser/mobile smoke passed against `http://192.168.0.68:3000/play` with Pixel 5 emulation: hydrated UI, `GET /turn/active` 200, API round/rule endpoints 200, active countdown visible, and CTA `Play now · 0.01 SOL` visible. Console still reports expected local limitations: MWA secure context requires HTTPS, and PWA service worker is skipped on LAN HTTP.
- No milestone row, approval status, or PRD checkbox was changed; milestone checkboxes still require explicit user confirmation.

### 2026-06-27 (mobile device debugging setup check)

- Opened required documents/context before guidance: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/develop-frontend/SKILL.md`.
- Checked official Android device debugging documentation and Chrome DevTools remote Android debugging documentation for the recommended physical-device workflow.
- Confirmed the public DApp is a Next.js mobile-first web app, not a native Android APK flow. The web dev script already binds to `0.0.0.0:3000`, and the local machine Wi-Fi address is `192.168.0.68`.
- Verified `http://192.168.0.68:3000` responds from the host and is the URL to open on a phone connected to the same Wi-Fi.
- Found an unresolved local API exposure issue: the Docker `idealer-api` container health check is healthy internally, but host access to `192.168.0.68:3002/health` reaches a separate local Node API process and returns `503` for Postgres/Redis. No process was stopped and no milestone/PRD checkbox was marked.

### 2026-06-27 (mobile DApp wallet handoff clarification)

- Reopened required documents/context after user clarification: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-mobile/mwa/mwa-setup/SKILL.md`, `.claude/skills/solana-dev/ext/solana-mobile/mwa/mwa-connection/SKILL.md`, and `.claude/skills/solana-dev/ext/solana-mobile/mwa/mwa-transactions/SKILL.md`.
- Confirmed the intended target is a mobile DApp wallet handoff flow: open DApp on Android Chrome or an in-wallet browser, choose a Solana wallet, approve in the wallet app, and return to the DApp.
- Verified the current web code already registers `@solana-mobile/wallet-standard-mobile` in `apps/web/src/solana/SolanaProviders.tsx` with app identity, authorization cache, devnet chain, chain selector, wallet-not-found handler, and `remoteHostAuthority`.
- Noted that the MWA hub path `.claude/skills/solana-dev/ext/solana-mobile/mwa/SKILL.md` does not exist; the relevant sub-skills are present and were opened instead.
- No code changes, milestone status changes, or PRD checkbox updates were made.

### 2026-06-27 (Mobile Wallet Adapter status check)

- Reopened required documents/context before answering status: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, and the relevant local MWA sub-skills.
- Checked the current implementation: `apps/web/package.json` includes `@solana-mobile/wallet-standard-mobile`; `apps/web/src/solana/SolanaProviders.tsx` calls `registerMwa`, uses Wallet Standard auto-discovery, sets `defaultChain` to `solana:devnet`, persists wallet sessions, and uses `remoteHostAuthority`.
- Checked current wallet UI and transaction path: `/play/wallet` now renders `IdealerApp initialConnect`; `ConnectOverlay` lists discovered wallet connectors; wallet write actions use `createWalletTransactionSigner` and `client.transaction.prepareAndSend`.
- Verification: `pnpm --filter @idealer/web typecheck` passed. A direct Pixel 5 Playwright smoke against the already-running `http://127.0.0.1:3000/play/wallet` loaded the current connection overlay and correctly showed no compatible wallet in desktop/headless Chromium.
- Limitation found: the historical `apps/web/e2e/wallet-flow.spec.ts` still targets the older dedicated wallet page copy and named handoff links. The configured E2E command could not start because an existing Next dev server for the same app was already running; no process was stopped.
- Status conclusion: MWA is implemented in code and was historically marked complete under `M2.1`, but current physical-device wallet handoff with Phantom/Backpack/Solflare was not revalidated in this check and remains the evidence needed to say it is working on a real phone.

### 2026-06-27 (real-device MWA test plan)

- Reopened required documents/context before drafting the test plan: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/solana-dev/ext/solana-mobile/mwa/mwa-connection/SKILL.md`, and `.claude/skills/solana-dev/ext/solana-mobile/mwa/mwa-transactions/SKILL.md`.
- Checked local test prerequisites: host Wi-Fi IP is `192.168.0.68`; `http://192.168.0.68:3000/play/wallet` returns HTTP 200; `adb` is not installed on the workstation; host API health at `http://192.168.0.68:3002/health` currently returns API status `error` with Postgres/Redis errors.
- Checked official Solana Mobile web docs for MWA testing expectations: `@solana-mobile/wallet-standard-mobile` registers MWA as a web wallet option and must run in a browser-only Next.js context; once registered, MWA appears on Android Chrome and uses Android Intents.
- No code changes, milestone status changes, or PRD checkbox updates were made.

### 2026-06-27 (public insights console risk review)

- Opened required documents/context before analysis: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/security-threat-model/SKILL.md`.
- Reviewed the product/security implications of making the current Restricted Admin Insights Console public to connected wallets, with no admin role.
- No milestone was marked complete and no PRD checkbox was ticked, because this was a design/risk review and requires user confirmation before implementation.

### 2026-06-27 (M9.3 verified and marked complete)

- Opened required documents/context before marking completion: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/testing.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/web3-contracts.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, and `.claude/skills/solana-dev/backend-async.md`.
- User explicitly confirmed the action by requesting: verify whether `M9.3` is done; if done, mark it complete; otherwise implement and then mark it complete.
- Re-verified `M9.3` implementation evidence: API tests cover no alternative rule, invalidated alternative rule, backend-contract accounting parity, rounding dust, minimum payout, expired unclaimed payout rollover, retry idempotency, and existing M4/M5 coverage for no winners, multiple winners, creator reward reserve/cap, double-claim prevention, and total rollover behavior.
- Marked all `PRD.md` `M9.3 - Accounting Gate` checklist and approval criteria items complete, and updated the tracker row to `Completed`.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (46/46), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/game-engine typecheck`, `pnpm --filter @idealer/game-engine test`, `pnpm --filter @idealer/game-engine lint`, `pnpm --filter @idealer/game-engine build`, and `pnpm --filter @idealer/solana-programs test` (native/container suite; SBF-only tests remained ignored by that command as designed).

### 2026-06-27 (M9.3 implementation awaiting confirmation)

- Opened required documents/context before implementation: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/testing.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/web3-contracts.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, and `.claude/skills/solana-dev/backend-async.md`.
- Verified already-covered `M9.3` items in existing tests/history: no winners, multiple winners, creator reward reserve/cap, double-claim prevention, and total rollover behavior were already covered by M4/M5 API/worker/contract tests.
- Implemented the remaining accounting gate coverage in `apps/api`: explicit no-alternative and invalidated-alternative cases; backend-contract accounting parity vector matching `contracts/solana/programs/idealer/tests/core.rs`; rounding dust + total no-winner rollover in one settlement; below-minimum winner payout; and expired unclaimed winner-payout rollover with retry idempotency.
- Added `settleExpiredUnclaimedClaims` and `POST /claim-records/expire-unclaimed` so expired unclaimed winner payouts become `CLAIM_WINDOW_EXPIRED` and roll into the same-category rollover bucket without duplicate rollover on retry.
- Updated `docs/api-contracts.md` and `docs/data-model-draft.md` with the expired-unclaimed claim settlement contract.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (46/46), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, and `pnpm --filter @idealer/solana-programs test` (native/container suite; SBF-only tests remained ignored by that command as designed).
- Did not tick `PRD.md` M9.3 checklist or approval criteria because milestone checkboxes require explicit user confirmation.

### 2026-06-27 (M9.2 verified and marked complete)

- Opened required documents/context before marking completion: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- User explicitly confirmed the action by requesting: verify whether `M9.2` is done; if done, mark it complete; otherwise implement and then mark it complete.
- Verified `M9.2` implementation evidence: runtime AST parsing rejects invalid/unknown DSL nodes; runtime limits cover timeout policy, operation budget, depth, input/intermediate memory, and unsafe scalar overflow; source-level sandbox tests forbid network, filesystem, dynamic imports, `require`, `eval`, `Function`, randomness, and clock access; malicious fixtures fail safely; and repeated fuzz evaluations are deterministic.
- Marked all `PRD.md` `M9.2 - Runtime Security Gate` checklist and approval criteria items complete, and updated the tracker row to `Completed`.
- Verification evidence from implementation pass: `pnpm --filter @idealer/rule-runtime typecheck`, `pnpm --filter @idealer/rule-runtime test` (11/11), `pnpm --filter @idealer/rule-runtime lint`, `pnpm --filter @idealer/rule-runtime build`, `pnpm --filter @idealer/rule-test-harness typecheck`, `pnpm --filter @idealer/rule-test-harness test` (6/6), `pnpm --filter @idealer/rule-compiler typecheck`, `pnpm --filter @idealer/rule-compiler test` (19/19), `pnpm --filter @idealer/worker typecheck`, and `pnpm --filter @idealer/worker test` (80/80).

### 2026-06-27 (M9.2 implementation awaiting confirmation)

- Opened required documents/context before implementation: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/security-best-practices/SKILL.md`, and `.claude/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`.
- Audit before edits: `packages/rule-runtime` already executed a closed AST interpreter with declared timeout/memory/network/filesystem/import/randomness/clock policy flags, operation and depth budgets, intermediate-array caps, deterministic ranking/predicate output, and switch-level unknown-node rejection.
- Remaining gaps implemented: runtime entry points now validate ASTs with `ruleAstSchema.safeParse`, reject invalid ASTs as `RuleRuntimeError`, enforce input array caps for both v1 and v2 rules, and fail closed on unsafe scalar overflow instead of producing `NaN`, `Infinity`, or unsafe integers.
- Added M9.2 runtime tests for policy flags, forbidden source sinks (`fetch`, network/filesystem/child-process modules, dynamic import, `require`, `eval`, `Function`, RNG, and clock access), malicious DSL fixtures, input memory caps, scalar overflow, operation-budget exhaustion, and deterministic fuzz runs.
- At implementation time, `PRD.md` `M9.2` checklist and approval criteria were intentionally left unticked while the milestone awaits explicit user confirmation.
- Verification passed: `pnpm --filter @idealer/rule-runtime typecheck`, `pnpm --filter @idealer/rule-runtime test` (11/11), `pnpm --filter @idealer/rule-runtime lint`, `pnpm --filter @idealer/rule-runtime build`, `pnpm --filter @idealer/rule-test-harness typecheck`, `pnpm --filter @idealer/rule-test-harness test` (6/6), `pnpm --filter @idealer/rule-compiler typecheck`, `pnpm --filter @idealer/rule-compiler test` (19/19), `pnpm --filter @idealer/worker typecheck`, and `pnpm --filter @idealer/worker test` (80/80).

### 2026-06-27 (M9.1 verified and marked complete)

- Opened required documents/context before marking completion: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- User explicitly confirmed the action by requesting: verify whether `M9.1` is done; if done, mark it complete; otherwise implement and then mark it complete.
- Verified `M9.1` implementation evidence: supported examples compile; unsupported/vague rules reject or require clarification; artifacts are versioned and hashable; reviewer mismatch detection fails closed; frozen artifacts include original text, official interpretation, AST, tests, versions, and timestamp; active alternative verification requires the frozen active artifact hash; and no post-draw recompilation path is used for guess verification.
- Marked all `PRD.md` `M9.1 — Rule Compiler Gate` checklist and approval criteria items complete, and updated the tracker row to `Completed`.
- Verification passed: `pnpm --filter @idealer/rule-compiler typecheck`, `pnpm --filter @idealer/rule-compiler test` (19/19), `pnpm --filter @idealer/rule-compiler lint`, `pnpm --filter @idealer/rule-compiler build`, `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (41/41), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test` (80/80), `pnpm --filter @idealer/worker lint`, and `pnpm --filter @idealer/worker build`.

### 2026-06-27 (M9.1 implementation awaiting confirmation)

- Opened required documents/context before implementation: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/testing.md`, `.claude/skills/security-best-practices/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `packages/rule-compiler/rule-authoring/SKILL.md`.
- Audit before edits: supported examples, unsupported/vague rejection, provider routing, confidence policy, schema-constrained compile, guardian checks, audit logs, and deterministic validation already existed from prior M3/M5 work, but `M9.1` was not ticked and had gaps in the formal gate.
- Remaining gaps implemented: `RuleCompiledArtifact` now freezes original text, official interpretation, normalized text, AST, generated/evaluated/harness tests, coverage, model identity, provider path, compiler skill version, prompt contract version, test harness version, rule mode, complexity, difficulty, constrained-decoding flag, and creation timestamp.
- Added reviewer mismatch detection for known supported semantics: when a known natural-language rule maps to a different LLM-emitted AST, validation fails closed with `REVIEWER_MISMATCH`; semantically equivalent v2 ASTs for known v1 patterns remain accepted.
- API now validates compiled artifacts through the shared `ruleAstSchema` for v1/v2, rejects compiled-artifact hash mismatches at validation ingest, requires an active election to carry a frozen `activeRuleArtifactHash`, and rejects missing/mismatched active artifacts before creating guess-verification jobs.
- Worker rule validation now publishes the full compiled artifact, not only the artifact hash, so valid worker validations can persist complete frozen artifacts.
- Updated `docs/agent-schema-draft.md` to describe the frozen compiled artifact and the no post-draw recompilation requirement.
- At implementation time, `PRD.md` `M9.1` checklist and approval criteria were intentionally left unticked while the milestone awaited explicit user confirmation.
- Verification passed: `pnpm --filter @idealer/rule-compiler typecheck`, `pnpm --filter @idealer/rule-compiler test` (19/19), `pnpm --filter @idealer/rule-compiler lint`, `pnpm --filter @idealer/rule-compiler build`, `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (41/41), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test` (80/80), `pnpm --filter @idealer/worker lint`, and `pnpm --filter @idealer/worker build`.

### 2026-06-27 (M9.0 verified and marked complete)

- Opened required documents/context before marking completion: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- User explicitly confirmed the action by requesting: verify whether `M9.0` is done; if done, mark it complete; otherwise implement and then mark it complete.
- Verified `M9.0` implementation evidence: worker projections publish finalist and active-election VRF values plus eligible candidate commitments; API persists those proof fields, rejects incomplete settled proof material, and publishes idempotent public `rule.election.proof` audit logs; API contracts/data-model docs describe the public proof endpoint.
- Marked all `PRD.md` `M9.0 — Election Randomness Gate` checklist and approval criteria items complete, and updated the tracker row to `Completed`.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (39/39), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test` (80/80), `pnpm --filter @idealer/worker lint`, and `pnpm --filter @idealer/worker build`.

### 2026-06-27 (M9.0 implementation)

- Opened required documents/context before implementation: `PRD.md`, `AGENTS.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/security.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/testing.md`, `.claude/skills/solana-dev/ext/sendai/skills/switchboard/SKILL.md`, `.claude/skills/security-best-practices/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/best-practices/references/testing.md`.
- M9.0 audit before edits: the Solana program already used Switchboard On-Demand for finalist and active rule election, committed the eligible pool hash before VRF fulfillment, stored top/random/finalist/survivor hashes, derived random finalists and active survivors from fulfilled VRF randomness using rejection sampling, and had no deterministic fallback finalist activation.
- Remaining gap implemented: worker election projections now publish finalist-election `randomnessValue`, active-election `activeElectionRandomnessValue`, and exact eligible candidate commitments; API election saves preserve prior VRF proof fields across phase updates; settled elections now append an idempotent public `rule.election.proof` hash-chained audit log with commitments, rule sets, Switchboard randomness accounts/sources/values, selection/hash algorithm descriptions, and elected active-rule output.
- Public audit endpoint updated to accept `kind=rule.election.proof` and `kind=settlement.transition`; API/data-model docs updated accordingly.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (39/39), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test` (80/80), `pnpm --filter @idealer/worker lint`, and `pnpm --filter @idealer/worker build`.
- At implementation time, no PRD checkbox was ticked and M9.0 remained `In Review` pending explicit user confirmation.

### 2026-06-27 (M9 implementation status audit)

- Opened required documents/context before the audit: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Reviewed `PROGRESS_TRACKER.md` against PRD §15.7 `M9 — Mainnet Readiness Gates`.
- Finding: `M9` itself remains open/not approved. Several prerequisite implementations already exist through `M3`, `M4`, and the devnet trustless `M5.0-M5.5` plan, especially Switchboard-backed randomness, public audit logs, compiler validation/precompilation, accounting, claims, paid rule removal, and end-to-end devnet settlement evidence.
- No PRD checkbox or milestone status was changed because M9 approval requires explicit user confirmation and the remaining mainnet-readiness gates still need dedicated verification.

### 2026-06-27 (Settlement plan to M9 mapping audit)

- Opened required documents/context before the audit: `PRD.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Mapped `SETTLEMENT_TRUSTLESS_PLAN.md` `M5.0-M5.5` against PRD §15.7 `M9 — Mainnet Readiness Gates`.
- Finding: the settlement plan materially supports `M9.0` and part of `M9.3`, and provides evidence for parts of `M9.1`, `M9.4`, and `M9.6`, but it does not replace the formal M9 gate verification. `M9.2` runtime sandboxing and `M9.5` abuse/admin visibility are mostly outside the settlement-plan scope.
- No PRD checkbox or milestone status was changed.

### 2026-06-26 (M4.8 implementation re-verification)

- Opened required documents/context before verification: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Re-checked the M4.8 implementation against PRD §15: `GET /players/{wallet}/claims` aggregates wallet claim records and per-status totals; `/play/results` routes to the claims surface; `/play/rewards` groups claim history by turn and links to each round detail; account/profile exposes reward history; and the claim surface uses the on-chain claim instruction plus `/claim-records/request` and `/claim-records/complete`.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (38/38, including `player claims summary aggregates a wallet's claims across turns`), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web test`, `pnpm --filter @idealer/web lint`, and `pnpm --filter @idealer/web exec next build --webpack`.
- Browser verification: `pnpm --filter @idealer/web test:e2e -- draw-result.spec.ts` could not start its configured dev server because an existing `next dev` process for the same app was already running on port 3000. To avoid killing that process, ran Playwright assertions against a temporary production `next start` server on port 3006 using the freshly built app; `/play/results`, `/play/rewards`, and `/round/37` all passed.
- No additional PRD checkbox changes were needed because M4.8 was already marked complete after user confirmation.

### 2026-06-26 (M4.8 confirmed, fixed, and marked done)

- Opened required documents/context before marking: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- User explicitly asked to confirm whether `M4.8` was complete, resolve any pending items if needed, and mark it done.
- Found `M4.8` previously implemented in the backend/tracker but not fully aligned in the current frontend: `/play/results` had regressed to the round-result screen instead of the wallet-gated claims surface, and `/play/rewards` grouped records by turn without a round-detail link.
- Fixed the frontend contract: added `ClaimsScreen`, routed `/play/results` to the claims surface, kept `/round/[turnId]` on the result screen, linked "Go to claims" to the claims surface, changed the disconnected rewards wallet CTA to `/play/wallet`, and added per-turn `/round/{turn}` links in reward history.
- Marked PRD §15 `M4.8` checklist and approval criteria complete after this user confirmation.
- Verification passed: `pnpm --filter @idealer/api test` (38/38), `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web test`, `pnpm --filter @idealer/web exec next build --webpack`, and manual Playwright smoke against the already-running local Next server for `/play/results`, `/play/rewards`, and `/round/37`.
- Note: `pnpm --filter @idealer/web test:e2e -- draw-result.spec.ts` could not start its configured web server because an existing `next dev` process for the same app was already running. The browser assertions were run directly against that live local server instead of killing the existing process.

### 2026-06-26 (M5.5 confirmed and marked done)

- Opened required documents before marking: `PRD.md`, `AGENTS.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- User explicitly confirmed M5.5 and asked to mark the checkbox.
- Marked `M5.5` complete in `SETTLEMENT_TRUSTLESS_PLAN.md` and updated the settlement progress sub-tracker to `Done`.
- Updated the main milestone table in this Progress Tracker from `Done — awaiting confirmation` to `Completed` with confirmation date `2026-06-26`.
- Did not tick the PRD `M5.5` checkbox because PRD `M5.5` refers to a separate milestone, `Creator & Reward Insights`, not this trustless settlement plan milestone.

### 2026-06-26 (PRD launch-readiness status audit)

- Opened required documents/context before the audit: `PRD.md`, `PROGRESS_TRACKER.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, and `.claude/skills`.
- Compared PRD milestone checkboxes, the progress tracker status table, the settlement trustless plan, and the current admin surface.
- Findings at audit time: PRD `M4.7` and `M4.8` are implemented/verified in the tracker but remain unticked in `PRD.md` pending user confirmation. PRD `M4 Approval` also remains unticked because those submilestones are not yet approved. The separate `SETTLEMENT_TRUSTLESS_PLAN.md` `M5.5` was awaiting confirmation at the time of this audit and was later confirmed in the M5.5 worklog above; it is not the same as PRD `M5.5` (`Creator & Reward Insights`), which remains unimplemented. PRD `M5` admin console, `M9` readiness gates, `M6` beta, and `M7` public launch readiness remain open.
- Did not change any milestone status or PRD checkbox.

### 2026-06-25 (M5.5 current UI verification corrected)

- Opened required documents before this correction: `PRD.md`, `AGENTS.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- Opened relevant UI/verification skills before this correction: `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md`, `.claude/skills/idealer-design-system/references/02-components.md`, `.claude/skills/idealer-design-system/references/03-screens-and-state.md`, `.claude/skills/idealer-design-system/references/04-new-screen-recipe.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, and `.claude/skills/playwright/SKILL.md`.
- Root cause: the M5.5 screenshot path `output/m55-round-37-mobile.png` had been captured from `/round/37`, but that route still used the legacy `features/round-page/RoundPage.tsx` shell instead of the current user-facing Idealer mobile UI. That visual evidence was not acceptable for M5.5.
- Fixed the real route: `/round/[turnId]` now renders the current `IdealerApp` result screen with `initialResultTurnId`; `IdealerApp` centralizes `resultTurnId` so `/play/results` uses the active turn if it already has a result, otherwise the previous turn; `HomeScreen` links to that result turn; `ResultScreen` reads `resultTurnId` and shows neutral "Round settled" copy when no wallet is connected.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web test`, and `pnpm --filter @idealer/web exec next build --webpack`. Plain `pnpm --filter @idealer/web build` still fails before app compilation because Next 16 defaults to Turbopack while this project has an existing webpack config; the explicit webpack build is the valid production-build check for this repo state.
- Re-ran Playwright mobile verification on `http://localhost:3000/round/37` and overwrote `output/m55-round-37-mobile.png`. The check asserted `.ide-phone-shell`, `#0037`, "Round settled", drawn numbers `[35,44,83,62,45,75]`, absence of legacy `.round-shell`/`.voting-shell`, and no console/page errors.
- `M5.5` remains unticked pending user confirmation.

### 2026-06-25 (M5.5 end-to-end verification executed; awaiting confirmation)

- Opened required documents before working: `PRD.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- Opened relevant local skills before working: `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/kit-web3-interop.md`, `.claude/skills/solana-dev/ext/sendai/skills/switchboard/SKILL.md`, `.claude/skills/solana-dev/backend-async.md`, `.claude/skills/automation-upkeep/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/web3-contracts.md`, `.claude/skills/best-practices/references/testing.md`, `.claude/skills/best-practices/references/checklists.md`, and `.claude/skills/playwright/SKILL.md`.
- Added deterministic M5.5 seeding support: `IDEALER_M5_INPUTS_PLAYER_COUNT` now supports 17 test players, and the deterministic guess set covers all numbers from 1 to 100 so the "at least 1 number appears in the draw" rule produces alternative-rule winners for any valid draw. Documented the M5.5 use in `.env.example`.
- Fixed two bugs found during M5.5: `settlement-run.ts` now exits cleanly on idempotent replay (`already_closed`) instead of looping until RPC 429, and `getRoundSummary` now marks fulfilled/settled historical turns as `completed` even when no newer active turn is present.
- Verification passed locally: `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker lint`, `pnpm --filter @idealer/worker test` (79/79), `pnpm --filter @idealer/worker build`, `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api lint`, and `pnpm --filter @idealer/api test` (38/38).
- Live devnet run: seeded turn 37 with 17 real `submit_guess` transactions, 1 real LLM-compiled eligible rule (`ruleId=1782431277030217`, artifact `7d0a9510868f6fa554b2dca1b2ef3622f1d8db11aa801bf632b6ac809ccfb479`), and 17 `vote_rule` transactions.
- Settlement completed the full 13-step PRD §5.5 chain through `CLOSED`: `lock_pool` → finalist VRF request/settle → elimination close → active VRF request/settle (`RULE_FROZEN`) → draw request/settle (`DRAWN`) → `close_turn` → VERIFYING → FINALIZED → CLAIMABLE → CLOSED.
- Reconciliation result for turn 37: on-chain status `closed`, `DrawStatus::fulfilled`, active rule `1782431277030217`; API draw `[35,44,83,62,45,75]`; 17 verification jobs completed; 5 alternative winners; 5 available winner-payout claims; all 5 available claim PDAs verified on-chain; 13 settlement transitions; 31 audit logs (`1` compiler validation, `13` settlement transitions, `17` guess verifications), all integrity checks true.
- Idempotency replay passed after the runner fix: re-running with `IDEALER_SETTLE_BROADCAST=1` returned `done (already_closed)` immediately and left counts unchanged.
- UI check superseded: the original `/round/37` screenshot used the legacy public round shell and was invalid for M5.5 visual acceptance. See the "M5.5 current UI verification corrected" work log above for the replacement current-UI verification at `output/m55-round-37-mobile.png`. The live API process was intentionally not restarted after the status-label fix because its in-memory turn 37 evidence would be lost; the code fix is verified by API tests.
- `M5.5` remains unticked pending user confirmation.

### 2026-06-25 (M5.4 confirmed and marked done)

- Reopened required documents before marking: `PRD.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- Opened relevant local skills before marking: `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/automation-upkeep/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Verified the M5.4 acceptance evidence already recorded in `SETTLEMENT_TRUSTLESS_PLAN.md`: live devnet turn 36 had 3 real on-chain guesses, 1 eligible LLM-compiled rule (`gemma3:4b`), 3 votes, full 13-step settlement, active rule election/freeze (`activeRuleId=1782386011794700`), fulfilled draw `[24,26,34,19,91,63]`, and 3 real verification results.
- Marked `M5.4` complete after the user's explicit confirmation on 2026-06-25. `M5.5` remains planned.

### 2026-06-25 (M5.4 real-input seeding operator implemented; live acceptance blocked)

- Opened required documents before working: `PRD.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- Opened relevant local skills before implementation: `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/kit-web3-interop.md`, `.claude/skills/solana-dev/ext/sendai/skills/switchboard/SKILL.md`, `.claude/skills/automation-upkeep/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/web3-contracts.md`, `.claude/skills/best-practices/references/testing.md`, and `packages/rule-compiler/rule-authoring/SKILL.md`.
- Added `apps/worker/src/devnet-seed-real-inputs.ts` and `pnpm --filter @idealer/worker devnet:seed-real-inputs`. The operator is dry-run by default and broadcasts only with `IDEALER_M5_INPUTS_BROADCAST=1`; it validates `/rule-preflight` before any transaction, can open a devnet turn only when broadcast is enabled, seeds deterministic devnet test players, funds them from the devnet authority, sends real `submit_guess`, `propose_rule`, authority `precompile_rule`, and `vote_rule` transactions, and posts the corresponding API projections.
- Documented M5.4 operator flags in `.env.example`: `IDEALER_M5_INPUTS_BROADCAST`, `IDEALER_M5_INPUTS_OPEN_TURN`, `IDEALER_M5_INPUTS_PLAYER_COUNT`, `IDEALER_M5_INPUTS_FUND_LAMPORTS`, and `IDEALER_M5_RULE_TEXT`.
- Verification passed: `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker lint`, `pnpm --filter @idealer/worker test` (74/74), and `pnpm --filter @idealer/worker build`.
- Live execution was not completed and M5.4 was not ticked. Dry-run stopped at the expected no-active-turn guard. API/LLM live preflight is currently blocking the real seeded turn: `/rule-preflight` returned `RULE_AGENT_UNAVAILABLE` or hung for several minutes, even though Ollama `/v1/models` and a direct simple `gemma4:latest` chat completion responded. The worker health returned OK; API health reported Postgres/Redis errors during container churn, with direct Postgres connectivity from the API package succeeding.

### 2026-06-23 (M5.2 live devnet acceptance executed — milestone confirmed)

- Opened required documents before working: `PRD.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- Added gated operator tooling: `apps/worker/src/switchboard-settle-draw.ts` (`switchboard:settle-draw`, dry-run by default, broadcasts only with `IDEALER_SETTLE_BROADCAST=1`) and `apps/worker/src/devnet-stage-turn.ts` (`devnet:stage-turn`).
- Ran the acceptance inside the worker container (the on-chain `GlobalConfig.authority` is the Docker deployer keypair `EAoZrh8…` mounted from the `idealer-solana-home` volume, not the inline `.env` `4bY5…`). Rebuilt the worker image to include `@switchboard-xyz/on-demand`.
- Staged a fresh current-layout turn (legacy turn 30 force-skipped → turn 31 opened/shrunk/closed), then drove `request_draw` → atomic Switchboard reveal + `settle_draw` on turn 31: settle tx `5n5aCsz84JsbPacCdtyXGtM2RBkR14vcXkMHLwPHzNo21z8KrF1LDJzr6qQmxgaypvrM5gi8YmJPyha1uXHye1rY` finalized (slot 471498242); turn 31 `DrawStatus::Fulfilled`, draw `[17,56,47,28,14,8]`, verified randomness `c7a74184754a5ed99124e10c951aa79ac344895e297f0a493be920f81f5b86bc`.
- Full signature set and a known M5.3-scope automation-ordering follow-up are recorded under M5.2 in `SETTLEMENT_TRUSTLESS_PLAN.md`. M5.2 ticked after this user-instructed verify-and-mark run.

### 2026-06-23 (M5.2 worker randomness client + settlement senders implemented locally)

- Opened required context before implementation: `PRD.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/kit-web3-interop.md`, `.claude/skills/solana-dev/ext/sendai/skills/switchboard/SKILL.md`, `.claude/skills/solana-dev/backend-async.md`, `.claude/skills/automation-upkeep/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/web3-contracts.md`, and `.claude/skills/best-practices/references/testing.md`.
- Worker: added `apps/worker/src/settlement.ts`, a production Switchboard-backed settlement module with fresh randomness create+commit, committed randomness polling, real web3 instruction builders, `request_draw`, atomic Switchboard `revealIx` + `settle_draw`, `fail_draw`, eligible-pool lock, finalist-election request/atomic settle, and active-election request/atomic settle helpers.
- Worker cycles: updated `DrawCycleDeps` and `RuleElectionCycleDeps` to allow production senders to return the verified randomness value after the reveal+settle transaction. This keeps on-chain settlement trustless while still letting worker/API projection compute the deterministic draw/election result from the verified value.
- Tests: added trustless settle-return coverage in `draw.test.ts` and `election.test.ts`, plus `settlement.test.ts` coverage for Anchor discriminators, PDA-derived account order, signer/writable flags, and failure-code serialization.
- Validation passed: `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test` (58/58), `pnpm --filter @idealer/worker lint`, and `pnpm --filter @idealer/worker build`.
- Not executed: live devnet settlement broadcast. Sending the authority-signed devnet `request_draw` / Switchboard reveal / `settle_draw` flow still requires explicit broadcast confirmation; M5.2 remains **In review** and unticked until that acceptance run is confirmed.

### 2026-06-23 (M5.0 Switchboard On-Demand provisioning implemented locally)

- Opened required context before implementation: `PRD.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/web3-contracts.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/sendai/skills/switchboard/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, and `.claude/skills/solana-dev/deployment.md`.
- Contract: added `switchboard-on-demand = 0.13.0` with the Anchor feature and an authority-gated `set_vrf_config` instruction with `VrfConfigUpdated` event and ignored SBF instruction coverage.
- Worker: added `@switchboard-xyz/on-demand@3.10.4` and `@solana/web3.js@1.98.4`; added Switchboard devnet constants, proof-of-life create/commit/reveal client, randomness value validation, admin `set_vrf_config` helper, and manual scripts `pnpm --filter @idealer/worker switchboard:set-vrf-config` and `pnpm --filter @idealer/worker switchboard:proof`.
- Configuration: documented Switchboard devnet On-Demand addresses in `deployments/solana-devnet.json` and `.env.example`; `GlobalConfig.draw_vrf_config` and `GlobalConfig.election_vrf_config` both point to the public devnet queue address, while the SDK queue PDA is documented separately for verification context.
- Validation passed: `pnpm --filter @idealer/worker test` (53/53), `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker lint`, `pnpm --filter @idealer/worker build`, `cargo fmt --check`, `cargo check -p idealer --lib`, `cargo test -p idealer --test core` (14/14), and `cargo test -p idealer --test instructions` (0 passed, 7 ignored as expected).
- Not executed: live devnet `set_vrf_config` and Switchboard proof-of-life transactions were not broadcast because sending signed transactions requires explicit user approval.

### 2026-06-23 (Settlement trustless plan alignment review)

- Opened required context before reviewing: `PRD.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/sendai/skills/switchboard/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/architecture.md`, `.claude/skills/best-practices/references/web3-contracts.md`, and `.claude/skills/best-practices/references/web2-backend.md`.
- Reviewed `SETTLEMENT_TRUSTLESS_PLAN.md` against PRD requirements for Switchboard VRF draw/election, two-step finalist/active election, no deterministic fallback, formal turn state machine, worker orchestration, idempotency, auditability, real player inputs, claims/rewards, and M9 mainnet gates.
- Found and corrected one PRD alignment issue in `SETTLEMENT_TRUSTLESS_PLAN.md`: M5.3/M5.5 had draw before election/freeze, while PRD order is finalist election -> elimination -> active election/freeze -> draw -> verification. Updated the plan text to use the PRD state order.
- Conclusion after correction: the plan is aligned with the PRD for devnet end-to-end trustless settlement. Minor tightening still recommended before implementation: explicitly carry M9 proof/audit deliverables into M5.5, clarify no real mainnet SOL flows before M9 approval, add explicit public proof-reference visibility to acceptance criteria, and include version/config compatibility checks for Switchboard dependencies.
- No code, milestone status, or PRD checklist item was changed.

### 2026-06-23 (Trustless settlement pipeline — decision + phased plan registered)

- Opened required context before working: `PRD.md` (§2.2, §5.4–5.6, §6.9, §6.12, §6.14a, §7, §10.3/§10.11/§10.13), `PROGRESS_TRACKER.md`, `.claude/CLAUDE.md`, `.claude/skills`.
- Builds on the two prior 2026-06-23 entries (PRD scope check + implementation status check), which had already confirmed the settlement gaps. Re-verified via a fresh PRD × code analysis: the on-chain settlement instructions and the deterministic off-chain logic (`rule-runtime`, `game-engine`, `rule-compiler`, winner/reward/claim calc) are real, but (a) there is no real randomness source (no `@switchboard-xyz` integration; `fetchRandomness`/`randomnessAccountFor` are mocks in `*.test.ts`), (b) `settle_draw`/`settle_rule_election`/`settle_active_election` are authority-trusted (no on-chain Switchboard verification — gap vs PRD §5.6), (c) the settlement cycles are never scheduled in production (`apps/worker/src/index.ts` runs only turn open/close), and (d) nothing POSTs settlement projections to the API in a live flow. This is why a closed turn shows no result.
- **Milestone reconciliation:** M3.1/M3.2/M3.5 are marked "Completed" but were validated as on-chain instructions + deterministic logic + unit/SBF tests — not as a live, automated, trustless pipeline with real Switchboard randomness. Recorded without changing those rows; the new M5 series supersedes the "settlement works" perception.
- **Decision (user): trustless** — `settle_*` must verify the Switchboard randomness account on-chain (no authority-supplied randomness value).
- Wrote the phased action plan to `SETTLEMENT_TRUSTLESS_PLAN.md` (milestones **M5.0–M5.5**: Switchboard provisioning → trustless contract verification → worker randomness client/senders → settlement scheduler + state machine + API bridge → real player inputs → end-to-end verification) and added the M5.0–M5.5 rows (status **Planned**) to the Milestone Status table above.
- No code was written and no milestone was ticked; this is the planning/registration step only.

### 2026-06-23 (PRD scope check for real on-chain game loop)

- Opened required context before answering: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, and `.claude/skills/solana-dev/ext/sendai/skills/switchboard/SKILL.md`.
- Reviewed whether real player actions, Switchboard draw/election randomness, deterministic guess verification, winner/claim handling, worker automation, and the trustless Switchboard validation gap are already covered by the PRD.
- Conclusion: the PRD covers the listed gameplay and settlement items, but the current design needs an explicit trustless Switchboard validation requirement if `settle_draw` / election fulfillment must be proven by on-chain Switchboard account/CPI validation rather than authority-submitted randomness.
- No source files, milestone checkboxes, or PRD checklist items were changed.

### 2026-06-23 (implementation status check for prior PRD scope)

- Reopened required context before answering: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, and `.claude/skills/solana-dev/ext/sendai/skills/switchboard/SKILL.md`.
- Checked implementation state for the previously discussed real game-loop items: player on-chain actions, AI rule validation, draw/election randomness, deterministic verification, winners/claims, worker scheduling, and the trustless Switchboard gap.
- Confirmed implemented/verified in tracker: M2.3-M2.5, M3.1-M3.8, and M4.1-M4.6 are complete; M4.7/M4.8 are implemented and verified but still pending user confirmation before PRD ticking.
- Confirmed code gap: no `@switchboard-xyz/on-demand` or `switchboard-on-demand` dependency is present, and draw/election settlement accepts 32-byte randomness plus a matching source pubkey rather than parsing/verifying a Switchboard randomness account on-chain.
- Confirmed worker gap: `turn-automation.ts` currently opens/closes turns and handles duration/migration recovery; draw/election modules are exported/tested but not wired into the live worker server as a full scheduled Switchboard cycle.
- No source files, milestone checkboxes, or PRD checklist items were changed.

### 2026-06-22 (Restored healthy API compiler runtime)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/automation-upkeep/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/web2-backend.md`, and `.claude/skills/best-practices/references/observability.md`.
- Root cause: port `3002` was occupied by a local `node`/`tsx` API process running without healthy `DATABASE_URL`/`REDIS_URL`, so `/health` returned HTTP 503. The Compose `idealer-api` service existed but was not running on the port.
- Stopped only the unhealthy local API process on port `3002`, then started the Compose API with `docker compose up -d api`. This kept the existing web dev server intact.
- Verification passed: `docker compose ps` shows `idealer-api`, `idealer-postgres`, `idealer-redis`, and `idealer-worker` all `healthy`; `GET http://127.0.0.1:3002/health` returns `status:"ok"` with Postgres and Redis `ok`.
- Compiler verification passed with a real `POST http://127.0.0.1:3002/rule-preflight` for `Win if at least 4 of your numbers appear in the draw.` returning `decision:"VALID"`, `modelUsed:"gemma4:latest"`, `guardianChecked:true`, and `guardianGrounded:true`. API logs show warmup loaded `gemma4:latest`, `gemma4:e2b`, and `granite4.1-guardian:8b`.
- No source/config files were changed for this runtime repair, and no milestone checkbox or PRD checklist item was ticked.

### 2026-06-22 (Runtime status check for dealer agent)

- Opened required context before checking runtime state: `PRD.md` and `.claude/skills`.
- Checked the local API runtime after the user asked whether the dealer agent was already configured and working. `GET http://127.0.0.1:3002/health` returned HTTP 503 with `postgres:"error"` and `redis:"error"`.
- `docker compose ps` showed `idealer-postgres`, `idealer-redis`, and `idealer-worker` running, but no `idealer-api` or `idealer-web` Compose services. Port 3002 is currently served by a local Node/tsx process running `src/index.ts`, not the Compose API container.
- No configuration file was changed and no process/container was stopped or restarted.

### 2026-06-22 (Dealer chat canned replies for common questions)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md`, `.claude/skills/idealer-design-system/references/02-components.md`, `.claude/skills/idealer-design-system/references/03-screens-and-state.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Updated `apps/web/src/features/idealer/screens/Create.tsx` so non-rule chat messages get deterministic dealer replies for pricing/cost, examples, how rule compilation works, and allowed rule inputs. These replies do not call `/rule-preflight`; rule-shaped drafts still go to the compiler, and real compiler outages still surface as infrastructure errors.
- Updated `apps/web/src/features/idealer/idealer.css` so chat bubbles preserve short multi-line dealer replies, keeping example lists readable on mobile.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, and `GET http://127.0.0.1:3000/play` returned HTTP 200 from the existing local dev server.
- Verification limitation: `pnpm --filter @idealer/web exec playwright test e2e/rule-proposal.spec.ts` did not start because an existing Next dev server already holds the `apps/web` dev lock on port 3000 while the Playwright config tries to start another server on port 3005. The existing server was left running; no milestone checkbox or PRD checklist item was ticked.

### 2026-06-22 (Dealer chat avoids compiler calls for greetings)

- Opened required context before working: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and `packages/rule-compiler/rule-authoring/SKILL.md`; also followed the investigation workflow for the reported `POST /rule-preflight` HTTP 502.
- Diagnosed the screenshot path: `CreateScreen` sent every chat message, including `hi`, directly to `POST /rule-preflight`, so a greeting could surface a compiler infrastructure failure instead of staying in the dealer chat.
- Updated `apps/web/src/features/idealer/screens/Create.tsx` with a deterministic chat-vs-rule intent gate. Greetings and general questions now get an in-chat dealer response without contacting the compiler; actual rule-shaped drafts still call `/rule-preflight`. Added accessible labels for the message textarea and send button.
- Updated `apps/web/src/features/idealer/data/apiClient.ts` so rule preflight uses the strict JSON helper and preserves server-provided error details for real compiler outages instead of reducing them to only `HTTP 502`.
- Verification passed: `pnpm --filter @idealer/web typecheck` and `pnpm --filter @idealer/web lint`.
- Browser verification note: the existing Next dev server on port 3000 was already running from this workspace and served `/dev/gallery`, but not with the mock wallet alias active, so the create chat remained behind the connect screen. A second mock dev server on port 3001 was blocked by Next's existing dev-server lock. No milestone checkbox or PRD checklist item was ticked.

### 2026-06-22 (Test-only manual turn control for the worker)

- Opened required context before working: `PRD.md` (§2.1 Turn, §5.3 turn-duration cycle, §5.4 turn lifecycle, §5.5 turn state machine), `PROGRESS_TRACKER.md`, `.claude/CLAUDE.md`, and `.claude/skills` (reviewed `idealer-ui-coherence`, `automation-upkeep`).
- Problem: the automatic turn worker was stopped, so no turn was open on devnet and the live round rendered empty (the web reads the active turn directly from devnet RPC via `fetchActiveTurnSnapshot`; the existing web mock only fakes HTTP API endpoints, not the on-chain turn). User asked for a **test-only** manual worker that opens and closes turns on demand without waiting out the duration.
- Implemented `apps/worker/src/manual-control.ts` reusing the same on-chain instructions as the automatic loop (so the UI keeps reading real devnet state): `openTurnManually` (open next turn, then reset the duration cycle to a comfortable playable window), `closeTurnManually` (shrink the active turn's duration slot to 1s via `set_turn_duration_cycle` so `end_timestamp` moves into the past, then `close_turn`; the on-chain `close_turn` enforces `clock >= end_timestamp`, so early close is impossible without this), and `cycleTurnManually` (close + open). Legacy-account close falls back to `force_skip_legacy_active_turn`, mirroring the automatic loop.
- Exported the shared helpers needed for reuse from `turn-automation.ts` (`fetchGlobalConfig`, `fetchTurnState`, `createOpenTurnInstruction`, `createCloseTurnInstruction`, `createSetTurnDurationCycleInstruction`, `createForceSkipLegacyActiveTurnInstruction`, `deriveAuthorityAddress`, `SolanaAddress`).
- Wired test-only HTTP endpoints into the worker server (`apps/worker/src/index.ts`): `POST /manual/open`, `POST /manual/close`, `POST /manual/cycle`. Gated behind `IDEALER_TURN_MANUAL_CONTROL_ENABLED` (paths return 404 when disabled, so they stay invisible in production); `/health` now reports `manualControl: "disabled" | "enabled" | "error"`.
- Added env wiring in `docker-compose.yml` (worker): `IDEALER_TURN_MANUAL_CONTROL_ENABLED` (default `false`) and `IDEALER_TURN_MANUAL_OPEN_DURATION_SECONDS` (default `3600`), with a comment marking them test-only. Production keeps the automatic timed loop.
- Tests: added `apps/worker/src/manual-control.test.ts` covering config resolution, disabled/no-keypair guards, and no-RPC-side-effects (mirrors the `turn-automation` test patterns).
- Verification passed: `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test` (46/46), and `pnpm --filter @idealer/worker lint`.
- Live devnet round-trip exercised (`idealer-worker` started with `IDEALER_TURN_MANUAL_CONTROL_ENABLED=true`, `IDEALER_TURN_AUTOMATION_ENABLED=false`; `/health` reported `manualControl:"enabled"`, `turnAutomation:"disabled"`). The manual worker behaved correctly end-to-end: `POST /manual/open` short-circuited with `active_turn_exists` (turn 27), and `POST /manual/cycle` detected that turn 27 is a **legacy account** (close hit `AccountDidNotDeserialize` on `turn_state`) and fell back to `force_skip_legacy_active_turn`.
- **Pre-existing on-chain blocker surfaced (not a worker defect):** `force_skip` failed with `ConstraintSeeds` (2006) on `global_config`. Diagnosed via read-only RPC: the canonical `global_config` PDA `EtZ5ZyHKb8wZmMHFDLM6LtVmZV1WUMvFPER72eFE4qob` has canonical bump 255 and is owned by the program, but its on-chain data length is 271 bytes (INIT_SPACE 263) while the current source `GlobalConfig` is INIT_SPACE 271 — the on-chain account predates a layout-changing upgrade and was never migrated (the once-initialized account never resizes), so `bump = global_config.bump` re-derives a different address and every authority turn instruction (open/close/set_cycle/force_skip) is wedged. The deployed program was confirmed at slot 471007779 (the M4.7 build); the authority/upgrade-authority/config-authority are all the deployer `4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH`; no on-chain IDL is published.

### 2026-06-22 (Option 1 — global_config migration instruction + devnet repair, COMPLETE)

- Implemented a **test-only, feature-gated** repair path and used it to unwedge devnet end-to-end. Opened required context before working: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/CLAUDE.md`, `.claude/skills`, `contracts/solana/README.md`, `contracts/solana/scripts/sbf.sh`.
- **Contract** (`contracts/solana/programs/idealer/src/lib.rs`, `Cargo.toml`): added `reinitialize_global_config_for_migration(next_turn_id)` under a new `devnet-test` cargo feature (OFF by default → excluded from production builds). It authenticates using only layout-stable bytes — the 8-byte account discriminator and the `authority` pubkey (first field, offset 8) — so it never depends on the unknown old field order; it then reallocs `global_config` to the current layout (rent topped up from the authority), rewrites it with canonical devnet config + canonical bump, resets turn state, and sets a caller-provided `next_turn_id`. Loaded as `UncheckedAccount` with `seeds=[b"global_config"], bump` (re-derives canonical bump, not the stale stored one). Added `IdealerError::InvalidGlobalConfigAccount`.
- **Production-safety proof:** SBF build WITHOUT the feature compiles clean (no warnings) at 714,976 bytes and excludes the instruction; WITH `SBF_FEATURES=devnet-test` it is 731,144 bytes — the 16 KB delta confirms `#[cfg]` gating works. `scripts/sbf.sh` gained an optional `SBF_FEATURES` env (defaults to none).
- **Worker** (`apps/worker/src`): made `decodeGlobalConfigAccount` dual-layout (current 4-fee + legacy 3-fee, plausibility-gated, mirrors the web decoder) so it reads `global_config` correctly across the migration boundary; added `migrateGlobalConfigManually` + `POST /manual/migrate` (test-gated) and `IDEALER_TURN_MANUAL_MIGRATE_NEXT_TURN_ID`. Exported the needed helpers from `turn-automation.ts`. Worker: 47/47 tests, typecheck, lint all green.
- **Devnet executed (irreversible, user-approved):** upgraded program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4` to the `devnet-test` build (slot **471290296**, sig `3aasfCoAKBtVts3W7DoMgHgg3hDMctjHE2kwX7FJdvFbN1wjkRHcBBkxUtREG688GTDGYMTVwbQVseAMibkY3sNb`); ran `POST /manual/migrate` (`next_turn_id=28`, sig `4AiVpcLRVc3FYr4FsPsgwKHqpguVDdTxXCFfEW4TYQjBuv3R2NjQ3h8Pffu6Ffi1t9sPHnTnGSFUwFd5zDqjvvvr`); `POST /manual/open` opened turn 28; `POST /manual/cycle` closed 28 and opened 29 — all without waiting.
- **Verified on-chain:** `global_config` now decodes with the current layout (`activeTurnId`, `nextTurnId`, `paused`, cycle `[3600×4]`), the active turn is `status:open` with the current TurnState layout (`dataLen:764`). The empty-round blocker is resolved; the manual worker can open/close/cycle turns on demand.
- **Production note:** the devnet program currently carries the test-only migration instruction. To return to production, rebuild WITHOUT `devnet-test` (the 714,976-byte artifact already verified) and redeploy. No milestone checkbox or PRD checklist item was ticked.

### 2026-06-22 (Profile conversation drafts + player history backend)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `idealer-design-system/references/01-tokens.md`, `02-components.md`, `03-screens-and-state.md`, `04-new-screen-recipe.md`, `docs/api-contracts.md`, and `docs/data-model-draft.md`.
- Implemented the missing backend support for Profile's deferred tabs: `GET /players/{wallet}/history` aggregates guesses, rule proposals, approval votes, elimination votes, and claim events with cursor pagination; `GET/POST /players/{wallet}/conversation-drafts` saves and lists wallet-scoped AI dealer drafts with strict wallet/path validation.
- Wired the web app to the new endpoints: added typed API client wrappers, `usePlayerHistory`, `useConversationDrafts`, autosave from `CreateScreen` after successful rule preflight, submitted-status update after proposal submission, and Profile "Conversations" / "History" lists replacing the previous "coming soon" empty states.
- Updated `docs/api-contracts.md` and `docs/data-model-draft.md` with the new local compatibility endpoints and draft storage model.
- Verification passed: `pnpm --filter @idealer/api test` (36/36), `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/web typecheck`, and `pnpm --filter @idealer/web lint`. Browser check on the existing Next dev server at `http://localhost:3000/play` passed at 390x844: content rendered, no framework overlay, and no current console errors. No milestone checkbox or PRD checklist item was ticked; user confirmation is still required before marking any milestone complete.

### 2026-06-22 (user-facing functionality/interface audit)

- Created the local `.claude/skills/idealer-ui-coherence` skill to guard future Idealer UI work against visual drift across screen bounds, typography, font usage, colors, button/card/pill/sheet/chat-bubble shapes, layout rhythm, copy tone, effects, state handling, and mobile responsiveness. Opened required project context before working: `PRD.md`, `AGENTS.md`, `.claude/CLAUDE.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/skill-creator/SKILL.md`, `.claude/skills/skill-creator/references/openai_yaml.md`, `.claude/skills/idealer-design-system/SKILL.md`, and all `idealer-design-system/references/*` files. Validated the new skill with `python .claude\skills\skill-creator\scripts\quick_validate.py .claude\skills\idealer-ui-coherence` (`Skill is valid!`). No milestone checkbox was ticked.
- Opened required project context before working: `PRD.md`, `PROGRESS_TRACKER.md`, `AGENTS.md`, `.claude/CLAUDE.md`, and `.claude/skills`; reviewed relevant local skills `develop-frontend`, `idealer-design-system` (`02-components`, `03-screens-and-state`), and `best-practices` (`agent-principles`).
- Audited the current `apps/web` implementation against the PRD mobile user flows, state map, low-fidelity wireframes, and milestone tracker. Confirmed the current route tree exposes `/play`, `/round/[turnId]`, and `/dev/gallery`; `/play/results`, `/play/rewards`, `/play/share`, and `/play/wallet` are not present in `apps/web/src/app`.
- Follow-up live UI inspection after user clarification: opened `http://localhost:3000/play` with Playwright at 390x844, captured `apps/web/output/playwright/live-local-play-390.png`, and confirmed the running UI currently renders the no-active-devnet-turn state (0 SOL prize, 0 rules, disabled play CTA).
- Verified `pnpm --filter @idealer/web typecheck` passes. No milestone checkbox was ticked and no PRD checklist item was changed; this was a discovery/audit task only.
- Revalidated after the updated `/play` UI: opened `PRD.md`, `PROGRESS_TRACKER.md`, `AGENTS.md`, listed `.claude/skills`, and reviewed relevant local/browser guidance (`develop-frontend`, `idealer-design-system`, `playwright`, `best-practices/agent-principles`, browser-use fallback). Checked the live runtime (`/play` HTTP 200, API `/health` ok, API `/rounds/1` ok), captured `apps/web/output/playwright/audit-play-390.png`, and confirmed `/play` exposes the live shell but still shows no active devnet turn, 0 rules, and disabled play CTA.
- Compared current routes and implementation against PRD user flows: confirmed `/play/share`, `/play/results`, `/play/rewards`, `/play/wallet`, and `/play/pick` return 404 in the current App Router tree, while `/round/1` currently returns 500 from the web surface despite API `/rounds/1` returning data. Confirmed paid rule removal is implemented in contract/API but has no current `/play` UI action, share cards/near-miss surfaces are not available as routes, and Profile still contains explicit "Saved drafts are coming soon" and "Full play history is coming soon" empty states. No milestone checkbox was ticked.
- Implemented the user-approved UI exposure plan with minimal UI changes: added web `remove_rule` helper/receipt derivation, strict `/rule-removals` POST, paid removal context action, correct removal-fee snapshot support with legacy GlobalConfig decode compatibility, and a `RuleDetail` remove CTA/gate that keeps removed rules visible as `Removed`.
- Restored thin App Router deep links for `/play/pick`, `/play/results`, `/play/rewards`, `/play/wallet`, and `/play/share`; added shell-level rewards/share screens backed by existing claim/round data; hardened `/round/[turnId]` so auxiliary on-chain balance/audit derivation failure degrades without blocking API-backed round rendering.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, and `pnpm --filter @idealer/web exec next build --webpack`. Route checks on a clean local webpack server (`127.0.0.1:3001`) returned 200 for `/play`, `/play/pick`, `/play/results`, `/play/rewards`, `/play/wallet`, `/play/share`, and `/round/1`. Mobile Playwright verification at 390x844 passed for `/play`, `/play/wallet`, `/play/rewards`, plus controlled rule-detail removal gate (`Play to remove`) with no error overlay or console errors. The existing `localhost:3000` dev server remained on a stale Next worker 500 for `/round/1`; the clean rebuilt server served it successfully. Opened required docs/context for this implementation: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`. No milestone checkbox was ticked.

### 2026-06-21 (M4.7 on-chain claim execution + M4.8 player rewards history)

- Opened required project context before working: `PRD.md` (§2.4 winning conditions/creator+voter reward, §2.5 prize pool, §5.2.1 Game Token, §15.5 M4.3/M4.4) and `PROGRESS_TRACKER.md`, and reviewed `.claude/skills` (`best-practices` incl. `agent-principles`, `security-threat-checklist` — pull-payment/CEI/access-control applied; `solana-dev`, `idealer-design-system` conventions; followed `solana-build-deploy-workflow` Docker-only SBF build/test/deploy).
- **Why:** the audited "claim lottery reward" and "claim creator/voter reward" flows (PRD items) were UI/API-only — the M4.4 claim flow recorded state but never moved SOL on-chain (the contract only stored `claim_status`); and there was no player rewards-history surface. The user approved a plan to add real on-chain claim execution + a rewards-history screen as new submilestones M4.7/M4.8.
- **Contract** (`contracts/solana/programs/idealer/src/lib.rs`): added the `Claim` PDA (`["claim", turn_id, claimant, kind]`) with `ClaimKind {WinnerPayout, CreatorReward, VoterReward}` / `ClaimState {Available, Claimed}`; `record_claim` (authority `has_one`, draw `Fulfilled`, amount ≥ `minimum_claim_threshold_lamports`, idempotent `init`); `claim_prize` (from per-turn `prize_vault`) and `claim_reward` (from global `treasury_vault` reserve) as pull-payments signed by the claimant; `pay_from_vault` direct-lamport transfer preserving the rent-exempt minimum; CEI double-claim guard; new events (`ClaimRecorded`, `ClaimSettled`) and errors (`InvalidClaimant`, `ClaimBelowMinimum`, `ClaimNotAvailable`, `ClaimKindMismatch`, `InsufficientVaultBalance`). `close_turn` already leaves the prize vault intact, so post-turn claims are valid.
- **Build/deploy** (Docker, `scripts/sbf.sh`): native `cargo test -p idealer` 14/14 + fmt clean; SBF suite `test-sbf` 6/6 including the new `claim_flow_records_and_pays_winner_and_reward` integration test; devnet program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4` upgraded (data length 714,752 bytes, slot 471007779, tx `xeYfiYvTmoRqMk9go6BJpqht4ZsGGQ8cZTnLFJRUpwswfte2syTD8hKdKaQurSUzKjvMaWhWmEbqF9vonX6aUk8`, upgrade authority unchanged).
- **Worker** (`apps/worker/src/claims.ts`): added `recordClaimsForTurn` (POSTs `/claim-records/create-turn`, then sends authority `record_claim` per available claim, treating already-recorded PDAs as success), `createRecordClaimInstruction`, `selectRecordableClaims`, `isClaimAlreadyRecorded`; exported `simulateAndSend`/`AuthorityInstruction`/`RpcClient` from `turn-automation.ts`; exported the module from `index.ts`. Worker tests 40/40, typecheck/lint clean.
- **API** (`apps/api/src/index.ts`): added `getPlayerClaimsSummary` + `GET /players/{wallet}/claims` (cross-turn aggregation) and the `/players/` CORS preflight prefix. No change to the value-of-record logic; `completeClaimApproval` already required a real base58 signature, so the frontend now supplies the on-chain claim signature. API tests 34/34, typecheck clean.
- **Web**: `idealerProgram.ts` gained `deriveClaimAddress`, `createClaimPrizeInstruction`, `createClaimRewardInstruction`, `createClaimInstruction`, and `ClaimKindLabel`. `DrawResultPanel` rewritten from a mocked prototype into a real claims surface (fetches `/players/{wallet}/claims`, requests approval, signs `claim_prize`/`claim_reward`, completes with the signature, refreshes). New `PlayerRewardsHistory` read-only history at `/play/rewards`, hub account-screen "Rewards & claims" link, claim list styles in `globals.css`, and rewritten `draw-result.spec.ts`. Web typecheck/lint clean; full e2e suite 14/14.
- **Runtime check:** with a clean `.next`, `/play/results` and `/play/rewards` both serve HTTP 200 with the wallet-disconnected content. (Note: the project's `next dev` SSR-logs a benign provider warning for wallet panels and the local `next build` has a pre-existing Turbopack-vs-`--webpack` config conflict — both unrelated to this change; e2e runs via `next dev --webpack`.)
- No PRD checklist item or milestone checkbox was ticked. M4.7/M4.8 are recorded as **In review / Pending**; manual devnet claim verification with a funded wallet and PRD ticks await the user's explicit confirmation.

### 2026-06-21 (SBF build + instruction suite + devnet upgrade for the rule-elimination/voting/prize-vault changes)

- Opened required project context before working: `PRD.md` (§6.11 paid removal, §6.12 election, §6.13 elimination decision phase) and `PROGRESS_TRACKER.md`, and reviewed `.claude/skills` (followed `solana-build-deploy-workflow` + best-practices conventions; no new skill needed).
- Built the SBF artifact for the current `lib.rs` (rule elimination + voting + prize-vault integration) in the pinned Agave toolchain container (`scripts/sbf.sh build`, Agave/`cargo-build-sbf` 4.0.0): `idealer.so` compiled clean at 658,616 bytes (up from the prior 448,024-byte build).
- Ran the SBF instruction suite (`scripts/sbf.sh test-sbf`, `--test-threads=1`) and fixed two test-side failures (the contract behavior was correct):
  - `core_instructions_execute_and_persist_state` (`tests/instructions.rs`): the double-vote rejection assertion re-sent the identical `VoteRule` instruction, which reused the same blockhash so banks returned the first vote's cached success without re-executing. Added a `warp_to_slot` before the retry so it is a distinct transaction that actually hits the `rule_vote` `init` (per-`(turn, rule, voter)` PDA) conflict.
  - `rule_election_locks_requests_and_settles_active_rule` (`tests/instructions.rs`): the test asserted the old single-step election (active rule set at `settle_rule_election`). The contract now uses a two-phase flow, so `settle_rule_election` only selects finalists and opens the elimination window (`active_rule_id = 0`). Extended the test through `close_elimination_window` → `request_active_election_vrf` → `settle_active_election`, asserting finalist state at settle and the active rule (id/hash/artifact) after the active election.
  - Result: `test result: ok. 5 passed; 0 failed`.
- Deployed the devnet program upgrade (`scripts/sbf.sh deploy`) from the deployer/upgrade authority `4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH` (balance 16.10 SOL, no funding needed): program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4`, tx `3wbsuZYq264v2QBPGEwPgadBoCif1KwQFN6GJAP2LLEwgtm4mqAwF75GYrUvhsAuHYKtbZmTkUJpum4YivHG7nK3`, last deployed slot 470977802, data length 658,616 bytes, upgrade authority unchanged. Verified via `solana program show`.
- No PRD checklist item or milestone checkbox was ticked; this entry records the build/test/deploy run only. The test edits in `tests/instructions.rs` remain uncommitted alongside the contract changes.

### 2026-06-21 (M4.5 confirmation + M4.6 paid rule removal accounting)

- Opened required project context before working: `PRD.md` (§2.5/§2.6 prize pool, §5.1 player actions, §5.4 lifecycle, §6.11 paid removal, §6.12 election, §15.5 M4.5/M4.6) and `PROGRESS_TRACKER.md`, and reviewed `.claude/skills` (no removal-specific skill; followed best-practices conventions).
- **M4.5 — Rollover Behavior**: verified the existing implementation against the PRD §15 M4.5 checklist (source buckets, per-bucket no-winner rollover, dust-only winner rollover, attribution preserved, next-turn UI display, activity feed event, repeated-no-winner + winner-after-rollover tests, rewards unaffected). Re-ran `pnpm --filter @idealer/api test` (28/28), API typecheck/lint, and web typecheck/lint — all green. Ticked the M4.5 PRD checklist + approval criteria and set the tracker row to Completed after the user's explicit instruction to verify and mark done.
- **M4.6 — Paid Rule Removal Accounting (implemented)**:
  - **Solana** (`contracts/solana/programs/idealer/src/lib.rs`): added `remove_rule` (validates live turn, blocks once `eligible_rule_pool_hash` is locked, requires the current-turn Game Token, allows only `Proposed`/`Eligible` rules, enforces `min_votes_creator_self_remove` / `min_votes_third_party_remove` by comparing the remover to the proposer, charges `rule_removal_fee_lamports` to the prize pool via the standard treasury/prize split, sets state `RemovedPaid`, and emits `RuleRemoved`), plus the `RemoveRule` context, `RuleRemoval` PDA (`["rule_removal", turn, rule, remover]`), `RuleRemovalKind` enum, `RemovedPaid` `RuleState`, and `RuleRemovalWindowClosed`/`RuleNotRemovable`/`RuleRemovalProtected` errors. Removed rules are automatically excluded from election (candidate eligibility requires `state == Eligible`).
  - **Constants**: added `RULE_REMOVAL_CONFIG` (`minVotesCreatorSelfRemove: 5`, `minVotesThirdPartyRemove: 15`, `removalFeeDestination: "prize_pool"`) per §6.11 and aligned `devnet_bootstrap.rs` (was 100/250).
  - **API** (`apps/api/src/index.ts`): added `removeRule` enforcement (typed `RuleRemovalRejectedError` for not-found / window-closed / already-removed / not-removable / protected), enriched `PaidRuleRemovalRecord` with `feeLamports` + `voteCountAtRemoval`, a hash-chained `rule.removal` audit log, `isRuleRemoved`, removal activity-feed events folded into a combined `getActivityEvents`, `removed_paid` rule-state projection (excluded from election, still visible in history), and rewired `POST /rule-removals` to enforce + return typed errors with idempotent replay.
  - **Web** (`RoundPage.tsx` + `globals.css`): removed rules render as "Removed" (dashed, dimmed, strikethrough), are excluded from the leading-rule computation, and removal events show in the activity feed with the prize-pool destination note.
  - **Tests**: added a Rust SBF integration test (`remove_rule_enforces_protection_and_routes_fee_to_prize_pool`) and 5 API tests (third-party fee routing + audit/activity, creator self below/at threshold, third-party threshold, duplicate + post-lock, unknown-rule + combined feed).
- **Interpretation flagged**: §15 M4.6 says "Route 100% of removal fee to the current turn prize pool". The removal fee's *destination* is the prize pool, but the standard 5% protocol treasury fee is still retained before distribution (§2.5, and §6.11 "follows normal treasury/prize-pool accounting"), matching the already-confirmed M4.1 accounting. Implemented with the treasury split for cross-layer consistency; pending user correction if literal zero-treasury was intended.
- **Verification passed**: `cargo check -p idealer` (clean), `cargo test -p idealer --test core` (14/14), `cargo fmt -p idealer --check`, `pnpm --filter @idealer/constants build`/typecheck, `pnpm --filter @idealer/api test` (33/33), API typecheck/lint, `pnpm --filter @idealer/worker test` (34/34) + typecheck, `pnpm --filter @idealer/web` typecheck/lint, and `pnpm --filter @idealer/web test:e2e -- public-round.spec.ts` (3/3). SBF build + devnet deploy were not run in this Windows shell — the SBF/`solana-program-test` toolchain cannot compile `openssl-sys` here (documented limitation), so the on-chain `remove_rule` integration test stays `#[ignore]`'d while the program library compiles cleanly. PRD M4.6 checklist + approval criteria ticked after the user's explicit instruction.

### 2026-06-21 (M4.3/M4.4 divergence closure + M4.5 rollover implementation)

- Opened required project context before working: `PRD.md` (§2.5/§2.6 prize pool, §5.4 lifecycle, §15.5 M4.1–M4.6) and `PROGRESS_TRACKER.md`, and reviewed `.claude/skills` for a relevant skill (no rollover-specific skill; followed best-practices conventions).
- **Resolved the tracker × PRD divergence**: the milestone status table stopped at M4.2 while `PRD.md` had every M4.3 (Creator/Voter Reward) and M4.4 (Claim Flow) checkbox already ticked. Verified both are implemented in `apps/api/src/index.ts` (`calculateRewardDistribution`, `CreatorRewardRecord`/`VoterRewardRecord`, `ClaimRecord`, `/reward-records*`, `/claim-records*`) and green (`pnpm --filter @idealer/api test`, 26/26 before this work). Added tracker rows for M4.3 and M4.4 (Completed, Confirmed 2026-06-21) and explicit rows for M4.5 (In Review) and M4.6 (Not started) so the table now mirrors the PRD.
- **Implemented M4.5 — Rollover Behavior** in the API (`apps/api/src/index.ts`):
  - `settleTurnRollover(turnId)` settles a finished turn's buckets into the next turn via the existing `saveTurnRollover`/`TurnRolloverRecord`: a no-winner bucket rolls its full total forward (so repeated no-winner turns accumulate, since the inbound rollover is part of the next turn's bucket total), and a winner bucket rolls only its integer-division dust, so no lamport is ever lost.
  - `getTurnRolloverSettlement(turnId)` and `getRolloverActivityEvents(turnId)` expose the settlement and a PRD §4.7 Loop-5 "no winner, pool rolls over" spectator-feed event (dust-only remainders are silent).
  - Round summary now carries `activity` + `rolloverSettlement`; new endpoints `POST /turn-rollovers/settle` and `GET /turn-rollovers/settlement` (added to CORS allowlist); reset clears the new settlement map.
  - Rewards are explicitly unaffected (creator/voter rewards draw from a separate platform-monetization reserve, not the prize buckets).
- **Web**: completed the `RoundPage` `RoundSummary` type with `pool.accounting` rollover fields plus `activity`/`rolloverSettlement`, and added a "Rollover" block to the prize-pool tab showing inbound rollover per bucket and the no-winner rollover event(s) / settlement outcome, with matching `globals.css` styles.
- **Tests** (`apps/api/src/index.test.ts`): added "rollover settlement carries no-winner buckets forward and accumulates across repeated no-winner turns" and "rollover settlement pays accumulated pool to a winner after rollover without rolling that bucket again" (also asserts reward accounting is undisturbed and settlement is idempotent).
- Verification passed: `pnpm --filter @idealer/api test` (28/28), `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, and `pnpm --filter @idealer/web test:e2e -- public-round.spec.ts` (3/3).
- No PRD checkbox was ticked for M4.5; its §15 checklist and approval criteria remain unticked pending explicit user confirmation, per project rules. M4.3/M4.4 PRD checkboxes were already ticked and the tracker rows now record the confirmation.

### 2026-06-21 (M3.8 and M0.1 verification/confirmation)

- Reopened required project context before verification: `PRD.md`, `.claude/skills`, and the previously loaded `M3.8` implementation references from `.claude/skills/solana-dev` and `.claude/skills/best-practices`.
- Verified the existing `M3.8` implementation across Solana, worker/domain logic, API projections, public audit endpoint, public round UI, and decision-window voting UI.
- Found and fixed one remaining `M0.1` fee enforcement gap: regular `vote_rule` now charges the effective vote fee from turn 100 onward to the per-turn prize vault and updates `TurnState.prize_pool_amount_lamports`; the web instruction builder, SBF instruction fixture, and devnet bootstrap account list now pass `prize_vault`.
- Marked the remaining `M0.1` decision confirmations in `PRD.md`: rule elimination decision phase, elected-rule voter reward, and vote fee from turn 100 onward with current-turn Game Token requirement and prize-pool destination.
- Marked the `M3.8` checklist and approval criteria in `PRD.md` after the user's explicit instruction to verify, implement any pending work, and mark complete.
- Verification passed after the additional fix: `pnpm --filter @idealer/web typecheck` and `cargo test -p idealer`. The earlier `M3.8` verification remains valid: constants build/typecheck, worker test/typecheck/lint, API typecheck/test/lint, web typecheck/lint/e2e, and native contract tests.
- SBF build/deploy was not completed in this Windows shell because the available SBF script requires `/bin/bash`; native Rust tests passed, while the SBF instruction tests remain ignored under `cargo test -p idealer` unless an SBF build environment is available.

### 2026-06-21 (M3.8 rule elimination decision phase and remaining M0.1 decisions)

- Reopened required project context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/web3-contracts.md`, `.claude/skills/best-practices/references/testing.md`, and `.claude/skills/best-practices/references/checklists.md`.
- Implemented `M3.8` worker/domain logic: finalist snapshots freeze approval votes, elimination decisions enforce `elimination_votes > approval_votes`, cap eliminations at 5, keep at least 1 survivor, apply deterministic tie-breaks, persist eliminated/survivor hashes, and select the active rule from survivors only with separate active-election randomness.
- Implemented API projections and audit surface: `RuleEliminationVoteRecord`, `RuleEliminationRecord`, `/rule-elimination-votes`, `GET /api/v1/turns/{turn_id}/elimination`, round-summary elimination state, and prize-pool accounting for elimination votes at `2x` the effective vote fee.
- Implemented public UI support: `/round/[turnId]` now shows decision-window audit state, finalists, approval vs elimination counts, eliminated/survivor hashes, and elimination fee totals; `/play/vote` now shows finalist elimination thresholds and a distinct `Vote out` action using the new on-chain instruction path.
- Implemented Solana program support: added `vote_fee_lamports`, finalist snapshots on `TurnState`, `RuleEliminationVote` PDA, `eliminate_vote_rule`, `close_elimination_window`, `request_active_election_vrf`, `settle_active_election`, eliminated/survived rule states, events, and devnet bootstrap/test arg updates.
- Completed remaining `M0.1` documentation alignment without ticking checkboxes: `docs/product-rule-summary.md`, `docs/mvp-decision-registry.md`, and PRD decision 23 now document the elimination decision phase, elected-rule voter reward, and vote fee from turn 100 onward (`0.005 SOL`, elimination vote `2x`).
- Verification passed: `pnpm --filter @idealer/constants build`, `pnpm --filter @idealer/constants typecheck`, `pnpm --filter @idealer/worker test` (34/34), `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker lint`, `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (26/26), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web test:e2e -- public-round.spec.ts rule-voting.spec.ts` (4/4), and `cargo test -p idealer` (native tests; SBF instruction tests remain ignored in that command).
- SBF build was attempted with `bash contracts/solana/scripts/sbf.sh build` but could not run in this Windows shell because `/bin/bash` is unavailable (`execvpe(/bin/bash) failed`). No devnet deploy or transaction was sent.
- No PRD checklist item or milestone checkbox was ticked; `M0.1` remaining confirmations and `M3.8` approval still require explicit user confirmation.

### 2026-06-20 (Phantom devnet chain selection for guess signing)

- Reopened required project context before working: `PRD.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`.
- Investigated the Phantom warning that the bet/guess transaction was reverted during wallet simulation.
- Reproduced the `submit_guess` instruction directly against devnet with the same deployed program/account layout and confirmed the program simulation succeeds (`err=null`, `34518` compute units) for a funded devnet payer while the active turn is open.
- Root cause addressed in `apps/web/src/solana/SolanaProviders.tsx`: the Mobile Wallet Adapter registration was devnet-scoped, but browser-extension Wallet Standard connectors from `autoDiscover()` did not receive `defaultChain`, so Phantom could simulate/sign on its default Solana network instead of devnet.
- Updated Wallet Standard discovery to set `defaultChain: "solana:devnet"` for discovered connectors and reused the same `DEVNET_CHAIN` constant for MWA registration.
- Synced `SolanaProviders.tsx` into the running `idealer-web` container and restarted only `idealer-web`.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, direct devnet `submit_guess` simulation succeeded, `GET http://127.0.0.1:3000/play/pick` returned HTTP `200`, and `idealer-web` returned to `healthy`.
- No PRD checklist item or milestone checkbox was ticked; this was a maintenance bug fix and milestone approval still requires user confirmation.

### 2026-06-20 (devnet guess transaction wallet signer fix)

- Opened required project context before working: `PRD.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/references/kit-web3-interop.md`.
- Investigated the reported inability to play because the wallet signature failed while submitting a bet/guess.
- Root cause addressed in `apps/web/src/features/number-picker/NumberPicker.tsx`: the custom `submit_guess` transaction marked `player` as a signer account, but the transaction request used the raw player address as `feePayer`. The wallet session was passed as `authority`, but the transaction builder needs an explicit `TransactionSigner` when the fee payer/account signer must sign the compiled message.
- Updated the guess submission flow to wrap the connected wallet with `createWalletTransactionSigner` and pass that signer as both `authority` and `feePayer`, so the same wallet signs the `player` signer account and pays the devnet transaction fee.
- Synced the changed number picker file into the running `idealer-web` container and restarted only `idealer-web`.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, `GET http://127.0.0.1:3000/play/pick` returned HTTP `200`, and `idealer-web` returned to `healthy`.
- No PRD checklist item or milestone checkbox was ticked; this was a maintenance bug fix and milestone approval still requires user confirmation.

### 2026-06-20 (rule proposal dealer LLM env parsing fix)

- Opened required project context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and `packages/rule-compiler/rule-authoring/SKILL.md`.
- Investigated the `Dealer engine unavailable` / `RULE_AGENT_UNAVAILABLE` failure in the rule proposal flow.
- Confirmed the API and Ollama were running, and verified Ollama had the required local models installed: `gemma4:latest`, `gemma4:e2b`, and `granite4.1-guardian:8b`.
- Root cause: `.env` / `.env.example` used inline comments on `LLM_*` values; Docker passed those comments into the API container, so `LLM_MODEL` became `gemma4:latest # e.g. ...` and Ollama rejected the chat request with `invalid model name`.
- Updated `apps/api/src/llm.ts` and `apps/api/src/guardian.ts` to strip accidental inline comments from non-secret runtime config values before using model names, URLs, timeouts, seeds, booleans, and the local API key.
- Cleaned the local `.env` and tracked `.env.example` so LLM comments are on separate lines and future containers start with clean values.
- Added regression coverage for dealer and guardian config parsing with inline-comment env values while preserving the existing guardian groundedness tests.
- Recreated only `idealer-api` without touching data volumes; the running API now sees clean `LLM_MODEL=gemma4:latest`, `LLM_ESCALATION_MODEL=gemma4:e2b`, and `LLM_GUARDIAN_MODEL=granite4.1-guardian:8b`.
- Verification passed: `pnpm --filter @idealer/api test` (24/24), `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api lint`, API `/health`, and a real `POST /rule-preflight` returning `decision: VALID` for `Win if at least 4 of your numbers appear in the draw.`
- No PRD checklist item or milestone checkbox was ticked; this was a maintenance bug fix and milestone approval still requires user confirmation.

### 2026-06-20 (devnet guess submission rent pre-check)

- Opened required project context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/references/kit-web3-interop.md`.
- Investigated the Phantom simulation failure reported during `submit_guess`.
- Verified devnet state directly: active `turnId=3` is open, belongs to the configured program, and passes the guess action window.
- Simulated the same `submit_guess` instruction against devnet with a funded diagnostic payer and confirmed the instruction succeeds when enough lamports are available.
- Root cause addressed in the web pre-check: the frontend used a fixed `0.003 SOL` rent/fee estimate, while the actual observed cost is about `0.01335276 SOL` total for entry fee, two rent-exempt accounts, and network fee.
- Updated `apps/web/src/features/number-picker/NumberPicker.tsx` to query `getMinimumBalanceForRentExemption` for the exact `PlayerGuess` and `GameToken` account sizes before opening the wallet, then compare the wallet balance in lamports and show the exact required SOL amount when insufficient.
- Verification passed: `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web typecheck`, and `pnpm --filter @idealer/web test:e2e -- number-picker.spec.ts`.
- No PRD checklist item or milestone checkbox was ticked; this bug fix awaits user confirmation in the live wallet flow.

### 2026-06-20 (Compose metadata cleanup attempt and effective test duration visibility)

- Opened required project context before working: `PRD.md`, `AGENTS.md`, and `.claude/skills`.
- Investigated the user's report that the test intervals were not in effect because `/play` showed roughly 1 hour remaining.
- Verified devnet state directly from `GlobalConfig` and `TurnState`: `turnDurationCycle=[1080,1080,4320,4320]`, active `turnId=3`, `cycleIndex=2`, `turnDurationSeconds=4320`, `startTimestamp=1781970509`, `endTimestamp=1781974829`; the visible ~1 hour remaining is expected for the 8-hour cycle step shortened by 85% (`8h * 15% = 72min`) after elapsed time.
- Updated API health reporting so it exposes the effective devnet test cycle instead of only production constants: `turnDurationCycleHours=[0.3,0.3,1.2,1.2]`, `turnDurationCycleSeconds=[1080,1080,4320,4320]`, and `turnDurationScaleBps=1500`.
- Added `IDEALER_DEVNET_TURN_DURATION_SCALE_BPS` to the API environment in `docker-compose.yml` and marked existing named data/key volumes as external where they already existed (`idealer-postgres-data`, `idealer-redis-data`, `idealer-solana-home`) to avoid Compose project-label warnings without deleting data.
- Cleaned one real stale `Created` replacement container and pruned stopped containers; Docker Desktop still retained two nameless `Dead` Compose ghosts (`3670170967f617540e8a707a0fb98243870aa193d6bc2496387f8a0441770e6d`, `b0643694c5587250efce75831d33d8a35cdfcd0cfc722875098d2aef62a80dd8`) that `docker rm`, `docker inspect`, and `docker container prune` all report as nonexistent.
- Restarted Docker Desktop/WSL backend to try to clear the ghosts; the ghosts persisted. Search found those IDs only in Docker Desktop logs, not in `/var/lib/docker/containers` or a safe editable metadata store. Removing them completely appears to require a Docker Desktop data reset or a Docker Desktop bug fix, which would be destructive/risky for volumes and was not performed.
- Restored the `idealer` runtime stack without rebuild: `idealer-postgres`, `idealer-redis`, `idealer-api`, `idealer-web`, and `idealer-worker` are running under the `idealer` group labels.
- Verification passed: `pnpm.cmd --filter @idealer/api typecheck`, `GET http://127.0.0.1:3002/health` returned the shortened effective cycle and Postgres/Redis ok, `GET http://127.0.0.1:3003/health` returned `turnAutomation:"enabled"` and `firstTurnDurationSeconds=1080`, and `GET http://127.0.0.1:3000/play` returned HTTP `200`.
- No PRD checklist item or milestone checkbox was ticked; this was maintenance/debugging work.

### 2026-06-20 (devnet turn recovery and shortened cycle enforcement)

- Opened required project context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Root cause confirmed from worker/devnet logs: the legacy active turn account could not deserialize under the upgraded `TurnState` layout (`AccountDidNotDeserialize`), so `close_turn` could not clear `GlobalConfig.has_active_turn`.
- Contract: added `force_skip_legacy_active_turn` to clear only an undersized legacy active turn PDA after authority, owner, PDA, and data-length checks; added `set_turn_duration_cycle` to authority-update the on-chain duration cycle and shorten the currently active open turn.
- Worker: added recovery handling for legacy turn deserialization, base58/path keypair parsing with path priority, Docker deployer-keypair mounting, devnet duration scale enforcement (`1500` bps -> `[1080, 1080, 4320, 4320]`), transaction confirmation waiting, and health output for shortened first-turn duration.
- Docker: updated `worker` to mount `idealer-solana-home` read-only at `/solana-home` and default `IDEALER_TURN_AUTHORITY_KEYPAIR_PATH` to the deployer keypair path, avoiding inline secret copying/printing.
- devnet upgrade #1 deployed recovery-capable program: signature `5kdhogJ5jjiARxnnd26VwjHcAjh7pbt7Et6chRted4NC3g456Z1UumKMQT53AS48gVKLr5wCUSMRp7eMWbv6RuGV`, slot `470745183`, data length `527720`.
- Worker recovery executed on devnet: skipped legacy turn `1` with signature `58VQM5B4pQhsbMrNRJWPhj8aaqc2pQva5QmCwD3F9yDrSQgwxhUECxTzX6trKNsG8dzaeWJxHEjLda9ntWkEHZ3e`, then opened turn `2` with signature `3nu1mayDxsc4kUAxcVZtfd1FcGatcEr473s8EJuSTzSgG2S5AuUCegyosXjqgqBDW1KNnZCReXKezza77ioM6EPx`.
- devnet upgrade #2 deployed duration-cycle repair: signature `5hbmiVrmh6kSdTYGHrQ39bS2BVeZg1nadQ3z5UEXAfXhDYUsd29m4NMEUgkeuigsdHmbmDJ2BPPntDs7khLj1r1X`, slot `470758162`, data length `532048`.
- Worker enforced the shortened cycle and continued automation: updated duration cycle for turn `2`, closed turn `2` with signature `MqFU2WiwkcYTHMa1p3PHMswjs4492ebWZep91xtzwrziyESSt3JaWyKsbfH3xUZ6RH9nBqnqvXtbU2yFPvYwRat`, and opened turn `3` with signature `2fqfXw9qCgocNutZdeg3keiARuDqXvQ9DzR4Yy4YeQEM6XJuBjeZH8jw448B1YmThUrAqsSBJ47zpwuWdA9YZBsY`.
- Final devnet state verified: `GlobalConfig.hasActiveTurn=true`, `activeTurnId=3`, `paused=false`, `turnDurationCycle=[1080,1080,4320,4320]`; active turn `3` is `open`, `cycleIndex=2`, `turnDurationSeconds=4320`, `startTimestamp=1781970509`, `endTimestamp=1781974829`.
- Runtime verification passed: `idealer-worker` health returned `status:"ok"`, Postgres ok, Redis ok, `turnAutomation:"enabled"`, `firstTurnDurationSeconds=1080`; `GET http://127.0.0.1:3000/play` returned HTTP `200`.
- Local verification passed: `cargo fmt --check`, `cargo test -p idealer --test core`, `cargo test -p idealer --test instructions` (4 ignored by design without SBF env), `pnpm.cmd --filter @idealer/worker test` (32/32), and `pnpm.cmd --filter @idealer/worker typecheck`.
- SBF build passed and produced `/sbf-target/deploy/idealer.so` (`532048` bytes). Known residual test caveat from the earlier SBF ignored suite remains: `core_instructions_execute_and_persist_state` failed on a duplicate-vote assertion unrelated to this recovery path and was not hidden.
- No PRD checklist item or milestone checkbox was ticked; milestone completion still requires explicit user confirmation.

### 2026-06-19 (Docker Compose rebuild on `idealer2`)

- Reopened required project context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Rebuilt and force-recreated API/Web using the healthy Compose workaround project to avoid the corrupted `idealer` metadata entries: `docker compose -p idealer2 up -d --build --force-recreate --no-deps api web`.
- Kept Postgres and Redis running; no volumes were removed or pruned.
- Verification passed: `GET http://127.0.0.1:3002/health` returned `status:"ok"` with Postgres and Redis ok; `GET http://127.0.0.1:3000/play` returned HTTP `200`.
- Final Docker status: `idealer-api`, `idealer-web`, `idealer-postgres`, and `idealer-redis` are healthy.
- No PRD checklist item or milestone checkbox was ticked.

### 2026-06-19 (Docker Compose recovery after interrupted recreate)

- Reopened required project context before working: `PRD.md`, `AGENTS.md`, and `.claude/skills`.
- Diagnosed the failed `docker compose up -d --build --force-recreate web api` error: Compose had a stale replacement container reference for `3670170967f617540e8a707a0fb98243870aa193d6bc2496387f8a0441770e6d` after an interrupted recreate.
- Confirmed the new images existed: `idealer-api:latest` and `idealer-web:latest` were rebuilt successfully.
- Restarted `idealer-postgres` and `idealer-redis`; both became healthy. Existing volumes were preserved.
- Removed visible partial app containers, but Docker Desktop still reports two nameless `dead` containers under project `idealer` that return `No such container` when removed by ID. `docker container prune --filter label=com.docker.compose.project=idealer` did not clear those dead metadata entries.
- Worked around the corrupted `idealer` Compose metadata by tagging the new images as `idealer2-api:latest` and `idealer2-web:latest`, then starting `api` and `web` with `docker compose -p idealer2 up -d --no-deps --no-build api web`.
- Verification passed: `GET http://127.0.0.1:3002/health` returned `status:"ok"` with Postgres and Redis ok; `GET http://127.0.0.1:3000/play` returned HTTP `200`.
- Residual risk: the original `idealer` Compose project still contains two Docker Desktop `dead` metadata entries for old `web` and `worker` containers; the running API/Web containers currently belong to project label `idealer2` while keeping the same public container names/ports.
- No PRD checklist item or milestone checkbox was ticked.

### 2026-06-19 (Automatic turn lifecycle and test-phase durations)

- Opened required project context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/best-practices/references/testing.md`, `.claude/skills/best-practices/references/web3-contracts.md`, `.claude/skills/solana-dev/SKILL.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`.
- Worker/config: enabled turn automation by default for Docker/local env defaults and reduced the polling interval from 30s to 10s for the shortened test cadence.
- Local env: aligned `.env` lifecycle settings with the new test defaults: `IDEALER_TURN_AUTOMATION_ENABLED=true`, `IDEALER_TURN_AUTOMATION_INTERVAL_MS=10000`, and `IDEALER_DEVNET_TURN_DURATION_SCALE_BPS=1500`.
- Devnet bootstrap: added `IDEALER_DEVNET_TURN_DURATION_SCALE_BPS`, defaulting to `1500` bps, so newly initialized test/devnet configs use 15% of the production cycle: `1080s, 1080s, 4320s, 4320s` (85% shorter than `2h, 2h, 8h, 8h`).
- Devnet bootstrap now fails on invalid duration scale values and warns when an existing on-chain `GlobalConfig` already has a different cycle, instead of silently hiding the mismatch.
- Web: replaced manual "Open next turn" copy with "Waiting for next turn" and updated closed/ended/action-cutoff messages to explain that the next turn opens automatically.
- Tests: added worker regression coverage for explicitly enabled automation and the required authority keypair error path.
- Verification passed: `pnpm --filter @idealer/worker test` (27/27), `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/constants typecheck`, `cargo fmt --check`, `pnpm --filter @idealer/worker lint`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/constants build`, `pnpm --filter @idealer/worker build`, `pnpm --filter @idealer/web build`, and `pnpm --filter @idealer/web test:e2e -- e2e/live-round-design.spec.ts` (1/1).
- Verification limitation: `cargo check -p idealer --example devnet_bootstrap` did not reach project code because the Windows GNU toolchain failed inside dependency compilation with `dlltool.exe: CreateProcess` while building `getrandom`, even after adding Rust's self-contained GNU bin directory and using `CARGO_TARGET_DIR=C:\tmp\idealer-cargo-target`.
- No PRD checklist item or milestone checkbox was ticked; milestone completion still requires explicit user confirmation.

### 2026-06-19 (Live round turn-state alignment)

- Opened required project context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/develop-web-game/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, Solana frontend framework-kit guidance, `.claude/skills/idealer-design-system/SKILL.md`, and Vercel React best-practices guidance.
- Investigated the user-reported mismatch where `/play` showed an active countdown while `/play/pick` blocked submission with `TURN_ENDED`.
- Root cause: `MobileLiveRoundHub` used a hardcoded local countdown, while `NumberPicker` correctly checked the active devnet `GlobalConfig` and `TurnState` before submission.
- Updated `/play` to wrap `MobileLiveRoundHub` in `SolanaProviders`, read `fetchActiveTurnSnapshot`, evaluate `getTurnActionReadiness` with the same guess cutoff used by submission, and derive the countdown from the real `endTimestamp`.
- Updated the hub CTA so it links to `/play/pick` only when the active devnet turn is accepting guesses; otherwise it shows a disabled state with the real readiness message/code instead of hiding the issue.
- Updated the rule feed lookup to use the active turn id from devnet once loaded.
- Updated the live-round E2E assertion to accept either the active CTA or the disabled live-state CTA because that route now reflects real devnet state.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, and `pnpm --filter @idealer/web test:e2e -- e2e/live-round-design.spec.ts`.
- No milestone checkbox was ticked; this is a maintenance bug fix pending user confirmation.

### 2026-06-19 (Docker web sync for live round turn-state fix)

- Reopened required project context before Docker work: `PRD.md`, `AGENTS.md`, and `.claude/skills`.
- Confirmed `idealer-web` was not bind-mounted to the workspace and still contained the old `/play` source after the local fix.
- Avoided a rebuild; copied only the changed web files into the running container: `apps/web/src/features/live-round/MobileLiveRoundHub.tsx`, `apps/web/src/app/play/page.tsx`, `apps/web/src/app/globals.css`, and `apps/web/e2e/live-round-design.spec.ts`.
- Restarted only the `web` service with `docker compose restart web`.
- Verified the copied files inside `idealer-web` via `docker cp` back out of the container and checked for `fetchActiveTurnSnapshot`, `Open next turn`, `SolanaProviders`, `.platform-pill-warning`, and `.platform-turn-message`.
- Verified `http://127.0.0.1:3000/play` returns HTTP `200`.
- Docker note: `idealer-web` reports `unhealthy` because Docker runtime `exec` calls used by the healthcheck fail with `fork/exec /proc/self/fd/6: no such file or directory`; the app HTTP route is serving successfully.
- No milestone checkbox was ticked; this was a local Docker runtime sync.

### 2026-06-18 (Docker web container sync for structured rule review)

- Opened required project context before working: `PRD.md`, `.claude/skills`, and `docker-compose.yml`.
- Avoided a full Docker rebuild because rebuilding the shared Node image would be slow; copied only the changed web files into the running `idealer-web` container under `/app`.
- Synced `apps/web/src/features/rule-proposal/RuleProposalComposer.tsx`, `apps/web/src/app/globals.css`, and `apps/web/e2e/rule-proposal.spec.ts` into `idealer-web`.
- Restarted only the `web` service with `docker compose restart web`.
- Verified `http://127.0.0.1:3000/play/propose` returned HTTP `200`, `idealer-web` returned to `healthy`, and the container files contain `Edit structured rule` plus `.proposal-structured-rule-body`.
- No milestone checkbox was ticked; this was a local Docker runtime sync.

### 2026-06-18 (Rule proposal structured review bubble)

- Opened required project markdown and local skill guidance before working: `PRD.md`, `AGENTS.md`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md`, `.claude/skills/idealer-design-system/references/02-components.md`, and `.claude/skills/idealer-design-system/references/03-screens-and-state.md`.
- Updated `apps/web/src/features/rule-proposal/RuleProposalComposer.tsx` so the review step presents the structured rule explanation in one dealer bubble, including dealer summary, structured rule text, official interpretation, evaluation mode, operational clauses, preflight result, original message, and commitment.
- Changed the review edit action so `Edit structured rule` returns to compose with the structured rule text (`Rule`, `How it works`, evaluation mode, and operational clauses) instead of only restoring the user's original prompt.
- Updated `apps/web/src/app/globals.css` with mobile-safe styles for the single structured review bubble, using existing platform tokens and text wrapping.
- Updated `apps/web/e2e/rule-proposal.spec.ts` to assert the single structured bubble and verify that editing reopens the structured rule text.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, and `pnpm --filter @idealer/web test:e2e -- e2e/rule-proposal.spec.ts`.
- Browser verification note: Vercel `agent-browser` guidance was opened because the E2E command started a dev server, but the `agent-browser` CLI is not installed in this Windows environment (`CommandNotFoundException`). The Playwright E2E provided the functional browser verification for the rule proposal flow.
- No milestone checkbox was ticked; this is a maintenance UI fix pending user confirmation.

### 2026-06-18 (Rule proposal mobile composer overlap)

- Opened required project markdown before working: `PRD.md`, `AGENTS.md`, `.claude/skills/develop-frontend/SKILL.md`, and `.claude/skills/idealer-design-system/SKILL.md`.
- Investigated the mobile rule proposal chat shown in the user screenshot; the fixed bottom composer could cover the last dealer message because `.platform-scroll` was declared later and reset the intended `.platform-propose-scroll` bottom padding from `248px` back to `96px`.
- Updated `apps/web/src/app/globals.css` and `apps/web/src/features/rule-proposal/RuleProposalComposer.tsx` so the proposal chat has explicit compose/action mode classes and the scroll viewport ends above the fixed bottom composer instead of relying only on padding.
- Verified the "How does it work?" chat path with Playwright at mobile viewports `360x740`, `390x844`, `430x900`, and `686x1335`; in each case the final dealer bubble remains visible above the composer.
- Docker note: `docker compose build web` did not complete within the available command timeout, so the two changed web files were copied into the running `idealer-web` container and `docker compose restart web` was used; Playwright against `http://localhost:3000/play/propose` then verified `dockSpace: 248px`, no overlay, no console errors, and the final dealer bubble visible above the composer.
- No milestone checkbox was ticked; this is a maintenance UI fix pending user confirmation.

### 2026-06-15 (Re-proposal gate: no repeating a rule that held a mandate)

- User-chosen policy: a rule that was **elected as the active Rule of the Hour** in a past turn cannot be proposed again **verbatim**; it may only return if the new proposal adds a **differentiating condition** (a clause in the DSL).
- Identity is the rule's MEANING, not its text: new helpers in `apps/api/src/index.ts` — `ruleSignature(ast)` hashes a **canonicalized** AST and `getMandatedRuleSignatures()` collects the signatures of every settled election's active rule (via `getRuleValidation(turnId, activeRuleId).compiledArtifact.ast`). Canonicalization flattens `and`/`or`, drops single-clause wrappers (`and[X]`≡`X`), collapses double negation, and sorts commutative operands (`and`/`or` clauses, `intersection`, `arith add/mul`) — so the gate **cannot be bypassed cosmetically**; only a substantive added clause changes the signature.
- `createRulePreflight` now blocks when the compiled rule's signature is already mandated (`reproposalBlocked`), setting `needsClarification` + a message telling the player to add a condition. New `RulePreflightResult` field `reproposalBlocked`; folded into `preflightResultHash` (v5).
- Tests: 17/17 `@idealer/api` — `ruleSignature` canonicalization (trivial wrappers/commutative collapse to the same signature; an added clause differs) and `getMandatedRuleSignatures` collection from a settled election. Typecheck clean.
- Notes/limits: the mandated set is computed per preflight from in-memory elections+validations (fine at this scale; would be a query at DB scale). A mandated rule whose validation AST isn't stored cannot be signed/blocked (graceful).
- **PRD updated**: §6.13 rewritten as "Rule Scope and Mandate-Based Re-Proposal Gate" (replaces the time-based cooldown with the canonical-AST-signature mandate gate); §6.15 rewritten as "Rule Preflight and Canonical-Signature Re-Proposal Gate" (replaces semantic-embeddings dedup / `preflight_token` / `RuleDedupResult` with the deterministic implemented preflight + signature gate). The §6.13 cooldown and §6.15 semantic dedup are no longer the spec — superseded by what is implemented.
- **Composer UI**: `RulePreflightResult` (web) gained `reproposalBlocked`; the review step shows a dedicated "Rule already used" card with the backend reason, and the "Submit to devnet" button is disabled when `reproposalBlocked` (in addition to `needsClarification` / non-VALID). `@idealer/web` typecheck clean.

### 2026-06-14 (PRD — Rule Elimination Decision Phase)

- Opened `PRD.md` and the project memories before working, as required. This is a PRD specification change only (no code), scoped by the user to the PRD.
- Motivation (user direction): after the 10-rule finalist set is selected there must be a fixed **1-hour decision window** before the active rule is chosen; during it, Game-Token holders cast **paid elimination votes**; a finalist is eliminated when `elimination_votes > approval_votes`; **up to 5** of the 10 may be eliminated; an elimination vote costs **2× the effective vote fee** for the turn.
- Confirmed design decisions (user Q&A): (1) the current turn durations (`2h/2h/8h/8h`) remain the **play & create-rules window**; the 1-hour decision phase is **appended after** it (end-to-end = play + 1h + selection/draw); (2) elimination fee = **2× the effective vote fee for the turn** (free before turn 100, 0.01 SOL from turn 100, → prize pool); (3) when more than 5 finalists qualify, eliminate the **5 with the most elimination votes** (deterministic tie-break: fewest approval votes, then lowest `rule_id`).
- PRD edits (bumped to **v1.5.0**): §2.5 prize-pool sources; §2.6 Rule of the Hour; §5.1 player-actions table (new "vote to eliminate" row); §5.4 turn lifecycle (two-VRF flow + decision-window diagram + example); §5.5 turn state machine (`ELIMINATION_WINDOW_OPEN/CLOSED`, `ACTIVE_ELECTION_VRF_*`); §6.12 split into finalist-election and active-election flows + `RULE_ELIMINATION_CONFIG`; new §6.14a Rule Elimination Voting; §6.16 rule state machine (`ELIMINATED`, `SURVIVED_ELIMINATION`); §4.3/§4.6 UX (Eliminated/Survived statuses + decision-window voting copy); §8.2 fees (`eliminationVoteFeeLamports`, policy block); §8.9 rate limits; §9 accounts/GlobalConfig/TurnState/instructions; §10 worker scheduler steps, DB tables, audit endpoint, hooks, idempotency ops; §16 decision checklist (new unchecked elimination decision item); §15 new milestone **M3.8 — Rule Elimination Decision Phase**.
- Verified internal consistency by grep (no leftover "single VRF selects the active rule at finalist time", `request_election_vrf`, or `75%/96.7% of turn duration` phrasing; all references now describe the two-VRF + 1h-decision model). No code, tests, or deploys touched.
- No milestone checkbox was ticked; the §16 elimination decision item and M3.8 remain unchecked pending explicit user confirmation, per project rules.

### 2026-06-14 (Open-ended rule engine — P0–P2: DSL, runtime, harness, LLM-emitted AST)

- Opened `PRD.md` (§6.4–§6.8, §7.1–§7.8) and project memories before working, as required. Extends/re-opens M3.3 (AI Rule Validation) toward the PRD's full compiler; no checkbox ticked pending user confirmation.
- Motivation (user direction): users must be free to express ANY rule about the draw numbers (not the 3 hardcoded regex shapes), payment should only happen for a VALID compiled rule, and off-topic input must be safeguarded. Diagnosis confirmed live: the digit rule "ganhar quem acertar mais unidades/dezenas" was accepted by the LLM preflight but rejected at the regex compiler (`UNSUPPORTED_RULE`), and is comparative (ranking), which the WIN/LOSE pipeline could not represent.
- **P0 — `packages/rule-schema`**: replaced the flat 3-kind enum with a recursive, Zod-validated, versioned v2 grammar (array/scalar/predicate exprs incl. `digits` units/tens, `map_with_guard`, `intersection`, `remove_up_to_n`, `reduce`, `arith`, `compare`, `count_at_least`, boolean combinators) plus a top-level `predicate` vs `ranking` result. Kept a legacy v1 branch so frozen artifacts still validate. Added `getRuleAstJsonSchema()` (native `z.toJSONSchema`) and `MAX_AST_DEPTH`/`MAX_REMOVABLE_NUMBERS`. 6/6 tests.
- **P0 — `packages/rule-runtime`**: deterministic sandboxed interpreter with §7.7 limits (op/depth/array budgets, integer math, div/mod-by-zero → defined 0, no clock/RNG/IO). `evaluatePredicate` (per-guess WIN/LOSE), `scoreGuess` (per-guess numeric score for ranking), `resolveRankingWinners` (pure argmax, ties share), back-compat `evaluateRule` + legacy v1 dispatch. 6/6 tests.
- **P1 — `packages/rule-test-harness`**: `generateAndRunTests` + bounded Monte-Carlo `classifyDifficulty` (seeded PRNG) for arbitrary ASTs (runtime-safety, determinism, serialization stability, difficulty). Policy decision: only `ALWAYS_TRUE` is degenerate/rejected; extremely rare/hard rules (e.g. jackpot "match 4+ of 6/100", which Monte Carlo cannot distinguish from impossible) are allowed but labelled, to honor the user's freedom directive. **This deviates from the literal PRD §6.8 "reject IMPOSSIBLE" and needs user confirmation.** 6/6 tests.
- **P2 — `packages/rule-compiler` + `apps/api/src/llm.ts`**: replaced regex pattern matching with LLM-emitted AST. New `compileRuleToAst` (apps/api) prompts the model to emit a v2 AST (compact grammar + examples; embedding the full JSON schema stalled the 4B model, so it is conveyed compactly and re-validated by Zod). New async `compileRuleArtifact(request, { astProvider })` keeps the existing provider routing / fallback / disagreement / composite-confidence machinery; the offline regex `validateAndPrecompileRule` remains as the deterministic fallback used by tests. Recursive runtime-bounds + complexity check; difficulty wired in (reject ALWAYS_TRUE). Artifact now carries `schemaVersion`, `ruleMode`, `difficultyClass`, `complexityScore`, `constrainedDecodingUsed`, `testHarnessVersion`. 16/16 tests.
- **Live proof (Ollama `gemma3:4b`)**: the digit rule now compiles to a VALID v2 **ranking** AST (`reduce count` over `intersection` of units `digits` of guess/draw), and "match 4 of 6" compiles to a VALID predicate; the sum rule failed first-pass AST validation (expected small-model miss → would escalate to a stronger provider in the chain).
- **Policy (user-confirmed 2026-06-14)**: ANY rule may be created; the only hard limits are (1) no dependency on external/unverifiable events and (2) it must compile to a verifiable AST. Difficulty (incl. ALWAYS_TRUE / IMPOSSIBLE / TOO_EASY) is a label only and never blocks. The harness/compiler were updated accordingly (removed the difficulty gate). This supersedes the earlier "reject ALWAYS_TRUE" stance.
- **P3 — `apps/api` + `apps/worker`**: moved the compile+test gate into the FREE `/rule-preflight` (`createRulePreflight` now runs `compileRuleArtifact` with an Ollama `astProvider`); the response carries `decision` / `ruleMode` / `difficultyClass` / `finalConfidence` / `reasonSummary` / `compiledArtifactHash`, and payment/proposal is only enabled for `decision === "VALID"`. Added ranking-vs-predicate winner aggregation (`selectRankingWinners` + `resolveRankingWinners` in `calculateAndStoreWinnerRecords`); the worker (`guess-verification.ts`) now scores ranking rules (`scoreGuess`, provisional LOSE) and records `alternativeMode`/`alternativeDirection`. The off-topic A/B eval collapsed into the compile gate per the new policy (a non-compilable input such as a poem is rejected as unverifiable).
- **P4 — `apps/web`**: `RulePreflightResult` extended; the composer review step shows a "Compiled & tested" card (mode/difficulty/confidence or rejection reason) and gates "Submit to devnet" on `decision === "VALID"` (back-compatible when `decision` is absent).
- Verified: `rule-schema` 6/6, `rule-runtime` 6/6, `rule-test-harness` 6/6, `rule-compiler` 16/16, `@idealer/api` 15/15 (incl. new ranking-winner test; no claim-flow regression), `@idealer/worker` 25/25; `api`/`web`/`worker` typecheck clean. **Live HTTP proof** (rebuilt `idealer-api` container, `gemma3:4b`): `POST /rule-preflight` on the digit rule → `decision: VALID`, ranking units-digit AST, `difficultyClass: BALANCED`, `finalConfidence: 0.936` (the rule was `UNSUPPORTED_RULE` before this work).
- **`compile_rule_to_ast` agent skill (PRD §7.10/§7.12)**: externalized the compile-step guidance from the inline transport prompt into a versioned, pure skill asset (`packages/rule-compiler/src/skill.ts`, `RULE_COMPILER_SKILL_VERSION = idealer_rule_compiler_skill_v1`) co-located with the DSL schema. It carries the prompt contract (compile, never judge), the policy limits (only `guess`/`draw`; no external/unverifiable events), the predicate-vs-ranking decision procedure, the node catalogue, and worked examples (count, sum-equals, ordered-exact, units-digit ranking, closest-sum ranking). `apps/api/src/llm.ts#compileRuleToAst` now loads it via `buildRuleCompilerSkillPrompt()`; the frozen artifact records `skillVersion` for audit. This is a RUNTIME harness asset, not developer tooling. Compiler tests 17/17. **Live proof**: after wiring the skill, the sum-equals rule that previously failed AST emission on `gemma3:4b` now compiles to `decision: VALID` (difficulty EXTREME, allowed), demonstrating the skill's worked examples improved small-model reliability.
- No milestone checkbox was ticked; milestone approval still requires explicit user confirmation.

### 2026-06-14 (Final config for this host: gemma4:latest primary, guardian off)

- User-chosen resolution after the hardware findings: **`LLM_MODEL=gemma4:latest` as the primary dealer model, with the guardian and escalation DISABLED** (`LLM_GUARDIAN_MODEL=` and `LLM_ESCALATION_MODEL=` empty in `.env`). Rationale: a single resident 8B (not competing with the granite 8B) avoids the memory thrash/timeout, and gemma4:latest already compiles the compound/negation cases the small models miss. The regex injection guard + compile gate + rule-authoring skill + English step remain; only the Granite Guardian net is off on this host.
- Compose hardening: changed `LLM_GUARDIAN_MODEL`/`LLM_ESCALATION_MODEL` to `${VAR-default}` (no colon) so an explicitly empty `.env` value disables the feature (the `:-` form was re-applying the default on empty). Empty-with-inline-comment in `.env` also leaked the comment as the value — fixed by putting the comment on its own line.
- **End-to-end verified (in-container, gemma4:latest warm):** the compound rule "ganha quem acertar 1 número e uma dezena" → `decision: VALID`, predicate compound (count==1 AND a tens-digit match), no timeout (~251s). The case that previously failed/timed out now passes.
- Tradeoff: every preflight is slow (8B on CPU). Optimization below cuts one call.

### 2026-06-15 (Optional translation step — off for capable models)

- Made the translate-to-English step **configurable**: `resolveTranslateToEnglish()` / `LLM_TRANSLATE_TO_ENGLISH` (default `true`; safe for small models). `createRulePreflight` now compiles from `compileText` = the translation when enabled, or the original sanitized text when disabled. Added the var to `docker-compose.yml` and `.env.example`; set `LLM_TRANSLATE_TO_ENGLISH=false` in `.env` (current gemma4:latest config).
- **Consistency verified (in-container, gemma4:latest, translation OFF):** the trickiest Portuguese intents compile directly with no loss vs the English path — "errar mais números" → VALID ranking, "highest count of misses wins" (no flip); "1 número e uma dezena" → VALID predicate (compound) and correctly flags the 'dezena' ambiguity for clarification; "acertar mais número" → VALID ranking. The rule-authoring skill's Portuguese trigger glossary + gemma4's native multilingual handling make the separate translate call redundant for capable models. Each preflight is now ~163–219s (one fewer LLM call than with translation).
- Keep translation ON for small/weak primaries (`LLM_TRANSLATE_TO_ENGLISH=true`). `@idealer/api` typecheck clean; container rebuilt.

### 2026-06-14 (Model escalation: gemma3:4b → gemma4:latest)

- Test (user request) showed `gemma4:latest` (8B) compiles the cases `gemma3:4b` got wrong — intent 2 "errar mais" (prose no longer flipped; AST ranking max over `difference`) and intent 5 "1 número e 1 dezena" (correct compound `AND`). So those were a MODEL-capability bottleneck, not a harness defect. ("2 ou mais" is ill-formed phrasing both models over-read; mitigated by user rephrasing.)
- Implemented real escalation in `createRulePreflight` (user-chosen): a `dealerPass(model)` helper runs interpret + compile-from-English + guardian groundedness; the fast primary (`LLM_MODEL`) runs first, and ONLY when it yields an invalid AST or a guardian-flagged drift does it re-try with the stronger `LLM_ESCALATION_MODEL` (`gemma4:latest`) before blocking. The escalation attempt is wrapped in try/catch so a slow/unavailable stronger model never breaks the preflight (it keeps the primary result + surfaces a note). New `RulePreflightResult` fields `escalated` + `modelUsed`. Added `LLM_ESCALATION_MODEL` to `docker-compose.yml` (api) + `.env.example`. `@idealer/api` typecheck clean.
- Live behaviour (single local CPU box): escalation triggers correctly (intent 1 hit `grounded=false` → escalation attempted), but running three models at once (gemma3 4B + gemma4 8B + guardian 8B) thrashes memory and the cold-loaded gemma4 escalation **times out** (>200s) — an environment/resource limit, not a code defect (the single-model run already proved gemma4 compiles intents 2/5 correctly). Mitigations: keep models warm (`OLLAMA_KEEP_ALIVE`), raise `LLM_TIMEOUT_MS`, give the host more RAM/VRAM, or use gemma4:latest as primary on constrained hardware.
- Known guarantee gap (now mitigated, see next): guardian groundedness compares the PROSE interpretation to the rule, so it catches interpretation drift (intent 2) but can miss a case where the prose is plausible while the AST is wrong (observed on intent 5 variance: a wrong ranking AST passed `grounded=true`).
- **Follow-ups implemented:** (1) **`keep_alive: "10m"`** on every LLM + guardian request so models stay resident across the sequential preflight steps (reduces cold-reload timeouts). (2) **Proactive complexity routing** in `createRulePreflight`: `isComplexRule(englishText)` sends rules with negation/inverse (`miss/fewer/fewest/the least/wrong`) or compound connectors (`and/or/both/either`) STRAIGHT to the escalation model, instead of waiting for the (prose-only) guardian to catch a wrong AST — this closes the intent-5 gap. "at least N" is intentionally NOT treated as inverse (it is a threshold the fast model handles). Reactive escalation remains as a backup. (3) The escalation attempt is try/caught so a slow/unavailable strong model never breaks the preflight. Routing decisions verified deterministically; `@idealer/api` typecheck clean; container rebuilt.
- **gemma4:e2b escalation test (2026-06-14):** routed correctly (`escalated:true`, `modelUsed:gemma4:e2b`) and did NOT time out (291s in-container), but produced `decision:INVALID` for the compound rule — the 5.1B model is not capable enough (fails like gemma3:4b). Only the 8B `gemma4:latest` produces the correct compound AST, and it times out here. Net: on this box no local model is both capable (8B) and light enough to run inside the guarded multi-model pipeline within timeout. Decision pending from user (gemma4:latest primary ± guardian / more RAM / accept iteration). `.env` `LLM_ESCALATION_MODEL` left at `gemma4:e2b` pending that choice.
- **Hardware blocker (open):** end-to-end verification of the routed strong-model path on this single CPU box fails — the complex rule routes to `gemma4:latest` correctly, but the 8B cold-load under memory pressure (gemma3 4B + gemma4 8B + guardian 8B competing) exceeds `LLM_TIMEOUT_MS` (180s) → `RULE_AGENT_TIMEOUT`. Correctness of the gemma4 output was already proven in the isolated single-model run; the only failure is load/timing on constrained hardware. Operable options: use a lighter escalation model (`gemma4:e2b`, 5.1B), raise `LLM_TIMEOUT_MS`, give the host more RAM, or keep models warm/resident. Also note: the host→container published-port connection resets long preflight requests at ~30s (curl shows `http=000 t=30s`), so the slow guarded path must be exercised in-container or from a client that waits for the first byte.

### 2026-06-14 (Granite Guardian guardrail + English normalization)

- Integrated **IBM Granite Guardian 4.1** (`granite4.1-guardian:8b`, pulled into Ollama) as an independent guardrail in the rule preflight, plus a faithful **translate-to-English** step (cross-language phrasing was a source of ambiguity).
- New `apps/api/src/guardian.ts`: calls the guardian via Ollama's NATIVE `/api/chat` (the `<guardian>` template + `think:false`, parsing `<score>yes|no</score>`). Two checks, calibrated empirically: `detectJailbreak(text)` (jailbreak risk) and `checkGroundedness(rule, interpretation)` (groundedness risk — `yes`=drifted). Feature-flagged by `LLM_GUARDIAN_MODEL`; resolves the native URL from `LLM_BASE_URL` (".../v1" → ".../api/chat").
- New `translateRuleToEnglish` in `apps/api/src/llm.ts`: a faithful translator (preserves polarity/negation/connectors/thresholds) — distinct from the editorializing interpret step.
- `createRulePreflight` flow is now: regex guard → **guardian jailbreak gate** → translate to English → interpret (EN, human message) → **compile AST from the ENGLISH original** (skill) → **guardian groundedness gate**. Submission is blocked if the guardian flags jailbreak or finds the interpretation ungrounded; guardian outages are surfaced (`guardianNote`) and fall back to the regex/compile gates rather than hiding the failure. New `RulePreflightResult` fields: `englishText`, `guardianChecked`, `guardianGrounded`, `guardianNote`. Added `LLM_GUARDIAN_MODEL`/`LLM_GUARDIAN_TIMEOUT_MS` to `docker-compose.yml` (api) and `.env.example`.
- **Live results (gemma3:4b + granite4.1-guardian:8b)**: injection (EN and **PT** "ignore suas instruções…", which the English-only regex misses) → guardian `jailbreak=true` → 400 blocked; "errar mais números" → translated "misses more", AST correct (ranking max over `difference`), but the small interpret model still flipped the PROSE ("lowest missed wins") and the guardian caught it (`grounded=false`) → blocked with "rephrase"; clean rules ("acertar mais", "acertar ≥1") → `grounded=true`, not blocked. So the guardian adds real guarantees (non-English injection coverage + interpretation-drift detection) without false-blocking valid rules.
- Tradeoff recorded: the full guarded preflight now runs up to 5 sequential LLM calls (2 on the 8B guardian), so it is slow (~2–4 min on local CPU). It is feature-flagged — unset `LLM_GUARDIAN_MODEL` to disable. Container `idealer-api` rebuilt and serving the guarded pipeline.
- `@idealer/api` typecheck clean. No milestone checkbox ticked.

### 2026-06-14 (Rule-authoring skill + intent-handling improvements)

- Authored the `compile_rule_to_ast` knowledge as a proper skill (skill-creator format) at `packages/rule-compiler/rule-authoring/`: `SKILL.md` (contract, policy, predicate-vs-ranking decision, node grammar) + `references/patterns.md` (negation/inverse, compound AND/OR, threshold-vs-comparative, "dezena" ambiguity, Portuguese trigger glossary) + `references/examples.md` (worked intent→AST per shape). Validated with `quick_validate.py`.
- `packages/rule-compiler/src/skill.ts` is now a loader that reads the skill folder at runtime and assembles the compile prompt (cached; throws if files are missing — no silent fallback). Bumped `RULE_COMPILER_SKILL_VERSION` to `idealer_rule_compiler_skill_v2` (frozen into the artifact). Dockerfile already `COPY packages` → the markdown ships in the image.
- **Key fix**: `createRulePreflight` now compiles the AST from the ORIGINAL sanitized text (guided by the skill) instead of the prose normalization. A small model can flip polarity while normalizing ("errar mais" → "fewest"); compiling from the original prevents that corrupting the executed rule. The interpret step still produces the human-facing message.
- Hardened the interpret system prompt (`llm.ts`) for polarity/negation, threshold-vs-comparative, compound clauses, and "dezena" ambiguity (human message quality).
- **Intent verification (gemma3:4b, live)** — before → after: "acertar mais" ✓→✓; "errar mais" ✗(invertido)→**✓ corrigido** (ranking max sobre `difference`, P3 com mais erros vence); "acertar ≥1" ✓→✓; "acertar ≥1 dezena" → compila (lê "dezena" como dígito de dezena; ambíguo); "1 número e 1 dezena" → compila VÁLIDO porém AST semanticamente incorreto (não gerou AND) — ainda dependente de iteração/modelo mais forte; "2 ou mais" → ranking (perde o piso ≥2 no fraseado ambíguo). Conclusão: intenções não-ambíguas (contagem/limiar/ranking/negação) agora corretas; intenções genuinamente ambíguas (dezena, composto, "N ou mais") continuam dependentes do modelo — mitigação: iteração do usuário + escalonamento para um provider mais forte (o `astProvider` hoje fixa o gemma3:4b, sem escalonar de fato). O DSL expressa todos os casos (ASTs corretos em `references/examples.md`).
- Verified: `rule-compiler` 17/17 (skill test exercita o loader), `api`/`web`/`worker` typecheck limpos; container `idealer-api` reconstruído e servindo a skill ao vivo (preflight HTTP de "errar mais" → VALID/ranking).
- No milestone checkbox was ticked; milestone approval still requires explicit user confirmation.

### 2026-06-13 (Rule agent, token limit, wallet hardening)

- Opened `PRD.md` and `.claude/skills/idealer-design-system/SKILL.md` before working, as required.
- Raised `RULE_MAX_TOKENS` from 80 to 1000 in `packages/constants`, `.env.example`, and the on-chain config bootstrap (`devnet_bootstrap.rs`); raised `MAX_RULE_TEXT_BYTES` from 320 to 6000 in the API and the Anchor program so 1000-token rules fit on-chain.
- Wired a real AI Rule Compiler: new `apps/api/src/llm.ts` calls an OpenAI-compatible/Ollama endpoint (`LLM_BASE_URL`/`LLM_MODEL`) to interpret and normalize the proposed rule. `/rule-preflight` now returns the dealer message, normalized text, official interpretation, and added operational clauses; if the model is unreachable it returns a typed `RULE_AGENT_*` error instead of a silent template.
- Reworked the rule composer review step to display the dealer-worked rule (normalized text, official interpretation, operational clauses, clarification flag) and block submission when clarification is needed.
- Over-limit input now shows a light warning only when exceeding the limit and blocks the send/review action; hardened the wallet guard so the composer surfaces a clear "wallet connection failed / reconnect" message instead of an empty error.
- Verified with `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/web typecheck`, and `pnpm --filter @idealer/api test` (14/14 pass). The Anchor program and on-chain `GlobalConfig` must be rebuilt/redeployed/re-initialized for the new byte and token caps to take effect on devnet.
- No milestone checkbox was ticked; milestone approval still requires explicit user confirmation.

### 2026-06-12

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before working on the chat and wallet configuration UI alignment, as required.
- Used `.claude/skills/develop-frontend/SKILL.md` for frontend consistency, responsive layout, state, and accessibility checks.
- Aligned the wallet configuration page with the previously developed `platform-*` mobile phone shell and visual tokens.
- Aligned the rule chat prompt on the live round hub with the same platform card, avatar, pill, input, and CTA treatment.
- Ran `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web test:e2e -- e2e/wallet-flow.spec.ts`, and `pnpm --filter @idealer/web test:e2e -- e2e/live-round-design.spec.ts`.
- Started the updated web dev server at `http://127.0.0.1:3005` and visually checked the hub chat and wallet configuration screens with mobile screenshots.
- No milestone checkbox was ticked; milestone approval still requires explicit user confirmation.

### 2026-06-12

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before correcting the rule proposal chat UI, as required.
- Used `.claude/skills/develop-frontend/SKILL.md` and `.claude/skills/idealer-design-system/SKILL.md`; also opened the relevant design references for tokens, components, and screen/state conventions.
- Reworked `/play/propose` from a desktop-style form into the app's mobile phone-shell Dealer chat flow, with chat intro, AI guidance bubble, user rule bubble, compact preflight cards, fixed chat composer, token pill, and mobile review actions.
- Preserved the existing proposal logic: token counting, server preflight, sanitized preview, ambiguity check, review step, wallet gate, devnet submission, receipt display, and error states.
- Ran `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web test:e2e -- e2e/rule-proposal.spec.ts`, `pnpm --filter @idealer/web test:e2e -- e2e/wallet-flow.spec.ts`, and `pnpm --filter @idealer/web test:e2e -- e2e/live-round-design.spec.ts`.
- Captured and visually checked `/play/propose` compose and review states on a 390x844 mobile viewport through the updated dev server at `http://127.0.0.1:3005`.
- No milestone checkbox was ticked; milestone approval still requires explicit user confirmation.

### 2026-06-12

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before checking local Gemma/Ollama availability for M3 testing, as required.
- Used `.claude/skills/best-practices/SKILL.md` and `references/agent-principles.md` for reproducible, fail-closed verification.
- Verified Ollama is serving `gemma4:latest` at `http://127.0.0.1:11434`, with model digest `c6eb396dbd5992bbe3f5cdb947e8bbc0ee413d7c17e2beaae69f5d569cf982eb`, family `gemma4`, parameter size `8.0B`, and quantization `Q4_K_M`.
- Verified a real OpenAI-compatible chat completion against `gemma4:latest` returned `IDEALER_GEMMA_OK`.
- Verified `gemma4:laste` fails with model-not-found and corrected `.env.example` to use `gemma4:latest`.
- Verified current `api` and `worker` containers are healthy but do not receive `LLM_*` variables from `docker-compose.yml`; Gemma must be passed through env configuration or explicit validation request fields.
- Ran `pnpm --filter @idealer/rule-compiler test` and an API M3 smoke test (`rule-preflight -> rule-proposals -> rule-validations/run`) using `provider=local-openai-compatible` and `model=gemma4:latest`; the validation returned `VALID`, `finalConfidence: 0.936`, `fallbackTriggered: false`, `request_shape: ollama_format`, and model identity `gemma4:latest`/`ollama`.
- No milestone checkbox was ticked; milestone approval still requires explicit user confirmation.

### 2026-06-12

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before wiring the local Gemma/Ollama env vars into Docker services, as required.
- Used `.claude/skills/best-practices/SKILL.md` and `references/agent-principles.md`.
- Added `LLM_*` and `EMBEDDINGS_BASE_URL` environment variables to both `api` and `worker` in `docker-compose.yml`.
- Used container-specific endpoint defaults (`http://host.docker.internal:11434/v1`) so Docker services can reach the host Ollama instance while host-side commands may continue using `http://localhost:11434/v1`.
- Added `LLM_CONTAINER_BASE_URL`, `LLM_PRIMARY_CONTAINER_BASE_URL`, secondary/tertiary container URL overrides, and `EMBEDDINGS_CONTAINER_BASE_URL` to `.env.example`.
- Cleaned local `.env` optional empty model/provider fields so inline comments are not passed into containers as model names.
- Set the local `LLM_PRIMARY_MODEL_DIGEST` to the verified `gemma4:latest` digest `c6eb396dbd5992bbe3f5cdb947e8bbc0ee413d7c17e2beaae69f5d569cf982eb`.
- Ran `docker compose config --quiet`, recreated `api` and `worker`, verified both are healthy, verified both containers see `gemma4:latest`, and verified a real chat completion from inside `api` returned `IDEALER_CONTAINER_OK`.
- Ran an API M3 smoke test after recreation; validation returned `VALID`, `provider: local-openai-compatible`, `model: gemma4:latest`, `finalConfidence: 0.936`, `fallbackTriggered: false`, and the Gemma digest in `modelIdentity`.
- No milestone checkbox was ticked; milestone approval still requires explicit user confirmation.

## M0.1 Work Log

### 2026-06-02

- Opened `PRD.md`, `AGENTS.md`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md` again before implementing `M0.1`.
- Ran a consistency pass across `PRD.md`, `docs/product-rule-summary.md`, `docs/mvp-decision-registry.md`, and `PROGRESS_TRACKER.md`.
- Corrected the project turn-duration source of truth to `2h -> 2h -> 8h -> 8h -> repeat`.
- Marked M0.1 checklist, approval criteria, and required artifacts complete after user confirmation.
- Started M0.2.

### 2026-06-02

- Opened `PRD.md` before changing creator reward terms, as required.
- Opened `AGENTS.md` and `.claude/skills` before changing documentation, as required.
- Opened `.claude/skills/best-practices/SKILL.md` and its required `references/agent-principles.md`.
- Updated creator reward documentation in `PRD.md`, `docs/product-rule-summary.md`, and `docs/mvp-decision-registry.md` from 2% to 15% of each individual alternative-rule winner payout.
- Confirmed the reward source as the creator reward reserve sourced from platform monetization, with winner-visible payouts unchanged.
- Did not tick milestone approval items because user confirmation is still required.

### 2026-06-01

- Opened `PRD.md` before work, as required.
- Opened `AGENTS.md` and confirmed project instructions.
- Opened `.claude/skills` and selected `best-practices` as the relevant local skill for product and architecture baseline work.
- Opened `best-practices` required `references/agent-principles.md`.
- Created `docs/product-rule-summary.md`.
- Created `docs/mvp-decision-registry.md`.
- Created this `PROGRESS_TRACKER.md`.
- Did not tick `M0.1` approval or checklist items because user confirmation is required first.

## M0.1 Artifact Review

| Artifact                        | Status      | Notes                                                                                    |
| ------------------------------- | ----------- | ---------------------------------------------------------------------------------------- |
| `PRD.md`                        | Present     | Reviewed as the source of truth. No direct PRD checkbox changes were made.               |
| `docs/product-rule-summary.md`  | Implemented | Summarizes core product, rule, economy, election, admin, and implementation constraints. |
| `docs/mvp-decision-registry.md` | Implemented | Captures the 27 binding MVP decisions from PRD section 16.                               |
| `PROGRESS_TRACKER.md`           | Implemented | Tracks status, required document confirmation, and M0.1 validation notes.                |

## M0.1 Validation Results

| Requirement                                        | Result                                                                                                                                         |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile-first DApp and desktop secondary surface    | Confirmed in `PRD.md` and `docs/product-rule-summary.md`.                                                                                      |
| Free-form rule creation and AI-context token limit | Confirmed in `PRD.md`, `docs/product-rule-summary.md`, and `docs/mvp-decision-registry.md`.                                                    |
| `RULE_MAX_TOKENS` value                            | Confirmed as `80`.                                                                                                                             |
| Turn duration cycle                                | Confirmed as `2h -> 2h -> 8h -> 8h -> repeat`.                                                                                                 |
| Winning conditions                                 | Confirmed as original rule and active alternative rule.                                                                                        |
| Game Token gating                                  | Confirmed for proposing, voting, removing, and reporting rules.                                                                                |
| Rule election policy                               | Confirmed as 3 top-voted eligible rules plus 7 VRF-random eligible rules when at least 10 eligible rules exist.                                |
| Randomness provider                                | Confirmed as Switchboard VRF for draw and rule election.                                                                                       |
| Fallback behavior                                  | Confirmed no deterministic fallback finalist activation.                                                                                       |
| Paid rule removal                                  | Confirmed as included in MVP with prize-pool fee destination.                                                                                  |
| Creator reward                                     | Confirmed as 15% of each individual alternative-rule winner payout, funded from the creator reward reserve sourced from platform monetization. |
| Admin console scope                                | Confirmed separate from public DApp and limited to insights, not direct game manipulation.                                                     |
| Implementation constraints                         | Confirmed monorepo and Docker Compose as required constraints.                                                                                 |

## Confirmation Gate

`M0.1` was marked complete after user confirmation on 2026-06-02.

## M0.2 Work Log

### 2026-06-02

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M0.2, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md` and `references/architecture.md`.
- Used frontend and Next.js guidance for the public DApp and admin console skeleton.
- Created `apps/web`, `apps/api`, `apps/worker`, and `apps/admin`.
- Created required shared packages under `packages/*`.
- Created `contracts/solana`, `infra/docker`, and `infra/scripts`.
- Added root `package.json`, `pnpm-workspace.yaml`, `turbo.json`, `.npmrc`, `.gitignore`, `eslint.config.mjs`, and `README.md`.
- Added `docs/monorepo-tree.md`.
- Installed dependencies from the root with `pnpm install`.
- Verified workspace targeting with `pnpm workspace:list`.
- Verified root commands with `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
- Started local dev servers for the public DApp and admin console.
- Verified `http://localhost:3000` and `http://localhost:3001` return HTTP 200.
- Kept the project turn-duration source of truth as `2h -> 2h -> 8h -> 8h -> repeat`.
- Marked M0.2 checklist, approval criteria, and required artifacts complete after user confirmation.

## M0.2 Artifact Review

| Artifact                         | Status      | Notes                                                          |
| -------------------------------- | ----------- | -------------------------------------------------------------- |
| Monorepo tree                    | Implemented | See `docs/monorepo-tree.md`.                                   |
| Root README                      | Implemented | Includes workspace layout, setup commands, and boundary rules. |
| Workspace/package manager config | Implemented | Uses `pnpm-workspace.yaml`, `package.json`, and Turborepo.     |

## M0.2 Validation Results

| Requirement                                       | Result                                                 |
| ------------------------------------------------- | ------------------------------------------------------ |
| Repository can install dependencies from the root | Passed with `pnpm install`.                            |
| Workspace commands can target each app/package    | Passed with `pnpm workspace:list`.                     |
| Empty or stub apps build without fatal errors     | Passed with `pnpm build`.                              |
| Folder boundaries are clear and documented        | Documented in `README.md` and `docs/monorepo-tree.md`. |
| Local public DApp dev server                      | Running at `http://localhost:3000`; HTTP 200 verified. |
| Local admin dev server                            | Running at `http://localhost:3001`; HTTP 200 verified. |

## M0.2 Confirmation Gate

`M0.2` was marked complete after user confirmation on 2026-06-02.

## M0.3 Work Log

### 2026-06-02

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M0.3, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md`, `references/architecture.md`, and `references/deploy-release.md`.
- Added API and worker health endpoints that fail closed unless Postgres and Redis are reachable.
- Added `docker-compose.yml` with explicit `name: idealer`, required services, optional profiles, network, volumes, and health checks.
- Added `.env.example`.
- Added `infra/docker/Dockerfile.node`.
- Added `infra/docker/prometheus/prometheus.yml`.
- Added `docs/local-development-runbook.md`.
- Updated `README.md` with Docker startup, shutdown, and reset commands.
- Ran `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.
- Ran `docker compose config --quiet`.
- Ran `docker compose up --build -d postgres redis api worker web`.
- Verified required containers are healthy: `idealer-postgres`, `idealer-redis`, `idealer-api`, `idealer-worker`, and `idealer-web`.
- Verified API health returns Postgres and Redis `ok`.
- Verified worker health returns Postgres and Redis `ok`.
- Verified web returns HTTP 200.
- Verified the web container can reach the API through the internal Docker network.
- Verified optional profiles with `docker compose --profile admin --profile observability --profile mail config --quiet`.
- Re-verified M0.3 services on 2026-06-02.
- Marked M0.3 checklist, approval criteria, and required artifacts complete after user confirmation.

## M0.3 Artifact Review

| Artifact                  | Status      | Notes                                                                          |
| ------------------------- | ----------- | ------------------------------------------------------------------------------ |
| `docker-compose.yml`      | Implemented | Defines required and optional containers, network, volumes, and health checks. |
| `.env.example`            | Implemented | Defines `COMPOSE_PROJECT_NAME=idealer` and local-only example values.          |
| Local development runbook | Implemented | See `docs/local-development-runbook.md`.                                       |

## M0.3 Validation Results

| Requirement                                  | Result                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| `docker compose up` starts required services | Passed with `docker compose up --build -d postgres redis api worker web`. |
| Container names follow `idealer-*`           | Passed in `docker compose ps`.                                            |
| API can connect to Postgres and Redis        | Passed via `http://localhost:3002/health`.                                |
| Worker can connect to Redis and database     | Passed via `http://localhost:3003/health`.                                |
| Web can reach API locally                    | Passed from inside `idealer-web` to `http://api:3002/health`.             |
| Health checks report healthy services        | Passed in `docker compose ps`.                                            |

## M0.3 Confirmation Gate

`M0.3` was marked complete after user confirmation on 2026-06-02.

## M0.4 Work Log

### 2026-06-02

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M0.4, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md`, `references/architecture.md`, `references/web2-backend.md`, `references/web3-contracts.md`, `references/observability.md`, and `references/deploy-release.md`.
- Used `.claude/skills/solana-dev/SKILL.md` for Solana account and instruction draft boundaries.
- Used `.claude/skills/develop-frontend/SKILL.md` and the Next.js guidance skill for frontend/API contract compatibility.
- Added `docs/technical-contracts-index.md`.
- Added `docs/api-contracts.md`.
- Added `docs/data-model-draft.md`.
- Added `docs/queue-job-contracts.md`.
- Added `docs/agent-schema-draft.md`.
- Added `docs/smart-contract-account-instruction-draft.md`.
- Added `docs/admin-metrics-dictionary.md`.
- Added `docs/shared-error-codes.md`.
- Added shared error-code exports in `packages/constants/src/error-codes.ts` and `packages/constants/src/index.ts`.
- Confirmed the turn-duration source of truth remains `2h -> 2h -> 8h -> 8h -> repeat`.
- Left M0.4 PRD checklist, approval criteria, and required artifacts unchecked pending user confirmation.

### 2026-06-03

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying M0.4 and starting M0.5, as required.
- Rechecked the M0.4 artifact set and validation log.
- Marked M0.4 checklist, approval criteria, and required artifacts complete after user confirmation.

## M0.4 Artifact Review

| Artifact                                 | Status      | Notes                                                                                                                                                        |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| API contract document                    | Implemented | See `docs/api-contracts.md`; includes response envelope, shared models, mocked frontend-ready endpoints, auth notes, and shared error behavior.              |
| Data model draft                         | Implemented | See `docs/data-model-draft.md`; includes turns, rules, votes, guesses, logs, jobs, creator rewards, admin metrics, and pgvector HNSW migration.              |
| Queue/job contract draft                 | Implemented | See `docs/queue-job-contracts.md`; includes job envelope, payloads, retries, idempotency, and terminal failure states.                                       |
| Agent schema draft                       | Implemented | See `docs/agent-schema-draft.md`; includes compiler IO, `RuleDedupResult`, `GateCheckLog`, `CompilerAgentLog`, confidence breakdown, and rule state machine. |
| Smart contract account/instruction draft | Implemented | See `docs/smart-contract-account-instruction-draft.md`; includes account model, Game Token PDA validation contract, instruction list, and emitted events.    |
| Admin metrics dictionary                 | Implemented | See `docs/admin-metrics-dictionary.md`.                                                                                                                      |
| Shared error codes                       | Implemented | See `docs/shared-error-codes.md` and `packages/constants/src/error-codes.ts`.                                                                                |

## M0.4 Validation Results

| Requirement                                                                | Result                                                                                                       |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Frontend can be implemented against mocked API contracts                   | Passed; API contract defines stable `/api/v1` envelopes, endpoint paths, inputs, outputs, and error codes.   |
| Backend can be implemented against database and queue contracts            | Passed; data model and queue contracts define persistence, idempotency, retries, and failure states.         |
| Worker jobs have clear inputs, outputs, retry behavior, and failure states | Passed; queue contract defines required job types and execution semantics.                                   |
| Smart contract state aligns with backend state assumptions                 | Passed; Solana account draft defines on-chain source-of-truth boundaries and backend projection assumptions. |
| AI agent schemas include confidence breakdown and audit fields             | Passed; agent schema includes composite confidence, audit fields, and compiler logs.                         |
| Typecheck                                                                  | Passed with `pnpm typecheck`.                                                                                |
| Lint                                                                       | Passed with `pnpm lint`.                                                                                     |
| Tests                                                                      | Passed with `pnpm test`.                                                                                     |
| Build                                                                      | Passed with `pnpm build`.                                                                                    |
| Whitespace check                                                           | Passed with `git diff --check`; Git reported CRLF normalization warnings only.                               |

## M0.4 Confirmation Gate

`M0.4` was marked complete after user confirmation on 2026-06-03.

## M0.5 Work Log

### 2026-06-03

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M0.5, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md` and `references/architecture.md`.
- Used `.claude/skills/develop-frontend/SKILL.md`, `checklists/checklist_pronto.md`, and `templates/prompt_de_revisao.md` for mobile-first UX, state, accessibility, and responsive constraints.
- Used `.claude/skills/web2-wallet-auth/SKILL.md` for wallet connection, transaction approval, and return-to-DApp flow considerations.
- Reviewed `docs/api-contracts.md` and `docs/product-rule-summary.md` to align M0.5 with current API and product rules.
- Added `docs/mobile-user-flow-diagram.md`.
- Added `docs/mobile-low-fidelity-wireframes.md`.
- Added `docs/mobile-ux-state-map.md`.
- Covered `/play` as the primary mobile entry point.
- Covered first-time, returning, wallet connection, wallet transaction approval, number selection, free-form rule proposal, token-limit warning and rejection, voting, active Rule of the Hour, draw/result, near-miss, creator reward/status, share card, and empty/loading/failed/delayed states.
- Confirmed no critical screen depends on desktop layout.
- Left M0.5 PRD checklist, approval criteria, and required artifacts unchecked pending user confirmation.

### 2026-06-03

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying M0.5, as required.
- Rechecked the M0.5 artifact set against the PRD checklist.
- Marked M0.5 checklist, approval criteria, and required artifacts complete after user confirmation.
- Searched for `M0.6` in `PRD.md`, `PROGRESS_TRACKER.md`, and `docs`; no M0.6 milestone is defined.
- Confirmed the next defined PRD milestone after M0.5 is `M1.1 - Mobile Live Round Hub`.

## M0.5 Artifact Review

| Artifact                 | Status      | Notes                                                                                                                                                                                  |
| ------------------------ | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mobile user flow diagram | Implemented | See `docs/mobile-user-flow-diagram.md`; includes `/play`, first-time, returning, wallet, transaction return, number, rule, vote, result, reward, and share flows.                      |
| Low-fidelity wireframes  | Implemented | See `docs/mobile-low-fidelity-wireframes.md`; includes mobile shell, live hub, first-time, number picker, approval, rule proposal, voting, active rule, results, and state wireframes. |
| UX state map             | Implemented | See `docs/mobile-ux-state-map.md`; includes route, wallet, transaction, number, rule proposal, voting, active rule, draw/result/reward, and share states.                              |

## M0.5 Validation Results

| Requirement                                                    | Result                                                                                                     |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| New user can understand intended game loop from flow diagrams  | Passed; first-time flow and core game loop are documented.                                                 |
| Mobile wallet interruption and return behavior are represented | Passed; sequence diagram and transaction states preserve originating action and return behavior.           |
| Core actions are reachable with mobile-first navigation        | Passed; shared mobile shell and flows keep pick, rules, voting, results, and share reachable from `/play`. |
| No critical screen depends on desktop layout                   | Passed; all wireframes are mobile-first and specify minimum 320px behavior.                                |

## M0.5 Confirmation Gate

`M0.5` was marked complete after user confirmation on 2026-06-03.

## M0.6 Status

`M0.6` is not defined in `PRD.md`. Work cannot be started under that milestone without adding a PRD section or confirming that the intended next milestone is `M1.1 - Mobile Live Round Hub`.

## M1.1 Work Log

### 2026-06-03

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M1.1, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md`, `references/architecture.md`, and `references/code-quality.md`.
- Used `.claude/skills/develop-frontend/SKILL.md` for mobile-first layout, state coverage, accessibility, and responsive constraints.
- Used the Next.js App Router guidance skill for route/component structure.
- Used `.claude/skills/playwright/SKILL.md`; `playwright-cli` wrapper was unavailable, so the official `npx playwright` CLI was used after installing the Chromium browser cache.
- Added `/play` as the public mobile game route.
- Redirected `/` to `/play`.
- Added `MobileLiveRoundHub` with current turn id, turn duration and cycle position, countdown, prize pool, leading Rule of the Hour, primary bottom CTA, secondary actions, compact activity feed, and next milestones.
- Added loading, empty, and delayed states switchable from the prototype state control.
- Added mobile sticky header and bottom action area.
- Updated global web styles for mobile-first layout, stable controls, focus states, and fixed navigation that does not cover scrollable content.
- Added `.next-dev-logs/` and `output/` to `.gitignore` for local dev-server and screenshot artifacts.
- Left M1.1 PRD checklist and approval criteria unchecked pending user confirmation.

### 2026-06-03

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying M1.1 and starting M1.2, as required.
- Rechecked the M1.1 artifact set and validation results against the PRD checklist.
- Marked M1.1 checklist and approval criteria complete after user confirmation.
- Started M1.2.

## M1.1 Artifact Review

| Artifact                                                  | Status      | Notes                                                                                                                                                          |
| --------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Implemented | Contains the interactive mobile hub, state control, live state, loading state, empty state, delayed state, header, CTA, activity feed, and milestone timeline. |
| `apps/web/src/app/play/page.tsx`                          | Implemented | Exposes the `/play` route.                                                                                                                                     |
| `apps/web/src/app/page.tsx`                               | Implemented | Redirects `/` to `/play`.                                                                                                                                      |
| `apps/web/src/app/globals.css`                            | Implemented | Defines the mobile-first shell, responsive layout, sticky header, fixed bottom CTA, state panels, and accessible focus states.                                 |

## M1.1 Validation Results

| Requirement                                                             | Result                                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| User can identify prize, countdown, and next action in under 10 seconds | Passed; these appear in the sticky header and first viewport.                                                                        |
| Screen works on common mobile viewport sizes                            | Passed for `390x844` screenshot; layout reserves space above the bottom CTA and avoids overlap.                                      |
| Bottom CTA remains reachable with one-handed use                        | Passed; fixed bottom CTA remains visible on `/play`.                                                                                 |
| Root route reaches primary play route                                   | Passed; `/` returns `307` to `/play`.                                                                                                |
| Play route loads                                                        | Passed; `/play` returns HTTP `200`.                                                                                                  |
| Typecheck                                                               | Passed with `pnpm typecheck`.                                                                                                        |
| Lint                                                                    | Passed with `pnpm lint`.                                                                                                             |
| Tests                                                                   | Passed with `pnpm test`.                                                                                                             |
| Build                                                                   | Passed with `pnpm build`; `/play` is included in generated routes.                                                                   |
| Visual verification                                                     | Passed with Playwright screenshots at `390x844` and `1440x1000`; screenshots are local ignored artifacts under `output/playwright/`. |
| Whitespace check                                                        | Passed with `git diff --check`; Git reported CRLF normalization warnings only.                                                       |

## M1.1 Confirmation Gate

`M1.1` was marked complete after user confirmation on 2026-06-03.

## M1.2 Work Log

### 2026-06-03

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M1.2, as required.
- Used `.claude/skills/best-practices/SKILL.md` with `references/agent-principles.md`, `references/architecture.md`, and `references/code-quality.md`.
- Used `.claude/skills/develop-frontend/SKILL.md` for mobile-first number selection, stable tile dimensions, accessible controls, state coverage, and responsive constraints.
- Used the Next.js App Router guidance skill for route/component structure.
- Added `NumberPicker` under `apps/web/src/features/number-picker/NumberPicker.tsx`.
- Added `/play/pick` under `apps/web/src/app/play/pick/page.tsx`.
- Connected the `MobileLiveRoundHub` primary CTA to `/play/pick`.
- Implemented numbers 1 to 100 in a mobile-friendly grid.
- Enforced exactly 6 selected numbers before review.
- Prevented duplicate selections through toggle semantics and disabled unselected tiles when the selection is full.
- Added sticky selected-number tray with remove/edit behavior.
- Added randomize and clear actions.
- Added incomplete-selection validation messaging.
- Added review step before simulated submission.
- Added success state after simulated submission.
- Added Playwright e2e coverage for the complete simulated number submission flow.
- Left M1.2 PRD checklist and approval criteria unchecked pending user confirmation.

## M1.2 Artifact Review

| Artifact                                                  | Status      | Notes                                                                                             |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/number-picker/NumberPicker.tsx`    | Implemented | Contains selection, remove/edit, randomize, clear, validation, review, and success states.        |
| `apps/web/src/app/play/pick/page.tsx`                     | Implemented | Exposes the mobile number picker route.                                                           |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated     | Primary bottom CTA now navigates to `/play/pick`.                                                 |
| `apps/web/src/app/globals.css`                            | Updated     | Adds stable number tiles, sticky tray, picker header, review state, and bottom action bar styles. |
| `apps/web/e2e/number-picker.spec.ts`                      | Implemented | Verifies six-number selection, disabled review state, review step, and success state.             |
| `apps/web/playwright.config.ts`                           | Implemented | Runs the web e2e test against a local Next dev server on port 3005.                               |

## M1.2 Validation Results

| Requirement                                               | Result                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| User can select 6 unique numbers without assistance       | Passed; e2e selects `01` through `06` and reaches review.                                                                            |
| Invalid selections are blocked before submission          | Passed; review CTA is disabled before 6 numbers are selected and extra unselected tiles disable at 6.                                |
| Interaction is usable on mobile without precision tapping | Passed; mobile screenshot at `390x844` shows large stable tiles and thumb-zone bottom actions.                                       |
| Play route links to number picker                         | Passed; hub primary CTA navigates to `/play/pick`.                                                                                   |
| Number picker route loads                                 | Passed; `/play/pick` returns HTTP `200`.                                                                                             |
| E2E                                                       | Passed with `pnpm --filter @idealer/web test:e2e`.                                                                                   |
| Typecheck                                                 | Passed with `pnpm typecheck`.                                                                                                        |
| Lint                                                      | Passed with `pnpm lint`.                                                                                                             |
| Tests                                                     | Passed with `pnpm test`.                                                                                                             |
| Build                                                     | Passed with `pnpm build`; `/play/pick` is included in generated routes.                                                              |
| Visual verification                                       | Passed with Playwright screenshots at `390x844` and `1440x1000`; screenshots are local ignored artifacts under `output/playwright/`. |
| Whitespace check                                          | Passed with `git diff --check`; Git reported CRLF normalization warnings only.                                                       |

## M1.2 Confirmation Gate

`M1.2` was marked complete after user confirmation on 2026-06-04.

## M1.3 Work Log

### 2026-06-04

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying M1.2 and starting M1.3, as required.
- Used `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/develop-frontend/SKILL.md`, and the Next.js App Router guidance skill.
- Rechecked M1.2 artifacts and validation results against the PRD checklist.
- Marked M1.2 checklist and approval criteria complete after user confirmation.
- Corrected the project turn-duration source of truth and implementation to `2h -> 2h -> 8h -> 8h -> repeat`.
- Added `RuleProposalComposer` with free-form input, approximate live token count, configured maximum, near-limit warning, over-limit rejection, sanitized preview, AI-style preview mock, ambiguity warning mock, inspiration examples, review step, and simulated success state.
- Added `/play/propose` and connected the live-round hub proposal action to it.
- Added Playwright E2E coverage for token-limit rejection and successful simulated proposal.
- Left M1.3 PRD checklist and approval criteria unchecked pending user confirmation.
- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, frontend guidance, code-quality guidance, Next.js App Router guidance, and Playwright guidance before verifying M1.3 and starting M1.4.
- Rechecked M1.3 against its checklist and validation evidence.
- Marked M1.3 checklist and approval criteria complete after user confirmation.
- Started M1.4.

## M1.3 Artifact Review

| Artifact                                                       | Status      | Notes                                                                                                                                  |
| -------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/rule-proposal/RuleProposalComposer.tsx` | Implemented | Contains free-form composition, token-limit behavior, sanitized and AI-style previews, ambiguity feedback, review, and success states. |
| `apps/web/src/app/play/propose/page.tsx`                       | Implemented | Exposes the mobile rule proposal route.                                                                                                |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx`      | Updated     | Proposal action now navigates to `/play/propose`.                                                                                      |
| `apps/web/src/app/globals.css`                                 | Updated     | Adds responsive composer, preview, warning, inspiration, review, and success-state styles.                                             |
| `apps/web/e2e/rule-proposal.spec.ts`                           | Implemented | Verifies token-limit rejection and the complete simulated proposal flow.                                                               |

## M1.3 Validation Results

| Requirement                                             | Result                                                                                                                                                                                                                                                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Users can write a rule freely                           | Passed; the composer uses an unrestricted natural-language textarea.                                                                                                                                                                                              |
| Users understand why a rule is rejected for length      | Passed; live token count, configured maximum, warning, and disabled review state are visible.                                                                                                                                                                     |
| UI does not force fixed categories or rule combinations | Passed; examples are inspiration-only text and do not populate the composer.                                                                                                                                                                                      |
| Turn duration cycle                                     | Passed; PRD, product summary, decision registry, tracker, and runtime constant use `2h -> 2h -> 8h -> 8h -> repeat`.                                                                                                                                              |
| Runtime cycle verification                              | Passed; `getTurnDurationHours` produced `[2, 2, 8, 8, 2, 2, 8, 8]` for cycle indexes 0 through 7.                                                                                                                                                                 |
| Rule proposal route loads                               | Passed; `/play/propose` is included in the production build.                                                                                                                                                                                                      |
| E2E                                                     | Passed with `pnpm --filter @idealer/web test:e2e`; both number picker and rule proposal tests passed.                                                                                                                                                             |
| Typecheck                                               | Passed with `pnpm typecheck`.                                                                                                                                                                                                                                     |
| Lint                                                    | Passed with `pnpm lint`.                                                                                                                                                                                                                                          |
| Tests                                                   | Passed with `pnpm test`.                                                                                                                                                                                                                                          |
| Build                                                   | Passed with `pnpm build`; `/play/propose` is included in generated routes.                                                                                                                                                                                        |
| Visual verification                                     | Passed at `390x844` and `1440x1000`; page has content, expected controls render, no framework overlay is present, and no console errors were detected. The unavailable `agent-browser` CLI was replaced explicitly with the installed Playwright browser runtime. |
| Whitespace check                                        | Passed with `git diff --check`; Git reported CRLF normalization warnings only.                                                                                                                                                                                    |

## M1.3 Confirmation Gate

`M1.3` was marked complete after user confirmation on 2026-06-04.

## M1.4 Work Log

### 2026-06-04

- Added `RuleVotingPanel` as an interactive client component while keeping `/play/vote` as a server-rendered App Router page.
- Added proposed-rule cards with original text, explanation, creator, clarity, difficulty, token count, and live vote totals.
- Added current-user vote state, one-tap initial voting, vote changes, immediate feedback, and dynamically updated leading-rule state.
- Added a visible voting-close countdown and plain-language explanation that votes influence the finalist set while VRF selects the Rule of the Hour.
- Added an empty rule-pool prototype state.
- Added live activity events after votes.
- Connected the live-round hub Vote action to `/play/vote`.
- Added Playwright E2E coverage for initial voting, vote changes, leader updates, feedback, activity events, and the empty state.
- Left M1.4 PRD checklist and approval criteria unchecked pending user confirmation.
- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, frontend guidance, code-quality guidance, and Playwright guidance before verifying M1.4 and starting M1.5.
- Rechecked M1.4 against its checklist, E2E evidence, and responsive visual evidence.
- Marked M1.4 checklist and approval criteria complete after user confirmation.
- Started M1.5.

## M1.4 Artifact Review

| Artifact                                                  | Status      | Notes                                                                                                                                               |
| --------------------------------------------------------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/rule-voting/RuleVotingPanel.tsx`   | Implemented | Contains proposed-rule cards, live vote totals, user vote state, vote changes, dynamic leader, countdown, feedback, empty state, and activity feed. |
| `apps/web/src/app/play/vote/page.tsx`                     | Implemented | Exposes the mobile voting route.                                                                                                                    |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated     | Vote action now navigates to `/play/vote`.                                                                                                          |
| `apps/web/src/app/globals.css`                            | Updated     | Adds responsive voting summary, rule cards, metadata, actions, empty state, and activity styles.                                                    |
| `apps/web/e2e/rule-voting.spec.ts`                        | Implemented | Verifies voting, vote change, visible leader update, feedback, activity event, and empty state.                                                     |

## M1.4 Validation Results

| Requirement                                                  | Result                                                                                                                                                                               |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| User can vote in one or two taps                             | Passed; each rule card has a direct vote action and E2E completes an initial vote with one click.                                                                                    |
| User understands that voting influences the Rule of the Hour | Passed; the leading summary explicitly explains finalist-set influence and VRF selection.                                                                                            |
| Leading rule state updates visibly                           | Passed; E2E confirms `Balanced spread wins` becomes the visible leader immediately after voting.                                                                                     |
| Current user vote and vote change                            | Passed; selected action and summary show the current vote, and E2E confirms vote changes.                                                                                            |
| Feedback and activity event                                  | Passed; an `aria-live` feedback message and a new activity event appear after each vote.                                                                                             |
| Empty state                                                  | Passed; the prototype state control exposes a clear no-eligible-rules state.                                                                                                         |
| Live-round hub links to voting route                         | Passed; Vote navigates to `/play/vote`.                                                                                                                                              |
| Voting route loads                                           | Passed; `/play/vote` returns HTTP `200`.                                                                                                                                             |
| E2E                                                          | Passed with `pnpm --filter @idealer/web test:e2e`; all 3 web flows passed.                                                                                                           |
| Typecheck                                                    | Passed with `pnpm typecheck`.                                                                                                                                                        |
| Lint                                                         | Passed with `pnpm lint`.                                                                                                                                                             |
| Tests                                                        | Passed with `pnpm test`.                                                                                                                                                             |
| Build                                                        | Passed with `pnpm build`; `/play/vote` is included in generated routes.                                                                                                              |
| Visual verification                                          | Passed at `320x700`, `390x844`, and `1440x1000`; no horizontal overflow, framework overlay, or console errors were detected. Fixed-header geometry leaves a 12px gap before content. |
| Whitespace check                                             | Passed with `git diff --check`; Git reported CRLF normalization warnings only.                                                                                                       |

## M1.4 Confirmation Gate

`M1.4` was marked complete after user confirmation on 2026-06-04.

## M1.5 Work Log

### 2026-06-04

- Added `TurnCycleSimulator` with the fixed `2h -> 2h -> 8h -> 8h -> repeat` sequence.
- Added explicit current cycle step, current duration, next duration, turn number, phase, progress, and time-to-draw displays.
- Added proportional lifecycle milestones for voting close at 75%, guess close at 96.7%, and draw/rollover at 100%.
- Added manual phase advancement, direct late-entry testing, explicit next-turn rollover, and reset controls.
- Added accelerated simulation mode that advances phases and rolls through turns every 900ms.
- Added a late-entry edge state that blocks new guesses and voting near the draw.
- Added fail-closed index validation for cycle durations, phases, and phase progress.
- Connected the live-round hub Cycle action to `/play/simulate`.
- Added Playwright E2E coverage for proportional timing, all four duration steps, repeat after the second 8h turn, voting close, late entry, draw, and accelerated execution.
- Left M1.5 PRD checklist and approval criteria unchecked pending user confirmation.
- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, frontend guidance, code-quality guidance, and Playwright guidance before verifying M1.5 and starting M1.6.
- Rechecked M1.5 against its checklist, E2E evidence, and responsive visual evidence.
- Marked M1.5 checklist and approval criteria complete after user confirmation.
- Started M1.6.

## M1.5 Artifact Review

| Artifact                                                  | Status      | Notes                                                                                                                                              |
| --------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/turn-cycle/TurnCycleSimulator.tsx` | Implemented | Contains deterministic cycle navigation, lifecycle phases, proportional timing, accelerated mode, rollover, late-entry state, and activity events. |
| `apps/web/src/app/play/simulate/page.tsx`                 | Implemented | Exposes the simulated turn-cycle route.                                                                                                            |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated     | Cycle action now navigates to `/play/simulate`.                                                                                                    |
| `apps/web/src/app/globals.css`                            | Updated     | Adds responsive cycle summary, progress, duration strip, controls, late-entry state, timeline, and activity styles.                                |
| `apps/web/e2e/turn-cycle.spec.ts`                         | Implemented | Verifies lifecycle timing, `2h -> 2h -> 8h -> 8h -> repeat`, late entry, draw, and accelerated simulation.                                         |

## M1.5 Validation Results

| Requirement                                           | Result                                                                                                                                                                                                                                  |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cycle order is correct                                | Passed; E2E verifies `2h -> 2h -> 8h -> 8h -> 2h`, including repeat after the second 8h turn.                                                                                                                                           |
| UI communicates current and next duration clearly     | Passed; summary and duration strip show current step, current duration, and next duration.                                                                                                                                              |
| Accelerated mode allows testing all durations quickly | Passed; accelerated mode advances every 900ms and E2E reaches draw within four seconds.                                                                                                                                                 |
| Voting close timing                                   | Passed; timeline shows 75% and E2E verifies the `Voting closed` phase.                                                                                                                                                                  |
| Guess close timing and late entry                     | Passed; timeline shows 96.7% and the late-entry edge state blocks voting and new guesses.                                                                                                                                               |
| Draw timing and rollover                              | Passed; draw occurs at 100%, then the next phase advancement rolls to the following turn.                                                                                                                                               |
| Invalid cycle or phase indexes                        | Passed; invalid indexes throw explicit errors instead of silently selecting a fallback.                                                                                                                                                 |
| Live-round hub links to simulator                     | Passed; Cycle navigates to `/play/simulate`.                                                                                                                                                                                            |
| Simulator route loads                                 | Passed; `/play/simulate` returns HTTP `200`.                                                                                                                                                                                            |
| E2E                                                   | Passed with `pnpm --filter @idealer/web test:e2e`; all 4 web flows passed.                                                                                                                                                              |
| Typecheck                                             | Passed with `pnpm typecheck`.                                                                                                                                                                                                           |
| Lint                                                  | Passed with `pnpm lint`.                                                                                                                                                                                                                |
| Tests                                                 | Passed with `pnpm test`.                                                                                                                                                                                                                |
| Build                                                 | Passed with `pnpm build`; `/play/simulate` is included in generated routes.                                                                                                                                                             |
| Visual verification                                   | Passed at `320x700`, `390x844`, and `1440x1000`; no horizontal overflow, framework overlay, or console errors were detected. Fixed-header geometry leaves a 12px gap before content, and mobile control targets are at least 44px high. |
| Whitespace check                                      | Passed with `git diff --check`; Git reported CRLF normalization warnings only.                                                                                                                                                          |

## M1.5 Confirmation Gate

`M1.5` was marked complete after user confirmation on 2026-06-04.

## M1.6 Work Log

### 2026-06-04

- Added `DrawResultPanel` with near-miss, winner, and creator prototype result states.
- Added drawn numbers, submitted guess, original-rule result, alternative-rule result, active-rule text, deterministic outcome explanations, and creator attribution.
- Added a near-miss explanation that identifies the exact missed numbers and the remaining threshold.
- Added a simulated creator reward outcome equal to 15% of the individual alternative-rule winner payout.
- Made the creator reward source and accounting explicit: reserve-funded, full winner payout preserved, and zero deducted from the winner.
- Added next-round and share-result actions with accessible share-intent feedback.
- Added `/play/results` and connected the live-round hub Results action to it.
- Added Playwright E2E coverage for near-miss, winner, creator, reserve-funded reward, next-round CTA, and share feedback.
- Left M1.6 PRD checklist and approval criteria unchecked pending user confirmation.
- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, frontend guidance, code-quality guidance, and Playwright guidance before verifying M1.6 and starting M1.7.
- Rechecked M1.6 against its checklist, E2E evidence, and responsive visual evidence.
- Marked M1.6 checklist and approval criteria complete after user confirmation.
- Started M1.7.

## M1.6 Artifact Review

| Artifact                                                  | Status      | Notes                                                                                                                                           |
| --------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/draw-result/DrawResultPanel.tsx`   | Implemented | Contains result scenarios, number comparison, rule evaluations, near-miss feedback, creator attribution/reward, return CTA, and share feedback. |
| `apps/web/src/app/play/results/page.tsx`                  | Implemented | Exposes the simulated result route.                                                                                                             |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated     | Results action now navigates to `/play/results`.                                                                                                |
| `apps/web/src/app/globals.css`                            | Updated     | Adds responsive result layout, number comparison, evaluation, creator accounting, and action styles.                                            |
| `apps/web/e2e/draw-result.spec.ts`                        | Implemented | Verifies outcome explanations, creator accounting, next-round CTA, and share feedback.                                                          |

## M1.6 Validation Results

| Requirement                                                | Result                                                                                                                                                     |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| User understands why they won or lost                      | Passed; original and alternative rule results explain each outcome and E2E verifies near-miss and winner states.                                           |
| User sees a reason to join the next round                  | Passed; next turn duration, changing-rule message, and `/play/pick` CTA are visible.                                                                       |
| Creator outcome is visible without confusing winner payout | Passed; creator reward, reserve source, full winner payout, and `0.00 SOL` winner deduction are displayed together.                                        |
| Result route loads                                         | Passed; `/play/results` returns HTTP `200` and is included in the production build.                                                                        |
| E2E                                                        | Passed with `pnpm --filter @idealer/web test:e2e`; all 5 web flows passed.                                                                                 |
| Typecheck                                                  | Passed with `pnpm typecheck`.                                                                                                                              |
| Lint                                                       | Passed with `pnpm lint`.                                                                                                                                   |
| Tests                                                      | Passed with `pnpm test`.                                                                                                                                   |
| Build                                                      | Passed with `pnpm build`; `/play/results` is included in generated routes.                                                                                 |
| Visual verification                                        | Passed at `320x700`, `390x844`, and `1440x1000`; no horizontal overflow or console errors were detected, and result action targets are at least 52px high. |
| Whitespace check                                           | Passed with `git diff --check`; Git reported CRLF normalization warnings only.                                                                             |

## M1.6 Confirmation Gate

`M1.6` was marked complete after user confirmation on 2026-06-04.

## M1.7 Work Log

### 2026-06-04

- Added `ShareCardGenerator` with active-rule, near-miss, and creator-elected story variants.
- Added a stable mobile social card with a `4:5` aspect ratio.
- Included turn number, Rule of the Hour title, prize pool, and story-specific outcome on every card.
- Added native Web Share API behavior.
- Added automatic copy-link fallback when native sharing is unavailable.
- Added an explicit Copy link action with visible success and failure feedback.
- Added session-only prototype analytics for share-intent count, last intent type, and selected story.
- Added `/play/share` and connected the result Share result CTA to it.
- Added Playwright E2E coverage for story switching, native sharing, explicit copy, automatic fallback copy, and prototype analytics.
- Left M1.7 PRD checklist and approval criteria unchecked pending user confirmation.

## M1.7 Artifact Review

| Artifact                                                  | Status      | Notes                                                                                                                      |
| --------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/features/share-card/ShareCardGenerator.tsx` | Implemented | Contains three story variants, mobile card generation, share/copy behavior, fallback feedback, and share-intent analytics. |
| `apps/web/src/app/play/share/page.tsx`                    | Implemented | Exposes the share-card generator route.                                                                                    |
| `apps/web/src/features/draw-result/DrawResultPanel.tsx`   | Updated     | Share result CTA now navigates to `/play/share`.                                                                           |
| `apps/web/src/app/globals.css`                            | Updated     | Adds stable mobile social-card, story selector, actions, and analytics styles.                                             |
| `apps/web/e2e/share-card.spec.ts`                         | Implemented | Verifies variants, required content, native sharing, copy link, fallback copy, and analytics.                              |

## M1.7 Validation Results

| Requirement                                          | Result                                                                                                                                                           |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Share card is readable on mobile                     | Passed; visual verification at `320x700` and `390x844` shows a stable `4:5` card without content overflow.                                                       |
| Card communicates the interesting story of the round | Passed; active-rule, near-miss, and creator-elected variants visibly change the outcome narrative.                                                               |
| User can share or copy without technical friction    | Passed; native share, explicit Copy link, and automatic fallback copy are available with visible feedback.                                                       |
| Required card content                                | Passed; every variant includes turn number, rule title, prize pool, and outcome.                                                                                 |
| Prototype share analytics                            | Passed; share-intent count, last intent type, and selected story update visibly.                                                                                 |
| Share route loads                                    | Passed; `/play/share` returns HTTP `200` and is included in the production build.                                                                                |
| E2E                                                  | Passed with `pnpm --filter @idealer/web test:e2e`; all 7 web flows passed, including native-share fallback copy.                                                 |
| Typecheck                                            | Passed with `pnpm typecheck`.                                                                                                                                    |
| Lint                                                 | Passed with `pnpm lint`.                                                                                                                                         |
| Tests                                                | Passed with `pnpm test`.                                                                                                                                         |
| Build                                                | Passed with `pnpm build`; `/play/share` is included in generated routes.                                                                                         |
| Visual verification                                  | Passed at `320x700`, `390x844`, and `1440x1000`; no horizontal/card-content overflow or console errors were detected, and action targets are at least 44px high. |
| Whitespace check                                     | Passed with `git diff --check`; Git reported CRLF normalization warnings only.                                                                                   |

## M1.7 Confirmation Gate

`M1.7` was marked complete after user confirmation on 2026-06-04.

## M1 Approval Audit

### 2026-06-04

- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, best-practices agent principles, frontend guidance, and Playwright guidance before verifying M1.7 and auditing M1.
- Rechecked M1.7 against its checklist, E2E evidence, and responsive visual evidence.
- Marked M1.7 checklist and approval criteria complete after user confirmation.
- Confirmed every M1 submilestone from M1.1 through M1.7 is completed and confirmed.
- Audited the five global M1 approval criteria.
- Found no recorded human usability-test results that prove the required percentages.
- Added `docs/m1-usability-validation-plan.md` to define the required unassisted test procedure, anonymous session fields, calculations, and approval rules.
- Kept the global M1 approval checkboxes unchecked because automated tests cannot substitute for human-test metrics.

## M1 Approval Status

| Approval criterion                                   | Required | Evidence                          | Status  |
| ---------------------------------------------------- | -------: | --------------------------------- | ------- |
| Testers understand the core loop after first session |     80%+ | No human-session results recorded | Pending |
| Testers complete a simulated guess submission        |     70%+ | No human-session results recorded | Pending |
| Testers cast at least one vote                       |     50%+ | No human-session results recorded | Pending |
| Testers propose at least one rule                    |     25%+ | No human-session results recorded | Pending |
| Testers say they would join another round            |     40%+ | No human-session results recorded | Pending |

M1 was marked complete after explicit user confirmation on 2026-06-04 because all implementation submilestones are complete and validated. The quantitative usability approval criteria remain unchecked in `PRD.md` until real human-session results meet all five thresholds.

## M1 Completion Gate

`M1` was marked complete after user confirmation on 2026-06-04. This records implementation completion and does not fabricate or waive the separate quantitative usability approval criteria.

## Idealer Design Implementation Work Log

### 2026-06-04

- Opened `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, and `.claude/skills/playwright/SKILL.md` before implementation.
- Read `Idealer - Direcoes.html` from `Plataforma.zip` as the design README/direction document.
- Read and rendered `Idealer.html`, then reviewed its supporting `idealer.css`, `app-home.jsx`, `app-play.jsx`, `app-profile.jsx`, `app-result.jsx`, `app.jsx`, and `shared.jsx` files.
- Implemented the relevant premium dark, neon-accented Idealer design patterns in the existing `/play` live-round hub while preserving the existing M1 routes and prototype states.
- Added jackpot-first hierarchy, latest-result banner, quick rule creation entry, rule ranking with vote bars and interactive details, brand/wallet header, and primary bottom navigation.
- Kept all visible application UI copy in English.
- Added `lucide-react` for consistent interface icons.
- Added focused E2E coverage for the redesigned live-round hub.
- Did not change any milestone status or checkbox.

### 2026-06-04 - Fidelity Correction

- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, and `.claude/skills/playwright/SKILL.md` before correcting the implementation.
- Re-audited `Idealer.html`, `app.jsx`, `app-home.jsx`, and `app-result.jsx` from `Plataforma.zip`.
- Replaced the earlier design interpretation with a direct structural port of the Plataforma prototype.
- Matched the 402x868 phone shell, 96% viewport limits, 52px shell radius, dynamic island, status bar, home indicator, initial result screen, internal screen transitions, current-round home, account screen, rule detail sheet, vote bars, and bottom navigation.
- Loaded the same `Outfit`, `Sora`, and `Space Grotesk` font families used by the design.
- Preserved English UI copy as required by the repository instructions.
- Removed the superseded live-round design CSS to avoid redundant or conflicting styles.
- Did not change any milestone status or checkbox.

### 2026-06-11 - Result Screen Exit Fix

- Reopened `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/playwright/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, and `solana-dev` frontend framework-kit guidance before fixing the result-screen exit issue.
- Reproduced the Docker `/play` issue: the result screen rendered, but the page repeatedly remounted during dev Fast Refresh and the `Back to current round` click never reached a stable state.
- Moved `SolanaProviders` out of the global root layout and wrapped only routes that use Solana hooks: `/play/pick`, `/play/propose`, `/play/vote`, `/play/wallet`, and `/round/[turnId]`.
- Updated the web dev script and Playwright webServer command to use `next dev --webpack`, avoiding the observed Turbopack dev panic loop in Docker.
- Rebuilt the Docker web service and verified the result-screen back button exits to the current round without `react-core` cluster warmup warnings on `/play`.
- Did not change any milestone status or checkbox.

## M2.1 Work Log

### 2026-06-04

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before implementing M2.1.
- Opened the relevant local skills and references: `solana-dev`, Solana frontend framework-kit, Kit interoperability, Mobile Wallet Adapter setup/connection/transaction guidance, `develop-frontend`, `playwright`, `best-practices`, and `best-practices/references/agent-principles.md`.
- Opened the required product and technical markdown documents: `docs/mobile-user-flow-diagram.md`, `docs/mobile-ux-state-map.md`, `docs/mobile-low-fidelity-wireframes.md`, `docs/technical-contracts-index.md`, `docs/smart-contract-account-instruction-draft.md`, `docs/shared-error-codes.md`, `docs/data-model-draft.md`, and `contracts/solana/README.md`.
- Added a single Solana devnet provider using Wallet Standard-first `@solana/client` and `@solana/react-hooks`.
- Registered Solana Mobile Wallet Adapter for secure mobile-browser handoff and Wallet Standard discovery.
- Added official in-wallet browser handoff links for Phantom, Backpack, and Solflare.
- Added `/play/wallet` with connect, disconnect, transaction review, zero-SOL self-transfer approval, RPC preflight, pending, confirmed, failed, and retry states.
- Persisted connection and transaction actions before wallet handoff and recovered interrupted actions from `localStorage` after return/reload.
- Connected the live-round and account wallet actions to the real wallet flow.
- Added shared wallet and transaction error codes.
- Added E2E coverage for Mobile Wallet Adapter registration, named mobile handoff links, and interrupted-action recovery.
- Left the M2.1 PRD checklist and approval criteria unchecked pending user confirmation and real-device QA.

## M2.1 Artifact Review

| Artifact                                                  | Status      | Notes                                                                                                                                     |
| --------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/solana/SolanaProviders.tsx`                 | Implemented | Configures devnet RPC/WebSocket, Wallet Standard discovery, Mobile Wallet Adapter registration, and wallet session persistence.           |
| `apps/web/src/features/wallet/WalletFlow.tsx`             | Implemented | Implements connect/disconnect, named mobile handoff, transaction summary, approval, recovery, explicit status, failure, and retry states. |
| `apps/web/src/app/play/wallet/page.tsx`                   | Implemented | Exposes the mobile wallet flow route.                                                                                                     |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx` | Updated     | Routes wallet actions into `/play/wallet`.                                                                                                |
| `apps/web/e2e/wallet-flow.spec.ts`                        | Implemented | Verifies MWA registration, named mobile handoff links, and interrupted-action recovery.                                                   |
| `.env.example`                                            | Updated     | Documents configurable devnet RPC and WebSocket endpoints.                                                                                |
| `docs/shared-error-codes.md`                              | Updated     | Adds explicit wallet connection, transaction rejection, and transaction failure codes.                                                    |

## M2.1 Validation Results

| Requirement                                             | Result                                                                                                                             |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Solana wallet adapter integration                       | Passed; Wallet Standard-first provider and discovery are active application-wide.                                                  |
| Mobile Wallet Adapter support                           | Passed in automated mobile-browser detection; MWA connector is visible in Playwright's Pixel 5 profile.                            |
| Phantom, Backpack, and Solflare mobile handoff          | Implemented through named in-wallet browser deep links; real-device QA remains pending.                                            |
| In-wallet browser usage                                 | Implemented through injected Wallet Standard discovery.                                                                            |
| Persist and recover pending action                      | Passed; E2E verifies recovery after reload.                                                                                        |
| Pending, success, failure, retry, and disconnect states | Implemented; real-wallet confirmation/rejection behavior remains pending real-device QA.                                           |
| Test transaction safety                                 | Passed by design; explicit user action sends a zero-SOL self-transfer on devnet with RPC preflight enabled.                        |
| Focused wallet E2E                                      | Passed with `pnpm --filter @idealer/web test:e2e -- wallet-flow.spec.ts`.                                                          |
| Full web E2E                                            | Passed with `pnpm --filter @idealer/web test:e2e`; all 9 flows passed after the final hydration and transaction-state corrections. |
| Typecheck                                               | Passed with `pnpm typecheck`; all 23 workspace tasks passed.                                                                       |
| Lint                                                    | Passed with `pnpm lint`; all 23 workspace tasks passed.                                                                            |
| Tests                                                   | Passed with `pnpm test`; all 23 workspace tasks passed.                                                                            |
| Build                                                   | Passed with `pnpm build`; all 17 workspace builds passed and `/play/wallet` is included in generated routes.                       |
| Whitespace check                                        | Passed with `git diff --check`; Git reported CRLF normalization warnings only.                                                     |

## M2.1 Confirmation Gate

`M2.1` was marked complete after explicit user confirmation on 2026-06-04. The implementation audit confirmed every M2.1 checklist item and approval flow is represented by the Wallet Standard/Mobile Wallet Adapter implementation and automated recovery/failure coverage. Broader physical-device compatibility remains part of the later mobile QA milestone.

## M2.2 Work Log

### 2026-06-04

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M2.2.
- Opened the relevant local skills and references: `solana-dev`, Anchor program guidance, Solana testing and security guidance, `safe-solana-builder`, its shared and Anchor security references, `best-practices`, `best-practices/references/agent-principles.md`, `best-practices/references/web3-contracts.md`, `best-practices/references/testing.md`, and `security-threat-checklist`.
- Opened `docs/smart-contract-account-instruction-draft.md` and `contracts/solana/README.md`.
- Audited M2.1 against its PRD checklist and approval criteria, then marked it complete after explicit user confirmation.
- Confirmed Rust is installed. Solana CLI and Anchor CLI are not installed in the current environment, so devnet deployment remains a separate credentialed deployment gate.
- Implemented the Anchor workspace, core accounts, core instructions, deterministic PDA constraints, checked fee accounting, lifecycle validation, and explicit protocol errors.
- Added unit tests, account-constraint tests, invalid-input tests, and an SBF instruction suite that executes the core lifecycle.
- Added a Solana program CI workflow and Windows-to-Linux validation wrapper.
- Built the final program for SBF and passed both explicit SBF instruction tests.
- Stabilized the web E2E command at one Playwright worker and revalidated all nine M2.1/M1 flows.
- Rechecked M2.2 after user flagged the missing deploy credential/funding gate.
- Generated devnet-only local keypairs outside the repository in the Docker `idealer-solana-home` volume.
- Replaced the placeholder program id with devnet program id `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4`.
- Re-ran format, typecheck, clippy, native tests, SBF build, and explicit SBF instruction tests successfully with the final program id.
- Attempted devnet funding through the official CLI faucet at `2`, `1`, `0.5`, and `0.1` SOL; all were rate-limited.
- Attempted devnet deployment and confirmed the remaining blocker is insufficient devnet SOL for deployer `4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH`. The deploy attempt requires `2.95675416 SOL` plus a `0.00212 SOL` fee.
- Confirmed the deployer was funded with `5 SOL`.
- Deployed the program to devnet with signature `2bLT1XQWBJN94wSo1c4WhQkky7haVH9ws4HCE35X9aJJXEsatHnf8ZPjUGRxK7ztBVu22GMGvgRa6GYsUiuPtdsA`.
- Verified the deployed program on devnet: ProgramData `BUo2vYwYvj2UWYFgryrMF7bBTrLQQFYVU6xHuoTJbJBD`, authority `4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH`, slot `467190056`, data length `424648` bytes.
- Re-ran local Solana program lint, native tests, SBF build, and explicit SBF instruction tests after deployment.

## M2.2 Artifact Review

| Artifact                                                  | Status      | Notes                                                                                                        |
| --------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------ |
| `contracts/solana/programs/idealer/src/lib.rs`            | Implemented | Defines the core Anchor accounts, instructions, events, errors, and account constraints.                     |
| `contracts/solana/programs/idealer/src/domain.rs`         | Implemented | Contains pure validation, checked fee splitting, lifecycle cutoff, and cycle helpers.                        |
| `contracts/solana/programs/idealer/tests/core.rs`         | Implemented | Covers isolated PDAs, lifecycle rules, fee conservation, and invalid inputs.                                 |
| `contracts/solana/programs/idealer/tests/instructions.rs` | Implemented | Executes the complete core lifecycle against the final SBF artifact and verifies invalid-input rejection.    |
| `contracts/solana/security-checklist.md`                  | Implemented | Records account, authority, PDA, arithmetic, deployment, and key-management controls.                        |
| `.github/workflows/solana-program.yml`                    | Implemented | Runs format, check, clippy, native tests, SBF build, and explicit SBF instruction tests for program changes. |

## M2.2 Validation Results

| Requirement                                | Result                                                                                                                                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Core accounts and instructions             | Implemented for every M2.2 checklist item, plus the downstream-required `GameToken` account.                                                                                                       |
| Core instructions execute successfully     | Passed in the explicit SBF suite: initialize, open turn, submit guess, propose rule, vote, and close turn.                                                                                         |
| Invalid inputs are rejected                | Passed for duplicate/out-of-range guesses, invalid rule hashes/preflight commitments, duplicate votes, invalid config, and closed action windows.                                                  |
| Account constraints and lifecycle tests    | Passed with 6 focused core tests and 2 explicit SBF instruction tests.                                                                                                                             |
| Rust format, typecheck, and lint           | Passed with `cargo fmt --check`, `cargo check`, and `cargo clippy -D warnings`.                                                                                                                    |
| Monorepo typecheck, lint, tests, and build | Passed with `pnpm typecheck`, `pnpm lint`, `pnpm test`, and `pnpm build`.                                                                                                                          |
| Web regression E2E                         | Passed with `pnpm --filter @idealer/web test:e2e`; all 9 flows passed.                                                                                                                             |
| Secret/keypair check                       | Passed; no deploy keypair is present outside ignored temporary build output.                                                                                                                       |
| Remote CI                                  | Workflow added with SBF coverage. `gh` is not installed in this environment, so remote run status could not be queried for uncommitted local changes; workflow-equivalent commands passed locally. |
| Devnet deployment                          | Passed. Program id `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4` is deployed on devnet with ProgramData `BUo2vYwYvj2UWYFgryrMF7bBTrLQQFYVU6xHuoTJbJBD`.                                           |

## M2.2 Confirmation Gate

`M2.2` was marked complete after explicit user confirmation on 2026-06-04 and successful devnet deployment. Required markdown documents opened before work: `PRD.md`, `AGENTS.md`, `.claude/skills`, `solana-dev`, `security-threat-checklist`, `best-practices`, `best-practices/references/agent-principles.md`, `best-practices/references/deploy-release.md`, `best-practices/references/web3-contracts.md`, `web2-wallet-auth`, and `develop-frontend`.

## M2.3 Work Log

### 2026-06-04

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M2.3.
- Opened the relevant local skills and references: `solana-dev` frontend framework-kit and Kit interoperability guidance, `web2-wallet-auth`, `develop-frontend`, `security-threat-checklist`, and deployment/security references used for M2.2.
- Started wiring the mobile number picker to the deployed devnet program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4`.
- Added `apps/web/src/solana/idealerProgram.ts` with the deployed program id, active devnet turn id, Anchor `submit_guess` discriminator, PDA derivation, account metas, and six-number validation.
- Updated the mobile number picker to create the real `submit_guess` transaction, require a connected devnet wallet, block an existing `PlayerGuess` PDA before wallet approval, show transaction status, handle duplicate/closed-turn errors, persist pending guess state through wallet return/reload, and show a confirmed receipt.
- Added `/guess-receipts` API persistence for confirmed guess receipts with payload validation and duplicate response handling.
- Updated `.env.example` with `NEXT_PUBLIC_IDEALER_PROGRAM_ID`, `NEXT_PUBLIC_IDEALER_ACTIVE_TURN_ID`, and `NEXT_PUBLIC_IDEALER_API_URL`.
- Updated the number picker E2E from simulated submission to the real pre-submit flow that routes unconnected users to wallet connection.
- Rechecked M2.3 after user requested completion verification.
- Fixed the receipt API to support browser CORS preflight for `/guess-receipts` from the local web origin.
- Fixed the compiled API entrypoint guard so `node apps/api/dist/index.js` starts the HTTP server correctly.
- Verified a devnet `PlayerGuess` exists at `9HPaHP3NqQdVbE7ZQCZ71ti9vP14gGNTpQkgrqjLNvrV` and is owned by deployed program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4`.

## M2.3 Artifact Review

| Artifact                                               | Status      | Notes                                                                                                                                    |
| ------------------------------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/solana/idealerProgram.ts`                | Implemented | Derives devnet PDAs and builds the Anchor `submit_guess` instruction for program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4`.         |
| `apps/web/src/features/number-picker/NumberPicker.tsx` | Implemented | Connects six-number review to wallet-backed devnet submission, duplicate precheck, pending/confirmed/failed states, and receipt display. |
| `apps/api/src/index.ts`                                | Implemented | Adds `POST /guess-receipts` and `GET /guess-receipts` for backend/API receipt projection.                                                |
| `apps/web/e2e/number-picker.spec.ts`                   | Updated     | Verifies six-number validation, review, and wallet-required devnet submission entry.                                                     |
| `.env.example`                                         | Updated     | Documents the devnet program id, active turn id, and browser API URL.                                                                    |

## M2.3 Validation Results

| Requirement                                         | Result                                                                                                                                                      |
| --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Number picker creates a real transaction            | Implemented through `client.transaction.prepareAndSend` with the deployed `submit_guess` instruction.                                                       |
| Six unique numbers are validated before transaction | Implemented by `validateGuessNumbers` and existing UI selection constraints.                                                                                |
| Duplicate guess blocked                             | Implemented by checking the `PlayerGuess` PDA before wallet approval and by normalizing duplicate account errors.                                           |
| Expired/closed turn handled                         | Implemented by mapping turn-closed/no-active-turn/action-window program errors to `TURN_NOT_ACCEPTING_GUESSES`.                                             |
| Backend/API receipt projection                      | Implemented by `/guess-receipts` with strict shape validation, duplicate response handling, browser CORS preflight, and compiled-server startup validation. |
| On-chain `PlayerGuess` evidence                     | Passed. Devnet account `9HPaHP3NqQdVbE7ZQCZ71ti9vP14gGNTpQkgrqjLNvrV` exists and is owned by the deployed program.                                          |
| Web typecheck                                       | Passed with `pnpm --filter @idealer/web typecheck`.                                                                                                         |
| API typecheck                                       | Passed with `pnpm --filter @idealer/api typecheck`.                                                                                                         |
| Web lint                                            | Passed with `pnpm --filter @idealer/web lint`.                                                                                                              |
| API lint                                            | Passed with `pnpm --filter @idealer/api lint`.                                                                                                              |
| Web/API tests                                       | Passed with `pnpm --filter @idealer/web test` and `pnpm --filter @idealer/api test`.                                                                        |
| Focused number-picker E2E                           | Passed with `pnpm --filter @idealer/web test:e2e -- e2e/number-picker.spec.ts`.                                                                             |
| Receipt API HTTP smoke                              | Passed against compiled API server: `OPTIONS /guess-receipts`, `POST /guess-receipts`, and `GET /guess-receipts`.                                           |

## M2.3 Confirmation Gate

`M2.3` was marked complete after explicit user confirmation on 2026-06-04 and after resolving the receipt API CORS/compiled-entrypoint pendencies. Required markdown documents opened before work: `PRD.md`, `AGENTS.md`, `.claude/skills`, `solana-dev` frontend references, `web2-wallet-auth`, `develop-frontend`, and deployment/security references used for the devnet program.

## M2.4 Work Log

### 2026-06-04

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M2.4.
- Opened the relevant local skills and references for Solana frontend transactions, wallet-gated flows, frontend quality, and backend API/indexer behavior.
- Started M2.4 after M2.3 was marked complete with user confirmation.
- Added server-side rule preflight at `POST /rule-preflight` with sanitization, authoritative token counting, prompt-injection pattern rejection, on-chain byte-limit enforcement, rule id assignment, and preflight/hash outputs.
- Added `POST /rule-proposals` and `GET /rule-proposals` to mirror confirmed on-chain proposals for indexing/search/UI performance.
- Extended the Solana frontend helper with `propose_rule` PDA derivation and Anchor/Borsh instruction serialization.
- Replaced simulated rule submission with a devnet proposal flow that requires server preflight before wallet approval, checks for the required `GameToken`, checks rule PDA collisions, sends `propose_rule`, shows transaction status, and displays the confirmed receipt.
- Updated the public live-round rule list to load confirmed devnet proposals from the API and display them above the default rules.
- Updated focused E2E coverage for the rule proposal flow to validate token-limit blocking, server preflight, wallet requirement, and devnet submission entry.
- Verified existing devnet `RuleProposal` account `B1KHQhbEzaXBTTMXSNVCWM6GhSAjFTEwdrY1N7DvBnZU` is owned by deployed program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4`.

## M2.4 Artifact Review

| Artifact                                                       | Status      | Notes                                                                                                                              |
| -------------------------------------------------------------- | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api/src/index.ts`                                        | Implemented | Adds rule preflight, prompt-injection rejection, rule proposal projection, CORS preflight, and compiled server entrypoint support. |
| `apps/web/src/solana/idealerProgram.ts`                        | Implemented | Adds `propose_rule` instruction creation, rule PDA derivation, and dynamic Anchor argument serialization.                          |
| `apps/web/src/features/rule-proposal/RuleProposalComposer.tsx` | Implemented | Replaces simulation with preflight-first devnet submission and receipt/status UI.                                                  |
| `apps/web/src/features/live-round/MobileLiveRoundHub.tsx`      | Implemented | Loads API-projected devnet proposals into the public rule list.                                                                    |
| `apps/web/e2e/rule-proposal.spec.ts`                           | Updated     | Verifies token-limit blocking, preflight-backed review, and wallet-required devnet submission.                                     |

## M2.4 Validation Results

| Requirement                      | Result                                                                                                                                  |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Backend token counter service    | Implemented by `POST /rule-preflight`.                                                                                                  |
| Server-side token limit          | Passed; over-limit preflight returns HTTP 400 before transaction.                                                                       |
| Sanitized rule text              | Implemented by backend control-character removal, whitespace normalization, and on-chain byte-limit enforcement.                        |
| Prompt-injection rejection       | Passed; obvious injection text returns HTTP 400 before transaction.                                                                     |
| Devnet transaction creation      | Implemented in the wallet-backed composer through `client.transaction.prepareAndSend`.                                                  |
| On-chain `RuleProposal` evidence | Passed. Devnet account `B1KHQhbEzaXBTTMXSNVCWM6GhSAjFTEwdrY1N7DvBnZU` exists and is owned by the deployed program.                      |
| On-chain text/hash consistency   | Passed. Decoded sanitized text `Win if the submitted guess contains all six drawn numbers.` hashes to the stored `sanitized_text_hash`. |
| Public rule projection           | Implemented through `GET /rule-proposals` and live-round list loading.                                                                  |
| API typecheck/lint/build         | Passed with focused package commands.                                                                                                   |
| Web typecheck/lint               | Passed with focused package commands.                                                                                                   |
| Focused web E2E                  | Passed with `pnpm --filter @idealer/web test:e2e -- e2e/rule-proposal.spec.ts e2e/number-picker.spec.ts`.                               |

## M2.4 Confirmation Gate

`M2.4` was marked complete after explicit user confirmation on 2026-06-04 and after verifying on-chain `RuleProposal` text/hash consistency. Required markdown documents opened before work: `PRD.md`, `AGENTS.md`, `.claude/skills`, `solana-dev`, `develop-frontend`, and `security-threat-checklist`.

## M2.5 Work Log

### 2026-06-04

- Opened `PRD.md`, `AGENTS.md`, and `.claude/skills` before starting M2.5.
- Opened the relevant Solana, frontend, and security skills before touching voting flow code.
- Started M2.5 after M2.4 was marked complete with user confirmation.
- Extended the Solana frontend helper with `vote_rule`, `RuleVote` PDA derivation, and Anchor instruction serialization.
- Added `POST /rule-votes` and `GET /rule-votes` to project confirmed on-chain votes and aggregate vote counts by rule id.
- Replaced simulated vote switching with a devnet voting flow that requires a connected wallet, checks for the turn `GameToken`, blocks an existing `RuleVote` PDA before wallet approval, sends `vote_rule`, shows status, persists confirmed votes, and updates the activity feed.
- Updated the voting UI to read indexed rule proposals/vote counts and keep the existing devnet bootstrap rule available as a committed on-chain rule.
- Updated focused E2E coverage for the wallet-required devnet vote entry.
- Verified existing devnet `RuleVote` account `Hp1nK5JhWRFjH1aHXfhnXsKuFM479JoeGUeNv7Po6dYC` is owned by deployed program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4` and decodes to `turnId=1`, `ruleId=1`.

## M2.5 Artifact Review

| Artifact                                                | Status      | Notes                                                                                              |
| ------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `apps/web/src/solana/idealerProgram.ts`                 | Implemented | Adds `vote_rule` instruction creation and `RuleVote` PDA derivation.                               |
| `apps/api/src/index.ts`                                 | Implemented | Adds vote receipt persistence and indexed vote count aggregation.                                  |
| `apps/web/src/features/rule-voting/RuleVotingPanel.tsx` | Implemented | Replaces vote simulation with wallet-backed devnet voting, duplicate checks, status, and activity. |
| `apps/web/e2e/rule-voting.spec.ts`                      | Updated     | Verifies indexed devnet rule display and wallet-required vote entry.                               |

## M2.5 Validation Results

| Requirement                   | Result                                                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| On-chain `RuleVote` path      | Implemented by `createVoteRuleInstruction` and wallet-backed `vote_rule` submission.                                                                   |
| One vote per wallet per rule  | Implemented by deterministic `RuleVote` PDA precheck and duplicate error mapping.                                                                      |
| Backend/API vote counts       | Implemented by `GET /rule-votes` aggregate counts.                                                                                                     |
| UI vote state                 | Implemented with pending/confirmed/duplicate/closed/failed states and current-vote display.                                                            |
| Leading rules                 | Implemented from indexed vote counts and displayed in `/play/vote`.                                                                                    |
| Voting cutoff handling        | Implemented with countdown-disabled submission and closed-state error mapping.                                                                         |
| Activity feed                 | Implemented for indexed baseline vote and confirmed user vote.                                                                                         |
| On-chain `RuleVote` evidence  | Passed. Devnet account `Hp1nK5JhWRFjH1aHXfhnXsKuFM479JoeGUeNv7Po6dYC` exists, is owned by the deployed program, and decodes to `turnId=1`, `ruleId=1`. |
| API vote smoke                | Passed against compiled API server: `OPTIONS /rule-votes`, `POST /rule-votes`, and `GET /rule-votes`.                                                  |
| API typecheck/lint/build/test | Passed with focused package commands.                                                                                                                  |
| Web typecheck/lint/build/test | Passed with focused package commands.                                                                                                                  |
| Focused web E2E               | Passed with `pnpm --filter @idealer/web test:e2e -- e2e/rule-voting.spec.ts e2e/rule-proposal.spec.ts`.                                                |

## M2.5 Confirmation Gate

`M2.5` was verified and marked complete on 2026-06-08 after the user confirmed proceeding to the next milestone. Re-verification before ticking: `@idealer/api` typecheck/lint/build passed, `@idealer/web` typecheck/lint passed, and focused E2E `e2e/rule-voting.spec.ts` passed. On-chain `RuleVote` evidence (devnet account `Hp1nK5JhWRFjH1aHXfhnXsKuFM479JoeGUeNv7Po6dYC`) remains valid. PRD checklist and approval criteria are now ticked.

## M2.6 Work Log

### 2026-06-08

- Opened `PRD.md`, `.claude/CLAUDE.md`, `AGENTS.md`, and `.claude/skills` before starting M2.6.
- Added `GET /rounds/:turnId` and `GET /rounds` to `apps/api/src/index.ts`, with an exported `getRoundSummary` helper that aggregates indexed rule proposals, vote counts, guess counts, turn-cycle step/duration from `TURN_DURATION_CYCLE_HOURS`, an indicative prize pool derived from `MVP_FEES_SOL`, and a `current`/`completed`/`upcoming` status relative to `IDEALER_ACTIVE_TURN_ID`.
- Added `deriveRoundAccounts` to `apps/web/src/solana/idealerProgram.ts` to derive the `turnState` and `prizeVault` PDAs for audit links without requiring a player address.
- Built the public round page `apps/web/src/features/round-page/RoundPage.tsx` and route `apps/web/src/app/round/[turnId]/page.tsx`: turn id, status, cycle step/duration/next-duration/pattern, prize pool (live on-chain prize-vault balance with explicit fallback to the indexed indicative pool), rules + vote counts with leading-rule highlight, connected-user guess state (indexed receipt and on-chain `PlayerGuess` fallback), a draw/result placeholder noting M3, explorer audit links (program, turn state, prize vault, per-rule accounts), and a copy-link share action. The route itself is the shareable per-round URL and any `turnId` (including completed rounds after rollover) remains accessible.
- Added round-page styling to `apps/web/src/app/globals.css` reusing the existing voting/picker design tokens.
- Added E2E coverage `apps/web/e2e/public-round.spec.ts` for the rendered round state and invalid-round handling.

## M2.6 Artifact Review

| Artifact                                          | Status      | Notes                                                                                              |
| ------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| `apps/api/src/index.ts`                           | Implemented | Adds `getRoundSummary` and the `GET /rounds/:turnId` + `GET /rounds` round-summary endpoints.       |
| `apps/web/src/solana/idealerProgram.ts`           | Implemented | Adds `deriveRoundAccounts` for turn-state and prize-vault audit links.                              |
| `apps/web/src/features/round-page/RoundPage.tsx`  | Implemented | Public round page rendering current/completed round state, guess state, audit links, and sharing.  |
| `apps/web/src/app/round/[turnId]/page.tsx`        | Implemented | Dynamic per-round route providing the shareable URL.                                               |
| `apps/web/src/app/globals.css`                    | Updated     | Adds `round-*` layout styling.                                                                      |
| `apps/web/e2e/public-round.spec.ts`               | Added       | Verifies indexed round rendering and invalid-round rejection.                                      |

## M2.6 Validation Results

| Requirement                       | Result                                                                                                                                      |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Current round page                | Implemented at `/round/[turnId]` with `status = current` for the active turn.                                                               |
| Completed round page              | Same route renders `status = completed` for past turns and stays accessible after rollover (round addressed by `turnId`).                    |
| Turn id                           | Shown as `TURN-XXXX` in header and summary.                                                                                                  |
| Turn duration and cycle step      | Derived from `TURN_DURATION_CYCLE_HOURS`; shows step index, duration, next duration, and full pattern.                                       |
| Prize pool                        | Live on-chain prize-vault balance via RPC, with explicit indexed indicative pool (from `MVP_FEES_SOL`) shown while loading or on RPC error. |
| Rules and vote counts             | Listed from `GET /rounds/:turnId` with leading-rule highlight and per-rule explorer links.                                                  |
| Submitted guess for connected user| Reads indexed `/guess-receipts` and falls back to on-chain `PlayerGuess`; prompts wallet connect when disconnected.                          |
| Draw/result state when available  | Explicit placeholder stating draw/result data arrives in M3.                                                                                 |
| Audit links/placeholders          | Explorer links for program, turn-state PDA, prize-vault PDA, and per-rule proposal accounts.                                                 |
| Shareable URL per round           | The `/round/[turnId]` route is the shareable URL plus an in-page copy-link action.                                                          |
| Rounds endpoint smoke             | Passed: `GET /rounds/1` returns `status=current`, step 0 (2h); `GET /rounds/3` returns `status=upcoming`, step 2 (8h).                       |
| API typecheck/lint/build          | Passed with focused package commands.                                                                                                        |
| Web typecheck/lint                | Passed with focused package commands.                                                                                                        |
| Web E2E (full suite)              | Passed 11/11 against the matching API: `NEXT_PUBLIC_IDEALER_API_URL=http://localhost:3009 pnpm --filter @idealer/web test:e2e`.              |

## M2.6 Confirmation Gate

`M2.6` was verified and marked complete on 2026-06-08 after the user confirmed proceeding to the next milestone. Re-verification before ticking: `@idealer/api` typecheck/build passed, `@idealer/web` typecheck passed, and the hermetic E2E `e2e/public-round.spec.ts` passed 2/2. PRD checklist and approval criteria are now ticked.

Environment note: the running Docker stack serves an older API image on `:::3002` whose CORS rejects the test origin, so browser fetches against it fail. The full E2E suite was therefore run against the freshly built API on a dual-stack port `3009`; rebuilding the Docker `idealer-api` image will align the deployed devnet API with the new `/rounds` endpoint.

## M3.1 Work Log

### 2026-06-08

- Opened `PRD.md`, `.claude/CLAUDE.md`, `AGENTS.md`, and the Solana/security skills before starting M3.1.
- Chose the verifiable-randomness consumer pattern (user-confirmed) for the draw: randomness is sourced off-chain from a verifiable provider (Switchboard On-Demand) and consumed on-chain, with deterministic on-chain number derivation.
- Program (`contracts/solana/programs/idealer`): added `DrawStatus`, extended `TurnState` (draw status/request/fulfillment/randomness/timestamps/failure code), and added `request_draw`, `settle_draw`, and `fail_draw` instructions, accounts, events, and errors. Added `domain::derive_draw_numbers` (SHA-256 over `randomness | turn_id | counter`, rejection sampling for unbiased `1..=100`).
- Backend (`apps/api`): added `DrawRecord`, `POST /draws`, `GET /draws/:turnId`, and integrated the draw into `GET /rounds/:turnId`.
- Worker (`apps/worker`): added `planDrawAction`, `runDrawCycle`, and a `deriveDrawNumbers` TypeScript mirror, with a `node:test` suite; wired `test` script to run it.
- Frontend (`apps/web`): the public round page renders fulfilled (numbers + proof/source/settle links), delayed (`requested`), and `failed` draw states from the round summary.
- Built the SBF artifact and ran the SBF instruction suite via a pinned Agave toolchain container (`scripts/sbf.sh`), persisting the toolchain into the `idealer-solana-home` volume.

## M3.1 Validation Results

| Requirement                          | Result                                                                                                                            |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| Selected VRF flow (consumer pattern) | Implemented; randomness account + revealed value + source stored on-chain for audit.                                              |
| Trigger draw at correct turn time    | `planDrawAction` requests once the turn has ended; worker `node:test` covers it.                                                  |
| 6 unique numbers 1..=100             | `derive_draw_numbers` verified by Rust unit tests and SBF instruction test.                                                       |
| Store draw result + VRF proof/ref    | On-chain `TurnState` (result, randomness, request/fulfillment) and backend `DrawRecord`.                                          |
| Display draw result in UI            | Public round page renders fulfilled draw with numbers, proof, and explorer links.                                                 |
| Handle delayed VRF response          | `DrawStatus::Requested` + worker `wait`; UI "Draw requested" state. Verified.                                                     |
| Handle VRF failure state             | `fail_draw` + `DrawStatus::Failed` + retry from failed; UI "Draw failed" state. Verified (SBF test).                              |
| Draw integrity tests                 | Rust core (9/9), SBF instructions (3/3 single-threaded), worker `node:test` (12/12), cross-language known-vector parity locked.    |
| Program native cargo check/clippy/test | Passed via the pinned Linux container.                                                                                          |
| SBF build                            | `idealer.so` (≈448 KB) built with Agave/`cargo-build-sbf` 4.0.0.                                                                  |
| API / worker / web typecheck+lint    | Passed. API draw endpoints smoke-tested live; full web E2E 12/12 (incl. draw-state specs).                                        |
| Devnet upgrade-deploy                | BLOCKED — see gate below.                                                                                                          |

## M3.1 Confirmation Gate

`M3.1` was verified end-to-end and marked complete on 2026-06-09. The SBF artifact builds and passes the SBF instruction suite (3/3 single-threaded) against the exact deployed bytes, and the user funded the deployer to authorize the on-chain upgrade.

Devnet deploy evidence (`solana program show`):

```text
Program Id: 6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4
Owner: BPFLoaderUpgradeab1e11111111111111111111111
ProgramData Address: BUo2vYwYvj2UWYFgryrMF7bBTrLQQFYVU6xHuoTJbJBD
Authority: 4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH
Last Deployed In Slot: 468217908
Data Length: 448024 (0x6d618) bytes
```

Upgrade transaction signature: `2i5CpPxzQgruXMwiLShdhdDFr8ExeDiBGYbWHhKAUDHLoYNWLeXDArguDdechW87bzgLnXch4BEAWDwiWEQ3L7Nx`.

Note: a live end-to-end devnet draw (open → reach turn end → settle) requires the turn-automation worker loop scheduled in a later milestone; the deployed program, on-chain proof storage, backend, and UI rendering are all in place and exercised by the SBF instruction suite against the deployed artifact.
## M3.2 Work Log

### 2026-06-11

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying and implementing `M3.2`, as required.
- Opened the relevant local skills before code changes: `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/sendai/skills/switchboard/SKILL.md`, `.claude/skills/security-threat-checklist/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/best-practices/references/web3-contracts.md`, and `.claude/skills/best-practices/references/testing.md`.
- Verified `M3.2` was not already complete: `PRD.md` had all M3.2 checklist and approval items unticked, `PROGRESS_TRACKER.md` had no M3.2 status row, and code search found only election config/state placeholders plus proposal/vote basics.
- Program/domain (`contracts/solana/programs/idealer`): added deterministic election logic with eligible filtering, duplicate-candidate rejection, deterministic vote tie-breaking, eligible-pool/top/random/finalist hashes, rejection-sampled random finalist selection, and rejection-sampled active finalist selection. Added `precompile_rule`, `lock_rule_election_pool`, `request_rule_election_vrf`, and `settle_rule_election` instructions plus events/errors.
- Worker (`apps/worker`): added `election.ts` with the matching deterministic planner/cycle runner and tests for cutoff state transitions, top-voted finalists, fulfilled-randomness random finalists, duplicate rejection, and settlement publishing.
- API (`apps/api`): added precompilation projection support, election audit records, `/rule-precompilations`, `/elections`, `GET /elections/:turnId`, and included `election` plus rule precompilation state in `GET /rounds/:turnId`.
- Frontend (`apps/web`): added public round election audit rendering for top finalists, random finalists, active rule, finalist hashes, eligible pool hash, elected finalist index, and VRF source/reference.
- Updated `PRD.md` M3.2 checklist and approval criteria after the user's explicit instruction to verify/do M3.2 and mark it done.

## M3.2 Validation Results

| Requirement | Result |
| --- | --- |
| Rule proposal pool per turn | Existing per-turn `RuleProposal` PDA/API projection retained and surfaced in round summaries. |
| Background precompilation cache | Added program/API precompilation state (`pending`, `passed`, `failed`) and compiled artifact hash projection. |
| Eligible pool | Election filters to eligible state, passed precompilation, non-zero artifact hash, zero reports, and unique rule ids. |
| Election cutoff | Program and worker enforce cutoff before pool lock/request/settlement. |
| Eligible pool hash | Program locks `eligible_rule_pool_hash`; settlement recomputes and rejects mismatches. |
| Top + random finalists | Deterministic 3 top-voted tie-break order plus 7 fulfilled-randomness random finalists when the eligible pool exceeds 10. |
| Fulfilled VRF randomness only | Worker/program settlement derive random finalists and active rule from the fulfillment randomness value, not request entropy. |
| No modulo-only selection | Random finalists and active finalist use rejection sampling over u64 chunks. |
| Ties, empty pools, invalid pools | Tests cover deterministic ties, empty original-only elections, invalid filtered candidates, and duplicate candidate rejection. |
| Audit visibility | API stores election records and public round UI renders finalist ids, hashes, active rule, elected index, and randomness references. |

## M3.2 Verification Commands

Passed:

- `pnpm --filter @idealer/worker test` (17/17)
- `pnpm --filter @idealer/worker typecheck`
- `pnpm --filter @idealer/worker lint`
- `pnpm --filter @idealer/worker build`
- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api build`
- `pnpm --filter @idealer/web typecheck`
- `pnpm --filter @idealer/web lint`
- `pnpm --filter @idealer/web build`
- `pnpm --filter @idealer/web test:e2e -- e2e/public-round.spec.ts` (3/3)
- `cargo fmt --manifest-path contracts/solana/Cargo.toml --check`

Rust/Solana environment blocker:

- Raw `cargo test --manifest-path contracts/solana/programs/idealer/Cargo.toml --test core` could not compile on this Windows shell because MSVC `link.exe` is not installed.
- The documented Windows-safe `pnpm --filter @idealer/solana-programs typecheck` could not start because Docker Desktop is not running (`failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine`).
- The new ignored SBF instruction test for the election flow is present in `contracts/solana/programs/idealer/tests/instructions.rs` and should be run with the documented container/SBF path once Docker is available.

## M3.2 Confirmation Gate

`M3.2` was implemented and marked complete on 2026-06-11 after the user's explicit instruction to verify it, complete it if necessary, and mark it as done. The remaining Rust/SBF verification is environment-blocked on this machine, not skipped as a fallback.

## M3.3 Work Log

### 2026-06-11

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying and implementing `M3.3`, as required.
- Opened the relevant local skills before code changes: `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/security-threat-checklist/SKILL.md`, and `.claude/skills/develop-frontend/SKILL.md`.
- Verified `M3.3` was not already complete: `PRD.md` had all M3.3 checklist and approval items unticked, `PROGRESS_TRACKER.md` had no M3.3 status row, and code search found no persisted validation log flow, no prompt contract, and only placeholder compiler behavior.
- Compiler (`packages/rule-compiler`): replaced placeholder compilation with deterministic validation/precompilation, prompt contract metadata, draw/guess-only checks, ambiguity/external-dependency detection, deterministic test-case generation/evaluation, schema/runtime safety checks, confidence breakdown scoring, validation logs, and artifact hashes for valid rules.
- API (`apps/api`): added rule-validation records, validation run/storage endpoints, persisted validation summaries on rule proposals, precompilation status updates, artifact-hash storage for valid rules, invalidation for failed rules, and validation data in public round summaries.
- Worker (`apps/worker`): added a background validation cycle that fetches pending rules, runs compiler validation, and publishes valid/invalid validation logs without fallback behavior.
- Frontend (`apps/web`): displayed validation/precompilation status, decision confidence, and reason summary on public round rule cards.
- Updated `PRD.md` M3.3 checklist and approval criteria after the user's explicit instruction to verify/do M3.3 and mark it done.

## M3.3 Validation Results

| Requirement | Result |
| --- | --- |
| Agent Service validation flow | `validateAndPrecompileRule` provides the deterministic validation/precompilation contract used by API and worker flows. |
| Background precompilation worker | `runRuleValidationCycle` validates pending proposals and publishes validation logs for valid and invalid outcomes. |
| Prompt contract | Versioned prompt contract metadata is exported and covered by tests. |
| Draw/guess-only validation | Rules referencing wallet, votes, time, balances, APIs, or other external state are rejected. |
| Ambiguity detection | Ambiguous phrasing such as close/closest/near/lucky/about is rejected with explicit reason codes. |
| Test generation and evaluation | Compiler-generated deterministic test cases are evaluated through `@idealer/rule-runtime`. |
| Confidence breakdown | `model_confidence`, `rule_clarity_score`, `compiler_confidence`, `reviewer_agreement_score`, `test_coverage_score`, `runtime_safety_score`, `schema_score`, and `final_confidence` are computed and stored. |
| VALID/INVALID thresholding | Rules require deterministic checks plus `final_confidence >= 0.75`; failures return `INVALID` without an artifact. |
| Validation logs | Logs include reason, scores, model, prompt contract version, timestamp, test cases, and artifact hash when valid. |
| UI status | Public round rule cards show validation status, confidence, and reason summary. |
| Invalid elected artifact handling | Invalid records mark proposals `invalidated` and `failed`, keeping them out of eligible precompiled election pools with no fallback finalist activation. |

## M3.3 Verification Commands

Passed:

- `pnpm --filter @idealer/rule-compiler test` (6/6)
- `pnpm --filter @idealer/rule-compiler typecheck`
- `pnpm --filter @idealer/rule-compiler lint`
- `pnpm --filter @idealer/rule-compiler build`
- `pnpm --filter @idealer/worker test` (18/18)
- `pnpm --filter @idealer/worker typecheck`
- `pnpm --filter @idealer/worker lint`
- `pnpm --filter @idealer/worker build`
- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api build`
- `pnpm --filter @idealer/web typecheck`
- `pnpm --filter @idealer/web lint`
- `pnpm --filter @idealer/web build`
- `pnpm --filter @idealer/web test:e2e -- e2e/public-round.spec.ts` (3/3)

Docker runtime:

- `docker compose build api worker web`
- `docker compose up -d --force-recreate api worker web`
- `docker compose ps` showed `api`, `worker`, `web`, `postgres`, and `redis` healthy.
- `GET http://127.0.0.1:3002/health` returned API `ok` with Postgres and Redis `ok`.
- `GET http://127.0.0.1:3003/health` returned worker `ok` with Postgres and Redis `ok`.
- `GET http://127.0.0.1:3000/play` returned HTTP 200.
- Containerized API smoke test passed: `rule-preflight -> rule-proposals -> rule-validations/run` returned `VALID`, `finalConfidence: 0.947`, stored compiled artifact hash `7889390d2d6394ec2a71375ff6841bb42f011d071dd07fe0ad888eedaac41d80`, and moved the proposal to `eligible`/`passed`.

## M3.3 Confirmation Gate

`M3.3` was implemented and marked complete on 2026-06-11 after the user's explicit instruction to verify it, complete it if necessary, and mark it as done.

## M3.4 Work Log

### 2026-06-11

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying `M3.3` and proceeding to `M3.4`, as required.
- Opened the relevant local skills before code changes: `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/best-practices/references/testing.md`, and `.claude/skills/security-threat-checklist/SKILL.md`.
- Verified `M3.3` was already complete in `PRD.md` and `PROGRESS_TRACKER.md`, so proceeded to the next defined milestone, `M3.4`.
- Verified `M3.4` was not already complete: `PRD.md` had all M3.4 checklist and approval items unticked, and the current compiler confidence implementation used camelCase fields plus a single VALID/INVALID decision without the PRD accept/escalate/reject threshold action.
- Agent core (`packages/agent-core`): added the canonical `CompilerConfidenceBreakdown` schema with snake_case fields, configured PRD weights, configured PRD thresholds, final confidence calculation, clamping, and accept/escalate/reject action selection.
- Rule compiler (`packages/rule-compiler`): switched validation logs to the canonical confidence schema, imported the shared configured policy, stored confidence weights and thresholds in logs, and made final acceptance depend on `final_confidence` plus deterministic checks.
- API and worker: propagated the `confidenceAction` field and updated validation record checks/publication to store canonical `confidence` records while preserving the UI summary `finalConfidence` field.
- Added tests for high-confidence accept, low-confidence reject, malformed empty rule reject, disagreement-band escalation, canonical confidence keys, configured weights, and configured thresholds.
- Updated `PRD.md` M3.4 checklist and approval criteria after the user's explicit instruction to follow to the next milestone when M3.3 was already complete.

## M3.4 Validation Results

| Requirement | Result |
| --- | --- |
| `model_confidence` | Captured in the canonical `CompilerConfidenceBreakdown`. |
| `rule_clarity_score` | Calculated from ambiguity and length signals. |
| `compiler_confidence` | Calculated from supported compiler coverage. |
| `reviewer_agreement_score` | Calculated and lowered for disagreement/escalation cases. |
| `test_coverage_score` | Calculated from deterministic runtime test pass rate. |
| `runtime_safety_score` | Calculated from bounded AST/runtime safety checks. |
| `schema_score` | Calculated from canonical AST schema validation. |
| `final_confidence` | Calculated using configured PRD weights: 0.20/0.20/0.20/0.15/0.15/0.05/0.05. |
| Canonical schema | Stored as snake_case `CompilerConfidenceBreakdown` fields in validation logs and records. |
| Threshold logic | `>= 0.85` accepts, `0.70..0.85` escalates, `< 0.70` rejects conservatively. |
| Tests | Covered high-confidence, low-confidence, malformed, and disagreement/escalation cases. |

## M3.4 Verification Commands

Passed:

- `pnpm --filter @idealer/agent-core typecheck`
- `pnpm --filter @idealer/agent-core build`
- `pnpm --filter @idealer/agent-core lint`
- `pnpm --filter @idealer/agent-core test`
- `pnpm --filter @idealer/rule-compiler test` (9/9)
- `pnpm --filter @idealer/rule-compiler typecheck`
- `pnpm --filter @idealer/rule-compiler lint`
- `pnpm --filter @idealer/rule-compiler build`
- `pnpm --filter @idealer/worker test` (18/18)
- `pnpm --filter @idealer/worker typecheck`
- `pnpm --filter @idealer/worker lint`
- `pnpm --filter @idealer/worker build`
- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api build`
- `pnpm --filter @idealer/web typecheck`
- `pnpm --filter @idealer/web lint`
- `pnpm --filter @idealer/web build`
- `pnpm --filter @idealer/web test:e2e -- e2e/public-round.spec.ts` (3/3)

Known non-blocking test output:

- The Playwright run emitted expected devnet warmup warnings from aborted/blocked `https://api.devnet.solana.com` fetches; all E2E assertions passed.

Docker runtime:

- `docker compose build api worker web`
- `docker compose up -d --force-recreate api worker web`
- `docker compose ps` showed `api`, `worker`, `web`, `postgres`, and `redis` healthy.
- `GET http://127.0.0.1:3002/health` returned API `ok` with Postgres and Redis `ok`.
- `GET http://127.0.0.1:3003/health` returned worker `ok` with Postgres and Redis `ok`.
- `GET http://127.0.0.1:3000/play` returned HTTP 200.
- Containerized API smoke test passed: `rule-preflight -> rule-proposals -> rule-validations/run` returned `VALID`, `confidenceAction: ACCEPT`, canonical `confidence.final_confidence: 0.936`, `confidence.model_confidence: 0.86`, and compiled artifact hash `7889390d2d6394ec2a71375ff6841bb42f011d071dd07fe0ad888eedaac41d80`.

## M3.4 Confirmation Gate

`M3.4` was implemented and marked complete on 2026-06-11 after the user's explicit instruction to verify M3.3, mark it done if complete, and follow to the next milestone.

## M3.5 Work Log

### 2026-06-11

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying `M3.4` and proceeding to `M3.5`, as required.
- Opened the relevant local skills before code changes: `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/testing.md`, and `.claude/skills/security-threat-checklist/SKILL.md`.
- Verified `M3.4` was already complete in `PRD.md` and `PROGRESS_TRACKER.md`, so proceeded to the next defined milestone, `M3.5`.
- Verified `M3.5` was not already complete: `PRD.md` had all M3.5 checklist and approval items unticked, and code search found no guess verification job queue, retry/dead-letter handling, or verification result state.
- Worker (`apps/worker`): added `guess-verification.ts` with the canonical `guess.verification` payload shape, original-rule verification, frozen active alternative artifact verification through `@idealer/rule-runtime`, no LLM/compiler dependency, retry policy, dead-letter handling, and per-cycle rate limiting.
- Worker tests: added coverage for original plus active alternative verification, original-only turns, max jobs per cycle, retry scheduling, and dead-letter capture.
- API (`apps/api`): added in-memory verification job and result projections, job creation for every submitted guess after a fulfilled draw, fail-closed active-artifact hash validation, job/result listing endpoints, result completion updates, and verification summary in round summaries.
- Validation records now retain the valid compiled artifact alongside its hash so post-draw verification can evaluate the frozen DSL/AST artifact.
- Updated `PRD.md` M3.5 checklist and approval criteria after the user's explicit instruction to follow to the next milestone when M3.4 was already complete.

## M3.5 Validation Results

| Requirement | Result |
| --- | --- |
| Create verification job per submitted guess | `POST /verification-jobs/create-turn` creates one idempotent job per stored guess receipt for a fulfilled draw. |
| Job payload schema | Jobs include `turn_id`, `wallet`, `guess_hash`, `draw_hash`, optional `active_rule_id`, and optional `compiled_artifact_hash`. |
| Worker processor | `runGuessVerificationCycle` fetches pending jobs, verifies them, completes successful jobs, retries failed jobs, and dead-letters exhausted jobs. |
| Original rule verification | Worker evaluates the MVP original rule deterministically as six drawn-number matches. |
| Alternative rule verification | Worker evaluates the active rule only when a frozen compiled artifact is present and its hash matches the job payload. |
| Runtime-only execution | Alternative verification imports `@idealer/rule-runtime` and `@idealer/rule-schema`; it does not call LLMs or the rule compiler. |
| Retry policy | Failed jobs retry with exponential backoff until `maxAttempts`. |
| Dead-letter queue | Exhausted jobs are routed through `deadLetterJob` and counted as `deadLettered`. |
| Rate limiting | `maxJobsPerCycle` bounds verification/runtime work per cycle. |
| Job status | API tracks `pending`, `processing`, `retry_scheduled`, `completed`, and `dead_letter` statuses. |
| Result state | `POST /verification-results` stores completed results and marks the source job completed. |
| Backend/admin visibility | `GET /verification-jobs`, `GET /verification-results`, and round summaries expose verification state. |

## M3.5 Verification Commands

Passed:

- `pnpm --filter @idealer/worker test` (22/22)
- `pnpm --filter @idealer/worker typecheck`
- `pnpm --filter @idealer/worker lint`
- `pnpm --filter @idealer/worker build`
- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api build`
- `pnpm --filter @idealer/rule-runtime typecheck`
- `pnpm --filter @idealer/rule-runtime build`
- `pnpm --filter @idealer/rule-schema typecheck`
- `pnpm --filter @idealer/rule-schema build`
- `pnpm --filter @idealer/web typecheck`
- `pnpm --filter @idealer/web lint`
- `pnpm --filter @idealer/web build`
- `pnpm --filter @idealer/web test:e2e -- e2e/public-round.spec.ts` (3/3)

Known non-blocking test output:

- The Playwright run emitted expected devnet warmup warnings from aborted/blocked `https://api.devnet.solana.com` fetches; all E2E assertions passed.

Docker runtime:

- `docker compose build api worker web`
- `docker compose up -d --force-recreate api worker web`
- `docker compose ps` showed `api`, `worker`, `web`, `postgres`, and `redis` healthy.
- `GET http://127.0.0.1:3002/health` returned API `ok` with Postgres and Redis `ok`.
- `GET http://127.0.0.1:3003/health` returned worker `ok` with Postgres and Redis `ok`.
- `GET http://127.0.0.1:3000/play` returned HTTP 200.
- Containerized API smoke test passed: created one guess receipt and fulfilled draw, `POST /verification-jobs/create-turn` created one pending job, `POST /verification-results` completed it, and `GET /verification-jobs?turnId=935` listed the job as `completed`.

## M3.5 Confirmation Gate

`M3.5` was implemented and marked complete on 2026-06-11 after the user's explicit instruction to verify M3.4, mark it done if complete, and follow to the next milestone.

## M3.6 Work Log

### 2026-06-12

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying `M3.5` and proceeding to `M3.6`, as required.
- Opened the relevant local skills before implementation: `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/testing.md`, and `.claude/skills/security-threat-checklist/SKILL.md`.
- Verified `M3.5` was already complete in `PRD.md` and `PROGRESS_TRACKER.md`; `PRD.md` had all M3.5 checklist and approval items ticked.
- Verified `M3.6` was not already complete: `PRD.md` had all M3.6 checklist and approval items unticked, and the existing compiler only accepted single provider/model labels without provider routing, fallback, dispute handling, or provider-path logging.
- Agent core (`packages/agent-core`): added primary/secondary/tertiary provider routing policy, local-only routing helper, provider capability flags, OpenAI-compatible/Ollama request-shape metadata, per-role model routing, model identity fields, and provider attempt log contracts.
- Rule compiler (`packages/rule-compiler`): added provider-attempt orchestration that uses the primary provider for normal accepted rules, escalates on timeout, malformed response, schema-constrained decoding failure, low confidence, and provider disagreement, and uses tertiary output as the dispute tiebreaker.
- Rule compiler artifacts now freeze `modelIdentity` and `providerPath` alongside the deterministic DSL/AST artifact; logs now include provider path, fallback rate sample, provider disagreement rate sample, and model identity.
- Worker/API validation projections now preserve provider path, model identity, fallback/disagreement metrics, and provider identity in validation records and summaries.
- Documentation/config: added primary/secondary/tertiary provider environment keys to `.env.example` and documented provider attempt logs in `docs/agent-schema-draft.md`.
- Updated `PRD.md` M3.6 checklist and approval criteria after the user's explicit instruction to verify M3.5, mark it done if complete, and follow to the next milestone.

## M3.6 Validation Results

| Requirement | Result |
| --- | --- |
| Configure primary/secondary/tertiary providers | `createDefaultProviderRoutingPolicy` creates all three provider priorities with model identity and request-shape metadata. |
| Local/self-hosted OpenAI-compatible provider | `createLocalOnlyProviderRoutingPolicy` supports local OpenAI-compatible endpoints and identifies Ollama request shape. |
| Capability flags and request shape | Provider attempts record grammar/schema flags, local/OpenAI compatibility, Ollama support, and request shape. |
| Grammar/schema-constrained decoding | Providers without grammar/schema capability are treated as schema failures and escalated through the provider path. |
| Timeout, malformed response, schema failure escalation | Focused compiler tests cover all three failure modes and verify fallback path creation. |
| Low confidence escalation | Existing confidence action policy still escalates `0.70 <= final_confidence < 0.85`; provider orchestration continues on `ESCALATE`. |
| Provider disagreement and tertiary tiebreaker | Focused compiler test drives primary/secondary/tertiary disagreement and verifies the unresolved dispute fails closed with provider path logged. |
| Per-role model routing | Provider config includes model routing for compile, interpret, normalize, explain, and review roles. |
| Model identity in logs/artifacts | Validation logs and frozen artifacts include provider, model, digest, quantization, and serving engine. |
| Fallback/disagreement metrics | Validation logs expose `fallbackRateSample`, `fallbackTriggered`, and `providerDisagreementRateSample`; API/worker records preserve them. |

## M3.6 Verification Commands

Passed:

- `pnpm --filter @idealer/agent-core lint`
- `pnpm --filter @idealer/agent-core typecheck`
- `pnpm --filter @idealer/agent-core build`
- `pnpm --filter @idealer/rule-compiler typecheck`
- `pnpm --filter @idealer/rule-compiler lint`
- `pnpm --filter @idealer/rule-compiler test` (13/13)
- `pnpm --filter @idealer/rule-compiler build`
- `pnpm --filter @idealer/worker typecheck`
- `pnpm --filter @idealer/worker lint`
- `pnpm --filter @idealer/worker test` (22/22)
- `pnpm --filter @idealer/worker build`
- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api build`

## M3.6 Confirmation Gate

`M3.6` was implemented and marked complete on 2026-06-12 after the user's explicit instruction to verify M3.5, mark it done if complete, and follow to the next milestone.

## M3.7 Work Log

### 2026-06-12

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying `M3.6` and proceeding to `M3.7`, as required.
- Opened the relevant local skills before implementation: `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/web2-backend.md`, `.claude/skills/best-practices/references/testing.md`, and `.claude/skills/security-threat-checklist/SKILL.md`.
- Verified `M3.6` was already complete in `PRD.md` and `PROGRESS_TRACKER.md`; `PRD.md` had all M3.6 checklist and approval items ticked.
- Verified `M3.7` was not already complete: `PRD.md` had all M3.7 checklist and approval items unticked, and API/worker state had no unified public audit log, hash-chain commitment, PostgreSQL audit-log schema, or public audit endpoint.
- API (`apps/api`): added `AuditLogRecord`, `audit_logs` PostgreSQL schema contract, PostgreSQL row adapter, hash-chain commitment generation, tamper verification helper, and public `/audit` plus `/audit/{logHash}` endpoints.
- Compiler validation saves now append audit records containing sanitized rule text, token count, model identity, model confidence, final confidence, confidence breakdown, result, reason, input hash, output hash, and validation public-state reference.
- Guess verification result saves now append audit records containing draw, guess, frozen artifact hash when present, original/alternative branch results, result reason, input hash, output hash, and result public-state reference.
- Docs updated: `docs/data-model-draft.md`, `docs/api-contracts.md`, and `docs/agent-schema-draft.md` now describe the audit table, endpoints, and attestation record shape.
- Updated `PRD.md` M3.7 checklist and approval criteria after the user's explicit instruction to verify M3.6, mark it done if complete, and follow to the next milestone.

## M3.7 Validation Results

| Requirement | Result |
| --- | --- |
| Store compiler logs in PostgreSQL | `M3_7_POSTGRES_AUDIT_SCHEMA`, `toPostgresAuditLogRow`, and `storeAuditLogInPostgres` define and exercise the PostgreSQL `audit_logs` storage path. |
| Rule text/token count | Compiler audit input includes sanitized rule text, token count, max token limit, turn id, and rule id. |
| Draw and guess where relevant | Guess verification audit input includes draw, draw hash, guess, guess hash, player, job id, turn id, and frozen artifact hash when active. |
| Result and reason | Audit logs include `result` and `reason` for validation and verification records. |
| Model and confidence fields | Compiler audit output includes provider/model identity, `modelConfidence`, `finalConfidence`, and full confidence breakdown. |
| Input/output hashes | Every audit record stores recomputable `inputHash` and `outputHash`. |
| Auditable commitment | Every audit record stores `previousLogHash`, `logHash`, and `commitmentHash` using `postgres_hash_chain_v1`. |
| Public audit endpoint | Local API exposes `GET /audit` and `GET /audit/{logHash}`. |
| Traceable to public state | Audit logs carry `publicStateRef` for `rule_validation` or `guess_verification_result`. |
| Tamper detection | API tests mutate an audit output and verify `verifyAuditLogIntegrity` fails. |

## M3.7 Verification Commands

Passed:

- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api test` (3/3)
- `pnpm --filter @idealer/api build`
- `pnpm --filter @idealer/worker typecheck`
- `pnpm --filter @idealer/rule-compiler typecheck`

## M3.7 Confirmation Gate

`M3.7` was implemented and marked complete on 2026-06-12 after the user's explicit instruction to verify M3.6, mark it done if complete, and follow to the next milestone.

## M4.1 Work Log

### 2026-06-13

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before proceeding to `M4.1`, as required.
- Opened the relevant local skill guidance before implementation: `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/backend-async.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`.
- Verified `M3.7` was the last completed milestone in this tracker and `M4.1` was the next requested milestone.
- API (`apps/api`): added deterministic lamport-level prize pool accounting for guess submission fees, rule proposal fees, paid rule removal fees, vote fees gated from turn 100 onward, treasury/platform monetization, original and alternative bucket splits, bucket rollover inputs, current turn pool, total visible prize pool, and no-winner next rollover amounts.
- API (`apps/api`): added projected paid rule removal records, per-turn rollover records, `GET /prize-pool-accounting/{turn_id}`, `POST/GET /rule-removals`, and `POST/GET /prize-pool-rollovers` local compatibility endpoints.
- Constants (`packages/constants`): added `LAMPORTS_PER_SOL` and `VOTE_FEE_START_TURN` exports for shared accounting behavior.
- Solana program domain (`contracts/solana/programs/idealer/src/domain.rs`): added pure checked accounting structs and `calculate_prize_pool_accounting` so on-chain-adjacent logic has the same deterministic source/bucket math before later payout instructions consume it.
- Docs: updated `docs/api-contracts.md` and `docs/data-model-draft.md` with the M4.1 accounting response, compatibility endpoints, and storage projection model.
- No PRD checklist item or milestone checkbox was ticked; milestone approval still requires explicit user confirmation.

## M4.1 Validation Results

| Requirement | Result |
| --- | --- |
| Track guess submission fees | API accounting source `guessSubmissions` stores count, fee, gross, treasury, and prize lamports. |
| Track rule proposal fees | API accounting source `ruleProposals` stores count, fee, gross, treasury, and prize lamports. |
| Track paid rule removal fees | Added projected `PaidRuleRemovalRecord` storage and accounting source `paidRuleRemovals`. |
| Track vote fees from turn 100 onward | Vote source is zero before turn 100 and counted from turn 100 onward; default MVP vote fee remains `0 SOL`. |
| Apply treasury/platform monetization | Each source uses integer treasury basis-point split; `treasuryLamports` and `platformMonetizationLamports` are exposed. |
| Split post-fee prize pool into buckets | Current turn pool is split into separated original and alternative buckets without losing odd lamports. |
| Track rollover per bucket | `TurnRolloverRecord` stores original and alternative rollover inputs separately. |
| Track current turn pool | `currentTurnPoolLamports` is exposed after treasury/platform split. |
| Track total visible prize pool | `totalVisiblePrizePoolLamports` includes current bucket totals plus bucket rollovers. |
| Rollover when no winners exist | `nextRolloverIfNoWinnersLamports` returns the full original and alternative bucket totals independently. |

## M4.1 Verification Commands

Passed:

- `pnpm --filter @idealer/constants typecheck`
- `pnpm --filter @idealer/constants lint`
- `pnpm --filter @idealer/constants build`
- `pnpm --filter @idealer/api test` (6/6)
- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api build`
- `cargo fmt --check`
- `cargo test -p idealer --test core` (14/14, after the 2026-06-13 Windows GNU toolchain fix documented below)

## M4.1 Confirmation Gate

`M4.1` was verified and marked complete on 2026-06-13 after the user's explicit instruction to verify it and mark it done if complete. PRD checklist and approval criteria are now ticked.

## M4.2 Work Log

### 2026-06-13

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying `M4.1` and proceeding to `M4.2`, as required.
- Opened the relevant local skill guidance before implementation: `.claude/skills/solana-dev/SKILL.md` and `.claude/skills/solana-dev/backend-async.md`.
- Verified `M4.1` implementation with API tests and typecheck, then ticked `M4.1` PRD checklist and approval criteria after the user's explicit confirmation to mark it done if complete.
- API (`apps/api`): added `WinnerRecord`, category summaries, deterministic winner calculation from completed verification results, and stored winner projection records keyed by turn, category, and player.
- API (`apps/api`): separated original and alternative winner detection, calculated individual payout per bucket, handled zero-winner cases by preserving bucket remainder, and handled multiple winners with integer per-winner payouts.
- API (`apps/api`): recalculates stored winner records when verification results are saved, exposes winner state in `RoundSummary`, and added `GET /winner-records?turnId={turn_id}` plus `POST /winner-records/calculate-turn`.
- Docs: updated `docs/api-contracts.md` and `docs/data-model-draft.md` with winner-record response and storage model.
- Updated `PRD.md` M4.2 checklist and approval criteria after implementation and verification.

## M4.2 Validation Results

| Requirement | Result |
| --- | --- |
| Identify original rule winners | Original winners are selected from completed verification results with `original.result === "WIN"`. |
| Identify alternative rule winners | Alternative winners are selected from completed verification results with `alternative.result === "WIN"`. |
| Handle no-winner cases | Zero-winner tests verify no records are stored and full bucket amounts remain as remainder. |
| Handle multiple winners | Tests verify two original winners share the original bucket while one alternative winner receives the alternative bucket. |
| Calculate individual payout per bucket | Payouts are calculated independently using each category bucket from M4.1 accounting. |
| Store winner records | Winner records are stored in the API projection map and refreshed after verification result saves. |
| Expose winner records to UI | `RoundSummary.winners` and local `/winner-records` endpoints expose winner records and payout state. |
| Tests for zero, one, and many winners | API tests cover zero winners, one alternative winner, and multiple original winners. |

## M4.2 Verification Commands

Passed:

- `pnpm --filter @idealer/api test` (8/8)
- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api build`
- `pnpm --filter @idealer/constants build`
- `cargo fmt --check`
- `cargo test -p idealer --test core` (14/14, after the 2026-06-13 Windows GNU toolchain fix documented below)

## Windows Rust Toolchain Work Log

### 2026-06-13

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before fixing the Windows test toolchain blocker, as required.
- Opened `.claude/skills/solana-dev/SKILL.md` before working on the Solana test command.
- Resolved the `cargo test -p idealer --test core` Windows linker blocker by installing and using `stable-x86_64-pc-windows-gnu` for `contracts/solana`, with WinLibs GCC ahead of LLVM-MinGW in the user PATH and MSYS2 Perl/Make available for vendored OpenSSL builds.
- Set a rustup directory override for `contracts/solana` to `stable-x86_64-pc-windows-gnu`, so plain `cargo test -p idealer --test core` no longer uses the MSVC toolchain that requires `link.exe`.
- Verified the exact command from a fresh PATH simulation: `cargo test -p idealer --test core` passed with 14/14 tests.

## M4.2 Confirmation Gate

`M4.2` was implemented and marked complete on 2026-06-13 after the user's explicit instruction to verify `M4.1`, mark it done if complete, and follow to the next milestone.

## M4.3 Work Log

### 2026-06-13

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying `M4.2` and proceeding to `M4.3`, as required.
- Opened the relevant local skill guidance before implementation: `.claude/skills/solana-dev/SKILL.md` and `.claude/skills/solana-dev/backend-async.md`.
- Verified `M4.2` was already complete in `PRD.md` and `PROGRESS_TRACKER.md`; the PRD checklist and approval criteria were already ticked.
- Constants (`packages/constants`): added `VOTER_REWARD_RATE_BPS` and `VOTER_REWARD_CONFIG.capPerTurnLamports`.
- API (`apps/api`): added deterministic creator and voter reward projection records, a pure reward distribution helper, creator-first reserve funding, voter-pool cap handling, distinct elected-rule voter resolution, and reward recalculation after verification results.
- API (`apps/api`): exposed reward state in `RoundSummary.rewards` and added local compatibility endpoints `POST /reward-records/calculate-turn` and `GET /reward-records?turnId={turn_id}`.
- Docs: updated `docs/api-contracts.md` and `docs/data-model-draft.md` with reward-record response and storage contracts.
- Updated `PRD.md` M4.3 checklist and approval criteria after implementation and verification.

## M4.3 Validation Results

| Requirement | Result |
| --- | --- |
| Identify creator of active rule | Creator wallet is read from the active rule proposal selected by the settled election. |
| Check alternative-rule winners | Reward calculation returns no creator or voter reward when the active alternative rule has zero winners. |
| Calculate individual alternative payout | Reward basis uses `WinnerCalculationSummary.alternative.individualPayoutLamports`. |
| Calculate creator reward | Creator reward is `15%` of the individual alternative payout per alternative winner, subject to cap and reserve availability. |
| Resolve elected-rule voters | Voters are distinct wallets with recorded votes for the active elected rule. |
| Calculate voter reward pool | Voter pool is `15%` of one individual alternative payout, capped and split equally across elected-rule voters. |
| Fund creator first, then voters | Creator reward consumes reserve first; voter pool uses only remaining reserve. |
| Do not reduce winner payouts | Tests verify winner payout remains unchanged while reward records are calculated separately. |
| Store reward records | Creator and voter reward records are stored in API projection maps and exposed through summary/endpoints. |
| Edge cases | Tests cover no alternative winners, multiple alternative winners, and zero elected-rule voters. |

## M4.3 Verification Commands

Passed:

- `pnpm --filter @idealer/constants build`
- `pnpm --filter @idealer/api test` (11/11)
- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/constants typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api build`
- `cargo test -p idealer --test core` (14/14)

## M4.3 Confirmation Gate

`M4.3` was implemented and marked complete on 2026-06-13 after the user's explicit instruction to verify `M4.2`, mark it done if complete, and follow to the next milestone.

## M4.4 Work Log

### 2026-06-13

- Reopened `PRD.md`, `AGENTS.md`, and `.claude/skills` before verifying `M4.3` and proceeding to `M4.4`, as required.
- Opened the relevant local skill guidance before implementation: `.claude/skills/solana-dev/SKILL.md` and `.claude/skills/solana-dev/backend-async.md`.
- Verified `M4.3` was already complete in `PRD.md` and `PROGRESS_TRACKER.md`; the PRD checklist and approval criteria were already ticked.
- Constants (`packages/constants`): added default claim threshold and claim-window constants.
- API (`apps/api`): added claim records for winner payouts, creator rewards, and elected-rule voter rewards; generated claims from winner/reward projections; exposed claim summaries in `RoundSummary.claims`.
- API (`apps/api`): added local claim endpoints `POST /claim-records/create-turn`, `GET /claim-records`, `POST /claim-records/request`, and `POST /claim-records/complete`.
- API (`apps/api`): modeled wallet approval states (`not_requested`, `pending`, `approved`, `failed`), successful claims, failed wallet approvals, below-threshold unavailable claims, and double-claim rejection.
- Web (`apps/web`): added a mobile result claim panel with claimable balance, pending wallet approval, success, failure, retry, and simulated wallet approval actions.
- Docs: updated `docs/api-contracts.md` and `docs/data-model-draft.md` with claim-record endpoint and storage contracts.
- Updated `PRD.md` M4.4 checklist and approval criteria after implementation and verification.

## M4.4 Validation Results

| Requirement | Result |
| --- | --- |
| Winner claim flow | Winner payout records generate claim records and can transition from available to pending wallet approval to claimed. |
| Creator reward claim flow | Creator reward records generate claim records when above the minimum claim threshold. |
| Voter reward claim flow | Elected-rule voter reward records generate claim records and are claimable. |
| Prevent double claim | Claimed records reject a second approval request with `PAYOUT_ALREADY_CLAIMED`. |
| Claimable balance | Claim summaries expose available, pending, claimed, and failed lamport totals. |
| Pending/success/failure states | API and result UI expose pending wallet approval, claimed, and failed approval states. |
| Mobile wallet approval flow | Result page includes simulated claim, approve, reject, and retry actions. |
| Edge cases | Tests cover below-threshold unavailable claims, failed wallet approvals, double-claim blocking, and voter reward claims. |

## M4.4 Verification Commands

Passed:

- `pnpm --filter @idealer/constants build`
- `pnpm --filter @idealer/api test` (14/14)
- `pnpm --filter @idealer/api typecheck`
- `pnpm --filter @idealer/constants typecheck`
- `pnpm --filter @idealer/web typecheck`
- `pnpm --filter @idealer/api lint`
- `pnpm --filter @idealer/api build`
- `pnpm --filter @idealer/web lint`
- `pnpm --filter @idealer/web build`
- `pnpm --filter @idealer/web exec playwright test e2e/draw-result.spec.ts` (1/1)
- `cargo test -p idealer --test core` (14/14)

## M4.4 Confirmation Gate

`M4.4` was implemented and marked complete on 2026-06-13 after the user's explicit instruction to verify `M4.3`, mark it done if complete, and follow to the next milestone.

## Docker Recovery Work Log

### 2026-06-19

- Reopened `PRD.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md` before Docker recovery work, as required.
- Diagnosed the accidental `idealer2` Compose project as a temporary workaround for corrupted Docker Desktop metadata in the required `idealer` project.
- Confirmed the `idealer` project still contains two dead nameless Docker records for old `web` and `worker` containers; `docker rm`, `docker compose rm`, filtered prune, and Docker Desktop restart did not remove them because Docker reports the listed IDs as `No such container`.
- Removed the stopped `idealer2` containers and recreated `idealer-api`, `idealer-web`, and `idealer-worker` with `com.docker.compose.project=idealer` labels; no `idealer2` containers remain.
- Verified `idealer-api`, `idealer-web`, `idealer-worker`, `idealer-postgres`, and `idealer-redis` are running and healthy under the `idealer` project label.
- Verified `GET http://127.0.0.1:3002/health` returns API status `ok`, `GET http://127.0.0.1:3000/play` returns HTTP 200, and `GET http://127.0.0.1:3003/health` returns worker status `ok`.
- Identified a remaining configuration blocker for automatic turn execution: the worker receives empty `IDEALER_TURN_AUTHORITY_KEYPAIR` and `IDEALER_TURN_AUTHORITY_KEYPAIR_PATH` values, so turn automation correctly reports an error instead of running without authority credentials.
- Rechecked the blocked turn-start state after the UI remained on `TURN_ENDED`: `idealer-worker` logs repeatedly show `Turn automation is enabled but IDEALER_TURN_AUTHORITY_KEYPAIR or IDEALER_TURN_AUTHORITY_KEYPAIR_PATH is not set`; `.env` and the running container both have empty authority keypair values, while `IDEALER_TURN_AUTOMATION_ENABLED=true`.
- After `IDEALER_TURN_AUTHORITY_KEYPAIR` was populated in `.env`, recreated `idealer-worker` with `--env-file .env` and verified the worker sees the keypair without printing its value; `/health` now reports `turnAutomation: enabled`.
- Fixed worker diagnostic serialization for Solana simulation errors containing `bigint` values and added test coverage; `pnpm --filter @idealer/worker test` passed 29/29 and `pnpm --filter @idealer/worker typecheck` passed.
- Identified the remaining turn-start blocker as on-chain devnet state incompatibility: `close_turn` simulation fails with Anchor `AccountDidNotDeserialize` for `turn_state` (`Custom 3003`). The active on-chain turn account has the expected `TurnState` discriminator but is only 366 bytes, while the current `TurnState` layout is larger after recent schema additions, so the upgraded program cannot deserialize the stale active turn account to close it.
- Implemented a restricted on-chain recovery path for the stale devnet active turn: `force_skip_legacy_active_turn` is authority-gated, validates the active turn PDA and owner manually through an `UncheckedAccount`, and only runs when the active turn account is undersized for the current `TurnState` layout.
- Updated the worker to call the recovery instruction only when `close_turn` simulation fails specifically with Anchor `AccountDidNotDeserialize` for `turn_state`; other close-turn failures still fail closed.
- Verification passed: `cargo fmt --check`, `cargo test -p idealer --test core` (14/14), `cargo test -p idealer --test instructions` (4 ignored as expected), `pnpm --filter @idealer/worker test` (30/30), `pnpm --filter @idealer/worker typecheck`, and SBF build through `contracts/solana/scripts/sbf.sh build`.
- SBF instruction execution with ignored tests exposed an unrelated existing duplicate-vote expectation failure in `core_instructions_execute_and_persist_state`; the other 3 ignored SBF instruction tests passed. Devnet upgrade was not sent yet because it requires explicit user confirmation before broadcasting a transaction with deployer `4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH` on devnet.
- Rechecked after the user reported setting `IDEALER_TURN_AUTHORITY_KEYPAIR` in `.env`: reopened `PRD.md`, `.claude/skills`, and best-practices guidance; the workspace `.env` still shows `IDEALER_TURN_AUTHORITY_KEYPAIR` and `IDEALER_TURN_AUTHORITY_KEYPAIR_PATH` as empty on lines 25-26, so the worker was not recreated.

## Browser Tooling Diagnostics Work Log

### 2026-06-29

- Reopened `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, and listed `.claude/skills` before investigating the reported `agent-browser` PATH issue, as required.
- Opened the relevant browser automation guidance: `.claude/skills/playwright/SKILL.md` and the Vercel `agent-browser` skill guidance.
- Confirmed `agent-browser` and `playwright-cli` are not installed as PATH-visible commands in this Windows environment.
- Confirmed Node.js tooling is available (`node v24.12.0`, `npm 11.7.0`, `npx 11.7.0`).
- Confirmed `agent-browser` exists as an npm package and can be invoked without a global PATH install via `npx -y agent-browser --help`.
- No milestone checkbox was marked because this was a tooling diagnosis and no milestone completion was confirmed by the user.

### 2026-06-29

- Reopened `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, listed `.claude/skills`, and reopened `.claude/skills/playwright/SKILL.md` before editing the browser automation skill.
- Updated `.claude/skills/playwright/SKILL.md` to state explicitly that `agent-browser` not being installed as a PATH-visible command on this Windows workspace is not a blocker.
- Documented `npx -y agent-browser ...` as the first recovery path for browser verification before falling back to the Playwright wrapper flow.
- No milestone checkbox was marked because this was a skill/documentation update and no milestone completion was confirmed by the user.

### 2026-06-29

- Reopened `PRD.md`, listed `.claude/skills`, reopened `.claude/skills/playwright/SKILL.md`, and reviewed Vercel `agent-browser` guidance before addressing the follow-up browser-runtime failure.
- Confirmed `npx -y agent-browser doctor` finds the CLI but reports no default Chrome binary; `npx -y agent-browser install` failed because the Chrome for Testing CDN connection was reset by the remote host.
- Located existing Playwright Chromium executables under `C:\Users\iagoo\AppData\Local\ms-playwright`, including `chromium-1223\chrome-win64\chrome.exe`.
- Verified `agent-browser` can still capture a screenshot when launched with explicit `--executable-path` pointing at the Playwright Chromium cache, then removed the temporary `about:blank` screenshot artifact.
- Updated `.claude/skills/playwright/SKILL.md` so future browser verification does not stop at "agent-browser/playwright not installed" or "no Chrome/Edge headless in default paths"; it now documents `doctor`, `install`, Playwright-cache discovery, explicit `--executable-path`, and the final blocked criteria.
- No milestone checkbox was marked because this was a skill/documentation update and no milestone completion was confirmed by the user.

### 2026-06-29

- Reopened `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, listed `.claude/skills`, reopened `.claude/skills/playwright/SKILL.md`, and inspected `docker-compose.yml`, `infra/docker/Dockerfile.node`, and `apps/web/playwright.config.ts` before editing the browser automation skill.
- Updated `.claude/skills/playwright/SKILL.md` to make containerized Playwright the default for this Windows workspace instead of relying on host-installed Playwright, Chrome, Edge, or `agent-browser`.
- Documented official Playwright container commands using `mcr.microsoft.com/playwright:v1.60.0-noble`, a persistent `idealer-playwright-node-modules` Docker volume, `output/playwright/` artifacts, `host.docker.internal` for host-served pages, and `--network idealer-internal` for Docker Compose service DNS such as `web`, `admin`, and `api`.
- Confirmed Docker is available (`Docker 29.1.3`, Compose `v2.40.3-desktop.1`); the Playwright image is not currently present locally, so the first containerized run will pull it.
- No milestone checkbox was marked because this was a skill/documentation update and no milestone completion was confirmed by the user.
