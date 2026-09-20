# Tyche Founder Pass NFT

## Status and launch boundary

This is the planning specification for the Founder Pass request of 2026-09-20.
It supersedes the earlier three-benefit proposal. Open economic and gameplay
decisions below must be resolved before the sale terms are final.
The implementation requirements and platform decision gate are in
[`PRD-FOUNDER-PASS-NFT.md`](../PRD-FOUNDER-PASS-NFT.md).

The Founder Pass is a transferable game-utility NFT. It gives no ownership in
Tyche, claim on SOL prize pools or treasury fees, revenue share, dividend,
yield, or guaranteed financial return. This document does not authorize a
mint, sale, transaction, or mainnet deployment. The existing mainnet release
gates and an approved sale configuration still apply.

## Collection and sale

- At most 5,000 passes in one verified Solana collection. Metaplex Core is
  provisional until Magic Eden's primary mint standard is verified. Every pass
  carries identical benefit **quotas** regardless of purchase phase. Realized
  value is not identical, because all passes share one fixed active-round
  window (below): a pass delivered later in that window inherits fewer usable
  rounds. Sale copy must state this.
- Five consecutive sale phases, provisionally capped at 1,000 mints each:

  | Phase | Maximum mints | Price per pass | Maximum gross proceeds |
  | --- | ---: | ---: | ---: |
  | 1 | 1,000 | USD 10 | USD 10,000 |
  | 2 | 1,000 | USD 20 | USD 20,000 |
  | 3 | 1,000 | USD 40 | USD 40,000 |
  | 4 | 1,000 | USD 60 | USD 60,000 |
  | 5 | 1,000 | USD 80 | USD 80,000 |
  | **Total** | **5,000** | | **USD 210,000** |

  Gross proceeds assume all phases sell out and exclude platform, network,
  artwork, operations, tax, and benefit-funding costs. Decide whether unsold
  inventory expires after each phase or carries forward at the next price;
  either policy must keep total issuance at or below 5,000.
- Magic Eden is the selected venue for minting and launching the primary
  sale. Its Launchpad onboarding, asset standard, sale phases, payment
  currency, authority controls, and costs must pass the gates in the
  implementation PRD. A Magic Eden marketplace listing alone does not
  confirm primary mint support.
  USDC would hold the quoted USD prices more directly; a SOL-priced sale
  needs a published conversion and repricing policy. No payment asset has
  been selected.
- Magic Eden will handle minting and primary checkout. Tyche handles
  benefit authorization and accounting. NFT metadata and platform dashboard
  data are not authoritative for remaining benefits.

## Benefits and the shared active-round window

Owner decisions of 2026-09-20, in two steps: the earlier 100-distinct-round
rule became a window of 800 consecutive rounds, and that window then became
**global** rather than per-pass.

There is one window for the whole collection: 800 consecutive rounds anchored
at the round governance activates benefits. Inside it a pass may use benefits in
every round, limited only by its independent vote, proposal, and game quotas.
Outside it a pass grants nothing, even if an action quota remains. No player
action opens, extends, renews, or resets the window, and a transfer does not
affect it. Standard game actions remain available under normal rules and fees.

Two consequences must be disclosed in sale copy:

1. **The clock cannot be deferred.** A holder chooses whether to spend a
   benefit, never when the window runs. Declining a benefit preserves quota but
   buys no extra time.
2. **Passes do not all get 800 usable rounds.** A pass delivered later in the
   window inherits only the remainder. At the production 24-hour round the whole
   window is roughly 800 days, a little over two years.

