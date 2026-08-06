# MVP Decision Registry

This registry records binding MVP decisions from `PRD.md` version 1.5.0. Changes to these decisions require a future PRD revision.

| ID | Decision | Status | Source |
|---:|---|---|---|
| 1 | `RULE_MAX_TOKENS` is fixed at `80` for MVP and remains configurable by deployment environment. | Locked | PRD section 16 |
| 2 | Tyche launches as a mobile-first browser DApp with in-wallet browser and mobile wallet deep-link support. PWA capability is included, but installation is not the primary launch path. | Locked | PRD section 16 |
| 3 | Wallet integration remains wallet-adapter neutral, with QA priority for Phantom, Backpack, and Solflare mobile paths. | Locked | PRD section 16 |
| 4 | Full sanitized original rule text is stored on-chain in the `RuleProposal` account. Off-chain copies may exist for indexing, search, analytics, and UI performance. | Locked | PRD section 16 |
| 5 | Rule votes are on-chain through `RuleVote` accounts or an equivalent on-chain account model. MVP does not use off-chain vote commitments as the primary voting record. | Locked | PRD section 16 |
| 6 | The finalist set is exactly 10 rules when at least 10 eligible rules exist: 3 top-voted eligible rules plus 7 VRF-random eligible rules. | Locked | PRD section 16 |
| 7 | Turn duration starts at 2 hours and follows `2h -> 2h -> 8h -> 8h -> repeat`. | Locked | PRD section 16 |
| 8 | The alternative rule pool remains 50% of the post-treasury playable prize pool. If no alternative rule is active or no alternative-rule winners exist, the bucket follows rollover rules. | Locked | PRD section 16 |
| 9 | Creator rewards remain fixed at 15% of a single individual alternative-rule winner payout, funded from the creator reward reserve sourced from platform monetization and subject to reserve and cap. | Locked | PRD section 16 |
| 10 | MVP reserves 20% of platform monetization for the creator reward reserve. Winner-visible payouts must never be reduced to fund creator rewards. | Locked | PRD section 16 |
| 11 | Normal users see simple explanations, status, difficulty labels, and audit links. Detailed compiler reasoning appears only in expandable audit panels and admin/audit views. | Locked | PRD section 16 |
| 12 | Proposed rules cannot be edited after on-chain submission. A user must submit a new paid proposal to change rule text. | Locked | PRD section 16 |
| 13 | MVP supports Portuguese and English rule text. The compiler stores a normalized official interpretation for deterministic DSL/AST compilation. | Locked | PRD section 16 |
| 14 | Rule difficulty shown in the frontend is generated from deterministic analysis where possible and bounded Monte Carlo simulation where needed. | Locked | PRD section 16 |
| 15 | MVP DSL supports prebuilt rule nodes plus a limited bounded expression tree for allowed arithmetic, comparison, counting, intersection, difference, ordering, position access, and bounded removal operations. | Locked | PRD section 16 |
| 16 | `MAX_REMOVABLE_NUMBERS` is fixed at `4` for MVP. | Locked | PRD section 16 |
| 17 | Production MCP tools are limited to bounded MCP server groups. Shell execution, arbitrary filesystem access, arbitrary network access, and direct smart contract mutation remain forbidden. | Locked | PRD section 16 |
| 18 | Long turns use in-app countdowns and return prompts in MVP. Push notifications remain push-notification-ready architecture only. | Locked | PRD section 16 |
| 19 | Production deploys API and worker as separate services from the start. | Locked | PRD section 16 |
| 20 | Optional local observability containers are included under a separate Docker Compose observability profile, not in the default local stack. | Locked | PRD section 16 |
| 21 | M9 Mainnet Readiness Gates are mandatory before M6 can process any real SOL payment, payout, claim, treasury transfer, or creator reward on mainnet. | Locked | PRD section 16 |
| 22 | Launch-blocking metrics are the M9 approval gates plus M6/M7 approval criteria for mobile reliability, automation, claims, abuse visibility, and payout/accounting reconciliation. | Locked | PRD section 16 |
| 23 | Default MVP/testnet fees are guess `0.01 SOL`, rule proposal `0.02 SOL`, paid removal `0.05 SOL`, vote `0 SOL` before turn 100 and `0.005 SOL` from turn 100 onward, report `0 SOL`, and `treasuryFeeBps = 500`. | Locked | PRD sections 8.2 and 16 |
| 24 | The default creator reward cap is `0.25 SOL` per turn, with 20% of platform monetization reserved for the creator reward reserve. | Locked | PRD section 16 |
| 25 | The default minimum claim threshold is `0.005 SOL`; payouts below this threshold roll over to the same category bucket. | Locked | PRD section 16 |
| 26 | The default claim window is 12 turns or 7 days, whichever happens first; expired unclaimed payouts roll over to the same category bucket. | Locked | PRD section 16 |
| 27 | MVP non-economic rate limits are defined in `MVP_RATE_LIMIT_CONFIG` and must be enforced server-side, while on-chain sequence/idempotency constraints remain the source of truth for repeated guesses, rule proposals, vote sequences, and paid removals. | Locked | PRD section 16 |
| 28 | The rule elimination decision phase is a fixed 1-hour window after finalist locking; Game Token holders may cast sequenced elimination votes per finalist, elimination uses the side-specific repeated vote fee schedule, up to 5 finalists can be eliminated, and active election selects from survivors only. | Locked | PRD sections 6.14a and 15.7 |
| 29 | Elected-rule voters share a voter reward equal to 15% of a single individual alternative-rule payout, funded from the creator reward reserve under its own per-turn cap. | Locked | PRD sections 2.4 and 8.8 |

## Open Change Process

1. Update `PRD.md` with the new product decision and rationale.
2. Update this registry with the changed decision.
3. Update impacted implementation contracts before code work starts.
4. Record the change in `PROGRESS_TRACKER.md`.
