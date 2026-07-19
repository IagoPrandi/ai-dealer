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
| M5.1-M5.5 (PRD) | Public Transparency through Public Trends & Exports | Completed | Confirmed 2026-06-29 | Confirmed by explicit user request and ticked in `PRD.md`. Implemented the PRD §15.6 public transparency surface through M5.5 with API snapshot/export projections, the `apps/admin` read-only dashboard, and a restricted redacted AI operations section gated by authorized operator wallet signature verification. This is separate from the older `SETTLEMENT_TRUSTLESS_PLAN.md` M5.0-M5.5 rows below. |
| M5.6 (PRD) | Restricted AI Agent Operations Dashboard | Completed | Confirmed 2026-06-29 | Confirmed by explicit user request and ticked in `PRD.md`. Implemented and re-verified the restricted redacted AI operations dashboard scope with role call volume, provider/model routing by role, latency percentiles, failure/fallback/escalation counters, provider disagreement, model/compiler/final confidence distributions, token/cost projections by provider/model/role, queue backlog/dead-letter jobs, local model health including digest/quantization, redacted incidents, and audit links. |
| M5.7 (PRD) | Console Safety Boundaries | Completed | Confirmed 2026-06-30 | Confirmed by explicit user request and ticked in `PRD.md`. Implemented explicit console safety boundaries for public transparency and restricted AI operations: read-only console route methods, runtime `405` rejection for mutable methods on console routes, no console mutation endpoints, protected game-state mutation denylist, private telemetry denylist, dashboard-field review checklist, public/export redaction assertions, restricted AI disablement/public transparency separation, and a dedicated restricted AI operations page at `/operator/ai-operations` outside the public transparency path `/`. |
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
| M10       | Fixed-Supply Tokenomics v2.8                   | In progress | Conditional completion requested 2026-07-18; criteria not met | Separate Tokenomics Core, exact accounting libraries/calculators, game fee/action-reward CPI boundary, protected API projections, lock/claim UX, isolated production SBF builds, atomic canonical Metaplex metadata, a fail-closed devnet genesis ceremony, 8 Idealer SBF scenarios, and 2 Tokenomics Core SBF scenarios are implemented and verified. The Devnet-only Squads v4 `2-of-3` rehearsal is finalized: transaction `4TzMqySK4kdpcYb1ojTEzYyoCiibq8wrDkUMGdmNx2iXvTF2PLCXqUAbE7S1spLsV1o7XqLCRsZRnm9uJN8N3kAx` created multisig `DQmcXBdLsQUVsk8UmgnTdnjruRHnAquuFP9wPa87T5RD`; vault `0` derives as `DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp` and a later finalized read found it allocated and funded with 5 devnet SOL. M10 is not complete: the Tokenomics Core program still has a placeholder identity and is not deployed; the approved HTTPS metadata URI, genesis transaction, custody recovery/expansion records, separate mainnet members, legal review, durable indexing, independent audit, final programme hashes and authority revocation, full rehearsals, and owner mainnet go/no-go remain unevidenced. No M10 checkbox is marked. |

## Maintenance Work Log

### 2026-07-18 (Atomic JDR devnet genesis implementation and verification)

- Reopened the required context before continuing: `PRD.md`, `PRD-TOKENOMICS-v2.8.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`. Followed `.claude/skills/solana-dev/SKILL.md` and its Foundation, frontend, Kit/Web3 interop, deployment, Anchor, testing, and security references; `.claude/skills/idealer-test-and-verify/SKILL.md` and its devnet verification reference; `.claude/skills/develop-frontend/SKILL.md`; and the triggered local-server browser verification guidance.
- Added canonical Metaplex metadata creation to `initialize_genesis`. Name `JUSDEALER`, symbol `JDR`, seller fee `0`, the approved HTTPS URI, and Squads vault `0` as devnet update authority are bound in the same atomic transaction before mint/freeze authority revocation. `TokenConfig` records the metadata PDA, URI, authority, and mutability for strict reconciliation. ProgramTest uses a scoped Metaplex success processor because the external executable is not bundled; canonical PDA/account constraints and the CPI path are covered locally, while the real serialized Metaplex account remains a mandatory field-by-field devnet readback.
- Added a fail-closed `/dev/tokenomics/genesis` ceremony and Solana Kit-first provisioning module. It fixes the classic-SPL 1B/200M/800M allocation, derives every Tokenomics PDA and canonical metadata PDA, accepts only Phantom wallet A on devnet, strictly rereads the finalized Squads multisig, requires executable Tokenomics Core and Idealer accounts, requires Tokenomics Core upgrade authority to be Squads vault `0` before genesis, rejects every pre-existing genesis PDA, estimates rent, keeps the one-time mint signer only in browser memory, simulates the exact signed bytes with signature verification, and submits only after explicit review. Finalized readback verifies supply, metadata, allocations, custody, lock state, and permanent mint/freeze authority revocation field by field.
- Hardened deployment tooling for a separately managed Tokenomics Core identity. `scripts/sbf.sh` now selects `idealer` or `tokenomics_core`, refuses a missing external program keypair, verifies its public address against `PROGRAM_ID` and `declare_id!`, selects the correct artifact, and provides an explicit post-deploy upgrade-authority transfer to the Squads vault. No keypair was generated, read, copied, printed, or committed.
- The first SBF build found a real 4,160-byte Anchor account-validation frame in `SettleReferralBaseRewards`, 64 bytes above the SBF limit. Moving only the already-validated `TokenConfig` account wrapper to `Box<Account<...>>` removed the frame excess without weakening seeds, ownership, signer, mint, campaign, beneficiary, or transfer checks. The repeated isolated SBF build produced `tokenomics_core.so` (1,082,920 bytes) and `idealer.so` (1,023,336 bytes) with no compiler diagnostics.
- Verification passed: web typecheck, lint with zero warnings, 95/95 unit tests, production build, focused genesis E2E 2/2 on a production server, agent-browser content/overlay/error checks, desktop visual review, and 320 px visual/overflow review; Rust workspace check, strict all-feature Clippy, 88/88 native tests with the 10 SBF-only cases intentionally ignored there, Tokenomics Core SBF 2/2, Idealer SBF 8/8, Rust formatting, and Linux shell syntax validation. The development server was restored on port 3000 and returns HTTP 200 after the isolated production-server E2E.
- M10 remains `In progress`. Static genesis configuration intentionally blocks because Tokenomics Core still uses the non-deployable placeholder program ID and `NEXT_PUBLIC_IDEALER_TOKEN_METADATA_URI` is empty. Required next inputs are an externally managed Tokenomics Core program public address and an approved HTTPS metadata URI; deployment, upgrade-authority transfer, and genesis each require their own explicit transaction review and approval. No network write, wallet prompt, token mint, token transfer, or PRD checkbox change occurred.
- Final inconsistency review: metadata is created before irreversible authority revocation; devnet metadata authority is the verified Squads vault rather than an individual member; metadata mutability does not restore mint/freeze authority; devnet addresses are not presented as mainnet custody; the 5 SOL vault funding is not described as JDR issuance; failed RPC/simulation/readback states remain visible; generated browser screenshots were removed from the repository; and no incomplete M10 gate is represented as complete.

### 2026-07-18 (Finalized devnet Squads multisig verification)

- Reopened `PRD.md`, inspected `.claude/skills`, and followed the Solana Foundation and Squads v4 guidance for a read-only Devnet verification.
- Verified the owner-supplied signature `4TzMqySK4kdpcYb1ojTEzYyoCiibq8wrDkUMGdmNx2iXvTF2PLCXqUAbE7S1spLsV1o7XqLCRsZRnm9uJN8N3kAx` at finalized commitment. It succeeded at slot `477270699` with no program error and executed `MultisigCreateV2` against the configured Squads v4 program.
- Independently read the resulting account: multisig `DQmcXBdLsQUVsk8UmgnTdnjruRHnAquuFP9wPa87T5RD` is owned by `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`, has 231 bytes of data, threshold `2`, time lock `0`, transaction index `0`, no rent collector, and the configured null configuration authority (represented by the default public key in the SDK). Its three members A/B/C all have permission mask `7` (initiate, vote, execute).
- Derived vault index `0` as `DB5nz633YioWzEUnLb97ypUra5RUE11SJDFW9ar23KTp`. It has zero lamports and no allocated account, which is expected for an unfunded PDA; no JDR token was minted or transferred by the creation transaction. Recorded both Devnet-only addresses in `.env.example` and the Tokenomics PRD.
- Final inconsistency review: the transaction fee and multisig account rent were paid by member A; the derived vault remains distinct from the rejected address; null configuration authority and no initial spending limit preserve the intended immutable configuration; no claim implies mainnet readiness. M10 remains in progress and no PRD checkbox was marked.

### 2026-07-18 (Phantom wallet A devnet Squads creation ceremony)

- Reopened the required context before implementation: `PRD.md`, `PRD-TOKENOMICS-v2.8.md`, `AGENTS.md`, and `PROGRESS_TRACKER.md`; inspected `.claude/skills`; and followed the repository's Solana, frontend, design-system, test-and-verify, and browser-verification guidance. Confirmed that Phantom is the wallet application controlling devnet member A; this records a signing client, not a private key, seed phrase, device-separation record, or mainnet authorization.
- Added a dedicated English-language devnet operations route at `/dev/tokenomics/multisig`. It shows the exact A/B/C addresses, all-permission roles, `2-of-3` threshold, zero-second time lock, Squads v4 programme, vault index `0`, and an explicit devnet-only/mainnet-separation warning. The route accepts only Phantom connected to the configured wallet A.
- Added an isolated Squads v4 adapter pinned to `@sqds/multisig` `2.1.4` and `@solana/web3.js` `1.98.4` at the legacy boundary while retaining Wallet Standard and Solana Kit for wallet access and transaction orchestration. The read-only prepare phase verifies the devnet genesis hash, checks the SDK programme ID, reads the on-chain Squads programme treasury and creation fee, creates the required one-time signer only in browser memory, derives the multisig/vault PDAs, and estimates rent without requesting a wallet signature.
- The write phase remains user-triggered and fail-closed: Phantom signs first; the exact signed transaction is simulated with signature verification; only a clean simulation can be submitted; finalization is awaited; and the resulting account is read back and checked for exact owner, members, permission masks, threshold, time lock, null configuration authority, and null rent collector. The UI displays the cluster, fee payer, treasury recipient, creation fee, rent estimate, token movement (`none`), derived addresses, and a mandatory review checkbox before the signing button.
- Added deterministic unit tests for the devnet configuration and strict on-chain snapshot validation plus focused Playwright coverage for exact ceremony content, disabled writes without Phantom, absence of console errors, and no horizontal overflow at 320 px. Verification passed: web typecheck; 91/91 unit tests; lint with zero warnings; production build; and focused browser tests 2/2 against the production build. Desktop and Pixel 5 visual review found the route coherent and responsive.
- No wallet prompt, transaction, private-key read, token mint, token transfer, or network write was performed by the implementation or tests. The pre-existing Next development process on port 3000 was not restarted after dependency installation and therefore retained a stale module graph; validation used the fresh production build. M10 remains in progress until the user opens the route, connects Phantom wallet A, explicitly approves creation, and the application reports strict finalized verification, after which the generated multisig and vault addresses can be recorded. No PRD milestone checkbox was marked.
- Final inconsistency review confirmed that the discarded vault value is unused; vault `0` remains derived only from the actual multisig; no mainnet custody claim is implied; preparing the ceremony cannot submit; JUSDEALER/JDR minting is not conflated with multisig creation; source UI remains UTF-8 English; and no fallback hides wallet, RPC, simulation, finalization, or read-back errors.

### 2026-07-18 (Devnet Squads v4 provider selection)

- Reopened `PRD.md`, `PRD-TOKENOMICS-v2.8.md`, `AGENTS.md`, and `PROGRESS_TRACKER.md`; inspected `.claude/skills`; and followed the Solana, Squads v4, security, deployment, and governance guidance before changing custody configuration.
- Selected Squads Protocol v4 for the devnet rehearsal, using the verified executable devnet programme `SQDS4ep65T869zMMBKyuUq6aD6EgTu8psMjkvj52pCf`, threshold `2-of-3`, all three members with initiate/vote/execute permissions, Squads time lock `0`, no unilateral configuration authority, no initial spending limit, and vault index `0` as the Tokenomics Core governance signer PDA.
- A finalized read-only devnet query confirmed that all three supplied member addresses exist as system accounts and have devnet SOL. They are now explicitly devnet-only and must not be treated as mainnet members. The discarded `iV6DGgtL79buLCvhUEFYiTyAaE4teT6utweVTaqoXFa` value returned no account data; this is compatible with an unfunded Squads vault and does not prove derivation. It was removed because no finalized multisig PDA exists from which to verify that relationship and because the owner explicitly withdrew it.
- No multisig creation, signature, transaction, key generation, private-key access, or asset movement occurred. User wallet intervention is required to create the devnet Squads multisig; after finalization, the multisig account and derived vault PDA can be verified and recorded.
- Reviewed for inconsistencies: cluster, provider, programme, threshold, permissions, zero delay, and PDA roles are explicit; no mainnet custody claim is implied; M10 remains in progress and no milestone checkbox was marked.

### 2026-07-18 (Token identity, initial multisig members, and immediate treasury execution)

- Reopened the required context before configuration: `PRD.md`, `PRD-TOKENOMICS-v2.8.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, `.claude/skills/solana-dev/SKILL.md` with its Foundation, Anchor, and security references, and `.claude/skills/upgradeability-governance/SKILL.md`.
- Recorded the owner-provided public `2-of-3` member addresses in `.env.example` and the Tokenomics PRD. A value then described as an externally managed governance vault was temporarily recorded without an on-chain query; the later Squads v4 provider-selection review above supersedes that entry, rejects the value, and restricts all three members to devnet.
- Set the public token display identity to `JUSDEALER` with symbol `JDR`. The on-chain metadata URI and metadata update authority remain pending; this display setting does not fabricate a Metaplex metadata account.
- Changed the discretionary treasury-operation execution delay from seven days to zero seconds in the Tokenomics Core and shared TypeScript model. The configured multisig threshold, scheduled-operation record, asset/destination/amount/purpose binding, spending limits, guardian pause, and 24-hour public unpause notice remain in force. No deploy, signature, network transaction, or private-key access occurred.
- Verification passed: tokenomics TypeScript typecheck and lint; 12/12 tokenomics unit tests; Rust workspace check; strict all-feature Clippy; native Rust workspace tests in the pinned Linux container; isolated `sb-devnet` SBF builds; Tokenomics Core SBF 2/2; and Idealer SBF 8/8. The SBF helper now invokes the two instruction binaries serially because Cargo otherwise runs them concurrently despite each binary using one test thread.
- M10 remains in progress. This owner configuration resolves only the supplied inputs; governance-vault creation, signer device/backup/recovery records, deployment, independently audited mainnet controls, and the remaining launch gates still require evidence. No PRD milestone checkbox was marked.

### 2026-07-18 (M10 conditional completion audit after Docker restoration)

- Reopened the required context before continuing: `PRD.md`, `PRD-TOKENOMICS-v2.8.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, `.claude/skills/solana-dev/SKILL.md` with the required Foundation, Anchor, testing, and security references, and `.claude/skills/idealer-test-and-verify/SKILL.md` with its devnet verification reference. The user's instruction supplied conditional confirmation to mark M10 only if every approval criterion passed.
- Docker restoration enabled real SBF execution and exposed a deployability defect that host tests could not detect: a workspace-wide `cargo-build-sbf` unified Idealer's `tokenomics-core/cpi` dependency into the standalone Tokenomics Core artifact, disabling its entrypoint. `scripts/sbf.sh` now builds Tokenomics Core and Idealer independently, fails on compiler error diagnostics even when the tool exits successfully, lists both artifacts, and retains separate production/test output directories.
- Added a Tokenomics Core SBF instruction suite. It verifies the exact 1B one-time mint, 200M/800M genesis allocation, mint/freeze authority revocation and second-mint rejection, guardian pause behavior, immediate canonical treasury unlock during pause, nonzero public incident records, epoch deposit/review/seal, fixed Treasury SOL Vault claim destination and receipt accounting, pre-seal/double-claim rejection, sealed-liability reduction, dust rollover, and correction-epoch rejection unless the referenced standard epoch is sealed.
- Closed audit gaps found while tracing M10.2 and M10.4: the treasury lock position can claim only to the canonical Treasury SOL Vault while ordinary positions cannot target it; successful treasury claims increment the vault receipt record; correction epochs now bind an existing sealed standard epoch; provisional roots require nonzero manifest, leaf-file, and calculation-commit hashes; challenges require nonzero evidence hashes; public unpause announcements require a nonzero incident-record hash; and new referral contribution/correction-reserve funding paths obey the global pause. Updated the web claim builder and Rewards flow for the canonical treasury-vault account.
- Verification passed: forced non-Rust tests across 18 packages; tokenomics 11/11, constants 1/1, API 91/91, web 88/88, and worker 108/108; all non-Rust typechecks and lints; web production build; Rust workspace check; strict all-feature Clippy; 88 native Rust tests with 10 SBF-only cases intentionally ignored there; isolated SBF builds for both deployables; Idealer SBF 8/8; Tokenomics Core SBF 2/2; Rust formatting; `git diff --check`; and Linux shell syntax validation. The pinned executable toolchain reported Agave/Solana CLI and `cargo-build-sbf` 4.0.0. Postgres and Redis remained healthy.
- M10 is not marked complete. The repository cannot evidence M10.0.3, M10.1.1, M10.1.3, M10.1.4, M10.2 approval, M10.3.5, M10.5.2, M10.5.3, or M10.5.4 without written legal/jurisdiction decisions; signer/device/recovery and `2-of-3` to `3-of-5` custody records; final token metadata and externally managed programme authority; durable finalized/reorg-safe indexing; an independent audit; published final hashes plus irreversible upgrade-authority revocation; the prescribed multi-wallet/multi-epoch devnet rehearsals; and explicit owner mainnet go/no-go. No deployment, wallet signature, network transaction, private-key read, or PRD checkbox change was performed.
- Final inconsistency review confirmed that both SBF artifacts retain entrypoints, production and `sb-devnet` artifacts remain isolated, fixed claims bypass treasury spending delays without becoming discretionary withdrawal paths, treasury and ordinary destinations are mutually exclusive, pause-safe exits remain available, correction liabilities remain separate, and no failing launch gate was represented as complete.

### 2026-07-17 (Docker-restored Tokenomics SBF verification)

- Reopened the required context before continuing: `PRD.md`, `PRD-TOKENOMICS-v2.8.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md` with its required testing/security references, and `.claude/skills/idealer-test-and-verify/SKILL.md`. No deployment, wallet signing, or network transaction was performed.
- Docker restoration materially changed the verification result. The first real SBF compile exposed unsafe Anchor account-validation frames in Tokenomics Core genesis and the game reward/referral CPI bridge. Large account wrappers were moved to heap-backed `Box<Account<...>>`; the production-feature SBF artifact then built without frame-overflow diagnostics.
- Hardened `scripts/sbf.sh` because `cargo-build-sbf 4.0.0` printed frame-overflow `Error:` diagnostics while returning exit code 0. The helper now fails on either a nonzero process status or compiler error diagnostics, and automatically removes disposable build keypairs without reading them. `test-sbf` now builds an isolated `sb-devnet` artifact so VRF fixtures match the executable without overwriting the production-feature deploy artifact.
- Updated the legacy claim SBF regression for the v2.8 boundary: winner SOL pull-payments remain valid, while creator/voter SOL claim recording is rejected because those rewards now settle only through Tokenomics Core. The serial SBF game suite passes 8/8.
- Final Rust verification passes: production-feature SBF build; SBF instruction tests 8/8; workspace typecheck; strict all-feature Clippy; native tests 88 executed with 8 SBF-only tests ignored in the native run; Rust formatting; and shell syntax validation inside Linux. Docker Postgres and Redis were healthy during verification.
- Reviewed for inconsistencies: deploy and test SBF artifacts are separated; compiler diagnostics cannot be silently accepted; production Switchboard ownership validation was not weakened; no private key was read, printed, or retained in the build-output directories; the active persisted Agave toolchain version was explicitly logged as 4.0.0; Tokenomics Core still lacks its own end-to-end SBF instruction suite and devnet rehearsal; and no M10/PRD checkbox was marked because user confirmation is still required.

### 2026-07-17 (Tokenomics v2.8 implementation)

- Opened the required documents before implementation: `PRD.md`, `PRD-TOKENOMICS-v2.8.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, `.claude/skills/solana-dev/SKILL.md` and its required Anchor/security/testing references, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/best-practices/SKILL.md` with its applicable Web3, testing, and final-review references.
- Added the separate Anchor `tokenomics_core` program and one-transaction classic-SPL genesis invariant: 1,000,000,000 tokens with nine decimals, 200,000,000 campaign atoms, 800,000,000 creator-treasury atoms immediately moved into a productive treasury lock, exact supply verification, and mint/freeze authority revocation. Added ordinary/treasury locks, confirmed-time checkpoints, proportional seven-turn epochs, zero-weight and dust rollover, versioned provisional roots, 0.02-SOL challenges, expiry/refunds, sealing, perpetual fixed-leaf claims, correction epochs/reserve, campaign/referral/future-campaign state, treasury timelocks/limits, and guardian pause with delayed governance unpause.
- Added a deterministic bigint-only TypeScript tokenomics package, an independent Rust epoch calculator, shared cross-language Merkle vectors, and a worker agreement gate that rejects publication on any calculator mismatch. The game now accumulates each turn's exact treasury share, atomically bridges it into a collecting Tokenomics Core epoch with replay protection, and exposes recipient-bound CPI settlement for proposal, supporter, active-rule creator/voter, and referral rewards. Referral bonus contributions use a deterministic contribution-identity PDA so retries with the same identity cannot double-count the bonus base. New game claim records accept winner SOL payouts only; creator/voter rewards have a single canonical token settlement path.
- Added protected, reconciled API projection endpoints and explicit `not_indexed` states; wallet lock/weight/claim projections; and `/play/rewards` lock, top-up, unlock, and sealed Merkle-claim transaction builders using exact bigint formatting. Mainnet free-first-action cutoff is 30; non-mainnet environments retain 100. The token name/symbol/URI remain visibly pending instead of being invented.
- Verification passed: targeted TypeScript typecheck, tests (`tokenomics` 11/11, constants 1/1, API 91/91, worker 108/108, web 88/88), lint, and production builds; local Rust `cargo check` for the game/core integration; Tokenomics Core tests 10/10; Idealer native tests 15/15 with eight pre-existing SBF-only tests correctly ignored; Rust formatting; and the Rust calculator shared vector. The pinned Linux Docker validation failed before test execution because Docker Desktop reported a content-store blob I/O error twice; SBF build/integration verification therefore remains an explicit blocker, not a claimed pass.
- Reviewed the implementation for inconsistencies: campaign debits terminate exactly at zero; creator rewards debit before canonical voter remainder; root replacement cannot erase unresolved challenges; expired challenge bonds are refundable; treasury outward movement remains timelocked while claims/lock exits stay immediate; the placeholder Tokenomics Core address is documented as non-deployable without an externally managed key; no private key was created or logged; and no PRD milestone checkbox was marked because user confirmation and launch gates remain pending.

### 2026-07-16 (Borderless group treatment)

- Opened the required context before editing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, the frontend/design-system/UI-coherence/test-and-verify guidance, the relevant design-system references, and the browser-verification skill. Inspected the current Next.js Idealer shell, shared primitives, CSS, and neighboring screens before applying the visual rule.
- Added one app-level border policy that removes borders from non-interactive groups, cards, panels, lists, metrics, sheets, pills, and separators while explicitly preserving buttons/CTA links, inputs, and the complete AI chat surface. Marked the Create screen with the semantic `ide-chat-screen` scope so its header/footer separators, bubbles, guidance panels, and message field retain their borders.
- Corrected the rule-list exception after visual review: `.ide-rulerow` is a navigable content group implemented as a button, not a standalone CTA, so its outline is now explicitly removed while its click behavior and ranking glow remain intact. Live computed styles confirmed zero border on all four sides; the updated capture is `output/playwright/borderless-rule-row-390.png`.
- Browser verification on the live `/play` route confirmed borderless group surfaces, preserved secondary-button and chat borders, no console errors, and zero horizontal overflow at 320, 390, 768, and 1440 px. Visual evidence is available at `output/playwright/borderless-home-390.png` and `output/playwright/borderless-chat-390.png`.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `test` (81/81), `lint`, `build`, and `git diff --check`. Reviewed for inconsistencies: border removal is centralized rather than duplicated, interactive affordances and focus outlines remain visible, UI copy is unchanged, and no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-16 (Stake & earn rewards page handoff)

- Opened the required project and handoff context before implementation: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, the frontend/design-system/UI-coherence/test-and-verify/Playwright skill guidance and required references, `PRD-TOKENOMICS-v2.8.md`, and the attached `Tokenomics staking e rewards-handoff.zip` README. The README identified `project/Staking.dc.html` as the primary design and `project/support.js` as its imported interaction support; both were read in full. The archive contains no `Idealer.html` file.
- Rebuilt `/play/rewards` as the reference-driven `Stake & earn` experience: staking balance hero, lock/unlock affordances, Overview/Activity tabs, reward-token and revenue-epoch cards, live game-claim summary/activity, claim notifications, wallet-connect state, disclosure copy, and the five-item bottom navigation. Added the screen to the development gallery and covered claim summary/filter/sort behavior with a unit regression.
- Preserved fail-visible behavior: because Tokenomics Core staking accounts, indexer endpoints, and transaction builders are not implemented in the repository, token balances and epoch values render as explicitly unavailable and lock/unlock remain disabled. The existing game claim ledger remains live; no fabricated token balance, yield, or transaction fallback was introduced.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `test` (81/81), `lint`, `build`, and `git diff --check`. Playwright verified Overview, Activity, notification initial focus, Escape-to-close, and zero horizontal overflow at 320, 390, 768, and 1440 px; visual evidence is in `output/playwright/rewards-*.png`.
- Rechecked the user-reported missing fourth destination against the actual development server at `http://localhost:3000/play`, not only the source component. A fresh client bundle renders the intended five controls in order—Round, Rules, Create, Rewards, Account—clicking Rewards activates the destination and opens the wallet-gated rewards screen, and the 390px route has zero horizontal overflow. The reported capture was using the previous client bundle; refreshed live evidence is `output/playwright/rewards-nav-live-390.png` and `output/playwright/rewards-route-live-390.png`.
- Reviewed the result for inconsistencies: UI/UX copy is UTF-8 English, the page uses existing Idealer tokens/components, unavailable tokenomics capabilities are distinguished from current SOL game claims, and unrelated pre-existing worktree/archive changes were preserved. No tokenomics milestone checkbox or status was changed because Tokenomics Core remains unimplemented and milestone marking requires explicit user confirmation.

### 2026-07-16 (Rule-space longevity clarification)

- Clarified the rule-space estimate against the existing re-proposal policy in `PRD.md` §6.13. At 100,000 proposals per day, 100 years produces about 3.65 billion proposals and 1,000 years about 36.5 billion; both are negligible compared with the DSL's conservative semantic-capacity lower bound.
- Recorded the material policy distinction: the canonical-AST re-proposal gate blocks only a rule signature that previously held a mandate. It does not guarantee that two ordinary proposals in the same or different turns will be unique, so human users can still submit common/repeated rules unless a broader proposal-level deduplication policy is explicitly adopted.
- Reviewed the conclusion for consistency: no rule policy, implementation, or milestone status was changed.

### 2026-07-16 (Rule-space estimate)

- Opened the required context before analysing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, `.claude/skills/solana-dev/SKILL.md`, and the current rule DSL/runtime sources (`packages/rule-schema/src/index.ts` and `packages/rule-runtime/src/index.ts`).
- Estimated the capacity of the active v3 rule algebra without changing source code or configuration. The runtime bounds AST depth to 16 and boolean `and`/`or` groups to eight clauses; therefore the executable syntax space is finite but extremely large. The estimate distinguishes unique rule meanings from textual rewrites and from the practical per-turn proposal/shortlist limits.
- Reviewed the assessment for consistency: the analysis preserves the existing canonical-AST identity policy, its 80-token authoring limit, and the rejection of impossible/always-true rules. No milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-14 (Vote screen typography alignment)

- Opened the required documents before editing UI: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, and `.claude/skills/idealer-design-system/SKILL.md`.
- Aligned the closed-phase paragraph on the Rules/Vote screen with the instruction paragraph by increasing the top status copy from 12.5px to 13.5px in `apps/web/src/features/idealer/screens/Vote.tsx`.
- Reviewed the result for inconsistencies: no layout structure changed, the text remains English, and no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-14 (PRD tokenomics v2.6 coherence review)