| Benefit | Requested maximum per pass | Proposed accounting unit |
| --- | --- | --- |
| JDR reward boost | Up to 100x the eligible JDR reward, limited by spendable campaign JDR | Each eligible manually claimed JDR reward receipt; total requested amount equals base × 100. The actual amount can be lower when the shared campaign balance is insufficient. |
| Fee-free votes | 1,000 | Successful vote actions across the pass lifetime, each with ordinary weight. No extra vote weight or voting-credit system. Existing Game Token and vote eligibility checks still apply. |
| Fee-free rule creation | 100 | Successful `propose_rule` actions across the pass lifetime with the Tyche proposal fee waived. Ordinary paid proposals remain available afterward. |
| Free games | 50 | Successful `submit_guess` entries across the pass lifetime with the Tyche guess fee waived. Each submitted bet uses one credit; ordinary paid bets remain available afterward. |

The vote, proposal, and free-game counters are independent lifetime limits
per asset. Remaining limits follow the pass on transfer. Holding multiple
passes does not stack a multiplier or allow more than one pass to authorize
the same action. Network transaction fees and required account rent remain
payable; “free” refers to the specified Tyche protocol/game fee.

### What the window covers

- A vote, proposal, or free game consumes its quota only when the qualifying
  on-chain action succeeds. A rejected or reverted action consumes nothing.
- A JDR boost is judged on the reward's **originating** game round, not the
  claim date or current round, and only when the manual claim succeeds and pays
  an amount above the ordinary claim. A reward whose originating round falls
  outside the window is not boostable, which includes every reward earned
  before activation.
- Several reward claims are each checked against the same window; a replayed
  receipt cannot claim another boost.
- An action that is already free under ordinary game rules does not consume a
  pass credit unless another pass benefit actually applies.

### Choosing whether to use a benefit

Owner decision of 2026-09-20. Because the window runs regardless, the only
choice a holder makes is whether to spend a benefit on a given action.

- On entering the app, Tyche identifies whether the connected wallet holds a
  pass and shows its remaining quotas and the rounds left in the window.
- On the holder's first action of a round, the app asks whether to apply the
  pass to that action.
- From that panel, and from their account settings, the holder may choose to
  apply the pass automatically to every eligible action from then on, so the
  question is not repeated.

This preference decides only whether the app asks; it is not an authorization.
Every transaction still states explicitly whether it takes the pass-funded path,
and the programme re-verifies ownership and quota on-chain either way. The
preference is therefore stored off-chain with the player's profile, not in the
pass account: keeping it on-chain would cost rent and a signed transaction per
change without adding any security. A pass whose window has closed must be shown
as expired rather than as having quota, and the panel must never present a JDR
bonus estimate as guaranteed.

### JDR payout from the shared campaign and ownership

No Founder Pass-only JDR reserve or separate per-pass JDR cap is requested.
The intended source is the existing, finite 200M JDR Initial Campaign Reserve
Vault, shared with ordinary promotional rewards. For a qualifying manual claim,
calculate in integer token atoms after preserving any JDR already committed
to earlier ordinary reward claims:

```text
ordinary_payout = ordinary amount payable for this reward receipt
extra_available = campaign atoms left after the ordinary payout and other committed claims
bonus = min(checked_multiply(base_reward, 99), extra_available)
actual_total = ordinary_payout + bonus
```

For example, a 1 JDR base claim pays 100 JDR if at least 99 additional JDR
is available after the ordinary payout and earlier commitments. If only 36
additional JDR is available, it pays 37 JDR total and explicitly records the
partial boost. When no earlier commitments exist, this is equivalent to
`min(base_reward × 100, remaining_campaign_atoms)`. No debt for the unpaid
difference is created. A claim with no extra JDR paid is an ordinary claim and
does not open the pass window. Every payout atomically reduces the shared campaign balance, so
earlier boosted claims may leave less JDR for later holders and ordinary
players. Sale copy must say **up to 100x, subject to the remaining campaign
balance**, never promise that every holder will receive 100x.

