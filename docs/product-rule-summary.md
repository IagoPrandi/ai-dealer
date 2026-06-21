# Product Rule Summary

This document summarizes the product rules that must remain stable during MVP implementation. It is derived from `PRD.md` version 1.5.0 and is part of milestone `M0.1 - PRD Baseline`.

## Core Product Position

Idealer is a mobile-first Solana DApp where each turn is a lottery-style game with a community-governed alternative winning rule. The public product experience is a live social game, not an AI infrastructure product, governance protocol, or randomness protocol.

Desktop web is supported as a secondary surface. The primary user experience must work in mobile browsers, in-wallet browsers, and mobile wallet deep-link flows.

## Core Loop

Players pick six unique numbers, submit one guess for the current turn, vote on eligible community-created rules, and watch the draw resolve both the original winning condition and the active alternative rule. The core loop is: pick numbers, vote for the rule, watch the game change.

## Turn Rules

- A turn is the atomic game window.
- The turn duration cycle is fixed for MVP: `2h -> 2h -> 8h -> 8h -> repeat`.
- Each turn has a new draw, a new alternative rule election opportunity, a new prize pool, and independent winner evaluation.
- Six unique numbers from 1 to 100 are drawn using Switchboard VRF.
- Each wallet may submit one guess per turn.

## Winning Conditions

Each turn can evaluate two winning conditions:

- Original rule: exact ordered sequence match.
- Alternative rule: the elected and frozen rule compiled into deterministic DSL/AST.

The original rule and alternative rule are evaluated independently. Each condition receives 50% of the post-treasury playable prize pool. If a category has no winner, or if no alternative rule is active, its bucket follows the rollover policy.

## Rule Creation

- Rule creation is free-form natural language.
- Rule creation must not use fixed templates or force users into predefined categories.
- Rule length is limited by AI-context token count.
- `RULE_MAX_TOKENS` is `80` for MVP and remains configurable by deployment environment.
- MVP supports Portuguese and English rule text.
- Proposed rules cannot be edited after on-chain submission.
- Deduplication and preflight checks must happen before payment through `/api/v1/rules/preflight`.

## Game Token Gating

The current-turn Game Token is an on-chain PDA issued by `submit_guess`. It is required for proposing, voting, removing, and reporting rules in the current turn.

## Rule Election

- Switchboard VRF is used for both number draws and rule election.
- The finalist set is exactly 10 rules whenever at least 10 eligible rules exist.
- The finalist set composition is 3 top-voted eligible rules plus 7 VRF-random eligible rules.
- If fewer than 10 eligible rules exist, all available eligible rules form the finalist set.
- Random finalists must be derived only from fulfilled Switchboard VRF randomness.
- Selection must use ranged VRF output or rejection sampling, not raw modulo reduction.
- Deterministic fallback finalist activation is disallowed.
- Finalists must be precompiled before election.
- After the finalist set is locked, a fixed 1-hour decision/elimination window opens.
- Game Token holders may cast one elimination vote per finalist rule during that window.
- A finalist is eliminated when elimination votes exceed its frozen approval votes.
- At most 5 finalists can be eliminated, ties broken by most elimination votes, then fewest approval votes, then lowest rule id.
- The active rule is selected by a separate active-election VRF over survivors only.

## Paid Rule Removal

Paid rule removal is included in MVP. The removal fee destination is fixed to the prize pool. Removal protection differs between creator self-removal and third-party removal.

## Economy And Rewards

- Default MVP/testnet guess submission fee: `0.01 SOL`.
- Default MVP/testnet rule proposal fee: `0.02 SOL`.
- Default MVP/testnet paid rule removal fee: `0.05 SOL`.
- Vote fee: `0 SOL` before turn 100; `0.005 SOL` from turn 100 onward, paid into the current turn prize pool.
- Elimination vote fee: 2x the effective vote fee, therefore free before turn 100 and `0.01 SOL` from turn 100 onward.
- Report fee: `0 SOL`.
- Default treasury fee: `500 bps`.
- Active rule creator reward: 15% of each individual alternative-rule winner payout.
- Creator rewards are funded from the creator reward reserve sourced from platform monetization and must not reduce winner-visible payouts.
- Elected-rule voter reward: 15% of a single individual alternative-rule winner payout, split equally among the elected rule's voters and funded from the creator reward reserve under its own cap.
- MVP reserves 20% of platform monetization for the creator reward reserve.
- Default creator reward cap: `0.25 SOL` per turn.
- Default minimum claim threshold: `0.005 SOL`.
- Default claim window: 12 turns or 7 days, whichever happens first.

## AI Compiler And Runtime

The AI system compiles user intent into a constrained formal rule artifact. It must not directly decide win or loss. The deterministic game engine and sandboxed rule runtime evaluate winners.

Runtime requirements:

- Execute DSL/AST, not arbitrary generated code.
- Reject unknown AST nodes.
- Enforce timeout, memory, operation count, and AST depth limits.
- Block network, filesystem, imports, randomness, and clock access.
- Prohibit post-draw recompilation.
- Store hashes and compiler/runtime/test harness versions for auditability.

## Admin Console

The admin console is separate from the public DApp. It is for insights, analytics, monitoring, abuse visibility, and operational review. It must not be a direct game manipulation surface.

## Implementation Constraints

- Repository architecture: monorepo.
- Frontend framework: Next.js.
- Local runtime: Docker / Docker Compose.
- Docker Compose project name: `idealer`.
- Production API and worker must deploy as separate services from the start.
- Optional observability containers belong under a separate Docker Compose observability profile.

## Mainnet Constraint

No real SOL payment, payout, claim, treasury transfer, or creator reward may run on mainnet before the mandatory M9 readiness gates pass.