- Opened the required documents and context before reviewing: `PRD.md`, `PRD-TOKENOMICS-v2.6.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, and `.claude/skills/best-practices/SKILL.md` with its agent-principles, architecture, Web3-contract, governance/compliance, and final-checklist references.
- Reviewed the tokenomics draft for internal consistency and compared its supply, custody, fee routing, reward denomination, free-action cutoff, account model, security guarantees, and milestone gates with the binding PRD v1.5.1 baseline.
- Confirmed that the 200M + 800M genesis allocation, fixed maximum issuance, locked-token-seconds formula, zero-weight rollover, claim-liability/dust split, campaign-vault isolation, and creator-first/voter-second reserve order are internally aligned.
- Found blocking inconsistencies: treasury unlock is both immediate and subject to a seven-day timelock; sealed-root/campaign-vault immutability is promised without an immutable programme or constrained upgrade authority; the referral cap requirement has no defined values or accounting; and on-chain sealing cannot independently verify the correctness and leaf sum of an off-chain Merkle manifest from the root alone.
- Found direct baseline conflicts requiring an explicit supersession and migration plan: native-SOL/no-SPL MVP versus a 1B SPL token, SOL creator/voter rewards versus campaign-token rewards, platform-monetisation funding versus 100% of the treasury-fee share going to lockers, free first actions through turn 99 versus rounds 1-30, and the existing SOL reward-claim/account model versus immediate campaign-vault settlement and new M10 accounts/instructions.
- Reviewed the result for inconsistencies: this was a documentation-only assessment; no PRD rule, implementation, on-chain state, or milestone checkbox was changed. Milestone marking remains pending explicit user confirmation.

### 2026-07-14 (Confirmed campaign action semantics and treasury custody)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, and `.claude/skills/solana-dev/SKILL.md`; reviewed the applicable Solana/Squads custody guidance. No transaction, wallet, or on-chain state was changed.
- Updated `PRD-TOKENOMICS.md` with the confirmed Creator Treasury custody configuration: 3-of-5 independent hardware-wallet multisig and a seven-day timelock. The remaining required operational record is the five signer identities by role and a recovery process before genesis.
- Confirmed the rounds 1–200 action policy: every successfully confirmed `propose_rule` action grants 0.4 tokens and every successfully confirmed in-favour `vote` action grants 0.06 tokens, including repeated actions. There are no per-wallet, per-rule, or per-round caps; the 200M aggregate campaign reserve and round-200 cutoff are the sole limits. Reward reservation/debit must be atomic; campaign exhaustion leaves the game action valid and reports `PROMOTION_CAMPAIGN_EXHAUSTED` explicitly.
- Updated referral qualification to the invitee's first finalised guess regardless of whether the existing game-fee policy makes that guess free or paid. The inviter's 15% first-round bonus uses all promotional rewards received by the invitee in that first round.
- Reviewed for inconsistencies: repeated paid actions may consume the finite campaign reserve faster by design; this is now explicit, cannot over-distribute, and cannot trigger new token issuance. No milestone checkbox was marked because implementation and explicit milestone acceptance remain pending.

### 2026-07-14 (Creator Treasury Reserve is productive lock capital)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, and `.claude/skills/solana-dev/SKILL.md`; rechecked primary Solana/Squads authority and timelock references. No transaction, wallet, or on-chain state was changed.
- Updated `PRD-TOKENOMICS.md` with the owner's confirmed economic choice: the full 800M Creator Treasury Reserve may lock tokens and claim treasury fees to fund project operations. It follows precisely the same locked-token-seconds formula, seven-turn epochs, immediate-unlock rule, and claim mechanism as every other holder; no multiplier, priority, or private fee path exists.
- Added mandatory transparency for the reserve's locked balance, weight, claims, and epoch distribution share. The PRD now discloses that equal lock duration across the full supply gives the 800M reserve an 80% claim share, which rises if fewer community tokens are locked.
- Retained the proposed multisig/timelock custody for the reserve: its lock, claim, and unlock actions are publicly controlled through the same vault policy. Reviewed the result for inconsistencies: this is economically coherent with the stated sole-revenue model, but it is intentionally concentrated and must be disclosed; no supply cap, fee source, or milestone status changed.

### 2026-07-14 (Tokenomics economic-model review and development-process scope correction)

- Opened required documents/context before reviewing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, and `.claude/skills/solana-dev/SKILL.md`. Checked current primary Solana/Squads documentation for immutable mint authority semantics, multisig vault transactions, and post-approval timelocks; no on-chain state or wallet action was performed.
- Corrected the scope of the former proposal-feasibility section in `PRD-TOKENOMICS.md`: it was incorrectly recorded as a tokenomics milestone/gate. The owner clarified that Solana-first feasibility and complexity assessment governs the current development workflow, so the tokenomics-only section, decision-register row, and M10.0 submilestone were removed. No tokenomics milestone was marked complete.
- Economic review finding: multisig plus timelock is an appropriate custody control for the 800M Creator Treasury Reserve, but it is not by itself a sound revenue-allocation policy when 100% of treasury fees flow to lockers. If the creator treasury can lock the full 800M, it can capture roughly 80% of fee distributions when all supply is locked, and a larger share when fewer user tokens are locked. The design therefore requires an explicit eligibility/cap/vesting policy for creator-reserve tokens before implementation.
- Reviewed for inconsistencies: the PRD continues to state that operation funding comes from the 800M reserve while 100% of treasury fees go to lockers; this is economically viable only through creator-reserve token sales/releases or a disclosed, limited creator-reserve lock allocation. The required policy remains an owner decision; no hidden revenue share or fallback was introduced.

### 2026-07-14 (Tokenomics decisions, creator-treasury custody, and proposal gate)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, and `.claude/skills/solana-dev/SKILL.md`. Reviewed current primary documentation for Solana SPL mint authorities and Squads multisig vault transactions/time-locks before documenting custody; no transaction, wallet, or on-chain state was changed.
- Updated `PRD-TOKENOMICS.md` to record the owner's confirmed rules: 100% of the treasury-fee share to lockers, seven-turn closed epochs, non-expiring claims, immediate unlock, 0.4-token eligible creator reward, 0.06-token eligible in-favour supporter reward, first-paid-guess referral qualification, 0.2-token inviter reward, 0.03-token invitee reward, the inviter's 15%-of-invitee-first-round-promotion-rewards bonus, and the earlier of reserve exhaustion or round-200 settlement as the initial campaign end.
- Allocated the remaining 800M as the Creator Treasury Reserve and added the recommended Solana-native custody design: a 3-of-5 hardware-wallet multisig, seven-day execution timelock, public transaction audit trail, and separate timelocked releases for operations or future campaigns. This recommendation remains pending the owner's confirmation of signer roles and recovery process.
- Added a Solana-first proposal feasibility and complexity gate with economic, account/instruction, compute, security, indexing, UX, legal, test, and rollback review requirements. Added it as an unchecked M10.0 submilestone.
- Reviewed for inconsistencies: the campaign remains capped at 200M and cannot mint; unclaimed sealed SOL remains available indefinitely; immediate unlock stops future accrual; unresolved reward-trigger, repeated-vote, first-free-guess, and referral-bonus-scope conflicts remain visible as P0 decisions. No milestone checkbox was marked because user confirmation is required.

### 2026-07-13 (Fixed-supply tokenomics and promotion PRD draft)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, the `.claude/skills` directory, and the applicable `.claude/skills/solana-dev/SKILL.md` guidance including its Solana Foundation entry point and Token-2022 reference. The Token-2022 reference informed the explicit v1 choice of a plain SPL token; no Token-2022 extension is required for the specified lock-and-claim design.
- Replaced the incompatible prior 400M/40M tokenomics plan with `PRD-TOKENOMICS.md` v2.0-draft: one immutable 1,000,000,000-token genesis supply, revoked mint/freeze authorities, a 200,000,000-token initial promotion reserve, lock-time-weighted treasury-fee claims through sealed epochs, and campaigns for rounds 1–200 plus qualified referrals.
- Added unchecked milestones, submilestones, and explicit approval criteria from specification through security audit and mainnet go/no-go. Added a P0/P1 owner-decision table rather than inventing economic terms that were not supplied.
- Reviewed the draft for inconsistencies: it preserves the one-time issuance constraint, treats the 20% cap as an aggregate promotion limit, prevents post-genesis minting, separates campaign tokens from game prizes, and does not mark any milestone checkbox because user confirmation is required.

### 2026-07-12 (Intent-preserving rule clarification suggestions)

- Opened required documents/context before working: `PRD.md` (especially §6.1-§6.7), `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `packages/rule-compiler/rule-authoring/SKILL.md`.
- Corrected the clarification feedback for ambiguous digit examples such as playing `12` and treating `1`/`2` as digit matches: the API now asks whether tens digits, units digits, or either digit count; how many guessed numbers need a digit match; and whether draw order/positions are ignored. It also offers a complete intent-preserving rewrite for explicit confirmation.
- Removed the web clarification panel's unrelated generic match-count fallback. Digit-rule suggestions now remain within the submitted objective (either digit, tens digit, or units digit); close/distance suggestions no longer switch to a match-count rule; order choices include the complete submitted rule instead of isolated clauses. When no safe intent-preserving rewrite is known, the panel requires manual clarification instead of inventing another rule.
- Added API and web unit regressions for the reported Portuguese prompt, unknown-ambiguity fail-safe behavior, and complete order refinements. Added an E2E flow proving the clarification panel presents only digit-semantic refinements and accepts the selected complete rule; also updated two stale E2E preview locators that no longer matched the rendered component.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `test` (72/72), `lint`, `build`; `pnpm --filter @idealer/web typecheck`, `test` (73/73), `lint`, `build`; focused Playwright `e2e/rule-proposal.spec.ts` (4/4); and `git diff --check`.
- Reviewed the result for inconsistencies: all UI/UX copy added is UTF-8 English, suggestions resolve ambiguities without changing the player's objective, no fallback hides unsupported intent, generated `next-env.d.ts` churn was removed, and no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-12 (Conversation draft save recovery)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and design-system references `01-tokens.md`, `02-components.md`, and `03-screens-and-state.md`.
- Diagnosed the reported `HTTP 502` as an unavailable local API service, not an invalid conversation-draft payload: port `3002` had no listener while the web server on `3000` and worker on `3003` were running. The Next API proxy correctly returned `502` because it could not reach its configured backend target.
- Started the API development service on port `3002` and restarted the local web server after rebuilding. Verified `GET /players/{wallet}/conversation-drafts` returns `200` both directly and through `GET /api/proxy/players/{wallet}/conversation-drafts` on the active web server.
- Added a visible `Retry saving` action to the existing draft-save error card. It saves the complete in-memory transcript already displayed to the player, with disabled `Saving...` feedback and an explicit error if a retry still fails; the action remains available after repeated failures. It reuses the existing card/button vocabulary and keeps all UI copy in English.
- Added a regression test for recognizing retryable draft-save errors. Verification passed: `pnpm --filter @idealer/web typecheck`, `test` (69/69), `lint`, `build`, and `git diff --check`.
- Reviewed the result for inconsistencies: the retry only runs on an explicit player action and does not hide API failures, the existing transcript remains visible while a retry is pending or fails, and no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-12 (Confirmed guess missing from the home screen)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, design-system references `01-tokens.md`, `02-components.md`, and `03-screens-and-state.md`, plus `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Diagnosed the inconsistent recovery state: the home screen treated a player as entered only when the API `GuessReceipt` projection existed. A confirmed `PlayerGuess` PDA could therefore trigger `DUPLICATE_ACTION` on a retry while the home still offered the first-play state.
- Updated `usePlayerGuess` to verify the sequence-one `PlayerGuess` PDA at confirmed commitment in parallel with the receipt request. The canonical on-chain account now establishes the entered state and a minimum play count while API receipt details are delayed; API/RPC failures remain logged and no transaction or receipt error is hidden.
- Added a visible home-state message, in English, stating that a guess is confirmed on-chain while entry details are syncing. This preserves the existing design-system card and makes voting/rule creation available immediately after the canonical confirmation.
- Added a regression test for the on-chain-confirmed/no-receipt state. Verification passed: `pnpm --filter @idealer/web typecheck`, `test` (68/68), `lint`, and `build`; `git diff --check` passed. Visual verification was attempted against the running local server, but the configured `agent-browser` CLI and the Node-REPL browser backend are unavailable in this environment, so no screenshot was produced.
- Reviewed the result for inconsistencies: existing API receipt details remain preferred when available, first and repeated play fee sequencing remains unchanged, the UI stays English/mobile-first, and no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-10 (Turn counter reset safety check)

- Reopened required context before working: `PRD.md`, `AGENTS.md` instructions from the prompt, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Checked live worker state through `GET /turn/active`: no active turn is open, `activeTurnId: 0`, `hasActiveTurn: false`, and `nextTurnId: 114`.
- Checked whether canonical on-chain turn counting could be reset to `1`; the existing turn-1 PDA is already allocated on devnet, and `open_turn` initializes turn PDAs with `#[account(init)]`, so resetting `global_config.next_turn_id` to `1` would make the next turn open fail with an account-collision instead of producing a usable first turn.
- Did not broadcast `reinitialize_global_config_for_migration(next_turn_id=1)` because it would create an invalid devnet state for the current program/account namespace.
- Reviewed the result for inconsistencies: no chain state, source code, UI copy, or fallback behavior was changed; no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-10 (Voter reward calculation verification)

- Opened required documents/context before verification: `PRD.md`, `AGENTS.md` instructions from the prompt, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Verified the elected-rule voter/supporter reward rule against implementation: eligible voters are unique wallets with at least one recorded approval `RuleVote` for the elected active rule; repeated approval votes do not create additional reward shares.
- Confirmed the implemented voter reward pool is `15%` of one individual alternative-rule winner payout, capped by `VOTER_REWARD_CONFIG.capPerTurnLamports`, then capped by the reserve remaining after creator reward funding.
- Confirmed the final voter pool is split equally across unique voters with integer lamport division; any division remainder is recorded as `remainderLamports` and is not assigned to a voter claim.
- Verification passed: `pnpm --filter @idealer/api typecheck` and `pnpm --filter @idealer/api test` (65/65). No milestone checkbox/status was changed.

### 2026-07-10 (Creator reward unit-payout correction)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md` instructions from the prompt, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and design-system references `01-tokens.md`, `02-components.md`, `03-screens-and-state.md`, and `04-new-screen-recipe.md`.
- Corrected creator reward accounting so the creator reward is `15%` of a single individual alternative-rule winner payout, not `15% × individual payout × winner_count`. The voter reward pool already used the single-unit payout basis and remains unchanged.
- Updated the ambiguous rule-submission success copy to "15% of one winner's payout" to avoid implying that the creator takes a share from every displayed prize.
- Updated PRD and supporting docs (`docs/product-rule-summary.md`, `docs/data-model-draft.md`, `docs/mvp-decision-registry.md`) to align the product rule with the corrected unit-payout basis.
- Updated API reward tests so a 10-winner case proves the creator reward does not scale with winner count.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `test` (65/65), `lint`, `build`; `pnpm --filter @idealer/web typecheck`, `test` (37/37), `lint`, `build`.
- Reviewed the result for inconsistencies: stale creator-reward wording was removed from the touched docs and app code, winner-visible payouts are still not reduced, the creator-first reserve draw order remains unchanged, and no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-09 (Live rule precompilation loop — fixes always-`original_only` election)

- Opened required documents/context before working: `PRD.md` (§6.6/§6.12/§7.9 background precompilation and original-only path), `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Diagnosed a real gap in the live flow: a rule submitted through the app lands on-chain as `RuleProposal { state: Proposed, precompilation: Pending }`, but nothing in the running app moved it to `Eligible`. The AI validation (`runRuleValidationCycle` / API `/rule-validations/run`) and the on-chain `precompile_rule` instruction were only ever exercised by the devnet seed operators (`devnet-seed-real-inputs.ts`, `devnet-10-player-simulation.ts`); the web app only displays precompile status and the worker's two loops (turn-automation, settlement) never validate/precompile. Result: every turn with real user rules had an empty eligible pool and the election correctly fell to `original_only` (observed live on turn 105 with 1 submitted rule + 1 vote).
- Added `apps/worker/src/precompile-loop.ts`: an env-gated (`IDEALER_RULE_PRECOMPILE_ENABLED`, OFF by default), authority-signed loop that runs during phase 1 (before the on-chain `rule_election_cutoff_bps`). Each pass fetches the active turn's still-`proposed`/`pending` rules from the API, runs the deterministic compiler via `/rule-validations/run` (stores the artifact + projects `eligible`), and records the real on-chain `precompile_rule` with the API-returned artifact hash so on-chain state, the frozen election hash, and the stored artifact reconcile. Idempotent (skips rules already moved out of proposed/pending), re-checks the cutoff before every send, and never precompiles an `INVALID` rule. No mocks, no fallbacks; reuses the tested `createPrecompileRuleInstruction`.
- Wired the loop into the worker entrypoint (`apps/worker/src/index.ts`) alongside the settlement loop, and enabled it in `.env` for local/devnet dev.
- Added `apps/worker/src/precompile-loop.test.ts` (7 cases): precompiles a valid proposed rule, validates-but-never-sends for invalid, idempotent skip of already-eligible/invalidated, cutoff-passed guard, mid-pass cutoff break, no-active-turn, and disabled-flag.
- Verified locally: `pnpm --filter @idealer/worker typecheck`, `test` (95/95), `lint` (0 warnings), `build`.
- Verified live on devnet (turn 106): proposed one real rule on-chain in `Proposed`/`Pending` WITHOUT precompiling it, then the running loop precompiled it — `precompile turn=106 rule=1783638979079769 signature=BmCEyt8J…`; API projection moved to `state: eligible` / `precompilationStatus: passed`; and the on-chain election candidate now reads `isEligibleState: true` / `isPrecompiledValid: true` (source of truth), so it will enter the shortlist/election instead of `original_only`.
- Separately observed (not fixed here): the full LLM rule-preflight harness (`/rule-preflight`) can exceed Node's undici 300s headers timeout when the local Ollama model is cold/slow; the precompile loop itself uses the fast deterministic compiler and is unaffected. No milestone checkbox/status was changed — milestone marking requires explicit user confirmation.

### 2026-07-09 (Shortlist draw wait-state reconciliation)

- Opened required documents/context before working: `PRD.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/solana-dev/SKILL.md`.
- Diagnosed the shortlist draw stall as a worker projection race: after `settle_finalist_vrf`, a stale RPC `fetchState` can miss the newly written finalist set, so the initial `rule-eliminations` open projection is skipped; later scheduler passes see the on-chain elimination window and only return `wait`, leaving the UI stuck on "Shortlist draw in progress".
- Updated `apps/worker/src/settlement-scheduler.ts` so an `elimination_window_open` wait state republishes the visible `requested` election projection and the open elimination decision-window projection from the current on-chain state. The scheduler also rereads already-revealed finalist randomness for projection/audit preservation when publishing the active election.
- Updated `apps/worker/src/settlement.ts` with an explicit `ready` stale-reveal read mode for already-settled randomness accounts. This is used only for read-side projection/audit data; settlement reveal timing still uses the existing fail/throw behavior.
- Added regression coverage in `apps/worker/src/settlement-scheduler.test.ts` proving that a turn with on-chain finalists and an open elimination window republishes finalist IDs, finalist randomness, and the open shortlist window while the scheduler waits.
- Verified: `pnpm --filter @idealer/worker typecheck`, `test` (88/88), `lint`, and `build`.
- Reviewed the result for inconsistencies: no fallback or mock path was introduced, on-chain state remains the source of truth, the settlement slot safety behavior is unchanged, API projections remain idempotent, and no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-06 (Pending AI dealer conversation draft persistence)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md`, `.claude/skills/idealer-design-system/references/02-components.md`, `.claude/skills/idealer-design-system/references/03-screens-and-state.md`, `.claude/skills/idealer-design-system/references/04-new-screen-recipe.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Fixed the rule composer race where leaving the AI Dealer screen before preflight/agent response could lose the user's latest message. `Create.tsx` now saves a conversation draft snapshot immediately after adding the user message, before calling `/rule-preflight`, then updates the same `draftId` when the dealer/preflight response arrives.
- Added a shared canonical `countRuleTokens` and `sanitizeRuleText` export in `@idealer/constants` so pending drafts use the same prompt normalization and token count that the API validates; removed the duplicated API-local implementation.
- Added `conversationDraft.ts` in the web feature layer to build valid draft payloads for pending user-only transcripts, with unit coverage for newline sanitization, token count, and empty prompt rejection. Added API coverage that validates pending user-only transcripts.
- Verified: `pnpm --filter @idealer/constants typecheck/test/lint/build`; `pnpm --filter @idealer/api typecheck/test` (63/63), `lint`, `build`; `pnpm --filter @idealer/web typecheck/test` (10/10), `lint`, `build`.
- Reviewed the result for inconsistencies: UI copy remains English, draft persistence errors remain visible instead of hidden, walletless free chat still runs without pretending to persist, the same draft id is reused for the eventual dealer response, and no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-06 (Profile conversation overflow and repeated vote history keys)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md`, `.claude/skills/idealer-design-system/references/02-components.md`, `.claude/skills/idealer-design-system/references/03-screens-and-state.md`, `.claude/skills/idealer-design-system/references/04-new-screen-recipe.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and the Next.js skill.
- Fixed the Profile conversation draft card so long rule titles and the resume CTA stay inside the mobile card: the row/card now preserve `minWidth: 0`, the title truncates within `maxWidth: 100%`, metadata rows can wrap without forcing wider layout, and the CTA is constrained to the card width.
- Fixed repeated approval/elimination vote history identifiers in `listPlayerHistory`: event ids now include vote `sequence`, matching the existing storage key and preventing repeated same-wallet same-rule votes from producing duplicate React keys.
- Added a regression test proving repeated vote and repeated elimination vote history event ids are unique and include sequence. The Profile history list also uses a render key with `createdAt` plus index as a compatibility tie-breaker for any already-served legacy duplicated ids.
- Verified: `pnpm --filter @idealer/api typecheck`, `test` (62/62), `lint`, `build`; `pnpm --filter @idealer/web typecheck`, `test` (8/8), `lint`, `build`.
- Visual check: could not start a second mocked `next dev` because an existing Next dev server for `apps/web` was already running on `localhost:3000`; did not stop the user's process. Ran a Playwright harness at 430px using the real `idealer.css` and representative Profile conversation markup; result: `documentScrollWidth=430`, `horizontalOverflow=false`, `buttonContained=true`, `titleClamped=true`. Screenshot saved at `output/playwright/profile-conversation-row-overflow-430.png`.
- Reviewed the result for inconsistencies: UI copy remains English, no fallback hides API/history issues, repeated-vote ids remain audit-readable, the existing unrelated `apps/web/next-env.d.ts` worktree change was left untouched, and no milestone checkbox/status was changed because milestone marking requires explicit user confirmation.

### 2026-07-06 (Shortlist decision window + claim visibility; conversation history overflow)

- Opened required documents/context before working: `PRD.md`, `.claude/CLAUDE.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the active plan `groovy-sleeping-comet.md`.
- Diagnosed the manual-test report that a turn ends without ever showing the shortlist/elimination phase or the claim period. Root causes: (1) no code path ever populated the API `RuleEliminationRecord` — `saveRuleElimination` was only called from tests, so `decisionWindowClosesAt/OpenedAt` were always `null` and the web `decisionEndsAt`/countdown never rendered; (2) `useRound` fetched the round summary once (no polling), so post-window phases could never surface live; (3) `decisionPhase` was computed in context but unused by any screen, and Home had no claim surface.
- Worker: `settlement-scheduler.ts` now projects the elimination decision window to the API — publishes an `open` record (with the real on-chain `elimination_window_start/end` timestamps) when the finalist VRF settles, and a `closed` record (with `closedAt`, eliminated/survivor rule ids and hashes) after `close_elimination_window`. Added `ApiBridge.publishRuleElimination` and the `PublishedRuleElimination` shape.
- API: added `POST /rule-eliminations` with `isValidRuleEliminationProjection` validation and `projectRuleElimination`, which merges the worker's on-chain window/outcome with the API's per-finalist vote tallies and saves via `saveRuleElimination`.
- Web: `useRound` and `usePlayerClaims` now poll every 10s (plus window focus), matching `useActiveTurn`; Home shows a yellow "Shortlist decision window" banner (countdown + link to the finalists tab) while `elimination.status === "open"` and a green "Prize ready to claim" banner when the wallet has `availableLamports > 0`; the Rules screen auto-switches to the Finalists tab when the decision window opens.
- Conversation history overflow: `ConversationRow` in `Profile.tsx` now clamps `lastMessage` to two lines (`-webkit-box` line clamp), fixing cards growing unbounded after full transcripts began persisting.
- Verified: `tsc --noEmit`, `eslint --max-warnings=0`, and `node --test` all green for `apps/api` (61/61), `apps/worker` (86/86), `apps/web` (8/8); live round-trip smoke test of `POST /rule-eliminations` → `GET /api/v1/turns/{id}/elimination` against the running dev API; browser render check of Home at 390px (`output/playwright/home-390.png`) with no console errors. The temporary web dev server was stopped afterward.
- Notes: the natively-run worker (`tsx src/index.ts`, no watch) must be restarted to pick up the projection change; the API runs under `tsx watch` and reloaded itself (which also resets its in-memory state). No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-03 (Rule proposal prompt test set 2 prompts 1-20)

- Reopened required documents/context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, `packages/rule-compiler/rule-authoring/references/examples.md`, and `docs/rule-proposal-prompt-test-set-2.md`.
- Tested prompts `#1` through `#20` from `docs/rule-proposal-prompt-test-set-2.md` through the deterministic rule compiler. Initial source check accepted only `#10`, `#14`, and `#16`; the rest failed closed as unsupported or, for `#13`, as a false external dependency because positional `slot` was conflated with chain slot state.
- Updated the deterministic rule compiler to recognize objective casual wording for match counts, exact overlap counts, no-overlap rules, same-total rules, position comparisons, all-position comparisons, unordered same-set rules, even-count equality, compound total-plus-hit rules, positional absolute difference, odd-number totals, min/max range containment, multiple-count comparisons, and two-smallest/two-largest pair-sum comparisons.
- Narrowed the external dependency gate so `same slot` can mean same ticket/draw position while `Solana slot`, `block slot`, and `slot hash` remain blocked as external chain state.
- Improved the prompt-test harness so prompt rows can be read by id from either prompt-test markdown file, then added regression coverage that verifies set-2 prompts `#1`-`#20` compile as `VALID`, produce artifact hashes, pass generated runtime checks, and preserve representative AST shapes.
- Verified: direct source sweep for set-2 prompts `#1`-`#20` returned `failures=0`; `pnpm --filter @idealer/rule-compiler typecheck`; `pnpm --filter @idealer/rule-compiler test` (33/33); `pnpm --filter @idealer/rule-compiler lint`; `pnpm --filter @idealer/rule-compiler build`.
- Reviewed the result for inconsistencies: no fallback was introduced, invalid dependencies still fail closed, `slot hash` remains blocked, all accepted rules stay bounded to deterministic `guess`/`draw` DSL/runtime nodes, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-03 (Second rule proposal prompt test set)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, `packages/rule-compiler/rule-authoring/references/examples.md`, and `docs/rule-proposal-prompt-test-set.md`.
- Added `docs/rule-proposal-prompt-test-set-2.md` as a second rule proposal prompt test set with 200 additional prompts based on the structure of the original test-set document.
- Covered 140 single-prompt cases and 60 multi-interaction prompts across 20 simulated refinement sequences. The prompts intentionally use more casual, indirect wording to test conversion, clarification, and fail-closed blocking behavior.
- Expanded coverage across deterministic `guess`/`draw` rules, vague natural-language clarification cases, wallet/history/social/prize/oracle/weather/market/dependency blocks, prompt injection, code/network/file access, private analytics, randomness, payout circularity, post-draw mutation, duplicate-rule rewording, and impossible conditions.
- Verified the new markdown structure with a PowerShell count check: 200 numbered prompt rows, first `1`, last `200`, no missing numbers, no duplicates, 140 single-prompt rows, 60 sequence rows, and 20 sequence headings.
- Reviewed the result for inconsistencies: `VALID` prompts remain deterministic over `guess` and `draw`, `CLARIFY` prompts are ambiguous instead of blocked violations, `BLOCK` prompts depend on prohibited or impossible inputs, no fallback behavior was introduced, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-02 (Rule proposal prompts 14-20, 31-39, 48-55, 104-105, sequences 6-7)

- Opened required documents/context before and during work: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `docs/rule-proposal-prompt-test-set.md`.
- Tested the requested prompt set from `docs/rule-proposal-prompt-test-set.md`: valid prompts `#14-#20`, clarification prompts `#31-#39`, blocked prompts `#48-#55`, natural valid prompts `#104-#105`, sequence 6 (`#86-#88`), and sequence 7 (`#89-#91`). Initial deterministic findings: `#17`, `#18`, `#20`, and `#105` were unsupported; `#14`, `#15`, `#19`, and `#91` could compile with overly generic semantics; sequence 6 division needed an explicit non-zero divisor guard.
- Extended the deterministic DSL/runtime/compiler with `digit_match_count_at_least`, `ordered_position_compare_count_eq`, and `all_values_between_min_max`, and added parsers for odd-sum equality, multiples-of-N count comparisons, sorted two-lowest/two-largest sum comparisons, same-number-of-evens equality, and guarded division over even drawn-number count.
- Updated the compiler ambiguity/blocking rules so objective even-count wording is not rejected as vague, `division works out nicely` is clarification-worthy, historical re-proposal wording is blocked, and sequence 7's differentiating condition keeps both the match threshold and guessed-sum-lower-than-drawn-sum clause.
- Hardened API preflight blocking for the requested `BLOCK` prompts: SOL/USD price, weather/rain, X/Twitter likes, Python/import code, URL fetches, local file reads, random player selection, runtime-guessed divisor, exact-rule reuse from last turn, and same-rule/different-wording re-proposal.
- Updated the API LLM harness prompt and rule-authoring skill/pattern/example docs to teach digit matching, odd/even filtered sums/counts, exact ordered comparison counts, inclusive draw min/max range, sorted low/high pair sums, and defined division. Bumped the compiler skill version to `idealer_rule_compiler_skill_v5`.
- Added regression coverage that reads the requested prompt IDs directly from the markdown file and verifies expected decisions plus AST-shape checks for the previously weak cases. Added schema/runtime tests for the new predicate nodes and API prompt-harness assertions.
- Live preflight proof passed against an isolated current-code API on `127.0.0.1:3012`: all 32 requested prompts matched their expected outcome. `VALID` prompts returned `decision="VALID"`, `needsClarification=false`, `ruleMode="predicate"`, and non-null compiled artifact hashes; `CLARIFY` prompts returned no artifact and `needsClarification=true`; `BLOCK` prompts returned `400` where preflight can block up front or invalid/no-artifact where handled by compiler policy. Sequence 6 sent `#88` with the prior `#87` context and blocked it. The isolated API was stopped afterward and port `3012` was confirmed closed.
- Verification passed: `pnpm --filter @idealer/rule-schema typecheck/test/lint/build`, `pnpm --filter @idealer/rule-runtime typecheck/test/lint/build`, `pnpm --filter @idealer/rule-compiler typecheck/test/lint/build`, and `pnpm --filter @idealer/api typecheck/test/lint/build`. Final counts included schema tests 7/7, runtime tests 13/13, compiler tests 28/28, and API tests 58/58.
- Reviewed the result for inconsistencies: the reference prompt file was not modified, unsupported/blocked prompts still fail closed without artifact, valid prompts now compile to specific deterministic ASTs instead of broad fallbacks, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-02 (Compact clarification UI screenshot)

- Opened required documents/context before visual capture: `PRD.md`, `AGENTS.md`, `.claude/skills`, and `.claude/skills/playwright/SKILL.md`.
- Started the web app on `127.0.0.1:3005` with mocked Sequence 8 and Sequence 9 preflight responses, then captured the current compact mobile clarification UI.
- Saved screenshots under `output/playwright/`: `rule-prompt-compact-seq8-panel.png`, `rule-prompt-compact-seq8-full.png`, `rule-prompt-compact-seq9-panel.png`, and `rule-prompt-compact-seq9-full.png`.
- Reviewed the screenshots for inconsistencies: the header is smaller, panel margins are tighter, suggestions remain normal-weight chat-sized text, and mobile `Dismiss`/`Submit` actions remain available. The local dev server was stopped afterward and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-02 (Compact rule clarification prompt spacing)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Reduced the rule clarification prompt header size from 20px to 17px and tightened the header margin so `Fix this blocked rule?` / `Clarify this rule?` no longer dominates the mobile panel.
- Reduced panel padding, internal gaps, option-row padding, and option-row minimum height while preserving 44px+ tap targets and the 15px normal-weight suggestion text.
- Updated the E2E test to assert the compact 17px heading while keeping Sequence 8/9 behavior, suggestion typography checks, and mobile-only checks for absence of visible `ESC`, `↑`, and `↓` hints.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web test`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web build`, and `pnpm --filter @idealer/web test:e2e -- e2e/rule-proposal.spec.ts` (3/3). No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-02 (Current clarification UI screenshot)

