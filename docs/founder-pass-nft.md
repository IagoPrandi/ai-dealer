# Tyche Founder Pass NFT

## Purpose and launch boundary

The **Tyche Founder Pass** is a limited, transferable NFT sold to fund product
development. It is a game-access pass, not an investment product. It does not
confer ownership, a claim on treasury fees, revenue sharing, dividends, yield,
or a guaranteed financial return.

No mint, sale, transfer, or mainnet deployment is authorized by this document.
Before a sale can be enabled, governance must approve the collection supply,
price and currency, sale dates, treasury destination, geographic eligibility,
terms, refund policy, and a reviewed smart-contract release.

## Asset standard

- Standard: one unique **Metaplex Core Asset** per pass in a single verified
  `Tyche Founder Pass` collection.
- Transferability: transferable. Benefits follow the current on-chain owner.
- Ownership proof: every privileged instruction receives the Core asset and
  verifies all of the following on-chain: the canonical Metaplex Core program
  owns the asset, the signing wallet is its current owner, and its collection
  equals the configured Founder Pass collection.
- One-pass rule: a wallet may use at most one Founder Pass per action. Holding
  several passes never stacks a multiplier or voting power.
- Revocation: a governed pause can disable new benefits only for fraud,
  security, or legal-compliance reasons. It must not silently alter historical
  usage or a completed JDR grant.

The game program must never trust a frontend, API projection, cached indexer
result, arbitrary token account, metadata URI, or asset name as proof of
ownership.

## Benefits

| Benefit                     | Exact behaviour                                                                                                                  | Boundaries                                                                                                                                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 100x JDR promotional boost  | Multiplies only qualifying, campaign-vault-funded JDR rewards for verified gameplay or referral actions.                         | It never multiplies SOL prizes, prize-pool claims, treasury-fee distributions, staking/lock weight, or any financial return. The campaign must reserve the maximum boosted allocation before minting the pass.           |
| 1,000 vote credits per turn | A holder has up to 1,000 on-chain vote credits during each turn, distributed among approval or elimination votes.                | Credits are voting weight, not 1,000 fee-escalating transactions. Credits expire at turn close, cannot be transferred separately, and cannot stack across passes. Each credit allocation must be recorded and auditable. |
| 100 free rule proposals     | The pass pays the normal on-chain account rent but waives the protocol rule-proposal fee for its first 100 successful proposals. | The 100-proposal counter is lifetime-per-pass, follows the NFT on transfer, and only increments after a valid preflight and successful transaction. The standard proposal fee applies from proposal 101 onward.          |

### JDR reward safeguards

`100x` means `base promotional reward × 100`, subject to all of these hard
limits:

1. the applicable JDR campaign has a configured, pre-funded Founder Pass
   allocation and is still funded;
2. no recipient can receive more than the campaign's configured per-pass cap;
3. the pass asset, qualifying action, and settlement receipt can each be used
   only once for the same reward; and
4. the settlement is deterministic, recorded on-chain, and fails closed if the
   allocation, asset proof, or action proof is missing.

The campaign configuration must publish its base reward, 100x cap, total
Founder Pass allocation, start/end dates, and exhaustion state. The UI must
describe this as a promotional JDR reward, never as an earning guarantee.

### Vote-credit safeguards

The existing one-vote-per-account record is not sufficient for 1,000 credits.
The upgraded voting record must store `credits_used` and the vote tally must add
that exact number atomically. A holder chooses a number from `1` to its
remaining credits in one transaction. This avoids exponential repeat-action
fees and makes the stated benefit technically usable.

To protect rule governance, activation requires a public governance decision on
the concentration policy. The default launch policy is a 1,000-credit maximum
per pass **and** a 250-credit maximum per rule in a turn; any excess allocation
is rejected. This cap may only change through the same governed configuration
used for economic parameters.

### Free-proposal accounting

The program stores a `FounderPassUsage` PDA, seeded by the individual Core
asset address. It contains `free_rule_proposals_used`, the current turn's
`vote_credits_used`, and replay-protection identifiers. Because the PDA is
keyed by the asset rather than the wallet, transferring a pass cannot reset its
100-free-proposal allowance.

Rule-account rent is deliberately not waived: it is a network cost, not a
protocol fee, and hiding it would make the product copy inaccurate.

## Required on-chain components

1. `FounderPassConfig` PDA: governed collection address, enabled flag, JDR
   campaign limits, and vote-credit policy.
2. `FounderPassUsage` PDA per Core asset: lifetime free-proposal counter,
   current-turn vote credits, and idempotency state.
3. Privileged proposal and vote instructions: validate the Core asset before
   changing fees, proposal usage, or a vote tally.
4. Tokenomics-Core promotional-reward instruction: validates the same asset
   and a unique settlement receipt before paying the capped JDR boost from its
   dedicated campaign allocation.
5. Events and API projections for configuration changes, proposal-fee waivers,
   vote-credit usage, and reward settlements.

No live migration may reinterpret existing `RuleVote`, `RuleProposal`,
`GameToken`, campaign, or claim bytes. A contract upgrade needs an explicit
backward-compatible account design, tests, an SBF artifact, and governed
devnet review before any release.

## Sale disclosure requirements

The sale page and NFT metadata must show, in English UTF-8:

- `Founder Pass — game utility NFT`;
- the three benefit limits and the fact that they do not stack;
- the exact JDR promotional allocation and exhaustion behaviour;
- the fact that SOL prize payouts and treasury distributions are unchanged;
- transferability and the fact that remaining free-proposal allowance follows
  the pass; and
- a link to the final terms, risks, and eligibility restrictions.

The page must not use phrases such as “investment”, “profit”, “yield”,
“guaranteed return”, or “100x returns”.

## Pre-launch acceptance criteria

- A non-holder cannot invoke a privileged action with a forged account,
  wrong Core owner, wrong collection, stale asset, or arbitrary metadata URI.
- A holder cannot stack two passes, exceed 1,000 credits in a turn, reuse
  credits after turn close, or exceed the 250-credit per-rule cap.
- A pass cannot waive more than 100 successful rule-proposal fees across wallet
  transfers.
- A JDR boost is rejected after campaign exhaustion, over its per-pass cap, or
  on receipt replay; successful settlement reconciles exactly to campaign
  accounting.
- Standard players retain the existing fee, voting, and JDR-reward behaviour.
- Unit, integration, and serial SBF tests cover each negative path above;
  devnet testing is completed before a separate, explicitly authorized sale.

## Decisions required before implementation or sale

1. Total supply and whether all passes have identical benefits.
2. Sale price, accepted asset (SOL, USDC, or both), and exact treasury address.
3. Founder Pass promotional JDR allocation and per-pass reward cap.
4. Sale dates, sale mechanism, geographic eligibility, and final legal terms.
5. Whether the default 250-credit per-rule voting-concentration cap is
   acceptable.