`Extra available` must exclude previously committed but unclaimed ordinary
reward liabilities. The exact entitlement account, reserve and claim
transitions, migration rule, accounting invariants, and acceptance tests are
specified in [Tokenomics PRD §5.1.2](../PRD-TOKENOMICS-v2.8.md#512-founder-pass-planning-amendment-2026-09-20-not-activated).
Reusing the existing campaign for a new formula requires an economic
configuration version, contract upgrade, and governed activation; the
current frozen v2 campaign formula does not authorize 100x claims.

The boost never multiplies SOL prize claims, treasury distributions, lock
weight, or other financial returns. When the campaign is empty, the UI must
report exhaustion explicitly and must not draw from another vault.

At use, the programme must verify the signing wallet currently owns an
authentic asset of the selected standard in the configured collection. A late JDR claim must also
prove the claimant earned the reward in its originating round. Define how a
pass transfer between earning and claiming affects eligibility. Buying a
pass must not retroactively boost unrelated rewards earned before acquisition.

### Fee sequencing and game economics

Vote, proposal, and guess actions currently have per-scope escalating fees.
Pass use must not reset sequence counters or bypass gameplay, preflight,
phase, and Game Token requirements. The requested fee-free votes, proposals,
and bets must waive the full otherwise-due Tyche action fee; account rent
and Solana transaction fees still apply. A fee-free guess changes prize-pool
funding: publish whether a dedicated subsidy pays the normal pool
contribution or the pool receives less. Define a voting concentration limit
before enabling 1,000 fee-free votes.

## Tyche implementation

1. Create a governed `FounderPassConfig` with the selected standard and
   accepted collection address, supply cap, benefit settings, shared
   campaign ID, activation state, and any concentration limits.
2. Create an on-chain usage account keyed by each NFT asset address, not by
   wallet, holding only the lifetime vote, proposal, and game counters. The
   active-round window is global and lives on the governed config, so the
   per-pass account carries no round state and eligibility is a comparison
   against bounds no player can influence.
3. Extend vote, proposal, guess, and manual JDR-claim instructions to validate
   asset ownership and collection and update usage atomically with each
   successful benefit. Use unique reward receipts and reconcile every
   boosted JDR transfer to the shared campaign vault.
4. Project events into API and UI balances: the window's start round, end
   round, and rounds remaining; action quotas used/remaining; claim
   eligibility; and exact fee or boost before wallet confirmation. Add the
   pass-detection panel, the per-action prompt, and the off-chain auto-apply
   preference described above. A pass whose window has closed must be shown as
   expired rather than as having quota. On-chain state remains authoritative after transfers,
   indexer delay, or reorganization.
5. Test forged assets, wrong owner/collection, transfers, two-pass stacking,
   concurrent quota-boundary use, repeated and out-of-order claims, both window
   boundaries, the round after the window closes, a claim whose originating
   round precedes activation, an auto-apply preference that must never widen
   what the programme authorizes, campaign exhaustion, fee sequencing, and
   ordinary-player behavior. Rehearse the complete flow on devnet, review the contracts, and
   pass the project's mainnet gates before sale.

Existing `RuleVote`, `RuleProposal`, `GameToken`, campaign, and claim
accounts must not be silently reinterpreted during an upgrade. Review the
account layout, programme bytes, and migration before governed release.

## Decisions to close before publication

1. Set per-rule/per-round voting concentration limits and interaction with
   the existing first-action-free period.
2. Specify which JDR reward types can be boosted, protect already committed
   ordinary claims, and settle the claim-after-transfer eligibility rule.
3. Set sponsor or prize-pool accounting for waived vote, proposal, and guess
   fees, especially the escalating fees and 50 free bets.
4. Approve USDC versus SOL, treasury/mint-funds wallet, reserved supply,
   sale dates, unsold-inventory rule, buyer limits, legal eligibility, terms,
   refund policy, Magic Eden Launchpad configuration, NFT standard, and final
   sale copy.

The sale page and NFT metadata must use English UTF-8, state exact limits
and transfer behavior, and link to final terms. They must not call the JDR
boost a guaranteed return or imply entitlement to SOL winnings.