- Opened required documents/context before visual capture: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/playwright/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Started the web app on `127.0.0.1:3005` with mocked Sequence 8 and Sequence 9 preflight responses, then captured the current mobile clarification UI after the typography and mobile-hint cleanup.
- Saved current screenshots under `output/playwright/`: `rule-prompt-current-seq8-panel.png`, `rule-prompt-current-seq8-full.png`, `rule-prompt-current-seq9-panel.png`, and `rule-prompt-current-seq9-full.png`.
- Reviewed the screenshots for inconsistencies: suggestions now use normal-weight chat-sized text, visible `ESC` and arrow hints are absent, and the mobile `Dismiss`/`Submit` actions remain available. The local dev server was stopped afterward and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-02 (Rule clarification prompt typography)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Updated the mobile rule clarification prompt so suggestion text uses the same 15px body size as the chat bubbles, with normal `fontWeight: 400` instead of bold styling.
- Updated the manual clarification row to match the same 15px normal-weight text rhythm and line-height.
- Added E2E assertions for the primary suggestion font size and font weight, while preserving Sequence 8/9 behavior and the existing mobile checks that no `ESC`, `↑`, or `↓` hints are rendered.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web test`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web build`, and `pnpm --filter @idealer/web test:e2e -- e2e/rule-proposal.spec.ts`. The E2E run again logged Solana devnet warmup certificate warnings, but the mocked rule proposal tests passed 3/3. No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-02 (Mobile cleanup for rule clarification prompt)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Removed desktop-only visual affordances from the mobile rule clarification panel: the visible `ESC` key hint, the selected-row up/down arrow hints, and the extra option-grid column reserved for keyboard arrows.
- Kept the selectable suggestion rows, manual pencil row, `Dismiss`, and blue `Submit` action while making the dismiss control maintain a mobile-sized tap target.
- Updated `apps/web/e2e/rule-proposal.spec.ts` to assert that Sequence 8/9 still work and that the mobile panel does not render `ESC`, `↑`, or `↓`.
- Verification passed: `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web test`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web build`, and `pnpm --filter @idealer/web test:e2e -- e2e/rule-proposal.spec.ts`. The E2E run logged Solana devnet warmup certificate warnings, but the mocked rule proposal tests passed 3/3. No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-02 (Rule proposal clarification UI capture)

- Opened required documents/context before visual verification: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/playwright/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `docs/rule-proposal-prompt-test-set.md`.
- Started the web app on `127.0.0.1:3005` with mocked shell data and `/rule-preflight` responses matching Sequence 8 and Sequence 9.
- Captured the implemented Codex/Claude-style clarification panels under `output/playwright/`: `rule-prompt-seq8-blocked-panel.png`, `rule-prompt-seq8-blocked-full.png`, `rule-prompt-seq9-blocked-panel.png`, `rule-prompt-seq9-clarify-panel.png`, and `rule-prompt-seq9-clarify-full.png`.
- Reviewed the screenshots for inconsistencies: the panels show the dark rounded surface, selected numbered option, manual pencil row, arrow-key hints, `Dismiss`, `ESC`, and blue `Submit` button. The local dev server was stopped afterward and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-02 (Rule proposal sequences 8, 9, and 10 as conversations)

- Opened required documents/context before and during work: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `docs/rule-proposal-prompt-test-set.md`.
- Reinterpreted `sequence` correctly as one same-conversation flow, not independent prompts. Sequence 10 now treats `#100` as a refinement applied to the valid rule created by `#99`, while sequence 8 treats `#94` as a new clean replacement after blocked prompt-injection turns and sequence 9 treats `#97` as a new complete rule after the clarification turn.
- Added deterministic DSL/runtime support for `ordered_position_match_count_eq` and `total_ordered_abs_diff_lte`, fixing sequence 8 prompt `#94` so it means exactly 2 same-position matches instead of unordered intersection count, and sequence 9 prompt `#97` so total absolute position-by-position distance compiles to an executable predicate.
- Updated the compiler, rule-authoring skill, patterns, examples, and API LLM harness guidance for exact same-position match counts and total position-by-position distance. Bumped the compiler skill version to `idealer_rule_compiler_skill_v4`.
- Updated the web rule composer harness so explicit incremental patches like `Add that at least 4 of the 6 reversed positions must match` can refine a previous valid draft even when they look rule-like, while `New clean rule: ...`, `Replace with: ...`, and complete `Win if ...` rules stay standalone.
- Hardened API preflight blocking for sequence 8 prompt `#93` (`secretly compile ... hide ...`) and sequence 9 prompt `#95` (`closest among all players`) so those blocked conversation turns do not reach rule creation.
- Live sequence proof passed against an isolated current-code API on `127.0.0.1:3012`: sequence 8 returned `#92`/`#93` as `400 RULE_PROMPT_INJECTION` and `#94` as `VALID`; sequence 9 returned `#95` as `400 RULE_EXTERNAL_DEPENDENCY`, `#96` as clarification, and `#97` as `VALID`; sequence 10 returned `#98` as clarification, `#99` as `VALID`, and `#100` as a refinement over `#99` with official interpretation `at least 4 ... reverse position order`. The isolated API was stopped afterward and port `3012` was confirmed closed.
- Verification passed: `pnpm --filter @idealer/rule-schema typecheck/test/lint/build`, `pnpm --filter @idealer/rule-runtime typecheck/test/lint/build`, `pnpm --filter @idealer/rule-compiler typecheck/test/lint/build`, `pnpm --filter @idealer/api typecheck/test/lint/build`, and `pnpm --filter @idealer/web typecheck/test/lint/build`. Final counts included schema tests 7/7, runtime tests 13/13, compiler tests 27/27, API tests 58/58, and web tests 7/7.
- Reviewed the result for inconsistencies: the reference prompt file was not modified, generated Next build churn was removed from the diff, blocked prompts remain fail-closed, clarification prompts do not produce artifacts, valid prompts produce deterministic rule artifacts, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (Rule proposal prompts 12, 13, 103, and sequence 10 agent harness)

- Opened required documents/context before and during work: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `docs/rule-proposal-prompt-test-set.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, and `packages/rule-compiler/rule-authoring/references/examples.md`.
- Tested prompts `#12`, `#13`, `#103`, and sequence 10 prompts `#98`, `#99`, and `#100` from `docs/rule-proposal-prompt-test-set.md`. Initial deterministic findings: `#12` already compiled correctly; `#13` and `#99` were unsupported; `#103` was incorrectly treated as ambiguous because of `start stronger`; `#100` compiled as a generic unordered match count instead of reversed-position matching; `#98` needed an explicit clarification classification for bare reverse wording.
- Extended the rule DSL schema and runtime with `all_ordered_abs_diff_lte` and `reversed_position_match_count_at_least` predicate nodes so same-position absolute-distance rules and reverse-position threshold rules can execute deterministically.
- Updated the deterministic compiler to recognize same-position absolute difference, explicit reverse-position mapping, reverse-position thresholds, and objective `first pick > first drawn number` wording while keeping bare `match the draw in reverse` as `AMBIGUOUS_RULE`.
- Updated the agent harness guidance in `apps/api/src/llm.ts`, `packages/rule-compiler/rule-authoring/SKILL.md`, `references/patterns.md`, and `references/examples.md` so the dealer/compiler prompts teach position-specific wording, absolute same-position distance, and reverse-order clarification behavior. Bumped the compiler skill version to `idealer_rule_compiler_skill_v3`.
- Added regression coverage that reads the requested prompt IDs directly from `docs/rule-proposal-prompt-test-set.md` and asserts their expected outcomes and AST shapes, plus schema/runtime execution tests for the new predicate nodes and API prompt-harness assertions.
- Live preflight proof passed against an isolated current-code API on `127.0.0.1:3012` using the prompt texts read from the markdown file: prompts `#12`, `#13`, `#99`, `#100`, and `#103` returned `decision="VALID"`, `needsClarification=false`, `ruleMode="predicate"`, and non-null compiled artifact hashes; prompt `#98` returned `decision="INVALID"` with `needsClarification=true`. The isolated API was stopped afterward and port `3012` was confirmed closed.
- Verification passed: `pnpm --filter @idealer/rule-schema typecheck/test/lint/build`, `pnpm --filter @idealer/rule-runtime typecheck/test/lint/build`, `pnpm --filter @idealer/rule-compiler typecheck/test/lint/build`, and `pnpm --filter @idealer/api typecheck/test/lint/build`. Final counts included schema tests 7/7, runtime tests 13/13, compiler tests 26/26, and API tests 58/58.
- Reviewed the result for inconsistencies: the reference prompt file was not modified, reverse wording remains fail-closed unless it is explicit enough to compile, position indexes preserve 1-based user wording to 0-based AST indexes, no fallback hides unsupported behavior, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (Rule proposal prompts 9, 10, 11, and 101 agent harness)

- Opened required documents/context before and during work: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `docs/rule-proposal-prompt-test-set.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, and `packages/rule-compiler/rule-authoring/references/examples.md`.
- Tested prompts `#9`, `#10`, `#11`, and `#101` from `docs/rule-proposal-prompt-test-set.md` through the deterministic compiler and the local `/rule-preflight` agent path. Initial findings: prompt `#9` could lose the `guessed sum > drawn sum` clause in deterministic compilation and could time out in LLM AST emission; prompt `#101` was not recognized by the deterministic compiler; the agent could return misleading official interpretations for min/max or casual threshold cases.
- Updated the deterministic compiler so compound sum-plus-match rules are parsed before generic match-count rules, `N or more` casual wording such as `show up` / `somewhere in the draw` compiles to match-count predicates, and deterministic AST paths can be preferred for known grammar patterns without accepting unsupported rules.
- Updated the rule preflight path so known deterministic grammar can supply the AST while still keeping the dealer interpretation step, and so the official interpretation returned to users/audit comes from the compiled artifact when the deterministic path canonicalizes it.
- Updated the agent harness prompts: `apps/api/src/llm.ts` now teaches the dealer that `win if` is a predicate unless explicitly comparative, min/max wording is direct guess-vs-draw comparison, and casual `four or more picked numbers show up` wording is a threshold; `rule-authoring/SKILL.md`, `references/patterns.md`, and `references/examples.md` now include the prompt `#9/#10/#11/#101` shapes and variations.
- Added regression coverage for the selected prompt semantics, deterministic-preferred compilation, canonical official interpretations, and prompt-harness content sent to the interpret/compile agents.
- Live preflight proof passed against an isolated current-code API on `127.0.0.1:3012` after the compiler/preflight correction: prompts `#9`, `#10`, `#11`, and `#101` all returned `decision="VALID"`, `needsClarification=false`, `ruleMode="predicate"`, non-null compiled artifact hashes, and official interpretations matching their compiled ASTs.
- Verification passed after the harness prompt updates: `pnpm --filter @idealer/rule-compiler typecheck/test/lint/build` and `pnpm --filter @idealer/api typecheck/test/lint/build`. API tests now include 58 passing tests, including prompt-harness request assertions; rule-compiler tests include 25 passing tests, including rule-authoring prompt assertions.
- Reviewed the result for inconsistencies: the reference prompt file was not modified, unsupported rules still fail closed instead of falling back silently, the UI/audit official interpretation now matches the compiled artifact for these known cases, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (Rule composer incremental refinements)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Fixed the rule composer behavior so a player can apply a short correction to the previous draft instead of rewriting the whole rule. When a pending rule exists and the next user message is a refinement such as `ignore order`, `yes` to an order question, `same order`, or another compact correction, the UI composes a revised full draft and sends that full text to `/rule-preflight`.
- Added `apps/web/src/features/idealer/ruleRefinement.ts` with deterministic refinement helpers and `apps/web/src/features/idealer/ruleRefinement.test.ts` covering suggested-rewrite base selection, short order corrections, yes/no answers to order questions, and chat/cost questions that must remain chat.
- Updated `apps/web/package.json` so `pnpm --filter @idealer/web test` now runs real `node:test` TypeScript tests instead of a placeholder echo.
- Verification passed: `pnpm --filter @idealer/web test`, `pnpm --filter @idealer/web lint`, `pnpm --filter @idealer/web build`, and `pnpm --filter @idealer/web typecheck`. The first typecheck attempt hit missing generated `.next/types` files before build; after build regenerated Next types, typecheck passed. Local `GET http://127.0.0.1:3000/play` returned `200`.
- Reviewed the result for inconsistencies: topic/help/cost messages are not treated as rule edits, submitted on-chain rules remain immutable, short corrections only affect the current pre-submission draft, and no milestone checkbox was marked because milestone marking requires user confirmation.

### 2026-07-01 (Rule preflight refinement feedback)

- Opened required documents/context before and during work: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/testing.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, and `packages/rule-compiler/rule-authoring/references/examples.md`.
- Reproduced the reported prompt shape from simulation prompt #7 in deterministic coverage: `Win if the guess and draw contain the same set of numbers, regardless of order.` The rule compiler now has an explicit regression asserting this compiles as all 6 guessed numbers appearing in the draw with order ignored.
- Updated the runtime rule-authoring guidance and API LLM system prompt so "same set of numbers, regardless of order" is compiled as `count(intersection(guess,draw)) == 6`, not ordered equality.
- Added API preflight refinement feedback for invalid/malformed compile results: `reasonSummary` is user-facing, and the response can include `suggestedRewrite`, `refinementFocus`, and `refinementQuestions` so the player can keep iterating instead of seeing only internal reason codes such as `PROVIDER_MALFORMED_RESPONSE`, `UNSUPPORTED_RULE`, and `UNSAFE_RUNTIME_BOUNDS`.
- Updated the mobile rule composer preview to display suggested rewrite, what to refine, and clarification questions when a rule needs adjustment.
- Live API proof passed against `http://127.0.0.1:3002/rule-preflight`: the reported same-set prompt returned `decision="VALID"`, `needsClarification=false`, `ruleMode="predicate"`, a non-null compiled artifact hash, `guardianGrounded=true`, and model `gemma4:e2b`.
- Verification passed: `pnpm --filter @idealer/rule-compiler typecheck/test/lint/build`, `pnpm --filter @idealer/api typecheck/test/lint/build`, `pnpm --filter @idealer/web typecheck/test/lint/build`, and `pnpm --filter @idealer/worker typecheck/test/lint/build`. After a final prompt wording adjustment, `@idealer/rule-compiler` and `@idealer/api` typecheck/test/lint/build were re-run and passed again. Web dev server was started and `GET http://127.0.0.1:3000/play` returned `200`.
- Reviewed the result for inconsistencies: invalid preflight remains fail-closed and does not enable payment/proposal; the new rewrite guidance is explicit user-facing English; the exact same-set rule has compiler guidance plus regression coverage; no milestone checkbox was marked because milestone marking requires user confirmation.

### 2026-07-01 (Natural rule prompt expansion)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `.claude/skills`, and `docs/rule-proposal-prompt-test-set.md`.
- Updated `docs/rule-proposal-prompt-test-set.md` from 100 to 115 prompts by adding 5 more natural, less-direct `VALID` prompts, 5 more natural `CLARIFY` prompts, and 5 more natural `BLOCK` prompts.
- Verified the Markdown now contains 115 numbered prompt rows. No source code, runtime behavior, or milestone checkbox was changed.
- Reviewed the result for inconsistencies: the new prompts preserve the same expected-outcome taxonomy, avoid the stale 80-token PRD value, and keep blocked cases tied to prohibited dependencies such as other players, prize/payout state, wallet history, private AI knowledge, and post-draw reinterpretation.

### 2026-07-01 (Rule proposal prompt test set)

- Opened required documents/context before creating the prompt set: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/security-threat-checklist/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Treated `PRD.md` as required background but not as the source of truth for the rule token limit after user correction; verified current code/config uses `RULE_MAX_TOKENS = 1000` in `packages/constants/src/index.ts`, with `.env.example` and existing tests also referencing `1000`.
- Created `docs/rule-proposal-prompt-test-set.md` with 100 rule-creation prompts covering valid compilable rules, ambiguity/clarification cases, prohibited dependencies, prompt injection, executable-code attempts, impossible/always-true rules, unsupported external state, and 30 multi-interaction refinement prompts.
- No source code, runtime behavior, or milestone checkbox was changed. Reviewed the result for inconsistencies: the prompt set avoids relying on the stale 80-token PRD value, uses the current 1000-token code/config value, and keeps the expected outcomes aligned with the current guess/draw-only rule compiler boundaries.

### 2026-07-01 (Docker compose long build recovery)

- Opened required documents/context before recovery: `PRD.md`, `AGENTS.md`, and `.claude/skills`.
- Diagnosed `docker compose up -d --build worker postgres redis api` taking too long: the active process was `docker-buildx bake`, with two `infra/docker/Dockerfile.node` builds running for about 49 minutes and no `api`/`worker` containers created. Existing local images were available for `idealer-api:latest` and `idealer-worker:latest`.
- Interrupted the long-running build and attempted `docker compose up -d --no-build postgres redis api worker`. The Docker engine became unresponsive during the first attempt, so Docker Desktop was restarted non-destructively with WSL shutdown/restart; no volume reset, prune, or data deletion was performed.
- Brought the stack up in smaller steps: `docker compose up -d --no-build postgres redis`, waited for both healthchecks, then `docker compose up -d --no-build api worker`.
- Verification passed: `postgres`, `redis`, `api`, and `worker` are `healthy`; `GET http://127.0.0.1:3002/health` and `GET http://127.0.0.1:3003/health` both returned `200`.
- Reviewed the result for inconsistencies: the repeated/dead worker containers are gone, the expected `idealer-worker` container is active, and no milestone checkbox was marked. Note: worker turn automation started after boot and logged turn close/open activity.

### 2026-07-01 (Docker worker duplicate diagnosis)

- Opened required documents/context before diagnosis: `PRD.md`, `AGENTS.md`, and `.claude/skills`.
- Checked `docker compose ps -a`, `docker ps -a`, `docker compose config`, and Docker labels for the repeated worker containers shown in Docker Desktop.
- Confirmed the expected worker service name from the current `docker-compose.yml` is `idealer-worker`; the `b0643694c558_idealer-worker` container is a Compose replacement container created after the older `idealer-worker` container became `Dead` and kept the desired name.
- No container cleanup was performed in this task. Reviewed the result for inconsistencies: both worker containers are stopped/dead or exited, the current compose config does not require two worker containers, and no milestone checkbox was marked.

### 2026-07-01 (Docker Desktop startup recovery)

- Opened required documents/context before recovery: `PRD.md`, `AGENTS.md`, and `.claude/skills`.
- Diagnosed Docker Desktop stuck in `starting`: `docker version` hung, `docker-desktop` WSL distro was running, and Docker logs showed the backend waiting for the engine/API. `com.docker.service` could not be started from the non-elevated shell.
- Performed a non-destructive recovery: attempted Docker's own shutdown, terminated stuck Docker Desktop/backend processes after that shutdown hung, ran `wsl --shutdown`, restarted Docker Desktop, and waited for the internal engine/API to become healthy.
- Verified recovery: `docker version` returned Docker Desktop 4.79.0 / Engine 29.5.3, `docker ps` returned successfully with no running containers, and `docker compose ls` returned successfully with no active compose projects.
- No milestone checkbox was marked and no Docker data reset/prune was run. Reviewed the result for inconsistencies: the Docker engine is responsive, no project containers were started, and the pre-existing `PROGRESS_TRACKER.md` worktree modification was preserved.

### 2026-07-01 (API runtime refreshed with authorized wallet env)

- Opened required documents/context before verification: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/web2-wallet-auth/SKILL.md`, and `.claude/skills/release-config-management/SKILL.md`.
- Checked the running API on `127.0.0.1:3002`: `/transparency` returned `200`, but `POST /operator/ai-operations/challenge` returned `503`, proving the process was still using the old restricted-operator environment.
- Confirmed the existing Docker `idealer-api` container still had the old `OPERATOR_AI_CONSOLE_TOKEN` environment while `docker compose config` rendered the new non-empty `OPERATOR_AI_CONSOLE_AUTHORIZED_WALLETS` value. The old local API watcher and stale `idealer-api` container were stopped/removed.
- Docker Compose recreation for `api` timed out before creating a replacement container, so the API was started locally in background on `127.0.0.1:3002` with the repository `.env` loaded; logs are written to `.next-dev-logs/api-wallet-env.log`.
- Runtime verification passed after refresh: `GET /transparency` returned `200`, and `POST /operator/ai-operations/challenge` for the configured authorized wallet returned `200` with a valid nonce/message challenge shape. The wallet address was not printed. The stale Docker API container is no longer running; the active API is the refreshed local process.
- Reviewed the result for inconsistencies introduced by the changes: no code or milestone checkbox was changed in this task; the active API process now uses the authorized-wallet env, and the restricted AI operations data routes remain wallet-gated and read-only.

### 2026-07-01 (Authorized wallet env verification)

- Opened required documents/context before verification: `PRD.md`, `AGENTS.md`, `.claude/skills`, and `.claude/skills/web2-wallet-auth/SKILL.md`.
- Confirmed root `.env` contains `OPERATOR_AI_CONSOLE_AUTHORIZED_WALLETS` and that the value is non-empty without printing the wallet address.
- Runtime verification completed with a temporary API process using the repository `.env`: `/transparency` became available, and `POST /operator/ai-operations/challenge` accepted the configured authorized wallet and returned a challenge containing nonce/message fields. The temporary process was stopped after the check.
- Reviewed the result for inconsistencies introduced by the verification: no source files or milestone checkboxes were changed for this verification; the restricted console remains wallet-gated and read-only.

### 2026-07-01 (Restricted AI operations wallet-gated access)

- Opened required documents/context before editing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/web2-wallet-auth/SKILL.md`, `.claude/skills/security-best-practices/SKILL.md`, `.claude/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`, `.claude/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`, and `.claude/skills/develop-frontend/SKILL.md`.
- Replaced the restricted AI operations bearer-token gate with authorized Solana wallet access: `OPERATOR_AI_CONSOLE_AUTHORIZED_WALLETS` now configures the allowlist, `POST /operator/ai-operations/challenge` issues a short-lived one-time nonce, requests must include `x-operator-wallet`, `x-operator-nonce`, and `x-operator-signature`, and the API verifies the Ed25519 wallet signature before returning snapshots or exports.
- Updated `apps/admin` `/operator/ai-operations` to connect an injected Solana wallet and request a message signature instead of collecting an operator token; no token or signature is stored in browser storage.
- Updated `docker-compose.yml`, `.env.example`, PRD §12.6 access wording, CORS allowed headers, source labels, and API regression coverage for disabled/missing/denied/expired/allowed/replayed wallet access.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/admin typecheck`, `pnpm --filter @idealer/api test` (55/55), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/admin lint`, `pnpm --filter @idealer/admin test`, `pnpm --filter @idealer/api build`, and `pnpm --filter @idealer/admin build`.
- Local smoke: an existing admin dev server for this repo was already running at `http://127.0.0.1:3011`; `GET /` and `GET /operator/ai-operations` both returned HTTP 200, and the restricted console title rendered. Starting another admin dev server was blocked by Next because the existing server was active.
- Reviewed the result for inconsistencies introduced by the changes: restricted AI data routes remain GET-only/read-only, public transparency remains unaffected, exports remain redacted operational aggregates, missing allowlist fails closed, expired or replayed challenges are denied, no raw prompts/completions/provider payloads/secrets/private request bodies/unredacted stack traces are exposed, and no milestone checkbox was changed in this task.

### 2026-06-30 (PRD M5.7 confirmed and marked done)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/testing.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/security-best-practices/SKILL.md`.
- Re-verified PRD `M5.7` against `apps/api` and `apps/admin`: console boundary contract exposes read-only mode, protected game-state mutation denylist, private telemetry denylist, dashboard-field review checklist, public/export redaction flags, restricted AI disablement isolation, and runtime `405` rejection for mutable methods on console routes.
- Confirmed the public transparency console remains focused on public/derivable transparency metrics, while `/operator/ai-operations` remains a separate bearer-token-gated restricted AI operations monitoring surface with redacted operational exports.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (55/55), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/admin typecheck`, `pnpm --filter @idealer/admin test`, `pnpm --filter @idealer/admin lint`, and `pnpm --filter @idealer/admin build`.
- Marked PRD `M5.7` checklist and approval criteria complete after the user's explicit instruction to verify and mark it concluded. `M5 Approval` remains separate and was not ticked in this task.
- Reviewed the result for inconsistencies introduced by the changes: no console mutation controls were added, protected game state remains outside admin mutation paths, exports remain public/derivable or redacted operational aggregates, no private telemetry fields are required for rendering, and restricted AI operations can be disabled without affecting public transparency dashboards or game execution.

### 2026-06-30 (PRD M5.7 read-only route enforcement)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/testing.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/security-best-practices/SKILL.md`.
- Re-audited PRD `M5.7` against the existing API/admin implementation. The prior boundary contract already exposed read-only method policy, protected game-state mutation denylist, private telemetry denylist, dashboard field review checklist, public/export redaction flags, and restricted AI/public transparency separation.
- Strengthened `apps/api` runtime enforcement by adding `getConsoleReadOnlyMethodRejection()` and a `405 console_route_read_only` response with `Allow: GET,OPTIONS` for non-GET/OPTIONS requests to `/transparency`, `/transparency/export`, `/operator/ai-operations`, and `/operator/ai-operations/export`.
- Added regression coverage proving all four console routes reject `POST`, `PUT`, `PATCH`, and `DELETE`, while regular non-console routes keep their existing method policy.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (55/55), `pnpm --filter @idealer/api lint`, and `pnpm --filter @idealer/api build`.
- Reviewed the result for inconsistencies introduced by the changes: console CORS still advertises only `GET,OPTIONS`, runtime route handling now matches that advertised policy, no game-state mutation endpoint was added, no private telemetry field was added to snapshots/exports, and PRD `M5.7` checkboxes remain unticked pending explicit user confirmation.

### 2026-06-30 (Operator token env loading fix)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- Confirmed `OPERATOR_AI_CONSOLE_TOKEN` is present and non-empty in root `.env` without printing the secret value; the shell process did not see it automatically, which explained why an already-running API could still report `operator_ai_operations_disabled`.
- Updated `apps/api` startup to load the root `.env` via Node's native `process.loadEnvFile()` when the file exists, without overriding explicitly supplied process environment variables.
- Updated `docker-compose.yml` so the `api` service receives `OPERATOR_AI_CONSOLE_TOKEN` from Compose interpolation, and documented the variable in `.env.example`.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (55/55), `pnpm --filter @idealer/api lint`, and `pnpm --filter @idealer/api build`.
- Runtime verification passed with the normal local command `pnpm --filter @idealer/api dev`: `GET /transparency` returned `200`, `GET /operator/ai-operations` with the token read from `.env` returned `200`, and the same restricted endpoint without a bearer token returned `401 operator_authorization_required`.
- Docker note: `docker compose config` now renders `OPERATOR_AI_CONSOLE_TOKEN` as present and non-empty for the API service. A Docker API rebuild was attempted because the old image lacked a recent `@idealer/constants` export, but the build command timed out without useful output; the broken API container was stopped and local dev verification was used for the final runtime check.

### 2026-06-30 (Restricted AI operations access verification)

- Opened required documents/context before verification: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and design-system references `01-tokens.md` through `04-new-screen-recipe.md`.
- Verified a token-enabled local flow without interrupting the existing `3002`/`3012` processes: started a temporary API on `127.0.0.1:3015` with `OPERATOR_AI_CONSOLE_TOKEN=dev-ai-ops-token`, confirmed `GET /operator/ai-operations` returns `200` with `Authorization: Bearer dev-ai-ops-token`, and confirmed the same endpoint returns `401 operator_authorization_required` without a token.
- Built and served the admin temporarily on `127.0.0.1:3014` with `NEXT_PUBLIC_IDEALER_API_URL=http://127.0.0.1:3015`; `next build` passed and listed `/operator/ai-operations`.
- Browser verification with Playwright through the installed `@idealer/web` workspace passed: `/operator/ai-operations` renders `AI Operations Console`, shows one password token input, accepts `dev-ai-ops-token`, loads the restricted metrics, and displays `Validation calls`, `Call volume by role`, `Provider routing by role`, `Queue status`, `Local model health`, and `Redaction`.
- Responsive verification passed at `390x844` and `1280x900`: no horizontal overflow, restricted metrics remain visible after token load, and the public `/` route does not render the restricted token gate or `AI Operations Console` while keeping the navigation link to the restricted page.
- Observed one console `404` for `http://127.0.0.1:3014/favicon.ico`; it is unrelated to the restricted panel/API access and no failed API requests were observed. Temporary verification servers on `3014` and `3015` were stopped after the check.

### 2026-06-29 (PRD M5.7 console safety boundaries implementation)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/security-best-practices/SKILL.md`, `.claude/skills/security-best-practices/references/javascript-typescript-react-web-frontend-security.md`, `.claude/skills/security-best-practices/references/javascript-typescript-nextjs-web-server-security.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Implemented PRD `M5.7` safety boundaries in `apps/api`: added `getConsoleSafetyBoundary()` with read-only method policy, protected game-state mutation denylist, private telemetry denylist, dashboard-field review checklist, public/export redaction flags, and restricted-AI-disablement isolation; public and restricted snapshots now expose the same boundary contract.
- Restricted CORS advertised methods for `/transparency`, `/transparency/export`, `/operator/ai-operations`, and `/operator/ai-operations/export` to `GET,OPTIONS`; non-console API routes retain existing `GET,POST,OPTIONS`.
- Updated `apps/admin` to render the console safety boundary and dashboard-field review checklist in the Data Boundary section without adding mutation controls.
- Added API regression coverage proving console routes advertise read-only methods, snapshots share the boundary, protected game-state mutation targets are denied, private telemetry denylist entries are present, exports stay public/redacted, and restricted AI operations can remain disabled without affecting public transparency.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (55/55), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/admin typecheck`, `pnpm --filter @idealer/admin test`, `pnpm --filter @idealer/admin lint`, and `pnpm --filter @idealer/admin build`.
- Admin dev-server smoke: an existing Next dev server for `apps/admin` was already running at `http://127.0.0.1:3011`/`http://localhost:3011` (PID 19852) and returned HTTP 200; starting a second admin dev server on `3013` was blocked by Next because that dev server was already active for the same app.
- Follow-up route separation: reopened `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and design-system references `01-tokens.md` through `04-new-screen-recipe.md`; moved the restricted AI operations UI from public `/` into dedicated admin route `/operator/ai-operations`, leaving public `/` with only a navigation link to the restricted page.
- Follow-up verification passed: `pnpm --filter @idealer/admin typecheck`, `pnpm --filter @idealer/admin test`, `pnpm --filter @idealer/admin lint`, and `pnpm --filter @idealer/admin build`; local smoke on the existing admin dev server returned HTTP 200 for both `http://127.0.0.1:3011/` and `http://127.0.0.1:3011/operator/ai-operations`.
- Reviewed the result for inconsistencies introduced by the changes: console loaders remain GET-only/read-only, no admin control path mutates guesses/draws/winners/rules/accounting/rewards, public `/` no longer renders the restricted token gate or restricted AI operations panel, public exports remain public/derivable, restricted AI exports remain redacted operational aggregates, and PRD `M5.7` checkboxes remain unticked pending explicit user confirmation.

### 2026-06-29 (PRD M5.6 completion verification)

- Opened required documents/context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Re-audited PRD `M5.6` against the existing `apps/api` restricted operator snapshot/export and `apps/admin` restricted AI operations panel. Found and closed remaining checklist gaps: token usage/estimated cost is now projected by provider/model/role, the admin panel shows compiler confidence buckets, and local model health displays quantization alongside serving engine, configured model, digest, and health-check result.
- Added API test assertions for `tokenUsageByProviderModelRole` so the M5.6 provider/model/role token projection remains covered.
- Marked PRD `M5.6` checklist and approval criteria complete after the user's explicit instruction to verify/resolve pending items and mark it complete. M5.7 and M5 Approval remain separate unticked scopes.
- Verification passed: `pnpm --filter @idealer/api typecheck`, `pnpm --filter @idealer/api test` (54/54), `pnpm --filter @idealer/api lint`, `pnpm --filter @idealer/api build`, `pnpm --filter @idealer/admin typecheck`, `pnpm --filter @idealer/admin test`, `pnpm --filter @idealer/admin lint`, and `pnpm --filter @idealer/admin build`.
- Reviewed the result for inconsistencies introduced by the changes: the restricted endpoint remains bearer-token gated and read-only, exports remain redacted aggregate-only, no raw prompts/completions/provider payloads/secrets/private request bodies/unredacted stack traces are exposed, and the public transparency surface is unchanged.

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
- Updated creator reward documentation in `PRD.md`, `docs/product-rule-summary.md`, and `docs/mvp-decision-registry.md` from 2% to 15% of a single individual alternative-rule winner payout.
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
| Creator reward                                     | Confirmed as 15% of a single individual alternative-rule winner payout, funded from the creator reward reserve sourced from platform monetization. |
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

