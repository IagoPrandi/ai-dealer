# Tyche — Feature PRD: Founder Pass NFT Utility

> **Version:** 0.1.0 (Draft for review)
> **Status:** Implementation specification — benefits and Magic Eden launch venue confirmed; NFT standard, sale operations, and listed policy decisions remain open
> **Last Updated:** 2026-09-20
> **Parent Documents:** [PRD.md](PRD.md) §1.7 and [PRD-TOKENOMICS-v2.8.md](PRD-TOKENOMICS-v2.8.md) §5.1.2
> **Owner:** Product / Solana Programmes / Tokenomics
> **Primary Surface:** Mobile-first Tyche DApp
> **Language:** English UTF-8 for UI and sale copy

---

## Table of Contents

1. [Summary](#1-summary)
2. [Normative Scope](#2-normative-scope)
3. [Confirmed Product Rules](#3-confirmed-product-rules)
4. [Magic Eden Launch and NFT Standard Gate](#4-magic-eden-launch-and-nft-standard-gate)
5. [Player Flows](#5-player-flows)
6. [On-Chain Account and Instruction Design](#6-on-chain-account-and-instruction-design)
7. [JDR Claim and Campaign Accounting](#7-jdr-claim-and-campaign-accounting)
8. [Fee Waivers and Game Economics](#8-fee-waivers-and-game-economics)
9. [API, Indexer, and UI](#9-api-indexer-and-ui)
10. [Security and Abuse Controls](#10-security-and-abuse-controls)
11. [Testing and Acceptance Criteria](#11-testing-and-acceptance-criteria)
12. [Implementation Milestones](#12-implementation-milestones)
13. [Release Gates](#13-release-gates)
14. [Decision Register](#14-decision-register)
15. [Magic Eden Evidence](#15-magic-eden-evidence)

---

## 1. Summary

Tyche will recognize a limited, transferable Founder Pass NFT to grant four
bounded game benefits: an optional JDR claim boost of up to 100x, 1,000
ordinary-weight vote actions without Tyche vote fees, 100 rule proposals
without Tyche proposal fees, and 50 submitted bets without Tyche guess fees.
All passes share one window of 800 consecutive game turns, anchored at the
governed activation turn. Declining a benefit never defers it.

Tyche verifies pass ownership and tracks every allowance on-chain, keyed by
the individual NFT. Magic Eden is the owner's selected venue for minting and
launching the primary sale, subject to its Launchpad onboarding and technical
sale gates. A marketplace listing is not evidence that its primary mint
service can meet the sale requirements.

No NFT mint, public sale, mainnet deployment, or transaction is authorized by
this draft.

## 2. Normative Scope

- This PRD defines Founder Pass eligibility, benefit consumption, player
  flows, contract integration, and implementation acceptance criteria.
- [PRD.md](PRD.md) remains authoritative for ordinary turn, guess, rule,
  vote, prize-pool, and fee-sequence mechanics.
- [PRD-TOKENOMICS-v2.8.md](PRD-TOKENOMICS-v2.8.md) remains authoritative for
  JDR supply, campaign custody, and ordinary promotional rewards. Its
  §5.1.2 documents the required, inactive Founder Pass claim-accounting
  change. An approved economic configuration version is required before the
  boost becomes active.
- [docs/founder-pass-nft.md](docs/founder-pass-nft.md) is the concise Founder
  Pass product and sale summary. This PRD controls implementation detail
  when the two documents differ.
- The platform's metadata, mint page, collection badge, indexer, and API
  cache are discovery aids. They never authorize an on-chain benefit.

The pass grants no SOL prize-pool, treasury-fee, revenue-share, dividend,
yield, or guaranteed-return entitlement. The JDR boost applies only to
eligible promotional JDR rewards.

## 3. Confirmed Product Rules

### 3.1 Supply and sale intent

The maximum collection supply is **5,000 passes**. The intended sale has
five consecutive price lots denominated in USD:

| Lot | Price per pass | Provisional maximum | Maximum gross at that quantity |
| --- | ---: | ---: | ---: |
| 1 | USD 10 | 1,000 | USD 10,000 |
| 2 | USD 20 | 1,000 | USD 20,000 |
| 3 | USD 40 | 1,000 | USD 40,000 |
| 4 | USD 60 | 1,000 | USD 60,000 |
| 5 | USD 80 | 1,000 | USD 80,000 |
| **Total** | | **5,000** | **USD 210,000** |

The 1,000-per-lot distribution is a proposal, not a confirmed quantity.
Gross proceeds assume all lots sell out and exclude platform, network,
operating, tax, and benefit costs. Currency, conversion policy, unsold-lot
handling, per-wallet limits, and dates remain open.

### 3.2 Per-pass allowances

| Benefit | Lifetime rule | Consumption event |
| --- | --- | --- |
| JDR boost | Up to `base JDR × 100`, constrained by free JDR in the shared promotional campaign | A successful manual claim with a positive bonus |
| Votes | 1,000 successful, ordinary-weight approval or elimination vote actions with the Tyche vote fee waived | Each successful pass-funded vote |
| Rule proposals | 100 successful proposals with the Tyche proposal fee waived | Each successful pass-funded `propose_rule` |
| Bets | 50 successful submitted guesses with the Tyche guess fee waived | Each successful pass-funded `submit_guess` or `submit_additional_guess` |
| Active-turn window | One global window of 800 consecutive turns shared by all four benefits and by every pass, from `activation_turn_id` to `activation_turn_id + 799` inclusive | Fixed by governance at activation; never opened, extended, or renewed by any player action |

Quotas belong to the NFT, not its current wallet. They do not reset when the
NFT moves. Standard paid actions remain possible after a quota is depleted.
One action can use at most one pass. Multiple passes never multiply the same
reward or change one vote into more than one ordinary vote.

An action already free under the ordinary game policy consumes no pass quota
unless another pass benefit actually applies.
Network transaction fees and account rent are not Tyche action fees and
remain payable.

### 3.3 Active-turn window rule

Owner decisions of 2026-09-20, in two steps. The earlier rule of 100 distinct
turn IDs became a window of 800 consecutive turns; that window then became
**global** rather than per-pass.

There is one window for the whole collection: turns `activation_turn_id`
through `activation_turn_id + 799` inclusive, where `activation_turn_id` is
fixed by governance when benefits are activated. It is write-once, so
disabling and re-enabling cannot shift it under holders. No player action
opens, extends, renews, or resets it, and a transfer does not affect it.

Inside the window there is no per-turn budget: a pass may use benefits in every
turn it covers, limited only by the independent vote, proposal, and bet quotas.
Outside it a pass grants nothing, even with quota remaining. A failed or
reverted action consumes neither quota nor anything else.

Two consequences are deliberate and must be disclosed in sale copy:

1. **The clock cannot be deferred.** A holder chooses whether to spend a
   benefit, never when the window runs. Declining a benefit preserves quota but
   buys no extra time.
2. **Passes do not all get 800 usable turns.** Every pass carries identical
   quotas, but a pass that reaches its holder late in the window inherits only
   the remainder. Purchase and delivery timing therefore change realized value,
   which is a departure from the earlier "identical benefits regardless of
   purchase phase" wording. At the production 24-hour turn the whole window is
   about 800 days, a little over two years.

A JDR boost is attributed to the **originating reward turn ID**, not the turn
current at claim time, so a claim whose originating turn falls outside the
window is refused even when the claim itself is made inside it. In particular,
rewards earned before activation are not boostable. A claim with zero bonus is
an ordinary claim. Whether FP3 should instead attribute the boost to the claim
turn is an open point recorded under FP-D6/FP-D7: the original reason for using
the originating turn was to keep distinct-turn counting honest, and that reason
no longer applies.

## 4. Magic Eden Launch and NFT Standard Gate

### 4.1 Launchpad requirements

Magic Eden's primary mint workflow must be demonstrated to support the final
NFT standard, one canonical collection, a hard 5,000 maximum supply, five
sequential price lots or an approved equivalent sale plan, the selected
payment asset, auditable mint results, final metadata, and the approved
treasury destination. The operator must document platform fees, user network
costs, control of update/mint authority, buyer limits, and any application or
approval process before configuring the sale.

Metaplex Core is the current **provisional** standard because the prior
Founder Pass plan assumed it. It is not a confirmed Magic Eden primary-mint
standard until the Launchpad workflow is verified. The implementation must
freeze one approved asset-verification format and canonical collection before
enabling benefits. Changing to NFT-PRO, legacy Metaplex, or another standard
requires an explicit account-verification design and re-review. There is no
automatic standard fallback and no acceptance of arbitrary metadata URIs.

### 4.2 Magic Eden capability gate

Magic Eden's Creator Hub documents secondary listing of Core and legacy
Solana collections. This does not prove Launchpad mint support for either
standard or for this sale design. Obtain direct Magic Eden confirmation of
Launchpad eligibility and the actual mint workflow. Verify the supported
asset standard, one canonical collection, the enforceable 5,000 cap, five
sequential USD-priced lots or an explicitly approved equivalent, accepted
payment currency and conversion policy, fees, custody, authority controls,
and auditable minted asset IDs. Rehearse the exact configuration before sale.

If the Magic Eden workflow cannot meet a requirement, record the mismatch
and obtain an explicit revised sale design before proceeding. A failed
Launchpad gate blocks the sale, while platform-neutral usage accounting can
still be implemented.

### 4.3 Canonical collection registration

Governance records the selected standard, asset programme ID, collection
address, collection/update authority, maximum mint count, and activation
slot in a `FounderPassConfig`. The address is read from finalized on-chain
collection creation, not copied from a web page without verification.
The collection cannot be silently replaced after activation. A replacement
requires a governed migration that preserves every asset's used allowances.
Collection membership alone does not prove that only 5,000 assets exist.
The selected mint mechanism must enforce a hard 5,000 cap that Tyche can
verify, or activation must use a governed, immutable allowlist commitment
of no more than 5,000 finalized minted asset IDs with on-chain inclusion
proofs. A mutable marketplace list or API hashlist is insufficient.

## 5. Player Flows

### 5.1 Pass discovery

The player connects a Solana wallet. Tyche lists candidate passes owned by
that wallet and displays remaining turns, votes, proposals, and bets. The
player selects a pass when several are held. UI discovery may use an indexer,
but every signed action supplies an asset verified by the programme.

### 5.2 Vote, proposal, and bet

The action screen shows the standard fee, the pass-adjusted Tyche fee,
remaining pass allowance, and whether the current turn is already marked.
The player signs one transaction. The game performs its normal eligibility,
phase, sequence, and content checks; verifies pass ownership; waives the
Tyche action fee; performs the ordinary action; and updates the pass usage
atomically. A failed transaction leaves all counters unchanged.

Approval and elimination votes each count as one vote action. Their
standard tally, side, rule, and sequence semantics do not change. The pass
does not grant a Game Token or bypass a requirement to play before voting
or proposing a rule. A free bet can create the ordinary Game Token through
the existing first-guess flow.

### 5.3 JDR reward claim

At the earning action, record a verifiable reward entitlement with the
beneficiary and originating turn. If earning-time pass ownership is required
to avoid retroactive boosting, record the selected eligible pass at that
time without consuming a turn; the user decides whether to use the boost
at claim. This ownership policy must be finalized before implementation.

At claim, display the ordinary JDR amount and a current **estimate** of the
additional JDR available. The player may request a standard claim or offer
one owned pass for the boost. The on-chain programme computes the final
bonus from the free campaign balance, pays the immutable beneficiary, marks
the entitlement claimed, and records a pass turn only if a positive bonus
was paid. A balance change before settlement may lower the bonus; the
finalized receipt controls the UI result.

## 6. On-Chain Account and Instruction Design

### 6.1 Configuration

`FounderPassConfig` is governed and stores at least: version, enabled/paused
state, selected asset standard and programme ID, canonical collection,
campaign ID, maximum supply, supply-enforcement mode and commitment if
required, allowance constants, activation boundary,
and policy parameters approved in §14. A pause of new benefits does not
rewrite historical usage or a settled claim.

### 6.2 Per-asset usage

`FounderPassUsage` is seeded by the individual NFT asset address and stores
its canonical collection, lifetime vote/proposal/bet counters, a sorted or
version, and
bump. A counter alone cannot prove whether a previously used turn is being
reused. The exact bounded layout and rent payer must be fixed before build.

The authenticated player signs each benefit action. The selected NFT must
be owned by the signing wallet at use, belong to the one configured
collection, and be parsed and verified according to its actual asset
programme. The programme checks account owner, discriminators, asset
identity, collection binding, current owner, and any relevant delegated or
frozen state. It cannot trust token name, symbol, image, URI, an arbitrary
token account, or an indexer result.

### 6.3 Game instruction changes

Add explicit pass-aware variants or versioned account/argument paths for
`submit_guess`, `submit_additional_guess`, `propose_rule`,
`vote_rule`, and `eliminate_vote_rule`. The normal paths continue to work.
Pass-aware paths perform all existing checks and update the standard action
sequence, game account, vote tally, and usage PDA in one transaction. The
recorded action fee must be zero when waived; any sponsored prize-pool
contribution is recorded separately. Do not reinterpret existing account
bytes or silently change old instruction semantics.

### 6.4 Cross-program claim integration

The Tokenomics Core claim path must verify pass eligibility and update pass
round usage atomically with the JDR transfer, using a reviewed CPI or
equivalent authenticated instruction design. A backend toggle, separate
off-chain write, or unverified two-transaction sequence is insufficient.
The settlement receipt binds campaign, action ID, beneficiary, origin turn,
base paid, bonus paid, total paid, and pass asset when used.

## 7. JDR Claim and Campaign Accounting

The bonus uses the existing finite 200M JDR Initial Campaign Reserve Vault.
There is no Founder Pass-only vault or per-pass JDR allocation. The requested
total is up to 100 times the ordinary eligible reward; a short campaign
balance produces a partial bonus and creates no unpaid debt. Earlier boosted
claims can reduce later optional promotional payouts. Sale copy must state
“up to 100x, subject to the remaining campaign balance.”

The claim-liability design in
[Tokenomics PRD §5.1.2](PRD-TOKENOMICS-v2.8.md#512-founder-pass-planning-amendment-2026-09-20-not-activated)
is mandatory: reserve already earned ordinary JDR before allowing a later
bonus to spend free JDR, bind each reward entitlement to its on-chain action
and originating turn, and maintain the campaign-vault invariants.
The existing `settle_action_reward` path pays at settlement and its v2
economic hash has no Founder Pass formula. A new version and legacy-claim
migration/reconciliation are required before activation. A dedicated JDR
allocation is not required.

Only approved reward kinds are boostable. SOL prizes, treasury-fee claims,
lock positions, and unrelated JDR transfers are never boostable. The
beneficiary, receipt, pass asset, and turn cannot be substituted at claim.

## 8. Fee Waivers and Game Economics

The pass waives the **entire otherwise-due Tyche action fee** for an eligible
vote, proposal, or submitted guess, including a repeated-action escalated
fee. The action still advances its ordinary per-wallet/per-rule/per-side
sequence so that a later paid action quotes the correct next fee. Network
rent and transaction fees remain payable.

The existing fee schedule directs collected SOL into treasury and prize
accounting. A waived fee cannot be booked as collected SOL. Before launch,
choose and implement one disclosed policy: an approved sponsor pays the
otherwise-due amount into the ordinary accounting path, or the turn's
treasury/prize pool receives less. Both paths require bounded economic
analysis for 5,000 passes, 5 million fee-free votes, 500,000 fee-free
proposals, and 250,000 fee-free bets as absolute allowance ceilings; the
100-turn limit may reduce realized use. A sponsor cannot be charged an
unbounded exponential fee without an explicit funded limit and rule.

Ordinary first-action-free windows remain in force. When the ordinary
action fee is zero, Tyche does not spend a pass credit merely to reproduce
the same zero fee.

## 9. API, Indexer, and UI

- Index asset creation, transfers, and burns; pass-use events; reward
  entitlements; JDR claim results; campaign balance; and governance changes
  with finalized/reorganization-safe processing and idempotent replay.
- Expose wallet-owned pass IDs and each pass's remaining turns, votes,
  proposals, and bets. Show a stale-data state when ownership or usage is
  unconfirmed. An API response is never an authorization decision.
- Use English UTF-8 copy. Explain “one used turn even when several benefits
  are used,” “up to 100x JDR while campaign funds remain,” fee-free Tyche
  actions, and separate network costs. Show the actual fee or latest quoted
  bonus before wallet approval and the finalized result afterward.
- Provide explicit no-pass, exhausted-pass, campaign-empty, asset-transfer,
  wrong-network, rejected-signature, and claim-race states. Do not present
  a bonus estimate as guaranteed JDR.
- Sale metadata and the mint page must link to current terms and display
  the same benefit limits, exhaustion rule, transfer rule, and platform
  costs. No implementation detail belongs in the ordinary player flow
  unless it changes a user's choice.

## 10. Security and Abuse Controls

- Reject forged assets, spoofed collections, wrong programme owners,
  arbitrary metadata URIs, wrong current owner, and stale delegated or
  burned assets. Verify from on-chain accounts under the selected standard.
- Make all counters, round membership, fee waivers, and claim payments
  atomic. Enforce quota bounds and checked arithmetic on-chain. A transfer
  never resets usage.
- Prevent replay of game actions, JDR entitlements, and settlement receipts.
  A receipt cannot be boosted twice or by two passes. Never allow a pass
  to redirect a reward earned by another beneficiary.
- Publish and enforce a concentration policy before 1,000 fee-free vote
  actions can affect finalist or elimination outcomes. Fee waivers do not
  bypass the Game Token gate or existing abuse limits.
- Control collection and programme authorities through the project's
  governance and custody process. Any emergency pause has an auditable
  event and preserves prior valid claims and usage.
- Legal and consumer review must approve geographic eligibility, sale
  terms, refund treatment, NFT utility disclosures, and the game's
  applicable jurisdictional requirements before publication.

## 11. Testing and Acceptance Criteria

| Area | Required acceptance evidence |
| --- | --- |
| Ownership | Genuine current owner and collection pass; forged, wrong-programme, wrong-collection, burned, and post-transfer stale-owner passes fail. |
| Quotas | 1,000th vote, 100th proposal, and 50th bet succeed when otherwise eligible; the next pass-funded action fails or uses the standard paid path explicitly. |
| Turns | Every pass is judged against the same governed window; no pass action moves it; both boundaries are usable; the turn after the last fails even with quota remaining; a turn before activation fails; the activation turn is write-once across a disable/re-enable cycle; a late JDR claim is judged on its origin turn. |
| Voting | Each waived approval or elimination vote adds exactly one ordinary vote; sequences and Game Token checks remain valid; concentration policy is enforced. |
| Fees | Entire Tyche fee is waived when applicable; normal free actions do not consume pass credit; later paid fees continue the correct sequence; SOL ledgers reconcile under the chosen sponsor/pool policy. |
| JDR | Standard pending claims remain payable after boosted claims; bonus is at most 99 times base and no more than free JDR; zero or partial bonus is explicit; beneficiary and receipt replay checks hold. |
| Transfers | Usage follows the NFT; a new owner cannot reset quota or claim another wallet's reward; the chosen earning/claim ownership rule holds. |
| Concurrency | Two transactions racing for the last quota or JDR atoms cannot overuse the pass or vault; account invariants hold after either ordering. |
| Migration | Previously earned, unclaimed ordinary rewards are reconciled before boosts activate; old receipts cannot replay; v2 account bytes are not reinterpreted. |
| Supply | More than 5,000 assets cannot gain utility; the platform cap or committed asset allowlist is verified independently of marketplace metadata. |
| Sale | Magic Eden's primary mint dry run proves five sequential lots or the approved equivalent, approved currency, exact prices, supply cap, buyer fee disclosure, and the unsold-unit rule. |
| End-to-end | Devnet rehearsal covers first bet, vote, proposal, transfer, late JDR claim, partial campaign balance, indexer projection, mobile wallet signing, and finalized readback. |

Programme unit/integration tests, serial SBF tests, API/SDK tests, and
mobile browser verification must cover the applicable rows. A document
review alone does not satisfy implementation acceptance.

## 12. Implementation Milestones

All boxes are planning items and remain unchecked until the owner confirms
their corresponding milestone, as required by `AGENTS.md`.

- [ ] **FP0 — Decision and economics freeze:** verify Magic Eden Launchpad;
  finalize the NFT standard, collection authority, sale currency, lot
  quantities, transfer eligibility,
  concentration policy, and fee-waiver accounting; approve the economic
  configuration and migration design.
- [ ] **FP1 — Contract model:** implement canonical asset verification,
  governed config, per-asset usage, used-turn membership, and compatible
  account/instruction versions.
- [ ] **FP2 — Game benefits:** implement fee-free votes, proposals, and bets
  while preserving ordinary game checks, tally, sequences, and SOL accounting.
- [ ] **FP3 — JDR benefits:** implement reward entitlement reservation,
  shared-vault liability accounting, pass-aware manual claim, replay
  protection, legacy-claim reconciliation, and finalized receipts.
- [ ] **FP4 — Product integration:** add indexer/API projections and mobile
  pass selection, quota display, fee/bonus preview, and explicit error states.
- [ ] **FP5 — Verification and release:** complete negative-path and
  concurrency tests, devnet rehearsal, independent review, governed
  deployment, and sale launch gates.

## 13. Release Gates

Benefits remain disabled until the collection standard and address are
governed, all relevant programme and Tokenomics Core upgrades are reviewed,
the v2 campaign/economic-version migration is resolved, legacy JDR claims
are protected, and the complete devnet acceptance suite passes. A
programme deployment by itself does not activate benefits or authorize a
mint.

Magic Eden's primary mint workflow must demonstrate final lot setup and
maximum supply, published costs, canonical collection, payment and treasury destination,
metadata/terms, authority controls, and a dry run before any public sale.
Mainnet activation and real payments also require the project's existing
M9/M10 readiness gates and an explicit owner go/no-go.

## 14. Decision Register

| ID | Decision | Current state | Required before |
| --- | --- | --- | --- |
| FP-D1 | Primary mint and launch venue | Magic Eden selected by owner on 2026-09-20; Launchpad onboarding and capabilities unverified | Mint integration and sale |
| FP-D2 | NFT standard, canonical on-chain verifier, and hard-cap proof or asset allowlist | Metaplex Core provisional; Magic Eden primary-mint standard unverified | Contract implementation freeze |
| FP-D3 | Exactly 1,000 units per lot and handling of unsold units | Proposed | Sale configuration |
| FP-D4 | SOL conversion versus a stable SPL token for USD prices | Open | Published pricing |
| FP-D5 | Treasury wallet, collection/update authority, buyer limits, dates, and reserve supply | Open | Mint deployment |
| FP-D6 | Whether earning-time ownership must be snapshotted and how transfer before claim affects the boost | Open; retroactive acquisition must not create a boost | JDR contract design |
| FP-D7 | Which JDR reward kinds qualify for the 100x claim | Open | JDR economic version |
| FP-D8 | Fee waiver's missing SOL contribution: funded sponsor or smaller turn pool | Open | Game contract design |
| FP-D9 | Per-rule/per-turn vote concentration limit and multiple-pass wallet policy | Open | Vote activation |
| FP-D10 | Legal eligibility, final terms, refund policy, and public claim wording | Open | Sale publication |

Unresolved decisions block their dependent work; they do not silently
select a default or change the confirmed benefit quantities.

## 15. Magic Eden Evidence

Magic Eden capabilities are time-sensitive and must be checked during FP0
against the live primary-mint workflow:

- [Magic Eden Creator Hub guide](https://help.magiceden.io/en/articles/6006558-how-to-list-your-nft-collection-on-magic-eden-using-creator-hub) —
  documents Solana collection **listing** for Core and legacy assets;
  it does not establish primary Launchpad sale-phase capabilities.
- [Magic Eden content policy](https://help.magiceden.io/en/articles/5968627-what-content-is-allowed-on-magic-eden-rules-moderation-policy) —
  distinguishes Launchpad review from secondary marketplace listing. It
  does not confirm this project's approval or technical sale settings.
