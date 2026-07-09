# Idealer — Product Requirements Document

> **Version:** 1.5.1
> **Status:** Implementation Baseline — MVP defaults integrated; local/self-hosted LLM support added; rule elimination decision phase added; repeated paid action fee escalation specified
> **Last Updated:** 2026-06-29
> **Primary Product Surface:** Mobile-first DApp  
> **Language:** Portuguese / English technical terms where useful

---

## Table of Contents

1. [Overview](#1-overview)
2. [Core Concepts](#2-core-concepts)
3. [Public Narrative & Market Positioning](#3-public-narrative--market-positioning)
4. [UI/UX Strategy for Attraction, Retention & Repeat Play](#4-uiux-strategy-for-attraction-retention--repeat-play)
5. [Game Mechanics](#5-game-mechanics)
6. [Rule System](#6-rule-system)
7. [AI Rule Compiler, Runtime & Agent Harness](#7-ai-rule-compiler-runtime--agent-harness)
8. [Economy & Tokenomics](#8-economy--tokenomics)
9. [Smart Contract Architecture](#9-smart-contract-architecture)
10. [Backend Architecture](#10-backend-architecture)
11. [Frontend Architecture](#11-frontend-architecture)
12. [Infrastructure](#12-infrastructure)
13. [Security](#13-security)
14. [Product Metrics](#14-product-metrics)
15. [Implementation Milestones & Submilestones](#15-implementation-milestones--submilestones)
16. [Resolved MVP Decisions](#16-resolved-mvp-decisions)
17. [Appendix A — Example User Flows](#appendix-a--example-user-flows)
18. [Appendix B — Product Principle](#appendix-b--product-principle)
19. [Appendix C — Retention Impact of Creator Rewards and Variable Turn Duration](#appendix-c--retention-impact-of-creator-rewards-and-variable-turn-duration)
20. [Appendix D — Review Resolution Matrix](#appendix-d--review-resolution-matrix)

---

## 1. Overview

### 1.1 Product Summary

Idealer is a decentralized, mobile-first on-chain lottery game built on Solana where players bet on sequences of six unique numbers drawn every turn.

What differentiates Idealer from conventional lotteries is its **community-governed rule engine**: players can propose, vote on, and activate alternative winning conditions each turn. These alternative rules are written in natural language, compiled by an AI Rule Compiler into a constrained DSL/AST, tested before activation, frozen before the draw, and executed deterministically by a sandboxed runtime.

The AI system does **not** directly decide `WIN` or `LOSE`. It converts user intent into a formal rule artifact. The deterministic game engine and rule runtime evaluate winners.

The product is not positioned only as a lottery. Idealer is positioned as a **social game of mutable rules**, where the community does not only play the game; it helps define how winning can happen in each round.

### 1.2 Vision

To create a transparent, mobile-native, community-programmable lottery game where the rules of winning are themselves part of the game.

### 1.3 Product Thesis

Traditional lotteries are static: users pick numbers, wait for a draw, and either win or lose. Idealer adds a second layer of participation: the community can propose and vote on alternative ways to win.

This turns each round into a live event driven by:

- luck;
- timing;
- social voting;
- rule creativity;
- public anticipation;
- near-miss narratives;
- transparent on-chain outcomes.

### 1.4 Target Audience

Primary audience:

- crypto-native users familiar with mobile wallets and Solana;
- on-chain gaming players;
- users who enjoy experimental mechanics;
- players attracted to fast, social, transparent games.

Secondary audience:

- rule creators;
- probability/game theory enthusiasts;
- streamers and community hosts;
- spectators who enjoy voting and following live outcomes.

### 1.5 Platform

Idealer is primarily a **mobile-first DApp**.

The main product experience is designed for users opening the app from a mobile browser, wallet browser, or mobile wallet deep link. Desktop web is supported, but it is secondary.

- **Primary Product Surface:** Mobile DApp
- **Primary Access:** Mobile browser, in-wallet browser, wallet deep links
- **Secondary Surface:** Desktop web
- **Chain:** Solana Mainnet
- **Token:** Native SOL
- **Frontend:** Mobile-first Web DApp / PWA
- **Frontend Framework:** Next.js
- **Repository Architecture:** Monorepo
- **Local Runtime:** Docker / Docker Compose
- **Docker Compose Project Name:** `idealer`
- **Container Group Prefix:** `idealer-*`
- **Wallet Support:** Phantom, Backpack, Solflare, and mobile wallet adapters
- **Randomness:** Switchboard VRF for both number draw and rule-election randomness
- **AI Rule Compilation:** Multi-agent AI Rule Compiler harness
- **Local AI Inference (optional):** Local/self-hosted open models (Phi, Llama, Gemma, Qwen) served through an OpenAI-compatible endpoint (Ollama / vLLM / llama.cpp); cloud providers remain available for fallback and escalation
- **Rule Execution:** Deterministic DSL/AST runtime with sandbox limits

### 1.6 Non-Goals

The product should not be presented publicly as an AI infrastructure product, a governance protocol, or a randomness protocol.

Those are trust and execution layers. The user-facing product is a live mobile game where each round can have a new way to win.

---

## 2. Core Concepts

### 2.1 Turn

A **turn** is the atomic unit of the game.

One turn equals one fixed time window composed of **two sequential phases**:

```text
Phase 1 — create & play: propose rules, vote on rules, and pick numbers.
Phase 2 — shortlist & draw: the eligible pool is locked and filtered into the
          10-rule finalist shortlist, players vote finalists out during the
          decision/elimination window, the active rule is elected from the
          survivors, and the draw fires at the end of the turn.
```

In production every turn lasts **24 hours**: **22 hours of phase 1** followed by
**2 hours of phase 2**. The phase boundary is the on-chain rule-election/guess
cutoff (9167 bps of the turn duration ≈ 22h; basis points cannot express 22/24
exactly, so a drift of a few seconds is accepted). Test environments scale the
turn down (e.g. 8-minute turns) while keeping the same two-phase shape.

Each turn is independent:

- a new draw occurs;
- a new alternative rule may be elected;
- a new prize pool forms from that turn's fees;
- the original rule and alternative rule are evaluated independently;
- prizes are distributed or rolled over.

### 2.2 Draw

At the end of each turn, 6 unique numbers between 1 and 100 are drawn using a Verifiable Random Function via Switchboard on Solana.

The draw result is:

- generated on-chain or through a verifiable randomness flow;
- published on-chain;
- visible in the UI;
- used as the reference input for original and alternative rule verification.

### 2.3 Guess

A guess is a player's chosen sequence of 6 unique numbers between 1 and 100.

Rules:

- each wallet may submit any number of guesses per turn, each with its own sequence and fee;
- each guess is recorded before the draw;
- the original rule treats the guess as an ordered sequence;
- the alternative rule may or may not care about order, depending only on the rule text.

### 2.4 Winning Conditions

There are always up to two winning conditions per turn:

| Condition        | Description                                                                               | Pool Share |
| ---------------- | ----------------------------------------------------------------------------------------- | ---------: |
| Original rule    | Exact ordered sequence match                                                              |        50% |
| Alternative rule | Community-elected rule compiled by AI Rule Compiler and executed by deterministic runtime |        50% |

If no alternative rule is active, only the original rule is evaluated and the alternative pool share rolls over according to the rollover policy.

If no winner exists in either category, that category's share accumulates into the next turn's pool.

When an alternative rule is active and produces winners, the creator of the active rule receives a creator reward equal to 15% of each individual alternative-rule winner payout. In addition, the wallets that voted for the elected rule share equally a voter reward equal to 15% of a single individual alternative-rule winner payout. Both rewards are funded from the creator reward reserve sourced from platform monetization and must not reduce the winner payout.

### 2.5 Prize Pool

The prize pool is composed of fees paid by players in that turn.

Sources:

- sequenced guess submission fees, charged as `2^n * GUESS_FEE` where `n` is the number of previous guesses by that wallet in the same turn;
- sequenced rule proposal fees, charged as `2^n * RULE_PROPOSAL_FEE` where `n` is the number of previous rule proposals by that wallet in the same turn;
- paid rule removal fees included in MVP;
- side-specific vote fees, charged as `2^n * VOTE_FEE` where `n` is the number of previous votes by that wallet on the same rule and same side (`in favor` or `vote out`) in the same turn;
- before turn 100, the first same-wallet action in each action scope is free: first guess, first rule proposal, and first same-wallet/same-rule/same-side vote. Repeats start paid immediately at `2^1 * BASE_FEE`;
- optional future game actions.

A protocol treasury fee is retained before distribution.

Default treasury fee:

```text
5% of total turn pool
```

### 2.6 Rule of the Hour

The **Rule of the Hour** is the elected and validated alternative rule for the current turn.

It is elected from the **surviving finalists** after the community decision/elimination window: once the 10-rule finalist set is formed at the start of phase 2 (the end of the create & play phase), a fixed 1-hour decision window lets players cast paid elimination votes against finalists; up to 5 finalists may be eliminated, and the Rule of the Hour is then selected only from the survivors, before the draw at the turn's end (see sections 5.4, 6.12, and 6.14a).

It is the main narrative object of the game.

It should be shown prominently in the UI with:

- rule title;
- rule text;
- simplified explanation;
- creator;
- vote count;
- status;
- countdown;
- result after draw.

---

## 3. Public Narrative & Market Positioning

### 3.1 Product Narrative

Idealer is not positioned to the public as a traditional lottery, nor as a purely technical on-chain randomness protocol.

Its public narrative is:

> **Idealer is the game where every round has a new way to win — and the community helps decide the rules.**

The emotional hook is not only the chance of matching numbers. The core fantasy is that players participate in a living game where luck, creativity, voting, and timing all matter.

Every turn becomes a small public event:

1. players pick numbers;
2. players propose rules;
3. the community votes;
4. one rule becomes the rule of the hour;
5. the draw happens;
6. winners, almost-winners, and rule creators become part of the story.

### 3.2 Core Public Message

The main message used across landing page, social content, onboarding, and product copy should be:

> **Pick your numbers. Vote for the rule. Watch the game change.**

Alternative short-form messages:

- **A lottery where the players change the rules.**
- **Every hour, a new rule. Every round, a new way to win.**
- **Win by luck, timing, or by backing the rule that changes everything.**
- **The draw is random. The rules are social.**
- **The community decides what winning can mean.**

### 3.3 Product Fantasy

The product should make the player feel that each round is alive, social, and unpredictable.

Desired player perception:

- “Something new is happening every round.”
- “My vote can influence how people win.”
- “A smart or funny rule can become the rule of the hour.”
- “Even if I do not win, I want to see which rule wins.”
- “I want to return next round because the game will be different.”

### 3.4 Positioning Statement

For crypto-native players who enjoy mobile DApps, randomness, community mechanics, and on-chain transparency, Idealer is a social lottery game where each round can have a community-created alternative winning rule.

Unlike conventional lotteries, where the experience is static, Idealer makes the rule layer part of the gameplay: players do not only participate in the draw; they help shape what winning can mean in that round.

### 3.5 Audience Segments

#### Primary audience: crypto-native mobile players

Users familiar with wallets, Solana, mobile wallet prompts, and experimental game mechanics.

Motivations:

- fast rounds;
- visible prize pool;
- transparent randomness;
- social mechanics;
- novelty;
- low-friction repeat play.

#### Secondary audience: rule creators

Users who enjoy proposing clever, funny, unusual, or statistically interesting rules.

Motivations:

- social recognition;
- influence over the round;
- reputation;
- creator rankings;
- seeing their rules create winners.

#### Tertiary audience: spectators and casual voters

Users who may not submit a guess every round but enjoy watching, voting, checking winners, and following rule drama.

Motivations:

- low-friction participation;
- entertainment;
- live feed dynamics;
- curiosity about the next rule;
- sharing unusual outcomes.

### 3.6 Narrative Principles

1. **Lead with the game, not the protocol.**
   - Prefer: “Vote for the rule of the round.”
   - Avoid: “Submit governance action to elect an alternative condition.”

2. **Make rules feel like events.**
   - Each active rule should have a name, visual treatment, creator, vote count, and short explanation.

3. **Turn every round into a story.**
   - Show what almost happened: rules that nearly won, players who almost matched, and outcomes that would have changed under another rule.

4. **Separate trust from fun.**
   - Use transparency, VRF, hashes, and compiler/runtime traces as expandable trust details, not as the first thing the user sees.

5. **Make participation meaningful even without winning.**
   - Voting, proposing rules, creator status, near-misses, and public rule history must provide emotional rewards.

---

## 4. UI/UX Strategy for Attraction, Retention & Repeat Play

### 4.1 UX Goal

The UI should make Idealer feel like a live, social, repeatable mobile game — not a static lottery form.

The primary experience is mobile/DApp. Every core flow must work smoothly on small screens, inside wallet browsers, and through mobile wallet transaction prompts.

Primary UX goal:

> **Get users to understand the current round in under 10 seconds and give them a reason to return for the next one.**

A new user should immediately understand:

1. current prize pool;
2. time left in the round;
3. leading or active alternative rule;
4. next available action;
5. why the next round may be different.

### 4.2 Core Screen: Mobile Live Round Hub

The main screen should be a **Mobile Live Round Hub**.

It should be optimized for one-handed use, fast scanning, and repeated short sessions.

Desktop may show a wider dashboard layout, but mobile is the canonical product experience.

Required elements:

- sticky round countdown timer;
- sticky current prize pool summary;
- bottom primary CTA for the next best action;
- leading rule or active rule card;
- swipeable rule voting panel;
- compact recent activity feed;
- near-miss and rule-drama highlights;
- next milestone indicator: voting closes, guesses close, draw begins.

### 4.3 Rule Card UX

Every proposed or active rule should be displayed as a card.

Required fields:

- AI-generated rule title;
- original rule text;
- simplified one-line explanation;
- creator wallet or profile name;
- vote count;
- estimated clarity score;
- estimated difficulty label;
- token count;
- max token limit;
- status: Draft, Preflight Passed, Proposed, Precompiling, Precompiled, Eligible, Top Finalist, Random Finalist, Eliminated, Survived Elimination, VRF Elected, Frozen, Active, Invalidated, Expired.

Example:

```text
Rule of the Hour
“Four-Hit Frenzy”
Win if at least 4 of your numbers appear in the draw, regardless of order.
Difficulty: Hard
Clarity: High
Tokens: 18 / 80
Created by: 8xP...K2m
Votes: 184
```

The rule card is one of the most important UX components in the product. It should make rules feel collectible, social, and understandable.

### 4.4 Mobile Guess Submission UX

Submitting a guess should feel fast, satisfying, and thumb-friendly on mobile.

Requirements:

- number picker optimized first for mobile;
- large tap targets;
- selected numbers visible in a sticky tray;
- one-click randomize option;
- clear pre-transaction confirmation;
- wallet deep-link support;
- graceful handling when the wallet app opens and returns to the DApp;
- post-submit receipt with shareable summary;
- immediate transition into “follow the round” mode after submission.

Post-submit screen should show:

- selected numbers;
- current rule status;
- time until draw;
- whether the current rule appears to depend on order, sum, parity, range, sequence, or another property;
- prompt to vote;
- prompt to share.

The product may show AI-generated hints about the active rule’s interpretation, but it must not transform rule creation into a set of pre-determined combinations.

### 4.5 Rule Proposal UX

Rule proposal is intentionally free-form.

Users write rules directly in natural language.

There are **no pre-determined rule templates**, no required rule categories, and no forced combination builder.

The only structural constraint on rule creation is a maximum token limit measured in AI-context tokens.

Default configuration:

```typescript
const RULE_TOKEN_LIMIT = {
  max_prompt_tokens: 80,
  // Canonical, backend-independent tokenizer. The 80-token limit MUST mean the
  // same thing regardless of which inference provider/model (cloud or local:
  // Phi, Llama, Gemma, Qwen, Claude, ...) is active. Never derive the limit
  // tokenizer from the currently selected model, because tokenizers diverge
  // 10-30% across model families.
  tokenizer: "idealer_canonical_tokenizer_v1",
  enforcement: "server_side",
};
```

Product requirements:

- textarea for natural-language rule input;
- live token counter;
- visible max token limit;
- warning state when approaching the limit;
- hard block when the limit is exceeded;
- AI-generated preview after submission or before payment;
- clarity and ambiguity warning;
- sanitized text preview;
- final confirmation before on-chain proposal.

The interface may suggest examples for inspiration, but examples must not become fixed templates or mechanical rule-building constraints.

Allowed examples:

- “Win if at least 4 of your numbers appear in the draw.”
- “Win if the sum of your numbers equals the sum of the drawn numbers.”
- “Win if all your numbers are lower than the corresponding drawn numbers.”
- “Win if your first number is greater than the last drawn number.”

These examples are educational only. They must not restrict what users can write, as long as the proposed rule fits within the token limit and passes AI rule compilation.

### 4.6 Voting UX

Voting should be treated as a lightweight engagement loop.

Requirements:

- each wallet may vote for the same rule multiple times, given a valid turn Game Token;
- vote cost is side-specific: `2^n * VOTE_FEE`, where `n` is the number of previous votes by that wallet on the same rule and same side in the same turn;
- before turn 100, the first approval vote by a wallet on a rule is free; if that same wallet votes for the same rule again in the same turn, the second approval vote costs `2^1 * VOTE_FEE`, and later votes continue the same exponent sequence;
- from turn 100 onward, the first approval vote by a wallet on a rule costs `2^0 * VOTE_FEE`, and later votes continue the same exponent sequence;
- the next vote fee must be shown before wallet confirmation;
- spectators may browse rules, but the vote CTA asks them to play first;
- voting is visually quick;
- users see current top rules;
- users understand that voting influences the rule finalist set, but VRF still selects the active rule from the survivors;
- users understand that voting for the elected rule can earn a reward when that rule produces winners;
- vote state is obvious: not voted, voted once, repeated votes cast, and next vote cost;
- voting close time is visible.

UX copy example:

```text
Vote for the rule you want to see in the finalist set.
When the create & play phase ends, the system locks 3 top-voted eligible rules and uses Switchboard VRF fulfillment to select 7 additional eligible rules, forming the 10 finalists.
```

Voting is gated by a turn Game Token in MVP. Users without a submitted guess can still browse, share, and follow rules, but voting requires playing the current turn first. This keeps governance tied to actual game participation and reduces low-cost Sybil manipulation.

#### Decision-window (elimination) voting

Once the 10 finalists are locked, a separate 1-hour decision window lets players vote finalists out before the Rule of the Hour is chosen (section 6.14a).

Requirements:

- elimination voting only appears while the decision window is open and only for finalist rules;
- the elimination CTA is visually distinct from the approval vote, so users do not confuse "support" with "vote out";
- the next elimination vote fee must be shown before wallet confirmation;
- each rule card shows its approval votes vs elimination votes, the connected wallet's own vote counts for each side, the next repeat-vote fee where applicable, and whether the rule is currently above the elimination threshold;
- the UI explains, in plain language, that a finalist is eliminated when its elimination votes pass its approval votes, that up to 5 of the 10 can be eliminated, and that the active rule is then drawn from the survivors;
- the decision-window close time and the resulting Eliminated / Survived Elimination states are visible.

UX copy example:

```text
These 10 rules are finalists. You have 1 hour to vote some out.
A rule is eliminated if its "vote out" count passes its support count — up to 5 of the 10 can go.
Your first vote out may be free before turn 100. Repeat votes cost more each time. One surviving rule is then drawn as the Rule of the Hour.
```

### 4.7 Retention Loops

#### Loop 1 — Rule of the Hour

Every round has a highlighted rule narrative.

User motivation:

- “I want to see what the next rule will be.”
- “I want my rule to become active.”

Product requirements:

- rule history;
- creator attribution;
- active rule card;
- shareable rule outcome;
- public archive of previous rules.

#### Loop 2 — Near Misses

After each draw, the system should show how close users were.

Examples:

- “You were 1 number away from winning under the active rule.”
- “Your guess would have won if the second-place rule had been elected.”
- “Your rule received 32 votes but missed the sample.”

Near-miss feedback gives users a reason to try again even when they lose.

#### Loop 3 — Creator Status

Rule creators should have visible reputation.

Metrics:

- rules proposed;
- rules elected;
- total votes received;
- winners created by their rules;
- best rule of the week;
- most controversial rule;
- highest-clarity rule;
- highest-impact rule.

Creator status turns rule design into a game inside the game.

#### Loop 4 — Streaks and Return Prompts

The product should reward repeated participation without making winning the only goal.

Possible streaks:

- voted in 3 consecutive rounds;
- submitted guesses in 5 rounds;
- proposed a rule that received 10+ votes;
- had a rule sampled;
- had a rule elected;
- created a rule that produced a winner.

Streaks should be lightweight and cosmetic at MVP stage.

#### Loop 5 — Public Spectator Feed

The game should be entertaining even before a user plays.

Feed items:

- new rule proposed;
- rule crosses vote milestone;
- rule elected;
- draw completed;
- winner found;
- no winner, pool rolls over;
- user almost won;
- rule creator trending.

### 4.8 Attraction Hooks

Shareable moments:

- “My rule is leading this round.”
- “I almost won under this rule.”
- “This round’s rule is wild.”
- “No one won, pool rolled over.”
- “This rule created 8 winners.”
- “I created the Rule of the Hour.”

Each share card should include:

- rule title;
- round number;
- prize pool;
- outcome;
- link to live or completed round.

### 4.9 Mobile Onboarding UX

First-time experience should explain Idealer in three steps:

```text
1. Pick 6 numbers.
2. Vote for a rule.
3. Watch the draw decide the winners.
```

Only after this should the UI explain deeper mechanics such as VRF, AI verification, and on-chain auditability.

The first session should include a guided demo mode or simulated round so the user can understand the game before committing wallet actions.

Mobile onboarding must also explain wallet connection in plain language:

```text
Connect your wallet to play.
You will confirm actions in your wallet app.
Return to Idealer after approval.
```

The DApp should avoid overwhelming new users with blockchain terminology before they understand the round loop.

### 4.10 UX Copy Guidelines

Use simple, game-first language.

Preferred wording:

- “Rule of the Hour” instead of “Alternative winning condition”;
- “Pick your numbers” instead of “Submit guess”;
- “Vote for this rule” instead of “Cast governance vote”;
- “The draw starts soon” instead of “VRF fulfillment pending”;
- “You almost won” instead of “No claimable prize for this account”;
- “Rule too long” instead of “Prompt token budget exceeded.”

Technical language should remain available in expandable audit panels for advanced users.

---

## 5. Game Mechanics

### 5.1 Player Actions

Each player may perform the following actions per turn.

| Action         |                                                Limit per Turn |      Fee Required |              Game Token Required |
| -------------- | ------------------------------------------------------------: | ----------------: | -------------------------------: |
| Submit a guess | Unlimited; each guess is sequenced per wallet/turn | `2^n * GUESS_FEE`, where `n` is previous guesses by that wallet/turn; first guess is free before turn 100 | No; the first successful guess issues the token |
| Propose a rule | Unlimited; each proposal is sequenced per wallet/turn | `2^n * RULE_PROPOSAL_FEE`, where `n` is previous proposals by that wallet/turn; first proposal is free before turn 100 |                              Yes |
| Vote on a rule | Unlimited; each approval vote is sequenced per wallet/rule/side | `2^n * VOTE_FEE`, where `n` is prior same-side votes by that wallet/rule/turn; first approval vote is free before turn 100 |                              Yes |
| Vote to eliminate a rule | Unlimited per finalist rule during the 1-hour decision window | Same `2^n * VOTE_FEE` schedule on the `vote out` side; first elimination vote is free before turn 100 |                              Yes |
| Remove a rule  |  2x per wallet per turn by default; only before election lock |  Yes, removal fee |                              Yes |
| Report a rule  |                            20x per wallet per turn by default |                No |                              Yes |

### 5.2 Submitting a Guess

Requirements:

- player selects 6 unique numbers between 1 and 100;
- order matters for the original rule;
- order for alternative rule depends only on the elected rule text;
- repeated guesses from the same wallet are accepted when submitted with the next wallet/turn sequence and the required escalated fee;
- guess is recorded before the draw;
- guesses cannot be changed after the submission window closes.

### 5.2.1 Turn Game Token

A successful guess submission issues a **Turn Game Token** for that wallet and turn.

The token is not a tradable asset. It is an on-chain participation credential represented as a PDA derived from:

```text
[b"game_token", turn_id, player_wallet]
```

Game Token requirements:

- created by `submit_guess` after a valid guess is accepted;
- scoped to exactly one `turn_id` and one `player_wallet`;
- required by `propose_rule`, `vote_rule`, paid `remove_rule`, and rule-report governance actions in MVP;
- not transferable;
- not usable across turns;
- closed during turn cleanup so rent can be recovered according to the configured recovery policy;
- validated by the Solana program, not only by backend middleware.

Security rationale:

```text
Play first → receive a turn credential → unlock rule governance for that same turn.
```

This avoids a purely off-chain governance gate and prevents the backend from becoming the sole authority that decides who may propose or vote.

### 5.3 Turn Duration and Phases

> **Revision (2026-07):** the earlier variable duration cycle (`2h → 2h → 8h → 8h`)
> was replaced by a fixed 24-hour turn split into two phases. Milestone entries
> written before this revision still reference the old cycle; the model below is
> the binding one.

Every production turn lasts **24 hours** and is composed of two sequential phases:

```text
Phase 1 — create & play (~22h): rule proposals, approval voting, and guess
          (number picking) submission. Closes at the rule-election/guess
          cutoff: 9167 bps of the turn duration (≈ 22h).
Phase 2 — shortlist & draw (~2h): eligible pool locked, 10-rule finalist
          shortlist formed (3 top-voted + 7 VRF-random), fixed 1-hour
          decision/elimination window, active rule elected from the
          survivors, and the VRF draw at the turn's end.
```

The on-chain 4-slot duration-cycle machinery is retained with equal slots
(`[86400, 86400, 86400, 86400]` seconds), so existing accounts, instructions,
and automation keep working. Test/devnet environments scale the turn duration
down at runtime (`IDEALER_DEVNET_TURN_DURATION_SCALE_BPS`) and shrink the
decision window at build time (`manual-test` → 2 minutes, `devnet-test` → 5
seconds) while preserving the same two-phase shape.

#### Product Rationale

- one turn per day creates a predictable daily appointment: play during the day, come back for the shortlist vote and the draw;
- a long phase 1 gives rules time to gather votes and creators time to campaign;
- a short, concentrated phase 2 turns the shortlist, the elimination voting, and the draw into a single climactic event;
- the fixed schedule removes the confusion of variable turn lengths.

#### Retention Requirements

- always show which phase is active and its own countdown (phase 1 → time to the cutoff; phase 2 → time to the draw at turn end);
- surface the decision/elimination window prominently when it opens;
- add return prompts near the end of each phase;
- use share cards and rule status updates to maintain momentum during phase 1.

### 5.4 Turn Lifecycle

A turn's total duration is the sum of its two phases: **phase 1 — create & play** (rule proposals, approval voting, and guess submission) followed by **phase 2 — shortlist & draw** (finalist shortlist, decision/elimination window, active-rule election, and the draw at the turn's end). The phase boundary is the proportional rule-election/guess cutoff, so the same logic holds at any turn duration (24h in production, minutes on devnet). Rule compilation is amortized during phase 1 instead of being concentrated after the finalist set is formed.

The timer shown to players always counts down the **current phase**: during phase 1 it counts to the cutoff; during phase 2 it counts to the turn's end, when the draw fires.

Recommended default (production: 24h turn = 22h phase 1 + 2h phase 2):

```text
Rule preflight and background precompilation run continuously while phase 1 is open.
Rule proposals, approval voting, and guess submission close together at the phase-1 cutoff (9167 bps ≈ 22h).
Phase 2 starts at the cutoff: the eligible pool is locked and the finalist set of 10 is formed (3 top-voted + finalist-election VRF for 7 random). No active rule is chosen yet.
Decision/elimination window runs for a fixed 60 minutes inside phase 2.
At the end of the decision window: eliminations are applied, the active-election VRF selects one rule from the survivors, and the artifact is frozen.
The VRF draw fires at the end of the turn (24h mark), right after which the turn closes and settlement projects results.
```

For the production 24-hour turn, this maps to:

```text
Rule preflight/precompilation: 0–22h, continuously after each proposal.
Rule proposals, approval voting, and guess submission close at ~22h (9167 bps).
Eligible pool locked and finalist set of 10 formed shortly after 22h (phase-2 start).
Decision/elimination window: ~22h → ~23h (fixed 1 hour).
Active rule elected from survivors and frozen at ~23h.
Draw fires at 24h (turn end); the turn then closes and settles.
```

Generic flow:

```text
Turn N begins
│
├── PHASE 1 — CREATE & PLAY (~22h of a 24h production turn)
│   │
│   ├── [0%] Phase 1 opens
│   │   ├── Players submit guesses
│   │   ├── submit_guess issues a turn-scoped Game Token PDA
│   │   ├── Game Token holders may propose natural-language rules
│   │   ├── Game Token holders may vote (approve) proposed rules
│   │   ├── Rule proposal preflight runs before payment/signature
│   │   │   ├── game token check
│   │   │   ├── token count
│   │   │   ├── prohibited references
│   │   │   ├── rule similarity / deduplication
│   │   │   └── signed preflight_token issued if all gates pass
│   │   └── Valid paid proposals enter background precompilation
│   │       ├── interpret
│   │       ├── normalize
│   │       ├── compile to DSL/AST
│   │       ├── run tests
│   │       ├── classify difficulty
│   │       └── cache precompiled artifact and status
│   │
│   └── [~91.7% = 9167 bps] Phase 1 closes: rule proposals, approval voting,
│       and guess submission end together
│       └── Each finalist's approval (positive) vote count is the value locked here
│
├── PHASE 2 — SHORTLIST & DRAW (~2h)
│   │
│   ├── Finalist set of 10 is locked (no active rule chosen yet)
│   │   ├── Eligible pool is locked from rules with valid precompiled artifacts
│   │   ├── Top-voted finalist subset is locked: 3 rules by default
│   │   ├── Eligible pool hash and top finalist hash are committed
│   │   ├── Switchboard finalist-election VRF request is submitted
│   │   ├── On VRF fulfillment, random finalist subset is derived from the VRF word
│   │   │   └── 7 additional rules by default from the remaining eligible pool
│   │   └── Finalist set is formed: 3 top-voted + 7 VRF-random = 10 by default
│   │
│   ├── DECISION / ELIMINATION WINDOW (fixed 60 minutes, inside phase 2)
│   │   ├── Game Token holders may cast elimination votes against finalists
│   │   │   └── first vote may be free before turn 100; repeated votes use escalating paid fees → prize pool
│   │   ├── A finalist qualifies for elimination when elimination_votes > approval_votes
│   │   ├── At window close, up to 5 finalists are eliminated
│   │   │   ├── if more than 5 qualify, the 5 with the most elimination votes are eliminated
│   │   │   ├── tie-break: fewest approval votes, then lowest rule_id
│   │   │   └── at least 1 survivor is always kept
│   │   └── Eliminated finalists move to ELIMINATED and are excluded from the active election
│   │
│   ├── ACTIVE RULE ELECTION
│   │   ├── Switchboard active-election VRF request is submitted over the survivors
│   │   ├── One rule is selected uniformly from the survivors using ranged VRF output
│   │   ├── Selected precompiled artifact is verified against stored hashes
│   │   └── Valid artifact is frozen before draw
│   │       ├── Active → frozen DSL/AST becomes Rule of the Hour
│   │       └── Invalid/hash mismatch → no alternative rule for that turn; no deterministic fallback to the next survivor
│   │
│   └── Switchboard VRF draw fires at the end of the turn
│       ├── 6 unique numbers published
│       ├── Original rule evaluated deterministically
│       ├── Alternative rule evaluated by rule runtime if active
│       ├── Winners determined by game engine
│       └── Prize distribution initiated
│
└── Turn N ends → close + settlement, and Turn N+1 begins
```

The UI must clearly explain the election mechanic:

```text
When the create & play phase ends, the finalist set is formed from 3 top-voted eligible rules plus 7 eligible rules selected by Switchboard VRF.
A 1-hour decision window then lets players pay to vote out finalists: a finalist is eliminated when its elimination votes pass its approval votes, and up to 5 of the 10 can be eliminated.
Finally, Switchboard VRF selects one rule from the surviving finalists to become the Rule of the Hour, and the numbers are drawn at the end of the turn.
```

Default finalist count is **10**, because the selected policy is `3 top-voted + 7 random`. The PRD must not describe `3 + 6` as 10. After the decision window, between **5 and 10** finalists survive into the final active-rule selection (up to 5 may be eliminated, and at least 1 survivor is always kept).

This prevents users from assuming that the globally most-voted rule automatically wins, while preserving a strong role for voting, a chance for discovery, and a community veto through the elimination window.

### 5.5 Formal Turn State Machine

The turn lifecycle must be represented as an explicit state machine shared by backend, worker, contracts, and `packages/game-engine`.

Primary states:

```text
OPEN
→ VOTING_CLOSED
→ ELIGIBLE_RULE_POOL_LOCKED
→ ELECTION_VRF_REQUESTED
→ ELECTION_VRF_FULFILLED
→ RULE_FINALISTS_SELECTED
→ ELIMINATION_WINDOW_OPEN
→ ELIMINATION_WINDOW_CLOSED
→ ACTIVE_ELECTION_VRF_REQUESTED
→ ACTIVE_ELECTION_VRF_FULFILLED
→ RULE_ELECTED
→ RULE_FROZEN
→ DRAW_PENDING
→ DRAWN
→ VERIFYING
→ FINALIZED
→ CLAIMABLE
→ CLOSED
```

`ELECTION_VRF_REQUESTED` / `ELECTION_VRF_FULFILLED` are the **finalist-election** VRF (used to derive the 7 random finalists and form the 10-rule finalist set). `ACTIVE_ELECTION_VRF_REQUESTED` / `ACTIVE_ELECTION_VRF_FULFILLED` are the **active-election** VRF, run only after the elimination window closes, to select one active rule from the surviving finalists. `ELIMINATION_WINDOW_OPEN` → `ELIMINATION_WINDOW_CLOSED` bound the fixed 1-hour decision phase.

Failure and exception states:

```text
RULE_INVALIDATED
DRAW_FAILED
VERIFICATION_FAILED
ACCOUNTING_FAILED
PAUSED
CANCELLED
```

State transition rules:

- each transition must be idempotent;
- each transition must persist `input_hash`, `output_hash`, and `transition_reason`;
- invalid transitions must be rejected by the game engine;
- frontend must render user-facing states from this state machine, not ad-hoc booleans;
- worker retries must never skip required states;
- contract state, backend state, and audit state must be reconcilable.

### 5.6 Draw Integrity

- draws use Switchboard VRF;
- VRF proofs are publicly auditable;
- draw result is posted on-chain;
- UI displays draw hash, proof reference, and final numbers.

### 5.7 Result Experience

The result screen should show:

- drawn numbers;
- original rule result;
- alternative rule result;
- active rule text;
- winners;
- prize distribution;
- near-misses;
- rule creator outcome;
- next round CTA.

---

## 6. Rule System

### 6.1 Rule Proposal

Any player may propose a rule written in plain natural language.

Rules must describe an alternative winning condition relative to:

- the player’s guess;
- the official draw result;
- the comparison between both.

Each proposal requires payment of the base fee.

Proposed rules enter a public pool visible to all players.

The user-facing experience remains free-form:

> “Write the rule you want this round to use.”

However, rules are only accepted if the AI Rule Compiler can convert them into the supported formal DSL/AST.

### 6.2 Free-Form Input, Formal Execution

Rule creation is not template-based from the user's perspective.

The system must not force users to select pre-determined rule combinations in the UI. Users write natural language.

Internally, the product is **not** fully unconstrained. The natural-language rule must compile into a constrained, auditable DSL/AST. The rule runtime, not the LLM, determines winners.

Product principle:

```text
Free-form writing.
Compiler-assisted rule normalization.
Formal compilation.
Deterministic execution.
```

### 6.2.1 Compiler-Assisted Rule Normalization

The AI Rule Compiler may increment, normalize, and complete a proposed rule when necessary to make it executable, bounded, and consistent with the formal rule constraints.

This normalization does not allow the agent to invent a different game objective. It allows the agent to add objective operational clauses that prevent invalid, undefined, or unsafe execution.

The compiler may add guard clauses for situations such as:

- values leaving the allowed number range;
- division by zero;
- modulo with invalid divisor;
- removal exceeding `MAX_REMOVABLE_NUMBERS`;
- ambiguous ordering or position behavior;
- operations that would otherwise produce undefined results;
- intermediate values exceeding runtime limits.

Example user rule:

```text
Multiply all numbers by 2.
```

Possible official normalized rule:

```text
For each guessed number, multiply it by 2 only if the result remains within the allowed number range of 1 to 100. If multiplying a specific number by 2 would move it outside the range, that number remains unchanged for the purpose of the rule evaluation.
```

The compiler must produce and store:

```typescript
interface RuleNormalizationResult {
  original_text: string;
  normalized_text: string;
  official_interpretation: string;
  added_operational_clauses: string[];
  preserved_intent_explanation: string;
  requires_user_confirmation: boolean;
  normalization_hash: string;
}
```

Normalization requirements:

- the normalized rule must preserve the user's core intent;
- every added clause must be explicit and auditable;
- every added clause must map to a formal DSL/AST node or runtime guard;
- the system must not add clauses that make the rule meaningfully easier, harder, or strategically different unless the user confirms the interpretation;
- vague rules still require clarification and must not be silently normalized into an arbitrary interpretation;
- the normalized text, added clauses, DSL/AST, tests, hashes, compiler/runtime versions, and timestamp must be frozen before the draw.

The product should present the normalized rule as the official rule interpretation before activation.

### 6.3 Token Limit Constraint

The content-size constraint for user-created rules is a maximum number of AI-context tokens.

Default rule:

```text
A proposed rule must not exceed RULE_MAX_TOKENS.
```

Initial recommended value:

```text
RULE_MAX_TOKENS = 80
```

This value is configurable by deployment.

Token limit requirements:

- tokenization must run server-side;
- tokenization must use the fixed canonical tokenizer (`idealer_canonical_tokenizer_v1`), independent of the active inference provider/model, so the limit is stable across cloud and local backends;
- frontend may display an approximate live counter;
- backend is the source of truth;
- rules exceeding the token limit are rejected before payment or on-chain submission;
- the rejection reason must be user-readable;
- token limit should be shown as “Tokens used: X / Y”.

### 6.4 Formal Rule Constraints

A valid rule must be compilable using only the allowed rule domain.

#### 6.4.1 Allowed Inputs

Rules may only reference:

```text
guess
draw
```

Where:

- `guess` = the player's 6 selected numbers;
- `draw` = the official 6 drawn numbers.

#### 6.4.2 Allowed Operations

Allowed operations:

```text
sum
subtraction
multiplication
defined division
modulo
comparison
counting
intersection
difference
ordering
position/index access
remove up to N numbers
```

Conditional operation rules:

- division is allowed only when the divisor is proven non-zero;
- modulo is allowed only with a positive divisor;
- position-based logic is allowed only when the rule explicitly references position or order;
- “remove up to N numbers” must respect a configured maximum `MAX_REMOVABLE_NUMBERS`;
- operations must be finite, deterministic, and bounded.

Initial recommendation:

```text
MAX_REMOVABLE_NUMBERS = 4
```

#### 6.4.3 Prohibited References and Behaviors

Rules must not reference or depend on:

```text
wallet
votes
prize pool
historical turns
current time / clock / schedule
external data
network access
files
imports
randomness
APIs
other players
social data
creator identity
admin data
LLM provider identity
```

Rules must not:

- instruct the AI system to ignore its instructions;
- contain executable code;
- require imports or libraries;
- require filesystem access;
- require network access;
- require randomness;
- require hidden state;
- be trivially always true;
- be impossible by definition;
- be vague after clarification.

### 6.5 DSL/AST Rule Representation

The preferred compiled artifact is DSL/AST, not arbitrary code.

Example:

```json
{
  "type": "MATCH_COUNT_AT_LEAST",
  "minMatches": 4,
  "orderSensitive": false
}
```

Another example:

```json
{
  "type": "SUM_COMPARISON",
  "left": { "source": "guess", "op": "sum" },
  "operator": "=",
  "right": { "source": "draw", "op": "sum" }
}
```

The DSL must be:

- versioned;
- serializable;
- hashable;
- testable;
- executable by `packages/rule-runtime`;
- rejected if it contains unknown nodes;
- rejected if complexity exceeds configured limits.

Required DSL metadata:

```typescript
interface CompiledRuleArtifact {
  rule_id: string;
  turn_id: string;
  original_text: string;
  normalized_text: string;
  official_interpretation: string;
  added_operational_clauses: string[];
  normalization_hash: string;
  preserved_intent_explanation: string;
  dsl_version: string;
  ast: RuleAstNode;
  compiler_version: string;
  runtime_version: string;
  test_harness_version: string;
  // Model identity for reproducible auditing (cloud or local provider).
  model_provider: string; // "anthropic" | "openai" | "ollama" | "vllm" | ...
  model_name: string; // e.g. "phi4", "qwen2.5:14b-instruct-q4_K_M"
  model_digest?: string; // sha256 of the weights for local/self-hosted models
  model_quantization?: string; // "Q4_K_M" | "Q8_0" | "FP16" | ...
  serving_engine?: string; // "ollama@x.y" | "vllm@x.y" | "llamacpp"
  constrained_decoding_used: boolean; // grammar/schema-constrained decoding applied
  complexity_score: number;
  difficulty_class: RuleDifficultyClass;
  created_at: string;
  frozen_at?: string;
  artifact_hash: string;
}
```

### 6.6 Vague Rule Rejection and Clarification

Vague rules must not be accepted silently.

Examples of vague rules:

- “Win if the numbers are close to the draw.”
- “Win with beautiful numbers.”
- “Win if the combination is similar.”
- “Win if the guess feels balanced.”

The compiler must reject these unless it can generate an objective interpretation and the user explicitly confirms it before election.

Clarification UX example:

```text
Your rule uses “close”, but that is not objective.
Do you mean “absolute difference ≤ 3 by position”?
Confirm this interpretation or edit your rule.
```

Confirmed interpretation must be stored as part of the frozen rule artifact.

### 6.7 Operational Clause Policy

Operational clauses are compiler-added clauses that make a rule safe and executable without changing the user's core intent.

Allowed operational clauses include:

- range guards;
- defined division guards;
- modulo validity guards;
- bounded removal guards;
- explicit order/position interpretation when the original text clearly implies it;
- finite iteration bounds;
- deterministic tie-handling for rule-internal comparisons;
- no-op fallback for transformations that would produce invalid values.

Operational clauses are not allowed to:

- add external data dependencies;
- add randomness;
- reference wallet identity, votes, prize pool, historical turns, time, or other players;
- change the winner objective into a different game;
- make an impossible rule valid by inventing a new objective;
- make a vague rule objective without user confirmation.

Example operational guard:

```text
If an arithmetic transformation produces a value outside 1..100, the transformation for that specific number is skipped and the original value is retained.
```

Corresponding DSL/AST pattern:

```json
{
  "type": "MAP_NUMBERS_WITH_GUARD",
  "source": "guess",
  "operation": { "type": "MULTIPLY", "value": 2 },
  "guard": { "type": "RANGE_INCLUSIVE", "min": 1, "max": 100 },
  "onGuardFail": "KEEP_ORIGINAL"
}
```

### 6.8 Difficulty Analysis

Every compiled rule must receive a difficulty classification.

Required classes:

```text
IMPOSSIBLE
ALWAYS_TRUE
TOO_EASY
BALANCED
HARD
EXTREME
```

Minimum behavior:

- `IMPOSSIBLE` rules are rejected;
- `ALWAYS_TRUE` rules are rejected;
- `TOO_EASY` rules may be rejected, capped, or flagged depending on game configuration;
- `BALANCED`, `HARD`, and `EXTREME` may be accepted if they pass test harness and security checks.

Difficulty analysis should use a combination of:

- symbolic analysis when possible;
- generated test cases;
- bounded Monte Carlo simulation;
- historical metrics for similar DSL patterns;
- rule complexity score.

Monte Carlo must be explicitly bounded.

Initial configuration:

```typescript
const MONTE_CARLO_DIFFICULTY_CONFIG = {
  max_samples: 100_000,
  timeout_ms: 5_000,
  convergence_threshold: 0.01,
  min_samples_before_convergence_check: 10_000,
  seed_strategy: "deterministic_test_seed",
};
```

Rules for Monte Carlo analysis:

- never run unbounded simulations;
- stop when timeout or convergence threshold is reached;
- record `samples_run`, `runtime_ms`, `estimated_win_rate`, and `confidence_interval`;
- prefer analytical probability for known DSL nodes when available;
- never allow difficulty analysis to block the turn lifecycle after election cutoff;
- if difficulty cannot be confidently estimated within bounds, mark the rule for conservative review or reject it according to policy.

The UI may show a simplified difficulty label, but the internal classification and estimation metadata must be stored for auditability and game-health monitoring.

### 6.9 Rule Test Harness Requirements

Before activation, every compiled rule must be tested by `packages/rule-test-harness`.

Test coverage must include:

- at least one expected winning case;
- at least one expected losing case;
- boundary cases;
- impossible-rule detection;
- always-true detection;
- too-easy detection;
- invalid arithmetic cases, such as division by zero;
- order-sensitive vs order-insensitive behavior;
- position/index boundaries;
- remove-up-to-N behavior;
- AST serialization/deserialization stability.

The rule must not become active unless the test harness passes.

### 6.10 Rule Freezing Before Draw

The active rule must be frozen before the draw.

The frozen artifact must include:

```text
original rule text
normalized rule text
official interpretation
DSL/AST artifact
artifact hash
test cases
test results
compiler version
runtime version
test harness version
agent versions
model identity (provider, model name, weights digest, quantization, serving engine)
constrained-decoding flag
MCP server/tool versions
timestamp
creator wallet
turn id
```

Once frozen:

- the original text cannot be edited;
- the official interpretation cannot be changed;
- the DSL/AST cannot be regenerated for that turn;
- the test suite cannot be replaced;
- winner evaluation must use only the frozen artifact.

This prevents changing interpretation after the draw result is known.

### 6.11 Paid Rule Removal, Report, Moderation and Automatic Invalidation

Paid rule removal is part of the MVP.

The purpose of paid removal is to let current-turn participants suppress low-quality, abusive, or clearly bad rules before the election pool is locked, without allowing free griefing against popular rules.

Paid removal requirements:

- only wallets with a current-turn Game Token may remove rules;
- removal is allowed only while the turn is `OPEN` and before the eligible rule pool is locked;
- active, frozen, VRF-elected, finalist-set, expired, invalidated, and already removed rules cannot be removed by paid player action;
- removal requires a paid `RULE_REMOVAL_FEE` transaction;
- the removal fee destination is fixed to `prize_pool` in MVP;
- the fee is added to the current turn prize pool and follows normal treasury/prize-pool accounting;
- the fee destination is not configurable in MVP, so UX copy can state clearly: “Esse valor vai para o pool de prêmios.”;
- every removal creates a `RuleRemovalRecord` and audit log entry;
- removal is idempotent and cannot be applied twice to the same rule;
- removal must not delete historical data; it only changes rule status to `REMOVED_PAID`.

Differentiated vote protection:

```typescript
const RULE_REMOVAL_CONFIG = {
  removalFeeDestination: "prize_pool",
  minVotesCreatorSelfRemove: 5,
  minVotesThirdPartyRemove: 15,
  requireGameToken: true,
  allowedBeforeEligiblePoolLockOnly: true,
};
```

Removal protection rules:

- the creator cannot remove their own rule once it has at least `MIN_VOTES_CREATOR_SELF_REMOVE` votes;
- a third party cannot remove another user’s rule once it has at least `MIN_VOTES_THIRD_PARTY_REMOVE` votes;
- the system may still invalidate a rule for formal/security reasons through validation, abuse scoring, or restricted operator/security review;
- system invalidation is separate from paid player removal and must be logged with a reason.

UX requirements:

- show the removal fee before wallet confirmation;
- show whether the user is the creator or a third-party remover;
- show current vote count and the applicable protection threshold;
- block removal before payment if the rule is protected by threshold;
- show clear copy: “Remover esta regra custa X SOL. Esse valor vai para o pool de prêmios.”;
- after removal, show the rule as `Removed` rather than deleting it from history.

The product also supports:

- report rule;
- automatic invalidation;
- abuse scoring;
- restricted operator/security review for exceptional cases only;
- audit log for every removal and invalidation.

Rationale:

- requiring payment discourages casual griefing;
- vote thresholds protect rules that already have community momentum;
- fixing the fee destination to the prize pool avoids UX/compliance mismatch;
- invalidation remains based on formal constraints and safety policy, not social conflict.

### 6.12 Rule Election by Finalist Set

The Rule of the Hour is elected in **two VRF-backed steps separated by the decision/elimination window** (section 6.14a):

1. **Finalist election** — at the start of phase 2 (the end of the create & play phase), a Switchboard finalist-election VRF request forms the 10-rule finalist set (3 top-voted + 7 random). No active rule is chosen here.
2. **Active election** — after the fixed 1-hour decision window closes and eliminations are applied, a second Switchboard active-election VRF request selects one active rule from the surviving finalists.

Default finalist-election configuration:

```typescript
const RULE_ELECTION_CONFIG = {
  topVotedFinalistCount: 3,
  randomFinalistCount: 7,
  defaultFinalistSetSize: 10,
  randomnessProvider: "switchboard_vrf",
  deriveRandomFinalistsFromFulfillment: true,
  selectionMethod: "vrf_ranged_output",
  requirePrecompiledEligibleFinalists: true,
  fallbackToNextFinalistOnInvalid: false,
  // The finalist-election VRF only forms the 10-rule set; the active rule is
  // selected by a separate active-election VRF after the elimination window.
  activeRuleElectedAfterEliminationWindow: true,
};
```

Default elimination configuration (decision window, section 6.14a):

```typescript
const RULE_ELIMINATION_CONFIG = {
  decisionWindowMinutes: 60,                          // fixed 1-hour window, separate from the play window
  maxEliminatedRules: 5,                              // up to 5 of the 10 finalists may be eliminated
  eliminationCriterion: "elimination_votes > approval_votes",
  overflowSelection: "most_elimination_votes",        // when more than 5 qualify, eliminate the 5 with the most elimination votes
  overflowTiebreak: ["fewest_approval_votes", "lowest_rule_id"], // deterministic, auditable tie-break
  minSurvivors: 1,                                    // never eliminate the last surviving finalist
  effectiveMaxEliminated: "min(maxEliminatedRules, finalistCount - minSurvivors)",
  approvalVoteCountLockedAt: "finalist_set_lock",     // positive-vote count frozen when the 10 finalists lock
  eliminationVoteBaseFeeMultiplier: 1,                // elimination vote side uses the same VOTE_FEE base
  repeatedEliminationVoteFeeMultiplier: 2,            // same-wallet/same-finalist same-side exponent multiplier
  eliminationVoteFeeDestination: "prize_pool",
  requireGameToken: true,
  allowRepeatedEliminationVotesPerFinalist: true,
  firstEliminationVoteFreeBeforeTurnIndex: true,
  maxEliminationVotesPerWalletFinalistTurn: 20,
  activeRuleSelectedFromSurvivorsOnly: true,
};
```

Finalist-election flow (end of play window):

1. filter the eligible rule pool to rules with valid precompiled artifacts;
2. lock the eligible pool and persist `eligible_pool_hash`;
3. select the 3 highest-voted eligible rules as the top-voted subset;
4. persist `top_voted_finalist_hash`;
5. submit a Switchboard finalist-election VRF request using the election commitment;
6. after VRF fulfillment, derive 7 additional random finalists from the remaining eligible pool using the fulfilled VRF word, not request entropy;
7. form the finalist set from `top_voted_finalists + random_finalists` and persist `finalist_set_hash`;
8. lock each finalist's **approval (positive) vote count** as the value used by the elimination criterion;
9. open the decision/elimination window (no active rule chosen yet).

Active-election flow (after the decision window closes):

1. compute eliminations from the elimination votes (section 6.14a): a finalist qualifies when `elimination_votes > approval_votes`; eliminate up to 5, choosing the 5 with the most elimination votes when more than 5 qualify, always keeping at least 1 survivor;
2. mark eliminated finalists as `ELIMINATED` and persist `eliminated_finalist_hash`;
3. submit a Switchboard active-election VRF request over the surviving finalists;
4. select one active rule uniformly from the survivors using VRF ranged output or equivalent rejection-sampling utility;
5. verify that the selected rule's precompiled artifact hash matches the stored artifact;
6. freeze the selected artifact as the active alternative rule for the turn;
7. if the selected artifact is unavailable, invalid, or hash-mismatched, no alternative rule is active for that turn and the alternative pool follows rollover rules.

The system must not use:

- Chainlink VRF for Solana MVP;
- backend-generated randomness for finalist selection or active selection;
- VRF request transaction hash as entropy;
- `vrf_random_word % survivor_pool_size` when a ranged-output helper or rejection sampling is available;
- deterministic fallback to the next survivor after an invalid selected rule;
- the finalist-election VRF word to also select the active rule (the survivor set is unknown until the elimination window closes, so a separate active-election VRF is required).

If fewer than 10 eligible rules exist, the finalist set is formed from the available eligible rules and `effectiveMaxEliminated` still keeps at least 1 survivor. If zero eligible rules exist, no alternative rule is active for the turn and the decision window is skipped.

The UI must clearly communicate:

```text
The highest-voted rule overall does not automatically win.
Three top-voted eligible rules enter the finalist set, seven more are selected by verified randomness.
A 1-hour decision window then lets players pay to vote finalists out (up to 5 of 10), and one surviving finalist is randomly elected.
```

### 6.13 Rule Scope and Mandate-Based Re-Proposal Gate

- each rule is scoped to a single turn;
- rules do not automatically carry over;
- historical rules are archived and viewable;
- frozen artifacts remain immutable for auditability.

**Re-proposal policy (implemented).** A rule that has already held a **mandate** — i.e. was elected as the active Rule of the Hour in a past turn — cannot be proposed again **verbatim**. It may only return if the new proposal adds a **differentiating condition** (an additional clause in the DSL), so a re-used rule is always a new, more specific rule rather than a blind repeat.

This replaces the earlier time-based re-proposal cooldown: there is no fixed N-turn waiting period. The constraint is on **identity**, not time — a mandated rule is blocked forever in its verbatim form, and is allowed back the moment it is meaningfully differentiated by an added condition.

Identity is the rule's **meaning, not its text**. Two proposals are "the same rule" when their **canonical compiled AST signature** matches. The signature is computed over a canonicalized AST so it cannot be bypassed cosmetically:

- `and`/`or` clauses are flattened, de-duplicated, and order-normalized;
- a single-clause `and`/`or` collapses to its clause (`and[X]` ≡ `X`);
- double negation collapses (`not[not[X]]` ≡ `X`);
- commutative operands are ordered (`and`/`or` clauses, `intersection`, `arith add`/`mul`).

Therefore reordering, wrapping, or other trivial edits do **not** unlock a repeat; only a substantive added clause (the "activation condition") changes the signature and is accepted.

```typescript
const RULE_REPROPOSAL_CONFIG = {
  // Rules whose canonical AST signature was elected active in any past turn.
  blockSignaturesThatHeldMandate: true,
  // A blocked rule is allowed back only when an added DSL clause changes its
  // canonical signature. There is no time-based cooldown.
  allowReuseWithDifferentiatingCondition: true,
};
```

The gate runs in the free preflight: when the compiled rule's signature is already mandated, preflight returns `reproposalBlocked: true` and the proposal/payment is refused with a message instructing the player to add a condition. The mandated signature set is derived from settled elections and their frozen compiled artifacts.

> A mandate-holding rule whose frozen AST is unavailable cannot be signed and therefore cannot be matched/blocked; the gate degrades safely rather than failing closed.

### 6.14 Voting, Game Token Gate and Basic Anti-Sybil

Voting rules:

- voting is free for a wallet's first approval vote on a given rule in turns before index 100; from turn 100 onward, that first approval vote requires a `VOTE_FEE` paid to the prize pool;
- a wallet may cast repeated approval votes for the same rule in the same turn;
- the approval vote fee is `2^n * VOTE_FEE`, where `n` is the number of previous approval votes by the same wallet on the same rule in the same turn;
- before turn 100, the first approval vote by the same wallet on the same rule is free; the second costs `2^1 * VOTE_FEE`;
- from turn 100 onward, the first approval vote by the same wallet on the same rule costs `2^0 * VOTE_FEE`;
- a current-turn Game Token is always required to vote, regardless of the fee;
- each wallet must hold a valid Turn Game Token PDA for the current turn to vote;
- each successful approval vote counts as one additional approval vote for that rule;
- approval votes are recorded on-chain through the `RuleVote` account/instruction path with a per-wallet/rule sequence or equivalent idempotent repeated-vote model;
- votes do not carry over;
- users can see top rules and vote count;
- voter reward eligibility (section 8.4) is wallet-unique and derived from whether the wallet has at least one recorded `RuleVote` for the elected rule; repeated votes do not multiply the wallet's reward share.

Vote fee configuration:

```typescript
const VOTE_FEE_CONFIG = {
  freeBeforeTurnIndex: 100,       // turns with index < 100 vote for free
  feeAppliesFromTurnIndex: 100,   // from turn 100 onward, the first same-wallet/same-rule vote requires VOTE_FEE
  voteFeeLamports: 5_000_000,     // 0.005 SOL (MVP/devnet default, configurable per environment)
  feeDestination: "prize_pool",   // same destination as the paid rule removal fee
  requireGameToken: true,         // Game Token gate applies to every turn
  allowRepeatedVotesPerRule: true,
  firstVoteFreeBeforeTurnIndex: true,
  repeatedVoteStartsPaidBeforeTurnIndex: true,
  repeatedVoteFeeMultiplier: 2,
  maxApprovalVotesPerWalletRuleTurn: null, // no fixed vote cap; sequence fee is the economic control
};
```

Approval vote fee sequence for the same `(turn, wallet, rule)`:

```text
turn_index < 100  → vote #1 = 0; vote #2 = 2 × VOTE_FEE; vote #3 = 4 × VOTE_FEE; vote #4 = 8 × VOTE_FEE; ...
turn_index >= 100 → vote #1 = VOTE_FEE; vote #2 = 2 × VOTE_FEE; vote #3 = 4 × VOTE_FEE; ...
```

Because free voting by wallet is easy to manipulate, MVP must include basic anti-Sybil controls and monitoring.

Required controls:

- require a current-turn Game Token for voting and proposing;
- do not cap paid vote actions or paid rule proposals; enforce correct sequencing, idempotency, and escalating fees instead;
- track wallet age or first-seen timestamp;
- track participation signals;
- detect vote clusters;
- detect sudden concentration by newly seen wallets;
- expose public vote concentration and repeated-vote fee metrics in the transparency console;
- generate suspicious voting alerts.

The MVP does not need perfect Sybil resistance, but it must make manipulation visible and make governance actions costlier than creating fresh wallets.

### 6.14a Rule Elimination Voting (Decision Window)

After the 10-rule finalist set is locked at the start of phase 2 (the end of the create & play phase), a fixed **1-hour decision/elimination window** opens before the active rule is elected. During this window, players can pay to vote finalists out of contention. This gives the community a veto over the finalist set while preserving the role of approval voting and verified randomness.

Elimination voting rules:

- the decision window lasts a fixed 60 minutes and runs inside phase 2 of the turn (the ~2h tail between the phase-1 cutoff and the draw at the turn's end), so the turn's total duration already includes it;
- only wallets holding a valid current-turn Game Token may cast elimination votes;
- elimination votes may only target rules in the current finalist set, and only while the window is open;
- each wallet may cast repeated elimination votes against the same finalist rule in the same turn;
- the elimination vote fee is `2^n * VOTE_FEE`, where `n` is the number of previous elimination votes by the same wallet against the same finalist in the same turn;
- before turn 100, the first elimination vote by a wallet against a finalist is free; the second costs `2^1 * VOTE_FEE`;
- from turn 100 onward, the first elimination vote by a wallet against a finalist costs `2^0 * VOTE_FEE`;
- each successful elimination vote counts as one additional elimination vote against that finalist;
- elimination votes are recorded on-chain through a dedicated `RuleEliminationVote` account/instruction path with a per-wallet/rule sequence or equivalent idempotent repeated-vote model, distinct from the approval `RuleVote` path;
- elimination votes do not carry over to other turns;
- approval (positive) vote counts used by the elimination criterion are frozen when the finalist set locks; elimination votes accrue during the window and are compared at window close.

Elimination vote fee sequence for the same `(turn, wallet, finalist_rule)`:

```text
turn_index < 100  → vote #1 = 0; vote #2 = 2 × VOTE_FEE; vote #3 = 4 × VOTE_FEE; vote #4 = 8 × VOTE_FEE; ...
turn_index >= 100 → vote #1 = VOTE_FEE; vote #2 = 2 × VOTE_FEE; vote #3 = 4 × VOTE_FEE; ...
```

Elimination resolution at window close:

- a finalist **qualifies for elimination** when its elimination votes are strictly greater than its frozen approval votes (`elimination_votes > approval_votes`);
- at most **5** finalists may be eliminated;
- if **more than 5** finalists qualify, the **5 with the most elimination votes** are eliminated; ties are broken deterministically by fewest approval votes, then by lowest `rule_id`;
- at least **1 survivor** is always kept, so when fewer than 10 finalists exist the effective cap is `min(5, finalistCount − 1)`;
- eliminated finalists transition to `ELIMINATED` (section 6.16), are excluded from the active-election VRF, and remain visible in history and audit views;
- the active rule is then VRF-selected uniformly from the surviving finalists only (section 6.12).

Anti-abuse and integrity:

- the escalating repeat-vote fee and the Game Token gate make coordinated elimination costlier than creating fresh wallets;
- elimination votes feed the same vote-concentration monitoring and suspicious-activity alerts as approval votes;
- elimination tallies, the qualifying set, the eliminated set, and `eliminated_finalist_hash` are persisted for auditability.

### 6.15 Rule Preflight and Canonical-Signature Re-Proposal Gate

Preflight is the free pre-submission gate that runs before the user pays the rule
proposal fee or signs the proposal transaction. It does the safety, verifiability,
and re-proposal checks so that payment is only ever spent on an accepted rule.

This section **supersedes the earlier semantic-embeddings deduplication design**.
Rule identity is the rule's **compiled meaning**, compared by the canonical AST
signature defined in Section 6.13 — not by natural-language text similarity or
embeddings. There is no `preflight_token` and no `RuleDedupResult`; the gate is
deterministic.

Preflight checks (in order):

```text
1. rule text is present and within the byte limit
2. token count is within RULE_MAX_TOKENS
3. prohibited references / prompt-injection absent
     (deterministic patterns + optional Granite Guardian jailbreak classifier)
4. the rule COMPILES to a verifiable DSL/AST (the verifiability gate)
5. (optional) Granite Guardian groundedness: the official interpretation is
     faithful to the rule
6. re-proposal gate: the compiled rule's canonical AST signature has NOT already
     held a mandate (Section 6.13)
```

A check that fails sets `decision: "INVALID"` and/or a specific block flag; a
verifiable, safe, non-repeat rule returns `decision: "VALID"`.

Preflight endpoint:

```http
POST /rule-preflight
```

Response shape (implemented):

```typescript
interface RulePreflightResult {
  decision: "VALID" | "INVALID";
  needsClarification: boolean;
  reproposalBlocked: boolean;      // already held a mandate (Section 6.13)
  reasonSummary: string;
  compiledArtifactHash: string | null;
  ruleMode?: "predicate" | "ranking";
  difficultyClass?: string;        // label only, never a gate
  finalConfidence?: number;
  guardianChecked?: boolean;
  guardianGrounded?: boolean;
  // dealer-facing fields: normalizedText, officialInterpretation,
  // addedOperationalClauses, dealerMessage, and the canonical hashes that bind
  // the on-chain proposal.
}
```

Implementation requirements:

- the re-proposal gate uses the canonical AST signature (Section 6.13), so minor
  numeric or structural differences that change the actual winning logic are
  treated as different rules, while cosmetic edits are not;
- a re-proposal that is blocked must surface a clear, user-readable reason telling
  the player to add a differentiating condition;
- the verifiability gate (step 4) is the authoritative off-topic/garbage filter:
  anything that cannot compile to a guess/draw-only AST is rejected;
- gate outcomes are recorded as gate-check logs, separate from compiler logs;
- `RuleCompilationResult` must not include any text-similarity or dedup fields.

### 6.16 Formal Rule State Machine

Rules are first-class game objects and must have a formal state machine shared by frontend, backend, worker, and contracts where applicable.

Primary rule states:

```text
DRAFT
→ PREFLIGHT_PENDING
→ PREFLIGHT_PASSED
→ PROPOSED
→ PRECOMPILING
→ PRECOMPILED_VALID
→ ELIGIBLE_FOR_ELECTION
→ FINALIST_SET_MEMBER
→ SURVIVED_ELIMINATION
→ VRF_ELECTED
→ FROZEN
→ ACTIVE
→ EXPIRED
```

Failure and exception states:

```text
PREFLIGHT_BLOCKED
PRECOMPILATION_FAILED
NEEDS_CLARIFICATION
REJECTED_UNSUPPORTED
REJECTED_DUPLICATE
REJECTED_TOO_EASY
REJECTED_ALWAYS_TRUE
REJECTED_IMPOSSIBLE
REPORTED
REMOVED_PAID
ELIMINATED
INVALIDATED
CANCELLED_BY_TURN_END
```

State transition requirements:

- each transition persists `input_hash`, `output_hash`, `transition_reason`, `actor`, and timestamp;
- `LEADING` is a derived UI label, not a durable state;
- `TOP_FINALIST` and `RANDOM_FINALIST` are finalist membership labels derived from election records;
- a rule can become `REMOVED_PAID` only before eligible pool lock and only through a paid `remove_rule` action that passes threshold checks;
- a `REMOVED_PAID` rule is excluded from election, cannot become a finalist, and remains visible in history/audit views;
- a `FINALIST_SET_MEMBER` can transition to `ELIMINATED` only at the close of the decision/elimination window, when it meets the elimination criterion and is within the eliminated set (section 6.14a); an `ELIMINATED` rule is excluded from the active-election VRF and remains visible in history/audit views;
- only a finalist that reaches `SURVIVED_ELIMINATION` (was not eliminated) is eligible for the active-election VRF and may become `VRF_ELECTED`;
- a rule can only become `ACTIVE` from `FROZEN`;
- a rule can only become `FROZEN` if the precompiled artifact hash matches the selected active-election artifact;
- invalid transitions are rejected by `packages/game-engine`;
- the UI must render from this state model and derived labels, not ad-hoc booleans.

### 6.17 Rule Precompilation Cache

The system must precompile proposed rules in the background during the turn.

Cache requirements:

```typescript
interface RulePrecompilationCacheEntry {
  rule_id: string;
  turn_id: string;
  original_text_hash: string;
  normalized_text_hash?: string;
  compiled_artifact_hash?: string;
  status: "PENDING" | "VALID" | "FAILED" | "NEEDS_CLARIFICATION";
  confidence_breakdown?: CompilerConfidenceBreakdown;
  difficulty_class?: RuleDifficultyClass;
  test_summary?: RuleTestSummary;
  compiler_version?: string;
  runtime_version?: string;
  test_harness_version?: string;
  created_at: string;
  updated_at: string;
}
```

The election pool may include only rules with `status = VALID` and a hashable compiled artifact. This avoids a 1-hour turn depending on last-minute LLM latency after election cutoff.

### 6.18 Rule Validation Philosophy

The AI system validates whether the natural-language rule can be compiled and whether the compiled artifact matches the user's confirmed intent.

The AI system does **not** decide final `WIN`/`LOSE` outcomes.

The validation question is:

> “Can this rule be converted into a constrained formal artifact and executed deterministically using only the draw and the player guess?”

## 7. AI Rule Compiler, Runtime & Agent Harness

### 7.1 Role: AI Rule Compiler, Not Winner Judge

The AI system is a **rule compiler**, not the final winner judge.

It does not directly decide `WIN` or `LOSE` for player guesses.

Instead, it converts a natural-language rule into a constrained, auditable DSL/AST artifact. The deterministic game engine and sandboxed rule runtime execute the compiled artifact against `guess` and `draw`.

Core principle:

```text
AI compiles intent.
Runtime executes logic.
Game engine determines winners.
```

This design improves auditability, reduces disputes, and prevents post-draw reinterpretation of rules.

#### Determinism Boundary

LLM generation is non-deterministic by nature. Even with `temperature = 0` and a fixed `seed`, identical inputs may produce different outputs across runs, hardware, batch sizes, and provider/engine versions; reproducibility is best-effort only and must never be assumed.

Game integrity does **not** depend on reproducible generation. It derives from:

- freezing the compiled artifact before the draw (Section 6.10);
- executing only that frozen DSL/AST in the deterministic sandbox (Section 7.7).

The same `guess`, `draw`, and frozen artifact always produce the same winner result, regardless of which model compiled the rule. This is precisely why **local/self-hosted models (Phi, Llama, Gemma, Qwen) are fully compatible**: the model compiles intent, but never executes or re-decides outcomes.

### 7.2 Multi-Agent Compiler Pipeline

The AI workflow is split into specialized agents.

| Agent              | Responsibility                                                                                                   | Output                         |
| ------------------ | ---------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| Rule Interpreter   | Interpret the user rule and produce an objective restatement.                                                    | `official_interpretation`      |
| Rule Normalizer    | Add explicit operational clauses needed for safe execution while preserving user intent.                         | `RuleNormalizationResult`      |
| Rule Compiler      | Convert the normalized interpretation into DSL/AST.                                                              | `CompiledRuleArtifact`         |
| Rule Reviewer      | Check whether the DSL/AST matches the original rule and interpretation.                                          | review result + mismatch flags |
| Adversarial Tester | Generate edge cases and abuse cases.                                                                             | adversarial test suite         |
| Final Validator    | Deterministic system step that accepts/rejects based on compiler output, tests, runtime constraints, and policy. | `VALID` or `INVALID`           |

The Final Validator is not an LLM-only decision. It must combine deterministic checks with agent outputs.

### 7.3 Multi-LLM Configuration

Multiple LLM providers are supported as fallback, escalation, and review diversity.

| Priority | Provider           | Role                                                                   |
| -------: | ------------------ | ---------------------------------------------------------------------- |
|        1 | Primary provider   | First call for interpretation and compilation                          |
|        2 | Secondary provider | Fallback on failure, timeout, low confidence, or reviewer disagreement |
|        3 | Tertiary provider  | Tiebreaker, adversarial review, or final escalation                    |

Providers may be cloud-hosted or local/self-hosted. Local providers (Phi, Llama, Gemma, Qwen) are reached through an OpenAI-compatible endpoint and require a `baseUrl` instead of a real API key (see Section 7.3.1).

Provider configuration:

```typescript
interface LLMProviderConfig {
  provider:
    | "anthropic"
    | "openai"
    | "google"
    | "ollama"
    | "vllm"
    | "llamacpp"
    | "lmstudio"
    | "openai-compatible"
    | string;
  mode: "cloud" | "local";
  model: string; // e.g. "phi4", "llama3.2", "qwen2.5:14b-instruct-q4_K_M"
  baseUrl?: string; // required for local; e.g. "http://idealer-llm:11434/v1"
  apiKey?: string; // optional; local endpoints may use a dummy value or none
  timeoutMs: number;
  maxRetries: number;
  confidenceThreshold: number;
  // Capability flags — the harness adapts the request shape per provider,
  // because "OpenAI-compatible" support varies (e.g. Ollama uses `format`
  // instead of OpenAI `response_format: json_schema`).
  capabilities: {
    jsonSchema: boolean; // schema-constrained response_format / format=<schema>
    grammarConstrained: boolean; // GBNF / vLLM guided_json / Ollama format=<schema>
    toolCalling: boolean;
    maxContextTokens: number;
    seedSupported: boolean;
  };
  // Model identity captured into the frozen artifact for auditing.
  modelDigest?: string; // sha256 of the weights for local models
  quantization?: string; // "Q4_K_M" | "Q8_0" | "FP16" | ...
  servingEngine?: string; // "ollama@x.y" | "vllm@x.y" | "llamacpp"
}
```

Default confidence threshold:

```text
0.85
```

### 7.3.1 Local / Self-Hosted Model Support

The compiler harness must support local/self-hosted open models in addition to cloud providers, without changing the deterministic game logic.

#### Integration seam: OpenAI-compatible API

All supported local engines expose an OpenAI-compatible `/v1/chat/completions` surface, so a single code path — an OpenAI-style client with a configurable `baseUrl` and `model` — targets both cloud and local backends. Switching backends is configuration, not code.

```text
Ollama     → http://<host>:11434/v1
vLLM       → http://<host>:8000/v1
llama.cpp  → http://<host>:8080/v1
LM Studio  → http://<host>:1234/v1
```

Compatibility is a spectrum. The harness must not assume full OpenAI feature parity: structured-output syntax, tool calling, `seed`, and logprobs differ across engines (notably, Ollama does not honor OpenAI `response_format: json_schema` and uses its own `format` field). The `capabilities` flags in `LLMProviderConfig` exist to paper over these seams.

#### Engine selection

| Engine | Sweet spot | Notes |
| --- | --- | --- |
| Ollama | Local development, model switching, prototyping | Lowest setup; ~1 request/model by default — not production throughput |
| vLLM | Production GPU serving, multi-user | Most complete OpenAI surface (`guided_json`); continuous batching |
| llama.cpp (`llama-server`) | CPU / edge / Apple Silicon | Minimal dependencies |

Recommended quantization for local models is `Q4_K_M` (≈97–99% of FP16 quality). Indicative VRAM: 7B `Q4_K_M` ≈ 4.5–8 GB; 12–14B `Q4_K_M` ≈ 10–12 GB. Models ≤4B (e.g. `phi4-mini`, `gemma2:2b`) can run CPU-only for development.

#### Constrained decoding is mandatory for artifact emission

Any provider used for a step that emits the DSL/AST (compile step) must use grammar/schema-constrained decoding (GBNF, vLLM `guided_json`, or Ollama `format=<schema>`). "Valid JSON" is not the same as "schema-compliant"; constrained decoding guarantees the syntactic form and is the key capability that lets small local models perform structured compilation reliably. It does **not** guarantee semantic correctness — that is handled by review, tests, and escalation (Section 7.4, M3.6).

#### Per-role model routing

Models may be routed per agent role:

- a small local model may serve `interpret_rule`, `explain_rule`, and `normalize_rule`;
- `compile_rule_to_ast` and `review_rule_ast` must either use a model that passes the confidence threshold or escalate to a stronger (cloud) provider on schema-validation failure or low confidence.

This routing reuses the existing composite confidence score (Section 7.4) and provider fallback chain (M3.6); a local provider simply takes a slot in the priority chain.

### 7.4 Composite Confidence Score

The final confidence score is a composite operational score.

It measures how confident the system is that the natural-language rule was interpreted and compiled correctly. It does **not** represent the player's probability of winning.

The final score should combine:

```text
model_confidence
rule_clarity_score
compiler_confidence
reviewer_agreement_score
test_coverage_score
runtime_safety_score
schema_score
```

Suggested initial formula:

```text
final_confidence =
  0.20 × model_confidence
+ 0.20 × rule_clarity_score
+ 0.20 × compiler_confidence
+ 0.15 × reviewer_agreement_score
+ 0.15 × test_coverage_score
+ 0.05 × runtime_safety_score
+ 0.05 × schema_score
```

Thresholds:

```text
final_confidence >= 0.85 → accept compiled rule
0.70 <= final_confidence < 0.85 → escalate to another provider/reviewer
final_confidence < 0.70 → reject or require user clarification
```

Escalation policy with local providers:

- constrained decoding (Section 7.3.1) removes syntactic failures, so escalation focuses on semantic failures;
- escalate to the next provider in the chain when DSL/AST schema validation fails, on malformed/empty output, on timeout, or when `final_confidence` is below threshold;
- a local provider may be primary; the escalation target may be a stronger local model or a cloud provider;
- multi-sample self-consistency (sample N, majority-vote) is an optional reinforcement for critical roles (`compile_rule_to_ast`, `review_rule_ast`).

Required log fields:

```typescript
interface CompilerConfidenceBreakdown {
  model_confidence: number;
  rule_clarity_score: number;
  compiler_confidence: number;
  reviewer_agreement_score: number;
  test_coverage_score: number;
  runtime_safety_score: number;
  schema_score: number;
  final_confidence: number;
}
```

### 7.5 Rule Compilation Flow

Before a rule can become active, it must pass the compiler pipeline. Deduplication is not part of this pipeline; it belongs to preflight before payment.

```text
Preflight before payment/signature
  Step P1 — Verify current-turn Game Token
  Step P2 — Sanitize preview text
  Step P3 — Count tokens
  Step P4 — Check prohibited references and prompt-injection patterns
  Step P5 — Run rule similarity / deduplication gate
  Step P6 — Issue signed preflight_token if gates pass

Paid proposal and background precompilation
  Step 1 — Persist proposed rule and text hash
  Step 2 — Sanitize canonical rule text
  Step 3 — Interpret rule text
  Step 4 — Normalize rule with explicit operational clauses when needed
  Step 5 — Ask user to confirm objective interpretation or meaningful normalization if needed
  Step 6 — Compile normalized rule to DSL/AST
  Step 7 — Review DSL/AST adherence to original text and normalized interpretation
  Step 8 — Generate standard and adversarial test cases
  Step 9 — Execute tests in rule runtime sandbox
  Step 10 — Analyze difficulty with bounded analysis
  Step 11 — Calculate final confidence
  Step 12 — Store precompiled artifact in cache
  Step 13 — If VRF elected, verify cached artifact hash and freeze before draw
  Step 14 — Return VALID or INVALID
```

Compilation output:

```typescript
interface RuleCompilationResult {
  valid: boolean;
  rule_id: string;
  turn_id: string;
  original_text: string;
  normalized_text: string;
  official_interpretation: string;
  added_operational_clauses: string[];
  normalization_hash: string;
  compiled_artifact: CompiledRuleArtifact;
  confidence_breakdown: CompilerConfidenceBreakdown;
  difficulty_class: RuleDifficultyClass;
  test_summary: RuleTestSummary;
  rejection_reasons?: string[];
  compiler_version: string;
  runtime_version: string;
  test_harness_version: string;
  created_at: string;
  frozen_at?: string;
}
```

`RuleCompilationResult` intentionally excludes dedup fields. Similarity checks are recorded in `RuleDedupResult` and `GateCheckLog`.

### 7.5.1 Gate Check Logs vs Compiler Agent Logs

Gate checks and compiler steps must be logged separately.

```typescript
interface GateCheckLog {
  id: string;
  turn_id: string;
  player_wallet: string;
  gate_type:
    | "game_token"
    | "token_count"
    | "prohibited_reference"
    | "prompt_injection"
    | "dedup";
  result: "PASS" | "WARN" | "BLOCK";
  reason: string;
  input_hash: string;
  output_hash: string;
  created_at: string;
}
```

Compiler logs start only after a paid proposal exists and the rule enters the precompilation pipeline.

### 7.6 Deterministic Guess Evaluation Flow

After the draw, each guess is evaluated by deterministic logic.

Evaluation input:

```typescript
interface EvaluateGuessPayload {
  turnId: string;
  player: string;
  ruleArtifactHash: string;
  compiledRule: CompiledRuleArtifact;
  drawResult: number[];
  playerGuess: number[];
}
```

Evaluation output:

```typescript
interface EvaluateGuessResult {
  result: "WIN" | "LOSE";
  matched_rule_branch?: string;
  runtime_steps: number;
  runtime_ms: number;
  input_hash: string;
  output_hash: string;
}
```

No LLM call is required to evaluate ordinary player guesses after the rule has been frozen.

### 7.7 Rule Runtime Sandbox

`packages/rule-runtime` executes compiled DSL/AST in a restricted environment.

Required limits:

```text
execution timeout
memory limit
operation count limit
maximum AST depth
maximum array size
maximum generated intermediate values
network blocked
filesystem blocked
imports blocked
randomness blocked
clock/time blocked
process/env access blocked
```

Initial recommended runtime limits:

```typescript
const RULE_RUNTIME_LIMITS = {
  timeoutMs: 25,
  maxOperations: 10_000,
  maxAstDepth: 16,
  maxIntermediateArraySize: 100,
  memoryMb: 32,
  allowNetwork: false,
  allowFilesystem: false,
  allowImports: false,
  allowRandomness: false,
  allowClock: false,
};
```

The runtime must be deterministic: the same `guess`, `draw`, and frozen artifact must always produce the same result.

### 7.8 Rule Test Harness

`packages/rule-test-harness` validates compiled rules before activation.

Required test classes:

- expected winner case;
- expected loser case;
- boundary cases;
- impossible rule case;
- always-true rule case;
- too-easy rule case;
- invalid arithmetic case;
- order-sensitive case;
- position/index case;
- remove-up-to-N case;
- serialization stability case;
- adversarial case.

Minimum acceptance:

```text
standard_tests_pass = true
adversarial_tests_pass = true
runtime_safety_pass = true
difficulty_class not in [IMPOSSIBLE, ALWAYS_TRUE]
final_confidence >= 0.85
```

### 7.9 Hooks Architecture

Hooks are deterministic extension points around the rule lifecycle and game lifecycle.

They are not arbitrary plugins and must not mutate finalized outcomes.

Every hook must be classified as one of:

```text
CRITICAL
ANALYTICS
OPERATIONAL_NON_DETERMINISTIC
```

Classification rules:

- `CRITICAL` hooks may block only the specific transition they guard;
- `ANALYTICS` hooks must never block game actions;
- `OPERATIONAL_NON_DETERMINISTIC` hooks may access external systems only outside deterministic rule evaluation and must never affect winner outcomes;
- LLM-backed hooks must not run in high-frequency player actions such as vote submission;
- deterministic validation should live in services/contracts first, hooks second.

Required hook groups:

#### Rule Lifecycle Hooks

| Hook                  | Class     | Blocking scope                   |
| --------------------- | --------- | -------------------------------- |
| `beforeRuleSanitize`  | CRITICAL  | Current rule precompilation only |
| `afterRuleSanitize`   | ANALYTICS | None                             |
| `beforeRuleInterpret` | CRITICAL  | Current rule precompilation only |
| `afterRuleInterpret`  | ANALYTICS | None                             |
| `beforeRuleNormalize` | CRITICAL  | Current rule precompilation only |
| `afterRuleNormalize`  | ANALYTICS | None                             |
| `beforeRuleCompile`   | CRITICAL  | Current rule precompilation only |
| `afterRuleCompile`    | ANALYTICS | None                             |
| `beforeRuleReview`    | CRITICAL  | Current rule precompilation only |
| `afterRuleReview`     | ANALYTICS | None                             |
| `beforeRuleTest`      | CRITICAL  | Current rule precompilation only |
| `afterRuleTest`       | ANALYTICS | None                             |
| `beforeRuleFreeze`    | CRITICAL  | Current rule activation only     |
| `afterRuleFreeze`     | ANALYTICS | None                             |

#### Player Action Hooks

| Hook                         | Class                       | Blocking scope        |
| ---------------------------- | --------------------------- | --------------------- |
| `beforeRuleProposePreflight` | CRITICAL                    | Current proposal only |
| `afterRulePropose`           | ANALYTICS                   | None                  |
| `beforeRuleVoteValidation`   | CRITICAL_DETERMINISTIC_ONLY | Current vote only     |
| `afterRuleVote`              | ANALYTICS                   | None                  |
| `beforeRuleRemoveValidation` | CRITICAL_DETERMINISTIC_ONLY | Current removal only  |
| `afterRuleRemove`            | ANALYTICS                   | None                  |
| `beforeRuleReportValidation` | CRITICAL_DETERMINISTIC_ONLY | Current report only   |
| `afterRuleReport`            | ANALYTICS                   | None                  |

#### Turn Lifecycle Hooks

| Hook                           | Class     |
| ------------------------------ | --------- |
| `beforeTurnOpen`               | CRITICAL  |
| `afterTurnOpen`                | ANALYTICS |
| `beforeVotingClose`            | CRITICAL  |
| `afterVotingClose`             | ANALYTICS |
| `beforeEligiblePoolLock`       | CRITICAL  |
| `afterEligiblePoolLock`        | ANALYTICS |
| `beforeFinalistElectionVrfRequest`     | CRITICAL  |
| `afterFinalistElectionVrfRequest`      | ANALYTICS |
| `beforeFinalistElectionVrfFulfillment` | CRITICAL  |
| `afterFinalistElectionVrfFulfillment`  | ANALYTICS |
| `beforeEliminationWindowOpen`  | CRITICAL  |
| `afterEliminationWindowOpen`   | ANALYTICS |
| `beforeEliminationWindowClose` | CRITICAL  |
| `afterEliminationWindowClose`  | ANALYTICS |
| `beforeActiveElectionVrfRequest`     | CRITICAL  |
| `afterActiveElectionVrfRequest`      | ANALYTICS |
| `beforeActiveElectionVrfFulfillment` | CRITICAL  |
| `afterActiveElectionVrfFulfillment`  | ANALYTICS |
| `beforeDraw`                   | CRITICAL  |
| `afterDraw`                    | ANALYTICS |
| `beforeVerification`           | CRITICAL  |
| `afterVerification`            | ANALYTICS |
| `beforeFinalize`               | CRITICAL  |
| `afterFinalize`                | ANALYTICS |
| `beforeClaimable`              | CRITICAL  |
| `afterClaimable`               | ANALYTICS |

#### Economy Hooks

```text
beforePayoutCalculation       → CRITICAL
afterPayoutCalculation        → ANALYTICS
beforeCreatorRewardCalculation → CRITICAL
afterCreatorRewardCalculation  → ANALYTICS
beforeRolloverCalculation      → CRITICAL
afterRolloverCalculation       → ANALYTICS
```

Hook requirements:

- hooks must receive immutable input snapshots;
- hooks must return typed outputs;
- hooks must be idempotent;
- hook execution must be logged;
- hooks must never access network or filesystem unless explicitly marked operational and excluded from deterministic flow;
- failed analytics hooks must not block the game;
- failed critical hooks must pause only the affected transition, not the entire game unless the affected transition is itself global;
- critical hook failures must trigger alerts.

Circuit breaker configuration:

```typescript
const HOOK_CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 3,
  rollingWindowSeconds: 300,
  openCircuitDurationSeconds: 900,
  analyticsFailOpen: true,
  criticalFailClosed: true,
  allowManualOverride: true,
};
```

If a hook reaches the failure threshold:

- analytics hooks are opened and skipped with alerts;
- critical hooks pause only their affected transition;
- operators receive an alert with affected hook, scope, last error, and recovery instructions;
- no hook may silently change a finalized result.

### 7.10 Agent Skills

Agent skills define what the AI system is allowed to do.

Required skills:

| Skill                      | Purpose                                                                               | Allowed tools                                  |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------- |
| `interpret_rule`           | Convert user text into objective interpretation.                                      | tokenizer, schema validator                    |
| `normalize_rule`           | Add explicit operational clauses required for safe execution while preserving intent. | rule schema, guard policy, normalization rules |
| `compile_rule_to_ast`      | Produce DSL/AST from normalized confirmed interpretation.                             | rule schema, compiler library                  |
| `review_rule_ast`          | Check text-to-AST adherence.                                                          | rule schema, diff tools                        |
| `generate_rule_tests`      | Generate standard and adversarial test cases.                                         | test harness only                              |
| `classify_rule_difficulty` | Detect impossible, always true, too easy, balanced, hard, extreme.                    | simulation harness, bounded analysis           |
| `explain_rule`             | Produce user-facing explanation.                                                      | frozen artifact only                           |
| `summarize_failure`        | Explain why a rule was rejected.                                                      | validation logs                                |

Forbidden skills:

- deciding winner payouts directly;
- modifying frozen artifacts;
- accessing wallet balances beyond explicit input;
- browsing web;
- calling arbitrary APIs;
- reading files;
- writing files outside allowed artifact outputs;
- importing code dynamically;
- generating unrestricted executable code;
- changing game state;
- silently changing the user's core rule objective under the label of normalization.

### 7.11 MCP Integration

The AI Rule Compiler may use MCP servers only for bounded, auditable internal tools. MCP must not give the agent broad access to the runtime environment.

Required MCP server groups:

| MCP server              | Purpose                                                                     | Access level                      |
| ----------------------- | --------------------------------------------------------------------------- | --------------------------------- |
| `rule-schema-mcp`       | Expose DSL schema, allowed nodes, validation functions.                     | read-only schema + validate calls |
| `rule-normalizer-mcp`   | Apply bounded operational guard policies and return normalization metadata. | bounded normalize action          |
| `rule-compiler-mcp`     | Compile constrained normalized rule plans into AST artifacts.               | bounded compile action            |
| `rule-runtime-mcp`      | Execute AST against test cases in sandbox.                                  | sandboxed execution only          |
| `rule-test-harness-mcp` | Generate/run standard and adversarial tests.                                | bounded test execution            |
| `game-engine-mcp`       | Read deterministic game constants and state machine definitions.            | read-only during compilation      |
| `audit-log-mcp`         | Write append-only compiler and validation logs.                             | append-only                       |

MCP restrictions:

- no network tool for the agent; the only permitted, network-isolated egress is the configured LLM inference endpoint (cloud provider or the local `idealer-llm` service);
- no filesystem browsing tool;
- no shell execution;
- no arbitrary code execution;
- no direct database write except append-only audit logs;
- no direct smart contract mutation;
- all MCP calls must include `request_id`, `turn_id`, `rule_id`, `input_hash`, and `idempotency_key`;
- MCP tool versions must be included in the frozen artifact.

### 7.12 Prompt Contracts

The prompt contract must instruct agents to compile, not judge winners.

Compiler system behavior:

```text
You are an AI Rule Compiler for Idealer.
Your job is to convert a user-written lottery rule into a constrained DSL/AST.
You do not decide whether a player wins.
You do not execute payouts.
You do not access external data.
You must reject or request clarification for vague rules.
You may only use guess and draw as rule inputs.
Return only valid JSON matching the required schema.
```

Normalizer system behavior:

```text
You are a Rule Normalizer for Idealer.
Your job is to add explicit operational clauses needed to make a rule safe, bounded, and executable.
You must preserve the user's core intent.
You may add range guards, division guards, modulo guards, bounded removal guards, finite iteration limits, and no-op fallbacks for invalid transformations.
You must not invent a different winning objective.
If a normalization changes strategic meaning or resolves vague language, require user confirmation.
Return the normalized text, added clauses, preserved intent explanation, and confirmation requirement as valid JSON.
```

Reviewer system behavior:

```text
You are a Rule Reviewer for Idealer.
Compare the original rule, official interpretation, and DSL/AST.
Flag any mismatch, ambiguity, unsupported operation, or hidden dependency.
Return only valid JSON.
```

Adversarial tester behavior:

```text
You are an Adversarial Rule Tester for Idealer.
Generate edge cases that could break, exploit, or reveal ambiguity in the compiled rule.
Do not use external data.
Return bounded test cases only.
```

### 7.13 Agent Logs & Attestation

Every compiler, reviewer, tester, and validator call creates a structured log.

```typescript
interface AgentLog {
  id: string;
  turn_id: string;
  rule_id: string;
  log_type:
    | "interpretation"
    | "normalization"
    | "compilation"
    | "review"
    | "adversarial_test"
    | "final_validation"; // gate checks are stored in GateCheckLog
  original_text: string;
  official_interpretation?: string;
  normalized_text?: string;
  added_operational_clauses?: string[];
  normalization_hash?: string;
  compiled_artifact_hash?: string;
  result: "VALID" | "INVALID" | "NEEDS_CLARIFICATION";
  reason: string;
  confidence_breakdown?: CompilerConfidenceBreakdown;
  model_identity?: {
    provider: string;
    model_name: string;
    model_digest?: string;
    quantization?: string;
    serving_engine?: string;
    constrained_decoding_used: boolean;
  };
  mcp_tools_used?: string[];
  latency_ms: number;
  input_hash: string;
  output_hash: string;
  idempotency_key: string;
  created_at: string;
}
```

Logs are stored in PostgreSQL and hashed. Hashes are posted on-chain or committed through an auditable mechanism when appropriate.

### 7.14 AGENTS.md

The repository must include `AGENTS.md` defining:

- agent identity;
- agent roles;
- allowed skills;
- forbidden behaviors;
- provider/model routing (cloud vs local, per-role models, escalation/fallback chain) and local model configuration;
- hook contracts;
- MCP server permissions;
- rule interpretation and normalization process;
- rule compilation process;
- operational clause policy;
- DSL/AST schema rules;
- runtime security limits;
- test harness requirements;
- failure behavior;
- token limit rules;
- composite compiler confidence rules;
- audit requirements.

## 8. Economy & Tokenomics

### 8.1 Token

Idealer uses native SOL.

No SPL token is required for MVP.

### 8.2 Fees

Default fee model:

- fixed fee for guess submission;
- fixed fee for rule proposal;
- paid rule removal fee;
- approval and elimination voting use the same side-specific fee rule: `2^n * VOTE_FEE`, where `n` is the number of previous votes by the same wallet on the same rule and same side in the same turn;
- before turn 100, the first vote on a side is free; the next same-side vote starts at `2^1 * VOTE_FEE`;
- from turn 100 onward, the first vote on a side costs `2^0 * VOTE_FEE`;
- rule reporting is free but rate-limited and requires a current-turn Game Token.

Default MVP value-flow mode:

- development, staging, and devnet use test SOL only;
- test SOL has no cash value and must not be marketed as a monetary prize;
- production/mainnet real SOL flows are disabled by default;
- any real SOL payment, payout, claim, treasury transfer, or creator reward requires all M9 gates to be approved before activation.

Default MVP/devnet fee configuration:

```typescript
const MVP_FEE_CONFIG = {
  // 1 SOL = 1_000_000_000 lamports.
  // These are MVP/devnet defaults and must be configurable per environment.
  guessSubmissionFeeLamports: 10_000_000, // 0.01 SOL
  ruleProposalFeeLamports: 20_000_000, // 0.02 SOL
  ruleRemovalFeeLamports: 50_000_000, // 0.05 SOL
  voteFeeLamports: 5_000_000, // 0.005 SOL base fee for paid approval votes (see VOTE_FEE_CONFIG)
  eliminationVoteFeeLamports: 5_000_000, // same VOTE_FEE base; side-specific exponent controls escalation
  repeatedActionFeeMultiplier: 2, // exponent base for repeated paid actions
  ruleReportFeeLamports: 0,
  treasuryFeeBps: 500, // 5%
};
```

MVP rule removal fee policy:

```text
RULE_REMOVAL_FEE → current turn prize pool
fee_destination = prize_pool only
```

The rule removal fee is not configurable to treasury in MVP. This keeps product copy, smart contract accounting, and user expectations aligned.

MVP vote fee policy:

```text
For approval votes on the same (turn, wallet, rule):
turn_index < 100  → vote #1 = 0; vote #2 = 2 × VOTE_FEE; vote #3 = 4 × VOTE_FEE; vote #4 = 8 × VOTE_FEE; ...
turn_index >= 100 → vote #1 = VOTE_FEE; vote #2 = 2 × VOTE_FEE; vote #3 = 4 × VOTE_FEE; ...
fee_destination = prize_pool only
```

The vote fee follows the same prize-pool accounting as the rule removal fee and is not configurable to treasury in MVP. The current-turn Game Token requirement applies in every turn, with or without the fee. The first free vote before turn 100 is limited to one vote per wallet/rule/side; any repeat vote by the same wallet on the same rule and side starts paid voting immediately at `2^1 * VOTE_FEE`.

MVP elimination vote fee policy:

```text
For elimination votes on the same (turn, wallet, finalist_rule):
turn_index < 100  → vote #1 = 0; vote #2 = 2 × VOTE_FEE; vote #3 = 4 × VOTE_FEE; vote #4 = 8 × VOTE_FEE; ...
turn_index >= 100 → vote #1 = VOTE_FEE; vote #2 = 2 × VOTE_FEE; vote #3 = 4 × VOTE_FEE; ...
fee_destination = prize_pool only
```

The elimination vote fee follows the same prize-pool accounting as the vote and removal fees and is not configurable to treasury in MVP. The current-turn Game Token requirement applies to elimination voting in every turn, with or without the fee (section 6.14a). The first free elimination vote before turn 100 is limited to one vote per wallet/finalist on the vote-out side; any repeat vote by the same wallet against the same finalist starts paid elimination voting immediately at `2^1 * VOTE_FEE`.

### 8.3 Prize Distribution

After treasury/platform monetization allocation, the playable prize pool is split:

```text
50% → original rule winners
50% → alternative rule winners
```

If no alternative rule is active, if the alternative rule is invalidated, or if no alternative-rule winners exist, the alternative category follows the rollover rules defined in section 8.7.

### 8.4 Active Rule Creator Reward and Elected-Rule Voter Reward

When an alternative rule is active in a turn and that rule produces winners, the creator of the active rule receives a reward equal to **15% of each individual alternative-rule winner payout**.

This reward is calculated from the individual payout but funded from the creator reward reserve sourced from platform monetization. It must not reduce the winner's individual payout.

In addition to the creator reward, the wallets that voted for the elected rule share an **elected-rule voter reward**:

- the voter reward pool equals **15% of a single individual alternative-rule winner payout** (a fixed amount that does not scale with the number of winners);
- the pool is split **equally** among the unique wallets that hold at least one recorded `RuleVote` for the elected rule: `per_voter = voter_reward_pool / elected_rule_voter_wallet_count`;
- repeated approval votes by the same wallet help the elected rule's vote count, but do not create additional voter-reward shares for that wallet;
- the voter reward is funded from the **same creator reward reserve** sourced from platform monetization;
- it is paid **only when the elected rule produces winners**, and it must not reduce any winner's individual payout;
- if the elected rule has zero recorded voters, no voter reward is distributed.

Default assumption:

```text
Winner individual payout remains unchanged.
Creator reward is calculated as 15% of each individual alternative-rule winner payout.
Voter reward pool is calculated as 15% of a single individual alternative-rule winner payout.
Both rewards are paid from the creator reward reserve sourced from platform monetization.
```

Example:

```text
Alternative-rule prize pool: 100
Alternative-rule winners: 10
Individual payout: 100 / 10 = 10
Final payout per winner: 10 (unchanged)

Creator reward per individual payout: 15% × 10 = 1.5
Total creator reward funded by creator reward reserve: 1.5 × 10 = 15

Voter reward pool: 15% × 10 = 1.5 (from a single individual payout)
Elected-rule voters: 4
Voter reward per voter: 1.5 / 4 = 0.375
```

### 8.5 Creator Reward Reserve and Cap

Creator and voter rewards must never break platform monetization or create accounting deficits. Both are funded from the same creator reward reserve.

The reserve is drawn in a deterministic order: the **creator reward is funded first**, then the **voter reward is funded from the remaining reserve**. Each reward is bounded independently:

```text
creator_reward = min(
  calculated_creator_reward,
  available_creator_reward_reserve,
  creator_reward_cap_per_turn
)

remaining_reserve = available_creator_reward_reserve - creator_reward

voter_reward_pool = min(
  calculated_voter_reward_pool,
  remaining_reserve,
  voter_reward_cap_per_turn
)
```

Default MVP/devnet creator reward configuration:

```typescript
const CREATOR_REWARD_CONFIG = {
  rateBps: 1_500, // 15%
  capPerTurnLamports: 250_000_000, // 0.25 SOL maximum creator reward per turn
  reserveSource: "platform_monetization",
  reserveShareOfPlatformMonetizationBps: 2_000, // 20% of platform monetization reserved for the creator reward reserve
  payOnlyWhenAlternativeRuleProducesWinners: true,
  unpaidShortfallCreatesDebt: false,
};
```

Default MVP/devnet voter reward configuration:

```typescript
const VOTER_REWARD_CONFIG = {
  rateBps: 1_500, // 15% of a single individual alternative-rule winner payout
  capPerTurnLamports: 250_000_000, // 0.25 SOL maximum voter reward pool per turn
  reserveSource: "platform_monetization", // same creator reward reserve
  reserveDrawOrder: "creator_first_then_voter",
  splitMethod: "equal_among_unique_elected_rule_voter_wallets",
  eligibleVoters: "unique_wallets_with_at_least_one_recorded_RuleVote_for_elected_rule",
  payOnlyWhenAlternativeRuleProducesWinners: true,
  unpaidShortfallCreatesDebt: false,
};
```

If the reserve is insufficient:

- winner payouts are not reduced;
- creator reward is capped at the available reserve and by `CREATOR_REWARD_CONFIG.capPerTurnLamports`;
- voter reward pool is capped at the remaining reserve and by `VOTER_REWARD_CONFIG.capPerTurnLamports`;
- unpaid creator or voter reward does not become debt unless explicitly configured in a future PRD;
- transparency/accounting insights should track capped creator reward and capped voter reward events from public accounting records.

### 8.6 Treasury / Platform Monetization

Default treasury fee:

```text
5%
```

Treasury / platform monetization uses:

- infrastructure costs;
- VRF costs;
- LLM/API costs;
- active rule creator rewards;
- elected-rule voter rewards;
- monitoring and operational costs;
- maintenance;
- future rewards or ecosystem incentives.

### 8.7 Accounting, Payout and Rollover Rules

The accounting system must define every edge case explicitly.

#### 8.7.1 No Alternative Rule

If no alternative rule is active:

```text
original pool → evaluated normally
alternative pool → rolls over to next turn's alternative pool
creator reward → none
voter reward → none
```

#### 8.7.2 Alternative Rule Invalidated

If the elected candidate fails compilation, testing, or validation:

```text
original pool → evaluated normally
alternative pool → rolls over
creator reward → none
voter reward → none
```

#### 8.7.3 No Winners

If there are no winners in a category:

```text
that category pool → rolls over to same category in next turn
```

#### 8.7.4 Multiple Winners

If multiple winners exist in a category:

```text
individual_payout = category_pool / winner_count
```

Rounding must use deterministic integer math compatible with Solana lamports.

#### 8.7.5 Rounding

Rounding policy:

```text
floor payouts to integer lamports
rounding remainder → rollover bucket or treasury remainder account, configurable
```

Recommended MVP behavior:

```text
rounding remainder → rollover bucket for same prize category
```

#### 8.7.6 Minimum Payout

If individual payout is below the MVP minimum claim threshold:

```text
payout below threshold → rollover bucket for the same prize category
```

Default MVP/devnet payout configuration:

```typescript
const PAYOUT_CONFIG = {
  minimumClaimLamports: 5_000_000, // 0.005 SOL
  belowMinimumPayoutBehavior: "same_category_rollover_bucket",
  roundingRemainderDestination: "same_category_rollover_bucket",
};
```

The same constants must be documented in `packages/game-engine` and matched by backend, worker, and contracts.

#### 8.7.7 Unclaimed Payouts

Claims have a fixed MVP claim window.

If the claim window expires:

```text
unclaimed payout → rollover bucket for the same prize category
```

Default MVP/devnet claim configuration:

```typescript
const CLAIM_CONFIG = {
  claimWindowTurns: 12,
  claimWindowMaxDays: 7,
  unclaimedPayoutDestination: "same_category_rollover_bucket",
};
```

A claim expires when either `claimWindowTurns` or `claimWindowMaxDays` is reached, whichever happens first. This prevents very long unclaimed balances from remaining unresolved while still giving users multiple turns to claim.

#### 8.7.8 Creator Reward Accounting

Creator reward is calculated after individual alternative-rule winner payout is known, but paid from the creator reward reserve sourced from platform monetization.

Creator reward must be idempotent and must not be recalculated differently after finalization.

Required fields:

```typescript
interface CreatorRewardRecord {
  turn_id: string;
  rule_id: string;
  creator_wallet: string;
  calculated_reward: string;
  reserve_available: string;
  cap_per_turn: string;
  final_reward: string;
  input_hash: string;
  output_hash: string;
  idempotency_key: string;
}
```

#### 8.7.9 Voter Reward Accounting

Voter reward is calculated after the individual alternative-rule winner payout is known, and is funded from the creator reward reserve after the creator reward has been deducted (see section 8.5). The eligible voter set is derived from unique wallets with at least one `RuleVote` record for the elected rule. Repeated approval votes by the same wallet do not multiply voter reward eligibility or per-wallet reward shares.

Voter reward must be idempotent and must not be recalculated differently after finalization. Per-voter rounding follows the same deterministic integer-lamport policy as payouts (section 8.7.5); any rounding remainder is sent to the same-category rollover bucket.

Required fields:

```typescript
interface VoterRewardRecord {
  turn_id: string;
  rule_id: string; // elected rule
  voter_count: string;
  reward_pool_calculated: string;
  reserve_available: string;
  cap_per_turn: string;
  reward_pool_final: string;
  per_voter_reward: string;
  input_hash: string;
  output_hash: string;
  idempotency_key: string;
}
```

### 8.8 Creator Recognition

Rule creators receive a financial reward when their active rule produces winners, subject to reserve and cap. The wallets that voted for the elected rule also share a voter reward under the same conditions (section 8.4), reinforcing the value of participating in governance.

In addition to this financial incentive, MVP should prioritize social recognition:

- elected rule count;
- total votes received;
- winners created;
- creator badges;
- weekly leaderboard;
- creator reward history;
- voter reward history for wallets that backed elected rules.

### 8.9 MVP Abuse Controls and Non-Economic Rate Limits

Fixed rate limits are required only for non-economic or infrastructure-heavy operations. Paid game actions are not capped: a player may keep guessing, proposing, or voting as long as the next sequenced action fee is paid.

Default MVP/devnet rate-limit configuration:

```typescript
const MVP_RATE_LIMIT_CONFIG = {
  tokenCountRequestsPerWalletPerMinute: 30,
  tokenCountRequestsPerIpPerMinute: 120,

  rulePreflightRequestsPerWalletPerTurn: 20,
  rulePreflightRequestsPerWalletPerMinute: 5,

  paidGuessSubmissionsPerWalletPerTurn: null,
  paidRuleProposalsPerWalletPerTurn: null,
  paidApprovalVotesPerWalletRuleTurn: null,
  paidEliminationVotesPerWalletFinalistTurn: null,

  ruleRemovalsPerWalletPerTurn: 2,
  ruleRemovalAttemptsPerWalletPerMinute: 3,

  ruleReportsPerWalletPerTurn: 20,
  ruleReportsPerRulePerWalletPerTurn: 1,
  ruleReportsPerWalletPerMinute: 10,

  failedTransactionRecoveryAttemptsPerWalletPerTurn: 20,
};
```

Rate-limit requirements:

- non-economic limits must be enforced server-side;
- on-chain constraints remain the source of truth for guess sequences, rule-proposal fee sequencing, vote sequence/idempotency for repeated approval and elimination votes, and paid removal idempotency;
- rate-limit rejections must be user-readable;
- suspicious rate-limit events must be visible in restricted operator alerts and, where publicly derivable, in transparency abuse dashboards;
- changing default non-economic rate limits requires updating `packages/constants`, backend config, operator/transparency documentation, and tests.

## 9. Smart Contract Architecture

### 9.1 Core Accounts

Suggested Solana accounts:

```text
GlobalConfig
TurnState
GameToken
PlayerGuess
RuleProposal
RuleVote
RuleEliminationVote
RuleRemovalRecord
ElectionVrfRequestRecord
ActiveElectionVrfRequestRecord
RuleFinalistSetRecord
RuleEliminationRecord
VerificationRecord
CompiledRuleArtifactRecord
PayoutRecord
CreatorRewardRecord
VoterRewardRecord
TreasuryVault
PrizeVault
```

### 9.2 GlobalConfig

Stores:

- authority;
- treasury address;
- guess submission fee lamports;
- rule proposal fee lamports;
- treasury fee bps;
- turn duration cycle;
- active turn duration index;
- rule proposal/approval voting cutoff ratio (within the play window);
- guess cutoff ratio (within the play window);
- decision/elimination window duration minutes (fixed, default 60);
- max eliminated rules per turn (default 5);
- elimination vote base fee multiplier (default `1× VOTE_FEE`; escalation is per side);
- repeated vote fee multiplier (default exponent base `2`, applied as `2^n * VOTE_FEE`);
- max rule tokens;
- Switchboard VRF configuration for draw;
- Switchboard VRF configuration for finalist election;
- Switchboard VRF configuration for active election (post-elimination);
- top-voted finalist count;
- random finalist count;
- vote fee lamports;
- elimination vote fee lamports;
- rule removal fee lamports;
- rule removal fee destination fixed to `prize_pool` for MVP;
- minimum claim threshold lamports;
- claim window turns and max days;
- creator reward cap per turn lamports;
- rate-limit configuration references;
- `MIN_VOTES_CREATOR_SELF_REMOVE`;
- `MIN_VOTES_THIRD_PARTY_REMOVE`;
- emergency pause flag.

### 9.3 TurnState

Stores:

- turn id;
- start timestamp;
- end timestamp;
- status;
- prize pool amount;
- turn duration;
- cycle index;
- draw result;
- active rule id;
- active rule hash;
- frozen rule artifact hash;
- eligible rule pool hash;
- top-voted finalist hash;
- random finalist hash;
- finalist set hash;
- finalist-election VRF request reference;
- finalist-election VRF fulfillment reference;
- elimination window open/close timestamps;
- eliminated finalist set hash;
- active-election VRF request reference;
- active-election VRF fulfillment reference;
- elected survivor index;
- draw VRF request reference;
- state machine status;
- original pool rollover;
- alternative pool rollover.

### 9.4 GameToken

A turn-scoped participation credential issued after a successful guess.

PDA seeds:

```text
[b"game_token", turn_id, player_wallet]
```

Stores:

- turn id;
- player wallet;
- issuing guess transaction;
- issued timestamp;
- used_for_rule_proposal_count;
- used_for_vote_count;
- status;
- close authority / rent recovery destination.

Governance instructions must verify this PDA on-chain.

### 9.5 RuleProposal

Stores:

- rule id;
- turn id;
- proposer;
- sanitized rule text hash;
- full sanitized original rule text stored on-chain;
- normalized text hash;
- official interpretation hash;
- compiled artifact hash, if precompiled or frozen;
- token count;
- vote count;
- report count;
- rule state;
- preflight result hash;
- precompilation status;
- created timestamp.

Full sanitized original rule text is stored on-chain in the `RuleProposal` account for MVP. Off-chain storage may mirror the text for indexing and UI performance, but the on-chain text is the source of truth and must match the stored text hash.

### 9.6 PlayerGuess

Stores:

- turn id;
- player wallet;
- six numbers;
- submission timestamp;
- game token PDA reference;
- verification status;
- original rule result;
- alternative rule result;
- claim status.

### 9.7 VerificationRecord

Stores:

- turn id;
- player;
- original result;
- alternative result;
- individual_payout_before_creator_reward;
- creator_reward_amount;
- final_winner_payout;
- verification hash;
- oracle signature;
- timestamp.

### 9.8 Instructions

Required instructions:

```text
initialize_global_config
open_turn
submit_guess                  # also creates GameToken PDA
propose_rule                  # requires GameToken PDA + valid preflight commitment
vote_rule                     # requires GameToken PDA
eliminate_vote_rule           # requires GameToken PDA + escalating elimination vote fee when non-free; only during decision window; fee goes to prize pool
remove_rule                   # requires GameToken PDA + removal fee; fee goes to prize pool
report_rule                   # requires GameToken PDA, may be off-chain with commitment
lock_eligible_rule_pool
request_finalist_election_vrf
fulfill_finalist_election_vrf
open_elimination_window
close_elimination_window      # tallies elimination votes, applies up to 5 eliminations
request_active_election_vrf
fulfill_active_election_vrf
freeze_active_rule
request_draw_vrf
submit_draw_result
submit_verification
close_turn
close_game_token_accounts
claim_prize
pause
unpause
update_config
```

`remove_rule` is included in MVP as a paid player action. It must verify the remover role, vote-count thresholds, current-turn GameToken PDA, pre-election-lock timing, removal fee payment, and prize-pool fee destination. Rule invalidation remains a separate formal/security path handled by validation, reporting, abuse scoring, and restricted operator/security review.

`vote_rule` is the approval vote instruction. It must verify the current-turn GameToken PDA, that the target rule is vote-eligible, that the voting window is open, the repeated-vote sequence/idempotency key for `(turn, wallet, rule)`, the required escalating vote fee when non-free, and the prize-pool fee destination.

`eliminate_vote_rule` is the decision-window elimination vote. It must verify the current-turn GameToken PDA, that the target is a current finalist, that the decision window is open, the repeated-vote sequence/idempotency key for `(turn, wallet, finalist_rule)`, the required escalating elimination vote fee when non-free, and the prize-pool fee destination. `close_elimination_window` tallies the recorded `RuleEliminationVote` accounts, applies the elimination criterion and the cap of 5 (with the deterministic tie-break), persists the eliminated set hash, and must run before `request_active_election_vrf`.

### 9.9 On-Chain vs Off-Chain Split

On-chain:

- funds;
- draw result;
- turn state;
- GameToken PDA existence and ownership;
- rule hashes;
- full sanitized original rule text in `RuleProposal`;
- `RuleVote` accounts or sequenced records, approval vote counts, and escalating vote-fee transfers to prize pool;
- `RuleEliminationVote` accounts or sequenced records, elimination vote counts, and escalating elimination vote-fee transfers to prize pool;
- paid rule removal records and removal fee transfers to prize pool;
- eligible pool hash;
- finalist set hash;
- finalist-election VRF request and fulfillment references;
- eliminated finalist set hash;
- active-election VRF request and fulfillment references;
- elected survivor index;
- guess commitments or guesses;
- verification hashes;
- claims.

Off-chain:

- full compiler logs;
- indexed mirror of on-chain rule text for search/UI only;
- AI rule compilation traces;
- UI activity feed;
- analytics;
- creator profiles.

---

## 10. Backend Architecture

### 10.1 Services

The backend should be implemented inside the project monorepo as modular services/packages.

Required services:

```text
API Service
Event Listener Service
Turn Scheduler
Rule Service
Token Counter Service
Rule Compiler Service
Rule Runtime Service
Rule Test Harness Service
Game Engine Service
Verification Queue Service
Attestation Service
Metrics Service
Transparency/Admin Service
```

Each service should be independently testable, but the initial deployment may package multiple services together when operationally simpler.

### 10.2 API Service

Responsibilities:

- serve frontend data;
- accept rule proposal preflight checks;
- expose round state;
- expose rule metadata;
- expose audit logs;
- expose creator profiles;
- expose result summaries.

### 10.3 Turn Scheduler Service

Responsibilities:

- maintain the fixed 24-hour turn duration (equal-slot duration cycle `[86400, 86400, 86400, 86400]`);
- assign the correct duration to each new turn and store the current cycle index;
- calculate the proportional phase-1 cutoff (rule-election/guess cutoff, 9167 bps ≈ 22h) for each turn;
- continuously enqueue rule precompilation jobs while phase 1 is open;
- close rule proposals, approval voting, and guess submission together at the phase-1 cutoff;
- lock the eligible precompiled rule pool at the start of phase 2 (the phase-1 cutoff);
- request Switchboard finalist-election VRF and form the 10-rule finalist set on fulfillment;
- open the fixed 60-minute decision/elimination window (inside phase 2) after the finalist set is locked;
- close the decision window after 60 minutes, tally elimination votes, and apply up to 5 eliminations;
- request Switchboard active-election VRF over the survivors and freeze the elected rule on fulfillment;
- trigger the Switchboard VRF draw at the end of the turn (phase-2 end), then close and settle the turn.

### 10.4 Token Counter Service

Responsibilities:

- tokenize proposed rule text using deployment tokenizer;
- enforce `RULE_MAX_TOKENS` server-side;
- return token count to frontend;
- reject over-limit rules before payment/on-chain flow.

API example:

```http
POST /api/v1/rules/token-count
```

Request:

```json
{
  "rule_text": "Win if at least 4 of my numbers appear in the draw."
}
```

Response:

```json
{
  "token_count": 14,
  "max_tokens": 80,
  "within_limit": true
}
```

### 10.5 Rule Service

Responsibilities:

- sanitize rule text;
- check token limit;
- verify current-turn Game Token ownership for proposal/vote/report actions;
- detect prompt injection patterns;
- run pre-submission rule similarity / deduplication checks;
- issue signed short-lived `preflight_token` after all preflight gates pass;
- create rule metadata only after valid preflight and payment/signature;
- persist an indexed copy of the on-chain rule text for search/UI only; the on-chain `RuleProposal` text remains the source of truth;
- provide rule previews to frontend.

Preflight API:

```http
POST /api/v1/rules/preflight
```

Proposal API must require the `preflight_token`:

```http
POST /api/v1/rules/propose
```

### 10.6 Rule Compiler Service

Responsibilities:

- build compiler context;
- call specialized AI agents;
- use MCP-bounded internal tools;
- compile natural-language rules into DSL/AST;
- calculate composite compiler confidence;
- produce compiler/reviewer/tester logs;
- write and update `rule_precompilation_cache` entries;
- return compiled artifacts or rejection reasons;
- never run rule similarity / deduplication as part of `RuleCompilationResult`.

Precompilation requirements:

- enqueue compilation after a paid proposal is persisted;
- retry transient LLM/provider failures within bounded limits;
- mark rules as `NEEDS_CLARIFICATION`, `FAILED`, or `VALID`;
- make only `VALID` rules eligible for VRF election;
- freeze only an artifact whose hash matches the cached valid artifact.

### 10.7 Rule Runtime Service

Responsibilities:

- execute frozen DSL/AST artifacts deterministically;
- enforce timeout, memory, and operation limits;
- block network, filesystem, imports, randomness, and clock access;
- return `WIN`/`LOSE` results with input/output hashes.

### 10.8 Rule Test Harness Service

Responsibilities:

- generate standard test cases;
- run adversarial test cases;
- detect impossible, always-true, and too-easy rules;
- validate AST serialization stability;
- produce test summaries for frozen artifacts.

### 10.9 Game Engine Service

Responsibilities:

- centralize turn lifecycle logic;
- enforce formal state machine transitions;
- handle rule election through eligible pool locking, Switchboard VRF fulfillment, finalist-set derivation, ranged finalist selection, and artifact freezing;
- coordinate rule precompilation, freezing, draw, verification, payout, rollover, near-miss, and creator reward logic;
- expose shared deterministic functions to API, worker, and tests;
- prevent business logic duplication across services.

### 10.10 Verification Queue

Use BullMQ or equivalent queue.

Requirements:

- one job per guess after draw;
- concurrency control;
- retry logic;
- rate limits per provider;
- dead-letter queue;
- progress tracking;
- transparency/operator visibility.

### 10.11 Database

Suggested PostgreSQL tables:

```text
turns
rules
rule_votes
rule_elimination_votes
rule_removal_records
game_tokens_index
guesses
gate_check_logs
rule_dedup_results
rule_preflight_tokens
rule_precompilation_cache
agent_logs
verification_jobs
compiled_rule_artifacts
election_vrf_records
rule_finalist_sets
rule_elimination_records
payout_records
creator_reward_records
voter_reward_records
idempotency_records
creator_profiles
activity_feed
share_events
metrics_snapshots
rule_registry_embeddings
```

### 10.11.1 Rule Registry Embeddings and pgvector Index

Rule similarity search may use PostgreSQL with pgvector for MVP.

The vector index must be specified explicitly to avoid silent degradation as the registry grows.

Initial migration recommendation:

```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE INDEX rule_registry_embedding_hnsw_idx
  ON rule_registry_embeddings
  USING hnsw (embedding_vector vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
```

Query configuration:

```sql
SET hnsw.ef_search = 40;
```

Operational requirements:

- monitor query latency for dedup preflight;
- monitor recall quality with labeled duplicate/non-duplicate fixtures;
- review HNSW parameters when registry exceeds 100,000 entries;
- store embedding model version on each row;
- never rely only on vector similarity when a canonical DSL signature is available.

### 10.12 Public Audit API

Required endpoints:

```text
GET /api/v1/turns/{turn_id}
GET /api/v1/turns/{turn_id}/rules
GET /api/v1/turns/{turn_id}/draw
GET /api/v1/turns/{turn_id}/results
GET /api/v1/turns/{turn_id}/traces
GET /api/v1/turns/{turn_id}/election
GET /api/v1/turns/{turn_id}/elimination
GET /api/v1/rules/{rule_id}
GET /api/v1/rules/{rule_id}/preflight
GET /api/v1/players/{wallet}/history
```

### 10.13 Job Idempotency and Dedupe

All critical jobs and state transitions must be idempotent.

Required fields for critical jobs:

```typescript
interface IdempotentJobMetadata {
  idempotency_key: string;
  dedupe_key: string;
  input_hash: string;
  output_hash?: string;
  attempt_count: number;
  status: "pending" | "processing" | "completed" | "failed" | "dead_lettered";
  locked_at?: string;
  completed_at?: string;
}
```

Critical operations requiring idempotency:

```text
submit_guess
rule_preflight
propose_rule
vote_rule
eliminate_vote_rule
remove_rule
report_rule
precompile_rule
lock_eligible_rule_pool
request_finalist_election_vrf
fulfill_finalist_election_vrf
select_rule_finalists
open_elimination_window
close_elimination_window
request_active_election_vrf
fulfill_active_election_vrf
elect_rule
compile_rule
review_rule
run_rule_tests
freeze_rule
request_draw
submit_draw_result
verify_winners
calculate_payout
calculate_creator_reward
calculate_voter_reward
apply_rollover
claim_prize
finalize_turn
```

Retries must never:

- create duplicate payouts;
- overwrite finalized results;
- regenerate frozen rule artifacts;
- change election VRF-derived finalist selection after fulfillment;
- change winner status after finalization;
- apply creator rewards more than once;
- apply voter rewards more than once.

---

## 11. Frontend Architecture

### 11.1 Stack

- Next.js
- TypeScript
- Tailwind
- Solana wallet adapter
- Mobile wallet adapter support
- PWA capabilities
- React Query or equivalent
- WebSocket or SSE for live updates
- Monorepo package sharing for types, validation schemas, constants, and client SDKs

### 11.2 Main Routes

```text
/
/play
/rounds/[turnId]
/rules/[ruleId]
/players/[wallet]
/leaderboard
/audit/[turnId]
```

`/play` should be the primary mobile entry point and should load the current Live Round Hub directly.

The public mobile DApp must not expose a privileged `/admin` route or direct navigation to internal administration tools. Public transparency pages may exist, but they must expose only public/on-chain or publicly derivable data and must not unlock private analytics.

### 11.3 Core Components

```text
MobileLiveRoundHub
PrizePoolCard
CountdownTimer
NumberPicker
GuessReceipt
RuleCard
RuleProposalComposer
RuleTokenCounter
RuleVotingPanel
ActivityFeed
DrawResultPanel
NearMissPanel
CreatorProfileCard
ShareCardGenerator
AuditPanel
```

### 11.4 Rule Proposal Composer

Requirements:

- natural-language textarea;
- live approximate token counter;
- backend-verified token count before final submission;
- max token display;
- rule preview;
- ambiguity warning;
- submit disabled when over token limit;
- no template builder;
- no forced category dropdown.

### 11.5 Live Updates

The UI should update when:

- new rule proposed;
- rule receives vote;
- rule becomes leading;
- election closes;
- rule is sampled;
- rule is validated;
- draw starts;
- result is published;
- verification completes;
- prize is claimable.

### 11.6 Mobile/DApp UX

Mobile is the primary experience, not just a responsive variant.

Requirements:

- number picker usable with thumb navigation;
- sticky countdown/prize header;
- compact rule cards;
- bottom CTA for submit/vote;
- wallet deep-link support;
- in-wallet browser compatibility;
- resilient state recovery after wallet approval;
- fast wallet confirmation flow;
- share cards optimized for social apps;
- PWA install prompt after early engagement;
- push-notification-ready architecture for future return prompts.

### 11.7 Mobile Wallet State Machine

The mobile DApp must explicitly handle wallet flow states.

Required states:

```text
IDLE
CONNECTING_WALLET
CONNECTED
SIGNING_TRANSACTION
TRANSACTION_PENDING
TRANSACTION_CONFIRMED
TRANSACTION_REJECTED
TRANSACTION_FAILED
RETURNED_WITHOUT_STATE
TURN_CHANGED_DURING_SIGNATURE
DUPLICATE_SUBMISSION_DETECTED
RECOVERING_SESSION_STATE
```

Required behaviors:

- preserve pending action state before opening wallet app;
- recover state when the user returns from wallet approval;
- detect if the turn changed during signature;
- prevent duplicate submissions after retry;
- show clear copy for rejected, pending, delayed, or failed transactions;
- reconcile pending transactions with backend/indexer state;
- never ask the user to sign again if a prior signature already succeeded.

---

## 12. Infrastructure

### 12.1 Hosting

Suggested setup:

- frontend: Vercel;
- backend: Railway, Fly.io, Render, or Kubernetes;
- database: managed PostgreSQL;
- queue: Redis;
- metrics: Prometheus/Grafana;
- logs: structured log provider;
- secrets: managed secret store.

### 12.2 Monorepo Architecture

The project should be structured as a **monorepo**.

The monorepo is the source of truth for the mobile DApp, backend services, shared packages, Programs, infrastructure configuration, and documentation.

Recommended tooling:

- `pnpm workspaces` as the package manager/workspace layer;
- Turborepo or Nx for task orchestration and caching;
- TypeScript project references for shared type safety;
- shared linting, formatting, testing, and build configuration;
- single root-level CI pipeline with package-aware jobs.

Recommended repository structure:

```text
idealer/
├── apps/
│   ├── web/                    # Mobile-first Next.js DApp / PWA
│   ├── api/                    # Backend API service
│   ├── worker/                 # Verification queue worker
│   └── admin/                  # Read-only transparency UI / restricted operator UI, optional
│
├── packages/
│   ├── config/                 # Shared eslint, tsconfig, prettier, env schemas
│   ├── types/                  # Shared TypeScript types
│   ├── constants/              # Game constants, limits, fee configs
│   ├── validation/             # Zod schemas and validation rules
│   ├── sdk/                    # Client SDK for API/on-chain interactions
│   ├── rule-schema/            # DSL/AST schema, allowed nodes and validation
│   ├── rule-compiler/          # Natural language → DSL/AST compiler orchestration
│   ├── rule-runtime/           # Deterministic sandboxed rule execution
│   ├── rule-test-harness/      # Standard/adversarial tests and difficulty checks
│   ├── game-engine/            # Turns, election, winners, payout, rollover, rewards
│   ├── hooks/                  # Typed hook contracts and lifecycle adapters
│   ├── mcp-tools/              # Internal bounded MCP server/tool definitions
│   ├── agent-core/             # Prompt contracts, skills and confidence logic
│   └── ui/                     # Shared UI primitives, optional
│
├── contracts/
│   └── solana/                 # Anchor/Solana programs and tests
│
├── infra/
│   ├── docker/                 # Dockerfiles and container configs
│   ├── compose/                # Docker Compose files
│   ├── migrations/             # Database migrations
│   └── monitoring/             # Prometheus/Grafana configs
│
├── docs/
│   ├── PRD.md
│   ├── ARCHITECTURE.md
│   ├── AGENTS.md
│   └── RUNBOOK.md
│
├── scripts/                    # Dev scripts, setup, seed, maintenance
├── docker-compose.yml
├── package.json
├── pnpm-workspace.yaml
└── turbo.json
```

The monorepo should avoid duplicating business logic across frontend, backend, worker, and smart contract integration layers.

Shared packages should contain:

- game constants, such as `RULE_MAX_TOKENS`;
- shared API schemas;
- shared validation logic;
- shared wallet and chain types;
- compiler confidence scoring types;
- DSL/AST schemas;
- rule proposal, compilation, testing, and evaluation DTOs;
- game-engine state machine types;
- accounting and payout DTOs;
- reusable test fixtures.

### 12.3 Docker & Local Development Environment

The project should use **Docker** for repeatable local development, service orchestration, and environment parity.

Docker is required for local infrastructure services and recommended for backend/worker execution during development.

#### 12.3.1 Docker Compose Project / Container Group

The Docker Compose project name must be fixed as:

```text
idealer
```

This makes the local container group predictable across machines and CI environments.

The recommended `.env.docker` or shell configuration should include:

```bash
COMPOSE_PROJECT_NAME=idealer
```

The root `docker-compose.yml` may also define the project name explicitly:

```yaml
name: idealer
```

All local containers must use the `idealer-*` naming pattern.

Benefits:

- easier debugging with `docker ps`;
- predictable container names;
- easier log filtering;
- simpler onboarding;
- safer separation from other local projects;
- consistent network and volume names.

#### 12.3.2 Required Containers

Minimum Docker Compose services:

| Service    | Container name     | Purpose                                                                                         | Default port |
| ---------- | ------------------ | ----------------------------------------------------------------------------------------------- | -----------: |
| `postgres` | `idealer-postgres` | Primary relational database for turns, rules, votes, guesses, logs, profiles, metrics snapshots |       `5432` |
| `redis`    | `idealer-redis`    | Queue backend, cache, rate-limit state, live event coordination                                 |       `6379` |
| `api`      | `idealer-api`      | Backend API for mobile DApp, rule preflight, round state, audit endpoints                       |       `4000` |
| `worker`   | `idealer-worker`   | Background processor for rule compilation, runtime evaluation, attestation, scheduled jobs      |     internal |
| `web`      | `idealer-web`      | Mobile-first Next.js DApp / PWA                                                                 |       `3000` |

Optional local containers:

| Service      | Container name       | Purpose                                                                                                                                                      | Default port |
| ------------ | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -----------: |
| `admin`      | `idealer-admin`      | Optional read-only transparency console for public turn/rule/fee/prize/reward/settlement/audit metrics plus restricted AI operations monitoring. |       `3001` |
| `mcp`        | `idealer-mcp`        | Local bounded MCP tools for rule schema, compiler, runtime, test harness, game engine and audit logging.                                                     |     internal |
| `llm`        | `idealer-llm`        | Optional local/self-hosted LLM inference (Ollama/vLLM) exposing an OpenAI-compatible endpoint for the rule compiler. GPU recommended; CPU viable for models ≤4B. Not in the default required stack. |      `11434` |
| `prometheus` | `idealer-prometheus` | Local metrics collection                                                                                                                                     |       `9090` |
| `grafana`    | `idealer-grafana`    | Local metrics dashboards                                                                                                                                     |       `3002` |
| `mailpit`    | `idealer-mailpit`    | Local email testing, if email notifications are introduced                                                                                                   |       `8025` |

#### 12.3.3 Required Docker Compose Definition

The local Docker Compose file should define explicit service names, container names, a shared network, and named volumes.

```yaml
name: idealer

services:
  postgres:
    image: postgres:16
    container_name: idealer-postgres
    restart: unless-stopped
    environment:
      POSTGRES_DB: idealer
      POSTGRES_USER: idealer
      POSTGRES_PASSWORD: idealer
    ports:
      - "5432:5432"
    volumes:
      - idealer-postgres-data:/var/lib/postgresql/data
    networks:
      - idealer-network

  redis:
    image: redis:7
    container_name: idealer-redis
    restart: unless-stopped
    ports:
      - "6379:6379"
    volumes:
      - idealer-redis-data:/data
    networks:
      - idealer-network

  api:
    build:
      context: .
      dockerfile: infra/docker/api.Dockerfile
    container_name: idealer-api
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
    env_file:
      - .env.docker
    environment:
      DATABASE_URL: postgresql://idealer:idealer@postgres:5432/idealer
      REDIS_URL: redis://redis:6379
    ports:
      - "4000:4000"
    networks:
      - idealer-network

  worker:
    build:
      context: .
      dockerfile: infra/docker/worker.Dockerfile
    container_name: idealer-worker
    restart: unless-stopped
    depends_on:
      - postgres
      - redis
    env_file:
      - .env.docker
    environment:
      DATABASE_URL: postgresql://idealer:idealer@postgres:5432/idealer
      REDIS_URL: redis://redis:6379
    networks:
      - idealer-network

  web:
    build:
      context: .
      dockerfile: infra/docker/web.Dockerfile
    container_name: idealer-web
    restart: unless-stopped
    depends_on:
      - api
    env_file:
      - .env.docker
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:4000
    ports:
      - "3000:3000"
    networks:
      - idealer-network

volumes:
  idealer-postgres-data:
  idealer-redis-data:

networks:
  idealer-network:
    name: idealer-network
```

#### 12.3.4 Container Responsibilities

##### `idealer-postgres`

Stores persistent relational data:

- turns;
- rules;
- votes;
- guesses;
- compiler logs;
- compilation/evaluation jobs;
- creator profiles;
- activity feed;
- share events;
- metrics snapshots.

##### `idealer-redis`

Supports volatile and queue-oriented workloads:

- BullMQ queues;
- verification job state;
- retry coordination;
- rate-limit counters;
- lightweight cache;
- live update fanout if needed.

##### `idealer-api`

Runs the main backend API.

Responsibilities:

- serve mobile DApp data;
- expose round state;
- handle rule proposal preflight;
- call the token counter logic;
- expose audit endpoints;
- expose player and creator history;
- coordinate with database and queue.

##### `idealer-worker`

Runs background and asynchronous jobs.

Responsibilities:

- process verification queue jobs;
- call the AI Rule Compiler Service logic;
- manage LLM fallback and escalation;
- compute composite compiler confidence;
- generate attestation payloads;
- process scheduled turn lifecycle jobs where applicable.

##### `idealer-web`

Runs the mobile-first DApp.

Responsibilities:

- serve the Next.js app;
- render `/play` as the primary mobile entry point;
- handle wallet connect UI;
- show live round state;
- support PWA behavior;
- generate shareable result cards.

#### 12.3.5 Container Startup Modes

Recommended local startup commands:

```bash
# Full local stack
docker compose up

# Infra only, while running web/API directly with pnpm
docker compose up postgres redis

# Backend stack only
docker compose up postgres redis api worker

# Mobile DApp + backend stack
docker compose up postgres redis api worker web

# Rebuild after dependency or Dockerfile changes
docker compose up --build

# Stop containers but keep volumes
docker compose down

# Stop containers and delete local data
docker compose down -v
```

#### 12.3.6 Container Health Checks

Each long-running container should expose or define health checks.

Recommended checks:

| Container          | Health check                                                                        |
| ------------------ | ----------------------------------------------------------------------------------- |
| `idealer-postgres` | `pg_isready -U idealer`                                                             |
| `idealer-redis`    | `redis-cli ping`                                                                    |
| `idealer-api`      | `GET /health`                                                                       |
| `idealer-worker`   | Queue heartbeat or `GET /health` if worker exposes a lightweight HTTP health server |
| `idealer-web`      | `GET /` or `GET /play`                                                              |

The API should not accept traffic as healthy unless PostgreSQL and Redis are reachable.

The worker should not be considered healthy unless it can reach PostgreSQL, Redis, and the configured LLM provider layer. The LLM provider layer may be a cloud provider endpoint or the local `idealer-llm` OpenAI-compatible endpoint; the health check targets whichever is configured.

Recommended local commands:

```bash
pnpm install
pnpm dev
pnpm test
pnpm lint
pnpm build

docker compose up
docker compose up postgres redis
docker compose up api worker web
docker compose down
```

Docker responsibilities:

- start PostgreSQL and Redis consistently;
- run API and worker services locally;
- simulate production-like service boundaries;
- simplify onboarding for new contributors;
- support deterministic CI jobs;
- isolate environment variables and dependencies;
- enable local testing of queues, migrations, and agent flows.

Docker should not hide core development ergonomics. Developers should still be able to run frontend and package tests directly with `pnpm` when faster.

Environment files:

```text
.env.example
.env.local
.env.test
.env.docker
```

The repository must include `.env.example` with all required variables documented.

Required environment groups:

```text
DATABASE_URL
REDIS_URL
SOLANA_RPC_URL
SWITCHBOARD_CONFIG
TREASURY_WALLET
LLM_MODE                # local | cloud
LLM_BASE_URL            # OpenAI-compatible endpoint (empty for pure cloud)
LLM_MODEL
LLM_API_KEY             # optional; dummy/none for local endpoints
LLM_MODEL_COMPILE       # optional per-role override
LLM_MODEL_INTERPRET     # optional per-role override
LLM_PROVIDER_KEYS       # cloud provider keys for fallback/escalation
EMBEDDINGS_MODEL        # semantic dedup (Section 6.15)
EMBEDDINGS_BASE_URL
RULE_MAX_TOKENS
CONFIDENCE_THRESHOLD
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SOLANA_NETWORK
```

### 12.4 Observability

Required metrics:

```text
turns_open_total
rules_proposed_total
rule_token_count_avg
rules_rejected_token_limit_total
rules_invalidated_total
guesses_submitted_total
votes_cast_total
agent_calls_total
agent_latency_ms
agent_errors_total
verification_queue_depth
verification_lag_seconds
alternative_rule_win_rate
returning_wallets_total
near_miss_events_total
share_events_total
model_confidence_avg
final_confidence_avg
provider_disagreement_rate
```

### 12.5 Alerts

Alerts:

- VRF failure;
- draw delayed;
- agent provider outage;
- verification queue lag;
- high rule invalidation rate;
- abnormal win rate;
- database unavailable;
- oracle wallet low balance;
- frontend API error spike.

### 12.6 Public Transparency Console

Idealer must include a read-only transparency console for public product, economy, rule, and settlement insights. The same deployment may also include a restricted operator-only area for AI agent operations monitoring.

The public transparency surface may be deployed separately or exposed as a clearly named transparency surface. It must not depend on private analytics or privileged user-tracking data. The restricted AI operations area must require authentication and role-based access control through an explicitly authorized operator wallet signature, and must not be exposed through public navigation.

Requirements:

- no privileged `/admin` route inside the main mobile app;
- optional public navigation link only if the surface is clearly framed as transparency/audit, not as administration;
- separate deployment target, subdomain, or clearly separated transparency route;
- separate container: `idealer-admin`;
- read-only data loaders;
- public transparency data loaders use public/on-chain or publicly derivable data only;
- no IP, device, session, wallet-funnel, private retention, or private behavioral analytics fields in either public transparency or restricted AI operations views;
- source labels for every public metric and redacted operational source labels for restricted AI metrics;
- public export/snapshot outputs limited to public/derivable fields;
- if deployment authentication is used for the public transparency surface, it must not reveal additional non-public game/user metrics;
- restricted AI operations metrics may use internal operational logs, but only for agent health, cost, latency, provider, confidence, fallback, queue, and error monitoring.

Recommended access model:

```text
Public DApp
  → no admin links
  → no admin route
  → no admin bundle shipped to users

Transparency Console
  → separate deployment or public transparency route
  → read-only data access
  → public/on-chain metrics only
  → fee, prize, rule, settlement, and audit dashboards

Restricted AI Operations
  → authorized-wallet authenticated operator-only route/surface
  → read-only operational metrics
  → no raw prompts, raw completions, secrets, API keys, private user analytics, or unredacted stack traces
  → agent/provider health, cost, latency, fallback, confidence, and error dashboards
```

The transparency console should be used to make public game state, fee flows, prize distribution, rule outcomes, and settlement proofs easier to inspect. It must not expose private behavioral analytics or manually alter outcomes. The restricted AI operations area is for operational monitoring only and must not be used to decide winners, alter rules, bypass validation, or manually change game outcomes.

#### 12.6.1 Transparency & Restricted AI Operations Insights

The public transparency dashboards should provide insight only from information that is public, on-chain, or derivable from public audit records. They may aggregate and explain public data, but must not expose private analytics, private funnel data, IP/device/session data, or non-public wallet behavior correlations.

The restricted AI operations dashboard may use internal operational aggregates from agent logs, provider health checks, queue metrics, and redacted incident snapshots. It must be read-only, access-controlled, and limited to operational health/usage monitoring.

Core dashboards:

| Dashboard                  | Key questions answered                                                                 |
| -------------------------- | -------------------------------------------------------------------------------------- |
| Turn Metrics               | How many public guesses, rule proposals, votes, removals, draws, and claims occurred?  |
| Fee Transparency           | How much was collected in platform fees, game fees, vote fees, proposal fees, removal fees, and treasury fees? |
| Prize Pool Transparency    | How much entered each prize bucket, rolled over, became claimable, was claimed, expired, or remained pending? |
| Reward Transparency        | How much was distributed or reserved for creator and voter rewards, subject to public cap/reserve rules? |
| Rule Transparency          | Which rules were proposed, eligible, finalists, eliminated, elected, active, invalidated, or removed? |
| Vote & Support Transparency | What are the public unique-wallet support counts, repeated-vote counts, elimination counts, and fee totals per rule? |
| Settlement Proofs          | Can observers verify VRF inputs, draw results, winner calculations, accounting, and audit hashes? |
| Turn-Cycle Public Trends   | How do public activity totals and fee/prize flows compare across 2h and 8h turns?      |

Restricted operator-only dashboard:

| Dashboard              | Key questions answered                                                                 |
| ---------------------- | -------------------------------------------------------------------------------------- |
| AI Agent Operations    | Are compiler agents, providers, model routes, fallbacks, confidence checks, and queues healthy? |

#### 12.6.2 Required Transparency & Restricted Operations Metrics

Turn and public activity metrics:

```text
turn_id
turn_status
turn_duration
guesses_per_turn
unique_guessing_wallets_per_turn
rules_proposed_per_turn
approval_votes_per_turn
elimination_votes_per_turn
unique_voting_wallets_per_turn
paid_removals_per_turn
claims_created_per_turn
claims_completed_per_turn
```

Fee and prize metrics:

```text
gross_turn_fees_lamports
platform_treasury_fee_lamports
guess_fee_lamports
rule_proposal_fee_lamports
approval_vote_fee_lamports
elimination_vote_fee_lamports
paid_removal_fee_lamports
original_prize_bucket_lamports
alternative_prize_bucket_lamports
rollover_in_lamports
rollover_out_lamports
claimable_prize_lamports
claimed_prize_lamports
expired_unclaimed_lamports
```

Rule and voting metrics:

```text
rules_by_status
eligible_rules_per_turn
finalist_rules_per_turn
active_rule_id
invalidated_rule_count
public_invalidation_reason_codes
rule_token_count_distribution
rule_difficulty_distribution
unique_approval_voters_per_rule
approval_vote_repetitions_per_rule
unique_elimination_voters_per_rule
elimination_vote_repetitions_per_rule
vote_fee_lamports_per_rule
```

Turn-cycle metrics:

```text
public_activity_by_turn_duration
rule_proposals_by_turn_duration
votes_by_turn_duration
guesses_by_turn_duration
fees_by_turn_duration
prize_distribution_by_turn_duration
rollover_rate_by_turn_duration
```

Reward transparency metrics:

```text
creator_rewards_paid_total
creator_reward_recipients_total
creator_reward_to_platform_monetization_ratio
creator_reward_cap_usage
creator_reward_reserve_balance
voter_rewards_paid_total
voter_reward_recipients_total
average_voter_reward_per_voter
voter_reward_to_platform_monetization_ratio
```

Settlement and audit metrics:

```text
draw_vrf_request_status
draw_vrf_fulfillment_slot
rule_election_vrf_request_status
eligible_pool_hash
finalist_set_hash
draw_result_hash
winner_calculation_hash
accounting_reconciliation_status
audit_chain_head_hash
public_proof_links
```

Restricted AI operations metrics:

```text
agent_calls_total
agent_calls_by_role
agent_latency_ms_p50_p95_p99
agent_errors_total
agent_timeouts_total
agent_schema_validation_failures_total
agent_guardrail_rejections_total
agent_fallback_total
agent_fallback_by_provider
provider_disagreement_rate
model_confidence_avg
compiler_confidence_avg
final_confidence_avg
confidence_escalation_total
tokens_input_total
tokens_output_total
estimated_llm_cost_total
llm_provider_rate_limit_events_total
llm_provider_health_status
local_model_health_status
local_model_digest
queue_backlog_by_agent_role
dead_letter_jobs_by_agent_role
```

#### 12.6.3 Transparency & Restricted Operations Data Boundaries

The admin/transparency console must not be used to influence live outcomes and must not expose private analytics.

The public transparency surface must not include:

- IP addresses;
- device fingerprints;
- private user-agent records;
- wallet connect attempts;
- wallet connect failures;
- session identifiers;
- private funnel steps;
- retention cohorts by wallet;
- return-after-loss/win/near-miss analytics;
- non-public share/acquisition data;
- any metric that requires non-public tracking beyond public/on-chain events and public audit records.

Restricted AI operations must not include:

- raw user prompt payloads;
- raw model completions;
- provider API keys or secret names with values;
- unredacted stack traces;
- private provider request/response bodies;
- unrestricted compiler reasoning traces;
- wallet/IP/device/session/funnel analytics;
- any control that can alter compiler output, active rules, draw results, winners, payouts, or claims.

Console users must not be able to:

- change draw results;
- alter submitted guesses;
- rewrite active rules after election;
- manually mark a player as winner;
- alter prize distribution after finalization;
- bypass AI rule compilation or verification flows without a clearly logged emergency process.

Allowed transparency functions for MVP:

- view public turn metrics;
- view public fee and prize-pool metrics;
- view public reward distribution metrics;
- view public rule, vote, finalist, election, and invalidation summaries;
- view public settlement, accounting, VRF, and audit proof links;
- export public snapshots whose fields are reproducible from on-chain state, public indexer projections, or public audit logs;
- view operational health summaries only when they do not expose secrets, private logs, IP/device/session data, or non-public user behavior.

Allowed restricted AI operations functions for MVP:

- view aggregate agent call volume by role and provider;
- view provider/model routing, fallback, timeout, and error rates;
- view token usage and estimated cost by provider/model/role;
- view confidence, disagreement, schema-validation, and escalation rates;
- view queue backlog and dead-letter counts for compiler/reviewer/tester jobs;
- view local/self-hosted model health, serving engine, configured model name, digest, and quantization;
- link to public-safe audit records by turn/rule/artifact hash;
- export redacted operational snapshots for incident review.

---

## 13. Security

### 13.1 Input Security

Rule text must be sanitized.

Checks:

- token limit;
- HTML stripping;
- control character removal;
- prompt injection pattern detection;
- executable code pattern detection;
- external dependency detection.

### 13.2 Agent Security

The agent cannot:

- browse the web;
- call APIs;
- execute code;
- inspect previous turns;
- inspect prize size;
- inspect unrelated players;
- modify state directly;
- override system instructions.

### 13.3 Smart Contract Security

Requirements:

- independent audit before mainnet launch;
- test coverage for prize accounting;
- invariant tests for pool balances;
- emergency pause;
- multisig admin;
- restricted oracle authority;
- replay protection;
- claim protection.

### 13.3.1 Election Randomness Security

Rule election randomness must satisfy the following requirements:

- use Switchboard VRF on Solana for election randomness;
- derive random finalists only from fulfilled VRF randomness;
- commit eligible pool and top-voted finalist hashes before VRF fulfillment;
- use ranged VRF output or rejection sampling for selecting indexes;
- never use backend randomness, transaction hash, request entropy, wall-clock time, or modulo-only reduction;
- never activate a deterministic fallback finalist after an invalid selected rule;
- store election proof references and finalist-set hashes for public audit.

### 13.4 Rule Runtime Security

The rule runtime is a critical security boundary.

Requirements:

- prefer DSL/AST execution over arbitrary generated code;
- reject unknown AST nodes;
- enforce timeout, memory, operation count, and AST depth limits;
- block network, filesystem, imports, randomness, and clock access;
- run deterministic tests before activation;
- hash every frozen artifact;
- store compiler/runtime/test harness versions;
- prohibit post-draw recompilation;
- fuzz test rule runtime before mainnet;
- include runtime security tests in CI.

### 13.5 Mainnet Technical Gates

The project must not launch with real payouts or any real SOL flows until the M9 gates pass:

| Gate                          | Required proof                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Rule Compiler Gate            | Natural-language rules compile into valid DSL/AST or are rejected with clear reasons.                                      |
| Election Randomness Gate      | Switchboard election VRF, fulfilled-randomness finalist derivation, ranged output, and no deterministic fallback verified. |
| Runtime Security Gate         | Sandbox limits verified; network/filesystem/imports/randomness blocked.                                                    |
| Accounting Gate               | Payout, rollover, rounding, minimum payout, unclaimed claims, creator reward, voter reward, and repeated vote fee cases tested. |
| Mobile Reliability Gate       | Wallet deep-link, pending, rejected, duplicate, delayed, and turn-changed flows tested.                                    |
| Abuse Resistance Gate         | Vote concentration, repeated-vote concentration, rate limits, reports, and suspicious public wallet patterns visible in transparency/operator views. |
| Observability & Incident Gate | Alerts, dashboards, repeated-vote fee metrics, logs, rollback/runbooks and pause procedures validated.                    |

### 13.6 Operational Security

Requirements:

- secret rotation;
- provider API key isolation;
- local inference hardening when the `idealer-llm` service is used: keep raw rule text on-prem (no data egress), verify model weights by signature/digest before deploy (supply chain), mount model weights read-only, run the inference container non-root, and network-segment the endpoint (not publicly exposed; mTLS between services);
- rate limits;
- restricted operator access controls;
- audit logs;
- deploy rollback;
- incident playbooks;
- no production secrets committed to the monorepo;
- Docker images built from pinned base images where possible;
- separate development, staging, and production environment files;
- least-privilege service credentials for API, worker, transparency, and restricted operator services;
- read-only transparency console data access;
- no private analytics, device/session data, or secrets exposed through the transparency console.

---

## 14. Product Metrics

### 14.1 Attraction

- landing page to wallet connect conversion;
- visitor to first vote conversion;
- visitor to first guess conversion;
- share link click-through rate;
- social card generation rate.

### 14.2 Activation

- first session completion rate;
- time to understand current round;
- time to first vote;
- time to first guess;
- percentage of users who view the active rule before playing;
- percentage of users who propose a rule in first session.

### 14.3 Retention

- return rate after first round;
- return rate after loss;
- return rate after near-miss;
- rounds played per wallet;
- votes per wallet per day;
- rules proposed per active user;
- consecutive round participation;
- return rate by turn duration;
- return prompt conversion for 8-hour turns.

### 14.4 Social Engagement

- rule votes per round;
- rule proposals per round;
- share events per round;
- spectator visits per live round;
- top rule vote concentration;
- creator leaderboard participation;
- creator reward recipients per day;
- repeat rule proposals after receiving creator reward;
- voter reward recipients per turn;
- average voter reward per voter;
- repeat voting after receiving a voter reward.

### 14.5 Game Health

- percentage of rounds with active alternative rule;
- percentage of rounds with alternative-rule winner;
- average rules proposed per round;
- ratio of voters to guess submitters;
- percentage of users who only vote and later submit a guess;
- rule invalidation rate;
- average rule token count;
- percentage of rule proposals rejected for token limit;
- average creator reward per active rule;
- creator reward reserve funding ratio from platform monetization;
- average voter reward pool per elected rule;
- vote fee revenue from turn 100 onward;
- turn activity by cycle position;
- completion rate for 1h, 2h, and 8h turns.

### 14.6 AI Health

- average model confidence;
- average final confidence;
- average validation confidence;

- provider disagreement rate;
- rule validation latency;
- guess verification latency;
- malformed output rate;
- fallback rate by provider.

### 14.7 Compiler, Runtime and Abuse Health

- rule compilation success rate;
- rule clarification rate;
- rule rejection reasons;
- compiler confidence average;
- reviewer disagreement rate;
- test harness failure rate;
- runtime timeout rate;
- runtime operation-limit failure rate;
- impossible-rule detection rate;
- always-true detection rate;
- too-easy rule rate;
- vote concentration score;
- suspicious cluster alerts;
- duplicate job prevention count;
- idempotency conflict count.

---

## 15. Implementation Milestones & Submilestones

This section defines the implementation path for Idealer as a **mobile-first Solana DApp**, built in a **monorepo**, with local development and service orchestration through **Docker / Docker Compose**.

The implementation plan is organized only by **milestones** and **submilestones**. There are no implementation phases.

Each submilestone must contain its own:

- objective;
- implementation checklist;
- approval criteria;
- required artifacts when applicable.

A milestone is approved only when **all of its submilestones are approved**. A submilestone is not approved simply because code exists. It is approved only when the expected behavior works, the checklist is complete, and the approval criteria are met.

---

### 15.1 Milestone M0 — Product, Architecture & Repository Baseline

#### Objective

Establish the product baseline, architecture baseline, monorepo structure, Docker runtime, and implementation contracts before building the game loop.

---
#### R - Review

- [] Replace and change name Idealer to Justealer

#### M0.1 — PRD Baseline

**Objective:** ensure the product rules and implementation scope are clear, consistent, and ready for development.

**Checklist:**

- [x] Confirm Idealer as a **mobile-first DApp**.
- [x] Confirm desktop web as secondary surface.
- [x] Confirm rule creation is free-form, not template-based.
- [x] Confirm rule length is limited by AI-context token count.
- [x] Confirm `RULE_MAX_TOKENS` initial value.
- [x] Confirm turn duration cycle: `2h → 2h → 8h → 8h → repeat`.
- [x] Confirm two winning conditions: original rule and active alternative rule.
- [x] Confirm current-turn Game Token requirement for proposing, voting, removing, and reporting rules.
- [x] Confirm rule election policy: exactly 10 finalists, composed of 3 top-voted eligible + 7 VRF-random eligible, formed by a finalist-election VRF at the end of the play window.
- [x] Confirm rule elimination decision phase: a fixed 1-hour decision window after the finalist set is locked, in which Game-Token holders cast paid elimination votes (2× the effective vote fee → prize pool); a finalist is eliminated when its elimination votes exceed its frozen approval votes; up to 5 of the 10 may be eliminated (when more than 5 qualify, the 5 with the most elimination votes are eliminated, ties broken by fewest approval votes then lowest rule_id); the active rule is then VRF-selected from the survivors. Historical baseline; superseded only for repeated elimination-vote fee handling by PRD v1.5.1 sections 6.14a and 8.2.
- [x] Confirm Switchboard VRF is used for the draw, the finalist election, and the active election.
- [x] Confirm no deterministic fallback finalist activation.
- [x] Confirm paid rule removal is included in MVP with fixed prize-pool fee destination.
- [x] Confirm active rule creator reward: 15% of each individual alternative-rule winner payout.
- [x] Confirm creator reward is funded from the creator reward reserve sourced from platform monetization, not deducted from the winner-visible payout.
- [x] Confirm elected-rule voter reward: 15% of a single individual payout, split equally among the elected rule's voters, funded from the same reserve with its own per-turn cap.
- [x] Confirm vote fee from turn 100 onward, destination prize pool, with the current-turn Game Token requirement retained. Historical baseline; superseded by PRD v1.5.1 repeated approval-vote fee handling in sections 6.14 and 8.2.
- [x] Confirm PRD v1.5.1 repeated vote policy: same wallet may repeatedly vote for or against the same rule; fee is `2^n * VOTE_FEE` where `n` is previous votes by that wallet on the same rule and same side; first same-side vote is free before turn 100 only; voter rewards remain unique per wallet.
- [x] Confirm admin/transparency console is separate from privileged game administration.
- [x] Confirm admin/transparency console is for public insights, not direct game manipulation.
- [x] Confirm monorepo and Docker Compose are required implementation constraints.
- [x] Resolve contradictions between economy, rule system, AI verification, Programs, and UX.

**Approval criteria:**

- [x] PRD has no conflicting product rules.
- [x] All core mechanics are described in enough detail for implementation.
- [x] The reward model, turn cycle, and free-form rule constraints are explicitly documented.
- [x] The team can explain the core loop in one paragraph without ambiguity.

**Required artifacts:**

- [x] Updated PRD.
- [x] Product rule summary.
- [x] MVP decision registry.

**M0.1 artifact index:**

- `PRD.md`
- `docs/product-rule-summary.md`
- `docs/mvp-decision-registry.md`
- `PROGRESS_TRACKER.md`

---

#### M0.2 — Monorepo Skeleton

**Objective:** create the repository structure that will hold the DApp, API, worker, admin console, shared packages, contracts, and infrastructure.

**Checklist:**

- [x] Create monorepo root.
- [x] Create `apps/web` for the mobile-first public DApp.
- [x] Create `apps/api` for backend API.
- [x] Create `apps/worker` for background jobs and queues.
- [x] Create `apps/admin` for the read-only transparency insights console.
- [x] Create `packages/config` for shared eslint, tsconfig, prettier, env schemas, and config loading.
- [x] Create `packages/types` for shared TypeScript types.
- [x] Create `packages/constants` for game constants, limits, and fee configs.
- [x] Create `packages/validation` for Zod schemas and shared validation rules.
- [x] Create `packages/sdk` for client SDK and API/on-chain interaction helpers.
- [x] Create `packages/rule-schema` for DSL/AST schema, allowed nodes, and validation functions.
- [x] Create `packages/rule-compiler` for natural-language-to-DSL/AST compiler orchestration.
- [x] Create `packages/rule-runtime` for deterministic sandboxed rule execution.
- [x] Create `packages/rule-test-harness` for standard/adversarial tests and difficulty checks.
- [x] Create `packages/game-engine` for turns, election, winners, payout, rollover, and rewards.
- [x] Create `packages/hooks` for typed lifecycle hook contracts and adapters.
- [x] Create `packages/mcp-tools` for bounded internal MCP server/tool definitions.
- [x] Create `packages/agent-core` for prompt contracts, skills, confidence scoring, and provider orchestration.
- [x] Create `contracts/solana` for Solana programs.
- [x] Create `infra/docker` for Docker support.
- [x] Create `infra/scripts` for local/dev scripts.
- [x] Create `docs` for architecture, runbooks, and API contracts.
- [x] Add root package manager configuration.
- [x] Add workspace configuration.
- [x] Add root lint, typecheck, test, and build commands.
- [x] Add initial README with local setup instructions.

**Approval criteria:**

- [x] Repository can install dependencies from the root.
- [x] Workspace commands can target each app/package.
- [x] Empty or stub apps build without fatal errors.
- [x] Folder boundaries are clear and documented.

**Required artifacts:**

- [x] Monorepo tree.
- [x] Root README.
- [x] Workspace/package manager config.

---

#### M0.3 — Docker Baseline

**Objective:** define and run the local container group needed for development.

**Checklist:**

- [x] Define `COMPOSE_PROJECT_NAME=idealer`.
- [x] Define required container `idealer-postgres`.
- [x] Define required container `idealer-redis`.
- [x] Define required container `idealer-api`.
- [x] Define required container `idealer-worker`.
- [x] Define required container `idealer-web`.
- [x] Define optional container `idealer-admin`.
- [x] Define optional container `idealer-prometheus`.
- [x] Define optional container `idealer-grafana`.
- [x] Define optional container `idealer-mailpit`.
- [x] Add Docker network for internal service communication.
- [x] Add named volume for PostgreSQL data.
- [x] Add named volume for Redis data if persistence is enabled.
- [x] Add health checks for Postgres, Redis, API, worker, and web.
- [x] Add `.env.example` with required variables.
- [x] Add local startup command documentation.
- [x] Add local shutdown/reset command documentation.

**Approval criteria:**

- [x] `docker compose up` starts required services.
- [x] Container names follow the `idealer-*` convention.
- [x] API can connect to Postgres and Redis.
- [x] Worker can connect to Redis and database.
- [x] Web can reach API locally.
- [x] Health checks report healthy services.

**Required artifacts:**

- [x] `docker-compose.yml`.
- [x] `.env.example`.
- [x] Local development runbook.

---

#### M0.4 — Technical Contracts

**Objective:** define the contracts between frontend, backend, worker, AI agent, database, and Programs.

**Checklist:**

- [x] Draft database schema for turns, rules, votes, guesses, logs, jobs, creator rewards, and admin metrics.
- [x] Draft API contracts for current round, rule proposal, token count, voting, result, history, and audit.
- [x] Draft event model for turn opened, rule proposed, vote cast, rule elected, draw completed, verification completed, payout available.
- [x] Draft queue job model for rule validation, guess verification, payout calculation, metric aggregation, and public transparency snapshots.
- [x] Draft smart contract account model.
- [x] Draft smart contract instruction list.
- [x] Draft AI agent input and output schemas.
- [x] Draft `RuleDedupResult`, `GateCheckLog`, and `CompilerAgentLog` schemas.
- [x] Draft formal Rule State Machine.
- [x] Draft Game Token PDA account and validation contract.
- [x] Draft composite compiler confidence schema.
- [x] Draft creator reward accounting model.
- [x] Draft pgvector HNSW index migration for rule registry embeddings.
- [x] Draft admin metrics dictionary.
- [x] Define error codes shared across apps.

**Approval criteria:**

- [x] Frontend can be implemented against mocked API contracts.
- [x] Backend can be implemented against database and queue contracts.
- [x] Worker jobs have clear inputs, outputs, retry behavior, and failure states.
- [x] Smart contract state aligns with backend state assumptions.
- [x] AI agent schemas include confidence breakdown and audit fields.

**Required artifacts:**

- [x] API contract document.
- [x] Data model draft.
- [x] Queue/job contract draft.
- [x] Agent schema draft.
- [x] Smart contract account/instruction draft.

---

#### M0.5 — Mobile UX Flow Baseline

**Objective:** map the mobile-first game experience before implementation.

**Checklist:**

- [x] Define `/play` as primary mobile entry point.
- [x] Map first-time user flow.
- [x] Map returning user flow.
- [x] Map wallet connection flow.
- [x] Map transaction approval and return-to-DApp flow.
- [x] Map number selection flow.
- [x] Map free-form rule proposal flow.
- [x] Map token-limit warning and rejection states.
- [x] Map voting flow.
- [x] Map active Rule of the Hour state.
- [x] Map draw/result state.
- [x] Map near-miss feedback.
- [x] Map creator reward/status feedback.
- [x] Map share card flow.
- [x] Map empty, loading, failed, and delayed states.

**Approval criteria:**

- [x] A new user can understand the intended game loop from the flow diagrams.
- [x] Mobile wallet interruption and return behavior are represented.
- [x] Core actions are reachable with mobile-first navigation.
- [x] No critical screen depends on desktop layout.

**Required artifacts:**

- [x] Mobile user flow diagram.
- [x] Low-fidelity wireframes.
- [x] UX state map.

---

### 15.2 Milestone M1 — Mobile Interactive Prototype

#### Objective

Validate the user-facing mobile game loop without real blockchain payments or production-grade AI verification.

---

#### M1.1 — Mobile Live Round Hub

**Objective:** build the main mobile screen where users understand and follow the current turn.

**Checklist:**

- [x] Build `MobileLiveRoundHub`.
- [x] Show current turn identifier.
- [x] Show current turn duration and position in the cycle.
- [x] Show countdown timer.
- [x] Show current prize pool.
- [x] Show current or leading Rule of the Hour.
- [x] Show primary bottom CTA.
- [x] Show secondary actions: vote, propose rule, view rules, view result/history.
- [x] Show compact activity feed.
- [x] Show next milestone: voting closes, guesses close, draw begins.
- [x] Add mobile sticky header for prize/countdown.
- [x] Add loading state.
- [x] Add empty state.
- [x] Add delayed-turn state.

**Approval criteria:**

- [x] A user can identify prize, countdown, and next action in under 10 seconds.
- [x] Screen works on common mobile viewport sizes.
- [x] Bottom CTA remains reachable with one-handed use.

---

#### M1.2 — Mobile Number Picker

**Objective:** allow users to choose six unique numbers quickly on mobile.

**Checklist:**

- [x] Build `NumberPicker` component.
- [x] Display numbers 1 to 100 in a mobile-friendly layout.
- [x] Enforce exactly 6 selected numbers.
- [x] Prevent duplicate numbers.
- [x] Display selected numbers in sticky tray.
- [x] Add remove/edit selected number behavior.
- [x] Add randomize option.
- [x] Add clear selection option.
- [x] Add validation message for incomplete selection.
- [x] Add confirmation step before simulated submission.
- [x] Add success state after simulated submission.

**Approval criteria:**

- [x] User can select 6 unique numbers without assistance.
- [x] Invalid selections are blocked before submission.
- [x] The interaction is usable on mobile without precision tapping.

---

#### M1.3 — Free-Form Rule Composer

**Objective:** let users create natural-language rules without templates, with visible token limits.

**Checklist:**

- [x] Build `RuleProposalComposer`.
- [x] Add free-form textarea.
- [x] Add approximate live token counter.
- [x] Show max token limit.
- [x] Add warning when approaching token limit.
- [x] Disable submit when over token limit.
- [x] Add sanitized preview.
- [x] Add AI-style preview placeholder or mock.
- [x] Add ambiguity warning placeholder or mock.
- [x] Add examples for inspiration only.
- [x] Ensure examples are not implemented as templates.
- [x] Add confirmation step before simulated proposal.
- [x] Add success state after proposal.

**Approval criteria:**

- [x] Users can write a rule freely.
- [x] Users understand why a rule is rejected for length.
- [x] UI does not force fixed categories or rule combinations.

---

#### M1.4 — Voting Flow

**Objective:** create a low-friction voting loop for proposed rules.

**Checklist:**

- [x] Build `RuleVotingPanel`.
- [x] Display proposed rules as cards.
- [x] Display vote counts.
- [x] Display current user vote state.
- [x] Allow user to vote on a rule.
- [x] Allow vote change if prototype rules allow it.
- [x] Show leading rule.
- [x] Show voting close countdown.
- [x] Add feedback after vote.
- [x] Add empty state when no rules exist.
- [x] Add activity feed event when vote is cast.

**Approval criteria:**

- [x] User can vote in one or two taps.
- [x] User understands that voting influences the Rule of the Hour.
- [x] Leading rule state updates visibly.

---

#### M1.5 — Simulated Turn Cycle

**Objective:** simulate the variable turn cycle before blockchain integration.

**Checklist:**

- [x] Implement turn duration sequence: `2h → 2h → 8h → 8h`.
- [x] Implement repeat after the second 8h turn.
- [x] Add accelerated simulation mode for testing.
- [x] Show current cycle step in UI.
- [x] Show next turn duration.
- [x] Simulate voting close timing.
- [x] Simulate guess close timing.
- [x] Simulate draw timing.
- [x] Simulate turn rollover.
- [x] Add edge state for late entry near draw.

**Approval criteria:**

- [x] Cycle order is correct.
- [x] UI communicates current and next duration clearly.
- [x] Accelerated mode allows testing all durations quickly.

---

#### M1.6 — Simulated Result, Near-Miss & Creator Outcome

**Objective:** show outcome feedback that encourages return play.

**Checklist:**

- [x] Build `DrawResultPanel`.
- [x] Show drawn numbers.
- [x] Show submitted guess.
- [x] Show original rule result.
- [x] Show alternative rule result.
- [x] Show active rule text.
- [x] Show near-miss feedback.
- [x] Show winning/loss explanation.
- [x] Show rule creator attribution.
- [x] Show simulated creator reward/status outcome.
- [x] Show next round CTA.
- [x] Add share result CTA.

**Approval criteria:**

- [x] User understands why they won or lost.
- [x] User sees a reason to join the next round.
- [x] Creator outcome is visible without confusing winner payout.

---

#### M1.7 — Mobile Share Card Prototype

**Objective:** make round outcomes and rules shareable.

**Checklist:**

- [x] Build `ShareCardGenerator`.
- [x] Generate share card for active rule.
- [x] Generate share card for near-miss.
- [x] Generate share card for creator rule elected.
- [x] Include round number, rule title, prize pool, and outcome.
- [x] Optimize layout for mobile social sharing.
- [x] Add fallback copy link behavior.
- [x] Track share intent in prototype analytics.

**Approval criteria:**

- [x] Share card is readable on mobile.
- [x] Card communicates the interesting story of the round.
- [x] User can share or copy without technical friction.

---

#### M1 Approval

M1 is approved only if all M1 submilestones are approved and:

- [ ] 80%+ of testers understand the core loop after first session.
- [ ] 70%+ complete a simulated guess submission.
- [ ] 50%+ cast at least one vote.
- [ ] 25%+ propose at least one rule.
- [ ] 40%+ say they would join another round.

---

### 15.3 Milestone M2 — Devnet DApp Core

#### Objective

Implement a working mobile DApp on Solana devnet with wallet flows, devnet transactions, core smart contract state, and public round pages.

---

#### M2.1 — Mobile Wallet Flow

**Objective:** connect mobile wallets and handle transaction approval/return reliably.

**Checklist:**

- [x] Integrate Solana wallet adapter.
- [x] Add mobile wallet adapter support.
- [x] Support Phantom mobile.
- [x] Support Backpack mobile.
- [x] Support Solflare mobile.
- [x] Support in-wallet browser usage.
- [x] Support mobile browser deep links.
- [x] Persist pending action before wallet handoff.
- [x] Recover pending action after user returns to DApp.
- [x] Show transaction pending state.
- [x] Show transaction success state.
- [x] Show transaction failure state.
- [x] Add retry path for failed transaction.
- [x] Add disconnect wallet flow.

**Approval criteria:**

- [x] Mobile user can connect wallet.
- [x] Mobile user can approve a test transaction and return to the DApp.
- [x] Failed or rejected transactions do not break app state.

---

#### M2.2 — devnet Programs

**Objective:** implement the core on-chain state and instructions for devnet.

**Checklist:**

- [x] Implement `GlobalConfig`.
- [x] Implement `TurnState`.
- [x] Implement `PlayerGuess`.
- [x] Implement `RuleProposal`.
- [x] Implement `RuleVote` as the on-chain voting account/instruction path.
- [x] Implement `TreasuryVault`.
- [x] Implement `PrizeVault`.
- [x] Implement `initialize_global_config`.
- [x] Implement `open_turn`.
- [x] Implement `submit_guess`.
- [x] Implement `propose_rule`.
- [x] Implement `vote_rule`.
- [x] Implement `close_turn`.
- [x] Add account constraint tests.
- [x] Add turn lifecycle tests.
- [x] Add invalid input tests.

**Approval criteria:**

- [x] Contracts deploy to devnet.
- [x] Core instructions execute successfully.
- [x] Invalid guesses, invalid rule proposals, and invalid on-chain votes are rejected.
- [x] Tests pass locally and in CI.

---

#### M2.3 — devnet Guess Submission

**Objective:** allow users to submit guesses to devnet from mobile.

**Checklist:**

- [x] Connect number picker to transaction creation.
- [x] Validate 6 unique numbers before transaction.
- [x] Submit guess to devnet contract.
- [x] Prevent duplicate same-sequence guesses per wallet per turn. Historical baseline originally blocked multiple guesses; superseded by sequenced repeated-guess requirements in section 5.1.
- [x] Save guess state in backend indexer/API.
- [x] Show transaction status in UI.
- [x] Show submitted guess receipt.
- [x] Handle duplicate attempt gracefully.
- [x] Handle expired turn gracefully.

**Approval criteria:**

- [x] Guess is visible on-chain through the `PlayerGuess` account or equivalent on-chain committed account state.
- [x] UI reflects submitted guess accurately.
- [x] Duplicate same-sequence guess submission is blocked.

---

#### M2.4 — devnet Rule Proposal

**Objective:** allow users to propose free-form rules with token enforcement and full sanitized original rule text stored on-chain in `RuleProposal`.

**Checklist:**

- [x] Implement backend token counter service.
- [x] Enforce token limit server-side.
- [x] Sanitize rule text.
- [x] Reject over-limit rules before transaction.
- [x] Reject obvious prompt-injection patterns.
- [x] Submit rule proposal transaction that creates the on-chain `RuleProposal` account.
- [x] Store full sanitized original rule text on-chain in `RuleProposal`.
- [x] Store sanitized rule text hash on-chain in `RuleProposal`.
- [x] Mirror on-chain rule text off-chain only for indexing, search, analytics, and UI performance.
- [x] Show proposal status in UI.
- [x] Show rule in public rule list.

**Approval criteria:**

- [x] Valid free-form rule can be proposed.
- [x] Over-limit rule is blocked with clear message.
- [x] On-chain `RuleProposal` text and hash are consistent.
- [x] Off-chain rule text copies are never treated as the source of truth.
- [x] No forced templates or category builder exists.

---

#### M2.5 — devnet Voting

**Objective:** allow voting on rules through on-chain `RuleVote` accounts with auditable state.

**Checklist:**

- [x] Implement `RuleVote` account/instruction submission flow.
- [x] Enforce one `RuleVote` per wallet per rule per turn. Historical baseline; superseded by PRD v1.5.1 repeated approval-vote requirements in section 6.14.
- [x] Implement repeated approval votes for the same `(turn, wallet, rule)` with sequenced/idempotent vote records.
- [x] Implement escalating approval vote fees: fee is `2^n * VOTE_FEE` by prior same-wallet/same-rule approval count; first vote free before turn 100, from turn 100 first vote costs `VOTE_FEE`.
- [x] Update vote count in backend/API from indexed on-chain `RuleVote` state.
- [x] Update vote state in UI.
- [x] Update vote state in UI to show the connected wallet's vote count and next repeat-vote cost.
- [x] Show leading rules.
- [x] Handle voting after cutoff.
- [x] Handle duplicate vote. Historical baseline; superseded by repeated-vote idempotency requirements in PRD v1.5.1.
- [x] Handle repeated-vote retry/idempotency without creating duplicate sequence records.
- [x] Add vote event to activity feed.

**Approval criteria:**

- [x] Vote is recorded through the on-chain `RuleVote` account/instruction path.
- [x] Repeated approval votes are recorded through sequenced `RuleVote` records or an equivalent auditable on-chain model.
- [x] UI vote counts match backend/indexed state.
- [x] UI next-vote cost matches backend/indexed repeated-vote fee calculation.
- [x] Voting closes correctly at cutoff.

---

#### M2.6 — Public Round Pages

**Objective:** expose current and completed rounds publicly.

**Checklist:**

- [x] Build current round page.
- [x] Build completed round page.
- [x] Show turn ID.
- [x] Show turn duration and cycle step.
- [x] Show prize pool.
- [x] Show rules and vote counts.
- [x] Show submitted guess state for connected user.
- [x] Show draw/result state when available.
- [x] Show audit links/placeholders.
- [x] Add shareable URL per round.

**Approval criteria:**

- [x] Public round page reflects accurate devnet state.
- [x] Completed round remains accessible after rollover.
- [x] Shared round link opens correctly on mobile.

---

#### M2 Approval

M2 is approved only if all M2 submilestones are approved and:

- [ ] Docker environment runs web, API, worker, Postgres, and Redis consistently.
- [ ] Contract tests pass.
- [ ] devnet DApp core flow works on supported mobile wallets.

---

### 15.4 Milestone M3 — Draw, Rule Election & AI Rule Compilation

#### Objective

Implement draw generation, rule election, AI rule validation, guess verification, composite compiler confidence, and auditable verification logs.

---

#### M3.1 — VRF Draw Integration

**Objective:** generate or consume verifiable draw results for each turn.

**Checklist:**

- [x] Integrate Switchboard VRF or selected VRF flow on devnet.
- [x] Trigger draw at correct turn time.
- [x] Generate 6 unique numbers between 1 and 100.
- [x] Store draw result in contract/backend state.
- [x] Store VRF proof/reference.
- [x] Display draw result in UI.
- [x] Handle delayed VRF response.
- [x] Handle VRF failure state.
- [x] Add draw integrity tests.

**Approval criteria:**

- [x] Draws produce valid 6-number results.
- [x] Draw result is publicly visible and traceable.
- [x] Delayed/failure draw states are handled without corrupting turn state.

---

#### M3.2 — Rule Election

**Objective:** form the auditable 10-rule finalist set and select the active alternative rule for the turn using Switchboard VRF. (The decision/elimination window inserted between finalist formation and active selection is specified separately in M3.8.)

**Checklist:**

- [x] Implement rule proposal pool for each turn.
- [x] Implement background precompilation cache.
- [x] Include only precompiled-valid rules in the eligible election pool.
- [x] Implement election cutoff.
- [x] Lock eligible pool hash at cutoff.
- [x] Select 3 top-voted eligible rules.
- [x] Request Switchboard VRF for rule election.
- [x] Derive 7 random finalists from VRF fulfillment, not request entropy.
- [x] Form finalist set from top-voted and random finalists.
- [x] Select one active rule using ranged VRF output or rejection sampling.
- [x] Handle ties deterministically before VRF commitment.
- [x] Exclude reported, invalid, duplicate, or non-precompiled rules.
- [x] Store elected candidate and proof references.
- [x] Show top finalists, random finalists, and elected candidate in UI/audit view.
- [x] Do not fallback to the next finalist if the elected finalist is invalid; use original-only turn instead.

**Approval criteria:**

- [x] Election follows documented top-voted + VRF-random finalist logic.
- [x] Finalist selection is derived from fulfilled VRF randomness.
- [x] No modulo-only selection is used where ranged output is available.
- [x] Ties and empty proposal pools are handled.
- [x] Elected rule is auditable.

#### M3.3 — AI Rule Validation

**Objective:** validate and precompile proposed rules so only valid artifacts can enter the election pool.

**Checklist:**

- [x] Build `Agent Service` rule validation flow.
- [x] Build background precompilation worker flow.
- [x] Build prompt contract for validation.
- [x] Check whether rule uses only draw and guess.
- [x] Detect ambiguity.
- [x] Generate test cases.
- [x] Evaluate test cases.
- [x] Compute `model_confidence`.
- [x] Compute `rule_clarity_score`.
- [x] Compute `compiler_confidence`.
- [x] Compute `reviewer_agreement_score`.
- [x] Compute `test_coverage_score`.
- [x] Compute `runtime_safety_score`.
- [x] Compute `schema_score`.
- [x] Compute `final_confidence` using `CompilerConfidenceBreakdown`.
- [x] Return `VALID` or `INVALID` based on `final_confidence` thresholds and deterministic validation checks.
- [x] Store validation log.
- [x] Store precompiled artifact hash when valid.
- [x] Display validation/precompilation status in UI.
- [x] Handle invalid elected artifact as original-only turn without fallback finalist activation.

**Approval criteria:**

- [x] Clear valid rules pass.
- [x] Ambiguous rules fail or escalate.
- [x] Validation logs include reason, scores, model, and timestamp.

---

#### M3.4 — Composite Confidence

**Objective:** calculate final operational confidence instead of trusting raw compiler confidence.

**Checklist:**

- [x] Capture `model_confidence`.
- [x] Calculate `rule_clarity_score`.
- [x] Calculate `compiler_confidence`.
- [x] Calculate `reviewer_agreement_score` when escalation or review occurs.
- [x] Calculate `test_coverage_score`.
- [x] Calculate `runtime_safety_score`.
- [x] Calculate `schema_score`.
- [x] Calculate `final_confidence` using configured weights.
- [x] Store `confidence_breakdown` using the canonical `CompilerConfidenceBreakdown` schema.
- [x] Apply threshold logic: accept, escalate, reject/conservative result.
- [x] Add tests for high-confidence, low-confidence, malformed, and disagreement cases.

**Approval criteria:**

- [x] `final_confidence`, not raw model confidence, determines acceptance/escalation.
- [x] Confidence breakdown is stored and auditable.
- [x] Threshold behavior matches PRD.

---

#### M3.5 — Guess Verification Queue

**Objective:** verify all guesses after draw using queue-based processing.

**Checklist:**

- [x] Create verification job per submitted guess.
- [x] Add job payload schema.
- [x] Add worker processor.
- [x] Apply original rule verification.
- [x] Apply alternative rule verification when active.
- [x] Use only the frozen DSL/AST artifact and deterministic `packages/rule-runtime` for alternative rule verification.
- [x] Prohibit LLM/AI calls during post-draw winner verification.
- [x] Add retry policy.
- [x] Add dead-letter queue.
- [x] Add rate limiting for verification/runtime workers.
- [x] Track job status.
- [x] Update result state when completed.

**Approval criteria:**

- [x] All submitted guesses are processed.
- [x] Failed jobs are retried or captured in dead-letter queue.
- [x] Verification state is visible to backend/admin.

---

#### M3.6 — Agent Fallback & Provider Dispute Handling

**Objective:** use multiple LLM providers (cloud and/or local) only when needed for fallback, escalation, or disagreement.

**Checklist:**

- [x] Configure primary provider (may be a local provider).
- [x] Configure secondary provider.
- [x] Configure tertiary provider.
- [x] Support local/self-hosted provider via OpenAI-compatible endpoint (`baseUrl`, optional `apiKey`).
- [x] Implement capability flags per provider and adapt request shape (e.g. Ollama `format` vs OpenAI `response_format`).
- [x] Enforce grammar/schema-constrained decoding for the DSL/AST compile step.
- [x] Escalate on timeout.
- [x] Escalate on malformed response.
- [x] Escalate on DSL/AST schema-validation failure.
- [x] Escalate on low final confidence.
- [x] Escalate on provider disagreement.
- [x] Use tertiary provider as tiebreaker.
- [x] Support per-role model routing (small/local for interpret/explain/normalize; escalate compile/review).
- [x] Record model identity (provider, model, digest, quantization, serving engine) in logs and frozen artifact.
- [x] Store provider path in logs.
- [x] Track fallback rate.
- [x] Track provider disagreement rate.

**Approval criteria:**

- [x] Normal cases use the primary provider only.
- [x] Edge cases escalate correctly.
- [x] A local-only configuration can compile valid rules end-to-end, escalating to a stronger model on schema failure or low confidence.
- [x] Disagreements are logged and resolved according to policy.

---

#### M3.7 — Verification Logs & Attestation

**Objective:** make compiler validation and deterministic post-draw verification auditable.

**Checklist:**

- [x] Store compiler logs in PostgreSQL.
- [x] Include rule text/token count.
- [x] Include draw and guess where relevant.
- [x] Include result.
- [x] Include reason.
- [x] Include model used for compiler/agent validation logs when relevant.
- [x] Include `model_confidence` for compiler/agent validation logs when relevant.
- [x] Include `final_confidence`.
- [x] Include `confidence_breakdown`.
- [x] Generate input hash.
- [x] Generate output hash.
- [x] Commit hash on-chain or through auditable mechanism.
- [x] Expose public audit endpoint.

**Approval criteria:**

- [x] Every validation and verification has a traceable log.
- [x] Logs can be matched to public result state.
- [x] Hashes detect tampering.

---

#### M3.8 — Rule Elimination Decision Phase

**Objective:** insert the fixed 1-hour decision/elimination window between finalist-set formation and active-rule election, with paid elimination voting and survivor-only selection (sections 5.4, 6.12, 6.14a).

**Checklist:**

- [x] Split rule election into finalist-election VRF (forms the 10) and active-election VRF (selects from survivors).
- [x] Lock each finalist's approval (positive) vote count when the finalist set is formed.
- [x] Open a fixed 60-minute decision/elimination window after the finalist set is locked.
- [x] Implement `eliminate_vote_rule` (Game Token gate, finalist-only target, decision-window-only, sequenced same-wallet/finalist votes, `VOTE_FEE`-based escalating payment to prize pool) and the `RuleEliminationVote` account/projection. Historical baseline originally used one-per-finalist and 2x fee; superseded by PRD v1.5.1 repeated elimination-vote requirements in section 6.14a.
- [x] Charge the elimination vote at 2× the effective vote fee for the turn (free before turn 100, 0.01 SOL from turn 100). Historical baseline; superseded by PRD v1.5.1 escalating repeated-vote fee policy in section 8.2.
- [x] Implement repeated elimination votes for the same `(turn, wallet, finalist_rule)` with sequenced/idempotent vote records.
- [x] Implement escalating elimination vote fees: fee is `2^n * VOTE_FEE` by prior same-wallet/same-finalist vote-out count; first vote free before turn 100, from turn 100 first vote costs `VOTE_FEE`.
- [x] At window close, eliminate finalists whose elimination votes exceed their frozen approval votes, capped at 5, keeping at least 1 survivor.
- [x] When more than 5 qualify, eliminate the 5 with the most elimination votes; break ties by fewest approval votes, then lowest rule_id.
- [x] Persist the eliminated-finalist set hash and elimination tallies for audit; mark eliminated rules `ELIMINATED`.
- [x] Run the active-election VRF over the survivors only and freeze the elected rule.
- [x] Expose elimination state in the public audit API (`GET /api/v1/turns/{turn_id}/elimination`) and in the decision-window voting UI (approval vs elimination counts, threshold, Eliminated/Survived states, fee, countdown).

**Approval criteria:**

- [x] Active rule is only ever elected from non-eliminated finalists.
- [x] Elimination criterion, cap of 5, and deterministic tie-break are enforced and auditable.
- [x] Elimination vote fee and Game Token gate are enforced on-chain.
- [x] Decision window timing is independent of the play-window duration cycle.

---

#### M3 Approval

M3 is approved only if all M3 submilestones are approved and:

- [ ] Complete draw → election → validation → verification flow works end-to-end.
- [ ] AI confidence and fallback behavior are auditable.
- [ ] No unresolved critical ambiguity exists in rule evaluation.

---

### 15.5 Milestone M4 — Economy, Payouts & Creator Rewards

#### Objective

Implement prize pool accounting, treasury/platform monetization, payouts, rollover behavior, active rule creator rewards, and elected-rule voter rewards.

---

#### M4.1 — Prize Pool Accounting

**Objective:** calculate and track prize pools for each turn.

**Checklist:**

- [x] Track guess submission fees.
- [x] Track rule proposal fees.
- [x] Track paid rule removal fees in MVP.
- [x] Track vote fees from turn 100 onward (free before turn 100). Historical baseline; superseded by PRD v1.5.1 repeated vote fee escalation.
- [x] Track approval vote fees by `(turn, wallet, rule, sequence)` with first-vote-free-before-turn-100 and escalating repeat fees.
- [x] Track elimination vote fees by `(turn, wallet, finalist_rule, sequence)` with first-vote-free-before-turn-100 and `2^n * VOTE_FEE` same-side escalation.
- [x] Add accounting tests for repeated approval and elimination vote fee sequences before and after turn 100.
- [x] Apply treasury/platform monetization logic.
- [x] Split post-fee prize pool into original and alternative buckets.
- [x] Track rollover per bucket.
- [x] Track current turn pool.
- [x] Track total visible prize pool.
- [x] Add accounting tests for each source and bucket.
- [x] Add backend-contract parity tests for repeated vote fee calculation and prize-pool routing.

**Approval criteria:**

- [x] Prize pool math is deterministic.
- [x] Original and alternative buckets are separated.
- [x] Rollover is correct when no winners exist.

---

#### M4.2 — Winner Calculation

**Objective:** determine original and alternative rule winners correctly.

**Checklist:**

- [x] Identify original rule winners.
- [x] Identify alternative rule winners.
- [x] Handle no-winner cases.
- [x] Handle multiple winners.
- [x] Calculate individual payout per bucket.
- [x] Store winner records.
- [x] Expose winner records to UI.
- [x] Add tests for zero, one, and many winners.

**Approval criteria:**

- [x] Winner list matches verification results.
- [x] Individual payout is calculated correctly.
- [x] UI can display payout state clearly.

---

#### M4.3 — Creator and Voter Reward Calculation

**Objective:** reward the creator of the active alternative rule and the wallets that voted for the elected rule, based on alternative-rule winner payouts.

**Checklist:**

- [x] Identify creator of active rule in the turn.
- [x] Check whether active rule produced alternative-rule winners.
- [x] Calculate individual alternative-rule winner payout.
- [x] Calculate creator reward as `15% × individual alternative-rule winner payout` per winner.
- [x] Resolve the elected-rule voter set from recorded `RuleVote` accounts. Historical baseline; PRD v1.5.1 requires wallet-unique voter resolution even when repeated `RuleVote` records exist.
- [ ] Resolve the elected-rule voter reward set from unique wallets, not from total repeated vote records.
- [x] Calculate voter reward pool as `15% × a single individual alternative-rule winner payout` and split it equally among elected-rule voters. Historical baseline; PRD v1.5.1 requires equal split among unique voter wallets only.
- [ ] Add reward tests proving repeated approval votes by the same wallet do not increase that wallet's voter reward share.
- [x] Fund creator reward first, then voter reward from the remaining creator reward reserve (sourced from platform monetization).
- [x] Cap voter reward pool by `VOTER_REWARD_CONFIG.capPerTurnLamports`.
- [x] Do not reduce winner-visible payout for creator or voter reward.
- [x] Store creator reward and voter reward records.
- [x] Handle no alternative-rule winner case (no creator or voter reward).
- [x] Handle multiple alternative-rule winner case.
- [x] Handle elected rule with zero recorded voters (no voter reward).
- [x] Add example test: total prize 100, 10 winners, individual payout 10, creator reward basis 15% of 10 per winner, voter reward pool 15% of 10 split among voters.
- [x] Add accounting tests to ensure the reserve covers creator reward first, then voter reward.

**Approval criteria:**

- [x] Creator reward is computed from the individual winner payout basis.
- [x] Voter reward pool is 15% of a single individual payout, split equally among elected-rule voters. Historical baseline; PRD v1.5.1 narrows this to unique voter wallets.
- [x] Repeated approval votes affect election vote count but not voter reward recipient count.
- [x] Winner payout is not reduced by creator or voter reward display/accounting.
- [x] Reward source is the creator reward reserve sourced from platform monetization, drawn creator-first then voter.
- [x] Creator reward and voter reward records are auditable.

---

#### M4.4 — Claim Flow

**Objective:** allow eligible winners, rule creators, and elected-rule voters to claim funds when applicable.

**Checklist:**

- [x] Implement winner claim instruction/API flow.
- [x] Implement creator reward claim instruction/API flow if rewards are claimed separately.
- [x] Implement voter reward claim instruction/API flow for elected-rule voters if rewards are claimed separately.
- [x] Prevent double claim.
- [x] Show claimable balance.
- [x] Show pending claim state.
- [x] Show successful claim state.
- [x] Show failed claim state.
- [x] Add mobile wallet approval flow for claims.
- [x] Add tests for claim edge cases.

**Approval criteria:**

- [x] Eligible winners can claim.
- [x] Eligible creators can receive/claim rewards.
- [x] Eligible elected-rule voters can receive/claim rewards.
- [x] Double claims are blocked.
- [x] Claim states are clear in mobile UI.

---

#### M4.5 — Rollover Behavior

**Objective:** carry unclaimed/no-winner prize buckets into future turns correctly.

**Checklist:**

- [x] Define rollover source buckets.
- [x] Roll over original bucket when no original winner exists.
- [x] Roll over alternative bucket when no alternative winner exists.
- [x] Preserve bucket attribution in accounting.
- [x] Display rollover in next turn UI.
- [x] Add rollover event to activity feed.
- [x] Test repeated no-winner rollovers.
- [x] Test winner after rollover.

**Approval criteria:**

- [x] Rollover amounts are correct.
- [x] Rollover display is understandable.
- [x] Rollover does not break creator reward or voter reward accounting.

---

#### M4.6 — Paid Rule Removal Accounting

**Objective:** implement paid rule removal in MVP without enabling griefing or accounting ambiguity.

**Checklist:**

- [x] Implement `remove_rule` transaction flow.
- [x] Require current-turn GameToken PDA.
- [x] Require removal fee payment.
- [x] Route 100% of removal fee to the current turn prize pool. _(Destination is the prize pool; the standard protocol treasury fee is still retained before distribution, per §2.5 and §6.11 "follows normal treasury/prize-pool accounting" — the same split applied to every prize-pool source and to M4.1 accounting.)_
- [x] Enforce `MIN_VOTES_CREATOR_SELF_REMOVE`.
- [x] Enforce `MIN_VOTES_THIRD_PARTY_REMOVE`.
- [x] Block removal after eligible pool lock.
- [x] Block removal of finalist, elected, frozen, active, expired, invalidated, or already removed rules.
- [x] Store `RuleRemovalRecord`.
- [x] Add audit log and activity feed event.
- [x] Test self-removal, third-party removal, protected rules, duplicate removal, and post-lock removal.

**Approval criteria:**

- [x] Removal fee is always routed to the prize pool.
- [x] Protected rules cannot be removed by paid player action.
- [x] Removed rules are excluded from election but remain visible in audit/history.
- [x] Removal cannot mutate active/frozen/finalized outcomes.

#### M4.7 — On-chain Claim Execution

**Objective:** execute real on-chain SOL transfers for winner payouts and creator/voter rewards, replacing the API-only claim state of M4.4 with a verifiable pull-payment backed by Solana program instructions.

**Checklist:**

- [x] Add a `Claim` PDA per `(turn_id, wallet, kind)` with `WinnerPayout` / `CreatorReward` / `VoterReward` kinds and `Available` / `Claimed` state.
- [x] Implement authority-signed `record_claim` that mirrors an API-computed claimable amount on chain (draw fulfilled, amount ≥ `minimum_claim_threshold_lamports`, idempotent via `init`).
- [x] Implement `claim_prize` (winner payout from the turn prize vault) and `claim_reward` (creator/voter reward from the treasury reserve vault), signed by the claimant.
- [x] Pay out of program-owned vault PDAs by direct lamport mutation while preserving the vault's rent-exempt minimum.
- [x] Block double-claim via the `Claimed` flag (Checks-Effects-Interactions: mark claimed before transfer).
- [x] Worker posts `record_claim` for each available claim after settlement, tolerating already-recorded PDAs.
- [x] Frontend builds `claim_prize` / `claim_reward` instructions, signs in-wallet, and records the real signature through `POST /claim-records/complete`.
- [x] Add contract tests (record → claim, double-claim, wrong wallet, below-minimum, kind/vault mismatch, vault rent floor) and worker/API tests.

**Approval criteria:**

- [x] A connected wallet can claim a real winner payout and a creator/voter reward on devnet, with SOL transferred.
- [x] Double-claim is rejected on-chain; below-minimum claims are never recorded.
- [x] Winner payouts draw from the prize vault and rewards from the treasury reserve, without reducing the winner-visible payout.

**Status: ✅ Done — confirmed by user 2026-06-26.** Implementation verified across contract/worker/API/frontend (`Claim` PDA + `record_claim`/`claim_prize`/`claim_reward` in `contracts/solana/programs/idealer/src/lib.rs`; `pay_from_vault` rent-floor + CEI mark-claimed-before-transfer; worker `recordClaimsForTurn` wired into the M5.3 settlement loop; frontend `createClaimPrize/RewardInstruction` + `/claim-records/request`→`/complete`; SBF tests for record→claim, double-claim, wrong-wallet, below-minimum, kind/vault mismatch, vault rent floor; worker/API claim tests). **Live devnet acceptance:** on turn 37, `record_claim` recorded 5 winner-payout `Claim` PDAs; a real claimant-signed `claim_prize` (winner `GBSpqDzF…`, claim PDA `rxTZ1ax8…`) transferred 0.018 SOL from the prize vault (sig `3WM8BtYeHtEMmiNSamB37eeuYYq5KNPB28APFnCs3ivvzgRkKTFdvQAmJPUZwaBDVUWkBTJRtSzQgbovWUNzWgh2`, balance delta +18,045,000 lamports; API claim → `claimed`); a re-claim was rejected on-chain (`ClaimNotAvailable`, custom error 6058); the creator reward stayed `unavailable` (below `minimum_claim_threshold_lamports`), demonstrating below-minimum is never recorded. The creator/voter `claim_reward` (treasury-reserve pull) is implemented, SBF-tested, and frontend-wired; it was not exercised live because no reward on the validated turns exceeded the claim threshold (a live reward claim only needs a turn whose reward clears the minimum). Gated operator: `apps/worker/src/devnet-claim-prize.ts`.

---

#### M4.8 — Player Rewards History

**Objective:** give players a wallet-scoped view of their payouts and rewards across all turns, plus a claim surface for available items.

**Checklist:**

- [x] Add `GET /players/{wallet}/claims` aggregating every claim record for a wallet across turns with per-status totals.
- [x] Implement a claims surface (`/play/results`) that lists claimable / pending / claimed payouts and rewards and triggers the on-chain claim flow.
- [x] Implement a read-only reward history screen (`/play/rewards`) grouped by turn, linking to each round's detail.
- [x] Surface the rewards entry point from the player account/hub navigation.
- [x] Add API and E2E coverage for the aggregation endpoint and the wallet-gated screens.

**Approval criteria:**

- [x] A player can see all their rewards by turn and status, and reach the claim flow for available items.
- [x] The history reflects the real on-chain claim state (claimed / pending / available).

**Status: ✅ Done — confirmed by user 2026-06-26.** Wallet-scoped claim aggregation is implemented through `GET /players/{wallet}/claims` (`getPlayerClaimsSummary`); `/play/results` now renders the wallet-gated claims surface with claimable, pending, and claimed items plus on-chain claim execution; `/play/rewards` shows read-only rewards grouped by turn with round-detail links; and the account screen links to reward history. Verification: API tests 38/38 including player claim aggregation; web typecheck/lint/test; webpack production build; manual Playwright smoke for `/play/results`, `/play/rewards`, and `/round/37`. The normal Playwright `test:e2e` command could not start its configured dev server because an existing Next dev server for the same app was already running, so the M4.8 browser assertions were run directly against that live local server.

---

#### M4 Approval

M4 is approved only if all M4 submilestones are approved and:

- [ ] Prize accounting, payouts, rollovers, and creator rewards reconcile exactly.
- [ ] No accounting test fails.
- [ ] Creator rewards do not reduce winner-visible payout.

---

### 15.6 Milestone M5 — Public Transparency & Restricted AI Operations Console

#### Objective

Build a read-only admin/transparency console that exposes public, on-chain, or publicly derivable game data for community transparency, plus a restricted operator-only AI operations dashboard for monitoring compiler-agent usage, provider health, cost, latency, fallback, confidence, and error behavior. The public surface is used to make turn metrics, fee flows, prize pools, reward distribution, rule status, settlement proofs, and public audit data easier to inspect. The restricted AI operations surface is not public and must not expose secrets, raw prompts/completions, private user analytics, or controls that can alter game outcomes.

---

#### M5.1 — Transparency Surface, Restricted Surface & Data Boundary

**Objective:** ensure public dashboards remain limited to public/derivable data while restricted AI operations dashboards remain read-only, access-controlled, and operational-only.

**Checklist:**

- [x] Use a separate transparency/admin app surface, such as `apps/admin`, or a clearly separated public transparency route.
- [x] Keep the console read-only.
- [x] Do not require privileged data sources for public transparency metrics.
- [x] Every public displayed metric identifies its public source: on-chain account, transaction, public API projection, or audit log.
- [x] Add a restricted operator-only AI operations section for internal agent metrics.
- [x] Gate the restricted AI operations section with authentication and role-based access control.
- [x] Restricted AI operations metrics identify their internal source: agent log aggregate, provider health check, queue metric, cost metric, or redacted incident snapshot.
- [x] Do not display IP addresses, device fingerprints, private user-agent records, session identifiers, or private funnel events.
- [x] Do not display retention cohorts, return-after-loss/win/near-miss analytics, or non-public wallet behavior correlations.
- [x] Public transparency authentication, if used for deployment control, must not unlock additional non-public game/user metrics.
- [x] Restricted AI operations must not display raw prompts, raw completions, provider API keys, secret values, unrestricted compiler reasoning traces, or unredacted stack traces.
- [x] Add export/snapshot capability only for public/derivable fields.
- [x] Add restricted AI operations export/snapshot capability only for redacted operational fields.
- [x] Add data-boundary tests or review checklist for every dashboard.
- [x] Document the public derivation path for every public metric and the redacted operational source for every restricted AI metric.

**Approval criteria:**

- [x] Every public console metric is reproducible from public/on-chain data or public audit/indexer records.
- [x] Restricted AI operations metrics are access-controlled, redacted, and operational-only.
- [x] No private user analytics, secrets, raw prompts, raw completions, or confidential provider payloads are displayed.
- [x] The console cannot mutate game state.

---

#### M5.2 — Turn & Economy Transparency

**Objective:** make public turn activity, platform fee collection, prize-pool funding, rollovers, and distributions easy to verify.

**Checklist:**

- [x] Show public turn status, duration, countdown timestamps, and settlement status.
- [x] Show guesses, proposals, approval votes, elimination votes, paid removals, and claims per turn.
- [x] Show total fees collected per turn.
- [x] Show platform treasury fee collected per turn.
- [x] Show fee breakdown by action type: guess, rule proposal, approval vote, elimination vote, and paid removal.
- [x] Show prize-pool funding by original and alternative buckets.
- [x] Show rollover in, rollover out, payout dust, expired unclaimed amounts, and pending claimable amounts.
- [x] Show prize distribution by bucket and winner count.
- [x] Show creator/voter reward totals funded by the creator reward reserve.
- [x] Show reward reserve balance/cap usage where publicly derivable.
- [x] Add date filters.
- [x] Add public export or snapshot capability.

**Approval criteria:**

- [x] A third party can reconcile displayed fee, prize, rollover, payout, and reward amounts against public sources.
- [x] Fee revenue for the platform and prize-pool funding are separated clearly.
- [x] Metrics are consistent with settlement/accounting audit records.

---

#### M5.3 — Rule & Voting Transparency

**Objective:** make public rule lifecycle, vote support, repeated-vote intensity, and rule outcomes auditable.

**Checklist:**

- [x] Show proposed rules per turn.
- [x] Show rule status counts: proposed, precompiled, eligible, finalist, eliminated, survived, active, invalidated, expired, and removed.
- [x] Show top rules by votes.
- [x] Show unique approval voters, total approval votes, repeated approval vote counts, and approval vote fee totals per rule.
- [x] Show unique elimination voters, total elimination votes, repeated elimination vote counts, and elimination vote fee totals per finalist.
- [x] Show finalist composition: top-voted finalists and VRF-random finalists.
- [x] Show active rule election source and public VRF proof link.
- [x] Show invalidated rules with public reason codes only.
- [x] Show paid rule removals with public remover/action metadata where on-chain/public.
- [x] Show rule token count distribution.
- [x] Show public difficulty/clarity labels where produced by deterministic/public compiler artifacts.

**Approval criteria:**

- [x] Users can inspect how a rule moved through the public lifecycle.
- [x] Users can distinguish unique-wallet support from repeated paid-vote intensity.
- [x] Public invalidation/removal summaries do not expose private compiler logs or confidential moderation payloads.

---

#### M5.4 — Settlement & Proof Dashboard

**Objective:** expose public proof material for draws, elections, winners, accounting, and claims.

**Checklist:**

- [x] Show draw VRF request, fulfillment, randomness proof reference, and draw result.
- [x] Show rule election VRF request, fulfillment, randomness proof reference, and selected active rule.
- [x] Show eligible pool hash, finalist set hash, draw result hash, winner calculation hash, and audit chain head.
- [x] Show original-rule winner count and payout calculation.
- [x] Show alternative-rule winner count and payout calculation.
- [x] Show creator/voter reward calculation summary.
- [x] Show claim records by public status: claimable, claimed, expired, below threshold, and rolled over.
- [x] Show accounting reconciliation status between public indexer/API projection and on-chain/accounting records.
- [x] Link to public audit endpoints for reproducibility.

**Approval criteria:**

- [x] A third party can verify draw, election, winner, payout, and claim summaries from public proofs.
- [x] Accounting discrepancies are visible without exposing private logs.
- [x] No wallet funnel, device, IP, or session telemetry is displayed.

---

#### M5.5 — Public Trends & Exports

**Objective:** provide transparent aggregate trends without private retention, funnel, device, or session analytics.

**Checklist:**

- [x] Show public activity totals by turn duration.
- [x] Show fee totals by turn duration.
- [x] Show prize and rollover totals by turn duration.
- [x] Show public rule proposal, vote, finalist, election, and invalidation trends.
- [x] Show creator reward and voter reward totals over time.
- [x] Show top public creators by proposed rules, votes, elected rules, and winner-producing rules.
- [x] Show repeated paid-action counts and fee escalation totals by public action scope.
- [x] Show public CSV/JSON snapshot exports.
- [x] Include source references and derivation notes in exports.
- [x] Exclude private retention, funnel, device, session, and share/acquisition analytics.

**Approval criteria:**

- [x] Trend views are reproducible from public sources.
- [x] Exports do not include private analytics.
- [x] Dashboard supports transparency without creating a hidden internal analytics surface.

---

#### M5.6 — Restricted AI Agent Operations Dashboard

**Objective:** monitor AI Rule Compiler and agent harness usage without exposing sensitive payloads or changing game state.

**Checklist:**

- [x] Show agent call volume by role: interpretation, normalization, compilation, review, adversarial testing, and final validation.
- [x] Show provider/model routing by role, including local/self-hosted provider usage.
- [x] Show latency percentiles by provider/model/role.
- [x] Show timeout, malformed output, schema-validation failure, guardrail rejection, and provider error counts.
- [x] Show fallback and escalation counts by provider/model/role.
- [x] Show provider disagreement rate.
- [x] Show model confidence, compiler confidence, and final confidence distributions.
- [x] Show token usage and estimated cost by provider/model/role.
- [x] Show queue backlog and dead-letter jobs for compiler/reviewer/tester tasks.
- [x] Show local model health, serving engine, configured model name, model digest, quantization, and last health-check result.
- [x] Show redacted incident snapshots for agent/provider failures.
- [x] Link restricted operational rows to public-safe audit records using turn id, rule id, artifact hash, or audit hash.
- [x] Exclude raw prompts, raw completions, provider API keys, secret values, unrestricted compiler reasoning traces, private request/response bodies, and unredacted stack traces.

**Approval criteria:**

- [x] Operators can diagnose agent/provider latency, cost, fallback, confidence, and failure issues.
- [x] The dashboard cannot alter compiler outputs, active rules, draw results, winners, payouts, or claims.
- [x] Restricted AI metrics are access-controlled and redacted.

---

#### M5.7 — Console Safety Boundaries

**Objective:** prevent the console from compromising game integrity or expanding into private analytics.

**Checklist:**

- [x] Admin cannot alter submitted guesses.
- [x] Admin cannot alter draw results.
- [x] Admin cannot alter finalized winners.
- [x] Admin cannot silently modify active rules.
- [x] Admin cannot bypass prize accounting.
- [x] Admin cannot modify creator reward records after finalization.
- [x] Admin mutations are not available in the transparency console.
- [x] Console data loaders are read-only.
- [x] Console exports contain only public/derivable fields.
- [x] Restricted AI operations exports contain only redacted operational fields.
- [x] Console logs do not capture private user analytics.
- [x] Add a review checklist for new dashboard fields.
- [x] Add a denylist for private telemetry fields: IP, device fingerprint, session id, private user-agent record, wallet connect attempt, wallet failure, private funnel step, raw prompt, raw completion, provider API key, secret value, unrestricted compiler reasoning trace, private provider request/response body, and unredacted stack trace.

**Approval criteria:**

- [x] Public console is transparency-focused and restricted AI operations are monitoring-focused, not outcome-control-focused.
- [x] Protected game state cannot be mutated through admin.
- [x] No private user analytics field is required to render the console.
- [x] Restricted AI operations can be disabled without affecting public transparency dashboards or game execution.

---

#### M5 Approval

M5 is approved only if all M5 submilestones are approved and:

- [ ] At least three transparency insights can be derived from public/devnet usage: fee flow, prize distribution, rule lifecycle, settlement proof, or reward distribution.
- [ ] Every public displayed metric has a documented public derivation path, and every restricted AI metric has a documented redacted operational source.
- [ ] Restricted AI operations dashboard provides useful agent/provider usage monitoring without exposing sensitive payloads.
- [ ] Console does not expose private user analytics, secrets, raw prompts, raw completions, or unredacted operational payloads, and does not compromise game integrity.

---

### 15.7 Milestone M9 — Mainnet Readiness Gates

#### M9.0 — Election Randomness Gate

##### Checklist

- [x] Switchboard VRF is used for rule election.
- [x] Eligible pool hash is committed before VRF fulfillment.
- [x] Top-voted finalist hash is committed before VRF fulfillment.
- [x] Random finalists are derived from fulfilled VRF randomness, not request entropy.
- [x] Final active rule is selected with ranged output or rejection sampling.
- [x] Deterministic fallback to next finalist is impossible.
- [x] Election proof is visible in public audit endpoint.

##### Approval Criteria

- [x] No Chainlink/EVM VRF dependency exists in Solana MVP.
- [x] No backend-generated randomness can affect rule election.
- [x] An auditor can recompute finalist selection and elected rule from public commitments and VRF fulfillment.

#### M9.1 — Rule Compiler Gate

##### Checklist

- [x] All supported natural-language examples compile into DSL/AST.
- [x] Unsupported operations are rejected.
- [x] Vague rules require clarification or are rejected.
- [x] Compiler outputs are versioned and hashable.
- [x] Rule Reviewer detects mismatches between text and DSL/AST.
- [x] Frozen artifact includes original text, interpretation, AST, tests, versions and timestamp.

##### Approval Criteria

- [x] 100% of critical compiler tests pass.
- [x] No rule can be activated without a frozen artifact.
- [x] No post-draw recompilation path exists.

#### M9.2 — Runtime Security Gate

##### Checklist

- [x] Timeout limit implemented.
- [x] Memory limit implemented.
- [x] Operation limit implemented.
- [x] Network access blocked.
- [x] Filesystem access blocked.
- [x] Imports blocked.
- [x] Randomness blocked.
- [x] Clock/time access blocked.
- [x] Unknown AST nodes rejected.
- [x] Runtime fuzz tests added.

##### Approval Criteria

- [x] Runtime sandbox tests pass in CI.
- [x] Malicious DSL fixtures fail safely.
- [x] Runtime output is deterministic across repeated runs.

#### M9.3 — Accounting Gate

##### Checklist

- [x] No alternative rule case tested.
- [x] Invalidated alternative rule case tested.
- [x] No winners case tested.
- [x] Multiple winners case tested.
- [x] Rounding case tested.
- [x] Minimum payout case tested.
- [x] Unclaimed claim case tested.
- [x] Creator reward reserve/cap case tested.
- [x] Repeated approval vote fee sequence tested before turn 100: `0, 2×VOTE_FEE, 4×VOTE_FEE, 8×VOTE_FEE...`.
- [x] Repeated approval vote fee sequence tested from turn 100: `VOTE_FEE, 2×, 4×...`.
- [x] Repeated elimination vote fee sequence tested before turn 100: `0, 2×VOTE_FEE, 4×VOTE_FEE, 8×VOTE_FEE...`.
- [x] Repeated elimination vote fee sequence tested from turn 100: `VOTE_FEE, 2×VOTE_FEE, 4×VOTE_FEE...`.
- [x] Repeated vote fee transfers reconcile into the prize pool across contract, backend, indexer, and transparency projections.
- [x] Repeated vote retry/idempotency tested so a retry cannot double-charge or create an unintended extra vote sequence.
- [x] Elected-rule voter reward is tested with repeated votes and remains one reward share per unique voter wallet.
- [x] Rollover partial and total cases tested.

##### Approval Criteria

- [x] Backend, game engine and contract accounting match. Historical baseline; PRD v1.5.1 requires the same parity for repeated vote fee sequences before mainnet.
- [x] Backend, indexer/transparency, and contract repeated-vote fee accounting match for approval and elimination votes.
- [x] No duplicate payout possible under retry.
- [x] No duplicate repeated-vote charge or unintended extra vote sequence is possible under retry.
- [x] Creator reward cannot exceed reserve or cap.
- [x] Voter reward recipient count is wallet-unique even when voters cast repeated approval votes.

#### M9.4 — Mobile Reliability Gate

##### Checklist

- [x] Wallet connection tested on supported mobile wallets.
- [x] Transaction rejected state tested.
- [x] Transaction pending state tested.
- [x] Transaction delayed state tested.
- [x] Duplicate submission prevention tested.
- [x] User returning without local state tested.
- [x] Turn changes during wallet signature tested.

##### Approval Criteria

- [x] Mobile wallet recovery works across supported wallets.
- [x] No duplicate game action occurs after retry.
- [x] User receives clear status for every wallet outcome.

#### M9.5 — Abuse Resistance Gate

##### Checklist

- [x] No fixed per-wallet repeated approval vote cap remains; approval repeats are controlled by sequence/idempotency and escalating fees.
- [x] No fixed per-wallet repeated elimination vote cap remains; elimination repeats are controlled by sequence/idempotency and escalating fees.
- [x] No fixed per-wallet repeated guess cap remains; guesses are controlled by wallet/turn sequence/idempotency and escalating fees.
- [x] No fixed per-wallet paid rule-proposal cap remains; proposals are controlled by wallet/turn sequence/idempotency and escalating fees.
- [ ] Escalating repeated-vote fee enforcement cannot be bypassed by retry, stale client state, or alternate API path.
- [ ] Escalating repeated guess and rule-proposal fees cannot be bypassed by retry, stale client state, or alternate API path.
- [ ] Rule report flow implemented.
- [ ] Paid rule removal flow implemented.
- [ ] Public vote concentration dashboard implemented from on-chain/indexer data.
- [ ] Repeated paid-action concentration dashboard implemented from public/on-chain action records, including same-wallet repeat patterns and repeated spend by action scope.
- [ ] Free-first-action monitoring implemented for turns before 100, with alerts when the same scope receives more than one free action.
- [ ] Fee-escalation anomaly alerts implemented for guesses, rule proposals, approval votes, and elimination votes.
- [ ] Public-signal abuse alerts implemented without private IP/device/session/funnel telemetry.

##### Approval Criteria

- [ ] Basic Sybil manipulation patterns are visible from public/on-chain signals in transparency/operator views.
- [ ] Free first actions before turn 100 cannot be spammed beyond one free action per action scope.
- [x] Repeated free votes cannot occur for the same `(turn, wallet, rule, side)`.
- [ ] Repeated paid guesses, rule proposals, and votes become progressively more expensive and remain visible in public abuse/economy dashboards.
- [ ] Transparency/operator views can distinguish broad unique-wallet support from concentrated repeated voting by a small public wallet group.
- [ ] Paid rule removal is rate-limited, fee-based, protected by vote thresholds, and blocked after eligible pool lock.

#### M9.6 — Observability & Incident Gate

##### Checklist

- [ ] Compiler metrics dashboard exists.
- [ ] Restricted AI operations dashboard exists with redacted agent/provider usage metrics.
- [ ] Runtime metrics dashboard exists.
- [ ] Accounting metrics dashboard exists.
- [ ] Repeated paid-action fee dashboard exists, showing sequence counts, paid amounts, free-first-action usage, and fee escalation by action scope and public wallet group.
- [ ] Public transaction/action status dashboard exists without private wallet funnel telemetry.
- [ ] Alerts exist for repeated-action fee mismatch, unexpected free repeat actions, abnormal repeated-action concentration, and indexer/contract count divergence.
- [ ] Incident runbook exists.
- [ ] Incident runbook covers pausing or disabling repeated paid actions if fee escalation, indexing, or abuse detection fails.
- [ ] Emergency pause procedure tested.

##### Approval Criteria

- [ ] On-call operator can diagnose compiler/agent/provider/runtime/accounting failures.
- [ ] On-call operator can diagnose repeated paid-action fee, sequence, and abuse-detection failures.
- [ ] Emergency pause can stop unsafe transitions.
- [ ] All critical alerts fire in staging.

---

### 15.8 Milestone M6 — Mainnet Beta

#### Objective

Deploy a controlled mainnet beta with real SOL payments, production monitoring, restricted access, creator rewards, and operational runbooks. M6 cannot start any real SOL payment, payout, claim, treasury transfer, or creator reward until every M9 Mainnet Readiness Gate has been approved.

---

#### M6.1 — Mainnet Deployment

**Objective:** deploy contracts and services to a controlled production-like mainnet beta only after M9 gates are approved.

**Checklist:**

- [ ] Confirm all M9 Mainnet Readiness Gates are approved before enabling real SOL flows.

- [ ] Deploy mainnet contracts.
- [ ] Deploy production API.
- [ ] Deploy production worker.
- [ ] Deploy production web app.
- [ ] Deploy read-only transparency console with restricted AI operations monitoring if enabled.
- [ ] Configure production environment variables.
- [ ] Configure secrets management.
- [ ] Configure production database.
- [ ] Configure production Redis/queue.
- [ ] Verify deployment addresses.
- [ ] Document deployment state.

**Approval criteria:**

- [ ] Mainnet beta environment is reachable.
- [ ] All required M9 gates are approved and documented.
- [ ] All required services are healthy.
- [ ] Deployment is documented and reproducible.

---

#### M6.2 — Real Payment Flow

**Objective:** enable real SOL payment, prize, treasury, claim, and creator reward behavior.

**Checklist:**

- [ ] Enable SOL guess fee flow.
- [ ] Enable SOL rule proposal fee flow.
- [ ] Enable SOL approval vote fee flow, including repeated-vote escalation.
- [ ] Enable SOL elimination vote fee flow, including repeated-vote escalation.
- [ ] Enable prize vault funding.
- [ ] Enable treasury/platform monetization accounting.
- [ ] Enable winner claim flow.
- [ ] Enable creator reward funding from the creator reward reserve sourced from platform monetization.
- [ ] Test winner claim on mainnet beta with limited values.
- [ ] Test creator reward claim/payment with limited values.
- [ ] Test repeated approval vote payments on mainnet beta with limited values.
- [ ] Test repeated elimination vote payments on mainnet beta with limited values.
- [ ] Reconcile balances after test turns.

**Approval criteria:**

- [ ] Real payments work with limited beta values.
- [ ] Accounting reconciles across contract, backend, indexer, and transparency projections.
- [ ] Repeated vote fee escalation reconciles across contract, backend, indexer, and transparency projections.
- [ ] Creator reward does not reduce winner-visible payout.

---

#### M6.3 — Production Observability

**Objective:** monitor the system under real usage.

**Checklist:**

- [ ] Configure API metrics.
- [ ] Configure worker metrics.
- [ ] Configure queue metrics.
- [ ] Configure database metrics.
- [ ] Configure LLM provider metrics.
- [ ] Configure restricted AI operations dashboard metrics and redaction.
- [ ] Configure VRF/draw metrics.
- [ ] Configure payout metrics.
- [ ] Configure repeated vote fee and vote-sequence metrics.
- [ ] Configure access logs only for restricted operator surfaces; public transparency pages must not log private analytics fields.
- [ ] Configure alerting.
- [ ] Configure structured logs.
- [ ] Create operational dashboard.

**Approval criteria:**

- [ ] Team can detect draw failures, queue lag, LLM failures, payout issues, and repeated-vote fee/indexing issues.
- [ ] Team can diagnose AI agent/provider failures without exposing raw prompts, raw completions, secrets, or private user analytics.
- [ ] Alerts fire in test scenarios.
- [ ] Logs allow incident reconstruction.

---

#### M6.4 — Mobile Beta QA

**Objective:** validate mobile-first behavior in supported wallet/browser environments.

**Checklist:**

- [ ] Test Phantom mobile.
- [ ] Test Backpack mobile.
- [ ] Test Solflare mobile.
- [ ] Test mobile Safari.
- [ ] Test mobile Chrome.
- [ ] Test in-wallet browsers.
- [ ] Test wallet deep-link return.
- [ ] Test PWA behavior.
- [ ] Test poor network state.
- [ ] Test app background/foreground during wallet approval.
- [ ] Document wallet-specific issues.

**Approval criteria:**

- [ ] Core flow works on supported wallet paths.
- [ ] Wallet handoff/recovery is reliable.
- [ ] Critical mobile UX blockers are resolved.

---

#### M6.5 — Beta Analytics

**Objective:** collect and publish public/derivable beta transparency signals for economy, rules, rewards, settlement, and turn activity.

**Checklist:**

- [ ] Track public activity per turn.
- [ ] Track turn duration performance.
- [ ] Track rule proposal quality.
- [ ] Track public voting behavior.
- [ ] Track public fee collection.
- [ ] Track public prize-pool funding and distribution.
- [ ] Track public creator and voter reward behavior.
- [ ] Track reward sustainability.
- [ ] Produce beta metrics report.

**Approval criteria:**

- [ ] Transparency console shows enough public data for beta operations and community review.
- [ ] Team can assess turn-cycle public activity and economy effects without private retention telemetry.
- [ ] Team can assess creator/voter reward sustainability from public accounting data.

---

#### M6.6 — Incident Readiness

**Objective:** prepare for controlled operation and recovery.

**Checklist:**

- [ ] Write incident response runbook.
- [ ] Test emergency pause.
- [ ] Test deployment rollback.
- [ ] Test database backup.
- [ ] Test database restore.
- [ ] Test queue recovery.
- [ ] Test LLM provider outage scenario.
- [ ] Test VRF delay scenario.
- [ ] Test restricted operator lockout/recovery.
- [ ] Define severity levels.
- [ ] Define on-call ownership.

**Approval criteria:**

- [ ] Team can pause and recover safely.
- [ ] Recovery procedures are documented.
- [ ] Critical operational risks have response plans.

---

#### M6 Approval

M6 is approved only if all M6 submilestones are approved and:

- [ ] Mainnet beta runs multiple consecutive turns without manual intervention.
- [ ] 90%+ successful guess submission completion after wallet connect.
- [ ] 90%+ successful claim completion for eligible winners.
- [ ] 95%+ turns close without manual intervention.
- [ ] 95%+ compilation/evaluation jobs complete within operational target.
- [ ] 20%+ of active players vote at least once.
- [ ] 10%+ of active players propose at least one rule.

---

### 15.9 Milestone M7 — Public Launch Readiness

#### Objective

Prepare the product for broader public launch by hardening infrastructure, improving retention loops, polishing mobile UX, and validating acquisition/share mechanics.

---

#### M7.1 — Mobile UX Polish

**Objective:** refine the mobile experience based on prototype and beta data.

**Checklist:**

- [ ] Improve onboarding copy.
- [ ] Improve number picker usability.
- [ ] Improve wallet connection messaging.
- [ ] Improve transaction pending states.
- [ ] Improve rule composer clarity.
- [ ] Improve rule cards.
- [ ] Improve turn-cycle explanation.
- [ ] Improve result screen.
- [ ] Improve near-miss messages.
- [ ] Improve share card UX.
- [ ] Fix top mobile UX blockers.

**Approval criteria:**

- [ ] Mobile users complete core flow reliably.
- [ ] Support questions around basic mechanics decrease.
- [ ] No critical mobile UX blocker remains.

---

#### M7.2 — Retention Loop Refinement

**Objective:** improve reasons to return after loss, near-miss, vote, and rule creation.

**Checklist:**

- [ ] Refine near-miss feedback.
- [ ] Refine creator status feedback.
- [ ] Refine next-turn CTA.
- [ ] Refine turn-cycle prompts.
- [ ] Refine share moments.
- [ ] Refine public activity feed.
- [ ] Add return prompt experiments if appropriate.
- [ ] Measure return after each retention moment.

**Approval criteria:**

- [ ] Return after first round improves compared with beta baseline.
- [ ] Return after near-miss is measurable.
- [ ] Rule creators show repeat behavior.

---

#### M7.3 — Infrastructure Scale

**Objective:** prepare backend, worker, queue, database, and monitoring for public launch load.

**Checklist:**

- [ ] Load test API.
- [ ] Load test worker queue.
- [ ] Load test database reads/writes.
- [ ] Test burst voting load.
- [ ] Test burst repeated approval voting load.
- [ ] Test burst repeated elimination voting load.
- [ ] Test repeated vote fee escalation under concurrent retries.
- [ ] Test burst guess submission load.
- [ ] Test verification queue under load.
- [ ] Test LLM fallback under provider failure.
- [ ] Test VRF/draw failure recovery.
- [ ] Test database backup and restore.
- [ ] Test deployment rollback.
- [ ] Tune non-economic rate limits and repeated paid-action abuse thresholds; do not introduce fixed caps for paid guesses, rule proposals, or votes.

**Approval criteria:**

- [ ] Expected launch load passes.
- [ ] Queue lag stays within operational target.
- [ ] Repeated vote bursts do not break fee accounting, vote counts, indexer projections, or transparency projections.
- [ ] System fails gracefully under provider issues.

---

#### M7.4 — Transparency Insights Maturity

**Objective:** ensure the console supports public/derivable turn, rule, fee, prize, reward, settlement, and audit analysis, plus restricted AI operations monitoring.

**Checklist:**

- [ ] Validate public turn activity dashboard data.
- [ ] Validate public rule lifecycle dashboard data.
- [ ] Validate public fee dashboard data.
- [ ] Validate public prize/reward dashboard data.
- [ ] Validate repeated vote and repeated vote fee dashboard data.
- [ ] Validate turn-cycle dashboard data.
- [ ] Validate settlement proof and audit dashboard data.
- [ ] Validate restricted AI operations dashboard data, access control, and redaction.
- [ ] Add filters by date, turn duration, rule status, fee type, and public action type.
- [ ] Add export/snapshot functionality.
- [ ] Add dashboard documentation.

**Approval criteria:**

- [ ] Transparency console supports launch decision-making and community review, and restricted AI operations supports operator diagnosis.
- [ ] Metrics are trusted by product/engineering and reproducible by third parties.
- [ ] Transparency console can distinguish unique-voter support from repeated-vote intensity using public/on-chain data.
- [ ] Dashboard can identify at least three launch risks or opportunities.

---

#### M7.5 — Launch Checklist

**Objective:** complete product, engineering, security, analytics, and operations readiness.

**Checklist:**

- [ ] Complete product readiness review.
- [ ] Complete engineering readiness review.
- [ ] Complete smart contract review.
- [ ] Complete transparency-console data-boundary review and restricted-operator access-control review.
- [ ] Complete secrets management review.
- [ ] Complete incident response review.
- [ ] Complete analytics validation.
- [ ] Complete support/readme/runbook updates.
- [ ] Complete launch decision memo.

**Approval criteria:**

- [ ] No unresolved critical/high issues remain.
- [ ] Product, engineering, operations, security, and analytics owners approve launch.
- [ ] Launch rollback plan exists.

---

#### M7 Approval

M7 is approved only if all M7 submilestones are approved and:

- [ ] 95%+ mobile core flow completion in supported wallets.
- [ ] API and worker load tests pass expected launch volume.
- [ ] Retention metrics justify broader launch.
- [ ] Creator reward economics remain sustainable.

---

### 15.10 Milestone M8 — Growth Experiments

#### Objective

Expand the product beyond the core game loop with measurable social, creator, community, and return-loop experiments.

---

#### M8.1 — Creator Growth

**Objective:** increase repeat rule creation and creator identity.

**Checklist:**

- [ ] Add creator badges.
- [ ] Add creator leaderboard.
- [ ] Add creator profile improvements.
- [ ] Add elected-rule history.
- [ ] Add winner-created-by-rule metric.
- [ ] Add creator reward history.
- [ ] Track repeat creator rate.
- [ ] Measure creator retention impact.

**Approval criteria:**

- [ ] Creator activity increases without confusing core game loop.
- [ ] Repeat rule creation improves.
- [ ] Metrics are visible in appropriate transparency or restricted operator views.

---

#### M8.2 — Community Rounds

**Objective:** allow themed or hosted rounds for communities or streamers.

**Checklist:**

- [ ] Define community round concept.
- [ ] Define host identity/display.
- [ ] Define hosted round copy/visual treatment.
- [ ] Add hosted round tracking.
- [ ] Add share link for community round.
- [ ] Add public transparency metrics for community rounds.
- [ ] Add rollback/disable flag.

**Approval criteria:**

- [ ] Community rounds increase participation or sharing.
- [ ] Hosted mode does not break normal turn cycle.
- [ ] Feature can be disabled safely.

---

#### M8.3 — Spectator Mode

**Objective:** make the game entertaining for users who have not yet submitted a guess.

**Checklist:**

- [ ] Add spectator-friendly live view.
- [ ] Highlight leading rules.
- [ ] Highlight prize and countdown.
- [ ] Highlight near-miss and result stories.
- [ ] Allow low-friction vote path if allowed.
- [ ] Add spectator-to-player CTA.
- [ ] Track spectator visits.
- [ ] Track spectator-to-player conversion.

**Approval criteria:**

- [ ] Spectator mode increases conversion or repeat visits.
- [ ] Spectator UI does not distract active players.
- [ ] Metrics are available in appropriate transparency or restricted operator views.

---

#### M8.4 — Return Experiments

**Objective:** test prompts that bring users back without harming experience.

**Checklist:**

- [ ] Define return prompt hypotheses.
- [ ] Add in-app return prompts.
- [ ] Test push-notification-ready flow if enabled.
- [ ] Segment by previous action: loss, near-miss, creator, voter, spectator.
- [ ] Track prompt impression.
- [ ] Track prompt click.
- [ ] Track return and subsequent action.
- [ ] Add opt-out/disable behavior where needed.

**Approval criteria:**

- [ ] Return prompts improve retention.
- [ ] Prompts do not create confusing or spammy experience.
- [ ] Experiment has rollback plan.

---

#### M8.5 — Rule Tournaments

**Objective:** add periodic competition around rule creation.

**Checklist:**

- [ ] Define tournament duration.
- [ ] Define scoring metric.
- [ ] Define eligible rules.
- [ ] Define reward/status outcome.
- [ ] Add tournament leaderboard.
- [ ] Add tournament page/card.
- [ ] Add transparency/operator tracking.
- [ ] Add rollback/disable flag.

**Approval criteria:**

- [ ] Tournaments increase creator engagement.
- [ ] Users understand tournament scoring.
- [ ] Tournament does not reduce clarity of normal turn play.

---

#### M8 Approval

M8 experiments are approved individually. Keep only experiments that:

- [ ] have a clear target metric;
- [ ] improve retention, engagement, sharing, or creator activity;
- [ ] do not make the mobile core loop harder to understand;
- [ ] are measurable through public transparency metrics where applicable;
- [ ] have a rollback plan.

---

### 15.11 Global Release Checklist

Before any public production release, the following checklist must be complete.

#### Product

- [ ] Mobile-first DApp core loop works end-to-end.
- [ ] Users can understand the current round quickly.
- [ ] Rule creation is free-form and token-limited.
- [ ] Turn duration cycle is visible and understandable.
- [ ] Creator reward behavior is implemented and documented.
- [ ] Near-miss and return loops are implemented.

#### Engineering

- [ ] Monorepo CI passes.
- [ ] Docker local environment is reproducible.
- [ ] Production deployment pipeline is tested.
- [ ] Database migrations are tested.
- [ ] Queue processing is tested.
- [ ] LLM fallback is tested.
- [ ] VRF/draw flow is tested.
- [ ] Payout accounting is tested.

#### Security

- [ ] Smart contract review complete.
- [ ] Transparency-console data boundary and restricted-operator access control verified.
- [ ] Secrets management verified.
- [ ] Emergency pause tested.
- [ ] Incident response runbook ready.
- [ ] Backup and restore tested.

#### Analytics

- [ ] Public turn activity metrics are tracked.
- [ ] Public fee and prize metrics are tracked.
- [ ] Public rule lifecycle metrics are tracked.
- [ ] Public creator/voter reward metrics are tracked.
- [ ] Turn-cycle metrics are tracked.
- [ ] Reward sustainability metrics are tracked.

---

### 15.12 Global Approval Criteria

Public release is approved only if:

- [ ] all required milestones through M7 are approved;
- [ ] no unresolved critical/high issue remains;
- [ ] production operations are ready;
- [ ] transparency metrics can guide launch decisions and community review;
- [ ] creator reward economics are sustainable;
- [ ] mobile wallet flow is reliable;
- [ ] payout and verification systems are auditable.

## 16. Resolved MVP Decisions

This section replaces the former open questions list. The following decisions are binding for MVP implementation unless a future PRD version explicitly changes them.

1. `RULE_MAX_TOKENS` is fixed at `80` for MVP and remains configurable by deployment environment.
2. Idealer launches as a mobile-first browser DApp with in-wallet browser and mobile wallet deep-link support. PWA capability is included, but PWA installation is not the primary launch path.
3. Wallet integration remains wallet-adapter neutral, with QA priority for Phantom, Backpack, and Solflare mobile paths.
4. Full sanitized original rule text is stored on-chain in the `RuleProposal` account. Off-chain copies may exist only for indexing, search, analytics, and UI performance.
5. Rule votes are on-chain through `RuleVote` accounts or an equivalent on-chain account model. MVP does not use off-chain vote commitments as the primary voting record.
6. The finalist set is exactly 10 rules whenever at least 10 eligible rules exist: 3 top-voted eligible rules plus 7 VRF-random eligible rules. If fewer than 10 eligible rules exist, all available eligible rules form the finalist set.
7. Every production turn lasts 24 hours: ~22h of phase 1 (create rules + pick numbers, closing at the 9167-bps rule-election/guess cutoff) followed by ~2h of phase 2 (finalist shortlist, 1-hour decision/elimination window, active-rule election, draw at turn end). (Revised 2026-07; replaces the former `2h → 2h → 8h → 8h` cycle.)
8. The alternative rule pool remains 50% of the post-treasury playable prize pool. If no alternative rule is active or no alternative-rule winners exist, the alternative bucket follows the rollover rules.
9. Creator rewards remain fixed at 15% of each individual alternative-rule winner payout, funded from the creator reward reserve sourced from platform monetization and subject to reserve and cap.
10. MVP reserves 20% of platform monetization for the creator reward reserve. This is a configurable treasury policy, but winner-visible payouts must never be reduced to fund creator rewards.
11. Normal users see simple rule explanations, status, difficulty labels, and audit links. Detailed AI/compiler reasoning appears only in expandable audit panels, public-safe audit views, or restricted operator views when it contains non-public operational detail.
12. Proposed rules cannot be edited after on-chain submission. A user must submit a new paid proposal if they want a different rule text. Preflight and precompilation artifacts are therefore immutable per proposal.
13. MVP supports Portuguese and English rule text. The compiler stores a normalized official interpretation suitable for deterministic DSL/AST compilation, and user-facing explanations may be localized.
14. Rule difficulty shown in the frontend is generated from deterministic analysis where possible and bounded Monte Carlo simulation where needed, not from ungrounded LLM judgment alone.
15. MVP DSL supports prebuilt rule nodes plus a limited bounded expression tree for allowed arithmetic, comparison, counting, intersection, difference, ordering, position access, and bounded removal operations.
16. `MAX_REMOVABLE_NUMBERS` is fixed at `4` for MVP.
17. Production MCP tools are limited to the bounded MCP server groups listed in section 7.11. Shell execution, arbitrary filesystem access, arbitrary network access, and direct smart contract mutation remain forbidden.
18. Long turns use in-app countdowns and return prompts in MVP. Push notifications remain push-notification-ready architecture only and are not required for MVP launch.
19. Production deploys API and worker as separate services from the start.
20. Optional local observability containers (`idealer-prometheus`, `idealer-grafana`) are included under a separate Docker Compose observability profile, not in the default required local stack.
21. M9 Mainnet Readiness Gates are mandatory before M6 can process any real SOL payment, payout, claim, treasury transfer, or creator reward on mainnet.
22. Launch-blocking metrics are the M9 approval gates plus the M6/M7 approval criteria for mobile reliability, turn automation, job completion, claims, abuse visibility, and payout/accounting reconciliation.
23. Default MVP/devnet base fees are: guess submission `0.01 SOL`, rule proposal `0.02 SOL`, paid rule removal `0.05 SOL`, approval/elimination side vote base fee `0.005 SOL`, repeated action exponent base `2`, and report `0 SOL`, with `treasuryFeeBps = 500`. Before turn 100, the first same-wallet action in each scope (guess, rule proposal, approval side, elimination side) is free; repeats start paid immediately at `2^n * BASE_FEE`.
24. The default creator reward cap is `0.25 SOL` per turn, with 20% of platform monetization reserved for the creator reward reserve.
25. The default minimum claim threshold is `0.005 SOL`; payouts below this threshold roll over to the same category bucket.
26. The default claim window is `12` turns or `7` days, whichever happens first; expired unclaimed payouts roll over to the same category bucket.
27. MVP non-economic rate limits are defined in `MVP_RATE_LIMIT_CONFIG` and must be enforced server-side, while on-chain constraints remain the source of truth for repeated guess sequencing, rule-proposal fee sequencing, repeated vote sequencing/idempotency, and paid removals.

---

## Appendix A — Example User Flows

### New Mobile User Flow

1. User opens Idealer from mobile browser, wallet browser, or shared link.
2. User lands directly in the current Live Round Hub.
3. User sees prize pool, countdown, and leading rule in under 10 seconds.
4. User connects mobile wallet.
5. User picks 6 numbers using the mobile number picker.
6. User confirms the action in wallet and returns to the DApp.
7. User votes on a rule.
8. User optionally proposes their own rule in natural language.
9. User watches election and draw.
10. User receives result.
11. User sees near-miss or win explanation.
12. If the active rule created winners, the rule creator sees their creator reward.
13. User sees the next turn duration in the cycle.
14. User shares result or joins next round.

### Rule Creator Flow

1. User submits a guess and receives a current-turn Game Token.
2. User opens rule composer.
3. Writes a free-form rule.
4. Sees live token count.
5. Adjusts if over limit.
6. Runs preflight: token, prohibited references, and dedup checks.
7. Confirms proposal only after preflight passes.
8. Rule appears in public pool and enters background precompilation.
9. Other Game Token holders vote.
10. Rule may enter the finalist set as a top-voted or VRF-random finalist.
11. Rule may be VRF-elected and frozen.
12. Creator receives status if rule becomes active.
13. If the active rule produced winners, creator receives 15% of each individual alternative-rule winner payout funded from the creator reward reserve sourced from platform monetization.
14. Creator profile updates after round.

---

## Appendix B — Product Principle

The UI should constantly answer one question:

> **Why should I care about this round, even if I do not win?**

If the product answers that well, Idealer becomes more than a lottery. It becomes a mobile social game where every round creates a new story.

---

## Appendix C — Retention Impact of Creator Rewards and Variable Turn Duration

### Creator Reward: Expected Impact

Adding a 15% creator reward for the active rule creator is expected to have a positive effect on creator retention.

Positive effects:

- gives rule creators an economic reason to return and create better rules;
- makes rule creation a meaningful role, not only a cosmetic feature;
- encourages creators to share and campaign for their rules;
- may increase rule quality because creators benefit when their rule creates winners;
- strengthens the social loop around the Rule of the Hour.

Potential negative effects:

- if framed poorly, users may misunderstand the reward as a deduction from winners;
- creators may optimize for rules that are popular rather than clear or fun;
- creator rewards may become too weak if platform monetization is small in early rounds.

Mitigations:

- fund the creator reward from the creator reward reserve sourced from platform monetization, not from winner payouts;
- avoid presenting the reward as a winner-side deduction;
- show creator rewards primarily in creator-facing and aggregate distribution views;
- track whether creator rewards increase repeat rule creation and sharing;
- monitor whether the creator reward reserve can sustainably cover creator rewards.

### Variable Turn Duration Cycle: Expected Impact

The repeating duration cycle `2h → 2h → 8h → 8h` is expected to have a mixed but mostly positive retention effect if the UI supports it well.

Positive effects:

- short turns create fast feedback and early habit formation;
- long turns allow larger prize pools and more rule voting;
- the changing cadence makes the game feel less repetitive;
- longer turns create anticipation and shareable events;
- different durations can fit different user schedules.

Potential negative effects:

- users may be confused if they expect every turn to last 2 hours;
- longer turns can reduce urgency;
- inactive feeds during long turns can make the product feel slow;
- users may miss draws without reminders.

Mitigations:

- show current turn duration prominently;
- show the next duration in the cycle;
- use countdowns, reminders, and activity feed updates;
- add share prompts during 8-hour turns;
- measure retention separately by turn duration.

### Overall Assessment

The two changes are compatible and reinforce each other.

Creator rewards make rule creation more valuable, while longer turns give creators more time to attract votes and attention.

The expected product effect is positive for retention among creators and engaged users, but the UI must clearly explain both mechanics to avoid confusion or perceived unfairness.

---

## Appendix D — Review Resolution Matrix

This PRD revision integrates the technical review findings into the product and implementation specification.

|   # | Review issue                                             | PRD v1.3.4 resolution                                                                                                                         |
| --: | -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
|   1 | Chainlink VRF is not native to Solana                    | Switchboard VRF is the only MVP randomness provider for both number draw and rule election.                                                   |
|   2 | Random finalists used request entropy before fulfillment | Random finalists are derived only from fulfilled Switchboard VRF randomness.                                                                  |
|   3 | Fallback finalist invalidates VRF guarantee              | Finalists must be precompiled before election; deterministic fallback to the next finalist is disallowed.                                     |
|   4 | Removal protection conflict                              | Paid removal is included in MVP with differentiated vote protection: creator self-removal threshold and higher third-party removal threshold. |
|   5 | Dedup after payment creates UX/compliance issue          | Dedup is moved to `/api/v1/rules/preflight` before payment, with short-lived `preflight_token`.                                               |
|   6 | Game Token security unresolved                           | Game Token is defined as an on-chain PDA issued by `submit_guess`.                                                                            |
|   7 | Re-proposal vs historical dedup conflict                 | Re-proposals are allowed after `REPROPOSAL_COOLDOWN_TURNS = 5`.                                                                               |
|   8 | 13-minute 1h window is too tight for VRF + compilation   | Rules are precompiled incrementally during the turn and cached before election.                                                               |
|   9 | Modulo bias in VRF index selection                       | Election uses ranged VRF output or rejection sampling, not raw modulo.                                                                        |
|  10 | Rule state machine missing                               | Formal Rule State Machine added.                                                                                                              |
|  11 | Monte Carlo unbounded                                    | Monte Carlo difficulty config now has max samples, timeout, and convergence threshold.                                                        |
|  12 | pgvector index unspecified                               | HNSW index and query settings specified for `rule_registry_embeddings`.                                                                       |
|  13 | Critical hooks can DoS player actions                    | Hooks are classified as CRITICAL/ANALYTICS/OPERATIONAL and circuit breaker config is defined.                                                 |
|  14 | Removal fee copy/config inconsistency                    | Removal fee destination is fixed to `prize_pool` in MVP, allowing accurate UI copy and avoiding configurable mismatch.                        |
|  15 | `dedup_score` belongs to wrong layer                     | `RuleDedupResult` and `GateCheckLog` are separated from `RuleCompilationResult` and compiler logs.                                            |

Implementation priority:

```text
M0/M1: specification cleanup, state machines, schemas, preflight contracts
M2: Game Token PDA, preflight-gated proposal/voting, devnet account model
M3: Switchboard election VRF, precompilation cache, ranged finalist selection
M4+: accounting and creator reward reconciliation against finalized active rule
M9: mainnet gates for election randomness, compiler, runtime, accounting, mobile reliability and abuse resistance
```