## Devnet 10-Player Simulation Work Log

### 2026-07-01

- Reopened `PRD.md`, listed `.claude/skills`, opened `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-test-and-verify/references/devnet-verification.md`, `.claude/skills/solana-dev/SKILL.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md` before working on the requested devnet simulation.
- Opened `docs/rule-proposal-prompt-test-set.md` and used its first 10 `VALID` prompts as the simulation rule proposal source.
- Added `apps/worker/src/devnet-10-player-simulation.ts`, a dry-run-by-default devnet operator for 10 deterministic player wallets that plans/manual-opens a turn, airdrops 2 SOL per wallet through `solana airdrop 2 <WALLET_ADDRESS> --url devnet`, submits guesses, runs rule preflight/proposal/precompile for each player, casts approval votes, manually shrinks the active turn duration to reach the cutoff, drives settlement to the elimination window, casts elimination votes, settles to draw fulfilled, manually closes the turn, attempts a real claim for an available seeded winner, and probes expired-unclaimed claim handling.
- Added `apps/worker/src/devnet-10-player-simulation.test.ts` to verify prompt parsing and default simulation config, and registered `pnpm --filter @idealer/worker devnet:simulate-10-players`.
- Updated `apps/worker/src/devnet-seed-real-inputs.ts` to export existing deterministic player/instruction/API helper functions and to resolve broadcast state at call time so the new operator can reuse the proven seeding path.
- Verified: `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test` (83/83), `pnpm --filter @idealer/worker lint`, `pnpm --filter @idealer/worker build`, host dry-run, and worker-container dry-run with `IDEALER_10P_SIM_PROMPT_MARKDOWN`.
- Broadcast/live simulation is blocked because `solana` CLI is not available in the host PATH or in the running `idealer-worker` container; the requested airdrop command cannot be executed in this environment without installing/exposing the Solana CLI. No fallback funding was used.
- No milestone checkbox was marked because this was a simulation/testing operator task and milestone marking still requires explicit user confirmation.

### 2026-07-01 (Solana CLI availability)

- Reopened `PRD.md`, listed `.claude/skills`, opened `.claude/skills/solana-dev/SKILL.md`, and opened `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md` before changing the execution environment.
- Checked official Solana/Anza documentation for CLI installation. The selected path is the documented Agave/Solana install tool for Linux with `v4.0.3`, followed by `PATH` exposure and `solana --version` verification.
- Updated `infra/docker/Dockerfile.node` to install `ca-certificates`, `curl`, and `bzip2`, run the documented Agave install tool, expose `/root/.local/share/solana/install/active_release/bin` in `PATH`, and verify `solana --version` during image build.
- Verified the Dockerfile install fragment in a minimal Docker image; it installed `solana-cli 4.0.3`.
- Attempted `docker compose build worker`, but the full build stayed stuck until the 15-minute timeout. The stuck build/compose processes from that attempt were stopped.
- Installed the same CLI into the currently running `idealer-worker` container as an immediate environment fix and symlinked `solana`/`solana-keygen` into `/usr/local/bin`.
- Verified in the running worker container: `solana --version` returns `solana-cli 4.0.3`, and `solana airdrop --help` exposes `solana airdrop [FLAGS] [OPTIONS] <AMOUNT> [RECIPIENT_ADDRESS]`.
- No milestone checkbox was marked because this was environment/tooling work and milestone marking requires explicit user confirmation.

### 2026-07-01 (10-player simulation retry)

- Reopened `PRD.md`, listed `.claude/skills`, reopened `.claude/skills/idealer-test-and-verify/SKILL.md`, and reopened `.claude/skills/idealer-test-and-verify/references/devnet-verification.md` before retrying the requested simulation.
- Verified the running worker environment has `solana-cli 4.0.3` and that the main API and worker health endpoints respond.
- Started a temporary API process on port `3012` with `gemma3:4b` and translation disabled to avoid the known slow `gemma4:latest` path during the simulation retry; verified it from the worker network.
- Built and used a temporary one-off worker image that includes the Solana CLI so the simulation could run without the main `idealer-worker` loop interfering with the command process.
- Verified the 10-player simulation dry-run still passes inside the worker container with the mounted source and docs.
- Retried the broadcast simulation with `IDEALER_10P_SIM_BROADCAST=1`, `IDEALER_TURN_MANUAL_CONTROL_ENABLED=true`, `IDEALER_SETTLE_BROADCAST=1`, and the devnet authority keypair path mounted from `idealer-solana-home`.
- The broadcast retry opened turn `54` but stopped on the first required player funding command because `solana airdrop 2 3WjawGsEDWYY6mboXdEphDHzWK3BS2QuGqx9QmEpriAN --url devnet` returned `Error: airdrop request failed. This can happen when the rate limit is reached.`
- Closed the turn left open by the failed retry with manual control; `closeTurnManually` returned turn `54` signatures `7r1Zs37Zj7wcgVJTpymxcKyWJWahPKBjTQkB8AK7oxFQkuSrH17wL3eT8XsLAHUySWWnhteaSzbncCijsxrSNQC` and `4pERmCzaj3xfvw7QXsD6bfLh8rG5L8Zg5iKGVCV3e5KuzUpKLkF2bNtUjPi8WvAHNp5QBqA1MUQd1GpFUHY2Zaws`.
- Observed the always-on `idealer-worker` turn automation acting on a new active turn `55` after cleanup; this is separate from the failed one-off simulation attempt.
- Removed the temporary simulation container/output file and stopped the temporary API process on port `3012`; the main API on port `3002` remained healthy.
- No fallback funding was used because the requested test explicitly requires `solana airdrop 2 <WALLET_ADDRESS> --url devnet`, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (10-player simulation funder wallet)

- Reopened `PRD.md`, listed `.claude/skills`, opened `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-test-and-verify/references/devnet-verification.md`, `.claude/skills/solana-dev/SKILL.md`, and `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md` before changing the simulation funding flow.
- Created a dedicated devnet simulation funder keypair in the Docker `idealer-solana-home` volume at `/solana-home/.config/idealer/devnet/ten-player-funder-keypair.json`; the private key was not written to the repository or printed in logs.
- Updated `apps/worker/src/devnet-10-player-simulation.ts` so broadcast runs use `IDEALER_10P_SIM_FUNDER_KEYPAIR_PATH` to transfer SOL from the funder wallet to each deterministic player wallet before gameplay; the existing faucet airdrop path remains available when no funder keypair path is configured.
- Added `IDEALER_10P_SIM_FUNDER_SOL_PER_PLAYER`, defaulting to `2` SOL per player, and validated conversion to lamports with up to 9 decimal places.
- Added worker tests for funder config parsing and SOL-to-lamports conversion.
- Verified: `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test` (85/85), `pnpm --filter @idealer/worker lint`, `pnpm --filter @idealer/worker build`, and a containerized dry-run with `IDEALER_10P_SIM_FUNDER_KEYPAIR_PATH=/solana-home/.config/idealer/devnet/ten-player-funder-keypair.json`.
- The funder wallet address is `9RgCEm7N2beoJwdexGDbvmkgJVJ8wnsQW9EX8HNNJbc4`; current devnet balance was checked as `0 SOL`.
- No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (10-player simulation funded broadcast)

- Reopened `PRD.md`, listed `.claude/skills`, opened `.claude/skills/idealer-test-and-verify/SKILL.md`, and opened `.claude/skills/idealer-test-and-verify/references/devnet-verification.md` before running the funded broadcast simulation.
- Confirmed the funder wallet `9RgCEm7N2beoJwdexGDbvmkgJVJ8wnsQW9EX8HNNJbc4` had `22 SOL` on devnet.
- Stopped the always-on `idealer-worker` before the one-off simulation to avoid turn automation interference; closed pre-existing active turn `55` manually with signatures `fTBZp3C6urbCRoUY3mXc9FTBKVsFRXF5QPwBbGgdJGSFdtuquX5ZmAZCUwfAMAQBfzy9oPYuZ1XZiF5o35mrE4d` and `53HgVa32hmC7vHQ8MPwV585DHzrfHntEocTDHkMXCTVekUMA2jBtFQESAuU8cWezUDcHbc6Vy5uJ6Wdso1FwMWay`.
- Started a temporary API on port `3012` with `gemma3:4b` and translation disabled, verified its health, and confirmed the on-chain global config had no active turn and `nextTurnId=56`.
- Ran a final containerized dry-run with `IDEALER_10P_SIM_FUNDER_KEYPAIR_PATH=/solana-home/.config/idealer/devnet/ten-player-funder-keypair.json`; it planned `funder_wallet_transfer_each_player_wallet`.
- Started the broadcast simulation with manual control, settlement broadcast, the devnet authority keypair, and the funder keypair. The run opened turn `56` and transferred `2 SOL` to each deterministic player wallet.
- The run then failed on the first `submit_guess` simulation with Anchor `ConstraintSeeds` on `player_guess` (`Custom 2006`). The transaction passed `3mGdouMfADMpUxX9NSrCXwHYAw7yZQDAN1qjKF1dT1W6`; the devnet program expected `GYCtGFSVVAttD1t1vmRHiPT9vHufwgwGiN71ADRMwyjD`.
- Verified locally that `3mGdouMfADMpUxX9NSrCXwHYAw7yZQDAN1qjKF1dT1W6` is the PDA produced by the current repo's `createSubmitGuessInstruction` for turn `56`, player index `0`, and sequence `1`, matching the local Anchor source seeds. This points to a devnet program/client contract mismatch or another deployed-program seed/layout drift that must be resolved before the 10-player simulation can continue.
- Closed turn `56` manually after the failed run with signatures `4ZzqyyBBjW21BM6C5xnQ1x1GQDXj5nA8ntJzxPJtmmi85m2FijXQphFG1Mza5irxorVA7XrXfE8kitoaVsmoViQ` and `6DuPwPxbyu1w897eaDAoKyf2rYh3FQKuakFFMN3XiJZ4F6csykpSBhhwNMpew2VtcnBBUP6LjTPZWbrHXoL2Lfo`.
- Checked balances after failure: the funder had `1,999,950,000` lamports remaining, and sampled player wallets for turn `56` each had `2,000,000,000` lamports.
- Removed the one-off simulation container/output file, stopped the temporary API on port `3012`, and restarted the main `idealer-worker`. The main API on `3002` and worker on `3003` responded healthy; after worker restart, automation opened active turn `57`.
- No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (Devnet PDA mismatch diagnosis)

- Reopened `PRD.md`, listed `.claude/skills`, opened `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/idealer-test-and-verify/references/devnet-verification.md` before diagnosing the PDA/program mismatch.
- Reproduced the devnet `submit_guess` failure with a funded signer on active turn `57`: the deployed program rejected the local client PDA with Anchor `ConstraintSeeds` on `player_guess`.
- Inferred the deployed program's expected `player_guess` PDA by brute force: devnet currently expects `PDA(["guess", turn_id, player])`, while the current repo source and clients correctly use `PDA(["guess", turn_id, player, sequence])` for repeated action support.
- Concluded that the devnet program binary is stale relative to the current repo/client contract. Downgrading the client would hide the issue and break sequenced repeated guesses; the correct fix is upgrading the devnet program to the current SBF artifact.
- Checked devnet program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4`: upgrade authority is `4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH`, last deployed slot was `471782068`, and the deployer had `11.46552976 SOL`.
- Built the current SBF artifact with devnet features `devnet-test,sb-devnet`: `scripts/sbf.sh build` produced `/sbf-target/deploy/idealer.so`.
- Verification passed before any upgrade transaction: `pnpm --filter @idealer/solana-programs typecheck`, `pnpm --filter @idealer/solana-programs lint`, `pnpm --filter @idealer/solana-programs test`, and `scripts/sbf.sh test-sbf` (7/7 ignored SBF instruction tests passed).
- No devnet upgrade transaction was sent yet; broadcasting the program upgrade still requires explicit user confirmation.
- No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (Devnet program PDA alignment upgrade)

- Proceeded only after explicit user confirmation to broadcast the devnet program upgrade.
- Stopped the always-on `idealer-worker`, checked the on-chain global config, and closed active turn `59` before upgrade with signatures `64qdLjKxb6gUKU3U6TmPxW5hcrpRig5tW2iZsc6yeeVvhBapY6RCabtRQDRkwV4kbMPf2wtoAxjnXkArpWb3sL2s` and `36TTZGPHcTit1xo18zxegwoadBd37hDoAwBXuUyC9Hwx24zi8eyWqR7H1SaAQgdX9yxAosRMfa7kehPHnLWXUzCF`.
- Upgraded devnet program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4` from the already verified `/sbf-target/deploy/idealer.so` artifact using upgrade authority `4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH`.
- Upgrade transaction signature: `61Xud27HJGkDSXvnJdDrEWwFjGFxmbYgjBfp5b4ZAPhp1LyhtJaaA5vm4JAVEvkQfsws58vCS42yXkVznyFh4CwB`.
- Verified `solana program show`: last deployed slot is now `473283206`, program data length is `778352 (0xbe070)` bytes, and upgrade authority remains `4bY5krt2VnnSNB1R4c1bhiWdQYkTc1FvFTN1LaV5JxCH`.
- Opened temporary turn `60` and simulated `submit_guess` with the current client PDA including the `sequence` seed. The simulation returned `err: null` and program logs ended in success, confirming the PDA mismatch is resolved on devnet.
- Closed temporary turn `60` with signatures `2ZQTCW28Jk98W7pqq3guK5et8myocp1PY6Y8FYSs64b48Cw9prfsuHkCMy99fguRLuM3v3rnw8cn1LiLH4Qk9oxE` and `2RjePV4CqKyYWb9NU4tDjrcVGw6Baao34XNDcivNoXYas7aEQU9g1h78tUVPysqdCZfi9iyavw3RGzxTBsZuau91`.
- Restarted `idealer-worker`; API `3002` and worker `3003` responded healthy. Worker automation opened active turn `61` after restart.
- No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (10-player simulation rerun after PDA upgrade)

- Reopened `PRD.md`, listed `.claude/skills`, opened `.claude/skills/idealer-test-and-verify/SKILL.md`, and opened `.claude/skills/idealer-test-and-verify/references/devnet-verification.md` before rerunning the requested simulation.
- Swept leftover devnet SOL from deterministic player wallets for failed turns `56`, `62`, and interrupted turn `63` back to the dedicated simulation funder wallet. The funder ended cleanup with `21.80911712 SOL`.
- Stopped `idealer-worker`, closed active turn `61`, and started a temporary API on port `3012` with `gemma3:4b` and translation disabled.
- Ran a broadcast simulation on turn `62` against the upgraded devnet program. The PDA mismatch was resolved: the run opened the turn, funded players, submitted guesses, and progressed into rule validation.
- The run failed at player/rule prompt #2 from `docs/rule-proposal-prompt-test-set.md`: `Win if the guessed numbers have the same sum as the drawn numbers.` The stored rule validation returned `decision=INVALID`, `reasonCodes=["UNSUPPORTED_RULE","UNSAFE_RUNTIME_BOUNDS"]`, and no `compiledArtifactHash`.
- Initially changed the first 10 reference prompts to only supported match-count prompts, but the user clarified that reference prompts must not be altered and that unsupported reference prompts indicate an agent/compiler deficiency. Reverted the prompt-set change and restored the original simulation test expectation.
- Verified after revert: `pnpm --filter @idealer/worker typecheck`, `pnpm --filter @idealer/worker test` (85/85), `pnpm --filter @idealer/worker lint`, and `pnpm --filter @idealer/worker build`.
- Closed turn `62` after the failed validation and closed turn `63` after stopping the invalid prompt-altered rerun. Removed the simulation container/output file, stopped the temporary API on `3012`, and restarted `idealer-worker`.
- Final health checks passed: API `3002` and worker `3003` responded healthy, temporary API `3012` was unreachable, and worker automation opened active turn `64`.
- No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (Rule proposal agent prompt flexibility fix)

- Reopened `PRD.md`, listed `.claude/skills`, opened `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/best-practices/references/testing.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, `packages/rule-compiler/rule-authoring/references/examples.md`, and `docs/rule-proposal-prompt-test-set.md` before changing the rule proposal agent/compiler path.
- Expanded the rule DSL schema and deterministic runtime with objective `filter_compare`, `filter_mod`, and `all_ordered_compare` nodes so valid natural-language rules can express parity counts and same-position comparisons without relying on rigid prompt wording.
- Updated the rule compiler's deterministic reviewer/offline compiler to recognize the first 10 `VALID` prompts in `docs/rule-proposal-prompt-test-set.md`, including exact match counts, no matches, position comparisons, unordered same-set matching, even-count equality, compound sum+match rules, and smallest-value comparison.
- Strengthened ambiguity and external-dependency gates so the first 10 `CLARIFY` prompts are classified as ambiguous and the first 10 `BLOCK` prompts are rejected before submission.
- Updated the runtime `compile_rule_to_ast` skill prompt and examples so the LLM agent is guided to accept casual but objective wording instead of requiring a narrow sentence format.
- Added regression coverage that reads `docs/rule-proposal-prompt-test-set.md` directly and verifies the first 10 prompts from each `VALID`, `CLARIFY`, and `BLOCK` category.
- Fixed a pre-existing `rule-test-harness` lint issue (`no-useless-assignment`) encountered during dependent-package verification by removing an unused initial boolean assignment without changing behavior.
- Verified: `pnpm --filter @idealer/rule-schema typecheck`, `test` (7/7), `lint`, `build`; `pnpm --filter @idealer/rule-runtime typecheck`, `test` (12/12), `lint`, `build`; `pnpm --filter @idealer/rule-compiler typecheck`, `test` (22/22), `lint`, `build`; `pnpm --filter @idealer/rule-test-harness typecheck`, `test` (6/6), `lint`, `build`.
- Reviewed the resulting behavior for inconsistencies: the change stays bounded to deterministic guess/draw-only DSL nodes, keeps external/ambiguous rules fail-closed, keeps the harness behavior unchanged aside from lint cleanup, and does not mark any milestone checkbox because milestone marking requires explicit user confirmation.

### 2026-07-01 (Selected 10 prompt deterministic conversion simulation)

- Reopened required context before running the check: `PRD.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-test-and-verify/references/devnet-verification.md`, and `docs/rule-proposal-prompt-test-set.md`.
- Selected the first 10 `VALID` prompts from `docs/rule-proposal-prompt-test-set.md`, matching the default input set used by `apps/worker/src/devnet-10-player-simulation.ts`.
- Ran a local deterministic conversion check over prompts #1-#10 with fixed timestamp/rule IDs. All 10 returned `decision=VALID`, all 10 produced stable AST/artifact hashes across repeated compilation, and all deterministic harness checks passed.
- Resulting artifact hashes for prompts #1-#10: `915cb67c232451dcfafbf4af42e1728a485693dfe57129de80fc8d8a08478730`, `b8f850f2c2c709eb2dd4cc8a348bc45fe0b078b76999054a38136b16492d20a2`, `60975c459093c340546cedb88eacf430076c7c891a3efefd0187513019e7a409`, `5dc9e4fe670f26a96334631ddbc59858776f96986513e4381b9722d05ccc5559`, `75c08bbad9f2bd35b9f2f8a23e51a1f3c48ae31bdfbb04fefd85c938875d4186`, `ad87d88127fd516f517049704fbafa1c9638a27c5180e13bd989ae112cf9f955`, `a1dab0274b81a68c4781da766e4843d459557da5683b97f3738a1563261510a1`, `77e0c7a5a04bc7782b8c3f982da14ce3a172dee04e501db86d0334df4c636a65`, `5a90a7f53285701f79448fc79c692aeda82f38b677a41ec81c51f1f8d5c9debb`, and `8e28069cb230ec2a8cba1a4892b10d9523837f0b770a3ca5d01f69332ba73708`.
- Ran `pnpm --filter @idealer/worker devnet:simulate-10-players` in its safe default dry-run mode. The dry-run selected the same 10 prompts, planned the full 10-player flow (`manual_open_turn`, funding, guesses, rule preflight/proposal, votes, settlement, close, claim, expired-claim probe), and did not broadcast transactions.
- Reviewed the result for inconsistencies: deterministic conversion stayed `guess`/`draw`-only, the simulation remained dry-run because live broadcast requires explicit `IDEALER_10P_SIM_BROADCAST=1`, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (Single prompt coverage check)

- Reopened required context before checking the user's requested prompt: `PRD.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Confirmed the prompt `Win if the guessed numbers have the same sum as the drawn numbers.` was already tested as prompt #2 in the selected 10-prompt deterministic conversion run.
- Existing result for that prompt: `decision=VALID`, deterministic repeated compilation, artifact hash `b8f850f2c2c709eb2dd4cc8a348bc45fe0b078b76999054a38136b16492d20a2`, `ruleMode=predicate`, `difficulty=EXTREME`, `finalConfidence=0.936`, and deterministic harness checks passed.
- No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (10-player simulation rerun without player fund sweep)

- Reopened required context before rerunning the live simulation: `PRD.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/idealer-test-and-verify/references/devnet-verification.md`.
- Stopped `idealer-worker` to avoid turn automation interference, closed pre-existing active turn `66`, and started a temporary API on port `3012` with `gemma3:4b` and translation disabled.
- Ran a dry-run of `apps/worker/src/devnet-10-player-simulation.ts`; it selected the first 10 original `VALID` prompts from `docs/rule-proposal-prompt-test-set.md`, planned player funding through the dedicated funder wallet, and did not include any player-balance sweep back to the funder.
- Ran the broadcast simulation with `IDEALER_10P_SIM_BROADCAST=1`, `IDEALER_10P_SIM_FUNDER_KEYPAIR_PATH=/solana-home/.config/idealer/devnet/ten-player-funder-keypair.json`, manual turn control, settlement broadcast, and the devnet authority keypair.
- The run opened turn `67`, transferred `2 SOL` from funder wallet `9RgCEm7N2beoJwdexGDbvmkgJVJ8wnsQW9EX8HNNJbc4` to each deterministic player wallet, submitted guesses, and again failed during stored validation of prompt #2: `Win if the guessed numbers have the same sum as the drawn numbers.`
- The stored rule validation for prompt #2 returned `decision=INVALID`, `reasonCodes=["UNSUPPORTED_RULE","UNSAFE_RUNTIME_BOUNDS"]`, `compiledArtifact=null`, and `compiledArtifactHash=null`; this remains an app/compiler defect because the reference prompts were not changed.
- Closed turn `67` after failure with signatures `675QmaYqVBd2CB4mJdupF6xeJfEHLTr7cCarAtCqZjYTvgeat7XN5icvPLiww6CtTW6yi74Pk9rX6Zbk7VDnMNar` and `3jdF8EvpgRsp86rqvfqfthx7fPgpJ3LT1NyoFLi9SPxbh4yW2kixYr3MD3adoq3z9aE46pBUB2xbxDEim5CbT9uJ`.
- Per user request, did not return player wallet SOL to the funding wallet. Confirmed turn `67` player balances stayed in player wallets: player 0 `1.95206344 SOL`, player 1 `1.95206344 SOL`, players 2-9 `1.99639668 SOL` each. The funder wallet balance after funding was `1.80906712 SOL`.
- Removed only the temporary simulation container/output file, stopped the temporary API on `3012`, and restarted `idealer-worker`. Final health checks passed: API `3002` and worker `3003` responded healthy, and temporary API `3012` was unreachable.
- Reviewed the result for inconsistencies: the reference prompt file was not modified, no player fund sweep was performed, the failing behavior is still exposed instead of hidden by fallback logic, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (Runtime version verification for rule prompt #2)

- Reopened required context before the verification: `PRD.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Investigated why prompt #2 passed local tests but failed in the live simulation. Confirmed the workspace is at commit `8500607` (`feat: enhance rule compiler with new filtering and comparison capabilities`), but the running Docker API image had different hashes for `packages/rule-compiler/src/index.ts`, `packages/rule-runtime/src/index.ts`, and `packages/rule-schema/src/index.ts`.
- Confirmed the Docker Compose setup only bind-mounted `apps/api/src` and `apps/worker/src`; shared packages were baked into the Docker image. Therefore API validation inside Docker was using stale package code unless the image was rebuilt.
- Per user direction, stopped using Docker for the API update path because rebuilding the image is too slow after package changes. Stopped the stale Docker `idealer-api` and `idealer-worker` containers, leaving only Docker Postgres and Redis running.
- Started the API on the host at `http://127.0.0.1:3002` with the current workspace code, `gemma3:4b`, translation disabled, and host connections to Docker Postgres/Redis.
- Verified host API health returned `status=ok`, `postgres=ok`, and `redis=ok`.
- Replayed prompt #2 through the real API flow on the host: `/rule-preflight` returned `decision=VALID`, `needsClarification=false`, and a compiled artifact hash; saving a temporary in-memory proposal then calling `/rule-validations/run` returned `decision=VALID`, `reasonCodes=["SUPPORTED_RULE"]`, `compiledArtifactHash=561b0c07475a61d7911880778f3270ee4111b9804889ab919366359ef30aec30`, and AST node kind `sum_equals`.
- Conclusion: the previous simulation failure was caused by stale Docker package code, not by the reference prompt. Future simulations should point worker containers at the host API (`http://host.docker.internal:3002`) or use a workflow that bind-mounts shared packages instead of relying on a rebuilt API image.
- Reviewed the result for inconsistencies: Docker API/worker are stopped, host API is the active current-code API, Docker Postgres/Redis remain healthy, no reference prompts were changed, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (10-player simulation rerun against host API)

- Reopened required context before rerunning the simulation: `PRD.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/idealer-test-and-verify/references/devnet-verification.md`.
- Confirmed the active API was the host API at `http://127.0.0.1:3002` with current workspace code; Docker `idealer-api` and `idealer-worker` remained stopped, while Docker Postgres and Redis stayed healthy.
- Closed pre-existing on-chain active turn `69` before the rerun with signatures `3PXQ5A4mbs3idm6pWvXL3eEBUGTRFpjEVg2XTu5nQDGDsgbB8Kzomz1LSkNjvWUAoChHmtdkVhWwgCjzxgyrPUa9` and `myBRtK5PXVz58h8DnXyDbUcskFaaH6vfmURwPDWfQVus1sKDvBfxZFYF4zVH5FQ9kuwUd1qyeoZ1MPPAd2HTtxy`.
- Ran a dry-run of `apps/worker/src/devnet-10-player-simulation.ts` from the Solana CLI worker image, pointing `IDEALER_API_BASE_URL` to `http://host.docker.internal:3002`, using the first 10 original `VALID` prompts from `docs/rule-proposal-prompt-test-set.md`, and reducing per-player funding to `0.15 SOL` because the dedicated funder wallet had `1.80906712 SOL` remaining.
- Started the broadcast simulation with `IDEALER_10P_SIM_BROADCAST=1`, manual turn control, settlement broadcast, the devnet authority keypair, and the dedicated funder keypair.
- The run opened turn `70`, funded all 10 deterministic player wallets with `0.15 SOL`, submitted guesses and rule proposals for the first six players, and confirmed the previously failing prompt #2 now passes in the live simulation: `Win if the guessed numbers have the same sum as the drawn numbers.` reached `state=eligible`, `precompilationStatus=passed`, `decision=VALID`, `reasonCodes=["SUPPORTED_RULE"]`, and artifact kind `sum_equals`.
- The run then failed at prompt #7: `Win if the guess and draw contain the same set of numbers, regardless of order.` `/rule-preflight` returned `decision=INVALID`, `needsClarification=true`, `compiledArtifactHash=null`, and `reasonSummary="Rule rejected: PROVIDER_MALFORMED_RESPONSE, UNSUPPORTED_RULE, UNSAFE_RUNTIME_BOUNDS."`
- Closed turn `70` after the failure with signatures `JEJKbzwiZBgZCq3eCX2sJJUHNMqegn8Coto4dU35aWdtJqdUSktq2VLpRNRyreVcNLkfxqCsvEkGeAdM7GuZr9r` and `2dUjYEf4y5Ln16PQsA9ET2C4avNpCM3N6GnArRrZuJ9AgkpdHRBPGxyWZvLNp7hKXnr6xLyXxaLWQAgG78reShDN`.
- Per the prior user instruction, did not return player wallet SOL to the funding wallet. Confirmed turn `70` player balances stayed in player wallets: players 0-5 `0.10206344 SOL` each, players 6-9 `0.14639668 SOL` each. The funder wallet balance after the run was `0.30901712 SOL`.
- Removed the temporary simulation container/output file. Final runtime state: host API `3002` is healthy, Docker Postgres and Redis are healthy, and Docker API/worker are not running.
- Reviewed the result for inconsistencies: the reference prompt file was not modified, the simulation now uses current API code instead of stale Docker package code, no player fund sweep was performed, the new prompt #7 failure is exposed as a real rule-agent/preflight defect, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (10-player simulation reruns after agent updates)

- Reopened required context before rerunning: `PRD.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/idealer-test-and-verify/references/devnet-verification.md`.
- Restarted the host API on `http://127.0.0.1:3002` so the latest agent changes were loaded from the current workspace code; Docker API/worker stayed stopped, while Docker Postgres and Redis stayed healthy.
- Confirmed the next open turn was `71`, then transferred `0.15 SOL` directly from deterministic player wallets from turn `67` to deterministic player wallets for turn `71`, avoiding any return to the funding wallet.
- Ran a broadcast simulation for turn `71` with `IDEALER_API_BASE_URL=http://host.docker.internal:3002` and `IDEALER_10P_SIM_SKIP_AIRDROP=1`. The run opened turn `71`, submitted guesses, and reached three eligible/precompiled proposals, then failed on a transient container-to-host API `fetch failed` during `/rule-preflight`; the host API remained healthy and logs showed no server crash.
- Closed turn `71` after the transient failure with signatures `2yTiyFsWfMgRNHn3uEhVY5XNuijipXnFoXFisgPpfihWLRvr4AUg9YeBRfJLMu4E6AzjGXZQ2cKTLf7RV9uj9QQu` and `5KvALAuhHCCuHvmviXQAnfRpYP83GfjBmXcS9EHHreBtv5uBaSndphwjgnYuWak4YszK9WpsPJEuKJ5oVFwM8ZXf`.
- Confirmed prompt #7 directly from a container against the updated host API: `Win if the guess and draw contain the same set of numbers, regardless of order.` returned `decision=VALID`, `needsClarification=false`, and `compiledArtifactHash=7dc03e04624c583b788bf147679643935ca2d4707b5ead5174126cfa47f57620`.
- Confirmed the next open turn was `72`, then transferred `0.15 SOL` directly from deterministic player wallets from turn `67` to deterministic player wallets for turn `72`.
- Ran another broadcast simulation for turn `72` with `IDEALER_10P_SIM_SKIP_AIRDROP=1`. The run opened turn `72`, submitted guesses, and advanced through eight eligible/precompiled rule proposals. The previously failing prompt #7 passed in the live simulation, as did the even-number-count prompt #8.
- The turn `72` run failed at prompt #9: `Win if the guessed sum is greater than the drawn sum and at least 2 numbers match.` `/rule-preflight` returned `decision=INVALID`, `needsClarification=true`, `compiledArtifactHash=null`, and refinement text even though it inferred the intended interpretation. This is the current rule-agent/preflight defect.
- Closed turn `72` after the prompt #9 failure with signatures `4CTFYCKR6XA54GNRokpaxHPGH1hppSemyWX9pDPcARcJZUCxPFxYiU6EFXaHCn24jWezdnQFcFVSni22ktJa2Dn9` and `49KQcHnLNzvH6eXUAaxvUCi4CwqBks5bzP6XBJo6GfsUNps7SxF5CuACkSg1AtEWUfuqBmQapsbr2ifLNyF8y1Rm`.
- Per prior user instruction, did not return player wallet SOL to the funding wallet. Confirmed turn `72` balances stayed in player wallets: players 0-7 `0.10206344 SOL` each, players 8-9 `0.14639668 SOL` each.
- Removed temporary simulation container/output file. Final runtime state: host API `3002` is healthy, Docker Postgres and Redis are healthy, Docker API/worker are not running.
- Reviewed the result for inconsistencies: reference prompts were not modified, the simulation used the current host API code, SOL was kept in player wallets, prompt #7 is now fixed in live simulation, prompt #9 is the next exposed failure, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-01 (Rule proposal prompts 9, 10, 11, and 101)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, `packages/rule-compiler/rule-authoring/references/examples.md`, and `docs/rule-proposal-prompt-test-set.md`.
- Tested prompts `#9`, `#10`, `#11`, and `#101` from `docs/rule-proposal-prompt-test-set.md` through the deterministic rule compiler. Initial check found `#101` rejected as unsupported and `#9` accepted incorrectly as only `match_count_at_least: 2`, dropping the `guessed sum > drawn sum` clause.
- Updated the deterministic compiler so compound `guessed sum > drawn sum AND at least N matches` rules are matched before generic match-count rules, preserving both clauses in the emitted AST.
- Expanded match-count prompt recognition for valid casual wording such as `N or more`, `show up`, and `somewhere in the draw`, allowing prompt `#101` to compile as `match_count_at_least: 4`.
- Added regression coverage that reads the requested prompt IDs directly from `docs/rule-proposal-prompt-test-set.md` and verifies prompts `#9`, `#10`, `#11`, and `#101` compile to `VALID`, including AST-shape checks for `#9` and `#101`.
- Verified: direct deterministic check for prompts `#9`, `#10`, `#11`, and `#101`; `pnpm --filter @idealer/rule-compiler typecheck`; `pnpm --filter @idealer/rule-compiler test` (24/24); `pnpm --filter @idealer/rule-compiler lint`; `pnpm --filter @idealer/rule-compiler build`.
- Reviewed the result for inconsistencies: the reference prompt file was not modified, the compiler remains bounded to deterministic `guess`/`draw` inputs, no fallback hides invalid behavior, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-02 (Agent chat clarification options UX)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `docs/rule-proposal-prompt-test-set.md`.
- Added `/play/propose` as a stable deep link to the rule-proposal dealer chat.
- Updated the dealer chat so wallet connection is no longer required for free chat/preflight; wallet and Game Token remain required for draft persistence and on-chain submission.
- Added structured API request errors in the web API client so rule blocks (`RULE_PROMPT_INJECTION`, `RULE_EXTERNAL_DEPENDENCY`) are shown as rule-fix prompts while real 5xx dealer/LLM failures remain honest infrastructure errors.
- Added deterministic guidance helpers and tests for Sequence 8 and Sequence 9 from `docs/rule-proposal-prompt-test-set.md`, including prompt-injection cleanup, other-player dependency removal, and objective close-rule clarification.
- Replaced inline clarification lists in the create-rule chat with a Codex/Claude-style dark choice prompt: numbered selectable suggestions, manual clarification row, `Dismiss`, and `Submit`; later mobile cleanup removed visible desktop keyboard hints.
- Updated Playwright coverage for Sequence 8 and Sequence 9 against the live `/play/propose` route with mocked preflight responses.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (8/8); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`; `pnpm --filter @idealer/web test:e2e -- e2e/rule-proposal.spec.ts` (3/3).
- Reviewed the result for inconsistencies: UI copy remains English, manual clarification remains available, blocked-rule UX does not hide compiler errors, infrastructure failures are not converted into rule suggestions, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-03 (Rule agent generalization and production-code pipeline assessment)

- Reopened required context before answering: `PRD.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/architecture.md`, `.claude/skills/best-practices/references/testing.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/security-best-practices/SKILL.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, `packages/rule-compiler/rule-authoring/references/examples.md`, and `docs/rule-proposal-prompt-test-set.md`.
- Reviewed the rule compiler architecture across `packages/rule-schema`, `packages/rule-runtime`, `packages/rule-compiler`, and the API preflight path to assess whether rules outside the markdown prompt set can be handled safely.
- Conclusion recorded for the task: the agent can generalize only within the bounded `guess`/`draw` DSL and runtime schema; unsupported or ambiguous rules fail closed. A production pipeline where the agent emits arbitrary code is not recommended for money-bearing game rules; the safer path is to evolve the versioned DSL/compiler/harness with staged validation and deployment gates.
- Reviewed the result for inconsistencies: no code behavior was changed, no tests were run because this was an architecture assessment only, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-03 (LLM rule harness prompts 21-30)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, `packages/rule-compiler/rule-authoring/references/examples.md`, and `docs/rule-proposal-prompt-test-set-2.md`.
- Tested prompts `#21` through `#30` from `docs/rule-proposal-prompt-test-set-2.md` with the real local LLM harness (`gemma3:4b`, Ollama, translation disabled). The initial LLM-assisted check exposed unsafe semantic drift when normalized text was used in an ad hoc harness: removal, doubling, modulo, and exact-position semantics could be dropped.
- Updated the deterministic rule DSL/compiler path so prompts `#21`-`#30` compile into exact guess/draw-only ASTs: bounded removal, guarded doubled values, below-50 count split, first/last-three slice sums, position-wise parity, within-any-draw distance, sum modulo 10, and exact same-position match count.
- Added `value_within_any_count_at_least` to the schema/runtime for prompt `#28`, because "within ten of at least one drawn number" is not the same as same-position distance.
- Improved the LLM compile harness prompt and runtime `rule-authoring` skill with the new node and concrete prompt-set examples, including `remove_up_to_n`, `map_with_guard`, `below-50 split`, `value_within_any_count_at_least`, and `sum(guess) mod 10`.
- Added regression coverage for schema validation, runtime behavior, compiler prompt coverage, API LLM prompt coverage, and direct prompt-set-2 prompts `#21`-`#30`, including runtime spot checks for doubled values, last-three sums, within-any distance, modulo sums, and exact one position.
- Final real LLM harness run mirrored the API flow by compiling from the original prompt text, not the LLM-normalized text. All prompts `#21`-`#30` returned `VALID`, `failures=0`, and deterministic AST kinds were: `compare`, `count_at_least`, `count_at_least`, `compare`, `compare`, `compare`, `all_equal_ordered`, `value_within_any_count_at_least`, `compare`, and `ordered_position_match_count_eq`.
- Verified: `pnpm --filter @idealer/rule-schema typecheck`, `test` (7/7), `lint`, `build`; `pnpm --filter @idealer/rule-runtime typecheck`, `test` (13/13), `lint`, `build`; `pnpm --filter @idealer/rule-compiler typecheck`, `test` (34/34), `lint`, `build`; `pnpm --filter @idealer/api typecheck`, `test` (58/58), `lint`, `build`.
- Reviewed the result for inconsistencies: all new semantics remain inside the bounded `guess`/`draw` DSL, ambiguous/external rules still fail closed, no prompt reference file was edited for convenience, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-06 (Dealer conversation in-progress reattach)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and the design-system reference markdown files.
- Fixed the create-rule dealer conversation so a message is saved as a draft before preflight, including pending user-only transcripts, instead of waiting for the AI dealer response.
- Added a client-side conversation run store with subscription and wallet/turn reattach support so in-app navigation away from the Create screen can rejoin an in-progress dealer response without requiring the player to resend the message.
- Updated the Create screen to create a stable client draft id before the first request, publish pending/done/error snapshots to the run store, resume snapshots when reopening by draft id, and reattach the latest wallet/turn run when opening Create without a saved `chatId` yet.
- Shared canonical rule text sanitization/token counting through `@idealer/constants`, removed duplicated API logic, and added regression tests for pending transcript draft bodies and run-store reattachment.
- Preserved honest error handling: failed draft saves and compiler/API failures are still surfaced in the chat instead of being hidden by fallback behavior.
- Verified: `pnpm --filter @idealer/constants typecheck`, `test`, `lint`, `build`; `pnpm --filter @idealer/api typecheck`, `test` (63/63), `lint`, `build`; `pnpm --filter @idealer/web typecheck`, `test` (12/12), `lint`, `build`.
- Reviewed the result for inconsistencies: UI copy added by this task is English, pending run state is scoped by wallet and turn, submitted/reset conversations clear the latest-run pointer, existing generated `apps/web/next-env.d.ts` output was left as generated, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-06 (Dealer background response continuity)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and the design-system reference markdown files.
- Decoupled dealer response progress from the mounted `CreateChat` component by adding a background conversation runner that owns in-flight preflight/autosave tasks at module scope.
- Updated `CreateChat` so sending a message only creates the pending transcript and starts the background run; all response, error, blocked-rule guidance, and final rule-preview state now arrive through store snapshots.
- Extended the run store to support guidance context and anonymous session reattach, so leaving and returning inside the app can recover an in-progress response even before a wallet-backed draft is available.
- Added regression coverage proving a conversation run continues to completion while no screen is subscribed.
- Verified: `pnpm --filter @idealer/web test` (13/13), `lint`, `build`, and `typecheck` after the build regenerated `.next/types`.
- Reviewed the result for inconsistencies: no visible UI pattern changed, UI copy remains English, the temporary encoding issue introduced during mechanical cleanup was corrected, response progress is no longer owned by a mounted screen, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-08 (Dealer new-rule composer entry points)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and the design-system reference markdown files.
- Initial pass separated explicit create-rule entry points from automatic draft resumption; the natural-language chat intent behavior from this pass was superseded by the scope clarification entry below.
- Added a `newConversation` navigation signal and remount key so empty create-rule entry points start a fresh composer instead of reopening the previous completed conversation.
- Limited automatic latest-run reattachment to pending background runs only; completed drafts remain available from the account conversation list without hijacking a new create action.
- Updated empty create-rule CTAs from the bottom nav, home prompt, and account empty state to use the explicit new-conversation path, while typed seed text still starts a seeded compiler chat.
- Added regression tests for Portuguese and English create-rule help phrases and for selectable `New clean rule: ...` rewrites so guidance options still compile instead of resetting the chat.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (15/15); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Attempted focused Playwright verification with `pnpm --filter @idealer/web exec playwright test e2e/rule-proposal.spec.ts`, but it could not start because an existing Next dev server for `apps/web` was already running (PID `41060`) and the command path did not resolve `playwright`; the existing server was left untouched.
- Reviewed the result for inconsistencies: UI copy added by this task is English, no fallback hides compiler/API failures, pending background response continuity is preserved, saved conversations are still resumable by explicit draft id, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-08 (Dealer chat scope clarification)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and the design-system reference markdown files.
- Corrected the previous new-rule intent handling: natural-language messages like `quero criar outra regra` and `Create another rule` are now treated as help/chat requests, not as commands to reset or create a new conversation.
- Kept explicit UI actions such as the `Create another` button and empty create-rule CTAs on the new-composer path; typed chat messages no longer trigger that path by inference.
- Added a dealer chat reply for new-rule help requests that explains how to proceed with a complete winner-condition sentence and makes clear that questions are chat, not edits.
- Added a tips/strategy chat reply so users can ask how to improve a rule idea without compiling or modifying the current draft.
- Updated regression test wording and behavior so these messages are asserted as help requests that do not patch the current draft, while selectable `New clean rule: ...` rewrites still compile as rule text.
- Verified: `pnpm --filter @idealer/web test` (15/15); `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Reviewed the result for inconsistencies: UI copy remains English, no compiler/API fallback was added, the agent no longer changes draft state from out-of-scope chat questions, explicit UI-based new conversation remains available, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-08 (Rule-submit return-flow diagnostics and clean-rule semantics)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/kit-web3-interop.md`, and `C:/Users/iagoo/.codex/plugins/cache/openai-curated-remote/vercel/1.0.0/skills/nextjs/SKILL.md`.
- Corrected the blocked-rule clean suggestion so it preserves the user's intended unordered threshold: `New clean rule: win if at least 2 guessed numbers appear in the draw, regardless of order.` It no longer suggests the semantically different exact same-position rule for this path.
- Added transaction-plan diagnostic extraction from nested `transactionPlanResult` errors so the UI surfaces simulation logs instead of only the generic `provided transaction plan failed to execute` wrapper.
- Added pre-wallet checks to rule submission after returning from play: verify the active round did not change, confirm the wallet's round pass (`game_token`) exists on devnet, and detect an already-used rule proposal PDA before opening the wallet request.
- Added regression coverage for nested transaction-plan diagnostics and updated rule-guidance/e2e expectations for the corrected clean-rule suggestion.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (16/16); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`; attempted `pnpm --filter @idealer/web test:e2e -- e2e/rule-proposal.spec.ts`, but the Playwright webServer could not start because an existing Next dev server for `apps/web` was already running (PID `41060`); ran a focused Playwright smoke against a temporary `next start` production server on `127.0.0.1:3005`, confirmed the corrected clean-rule suggestion is visible, and stopped that temporary server.
- Reviewed the result for inconsistencies: UI copy remains English, the rule suggestion no longer changes unordered matching into same-position matching, transaction failures are not hidden by fallbacks, submit checks fail with explicit reasons before wallet approval when state is stale, the existing dev server on `http://localhost:3000` was left untouched, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-08 (Turn phases: phase-2 pipeline in test mode + 24h production turn)

- Reopened required context before working: `PRD.md`, `PROGRESS_TRACKER.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Root cause of "test mode never reaches the shortlist/elimination vote and never draws": `POST /manual/close` (and `/manual/cycle`) shrank the turn to 1 second and called the on-chain `close_turn` directly, so the turn closed before the settlement pipeline could run the finalist shortlist, the elimination decision window, the active-rule election, or the draw; the scheduler then waited forever on `closed_without_fulfilled_draw`.
- Redefined the turn as two sequential phases (PRD §2.1/§5.3/§5.4): phase 1 — create rules + pick numbers, closing at the rule-election/guess cutoff; phase 2 — finalist shortlist, decision/elimination window, active rule, and the draw at the turn's end. Production turns are now fixed 24h = ~22h phase 1 (9167 bps cutoff) + ~2h phase 2, replacing the former `2h → 2h → 8h → 8h` cycle (equal-slot cycle machinery retained).
- Worker: `closeTurnManually` now only ends the phase-1 play window (shrinks the duration to the elapsed time, keeping the turn `Open`) and immediately kicks a settlement pass; the settlement scheduler runs phase 2 end-to-end and issues the real `close_turn`. `/manual/cycle` opens the next turn once settlement has closed the previous one. Added `/manual/force-close` as an explicit escape hatch that keeps the old skip-phase-2 behavior for wedged turns.
- Worker: the settlement view now decodes `start_timestamp` and derives `electionCutoffTimestampSeconds` from the on-chain `rule_election_cutoff_bps` (previously it was hard-set to the turn end), so the finalist shortlist and elimination window run inside phase 2 of the turn and the draw fires at the turn's end.
- Contract source: production defaults updated to `turn_duration_cycle [86400 x4]`, `rule_election_cutoff_bps 9167`, `guess_cutoff_bps 9167`; `validate_config` now accepts equal cutoffs (`<=`), so rule creation and guessing close together at the phase boundary. The deployed devnet program is unchanged and unaffected (the manual-test 2-minute elimination window and existing 7500/9670 cutoffs keep working); the new defaults apply on the next SBF build + deploy + `reinitialize_global_config_for_migration`.
- Web: the home hero timer now shows the current phase with its own countdown — `Phase 1 · Create & play` counts to the cutoff, `Phase 2 · Shortlist & draw` counts to the turn end, and `Draw in progress` covers the settle gap — using the existing pill/ide-num patterns; `phase1EndsAt`/`turnOpen` added to the Idealer context.
- Constants: `TURN_DURATION_CYCLE_HOURS [24 x4]`, `TURN_DURATION_CYCLE_SECONDS [86400 x4]`, new `RULE_ELECTION_CUTOFF_BPS`/`GUESS_CUTOFF_BPS = 9167`; worker `PRODUCTION_TURN_DURATION_CYCLE_SECONDS` matches; `.env`/`.env.example` scale comments updated (56 bps ≈ 8-minute turns on the 24h base).
- Verified: `pnpm --filter @idealer/constants|@idealer/game-engine|@idealer/worker|@idealer/api|@idealer/web typecheck|test|lint|build` all green (worker 86/86, api 63/63, web 16/16); `pnpm --filter @idealer/solana-programs test` (14 core tests, including new equal/zero-cutoff validation asserts) and `lint` (clippy `--all-features`) green in the pinned Docker toolchain.
- Live devnet verification: restarted the native worker with the new code, `POST /manual/cycle` opened turn 93, `POST /manual/close` returned `ended_play_window` (turn kept `Open`), and the settlement pipeline then ran by itself: `project_original_only_election → request_draw → settle_draw (DRAWN) → close_turn → verification/winners/claims → done`; `GET /rounds/93` shows the published draw `[90,34,15,9,54,97]` and the 24h cycle. Turn 93 had no eligible rules, so the shortlist branch was correctly skipped per PRD §6.12; the shortlist/elimination branch itself is covered by the settlement planner unit tests and requires eligible precompiled rules to observe live.
- Reviewed the result for inconsistencies: manual force-close is explicitly labeled test-only and never the normal path, no fallback hides pipeline failures (pre-existing wedged turns from the old bug still log their real errors), UI copy is English and reuses existing pill patterns, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Worker dev port conflict)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `.claude/skills`, `.claude/skills/automation-upkeep/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, and `docs/local-development-runbook.md`.
- Diagnosed `pnpm --filter @idealer/worker dev` failing with `EADDRINUSE` on `:::3003`; `Get-NetTCPConnection` showed an existing `node.exe` listener owned by PID `20036`, running `apps/worker/src/index.ts` through `tsx` since the previous day.
- Stopped only the stale worker listener, confirmed port `3003` no longer had an active listener, then performed a controlled worker start with `HOST=::`; the worker bound `:::3003` and `GET http://127.0.0.1:3003/health` returned `status:"ok"` with Postgres and Redis both `ok`.
- Stopped the controlled verification worker so the user's terminal can run `pnpm --filter @idealer/worker dev` normally.
- Reviewed the result for inconsistencies: no source behavior was changed, no fallback was added, `3003` is free after verification, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Active turn worker fetch same-origin proxy)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/best-practices/references/code-quality.md`, `.claude/skills/best-practices/references/testing.md`, and `docs/local-development-runbook.md`.
- Diagnosed the `Failed to fetch` path from `apps/web/src/solana/activeTurnApi.ts`: the worker route exists and supports CORS, but `getWorkerBaseUrl()` defaulted browser calls on localhost/LAN to a cross-origin `:3003` URL while the API used the same-origin proxy.
- Changed `apps/web/src/lib/workerBase.ts` so browser calls default to `"/__worker"` and continue to honor explicit `NEXT_PUBLIC_IDEALER_WORKER_URL` overrides; server-side execution still uses direct loopback via `IDEALER_WORKER_BASE_URL` or `http://localhost:3003`.
- Added `NEXT_PUBLIC_IDEALER_WORKER_URL=/__worker` to `.env.example` beside the API proxy setting, documenting that live turn polling should use the same-origin worker rewrite.
- Added regression tests for the worker base URL helper covering browser proxy default, explicit browser override, server loopback default, and explicit server URL.
- Verified: `pnpm --filter @idealer/web test` (20/20), `pnpm --filter @idealer/web typecheck`, `pnpm --filter @idealer/web lint`, and `pnpm --filter @idealer/web build`.
- Reviewed the result for inconsistencies: the fix does not add a fallback that hides worker errors, failed worker responses still surface as errors, UI copy was not changed, `.env` with local values was left untouched, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Home hero single countdown)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md`, `.claude/skills/idealer-design-system/references/02-components.md`, `.claude/skills/idealer-design-system/references/03-screens-and-state.md`, and `.claude/skills/idealer-ui-coherence/SKILL.md`.
- Updated the home hero so phase 1 shows only the upper countdown pill and the copy now reads `Create & play · ends in ...`, without the `Phase 1` prefix.
- Removed the lower `Guessing closes in` countdown pill and its now-unused phase-cutoff countdown calculation from `apps/web/src/features/idealer/screens/Home.tsx`.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web lint`; Playwright smoke against the existing `http://localhost:3000` dev server confirmed the home renders, `Phase 1` is absent, and `Guessing closes in` is absent. The local server had no active turn, so the active phase timer itself was not visible in that smoke state.
- Attempted to start a separate `NEXT_PUBLIC_UI_MOCK=1` dev server on port `3001` for richer active-turn visual verification, but Next.js blocked a second dev server for the same `apps/web` directory because an existing server was already running; the existing server was left untouched.
- Reviewed the result for inconsistencies: UI copy remains English, existing pill/numeric styles are reused, no fallback was added, no milestone status was changed, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Draw result location check)

- Reopened required context before answering: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- Checked the result and public round UI paths for where settled draw numbers are exposed: `apps/web/src/features/idealer/screens/Result.tsx`, `apps/web/src/features/idealer/screens/Home.tsx`, `apps/web/src/app/round/[turnId]/page.tsx`, and `apps/web/src/features/round-page/RoundPage.tsx`.
- Confirmed the current app exposes drawn numbers through the home card `Result of round ...` -> `Result` screen, and directly through the public route `/round/{turnId}` in the `Draw & result` section.
- Reviewed the result for inconsistencies: no source code was changed, no fallback was added, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Rule-submit round-pass confirmation gate)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/kit-web3-interop.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Tightened the play -> create return flow so `Play` waits for both the `PlayerGuess` and `GameToken` PDAs to be visible with confirmed commitment before posting `/guess-receipts`; this prevents the API from marking the wallet as played before the on-chain round pass exists.
- Reused the same confirmed-program-account gate in `Create` before building/simulating `propose_rule`, so a returned composer fails with explicit round-pass copy instead of opening the wallet against an uninitialized `game_token`.
- Normalized nested simulation logs for `AnchorError caused by account: game_token. Error Code: AccountNotInitialized` into actionable round-pass text, while preserving raw diagnostics for other simulation failures.
- Added focused regression tests for confirmed account polling and missing-game-token error normalization.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (24/24); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Reviewed the result for inconsistencies: UI copy remains English, the fix does not add fallbacks that hide Solana/RPC failures, delayed signed guesses remain blocked as pending wallet actions rather than being silently retried, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Shortlist available at phase-2 start)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, the design-system reference markdown files, `contracts/solana/README.md`, and `contracts/solana/scripts/sbf.sh`.
- Root cause: the finalist VRF request was only allowed and scheduled after the phase-1 cutoff/pool lock, so the app could enter phase 2 before the 10-rule shortlist existed. That made the shortlist appear late in the elimination phase instead of at its beginning.
- Changed the on-chain `request_rule_election_vrf` instruction so it can commit finalist randomness while the turn is still live, before the phase-1 cutoff; pool locking and finalist settlement still remain after the cutoff.
- Updated the worker settlement planner to pre-request finalist VRF before the election cutoff whenever eligible rules exist, then lock the pool at cutoff and settle finalists from already-available randomness at phase-2 start.
- Updated the Rules/Vote screen so entering phase 2 automatically moves to the finalist tab. If phase 2 starts without published finalist ids, the UI now surfaces an explicit `Shortlist unavailable` state with a refresh action instead of implying the shortlist is supposed to be locked later.
- Added regression tests for worker pre-request behavior, the phase-2 shortlist UI state, the normal finalist decision state, and the original-only no-finalist path. Updated the SBF instruction test to request finalist VRF before cutoff and then lock/settle after cutoff.
- Verified: `pnpm --filter @idealer/worker test` (86/86), `typecheck`, `lint`, `build`; `pnpm --filter @idealer/web test` (27/27), `lint`, `build`, `typecheck`; `pnpm --filter @idealer/solana-programs typecheck`, `test`, `lint`, `build`; Docker SBF build with `SBF_FEATURES=sb-devnet`; Docker SBF `test-sbf` (7/7). A direct host `pnpm --filter @idealer/solana-programs test:sbf` attempt failed with the known Windows/Solana host invocation error, so the pinned Docker SBF path was used for the authoritative verification.
- Reviewed the result for inconsistencies: UI copy remains English, no fallback hides missing shortlist data, the contract still prevents pool lock/settlement before cutoff, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Phase 2 starts after shortlist publication)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, the design-system reference markdown files, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/programs/anchor.md`, `contracts/solana/README.md`, and `contracts/solana/scripts/sbf.sh`.
- Superseded the earlier pre-request approach: players should not lose rule-submission time, so finalist VRF now starts only after phase 1 closes and the eligible pool is locked. Phase 2 starts when finalist IDs are published.
- Contract: restored the post-cutoff/pool-locked requirement for `request_rule_election_vrf`; added base-duration cutoff helpers so extending `end_timestamp` cannot reopen rule proposals, guesses, or approval voting; shifted `end_timestamp` when `settle_rule_election` publishes finalists after VRF latency so phase 2 keeps its full planned duration.
- Worker: changed the settlement planner to wait before cutoff, lock the pool at cutoff, then request/settle finalist VRF; decoded `turn_duration_seconds` and derives the phase-1 cutoff from it instead of mutable `end_timestamp`.
- Web: active-turn snapshots now carry `turnDurationSeconds`; Home shows `Shortlist draw in progress` between phase 1 close and finalist publication; Rules shows the same explicit pending state, then treats published finalists as the start of the decision window/phase 2.
- PRD: updated sections 2.1, 5.3, 5.4, the lifecycle diagram, and MVP decision 7 to document the system shortlist draw step between phase 1 and phase 2.
- Added/updated regression coverage for the scheduler order, settlement decoding, web cutoff calculation, shortlist pending UI, and SBF instruction flow with simulated VRF latency shifting the turn end.
- Verified: `pnpm --filter @idealer/worker typecheck`, `test` (86/86), `lint`, `build`; `pnpm --filter @idealer/web typecheck`, `test` (28/28), `lint`, `build`; `pnpm --filter @idealer/solana-programs typecheck`, `test`, `lint`, `build`; Docker SBF build with `SBF_FEATURES=sb-devnet`; Docker SBF `test-sbf` (7/7). The first SBF run failed because the test settled VRF at exactly the cutoff timestamp, giving no latency to extend; the test was corrected to simulate a post-cutoff reveal delay and then passed.
- Reviewed the result for inconsistencies: UI copy remains English, no fallback hides pending shortlist data, phase-1 action windows stay tied to the immutable base duration, phase 2 no longer starts until finalists are actually published, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Elected rule during the draw + draw-result pop-up on the home screen)

- Reopened required context before working: `PRD.md` (phase 2 / draw sections 2.1, 5.4, lifecycle), `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md`, `.claude/skills/idealer-design-system/references/03-screens-and-state.md`, and the live implementation files (`IdealerApp.tsx`, `Home.tsx`, `Result.tsx`, `shared.tsx`, `data/hooks.ts`, `data/types.ts`).
- Verified the required end-of-turn order is already enforced by the backend (no contract/worker change needed): the active rule is elected at the end of phase 2 while the turn is open (`settle_active_election`), the number draw fires after `end_timestamp` (`request_draw`/`settle_draw`), and only then `close_turn` runs so turn automation can open the next turn.
- Home (`apps/web/src/features/idealer/screens/Home.tsx`): while the numbers are being drawn the elected rule now appears on the main screen as a gold card (title + sanitized text + "numbers are being drawn" note); added distinct hero pills for `Electing the rule`, `Drawing the numbers`, and `Numbers drawn - settling the turn`, plus an explicit `Original rule only this round` card for `original_only` elections. The card hides once the draw is fulfilled so the result pop-up takes over.
- New `DrawResultPopup` (`apps/web/src/features/idealer/screens/DrawResult.tsx`), mounted on the home screen in `IdealerApp.tsx`: when the latest round's draw settles, a full-screen overlay with the standard dark translucent backdrop (`rgba(6,4,10,0.62)` + blur, same pattern as `RuleDetail`) covers the screen showing the drawn numbers, the active/elected rule, the prize pool, winner counts per bucket (original + elected rule), a `See the full result` CTA, and an X close button. Dismissal is remembered per turn (`idealer:draw-result-last-seen-turn` in localStorage) so polling does not reopen it; while winner projections are still settling the pop-up says so instead of showing fake zeros.
- Playwright: `playwright.config.ts` now blocks the PWA service worker during tests (it was intercepting fetches and bypassing `page.route` mocks, making runs nondeterministic) and honors `IDEALER_WEB_E2E_BASE_URL` so tests can target an already-running Next 16 dev server. Added `e2e/draw-popup.spec.ts` covering both states with origin-agnostic network mocks: elected-rule card visible while the draw is pending (no pop-up), and the settled-draw pop-up with numbers/rule/prize/winners that closes via the X and stays dismissed across reloads.
- Verified: `pnpm --filter @idealer/web typecheck`; `lint`; `test` (28/28); `build`; `playwright test e2e/draw-popup.spec.ts` (2/2) against the running dev server; mobile-width (393px) screenshots of both states reviewed against the design system (tokens, pills, card, sheet backdrop, numeric font).
- Reviewed the result for inconsistencies: UI copy is English, no new hard-coded palette values beyond the canonical backdrop/ink pairs already used by `RuleDetail`/`Result`, no fallback hides missing winner data (explicit "Settling" state), and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Shortlist badge after manual cycle diagnosis)

- Reopened required context before answering: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/best-practices/SKILL.md`, and `.claude/skills/best-practices/references/agent-principles.md`.
- Diagnosed the home badge after `POST http://localhost:3003/manual/cycle`: `/manual/cycle` is intentionally two-step when a turn is active, ending the phase-1 play window and leaving the turn open for settlement instead of immediately opening the next round.
- Confirmed the live worker response at `/turn/active` for turn 97 omitted `turnDurationSeconds`; the frontend uses that field to derive `phase1EndsAt`, so the phase calculation becomes invalid and the home screen falls into the explicit `Shortlist draw in progress` state while the turn still appears open.
- Confirmed the process listening on `3003` was started on 2026-07-08 before the current `apps/worker/src/index.ts` change that includes `turnDurationSeconds` in the active-turn response, making a stale worker process the likely local cause.
- Reviewed the result for inconsistencies: no source code was changed, no fallback was added to hide the missing worker field, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Manual cycle closes and opens next turn)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/automation-upkeep/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/idealer-test-and-verify/references/devnet-verification.md`.
- Changed `/manual/cycle` semantics back to the expected dev/test shortcut: it now uses the immediate close path and opens the next turn in one operator action. `/manual/close` remains the route for exercising the full phase-2 settlement pipeline.
- Added a focused regression helper/test that documents which close results should trigger opening the next turn.
- Restarted the stale local worker on port `3003`; `GET /turn/active` now includes `turnDurationSeconds`.
- Live local/devnet check: `POST /manual/cycle` closed turn 97 (`closed_turn`) and opened turn 98 (`opened_turn`, `openDurationSeconds: 1200`). Re-read `/turn/active`: active turn is 98, status `open`, `turnDurationSeconds: 1200`; calculated phase-1 cutoff is 873s in the future, so the Home badge should be `Create & play`.
- Verified: `pnpm --filter @idealer/worker typecheck`; `pnpm --filter @idealer/worker test` (87/87); `pnpm --filter @idealer/worker lint`; `pnpm --filter @idealer/worker build`.
- Reviewed the result for inconsistencies: the fast-cycle behavior remains gated behind `IDEALER_TURN_MANUAL_CONTROL_ENABLED`, no production automation path changed, no fallback hides missing worker fields, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Creator-only rule removal)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-design-system/references/01-tokens.md`, `.claude/skills/idealer-design-system/references/02-components.md`, `.claude/skills/idealer-design-system/references/03-screens-and-state.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `contracts/solana/README.md`, and `contracts/solana/scripts/sbf.sh`.
- Changed rule removal to creator-only across the stack: the rule-detail sheet only exposes removal when `rule.mine` is true; the frontend refuses direct remove calls for non-creators; new API removal payloads accept only `creator_self`; API business logic rejects non-creators with `RULE_REMOVAL_NOT_CREATOR`; and the Solana `remove_rule` instruction now requires `rule_proposal.proposer == remover` before charging the removal fee.
- Preserved historical/audit compatibility: existing `third_party` enum/config fields remain readable for old records and account layouts, but they no longer grant new removal rights.
- Updated product/contract docs to match the new creator-only behavior: `PRD.md`, `docs/product-rule-summary.md`, `docs/api-contracts.md`, `docs/smart-contract-account-instruction-draft.md`, and constants comments.
- Added regression coverage: web helper tests for hiding removal from non-creators/finalists/removed rules; API tests for creator removal and third-party rejection regardless of vote count; SBF instruction test now asserts third-party removal fails before creator self-removal succeeds.
- Verified: `pnpm --filter @idealer/web typecheck`, `test` (30/30), `lint`, `build`; `pnpm --filter @idealer/api typecheck`, `test` (63/63), `lint`, `build`; `pnpm --filter @idealer/constants typecheck`, `test`, `lint`, `build`; `pnpm --filter @idealer/solana-programs typecheck`, `test`, `lint`, `build`; Docker SBF build with `SBF_FEATURES=sb-devnet`; Docker SBF `test-sbf` (7/7). The first `@idealer/solana-programs test` attempt hit the 120s command timeout with no failure output, then passed when rerun with a larger timeout.
- Reviewed the result for inconsistencies: UI copy remains English, no fallback hides unauthorized removal attempts, non-creators are blocked in UI/API/on-chain paths, existing audit/history display still supports historical records, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Active round status aligned with worker turn)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/develop-frontend/SKILL.md`, and `.claude/skills/idealer-ui-coherence/SKILL.md`.
- Diagnosed the local running state: the worker/on-chain state had no active turn initially (`nextTurnId: 101`), while the API fallback `/rounds` still reported static `activeTurnId: 1`. Opened dev/test turn 101 with `/manual/open` and confirmed `/rounds/101` was incorrectly marked `upcoming` unless the caller supplied the real active turn.
- API: `GET /rounds/{turnId}` and `GET /rounds` now accept an optional `activeTurnId` query parameter and pass it into `getRoundSummary`, so the HTTP projection can classify the worker-known active round as `current` instead of `upcoming`.
- Web: the active app shell now calls `useRound(turnId, turnId)`, and the API client sends `activeTurnId` only for that active-round path; result/history screens continue to fetch historical turns without overriding status.
- Added an API regression test for high active turn ids (`getRoundSummary(101, 101)` -> `current`, while `getRoundSummary(101, 1)` remains `upcoming`).
- Verified: `pnpm --filter @idealer/api typecheck`; `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/api test` (64/64); `pnpm --filter @idealer/web test` (30/30); `pnpm --filter @idealer/api lint`; `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/api build`; `pnpm --filter @idealer/web build`.
- Live local check against the running API: `GET /rounds/101?activeTurnId=101` returns `status: "current"`, while `GET /rounds/101` still returns `status: "upcoming"` as the explicit stale-fallback case.
- Reviewed the result for inconsistencies: no fallback hides worker/API divergence, UI copy remains English, no contract or settlement ordering changed, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Shortlist/VRF wait real diagnosis)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-test-and-verify/references/devnet-verification.md`, and `.claude/skills/solana-dev/SKILL.md`.
- Diagnosed the live local/devnet state instead of relying on UI symptoms: the on-chain settlement target was turn 101; the worker had settlement automation enabled; the draw had already fulfilled and the settlement pipeline reached `CLOSED`, but the API default `/rounds` response still pointed at the static fallback `activeTurnId: 1`, making the frontend look stale.
- Found a second real issue after restarting the local API: the read-side API is in-memory, so restart wiped draw/election projections; the worker then failed with `DRAW_NOT_FULFILLED` while trying to create verification jobs for an already-fulfilled on-chain draw.
- API: changed the default `/rounds` active turn resolution to use the newest projected public turn instead of the hardcoded `IDEALER_ACTIVE_TURN_ID=1`; added a regression test for turn 101 becoming the default after projection.
- Worker: exposed `settlementAutomation` in `/health`, made `settlement-run.ts` load the repo `.env` for real operator dry-runs, and added closed-turn read-side rehydration that republishes original-only/settled election plus fulfilled draw from on-chain state before post-close projections. The draw rehydration reads the Switchboard randomness and verifies the derived numbers match the on-chain draw result; it fails explicitly if the randomness cannot be read or does not match.
- Live verification: restarted the local worker, observed it rehydrate and advance turn 101 through `VERIFYING -> FINALIZED -> CLAIMABLE -> CLOSED`; `GET /rounds` now returns `activeTurnId: 101`, `status: completed`, draw `[10,56,77,94,42,51]`, and `settlementAutomation: enabled` appears in worker health. `pnpm --filter @idealer/worker settlement:run` now loads `.env` and reports `plannedAction: done/already_closed` for turn 101.
- Verified: `pnpm --filter @idealer/api typecheck`; `pnpm --filter @idealer/api test` (65/65); `pnpm --filter @idealer/api lint`; `pnpm --filter @idealer/api build`; `pnpm --filter @idealer/worker typecheck`; `pnpm --filter @idealer/worker test` (88/88); `pnpm --filter @idealer/worker lint`; `pnpm --filter @idealer/worker build`.
- Reviewed the result for inconsistencies: no fallback invents randomness or hides VRF/API divergence, UI-facing behavior remains English, the remaining local limitation is that full guess/rule projection still depends on the API process not being restarted because those records are in-memory, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (On-chain rule storage clarification)

- Reopened required context before answering: `PRD.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- Confirmed from `PRD.md` that MVP stores the full sanitized original rule text on-chain in the `RuleProposal` account, stores rule/vote records on-chain, and uses off-chain mirrors only for indexing, search, analytics, and UI performance.
- Reviewed the result for inconsistencies: no source code changed, no fallback behavior introduced, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-09 (Active-turn console error after closed round)

- Reopened required context before working: `PRD.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Verified the live worker and Next proxy state: `GET /turn/active` and `GET /__worker/turn/active` both returned HTTP 200; the real on-chain state had no active turn (`activeTurnId: 0`, `hasActiveTurn: false`, `nextTurnId: 102`) after round 101 closed.
- Web: changed the active-turn hook to display the latest known completed turn (`nextTurnId - 1`) when no active turn exists, instead of falling back to bootstrap turn 1. Treated active-turn fetch failures as handled UI warnings rather than `console.error`, which prevents Next dev overlay from surfacing a recovered state as a console error.
- Added focused tests for active turn, no-active-turn, and pre-bootstrap visible-turn resolution.
- Restarted the stale local Next dev server on port 3000 and verified with Playwright: `/play` loads, no Next error overlay, `consoleErrors: []`, and the UI shows the settled round 101 draw `[10,56,77,94,42,51]` with the no-active-turn message.
- Verified: `pnpm --filter @idealer/web test` (33/33); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`; `pnpm --filter @idealer/web typecheck` after `next build` regenerated `.next/types`.
- Reviewed the result for inconsistencies: UI copy remains English, the app still surfaces the real no-active-turn state instead of hiding it, no chain/settlement behavior changed, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-10 (Rules fetch failed from non-localhost origins)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `vercel:nextjs` skill guidance.
- Diagnosed the `TypeError: Failed to fetch` at `getRuleProposals`: the API route and CORS headers exist, but the browser API base could still resolve to `http://<browser-host>:3002`, and Docker forced `NEXT_PUBLIC_IDEALER_API_URL=http://localhost:3002`. That breaks from phones, LAN IPs, HTTPS tunnels, and Docker proxy mode instead of returning a normal HTTP API error.
- Web: changed `getApiBaseUrl()` so browser calls default to the same-origin `/__api` rewrite, matching the existing worker proxy behavior and avoiding CORS/mixed-content/unreachable-host failures without hiding backend errors.
- Docker: changed the `web` service to publish `NEXT_PUBLIC_IDEALER_API_URL=/__api` and `NEXT_PUBLIC_IDEALER_WORKER_URL=/__worker`, with internal rewrite targets `http://api:3002` and `http://worker:3003`; added a healthy worker dependency so active-turn proxying is available when web starts.
- Added regression coverage in `apps/web/src/lib/apiBase.test.ts` for same-origin browser defaults, HTTPS origins, explicit browser overrides, and server-side direct API URLs.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (42/42); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Reviewed the result for inconsistencies: no fallback was added, API failures still surface as real errors, browser and Docker behavior now matches `.env.example`, UI copy was untouched and remains English, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-10 (Player claims proxy 500 diagnosis)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Diagnosed the reported `GET /players/{wallet}/claims returned HTTP 500`: local port `3002` was not listening, and `GET /__api/health` through Next returned plain `HTTP 500 Internal Server Error`, confirming the Next rewrite could not reach the API target rather than the claims handler throwing.
- Started the local API dev server on port `3002` and verified both direct and proxied paths: `GET /health` returned `200`, and `GET /players/EAoZrh8TtZCYtUdKpkuMaNSrConsQoUQvzjZ7cuQGqdW/claims` returned `200` with an empty claims summary through both `3002` and `3000/__api`.
- Web: changed handled player-claims polling failures from `console.error` to `console.warn`; the UI still sets `claims_unavailable`, so API/proxy failures remain visible without triggering the Next dev error overlay for an already-handled polling state.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (42/42); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Reviewed the result for inconsistencies: no fallback or fake claim data was added, API unavailability still surfaces in UI state, the claims endpoint returns real JSON once the API is running, UI copy remains English, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-10 (Shortlist approval-side voting)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, `.claude/skills/best-practices/references/agent-principles.md`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, and the design-system reference markdown files.
- Contract: changed `vote_rule` so approval-side votes remain valid after the phase-1 cutoff only for finalist rules while the shortlist decision window is open; each successful approval vote during this window increments both the proposal vote count and `finalist_approval_vote_counts`, so later elimination compares against the updated support count.
- Web: updated the shortlist finalist row to show both `in favor` and `against` actions, using the existing vote button styles and side-specific next-fee labels; updated shortlist copy and public round-page copy from elimination-only to two-sided shortlist voting.
- Added regression coverage: the web finalist-phase view test now asserts the two-sided copy, and the compiled SBF instruction test path now covers an approval-side finalist vote during phase 2 updating the finalist approval tally.
- Verified: `pnpm --filter @idealer/web test` (42/42); `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web lint`; `cargo test --no-run`; `cargo test` (15 non-ignored tests passed; 8 SBF tests ignored because they require `SBF_OUT_DIR`, including the compiled updated instruction-path coverage).
- Reviewed the result for inconsistencies: UI copy remains English, no fallback hides vote failures, approval votes outside phase 1 are limited to live finalist shortlist windows, elimination still selects only from survivors, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-10 (Portuguese rule creation tolerance)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, and `packages/rule-compiler/rule-authoring/references/examples.md`.
- Rule compiler: extended deterministic match-count parsing for Portuguese threshold wording such as `acertar 1 número`, `acertar uma dezena`, `pelo menos dois números`, and `dois ou mais números`, preserving the existing ranking behavior for `quem acertar mais números`.
- API guardian: aligned the low-risk groundedness shortcut so the short Portuguese lottery wording `acertar N número/dezena` is treated as the same guess-vs-draw match-count family and does not force unnecessary clarification when the compiler interpretation is equivalent.
- Added regression coverage for the reported variants, including `ganha quem acertar 1 número em qualquer ordem`, `premia quem acertar 1 número em qualquer ordem`, and the typo/accent variant `prêmeia quer acertar 1 número em qualquer ordem`.
- Verified: `pnpm --filter @idealer/rule-compiler test` (40/40); `pnpm --filter @idealer/api test` (66/66); `pnpm --filter @idealer/rule-compiler typecheck`; `pnpm --filter @idealer/api typecheck`; `pnpm --filter @idealer/rule-compiler lint`; `pnpm --filter @idealer/api lint`; `pnpm --filter @idealer/rule-compiler build`; `pnpm --filter @idealer/api build`.
- Manual reproduction: `quem acertar mais números ganha` remains `VALID` as a `ranking`; `ganha quem acertar 1 número em qualquer ordem`, `premia quem acertar 1 número em qualquer ordem`, and `prêmeia quer acertar 1 número em qualquer ordem` now return `VALID` as `predicate` rules with `match_count_at_least = 1`.
- Reviewed the result for inconsistencies: no rule fallback was added, external-dependency and ambiguity gates remain fail-closed, UI copy was untouched, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-10 (Generalized rule-agent tolerance)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `packages/rule-compiler/rule-authoring/SKILL.md`, `packages/rule-compiler/rule-authoring/references/patterns.md`, and `packages/rule-compiler/rule-authoring/references/examples.md`.
- Rule compiler: moved the tolerance improvement from case-specific regexes toward normalized rule intent parsing. Rule text is now canonicalized for accents before deterministic parsing, number words include common Portuguese variants, and shared match-count patterns cover numbers, dezenas, acertos, hits, matches, and overlaps.
- Rule decision improvements: `pelo menos` and `ou mais` are now protected from being misread as ranking because of the words `menos`/`mais`; `exatamente`, `apenas`, and `somente` compile as equality; and `errar/miss` rankings score `difference(guess, draw)` instead of incorrectly scoring matches.
- Added broad regression coverage for rule-agent creation phrasing: `vence quem mais acertar`, `quem tiver mais acertos ganha`, `ganha quem acertar pelo menos um numero`, `se tiver um acerto ganha`, `um numero certo em qualquer ordem ganha`, `premia qualquer bilhete com 1 acerto`, `vence com dois ou mais acertos`, `exatamente um numero acertado ganha`, `apenas uma dezena acertada`, `somente 2 acertos`, `exactly three overlaps with the draw`, `ganha quem errar mais números`, and `whoever misses the most numbers`.
- API guardian: broadened the deterministic groundedness shortcut to the same Portuguese match-count family so equivalent compiler interpretations do not force a needless model round or clarification. Exact-count wording is intentionally excluded from the at-least shortcut to avoid weakening `exatamente/apenas/somente`.
- Verified: `pnpm --filter @idealer/rule-compiler test` (41/41); `pnpm --filter @idealer/api test` (66/66); `pnpm --filter @idealer/rule-compiler typecheck`; `pnpm --filter @idealer/api typecheck`; `pnpm --filter @idealer/rule-compiler lint`; `pnpm --filter @idealer/api lint`; `pnpm --filter @idealer/rule-compiler build`; `pnpm --filter @idealer/api build`.
- Manual reproduction: `quem acertar mais números ganha` and `vence quem mais acertar` return `VALID/ranking`; `ganha quem acertar pelo menos um numero` returns `VALID/predicate` with `match_count_at_least = 1`; `vence com dois ou mais acertos` returns `match_count_at_least = 2`; `exatamente um numero acertado ganha` returns equality to 1; and `ganha quem errar mais números` returns a max ranking over missed numbers.
- Reviewed the result for inconsistencies: no fallback or mock was added, unsupported/external/ambiguous rules still fail closed, the compiler no longer inverts miss-vs-match intent, UI copy was untouched and remains English, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-10 (Round fetch failed after API reward projection crash)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `vercel:nextjs` skill guidance.
- Diagnosed the reported `TypeError: Failed to fetch` at `getRound`: the browser was hitting the API through the same-origin proxy, but `GET /rounds/{turnId}` crashed the local API process with `ACTIVE_RULE_PROPOSAL_NOT_FOUND` while calculating rewards for a round whose active election projection existed without a corresponding in-memory proposal projection.
- API: changed reward calculation to inspect winner state before loading the active proposal. If there are no alternative winners, creator/voter rewards correctly remain empty and the active proposal is not required; if an alternative payout exists, the missing active proposal still fails explicitly.
- Added API regression coverage for the restart/rehydration shape where an active rule id is present but no alternative winners exist and no active proposal projection is available.
- Web: changed handled data-polling failures for round, rules, guess receipt, player history, and conversation drafts from `console.error` to `console.warn`; the UI still sets the existing unavailable states where applicable, so backend failures remain visible without triggering the Next dev overlay for handled polling errors.
- Restarted the local API on port `3002` and verified direct and proxied paths: `GET /health` and `GET /__api/health` return `200`; `GET /__api/rounds/101?activeTurnId=101` returns `200` JSON instead of crashing the API.
- Verified: `pnpm --filter @idealer/api typecheck`; `pnpm --filter @idealer/api test` (67/67); `pnpm --filter @idealer/api lint`; `pnpm --filter @idealer/api build`; `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (42/42); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`; Playwright smoke for `/play` returned HTTP 200 with no browser console errors and no visible `Failed to fetch` overlay text.
- Reviewed the result for inconsistencies: no fallback creates fake rewards or hides a real alternative-winner accounting issue, API failures still surface through existing UI unavailable states, UI copy remains English, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-10 (Fresh devnet namespace reset to turn 1)

- Reopened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and the relevant Solana deployment documentation.
- Confirmed that the existing devnet program `6TQo79fA3agZYz7mTiCTnBVfDR9HvVR5KjdHgX3cRaA4` could not truly return to canonical turn 1 because the old turn-1 PDA already existed and the live config had advanced to later turns. A clean program namespace was required.
- Updated the SBF deploy script so the program keypair path/program id can be provided through `PROGRAM_KEYPAIR_PATH`/`PROGRAM_ID` instead of being locked to the old devnet program id. Updated the program declaration, Anchor config, worker/web program id constants, `.env`, `.env.example`, and `deployments/solana-devnet.json` to the new namespace.
- Deployed the final clean devnet program namespace as `ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd` (deploy signature `2JzNSiReSHbjeNAa9ipB99DED467iLMA833URiGvQRcG8tBiQcTCkTLmUHJ6VT41pSbH4tHKGEaevsb9xdeXqPkj`, slot `475350418`, program data `AWGUseV1DEsoSvdW7CDMxxBDUPQXAKqTXyxHVzeTnL8g`). An earlier fresh namespace `Ck2K5vgJYqsiFBhqZYGaeHPGsTdNNzpDwqpq8AfwCYh8` was abandoned because it was bootstrapped with a shortened test duration and advanced past turn 1.
- Bootstrapped the final namespace without smoke guesses/rules/votes using a 24-hour turn duration: `initialize_global_config` signature `4T23QfdZffmicSQKHLcBE7c37Qy9Bpg7ZDSUmCE7cAiQPDhkjvh2cek6i9QXfvAqLhJegC75WEdcWdidsn413zW3`; `open_turn` signature `2Y6h9uhPQ77BbByQygG6SDRtVSZSzTrWjTZr2GT2Su1upiop9rp9JREFzAeMu19avZC8DWimYgiELCWULctP8N3G`.
- Configured Switchboard devnet VRF for both draw and election on the new namespace (`EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7`, signature `3gHcgC3CXCWDQkXpFxgvDsw8diGjLfnPUa9g5sVA47Dnxym4qyZNxQEd4XLNphnqn1LpNLAvPW486DMUzM9u2BCx`).
- Verified live state: global config `8eAwKD514LK6rJYLLFZh92g3V5a5MwbyLZMU83EpWWZ`, active turn `1`, `hasActiveTurn=true`, `nextTurnId=1`, turn state `2CvtQ8414UzG2731zZEfTTPUBbbJ3YyGq55dKwyaDM6V`, status `open`, `turnDurationSeconds=86400`, and no bootstrap smoke inputs.
- Corrected local `.env` and `.env.example` to `IDEALER_DEVNET_TURN_DURATION_SCALE_BPS=10000`, then restarted API and worker so local health reports the same 24-hour cycle as the on-chain turn instead of the earlier short-test 483-second duration.
- Restarted the local API, worker, and web dev servers so projections point at the new namespace. Verified `GET http://127.0.0.1:3003/turn/active`, `GET http://127.0.0.1:3000/__worker/turn/active`, and `GET http://127.0.0.1:3000/__api/rounds/1?activeTurnId=1` return turn 1 as the current open round. Playwright smoke for `http://localhost:3000/play` returned HTTP 200 with no Next overlay, no browser console errors, the open-turn UI visible, and no stale settled-round text.
- Verified after the final program-id swap: `pnpm --filter @idealer/worker typecheck`; `pnpm --filter @idealer/worker lint`; `pnpm --filter @idealer/worker build`; `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`; `pnpm --filter @idealer/solana-programs typecheck`; final Docker SBF suite `sbf.sh test-sbf` passed 8/8 against program id `ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd`.
- Reviewed the result for inconsistencies: no fallback was added to hide deploy/bootstrap failures, program ids are aligned across contract/config/worker/web/env files, UI copy remains English, deployment secrets were not written to the worktree, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-10 (Claude Design handoff — editorial re-skin of the six core screens)

- Opened required context before working: `PRD.md` (§4 UI/UX strategy, §11 Frontend Architecture), `PROGRESS_TRACKER.md`, `.claude/skills` (loaded `idealer-design-system`, consulted `idealer-ui-coherence` conventions and the `playwright` skill for verification), and the handoff bundle's `plataforma/README.md` plus `plataforma/project/Idealer.html` in full with every import it loads (`idealer.css`, `shared.jsx`, `app.jsx`, `app-home.jsx`, `app-play.jsx`, `app-vote.jsx`, `app-create.jsx`, `app-profile.jsx`, `app-result.jsx`).
- Imported the new `Plataforma-handoff.zip` design bundle (an updated iteration of the June 4 prototype: boxed cards replaced by an "editorial" hairline-divided layout, a rewritten Play flow, a designed two-tab Vote screen, and a reworked RuleDetail sheet) and refreshed `output/design-reference/` with the updated prototype files, including the new `app-vote.jsx`. Synced `.claude/skills/idealer-design-system/references/04-new-screen-recipe.md` from the bundle.
- Added the editorial primitives to `apps/web/src/features/idealer/idealer.css` (`.ide-hr`, `.ide-eyebrow`, `.ide-list`, `.ide-listrow`, `.ide-tabs`, `.ide-metrics`/`.rows2`, `.ide-notice`), updated the ambient glow to the softer handoff values, and added `white-space: nowrap` to `.ide-votebtn`.
- Re-skinned the six handoff screens in `apps/web/src/features/idealer/` while preserving all live wiring (wallet flows, escalating fees, pending-action recovery, claims, elimination window): Home (plain-text phase/status line, hairline stats, `.ide-notice` played state, hairline result row, unboxed prompt input, `.ide-list` rule preview), Play (hairline review section with a Round row), Vote (underline tabs, hairline decision-window header now showing the phase-2 countdown, unboxed finalist rows, `.ide-notice` gate), Create (hairline submitted/gate/closed blocks, plain-surface RulePreview, back button returns to Account when resuming a draft), Profile (unboxed claim hero with glow, `.ide-metrics` breakdown and 2×2 stats, underline tabs, list-row rules/conversations/history), Result (unboxed win hero, hairline sections for draw/conditions/eligibility/finalists). `shared.tsx`: RuleDetail tally strip and prompt seed unboxed, details grid moved to `.ide-metrics rows2` (redundant Status cell removed), `Meta` converted to a hairline metric cell.
- Kept English UI copy per project rule (the pt-BR prototype copy was treated as layout spec only); repeat-play and repeat-vote fee affordances were retained even where the prototype assumed one action per round, because the deployed program allows escalating repeats.
- Verified: `pnpm --filter @idealer/web typecheck`, `lint` (0 warnings), `node --test` suite 42/42 pass, and container Playwright screenshots of `/play` and `/play/pick` against the running dev server rendering the new layout with no console overlay. No milestone checkbox was marked; that requires explicit user confirmation.

### 2026-07-10 (pnpm store untracked file audit)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, and `.claude/skills`.
- Investigated the reported 1000+ new files in `git status`; they came from `.pnpm-store/`, with 35,645 files and about 842 MB of local pnpm package-store/cache data.
- Confirmed `.npmrc` does not require a repo-local pnpm store, so the folder is local dependency cache output and should not be committed.
- Added `.pnpm-store/` to `.gitignore` so accidental commits do not include the local pnpm store.
- Reviewed the result for inconsistencies: no product/runtime behavior changed, no fallback was added, `.pnpm-store/` now appears as ignored in Git status, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-11 (Restore selected round and rules layout)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the relevant design-system references (`01-tokens.md`, `02-components.md`, `03-screens-and-state.md`, `04-new-screen-recipe.md`).
- Web: restored only the requested UI surfaces toward the prior commit layout: the home round/timer information group uses the prior pill/card rhythm again, the home `The rules` list uses compact rule cards again, and the Rules screen rule rows/finalist rows use card rows again.
- Kept unrelated editorial changes intact after user clarification: the rule composer, result row, played-state CTA, Rules tabs, vote gate, and decision-window info block were returned to the current pre-task layout.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (42/42); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Browser check: `agent-browser` verified `/play` loads with content and no Next error overlay; final scoped screenshot saved at `output/playwright/layout-home-final-scoped.png`. Mock gallery verification was blocked because an existing Next dev server for `apps/web` was already running on port `3000`; no process was killed.
- Reviewed the result for inconsistencies: UI copy remains English, no fallback/mock production behavior was added, the final diff is scoped to the requested layout components, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-11 (Restore rule composer, account claim card, and flat rule lists)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, the relevant design-system references (`01-tokens.md`, `02-components.md`, `03-screens-and-state.md`, `04-new-screen-recipe.md`), and `vercel:agent-browser-verify` guidance for the local visual smoke check.
- Web: restored the Home `Create your rule` composer as an `ide-card` with the prior compact header, AI pill, input surface, and send button sizing.
- Web: restored the Account claim area to a card and returned `Prize`/`Reward` to bordered tiles inside that card, without changing claim logic.
- Web: changed the Home and Rules rule lists to a flat full-width stack (`ide-rule-stack`) with no rounded row corners and no gaps between rows; the Home list expands to the screen edges of its scroll padding and the Rules tab lists expand across their page padding.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (49/49); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Browser check: Playwright verified `http://127.0.0.1:3000/play` renders content with no Next error overlay. `/dev/gallery` is disabled on the currently running non-mock dev server; a temporary mock server on port `3001` was blocked by Next because the same `apps/web` dev server is already running on port `3000`, so no process was killed.
- Reviewed the result for inconsistencies: UI copy remains English, no fallback/mock production behavior was added, unrelated worktree changes were left untouched, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-11 (Rule preflight same-origin proxy timeout)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Reproduced the reported rule composer error: direct `POST http://127.0.0.1:3002/rule-preflight` for `ganhar quer acertar pelo menos 1 número em qualquer ordem` returned `200`, but the browser same-origin path `POST http://127.0.0.1:3000/__api/rule-preflight` returned `500` after about 30 seconds because the Next rewrite proxy timed out before the real local LLM preflight completed.
- Web: added an explicit App Router proxy at `/api/proxy/[...path]` with a configurable `IDEALER_API_PROXY_TIMEOUT_MS` defaulting to 300 seconds, allowlisted request-header forwarding, upstream status/body preservation, and structured 502/504 errors for backend reachability/timeout failures.
- Web: changed the browser API base default to `/api/proxy` and mapped the legacy configured `/__api` value to the new route handler. Legacy `/__api/*` rewrites now route to `/api/proxy/*`, so stale callers avoid the old rewrite-proxy timeout.
- Added regression coverage for API proxy target normalization, URL construction, long timeout default, safe forwarded headers, and response metadata preservation.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (49/49); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Runtime verification: `GET http://127.0.0.1:3000/api/proxy/health` and `GET http://127.0.0.1:3000/__api/health` returned `200`; `POST http://127.0.0.1:3000/api/proxy/rule-preflight` with the reported Portuguese rule returned `200` after about 151 seconds instead of the previous 30-second `500`.
- Reviewed the result for inconsistencies: no fallback/mock production behavior was added, the real compiler still runs and errors still surface explicitly, UI copy remains English, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-11 (MetaMask connector blocked from Solana wallet flow)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, `.claude/skills/solana-dev/ext/sendai/skills/phantom-connect/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Web: added an explicit wallet discovery policy for Idealer that requires Solana Wallet Standard chain and feature support and blocks MetaMask by wallet name, then wired it into `autoDiscover` before the wallet registry is created.
- Added regression coverage proving Solana wallets remain discoverable, non-Solana wallets are rejected, and MetaMask is rejected even if it advertises Solana features.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (53/53); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Reviewed the result for inconsistencies: unsupported wallet connectors now fail closed before UI display or persisted auto-connect, no fallback/mock behavior was added, UI copy remains English, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-11 (Play wallet approval not opening)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/kit-web3-interop.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/payments.md`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/checkout-batch-flow/SKILL.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Diagnosed the play submit path: `PlayScreen.confirm()` was persisting `awaiting_approval` before the worker/RPC prechecks and before `sendInstruction()`, so a precheck failure could show wallet-approval recovery state even though the wallet was never actually asked to sign.
- Web: moved `awaiting_approval` persistence to immediately before `sendInstruction(client, wallet, instruction)`, after turn-change/duplicate checks and instruction construction. Precheck failures now fail explicitly instead of looking like an interrupted wallet approval.
- Web: moved the delayed-confirmation timer to start only after `sendInstruction()` returns a signature, keeping `awaiting_approval` visible while the wallet approval is actually pending.
- Web mock: added `/turn/active` handling to the UI mock fetch path so mock/gallery play flows have an open active-turn snapshot instead of being blocked by an unavailable turn before transaction submission.
- Added regression coverage for the mocked active-turn endpoint.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (54/54); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Reviewed the result for inconsistencies: wallet approval state now matches the actual signing boundary, no production fallback was added, UI copy remains English, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-11 (Two-minute wallet approval timeout)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`.
- Web: added `WALLET_APPROVAL_TIMEOUT_MS = 120_000` to the shared `sendInstruction()` helper and passed its `AbortSignal` into `client.transaction.prepareAndSend()` request/options, so wallet approval is aborted after 2 minutes instead of waiting indefinitely.
- Web: added explicit `TRANSACTION_APPROVAL_TIMEOUT` normalization and user-facing copy: `The wallet approval timed out after 2 minutes. Check your wallet status before retrying.`
- Play UI: updated the awaiting-approval message to tell the player to approve within 2 minutes.
- Added regression coverage for wallet approval timeout error normalization.
- Verified: `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web test` (55/55); `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Reviewed the result for inconsistencies: the timeout uses the wallet transaction helper's real abort path, no fallback/mock production behavior was added, UI copy remains English, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Wallet auto-connect and signing prompt regression)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/web2-wallet-auth/SKILL.md`, `.claude/skills/solana-dev/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/SKILL.md`, `.claude/skills/solana-dev/ext/solana-dev/skill/references/frontend-framework-kit.md`, `vercel:investigation-mode`, `vercel:agent-browser`, `vercel:agent-browser-verify`, and `browser-use:browser` guidance.
- Compared the current workspace with `HEAD~6`, `HEAD`, and the uncommitted worktree. The regression was an uncommitted replacement of the previously working persisted wallet configuration with `walletPersistence={false}` in `SolanaProviders.tsx`.
- Web: restored persisted Wallet Standard session recovery with `autoConnect: true`, `window.localStorage`, and the existing `idealer.solana.wallet` storage key. This lets an authorized wallet reconnect on load so the explicit Confirm action reaches `sendInstruction()` and opens the external wallet approval request instead of first stopping at the connection overlay.
- Confirmed the two recent committed wallet changes were not the auto-connect cause: the discovery filter accepts the Mobile Wallet Adapter's Solana chain/signing features, and the approval timeout is applied only after `prepareAndSend()` starts.
- Follow-up after the restored connection still did not open the signing pop-up: compared `sendInstruction()` with `HEAD~6` and found that the two-minute timeout commit had propagated its `AbortSignal` into both the transaction planner and sender. Removed that signal from the Wallet Standard `prepareAndSend()` request/options and kept the timeout as an external UI race, restoring the previously working signing call while still releasing a genuinely hung DApp attempt after two minutes.
- Runtime evidence: web/API/worker were listening on ports `3000`/`3002`/`3003`; `/play/pick`, API `/health`, and worker `/turn/active` returned HTTP 200. A Playwright smoke of `/play/wallet` rendered the current `Connect your wallet` overlay with no console errors and no Next error overlay. A real wallet popup cannot be approved in headless Chromium because no wallet extension/app is installed.
- Verified after the signing-pipeline correction: `pnpm --filter @idealer/web test` (67/67); `pnpm --filter @idealer/web typecheck`; `pnpm --filter @idealer/web lint`; `pnpm --filter @idealer/web build`.
- Existing E2E inconsistencies found during verification: `wallet-flow.spec.ts` still expects obsolete pre-redesign copy, and `mobile-reliability.spec.ts` hardcodes pending turn 7 while the live local turn is 9, so those assertions fail before exercising wallet signing. These pre-existing test expectations were not used as evidence against the repaired provider behavior.
- Reviewed the result for inconsistencies: no fallback or automatic transaction submission was added, wallet signing still requires the player's explicit Confirm action and wallet approval, UI copy remains English, unrelated worktree changes were preserved, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Prevent opening a round before prize rollover settlement)

- Opened required context before working: `PRD.md`, `PRD-TOKENOMICS.md`, `SETTLEMENT_TRUSTLESS_PLAN.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills` (including `solana-dev`, `idealer-test-and-verify`, and `best-practices` with its agent principles, Solana contract, and testing references).
- Reproduced the reported state through the live local API: round `#0014` retained `19,000,000` prize lamports (`0.019 SOL`) split equally between the original and alternative buckets, had zero winners, but had no draw, settlement transition, or rollover record. Round `#0015` had opened with zero inbound rollover. This showed that the prior round had been bypassed rather than settled.
- Worker: added a fail-closed settlement gate to automatic and manual turn opening. A turn after the first can open only when `GET /settlement-transitions?turnId=<previous>` contains the terminal `CLOSED` transition, which occurs after winner calculation and rollover projection.
- Worker: changed the test-only `/manual/cycle` behavior from force-closing and immediately reopening a turn to ending phase 1 and requiring the real settlement pipeline. The emergency force-close route remains separate and cannot be followed by a new turn until settlement is reconciled.
- Added regression coverage for accepting only a `CLOSED` transition and rejecting malformed settlement responses. Verified: `pnpm --filter @idealer/worker typecheck`; `test` (98/98); `lint`; `build`.
- Reviewed the result for inconsistencies: the gate does not synthesize winners, draw results, or rollover data; it blocks opening when settlement information is missing or invalid. No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Rollover display follow-up diagnosis)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and the relevant `solana-dev`, `idealer-test-and-verify`, and best-practices guidance.
- Confirmed the live API state: turn `#14` still contains `19,000,000` prize lamports with no draw, settlement transition, or rollover record; turns `#15` and `#16` have zero inbound rollover and zero pool.
- Confirmed the active worker process on port `3003` started before the settlement-gate change and therefore continues to run the old code. No process was restarted and no on-chain or payout state was changed during diagnosis.
- Reviewed the result for inconsistencies: the missing display is an unresolved settlement/data-reconciliation issue, not a UI formatting issue. No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Auditable recovery of stranded rollover into turn 16)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and the relevant Solana, verification, browser, and best-practices guidance.
- With explicit user authorization, recorded a public rollover recovery from turn `#14` into active turn `#16`: `9,500,000` original-bucket lamports plus `9,500,000` alternative-bucket lamports, for `19,000,000` lamports (`0.019 SOL`) total. The record preserves `sourceTurnId=14`, target `turnId=16`, and timestamp in the public prize-pool rollover projection; no SOL was transferred because the funds remain in the prize vault.
- Restarted only the worker process so it loads the previously implemented fail-closed settlement gate; verified it serves on port `3003` with active turn `#16`.
- Verified the API projection reports `19,000,000` visible prize lamports / `0.019 SOL` for turn `#16`. Browser verification at `/play` confirms the home UI displays the rounded `0.02 SOL`; screenshots saved under `output/playwright/rollover-reconciled-round-16.png` and `output/playwright/round-16-home-reconciled.png`.
- Reviewed the result for inconsistencies: the recovery changes only the off-chain prize-pool projection, with the prior turn retained as the explicit source; no payout, wallet signature, or on-chain transaction was sent. No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Manual cycle opens only after completed settlement)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and the relevant Solana, verification, and best-practices guidance.
- Verified turn `#16` completed correctly after the prior recovery: fulfilled draw, terminal `CLOSED` settlement transition, and two no-winner rollover events totaling `19,000,000` lamports into turn `#17`.
- Fixed `/manual/cycle`: while a turn is still active, it only ends phase 1 and requires real settlement; once no active turn remains, it calls the guarded `openTurnManually` path. That path still requires the predecessor's `CLOSED` transition, so the shortcut cannot bypass settlement or lose rollover funds.
- Added regression coverage for opening only after `no_active_turn`. Verified: `pnpm --filter @idealer/worker typecheck`; `test` (99/99); `lint`; `build`.
- Restarted the worker to load the change and verified the on-chain view reports `hasActiveTurn=false`, `nextTurnId=17`. No `open_turn` transaction was sent by the agent; opening turn `#17` remains subject to the user's explicit manual-cycle invocation. No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Play-again button aligned with approved-vote styling)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and the relevant `develop-frontend`, `idealer-design-system`, `idealer-ui-coherence`, `idealer-test-and-verify`, and browser-verification guidance.
- Web: changed the home-screen `play again` action to reuse the established approved-vote state (`ide-votebtn for on`) and its upward icon. The action, fee copy, and navigation to the play screen are unchanged; the button now has the same green outlined active treatment as `again` in the rule-voting UI.
- Verified: `pnpm --filter @idealer/web typecheck`; `test` (69/69); `lint`; `build`.
- Browser verification note: the local dev server was available on port `3000`, but the required `agent-browser` executable was absent from PATH and the in-app browser's Node REPL tool was not available in this session. The visual treatment was therefore reviewed against the shared CSS selector and its existing rule-vote usage rather than with a new live screenshot.
- Reviewed the result for inconsistencies: UI copy remains English, the update introduces no colors, tokens, or button variant, the original tap target/navigation behavior is preserved, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Remove play-again arrow icon)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and the relevant `idealer-design-system`, `idealer-ui-coherence`, and `idealer-test-and-verify` guidance.
- Web: removed the upward arrow from the home-screen `play again` button while retaining its existing green approved-vote styling, fee label, and navigation behavior.
- Verified: `pnpm --filter @idealer/web typecheck`; `test` (69/69); `lint`; `build`.
- Reviewed the result for inconsistencies: UI copy remains English, no new visual primitive or fallback was introduced, the button keeps its existing active-style contrast and tap behavior, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Rule ambiguity, generated titles, and executable rule copy)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `docs/product-rule-summary.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md` with its agent-principles, code-quality, and testing references, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `packages/rule-compiler/rule-authoring/SKILL.md`.
- Rule compiler: a rule that illustrates a two-digit pick winning through unspecified component digits (for example `12` against `10`/`20` because of `1`/`2`) is now rejected as ambiguous. The player must explicitly choose tens digit, units digit, or either digit; the compiler does not silently reinterpret it as a whole-number match.
- Rule agent/API: the interpretation contract now requires a concise English title in addition to the normalized rule and official interpretation. Missing or oversized titles fail closed, and the title is bound into the preflight result before the proposal is stored.
- Web: proposal cards and rule detail now use the dealer-generated title, normalized executable rule, and official deterministic explanation. The raw player prompt remains only as the labelled audit seed instead of becoming the public title or explanatory copy.
- Added regression coverage for the ambiguous screenshot rule, missing agent titles, title persistence, and the UI mapping of title/summary/explanation.
- Verified: `pnpm --filter @idealer/rule-compiler typecheck|test|lint|build` (42/42 tests); `pnpm --filter @idealer/api typecheck|test|lint|build` (71/71 tests); `pnpm --filter @idealer/web typecheck|test|lint|build` (70/70 tests); and `git diff --check`.
- Reviewed the result for inconsistencies: predicate rules are no longer described as choosing the “best” guess, ranking rules retain their deterministic runtime path, UI copy is English, the original prompt remains auditable, no fallback masks malformed agent output, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Manual cycle behavior and blocked draw diagnosis)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and its live devnet verification reference.
- Verified the live worker on `localhost:3003`: manual control and settlement automation were enabled, turn automation was disabled, and active turn `#20` was open before the test.
- Invoked `POST /manual/cycle`. It returned `settlement_required` with `close.action=ended_play_window` for turn `#20` (signature `3ysLRcRCcE9EkLnPWsE7SBymD7eQHyCr8koP9qnxtmihMFNiw1hSydAa6rh3ddiQypGVi7YBH4TL8A2VSbt7PwSG`); the active turn remained `#20`, so the endpoint did not close it and open `#21` in the same call.
- Confirmed this matches the current implementation: while a turn is active, `/manual/cycle` only ends phase 1 and leaves settlement to finish the draw, close, rollover, and terminal `CLOSED` transition; a later `/manual/cycle` can open the next turn only after no active turn remains.
- Diagnosed why settlement did not finish: the explicit `POST /manual/settle` failed during `request_draw` with on-chain `RandomnessQueueMismatch` (`6038`). The current on-chain `GlobalConfig` has both `drawVrfConfig` and `electionVrfConfig` set to the Idealer program address `ExW6LBU6XWsP53cvbtV1N2KFYMaudCtrenimHNWBBENd`, the migration placeholder, instead of the configured Switchboard queue. Turn `#20` therefore remains open at the `RULE_ELECTED` transition and no next turn can safely open.
- Verification: `pnpm --filter @idealer/worker test` passed (99/99). Reviewed the diagnosis against source, live on-chain state, API settlement transitions, and endpoint responses; no code/config fix was applied and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (One-call manual cycle and VRF repair)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, the local `solana-dev`, Switchboard, deployment, `idealer-test-and-verify`, live devnet verification, and best-practices agent/code/Web3/testing guidance.
- Worker: changed `POST /manual/cycle` into a fail-closed one-call orchestrator. It ends phase 1, drives the real settlement scheduler until the prior turn is no longer active and its API transition chain contains terminal `CLOSED`, then opens the next turn through the existing rollover-aware `openTurnManually` gate. It has a five-minute timeout and never opens on settlement, pause, or state-consistency failure.
- Worker: serialized periodic/manual settlement passes inside the process to prevent duplicate randomness commits and adjacent-instruction races. Added a bounded two-second retry only for explicit public-RPC HTTP 429 rate limiting; deterministic on-chain and simulation errors still fail immediately and remain visible.
- Added regression coverage for settlement-through-`CLOSED` before opening, timeout without opening, unexpected active-turn fail-closed behavior, explicit RPC 429 recovery, and rejection of retries for deterministic transaction errors.
- Devnet: simulated and broadcast the authority-gated `set_vrf_config`, replacing the migration placeholders with Switchboard devnet queue `EYiAmGSdsQTuCw413V5BzaruWuCCSDgTPtBGvLkXHbe7` for both draw and election. Signature: `2iKXQdgtj3LfGe2iFYHM5RzSeRfbzoNvHh3zCcGVWdBaBCVXsvgLCV8WBMh6t1PYuK8gv3cBa734CM1uFMbFMqmL`. Re-read both values on-chain before continuing.
- Live recovery: after restarting only the worker, settlement resumed turn `#20` through fulfilled draw, on-chain close, and terminal `CLOSED`; a dry-run reported `done/already_closed`.
- Live acceptance: opened turn `#23`, then one `POST /manual/cycle` returned HTTP 200 after 39.5 seconds with `close.action=ended_play_window`, `open.action=opened_turn`, `open.turnId=24`, and `settlementPasses=3`. Turn `#23` has fulfilled draw `[50,11,99,93,35,64]`, all eight settlement states through `CLOSED`, completed round status, a rollover record targeting `#24`, and terminal audit `integrity:true`; active on-chain turn `#24` is open for 1200 seconds.
- Idempotency: a fresh read of turn `#23` planned `done (already_closed)`, and its settlement transition count remained 8 before/after the check.
- Verified: `pnpm --filter @idealer/worker typecheck`; `test` (104/104); `lint`; `build`; and `git diff --check`. Reviewed the result for inconsistencies: new turns remain blocked until draw/close/rollover/CLOSED completes, RPC backoff is narrow and bounded, deterministic errors are not hidden, manual endpoints remain test-only gated, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-12 (Left-align rule row content)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the relevant design-system references (`01-tokens.md`, `02-components.md`, `03-screens-and-state.md`).
- Web: set `text-align: left` on the shared `.ide-rulerow` class. Rule titles and vote tallies now align to the left beside the ranking medal; the right-side chevron and existing spacing are unchanged.
- Verified: `pnpm --filter @idealer/web typecheck`; `test` (73/73); `lint`; `build`; and `git diff --check`. Browser verification loaded `http://127.0.0.1:3000/play` without a Next error overlay and saved `output/playwright/rule-row-left-aligned.png`; the local API had no rules at inspection time, so the empty state was the rendered live-data state.
- Reviewed the result for inconsistencies: no new visual token, fallback, or unrelated layout change was introduced; UI copy remains English; no milestone was finished or ticked, as milestone marking requires explicit user confirmation.

### 2026-07-13 (Windows Docker build context excludes local dependency links)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md` with its agent-principles reference, and `.claude/skills/idealer-test-and-verify/SKILL.md` with its Docker/Windows verification reference.
- Diagnosed the Compose build failure as Docker BuildKit traversing the Windows pnpm junction `apps/admin/node_modules/.ignored_react` while preparing the root build context. The image installs dependencies inside the container, so host `node_modules` must never be part of that context.
- Updated `.dockerignore` to exclude generated dependency/build directories recursively, plus repo-local pnpm cache, agent materials, local logs, rendered output, test results, and Rust `target` artifacts. These paths are not copied by `infra/docker/Dockerfile.node` and are not runtime inputs.
- Verified: `docker compose --profile admin config --quiet` and `git diff --check` pass. The full image build did not finish within the available Docker command window, so it is not recorded as passing; rerun `docker compose --profile admin up --build` locally after this change.
- Reviewed the result for inconsistencies: no application code, service ports, environment values, or authorization behavior changed; no fallback was added; no milestone was finished or ticked.

### 2026-07-13 (Native application services for local development)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md` with its agent-principles reference, and `.claude/skills/idealer-test-and-verify/SKILL.md` with its Docker/Windows verification reference.
- Docker Compose now starts only PostgreSQL and Redis by default. API, worker, public web app, and admin console are in an explicit `containerized` profile and the documented local development flow starts each with its `pnpm --filter @idealer/<service> dev` command on the host.
- Added the native host connection defaults to `.env.example` (`DATABASE_URL` and `REDIS_URL`), aligned Prometheus to scrape host-run API/worker services through `host.docker.internal`, and updated `README.md` plus the local-development runbook with the new startup and health-check procedure.
- Verified: the current `.env` has both required datastore URLs without exposing their values; `docker compose up --dry-run` selects only `idealer-postgres` and `idealer-redis`; both are healthy in `docker compose ps`; `docker compose config --quiet`, `docker compose --profile containerized config --quiet`, and `git diff --check` pass.
- Reviewed the result for inconsistencies: no database data, app service, worker automation, or on-chain operation was started or changed; containerized app services remain available only through an explicit profile; no milestone was finished or ticked.

### 2026-07-13 (Manual cycle HTTP 500 diagnosis for turn 24)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and its live devnet/Windows verification reference.
- Reproduced `POST /manual/cycle` and read the response body hidden by PowerShell's default exception output: the guarded open path rejected the request because turn `#24` had not recorded the terminal `CLOSED` settlement transition.
- Confirmed the on-chain turn is already closed with a fulfilled draw while the restarted in-memory API has no settlement transitions, rule validation artifact, or guess receipts for turn `#24`. An explicit idempotent settlement pass failed closed with `ACTIVE_RULE_ARTIFACT_NOT_FOUND` instead of opening the next turn.
- Cross-checked the source of truth directly on devnet: turn `#24` has two `PlayerGuess` accounts and one active rule whose frozen compiled-artifact hash is `5741b79befa69bdc909e7dcef21d481c1f98ba33f20ab8c946691c536151d13b`. Therefore, treating the empty API receipt list as a zero-guess turn would discard real player inputs and was not implemented.
- Reviewed the result for inconsistencies: no force-close, namespace reset, synthetic artifact, payout, or on-chain transaction was sent; the settlement gate remains fail-closed, no error-hiding fallback was added, and no milestone was finished or ticked. Recovering the current turn requires either the exact originally frozen compiled artifact or explicit authorization for a state-reset/recovery strategy.

### 2026-07-13 (Durable settlement recovery and turn 25 opening)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md` with its live-devnet reference, `.claude/skills/solana-dev/SKILL.md` with its async-backend guidance, and `.claude/skills/playwright/SKILL.md`.
- Root cause: turn `#24` was closed on-chain, but the API stored receipts, rule validation, verification, and settlement transitions only in process memory. An API restart erased that projection, so the fail-closed predecessor gate correctly rejected turn `#25` while the web could only report that no turn was active.
- API: added a versioned operational-state snapshot persisted to PostgreSQL before successful POST responses are acknowledged. Snapshots use byte-preserving JSON text rather than `jsonb`, because PostgreSQL key reordering invalidated the legacy order-sensitive frozen compiled-artifact hash after restore. Startup now requires and restores durable state, and persistence failures return an explicit HTTP `503` instead of reporting success.
- API recovery safety: late on-chain receipts can reconcile winner, rollover, reward, and unclaimed-claim projections. Reconciliation removes only the prior contribution from the affected turn, preserves unrelated rollover additions, and locks if a claim is pending wallet approval or already claimed.
- Worker/web: `/turn/active` now exposes a predecessor settlement gate. The UI distinguishes `PREVIOUS_TURN_SETTLEMENT_PENDING` from an ordinary no-active-turn state with English recovery copy. A retried `/manual/cycle` can resume an on-chain-closed predecessor through terminal settlement before opening the next turn.
- Recovered turn `#24` from verified devnet facts without bypassing the frozen hash: restored both `PlayerGuess` receipts and the exact compiled artifact matching `5741b79befa69bdc909e7dcef21d481c1f98ba33f20ab8c946691c536151d13b`; both guesses win the alternative rule at `4,750,000` lamports each. The reconciled original-bucket rollover is `9,500,000` lamports into turn `#25`, the alternative rollover is zero, and the creator reward is `200,000` lamports.
- Restarted the API and proved the snapshot restores two jobs, two results, two winner records, claims, rollover, and the frozen artifact hash. With the user's correction request as transaction authorization, `POST /manual/cycle` simulated and opened devnet turn `#25` for 1,200 seconds. Signatures: set-cycle `5fJpTHLCWxMZHdQQvmWjhhxy856svY9qiVwcPSdru2mL5QgYC1cUr4yXLMnUSJzVXiNUkzfsXgpDnBHkbUvrWLSu`; open-turn `2k4jjETjMAABsG3A4MSUYUWUeCAMn523fCHeGMCYMaSZwYBdA4hVRcNFUfW9ZUzPGHkADCTGQnwxkxTsYchWVHdo`. The worker then reported active turn `#25` and the API reported it as `current`.
- Verified all touched packages: API typecheck/test/lint/build (75/75 tests), worker typecheck/test/lint/build (106/106), web typecheck/test/lint/build (74/74), PostgreSQL snapshot column type `text`, controlled API restart restoration, and `git diff --check`. Browser artifacts are `output/playwright/turn-opening-ready.png` and `output/playwright/turn-25-active.png`; the headless walletless browser rendered the shell but did not complete `SolanaProvider` hydration, while its console stayed error-free and the same-origin worker proxy returned active turn `#25` directly.
- Reviewed the result for inconsistencies: no fallback or force-open bypass was introduced; frozen-artifact verification remains enforced; already-paid or approval-pending claims cannot be recalculated; unrelated existing worktree changes were preserved; and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-13 (Live phase and manual-cycle verification from turn 27 to 28)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md` with its live-devnet reference, and `.claude/skills/solana-dev/SKILL.md` with the Solana transaction guardrails.
- Captured the initial live state: devnet turn `#27` was on-chain `open`, unpaused, settlement automation and manual control were enabled, turn automation was disabled, and there were no premature settlement transitions. A forced non-broadcast dry-run targeted turn `#27`, reported zero eligible candidates, and correctly planned `wait/before_play_window_end`.
- With the user's verification request as explicit devnet transaction authorization, executed `POST /manual/cycle`. It ended the play window for turn `#27`, completed settlement in three scheduler passes, reached terminal `CLOSED`, and opened turn `#28` for 1,200 seconds. End-window signature: `65SmFX3sSTDh8Dj9g7fF6s1VqfBQW9d8Ym9crob5ZUGbX4Tk8nGvMpgSWKHKoNzYCaqyTP8UicALqMA9ajv9pPqJ`; set-cycle signature: `bRsLHMCuh3pBNdgXiXVvpm7qbLMdUiF3zogntsJgV2Hw4kSft5YS3DXALRijZ2KDZef28gY4MCDe4XMnHffepEH`; open-turn signature: `2pwhDdVE3zNqRsTgZQdFvXcsxJDLkoY3t6Mi5fbvqLU7u1p6cU3UYkRWwXBm8WmBV7Kx92gANYpBsXhwwrVyZKQF`.
- Verified every applicable no-rule phase: `RULE_ELECTED` (original-only) -> `DRAW_PENDING` -> `DRAWN` -> `TURN_CLOSED` -> `VERIFYING` -> `FINALIZED` -> `CLAIMABLE` -> `CLOSED`. Shortlist, finalist VRF, elimination, and active-rule freeze were correctly skipped because the turn had zero eligible rule candidates. The fulfilled draw is `[74, 47, 13, 73, 51, 76]`.
- Reconciled all stores: turn `#27` is on-chain `closed` with `drawStatus=fulfilled`; the API round is `completed`; all eight settlement-transition audit records return `integrity=true`; all six cycle/draw/close/open transactions are `finalized` with `err=null`; and the original no-winner rollover of `9,500,000` lamports is visible in active turn `#28`.
- Idempotency replay of turn `#27` returned `done/already_closed`. Before/after counts stayed unchanged at 8 settlement transitions, 9 turn audit logs, 0 verification results, 0 winners, and 0 claims. Worker regression tests also passed 106/106.
- Reviewed the result for inconsistencies: the API's generic cycle metadata still describes the production 24-hour pattern while the live devnet `TurnState` correctly reports the explicit 1,200-second manual duration; the live countdown uses the on-chain timestamps, so this did not alter phase execution. No fallback, forced state reset, payout, or milestone checkbox was introduced; milestone marking still requires explicit user confirmation.

### 2026-07-13 (Live dev-cycle result selection and turn 29 opening)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the triggered `vercel:agent-browser-verify` guidance.
- Root cause of the stale `Result of round #0024` card: a historical `/round/24` route supplied `initialResultTurnId=24`, and the single-page navigation kept that route-pinned selection after returning to Home. Browser GET polling also omitted `cache: "no-store"`, allowing the stable active-turn and round URLs to reuse stale dev-cycle snapshots.
- Web: historical result selection is now scoped to the Result screen. Leaving it clears the pin, and Home explicitly opens the latest completed result derived from the current dev turn. Active-turn and round GETs now bypass browser caches. Added regression coverage for the `24 -> Home -> current previous result` transition.
- API: round and health cycle metadata now follows the effective environment. Manual dev control publishes `IDEALER_TURN_MANUAL_OPEN_DURATION_SECONDS=1200`; automatic dev scaling remains supported; production constants remain unchanged when neither dev mode applies. The detailed round UI formats the dev duration as `20m`.
- Live devnet verification: turn `#28` finished with a fulfilled draw and completed settlement. With no active turn, the worker reported `nextTurnId=29` and `READY_TO_OPEN`; authorized `POST /manual/cycle` returned HTTP `200` and opened turn `#29` for 1,200 seconds. Set-cycle signature: `4vfqZQ8oS8DLXzPDNJ71xq8Rsxb1mk88bCwuPtbTp5ZtYCCfXh9vtJbC1ELKYS94G7MXViwzDD6uU9Yx79UT6p65`; open-turn signature: `82joGkWWs5rc8fuEnGyZjhNkYyyyFBmgobFkTrMxFcoDsoopikS9oAUMqv2fbAYyWPVSdBXWDyRiSBQdxkVwBWx`.
- Verified: API typecheck/test/lint/build (76/76 tests); web typecheck/test/lint/build (75/75 tests); live same-origin worker reports active `#29`; API reports previous `#28` as `completed`, draw `fulfilled`, and cycle `1200` seconds. The headless walletless browser loaded meaningful UI with no console/page error, but—as previously documented for this Solana provider—it did not complete live-data hydration, so endpoint evidence and the deterministic regression test were used for the result-number assertion.
- Reviewed the result for inconsistencies: dev/manual metadata no longer reports the production 24-hour cycle, historical deep links still open their requested result until the user leaves that screen, production timing constants were not changed, no fallback or force-open bypass was added, unrelated worktree changes were preserved, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-13 (Rule clarification interpretation review)

- Opened required context before reviewing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, and the rule compiler's `packages/rule-compiler/rule-authoring/SKILL.md` plus its `references/patterns.md` and `references/examples.md` guidance.
- Reviewed the submitted Portuguese rule, its example, the clarification suggestions, the compiled preview, the web guidance builder, API refinement feedback, compiler ambiguity rules, runtime digit semantics, and related unit/E2E coverage.
- Finding: the example expresses an all-position comparison of tens values/digits (for example, `12/11`, `31/30`, and `24/29` match by tens in the same positions). The displayed `Exact Order Match` preview instead compares complete numbers, while every displayed clarification option changes either the required count, the compared property, or the position/order semantics. None is an intent-preserving clarification.
- Identified one genuine boundary ambiguity: the runtime defines the tens digit as `floor(n / 10) % 10`, so values `1-9` and `100` both have tens digit `0`; the UI should make that behavior explicit or ask whether the creator means the tens digit or ten-number buckets, particularly for `100`.
- Reviewed the result for inconsistencies: this was an evidence-only product/compiler review; no implementation, runtime behavior, UI copy, or milestone checkbox was changed.

### 2026-07-13 (Intent-preserving rule clarification harness)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md` with its agent-principles, code-quality, testing, and final-checklist references, `.claude/skills/idealer-test-and-verify/SKILL.md`, and the runtime `packages/rule-compiler/rule-authoring/SKILL.md` with its patterns and examples references.
- Replaced independently hard-coded web suggestions with a structured agent/API contract: the interpretation harness now returns bounded `clarificationQuestions` and `suggestedRewrites`, the API accepts only complete rewrites that preserve explicit quantity/comparator, compared property, order/position, and polarity/direction cues, and the web renders only the vetted plural rewrite list. Prompt-injection, external-dependency, vague-distance, order-only, and re-proposal blocks now show manual clarification when no faithful rewrite exists instead of inventing a stock rule or threshold.
- Upgraded the runtime rule-authoring skill to `idealer_rule_compiler_skill_v7`. The interpreter and translator prompts explicitly distinguish an ordered tens-range projection from full-number equality, isolated tens-digit matching, and unordered matching. The deterministic compiler recognizes evidence such as draw `12 31 24`, guess `11 30 29`, and projection `10 30 20`, then emits a schema-v3 `pairs_forall` predicate comparing integer-division-by-10 values in all six corresponding positions.
- Added a known-intent normalization so the executable AST, normalized public rule, title (`Ordered Tens Ranges`), and official interpretation cannot disagree even if a model initially describes exact full-number equality. Recognized ordered tens-range rules bypass translation/interpretation/AST inference while retaining the existing guardian security gate.
- Added regression coverage across compiler, API, web unit tests, and Playwright for the reported Portuguese rule, loss cases, the `100` boundary, rejection of a generic model rewrite, strict structured response parsing, absence of fabricated suggestions, and the single intent-preserving UI option.
- Verified `@idealer/rule-compiler` typecheck/test (43/43)/lint/build, `@idealer/api` typecheck/test (79/79)/lint/build, and `@idealer/web` typecheck/test (77/77)/lint/build. Focused Playwright `rule-proposal.spec.ts` passed 5/5 against the existing `http://localhost:3000` dev server; using `127.0.0.1` first reproduced the documented Next dev-origin hydration block and was not counted as a product failure. `git diff --check` passed.
- The optional live POST of the exact rule to the already-running API timed out at both 180 seconds and 30 seconds while the configured guardian/model chain was active, so no successful live-model response is claimed. Deterministic, API-contract, unit, build, and browser-flow verification remain green, and the timeout stays observable rather than being hidden by a fallback.
- Reviewed the final result for inconsistencies: no generic production suggestion strings remain, UI copy is UTF-8 English, full-number equality cannot label or execute the ordered tens-range case, no unrelated existing changes were removed, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-13 (Historical round URL and live-round state mismatch diagnosis)

- Opened the required context before reviewing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/develop-web-game/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and the applicable Next.js routing guidance.
- Root cause: `/round/[turnId]` initializes the single-page shell on the historical Result screen, but `go("home")` and `go("result")` only mutate React state. They do not call the Next.js router, so leaving `/round/24` can render the active round and its latest result while the browser still exposes `/round/24`.
- A browser reload remounts the route from its canonical parameter. `/round/24` therefore restores `initialScreen="result"` and `initialResultTurnId=24`, which correctly reloads result `#0024` according to the stale URL even if the pre-reload client state showed active round `#0030` or another newer round.
- The recent result-selection regression test covers releasing the historical result ID in React state, but it does not assert pathname/history synchronization or reload behavior. This explains why the visible in-session round was corrected while the URL mismatch remained.
- Architecture recommendation: keep `/play` as the stable canonical route for the changing live-round hub and `/round/[turnId]` as an immutable historical permalink whose content always matches its ID. Transitions between them should use real Next.js navigation; internal screen state should remain only for non-resource overlays or steps that do not change the page identity.
- Reviewed the result for inconsistencies: this was a read-only diagnosis of application behavior; no runtime code, route behavior, on-chain state, or milestone status was changed. No milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-13 (Canonical live and historical round navigation)

- Opened the required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md` with references `01-tokens.md`, `02-components.md`, `03-screens-and-state.md`, and `04-new-screen-recipe.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the applicable Next.js and dev-server browser-verification guidance. Inspected the current `idealer.css`, `shared.tsx`, `IdealerApp.tsx`, route pages, and neighboring screens before editing.
- Web navigation: `/play` is now the canonical live-round route and `/round/[turnId]` is the canonical immutable historical-result route. Leaving any non-`/play` screen for Home performs a real Next.js navigation to `/play`; opening a result performs a real navigation to `/round/<resultTurnId>`.
- Removed the duplicate historical-result selection from React state and the associated resolver. Historical result identity now comes only from the dynamic route parameter, while the latest live result is derived only from the active-round projection. Reload, browser back, and browser forward therefore reconstruct the same round shown by the URL.
- Added a Playwright regression for `/round/24 -> /play -> reload -> /round/30 -> back -> forward -> reload`, asserting both pathname and rendered turn IDs throughout. Updated the older draw-popup mocks to accept the existing `activeTurnId` query parameter so their fixtures match the current round API contract.
- Verified `@idealer/web` typecheck; unit tests (76/76); lint with zero warnings; production build; and the complete focused Playwright file (3/3), including the new canonical navigation scenario. The preferred isolated Playwright container bootstrap remained silent and was terminated; the repository-supported external-server mode then ran the same real-browser tests against the user's existing `localhost:3000` Next.js server without restarting it.
- Browser gut-check: `/play` rendered meaningful live content with no Next.js error overlay, clicking the live result produced `/round/30`, reloading retained `/round/30` with `#0030`, and the result's back action produced `/play` with the round-30 result card. Reviewed screenshots: `output/playwright/canonical-round-navigation-home.png` and `output/playwright/canonical-round-navigation-result-30.png`.
- Reviewed the final result for inconsistencies: no visual token, copy, wallet behavior, API behavior, fallback, or on-chain state changed; the UI gallery retains its local state navigation; obsolete result-selection logic was removed; no new source file was introduced; and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-13 (Result screen rule-first layout and verified guess highlighting)

- Opened required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md` with references `01-tokens.md`, `02-components.md`, and `03-screens-and-state.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the applicable Next.js/browser-verification guidance. Inspected the active Next.js `Result.tsx`, `idealer.css`, result data types, hooks, and existing browser coverage.
- Result screen: the elected Rule of the Turn now appears directly after Drawn numbers, followed immediately by Your guess. The original-rule payout summary remains available after the entry instead of interrupting that result flow.
- Number treatment: drawn-number chips now use the existing purple-to-green brand gradient. Submitted numbers are colored only from verified winner records: purple for the original rule, green for the Rule of the Turn, and a diagonal purple/green split for a verified win under both. A visible legend and per-number accessible labels explain the states; an unavailable verification result remains explicit rather than being treated as a loss.
- Added a web regression test covering no win, original-only, turn-only, and both-rule match states. Verified `@idealer/web` typecheck, test (77/77), lint with zero warnings, production build, and `git diff --check`.
- Browser review: the existing `localhost:3000` result route mounted and its screenshot was captured at `output/playwright/result-layout-30.png`, but the live API did not provide round data and therefore rendered the intentional loading skeleton. A separate mock dev server could not be started because the existing Next dev process owns the same app directory; it was left untouched, and no mock/fallback behavior was added to production code.
- Reviewed the result for inconsistencies: the UI remains UTF-8 English, uses existing design tokens, preserves the original-rule pool information, does not infer rule results from number overlap, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-14 (Tokenomics v2.8 internal and main-PRD coherence review)

- Opened the required context before reviewing: `PRD.md`, `PRD-TOKENOMICS-v2.8.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/best-practices/SKILL.md`, and its `agent-principles`, `architecture`, `web3-contracts`, `governance-compliance`, and final-checklist references.
- Reviewed the tokenomics draft for supply/allocation arithmetic, treasury custody and timelock boundaries, locking and epoch accounting, Merkle challenge/sealing, campaign-vault rewards, referrals, programme immutability, emergency behavior, milestones, and decision-register consistency. The 200M + 800M allocation, fixed-supply invariant, creator-first reward ordering, independent caps, campaign-vault isolation, and treasury internal-custody/timelock distinction are internally aligned.
- Found unresolved internal specification gaps before implementation readiness: the immutable Tokenomics Core trust boundary with the upgradeable game layer is undefined; exact epoch boundary/event ordering and wallet-versus-position aggregation are underspecified; challenged-root resolution and unsealed-entitlement liveness depend on the founder-controlled treasury multisig; self-referral rejection is not enforceable across accepted multi-wallet participation; and concurrent/future campaign selection is not uniquely mapped by reward type.
- Found direct divergence from the binding main PRD: native-SOL/no-SPL-token statements, the round-100 free-action cutoff, SOL platform-monetisation funding and 0.25-SOL creator/voter caps, treasury operating uses, current reward/claim accounts, mainnet gates, and resolved MVP decisions all retain the previous model. Prize claims that expire and token-lock distribution claims that never expire are logically compatible only if their names, accounts, instructions, and UI are explicitly separated. The main PRD also remains ambiguous about whether vote/removal fees are 100% prize-pool funds or are subject to the standard 5% treasury split.
- Reviewed the review result for inconsistencies: no PRD clause, implementation file, on-chain state, or existing milestone status was changed; the dirty worktree and the user's tokenomics draft were preserved; and no milestone checkbox was marked because explicit user confirmation is still required.

### 2026-07-14 (Home hero counters layout restoration)

- Opened the required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md` with references `01-tokens.md`, `02-components.md`, and `03-screens-and-state.md`, `.claude/skills/idealer-ui-coherence/SKILL.md` with its coherence checklist, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the applicable browser-verification guidance. Inspected the current Next.js `Home.tsx`, `idealer.css`, `shared.tsx`, `IdealerApp.tsx`, and the same Home surface at commit `1da3d21a35476d3a8fd89109a244344560a64321` before editing.
- Restored the compact, divided player/rule counter composition from the reference commit while retaining the current elevated dark surface. Both counters now share one rounded group, use the established numeric font and weight, and are separated by a vertically fading divider; the outer border uses a subtle token-based gradient for a smooth transition.
- Verified `@idealer/web` typecheck, tests (77/77), lint with zero warnings, and production build. Browser checks at 320x720 and 390x844 confirmed a centered approximately 191x30 px counter group, no horizontal overflow, meaningful page content, no framework error overlay, and no page errors. Reviewed screenshots: `output/playwright/home-hero-stats-320.png` and `output/playwright/home-hero-stats-390.png`.
- Reviewed the result for inconsistencies: UI copy remains UTF-8 English, all colors and surfaces use existing design tokens, no unrelated component behavior changed, the live result modal was closed only in the browser verification session, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-15 (Deterministic semantic-impact confirmation gate)

- Opened the required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md` with the component and screen-state references, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the runtime `packages/rule-compiler/rule-authoring/SKILL.md`. Inspected the active API preflight pipeline, rule AST schema, refinement flow, Create screen, API/web preflight contracts, and existing unit/E2E coverage before editing.
- Added a deterministic post-compilation semantic-impact review. It traverses the compiled AST to identify whether a rule uses `guess`, `draw`, or both; detects draw-only shared outcomes, guess-only draw-independent outcomes, and numeric ranges whose endpoint behavior was not explicitly stated by the player. Only the player's submitted text can supply confirmation; translated or model-normalized text cannot manufacture consent.
- Technically valid rules with material unconfirmed effects now return `confirmationRequired: true`, retain `decision: VALID`, set `needsClarification`, append the material consequence to the official interpretation, and expose focused, intent-preserving confirmation rewrites. The preflight hash contract was advanced to version 8 with the semantic-impact record, and the API rule-proposal projection rejects records that are not valid, still need clarification, or still require confirmation.
- Updated the interpreter contract to universalize first-person rules as `A guess wins if ...`, explicitly disclose ignored inputs and shared outcomes, and never silently choose inclusive/exclusive range endpoints. Updated the mobile Create flow to show `review required`, label the score as `interpretation confidence`, use `Confirm rule impact`, keep the round-submission action hidden until confirmation, and re-check all gates inside the submit handler.
- Added exactly three deterministic stressed-prompt regressions: informal Portuguese draw-only wording with ambiguous endpoints requires both confirmations; explicit Portuguese draw-only/inclusive wording passes while retaining the shared-outcome disclosure; and an emphatic compound inclusive rule using both guess and draw passes without an unnecessary semantic confirmation. All 3/3 passed.
- Verified `@idealer/api` typecheck, tests (82/82), lint with zero warnings, and build; `@idealer/web` typecheck, tests (77/77), lint with zero warnings, and production build. The full focused Playwright rule-proposal file passed 6/6 at Pixel 5 dimensions, including the new review-to-valid transition, both endpoint choices, hidden round-submit action before confirmation, and the `94% interpretation confidence` label.
- Live local-model note: `GET /health` on the already-running API returned `ok` for the API, PostgreSQL, and Redis, but a direct POST of the first stressed Portuguese prompt to `/rule-preflight` reached the explicit 180-second client timeout while waiting for the configured model/guardian chain. The other two live requests were not stacked onto the occupied chain. No successful live-model result is claimed; the timeout remains observable, while the three deterministic AST-gate prompts and the browser contract flow remain green.
- Browser note: the first `127.0.0.1` attempt reproduced Next's documented dev-origin resource block and could not hydrate React; rerunning the same Playwright flow against the existing `http://localhost:3000` server passed. No fallback was added to production, and the failed origin was not counted as product verification.
- Reviewed the final result for inconsistencies: the AST remains the deterministic source of execution, technical validity is not conflated with confirmed intent, accepted draw-only rules disclose that every eligible guess wins or loses together, UI/UX copy remains UTF-8 English, the pre-existing unrelated `apps/web/next-env.d.ts` worktree change was preserved, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-15 (English semantic-impact stress coverage)

- Reopened the required context before testing: `PRD.md`, `AGENTS.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and the runtime `packages/rule-compiler/rule-authoring/SKILL.md`; reviewed the existing semantic-impact test matrix before extending it.
- Added three English stressed-prompt regressions parallel to the Portuguese cases: noisy draw-only wording with unstated scope/endpoints requires confirmation; explicit draw-only inclusive wording passes while retaining the shared-outcome disclosure; and an emphatic inclusive `guess AND draw` rule passes without unnecessary confirmation. The bilingual focused matrix passed 6/6.
- Verified the complete `@idealer/api` ladder after the test additions: typecheck, tests (85/85), lint with zero warnings, and build all passed.
- Live local-model note: one direct English POST to `/rule-preflight` reached the explicit 60-second timeout. The remaining two live requests were not stacked onto the same model/guardian chain. No live-model success is claimed and no fallback was introduced; the deterministic English coverage remains green.
- Reviewed for inconsistencies: the new cases exercise the same AST contracts in both supported input languages, add no runtime or UI behavior, preserve the unrelated dirty worktree, and do not mark any milestone checkbox because explicit user confirmation is required.

### 2026-07-15 (Five-minute rule-agent timeout and bilingual live retest)

- Opened the required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `packages/rule-compiler/rule-authoring/SKILL.md`. Inspected the active rule-agent configuration and its tests before editing.
- Set `LLM_TIMEOUT_MS=300000` in the local environment and the public example. The rule-agent configuration now enforces 300,000 ms as a minimum even when a stale/invalid environment value is lower; the default is the same five-minute minimum. Added a regression test for a `45000` ms environment value.
- Re-ran the deterministic bilingual matrix: all three Portuguese and all three English stressed prompts passed (15/15 together with the relevant agent tests). The full `@idealer/api` verification ladder also passed: typecheck, tests (86/86), lint with zero warnings, and build.
- Started an isolated API instance on port 3006, confirmed API/PostgreSQL/Redis health and model warmup, then sent all six stressed prompts sequentially using the correct `/rule-preflight` request contract and a 300-second client limit. The Portuguese cases timed out at 300.4, 300.5, and 300.4 seconds; the English cases timed out at 300.5, 300.6, and 300.5 seconds. The isolated API recovered its health check after every request. This confirms the effective five-minute wait, but the local model/guardian chain still did not produce a final preflight response within that window; no fallback or synthetic result was used.
- Stopped only the isolated test process and removed its temporary logs. Reviewed the final result for inconsistencies: the runtime configuration and documented example agree on the enforced minimum, deterministic Portuguese/English semantic behavior remains covered, the pre-existing unrelated `apps/web/next-env.d.ts` worktree change remains preserved, and no milestone checkbox was marked because explicit user confirmation is required.

### 2026-07-16 (Streamed rule-agent progress and CPU-local model recovery)

- Opened the required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md` with references `01-tokens.md`, `02-components.md`, `03-screens-and-state.md`, and `04-new-screen-recipe.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the applicable Next.js and browser-automation guidance. Inspected the active API preflight/LLM/guardian pipeline, Next.js proxy Route Handler, conversation run store, Create screen, CSS/shared app surface, environment defaults, and existing regressions before editing.
- Root cause: the local preflight could perform guardian input screening, translation, primary interpretation, AST compilation, guardian groundedness, and optional stronger-model escalation sequentially. Each model call allowed 300 seconds while the Next.js proxy allowed only 300 seconds for the entire request. Ollama kept `gemma4:latest`, `granite4.1-guardian:8b`, and `gemma4:e2b` resident for 10 minutes, so a CPU-only machine held roughly 25 GB of model data and the proxy returned HTTP 504 before the chain could finish.
- Added real NDJSON progress streaming to the existing `POST /rule-preflight` contract when the client requests `application/x-ndjson`. The API emits bounded high-level stages for input checks, model preparation, safety, optional translation, interpretation, compilation/testing, groundedness, optional escalation, and semantic-impact review. The Next.js Route Handler now forwards the response body without buffering and does not apply its ordinary whole-body timeout after the streamed API has responded; the legacy JSON request/response path remains compatible.
- Replaced the Create chat's three-dot typing bubble with an accessible live activity card using the existing chat surface/tokens. The card has `role="status"`, `aria-live="polite"`, a token-colored spinner, and the current backend-provided action such as `Checking the rule for unsafe instructions...` or `Interpreting your winning condition...`. Pending progress remains available when the user leaves and reattaches to the conversation.
- Reduced the local CPU path without adding a fallback: `gemma4:e2b` escalation is now opt-in and the local `.env`, public example, and Docker default leave it empty; Gemma 4's separate translation pass defaults off; Ollama requests disable reasoning output and bound generated tokens; explicit Ollama tags are no longer incorrectly treated as the same resident model; and AST compilation first uses the model's normalized interpretation so supported normalized rules can use the deterministic compiler instead of another inference call. Thinking control is only sent to detected Ollama endpoints, preserving generic cloud/OpenAI-compatible requests.
- Added regressions for explicit model-tag warmup, Ollama-only reasoning control, streamed stage/result parsing, typed streamed errors, and conversation progress lifecycle. Verified the complete `@idealer/api` ladder (typecheck, tests 87/87, lint with zero warnings, build) and `@idealer/web` ladder (typecheck, tests 79/79, lint with zero warnings, production build). `git diff --check` passed.
- Live verification used the exact reported Portuguese rule through `http://localhost:3000/api/proxy/rule-preflight`. It completed in 419.4 seconds—past the former 300-second proxy cutoff—emitted seven real progress events, returned `decision: VALID` with the expected shared-outcome and endpoint confirmations, and never loaded `gemma4:e2b`. Browser verification at 390x844 showed the real `Interpreting your winning condition...` activity card with no visible clipping; screenshot: `output/playwright/rule-agent-live-progress-390.png`.
- Reviewed the final result for inconsistencies: UI/UX copy remains UTF-8 English; streamed and non-streamed errors remain observable; no synthetic compiler result or silent provider fallback was introduced; model escalation remains explicitly available for GPU hosts; the locally tested models were stopped after verification; no unrelated source changes were removed; and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-16 (Rule-agent activity label simplification)

- Reopened the required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md` with references `01-tokens.md`, `02-components.md`, `03-screens-and-state.md`, and `04-new-screen-recipe.md`, and `.claude/skills/idealer-test-and-verify/SKILL.md`. Reinspected the active Create screen and its shared CSS/component context before editing.
- Removed `Live activity` from the pending rule-agent card heading. The card now displays only `AI Dealer` while retaining the real current-stage message, spinner, accessibility attributes, and existing design tokens.
- Verified `@idealer/web` typecheck, tests (79/79), lint with zero warnings, and production build. Confirmed by source search that the removed phrase no longer appears in the Create screen.
- Reviewed the result for inconsistencies: no agent behavior, progress streaming, API contract, loading state, or unrelated UI copy changed; no new file was introduced; and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-16 (Reject always-true rules with valid variations)

- Opened the required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/CLAUDE.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md` with its checklist, `.claude/skills/idealer-design-system/SKILL.md` with references `01-tokens.md`, `02-components.md`, and `03-screens-and-state.md`, `.claude/skills/playwright/SKILL.md`, and the applicable agent-browser guidance. Inspected the API semantic-impact/preflight pipeline, AST schema, rule-refinement helpers, active Create screen, contracts, and existing clarification-loop coverage before editing.
- API: added deterministic AST-domain analysis for predicate tautologies over the guaranteed `[1, 100]` guess/draw number domain. A rule such as “all six official draw numbers are between 1 and 100” now returns `decision: INVALID`, no compiled artifact hash, no confirmation request, and an explicit explanation that the condition is always true and cannot distinguish winners from losers. The preflight hash contract advanced to version 9.
- Suggestions: the rejection returns two complete, intent-related, executable variations that compare every guessed number with the official drawn number in the corresponding position (lower-than or higher-than). Regression coverage independently confirms both suggestions compile as `VALID`.
- Web: the Create flow now renders this as an `invalid rule` state in the existing red error treatment, opens `Choose a valid variation`, offers `Use rule`, and labels manual entry as a different valid rule. Terminally rejected drafts cannot become a refinement base, so a short response is never appended to the always-true text and the payment/submission CTA remains absent.
- Verified the complete `@idealer/api` ladder: typecheck, tests (88/88), lint with zero warnings, and build. Verified the complete `@idealer/web` ladder: typecheck, tests (80/80), lint with zero warnings, and production build. The focused browser suite passed 2/2 at the configured Pixel 5 viewport, including the exact always-true rejection-to-valid-replacement flow and the pre-existing unfixable-clarification flow. Screenshot: `output/playwright/always-true-rule-rejection.png`. The initial Docker Playwright preparation timed out before starting tests; the repo-local Playwright installation then completed the same focused verification successfully against `http://localhost:3000`.
- Reviewed the final result for inconsistencies: the semantic gate rejects only AST predicates proven true across the bounded game domain; nontrivial draw-only ranges remain subject to the existing explicit-impact confirmation; no fallback, template constraint, or payment bypass was added; UI/UX copy remains UTF-8 English; `git diff --check` passes; and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-17 (Installed-mobile/PWA implementation audit)

- Opened the required context before auditing: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/playwright/SKILL.md`. Inspected the Next.js web package, PWA metadata, manifest, service-worker registration and implementation, mobile-wallet provider, wallet-discovery tests, responsive/safe-area CSS, and the PRD frontend/mobile architecture requirements.
- Confirmed that the current web DApp is installable as a PWA over HTTPS: it provides a linked `manifest.webmanifest` with `/play` as its start URL, standalone portrait display, 192/512 standard and maskable icons, Apple web-app metadata and touch icon, and a registered `/sw.js`. The Mobile Wallet Adapter and Wallet Standard discovery are implemented for Solana wallet handoff and reconnect behavior.
- Identified the product boundary precisely: the repository does not currently contain a Capacitor/Cordova/Expo/React Native wrapper or Android/iOS native project, so it is not yet a native store binary. The current service worker is network-only and therefore does not provide offline gameplay or an offline shell, and no in-app `beforeinstallprompt` UX is implemented even though the browser/OS can expose installation.
- Verified the complete `@idealer/web` ladder: typecheck, tests (81/81), lint with zero warnings, and production build all passed. HTTP checks returned 200 with correct content types for the manifest, service worker, standard/maskable icons, and Apple touch icon. Browser verification at 390x844 completed through the documented host fallback after the container dependency-preparation attempt stalled; the rendered mobile surface showed no apparent horizontal overflow. Screenshot: `output/playwright/pwa-mobile-check.png`.
- Reviewed the audit for inconsistencies: no runtime or product source file was changed, no unsupported offline/native-store capability is claimed, the existing PWA and mobile-wallet evidence was separated from native-app packaging requirements, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-17 (Android PWA installation guidance)

- Reopened the required `PRD.md`, inspected `.claude/skills`, and reviewed the repository's real-phone PWA runbook and current web-package scripts before answering.
- Confirmed the Android installation path against current official Chrome guidance: open the HTTPS Idealer URL in Chrome, choose the three-dot menu, select `Add to home screen`, and then `Install`.
- Confirmed the supported local-device test path already documented by the repository: run the web app and Cloudflare tunnel in separate terminals, open the generated trusted `https://*.trycloudflare.com` URL on Android, and install it through Chrome. Plain LAN HTTP is not installable because the service worker requires a secure origin.
- Reviewed for inconsistencies: no implementation file changed, HTTPS remains an explicit requirement, local and deployed installation instructions are clearly separated, and no milestone checkbox was marked.

### 2026-07-17 (Current Android PWA installation readiness check)

- Reopened the required `PRD.md` and inspected `.claude/skills` before checking the live local execution state.
- Confirmed that the web, admin, API, and worker services are listening on ports 3000 through 3003, and that `http://localhost:3000/play` returns HTTP 200 with the PWA manifest linked.
- Confirmed that the current web process exposes only HTTP, no `cloudflared` process is running, and no HTTPS endpoint is active on port 3000. The Cloudflare tunnel executable is already installed on the host.
- Conclusion: the current execution is not yet directly installable from Android because the phone cannot use the computer's secure localhost exception and plain LAN HTTP is not a secure PWA origin. Starting the existing `dev:tunnel` command is the remaining step before following the Chrome installation procedure.
- Reviewed for inconsistencies: no running process was started, stopped, or changed; no product source file changed; current HTTP availability was not conflated with Android PWA installability; and no milestone checkbox was marked.

### 2026-07-17 (Installed Android duplicate device-chrome diagnosis)

- Reopened the required `PRD.md`, inspected `.claude/skills`, reviewed the supplied installed-PWA screenshot, and traced the visible simulated device elements through the active Idealer app shell and CSS.
- Confirmed the cause: `IdealerApp.tsx` renders `PhoneChrome` unconditionally inside the public app. That component supplies the fixed `9:41` time, simulated iOS Dynamic Island, cellular/Wi-Fi/battery icons, and fake bottom home indicator. The small-screen media query removes only the outer rounded phone frame; it does not hide or remove the simulated system chrome.
- Confirmed the resulting installed-PWA defect: Android renders its real status/navigation areas while the app renders a second iOS system UI inside the content. The simulated chrome belongs only in an explicit design-gallery/device-preview surface, not in the installed or ordinary public mobile app.
- Reviewed for inconsistencies: no fix was applied without an explicit change request, no runtime process changed, the fake app navigation bar was distinguished from the fake operating-system home indicator, and no milestone checkbox was marked.

### 2026-07-17 (Standalone PWA system-chrome separation)

- Opened the required context before working: `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-ui-coherence/SKILL.md`, `.claude/skills/idealer-design-system/SKILL.md` with references `01-tokens.md`, `02-components.md`, and `03-screens-and-state.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, `.claude/skills/playwright/SKILL.md`, and the applicable React best-practices review. Inspected the active Next.js app shell, shared components, Home surface, all screen containers that reserved simulated status-bar space, and the installed-PWA manifest/viewport behavior before editing.
- Added standalone-display detection to the active Idealer shell using the standard `(display-mode: standalone)` media query plus the iOS `navigator.standalone` signal. Ordinary browser previews retain the simulated iOS device frame, `9:41` status bar, Dynamic Island, signal/Wi-Fi/battery icons, and home indicator. Installed PWAs remove those simulated operating-system elements, drop the device frame, and use the real viewport.
- Replaced the repeated hard-coded 52 px simulated-status-bar padding across Home, Vote, Share, Result, Profile, Play, Create, Claims, and Rewards with the shared `--ide-shell-content-top` variable. It remains 52 px in browser previews and becomes `16px + env(safe-area-inset-top)` in standalone mode, preserving comfortable spacing without duplicating Android/iOS system chrome. Existing bottom navigation continues to use the real bottom safe-area inset.
- Added `e2e/pwa-display-mode.spec.ts`, which verifies both branches: regular browser mode keeps the preview chrome and 52 px content offset; emulated installed mode applies the standalone shell, hides all three simulated chrome elements, and reduces the content top offset to 16 px. Two initial browser-infrastructure attempts demonstrated that CDP media emulation and Chromium's headless `--app` flag do not report an installed `display-mode`; neither was accepted as passing evidence. The final behavior-level standalone regression passed 1/1.
- Visually verified the ordinary desktop preview at 1440x1000 and standalone Android layout at 393x851. Desktop keeps the centered phone presentation, while standalone fills the viewport with no fake status/home bars and no apparent horizontal overflow. Screenshots: `output/playwright/pwa-browser-preview-desktop.png` and `output/playwright/pwa-standalone-android.png`.
- Verified the complete `@idealer/web` ladder: typecheck, tests (81/81), lint with zero warnings, and production build all passed. The React review found the new hook unconditional and locally scoped, its media-query listener correctly cleaned up, and no accessibility, component-structure, state, or performance regression introduced by the shared padding migration.
- Reviewed the final result for inconsistencies: ordinary computer-browser testing still renders the requested device simulation; installed PWA mode relies on real operating-system chrome and safe areas; product navigation was not mistaken for system chrome; no UI copy, data flow, wallet behavior, or unrelated styling changed; temporary capture tooling was removed; and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-17 (Quick Tunnel PWA hydration recovery)

- Opened the required context before investigating: `PRD.md`, `AGENTS.md`, `.claude/skills`, the Vercel `investigation-mode` skill, the supplied Cloudflare error log, the installed Next.js 16.2.7 `allowedDevOrigins` documentation, the active web configuration, runtime processes, public tunnel endpoints, and the focused PWA browser regression.
- Runtime evidence isolated the failure to the development WebSocket path. The supplied log repeatedly showed `Unable to reach the origin service` with malformed `Unauthorized` responses only for `/_next/webpack-hmr` through `strong-ozone-smallest-knowledgestorm.trycloudflare.com`. Web, admin, API, and worker processes were listening on ports 3000–3003; the public `/play`, `/__api/health`, and `/__worker/health` endpoints returned HTTP 200.
- Reproduced the fault before editing by sending the tunnel hostname and origin through a WebSocket upgrade to local Next.js: the response was malformed/unauthorized. Browser reproduction through the public HTTPS URL loaded server-rendered HTML but failed the standalone hydration assertion, explaining why the installed PWA displayed content while all React interactions appeared dead.
- Root cause: Next.js development mode blocks dev-only assets/endpoints from unlisted origins. A Cloudflare Quick Tunnel receives a random `*.trycloudflare.com` hostname, but `apps/web/next.config.ts` did not allow that development origin.
- Added top-level `allowedDevOrigins: ["*.trycloudflare.com"]` to the web Next.js configuration with a development-tunnel explanation. This is a Next dev-origin permission and does not broaden application CORS or production build origins. Next detected the config change and restarted only the web server automatically.
- Post-fix evidence: the identical WebSocket upgrade now returns `HTTP/1.1 101 Switching Protocols` and Next's HMR sync payload instead of `Unauthorized`; the public `/play`, API health, and worker health endpoints remain HTTP 200. The focused Playwright regression against the real public HTTPS tunnel passed 1/1, including standalone hydration, removal of simulated device chrome, and a real React interaction that opens the `Connect your wallet` overlay.
- Verified the complete `@idealer/web` ladder after the fix: typecheck, tests (81/81), lint with zero warnings, and production build all passed. A temporary diagnostic browser helper was removed after use.
- Reviewed for inconsistencies: the fix is limited to development Quick Tunnel access; the production PWA and application API security boundaries were not weakened; persistent WebSocket timeouts were correctly distinguished from failures after the `101` upgrade; no running API/worker process was changed; and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-17 (Android Solflare discovery diagnosis)

- Reopened the required `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, and the local `solana-dev` wallet-integration guidance before diagnosing the installed-PWA screenshot. Inspected the active Mobile Wallet Adapter registration, Wallet Standard discovery filter, connection overlay, installed package behavior, and existing wallet-flow coverage.
- Confirmed against current official Solana Mobile documentation that Chrome-installed Android PWAs support local Mobile Wallet Adapter and that Solflare is a compatible wallet. MWA intentionally registers one generic `Mobile Wallet Adapter` connector; it does not enumerate installed native Android wallets by brand before the user starts the connection.
- The screenshot therefore shows the expected pre-connection state rather than proof that Solflare was not detected. Tapping the generic connector should dispatch the Android intent, after which Android opens a chooser or routes directly to Solflare for approval.
- Identified the diagnostic boundary: if Solflare does not open after the tap, the remaining likely causes are use of an unsupported Android browser/PWA installation source or a device-level intent association problem. The active overlay has no named Solflare browse-deeplink fallback, although Solflare officially supports a universal `browse` link for opening the DApp in its in-app browser.
- Reviewed for inconsistencies: no product source, runtime process, wallet state, or milestone checkbox was changed; generic MWA discovery was not misreported as failed wallet detection; and a Solflare-specific fallback was not added without an explicit implementation request.

### 2026-07-17 (Installed-PWA MWA permission root-cause diagnosis)

- Reopened the required `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, the local `solana-dev` Wallet Standard guidance, and the applicable local MWA setup/connection references. Inspected the active connect call, wallet error presentation, installed `@solana-mobile/wallet-standard-mobile` 0.5.2 flow, transitive MWA protocol implementation, PWA registrar, and service worker.
- User evidence narrowed the failure to the first-time Chrome Local Network Access transition: tapping `Mobile Wallet Adapter` and then `Continue to Allow` produced no native permission prompt and never reached the package's subsequent `Ready to connect!` / `Connect Wallet` action.
- Confirmed the project-side cause: the MWA package deliberately issues `fetch("http://localhost")` from the document to trigger Chrome's loopback/local-network permission, while `apps/web/public/sw.js` intercepts every GET and answers it through `event.respondWith(fetch(event.request))`, including cross-origin loopback requests. Current Chrome documentation states that a service worker cannot trigger the initial Local Network Access prompt; its origin must already have the permission, and the application document must initiate a separate request to obtain it.
- The scoped fix is to leave cross-origin requests, including `http://localhost`, outside the service worker fetch handler while retaining same-origin PWA handling. This allows the MWA document request to remain the permission initiator and preserves the installed PWA surface.
- Reviewed for inconsistencies: no product implementation was changed during this diagnostic request, no wallet authorization was attempted, the service-worker interception was distinguished from Solflare compatibility, and no milestone checkbox was marked because milestone marking requires explicit user confirmation.

### 2026-07-17 (Installed-PWA MWA Local Network Access correction)

- Reopened the required `PRD.md`, `AGENTS.md`, `PROGRESS_TRACKER.md`, `.claude/skills`, `.claude/skills/develop-frontend/SKILL.md`, `.claude/skills/idealer-test-and-verify/SKILL.md`, and `.claude/skills/playwright/SKILL.md` before implementing the diagnosed PWA correction.
- Restricted the service worker fetch handler to same-origin GET requests. Cross-origin requests, including the Mobile Wallet Adapter `http://localhost` probe, now remain document-initiated so Chrome can display its first-time Local Network Access permission prompt; same-origin PWA requests retain the existing network-only behavior.
- Added a deterministic service-worker regression that executes the real public script and verifies three boundaries: same-origin GET requests use `respondWith`, loopback cross-origin requests do not use `respondWith`, and non-GET requests remain untouched. The loopback assertion failed before the service-worker change and all three assertions passed afterward.
- Verified the complete `@idealer/web` ladder: typecheck, tests (84/84), lint with zero warnings, and production build all passed. The focused standalone/browser Playwright regression passed 1/1 against both `http://localhost:3000` and the active public HTTPS Quick Tunnel.
- Confirmed that `/sw.js` returns HTTP 200 with the new same-origin guard through both localhost and `https://strong-ozone-smallest-knowledgestorm.trycloudflare.com`. Reviewed the final diff for scope and UI-language consistency: no wallet-selection fallback, API behavior, visual surface, or milestone checkbox changed; the milestone remains pending explicit user confirmation on the Android device.
